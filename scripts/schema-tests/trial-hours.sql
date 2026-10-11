-- ============================================================
-- SECTION 33 CHECKS — a free trial, not a free plan, set in hours
-- ------------------------------------------------------------
-- The checks listed at 33.5, executed. Runs after §33 has loaded on top
-- of everything else, with its own people (…3301 upward). A (…00a) is
-- still the administrator. Every block that changes a setting rolls
-- back, so the database is left as the section leaves a live project.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003301', 'th-expired@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003302', 'th-granted@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003303', 'th-running@example.com', now(), '{}');
-- A member whose trial ran out an hour ago.
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope) values
  ('00000000-0000-4000-8000-000000003301', 'user', now() - interval '3 hours', 120, 'signup', 'sample');

-- 1. the landing page's read --------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003301', 'anon');
select t.ok(public.trial_offer() ?& array['trial_enabled', 'trial_minutes', 'trial_hours', 'purchase_required'],
  '33. (1) anon: trial_offer() answers trial_enabled, trial_minutes, trial_hours, purchase_required');
select t.ok((public.trial_offer() ->> 'trial_hours')::numeric = round((public.trial_offer() ->> 'trial_minutes')::numeric / 60, 2),
  '33. (1) trial_hours is trial_minutes / 60');
select t.ok(not (public.trial_offer() ?| array['user_id', 'email', 'trial_started_at', 'plan']),
  '33. (1) and nothing about any person');
rollback;

-- 2. hours in, minutes stored; 3. a running trial keeps its snapshot ----
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_set_billing_settings('{"trial_minutes": 180}') ->> 'trial_hours')::numeric = 3,
  '33. (2) the console saves 3 hours as 180 minutes and reads back trial_hours 3');
select t.ok((public.admin_get_billing_settings() ->> 'trial_minutes')::int = 180,
  '33. (2) the column still holds minutes');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003301', 'anon');
select t.ok((public.trial_offer() ->> 'trial_hours')::numeric = 3, '33. (2) the landing page says 3 hours');
select t.reset();
-- a trial that started under the old length keeps it
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope) values
  ('00000000-0000-4000-8000-000000003303', 'user', now() - interval '10 minutes', 30, 'signup', 'sample');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"trial_minutes": 30}');
select public.admin_set_billing_settings('{"trial_minutes": 600}');
select t.reset();
select t.ok(public.trial_ends_at('00000000-0000-4000-8000-000000003303') = (now() - interval '10 minutes') + interval '30 minutes',
  '33. (3) a running trial keeps its snapshot when the setting moves');
rollback;

-- 4. billing_status: every §32 key, plus trial_hours and server_now -----
begin;
select t.claims('00000000-0000-4000-8000-000000003301');
select t.ok(public.billing_status() ?& array['plan','plan_name','limits','features','account_id','account_name',
                                             'plan_until','bought_plan','lapsed','disabled','member','usage','payments',
                                             'trial_enabled','trial_active','trial_ends_at','trial_minutes','trial_used',
                                             'trial_source','trial_scope','entitled','purchase_required',
                                             'trial_hours','server_now'],
  '33. (4) billing_status() keeps every key §32 returned, and adds trial_hours and server_now');
select t.ok(abs(extract(epoch from ((public.billing_status() ->> 'server_now')::timestamptz - now()))) < 1,
  '33. (4) server_now is the server''s clock');
rollback;

-- 5. the switch, unchanged by §33 ----------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003301');
select t.ok((public.billing_status() ->> 'entitled')::bool, '33. (5) OFF: an expired member is entitled (§32 unchanged)');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true}');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003301');
select t.ok(not (public.billing_status() ->> 'entitled')::bool and (public.billing_status() ->> 'trial_used')::bool,
  '33. (5) ON: the expired member is walled, and the trial reads as used');

-- the wall's offer: a member given access by e-mail with NO plan has
-- never had a trial; ON, they are walled — and start_trial() gives them
-- the one everybody else gets, which is what the wall now offers.
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('th-granted@example.com', 'member', null, null, null);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003302');
select t.ok(not (public.billing_status() ->> 'entitled')::bool and not (public.billing_status() ->> 'trial_used')::bool,
  '33. (5) ON: a membership-only grant is walled at once, with no trial used');
select t.ok((public.start_trial() ->> 'started')::bool, '33. (5) start_trial() starts the trial the wall offers');
select t.ok((public.billing_status() ->> 'entitled')::bool and (public.billing_status() ->> 'trial_active')::bool,
  '33. (5) and they are in, on the trial');
select t.ok((public.start_trial() ->> 'reason') = 'used', '33. (5) once: a second start_trial() answers used');
rollback;

-- 6. the Free row is not for sale ---------------------------------------
begin;
select t.reset();   -- quote_for() is internal (the edge functions' pricer); as the owner of the schema
do $$ begin
  perform public.quote_for('00000000-0000-4000-8000-000000003301', 'free', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 33. (6) quote_for(..., ''free'') -> 22023: the Free row cannot be bought'; end $$;
rollback;
