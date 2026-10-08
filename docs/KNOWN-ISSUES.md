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

## Left over from the 8 Oct 2026 release (the ten workstreams)

- **First paint grew on four pages, and the budget was recaptured for it.**
  reports (+43 KB: DPR, one-liner, running time), deliverables (+41 KB:
  CBFC flags, dialogue list), budget (+22 KB: the six cost tabs) and write
  (+2 KB). The growth is the features themselves, visible on those pages'
  first render. The cheapest win if it matters: `src/pages/deliverables.js`
  imports `src/data/cbfc-rules.json` (~44 KB raw — 32 KB until the 8 Oct source check grew it) and `lib/pdf.js` at module
  scope although the PDF is only needed inside the export click — making
  both dynamic needs the certification section to render after an await.
- **On set: two small leftovers.** The recce card in `src/pages/plan.js`
  does not show the four recce fields (`lat lng hospital police`) the call
  sheet reads, and the after-sunset flag reads only the call sheet's
  `wrap`, not the DPR's day-level wrap (`src/lib/dpr.js`).
- ~~**The CBFC/AWBI/OTT facts were re-checked against search summaries, not
  the pages themselves** (8 Oct 2026; the container cannot reach the cited
  hosts).~~ **CLOSED 8 Oct 2026 (evening), from a session with a real
  browser.** 16 of the 18 cited URLs answer; the citations are now precise,
  and reading the Gazette text found one real error nobody had caught: the
  file cited COTPA **rule 4(6)**, which the Delhi High Court QUASHED in
  Mahesh Bhatt v Union of India. The operative provisions are rules 7-10.
  **What remains open is narrower and should not be confused with the
  above:** the 2026 CBFC guidelines text is still unpublished by CBFC and
  MIB, so every clause NUMBER in `cbfc-rules.json` is the 1991 one and none
  has been checked against the current text. That cannot be closed by
  effort, only by the Ministry publishing it. The `realnames` rule
  (Cinematograph Act s.5B(1), defamation, Trade Marks Act) was not
  re-checked and keeps its older `checked` date, deliberately.
- **Two cited URLs do not answer** and should be replaced when a working copy
  is found: the `ffo.gov.in` PDF of the Performing Animals (Registration)
  Rules, 2001 (connection failure) and a `thestatesman.com` report (403).
  AWBI hosts working copies of the 2001 Rules; they are now cited instead.

## The full pending list

The ID-numbered registry of everything still to do (launch steps, production
gaps, quality gaps, billing, queued ideas, the emotional-craft layer) is
`docs/HANDOFF.md` §6c; the leftovers above are rows G1, G2, G7 and P12 there.
The 8 Oct audit's wrong findings are NOT listed — they were re-checked against
the code (see HANDOFF §9).
