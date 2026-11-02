# Screenplay Writer: Final Draft parity

Written 2 Nov 2026 on `fd/parity`, after the seven lanes (L1 to L7) were merged into it. The target is a writer
who knows Final Draft and should not have to relearn the basics. Where Celtx or a web tool does something
better or differently, it is noted, not copied.

Status legend: **Had** = already in the app before this round (origin/develop). **New** = built this round.
**Changed** = existed, behaviour changed. **Open** = not built, with the reason.

Not built this round, and why, is in the last section. Read it before claiming parity on any row.

## Writing flow

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Return moves to the next element (Final Draft's flow) | Had | Had | `returnNext` in `write-presets.json`. Unchanged; `act` added as a new row (Return gives a scene heading). |
| Tab cycles the element type on an empty line | Had | Had | Unchanged. |
| Tab on a filled Action line inserts a Character line below | Had (Tab on empty only) | New | One added entry in `write-presets.json`. Esc then Tab still leaves the editor. |
| Smart Type: character, location and transition word lists | Had | Had | `src/ui/smarttype.js`, `write-presets.json` word lists. |
| Auto-format: a line switches type as it is typed | Partial (scene headings in Action, a few marks) | Changed | `inference.js` now switches any line type: scene headings in capitals, `CUT TO:` and other `TO:` transitions, `(` into dialogue, a known name alone on a line becomes a cue on Return. Each switch is **one undo step** and that line is not switched again. A line the writer typed the type of is never switched. |
| "Name says" on Return (`NAME says, "..."` becomes cue, parenthetical, dialogue) | No | New | `parseSaysLine()` in `inference.js`. Keeps the cue's id so notes stay attached. One Ctrl+Z restores the line. Guards: Action lines only, verb needs a comma, colon, "that" or quotes; "says nothing" stays action. |
| Element picker and Alt+digit element keys | Had | Had | Digit map per preset. Final Draft preset: Alt+8 lyrics, Alt+9 centered. Alt-only, matched on `e.code`, so no browser Ctrl key is taken. |
| Undo and redo for the whole editor | Partial (per-action "Undo" toasts only) | New | `src/lib/edit-history.js`: one history, typing in a line is one step per burst (1 s pause, caret move, line change or type change starts a new one), paste is always its own step. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y. Cmd+Y left alone (Safari History). Memory only, up to 300 steps, cleared when a different document is loaded. `test:history` (33). |
| Dual dialogue | Had | Had | Unchanged. The automatic (CONT'D) is not applied inside dual blocks (see Open). |
| Manual CONT'D button | Had | Had | Same rule as the automatic one (`contdOffer` in `script.js`). |
| Automatic (CONT'D) on a cue that continues after a break | No | New | Same speaker, only action between, same scene. Off unless the preference is on (a Settings card, `autoContd` in `fms_studio_prefs_v1`; absent means on). Display only: never written into the element text. Not doubled, and an extension stays first: "RAVI (V.O.) (CONT'D)". |
| Find and replace (Ctrl/Cmd+Shift+H) | Had | Changed | Now one `replaceAll` checkpoint, so one Ctrl+Z undoes it. Find opens every fold. |
| Typewriter scrolling (caret line held at 40% of the viewport) | No | New | `src/ui/script-editor/typewriter.js`. Instant under reduced motion; glides only for re-centres of more than half a screen. `typewriter` pref. Toggle in the Tools menu. |
| Read aloud (narrator, a voice per character, Play from here / Play scene) | No | New | `src/lib/read-aloud.js` decides what is read and by whom: a cue is never read, dialogue takes its cue's voice. Pause, Stop, Speed, Skip parentheticals. Nothing is uploaded. Choices in `readAloud` in `fms_studio_prefs_v1`. Real voices not tested in this sandbox (see Open). |
| Dictation (speech to script, English) | Had (on by default) | Changed | Now **off until the writer switches it on**. The first start shows a notice that Chrome sends audio to Google; the answer is stored as `dictation: {on, noticed}`. "new line", "new paragraph", "comma", "question mark", "full stop" are commands. A spoken new line always ends the line; a pause ends it only where auto-format has work to do. |
| Macros (Alt+Shift+digit inserts a snippet) | No | New | `src/lib/macros.js`, nine defaults: (beat), CONTINUOUS, CUT TO:, (V.O.), (O.S.), DISSOLVE TO:, LATER, FADE OUT., (pause). Each snippet can create an element, append to the line, or put the caret somewhere. One undo step. Edited in Settings → Preferences → Screenplay; stored as `macros` only when it differs from the defaults. Ctrl+Alt is not used (AltGr on Windows). |

## Elements

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Scene heading, Action, Character, Parenthetical, Dialogue, Transition | Had | Had | Unchanged. |
| Shot | Had | Had | Unchanged. |
| General (text) | Had (aliased to Action in the Final Draft preset) | Had | Unchanged. |
| Centered text (`>text<`) | No | New | Centered on the 60-character measure in the text export; centered in the editor, page view and PDF. Return gives action. FDX: General paragraph with Center alignment. Word: `Centered` style. |
| Lyrics (`~` prefix, italic at dialogue indent) | No | New | Return gives action. Counts as sung speech for dialogue pacing. FDX `Lyrics`; Word `Lyrics` style. |
| Act break (`ACT TWO`, `END OF ACT ONE`, picker, type cycle) | No | New | Shared pattern in `src/lib/act-line.js` (importer, Fountain export, inference). Bare `ACT` is not an act (could be a name). An act starts a new page in the PDF; END OF ACT stays on the page it closes. Return after act gives a scene heading. FDX `New Act` / `End of Act` with `StartsNewPage`; Word `pageBreakBefore`. |
| Bookmark (margin tab on a line) | No | New | Additive `mark: true` on the element, no new key. Alt+B toggles, Alt+] and Alt+[ step round (wrapping). Hidden in print. |
| Scene numbers in both margins of a heading | Had (PDF, locked scripts) | Changed | Editor shows them too (hidden below 720px and while the line is focused or hovered). A locked script's plain PDF export now prints them in both margins. |

## Pages

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Page breaks shown in the editor | No (estimate only) | New | Live breaks from `src/lib/paginate.js`, the same paginator the PDF uses. Each break is a thin rule with its page label. Recomputed after the 400 ms pause and in an idle slot, never on a keystroke. |
| MORE / CONT'D at a page break | PDF only | New in editor | A dialogue split across pages shows (MORE) above the rule and NAME (CONT'D) under it. Decoration only (aria-hidden, not selectable, not stored). |
| Caret strip shows the real page and eighths | Estimate | New | `caretPosition()` uses the paginator's pages, including locked labels like 12A. |
| Locked pages (A-pages) | Had | Had | `lockPages` / `pageStarts`. `test:production` now proves a scene added between 1 and 2 becomes 1A then 1B. |
| Revision mode: asterisks in the right margin on every line changed since the locked draft | No | New | Compared against `numbering.base`. Current revision colour (the existing issued-draft rule). Dual dialogue marked once. Writes nothing while idle. |
| PDF revision header ("Blue Revision · date") on each revised page | No | New | Plus an "Export PDF on revision colour" item in File, printing revised pages on the colour via `--print-rev-*`. |
| Fit to page (cheat up to 4 lines) | No | New | `src/lib/fit-page.js`. Trims top and bottom margins only (never the gutter), up to 0.25 in plus one line of tighter spacing. Shows page count per option, previews the PDF, saves `fitPage` per project in `fms_studio_prefs_v1`. Never changes the text. |

## Navigation

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Scene navigator (Ctrl/Cmd+Shift+S) | Had | Changed | Now three tabs: Scenes, Characters, Bookmarks. Alt+C opens on Characters. |
| Character navigator: dialogue count, scenes, first scene; Return jumps to the next cue | No | New | `characterIndex()`, `nextCueOf()`, `baseName()` in `src/lib/script-index.js`. Groups by cue name with extensions stripped (MOM and MOTHER are not merged). Nothing stored. |
| Bookmarks list and next/previous bookmark | No | New | See Elements. |
| Fold a scene; fold all; unfold all | No | New | Memory only, reset on reload. Arrow keys skip folds; the caret's own scene never folds under it. |
| Reorder scenes (Alt+Up/Down, drag in the navigator, Alt+Return folds) | No | New | `src/lib/script-structure.js`. A scene block runs to the next heading or act break; ids are kept, so the scene sync relinks rows. One undo step. Locked scripts keep the moved scene's number and the change report lists it as moved. |
| Split view (second pane on the same script) | No | New | 1100px and wider. Own scroll, same elements, edits save through the page's normal save and undo. Off below 1100px. |
| Tools menu, phone Tools sheet, shortcut sheet | Had | Changed | Gained: character navigator, bookmarks, typewriter, read aloud, check names, reports, statistics, split view, fold items. |

## Helpers

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Spell check | Browser's, on everywhere | Changed | Switched off on name lines (scene, character, transition, shot, act), where a browser flags every cast name. Still on in action and dialogue. |
| Check names (cast-name suspects in prose) | No | New | `nameSuspects()`: cues are the correct spelling; flags words 1 to 2 edits from a cast name that are used far less than it. "Fix every instance" runs `replaceAll` (whole word, case kept) as one checkpoint. "Ignore" list lives for the visit only. |
| Script statistics (words, pages, scenes, INT/EXT, DAY/NIGHT, dialogue share, longest scenes) | No | New | `src/lib/script-stats.js`. Pages come from the PDF's layout and are labelled estimated until it has loaded. A heading with no time is "Not stated", not DAY. Nothing stored. |
| Reports: scene, location, character | No | New | File menu. Read from the pages the PDF prints (so 1A and 12-13 show). Printed via `PDF.exportPDF`. |

## Structure

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Scene reorder with ids kept | No | New | See Navigation. |
| Scene fold | No | New | See Navigation. |
| Act structure in the editor | Partial (headings only) | New | Act break element; act page break in PDF. |
| Draft compare: inline | Had | Had | `script-diff.js` (also used by the script-lock change report). |
| Draft compare: side by side | No | New | `sideBySide()` in the Compare panel on drafts.html. Read-only; the layout choice is not stored. |

## Production

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Scene numbers and script lock (soft gate, change report) | Had | Had | `docs/SCRIPT-LOCK.md`. Unchanged. |
| A-pages and A-scenes | Had | Had (now tested) | `lockNumbering` / `settleNumbering` and `lockPlan` / `pageNumbersDoc`. Proved in `test:production`. |
| Revision colours and revision asterisks | Colours existed in PDF; no per-line marks | New marks | See Pages. |
| Fit to page | No | New | See Pages. |
| Production reports | No | New | See Pages / Helpers. |

## Import and export

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Final Draft .fdx import and export | Had | Changed | New types: Centered is a General paragraph with Center alignment; Lyrics is `Lyrics`; act is `New Act` / `End of Act` with `StartsNewPage`. An FDX Action paragraph with center alignment still imports as action (see Open). |
| Fountain import and export | Had | Changed | `>x<` and `~x` round-trip. Act lines go out as plain capitals. An act the pattern does not recognise (e.g. INTERMISSION) comes back as centered: lossy. |
| Word (.docx) import and export | Had | Changed | Styles `Centered`, `Lyrics`, `NewAct`, `EndOfAct`. No docx round-trip test for the new types (see Open). |
| PDF export | Had | Changed | Revision header and asterisks, scene numbers in both margins for locked scripts, fit to page, act page breaks, MORE/CONT'D (plus automatic on the screenplay page). |
| Plain text export | Had | Changed | Centered and act lines on the middle of the 60-character measure; lyrics at indent 10; act starts a new page. |

## Collaboration

| Feature | Before | Now | Notes |
| --- | --- | --- | --- |
| Shared script, last write wins | Had | Had | Unchanged. |
| Presence (who else has the script open) | Had | Had | Private Realtime channel `pr:<pid>` (item 39). |
| Co-editing merge by element id | Had (gated by §49) | Had | `script-merge.js`. Unchanged this round. |
| Real-time co-editing (simultaneous typing in one line) | No | **Open** | Needs a server-side sync channel and conflict handling; not started. See below. |

## Still NOT built, and why

- **TV format templates (teaser, act-by-act TV layouts, multi-episode title pages).** Not chosen this round. The app templates only the Feature and Short formats.
- **Real-time co-editing.** Simultaneous typing in one line needs a server that orders edits and resolves conflicts. The app is local-first and the current co-editing merges whole elements, last write wins on the script blob. Building it is a server project, not a Writer change.
- **A spell-check dictionary beyond the browser's.** The app cannot add words to the browser's dictionary, and Chromium offers no per-word ignore in a textarea. The name-aware check (above) covers the cast-name case. A custom dictionary would be a new stored key and a new word list to maintain; not chosen.
- **A dedicated act shortcut (Alt+10).** There is no digit for act; it is reached from the picker, the type cycle, or by typing ACT TWO. The lane did not add one.
- **Automatic (CONT'D) inside dual dialogue.** Final Draft applies it there; not built.
- **Automatic (CONT'D) in the locked page's pass and the .fdx export.** They still paginate without it. It changes line counts only when a cue of 30+ characters wraps once CONT'D is added.

## Open issues from the lanes (not resolved this round)

- Real speech was never exercised. Read aloud and dictation were proved against fake speech APIs in the sandbox (`prove:helpers`). Check both with real voices and a real microphone.
- Dictation commands are English only. "new line" in the middle of a sentence is treated as words.
- The "says" guards (Action only; a manner verb needs a comma, colon, "that" or quotes) are the lane's own choices. The owner may want them changed.
- The "writer chose the type" rule: a line whose type the writer set is never auto-switched. If the owner wants those switched too, remove the explicit-set check in `createInference`.
- Typing-time transitions wait for the closing `.` or `:`. Return accepts them without it.
- Undo does not own changes made by code outside the editor (AI apply, scene sync, lock seeding). If the page is swapped to a new document the history clears. Find-and-replace and alternate-take swaps do ask for a step.
- Split view rebuilds its second pane after each structural edit. Text edits only in that pane.
- Folds, the split-view toggle and the dictation "ignore" list are memory only.
- Touch screens: scene reorder is by Alt+Up/Down or keyboard; the drag works with a mouse only.
- Moving a scene later lands it in front of the next heading, so it can cross an act break. Consistent and tested, but to be confirmed as wanted.
- Revision asterisks mark everything changed since the locked draft, not since the last issued colour.
- The fit-to-page cheat applies to the PDF only. The editor's page view and the .txt export use the standard page.
- Bookmarks are not carried into revision snapshots or restores.
- Typewriter's resting height was not checked by eye; the proof checks only the toggle and the pref.
- Focus mode's top strip still uses the estimated page, not the paginator's.
- Only screenplay.html passes the automatic CONT'D and the fit-page setting. `write.js` (now a redirect), `drafts.js` and the sides printer print cues as typed.
- AI pages (`ai.js` PAGE_ELEMENT_TYPES), the read-as view (`read-as.js`) and the format rules (`format-rules.js`) do not know the new types (centered, lyrics, act).
- Browser-proof coverage: `prove:helpers`, `prove:production`, `prove:script-structure` are registered in `package.json` but are not in `.github/workflows/gate.yml`.

## Checks behind this table

Node, all green on `fd/parity` after the merges: `test:paginate` (64), `test:keys` (203), `test:inference` (129), `test:history` (33), `test:elements` (34), `test:production` (56), `test:screenplay` (214), `test:import` (144), `test:fdx` (67), `test:script-lock` (59), `test:paper`, `test:undef`.

Browser, against `build:open`: `prove:script`, `prove:script-lock` (54), `prove:helpers`, `prove:production` (17), `prove:script-structure`.

Lane branches: `fd/l1-flow` through `fd/l7-production` (merged into `fd/parity`). Nothing pushed.
