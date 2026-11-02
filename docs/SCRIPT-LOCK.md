# Script lock — Phase 1 design (1 Nov 2026)

Owner's decisions, 1 Nov 2026: a SOFT gate (nobody is blocked), ONE deliberate lock step on
the Screenplay Writer, revisions + a change report after the lock, rules only (no AI in the
lock pass; "Enhance with AI" is Phase 3). This file is the contract the three build lanes
share. CLAUDE.md wins wherever the two meet.

## 1. Stored shape — fields only, inside `fms_script_v1`

No new key. The lock IS the existing scene-number lock (`numbering`, src/lib/script.js); it
gains two OPTIONAL fields. Everything else in the blob is untouched.

```json
{
  "elements":  [ { "id": "w_a1", "type": "scene", "text": "INT. KITCHEN - NIGHT", "u": 1761990000000 } ],
  "revisions": [ { "id": "w_r9", "name": "Draft 2", "number": 2, "date": "2026-11-01T09:30:00.000Z",
                   "note": "Locked script", "titlePage": {},
                   "elements": [ { "id": "w_x1", "type": "scene", "text": "INT. KITCHEN - NIGHT", "liveId": "w_a1" } ] } ],
  "documents": [],
  "numbering": {
    "locked": true,
    "at": "2026-11-01T09:30:00.000Z",
    "ids": { "w_a1": { "n": "1", "t": "INT. KITCHEN - NIGHT" },
             "w_c4": { "n": "1A", "t": "INT. CAFE - DAY" } },
    "pages": { "locked": true, "at": "…", "starts": [] },
    "base": "w_r9",
    "reviewed": { "2": "5be1c0d2:14", "1A": "a03f99e1:6", "3": "omitted" }
  }
}
```

- `base` — the id of the `revisions` entry that IS the locked script (the change report's
  baseline). A REFERENCE, never a copy: the lock reuses the latest issued draft when the
  working copy equals it (`changedSinceDraft()` false), else saves one new draft with note
  `Locked script` (`saveNewDraft`). Absent on a lock taken before this design.
- `reviewed` — `{ <scene number>: <signature> }`. The signature is `hashElements()`
  (src/lib/drafts.js) over that scene's live elements, or the literal `"omitted"`. An item is
  reviewed while its stored signature equals its current one; edit the scene again and it
  comes back. Keys are locked numbers (upper case), because under a lock the number is the
  scene's identity and survives restores and cut-and-paste where element ids do not. Text
  before the first heading uses the key `"_PRE"`. Pruned (keys with no report item dropped)
  only when marks are WRITTEN, never on a read. Absent when empty.
- `normaliseNumbering()` keeps `base` only as a non-empty string and `reviewed` only as an
  object of string values; `settleNumbering()` carries both through a save. A blob without
  them reads, loads and saves byte-identical (the existing rule for `numbering` and `pages`).
- `isHeld(numbering)` (new, script.js) = `isNumberingLocked(n) && typeof n.base === 'string'
  && n.base`. Held is what changes behaviour; `locked` alone keeps today's behaviour.
- The revision colour is still NOT stored: `issuedColour()` of the entry's position.

## 2. Taking the lock (one entry point)

`screenplay.html#lock` and the Screenplay Writer's "Lock the script" button (`sc-lock`,
also in the File menu and the phone Tools sheet) open ONE review sheet (kit `sheet`, card
`#lock.lk-review`). Before it opens the page saves (`persistNow`). The sheet shows:

1. Facts, from `lockPreview(doc, byCategory)`: scenes (and how they will be numbered: the
   Breakdown rows' numbers / the headings' own / by position — `lockNumbering`'s order),
   cast (distinct cue names), locations, elements, extras. `byCategory` comes from
   `planPipeline()`'s `props` row (it gains that field).
2. The pipeline rows exactly as `planPipeline()` returns them (label + note), drawn
   GENERICALLY. This is the Phase 2 extension point: Phase 2 adds a step to `STEPS`/`RUN`/
   `planPipeline` in script-pipeline.js and the lock shows and runs it with no edit to the
   lock code. The lock never names a step id.
3. The baseline line ("Draft 2 becomes the locked script" / "Saved as Draft 3").
4. "Lock and generate" (`data-action="lock-confirm"`) and Cancel.

On confirm (`takeLock(doc, scenes)` then the page):
1. re-read: the page's own doc is current (it saved before opening); no headings → `tell()`.
2. `takeLock` mutates the doc: base draft (reuse or save), `numbering = { ...lockNumbering(
   elements, lockPreset(scenes)), base, }` (no `reviewed`). The caller saves.
3. `applyNumbers(elements, numbering)` — the rows take the locked numbers.
4. handoff's sync baseline is reset to the headings now (`resetSyncBaseline()`).
5. `openPipeline({ ai: false, title: 'Generate pre-production', … })` runs the existing pass
   (fills blanks only; its one Undo takes the RUN back, never the lock — the summary says so).
   The pass runs with sync NOT held: it is the act that generates pre-production.

The old entry points collapse into links to this step, so there is ONE lock:
- Stripboard "Lock production draft" (`sb-lock`, type-to-confirm) → a link "Lock the script"
  to `screenplay.html#lock`. Its handler is deleted. Locked: draft badge, "Unlock draft…"
  (shared unlock below) and "Manage numbering" stay. The review sheet replaces the
  type-to-confirm as the deliberate step (owner decision of 1 Nov over 14 Oct).
- Drafts `#numbering` "Lock scene numbers" (`numbers-lock`) → the same link. Its handler is
  deleted. The locked panel (facts, OMITTED list, page lock) is kept; Unlock goes through the
  shared unlock.
- `preprod-path.js` missing-step text → "Lock the script (Screenplay Writer)".

## 3. After the lock: held sync, revisions, change report

**Held sync.** While `isHeld()`, `reconcile(…, { held: true })` (passed by handoff.js syncNow
and drafts.js restore; NEVER inferred inside reconcile, so the pipeline and the lock pass are
unaffected) changes only identity and numbers:
- a linked row keeps its heading-derived fields (as `keepLinked`); its number follows the lock;
- a move relinks (rule 2 as today) AND, held only, a lost row relinks to the unclaimed heading
  whose locked number equals the row's `number` (restores, cut-and-paste after a settle);
- rule 5 links of unlinked rows still apply (they write `scriptElId` only);
- a gone heading's row is NOT binned → `plan.pending.omit: [{ sceneId, heading, number }]`;
- a new heading is NOT added and no bin entry is restored → `plan.pending.add: [{ headingId,
  text, number }]`. `plan.pending` is always present (empty arrays when not held).
Dialogue/action edits never ran the sync and still do not. A legacy lock (no `base`) is not
held: its sync is byte-identical to today.

**Revisions.** Unchanged: the writer issues drafts on drafts.html; colours are the issued
order (`issuedColour`). The bar's "current revision colour" = the latest issued draft's.
The baseline draft is protected: `updateDraft()` returns null for `numbering.base` while held
(drafts.js page and leave-prompt.js fall back to `saveNewDraft` and say why); write.js's
`rev-del` refuses the base with a `tell()`.

**The change report** — `changeReport(doc, { scenes, shots, callSheets })`, PURE, in the new
`src/lib/script-lock.js`. `diffElements(baseRev.elements, doc.elements)` → `groupByScene()`
(script-diff.js; pairs by `liveId`, falls back to text after a restore). One item per group:

```
{ key, number, kind: 'added'|'changed'|'omitted', heading, headingId, baseHeadingId,
  headingChanged, moved, counts, sig, reviewed, sceneId, pending: 'add'|'omit'|null,
  impact: { shots, day, dayAlone, sheets: [{ id, title, date }], sides, budget, eighths } }
```
- number: live headings from `sceneNumbers(doc.elements, doc.numbering).byId`; an omitted
  heading from `numbering.ids[baseHeadingId].n` (the orphan entry the lock keeps).
- sceneId: the row whose `scriptElId` is the heading (live, or the base heading for omitted),
  else the row whose `number` equals the item's number.
- impact (derived, stored nowhere): shots = `listShots()` with that `sceneId`; day =
  `shootDayOf(row)`, `dayAlone` = no other scene on that day; sheets = call sheets whose
  `sceneIds` hold it; sides = day > 0 ("reprint the sides for Day N"); budget = `'may-drop'`
  (omitted and dayAlone) / `'not-counted'` (added, no row or no day) / `'none'`; eighths =
  `{ row: from, script: to }` from that row's `measureEighths(elements, scenes)` entry, else
  null (measureEighths only re-measures content-confident pairs; keep that).
- `open` = unreviewed items. `baseMissing` = `base` names no revision (report says so and
  offers "Start tracking from the latest draft").

**"Reviewed" and the actions** (sheet `#changes.lk-report`, `src/ui/script-lock-ui.js`).
Nothing downstream changes until the writer presses one of these; each marks the item reviewed:
- added: "Add to Breakdown" → `applyFor(elements, numbering, { headingId })` (non-held
  reconcile with `keepLinked`, filtered by `planFor()`, so a bin entry for it is restored);
- omitted: "Send to the bin" → `applyFor(…, { sceneId })` (binScene, reason `script`,
  dependents with it, Undo toast) — or "Keep it" (mark only);
- changed heading: "Update place and time" → `headingPatch(text, row)` (today's private
  `fieldPatch`, exported) minus `number`, through `Scenes.saveScenes` after a re-read;
- changed length: "Use the script's length" → `row.eighths = script`;
- any: "Mark reviewed"; plus "Mark all reviewed" (`lock-review-all`).
Marks are written by `markReviewed(numbering, items, keys)` → re-read the blob
(`loadScript()`, or the page's own doc on screenplay/drafts), set `numbering`, `saveScript()`.
The Screenplay Writer adopts an arrival that changed ONLY `numbering`
(`numberingOnly(base, fresh)`, script-incoming.js) into its doc instead of filing a side copy.

**Legacy locks** (`locked`, no `base`): read as locked, bar says "Locked · <colour>", nothing
is written on any read. The report sheet offers "Start change tracking" → `startTracking(doc)`
(reuse/save a draft, set `base`); only then is the script held.

## 4. Releasing the lock

ONE implementation, `confirmUnlock({ getDoc?, save?, after? })` in script-lock-ui.js, called
by the Screenplay Writer (`sc-unlock`), drafts `#numbering` (`numbers-unlock`) and the
stripboard (`sb-unlock`). `askDanger` (dialog.js) with the counts from
`unlockSummary(doc, scenes, bin)`: every scene renumbered 1..N, lettered inserts become whole
numbers, N OMITTED placeholders go, the page lock goes, the change report and its review marks
are cleared, live sync resumes now: A scenes added to the Breakdown and B sent to the bin with
their S shots (restorable), the locked draft stays in Drafts, pages already handed out will no
longer match. On confirm: re-read (default getDoc = `loadScript`), `delete doc.numbering`, save,
`syncScript(elements, { numbering: null, keepLinked: true })` (settles the held changes; one
toast with Undo), then `applyNumbers(elements, null)`. Re-locking starts a fresh `base` and
no `reviewed`.

## 5. The soft-gate bar (one module, every pre-production page)

`src/ui/lock-bar.js`, mounted by shell.js `mountShell()` when `homeStage(CURRENT) ===
'preprod'` and the shell is in project mode — derived from navigation.json, so it lands on
breakdown, visualize, plan, stripboard, reports, budget, contacts and preprod.html with no page
edited. Shell inserts an EMPTY host synchronously (`div#lockBar.lk-bar[data-pending]`, first
child of `main`, `grid-column: 1 / -1`), then `import('./lock-bar.js')` fills it; the host has
a fixed one-row block size and `position: static`, so filling it moves nothing and
`measureChrome()` never counts it. A childList observer on `#app` re-places it when a render
replaces `main`. It reads the blob, writes nothing, repaints on `storage`/`onWriteElsewhere`
for `fms_script_v1`.
- draft: `data-state="draft"` — "Draft script — lock it to generate pre-production"
  + `a.lk-go[href="screenplay.html#lock"]` "Lock the script".
- locked: `data-state="locked"`, `data-open="N"` — "Locked" + `span.dr-swatch.c-<swatch>`
  + colour name, then "N script changes to review" (`button[data-action="lock-report"]`,
  opens the report sheet in place) or "No script changes since the lock".
- legacy: `data-state="legacy"` — "Locked · <colour>" + "Start change tracking" (same sheet).
Tokens only; the swatch reuses drafts.css's `.dr-swatch.c-*` (no second colour mapping).

## 6. Must NOT change

- No new localStorage/sessionStorage key; no new `project_data` scope; no schema section.
- `fms_script_v1` stays the one store; `numbering.ids`, `at`, `pages` keep their meaning and
  shape; `lockNumbering`, `sceneNumbers`, `settleNumbering` numbering rules are untouched.
- A blob without `base`/`reviewed` round-trips byte-identical; an old lock stays locked.
- Live scene sync while UNLOCKED, and under a legacy lock, is byte-for-byte today's.
- The pipeline still fills blanks only, keeps its in-memory Undo, writes no new key; its other
  callers (import hand-off, Breakdown overview) still show "Enhance with AI".
- `restoreDraft()` re-keying through `liveId`; `draftDocument()`; colours derived by position.
- `scene-bin.js` cascade; nothing is deleted without the bin; `shoot.html` stays the only
  writer of `shotState`.
- Saved scene fields a person typed (cast, synopsis, elements, shootDay, eighths, marks) are
  never overwritten by the lock, the held sync, the report or the unlock (`keepLinked`).
- `verify`'s zero idle writes: the bar and the report write nothing on render.
- No native confirm/alert/prompt; no inline handler; no raw colour; why-comments kept.

## 7. Lanes (disjoint files) and interfaces

- **A model**: script.js (`isHeld`, normalise/settle), NEW script-lock.js (`lockState`,
  `lockPreview`, `takeLock`, `startTracking`, `changeReport`, `markReviewed`, `unlockSummary`),
  scene-sync.js (`held`, `pending`, `planFor`, `applyFor`, `headingPatch`), drafts.js
  (`updateDraft` guard), script-incoming.js (`numberingOnly`), script-pipeline.js (`byCategory`),
  preprod-path.js, scripts/test-script-lock.mjs (NEW), test-sync, test-drafts, test-incoming.
- **B writer UI**: NEW src/ui/script-lock-ui.js (`openLockReview`, `openChangeReport`,
  `confirmUnlock`), NEW src/styles/script-lock.css, screenplay.js, handoff.js,
  pipeline-checklist.js.
- **C bar, other entry points, proof**: NEW src/ui/lock-bar.js, NEW src/styles/lock-bar.css,
  shell.js, write-revisions.js, stripboard.js, stripboard.css, drafts.js (page), write.js,
  leave-prompt.js, NEW scripts/prove-script-lock.mjs, prove-script.mjs, prove-schedule.mjs,
  package.json, .github/workflows/gate.yml.
