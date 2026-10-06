# Screenplay writer: plan

Written 6 Oct 2026 for the owner's ask, which had six parts:

- give input from Final Draft for script-writing ideas;
- a guided screenplay format;
- a screenplay format like Final Draft, Celtx or StudioBinder;
- a focus mode;
- Final Draft and Celtx shortcut presets;
- story beats into the screenplay.

**Status: BUILT, 6 Oct 2026** — all six phases, with the recommended
answer taken for each of the four decisions below. CLAUDE.md open item
15 records what landed and where.

## 0. What Final Draft (13), Celtx and StudioBinder actually do

Final Draft's own site is blocked from the build sandbox. The facts
below come from search results quoting Final Draft's product pages,
its knowledge base and blog, and the shortcut listings of DefKey,
Celtx support and StudioBinder. The sources are at the end.

| Area | Final Draft 13 | Celtx | StudioBinder | Ours today |
| --- | --- | --- | --- | --- |
| Element shortcuts | Cmd/Ctrl+1 Scene Heading, 2 Action, 3 Character, 4 Parenthetical, 5 Dialogue, 6 Transition, 7 Shot | Ctrl+1 Scene, 2 Action, 3 Character, **4 Dialogue, 5 Parenthetical** (the order differs), 6 Transition, 7 Shot, 8 Text | Hotkeys (not published per key) | None (a select per line) |
| Return (next element) | Scene → Action, Character → Dialogue, Dialogue → Action. Each element's "next" can be changed in Format › Elements. | Character → Dialogue | Auto | Same as Final Draft's defaults, fixed |
| Tab | Dialogue → Parenthetical, Parenthetical → Dialogue; a blank Character → Transition; Tab on a character cue → Parenthetical | Tab cycles the line's element | — | Not used for elements |
| Autocomplete | **SmartType**: character names, locations, times, extensions | Auto-complete | Auto-complete | None |
| Dual dialogue | Cmd+D to create, Cmd+Shift+D to edit | Yes | Yes | None |
| Notes | **ScriptNotes**, Cmd+Shift+K | Comments | Comments | Comments per field |
| Structure | **Beat Board**, **Outline Editor** with custom lanes, **Structure Lines** colouring acts, sequences and scenes, Navigator 2.0 | Index cards | Outline notepad: bullets, checkboxes, media | Story page beats, not linked to the script |
| Focus | **Focus Mode** shows only the pages. **Typewriter mode** keeps the line about ⅓ down the screen, marked by a frame, a line or nothing. A **Midnight** dark theme. | — | Auto-save, distraction-light | None |
| Goals | Daily, weekly or project goals; productivity stats; a sprint timer | — | — | None |
| Characters | Character development tools | Character catalogue | — | Cast matrix, screen time |
| Production link | Reports | Breakdown, storyboard, schedule | Breakdown, storyboards, shot lists, schedule, call sheets | **Already the whole chain**, which is our edge |

**What that means for us.** The production chain after the script is
already deeper than Final Draft's and matches StudioBinder's. What we
lack is the **writing feel**: shortcuts, Tab and Return flow,
autocomplete, the page view, focus, and structure tied to the script.
That is what this plan builds.

## 1. Ideas worth taking, plus our own

From the three apps:

1. **Element shortcuts with two presets, Final Draft and Celtx.** The
   preset decides the number order, because Celtx swaps 4 and 5.
2. **Tab and Return flow you can change**, per element, like Final
   Draft's Format › Elements, with its defaults as ours.
3. **SmartType-style autocomplete.**
   - Suggests character cues, INT./EXT./INT./EXT., locations, DAY /
     NIGHT / CONTINUOUS / LATER, and the extensions (V.O.), (O.S.) and
     (CONT'D).
   - Learns from this script's own text.
   - Accepted with Tab or Enter, and never auto-inserted.
4. **Dual dialogue**, side by side, in the editor, the PDF and the
   Final Draft import and export.
5. **Script notes** on a line, visible in the editor and absent from the
   PDF. This reuses the existing comments module.
6. **Beat Board and outline.** Our Story page's beats become cards in
   columns, one per act, plus a scene outline tied to the script.
7. **Structure lines.** A coloured margin rule shows which act or
   sequence a scene belongs to.
8. **Focus, Typewriter and Night.** The page alone, the line held about
   ⅓ down the screen with a frame, line or no marker, and a dark page.
9. **Goals and sprint.**
   - Pages, words or minutes per session or per day.
   - A sprint stopwatch and a streak.
10. **Page view.**
    - White US-Letter or A4 pages, live page breaks, scene numbers in
      both margins, a "page N of M" counter.
    - (MORE) and (CONT'D) shown live, using the export's own
      pagination so the screen and the PDF never disagree.
11. **Title page**, from the project's title, writer, draft, date and
    contact.
12. **Shot element**, which all three apps have and we lack.

Our own, because no one else is built for a Tamil unit:

13. **Tanglish-aware autocomplete.** Cues and dialogue suggestions in
    romanised Tamil, plus optional Tamil-script transliteration for
    dialogue, while slugs and action stay English. The page grid stays
    arithmetic.
14. **A format guide that explains.** Each warning says why the rule
    exists: "An action block over 4 lines reads slow on the page."
15. **Beat coverage.** "Midpoint has no scene yet", "Act 2 runs 18
    pages over its share", drawn from the Story page's framework and
    pacing data.
16. **Read as a character.** Dim everything except one role's lines,
    for actors and for checking a voice.
17. **Dictation** through the browser's own speech input, Chromium
    only, labelled as such. Useful on set and on a phone.
18. **One-click production hand-off.** After a writing session, the
    Breakdown already shows new scenes. A banner says "3 new scenes
    since your last breakdown" and links there.

## 2. The plan, phased

Each phase ships on its own and is reversible. Every phase must keep
`verify`, `test:screenplay`, `test:pdf` and `prove:storage` green, and
adds its own checks. Storage rules from CLAUDE.md apply throughout:
new element types and new fields are **additive**, old scripts load
unchanged, and no key is renamed.

### Phase 1: the format engine

- **New elements: `shot`, plus `dual` as a flag on a dialogue group.**
  - Old scripts have neither, so they read back the same.
  - Updated to know them: `screenplay-export.js` (PDF), the Final Draft
    and Fountain import and export, `screenplay-analysis.js` (a shot
    is not a new scene), and the Breakdown pairing.
- **Character extensions.** (V.O.), (O.S.), (CONT'D) and others are
  typed or picked. (CONT'D) is offered automatically when the same
  character speaks again after action.
- **Title page** as a document in write.html's Documents tab, and as
  page 1 of the PDF when present.
- **Page view.**
  - Pages drawn from the export's own pagination function, so the
    screen and the PDF agree by construction.
  - Scene numbers in both margins and a page counter.
  - It must keep the editor fast: the C2 work used per-run
    `content-visibility`, so pages become those runs.
- **Done when:**
  - the sample script shows the same page count on screen as in its PDF;
  - an .fdx with dual dialogue and shots round-trips;
  - load stays under 2 seconds on the sample.

### Phase 2: keyboard presets (Final Draft / Celtx)

- **A browser limit, decided first.** Chrome reserves Ctrl+1–8 for
  switching tabs, and Cmd+1–8 on a Mac, and a web page cannot take
  them. So each preset maps its number order to **Alt/Option+1–8**,
  which a page can catch. It uses Ctrl/Cmd+1–8 only where the browser
  allows it: the installed app window and the extension's side panel.
  This is confirmed in a real Chromium before anything else is built.
  If Ctrl/Cmd+number is catchable there, the preset uses it there.
  **Measured (6 Oct 2026), and the premise was wrong for Chromium on
  Linux:** with real X11 key events into a headful Chromium with two
  tabs, Ctrl+1–8 and Alt+1–8 both reach the page first, and
  `preventDefault` keeps the tab (Ctrl+T, a reserved key, never
  arrives). So Alt/Option+number is the binding everywhere, by
  `e.code`, and Ctrl/Cmd+number is on by default in the app window and
  the side panel and an opt-in in a browser tab, where it would take
  tab switching away while the caret is in a line. macOS Cmd+number,
  Safari and Firefox were not measured. See `src/lib/write-keys.js`.
- **The two presets:**

  | | Final Draft preset | Celtx preset |
  | --- | --- | --- |
  | 1 | Scene Heading | Scene Heading |
  | 2 | Action | Action |
  | 3 | Character | Character |
  | 4 | Parenthetical | Dialogue |
  | 5 | Dialogue | Parenthetical |
  | 6 | Transition | Transition |
  | 7 | Shot | Shot |
  | 8 | — | General text |

- **Tab and Return flow**, Final Draft's defaults:
  - Return: Scene → Action, Action → Action, Character → Dialogue,
    Paren → Dialogue, Dialogue → Action, Transition → Scene.
  - Tab: Action (empty) → Character, Character → Parenthetical, Paren →
    Dialogue, Dialogue → Parenthetical, Character (empty) →
    Transition.
  - Enter on an empty element cycles its type.
  - Each "next" can be changed in a small settings panel, like Format ›
    Elements.
- **Other shortcuts:**
  - dual dialogue: Alt+D, or Cmd/Ctrl+D where catchable;
  - insert note: Ctrl/Cmd+Shift+K;
  - navigator: Ctrl/Cmd+Shift+S;
  - focus mode: Ctrl/Cmd+Shift+F;
  - a printable shortcut sheet, and the `?` sheet updated.
- **Autocomplete** (idea 3) lands here, because it is keyboard flow.
- **Storage:** the preset and any changed flow are one per-device key,
  `fms_write_prefs_v1`. It goes into `ALL_KEYS` (so reset clears it)
  and `GLOBAL_KEYS` (it travels with a backup, like the theme).
  Confirm that in decision 2.
- **Done when:** a scripted keyboard-only session writes the sample's
  first scene with no mouse, in both presets, with a test asserting
  each mapping.

### Phase 3: the guided screenplay format

- **Ghost hints** in an empty element, such as "INT. OR EXT. LOCATION –
  DAY", "CHARACTER NAME" and "(beat)". They are placeholders, not text.
- **Live format checks.** Each is quiet, inline, dismissible and
  explained:
  - a heading without INT/EXT or a time;
  - a character cue not in capitals;
  - an action block over 4 lines;
  - a parenthetical over 1 line or with a capital start;
  - dialogue with no speaker;
  - a transition that is not right-aligned or ends without a colon;
  - (CONT'D) missing;
  - a scene over 4 pages.
  - The rules are content in `src/data/format-rules.json`, so the copy
    is editable without code.
- **First-run guided tour** on an empty script: six steps, one per
  element, each written by the user, ending with their first scene.
- **Guide level:** Off, Hints or Coach, per device, in the same prefs
  key.
- **Done when:** each rule has a unit test with a positive and a
  negative case, and the sample script shows no false positives on
  correctly formatted scenes.

### Phase 4: focus mode

- **Focus.** Ctrl/Cmd+Shift+F, or a button, hides the band, the rail,
  the tab strip and the action bar, leaving only the page. Esc or the
  same keys exit. The Fullscreen API is optional, with a CSS-only
  fallback.
- **Typewriter.** The current line is held about ⅓ down the screen,
  marked by Frame, Line or None. It uses `--motion`, so reduced motion
  gets no animated scroll.
- **Dim the rest.** Every element except the current scene is shown at
  reduced contrast, still AA for the active text.
- **Night.** Uses the existing ink theme with a page-tinted surface; no
  new palette.
- **Goals and sprint.**
  - A session goal in pages, words or minutes, and a sprint stopwatch.
  - Progress is a thin bar that never steals focus.
  - Daily history is a per-project key, `fms_write_goals_v1`, added to
    all five registries. History is computed from saves, so idle
    writes stay at zero.
- **Done when:**
  - it is green at 390, 1280 and 1920;
  - the idle-write check passes with focus mode on;
  - the autosave flush still runs on exit and on reload.

### Phase 5: story beats into the screenplay

- **The link.** Each scene row gains an optional `beatId`, an additive
  field on the scene model, the same pattern as `songId` and
  `shotState`. The beats are the Story page's framework beats: Three
  Act, Save the Cat or Story Circle, whichever is chosen.
- **The beat board (Outline tab in write.html).**
  - Columns are acts. Cards are the framework's beats, carrying the
    synopsis passages already tagged on the Story page.
  - Scenes sit under each beat card and can be dragged between beats.
  - Structure-line colours come from the act's hue token.
- **"Draft scenes for this beat".**
  - Makes placeholder scenes: a heading prompt plus one action line
    carrying the beat's own words.
  - Optional AI: the existing staged synopsis-to-script pipeline drafts
    the scene list for one beat. It is gated on a key, like every AI
    call.
- **In the editor:** beat markers in the margin, and a beat navigator
  that jumps to the first scene of a beat.
- **Coverage meter:** beats with no scene, and acts over or under their
  page share, from `frameworks.json`'s pacing data. This also feeds the
  Story page's heatmap.
- **Done when:**
  - beats→scenes→script survives reordering, deletion and an import;
  - a test asserts the coverage numbers on the sample;
  - nothing is written until the user clicks.

### Phase 6: the extras

Read as a character, dictation, the hand-off banner, alternate takes of
a line, and Tanglish autocomplete. Each is small, and each is listed
because it was asked for or is unique to us. They are ordered after
the core is solid.

## 3. Risks and how they are handled

- **Browser-reserved shortcuts:** handled in phase 2. Proved in
  Chromium first, with the Alt fallback stated in the shortcut sheet
  rather than hidden.
- **Editor speed:** every phase re-measures load and Enter on the
  2,361-element sample against the C2 targets (load under 2 seconds,
  Enter under 100ms).
- **Page-count truth:** the page view and the PDF share one paginator,
  and `test:pdf` and `test:screenplay` assert they agree.
- **Trademarks:** we say "Final Draft-style" and "Celtx-style"
  shortcuts. Keyboard conventions and screenplay format are industry
  standards. No logos, names in product UI copy, or look-alike screens.
- **Storage:** every new field and key is additive and named here. The
  `verify` data-key check and `prove:storage` guard it.

## 4. Decisions needed before building

1. **Order.** The recommendation is the order above: format engine,
   keyboard, guide, focus, beats, extras. The alternative is focus mode
   first, as a quick win.
2. **Writer preferences.** Should the preset, the Return/Tab flow and
   the guide level travel in backups like the theme does (recommended),
   or stay on the device only?
3. **Beats into scenes.** Placeholder scenes only when clicked
   (recommended), or automatically when a beat is tagged?
4. **New elements.** Add Shot and dual dialogue (recommended), or keep
   the current six until later?

## Sources

- [Final Draft 13 features (App Store)](https://apps.apple.com/us/app/final-draft-13/id6450966627?mt=12)
- [Final Draft 13 upgrade page](https://www.finaldraft.com/products/final-draft-upgrade)
- [Final Draft 13 Is Here (No Film School)](https://nofilmschool.com/final-draft-13-arrives)
- [Focus Mode & other features (Final Draft blog)](https://www.finaldraft.com/blog/focus-mode-other-features-we-love-for-screenwriting)
- [Typewriter mode (Final Draft KB)](https://kb.finaldraft.com/hc/en-us/articles/27616089179028-How-do-I-use-Typewriter-mode)
- [What keyboard shortcuts can I use in Final Draft? (KB)](https://kb.finaldraft.com/hc/en-us/articles/27977488282644-What-keyboard-shortcuts-can-I-use-in-Final-Draft)
- [Final Draft 13 shortcuts (DefKey)](https://defkey.com/final-draft-13-shortcuts)
- [Next element after Dialogue (Final Draft KB)](https://kb.finaldraft.com/hc/en-us/articles/27837069021076-How-do-I-make-Final-Draft-automatically-go-to-Character-instead-of-Action)
- [Dual dialogue (Final Draft KB)](https://kb.finaldraft.com/hc/en-us/articles/27675427097748-How-do-I-use-dual-dialogue-side-by-side-dialogue)
- [Celtx keyboard shortcuts](https://support.celtx.com/hc/en-us/articles/360051968853-Keyboard-Shortcuts)
- [Celtx Film & TV script editor](https://support.celtx.com/hc/en-us/articles/360009310173-The-Film-TV-Script-Editor)
- [StudioBinder screenwriting software](https://www.studiobinder.com/scriptwriting-software/)
