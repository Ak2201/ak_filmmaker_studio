-- ============================================================
-- SECTION 41 CHECKS — admin_health() and admin_launch_preview()
-- ------------------------------------------------------------
-- The list at 41.5, executed. Runs after schema-41-admin-health.sql has
-- loaded on top of the whole schema, with its own people (…4101 upward).
-- Earlier files leave payments, members and invoices behind, so every
-- count is asserted as a DELTA against the same tables read directly,
-- never as a literal.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004101', 'h-member@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004102', 'h-old@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000004103', 'h-asker@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004104', 'h-payer@example.com',   now(), '{}');
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000004101', 'user')
on conflict (user_id) do nothing;

-- 1. admin only: anon and a signed-in member are refused, on both
select t.reset();
do $$ begin perform public.admin_health(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 41. (1) anon: admin_health -> 42501'; end $$;
do $$ begin perform public.admin_launch_preview(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 41. (1) anon: admin_launch_preview -> 42501'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004101');
do $$ begin perform public.admin_health(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 41. (1) a member: admin_health -> 42501'; end $$;
do $$ begin perform public.admin_launch_preview(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 41. (1) a member: admin_launch_preview -> 42501'; end $$;
rollback;

-- 2. on the fully loaded schema every marker is found, so `missing` is
-- empty — which also proves the markers are the right objects
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(jsonb_array_length(public.admin_health() #> '{sections,present}') = 39
        and (public.admin_health() #>> '{sections,expected}')::int = 39
        and public.admin_health() #> '{sections,missing}' = '[]'::jsonb,
  '41. (2) all 39 section markers are found on the whole schema, none missing');
select t.ok(jsonb_array_length(public.admin_health() -> 'checks') = 10,
  '41. (2) ten checks are reported');
select t.ok(not exists (select 1 from jsonb_array_elements(public.admin_health() -> 'checks') c where c ->> 'observed' is null or c ->> 'level' is null),
  '41. (2) every check states a level and an observation');
rollback;

-- 3. a missing marker is reported as missing, by section and marker name,
-- and says only what was observed
begin;
drop table public.plan_prices;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_health() #> '{sections,missing}' = '[{"section": 31, "marker": "table plan_prices"}]'::jsonb,
  '41. (3) dropping plan_prices makes exactly section 31 missing, naming its marker');
select t.ok(jsonb_array_length(public.admin_health() #> '{sections,present}') = 38,
  '41. (3) and the other 38 are still present');
select t.ok((select c ->> 'level' from jsonb_array_elements(public.admin_health() -> 'checks') c where c ->> 'id' = 'sections') = 'warn'
        and (select c ->> 'observed' from jsonb_array_elements(public.admin_health() -> 'checks') c where c ->> 'id' = 'sections') like '%§31 (table plan_prices)%',
  '41. (3) the sections check is a warn that quotes the missing marker');
select t.ok((select c ->> 'observed' from jsonb_array_elements(public.admin_health() -> 'checks') c where c ->> 'id' = 'sections') !~* 'not run|never ran|forgot',
  '41. (3) it does not name a cause');
rollback;
begin;
drop function public.admin_resend_receipt(uuid);
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_health() #> '{sections,missing}' = '[{"section": 35, "marker": "function admin_resend_receipt"}]'::jsonb,
  '41. (3) a dropped function is found the same way (section 35)');
rollback;

-- 4. plans.features: an empty map is seen, and section 36's data marker follows it
begin;
update public.plans set features = '{}'::jsonb where id = 'indie';
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select (e ->> 'empty')::bool from jsonb_array_elements(public.admin_health() -> 'plan_features') e where e ->> 'plan' = 'indie'),
  '41. (4) an emptied paid tier is reported empty');
select t.ok((select c ->> 'level' from jsonb_array_elements(public.admin_health() -> 'checks') c where c ->> 'id' = 'plan_features') = 'warn',
  '41. (4) the plan_features check is a warn');
select t.ok(public.admin_health() #> '{sections,missing}' = '[{"section": 36, "marker": "data: no paid plan has an empty features map"}]'::jsonb,
  '41. (4) section 36 (its marker is data) reads missing while a tier is empty');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(jsonb_array_length(public.admin_health() -> 'plan_features') = 3
        and not exists (select 1 from jsonb_array_elements(public.admin_health() -> 'plan_features') e where (e ->> 'empty')::bool)
        and (select min((e ->> 'enabled')::int) from jsonb_array_elements(public.admin_health() -> 'plan_features') e) > 0,
  '41. (4) three paid tiers, none empty, each with something enabled, as section 36 left them');
rollback;

-- 5. switch, trial offer, price notice agree with the anon reads
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_health() -> 'purchases_required')::text = public.purchases_required()::text,
  '41. (5) purchases_required is what the anon RPC answers');
select t.ok(public.admin_health() -> 'trial_offer' = public.trial_offer(),
  '41. (5) trial_offer is what the anon RPC answers');
select t.ok(public.admin_health() #> '{price_notice,notice}' = public.price_notice()
        and (public.admin_health() #>> '{price_notice,free_listed}')::bool = false
        and (public.admin_health() #>> '{price_notice,zero_or_null_price}')::int = 0,
  '41. (5) price_notice is the anon RPC''s answer, no free plan listed, no zero price');
select t.ok(public.admin_health() -> 'wall' = public.admin_purchase_wall(),
  '41. (5) the wall census is admin_purchase_wall() itself');
rollback;

-- 6. receipts: an unmailed invoice shows, by count and by age
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
create temp table _h0 as select public.admin_health() -> 'receipts' as r;
select t.reset();
insert into public.invoices (number, fy, seq, payment_id, user_id, buyer_name, buyer_email, plan_id, plan_name, amount_paise, issued_at, emailed_at)
values ('H41-TEST-1', '2026-27', 990001, gen_random_uuid(), '00000000-0000-4000-8000-000000004104', 'Payer', 'h-payer@example.com', 'indie', 'Intermediate', 100, now() - interval '3 days', null),
       ('H41-TEST-2', '2026-27', 990002, gen_random_uuid(), '00000000-0000-4000-8000-000000004104', 'Payer', '',                    'indie', 'Intermediate', 100, now() - interval '3 days', null);
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_health() #>> '{receipts,awaiting}')::int = (select (r ->> 'awaiting')::int from _h0) + 1,
  '41. (6) an unmailed invoice with an e-mail adds one to awaiting');
select t.ok((public.admin_health() #>> '{receipts,awaiting_recent}')::int = (select (r ->> 'awaiting_recent')::int from _h0) + 1,
  '41. (6) and one to awaiting_recent (issued inside 7 days)');
select t.ok((public.admin_health() #>> '{receipts,no_buyer_email}')::int = (select (r ->> 'no_buyer_email')::int from _h0) + 1,
  '41. (6) an invoice with no buyer e-mail is counted apart, not as awaiting');
select t.ok((public.admin_health() #>> '{receipts,oldest_awaiting_age_seconds}')::bigint >= 3 * 86400 - 5,
  '41. (6) the oldest awaiting age is at least the three days seeded');
select t.reset();
update public.invoices set emailed_at = now() where number = 'H41-TEST-1';
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_health() #>> '{receipts,awaiting}')::int = (select (r ->> 'awaiting')::int from _h0),
  '41. (6) once it is marked mailed it leaves the queue');
rollback;

-- 7. payments in created for over an hour; refund backlog; invite requests
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
create temp table _h1 as select public.admin_health() as h;
select t.reset();
insert into public.payments (id, user_id, plan_id, period, amount_paise, status, created_at)
values ('00000000-0000-4000-8000-0000000041a1', '00000000-0000-4000-8000-000000004104', 'indie', 'lifetime', 100, 'created', now() - interval '2 hours'),
       ('00000000-0000-4000-8000-0000000041a2', '00000000-0000-4000-8000-000000004104', 'indie', 'lifetime', 100, 'created', now() - interval '5 minutes');
insert into public.refund_requests (user_id, payment_id, category) values
  ('00000000-0000-4000-8000-000000004104', '00000000-0000-4000-8000-0000000041a1', 'other');
insert into public.invite_requests (user_id, email, status, requested_at) values
  ('00000000-0000-4000-8000-000000004103', 'h-asker@example.com', 'pending', now() - interval '2 days');
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_health() #>> '{payments,created_older_than_1h}')::int = (select (h #>> '{payments,created_older_than_1h}')::int from _h1) + 1,
  '41. (7) a payment created two hours ago counts; one created five minutes ago does not');
select t.ok((public.admin_health() #>> '{payments,oldest_created_age_seconds}')::bigint >= 3600,
  '41. (7) the oldest created age is over an hour');
select t.ok((public.admin_health() #>> '{refunds,requests_pending}')::int = (select (h #>> '{refunds,requests_pending}')::int from _h1) + 1,
  '41. (7) a pending refund request adds one to the backlog');
select t.ok((public.admin_health() #>> '{invite_requests,pending}')::int = (select (h #>> '{invite_requests,pending}')::int from _h1) + 1
        and (public.admin_health() #>> '{invite_requests,oldest_age_seconds}')::bigint >= 2 * 86400 - 5,
  '41. (7) a pending invite request adds one, and its age is reported');
select t.ok((select c ->> 'level' from jsonb_array_elements(public.admin_health() -> 'checks') c where c ->> 'id' = 'refunds') = 'warn',
  '41. (7) the refunds check is a warn while there is a backlog');
rollback;

-- 8. a probe that raises does not take the report down, and says what it saw
begin;
drop table public.invite_requests cascade;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_health() #> '{invite_requests,error}' = '"42P01"'::jsonb,
  '41. (8) a probe on a missing table reports its SQLSTATE in its own slot');
select t.ok((select c ->> 'level' from jsonb_array_elements(public.admin_health() -> 'checks') c where c ->> 'id' = 'invite_requests') = 'unknown',
  '41. (8) its check is unknown, never ok');
select t.ok(public.admin_health() ->> 'wall' is not null and not (public.admin_health() -> 'wall') ? 'error',
  '41. (8) the other probes are unaffected');
rollback;

-- 9. read-only, and independent of section 40
begin;
drop function if exists public.admin_audit_write(text, text, text, jsonb, jsonb, text);
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_health() ? 'checks' and public.admin_launch_preview() ? 'members',
  '41. (9) both RPCs work with no admin_audit_write() present: they are read-only');
rollback;

-- 10. the launch preview
begin;
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
values ('00000000-0000-4000-8000-000000004102', 'user', now() - interval '1 day', 30, 'signup', 'sample')
on conflict (user_id) do update set trial_started_at = now() - interval '1 day', trial_minutes = 30, trial_source = 'signup', trial_scope = 'sample';
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_launch_preview() ->> 'would_wall_count')::int = (public.admin_purchase_wall() ->> 'walled')::int,
  '41. (10) would_wall_count equals the census''s walled');
select t.ok(public.admin_launch_preview() -> 'census' = public.admin_purchase_wall(),
  '41. (10) the census is admin_purchase_wall(), reused');
select t.ok(exists (select 1 from jsonb_array_elements(public.admin_launch_preview() -> 'members') e
                     where e ->> 'user_id' = '00000000-0000-4000-8000-000000004102'
                       and e ->> 'email' = 'h-old@example.com' and (e ->> 'grandfathered')::bool = false),
  '41. (10) a lapsed signup trial is listed with its e-mail, not grandfathered');
select t.ok((public.admin_launch_preview() ->> 'blocked_by_grandfathered')::int = (public.admin_purchase_wall() ->> 'grandfathered_walled')::int
        and (public.admin_launch_preview() ->> 'can_throw')::bool = ((public.admin_purchase_wall() ->> 'grandfathered_walled')::int = 0),
  '41. (10) can_throw is true exactly when nobody grandfathered is walled');
select t.reset();
update public.studio_members set trial_started_at = now() - interval '2 years', trial_minutes = 525600, trial_source = 'admin', trial_scope = 'full'
 where user_id = '00000000-0000-4000-8000-000000004102';
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_launch_preview() ->> 'can_throw')::bool = false
        and (public.admin_launch_preview() ->> 'blocked_by_grandfathered')::int >= 1
        and (select (e ->> 'grandfathered')::bool from jsonb_array_elements(public.admin_launch_preview() -> 'members') e
              where e ->> 'user_id' = '00000000-0000-4000-8000-000000004102'),
  '41. (10) a lapsed grandfathered member blocks the switch and is flagged in the list');
select t.ok((public.admin_launch_preview() #>> '{members,0,grandfathered}')::bool,
  '41. (10) grandfathered members are listed first');
do $$ begin
  perform public.admin_set_billing_settings('{"purchase_required": true}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 41. (10) and section 39 does refuse to throw the switch while they are walled'; end $$;
rollback;

-- 11. rollback needs nothing new: the switch goes back with the section 39 RPC
begin;
update public.billing_settings set purchase_required = true where id;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_launch_preview() ->> 'switch_on')::bool,
  '41. (11) the preview reports the switch on');
select t.ok(((public.admin_launch_preview() #>> '{rollback,needs_new_object}'))::bool = false
        and public.admin_launch_preview() #>> '{rollback,call}' = 'admin_set_billing_settings',
  '41. (11) it names the rollback: the existing RPC');
select t.ok((public.admin_set_billing_settings('{"purchase_required": false}') ->> 'purchase_required')::bool = false,
  '41. (11) admin_set_billing_settings(purchase_required false) turns it back off, whatever the census says');
rollback;

-- 12. the settings stamp is reported as ANY setting
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_health() #>> '{billing_settings_last_touched,scope}' like 'any billing setting%',
  '41. (12) billing_settings_last_touched says it is any setting, not the switch');
rollback;

-- 13. the internal probes are not callable by anyone
begin;
select t.claims('00000000-0000-4000-8000-000000004101');
do $$ begin perform public.health_has_fn('is_studio_admin'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 41. (13) health_has_fn is internal -> 42501'; end $$;
rollback;
