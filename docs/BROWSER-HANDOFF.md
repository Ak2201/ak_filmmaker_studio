# BROWSER HANDOFF — the launch steps a cloud session cannot do

Written 8 Oct 2026 by the cloud session that released the ten workstreams
(`main` = `ad7ab02`); section 0 added 10 Oct 2026 after the UI/UX releases. These steps need the owner's own browser (Claude in
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

## 0. DONE 10 Oct 2026 — one item failed, the rest passed

Run from a real browser signed in as the owner, against the production
host unless noted. **0.1 ran; of 0.2's five checks, four passed and one
failed.** Each read-back is quoted below.

### RESULT 0.1 — `billing_status()` re-run: DONE

Loaded base64 → decoded in the page → SHA-256 of the editor's contents
compared against `ddd159ab…5827d` **before** pressing Run: matched, 4,445
bytes, em-dash intact, exactly three statements (`create or replace
function`, `revoke`, `grant`). Supabase said **"Success. No rows
returned"**.

Read-backs:

- From the signed-in app, `billing_status()` now carries
  **`trial_minutes: 30`, type `number`**, 21 keys.
- The deployed function READS THE SETTING rather than a constant, proved
  inside a transaction that rolled back (the live value is still 30):

  | setting | `billing_status().trial_minutes` | follows |
  |---|---|---|
  | 30 | 30 | true |
  | 45 | 45 | true |
  | 7 | 7 | true |

- The client half is wired too: `src/pages/invite.js` reads
  `st.trial_minutes` and falls back to 30 only when it is absent.
- **NOT exercised:** the button's own text with a non-30 value. That
  needs the console setting changed AND an account that has not used its
  trial; both members are grandfathered, so the section does not draw.

### RESULT 0.2 — the real-browser checks

1. **Icons: PASS.** `index/breakdown/write` on production, signed in:
   `sym-ready` is `true` on all three, 82 icon elements computing to
   `Material Symbols Rounded`, zero rendering as words. Rail reads
   Home / Dashboard / Library / Blueprints / Settings as glyphs.
   *Font-blocked half: PASS, by contract rather than by a network block* —
   the extension cannot block requests, so `sym-ready` was removed
   instead, which is exactly the state a blocked font leaves (`chrome.js`
   only adds it once the font loads). Every `.sym` went
   `visibility: hidden`, clamped to ~15px, and the labels still read.
2. **Service worker: PASS.** One active worker at the site scope;
   `/settings.html` and `/dashboard.html` typed directly both opened with
   their own titles and full content. No ERR_FAILED, no redirect bounce.
3. **390px: ONE FAILURE of three.** Run at a true 390x844 emulated
   viewport (Chrome clamps its own window width, so the first attempt
   silently measured 1512 — the browser pane's device emulation is what
   works).
   - `feature.html` — **FAIL**. The fixed vertical STEPS tab
     (`.step-rail-toggle`) occupies x 0–44; the language toggle's
     **"English" button spans x 25–111**, so 19px of it sits behind the
     tab, and `elementsFromPoint` confirms `step-rail-toggle` is topmost
     over `steps-lang`. A tap there opens the step rail instead of
     switching language. **Step titles are clear** — they start at x 99.
   - `start.html` — PASS. Four tiers, all at left 16, four distinct tops:
     one column, no horizontal overflow.
   - `reports.html#dpr` — PASS. Breadcrumb reads "Studio › DPR".
4. **Sign-in on the preview: PASS.** `thefilmakerlocal.vercel.app` →
   Google → back signed in as `arun.aaron@zohocorp.com`, landed on the
   hub. No `redirect_uri_mismatch`. This had never been exercised.
5. **`prove:adoption`: PASS, 40/40** on a machine with internet (the
   container's 39/40 was Google Fonts unreachable).

### RESULT — `npm run test:schema`: RUN, 430 checks, 0 failed

Every session until now reported this as "cannot run here". It can: the
harness wants a local PostgreSQL 16 and macOS has one a `brew install`
away. The whole of `supabase-schema.sql` loads on PostgreSQL 16.15 and
every check file passes — **including `trial.sql` (57) and
`currency.sql` (48), which had never been executed at all**; §30 and
§31 had been static-parsed with `pglast` and shipped on that.

| file | checks | | file | checks |
|---|---|---|---|---|
| billing.sql | 54 | | refunds.sql | 48 |
| accounts.sql | 17 | | invoice.sql | 36 |
| promo.sql | 62 | | leads.sql | 14 |
| upgrade.sql | 30 | | **trial.sql** | **57** |
| referral.sql | 37 | | **currency.sql** | **48** |
| affiliate.sql | 19 | | scopes.sql | 8 |

The ones worth naming, all green: *"THE ONE THAT PROVES THE DESIGN:
after a trial the plan is untouched — free, no plan_until, no
plan_period"*; *"EXPIRY WITHOUT A CLOCK"*; *"THE SOURCE CANNOT BE
FORGED: 30 minutes and source 'signup', not 10080 and 'code'"*; a
refunded buyer *"STILL refused — paid_at, not status"*; and
`{"trial_minutes": 0}` raising *"a sentence about TRIALS, not
referrals"* — the catch-all handler trap §30.9 was written to avoid.

The macOS recipe is in CLAUDE.md's command list. One trap: without
`LC_ALL` the postmaster dies with *"became multithreaded during
startup"*, and the hint names the cause.

### Still open after this pass

The `feature.html` 390px overlap above, and everything in 0.3 below.

## 0-OLD. The list as it stood before this pass (`main` = `99ba52b`)

Everything else in this file is history or still-owed owner input; **this
section is the current to-do list.** Do the items in order and record each
read-back here and in `docs/LAUNCH.md` §4 / `CLAUDE.md` "What is live".

### 0.1 Re-run ONE function: `billing_status()` (Supabase SQL editor)

Why: two server changes shipped in code and are not live yet — the key
`trial_minutes` (so `invite.html` offers the trial length the console
sets, not a hard-coded 30), and a buyer who pays during a full-scope trial
keeps the plan they BOUGHT instead of the trial plan's features. Until it
runs nothing breaks; both just behave the old way.

- The exact statements are in **`docs/sql/2026-10-10-billing_status.sql`**
  (the last `create or replace function public.billing_status()` in
  `supabase-schema.sql`, lines 7207–7284, plus its revoke/grant lines).
  Nothing else in the schema changed. It depends only on §30 functions,
  which are live.
- **SHA-256 of that file: `ddd159ab27093d9fc48d77c95b26de7d91af06c35c9db5540ec4510b7df5827d`.**
- **Do not paste it through the clipboard as text** (CLAUDE.md: `pbcopy` →
  Chrome turned every em-dash into `‚Äî`; this file's comments carry
  em-dashes). Route that works: base64 the file, decode it in the page
  into the Monaco model, SHA-256 the editor's contents against the hash
  above, and only then press Run.
- **Ask the owner before pressing Run.** Expected: "Success. No rows
  returned".
- Read back (signed in as any member, from the app's console or the SQL
  editor with that user's claims): `billing_status()` carries a numeric
  `trial_minutes`. And: open `invite.html` signed in as an account that
  has not used its trial, with the console's trial length set to
  something other than 30 — the button says that number.

### 0.2 Real-browser checks this container could not make

The cloud container's Chromium cannot reach Google Fonts (its proxy CA is
not trusted by the browser), so these were never seen live:

1. **Icons render, and never as words.** On the production host (or the
   `thefilmakerlocal` preview), open `index.html`, `breakdown.html`,
   `write.html`: the rail and breadcrumb show glyphs, and
   `document.documentElement.classList.contains('sym-ready')` is `true`.
   Then block `fonts.googleapis.com` in DevTools → Network request
   blocking and reload: the icons are BLANK gaps (no "home",
   "auto_stories" text) and the labels beside them still read.
2. **`npm run prove:adoption` on a machine with internet.** In the
   container it is 39/40, the one failure being Google Fonts
   unreachable. Expect 40/40 locally.
3. **Service worker, `.html` URL** (CLAUDE.md's redirected-response
   trap): on the production host with the worker installed, type
   `/settings.html` and `/dashboard.html` directly — both open (not
   ERR_FAILED).
4. **A phone at 390px** (real device or DevTools device mode, loaded at
   that width, not resized into it): `feature.html` — the vertical
   "STEPS" tab does not cover the language toggle or step titles;
   `start.html` — pricing reads 1 column; `reports.html#dpr` — the
   breadcrumb reads "Studio › DPR".
5. **Google sign-in round trip on `thefilmakerlocal.vercel.app`**
   (still untested, see §6 below).

### 0.3 Still owed, unchanged (needs the owner)

- The live RLS checks with a second Google account (§3 below).
- A LIVE Razorpay key (everything so far is test mode) and one refund
  exercised end to end (§4 below).
- The legal placeholders and business identity (§5 below).

## 1. Supabase — run the missing schema sections (§16 → §24)

**DONE IN PART, 8 Oct 2026.** Project ref `conhlrulxfwkhsnymakz`,
dashboard → SQL editor, signed in as the owner.

The read-back settled the disagreement this file flagged: **the schema
file was right and the handoff note was wrong.** §16, §17 and §18 were
already live from 6 Oct (the `plans` and `payments` tables, twelve
billing functions, `plans.price_paise`, and a scope CHECK of 407
characters naming `'deliverables'`). §19 through §24 were all absent:
`accounts_guard` was tgtype 19, BEFORE UPDATE only; `promo_codes`,
`referral_credits` and `affiliate_codes` did not exist; `quote_order`,
`quote_for`, `admin_promo_report`, `redeem_referral` and
`admin_affiliate_report` did not exist; the scope CHECK named neither
`'characters'` nor `'costs'`.

**§19 and §24 were run** — owner's decision, those two only, because
they are the two that bite before a sale exists. "Success. No rows
returned", then read back: tgtype **23** (INSERT and UPDATE both set),
the scope CHECK **442** characters naming `'characters'`, `'costs'` and
still `'edit'` and `'deliverables'`, and `project_data` / `projects`
intact at 30 / 6 rows. Recorded in the `-- RUN` headers of both sections
in `supabase-schema.sql` and in `docs/LAUNCH.md` §4.

**§20–§23 were deliberately NOT run.** Promo, upgrade-by-difference,
referral and affiliate do nothing until Razorpay is live, and §20 drops
and recreates `create_pending_payment` and `admin_list_payments` — so it
belongs in the same session as the `rzp-order` redeploy
(`docs/BILLING.md` §1 step 9), not before it.

Two things for whoever picks this up:

- **`docs/LAUNCH.md` §4's tgtype check was wrong** and is corrected. It
  said 7; `before insert or update … for each row` is 23. A correct run
  verified against 7 reads as a failure.
- **The live prices are real and match no document.** `free=0,
  starter=59900, indie=79900, pro=99900` paise. Confirm them with the
  owner rather than re-seeding the placeholders.

Still owed here: the 13.2 admin row for the second `VITE_ADMIN_EMAILS`
address, once it has signed in (`docs/LAUNCH.md` §4).

## 2. Google Cloud — publish the OAuth consent screen

**ALREADY PUBLISHED, AND THE BRANDING IS ALREADY FILLED IN — observed
8 Oct 2026.** This step assumed `filmstudio-495419` was "in Testing with
zero test users, so nobody can sign in". It is **In production**,
External; Google says verification is not required because no sensitive
or restricted scopes are requested; the `filmstudio` client (the one
`.env` uses) was last used 5 Oct 2026; the production host is an
authorised JS origin and the Supabase callback is the registered redirect
URI. Nothing to publish and no fields to type.

**What is actually wrong is ownership of the domain.** The Verification
Center's "Your branding is not being shown to users" resolves to one
issue: the home page URL `https://thefilmmakerstudio.vercel.app` "is not
registered to you". Google Search Console holds **no property at all**
for `arunkumarmohanans@gmail.com`, the account that owns the Cloud
project — which is a different address from the `arunaaron85@gmail.com`
on the consent screen, and the ownership check follows the project.

The route through, in `docs/LAUNCH.md` §2 in full: add the host as a
URL-prefix property (not a Domain property — `vercel.app` is a public
suffix and we do not hold its DNS), verify with the HTML file committed
to `public/` (its contents are one line, so no download is needed), wait
the 24 hours Google asks for, then Branding → View issues → "I have fixed
the issues".

**Nothing was clicked in Search Console** — creating the property changes
the owner's Google account and is theirs to approve.

Still owed, approved 8 Oct: removing the stale
`https://ak-filmmaker-studio.vercel.app` origin. One trap paid for once:
the per-row delete appears on HOVER and the page SCROLLS when a field
takes focus, so a trash icon clicked from a slightly stale screenshot
deletes the row below the one you meant. It took `localhost:5173`; it was
discarded unsaved.

A method note for whoever works this file next: `get_page_text` does not
emit the VALUES of form inputs. Reading this page with it reports every
filled field as blank, and that produced a wrong report here before a
screenshot corrected it. Screenshot before claiming a form is empty.

### What was done on 8 Oct 2026, and what is left

1. **Search Console property created and AUTO-VERIFIED.** A URL-prefix
   property for `https://thefilmmakerstudio.vercel.app` under
   `arunkumarmohanans@gmail.com`. Google verified it instantly, by the
   **HTML tag** method, because `index.html:31` already carries
   `<meta name="google-site-verification" content="-V57…">` and it is
   served live. No file, no commit and no deploy were needed. That tag is
   now load-bearing — see the note in `CLAUDE.md` under "Things that are
   deliberate".
2. **The authorised origins are tidied.** The `filmstudio` client now
   holds exactly `http://localhost:5173`, `http://localhost:4173` and
   `https://thefilmmakerstudio.vercel.app`, verified by re-reading the
   form after a full reload. The redirect URI is untouched.
3. **STILL OWED: wait 24 hours, then re-request.** Google's own words:
   "Verify ownership of your home page, then wait 24 hours before
   retrying to allow our systems to update." So on **9 Oct 2026 or
   later**, go to Branding → View issues → "I have fixed the issues" →
   Proceed. Clicking it sooner just spends a round trip.

**A trap worth more than the tidy-up it came from.** In the new Google
Auth Platform console, deleting a URI row **commits immediately** — there
is no Save to confirm it and no Cancel to take it back. The per-row trash
appears on HOVER, and clicking into a field SCROLLS the page, so a trash
clicked from a screenshot taken before the focus event hits the row
BELOW the one intended. That happened here: it removed
`http://localhost:5173`, this session reported it as "discarded unsaved"
because no Save had been clicked, and that report was WRONG — a reload
two steps later showed the origin genuinely gone from the server. It was
restored by overwriting the stale host's row rather than deleting
anything, which is the safer shape for this form: **edit a row's value
instead of deleting a row** whenever the counts allow it.

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

## 6. Dev preview on Vercel — thefilmakerlocal — DONE 9 Oct 2026

**Live at `https://thefilmakerlocal.vercel.app`.** One "m" in
*filmaker*, deliberately: it is NOT the production host
`thefilmmakerstudio.vercel.app`, and the two differ by a single letter,
so read twice before changing anything on either.

| Setting | Value |
| --- | --- |
| Vercel project | `thefilmakerlocal` (Hobby, `arunaaron85-5576's projects`) |
| Repository | `Ak2201/ak_filmmaker_studio` |
| **Production Branch** | **`develop`** — every push to develop redeploys this |
| Framework preset | Vite; build and output left at the preset defaults, which ARE `npm run build` and `dist` |
| Environment | `VITE_DISABLE_SW=1`, Production and Preview |
| Deployment Protection | Vercel Authentication, Standard — **already on by default**, nothing was changed |
| First deployment | `4844bb7`, Ready in 14s |

The gate is ON here, exactly as in production: this is `npm run build`,
not `build:open`. The committed `.env` supplies the Supabase and Google
values, so nothing secret was typed anywhere.

**Sign-in was made to work on the new address** — two settings, both
additive, nothing removed:

- Google Cloud `filmstudio-495419` → OAuth client `filmstudio` →
  Authorised JavaScript origins now hold four:
  `http://localhost:5173`, `http://localhost:4173`,
  `https://thefilmmakerstudio.vercel.app` and
  `https://thefilmakerlocal.vercel.app`.
- Supabase `conhlrulxfwkhsnymakz` → Auth → URL Configuration → Redirect
  URLs now hold four, the new one being
  `https://thefilmakerlocal.vercel.app/**`.

Both were re-read after a full page reload rather than trusted from the
save toast. Razorpay needed nothing: Checkout works from any origin and
the webhook points at Supabase.

**Checked in the browser:**

- the root serves, and lands on `/start` — NOT `invite.html`. The plan
  for this section predicted invite.html; `start.html` is the public
  landing page now and the gate sends a signed-out visitor there. Not a
  fault, but the expectation in older notes is stale.
- a typed `.html` URL opens. `/settings.html` and `/index.html` both
  resolve, which is the check that matters for CLAUDE.md's
  service-worker redirect trap — a 200 to curl means nothing there.
- **no service worker is registered** (`getRegistrations()` is empty),
  so `VITE_DISABLE_SW=1` did what it was set for and this preview will
  not outlive itself in anybody's cache.

**NOT tested: an actual Google sign-in round trip on the new origin.**
The configuration is in place and verified, but nobody has signed in
through `thefilmakerlocal.vercel.app` yet. Google warns an origin change
can take five minutes to a few hours to take effect, so a first attempt
that fails with `redirect_uri_mismatch` may only mean "too soon" — try
again later before changing the settings back.

## When done

Update `docs/HANDOFF.md`'s top note and `CLAUDE.md`'s "What is live"
paragraph with what is now live, verified by read-back.
