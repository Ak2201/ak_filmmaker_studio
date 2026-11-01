# Auto-renew: the test run before the switch (28 Oct 2026)

Written when everything below the switch was done. The switch itself
(`admin_set_billing_modes`) is the owner's, in the console (Growth), signed in
as the owner. The full list of checks is `docs/SECURITY-RLS.md` §62; this is
the order to do them in, and how to do them without a second environment.

## State going in

| Piece | State |
| --- | --- |
| Schema §62, §63 | live (28 Oct); modes read `once` / `once` |
| Functions | `rzp-subscribe`, `rzp-cancel` v1, `rzp-remind` v1 (no JWT), the four payment functions v14/v14/v8/v14 |
| Razorpay (live) | Subscriptions enabled, UPI Autopay + cards; no plans yet (the app makes them); webhook has the 8 `subscription.*` events (15 in all) |
| Reminders | `CRON_SECRET` set in Supabase and GitHub, `FMS_FUNCTIONS_URL` in GitHub; the hourly job answered `{"sent":0,"failed":0,"skipped":0}` |
| Mail | SMTP secrets set; the first real send has NOT happened |
| Untested | subscribe, a renewal charge, cancel, a refunded charge, the SMTP receipt |

## The problem with "test mode"

The deployed functions read `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` and the
site is built with the LIVE key id. A test-mode run therefore means swapping
both to test keys, running, and swapping back: a window in which real buyers
would be told the test key. Do not do that on production while the site is
open. Pick one:

**A. A small real run (recommended).** The launch pass is ₹49 for 7 days, so
it is the cheapest real subscription.

1. As the owner, set the pass: `select public.admin_set_pass(true, 4900, 7, 'pro', '<deadline>', null)`
   from the console (Growth → Launch pass), and the PASS mode to `renew` only
   (leave the yearly plans on `once`).
2. Signed in as a SECOND account that is not the owner (a spare Google
   account), subscribe to the pass with your own card or UPI Autopay. Expected:
   Checkout opens, the mandate is created, the pass plan runs 7 days
   (`billing_status().autopay.status` = `active`).
3. Check the receipt e-mail arrives (this is also the first SMTP send; if it
   does not, read `rzp-verify` / `rzp-webhook` logs in Supabase).
4. Cancel from Settings → Plan & purchases (`rzp-cancel`). Expected: the
   subscription stops at the cycle end; `plan_until` unchanged.
5. Refund the charge from the console (finance). Expected: the 7 days come
   off, the subscription row stays.
6. Switch the pass mode back to `once` if you are not ready to sell auto-pay.
   Cost: ₹49, refunded to your card. Whether Razorpay returns its own fee on a refund is not something this repo knows; check the settlement report.

**B. A full test-mode run on a copy.** Only with a second Supabase project and
a second deploy using test keys. Not set up; do not improvise it on production.

## Order of the live checks (SECURITY-RLS §62)

1. Read back 62.12 and anon `trial_offer()` (`once` / `once`): done 28 Oct.
2. With the modes `once`: `rzp-subscribe {"product":"pass"}` → 400
   `{reason: "renew_off"}`. Safe to run any time; it charges nothing.
3. Authorisation: support and ordinary users get 42501 on
   `admin_set_billing_modes`; only owner/finance succeed.
4. Subscribe, then again (`subscribed`), complete Checkout.
5. A second account sees only its own `subscriptions` rows; it cannot call
   `apply_subscription_charge`.
6. Cancel; the dashboard shows it cancelling at the cycle end.
7. Refund; the days come off; no trial after a refunded pass.
8. Mode back to `once`: a new subscribe is refused, a running one keeps renewing.

## Before the switch is final

- The legal passages: terms, refund and privacy are marked finalised
  (28 Oct); read them once on the live site next to the price.
- The first renewal reminder goes out about 48 hours before a charge; with a
  7-day pass that is day 5. Check it arrives.
- Razorpay sends its own pre-debit notice under the RBI e-mandate rules.

## Rolling back

`select public.admin_set_billing_modes('once','once')` (owner or finance, from
the console): no new auto-pay can start; running subscriptions keep renewing
until cancelled, and a buyer can still cancel. Cancel any test subscription in
the Razorpay dashboard too.
