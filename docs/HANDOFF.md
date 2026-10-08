# HANDOFF — read this first

Written 8 Oct 2026 at the end of a very long session (7–8 Oct). A new
session has no memory of it. This file is the single entry point: what was
done, what was decided, where every piece of unfinished work sits, what is
planned, and what only the owner can do. Facts here were checked against the
repo (`git log`, `git ls-remote`) when it was written; anything not checked
is marked **unverified**.

**Reconciled 8 Oct 2026 (late) against `develop` = `main`, with a code audit;
re-checked and corrected later the same day.** The commit it was reconciled
against was `cc4e580`; `main` and `develop` have moved since (the CBFC source
check). Run `git log --oneline -1` rather than trusting a commit id written
into prose — this file has carried a stale one twice. The pending work is the registry in **§6c**; the lanes that can
run in parallel are in **§6d**. Where an earlier section of this file and
§6c disagree, §6c wins — it was checked against the code on that commit.

**Starting phrases the owner can use:**
"take lane 2" (§6d) · "do P2" / "do B1" (any ID in §6c) ·
"resume the emotional-craft plan, Phase 0" ·
"do the owner checklist" (that one is theirs — see §8).

~~"resume everything"~~ and ~~"run the integration pass"~~ no longer mean
anything: the ten workstreams are released and the integration pass is done.
~~"resume <workstream name>"~~ likewise — §6 lists them as finished, not as
work. Use a lane or an ID.

> **The two UPDATE paragraphs below are a dated record of how the state moved.**
> Where they or any figure in §2 (e.g. `prove:billing` 93, `prove:sw` 24) disagree
> with §6c or §6, the later figure and §6c win — the counts grew as workstreams
> were gated.

**UPDATE, later on 8 Oct 2026 — "resume everything" ran and the ten
workstreams are RELEASED.** Steps 1–11 of §6b were done on
`feature/integration` (off `develop`), merged into `develop` and released to
`main` with a `--no-ff` merge titled "Release: the ten workstreams". The
tables below (§1, §6) describe the state BEFORE that and are kept as the
record; `docs/HISTORY.md` item 20 is what changed. Still open: the owner
checklist (§8, `docs/LAUNCH.md`; schema §24 has since been run live — only §20–§23 remain), the not-started billing items (GST invoices,
gift, edu, leads, funnel — schema §25 onward), the queued ideas (Q1–Q4), the Tamil-labels decision (Q5), the emotional-craft layer, and
the leftovers in `docs/KNOWN-ISSUES.md`.

**UPDATE, 8 Oct 2026 evening — the owner checklist was STARTED, through
the owner's own browser.** `docs/BROWSER-HANDOFF.md` was executed as far
as it can go without the owner's legal identity and a Razorpay account.
What is now true, each verified by reading it back rather than by
running something and assuming:

- **Schema §19 and §24 are LIVE** (`accounts_guard` tgtype 23, the
  `project_data` scope CHECK 442 characters naming `characters` and
  `costs`). §16–§18 were already live from 6 Oct. **§20–§23 are not run
  and are deliberately deferred** to the Razorpay session, because §20
  drops and recreates `create_pending_payment` and must land with the
  `rzp-order` redeploy.
- **The Google consent screen was never a blocker.** It is In production,
  External, and needs no verification review. Its branding is filled in
  and was being refused for one reason: the home page domain was not
  registered to us. A Search Console property now exists and
  auto-verified through the `google-site-verification` meta tag already
  in `index.html` — which makes that tag load-bearing, see `CLAUDE.md`. Google
  asks for 24 hours before re-requesting, so Branding → View issues →
  "I have fixed the issues" on **9 Oct or later**.
- **The read side of RLS is PROVEN** — `docs/SECURITY-RLS.md` LIVE CHECK
  4. The check that file called "the last cheap check" for eight days
  only ever needed real rows to exist, and they now do: `projects` holds
  6 and `project_data` 30, and an anonymous GET still returns `[]`.
- **(Historical — the legal NAME has since been filled, see P8/P9.) The
  `[OWNER: full legal name]` placeholders were not pending edits —
  they were LIVE on the public site**, on `/privacy`, `/terms` and
  `/refund`. Razorpay's business verification and Meta's ad review both
  read those pages. This is now the cheapest blocker on the list and the
  only one nobody but the owner can clear.
- The live prices are real and match no document: `free=0`,
  `starter=59900`, `indie=79900`, `pro=99900` paise.

The theme of the pass is that **the documents were wrong in the owner's
favour more often than against it** — three blockers did not exist. The
instruction that survives is `CLAUDE.md`'s: ask the database, ask the
console, do not read the file and believe it.

**Branch workflow (owner's rule, 8 Oct 2026): develop on `develop`, test, then promote to `main`.**
`main` only ever receives work that passed the release gate. Full rules, the gate
and the day-to-day commands are in **`docs/BRANCHING.md`**. `develop` was created
from `wip-all`; since the release it is level with `main`.

**Product in one paragraph.** FilmMakerStudio: a browser-based, local-first
studio for Tamil/Indian indie filmmakers (story → screenplay → breakdown →
stripboard → call sheets → shoot day → edit log → deliverables), with
Chennai rate cards, a festival tracker, bring-your-own-key AI (Anthropic and
Gemini), Google Drive backup, optional Supabase sync, Razorpay billing
(pay-once, full-time access: Free / Starter / Indie / Pro), promo codes, an
invite-only site gate, a Chrome extension, and a public landing page
`start.html`. The owner is selling it as a digital product. Read `CLAUDE.md`
for invariants before changing anything.

---

## 1. State of the repo (GitHub, `Ak2201/ak_filmmaker_studio`) — checked 8 Oct, late

`main` and `develop` are **level with each other** (they were `cc4e580` when
this was written and have moved since — check, do not quote). The release of the
ten workstreams happened (`ad7ab02`); everything below that was "unfinished"
is merged. Verified with `git merge-base --is-ancestor <ref> origin/develop`:
`wip-all`, `feature/on-set`, `claude/launch-leftovers` and every
`archive/*` / `wip/*` ref are **fully contained** — they are history, never
develop on them.

| Branch | State |
|---|---|
| `main` | Production. Receives only gated releases and docs-only commits (`docs/BRANCHING.md`). |
| `develop` | Development branch. **All new work goes through `feature/<name>` branches cut from it.** Level with `main` right now. |
| `feature/integration` | The integration branch (`38de170`); merged. (The launch-steps work was merged as `525430d` from a branch that was never pushed.) |
| `wip-all`, `archive/*` (10), `wip/*` (10) | **Frozen backups, fully merged.** Ignore them. They stay because nobody has tidied them, NOT because they cannot be deleted — see the correction in §5. |
| `feature/on-set`, `claude/launch-leftovers`, `claude/feature-ideas`, `claude/fix-*`, `claude/launch-readiness`, `claude/improvement-ideas-0gwjyx`, `revamped-ui` | Merged or old. History only. |

**Gotcha — the main checkout may have any branch checked out.** Do work in a
worktree (`git worktree add .claude/worktrees/<name> -b feature/<name>
origin/develop`), never in the main checkout itself — which is
`/home/user/ak_filmmaker_studio` in a cloud container and
`/Users/arun-9285/filmmakers-studio` on the owner's Mac. Two sessions sharing
one checkout is real here: on 8 Oct two of them rewrote this file at once.
Worktrees left by earlier sessions may still exist (`git worktree list`);
stopped agents' worktrees can hold uncommitted files that the stop hook
nags about — their content is already merged, so do not commit them.

## 2. What was done, in order (all merged to `main` unless stated)

| When | What | Commit |
|---|---|---|
| 7 Oct | **UX-audit Medium/Low pass** — 27 Medium + 30 of 31 Low fixed (focus handling, modal focus trap, validated backup import, filtered tab observer, rails `visibility:hidden`, budget fixes, print colours, etc.). `docs/UX-AUDIT-2026-10-06.md` is struck through item by item. | merge `a4d29ca` |
| 7 Oct | **Open-issues pass** — sign-in + Appearance on every page's band, stable palette handle, Case Studies in parts, one script slicer (`sliceScenes` = `sliceScript`, pinned by `test:import`), path-aware Story guide pill, wider AA walk (Story steps 3/4/6, Write Panel mode), hand-editable scene numbers for unbound scenes, print hides controls, deterministic `prove:gate`. `docs/KNOWN-ISSUES.md` reduced to recorded decisions. | merge `f09779f` |
| 7 Oct | **Launch readiness** — public `start.html` (outside the gate, words in markup), OG/Twitter cards + `og.png`, `robots.txt`/`sitemap.xml`, **first-paint JS cut** (module pages ~29–47 % of before; `studio` chunk split into CORE + per-page; data JSON per file), **Supabase kept out of first paint**, 37 plain-English module descriptions, grouped Pre-Production launcher, three job cards on the hub, sample button first, lock panel names the plan that includes a module, `hub.js` split into `src/pages/hub/*`, **promo codes** (schema §20) and the **accounts INSERT hole closed** (§19), **stripboard drag-and-drop** with per-day order (inside `fms_locations_v1` as `order`), Story "ways in", Drive one-hour copy, and new gate checks: `prove:sw`, a fragment-target sweep (found two real bugs), a scripts-off no-flash probe, a first-paint byte budget (`scripts/budget.json`). | merge `5791a27` |
| 7 Oct | **Docs**: `CLAUDE.md` slimmed (log moved to `docs/HISTORY.md`, status table kept), `docs/LAUNCH.md` (owner checklist), `docs/FEATURE-IDEAS.md` (~55 ideas, ranked), `docs/RESUME.md`. | `c858447`…`7c56c81` |
| 7 Oct | **Four read-only research passes** (story/screenplay, pre-prod→post, growth/money, competitors/India market) → merged into `docs/FEATURE-IDEAS.md`. | `c507bb2` |
| 7 Oct | **Nine feature agents + a leftovers agent started in parallel**, then **stopped by the owner mid-work**. Only *On set* finished. Snapshots pushed as `archive/*`, then merged into `wip-all` with `docs/WIP.md`. | `wip-all` `989fbf0` |
| 8 Oct | **Emotional-craft layer** (idea from *Writing for Emotional Impact*) — explored by three agents, planned, decisions taken, **nothing built**. Saved as `docs/WIP-EMOTION-PLAN.md`. | `7fcff13` |
| 8 Oct | **`develop` created** and the branch rule written (`docs/BRANCHING.md`). | `943b92b` |
| 8 Oct | **Integration pass and release** by another session: all ten workstreams gated, schema §24 added for `fms_characters_v1` / `fms_costs_v1`, budget recaptured, re-baseline with zero data-key movement. | `ad7ab02` |
| 8 Oct | **Launch steps through the owner's browser** (`docs/BROWSER-HANDOFF.md`): schema §19 and §24 run live, Google consent screen found already published, Search Console verified, RLS read side proven, owner's legal name filled on the legal pages. | `53278e4`…`0b49c56` |
| 8 Oct | **Code audit of what was planned vs built** (this reconciliation): §6c. Of 12 audit claims, 5 were wrong on re-check and are NOT listed as gaps. | `e8ee850`, `f812826` |
| 8 Oct | **The CBFC/AWBI/OTT source check**, from a browser: Gazette text read, three real errors fixed (the tobacco rule cited COTPA rule 4(6), which the Delhi High Court quashed; the animals rule required a notification nobody requires; the children rule mis-stated the 27 days), the G.S.R. 528(E) ban on bulls as performing animals added. | `81b91eb`…`d95fe03` |

Verification at the time of the `5791a27` merge: all `test:*`, `prove:storage`,
`prove:drive`, `prove:gate` 108, `prove:billing` 93, `prove:extension` 30,
`prove:sw` 24, and `verify` on 21 pages with zero data-key movement.

Marketing advice given in chat (not in a doc until now): skip Shopify or use
it only as a storefront for printable packs; Instagram = Reels of "script to
call sheet" on the Dragon sample + free templates for sign-ups; Meta ads =
small retargeting budget to people who opened the sample, **no Meta Pixel
inside the studio** (it needs a CSP change, a privacy-policy paragraph and
contradicts "your work stays in your browser"; if ever wanted, put it on
`start.html` only); positioning lines are in `docs/FEATURE-IDEAS.md`.

## 3. Decisions the owner made — do not re-ask

- **The site gate stays the door** (invite-only). `start.html` is the public page.
- **Seller is an individual** — the legal name is now filled on the legal
  pages; only the GSTIN line is left (supply it or delete the sentence).
  **Production host `thefilmmakerstudio.vercel.app` is confirmed.**
- **No refunds**, except three exceptions every processor needs: duplicate
  charge; charged but plan not delivered; where Indian law requires. The
  webhook's refund *handling* stays for those.
- **Contact details** (support e-mail, postal address) and the GSTIN: owner
  to supply; not blocking the code.
- **Pay-once, full-time access** (no subscription); prices are server-side
  only; promo codes priced server-side.
- **Emotional-craft layer:** Learn + Apply; AI included as the **last** phase;
  *learning free, tools paid* (feature key); built on `develop`. (The owner
  first chose "on top of `wip-all`"; `wip-all` has since been merged, so the
  base is now `develop`.)
- **Copyright:** the book is copyrighted — original wording only, Tamil/Indian
  examples from the four studied films, one credit line, no reproduction.
- **Still undecided (Q5):** Tamil-script UI labels (reverses `lang.js`'s
  English-labels design).

## 4. What is live and what is not

**Re-established 8 Oct 2026 by asking the database and the Google console
directly.** Every clause of the paragraph that used to sit here was wrong,
and wrong in the owner's favour — three supposed blockers did not exist.

- Schema **§1–§14** live (verified through PostgREST). **§16, §17, §18**
  live since 6 Oct. **§19 and §24** live since 8 Oct — read back as
  `accounts_guard` tgtype **23** and a `project_data` scope CHECK of **442**
  characters naming `characters` and `costs`. **§20–§23 live since 8 Oct** too, run
  when the Razorpay work began — so **§1 to §24 are now ALL live** and no
  schema step remains. `rzp-order` must be deployed from current source
  (§20 recreated `create_pending_payment` with five arguments); it is not
  deployed at all yet, so nothing is broken meanwhile.
- The **Google consent screen is PUBLISHED** — In production, External, and
  Google says verification is not required because no sensitive or
  restricted scopes are requested. It was never in Testing-with-no-users by
  the time anyone checked. Its BRANDING is filled in and awaiting
  re-verification; domain ownership was proved on 8 Oct through the
  `google-site-verification` meta tag already in `index.html`.
- **Razorpay is HALF LIVE as of 8 Oct.** All three edge functions are
  deployed and ACTIVE; `VITE_RAZORPAY_KEY_ID` holds the TEST key id,
  which is what turns the BUY buttons on. Verified by probing the live
  endpoints, not assumed: the webhook returns 503 "webhook secret not
  configured" (public by design, failing closed) and `rzp-order` returns
  401 without a JWT. Still missing: the two secrets in Supabase function
  secrets, the webhook registered in Razorpay, and a live key. No
  purchase has been made.
- **The RLS read side is PROVEN** — `docs/SECURITY-RLS.md` LIVE CHECK 4.
  `projects` holds 6 rows and `project_data` 30, and an anonymous GET still
  returns `[]`. The checks needing TWO real accounts have still never run.
- **Prices are REAL, not placeholders:** `free=0, starter=59900,
  indie=79900, pro=99900` paise. `docs/BILLING.md` §0 still says
  ₹2,999/₹7,999/₹19,999; believe the table.
- **The legal pages on `main` are the newest** and carry the owner's legal
  name as of `0b49c56`. One `[OWNER: GSTIN, if registered]` marker remains
  on the Terms' tax line.

Ask the database, not the file — and note that this very paragraph asserted
the opposite of five of these for days.

## 5. Environment facts a new session must know

- A **cloud container** cannot reach `*.supabase.co`, `api.supabase.com` or
  `api.razorpay.com`, and has no Google credential. A **local session with
  Claude in Chrome**, signed in as the owner, CAN — that is how schema §19/§24
  and the Google findings were done (`docs/BROWSER-HANDOFF.md`). Everything
  tagged "owner / browser session" in §6c needs the second kind of session.
- GitHub **returns transient HTTP 500 on push**: retry with 5/10/20/30 s backoff.
  ~~**Branch deletion is blocked (403)** — never plan on deleting a remote
  branch.~~ **WRONG, corrected 8 Oct 2026:** `git push origin --delete
  feature/launch-steps` succeeded from a local session signed in as the owner,
  and the ref is gone. The 403 was a property of the CLOUD CONTAINER's
  credential, not of the repository — which is exactly the kind of limit that
  gets written down as a fact about the world. 32 remote branches are still
  there; they can be tidied whenever someone wants to.
  A branch named `wip` cannot coexist with `wip/…` refs.
- Browser runs need `PW_CHROMIUM=/opt/pw-browsers/chromium`. `npm install`
  rewrites `package-lock.json` — `git checkout package-lock.json`.
- Run `verify` **uncapped**; a time cap kills Chromium mid-sweep and looks like
  a "browser closed" failure. Use distinct `VERIFY_PORT` / `PROVE_PORT` per run.
  `verify` needs the open build (`VITE_SITE_GATE=off`); `prove:gate` needs the
  gated build (`npm run build`).
- PostgreSQL for `test:schema`: `pg_ctlcluster 16 main start`.
- A worktree agent's base is whatever `main` was when it launched.
- Several subagent reports were wrong about small facts (e.g. "voice check
  not built" when it was; "no UI" when `coverage.js` has one). **Check a claim
  against the branch before writing it down.**

## 6. The open work — REWRITTEN 8 Oct 2026, after the release

**The table that used to sit here described the state BEFORE
`ad7ab02` "Release: the ten workstreams — gate green".** It listed ten
workstreams as unverified, ungated or uncommitted on `archive/…`
branches. All ten are merged, gated and on `main`. Anyone reading the old
table would have re-done finished work — so it is replaced rather than
annotated. `docs/HISTORY.md` item 20 is the record of the release itself;
the `archive/…` branches at the end of §6b are history, not a worklist.

### The ten workstreams: all DONE

| Workstream | Evidence |
|---|---|
| On set | `src/lib/sun.js`, `src/lib/callsheet-text.js`; `test:sun`, `test:callsheet` |
| Schedule | `src/lib/dpr.js`; `prove:sw` 26 |
| Writing (characters) | `src/ui/characters-panel.js`, `src/lib/characters.js`; `fms_characters_v1`; scope live in §24 |
| Script revisions | the `Element.append(null)` bug is FIXED — `write-revisions.js:175` filters with `.filter(Boolean)` (`:158` is only the comment — this file said 158 until 8 Oct); `test:revisions` exists |
| Compliance | runtime tests in `test-screenplay.mjs`, optional-group tests in `test-post.mjs` — both pass |
| Money (costs) | `src/lib/costs.js`, `src/ui/budget-costs.js`; `test:costs`; six tabs browser-walked on the Dragon sample |
| AI | `prove:ai-coverage` against `scripts/fake-ai.mjs`, BOTH providers; a fabricated quote is stripped and counted |
| Growth UX (tour) | `src/ui/tour.js`; `fms_tour_v1`; `prove:growth` 50 |
| Billing growth (§21–§23) | upgrade, referral, affiliate written and tested; `src/lib/growth.js`, `src/ui/growth-admin.js` |
| Integration pass | `38de170` → `ad7ab02`; `develop` and `main` are level |
| Leftovers + legal | gated in the release; the legal pages were re-read in a browser on 8 Oct AFTER the owner's legal name was filled in — 375px and 1280px, both themes, zero overflow, zero console errors |

Release record in `ad7ab02`: `verify` passes all 21 pages with 0 data-keys
moved; 21 `test:*` suites pass; `prove:storage`, `prove:drive`, `prove:sw`
26, `prove:growth` 50, `prove:ai-coverage`, `prove:extension` 30;
gated `prove:gate` 108 and `prove:billing` 124.

### What is actually still open (summary — the full, ID-numbered list is §6c)

| # | Item | State |
|---|---|---|
| 1 | ~~CBFC/AWBI/OTT source check~~ | **DONE 8 Oct 2026 (evening), from a browser session.** 16 of 18 URLs answer; Gazette text read where published. One real error found and fixed: the file cited COTPA **rule 4(6)**, which the Delhi High Court quashed. What is left is not a task: the 2026 CBFC guidelines text is unpublished, so clause NUMBERS stay unverified until the Ministry publishes it. |
| 2 | **Billing growth, the unstarted five** | GST invoices, gift, edu, leads, funnel. Not started, no tables, no code. `src/lib/growth.js`'s header says so. |
| 3 | ~~§20–§23 are not LIVE~~ | **DONE 8 Oct 2026.** All 22 objects read back present; §1–§24 are now live and no schema work remains. What carries forward is a deploy rule, not a task: `rzp-order` must come from current source. |
| 4 | **Emotional-craft layer** | Plan only. `docs/WIP-EMOTION-PLAN.md`. |
| 5 | **Queued ideas** | Monsoon weather flag, script-notes overview, writing-goal sync across devices, paid template packs. None started. |
| 6 | **Owner decision: Tamil-script UI labels** | Undecided. Reverses `lang.js`'s design, so decide before building. |
| 7 | **No CI** | There is no `.github/` directory at all, so the release gate is only ever run by hand. `docs/BRANCHING.md` says so too. |
| 8 | **Owner-only launch steps** | `docs/LAUNCH.md`. Razorpay, the two-account live RLS checks, the GSTIN, and re-requesting Google's branding review on 9 Oct or later. |

Two small leftovers nobody has logged as blocking: the Plan page's recce
card does not show the four recce fields (lat, lng, hospital, police), and
the after-sunset flag reads the call sheet's wrap but not the DPR's.
`docs/KNOWN-ISSUES.md`.

**Storage keys added by the ten:** `fms_characters_v1` and `fms_costs_v1`
(per project, both now live in the schema via §24), `fms_tour_v1` (device).
`fms_no_analytics_v1` is still only planned.

**THE NEXT FREE SCHEMA SECTION IS §25, NOT §24.** The old §6b told the next
session to build GST invoices as §24; §24 became the characters and costs
sync scopes and is live. Renumber before writing anything.

## 6b. What to do next, in order

The old §6b was a twelve-step plan for gating ten workstreams. They are
gated. What remains is short, and most of it is the owner's.

| Step | Do | First action |
|---|---|---|
| 1 | **Owner-only, and it blocks the money** | `docs/LAUNCH.md`: the GSTIN (or delete that Terms sentence), the Razorpay account, a second Google account for the live RLS checks. Nothing in the repo moves these. |
| 2 | **Google branding re-request** | 9 Oct 2026 or later — 24 hours after the Search Console ownership check. Branding → View issues → "I have fixed the issues". |
| 3 | **Razorpay, and §20–§23 with it** | `docs/BILLING.md` §1 in order. Run §20 and redeploy `rzp-order` in the SAME session or every order fails PGRST202. Prices are already real on the console — confirm, do not re-seed. |
| 4 | ~~The CBFC/AWBI/OTT source check~~ | **DONE 8 Oct 2026.** See §6 row 1 and `docs/KNOWN-ISSUES.md`. |
| 5 | **CI** | `.github/workflows/` does not exist. The release gate is the obvious thing to automate first; `docs/BRANCHING.md` lists it. |
| 6 | **GST invoices as schema §25** | Buyer GSTIN checksum, gapless financial-year invoice number, "Bill of Supply" mode because the seller is an individual. Then gift, edu, leads, funnel (§26 onward). |
| 7 | **Emotional-craft layer** | Phase 0 first. See the correction below before branching. |
| 8 | **Queued ideas, and the Tamil-labels decision** | Last. |

**The emotional-craft plan names the wrong base branch.**
`docs/WIP-EMOTION-PLAN.md` was written when `wip-all` was the tip and says
to baseline Phase 0 against it and merge into "the integrated branch"
later. The integration pass has HAPPENED: branch `wip-emotion` off
`develop` instead, and treat the plan's `wip-all` references as historical.
Nothing is blocked by this — it is a one-line correction to make before
Phase 0, not a redesign.

**Historical branch names**, kept because `docs/WIP.md` and `docs/HISTORY.md`
refer to them. They are MERGED; do not resume work on them:
`archive/leftovers`, `archive/ac7bac5586116f143` (On set),
`archive/a8500da1354391964` (Schedule), `archive/a40f499bfa0c512e8` (Writing),
`archive/abc1d13439ac92b6b` (Revisions), `archive/a55b1a0c890ccf84e` (AI),
`archive/acc100544ab48cea5` (Compliance), `archive/ad27555771d505845` (Money),
`archive/a1db0236c653737b2` (Billing growth), `archive/adb4de922f32dffae`
(Growth UX).

**`docs/LAUNCH.md` on `main` IS the current one.** The old note here sent
readers to a copy on `claude/launch-leftovers` or `wip-all`; that was true
before the release and is wrong now — `main` carries the newest, including
the 8 Oct schema and Google findings.

## 6c. THE PENDING REGISTRY — every item still to do, with an ID

**This is the work list.** IDs are stable: say "do P2" or "do G2" and a
session knows what is meant. Every row was checked by reading the code, not by
trusting an earlier doc — first at `cc4e580`, then re-checked row by row on
8 Oct 2026, which struck G5, split P12 and corrected three line numbers.
The branches have moved since; check `git log`, do not quote a commit id. **Branch:** cut
`feature/<id>-<slug>` from `develop`; merge back into `develop` only after the
feature's own tests pass; promote to `main` only through the release gate in
`docs/BRANCHING.md`. **Who:** *owner* = only the owner can; *browser* = a
local session with Claude in Chrome, signed in as the owner, with the owner's
approval at each outward step (`docs/BROWSER-HANDOFF.md`); *cloud* = any
cloud container session.

### P — Launch steps (owner / browser). These block taking money.

| ID | Item | Who | Acceptance | Doc |
|---|---|---|---|---|
| P1 | **Razorpay**: account (test mode first), key id + secret, webhook secret, register the webhook URL, set `VITE_RAZORPAY_KEY_ID` in `.env` (the secret and webhook secret go in Supabase function secrets only, never git), one test purchase and one refund | owner, then browser | a test-mode order completes, the plan activates, the refund lapses it | `docs/BILLING.md` §1 |
| P2 | **Run schema §20→§23 live**, in the SAME session as redeploying `rzp-order` (and deploying `rzp-verify`, `rzp-webhook --no-verify-jwt`). §20 drops and recreates `create_pending_payment`, so running it alone makes every order fail PGRST202. Ask the owner before running SQL; read back what the database says | browser | `select quote_order('indie', null)` answers; anon `select count(*) from promo_codes` → 42501; a coded test order prices correctly | `BROWSER-HANDOFF.md` §1, `LAUNCH.md` §4 |
| P3 | **Confirm the live prices** with the owner (`free 0 / starter 59900 / indie 79900 / pro 99900` paise) and correct `docs/BILLING.md` §0, which still says ₹2,999 / 7,999 / 19,999. Do not re-seed | owner + cloud | BILLING.md matches the table | `LAUNCH.md` §6 |
| P4 | **Live RLS checks that need TWO real Google accounts** (13.8, 14.5, 15.1, the §16–§24 additions, 24.1). The read side is already proven. Run these BEFORE taking payments — a buyer seeing another's film is the unrecoverable failure | owner supplies the 2nd account; browser runs | every row ticked with the date in `SECURITY-RLS.md` | `SECURITY-RLS.md`, `LAUNCH.md` §5 |
| P5 | The **13.2 admin row** for the second `VITE_ADMIN_EMAILS` address — it has never signed in; either it signs in or the env var names the wrong address | owner | the console shows both admins, or the env var is corrected | `LAUNCH.md` §4 |
| P6 | **Google Branding re-request**: Branding → View issues → "I have fixed the issues" on **9 Oct 2026 or later** | owner / browser | the branding status clears | `LAUNCH.md` §2 |
| P7 | Submit `sitemap.xml` in Search Console; paste the landing URL into WhatsApp and Instagram DM and run Meta's debugger | owner | a link card with the image appears | `LAUNCH.md` §7 |
| P8 | **GSTIN line on Terms**: supply the number, or delete that sentence if there is no registration | owner | no `[OWNER: GSTIN…]` marker on `/terms` | `LAUNCH.md` §3 |
| P9 | ~~**Deploy `main`** so the legal name is live on the public site~~ **DONE 8 Oct 2026.** `main` was promoted and Vercel rebuilt from it; `/privacy`, `/terms` and `/refund` all serve the owner's legal name now, confirmed by fetching the live pages. Only the GSTIN marker is left, which is P8. | owner | done | — |
| P10 | **The door**: keep the invite gate, or open it for launch (`VITE_SITE_GATE=off`) | owner | decision written in `LAUNCH.md` §1 | `LAUNCH.md` §1 |
| P11 | Optional: set `VITE_SUPPORT_WHATSAPP` (digits) so the footer shows a WhatsApp help link | owner | link renders | `src/ui/footer.js` |
| P12 | ~~Open every `sourceUrls` link of the CBFC / AWBI / OTT rules in a real browser~~ **DONE 8 Oct 2026**: links read, Gazette text read where published, the quashed rule 4(6) removed, AWBI fees corrected and the G.S.R. 528(E) ban on bulls as performing animals added. Nothing left here. | browser | done | `KNOWN-ISSUES.md` |
| P13 | **Check `write.html` on a REAL phone at 390px.** Split out of P12 on 8 Oct 2026, because P12 now reads DONE and a live task was hiding in its tail. An `isMobile`-emulation screenshot once showed ~350px of blank ground; emulation is not a phone, so this needs a physical device | owner / browser | the page is confirmed on a real handset, or the bug is reproduced and filed | `KNOWN-ISSUES.md` |

### G — Production gaps (cloud, lane 2). Each verified in the code.

| ID | Gap | Where | Acceptance | Test |
|---|---|---|---|---|
| G1 | The **after-sunset flag reads only the call sheet's planned `wrap`**, never the DPR's day-level wrap | `src/pages/shoot.js:282`, `src/pages/contacts.js` ~634, `src/lib/dpr.js` | a day whose DPR wrap is after sunset is flagged too | extend `test:sun` / `test:stripboard` |
| G2 | The **Plan page recce card omits `lat lng hospital police`**, which the call sheet reads and writes | `src/pages/plan.js` (no match for those fields) | all four editable on Plan, and a change there shows on the call sheet and vice versa | `test:callsheet` |
| G5 | ~~The "CBFC-format PDF" is just the dialogue-list print; relabel the button honestly~~ **STRUCK 8 Oct 2026 — the premise was false.** No string "CBFC-format PDF" exists anywhere in the code; the button at `src/pages/deliverables.js:462` is already labelled "PRINT OR SAVE AS PDF", and `:468-473` already tells the reader no prescribed dialogue-list template could be found, names the conventional layout it uses, and says to check with the regional office. There is nothing dishonest to fix. If anything is left it is a question for the OWNER — whether a regional office wants a different layout — not a code task. | — | — | — |
| G7 | `deliverables.js` imports `cbfc-rules.json` (~44 KB — it was 32 KB until the 8 Oct source check grew it, which makes this worth MORE than when it was filed) and `lib/pdf.js` at module scope although the PDF is only needed on a click (cheapest first-paint win; recorded in `KNOWN-ISSUES.md`) | `src/pages/deliverables.js` | both become dynamic; the certification section renders after an await; `scripts/budget.json` recaptured lower | `verify` |

### T — Quality gaps (cloud, lane 3). Each verified.

| ID | Gap | Evidence | Fix |
|---|---|---|---|
| T1 | **No assertion for the revised-page tint** | `scripts/test-revisions.mjs` has no `tint` | add one (tint class present when chosen, absent otherwise) |
| T2 | **`ai.js` is not in the first-paint guard.** The `LAZY_CHUNKS` regex names only `supabase`, `pptxgen`, `sample.dragon.script`. **NOT a one-line change, re-checked 8 Oct 2026:** `vite.config.js` `manualChunks` (352-374) defines no `ai` chunk, so there is no stable name to match; and `ai.js` is statically imported by `src/ui/ai-panel.js:48`, which `src/pages/settings.js:83` imports statically — so adding the pattern would fail settings' first paint until `scripts/budget.json` `knownLazyFetches` (currently `{}`) allows it. Decide the chunk first, then the guard | `scripts/verify-migration.mjs:138`, `vite.config.js:352-374` | `ai` has its own chunk, the guard names it, and `verify` passes on settings | `verify` |
| T3 | **Tamil typing is only regex-read, never executed** | `scripts/test-tanglish.mjs` lines 67–70 read the source | a browser proof that typing "vanakkam" in a dialogue line yields Tamil and writes the pref only on toggle |
| T4 | **`scripts/prove-adoption.mjs` has no npm entry** | `package.json` | add `prove:adoption`, run it, record the result |
| T8 | **`npm run ship` runs only `build:open`, `verify`, `build`, `prove:gate`** — none of the `test:*` suites, nor `prove:billing/sw/storage/drive/extension` | `package.json:36` | make `ship` (or a new `gate`) run the full release gate from `docs/BRANCHING.md`; this is also the seed of CI |
| T9 | **Browser walk of the revisions, coverage and costs UIs** on the Dragon sample, 390 and 1280, both themes. The `Element.append(null)` fix at `write-revisions.js:175` was never exercised in a browser | — | no console error; revision compare opens; coverage renders; each cost tab loads |
| T10 | **CI does not exist** (`.github/` is absent). Branch protection on `main` is also unset (owner, GitHub settings) | repo root | a workflow running the T8 gate on every PR to `main` (needs Playwright's Chromium + PostgreSQL 16) |

### B — Billing and growth (lane 1; owns schema §25 onward; ONE session at a time)

| ID | Item | Notes |
|---|---|---|
| B1 | **Buyer GST invoices** | GSTIN format + checksum validation; gapless financial-year number `FMS/2026-27/000123` assigned at ACTIVATION; invoice PDF; **"Bill of Supply" mode** because the seller is an individual (single admin setting); CGST+SGST vs IGST by state. Only the vendor-side `gstinLooksValid` regex exists today (`src/lib/costs.js`) |
| B2 | Gift a licence | pay for someone else → one-use gift code → recipient activates into their own org; refund rules per `refund.html` |
| B3 | Film-school (edu) licence | an `edu` plan row, N seats via `accounts.seat_limit`, bulk student codes (§13) |
| B4 | Landing-page e-mail capture | `leads` table, anon INSERT only, unique e-mail, explicit consent text on `start.html`, one paragraph in `privacy.html`; no third-party script |
| B5 | First-party funnel counts | `events` table, fixed CHECK list of event names (`start_view sample_open plan_view buy_click buy_done`), no personal data stored, device opt-out `fms_no_analytics_v1` (register in `ALL_KEYS` + `GLOBAL_KEYS`) and Do-Not-Track |
| B6 | **Fix `growth-admin.js:136-137`**: the Growth section's heading promises "Referrals, affiliates, invoices and the funnel" and "the invoice settings, the leads … and how many people reach each step", but only referrals and affiliates render. Fix the copy now; it becomes true when B1/B4/B5 land |
| B7 | Public read-only call-sheet / deck links that do not hit the invite gate | design exists, flag `VITE_PUBLIC_VIEW` is OFF, **no SQL in the schema**. Needs a security review (token guessing, revocation, never expose contact phone/e-mail) before anything ships |

Next free schema section: **§25**. Every new section needs a `-- RUN` header
when it is run live, live checks in `docs/SECURITY-RLS.md`, and assertions in
`scripts/schema-tests/*.sql` (`npm run test:schema`, PostgreSQL 16:
`pg_ctlcluster 16 main start`). `scripts/fake-supabase.mjs` must honour each
new RPC so `prove:billing` exercises the real pages.

### Q — Queued features (lane 5) and decisions

| ID | Item | Notes |
|---|---|---|
| Q1 | Monsoon weather flag on EXT shoot days | external weather API → `connect-src` in BOTH `vercel.json` and `netlify.toml`; builds on `sun.js` + recce lat/lng |
| Q2 | Script-notes overview across the whole script | `src/ui/comments.js` `openCount` / `loadThreads`; filterable, exportable |
| Q3 | Writing-goal history synced across devices | `fms_write_goals_v1` is in `cloud.js` `LOCAL_ONLY`; needs a schema section widening the scope CHECK — take the number from lane 1 |
| Q4 | Paid template / sample-pack plumbing + one free ORIGINAL starter | gate by a `plans.features` key; no real people, no reproduced scripts (`CLAUDE.md` item 8) |
| Q5 | **Owner decision:** Tamil-script UI labels | reverses `lang.js`'s English-labels design — decide before anyone builds |

### E — Emotional-craft layer (lane 4)

E0 Phase 0 baseline of `develop` · E1 Phase A vocabulary, glossary, Library
shelf · E2 Phase B Story emotion layer · E3 Phase C per-scene `feeling` +
margin chip + honest hints · E4 Phase D AI emotional read · E5 Phase E
case-study and dissection columns. Nothing built (grep finds no
`emotions.json`, `emotional-craft`, `emotionCurve`, `emotion_tools`). Plan:
`docs/WIP-EMOTION-PLAN.md`. Base: **`develop`**. Owner inputs still needed:
`scripts/deny-shingles.txt` (hashed deny-list for the copyright check),
vocabulary size, Tanglish labels, and whether Write shows the `feeling` field
by default.

### What the audit found DONE (do not redo)

On set (WhatsApp unit + per-person messages, `wa.me`, share/copy fallback,
3,800-char cap; sunrise/sunset/golden hour; route and safety block; Maps-link
pins; device location) · Schedule (DPR, one-liner, banners of all four kinds,
day-load warning, per-day equipment lists seeded from the estimator, offline
shoot pack) · Money (petty cash, actuals, crew ledger, GST/TDS, top sheet,
expired-labelled FEFSI table, Movie-Magic-style CSV) · Compliance (CBFC flags
with `source` + `checked`, rating hint, dialogue list CSV/SRT, runtime vs
target, OTT groups) · Writing (Tamil typing, Tamil take, starting drafts,
characters + rename, table read with a print route) · Revisions (compare,
asterisks + colour name, tint, locked numbers) · AI (coverage, logline
workshop, voice check — all strip non-verbatim quotes, write nothing) · Growth
UX (tour, testimonials ship empty and are checked against the markup,
WhatsApp link, branding line blocked for free plans) · Billing §19 and §24
live; §20–§23 written, tested and wired in the UI.

## 6d. Lanes — which sessions can run in parallel without colliding

| Lane | Takes | Touches (own these files) | Never run alongside |
|---|---|---|---|
| **1 Billing & growth** | B1–B7, P2 | `supabase-schema.sql`, `supabase/functions/*`, `src/lib/billing.js`, `growth.js`, `src/ui/plan-cards.js`, `billing-admin.js`, `growth-admin.js`, `src/pages/admin.js`, `settings.js`, `scripts/fake-supabase.mjs`, `scripts/schema-tests/*` | another schema writer (Q3 must ask lane 1 for its section number) |
| **2 Production** | G1, G2, G5, G7 | `src/lib/dpr.js`, `locations.js`, `sun.js`, `callsheet-text.js`, `src/pages/shoot.js`, `contacts.js`, `plan.js`, `reports.js`, `stripboard.js`, `deliverables.js` | — |
| **3 Quality** | T1–T4, T8–T10 | `scripts/*`, `package.json`, `.github/workflows/*` (new), `scripts/budget.json` | lane 4 while both recapture `budget.json` |
| **4 Emotional craft** | E0–E5 | new files + one-line hooks in `story.js`, `scenes.js`, `library.js`, `ai.js`, `navigation.json`, `glossary.json`, `steps.stages.json` | lane 5 on `write.js` |
| **5 Queued** | Q1–Q4, **Q5** (the owner's decision — it was in no lane until 8 Oct, so nobody owned it) | `write.js`, `cloud.js`, `comments.js`, new weather module | lane 4 on `write.js` |
| **Owner / browser** | P1, **P2** (shared with lane 1 — it needs the browser AND the schema), P3–P8, P10–P13. P9 and P12 are done. | no code (docs only: `LAUNCH.md`, `BILLING.md`) | — |


### Where to start in each lane (ranked)

| Lane | Order | First action |
|---|---|---|
| **1 Billing & growth** | 1. **B6** (copy fix, minutes) → 2. **P2** with the owner/browser (turns on promo, upgrade, referral, affiliate — already built) → 3. **B1** GST invoices (§25) → 4. **B4** + **B5** (leads, funnel — small, one session) → 5. **B2**, **B3** → 6. **B7** only after a security review | Open `src/ui/growth-admin.js:136-137` and make the heading say only what renders. Then, before writing any SQL, read `supabase-schema.sql` §21–§23 and `docs/BILLING.md` §7 so §25 follows their conventions. |
| **2 Production** | 1. **G1** (after-sunset reads the DPR wrap) → 2. **G2** (recce fields on Plan) → 3. **G7** (dynamic imports, measurable) → 4. **G5** (only after checking the CBFC manual) | `src/pages/shoot.js:282`: take the later of the call-sheet `wrap` and the DPR's wrap for the day (`src/lib/dpr.js`), and add the case to `test:sun` / `test:stripboard`. |
| **3 Quality** | 1. **T8** (make `ship` run the whole gate) → 2. **T4**, **T2**, **T1** (small) → 3. **T3**, **T9** (browser) → 4. **T10** CI (needs T8) | Read the release gate in `docs/BRANCHING.md`, then change `package.json`'s `ship` so it runs every `test:*` and the `prove:*` list; time it; record the cost. |
| **4 Emotional craft** | E0 → E1 (the first shippable slice) → E2 → E3 → E4 → E5 | `git worktree add .claude/worktrees/emotional-craft -b feature/emotional-craft origin/develop`, then Phase 0 of `docs/WIP-EMOTION-PLAN.md` (build, every `test:*`, uncapped `verify`; write `docs/WIP-EMOTION.md`). |
| **5 Queued** | Q5 is the owner's call first → Q2, Q1, Q4 → Q3 last (needs a schema number from lane 1) | Ask the owner about Q5 before touching anything; Q2 (`src/ui/comments.js`) is the safest build. |

### Old numbers → registry IDs

Earlier text in this file and in `docs/WIP.md` / `docs/RESUME.md` uses the
session task numbers. Map: task **#9** → B1–B5 (+P2); **#10** public link → B7;
**#11** weather → Q1; **#12** notes overview → Q2; **#13** goal sync → Q3;
**#14** template packs → Q4; **#15** Tamil labels → Q5; **#16** integration →
done (`ad7ab02`); **#18** emotional craft → E0–E5. Tasks #1–#8 and #10 (the
workstreams) are done.

Shared files where two lanes will collide — keep edits there to one-line hooks
and rebase often: `write.js`, `store.js`, `backup.js`, `hub.js`, `package.json`,
`vite.config.js`, `scripts/budget.json`, `scripts/baseline.json`.
Re-baseline and budget recapture are **release-gate** actions: do them once, in
the release, with zero data-key movement.

## 7. The emotional-craft plan (planned, not built)

Full plan: **`docs/WIP-EMOTION-PLAN.md`**. Summary: Phase 0 baseline;
**A** vocabulary + Library shelf + glossary (the first shippable slice, pure
content); **B** Story emotion layer inside `fms_story_v1`; **C** per-scene
`feeling` field + margin chip + honest rule-based hints; **D** AI "emotional
read" with verbatim-quote verification; **E** case-study and dissection
emotion columns.

**The plan's base branch is out of date.** It says Phase 0 baselines
`wip-all` and that nothing ships "before `wip-all` is integrated". The
integration pass HAPPENED (`ad7ab02`), so branch `wip-emotion` off
`develop` and read the plan's `wip-all` references as historical. That is
the only correction needed; the phases themselves still stand.

## 8. Owner-only steps (the container cannot do these)

See **`docs/LAUNCH.md`**. ~~Publish the Google consent screen~~ — already
published; what is left there is one click, re-requesting the branding
review on 9 Oct 2026 or later. ~~Run schema §16–§23~~ — §16–§19 and §24 are
live; only **§20–§23** remain, and they go in the same session as the
`rzp-order` redeploy. Run the **two-account** RLS checks in
`docs/SECURITY-RLS.md` **before taking payments** (the read-side check is
now done; the rest need a second real Google account). Razorpay (test mode
first), `VITE_RAZORPAY_KEY_ID` — but the prices are already real, so
CONFIRM them rather than re-seeding. ~~Fill the legal placeholders~~ — the
legal name is filled; only the **GSTIN** is left, and if there is no
registration the fix is deleting that sentence rather than filling it;
(for the emotional-craft layer) supply `scripts/deny-shingles.txt`; set
`VITE_SUPPORT_WHATSAPP` if wanted. To let a session do the network steps,
allow the Supabase/Razorpay hosts in the environment's Network access and
provide `SUPABASE_ACCESS_TOKEN` and the Razorpay keys as environment secrets.

## 9. Lessons from this session

- Agents that edit disjoint files merge cleanly; shared files (`write.js`,
  `store.js`, `backup.js`, `hub.js`, `package.json`, `locations.js`) are where
  conflicts live — keep new work in new files with one-line hooks.
- Re-baseline only after reading the per-page word diff and proving zero
  data-key movement; deliberate copy changes only.
- Anything a stopped agent left uncommitted exists only as a snapshot commit —
  look at `archive/*`, not the agent worktrees.
- Do not name a branch `wip` in a repo that has `wip/…` branches. ~~Do not plan
  on deleting remote branches.~~ That was wrong — deletion works for a session
  with the owner's own credential; see §5.
- "Verify green" on a branch means nothing until it is run uncapped on the
  merged tree.
- **Documents about state go stale within hours.** This file said the Google
  consent screen was in Testing and §16–§23 were unrun while another session
  was proving the opposite. Re-run the audit (`git log`, `git ls-remote`,
  the schema file's `-- RUN` headers) before trusting any status table.
- **Audit agents are wrong too.** Of 12 "PARTIAL/MISSING" findings in the
  8 Oct audit, 5 were false on re-reading the code (the stripboard banner UI
  offers all four kinds; `mayRemoveBranding` already blocks free plans;
  `test:testimonials` already checks the markup both ways; the equipment
  checklist is seeded from the estimator and tested; the table read has a
  print route). §6c lists only what was verified.
- **A cold read finds the gaps.** After writing a handoff, give it to a fresh
  agent with nothing else and ask it questions.

## 10. Where every doc lives

| Doc | On | Purpose |
|---|---|---|
| `CLAUDE.md` | main | invariants, commands, traps, status table |
| `docs/HANDOFF.md` | main, develop | **this file** — read first |
| `docs/BRANCHING.md` | main, develop | **develop → main workflow and the release gate** |
| `docs/WIP-EMOTION-PLAN.md` | main, develop | the emotional-craft plan (lane 4) |
| `docs/WIP.md` | main, develop | per-workstream detail of the ten workstreams — now history, but it describes each feature's files |
| `docs/RESUME.md` | main, develop | where each stopped workstream was (superseded; history) |
| `docs/FEATURE-IDEAS.md` | main, develop | ~55 ranked ideas with statuses, market table, positioning |
| `docs/LAUNCH.md` | main, develop | owner checklist (current) |
| `docs/BROWSER-HANDOFF.md` | main, develop | the launch steps a local Claude-in-Chrome session can do |
| `docs/HISTORY.md` | main, develop | the long build log, items 1–20 |
| `docs/KNOWN-ISSUES.md` | main, develop | recorded decisions, things seen once, release leftovers |
| `docs/UX-AUDIT-2026-10-06.md` | main | audit, struck through |
| `docs/BILLING.md`, `SECURITY-RLS.md`, `GATE.md`, `STORAGE-MODEL.md`, `EXTENSION.md`, `DEPLOY.md`, `LIVE-CHECKS.md` | main | subsystem docs |
| `docs/GOOGLE-AUTH.md` | main | **STALE — do not follow it.** Flagged 8 Oct 2026. It is a generic setup runbook from before any of this existed: it names no real Google project (it tells you to CREATE one called `filmmakers-studio-auth`, when the live one is `filmstudio-495419`), lists three scopes and omits `drive.file`, points at the dead host `ak-filmmaker-studio.vercel.app`, describes the Supabase config as a per-browser `localStorage` key under the OLD `arunak_` prefix, and says "none of it is done yet" when the consent screen is published and in production. The live facts are in §4 of this file and `docs/LAUNCH.md` §2. Rewrite it or delete it; following it would undo working configuration. |

**Two notes on using this table.** `docs/BILLING.md` §0 still prints the old
placeholder prices (₹2,999 / ₹7,999 / ₹19,999); the live table says ₹599 /
₹799 / ₹999 and the live table wins (§4). And a doc being listed here is not
a promise that it is current — `GOOGLE-AUTH.md` above is the proof. Check a
status claim against the database, the console or `git log` before acting on
it, which is this file's own standing instruction and the one it has itself
broken most often.
