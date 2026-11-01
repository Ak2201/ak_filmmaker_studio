-- ============================================================
-- THE CLEAN-SLATE PURGE — supabase/schema/patches/purge-test-data-2026-10-27.sql
-- ------------------------------------------------------------
-- Runs LAST, on top of every section (§61 included) and on whatever the
-- earlier check files left behind, which is the point: the database is
-- full of other people's rows, as the live one is. It COMMITS — nothing
-- runs after it, and the scratch database is dropped.
--
-- What is executed is the PATCH FILE's own PART 2 and PART 3, cut out
-- with the same awk line docs/LIVE-STEPS-2026-10-27.md §0 gives the
-- owner for the checksum — never a copy.
--
-- People (…ce0x): the keeper (its e-mail in mixed case: the match is
-- lower()), three testers. Every user-linked table gets a row; §62's
-- subscriptions and rzp_plans get a stand-in when §62 has not loaded,
-- with a key from subscriptions to invoices so the purge's retry loop
-- has to work for its order.
-- ============================================================
\set ON_ERROR_STOP on
\set purge `awk '/^-- @@ PART 2 BEGIN/,/^-- @@ PART 2 END/' supabase/schema/patches/purge-test-data-2026-10-27.sql`
\set readback `awk '/^-- @@ PART 3 BEGIN/,/^-- @@ PART 3 END/' supabase/schema/patches/purge-test-data-2026-10-27.sql`
-- a missing marker would cut out nothing: refuse that rather than test it
select 1 / (length(:'purge') > 4000 and length(:'readback') > 1000)::int as parts_cut_out;

-- 0. REFUSALS, before there is a keeper: nothing changes
create temp table before_n as select (select count(*) from auth.users) as users, (select count(*) from public.payments) as payments;
\set ON_ERROR_STOP off
:purge
\set ON_ERROR_STOP on
select t.ok((select count(*) from auth.users) = (select users from before_n)
        and (select count(*) from public.payments) = (select payments from before_n)
        and (select count(*) from auth.users) > 1,
  'purge. with no keeper it refuses and nothing is deleted');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000ce01', 'ArunKumarMohanans@Gmail.com', now(), '{"full_name":"Keeper"}');
set role authenticated;
\set ON_ERROR_STOP off
:purge
\set ON_ERROR_STOP on
reset role;
select t.ok((select count(*) from auth.users) = (select users from before_n) + 1,
  'purge. as a role other than postgres it refuses and nothing is deleted');
-- a public table nobody classified: the purge refuses rather than guess
create table public.purge_stray (x int);
\set ON_ERROR_STOP off
:purge
\set ON_ERROR_STOP on
select t.ok((select count(*) from auth.users) = (select users from before_n) + 1,
  'purge. with a public table it does not know, it refuses and nothing is deleted');
drop table public.purge_stray;

-- 1. THE SEED. Replica mode for the seed alone: the rows are made by hand
-- (an invoice, an audit row, a comment by somebody who is not auth.uid()),
-- which the guards would rightly refuse from a client.
set session_replication_role = replica;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000ce11', 'purge-t1@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-00000000ce12', 'purge-t2@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-00000000ce13', 'purge-t3@example.com', now(), '{}');

-- the keeper as it might be found: a disabled 'user' on a trial, with a
-- finance role a tester granted
insert into public.studio_members (user_id, role, disabled_at, trial_started_at, trial_minutes, trial_source, trial_scope) values
  ('00000000-0000-4000-8000-00000000ce01', 'user', now(), now(), 30, 'signup', 'sample');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-00000000ce11', 'admin'),
  ('00000000-0000-4000-8000-00000000ce12', 'user'),
  ('00000000-0000-4000-8000-00000000ce13', 'user');
insert into public.admin_roles (user_id, role, granted_by) values
  ('00000000-0000-4000-8000-00000000ce01', 'finance', '00000000-0000-4000-8000-00000000ce11'),
  ('00000000-0000-4000-8000-00000000ce11', 'owner',   null),
  ('00000000-0000-4000-8000-00000000ce12', 'support', '00000000-0000-4000-8000-00000000ce01');

-- accounts: the keeper's (on a plan) and a tester's
insert into public.accounts (id, owner_id, name, plan, plan_until, plan_period, seat_limit) values
  ('00000000-0000-4000-8000-0000000ca001', '00000000-0000-4000-8000-00000000ce01', 'Keeper Studio', 'pro', now() + interval '300 days', 'year', 5),
  ('00000000-0000-4000-8000-0000000ca011', '00000000-0000-4000-8000-00000000ce11', 'T1 Studio', 'indie', now() + interval '200 days', 'year', 3);
insert into public.account_members (account_id, invited_email, user_id, role, status, invited_by) values
  ('00000000-0000-4000-8000-0000000ca001', 'arunkumarmohanans@gmail.com', '00000000-0000-4000-8000-00000000ce01', 'owner', 'active', '00000000-0000-4000-8000-00000000ce11'),
  ('00000000-0000-4000-8000-0000000ca001', 'purge-t2@example.com', '00000000-0000-4000-8000-00000000ce12', 'owner', 'active', '00000000-0000-4000-8000-00000000ce01'),
  ('00000000-0000-4000-8000-0000000ca001', 'purge-pending@example.com', null, 'member', 'pending', '00000000-0000-4000-8000-00000000ce12'),
  ('00000000-0000-4000-8000-0000000ca011', 'purge-t1@example.com', '00000000-0000-4000-8000-00000000ce11', 'owner', 'active', null),
  ('00000000-0000-4000-8000-0000000ca011', 'arunkumarmohanans@gmail.com', '00000000-0000-4000-8000-00000000ce01', 'member', 'active', '00000000-0000-4000-8000-00000000ce11');

-- films: two of the keeper's (one in its team), one each for T1 and T2
insert into public.projects (id, owner_id, title, account_id) values
  ('00000000-0000-4000-8000-0000000cf001', '00000000-0000-4000-8000-00000000ce01', 'Keeper film', '00000000-0000-4000-8000-0000000ca001'),
  ('00000000-0000-4000-8000-0000000cf002', '00000000-0000-4000-8000-00000000ce01', 'Keeper short', null),
  ('00000000-0000-4000-8000-0000000cf011', '00000000-0000-4000-8000-00000000ce11', 'T1 film', '00000000-0000-4000-8000-0000000ca011'),
  ('00000000-0000-4000-8000-0000000cf012', '00000000-0000-4000-8000-00000000ce12', 'T2 film', null);
insert into public.project_data (project_id, scope, data, updated_by) values
  ('00000000-0000-4000-8000-0000000cf001', 'script', '{"k":"keeper words"}', '00000000-0000-4000-8000-00000000ce12'),
  ('00000000-0000-4000-8000-0000000cf001', 'scenes', '{"k":"keeper scenes"}', '00000000-0000-4000-8000-00000000ce01'),
  ('00000000-0000-4000-8000-0000000cf011', 'script', '{"k":"t1 words"}', '00000000-0000-4000-8000-00000000ce11');
insert into public.project_collaborators (project_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000cf001', '00000000-0000-4000-8000-00000000ce12', 'edit'),
  ('00000000-0000-4000-8000-0000000cf011', '00000000-0000-4000-8000-00000000ce01', 'view');
insert into public.shares (id, project_id, role, token, created_by) values
  ('00000000-0000-4000-8000-0000000c5001', '00000000-0000-4000-8000-0000000cf001', 'view', 'purge-tok-keeper', '00000000-0000-4000-8000-00000000ce01'),
  ('00000000-0000-4000-8000-0000000c5002', '00000000-0000-4000-8000-0000000cf001', 'edit', 'purge-tok-t2',     '00000000-0000-4000-8000-00000000ce12'),
  ('00000000-0000-4000-8000-0000000c5011', '00000000-0000-4000-8000-0000000cf011', 'view', 'purge-tok-t1',     '00000000-0000-4000-8000-00000000ce11');
insert into public.comments (id, project_id, scope, field_key, author_id, author_name, body, parent_id) values
  ('00000000-0000-4000-8000-0000000cc001', '00000000-0000-4000-8000-0000000cf001', 'script', 'f1', '00000000-0000-4000-8000-00000000ce01', 'Keeper', 'keeper note', null),
  ('00000000-0000-4000-8000-0000000cc002', '00000000-0000-4000-8000-0000000cf001', 'script', 'f1', '00000000-0000-4000-8000-00000000ce12', 'T2', 'tester note', null),
  ('00000000-0000-4000-8000-0000000cc003', '00000000-0000-4000-8000-0000000cf001', 'script', 'f1', '00000000-0000-4000-8000-00000000ce01', 'Keeper', 'keeper reply to tester', '00000000-0000-4000-8000-0000000cc002'),
  ('00000000-0000-4000-8000-0000000cc011', '00000000-0000-4000-8000-0000000cf011', 'script', 'f1', '00000000-0000-4000-8000-00000000ce11', 'T1', 't1 note', null);

-- money: the keeper's own year, a tester's year, a tester's week pass
insert into public.promo_codes (code, kind, percent_off, created_by, owner_user_id) values
  ('PURGE-PROMO', 'promo', 10, '00000000-0000-4000-8000-00000000ce11', null),
  ('PURGE-REF', 'referral', 10, null, '00000000-0000-4000-8000-00000000ce13');
insert into public.payments (id, user_id, account_id, plan_id, period, amount_paise, status, paid_at, razorpay_order_id, razorpay_payment_id, promo_code) values
  ('00000000-0000-4000-8000-0000000cb001', '00000000-0000-4000-8000-00000000ce01', '00000000-0000-4000-8000-0000000ca001', 'pro', 'year', 199900, 'paid', now(), 'order_purge_k', 'pay_purge_k', null),
  ('00000000-0000-4000-8000-0000000cb011', '00000000-0000-4000-8000-00000000ce11', '00000000-0000-4000-8000-0000000ca011', 'indie', 'year', 149900, 'refunded', now(), 'order_purge_1', 'pay_purge_1', 'PURGE-REF'),
  ('00000000-0000-4000-8000-0000000cb012', '00000000-0000-4000-8000-00000000ce12', null, 'pro', 'pass', 4900, 'paid', now(), 'order_purge_2', 'pay_purge_2', 'PURGE-PROMO');
insert into public.invoice_counters (fy, last_n) values ('2026-27', 900) on conflict (fy) do update set last_n = 900;
insert into public.invoices (id, number, fy, seq, payment_id, user_id, buyer_name, buyer_email, plan_id, plan_name, amount_paise) values
  ('00000000-0000-4000-8000-0000000cd001', 'FMS/2026-27/000898', '2026-27', 898, '00000000-0000-4000-8000-0000000cb001', '00000000-0000-4000-8000-00000000ce01', 'Keeper', 'arunkumarmohanans@gmail.com', 'pro', 'Pro', 199900),
  ('00000000-0000-4000-8000-0000000cd011', 'FMS/2026-27/000899', '2026-27', 899, '00000000-0000-4000-8000-0000000cb011', '00000000-0000-4000-8000-00000000ce11', 'T1', 'purge-t1@example.com', 'indie', 'Intermediate', 149900),
  ('00000000-0000-4000-8000-0000000cd012', 'FMS/2026-27/000900', '2026-27', 900, '00000000-0000-4000-8000-0000000cb012', '00000000-0000-4000-8000-00000000ce12', 'T2', 'purge-t2@example.com', 'pro', 'Pro', 4900);
insert into public.invoice_buyer_details (payment_id, user_id, gstin) values
  ('00000000-0000-4000-8000-0000000cb001', '00000000-0000-4000-8000-00000000ce01', null),
  ('00000000-0000-4000-8000-0000000cb011', '00000000-0000-4000-8000-00000000ce11', null);
insert into public.refund_requests (id, payment_id, user_id, category, status, decided_by) values
  ('00000000-0000-4000-8000-0000000ce911', '00000000-0000-4000-8000-0000000cb011', '00000000-0000-4000-8000-00000000ce11', 'other', 'refunded', '00000000-0000-4000-8000-00000000ce01'),
  ('00000000-0000-4000-8000-0000000ce901', '00000000-0000-4000-8000-0000000cb001', '00000000-0000-4000-8000-00000000ce01', 'other', 'pending', null);
insert into public.refunds (payment_id, amount_paise, reason, refunded_by, request_id) values
  ('00000000-0000-4000-8000-0000000cb011', 149900, 'test refund', '00000000-0000-4000-8000-00000000ce01', '00000000-0000-4000-8000-0000000ce911');
insert into public.referral_credits (referrer_user_id, payment_id, code, basis_paise, amount_paise, paid_by) values
  ('00000000-0000-4000-8000-00000000ce13', '00000000-0000-4000-8000-0000000cb011', 'PURGE-REF', 149900, 14990, '00000000-0000-4000-8000-00000000ce01');
insert into public.email_grants (email, role, created_by, applied_user, applied_account) values
  ('purge-t3@example.com', 'member', '00000000-0000-4000-8000-00000000ce11', '00000000-0000-4000-8000-00000000ce13', null),
  ('arunkumarmohanans@gmail.com', 'admin', '00000000-0000-4000-8000-00000000ce11', '00000000-0000-4000-8000-00000000ce01', '00000000-0000-4000-8000-0000000ca001');

-- the door: codes, tickets, redemptions, requests
insert into public.invite_codes (id, code, created_by) values
  ('00000000-0000-4000-8000-0000000c1c01', 'PURGECODE1', '00000000-0000-4000-8000-00000000ce11');
insert into public.invite_tickets (ticket_hash, code_id, expires_at, used_by) values
  ('purge-ticket', '00000000-0000-4000-8000-0000000c1c01', now() + interval '1 day', '00000000-0000-4000-8000-00000000ce12');
insert into public.invite_redemptions (code_id, user_id) values
  ('00000000-0000-4000-8000-0000000c1c01', '00000000-0000-4000-8000-00000000ce12');
update public.studio_members set invite_code_id = '00000000-0000-4000-8000-0000000c1c01'
 where user_id in ('00000000-0000-4000-8000-00000000ce01', '00000000-0000-4000-8000-00000000ce12');
insert into public.invite_requests (user_id, email, status, decided_by) values
  ('00000000-0000-4000-8000-00000000ce13', 'purge-t3@example.com', 'pending', null),
  ('00000000-0000-4000-8000-00000000ce01', 'arunkumarmohanans@gmail.com', 'declined', '00000000-0000-4000-8000-00000000ce11');

-- the funnel, leads, testimonials, the console's own records
select public.bump_event('landing_view');
insert into public.leads (email, consent_text, source) values
  ('purge-t2@example.com', 'test consent', 'start'),
  ('arunkumarmohanans@gmail.com', 'test consent', 'start');
insert into public.testimonials (author, quote, display_name, consent_text, status, approved_by, first_approved_at) values
  ('00000000-0000-4000-8000-00000000ce11', 'A quote long enough to pass the check.', 'T1', 'A consent sentence long enough to pass.', 'approved', '00000000-0000-4000-8000-00000000ce01', now()),
  ('00000000-0000-4000-8000-00000000ce01', 'The keeper wrote one of these as well.', 'Keeper', 'A consent sentence long enough to pass.', 'pending', null, null);
insert into public.admin_audit (actor, actor_email, action, target_kind, target_id) values
  ('00000000-0000-4000-8000-00000000ce11', 'purge-t1@example.com', 'purge.test', 'user', '00000000-0000-4000-8000-00000000ce12'),
  ('00000000-0000-4000-8000-00000000ce01', 'arunkumarmohanans@gmail.com', 'purge.test', 'user', '00000000-0000-4000-8000-00000000ce01');
insert into public.admin_notes (user_id, body) values
  ('00000000-0000-4000-8000-00000000ce11', 'note on a tester'),
  ('00000000-0000-4000-8000-00000000ce01', 'note on the keeper');
insert into public.support_tickets (id, email, subject, created_by, assignee) values
  ('00000000-0000-4000-8000-0000000c7001', 'purge-t1@example.com', 'help', '00000000-0000-4000-8000-00000000ce11', '00000000-0000-4000-8000-00000000ce01');
insert into public.support_ticket_notes (ticket_id, body, author) values
  ('00000000-0000-4000-8000-0000000c7001', 'a note', '00000000-0000-4000-8000-00000000ce12');
insert into public.usage_daily (day, name, plan, count) values (current_date, 'script_import', 'pro', 3)
  on conflict do nothing;
insert into public.usage_rate (user_id, hour) values ('00000000-0000-4000-8000-00000000ce11', date_trunc('hour', now()));
insert into public.sync_errors (day, scope, code, count) values (current_date, 'script', '23514', 1)
  on conflict do nothing;
insert into public.sync_error_rate (user_id, hour) values ('00000000-0000-4000-8000-00000000ce12', date_trunc('hour', now()));
insert into public.deleted_subjects (email_hash, deleted_by) values
  (encode(sha256('purge-gone@example.com'::bytea), 'hex'), '00000000-0000-4000-8000-00000000ce11') on conflict do nothing;
insert into public.user_active_sessions (user_id, session_id) values
  ('00000000-0000-4000-8000-00000000ce01', gen_random_uuid()),
  ('00000000-0000-4000-8000-00000000ce11', gen_random_uuid())
  on conflict (user_id) do nothing;
-- §66: a stored Google grant and a tour flag, the keeper's and a tester's
insert into public.google_tokens (user_id, enc_refresh) values
  ('00000000-0000-4000-8000-00000000ce01', repeat('K', 64)),
  ('00000000-0000-4000-8000-00000000ce11', repeat('T', 64))
  on conflict (user_id) do nothing;
insert into public.account_profile (user_id, tour_started_at) values
  ('00000000-0000-4000-8000-00000000ce01', now()),
  ('00000000-0000-4000-8000-00000000ce12', now())
  on conflict (user_id) do nothing;

-- configuration a tester last touched: it must survive, minus the pointer
insert into public.feature_overrides (key, scope, scope_id, enabled, set_by) values
  ('purge_global', 'global', '', true, '00000000-0000-4000-8000-00000000ce11'),
  ('purge_acct_t1', 'account', '00000000-0000-4000-8000-0000000ca011', true, '00000000-0000-4000-8000-00000000ce11'),
  ('purge_acct_k', 'account', '00000000-0000-4000-8000-0000000ca001', true, '00000000-0000-4000-8000-00000000ce11');
insert into public.site_announcement (id, text, set_by) values
  ('00000000-0000-4000-8000-0000000ca700', 'purge test announcement', '00000000-0000-4000-8000-00000000ce11');
update public.plans set updated_by = '00000000-0000-4000-8000-00000000ce11' where id = 'pro';
update public.plan_prices set updated_by = '00000000-0000-4000-8000-00000000ce11' where plan_id = 'pro';
update public.billing_settings set updated_by = '00000000-0000-4000-8000-00000000ce11' where id;

set session_replication_role = origin;

-- §62 stand-ins when §62 has not loaded: payments → subscriptions (the
-- plan's FK) and subscriptions → invoices, which the purge empties FIRST,
-- so its first pass is refused by this key and a later pass must finish.
do $$
begin
  if to_regclass('public.rzp_plans') is null then
    create table public.rzp_plans (rzp_plan_id text primary key, product text not null, period text not null,
      amount_minor int not null, currency text not null, created_at timestamptz not null default now());
  end if;
  if to_regclass('public.subscriptions') is null then
    create table public.subscriptions (id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      account_id uuid references public.accounts(id) on delete set null,
      product text not null, rzp_subscription_id text unique, rzp_plan_id text references public.rzp_plans(rzp_plan_id),
      last_invoice uuid references public.invoices(id), status text not null default 'active');
    alter table public.payments add column if not exists subscription_id uuid references public.subscriptions(id);
  end if;
end $$;
insert into public.rzp_plans (rzp_plan_id, product, period, amount_minor, currency) values ('plan_purge', 'pass', 'pass', 4900, 'INR')
  on conflict do nothing;
do $$
begin
  -- only the stand-in has these columns; a real §62 table is seeded by its own test
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'last_invoice') then
    insert into public.subscriptions (id, user_id, account_id, product, rzp_subscription_id, rzp_plan_id, last_invoice) values
      ('00000000-0000-4000-8000-0000000c5b01', '00000000-0000-4000-8000-00000000ce12', null, 'pass', 'sub_purge', 'plan_purge', '00000000-0000-4000-8000-0000000cd012');
    update public.payments set subscription_id = '00000000-0000-4000-8000-0000000c5b01' where id = '00000000-0000-4000-8000-0000000cb012';
  end if;
end $$;

select t.ok((select count(*) from public.payments where id::text like '00000000-0000-4000-8000-0000000cb0%') = 3
        and (select count(*) from public.invoices where id::text like '00000000-0000-4000-8000-0000000cd0%') = 3,
  'purge. seeded: the keeper, three testers, a row in every user-linked table');

-- what must survive, recorded before the purge
create temp table config_before as
  select 'plans' as t, md5(string_agg(row(p.id, p.name, p.active, p.limits, p.features)::text, '|' order by p.id)) as h from public.plans p
  union all select 'plan_prices', md5(string_agg(row(x.plan_id, x.currency, x.amount_minor)::text, '|' order by x.plan_id, x.currency)) from public.plan_prices x
  union all select 'billing_settings', md5((to_jsonb(b) - 'updated_by' - 'updated_at')::text) from public.billing_settings b;
create temp table gone_ids as select id from auth.users where lower(email) <> 'arunkumarmohanans@gmail.com';
create temp table gone_emails as select lower(email) as e from auth.users where lower(email) <> 'arunkumarmohanans@gmail.com' and email is not null
  union select 'purge-pending@example.com';

-- 2. THE PURGE: the patch file's PART 2, as the owner runs it
:purge

-- 3. THE READ-BACK: the patch file's PART 3, every row ok
create temp table rb as
:readback
select t.ok((select count(*) from rb) >= 30 and (select bool_and(ok) from rb),
  'purge. PART 3 read-back: every check ok (' || (select count(*) from rb) || ' rows)');
select t.ok((select count(*) from auth.users) = 1
        and (select id from auth.users) = '00000000-0000-4000-8000-00000000ce01',
  'purge. one sign-in is left, and it is the keeper');
select t.ok((select count(*) from public.admin_roles) = 1
        and exists (select 1 from public.admin_roles where user_id = '00000000-0000-4000-8000-00000000ce01' and role = 'owner'),
  'purge. admin_roles is the keeper alone, as owner (it was finance)');
select t.ok(exists (select 1 from public.studio_members m where m.user_id = '00000000-0000-4000-8000-00000000ce01'
                     and m.role = 'admin' and m.disabled_at is null and m.trial_started_at is null and m.trial_source is null
                     and m.invite_code_id is null)
        and (select count(*) from public.studio_members) = 1,
  'purge. studio_members is the keeper alone: admin, enabled, no trial');
select t.ok((select count(*) from public.payments) = 0 and (select count(*) from public.invoices) = 0
        and (select count(*) from public.invoice_counters) = 0 and (select count(*) from public.refunds) = 0
        and (select count(*) from public.refund_requests) = 0 and (select count(*) from public.referral_credits) = 0
        and (select count(*) from public.invoice_buyer_details) = 0 and (select count(*) from public.email_grants) = 0,
  'purge. no payments, invoices, counters, refunds, requests, credits or grants — the keeper''s own included');
select t.ok((select count(*) from public.events) = 0 and (select count(*) from public.leads) = 0
        and (select count(*) from public.invite_codes) = 0 and (select count(*) from public.invite_tickets) = 0
        and (select count(*) from public.invite_redemptions) = 0 and (select count(*) from public.promo_codes) = 0
        and (select count(*) from public.invite_requests) = 0 and (select count(*) from public.testimonials) = 0
        and (select count(*) from public.admin_audit) = 0 and (select count(*) from public.admin_notes) = 0
        and (select count(*) from public.support_tickets) = 0 and (select count(*) from public.support_ticket_notes) = 0
        and (select count(*) from public.deleted_subjects) = 0,
  'purge. no funnel counts, leads, codes, requests, testimonials, audit, notes, tickets or tombstones');
select t.ok((select count(*) from public.subscriptions) = 0 and (select count(*) from public.rzp_plans) = 0,
  'purge. §62: subscriptions and rzp_plans are empty');
select t.ok((select array_agg(user_id::text) from public.google_tokens) = array['00000000-0000-4000-8000-00000000ce01']
        and (select array_agg(user_id::text) from public.account_profile) = array['00000000-0000-4000-8000-00000000ce01'],
  'purge. §66: only the keeper''s Google grant and tour flag are left');
select t.ok(exists (select 1 from public.accounts a where a.id = '00000000-0000-4000-8000-0000000ca001'
                     and a.plan = 'free' and a.plan_until is null and a.plan_period is null
                     and a.seat_limit <= greatest(1, coalesce(public.plan_cap((select p.limits from public.plans p where p.id = 'free'), 'seats'), 1000)))
        and (select count(*) from public.accounts) = 1,
  'purge. the keeper''s account is kept, on no plan; the tester''s account is gone');
select t.ok((select count(*) from public.account_members) = 1
        and exists (select 1 from public.account_members m where m.account_id = '00000000-0000-4000-8000-0000000ca001'
                     and m.user_id = '00000000-0000-4000-8000-00000000ce01' and m.invited_by is null),
  'purge. account_members is the keeper''s own seat, its invited_by (a tester) cleared');
select t.ok((select count(*) from public.projects) = 2
        and (select account_id from public.projects where id = '00000000-0000-4000-8000-0000000cf001') = '00000000-0000-4000-8000-0000000ca001'
        and (select data ->> 'k' from public.project_data where project_id = '00000000-0000-4000-8000-0000000cf001' and scope = 'script') = 'keeper words'
        and (select updated_by from public.project_data where project_id = '00000000-0000-4000-8000-0000000cf001' and scope = 'script') is null
        and (select updated_by from public.project_data where project_id = '00000000-0000-4000-8000-0000000cf001' and scope = 'scenes') = '00000000-0000-4000-8000-00000000ce01',
  'purge. the keeper''s two films and their data are kept; a tester''s updated_by is cleared, the keeper''s is not');
select t.ok((select count(*) from public.comments) = 1
        and exists (select 1 from public.comments where id = '00000000-0000-4000-8000-0000000cc001')
        and (select count(*) from public.shares) = 1
        and exists (select 1 from public.shares where id = '00000000-0000-4000-8000-0000000c5001')
        and (select count(*) from public.project_collaborators) = 0,
  'purge. on the keeper''s film: its own comment and share stay; a tester''s comment (and the reply under it), share and seat go');
select t.ok((select count(*) from public.feature_overrides where key like 'purge_%') = 2
        and not exists (select 1 from public.feature_overrides where key = 'purge_acct_t1')
        and (select set_by from public.feature_overrides where key = 'purge_global') is null
        and exists (select 1 from public.site_announcement where id = '00000000-0000-4000-8000-0000000ca700' and set_by is null),
  'purge. configuration stays (global and keeper overrides, the announcement); a deleted account''s override goes');
select t.ok(not exists (
          select 1 from config_before b
           where b.h is distinct from (case b.t
             when 'plans' then (select md5(string_agg(row(p.id, p.name, p.active, p.limits, p.features)::text, '|' order by p.id)) from public.plans p)
             when 'plan_prices' then (select md5(string_agg(row(x.plan_id, x.currency, x.amount_minor)::text, '|' order by x.plan_id, x.currency)) from public.plan_prices x)
             when 'billing_settings' then (select md5((to_jsonb(s) - 'updated_by' - 'updated_at')::text) from public.billing_settings s) end))
        and (select updated_by from public.plans where id = 'pro') is null,
  'purge. plans, plan_prices and billing_settings are unchanged (a tester''s updated_by is cleared)');
select t.ok(public.price_notice() is not null and (public.price_notice() -> 'plans') is not null,
  'purge. price_notice() still answers');

-- 4. THE NET for a forgotten table. (a) Every foreign key, in any schema,
-- that points at auth.users: no row names anybody but the keeper. (b) Every
-- uuid column of every public table: no deleted person's id survives — this
-- is what sees a user id with NO key (invoices.user_id, admin_audit.actor).
-- (c) Every text column of every public table: no deleted person's e-mail.
do $$
declare
  r record; n bigint; bad text[] := '{}';
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
  loop
    execute format('select count(*) from %s where %I is not null and %I <> %L::uuid', r.tbl, r.col, r.col, '00000000-0000-4000-8000-00000000ce01') into n;
    if n > 0 then bad := bad || format('%s.%s (%s)', r.tbl, r.col, n); end if;
  end loop;
  perform t.ok(cardinality(bad) = 0, 'purge. every FK to auth.users names only the keeper' || coalesce(': ' || nullif(array_to_string(bad, ', '), ''), ''));

  bad := '{}';
  for r in
    select c.table_name as tbl, c.column_name as col
      from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.data_type = 'uuid'
  loop
    execute format('select count(*) from public.%I where %I in (select id from gone_ids)', r.tbl, r.col) into n;
    if n > 0 then bad := bad || format('%s.%s (%s)', r.tbl, r.col, n); end if;
  end loop;
  perform t.ok(cardinality(bad) = 0, 'purge. no uuid column of any public table holds a deleted person''s id' || coalesce(': ' || nullif(array_to_string(bad, ', '), ''), ''));

  bad := '{}';
  for r in
    select c.table_name as tbl, c.column_name as col
      from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.data_type in ('text', 'character varying')
  loop
    execute format('select count(*) from public.%I where lower(%I) in (select e from gone_emails)', r.tbl, r.col) into n;
    if n > 0 then bad := bad || format('%s.%s (%s)', r.tbl, r.col, n); end if;
  end loop;
  perform t.ok(cardinality(bad) = 0, 'purge. no text column of any public table holds a deleted person''s e-mail' || coalesce(': ' || nullif(array_to_string(bad, ', '), ''), ''));
end $$;

-- 5. the guard triggers are back on after the commit
select t.ok((select count(*) from pg_trigger where tgname in ('admin_audit_no_change', 'account_members_guard', 'comments_guard_delete') and tgenabled = 'O') = 3,
  'purge. the three guard triggers it stood down are enabled again');
-- and a second run is harmless: one keeper, nothing left to delete
:purge
select t.ok((select count(*) from auth.users) = 1 and (select count(*) from public.projects) = 2,
  'purge. a second run changes nothing');
