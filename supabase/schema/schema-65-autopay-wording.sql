-- RUN: owner, in the Supabase SQL editor, AFTER §62 (and §63). Hash the file
--      first (shasum -a 256 supabase/schema/schema-65-autopay-wording.sql) and
--      compare it with the editor's contents before pressing Run
--      (docs/LAUNCH.md §4). Re-runnable. No function redeploy: rzp-subscribe
--      passes the message through. Grants are kept by CREATE OR REPLACE.
-- ============================================================
-- 65. AUTO-PAY WORDING: CANCEL WITH RAZORPAY
-- ------------------------------------------------------------
-- The product has no in-app cancel (owner decision, 29 Oct 2026). §62's
-- quote_subscription refused a second auto-pay with "It can be cancelled in
-- Settings, Plan." This restates that ONE function, body copied from §62
-- unchanged, with only that message reworded.
-- ============================================================

begin;

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
    raise exception 'You already have auto-pay running. It can be cancelled from the Razorpay mandate e-mail or in your bank or UPI app.' using errcode = '22023', hint = 'subscribed';
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

commit;

-- 65.1 READ-BACK (read-only) ---------------------------------------------------
select pg_get_functiondef('public.quote_subscription(uuid, uuid, text, text)'::regprocedure) like '%Razorpay mandate e-mail%' as reworded;
--   -> true
