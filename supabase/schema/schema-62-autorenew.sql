-- RUN: owner, in the Supabase SQL editor, AFTER §61 (it restates §61's
--      pass_sold, pass_block, unapplied_sentence, trial_offer,
--      price_notice(text) and billing_status). Hash the file first
--      (shasum -a 256 supabase/schema/schema-62-autorenew.sql) and compare
--      it with the editor's contents before pressing Run (docs/LAUNCH.md §4;
--      the checksum is in docs/LIVE-STEPS-2026-10-27.md). Re-runnable.
--      Then DEPLOY rzp-subscribe and rzp-cancel (new) and REDEPLOY the four
--      existing functions, with the CLI (docs/BILLING.md §26). Razorpay
--      Subscriptions must be enabled on the account before either mode is
--      set to 'renew'. Read back with 62.12 below; the two-account checks
--      are docs/SECURITY-RLS.md §62.
-- ============================================================
-- 62. AUTO-RENEW — Razorpay Subscriptions, chosen per product
-- ------------------------------------------------------------
-- Owner decisions, 27 Oct 2026 (this reverses §18's "no subscription
-- model" and §52's "no mandate and no subscription" — AS AN OPTION ONLY):
--
--   * PER PRODUCT, IN THE CONSOLE. billing_settings.pass_mode (the launch
--     pass) and plan_mode (the yearly plans) are each 'once' or 'renew'.
--     BOTH DEFAULT TO 'once', and in 'once' nothing in this section is
--     reachable: quote_subscription refuses 'renew_off', and every order,
--     activation, refund and read behaves exactly as §61 left it. A change
--     applies to NEW purchases only; a running subscription keeps renewing.
--
--   * THE BUYER NEVER PICKS. trial_offer() / price_notice(text) say the
--     mode (pass.mode, plan_mode) so the page words the offer truthfully
--     (src/lib/offer-terms.js); billing_status() says the member's own
--     auto-pay (autopay).
--
--   * ONE ROW PER CHARGE. Each Razorpay charge is its own payments row
--     (subscription_id set, razorpay_order_id null), keyed and made
--     idempotent on razorpay_payment_id, inserted 'created' and moved to
--     'paid' so the existing status triggers run unchanged: the invoice
--     (§28/§57/§61), the referral bookkeeping, the deferred §34 refund
--     trial. Refunds stay per row (mark_payment_refunded takes off that
--     charge's own days and nothing else) and never cancel the subscription.
--
--   * PRICE LOCK. A subscription records the amount, currency, days and
--     plan it was signed up at, and the Razorpay plan it runs on (Razorpay
--     plans cannot be edited; a price change in the console makes a new
--     rzp_plans row for new subscribers). A charge for any other amount or
--     currency is refused (22023, hint 'amount').
--
--   * THE PASS RENEWS BY STACKING. A renewing pass charge adds its days
--     from plan_until (§61 never stacks a ONE-TIME pass, and still does
--     not). The launch deadline and the cap close the pass to NEW
--     subscribers only: renewals are not quoted, they are charged. Only the
--     FIRST charge of a pass subscription counts toward pass_sold() (the
--     cap); founding seats (paid_buyers), the referral payout and the §34
--     refund trial keep excluding every pass row, first or renewal.
--
--   * CANCEL ANYTIME. request_cancel_subscription() marks
--     cancel_at_period_end and rzp-cancel asks Razorpay to stop at the end
--     of the cycle. Nothing paid is taken back: no status, cancel or halt
--     ever shortens plan_until. A charge that still arrives after the
--     subscription was cancelled or completed is recorded paid with no
--     plan applied (unapplied_reason 'cancelled'), so it can be refunded.
--
--   * ONE LIVE SUBSCRIPTION PER PERSON (any non-terminal status; a
--     'created' row whose checkout was never completed stops counting after
--     two hours, and the next sign-up marks it 'expired').
--
-- THE REFUSALS. quote_subscription(user, account, product, currency)
-- raises 22023 with the sentence as the message and the reason in the HINT:
--     renew_off   that product's mode is 'once'
--     subscribed  this person already has a live subscription
--     (pass)      disabled | closed | inr_only | used | has_plan   — quote_pass
--     (year)      currency | currency_closed | same_plan | downgrade — quote_for
--     upgrade     (year) a LOWER plan's year is still running: a subscription
--                 has a fixed amount and cannot carry upgrade credit, so an
--                 upgrade is a one-time payment (rzp-order, credited) and
--                 auto-pay can start when that year ends
-- rzp-subscribe answers 400 { error: <sentence>, reason: <hint> }.
--
--   62.0  preconditions
--   62.1  billing_settings: pass_mode, plan_mode
--   62.2  rzp_plans, subscriptions; payments gains the subscription columns
--   62.3  pass_sold(): first charges only; pass_block() gains mode
--   62.4  quote_subscription, create_pending_subscription
--   62.5  set_subscription_rzp_ids, rzp_plan_for, remember_rzp_plan
--   62.6  apply_subscription_charge, unapplied_sentence
--   62.7  mark_subscription_status
--   62.8  request_cancel_subscription, the charge receipt claim
--   62.9  trial_offer, price_notice(text), billing_status
--   62.10 the console: modes, subscriptions, cancel
--   62.11 grants
--   62.12 CHECKS TO RUN LIVE (read-only)
-- ============================================================

-- 62.0 PRECONDITIONS ------------------------------------------------------
do $guard$
begin
  if to_regprocedure('public.quote_pass(uuid,uuid,text)') is null
     or to_regprocedure('public.pass_block()') is null then
    raise exception 'Section 62 needs section 61 (the launch week pass) first.';
  end if;
end
$guard$;

-- 62.1 THE TWO MODES ---------------------------------------------------------
alter table public.billing_settings add column if not exists pass_mode text not null default 'once';
alter table public.billing_settings add column if not exists plan_mode text not null default 'once';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_pass_mode_check') then
    alter table public.billing_settings add constraint billing_settings_pass_mode_check check (pass_mode in ('once', 'renew'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_settings_plan_mode_check') then
    alter table public.billing_settings add constraint billing_settings_plan_mode_check check (plan_mode in ('once', 'renew'));
  end if;
end $$;

-- 62.2 THE TABLES ------------------------------------------------------------
/** The lazy cache of Razorpay plans, one per (product, period, days,
 *  amount, currency). Service role only: RLS on, no policy. */
create table if not exists public.rzp_plans (
  product      text        not null,
  period       text        not null check (period in ('pass', 'year')),
  days         int,
  amount_minor int         not null check (amount_minor >= 100),
  currency     text        not null,
  rzp_plan_id  text        not null unique,
  created_at   timestamptz not null default now(),
  constraint rzp_plans_key unique nulls not distinct (product, period, days, amount_minor, currency)
);
alter table public.rzp_plans enable row level security;
revoke all on public.rzp_plans from public, anon, authenticated;

create table if not exists public.subscriptions (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  account_id           uuid        references public.accounts(id) on delete set null,
  product              text        not null,            -- 'pass' or a plan id
  plan_id              text        not null references public.plans(id),   -- the plan it opens (the pass's at sign-up)
  period               text        not null check (period in ('pass', 'year')),
  days                 int         not null check (days between 1 and 366),
  amount_minor         int         not null check (amount_minor >= 100),
  currency             text        not null,
  rzp_subscription_id  text        unique,
  rzp_plan_id          text,
  status               text        not null default 'created'
                       check (status in ('created','authenticated','active','pending','halted','cancelled','completed','expired')),
  current_start        timestamptz,
  current_end          timestamptz,
  cancel_at_period_end boolean     not null default false,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  raw                  jsonb
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id, created_at desc);
alter table public.subscriptions enable row level security;
drop policy if exists sub_select_own on public.subscriptions;
create policy sub_select_own on public.subscriptions for select using (user_id = auth.uid());
-- No insert/update/delete policies, and no grants for them: the service
-- role and the security definer functions below are the only writers.
revoke insert, update, delete, truncate, references, trigger on public.subscriptions from public, anon, authenticated;
revoke all on public.subscriptions from anon;

alter table public.payments add column if not exists subscription_id          uuid references public.subscriptions(id) on delete set null;
alter table public.payments add column if not exists razorpay_subscription_id text;
alter table public.payments add column if not exists is_renewal               boolean not null default false;
create index if not exists payments_subscription_idx on public.payments(subscription_id);
-- razorpay_order_id has always been unique and nullable: a charge has none.
alter table public.payments drop constraint if exists payments_unapplied_reason_check;
alter table public.payments add constraint payments_unapplied_reason_check
  check (unapplied_reason is null or unapplied_reason in ('exhausted', 'credit_gone', 'has_plan', 'cancelled'));

/** Live = not terminal; a checkout never completed stops counting after two hours. */
create or replace function public.subscription_is_live(s public.subscriptions)
returns boolean
language sql
stable
as $$
  select s.status in ('authenticated','active','pending','halted')
      or (s.status = 'created' and s.created_at > now() - interval '2 hours');
$$;

-- 62.3 THE OFFER ---------------------------------------------------------------
/** Passes sold: paid, not refunded, and (§62) not a renewal: a renewing
 *  pass is one sign-up however many weeks it runs. */
create or replace function public.pass_sold()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.payments p where p.period = 'pass' and p.status = 'paid'
     and not p.is_renewal;   -- §62
$$;

/** §61's block plus `mode`, the console's pass_mode (offer-terms.js). */
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
    'now',          now(),
    'mode',         coalesce(s.pass_mode, 'once'))   -- §62
    from (select 1) one
    left join public.billing_settings s on s.id;
$$;

-- 62.4 QUOTE AND CREATE -------------------------------------------------------
/** What a subscription to `product` ('pass' or a plan id) would charge
 *  this person each period, or a refusal (22023, the reason in the HINT;
 *  see the head). The amount is the FULL price: a subscription never
 *  carries upgrade credit or a promo code. */
create or replace function public.quote_subscription(p_user uuid, p_account uuid default null, p_product text default 'pass', p_currency text default 'INR')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s    public.billing_settings;
  cur  text := upper(btrim(coalesce(p_currency, 'INR')));
  prod text := lower(btrim(coalesce(p_product, '')));
  q    jsonb;
  pl   public.plans;
begin
  select * into s from public.billing_settings x where x.id;
  if prod = 'pass' then
    if coalesce(s.pass_mode, 'once') <> 'renew' then
      raise exception 'The launch pass is sold as a single payment at the moment.' using errcode = '22023', hint = 'renew_off';
    end if;
  else
    select * into pl from public.plans p where p.id = prod and p.active;
    if pl.id is null or coalesce(public.effective_price(prod), 0) <= 0 then
      raise exception 'That plan is not for sale' using errcode = '22023';
    end if;
    if coalesce(s.plan_mode, 'once') <> 'renew' then
      raise exception 'Yearly plans are sold as a single payment at the moment.' using errcode = '22023', hint = 'renew_off';
    end if;
  end if;
  if p_user is not null and exists (select 1 from public.subscriptions x where x.user_id = p_user and public.subscription_is_live(x)) then
    raise exception 'You already have auto-pay running. It can be cancelled in Settings, Plan.' using errcode = '22023', hint = 'subscribed';
  end if;
  if prod = 'pass' then
    q := public.quote_pass(p_user, p_account, cur);   -- disabled | closed | inr_only | used | has_plan
    return jsonb_build_object('product', 'pass', 'plan_id', q ->> 'plan_id', 'period', 'pass',
                              'days', (q ->> 'days')::int, 'amount_minor', (q ->> 'amount_minor')::int,
                              'currency', 'INR', 'account_id', q -> 'account_id');
  end if;
  q := public.quote_for(p_user, prod, null, p_account, cur);   -- currency | currency_closed | same_plan | downgrade
  if coalesce((q ->> 'credit_minor')::int, 0) > 0 or q ->> 'upgrade_from' is not null then
    raise exception 'Your current year is still running. An upgrade is a single payment with that year credited; auto-pay can start when it ends.'
      using errcode = '22023', hint = 'upgrade';
  end if;
  return jsonb_build_object('product', pl.id, 'plan_id', pl.id, 'period', 'year', 'days', 365,
                            'amount_minor', (q ->> 'list_minor')::int, 'currency', q ->> 'currency',
                            'account_id', q -> 'account_id', 'renewal', (q ->> 'renewal')::boolean);
end;
$fn$;

/** The pending subscription row, before Razorpay is called (a crash in
 *  between leaves a 'created' row, never a mandate without a record).
 *  Service role (rzp-subscribe). */
create or replace function public.create_pending_subscription(p_user uuid, p_product text, p_account uuid default null, p_currency text default 'INR')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  q   jsonb;
  sid uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  -- one sign-up at a time per person
  perform pg_advisory_xact_lock(hashtext('fms:sub:' || p_user::text));
  update public.subscriptions x set status = 'expired', updated_at = now()
   where x.user_id = p_user and x.status = 'created' and not public.subscription_is_live(x);
  q := public.quote_subscription(p_user, p_account, p_product, p_currency);
  insert into public.subscriptions (user_id, account_id, product, plan_id, period, days, amount_minor, currency, status)
  values (p_user, nullif(q ->> 'account_id', '')::uuid, q ->> 'product', q ->> 'plan_id', q ->> 'period',
          (q ->> 'days')::int, (q ->> 'amount_minor')::int, q ->> 'currency', 'created')
  returning id into sid;
  return jsonb_build_object('subscription_row_id', sid, 'product', q ->> 'product', 'plan_id', q ->> 'plan_id',
                            'period', q ->> 'period', 'days', (q ->> 'days')::int,
                            'amount_minor', (q ->> 'amount_minor')::int, 'currency', q ->> 'currency',
                            'plan_key', concat_ws(':', q ->> 'product', q ->> 'period',
                                                  case when q ->> 'period' = 'pass' then q ->> 'days' end,
                                                  q ->> 'amount_minor', q ->> 'currency'),
                            'plan_name', coalesce((select x.name from public.plans x where x.id = q ->> 'plan_id'), initcap(q ->> 'plan_id')));
end;
$fn$;

-- 62.5 RAZORPAY'S IDS ------------------------------------------------------------
/** rzp-subscribe stores what Razorpay answered. Only a 'created' row with
 *  no id yet takes one, so a replay cannot repoint a running subscription. */
create or replace function public.set_subscription_rzp_ids(p_row uuid, p_rzp_subscription_id text, p_rzp_plan_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.billing_require_service();
  if coalesce(btrim(p_rzp_subscription_id), '') = '' then raise exception 'No subscription id' using errcode = '22023'; end if;
  update public.subscriptions x
     set rzp_subscription_id = p_rzp_subscription_id, rzp_plan_id = p_rzp_plan_id, updated_at = now()
   where x.id = p_row and x.rzp_subscription_id is null and x.status = 'created';
  if not found then
    if exists (select 1 from public.subscriptions x where x.id = p_row and x.rzp_subscription_id = p_rzp_subscription_id) then return; end if;
    raise exception 'That subscription row cannot take an id' using errcode = '22023';
  end if;
end;
$fn$;

/** The cached Razorpay plan id for this price, or null. */
create or replace function public.rzp_plan_for(p_product text, p_period text, p_days int, p_amount int, p_currency text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.rzp_plan_id from public.rzp_plans r
   where r.product = p_product and r.period = p_period
     and r.days is not distinct from (case when p_period = 'pass' then p_days end)
     and r.amount_minor = p_amount and r.currency = upper(p_currency)
     and public.is_privileged_caller();
$$;

/** Remember a plan Razorpay made. Two sign-ups racing at a new price may
 *  each make one: the first stored wins and is returned to both (the
 *  other Razorpay plan is simply never used). */
create or replace function public.remember_rzp_plan(p_product text, p_period text, p_days int, p_amount int, p_currency text, p_rzp_plan_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v text;
begin
  perform public.billing_require_service();
  insert into public.rzp_plans (product, period, days, amount_minor, currency, rzp_plan_id)
  values (p_product, p_period, case when p_period = 'pass' then p_days end, p_amount, upper(p_currency), p_rzp_plan_id)
  on conflict on constraint rzp_plans_key do nothing;
  select r.rzp_plan_id into v from public.rzp_plans r
   where r.product = p_product and r.period = p_period
     and r.days is not distinct from (case when p_period = 'pass' then p_days end)
     and r.amount_minor = p_amount and r.currency = upper(p_currency);
  return v;
end;
$fn$;

-- 62.6 A CHARGE ---------------------------------------------------------------------
/** One Razorpay charge on a subscription (subscription.charged, or a
 *  payment.captured that names one). IDEMPOTENT on the payment id: the
 *  second delivery returns the first's row with already = true. Returns
 *  {payment_id, subscription_row_id, account_id, plan_id, ends_at,
 *  applied, already, renewal}. Refused (22023): an unknown subscription,
 *  and hint 'amount' for any amount or currency but the locked one. */
create or replace function public.apply_subscription_charge(
  p_rzp_subscription_id text,
  p_rzp_payment_id      text,
  p_amount_minor        int,
  p_currency            text,
  p_paid_at             timestamptz default null,
  p_event               jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  sub    public.subscriptions;
  pay    public.payments;
  acc    uuid;
  a      public.accounts;
  why    text;
  renew  boolean;
  start  timestamptz := now();
  until  timestamptz;
  pid    uuid;
  intl   boolean;
  ctry   text;
  cur_pl text;
begin
  perform public.billing_require_service();
  if coalesce(btrim(p_rzp_payment_id), '') = '' then raise exception 'No payment id' using errcode = '22023'; end if;
  select * into sub from public.subscriptions x where x.rzp_subscription_id = p_rzp_subscription_id for update;
  if sub.id is null then raise exception 'No subscription with that id' using errcode = '22023'; end if;
  select * into pay from public.payments p where p.razorpay_payment_id = p_rzp_payment_id;
  if pay.id is not null then
    return jsonb_build_object('payment_id', pay.id, 'subscription_row_id', pay.subscription_id, 'account_id', pay.account_id,
                              'plan_id', pay.plan_id, 'ends_at', pay.ends_at, 'applied', coalesce(pay.plan_applied, false),
                              'already', true, 'renewal', pay.is_renewal);
  end if;
  -- the price lock: only the amount and currency signed up for
  if p_amount_minor is distinct from sub.amount_minor or upper(btrim(coalesce(p_currency, ''))) <> sub.currency then
    raise exception 'Razorpay reports % (minor units of %) for a subscription locked at % %',
      p_amount_minor, p_currency, sub.amount_minor, sub.currency using errcode = '22023', hint = 'amount';
  end if;
  select o.international, o.card_country into intl, ctry from public.payment_card_origin(p_event) o;
  renew := exists (select 1 from public.payments p where p.subscription_id = sub.id and p.paid_at is not null);
  acc := coalesce(public.buyer_target_account(sub.user_id, sub.account_id), public.account_for_buyer(sub.user_id, null));
  select * into a from public.accounts x where x.id = acc for update;
  cur_pl := coalesce(public.account_plan(acc), 'free');

  -- what this charge may buy
  if sub.status in ('cancelled', 'completed') then
    why := 'cancelled';                         -- recorded and refundable, never applied
  elsif sub.period = 'pass' then
    -- a pass is never laid over a yearly plan (§61's rule, per charge)
    if cur_pl <> 'free' and a.plan_period is distinct from 'pass' then why := 'has_plan'; end if;
  else
    -- a year is never laid over a HIGHER plan that is running
    if cur_pl <> 'free' and a.plan_period is distinct from 'pass'
       and public.plan_rank(sub.plan_id) < public.plan_rank(cur_pl) then
      why := 'has_plan';
    end if;
  end if;

  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, currency, list_paise, discount_paise,
                               promo_code, credit_paise, subscription_id, razorpay_subscription_id, razorpay_payment_id,
                               is_renewal, status)
  values (sub.user_id, acc, sub.plan_id, sub.period, sub.amount_minor, sub.currency, sub.amount_minor, 0,
          null, 0, sub.id, sub.rzp_subscription_id, p_rzp_payment_id, renew, 'created')
  returning id into pid;

  if why is null then
    if sub.period = 'pass' then
      -- §62: a RENEWING pass stacks from plan_until (a one-time pass never does)
      if a.plan = sub.plan_id and a.plan_period = 'pass' and a.plan_until is not null and a.plan_until > now() then
        start := a.plan_until;
      end if;
      until := public.apply_plan(acc, sub.plan_id, 'pass', sub.days);
      if start > now() then
        until := start + make_interval(days => sub.days);
        update public.accounts x set plan_until = until, updated_at = now() where x.id = acc;
      end if;
    else
      until := public.apply_plan(acc, sub.plan_id, 'year', sub.days);   -- a same-plan year stacks (§52)
    end if;
    start := until - make_interval(days => sub.days);
  end if;

  -- 'created' -> 'paid' as its own update, so the invoice, referral and
  -- refund-trial triggers see the transition they were written for
  update public.payments p
     set status = 'paid', paid_at = coalesce(p_paid_at, now()),
         starts_at = case when why is null then start else now() end,
         ends_at   = case when why is null then until end,
         plan_applied = why is null,
         unapplied_reason = why,
         raw = p_event,
         international = intl,
         card_country  = ctry
   where p.id = pid;

  insert into public.studio_members (user_id, role) values (sub.user_id, 'user') on conflict (user_id) do nothing;

  update public.subscriptions x
     set status = case when x.status in ('cancelled', 'completed') then x.status else 'active' end,
         current_start = case when why is null then start else x.current_start end,
         current_end   = case when why is null then until else x.current_end end,
         account_id    = coalesce(x.account_id, acc),
         updated_at    = now()
   where x.id = sub.id;

  return jsonb_build_object('payment_id', pid, 'subscription_row_id', sub.id, 'account_id', acc, 'plan_id', sub.plan_id,
                            'ends_at', until, 'applied', why is null, 'already', false, 'renewal', renew,
                            'unapplied_reason', why);
end;
$fn$;

-- §61's sentences, plus the charge that arrived after a cancel
create or replace function public.unapplied_sentence(p_reason text, p_code text default null)
returns text
language sql
immutable
as $$
  select case p_reason
    when 'exhausted'   then format('The code %s was used up before this payment was confirmed, so the plan was not applied.', coalesce(p_code, 'on this order'))
    when 'credit_gone' then 'This order was priced with credit for a payment that no longer counts, so the plan was not applied.'
    when 'has_plan'    then 'A plan was bought on this account after the launch pass was ordered, so the pass was not applied.'
    when 'cancelled'   then 'This auto-pay had been cancelled before the charge arrived, so no time was added.'   -- §62
    else 'This order can no longer be applied.'
  end;
$$;

-- 62.7 STATUS -------------------------------------------------------------------------
/** Razorpay's word on a subscription (authenticated, activated, pending,
 *  halted, cancelled, completed, expired; paused reads as halted and
 *  resumed as active). It NEVER touches plan_until: a halt, a cancel or an
 *  end takes away no day that was paid for. A terminal status is never
 *  undone by a late, out-of-order delivery. Returns null for a
 *  subscription this studio does not know. */
create or replace function public.mark_subscription_status(p_rzp_subscription_id text, p_status text, p_payload jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  sub public.subscriptions;
  st  text := case lower(btrim(coalesce(p_status, '')))
                when 'activated' then 'active' when 'charged' then 'active' when 'resumed' then 'active'
                when 'paused' then 'halted' else lower(btrim(coalesce(p_status, ''))) end;
  nxt text;
begin
  perform public.billing_require_service();
  if st not in ('created','authenticated','active','pending','halted','cancelled','completed','expired') then
    raise exception 'Unknown subscription status %', p_status using errcode = '22023';
  end if;
  select * into sub from public.subscriptions x where x.rzp_subscription_id = p_rzp_subscription_id for update;
  if sub.id is null then return null; end if;
  nxt := case
           when sub.status in ('cancelled','completed','expired') and st not in ('cancelled','completed','expired') then sub.status
           when sub.status in ('cancelled','completed') and st = 'expired' then sub.status
           else st end;
  update public.subscriptions x
     set status = nxt,
         cancelled_at = case when nxt = 'cancelled' then coalesce(x.cancelled_at, now()) else x.cancelled_at end,
         raw = coalesce(p_payload, x.raw),
         updated_at = now()
   where x.id = sub.id;
  return jsonb_build_object('subscription_row_id', sub.id, 'status', nxt, 'changed', nxt is distinct from sub.status,
                            'current_end', sub.current_end);
end;
$fn$;

-- 62.8 CANCEL, AND THE RECEIPT ---------------------------------------------------------
/** The signed-in person's own live subscription, marked to stop at the end
 *  of the period. Access is unchanged. rzp-cancel then asks Razorpay.
 *  Idempotent (already = true the second time). Refused 22023 'none'. */
create or replace function public.request_cancel_subscription()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid uuid := auth.uid();
  sub public.subscriptions;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into sub from public.subscriptions x
   where x.user_id = uid and public.subscription_is_live(x)
   order by x.created_at desc limit 1 for update;
  if sub.id is null then
    raise exception 'There is no auto-pay to cancel on this account.' using errcode = '22023', hint = 'none';
  end if;
  update public.subscriptions x
     set cancel_at_period_end = true, cancelled_at = coalesce(x.cancelled_at, now()), updated_at = now()
   where x.id = sub.id;
  return jsonb_build_object('subscription_row_id', sub.id, 'rzp_subscription_id', sub.rzp_subscription_id,
                            'current_end', sub.current_end, 'already', sub.cancel_at_period_end,
                            'status', sub.status, 'product', sub.product, 'period', sub.period,
                            'amount_minor', sub.amount_minor, 'currency', sub.currency,
                            'email', (select u.email::text from auth.users u where u.id = sub.user_id));
end;
$fn$;

/** The invoice for one subscription CHARGE (by Razorpay payment id),
 *  stamped as mailed, with what the e-mail says about the next charge —
 *  or null when it was mailed already, has no e-mail or no invoice.
 *  Exactly one concurrent caller gets it (§35's rule). Released by §35's
 *  release_receipt_email(invoice id) when the send fails. */
create or replace function public.claim_charge_receipt_email(p_rzp_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  inv public.invoices;
  sub public.subscriptions;
begin
  perform public.billing_require_service();
  update public.invoices i set emailed_at = now()
   where i.razorpay_payment_id = p_rzp_payment_id
     and i.emailed_at is null
     and coalesce(btrim(i.buyer_email), '') <> ''
  returning * into inv;
  if inv.id is null then return null; end if;
  select s.* into sub from public.subscriptions s join public.payments p on p.subscription_id = s.id
   where p.id = inv.payment_id;
  return to_jsonb(inv) || jsonb_build_object(
    'subscription_row_id', sub.id,
    'renews',        sub.id is not null and not sub.cancel_at_period_end and public.subscription_is_live(sub),
    'renews_at',     sub.current_end,
    'renew_minor',   sub.amount_minor,
    'renew_currency', sub.currency,
    'every_days',    sub.days,
    'sub_period',    sub.period);
end;
$fn$;

-- 62.9 THE PUBLIC READS, AND THE MEMBER'S -------------------------------------------------
-- §61's trial_offer and price_notice(text) gain `plan_mode` (the pass's
-- mode is inside pass_block()); §61's billing_status gains `autopay`.
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
    'pass',              public.pass_block(),
    'plan_mode',         coalesce(s.plan_mode, 'once'))   -- §62
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
    'plan_mode',        coalesce((select s.plan_mode from public.billing_settings s where s.id), 'once'),   -- §62
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

/** The member's auto-pay, for billing_status(): the live subscription
 *  (not a checkout left half-done), else the latest ended one whose paid
 *  time is still running (so a page can say "Auto-pay off · access until
 *  …"), else null. next_charge_at is null once a cancel is asked for. */
create or replace function public.autopay_block(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'status',               x.status,
           'product',              x.product,
           'period',               x.period,
           'days',                 x.days,
           'amount_minor',         x.amount_minor,
           'currency',             x.currency,
           'current_end',          x.current_end,
           'next_charge_at',       case when x.status in ('active','authenticated','pending','halted')
                                         and not x.cancel_at_period_end then x.current_end end,
           'cancel_at_period_end', x.cancel_at_period_end or x.status in ('cancelled','completed','expired'))
    from public.subscriptions x
   where x.user_id = p_user
     and (x.status in ('authenticated','active','pending','halted')
          or (x.status in ('cancelled','completed','expired') and x.current_end > now()))
   order by (x.status in ('authenticated','active','pending','halted')) desc, x.created_at desc
   limit 1;
$$;

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
    'autopay',       public.autopay_block(uid),   -- §62
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

-- 62.10 THE CONSOLE ---------------------------------------------------------------
/** The two modes. Owner or finance. */
create or replace function public.admin_billing_modes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['finance']);
  return (select jsonb_build_object('pass_mode', coalesce(s.pass_mode, 'once'), 'plan_mode', coalesce(s.plan_mode, 'once'))
            from (select 1) one left join public.billing_settings s on s.id);
end;
$fn$;

/** Set the modes ('once' | 'renew'; null keeps what is there). Owner or
 *  finance, audited. Applies to NEW purchases only: a running subscription
 *  keeps renewing in either mode, and is stopped only by a cancel. */
create or replace function public.admin_set_billing_modes(p_pass_mode text, p_plan_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  s   public.billing_settings;
  pm  text;
  ym  text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['finance']);
  select * into s from public.billing_settings x where x.id for update;
  if s.id is null then raise exception 'billing_settings has no row' using errcode = '22023'; end if;
  pm := coalesce(nullif(lower(btrim(p_pass_mode)), ''), s.pass_mode);
  ym := coalesce(nullif(lower(btrim(p_plan_mode)), ''), s.plan_mode);
  if pm not in ('once', 'renew') or ym not in ('once', 'renew') then
    raise exception 'A mode is once or renew.' using errcode = '22023';
  end if;
  if pm is distinct from s.pass_mode or ym is distinct from s.plan_mode then
    update public.billing_settings x set pass_mode = pm, plan_mode = ym where x.id;
    perform public.admin_audit_write('set_billing_modes', 'billing_settings', 'modes',
      jsonb_build_object('pass_mode', s.pass_mode, 'plan_mode', s.plan_mode),
      jsonb_build_object('pass_mode', pm, 'plan_mode', ym), null);
  end if;
  return jsonb_build_object('pass_mode', pm, 'plan_mode', ym);
end;
$fn$;

/** Every subscription, newest first, optionally one status. Owner or finance. */
create or replace function public.admin_list_subscriptions(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['finance']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'user_email', u.email::text, 'product', x.product, 'period', x.period, 'days', x.days,
             'amount_minor', x.amount_minor, 'currency', x.currency, 'status', x.status,
             'current_end', x.current_end, 'cancel_at_period_end', x.cancel_at_period_end, 'created_at', x.created_at)
             order by x.created_at desc)
      from public.subscriptions x
      left join auth.users u on u.id = x.user_id
     where p_status is null or x.status = p_status), '[]'::jsonb);
end;
$fn$;

/** The console's cancel: the same mark as the member's own, on any row.
 *  Owner or finance, audited. rzp-cancel then asks Razorpay. */
create or replace function public.admin_cancel_subscription(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare sub public.subscriptions;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['finance']);
  select * into sub from public.subscriptions x where x.id = p_id for update;
  if sub.id is null then raise exception 'No such subscription' using errcode = '22023'; end if;
  if sub.status in ('cancelled', 'completed', 'expired') then
    raise exception 'That subscription has already ended.' using errcode = '22023', hint = 'none';
  end if;
  update public.subscriptions x
     set cancel_at_period_end = true, cancelled_at = coalesce(x.cancelled_at, now()), updated_at = now()
   where x.id = sub.id;
  if not sub.cancel_at_period_end then
    perform public.admin_audit_write('cancel_subscription', 'subscription', sub.id::text,
      jsonb_build_object('cancel_at_period_end', false, 'status', sub.status),
      jsonb_build_object('cancel_at_period_end', true, 'status', sub.status), null);
  end if;
  return jsonb_build_object('subscription_row_id', sub.id, 'rzp_subscription_id', sub.rzp_subscription_id,
                            'current_end', sub.current_end, 'already', sub.cancel_at_period_end,
                            'status', sub.status, 'product', sub.product, 'period', sub.period,
                            'amount_minor', sub.amount_minor, 'currency', sub.currency,
                            'email', (select u.email::text from auth.users u where u.id = sub.user_id));
end;
$fn$;

/** rzp-cancel's undo when Razorpay refused the cancel: the flag goes back,
 *  so the page never says "auto-pay off" while Razorpay keeps charging.
 *  Only a row this request marked (the caller passes already = false). */
create or replace function public.undo_cancel_subscription(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.billing_require_service();
  update public.subscriptions x set cancel_at_period_end = false, cancelled_at = null, updated_at = now()
   where x.id = p_id and x.status not in ('cancelled', 'completed', 'expired');
end;
$fn$;

-- 62.11 GRANTS -----------------------------------------------------------------------
revoke execute on function public.subscription_is_live(public.subscriptions)                     from public, anon, authenticated;
revoke execute on function public.pass_sold()                                                    from public, anon, authenticated;
revoke execute on function public.pass_block()                                                   from public, anon, authenticated;
revoke execute on function public.quote_subscription(uuid, uuid, text, text)                     from public, anon, authenticated;
revoke execute on function public.create_pending_subscription(uuid, text, uuid, text)            from public, anon, authenticated;
revoke execute on function public.set_subscription_rzp_ids(uuid, text, text)                     from public, anon, authenticated;
revoke execute on function public.rzp_plan_for(text, text, int, int, text)                       from public, anon, authenticated;
revoke execute on function public.remember_rzp_plan(text, text, int, int, text, text)            from public, anon, authenticated;
revoke execute on function public.apply_subscription_charge(text, text, int, text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.unapplied_sentence(text, text)                                 from public, anon, authenticated;
revoke execute on function public.mark_subscription_status(text, text, jsonb)                    from public, anon, authenticated;
revoke execute on function public.claim_charge_receipt_email(text)                               from public, anon, authenticated;
revoke execute on function public.undo_cancel_subscription(uuid)                                 from public, anon, authenticated;
revoke execute on function public.autopay_block(uuid)                                            from public, anon, authenticated;
grant  execute on function public.subscription_is_live(public.subscriptions)                     to service_role;
grant  execute on function public.quote_subscription(uuid, uuid, text, text)                     to service_role;
grant  execute on function public.create_pending_subscription(uuid, text, uuid, text)            to service_role;
grant  execute on function public.set_subscription_rzp_ids(uuid, text, text)                     to service_role;
grant  execute on function public.rzp_plan_for(text, text, int, int, text)                       to service_role;
grant  execute on function public.remember_rzp_plan(text, text, int, int, text, text)            to service_role;
grant  execute on function public.apply_subscription_charge(text, text, int, text, timestamptz, jsonb) to service_role;
grant  execute on function public.unapplied_sentence(text, text)                                 to service_role;
grant  execute on function public.mark_subscription_status(text, text, jsonb)                    to service_role;
grant  execute on function public.claim_charge_receipt_email(text)                               to service_role;
grant  execute on function public.undo_cancel_subscription(uuid)                                 to service_role;

revoke execute on function public.request_cancel_subscription()                                  from public, anon;
revoke execute on function public.admin_billing_modes()                                          from public, anon;
revoke execute on function public.admin_set_billing_modes(text, text)                            from public, anon;
revoke execute on function public.admin_list_subscriptions(text)                                 from public, anon;
revoke execute on function public.admin_cancel_subscription(uuid)                                from public, anon;
grant  execute on function public.request_cancel_subscription()                                  to authenticated;
grant  execute on function public.admin_billing_modes()                                          to authenticated;
grant  execute on function public.admin_set_billing_modes(text, text)                            to authenticated;
grant  execute on function public.admin_list_subscriptions(text)                                 to authenticated;
grant  execute on function public.admin_cancel_subscription(uuid)                                to authenticated;

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions, public.rzp_plans to service_role;

notify pgrst, 'reload schema';

-- 62.12 CHECKS TO RUN LIVE (read-only, as the owner in the SQL editor) -------
-- select pass_mode, plan_mode from public.billing_settings;     -> once, once (until the console sets them)
-- select public.trial_offer() -> 'pass' ->> 'mode', public.trial_offer() ->> 'plan_mode';   -> once, once
-- select public.price_notice('INR') ->> 'plan_mode';            -> once
-- select count(*) from public.subscriptions;                    -> 0
-- select relrowsecurity from pg_class where relname in ('subscriptions', 'rzp_plans');   -> t, t
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'payments_unapplied_reason_check';   -> names 'cancelled'
-- select public.pass_sold();                                    -> the same number as before this ran
-- Scratch-database checks: scripts/schema-tests/autorenew.sql (npm run test:schema);
-- the two-account checks: docs/SECURITY-RLS.md §62.
