-- ============================================================
-- SECTION 32 CHECKS — purchases required, and access by e-mail
-- ------------------------------------------------------------
-- The checks listed at 32.9, executed. Runs after §32 has loaded on
-- top of everything else (test-schema.mjs splits at its header), with
-- its own people (…3201 upward). A (…00a) is still the administrator.
--
-- Every block that flips the switch ON does it inside a transaction it
-- rolls back, so the database is left as the section leaves a live
-- project: purchasing off.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003201', 'pr-free@example.com',     now(), '{"full_name":"Priya"}'),
  ('00000000-0000-4000-8000-000000003202', 'pr-other@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000003203', 'pr-existing@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003205', 'pr-buyer@example.com',    now(), '{}');
-- A member whose thirty minutes ran out long ago: the person the wall is for.
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope) values
  ('00000000-0000-4000-8000-000000003201', 'user', now() - interval '3 hours', 30, 'signup', 'sample'),
  ('00000000-0000-4000-8000-000000003202', 'user', now() - interval '3 hours', 30, 'signup', 'sample');

-- 1. the default, and the signed-out read ------------------------------
select t.ok((select purchase_required from public.billing_settings where id) = false,
  '32. (1) purchase_required defaults to false — running the section turns purchasing OFF');
begin;
select t.claims('00000000-0000-4000-8000-000000003201', 'anon');
select t.ok(public.purchases_required() = false, '32. (1) anon: purchases_required() answers false — the landing page can ask');
rollback;

-- 2. OFF: nothing walled, nothing capped -------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003201');
select t.ok((public.billing_status() ->> 'entitled')::bool
        and (public.billing_status() ->> 'purchase_required')::bool = false,
  '32. (2) OFF: an expired free member is entitled, and purchase_required is reported false');
select t.ok((public.billing_status() ->> 'trial_active')::bool = false and (public.billing_status() ->> 'plan') = 'free',
  '32. (2) (control) the trial really is over and the plan really is free — entitlement comes from the switch alone');
select t.ok(not ((public.billing_status() -> 'features') ? 'sample_only'),
  '32. (2) OFF: no sample_only in features');
select t.ok((public.billing_status() -> 'features')
            = (select p.features from public.plans p where p.id <> 'free' order by public.plan_rank(p.id) desc limit 1),
  '32. (2) OFF: features are the top paid plan''s map, by plan_rank');
select t.ok((public.billing_status() -> 'limits') = '{}'::jsonb and public.user_limits() = '{}'::jsonb,
  '32. (2) OFF: limits and user_limits() are {} — unlimited');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003201', 'Off 1');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003201', 'Off 2');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003201', 'Off 3');
select t.ok((select count(*) from public.projects where owner_id = '00000000-0000-4000-8000-000000003201') = 3,
  '32. (2) OFF: a free member syncs three projects past the free cap of one — no P0402');
select t.ok(public.billing_status() ?& array['plan','plan_name','limits','features','account_id','account_name',
                                             'plan_until','bought_plan','lapsed','disabled','member','usage','payments',
                                             'trial_enabled','trial_active','trial_ends_at','trial_minutes','trial_used',
                                             'trial_source','trial_scope','entitled'],
  '32. (5) every key billing_status() carried before section 32 is still there');
rollback;

-- 4. who may flip it ---------------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003201');
do $$ begin
  perform public.admin_set_billing_settings('{"purchase_required": true}');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 32. (4) a non-admin cannot set purchase_required -> 42501'; end $$;
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.admin_set_billing_settings('{"purchase_required": "yes"}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm ilike '%referral%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  raise notice 'ok - 32. (4) a non-boolean -> 22023, with its own sentence (not the referral one)';
end $$;
rollback;

-- 3. ON: section 30 exactly --------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_set_billing_settings('{"purchase_required": true}') ->> 'purchase_required')::bool,
  '32. (3) an admin turns it on, and admin_get_billing_settings() reports it');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003202');
select t.ok(public.purchases_required(), '32. (3) ON: purchases_required() answers true');
select t.ok((public.billing_status() ->> 'entitled')::bool = false
        and (public.billing_status() ->> 'purchase_required')::bool,
  '32. (3) ON: the expired free member is walled again — entitled false');
select t.ok((public.billing_status() -> 'features') = '{"sample_only": true, "new_projects": false}'::jsonb,
  '32. (3) ON: features are the free plan''s own map again');
select t.ok((public.billing_status() -> 'limits') = (select limits from public.plans where id = 'free'),
  '32. (3) ON: limits are the free plan''s again');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003202', 'On 1');
do $$ begin
  insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003202', 'On 2');
  raise exception 'should have refused';
exception when sqlstate 'P0402' then raise notice 'ok - 32. (3) ON: a second project on Free -> P0402, as before section 32'; end $$;
rollback;

-- 6. a grant for an EXISTING account applies at once -------------------
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_grant_email('  PR-Existing@Example.com ', 'admin', 'indie', null, 'crew') ->> 'applied')::bool,
  '32. (6) a grant for an existing confirmed account is applied at once (address normalised)');
select t.reset();
select t.ok((select role from public.studio_members where user_id = '00000000-0000-4000-8000-000000003203') = 'admin',
  '32. (6) they are a member, with the admin role the grant named');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003203') = 'indie'
        and (select plan_until from public.accounts where owner_id = '00000000-0000-4000-8000-000000003203') is null,
  '32. (6) the plan is on their account, until removed (plan_until null)');
select t.ok(not exists (select 1 from public.payments where user_id = '00000000-0000-4000-8000-000000003203'),
  '32. (6) and no payments row was written — a grant is not a purchase');
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select applied from public.admin_list_email_grants() where email = 'pr-existing@example.com'),
  '32. (6) the console lists it, applied');

-- 9. revoke undoes it
select public.admin_revoke_email_grant('pr-existing@example.com');
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003203') = 'free',
  '32. (9) revoke: the plan is back to free');
select t.ok((select role from public.studio_members where user_id = '00000000-0000-4000-8000-000000003203') = 'user',
  '32. (9) revoke: admin is back to user');
select t.ok((select disabled_at from public.studio_members where user_id = '00000000-0000-4000-8000-000000003203') is not null,
  '32. (9) revoke: the membership the grant created is withdrawn (disabled, not deleted)');
select t.ok(not exists (select 1 from public.email_grants where email = 'pr-existing@example.com'),
  '32. (9) revoke: the grant row is gone');
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.admin_revoke_email_grant('pr-existing@example.com');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 32. (9) revoking an address with no grant -> 22023'; end $$;
-- a re-grant re-admits: the disable is undone by the same path
select public.admin_grant_email('pr-existing@example.com', 'member', null, null, null);
select t.reset();
select t.ok((select disabled_at from public.studio_members where user_id = '00000000-0000-4000-8000-000000003203') is null,
  '32. (9) a fresh grant re-admits somebody a revoke withdrew');
rollback;

-- 8. a timed grant; and revoke never takes back a purchase -------------
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('pr-existing@example.com', 'member', 'pro', 30, null);
select t.reset();
select t.ok((select plan_until from public.accounts where owner_id = '00000000-0000-4000-8000-000000003203')
            = now() + interval '30 days'
        and (select plan_period from public.accounts where owner_id = '00000000-0000-4000-8000-000000003203') = 'grant',
  '32. (8) a 30-day grant: plan_until = now() + 30 days, period grant');
rollback;

begin;
-- The buyer already owns Starter, bought and paid for.
select t.reset();
select public.apply_plan(public.account_for_buyer('00000000-0000-4000-8000-000000003205', null), 'starter', 'lifetime', 0);
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000003205', 'user');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('pr-buyer@example.com', 'member', 'pro', 7, null);
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003205') = 'starter',
  '32. (8) a TIMED grant is not laid over a bought plan — it would take the purchase with it when it lapsed');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('pr-buyer@example.com', 'member', 'pro', null, null);
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003205') = 'pro', '32. (8) an until-removed grant upgrades a bought Starter to Pro');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_revoke_email_grant('pr-buyer@example.com');
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003205') = 'starter'
        and (select disabled_at from public.studio_members where user_id = '00000000-0000-4000-8000-000000003205') is null,
  '32. (9) revoking it restores the bought Starter, and leaves a membership the grant did not create alone');
rollback;

-- 7. a grant BEFORE the account exists ---------------------------------
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(not (public.admin_grant_email('pr-new@example.com', 'member', 'starter', null, null) ->> 'applied')::bool,
  '32. (7) a grant for an address with no account waits, unapplied');
select t.reset();
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000003204', 'pr-new@example.com', now());
select t.ok(exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000003204' and disabled_at is null),
  '32. (7) the first sign-in (auth.users insert) applies it: a member, no code');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003204') = 'starter', '32. (7) with the granted plan');
select t.claims('00000000-0000-4000-8000-000000003204');
select t.ok((select registered from public.studio_status()), '32. (7) the gate''s check reads them registered');
rollback;

begin;
-- the same, with the trigger out of the way: the gate's own call claims it
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('pr-late@example.com', 'member', null, null, null);
select t.reset();
alter table auth.users disable trigger email_grants_on_user;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000003206', 'pr-late@example.com', now());
alter table auth.users enable trigger email_grants_on_user;
select t.ok(not exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000003206'),
  '32. (7) (control) with the trigger bypassed, nothing is applied at sign-up');
select t.claims('00000000-0000-4000-8000-000000003206');
select t.ok((select registered from public.studio_status()),
  '32. (7) studio_status() — the gate''s own check — claims the grant and reads them registered');
rollback;

begin;
-- an UNCONFIRMED address is not an identity
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('pr-unconfirmed@example.com', 'admin', null, null, null);
select t.reset();
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000003207', 'pr-unconfirmed@example.com', null);
select t.ok(not exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000003207'),
  '32. (7) an unconfirmed address is not matched');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-000000003207';
select t.ok((select role from public.studio_members where user_id = '00000000-0000-4000-8000-000000003207') = 'admin',
  '32. (7) confirming it applies the grant (the trigger watches email_confirmed_at)');
rollback;

-- 10. refusals ---------------------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003201');
do $$ begin
  perform public.admin_grant_email('x@example.com', 'member', null, null, null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 32. (10) a non-admin cannot grant -> 42501'; end $$;
do $$ begin
  perform * from public.admin_list_email_grants();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 32. (10) a non-admin cannot list grants -> 42501'; end $$;
do $$ begin
  perform public.admin_revoke_email_grant('x@example.com');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 32. (10) a non-admin cannot revoke -> 42501'; end $$;
do $$ begin
  perform count(*) from public.email_grants;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 32. (11) authenticated cannot read email_grants directly -> 42501'; end $$;
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.admin_grant_email('x@example.com', 'owner', null, null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 32. (10) a bad role -> 22023'; end $$;
do $$ begin
  perform public.admin_grant_email('x@example.com', 'member', 'platinum', null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 32. (10) a bad plan -> 22023'; end $$;
do $$ begin
  perform public.admin_grant_email('not-an-address', 'member', null, null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 32. (10) a bad address -> 22023'; end $$;
do $$ begin
  perform public.admin_grant_email('x@example.com', 'member', null, 0, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 32. (10) zero days -> 22023'; end $$;
rollback;
