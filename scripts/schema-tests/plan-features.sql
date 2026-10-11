-- ============================================================
-- SECTION 35 CHECKS — plan features from the matrix
-- ------------------------------------------------------------
-- The checks listed at 35.1, executed. Runs after the whole schema
-- (§35 included) has loaded twice, with its own people (…3501 upward).
-- The literal maps are not restated here: `npm run test:plans` proves
-- §35's text is what src/data/plan-matrix.json generates, so these
-- checks ask the database what billing_status() SERVES from it, and
-- spot-check the owner's split by module id.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003501', 'pf-basic@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003502', 'pf-inter@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003503', 'pf-pro@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000003504', 'pf-grant@example.com', now(), '{}');

begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003501', 'starter', 'lifetime')), 'order_pf1');
select public.activate_payment('order_pf1', 'pay_pf1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003502', 'indie', 'lifetime')), 'order_pf2');
select public.activate_payment('order_pf2', 'pay_pf2');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003503', 'pro', 'lifetime')), 'order_pf3');
select public.activate_payment('order_pf3', 'pay_pf3');
commit;

-- 1. the rows ------------------------------------------------------------
select t.ok((select features from public.plans where id = 'free') = '{"sample_only": true, "new_projects": false}'::jsonb,
  '35. (1) the free row (the trial / no-plan state) is the section 18 seed, untouched');
select t.ok((select bool_and(not (features ? 'sample_only')) from public.plans where id in ('starter','indie','pro')),
  '35. (1) no paid map carries sample_only');
select t.ok((select bool_and(jsonb_typeof(v) = 'boolean') from public.plans p, jsonb_each(p.features) e(k, v) where p.id in ('starter','indie','pro')),
  '35. (1) every value is true or false');
select t.ok((select count(*) from public.plans p, jsonb_each(p.features) e(k, v) where p.id = 'pro' and v = 'false'::jsonb) = 0,
  '35. (1) Pro: nothing is false — everything');
-- each plan is a superset of the one below it
select t.ok(not exists (select 1 from public.plans lo, jsonb_each(lo.features) e(k, v), public.plans hi
                         where (lo.id, hi.id) in (('starter','indie'), ('indie','pro'))
                           and v = 'true'::jsonb and (hi.features -> k) is distinct from 'true'::jsonb),
  '35. (1) Basic ⊆ Intermediate ⊆ Pro');
select t.ok((select (limits ->> 'extension')::bool from public.plans where id = 'starter') = false
        and (select (limits ->> 'extension')::bool from public.plans where id = 'indie')
        and (select (limits ->> 'extension')::bool from public.plans where id = 'pro'),
  '35. (4) limits.extension: off on Basic, on for Intermediate and Pro');
select t.ok((select limits ? 'projects' and limits ? 'seats' from public.plans where id = 'starter'),
  '35. (4) the other caps are kept (merged, not replaced)');

-- 2. billing_status() serves each buyer their plan's map, purchases required
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true}');
select t.reset();

select t.claims('00000000-0000-4000-8000-000000003501');
select t.ok((public.billing_status() ->> 'plan') = 'starter'
        and (public.billing_status() -> 'features') = (select features from public.plans where id = 'starter'),
  '35. (2) Basic buyer: billing_status().features = the starter row');
select t.ok((public.billing_status() -> 'features' ->> 'screenplay')::bool and (public.billing_status() -> 'features' ->> 'revisions')::bool
        and (public.billing_status() -> 'features' ->> 'import-script')::bool and (public.billing_status() -> 'features' ->> 'case-studies')::bool
        and (public.billing_status() -> 'features' ->> 'exports')::bool and (public.billing_status() -> 'features' ->> 'new_projects')::bool,
  '35. (2) Basic: Script, Drafts, Import, the Library, exports and new projects are on');
select t.ok(not (public.billing_status() -> 'features' ->> 'budget')::bool and not (public.billing_status() -> 'features' ->> 'shoot-day')::bool
        and not (public.billing_status() -> 'features' ->> 'drive_backup')::bool and not (public.billing_status() -> 'features' ->> 'ai_tools')::bool,
  '35. (2) Basic: Budget, Shoot Day, Drive and AI are off');
select t.reset();

select t.claims('00000000-0000-4000-8000-000000003502');
select t.ok((public.billing_status() ->> 'plan') = 'indie'
        and (public.billing_status() -> 'features') = (select features from public.plans where id = 'indie'),
  '35. (2) Intermediate buyer: billing_status().features = the indie row');
select t.ok((public.billing_status() -> 'features' ->> 'budget')::bool and (public.billing_status() -> 'features' ->> 'stripboard')::bool
        and (public.billing_status() -> 'features' ->> 'drive_backup')::bool
        and not (public.billing_status() -> 'features' ->> 'shoot-day')::bool and not (public.billing_status() -> 'features' ->> 'call-sheets')::bool
        and not (public.billing_status() -> 'features' ->> 'ai_tools')::bool,
  '35. (2) Intermediate: Budget, Stripboard and Drive on; Shoot Day, Call Sheets and AI off');
select t.reset();

select t.claims('00000000-0000-4000-8000-000000003503');
select t.ok((public.billing_status() ->> 'plan') = 'pro'
        and (public.billing_status() -> 'features') = (select features from public.plans where id = 'pro'),
  '35. (2) Pro buyer: billing_status().features = the pro row');
select t.ok((public.billing_status() -> 'features' ->> 'shoot-day')::bool and (public.billing_status() -> 'features' ->> 'deliverables')::bool
        and (public.billing_status() -> 'features' ->> 'ai_tools')::bool and (public.billing_status() -> 'features' ->> 'remove_branding')::bool,
  '35. (2) Pro: Shoot Day, Deliverables, AI and Remove branding on');
select t.reset();

-- 3b. a plan-less e-mail grant, purchases required -> open_features() = Pro's
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000003504', 'user');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_email('pf-grant@example.com', 'member', null, null, null);
select t.reset();
select t.claims('00000000-0000-4000-8000-000000003504');
select t.ok((public.billing_status() ->> 'granted')::bool and (public.billing_status() ->> 'plan') = 'free'
        and (public.billing_status() -> 'features') = (select features from public.plans where id = 'pro'),
  '35. (3) ON: a plan-less e-mail grant gets open_features() — Pro''s map');
select t.reset();
rollback;

-- 3a. purchases NOT required -> everybody's map is open_features() = Pro's
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": false}');
select t.reset();
select t.ok(public.open_features() = (select features from public.plans where id = 'pro'), '35. (3) open_features() is Pro''s map');
select t.claims('00000000-0000-4000-8000-000000003501');
select t.ok((public.billing_status() -> 'features') = (select features from public.plans where id = 'pro'),
  '35. (3) OFF: even the Basic buyer is served Pro''s map — nothing held back');
select t.reset();
rollback;
