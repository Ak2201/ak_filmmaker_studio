# Known issues

Bugs found and NOT yet fixed. Each one says where it is, what goes
wrong, and the likely fix. Delete an entry in the same commit that
fixes it; a list nobody prunes stops being believed.

Recorded 6 Oct 2026, during the consumer pass (CLAUDE.md open item 14).

## 1. The Library's legacy dark-mode carry-over never runs

- **Where:** `src/pages/library.js`, `adoptLegacyDarkPref()`.
- **What goes wrong:** it reads `localStorage.getItem(PREF_KEY)`, and
  `PREF_KEY` is not defined anywhere. It never has been since the line
  arrived in `3c50d98`. The `ReferenceError` is swallowed by the
  function's own `try/catch`, so nothing visibly breaks. The function
  simply never does its job: a reader whose old Library page was dark
  is not carried into the ink theme.
- **Likely fix:** the per-page key is `fms_library_prefs_v1`, which is
  listed in `src/lib/store.js` and is already a storage contract.
  Before writing it in, check whether `chrome.js` already covers the
  case. Around line 325 it migrates `fms_studio_prefs_v1.dark`. If it
  does, delete the function instead.
- **Do not** invent a new key name. CLAUDE.md invariant 1 applies.

## 3. Case Studies' empty state names an internal file

- **Where:** `src/ui/case-studies.js`, about line 751.
- **What goes wrong:** with no films in the data, it tells the user
  "src/data/studies.json holds no films". That is developer text on a
  consumer page, which is the copy rule the consumer pass applied
  everywhere else. This file belonged to another agent at the time, so
  it was left alone.
- **Likely fix:** plain words, for example "No case studies yet." The
  state is reachable only if `studies.json` is emptied, so `verify`
  will not notice either way.

## 4. Unconfirmed: the Library's band height at 390px

- **Where:** `measureChrome()` in `src/ui/shell.js`, as seen on
  `library.html`.
- **What was seen:** one agent read `--sh-chrome-h` as 180px on the
  Library at 390px wide, where the band is not pinned and the value
  should be 0. It was not inspected. It may be the Library's tab strip,
  which sits at `top: 0` when the band is 0, being counted again. Check
  that first, because the same family of bug made the strip drift down
  the page (see CLAUDE.md open item 14).
- **How to check:** open `library.html` in a 390px-wide window and read
  `getComputedStyle(document.documentElement).getPropertyValue('--sh-chrome-h')`
  and `--sh-cover-h`. Then jump to `#glossary` and see whether the
  heading lands under or behind anything.

## 5. Design question, not a bug: Case Studies is one long scroll

- **Where:** the Case Studies tab on `library.html`.
- **What:** about 22,000px in a single tab, because `src/ui/tabs.js`
  handles one level of tabs and Case Studies has its own sections
  inside. A second level, or a per-film picker that shows one study at
  a time, would follow the owner's "tabbed, not scrollable" ask. That
  is a UI decision to make on purpose, not a patch.

## 6. Leftovers from the Critical/High fix pass (6 Oct 2026)

- **A second script slicer.** `src/lib/script-import.js` still has its
  own `sliceScenes()`. It already drops the preamble, so it is not wrong
  today. It is a second copy of what `sliceScript()` in
  `src/lib/screenplay-analysis.js` now owns, and the next change to one
  will miss the other.
- **The tab strip's observer is costly.** `src/ui/tabs.js` reruns
  `apply()`, which queries every `section[id]` on the page, on every DOM
  mutation. On write.html that is about 11ms a frame while typing.
  Filter the mutations, or limit the observer to `main`'s direct
  children.
- **Screenplay lines are under 44px on touch, on purpose.** write.html's
  one-line textareas are about 30px tall under `pointer: coarse`.
  Raising them would stretch a 2,361-line script badly. Decide whether a
  taller line on phones only is wanted.

## 7. Leftovers from the story-first realignment (6 Oct 2026)

- **Feature HOD checkboxes do not come back ticked.** `feature.js`
  saves the `hod_*_check` boxes as `el.value` ("on"), so a ticked box
  reads back unticked after a reload. The guide drawer copies that on
  purpose rather than storing a second shape. Fix the page's save and
  load together, with the stored value kept readable.
- **Two scene removals still skip the bin.** The hand-off banner's
  Undo (and "Break into shots"' Undo of the scenes it added) drop rows
  directly. They only remove rows created moments earlier, but a shot
  added in between would be orphaned. Route them through `binScene()`.
- **Deleting the ONLY heading in a script bins nothing**, by design:
  zero headings is treated as "no script" so a failed load cannot empty
  the Breakdown. Say so in the UI if users trip on it.
- **The guide pill on story.html lists five steps** (02, 03, 08, 09,
  10) with no hash. It works; a narrower rule (by open path step)
  would read better.
- **verify's AA walk only sees the Story page's empty state** (path
  step 1) and Write's default Margin mode. Steps 3, 4 and 6 and the
  Panel card were checked by hand (≥ 5.9:1), not by the gate.
