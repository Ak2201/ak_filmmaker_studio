-- ============================================================
-- SECTION 63 CHECKS — renewal reminders
-- ------------------------------------------------------------
-- Runs after §63 loads (twice), above the purge. Own people (…63xx) and
-- their own subscription rows, written as the superuser (the payment path
-- that makes them is §62's and is tested in autorenew.sql). Other files'
-- subscriptions may be live in this database, so every count below is
-- filtered to this file's e-mails ('rr-…').
--
--   window    a charge within 48h is claimed; one 5 days out is not; a past
--             one is not; a wider p_within reaches the 5-day one
--   status    created, pending, halted, cancelled, completed, expired and a
--             cancel asked for are never claimed
--   once      a second claim returns nothing; a new current_end (the next
--             charge) is claimable again
--   release   un-claims its own cycle, not a later one
--   rows      the e-mail, name, plan name and amount come back
--   grants    anon and authenticated cannot call either function
-- ============================================================
\set ON_ERROR_STOP on

create or replace function t.err63(p_sql text) returns text language plpgsql as $$
declare st text; hn text;
begin
  execute p_sql;
  return 'none';
exception when others then
  get stacked diagnostics st = returned_sqlstate, hn = pg_exception_hint;
  return st || ':' || coalesce(hn, '');
end $$;
grant execute on function t.err63(text) to anon, authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000006301', 'rr-soon@example.com',      now(), '{"full_name":"Remind Soon"}'),
  ('00000000-0000-4000-8000-000000006302', 'rr-far@example.com',       now(), '{}'),
  ('00000000-0000-4000-8000-000000006303', 'rr-past@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000006304', 'rr-created@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000006305', 'rr-pending@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000006306', 'rr-halted@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000006307', 'rr-cancelled@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006308', 'rr-cancelling@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006309', 'rr-year@example.com',      now(), '{"name":"Year Person"}'),
  ('00000000-0000-4000-8000-000000006310', 'rr-auth@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000006311', 'rr-completed@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006312', 'rr-expired@example.com',   now(), '{}');

insert into public.subscriptions (user_id, product, plan_id, period, days, amount_minor, currency, rzp_subscription_id, status, current_end, cancel_at_period_end) values
  ('00000000-0000-4000-8000-000000006301', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63soon',       'active',        now() + interval '30 hours', false),
  ('00000000-0000-4000-8000-000000006302', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63far',        'active',        now() + interval '5 days',   false),
  ('00000000-0000-4000-8000-000000006303', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63past',       'active',        now() - interval '1 hour',   false),
  ('00000000-0000-4000-8000-000000006304', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63created',    'created',       now() + interval '30 hours', false),
  ('00000000-0000-4000-8000-000000006305', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63pending',    'pending',       now() + interval '30 hours', false),
  ('00000000-0000-4000-8000-000000006306', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63halted',     'halted',        now() + interval '30 hours', false),
  ('00000000-0000-4000-8000-000000006307', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63cancelled',  'cancelled',     now() + interval '30 hours', false),
  ('00000000-0000-4000-8000-000000006308', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63cancelling', 'active',        now() + interval '30 hours', true),
  ('00000000-0000-4000-8000-000000006309', 'starter', 'starter', 'year', 365, 59900, 'INR', 'sub_63year',       'active',        now() + interval '40 hours', false),
  ('00000000-0000-4000-8000-000000006310', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63auth',       'authenticated', now() + interval '20 hours', false),
  ('00000000-0000-4000-8000-000000006311', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63completed',  'completed',     now() + interval '30 hours', false),
  ('00000000-0000-4000-8000-000000006312', 'pass',    'pro',     'pass', 7,   9900,  'INR', 'sub_63expired',    'expired',       now() + interval '30 hours', false);

select t.ok((select count(*) from public.subscriptions where rzp_subscription_id like 'sub_63%' and reminded_for is null) = 12,
  '63. subscriptions.reminded_for exists and starts empty');

-- ============================================================
-- grants: never the client
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000006301');
select t.ok(t.err63($$select * from public.claim_renewal_reminders()$$) like '42501:%'
            and t.err63($$select public.release_renewal_reminder('00000000-0000-4000-8000-000000006301', now())$$) like '42501:%',
  '63. an authenticated member cannot claim or release reminders (42501)');
select t.reset();
set local role anon;
select t.ok(t.err63($$select * from public.claim_renewal_reminders()$$) like '42501:%'
            and t.err63($$select public.release_renewal_reminder('00000000-0000-4000-8000-000000006301', now())$$) like '42501:%',
  '63. anon cannot claim or release reminders (42501)');
reset role;
rollback;
select t.ok(not has_function_privilege('anon', 'public.claim_renewal_reminders(interval,int)', 'execute')
            and not has_function_privilege('authenticated', 'public.claim_renewal_reminders(interval,int)', 'execute')
            and has_function_privilege('service_role', 'public.claim_renewal_reminders(interval,int)', 'execute')
            and not has_function_privilege('authenticated', 'public.release_renewal_reminder(uuid,timestamptz)', 'execute'),
  '63. execute: service_role only, for both functions');

-- ============================================================
-- the claim
-- ============================================================
begin;
select t.service();
select t.ok(t.err63($$select * from public.claim_renewal_reminders(interval '0')$$) = '22023:window'
            and t.err63($$select * from public.claim_renewal_reminders(interval '31 days')$$) = '22023:window',
  '63. a window of zero or past 30 days is refused (hint window)');
create temp table c1 on commit drop as select * from public.claim_renewal_reminders() where email like 'rr-%';
grant select on c1 to service_role;
select t.ok((select array_agg(email order by email) from c1) = array['rr-auth@example.com', 'rr-soon@example.com', 'rr-year@example.com'],
  '63. claimed: active and authenticated subscriptions charging within 48h — not 5 days out, not past, not created/pending/halted/cancelled/completed/expired, not cancelling');
select t.ok((select name = 'Remind Soon' and product = 'pass' and plan_name = 'Pro' and period = 'pass' and days = 7
                    and amount_minor = 9900 and currency = 'INR'
                    and next_charge_at = (select current_end from public.subscriptions where rzp_subscription_id = 'sub_63soon')
               from c1 where email = 'rr-soon@example.com')
            and (select name = 'Year Person' and plan_name = 'Basic' and period = 'year' and amount_minor = 59900 from c1 where email = 'rr-year@example.com')
            and (select name is null from c1 where email = 'rr-auth@example.com'),
  '63. each row carries the e-mail, the name (full_name or name, else null), plan name, period, days, amount and the charge date');
select t.ok((select array_agg(email order by next_charge_at) from c1) = array['rr-auth@example.com', 'rr-soon@example.com', 'rr-year@example.com'],
  '63. soonest charge first');
select t.ok((select count(*) from public.subscriptions where rzp_subscription_id in ('sub_63soon', 'sub_63year', 'sub_63auth') and reminded_for = current_end) = 3
            and (select count(*) from public.subscriptions where rzp_subscription_id like 'sub_63%' and reminded_for is not null) = 3,
  '63. the claim stamps reminded_for = current_end on exactly the rows it returned');
select t.ok((select count(*) from public.claim_renewal_reminders() where email like 'rr-%') = 0,
  '63. a second claim for the same cycle returns nothing');
select t.ok((select count(*) from public.claim_renewal_reminders(interval '6 days') where email like 'rr-%') = 1,
  '63. a wider window reaches the 5-day charge');
select t.ok((select reminded_for = current_end from public.subscriptions where rzp_subscription_id = 'sub_63far')
            and (select count(*) from public.claim_renewal_reminders(interval '6 days') where email like 'rr-%') = 0,
  '63. ... once');
select t.reset();
commit;

-- the limit
begin;
select t.service();
update public.subscriptions set reminded_for = null where rzp_subscription_id like 'sub_63%';
select t.ok((select count(*) from public.claim_renewal_reminders(interval '48 hours', 1)) = 1,
  '63. p_limit caps how many rows one run claims');
select t.reset();
rollback;

-- ============================================================
-- the next cycle, and release
-- ============================================================
begin;
select t.service();
-- a charge went through: current_end moves on by a period (as apply_subscription_charge does)
update public.subscriptions set current_end = current_end + interval '7 days' where rzp_subscription_id = 'sub_63soon';
select t.ok((select count(*) from public.claim_renewal_reminders(interval '10 days') where email = 'rr-soon@example.com') = 1,
  '63. a new current_end (the next charge) is claimable again');
select t.ok((select count(*) from public.claim_renewal_reminders(interval '10 days') where email = 'rr-soon@example.com') = 0,
  '63. and only once for that cycle');
select t.ok(public.release_renewal_reminder((select id from public.subscriptions where rzp_subscription_id = 'sub_63soon'),
                                            (select current_end from public.subscriptions where rzp_subscription_id = 'sub_63soon')),
  '63. release answers true for its own cycle');
select t.ok((select reminded_for is null from public.subscriptions where rzp_subscription_id = 'sub_63soon'),
  '63. ... and clears the claim');
select t.ok((select count(*) from public.claim_renewal_reminders(interval '10 days') where email = 'rr-soon@example.com') = 1,
  '63. a released reminder is claimed again by the next run');
select t.ok(not public.release_renewal_reminder((select id from public.subscriptions where rzp_subscription_id = 'sub_63soon'),
                                                (select current_end - interval '7 days' from public.subscriptions where rzp_subscription_id = 'sub_63soon'))
            and (select reminded_for = current_end from public.subscriptions where rzp_subscription_id = 'sub_63soon'),
  '63. a release for an earlier cycle releases nothing (a late release cannot un-remind the next charge)');
select t.reset();
commit;

-- a cancel asked for after the claim: nothing more is claimed for it
begin;
select t.service();
update public.subscriptions set reminded_for = null, cancel_at_period_end = true where rzp_subscription_id = 'sub_63year';
select t.ok((select count(*) from public.claim_renewal_reminders() where email = 'rr-year@example.com') = 0,
  '63. once a cancel is asked for, no reminder is claimed');
select t.reset();
rollback;

-- ============================================================
-- put back: this file's subscriptions go (the purge empties the rest)
-- ============================================================
delete from public.subscriptions where rzp_subscription_id like 'sub_63%';
select t.ok((select count(*) from public.subscriptions where rzp_subscription_id like 'sub_63%') = 0, '63. (teardown) this file''s rows are gone');
