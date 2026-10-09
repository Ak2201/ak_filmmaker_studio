-- ============================================================
-- SECTION 30 CHECKS — the trial, and a price rise that fires itself
-- ------------------------------------------------------------
-- The nineteen checks listed at 30.12, executed. Runs last, against
-- the whole schema, with its own people (…3001 upward) so nothing an
-- earlier file bought can make a check here pass for the wrong reason.
-- A (…00a) is still the administrator, F (…f1) the §16 buyer who was
-- refunded, D (…d1) the disabled member — the last two matter because
-- they existed BEFORE section 30 ran and so were grandfathered by its
-- backfill, which is check 19.
--
-- TWO THINGS ABOUT HOW THIS FILE IS WRITTEN, both deliberate:
--
--  * IT SETS THE PRICES IT REASONS ABOUT. 30.11 seeds a rise against
--    the LIVE prices (₹599/₹799/₹999); this database carries the
--    file's placeholder prices, which earlier check files have edited
--    again. A test that asserted 79900 because the live project says
--    79900 would be asserting the state of somebody else's database.
--    So the price-rise blocks set a known price and a known rise
--    first, inside a transaction they roll back.
--
--  * IT NEVER MOVES A CLOCK. Expiry is proved by moving
--    trial_started_at into the past, which is the only way a static
--    app can ever test it. now() is the TRANSACTION timestamp, so
--    "unchanged" in check 3 would be true for free inside one
--    transaction — the first trial is therefore backdated by a
--    distinguishable five minutes before the second call, and the
--    assertion compares that exact value. Without that the check
--    passes whether or not the ON CONFLICT guard works.
-- ============================================================
\set ON_ERROR_STOP on

-- The people. Committed, because several blocks below roll back and a
-- rolled-back auth.users row would take the member row with it.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003001', 'tr-signup@example.com',   now(), '{"full_name":"Thara"}'),
  ('00000000-0000-4000-8000-000000003002', 'tr-declined@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003003', 'tr-disabled@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000003004', 'tr-paid@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000003005', 'tr-code@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000003006', 'tr-off@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000003007', 'tr-forge@example.com',    now(), '{}');

-- 1. the signed-out surface -------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003001', 'anon');
do $$ begin
  perform public.start_trial();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 30. (1) anon: start_trial() -> 42501 (no grant)'; end $$;
select t.ok(public.price_notice() ? 'plans', '30. (1) anon: price_notice() answers — the signed-out landing page reads it');
do $$ begin
  perform count(*) from public.billing_settings;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 30. (1) anon cannot select billing_settings -> 42501'; end $$;
rollback;

-- 2 / 4 / 5 / 18 / 3 / 6: one person, one trial, start to expiry -------
-- All in one transaction so now() is fixed and the arithmetic below is
-- exact; rolled back, so the trial never outlives this block.
begin;
select t.claims('00000000-0000-4000-8000-000000003001');
select t.ok((public.start_trial() ->> 'started')::bool, '30. (2) a fresh signed-in non-member: start_trial() -> started');
select t.ok((select registered from public.studio_status()), '30. (2) the studio_members row IS the admission: studio_status().registered');
select t.ok((select trial_source  from public.studio_members where user_id = '00000000-0000-4000-8000-000000003001') = 'signup'
        and (select trial_minutes from public.studio_members where user_id = '00000000-0000-4000-8000-000000003001') = 30
        and (select trial_scope   from public.studio_members where user_id = '00000000-0000-4000-8000-000000003001') = 'sample',
  '30. (2) signup / 30 minutes / sample scope');

-- THE ONE THAT PROVES THE DESIGN. Entitlement is a second axis; if the
-- trial had touched the plan, everything below it in the stack — the
-- same_plan guard in quote_for, the limit triggers, apply_plan — would
-- be reasoning about a plan nobody bought.
select t.ok((select plan        from public.accounts where owner_id = '00000000-0000-4000-8000-000000003001') = 'free'
        and (select plan_until  from public.accounts where owner_id = '00000000-0000-4000-8000-000000003001') is null
        and (select plan_period from public.accounts where owner_id = '00000000-0000-4000-8000-000000003001') is null
        and public.user_plan('00000000-0000-4000-8000-000000003001') = 'free',
  '30. (4) THE ONE THAT PROVES THE DESIGN: after a trial the plan is untouched — free, no plan_until, no plan_period');

select t.ok((public.billing_status() ->> 'entitled')::bool
        and (public.billing_status() ->> 'trial_active')::bool
        and (public.billing_status() ->> 'trial_used')::bool,
  '30. (5) billing_status(): entitled, trial_active, trial_used');
select t.ok((public.billing_status() ->> 'trial_ends_at')::timestamptz
            = (select trial_started_at from public.studio_members where user_id = '00000000-0000-4000-8000-000000003001') + interval '30 minutes',
  '30. (5) trial_ends_at is trial_started_at + the snapshot length');
select t.ok((public.billing_status() -> 'features') = '{"sample_only": true, "new_projects": false}'::jsonb,
  '30. (5) and features is the FREE plan''s own map — which is why the sample-only scope needed no new gating');
select t.ok((public.billing_status() ->> 'trial_scope') = 'sample', '30. (5) trial_scope is reported while the trial runs');

-- 18. nothing that was there before section 30 has gone missing.
select t.ok(public.billing_status() ?& array['plan','plan_name','limits','features','account_id','account_name',
                                             'plan_until','bought_plan','lapsed','disabled','member','usage','payments'],
  '30. (18) BACKWARDS COMPATIBILITY: billing_status() still carries every pre-section-30 key');

-- 3. a second call is a no-op, AND the timestamp does not move.
select t.reset();
update public.studio_members set trial_started_at = now() - interval '5 minutes'
 where user_id = '00000000-0000-4000-8000-000000003001';
select t.claims('00000000-0000-4000-8000-000000003001');
select t.ok((public.start_trial() ->> 'started')::bool = false
        and (public.start_trial() ->> 'reason') = 'used',
  '30. (3) the same user again -> {started:false, reason:''used''}');
select t.ok((select trial_started_at from public.studio_members where user_id = '00000000-0000-4000-8000-000000003001')
            = now() - interval '5 minutes',
  '30. (3) and trial_started_at is UNCHANGED — the backdated value stands, so the ON CONFLICT guard held');

-- 6. expiry, with no clock anywhere: move the start, not the time.
select t.reset();
update public.studio_members set trial_started_at = now() - interval '2 hours'
 where user_id = '00000000-0000-4000-8000-000000003001';
select t.claims('00000000-0000-4000-8000-000000003001');
select t.ok((public.billing_status() ->> 'trial_active')::bool = false
        and (public.billing_status() ->> 'entitled')::bool = false
        and (public.billing_status() ->> 'trial_used')::bool = true,
  '30. (6) EXPIRY WITHOUT A CLOCK: trial_active false, entitled false, trial_used still true');
select t.ok((public.billing_status() ->> 'plan') = 'free'
        and (public.billing_status() ->> 'trial_scope') is null,
  '30. (6) the plan is still free, and an expired trial reports no scope');
rollback;

-- 10. the source cannot be forged --------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003007');
select t.ok((public.start_trial('code') ->> 'started')::bool, '30. (10) start_trial(''code'') from an ordinary caller still starts a trial');
select t.ok((select trial_source  from public.studio_members where user_id = '00000000-0000-4000-8000-000000003007') = 'signup'
        and (select trial_minutes from public.studio_members where user_id = '00000000-0000-4000-8000-000000003007') = 30,
  '30. (10) THE SOURCE CANNOT BE FORGED: 30 minutes and source ''signup'', not 10080 and ''code''');
rollback;

-- 11. the real code path ------------------------------------------------
begin;
do $$
declare v_code text; v_ticket text; v_src text; v_mins int; v_scope text;
begin
  perform t.claims('00000000-0000-4000-8000-00000000000a');
  select code into v_code from public.admin_create_invite('standard', 5, null, null, 'section 30 test');
  perform t.claims('00000000-0000-4000-8000-000000003005');
  select ticket into v_ticket from public.verify_invite(v_code);
  perform * from public.redeem_invite(v_ticket);
  perform public.start_trial();
  perform t.reset();
  select trial_source, trial_minutes, trial_scope into v_src, v_mins, v_scope
    from public.studio_members where user_id = '00000000-0000-4000-8000-000000003005';
  perform t.ok(v_src = 'code' and v_mins = 7 * 1440,
    '30. (11) verify_invite + redeem_invite then start_trial() -> source ''code'', seven days (10080 minutes)');
  -- the decision recorded in 30.5, flippable from the console: a code
  -- buys the longer trial, not the wider one.
  perform t.ok(v_scope = 'sample', '30. (11) and the code trial is still sample scope for now');
end $$;
rollback;

-- 7. a declined requester ------------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003002');
select 1 from public.request_invite('let me in');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_decide_request('00000000-0000-4000-8000-000000003002', false, 'no');
select t.claims('00000000-0000-4000-8000-000000003002');
do $$ begin
  perform public.start_trial();
  raise exception 'should have refused';
exception when sqlstate '42501' then
  raise notice 'ok - 30. (7) a declined requester -> 42501: a trial is not a way round admin_decide_request(.., false)';
end $$;
rollback;

-- 8. a disabled member ---------------------------------------------------
begin;
insert into public.studio_members (user_id, role, disabled_at)
  values ('00000000-0000-4000-8000-000000003003', 'user', now());
select t.claims('00000000-0000-4000-8000-000000003003');
do $$ begin
  perform public.start_trial();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 30. (8) a disabled member -> 42501'; end $$;
rollback;

-- 9. somebody who has paid, and still so after a refund ------------------
begin;
select t.service();
select public.attach_razorpay_order(
  (select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003004', 'starter', 'lifetime')), 'order_trial_4');
select public.activate_payment('order_trial_4', 'pay_trial_4');
select t.claims('00000000-0000-4000-8000-000000003004');
select t.ok((public.start_trial() ->> 'reason') = 'paid', '30. (9) a buyer asking for a trial -> reason ''paid''');
select t.service();
select public.mark_payment_refunded('pay_trial_4');
select t.claims('00000000-0000-4000-8000-000000003004');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000003004') = 'free', '30. (9) (control) the refund put them back on free');
select t.ok((public.start_trial() ->> 'reason') = 'paid',
  '30. (9) and they are STILL refused — paid_at, not status, so a refund is not a route back to a fresh trial');
rollback;

-- 12 / 13. the console ---------------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"trial_enabled": false}'::jsonb);
select t.claims('00000000-0000-4000-8000-000000003006');
select t.ok((public.start_trial() ->> 'reason') = 'disabled',
  '30. (12) trial_enabled false -> start_trial() returns reason ''disabled'' (sign-in lands on the wall)');
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.admin_set_billing_settings('{"not_a_setting": 1}'::jsonb);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 30. (12) an unknown setting key -> 22023'; end $$;
-- THE HANDLER TRAP 30.9 EXISTS TO AVOID. admin_set_billing_settings
-- ends in `exception when check_violation` whose sentence is about
-- referral percentages; a CHECK added in 30.1 would have been reported
-- with it. 30.9 validates the new keys BEFORE the UPDATE, so this must
-- answer in the language of trials.
do $$ declare m text; begin
  perform public.admin_set_billing_settings('{"trial_minutes": 0}'::jsonb);
  raise exception 'should have refused';
exception when sqlstate '22023' then
  m := sqlerrm;
  if m ilike '%referral%' then raise exception 'the check_violation handler answered instead of the explicit validation: %', m; end if;
  if m not ilike '%trial%' then raise exception 'wrong message: %', m; end if;
  raise notice 'ok - 30. (12) {"trial_minutes": 0} -> 22023 with a sentence about TRIALS, not referrals';
end $$;
select t.claims('00000000-0000-4000-8000-000000003006');
do $$ begin
  perform public.admin_set_billing_settings('{"trial_minutes": 60}'::jsonb);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 30. (13) admin_set_billing_settings as a non-admin -> 42501'; end $$;
do $$ begin
  perform public.admin_set_next_price('indie', 999999, now() + interval '1 day');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 30. (13) admin_set_next_price as a non-admin -> 42501'; end $$;
rollback;

-- 14 / 15 / 16. the rise fires on a date, and on a count -----------------
-- Prices are set here rather than assumed; see the header.
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_next_price('indie', null, null);          -- start from nothing scheduled
select public.admin_set_plan('indie', '{"price_paise": 79900}');
select public.admin_set_next_price('indie', 149900, now() + interval '30 days');
select t.reset();
select t.ok((select price_rises_after_buyers from public.billing_settings where id) = 100,
  '30. (14) (control) 30.11 seeded the founding-seat cap at 100');
select t.ok(public.paid_buyers() between 1 and 99,
  '30. (14) (control) there is at least one paid buyer and the cap is not already full, so each trigger can be tested alone');
select t.ok((public.quote_order('indie') ->> 'amount_paise')::int = 79900,
  '30. (14) before the date and under the cap: quote_order is the launch price');

update public.plans set next_price_at = now() - interval '1 minute' where id = 'indie';
select t.ok((public.quote_order('indie') ->> 'amount_paise')::int = 149900,
  '30. (14) THE RISE FIRES ON A DATE: nothing ran, nobody edited a price, and the quote is the new one');
select t.ok((select price_paise from public.plans where id = 'indie') = 79900,
  '30. (14) and price_paise is untouched — effective_price() answers differently, it does not rewrite the row');
select t.ok((public.quote_order('indie') ->> 'next_price_paise') is null,
  '30. (14) a fired rise advertises nothing: the card cannot announce a change that already happened');

update public.plans set next_price_at = now() + interval '30 days' where id = 'indie';
select t.ok((public.quote_order('indie') ->> 'amount_paise')::int = 79900, '30. (15) (control) the date back in the future: the launch price returns');
update public.billing_settings set price_rises_after_buyers = public.paid_buyers() where id;
select t.ok((public.quote_order('indie') ->> 'amount_paise')::int = 149900,
  '30. (15) THE RISE FIRES ON A COUNT: the cap filled, the date still weeks away, and the quote is the new one');
update public.billing_settings set price_rises_after_buyers = 100 where id;
select t.ok((public.quote_order('indie') ->> 'amount_paise')::int = 79900,
  '30. (15) raising the cap back restores the launch price — whichever comes first, not whichever was first set');

select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.admin_set_next_price('indie', 10000, now() + interval '1 day');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  raise notice 'ok - 30. (16) A RISE MUST BE A RISE: a new price below the current one -> 22023';
end $$;
do $$ begin
  perform public.admin_set_next_price('indie', 200000, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 30. (16) a new price with no date -> 22023'; end $$;
select t.ok(public.admin_set_next_price('indie', null, null) ? 'plans', '30. (16) (null, null) clears the rise and answers with the notice');
select t.reset();
select t.ok((select next_price_paise from public.plans where id = 'indie') is null
        and (select next_price_at    from public.plans where id = 'indie') is null,
  '30. (16) cleared means BOTH halves null — the CHECK allows no half-scheduled rise');
do $$ begin
  update public.plans set next_price_at = now() + interval '1 day' where id = 'indie';
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 30. (16) and the table itself refuses a date with no price -> 23514'; end $$;
rollback;

-- 17. what price_notice() publishes, and when ----------------------------
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_next_price('starter', null, null);
select public.admin_set_next_price('indie',   null, null);
select public.admin_set_next_price('pro',     null, null);
select t.claims('00000000-0000-4000-8000-000000003006', 'anon');
select t.ok((public.price_notice() ->> 'seats_taken') is null
        and (public.price_notice() ->> 'seats_total') is null,
  '30. (17) nothing rising: price_notice() carries NO buyer count — a scarcity number with nothing to be scarce about');
select t.ok((select count(*) from jsonb_array_elements(public.price_notice() -> 'plans') e where (e ->> 'rising')::bool) = 0,
  '30. (17) and no plan reports rising');
select t.ok((select count(*) from jsonb_array_elements(public.price_notice() -> 'plans') e where (e ->> 'price_paise') is not null) >= 1,
  '30. (17) the plain prices still stand — the page has a price to show with no countdown');

select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_next_price('indie', (select price_paise + 50000 from public.plans where id = 'indie'), now() + interval '10 days');
select t.claims('00000000-0000-4000-8000-000000003006', 'anon');
select t.ok((public.price_notice() ->> 'seats_taken')::int >= 0
        and (public.price_notice() ->> 'seats_total')::int = 100,
  '30. (17) with a rise scheduled the count IS published, beside the cap it is counting toward');
select t.ok((select (e ->> 'rising')::bool and (e ->> 'next_price_at') is not null and (e ->> 'next_price_paise') is not null
               from jsonb_array_elements(public.price_notice() -> 'plans') e where e ->> 'id' = 'indie'),
  '30. (17) and the rising plan carries both the coming price and its date');
rollback;

-- 19. the grandfather backfill -------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-0000000000f1');
select t.ok(public.user_plan('00000000-0000-4000-8000-0000000000f1') = 'free',
  '30. (19) (control) F is a pre-section-30 member on free — so entitlement here can only come from the backfill');
select t.ok((public.billing_status() ->> 'entitled')::bool,
  '30. (19) THE GRANDFATHER BACKFILL: a member admitted under the old rules is entitled and does not meet the wall');
select t.ok((public.billing_status() ->> 'trial_active')::bool
        and (public.billing_status() ->> 'trial_scope') = 'full',
  '30. (19) on a full-scope trial, not the thirty-minute sample');
select t.ok((select trial_minutes from public.studio_members where user_id = '00000000-0000-4000-8000-0000000000f1') = 525600
        and (select trial_source  from public.studio_members where user_id = '00000000-0000-4000-8000-0000000000f1') = 'admin',
  '30. (19) a year, recorded as an administrator''s grant');
-- and once F PAYS while that trial still runs, the plan bought wins:
-- the features are Pro's, not the trial plan's borrowed map.
select t.claims('00000000-0000-4000-8000-00000000000a');
-- the seeds give indie and pro the same (empty) map, so mark the trial
-- plan's apart or the check below cannot tell the two answers apart
select public.admin_set_plan('indie', '{"features": {"trial_marker": true}}');   -- trial_plan is unset here, so indie
select t.claims('00000000-0000-4000-8000-0000000000f1');
select t.ok((public.billing_status() -> 'features' ->> 'trial_marker')::bool,
  '30. (19) (control) before paying, the full trial shows the trial plan''s map');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_plan('00000000-0000-4000-8000-0000000000f1', 'pro', 0, 'paid mid-trial');
select t.claims('00000000-0000-4000-8000-0000000000f1');
select t.ok((public.billing_status() ->> 'plan') = 'pro'
        and (public.billing_status() -> 'features') = (select features from public.plans where id = 'pro')
        and (public.billing_status() -> 'features' ->> 'trial_marker') is null,
  '30. (19) a buyer whose full trial is still running gets the BOUGHT plan''s features, not the trial plan''s');
rollback;

-- and the backfill did not hand entitlement to somebody an
-- administrator had already shut out.
select t.reset();
select t.ok(public.is_entitled('00000000-0000-4000-8000-0000000000d1') = false,
  '30. a DISABLED member is not entitled, backfilled trial or not');
select t.ok(public.is_entitled(null) = false, '30. and a caller with no uid is not entitled (the signed-out case)');

\echo
\echo SECTION 30 CHECKS PASSED
