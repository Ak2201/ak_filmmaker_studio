-- ============================================================
-- SECTION 31 CHECKS — region and currency
-- ------------------------------------------------------------
-- The thirteen checks listed at 31.6, executed. Runs last, after
-- trial.sql, against the whole schema. A (…00a) is still the
-- administrator; N (…3101) is this file's non-admin.
--
-- WHY THIS FILE EXISTS AT ALL, and it is not only completeness:
-- trial.sql runs AFTER section 31 has loaded, so a fault in 31 aborts
-- the harness before a single section 30 check can report. Until this
-- file, nothing executed section 31 at any point.
--
-- THE FIRST CHECK IS THE ONE THAT CANNOT BE WRITTEN ANY OTHER WAY.
-- Section 31 deliberately adds price_notice(text) with NO default
-- argument, because `default 'INR'` would make the EXISTING
-- no-argument call ambiguous — two candidates, "function
-- price_notice() is not unique" — on the one page that has no session
-- to retry with. That claim is not assertable from the outside: if it
-- is wrong, check 1 does not fail, it ERRORS and takes the file with
-- it. Which is the correct failure mode, and is said here so the next
-- person reading a red run knows what they are looking at.
--
-- Everything mutating runs inside begin … rollback, so this file
-- leaves the database exactly as trial.sql left it.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003101', 'cur-user@example.com', now(), '{"full_name":"Nila"}');

-- 1. BOTH FUNCTIONS STILL RESOLVE ---------------------------------------
-- A no-argument call reaches section 30's function unchanged, and the
-- section 31 overload is reached only with an argument. If the two ever
-- become ambiguous this statement raises 42725, not a failed assertion.
select t.ok(public.price_notice() ? 'plans' and not (public.price_notice() ? 'currency'),
  '31. (1) price_notice() still resolves to section 30''s zero-argument function, answer unchanged (no `currency` key)');
select t.ok((public.price_notice('USD') ->> 'currency') = 'USD' and public.price_notice('USD') ? 'plans',
  '31. (1) and price_notice(text) resolves on its own — the overload-with-no-default holds');

-- 2. THE SIGNED-OUT SURFACE ----------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003101', 'anon');
select t.ok(public.price_notice('USD') ? 'plans', '31. (2) anon: price_notice(''USD'') answers — start.html reads it with no session');
select t.ok((select count(*) from public.plan_prices) >= 4,
  '31. (2) anon may SELECT plan_prices: a price is public by nature, exactly the section 18 argument for plans');
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor) values ('indie', 'EUR', 2900);
  raise exception 'should have refused';
exception when sqlstate '42501' then
  raise notice 'ok - 31. (2) and anon cannot write: no insert policy, and the absence IS the policy -> 42501';
end $$;
-- AND THE UPDATE IS ASSERTED ON THE DATA, NOT ON AN ERROR. Default-deny
-- under RLS is loud for INSERT (the WITH CHECK fails on the new row)
-- and SILENT for UPDATE: with no update policy no row is even visible
-- to update, so the statement succeeds and touches nothing. A check
-- written as "expect 42501" here would raise its own 'should have
-- refused' and fail the file — for the right reason, by the wrong test.
update public.plan_prices set amount_minor = 1 where currency = 'USD';
select t.ok((select count(*) from public.plan_prices where amount_minor = 1) = 0,
  '31. (2) nor update one: no update policy, so anon''s UPDATE matches no row and changes nothing');
rollback;

-- 3. THE DRIP-PRICING DISCLOSURE -----------------------------------------
-- The whole legal point of the overload: there is no call that answers
-- in dollars alone. Asserted against EVERY plan, not a sampled one.
begin;
-- a known starting point: no rise scheduled anywhere, so display_minor
-- is the current figure rather than the risen one.
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_next_price('starter', null, null);
select public.admin_set_next_price('indie',   null, null);
select public.admin_set_next_price('pro',     null, null);
select t.reset();
select t.ok((public.price_notice('USD') ->> 'charged_currency') = 'INR',
  '31. (3) price_notice(''USD'') names what Razorpay will actually settle: charged_currency INR');
select t.ok((select count(*) = 0 from jsonb_array_elements(public.price_notice('USD') -> 'plans') e
              where (e ->> 'price_paise') is null),
  '31. (3) THE DRIP-PRICING DISCLOSURE: every plan in the dollar answer carries its rupee figure — hiding it until checkout is a named practice, so it is impossible to omit');
select t.ok((select bool_and((e ->> 'price_paise')::int = public.effective_price(e ->> 'id'))
              from jsonb_array_elements(public.price_notice('USD') -> 'plans') e),
  '31. (3) and that rupee figure IS effective_price() — the same number quote_for will charge, not a copy of it');
select t.ok((select (e ->> 'display_minor')::int = 1900 and (e ->> 'display_currency') = 'USD'
              from jsonb_array_elements(public.price_notice('USD') -> 'plans') e where e ->> 'id' = 'starter')
        and (select (e ->> 'display_minor')::int = 2900
              from jsonb_array_elements(public.price_notice('USD') -> 'plans') e where e ->> 'id' = 'indie')
        and (select (e ->> 'display_minor')::int = 3900
              from jsonb_array_elements(public.price_notice('USD') -> 'plans') e where e ->> 'id' = 'pro'),
  '31. (3) the seeded USD display figures: $19 / $29 / $39');
-- AND NOTHING IS ADVERTISED THAT IS NOT SCHEDULED. 31.2 seeds a USD
-- next_amount_minor for every tier whether or not that tier has a rise
-- on plans; a card reading "$19 -> $29" with nothing scheduled would be
-- the false-urgency claim section 30 exists to refuse, in the other
-- currency. display_next_minor must follow `rising`, not merely the
-- presence of a row.
select t.ok((select count(*) = 0 from jsonb_array_elements(public.price_notice('USD') -> 'plans') e
              where (e ->> 'display_next_minor') is not null),
  '31. (3) with NO rise scheduled, no plan advertises a coming dollar price — display_next_minor follows `rising`, not the row');
select t.ok((select count(*) = 0 from jsonb_array_elements(public.price_notice('USD') -> 'plans') e
              where (e ->> 'rising')::bool),
  '31. (3) (control) and nothing reports rising, so the two answers agree');
rollback;

-- 4. EVERY UNUSABLE CURRENCY FALLS BACK TO INR, NEVER TO NULL ------------
-- A price that renders blank is worse than a price in the wrong
-- currency, and this is the one function the landing page cannot do
-- without. Four ways to ask for something unusable, one answer.
select t.ok((select bool_and((e ->> 'display_minor')::int = (e ->> 'price_paise')::int
                             and (e ->> 'display_currency') = 'INR')
              from jsonb_array_elements(public.price_notice('INR') -> 'plans') e),
  '31. (4) ''INR'': the display figures ARE the rupee figures, so a client needs one code path');
select t.ok((select bool_and((e ->> 'display_minor')::int = (e ->> 'price_paise')::int
                             and (e ->> 'display_currency') = 'INR')
              from jsonb_array_elements(public.price_notice('zzz') -> 'plans') e),
  '31. (4) ''zzz'': a well-formed code nothing is priced in falls back to INR');
select t.ok((public.price_notice('zzz') ->> 'currency') = 'ZZZ',
  '31. (4) and the ASKED-FOR code is echoed upper-cased — the client compares it with display_currency to see it was not honoured');
select t.ok((select bool_and((e ->> 'display_minor')::int = (e ->> 'price_paise')::int
                             and (e ->> 'display_currency') = 'INR')
              from jsonb_array_elements(public.price_notice(null) -> 'plans') e)
        and (public.price_notice(null) ->> 'currency') = 'INR',
  '31. (4) null: falls back to INR and says so');
select t.ok((select bool_and((e ->> 'display_minor')::int = (e ->> 'price_paise')::int)
              from jsonb_array_elements(public.price_notice('nonsense') -> 'plans') e)
        and (public.price_notice('nonsense') ->> 'currency') = 'INR',
  '31. (4) ''nonsense'': not an ISO code at all, so the request itself is read as INR');
select t.ok((select count(*) = 0 from jsonb_array_elements(public.price_notice('USD') -> 'plans') e
              where e ->> 'id' = 'free' and (e ->> 'display_currency') <> 'INR'),
  '31. (4) a plan with no row for the currency asked for (free) falls back too, inside an answer that otherwise honoured it');

-- 5. quote_for / quote_order ARE UNCHANGED -------------------------------
-- Section 31 builds the half that does not touch money. If a currency
-- key ever appears here, a second payment rail has been half-built.
select t.reset();
select t.ok(not (public.quote_order('indie') ? 'currency')
        and not (public.quote_order('indie') ? 'display_minor')
        and not (public.quote_order('indie') ? 'charged_currency'),
  '31. (5) quote_order carries no currency key of any kind — section 31 did not reach the quote');
select t.ok((public.quote_order('indie') ->> 'amount_paise')::int = public.effective_price('indie'),
  '31. (5) and it still charges effective_price() in rupees');

-- 6. THE CHECKS HOLD, INCLUDING AGAINST A PRIVILEGED WRITER --------------
-- Run as the table owner, which RLS does not guard: the constraints are
-- the thing being tested, not the policies.
begin;
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor) values ('indie', 'usd', 2900);
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 31. (6) a lower-case currency -> 23514 (ISO 4217 is upper case)'; end $$;
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor) values ('indie', 'DOLLARS', 2900);
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 31. (6) a currency that is not three letters -> 23514'; end $$;
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor, next_amount_minor) values ('indie', 'EUR', 2900, 2900);
  raise exception 'should have refused';
exception when sqlstate '23514' then
  raise notice 'ok - 31. (6) a next price EQUAL to the current one -> 23514: a rise that is not a rise, in the other table too';
end $$;
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor, next_amount_minor) values ('indie', 'EUR', 2900, 1900);
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 31. (6) a next price BELOW the current one -> 23514'; end $$;
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor) values ('indie', 'EUR', -1);
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 31. (6) a negative amount -> 23514'; end $$;
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor) values ('indie', 'USD', 9999);
  raise exception 'should have refused';
exception when sqlstate '23505' then raise notice 'ok - 31. (6) a second row for the same plan and currency -> 23505'; end $$;
do $$ begin
  insert into public.plan_prices (plan_id, currency, amount_minor) values ('nosuchplan', 'EUR', 100);
  raise exception 'should have refused';
exception when sqlstate '23503' then raise notice 'ok - 31. (6) a price for a plan that does not exist -> 23503'; end $$;
insert into public.plan_prices (plan_id, currency, amount_minor, next_amount_minor) values ('indie', 'EUR', 2900, 3900);
select t.ok((select next_amount_minor from public.plan_prices where plan_id = 'indie' and currency = 'EUR') = 3900,
  '31. (6) (control) and a genuine rise in a new currency is accepted, so the refusals above are not refusing everything');
rollback;

-- 7 / 8 / 9 / 10 / 11. THE CONSOLE ---------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003101');
do $$ begin
  perform public.admin_set_plan_price('indie', 'USD', 2900, null, null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 31. (7) admin_set_plan_price as a non-admin -> 42501'; end $$;

select t.claims('00000000-0000-4000-8000-00000000000a');
-- 8. INR has exactly two authors already, and a third would move the
-- number on the card without moving the number on the invoice.
do $$ declare m text; begin
  perform public.admin_set_plan_price('indie', 'INR', 79900, null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then
  m := sqlerrm;
  if m not like '%admin_set_next_price%' then raise exception 'the refusal does not say where the rupee price IS set: %', m; end if;
  raise notice 'ok - 31. (8) admin_set_plan_price(.., ''INR'', ..) -> 22023, naming admin_set_plan and admin_set_next_price';
end $$;
do $$ begin
  perform public.admin_set_plan_price('indie', 'inr', 79900, null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 31. (8) and lower-case ''inr'' is refused the same way — the check is on the normalised code'; end $$;
do $$ begin
  perform public.admin_set_plan_price('indie', 'DOLLARS', 2900, null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 31. (8) a currency that is not an ISO 4217 code -> 22023'; end $$;
do $$ begin
  perform public.admin_set_plan_price('nosuchplan', 'USD', 2900, null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 31. (8) an unknown plan -> 22023'; end $$;
do $$ begin
  perform public.admin_set_plan_price('indie', 'USD', -1, null, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 31. (9) a negative amount -> 22023'; end $$;

-- 9. a next price that is not a rise, and a date with nothing to apply it to
select public.admin_set_next_price('indie', null, null);     -- nothing scheduled on the plan
do $$ begin
  perform public.admin_set_plan_price('indie', 'USD', 2900, 1900, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 31. (9) a next price BELOW the current one -> 22023, before the one-clock rule is even reached'; end $$;
do $$ begin
  perform public.admin_set_plan_price('indie', 'USD', 2900, null, now() + interval '5 days');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 31. (9) a date with no new price -> 22023: the date belongs to the plan, not to the currency'; end $$;

-- 10. ONE CLOCK PER PLAN. A currency may not schedule its own rise.
do $$ declare m text; begin
  perform public.admin_set_plan_price('indie', 'USD', 2900, 3900, null);
  raise exception 'should have refused';
exception when sqlstate '22023' then
  m := sqlerrm;
  if m not like '%ONE date per plan%' then raise exception 'wrong refusal: %', m; end if;
  raise notice 'ok - 31. (10) a dollar rise with no rupee rise scheduled -> 22023 naming the one-clock rule';
end $$;
-- schedule the rupee rise, and the very same call now lands
select public.admin_set_next_price('indie', (select price_paise + 50000 from public.plans where id = 'indie'), now() + interval '10 days');
select t.ok(public.admin_set_plan_price('indie', 'USD', 2900, 3900, null) ? 'plans',
  '31. (10) with the plan''s rise scheduled, the identical call succeeds and answers with the notice');
select t.ok((select amount_minor = 2900 and next_amount_minor = 3900
               from public.plan_prices where plan_id = 'indie' and currency = 'USD'),
  '31. (10) and the row reads $29 rising to $39');

-- 11. p_at is a confirmation, not a setting
do $$ declare m text; begin
  perform public.admin_set_plan_price('indie', 'USD', 2900, 3900, now() + interval '3 days');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  m := sqlerrm;
  if m not like '%date of its own%' then raise exception 'wrong refusal: %', m; end if;
  raise notice 'ok - 31. (11) a date that is not the plan''s own -> 22023';
end $$;
select t.ok(public.admin_set_plan_price('indie', 'USD', 2900, 3900,
              (select next_price_at from public.plans where id = 'indie')) ? 'plans',
  '31. (11) and passing the plan''s own next_price_at is accepted — it confirms, it does not set');
rollback;

-- 12. THE DOLLAR CARD FOLLOWS THE RUPEE CLOCK ----------------------------
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_next_price('indie', null, null);
select public.admin_set_next_price('indie', (select price_paise + 50000 from public.plans where id = 'indie'), now() + interval '10 days');
select t.reset();
select t.ok((select (e ->> 'rising')::bool and (e ->> 'display_next_minor')::int = 3900 and (e ->> 'display_minor')::int = 2900
               from jsonb_array_elements(public.price_notice('USD') -> 'plans') e where e ->> 'id' = 'indie'),
  '31. (12) before the rise: $29 today, $39 coming, and the plan reports rising');
update public.plans set next_price_at = now() - interval '1 minute' where id = 'indie';
select t.ok((select (e ->> 'display_minor')::int = 3900 and (e ->> 'display_next_minor') is null and not (e ->> 'rising')::bool
               from jsonb_array_elements(public.price_notice('USD') -> 'plans') e where e ->> 'id' = 'indie'),
  '31. (12) the rupee clock turned and the dollar card turned with it: $39 now, and nothing advertised');
select t.ok((select (e ->> 'price_paise')::int = public.effective_price('indie') and (e ->> 'next_price_paise') is null
               from jsonb_array_elements(public.price_notice('USD') -> 'plans') e where e ->> 'id' = 'indie'),
  '31. (12) with the rupee figures saying exactly the same thing — one clock, two price tags');
rollback;

-- 13. RE-RUNNING SECTION 31 IS A NO-OP -----------------------------------
-- 31.2, verbatim. The INR mirror is refreshed from plans (it is a
-- mirror, and a stale mirror is the beginning of a second author for a
-- charged price); a console edit to a display currency survives,
-- exactly as 30.11 is written to survive one.
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_plan_price('pro', 'USD', 4400, null, null);
select t.reset();
select t.ok((select amount_minor from public.plan_prices where plan_id = 'pro' and currency = 'USD') = 4400,
  '31. (13) (control) the console moved Pro to $44');
insert into public.plan_prices (plan_id, currency, amount_minor, next_amount_minor)
select p.id, 'INR', p.price_paise, p.next_price_paise from public.plans p
on conflict (plan_id, currency) do update
   set amount_minor      = excluded.amount_minor,
       next_amount_minor = excluded.next_amount_minor,
       updated_at        = now();
insert into public.plan_prices (plan_id, currency, amount_minor, next_amount_minor) values
  ('starter', 'USD', 1900, 2900),
  ('indie',   'USD', 2900, 3900),
  ('pro',     'USD', 3900, 4900)
on conflict (plan_id, currency) do nothing;
select t.ok((select amount_minor = 4400 and next_amount_minor is null
               from public.plan_prices where plan_id = 'pro' and currency = 'USD'),
  '31. (13) re-running the seed does NOT overwrite it: `do nothing`, as 30.11 does');
select t.ok(not exists (select 1 from public.plan_prices pp join public.plans p on p.id = pp.plan_id
                         where pp.currency = 'INR'
                           and (pp.amount_minor <> p.price_paise
                                or pp.next_amount_minor is distinct from p.next_price_paise)),
  '31. (13) and the INR mirror IS refreshed from plans, every plan, both figures');
select t.ok((select count(*) from public.plan_prices where currency = 'INR') = (select count(*) from public.plans),
  '31. (13) one INR row per plan, free included — the table is the whole price list');
rollback;

\echo
\echo SECTION 31 CHECKS PASSED
