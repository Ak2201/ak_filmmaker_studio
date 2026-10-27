# Live steps, 27 Oct 2026: the launch week pass (§58–§61, the functions, the console)

The pass is the owner's launch offer: a paid week of the whole studio (₹49 for
7 days today), once per person, with a real deadline and an optional real cap.
The yearly plans do not change. `docs/BILLING.md` §25 explains it and
`docs/SECURITY-RLS.md` §61 has the two-account checks.

Nothing in the database changes behaviour until the console switches the pass
on: `pass_enabled` is false by default, so after §61 runs, every page and every
order works exactly as it does today. Do the steps in this order.

## 0. DO NOT set `trial_enabled` to false

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
select trial_enabled from public.billing_settings;               -- true (step 0)
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
`trial_enabled` then either (step 0).

## 10. Release

Through `docs/BRANCHING.md`, after steps 3 to 7 and with no DRAFT left in a
legal page.
