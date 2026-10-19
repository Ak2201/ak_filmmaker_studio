-- ============================================================
-- SECTION 49 CHECKS — the security follow-ups
-- ------------------------------------------------------------
-- Runs after §48 and §49 have loaded (security-49-seed.sql went in
-- before §49's first load). Own people (…4901 upward). The base admin
-- …000a is the owner §45's backfill made. Every check here was written
-- against the pre-§49 database first and failed there.
-- ============================================================
\set ON_ERROR_STOP on

create or replace function t.raises(p_sql text, p_state text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlstate = p_state;
end $$;
grant execute on function t.raises(text, text) to anon, authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004901', 's49-promo1@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004902', 's49-promo2@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004903', 's49-stale1@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004904', 's49-stale2@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004905', 's49-xfer@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000004906', 's49-xfer-to@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004908', 's49-dup-new@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004909', 's49-credit@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004911', 's49-support@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004912', 's49-finance@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004913', 's49-user@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000004914', 's49-owner2@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004921', 's49-filmer@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004922', 's49-c1@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000004923', 's49-c2@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000004924', 's49-c3@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000004931', 's49-shareown@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004932', 's49-claimer@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004933', 's49-manual@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004934', 's49-twoview@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004941', 's49-team@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000004942', 's49-teammate@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004951', 's49-referrer@example.com', now(), '{}');

-- ============================================================
-- 49.1 A LIMITED CODE IS RESERVED WHEN AN ORDER OPENS
-- ============================================================
insert into public.promo_codes (code, percent_off, max_uses, note) values
  ('S49-ONE', 100, 1, 'one use'),
  ('S49-STALE', 50, 1, 'one use, stale order');

begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004901', 'indie', 'lifetime', null, 'S49-ONE')), 'order_49p1');
select t.ok(t.raises($$select public.create_pending_payment('00000000-0000-4000-8000-000000004902', 'indie', 'lifetime', null, 'S49-ONE')$$, '22023'),
  '49.1 a second buyer cannot open an order on a max_uses=1 code another buyer holds open -> 22023');
-- the holder may open again (a dismissed checkout re-tried)
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004901', 'indie', 'lifetime', null, 'S49-ONE')), 'order_49p2');
select t.ok(true, '49.1 the buyer holding the reservation can re-open their own order');
select public.activate_payment('order_49p1', 'pay_49p1');
select t.ok(t.raises($$select public.activate_payment('order_49p2', 'pay_49p2')$$, '22023'),
  '49.1 a second payment on a used-up code is refused at activation -> 22023');
select t.reset();
select t.ok((select uses from public.promo_codes where code = 'S49-ONE') = 1,
  '49.1 and the code''s uses stays at its max_uses (1), not past it');
select t.ok((select status from public.payments where razorpay_order_id = 'order_49p2') = 'created',
  '49.1 the refused payment is left unpaid for the console');

-- a reservation lapses after an hour; the late payer is then refused
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004903', 'indie', 'lifetime', null, 'S49-STALE')), 'order_49s1');
select t.reset();
update public.payments set created_at = now() - interval '2 hours' where razorpay_order_id = 'order_49s1';
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004904', 'indie', 'lifetime', null, 'S49-STALE')), 'order_49s2');
select public.activate_payment('order_49s2', 'pay_49s2');
select t.ok(t.raises($$select public.activate_payment('order_49s1', 'pay_49s1')$$, '22023'),
  '49.1 an order opened more than an hour ago and paid after the code filled -> 22023');
select t.reset();
select t.ok((select uses from public.promo_codes where code = 'S49-STALE') = 1, '49.1 the stale code also stops at 1 use');
rollback;

-- ============================================================
-- 49.2 UPGRADE CREDIT FOLLOWS THE ORGANISATION
-- ============================================================
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004905', 'indie', 'lifetime')), 'order_49x1');
select public.activate_payment('order_49x1', 'pay_49x1');
select t.reset();
-- the buyer hands the paid organisation to somebody else
select t.claims('00000000-0000-4000-8000-000000004905');
update public.accounts set owner_id = '00000000-0000-4000-8000-000000004906' where owner_id = '00000000-0000-4000-8000-000000004905';
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000004905') = 'free', '49.2 fixture: after the transfer the buyer owns no paid organisation');
select t.service();
select t.ok((public.quote_for('00000000-0000-4000-8000-000000004905', 'indie') ->> 'amount_paise')::int = public.effective_price('indie')
        and (public.quote_for('00000000-0000-4000-8000-000000004905', 'indie') ->> 'credit_paise')::int = 0,
  '49.2 a payment on an organisation given away is not credit: the re-buy is the full price, not the Rs 1 floor');
select t.reset();
rollback;

-- ============================================================
-- 49.3 A DUPLICATE IS NOT CREDIT; A CREDITED PAYMENT IS NOT REFUNDED UNDER AN UPGRADE
-- ============================================================
select t.ok((select plan_applied from public.payments where razorpay_order_id = 'order_49d1') = true
        and (select plan_applied from public.payments where razorpay_order_id = 'order_49d2') = false,
  '49.3 backfill: of a duplicate pair paid before §49 the first applied the plan and the second did not');
begin;
select t.service();
select t.ok((public.quote_for('00000000-0000-4000-8000-000000004907', 'pro') ->> 'credit_paise')::int
          = (select amount_paise from public.payments where razorpay_order_id = 'order_49d1'),
  '49.3 backfill: an upgrade after a duplicate is credited ONE Basic, not two');
rollback;

begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004908', 'starter', 'lifetime')), 'order_49n1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004908', 'starter', 'lifetime')), 'order_49n2');
select public.activate_payment('order_49n1', 'pay_49n1');
select public.activate_payment('order_49n2', 'pay_49n2');
select t.ok((select plan_applied from public.payments where razorpay_order_id = 'order_49n2') = false,
  '49.3 activate_payment records that a duplicate applied no plan');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004908', 'pro', 'lifetime')), 'order_49n3');
select t.ok((select credit_paise from public.payments where razorpay_order_id = 'order_49n3')
          = (select amount_paise from public.payments where razorpay_order_id = 'order_49n1'),
  '49.3 the upgrade is credited one Basic');
select public.activate_payment('order_49n3', 'pay_49n3');
select t.ok(t.raises($$select public.begin_refund((select id from public.payments where razorpay_order_id = 'order_49n1'), null, 'x', '00000000-0000-4000-8000-00000000000a')$$, '22023'),
  '49.3 refunding the Basic payment that was credited toward Pro -> 22023 (refund the upgrade first)');
select t.ok((public.begin_refund((select id from public.payments where razorpay_order_id = 'order_49n2'), null, 'duplicate charge', '00000000-0000-4000-8000-00000000000a') ->> 'refund_id') is not null,
  '49.3 the duplicate, which was never credited, is still refundable');
select t.reset();
rollback;

-- an order priced with a credit that is refunded before it is paid
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004909', 'starter', 'lifetime')), 'order_49c1');
select public.activate_payment('order_49c1', 'pay_49c1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004909', 'pro', 'lifetime')), 'order_49c2');
select public.mark_payment_refunded('pay_49c1');
select t.ok(t.raises($$select public.activate_payment('order_49c2', 'pay_49c2')$$, '22023'),
  '49.3 an upgrade order priced with a credit that was refunded before payment -> 22023 at activation');
select t.reset();
rollback;

-- ============================================================
-- 49.4 SUPPORT CANNOT LOCK AN ADMINISTRATOR OUT
-- ============================================================
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004911', 'admin'),
  ('00000000-0000-4000-8000-000000004912', 'admin'),
  ('00000000-0000-4000-8000-000000004913', 'user'),
  ('00000000-0000-4000-8000-000000004914', 'admin');
insert into public.admin_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000004911', 'support'),
  ('00000000-0000-4000-8000-000000004912', 'finance'),
  ('00000000-0000-4000-8000-000000004914', 'owner')
on conflict (user_id) do update set role = excluded.role;

begin;
select t.claims('00000000-0000-4000-8000-000000004911');
select t.ok(t.raises($$select public.admin_terminate_session('00000000-0000-4000-8000-00000000000a', true)$$, '42501'),
  '49.4 a SUPPORT admin disabling an OWNER -> 42501');
select t.ok(t.raises($$select public.admin_terminate_session('00000000-0000-4000-8000-000000004912', true)$$, '42501'),
  '49.4 a SUPPORT admin disabling a FINANCE admin -> 42501');
select public.admin_terminate_session('00000000-0000-4000-8000-00000000000a', false);
select t.ok(true, '49.4 support may still end an administrator''s session without disabling them');
select public.admin_terminate_session('00000000-0000-4000-8000-000000004913', true);
select t.reset();
select t.ok((select disabled_at from public.studio_members where user_id = '00000000-0000-4000-8000-000000004913') is not null,
  '49.4 support may still disable an ordinary member');
select t.ok((select disabled_at from public.studio_members where user_id = '00000000-0000-4000-8000-00000000000a') is null,
  '49.4 and the owner is still enabled');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_terminate_session('00000000-0000-4000-8000-000000004914', true);
select t.reset();
select t.ok((select disabled_at from public.studio_members where user_id = '00000000-0000-4000-8000-000000004914') is not null,
  '49.4 an owner may disable another owner while one stays enabled');
rollback;

-- ============================================================
-- 49.5 NO CROSS-USER PLAN / MEMBERSHIP ORACLE
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000004913');
select t.ok(t.raises($$select public.user_plan('00000000-0000-4000-8000-000000004907')$$, '42501'),
  '49.5 authenticated user_plan(<someone else>) -> 42501');
select t.ok(t.raises($$select public.user_limits('00000000-0000-4000-8000-000000004907')$$, '42501'),
  '49.5 authenticated user_limits(<someone else>) -> 42501');
select t.ok(t.raises($$select public.is_entitled('00000000-0000-4000-8000-000000004907')$$, '42501'),
  '49.5 authenticated is_entitled(<someone else>) -> 42501');
select t.ok(t.raises($$select public.is_studio_member('00000000-0000-4000-8000-000000004907')$$, '42501'),
  '49.5 authenticated is_studio_member(<someone else>) -> 42501');
select t.ok(t.raises($$select public.account_plan((select id from public.accounts limit 1))$$, '42501'),
  '49.5 authenticated account_plan(<any account>) -> 42501');
select t.ok(public.billing_status() ? 'plan' and exists (select 1 from public.studio_status()),
  '49.5 the caller''s own answers still come through billing_status() and studio_status()');
select t.reset();
rollback;

-- ============================================================
-- 49.6 A SCREENING PASS IS FOR A FILM THE ADMINISTRATOR OWNS
-- ============================================================
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000a4901', '00000000-0000-4000-8000-00000000000a', 'Owner film'),
  ('00000000-0000-4000-8000-0000000a4902', '00000000-0000-4000-8000-000000004913', 'Somebody else''s film');
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_create_invite('screening_pass', 3, now() + interval '1 day', '00000000-0000-4000-8000-0000000a4902', 'x')$$, '42501'),
  '49.6 a screening pass for a film the administrator does not own -> 42501');
select t.ok((public.admin_create_invite('screening_pass', 3, now() + interval '1 day', '00000000-0000-4000-8000-0000000a4901', 'mine')).target_project_id
          = '00000000-0000-4000-8000-0000000a4901',
  '49.6 a screening pass for the administrator''s own film is made');
select t.ok((public.admin_create_invite('standard', 1, null, null, 'plain')).id is not null,
  '49.6 a standard code (no film) is unchanged');
select t.reset();
rollback;

-- ============================================================
-- 49.7 THE COLLABORATOR CAP HOLDS ON A MOVE
-- 49.8 A FILM IS NOT HANDED TO SOMEBODY WHO DID NOT ASK
-- ============================================================
begin;
update public.billing_settings set purchase_required = true where id;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004921', 'starter', 'lifetime')), 'order_49f1');
select public.activate_payment('order_49f1', 'pay_49f1');
select t.reset();
select t.ok(public.plan_cap(public.user_limits('00000000-0000-4000-8000-000000004921'), 'collaborators') = 2,
  '49.7 fixture: the Basic plan allows 2 collaborators per film');
select t.claims('00000000-0000-4000-8000-000000004921');
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000a4921', '00000000-0000-4000-8000-000000004921', 'Film A'),
  ('00000000-0000-4000-8000-0000000a4922', '00000000-0000-4000-8000-000000004921', 'Film B');
insert into public.project_collaborators (project_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000a4921', '00000000-0000-4000-8000-000000004922', 'view'),
  ('00000000-0000-4000-8000-0000000a4921', '00000000-0000-4000-8000-000000004923', 'view'),
  ('00000000-0000-4000-8000-0000000a4922', '00000000-0000-4000-8000-000000004924', 'view');
select t.ok(t.raises($$update public.project_collaborators set project_id = '00000000-0000-4000-8000-0000000a4921'
                        where project_id = '00000000-0000-4000-8000-0000000a4922' and user_id = '00000000-0000-4000-8000-000000004924'$$, 'P0402'),
  '49.7 moving a third collaborator onto a full film by UPDATE -> P0402');
update public.project_collaborators set role = 'comment'
 where project_id = '00000000-0000-4000-8000-0000000a4921' and user_id = '00000000-0000-4000-8000-000000004922';
select t.ok(true, '49.7 changing a collaborator''s role on a full film is not a new seat');
select t.ok(t.raises($$update public.projects set owner_id = '00000000-0000-4000-8000-000000004922' where id = '00000000-0000-4000-8000-0000000a4921'$$, '42501'),
  '49.8 the owner handing a film to another user -> 42501');
select t.reset();
rollback;

-- ============================================================
-- 49.9 A LINK'S GRANT LIVES AND DIES WITH THE LINK THAT GAVE IT
-- ============================================================
begin;
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000004931', 'user') on conflict do nothing;
insert into public.projects (id, owner_id, title) values ('00000000-0000-4000-8000-0000000a4931', '00000000-0000-4000-8000-000000004931', 'Shared film');
insert into public.shares (id, project_id, role, token, expires_at, created_by) values
  ('00000000-0000-4000-8000-0000000b4931', '00000000-0000-4000-8000-0000000a4931', 'edit', 's49-edit-7d',  now() + interval '7 days', '00000000-0000-4000-8000-000000004931'),
  ('00000000-0000-4000-8000-0000000b4932', '00000000-0000-4000-8000-0000000a4931', 'view', 's49-view-forever', null, '00000000-0000-4000-8000-000000004931'),
  ('00000000-0000-4000-8000-0000000b4933', '00000000-0000-4000-8000-0000000a4931', 'edit', 's49-edit-1d',  now() + interval '1 day', '00000000-0000-4000-8000-000000004931'),
  ('00000000-0000-4000-8000-0000000b4934', '00000000-0000-4000-8000-0000000a4931', 'view', 's49-view-1d',  now() + interval '1 day', '00000000-0000-4000-8000-000000004931');
insert into public.project_collaborators (project_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000a4931', '00000000-0000-4000-8000-000000004933', 'view');
select t.claims('00000000-0000-4000-8000-000000004932');
select public.claim_share('s49-edit-7d');
select public.claim_share('s49-view-forever');
select t.reset();
select t.ok((select role = 'edit' and via_share = '00000000-0000-4000-8000-0000000b4931' and expires_at is not null
               from public.project_collaborators where user_id = '00000000-0000-4000-8000-000000004932'),
  '49.9 a later view link does not re-point or un-expire an edit grant (still the edit link''s, still expiring)');
delete from public.shares where id = '00000000-0000-4000-8000-0000000b4931';
select t.claims('00000000-0000-4000-8000-000000004932');
select t.ok(not public.has_project_access('00000000-0000-4000-8000-0000000a4931', 'edit'),
  '49.9 revoking the edit link takes the edit access with it');
select t.reset();
-- a manual grant is the owner's; a link never changes it
select t.claims('00000000-0000-4000-8000-000000004933');
select public.claim_share('s49-edit-1d');
select t.ok(not public.has_project_access('00000000-0000-4000-8000-0000000a4931', 'edit'),
  '49.9 an expiring edit link does not turn a manual view grant into a permanent edit grant');
select t.ok(public.has_project_access('00000000-0000-4000-8000-0000000a4931', 'view'),
  '49.9 and the manual view grant stands');
select t.reset();
-- two links of the same role: the longer-lived one owns the grant
select t.claims('00000000-0000-4000-8000-000000004934');
select public.claim_share('s49-view-1d');
select public.claim_share('s49-view-forever');
select t.reset();
select t.ok((select via_share = '00000000-0000-4000-8000-0000000b4932' and expires_at is null
               from public.project_collaborators where user_id = '00000000-0000-4000-8000-000000004934'),
  '49.9 two view links: the grant belongs to the one that lasts longer');
rollback;

-- ============================================================
-- 49.10 AN OWNER MAY RESOLVE A COMMENT, NOT REWRITE IT
-- 49.11 A SHARE IS CREATED BY ITS CREATOR
-- ============================================================
begin;
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000004931', 'user') on conflict do nothing;
insert into public.projects (id, owner_id, title) values ('00000000-0000-4000-8000-0000000a4935', '00000000-0000-4000-8000-000000004931', 'Commented film');
insert into public.project_collaborators (project_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000a4935', '00000000-0000-4000-8000-000000004932', 'comment');
select t.claims('00000000-0000-4000-8000-000000004932');
insert into public.comments (id, project_id, scope, field_key, body)
values ('00000000-0000-4000-8000-0000000c4935', '00000000-0000-4000-8000-0000000a4935', 'feature', 'logline', 'original words');
update public.comments set body = 'my own edit' where id = '00000000-0000-4000-8000-0000000c4935';
select t.ok(true, '49.10 the author may edit their own comment');
select t.claims('00000000-0000-4000-8000-000000004931');
select t.ok(t.raises($$update public.comments set body = 'forged words' where id = '00000000-0000-4000-8000-0000000c4935'$$, '42501'),
  '49.10 the project owner rewriting a collaborator''s comment -> 42501');
update public.comments set status = 'resolved' where id = '00000000-0000-4000-8000-0000000c4935';
select t.reset();
select t.ok((select status = 'resolved' and body = 'my own edit' from public.comments where id = '00000000-0000-4000-8000-0000000c4935'),
  '49.10 the owner may still resolve it, and the words are the author''s');
select t.ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'sh_owner_all'),
  '49.11 the orphaned sh_owner_all policy is gone');
select t.claims('00000000-0000-4000-8000-000000004931');
select t.ok(t.raises($$insert into public.shares (project_id, role, token, created_by)
                        values ('00000000-0000-4000-8000-0000000a4935', 'view', 's49-forged', '00000000-0000-4000-8000-000000004932')$$, '42501'),
  '49.11 an owner minting a share that names someone else as its creator -> 42501');
select t.reset();
rollback;

-- ============================================================
-- 49.12 AN ANONYMOUS SESSION CANNOT START A TRIAL
-- 49.13 THE TICKET SWEEP IS INDEXED
-- ============================================================
begin;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000004961', null, '{}');
select t.claims('00000000-0000-4000-8000-000000004961', 'authenticated', '{"is_anonymous": true}');
select t.ok(t.raises($$select public.start_trial()$$, '42501'), '49.12 start_trial() from an anonymous session -> 42501');
select t.reset();
select t.ok(not exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000004961'),
  '49.12 and no membership was made');
rollback;
select t.ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'invite_tickets' and indexdef like '%(expires_at)%'),
  '49.13 invite_tickets has an index on expires_at for the sweep');

-- ============================================================
-- 49.14 A TEAM'S DELETION OR A MEMBER'S REMOVAL NEVER TAKES A MEMBER'S FILM
-- ============================================================
begin;
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004941', 'user'), ('00000000-0000-4000-8000-000000004942', 'user') on conflict do nothing;
insert into public.accounts (id, name, owner_id, plan, seat_limit) values ('00000000-0000-4000-8000-0000000d4941', 'S49 Team', '00000000-0000-4000-8000-000000004941', 'pro', 5);
insert into public.account_members (account_id, user_id, invited_email, role, status) values
  ('00000000-0000-4000-8000-0000000d4941', '00000000-0000-4000-8000-000000004941', 's49-team@example.com', 'owner', 'active'),
  ('00000000-0000-4000-8000-0000000d4941', '00000000-0000-4000-8000-000000004942', 's49-teammate@example.com', 'member', 'active');
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000a4941', '00000000-0000-4000-8000-000000004942', 'Member film 1'),
  ('00000000-0000-4000-8000-0000000a4942', '00000000-0000-4000-8000-000000004942', 'Member film 2');
select t.claims('00000000-0000-4000-8000-000000004942');
update public.projects set account_id = '00000000-0000-4000-8000-0000000d4941' where owner_id = '00000000-0000-4000-8000-000000004942';
select t.claims('00000000-0000-4000-8000-000000004941');
delete from public.accounts where id = '00000000-0000-4000-8000-0000000d4941';
select t.reset();
select t.ok((select count(*) from public.projects where owner_id = '00000000-0000-4000-8000-000000004942' and account_id is null) = 2,
  '49.14 deleting a team account detaches the member''s films instead of deleting them');
rollback;
begin;
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004941', 'user'), ('00000000-0000-4000-8000-000000004942', 'user') on conflict do nothing;
insert into public.accounts (id, name, owner_id, plan, seat_limit) values ('00000000-0000-4000-8000-0000000d4942', 'S49 Team 2', '00000000-0000-4000-8000-000000004941', 'pro', 5);
insert into public.account_members (account_id, user_id, invited_email, role, status) values
  ('00000000-0000-4000-8000-0000000d4942', '00000000-0000-4000-8000-000000004941', 's49-team@example.com', 'owner', 'active'),
  ('00000000-0000-4000-8000-0000000d4942', '00000000-0000-4000-8000-000000004942', 's49-teammate@example.com', 'member', 'active');
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000a4943', '00000000-0000-4000-8000-000000004942', 'Member film 3');
select t.claims('00000000-0000-4000-8000-000000004942');
update public.projects set account_id = '00000000-0000-4000-8000-0000000d4942' where id = '00000000-0000-4000-8000-0000000a4943';
select t.claims('00000000-0000-4000-8000-000000004941');
select t.ok(public.has_project_access('00000000-0000-4000-8000-0000000a4943', 'edit'),
  '49.14 fixture: while the member is in the team, the team owner can edit their film');
delete from public.account_members where account_id = '00000000-0000-4000-8000-0000000d4942' and user_id = '00000000-0000-4000-8000-000000004942';
select t.ok(not public.has_project_access('00000000-0000-4000-8000-0000000a4943', 'view'),
  '49.14 removing a member takes their film out of the team: the team owner keeps no access to it');
select t.reset();
select t.ok((select account_id from public.projects where id = '00000000-0000-4000-8000-0000000a4943') is null,
  '49.14 and the film is the member''s alone again');
rollback;

-- ============================================================
-- 49.15 A DELETED MEMBER'S ADDRESS DOES NOT OUTLIVE THEM IN A REFERRAL CODE
-- ============================================================
select t.ok((select note not like '%@%' and not active from public.promo_codes where code = 'REF-S49OLD'),
  '49.15 backfill: an orphaned referral code no longer carries an address and is withdrawn');
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004951', 'starter', 'lifetime')), 'order_49r1');
select public.activate_payment('order_49r1', 'pay_49r1');
select t.reset();
select t.ok(exists (select 1 from public.promo_codes where kind = 'referral' and owner_user_id = '00000000-0000-4000-8000-000000004951' and note like '%s49-referrer@%'),
  '49.15 fixture: paying minted a referral code noting the member''s address');
create temp table _ref as select code from public.promo_codes where kind = 'referral' and owner_user_id = '00000000-0000-4000-8000-000000004951';
delete from public.accounts where owner_id = '00000000-0000-4000-8000-000000004951';
delete from auth.users where id = '00000000-0000-4000-8000-000000004951';
select t.ok((select note not like '%@%' and not active and owner_user_id is null from public.promo_codes where code = (select code from _ref)),
  '49.15 deleting the account scrubs the address from the code and withdraws it');
rollback;
