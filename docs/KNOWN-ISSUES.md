# Known issues

Bugs found and NOT yet fixed. Each one says where it is, what goes
wrong, and the likely fix. Delete an entry in the same commit that
fixes it; a list nobody prunes stops being believed.

Recorded 6 Oct 2026, during the consumer pass (CLAUDE.md open item 14).
Pruned 7 Oct 2026 with the Medium/Low fix pass over
`docs/UX-AUDIT-2026-10-06.md`: §1, §3, the tab-strip observer in §6, and
three of the five §7 leftovers are fixed and gone; §4 turned out not to
be a bug (the 180px was `--sh-cover-h`, the tall tab strip the audit's
M10 fixed, not `--sh-chrome-h`). What that pass left open is in §8.

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
  will miss the other. Checked 7 Oct and deliberately NOT merged: the
  two are not identical — `sliceScript()` drops empty elements (an
  empty heading included) and trims the heading text; `sliceScenes()`
  keeps both — so folding them would change what an import produces.
  Merge them only with a test that pins the import's output first.
- **Screenplay lines are under 44px on touch, on purpose.** write.html's
  one-line textareas are about 30px tall under `pointer: coarse`.
  Raising them would stretch a 2,361-line script badly. Decide whether a
  taller line on phones only is wanted.

## 7. Leftovers from the story-first realignment (6 Oct 2026)

- **The guide pill on story.html lists five steps** (02, 03, 08, 09,
  10) with no hash. It works; a narrower rule (by open path step)
  needs a path-step → blueprint-step mapping and a change to
  `src/ui/blueprint-drawer.js`.
- **verify's AA walk only sees the Story page's empty state** (path
  step 1) and Write's default Margin mode. Steps 3, 4 and 6 and the
  Panel card were checked by hand (≥ 5.9:1), not by the gate.
- **A Feature HOD box saved before 7 Oct reads back UNTICKED.** The
  `hod_*_check` boxes used to be saved as `el.value` — the string
  `"on"` for every box, ticked or not — so the stored value carried no
  information. They are booleans now, and `true` / `"true"` load
  ticked; a stored `"on"` is read as unticked on purpose, because
  reading it as ticked would sign off all eleven boxes for everyone
  who had ever saved the page. Unticked is what every reload showed
  before the fix, so nobody loses a tick they could see. Not a bug to
  fix; recorded so the next reader does not "correct" it.

## 8. Left open by the Medium/Low fix pass (7 Oct 2026)

- **18 of 22 pages have no sign-in or theme control in the band**
  (audit M21, second half). The pill is built by `src/ui/auth.js` and
  hangs off `.toolbar`, which only the four original pages have.
  Putting it in the band means re-laying-out the band on every module
  page, which is a design pass, not a fix.
- **The palette handle still moves between 769 and 899px on the four
  toolbar pages** (audit L23). Fixed on the module pages; on hub, the
  two blueprints and the library it sits inside the page's controls
  group and moves when that group wraps.
- **Scene numbers cannot be edited by hand** (audit M26, second half).
  `scene-sync.js` rewrites numbers from the script's headings, so an
  editable field would be overwritten on the next heading change.
  Duplicate numbers after a delete-then-add ARE fixed (highest + 1).
- **A full call sheet can still print on two pages** (audit L12). The
  padding and margin that pushed it over are gone and the masthead no
  longer repeats the film's name, but the sample's 29-person Day 1 is
  ~1,120px against ~1,017px of printable A4. The copy still says "on
  one page"; change it or the sheet, not both.
- **A few on-screen controls print below 4.5:1 from the dark theme**
  — `--danger` delete icons, the stripboard's selects (audit M14's
  tail). Titles and tables are fixed; `print.css` could hide those
  controls outright, which is what paper wants anyway.
- **`prove:gate`'s "the screening room wrote nothing to localStorage"
  check failed once in three runs** on 7 Oct with every storage write
  instrumented and none seen. Timing, most likely; it passed on the
  final gated run. If it recurs, look at the harness's wait, not the
  room.
