-- RUN: owner, in the Supabase SQL editor, AFTER §60 (it restates §56's
--      quote_for, create_pending_payment, activation_refusal,
--      activate_payment, claim_refund_email, payments_referral_after and
--      price_notice(text), §53's unapplied_sentence, mark_payment_refunded
--      and billing_status, §52's apply_plan, §34's payments_refund_trial,
--      §30's paid_buyers, §58's events name list and §60's start_trial and
--      trial_offer). Hash the file first
--      (shasum -a 256 supabase/schema/schema-61-week-pass.sql) and compare
--      it with the editor's contents before pressing Run (docs/LAUNCH.md §4;
--      the checksum is in docs/LIVE-STEPS-2026-10-27.md). Re-runnable.
--      REDEPLOY all four functions afterwards, with the CLI (the shared
--      razorpay.js and mail.js changed; docs/BILLING.md §25). Read back with
--      61.16 below; the two-account checks are docs/SECURITY-RLS.md §61.
-- ============================================================
-- 61. THE LAUNCH WEEK PASS — a paid week of the whole studio
-- ------------------------------------------------------------
-- Owner decisions, 27 Oct 2026:
--
--   * A LAUNCH OFFER, NOT A STANDING PRODUCT. The public free trial is
--     retired; in its place a visitor can buy a short pass (₹49 for 7 days
--     today) of the whole studio. The price, the length, the deadline and
--     an optional cap are the OWNER's, set in the console
--     (admin_set_pass), and every page reads them from the server
--     (trial_offer().pass / price_notice(text).pass). Nothing is typed into
--     a page and nothing here hard-codes ₹49 beyond the column default.
--
--   * A REAL DEADLINE AND A REAL CAP. pass_ends_at is when the offer ends
--     for everybody; pass_cap (off unless set) is how many passes can be
--     sold. pass_open() is the one predicate, and quote_pass() refuses
--     (hint 'closed') the instant either is reached, so the countdown and
--     the "N left" on the pages are TRUE: the deadline closes the offer on
--     the server, and "left" is the count of paid passes. A pass that was
--     already PAID when the cap filled is still activated — a buyer who
--     paid is never refused.
--
--   * ONCE PER PERSON. A paid OR refunded pass (paid_at is set) means
--     quote_pass refuses 'used'. A refund is not a way to a second week.
--
--   * NO CREDIT. The pass is a purchase of its own. A yearly plan bought
--     while a pass runs is priced at its full price, starts now and
--     REPLACES the pass: quote_for and activate_payment treat a running
--     pass (accounts.plan_period = 'pass') as no plan at all — no
--     downgrade refusal, no upgrade credit, no stacking. paid_credit_minor
--     (§56) already counts only period 'year', so no credit can come from
--     a pass by any route.
--
--   * THE PASS IS PRO, SOLD FOR A WEEK. Not a new plan tier (that would
--     touch four CHECKs, plan_rank, the matrix, §36 and every card): it is
--     period 'pass' on the plan billing_settings.pass_plan names ('pro'),
--     priced from billing_settings.pass_paise, in RUPEES ONLY (hint
--     'inr_only'), never with a promo code (hint 'code').
--
--   * THE FREE TRIAL IS NO LONGER OFFERED, AND trial_enabled IS NOT
--     TOUCHED. While pass_enabled is on, start_trial() refuses a pressed
--     ('signup') trial with {started: false, reason: 'pass'}. Code trials
--     (an invite code's seven days), administrator trials and the §34
--     refund trial are unchanged. billing_settings.trial_enabled stays
--     TRUE on purpose: trial_active() reads it for EVERY trial row,
--     including the §30 grandfather backfill (a year of 'admin' trial for
--     everybody who was a member before §30). Setting it false would wall
--     those members the same second. Do not.
--
--   * KEPT OUT OF THE PASS: the founding-seat count (paid_buyers(), which
--     also drives the price rise), the referral payout trigger, and the §34
--     refund trial (a refunded pass gives no free trial).
--
-- THE REFUSALS. quote_pass(user, account, currency) raises the way
-- quote_for always has: SQLSTATE 22023, the buyer's sentence as the
-- message and a machine reason in the HINT:
--     disabled   the pass is switched off
--     closed     the deadline has passed or the cap is reached
--     inr_only   the currency is not INR
--     used       this person already has a paid or refunded pass
--     has_plan   this person has a current plan that is not a pass
-- create_pending_payment adds 'code' (a promo code on a pass order).
-- rzp-order answers 400 { error: <sentence>, reason: <hint> }.
-- If a yearly plan is bought between a pass ORDER and its payment, the
-- pass is not applied over it: activation_refusal answers 'has_plan', so
-- rzp-verify does not capture the authorisation (Razorpay releases it)
-- and a captured one is recorded unapplied and refundable (§53's path).
--
--   61.0  preconditions
--   61.1  billing_settings: the six pass columns
--   61.2  the period CHECKs, unapplied_reason, events learn the pass
--   61.3  pass_sold(), pass_open(), pass_block()
--   61.4  paid_buyers(): no pass
--   61.5  apply_plan: plan_period 'pass'; a pass never stacks
--   61.6  quote_pass(user, account, currency)
--   61.7  quote_for: a running pass is no plan
--   61.8  create_pending_payment: p_period 'pass'
--   61.9  activation_refusal, unapplied_sentence, activate_payment
--   61.10 mark_payment_refunded, the §34 refund trial, the referral payout
--   61.11 claim_refund_email: the payment's period and dates; invoices.period
--   61.12 start_trial: no pressed trial while the pass is on
--   61.13 trial_offer, price_notice(text), billing_status
--   61.14 admin_pass_status(), admin_set_pass()
--   61.15 grants
--   61.16 CHECKS TO RUN LIVE (read-only)
-- ============================================================

-- 61.0 PRECONDITIONS ------------------------------------------------------
do $guard$
begin
  if to_regprocedure('public.effective_price_minor(text,text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'usd_checkout') then
    raise exception 'Section 61 needs section 56 (charging in US dollars) first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices' and column_name = 'valid_until') then
    raise exception 'Section 61 needs section 57 (invoices.valid_until) first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'source') then
    raise exception 'Section 61 needs section 58 (events.source) first.';
  end if;
  if to_regprocedure('public.require_role(text[])') is null
     or to_regprocedure('public.admin_audit_write(text,text,text,jsonb,jsonb,text)') is null then
    raise exception 'Section 61 needs sections 40 and 45 (admin_audit_write, require_role) first.';
  end if;
  if position('§60' in pg_get_functiondef('public.start_trial(text)'::regprocedure)) = 0 then
    raise exception 'Section 61 needs section 60 (start_trial follows the trial scope) first.';
  end if;
end
$guard$;

-- 61.1 THE SIX COLUMNS ----------------------------------------------------
-- Off by default: the pass is offered only once the owner turns it on.
alter table public.billing_settings add column if not exists pass_enabled boolean     not null default false;
alter table public.billing_settings add column if not exists pass_paise   int         not null default 4900;
alter table public.billing_settings add column if not exists pass_days    int         not null default 7;
alter table public.billing_settings add column if not exists pass_plan    text        not null default 'pro';
alter table public.billing_settings add column if not exists pass_ends_at timestamptz;
alter table public.billing_settings add column if not exists pass_cap     int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_pass_paise_check') then
    alter table public.billing_settings add constraint billing_settings_pass_paise_check check (pass_paise >= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_pass_days_check') then
    alter table public.billing_settings add constraint billing_settings_pass_days_check check (pass_days between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_pass_cap_check') then
    alter table public.billing_settings add constraint billing_settings_pass_cap_check check (pass_cap is null or pass_cap > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_pass_plan_fkey') then
    alter table public.billing_settings add constraint billing_settings_pass_plan_fkey foreign key (pass_plan) references public.plans(id);
  end if;
end $$;

-- 61.2 THE CHECKS LEARN THE PASS ---------------------------------------------
-- Dropped and re-added, so a re-run converges on the same constraint.
alter table public.payments drop constraint if exists payments_period_check;
alter table public.payments add constraint payments_period_check
  check (period in ('month','year','grant','lifetime','pass'));
alter table public.accounts drop constraint if exists accounts_plan_period_check;
alter table public.accounts add constraint accounts_plan_period_check
  check (plan_period in ('month','year','grant','lifetime','pass'));
-- §53's reasons, plus a pass that a yearly plan overtook before it was paid
alter table public.payments drop constraint if exists payments_unapplied_reason_check;
alter table public.payments add constraint payments_unapplied_reason_check
  check (unapplied_reason is null or unapplied_reason in ('exhausted', 'credit_gone', 'has_plan'));

-- §58's ten step names, plus pass_buy. RE-RUNNING §58 AFTER THIS would drop
-- pass_buy from the check and fail on the rows that carry it; re-run §61
-- after any re-run of §58.
alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'landing_view','pricing_view','invite_request','signup','checkout_start','purchase',
  'trial_start','sample_open','signin_done','plan_view_in_app','pass_buy'));

create or replace function public.funnel_event_names()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['landing_view','pricing_view','invite_request','signup','signin_done',
               'sample_open','trial_start','plan_view_in_app','checkout_start','pass_buy','purchase']::text[];
$$;

-- 61.3 THE OFFER ---------------------------------------------------------------
/** Passes sold: paid, not refunded. What the cap counts and "left" shows. */
create or replace function public.pass_sold()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.payments p where p.period = 'pass' and p.status = 'paid';
$$;

/** THE ONE PREDICATE: switched on, before the deadline, under the cap. */
create or replace function public.pass_open()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select s.pass_enabled
       and (s.pass_ends_at is null or now() < s.pass_ends_at)
       and (s.pass_cap is null or public.pass_sold() < s.pass_cap)
      from public.billing_settings s where s.id), false);
$$;

/** The public `pass` block of trial_offer() and price_notice(text). The
 *  client contract is src/lib/pass-offer.js readPass(): open, amount_paise,
 *  days, plan, ends_at, cap, left (cap - sold, never below 0; null with no
 *  cap) and now (the server's clock, so a countdown never trusts the
 *  visitor's). Switched off it still says the amount and the days, with
 *  open false, which the client reads as "no offer". */
create or replace function public.pass_block()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'open',         public.pass_open(),
    'amount_paise', coalesce(s.pass_paise, 4900),
    'days',         coalesce(s.pass_days, 7),
    'plan',         coalesce(s.pass_plan, 'pro'),
    'ends_at',      s.pass_ends_at,
    'cap',          s.pass_cap,
    'left',         case when s.pass_cap is not null then greatest(s.pass_cap - public.pass_sold(), 0) end,
    'now',          now())
    from (select 1) one
    left join public.billing_settings s on s.id;
$$;

-- 61.4 paid_buyers: a pass takes no founding seat ------------------------------
/** §30's count of buyers, which the founding-seat cap and the price rise
 *  read: paid, more than nothing, and (§61) not a pass. */
create or replace function public.paid_buyers()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct p.user_id)::int
    from public.payments p
   where p.status = 'paid' and p.amount_paise > 0
     and p.period is distinct from 'pass';   -- §61: a pass takes no founding seat
$$;

revoke execute on function public.paid_buyers() from public, anon, authenticated;

-- 61.5 apply_plan: §52's body; plan_period 'pass', and a pass never stacks ------------
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
  if a.plan = p_plan and a.plan_until is not null and a.plan_until > now()
     -- §61: a pass never stacks, and a year bought over a running pass starts now
     and p_period is distinct from 'pass' and a.plan_period is distinct from 'pass' then
    start := a.plan_until;                       -- a renewal stacks
  end if;
  until := start + make_interval(days => p_days);
  update public.accounts x
     set plan = p_plan, plan_until = until,
         plan_period = case when p_period = 'grant' then 'grant' when p_period = 'pass' then 'pass' else 'year' end,   -- §61
         seat_limit = greatest(1, coalesce(public.plan_cap(lim, 'seats'), 1000)),
         updated_at = now()
   where x.id = p_account;
  return until;
end;
$fn$;
revoke execute on function public.apply_plan(uuid, text, text, int) from public, anon, authenticated;

-- 61.6 quote_pass ----------------------------------------------------------------
/** The price of a pass for this person, or a refusal raised the way
 *  quote_for refuses: 22023, the sentence as the message, the reason in
 *  the HINT (disabled | closed | inr_only | used | has_plan). The cap is
 *  counted under a transaction lock (§54's pattern), so two orders being
 *  created at the same moment read the count one after the other. It does
 *  not reserve a pass: "left" counts PAID passes, and a pass paid after
 *  the cap filled is still activated. */
create or replace function public.quote_pass(p_user uuid, p_account uuid default null, p_currency text default 'INR')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s   public.billing_settings;
  cur text := upper(btrim(coalesce(p_currency, 'INR')));
  tgt uuid;
begin
  select * into s from public.billing_settings x where x.id;
  if not coalesce(s.pass_enabled, false) then
    raise exception 'The launch pass is not on offer at the moment. You can choose a yearly plan.'
      using errcode = '22023', hint = 'disabled';
  end if;
  if s.pass_ends_at is not null and now() >= s.pass_ends_at then
    raise exception 'The launch offer has ended. You can choose a yearly plan.'
      using errcode = '22023', hint = 'closed';
  end if;
  if cur <> 'INR' then
    raise exception 'The launch pass is sold in rupees (INR) only.'
      using errcode = '22023', hint = 'inr_only';
  end if;
  if p_user is not null then
    -- paid_at, not status: a refunded pass counts, so a refund is not a second week
    if exists (select 1 from public.payments p where p.user_id = p_user and p.period = 'pass' and p.paid_at is not null) then
      raise exception 'The launch pass is once per person, and this account has already had it. You can choose a yearly plan.'
        using errcode = '22023', hint = 'used';
    end if;
    if exists (select 1 from public.accounts a
                where a.owner_id = p_user
                  and public.account_plan(a.id) <> 'free'
                  and a.plan_period is distinct from 'pass') then
      raise exception 'You already have a plan, so the launch pass would add nothing.'
        using errcode = '22023', hint = 'has_plan';
    end if;
    tgt := public.buyer_target_account(p_user, p_account);
  end if;
  if s.pass_cap is not null then
    perform pg_advisory_xact_lock(hashtext('fms:cap:pass'));
    if public.pass_sold() >= s.pass_cap then
      raise exception 'The launch passes have all been taken. You can choose a yearly plan.'
        using errcode = '22023', hint = 'closed';
    end if;
  end if;
  return jsonb_build_object('plan', s.pass_plan, 'plan_id', s.pass_plan,
                            'period', 'pass', 'days', s.pass_days,
                            'currency', 'INR',
                            'amount_paise', s.pass_paise, 'amount_minor', s.pass_paise,
                            'list_paise', s.pass_paise, 'list_minor', s.pass_paise,
                            'discount_paise', 0, 'credit_paise', 0,
                            'account_id', tgt, 'ends_at', s.pass_ends_at);
end;
$fn$;
revoke execute on function public.quote_pass(uuid, uuid, text) from public, anon, authenticated;

-- 61.7 quote_for: §56's body; a running pass is no plan ----------------------------
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
      -- §61: a running pass is no plan: no renewal, no downgrade refusal, no credit
      if exists (select 1 from public.accounts a where a.id = tgt and a.plan_period = 'pass') then
        cur_pl := 'free'; cur_until := null;
      end if;
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
    -- §56: a flat amount off is a rupee amount; it is never read as cents
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

-- 61.8 create_pending_payment: §56's body; p_period 'pass' -----------------------------
-- The year path around the marked block is §56's, byte for byte.
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
  pq  jsonb;   -- §61
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  -- §61: the pass. p_plan is ignored (the pass is billing_settings.pass_plan),
  -- a code is refused, and quote_pass raises its own refusals.
  if p_period = 'pass' then
    if nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '') is not null then
      raise exception 'Codes do not apply to the launch pass.' using errcode = '22023', hint = 'code';
    end if;
    if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
      raise exception 'Not the owner of that organisation' using errcode = '42501';
    end if;
    pq := public.quote_pass(p_user, p_account, cur);
    insert into public.payments (user_id, account_id, plan_id, period, amount_paise, currency, list_paise, discount_paise, promo_code, credit_paise)
    values (p_user, (pq ->> 'account_id')::uuid, pq ->> 'plan_id', 'pass', (pq ->> 'amount_minor')::int, 'INR',
            (pq ->> 'list_minor')::int, 0, null, 0)
    returning id into pid;
    return query select pid, (pq ->> 'amount_minor')::int, 'INR'::text,
                        coalesce((select x.name from public.plans x where x.id = pq ->> 'plan_id'), initcap(pq ->> 'plan_id')),
                        (pq ->> 'list_minor')::int, 0, null::text, 0;
    return;
  end if;
  -- end §61
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

-- 61.9 activation: §56's refusal, §53's sentence, §56's activate_payment -----------------
create or replace function public.activation_refusal(p_pay public.payments, p_account uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare pc public.promo_codes;
begin
  -- §61: a pass is not laid over a plan bought after it was ordered
  if p_pay.period = 'pass'
     and exists (select 1 from public.accounts a
                  where a.owner_id = p_pay.user_id
                    and public.account_plan(a.id) <> 'free'
                    and a.plan_period is distinct from 'pass') then
    return 'has_plan';
  end if;
  if p_pay.promo_code is not null then
    select * into pc from public.promo_codes c where c.code = p_pay.promo_code;
    if pc.max_uses is not null and pc.uses >= pc.max_uses then return 'exhausted'; end if;
  end if;
  -- §52's slack: the credit shrinks by the minute; an order is good for an hour.
  -- §56: counted in the order's own currency (a credit that can no longer be
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

create or replace function public.unapplied_sentence(p_reason text, p_code text default null)
returns text
language sql
immutable
as $$
  select case p_reason
    when 'exhausted'   then format('The code %s was used up before this payment was confirmed, so the plan was not applied.', coalesce(p_code, 'on this order'))
    when 'credit_gone' then 'This order was priced with credit for a payment that no longer counts, so the plan was not applied.'
    when 'has_plan'    then 'A plan was bought on this account after the launch pass was ordered, so the pass was not applied.'   -- §61
    else 'This order can no longer be applied.'
  end;
$$;
revoke execute on function public.unapplied_sentence(text, text) from public, anon, authenticated;
grant  execute on function public.unapplied_sentence(text, text) to service_role;

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
  days  int := 365;   -- §61: a pass's days come from billing_settings
begin
  perform public.billing_require_service();
  select o.international, o.card_country into intl, ctry from public.payment_card_origin(p_raw) o;
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    -- §56: the later of verify and the webhook may carry the card's origin
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
  -- §56: the money must be in the currency the order was priced in
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
  -- §61: a pass is applied whenever it is not refused (a paid pass is never
  -- refused for the cap); a year bought over a running pass outranks nothing
  if pay.period = 'pass' then
    days := coalesce((select s.pass_days from public.billing_settings s where s.id), 7);
    applied := why is null;
    if applied then
      until := public.apply_plan(acc, pay.plan_id, 'pass', days);
    end if;
  else
  applied := why is null and public.plan_rank(pay.plan_id) >= public.plan_rank(
               case when exists (select 1 from public.accounts a where a.id = acc and a.plan_period = 'pass') then 'free'
                    else public.account_plan(acc) end);
  if applied then
    until := public.apply_plan(acc, pay.plan_id, 'year', 365);
  end if;
  end if;
  -- end §61
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc,
         starts_at = case when applied then until - make_interval(days => days) else now() end,   -- §61
         ends_at   = case when applied then until end,
         period = case when pay.period = 'pass' then 'pass' else 'year' end,   -- §61
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

-- 61.10 REFUNDS AND REFERRALS ------------------------------------------------------------
-- §53's mark_payment_refunded; §34's refund trial (a refunded pass gives none);
-- §56's referral payout (a pass earns its referrer nothing; quote_pass
-- refuses a code anyway, this is the second guard).
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
  -- §53: it bought no time (a code used up, a credit gone, a lower plan in
  -- a race), so refunding it must not shorten the year another payment bought
  if pay.plan_applied is false then return; end if;
  -- §61: a pass's week comes off only while the account is still on that pass;
  -- a year bought over it replaced the pass, and refunding the pass must not
  -- shorten that year
  if pay.period = 'pass'
     and not exists (select 1 from public.accounts a where a.id = pay.account_id and a.plan_period = 'pass') then
    return;
  end if;
  perform set_config('fms.billing', 'on', true);
  if pay.starts_at is not null and pay.ends_at is not null and pay.ends_at > pay.starts_at then
    update public.accounts a
       set plan_until = greatest(now(), a.plan_until - (pay.ends_at - pay.starts_at)),
           updated_at = now()
     where a.id = pay.account_id and a.plan = pay.plan_id and a.plan_until is not null;
  else
    update public.accounts a set plan_until = least(a.plan_until, now()), updated_at = now()
     where a.id = pay.account_id and a.plan = pay.plan_id;
  end if;
  update public.accounts a set seat_limit = least(a.seat_limit, free_seats)
   where a.id = pay.account_id and a.plan = pay.plan_id and a.plan_until is not null and a.plan_until <= now();
end;
$fn$;
revoke execute on function public.mark_payment_refunded(text, jsonb) from public, anon, authenticated;

create or replace function public.payments_refund_trial()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s public.billing_settings;
begin
  if new.status is distinct from 'refunded' or old.status is not distinct from 'refunded' then return null; end if;
  if new.user_id is null then return null; end if;
  if new.period = 'pass' then return null; end if;   -- §61: a refunded pass gives no trial
  begin
    -- at commit: the refunded plan has ended, so anything left is another plan
    if public.user_plan(new.user_id) <> 'free' then return null; end if;
    select * into s from public.billing_settings x where x.id;
    insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
    values (new.user_id, 'user', now(), coalesce(s.trial_minutes, 30), 'refund', coalesce(s.trial_scope, 'sample'))
    on conflict (user_id) do update
       set trial_started_at = now(),
           trial_minutes    = excluded.trial_minutes,
           trial_source     = 'refund',
           trial_scope      = excluded.trial_scope;
  exception when others then
    raise warning 'refund trial for % not started: %', new.user_id, sqlerrm;
  end;
  return null;
end;
$fn$;
drop trigger if exists payments_refund_trial on public.payments;
create constraint trigger payments_refund_trial
  after update of status on public.payments
  deferrable initially deferred
  for each row execute function public.payments_refund_trial();

revoke execute on function public.payments_refund_trial() from public, anon, authenticated;

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
    if new.promo_code is not null and new.currency = 'INR' and new.period is distinct from 'pass' then   -- §61
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

-- 61.11 THE E-MAILS KNOW A PASS ----------------------------------------------------------
-- mail.js words a receipt and a refund by the payment's period and prints
-- the dates the row says. The receipt claim is `setof invoices`, so
-- invoices gains `period`, copied by §57's trigger with the other payment
-- facts (my_invoices() and admin_list_invoices() carry it with no
-- restatement). The refund claim returns the payment's period and its own
-- starts_at / ends_at: a new column in RETURNS TABLE is a new return type,
-- so it is dropped and created; the deployed mail.js ignores what it does
-- not know.
alter table public.invoices add column if not exists period text;

create or replace function public.invoices_payment_facts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  select p.razorpay_payment_id, p.razorpay_order_id, p.paid_at,
         case when p.ends_at is not null then p.starts_at end, p.ends_at,
         p.period   -- §61
    into new.razorpay_payment_id, new.razorpay_order_id, new.paid_at,
         new.valid_from, new.valid_until,
         new.period
    from public.payments p where p.id = new.payment_id;
  return new;
end;
$fn$;
revoke execute on function public.invoices_payment_facts() from public, anon, authenticated;
drop trigger if exists invoices_payment_facts on public.invoices;
create trigger invoices_payment_facts before insert on public.invoices
  for each row execute function public.invoices_payment_facts();

-- once: invoices issued before this section take their payment's period
update public.invoices i set period = p.period
  from public.payments p
 where p.id = i.payment_id and i.period is null;

drop function if exists public.claim_refund_email(text, text);
create or replace function public.claim_refund_email(p_rzp_refund text, p_status text)
returns table (refund_id uuid, status text, amount_paise int, razorpay_refund_id text,
               buyer_email text, buyer_name text, plan_name text, invoice_number text, currency text,
               period text, starts_at timestamptz, ends_at timestamptz)   -- §61
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
           p.currency,
           p.period, p.starts_at, p.ends_at   -- §61
      from public.payments p
      left join auth.users u on u.id = p.user_id
     where p.id = f.payment_id
       and coalesce(btrim(u.email::text), '') <> '';
end;
$fn$;
revoke execute on function public.claim_refund_email(text, text) from public, anon, authenticated;
grant  execute on function public.claim_refund_email(text, text) to service_role;
grant  execute on function public.claim_refund_email(text, text) to service_role;

-- 61.12 start_trial: §60's body, plus the marked line ----------------------------------
-- A pressed ('signup') trial is refused with reason 'pass' while the pass
-- is on, the same verdict style as 'disabled'. Every refusal before it
-- stands ('disabled', 'used', 'paid'); code, administrator and refund
-- trials are unchanged. trial_enabled is NOT read differently: see the head.
create or replace function public.start_trial(p_source text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  s    public.billing_settings;
  m    public.studio_members;
  src  text;
  mins int;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- §51: an anonymous session has a uid but is not an account
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google to start a trial' using errcode = '42501';
  end if;
  -- end §51

  select * into s from public.billing_settings x where x.id;
  select * into m from public.studio_members x where x.user_id = uid for update;

  if m.user_id is not null and m.disabled_at is not null then
    raise exception 'This account has been disabled.' using errcode = '42501';
  end if;
  -- A declined request is an administrator's "no". There is no other row
  -- that records it for somebody who was never a member.
  if exists (select 1 from public.invite_requests r where r.user_id = uid and r.status = 'declined') then
    raise exception 'This account was not approved.' using errcode = '42501';
  end if;
  -- §50: and a re-ask does not erase it. Only an approval clears
  -- last_declined_at. Non-members only, so a member's landing call still
  -- gets its 'used' verdict rather than an error.
  if m.user_id is null
     and exists (select 1 from public.invite_requests r where r.user_id = uid and r.last_declined_at is not null) then
    raise exception 'This account was not approved.' using errcode = '42501';
  end if;
  -- end §50

  if not coalesce(s.trial_enabled, false) then
    return jsonb_build_object('started', false, 'reason', 'disabled');
  end if;
  if m.trial_started_at is not null then
    return jsonb_build_object('started', false, 'reason', 'used');
  end if;
  -- paid_at, not status='paid': it catches a grant and a refunded buyer
  -- too, so a refund is not a way back to a fresh trial. (Do NOT use
  -- paid_credit_paise here — it filters period='lifetime' and misses
  -- grants.)
  if exists (select 1 from public.payments p where p.user_id = uid and p.paid_at is not null) then
    return jsonb_build_object('started', false, 'reason', 'paid');
  end if;

  src := case
           when p_source is not null and public.is_studio_admin() then p_source
           when m.invite_code_id is not null                      then 'code'
           else 'signup'
         end;
  -- §61: while the launch pass is on, a pressed trial is not offered
  if src = 'signup' and coalesce(s.pass_enabled, false) then return jsonb_build_object('started', false, 'reason', 'pass'); end if;   -- §61
  mins := case when src = 'code' then coalesce(s.code_trial_days, 7) * 1440
               else coalesce(s.trial_minutes, 30) end;

  insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
  values (uid, 'user', now(), mins, src,
          -- §60: every trial follows the console's scope (a pressed one was always 'sample')
          coalesce(s.trial_scope, 'sample'))
  on conflict (user_id) do update
     set trial_started_at = now(),
         trial_minutes    = excluded.trial_minutes,
         trial_source     = excluded.trial_source,
         trial_scope      = excluded.trial_scope
   -- the WHERE closes the two-concurrent-calls race: the second finds
   -- trial_started_at already set and does nothing
   where public.studio_members.trial_started_at is null;

  -- Parity with the two other paths that admit somebody
  -- (activate_payment, admin_grant_plan). Inserts (name, owner_id) only,
  -- which is how it passes accounts_guard's INSERT branch; see section 19.
  perform public.account_for_buyer(uid, null);

  return jsonb_build_object('started', true, 'status', public.billing_status());
end;
$fn$;
revoke execute on function public.start_trial(text) from public, anon;
grant  execute on function public.start_trial(text) to authenticated;

-- 61.13 THE PUBLIC READS, AND THE MEMBER'S -------------------------------------------------
-- §60's trial_offer and §56's price_notice(text) gain `pass` (every key
-- they had keeps its name and meaning); §53's billing_status gains
-- plan_period, pass_active and pass_used.
create or replace function public.trial_offer()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'trial_enabled',     coalesce(s.trial_enabled, false),
    'trial_minutes',     coalesce(s.trial_minutes, 30),
    'trial_hours',       round(coalesce(s.trial_minutes, 30) / 60.0, 2),
    'purchase_required', coalesce(s.purchase_required, false),
    -- §60: what a pressed trial opens, 'sample' or 'full'
    'trial_scope',       coalesce(s.trial_scope, 'sample'),
    -- §61: the launch pass (src/lib/pass-offer.js readPass)
    'pass',              public.pass_block())
    from (select 1) one
    left join public.billing_settings s on s.id;
$$;
revoke execute on function public.trial_offer() from public;
grant  execute on function public.trial_offer() to anon, authenticated;

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
    'pass',             public.pass_block(),   -- §61
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
revoke execute on function public.price_notice(text) from public;
grant  execute on function public.price_notice(text) to anon, authenticated;

create or replace function public.billing_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  uid    uuid := auth.uid();
  pl     text;
  acc    public.accounts;
  lim    jsonb;
  s      public.billing_settings;
  m      public.studio_members;
  t_ends timestamptz;
  t_on   boolean;
  feat   jsonb;
  req    boolean;
  g_on   boolean;
  lapsed boolean;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  pl := public.user_plan(uid);
  select * into acc from public.accounts a where a.owner_id = uid
   order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last limit 1;
  lim := public.user_limits(uid);
  select * into s from public.billing_settings x where x.id;
  select * into m from public.studio_members x where x.user_id = uid;
  t_ends := public.trial_ends_at(uid);
  t_on   := public.trial_active(uid);
  req    := coalesce(s.purchase_required, false);
  g_on   := pl = 'free' and public.email_grant_active(uid);
  lapsed := acc.plan is not null and acc.plan <> 'free' and acc.plan_until is not null and acc.plan_until <= now();

  feat := coalesce((select p.features from public.plans p where p.id = pl), '{}'::jsonb);
  if t_on and m.trial_scope = 'full' and pl = 'free' then
    feat := coalesce((select p.features from public.plans p
                       where p.id = coalesce(s.trial_plan, 'indie')), '{}'::jsonb);
  end if;
  if not req or g_on then
    feat := public.open_features();
  end if;

  return jsonb_build_object(
    'plan',        pl,
    'plan_name',   (select name from public.plans where id = pl),
    'limits',      lim,
    'features',    feat,
    'account_id',  acc.id,
    'account_name', acc.name,
    -- §53: a lapsed year still says when it ended (it read null, and the
    -- page printed the epoch)
    'plan_until',  case when pl <> 'free' or lapsed then acc.plan_until end,
    'bought_plan', acc.plan,
    'lapsed',      lapsed,
    'disabled',    exists (select 1 from public.studio_members x where x.user_id = uid and x.disabled_at is not null),
    'member',      exists (select 1 from public.studio_members x where x.user_id = uid and x.disabled_at is null),
    'trial_enabled', coalesce(s.trial_enabled, false),
    'trial_active',  t_on,
    'trial_ends_at', t_ends,
    'trial_minutes', coalesce(s.trial_minutes, 30),
    'trial_used',    m.trial_started_at is not null,
    'trial_source',  m.trial_source,
    'trial_scope',   case when t_on then m.trial_scope end,
    'entitled',      (not req) or (pl <> 'free') or t_on or g_on,
    'purchase_required', req,
    'trial_hours',   round(coalesce(s.trial_minutes, 30) / 60.0, 2),
    'server_now',    now(),
    'granted',       g_on,
    -- §61: the launch pass
    'plan_period',   acc.plan_period,
    'pass_active',   coalesce(acc.plan_period = 'pass' and acc.plan_until > now(), false),
    'pass_used',     exists (select 1 from public.payments q where q.user_id = uid and q.period = 'pass' and q.paid_at is not null),
    'usage', jsonb_build_object(
      'projects',      (select count(*) from public.projects p where p.owner_id = uid),
      'shares',        (select count(*) from public.shares sh join public.projects p on p.id = sh.project_id
                         where p.owner_id = uid and (sh.expires_at is null or sh.expires_at > now())),
      'collaborators', (select coalesce(max(c), 0) from (select count(*) c from public.project_collaborators pc
                         join public.projects p on p.id = pc.project_id where p.owner_id = uid group by pc.project_id) t),
      'seats',         (select count(*) from public.account_members am where am.account_id = acc.id and am.status in ('pending','active'))
    ),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'plan_id', x.plan_id, 'period', x.period,
                   'amount_paise', x.amount_paise, 'status', x.status, 'created_at', x.created_at, 'ends_at', x.ends_at)
                   order by x.created_at desc)
                  from (select * from public.payments q where q.user_id = uid order by q.created_at desc limit 12) x), '[]'::jsonb)
  );
end;
$fn$;
revoke execute on function public.billing_status() from public, anon;
grant  execute on function public.billing_status() to authenticated;

-- 61.14 THE CONSOLE ---------------------------------------------------------------
/** The pass as the console shows it: the settings, the count sold, what is
 *  left under the cap, and whether it is open right now. Owner or finance. */
create or replace function public.admin_pass_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare s public.billing_settings; sold int;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['finance']);
  select * into s from public.billing_settings x where x.id;
  sold := public.pass_sold();
  return jsonb_build_object(
    'enabled',  coalesce(s.pass_enabled, false),
    'paise',    coalesce(s.pass_paise, 4900),
    'days',     coalesce(s.pass_days, 7),
    'plan',     coalesce(s.pass_plan, 'pro'),
    'ends_at',  s.pass_ends_at,
    'cap',      s.pass_cap,
    'sold',     sold,
    'left',     case when s.pass_cap is not null then greatest(s.pass_cap - sold, 0) end,
    'open',     public.pass_open());
end;
$fn$;

/** Set the pass. Owner or finance, audited. A null enabled / paise / days /
 *  plan keeps what is there; a null deadline or cap CLEARS it (no deadline,
 *  no cap). A price change applies to NEW orders: an order already created
 *  keeps the amount it was recorded at. Refused: a price under ₹1 (100
 *  paise, Razorpay's minimum), a length outside 1–31 days, a plan that is
 *  not a paid plan on sale, a cap under 1, and turning the pass ON with a
 *  deadline already past (it would be on and closed at once). */
create or replace function public.admin_set_pass(
  p_enabled boolean,
  p_paise   int,
  p_days    int,
  p_plan    text,
  p_ends_at timestamptz,
  p_cap     int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s     public.billing_settings;
  en    boolean;
  pa    int;
  dy    int;
  pl    text;
  bef   jsonb;
  aft   jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['finance']);
  select * into s from public.billing_settings x where x.id for update;
  if s.id is null then raise exception 'billing_settings has no row' using errcode = '22023'; end if;
  en := coalesce(p_enabled, s.pass_enabled);
  pa := coalesce(p_paise, s.pass_paise);
  dy := coalesce(p_days, s.pass_days);
  pl := coalesce(nullif(btrim(p_plan), ''), s.pass_plan);
  if pa < 100 then raise exception 'The pass costs at least ₹1 (100 paise).' using errcode = '22023'; end if;
  if dy < 1 or dy > 31 then raise exception 'A pass lasts 1 to 31 days.' using errcode = '22023'; end if;
  if not exists (select 1 from public.plans p where p.id = pl and p.active and coalesce(p.price_paise, 0) > 0) then
    raise exception 'A pass opens a paid plan that is on sale (%).', pl using errcode = '22023';
  end if;
  if p_cap is not null and p_cap < 1 then raise exception 'A cap is at least 1, or none.' using errcode = '22023'; end if;
  if en and p_ends_at is not null and p_ends_at <= now() then
    raise exception 'That deadline has already passed. Set a later one, or none.' using errcode = '22023';
  end if;
  bef := jsonb_build_object('enabled', s.pass_enabled, 'paise', s.pass_paise, 'days', s.pass_days,
                            'plan', s.pass_plan, 'ends_at', s.pass_ends_at, 'cap', s.pass_cap);
  aft := jsonb_build_object('enabled', en, 'paise', pa, 'days', dy, 'plan', pl, 'ends_at', p_ends_at, 'cap', p_cap);
  update public.billing_settings x
     set pass_enabled = en, pass_paise = pa, pass_days = dy, pass_plan = pl,
         pass_ends_at = p_ends_at, pass_cap = p_cap
   where x.id;
  if bef is distinct from aft then
    perform public.admin_audit_write('set_pass', 'billing_settings', 'pass', bef, aft, null);
  end if;
  return public.admin_pass_status();
end;
$fn$;

-- 61.15 GRANTS -----------------------------------------------------------------------
revoke execute on function public.pass_sold()   from public, anon, authenticated;
revoke execute on function public.pass_open()   from public, anon, authenticated;
revoke execute on function public.pass_block()  from public, anon, authenticated;
revoke execute on function public.admin_pass_status()                                         from public, anon;
revoke execute on function public.admin_set_pass(boolean, int, int, text, timestamptz, int)   from public, anon;
grant  execute on function public.admin_pass_status()                                         to authenticated;
grant  execute on function public.admin_set_pass(boolean, int, int, text, timestamptz, int)   to authenticated;

notify pgrst, 'reload schema';

-- 61.16 CHECKS TO RUN LIVE (read-only, as the owner in the SQL editor) -------
-- select pass_enabled, pass_paise, pass_days, pass_plan, pass_ends_at, pass_cap from public.billing_settings;
--                                                              -> false, 4900, 7, pro, null, null (until the console sets it)
-- select trial_enabled from public.billing_settings;          -> true. LEAVE IT TRUE (the §30 grandfathered members)
-- select public.trial_offer() -> 'pass';                       -> {"open": false, "amount_paise": 4900, "days": 7, ...}
-- select public.price_notice('INR') ? 'pass';                  -> true
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'payments_period_check';     -> names 'pass'
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'accounts_plan_period_check'; -> names 'pass'
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'events_name_check';         -> names 'pass_buy'
-- select pg_get_functiondef('public.start_trial(text)'::regprocedure) like '%§61%';               -> true
-- select public.paid_buyers();                                 -> the same number as before this ran
-- Scratch-database checks: scripts/schema-tests/week-pass.sql (npm run test:schema);
-- the two-account checks: docs/SECURITY-RLS.md §61.
