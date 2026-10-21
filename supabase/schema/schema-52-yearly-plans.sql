-- ============================================================
-- 52. YEARLY PLANS — a plan is bought for a year, renewed by buying again
-- ------------------------------------------------------------
-- Owner, 21 Oct 2026. Reverses section 18 ("a plan, for good"):
--
--   * A paid plan lasts 365 days. Buying the SAME plan again before it
--     ends adds 365 days to what is left (a renewal stacks). Nothing is
--     charged automatically: there is no mandate and no subscription.
--   * Moving UP starts the higher plan's year today; the unused part of
--     the current year is credit (its value × days left / its length).
--   * Moving DOWN waits for the current year to end (then any plan can be
--     bought, with no credit).
--   * A refund takes back the refunded payment's OWN year, so refunding a
--     renewal leaves the year before it in place.
--   * Grants are unchanged: admin_grant_plan with p_days <= 0 is still a
--     grant for good (the console passes 0), and timed e-mail grants keep
--     their own end date.
--   * The prices are the same rows (₹599 / ₹799 / ₹999), now per year;
--     the scheduled rise (section 30) applies to the yearly price.
--
-- THE BACKFILL (owner's decision): every account holding a paid plan for
-- good on the strength of a real payment gets one year from the moment
-- this section runs. Once only — billing_settings.yearly_switch_at records
-- the instant, and a re-run changes nothing.
--
-- The machinery already existed: account_plan() reads plan_until (null =
-- no end, past = 'free'), billing_status() returns plan_until and lapsed,
-- and section 16's apply_plan stacked a renewal. Section 18 switched it
-- off; this section switches it back on, for one period: a year.
--
-- Run AFTER §51 (it restates §51's quote_for / create_pending_payment /
-- activate_payment / paid_credit_paise, §50's mark_payment_refunded and
-- §46's admin_grant_plan). Then redeploy rzp-order, rzp-verify,
-- rzp-webhook and rzp-refund. The deployed rzp-order still sends period
-- 'lifetime' until it is redeployed; create_pending_payment accepts that
-- as 'year', so checkout keeps working in between.
-- ============================================================

-- 52.0 The switch instant ---------------------------------------------------
alter table public.billing_settings add column if not exists yearly_switch_at timestamptz;

-- 52.1 apply_plan -------------------------------------------------------------
/** Put a plan on an account. p_days > 0: for that many days, stacked onto
 *  the time left when it is the plan the account already has. p_days <= 0:
 *  for good (a grant). Returns the new plan_until (null = for good). */
create or replace function public.apply_plan(p_account uuid, p_plan text, p_period text, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  a      public.accounts;
  lim    jsonb;
  start  timestamptz := now();
  until  timestamptz;
begin
  select * into a from public.accounts x where x.id = p_account for update;
  if a.id is null then raise exception 'No such account' using errcode = '22023'; end if;
  select limits into lim from public.plans p where p.id = p_plan;
  if lim is null then raise exception 'No such plan' using errcode = '22023'; end if;
  perform set_config('fms.billing', 'on', true);
  if coalesce(p_days, 0) <= 0 then
    update public.accounts x
       set plan = p_plan, plan_until = null,
           plan_period = case when p_period = 'grant' then 'grant' else 'lifetime' end,
           seat_limit = greatest(1, coalesce(public.plan_cap(lim, 'seats'), 1000)),
           updated_at = now()
     where x.id = p_account;
    return null;
  end if;
  if a.plan = p_plan and a.plan_until is not null and a.plan_until > now() then
    start := a.plan_until;                       -- a renewal stacks
  end if;
  until := start + make_interval(days => p_days);
  update public.accounts x
     set plan = p_plan, plan_until = until,
         plan_period = case when p_period = 'grant' then 'grant' else 'year' end,
         seat_limit = greatest(1, coalesce(public.plan_cap(lim, 'seats'), 1000)),
         updated_at = now()
   where x.id = p_account;
  return until;
end;
$fn$;
revoke execute on function public.apply_plan(uuid, text, text, int) from public, anon, authenticated;

-- 52.2 paid_credit_paise: the UNUSED part of the year now running -------------
/** What moving up is worth: for each paid year of the plan the buyer's
 *  organisation is on now, its value (what was paid plus the credit it was
 *  priced with) times the share of it not yet used. An ended year is worth
 *  nothing; a grant (no end date) is not credit. */
create or replace function public.paid_credit_paise(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(floor(sum(
           (p.amount_paise + coalesce(p.credit_paise, 0))::numeric
           * greatest(0, least(1,
               extract(epoch from (p.ends_at - greatest(now(), p.starts_at)))
               / nullif(extract(epoch from (p.ends_at - p.starts_at)), 0)))
         )), 0)::int
    from public.payments p
    join public.accounts a on a.id = p.account_id and a.owner_id = p_user
   where p.user_id = p_user and p.status = 'paid' and p.period = 'year'
     and p.plan_applied is not false
     and p.plan_id = a.plan
     and p.starts_at is not null and p.ends_at is not null and p.ends_at > now();
$$;
revoke execute on function public.paid_credit_paise(uuid) from public, anon, authenticated;

-- 52.3 quote_for: a renewal, an upgrade with the year's unused part --------
create or replace function public.quote_for(p_user uuid, p_plan text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl     public.plans;
  pc     public.promo_codes;
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  cur    text := 'free';
  credit int  := 0;
  price  int;
  due    int;
  amt    int;
  reason text;
  base   jsonb;
  held   int  := 0;
  renew  boolean := false;
  cur_until timestamptz;
begin
  select * into pl from public.plans p where p.id = p_plan and p.active;
  price := public.effective_price(p_plan);
  if pl.id is null or coalesce(price, 0) <= 0 then
    raise exception 'That plan is not for sale' using errcode = '22023';
  end if;
  if p_user is not null then
    cur := public.user_plan(p_user);
    if cur <> 'free' then
      select a.plan_until into cur_until from public.accounts a
       where a.owner_id = p_user and public.account_plan(a.id) = cur
       order by a.plan_until desc nulls first limit 1;
      if cur = pl.id then
        -- §52: the same plan is a renewal — another year, at today's price
        if cur_until is null then
          raise exception 'You have % for good. There is nothing to renew.', pl.name using errcode = '22023', hint = 'same_plan';
        end if;
        renew := true;
      elsif public.plan_rank(pl.id) < public.plan_rank(cur) then
        raise exception 'Your % year runs until %. A lower plan can be bought when it ends.',
          coalesce((select x.name from public.plans x where x.id = cur), initcap(cur)),
          coalesce(to_char(cur_until, 'FMDD Mon YYYY'), 'its end') using errcode = '22023', hint = 'downgrade';
      else
        credit := public.paid_credit_paise(p_user);   -- §52: the unused part of this year
      end if;
    end if;
  end if;
  due := price - credit;
  if due < 100 then due := least(price, 100); end if;
  base := jsonb_build_object('plan_id', pl.id, 'list_paise', price, 'credit_paise', price - due,
                             'due_paise', due, 'amount_paise', due, 'discount_paise', 0, 'code', v_code,
                             'ok', true, 'reason', null, 'sentence', null,
                             'period', 'year', 'days', 365,
                             'renewal', renew,
                             'current_until', cur_until,
                             'upgrade_from', case when credit > 0 then cur end,
                             'upgrade_from_name', case when credit > 0 then (select x.name from public.plans x where x.id = cur) end,
                             'paid_paise', credit,
                             'next_price_paise', case when price = pl.price_paise then pl.next_price_paise end,
                             'next_price_at',    case when price = pl.price_paise then pl.next_price_at end);
  if v_code is null then return base; end if;
  select * into pc from public.promo_codes c where c.code = v_code;
  if pc.code is not null and pc.max_uses is not null then
    select count(distinct x.user_id)::int into held
      from public.payments x
     where x.promo_code = pc.code and x.status = 'created'
       and x.created_at > now() - interval '60 minutes'
       and x.user_id is distinct from p_user;
  end if;
  reason := case
    when pc.code is null                                                   then 'unknown'
    when pc.kind = 'gift'                                                  then 'gift'
    when not pc.active                                                     then 'inactive'
    when pc.valid_from is not null and pc.valid_from > now()               then 'inactive'
    when pc.valid_until is not null and pc.valid_until <= now()            then 'expired'
    when pc.max_uses is not null and pc.uses + held >= pc.max_uses         then 'exhausted'
    when pc.plan_ids is not null and not (pl.id = any (pc.plan_ids))       then 'not_for_plan'
    when p_user is not null and pc.owner_user_id = p_user                  then 'own_code'
  end;
  if reason is not null then
    return base || jsonb_build_object('ok', false, 'reason', reason, 'sentence', public.promo_reason_sentence(reason));
  end if;
  amt := public.promo_price(due, pc.percent_off, pc.amount_off_paise);
  return base || jsonb_build_object('amount_paise', amt, 'discount_paise', due - amt, 'kind', pc.kind,
                                    'percent_off', pc.percent_off, 'amount_off_paise', pc.amount_off_paise);
end;
$fn$;

-- 52.4 create_pending_payment: a year ------------------------------------------
create or replace function public.create_pending_payment(p_user uuid, p_plan text, p_period text, p_account uuid default null, p_code text default null)
returns table (payment_id uuid, amount_paise int, currency text, plan_name text, list_paise int, discount_paise int, promo_code text, credit_paise int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  q   jsonb;
  pid uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  -- §52: a plan is bought for a year. 'lifetime' is what an rzp-order
  -- deployed before §52 still sends; it is read as a year until redeployed.
  if coalesce(p_period, 'year') not in ('year', 'lifetime') then
    raise exception 'Plans are bought a year at a time' using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(pl.price_paise, 0) <= 0 then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  perform 1 from public.promo_codes c
   where c.code = nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '')
     for update;
  q := public.quote_for(p_user, p_plan, p_code);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'sentence' using errcode = '22023', hint = q ->> 'reason';
  end if;
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, list_paise, discount_paise, promo_code, credit_paise)
  values (p_user, p_account, p_plan, 'year', (q ->> 'amount_paise')::int, (q ->> 'list_paise')::int,
          (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int)
  returning id into pid;
  return query select pid, (q ->> 'amount_paise')::int, 'INR'::text, pl.name, (q ->> 'list_paise')::int,
                      (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int;
end;
$fn$;
revoke execute on function public.create_pending_payment(uuid, text, text, uuid, text) from public, anon, authenticated;

-- 52.5 activate_payment: applies a year, records when it starts and ends ---------
create or replace function public.activate_payment(p_order_id text, p_payment_id text, p_raw jsonb default null)
returns table (payment_id uuid, account_id uuid, plan_id text, ends_at timestamptz, already boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay   public.payments;
  acc   uuid;
  rep   bigint := nullif(p_raw -> 'payment' ->> 'amount', '')::bigint;
  pc    public.promo_codes;
  applied boolean;
  until timestamptz;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    return query select pay.id, pay.account_id, pay.plan_id, pay.ends_at, true;
    return;
  end if;
  if pay.status <> 'created' and pay.status <> 'failed' then
    raise exception 'Payment is %', pay.status using errcode = '22023';
  end if;
  if rep is not null and rep <> pay.amount_paise then
    raise exception 'Razorpay reports % paise for an order recorded at %', rep, pay.amount_paise using errcode = '22023';
  end if;
  if pay.promo_code is not null then
    select * into pc from public.promo_codes c where c.code = pay.promo_code for update;
    if pc.max_uses is not null and pc.uses >= pc.max_uses then
      raise exception 'The code % was used up before this payment was confirmed, so the plan was not applied. Ask for a refund from Settings.', pay.promo_code
        using errcode = '22023', hint = 'exhausted';
    end if;
  end if;
  -- §52: the credit is the unused part of a year, which shrinks by the
  -- minute; an order is good for an hour, so a little slack (2%, at least
  -- ₹1) separates "time passed" from "the credit has gone".
  if pay.credit_paise > 0
     and pay.credit_paise > public.paid_credit_paise(pay.user_id) + greatest(100, pay.credit_paise / 50) then
    raise exception 'This order was priced with credit for a payment that no longer counts, so the plan was not applied. Ask for a refund from Settings.'
      using errcode = '22023', hint = 'credit_gone';
  end if;
  acc := public.account_for_buyer(pay.user_id, pay.account_id);
  -- §52: the same plan (a renewal) or a higher one applies; a lower one
  -- (bought in a race with an upgrade) does not.
  applied := public.plan_rank(pay.plan_id) >= public.plan_rank(public.account_plan(acc));
  if applied then
    until := public.apply_plan(acc, pay.plan_id, 'year', 365);
  end if;
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc,
         starts_at = case when applied then until - interval '365 days' else now() end,
         ends_at   = case when applied then until end,
         period = 'year',
         raw = coalesce(p_raw, p.raw),
         plan_applied = applied
   where p.id = pay.id;
  if pay.promo_code is not null then
    update public.promo_codes c set uses = c.uses + 1, updated_at = now() where c.code = pay.promo_code;
  end if;
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, until, false;
end;
$fn$;
revoke execute on function public.activate_payment(text, text, jsonb) from public, anon, authenticated;

-- 52.6 mark_payment_refunded: takes back that payment's own year -----------------
create or replace function public.mark_payment_refunded(p_payment_id text, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay  public.payments;
  free_seats int := greatest(1, coalesce(public.plan_cap((select p.limits from public.plans p where p.id = 'free'), 'seats'), 1000));
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_payment_id = p_payment_id for update;
  if pay.id is null or pay.status = 'refunded' then return; end if;
  update public.payments p set status = 'refunded', raw = coalesce(p_raw, p.raw) where p.id = pay.id;
  if pay.account_id is null then return; end if;
  perform set_config('fms.billing', 'on', true);
  if pay.starts_at is not null and pay.ends_at is not null and pay.ends_at > pay.starts_at then
    -- §52: a year comes off; anything stacked before or after it stays
    update public.accounts a
       set plan_until = greatest(now(), a.plan_until - (pay.ends_at - pay.starts_at)),
           updated_at = now()
     where a.id = pay.account_id and a.plan = pay.plan_id and a.plan_until is not null;
  else
    -- a payment from before §52 (no year recorded): the plan ends today
    update public.accounts a set plan_until = least(a.plan_until, now()), updated_at = now()
     where a.id = pay.account_id and a.plan = pay.plan_id;
  end if;
  -- §50: back to the free plan's seat cap once nothing paid is left running
  update public.accounts a set seat_limit = least(a.seat_limit, free_seats)
   where a.id = pay.account_id and a.plan = pay.plan_id and a.plan_until is not null and a.plan_until <= now();
end;
$fn$;
revoke execute on function public.mark_payment_refunded(text, jsonb) from public, anon, authenticated;

-- 52.7 admin_grant_plan: days are honoured; 0 is still for good ------------------
create or replace function public.admin_grant_plan(p_user uuid, p_plan text, p_days int, p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  acc     uuid;
  v_prior text;
  until   timestamptz;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['owner']);
  if not exists (select 1 from public.plans p where p.id = p_plan and p.id <> 'free') then
    raise exception 'No such paid plan' using errcode = '22023';
  end if;
  v_prior := public.user_plan(p_user);
  acc := public.account_for_buyer(p_user, null);
  until := public.apply_plan(acc, p_plan, 'grant', coalesce(p_days, 0));
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, status, note, paid_at, starts_at, ends_at)
  values (p_user, acc, p_plan, 'grant', 0, 'granted', left(p_note, 300), now(), now(), until);
  insert into public.studio_members (user_id, role) values (p_user, 'user') on conflict (user_id) do nothing;
  perform public.admin_audit_write('grant_plan', 'user', p_user::text,
    jsonb_build_object('plan', v_prior), jsonb_build_object('plan', p_plan, 'until', until), left(p_note, 300));
  return until;
end;
$fn$;

-- 52.8 THE BACKFILL: a year from the switch for every plan bought for good -------
do $$
declare t timestamptz;
begin
  insert into public.billing_settings (id) values (true) on conflict (id) do nothing;
  select s.yearly_switch_at into t from public.billing_settings s where s.id;
  if t is not null then return; end if;              -- already switched
  t := now();
  perform set_config('fms.billing', 'on', true);
  -- the payment that bought the plan now held: its year runs from the switch
  update public.payments p
     set period = 'year', starts_at = t, ends_at = t + interval '365 days'
    from public.accounts a
   where a.id = p.account_id and a.plan = p.plan_id and a.plan <> 'free' and a.plan_until is null
     and p.status = 'paid' and p.period = 'lifetime' and p.amount_paise > 0
     and p.plan_applied is not false;
  -- and the account it bought (a grant, with no paid payment, stays for good)
  update public.accounts a
     set plan_until = t + interval '365 days', plan_period = 'year', updated_at = now()
   where a.plan <> 'free' and a.plan_until is null
     and exists (select 1 from public.payments p
                  where p.account_id = a.id and p.plan_id = a.plan and p.status = 'paid'
                    and p.period = 'year' and p.ends_at = t + interval '365 days');
  update public.billing_settings s set yearly_switch_at = t, updated_at = now() where s.id;
end $$;

notify pgrst, 'reload schema';

-- 52.9 CHECKS TO RUN LIVE (read-only) ------------------------------------------
-- select yearly_switch_at from public.billing_settings;
-- select id, plan, plan_until, plan_period from public.accounts where plan <> 'free' order by plan_until;
-- select plan_id, period, starts_at, ends_at, amount_paise from public.payments where status = 'paid' order by paid_at;
