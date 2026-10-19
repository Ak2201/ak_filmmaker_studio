# Part 04 — Screenplay Writer, Drafts, Breakdown (and the two "retired" pages)

Source: worktree `admin-fixes`. Strings are quoted from code. Global look: ink ground `#120f1c`, cards `#1b1727`, accent `#9575f8`, pill buttons, 16px radius (`--sk-radius`). Eyebrows/labels are uppercase mono (`--f-mono`, JetBrains Mono); display headings use Catamaran. Every page below also carries the shared shell (nav band, stage tabs, crumb, project switcher), the red **NO PROJECT OPEN** banner when no film is open, and the phone bottom bar (Home · Go to · Search · Tools). Those are another part's job; they are only mentioned where they change a screen.

Common facts used below:
- Script storage: `fms_script_v1` (per project). One script = list of elements `{id, type, text}`; types `scene | action | character | paren | dialogue | transition | shot`. Also holds `revisions` (drafts), `titlePage`, `numbering`.
- Scenes: `fms_scenes_v1`. Songs: `fms_songs_v1`. Scene bin: `fms_scene_bin_v1`. Characters: `fms_characters_v1`. Writing goals: `fms_write_goals_v1`. Editor prefs (keyboard preset, hints on/off, focus options): `fms_write_prefs_v1` (device).
- Revision colours (derived, in order): White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, then Double White, Double Blue…
- Breakdown element categories and hues: Cast (rose `#fb7185`), Background (blue `#60a5fa`), Props (sky `#38bdf8`), Set Dressing (slate `#94a3b8`), Wardrobe (magenta `#e879f9`), Hair & Makeup (teal `#2dd4bf`), Vehicles (yellow `#facc15`), Stunts (orange `#fb923c`), SFX (cyan `#22d3ee`), VFX (indigo `#818cf8`), Sound (green `#4ade80`), Animals (tan `#d6a77a`), Special Equipment (pink `#f472b6`).
- Sample project "Dragon feature" (reconstruction, 36 scenes, 105 pages, Tanglish dialogue, English slugs/action). Scene 1: `INT. SCHOOL ASSEMBLY HALL, ASHOK NAGAR - DAY (2014)`, cast YOUNG RAGAVAN, 18 eighths (2 1/4 pages), shoot day 17. Scene 2: `EXT. Ragavan's house, Villivakkam`, 14 eighths, day 16. Scene 3: Engineering college front block, 20 eighths, day 1. Scene 4: College corridor — arrears board, 16 eighths, day 3. Dialogue sample: `YOUNG RAGAVAN` / `(to the hall)` / `Physics-la naalu mark poachu. Question nine.` / `CUT TO:`.

---

## Screenplay Writer — editor surface (`screenplay.html`)

**Purpose** Write the screenplay on a paper-like page, nothing else: no hero, no stats, no row controls. One debounced autosave. Headings typed here become scenes in the Breakdown (scene sync).
**Who sees it / when** Anyone with a project; stage "Screenplay" of the journey. Opened from the stage tab, the dashboard, or `drafts.html` "← Back to the Screenplay Writer". Old `write.html` links forward here.
**Data source** `fms_script_v1`; `fms_write_prefs_v1` (keyboard preset, hints on/off, ctrl-digits, focus marker/dim/night); `fms_write_goals_v1` (per project); `src/data/write-presets.json` (digit order, Enter/Tab flow, SmartType lists, one-line hints per element); `src/data/format-rules.json` (format check copy); plan gate feature `script_import`.

**Layout** (top to bottom)
1. Shell band (shared).
2. **Sticky top bar** `#scTop` (height measured, published as `--sc-top-h`): row 1 crumb; row 2 tools; row 3 hint strip (collapsible).
3. **Page sheet** `section#screenplay`: centred white/paper page max-width 8.5in, Courier-style face (Courier Prime; Noto Sans Tamil last in the stack). At >=720px the page is 11in min-height with padding 1in top/right/bottom and 1.5in left, soft card shadow, 2px corners; text is 12pt-equivalent, measured in characters (`ch`). Below 720px the paper chrome is dropped (flat, full width).
4. Under the page: a one-line hint (empty script only), then "Screenplay done? → Go to Screenplay Analysis".
5. Optional right column: **Beats panel** `aside#beatsPanel` (20rem, pinned under the top bar) when Beats is toggled; the grid becomes `page | beats`.
6. Bottom: **line-type chip bar** `#scChips` (phone chip bar; also present on desktop markup).
7. Hidden stage guide (`#guide`) lives in the main, shown only when URL hash is `#guide`.
Columns: 1280px = one centred column (page) plus optional 20rem beats column; 390px = single column, top bar wraps, chip bar docked at the bottom above the phone nav.

**Page typography (element indents/measures, desktop, in characters)**
| Element | Indent | Width | Style |
| --- | --- | --- | --- |
| Scene Heading | 0 | 60ch | UPPERCASE bold; 2em space above |
| Action | 0 | 60ch | normal |
| Character | 22ch | 38ch | UPPERCASE bold |
| Parenthetical | 16ch | 28ch | italic, muted |
| Dialogue | 10ch | 35ch | normal, no gap after cue |
| Transition | 0 | 60ch | UPPERCASE bold, right-aligned |
| Shot | 0 | 60ch | normal |
Dual dialogue: two columns side by side (cue 6ch/22ch, paren 2ch/24ch, dialogue 0/27ch). Page breaks appear as a dashed rule with a right-aligned mono label `Page 2`, or `Page 3 · continues` when a speech/paragraph splits across pages. When a line has focus, a faint mono label in the left margin names its type (`Scene heading`, `Action`, `Character`, `Parenthetical`, `Dialogue`, `Transition`, `Shot`). Scene Heading is the element the other modules read; Tab/Enter flow is below.

**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Top bar row 1 | Crumb | text | `Screenplay Writer` (bold) · `<project title>` · `<draft label>` · `<status>` | Read-only, dot separators | Draft label: `No draft saved yet`, or `Draft 2`, or `Draft 2 · unsaved draft changes`; status `Saved ✓` / `Saving…` (polite live region) |
| Top bar row 2 | Line type select `#scType` | select | options `Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot` | Changes type of the line under the caret, returns focus to it | Mirrors the caret's line |
| Row 2 | Beats | toggle button | `Beats ◧` | Opens/closes the Beats panel | `aria-expanded`; `.is-on` (accent wash) when open |
| Row 2 | AI pill | menu button | `AI` (becomes `AI · Pro` when the plan lacks AI) | Menu: `Coverage report`, `Dialogue pass (speech at the caret)`, `Critique this scene` — each opens an AI Desk task | Locked: greyed with Pro offer; no key: goes to Settings |
| Row 2 | Focus | button | `Focus` (title `Focus mode — only the page (Ctrl/⌘ + Shift + F)`) | Enters focus mode (see own section) | |
| Row 2 | More menu | `⋯` menu (right aligned) | Headings and items: **File** — `Import Screenplay`, `Export PDF` (hint `working copy`); **Tools** — `Tamil typing` (Alt+T), `Dictation`, `Keyboard shortcuts` (?), `Format check`, `Notes overview` (hint `all notes`); **Help** — `Show or hide hints`, `Stage guide` (hint `questions`), `Write from a synopsis` (hint `AI`) | Each runs its action; Write from a synopsis goes to `write.html?stay=1#generate` | Items carry Material icons (upload_file, picture_as_pdf, translate, mic, keyboard, spellcheck, sticky_note_2, lightbulb, menu_book, auto_awesome) |
| Row 3 | Hint strip `#scTip` | note | `<Type name>` (accent bold) · one-line purpose · `Enter → Action · Tab → Character · Alt+1–7 any type` · optional "What is…?" learn box | Redrawn when the caret line's type or emptiness changes; hidden when hints off | e.g. Character: "The speaker’s name in CAPS. Add (V.O.) or (O.S.) when they are heard but not seen." |
| Page | Line (row) | auto-growing textarea | placeholder by type: Scene `INT. LOCATION — DAY`; Action `What we see.`; Character `CHARACTER`; Parenthetical `quietly`; Dialogue `What they say.`; Transition `CUT TO:`; Shot `CLOSE ON —` | Typing autosaves 500ms later; Enter/Tab/Shift+Tab/Alt+digit change type (below) | Focus: wash background; AI-written line shows tag `AI PASS` + `Undo` |
| Page | Line `⋯` button | icon button, appears on the focused/hovered row (always visible on touch tablets, hidden below 720px) | title `Line actions` | Opens line menu | |
| Line menu | Dropdown `#scLineMenu` (also on right-click; Shift+right-click = browser menu) | menu | `Dual dialogue`, `Add CONT'D`, `Move up`, `Move down`, `Delete` (danger colour) | Arrow keys move, Esc closes. Add CONT'D only on a Character line (else toast "CONT'D goes on a character cue — put the caret in one first.") | Delete asks first if the line has text |
| Page | SmartType popup | listbox near the caret | Scene: `INT. `, `EXT. `, `INT./EXT. `, `EST. `, separator ` - `, times `DAY, NIGHT, CONTINUOUS, LATER, MORNING, EVENING, MOMENTS LATER`; Character extensions `(V.O.)`, `(O.S.)`, `(O.C.)`, `(CONT'D)`; Transitions `CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`, `MATCH CUT TO:`, `FADE OUT.`, `FADE IN:` | Up/Down move, Tab/Return accept, Esc dismiss; character names from the script are offered | |
| Row inline | Dual dialogue toggle | icon `⇄` on the second cue | title `Dual dialogue: set this speech beside the one above` / `…: on — this speech sits beside the one above` | Puts two speeches side by side | `aria-pressed` |
| Row inline | CONT'D offer | small button | `+ CONT'D` (title "Same speaker after action in this scene — add (CONT'D)") | Appends (CONT'D) | Offered, never forced |
| Under page | Empty hint | text + link | `Start with INT. or EXT. — Enter moves on, Tab switches.` + link `Import Screenplay` | Link opens the in-page Import panel | Only while the script is one blank line |
| Under page | Done link | text + link | `Screenplay done?` `→ Go to Screenplay Analysis` | Goes to `breakdown.html#script` | |
| Bottom | Chip bar `#scChips` | six toggle chips | `Scene`, `Action`, `Character`, `Dialogue`, `Paren`, `Trans` | Sets current line's type; chips never steal focus from the line so the phone keyboard stays up | Current type chip `.is-on`, `aria-pressed` |

**Keyboard** (Final Draft preset default; Celtx preset swaps 4/5 and adds 8 = General text → Action). Alt/Option + digit sets type everywhere: Final Draft = 1 Scene Heading, 2 Action, 3 Character, 4 Parenthetical, 5 Dialogue, 6 Transition, 7 Shot. Return: next element by flow (Scene→Action, Action→Action, Character→Dialogue, Parenthetical→Dialogue, Dialogue→Action, Transition→Scene, Shot→Action); on an empty element it cycles type; Shift+Return = line break inside. Tab: empty Action→Character, empty Character→Transition; filled Character→Parenthetical→Dialogue→Parenthetical; Shift+Tab steps back. Esc then Tab leaves the page. Alt+D dual dialogue. Ctrl/⌘+Shift+K note on the line. Ctrl/⌘+Shift+S scene navigator. Alt+T Tamil typing. Ctrl/⌘+Shift+F focus mode. `?` shortcut sheet. Ctrl/⌘+digit only when switched on.

**Lists & tables / cards** None on this screen apart from the lists inside dialogs below.

**Charts/visualisations** None. (Beats panel is a list; Focus mode has a thin progress bar — see those sections.)

**States**
- Loading: none; an empty script gets one blank Scene line in memory (not saved until typed in).
- Empty copy: hint `Start with INT. or EXT. — Enter moves on, Tab switches.`
- Save: `Saved ✓` / `Saving…`; leaving the page with unsaved typing is flushed on pagehide; a leave prompt (`installLeavePrompt`) appears when drafts changes exist.
- No project: shell shows the red `NO PROJECT OPEN — what you do here is kept on this device, and moves into the next project you create.` + link `CREATE OR OPEN A PROJECT →`; the editor still works against the device namespace.
- Export with nothing written: toast `Nothing to export yet — write a line first.`
- Typesetter fails: `The typesetter could not be loaded. Check the connection and try again.`
- Dictation unsupported: `Dictation needs a browser with speech recognition (Chrome).`
- Locked by plan: `Import Screenplay` is guarded by plan feature `script_import` (plan-gate offer opens instead); AI pill locked with "· Pro".
- Hints off toast: `Hints off. Turn them back on from the ⋯ menu.` / `Hints on.`

**Dialogs & overlays** (all on this page)
- **Delete line**: title `Delete this <type lowercase>?` (e.g. "Delete this dialogue?"), body the line text in curly quotes (80 chars), buttons `Delete` (danger) / Cancel.
- **Shortcut sheet** (shared overlay): title `Writing the screenplay — Final Draft preset`; two columns Keys / Does, e.g. `Alt/⌥ 1` Scene Heading … `Return` "Next element, in the type that follows (see the flow)", `Shift Return` "Line break inside the element", `Tab` "Action → Character → Parenthetical → Dialogue; empty Character → Transition", `Shift Tab` "Step the element type back", `Esc, Tab` "Leave the screenplay with Tab (Esc first frees it)", `Alt/⌥ D` "Dual dialogue on this cue", `Ctrl/⌘ Shift K` "Note on this line", `Ctrl/⌘ Shift S` "Scene navigator — jump to a scene heading", `Alt/⌥ T` "Tamil typing on or off — dialogue and parentheticals only".
- **Scene navigator** (modal combobox): heading `Scene navigator`; filter field placeholder `Filter scene headings`; list rows = scene number badge + heading text (`(untitled heading)` if empty); ↑/↓ highlight, Return jumps, Esc returns the caret.
- **Script notes** (`Notes overview`): dialog `Script notes` with ✕; filters Scene (`All scenes`…), kind, state; group headings per scene; each note shows pill `Private` / `Open` / `Resolved`, `author · date`, `On: <line>`, body, replies `↳ author: body`, `Go to line` button; buttons `Download text`, `Download CSV`; empty `No notes on this script yet. Press Ctrl/⌘+Shift+K on a line to add one.` / `No notes match these filters.`; hint `Showing the private notes on this device. Sign in to include shared threads.`
- **Format check panel** (from ⋯ → Format check; its dock bar is hidden): title `Format check`; summary `N to fix · N hints`; rows `Scene N · line N`, severity chip `Fix`/`Hint`, message, `Why?` disclosure, `Got it` dismiss; empty `There is nothing to check yet.`; clean `Nothing to flag. Every line reads the way a screenplay reads.`; `Close`. Level select `Format guide`: `Off` (No guide.), `Hints` (Example text in empty lines.), `Coach` (Hints, quiet format notes as you write, and the first-scene tour.). First-scene tour card (eyebrow `Guide`, title `Write your first scene`, text "Six short steps, one for each kind of line in a screenplay. You write every word; the guide only says what goes where.", buttons `Start the tour` / `Skip`; steps `1 · Scene heading` … `6 · Transition`, convert buttons like `Make this line a Character`; done: `That is a scene…`, button `Finish`).
- Import dialog, Beats panel, Focus HUD: own sub-screens below.

**Sample data** Page 1 of Dragon: Scene Heading `INT. SCHOOL ASSEMBLY HALL, ASHOK NAGAR - DAY (2014)`; Action "Ceiling fans on long stems, turning at four different speeds…"; Action "YOUNG RAGAVAN, 17, aisle seat, fifth row. He is not watching the stage."; Character `YOUNG RAGAVAN`; Parenthetical `(to the hall)`; Dialogue "Physics-la naalu mark poachu. Question nine."; Transition `CUT TO:`. Top bar: `Screenplay Writer · Dragon feature · Draft 2 · Saved ✓`.

**Mobile (390px)** Paper chrome removed (no shadow, no side margins, flat full-width lines, line `⋯` hidden); top bar wraps to 2–3 rows with the hint strip keys wrapping; chip bar (Scene/Action/Character/Dialogue/Paren/Trans) stays above the keyboard (`interactive-widget=resizes-content`); the Beats panel stacks below the page; the more menu is the only route to import/export; page breaks stay as dashed labels.

**Stitch prompt** Dark violet product UI, ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius. A writing page: slim sticky top bar with breadcrumb "Screenplay Writer · Dragon feature · Draft 2 · Saved ✓", a compact line-type dropdown, "Beats ◧" toggle pill, an "AI" pill, a "Focus" pill and a "⋯" overflow menu (File, Tools, Help groups with icons). Beneath, a one-line hint strip: "Character — The speaker's name in CAPS. Enter → Dialogue · Tab → Parenthetical · Alt+1–7 any type". The centre is a US-Letter paper sheet (light cream, Courier Prime 12pt) with a soft shadow on the dark ground, showing a scene heading in bold caps, action paragraphs, an indented bold CHARACTER cue, italic parenthetical, dialogue block, right-aligned bold transition, and a dashed "Page 2" break label right-aligned. A faint mono label "DIALOGUE" in the left margin. Floating line menu: Dual dialogue, Add CONT'D, Move up, Move down, Delete. Bottom chip bar: Scene, Action, Character, Dialogue, Paren, Trans with the current one filled violet.

---

## Screenplay Writer — Beats panel (`screenplay.html`, toggled by "Beats ◧")

**Purpose** Show the story's beat framework as a checklist against the pages written, and jump to where each beat lands.
**Who sees it / when** Writer who toggles Beats; collapsed by default on narrow screens.
**Data source** Script elements + the project's chosen framework and tags from the Story page (`fms_story…` via `beats-panel.js`); target page count 110 for a feature, 15 for a short (format of the open project).
**Layout** Right column 20rem at >=1280px, pinned under the top bar, scrolls on its own; header row (title, framework, caret) then an ordered list. At 390px: full-width block under the page.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Header | Toggle | button | `Beats` · `<framework name>` (e.g. Save the Cat) · caret `▾`/`▸` | Opens/closes the list | `aria-expanded` |
| List | Beat row | button in `<li>` | beat label (left) · optional count badge (title `N marked in the Story`) · `~p.<page>` (right) | Click scrolls to the first scene of that beat, or to the end if not written | Current beat (caret's position) gets `is-current` + `aria-current` |
| Footer | Hint | text | `Not written yet. Around page 24. Taking you to the end.` / `Nothing written yet. This beat sits around page 24.` | Appears after a click | |
**Lists & tables / cards** Row: `Break into Two` · badge `2` · `~p.56`.
**Charts** None (list ordered by target page).
**States** Empty: all beats show their target pages and the nothing-written hint. No framework: falls back to default Save the Cat spine (15 beats).
**Dialogs** none.
**Sample data** `Opening Image ~p.1`, `Theme Stated ~p.6`, `Set-Up ~p.1`, `Catalyst ~p.12`, `Debate ~p.12`, `Break into Two ~p.25`, `Midpoint ~p.55`, `All Is Lost ~p.75`, `Finale ~p.85`, `Final Image ~p.110`.
**Mobile** Stacks under the page, full width; closed by default when the media query matches.
**Stitch prompt** Right-hand side panel, 20rem wide on a dark violet UI (#120f1c ground, #1b1727 card, #9575f8 accent, 16px radius). Header "Beats  Save the Cat  ▾". Beneath, a vertical list of pill-shaped rows, each with a beat name left (Opening Image, Catalyst, Break into Two, Midpoint, All Is Lost, Finale), a small violet count badge and a mono "~p.56" page target right-aligned. The current beat has a violet outline and filled wash. A small muted caption at the foot: "Not written yet. Around page 75. Taking you to the end."

---

## Screenplay Writer — Import Screenplay (`screenplay.html`, `#import`)

**Purpose** Bring a screenplay in from a file or pasted text; read entirely in the browser.
**Who sees it / when** From ⋯ → Import Screenplay, the empty-page link, or deep link `screenplay.html#import` (inline panel instead of a modal).
**Data source** `script-import.js` (Fountain `.fountain .spmd`, plain `.txt`, Final Draft `.fdx .xml`, PDF `.pdf`), `commitImportedScript` writes `fms_script_v1` and the scenes; plan feature `script_import`.
**Layout** Modal card (or inline section above the page when via `#import`): head row with `Import Screenplay` and ✕; body in two steps.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title | h2 | `Import Screenplay` | | |
| Head | Close | icon button | `✕` (aria `Close`) | Esc also closes | |
| Step 1 | Explainer | text | `Choose a PDF, Fountain, plain-text or Final Draft file, or paste the text. It is read in this browser; nothing is uploaded.` | | |
| Step 1 | File button | primary button (label for hidden file input) | `Choose a file…` | accepts `.fountain,.spmd,.txt,.fdx,.xml,.pdf` | |
| Step 1 | Paste box | textarea (6 rows, no spellcheck) | label `Or paste the screenplay`; placeholder `INT. HOSTEL ROOM - NIGHT` ⏎ ⏎ `Arun stares at the board.` | | |
| Step 1 | Read pasted | button | `Read the pasted text` | Parses | Empty → toast `Paste a screenplay into the box first.` |
| Step 2 | Result line | text | `Read “dragon.fdx” as Final Draft: 2,140 lines, 105 pages, 36 scenes.` (format label varies; singular `1 scene.`) | | |
| Step 2 | Mode radio buttons | two pill radios (only if a script already exists) | `Add after what is written` / `Replace the screenplay (a draft is saved first)` | Sets append vs replace | `aria-checked`, `.is-on` |
| Step 2 | Commit | primary | `Import` | Writes and re-renders | |
| Step 2 | Back | button | `Back` | Returns to step 1 | |
**Lists & tables / cards** None.
**Charts** None.
**States** Parse failures (toasts): `That file was empty.`, `That file could not be read as a screenplay.`, `Nothing in that file looked like a screenplay.` (or the parser's first warning, e.g. encrypted / scanned PDF refusals), `The screenplay parser could not be loaded. Check the connection and try again.` Success toast: `Imported 2140 lines and 36 scenes. Next: Screenplay Analysis.` Locked by plan: plan-gate offer replaces the dialog.
**Dialogs** Replace confirm: title `Replace the screenplay?`, body `A draft of the current one is saved first, so it can be restored.`, buttons `Replace` / Cancel.
**Sample data** File `dragon.fdx`, Final Draft, 2,140 lines, 105 pages, 36 scenes.
**Mobile** Modal fills the width; buttons stack; paste box full width.
**Stitch prompt** Modal card on dark violet UI (#1b1727 card over a dimmed #120f1c scrim, 16px radius, accent #9575f8). Header "Import Screenplay" with a ✕. Body: muted explainer line "Choose a PDF, Fountain, plain-text or Final Draft file, or paste the text. It is read in this browser; nothing is uploaded.", a filled violet pill button "Choose a file…", a labelled textarea "Or paste the screenplay" with a Courier placeholder "INT. HOSTEL ROOM - NIGHT", and an outlined pill "Read the pasted text". Show also the second state: a result sentence "Read “dragon.fdx” as Final Draft: 2,140 lines, 105 pages, 36 scenes.", two radio pills (Add after what is written / Replace the screenplay), then a violet "Import" and an outlined "Back".

---

## Screenplay Writer — Focus mode (`screenplay.html`, button "Focus")

**Purpose** Hide everything but the page; typewriter scrolling; session goal, sprint timer, seven-day history.
**Who sees it / when** Writer presses `Focus` or Ctrl/⌘+Shift+F; Esc leaves.
**Data source** `fms_write_goals_v1` (written after a script save, never on a timer); `fms_write_prefs_v1` (`focusMarker` frame/line/none, `focusDim`, `focusNight`). Sprint stopwatch is memory only.
**Layout** Full-viewport page, caret line held at one third of the viewport height. Thin progress bar fixed at the top (`role=progressbar`, aria `Session goal`). HUD docked at the bottom: collapsible Options group above one row of controls.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Top | Goal bar | progress | fills left to right | Turns done colour at 100% | `.is-done` |
| HUD row | Exit | pill button | `Exit focus` (title `Leave focus mode (Esc)`) | Leaves | |
| HUD row | Goal readout | text | `212 / 500 words` (pages show one decimal: `1.5 / 3 pages`; minutes: `10 / 25 minutes`) | Updates live | |
| HUD row | Sprint clock | text | `0:00` m:ss | | |
| HUD row | Sprint | button | `Start sprint` (toggles to pause/resume) | Starts stopwatch | |
| HUD row | Reset | button | `Reset` | Clears sprint | |
| HUD row | Options | button | `Options` | Opens/closes options group | `aria-expanded` |
| Options | Goal | number input + select | label `Goal`; input min 0 (step 50 words / 0.5 pages / 5 minutes; defaults 500 words, 3 pages, 25 minutes); select options `words`, `pages`, `minutes` | Saves goal | |
| Options | Marker | select | label `Marker`; `Frame`, `Line`, `None` | Typewriter marker style | |
| Options | Dim the rest | checkbox | `Dim the rest` | | default on |
| Options | Night | checkbox | `Night` | Forces dark theme while focused | default on |
| Options | Full screen | button | `Full screen` | Browser fullscreen | |
| Options | Today | text | `Today: +212 words, +1.1 pages` | | |
| Options | History | ordered list, 7 items | day `Mon` + `+340 w` | | last seven days |
**Lists & tables / cards** History row: `Sat` `+120 w`.
**Charts/visualisations** Session goal bar; seven-day written-words list (numbers, not a chart). Streak is not shown anywhere in this UI (do not invent one).
**States** No goal progress yet: bar empty, `0 / 500 words`. Page outside the page chrome fades (dim).
**Dialogs** none.
**Sample data** `Exit focus · 212 / 500 words · 7:42 · Pause · Reset · Options`; Options: Goal 500 words, Marker Frame, Dim the rest ✓, Night ✓, Full screen; `Today: +212 words, +1.1 pages`; Sun +0 w, Mon +340 w, Tue +120 w, Wed +0 w, Thu +510 w, Fri +90 w, Sat +212 w.
**Mobile** HUD wraps to two rows; options group opens above it; full-screen API may be unavailable.
**Stitch prompt** Distraction-free writing view on near-black violet (#120f1c). Only a centred dimmed script page with the active line highlighted in a violet frame, vertically held a third of the way down. A hairline violet progress bar fixed to the top. A bottom HUD pill-bar on #1b1727 (16px radius): "Exit focus", "212 / 500 words", mono clock "7:42", "Start sprint", "Reset", "Options". An open options tray above it: Goal number field with words/pages/minutes dropdown, Marker dropdown (Frame, Line, None), checkboxes "Dim the rest" and "Night", a "Full screen" button, text "Today: +212 words, +1.1 pages" and seven day chips (Mon +340 w …).

---

## Screenplay tools — AI coverage and Write from a synopsis (`write.html?stay=1`)

`write.html` is **retired**: opened without `?stay=1` it redirects by fragment (`#screenplay`→`screenplay.html`, `#import`→`screenplay.html#import`, `#revisions`→`drafts.html`, `#documents`→`drafts.html#title`, `#outline` and `#characters`→`breakdown.html#script`, `#guide`→`screenplay.html#guide`, anything else→`screenplay.html`). Only two sections survive behind `?stay=1`, titled in the crumb "Screenplay tools": `#coverage` (tab label **AI coverage**) and `#generate` (tab label **Write from a synopsis**). A ghost button `← Back to the Screenplay Writer` sits above the tabs. Linked from Screenplay Analysis ("AI coverage report") and the editor's ⋯ menu. Data: the script, AI key in `fms_ai_key_v1` (no backup), AI plan feature; results are saved inside the script as documents.

### Tab: AI coverage (`write.html?stay=1#coverage`)
**Purpose** A reader's report on the whole script plus a voice check for one character.
**Layout** Single column of cards: title + deck, then an AI panel. Tab strip pinned under the shell (two tabs).
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title/deck | h2 + text | `Coverage` — "A reader’s report on the whole script — premise, structure, character, dialogue, …" | | |
| Panel 1 head | Title | h3 + AI mark | `A reader’s report` `AI` | | |
| Panel 1 | Cost line | bold text | `About N requests` | | |
| Panel 1 | Peek | disclosure | `Show me what the first part sends` | Shows the exact payload | |
| Panel 1 | Run | AI pill | `Run coverage` or `Resume coverage — 2 of 5 read` | Runs the AI Desk `coverage` task in batches | `Start over` secondary button while a checkpoint exists |
| Panel 1 | Caveat | note | `This exact draft already has coverage, below. Running it again bills again.` | | |
| Report | Report select | select | label `Report` | Picks a saved report | Buttons: `Save as PDF` |
| Report | Heading | eyebrow + h | `Script coverage` | | |
| Report | Stale note | note | `Your script has changed since this report was written, so a scene number or a quote may no longer match the page.` | | |
| Report | Sections | definition lists | `Logline as read`, `Protagonist`, `Wants`, `Needs`, `Act breaks found`, findings with scene chip `Sc 12` and quote `“…”` or `No quote — the one given was not in your script, so it was removed.` | | |
| Report | Footer | text | `Saved in Documents as “Coverage”, inside this script, so reopening it costs nothing. Delete it there to remove it.` | | |
| Panel 2 | Voice check | h3 + AI mark + select | `A character’s voice` `AI`; label `Character` with `Choose a character…` | Runs a voice-consistency check | |
**States** Loading: `Loading the coverage tools…`; no key / locked plan: AI pill greys with Pro offer or sends to Settings; error line (role alert).
**Mobile** Cards stack; PDF/Run buttons wrap.
**Stitch prompt** Dark violet UI (#120f1c, cards #1b1727, accent #9575f8, 16px radius). A "Coverage" page with a pinned two-tab strip (AI coverage, Write from a synopsis) and a ghost "← Back to the Screenplay Writer". Card one "A reader's report" with a small AI badge, "About 5 requests", a collapsible "Show me what the first part sends", a violet AI pill "Run coverage". Card two shows a finished report: eyebrow "Script coverage", logline in italics, a definition list (Protagonist / Wants / Needs), "Act breaks found", findings with a "Sc 12" chip and a quoted line, and "Save as PDF". Third card "A character's voice" with a "Choose a character…" select.

### Tab: Write from a synopsis (`write.html?stay=1#generate`)
**Purpose** Three stages: synopsis → beat sheet (cheap) → scene board → pages, each read before the next runs; output lands under a revision.
**Elements (stage 1 "synopsis")**: heading `From a synopsis`; deck "A synopsis becomes a beat sheet, the beat sheet becomes a scene board, and the scene board becomes pages. You read each one before the next one runs. Everything it writes is a draft by a machine, and it lands under a revision so your own pages are never what gets overwritten."; textarea `Synopsis` (7 rows, max 6000, placeholder "A paragraph or three. Who it is about, what they want, what is in the way, and how it ends if you know. The more you give it, the less it invents."); upload of a synopsis file; select `Length` (`Feature — about 100 pages`, `Short — about 15 pages`); select `Language` (`Tamil dialogue · English slugs and action`, `Tanglish throughout`, `Tamil throughout`, `English`) with hint line and, for Tamil throughout, a warning that page count becomes an estimate; AI pill `Draft the beat sheet`; cost line "One request. This is the cheap stage — argue with the structure here, not after a hundred pages exist."; disclosure box `What gets sent, and where` ("What is sent: the synopsis you wrote, the beats as they stand, and for each batch of scenes its own slug lines plus the two scenes either side for continuity. Not your other projects, not your notes, not the rest of the screenplay. Nothing is sent until you press a button, and the key never leaves this device except as the one header that authorises the request.").
**Stage 2 "beats"**: logline, deck "Fifteen beats, the Save the Cat spine the blueprint already teaches.", 15 editable beat rows (name + textarea `<beat> — what happens`), checkbox "Replace the N scenes …", AI pill `Lay out the scenes`, cost line "One request. This one writes the SCENE BOARD — so the breakdown…".
**Stage 3 "pages"**: progress `All N scenes are written. They are in the screenplay above…` with `Start a new one`; run controls `Write all N scenes` / `Resume and write the rest`, AI pill `Next 5 scenes, in the Desk`, `Stop` (danger while busy), `Start over`, text `About N requests`.
**States** Status/error lines under the stage; page figure estimate note when Tamil in action.
**Stitch prompt** Dark violet wizard page (#120f1c, #1b1727 cards, #9575f8 accent, 16px radius) titled "From a synopsis" with a three-step stepper (Synopsis, Beats, Pages). Stage one: big textarea "Synopsis" with placeholder text, an "Upload a file" link, two dropdowns "Length — Feature, about 100 pages" and "Language — Tamil dialogue · English slugs and action", a violet AI pill "Draft the beat sheet", muted cost note, and a bordered disclosure card "What gets sent, and where". Include stage two as a list of 15 beat cards with editable text and a "Lay out the scenes" pill.

---

## Drafts — list (`drafts.html`)

**Purpose** Every saved draft of the screenplay: download, compare, restore, save new, update.
**Who sees it / when** Writer after a pass; reached from the Screenplay stage tab or the editor's draft label. Nothing here writes on render.
**Data source** `fms_script_v1` → `revisions` entries via `src/lib/drafts.js` (`listDrafts`, `saveNewDraft`, `updateDraft`, `restoreDraft`; "changed since last draft" is a hash derived, not stored). Typesetter `screenplay-export.js` loaded on demand for PDFs.
**Layout** Single column max `--measure-wide`: header, action bar, draft list, compare card, title-page card. Sections: `#title` is a nav target and always renders.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Header | Eyebrow | mono caps | `Screenplay · drafts` | | |
| Header | Title | h1 | `Drafts.` | | |
| Header | Deck | text | `A draft is a copy of the script as it stood, with its title page. Save one when a pass is done; print it, compare it with the next, or go back to it. Your working copy is always kept as you type.` | | |
| Bar | Back | button link | `← Back to the Screenplay Writer` | → `screenplay.html` | |
| Bar | State | live text | `No draft saved yet.` / `Nothing written yet.` / `Up to date with Draft 2.` / `Unsaved draft changes since Draft 2.` | | Accent bold when changed |
| Bar | Save new | primary pill | `Save as new draft` | Opens save dialog | |
| Bar | Update | pill | `Update Draft 2` (or `Update current draft`, disabled when no drafts) | Opens update dialog | disabled with no draft |
| List | Empty | text | `No drafts yet. “Save as new draft” makes Draft 1 from the script as it is now.` | | |
| List | Draft row (`ol`, aria `Drafts, newest first`) | card | see below | | Newest row has accent border and tag `current` |
| Row | Colour swatch | 16px square | revision colour (title `Blue revision colour`) | | White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry |
| Row | Name | strong + tag + colour | `Draft 2` · `CURRENT` (accent caps) · `Blue` | | |
| Row | Meta | muted | `14 Oct 2026, 18:40 · 108 pages · 2,310 lines` | | |
| Row | Note | text | optional note, e.g. `Producer notes pass` | | |
| Row | Download PDF | button | `Download PDF` | Typesets that draft's snapshot; header/date from the draft only. Empty → toast `That draft is empty — nothing to print.` | |
| Row | Compare | button | `Compare with…` | Presets From = this draft, To = working copy; scrolls to compare card | |
| Row | Restore | button | `Restore as working copy` | Confirm dialog | |
**Lists & tables / cards** Draft row columns at >=720px: swatch | main (name, meta, note) | actions (right aligned). One example: swatch Blue · `Draft 2` `current` `Blue` · `14 Oct 2026, 18:40 · 108 pages · 2,310 lines` · note `Producer notes pass` · [Download PDF] [Compare with…] [Restore as working copy].
**Charts** None; the revision colour swatch is the only encoding.
**States** Loading none; empty copy above; no project: header, then a single `Title Page` card heading (the red banner explains why); error toast `The typesetter could not be loaded. Check the connection and try again.`
**Dialogs & overlays**
- **Save**: title `Save as Draft 3`; body `A copy of the script and its title page, as they are now.`; optional note field `A note, if you want one (optional)`; buttons `Save as Draft 3` (primary) / `Cancel`. Toast `Saved as Draft 3.`
- **Update**: title `Update Draft 2?`; body `Its copy is replaced by the script as it is now. What it held before is not kept.`; `Update Draft 2` / `Cancel`. Toast `Updated Draft 2.`
- **Restore**: title `Restore Draft 1 as the working copy?`; body (dirty) `The script you have now has changes that are in no draft. Restoring replaces it.` or (clean) `The script you have now matches the latest draft, so nothing is lost.`; buttons (dirty) `Save as Draft 3, then restore` (primary), `Restore anyway` (danger), `Cancel`; (clean) `Restore Draft 1`, `Cancel`. Toast `Restored Draft 1 as the working copy.`
**Sample data** Draft 3 (Pink, current) 14 Oct 2026, 18:40 · 108 pages · 2,322 lines — note "Director pass"; Draft 2 (Blue) 02 Oct 2026, 21:05 · 106 pages · 2,290 lines; Draft 1 (White) 18 Sep 2026, 11:20 · 105 pages · 2,140 lines — note "First full draft".
**Mobile (390px)** Row stacks: swatch + main on top, action buttons wrap beneath (full-width rows); bar wraps with the state text on its own line.
**Stitch prompt** Dark violet product UI (#120f1c ground, #1b1727 cards, #9575f8 accent, pill buttons, 16px radius). Page "Drafts." with a mono eyebrow "SCREENPLAY · DRAFTS" and a deck. An action bar: outlined "← Back to the Screenplay Writer", muted status "Unsaved draft changes since Draft 3." in violet bold, a flexible gap, a filled "Save as new draft" pill and an outlined "Update Draft 3" pill. Below, a stack of draft cards: each has a small coloured square (pink, blue, white), "Draft 3" in display type with a violet "CURRENT" tag and the revision colour name, a muted meta line "14 Oct 2026, 18:40 · 108 pages · 2,322 lines", an optional note, and right-aligned buttons "Download PDF", "Compare with…", "Restore as working copy". The newest card has a violet border.

---

## Drafts — Compare (`drafts.html`, `#dr-compare`)

**Purpose** Scene-by-scene diff between two drafts, or a draft and the working copy.
**Who sees it / when** Appears only once at least one draft exists; pressing `Compare with…` on a row presets it and focuses the To select.
**Data source** `write-revisions.js` compare against `revisions` in `fms_script_v1` (`Working copy` option `live`).
**Layout** Card under the list: title + sub, a row of two selects and a button, then results.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title | h3 | `Compare` | | |
| Head | Sub | text | `What changed between two drafts, scene by scene: lines added, cut and rewritten, with the rewritten words marked inside the line.` | | |
| Row | From | select `#wr-cmp-from` | label `From`; options the drafts | | |
| Row | To | select `#wr-cmp-to` | label `To`; options the drafts plus working copy | | |
| Row | Compare | primary | `Compare` | Runs and writes results into the live region | |
| Result | Summary | bold + text | `Draft 1 → Draft 2: ` `3 scenes touched · 14 lines changed · …` | | Same: `Draft 1 and Draft 2 say the same thing, line for line.` |
| Result | Scene group | block | optional scene number, heading text, tag `new scene` or `cut scene`; changed lines with rewritten words highlighted | | |
| Result | Overflow | note | `And N more scenes with changes.` | | |
**Lists & tables / cards** Group row: `4` `INT. COLLEGE CORRIDOR — ARREARS BOARD - DAY` with inline add/cut/rewrite marks.
**Charts** None.
**States** Hidden entirely when no drafts. Result area is `aria-live=polite`.
**Dialogs** none.
**Sample data** From Draft 2, To Working copy: `Draft 2 → Working copy: 3 scenes touched · 14 lines changed · 5 added · 2 cut`.
**Mobile** Selects and button stack full width; result groups full width.
**Stitch prompt** A card "Compare" on dark violet (#1b1727, 16px radius, #9575f8 accent) with a muted sentence, a row of two labelled dropdowns "From: Draft 2" and "To: Working copy" and a violet "Compare" pill. Below, the result: a bold summary "Draft 2 → Working copy: 3 scenes touched · 14 lines changed", then scene groups headed by a mono scene number and heading, a small "new scene" or "cut scene" tag, and diff lines with green added, red cut and violet-underlined rewritten words.

---

## Drafts — Title Page (`drafts.html#title`)

**Purpose** Edit the seven title-page fields printed as page 1 of every PDF; a draft keeps the title page it was saved with.
**Who sees it / when** Same page, last card; renders in every state (nav target).
**Data source** `titlePage` inside `fms_script_v1`; autosaved 400ms after typing.
**Layout** Card; two-column field grid at >=720px (Contact spans the full width); single column on phones.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title | h2 | `Title Page` | | |
| Head | State | muted text | `Page 1 of every PDF. A draft keeps the title page it was saved with.` / `Empty — the PDF opens on a plain title.` | Updates after save | |
| Grid | Title | text input (max 160) | label `Title`; placeholder = project title | | |
| Grid | Credit | text | `Credit`; placeholder `Written by` | | |
| Grid | Author | text | `Written by`; placeholder `Your name — and a co-writer, with &` | | |
| Grid | Source | text | `Based on`; placeholder `Based on the novel by …` | | |
| Grid | Draft | text | `Draft`; placeholder `First draft` | | |
| Grid | Date | text | `Date`; placeholder today e.g. `14 Oct 2026` | | |
| Grid | Contact | textarea (3 rows) | `Contact`; placeholder `Name` / `Phone · e-mail` / `Agent or production company` | | |
**States** No project: card holds only the `Title Page` heading.
**Sample data** Title `Dragon`; Credit `Written by`; Written by `Meera Subramanian`; Based on `—`; Draft `Third draft`; Date `14 Oct 2026`; Contact `Meera Subramanian / 98400 00000 · meera@example.in / Marina Pictures, Chennai`.
**Mobile** One column; fields full width.
**Stitch prompt** A settings-style card "Title Page" on dark violet (#1b1727, 16px radius, #9575f8 focus ring) with muted caption "Page 1 of every PDF. A draft keeps the title page it was saved with." Seven labelled fields in a two-column grid: Title, Credit, Written by, Based on, Draft, Date, and a full-width three-line Contact textarea. Inputs have a dark #120f1c fill, hairline border and soft placeholder text.

---

## Breakdown — page shell (`breakdown.html`)

The page is a **tabbed** page: sections become a tab strip pinned under the shell; the URL hash picks the tab; labels come from `data-tab-label` or `navigation.json`. Tab order and labels:
1. **Screenplay Analysis** `#script`
2. **Whole script** `#overview` (the one-click breakdown; navigation lists it under Scene Breakdown's `pages`)
3. **Scene Breakdown / Scene List** — `#scenes` (section; its `#breakdown` div is the tagging view inside the same cards; navigation.json has both "Scene Breakdown" → `#breakdown` and "Scene List" → `#scenes`; they open the same table)
4. **Auto-Tag** `#suggest`
5. **Songs** `#songs`
6. **Elements** `#elements`
The page also shows the pre-production path bar (`Path`) above the tool and Back/Next below, and the stage guide hidden behind `#guide`.

**Header (all tabs)** `p.bd-eyebrow` `Breakdown · one scene model, every view`; `h1` `Breakdown.`; deck `Every scene once — INT/EXT, time, location, length. The stripboard, the sides, the shot list and the call sheet all read from this, so it is the only place any of it gets typed.` Stat strip of five cards: `<n> scene(s)`, `<pages> page(s)` (eighths formatted, e.g. `105`), `<n> elements`, `<n> locations`, `<n> songs`. When scenes exist: a pill menu `AI Desk` (`Scene notes`, `Breakdown tags`, `Genre and comparables`) and an outlined button `RE-MEASURE PAGES FROM THE SCRIPT` (title: "Recount each scene’s length in eighths from the script as it stands now"). Re-measure toast: `Every matched scene’s length already agrees with the script.` or `Re-measured N scenes from the script.` with Undo (`Put the earlier lengths back.`).
**Stitch prompt for the shell** Dark violet product UI (#120f1c, #1b1727 cards, #9575f8 accent, pill buttons, 16px radius). Top: mono eyebrow "BREAKDOWN · ONE SCENE MODEL, EVERY VIEW", display title "Breakdown.", deck, then a row of five stat cards (36 scenes, 105 pages, 148 elements, 22 locations, 5 songs), an "AI Desk" pill and an outlined "RE-MEASURE PAGES FROM THE SCRIPT" button. A pinned tab strip: Screenplay Analysis, Whole script, Scene Breakdown, Auto-Tag, Songs, Elements.

---

## Breakdown — Screenplay Analysis (`breakdown.html#script`)

**Purpose** What the script is made of, derived from the typed pages; nothing typed twice.
**Who sees it / when** Writer arriving from "→ Go to Screenplay Analysis" (with `?from=script` shows a hint) or the Pre-Production path.
**Data source** `fms_script_v1` (sliceScript/headingParts), `fms_scenes_v1` (cast matrix needs scene tags), `fms_characters_v1` (characters panel), story beat framework (outline/beat board). Dialogue time = words ÷ 2.6 wps + speaker beat; heading seconds constant; page length = lines ÷ 55.
**Layout** Column of parts: header (title, sub, action row, status), `Overview`, `Outline`, `Characters`. Tables sit in horizontally scrollable regions (tabindex 0).
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title/sub | h2 + text | `Screenplay Analysis` — `What the script is made of, worked out from its pages. Nothing here is typed twice: change the script and this follows.` | | |
| Head | Run | primary pill | `Run breakdown` / `Run breakdown again` | Runs the one-click breakdown; toast + re-render | Hidden if no headings |
| Head | Back | button | `Back to the Screenplay Writer` | | |
| Head | Coverage | button | `AI coverage report` | → `write.html?stay=1#coverage` | Hidden with no script |
| Head | Status | live text | e.g. `Broke down 36 scenes, 14 characters and 22 locations. Tagged 31 cast from the dialogue cues.` | | |
| Hint | Came-from note | note | `You came from the Screenplay Writer. Run the breakdown to turn its scene headings into scenes you can schedule and budget.` (or `…If the script changed, run the breakdown again to bring the scenes up to date.`) | | Only with `?from=script` |
| Overview | Stat cards | 7 stat cards | `105` pages · `≈ 1h 45m` runtime · `36` scenes · `INT 22 · EXT 14` INT / EXT · `DAY 28 · NIGHT 8` day / night · `14` speaking roles · `22` locations | | |
| Overview | Screen time table | table | h4 `Screen time per character`; cols `Character · Scenes · Speeches · Dialogue time` | | |
| Overview | Locations table | table | h4 `Locations`; cols `Location · Scenes` | | |
| Overview | Cast matrix | table + links | h4 `Cast Matrix`; cols `Character · Scenes · Lines` (top 30); sub `The full characters-by-scenes grid is in the Cast Matrix.`; buttons `Screen time by scene`, `Cast Matrix` (→ Reports) | | Before breakdown: `The cast matrix appears once the breakdown has been run: it counts who is tagged in each scene as well as who speaks.` |
| Outline | Table | table | h3 `Outline`; cols `# · Heading · Page length` (e.g. `1 · INT. SCHOOL ASSEMBLY HALL, ASHOK NAGAR - DAY (2014) · 2 1/4 pp`) | | Empty `No scene headings yet. The outline is built from the headings in the script.` |
| Outline | Beat board | lazy block | h2 `Outline` — "The beats of Save the Cat, from the Story page, with the scenes that serve each one." link `Change the framework or tag passages on the Story page`; per beat card with `Tension N/10`, scene list, `No scene yet. Drag one here, pick this beat on a scene, or draft one.`, button `+  Draft a scene for this beat`; coverage stats `9/15 beats with a scene`, `78 of 105 scene pages linked`; select `Jump to the first scene of a beat` + `Go to the page`; act headings with `about 25% of the pages`; `Not linked to a beat` | Drag/pick; edits script | |
| Characters | Panel | lazy block | h2 `Characters` — table `Character · Speeches · Lines · Words · Minutes · Scenes`; per-character card with tags `from the cues` / `from your blueprint`, `Rename everywhere in the script` input + preview `Type the new name to see how many cues change.` + `Rename` + `Remove notes`; `Table read` panel with select `Read sides for` (`Everyone`), `Print the table read`, `Download as CSV`, note `Minutes are an estimate: dialogue spoken at about 2.6 words a second, before any pause an actor takes.` | | Empty `Nobody has spoken yet` / `Write a character cue on the Screenplay tab and the person appears here, with their lines counted for the table read.` |
**Lists & tables / cards** Screen time example row: `Ragavan` · `31` scenes · `212` speeches · `38:20`. Locations row: `College corridor` · `6`.
**Charts/visualisations** Stat cards; tables with sorted rows (longest dialogue time first). No graphical chart.
**States** No script: `No screenplay yet. Write one in the Screenplay Writer or use Import Screenplay, and this fills in.` Section always renders. Run error toast: `The breakdown could not run on this script.`
**Dialogs** none.
**Sample data** As above (Dragon: 105 pages, ≈ 1h 45m, 36 scenes).
**Mobile** Stat cards wrap 2-up; tables scroll horizontally; action buttons stack.
**Stitch prompt** Analysis tab on dark violet UI (#120f1c, cards #1b1727, #9575f8 accent, 16px radius). Heading "Screenplay Analysis" with muted sentence; button row: violet "Run breakdown again", outlined "Back to the Screenplay Writer", outlined "AI coverage report". A seven-card stat strip: 105 pages, ≈ 1h 45m runtime, 36 scenes, INT 22 · EXT 14, DAY 28 · NIGHT 8, 14 speaking roles, 22 locations. Then tables on dark cards with uppercase mono headers: "Screen time per character", "Locations", "Cast Matrix", an "Outline" table (# / Heading / Page length), a beat board with beat cards and "Tension 6/10" chips, and a Characters table with a "Table read" panel.

---

## Breakdown — Whole script, the one-click breakdown (`breakdown.html#overview`)

**Purpose** One button reads the script and fills every scene, character and location; can be re-run.
**Who sees it / when** First thing for a user with a script and no scenes (or after an edit).
**Data source** `breakdown-run.js` `runBreakdown()/summarize()`; writes `fms_scenes_v1` (cast tags from dialogue cues, undoable) and reads `fms_script_v1`. Upload uses `script-import.js` (plan feature `script_import`).
**Layout** Header block, start buttons, status, then (if scenes exist) a segmented control and four panes, then the "Next:" row.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title | h2 | `Break down the whole script` | | |
| Head | Learn slot | "What is a breakdown?" box | topic `breakdown` | | |
| Head | Sub | text | `A breakdown lists everything each scene needs — who is in it, where it happens, inside or outside, day or night, and how long it runs — so a production can plan the shoot. One button reads your script from the first page to the last and fills in every scene, every character and every location. It can be run again whenever the script changes.` | | |
| Start | Break down | primary pill | `Break down my script (105 pages)` / `Break down the whole script` (when scenes exist) | Runs; toast + undo for cast tags | Shown only with a script |
| Start | Upload | primary label-button (outlined when a script exists) | `Upload a script` (hidden file input accepts `.fountain,.fdx,.pdf,.txt,.md,.spmd,.xml`) | Parse → confirm replace → import → breakdown | Shown when no scenes or no script |
| Start | Status | live text | e.g. `Broke down 36 scenes, 14 characters and 22 locations. Tagged 31 cast from the dialogue cues.` | | |
| Segments | Tablist | segmented control | `Scenes (36)` · `Characters (14)` · `Locations (22)` · `Totals` | Switches pane | Arrow-key tablist |
| Pane Scenes | Table | cols `# · INT/EXT · Location · Day / night · Pages · Cast` | | e.g. `1 · INT · School assembly hall, Ashok Nagar · DAY · 2 1/4 · YOUNG RAGAVAN` |
| Pane Characters | Table | cols `Character · Scenes · First appears · Lines · (source)` | | e.g. `Ragavan · 31 scenes · 1, 3, 4, 6… · Scene 3 · 212 · In the bible` / `From the script`; link button `Open the Character Bible` |
| Pane Locations | Table | cols `Location · INT / EXT · Day / night · Scenes · Pages` | | e.g. `College corridor · INT 6 · DAY 5 · NIGHT 1 · 4, 9, 12… · 6 3/8` |
| Pane Totals | 8 stat cards | `36 scenes`, `105 pages`, `22 / 14 INT / EXT`, `28 / 8 day / night`, `night pages`, `cast`, `locations`, `screen time` | | |
| Foot | Next row | text + 3 buttons | `Next: ` `Schedule it on the Stripboard` `Production Reports` `Plan` | | |
**States** Empty: `No script yet. Upload a Fountain, Final Draft, PDF or text file and it is read straight into scenes — or write one on the Write page, even five pages is enough.` Script empty toast: `The script has no scene headings yet, so there was nothing to break down.` Upload errors via status line: `The script reader could not be loaded. Check the connection and try again.`, `That file was empty.`, `That file could not be read as a screenplay.`, `Nothing in that file looked like a screenplay.` Characters pane empty: `No speaking characters found yet. A character is anyone with a cue in the script, so write or import some dialogue first.`
**Dialogs** Replace confirm (danger): `Replace the script and the 36 scenes with this file?` ⏎ `A revision of the current script is kept first. The old scenes go to the bin, with everything attached, and can be restored.`
**Sample data** As above.
**Mobile** Segmented control scrolls horizontally; tables scroll; buttons full width.
**Stitch prompt** Dark violet tab panel (#1b1727 cards on #120f1c, accent #9575f8, 16px radius). Title "Break down the whole script" with a small "What is a breakdown?" learn disclosure and a paragraph. A large violet pill "Break down my script (105 pages)" next to an outlined "Upload a script". Status line in muted text. Below, a segmented pill control "Scenes (36) · Characters (14) · Locations (22) · Totals" and a table: # / INT/EXT / Location / Day / night / Pages / Cast with row "1 · INT · School assembly hall, Ashok Nagar · DAY · 2 1/4 · YOUNG RAGAVAN". Footer "Next:" with three outlined buttons.

---

## Breakdown — Scene Breakdown / Scene List (`breakdown.html#scenes` and `#breakdown`)

**Purpose** The scene table: every scene once; open a row to edit synopsis, song and tag elements (the "breakdown" tagging lives inside each opened row).
**Who sees it / when** Producer / 1st AD after the breakdown has run. `#scene-<id>` deep links open that scene (palette results).
**Data source** `fms_scenes_v1` (listScenes: number, intExt, dayNight, location, eighths, synopsis, elements per category, songId, shotState, readerNote/cutCandidate, scriptElId), `fms_songs_v1`, `fms_scene_bin_v1`, shoot day from `fms_locations_v1`. The Scene List filters and saved filters are in memory only (reset on reload).
**Layout** Top to bottom: learn boxes (`page-eighths`, `scene-number`); lock note (when numbers are locked); toolbar (find + 3 filters + Expand all + count); saved-filter strip; bulk bar (hidden until rows ticked); column header; scene rows; "No scene matches"; `+  Add scene`; the bin (only when non-empty). A coloured 4px bar at a row's left shows its shoot-day colour (8-colour cycle by day).
Columns at >=900px (grid): `grip 24 | pick 28 | No. 56 | Location + synopsis (2.4fr) | INT/EXT 84 | Time 112 | Length 100 | Cast 1fr | Status 92 | toggle 36`. At 390px each row becomes a small card in four rows: [grip, pick, no., location+synopsis, toggle] / [INT-EXT, Time] / [Length, Cast] / [Status]; column header hidden.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Notice | Lock note | text | `Scene numbers are locked in the Screenplay Writer: a scene inserted after 12 is 12A, and a cut scene keeps its number as OMITTED (omitted: 7, 9). Unlock them in Write’s Revisions to renumber.` | | Only when locked |
| Toolbar | Search | search input | placeholder `Find a scene — number, place, cast, anything in it…` | Filters rows in place | |
| Toolbar | INT/EXT filter | select | `INT / EXT`, `INT`, `EXT`, `INT/EXT` | | |
| Toolbar | Time filter | select | `Any time`, `DAY`, `NIGHT`, `DAWN`, `DUSK`, `CONTINUOUS` | | |
| Toolbar | Status filter | select | `Any status`, `Untagged`, `Tagged`, `Scheduled`, `Shot`, `Part shot`, `Dropped` | | |
| Toolbar | Expand | button | `EXPAND ALL` / `COLLAPSE ALL` | | |
| Toolbar | Count | status | `36 scenes` / `5 of 36 scenes` | | |
| Presets | Save filter | button | `SAVE THIS FILTER` | Opens name dialog; disabled until a filter is set | |
| Presets | Preset chips | pill + ✕ | defaults `Night exteriors` (EXT, NIGHT) and `Untagged scenes` | Press toggles; ✕ removes (toast `Removed the saved filter “Night exteriors”.`) | Active `.is-on` |
| Bulk | Bar (when rows ticked) | bar | `3 selected`; selects `Set INT / EXT…`, `Set time…`; buttons `MOVE TO BIN` (danger), `CLEAR SELECTION` | Toast `3 scenes set to NIGHT.` | accent-wash bar |
| Header | Column titles (mono caps) | | `No.`, `Location`, `INT / EXT`, `Time`, `Length`, `Cast`, `Status` | | |
| Row | Drag handle | icon `⠿` | aria `Reorder scene 4. Drag, or press Up or Down.` | Drag/keys reorder | Disabled while a filter is active (title "Reordering is off while a search or filter is active…") |
| Row | Pick | checkbox | aria `Select scene 4` | Adds to bulk | |
| Row | Number | text or read-only | script-made scenes read-only (title "Set by the script’s scene heading…" or the locked wording); hand-made scenes editable input (placeholder = position) | Duplicate numbers flagged (`is-dup`, title `Another scene is also numbered 12 — allowed, but the schedule and the sides will show two of them`); empty reverts with toast `A scene needs a number — the one it had is back.` | `is-locked` |
| Row | Location | text input | placeholder `Location — where are we?`; below it synopsis in muted text or `No synopsis yet` | | |
| Row | INT/EXT | select | `INT, EXT, INT/EXT` | | |
| Row | Time | select | `DAY, NIGHT, DAWN, DUSK, CONTINUOUS` | | |
| Row | Length | number (0–80 eighths) + derived pages | e.g. `18` + `2 1/4` | | |
| Row | Cast | text | first two names `, ` and `+N`; `—` when none | | |
| Row | Status chip | pill | `Shot`, `Part shot`, `Dropped`, `Day 17`, `Tagged`, `Untagged` (derived, nothing stored) | | colour per state |
| Row | Chevron | icon | `▸` / `▾` | Opens detail | `aria-expanded` |
| Detail | Synopsis | textarea (2 rows) | placeholder `What happens in this scene?` | | |
| Detail | Song link | select (only if songs exist) | label `song`; `Not part of a song`, `1. Intro` … | | |
| Detail | Reader note | text | `Reader note · cut candidate` / `Reader note` + sentence | | Shown only when the AI Desk's note was accepted |
| Detail | Chips | removable chips | category label + name + `✕` (aria `Remove Gold medal and box from Props`) | Tag removed | Coloured per category (see top) |
| Detail | Tag adder | select + input | select `Cast, Background, Props, Set Dressing, Wardrobe, Hair & Makeup, Vehicles, Stunts, SFX, VFX, Sound, Animals, Special Equipment`; input placeholder `Tag an element — name it, press Enter` with autocomplete of existing names | Enter tags | |
| Detail | Row actions | icon buttons | `↑` Move earlier, `↓` Move later, `✕` Move to the bin | Bin offers Undo toast | first/last disabled |
| Foot | Add | button | `+  Add scene` | New row opens with Location focused | |
| Foot | No match | text | `No scene matches. Clear the search or a filter above.` | | |
| Bin | Removed list | aside | h2 `Removed from script (2)`; sub `Scenes whose heading left the script, or that were deleted here, with their shots, frames, shoot day and call-sheet places. They are hidden from every page until you restore them or delete them for good.`; item `Scene 7` + heading + meta `2 shots · 3 frames · Day 4 · 1 call sheet · heading removed from the script` (or `· deleted here`; `nothing attached`); buttons `Restore`, `Delete for good` (danger); foot button `Empty bin` | Restore toast `Scene 7 is back, with everything that was attached to it.` | Only when non-empty |
**Keyboard** Up/Down move between scenes, Enter opens/closes, N adds, Delete moves the focused scene to the bin with Undo.
**Lists & tables / cards** Example row (collapsed): ⠿ ☐ `1` `School assembly hall, Ashok Nagar` / "2014 prize day. Young Ragavan collects the medal; parents at the back of the hall." · `INT` · `DAY` · `18` `2 1/4` · `YOUNG RAGAVAN` · chip `Day 17`. Opened: synopsis textarea; chips `Cast YOUNG RAGAVAN ✕`, `Background Students (180) ✕`, `Background Parents (60) ✕`, `Props Gold medal and box ✕`, `Props 2014 prize-day banner ✕`, `Props Folding lectern ✕`, `Wardrobe 2014 school uniform ✕`; adder row; ↑ ↓ ✕.
**Charts/visualisations** Left 4px shoot-day colour bar (8 slots); status chip colours; no axes.
**States** Empty (no scenes): teaching panel `Start with the scenes` — "A scene is one continuous action, in one place, at one time. When the place or the time changes, the scene changes — that is the whole rule, and it is what makes everything downstream possible." Three steps: `1 List them` ("Number, INT or EXT, day or night, where, and one line of what happens."), `2 Measure them` ("Length in eighths of a page. Eight eighths is one page, and one page is roughly one minute."), `3 Tag them` ("Cast, props, wardrobe, vehicles. Tag once here and every report builds itself."); example `Por Thozhil opens on an interior, day, a police station — one location, one continuous action. The moment the investigation moves outside, that is a new scene, a new line here, and eventually a different shoot day.`; link `Have a script already? Upload it or break it down on the Whole script tab and every scene, character and location is filled in for you.`; button `+  Add a scene by hand`. No project: shell banner; page still renders empty state.
**Dialogs** Save filter: title `Save this filter`, body `Showing: EXT · night. Give it a name. Saved filters stay until you reload this page.`, field prefilled, `SAVE` / Cancel; toast `Saved the filter “Night exteriors”. It stays until you reload this page.` Delete for good: `Delete for good — Scene 7 …?` ⏎ `This cannot be undone.` Empty bin: `Empty the bin? 2 scenes, 5 shots … will be deleted for good.` ⏎ `This cannot be undone.`
**Sample data** Dragon rows 1–4 above plus 2 `EXT · DAY · Ragavan's house, Villivakkam · 14 (1 3/4) · YOUNG RAGAVAN +2 · Day 16`; 3 `EXT · DAY · Engineering college — front block · 20 (2 1/2) · RAGAVAN, ANBU · Day 1`; 4 `INT · DAY · College corridor — arrears board · 16 (2) · RAGAVAN, ANBU · Day 3`.
**Mobile (390px)** Each scene is a card (see grid areas above), column header hidden, synopsis clamped to two lines, drag grip and tick boxes get 44px touch targets, filters wrap, chevron stays top-right.
**Stitch prompt** Dark violet product UI (#120f1c ground, #1b1727 cards, #9575f8 accent, pill buttons, 16px radius). A scene table: a toolbar with a search field "Find a scene — number, place, cast, anything in it…", three dropdown filters (INT / EXT, Any time, Any status), an "EXPAND ALL" pill and a mono count "36 scenes"; a strip of saved-filter pills "Night exteriors", "Untagged scenes" with ✕ and a "SAVE THIS FILTER" button. Column header in mono caps: No. / Location / INT / EXT / Time / Length / Cast / Status. Rows on cards with a thin coloured day bar at the left: drag grip ⠿, checkbox, number "1", location "School assembly hall, Ashok Nagar" over a muted synopsis, INT and DAY dropdowns, "18" eighths with "2 1/4", "YOUNG RAGAVAN", a violet status chip "Day 17" and a ▸ chevron. One row expanded showing a synopsis textarea and coloured category chips (Cast rose, Background blue, Props sky, Wardrobe magenta) with ✕, a tag input "Tag an element — name it, press Enter", and ↑ ↓ ✕ icon buttons. Floating bulk bar "3 selected · Set INT / EXT… · Set time… · MOVE TO BIN".

---

## Breakdown — Auto-Tag (`breakdown.html#suggest`)

**Purpose** Suggest cast, props, vehicles, stunts, sound (and looser categories) read from each scene's cues and action lines; nothing is tagged until pressed.
**Who sees it / when** After the breakdown has made scenes.
**Data source** `screenplay-analysis.js` `suggestReport(scenes, scriptElements)` with `src/data/element-lexicon.json`; writes tags through `Scenes.tagMany` (Undo toast).
**Layout** Header; match note; tools row; ordered list of scene blocks, each with a head row and a wrap of suggestion chips.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title/sub | h2 + text | `Auto-Tag` — `Read from each scene’s cues and action lines, in the colour of its category. Press one to tag it; nothing is added until you do. Each scene is matched to the script heading that names the same place, so moving or deleting a scene here keeps its own text.` | | |
| Head | Match note | muted text | describes unpaired scenes/headings | | Shown when the join is imperfect |
| Tools | Count | text | `221 suggestions across 36 scenes · ADD ALL leaves out the 3 paired by position only` | | |
| Tools | Add all | button | `ADD ALL` | Adds the five tight categories (Cast, Props, Vehicles, Stunts, Sound) on confidently matched scenes only | |
| Scene head | Number | strong | `Scene 3` | | |
| Scene head | Slug | text | matched script heading, e.g. `EXT. ENGINEERING COLLEGE — FRONT BLOCK - DAY` | | |
| Scene head | Guess flag | warning text | `paired by position, check the heading` | | Only for position-only pairs |
| Scene head | Add these | button | `ADD THESE` | Adds every suggestion for that scene (all categories) | |
| Chips | Suggestion chip | button, coloured by category | label `Props` + `+ Lanyards` (title `From: <the line it was read from>`, aria `Tag Lanyards as Props — from: …`) | Tags that one | |
**Lists & tables / cards** Example: `Scene 3` · `EXT. ENGINEERING COLLEGE — FRONT BLOCK - DAY` · [ADD THESE]; chips `Cast + ANBU`, `Props + Lanyards`, `Vehicles + College bus`, `Sound + Campus ambience`.
**Charts** None; colour = category.
**States** Empty (no scenes): `Import or write a script and the elements it mentions are offered here, scene by scene.` Nothing to suggest: `Nothing to suggest — either everything the script mentions is already tagged, or there is no script text yet. Write or import the script on the Write page.` Toasts: `Tagged 14 elements across 6 scenes.` with `Undo`; `Nothing new to tag.`; `Removed the 14 tags just added.`
**Dialogs** none.
**Sample data** `221 suggestions across 36 scenes`; Scene 4 chips `Props + Arrears list — state 1`, `Props + Marker pens`, `Cast + ANBU`.
**Mobile** Chips wrap; scene head wraps with the `ADD THESE` button on its own row.
**Stitch prompt** Dark violet tab (#120f1c, #1b1727 cards, #9575f8 accent, 16px radius) "Auto-Tag". Muted intro, then a tools row with "221 suggestions across 36 scenes" and an "ADD ALL" pill. A numbered list of scene cards: heading row "Scene 3 · EXT. ENGINEERING COLLEGE — FRONT BLOCK - DAY" with an "ADD THESE" outlined pill and, on one card, an amber note "paired by position, check the heading". Beneath, wrapping chips that are buttons, tinted by category with a mono category label above the name: Cast "+ ANBU" (rose), Props "+ Lanyards" (sky), Vehicles "+ College bus" (yellow), Sound "+ Campus ambience" (green).

---

## Breakdown — Songs (`breakdown.html#songs`)

**Purpose** Plan each song as its own production unit (days, locations, dancers, playback readiness) and link scenes to it.
**Who sees it / when** Producer / director; usually before scenes exist.
**Data source** `fms_songs_v1` via `songs.js` (songFacts/songTotals); scenes link by `songId` in `fms_scenes_v1`; shoot days from the stripboard.
**Layout** Header + sub, stat strip (when songs exist), blocked-songs warning, one card per song, `+  Add song`.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title/sub | h2 + text | `Songs` — `A song is its own production unit — its own days, its own locations, often its own unit — and it is usually decided before a scene exists to hang it on. Plan it here, then link the scenes once they are written; the stripboard groups by song and the budget counts its days.` | | |
| Stats | Four cards | stat | `5 songs`, `9 shoot days`, `7 linked scenes`, `120 peak dancers` (`—` if none) | | |
| Warning | Blocked | warning | `2 songs have shoot days planned with no recorded track. Those days cannot be shot.` | | |
| Card bar | Number | badge | `1` | | |
| Card bar | Title | text input | placeholder `Song title — or “untitled duet”` | | |
| Card bar | Kind | select | `Intro, Duet, Melody, Kuthu, Folk, Pathos, Montage, Title` | | |
| Card bar | Playback | select | `Not started, Tune locked, Scratch track, Recorded, Final mix` | Recorded/Final = ready | |
| Card bar | Unit | select | `Main unit`, `Second unit` | | |
| Card bar | Actions | icon buttons | `↑` Move earlier, `↓` Move later, `✕` Delete song | | |
| Card | Situation | textarea (2 rows) | placeholder `What is the song doing in the story? The situation, not the lyrics.` | | |
| Card grid | Fields | 4 labelled inputs | `planned locations` (placeholder `Marina, studio floor`), `planned days` (0–60, step 0.5), `dancers` (0–500), `choreographer` | | |
| Card | Facts | line of spans | `3 scenes linked` · `5 1/2 pages` · `2 shoot days on the board` or `no shoot day assigned yet`; none: `No scenes linked yet — normal this early. Link them on a scene card above.` | | |
| Card | Warnings | amber text | `The plan says 2 days and the board has these scenes across 4 days. Neither has been changed — decide which is right.` / `Playback is “Scratch track” but 2 days are planned. Picturisation needs a track to play — this day cannot be shot yet.` | | |
| Foot | Add | button | `+  Add song` | | |
**Lists & tables / cards** Example card: `1` · `Anbe Anbe` · Duet · Recorded · Main unit; situation "Ragavan and Anbu on the college terrace after the arrears result."; locations `Marina, college terrace`; days `2`; dancers `40`; choreographer `Brindha`; facts `3 scenes linked · 5 1/2 pages · 2 shoot days on the board`.
**Charts** None.
**States** Empty: `No songs yet. Most Tamil features carry four to six, and the count is part of what a producer is sold — so it is worth deciding early, even before the situations are written.` Delete confirm (danger): `Delete song “Anbe Anbe”?` plus note on linked scenes.
**Dialogs** Delete song as above.
**Sample data** Intro `Dragon Mass` Kuthu, Scratch track, 3 planned days, 120 dancers → warning "Playback is “Scratch track” but 3 days are planned…".
**Mobile** Card bar fields wrap to full width; four-field grid becomes one column; icon actions stay top-right.
**Stitch prompt** Dark violet tab "Songs" (#120f1c ground, #1b1727 cards, #9575f8 accent, 16px radius): intro paragraph, four stat cards (5 songs, 9 shoot days, 7 linked scenes, 120 peak dancers), an amber warning bar. Song cards: top bar with number badge "1", title field "Anbe Anbe", dropdowns Duet / Recorded / Main unit and small ↑ ↓ ✕ buttons; a textarea for the situation; a four-field grid (planned locations, planned days, dancers, choreographer); a facts line "3 scenes linked · 5 1/2 pages · 2 shoot days on the board" and an amber note when plan and board disagree. A "+  Add song" pill at the bottom.

---

## Breakdown — Elements (`breakdown.html#elements`)

**Purpose** Index of everything tagged across scenes, listed once with the scenes that need it.
**Who sees it / when** Anyone after tagging; always renders (nav target).
**Data source** Derived from scene tags (`Scenes.elementIndex()`); stores nothing.
**Layout** Header, three learn boxes (`breakdown-categories`, `props-dressing`, `sfx-vfx`), then a responsive grid of cards.
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Title/sub | h2 + text | `Elements` — `Derived from the tags above. Nothing here is typed twice.` | | |
| Grid | Element card | card tinted by category | category label (mono caps), name (bold), scene list | Read only | `scene 3` or `4 scenes · 2, 5, 9, 14` |
**Lists & tables / cards** Example: `PROPS` / `Gold medal and box` / `scene 1`; `CAST` / `RAGAVAN` / `31 scenes · 3, 4, 6, 7, 9, …`.
**Charts** None; colour is the category hue.
**States** Empty: `No elements tagged yet. Tag one on any scene and it appears here, with every scene it touches.`
**Dialogs** none.
**Sample data** CAST `YOUNG RAGAVAN` `scene 1`; BACKGROUND `Students (180)` `scene 1`; PROPS `Lanyards` `scene 3`; VEHICLES `College bus` `scene 3`; SOUND `Campus ambience` `scene 3`; SPECIAL EQUIPMENT `100mm macro for the board insert` `scene 4`.
**Mobile** Grid collapses to one or two columns.
**Stitch prompt** Dark violet "Elements" tab (#120f1c ground, #1b1727 cards, #9575f8 accent, 16px radius) with a muted line "Derived from the tags above. Nothing here is typed twice." and three collapsible learn boxes. A masonry/responsive grid of small cards, each tinted and bordered by its category colour (rose Cast, sky Props, yellow Vehicles, green Sound, pink Special Equipment, blue Background): a mono caps category label, a bold name, and a muted "4 scenes · 2, 5, 9, 14" line.

---

## Pre-Production path (`preprod.html`) — NOT retired

`preprod.html` is a **live** page ("Pre-Production", stage page `Path`; crumb `Pre-Production › Path`), the step-by-step path from script to first shoot day. It stores and writes nothing: every step's state is derived from the film (`src/lib/preprod-path.js` over `src/data/preprod-path.json`, plus `readiness.js`). Included here because Breakdown tabs belong to its steps and the same strip appears above Breakdown (`mountPathBar`).
Layout: eyebrow `Studio · Pre-Production`, title `Pre-Production.`, deck `From the script to the first day of shooting, one step at a time. Each step says what it is for and what is still missing, then opens the tool where it is done.` A progress summary `4 of 12 steps done · next: Break it down` with a thin meter. At >=1100px a left side menu of steps in four groups beside the open step panel; below that, a horizontally scrolling strip. Steps (group · label · tool button): Script · Lock the screenplay · `OPEN THE SCREENPLAY WRITER →`; Script · Scene list · `OPEN THE SCENE LIST →`; Script · Break it down · `OPEN SCENE BREAKDOWN →`; Look · Vision & look; Look · Shots & storyboard; People & places · Cast & Crew; People & places · Locations & recce; People & places · Songs (only if the film has songs); Plan · Budget; Plan · Schedule; Plan · Sides & call sheets; Check · Ready to shoot. Each panel: `Step N`, heading, state chip (`Done` / `In progress` / `Not started`), about sentence, facts line, `Still to do` list, a tool button (primary unless done), and Back/Next footer. "Ready to shoot" lists readiness checks (✓ passes, ✕ blocker, ! gap, each with `Fix →`), a `DOWNLOAD ONE-PAGE PDF` button ("Checks, shoot days, budget and open permissions, on one A4 page.") and buttons `MAKE THE CALL SHEET →`, `OPEN THE SHOOT DAY →`. No project: `No film is open. Open or create one from Home, and its path appears here.` Zero checks: `Add scenes first; there is nothing to check yet.` A one-page PDF failure toast: `The page could not be prepared.`
**Stitch prompt** Dark violet stepper page (#120f1c, #1b1727, #9575f8, 16px radius): eyebrow "STUDIO · PRE-PRODUCTION", title "Pre-Production.", summary "4 of 12 steps done · next: Break it down" with a violet meter. Left side menu of grouped steps (Script, Look, People & places, Plan, Check) with done ticks and the current step highlighted; right, the open step card: "Step 3 · Break it down · In progress", about line, "Still to do" bullets, primary pill "OPEN SCENE BREAKDOWN →", Back/Next footer.
