-- ============================================================
-- SECTION 19 CHECKS — the accounts INSERT hole, closed
-- ------------------------------------------------------------
-- Runs after billing.sql in the same scratch database, so the people
-- are the ones it seeded: A the administrator, B a buyer (on Pro), E
-- a user who owns no organisation yet. Each numbered block is one
-- row of 19.1.
-- ============================================================
\set ON_ERROR_STOP on

-- 1. a self-minted Pro organisation is refused, whichever column carries it
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  insert into public.accounts (name, owner_id, plan, seat_limit) values ('Mint', '00000000-0000-4000-8000-0000000000b1', 'pro', 999);
  raise exception 'should have refused';
exception when sqlstate '42501' then
  if sqlerrm not like '%set by billing%' then raise exception 'wrong message: %', sqlerrm; end if;
  raise notice 'ok - 1. insert with plan pro + seat_limit 999 -> 42501 "set by billing"';
end $$;
do $$ begin
  insert into public.accounts (name, owner_id, plan) values ('Mint', '00000000-0000-4000-8000-0000000000b1', 'pro');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. plan alone -> 42501'; end $$;
do $$ begin
  insert into public.accounts (name, owner_id, seat_limit) values ('Mint', '00000000-0000-4000-8000-0000000000b1', 2);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. seat_limit alone -> 42501'; end $$;
do $$ begin
  insert into public.accounts (name, owner_id, storage_limit_mb) values ('Mint', '00000000-0000-4000-8000-0000000000b1', 1);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. storage_limit_mb alone -> 42501'; end $$;
do $$ begin
  insert into public.accounts (name, owner_id, plan_until) values ('Mint', '00000000-0000-4000-8000-0000000000b1', now() + interval '1 year');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. plan_until alone -> 42501'; end $$;
do $$ begin
  insert into public.accounts (name, owner_id, plan_period) values ('Mint', '00000000-0000-4000-8000-0000000000b1', 'lifetime');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. plan_period alone -> 42501'; end $$;
select t.ok(not exists (select 1 from public.accounts where name = 'Mint'), '1. and no Mint row exists');
rollback;

-- 2. a plain create — what account.js createAccount() sends — still works
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
insert into public.accounts (name, owner_id) values ('Plain', '00000000-0000-4000-8000-0000000000b1');
select t.ok((select count(*) from public.accounts where name = 'Plain' and owner_id = '00000000-0000-4000-8000-0000000000b1') = 1, '2. a plain create lands');
select t.ok((select plan = 'free' and seat_limit = 1 and storage_limit_mb = 500 and plan_until is null and plan_period is null
               from public.accounts where name = 'Plain'), '2. on free / 1 seat / 500 MB with no end and no period');
-- Spelling the defaults out explicitly is the same row and must pass too.
insert into public.accounts (name, owner_id, plan, seat_limit, storage_limit_mb) values ('Explicit', '00000000-0000-4000-8000-0000000000b1', 'free', 1, 500);
select t.ok((select count(*) from public.accounts where name = 'Explicit') = 1, '2. the defaults written explicitly are accepted too');
rollback;

-- 3. acc_insert is unchanged: another person's organisation cannot be made for them
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  insert into public.accounts (name, owner_id) values ('Theirs', '00000000-0000-4000-8000-0000000000e1');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 3. owner_id = somebody else -> 42501 (acc_insert)'; end $$;
rollback;

-- 4. the service role is privileged and may insert anything
begin;
select t.service();
insert into public.accounts (name, owner_id, plan, seat_limit) values ('Service-made', '00000000-0000-4000-8000-0000000000e1', 'pro', 50);
select t.ok((select plan from public.accounts where name = 'Service-made') = 'pro', '4. the service role inserts a Pro organisation');
rollback;

-- 5. the definer path through an authenticated admin still works:
--    account_for_buyer() inserts with defaults, apply_plan() lifts it
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(not exists (select 1 from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000e1'), '5. (control) E owns no organisation yet');
select public.admin_grant_plan('00000000-0000-4000-8000-0000000000e1', 'pro', 0, 'launch comp');
-- A is not a member of E's organisation, so acc_select hides it from A; read it back unimpersonated.
select t.reset();
select t.ok((select plan from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000e1') = 'pro', '5. admin_grant_plan made E an organisation and put it on Pro through the guard');
select t.ok(public.user_plan('00000000-0000-4000-8000-0000000000e1') = 'pro', '5. user_plan(E) answers pro');
rollback;

-- 6. the UPDATE branch is as it was
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  update public.accounts set plan = 'starter' where owner_id = '00000000-0000-4000-8000-0000000000b1';
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 6. the owner still cannot change their own plan'; end $$;
update public.accounts set name = 'Renamed' where owner_id = '00000000-0000-4000-8000-0000000000b1';
select t.ok((select count(*) from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1' and name = 'Renamed') >= 1, '6. and can still rename it');
rollback;

\echo
\echo SECTION 19 CHECKS PASSED
