# Live steps, 21 Oct 2026 — §52 (yearly plans), §53 (audit fixes), §54 (cap locks)

**Order: §52 → §53 → §54 in the SQL editor, THEN one redeploy of all four
functions (step 2b). Never the other way round: the new `rzp-verify` calls
`payment_can_activate` and `unapplied_sentence`, which only §53 creates.**

One piece of SQL and one redeploy on the live project (`conhlrulxfwkhsnymakz`).
The client on `develop` already sells plans by the year; **do not release it to
`main` until both steps below are done**, or the site will sell "a year" while
the database still grants "for good".

## Status, 22 Oct 2026

| Step | State |
| --- | --- |
| §52 | RUN LIVE (21 Oct); `billing_settings.yearly_switch_at` is set |
| §53 | **RUN LIVE 22 Oct**, editor checksum matched; read-back: `quote_for` takes `p_account`, one `paid_credit_paise`, the three new functions exist, `payments_unapplied_reason_check` exists, `unapplied_sentence('credit_gone')` answers |
| §54 | **RUN LIVE 22 Oct**, checksum matched; read-back: `enforce_project_limit`, `enforce_share_limit`, `enforce_collaborator_limit`, `enforce_seat_limit` all contain the `fms:cap:` lock (all four were false before) |
| §55 | **RUN LIVE 22 Oct**, checksum `cedcdde2…8da7` matched; read-back: all 6 functions (`has_budget_access`, `set_budget_private`, `budget_privacy`, `projects_guard_budget_private`, `is_budget_scope`, `has_scope_access`), `projects.budget_private` and its trigger present |
| §56 | **RUN LIVE 22 Oct**, checksum `8cde6c71…5734` matched; read-back (presence only, not the 56.16 checks): the 5 new functions, `billing_settings.usd_checkout`, `payments.currency`, `refunds.currency`, the `refunds_currency_stamp` trigger present; `quote_for` now takes `p_currency`; `price_notice('USD')` answers. No USD order has been exercised |
| Functions redeploy (§2b) | **DONE 22 Oct, twice.** First 07:57 UTC from `6f0f02b` (before §55/§56); again **13:35 UTC** from current `develop` (functions last changed in `03e26dc`, the §56 merge): `rzp-order`, `rzp-verify`, `rzp-webhook` v9, `rzp-refund` v3, all ACTIVE. Probed: the three JWT functions answer 401 "Missing authorization header", `rzp-webhook` 401 "bad signature". Database and functions are in step through §56. The new payment, refund and USD logic is NOT yet exercised: that needs the real purchase and refund (launch list item 5) |

The redeploy is current through §56, so the code can be released to `main` once the Razorpay live-mode steps (secrets, webhook, Vercel key, callback URLs) and Resend are set. For USD: Razorpay International payments enabled and the dollar prices typed (BILLING §24 steps 3 and 4).

## 0. The paste rule

Never paste SQL through the clipboard as text (CLAUDE.md, "Pasting SQL
through the clipboard corrupts it"). Paste base64, decode it in the page, and
compare the checksum before pressing Run.

```bash
shasum -a 256 supabase/schema/schema-52-yearly-plans.sql
# 6c1a80996bc1d6df5d321ad4dc1e7830c61812d36e27a52b0a7f74f42318945f
```

## 1. Run §52

After §51. It is re-runnable; the backfill happens once
(`billing_settings.yearly_switch_at` is the marker).

## 2. Redeploy the four functions

```bash
npx --yes supabase@latest functions deploy rzp-order rzp-verify rzp-webhook rzp-refund --project-ref conhlrulxfwkhsnymakz
```

`supabase login` needs a real terminal. Between steps 1 and 2 checkout keeps
working: the old `rzp-order` sends `'lifetime'`, which §52 records as a year.

## 3. Read back

```sql
select yearly_switch_at from public.billing_settings;                 -- one instant, now
select id, plan, plan_until, plan_period from public.accounts
 where plan <> 'free' order by plan_until;                             -- buyers: a year from the switch; grants: null
select plan_id, period, starts_at, ends_at, amount_paise from public.payments
 where status = 'paid' order by paid_at;                               -- period 'year', ends_at = plan_until
```

Then, signed in as a buyer, `purchase.html` should say "Valid until <date>"
and offer RENEW on the current plan.

## 4. Tell the buyers (draft)

> Subject: Your {{plan}} plan now runs until {{date}}
>
> Hello — plans on the studio are now bought a year at a time. Your plan
> runs until {{date}}, a full year from today. Nothing is charged
> automatically: when the year is ending you will see a reminder in the
> app, and you can renew from Plan & purchases if you want another year.
> Your work stays in your browser whatever you decide. Questions:
> reply to this e-mail.

(Send from the support address; never sign with the owner's name.)

## 5. Copy that ships WITH §52, never ahead of it

These sentences describe the yearly model. §52 ran live on 21 Oct 2026, but
until `rzp-order`, `rzp-verify`, `rzp-webhook` and `rzp-refund` are redeployed
the functions still charge the old way, so release them to `main` only after
that redeploy:

- `priceRiseBand()` in `src/lib/start-model.js`: "A plan bought now is a
  full year at the price you paid, and nothing renews by itself."
- `buyTerms()` in `src/pages/purchase.js`: "A plan is one payment for one
  year. Nothing renews by itself."
- `src/data/pricing-compare.json` `offer.line` / `offer.fine` and
  `plans.lede` (the yearly term and the mid-year credit).
- `src/data/marketing-faq.json` "Can I move up a plan later?" (the unused
  part of the year is credited; moving down waits for the year to end).

## 6. §53 — the billing audit fixes (run after §52, before the redeploy)

What it is: `docs/BILLING.md` §23. Upgrade credit is the target organisation's,
a payment refused after capture is recorded and refundable, a refund Razorpay
never answered is retried with the same idempotency key, a lapsed year keeps
its end date.

```bash
shasum -a 256 supabase/schema/schema-53-audit-fixes.sql
# ee7596e634777c0bed3933fd60471572decbae359abd6c9af6dae5623f19aba3
```

(`supabase/schema/README.md` carries no checksum; this line is the reference.
Recompute it if the file changes.) Paste base64, decode in the page, compare
the SHA-256 of the editor's contents with the line above, then Run (section 0).

Read back (all read-only):

```sql
select pg_get_function_identity_arguments('public.quote_for'::regproc);
  -- p_user uuid, p_plan text, p_code text, p_account uuid
select count(*) from pg_proc where proname = 'paid_credit_paise';   -- 1
select public.unapplied_sentence('credit_gone');                    -- a sentence
select conname from pg_constraint
 where conname = 'payments_unapplied_reason_check';                 -- one row
```

## 6b. §54 — cap locks (optional here, but also unrun)

`schema-54-cap-locks.sql` makes the plan caps hold under parallel inserts. It
has no function dependency, so it can go in the same sitting, after §53.

```bash
shasum -a 256 supabase/schema/schema-54-cap-locks.sql
# 389995891dd35ea30206b8d011a3858511b29b2d6056ddc4d3688320ec72a1e4
```

## 2b. The redeploy, once §52 and §53 have run

One command covers the §52 redeploy still pending and §53's `rzp-verify` and
`rzp-refund` changes (step 2 above, run once, after §53):

```bash
npx --yes supabase@latest functions deploy rzp-order rzp-verify rzp-webhook rzp-refund --project-ref conhlrulxfwkhsnymakz
```

Then probe: each of the three JWT functions answers 401 "Missing authorization
header" to an unauthenticated POST, and `rzp-webhook` answers 401 "bad
signature" to a POST from a terminal (a browser fetch fails on CORS and proves
nothing).
