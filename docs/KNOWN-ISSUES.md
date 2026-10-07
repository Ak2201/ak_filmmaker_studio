# Known issues

Bugs found and NOT yet fixed. Each one says where it is, what goes
wrong, and the likely fix. Delete an entry in the same commit that
fixes it; a list nobody prunes stops being believed.

Recorded 6 Oct 2026, during the consumer pass (CLAUDE.md open item 14).
Pruned 7 Oct 2026, twice: first with the Medium/Low fix pass over
`docs/UX-AUDIT-2026-10-06.md`, then with the open-issues pass that
closed everything that pass had left (CLAUDE.md open item 17). What is
below is what is NOT a bug — two recorded decisions — and one thing seen
once and not yet looked at.

## Decisions, recorded so nobody "corrects" them

- **A Feature HOD box saved before 7 Oct reads back UNTICKED.** The
  `hod_*_check` boxes used to be saved as `el.value` — the string
  `"on"` for every box, ticked or not — so the stored value carried no
  information. They are booleans now, and `true` / `"true"` load
  ticked; a stored `"on"` is read as unticked on purpose, because
  reading it as ticked would sign off all eleven boxes for everyone
  who had ever saved the page. Unticked is what every reload showed
  before the fix, so nobody loses a tick they could see.
- **A scene bound to a script heading has a read-only number.**
  `scene-sync.js` renumbers from the headings, so an editable field
  there would be overwritten on the next heading change. Only a scene
  with no `scriptElId` takes a hand-typed number ("12A" is fine;
  duplicates save and are flagged). To renumber a bound scene, change
  its heading in Write.

## Seen once, not investigated

- **write.html at 390 under Playwright's `isMobile` emulation showed
  ~350px of blank dark ground above the page's tab strip.** Seen in one
  screenshot during the print/touch work on 7 Oct; not reproduced in
  the ordinary 390px viewport runs (verify measures 0 overflow and the
  band at 91px there). It may be the band under `isMobile`'s
  viewport/visual-viewport split rather than the page. Open write.html
  on a real phone before chasing it in the harness.

## Left over from the launch-readiness pass (7 Oct 2026)

- **The hub fetches 58% of its old JS, not the 50% or less aimed for.** The
  rest is the first-run, project and resume views it needs on first paint.
  Re-checked 7 Oct 2026: the two big data chunks it fetches
  (`data-steps`, ~140KB, and `data-sample`, ~60KB) are read at MODULE scope
  and in synchronous render paths (the master index, the step counts, the
  sample's blueprint), so neither is a lazy win without making those paths
  async — not an obvious change, so left.
- **The production host is confirmed**, not a placeholder:
  `thefilmmakerstudio.vercel.app` (owner, 7 Oct 2026). A custom domain later
  needs the ten files in `docs/LAUNCH.md` section 7, Vercel, and the Google
  authorised origins.
