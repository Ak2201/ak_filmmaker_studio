-- ============================================================
-- 55. CHARGING IN US DOLLARS — an order in INR or USD, priced by the server
-- ------------------------------------------------------------
-- 21 Oct 2026, branch us/pricing-server, docs/US-MARKET-PLAN.md §C. The
-- contract first reserved "§53"; §53 (billing audit fixes) and §55 (the
-- plan caps lock) were taken on develop the same day, so this is §55.
-- Run AFTER §53 and §55: it restates §53's paid_credit_paise, quote_for,
-- quote_order, create_pending_payment, activation_refusal, activate_payment
-- and begin_refund (keeping every §53 fix: credit per organisation, a
-- refusal after capture RECORDED, an unanswered refund handing back its
-- key), §31's price_notice(text), §46's admin_set_plan_price, §42's
-- admin_customer, §35's claim_refund_email, §21's payments_referral_after
-- and §16's admin console reads. §55 touched only the four enforce_*_limit
-- triggers, none of which is restated here.
--
-- WHAT THE OWNER DECIDED: visitors in India see and pay rupees, everybody
-- else sees and pays US dollars, and the OWNER types the dollar amounts in
-- the console (admin.html#tiers). Nothing here hard-codes a dollar price;
-- §31's seed ($19 / $29 / $39) is the starting figure the owner replaces.
--
-- THE CLIENT CHOOSES THE CURRENCY, NEVER THE AMOUNT. An order is 'INR' or
-- 'USD'. INR is priced as it always was (plans + effective_price()); USD
-- from plan_prices (amount_minor, or next_amount_minor once the plan's ONE
-- rise date has passed — the rule §31's price_notice() already uses for
-- display_minor). Promo codes are re-quoted here in both currencies.
--
-- OFF UNTIL THE OWNER TURNS IT ON. billing_settings.usd_checkout defaults
-- to false, and while it is false every order is INR, exactly as before:
-- quote_for() refuses USD (hint 'currency_closed') and price_notice('USD')
-- still says charged_currency 'INR'. admin_set_usd_checkout(true) refuses
-- while any active paid plan lacks a dollar price of at least $1.00, and it
-- should only be pressed once Razorpay has approved International payments
-- on the account (docs/BILLING.md §24) — Razorpay refuses a USD order
-- otherwise, after the row exists, and the buyer sees "Razorpay did not
-- create the order".
--
-- COLUMN NAMES DO NOT CHANGE. Every *_paise column holds MINOR UNITS OF ITS
-- ROW'S currency: paise for INR, cents for USD. Renaming them would restate
-- every function since §16. New JSON keys say _minor and the old _paise keys
-- stay beside them with the same value, for clients built before this.
--
-- ACCESS IS BLIND TO CURRENCY. apply_plan(), the year, stacking, upgrades,
-- grants, the gate and entitlement() change nothing.
--
-- NO EXCHANGE RATE IS EVER USED. An upgrade's credit for a year paid in the
-- other currency is converted at the ratio of THAT plan's own list prices in
-- the two currencies (paid_credit_minor). When that ratio cannot be formed
-- (the plan has no dollar price) the quote refuses rather than guess, and
-- says to pay in rupees.
--
-- THE DEPLOYED FUNCTIONS KEEP WORKING IN BETWEEN. The old rzp-order sends
-- five named arguments; they resolve to the new create_pending_payment with
-- p_currency defaulting to 'INR'. rzp-verify / rzp-webhook / rzp-refund
-- call functions whose arguments did not change. Redeploy all four from
-- current source after this runs (docs/BILLING.md §24).
--
--   55.0  preconditions
--   55.1  columns: usd_checkout, payments.currency CHECK, international,
--         card_country, refunds.currency (stamped from the payment)
--   55.2  effective_price_minor(plan, currency)
--   55.3  paid_credit_minor(user, account, currency); paid_credit_paise kept
--   55.4  quote_for(user, plan, code, account, currency)
--   55.5  promo_reason_sentence: 'currency'
--   55.6  quote_order(plan, code, currency) — a new overload, no default
--   55.7  create_pending_payment(…, p_currency default 'INR')
--   55.8  activation_refusal / activate_payment: currency, international card
--   55.9  begin_refund: the payment's currency; claim_refund_email: currency
--   55.10 referral credits stay rupee-only
--   55.11 price_notice(text): charged_currency, usd_checkout
--   55.12 admin_set_plan_price: a dollar price is CHARGED; owner only
--   55.13 admin_set_usd_checkout(on)
--   55.14 the console's reads: overview per currency, ledger, Customer 360
--   55.14b affiliate report per currency; refund reads carry the currency
--   55.15 grants
--   55.16 CHECKS TO RUN LIVE (read-only)
-- ============================================================

-- 55.0 PRECONDITIONS ------------------------------------------------------
do $$
begin
  if to_regprocedure('public.buyer_target_account(uuid,uuid)') is null then
    raise exception 'Section 55 needs section 53 (buyer_target_account) first.';
  end if;
  if to_regclass('public.plan_prices') is null then
    raise exception 'Section 55 needs section 31 (plan_prices) first.';
  end if;
  if to_regprocedure('public.admin_audit_write(text,text,text,jsonb,jsonb,text)') is null
     or to_regprocedure('public.require_role(text[])') is null then
    raise exception 'Section 55 needs sections 40 and 45 (admin_audit_write, require_role) first.';
  end if;
end $$;

-- 55.1 COLUMNS --------------------------------------------------------------
alter table public.billing_settings add column if not exists usd_checkout boolean not null default false;

-- payments.currency has existed since §16 with default 'INR' and no check;
-- every row so far is 'INR'. Two values, and nothing else, from now on.
update public.payments set currency = upper(btrim(currency)) where currency <> upper(btrim(currency));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_currency_check') then
    alter table public.payments add constraint payments_currency_check check (currency in ('INR', 'USD'));
  end if;
end $$;

-- Razorpay's payment entity says whether the card was issued abroad. Recorded
-- (null = Razorpay did not say), shown in the console as "Intl card", never
-- blocked and never re-priced — a policy is the owner's to set later.
alter table public.payments add column if not exists international boolean;
alter table public.payments add column if not exists card_country  text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_card_country_check') then
    alter table public.payments add constraint payments_card_country_check
      check (card_country is null or card_country ~ '^[A-Z]{2,3}$');
  end if;
end $$;

-- A refund is in the currency of the payment it refunds; Razorpay refunds
-- in the original currency. Stamped by a trigger from the payment, so no
-- writer (begin_refund, record_refund's dashboard branch) can get it wrong.
alter table public.refunds add column if not exists currency text not null default 'INR';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'refunds_currency_check') then
    alter table public.refunds add constraint refunds_currency_check check (currency in ('INR', 'USD'));
  end if;
end $$;
update public.refunds r set currency = p.currency
  from public.payments p where p.id = r.payment_id and r.currency is distinct from p.currency;

create or replace function public.refunds_currency_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.currency := coalesce((select p.currency from public.payments p where p.id = new.payment_id), 'INR');
  return new;
end;
$fn$;
revoke execute on function public.refunds_currency_stamp() from public, anon, authenticated;
drop trigger if exists refunds_currency_stamp on public.refunds;
create trigger refunds_currency_stamp before insert or update of payment_id, currency on public.refunds
  for each row execute function public.refunds_currency_stamp();

-- 55.2 THE PRICE IN A CURRENCY ------------------------------------------------
/** What one plan costs in one currency, in minor units, or null when it is
 *  not for sale in that currency. INR is effective_price() (§30) and nothing
 *  else. USD is the owner's plan_prices row: amount_minor before the plan's
 *  rise, next_amount_minor (or amount_minor when none was set) after it —
 *  the same instant the rupee price moves, because there is one date per
 *  plan (§31). 0 in plan_prices means "not sold in dollars". */
create or replace function public.effective_price_minor(p_plan text, p_currency text)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case upper(btrim(coalesce(p_currency, '')))
    when 'INR' then nullif(greatest(coalesce(public.effective_price(p_plan), 0), 0), 0)
    when 'USD' then (
      select nullif(greatest(case when public.effective_price(p.id) = p.price_paise then pp.amount_minor
                                  else coalesce(pp.next_amount_minor, pp.amount_minor) end, 0), 0)
        from public.plans p
        join public.plan_prices pp on pp.plan_id = p.id and pp.currency = 'USD'
       where p.id = p_plan)
  end;
$$;
revoke execute on function public.effective_price_minor(text, text) from public, anon, authenticated;

-- 55.3 THE UNUSED YEAR, IN A CURRENCY -------------------------------------------
/** §53's credit for one organisation, expressed in p_currency. A year paid
 *  in the other currency is converted at the ratio of THAT plan's list
 *  prices in the two currencies — value × price(plan, want) / price(plan,
 *  paid) — never at an exchange rate. NULL when a year cannot be converted
 *  (the plan has no price in one of the two): the quote then refuses and
 *  says to pay in the currency the year was bought in, rather than credit
 *  nothing and overcharge. */
create or replace function public.paid_credit_minor(p_user uuid, p_account uuid, p_currency text)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with yrs as (
    select (p.amount_paise + coalesce(p.credit_paise, 0))::numeric
           * greatest(0, least(1,
               extract(epoch from (p.ends_at - greatest(now(), p.starts_at)))
               / nullif(extract(epoch from (p.ends_at - p.starts_at)), 0)))
           * case when p.currency = upper(btrim(p_currency)) then 1
                  else public.effective_price_minor(p.plan_id, p_currency)::numeric
                       / nullif(public.effective_price_minor(p.plan_id, p.currency), 0) end as v
      from public.payments p
      join public.accounts a on a.id = p.account_id and a.owner_id = p_user
     where p_account is not null and p.account_id = p_account
       and p.user_id = p_user and p.status = 'paid' and p.period = 'year'
       and p.plan_applied is not false
       and p.plan_id = a.plan
       and p.starts_at is not null and p.ends_at is not null and p.ends_at > now()
  )
  select case when upper(btrim(coalesce(p_currency, ''))) not in ('INR', 'USD') then null
              when bool_or(y.v is null) then null
              else coalesce(floor(sum(y.v)), 0)::int end
    from yrs y;
$$;
revoke execute on function public.paid_credit_minor(uuid, uuid, text) from public, anon, authenticated;

/** §53's name, kept for its callers: the credit in rupees. A dollar year is
 *  converted at the plan's own price ratio; one that cannot be counts 0
 *  here (this form cannot refuse), which only an INR quote would read. */
create or replace function public.paid_credit_paise(p_user uuid, p_account uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.paid_credit_minor(p_user, p_account, 'INR'), 0);
$$;
revoke execute on function public.paid_credit_paise(uuid, uuid) from public, anon, authenticated;

-- 55.4 quote_for: one function, one more argument ---------------------------------
-- A fifth argument with a default cannot sit beside the four-argument form
-- (every four-argument call would be ambiguous), so that one goes, exactly as
-- §53 did to the three-argument one. It is internal (revoked from everyone).
drop function if exists public.quote_for(uuid, text, text, uuid);
create or replace function public.quote_for(p_user uuid, p_plan text, p_code text default null, p_account uuid default null, p_currency text default 'INR')
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
  cur    text := upper(btrim(coalesce(p_currency, 'INR')));
  cur_pl text := 'free';
  credit int  := 0;
  price  int;
  nxt    int;
  due    int;
  amt    int;
  reason text;
  base   jsonb;
  held   int  := 0;
  renew  boolean := false;
  cur_until timestamptz;
  tgt    uuid;
  rising boolean;
begin
  if cur not in ('INR', 'USD') then
    raise exception 'Orders are in rupees (INR) or US dollars (USD).' using errcode = '22023', hint = 'currency';
  end if;
  if cur = 'USD' and not coalesce((select s.usd_checkout from public.billing_settings s where s.id), false) then
    raise exception 'Payment in US dollars is not open yet. You can pay in rupees; your card is charged the rupee amount.'
      using errcode = '22023', hint = 'currency_closed';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(public.effective_price(p_plan), 0) <= 0 then
    raise exception 'That plan is not for sale' using errcode = '22023';
  end if;
  price := public.effective_price_minor(p_plan, cur);
  if coalesce(price, 0) <= 0 then
    raise exception '% is not sold in US dollars at the moment. You can pay in rupees.', pl.name using errcode = '22023', hint = 'currency';
  end if;
  rising := pl.next_price_paise is not null and public.effective_price(p_plan) = pl.price_paise;
  nxt := case when not rising then null
              when cur = 'INR' then pl.next_price_paise
              else (select pp.next_amount_minor from public.plan_prices pp where pp.plan_id = pl.id and pp.currency = 'USD') end;
  if p_user is not null then
    tgt := public.buyer_target_account(p_user, p_account);
    if tgt is not null then
      cur_pl := coalesce(public.account_plan(tgt), 'free');
      select a.plan_until into cur_until from public.accounts a where a.id = tgt;
    end if;
    if cur_pl <> 'free' then
      if cur_pl = pl.id then
        if cur_until is null then
          raise exception 'You have % for good. There is nothing to renew.', pl.name using errcode = '22023', hint = 'same_plan';
        end if;
        renew := true;
      elsif public.plan_rank(pl.id) < public.plan_rank(cur_pl) then
        raise exception 'Your % year runs until %. A lower plan can be bought when it ends.',
          coalesce((select x.name from public.plans x where x.id = cur_pl), initcap(cur_pl)),
          coalesce(to_char(cur_until, 'FMDD Mon YYYY'), 'its end') using errcode = '22023', hint = 'downgrade';
      else
        credit := public.paid_credit_minor(p_user, tgt, cur);
        if credit is null then
          -- Worded by the order's currency: a rupee quote that cannot convert a
          -- dollar year must not tell the buyer to "pay in rupees".
          if cur = 'USD' then
            raise exception 'Your current year cannot be credited in US dollars. Pay in rupees to have it taken off the price.'
              using errcode = '22023', hint = 'currency';
          else
            raise exception 'Your current year was paid in another currency and cannot be credited in rupees at the moment. Write to us and we will apply it by hand.'
              using errcode = '22023', hint = 'currency';
          end if;
        end if;
      end if;
    end if;
  end if;
  due := price - credit;
  if due < 100 then due := least(price, 100); end if;   -- Razorpay's minimum: 100 paise, or 100 cents
  base := jsonb_build_object('plan_id', pl.id, 'currency', cur,
                             'list_paise', price, 'credit_paise', price - due,
                             'due_paise', due, 'amount_paise', due, 'discount_paise', 0,
                             'list_minor', price, 'credit_minor', price - due,
                             'due_minor', due, 'amount_minor', due, 'discount_minor', 0,
                             'code', v_code,
                             'ok', true, 'reason', null, 'sentence', null,
                             'period', 'year', 'days', 365,
                             'renewal', renew,
                             'current_until', cur_until,
                             'account_id', tgt,
                             'upgrade_from', case when credit > 0 then cur_pl end,
                             'upgrade_from_name', case when credit > 0 then (select x.name from public.plans x where x.id = cur_pl) end,
                             'paid_paise', credit,
                             'next_price_paise', nxt,
                             'next_minor',       nxt,
                             'next_price_at',    case when nxt is not null then pl.next_price_at end);
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
    -- §55: a flat amount off is a rupee amount; it is never read as cents
    when cur <> 'INR' and pc.amount_off_paise is not null                  then 'currency'
  end;
  if reason is not null then
    return base || jsonb_build_object('ok', false, 'reason', reason, 'sentence', public.promo_reason_sentence(reason));
  end if;
  amt := public.promo_price(due, pc.percent_off, pc.amount_off_paise);
  return base || jsonb_build_object('amount_paise', amt, 'discount_paise', due - amt,
                                    'amount_minor', amt, 'discount_minor', due - amt, 'kind', pc.kind,
                                    'percent_off', pc.percent_off, 'amount_off_paise', pc.amount_off_paise);
end;
$fn$;
revoke execute on function public.quote_for(uuid, text, text, uuid, text) from public, anon, authenticated;

-- 55.5 promo_reason_sentence ------------------------------------------------------
create or replace function public.promo_reason_sentence(p_reason text)
returns text language sql immutable as $$
  select case p_reason
    when 'unknown'      then 'That code is not one we know. Check the spelling.'
    when 'expired'      then 'That code has expired.'
    when 'exhausted'    then 'That code has been used as many times as it allows.'
    when 'not_for_plan' then 'That code does not apply to this plan.'
    when 'inactive'     then 'That code is not active right now.'
    when 'own_code'     then 'That is your own referral code — it is for the friends you share it with.'
    when 'gift'         then 'That is a gift code. Redeem it under "Have a gift code?" instead.'
    when 'currency'     then 'This code takes a rupee amount off, so it works only when you pay in rupees.'
    else 'That code cannot be used.' end;
$$;

-- 55.6 quote_order ----------------------------------------------------------------
/** The cards' quote, unchanged (§21, §53): rupees, the organisation holding
 *  the plan. Restated only so it names the new quote_for explicitly. */
create or replace function public.quote_order(p_plan text, p_code text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.quote_for(auth.uid(), p_plan, p_code, null, 'INR');
$$;

/** The same quote in a currency. A separate overload with NO default — the
 *  §31 lesson: a default on a third argument would make every two-argument
 *  call match both functions ("function quote_order is not unique"). */
create or replace function public.quote_order(p_plan text, p_code text, p_currency text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.quote_for(auth.uid(), p_plan, p_code, null, p_currency);
$$;

-- 55.7 create_pending_payment ---------------------------------------------------------
-- The five-argument form goes so that the old rzp-order's five NAMED
-- arguments resolve to this one, with p_currency defaulting to 'INR'.
drop function if exists public.create_pending_payment(uuid, text, text, uuid, text);
create or replace function public.create_pending_payment(p_user uuid, p_plan text, p_period text, p_account uuid default null, p_code text default null, p_currency text default 'INR')
returns table (payment_id uuid, amount_paise int, currency text, plan_name text, list_paise int, discount_paise int, promo_code text, credit_paise int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  q   jsonb;
  pid uuid;
  tgt uuid;
  cur text := upper(btrim(coalesce(p_currency, 'INR')));
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
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
  tgt := public.buyer_target_account(p_user, p_account);
  -- quote_for refuses a currency that is not INR/USD, USD while it is closed,
  -- and a plan with no dollar price, each as 22023 with its hint
  q := public.quote_for(p_user, p_plan, p_code, tgt, cur);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'sentence' using errcode = '22023', hint = q ->> 'reason';
  end if;
  cur := q ->> 'currency';
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, currency, list_paise, discount_paise, promo_code, credit_paise)
  values (p_user, tgt, p_plan, 'year', (q ->> 'amount_minor')::int, cur, (q ->> 'list_minor')::int,
          (q ->> 'discount_minor')::int, q ->> 'code', (q ->> 'credit_minor')::int)
  returning id into pid;
  return query select pid, (q ->> 'amount_minor')::int, cur, pl.name, (q ->> 'list_minor')::int,
                      (q ->> 'discount_minor')::int, q ->> 'code', (q ->> 'credit_minor')::int;
end;
$fn$;
revoke execute on function public.create_pending_payment(uuid, text, text, uuid, text, text) from public, anon, authenticated;

-- 55.8 activation: the credit in the order's currency; the card's origin ---------------
create or replace function public.activation_refusal(p_pay public.payments, p_account uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare pc public.promo_codes;
begin
  if p_pay.promo_code is not null then
    select * into pc from public.promo_codes c where c.code = p_pay.promo_code;
    if pc.max_uses is not null and pc.uses >= pc.max_uses then return 'exhausted'; end if;
  end if;
  -- §52's slack: the credit shrinks by the minute; an order is good for an hour.
  -- §55: counted in the order's own currency (a credit that can no longer be
  -- converted counts as gone).
  if coalesce(p_pay.credit_paise, 0) > 0
     and p_pay.credit_paise > coalesce(public.paid_credit_minor(p_pay.user_id, p_account, p_pay.currency), 0)
                              + greatest(100, p_pay.credit_paise / 50) then
    return 'credit_gone';
  end if;
  return null;
end;
$fn$;
revoke execute on function public.activation_refusal(public.payments, uuid) from public, anon, authenticated;

/** What Razorpay's payment entity says about the card: { international,
 *  card_country }, each null when it was not said. Razorpay sends
 *  `international` as a JSON boolean and `card.country` as an ISO code. */
create or replace function public.payment_card_origin(p_raw jsonb)
returns table (international boolean, card_country text)
language sql
immutable
as $$
  select case when jsonb_typeof(p_raw -> 'payment' -> 'international') = 'boolean'
              then (p_raw -> 'payment' ->> 'international')::boolean end,
         case when upper(btrim(coalesce(p_raw -> 'payment' -> 'card' ->> 'country', ''))) ~ '^[A-Z]{2,3}$'
              then upper(btrim(p_raw -> 'payment' -> 'card' ->> 'country')) end;
$$;
revoke execute on function public.payment_card_origin(jsonb) from public, anon, authenticated;

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
  rcur  text   := nullif(upper(btrim(coalesce(p_raw -> 'payment' ->> 'currency', ''))), '');
  intl  boolean;
  ctry  text;
  why   text;
  applied boolean;
  until timestamptz;
begin
  perform public.billing_require_service();
  select o.international, o.card_country into intl, ctry from public.payment_card_origin(p_raw) o;
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    -- §55: the later of verify and the webhook may carry the card's origin
    -- when the first did not; it only ever fills a blank
    if (pay.international is null and intl is not null) or (pay.card_country is null and ctry is not null) then
      update public.payments p set international = coalesce(p.international, intl), card_country = coalesce(p.card_country, ctry)
       where p.id = pay.id;
    end if;
    return query select pay.id, pay.account_id, pay.plan_id, pay.ends_at, true;
    return;
  end if;
  if pay.status <> 'created' and pay.status <> 'failed' then
    raise exception 'Payment is %', pay.status using errcode = '22023';
  end if;
  -- §55: the money must be in the currency the order was priced in
  if rcur is not null and rcur <> pay.currency then
    raise exception 'Razorpay reports a payment in % for an order recorded in %', rcur, pay.currency using errcode = '22023';
  end if;
  if rep is not null and rep <> pay.amount_paise then
    raise exception 'Razorpay reports % (minor units of %) for an order recorded at %', rep, pay.currency, pay.amount_paise using errcode = '22023';
  end if;
  if pay.promo_code is not null then
    perform 1 from public.promo_codes c where c.code = pay.promo_code for update;
  end if;
  acc := coalesce(public.buyer_target_account(pay.user_id, pay.account_id), public.account_for_buyer(pay.user_id, null));
  why := public.activation_refusal(pay, acc);
  applied := why is null and public.plan_rank(pay.plan_id) >= public.plan_rank(public.account_plan(acc));
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
         plan_applied = applied,
         unapplied_reason = why,
         international = coalesce(intl, p.international),
         card_country  = coalesce(ctry, p.card_country)
   where p.id = pay.id;
  if pay.promo_code is not null and why is null then
    update public.promo_codes c set uses = c.uses + 1, updated_at = now() where c.code = pay.promo_code;
  end if;
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, until, false;
end;
$fn$;
revoke execute on function public.activate_payment(text, text, jsonb) from public, anon, authenticated;

-- 55.9 REFUNDS IN THE PAYMENT'S CURRENCY ----------------------------------------------
-- §53's begin_refund, word for word, except: p_amount is in minor units of
-- the PAYMENT's currency (it always was; the messages said paise), and the
-- answer names the currency for rzp-refund and the console.
create or replace function public.begin_refund(p_payment uuid, p_amount int, p_reason text, p_admin uuid, p_request uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare pay public.payments; amt int; f public.refunds; q public.refund_requests; em text; later public.payments; stuck public.refunds;
begin
  perform public.billing_require_service();
  if p_admin is null
     or not exists (select 1 from public.studio_members m
                     where m.user_id = p_admin and m.role = 'admin' and m.disabled_at is null)
     or coalesce((select r.role from public.admin_roles r where r.user_id = p_admin), 'owner') not in ('owner','finance') then
    raise exception 'Only an owner or a finance administrator can refund a payment.' using errcode = '42501';
  end if;
  select * into pay from public.payments p where p.id = p_payment for update;
  if pay.id is null then raise exception 'No such payment' using errcode = '22023'; end if;
  if pay.status = 'refunded' then raise exception 'That payment has already been refunded' using errcode = '22023'; end if;
  if pay.status <> 'paid' or pay.razorpay_payment_id is null or pay.amount_paise <= 0 then
    raise exception 'Only a captured payment can be refunded (this one is %)', pay.status using errcode = '22023';
  end if;
  select * into stuck from public.refunds r
   where r.payment_id = pay.id and r.status = 'initiated' and r.razorpay_refund_id is null
   order by r.created_at limit 1;
  if stuck.id is not null then
    if stuck.created_at > now() - interval '1 minute' then
      raise exception 'A refund for that payment is already in progress' using errcode = '22023', hint = 'in_flight';
    end if;
    if p_amount is not null and p_amount <> stuck.amount_paise then
      raise exception 'An earlier refund of % (minor units of %) has had no answer from Razorpay. Retry that amount, or check the Razorpay dashboard first.', stuck.amount_paise, pay.currency
        using errcode = '22023', hint = 'unresolved';
    end if;
    select u.email::text into em from auth.users u where u.id = pay.user_id;
    return jsonb_build_object('refund_id', stuck.id, 'razorpay_payment_id', pay.razorpay_payment_id, 'amount_paise', stuck.amount_paise,
                              'amount_minor', stuck.amount_paise, 'currency', pay.currency,
                              'email', em, 'plan_id', pay.plan_id, 'reused', true);
  end if;
  if exists (select 1 from public.refunds r where r.payment_id = pay.id and r.status in ('initiated','pending','processed')) then
    raise exception 'A refund for that payment is already in progress' using errcode = '22023';
  end if;
  if pay.plan_applied is not false then
    select * into later from public.payments x
     where x.user_id = pay.user_id and x.id <> pay.id and x.status = 'paid'
       and x.credit_paise > 0 and x.plan_applied is not false and x.paid_at >= pay.paid_at
     order by x.paid_at limit 1;
    if later.id is not null then
      raise exception 'This payment was credited toward a later upgrade (%, paid %). Refund that payment first.',
        later.plan_id, to_char(later.paid_at, 'YYYY-MM-DD') using errcode = '22023', hint = 'credited';
    end if;
  end if;
  amt := coalesce(p_amount, pay.amount_paise);
  if amt < 1 or amt > pay.amount_paise then
    raise exception 'The amount must be between 1 and the % (minor units of %) that was paid', pay.amount_paise, pay.currency using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '22023'; end if;
  if p_request is not null then
    select * into q from public.refund_requests r where r.id = p_request for update;
    if q.id is null or q.payment_id <> pay.id then raise exception 'That request is not about this payment' using errcode = '22023'; end if;
    if q.status not in ('pending','approved') then raise exception 'That request was already %', q.status using errcode = '22023'; end if;
  end if;
  insert into public.refunds (payment_id, request_id, amount_paise, currency, reason, refunded_by)
  values (pay.id, p_request, amt, pay.currency, left(btrim(p_reason), 500), p_admin) returning * into f;
  select u.email::text into em from auth.users u where u.id = pay.user_id;
  return jsonb_build_object('refund_id', f.id, 'razorpay_payment_id', pay.razorpay_payment_id, 'amount_paise', amt,
                            'amount_minor', amt, 'currency', pay.currency,
                            'email', em, 'plan_id', pay.plan_id);
end;
$fn$;
revoke execute on function public.begin_refund(uuid, int, text, uuid, uuid) from public, anon, authenticated;

-- The refund e-mail must print the right symbol, so the claim returns the
-- currency. A new column in a RETURNS TABLE is a new return type, which
-- `create or replace` cannot make: drop, then create (the deployed mail.js
-- ignores a column it does not know).
drop function if exists public.claim_refund_email(text, text);
create or replace function public.claim_refund_email(p_rzp_refund text, p_status text)
returns table (refund_id uuid, status text, amount_paise int, razorpay_refund_id text,
               buyer_email text, buyer_name text, plan_name text, invoice_number text, currency text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare f public.refunds;
begin
  perform public.billing_require_service();
  if p_status not in ('processed', 'failed') then raise exception 'Only a settled refund is mailed' using errcode = '22023'; end if;
  update public.refunds r set emailed_status = p_status
   where r.razorpay_refund_id = p_rzp_refund
     and r.status = p_status
     and r.emailed_status is distinct from p_status
  returning * into f;
  if f.id is null then return; end if;
  return query
    select f.id, f.status, f.amount_paise, f.razorpay_refund_id,
           u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), '')),
           coalesce((select x.name from public.plans x where x.id = p.plan_id), initcap(p.plan_id)),
           (select i.number from public.invoices i where i.payment_id = p.id),
           p.currency
      from public.payments p
      left join auth.users u on u.id = p.user_id
     where p.id = f.payment_id
       and coalesce(btrim(u.email::text), '') <> '';
end;
$fn$;
revoke execute on function public.claim_refund_email(text, text) from public, anon, authenticated;
grant  execute on function public.claim_refund_email(text, text) to service_role;

-- 55.10 REFERRAL CREDITS STAY RUPEE-ONLY ------------------------------------------------
-- §21's trigger, with one guard: a referral reward is a rupee sum owed to an
-- Indian referrer, and a percentage of a dollar payment is cents, so a USD
-- order earns its referrer nothing. (The FRIEND's percentage off works in
-- either currency: that is quote_for's percent_off.)
create or replace function public.payments_referral_after()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pc  public.promo_codes;
  st  public.billing_settings;
  amt int;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if new.amount_paise > 0 then perform public.ensure_referral_code(new.user_id); end if;
    if new.promo_code is not null and new.currency = 'INR' then
      select * into pc from public.promo_codes c where c.code = new.promo_code;
      if pc.kind = 'referral' and pc.owner_user_id is not null and pc.owner_user_id <> new.user_id then
        select * into st from public.billing_settings s where s.id;
        amt := case when st.referral_reward_pct is not null then (new.amount_paise * st.referral_reward_pct) / 100
                    else least(coalesce(st.referral_reward_paise, 0), new.amount_paise) end;
        insert into public.referral_credits (referrer_user_id, payment_id, code, basis_paise, amount_paise)
        values (pc.owner_user_id, new.id, pc.code, new.amount_paise, amt)
        on conflict (payment_id) do nothing;
      end if;
    end if;
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    update public.referral_credits r set status = 'void' where r.payment_id = new.id and r.status = 'owed';
  end if;
  return new;
end;
$fn$;
revoke execute on function public.payments_referral_after() from public, anon, authenticated;

-- 55.11 price_notice(text) ------------------------------------------------------------------
/** §31's overload, the same keys with the same meanings, and two changes:
 *
 *    charged_currency  'USD' when dollars were asked for, usd_checkout is
 *                      on, and every active paid plan has a dollar price;
 *                      otherwise 'INR', as before. When it says USD, each
 *                      plan's display_minor IS the amount charged.
 *    usd_checkout      the switch, as a boolean (new key).
 *
 *  And one fix: a plan_prices row of 0 ("not sold in dollars", §55) is
 *  treated like no row — the plan falls back to its rupee figures —
 *  rather than displaying "$0". The rupee keys are still always present. */
create or replace function public.price_notice(p_currency text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with want as (
    select case when upper(btrim(coalesce(p_currency, ''))) ~ '^[A-Z]{3}$'
                then upper(btrim(p_currency)) else 'INR' end as cur
  ),
  pending as (
    select exists (select 1 from public.plans p
                    where p.next_price_paise is not null
                      and public.effective_price(p.id) = p.price_paise) as any_rising
  ),
  sw as (
    select coalesce((select s.usd_checkout from public.billing_settings s where s.id), false) as usd_on,
           not exists (select 1 from public.plans p
                        where p.active and coalesce(p.price_paise, 0) > 0
                          and coalesce(public.effective_price_minor(p.id, 'USD'), 0) < 100) as usd_complete
  )
  select jsonb_build_object(
    'currency',         w.cur,
    'charged_currency', case when w.cur = 'USD' and x.usd_on and x.usd_complete then 'USD' else 'INR' end,
    'usd_checkout',     x.usd_on,
    'seats_total', case when g.any_rising
                        then (select s.price_rises_after_buyers from public.billing_settings s where s.id) end,
    'seats_taken', case when g.any_rising then public.paid_buyers() end,
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',               p.id,
               'name',             p.name,
               'price_paise',      public.effective_price(p.id),
               'next_price_paise', case when public.effective_price(p.id) = p.price_paise then p.next_price_paise end,
               'next_price_at',    case when public.effective_price(p.id) = p.price_paise then p.next_price_at end,
               'rising',           p.next_price_paise is not null
                                   and public.effective_price(p.id) = p.price_paise,
               'display_currency', case when pp.currency is null then 'INR' else pp.currency end,
               'display_minor',    case
                                     when pp.currency is null then public.effective_price(p.id)
                                     when public.effective_price(p.id) = p.price_paise then pp.amount_minor
                                     else coalesce(pp.next_amount_minor, pp.amount_minor)
                                   end,
               'display_next_minor', case when pp.currency is not null
                                           and p.next_price_paise is not null
                                           and public.effective_price(p.id) = p.price_paise
                                          then pp.next_amount_minor end)
               order by p.sort)
        from public.plans p
        left join public.plan_prices pp
               on pp.plan_id = p.id and pp.currency = w.cur and w.cur <> 'INR' and pp.amount_minor > 0
       where p.active), '[]'::jsonb)
  ) from pending g, want w, sw x;
$$;

-- 55.12 admin_set_plan_price: a dollar price is a CHARGED price -------------------------------
/** §46's body (owner only, audited), with the dollar rules:
 *    - USD is CHARGED once usd_checkout is on, so it is a real price: 0
 *      ("not sold in dollars") or at least 100 cents ($1.00, Razorpay's
 *      minimum); 1–99 is refused;
 *    - while usd_checkout is ON, an active paid plan's dollar price cannot
 *      be set to 0 — admin_set_usd_checkout refuses to turn on with such a
 *      plan, and this is the same rule from the other side;
 *    - INR is still refused here: rupees keep their two authors
 *      (admin_set_plan, admin_set_next_price);
 *    - a next price is still a RISE on the plan's own date.
 *  Any other three-letter currency stays a display figure, as in §31. */
create or replace function public.admin_set_plan_price(
  p_plan        text,
  p_currency    text,
  p_amount_minor int,
  p_next_minor  int         default null,
  p_at          timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  cur text := upper(btrim(coalesce(p_currency, '')));
  v_before jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['owner']);
  if cur !~ '^[A-Z]{3}$' then
    raise exception 'A currency is a three-letter ISO 4217 code, such as USD.' using errcode = '22023';
  end if;
  if cur = 'INR' then
    raise exception 'The rupee price is set with admin_set_plan() and its rise with admin_set_next_price(); giving it a third author is how a quote and an invoice come to disagree.'
      using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan;
  if pl.id is null then raise exception 'No such plan "%"', p_plan using errcode = '22023'; end if;
  if p_amount_minor is null or p_amount_minor < 0 then
    raise exception 'A price is a whole number of minor units (cents), and not negative.' using errcode = '22023';
  end if;
  if cur = 'USD' then
    if p_amount_minor between 1 and 99 then
      raise exception 'A dollar price is charged, and the smallest charge is $1.00 (100 cents). Use 0 for "not sold in dollars".'
        using errcode = '22023';
    end if;
    if p_amount_minor = 0 and pl.active and coalesce(pl.price_paise, 0) > 0
       and coalesce((select s.usd_checkout from public.billing_settings s where s.id), false) then
      raise exception '% cannot stop being sold in dollars while checkout in US dollars is on. Turn that switch off first.', pl.name
        using errcode = '22023';
    end if;
    -- A dollar year still running on this plan is credited on an upgrade at
    -- the plan's own price ratio (paid_credit_minor). Withdrawing the dollar
    -- price would leave that ratio with no denominator and refuse every
    -- upgrade, in rupees too. Keep the price until those years have ended.
    if p_amount_minor = 0 and exists (
         select 1 from public.payments x
          where x.plan_id = pl.id and x.currency = 'USD' and x.status = 'paid'
            and x.period = 'year' and x.plan_applied is not false
            and x.ends_at is not null and x.ends_at > now()) then
      raise exception '% has dollar years still running, and an upgrade credits them at this price. Keep a dollar price until they end.', pl.name
        using errcode = '22023', hint = 'usd_years';
    end if;
    if p_amount_minor = 0 and p_next_minor is not null then
      raise exception 'A plan not sold in dollars has no dollar price to rise to.' using errcode = '22023';
    end if;
  end if;

  if p_next_minor is null then
    if p_at is not null then
      raise exception 'A date with no new price changes nothing. The date belongs to the plan, not to the currency.' using errcode = '22023';
    end if;
  else
    if p_next_minor <= p_amount_minor then
      raise exception 'The new price (%) must be ABOVE the current one (%). Telling people a price is about to rise and then not raising it is a prohibited practice, not a marketing choice.',
        p_next_minor, p_amount_minor using errcode = '22023';
    end if;
    if pl.next_price_at is null then
      raise exception 'No rise is scheduled for %. There is ONE date per plan and every currency follows it — schedule the rupee rise with admin_set_next_price() first.',
        pl.name using errcode = '22023';
    end if;
    if p_at is not null and p_at <> pl.next_price_at then
      raise exception 'A currency cannot rise on a date of its own. % rises at %; pass that instant, or null.',
        pl.name, pl.next_price_at using errcode = '22023';
    end if;
  end if;

  select to_jsonb(pp) into v_before from public.plan_prices pp where pp.plan_id = pl.id and pp.currency = cur;

  insert into public.plan_prices (plan_id, currency, amount_minor, next_amount_minor, updated_by)
  values (pl.id, cur, p_amount_minor, p_next_minor, auth.uid())
  on conflict (plan_id, currency) do update
     set amount_minor      = excluded.amount_minor,
         next_amount_minor = excluded.next_amount_minor,
         updated_at        = now(),
         updated_by        = auth.uid();

  perform public.admin_audit_write('set_plan_price', 'plan_price', pl.id || ':' || cur, v_before,
    jsonb_build_object('plan_id', pl.id, 'currency', cur, 'amount_minor', p_amount_minor, 'next_amount_minor', p_next_minor));
  return public.price_notice(cur);
end;
$fn$;

-- 55.13 THE SWITCH ------------------------------------------------------------------------
/** Turn charging in US dollars on or off. Owner only, audited. ON is refused
 *  while any active paid plan lacks a dollar price of at least $1.00. It
 *  cannot see whether Razorpay has approved International payments on the
 *  account — that is the owner's step before pressing it (BILLING §24).
 *  Answers price_notice('USD'), the same read the public makes. */
create or replace function public.admin_set_usd_checkout(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  was     boolean;
  missing text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['owner']);
  if p_on is null then raise exception 'On or off?' using errcode = '22023'; end if;
  select s.usd_checkout into was from public.billing_settings s where s.id;
  if p_on then
    select string_agg(p.name, ', ' order by p.sort) into missing
      from public.plans p
     where p.active and coalesce(p.price_paise, 0) > 0
       and coalesce(public.effective_price_minor(p.id, 'USD'), 0) < 100;
    if missing is not null then
      raise exception 'Every plan on sale needs a dollar price of at least $1.00 before dollars can be charged. Missing: %.', missing
        using errcode = '22023';
    end if;
  end if;
  update public.billing_settings s set usd_checkout = p_on where s.id;
  perform public.admin_audit_write('set_usd_checkout', 'billing_settings', 'usd_checkout',
    jsonb_build_object('usd_checkout', coalesce(was, false)), jsonb_build_object('usd_checkout', p_on), null);
  return public.price_notice('USD');
end;
$fn$;

-- 55.14 THE CONSOLE'S READS -------------------------------------------------------------------
/** §16's overview. paid_total_paise and paid_30d_paise now mean RUPEES ONLY
 *  (every payment so far was INR, so no number moves today); the dollar
 *  side is in paid_by_currency, never added to the rupees. */
create or replace function public.admin_billing_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'paid_30d_paise',  (select coalesce(sum(amount_paise), 0) from public.payments where status = 'paid' and currency = 'INR' and paid_at > now() - interval '30 days'),
    'paid_total_paise',(select coalesce(sum(amount_paise), 0) from public.payments where status = 'paid' and currency = 'INR'),
    'paid_by_currency', (select jsonb_object_agg(c.cur, jsonb_build_object(
                            'total_minor', coalesce((select sum(p.amount_paise) from public.payments p where p.status = 'paid' and p.currency = c.cur), 0),
                            'd30_minor',   coalesce((select sum(p.amount_paise) from public.payments p where p.status = 'paid' and p.currency = c.cur
                                                        and p.paid_at > now() - interval '30 days'), 0),
                            'count',       (select count(*) from public.payments p where p.status = 'paid' and p.currency = c.cur)))
                           from (values ('INR'), ('USD')) c(cur)),
    'payments_30d',    (select count(*) from public.payments where status = 'paid' and paid_at > now() - interval '30 days'),
    'active_by_plan',  (select coalesce(jsonb_object_agg(pl, n), '{}'::jsonb) from (
                          select public.account_plan(a.id) pl, count(*) n from public.accounts a group by 1) t),
    'lapsing_14d',     (select count(*) from public.accounts a where a.plan <> 'free' and a.plan_until between now() and now() + interval '14 days'),
    'refunds',         (select count(*) from public.payments where status = 'refunded'),
    'intl_cards',      (select count(*) from public.payments where status in ('paid', 'refunded') and international is true)
  );
end;
$fn$;

/** The ledger, with each row's currency and where its card was issued. New
 *  columns at the END of the row; a new return type, so drop and create. */
drop function if exists public.admin_list_payments(int);
create or replace function public.admin_list_payments(p_limit int default 200)
returns table (id uuid, email text, account_name text, plan_id text, period text, amount_paise int,
               status text, razorpay_order_id text, razorpay_payment_id text, note text,
               created_at timestamptz, paid_at timestamptz, ends_at timestamptz,
               promo_code text, discount_paise int, list_paise int, credit_paise int,
               currency text, international boolean, card_country text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, a.name, p.plan_id, p.period, p.amount_paise, p.status,
           p.razorpay_order_id, p.razorpay_payment_id, p.note, p.created_at, p.paid_at, p.ends_at,
           p.promo_code, p.discount_paise, p.list_paise, p.credit_paise,
           p.currency, p.international, p.card_country
      from public.payments p
      join auth.users u on u.id = p.user_id
      left join public.accounts a on a.id = p.account_id
     order by p.created_at desc
     limit greatest(1, least(p_limit, 1000));
end;
$fn$;

/** §42's Customer 360, word for word, with two additions for the console's
 *  "Intl card" badge and refunds in the paid currency: each payment carries
 *  `international` and `card_country`, each refund its `currency`.
 *  (Payments and invoices already carried `currency`.) */
create or replace function public.admin_customer(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  u        auth.users;
  m        public.studio_members;
  v_ends   timestamptz;
  v_auth   jsonb;
  v_scopes jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  select * into u from auth.users x where x.id = p_user;
  if u.id is null then raise exception 'No such user' using errcode = '22023'; end if;
  select * into m from public.studio_members x where x.user_id = p_user;
  v_ends := public.trial_ends_at(p_user);

  -- Supabase's own session table is not ours and may refuse us; it is
  -- also absent from a bare PostgreSQL. A missing answer is null, said so.
  begin
    execute $q$
      select jsonb_build_object(
               'count',       count(*),
               'last_active', max(coalesce(s.refreshed_at, s.updated_at, s.created_at)),
               'recent',      coalesce((select jsonb_agg(jsonb_build_object('created_at', r.created_at, 'user_agent', r.user_agent, 'ip', host(r.ip))
                                                          order by r.created_at desc)
                                          from (select * from auth.sessions z where z.user_id = $1 order by z.created_at desc limit 5) r),
                                       '[]'::jsonb))
        from auth.sessions s where s.user_id = $1 $q$
      into v_auth using p_user;
  exception when others then
    v_auth := null;
  end;

  select coalesce(jsonb_agg(jsonb_build_object('scope', t.scope, 'rows', t.n, 'bytes', t.bytes) order by t.bytes desc, t.scope), '[]'::jsonb)
    into v_scopes
    from (select d.scope, count(*) as n, sum(octet_length(d.data::text))::bigint as bytes
            from public.project_data d
            join public.projects pr on pr.id = d.project_id
           where pr.owner_id = p_user
           group by d.scope) t;

  return jsonb_build_object(
    'generated_at', now(),

    'identity', jsonb_build_object(
      'id', u.id, 'email', u.email,
      'name', coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', '')),
      'created_at', u.created_at, 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at),

    'standing', jsonb_build_object(
      'is_member',         m.user_id is not null,
      'role',              m.role,
      'disabled_at',       m.disabled_at,
      'member_since',      m.created_at,
      'plan',              public.user_plan(p_user),
      'entitled',          public.is_entitled(p_user),
      'purchases_required', public.purchases_required(),
      'grandfathered',     coalesce(m.trial_source = 'admin' and m.trial_minutes >= 525600, false),
      'admitted_by',       (select jsonb_build_object('pass_type', c.pass_type, 'label', c.label)
                              from public.invite_codes c where c.id = m.invite_code_id),
      'email_grant',       (select jsonb_build_object('role', g.role, 'plan', g.plan, 'until', g.until,
                                                      'applied', g.applied_user is not null, 'applied_plan', g.applied_plan)
                              from public.email_grants g where g.email = lower(u.email))),

    'trial', jsonb_build_object(
      'started_at',   m.trial_started_at,
      'minutes',      m.trial_minutes,
      'source',       m.trial_source,
      'scope',        m.trial_scope,
      'ends_at',      v_ends,
      'active',       public.trial_active(p_user),
      'seconds_left', case when v_ends is null then null else greatest(0, floor(extract(epoch from (v_ends - now()))))::bigint end),

    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'plan_id', p.plan_id, 'period', p.period, 'status', p.status,
                  'amount_paise', p.amount_paise, 'currency', p.currency, 'discount_paise', p.discount_paise,
                  'credit_paise', p.credit_paise, 'promo_code', p.promo_code,
                  'razorpay_order_id', p.razorpay_order_id, 'razorpay_payment_id', p.razorpay_payment_id,
                  'note', p.note, 'created_at', p.created_at, 'paid_at', p.paid_at,
                  'international', p.international, 'card_country', p.card_country) order by p.created_at desc)
                  from (select * from public.payments x where x.user_id = p_user order by x.created_at desc limit 100) p), '[]'::jsonb),

    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', i.id, 'number', i.number, 'payment_id', i.payment_id, 'plan_name', i.plan_name,
                  'amount_paise', i.amount_paise, 'currency', i.currency, 'issued_at', i.issued_at,
                  'emailed_at', i.emailed_at) order by i.issued_at desc)
                  from public.invoices i where i.user_id = p_user), '[]'::jsonb),

    'refunds', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', r.id, 'payment_id', r.payment_id, 'amount_paise', r.amount_paise, 'status', r.status,
                  'reason', r.reason, 'created_at', r.created_at, 'processed_at', r.processed_at,
                  'currency', r.currency) order by r.created_at desc)
                  from public.refunds r join public.payments p on p.id = r.payment_id where p.user_id = p_user), '[]'::jsonb),

    'refund_requests', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', q.id, 'payment_id', q.payment_id, 'category', q.category, 'message', q.message,
                  'status', q.status, 'admin_note', q.admin_note, 'created_at', q.created_at, 'decided_at', q.decided_at)
                  order by q.created_at desc)
                  from public.refund_requests q where q.user_id = p_user), '[]'::jsonb),

    'referral', jsonb_build_object(
      'code',    (select c.code from public.promo_codes c where c.kind = 'referral' and c.owner_user_id = p_user),
      'credits', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', rc.id, 'payment_id', rc.payment_id, 'amount_paise', rc.amount_paise, 'status', rc.status,
                    'created_at', rc.created_at, 'paid_at', rc.paid_at) order by rc.created_at desc)
                    from public.referral_credits rc where rc.referrer_user_id = p_user), '[]'::jsonb)),

    'sessions', jsonb_build_object(
      'device_lock', (select jsonb_build_object('last_heartbeat', s.last_heartbeat, 'client_ip', s.client_ip, 'user_agent', s.user_agent)
                        from public.user_active_sessions s where s.user_id = p_user),
      'auth',        v_auth),

    'redemptions', coalesce((select jsonb_agg(jsonb_build_object(
                    'pass_type', c.pass_type, 'label', c.label, 'redeemed_at', rd.redeemed_at) order by rd.redeemed_at desc)
                    from public.invite_redemptions rd join public.invite_codes c on c.id = rd.code_id
                   where rd.user_id = p_user), '[]'::jsonb),

    'work', jsonb_build_object(
      'projects',      (select count(*) from public.projects pr where pr.owner_id = p_user),
      'formats',       coalesce((select jsonb_object_agg(f.format, f.n)
                                   from (select pr.format, count(*) as n from public.projects pr where pr.owner_id = p_user group by pr.format) f), '{}'::jsonb),
      'scopes',        v_scopes,
      'total_bytes',   coalesce((select sum((e ->> 'bytes')::bigint) from jsonb_array_elements(v_scopes) e), 0),
      'last_sync',     (select max(d.updated_at) from public.project_data d join public.projects pr on pr.id = d.project_id where pr.owner_id = p_user),
      'collaborating_on', (select count(*) from public.project_collaborators pc where pc.user_id = p_user),
      'shares_created',   (select count(*) from public.shares sh where sh.created_by = p_user)),

    'orgs', jsonb_build_object(
      'owned',  coalesce((select jsonb_agg(jsonb_build_object(
                    'id', a.id, 'name', a.name, 'plan', a.plan, 'plan_until', a.plan_until, 'seat_limit', a.seat_limit,
                    'storage_limit_mb', a.storage_limit_mb,
                    'seats_used', (select count(*) from public.account_members am where am.account_id = a.id and am.status = 'active'))
                    order by a.created_at)
                    from public.accounts a where a.owner_id = p_user), '[]'::jsonb),
      'member_of', coalesce((select jsonb_agg(jsonb_build_object(
                    'account_id', am.account_id, 'name', a.name, 'role', am.role, 'status', am.status, 'joined_at', am.joined_at)
                    order by am.created_at)
                    from public.account_members am join public.accounts a on a.id = am.account_id
                   where am.user_id = p_user and a.owner_id <> p_user), '[]'::jsonb)),

    'notes', public.admin_list_notes(p_user),

    'audit', coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc)
                         from (select au.* from public.admin_audit au
                                where (au.target_kind = 'user' and au.target_id = p_user::text)
                                   or au.after  ->> 'user_id' = p_user::text
                                   or au.before ->> 'user_id' = p_user::text
                                order by au.at desc, au.id desc limit 20) x), '[]'::jsonb)
  );
end;
$fn$;

-- 55.14b MONEY READS THAT STILL ADDED CENTS TO PAISE ----------------------------------------
/** §23's affiliate report. A percent-off code works on a dollar order, so
 *  one code's ledger can hold both currencies, and summing amount_paise
 *  across them added cents to paise. The existing columns now mean RUPEES
 *  ONLY (every order so far was INR, so no figure moves today) and the
 *  dollar side is its own four columns. orders counts every paid order,
 *  in either currency. The return type changed, so this is a drop. */
drop function if exists public.admin_affiliate_report();
create or replace function public.admin_affiliate_report()
returns table (code text, note text, commission_pct numeric, active boolean, percent_off int, amount_off_paise int,
               orders int, revenue_paise bigint, discount_paise bigint, commission_due_paise bigint,
               refunded int, last_order_at timestamptz,
               usd_orders int, usd_revenue_minor bigint, usd_discount_minor bigint, usd_commission_due_minor bigint)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select c.code, c.note, c.commission_pct, c.active, c.percent_off, c.amount_off_paise,
           count(p.id) filter (where p.status = 'paid')::int,
           coalesce(sum(p.amount_paise) filter (where p.status = 'paid' and p.currency = 'INR'), 0)::bigint,
           coalesce(sum(p.discount_paise) filter (where p.status = 'paid' and p.currency = 'INR'), 0)::bigint,
           floor(coalesce(sum(p.amount_paise) filter (where p.status = 'paid' and p.currency = 'INR'), 0) * c.commission_pct / 100)::bigint,
           count(p.id) filter (where p.status = 'refunded')::int,
           max(p.paid_at) filter (where p.status = 'paid'),
           count(p.id) filter (where p.status = 'paid' and p.currency = 'USD')::int,
           coalesce(sum(p.amount_paise) filter (where p.status = 'paid' and p.currency = 'USD'), 0)::bigint,
           coalesce(sum(p.discount_paise) filter (where p.status = 'paid' and p.currency = 'USD'), 0)::bigint,
           floor(coalesce(sum(p.amount_paise) filter (where p.status = 'paid' and p.currency = 'USD'), 0) * c.commission_pct / 100)::bigint
      from public.promo_codes c
      left join public.payments p on p.promo_code = c.code
     where c.commission_pct is not null
     group by c.code
     order by c.active desc, 8 desc, c.code;
end;
$fn$;

/** §23's order list, with each row's currency (amounts are minor units of it). */
drop function if exists public.admin_affiliate_orders(text);
create or replace function public.admin_affiliate_orders(p_code text)
returns table (paid_at timestamptz, email text, plan_id text, list_paise int, discount_paise int, amount_paise int, status text, currency text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select p.paid_at, u.email::text, p.plan_id, p.list_paise, p.discount_paise, p.amount_paise, p.status, p.currency
      from public.payments p
      left join auth.users u on u.id = p.user_id
     where p.promo_code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
       and p.status in ('paid', 'refunded')
     order by p.paid_at desc nulls last
     limit 500;
end;
$fn$;

/** §27's member read, word for word, with the payment's currency on the
 *  payment object: Settings prints the amount in it. */
create or replace function public.my_refund_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare me uuid := auth.uid(); pay public.payments; q public.refund_requests; en boolean; busy boolean;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  en := public.refund_requests_enabled();
  select * into pay from public.payments p
   where p.user_id = me and p.status = 'paid' and p.amount_paise > 0
   order by p.paid_at desc nulls last, p.created_at desc limit 1;
  select * into q from public.refund_requests r where r.user_id = me order by r.created_at desc limit 1;
  busy := pay.id is not null and (
       exists (select 1 from public.refunds f where f.payment_id = pay.id and f.status in ('initiated','pending','processed'))
    or exists (select 1 from public.refund_requests r where r.payment_id = pay.id and r.status in ('pending','approved')));
  return jsonb_build_object(
    'enabled', en,
    'eligible', en and pay.id is not null,
    'can_request', en and pay.id is not null and not busy,
    'payment', case when pay.id is null then null else jsonb_build_object('id', pay.id, 'plan_id', pay.plan_id, 'amount_paise', pay.amount_paise,
                'amount_minor', pay.amount_paise, 'currency', pay.currency, 'paid_at', pay.paid_at) end,
    'latest', case when q.id is null then null else jsonb_build_object('id', q.id, 'status', q.status, 'category', q.category, 'message', q.message,
                'admin_note', q.admin_note, 'created_at', q.created_at, 'decided_at', q.decided_at, 'payment_id', q.payment_id) end
  );
end;
$fn$;

/** §27's console list, with the payment's currency on each row, so the
 *  console need not find the payment in its latest 200 ledger rows. */
drop function if exists public.admin_list_refund_requests(text);
create or replace function public.admin_list_refund_requests(p_status text default null)
returns table (id uuid, email text, payment_id uuid, plan_id text, amount_paise int, razorpay_payment_id text, payment_status text,
               category text, message text, status text, admin_note text, created_at timestamptz, decided_at timestamptz, currency text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select q.id, u.email::text, q.payment_id, p.plan_id, p.amount_paise, p.razorpay_payment_id, p.status,
           q.category, q.message, q.status, q.admin_note, q.created_at, q.decided_at, p.currency
      from public.refund_requests q
      join public.payments p on p.id = q.payment_id
      join auth.users u on u.id = q.user_id
     where p_status is null or q.status = p_status
     order by (q.status = 'pending') desc, q.created_at desc
     limit 500;
end;
$fn$;

-- 55.15 GRANTS ----------------------------------------------------------------------------
revoke execute on function public.quote_order(text, text)                                  from public;
revoke execute on function public.quote_order(text, text, text)                            from public;
revoke execute on function public.price_notice(text)                                       from public;
revoke execute on function public.admin_set_plan_price(text, text, int, int, timestamptz)  from public, anon;
revoke execute on function public.admin_set_usd_checkout(boolean)                          from public, anon;
revoke execute on function public.admin_billing_overview()                                 from public, anon;
revoke execute on function public.admin_list_payments(int)                                 from public, anon;
revoke execute on function public.admin_customer(uuid)                                     from public, anon;
revoke execute on function public.admin_affiliate_report()                                 from public, anon;
revoke execute on function public.admin_affiliate_orders(text)                             from public, anon;
revoke execute on function public.my_refund_status()                                       from public, anon;
revoke execute on function public.admin_list_refund_requests(text)                         from public, anon;
grant  execute on function public.quote_order(text, text)                                  to anon, authenticated;
grant  execute on function public.quote_order(text, text, text)                            to anon, authenticated;
grant  execute on function public.price_notice(text)                                       to anon, authenticated;
grant  execute on function public.admin_set_plan_price(text, text, int, int, timestamptz)  to authenticated;
grant  execute on function public.admin_set_usd_checkout(boolean)                          to authenticated;
grant  execute on function public.admin_billing_overview()                                 to authenticated;
grant  execute on function public.admin_list_payments(int)                                 to authenticated;
grant  execute on function public.admin_customer(uuid)                                     to authenticated;
grant  execute on function public.admin_affiliate_report()                                 to authenticated;
grant  execute on function public.admin_affiliate_orders(text)                             to authenticated;
grant  execute on function public.my_refund_status()                                       to authenticated;
grant  execute on function public.admin_list_refund_requests(text)                         to authenticated;

notify pgrst, 'reload schema';

-- 55.16 CHECKS TO RUN LIVE (read-only) ------------------------------------------------------
-- select pg_get_function_identity_arguments('public.quote_for'::regproc);
--   -> p_user uuid, p_plan text, p_code text, p_account uuid, p_currency text
-- select count(*) from pg_proc where proname = 'create_pending_payment';            -> 1 (six arguments)
-- select count(*) from pg_proc where proname = 'quote_order';                       -> 2
-- select public.price_notice('USD') ->> 'charged_currency', public.price_notice('USD') -> 'usd_checkout';
--   -> INR, false (until the owner turns it on)
-- select public.price_notice() ? 'plans';                                            -> true (the zero-argument form is untouched)
-- select conname from pg_constraint where conname in ('payments_currency_check', 'refunds_currency_check'); -> two rows
-- select usd_checkout from public.billing_settings where id;                         -> false
