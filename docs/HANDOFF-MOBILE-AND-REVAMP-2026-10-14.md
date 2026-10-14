# HAND-OFF — mobile UI + the next revamp — 14 October 2026

> Status: PLAN ONLY for everything under "To do". Nothing in Phases 2–3 is built.
> Written for the person taking this over. Read `CLAUDE.md` and `docs/DESIGN-KIT.md` first.

## 1. Where things stand (merged)
PR #18 (`develop` @ `ed75c14`) moved the whole web app onto the **Swiss Precision kit**:
one dark theme, violet `#8B5CF6` accent (text-bearing fills use `#7C3AED`, white on `#8B5CF6` is 4.23:1),
Space Grotesk / Inter / JetBrains Mono self-hosted, 6–8px radii, one component kit
(`src/ui/kit/`, `src/styles/kit.css`, tokens in `src/styles/tokens.css`, shapes in `src/styles/skins/studio.css`).
New shell (64px rail with stage flyouts, 56px top bar, 32px real-data status bar). Features built on the way:
blocking diagram + shot coverage table, Lock Production Draft, WhatsApp call-sheet preview, Edit Log conflict
banner + running time + target + sync + CSV, Story tension curve + 15-beat deck, Breakdown Element Index,
shot lighting/rig + camera link. CI/verify/proofs were green when merged except what is listed in the PR
(`test:schema`, `prove:drive/storage/extension/cloud-delete/ai-coverage` not run in the sandbox).

## 2. Owner decisions that still apply
- Base look: Swiss Precision. Accent violet. Dark only (paper surfaces only for print/PDF, legal, 404, the screenplay page).
- Playfair italic only on the project title / cover preview / landing hero tagline. Courier on screenplay text.
- **Real data only**: never fake figures; hide what cannot be measured; derive instead of storing; no new `fms_` keys
  (add one field to an existing record or blob).
- **Ask the owner before building any genuinely new feature.**
- Landing keeps the live plans/trial/INR copy.
- Phone bottom bar stays **Home · Go to · Search · Tools**, restyled.
- Multi-variant mobile screens (Stripboard x3, Shoot Day x3, Story x2): pick the best kit fit and say which.
- **FEATURE PARITY (latest rule): every feature on a mobile screen must exist on web too, and vice versa. One feature set; only the placement differs.** Responsive, one codebase per page — no separate mobile pages.

## 3. To do — Phase 2: mobile UI
Source designs: the Stitch zips (see section 6): 20 mobile screens (dashboard, stripboard x3, shoot day x3, story x2,
breakdown, screenplay writer + focus, edit log/deliverables, library, settings, admin, call sheets, budget, visualize).
1. **Parity audit first** → `docs/PARITY-MATRIX.md`: feature x {mobile prototype, desktop prototype, app web, app phone}.
   Bins: (a) in the app but missing in one layout → fix; (b) in one prototype only and derivable from current data → build for BOTH;
   (c) needs data/new feature → list and ask the owner per item.
2. **Mobile kit layer**: phone rules in `kit.css` from tokens only — 44px targets, `--mab-h`-aware padding, sticky segmented
   strip, table → stacked cards below 720px, bottom sheets (reuse `mobile-nav.js` + `dialog.js`), 2-col stat grid, scrolling chip rows,
   safe-area insets. Add kit *variants* (table responsive mode, compact strip, stacked stage-card, collapsible panel), not new components.
3. **Per-page passes** in parallel worktrees with owned file sets: stripboard/DOOD, shoot day (390px-first), screenplay + focus
   (toolbar as sheet, beats as bottom sheet), visualize (coverage table as cards, touch/pan on the blocking canvas), dashboard/hub,
   story, breakdown, budget, contacts/call sheets, edit/deliverables, library, settings/admin, public pages.
4. **Sweep + gate**: Playwright at 390x844 and 360x740 over all 37 pages (overflow, tap targets < 44px, clipped text, console errors),
   loading each page directly in a 390px context (verify only resizes — its documented blind spot). Compare screenshots with the
   mobile `screen.png` files. Then `test:undef`, `build:open` + `verify`, `test:all` (minus `test:schema`), the prove:* set.

## 4. To do — Phase 3: `docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md` (Breakdown manual / with AI, shots + story, storyboard images)
Runs alongside Phase 2, same parity rule, UI from the kit only. The plan file's decisions stand. Corrections found on 14 Oct:
- `draftSceneStory`, task `scene-story`, `breakdown-extras.js`, `shot-basic`, `board-frames` **do not exist in the repo**
  (the plan's "already in the working tree" code was never committed). Phase 1 must write them.
- Packages: **P3a** `src/lib/breakdown-extras.js` + non-AI Desk tasks + `draftSceneStory`/`scene-story` + the AI chain;
  **P3b** the two buttons ("Manual breakdown" / "Breakdown with AI" via `aiPill`) in `breakdown-overview.js`/`script-overview.js`,
  handlers in `src/pages/breakdown.js`, phone review as a sheet, keep `test:ai-lazy` green; **P3c** storyboard images
  (Gemini image call through the single provider path, key in a header never `?key=`, `img-src blob:` in BOTH `vercel.json` and
  `netlify.toml`, Drive-only storage via a create-file helper beside `createBackupFile`, frame keeps only `ref`, "Reconnect Drive"
  state, images excluded from backups, disabled with a reason when signed out). P3c cannot be proven without a real key and a real Drive.
- Merge order: P3a → P3b → the Breakdown mobile pass (it must rebase on P3b's markup) → P3c.

## 5. How to work and verify
- Branch from `develop`; never commit unfinished work to `main` (`docs/BRANCHING.md`).
- `npm run test:undef`; `npm run build:open && npm run verify` (set `PW_CHROMIUM=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`
  if Playwright asks for a newer shell; use `VERIFY_PORT` when several runs overlap); `test:all` minus `test:schema` (needs PostgreSQL);
  gated `npm run build` before `prove:gate` / `prove:growth` / `prove:billing`; **`build:open` before `prove:stage-guide`/`prove:walk`**.
- Never recapture `scripts/baseline.json` / `scripts/budget.json` inside a feature branch; do it once at merge, deliberately.
- Merge conflicts that keep recurring: `src/data/section-icons.json` (union the icons list), `src/styles/kit.css` (keep both appended
  blocks), `package.json` `test:all` (keep every new test). Any icon a component uses must be listed in `section-icons.json`.
- Too many `.claude/worktrees` makes vite hit `ENOSPC … file watchers`; remove merged worktrees before running provers.
- Invariants in `CLAUDE.md` (storage keys, no inline handlers, tokens-only colours, `--sk-*` shapes, `dialog.js` instead of native dialogs) all apply.

## 6. The Stitch source files
Committed once on branch `claude/improvement-ideas-0gwjyx` in the hand-off commit under `docs/stitch-source/` so they can be picked up,
then **removed from git again** in the follow-up commit (the blobs stay in that branch's history). The canonical, private copy lives in
the repo **`Ak2201/newmobile-UI`**: `desktop/`, `mobile-1/`, `mobile-2/` (each the original zip plus the unzipped screens).
- desktop: 19 screens + 3 design systems (Obsidian Cinema, Swiss Precision, Cinematic Precision) + prompt pack. Swiss was chosen.
- mobile-1: 17 screens. mobile-2: 3 screens (call sheets, budget, visualize).
- The mobile bottom bars in those screens disagree with each other; the owner chose to keep the app's own bar.
- `shoot_day_floor_monitor_1` desktop `screen.png` is an error file, not an image.

## 7. Open questions for the owner
1. Edit Log's new target length vs Reports' existing target runtime: one field or both?
2. Features the prototypes show with no data behind them (runtime split, Auto-Balance Pages, the "edited 2h ago" feed,
   the Production Slate subtitle, scene gutters in the Screenplay Writer, Add sub-beat, AI coverage generation): build or leave out?
3. Unlocking a locked production draft still lives only at `write.html?stay=1#revisions` — give it a proper home?
