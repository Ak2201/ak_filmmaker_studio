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
                                             'trial_hours','server_now','granted'],
  '33. (4) billing_status() keeps every key §32 returned, and adds trial_hours, server_now and granted');
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

-- 8. ACCESS GIVEN BY E-MAIL IS ACCESS (owner, 11 Oct 2026): a member
-- given access with NO plan is in, uncapped, for as long as the grant
-- stands — and only then meets the ordinary state. They were a member
-- before the grant (no trial yet), so revoking leaves the membership.
select t.reset();
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000003302', 'user');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('th-granted@example.com', 'member', null, null, null);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003302');
select t.ok((public.billing_status() ->> 'entitled')::bool and (public.billing_status() ->> 'granted')::bool
        and (public.billing_status() ->> 'plan') = 'free' and (public.billing_status() ->> 'purchase_required')::bool,
  '33. (8) ON: a plan-less e-mail grant is entitled and granted, on no plan, while purchases are required');
select t.ok((public.billing_status() -> 'features') = (select p.features from public.plans p where p.id <> 'free' order by public.plan_rank(p.id) desc, p.sort desc limit 1),
  '33. (8) ON: its features are open_features() — the top paid plan''s map, no sample_only');
select t.ok((public.billing_status() -> 'limits') = '{}'::jsonb and public.user_limits() = '{}'::jsonb,
  '33. (8) ON: limits and user_limits() are {} — unlimited');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003302', 'Granted 1');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003302', 'Granted 2');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003302', 'Granted 3');
select t.ok((select count(*) from public.projects where owner_id = '00000000-0000-4000-8000-000000003302') = 3,
  '33. (8) ON: the granted member syncs three projects past the free cap — no P0402');
select t.ok(not (public.billing_status() ->> 'trial_used')::bool, '33. (8) and no trial was spent on it');
-- an ordinary expired member is still walled beside them
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003301');
select t.ok(not (public.billing_status() ->> 'entitled')::bool and not (public.billing_status() ->> 'granted')::bool,
  '33. (8) (control) an expired member with no grant is still walled, granted false');

-- revoked: back to the ordinary state — the trial, never used, is offered
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_revoke_email_grant('th-granted@example.com');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003302');
select t.ok(not (public.billing_status() ->> 'entitled')::bool and not (public.billing_status() ->> 'granted')::bool
        and not (public.billing_status() ->> 'trial_used')::bool,
  '33. (8) revoked: walled again, granted false, the trial still unused');
select t.ok((public.billing_status() -> 'limits') = (select limits from public.plans where id = 'free'),
  '33. (8) revoked: the free caps are back');
select t.ok((public.start_trial() ->> 'started')::bool, '33. (8) revoked: start_trial() starts the trial the wall offers');
select t.ok((public.billing_status() ->> 'entitled')::bool and (public.billing_status() ->> 'trial_active')::bool
        and not (public.billing_status() ->> 'granted')::bool,
  '33. (8) and they are in, on the trial — not on the grant');
select t.ok((public.start_trial() ->> 'reason') = 'used', '33. (5) once: a second start_trial() answers used');
rollback;

-- 8. a TIMED plan-less grant whose `until` has passed is no grant; a
-- grant that NAMES a plan is that plan, not "granted"
begin;
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000003302', 'user');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true}');
select public.admin_grant_email('th-granted@example.com', 'member', null, 3, null);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003302');
select t.ok((public.billing_status() ->> 'granted')::bool, '33. (8) a 3-day plan-less grant: granted while it runs');
select t.reset();
update public.email_grants set until = now() - interval '1 minute' where email = 'th-granted@example.com';
select t.claims('00000000-0000-4000-8000-000000003302');
select t.ok(not (public.billing_status() ->> 'entitled')::bool and not (public.billing_status() ->> 'granted')::bool
        and public.user_limits() = (select limits from public.plans where id = 'free'),
  '33. (8) its until passed: walled, granted false, the free caps back');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('th-granted@example.com', 'member', 'starter', null, null);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003302');
select t.ok((public.billing_status() ->> 'entitled')::bool and not (public.billing_status() ->> 'granted')::bool
        and (public.billing_status() ->> 'plan') = 'starter',
  '33. (8) a grant naming a plan: entitled on that plan, granted false');
rollback;

-- 6. the Free row is not for sale ---------------------------------------
begin;
select t.reset();   -- quote_for() is internal (the edge functions' pricer); as the owner of the schema
do $$ begin
  perform public.quote_for('00000000-0000-4000-8000-000000003301', 'free', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 33. (6) quote_for(..., ''free'') -> 22023: the Free row cannot be bought'; end $$;
rollback;
