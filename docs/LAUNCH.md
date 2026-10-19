# Launch checklist — what only the owner can do

Written 7 Oct 2026. Last reviewed: 2026-10-19.

> **CURRENT STATE (19 Oct 2026), from `docs/HANDOFF.md` §4 and §6c.** Still owner-only and
> open: P1 a LIVE Razorpay key plus one refund exercised, and the Razorpay website/callback
> URLs on `filmmakerstudio.in` (§7a item 8); `RESEND_API_KEY` / `MAIL_FROM` (blocks real
> payments, B14); P4 the two-account RLS checks (§5); P5 the second admin sign-in; P8 GSTIN
> (see §3); P11 WhatsApp number. Done since this file was written: Google branding verified
> (12 Oct), Search Console and sitemap, the domain cutover, schema §1–§47 live (§4). The
> dated passages below are kept as the record; their status lines say what changed.

Written 7 Oct 2026. Everything in the code that could be done for a
public launch has been (CLAUDE.md open items 17–18). What is left needs
an account, a credential or a decision that lives outside this repo.
Work it top to bottom; each step says how to check it is done.

## 1. Decide the door

> **Overtaken 12 Oct 2026 (owner).** The door now FOLLOWS the purchases switch
> (`purchase_required`, live value OFF): switch off, anybody signed in with Google is in and
> membership only decides whether work syncs; switch on, a plan or a running trial; signed
> out goes to `start.html`, every other refusal to `invite.html` (the offer page: trial,
> plans, code). See `CLAUDE.md` (top) and `docs/GATE.md` §0. The text below is the original
> 7 Oct framing; P10 in `docs/HANDOFF.md` records the decision was still marked open.

The site was INVITE-ONLY (`npm run build` has the gate on). A stranger who
clicks an ad lands on `invite.html`. The public landing page `start.html`
is outside the gate and links in. Two choices:

- **Keep the gate** and sell through "Request an invite" → approve in the
  console → they pay. Slow for the buyer; you see every name first.
- **Open the gate** (`VITE_SITE_GATE=off` in `.env`, rebuild, redeploy) and
  let paying be the door (activation inserts the member row, so a payer
  is through with no code). Faster; strangers can reach the free tier.

Check: open the deployed host signed out in a private window and see
which page you land on.

## 2. Publish the Google consent screen

**ALREADY DONE — observed 8 Oct 2026 in the console.** This section said
the project was "in Testing with zero test users, so NO account can sign
in". That is false and has been for some time: project
`filmstudio-495419` is **In production**, user type **External**, and the
Verification Center states "Verification is not required since your app
is not requesting any sensitive or restricted scopes." Sign-in works. The
`filmstudio` OAuth client records a last-used date of 5 Oct 2026.

| Thing | State on 8 Oct 2026 |
| --- | --- |
| Publishing status | In production, External |
| Verification | Not required (no sensitive/restricted scopes) |
| Client used by `.env` | `filmstudio`, `186547817753-qkjg…`, created 6 May 2026, last used 5 Oct 2026 |
| Other client | `Filmmakers Studio - Drive (browser)`, `…-9lm4…`, 3 Oct 2026, unused |
| Authorised JS origins | `https://ak-filmmaker-studio.vercel.app` (stale), `http://localhost:5173`, `http://localhost:4173`, `https://thefilmmakerstudio.vercel.app` |
| Authorised redirect URI | `https://conhlrulxfwkhsnymakz.supabase.co/auth/v1/callback` |
| Registered scopes | none — all three scope tables empty |
| Branding fields | **all filled in** |
| Branding verification | **REJECTED** — see below |

**The branding is filled in, and Google has refused to show it.** App
name `FilmMakerStudio`, support email `arunaaron85@gmail.com`, home page
`https://thefilmmakerstudio.vercel.app`, privacy `…/privacy`, terms
`…/terms`, authorised domains including
`conhlrulxfwkhsnymakz.supabase.co`. Nothing there needs typing.

The Verification Center's "Your branding is not being shown to users"
has exactly one issue behind it, and it is not a blank field:

> The website of your home page URL "https://thefilmmakerstudio.vercel.app"
> is not registered to you. Verify ownership of your home page, then wait
> 24 hours before retrying to allow our systems to update.

**And Google Search Console holds NO property for the account that owns
the Cloud project** (`arunkumarmohanans@gmail.com` — note this is NOT the
`arunaaron85@gmail.com` on the consent screen; the ownership check
follows the project, so the property must be created under the project
owner's account). Search Console opens on its "Add a website" welcome
screen, which is what it shows when the account has no properties at all.

So the sequence is: add `https://thefilmmakerstudio.vercel.app` as a
**URL-prefix** property (a Domain property cannot work — `vercel.app` is
on the Public Suffix List and the DNS is not ours), verify it, wait 24
hours as Google asks, then return to Branding → View issues → "I have
fixed the issues". Do NOT click that before the 24 hours: a failed
re-verification is another round trip.

For the verification token, prefer the **HTML file** method and commit
the file to `public/`, which Vercel serves at the root. The file's
contents are one line — `google-site-verification: <the filename>` — so
it can be authored from the filename shown in Search Console without
downloading anything. The meta-tag method would mean putting a tag in
`index.html`, which is the page behind the gate, and markup is the one
place this project tries not to keep content.

**Status 19 Oct 2026:** the branding was RE-SUBMITTED and is now VERIFIED (12 Oct,
`docs/HANDOFF.md` P6); the Search Console property exists and is verified (below);
the consent-screen home page and privacy/terms links moved to `filmmakerstudio.in`
(§7a). The "REJECTED" row above is the 8 Oct state.

**Not done at the time, and deliberately so:** nothing was clicked in Search Console,
because creating the property is a change to the owner's Google account.

Also still owed, approved 8 Oct: remove the stale
`https://ak-filmmaker-studio.vercel.app` origin from the `filmstudio`
client. Note that in the new console the per-row delete is a trash icon
revealed on HOVER, and clicking into a URI field SCROLLS the page — a
trash clicked from a screenshot taken before the focus event removes the
row BELOW the one intended. That happened once (it took `localhost:5173`)
and was discarded unsaved. Screenshot immediately before the click.

A last note before anyone edits the scopes page: the scope tables are
empty even though `signInWithGoogle()` asks for `drive.file` alongside
e-mail, and nothing is broken by that, because `drive.file` is in
Google's non-sensitive class — which is exactly why the Verification
Center says no review is needed. Registering the wrong thing there is how
a project that needs no review acquires one.

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
3. **DONE (verified 12 Oct 2026): wait 24 hours, then re-request.** Google's own words:
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

## 3. Finish the legal pages

> **Superseded 11 Oct 2026.** The owner's name was taken OFF the legal pages again
> (`brand.json` `seller` is empty on purpose; the pages say "a sole proprietor"), and
> `terms.html` now carries a comment saying the GSTIN sentence is deliberately absent.
> Today `grep -rn '\[OWNER:' privacy.html terms.html refund.html` returns nothing. P8 in
> `docs/HANDOFF.md` still lists a GSTIN decision; whether that means "supply it" now that
> the sentence is gone is an owner call. The 8 Oct account follows.

**DONE except the GSTIN, 8 Oct 2026 — and it is LIVE.** The owner supplied
the legal name; it is written into `privacy.html`, `terms.html` and
`refund.html`, `main` was deployed, and the public site has rebuilt.
Confirmed by fetching the live pages:

```
/privacy  name present, no "OWNER:" marker
/terms    name present, ONE "OWNER:" marker — the GSTIN
/refund   name present, no "OWNER:" marker
```

The `.legal-ph` wrapper was removed with the text in each case, not just
its contents: that class renders a dashed amber "the owner has still to
supply this" box, so leaving it would have printed a real legal name as a
warning. The GSTIN marker keeps its wrapper, correctly, because that one
IS still unsupplied.

**The one thing left: the GSTIN**, on the Terms' tax line
(`terms.html:82`). Supply the number, or — if there is no registration —
delete that sentence rather than fill it. A postal address may also be
needed if Razorpay asks for one.

Why it mattered that these went out before anyone noticed: the brackets
were not pending edits, they were published, and Razorpay's business
verification and Meta's ad review both read these pages. An unfilled
bracket on a Terms page gets an application rejected rather than queried.

The refund policy itself is decided (7 Oct 2026): purchases are FINAL,
except a duplicate or erroneous charge (refunded), charged-but-never-
activated (refunded or activated, the buyer's choice) and any refund
Indian law requires; governing law India, Chennai courts.

Check: `grep -rn '\[OWNER:' privacy.html terms.html refund.html` returns
only the GSTIN line, and the three live URLs contain no "OWNER:" except
that one.

## 4. Run the schema sections that have never run

> **RAN LIVE 19 Oct 2026 (§36 re-run, §48–§51), each checksummed and probed over PostgREST** —
> §48 `can_join_presence` and §49 `co_editing_enabled` answer, `claim_share` now answers 42501
> "Sign in required" instead of failing 42702, anonymous `start_trial` is refused; §50 has no
> anonymous probe (editor said Success). STILL OWED: redeploy `rzp-refund` and `rzp-verify`. The
> list below is the record, in the order they ran, each pasted the base64 way and checked against its SHA-256 first
> (`docs/LIVE-STEPS-2026-10-19.md` has the commands, checksums and read-backs):
>
> 1. **§36, regenerated** (a slice of `supabase-schema.sql`) — the seven modules that came back
>    (auto-tag, screen time, cast matrix; shoot day, edit log, deliverables; the Idea Vault).
> 2. **§48** `schema-48-presence.sql` — co-writing presence.
> 3. **§49** `schema-49-co-editing.sql` — the co-editing switch.
> 4. **§50** `schema-50-refund-seat-trial.sql` — refunds need finance/owner in the database,
>    seats follow the plan, a decline sticks. Then redeploy **`rzp-refund`** (`docs/BILLING.md` §20).
> 5. **§51** `schema-51-security-followups.sql` — the security follow-ups, including the
>    `claim_share()` repair (share links fail on every call until it runs). Then redeploy
>    **`rzp-verify`** (`docs/BILLING.md` §21).
>
> §32–§39 ran live on 12 Oct and §40–§47 on 13 Oct (`docs/HANDOFF.md` §4,
> `supabase/schema/README.md`). The next free section is §52.
> The only unfinished piece of what follows is the Resend setup behind §35. The notes below
> are the record of how each batch was run.

> **WAS OUTSTANDING AS OF 11 Oct 2026 — run in this order, each checksummed:**
> §32 (purchases required, access by e-mail; `docs/BILLING.md` §13),
> §33 (trial in hours; §14), §34 (a refund gives a fresh trial; §15),
> §35 (receipt and refund e-mails; §16 — needs the Resend domain and the
> `RESEND_API_KEY` / `MAIL_FROM` secrets, then a redeploy of `rzp-verify`
> and `rzp-webhook`). Until §35 runs, nothing is mailed and nothing breaks:
> the functions only warn. The new invoice PDF prints without §35's
> columns, leaving the Razorpay ids out.

> **ONE THING TO RE-RUN (9 Oct 2026, after the UI/UX release):**
> `billing_status()` (§30.6, the LAST `create or replace` of it in
> `supabase/schema/supabase-schema.sql`) changed twice: it gained the key
> `trial_minutes`, and a full-scope trial no longer swaps the trial
> plan's features over a plan the person has BOUGHT (`and pl = 'free'`).
> Re-run just that function definition and its two grant lines — they
> are extracted, with a SHA-256 to check the editor against, in
> `supabase/schema/patches/2026-10-10-billing_status.sql`; the route is
> `docs/BROWSER-HANDOFF.md` §0.1. Until
> then the invite page's trial offer falls back to "30 minutes", and a
> buyer who pays mid-trial sees the trial plan's features until the
> trial ends; nothing breaks. Verify: `billing_status()` signed in
> carries `trial_minutes`.

> **10 Oct 2026 — one more function re-run, and it is the last of them.**
> `supabase/schema/patches/2026-10-10-billing_status.sql` (SHA-256 `ddd159ab…5827d`,
> checked against the editor's own contents before Run) replaced
> `billing_status()`: it carries a numeric `trial_minutes` now, and a
> full-scope trial no longer overrides a plan somebody has PAID for — a
> Pro buyer was held to Indie's features until the trial clock ran out.
> "Success. No rows returned". Read back live: `trial_minutes: 30`, and
> the function follows the console setting (30→30, 45→45, 7→7, proved in
> a rolled-back transaction; the live value is still 30).
>
> **NOTHING IS OUTSTANDING AS OF 9 Oct 2026.** §26, §27, §28, §29, §30 and
> §31 were all run that day through the dashboard SQL editor, each verified
> afterwards over PostgREST rather than from the screen: `plans.name` is
> Basic / Intermediate, `refund_requests_enabled()` answers,
> `my_invoices` and `admin_funnel` answer 42501 to anon (existing and
> refusing, not missing), `bump_event` returns 204, and `price_notice()`
> is anon-callable and carries the live rise. **§1–§31 have all run.**
>
> Two things this step now owes whoever runs the next section:
>
> **Checksum every paste.** `pbcopy` → Chrome turns an em-dash into
> `‚Äî` — UTF-8 bytes read as MacRoman — and §30's user-facing refusal
> sentences carry em-dashes and `₹`, so the mojibake would have reached
> buyers. The route that works: base64 the section (pure ASCII crosses
> the clipboard), decode it in the page into the Monaco model, then
> SHA-256 the editor against the file before pressing Run.
>
> **Supabase's "destructive operations" warning is not a reason to stop,
> but it is a reason to look.** It fired on §27, §28 and §31; every
> instance was a `drop policy|trigger if exists` immediately followed by
> its recreation. Read the drops before confirming.


**ASKED THE DATABASE, 8 Oct 2026.** The file's headers were right and the
handoff note was wrong: the note said §16–§20 had not run; in fact
§16, §17 and §18 were already live from 6 Oct, and only §19–§24 were
outstanding. Take the lesson over the fact — the read-back is the
evidence, not either document.

Against project `conhlrulxfwkhsnymakz`, dashboard SQL editor
(`node scripts/deploy-billing.mjs --print` writes §16-to-EOF for you, which now means §16–§39;
slice out only the sections the database lacks — it starts at §16 every
time, and re-running a live section is risk you do not need to take).

| § | What | State |
| --- | --- | --- |
| 16 | plans, Razorpay payments, the limits a plan buys | LIVE 6 Oct |
| 17 | edit log + deliverables sync scopes | LIVE 6 Oct |
| 18 | full-time access, features by plan | LIVE 6 Oct |
| 19 | the accounts guard: closes the `acc_insert` hole | **LIVE 8 Oct** |
| 20 | promo codes | **LIVE 8 Oct** |
| 21 | upgrade by paying the difference | **LIVE 8 Oct** |
| 22 | referral codes and credits | **LIVE 8 Oct** |
| 23 | affiliate codes | **LIVE 8 Oct** |
| 24 | the characters and costs sync scopes | **LIVE 8 Oct** |

§19 and §24 were run together on 8 Oct 2026 because those two are the
only ones that bite before a sale exists: §19 closed a hole that let any
signed-in user mint themselves an unlimited Pro organisation, and §24
had to be live BEFORE the 8 Oct release is deployed, since that build
syncs `fms_characters_v1` and `fms_costs_v1` and Postgres refused both
upserts until the CHECK knew the two scopes (the rest kept syncing, and
both stayed on the device).

**§20–§23 ran on 8 Oct 2026**, when the Razorpay work started. **THE WHOLE
SCHEMA, §1 TO §24, IS NOW LIVE** — there is no schema step left on this
checklist. All 22 objects read back present.

The debt that creates: §20 dropped and recreated `create_pending_payment`
with five arguments, so **`rzp-order` must be deployed from the CURRENT
source**, not an older copy, or every order fails PGRST202
(`docs/BILLING.md` §1 step 9). It is not deployed at all yet, so nothing is
broken in the meantime — this is a rule for the deploy, not a live fault.

**The 13.2 admin row for the second `VITE_ADMIN_EMAILS` address is NOT
actionable, checked 8 Oct 2026.** That address does not exist in
`auth.users`; it has never signed in, so there is no `user_id` to insert.
`auth.users` holds three accounts: the project owner (role `admin`), a
second personal account (role `user`) and one on a corporate domain with
no `studio_members` row at all. Note that the second entry in
`VITE_ADMIN_EMAILS` and the personal account that HAS signed in are
visually near-identical but different addresses — if the intention was
that the signed-in one be an admin, the env var names the wrong address
and the console will never appear for it. That is a privilege decision,
so nothing was granted. `docs/SECURITY-RLS.md`, LIVE CHECK 4.

**Check** — and these are the values actually read back on 8 Oct, not
predictions: `select id from plans order by sort` returns four rows
through PostgREST as a signed-in user; `billing_status()` answers
`plan: 'free'`; the Edit Log and Deliverables pages sync instead of
saying "saved locally only";
`select tgtype from pg_trigger where tgname='accounts_guard'` returns
**23** (`tgtype & 4` and `tgtype & 16` both true — BEFORE INSERT OR
UPDATE, FOR EACH ROW); and, once §20 has run, as the anon role
`select count(*) from promo_codes` fails with 42501.
And `select pg_get_constraintdef(oid) from pg_constraint where conname =
'project_data_scope_check'` names `'characters'` and `'costs'` and is
**442** characters, up from 407.

> This check said tgtype **7** until 8 Oct 2026 and that was wrong. 7 is
> ROW+BEFORE+INSERT — insert only. §19 creates
> `before insert or update … for each row`, which is 1+2+4+16 = **23**.
> Anyone verifying a correct run against 7 would have read it as a
> failure and re-run the section looking for the bug.

**Two things the 8 Oct read-back turned up that no document records.**
The live prices are no longer placeholders and no longer match any doc:
`free=0, starter=59900, indie=79900, pro=99900` paise — ₹599 / ₹799 /
₹999. `docs/BILLING.md` §0 still says ₹2,999 / ₹7,999 / ₹19,999 and the
§18 header in `supabase/schema/supabase-schema.sql` recorded 299900 / 499900 / 799900.
Someone set real prices on the console; believe the table, and §6 below
no longer needs a price-setting step so much as a price CONFIRMATION.
And `projects` holds **6** rows with `project_data` at **30**, where
`docs/SECURITY-RLS.md` still says 0 — so the signed-in-versus-anon read
proof it calls "the last cheap check" now has real data behind it, which
makes it worth more and makes skipping it cost more.

## 5. Run the live security checks

`docs/SECURITY-RLS.md` ends with the checks that need TWO real accounts
(the ten original, the nine for `claim_invite`, the ones for 13.8 /
14.5 / 15.1, and the 7 Oct additions). None has ever run. One afternoon
with two Google accounts. This is the step not to skip: a paying
customer seeing another's film is the one failure you cannot refund
your way out of.

Check: every row in those tables ticked, with the date.

## 6. Razorpay

Test mode first (done 8 Oct; a LIVE key is still owed). `docs/BILLING.md` §1 has the order: key id + secret as
Supabase secrets, deploy the functions — three here, and `rzp-refund` since §27 (`rzp-webhook` with
`--no-verify-jwt`; REDEPLOY `rzp-order` too, since it now passes the promo code), register the webhook URL, set `VITE_RAZORPAY_KEY_ID`
in `.env`, rebuild. The prices are ALREADY REAL on the console — `free 0 / starter 59900 /
indie 79900 / pro 99900` paise, read from the live table on 8 Oct 2026 —
so CONFIRM them with the owner rather than re-seeding the old
₹2,999 / ₹7,999 / ₹19,999 placeholders, which only `docs/BILLING.md` §0
still prints. Then promo codes, if
you want a launch offer (admin console → Promo codes).

Check: one real test-mode purchase end to end, then one refund, and see
the plan lapse.

## 7. Domain, cards, crawlers

- **`filmmakerstudio.in` is the production host (owner, 11 Oct 2026).**
  Registered at Hostinger that day, paid to 2028-10-11. It replaces
  `thefilmmakerstudio.vercel.app`, which STAYS as a Vercel alias and keeps
  serving — so the old address never 404s and anything already shared
  still resolves.

  **The host is in ONE place now: `src/data/brand.json`.** The ten files
  this note used to enumerate were already reading `{{brand:host}}`; what
  actually carried a literal was three files, and all three are fixed:
  `brand.json` (`host`), `src/lib/invite-code.js` (`DEFAULT_ORIGIN`, the
  fallback used only when `location` is absent) and `public/sitemap.xml` /
  `public/robots.txt`. Check with:

  ```bash
  grep -rn 'vercel\.app' src public *.html vercel.json netlify.toml
  ```

  It should return nothing but comments. `src/ui/footer.js` re-exports
  `BRAND_HOST` from `brand.js`; it holds no literal.

  **What the host change costs in the gate:** the footer PRINTS the host
  (`brandText()`), so `thefilmmakerstudio` is a word in `baseline.json` on
  26 pages. Moving it fails verify's word-coverage check on all of them.
  That is a deliberate re-baseline, not an `EXPECTED` list — 26 rows is
  far past the two-or-three threshold in CLAUDE.md §04.

  **Off-repo, and NOT done by changing a file:** the domain added in
  Vercel, DNS at Hostinger, the Google OAuth authorised origins and
  redirect URIs, the Supabase Site URL and redirect allow-list, and a new
  Search Console property. Section 7a lists them.
- `/invite` is no longer in `sitemap.xml` (done): it is the gate's doorway
  and `noindex, nofollow`, and the landing page is the crawlable door.
- After any palette change run `npm run og` and commit `public/og.png`.
- The Dragon figures and the tier names on `start.html` are stamped into
  the markup AT BUILD TIME (`fms-start-figures` in `vite.config.js`, from
  `sampleFigures()` and `src/lib/plans.js`), so a change to the sample or a
  renamed tier reaches the page with no edit; a mismatched tier list fails
  the build.
- Paste the landing URL into WhatsApp and Instagram DM: a card with the
  image and the one-line hook should appear. If not, Meta's debugger
  (developers.facebook.com/tools/debug) says which tag it missed.
- Submit the sitemap in Google Search Console (done 11 Oct, status Success on 12 Oct, `docs/HANDOFF.md` P7).

## 7a. The domain cutover, step by step (11 Oct 2026)

**STATUS, 11 Oct 2026 — the cutover is COMPLETE bar two items.**
`filmmakerstudio.in` is live, the code is deployed, and sign-in on the
new host was checked in a real browser: `defaultRedirect()` resolves to
`https://filmmakerstudio.in/` (apex, trailing slash, no `.html`, which
is what the allow-list covers and what avoids the 308), the hub loads
CORE and the gate redirects a non-member to the landing page, and the
console is clean on both — the check that would have caught the 10 Oct
outage, since that one was a ReferenceError in CORE that only a real
browser could see.

Every dashboard setting below was re-read after a FULL PAGE RELOAD
rather than taken from a save toast.

| | | |
|---|---|---|
| 0 | registrant e-mail | banner no longer shown in hPanel |
| 1 | Vercel: apex Production, `www` 308 -> apex | done |
| 2 | Hostinger DNS: `A @ 216.198.79.1`, `CNAME www` | done; MX/SPF/DKIM/DMARC untouched, confirmed by live `dig` rather than by reading the panel |
| 3 | certificate issued | done |
| 4 | Supabase Site URL + allow-list (BOTH hosts) | done |
| 5 | Google origins + branding URLs + authorised domain | done |
| 5b | consent-screen LOGO uploaded | done — `public/icons/icon-consent-120.png`, a fourth output of `npm run icons` |
| 6 | deploy | done — canonical, og:url and sitemap all serve the new host |
| 7 | Search Console verified by DNS TXT | done |
| 9 | sitemap submitted under the new property | done |
| - | **branding RE-SUBMIT** | **DONE — verified 12 Oct 2026** (`docs/HANDOFF.md` P6: "Your branding has been verified and is being shown to users"). |
| 8 | **Razorpay website/callback URLs** | **PENDING — owner.** Still name the old host. |
| 10 | **Resend: verify `filmmakerstudio.in`** (DKIM TXT `resend._domainkey`, MX + SPF on `send.`) | **PENDING — owner.** Adds records only; the root MX/SPF/DMARC stay as they are. Steps in `docs/BILLING.md` §16. |

**Why the branding re-submit is the whole point.** The consent screen
showed `conhlrulxfwkhsnymakz.supabase.co` because branding was being
SUPPRESSED, not because Supabase was being advertised: the issues list
read *"The website of your home page URL
'https://thefilmmakerstudio.vercel.app' is not registered to you"* —
and it never could be, because `vercel.app` belongs to Vercel. With a
domain that IS registered to the owner, verified by DNS TXT, and the
branding pointed at it, the re-submit finally has something real to
check. That is what replaces the Supabase host with "FilmMakerStudio"
and the logo.

## 8. Only then, ads

Meta Pixel is NOT installed, on purpose: it needs a `connect-src` /
`script-src` change in both host configs, a privacy-policy paragraph, and
it cuts against "your work stays in your browser". If you want it, put it
on `start.html` ONLY, never inside the studio. Start with retargeting
people who opened the sample, ₹500–1,000 a day, and the message that is
true and rare: pay once, no subscription, works offline, built for Tamil
crews.
