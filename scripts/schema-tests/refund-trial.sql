-- ============================================================
-- SECTION 34 CHECKS — a refund gives a fresh trial
-- ------------------------------------------------------------
-- The checks listed at 34.4, executed. Runs after §34 has loaded, with
-- its own people (…3401 upward). Payments are made and refunded through
-- the service-role functions, as the edge functions would. The trigger
-- is DEFERRED to commit, so each block either commits or says
-- `set constraints … immediate` — which fires it, exactly as a commit
-- would — before it looks.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003401', 'rt-only@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000003402', 'rt-other@example.com', now(), '{}');

-- Both buy; the second buys twice (Starter, then Pro on the same account).
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003401', 'indie', 'lifetime')), 'order_rt1');
select public.activate_payment('order_rt1', 'pay_rt1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003402', 'starter', 'lifetime')), 'order_rt2');
select public.activate_payment('order_rt2', 'pay_rt2');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003402', 'pro', 'lifetime')), 'order_rt3');
select public.activate_payment('order_rt3', 'pay_rt3');
commit;
-- Their thirty minutes ran out long ago, before they bought.
update public.studio_members
   set trial_started_at = now() - interval '30 days', trial_minutes = 30, trial_source = 'signup', trial_scope = 'sample'
 where user_id in ('00000000-0000-4000-8000-000000003401', '00000000-0000-4000-8000-000000003402');

-- 1. the only payment refunded -> a fresh trial of the configured length
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true, "trial_minutes": 180, "trial_scope": "full"}');
select t.reset();
select t.service();
select public.mark_payment_refunded('pay_rt1', null);
select t.reset();
set constraints public.payments_refund_trial immediate;
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003401') = 'free', '34. (1) the refund ended the plan');
select t.ok((select trial_source = 'refund' and trial_minutes = 180 and trial_scope = 'full'
                    and trial_started_at = now()
               from public.studio_members where user_id = '00000000-0000-4000-8000-000000003401'),
  '34. (1) the trial restarted now, source refund, 180 configured minutes, the configured scope');
select t.claims('00000000-0000-4000-8000-000000003401');
select t.ok((public.billing_status() ->> 'trial_active')::bool and (public.billing_status() ->> 'entitled')::bool
        and (public.billing_status() ->> 'trial_source') = 'refund',
  '34. (1) billing_status(): the refunded buyer is on a running trial, entitled, while purchases are required');
select t.ok((public.billing_status() ->> 'trial_ends_at')::timestamptz = now() + interval '3 hours',
  '34. (1) it ends after the configured 3 hours');
select t.ok((public.start_trial() ->> 'started')::bool = false, '34. (4) start_trial() still refuses a second one by asking');
rollback;

-- 2. a redelivered webhook moves nothing
begin;
select t.service();
select public.mark_payment_refunded('pay_rt1', null);
commit;
update public.studio_members set trial_started_at = now() - interval '2 days' where user_id = '00000000-0000-4000-8000-000000003401';
begin;
select t.service();
select public.mark_payment_refunded('pay_rt1', '{"redelivered": true}');
commit;
select t.ok((select trial_started_at < now() - interval '1 day' from public.studio_members
              where user_id = '00000000-0000-4000-8000-000000003401'),
  '34. (2) refunding an already-refunded payment again does not restart the trial');

-- 3. refunded while another paid plan is active -> nothing changes
begin;
select t.service();
select public.mark_payment_refunded('pay_rt2', null);
select t.reset();
set constraints public.payments_refund_trial immediate;
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003402') = 'pro', '34. (3) (control) the account still carries the later Pro');
select t.ok((select trial_source = 'signup' and trial_minutes = 30 and trial_started_at < now() - interval '29 days'
               from public.studio_members where user_id = '00000000-0000-4000-8000-000000003402'),
  '34. (3) with another paid plan active, the trial row is untouched');
rollback;

-- 5. one constraint, one trigger, after the double load
select t.ok((select count(*) from pg_trigger where tgname = 'payments_refund_trial') = 1
        and (select count(*) from pg_constraint where conname = 'studio_members_trial_source_check') = 1,
  '34. (5) re-running the section leaves one trigger and one constraint');
