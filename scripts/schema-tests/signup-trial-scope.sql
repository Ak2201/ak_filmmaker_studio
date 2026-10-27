-- ============================================================
-- SECTION 60 CHECKS — a pressed trial follows the console's trial_scope
-- Its own people (…60xx). A (…00a) is the owner administrator, as in
-- trial.sql. Every block sets the settings it reasons about and rolls
-- back, so nothing here changes what a later file sees.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000006001', 'ts-sample@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000006002', 'ts-full@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006003', 'ts-declined@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006004', 'ts-code@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006005', 'ts-reask@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000006006', 'ts-off@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000006007', 'ts-paid@example.com',     now(), '{}');

select t.ok(pg_get_functiondef('public.start_trial(text)'::regprocedure) not like '%then ''sample'' else%',
  '60. start_trial() no longer forces a pressed trial to the sample');

-- 1. scope 'sample' (the default): a pressed trial is the sample, as before
begin;
update public.billing_settings set trial_enabled = true, trial_minutes = 4320, trial_scope = 'sample', purchase_required = true where id;
select t.claims('00000000-0000-4000-8000-000000006001');
select t.ok((public.start_trial() ->> 'started')::bool, '60. scope sample: a pressed trial starts');
select t.reset();
select t.ok((select trial_source = 'signup' and trial_scope = 'sample' and trial_minutes = 4320
               from public.studio_members where user_id = '00000000-0000-4000-8000-000000006001'),
  '60. scope sample: source signup, scope sample, the console''s 4320 minutes');
select t.claims('00000000-0000-4000-8000-000000006001');
select t.ok((select (b ->> 'entitled')::bool and b ->> 'trial_scope' = 'sample'
                and (b -> 'features' ->> 'sample_only')::bool and not (b -> 'features' ->> 'new_projects')::bool
               from public.billing_status() b),
  '60. scope sample: billing_status() entitled, features sample_only and no new projects (plan-gate sampleOnly() true)');
select t.reset();
rollback;

-- 2. scope 'full': a pressed trial is the whole studio
begin;
update public.billing_settings set trial_enabled = true, trial_minutes = 4320, trial_scope = 'full', trial_plan = null, purchase_required = true where id;
select t.claims('00000000-0000-4000-8000-000000006002');
select t.ok((public.start_trial() ->> 'started')::bool, '60. scope full: a pressed trial starts');
select t.reset();
select t.ok((select trial_source = 'signup' and trial_scope = 'full' and trial_minutes = 4320
               from public.studio_members where user_id = '00000000-0000-4000-8000-000000006002'),
  '60. scope full: source signup, scope full, 4320 minutes (three days)');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000006002') = 'free',
  '60. scope full: the plan is untouched (still free; the trial is a second axis)');
select t.claims('00000000-0000-4000-8000-000000006002');
select t.ok((select (b ->> 'entitled')::bool and (b ->> 'trial_active')::bool and b ->> 'trial_scope' = 'full'
               from public.billing_status() b),
  '60. scope full: billing_status() entitled, trial_active, trial_scope full');
select t.ok((select (b -> 'features') = (select p.features from public.plans p where p.id = 'indie')
                and coalesce((b -> 'features' ->> 'sample_only')::bool, false) = false
                and coalesce((b -> 'features' ->> 'new_projects')::bool, true) = true
               from public.billing_status() b),
  '60. scope full: features are the trial plan''s (indie when unset): no sample_only, new projects allowed');
select t.ok((select (b -> 'limits') = (select p.limits from public.plans p where p.id = 'free') from public.billing_status() b),
  '60. scope full: limits stay the free plan''s (one film in the cloud) — §60 widens features, not caps');
-- a second press: refused as used, and the scope is not rewritten
select t.ok((select r ->> 'started' = 'false' and r ->> 'reason' = 'used' from public.start_trial() r),
  '60. scope full: a repeat trial -> {started false, reason used}');
select t.reset();
rollback;

-- 2b. a named trial plan is honoured
begin;
update public.billing_settings set trial_enabled = true, trial_scope = 'full', trial_plan = 'pro', purchase_required = true where id;
select t.claims('00000000-0000-4000-8000-000000006002');
select 1 from public.start_trial();
select t.ok((select (b -> 'features') = (select p.features from public.plans p where p.id = 'pro') from public.billing_status() b),
  '60. scope full with trial_plan pro: features are Pro''s');
select t.reset();
rollback;

-- 3. a repeat trial after the first one ended is still refused, whatever the scope
begin;
update public.billing_settings set trial_enabled = true, trial_minutes = 30, trial_scope = 'sample' where id;
select t.claims('00000000-0000-4000-8000-000000006001');
select 1 from public.start_trial();
select t.reset();
update public.studio_members set trial_started_at = now() - interval '2 days' where user_id = '00000000-0000-4000-8000-000000006001';
update public.billing_settings set trial_scope = 'full' where id;
select t.claims('00000000-0000-4000-8000-000000006001');
select t.ok((select r ->> 'started' = 'false' and r ->> 'reason' = 'used' from public.start_trial() r),
  '60. an expired sample trial cannot be restarted as a full one -> reason used');
select t.reset();
select t.ok((select trial_scope = 'sample' from public.studio_members where user_id = '00000000-0000-4000-8000-000000006001'),
  '60. ... and its row keeps the scope it was started with (nothing is backfilled)');
rollback;

-- 4. declined: refused, with either scope
begin;
update public.billing_settings set trial_enabled = true, trial_scope = 'full' where id;
select t.claims('00000000-0000-4000-8000-000000006003');
select 1 from public.request_invite('let me in');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_decide_request('00000000-0000-4000-8000-000000006003', false, 'no');
select t.claims('00000000-0000-4000-8000-000000006003');
do $$ begin
  perform public.start_trial();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 60. scope full: a declined requester cannot start a trial -> 42501'; end $$;
select t.reset();
select t.ok(not exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000006003'),
  '60. ... and no membership was made');
rollback;

-- 4b. a declined re-ask (§50) is still refused under scope full
begin;
update public.billing_settings set trial_enabled = true, trial_scope = 'full' where id;
select t.claims('00000000-0000-4000-8000-000000006005');
select 1 from public.request_invite('let me in');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_decide_request('00000000-0000-4000-8000-000000006005', false, 'no');
select t.reset();
update public.invite_requests set decided_at = now() - interval '8 days' where user_id = '00000000-0000-4000-8000-000000006005';
select t.claims('00000000-0000-4000-8000-000000006005');
select 1 from public.request_invite(null);
do $$ begin
  perform public.start_trial();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 60. scope full: a re-asked decline cannot start a trial -> 42501'; end $$;
select t.reset();
rollback;

-- 5. switched off, and a buyer: the same verdicts as before
begin;
update public.billing_settings set trial_enabled = false, trial_scope = 'full' where id;
select t.claims('00000000-0000-4000-8000-000000006006');
select t.ok((select r ->> 'started' = 'false' and r ->> 'reason' = 'disabled' from public.start_trial() r),
  '60. scope full, trials switched off -> reason disabled');
select t.reset();
rollback;
begin;
update public.billing_settings set trial_enabled = true, trial_scope = 'full' where id;
insert into public.payments (user_id, plan_id, period, amount_paise, currency, status, razorpay_order_id, paid_at)
  values ('00000000-0000-4000-8000-000000006007', 'starter', 'year', 59900, 'INR', 'refunded', 'order_ts60', now());
select t.claims('00000000-0000-4000-8000-000000006007');
select t.ok((select r ->> 'started' = 'false' and r ->> 'reason' = 'paid' from public.start_trial() r),
  '60. scope full, somebody who has paid (even refunded) -> reason paid');
select t.reset();
rollback;

-- 6. a code trial: still code_trial_days, and it follows the scope as it did
begin;
update public.billing_settings set trial_enabled = true, trial_scope = 'full', code_trial_days = 7 where id;
do $$
declare v_code text; v_ticket text; v_src text; v_mins int; v_scope text;
begin
  perform t.claims('00000000-0000-4000-8000-00000000000a');
  select code into v_code from public.admin_create_invite('standard', 5, null, null, 'section 60 test');
  perform t.claims('00000000-0000-4000-8000-000000006004');
  select ticket into v_ticket from public.verify_invite(v_code);
  perform * from public.redeem_invite(v_ticket);
  perform public.start_trial();
  perform t.reset();
  select trial_source, trial_minutes, trial_scope into v_src, v_mins, v_scope
    from public.studio_members where user_id = '00000000-0000-4000-8000-000000006004';
  perform t.ok(v_src = 'code' and v_mins = 7 * 1440 and v_scope = 'full',
    '60. a code trial: source code, seven days, and the console''s scope (unchanged behaviour)');
end $$;
rollback;

-- 7. the source still cannot be forged
begin;
update public.billing_settings set trial_enabled = true, trial_minutes = 4320, trial_scope = 'full' where id;
select t.claims('00000000-0000-4000-8000-000000006002');
select 1 from public.start_trial('code');
select t.reset();
select t.ok((select trial_source = 'signup' and trial_minutes = 4320 from public.studio_members where user_id = '00000000-0000-4000-8000-000000006002'),
  '60. start_trial(''code'') from an ordinary caller is still a signup trial');
rollback;

-- 8. trial_offer(): anon reads the scope, and nothing about anybody
begin;
update public.billing_settings set trial_scope = 'full', trial_minutes = 4320 where id;
select t.claims('00000000-0000-4000-8000-000000006001', 'anon');
select t.ok((select o ->> 'trial_scope' = 'full' and (o ->> 'trial_minutes')::int = 4320 and o ? 'trial_enabled' and o ? 'purchase_required'
               from public.trial_offer() o),
  '60. anon trial_offer() says scope full and 4320 minutes, and keeps its §33 keys');
select t.reset();
update public.billing_settings set trial_scope = 'sample' where id;
select t.ok((select public.trial_offer() ->> 'trial_scope') = 'sample', '60. ... and sample when the console says sample');
rollback;

-- 9. anon still cannot start one
begin;
select t.claims('00000000-0000-4000-8000-000000006001', 'anon');
do $$ begin
  perform public.start_trial();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 60. anon: start_trial() -> 42501'; end $$;
rollback;
select t.reset();
