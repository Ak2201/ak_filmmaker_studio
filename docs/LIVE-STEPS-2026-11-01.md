# Owner checklist, 1 Nov 2026: everything only the owner can do

One list, gathered from `CLAUDE.md` (the status table and "What is live"),
`docs/HANDOFF.md` §6c, `docs/RELEASE-PLAN.md` §2.1 and the `docs/LIVE-STEPS-*.md`
files. Each line ends with its source in brackets. Where two sources disagree,
the line says so. Where a later dated status table in a LIVE-STEPS file
contradicts an older line, the later table is taken and the older one is named.

Nothing here is a code change. The paste rule applies to every SQL step: base64
the file, decode it in the page, compare the editor's SHA-256 with the hash in
the file's runbook, then Run (`CLAUDE.md`, "PASTING SQL THROUGH THE CLIPBOARD
CORRUPTS IT"). Deploy edge functions only with the CLI, never the dashboard
editor (`CLAUDE.md`, "ALL FOUR EDGE FUNCTIONS ARE DEPLOYED"; `docs/LIVE-STEPS-2026-10-27.md` step 4).

## 1. Check today (read-only)

- **Confirm the price rise moved and did not fire.** Run `select * from price_notice();` in the SQL editor. Expect starter 59900, indie 79900, pro 99900 paise, unchanged, with `next_price_at` at **2026-11-15T18:29:00Z**. [`docs/LIVE-STEPS-2026-10-27.md` status table: moved on 28 Oct from 31 Oct, the owner's later choice.] **CONFLICT:** `docs/LIVE-STEPS-2026-10-26.md` §1 and `CLAUDE.md` row 64 say move it to 31 Dec, and `CLAUDE.md` "What is live" still says 31 Oct 18:29Z. Trust the 28 Oct read-back, then correct those lines.
- **Read the USD figures too:** `select * from price_notice('USD');`. [`docs/LIVE-STEPS-2026-10-21-usd.md` §5; `docs/US-MARKET-PLAN.md`]
- **Check the price on the landing page matches the console** (`pricing.html` against `admin.html`). [`docs/RELEASE-PLAN.md` O7]

## 2. Before taking real money

- **Mail: decide Resend or the SMTP route, then test one send.** The 28 Oct status says `MAIL_FROM` and `SMTP_USER` / `SMTP_PASSWORD` are set and `RESEND_API_KEY` is not, so mail goes over Hostinger SMTP, and the first real send has never run under Deno. Send a receipt from the console on an existing invoice, then read the `rzp-*` function logs. **CONFLICT:** `CLAUDE.md` row 30, "What is live" and `docs/HANDOFF.md` B14 still say `RESEND_API_KEY` and `MAIL_FROM` are both unset, and `docs/LIVE-STEPS-2026-10-27.md` step 5 still says Resend is required before any payment. [`docs/LIVE-STEPS-2026-10-27.md` status table, "Mail"; `docs/BILLING.md` §13, §14, §16]
- **Razorpay live key and webhook.** The 28 Oct dashboard read shows LIVE mode, a verified `filmmakerstudio.in`, and one webhook to `/functions/v1/rzp-webhook` with 15 events. The webhook secret's match with the Supabase secret was never checked. Confirm it, then probe the webhook for 401 "bad signature". Put the live key id in `VITE_RAZORPAY_KEY_ID`, and keep the secrets in Supabase only. [`docs/LIVE-STEPS-2026-10-27.md` Razorpay paragraph; `docs/BILLING.md` §1]. **CONFLICT:** `docs/RELEASE-PLAN.md` O1 to O3, `docs/LAUNCH.md` header and `docs/HANDOFF.md` §4 record the live key as not done, and HANDOFF §4 still reads as test mode only.
- **Refund drill, test mode, end to end.** Customer request, admin approval, Razorpay refund, plan lapse. Never run. [`docs/RELEASE-PLAN.md` O17; `docs/LIVE-STEPS-2026-10-27.md` §7, `docs/SECURITY-RLS.md` §61 checks 4 to 8]
- **Pass drill, test mode.** One TEST-mode pass purchase and one TEST refund, before the live key is switched. [`docs/LIVE-STEPS-2026-10-27.md` §7]
- **Two-account RLS checks** (second real Google account). `docs/SECURITY-RLS.md` §13.8, 14.5, 15.1, §16 to §24 additions, §55 checks 1 to 4, §58 to §60, §61 and §62 checks 2 to 10. No record in any doc shows these as run; treat them as open until ticked with a date. [`docs/RELEASE-PLAN.md` O8; `docs/HANDOFF.md` §6c P4; `docs/LIVE-STEPS-2026-10-22.md` §3; `docs/LIVE-STEPS-2026-10-26.md` §6; `docs/LIVE-STEPS-2026-10-27.md` §0a/§62]
- **One real live purchase by the owner, then refund it as a duplicate-charge drill.** Do last. [`docs/RELEASE-PLAN.md` O18]
- **Second admin signs in once** (`VITE_ADMIN_EMAILS`). [`docs/RELEASE-PLAN.md` O16; `docs/HANDOFF.md` P5]
- **GSTIN line on the Terms**: supply the number or delete the sentence. [`docs/RELEASE-PLAN.md` O9; `docs/HANDOFF.md` P8; `docs/LAUNCH.md` §3]
- **Launch checks on a real device and share link:** write.html at 390px on a physical phone; paste the landing URL into WhatsApp and an Instagram DM and run Meta's sharing debugger. [`docs/HANDOFF.md` P13; `docs/RELEASE-PLAN.md` O14]
- **Legal DRAFT passages.** The 26 and 27 Oct docs say the terms §3 pass passage, refund.html's pass passage and the auto-renew passages await approval, and that `privacy.html` has three DRAFT passages. **CONFLICT:** no `DRAFT, AWAITING THE OWNER` marker exists in this checkout (`feature/phase4-readiness`), so check `develop` and `main` before any release. [`docs/LIVE-STEPS-2026-10-26.md` §7; `docs/LIVE-STEPS-2026-10-27.md` §6, §62 step 7]

## 3. Schema sections: live status, and what the owner still owes

Each line gives the file, the live status from the latest dated table, and what
is still owed. Checksums are in each runbook's paste-rule block.

- **§54 cap locks**, `supabase/schema/schema-54-cap-locks.sql`. RUN LIVE 22 Oct. Nothing owed. [`docs/LIVE-STEPS-2026-10-21.md` status table; CLAUDE row 57, corrected today]
- **§55 keep the budget private**, `schema-55-budget-private.sql`. RUN LIVE 22 Oct. The two-account checks 1 to 4 are not recorded as run. [`docs/LIVE-STEPS-2026-10-22.md` §1 to §3]
- **§56 charging in US dollars**, `schema-56-usd-checkout.sql`. RUN LIVE 22 Oct. No USD order exercised. Owed: section 5 below. [`docs/LIVE-STEPS-2026-10-21.md`; `docs/LIVE-STEPS-2026-10-21-usd.md`]
- **§57 the year on the invoice**, `schema-57-invoice-year.sql`. RUN LIVE 28 Oct. **CONFLICT:** `docs/HANDOFF.md` §6c (the "Next free schema section" paragraph) still says NOT YET RUN LIVE. [`docs/LIVE-STEPS-2026-10-27.md` status table]
- **§58 funnel source**, `schema-58-funnel-source.sql`. RUN LIVE 28 Oct. Two-account check `docs/SECURITY-RLS.md` §58 open. [`docs/LIVE-STEPS-2026-10-26.md` §2, §6]
- **§59 testimonials**, `schema-59-testimonials.sql`. RUN LIVE 28 Oct. Two-account §59 open. Approved testimonials are copied by hand; nothing is invented. [`docs/LIVE-STEPS-2026-10-26.md` §3, §6; `src/data/testimonials.json`]
- **§60 trial scope**, `schema-60-signup-trial-scope.sql`. RUN LIVE 28 Oct. Two-account §60 open. [`docs/LIVE-STEPS-2026-10-26.md` §4, §6]
- **§61 week pass**, `schema-61-week-pass.sql`. RUN LIVE 28 Oct. Pass is OFF (section 5). Two-account and test-mode checks open. [`docs/LIVE-STEPS-2026-10-27.md` status table, §8]
- **§62 auto-renew**, `schema-62-autorenew.sql` (sha256 `e37b186c…29f2`). RUN LIVE 28 Oct. Both modes still `once`. Test-mode checks 2 to 10 open. [`docs/LIVE-STEPS-2026-10-27.md` status table, "§62 auto-renew"; `docs/AUTORENEW-TEST-CHECKLIST.md`]
- **§63 renewal reminders**, `schema-63-renewal-reminders.sql`. RUN LIVE 28 Oct. Reminder check 5 in test mode open. [`docs/LIVE-STEPS-2026-10-27.md` §63]
- **§64 Pro blurb**, `schema-64-pro-blurb.sql`. RUN LIVE 28 Oct. Nothing owed. [`docs/LIVE-STEPS-2026-10-27.md` status table]
- **§65 auto-pay wording**, `schema-65-autopay-wording.sql` (sha256 `122cf229…0b33c`). **NOT RUN LIVE.** Read-back 65.1 must return `true`. [`docs/LIVE-STEPS-2026-10-29.md` step 1]
- **§66 drive-only storage**, `schema-66-drive-storage.sql` (sha256 `df2cf914…a897ca51`). **NOT RUN LIVE.** Run after §65, then the read-back in the runbook. [`docs/LIVE-STEPS-2026-10-31.md` §4; `docs/DRIVE-STORAGE.md`]
- **Purge of test data**, `supabase/schema/patches/purge-test-data-2026-10-27.sql`. RUN 28 Oct on the owner's go-ahead, after a backup. Any new public table must be added to its lists and its checksums recomputed. [`docs/LIVE-STEPS-2026-10-27.md` §0, status table]
- **Earlier sections.** §1 to §47 were recorded live by 13 Oct (§40 to §47 on 13 Oct), §48 to §51 on 19 Oct, §52 on 21 Oct, §53 to §55 on 22 Oct. Nothing owed here. **CONFLICT:** `docs/RELEASE-PLAN.md` O4 still reads as "§1 to §47 all run live" and `docs/HANDOFF.md` P2 still says run §20 to §23, both older. [`CLAUDE.md` "What is live"; `docs/HANDOFF.md` §4; `docs/LIVE-STEPS-2026-10-19.md`]

## 4. Edge functions to deploy or redeploy (CLI only)

- **`google-token`: NOT DEPLOYED.** Set the secrets first (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY`, in a real terminal). Keep `GOOGLE_TOKEN_KEY` safe; a new one makes every stored grant unreadable. Deploy WITH JWT verification. Expect 401 on a bare POST. [`docs/LIVE-STEPS-2026-10-31.md` §2, §3; `CLAUDE.md` row 54]
- **`rzp-remind`**: deployed 28 Oct without JWT, scheduled by GitHub Actions. Redeploy only if the reminder mail's "See auto-pay" label must go live (§65 step 2). [`docs/LIVE-STEPS-2026-10-29.md` step 2; `docs/LIVE-STEPS-2026-10-27.md` status table]
- **Current deployed set (28 Oct, from `develop` at `2616fb61`):** `rzp-order`, `rzp-verify`, `rzp-webhook` (v14), `rzp-refund` (v8), `rzp-subscribe`, `rzp-cancel` and `rzp-remind`. Redeploy all of them after any change to `_shared/razorpay.js` or `_shared/mail.js`. Command: `npx --yes supabase@latest functions deploy <names> --project-ref conhlrulxfwkhsnymakz`. [`docs/LIVE-STEPS-2026-10-27.md` step 4 and "Auto-renew deploy"]
- **Probe after each deploy:** a JWT function answers 401 without a token; `rzp-webhook` answers 401 "bad signature"; `rzp-remind` answers 401 without the cron header. A 404 means it is not deployed. [`docs/LIVE-STEPS-2026-10-27.md` step 4; `docs/LIVE-STEPS-2026-10-31.md` §3]
- **Do not trust the CLI's output alone**; ask the server which functions exist. [`CLAUDE.md`, "ALL FOUR EDGE FUNCTIONS ARE DEPLOYED"]

## 5. Switches and settings (each one is the owner's call)

- **Launch pass: NOT ON.** `pass_enabled` is false. To turn it on: `select public.admin_set_pass(true, 4900, 7, 'pro', '<deadline UTC>', null);` or the console's Growth tab. Decide the deadline and whether to set a cap. Leave `trial_enabled` TRUE. [`docs/LIVE-STEPS-2026-10-27.md` steps 0a, 8, 9; status table]
- **Auto-renew modes: still `once` / `once`.** Owner needs Razorpay Subscriptions enabled on the live account (not confirmed in any doc; the 28 Oct read showed Cards Recurring active and no `subscription.*` events yet, though the webhook now lists them). Then `admin_set_billing_modes`. Approve the auto-renew legal passages first. [`docs/LIVE-STEPS-2026-10-27.md` §62 steps 1, 6, 7; status table; `CLAUDE.md` row 67]
- **Dollar checkout.** Razorpay "Request for international cards" was NOT made on 28 Oct, so USD orders cannot work yet. Once approved: type the dollar prices in the console (Tiers & grants), make one USD test-mode purchase and refund, then `select public.admin_set_usd_checkout(true);`. [`docs/LIVE-STEPS-2026-10-27.md` Razorpay paragraph; `docs/LIVE-STEPS-2026-10-21-usd.md` §4, §5; `docs/US-MARKET-PLAN.md`]
- **Drive-only storage switch**, People → "Where films are kept" (`admin_set_storage_mode`). Only after §66 has run, `google-token` is deployed, the two-account spike has been run, and a test studio has moved. Rollback is untick the switch. [`docs/LIVE-STEPS-2026-10-31.md` §5 to §7; `docs/DRIVE-STORAGE.md`]
- **Co-editing switch (§49).** The 19 Oct doc leaves turning it on to the owner ("later, your call"); no later doc records it on. [`docs/LIVE-STEPS-2026-10-19.md` §4]
- **Gemini through the owner's Google login (row 79).** Enable the Generative Language API on the owner's Cloud project and set a daily quota there. Optional `VITE_GEMINI_QUOTA_PROJECT`. Never run against Google. [`CLAUDE.md` row 79]
- **Student code**: create `STUDENT50` in the promo codes, check it with `quote_order()` in INR, then set `student.live` true in `src/data/marketing-site.json` and run `npm run make:marketing`. [`docs/LIVE-STEPS-2026-10-26.md` §7; `CLAUDE.md` row 64]
- **Privacy passages and `lead.live`**: approve the three `privacy.html` DRAFT passages, then set `lead.live` true the same way. [`docs/LIVE-STEPS-2026-10-26.md` §7]
- **Competitor rows** on the "Switching from" pages render only when each row's `status` is `read`. Open each source, correct or drop the row, then set `status: "read"`. [`docs/LIVE-STEPS-2026-10-26.md` §7]
- **Renewal reminder schedule**: GitHub Actions secrets `FMS_FUNCTIONS_URL` and `CRON_SECRET` are set (28 Oct), and a hand run succeeded. Confirm the scheduled runs are firing. The pg_cron alternative is in the same runbook; pick one only. [`docs/LIVE-STEPS-2026-10-27.md` §63 step 4 and status table]
- **Optional**: `VITE_SUPPORT_WHATSAPP` for the footer link. [`docs/RELEASE-PLAN.md` O11]
- **Chrome extension**: publish it. [`docs/LIVE-STEPS-2026-10-26.md` §8]

## 6. Owner decisions still open

- **Tamil-script UI labels (Q5).** Undecided; it reverses `lang.js`'s English-labels design, so decide before anyone builds. [`docs/HANDOFF.md` §6c Q5; `docs/RELEASE-PLAN.md` §7 row 6]
- **Invite-only or open (O15, `VITE_SITE_GATE`).** Record the decision in `docs/LAUNCH.md` §1, and make the deploy match it. `docs/RELEASE-PLAN.md` §3 recommends keeping the invite gate on for week one. [`docs/RELEASE-PLAN.md` O15; `docs/LAUNCH.md` §1; `docs/HANDOFF.md` P10]
- **Plan-matrix near-duplicate labels** ("Script import" vs "Import a script", etc.). [`docs/HANDOFF.md` same block, item 4]
- **Licence**: `package.json` says ISC; README says "see owner". [`docs/HANDOFF.md` 19 Oct block, item 3]
- **Emotional-craft layer inputs** (`scripts/deny-shingles.txt`, vocabulary size, Tanglish labels, whether Write shows `feeling` by default). Nothing built. [`docs/HANDOFF.md` §6c E]

## Where the documents disagree (for the owner to settle, then delete the stale line)

1. Price-rise date: 31 Oct (`CLAUDE.md` "What is live"), 31 Dec (`LIVE-STEPS-2026-10-26` §1, `CLAUDE.md` row 64), 15 Nov (`LIVE-STEPS-2026-10-27` status, done 28 Oct). This file uses 15 Nov.
2. Mail provider: Resend required (`CLAUDE.md` row 30, `HANDOFF` B14, `LIVE-STEPS-2026-10-27` §5) vs Hostinger SMTP already in use (`LIVE-STEPS-2026-10-27` status).
3. Razorpay: test mode only (`HANDOFF` §4, `RELEASE-PLAN` O1 to O3) vs live mode dashboard with the webhook registered (`LIVE-STEPS-2026-10-27` status).
4. §57: NOT YET RUN LIVE (`HANDOFF` §6c, dated 22 Oct) vs RUN LIVE 28 Oct (`LIVE-STEPS-2026-10-27`). The later one is taken.
5. §36 re-run: row 36 says it must be re-run; row 39 and `HANDOFF` §6c say it ran 19 Oct. Not changed today, listed for the next pass.
6. Legal DRAFT passages: listed as awaiting the owner (`LIVE-STEPS-2026-10-26` §7, `-27` §6), but none is present in this checkout. Check the release branch.
7. RELEASE-PLAN O4 and HANDOFF P2 still describe §20 to §24 as the open range; §25 to §66 have since been written and mostly run.
8. `CLAUDE.md` rows 58, 66 and 67 still say "legal DRAFTs await the owner" or "Razorpay Subscriptions not enabled"; their status bold was updated today, the tails were not verified.
