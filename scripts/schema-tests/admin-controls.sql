-- ============================================================
-- SECTION 45 CHECKS — admin controls
-- ------------------------------------------------------------
-- The checks listed at 45.8, executed. Runs after the whole schema,
-- the audit shim (scripts/schema-tests/audit-shim.sql) and section 45
-- itself have loaded; own people (…4501 upward). The audit assertions
-- read public.admin_audit, §40's real log.
-- The base admin …000a is the one billing.sql made; §45's backfill
-- turned it into an owner when the section loaded.
-- ============================================================
\set ON_ERROR_STOP on

create or replace function t.raises(p_sql text, p_state text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlstate = p_state;
end $$;
create or replace function t.audits(p_action text) returns bigint language sql as $$
  select count(*) from public.admin_audit where action = p_action;
$$;
grant execute on function t.raises(text, text), t.audits(text) to anon, authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004501', 'ac-finance@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004502', 'ac-support@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004503', 'ac-member@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004504', 'ac-usera@example.com',   now(), '{"full_name":"User A"}'),
  ('00000000-0000-4000-8000-000000004505', 'ac-userb@example.com',   now(), '{"full_name":"User B"}'),
  ('00000000-0000-4000-8000-000000004506', 'ac-promote@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004507', 'ac-invitee@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004508', 'ac-owner2@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004511', 'ac-starter@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004512', 'ac-indie@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004513', 'ac-pro@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000004514', 'ac-teamer@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004515', 'ac-teammate@example.com', now(), '{}');

insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004501', 'admin'),
  ('00000000-0000-4000-8000-000000004502', 'admin'),
  ('00000000-0000-4000-8000-000000004503', 'user'),
  ('00000000-0000-4000-8000-000000004504', 'user'),
  ('00000000-0000-4000-8000-000000004505', 'user'),
  ('00000000-0000-4000-8000-000000004506', 'user');
insert into public.admin_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000004501', 'finance'),
  ('00000000-0000-4000-8000-000000004502', 'support');

-- ============================================================
-- 1. ROLES
-- ============================================================
select t.ok(exists (select 1 from public.admin_roles where user_id = '00000000-0000-4000-8000-00000000000a' and role = 'owner'),
  '45.1 the backfill: the existing administrator is an owner');
select t.ok(not exists (select 1 from public.studio_members m where m.role = 'admin'
                          and not exists (select 1 from public.admin_roles r where r.user_id = m.user_id)),
  '45.1 the backfill: every admin member has a role row');

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.studio_role() = 'owner' and public.is_studio_admin(), '45.1 studio_role(): the owner is owner and an admin');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(public.studio_role() = 'finance' and public.is_studio_admin(), '45.1 studio_role(): finance, and is_studio_admin() is still true');
select t.ok(t.raises($$select public.require_role(array['support'])$$, '42501'), '45.1 require_role: finance is refused a support RPC (42501)');
select t.ok(not t.raises($$select public.require_role(array['finance'])$$, '42501'), '45.1 require_role: finance passes a finance RPC');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok(public.studio_role() = 'support' and public.is_studio_admin(), '45.1 studio_role(): support, and is_studio_admin() is still true');
select t.ok(t.raises($$select public.require_role(array['finance'])$$, '42501'), '45.1 require_role: support is refused a finance RPC');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(not t.raises($$select public.require_role(array['finance'])$$, '42501') and not t.raises($$select public.require_role(array['owner'])$$, '42501'),
  '45.1 require_role: owner passes everything');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004503');
select t.ok(public.studio_role() is null and not public.is_studio_admin() and t.raises($$select public.require_role(array['support'])$$, '42501'),
  '45.1 a plain member has no role and is refused (42501)');
select t.reset();
commit;
begin;
select t.claims(null, 'anon');
select t.ok(t.raises($$select public.studio_role()$$, '42501') and t.raises($$select public.require_role(array['owner'])$$, '42501'),
  '45.1 anon cannot call studio_role() or require_role()');
select t.reset();
commit;

-- admin_set_role: owner only
begin;
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-000000004506', 'support')$$, '42501'), '45.1 admin_set_role: finance -> 42501');
select t.ok(t.raises($$select public.admin_list_roles()$$, '42501'), '45.1 admin_list_roles: finance -> 42501');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-000000004506', 'owner')$$, '42501'), '45.1 admin_set_role: support -> 42501');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004503');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-000000004506', 'owner')$$, '42501'), '45.1 admin_set_role: member -> 42501');
select t.reset();
commit;
begin;
select t.claims(null, 'anon');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-000000004506', 'owner')$$, '42501')
        and t.raises($$select public.admin_list_roles()$$, '42501'), '45.1 admin_set_role / admin_list_roles: anon -> 42501');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-000000004506', 'god')$$, '22023'), '45.1 an unknown role is refused (22023)');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-0000000fffff', 'support')$$, '22023'), '45.1 an unknown account is refused (22023)');
select public.admin_set_role('00000000-0000-4000-8000-000000004506', 'support');
select t.reset();
select t.ok(exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000004506' and role = 'admin')
        and exists (select 1 from public.admin_roles where user_id = '00000000-0000-4000-8000-000000004506' and role = 'support'
                       and granted_by = '00000000-0000-4000-8000-00000000000a'),
  '45.1 admin_set_role makes them an admin member with the role, granted_by recorded');
select t.ok(t.audits('role.set') = 1, '45.1 admin_set_role is audited');
select t.claims('00000000-0000-4000-8000-000000004506');
select t.ok(public.studio_role() = 'support' and public.is_studio_admin(), '45.1 the new support admin reads as support');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select count(*) from jsonb_array_elements(public.admin_list_roles()) e
              where e ->> 'user_id' = '00000000-0000-4000-8000-000000004506' and e ->> 'role' = 'support') = 1,
  '45.1 admin_list_roles lists them');
select public.admin_set_role('00000000-0000-4000-8000-000000004506', null);
select t.reset();
select t.ok(not exists (select 1 from public.admin_roles where user_id = '00000000-0000-4000-8000-000000004506')
        and (select role from public.studio_members where user_id = '00000000-0000-4000-8000-000000004506') = 'user',
  '45.1 admin_set_role(null) removes the role AND demotes the membership');
select t.ok(t.audits('role.set') = 2, '45.1 each role change wrote an audit row');
rollback;

-- the last owner. Make 0a the only effective owner for the duration.
begin;
update public.studio_members set role = 'user' where role = 'admin' and user_id <> '00000000-0000-4000-8000-00000000000a';
select t.ok(public._other_owner_count('00000000-0000-4000-8000-00000000000a') = 0, '45.1 setup: 0a is the only owner');
select t.ok(t.raises($$delete from public.admin_roles where user_id = '00000000-0000-4000-8000-00000000000a'$$, '23514'),
  '45.1 the trigger refuses removing the last owner');
select t.ok(t.raises($$update public.admin_roles set role = 'support' where user_id = '00000000-0000-4000-8000-00000000000a'$$, '23514'),
  '45.1 the trigger refuses demoting the last owner');
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-00000000000a', 'support')$$, '23514'),
  '45.1 admin_set_role refuses demoting the last owner');
select t.ok(t.raises($$select public.admin_set_role('00000000-0000-4000-8000-00000000000a', null)$$, '23514'),
  '45.1 admin_set_role(null) refuses removing the last owner');
-- with a second owner, the first can step down
select public.admin_set_role('00000000-0000-4000-8000-000000004508', 'owner');
select public.admin_set_role('00000000-0000-4000-8000-00000000000a', 'support');
select t.reset();
select t.ok((select role from public.admin_roles where user_id = '00000000-0000-4000-8000-00000000000a') = 'support'
        and (select role from public.admin_roles where user_id = '00000000-0000-4000-8000-000000004508') = 'owner',
  '45.1 with a second owner in place the first can be demoted');
rollback;

-- ============================================================
-- 2. FEATURE OVERRIDES
-- ============================================================
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004511', 'starter', 'lifetime')), 'order_ac1');
select public.activate_payment('order_ac1', 'pay_ac1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004512', 'indie', 'lifetime')), 'order_ac2');
select public.activate_payment('order_ac2', 'pay_ac2');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004513', 'pro', 'lifetime')), 'order_ac3');
select public.activate_payment('order_ac3', 'pay_ac3');
commit;

select (select id::text from public.accounts where owner_id = '00000000-0000-4000-8000-000000004511') as acc_starter,
       (select id::text from public.accounts where owner_id = '00000000-0000-4000-8000-000000004512') as acc_indie \gset
create temp table _feat_before as select id, features from public.plans;
grant all on _feat_before to authenticated;

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true}');
select t.reset();

-- 2a. owner only; unknown keys refused
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(t.raises($$select public.admin_set_feature_override('budget', 'global', '', false)$$, '42501')
        and t.raises($$select public.admin_list_feature_overrides()$$, '42501'), '45.2 finance cannot set or list overrides (42501)');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok(t.raises($$select public.admin_set_feature_override('budget', 'global', '', false)$$, '42501'), '45.2 support cannot set overrides (42501)');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004503');
select t.ok(t.raises($$select public.admin_set_feature_override('budget', 'global', '', false)$$, '42501'), '45.2 a member cannot set overrides (42501)');
select t.reset();
select t.claims(null, 'anon');
select t.ok(t.raises($$select public.admin_set_feature_override('budget', 'global', '', false)$$, '42501')
        and t.raises($$select public.effective_features()$$, '42501'), '45.2 anon cannot set overrides or call effective_features() (42501)');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_set_feature_override('no_such_feature', 'global', '', false)$$, '22023'), '45.2 an unknown key is refused (22023)');
select t.ok(t.raises($$select public.admin_set_feature_override('sample_only', 'plan', 'free', false)$$, '22023'), '45.2 sample_only is not a feature and is refused');
select t.ok(t.raises($$select public.admin_set_feature_override('budget', 'plan', 'platinum', false)$$, '22023'), '45.2 an unknown plan scope is refused');
select t.ok(t.raises($$select public.admin_set_feature_override('budget', 'account', '00000000-0000-4000-8000-0000000fffff', false)$$, '22023'), '45.2 an unknown account scope is refused');
select t.ok(t.raises($$select public.admin_set_feature_override('budget', 'galaxy', '', false)$$, '22023'), '45.2 an unknown scope is refused');
select t.ok((public.admin_list_feature_overrides() -> 'known_keys') @> '["budget","shoot-day"]'::jsonb
        and not ((public.admin_list_feature_overrides() -> 'known_keys') ? 'sample_only'),
  '45.2 known_keys lists the matrix features and not sample_only');
select t.reset();
select t.ok((select count(*) from public.feature_overrides) = 0, '45.2 nothing was written by the refusals');

-- 2b. nothing overridden: effective = what billing_status serves
select t.claims('00000000-0000-4000-8000-000000004511');
select t.ok(public.effective_features() = (public.billing_status() -> 'features'), '45.2 no overrides: effective_features() is the plan''s own map (fails open)');
select t.ok(not (public.effective_features() ->> 'budget')::bool, '45.2 baseline: Basic has no budget');
select t.reset();

-- 2c. plan scope touches that plan only
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_feature_override('budget', 'plan', 'starter', true);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004511');
select t.ok((public.effective_features() ->> 'budget')::bool, '45.2 plan override: Basic gains budget');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004512');
select t.ok((public.effective_features() ->> 'budget')::bool and public.effective_features() = (public.billing_status() -> 'features'),
  '45.2 plan override on starter leaves Intermediate''s map untouched');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_feature_override('budget', 'plan', 'indie', false);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004512');
select t.ok(not (public.effective_features() ->> 'budget')::bool, '45.2 plan override: Intermediate loses budget');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004513');
select t.ok((public.effective_features() ->> 'budget')::bool and public.effective_features() = (public.billing_status() -> 'features'),
  '45.2 an override on one paid tier does not take a feature from another (Pro unchanged)');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004511');
select t.ok((public.effective_features() ->> 'budget')::bool, '45.2 ... nor from Basic');
select t.reset();

-- 2d. global sits under plan: global false, plan true on starter still wins
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_feature_override('budget', 'global', 'ignored', false);
select t.reset();
select t.ok((select scope_id from public.feature_overrides where key = 'budget' and scope = 'global') = '', '45.2 a global override stores scope_id ''''');
select t.claims('00000000-0000-4000-8000-000000004513');
select t.ok(not (public.effective_features() ->> 'budget')::bool, '45.2 global kill switch: Pro loses budget');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004511');
select t.ok((public.effective_features() ->> 'budget')::bool, '45.2 precedence: plan (true) beats global (false)');
select t.reset();

-- 2e. account sits on top
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_feature_override('budget', 'account', :'acc_indie', true);
select public.admin_set_feature_override('budget', 'account', :'acc_starter', false);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004512');
select t.ok((public.effective_features() ->> 'budget')::bool, '45.2 precedence: account (true) beats plan (false) and global (false)');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004511');
select t.ok(not (public.effective_features() ->> 'budget')::bool, '45.2 precedence: account (false) beats plan (true)');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004513');
select t.ok(not (public.effective_features() ->> 'budget')::bool, '45.2 an account override reaches nobody outside the account');
select t.reset();

-- 2f. clearing returns to the matrix; the plan rows were never edited
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_feature_override('budget', 'global', '', null);
select public.admin_set_feature_override('budget', 'plan', 'starter', null);
select public.admin_set_feature_override('budget', 'plan', 'indie', null);
select public.admin_set_feature_override('budget', 'account', :'acc_indie', null);
select public.admin_set_feature_override('budget', 'account', :'acc_starter', null);
select t.reset();
select t.ok((select count(*) from public.feature_overrides) = 0, '45.2 enabled = null removes an override');
select t.claims('00000000-0000-4000-8000-000000004511');
select t.ok(not (public.effective_features() ->> 'budget')::bool and public.effective_features() = (public.billing_status() -> 'features'), '45.2 cleared: back to the matrix');
select t.reset();
select t.ok(not exists (select 1 from public.plans p join _feat_before b on b.id = p.id where p.features is distinct from b.features),
  '45.2 plans.features was never edited by any override');
select t.ok(t.audits('feature_override.set') = 10, '45.2 every override change is audited (10 successful writes)');
rollback;

-- 2g. a kill switch reaches a free studio too (purchases not required)
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": false}');
select public.admin_set_feature_override('ai_tools', 'global', '', false);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004511');
select t.ok((public.billing_status() -> 'features' ->> 'ai_tools')::bool and not (public.effective_features() ->> 'ai_tools')::bool,
  '45.2 purchases off: billing_status() unchanged, effective_features() applies the kill switch');
select t.reset();
rollback;

-- ============================================================
-- 3. THE ANNOUNCEMENT BANNER
-- ============================================================
begin;
select t.claims(null, 'anon');
select t.ok(public.site_announcement_now() is null, '45.3 no banner: site_announcement_now() is null');
select t.ok(t.raises($$select * from public.site_announcement$$, '42501'), '45.3 anon cannot read the table directly');
select t.ok(t.raises($$select public.admin_set_announcement('hi')$$, '42501') and t.raises($$select public.admin_clear_announcement()$$, '42501'),
  '45.3 anon cannot set or clear (42501)');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(t.raises($$select public.admin_set_announcement('hi')$$, '42501') and t.raises($$select public.admin_clear_announcement()$$, '42501'),
  '45.3 finance cannot set or clear (42501)');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok(t.raises($$select public.admin_set_announcement('hi')$$, '42501'), '45.3 support cannot set (42501)');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004503');
select t.ok(t.raises($$select public.admin_set_announcement('hi')$$, '42501'), '45.3 a member cannot set (42501)');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_set_announcement(repeat('x', 201))$$, '22023'), '45.3 more than 200 characters is refused');
select t.ok(t.raises($$select public.admin_set_announcement('   ')$$, '22023'), '45.3 an empty banner is refused');
select t.ok(t.raises($$select public.admin_set_announcement('x', 'danger')$$, '22023'), '45.3 level other than info/warn is refused');
select t.ok(t.raises($$select public.admin_set_announcement('x', 'info', now(), now() - interval '1 hour')$$, '22023'), '45.3 ends before it starts is refused');
select public.admin_set_announcement('Maintenance tonight at 10', 'warn');
select t.reset();
select t.claims(null, 'anon');
select t.ok(public.site_announcement_now() ->> 'text' = 'Maintenance tonight at 10' and public.site_announcement_now() ->> 'level' = 'warn',
  '45.3 anon reads the live banner');
select t.ok(not (public.site_announcement_now() ? 'set_by'), '45.3 the banner reply carries no admin identity');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_announcement('Second message');
select t.reset();
select t.ok((select count(*) from public.site_announcement where active) = 1, '45.3 setting a new banner retires the old one (one active row)');
select t.claims(null, 'anon');
select t.ok(public.site_announcement_now() ->> 'text' = 'Second message', '45.3 the newest is the one served');
select t.reset();
-- hand-inserted, two live rows: still at most ONE comes back
insert into public.site_announcement (text, starts_at) values ('hand one', now() - interval '3 hours'), ('hand two', now() - interval '2 hours');
select t.claims(null, 'anon');
select t.ok(jsonb_typeof(public.site_announcement_now()) = 'object' and public.site_announcement_now() ->> 'text' in ('hand two', 'Second message'),
  '45.3 several live rows still yield a single object');
select t.reset();
update public.site_announcement set active = false;
-- start / end respected
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_announcement('Starts later', 'info', now() + interval '1 hour', null);
select t.reset();
select t.claims(null, 'anon');
select t.ok(public.site_announcement_now() is null, '45.3 a banner that has not started is not served');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_announcement('Already over', 'info', now() - interval '2 hours', now() - interval '1 hour');
select t.reset();
select t.claims(null, 'anon');
select t.ok(public.site_announcement_now() is null, '45.3 a banner that has ended is not served');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_announcement('Live window', 'info', now() - interval '1 hour', now() + interval '1 hour');
select t.reset();
select t.claims(null, 'anon');
select t.ok(public.site_announcement_now() ->> 'text' = 'Live window', '45.3 inside its window it is served');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_clear_announcement() = 1, '45.3 clear retires the live banner and says how many');
select t.reset();
select t.claims(null, 'anon');
select t.ok(public.site_announcement_now() is null, '45.3 cleared: null again');
select t.reset();
select t.ok(t.audits('announcement.set') = 5 and t.audits('announcement.clear') = 1, '45.3 set and clear are audited');
rollback;

-- ============================================================
-- 4. THE MANUAL SUPPORT QUEUE
-- ============================================================
begin;
select t.claims(null, 'anon');
select t.ok(t.raises($$select public.admin_log_ticket('a@example.com', 's', 'b')$$, '42501')
        and t.raises($$select public.admin_list_support()$$, '42501')
        and t.raises($$select public.admin_update_ticket(gen_random_uuid(), 'closed')$$, '42501'), '45.4 anon: log / list / update -> 42501 (no public form)');
select t.ok(t.raises($$select * from public.support_tickets$$, '42501'), '45.4 anon cannot read the tickets table');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004503');
select t.ok(t.raises($$select public.admin_log_ticket('a@example.com', 's', 'b')$$, '42501')
        and t.raises($$select public.admin_list_support()$$, '42501'), '45.4 a member: log / list -> 42501');
select t.ok(t.raises($$select * from public.support_tickets$$, '42501'), '45.4 a member cannot read the tickets table');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(t.raises($$select public.admin_log_ticket('a@example.com', 's', 'b')$$, '42501')
        and t.raises($$select public.admin_update_ticket(gen_random_uuid(), 'closed')$$, '42501'), '45.4 finance cannot log or update a ticket (42501)');
select t.reset();
commit;

-- seed the other two sources
insert into public.invite_requests (user_id, email, display_name, note) values
  ('00000000-0000-4000-8000-000000004507', 'ac-invitee@example.com', 'Invitee', 'let me in');
insert into public.invite_requests (user_id, email, status, decided_at) values
  ('00000000-0000-4000-8000-000000004503', 'ac-member@example.com', 'declined', now());
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004504', 'indie', 'lifetime')), 'order_ac4');
select public.activate_payment('order_ac4', 'pay_ac4');
commit;
insert into public.refund_requests (user_id, payment_id, category, message)
  select '00000000-0000-4000-8000-000000004504', id, 'duplicate_charge', 'charged twice' from public.payments where razorpay_order_id = 'order_ac4';

begin;
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok(t.raises($$select public.admin_log_ticket('not-an-email', 's', 'b')$$, '22023'), '45.4 a bad e-mail is refused');
select t.ok(t.raises($$select public.admin_log_ticket('a@example.com', repeat('s', 201), 'b')$$, '22023'), '45.4 a subject over 200 characters is refused');
select t.ok(t.raises($$select public.admin_log_ticket('a@example.com', 's', repeat('b', 4001))$$, '22023'), '45.4 a body over 4000 characters is refused');
select public.admin_log_ticket('AC-UserA@Example.com', 'Cannot export PDF', 'USERA-TICKET-BODY');
select t.reset();
select t.ok((select count(*) from public.support_tickets where email = 'ac-usera@example.com' and status = 'open'
                and created_by = '00000000-0000-4000-8000-000000004502') = 1, '45.4 support logged a ticket (e-mail lower-cased, created_by recorded)');
select t.ok(t.audits('support.log') = 1, '45.4 admin_log_ticket is audited');
select set_config('t.tid', (select id::text from public.support_tickets limit 1), false);

select t.claims('00000000-0000-4000-8000-000000004502');
select public.admin_update_ticket(current_setting('t.tid')::uuid, 'waiting',
  '00000000-0000-4000-8000-000000004502', 'asked them for the file');
select t.ok(t.raises($$select public.admin_update_ticket(current_setting('t.tid')::uuid, 'waiting', '00000000-0000-4000-8000-000000004503')$$, '22023'),
  '45.4 assigning a non-admin is refused');
select t.ok(t.raises($$select public.admin_update_ticket(current_setting('t.tid')::uuid, 'someday')$$, '22023'), '45.4 a bad status is refused');
select t.ok(t.raises($$select public.admin_update_ticket(gen_random_uuid(), 'closed')$$, '22023'), '45.4 an unknown ticket is refused');
select t.reset();
select t.ok((select status from public.support_tickets limit 1) = 'waiting'
        and (select assignee from public.support_tickets limit 1) = '00000000-0000-4000-8000-000000004502'
        and (select count(*) from public.support_ticket_notes) = 1, '45.4 status, assignee and a note were applied');
select t.ok(t.audits('support.update') = 1, '45.4 admin_update_ticket is audited');
select t.ok(t.raises($$update public.support_tickets set status = 'bogus'$$, '23514'), '45.4 the status CHECK holds');

-- a refund goes to "waiting" once approved; list merges all three
update public.refund_requests set status = 'pending' where user_id = '00000000-0000-4000-8000-000000004504';
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok((select count(distinct e ->> 'source') from jsonb_array_elements(public.admin_list_support()) e) = 3
        and (select count(*) from jsonb_array_elements(public.admin_list_support()) e where e ->> 'source' = 'ticket') = 1
        and (select count(*) from jsonb_array_elements(public.admin_list_support()) e where e ->> 'source' = 'refund') = 1
        and (select count(*) from jsonb_array_elements(public.admin_list_support()) e where e ->> 'source' = 'invite') = 1,
  '45.4 the queue merges tickets, pending refund requests and pending invite requests (the declined one is not listed)');
select t.ok(not exists (select 1 from jsonb_array_elements(public.admin_list_support()) e where e ->> 'status' not in ('open','waiting','closed')),
  '45.4 one status vocabulary across the three sources');
select t.ok((select e ->> 'status' from jsonb_array_elements(public.admin_list_support()) e where e ->> 'source' = 'refund') = 'open', '45.4 a pending refund reads open');
select t.reset();
update public.refund_requests set status = 'approved' where user_id = '00000000-0000-4000-8000-000000004504';
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok((select e ->> 'status' from jsonb_array_elements(public.admin_list_support()) e where e ->> 'source' = 'refund') = 'waiting', '45.4 an approved refund reads waiting');
select t.ok((select count(*) from jsonb_array_elements(public.admin_list_support('waiting')) e) = 2 and
            (select count(*) from jsonb_array_elements(public.admin_list_support('open')) e) = 1, '45.4 the status filter filters (waiting: ticket + refund; open: invite)');
select t.ok(t.raises($$select public.admin_list_support('someday')$$, '22023'), '45.4 a bad status filter is refused');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(jsonb_array_length(public.admin_list_support()) = 3, '45.4 finance can read the queue');
select t.reset();
update public.refund_requests set status = 'refunded' where user_id = '00000000-0000-4000-8000-000000004504';
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok((select count(*) from jsonb_array_elements(public.admin_list_support()) e where e ->> 'source' = 'refund') = 0, '45.4 a finished refund drops out of the queue');
select public.admin_update_ticket(current_setting('t.tid')::uuid, 'closed', null, null, true);
select t.reset();
select t.ok((select assignee from public.support_tickets limit 1) is null and (select status from public.support_tickets limit 1) = 'closed', '45.4 p_unassign clears the assignee; closed sticks');
rollback;

-- ============================================================
-- 5. ACCESS AND SHARING
-- ============================================================
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000a4504', '00000000-0000-4000-8000-000000004504', 'User A film'),
  ('00000000-0000-4000-8000-0000000b4505', '00000000-0000-4000-8000-000000004505', 'User B film');
insert into public.invite_codes (code, pass_type, target_project_id, max_redemptions, expires_at, label, created_by) values
  ('AC-STD',  'standard', null, 5, null, 'open code', '00000000-0000-4000-8000-00000000000a'),
  ('AC-PASS', 'screening_pass', '00000000-0000-4000-8000-0000000a4504', 3, now() + interval '2 days', 'press screening', '00000000-0000-4000-8000-000000004504'),
  ('AC-OLD',  'standard', null, 1, now() - interval '3 days', 'stale', null),
  ('AC-TWO',  'screening_pass', '00000000-0000-4000-8000-0000000a4504', 3, now() + interval '5 days', 'second', '00000000-0000-4000-8000-000000004504');
insert into public.invite_redemptions (code_id, viewer_email, access_id)
  select id, 'viewer-secret@example.com', 'ACC123' from public.invite_codes where code = 'AC-PASS';
insert into public.shares (id, project_id, role, token, expires_at, created_by) values
  ('00000000-0000-4000-8000-0000005a4504', '00000000-0000-4000-8000-0000000a4504', 'view', 'tok-secret-xyz', now() + interval '7 days', '00000000-0000-4000-8000-000000004504');
insert into public.project_collaborators (project_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000a4504', '00000000-0000-4000-8000-000000004505', 'view');

-- who may call
begin;
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(t.raises($$select public.admin_list_passes()$$, '42501') and t.raises($$select public.admin_list_shares()$$, '42501')
        and t.raises($$select public.admin_revoke_pass('AC-STD')$$, '42501') and t.raises($$select public.admin_extend_pass('AC-PASS', 3)$$, '42501')
        and t.raises($$select public.admin_revoke_share('00000000-0000-4000-8000-0000005a4504')$$, '42501'), '45.5 finance: every pass/share RPC -> 42501');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004503');
select t.ok(t.raises($$select public.admin_list_passes()$$, '42501') and t.raises($$select public.admin_list_shares()$$, '42501')
        and t.raises($$select public.admin_revoke_pass('AC-STD')$$, '42501') and t.raises($$select public.admin_extend_pass('AC-PASS', 3)$$, '42501')
        and t.raises($$select public.admin_revoke_share('00000000-0000-4000-8000-0000005a4504')$$, '42501'), '45.5 member: every pass/share RPC -> 42501');
select t.reset();
commit;
begin;
select t.claims(null, 'anon');
select t.ok(t.raises($$select public.admin_list_passes()$$, '42501') and t.raises($$select public.admin_list_shares()$$, '42501')
        and t.raises($$select public.admin_revoke_pass('AC-STD')$$, '42501') and t.raises($$select public.admin_extend_pass('AC-PASS', 3)$$, '42501')
        and t.raises($$select public.admin_revoke_share('00000000-0000-4000-8000-0000005a4504')$$, '42501'), '45.5 anon: every pass/share RPC -> 42501');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok((select count(*) from jsonb_array_elements(public.admin_list_passes()) e) = 4
        and (select e ->> 'status' from jsonb_array_elements(public.admin_list_passes()) e where e ->> 'code' = 'AC-OLD') = 'expired'
        and (select e ->> 'status' from jsonb_array_elements(public.admin_list_passes()) e where e ->> 'code' = 'AC-PASS') = 'active'
        and (select e ->> 'project_title' from jsonb_array_elements(public.admin_list_passes()) e where e ->> 'code' = 'AC-PASS') = 'User A film',
  '45.5 admin_list_passes: status, project and creator shown');
select t.ok(public.admin_list_passes()::text not like '%viewer-secret%', '45.5 metadata only: no redeemer e-mail in the pass list');
select t.ok(public.admin_list_shares()::text not like '%tok-secret-xyz%' and public.admin_list_shares()::text like '%User A film%'
        and (select (e ->> 'active')::bool from jsonb_array_elements(public.admin_list_shares()) e where e ->> 'id' = '00000000-0000-4000-8000-0000005a4504') = true, '45.5 admin_list_shares: no token in the reply, project shown');

select public.admin_revoke_pass('ac-pass');
select t.ok((select e ->> 'status' from jsonb_array_elements(public.admin_list_passes()) e where e ->> 'code' = 'AC-PASS') = 'revoked', '45.5 admin_revoke_pass revokes (code case-insensitive)');
select t.ok(t.raises($$select public.admin_extend_pass('AC-PASS', 3)$$, '22023'), '45.5 a revoked pass is not extended');
select t.ok(t.raises($$select public.admin_extend_pass('AC-STD', 3)$$, '22023'), '45.5 a code that never expires is not extended');
select t.ok(t.raises($$select public.admin_extend_pass('AC-TWO', 0)$$, '22023') and t.raises($$select public.admin_extend_pass('AC-TWO', 366)$$, '22023'), '45.5 extension is 1..365 days');
select t.ok(t.raises($$select public.admin_extend_pass('NOPE', 3)$$, '22023') and t.raises($$select public.admin_revoke_pass('NOPE')$$, '22023'), '45.5 an unknown code is refused');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000004502');
select public.admin_extend_pass('AC-TWO', 10);
select public.admin_extend_pass('AC-OLD', 10);
select t.reset();
select t.ok((select expires_at from public.invite_codes where code = 'AC-TWO') between now() + interval '14 days 23 hours' and now() + interval '15 days 1 hour',
  '45.5 admin_extend_pass: from the current expiry (5d + 10d)');
select t.ok((select expires_at from public.invite_codes where code = 'AC-OLD') between now() + interval '9 days 23 hours' and now() + interval '10 days 1 hour',
  '45.5 admin_extend_pass: an expired code is extended from now');
select t.ok((select redemptions_count from public.invite_codes where code = 'AC-TWO') = 0 and (select max_redemptions from public.invite_codes where code = 'AC-TWO') = 3,
  '45.5 extending touches the expiry and nothing else');

select t.claims('00000000-0000-4000-8000-000000004502');
select public.admin_revoke_share('00000000-0000-4000-8000-0000005a4504');
select t.ok(t.raises($$select public.admin_revoke_share(gen_random_uuid())$$, '22023'), '45.5 an unknown share is refused');
select t.reset();
select t.ok((select expires_at from public.shares where id = '00000000-0000-4000-8000-0000005a4504') <= now()
        and (select token from public.shares where id = '00000000-0000-4000-8000-0000005a4504') = 'tok-secret-xyz', '45.5 admin_revoke_share expires the link and keeps the row');
select t.ok(exists (select 1 from public.project_collaborators where project_id = '00000000-0000-4000-8000-0000000a4504'
                       and user_id = '00000000-0000-4000-8000-000000004505'), '45.5 people already in through the link keep their access');
select t.ok(t.audits('pass.revoke') = 1 and t.audits('pass.extend') = 2 and t.audits('share.revoke') = 1, '45.5 revoke / extend / revoke-share are audited');
rollback;

-- ============================================================
-- 6. DATA-SUBJECT TOOLS
-- ============================================================
-- user A: film + data + comment on B's film + a share on B's film; payment from §4.
-- user B: film + data + a comment on A's film.
insert into public.project_data (project_id, scope, data, updated_by) values
  ('00000000-0000-4000-8000-0000000a4504', 'feature', '{"note":"USERA-MARKER"}', '00000000-0000-4000-8000-000000004504'),
  ('00000000-0000-4000-8000-0000000b4505', 'feature', '{"note":"USERB-MARKER"}', '00000000-0000-4000-8000-000000004505');
-- comments_set_author stamps the writer from auth.uid(); seed the authors directly.
alter table public.comments disable trigger user;
insert into public.comments (project_id, scope, field_key, author_id, author_name, body) values
  ('00000000-0000-4000-8000-0000000b4505', 'feature', 's1', '00000000-0000-4000-8000-000000004504', 'User A', 'A-WROTE-THIS'),
  ('00000000-0000-4000-8000-0000000a4504', 'feature', 's1', '00000000-0000-4000-8000-000000004505', 'User B', 'B-WROTE-THIS');
alter table public.comments enable trigger user;
insert into public.shares (id, project_id, role, token, created_by) values
  ('00000000-0000-4000-8000-0000005b4504', '00000000-0000-4000-8000-0000000b4505', 'view', 'tok-a-on-b', '00000000-0000-4000-8000-000000004504');
insert into public.support_tickets (email, subject, body) values
  ('ac-usera@example.com', 'A ticket', 'USERA-TICKET-BODY'), ('ac-userb@example.com', 'B ticket', 'USERB-TICKET-BODY');
insert into public.leads (email, consent_text) values
  ('ac-usera@example.com', 'I agree to be e-mailed about the studio.'), ('ac-userb@example.com', 'I agree to be e-mailed about the studio.');
insert into public.email_grants (email, role) values ('ac-usera@example.com', 'member');
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000004514', 'user')
  on conflict do nothing;

-- who may call
begin;
select t.claims('00000000-0000-4000-8000-000000004502');
select t.ok(t.raises($$select public.admin_export_user('00000000-0000-4000-8000-000000004504')$$, '42501')
        and t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004504', 'ac-usera@example.com')$$, '42501'), '45.6 support: export / delete -> 42501');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004501');
select t.ok(t.raises($$select public.admin_export_user('00000000-0000-4000-8000-000000004504')$$, '42501')
        and t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004504', 'ac-usera@example.com')$$, '42501'), '45.6 finance: export / delete -> 42501');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004503');
select t.ok(t.raises($$select public.admin_export_user('00000000-0000-4000-8000-000000004504')$$, '42501')
        and t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004504', 'ac-usera@example.com')$$, '42501'), '45.6 member: export / delete -> 42501');
select t.reset();
commit;
begin;
select t.claims(null, 'anon');
select t.ok(t.raises($$select public.admin_export_user('00000000-0000-4000-8000-000000004504')$$, '42501')
        and t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004504', 'ac-usera@example.com')$$, '42501'), '45.6 anon: export / delete -> 42501');
select t.ok(t.raises($$select * from public.deleted_subjects$$, '42501'), '45.6 the tombstone table is closed to the API');
select t.reset();
commit;

-- the export
create temp table _export (j jsonb);
grant all on _export to authenticated;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
insert into _export select public.admin_export_user('00000000-0000-4000-8000-000000004504');
select t.ok(t.raises($$select public.admin_export_user('00000000-0000-4000-8000-0000000fffff')$$, '22023'), '45.6 export of an unknown account is refused (22023)');
select t.reset();
select t.ok((select j -> 'profile' ->> 'email' from _export) = 'ac-usera@example.com'
        and (select j::text from _export) like '%USERA-MARKER%'
        and (select jsonb_array_length(j -> 'payments') from _export) = 1
        and (select jsonb_array_length(j -> 'projects') from _export) = 1
        and (select j::text from _export) like '%A-WROTE-THIS%'
        and (select j::text from _export) like '%USERA-TICKET-BODY%'
        and (select (j ->> 'on_leads_list')::bool from _export), '45.6 the export holds the person''s profile, payments, films with their synced data, comments, tickets');
select t.ok((select j ->> 'note' from _export) like '%browser%' and (select j ->> 'note' from _export) like '%never uploaded%', '45.6 the export says local-only work is not on the server');
select t.ok((select j::text from _export) not like '%USERB-MARKER%' and (select j::text from _export) not like '%B-WROTE-THIS%'
        and (select j::text from _export) not like '%USERB-TICKET-BODY%' and (select j::text from _export) not like '%ac-userb@example.com%'
        and (select j::text from _export) not like '%000000004505%'
        and (select j::text from _export) not like '%tok-a-on-b%',
  '45.6 the export contains no other user''s rows (not B''s film data, comment, ticket, user id or e-mail; no share token; A''s own comments may name the film id they were left on)');
select t.ok(t.audits('user.export') = 1, '45.6 admin_export_user is audited');
rollback;

-- the refusals
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-00000000000a', 'admin@example.com')$$, '42501'), '45.6 delete refuses yourself (42501)');
select t.ok(t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004504', 'wrong@example.com')$$, '22023')
        and t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004504', '')$$, '22023')
        and t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004504', null)$$, '22023'), '45.6 delete needs the e-mail typed back (22023)');
select t.ok(t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-0000000fffff', 'x@example.com')$$, '22023'), '45.6 delete of an unknown account is refused');
select t.reset();
commit;
select t.ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000004504') and (select count(*) from public.deleted_subjects) = 0,
  '45.6 the refusals deleted nothing and left no tombstone');
-- a team with other active members is refused
insert into public.accounts (id, name, owner_id) values ('00000000-0000-4000-8000-0000000c4514', 'Team', '00000000-0000-4000-8000-000000004514');
insert into public.account_members (account_id, invited_email, user_id, role, status) values
  ('00000000-0000-4000-8000-0000000c4514', 'ac-teammate@example.com', '00000000-0000-4000-8000-000000004515', 'member', 'active');
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004514', 'ac-teamer@example.com')$$, '22023'),
  '45.6 delete refuses someone who owns a team with other active members');
select t.reset();
commit;

-- a second owner can be deleted, and the first stays
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_role('00000000-0000-4000-8000-000000004508', 'owner');
select public.admin_delete_user('00000000-0000-4000-8000-000000004508', 'AC-OWNER2@example.com');
select t.reset();
commit;
select t.ok(not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000004508')
        and not exists (select 1 from public.admin_roles where user_id = '00000000-0000-4000-8000-000000004508')
        and exists (select 1 from public.admin_roles where user_id = '00000000-0000-4000-8000-00000000000a' and role = 'owner'),
  '45.6 a second owner can be deleted (e-mail match is case-insensitive); the first owner stands');

-- the real one
select count(*) as inv_before from public.invoices where user_id = '00000000-0000-4000-8000-000000004504' \gset
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_delete_user('00000000-0000-4000-8000-000000004504', 'ac-usera@example.com') as del \gset
select t.reset();
commit;
select t.ok(:'del'::jsonb ->> 'deleted' = 'true' and (:'del'::jsonb ->> 'tombstone') = 'true', '45.6 admin_delete_user reports the deletion');
select t.ok(not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000004504')
        and not exists (select 1 from public.projects where owner_id = '00000000-0000-4000-8000-000000004504')
        and not exists (select 1 from public.project_data where project_id = '00000000-0000-4000-8000-0000000a4504')
        and not exists (select 1 from public.payments where user_id = '00000000-0000-4000-8000-000000004504')
        and not exists (select 1 from public.accounts where owner_id = '00000000-0000-4000-8000-000000004504')
        and not exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000004504')
        and not exists (select 1 from public.refund_requests where user_id = '00000000-0000-4000-8000-000000004504')
        and not exists (select 1 from public.support_tickets where lower(email) = 'ac-usera@example.com')
        and not exists (select 1 from public.email_grants where email = 'ac-usera@example.com')
        and not exists (select 1 from public.leads where lower(email) = 'ac-usera@example.com')
        and not exists (select 1 from public.shares where created_by = '00000000-0000-4000-8000-000000004504'),
  '45.6 delete leaves no data: sign-in, films, synced data, payments, team, membership, requests, tickets, grant, lead, shares');
select t.ok(exists (select 1 from public.deleted_subjects where email_hash = encode(sha256(convert_to('ac-usera@example.com', 'UTF8')), 'hex')
                       and deleted_by = '00000000-0000-4000-8000-00000000000a')
        and (select count(*) from public.deleted_subjects) = 2, '45.6 the tombstone is the sha256 of the lower-cased address (and is not the address)');
select t.ok(not exists (select 1 from public.deleted_subjects where email_hash like '%usera%'), '45.6 the tombstone holds no address');
select t.ok((select count(*) from public.invoices where user_id = '00000000-0000-4000-8000-000000004504') = :inv_before
        and (:'del'::jsonb ->> 'invoices_retained')::int = :inv_before, '45.6 invoices are retained as statutory records, and the reply says so');
select t.ok(exists (select 1 from public.comments where body = 'A-WROTE-THIS' and author_id is null and author_name = 'Deleted user'),
  '45.6 the comment A left on B''s film is anonymised, not left with their name');
select t.ok(exists (select 1 from public.projects where id = '00000000-0000-4000-8000-0000000b4505')
        and exists (select 1 from public.project_data where project_id = '00000000-0000-4000-8000-0000000b4505' and data ->> 'note' = 'USERB-MARKER')
        and exists (select 1 from public.leads where lower(email) = 'ac-userb@example.com')
        and exists (select 1 from public.support_tickets where lower(email) = 'ac-userb@example.com'),
  '45.6 B''s film, data, lead and ticket are untouched');
select t.ok(t.audits('user.delete') = 2, '45.6 admin_delete_user is audited');

-- the tombstone keeps the person off the leads list; everybody else may still join
begin;
select t.claims(null, 'anon');
select public.add_lead('AC-UserA@example.com', 'I agree to be e-mailed about the studio.', 'start');
select public.add_lead('ac-newcomer@example.com', 'I agree to be e-mailed about the studio.', 'start');
select t.reset();
commit;
select t.ok(not exists (select 1 from public.leads where lower(email) = 'ac-usera@example.com'), '45.6 a deleted person is refused on the leads list (add_lead stays a silent no-op)');
select t.ok(exists (select 1 from public.leads where lower(email) = 'ac-newcomer@example.com'), '45.6 ... and the trigger does not stop anybody else');
select t.ok(not t.raises($$select public.add_lead('ac-again@example.com', 'I agree to be e-mailed about the studio.', 'start')$$, '42501'),
  '45.6 add_lead is still anon-callable and unchanged');

-- ============================================================
-- 7. THE SURFACE
-- ============================================================
select t.ok((select bool_and(c.relrowsecurity) from pg_class c
              where c.oid in ('public.admin_roles'::regclass, 'public.feature_overrides'::regclass, 'public.site_announcement'::regclass,
                              'public.support_tickets'::regclass, 'public.support_ticket_notes'::regclass, 'public.deleted_subjects'::regclass)),
  '45.7 RLS is on for all six new tables');
select t.ok(not exists (select 1 from information_schema.role_table_grants g
                         where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
                           and g.table_name in ('admin_roles','feature_overrides','site_announcement','support_tickets','support_ticket_notes','deleted_subjects')),
  '45.7 no client privilege on any of them');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public'
                           and p.proname in ('studio_role','require_role','admin_list_roles','admin_set_role','effective_features','admin_set_feature_override',
                                             'admin_list_feature_overrides','admin_set_announcement','admin_clear_announcement','admin_log_ticket',
                                             'admin_update_ticket','admin_list_support','admin_list_passes','admin_revoke_pass','admin_extend_pass',
                                             'admin_list_shares','admin_revoke_share','admin_export_user','admin_delete_user')
                           and has_function_privilege('anon', p.oid, 'execute')),
  '45.7 anon can execute none of the admin RPCs');
select t.ok(has_function_privilege('anon', 'public.site_announcement_now()'::regprocedure, 'execute'), '45.7 anon CAN read the banner (the one anon-callable function)');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname in ('studio_role','require_role','admin_list_roles','admin_set_role','effective_features',
                                'admin_set_feature_override','admin_list_feature_overrides','admin_set_announcement','admin_clear_announcement',
                                'admin_log_ticket','admin_update_ticket','admin_list_support','admin_list_passes','admin_revoke_pass','admin_extend_pass',
                                'admin_list_shares','admin_revoke_share','admin_export_user','admin_delete_user','site_announcement_now')
                           and (not p.prosecdef or p.proconfig is null or not (p.proconfig::text like '%search_path=public, pg_temp%'))),
  '45.7 every function is SECURITY DEFINER with search_path = public, pg_temp');
