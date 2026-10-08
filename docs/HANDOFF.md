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

Schema §1–§14 have run on the live Supabase project `conhlrulxfwkhsnymakz`
(verified through PostgREST). **§16–§20 are written and tested but not run
live; §21–§23 exist only on `wip-all`/`archive/a1db…`.** The Google consent
screen is **in Testing** (no account can sign in). **No Razorpay key exists.**
**None of the live RLS checks has ever run.** Prices seeded in the database
are placeholders. Legal pages on `main` are still the older drafts; the new
ones are on `claude/launch-leftovers` only. Ask the database, not the file.

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

## 6. The open work (task list as of 8 Oct)

| Task | Workstream | Branch (`archive/…`) | State | Doc |
|---|---|---|---|---|
| 1 | Leftovers + legal | `leftovers` / `claude/launch-leftovers` `a204d49` | 2 commits; verify + proofs not re-run after the legal edit; read legal pages in a browser | `docs/WIP.md` §3.1 |
| 2 | **On set** | `ac7bac5586116f143` / `feature/on-set` `75438f7` | **Done and gated** | §3.2 |
| 3 | Money | `ad27555771d505845` `547d370` | written, **unverified**; key `fms_costs_v1` | §3.8 |
| 4 | Schedule | `a8500da1354391964` `a449645` | 6 commits, written, ungated | §3.3 |
| 5 | Script revisions | `abc1d13439ac92b6b` `a20cb45` | uncommitted at stop; **known bug** `Element.append(null)` in `write-revisions.js` | §3.5 |
| 6 | Writing | `a40f499bfa0c512e8` `433bc35` | 4 commits; key `fms_characters_v1`; verify unfinished | §3.4 |
| 7 | Compliance | `acc100544ab48cea5` `6e51ad2` | uncommitted at stop; tests unfinished | §3.7 |
| 8 | AI | `a55b1a0c890ccf84e` `ea3b52a` | uncommitted at stop; voice-check code + UI exist (verify) | §3.6 |
| 9 | Billing growth | `a1db0236c653737b2` `478d852` | §21 upgrade, §22 referral, §23 affiliate done; **GST invoices, gift, edu, leads, funnel not started** | §3.9 |
| 10 | Growth UX | `adb4de922f32dffae` `76b5f1f` | uncommitted at stop; tour key `fms_tour_v1`; public-link design OFF | §3.10 |
| 11–14 | Queued, **nobody started**: monsoon weather flag; script-notes overview; writing-goal sync across devices (needs schema CHECK); paid template-pack plumbing | — | not started | `docs/FEATURE-IDEAS.md` |
| 15 | **Owner decision:** Tamil-script UI labels | — | undecided | — |
| 16 | **Integration pass** (blocked on all above) | `wip-all` → new branch off latest `main` | not started | `docs/RESUME.md`, `docs/WIP.md` §8 |
| 17 | Consolidation into `wip-all` + `docs/WIP.md` | `wip-all` | done | — |
| new | **Emotional-craft layer** | plan only | planned, Phase 0 not run | `docs/WIP-EMOTION-PLAN.md` |

**New storage keys so far:** `fms_characters_v1` (per project), `fms_costs_v1`
(per project) — both need the Supabase scope CHECK widened in one schema
section; `fms_tour_v1` (device); `fms_no_analytics_v1` planned. **Schema
sections:** next free number is **§24**; only one agent may write schema
sections at a time.

**Integration pass (task 16), short form:** merge finished branches into a new
branch off the latest `main`; one schema section widening the scope CHECK;
run every `test:*`, `prove:storage/drive/sw/extension`, gated `prove:gate` +
`prove:billing`, and `verify` uncapped; re-baseline only with **zero data-key
movement**; recapture `scripts/budget.json` only if growth is justified;
update statuses in `docs/FEATURE-IDEAS.md`, the `CLAUDE.md` table,
`docs/HISTORY.md`, `docs/LAUNCH.md`; merge to `main`.

## 7. The emotional-craft plan (planned, not built)

Full plan: **`docs/WIP-EMOTION-PLAN.md`**. Summary: Phase 0 baseline of
`wip-all`; **A** vocabulary + Library shelf + glossary (the first shippable
slice, pure content); **B** Story emotion layer inside `fms_story_v1`; **C**
per-scene `feeling` field + margin chip + honest rule-based hints; **D** AI
"emotional read" with verbatim-quote verification; **E** case-study and
dissection emotion columns. It cannot ship before `wip-all` is integrated.

## 8. Owner-only steps (the container cannot do these)

See **`docs/LAUNCH.md`**: publish the Google consent screen; run schema
§16–§23 on the live project (`node scripts/deploy-billing.mjs --print`) and
check with the live queries; run the two-account RLS checks in
`docs/SECURITY-RLS.md` **before taking payments**; Razorpay (test mode
first), real prices, `VITE_RAZORPAY_KEY_ID`; fill the legal placeholders;
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
| `docs/WIP-EMOTION-PLAN.md` | main, wip-all | the emotional-craft plan |
| `docs/WIP.md` | wip-all only | per-workstream detail for the ten unfinished branches |
| `docs/RESUME.md` | main, wip-all | where each stopped workstream was (first version) |
| `docs/FEATURE-IDEAS.md` | main, wip-all | ~55 ranked ideas, market table, positioning |
| `docs/LAUNCH.md` | main (older); newer on `claude/launch-leftovers` | owner checklist |
| `docs/HISTORY.md` | main | the long build log, items 1–18 |
| `docs/KNOWN-ISSUES.md` | main | two recorded decisions + one thing seen once |
| `docs/UX-AUDIT-2026-10-06.md` | main | audit, struck through |
| `docs/BILLING.md`, `SECURITY-RLS.md`, `GATE.md`, `STORAGE-MODEL.md`, `EXTENSION.md`, `GOOGLE-AUTH.md`, `DEPLOY.md`, `LIVE-CHECKS.md` | main | subsystem docs |
