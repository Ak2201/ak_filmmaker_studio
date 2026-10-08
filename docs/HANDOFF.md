# HANDOFF — read this first

Written 8 Oct 2026 at the end of a very long session (7–8 Oct). A new
session has no memory of it. This file is the single entry point: what was
done, what was decided, where every piece of unfinished work sits, what is
planned, and what only the owner can do. Facts here were checked against the
repo (`git log`, `git ls-remote`) when it was written; anything not checked
is marked **unverified**.

**Starting phrases the owner can use:**
"resume everything" · "resume <workstream name>" (§6) ·
"resume the emotional-craft plan, Phase 0" · "run the integration pass" ·
"do the owner checklist" (that one is theirs — see §8).

**UPDATE, later on 8 Oct 2026 — "resume everything" ran and the ten
workstreams are RELEASED.** Steps 1–11 of §6b were done on
`feature/integration` (off `develop`), merged into `develop` and released to
`main` with a `--no-ff` merge titled "Release: the ten workstreams". The
tables below (§1, §6) describe the state BEFORE that and are kept as the
record; `docs/HISTORY.md` item 20 is what changed. Still open: the owner
checklist (§8, `docs/LAUNCH.md`, now including schema §21–§24 — run §24
before this build goes live), the not-started billing items (GST invoices,
gift, edu, leads, funnel — schema §25 onward), the queued ideas (tasks
11–14), the Tamil-labels decision (task 15), the emotional-craft layer, and
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
- **The `[OWNER: full legal name]` placeholders are not pending edits —
  they are LIVE on the public site**, on `/privacy`, `/terms` and
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

## 1. State of the repo (GitHub, `Ak2201/ak_filmmaker_studio`)

| Branch | Head | What it is |
|---|---|---|
| `main` | `7c56c81` | **Green, gated.** Everything through the launch-readiness merge, plus `docs/FEATURE-IDEAS.md` and `docs/RESUME.md`. This file's commit sits on top. |
| `wip-all` | `989fbf0` (before this file) | **Unfinished union of ten workstreams**, merged onto `main@7c56c81`. Builds; `verify` never completed; no `prove:*` run. **Not for merging as it stands.** Reference doc: `docs/WIP.md` (on this branch only). |
| `develop` | `973ad47` (at creation) | **The development branch.** Same commit as `wip-all` when created; all new work lands here via `feature/*` branches. Promoted to `main` only through the release gate in `docs/BRANCHING.md`. Not releasable yet. |
| `archive/*` (10) | see §6 | The ten individual workstream branches, pushed as backups before the merge. |
| `wip/*` (10) | same commits as `archive/*` | The original backup names. **Cannot be deleted** (GitHub proxy returns HTTP 403 on branch deletion). Ignore them; use `archive/*`. |
| `feature/on-set` | `75438f7` | The one **finished and gated** feature branch (WhatsApp call sheet, sunrise/sunset, route sheet). Same commit as `archive/ac7bac5586116f143`. |
| `claude/launch-leftovers` | `a204d49` | Two commits on `5791a27`: derived landing figures/tier names, sitemap, rail descriptions, and the **legal pages** (individual seller, no-refund policy). Not gated. Also `archive/leftovers`. |
| `claude/feature-ideas` | `7c56c81` | The ideas-doc branch; same as `main`. |
| `claude/fix-medium-low-bugs` `81994e3`, `claude/fix-open-issues` `cc7f619`, `claude/launch-readiness` `c858447`, `claude/improvement-ideas-0gwjyx` `8502d1c`, `revamped-ui` `9d7b6c2` | — | Merged/old branches. History only. |

**Gotcha — the main checkout is NOT on `main`.**
`/home/user/ak_filmmaker_studio` has `claude/launch-leftovers` checked out.
Do work in a worktree (`git worktree add .claude/worktrees/<name> -b <name>
origin/<base>`), never in that directory. Temporary worktrees from this
session may still exist under `.claude/worktrees/` (`ideas-doc`,
`handoff-*`, and one per stopped agent); `git worktree list` shows them.
Stopped agents' worktrees contain **uncommitted files that the stop hook will
nag about — do not commit them from outside**; their content is already
safe on `archive/*`.

## 2. What was done, in order (all merged to `main` unless stated)

| When | What | Commit |
|---|---|---|
| 7 Oct | **UX-audit Medium/Low pass** — 27 Medium + 30 of 31 Low fixed (focus handling, modal focus trap, validated backup import, filtered tab observer, rails `visibility:hidden`, budget fixes, print colours, etc.). `docs/UX-AUDIT-2026-10-06.md` is struck through item by item. | merge `a4d29ca` |
| 7 Oct | **Open-issues pass** — sign-in + Appearance on every page's band, stable palette handle, Case Studies in parts, one script slicer (`sliceScenes` = `sliceScript`, pinned by `test:import`), path-aware Story guide pill, wider AA walk (Story steps 3/4/6, Write Panel mode), hand-editable scene numbers for unbound scenes, print hides controls, deterministic `prove:gate`. `docs/KNOWN-ISSUES.md` reduced to recorded decisions. | merge `f09779f` |
| 7 Oct | **Launch readiness** — public `start.html` (outside the gate, words in markup), OG/Twitter cards + `og.png`, `robots.txt`/`sitemap.xml`, **first-paint JS cut** (module pages ~29–47 % of before; `studio` chunk split into CORE + per-page; data JSON per file), **Supabase kept out of first paint**, 37 plain-English module descriptions, grouped Pre-Production launcher, three job cards on the hub, sample button first, lock panel names the plan that includes a module, `hub.js` split into `src/pages/hub/*`, **promo codes** (schema §20) and the **accounts INSERT hole closed** (§19), **stripboard drag-and-drop** with per-day order (inside `fms_locations_v1` as `order`), Story "ways in", Drive one-hour copy, and new gate checks: `prove:sw`, a fragment-target sweep (found two real bugs), a scripts-off no-flash probe, a first-paint byte budget (`scripts/budget.json`). | merge `5791a27` |
| 7 Oct | **Docs**: `CLAUDE.md` slimmed (log moved to `docs/HISTORY.md`, status table kept), `docs/LAUNCH.md` (owner checklist), `docs/FEATURE-IDEAS.md` (~55 ideas, ranked), `docs/RESUME.md`. | `c858447`…`7c56c81` |
| 7 Oct | **Four read-only research passes** (story/screenplay, pre-prod→post, growth/money, competitors/India market) → merged into `docs/FEATURE-IDEAS.md`. | `c507bb2` |
| 7 Oct | **Nine feature agents + a leftovers agent started in parallel**, then **stopped by the owner mid-work**. Only *On set* finished. Snapshots pushed as `archive/*`, then merged into `wip-all` with `docs/WIP.md`. | `wip-all` `989fbf0` |
| 8 Oct | **Emotional-craft layer** (idea from *Writing for Emotional Impact*) — explored by three agents, planned, decisions taken, **nothing built**. Saved as `docs/WIP-EMOTION-PLAN.md`. | this commit |

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
- **Seller is an individual** (name still a placeholder). **Production host
  `thefilmmakerstudio.vercel.app` is confirmed.**
- **No refunds**, except three exceptions every processor needs: duplicate
  charge; charged but plan not delivered; where Indian law requires. The
  webhook's refund *handling* stays for those.
- **Contact details** (support e-mail, postal address, GSTIN) left as
  `[OWNER: …]` placeholders.
- **Pay-once, full-time access** (no subscription); prices are server-side
  only; promo codes priced server-side.
- **Emotional-craft layer:** Learn + Apply; AI included as the **last** phase;
  *learning free, tools paid* (feature key); **built on top of `wip-all`**
  (the owner chose this over my recommendation to build on `main`).
- **Copyright:** the book is copyrighted — original wording only, Tamil/Indian
  examples from the four studied films, one credit line, no reproduction.
- **Still undecided (task #15):** Tamil-script UI labels (reverses `lang.js`'s
  English-labels design).

## 4. What is live and what is not

**Re-established 8 Oct 2026 by asking the database and the Google console
directly.** Every clause of the paragraph that used to sit here was wrong,
and wrong in the owner's favour — three supposed blockers did not exist.

- Schema **§1–§14** live (verified through PostgREST). **§16, §17, §18**
  live since 6 Oct. **§19 and §24** live since 8 Oct — read back as
  `accounts_guard` tgtype **23** and a `project_data` scope CHECK of **442**
  characters naming `characters` and `costs`. **§20–§23 are NOT run**, on
  purpose: they belong with the Razorpay deploy.
- The **Google consent screen is PUBLISHED** — In production, External, and
  Google says verification is not required because no sensitive or
  restricted scopes are requested. It was never in Testing-with-no-users by
  the time anyone checked. Its BRANDING is filled in and awaiting
  re-verification; domain ownership was proved on 8 Oct through the
  `google-site-verification` meta tag already in `index.html`.
- **No Razorpay key exists.** Still true.
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

- The container **cannot reach** `*.supabase.co`, `api.supabase.com` or
  `api.razorpay.com`, and has **no Google credential** — nothing here has met a
  live database, Razorpay or Google's consent screen.
- GitHub **returns transient HTTP 500 on push**: retry with 5/10/20/30 s backoff.
  **Branch deletion is blocked (403)** — never plan on deleting a remote branch.
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
| Script revisions | the `Element.append(null)` bug is FIXED — `write-revisions.js:158` filters with `.filter(Boolean)`; `test:revisions` exists |
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

### What is actually still open

| # | Item | State |
|---|---|---|
| 1 | **CBFC/AWBI/OTT source check** | The tests pass. The CITATIONS were re-checked against search summaries only, because the cited hosts are unreachable from a container. Open each `sourceUrls` link in a real browser and bump `checked`. A session with a browser can do this. |
| 2 | **Billing growth, the unstarted five** | GST invoices, gift, edu, leads, funnel. Not started, no tables, no code. `src/lib/growth.js`'s header says so. |
| 3 | **§20–§23 are not LIVE** | Written and tested, never run against the database. They belong in the same session as the Razorpay deploy, because §20 recreates `create_pending_payment` and `rzp-order` must be redeployed after. |
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
| 4 | **The CBFC/AWBI/OTT source check** | Needs a browser, not a container. One link at a time, bump `checked` per rule, leave `confidence` honest. |
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
- Do not name a branch `wip` in a repo that has `wip/…` branches. Do not plan on deleting
  remote branches.
- "Verify green" on a branch means nothing until it is run uncapped on the
  merged tree.

## 10. Where every doc lives

| Doc | On | Purpose |
|---|---|---|
| `CLAUDE.md` | main | invariants, commands, traps, status table |
| `docs/HANDOFF.md` | main, wip-all | **this file** |
| `docs/BRANCHING.md` | main, develop | **develop → main workflow and the release gate** |
| `docs/WIP-EMOTION-PLAN.md` | main, wip-all | the emotional-craft plan |
| `docs/WIP.md` | wip-all only | per-workstream detail for the ten unfinished branches |
| `docs/RESUME.md` | main, wip-all | where each stopped workstream was (first version) |
| `docs/FEATURE-IDEAS.md` | main, wip-all | ~55 ranked ideas, market table, positioning |
| `docs/LAUNCH.md` | main (older); newer on `claude/launch-leftovers` | owner checklist |
| `docs/HISTORY.md` | main | the long build log, items 1–18 |
| `docs/KNOWN-ISSUES.md` | main | two recorded decisions + one thing seen once |
| `docs/UX-AUDIT-2026-10-06.md` | main | audit, struck through |
| `docs/BILLING.md`, `SECURITY-RLS.md`, `GATE.md`, `STORAGE-MODEL.md`, `EXTENSION.md`, `GOOGLE-AUTH.md`, `DEPLOY.md`, `LIVE-CHECKS.md` | main | subsystem docs |
