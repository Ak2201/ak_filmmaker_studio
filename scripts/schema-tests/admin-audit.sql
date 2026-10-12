-- ============================================================
-- SECTION 40 CHECKS — the admin audit log, and nineteen restated writers
-- ------------------------------------------------------------
-- The checks listed at 40.6, executed. Runs after §40 has loaded on top of
-- everything else, with its own people (…4001 upward). (…00a) is the
-- administrator. Most of the file runs inside ONE transaction that is
-- rolled back at the end, so the database is left as it was found; the
-- atomicity and append-only checks do their own. Earlier files in this
-- run have already written audit rows (they call the restated writers),
-- so every lookup here is bounded below by a timestamp taken at the top.
--
--   A  nobody but the owner's own definer bodies can write; only an admin reads
--   B  every restated writer refuses a member and anon, as it always did
--   C  every restated writer leaves exactly the row it should, and the
--      refusals the originals made still leave NONE
--   D  the reader: filters, the person convention, keyset paging
--   E  append-only
--   F  an audit row and its action commit together or not at all
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004001', 'aud-one@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004002', 'aud-two@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004003', 'aud-three@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004004', 'aud-four@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004005', 'aud-five@example.com',  now(), '{}')
on conflict (id) do nothing;
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004001', 'user'),
  ('00000000-0000-4000-8000-000000004003', 'user'),
  ('00000000-0000-4000-8000-000000004004', 'user')
on conflict (user_id) do nothing;

-- ============================================================
-- A. who can write, who can read
-- ============================================================
select t.reset();
select t.ok((select relrowsecurity from pg_class where oid = 'public.admin_audit'::regclass),
  '40.1 admin_audit has RLS on');
select t.ok(not exists (select 1 from information_schema.table_privileges
                         where table_schema = 'public' and table_name = 'admin_audit'
                           and grantee in ('anon', 'authenticated', 'PUBLIC')),
  '40.1 and no API role holds any privilege on it');

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin perform * from public.admin_audit limit 1; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.1 even an admin cannot SELECT the table: permission denied'; end $$;
do $$ begin insert into public.admin_audit (action, target_kind, target_id) values ('x', 'y', 'z'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.1 nor INSERT into it'; end $$;
do $$ begin perform public.admin_audit_write('x', 'y', 'z'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.2 admin_audit_write is not callable by an authenticated admin'; end $$;
select t.claims('00000000-0000-4000-8000-000000004001');
do $$ begin perform public.admin_audit_write('x', 'y', 'z'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.2 ... nor by a member'; end $$;
do $$ begin perform public.admin_list_audit(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.3 a member cannot read the log: admin_list_audit -> 42501'; end $$;
select t.claims('00000000-0000-4000-8000-000000000000', 'anon');
do $$ begin perform public.admin_audit_write('x', 'y', 'z'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.2 ... nor by anon'; end $$;
do $$ begin perform public.admin_list_audit(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.3 anon: admin_list_audit -> 42501'; end $$;
rollback;

-- ============================================================
-- B. every writer refuses a member and anon
-- ============================================================
create temp table b_calls (c text);
insert into b_calls values
  ($$select public.admin_grant_plan('00000000-0000-4000-8000-000000004002', 'starter', 30, 'n')$$),
  ($$select public.admin_set_plan('starter', '{"blurb":"x"}')$$),
  ($$select public.admin_set_plan_price('starter', 'USD', 100, null, null)$$),
  ($$select public.admin_set_next_price('starter', null, null)$$),
  ($$select public.admin_set_billing_settings('{"trial_minutes": 20}')$$),
  ($$select public.admin_set_refund_requests_enabled(true)$$),
  ($$select public.admin_set_promo_code('NOPE10', '{"percent_off":10}')$$),
  ($$select public.admin_grant_trial('00000000-0000-4000-8000-000000004002', 60, 'n')$$),
  ($$select public.admin_grant_email('nobody@example.com', 'member', null, null, null)$$),
  ($$select public.admin_revoke_email_grant('nobody@example.com')$$),
  ($$select public.admin_decide_request('00000000-0000-4000-8000-000000004002', true, null)$$),
  ($$select public.admin_decide_refund_request('00000000-0000-4000-8000-000000004002', 'approved', null)$$),
  ($$select public.admin_issue_invoice('00000000-0000-4000-8000-000000004002')$$),
  ($$select public.admin_resend_receipt('00000000-0000-4000-8000-000000004002')$$),
  ($$select public.admin_reset_user('00000000-0000-4000-8000-000000004002', null)$$),
  ($$select public.admin_terminate_session('00000000-0000-4000-8000-000000004002', false)$$),
  ($$select public.admin_create_invite('standard', 1, null, null, 'n')$$),
  ($$select public.admin_revoke_invite('00000000-0000-4000-8000-000000004002')$$),
  ($$select public.admin_mark_referral_paid(array['00000000-0000-4000-8000-000000004002']::uuid[], null)$$);
grant select on b_calls to anon, authenticated;

begin;
select t.claims('00000000-0000-4000-8000-000000004001');
do $$
declare c text; refused int := 0;
begin
  for c in select b.c from b_calls b loop
    begin execute c; raise exception 'NOT REFUSED: %', c;
    exception when sqlstate '42501' then refused := refused + 1; end;
  end loop;
  if refused <> 19 then raise exception 'only % of 19 refused a member', refused; end if;
  raise notice 'ok - 40.4 (B) a member is refused by all nineteen writers with 42501';
end $$;
select t.claims('00000000-0000-4000-8000-000000000000', 'anon');
do $$
declare c text; refused int := 0;
begin
  for c in select b.c from b_calls b loop
    begin execute c; raise exception 'NOT REFUSED: %', c;
    exception when sqlstate '42501' then refused := refused + 1; end;
  end loop;
  if refused <> 19 then raise exception 'only % of 19 refused anon', refused; end if;
  raise notice 'ok - 40.4 (B) anon is refused by all nineteen writers with 42501';
end $$;
rollback;
select t.reset();
select t.ok((select count(*) from public.admin_audit where actor = '00000000-0000-4000-8000-000000004001') = 0,
  '40.4 (B) and the refusals left no audit row');

-- ============================================================
-- C. every writer leaves exactly its row
-- ============================================================
-- Setup as the service role, as a real capture would do it.
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004003', 'indie', 'lifetime')), 'order_a3');
select public.activate_payment('order_a3', 'pay_a3');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004004', 'starter', 'lifetime')), 'order_a4');
select public.activate_payment('order_a4', 'pay_a4');
commit;
select t.reset();
-- A paid payment with NO invoice (an insert does not fire the after-update
-- trigger), for admin_issue_invoice; a refund request and a pending invite
-- request for the two deciders; two owed referral credits.
insert into public.payments (id, user_id, plan_id, period, amount_paise, status, paid_at)
values ('00000000-0000-4000-8000-0000000040a1', '00000000-0000-4000-8000-000000004001', 'starter', 'month', 59900, 'paid', now());
insert into public.refund_requests (id, user_id, payment_id, category, message)
values ('00000000-0000-4000-8000-0000000040b1', '00000000-0000-4000-8000-000000004004',
        (select id from public.payments where razorpay_order_id = 'order_a4'), 'other', 'x');
insert into public.invite_requests (user_id, email) values ('00000000-0000-4000-8000-000000004005', 'aud-five@example.com')
on conflict (user_id) do nothing;
insert into public.referral_credits (id, referrer_user_id, payment_id, code, basis_paise, amount_paise) values
  ('00000000-0000-4000-8000-0000000040c1', '00000000-0000-4000-8000-000000004004', (select id from public.payments where razorpay_order_id = 'order_a3'), 'REF-AUD3', 1000, 100),
  ('00000000-0000-4000-8000-0000000040c2', '00000000-0000-4000-8000-000000004003', (select id from public.payments where razorpay_order_id = 'order_a4'), 'REF-AUD4', 1000, 100);

-- ids the admin cannot read through RLS (payments has an owner policy only)
create temp table ids as select
  (select id from public.payments where razorpay_order_id = 'order_a3') as pay3,
  (select id from public.invoices where razorpay_order_id = 'order_a3') as inv3;
grant select on ids to authenticated;

begin;
select t.claims('00000000-0000-4000-8000-00000000000a', 'authenticated', '{"email":"admin@example.com"}');
create temp table a_mark as select clock_timestamp() as ts;
-- the console's own read, bounded to this file's writes
create temp view aud as
  select e as r from public.admin_list_audit(p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows') e;

-- create_invite / revoke_invite --------------------------------------------
create temp table inv as select * from public.admin_create_invite('standard', 3, null, null, 'audit-test');
select t.ok((select count(*) from aud where r ->> 'action' = 'create_invite') = 1
        and (select r ->> 'target_kind' from aud where r ->> 'action' = 'create_invite') = 'invite'
        and (select r ->> 'target_id' from aud where r ->> 'action' = 'create_invite') = (select id::text from inv)
        and (select r ->> 'actor' from aud where r ->> 'action' = 'create_invite') = '00000000-0000-4000-8000-00000000000a'
        and (select r ->> 'actor_email' from aud where r ->> 'action' = 'create_invite') = 'admin@example.com'
        and (select r -> 'after' ->> 'label' from aud where r ->> 'action' = 'create_invite') = 'audit-test'
        and (select r -> 'after' ->> 'max_redemptions' from aud where r ->> 'action' = 'create_invite') = '3',
  '40.4 (C) create_invite: one row naming the invite, the actor and the actor''s e-mail');
select t.ok(position((select code from inv) in (select string_agg(r::text, ' ') from aud)) = 0,
  '40.4 (C) ... and the invite CODE is nowhere in any row');
select public.admin_revoke_invite((select id from inv));
select public.admin_revoke_invite((select id from inv));
select public.admin_revoke_invite('00000000-0000-4000-8000-0000000040ff');
select t.ok((select count(*) from aud where r ->> 'action' = 'revoke_invite') = 2,
  '40.4 (C) revoke_invite: a row per real revocation, none for an id that is not there');
select t.ok((select count(*) from aud where r ->> 'action' = 'revoke_invite' and r -> 'before' ->> 'revoked_at' is null) = 1,
  '40.4 (C) ... exactly one of them records "not revoked before"');

-- grant_trial ----------------------------------------------------------------
select public.admin_grant_trial('00000000-0000-4000-8000-000000004002', 90, 'a note');
select public.admin_grant_trial('00000000-0000-4000-8000-000000004002', 120, null);
select t.ok((select count(*) from aud where r ->> 'action' = 'grant_trial'
                and r ->> 'target_kind' = 'user' and r ->> 'target_id' = '00000000-0000-4000-8000-000000004002') = 2
        and exists (select 1 from aud where r ->> 'action' = 'grant_trial'
                       and r -> 'before' ->> 'trial_minutes' is null and r -> 'after' ->> 'trial_minutes' = '90')
        and exists (select 1 from aud where r ->> 'action' = 'grant_trial'
                       and r -> 'before' ->> 'trial_minutes' = '90' and r -> 'after' ->> 'trial_minutes' = '120'),
  '40.4 (C) grant_trial: a row per grant; the second carries the first as its before');
select t.ok((select r ->> 'note' from aud where r ->> 'action' = 'grant_trial' and r ->> 'note' is not null) = 'a note',
  '40.4 (C) ... and the note');
select t.ok((select (public.admin_grant_trial('00000000-0000-4000-8000-000000004002', 5, null) ->> 'minutes')::int) = 5,
  '40.4 (C) grant_trial still returns what it always returned');
do $$ begin perform public.admin_grant_trial('00000000-0000-4000-8000-000000004002', 0, null); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) grant_trial still refuses 0 minutes'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'grant_trial') = 3,
  '40.4 (C) ... and the refusal left no row');

-- the e-mail comes from auth.users when the JWT carries none
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_trial('00000000-0000-4000-8000-000000004002', 6, 'no-claim-email');
select t.ok((select r ->> 'actor_email' from aud where r ->> 'note' = 'no-claim-email') = 'admin@example.com',
  '40.2 with no e-mail claim the actor''s e-mail is read from auth.users');
select t.claims('00000000-0000-4000-8000-00000000000a', 'authenticated', '{"email":"admin@example.com"}');

-- grant_plan -------------------------------------------------------------------
select public.admin_grant_plan('00000000-0000-4000-8000-000000004002', 'starter', 30, 'comp');
select t.ok((select r -> 'before' ->> 'plan' = 'free' and r -> 'after' ->> 'plan' = 'starter'
                    and r ->> 'target_id' = '00000000-0000-4000-8000-000000004002' and r ->> 'note' = 'comp'
               from aud where r ->> 'action' = 'grant_plan'),
  '40.4 (C) grant_plan: free -> starter, on the person, with the note');
do $$ begin perform public.admin_grant_plan('00000000-0000-4000-8000-000000004002', 'free', 1, null); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) grant_plan still refuses "free" with 22023'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'grant_plan') = 1, '40.4 (C) ... and the refusal left no row');

-- set_plan / set_plan_price / set_next_price -----------------------------------
select public.admin_set_plan('starter', '{"blurb":"audited blurb"}');
select t.ok((select r -> 'after' ->> 'blurb' = 'audited blurb' and r -> 'before' ->> 'blurb' is distinct from 'audited blurb'
                    and r ->> 'target_kind' = 'plan' and r ->> 'target_id' = 'starter' and r ->> 'note' = 'patch: blurb'
               from aud where r ->> 'action' = 'set_plan'),
  '40.4 (C) set_plan: whole before and after rows, and the patch keys');
do $$ begin perform public.admin_set_plan('starter', '{"limits":{"nope":1}}'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) set_plan still refuses an unknown limit'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'set_plan') = 1, '40.4 (C) ... and the refusal left no row');

select public.admin_set_plan_price('starter', 'USD', 900, null, null);
select public.admin_set_plan_price('starter', 'USD', 950, null, null);
select t.ok((select count(*) from aud where r ->> 'action' = 'set_plan_price' and r ->> 'target_id' = 'starter:USD') = 2
        and exists (select 1 from aud where r ->> 'action' = 'set_plan_price'
                       and r -> 'before' ->> 'amount_minor' = '900' and r -> 'after' ->> 'amount_minor' = '950'),
  '40.4 (C) set_plan_price: starter:USD, the second row carries 900 -> 950');
do $$ begin perform public.admin_set_plan_price('starter', 'INR', 1, null, null); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) set_plan_price still refuses INR'; end $$;

select public.admin_set_next_price('starter', (select price_paise + 1000 from public.plans where id = 'starter'), now() + interval '30 days');
select public.admin_set_next_price('starter', null, null);
select t.ok((select count(*) from aud where r ->> 'action' = 'set_next_price' and r ->> 'target_id' = 'starter') = 2
        and exists (select 1 from aud where r ->> 'action' = 'set_next_price'
                       and r -> 'before' ->> 'next_price_paise' is not null and r -> 'after' ->> 'next_price_paise' is null),
  '40.4 (C) set_next_price: scheduling and clearing each leave a row');
do $$ begin perform public.admin_set_next_price('starter', 1, now() + interval '1 day'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) set_next_price still refuses a "rise" that is not one'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'set_next_price') = 2, '40.4 (C) ... and the refusal left no row');

-- set_billing_settings / set_refund_requests_enabled -----------------------------
select public.admin_set_billing_settings('{"trial_minutes": 45}');
select t.ok((select r -> 'after' ->> 'trial_minutes' = '45' and r -> 'before' ->> 'trial_minutes' is distinct from '45'
                    and r ->> 'target_kind' = 'billing_settings' and r ->> 'target_id' = 'global' and r ->> 'note' = 'patch: trial_minutes'
               from aud where r ->> 'action' = 'set_billing_settings'),
  '40.4 (C) set_billing_settings: whole before and after settings');
do $$ begin perform public.admin_set_billing_settings('{"trial_minutes": 0}'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) set_billing_settings still refuses trial_minutes 0'; end $$;
do $$ begin perform public.admin_set_billing_settings('{"nope": 1}'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) ... and an unknown key'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'set_billing_settings') = 1, '40.4 (C) ... and the refusals left no row');
select t.ok((public.admin_set_billing_settings('{"trial_minutes": 46}') ->> 'trial_minutes') = '46',
  '40.4 (C) set_billing_settings still returns the new settings');

select public.admin_set_refund_requests_enabled(true);
select t.ok((select r -> 'after' ->> 'enabled' = 'true' and r ->> 'target_id' = 'refund_requests_enabled'
               from aud where r ->> 'action' = 'set_refund_requests_enabled'),
  '40.4 (C) set_refund_requests_enabled: a row');

-- set_promo_code ---------------------------------------------------------------
select public.admin_set_promo_code('AUDIT10', '{"percent_off":10}');
select public.admin_set_promo_code('AUDIT10', '{"percent_off":20}');
select t.ok((select count(*) from aud where r ->> 'action' = 'set_promo_code' and r ->> 'target_id' = 'AUDIT10') = 2
        and exists (select 1 from aud where r ->> 'action' = 'set_promo_code' and r -> 'before' = 'null'::jsonb and r -> 'after' ->> 'percent_off' = '10')
        and exists (select 1 from aud where r ->> 'action' = 'set_promo_code'
                       and r -> 'before' ->> 'percent_off' = '10' and r -> 'after' ->> 'percent_off' = '20'),
  '40.4 (C) set_promo_code: creating has no before; updating carries 10 -> 20');
do $$ begin perform public.admin_set_promo_code('AUDIT10', '{"percent_off":10,"amount_off_paise":5}'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) set_promo_code still turns a check_violation into its sentence'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'set_promo_code') = 2, '40.4 (C) ... and left no row');

-- grant_email / revoke_email_grant -------------------------------------------------
select public.admin_grant_email('aud-three@example.com', 'member', null, 30, 'known');
select public.admin_grant_email('ghost-aud@example.com', 'member', null, null, null);
select t.ok((select r -> 'after' ->> 'user_id' = '00000000-0000-4000-8000-000000004003' and r ->> 'target_kind' = 'email_grant'
               from aud where r ->> 'action' = 'grant_email' and r ->> 'target_id' = 'aud-three@example.com')
        and (select r -> 'after' ->> 'user_id' is null from aud where r ->> 'action' = 'grant_email' and r ->> 'target_id' = 'ghost-aud@example.com'),
  '40.4 (C) grant_email: names the person when the address is already somebody, not when it is not');
select public.admin_revoke_email_grant('ghost-aud@example.com');
select t.ok((select r -> 'before' ->> 'email' = 'ghost-aud@example.com' and r -> 'after' = 'null'::jsonb
               from aud where r ->> 'action' = 'revoke_email_grant'),
  '40.4 (C) revoke_email_grant: the grant it removed is the row''s before');
do $$ begin perform public.admin_revoke_email_grant('ghost-aud@example.com'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) revoke_email_grant still refuses an address with no grant'; end $$;
do $$ begin perform public.admin_grant_email('not-an-address', 'member', null, null, null); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) grant_email still refuses a bad address'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' in ('grant_email', 'revoke_email_grant')) = 3,
  '40.4 (C) ... and the refusals left no row');

-- decide_request / decide_refund_request ---------------------------------------
select public.admin_decide_request('00000000-0000-4000-8000-000000004005', true, 'welcome');
select t.ok((select r -> 'before' ->> 'status' = 'pending' and r -> 'after' ->> 'status' = 'approved'
                    and r -> 'after' ->> 'user_id' = '00000000-0000-4000-8000-000000004005' and r ->> 'target_kind' = 'invite_request'
                    and r ->> 'note' = 'welcome'
               from aud where r ->> 'action' = 'decide_request'),
  '40.4 (C) decide_request: pending -> approved, naming the person');
do $$ begin perform public.admin_decide_request('00000000-0000-4000-8000-0000000040fe', true, null); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) decide_request still refuses an unknown request'; end $$;

do $$ begin perform public.admin_decide_refund_request('00000000-0000-4000-8000-0000000040b1', 'declined', ''); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) decide_refund_request still wants a reason to decline'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'decide_refund_request') = 0, '40.4 (C) ... and the refusal left no row');
select public.admin_decide_refund_request('00000000-0000-4000-8000-0000000040b1', 'approved', 'duplicate charge');
select t.ok((select r -> 'before' ->> 'status' = 'pending' and r -> 'after' ->> 'status' = 'approved'
                    and r -> 'after' ->> 'user_id' = '00000000-0000-4000-8000-000000004004' and r ->> 'target_kind' = 'refund_request'
               from aud where r ->> 'action' = 'decide_refund_request'),
  '40.4 (C) decide_refund_request: pending -> approved, naming the buyer');

-- issue_invoice / resend_receipt -----------------------------------------------
create temp table inv1 as select * from public.admin_issue_invoice('00000000-0000-4000-8000-0000000040a1');
select t.ok((select number from inv1) like 'FMS/%'
        and (select count(*) from aud where r ->> 'action' = 'issue_invoice') = 1
        and (select r -> 'after' ->> 'number' = (select number from inv1) and r -> 'after' ->> 'user_id' = '00000000-0000-4000-8000-000000004001'
               from aud where r ->> 'action' = 'issue_invoice'),
  '40.4 (C) issue_invoice: issuing leaves a row carrying the number and the buyer');
select public.admin_issue_invoice('00000000-0000-4000-8000-0000000040a1');
select public.admin_issue_invoice((select pay3 from ids));
select t.ok((select count(*) from aud where r ->> 'action' = 'issue_invoice') = 1,
  '40.4 (C) ... asking again for an invoice that exists is not a change and leaves no row');

select public.admin_resend_receipt((select inv3 from ids));
select t.ok((select r -> 'after' ->> 'razorpay_order_id' = 'order_a3' and r -> 'after' ->> 'user_id' = '00000000-0000-4000-8000-000000004003'
               from aud where r ->> 'action' = 'resend_receipt'),
  '40.4 (C) resend_receipt: the order and the buyer');
do $$ begin perform public.admin_resend_receipt('00000000-0000-4000-8000-0000000040fd'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) resend_receipt still refuses an unknown invoice'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'resend_receipt') = 1, '40.4 (C) ... and left no row');

-- reset_user / terminate_session -----------------------------------------------
select public.admin_reset_user('00000000-0000-4000-8000-000000004001', 'cleared for test');
select t.ok((select (r -> 'after' ->> 'membership_removed')::boolean and r ->> 'target_id' = '00000000-0000-4000-8000-000000004001'
                    and r -> 'before' ->> 'role' = 'user' and r ->> 'note' = 'cleared for test'
               from aud where r ->> 'action' = 'reset_user'),
  '40.4 (C) reset_user: what it removed is the row''s after');
do $$ begin perform public.admin_reset_user('00000000-0000-4000-8000-00000000000a', null); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.4 (C) reset_user still refuses clearing yourself'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'reset_user') = 1, '40.4 (C) ... and left no row');

select public.admin_terminate_session('00000000-0000-4000-8000-000000004003', true);
select t.ok((select r -> 'before' ->> 'held_session' = 'false' and r -> 'after' ->> 'disabled' = 'true'
               from aud where r ->> 'action' = 'terminate_session'),
  '40.4 (C) terminate_session: a row saying it disabled');
select t.ok((select disabled_at is not null from public.studio_members where user_id = '00000000-0000-4000-8000-000000004003'),
  '40.4 (C) ... and the member really is disabled, as before');
do $$ begin perform public.admin_terminate_session('00000000-0000-4000-8000-00000000000a', true); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 40.4 (C) terminate_session still refuses disabling yourself'; end $$;
select t.ok((select count(*) from aud where r ->> 'action' = 'terminate_session') = 1, '40.4 (C) ... and left no row');

-- mark_referral_paid -------------------------------------------------------------
select t.ok(public.admin_mark_referral_paid(array['00000000-0000-4000-8000-0000000040c1', '00000000-0000-4000-8000-0000000040c2']::uuid[], 'paid by UPI') = 2,
  '40.4 (C) mark_referral_paid still returns how many it marked');
select t.ok((select count(*) from aud where r ->> 'action' = 'mark_referral_paid') = 2
        and (select count(distinct r -> 'after' ->> 'user_id') from aud where r ->> 'action' = 'mark_referral_paid') = 2
        and (select bool_and(r ->> 'note' = 'paid by UPI' and r -> 'before' ->> 'status' = 'owed' and r -> 'after' ->> 'status' = 'paid')
               from aud where r ->> 'action' = 'mark_referral_paid'),
  '40.4 (C) ... and leaves one row per credit, naming the referrer');
select t.ok(public.admin_mark_referral_paid(array['00000000-0000-4000-8000-0000000040c1']::uuid[], null) = 0
        and (select count(*) from aud where r ->> 'action' = 'mark_referral_paid') = 2,
  '40.4 (C) ... marking the already-paid again returns 0 and leaves nothing');

-- ============================================================
-- D. the reader
-- ============================================================
select t.ok((select count(*) from public.admin_list_audit(p_actor => 'ADMIN@EXAMPLE', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows'))
          = (select count(*) from aud),
  '40.3 (D) filter by part of the actor''s e-mail, case-blind');
select t.ok((select count(*) from public.admin_list_audit(p_actor => '00000000-0000-4000-8000-00000000000a', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows'))
          = (select count(*) from aud)
        and (select count(*) from public.admin_list_audit(p_actor => 'nobody-at-all', p_from => (select ts from a_mark)) j, jsonb_array_elements(j -> 'rows')) = 0,
  '40.3 (D) ... or by the actor''s id; an actor with no rows matches none');
select t.ok((select count(*) from aud where r ->> 'action' like 'grant\_%') > 0
        and (select count(*) from public.admin_list_audit(p_action => 'grant', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows'))
          = (select count(*) from aud where r ->> 'action' like 'grant\_%')
        and (select count(*) from public.admin_list_audit(p_action => 'set_plan', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows'))
          = (select count(*) from aud where r ->> 'action' like 'set\_plan%'),
  '40.3 (D) the action filter is a prefix: grant matches the grant_ family, set_plan matches set_plan and set_plan_price');
select t.ok((select count(*) from public.admin_list_audit(p_target => '00000000-0000-4000-8000-000000004004', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows') e
              where e ->> 'action' = 'decide_refund_request') = 1
        and (select count(*) from public.admin_list_audit(p_target => '00000000-0000-4000-8000-000000004004', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows') e
              where e ->> 'action' = 'mark_referral_paid') = 1
        and (select count(*) from public.admin_list_audit(p_target => '00000000-0000-4000-8000-000000004004', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows') e
              where e ->> 'action' = 'create_invite') = 0,
  '40.3 (D) a person as the target finds the rows that name them as user_id, and not unrelated ones');
select t.ok((select count(*) from public.admin_list_audit(p_target => 'plan:starter', p_from => (select ts from a_mark), p_limit => 200) j, jsonb_array_elements(j -> 'rows'))
          = (select count(*) from aud where r ->> 'target_kind' = 'plan' and r ->> 'target_id' = 'starter'),
  '40.3 (D) kind:id as the target');
select t.ok((select count(*) from public.admin_list_audit(p_from => (select ts from a_mark), p_to => (select ts from a_mark) - interval '1 microsecond') j, jsonb_array_elements(j -> 'rows')) = 0,
  '40.3 (D) p_to before the first row finds nothing');
select t.ok((select count(*) from public.admin_list_audit(p_limit => 0, p_from => (select ts from a_mark)) j, jsonb_array_elements(j -> 'rows')) = 1,
  '40.3 (D) a limit below 1 is lifted to 1');
-- keyset paging: walk every page and meet every row exactly once, newest first
do $$
declare
  cur timestamptz := null; pg jsonb; n int := 0; total int; seen uuid[] := '{}'; ids uuid[]; pages int := 0; lastat timestamptz := 'infinity';
  e jsonb;
begin
  select count(*) into total from aud;
  loop
    pg := public.admin_list_audit(p_from => (select ts from a_mark), p_limit => 7, p_before => cur);
    pages := pages + 1;
    for e in select * from jsonb_array_elements(pg -> 'rows') loop
      if (e ->> 'id')::uuid = any (seen) then raise exception 'row % seen twice', e ->> 'id'; end if;
      if (e ->> 'at')::timestamptz > lastat then raise exception 'not newest first'; end if;
      lastat := (e ->> 'at')::timestamptz;
      seen := seen || (e ->> 'id')::uuid; n := n + 1;
    end loop;
    exit when not (pg ->> 'has_more')::boolean;
    cur := (pg ->> 'next_before')::timestamptz;
    if pages > 100 then raise exception 'paging does not end'; end if;
  end loop;
  if n <> total then raise exception 'paged % of % rows', n, total; end if;
  raise notice 'ok - 40.3 (D) keyset paging by 7 walks all % rows once each, newest first, in % pages', total, pages;
end $$;
rollback;

-- ============================================================
-- E. append-only
-- ============================================================
select t.reset();
begin;
insert into public.admin_audit (action, target_kind, target_id, note) values ('probe', 'probe', 'append-only', 'x');
do $$ begin update public.admin_audit set note = 'changed' where action = 'probe'; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.1 (E) UPDATE is refused, even for the owner'; end $$;
do $$ begin delete from public.admin_audit where action = 'probe'; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.1 (E) DELETE is refused'; end $$;
do $$ begin truncate public.admin_audit; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 40.1 (E) TRUNCATE is refused'; end $$;
select t.ok((select note from public.admin_audit where action = 'probe') = 'x', '40.1 (E) and the row is as it was written');
rollback;
select t.ok((select count(*) from pg_trigger where tgrelid = 'public.admin_audit'::regclass and not tgisinternal) = 2,
  '40.1 (E) exactly two triggers guard it (row, and truncate): re-running the section did not stack them');

-- ============================================================
-- F. an audit row and its action commit together or not at all
-- ============================================================
-- (1) an error after the write, inside the same transaction
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$
begin
  begin
    perform public.admin_grant_trial('00000000-0000-4000-8000-000000004004', 77, 'ATOMIC-SUB');
    perform public.admin_set_promo_code('ATOMIC10', '{"percent_off":10}');
    raise exception 'forced failure after the writes' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
end $$;
select t.reset();
select t.ok((select count(*) from public.admin_audit where note = 'ATOMIC-SUB' or target_id = 'ATOMIC10') = 0
        and not exists (select 1 from public.promo_codes where code = 'ATOMIC10'),
  '40.2 (F) a failure after the write rolls back the action AND its audit row');
select t.ok((select trial_minutes is distinct from 77 from public.studio_members where user_id = '00000000-0000-4000-8000-000000004004'),
  '40.2 (F) ... the change itself is gone too');
rollback;

-- (2) a whole transaction rolled back
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_trial('00000000-0000-4000-8000-000000004004', 78, 'ATOMIC-ROLLBACK');
select t.reset();
select t.ok((select count(*) from public.admin_audit where note = 'ATOMIC-ROLLBACK') = 1, '40.2 (F) inside the transaction the row is visible');
rollback;
select t.ok((select count(*) from public.admin_audit where note = 'ATOMIC-ROLLBACK') = 0
        and (select trial_minutes is distinct from 78 from public.studio_members where user_id = '00000000-0000-4000-8000-000000004004'),
  '40.2 (F) after ROLLBACK neither the row nor the trial exists');

-- (3) a commit keeps both
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_trial('00000000-0000-4000-8000-000000004004', 79, 'ATOMIC-COMMIT');
commit;
select t.reset();
select t.ok((select count(*) from public.admin_audit where note = 'ATOMIC-COMMIT') = 1
        and (select trial_minutes = 79 from public.studio_members where user_id = '00000000-0000-4000-8000-000000004004'),
  '40.2 (F) after COMMIT both exist');
