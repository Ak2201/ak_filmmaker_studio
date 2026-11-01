# Known issues

Last reviewed: 2026-10-27 (the full-app QA's leftovers added at the end).

Bugs found and NOT yet fixed. Each one says where it is, what goes
wrong, and the likely fix. Delete an entry in the same commit that
fixes it; a list nobody prunes stops being believed.

Recorded 6 Oct 2026, during the consumer pass (CLAUDE.md open item 14).
Pruned 7 Oct 2026, twice: first with the Medium/Low fix pass over
`docs/archive/UX-AUDIT-2026-10-06.md`, then with the open-issues pass that
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
- **Two writers changing the synopsis prose at the same moment are not
  merged by sentence.** With co-editing on, the arriving text is kept and
  the other is saved on the Synopsis step ("Use this text" / "Dismiss").
  Steps, marks and a step's colour merge on their own.
- **A beat step and a scene that never held the same text are left apart.**
  The Dragon and Dark Knight samples and steps the breakdown wrote have
  scenes whose synopsis was never the step's text; neither side is offered
  over the other. Once the two texts are made the same, the pair syncs.
- **A short film that chose another beat sheet before 23 Oct 2026 shows
  its old steps in Unassigned.** A short is always the five beats now
  (owner: "use only 5 beats"). Every step is kept with its text and its
  old beat; each waits in the Unassigned bin until it is filed under one of
  the five. Nothing is deleted. The story's `framework` field reads
  `short_five` after the next save (it is the view, not the work), so a
  project later switched to Feature picks its old beat sheet again to see
  those steps where they were.

## ~~Open 19 Oct 2026: the gated site cannot be OPENED from scratch offline~~ FIXED 19 Oct 2026

**Owner chose the grace.** Every admission the server confirms stamps
`fms_sitegate_verified_v1` ({at, uid}, at most hourly); a cold start that
cannot reach the server opens when that stamp is under 14 days old, belongs to
the stored session's account and that session is still on the device. A server
"no" is never overridden; signing out clears it. `src/lib/sitegate.js`
`graceOk()`, `prove:gate` (s). The original report:


Found by the round-2 review. Once a tab is open it keeps working without a
signal, but a cold start with no connection is refused: `sitegate.js` fails
closed, its pass lives in sessionStorage (empty in a new browser session),
and `runGate()` reads a failed status call as `unreachable`, so the visitor
is sent to `invite.html` and their local work stays hidden (never touched).
That is the documented stance (`docs/GATE.md` §0), so the marketing copy
was corrected to say "once it is open" rather than the gate being changed.

**Owner decision needed** if a film set should be able to open the app with
no signal at all: a durable "last verified on this device" grace (a
localStorage stamp with an expiry, admitting `unreachable` only when a
recent successful check exists) would do it, and it reverses fail-closed
for that one case.

## ~~Open 19 Oct 2026: old Outline links land on a hidden tab, sometimes~~ FIXED 19 Oct 2026

**Owner: they land on the Story path's Beat Sheet** — `write.html#outline` →
`story.html#path-outline` (`src/lib/write-route.js`; `test:blueprint-route`,
`prove:script` case 12). The original report:


`write.html#outline` redirects to `breakdown.html#script` (`src/lib/write-route.js`
`outline:`). `#script` is Screenplay Analysis, module `script-breakdown`, which
has been `plans: []` since 17 Oct 2026, so plan-gate hides it. Whether
`tabs.js` picks the tab before or after it is hidden is a race: usually the
URL stays `#script` (on a hidden section), sometimes `tabs.js` falls back to
the first tab and rewrites it to `#overview`. `prove:script` case 12 failed
once in three runs on this. Not caused by item 52; found while running it.
Needs an owner decision on where an old Outline link should land now (the
Whole script tab, or the Story page's beat board), then one line in
write-route.js and the proof's expectation.

## ~~A held Ctrl widens the band at 390~~ FIXED 19 Oct 2026

It was not Ctrl. `shell.js` loads `video-help.js` on the first keydown,
pointer move or tap (or after 8s), and that mounts the "How this works"
button at the front of `.sh-tools`. Below 1100px `video.css` hid it with
`.sh-bar .vid-help-btn` (0,2,0), but kit.css's phone tap floor
`:root :is(…, .site-foot a, …, .btn) { display: inline-flex }` scores
(0,2,1) because `:is()` takes its most specific item — so the button
showed, the breadcrumb collapsed and, with a title as long as "Proof
Replace", the band ended 13px past a 390px screen. Phones were affected
too (a tap is enough), which the first version of this entry got wrong.
The hide rule is `:root .sh-bar .vid-help-btn` now; `prove:replace` fires
a keydown at 390 and measures.

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
- **The production host is `filmmakerstudio.in`** (owner, 11 Oct 2026),
  registered at Hostinger and paid to 2028-10-11.
  `thefilmmakerstudio.vercel.app` stays a Vercel alias and keeps serving,
  so links already shared still resolve. The host lives in
  `src/data/brand.json` alone; the off-repo half (Vercel, Hostinger DNS,
  Google origins, the Supabase allow-list, Search Console, Razorpay) is
  `docs/LAUNCH.md` section 7a.

## Left over from the 8 Oct 2026 release (the ten workstreams)

- **First paint grew on four pages, and the budget was recaptured for it.**
  reports (+43 KB: DPR, one-liner, running time), deliverables (+41 KB:
  CBFC flags, dialogue list), budget (+22 KB: the six cost tabs) and write
  (+2 KB). The growth is the features themselves, visible on those pages'
  first render. ~~The cheapest win if it matters: `src/pages/deliverables.js`
  imports `src/data/cbfc-rules.json` and `lib/pdf.js` at module scope.~~
  **Already done (checked 19 Oct 2026; HANDOFF §6c row G7):** `deliverables.js`
  now loads `lib/pdf.js`, `lib/cbfc.js` and `cbfc-rules.json` with dynamic
  `import()`. The +41 KB figure is the measurement as first taken, before that.
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

## ~~feature.html at 390px: the STEPS tab covers the language toggle~~ FIXED 10 Oct 2026

> **Fixed the same day.** The inset was a CONSTANT and the constant was
> wrong; it is measured now. `chrome.js` publishes `--step-tab-w` and
> `chrome.css` insets `main` by it. Verified at a true 390x844: published
> 44px agrees with the live width, `main` is inset 48px, "English" sits
> at x 65 with a 21px gap from the tab, nothing covered, no overflow.
>
> **Two things worth keeping from the fix.** The tab's width DEPENDS ON
> THE DEVICE — 23px with a mouse, 44px on a touch screen, because
> base.css floors a tap target at 44px under `(pointer: coarse)`. No
> single constant could ever have been right, which is why the original
> 22px was wrong on exactly the devices that mattered.
>
> And the first attempt at the fix shipped the same class of bug it was
> fixing: measuring once and again on `document.fonts.ready` published
> 23px (the fallback face) while the button was really 44, so the inset
> came out at 27 and "English" cleared the tab by nothing at all. A
> ResizeObserver on the button cannot be early — but its callbacks ride
> the rendering loop, so a tab that is not compositing never gets one.
> Both are in place now, plus one delayed re-measure, because timers run
> when the renderer does not.

### The original report



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

## prove:billing block (m) failed ~1 run in 3 — FIXED 10 Oct 2026

Not a flake, and not caused by the STEPS-tab work (confirmed by stashing
that change: 2 of 3 runs still failed without it). Two causes, one of
them a real bug in the admin console.

**The real one.** `billing-admin.js` rebuilds the "Add a code" form on
every render, and `load()` calls `rerender()` twice — once on entry and
once when its three calls return. A refresh landing while somebody is
typing emptied the form, so the submit that followed sent a half-filled
code: the affiliate code arrived with no commission and the row the
proof waits for never appeared. **Exactly the bug already fixed for the
refund-request form** ("a background billing refresh no longer wipes the
form", 0c897a7), in the next form along. The promo form keeps its draft
across a render now, and clears it on save so the next code is not
edited on top of the last.

**The other one was the proof's.** The section kicks off `load()` while
it is being built, so the proof was typing into a page that was still
loading — a race nobody runs in real life, since a person opens the
page, watches it fill, then types. It waits for the promo table to have
a row (earlier blocks create codes) before touching the form.

Both were needed: the draft fix alone still failed 1 run in 4. Five
consecutive clean runs after.

**The shape to remember:** a form rebuilt by a background refresh loses
what is being typed into it. It has now bitten three times in this
codebase — the invite-request note, the refund request, and this. If you
add a form to a page that re-renders from a data load, keep its draft.

## Wave 3 notes (10 Oct 2026)

- Settings > Appearance > Reduce motion stores `reduceMotion: true` in the existing
  `fms_studio_prefs_v1` blob (no new key). It sets `html.ma-off` and `--motion:0`.
  `prefersReducedMotion()` in `src/lib/motion.js` honours it.
- `splitWords` now keeps a visually-hidden full-text copy (`.mo-sr`) instead of an
  `aria-label`; `start.js` still splits its h2s, the app pages no longer do.
- Tanglish blocks (`.tn`) are stamped `lang="ta-Latn"` by `lang.js`.

## Left open by the full-app QA (27 Oct 2026)

HISTORY item 67. None is high severity. Each was confirmed by the testers and
declined by the fixer for the reason given (a product decision, an owner
schema step, a redesign, or not reproduced). Fifteen were then fixed on 28 Oct
2026 (HISTORY item 68) and deleted here. Delete an entry when it is fixed.

- **Breakdown, round 2: Bin 'Delete for good' and 'Empty bin' wording confirmed after the fact.** Not a separate fix. The duplicate polish finding on the Empty-bin confirm label is covered by the bin fix above.
- **Visualize & post, round 2: The reported replaceWith page error on call-sheet edits.** Neither verifier reproduced it. The cause (replacing #call-sheets inside a blur) is gone with the in-place repaint, and check 13 asserts no page error.
- **Account & business, round 2: Offline Settings card showing 'ROLE Member', a trial offer and 'Plan details load when you are signed in' (part of the raw-errors finding).** The verifiers did not confirm this part, and I did not reproduce it. Only the raw-error wording in that finding was fixed. The offline role and trial claims need their own repro before changing settings-model.
- **Story, round 3: 'change in Settings' (17px) and the Synopsis beat-name buttons reported as short.** The verifier showed 'change in Settings' is an inline link in a sentence, which is exempt from WCAG 2.5.8. The beat-name buttons already meet the coarse-pointer 44px floor. Only the stand-alone anchor was confirmed.
- **Story, round 3: Pencil buttons render value="undefined".** The verifier could not confirm this and it does not affect the accessible name. It was not reproduced, so no change was made.
- **Budget & money, round 3: Rupee 1250.50 displays as ₹ 1,251.** Whole rupees is the deliberate rupee format, and paise are negligible. Only the dollar cents loss was fixed.
- **Account & business, round 3: Promo-quoted card switches to rupees while its neighbours stay in dollars.** The card follows the quote's own currency (qCur), which is the charged currency and is deliberate: CLAUDE.md says a quote states what is charged. Only the per-day half of that finding was fixed.
- **Account & business, round 3: Region radio drops focus after a pick.** Choosing a region calls location.reload(), so no in-page focus restore can apply. The radio pattern and arrow keys are fixed. Reduce motion never lost focus (no redraw).
- **Breakdown, round 4: Commit-on-blur for the Scene Breakdown '+ Add' field.** FIXED. A name typed and clicked away from now commits (`focusout` beside the Enter handler in `breakdown.js`): non-empty, trimmed, duplicates still refused by `tagMany`. `attachElement` empties the field before it re-renders, so Enter followed by the removed field's blur finds nothing to add; focus moving to the category select or the Attach button inside the same adder is skipped (no wrong category, the click still lands); a blur commit never pulls focus back. Checked in a browser: blur adds once, Enter then blur adds once. A blur caused by pressing another control redraws only after the press ends, so that control's click still lands.
- **Schedule & reports, round 4: Camera wrap after wrap is not checked (part of the DPR finding).** cameraWrap is not used in any calculation or check anywhere in dpr.js. Adding a comparison would be a new rule, and a camera wrap after the crew wrap can be legitimate. The overnight-wrap and zero-length parts were fixed.
- **Schedule & reports, round 4: Screen Time durations use two notations (m:ss and h m), fixed only by a caption.** formatDuration is shared by about ten models and pages (breakdown run, pitch deck, edit model, story cards). Changing its notation is a cross-app redesign, so I added a unit explanation to the screen-time caption instead and left the formatter alone.
- **Schedule & reports, round 4: Recce print: each of the 17 locations takes its own page, about half empty.** The finding's fixable items (placeholder, native select, screen-only hint) are done. Packing several recce cards per page would change the sheet's layout and break-inside rules, which is a redesign. The one-card-per-page break is deliberate for a per-location recce sheet.
- **Schedule & reports, round 4: Readiness check 'dates out of order' for the calendar (second half of the duplicate calendar finding).** The on-card note names the cause where the date is typed. A Ready-to-shoot row would add a second opinion about the same data, which readiness.js is built to avoid (it composes existing checks).
- **Budget & money, 28 Oct 2026: a film made outside India still gets GST, TDS and GSTIN columns in the actuals and expenses CSV exports, and the wage table's overtime placeholder still says "½ batta".** FIXED. `actualsCSV` and `expensesCSV` take a trailing `india` flag (default true, so an India film's file is byte-identical) and the page passes `!filmAbroad()`; abroad, actuals drop Actual (excl. GST), GST and TDS withheld and "Actual (incl. GST)" reads "Actual", expenses drop GST %, GST and GSTIN and "Amount (incl. GST)" reads "Amount". The overtime placeholder reads "e.g. 1.5x after 10 h" abroad. `test:costs` asserts both headers and the India file unchanged. A spreadsheet that imports an international film's CSV by position will see the columns shift.
