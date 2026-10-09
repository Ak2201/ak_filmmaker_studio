# BROWSER HANDOFF — the launch steps a cloud session cannot do

Written 8 Oct 2026 by the cloud session that released the ten workstreams
(`main` = `ad7ab02`). These steps need the owner's own browser (Claude in
Chrome, signed in as the owner) because the cloud container cannot reach
Supabase, Google Cloud or Razorpay. **For a session running on the owner's
computer with the Claude in Chrome extension connected.**

Start phrase for the owner: *"read docs/BROWSER-HANDOFF.md and do it"* (or *"do section 6 of docs/BROWSER-HANDOFF.md"* for the Vercel preview alone).

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

## 6. Dev preview on Vercel — `thefilmakerlocal`

Owner's ask, 9 Oct 2026: a separate Vercel project named
**`thefilmakerlocal`** (spelled exactly so, one "m") that deploys the
**`develop`** branch, for testing before `main`. The cloud session cannot
reach `api.vercel.com`, so it is done here in the owner's browser. Ask the
owner before each save; never paste a token or secret into chat or git.

1. **Create the project.** vercel.com → Add New → Project → import
   `Ak2201/ak_filmmaker_studio`. Project name `thefilmakerlocal`.
   Framework preset **Vite**; build command `npm run build` (the site gate
   ON, same as production); output directory `dist`. Add one environment
   variable: `VITE_DISABLE_SW=1` (CLAUDE.md: a hosted preview should not
   leave a service worker behind in people's browsers). Every other
   `VITE_*` value comes from the committed `.env`. Deploy once, then
   Settings → Git → **Production Branch = `develop`** and redeploy.
2. **Keep it private.** Settings → Deployment Protection → turn on
   **Vercel Authentication**. `vercel.json` sends no noindex header, and
   the site gate only hides the app pages, not `start.html` or the legal
   pages.
3. **Let sign-in work on the new address** (use the address Vercel
   actually assigned, normally `https://thefilmakerlocal.vercel.app`):
   - Google Cloud project `filmstudio-495419` → APIs & Services →
     Credentials → the web client "Filmmakers Studio - Drive (browser)" →
     **Authorised JavaScript origins**: add the address (scheme and host,
     no path — see `docs/GOOGLE-AUTH.md`).
   - Supabase `conhlrulxfwkhsnymakz` → Authentication → URL Configuration →
     **Redirect URLs**: add `https://thefilmakerlocal.vercel.app/**`.
   - Razorpay needs nothing: Checkout works from any origin and the
     webhook goes to Supabase.
4. **Check it in the browser:** the root lands on `invite.html` (the
   gate is on); Google sign-in completes and returns to the preview; one
   typed `.html` URL opens (the service-worker redirect trap in
   CLAUDE.md); the dark gold/teal design is what renders.
5. **Record it.** In `docs/DEPLOY.md`: the address, the branch (`develop`),
   the build settings and that protection is on. Add the origin to the
   list in `docs/GOOGLE-AUTH.md`. Commit on `develop`, then merge `develop`
   into `main` per `docs/BRANCHING.md` (docs-only).

## When done

Update `docs/HANDOFF.md`'s top note and `CLAUDE.md`'s "What is live"
paragraph with what is now live, verified by read-back.
