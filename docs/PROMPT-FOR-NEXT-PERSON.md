# Prompt for the person taking over (paste into Claude Code)

Use Claude Code in a clone of `Ak2201/ak_filmmaker_studio`. The workflow script is `.claude/workflows/mobile-and-revamp.js`
(three stages, run one at a time). Everything below the line is the prompt.

---

You are taking over FilmMakerStudio (a local-first filmmaker web app). Do NOT start coding yet. First read, in this order:
1. `CLAUDE.md` (invariants — storage keys, no inline handlers, colours only from tokens, `--sk-*` shapes, `dialog.js` instead of native dialogs, `npm run test:undef`).
2. `docs/HANDOFF-MOBILE-AND-REVAMP-2026-10-14.md` (what is merged, owner decisions, the to-do, how to verify).
3. `docs/DESIGN-KIT.md` (the Swiss kit: `src/ui/kit/`, `src/styles/kit.css`, `src/styles/tokens.css`).
4. `docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md` (Breakdown manual / with AI, shots + story, storyboard images).

Setup:
- `git fetch origin && git checkout -B work/mobile-and-revamp origin/develop` (develop already contains the Swiss kit; PR #18).
- `npm install`. Playwright's Chromium is at `/opt/pw-browsers` if you are in the cloud environment; otherwise `npx playwright install chromium`.
- Get the design files: `git fetch origin stitch-source` and check out its three zips into a scratch folder OUTSIDE the repo; unzip each into its own empty directory (`desktop/`, `m1/`, `m2/`). Never commit them to this repo.

The job (one responsive codebase; no separate mobile pages):
A. **Mobile UI** in the same Swiss/violet/dark look as web, from the same tokens and kit, using the 20 mobile Stitch screens.
B. **Run alongside it:** build the plan in `docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md`. Note its "already in the working tree" code does not exist in the repo — write `draftSceneStory` and the `scene-story` Desk task yourself.

Owner rules (non-negotiable):
- Swiss Precision base, violet `#8B5CF6` accent (white-text fills use `#7C3AED`), dark only. Playfair italic only on the project title / landing hero tagline. Courier for screenplay text.
- **Feature parity: every feature on a mobile screen must exist on web too, and vice versa. Only the placement differs.**
- Real data only: derive, never fake figures, hide what cannot be measured, no new `fms_` storage keys (add one field to an existing record).
- **Ask the owner before building any genuinely new feature** — list the question and wait.
- The phone bottom bar stays Home · Go to · Search · Tools, restyled. For screens with several mobile variants (Stripboard x3, Shoot Day x3, Story x2) pick the best kit fit and say which.
- Never recapture `scripts/baseline.json` or `scripts/budget.json` in a feature branch; do it once at the end, deliberately, with the reason in the commit message.
- Never push to `develop` or `main` directly; open a PR only when the owner asks.

How to run it (use the workflow so the work is split across agents and each stage can be checked):
1. `Workflow({name:"mobile-and-revamp", args:{stage:"audit", zips:{desktop:"<dir>/desktop/stitch_film_making", m1:"<dir>/m1/stitch_film_making", m2:"<dir>/m2/stitch_film_making"}}})`
   → writes `docs/PARITY-MATRIX.md` and returns the features that need an owner decision. **Stop. Show the owner that list and get a yes/no per item.**
2. `Workflow({name:"mobile-and-revamp", args:{stage:"build", approved:[…approved items…], zips:{…same…}}})`
   → builds the mobile kit layer, then page passes and the revamp packages P3a→P3b/P3c in worktrees. Read each report; resolve open questions with the owner.
3. `Workflow({name:"mobile-and-revamp", args:{stage:"gate", branches:[…from stage 2…], zips:{…}}})`
   → merges, runs `test:undef`, `build:open` + `verify`, the test and prove suites, then a 390x844 / 360x740 sweep of all 37 pages with up to three fix rounds.
If workflows are not available to you, do the same stages by hand in the same order.

Definition of done:
- `npm run test:undef`, `npm run build:open && npm run verify`, every `test:*` in `test:all` except `test:schema` (needs PostgreSQL), and `prove:gate` / `prove:growth` / `prove:billing` (gated `npm run build` first) / `prove:walk` / `prove:stage-guide` / `prove:dialogs` / `prove:story-path` / `prove:script` all pass.
- No horizontal overflow, no tap target under 44px, no content hidden behind the bottom bar at 390x844 and 360x740, on all 37 pages, loaded directly at that size.
- `docs/PARITY-MATRIX.md` has no open bin a/b rows; every bin c row has an owner decision recorded.
- Report what you could not run (storyboard images need a real Gemini key and a real Drive; `test:schema` needs PostgreSQL) instead of claiming it works.

Gotchas already paid for: `build:open` (not the gated build) before `prove:stage-guide` / `prove:walk`; many `.claude/worktrees` makes vite fail with `ENOSPC … file watchers` — remove merged worktrees; merge conflicts recur in `src/data/section-icons.json` (union the icon list), `src/styles/kit.css` (keep both appended blocks) and `package.json` `test:all` (keep every new test); any icon a component uses must be listed in `section-icons.json`.
