-- RUN: owner, in the Supabase SQL editor, AFTER §62. Hash the file first
--      (shasum -a 256 supabase/schema/schema-63-renewal-reminders.sql) and
--      compare it with the editor's contents before pressing Run
--      (docs/LAUNCH.md §4; the checksum is in docs/LIVE-STEPS-2026-10-27.md
--      "§63 renewal reminders"). Re-runnable. Then DEPLOY rzp-remind (new)
--      with the CLI and --no-verify-jwt, set the CRON_SECRET secret, and
--      schedule it (docs/BILLING.md §27). Read back with 63.4 below; the
--      checks are docs/SECURITY-RLS.md §63.
-- ============================================================
-- 63. RENEWAL REMINDERS — one e-mail before each auto-pay charge
-- ------------------------------------------------------------
-- §62 built renewalReminderMail and nothing sent it. This section is the
-- database half of sending it: a claim, so each billing cycle is reminded
-- AT MOST ONCE however often the scheduler fires and however many
-- schedulers fire at once, and a release, so a send that failed is tried
-- again on the next run.
--
--   * ONE COLUMN. subscriptions.reminded_for is the current_end the last
--     reminder was claimed for. A cycle is "reminded" when reminded_for =
--     current_end; a charge moves current_end (apply_subscription_charge),
--     so the next cycle is claimable again with no reset step. No table is
--     added, so the purge patch (patches/purge-test-data-2026-10-27.sql),
--     which classifies TABLES and empties subscriptions, needs no change.
--
--   * WHO IS REMINDED: a subscription that will actually be charged — status
--     'active' or 'authenticated', not cancel_at_period_end, a current_end in
--     the future and within the window, and an e-mail on the account. Not
--     'created' (no mandate yet), not 'pending' or 'halted' (Razorpay is
--     retrying or has stopped; no dated charge to announce), not a terminal
--     status, not a cancel already asked for.
--
--   * ATOMIC. The claim is one UPDATE over rows picked FOR UPDATE SKIP
--     LOCKED, stamping reminded_for; only the caller whose UPDATE wins gets
--     the row back. Two runs at once split the rows; neither sends twice.
--
--   * RELEASED ONLY FOR ITS OWN CYCLE. release_renewal_reminder(row, for)
--     clears reminded_for only while it still equals `for`, so a late
--     release cannot un-remind a cycle that a charge has since replaced.
--
--   * SERVICE ROLE ONLY (billing_require_service, and no grant to anon or
--     authenticated). The caller is the rzp-remind edge function, which is
--     itself guarded by the CRON_SECRET header.
--
-- Sections:
--   63.1  subscriptions.reminded_for
--   63.2  claim_renewal_reminders, release_renewal_reminder
--   63.3  grants
--   63.4  CHECKS TO RUN LIVE (read-only)
-- ============================================================

-- 63.0 PRECONDITIONS ------------------------------------------------------
do $guard$
begin
  if to_regclass('public.subscriptions') is null
     or to_regprocedure('public.claim_charge_receipt_email(text)') is null then
    raise exception 'Section 63 needs section 62 (auto-renew) first.';
  end if;
end
$guard$;

-- 63.1 THE COLUMN ------------------------------------------------------------
alter table public.subscriptions add column if not exists reminded_for timestamptz;

-- 63.2 CLAIM AND RELEASE ------------------------------------------------------
/** The subscriptions whose next charge falls within p_within from now and
 *  that have not been reminded for that charge, stamped as reminded and
 *  returned for rzp-remind to mail. At most p_limit rows (1–1000), soonest
 *  charge first. p_within must be more than zero and at most 30 days
 *  (22023 otherwise). */
create or replace function public.claim_renewal_reminders(p_within interval default interval '48 hours', p_limit int default 200)
returns table (subscription_row_id uuid, email text, name text, product text, plan_name text, period text,
               days int, amount_minor int, currency text, next_charge_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  perform public.billing_require_service();
  if p_within is null or p_within <= interval '0' or p_within > interval '30 days' then
    raise exception 'The reminder window must be more than zero and at most 30 days' using errcode = '22023', hint = 'window';
  end if;
  return query
  with pick as (
    select x.id
      from public.subscriptions x
      join auth.users u on u.id = x.user_id
     where x.status in ('active', 'authenticated')
       and not x.cancel_at_period_end
       and x.current_end is not null
       and x.current_end > now()
       and x.current_end <= now() + p_within
       and x.reminded_for is distinct from x.current_end
       and coalesce(btrim(u.email::text), '') <> ''
     order by x.current_end, x.id
     limit greatest(1, least(coalesce(p_limit, 200), 1000))
       for update of x skip locked
  ), claimed as (
    update public.subscriptions s
       set reminded_for = s.current_end
      from pick
     where s.id = pick.id
    returning s.id, s.user_id, s.product, s.plan_id, s.period, s.days, s.amount_minor, s.currency, s.current_end
  )
  select c.id,
         u.email::text,
         nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ''),
         c.product,
         pl.name::text,
         c.period,
         c.days,
         c.amount_minor,
         c.currency,
         c.current_end
    from claimed c
    join auth.users u on u.id = c.user_id
    left join public.plans pl on pl.id = c.plan_id
   order by c.current_end, c.id;
end;
$fn$;

/** Un-claim one reminder after its send failed, so the next run tries it
 *  again. Only while reminded_for still equals p_for (the cycle that was
 *  claimed); returns whether anything was released. */
create or replace function public.release_renewal_reminder(p_row uuid, p_for timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n int;
begin
  perform public.billing_require_service();
  update public.subscriptions x set reminded_for = null
   where x.id = p_row and x.reminded_for = p_for;
  get diagnostics n = row_count;
  return n > 0;
end;
$fn$;

-- 63.3 GRANTS -----------------------------------------------------------------
revoke execute on function public.claim_renewal_reminders(interval, int)    from public, anon, authenticated;
revoke execute on function public.release_renewal_reminder(uuid, timestamptz) from public, anon, authenticated;
grant  execute on function public.claim_renewal_reminders(interval, int)    to service_role;
grant  execute on function public.release_renewal_reminder(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';

-- 63.4 CHECKS TO RUN LIVE (read-only, as the owner in the SQL editor) -------
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'reminded_for';
--                                                                -> reminded_for, timestamp with time zone
-- select has_function_privilege('anon', 'public.claim_renewal_reminders(interval,int)', 'execute'),
--        has_function_privilege('authenticated', 'public.claim_renewal_reminders(interval,int)', 'execute'),
--        has_function_privilege('service_role', 'public.claim_renewal_reminders(interval,int)', 'execute');
--                                                                -> f, f, t
-- select count(*) from public.subscriptions
--  where status in ('active','authenticated') and not cancel_at_period_end
--    and current_end between now() and now() + interval '48 hours'
--    and reminded_for is distinct from current_end;              -> what the next run will mail
-- Scratch-database checks: scripts/schema-tests/renewal-reminders.sql (npm run test:schema);
-- the live checks: docs/SECURITY-RLS.md §63.
