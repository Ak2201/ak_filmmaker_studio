# BROWSER HANDOFF — the launch steps a cloud session cannot do

Written 8 Oct 2026 by the cloud session that released the ten workstreams
(`main` = `ad7ab02`). These steps need the owner's own browser (Claude in
Chrome, signed in as the owner) because the cloud container cannot reach
Supabase, Google Cloud or Razorpay. **For a session running on the owner's
computer with the Claude in Chrome extension connected.**

Start phrase for the owner: *"read docs/BROWSER-HANDOFF.md and do it"*.

## Rules for the session doing this

- `git pull` first; read `CLAUDE.md`, then `docs/LAUNCH.md` (the full
  checklist this file is a short route through).
- **Ask the owner before every outward or irreversible action**: running
  SQL on the live database, publishing the consent screen, saving keys or
  prices, creating Razorpay objects. Say exactly what will run and wait.
- Never type a secret into chat, a commit or a file in git. Keys go in the
  host's dashboard (Vercel env vars, Supabase function secrets) or
  `.env.local` (gitignored). `VITE_RAZORPAY_KEY_ID` is public and may be
  committed in `.env`; the Razorpay SECRET and webhook secret never are.
- **Ask the database, not the file.** The schema file's own headers say
  §16, §17 and §18 ran on 6 Oct 2026; the handoff notes say §16–§20 did
  not. Check before running anything.
- Record each result (what ran, what the read-back said) in
  `docs/LAUNCH.md` and in the matching `-- RUN …` header of
  `supabase-schema.sql`, commit on a `feature/launch-steps` branch off
  `develop`, and promote per `docs/BRANCHING.md` (docs-only may go straight
  to `main`; then merge `main` into `develop`).

## 1. Supabase — run the missing schema sections (§16 → §24)

Project ref `conhlrulxfwkhsnymakz`, dashboard → SQL editor.

1. Read what is there (paste, run, report to the owner):
   ```sql
   select column_name from information_schema.columns
    where table_schema='public' and table_name='plans' and column_name='price_paise';      -- §18
   select pg_get_constraintdef(oid) from pg_constraint where conname='project_data_scope_check'; -- §17 'edit', §24 'characters'
   select tgtype from pg_trigger where tgname='accounts_guard';                               -- §19: 7
   select to_regclass('public.promo_codes'), to_regclass('public.referral_credits');        -- §20, §22
   select proname from pg_proc where proname in ('quote_order','admin_affiliate_report','quote_for');
   ```
2. `node scripts/deploy-billing.mjs --print > /tmp/schema-16-on.sql` prints
   §16 to the end. Run ONLY the sections the read-back says are missing,
   in order, each as its own run (they are written to be re-runnable, but
   confirm with the owner before re-running one that already exists).
   **§24 must be live before the 8 Oct build is deployed**, or characters
   and costs stay device-only.
3. Re-run the read-back; all five lines should now show the section.
4. Then the 13.2 admin row for the second `VITE_ADMIN_EMAILS` address if
   it has signed in (`docs/LAUNCH.md` §4).

## 2. Google Cloud — publish the OAuth consent screen

Project `filmstudio-495419` → APIs & Services → OAuth consent screen.
It is in **Testing with zero test users**, so nobody can sign in.
`docs/LAUNCH.md` §2 and `docs/GOOGLE-AUTH.md` have the details. Needs the
privacy and terms URLs on `thefilmmakerstudio.vercel.app` (live), the
`drive.file` scope, and the authorised origins already registered. Either
publish (owner confirms) or, as a first step, add the owner's own Google
account as a test user.

## 3. Live security checks (before ANY payment)

`docs/SECURITY-RLS.md` ends with checks that need TWO real Google
accounts; `docs/LAUNCH.md` §5 lists them (13.8, 14.5, 15.1, §16–§24
additions). None has ever run. The owner must provide the second account.
Record pass/fail for each in `docs/SECURITY-RLS.md`.

## 4. Razorpay — test mode first

`docs/BILLING.md` §1 is the deploy order: secrets
(`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) as
Supabase function secrets; deploy `rzp-order`, `rzp-verify`, `rzp-webhook`
(`--no-verify-jwt`); register the webhook; set `VITE_RAZORPAY_KEY_ID`;
set real prices in the admin console (`admin.html#billing`) — the seeded
prices are placeholders. One test-mode purchase end to end, one refund.

## 5. Things only the owner can supply (ask, do not invent)

- Legal placeholders in `privacy.html`, `terms.html`, `refund.html`:
  `[OWNER: full legal name]`, support e-mail, postal address, GSTIN (if
  registered). The newer legal text is already on `main`.
- Real prices; the Razorpay account; the second test account.
- Optional: `VITE_SUPPORT_WHATSAPP` (digits with country code).

## When done

Update `docs/HANDOFF.md`'s top note and `CLAUDE.md`'s "What is live"
paragraph with what is now live, verified by read-back.
