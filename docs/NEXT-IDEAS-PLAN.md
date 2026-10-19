# Next ideas: the plan (12 Oct 2026)

Twenty ideas from the post-revamp list, put in order, with what each one touches, what it
costs, what could go wrong, and what only the owner can decide.

Last reviewed: 2026-10-19

> **Status, 19 Oct 2026: Phases 1 and 2 are BUILT; Phase 0 is partly done; Phase 3 is OPEN
> (nothing built, every item still waits for an owner decision).** Checked against the code and
> `git log`; the body below is the original plan text, kept as the record.
>
> | Item | Status | Where |
> |---|---|---|
> | 0.1 recapture the baseline | Done, and repeated deliberately after later merges | `0dc034d`, `7ec6bf3`, `1a98756`, `1e5569e` |
> | 0.2 run the blind-edited proofs | Superseded by the release gates (see `ff9668a`); `prove:storage`/`prove:drive` still cannot run in the sandbox (proxy). Not re-verified here | `docs/HANDOFF.md` |
> | 0.3 `prove:preprod` | **Not built** (no such script; `prove:walk` and `prove:nav` cover other walks) | `package.json` |
> | 0.4 dead-code sweep | Not verified | n/a |
> | 1.1 Today line | Built (`src/pages/hub/today-line.js`), then **switched off on Home on 17 Oct** (`8124b03`): `#todayLine` stays hidden, the module is kept and can be mounted again | `src/pages/hub.js` |
> | 1.2 dashboard card shows the path | Built (lazy `preprod-path.js` in `dashboard.js`) | `4007879` |
> | 1.3 search lands on the script line | Built (`screenplay.html#line-<id>`; the page is `screenplay.html`, not `script.html`) | `3e98ff2`, `src/ui/palette.js` |
> | 1.4 search prefixes and recents | Built (`>` `#` `@`, in-memory recents) | `3e98ff2` |
> | 1.5 scene list keyboard flow | Built | `3d5c0a5` |
> | 1.6 shoot-day stripe | Built (`.bd-sl-day`) | `3d5c0a5` |
> | 1.7 saved filters (in memory) | Built (`.bd-sl-preset`, kept until reload) | `3d5c0a5` |
> | 1.8 backup health badge | Built (`src/ui/topbar-backup.js`) | `4007879` |
> | 1.9 plan usage in the Account tab | Built (`usageList()` in `settings.js`) | `4007879` |
> | 2.1 drag to reorder scenes | Built | `3d5c0a5` |
> | 2.2 ready-to-shoot PDF | Built (`src/lib/ready-pdf.js`, `ready-sheet.js`, `test:ready-sheet`) | `7216c43` |
> | 2.3 sunrise/sunset on the recce | Built (`plan.js` recce card) | `7216c43` |
> | 2.4 restore preview for Drive backups | Built (`test:backup-summary`) | `88de40f` |
> | 2.5 referral on the Purchase page | Built (referral panel and link) | `88de40f` |
> | 3.1 to 3.5 | **Open.** No path-notes key, no stored filters, no clone-a-path, no weekly e-mail, no receipt-resend RPC. `RESEND_API_KEY` / `MAIL_FROM` are still unset (`docs/HANDOFF.md` B14) | n/a |
>
> Later changes that touch the wording below: the Breakdown page is now a catalog panel plus filter deck
> (Celtx lane, 17 Oct), the tool-page strip is "one frame per page", and `docs/HISTORY.md` items 48 to 51 are the record.

## How to read this

- **Size:** S = under half a day, M = about a day, L = several days or needs the owner.
- **Storage:** every idea says whether it adds a storage key. A new key is a contract with
  people's saved work (CLAUDE.md invariant 1), so those items wait for a decision.
- **Gate:** the page-text baseline for `verify` has to be recaptured once after the UI
  revamp. Phase 0 does that first, so later work is judged against a clean baseline.
- **Branching:** each phase is one branch off `develop`, merged to `develop` in one push,
  the way the revamp was. Docs-only commits may go straight to `main`.

## Phase 0: make the revamp trustworthy (do first, about one day)

| # | Work | Size |
|---|------|------|
| 0.1 | Recapture the `verify` baseline (`npm run build:open && npm run baseline`) after reading the diff of words that moved. Needs the owner's yes for one `verify` run. | S |
| 0.2 | Run the proofs that were edited blind: `prove:billing`, `prove:admin-people`, `prove:gate`, `prove:growth`, `prove:drive`. Fix what they find. | M |
| 0.3 | One new browser proof, `prove:preprod`: open the sample, walk the Pre-production path, filter the scene list, bulk-bin two scenes and undo, search for a place and a script line. Fails on console errors and 390px overflow. | M |
| 0.4 | Dead-code sweep: unused `askDanger`/`ask` imports, orphaned `.bd-scene` card rules in `modules.css`, `BRAND` import in `hub.js`, stale comments on the old Appearance menu. | S |

Done when: GitHub Gate is green on `develop`.

## Phase 1: quick wins that store nothing (about three days)

All of these read existing models or keep state in memory for the page view only, so none
adds a storage key and none writes while idle.

| # | Idea | What to build | Files | Size |
|---|------|---------------|-------|------|
| 1.1 | **"Today" line on Home** | One line above the projects: the open film's next unfinished step with one button. Reads `pathSteps()`/`nextStep()`. Loaded after first paint (dynamic import) so Home's first-paint budget holds. | `src/pages/hub.js`, `src/lib/preprod-path.js` | S |
| 1.2 | **Dashboard card shows the path** | The Pre-production card says "Step 3 of 11 · next: Vision & look". `journey.js` must not import the path model (first paint, pure for Node tests), so `dashboard.js` loads `preprod-path.js` lazily and patches the card. | `src/pages/dashboard.js` | S |
| 1.3 | **Search lands on the script line** | Script hits open `script.html#line-<id>`; the script page scrolls to and highlights that line. Check how `script.js` handles hashes first. | `src/ui/palette.js`, `src/pages/script.js` | M |
| 1.4 | **Search prefixes and recents** | `>` runs commands (export backup, toggle theme), `#` matches scene numbers, `@` matches people. Recents kept in memory only. | `src/ui/palette.js` | M |
| 1.5 | **Scene list keyboard flow** | Arrow keys move between rows, Enter opens a row, `n` adds a scene, Delete moves to the bin with undo. | `src/pages/breakdown.js` | S |
| 1.6 | **Scene row colour by shoot day** | A thin colour stripe per shoot day on each row (token-based, 8-colour cycle), so the schedule shows at a glance. | `src/styles/scene-list.css`, `breakdown.js` | S |
| 1.7 | **Saved filters (in memory)** | Named filter presets such as "Night exteriors without cast", kept in the page's `SL` state. If the owner wants them to survive a reload that is a new key (see Phase 3). | `breakdown.js` | S |
| 1.8 | **Backup health badge** | The Backup menu shows "last backed up 2 hours ago", amber after 7 days. Reads the existing activity log, no new setting. | `src/ui/topbar-backup.js` | S |
| 1.9 | **Plan and usage in the Account tab** | Usage against the plan's caps (synced projects, shares, seats) and a "Manage plan" link to Purchase. Reuses `usageList()` from `plan-cards.js`. | `src/pages/settings.js` | S |

Risks: 1.1 and 1.2 must not grow the hub or dashboard first paint (`scripts/budget.json`
fails a first paint that fetches a lazy chunk). 1.3 depends on whether the script editor can
scroll to an element id.

## Phase 2: features with real work but no schema (about a week)

| # | Idea | What to build | Files | Size |
|---|------|---------------|-------|------|
| 2.1 | **Drag to reorder scenes** | Reuse the stripboard's drag code (`placeScene`, `undoPlace` pattern). Keep the up/down buttons for keyboard users. | `breakdown.js`, stripboard drag helper | M |
| 2.2 | **Ready-to-shoot PDF** | One A4 page for the producer: the readiness checks, the schedule, the budget total, open permissions. Uses the existing PDF code path. | new `src/lib/ready-pdf.js`, `preprod.js` | M |
| 2.3 | **Sunrise and sunset on the recce** | Per location and shoot date, plus a warning when an exterior day wraps after sunset. `test:sun` already exists, so a sun model is in the repo; check what it covers first. | `plan.js`, `src/lib/sun.js` | M |
| 2.4 | **Restore preview for Drive backups** | Before restoring, show what the backup holds (projects, scenes, pages) and how it differs from now. Read-only, built on the backup format reader. | `drive-sync.js` UI, `backup.js` | M |
| 2.5 | **Referral code on the Purchase page** | Check what the buyer-facing side of the referral system already does, then add the missing entry point and show credit owed. | `purchase.js`, `growth-panels.js` | M |

Risks: 2.4 touches backup code, so run `prove:drive` for it. 2.5 starts with a read-only
look at `growth-panels.js`; if the entry point already exists, drop it.

## Phase 3: needs an owner decision, a schema section or a storage key (L)

| # | Idea | What it needs | Owner decision |
|---|------|---------------|----------------|
| 3.1 | **Per-step notes on the path** ("decisions so far") | A new project-scoped key, registered in `SCOPED_KEYS`, `PROJECT_KEYS`, `ALL_KEYS` and the Supabase scope list, and a schema CHECK widening, run **before** the client ships (the §37 lesson). | Do you want notes at all? |
| 3.2 | **Saved filters that survive a reload** | Same as 3.1 if stored. | In memory only (1.7), or stored? |
| 3.3 | **Clone a previous film's path** | A "start from another film" action copying departments, budget lines and call-sheet templates. Reads another project through `rawGet(key + '__' + id)`, never the proxy (the studio-wide trap). | Which parts should copy? |
| 3.4 | **Weekly "what's left" e-mail** | A scheduled edge function, an opt-in flag stored server-side, a schema section, and `RESEND_API_KEY` / `MAIL_FROM`, which are **still unset**. | Opt-in or opt-out, and which day? |
| 3.5 | **Buyer can resend their own receipt** | A rate-limited RPC (new schema section) that calls the existing claim/mail path, plus a button in Purchase. Blocked on Resend config. | Limit per day? |

Rule for all of Phase 3: the schema section runs **first**, the client ships second.

## Suggested order

1. Phase 0 (one day), so the gate is trustworthy.
2. Phase 1 in this order: 1.1, 1.2, 1.9, 1.8, 1.5, 1.6, 1.7, 1.3, 1.4. The first four are the most visible for the least risk.
3. Phase 2: 2.1, 2.2, 2.4, 2.3, 2.5.
4. Phase 3 only after the owner answers the questions above, and after Resend is configured for 3.4 and 3.5.

Total without Phase 3: roughly 9 to 11 working days of agent time. Phase 3 is another 5 to 8, mostly waiting on decisions.

## What I need from the owner

1. A yes for one `verify` run to recapture the baseline (0.1).
2. Whether to build Phase 3 at all, and the answers in its table.
3. Whether each phase goes to `develop` as one push (my default) or item by item.
4. The Resend key and `MAIL_FROM` if 3.4 or 3.5 stay in.

## Definition of done for every item

- No new storage key unless it appears in Phase 3.
- No write during four idle seconds (verify's check).
- Colours from tokens, shapes from skin variables, no native confirm/alert/prompt.
- Checked at 1280 and 390, dark and light, with no console errors or horizontal overflow.
- Docs updated: `docs/HISTORY.md` item, `CLAUDE.md` row if it changes an invariant, `docs/HANDOFF.md` note.
