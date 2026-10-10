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

## ~~Seen once, not investigated~~ CLOSED 9 Oct 2026

- ~~write.html at 390 under `isMobile` showed ~350px of blank ground
  above the tab strip.~~ A screenshot artefact: it appears only when
  Playwright captures mid smooth-scroll. With instant scrolling and
  phone emulation (390x844, scale 3) the tab strip sits at top 0 on
  write, breakdown and reports.

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

## ~~ROOT CAUSE: cloud.js never loads on the dev server~~ FIXED 8 Oct 2026

**8 Oct 2026.** `window.StudioCloud` is **undefined** on `settings.html`
under `npm run dev`. Measured, not inferred: `hasStudioCloud: false`, and
`cloud.js` is absent from `performance.getEntriesByType('resource')`.

One cause, every symptom:

- the site gate never gets an answer, so it hits `GIVE_UP_MS` and
  **fails closed** — the breadcrumb reads `reason: "timeout"`. Every
  gated page bounces a signed-in admin to `invite.html`.
- `isConfigured()` is unreachable, so the Plan section renders
  "This build is not connected to a cloud project" even though `.env`
  carries a real project.
- there is no session, so `refreshBilling()` bails and `billing.plans`
  stays null — which is why the Plan section was EMPTY before
  `renderPlan()` was taught to show its failure.

**Why the built site is fine, and this is the part worth keeping.**
`vite.config.js` folds every `src/lib` and `src/ui` module into one
`studio` chunk, so in production cloud.js evaluates on every page as a
side effect of bundling. `CLAUDE.md` already states this. In dev there
is no chunk, so a module loads only if something imports it — and
**nothing imports `cloud.js` at all**: `grep -rln "from '.*lib/cloud'"
src/` returns nothing. `sitegate.js` polls for `window.StudioCloud`
rather than importing it; `billing.js` reads `window.StudioCloud`;
`settings.js` reads it too. The dependency is real and entirely
implicit, and only the bundler was satisfying it.

So this is not a dev-server quirk to be waited out. It is a genuine
missing import that production hides.

**FIXED** by a side-effect `import './cloud.js'` in `src/lib/sitegate.js`,
which `chrome.js` already pulls in on every page — so the thing that
cannot work without cloud.js is now the thing that asks for it.

One correction to the paragraph above, which said nothing imports
cloud.js: **six page entries do** — hub, feature, short, invite, panel
and admin. No MODULE page does, which is what `vite.config.js` means at
its `CORE_LIB` line, and settings.html is one of them.

Verified after the fix: `window.StudioCloud` present, `isConfigured`
true, `isBooted` true, session restored, no redirect, and the Plan
section renders 1,960 characters with the real cards — Rs.0 / Rs.599 /
Rs.799 / Rs.999. breakdown.html loads too. No console errors.

**And the mitigation was REVERTED.** `GIVE_UP_MS` went briefly to 120s
in dev to stop the bouncing; it is back to 20s everywhere, and settings
still loads well inside it. A timeout here should stay loud enough to
mean something. The `optimizeDeps` entry for the Supabase SDK stays —
that one is a genuine dev speed-up, not a workaround.

## ~~prove:storage fails 2 checks — the scene bin~~ FIXED 9 Oct 2026

> **Not the app.** The proof pressed `Control+A` / `Control+Z`, which do
> nothing on macOS, so the heading was never cleared. See the entry at the
> foot of this file. The diagnosis below was reasonable and wrong.

**9 Oct 2026.** `npm run prove:storage` fails exactly two checks:

```
FAIL  S2 clearing the heading bins A's scene with its 2 shots and 1 frame
FAIL  S2 …and A's scene list and shot list no longer hold them
```

**Confirmed pre-existing, not a regression.** Run on `main` at
`2ca58b9` it fails the SAME two checks, and `scenes.js`, `script.js`,
`shots.js`, `store.js`, `write.js` and `scripts/prove-storage.mjs` are
byte-identical between `main` and `develop` — so the code under test
has not moved. Checked this way round deliberately: "I did not touch
it" is the reasoning that was wrong twice on 8 Oct.

**What it means, and why it is not cosmetic.** Clearing a slug line in
the script is supposed to move that scene, with its shots and frames,
into `fms_scene_bin_v1__<project>` so Ctrl+Z can bring it back. The
proof says the bin does not receive it, and that A's scene and shot
lists still hold the rows. On the face of it a user clearing a heading
could lose the scene's shots rather than bin them, which is the
data-loss class `CLAUDE.md` exists to prevent.

**One thing that does not fit, and should be understood before anyone
"fixes" it:** the very next check, S3, PASSES — Ctrl+Z brings the scene
back with the same id and its shots and frame byte-identical, and
reports A's bin empty afterwards. A restore that works implies
something was stored. So this may be an assertion that has drifted from
the implementation (wrong key, wrong shape, wrong counts) rather than
a live data-loss bug. **Read S2 and S3 together before changing
either**, and establish which of the two is wrong — the test or the
code. `scripts/prove-storage.mjs` around lines 999-1014.

**Status on `sell/a8` (HEAD a944d78, 8 Oct 2026): does not reproduce.**
`npm run prove:storage` passes all 91 checks, twice, with S2 and S3 green.
The S2 `Control+A` + `Backspace` reaches the script model: the scene and its
2 shots and 1 frame land in `fms_scene_bin_v1__<A>`, so the hypothesis that
the clear is a no-op is refuted for this code (no app code was changed).
The old failure is not explained by this branch's code and was not
investigated further; it may have been fixed between `2ca58b9` and here.

**The real weakness found: S3 passed on a no-op.** On a no-op S2 the scene
stays in the list, the shots are unchanged and the bin is never written, so
the three S3 checks (undo restores id, shots byte-identical, bin empty) all
pass on nothing. `scripts/prove-storage.mjs` now asserts the state Ctrl+Z
undoes before pressing it (bin holds 1 entry with 2 shots and 1 frame; scene
list holds only HALL). A mutant with the S2 clear removed fails those two
checks.

Release note: today's promotion of `develop` to `main` went ahead with
this failing, because it fails identically on both branches and holding
13 unrelated commits for it helps nobody. It is not fixed and is not
forgotten.

## The full pending list

The ID-numbered registry of everything still to do (launch steps, production
gaps, quality gaps, billing, queued ideas, the emotional-craft layer) is
`docs/HANDOFF.md` §6c; the leftovers above are rows G1, G2, G7 and P12 there.
The 8 Oct audit's wrong findings are NOT listed — they were re-checked against
the code (see HANDOFF §9).

## FIXED 9 Oct 2026 — `prove:storage` and `prove:adoption`

Both were recorded here as red-on-main earlier the same day. Neither was
an app bug in the way it looked, and one of them was hiding a real one.

**`prove:storage` — a macOS modifier.** The proof pressed `Control+A` to
select a scene heading and `Control+Z` to undo. On macOS neither does
anything (select-all and undo are Meta), so the heading was never
cleared, `scene-sync.js` was right not to bin anything, and four checks
failed for months. `ControlOrMeta+…` fixes it; measured directly —
`Control+A` then Backspace left "KITCHEN" untouched, `ControlOrMeta+A`
cleared it.

The part worth keeping: three checks AFTER the failures were passing
**vacuously**. "Ctrl+Z brings the scene back", "its shots and frame are
byte-identical" and "A's bin is empty again" are all trivially true of a
scene that never left. A red run showing three greens for the thing it
is failing to test is how this survived being looked at. (The proof's
author had anticipated exactly this and added two guard assertions
before the undo — those guards are what made the diagnosis quick.)

**`prove:adoption` — identity that could not survive a page load, and a
real bug underneath it.** The proof faked sign-in by writing
`fms_studio_account_v1` once. cloud.js boots on these pages, finds the
project configured and no session to restore, correctly concludes the
stored id is stale and clears it — deliberate, documented, and right.
So the key survived module evaluation on the load that planted it and
was gone by the next, and every signed-in case silently ran in the
DEVICE namespace. Identity is now re-established before every document
through `addInitScript`, and every context the script opens gets it —
the 390px case and the AA walk built their own and were running signed
out while asserting signed-in things.

**What that was hiding: `hub.js` called `adoptAccountLabel()` in three
places and never imported it.** Every sentence the hub writes after
adopting threw `adoptAccountLabel is not defined` — the toast that
confirms the adoption and the line that says the work is in both places.
The adoption itself had already happened, so the symptom was a silent
failure to tell anyone about it. A proof that runs signed out cannot see
a bug in the signed-in path.

Two assertions in that file had also expired: "AA pass measured 4
themes" and "5 skins" were true of the app before the revamp, and the
walk's `total > 100` floor was calibrated for 4x5 = 20 passes. All three
now derive from what the app actually offers, per CLAUDE.md's own rule
that a check counts what exists rather than naming a number.

## feature.html at 390px: the STEPS tab covers the language toggle (10 Oct 2026)

Found in the real-browser pass (`docs/BROWSER-HANDOFF.md` §0). At a true
390x844 viewport the fixed vertical STEPS tab, `.step-rail-toggle`,
occupies **x 0–44**. The language toggle's **"English" button spans
x 25–111**, so 19px of it sits behind the tab whenever the toggle passes
the tab's vertical band (the tab is pinned at viewport centre, y 392–452).
`document.elementsFromPoint` at the tab's centre returns
`step-rail-toggle` above `steps-lang`.

The consequence is a mis-tap, not just a cosmetic overlap: a thumb landing
on the left edge of "English" opens the step rail instead of switching
language.

**Step titles are NOT affected** — they start at x 99, clear of the tab.
So the fix is only about the toggle: give `.steps-lang` a left inset at
narrow widths (the tab's 44px plus a margin), or move the toggle out of
the tab's band. Measured on a local open build, which is the same layout
as production; the gate does not affect it.
