# WIP — every stopped workstream on one branch

Read this file instead of the ten `archive/*` branches. It is meant to be
enough to continue from `wip-all` alone.

## 1. What this branch is

`wip-all` is a **snapshot union of ten stopped workstreams**, merged on
7 Oct 2026 onto `origin/main` at `7c56c81`
("docs: RESUME.md — exactly where each stopped workstream is"). It is
**not green, not finished and not for merging to `main` as it stands.**
Six of the ten sources were uncommitted work when the owner stopped the
agents, saved as one "WIP snapshot" commit each. Nothing has been fixed
beyond what the merge needed to resolve and the tree needed to parse.

The ten source branches are kept on the remote as `archive/*`
(`archive/leftovers` and the nine `archive/a…`). GitHub refused to delete
the original `wip/*` names (HTTP 403), which is why this branch is called
`wip-all` and the originals are kept under `archive/`. Nothing was deleted.

### The merge commits (in merge order)

| # | Source branch | Merge commit | Workstream |
|---|---|---|---|
| 1 | `archive/leftovers` | `d4b90d6` | launch leftovers: build-time landing figures, sitemap, rail descriptions, legal pages |
| 2 | `archive/ac7bac5586116f143` | `306c016` | On set: WhatsApp call sheet, sunrise/sunset, route sheet |
| 3 | `archive/a8500da1354391964` | `3e89b7f` | Schedule: DPR, one-liner, banners, equipment, offline shoot pack |
| 4 | `archive/a40f499bfa0c512e8` | `19fa3d4` | Writing: Tamil typing, characters, starting drafts, table read |
| 5 | `archive/abc1d13439ac92b6b` | `8eeeb0f` | Revisions: compare, locked scene numbers |
| 6 | `archive/a55b1a0c890ccf84e` | `008dcf4` | AI: coverage, logline workshop, voice check |
| 7 | `archive/acc100544ab48cea5` | `f09931e` | Compliance: CBFC, dialogue list, runtime, OTT |
| 8 | `archive/ad27555771d505845` | `0b671ee` | Money: costs, petty cash, actuals, wages |
| 9 | `archive/a1db0236c653737b2` | `3b36efd` | Billing growth: schema §21–§23 |
| 10 | `archive/adb4de922f32dffae` | `ecfb9c3` | Growth UX: footer, tour, testimonials, public-link design |

After merge 10 there is one more commit, "Fix reports.js merge residue",
and then the commit that adds this file. (See §6: my own conflict
resolution damaged `reports.js`'s banner comment and left a stray marker;
the build caught it.)

## 2. Status table

Marks: **C** committed-and-working (gated by its own agent), **U**
written-unverified, **B** known-bug, **N** not-started. "Tests" lists what
exists in `scripts/`; results are in §7.

| Workstream | Features | Owning files | New keys / record fields | Schema | Tests | What remains |
|---|---|---|---|---|---|---|
| 1 Leftovers | build-time Dragon figures + tier names in start.html **C**; `/invite` out of sitemap **C**; rail stage descriptions **C**; legal pages (individual seller, no-refund policy with exceptions) **U** (not read in a browser after the edit) | `src/lib/sample-figures.js`, `src/lib/plans.js`, `start.html`, `vite.config.js`, `public/sitemap.xml`, `refund.html`, `terms.html`, `privacy.html`, `src/styles/legal.css`, `src/ui/shell.js`, `src/pages/hub/first-run.js` | none | none | none specific (verify, prove:gate, prove:billing, prove:sw) | read legal pages at 390/1280px both themes; scripts-off check of start.html; owner placeholders |
| 2 On set | WhatsApp send/share/copy on call sheet **C**; sun/golden hour (NOAA, offline) **C**; route and safety block **C**; Maps-link pins **C** | `src/lib/sun.js`, `callsheet-text.js`, `recce-geo.js`, `contacts.js`, `shootday.js`, `locations.js`, `src/pages/shoot.js`, `contacts.js`, `src/styles/contacts.css`, `shoot.css` | recce fields `lat lng hospital police`; call sheet field `wrap` | none | `test:sun`, `test:callsheet` | the four recce fields are not on the Plan page's recce card; after-sunset flag should also read the DPR's day-level wrap |
| 3 Schedule | day records (DPR, banners, kit, page target) **U**; stripboard banners + day-load warning **U**; reports one-liner, DPR, per-day equipment lists **U**; offline shoot pack (SW `FMS_PACK`) **U**; `prove:sw` assertion (h) **U** | `src/lib/dpr.js`, `locations.js`, `pwa.js`, `src/sw.js`, `src/pages/reports.js`, `stripboard.js`, `shoot.js`, `src/styles/reports.css`, `stripboard.css`, `scripts/prove-sw.mjs`, `test-stripboard.mjs` | inside `fms_locations_v1`: `dpr`, `banners`, `kit` (keyed by day number), `prefs.pageTarget` — **no new key** | none | `test:stripboard`, `prove:sw` | full gate never ran; confirm DPR reads `shotState` and never writes it; confirm no redirected response enters the cache |
| 4 Writing | opt-in Tamil-script typing **U**; "Keep as Tamil take" **U**; One-Pager/Treatment/Synopsis starting drafts **U**; characters as data + rename-everywhere **U**; table read **U** | `src/ui/tamil-type.js`, `characters-panel.js`, `alt-lines.js`, `smarttype.js`, `src/lib/characters.js`, `tanglish.js`, `write-keys.js`, `story.js`, `src/pages/write.js`, `src/styles/write.css` | **`fms_characters_v1`** | cloud scope CHECK still to add (local-only for now) | `test:tanglish`, `test:keys`, `test:story`, `test:screenplay` (characters block) | its verify was running when stopped; Tamil font must stay LAST in `--f-script`; Enter-paint ~30 ms |
| 5 Revisions | revision compare (word-level diff) **U**; revised pages (asterisks, colour name, optional tint) **U**; locked scene numbers (12A, OMITTED) through `scene-sync.js` **U**; the `Element.append(null)` bug **B** (see below) | `src/lib/script-diff.js`, `script.js`, `screenplay-export.js`, `scene-sync.js`, `src/ui/write-revisions.js`, `handoff.js`, `src/pages/write.js`, `breakdown.js`, `src/styles/write-revisions.css`, `modules.css`, `tokens.css` | `numbering` inside the script blob (`fms_script_v1`); `liveId` on a revision's elements | none | `scripts/test-revisions.mjs` (**no npm script**) | the bug; AA walk after the `tokens.css` edit; screen and PDF must paginate identically; one stale assertion in `test-screenplay.mjs` |
| 6 AI | whole-script coverage report **U**; logline workshop **U**; character voice check — code **U**, UI is in `coverage.js` (RESUME said "no UI"; the file now mentions voice 51 times) **U** | `src/lib/ai.js`, `src/ui/coverage.js`, `logline-workshop.js`, `src/pages/story.js`, `write.js`, `src/styles/coverage.css`, `scripts/fake-ai.mjs`, `prove-ai-coverage.mjs`, `test-ai-coverage.mjs` | none (results are in memory only) | none | `test-ai-coverage.mjs`, `prove-ai-coverage.mjs` (**no npm scripts**) | run `prove-ai-coverage` for both providers; confirm `ai.js` stays out of first paint; verify |
| 7 Compliance | CBFC sensitivity flags **U**; dialogue list CSV/SRT skeleton **U**; song duration + target runtime **U**; OTT optional groups (Aha, Sun NXT, ZEE5 as user-filled) **U** | `src/lib/cbfc.js`, `src/data/cbfc-rules.json`, `dialogue-list.js`, `screenplay-analysis.js`, `songs.js`, `deliverables.js`, `src/data/deliverables.json`, `src/pages/deliverables.js`, `reports.js`, `src/styles/deliverables-tools.css`, `runtime.css` | target runtime inside the songs blob (`fms_songs_v1`), song `duration`; **new deliverable ids are storage keys** | none | `test:delivery`, `test:post`, `test:screenplay` | verify every CBFC/AWBI/OTT fact against its source; rating output must read as a hint; verify |
| 8 Money | petty cash + floats **U**; budget vs actuals **U**; crew payments, advances, GST/TDS **U**; top sheet **U**; FEFSI wage table **U**; Movie-Magic-style CSV export **U** | `src/lib/costs.js`, `src/ui/budget-costs.js`, `budget.js`, `tabs.js`, `src/pages/budget.js`, `src/data/wages.fefsi.json`, `src/styles/budget.css` | **`fms_costs_v1`** | cloud scope CHECK still to add | `test:costs` | never exercised in a browser; walk each tab on the Dragon sample; confirm export/import round trip |
| 9 Billing growth | §21 upgrade by difference **U**; §22 referral codes + credits ledger **U**; §23 affiliate codes + commission report **U**; GST invoices, gift licence, edu licence, lead capture, funnel counts **N** | `supabase-schema.sql`, `supabase/functions/rzp-order/index.ts`, `src/lib/growth.js`, `src/ui/growth-admin.js`, `growth-panels.js`, `plan-cards.js`, `billing-admin.js`, `src/pages/settings.js`, `admin.js`, `src/styles/growth.css`, `scripts/fake-supabase.mjs`, `prove-billing.mjs`, `scripts/schema-tests/{upgrade,referral,affiliate}.sql` | `fms_no_analytics_v1` planned, not built | §21, §22, §23 | `test:schema` | docs for §23; live checks; items §24 onward; update `fake-supabase.mjs` per RPC |
| 10 Growth UX | footer + "Made with" line **U**; onboarding tour + first-week checklist **U**; testimonials (ships EMPTY) **U**; WhatsApp support link **U**; public read-only share link **design only, OFF** | `src/ui/footer.js`, `tour.js`, `src/data/tour.json`, `testimonials.json`, `src/lib/public-view.js`, `public-view-model.js`, `pitch-deck.js`, `plan-gate.js`, `src/pages/screening.js`, `settings.js`, `start.html`, `src/styles/footer.css`, `tour.css`, `print.css`, `screening.css`, `start.css` | **`fms_tour_v1`** (device); `branding: 'off'` inside existing `fms_studio_prefs_v1` | public-link SQL is a proposal only | `test:testimonials`, `prove:growth` | tour must write nothing while idle; `prove:gate` for the screening room; `prove:billing` |

## 3. Per workstream

### 3.1 Leftovers + legal pages (`archive/leftovers`, `d4b90d6`)

**Goal.** Tidy launch leftovers: start.html's Dragon figures and tier
names must come from one source instead of being typed; keep `/invite`
out of the sitemap; give the rail's stage drawer descriptions; make the
legal pages say the owner is an individual seller with a no-refund policy
plus the exceptions processors require; record the confirmed host.

**What exists.**
- `src/lib/sample-figures.js` — the Dragon sample's figures, one source.
- `src/lib/plans.js` — tier names/prices, one source (read by `billing.js`).
- `start.html`, `vite.config.js` — figures and tiers stamped at BUILD time (`fms-start-figures`) so they are in the markup for crawlers.
- `public/sitemap.xml` — `/invite` removed.
- `src/ui/shell.js` — rail stage drawer descriptions.
- `refund.html`, `terms.html`, `privacy.html`, `src/styles/legal.css` — legal copy.
- `src/lib/scenes.js`, `locations.js`, `src/pages/hub/first-run.js` — small edits.
- `CLAUDE.md` row 18 updated (confirmed host, build-time figures, purchases final bar three exceptions). **Kept** (merged without conflict).
- `docs/KNOWN-ISSUES.md`, `docs/LAUNCH.md` edits.

**Decisions.** Purchases are final except: duplicate charge, charged but
not delivered, and where Indian law requires. The webhook's refund
HANDLING stays. `thefilmmakerstudio.vercel.app` is the confirmed host (a
custom domain later needs the same ten files + Vercel + Google authorised
origins, LAUNCH §7). The legal pages keep words in markup, load no skin,
and are not in the gate.

**Known bugs.** None known; the legal edit was never re-verified.

**Resume brief.** "On `wip-all`, finish the leftovers: build with
`VITE_SITE_GATE=off`, run verify and list wording diffs (settings, invite,
admin are acceptable); gated build then `prove:gate`, `prove:billing`,
`prove:sw`, `test:billing`; read refund/terms/privacy at 390 and 1280px in
both themes; check start.html with scripts off shows the Dragon figures
and tier names; grep plan cards / invite / settings for any sentence that
still promises a refund window. Re-baseline only if every diff is a
deliberate copy change and data-keys move by zero. The owner fills
`[OWNER: full legal name]`, support e-mail, postal address, GSTIN."

### 3.2 On set (`archive/ac7bac…`, `306c016`)

**Goal.** A Tamil indie unit reads the production group on WhatsApp at
5am, not a PDF: send the call sheet as a message (whole unit or one
person with their own call time), show sunrise/sunset/golden hour on the
shoot day offline, and add a route and safety block with Maps-link pins.

**What exists.**
- `src/lib/callsheet-text.js` — pure: call sheet to a message; `wa.me` link is a navigation, not a fetch (CSP untouched); `WA_LIMIT` keeps text under ~4000.
- `src/lib/sun.js` — NOAA algorithm, no network, no clock; upper limb -0.833°, golden hour -4°..+6°; ±1.5 min against astral.
- `src/lib/recce-geo.js` — parse coordinates / Maps links; blank is "none", never 0,0.
- `src/lib/contacts.js`, `shootday.js`, `locations.js` — new recce fields `lat lng hospital police`, call sheet `wrap`.
- `src/pages/contacts.js`, `shoot.js`, `src/styles/contacts.css`, `shoot.css` — UI.
- `scripts/test-sun.mjs`, `test-callsheet.mjs`.

**Decisions.** Nothing here is stored that can be derived (a message and a
sunrise are views). No new storage key.

**Known bugs.** None. Left over: recce card on `plan.js` lacks the four
fields; after-sunset flag reads only the call sheet's `wrap`.

**Resume brief.** "Finished and gated by its agent (verify green, 72/72
and 71/71). Only remaining: add `lat lng hospital police` inputs to the
recce card in `src/pages/plan.js`, and make the after-sunset flag also
read the DPR's day-level wrap (`src/lib/dpr.js`) now that Schedule is
merged. Check shoot.js still behaves after the Schedule merge (both edit it)."

### 3.3 Schedule (`archive/a8500d…`, `3e89b7f`)

**Goal.** Give each shoot DAY its own records: a Daily Production Report,
stripboard banners (company move, travel, holding day, note) with a
per-day load warning, per-day equipment lists, a printable one-liner, and
an offline shoot pack.

**What exists.**
- `src/lib/dpr.js` — shapes and derivations; DPR times/setups/weather/delays/incidents STORED; planned vs shot DERIVED, reading `shotState`, never writing it.
- `src/lib/locations.js` — `DAY_RECORDS = ['dpr','banners','kit']` inside `fms_locations_v1`, keyed by day number; `prefs.pageTarget`.
- `src/pages/stripboard.js` + `stripboard.css` — banners, one-row layout, hours over a working day flagged; bare company move reads without "? → ?".
- `src/pages/reports.js` + `reports.css` — one-liner, DPR, equipment lists.
- `src/lib/pwa.js`, `src/sw.js` — `FMS_PACK` message keeps shoot pages under both addresses offline.
- `scripts/prove-sw.mjs` assertion (h); `test-stripboard.mjs` additions.

**Decisions.** `shoot.html` remains the only view that writes to a scene.
No new storage key. SW must never answer a navigation with a redirected
response (CLAUDE.md SW trap).

**Known bugs.** Unknown: the full gate never ran on this work.

**Resume brief.** "Run `verify`, `test:stripboard`, `prove:sw`,
`prove:storage` on `wip-all`. Confirm the DPR reads `shotState` and never
writes it; confirm no redirected response enters the cache (read the SW
trap in CLAUDE.md first; `clean()`, `precacheAll()`, `matchUsable()`).
Check reports.js after the Compliance merge (both added imports there)."

### 3.4 Writing (`archive/a40f49…`, `19fa3d4`)

**Goal.** Let a Tamil writer type Tamil script in dialogue and
parentheticals (opt-in), keep a Tamil take, start One-Pager / Treatment /
Synopsis from a draft, and treat characters as data with rename-everywhere
and a table read.

**What exists.**
- `src/ui/tamil-type.js` — romanised in, Tamil out per word; Space/Return commit, arrows choose, Esc keeps Roman, Alt+T toggles. Only dialogue and parenthetical.
- `src/lib/tanglish.js` (`tamilCandidates()`), `src/ui/smarttype.js`, `write-keys.js`, `alt-lines.js` — supporting edits and "Keep as Tamil take".
- `src/lib/characters.js`, `src/ui/characters-panel.js` — cues are the truth about who speaks (derived, never stored); what the writer says about them is stored; never auto-deleted; `renamePlan`, `mergeWithCues`, `tableRead`.
- `src/lib/story.js` — starting drafts.
- `src/pages/write.js`, `src/styles/write.css`.
- Registry edits for `fms_characters_v1` (store, backup, hub, cloud LOCAL_ONLY).

**Decisions.** Headings, action, cues and transitions stay on the Latin
grid (a Tamil cue would break the cast matrix, breakdown and call sheet,
and page count). `--f-script` must keep its Tamil face LAST.

**Known bugs.** None known.

**Resume brief.** "Run `verify`, `test:tanglish`, `test:keys`,
`test:format`, `test:story`, `test:screenplay`; confirm the Tamil font is
last in `--f-script`; measure Enter-paint on write.html (~30 ms median);
add a schema section widening the cloud scope CHECK for
`fms_characters_v1` or leave it LOCAL_ONLY deliberately. write.js now also
carries Revisions and Coverage mounts: check all three still coexist."

### 3.5 Script revisions (`archive/abc1d1…`, `8eeeb0f`) — uncommitted at stop

**Goal.** Compare two revisions (or a revision with the live script),
print revised pages with asterisks in the margin and the revision colour
named in the PDF, and lock scene numbers so inserted scenes become 12A and
deleted ones OMITTED.

**What exists.**
- `src/lib/script-diff.js` — pure, nothing stored; pairs by identity (`liveId` recorded by `makeRevision()`) then by text; ops same/changed/moved/added/removed.
- `src/ui/write-revisions.js` — Compare, Revised pages, Scene numbers panels; `mountRevisionTools` / `renderRevisionTools`.
- `src/lib/script.js` — `numbering` inside the script blob, `isNumberingLocked`, `paginateDoc` hook.
- `src/lib/screenplay-export.js` — marks and colour names through `paginate()`.
- `src/lib/scene-sync.js`, `src/pages/breakdown.js`, `src/ui/handoff.js` — numbers into scene rows.
- `src/styles/write-revisions.css`, `modules.css`, `tokens.css` (token edit needs the AA walk).
- `scripts/test-revisions.mjs`.

**Decisions.** A comparison is a view and is never stored. "Only scenes
with no `scriptElId` are hand-editable" must survive locked numbers.
Screen and PDF must come from one paginator.

**Known bugs.** (1) The `Element.append(null)` bug that was being fixed
at stop: `write-revisions.js` line ~158 now has a "Filtered:" comment and
spreads a filtered array, so it looks fixed, but nothing was run in a
browser. Grep the file's other `.append(` calls and verify the revision
view. (2) `scripts/test-screenplay.mjs` still asserts
`/Typeset\.paginate\(doc\.elements\)/` in `write.js`; the page now calls
`Typeset.paginateDoc(doc)` (1 failing assertion; the assertion is stale,
update it deliberately).

**Resume brief.** "Run the revision view in a browser on a script with
2+ revisions; confirm no literal 'null' text; confirm the page view and
the PDF paginate identically with locked numbers; update the stale
`test-screenplay.mjs` assertion to `paginateDoc`; add npm scripts
`test:revisions`; run the AA walk (verify) for the `tokens.css` edit; run
`test:sync test:format test:keys test:import test:pdf test:screenplay`."

### 3.6 AI (`archive/a55b1a…`, `008dcf4`) — uncommitted at stop

**Goal.** A reader's coverage report on the whole script, a logline
workshop on story.html, and a character-voice check — all
bring-your-own-key, nothing sent without a click.

**What exists.**
- `src/lib/ai.js` — `coverageScenes`, `planCoverage`, `buildCoverageBatchPrompt`, `coverageBatch`, `coverageSynthesis`, `runCoverage`; `LOGLINE_PARTS`, `loglineWorkshop`; `planVoiceCheck`, `buildVoicePrompt`, `voiceCheck`.
- `src/ui/coverage.js` — the Coverage tab (report + voice check), one import and one mount in `write.js`.
- `src/ui/logline-workshop.js` — mounted from `src/pages/story.js`.
- `src/styles/coverage.css`; `scripts/fake-ai.mjs`, `prove-ai-coverage.mjs`, `test-ai-coverage.mjs`.

**Decisions.** A quotation that is not word for word in the script is
stripped and counted (AI quotes must be verbatim). AI never overwrites the
writer's text without an explicit accept; suggested rewrites go into
`alts`, never the active take; the logline's old text goes into an Undo
toast. Results are in memory only. The panel states what will be sent,
where, and roughly what it costs before the button (tokens ≈ chars ÷ 4;
Tamil runs higher). Two gates: key, then scene headings. Both providers go
through the one `callModel()`; key in header, never `?key=`.

**Known bugs.** None known; nothing has been run in a browser.

**Resume brief.** "Run `node scripts/prove-ai-coverage.mjs` against the
fake for BOTH providers (LF and CRLF frames, a Gemini `thought` part, a
fabricated quote that must be stripped); register npm scripts
(`test:ai-coverage`, `prove:ai-coverage`); confirm the voice check's
rewrites land in `alts` through the existing alt-lines path; keep `ai.js`
out of first paint (budget); run verify."

### 3.7 Compliance (`archive/acc100…`, `f09931e`) — uncommitted at stop

**Goal.** Certification and delivery help for Indian releases: CBFC
sensitivity flags read off the script, a numbered dialogue list for the
subtitler (CSV, SRT skeleton), running time including songs against a
target, and OTT delivery groups.

**What exists.**
- `src/lib/cbfc.js` + `src/data/cbfc-rules.json` — pure, rule-based, no AI; every rule carries `source`, `sourceUrls`, `checked` (all dated 2026-10-07); ratings U / UA 7+ / UA 13+ / UA 16+ / A (Cinematograph Amendment Act 2023, Rules 2024); Tamil terms romanised plus a short `taScript` list.
- `src/lib/dialogue-list.js` — one row per dialogue element; cold-open lines kept; scene numbers via `matchScenes()`.
- `src/lib/screenplay-analysis.js` (`runtimeEstimate`), `songs.js` (`duration`, target runtime inside the songs blob), `src/pages/reports.js`, `src/styles/runtime.css`.
- `src/data/deliverables.json` — OTT optional groups; Aha, Sun NXT, ZEE5 are user-filled templates because no public spec was found (checked 7 Oct 2026).
- `src/lib/deliverables.js`, `src/pages/deliverables.js`, `src/styles/deliverables-tools.css`.
- `scripts/test-delivery.mjs`, additions to `test-post.mjs` and `test-screenplay.mjs`.

**Decisions.** CBFC rules need sources; the likely-rating line is the
app's own hint, never the Board's criteria; the page says it is a word
search, not legal advice. Never rename an existing deliverable id.

**Known bugs.** None known. Every fact is unverified against its source.

**Resume brief.** "Re-verify each CBFC / AWBI / OTT rule against its
`sourceUrls` and update `checked`; keep Aha / Sun NXT / ZEE5 user-filled;
confirm the rating output reads as a hint; run verify and the three test
files above."

### 3.8 Money (`archive/ad2755…`, `0b671ee`) — uncommitted at stop

**Goal.** The budget's other half: petty cash, expenses against the
estimate, crew fees and advances (GST/TDS), a top sheet, a wage table
starting point, and a Movie-Magic-style CSV export.

**What exists.**
- `src/lib/costs.js` — one per-project key `fms_costs_v1` with `expenses`, `floats`, `crew` collections (+ contingency, department map, user wage figures); registered in store/backup/hub/cloud LOCAL_ONLY.
- `src/ui/budget-costs.js` — the tabs; views only, every total recomputed on render; commits on `change`; nothing writes on load.
- `src/ui/budget.js`, `src/pages/budget.js`, `src/ui/tabs.js`, `src/styles/budget.css`.
- `src/data/wages.fefsi.json`, `scripts/test-costs.mjs`.

**Decisions.** The wage table is "a starting point for a fee, never a
floor" and **must stay labelled "last published, 2022 MoU, expired —
confirm with your union"** (the FEFSI–TFPC MoU expired 9 Mar 2025; per-craft
`bata` fields are null on purpose; the single figure is `general`).
Money parsing only through `src/lib/money.js`. The estimator
(`fms_library_calc_v1`) is the plan; costs are separate.

**Known bugs.** None known; never run in a browser.

**Resume brief.** "Open budget.html on the Dragon sample and walk every
tab (petty cash, cost report, crew payments, top sheet, wage table,
export). Confirm `fms_costs_v1` survives export and import (`prove:storage`
and the verify round trip). Confirm no raw colour and no second money
parser (`grep -rn 10000000 src`). Decide whether to give the key a cloud
scope."

### 3.9 Billing growth (`archive/a1db02…`, `3b36efd`)

**Goal.** Growth through the purchase path, owner's asks of 7 Oct 2026:
upgrade by paying the difference; referral codes with credits; affiliate
codes for film schools / YouTubers / festival desks with a commission
report; then (not started) GST invoices, gifts, edu licences, lead capture
and funnel counts.

**What exists.**
- `supabase-schema.sql` §21 (upgrade), §22 (referral codes are promo codes + a credits ledger), §23 (affiliate codes, derived commission report). All headed "NOT YET RUN against conhlrulxfwkhsnymakz".
- `supabase/functions/rzp-order/index.ts` — returns `credit_paise`.
- `src/lib/growth.js` — browser half; reads and asks, never computes money. Its header already names §24–§28 (GST invoices, gifts, edu seats, leads, funnel counts) which **do not exist in the schema** — it is a plan.
- `src/ui/growth-admin.js`, `growth-panels.js`, `plan-cards.js`, `billing-admin.js`; `src/pages/settings.js`, `admin.js`; `src/styles/growth.css`.
- `scripts/schema-tests/{upgrade,referral,affiliate}.sql`, `scripts/test-schema.mjs`, `scripts/fake-supabase.mjs`, `scripts/prove-billing.mjs`.
- `docs/BILLING.md`, `docs/SECURITY-RLS.md` edits (§23 docs unfinished).
- The debug file `scripts/.dbg-growth.mjs` was removed (`git rm`) in the merge.

**Decisions.** Price is read server-side; `promo_codes` has no client
access (only `quote_order` and the 5-arg `create_pending_payment` touch
it). Seller is an individual: invoices (when built) are "Bill of Supply".
Planned shapes: GSTIN checksum, FY sequence `FMS/2026-27/000123`.
`fms_no_analytics_v1` (opt-out for first-party counts) is planned.

**Known bugs.** None known; live checks all unrun.

**Resume brief.** "Finish the §23 docs (`docs/BILLING.md`,
`docs/SECURITY-RLS.md` live checks). Start Postgres
(`pg_ctlcluster 16 main start`), run `npm run test:schema`, `test:billing`,
then a gated `npm run build` + `prove:billing` + `prove:gate`. Then build
§24 onward (GST invoices, gift licence, edu licence, `leads`, `events`),
one schema section each, updating `fake-supabase.mjs` for each new RPC.
Only one agent may write schema sections at a time."

### 3.10 Growth UX (`archive/adb4de…`, `ecfb9c3`) — uncommitted at stop

**Goal.** Branding and onboarding: a footer and a "Made with
FilmMakerStudio" line on documents that leave the studio, a first-run tour
with a hub checklist, a testimonials section that never invents anything,
a WhatsApp support link, and a design for a public read-only share link.

**What exists.**
- `src/ui/footer.js` — site footer (appended after `#app`), the "Made with" line on pitch deck PDF / screening room / printed call sheet; paid plans may switch it off (`branding: 'off'` inside `fms_studio_prefs_v1`; `plan-gate.js` rule: a missing `remove_branding` key is ALLOWED); WhatsApp help line from `VITE_SUPPORT_WHATSAPP` (digits).
- `src/ui/tour.js`, `src/data/tour.json`, `src/styles/tour.css` — lazy chunk; `fms_tour_v1` holds only `{ v, active, step, dismissed, finished, hideList }`, written only on a click or key; the checklist ticks are derived from the film's models, never stored.
- `src/data/testimonials.json` — **ships EMPTY on purpose**; adding one needs written consent and a verbatim quote; entries are copied by hand into start.html's `#voices`. `scripts/check-testimonials.mjs`.
- `src/lib/public-view.js`, `public-view-model.js`, `src/pages/screening.js` (`#view=` only when `VITE_PUBLIC_VIEW=on`), `scripts/prove-growth.mjs` — a public link is a SNAPSHOT rendered in the owner's browser (pitch or call sheet), with `PRIVATE_KEYS` scrubbing; **no page offers a way to create one**; the server half is a proposal and is NOT in `supabase-schema.sql`.
- `src/lib/pitch-deck.js`, `plan-gate.js`, `src/styles/footer.css`, `print.css`, `screening.css`, `start.css`, `start.html`.
- The scratch file `scripts/scratch-tour-walk.mjs` was removed in the merge.

**Decisions.** Public share link is OFF and stays a proposal until a
security review. Testimonials are never invented. The tour writes nothing
while idle. The footer's year is a fact, not a clock.

**Known bugs.** None known; unverified.

**Resume brief.** "Run verify (the tour must write nothing in four idle
seconds; `fms_tour_v1` is in ALL_KEYS and GLOBAL_KEYS), then gated
`prove:gate` (screening room) and `prove:billing`, plus
`test:testimonials` and `prove:growth`. Do not add public-link SQL to the
schema. Do not add testimonial content."

## 4. Storage keys (derived from the merged `store.js`, `backup.js`, `hub.js`, `cloud.js`)

| Key | Scope | Registries touched | Cloud scope CHECK needed? |
|---|---|---|---|
| `fms_characters_v1` | per project | `SCOPED_KEYS` (store.js), `PROJECT_KEYS.characters` (backup.js), `ALL_KEYS` via `CHARACTERS_KEY` (hub.js), `LOCAL_ONLY` (cloud.js) | yes, to sync; currently local-only |
| `fms_costs_v1` | per project | `SCOPED_KEYS`, `PROJECT_KEYS.costs`, `ALL_KEYS` via `COSTS_KEY`, `LOCAL_ONLY` | yes, to sync; currently local-only |
| `fms_tour_v1` | device | `GLOBAL_KEYS.tour` (backup.js), `ALL_KEYS` via `TOUR_KEY` (hub.js) | no |
| `fms_no_analytics_v1` | device | none — planned only, not built | no |

No other key was added. Everything else is a new field inside an existing
record: recces `lat lng hospital police`; call sheet `wrap`;
`fms_locations_v1` `dpr` / `banners` / `kit` / `prefs.pageTarget`; script
blob `numbering` and revision elements' `liveId`; songs blob `duration`
and target minutes; `fms_studio_prefs_v1` `branding`.

Also in the merged tree but not storage keys: `VITE_SUPPORT_WHATSAPP`
(digits, country code) and `VITE_PUBLIC_VIEW=on` are build settings.

## 5. Schema sections (`supabase-schema.sql`)

| § | What | Run live? | Tests |
|---|---|---|---|
| §1–§14 | existing | yes, on `conhlrulxfwkhsnymakz` | — |
| §16 | billing: plans, Razorpay payments, limits | **no** | `test:schema`, `billing.sql` |
| §17 | two more sync scopes: edit, deliverables | **no** | `test:schema` |
| §18 | full-time access (subscription withdrawn) | **no** | `test:schema` |
| §19 | accounts INSERT hole (guard BEFORE INSERT OR UPDATE) | **no** | `accounts.sql` |
| §20 | promo codes, priced server-side | **no** | `promo.sql` |
| §21 | upgrade by paying the difference | **no** | `upgrade.sql` |
| §22 | referral codes, credits ledger | **no** | `referral.sql` |
| §23 | affiliate codes, derived commission report | **no** | `affiliate.sql` |

**No renumbering was needed:** only the billing branch touched the schema
file, so §21–§23 did not collide. **Next free number is §24.** Nothing
here widens the scope CHECK for `fms_characters_v1` / `fms_costs_v1`; that
is one more section (see §8 item 2). `src/lib/growth.js` mentions §24–§28
that do not exist.

## 6. Merge log

| Merge | Conflicts | Resolution |
|---|---|---|
| 1 `archive/leftovers` | none | `CLAUDE.md` row 18 changed by the branch; it did not conflict so it was **kept** (it is a one-row factual update). `docs/KNOWN-ISSUES.md`, `docs/LAUNCH.md` edits kept. |
| 2 `ac7bac…` | none (`locations.js` auto-merged) | — |
| 3 `a8500d…` | none (`locations.js`, `shoot.js` auto-merged) | — |
| 4 `a40f49…` | none | Registered `fms_characters_v1` in store/backup/hub/cloud. |
| 5 `abc1d1…` | none (`write.js` auto-merged) | — |
| 6 `a55b1a…` | `src/pages/write.js` (2 hunks: import, mount) | Union: kept the revisions import + `mountRevisionTools({...})` AND the `mountCoverage` import + call. |
| 7 `acc100…` | `scripts/test-screenplay.mjs`, `src/pages/reports.js` | test file: kept both blocks (characters block, then runtime/songs block), closing brace added between them. reports.js: union of imports (Locations, Shoot, DPR, pwa vs songs, story, beat-outline, runtime.css). `package.json` auto-merged (`test:delivery`). |
| 8 `ad2755…` | `package.json`, `backup.js`, `cloud.js`, `store.js`, `hub.js` | Union everywhere: `test:costs` beside `test:sun`/`test:callsheet`; `PROJECT_KEYS` has `characters` and `costs`; `LOCAL_ONLY` has both; `SCOPED_KEYS` has both; hub has `CHARACTERS_KEY` and `COSTS_KEY` in the constants and in `ALL_KEYS`. |
| 9 `a1db02…` | none | `git rm -f scripts/.dbg-growth.mjs`. |
| 10 `adb4de…` | `package.json`, `hub.js`, `settings.js` | Union: `test:testimonials`; `ALL_KEYS` gets `TOUR_KEY` and keeps `CHARACTERS_KEY`, `COSTS_KEY`; `settings.js` keeps `memberGrowthPanels` import and the `planExtras` import, and both mounts (growth panels, then plan extras). `git rm -f scripts/scratch-tour-walk.mjs`. |
| fix | build error | My own conflict resolution in `reports.js` replaced the first `=======` it found — inside the file's `/* ====` banner — and left the real marker. Banner restored, marker removed. The same slip hit `test-screenplay.mjs` and was caught and redone before commit. |

### Discarded during merge

- **Nothing was discarded.** No hunk was dropped on any file.
- The rules said to ignore the branches' copies of `docs/FEATURE-IDEAS.md`, `docs/RESUME.md`, `scripts/baseline.json`, `scripts/budget.json`. None of the ten branches differed from `origin/main` on any of those four files after the merge-base diff, so there was nothing to discard (final diff vs `origin/main` for the four: empty).
- `CLAUDE.md` did not conflict, so nothing was discarded there; it carries merge 1's row-18 edit (see above).
- Removed on purpose (`git rm`): `scripts/.dbg-growth.mjs` (billing growth, debug) and `scripts/scratch-tour-walk.mjs` (growth UX, scratch).
- Dropped by RESOLUTION only: the duplicate `hub.js` `ALL_KEYS` line from each side was replaced by one line containing every key.

## 7. Build and test results

Environment: Node 22, run in the worktree `.claude/worktrees/wip-all`.

| Check | Command | Result |
|---|---|---|
| Build (open) | `VITE_SITE_GATE=off npx vite build --outDir dist-wip` | **builds** (after the reports.js fix). First attempt failed: `PARSE_ERROR Encountered diff marker` at `src/pages/reports.js:45`. Only warning: `INEFFECTIVE_DYNAMIC_IMPORT` for `backup.js` (static and dynamic import of the same module). SW precache 184 entries. |
| Syntax | `node --check --experimental-default-type=module` over every added/modified `.js/.mjs` vs `origin/main` | clean |
| `test-ai-coverage.mjs` | `node scripts/test-ai-coverage.mjs` | 99 passed, 0 failed (no npm script) |
| `test:beats` | | 112 / 0 |
| `test:billing` | | 50 / 0 |
| `test:callsheet` | | 71 / 0 |
| `test:costs` | | 75 / 0 |
| `test:delivery` | | 145 / 0 |
| `test:format` | | 73 / 0 |
| `test:import` | | 29 / 0 |
| `test:keys` | | 186 / 0 |
| `test:pdf` (`test-pdf-text.mjs`) | | 46 / 0 |
| `test:post` | | 76 / 0 |
| `test-revisions.mjs` | `node scripts/test-revisions.mjs` | 99 / 0 (no npm script) |
| `test:schema` | `node scripts/test-schema.mjs` | 217 checks passed, 0 failed (PostgreSQL was already running; `pg_ctlcluster 16 main start` was not needed) |
| `test:screenplay` | | **174 passed, 1 failed**: "write.js's page view reads the PDF's own paginate()" — stale after Revisions (`paginateDoc`) |
| `test:shots` | | 1016 / 0 |
| `test:story` | | 230 / 0 |
| `test:stripboard` | | 116 / 0 |
| `test:sun` | | 72 / 0 |
| `test:sync` | | 69 / 0 |
| `test:tanglish` | | 57 / 0 |
| `test:testimonials` | | 9 / 0 |
| `verify` | `VERIFY_DIST=dist-wip VERIFY_PORT=5901 PW_CHROMIUM=/opt/pw-browsers/chromium npm run verify` | **did not finish**: I capped the run at 590 s and it was killed during the contrast (AA) sweep (`Target page, context or browser has been closed` at `verify-migration.mjs:2259`, a timeout artefact, not a finding). Before that it passed the Tanglish, `arunak_`, fill-as-text, `--f-script`, sidecar, festival-countdown and scripts-off-palette checks and printed the per-page weight table, in which `reports` (641.2 KB), `budget` (580.1 KB), `deliverables` (614.7 KB) and `write` (882.2 KB) read higher than the figure beside them (598.0 / 558.0 / 573.0 / 880.0, apparently `scripts/budget.json`) — a real first-paint growth to look at. Re-run without a time cap |

Not run (by instruction or because the tree is unfinished): `prove:*`,
gated build. Reproduce all: `npm install && git checkout package-lock.json`,
then each command above.

**Real feature problems found, deliberately not fixed:**
1. `test-screenplay.mjs` stale assertion (above).
2. `test:revisions`, `test:ai-coverage`, `prove:ai-coverage` have no `package.json` scripts.
3. `src/lib/growth.js` describes §24–§28 that are not in the schema.
4. `docs/RESUME.md` says the voice check has no UI; `coverage.js` appears to include it.
5. `INEFFECTIVE_DYNAMIC_IMPORT` warning on `backup.js` (check against `origin/main` whether it is new).

## 8. Integration checklist, ideas, decisions, limits

> **Start at `docs/HANDOFF.md`.** Planned, not started: the emotional-craft layer →
> `docs/WIP-EMOTION-PLAN.md` (built on top of this branch, Phase 0 first).

### Checklist (updated from `docs/RESUME.md`)

1. Fix the known problems in §7; work each workstream's resume brief in §3. `wip-all` carries all ten merged, so the per-branch merge step of the old list is done.
2. **One schema section** (§24 or the next free number, written by a single agent) widening the Supabase scope CHECK for `fms_characters_v1` and `fms_costs_v1`; then move each out of `LOCAL_ONLY` into `SCOPE_BY_KEY` in `cloud.js` in the same commit. Billing's §24+ items (invoices, gifts, edu, leads, events) take the numbers after it — decide the order first.
3. Full gate: every `test:*` (add the three missing npm scripts); `prove:storage`, `prove:drive`, `prove:sw`, `prove:extension`; gated `build` + `prove:gate` + `prove:billing` (+ `prove:growth`, `prove-ai-coverage`); `verify` on the open build. Read the failures; only deliberate copy changes are acceptable.
4. Re-baseline only with zero data-key movement on every page; recapture `scripts/budget.json` (`npm run verify -- --budget`) only if growth is justified and listed. Neither file was touched on this branch.
5. Update `docs/FEATURE-IDEAS.md` statuses, the `CLAUDE.md` table (new rows for the workstreams, new keys in the key notes), `docs/HISTORY.md` (item 19), `docs/LAUNCH.md` (schema sections to run, in order), prune `docs/KNOWN-ISSUES.md`.
6. Merge to `main`. Do not delete the `archive/*` branches without the owner.

### Queued ideas nobody started

| Idea | Waits for |
|---|---|
| Monsoon weather flag on outdoor days (external API: `connect-src` in BOTH `vercel.json` and `netlify.toml`) | On set (merged here) |
| Script-notes overview (`src/ui/comments.js`) | Revisions + Writing (both merged here) |
| Writing-goal history synced across devices (`fms_write_goals_v1`) | Writing |
| Paid template / sample-pack plumbing (one free original starter; no real people, no reproduced scripts) | Billing + Growth |
| Billing items 4–8: GST invoices (GSTIN checksum, FY sequence, Bill of Supply), gift licence, film-school (edu) licence, landing-page e-mail capture (`leads`), first-party funnel counts (`events`, no personal data, opt-out) | Billing agent; schema §24+ |

### Owner decisions pending

- **Tamil-script UI labels** — reverses `lang.js`'s English-labels design; not decided.
- **Legal placeholders:** `[OWNER: full legal name]`, the support e-mail, the postal address, `[OWNER: GSTIN, if registered]` in the legal pages.
- Whether `fms_characters_v1` / `fms_costs_v1` should sync to the cloud at all.
- Public read-only link: stays off until a security review.
- Google consent screen is still in Testing; no Razorpay key exists.

### Environment limits

The container cannot reach `*.supabase.co`, `api.supabase.com` or
`api.razorpay.com`, and has no Google credential: nothing here has met a
live database, a live Razorpay account or Google's consent screen
(schema §16–§23 are unrun live; live RLS checks unrun). GitHub **branch
deletion returns 403**, so the `wip/*` names on the remote cannot be
deleted — hence `wip-all`, with the originals kept as `archive/*`. GitHub
pushes can return transient 500s: retry with 5/10/20/30 s backoff. Browser
runs need `PW_CHROMIUM=/opt/pw-browsers/chromium`; use your own
`VERIFY_PORT` / `PROVE_PORT` (5901–5909 were used for this pass).

## 9. How to continue

```bash
cd /home/user/ak_filmmaker_studio          # the main checkout
git fetch origin
git worktree add .claude/worktrees/<name> -b <name> origin/wip-all
cd .claude/worktrees/<name>
npm install && git checkout package-lock.json
export PW_CHROMIUM=/opt/pw-browsers/chromium
```

Hand a workstream to a fresh agent with its resume brief from §3 plus the
common rules below. Work on a branch off `wip-all`, never on `main`.

### Common rules for every agent (from `docs/RESUME.md`)

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
