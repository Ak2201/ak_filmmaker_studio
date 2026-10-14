# NEXT UI REVAMP PLAN — 14 October 2026

> Status: PLAN ONLY. Nothing here is built. Decisions below were made by the owner on 14 Oct 2026.
> Work happens on a new branch cut from `develop`, not on `develop` itself.


## Context
Breakdown today only makes scene rows, cast tags, locations and totals (`runBreakdown()`, `src/lib/breakdown-run.js`).
Shots live on Visualize (`basicShotDivision` in `src/lib/shot-rules.js`; AI = Desk task `shot-draft` in `src/lib/ai-tasks.js`);
nothing derives a story from scenes; storyboard frames hold only a caption and a `ref` ("a URL or a description — never bytes", `blankFrame` in `src/lib/shots.js`).
The AI Desk (`src/ui/ai-desk.js`) already gives every item a tick box, "Accept selected", "Accept all" and an Undo; AI entry is the `aiPill` (`src/ui/ai-pill.js`, Pro + key gated, must stay light — `test:ai-lazy`).

Goal: Breakdown offers **Manual breakdown** or **Breakdown with AI**; both build shots + story from the scenes; nothing is kept until the writer accepts.

## Owner's decisions
- Manual mode: **review first** (same tick list + Accept selected / Accept all), not write-direct.
- AI flow: **shots review, then story review** automatically (closable between).
- Scene already has items: **ask each time** (prompt lists those scenes; choose skip / add alongside).
- Story output: **one outline step per scene**, filed under beats, linked by `sceneId`.
- Re-run: **only new scenes**.
- AI gating: **keep Pro + own key** (aiPill states).
- Scope includes **storyboard images**: Gemini image model, stored in **Drive/cloud only**, **writer picks style per run**.
- Work happens on a **new branch cut from `develop`**.

## Already in the working tree (uncommitted, from before planning)
`src/lib/ai.js` `draftSceneStory()` and `src/lib/ai-tasks.js` task `scene-story` (tick list, appends steps with `sceneId`, Undo). Keep; both modes' story review reuses it.

## Phases (each independently shippable on the branch)
1. **Manual review path.** New `src/lib/breakdown-extras.js`: build proposals only, write nothing — shots from `basicJobs`→`basicShotDivisionSync` (marked `rules: true`), story steps from scenes (number, slug, first action line, cast; filed by `nearestBeat`, linked by `sceneId`). Surface them through the Desk list UI by registering two non-AI tasks (`shot-basic`, `story-basic`) that need no key and skip the Pro gate. Existing-item prompt uses `dialog.js` (never native confirm). Only-new-scenes filter reads existing shots (`shotsByScene`) and outline steps with `sceneId`.
2. **AI path.** `aiPill` "Breakdown with AI": runs `runBreakdown()`, then opens `shot-draft` over unshot scenes; its `after(madeIds)` (only when non-empty) opens `scene-story`. Marked `ai: true` as today.
3. **UI.** Two buttons replace the single run button in `src/ui/breakdown-overview.js` (`startBlock`) and `src/ui/script-overview.js`; handlers beside `run-breakdown` in `src/pages/breakdown.js`. Wording changes may need `EXPECTED` rows in `scripts/verify-migration.mjs`.
4. **Storyboard images (largest, riskiest).**
   - Desk task `board-frames`: for accepted shots, writer picks a style (e.g. pencil sketch / colour) in the task's refine step; Gemini image call through the one `callModel`-style path (key in a header, never `?key=`). `generativelanguage.googleapis.com` is already in both `connect-src` lists; add `img-src blob:` (and check `data:`) to `vercel.json` AND `netlify.toml` in the same commit.
   - Review: each generated frame shown with tick + Accept selected / Accept all before anything is saved.
   - Storage: image bytes never go in `localStorage` or `blankFrame`. Accepted images are uploaded as files to the user's Drive (`drive.file` scope, `src/lib/drive.js` — add a create-file helper beside `createBackupFile`); the frame keeps only a reference (`ref` = Drive file id/URL). Display fetches with the Drive token (silent re-mint is not possible after ~1h: show a "Reconnect Drive" state, never a broken image). Images are excluded from backup files (reference only) — say so in the UI.
   - Signed-out / no Drive: generation is disabled with a clear reason (Drive-only was the owner's choice).
   - **Built 14 Oct 2026 (P3c), proven only against FAKES.** `src/lib/board-frames.js` (pure: gate, jobs, input, prompt),
     `generateImage()` in `src/lib/ai.js` (shares `send()` with `callModel`; Gemini key in `x-goog-api-key`),
     `imageModels` on the Gemini row of `ai-providers.js` (`gemini-2.5-flash-image`, **unverified against a real key**),
     `createFile` / `downloadFileBlob` / `deleteFileQuiet` / `driveRef` in `src/lib/drive.js`, `src/ui/drive-image.js`
     (show from Drive or "Reconnect Drive"), task `board-frames` in `ai-tasks.js`, the Draw block on visualize.html#storyboard.
     `img-src` already carried `data: blob:` in both host configs. `test:board-frames` (Node) and `prove:board-frames`
     (Chromium, fake Supabase + fake Gemini + fake Drive). Still to do with a real key and a real Drive: one run end to end.
5. **Verify.** `npm run test:undef`; `build:verify` + `verify`; `test:ai-lazy`; add node tests for the proposal builders (like `test:stripboard`); manual run with no key (Manual path), with a key (AI path, accept one / accept all / undo), and a re-run after adding a scene (only the new scene proposed).

## Risks / things to confirm while building
- Drive-only images need an authenticated fetch per view; token expiry is the main UX risk.
- Gemini image model id and pricing change often: read the provider table in `src/lib/ai-providers.js` and verify against a real key before committing to a model name.
- New `fms_` keys: none planned (outline steps and shots reuse existing records; frame `ref` is an existing field).
- Pro gate applies only to the AI button; Manual path stays free.

## Out of scope
Screenplay rewriting/polish (owner chose storyboard images instead of screenplay in this round).
