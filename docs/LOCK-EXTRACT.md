# Lock extract — Phase 2 (1 Nov 2026)

Owner, 1 Nov 2026: a locked script GENERATES pre-production by rules, so nobody retypes what
the script already says. Phase 2 only ADDS pipeline steps; `docs/SCRIPT-LOCK.md` still rules the
lock itself and `src/lib/script-lock.js` / `numbering` are NOT touched. CLAUDE.md wins on any clash.

## 0. Rules every step obeys

- No new localStorage key. New facts are fields/records inside the keys that already own them.
- Fill BLANKS or add NEW records. Never overwrite or edit what a person typed. A re-run writes
  nothing (idempotent: "has one already" is decided from storage, never from a marker).
- Undo restores only what the step wrote: a record the person edited since is theirs and stays.
  `runPipeline` already gives the byte-exact undo when the key is untouched; each step also
  returns `surgical()` for the edited case.
- No writes on render, no inline handlers, tokens only, `dialog.js` only. `src/lib` imports no
  `src/ui|pages`, touches no `document` (`test:layers`). Money: `money.js` and the film's currency.
- LOCK-ONLY: the seven new steps carry `lockOnly: true` in `STEPS` and run/plan only when the
  caller passes `lock: true` (`runPipeline`, `planPipeline`, `openPipeline`). The import hand-off
  and the Breakdown overview pass nothing, so their steps, summary and `test:pipeline` are as today.
- Order (existing ids kept): scenes, characters, **synopsis, extras, tags**, locations, props, shots,
  days, **castcontacts, recce, sheets**, budget, **budgetlines**, analysis.
- Scene rows are paired to script text with `matchScenes()`; ONLY confident pairs (`isConfident`)
  are read. A position-only guess never writes.
- `categories` (runPipeline/planPipeline/openPipeline option): array of element category ids
  the writer left ticked; `undefined` = all. It governs `extras` (id `extras`) and `tags` (the rest).

## 1. The steps

| id | label | rule | may write |
| --- | --- | --- | --- |
| `synopsis` | Scene synopses | scene `synopsis` blank -> `synopsisFor(slice)` | `scenes[].synopsis` |
| `extras` | Background and extras | crowd words in action lines, with the count when stated | `scenes[].elements.extras` (strings) |
| `tags` | Pre-tagged elements | suggestions of ticked categories except `cast` and `extras` | `scenes[].elements.<cat>` (strings) |
| `castcontacts` | Cast contacts | one per speaking character with no contact | `fms_contacts_v1.contacts` (new) |
| `recce` | Recce cards | one per location with no stored recce | `fms_locations_v1.recces` (new keys) |
| `sheets` | Draft call sheets | one per shoot day with scenes and no sheet | `fms_contacts_v1.callSheets` (new) |
| `budgetlines` | Budget lines | NEW estimate rows, days filled, rates blank | `fms_library_calc_v1` (`ci_<n>_*`, new n) |

Storage keys are the exports `SCENES_KEY`, `CONTACTS_KEY`, `LOCATIONS_KEY`, `CALC_KEY`; the RUN
table lists them so the exact undo snapshots them (`synopsis/extras/tags: [SCENES_KEY]`,
`castcontacts/sheets: [CONTACTS_KEY]`, `recce: [LOCATIONS_KEY]`, `budgetlines: [CALC_KEY]`).

**synopsis.** `firstSentence(text, 140)`: collapse whitespace; the text up to the first `.`, `!` or
`?` followed by a space or the end; if that is over 140 chars, cut at the last word boundary under 139
and add `…`. Source is `firstAction(slice)` (breakdown-extras.js). No action line: nothing. Written
only where `String(synopsis).trim() === ''` at WRITE time (re-read first). Undo: `''` back, only
where the synopsis still equals the written text.

**extras.** Nouns are the `extras` list of `element-lexicon.json` (so Auto-Tag and this agree).
Per action line, in order:
1. `NOUN (N)` / `NOUNS (N)` with N digits, e.g. `STUDENTS (40)`, `Students (180)`;
2. `N NOUN` with up to two words between, e.g. `180 students`, `40 angry students`;
3. a number word (one..twenty, thirty..ninety, hundred, "a dozen" = 12, "a couple of" = 2) before the
   noun or after `crowd of`, e.g. `a crowd of fifty`, `Forty STUDENTS`;
4. a bare noun with no count.
A line that yields a counted item drops its bare nouns (so "Forty STUDENTS (40) crowd the stop"
yields `Students (40)` only, not a `Crowd` from the verb). `crowd`/`crowds`/`mob` as a bare noun
counts only after an article or adjective (a, an, the, of, large, small, big, huge, noisy, angry,
cheering, thin, whole) or when written in capitals; "They crowd the door" yields nothing. Per scene
the same noun (singular folded to plural by the lexicon's own pairs) keeps its highest count.
Stored text: `titleCase(noun)` plus ` (N)` when counted: `Students (40)`, `Crowd (50)`, `Villagers`.
The count rides in the text (the shape Auto-Tag already folds: "Students (180)" covers "students").
Skipped when the scene already carries an extras item whose words, counts removed and singular
folded, include the noun (a typed `Students` stays; no second `Students (40)` is added). Written with
`Scenes.tagMany`; undo `Scenes.untagMany(written)` (exact strings). Only when `categories` has `extras`.

**tags.** `planTags` = `suggestAll()` rows with a confident pair, categories in `categories`, minus
`cast` (the scenes step tags cast) and `extras` (above). Written with `Scenes.tagMany`, undo
`untagMany`. The step records `ctx.tagged` so `props` (derived) says "N tagged at the lock, M left
to review" instead of "nothing to suggest".

**castcontacts.** Speakers = `castMatrix(scenes, elements).characters` with `lines > 0` (a cue in a
confident scene). Name rule = readiness.js's, now exported by lane B as `contactClaimsName(contact,
name)` (role, role up to its first spaced dash/bracket, or name, case-insensitive) and used by the
`cast-uncast` check itself, so there is ONE rule. A speaker no contact claims gets
`blankContact({ name: 'To be cast', role: <name as castMatrix spells it, title-cased from a cue>,
department: 'Cast', notes: 'To be cast. Added from the script lock.' })` via one read-modify-write.
An existing contact (any department) that claims the name blocks it and is never touched. Undo
removes a made contact only while it still equals what was written (same name/role/notes/phone/email).

**recce.** For each `locationIndex(scenes)` row whose `locationKey` has no key in the stored
`recces` (`hasRecce(name)`, new in locations.js): `setRecce(row.name, { bestTime })` where bestTime
is the scenes' times of day, sentence case joined by " and " (`Night`, `Day and night`); blank when
none. The key is `locationKey(name)` exactly as the Plan page keys it (setRecce does this). A stored
recce, even an empty one, is "has one". Undo `removeRecce` only while the record still equals what
was written.

**sheets.** For each shoot day `d` (`shootDayOf(scene) > 0`) whose scenes share no id with any
existing sheet's `sceneIds`: `blankCallSheet({ title: 'Shoot day ' + d, date: dayDate(d) || '',
location: the day's places joined ' / ', sceneIds: orderedDayScenes(d, scenes) ids, calls: { [contactId]: '' }
for each contact that claims a cast name of those scenes, in contact order })`. `generalCall`, `wrap`
and every time stay ''. No cast contact: `calls` empty. Undo `removeCallSheet(id)` only while the
sheet still equals what was written.

**budgetlines.** Lines come from the schedule and the Breakdown, never from rates. New rows take
indexes above `maxRowIndex(data)`; name in `ci_<n>_custom`, `ci_<n>_item` = `'Other (custom)'`,
quantity in `ci_<n>_days`; NO `ci_<n>_rate` key (blank). Lines, in this order, each with days > 0:
`Unit shoot days` (`scheduleFacts().totalDays`); `Cast: <Name>` per speaking character (distinct shoot
days of the scenes that tag them); `Background extras` (distinct days with an extras tag; the largest
stated count goes in the name when any: `Background extras (peak 40)`); `Vehicle: <Name>` per vehicles
tag (distinct days); `Location: <Name>` per location (its day count). A line whose normalised name
(`itemNameOf(custom, item)`, lower case) already exists in ANY row is skipped, so a typed `DOP` row or
a previous run blocks its line. Written with `readCalcData`/`saveCalcData` (the film's currency is the
blob's `ci_currency`, set by `saveCalcData` from the film's region on the first money write; this
step writes none itself, and a film with no region prints exactly as before). Existing keys are
never edited. Undo drops a made row's three keys only while its name and days still equal the
written ones and no rate has been typed.

## 2. Exact exports

`src/lib/lock-extract.js` (lane A, PURE reads plus the two tag/synopsis writers; imports lane B by name):
```
firstSentence(text: string, max = 140): string
synopsisFor(slice): string
extractExtras(slice): Array<{ noun: string, count: number|null, text: string, from: string }>
planSynopses(scenes, elements): Array<{ sceneId, text }>
applySynopses(items): Array<{ sceneId, text }>            // written
undoSynopses(written): number
planExtras(scenes, elements): Array<{ sceneId, category: 'extras', name: string, count: number|null }>
planTags(scenes, elements, categories?: string[]): Array<{ sceneId, category, name }>
tagCountsByCategory(scenes, elements): { [category]: number }   // planTags(all) + planExtras, for the ticks
```
`src/lib/lock-seed.js` (lane B; each `plan*` writes nothing, each `seed*` writes once and returns the records):
```
planCastContacts({ scenes, elements }): number
seedCastContacts({ scenes, elements }): { made: Array<{ id, name, role }>, speakers: number }
undoCastContacts(made): number
planRecce(scenes): number
seedRecce(scenes): { made: Array<{ key, name, record }> }
undoRecce(made): number
planCallSheets(scenes): number
seedCallSheets(scenes): { made: Array<{ id, day, sheet }> }
undoCallSheets(made): number
planBudgetLines({ scenes, elements }): number
seedBudgetLines({ scenes, elements }): { made: Array<{ n, custom, days }>, currency: 'INR'|'USD' }
undoBudgetLines(made): number
```
Also lane B: `locations.js` `hasRecce(name): boolean`; `readiness.js` `contactClaimsName(contact, name): boolean`.

`src/lib/script-pipeline.js` (lane A) gains: `STEPS` entries (ids above, `lockOnly: true`);
`planPipeline({ elements?, numbering?, lock?, categories? })` rows `{ id, label, what, todo, note }`
(the `tags` row also carries `byCategory` = `tagCountsByCategory`); `runPipeline({ …, lock?,
categories? })`; `summarizeRun` fields `synopses, extras, tagged, contacts, recces, sheets, budgetLines`
(each = what THIS run wrote, 0 on a re-run) and `text` gains "N cast contacts to be cast, N recce cards,
N call sheets, N budget lines (rates blank)" when non-zero. Result steps keep `{ status, wrote, count,
detail }` with `count === wrote` for the seven new steps.

`src/lib/sides-script.js` (lane C, pure): `sidesScript(scene, elements, numbering?): null | { how,
elements: Array<{ id, type, text }>, firstPage: string, pages: number }` — `null` unless the pair is
confident; text comes from `printedText(el)`, `pages` from `paginate()`, `firstPage` from
`pageNumbersDoc(paginateDoc(doc))` for the heading id ('' when unknown).
`src/lib/breakdown-model.js` (lane C) gains `suggestionTagsForCategory(scenes, elements, cat)` and
`applyCategory(cat): Array<tag>` (confident pairs, one category, `Scenes.tagMany`; returns the tags written).

## 3. UI contract (lane C)

- Lock sheet: `openLockReview` calls `planPipeline({ elements, numbering, lock: true })` and draws the
  rows generically. Above "Lock and generate" it adds `fieldset.lk-cats` of `input[type=checkbox]
  [data-lock-cat="<id>"]`, one per category with `tags.byCategory[id] > 0`, label `ELEMENT_CATEGORIES`
  label + count, ALL checked. The ticked ids go to `openPipeline({ lock: true, categories })`.
- `openPipeline` passes `lock` and `categories` to `planPipeline` and `runPipeline`; its summary strip
  adds Contacts, Call sheets, Budget lines. Done state with `opts.ai === 'lock'` shows "Enhance with
  AI" (`enhancePill`, which opens `CHAIN`, Phase 3 appends to it; the lock adds nothing to CHAIN).
  The pill is `aiPill`, so a non-Pro or unknown plan gets the locked state (`aiUnlocked()` fails
  closed). Copy says the rules did this and nothing AI proposes is written before Accept.
- Breakdown -> Auto-Tag: beside "Add all", one `button[data-action="sug-cat"][data-cat]` per category
  that still has suggestions, "Accept all <label>"; handler `applyCategory(cat)`, then the existing
  `toastTagged(added, false)` Undo. Paired-by-position scenes are left out, as Add all does.
- Sides (reports.html): each `sideBlock` keeps slug, synopsis and chips and adds `div.rp-side-script`
  with the scene's elements from `sidesScript`, indented from `GEOMETRY[type]`, `--f-script` and the
  `--paper-page` / `--print-*` tokens (print stays black on white; no raw colour); `null` prints
  "The script pages for this scene could not be matched." in place. The block may split across a
  page now (the old "never split" promise is for the header only: `break-after: avoid` on it).

## 4. Proof (`prove_spec`) and tests

Node: `scripts/test-lock-extract.mjs` (`npm run test:lock-extract`, in `test:all`) covers every export
above with `scripts/fixtures/lock-extract.script.json`; `scripts/test-pipeline.mjs` keeps passing
unchanged for non-lock runs and gains a `lock: true` run (second run writes nothing, undo byte-exact).
Browser: see the prove spec handed to the proving lane.
