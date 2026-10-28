# Live steps, 27 Oct 2026: the launch week pass (§58–§61, the functions, the console)

The pass is the owner's launch offer: a paid week of the whole studio (₹49 for
7 days today), once per person, with a real deadline and an optional real cap.
The yearly plans do not change. `docs/BILLING.md` §25 explains it and
`docs/SECURITY-RLS.md` §61 has the two-account checks.

Nothing in the database changes behaviour until the console switches the pass
on: `pass_enabled` is false by default, so after §61 runs, every page and every
order works exactly as it does today. Do the steps in this order.

## Status, 28 Oct 2026

Run live on `conhlrulxfwkhsnymakz` through the SQL editor, each file loaded at
`1b1b004d`, its SHA-256 compared with the line in step 1 before Run, then read
back. Supabase showed its generic "destructive operations" dialog for §59 and
§61; the drops are CHECK constraints §61 re-adds wider and §59's own policies,
triggers and functions, none on user data.

| Step | State |
| --- | --- |
| §57 invoice year | **RUN LIVE.** `invoices.valid_from`, `valid_until`, `invoices_payment_facts()` present |
| §58 funnel source | **RUN LIVE.** `events.source`, both `bump_event` forms, `admin_funnel_by_source`, primary key includes `source` |
| §59 testimonials | **RUN LIVE.** RLS on, `public_testimonials()` answers (0), `testimonials_on_user_delete` trigger, author FK is set-null, `submit_testimonial`, `admin_set_testimonial_status` |
| §60 trial scope | **RUN LIVE.** `start_trial` carries §60; `trial_offer()` has `trial_scope` (live value `sample`, 30 minutes: the console's trial setting is NOT changed) |
| §61 week pass | **RUN LIVE.** Pass off, 4900 paise, 7 days, `pro`, no deadline, no cap; `trial_enabled` still true; the four CHECKs name `pass` / `pass_buy` / `has_plan`; `start_trial` carries §61; `paid_buyers()` = 2. `quote_pass` / `admin_set_pass` rows were below the visible grid and not read |
| §62 auto-renew | **RUN LIVE 28 Oct**, checksum `e37b186c…29f2` matched; read-back: `pass_mode` and `plan_mode` both `once` (also in `trial_offer()`), RLS on `subscriptions` and `rzp_plans`, `pass_sold()` 0, `paid_buyers()` 2 (before the purge), `trial_enabled` true, `pass_enabled` false, the subscription functions present. Changes nothing while the modes are one-time |
| §63 renewal reminders | **RUN LIVE 28 Oct**, checksum `39984700…a54e` matched; read-back: `subscriptions.reminded_for` present, `release_renewal_reminder` present, neither `authenticated` nor `anon` can execute `claim_renewal_reminders` |
| §64 Pro blurb | **RUN LIVE.** `plans.blurb` for `pro` reads "A production house: no cap on films, links or collaborators." |
| Functions redeploy (step 4) | **DONE 28 Oct 03:30 UTC**, from `develop` at `8d4fdb81` (includes §61's `year`/`pass` periods and the SMTP mail path): `rzp-order`, `rzp-verify`, `rzp-webhook` v13, `rzp-refund` v7, all ACTIVE. Probed: the three JWT functions answer 401 "Missing authorization header", `rzp-webhook` 401 "bad signature". The pass, SMTP mail and USD paths are NOT yet exercised: that needs a real purchase, refund and receipt |
| Mail (BILLING §14, Option B) | **SECRETS SET 28 Oct 03:29–03:30 UTC:** `MAIL_FROM`, `SMTP_USER` (`support@filmmakerstudio.in`), `SMTP_PASSWORD` (a Hostinger app password for that mailbox; value never recorded, stored non-empty). `RESEND_API_KEY` is not set, so mail goes over SMTP (`smtp.hostinger.com:465`). Hostinger plan: Starter Business Email, 1 of 1 mailbox, 1000 messages / 24 h. **The first real send is untested**: `denomailer` has never run under Deno. Test with the console's Resend receipt on an existing invoice or one purchase, then read the result in the function logs |
| Purge script (step 0) | **RUN 28 Oct ~03:40 UTC**, on the owner's explicit go-ahead and after the owner took a Supabase backup. PREVIEW first (checksum `c442776e…`): exactly one keeper sign-in, 0 unclassified tables; removed 8 sign-ins, 5 films (16 data rows), 5 accounts / seats / studio members, 3 device locks, 7 payments (all test mode: Razorpay LIVE mode shows 0 captured payments), 2 invoices, 1 e-mail grant, 8 invite codes (3 tickets, 1 redemption), 2 promo codes, 2 invite requests, 59 funnel counts, 38 usage counts, 10 audit rows. PURGE (checksum `8aa1d572…`) committed; READ-BACK (checksum `5d076d0f…`): all 34 checks true: one sign-in = the keeper (`arunkumarmohanans@gmail.com`), `admin_roles` and `studio_members` exactly the keeper, no account on a plan, no other owner's films, every emptied table 0, `price_notice()` answers. The keeper has NO plan and NO trial now: give it a plan or an admin grant before testing as that account. The first invoice will be `FMS/<fy>/000001` |
| Price rise (26 Oct step 1) | **DONE 28 Oct, to 2026-11-15T18:29Z (15 Nov 23:59 IST)**, the owner's later choice instead of 31 Dec. One statement that only moves the date where it still read 2026-10-31 18:29 UTC; read back from `price_notice()`: starter, indie and pro all `2026-11-15T18:29:00+00:00`, prices 59900 / 79900 / 99900 paise unchanged (they rise to 99900 / 149900 / 199900). The dollar rise follows the same date. Not done through the console, so there is no audit row |
| Pass switched on (step 8) | **NOT DONE.** `pass_enabled` is false |

Razorpay (dashboard read, 28 Oct, nothing changed): live mode; one webhook to
`/functions/v1/rzp-webhook`, enabled, 7 events (`payment.authorized`,
`payment.failed`, `payment.captured`, `settlement.processed`,
`refund.processed`, `refund.failed`, `refund.created`), no `subscription.*`
events yet; `filmmakerstudio.in` added and VERIFIED (the old vercel.app host is
still approved); domestic cards and Cards Recurring activated; **international
cards NOT requested**, so USD orders cannot work until the owner submits "Request
for international cards" and it is approved. The webhook secret's match with the
Supabase secret was not checkable.

## 0. Clean slate before launch (one admin, no test data)

**Owner decision, 27 Oct 2026:** the app never launched, so every account in
the live database is a test account. Keep exactly ONE admin,
`arunkumarmohanans@gmail.com`, and remove everything else. The script is
`supabase/schema/patches/purge-test-data-2026-10-27.sql`; its header says
exactly what goes and what stays. In short:

- **goes, for everybody else:** the sign-in and all of its work (films and
  their data, comments, shares, collaborator seats, accounts and team seats,
  studio membership, console roles, device locks);
- **goes, for everybody, the keeper included:** payments, refunds, refund
  requests, invoices, invoice buyer details and the invoice counters (the
  first real invoice is `FMS/<fy>/000001`), referral credits, e-mail grants,
  and §62's subscriptions and `rzp_plans` if §62 has run. The keeper ends
  with no plan and no trial;
- **emptied:** funnel counts, usage and sync-error telemetry, leads, invite
  codes (tickets, redemptions), promo codes, the invite-request queue,
  testimonials, support tickets and notes, the console's notes on people,
  the §47 tombstones, and the admin audit log;
- **kept:** the keeper's own films and data; `plans`, `plan_prices`,
  `billing_settings`, `site_announcement`, `feature_overrides` and every
  function. A tester's name in their `updated_by` / `set_by` becomes null.

Deleted, not anonymised like §47: these were test-mode payments, so no
invoice was a real Bill of Supply. That is the ONLY reason the invoice
numbering may restart. Never run this once a live payment exists.

**When:** after step 3 (§61; §62 too if it is ready, the script works either
way) and BEFORE step 7 (the live key), so it runs while no real money can
have moved. It runs once.

**Not touched, because it is not in the database:** each tester's browser
`localStorage` (their films stay on their own devices; the keeper can clear
their own browser with Settings → Erase), and any Drive backup file in a
tester's own Drive. Supabase's own `auth.audit_log_entries` (the login
history) also stays; it holds no app data.

1. **Take a backup first.** Dashboard → Database → Backups. The purge cannot
   be undone.
2. **Checksums.** Run each part on its own, pasted base64 per the paste rule
   (step 1), and compare the editor's SHA-256 with these before pressing Run.
   Each part is cut out of the file byte-exact with the awk line:

   ```bash
   F=supabase/schema/patches/purge-test-data-2026-10-27.sql
   shasum -a 256 $F
   # 3c0f93a492e624315ea3d7950e801b3fa64efe15a5112603071ec81524fea94b  (whole file)
   awk '/^-- @@ PART 1 BEGIN/,/^-- @@ PART 1 END/' $F | shasum -a 256
   # c442776e217d6de59359a80bb835b7f14d7baa3d431f73ec3efea838ae747a6b  PREVIEW
   awk '/^-- @@ PART 2 BEGIN/,/^-- @@ PART 2 END/' $F | shasum -a 256
   # 8aa1d5728363e1fd5c837f0c663a64209a902f74559ae1515fcef001b8567838  PURGE
   awk '/^-- @@ PART 3 BEGIN/,/^-- @@ PART 3 END/' $F | shasum -a 256
   # 5d076d0f2849658b606e143e33bb554b97f5b4a8bbfa69028909f4abd1431c3e  READ-BACK
   awk '/^-- @@ PART 2 BEGIN/,/^-- @@ PART 2 END/' $F | base64   # what you paste
   ```

3. **PREVIEW (PART 1).** Read-only, one result. Row 0 must say **1** (exactly
   one sign-in with the keeper's e-mail) and row 1 shows its id. Row 2 (public
   tables the script does not classify) must say **0**. If either is wrong,
   stop: PART 2 would refuse anyway. The other rows count what will go, per
   table; `null` means the table does not exist yet (§62 not run).
4. **PURGE (PART 2).** One transaction. It refuses, and changes nothing,
   unless exactly one keeper exists, `current_user` is `postgres` (the SQL
   editor), and every public table is one it knows. It checks its own result
   before `COMMIT` and rolls everything back on any surprise. Expect the
   notice `PURGE done: one sign-in (…)`.
5. **READ-BACK (PART 3).** One result: every row `ok = true`. That is one
   sign-in, `admin_roles` = the keeper as owner, `studio_members` = the
   keeper as admin, no account on a plan, 0 rows in every emptied table
   (`n/a` for a §62 table that does not exist), and `price_notice()` still
   answering. `paid_buyers()` then reads 0 (no buyer is left), so the
   founding-seat count and a buyer-count price rise start from zero.
6. **Optional: Razorpay's test dashboard.** The test orders, payments,
   customers and refunds there are outside the database and harmless (test
   mode). Delete them only if you want a clean dashboard too.

`npm run test:schema` runs PART 2 and PART 3 of this same file (cut out with
the same awk lines) on a scratch database after every section, with a keeper,
three testers and a row in every user-linked table, and fails if any id or
e-mail of a deleted person survives in any public column.

## 0a. DO NOT set `trial_enabled` to false

**Leave `billing_settings.trial_enabled` TRUE.** The free trial stops being
OFFERED because `start_trial()` refuses a pressed trial while the pass is on.
It does not stop because the trial switch is off. `trial_active()` reads
`trial_enabled` for EVERY trial row, and the §30 grandfather backfill gave
every member from before §30 a year of `admin` trial. Turning the switch off
would wall all of those members in the same second. Code trials (an invite
code's seven days) also need the switch on.

```sql
select trial_enabled from public.billing_settings;   -- true, and it stays true
```

## 1. The paste rule, and the checksums

Never paste SQL through the clipboard as text. Paste base64, decode it in the
page, set the editor's model, and compare its SHA-256 with the file before
pressing Run.

```bash
shasum -a 256 supabase/schema/schema-58-funnel-source.sql
# 92604bb72840583daf38a4ebc0ef6444f79b6b93be5a71307750b97029a235fe
shasum -a 256 supabase/schema/schema-59-testimonials.sql
# 866d3f94c4d81424501335ea8ea5fb454aa1eee30097b01bbec39ffabe9a4e34
shasum -a 256 supabase/schema/schema-60-signup-trial-scope.sql
# 7f983a36d52f70613e378a42fbab152a1efc40afc325e334efb5c42c8d8c7e55
shasum -a 256 supabase/schema/schema-61-week-pass.sql
# 31eea622a83c5c0286128f0c867b529238629cf617542b8cfd36845bb8cd7658
shasum -a 256 supabase/schema/schema-64-pro-blurb.sql
# a61e9d0d593ff42942936640f3ce412c261d6a9eebe77d7a9be6b35727a31893
```

If §58–§60 already ran under `docs/LIVE-STEPS-2026-10-26.md`, skip to step 3.

## 2. §58, §59, §60, in that order

Follow `docs/LIVE-STEPS-2026-10-26.md` steps 1 to 4. Step 1 (move the price
rise to 31 Dec) must be done before 2026-10-31T18:29Z whatever else happens.
Do NOT do its step 5 (the 3-day trial): the pass replaces the public trial.

## 3. §61, then read back

Run `supabase/schema/schema-61-week-pass.sql` after §60, with the checksum
from step 1. It is re-runnable. Then, in the SQL editor:

```sql
select pass_enabled, pass_paise, pass_days, pass_plan, pass_ends_at, pass_cap
  from public.billing_settings;                                   -- false, 4900, 7, pro, null, null
select trial_enabled from public.billing_settings;               -- true (step 0a)
select public.trial_offer() -> 'pass';                            -- {"open": false, "amount_paise": 4900, "days": 7, "plan": "pro", ...}
select public.price_notice('INR') ? 'pass';                       -- true
select pg_get_constraintdef(oid) from pg_constraint
 where conname in ('payments_period_check', 'accounts_plan_period_check', 'events_name_check', 'payments_unapplied_reason_check');
                                                                  -- 'pass', 'pass', 'pass_buy', 'has_plan' each named
select pg_get_functiondef('public.start_trial(text)'::regprocedure) like '%§61%';   -- true
select public.paid_buyers();                                      -- the same number as before §61 ran
```

And over the anonymous API (the way a visitor's page reads it):

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/trial_offer" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{}' | jq .pass
# open false, amount_paise 4900, days 7, now = the server clock
```

**Re-run order.** §61 restates functions from §52, §53, §56, §57, §58 and §60.
If any of those sections is re-run later, re-run §61 after it, or the pass
refusals and the `pass_buy` event go missing (a re-run of §58 alone fails
outright once a `pass_buy` row exists, which is safe).

## 4. Redeploy the four edge functions, from current source

`_shared/razorpay.js` (PERIODS now `['year', 'pass']`) and `_shared/mail.js`
(pass wording) changed. Every function imports `../_shared/`, so use the CLI,
never the dashboard editor:

```bash
npx --yes supabase@latest functions deploy rzp-order rzp-verify rzp-webhook rzp-refund --project-ref conhlrulxfwkhsnymakz
```

`supabase login` needs a real terminal. Then probe each function:
`rzp-order`, `rzp-verify` and `rzp-refund` must answer 401 without a JWT, and
`rzp-webhook` must answer 401 "bad signature". A 404 means it is not deployed.

Between steps 3 and 4, checkout keeps working for yearly plans: the old
`rzp-order` refuses `period: 'pass'` with a 400 before the database is asked,
and the pass is off anyway.

## 5. Resend, before ANY real payment, ₹49 included

`RESEND_API_KEY` and `MAIL_FROM` are still unset (`docs/BILLING.md` §13 and
§16). Until they are, a payment CLAIMS a receipt and the send fails. The buyer
pays and no receipt arrives. A ₹49 pass is still a real payment.

## 6. Approve the legal DRAFTs

terms.html §3 (the 7-day pass replaces the free trial: it is paid, once per
account and ends by itself) and refund.html (the pass is under the same three
cases, with no free trial after a refund) carry `<!-- DRAFT, AWAITING THE OWNER -->`.
Do not release to `main` while a DRAFT comment is in a legal page.

## 7. Switch the Razorpay live key

Only after steps 4 and 5, and after one TEST-mode pass purchase and one TEST
refund, run end to end (`docs/SECURITY-RLS.md` §61 checks 4 to 8).

## 8. The console: turn the pass on

In `admin.html`, Growth, Launch pass (owner or finance), or, until the
console block ships, as the owner in the SQL editor while signed in:

- on; price **₹49** (4900 paise); **7** days; plan **Pro**;
- the launch **deadline** (IST in the console; stored in UTC, for example
  2026-11-30 23:59 IST is 2026-11-30T18:29Z);
- a **cap** only if you want "first N filmmakers". Leave it empty for none.

```sql
-- the same, as an RPC (authenticated as the owner or a finance administrator)
select public.admin_set_pass(true, 4900, 7, 'pro', '2026-11-30T18:29:00Z', null);
```

A price change applies to NEW orders only. An order already created keeps its
amount. The console refuses a deadline that has already passed when the pass
is on.

Read it back anonymously. This is what every visitor's countdown runs on:

```sql
select public.trial_offer() -> 'pass';   -- open true, the deadline, left (null with no cap), now
select * from public.admin_audit where action = 'set_pass' order by at desc limit 1;
```

Then load `start.html` and `invite.html` signed out: the pass block shows the
server's price and deadline. A signed-in fresh account pressing the old trial
button gets `reason: 'pass'`.

## 9. When the launch ends

The pass closes by itself at the deadline or the cap: `quote_pass` refuses
`closed` and `trial_offer().pass.open` goes false. Nothing needs doing on the
day. To end it early, switch it off in the console. Do not touch
`trial_enabled` then either (step 0a).

## 10. Release

Through `docs/BRANCHING.md`, after steps 3 to 7 and with no DRAFT left in a
legal page.

## §62 auto-renew (Razorpay Subscriptions)

Do these after steps 1 to 10. Both modes stay **one-time** until you switch
them, and §62 changes nothing while they are one-time. The full runbook is
`docs/BILLING.md` §26; the two-account checks are `docs/SECURITY-RLS.md` §62.

1. **Razorpay.** Ask Razorpay to enable **Subscriptions**, with UPI Autopay
   and card e-mandate, on the live account. It needs KYC and can take days.
   Then add the `subscription.*` events to the existing webhook (BILLING §26
   names them).
2. **Run §62, with the checksum** (paste rule, step 1):

   ```bash
   shasum -a 256 supabase/schema/schema-62-autorenew.sql
   # e37b186c48417310223aaa6e00f962b6f9dbd707849b9f05dbdb4bbabb5e29f2
   ```

   Then read it back:

   ```sql
   select pass_mode, plan_mode from public.billing_settings;          -- once, once
   select public.trial_offer() -> 'pass' ->> 'mode', public.trial_offer() ->> 'plan_mode';   -- once, once
   select relrowsecurity from pg_class where relname in ('subscriptions', 'rzp_plans');       -- t, t
   select public.pass_sold();                                          -- the same as before
   ```

   If §61 is re-run later, re-run §62 after it, because §62 restates §61's
   `pass_sold`, `pass_block`, `trial_offer`, `price_notice` and
   `billing_status`.
3. **Deploy the functions** with the CLI: the two new ones and all four
   existing ones (`_shared/razorpay.js` and `_shared/mail.js` changed):

   ```bash
   npx --yes supabase@latest functions deploy rzp-subscribe rzp-cancel rzp-order rzp-verify rzp-webhook rzp-refund --project-ref conhlrulxfwkhsnymakz
   ```

   Probe them: `rzp-subscribe` and `rzp-cancel` answer 401 without a JWT. A
   404 means the function is not deployed.
4. **Resend must be set up** (step 5) before any auto-pay charge.
5. **TEST mode first.** Run `docs/SECURITY-RLS.md` §62 checks 2 to 10 with
   the Razorpay test key: subscribe, renew, cancel, and one refunded charge.
6. **Switch the modes** in the console (owner or finance). Until the console
   switch ships, run this as the owner in the SQL editor while signed in:

   ```sql
   select public.admin_set_billing_modes('renew', null);   -- the pass only
   select public.admin_set_billing_modes(null, 'renew');   -- the yearly plans
   select public.admin_set_billing_modes('once', 'once');  -- back to one-time; running subscriptions keep renewing
   ```

   Read back with anon `trial_offer()`: `pass.mode` and `plan_mode` are what
   the pages word the offer from.
7. **Legal.** The terms, refund and privacy pages need the auto-renew DRAFT
   passages approved before either mode is switched on for real buyers. Those
   passages are in another lane.

## §63 renewal reminders

Only matters once a mode is **auto-renew** (§62, step 6). Until then there is
nothing to remind and the function answers `{"sent":0}`. Razorpay and the
bank send their own pre-debit notice under the RBI e-mandate rules; ours is
an extra courtesy, sent ONCE per billing cycle, about 48 hours before the
charge. Runbook: `docs/BILLING.md` §27; checks: `docs/SECURITY-RLS.md` §63.

1. **Run §63 after §62, with the checksum** (paste rule, step 1):

   ```bash
   shasum -a 256 supabase/schema/schema-63-renewal-reminders.sql
   # 39984700e14ed247e9ef0255484fe020ad55e9923eae3fc3bfa2ec60e1fea54e
   ```

   Read it back:

   ```sql
   select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'reminded_for';   -- reminded_for
   select has_function_privilege('authenticated', 'public.claim_renewal_reminders(interval,int)', 'execute');   -- f
   ```

   It adds one COLUMN and no table, so the purge patch
   (`patches/purge-test-data-2026-10-27.sql`) needs no change and its
   checksum stands.
2. **Make a secret and set it on the function** (any long random string;
   keep it in your password manager):

   ```bash
   openssl rand -hex 32        # the CRON_SECRET value
   npx --yes supabase@latest secrets set CRON_SECRET=<that value> --project-ref conhlrulxfwkhsnymakz
   ```

   `RESEND_API_KEY` and `MAIL_FROM` must be set too (BILLING §13). Without
   them the function answers 503 and **claims nothing**, so no reminder is
   lost: the first run after Resend is set up sends what is due.
3. **Deploy rzp-remind** with the CLI, WITHOUT JWT verification (a
   scheduler has no session; the `x-cron-secret` header is the guard):

   ```bash
   npx --yes supabase@latest functions deploy rzp-remind --no-verify-jwt --project-ref conhlrulxfwkhsnymakz
   ```

   Probe it: `curl -i -X POST https://conhlrulxfwkhsnymakz.supabase.co/functions/v1/rzp-remind`
   → **401** (no header). 503 means `CRON_SECRET` is not set; 404 means it
   is not deployed. With the header → 200 `{"sent":0,"failed":0,"skipped":0}`
   (or 503 if Resend is not configured).
4. **Schedule it hourly — pick ONE of the two.** Both are safe together
   (each cycle is claimed once in the database) but that is two things to
   look after.

   **(a) Supabase Cron (pg_cron + pg_net).** Dashboard → Integrations →
   Cron → enable it (this installs `pg_cron`); Dashboard → Database →
   Extensions → enable `pg_net`. Keep the secret in Vault so it is not in
   `cron.job`'s command text. Then, in the SQL editor:

   ```sql
   select vault.create_secret('<the CRON_SECRET value>', 'fms_cron_secret');

   select cron.schedule(
     'fms-renewal-reminders',
     '17 * * * *',
     $$
     select net.http_post(
       url     := 'https://conhlrulxfwkhsnymakz.supabase.co/functions/v1/rzp-remind',
       headers := jsonb_build_object(
                    'Content-Type',  'application/json',
                    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fms_cron_secret')),
       body    := '{}'::jsonb,
       timeout_milliseconds := 60000
     );
     $$
   );
   ```

   Read back: `select jobname, schedule, active from cron.job;` →
   `fms-renewal-reminders`, `17 * * * *`, `t`. After the hour:
   `select status_code, content from net._http_response order by created desc limit 3;`
   → 200. To stop it: `select cron.unschedule('fms-renewal-reminders');`.
   To change the secret: `select vault.update_secret((select id from vault.secrets where name = 'fms_cron_secret'), '<new>');`
   and set the function's `CRON_SECRET` to the same value.

   **(b) GitHub Actions.** `.github/workflows/renewal-reminders.yml` runs at
   minute 17 of every hour and can be run by hand (Actions → renewal-reminders
   → Run workflow). Add two repository secrets (Settings → Secrets and
   variables → Actions): `FMS_FUNCTIONS_URL` =
   `https://conhlrulxfwkhsnymakz.supabase.co/functions/v1` and `CRON_SECRET`
   = the same value as step 2. Without them the job prints a notice and
   succeeds, so forks and CI stay green. GitHub runs scheduled workflows on
   the DEFAULT branch only, and may delay them under load or disable them
   after 60 days without repository activity; (a) has neither limit.
5. **Check one.** In Razorpay TEST mode, with a test subscription whose
   `current_end` is within 48 hours: the next run sends one e-mail ("Your
   Pro pass renews on …"), the row's `reminded_for` equals its
   `current_end`, and the run after sends nothing.

## §64 Pro blurb

The Pro seed's wording changed but the seed is `on conflict do nothing`, so the
live row still reads "A production house. No caps." (`purchase.html` and the
plan cards show it).

1. **Run §64, with the checksum** (paste rule, step 1; any time, it needs only
   §1):

   ```bash
   shasum -a 256 supabase/schema/schema-64-pro-blurb.sql
   # a61e9d0d593ff42942936640f3ce412c261d6a9eebe77d7a9be6b35727a31893
   ```

   Read it back (the file ends with the same select):

   ```sql
   select blurb from public.plans where id = 'pro';   -- A production house: no cap on films, links or collaborators.
   ```
