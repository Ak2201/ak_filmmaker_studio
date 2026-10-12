-- ============================================================
-- SECTION 38 AND 39 CHECKS — the free plan is retired, and the
-- switch that requires a plan will not wall the grandfathered
-- ------------------------------------------------------------
-- The checks listed at 36.3 and 37.4, executed. Runs after §39 has
-- loaded, with its own people (…3801 upward).
--
-- The two sections are tested together because §38 is what makes §39's
-- question meaningful: once the offer is withdrawn, "is a plan
-- required?" is the only question left about the free row.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003801', 'nf-unpaid@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003802', 'nf-old@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000003803', 'nf-new@example.com',    now(), '{}');

-- Admitted, so the membership gate is not what refuses a project: this
-- file is about the LIMIT trigger, which sits behind it.
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000003801', 'user')
on conflict (user_id) do nothing;

-- ============================================================
-- SECTION 38
-- ============================================================

-- 1 & 2. the free row is gone from BOTH public price feeds
select t.reset();
select t.ok(not exists (select 1 from jsonb_array_elements(public.price_notice() -> 'plans') e
                         where e ->> 'id' = 'free'),
  '38. (1) price_notice(): no free plan is offered to anon');
select t.ok((select count(*) from jsonb_array_elements(public.price_notice() -> 'plans')) = 3,
  '38. (1) the three paid tiers are all still there');
select t.ok(not exists (select 1 from jsonb_array_elements(public.price_notice('USD') -> 'plans') e
                         where e ->> 'id' = 'free'),
  '38. (2) price_notice(currency): the same in the other currency');

-- 3. THE "NO PLAN" STATE IS UNTOUCHED — the whole risk of this section
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003801') = 'free',
  '38. (3) user_plan() still answers free for somebody who has bought nothing');
select t.ok(public.user_limits('00000000-0000-4000-8000-000000003801') = '{}'::jsonb,
  '38. (3) user_limits() is uncapped while purchases are not required — section 33.2b, unchanged');
-- the branch that actually READS plans.limits is the one behind the
-- switch, and it is the branch this section could have broken.
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true}');
select t.reset();
select t.ok(public.user_limits('00000000-0000-4000-8000-000000003801')
              = (select limits from public.plans where id = 'free'),
  '38. (3) with purchases required it still returns the retired row''s limits — it does not filter on active');
select t.claims('00000000-0000-4000-8000-000000003801');
select t.ok((public.billing_status() ->> 'plan') = 'free'
        and (public.billing_status() ->> 'plan_name') = 'No plan',
  '38. (3) billing_status() still names the row, and the name now tells the truth');
select t.ok(public.billing_status() -> 'features'
              = (select features from public.plans where id = 'free'),
  '38. (3) and still returns its features map');
rollback;

-- 4. the limit triggers still fire: they read plans.limits, not plans.active
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true}');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003801');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003801', 'One');
do $$ begin
  insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000003801', 'Two');
  raise exception 'should have refused';
exception when sqlstate 'P0402' then
  raise notice 'ok - 38. (4) the P0402 cap still fires on the retired row''s limits';
end $$;
rollback;

-- 5. it is still not for sale, now for two reasons rather than one
select t.reset();
do $$ begin
  perform public.quote_for('00000000-0000-4000-8000-000000003801', 'free');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  raise notice 'ok - 38. (5) quote_for(..., ''free'') -> 22023 not for sale';
end $$;

-- 6. and it cannot be re-listed from the console
do $$ begin
  update public.plans set active = true where id = 'free';
  raise exception 'should have refused';
exception when check_violation then
  raise notice 'ok - 38. (6) re-listing Free raises plans_free_not_offered';
end $$;

-- ============================================================
-- SECTION 39
-- ============================================================

-- 1. the census is admin-only
select t.reset();
do $$ begin
  perform public.admin_purchase_wall();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 39. (1) anon cannot read the census -> 42501'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000003801');
do $$ begin
  perform public.admin_purchase_wall();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 39. (1) a signed-in non-admin cannot either -> 42501'; end $$;
rollback;

-- 2. it adds up, and it reports the switch as it stands
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_purchase_wall() ->> 'purchase_required')::bool = false,
  '39. (2) the census reports purchase_required false, as section 32 left it');
select t.ok((public.admin_purchase_wall() ->> 'members')::int
          = (public.admin_purchase_wall() ->> 'paid')::int
          + (public.admin_purchase_wall() ->> 'in_trial')::int
          + (public.admin_purchase_wall() ->> 'walled')::int,
  '39. (2) members = paid + in_trial + walled: the three states are exhaustive');
select t.ok((public.admin_purchase_wall() ->> 'grandfathered_walled')::int
         <= (public.admin_purchase_wall() ->> 'walled')::int,
  '39. (2) the grandfathered walled are a subset of the walled');
rollback;

-- 3. TODAY'S STATE: the backfill still holds, so the switch is not blocked
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
values ('00000000-0000-4000-8000-000000003802', 'user', now(), 525600, 'admin', 'full')
on conflict (user_id) do update set trial_started_at = now(), trial_minutes = 525600,
  trial_source = 'admin', trial_scope = 'full';
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_purchase_wall() ->> 'grandfathered_walled')::int = 0,
  '39. (3) nobody grandfathered has lapsed while the year holds');
select t.ok((public.admin_set_billing_settings('{"purchase_required": true}') ->> 'purchase_required')::bool,
  '39. (3) so requiring a plan is allowed — the guard does not block the ordinary case');
rollback;

-- 4. once that year has run out, it refuses, and says how many
update public.studio_members set trial_started_at = now() - interval '400 days'
 where user_id = '00000000-0000-4000-8000-000000003802';
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_purchase_wall() ->> 'grandfathered_walled')::int >= 1,
  '39. (4) the census now counts the lapsed grandfathered member');
do $$ begin
  perform public.admin_set_billing_settings('{"purchase_required": true}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm ilike '%referral%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  if sqlerrm not ilike '%admitted before purchases existed%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  raise notice 'ok - 39. (4) requiring a plan is refused, in its own sentence, naming the count';
end $$;
rollback;

-- 5. a member who arrived AFTER the line does not block it: walling them is the point
update public.studio_members
   set trial_started_at = now(), trial_minutes = 525600
 where user_id = '00000000-0000-4000-8000-000000003802';
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
values ('00000000-0000-4000-8000-000000003803', 'user', now() - interval '30 days', 30, 'signup', 'sample')
on conflict (user_id) do update set trial_started_at = now() - interval '30 days', trial_minutes = 30,
  trial_source = 'signup', trial_scope = 'sample';
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_purchase_wall() ->> 'walled')::int >= 1
        and (public.admin_purchase_wall() ->> 'grandfathered_walled')::int = 0,
  '39. (5) a lapsed ordinary trial is walled and is not grandfathered');
select t.ok((public.admin_set_billing_settings('{"purchase_required": true}') ->> 'purchase_required')::bool,
  '39. (5) and does not block the switch');
rollback;

-- 6. turning it OFF is never refused, whatever the counts
update public.studio_members set trial_started_at = now() - interval '400 days'
 where user_id = '00000000-0000-4000-8000-000000003802';
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_set_billing_settings('{"purchase_required": false}') ->> 'purchase_required')::bool = false,
  '39. (6) giving access back is never guarded');
rollback;
update public.studio_members set trial_started_at = now()
 where user_id = '00000000-0000-4000-8000-000000003802';

-- 7 & 8. every other validation section 32.4 had still behaves identically
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.admin_set_billing_settings('{"purchase_required": "yes"}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm ilike '%referral%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  raise notice 'ok - 39. (7) a non-boolean purchase_required keeps its own sentence';
end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"trial_minutes": 0}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm not ilike '%trial lasts%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  raise notice 'ok - 39. (7) trial_minutes still refuses with the trial sentence';
end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"code_trial_days": 400}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm not ilike '%invite code%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  raise notice 'ok - 39. (7) code_trial_days still refuses with the code sentence';
end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"trial_scope": "half"}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 39. (7) trial_scope still refuses'; end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"trial_plan": "nope"}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 39. (7) trial_plan still refuses'; end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"price_rises_after_buyers": 0}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 39. (7) the founding-seat cap still refuses'; end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"nonsense": 1}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm not ilike '%Unknown setting%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  raise notice 'ok - 39. (7) an unknown key still refuses by name';
end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"referral_friend_pct": 500}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm not ilike '%referral%' then raise exception 'wrong sentence: %', sqlerrm; end if;
  raise notice 'ok - 39. (8) the referral check_violation sentence is unchanged';
end $$;
rollback;
