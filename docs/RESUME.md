# Where work stopped — resume here

> **Superseded as the entry point by `docs/HANDOFF.md`** (8 Oct 2026), which
> covers everything done and planned. This file is the first, narrower version
> and is kept for its per-workstream notes.

Written 7 Oct 2026 when the owner stopped every running agent. **Nothing
in this file is on `main` except this file and `docs/FEATURE-IDEAS.md`.**
The feature work lives on `wip/*` branches on GitHub. They are backups of
whatever existed at the moment of stopping — read the state column before
trusting any of them.

`main` is at the launch-readiness merge (`5791a27`) plus the ideas doc.
That tree is gated and green. A `wip/*` branch is not.

## How to resume any workstream

```bash
cd /home/user/ak_filmmaker_studio          # the main checkout
git fetch origin
git worktree add .claude/worktrees/<name> -b <name> origin/wip/<branch>
cd .claude/worktrees/<name>
npm install && git checkout package-lock.json
export PW_CHROMIUM=/opt/pw-browsers/chromium
```

Then hand the workstream to a fresh agent with the brief below ("Resume
brief" in each section) plus **the common rules** at the end of this file.
Do the work on that branch, never directly on `main`.

A wip branch is based on the `main` of the moment it started, so it will
not contain `docs/FEATURE-IDEAS.md` and it will need `git merge
origin/main` before the integration pass.

## State at a glance

| Workstream | Branch | Committed | Left to do |
|---|---|---|---|
| On set — WhatsApp call sheet, sunrise/sunset, route sheet | `feature/on-set` (= `wip/ac7bac5586116f143`) | **Done and gated** | Merge only |
| Leftovers + legal pages | `wip/leftovers` | Both commits done | Verify + proofs not re-run after the legal edit; read the legal pages in a browser |
| Schedule — DPR, one-liner, banners, kit, offline pack | `wip/a8500da1354391964` | 6 commits, all five features | Full verify and the final report; never ran together |
| Writing — Tamil typing, characters, docs, table read | `wip/a40f499bfa0c512e8` | 4 commits, all four features | Verify was running when stopped; run all `test:*` |
| Billing growth — §21–§23 | `wip/a1db0236c653737b2` | 3 schema sections + UI | Items 4–8 not started; docs for §23; delete a debug file |
| Script revisions — compare, locked numbers | `wip/abc1d13439ac92b6b` | One snapshot, **uncommitted work** | A known bug mid-fix; unverified |
| AI — coverage, logline workshop | `wip/a55b1a0c890ccf84e` | One snapshot, **uncommitted work** | Voice check has no UI yet; tests being written |
| Compliance — CBFC, dialogue list, runtime, OTT | `wip/acc100544ab48cea5` | One snapshot, **uncommitted work** | Tests being written; unverified |
| Money — petty cash, actuals, payments | `wip/ad27555771d505845` | One snapshot, **uncommitted work** | Verify was about to run; check which features exist |
| Growth UX — footer, tour, testimonials | `wip/adb4de922f32dffae` | One snapshot, **uncommitted work** | Verify was about to run; delete a scratch file |

## 1. On set — DONE

Branch `feature/on-set` (`75438f7`). Gated by its agent: `verify` green,
`test:sun` 72/72, `test:callsheet` 71/71, in budget (contacts 543.9 of
575 KB, shoot 489.6 of 530 KB). WhatsApp send/share/copy panel on each
call sheet, `src/lib/sun.js` (NOAA, offline, ±1.5 min against astral),
route and safety block, `recce-geo.js` for Maps-link pins. **No new
storage keys** — new fields `lat lng hospital police` on recces and
`wrap` on call sheets.

Left over: add the four recce fields to the Plan page's recce card
(`src/pages/plan.js`); the after-sunset flag reads only the call sheet's
`wrap` — if the schedule agent's DPR adds a day-level wrap, read that too.

## 2. Leftovers + legal pages — `wip/leftovers`

Committed: `dd6646e` (start.html's Dragon figures and tier names derived
at BUILD time from one source, `src/lib/sample-figures.js` and
`src/lib/plans.js`; `/invite` out of the sitemap; rail stage drawer gets
descriptions) and `a204d49` (individual seller, **no-refund policy with
the exceptions payment processors require**: duplicate charge, charged but
not delivered, and where Indian law requires; refund.html, terms.html,
privacy.html; `thefilmmakerstudio.vercel.app` recorded as the confirmed
host).

Left to do:
1. `VITE_SITE_GATE=off npx vite build --outDir dist-verify` then
   `VERIFY_DIST=dist-verify npm run verify` — wording diffs on settings,
   invite, admin are acceptable; list them.
2. `npm run build`, then `prove:gate`, `prove:billing`, `prove:sw`,
   `test:billing`.
3. Read refund/terms/privacy at 390px and 1280px in both themes (they are
   not in the gate). Check start.html with scripts OFF shows the Dragon
   figures and the tier names (they must be in the markup for crawlers).
4. Check any user-facing sentence in plan cards / invite / settings that
   still promises a refund window; the webhook's refund HANDLING must stay.
5. Re-baseline only if every diff is a deliberate copy change and
   data-keys move by zero.

Owner placeholders still to fill: `[OWNER: full legal name]`, the support
e-mail and postal address, `[OWNER: GSTIN, if registered]`.

## 3. Schedule — `wip/a8500da1354391964`

Commits: day records inside `fms_locations_v1` (`dpr`, banners, kit, page
target — **no new key**), stripboard banners and day-load warning,
reports.html one-liner + Daily Production Report + per-day equipment
lists, offline shoot pack (SW `FMS_PACK` message), `prove:sw` assertion (h).

Left to do: run the full gate on it (`verify`, `test:stripboard`,
`prove:sw`, `prove:storage`); confirm the DPR reads `shotState` and never
writes it (shoot.html is the only view that writes to a scene); confirm no
redirected response enters the cache. Touches `src/sw.js` — read the SW
trap in CLAUDE.md first.

## 4. Writing — `wip/a40f499bfa0c512e8`

Commits: Tamil-script typing for dialogue and parentheticals (opt-in,
`src/ui/tamil-type.js`), "Keep as Tamil take", One-Pager / Treatment /
Synopsis starting drafts, characters as data with rename-everywhere
(`src/lib/characters.js`, `src/ui/characters-panel.js`) and the table read.

**New key: `fms_characters_v1`** — registered in `store.js`, `backup.js`
and `hub.js`; it also touched `cloud.js`, so check what it changed there.
It needs the cloud scope CHECK widened (see "Schema" below).

Left to do: its `verify` was running when stopped. Run `verify`,
`test:tanglish`, `test:keys`, `test:format`, `test:story`,
`test:screenplay`; confirm the Tamil font stays LAST in `--f-script`;
measure Enter-paint on write.html (target ~30 ms median).

## 5. Billing growth — `wip/a1db0236c653737b2`

Done: **§21** upgrade by paying the difference, **§22** referral codes
and the credits ledger, **§23** affiliate codes with a derived commission
report; `src/lib/growth.js`, `growth-admin.js`, `growth-panels.js`,
`rzp-order` changes, new schema tests (`upgrade.sql`, `referral.sql`,
`affiliate.sql`).

Left to do — in this order:
1. Delete the debug file `scripts/.dbg-growth.mjs`.
2. Finish the docs for §23 (`docs/BILLING.md`, `docs/SECURITY-RLS.md` live
   checks).
3. Run `pg_ctlcluster 16 main start`, `npm run test:schema`,
   `test:billing`, gated `build` + `prove:billing` + `prove:gate`.
4. Not started: **GST invoices for buyers** (GSTIN checksum, FY invoice
   sequence FMS/2026-27/000123, "Bill of Supply" mode because the seller
   is an individual), **gift a licence**, **film-school (edu) licence**,
   **landing-page e-mail capture** (`leads`), **first-party funnel counts**
   (`events`, no personal data, opt-out). Use schema sections §24 onward.
5. Update the `fake-supabase.mjs` fixture for each new RPC.

## 6. Script revisions — `wip/abc1d13439ac92b6b` (uncommitted)

Written, unverified: `src/lib/script-diff.js`, `src/ui/write-revisions.js`,
`src/styles/write-revisions.css`, `scripts/test-revisions.mjs`, edits to
`script.js`, `screenplay-export.js`, `scene-sync.js`, `write.js`,
`breakdown.js`, `handoff.js`, `modules.css`, `tokens.css`.

**Known bug when stopped:** a `null` child was being passed to a native
`append` (the `Element.append(null)` trap in CLAUDE.md — it inserts the
text "null"); filter first. After the fix, rebuild and debug the revision
view.

Left to do: that fix; revision compare; revised-page asterisks and colour
names in the PDF through `paginate()` (screen and PDF must agree); locked
scene numbers (12A, OMITTED) written through `scene-sync.js` into scene
rows without breaking "only scenes with no `scriptElId` are hand-editable";
note the edit to `tokens.css` needs a check on the AA walk; `test:sync`,
`test:format`, `test:keys`, `test:import`, `test:pdf`, `test:screenplay`;
Enter-paint ~30 ms.

## 7. AI — `wip/a55b1a0c890ccf84e` (uncommitted)

Written, unverified: coverage report (`src/ui/coverage.js`), logline
workshop (`src/ui/logline-workshop.js`), `ai.js` additions, `fake-ai.mjs`,
`prove-ai-coverage.mjs`, `test-ai-coverage.mjs`.

**The character-voice check is written in `ai.js`** (`planVoiceCheck`,
`buildVoicePrompt`, `voiceCheck`) but has **no UI yet** — mount it from
write.html's coverage panel / character list. The rule that governs all of
it:
a quotation that is not word for word in the script is stripped and
counted; AI never overwrites the writer's text without an explicit accept;
suggested rewrites go into `alts`, never the active take.

Left to do: finish `test-ai-coverage.mjs`, run it and `prove-ai-coverage`
against the fake for BOTH providers (LF and CRLF frames, a Gemini `thought`
part, a fabricated quote that must be stripped); give the voice check
its UI (suggested rewrites go to `alts` through the existing alt-lines
path); keep `ai.js` out of first paint; `verify`.

## 8. Compliance — `wip/acc100544ab48cea5` (uncommitted)

Written, unverified: `src/lib/cbfc.js` + `src/data/cbfc-rules.json`
(sources and `checked` dates required on every rule), `dialogue-list.js`
(CSV and SRT skeleton), song `duration` and target runtime in
`screenplay-analysis.js`/`songs.js`/`reports.js`, OTT optional groups in
`deliverables.json`, `deliverables-tools.css`, `runtime.css`,
`test-delivery.mjs`.

Left to do: add the runtime tests to `test-screenplay.mjs` and the
optional-group tests to `test-post.mjs` (it was doing exactly this when
stopped); verify every CBFC/AWBI/OTT fact against its source, and mark
Aha / Sun NXT / ZEE5 as user-filled because they publish no specs; the
likely-rating output must read as a hint; `verify`. New deliverable ids are
storage keys — never rename existing ones.

## 9. Money — `wip/ad27555771d505845` (uncommitted)

Written, unverified: `src/lib/costs.js` (**new key `fms_costs_v1`**, in
`store.js`, `backup.js`, `hub.js`, and touching `cloud.js`),
`src/ui/budget-costs.js`, `src/data/wages.fefsi.json`, `budget.css`,
`tabs.js` edit, `scripts/test-costs.mjs`.

Left to do: `verify` had not run. The code for all seven items is
present (petty cash, budget vs actuals, crew payments and advances,
GST/TDS, top sheet, FEFSI table, Movie Magic-style CSV export) — but none
has been exercised in a browser, so open budget.html on the Dragon sample
and walk each tab. **The wage table
must stay labelled "last published, 2022 MoU, expired — confirm with your
union"** (CLAUDE.md item 7: no current floor exists). Money parsing goes
only through `src/lib/money.js`. Confirm `fms_costs_v1` survives export and
import.

## 10. Growth UX — `wip/adb4de922f32dffae` (uncommitted)

Written, unverified: branding footer (`footer.js`, `pitch-deck.js`,
`screening.js`, `print.css`), onboarding tour (`tour.js`, `tour.json`,
`tour.css` — **new key `fms_tour_v1`**), testimonials (`testimonials.json`
ships EMPTY — never invent one), `check-testimonials.mjs`, WhatsApp
support link, and the **public read-only share link, design only and
switched OFF** (`public-view.js`, `public-view-model.js`, `prove-growth.mjs`).

Left to do: delete the scratch file `scripts/scratch-tour-walk.mjs`; run
`verify` (the tour must write nothing while idle), gated `prove:gate`
(screening room), `prove:billing`; the SQL for public links must stay a
PROPOSAL until a security review — do not put it into `supabase-schema.sql`.

## Queued — nobody has started these

| Idea | Waits for |
|---|---|
| Monsoon weather flag on outdoor days (external API → `connect-src` in BOTH `vercel.json` and `netlify.toml`) | On set (merged) |
| Script-notes overview (`src/ui/comments.js`) | Revisions + Writing |
| Writing-goal history synced across devices (`fms_write_goals_v1`) | Writing |
| Paid template / sample-pack plumbing (one free original starter; no real people, no reproduced scripts) | Billing + Growth |
| **Tamil-script UI labels** | **Owner decision** — it reverses `lang.js`'s English-labels design |

## Integration — last, after everything above

1. Merge each finished branch into one integration branch off the latest
   `main`; resolve conflicts in the shared files (`store.js`, `backup.js`,
   `hub.js`, `cloud.js`, `write.js`, `locations.js`, `reports.js`,
   `package.json`).
2. **One schema section** widening the Supabase scope CHECK for every new
   per-project key (see below).
3. Full gate: every `test:*`; `prove:storage`, `prove:drive`, `prove:sw`,
   `prove:extension`; gated `build` + `prove:gate` + `prove:billing`;
   `verify` (open build). Read the failures: only deliberate copy changes
   are acceptable.
4. Re-baseline only with zero data-key movement on every page; recapture
   `scripts/budget.json` (`npm run verify -- --budget`) only if growth is
   justified and listed.
5. Update statuses in `docs/FEATURE-IDEAS.md`, the table in `CLAUDE.md`,
   `docs/HISTORY.md` (item 19), `docs/LAUNCH.md` (new schema sections to
   run, in order), and prune `docs/KNOWN-ISSUES.md`.
6. Merge to `main`; delete the `wip/*` branches.

### New storage keys so far

| Key | Scope | Where | Cloud scope needed |
|---|---|---|---|
| `fms_characters_v1` | per project | Writing | yes |
| `fms_costs_v1` | per project | Money | yes |
| `fms_tour_v1` | device | Growth UX | no (device only) |
| `fms_no_analytics_v1` | device | Billing growth, not yet built | no |

Each must be in `SCOPED_KEYS` (store.js, if per project), `PROJECT_KEYS` /
`GLOBAL_KEYS` (backup.js) and `ALL_KEYS` (hub.js). Adding fields inside
an existing record, as On set and Schedule did, needs none of this.

### Schema sections

`supabase-schema.sql` has run through §14 on the live project; §16–§20
are written and tested but **not run live**; §21 (upgrade), §22
(referrals) and §23 (affiliates) exist only on `wip/a1db0236c653737b2`.
Next free number is §24. Only one agent may write schema sections at a
time. None of this is live until the owner runs it (`docs/LAUNCH.md` §4).

## Common rules for every agent

Read `CLAUDE.md` first. Storage keys are a contract; prefer a new field
inside an existing record over a new key; no inline handlers (use
`delegate()` + `data-action`); colours only from `tokens.css`, shapes from
`--sk-*`; every transform is multiplied by `--motion`; 44 px targets under
`pointer: coarse`; text meets AA 4.5:1; derived data is never stored;
money parsing only through `src/lib/money.js`; a module with a page-wide
side effect belongs in CORE in `vite.config.js`; a new page that must work
signed out goes in the `EXEMPT` list in `sitegate.js`. Do not edit
`scripts/baseline.json`, `scripts/budget.json` or `EXPECTED` from a feature
branch — the integration pass owns them. Browser runs need
`PW_CHROMIUM=/opt/pw-browsers/chromium`; use your own `VERIFY_PORT` /
`PROVE_PORT`. Commit messages end with `Co-Authored-By: <model>` and
`Claude-Session: <url>`.

**Environment limits learned today:** the container cannot reach
`*.supabase.co`, `api.supabase.com` or `api.razorpay.com`, and has no
Google credential, so nothing here has met a live database, a live Razorpay
account or Google's consent screen. GitHub returned transient 500s on push;
retry with 5/10/20/30 s backoff.
