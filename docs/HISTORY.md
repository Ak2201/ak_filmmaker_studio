# Build history — the open items, as they were worked

Last reviewed: 2026-10-19. **This is a historical log, not current documentation.** Paths, counts and "not run live" statements below were true when written and are NOT kept up to date; some files named here have since moved (SQL to `supabase/schema/`, superseded plans to `docs/archive/`). For the live state read `docs/HANDOFF.md` and `CLAUDE.md`.

This is the "Open items" section that lived in CLAUDE.md until 7 Oct 2026,
moved here verbatim because it had grown to half that file and almost all
of it records FINISHED work: the reasoning, the dead ends and the
measurements behind each pass. It is the record, not the brief. CLAUDE.md
keeps a one-line status per item pointing here; the invariants and traps
that came out of this work stay in CLAUDE.md, because those are rules.

Read an item here when you need to know WHY something is the way it is.
Nothing below is maintained going forward — a new pass gets a new entry
appended at the end, and CLAUDE.md's table gets one line.

## The items

In rough priority order. The reasoning behind the ordering is in the revamp plan.

1. ~~**Rename the storage keys.**~~ Done. The prefix is `fms_`;
   `migratePrefix()` in `src/lib/store.js` runs first in `init()` — before
   `migrateLegacy()` and before the storage proxy is installed, because the
   proxy would have scoped the rename to the open project. 137 string
   literals across 26 files.

   Proved on a seeded pre-rename studio rather than assumed: every value
   survived, including the `__<projectId>` suffixes, private notes, theme
   and the AI key; zero old keys left; idempotent across three consecutive
   loads. The one real breakage path was backups — project buckets are keyed
   by field name and survive untouched, but `notes` stores RAW key names, so
   both importers (V1 and V2) now map `arunak_note_*` forward. Tested with a
   real exported file rewritten to the old prefix.

2. **The chain is closed in both directions** — and now it also runs
   BACKWARDS, which it never did. scene → breakdown →
   stripboard → day out of days → call sheet, all reading
   `src/lib/scenes.js`, and now the budget reads it too: the library's
   calculator derives shoot days, scenes, pages and locations from the scene
   model rather than asking for a day count the user already worked out.
   `USE N DAYS IN THE ESTIMATE` fills only the day fields left blank and says
   how many it left alone — a hand-set figure is a decision, not a gap. This
   was the open item that justified the whole rebuild and it is done.
3. ~~**AI, bring-your-own-key.**~~ Done, for one job: drafting a shot
   division from the script. `src/lib/ai.js`, key at `fms_ai_key_v1`
   through `rawGet`/`rawSet`/`rawRemove` so the storage proxy cannot scope
   it, absent from all five registries (`SCOPED_KEYS`, `PROJECT_KEYS`,
   `ALL_KEYS`, the Supabase scope list, and `GLOBAL_KEYS` — that last one
   is what `export-all` walks, and it is the one most easily missed).
   `connect-src` in `vercel.json` and `netlify.toml` names
   `api.anthropic.com`; without it the browser refuses the request.
   Two independent gates: no key, and no script.

   The rest of it is done too: dialogue passes and beat critique, in
   place, gated twice, sharing one `callModel()` fetch/stream/abort path
   with the shot division rather than a third copy. A model cannot tell a
   writer they wrote something they did not — a quotation that is not word
   for word is stripped and counted.

   A fourth job is in: **a synopsis becomes a script.**
   `src/lib/scriptgen.js` owns the job, `ai.js` owns the three calls
   (`draftBeatSheet`, `draftSceneList`, `draftScenePages`) and the
   writing still lands in `script.js` and `scenes.js`. It is staged
   because it has to be: a Tamil feature is 60,000-120,000 output
   tokens against a 32,000 ceiling, so one call cannot do it and a
   call that tries is billed up to the cut. Stage 2 commits the SCENE
   MODEL before any pages exist, so the breakdown, stripboard, budget
   and reports light up even if stage 3 never runs — the same lesson
   `script-import.js` learned. A cursor makes it resumable, because a
   run that dies at scene forty must not re-bill thirty-nine scenes.

   The honest part: screenplay page maths is 55 lines of fixed-width
   Courier, so the default mode keeps Tamil in the DIALOGUE and leaves
   slugs and action in English — which is what Tamil crews shoot from
   anyway, and the only arrangement where the page count stays
   arithmetic. Tamil-throughout is offered and labels its page count an
   estimate rather than printing a number the grid cannot support.

   All three earlier callers go through `src/ui/ai-panel.js`. visualize.js
   was the last holdout — it carried a hand-copied key form and key bar,
   the third copy the module exists to prevent, and it is gone: the page
   keeps the shot half (pick / run / stop / undo) and the module owns the
   key, the bar, the gates and the disclosure. A page-local mirror of
   "does a key exist" is what goes stale, so there isn't one any more;
   the module asks `ai.js` at render time and pages redraw on
   `onAIChange`.
4. ~~**Script import and a proper screenplay PDF.**~~ Done.
   `src/lib/script-import.js` reads `.fountain`, plain screenplay text and
   `.fdx` (via `DOMParser`, no dependency) and fills BOTH the script
   elements and the scene model — an import that fills only the editor
   leaves the breakdown, stripboard, budget and reports empty, which is
   half a job. Nothing is written before a preview; Replace takes a
   revision first. `src/lib/screenplay-export.js` paginates properly, so
   `(MORE)`/`(CONT'D)` and page numbers are correct.

   **PDF too.** It is the format a script actually arrives in and it
   had no reader. `src/lib/pdf-text.js` turns a PDF back into indented
   text and PARSER 2 reads it — a PDF has no element types in it, what
   it has is POSITIONS, and in a screenplay the position IS the type
   (cue at 3.7in, parenthetical at 3.1in, dialogue at 2.5in, action at
   1.5in). Those are the columns `parseText()` has always read, so
   there is no second classifier and no second place for the two to
   disagree.

   **No library, and that is three decisions rather than a shortcut.**
   `script-src 'self'` with no `worker-src` means a blob: worker — how
   most bundled PDF engines start — is refused by the browser; a
   megabyte outside the service worker's manifest is an import that
   works at the desk and fails on location; and this needs one thing
   from a PDF, which is where each run of text sits.
   `DecompressionStream('deflate')` is native and is the piece that
   used to require one.

   **The refusals are the feature.** Encrypted, scanned, and
   subset-fonts-with-no-ToUnicode-map are each detected and declined
   with a sentence saying what to do instead, because an extractor
   that half-works produces mojibake and mojibake imported into
   somebody's script is worse than an import that stopped.
   `npm run test:pdf` builds real PDFs — compressed, packed in object
   streams, Type0/Identity-H — and asserts the columns survive. 43
   assertions, no browser, no dependencies, ~1s. It found two bugs
   while being written and the first is the one to know:
   **DecompressionStream throws on ANY trailing byte, and the spec
   says the EOL before `endstream` is not part of the stream** — so
   every writer emits one and nothing compressed decoded at all.

   Known gaps, small: `.fdx` `Number="12"` attributes are not read (a
   number inside the heading text is); the plain-text parser is
   heuristic — it round-trips our own export exactly, but a
   third-party `.txt` may need a type corrected by hand; and the PDF
   reader assumes a monospaced advance within a run, which is every
   screenplay and not every PDF.
5. ~~**Finish collaboration.**~~ Done, with residuals that matter.
   `src/ui/comments.js` attaches a thread to a FIELD, not a character
   offset — the text under a note is about to change. Accepting a
   suggestion dispatches a bubbling `input`/`change` from the field itself,
   so the page's own save path, its derived widgets and the cloud push all
   run in their usual order; the row is marked accepted only after the
   value lands.

   `docs/SECURITY-RLS.md` holds the audit. It found three high-severity
   holes, each of which the UI actively lied about: a share link could not
   be revoked or expired (claiming one wrote a *permanent* collaborator
   row, and revoke deleted the token while the access stayed); an `edit`
   collaborator could move the project into an account they owned and then
   delete that account, cascading the whole project away; and a view-only
   link handed over the crew's email addresses, because comments stamped
   the signed-in email into `author_name`. Fixed in an appended schema
   section, along with comment-status forgery, replies cascading away with
   a deleted parent, and three account-tier escalations.

   **The SCHEMA HAS NOW RUN; the AUDIT is still static.** This note said for
   a long time that `supabase/schema/supabase-schema.sql` had never met a database, and that
   stopped being true without anybody updating it — which is the failure mode
   this file exists to avoid. All seven tables are live on the project
   `conhlrulxfwkhsnymakz`, sections 11 and 12 (`claim_invite`, the scriptgen
   and songs scopes) included, and the SQL file itself records the two runs.
   What has NOT happened is the live half of the audit: `docs/SECURITY-RLS.md`
   ends with ten checks needing two real accounts, and none of them has been
   executed. Also open — share tokens are stored in
   plaintext (a product call: the owner's "re-copy this link" depends on
   it), and Supabase Realtime could not be verified statically, because
   DELETE payloads are documented as not RLS-filtered the way INSERT and
   UPDATE are.

   `claim_invite()` now EXISTS — schema section 11, wired in `cloud.js`,
   with nine live checks written into `docs/SECURITY-RLS.md`. The function is
   deployed, but none of those nine checks has been run against it, so its
   BEHAVIOUR is still only argued rather than observed.
   The credential is deliberately the EMAIL, not a token: an `owner`/`admin`
   row is read by `has_project_access()` and grants `edit` on every project
   in the account with no collaborator row, so a forwardable bearer string
   conferring that would be the most dangerous credential in the system.
   Google is the only sign-in, so the address is attested rather than typed.
   An `owner`-role invite is deliberately not claimable; invite as `admin`
   and promote.

   **BOTH ENDS EXIST NOW.** `src/lib/account.js` and
   `src/ui/account-panel.js` are the sending end — create the account, list
   members, invite by e-mail, revoke — as a section on `settings.html`. It
   needed NO new SQL: `acc_insert`, `acc_select`, `am_select` and `am_write`
   already permitted exactly this, and `account_members_guard()` already
   compares OLD and NEW so an admin cannot promote itself or delete the owner.

   **And section 11 had never actually run.** This file claimed it had. Probed
   through the app's own client, `accounts`, `account_members` and
   `projects.account_id` were all present and `claim_invite` was NOT — so the
   receiving end did not exist either. It has been applied and verified
   through the app rather than the SQL editor. Take the lesson over the fact:
   **the schema file's record of its own runs is not evidence.** Ask the
   database.

   **A HOLE THE AUDIT MISSED, found while building the panel.** `acc_insert`
   checks only `owner_id = auth.uid()`, and `accounts_guard` — the trigger
   carrying "Plan and limits are set by billing, not by the client" — is
   BEFORE UPDATE. So an INSERT carrying `seat_limit: 999, plan: 'pro'` is
   refused by nothing: any user can mint themselves an unlimited account. The
   guard is enforced on update and open on insert. `createAccount()` sends
   only a name and an owner id and lets every limit default, deliberately,
   rather than writing the shortcut into the product. The fix belongs in
   `docs/SECURITY-RLS.md` and in a WITH CHECK on that policy.

   **Seats are real and the panel does not argue with them.** `seat_limit`
   defaults to 1, the owner's own row takes it, and `enforce_seat_limit()`
   raises 53400 on the next insert. So the invite form is HIDDEN when seats
   are full and the panel says where seats come from, rather than offering a
   control whose only outcome is an error.

   **What is still missing.** Projects are not attached to accounts by any
   UI: `projects.account_id` exists and `has_project_access()` reads it, but
   nothing sets it, so an admin you invite today sees no films. `account.js`
   has `setProjectAccount()` ready and the panel deliberately does not call
   it — attaching a film hands every account admin edit rights on it, which
   is an access-control decision a person should make on purpose rather than
   as a side effect of creating an account.

   Also still open from the audit's A6: an invitee cannot SEE an invite
   before claiming (`am_select` matches on `user_id`, null while pending),
   so the flow auto-joins on sign-in with no preview and no decline. And the
   ten live RLS checks in `docs/SECURITY-RLS.md` have still never been run —
   the schema being deployed is not the same claim as the policies behaving.

6. ~~**`--ink-faint` fails the 4.5:1 floor, and the gate cannot see it.**~~
   Done, and the second half of it is the part worth keeping.

   `--ink-faint` is no longer a text colour anywhere. It clears 4.5:1
   against **no ground in any theme** — 4.13:1 at best on the ink
   theme's sunk card, 2.34:1 at worst on Desk's — and it could not be
   retuned, because raised far enough to clear AA it lands on
   `--ink-muted`. It was misnamed rather than mistuned: "faint"
   described how it looked, and what it encoded was "below the
   legibility floor". All 41 `color:` rules now take `--ink-muted`
   (worst case 4.54:1); the token survives for borders, swatches and
   hover lines, where a 3:1 hairline is a correct hairline. **The ink
   hierarchy is three deep now, not four** — `--ink`, `--ink-body`,
   `--ink-muted`. Two kinds of secondary text are told apart by size,
   weight or case, not by a fourth grey nobody can read.

   Two more went with it: `--rule`/`--rule-hair` as text (1.2–1.8:1),
   and `--print-rule` as text on the screenplay preview (3.54:1), which
   is why `--print-muted` now exists.

   **The probe no longer walks a list.** `SURFACES` is gone; the AA
   check walks every leaf text node in `main`, the open modals and the
   shell, across every theme × every skin × every page, and every model is
   seeded on every page first — an empty page has nothing to walk, and
   a wholesale walk of an empty state is a list by another name. A
   second source check greps for `color:`/`fill:` on the four hairline
   tokens, the same shape as the fill-as-text check beside it, because
   a grep sees files no test page renders. Verdict at the time of
   writing: zero findings, from 173.

   What is still unmeasured, so nobody mistakes the walk for total
   coverage: page state this run does not reach, and `::before` /
   `::after` content, which is not a text node.

7. **Chennai rates — partly done, and the remainder is a sourcing problem
   rather than a coding one.** Camera bodies are verified against a Chennai
   rental house and tagged CHECKED with a link and a date. Everything else
   — every lens, light, grip, sound and post item, and all eleven crew
   rates — is unchanged and now reads NOT UPDATED, because no Chennai rate
   card for any of it is published anywhere reachable.

   The crew section is the interesting one: **there is no current union
   floor to quote, because none exists.** The 2022 FEFSI–TFPC wage MoU
   expired 9 March 2025, was never replaced, and is in Madras HC mediation.
   That absence, cited, is worth more to a producer than a two-year-old
   number presented as a rate.

   Two traps for whoever picks this up. Do NOT apply an inflation
   multiplier to close the gap — the overlay says so in its own `method`
   field. And the 2026 vendor figures run about 3x BELOW the 2024-25
   ranges, probably body-versus-package but unconfirmed, so both are shown:
   replacing a market range with one vendor's list price would make a
   filmmaker under-budget threefold.

   The festival list is now a submission tracker that **enforces** the
   never-premiere-before-a-rejection rule rather than printing it.

   **The IFFI finding is closed, and it was a real deadline error.** The
   entry used to say no short-film category was visible; a short does
   have a route, and it is Indian Panorama's Non-Feature section, not
   the International Competition. Its deadline was 10 August 2026 for
   the online form and 17 August for the stamped hard copy — three
   weeks EARLIER than the 31 August FilmFreeway date the overlay showed
   as the single "Regular deadline". A Chennai filmmaker reading that
   one as theirs missed the festival by three weeks. Both routes are
   now listed with the route in the label, because the fix is telling
   them apart rather than picking one. Indian Panorama is also a postal
   submission to NFDC Mumbai, not an upload.

   **MAMI still looks dormant** and still needs a human — unchanged.

   Two things learned while re-checking, both now enforced by the file:
   a festival carries the date ITS OWN entry was read, because
   re-checking four of eighteen used to restamp the other fourteen as
   fresh (the card read the file's single `lastChecked`); and an
   aggregator listing is not a source. Aspen is the case for the
   second — its own site publishes no next-edition dates while
   secondary listings happily do, so the entry stays `not-checked` and
   says why, which `not-checked` entries can now do because that
   branch renders its notes.

   A deadline may also be marked `seedable: false` — listed on the card
   but never seeded into a submission. Clermont-Ferrand needs it: its
   National competition closes AFTER both International dates, so the
   soonest future deadline on that festival is French-productions-only
   and tracking it would have counted down to a deadline the user
   cannot enter.

   ~~Still owed: `src/ui/budget.js` prices off the 2024-25 figures only.~~
   Done, and the second half of it is the part worth keeping. Reading the
   overlay was the easy half and was already finished; the estimator then
   showed the CHECKED figure *instead of* the band, which walked straight
   into the 3x trap named two paragraphs above. Alexa Mini hinted ₹8,000
   against a 25,000–35,000 card, Komodo ₹4,500 against 15,000–22,000 — a
   filmmaker anchored to the hint under-budgets the biggest line in the
   shoot threefold. `rateHint()` now shows **both**, names the multiple
   when the gap is material, and says the checked figure is one vendor's
   list price that may be body-only. Where they agree — FX6, 4,000 against
   a 4,000–7,000 band — there is no warning, because there is nothing
   wrong. It only ever hinted, never autofilled, which is why this was a
   misleading note rather than a wrong total.

   The library had this right all along by rendering the check rows BESIDE
   the card row instead of over it. The estimator is the page people type
   numbers into, and it was the one replacing — worth remembering next time
   a fix means "make page B agree with page A".

   `budget.html`'s own provenance line was the same fault in prose: it
   asserted every preset was 2024-25 while the hints underneath it showed
   2026 dates. It counts the overlay now instead of asserting.

8. ~~First-run experience.~~ Done. The hub no longer opens the new-project
   modal on a timer; the empty grid renders a first-run panel instead — what
   the studio is, three destinations that need no project at all, then the
   ask, plus a sample project — Dragon (2025, dir. Ashwath Marimuthu), 36
   scenes, 105 pages, 18 shoot days, 17 locations and a 29-person unit, so
   the blueprint, breakdown, stripboard, reports, contacts, plan, visualize,
   write and budget all have something real to show.

   **It is a reconstruction and says so everywhere it could mislead.** The
   public facts are credited and right; every piece of paperwork — the
   schedule, the dates, the budget, the unit, the recces, both call sheets —
   is invented, and that is stated in `_about`, in the meta fields, in the
   first line of both call sheets, in the first action element and at the top
   of all four documents. Two rules keep it honest and apply to any film that
   replaces it: NO REAL PERSON beside a contact detail (all 29 contacts are
   invented names on `@dragon.example`; character names are public and live
   in the role column; `hod_dir_date` is deliberately blank rather than
   invent a real director's signature date), and NO REPRODUCTION of
   anybody's actual screenplay.

   **That second rule used to read NO RETELLING and say the script was
   27 action, 7 scene headings, 6 transitions and ZERO DIALOGUE.** It
   is a full 36-scene screenplay now — `src/data/sample.dragon.script.json`,
   2,361 elements, 611 of them spoken — and the old wording was doing two
   jobs that have come apart. The part that still holds is that none of it
   is the film's writing: every line is original, written from the sample's
   own synopses, and each `synopsis` is still the functional line a 1st AD
   writes rather than a narrative beat. The part that had to go was "zero
   dialogue", which was never the principle — it was what the pages
   happened to be while a writing tool's demo project had no script for
   the Write module, the screenplay PDF, the sides, the page count or the
   AI shot division to act on. And the scene rows claimed 105 pages while
   the script held 2.3, which is the sample contradicting itself about the
   one number every other module is derived from.

   Four things about that file are load-bearing and the first is the one
   that will be broken first. It is a DYNAMIC import, and
   `vite.config.js` carries a matching exception, because the rule that
   folds `src/data/*.json` into the shared `data` chunk would have put a
   quarter of a megabyte on twenty first paints to serve one click; both
   halves are needed or the lazy import means nothing. Each scene is
   written to the length its own `eighths` already claim, measured with
   `script.js`'s metric, so the schedule and the budget still agree with
   the pages — it lands at 106.5 against the breakdown's 105.0, which is
   the difference a real script and a real 1st AD's eighths have, not a
   bug. The DIALOGUE IS TANGLISH and the slug lines, action and
   transitions are English, which is what a Tamil unit shoots from and
   the only arrangement where the fixed-width Courier grid the page count
   is arithmetic on stays fixed-width. And it is ROMANISED: the gate's
   romanisation check only walks keys ending `Tanglish`, so it cannot see
   these elements, and `--f-script` keeps its Tamil face last precisely
   because a Tamil family claims the Latin glyphs too.

   The wall of 24 steps behind it is handled
   too: a ten-step spine, and for each step the thing IN THIS APP that
   reads its answers, derived from `src/data/steps.priority.json` rather
   than hand-listed. The filter can never strand you on a hidden step —
   jumping or searching to one turns it off and says why.

9. **The interaction pass.** A command palette, a sixth skin, a motion
   scale and a set of state fixes. Four of these are worth knowing about
   because they changed shared machinery rather than one page:

   - `src/ui/palette.js` + `palette.css` — ⌘K / Ctrl-K over the whole
     studio. Wired once in `chrome.js`, so every page has it; a handle in
     the shell bar (`.sh-find`) makes the binding visible, because a
     shortcut nobody has been told about is a feature that does not exist
     for most people. It is the combobox pattern, not a div with a keydown
     handler: focus stays in the field and the active row is named by
     `aria-activedescendant`, which is the one mechanism that reports a
     selection the focus did not move to. The handle hides below 720px —
     the bottom action bar carries SEARCH there, and at 375px the handle
     wrapped the shell bar to a third row, which is ~300px of chrome above
     the first word of the page.
   - `--scroll-offset`, `--motion`, the four-step speed scale and
     `--ease-spring` in `tokens.css`; see the traps above for the first two.
   - `base.css` gained the document-level interaction rules: `touch-action:
     manipulation` on controls (never on the body — disabling pinch-zoom is
     a WCAG failure), 44px minimum targets under `pointer: coarse` only,
     `accent-color` so native checkboxes and ranges stop being the
     browser's blue on a sepia page, themed scrollbars, `text-wrap: pretty`
     on prose and `overflow-wrap: anywhere` with the `min-width: 0` that
     makes it actually work on a flex child.
   - `actionbar.js` menus answer to the arrow keys, Home and End, return
     focus to the button that opened them, and treat Tab as one stop rather
     than eight. `role="menu"` is a promise, and it was not being kept.

   **Gate run, on Node 22.** All fifteen pages: 720 `data-key`s present and
   0 lost, 100% accounted coverage everywhere but `short`, 0 idle writes, 0
   horizontal overflow at 390px, 6/6 skins distinct and reaching every page,
   0 console errors, 0 low-contrast findings from the AA walk across 4
   themes x 6 skins with the modals open, and the backup round trip
   restoring both projects.

   **The festival countdown comes out of both sides of the oracle, and
   the run's clock is NOT pinned.** The short film's step 10 prints live
   countdowns from `festivals.checks.json` — "in 33 days", "119 days
   ago" — and every one moves with the calendar, in both directions. A
   baseline captured on the 29th failed on the 30th with 13 unexplained
   missing words, all bare integers, none of them copy anybody had
   touched.

   `COUNTDOWN` in `scripts/verify-migration.mjs` derives the varying
   numbers from the same file the page reads, at the two dates that
   matter — the baseline's own `capturedAt` and now — and removes only
   the symmetric difference. So "in", "days" and "ago" keep their
   coverage, as does any number that lands on the same value twice, and
   immediately after a re-baseline the cost is zero because the two
   dates are the same day.

   **A FROZEN CLOCK USED TO SIT BESIDE IT AND HAD TO GO.** A
   `FROZEN_CLOCK` constant plus a UTC-pinned context solved the same
   problem a second way, and the two contradict rather than reinforce:
   COUNTDOWN's premise is that the page renders TODAY'S countdowns, so
   freezing the browser makes it strip the wrong set and whatever it
   failed to predict leaks. Exactly one number leaked ("61") the first
   time both were in the file.

   It survived as long as it did by coincidence — the frozen date was
   the same day the baseline was captured, so the two agreed and
   nothing failed. With the freeze gone the filter absorbs the real gap
   (3 days, 32 clock words, green) which is the proof that it was
   always the one doing the work. Pinning the timezone was wrong in the
   same shape: COUNTDOWN reads the LOCAL calendar day because that is
   the day the browser thinks it is, so forcing the page to UTC while
   this script stays on the machine's zone makes them disagree for part
   of every day.

   Neither an `EXPECTED` entry nor a re-baseline can do this job. The
   first names integers that are wrong tomorrow, and the anti-rot check
   then fails for stale allowances. The second goes green until
   midnight.

   No production code changed for any of this. A date seam in
   `festivals.js` would have been a test hook in a module that already
   parameterises `fromISO` everywhere — the harness is the right place to
   decide what "now" means during a run.

   **Three things the browser found that static checks could not:**

   - `requestAnimationFrame` does not run in a background tab, and every
     measured height in the chrome was published from inside one. A page
     opened in a background tab — open-in-new-tab, a restored session, a
     PWA cold start — had no `--mab-h`, no `--tb-h` and no `--sh-stick-h`
     until it was looked at, so the anchor offset was zero and the body
     reserved a 64px fallback for a 69px bar. All three now measure
     synchronously first, with the rAF kept as the post-font refinement.
     `getBoundingClientRect()` forces layout and works while hidden.
   - The hub already bound ⌘K to its own hero search and labelled the
     field with it, so on `index.html` both handlers fired: the palette
     opened AND the field behind its scrim took focus. The key belongs to
     the palette, which answers the same everywhere; the hub's field keeps
     `/`, which `chrome.js` already bound, and its badge says so now.
   - The focus timer is `position: fixed; bottom: 16px` at `--z-float`,
     one above the action bar, so at 375px on a blueprint it covered the
     END button completely. The save indicator and the toast host had
     already been lifted above the bar and the timer had not — when a
     bottom bar exists, the list of floats to lift has to be all of them.

10. **Back up to Google Drive — the whole studio, one file, kept current.**
    `src/lib/drive.js` is the client (auth, find-or-create, upload, download,
    head revision, revisions) and knows nothing about films;
    `src/lib/drive-sync.js` is the only place Drive and the studio meet. The UI
    is on `settings.html`, which is the app-scope page.

    **It REUSES the backup file rather than inventing a format.** `exportAll()`
    in `hub.js` used to build the v2 object and trigger a download in one
    function; the seam is cut, and `buildBackup()` / `applyBackup()` in
    `src/lib/backup.js` are now the only implementations of each. The hub owns
    the `<a download>` and the file picker, Drive owns the PUT and the GET, and
    the gate's backup round trip exercises the same code on every run — so the
    guarantee is inherited rather than re-earned. `applyBackup` has two modes
    and ONE loop: `merge` (the hub's import, additive, a colliding id lands
    beside as a marked copy) and `restore` (a Drive pull, a colliding id
    replaces in place, because a pull is this device catching up with itself
    rather than importing somebody else's films). Neither mode deletes a local
    project the file has never heard of.

    **One file, a stable id, and Drive's own revisions are the versioning.**
    No version scheme is maintained here; "restore the one from Tuesday" is a
    `revisions` call. The scope is `drive.file` — non-sensitive, no OAuth
    verification, and unlike `drive.appdata` it puts the file somewhere the
    person can open, copy and keep, which this app's whole premise requires.

    **Never clobber a remote you have not seen.** Every push reads
    `headRevisionId` first and refuses if it has moved since this device last
    pulled or pushed; the user gets both sides with their timestamps and picks.

    **AND BOTH SIDES OF THAT COMPARISON MUST COME FROM `readMeta`.** The
    question "does the upload response carry the head revision" was listed
    below as unproven; it is proven now and the answer is do not rely on it.
    `_doPush` and `connect()`'s create path stored what the WRITE returned
    while `_doReconcile` compared against what `readMeta` returns, and the two
    disagreed: a forced push succeeded, `revisionId` and `syncedAt` were both
    recorded, and the very next reconcile declared a conflict on a file
    nobody else had touched. Left alone `moved` is true for ever and Drive
    never uploads again. `headAfterWrite()` re-reads the head after every
    write — one GET, the same call reconcile makes, which makes the two sides
    equal by construction. The harness missed it because its fake Drive always
    returned a fresh id on a media PATCH; it can withhold one now, and that
    check was seen RED before it was trusted.
    "What changed locally" is `max(updatedAt)` across projects against
    `syncedAt` — a clock the storage proxy already keeps, which is why nothing
    here writes a dirty flag and nothing writes on a timer.

    **Only one sync owner.** `cloud.js` gained `ownsSync()` —
    `isConfigured() && session`, the same two conditions its own `saved`
    subscriber uses. Drive asks it (through `window.StudioCloud`, as
    `src/ui/auth.js` does) and goes manual-only when Supabase is live, because
    two live syncs writing the same storage echo each other forever, and
    Supabase also carries collaboration that a Drive file cannot. Worth
    knowing: `vite.config.js` folds every `src/lib` and `src/ui` module into one
    `studio` chunk, so cloud.js already evaluates on **every** page, not only
    the three that import it by name. **(Corrected 7 Oct: no longer true —
    chunking is core-by-name, data by file, rest by page; see item 18 and
    the chunking note in CLAUDE.md.)**

    **THE TOKEN, AND THE TWO THINGS THIS PARAGRAPH USED TO GET WRONG.**
    It is still never persisted BY THIS APP — a module variable, gone with the
    document. The client id is `VITE_GOOGLE_CLIENT_ID` at build time, not a
    storage key, and a build without it says so instead of offering a button
    that cannot work. Both halves below were measured against real Google,
    which is the only way either could have been settled.

    **There is no silent re-mint. This said there was.**
    `google.accounts.oauth2`'s token client ALWAYS opens a popup;
    `prompt: ''` suppresses the consent SCREEN, not the window, and a popup
    with no user gesture behind it is blocked. A direct probe in the live page
    returned `popup_failed_to_open`. That is One Tap / ID-token behaviour, not
    this flow. Consequences worth holding together:

      - `getToken({ interactive: false })` must therefore REJECT rather than
        fall through to a request, and now does. The version that fell
        through shipped a user-visible bug: Drive connected means every page
        load called it, and arriving by CLICKING a nav link leaves a fresh
        gesture on the document, so the browser allowed the popup — clicking
        Dashboard or Settings threw Google's sign-in window at somebody
        already signed in. Arriving any other way it was blocked and nothing
        showed, which is why it read as intermittent.
      - an expired token therefore surfaces as an error beside a working
        Connect button. It cannot refresh itself. That is the design now, not
        a gap.

    **Signing in connects Drive, and the window is ONE HOUR.** Sign-in asks
    Google for `drive.file` alongside the e-mail, and Supabase returns the
    Google token as `session.provider_token`. Supabase's docs say that value
    is returned once and not persisted; supabase-js 2.45.4 in fact writes it
    into the session blob in localStorage, so it survives a reload — measured,
    persisted true and live true on a reloaded page. drive-sync.js adopts it
    and connects with no popup and no second consent.

    **But it does not survive a REFRESH.** When supabase-js refreshes the
    access token roughly an hour in, the refresh response carries no
    `provider_token` and the stored one goes with it. So the automatic
    connection works on the sign-in and for about an hour after; beyond that
    Drive needs the button, and the error text says so. Measured: an hour-old
    session reported no grant live and none persisted.

    That one-hour window is a property of Supabase's refresh flow, not a bug
    here, and it cannot be closed from a static build. The two real fixes are
    both out of scope: a server holding a Google refresh token (which needs
    the client secret this app deliberately has nowhere to keep), or asking
    for consent again, which is the button. Do not "fix" it by writing the
    token to storage; that is the mistake ai.js already refuses for the API
    key.

    **The adoption listens for ANY session-bearing auth event**, not
    `SIGNED_IN`. supabase-js 2.45.4 announces a RESTORED session as
    `INITIAL_SESSION`, and restored loads are the only ones that can finish —
    the load that signs in is the one `Store.setAccount()` reloads out from
    under it, on a zero timer, which is what killed the first three attempts
    at this.

    **CSP.** Four new entries in BOTH `vercel.json` and `netlify.toml`:
    `script-src https://accounts.google.com/gsi/client`, `connect-src`
    `https://www.googleapis.com` and `https://accounts.google.com/gsi/`,
    `frame-src https://accounts.google.com/gsi/` (the silent token request is an
    iframe), and `style-src https://accounts.google.com/gsi/style`.

    **What is proved, and by what.** `settings.html` is NOT in the gate's
    `PAGES` and `baselineFacts()` hard-exits on a name missing from
    `baseline.json`, so none of this is in `npm run verify`.
    `scripts/prove-drive.mjs` builds its own `dist-drive/` with a fake client id
    and replaces exactly one seam — `fetch` to googleapis.com, and the GIS token
    client — with an in-memory Drive that counts revisions. Everything above
    that seam is the shipped code. It asserts the uploaded bytes are a v2
    backup holding both projects; that the API key's VALUE AND NAME are absent
    from those bytes with a key set on the device; create-on-first-connect;
    push with an unmoved head; refusal plus a named conflict when the head has
    moved; keep-mine and take-theirs; that a pull replaces rather than
    duplicates; the revision list and a restore from one; manual-only under
    Supabase ownership with no push on save; a debounced push when Drive is
    live; zero localStorage writes across four idle seconds with Drive
    connected; disconnect leaving the Drive file alone; and the settings page at
    1280 and 390 in both themes with no overflow, no inline handlers and every
    text node over 4.5:1.

    **Five of those six are now PROVED, against real Google.** The list used
    to read: a real OAuth consent, a real silent re-grant, the real
    `drive.file` scope, the real create and media PATCH, Drive's revision
    retention, and the CSP as a live browser enforces it.

      - consent, the scope, the create, the PATCH and the CSP: all exercised
        on the deployed host. A backup file exists, holds this studio, and
        Drive lists **four revisions** of it — so the revision history the
        restore feature rests on is real, not assumed.
      - the sixth, "a real silent re-grant", is proved to be IMPOSSIBLE
        rather than proved to work. See the token note above.

    **What is still unproved:** restoring from a revision against real Drive
    (the list is read, a restore from it is not), and what Drive does with a
    file somebody edits outside the app. The conflict path has only ever been
    exercised against a head this device had not seen, never against a
    genuine second writer.

    **THE CLIENT ID EXISTS NOW, AND IT IS COMMITTED.** `.env` carries
    `VITE_GOOGLE_CLIENT_ID` for the Web client "Filmmakers Studio - Drive
    (browser)" in the Google Cloud project `filmstudio-495419`. Committing it
    is the deliberate part: Vite inlines every `VITE_*` into the bundle, so
    the value ships in the page whatever we do, and Vercel builds from git —
    a value only in the dashboard would make a local build and the deployed
    one disagree about whether Drive exists at all. What actually guards the
    account is the client's **Authorised JavaScript origins** list, which is
    why a new deploy domain is a change in the Google console, not in this
    repo. Registered today: the vercel.app host, `localhost:5173` (dev) and
    `localhost:4173` (preview). A real secret still goes in `.env.local`,
    which is now gitignored; the GIS token model uses no secret at all.

    **Setting it moved the gate.** With a client id present, `settings.html`
    renders the Drive panel instead of the "this build was made without a
    Google client id" paragraph — nine words left the page and seventeen
    arrived, which the text check correctly failed. The answer was
    `npm run baseline`, not an EXPECTED row: nine allowances for one cause is
    the list growing, and the diff was confined to `settings` with zero
    data-key movement on any of the sixteen pages, so the recapture was
    provably narrow. Check that diff yourself before re-baselining for the
    same reason; a wider one means something else drifted too.

    **The consent screen is the remaining blocker, and it is not code.** The
    Google project is still `Testing` with zero test users, which means NO
    account can consent — including the developer's — so Drive and the
    Supabase Google sign-in both fail until it is published or a test user is
    added. Publishing an External app needs a privacy policy and terms of
    service on the authorised domain, which is what `privacy.html` and
    `terms.html` are for (see the note on them below).

11. **PRD 2.0 — five stages, the Story stage, the gate, the extension.**
    The six phases are now the PRD's five stages (Story, Screenplay,
    Pre-Production, Production, Post-Production). Every module object,
    id and href survived the regroup; no phase id is stored anywhere, so
    renaming them needed no migration. Post-Production carried two
    `planned` modules; both are built now (open item 12). The scope decisions, asked of the user and
    answered before any code: the extension WRAPS this app (one
    codebase); the gate guards the CLOUD and the EXTENSION, never local
    work; the backend is the existing Supabase project; built modules
    stay live.

    - **Story** (`story.html`, `src/lib/story.js`, `src/data/frameworks.json`):
      highlight-to-tag, three frameworks, a tension heatmap with pacing
      flags, AI beat mapping that returns QUOTES (offsets are found
      here; a non-verbatim quote is dropped), `.docx` with no library.
      A hand tag is stored per framework; switching framework is a view
      change. Marks re-anchor by text after an edit, and a passage that
      left the synopsis is reported detached, never re-pointed.
    - **Screenplay** (`src/lib/screenplay-analysis.js`): screen time
      (dialogue pace against action rhythm, with page-a-minute shown
      beside it), the cast matrix, auto-tag suggestions that are
      buttons, not tags. The PRD's colours (cast red, props blue,
      vehicles and stunts yellow, sound green) are CATEGORY hues,
      `.hue-el-*`, in all four token blocks; yellow carries its own
      on-colour. Pitch deck: one click, landscape PDF, print pipeline.
    - **The gate** (schema sections 13 and 14, `src/lib/gate.js`,
      `cloud.js`'s `runGate()`): it FAILS CLOSED. It failed open until
      section 13 ran — and section 13 NEVER RAN (probed 5 Oct 2026:
      every function PGRST202), so for its whole life the "gate" let
      every Google account sync. "Function missing" is still told apart
      from "the function said no", but only for the SENTENCE: reason
      `notdeployed` versus `noinvite` / `pending` / `declined` /
      `disabled` / `revoked` / `unreachable`, all of them `state:
      'closed'`. A closed gate or a lost lock pauses sync, and the local
      write clock is still recorded, so paused writes win at the next
      sync. Section 13.6b makes it a boundary with additive triggers;
      its grandfathering insert is COMMENTED OUT now, because "already
      owns a cloud project" stopped meaning "was let in".

      **The flow is sign in → invite.html → through or ask.** The FIRST
      load after a sign-in that ends closed is sent to `invite.html`
      (a sessionStorage marker, `fms_gate_landing`, set when the sign-in
      begins and consumed by the first `runGate()`), and ONLY that load:
      local work was never behind the gate, so a visitor waiting on an
      admin keeps every page. Two routes through: a code, or a REQUEST
      (section 14, `request_invite`) — the row carries the e-mail and
      name Google attested, copied server-side out of `auth.users`, plus
      a note and the browser; the admin console on `settings.html`
      lists the queue and APPROVE writes the `studio_members` row
      directly (no code), DECLINE records a note the requester sees and
      a seven-day cooling-off. Membership arriving by any route closes
      a pending request (14.4 trigger). `studio_status()` was widened
      to carry the request's standing and, for an admin, the pending
      count, so the pill, the account menu and `invite.html` all read
      ONE answer (`getGateState().status`) and `gateDetail(reason)` is
      the one sentence they print.

      BOTH SECTIONS RAN on 5 Oct 2026, plus the 13.2 bootstrap — through
      the dashboard SQL editor, verified afterwards through PostgREST
      (every function 401 to anon, where it was PGRST202 that morning).
      `auth.users` held one account, now the admin; the second
      `VITE_ADMIN_EMAILS` address has never signed in and gets its row
      the first time it does (re-run the 13.2 line, or approve its
      request). The 13.8 and 14.5 LIVE CHECKS are still unrun: deployed
      is not the same claim as behaving. `docs/GATE.md`.
    - **Keys.** `fms_story_v1`, `fms_idea_vault_v1`: per project, in all
      five registries (13.7 adds the scopes). `fms_device_session_v1`:
      the website's lock handle, in `ALL_KEYS` and deliberately NOT in
      `GLOBAL_KEYS`, for the Drive pointer's reason. The pre-auth ticket
      is sessionStorage on the website. In the extension, the ticket,
      the lock handle AND the Supabase session are `chrome.storage.session`
      (supabase-js gets a storage adapter); `fms_clip_queue` is
      `chrome.storage.local`, because a clipping is not a credential.
    - **The extension** (`docs/EXTENSION.md`): needs its
      `chromiumapp.org` redirect URL on the Supabase allow-list before
      Google sign-in works.

    Proved: `test:story` 49, `test:screenplay` 29, `prove:gate` 107
    ((a) asserts CLOSED when undeployed; (i)–(k) the landing,
    request/approve and decline; (l) the site gate; (m) the console;
    (n) code-only entry and the invite link), `prove:billing` 65
    ((i) the Features matrix, the free tier's sample-only hub, a locked
    page), `prove:extension` 28, all against the real GATED build. What is
    NOT proved: the 13.8/14.5/15.1 live checks against the database
    (the sections are DEPLOYED, see above), Google's consent screen for
    the extension, and Chrome Web Store review.

    **Two traps the site gate paid for on its first day.** The veil
    (`data-sitegate="pending"` → `body > * { visibility: hidden }`)
    hid the TAKEOVER PROMPT, because `runGate()` asks that question
    before it settles the state; `base.css` excepts `.gt-overlay`, and
    `sitegate.js`'s give-up timer re-arms while one is open. And on
    the first load after a closed sign-in, `landOnInvite()` and the
    site gate both navigated to `invite.html` in the same tick — a
    harness sees an interrupted navigation, a person a flash — so
    `landOnInvite()` stands down whenever the site gate is installed.
    One owner per redirect.

12. **Billing — Razorpay, three paid tiers, limits by plan.** Schema
    section 16, three edge functions, `src/lib/billing.js`, the cards on
    `settings.html#plan` and `invite.html`, the console on `admin.html`.
    Four decisions asked before the code and recorded in `docs/BILLING.md`:
    ~~PREPAID PERIODS (one Razorpay Order buys 30 or 365 days, nothing
    recurs)~~ — **WITHDRAWN 6 Oct 2026 by the owner: FULL-TIME ACCESS.**
    Section 18: one price per tier (`plans.price_paise`), bought once and
    kept for good; `apply_plan()` and `admin_grant_plan()` keep their
    signatures and write `plan_until` NULL, which `account_plan()` always
    read as "no end"; `create_pending_payment()` refuses 'month'/'year' by
    name. The cards have no period switch and no renew/extend; the
    console has one price field and a grant with no days. **And
    FEATURES BY PLAN**, same section: `plans.features` (key → boolean),
    the console's Features matrix (`src/ui/plan-features.js`), and
    `src/lib/plan-gate.js`, which locks an unticked module's page behind
    an upgrade panel, flags it in every menu, and gives the free tier the
    Dragon sample alone (`sample_only`, `new_projects` off). Missing key
    = allowed; signed-out and code-only visitors are not gated. The
    plan sits on the ORGANISATION (`accounts.plan`, which
    section 6 reserved and `accounts_guard` has defended as "set by
    billing" since); PAYING GRANTS ENTRY (activation inserts the
    `studio_members` row, so a stranger who pays is through the gate with
    no code — a disabled member is refused before an order exists); and
    the caps are on the CLOUD AND THE EXTENSION, never local work.

    **The price is read from the table by the server, never from the
    client**, so a console edit is live on the next order with no
    Razorpay object to update. **The limits are triggers**, each raising
    `P0402` with the plan and the cap in the sentence; the UI explains,
    it does not enforce. `cloud.js` does NOT queue a `P0402` on a project
    insert — retrying every thirty seconds would fail every thirty
    seconds — the sync status says why, a toast offers the plans once a
    minute, and the film stays on the device. A lapse is computed from
    `plan_until`, never scheduled. A refund lapses the plan.

    Three things the first proof run found, each a real bug or a real
    trap: `planRank` was called on the module's default export and
    missing from it, which took the WHOLE plan section off the page
    with one `pageerror` and nothing else visible; the fake Supabase
    answered a project PATCH with `[]`, so every pulled project was
    re-inserted and hit the cap — `_pushProjectMeta` updates first and
    inserts only on an empty answer, and a fake has to honour that or it
    proves the wrong thing; and the console's "Saved." clears itself
    with a re-render 2.5s on, under whatever the next form was being
    filled with.

    **The proof builds its own `dist-billing/`** with a fake public key
    id and the gate ON, because the committed `.env` carries no key id
    until the owner has one, and a build without one disables every BUY.
    That is right for the product and wrong for the fixture. The hex
    fallback for Checkout's theme colour is gone too: the literal is
    READ from `--brand`, and a missing token means Razorpay's own colour,
    not a colour typed here.

    **NOT RUN against the live database or a live Razorpay account.**
    `test:schema` proves §16 loads and behaves on a real PostgreSQL;
    `prove:billing` proves the pages against a fake that signs exactly as
    Razorpay does. The deploy order — run §16, set the secrets, deploy
    the three functions (`rzp-webhook` with `--no-verify-jwt`), register
    the webhook, set `VITE_RAZORPAY_KEY_ID`, set the real prices — is in
    `docs/BILLING.md` §1, and the seeded prices are PLACEHOLDERS.
13. **Post-Production is built: the Edit Log and the Deliverables list.**
    The two modules that had said SOON since the five-stage regroup.
    `edit.html` / `src/lib/editlog.js` and `deliverables.html` /
    `src/lib/deliverables.js`, keys `fms_edit_v1` and
    `fms_deliverables_v1`, in all five registries. `npm run test:post`
    (57 assertions, Node, no browser) covers the derivations.

    **The edit log reads the shoot day's marks and does not write
    them.** `shoot.html` stays the only view that writes to a scene;
    the suite's opinion — in the cut / locked / cut out, a note, the
    pick-ups owed — is its own key, because the 1st AD's "dropped" and
    the editor's "cut out" are two facts with two owners that disagree
    all the time, and the disagreement is the report (a dropped scene
    the cut still claims is a CONFLICT, shown first). Everything else
    is derived in `coverage()`: pages in the can, pages owed, waste.
    **The set's word is final** — a scene marked shot is in the can
    even with shot-list setups unticked; the ticks are reported as a
    note, never as a debt. The first version let a checkbox nobody
    maintains on the floor overrule the mark, and the sample's 36
    scenes all read "owed".

    **The deliverables catalogue is content** (`src/data/deliverables.json`,
    rule 2) and its `id`s are storage keys: the page stores only state
    against them, and the default state is not stored at all. Festival
    FORMATS are not in the catalogue — they are joined at render time
    from the submission tracker and `festivals.json`'s `format`, so a
    festival added on the short film's step 10 appears with what it
    asks for and nothing is kept in step by hand. Only 5 of 18
    catalogue festivals record a format; the rest say so rather than
    guess. The CBFC copy is stated carefully (public exhibition in
    India; festivals abroad do not ask; Indian festivals screen under
    an I&B exemption) and the ratings are the 2024 set — change it in
    the JSON if the rules change. The page also quotes the blueprint's
    step-32 answers (`po_deliver_list`, `po_release_plan`) beside the
    list rather than copying them.

    **Schema section 17 has NOT run.** Until it does, Postgres refuses
    the two new scopes and the pages save locally only; everything
    else keeps syncing. Same shape as 13.7 was.

    **Two gate things learned on the way in.** `verify` and `baseline`
    now honour `VERIFY_DIST`, because a second session rebuilding
    `dist/` with the gate ON in the middle of a baseline capture turned
    nine pages of the capture into copies of `invite.html` — the
    capture never failed, it recorded the wrong site. Build into
    `dist-verify/` (gitignored) when another session may be live. And
    the recapture for these two pages was checked the way section 04
    asks: zero data-key movement on every page, and the only word
    changes outside the two new pages were the nav copy that moved
    from "Coming next / In development / SOON" to the built labels.

14. **The consumer pass (6 Oct 2026): legal pages, the Library's three
    shelves, a clearer band, and a plan gate that actually gates.**
    - **Legal.** `privacy.html`, `terms.html` and a new `refund.html` (the
      same markup-only, `legal.js`-only pattern; in the vite inputs, the
      sitegate `EXEMPT` list and the rewrites in both host configs). The
      refund window, governing law (India, Chennai courts) and the
      contact are a DRAFT for the owner to confirm; there is no business
      name or postal address yet. `src/ui/footer.js` puts Privacy ·
      Terms · Refunds on every page, from `chrome.js`, after `#app` so a
      re-render cannot remove it.
    - **Case Studies, Dissection and the Craft Glossary are Library
      tabs.** navigation.json hangs them off the global `library` entry
      as `modules`; `src/lib/navmodel.js` is the one place stages and
      shelves are joined. Module ids are unchanged, so plan features
      keyed by them still hold. `study.html` / `dissect.html` are stubs
      that load `src/pages/moved.js` (a meta refresh drops the fragment;
      the CSP forbids an inline script). Their renderers moved to
      `src/ui/case-studies.js` and `src/ui/dissection.js` — one copy each.
    - **Tabs.** The strip takes the content column on module pages, sits
      one below the band so phase menus paint over it, and a tab switch
      lands the new panel under the strip. `measureChrome()` leaves
      anything stuck at exactly `--sh-chrome-h` out of that number and
      publishes it as `--sh-cover-h` — the strip used to feed its own
      height back into its `top` and drift down the page. Phase menus are
      capped to the viewport when opened and scroll inside themselves.
    - **The breadcrumb follows the open tab** on pages that host two
      stages (`resolveLocation()` in shell.js): hash, then a fragment
      inside a section, then the first VISIBLE section, then nav order.
      The scroll spy skips hidden sections, which is what made
      contacts.html read "Production › Call Sheets".
    - **THE PLAN GATE NEVER GATED.** `refresh()` in `plan-gate.js`
      cleared its in-flight marker in a `finally` inside the async body;
      signed out that body never awaits, so it finished before the
      promise was assigned and the marker stayed set for ever — every
      later refresh, the gate opening included, got the stale
      signed-out answer. `prove:billing` failed 6 of 59 on it and the
      failures were read as pre-existing. Any lazy guard of the form
      `x = (async () => { … finally { x = null } })()` has this bug.
    - `prove:drive` builds with the site gate off (it drives settings
      signed out) and stubs Google Fonts and `/favicon.ico`; it had been
      broken since the site gate landed.
    - **Work done with no project open is ADOPTED, not lost (audit C1).**
      With no project the proxy writes the HOLDING SLOT — the bare key on
      the device, `key@<uid>` in an account — and creating a project used
      to hide it for good (`migrateLegacy()` only runs on the first load).
      Now the hub's New Project form calls `createProject({ adopt: true })`
      and `adoptUnfiled()` in `store.js` moves the slot into it: raw,
      set-verify-then-remove (big values verified after `flushStorage()`),
      never over a different value already in the target (the slot is kept
      and offered to the next project), and idempotent with no marker — a
      slot whose exact value already sits in a project of this namespace is
      an interrupted adoption and is just removed. **Which project:** the
      next one CREATED EMPTY from the form, in the namespace the work was
      written in. The sample, duplicate, backup import, cloud pull and
      `migrateLegacy()` do NOT adopt — each fills the new project with its
      own content and adoption would mix two films. `buildBackup()` now
      reads every holding slot whatever the project count (`_unfiled`,
      `_unfiled_<n>` for accounts — numbered so no account id is in the
      file); a merge import lands each as a project, a Drive restore puts
      it back into the holding slot without clobbering. The banner
      (`ensureNoProjectBanner()`, wired by `src/ui/no-project.js` from
      `chrome.js` on every page a STAGE module lives on, derived from
      navigation.json) says the work is kept on this device and moves into
      the next project created — the old "your edits won't save" was false.
      It is no longer sticky.
    - **Blueprint reset and import REPLACE (audit H1).** Both `loadData()`s
      set a field the blob does not carry back to its markup default and
      untick absent checklist items (by class — never `li.value`), so
      Reset clears the screen and an import no longer interleaves two
      films. Imports go through `src/lib/blueprint-file.js` first (refuses
      non-JSON, studio backups, the other blueprint's file and anything
      whose fields are mostly not this page's) and then confirm. The short
      film's Erase ALL also removes `fms_festivals_v1` (scoped, so this
      project's tracker only).
    - **Left open, on purpose and on record:** `docs/KNOWN-ISSUES.md` —
      the Library's dark-pref carry-over reads an undefined `PREF_KEY`,
      the extension panel lost the three Library modules, a Case Studies
      empty state names a data file, an unconfirmed band height on the
      Library at 390px, and Case Studies being one long tab. Read it
      before touching any of those files; prune it when you fix one.

15. **The screenplay writer (6 Oct 2026): `docs/archive/SCREENPLAY-WRITER-PLAN.md`,
    all six phases built.** Seven parallel agents, merged in `write.js`.
    - **Format (Phase 1):** a `shot` element type (additive; never a
      scene); dual dialogue as `dual: true` on the SECOND cue, pairs
      derived by `dualPairs()`; (CONT'D) offers; `titlePage` inside the
      script blob (no new key); a page view drawn from the PDF's own
      `paginate()`, so screen and PDF agree by construction.
    - **Keys (Phase 2):** `src/lib/write-keys.js` + `src/data/write-presets.json`
      (Final Draft / Celtx), SmartType autocomplete (`src/ui/smarttype.js`),
      the navigator, shortcut sheets. Measured on Chromium/Linux with real
      X11 events: Ctrl+1..8 IS catchable by a page (it steals tab
      switching), so Alt/Option+digit is the default and Ctrl/Cmd+digit is
      opt-in in a tab, on in the installed app. Dual is Alt+D only —
      Ctrl/Cmd+D cycles the theme on every page.
    - **ONE type-change path:** `setElementType()` in write.js carries the
      dual rules too; the select, every shortcut and Alt+D go through it.
    - **Guide (Phase 3):** `src/lib/format-rules.js` + `src/data/format-rules.json`,
      `src/ui/format-guide.js`; unknown types are neutral by design.
    - **Focus (Phase 4):** `src/ui/focus-mode.js`; goals in a new per-project
      key `fms_write_goals_v1` (SCOPED_KEYS, PROJECT_KEYS, ALL_KEYS; LOCAL
      only — no cloud scope until a schema section widens the CHECK).
    - **Beats (Phase 5):** `beatId` on scene rows (additive, framework-
      qualified), `src/lib/beat-outline.js`, the Outline tab.
    - **Extras (Phase 6):** read-as, dictation, the Breakdown hand-off,
      alternate takes (`alts` on the element, active take is the text),
      a Tanglish preview that is NEVER written into the script.
    - **Prefs:** `fms_write_prefs_v1`, per device, in `ALL_KEYS` and
      `GLOBAL_KEYS`, shared by guide/keys/focus with read-merge-write.
    - **Storage fix found on the way:** a large save made while the page
      was leaving was lost (4/4 on the sample). `store.js` copies in-flight
      overflowed writes to localStorage on pagehide; `prove:storage` 14-15.
    - **Enter paints in ~80-160ms on the 2,361-element sample** in this
      container, the same before these phases; the handler is ~30ms. The
      remaining cost is the browser laying out the inserted row.

16. **Story first, blueprints beside the stages, the script drives the
    scenes (6 Oct 2026): `docs/archive/BLUEPRINT-REALIGN-PLAN.md` revision 3,
    built.** Nothing was removed; module ids and every data-key held
    (verify: 720 keys, 0 moved, re-baselined from `edfb125`).
    - **Nav.** Six modules moved Screenplay → Pre-Production (breakdowns,
      elements, auto-tag, songs, stripboard, cast-matrix), Pitch Deck →
      Story, the two blueprints to a global `blueprints` SHELF (same
      `shelves()` path as the Library). Pre-Production modules carry a
      `group`; each stage carries `guide` links into the blueprints.
      `plan-gate.js` counts whole-page shelf modules, or moving the
      blueprints out of Story would have stopped it locking them.
      Script Breakdowns' target is `breakdown.html#breakdown`, an
      always-rendered div inside `#scenes`.
    - **Blueprints in five Parts, one per stage**, step order and ids
      unchanged; `#part-2` and `#write-the-draft` are new, fieldless.
      `src/data/steps.stages.json` is the sidecar (stage, part, tools,
      readout) — the step JSON is regenerated by extract, so nothing new
      goes in it. Chips, "Do this in…", readouts: `src/ui/step-stages.js`.
    - **The Story page is a path**: Idea → Logline → Structure → Step
      outline → Synopsis → To the Screenplay. `outline` and `idea` live
      INSIDE `fms_story_v1` (no new key). 11 frameworks in
      `frameworks.json`; old ids kept. The synopsis is assembled from
      the outline with `origin:'outline'` marks. Pacing, AI, Pitch and
      Vault are a page-local tab strip — so an extension clipping's
      toast now carries "Open the Idea Vault", or it lands hidden.
    - **The script drives the scenes** (`src/lib/scene-sync.js`): scene
      rows carry `scriptElId`; a new heading adds its row, an edited one
      updates heading-derived fields only, a deleted one sends the row
      AND its shots, frames, call-sheet rows and edit-log state to
      `fms_scene_bin_v1` (`src/lib/scene-bin.js`; scoped, project, reset
      lists, local only). Zero headings bins nothing. `removeScene()`
      and Write's replace-scenes import go through the bin too.
    - **Script → shot list**: AI with a key, `src/lib/shot-rules.js`
      without; same draft shape, append-only, `rules: true`.
    - **store.js: a read in the same task as an overflowed write served
      the OLD value**, so a loop of `addShot()` lost 42 of 254 shots.
      `_readTiered()` now reads `_inflight` first.
    - Also: journey strip (`src/lib/journey.js`, derived), beat guide in
      Write (`src/ui/beat-guide.js`; Panel mode left-aligns the whole
      column to make room for its card), story kit in the blueprints,
      the guide drawer on module pages (`src/ui/blueprint-drawer.js`,
      writes the blueprint's own key read-merge-write), hand-offs and
      wrap cards. Open ends are in `docs/KNOWN-ISSUES.md` §7.
    - Browser runs in this container need
      `PW_CHROMIUM=/opt/pw-browsers/chromium`.

17. **The Medium/Low pass over the UX audit (7 Oct 2026).** All 27 Medium
    and 30 of 31 Low items in `docs/archive/UX-AUDIT-2026-10-06.md`, struck
    through there item by item; five parallel agents, each on its own
    file set, merged and gated once. Re-baselined from `94e062d` with
    zero data-key movement on all 21 pages — the words that left are
    named against the items (`replaces`, `above`/`below`, `bottom`/
    `calculator`, the Feature keyboard line, the admin's signed-out copy).
    Four things changed shared machinery and are worth knowing:
    - **`src/ui/modal-focus.js`** — `holdFocus` / `releaseFocus`, the one
      focus trap; the hub's project modal and the sign-in modal use it.
      A new dialog takes it rather than a third keydown handler.
    - **`applyBackup()` validates before it writes.** A v2 file needs a
      `projects` array of objects with ids and a `data` object; a v1
      file needs a known field. `{"hello":1}` used to import "1 project".
    - **The tab strip observer filters.** `apply()` re-runs only when a
      mutation adds or removes a `section[id]`, `main` or the strip —
      settings and admin still re-tab; typing in write.html no longer
      costs 11ms a frame. And the strip is one row that scrolls sideways.
    - **The closed rails are `visibility: hidden`**, not just translated
      off-screen, so they leave the Tab order; the change waits for the
      slide so focus-on-open still lands on a visible link.
    **And the open-issues pass, the same day,** closed everything that
    one left in `docs/KNOWN-ISSUES.md`: the band carries a sign-in pill
    and the Appearance menu on every shell page (`buildStudioTools()` in
    shell.js, when `adoptPageTools()` finds no `.toolbar`; the four
    toolbar pages keep theirs, so exactly one of each everywhere); the
    palette handle is a direct child of `.sh-bar` and stays at the first
    row's right end at every width; Case Studies has a second-level
    strip over a study's PARTS (`#cs-<part>` picks a part, `#study-<slug>`
    the film — the 21,000px was one film, not the list); `sliceScenes`
    IS `sliceScript` now, pinned first by `npm run test:import`; the
    Story guide pill reads the open path step through an additive
    `paths` block in `steps.stages.json`; the AA walk measures Story at
    path steps 3/4/6 and Write in Panel mode (3,124 and 1,800 nodes,
    zero findings); module pages hide their controls in print; and
    `prove:gate` (h) no longer races supabase-js's `lswt-*` storage
    probe (108 assertions). Re-baselined again from the merged tree,
    zero data-key movement; the words that left were `alone` (the call
    sheet no longer promises one page) and the pill's old step list.
    `docs/KNOWN-ISSUES.md` now holds two recorded decisions and one
    thing seen once.

18. **Launch readiness (7 Oct 2026).** Branch `claude/launch-readiness`;
    the owner's side is `docs/LAUNCH.md`.

    **What.** (a) A public landing page, `start.html`, outside the site
    gate (`sitegate` EXEMPT, rewrites in `vercel.json` and `netlify.toml`,
    `invite.html` links to it, `index.html?sample=1` opens the Dragon
    sample), with Open Graph / Twitter cards on the public pages,
    `public/og.png` from `npm run og` (`scripts/make-og.mjs`), `robots.txt`,
    `sitemap.xml` and a meta description on every html entry. (b) The
    first-paint JS cut: `manualChunks` (core by name, data by file, rest by
    page), `virtual:fms-step-index`, the blueprint drawer split into
    -mount/-body, the glossary lazy, `extension-bridge` loading `story.js`
    lazily. (c) Navigation in plain English: 37 `purpose` lines, a
    Pre-Production group in the launcher, `jobs` in `navigation.json` and
    three job cards on the hub, the sample button first in first-run, a
    lock panel naming the lowest plan that includes the module; `hub.js`
    split into `src/pages/hub/`. (d) Billing: schema §19 closes the
    `accounts` INSERT hole (the guard fires BEFORE INSERT OR UPDATE) and
    §20 adds promo codes; the invite-code caveat is documented.
    (e) Stripboard drag-and-drop with a per-day order, Alt+Up/Down from the
    keyboard; the Story page's "ways in" empty state; the Drive panel says
    the one-hour window (`HOUR_NOTE`, `drive-sync.js`).

    **Why.** The site is invite-only and a stranger from an ad hit a locked
    door with no explanation; the module pages shipped the whole app's JS
    on every load; the hub told people what modules were called, not what
    they were for; and a hole in `accounts` let a signed-in user insert a
    row naming themselves a tier.

    **Measured (first-paint JS, raw KB, before to after).** index 1238 to
    716; breakdown 1198 to 373; shoot 1183 to 342; write 1243 to 586;
    story 1215 to 554; settings 1195 to 414. Gzipped, shoot 394 to 111.
    Module pages fetch 29-47% of what they did; the hub 58%. Enter-key
    paint on write unchanged at about 30ms.

    **Decisions.**
    - *Promo codes.* `promo_codes` has RLS on and no client policy, so no
      client can list or read a code. The client only calls `quote_order`
      (an RPC that returns the discounted price) and the 5-arg
      `create_pending_payment`; `rzp-order` passes the code through and
      the price is still read server-side. The UI is "Have a code?" on the
      plan cards and a Promo codes block in the admin console.
    - *Order inside the locations blob.* The stripboard's per-day order is
      an `order` field on the entries already in `fms_locations_v1`
      (`placeScene`, `undoPlace`, `nudgeScene` in `locations.js`), not a new
      key: the storage contract is untouched and a stored day without
      `order` reads in its old sequence.
    - *Landing page, markup first.* Like the legal pages, its words are in
      the HTML so a crawler and a link preview read them. The one exception
      is `navigation.json`, fetched there as a URL asset so the page stays
      out of the bundle on purpose.
    - *The gate stays the door.* Nothing here opens the site; `start.html`
      sells and links in. Opening it is the owner's choice (LAUNCH §1).
    - *The canonical host is a placeholder*, the vercel.app address, until a
      domain is settled.

    **The owner must** work `docs/LAUNCH.md` top to bottom: decide the door,
    publish the Google consent screen, finish the legal drafts, run schema
    §16-§20 and the live RLS checks, set up Razorpay (redeploy `rzp-order`),
    replace the placeholder host, then think about ads. Suites at this
    point: `test:schema` 133, `test:billing` 50, `prove:billing` 93,
    `test:stripboard` 66.

    **After the merge (integration pass, 7 Oct 2026).** The six branches
    were verified TOGETHER for the first time: every `test:*`, `prove:storage`,
    `prove:drive` green on the combined tree, then the gated proofs
    (`prove:gate` 108, `prove:billing` 93, `prove:extension` 30,
    `prove:sw` 24). What the combination turned up:
    - *Supabase was in first paint after all.* The new byte budget found
      that `boot()` called `ensureClient()` unconditionally, so the ~98KB
      SDK was fetched on 19 of 21 pages for every signed-out visitor.
      `boot()` now loads it only for a stored `sb-*-auth-token`, an OAuth
      redirect or the extension; the `knownLazyFetches` row is deleted. A
      Playwright response recorder shows no `supabase-*` chunk on a
      signed-out index, shoot or breakdown, and the chunk still fetched
      with a stored session present. The stale-account clear (`setAccount(null)`
      for an account id with no session) still runs when a config exists.
    - *The budget was recaptured.* It had been set at 110% of the
      PRE-split sizes, which would not have caught a regression; it is now
      110% of the split build and records its date and commit.
    - *The fragment sweep earned its keep*: it found `dashboard#readiness`
      (the id existed only on a populated branch) and `feature#phase-4`
      (the band grew after the jump and left the heading behind the chrome;
      `relandFragment()` in `shell.js` re-scrolls once, instantly, so
      reduced motion is respected; reviewed here, and a malformed `%`
      escape in the hash can no longer throw out of `measureChrome()`).
    - *`prove:sw` was proven to bite* by disabling `clean()` in `sw.js`:
      the proof failed on the redirected precache entries, and passes with
      it restored.
    - *Re-baselined.* Only the navigation pass's purpose-line words and
      settings' `closing`/`may` moved; zero `data-key` movement on all 21
      pages (720 keys).

19. **The handoff and the stopped work (7–8 Oct 2026).** Ten feature
    agents were stopped mid-work by the owner; their snapshots are
    `archive/*`, merged into `wip-all`, and `develop` was cut from it.
    `docs/HANDOFF.md`, `docs/archive/WIP.md` and `docs/BRANCHING.md` record it.

20. **Release: the ten workstreams reach `main` (8 Oct 2026).** Branch
    `feature/integration` off `develop`, merged back into `develop` and
    released to `main` through the gate in `docs/BRANCHING.md`. What it
    took, because the merged tree had never been run whole:
    - *Every suite on the merged tree.* 23 `test:*` suites (three new npm
      scripts: `test:revisions`, `test:ai-coverage`, `prove:ai-coverage`);
      one stale assertion (`write.js` calls `paginateDoc(doc)`, which wraps
      `paginate()`).
    - *Schema §24* adds the `characters` and `costs` sync scopes;
      `fms_characters_v1` and `fms_costs_v1` left `LOCAL_ONLY` for
      `SCOPE_BY_KEY` in the same commit. `scripts/schema-tests/scopes.sql`;
      `test:schema` 225. NOT run live; `docs/LAUNCH.md` §4 orders it.
    - *Four proofs were wrong, not the app.* `prove:ai-coverage` counted
      the requests it aborts itself and the fake's intended 529;
      `prove:sw` failed one run in two on Chromium's browser-process
      fetch of the manifest install icon racing the switch to offline (the
      icon is now asserted directly); `prove:billing` typed the feature
      total (40 since `remove_branding`) and now reads `CAPABILITIES`;
      `prove:gate` expected six console tabs (Growth is the seventh).
    - *Compliance facts re-checked* against search summaries (the cited
      hosts are unreachable from the container): the COTPA film rules are
      rule 4(6) and 7–8 (rule 11 is the 2023 online-content rule); Prime
      Video does list SRT; streamers rate under the IT Rules 2021, not
      CBFC; AWBI's applicant is the producer.
    - *Browser walk on the Dragon sample*: revisions (snapshot, compare,
      lock numbers — no literal "null", 0 overflow at 390), all six cost
      tabs, an expense through the form surviving into the studio backup,
      the DPR leaving `fms_scenes_v1` untouched, the legal pages at 390 and
      1280 in both themes, `start.html` with scripts off. Enter on
      write.html: median 79 ms to the next frame, as before.
    - *First paint grew* on reports, deliverables, budget and write; the
      budget was recaptured with the reason (`docs/KNOWN-ISSUES.md`).

21. **The cinematic UI revamp (8 Oct 2026).** Branch `Uirevamp`. The
    owner's design spec — obsidian `--bg-*`, slate `--text-*`, gold
    `--accent-gold*`, teal `--accent-teal*`, `--status-*` — is the bare
    `:root`, and every legacy token aliases it; the light theme and the
    theme switch are gone (owner: dark only). Two spec values failed AA and
    were corrected in place (`--text-muted` → `--text-muted-aa` for text;
    danger text #F87171). Phase hues retuned and moved off the gold and
    teal (Screenplay coral, Pre-Production blue). Gold primary buttons with
    a glow, ghost secondary buttons that turn teal, a 12px-blur glass band,
    cards on `--bg-secondary` with gold hover, hero glow, teal chips, the
    script page on a dark writing surface (print stays white). The icon and
    OG generators now follow `var()` aliases. The gate found one real
    regression — the card border override repainted the hue rule on the
    hub's doors and start cards and the worked examples — fixed by giving
    those a gold glow on hover instead. AA walk: 0 findings on all 21 pages.

22. **feature.html back under its first-paint budget (9 Oct 2026).** The
    overrun was never growth: on a first load the page fetched the whole
    104 KB `data-studies` chunk (all of `studies.json`) to show step 08's
    worked-example card and fix fifteen beat labels, and whether that
    request landed before verify's network-idle point decided whether it
    was counted — the 8 Oct budget was captured on a run where it did not
    (957,897 bytes, 39 files), later runs counted it (1,077,586, 48).
    `studySlicePlugin` in `vite.config.js` now cuts `virtual:beat-example-data`
    (the one film, its beat sheets, the methods: 17 KB) out of the same
    JSON at build time, and both callers read that. Measured: 975,174 bytes,
    44 files, 78 KB under the unchanged budget; the card and labels render
    as before. `scripts/budget.json` was not touched.

23. **The revamp's colours reverted, its components kept (9 Oct 2026).**
    Owner's call: the obsidian/gold/teal palette and dark-only theme go,
    the component styling stays. `tokens.css` is the pre-revamp file
    again (violet, ink default, light theme restored) plus a role-name
    alias block; `chrome.js`, `palette.js`, the legal pages, the theme
    probe in verify and the proofs that walked one theme are back to two
    themes; `write.css`/`write-revisions.css` (script page) and
    `skins/studio.css` (the slab) are their pre-revamp selves; icons and
    the OG image regenerated in violet. Three rules that put text in
    `--bg-primary` on the brand fill now read `--brand-on`, which is the
    right on-colour in both themes.

24. **The pre-ship UI/UX pass (9 Oct 2026).** A browser sweep of every
    page (1280 and 390, ink and paper, the Dragon sample seeded through
    the hub's own button) for console errors, overflow, stray
    "null"/"undefined", off-screen and unnamed controls — then four
    parallel reviews, one per page group, that opened every tab, menu,
    modal and empty state and judged the screenshots. About fifty fixes;
    the full list is in the three commits ending `b2b6d34`. The ones
    worth knowing before touching the same code:

    - **`replaceChildren()` / `append()` print `null`** — found live
      three more times (step 15's Lookbook hand-off, the steps path,
      the call sheet's route block). The old baseline had RECORDED the
      word "null" on feature, so the gate was guarding the bug.
    - **`outline: 2px solid var(--focus)` is invalid** — `--focus` is a
      whole outline shorthand, so the declaration drops and there is no
      ring at all. The Story page, format guide and panel had it.
    - **`h('h3.x#id')` gives no id** — `h()` reads an id only before the
      classes. Reports' Equipment counts never updated because of it.
    - **"&amp;" as text** — data descriptions are HTML; three places set
      them as text. The hub search's `plain()` now decodes entities.
    - **A blocked icon font printed the ligature names** ("auto_stories")
      over labels after `display=block`'s three seconds. `chrome.js`
      marks `html.sym-ready` once a Material Symbols face has LOADED and
      `base.css` keeps each `.sym` an invisible 1em box until then.
      Verify reads innerHTML, so its word check is unaffected.
    - **The breadcrumb names a non-module tab** (Reports' DPR, Write's
      Characters) with no stage, instead of keeping the last module.
    - **Developer notes were rendered**: `cbfc-rules.json`'s
      `ratingsSource.source` carried "TWO TRAPS for whoever re-checks
      this", printed under "Likely rating". Moved to `_note`.
    - `test:schema` was red on main: §30's seeded price rises made
      `upgrade.sql`'s higher test prices violate `plans_next_price_check`.

    **Re-baselined**, deliberately: three allowances would have been
    needed (`null` on feature, `amp` on short and library — each a
    removed bug), which is past the line `EXPECTED`'s note draws. The
    per-page diff was read first: 0 data-keys moved on all 21 pages;
    words lost were those three plus clock words (the hub greeting, the
    festival countdowns); words gained were already-shipped copy the
    old capture predated (the theme toggle's label, settings' region
    choice).

    **The follow-up the same day closed what this left open:**

    - The hub's resume card and the dashboard's Continue now name ONE
      step, `nextGuideStep()` in `journey.js` (the first step whose fields
      are not all in). The hub's used to be the highest-numbered step
      with any data, labelled "last touched" — step 24 on the sample
      where the dashboard said 08. The card says "next up" now.
    - Write's two page counts are labelled as the two measures they are:
      the stats are the schedule's 55-lines-a-page count; the page view
      says "printed pages" (the PDF's sheets, which run longer).
    - `billing_status()` no longer gives a buyer who paid mid-trial the
      trial plan's features (`and pl = 'free'`), with a schema check
      seen red without the fix; LAUNCH §4 lists the re-run.
    - `:root .btn` was measured on every page, both themes, for selected
      states drawn like unselected ones. None lost; three (Deliverables
      and Edit Log filters, Shoot's day picker) marked the selection with
      the focus ring's exact outline, so a focused and a selected button
      looked the same. They are filled now, as settings' choices are.
    - The `display:block` data tables go back to `display: table` from
      1100px, where every one fits its column (measured) except the
      Reports cast matrix, which keeps scrolling. The Library's rate
      card rows stopped ~500px short of their own border before.
    - **The refund-request form lost what you typed.** settings.js calls
      `refreshRefundRequest()` after every billing refresh, and one can
      land at any moment (an auth event, the gate answering); it cleared
      the panel's error and data, and the re-render rebuilt the form
      empty. `prove:billing` caught it intermittently — 3 checks red on
      two of three runs — and it read as a flake. The draft and the
      error now survive a refresh, the last answer stays drawn while
      the new one loads, and a sent request hides the form until the
      server's answer arrives. Four consecutive runs: 186/0.
    - `public/shots/*.webp` recaptured. `make-shots.mjs` now fetches the
      Google fonts through Node, so a container whose proxy Chromium
      does not trust still shoots real faces — no TLS check relaxed.

25. **Motion and video review fixes (10 Oct 2026).** A review of the
    motion layer and the explainer videos, run with `navigator.webdriver`
    hidden — `motion-app.js` switches itself off under webdriver, so
    `verify` sees none of it. Each fix was re-checked in Chromium the
    same way.

    - **Printing came out blank.** Cards, rows, bars and split headings
      not yet scrolled to kept their veil under print media (all 82
      Library cards; 59 elements on start.html). `@media print` in
      `motion.css`, `motion-app.css` and `motion-landing.css` shows them,
      and both `reveal()` and `motion-app.js` reveal everything on
      `beforeprint`.
    - **Fragment links landed up to 16px high** (library.html#rules:
      -1, -11, -16 px). The page enter translated `<main>` while
      `fragments.js` settled it; it is opacity and blur only now (0, 0, 0).
    - **The count-up wrote "0" at registration**, so the landing page's
      facts read 0 to screen readers, copy and crawlers until scrolled.
      0 is written when the count starts; PRICES are never counted.
    - **A split heading kept a stale `aria-label`** (the hub's resume
      title announced the previous film). The words stay readable; no
      label, no `aria-hidden` spans.
    - **`glow()` added a class and nothing else** — `.mo-glow-fx` was
      styled and never created. It is created now.
    - **The module strip could not be stopped** on touch or keyboard
      (WCAG 2.2.2): a Pause/Play button under it. Looping effects pause
      off screen (`pauseOffscreen()`, `.mo-idle`).
    - **The motion observer rescanned the whole page on every change**
      for the life of the page. After its 4s window it scans only the
      added nodes.
    - **Video focus** moves into the player on play (it fell to
      `<body>`); the facade says "Plays from YouTube"; the help button's
      ▶ is out of its accessible name.
    - **No modal ever animated in**: overlays go `display:none → flex`
      in one frame. `@starting-style` gives the fade and the spring a
      "from"; this fixed every modal, not only the video one.
    - **Closed rails rested at `-100% × --motion`**, so under reduced
      motion they sat on screen hidden only by `visibility`. -100% is a
      resting position, not a distance.
    - Smaller: zoom scale and blur multiplied by `--motion`; the tilt's
      permanent `will-change` removed; `reveal()` no longer leaks a
      `hashchange` listener per call; the 3.5 MB `demo.webm` removed
      (a browser takes the first playable `<source>`, so nobody ever
      downloaded it) and `make-demo.mjs` encodes the mp4 alone.
    - **privacy.html** names YouTube (played only on a click, from
      `youtube-nocookie.com`, which receives the IP address).
    - **`npm run test:videos:online`** (`scripts/check-videos-online.mjs`)
      asks YouTube's oEmbed for every approved id; none of the 65 is
      `verified`. The container cannot reach YouTube, so it runs on the
      owner's machine (`docs/BROWSER-HANDOFF.md` §0.4).
    - Checked and NOT a bug: under reduced motion the Library shows ~350
      "running" 0.01ms `scrollbar-color` transitions for the first ~2s
      (the theme applying at load); 0 thereafter; identical before
      these changes.

26. **Phone navigation rebuilt (10 Oct 2026; owner: "mobile navigation
    is very bad").** Measured first, at 390x844 with touch, loaded at
    that width:

    - **The stage menus never appeared on a phone.** The five stage
      pills became a sideways strip below 720px, and each menu opened
      inside that strip's own scroll box — present in the DOM with 19
      links, clipped to nothing on screen. So there was no route from
      Breakdown to Stripboard except search.
    - The burger's rail was a 75px icon column whose stage items jumped
      straight to the stage's first page, with no module list.
    - The chrome above the first word was 250px on module pages and
      ~600px on the blueprints (plate, burger + crumb, stage strip, and
      the page toolbar's Dragon / progress / Jump / search / Export /
      More / theme / Sign in).
    - The bottom bar was Search · Studio · Top · End: half of it scroll.

    The owner chose, from two options, bottom tabs and a Go-to sheet.
    `src/ui/mobile-nav.js` (CORE) + `src/styles/mobile-nav.css`:

    - Below 720px the band is ONE row, the breadcrumb (content starts at
      ~170px instead of 260–400). Its stage segment opens Go to at that
      stage (a capture-phase listener, so shell.js's desktop menu does
      not also open).
    - The bottom bar is **Home · Go to · Search · Tools** (a `<nav>`,
      not `role=toolbar`). Go to / Tools carry `aria-haspopup` and
      `aria-expanded`.
    - **Go to** lists the app-scope destinations, each stage with its
      modules and sub-groups, then the shelves — from `navmodel.js`, so
      a module added to `navigation.json` appears with no edit. The
      current module is marked (read from the shell's own `.is-here`,
      not decided twice) and scrolled into view with its stage heading.
      Admin-only entries are hidden as the rail hides them.
    - **Tools** BORROWS the real `.sh-bar > .toolbar` and `.sh-tools`
      and puts them back on close (and on rotation), so every id,
      listener and `.toolbar`-keyed rule survives — the reasoning of
      `adoptPageTools()`.
    - Everything keys off `html.mn-on`, set only while the bar is
      attached, so a page that opts out (`data-no-actionbar`: the
      extension panel, the screening room) keeps its band. Desktop is
      untouched. Sheets: focus held (`modal-focus.js`), Escape and the
      scrim close, focus returns to the opener, body scroll locked,
      `@starting-style` rise × `--motion`, hidden in print.

    Checked in Chromium with phone emulation, both themes: no overflow,
    no page errors, Tab held inside, rotation to 844x390 closes the sheet
    and returns the toolbar, a same-page `#hash` link closes the sheet.

27. **One typeface, a full-width landing page, and the consent screen's
    new home (10 Oct 2026, owner).**

    - **Catamaran everywhere.** The owner asked for Puvi; Puvi is Zoho's
      own typeface (a Zoho trademark) with no open licence and no public
      files, so the owner chose an open font instead. Catamaran is SIL
      OFL, served by Google Fonts (already in the CSP), and covers Tamil
      and Latin in one family, 100–900 — the closest open match. It
      replaces Plus Jakarta Sans in `--face-serif`, `--face-display` and
      `--f-mono` and in every page's Google Fonts link. **Two faces stay
      on purpose:** Courier Prime for the screenplay (`--f-script`: page
      counts are arithmetic on a fixed-width grid) and JetBrains Mono for
      code. Checked in Chromium with the real font loaded: every page
      renders in Catamaran, the script in Courier Prime, no overflow at
      1280 or 390.
    - **start.html is full width.** `.st`, `.st-top-in` and `.st-foot`
      lost their 92ch cap; running text keeps its own measure.
    - **The consent screen moves to the preview host**
      (`thefilmakerlocal.vercel.app`). Google Cloud configuration, not
      code: `docs/BROWSER-HANDOFF.md` §0.5 has the steps, and the two
      blockers that must be cleared first — the preview's Vercel
      Deployment Protection (Google cannot sign in to Vercel) and a
      Search Console verification of the preview domain.

28. **Beginner pass: Story and Screenplay (10 Oct 2026).** Written for a
    first-time filmmaker: the studio says what each stage is for, gives the
    reason behind each step, and lets a beginner ask for help on the page
    where they are stuck.

    - **A favourite film per project.** A `fav` slug on the project entry
      in `fms_studio_projects_v1` (`projectFav` / `setProjectFav` in
      `store.js`). `studies.js` `favouriteSlug` falls back to the device
      demo choice in `fms_studio_demo_v1`. The backup carries `fav`.
      Settings has a Favourite film section; the Story empty state asks.
    - **`learn()`.** `src/ui/learn.js` and `src/data/learn.json`: 34
      topics, each pointing at glossary terms, step ids and `videos.json`
      targets. The glossary grew from 21 to 45 terms, each with an example
      from four films (dragon, 96, porthozhil, vikramvedha). The panel is a
      closed `<details>`; its body is built on first open. Videos are
      click-to-load `youtube-nocookie` facades. `test:learn`.
    - **The Story path** is Idea › Logline › Story Bible › Scene order ›
      Step outline › Synopsis › To the Screenplay. New id `bible`;
      `structure` is relabelled Scene order; the old `#path-N` numbers map
      to the same steps, and `#path-<id>` is supported. No step is
      mandatory.
    - **Story Bible** (`src/ui/story-bible.js`, `src/data/story-bible.json`):
      Characters; Conflict, with a new `conflicts` array and `conflictLine`
      in `fms_story_v1`; Stakes (`s3_ext` / `s3_int`); Theme (`s3_theme` /
      `s3_phil`); World (`s7_*` on feature, `s5_*` on short).
    - **The Character Bible** on `fms_characters_v1` gains role, look,
      stakes, fear, lie, flaw, strength, wound, secret, arcStart, arcEnd and
      relationships. The defaults live in `blankCharacter`, so there is no
      migration. A protagonist's, antagonist's or ally's field that has a
      blueprint key (`s4_*`, `s5_*`, `s6_*`; `s3_*` on short) is read and
      written in the blueprint blob, never on the record: one representation
      per field. One protagonist and one antagonist per project.
    - **`blueprint-store.js` `readFields` / `writeFields`** merge-write into
      the blueprint blobs. `feature.js` and `short.js` rebuild the whole blob
      from their own page, so any other writer must merge.
    - **Script parser: 15 fixes** (`script-import.js`, `pdf-text.js`, the
      Fountain export in `script.js`). PDF page 1 is no longer always
      dropped; transitions need caps; a Tamil short-line cue rule; a Fountain
      title page needs a known key; `#`, `@` and `===` are syntax and are
      escaped on export; `!` is stripped per line; `#12#` scene numbers;
      trailing numbers stay in the location ("HIGHWAY 66"); EST. is exterior;
      PDF vertical gaps become blank lines; dual dialogue in text and PDF;
      revision headers and `CONTINUED: (2)` are dropped; `CONT'D` speeches
      are rejoined; pastes with no blank lines are split; lowercase cue
      extensions, Tamil headings, and LATER / SAME and the like read as times
      of day. `test:import` 66, `test:pdf` 50.
    - **One-click breakdown.** `src/lib/breakdown-run.js` (`runBreakdown`,
      `summarize`); `script-commit.js` `commitImportedScript` is shared by
      Write and Breakdown; `byLocation` moved to `locations.js`.
      breakdown.html opens on Whole script (`#overview`): upload a script, or
      break down the current one. Tabs are Scenes · Characters · Locations ·
      Totals. Cast is tagged only from cues, with an undo toast; other
      elements stay suggestions. `test:breakdown`.
    - **Writer guide.** `beat-guide.js` lists the step outline grouped by
      beat, highlights the current scene's step, and jumps to or starts the
      scene. It is the default panel when an outline exists and no explicit
      preference has been set.
    - **Chrome and money surfaces.** The start page footer is a full-width
      band without the e-mail address; the app footer is a hairline band.
      Dark-theme buy surfaces use `--cta-fill`, `--cta-fill-hover`,
      `--cta-glow` and `--glow-soft` (CTA text 4.58:1). Cloud sync can be
      turned off: `cloudSync: 'off'` inside `fms_studio_prefs_v1`, behind a
      confirm dialog; `setSyncEnabled` catches up both ways; backup strips
      `cloudSync` on export and import. AI tools are gated by
      `PlanGate.allowed('ai_tools')` with a calm Pro card, and fail open when
      the plan is unknown.

29. **Project-first studio (10 Oct 2026).** The hub stops being a menu of
    blueprints and becomes the start of a project.

    - **Three doors:** Feature film · Short film · Learning (library.html).
      Feature and Short open `src/ui/project-setup.js` (name, favourite film,
      "More formats"), which calls `createProject({title, format, fav,
      adopt: true})` and then goes to the dashboard. The blueprint doors are
      removed from the hub.
    - **The dashboard** has five stage cards (`#stage-<id>`). Each is derived
      and independent: a script with no story reads Pre-production in
      progress and Story not started. A "Suggested next" is shown and is
      never forced. A resume line comes from `story.updatedAt` and `shotAt`.
      `journey.js` gains `stageStates`, `suggestNext`, `lastWorked` and
      `stageHref`. `test:journey`.
    - **Project switcher** in the band on every shell page
      (`src/ui/project-switcher.js`, CORE), and the first group in the phone
      Go-to sheet. Choosing a project goes to its dashboard.

30. **Blueprints folded into the stages (10 Oct 2026).** The step-by-step
    blueprints stop being pages of their own and become a guide inside each
    stage.

    - **`src/ui/stage-guide.js`**: `mountStageGuide(host, {stage})` appends
      `section#guide` to story, write, breakdown, shoot and edit. It renders
      that stage's blueprint steps for the project's format, derived from
      `steps.stages.json`: feature 01–10 story, 11–13 screenplay, 14–24
      pre-production, 25–28 production, 29–32 post; short 01–05, 06–08 and 11,
      09 (pre-production and production), 10. Writes go only through
      blueprint-store merge-write, on input, debounced. Widgets are ported in
      `stage-guide-widgets.js`. Short step 08's tools and the festival tracker
      link to the old page with `?stay=1`. `test:stage-guide` 111.
    - **`src/lib/blueprint-route.js`** maps old blueprint anchors to stage
      guides. `src/pages/blueprint-redirect.js` forwards feature.html and
      short.html; `?stay=1` is exempt. `navigation.json` lost the Blueprints
      shelf; each stage's guide entry points at `<page>#guide`. The blueprint
      drawer is suppressed on the five guide pages.
    - **verify**: a key-union check proves that the union of `[data-key]`s
      across the five stage pages (a feature project and a short project)
      covers every baselined feature and short key. `BLUEPRINT_PAGES_ARE_REDIRECTS`
      drops the old per-page rows. Storage keys and data-keys are
      byte-identical; there is no migration.

31. **The screenplay space, conventional (11 Oct 2026).** The owner found the
    Write page hard to understand and set the direction: the Script page is
    for writing only, analysis belongs to Pre-Production, drafts are numbered.

    - **`script.html`** (`src/pages/script.js`, `script.css`): a US-Letter page
      in Courier 12pt; one top bar (title · draft · saved, the current line
      type, Beats, Focus, ⋯). No per-row controls (`mountEditor(…,
      {rowChrome:false})`), no stats. The line ⋯ / right-click menu appears on
      the focused line only. Phone: one column and a sticky chip bar. The
      stage guide is mounted but `hidden` unless `#guide` (verify's key-union
      loads `script.html#guide`). `#import` opens the importer INLINE above the
      page — a fixed modal there counts as chrome to the fragment sweep and
      lands the target "behind" it; the ⋯ menu still opens the modal.
    - **The editor core** moved out of `write.js` into
      `src/ui/script-editor/` (`rows.js`, `keys.js`, `editor.js`,
      `inference.js`). Inference: INT./EXT./I/E. and Fountain `.`/`@` on input,
      `>`, ALL CAPS and `TO:` on Return — all through `setElementType`, and a
      line the user typed explicitly is never re-inferred (in memory only).
    - **Beats** (`src/ui/beats-panel.js`): the Story framework's beats with
      ~page targets (110 for a feature, 15 for a short), the beat being
      written marked (the first beat until a later one begins), click to
      jump. Writes nothing.
    - **Drafts** (`drafts.html`, `src/lib/drafts.js`): drafts are
      `doc.revisions` entries with optional `number`/`note`/`titlePage` — NO
      new key; `normaliseRevision` keeps them. "Changed since the last draft"
      is a hash, derived. PDF goes through the one print path from the
      draft's snapshot (no numbering: snapshot ids are not live ids).
      **`src/ui/leave-prompt.js`**: a same-origin link or project switch
      with changes since the last draft asks Save as Draft N+1 / Update
      Draft N / Not now; Ctrl/⌘+S asks the same; `beforeunload` only gets
      the browser's own warning. It never blocks typing.
    - **Script Breakdown** (`breakdown.html#script`, `src/ui/script-overview.js`)
      is Pre-Production's first module: overview, screen time, cast matrix,
      outline + beat board, characters. The beat board and characters panel
      are LAZY and only rendered when there is a script — statically they
      put breakdown 95 KB over budget on an empty first paint.
    - **write.html is retired** (`src/lib/write-route.js`, `?stay=1` exempt).
      The AI coverage report and synopsis→script still live in `write.js`
      and are reached through the escape, linked from Script Breakdown and
      the Script ⋯ menu.
    - `prove:script` (in CI after `prove:adoption`), `test:inference`,
      `test:drafts`, `test:write-route`. Deliberate re-baseline: two new
      pages, zero data-key movement.

32. **Project-first navigation and the Story path, end to end (11 Oct 2026).**
    The studio stops presenting every page as the same kind of page: global
    pages and project pages are now different shells, and Story becomes an
    ordered path rather than a guide beside the work.

    - **Two shell modes** (`src/ui/shell.js`). Global pages — home
      (`index.html`), library, settings, admin, purchase, purchases and
      invite — are `EXTRA_GLOBAL_PAGES` plus `navigation.json` `global[]`
      minus the dashboard. They show no stage strip, no search handle and no
      project switcher. Project pages keep the band; stage tabs animate in
      when arriving from the dashboard. `<html data-shell-mode>` carries the
      mode. The announcement plate is removed; the trial band has its own
      `.sh-trial` host. There is no stage dropdown: a stage tab links to that
      stage's first module. The account pill goes to `settings.html#account`
      (`auth.js` `renderAccountBlock()`). Sign out flushes the sync queue and
      Drive first, capped at 10s, and asks before signing out with unsynced
      work. The phone bar on global pages is Home · Go to · Settings · Tools.
    - **`src/ui/dialog.js`** (`ask` / `tell` / `askText`) replaces every
      browser `confirm`, `alert` and `prompt`. `test:dialogs` fails on any
      native call; `prove:dialogs` drives the dialogs in a browser.
    - **Home** is the project list. With no project it shows three doors
      (Feature · Short · Learning) and the Dragon sample. A skippable tour
      card (`src/ui/tour.js`, `dismissTour`) sits beside them. Journey,
      launcher, index, activity and tools are removed from home.
      **Dashboard** shows this project only, with "Where this film is" and
      the launcher. **Settings** has Account, Activity
      (`src/ui/activity-log.js`), Tour and a Danger zone. New projects are
      Feature or Short only; `FORMATS` in `store.js` is unchanged.
    - **Story path** (`src/data/story-paths.json`, `PATH` per format in
      `src/lib/story.js`). Feature: Idea › Logline › Story Bible › Scene
      order › Step outline › Setups & payoffs › Timeline › Synopsis &
      treatment › Lock the outline › To the Screenplay. Short: Seed › Logline
      › Character › World › Conflict › Scene order › Step outline › Synopsis
      › Lock the outline › To the Screenplay. Every blueprint question is
      asked exactly once, inline in the path step that absorbs it; the Story
      guide is now only the cover sheet. The framework is chosen only in
      Scene order (`frameworkChosen`). `outlineLockedAt` locks the outline.
      There is no favourite picker on Story; it reads "Examples from <film>
      · change in Settings". Short projects see feature-only cards only if
      they already hold an answer to one. `prove:story-path`. The key union
      is unchanged: 594/594 feature keys and 106/106 short keys.
    - **Idea Vault** is its own page, `vault.html` (`src/pages/vault.js`,
      `src/ui/idea-vault.js`), on the same key `fms_idea_vault_v1`.
    - **Purchase and admin split.** `purchase.html` (`src/pages/purchase.js`)
      holds plans, checkout, invoices and refund for the user and replaces
      the `settings.html#plan` links. `purchases.html`
      (`src/pages/purchases.js`) is admin-only: payments and refunds,
      invoices, promo codes, tiers and grants, growth. `admin.html` keeps
      overview, organisations, people, access and features. Access has a
      demo link, `invite.html#code=…&demo=1`, which enters without sign-in and
      opens the Dragon sample dashboard. Only sessionStorage flags are set.
    - **Erase this device.** `backup-menu.js` `resetAll({alsoDrive,
      confirmed})` no longer signs out. It optionally deletes the Drive file
      (`drive.js` `deleteFile`) and pauses cloud sync after the erase.
      `deleteOwnedCloudProjects()` in `cloud.js` deletes the cloud copies of
      owned projects (`project_data` cascades) and pauses sync. `prove:cloud-delete`.
    - **Library.** Print is removed. Search is library-only
      (`src/lib/library-search.js`, opened by "/" and ⌘K). There is a library
      index. The **Film Terminology** tab (section id `glossary`) holds 122
      terms grouped by stage. Each term has its stage, `seeAlso`, a Tanglish
      gloss and four film examples (`learn.js` `termBody`). Everyday words
      carry `notag`, so they are not auto-wrapped as terms.

32. **UX pass: scroll, steps, purchase, redundancy (11 Oct 2026).**
    - **Library stutter** was the shell's crumb repainting every frame:
      `goTo()` compared locations by object identity, `globals()` builds
      fresh objects, so each rAF repainted, which fed the `#app` and
      `.sh-bar` observers (1,600 mutations and 30fps per scroll). Compare
      by place (`id`/`href`), never by object.
    - **One step at a time** (`src/ui/stepper.js`): Story and every stage
      guide show one step with a step bar and Back/Next; the rest are
      `hidden`, never removed (data-keys stay in the DOM). Story lands every
      step through `landStepView()` — under the pinned bar, and again after
      the blueprint questions load, because they grow above the landing.
    - **Purchase out of Settings**: Settings keeps one link to
      `purchase.html`; old `settings.html#plan|billing|…` forward there.
    - **Script page**: the beats column is pinned and scrolls on its own (its
      list is rebuilt only when the beats change, so the scroll is kept); a
      hint strip names the line type and the Enter/Tab targets from
      `write-presets.json`, toggled as `hints` in `fms_write_prefs_v1`.
    - Redundancy sweep: duplicate vault heading, dashboard/admin repeated
      decks, the tour offered twice. Open owner decisions are in HANDOFF.

33. **Receipt and refund e-mails; a clearer invoice; the owner's name off the site (11 Oct 2026).**
    - The owner asked for a mail after purchase from `support@filmmakerstudio.in`.
      Resend, server-side only (`supabase/functions/_shared/mail.js`), sent by
      `rzp-verify` and `rzp-webhook`; schema §35 CLAIMS each mail with an
      UPDATE only one caller wins, and a failed send releases the claim.
      Hostinger SMTP was ruled out: Supabase Edge Functions block 25/587.
      Console: Receipt sent/not sent + RESEND RECEIPT. `docs/BILLING.md` §16.
    - Invoice PDF: PAID mark, payment ids and dates, Qty/Rate/Amount, amount in
      words, a refund-policy box. The sentence is `_shared/terms.js`, worded as
      refund.html (final, three exceptions) — not a flat "no refunds", which
      would contradict the published policy.
    - "I don't want my name to be displayed": `brand.json` `seller` is EMPTY;
      refund/privacy/terms say "a sole proprietor", the invoice names the
      trading name. The name stays in git history; rewriting `main` is not on
      the table.

34. **The entry page becomes the purchase page (12 Oct 2026).** The owner:
    "let that be the best space for purchasing", with fewer items. Owner's
    answers: the plans show ALWAYS, whatever the purchases switch says;
    each plan's main button is the free trial (Google sign-in), with
    "or buy now" second; five blocks only.
    - `start.html` went from 15 sections to five: a short hero (one promise,
      one button, a trust row), the plans (`#pricing`, with the `#offer`
      price-rise band inside it and the comparison table behind a
      `<details>`), What you get (`#features`, six stage tiles), proof
      (`#proof`: both sample films, the tour video, four counted facts;
      `#voices` untouched), then FAQ + close + the compact e-mail line.
      `#short`, `#learn`, `#india`, `#stages`, `#demo` and the module
      marquee are gone, with their JS and CSS.
    - Borrowed from other pricing pages: one payment as the headline
      against the subscription tools (Final Draft sells a perpetual
      licence; Celtx and StudioBinder bill monthly); three tiers with the
      MIDDLE one recommended (the flag moved from Basic to Intermediate);
      the trial on every card; outcome bullets; stacked cards on a phone.
      No "most popular" badge — there are no sales to make it true.
    - Each card's bullets are DERIVED: `plan-matrix.json` gained `card`,
      naming which of a plan's own additions its card lists first; the
      build fails if a key names something that plan does not add. The
      rest are counted ("+ N more in the comparison").
    - `showFreeNow()` now only marks `html[data-purchases=off]` and skips
      the rise band; `prove:growth` asserts the plans and buy links stay.
    - `.st-tiers li` matched the bullet lists inside each card, giving every
      bullet a card's padding and border — the tier rules are `> li` now.


35. **The UI revamp: one top bar, a console-style Settings, purchases in one
    place, a scene table, and the Pre-production path (12 Oct 2026).** The
    owner liked Story's flow and asked for the same across pre-production, a
    consistent band, Dark/Light, a revamped account/Settings/Drive, one place
    to buy, People "delete totally", a real search and a lighter Home.
    Owner's answers: one big change; no local gate; ONE Dark/Light button;
    total delete keeps invoices, anonymised; Story keeps its step strip and
    loses the "Then" row; Search is a real box in the band; the right zone is
    Project switcher · Backup · Theme · Name on every page but the doorway.
    - **Band.** `buildStudioTools` builds one `.sh-tools` zone on every page
      (inside the page `.toolbar` on hub/library/feature/short). Theme is one
      button (`chrome.js` `themeToggle`, labels Dark/Light; ids `ink`/`paper`
      and `fms_studio_theme_v1` unchanged); the "Design" row, the legacy ◐
      picker and the stale sepia/desk text are gone. Backup is one menu
      (`topbar-backup.js`, CORE: it copies `ACTIVITY_KEY` instead of importing
      `all-keys.js`, which would pull drive-sync into CORE). Global pages use a
      3-column grid (crumb | search | tools).
    - **Search.** `.sh-find` is a real field (a launcher: a click or the first
      key opens the palette with that text; NOT on focus, because the palette
      returns focus to its opener). Index gained Places and People; script
      lines are searched on demand (`scriptHits`), never indexed. On a bar with
      the stage strip it is the glyph alone until the band stacks.
    - **Settings.** Five tabs: Account · Preferences · Data & backup · Team ·
      Admin, in the console's grouped sub-nav (`.st-console`). Old hashes still
      land (`#drive` opens Data & backup). `ownsSync()` in `drive-sync.js` is
      DELIBERATELY unchanged: two devices uploading to one Drive file overwrite
      each other, so the page says plainly that with cloud sync on, Drive is
      manual.
    - **Purchases.** `invite.html` draws no plan cards; `purchase.html` is
      exempt from the site gate (`EXEMPT` in `sitegate.js`, `APP_PAGE` in
      `start.js`) so a signed-in person outside the door can reach it;
      `start.html`'s "or buy now" goes to `purchase.html?plan=X`; the plan
      survives the Google hop in a sessionStorage stash (`plan-cards.js`).
    - **People.** DELETE TOTALLY beside CLEAR ACCESS (members table, request
      rows, Customer 360), owner only, e-mail typed back, calling the existing
      `admin_delete_user`; the Controls-tab erase form is gone. **Schema §47**
      restates it to anonymise the kept invoices (name -> "Deleted customer",
      e-mail and GSTIN cleared; number, FY, sequence, amount untouched).
    - **Home** lost its title block, tour invite and closing quote (the page h1
      is the projects heading).
    - **Scene list** is a table (`renderScene` in `breakdown.js`,
      `scene-list.css`): find + three filters, rows open to edit, bulk set,
      MOVE TO BIN with UNDO instead of a confirm. Filtering hides rows in place;
      open/selected/filter state lives in `SL` for the page view only.
    - **Pre-production path.** `preprod.html` (`src/pages/preprod.js`) shows
      the eleven steps one at a time (`src/data/preprod-path.json`), each state
      DERIVED in `src/lib/preprod-path.js` from the models and
      `readiness.js` (nothing stored). `src/ui/path-bar.js` mounts the same
      strip + Back/Next on breakdown, visualize, plan, budget, contacts,
      stripboard and reports. It is NOT sticky: `measureChrome()` counts any
      pinned row not parked on the published value as band. The stage's tab
      lands on the path through a phase `home` in `navigation.json`
      (`firstModuleOf`, `stageHref`) and `STAGE_PAGES` in `navmodel.js` — NOT a
      nav module, because a module id needs a plan-matrix row, a §36
      regeneration and a §43 usage name.
    - **Not done.** Drag-reorder of scenes (up/down only); element
      autocomplete is a datalist of the film's existing names; the dashboard's
      Pre-production card does not say "Step N of M" (journey.js is first
      paint and must not import the path model).
    - **Gate.** Page text changed on most pages and `preprod.html` is a new
      page, so `verify` needs a baseline recapture and several `prove:*`
      scripts were edited blind (prove-billing, prove-admin-people,
      fake-admin-rpcs-*). `test:schema` (1138 checks incl. §47) and the Node
      tests pass; the browser proofs have not been run.

36. **The dashboard revamp (12 Oct 2026).** The owner asked for a clearer
    dashboard. The page said "go here next" five ways (a Continue tile, a
    suggested-next panel, a resume line, the journey strip's next step and
    the suggested stage card) and "how ready is it" three ways, with the
    34-module map in the middle. Now, top to bottom: a head (stage in the
    eyebrow, six stats); a **focus row** of two cards — Continue (resume,
    suggested stage, the journey's next step; `#suggested` and `#resume`
    live here) and Readiness (n/m checks, one bar segment per check, three
    things to do, a link to `#readiness`); the **five stage cards carrying
    the Guide/Tools meters** the journey strip used to repeat (`#journey`
    is kept on the list, because a fragment target must not disappear with
    a redesign); then a main column (the chain in four groups, readiness
    with passing checks as one row of ticks, recent) beside a sticky side
    column (this week, plan, backup), and the module map last. It still
    stores nothing — every number is derived on render. 7,646px → 5,891px
    on the Dragon sample at 1280.

37. **The AI Desk: one key place, Pro-locked pills, a review-and-refine
    sidebar (12–13 Oct 2026; PR #9).** The owner asked for AI "from start to
    end", then set the rules: the key is added in ONE place; AI is reached
    through one pill; plans without AI see the pill GREYED and are asked to
    buy Pro on click; clicking opens a sidebar where you read what is sent,
    accept the answer change by change, refine it by chat, then Accept or
    Skip. Owner's answers: chat lasts this visit only; per-change ticks;
    task-first (no general assistant); docked right. Built by four parallel
    agents on disjoint files, then integrated.
    - **`aiUnlocked()` fails CLOSED, on purpose the opposite of
      `allowed()`.** `plan-gate.js`: true only for a KNOWN plan whose
      `ai_tools` is not false (Pro, the trial, everyone while purchases are
      off). Signed out and "plan not loaded yet" read locked. `allowed()`
      still fails open for module locks. `ai-panel.js` `aiAllowed()` returns
      `aiUnlocked()`, and `plan:changed` repaints every pill.
    - **The pill** (`src/ui/ai-pill.js`) imports no AI code; the Desk loads
      on click. Locked = `aria-disabled`, NOT `disabled`, so it stays
      focusable — and so Playwright refuses to click it without
      `{ force: true }`; that is the proof's problem, not the pill's. "See
      Pro plans" asks `PlanGate.offerFor(['ai_tools'])` AFTER the press (the
      dialog never waits on the network), falling back to
      `purchase.html?plan=pro&for=ai_tools`.
    - **The key lives only in Settings.** `keyGate()` draws no form outside
      `keySection()`; it answers with the locked pill or a link to
      `settings.html#ai`. `proCard()` is gone.
    - **The Desk** (`src/ui/ai-desk.js`, `ai-desk.css`): docked at ≥1100px
      (main narrows by the measured `--ai-desk-w`, never translated), a sheet
      below. text tasks → a line diff with one tick per hunk
      (`src/lib/ai-diff.js`, pure, `test:ai-desk`); list → a checklist;
      read → text with the AI mark. Versions v1…vN. **A refinement re-sends
      the SAME task with the SAME JSON schema** (`refineBlock` in
      `src/lib/ai-refine.js` appended to a field the job already sends), so
      every parser and quote check still runs and neither provider's wire
      format needed multi-turn. Accept writes through the owning model with
      an Undo toast that does not time out. The session is a module-level
      Map — no storage key, no idle write.
    - **Tasks** (`src/lib/ai-tasks.js`): coverage, dialogue-pass,
      beat-critique, story-steps, story-map, shot-draft, synopsis-script
      (stage 1), logline, each wrapping the existing `ai.js` function.
      `task.identity(ctx)` keys the session (one script pill shares one ctx
      across three tasks); `editable: false` makes the input read-only where
      the task rebuilds its job from ctx. The Screenplay Writer's toolbar has
      one pill (Coverage · Dialogue pass · Critique this scene).
    - **Proofs.** `prove:ai-desk` (95 checks, `scripts/fake-supabase.mjs`
      `aiScenario('pro'|'no-ai'|'signed-out')`, `fake-ai.mjs` `deskAnswer`)
      and `prove:ai-coverage` rewritten for pill → Desk. Three traps hit on
      the way: the locked pill's `aria-disabled` (above); editor rows are
      `<textarea>`s, so `hasText` never matches — read `inputValue()`; and
      the Screenplay Writer's `beforeunload` leave prompt cancels a
      `page.goto` unless the proof accepts that one native prompt.
    - **Not moved yet.** Synopsis → script stages 2–3 keep their panel
      (with a Settings link); the voice check renders inside its panel. No
      AI answer has come from a real provider yet.

38. **CI back to green on develop (13 Oct 2026).** Three steps had been red
    on every push since the UI revamp, none of them from the AI Desk:
    - **§43 drift was ORDER ONLY.** The naming passes reordered
      navigation.json; `make-usage-names-sql.mjs --write` produced the same
      42 names in the new order. The CHECK is `name = any(usage_names())`,
      so the live database accepts the same names; re-running §43 live only
      changes the console's listing order. `test:usage-names` had been
      stopping `test:all`, so every later suite was skipped in CI.
    - **`prove:storage`** still clicked the hub's removed
      `[data-action="export-all"]` and `#importAllFile`; it drives the band's
      Backup menu now (`bk-export`, and `bk-import` with the picker stubbed),
      the same fix `verify`'s round trip got. Its editor section opened
      `write.html?stay=1`, where the editor is a hidden tab; it opens
      `screenplay.html` and accepts the leave prompt.
    - **A real bug under it: the Screenplay Writer never drove the scenes.**
      `screenplay.js` called `sceneSyncLater()` but never `mountHandoff()`,
      so handoff.js's `getDoc` stayed `() => null` and every sync was a
      no-op: scene headings typed on screenplay.html — the only writing page
      since item 31, write.html redirects there — never reached the
      Breakdown. It went unnoticed because the proof that would have seen it
      (`prove:storage`'s "two projects" block) never got past the backup
      crash in CI. Fixed by mounting the hand-off with `getDoc: () => doc`.
    - **`prove:story-path`** expected exactly ten `.st-path-tab`s; the owner
      added Beats & pacing, Pitch deck and Cover sheet as the strip's last
      steps on 12 Oct (`.st-path-extra`, no `data-path`). The proof compares
      the path tabs and checks the three extras on their own.
    - `prove:ai-desk` joined the Gate workflow's verify job.

39. **The last AI tools move into the Desk (13 Oct 2026).** Synopsis →
    script stages 2–3 and the coverage voice check were the two AI tools
    still drawing their own panels. Owner's choice for stage 3: batch by
    batch in the Desk, with the bulk run kept beside it.
    - **Draft and write are split in `src/lib/scriptgen.js`**, because the
      Desk's rule is that nothing is written before Accept:
      `draftScenes()` / `applyScenes()` and `draftBatch()` /
      `applyBatch(draft, keepIds)`, each apply returning an undo.
      `runScenes()` and `runNextBatch()` are now the two halves in a row,
      so the bulk "Write all / Resume" path is byte-for-byte the old
      behaviour. `applyBatch` refuses a draft made at another cursor
      (`GenError` 'stale'), and a scene the writer unticks is skipped the
      way a scene the reply missed always was: the cursor still moves
      past the whole batch.
    - **Three Desk tasks** in `src/lib/ai-tasks.js`: `gen-scenes`,
      `gen-batch` (identity = job + cursor, so each batch is its own
      session) and `voice-check` (rewrites become alternate takes through
      coverage.js's exported `addTake` / `removeTake`). A refinement rides
      on a field the request already sends — the synopsis for the scene
      list, the logline for a batch — through `refineBlock`.
    - **Call sites.** write.js stage 2's "Lay out the scenes" and stage
      3's "Next N scenes, in the Desk" are AI pills; the bulk button is
      hidden on a plan without AI (the pill carries the Pro offer); the
      old stage 2–3 key gate is gone. The voice check keeps its character
      picker and disclosure; its run button is a pill.
    - **Proofs.** `prove:ai-desk` 150 (new scenarios e–g: untick a scene
      and Accept, Undo, Skip writes nothing, no idle write);
      `prove:ai-coverage`'s voice section goes pill → Desk → Accept →
      Undo. Every AI tool in the studio now goes through the Desk.

40. **The start page lists everything the studio does (13 Oct 2026).** The
    "What you get" section had six broad tiles and named almost none of the
    tools (auto-tag, cast matrix, shot list, storyboard, lookbook, day out of
    days, sides, the AI Desk, Drive backup). A new `#everything` section sits
    right after it in `start.html`. Released to `main` as `18673a7`.
    - **Six stage cards, one line per tool**, in the studio's own order: Story;
      Screenplay; Pre-Production in three groups (the script, the look, the
      plan); and Production with Post. Each line is that module's `purpose`
      string from `navigation.json`.
    - **Six cross-film cards**: the library and palette, the AI Desk (own key,
      reviewed before it touches the script), sync/Drive/export, offline and
      on set, read-only screening and PDF exports, and the Tamil Nadu pieces.
    - **The list is typed in markup, on purpose and with a cost.** This page
      keeps its words in markup and carries no count, so nothing drifts loudly:
      a module added to `navigation.json` must be added to this list by hand.
      Which plan unlocks which tool is NOT repeated; it stays in
      `plan-matrix.json` and prints in "Compare every feature".
    - **Not in the gate.** `start.html` is not in `baseline.json`, so `verify`
      cannot see its words; it was read in a browser (desktop and 375px, no
      horizontal overflow). The offline, installable, screening-link and PDF
      claims were written from the notes and navigation data, not tested one
      by one; read those cards before a big push of the page.
    - **Checks.** Local `verify` all pages pass (`dist-verify`, gate off);
      CI Gate green on `3039bb6`. The full release-gate list (every `test:*`,
      `prove:*`, the gated build, the budget) was not run by hand.

41. **Script-to-screen lesson, Phases 1–2 (13 Oct 2026).** A survey of the
    studio against a pipeline lesson (AI analysis, breakdown, visual
    planning, schedule/budget, cloud post) found most of it already built;
    the plan is in the session plan file and only the gaps are done.
    - **Phase 1 (`4e4a1b8`).** `setdressing` and `sfx` join
      `ELEMENT_CATEGORIES` (additive ids). Stunts, VFX and Animals stopped
      sharing a hue with another category: five `--el-*` families in all four
      palette blocks plus print. Auto-tag reads every lexicon list, not five;
      ADD ALL still takes only the original five (the new lists are loose),
      one chip or ADD THESE takes the rest. `measureEighths()` in
      `scene-sync.js` + a "re-measure pages" button, content-matched pairs
      only, Undo. NOT done: an INT/EXT × day/night strip-colour mode (it needs
      a remembered preference, i.e. a storage key).
    - **Phase 2.** Three Desk tasks, each a draft/apply over verified quotes:
      `genre-comps` (one call; comparables are the model's memory and the note
      says so), `scene-notes` (a cut flag needs a quote that is in the scene),
      `breakdown-tags` (an element with no words behind it is dropped; apply is
      `tagMany`, undo `untagMany`). Scene-batched through `runSceneBatches`.
      New additive fields: story `genre/audience/budgetTier/comps`, scene
      `readerNote/cutCandidate`. `story.audience` steers coverage's
      marketability wording; blank keeps the old Tamil-theatrical-and-OTT
      default, so nothing changes until a writer sets it. The Coverage tab's
      heading still reads "Marketability — Tamil theatrical & OTT" whatever the
      audience is. `test:ai-phase2`. Never run against a real provider.

42. **Script-to-screen lesson, Phase 3 (13 Oct 2026).** Visual planning on one
    surface. `src/ui/blocking.js` adds two Visualize tabs: **Blocking** (an
    overhead SVG map per setup: actor / camera / mark, draggable, arrow keys
    move and `[` `]` turn, optional move to a second point) and **Scene
    board** (script, shots, frames and maps for one scene, read from their own
    models, printable). Blocking is a fourth collection in `fms_shots_v1`
    (`blocks`, scene-keyed, vector data only) — `readAll()` in `shots.js` MUST
    list it or every shot save drops it, and it rides in the scene's bin entry
    (`takeSceneOut`/`putSceneBack`, `entryCounts().blocks`). A drag writes once,
    on pointerup. The lens field gains a `<datalist>` of focal lengths, still
    free text. `test:blocking` (new), `test:sync` extended. NOT done: the
    shot-list share link, which waits on B7's security review and a schema
    section. Verify needed one allowlist row removed (`use` came back on the
    page, so its row went stale); no re-baseline.

43. **Script-to-screen lesson, Phase 4 (13 Oct 2026).** The schedule and the
    budget, linked without a second copy. Two budget tabs
    (`src/ui/budget-impact.js`): **Schedule impact** — what a shoot day costs
    (`perDayCost`: the estimator lines that scale with the shoot, automatic when
    a line is priced at exactly the shoot length, overridable per line), the
    shoot-day table, and an "if we cut…" what-if where a day is saved ONLY when
    every scene on it is ticked (a partial cut shows a labelled share, never a
    saving). **Versions** — lock the budget (`snapshotBudget`/`lockVersion`),
    compare any later state to it (`compareVersion`); locked means immutable,
    only delete (with Undo). `src/lib/schedule-impact.js` is pure and stores
    nothing; the only writes are `versions` and the per-line `scales` flag,
    both INSIDE `fms_costs_v1` (no new key; `readAll()`/`EMPTY()` list
    `versions`, or every expense save drops it). Producer / line producer /
    1st AD are shortcuts to Top sheet / Cost report / Schedule impact, not
    permissions. Song days the estimator folds into its own count are not in
    the day count here; a line priced on that count is marked by hand.
    `test:impact` (new), `test:costs` extended. Known wrinkle: the lock button
    shows the estimate WITH contingency, the comparison is without it.

44. **Script-to-screen lesson, Phase 5 (13 Oct 2026).** Cloud post-production
    within the local-first limit: the studio keeps ADDRESSES, never media.
    `src/lib/links.js` (pure) keeps only http(s) URLs, caps a row at six,
    dedupes, and guesses the service (Drive, Frame.io, LucidLink, Dropbox) by
    host — `drive.google.com.evil.example` guesses `other`. Links ride inside
    records the studio already owns: a deliverable's state (custom lines too,
    so the undo snapshot carries them), a scene's edit note, a shoot day
    (`dayLinks`) and a cut. New optional deliverables group `cloud_workflow`
    (8 items, ids `cw_*`, off by default, labelled the studio's own checklist,
    not a platform spec). Edit log: `cuts` (name, date, links, timecoded
    notes; sorted by time) inside `fms_edit_v1`; `parseTimecode` accepts
    `S`, `M:SS`, `H:MM:SS`, `HH:MM:SS:FF` and DROPS the frames on purpose;
    `cutNotesText` for pasting into an email. Notes that name a scene ride
    its bin entry. `readAll`/`EMPTY` in `editlog.js` list the new
    collections or every pick-up save would drop them (tested). `test:links`
    (new), `test:delivery` and `test:post` extended. Browser pass found six
    minor items; three fixed (undo restores a link's position, the bin list
    names blocking diagrams and cut notes, `aria-invalid` on a refused link
    URL). Open: after a LIVE theme toggle without reload, `.btn` text colour
    can stay on the old theme's value (seen on deliverables.html; probably
    older than this work, not confirmed).

45. **Script-to-screen lesson, Phase 6 (14 Oct 2026).** The lesson's concepts
    as original learn content, and the start page told the truth about what was
    built. `glossary.json` +19 terms (122 → 141): page eighths, scene number,
    breakdown category, background actors, props, set dressing, SFX, VFX,
    special equipment, blocking diagram, above/below the line, producer, line
    producer, shoot day, camera to cloud, proxy, 3-2-1 backup, checksum — each
    with a Tanglish line and an example in all four films. `learn.json` +13
    topics as pointers, mounted where the reader meets the tool (breakdown
    #scenes/#elements; visualize #blocking; budget #estimate; edit, appended).
    None of the lesson's product names, prices or accuracy/speed figures is in
    any data file: they were unverified marketing numbers. `start.html`
    `#everything`: Auto-Tag and Breakdown lines corrected, Blocking, Scene
    Board, Schedule Impact, Budget Versions, Cut Versions and Cloud Workflow
    added, the AI Desk card names the three new tasks. A browser read-through
    found real content errors, fixed before commit: a "breath in cold air" SFX
    example (not an effect), a 3-2-1 example that showed one media type, a props
    definition that blurred props and dressing, "above the line" tagging a
    tension chart in prose (now `notag`), off-topic videos on five topics
    (their `steps` pointers removed), and "sound, SFX" reading as sound effects
    on the start page. `verify` needed one EXPECTED row, `library: '122'` (the
    library prints the glossary's term count). Open: the four cloud learn boxes
    sit at the foot of edit.html, away from the Cloud workflow checklist on
    deliverables.html; `props`/`above the line` are `notag`, so they never
    pop over in prose.

46. **Edit page trimmed to its budget (14 Oct 2026).** Merging the section-menu
    work from `origin/develop` pushed the edit page's first paint to 658,539
    bytes against a 655,360 cap. Rather than raise the row in
    `scripts/budget.json`, the cut-versions UI (cards, timecoded notes, the
    add forms, the copy button and their events) moved to `src/ui/edit-cuts.js`,
    a 5.5 KB chunk. `edit.js` always renders the `#cuts` section's heading (a
    fragment target must resolve before any script arrives) and loads the
    chunk when the section comes within 600px of the viewport; the scene
    rows' dailies links stay in `edit.js`. Edit first paint is now 638.4 KB of
    640. Known and NOT this change: `stripboard.html#dood` lands 34px behind
    the chrome in verify's fragment check, on `origin/develop` alone as well,
    from the section-menu work.

47. **The `#dood` landing, fixed (14 Oct 2026).** `stripboard.html#dood` failed
    verify's fragment sweep on `origin/develop` (landed at 117px under a 151px
    band). Two causes, both in `src/ui/fragments.js`. (1) The browser's own
    scroll to a fragment can finish AFTER the resolver has landed and declared
    itself settled, and nothing mutates to wake the resolver; a landing is now
    guarded for 2.5s (`guardLanding`): it re-lands on scroll events, once per
    frame, and stands down on any wheel, touch, key or press. It is armed when
    a resolve starts, not only once it settles. (2) The check for "arrived"
    compared the target to `scroll-padding-top` alone, but
    `path-bar.css` gives each tab section `scroll-margin-top` = the path bar's
    height, so the true resting place is padding + margin (163 + 64 = 227
    here); `restTop(el)` now adds the margin in both the settle test and the
    guard, which also lets the resolver settle on such targets instead of
    re-landing until its timeout. Found by logging every scroll call with its
    stack: the explicit calls landed at different `y` each time because each
    aligned to a different effective padding.

48. **Celtx-style simplification (17 Oct 2026).** Built from
    `celtx-ui-simplification-plan.md`, on top of `develop`, by three
    foundation lanes and six page lanes, then a bug round. What changed:
    (a) **modules off for every plan**: 15 modules carry `plans: []` in
    `src/data/plan-matrix.json` (case-studies, dissection, glossary,
    idea-vault, pitch-deck, script-breakdown, auto-tag, songs, screen-time,
    cast-matrix, lookbook, media, shoot-day, edit-log, deliverables);
    `plan-gate.js` `isDisabledEverywhere()` (a HIDING rule only, fed by the
    hard-coded `OFF_BY_DEFAULT`, which `test:plans` keeps equal to the matrix)
    hides their links and sections (`hidden` / `data-tab-off`, kept in the
    DOM), and a page whose every module is off draws a neutral "Not
    available" panel (`.pg-lock[data-gone]`) instead of a SEE PLANS card.
    `allowed()`, `entitlement()` and `walled()` are untouched. (b) The side
    tab menu is now Admin and Settings only; every other tabbed page gets the
    segmented pill strip. (c) The path bar, the blueprint-step pill and the
    visible stage guide are retired (`#guide` stays in the DOM, `hidden`, and
    opens on a `#guide` link); the Pre-Production rail item opens
    `breakdown.html`. (d) Opening a project lands on `screenplay.html`
    (`PROJECT_HOME_URL`). (e) Premium depth tokens in `tokens.css`; page
    layouts per plan section 7. `scripts/baseline.json` was recaptured
    deliberately: zero data-key movement; the words removed are the
    Post-Production stage text and the Library rail label (every module in
    both is off for every plan, so the stage has no live module and leaves
    the rail).
    **Bugs worth remembering.** A merge cut `screenplay.css` from 961 to 27
    lines and every gate stayed green (verify checks words, keys, contrast
    and overflow, not whether a stylesheet still exists). The rail's lead
    module was picked with `allowed()`, which is true while the plan is
    unknown, so the Pre-Production link pointed at an off module and plan-gate
    then hid it for everyone. `pageLocked()` must count only modules that can
    be on a plan.
    **Consequences for the owner.** `shoot.html`, `edit.html`,
    `deliverables.html` and `vault.html` are "not available" to everyone, on
    every plan. The browser extension's clipper drains its queue into
    `vault.html`, so clips have no visible destination until Idea Vault is
    switched back on (`prove:extension` looks past the overlay to test the
    queue). `plan-matrix.json` is the source of §36: regenerate and run it
    (`scripts/make-plan-features-sql.mjs --write`) before purchases are
    required, or the live plan rows still carry the 15 modules as on.


49. **One frame per page, however it is reached (17 Oct 2026).** The owner
    reported that the UI changed with the page you came from. Two causes.
    First, `shell.js` stamped `html[data-phase]` from the ENTRY hash, so
    `contacts.html#call-sheets` painted Production and `contacts.html`
    Pre-Production, and the reports tabs that own no module (`#dpr`,
    `#kit`, `#oneliner`) got no stage at all; `[data-volume]` rules also
    sat after `[data-phase]` in `tokens.css` and beat it. Now a page has
    ONE home stage, derived by `homeStage(file)` in `src/lib/nav-stage.js`
    (the stage of its first module in `navigation.json`), which decides the
    accent, the lit rail stage and the crumb's stage segment; only the
    crumb's last segment follows the tab. Root `.html` files carry the same
    value statically (`test:homestage`). One stage-link rule, `stageLead()`,
    serves the rail, the crumb, the dashboard cards and the hub doors.
    Second, pages did not share a frame: every studio page now renders the
    kit `pageHeader` with `bd-head` (h1 = the page's name, no full stop),
    one `.k-page` column, the tabs strip (side menu only in Settings and
    the console), no page toolbar beyond `.sh-tools` (Library and the hub
    lost theirs; the `.toolbar` element is kept, empty). Screenplay keeps
    its full-width editor but lost its duplicate crumb, and `#import` opens
    the same modal as the button. The retired path bar is deleted.
    `prove:nav` loads every page through every inbound link at 1280 and 390
    and fails on any frame difference, including the h1's position, size and
    weight across pages; against the old code it reported 35 mismatches.
    Re-baselined deliberately (the dropped words are the rewordings).

50. **Launcher as project home (18 Oct 2026).** Reverses clause (d) of item 48:
    opening a project, Continue, creating one, switching project and the demo
    path land on `dashboard.html` again. `PROJECT_HOME_URL` is `'dashboard.html'`
    in all three copies (`hub-keys.js`, `project-setup.js`, `project-switcher.js`).
    The rail's Dashboard entry is back as the project's home item. The dashboard
    opens on the slim head and the stage-row launcher (rows mirror the reference
    image: Write / Breakdown / Visualize / Plan / Shoot); everything it used to
    open with sits in a closed `details.db-overview` ("Project overview"), every
    node still in the DOM with `#journey #suggested #resume #readiness` intact.
    `prove-billing` waits for `/dashboard/` after project setup again.

51. **The public site, Celtx-structured (18 Oct 2026).** Home (`start.html`),
    `pricing.html` and eleven product pages (`product-<id>.html`: writing,
    story, storyboard, breakdown, catalog, shot-list, schedule, budget,
    call-sheets, cast-crew, sides) in the order of the owner's Celtx report
    (hero, value, demo video, how it works, related tools, tools for every
    stage, call to action, facts), in our theme. The product pages and
    pricing are GENERATED and committed (words live in the markup, like
    start.html): `scripts/make-marketing-pages.mjs` reads
    `src/data/marketing-site.json` (header, footer, modal), `marketing-pages.json`
    (copy for the 11 pages), `marketing-home.json`, `marketing-faq.json` and
    `pricing-compare.json`; `npm run make:marketing` regenerates,
    `npm run test:marketing` fails on drift, a missing media file, a wrong
    step count, an unknown related id or an external host. Media are recorded
    from the Dragon sample by `npm run record:marketing`: one silent demo loop
    and a poster per page plus one still per how-it-works step, in
    `public/marketing/` (about 4 MB). Decisions (owner): no social proof of
    any kind (no ratings, logo bars, quotes or counts: true product facts
    only); header = Product (grouped by stage), Pricing, Log in, Sign up;
    Sign up opens a modal with Google sign-in through the existing
    `start-auth.js`; no Education tab; pricing moved off the home page; the
    invite banner, e-mail offers form, voices and regional block left the
    home page, but the invite-code hold (`#inviteBand`, `fms_invite_code_v1`)
    stays in `start.js` because `prove:gate` asserts it, and `marketing.js`
    holds a `#code=` from any marketing page. Registration points a new
    public page needs: `sitegate.js` EXEMPT, `plan-gate.js` and
    `start-model.js`/`return-to.js` exempt lists, the `marketingFigures`
    plugin in `vite.config.js`, the service worker's `marketing/**`
    exclusion (videos are never precached), `vercel.json` and `netlify.toml`
    rewrites plus `media-src 'self'`, `public/sitemap.xml`. The pages are not
    in `baseline.json` (like start.html), so a missing word there is read in
    a browser, not by the gate; `test:marketing` and `prove:growth` (no
    `supabase-*` or `studio-*` chunk on a product page) are what watch them.

52. **Celtx gaps, round 1 (19 Oct 2026).** From the owner's Celtx comparison
    (replica-skill recon → diff → entrepreneur; parity 76.4/100, the one
    must-have gap being co-writing presence). Six of the fifteen modules item
    48 switched off came back, because they answer gaps the comparison
    found: `auto-tag`, `screen-time` and `cast-matrix` on Intermediate
    (Celtx's breakdown is manual tagging), `shoot-day`, `edit-log` and
    `deliverables` on Pro (Celtx stops at the call sheet). The change is the
    matrix and `OFF_BY_DEFAULT` only, with §36 regenerated; the page code
    had never been touched. Fallout the checks caught: `test:plans` listed
    `post` as an all-off stage (now none), `test:launcher-rows` wanted the
    six in a project-home row (Shoot Day joins Shoot; a new Finish row holds
    the post pair) and `test:marketing` wanted them in a pricing comparison
    group (a new Post-production group). Re-baselined deliberately: the only
    words lost were the "Not available" card on shoot, edit and deliverables;
    every other page only gained module labels. Owner step: re-run §36 live
    (the live map still says true for all six on Pro from 12 Oct, so the
    gap is harmless meanwhile).

    **Find and replace** in the Screenplay Writer: Ctrl/⌘+Shift+H, or
    Tools → Find and replace (H because Ctrl/⌘+Shift+F is focus mode).
    `src/lib/script-replace.js` is pure (`findMatches`, `replaceAll`,
    `replaceOne`): text only, never a type or an id; Whole word is
    Unicode-bounded so Tamil works (`\b` would split every letter); without
    Match case a match in capitals is replaced in capitals, so renaming a
    character renames the cue too. `src/ui/script-replace-bar.js` is a row of
    `#scTop`: it marks the LINE of a match (a textarea cannot paint one),
    Esc lands on the match with it selected, Replace all is one save and an
    actionable Undo that skips a line edited since. `test:replace` and
    `prove:replace` (in CI beside `prove:script`).

    **Index cards** on the Scene List (`breakdown.html#scenes`): a Table /
    Cards switch (in memory, like the saved filters, because a remembered
    view would be a new key). `renderSceneCard` builds a `.bd-sl` carrying
    the row's `data-*`, so the search, the filters, the drag handle and the
    keyboard route work on cards unchanged; only the drop differs — the card
    under the pointer is marked on its leading or trailing edge
    (`updateCardDrop`) instead of a line being inserted, which would take a
    grid cell and shuffle the board mid-drag. Left / Right move a card too.
    Reordering is the scene list's (`reorderScene`, one write), never the
    script's text, and the first move of a visit says so. The top edge wears
    the time of day's hue. Edit returns to the table with the scene open.
    `prove:cards` (in CI).

    **Storyboard image upload**: Upload picture on every frame
    (`src/ui/frame-upload.js`). The same road as a drawn frame: shrunk to
    1600px on the long edge and re-encoded as JPEG in the browser, saved as
    a file in the writer's own Google Drive, and the frame keeps only
    `ref = drive:<fileId>` — no bytes in localStorage or a backup, no new
    key. The board gate (`boardGate`) decides first; a lapsed token
    reconnects on the press and asks for one more press, because the file
    picker needs a click of its own. Undo restores the old ref and deletes
    the new file; an earlier Drive picture is never deleted. Each frame also
    has a Shape (`aspect`, a field on the frame spread by `listFrames()`,
    ids in `board-frames.js ASPECTS`, read by `[data-aspect]` rules), so a
    2.39:1 film boards in 2.39:1. `prove:board-frames` scenario (d) drives
    it against the faked Drive; no real Drive was reached.

    **Co-writing presence** on the Screenplay Writer: who else has the
    script open (faces in the draft line), the line each is on (a named
    mark at the line's right edge) and, while another writer types, a
    warning — because the script still syncs as one blob, last write wins,
    and presence merges nothing. The channel is PRIVATE (`pr:<project id>`,
    `cloud.js joinPresence()`), because presence on a public channel is
    outside RLS: the anon key and a project id would show who is writing.
    `supabase/schema/schema-48-presence.sql` adds `can_join_presence(topic)`
    and two `realtime.messages` policies (presence extension only) for the
    people `has_project_access()` already lets read the project; it is a
    no-op where `realtime.messages` does not exist, and `test:schema` checks
    it against a stand-in (`presence-stub.sql`, 11 checks). The client is
    safe before §48 runs: the join is refused and nobody shows. "Typing" is
    judged on the receiver's clock (`noteSeen`), not the sender's `at`.
    Sends the line id and typing, throttled to one message per two seconds,
    never the words; stores nothing. `test:presence`, `prove:presence`
    (Realtime FAKED). Live check owed: two signed-in accounts on one project,
    after §48 runs. Live character-level cursors were deliberately not built:
    without a per-element merge they would promise co-editing that does not
    exist.

    **Idea Vault back on Basic and up** (owner, same day), so the Chrome
    clipper's clips land somewhere visible again. Matrix, `OFF_BY_DEFAULT`,
    the `write` launcher row, the `story` pricing group and §36 regenerated;
    `prove:extension` lost the style override that looked past the "Not
    available" panel and now asserts there is none. The clipper itself is
    still `limits.extension` (Intermediate and up), so Basic has the page and
    not the clipper. Re-baselined: vault lost only the panel's words.

    **A newer copy arriving no longer gets overwritten** (a live data-loss
    bug found while planning co-editing). `screenplay.js` loaded `doc` once
    and nothing listened for `cloud:synced`, so after cloud.js wrote a pulled
    or live script into storage the next keystroke saved the page's older
    copy over it with a newer clock — the other device's work was gone from
    the cloud (only the local copy cloud.js displaced went to salvage). The
    page now listens (the pull's notify gained `scopes`, the names it WROTE)
    and `src/lib/script-incoming.js` decides: nothing unsaved → show the
    arrival; mid-edit → keep the screen AND keep the arrival as a draft
    ("From another device, HH:MM", a `revisions` entry — no new key), with
    Use theirs one press away, which keeps the writer's copy as a draft in
    turn. No branch drops a line. `test:incoming`, `prove:script` case 15.
    Found on the way: a long draft name pushed the draft line 42px past a
    390px screen; it truncates now.

    **Word (.docx) screenplay import.** `docx-text.js` gained
    `documentXmlToParagraphs` (text, the style's display NAME from
    `word/styles.xml`, left indent in twips, alignment, page breaks) beside
    the synopsis reader it already had. `script-import.js` lays each
    paragraph out the way a PDF already is — one line at the column its type
    sits at in a screenplay text file — and PARSER 2 reads it: the STYLE
    decides when it names a screenplay element (`DOCX_TYPE`; Final Draft's
    .docx export and the Word templates use those names), otherwise the
    indent at 144 twips a column, and right-aligned is a transition. Styled
    cues and headings are set in capitals (Word often shows capitals through
    the style over lower-case text). A file with no screenplay styles says so
    in the preview. Both pickers accept .docx and the copy that lists the
    formats says Word. `test:import` (+16, fixtures through
    `scripts/lib/zip-fixture.mjs`, moved out of test-story), `prove:script`
    case 16 through the real file picker.

    **Word (.docx) export.** `src/lib/zip-write.js` writes a stored ZIP with
    a real CRC-32 (Word checks it; our own reader does not, which is why the
    test fixture's zero CRC was never enough) and fixed timestamps, so the
    same script writes the same bytes. `src/lib/screenplay-docx.js toDOCX`
    lays the script out from the typesetter's own `GEOMETRY` — US Letter, a
    1.5in gutter, 144 twips a character — with each element a paragraph in a
    NAMED style (Scene Heading … Shot, the Final Draft / Word template names),
    text printed as on the page (`printedText`: capitals and brackets in the
    text, not a style's caps), the title page first and a page break after
    it. Courier New, not Courier Prime: every machine with Word has it and the
    metrics match. Dual dialogue is written one speech after the other (a
    table would break every re-import). File → Export Word (.docx) on
    screenplay.html and Export .docx on write.html, loaded at the press.
    `test:docx` (20: standard CRC, Python's zipfile opens it and every CRC
    checks, indents, round trip through our importer); `prove:script` case 17
    downloads it. LibreOffice renders it correctly (checked by hand once).

    **Locked pages (A-pages).** Inside a scene lock, "Lock page numbers"
    (drafts.html#numbering and write's Revisions) records where each page
    starts — `numbering.pages = { locked, at, starts: [{ n, id, split }] }`,
    inside the script blob, no new key; `normaliseNumbering` and
    `settleNumbering` carry it (both rebuilt `numbering` from three fields
    and would have dropped it on the first load or save). `paginate()` takes
    `opts.breakBefore` and `paginateDoc()` breaks before every unsplit locked
    start; `pageNumbersDoc()` names the pages: the locked number where a page
    starts where it did, 12A / 12B for overflow, and a page whose start was
    cut folds into the one before as 12-13. The PDF, the text export and both
    page views print those labels (the page views also stopped skipping a
    break whose label changed while its position did not). Unlocking the
    scene numbers unlocks the pages with them, and says so. `test:revisions`
    (+16 on the Dragon sample), `prove:script` case 18 through the real
    controls.

    **Co-editing, behind a switch (schema §49, OFF).**
    `supabase/schema/schema-49-co-editing.sql`: `billing_settings.co_editing_enabled`,
    `co_editing_enabled()` for anyone and `admin_set_co_editing_enabled()`
    for the owner only, audited (`test:schema` +9). The console's People tab
    draws it (`src/ui/coedit-admin.js` over `src/lib/coedit-api.js` —
    `test:layers` refused a view calling `.rpc()` directly), and says so when
    §49 has not run. ON, the script scope MERGES instead of newer-wins:
    `src/lib/script-merge.js` merges line by line by id (the later `u` of a
    line both sides changed; a delete only when the common base proves it
    and nobody edited the line since; no base, nothing is deleted; order
    follows the arrival; drafts and documents union; title page and
    numbering follow the side that changed them). `u` is stamped by
    `saveScript` on every line that changed since the stored copy, and by the
    Screenplay Writer as a line is typed, so an unsaved keystroke counts as
    later than an arrival. `cloud.js` reads the switch at attach
    (`coEditingEnabled`, a missing function reads OFF), keeps the base per
    project in memory (last pushed or received), and judges self-echo by its
    own last push rather than user id while it is on, so one person's two
    devices merge too. The open page merges an arrival into `doc` (its own
    `pageBase` as ancestor) and keeps the caret to the character. `test:merge`
    (19), `prove:presence` case 8 (merge on the page; Realtime faked). The
    live check needs two accounts after §49 runs and the switch is on.

    **Live cursors.** Presence sends the caret's offset as well as its
    line (`pos`, from `selectionchange`/`keyup`, throttled with the rest),
    and the Screenplay Writer draws each other writer's caret at the
    character: a hidden mirror of the line's textarea, given its box and text
    styles, lays the text out the same way and a marker span at `pos` is
    measured (`caretPoint` in `src/ui/presence.js`). A named 2px caret sits
    in the row and never takes a click; a page render redraws them. An older
    page that sends no `pos` simply has no caret. `test:presence` (+3),
    `prove:presence` 5b (the caret moves four characters' width for four
    characters, and survives a redraw).

    **Round-2 review (19 Oct 2026).** A ten-agent review workflow (five
    reviewers, each followed by a skeptic who tried to refute every finding
    and reproduced the pure-module ones in Node) reported 25 findings: 24
    confirmed, 1 unsure, none refuted. All were fixed:
    - **Co-editing (switch-only, nothing live):** the merge base was this
      device's own push, which a writer who was offline never saw, so a
      line added here read as cut over there and was lost everywhere. The
      base is now the copy last RECEIVED; a merge that drops a local line
      salvages first. The page sampled the switch once, before the session
      was restored, and read OFF; it now asks on every arrival. The
      arrival's canonical form was computed against the base, so identical
      arrivals were pushed back; own-push echo is compared as instants.
    - **Switch off (live behaviour):** two writers typing at once added a
      whole-script draft per save on both sides. The page's last arrival
      draft is replaced in place for ten minutes and only the newest
      "Use theirs" toast stays. A page saving a stale in-memory copy no
      longer stamps its stale lines as the newest edit (`stampChanged`).
    - **Word:** XML-illegal characters stripped on export; hand-typed
      indents (leading tabs/spaces) read on import; a paragraph's style now
      decides its type (the round trip keeps MONTAGE, LATER, shots);
      `heading N` is not a scene style; non-breaking/soft hyphens; text
      boxes no longer duplicate. The Breakdown's picker accepts .docx
      (`test:accept` guards every picker).
    - **Locked pages:** `lockPlan()` keeps only rising starts, keys split
      starts by occurrence, re-anchors split and blanked starts, places
      OMITTED rows before the locked break, folds a missing number onto the
      last page before the next one, and never prints the first page's
      number.
    - **Presence/console:** carets follow typing and resize; focus on another
      row sends no stale offset; only the owner sees the switch; a failed
      read can be retried.
    - **Copy:** "keeps working offline" became "once it is open"; a cold
      offline start is refused by the site gate (KNOWN-ISSUES, owner
      decision).

53. **The 19 Oct 2026 pass (CLAUDE.md rows 41–50).** One day, several
    branches merged into `claude/improvement-ideas-0gwjyx`:

    - **Account avatar menu** (`40beb10`). The status bar at the rail's foot
      is no longer mounted; the foot is one avatar that opens a menu (who you
      are, Settings, Plan & purchases, Help & shortcuts, Sign in / Sign out).
      Settings left the rail; the band's name pill is hidden on a desk but
      kept in the DOM for auth state and the phone's Tools sheet. The avatar
      is the Google profile photo (`user_metadata.avatar_url` / `picture`),
      replacing the initials rather than sitting under them (`906261c`);
      `img-src` names googleusercontent in `vercel.json` and `netlify.toml`.
    - **Full-width frame** (`ace671f`, then `906261c`). `--measure-wide` went
      92ch → 78rem → `100vw`, so every studio page runs edge to edge beside
      the rail; `--measure-text` (92ch) keeps prose at a reading measure. The
      Plan day cards then fitted two columns at 1100px and overflowed by 14px
      (`0190191`, found by `prove:scroll`).
    - **Story four steps** (`743576a`, `a4863d6`). Idea, Characters & world,
      Beat Sheet, Synopsis for both formats, stable numbers 1, 7, 4, 5; every
      retired step id and number reaches its new home through `aliases`. A
      Title page card on the dashboard edits the cover keys through
      `blueprint-store` and re-reads them after every render and on storage,
      visibility and cloud events. No key added, renamed or removed.
    - **Plan gate and Library** (`40beb10`, `906261c`). A matrix `plans: []`
      module is hidden whatever the server's features map says (the live §36
      predates the switch-off). The Library is always reachable;
      `openShelves()` drops switched-off shelves from the contents, index and
      counts while their sections stay in the DOM as hidden tabs.
    - **Craft-book shelves** (`91340c9`, `5a99882`). Writing for Emotional
      Impact and Save the Cat as Library tabs, content in
      `src/data/book-*.json` with an `_about` stating the copyright rules; the
      review removed list orders and triads that followed the books too
      closely.
    - **Purchase page revamp** (`29eb905`). Current-plan strip, comparison
      cards, full feature table, refunds and invoices as their own sections;
      modules no plan sells are neither listed nor counted.
    - **`prove:scroll`** (`d4f3229`). Every root page at 1440/1100/390 with
      the Dragon sample: nested scrollers, end reachable above fixed chrome,
      locks at rest and after each sheet, sticky, fragments, overscroll
      chaining, wheel, height jumps. It found `fragments.js` fighting the
      reader for 20s on `library.html#films` and a breakdown sheet leaving
      `bdx-locked` on `<html>`. Added to CI after `build:verify`.
    - **Design passes.** Emil Kowalski motion audit E1–E15 (`76182bc`,
      `709e87e`), Impeccable (`f2b36ff`, `c163516`), Taste on the public
      pages (`62f1b05`). A deliberate baseline recapture (`3f75db3`) sits
      between them; later passes added `EXPECTED` rows instead.
    - **Schema §50** (`b9f4548`, `550b01f`). Refunds follow the role matrix in
      the database, seats follow the current plan, a decline sticks across a
      re-ask. Not run live; it goes with a redeploy of `rzp-refund`.
    - **Contact / About and the policies** (`dc42067`, `6d3a588`, `ad4a604`,
      `bacbcd1`). Generated public pages; the contact form only opens a
      `mailto:`. privacy, terms and refund rewritten against the code; the
      terms' purchase-day promise was removed because 15 modules are off for
      every plan and nothing snapshots features per buyer.
    - **Tooling** (this retro). verify's stage-guide probe waits for the
      condition (up to 8s) instead of a 1.5s ceiling that flaked on
      `story.html`; stale "not run live" comments in `cloud.js` and the
      `deploy-billing.mjs` slice description corrected.
    - **The legal pages go dark (20 Oct 2026).** privacy, terms and refund
      leave the light paper surface and wear the public site's frame: the
      shared header and footer and an "On this page" list are stamped into
      marked regions by `make:marketing` (`renderLegal()`), which also gives
      each id-less `<h2>` a slug id and never edits the legal text (checked
      word for word before and after). `legal.css` is rewritten on the dark
      tokens with a sticky contents column at 1100px and up and a disclosure
      below; print stays black on white. `legal.js` loads stylesheets and
      the icon-font check only — no `marketing.js`, which counts visits.

54. **Script-first studio, phases 0–3 (20–21 Oct 2026).** The owner asked
    for writing fields that read like a script page, a script import that
    drives the whole breakdown before any AI, an AI script-analysis space,
    a best-in-class shot list and storyboard, and (later) Drive-only
    storage. Plan: `/root/.claude/plans/…` summarised in
    `docs/DRIVE-STORAGE.md` for the storage half.
    - **Phase 0 (Drive spike).** `spike-drive.html` + `src/dev/drive-spike.js`,
      dev only, never built: the experiments `drive.file` has to pass for a
      shared project folder. Waiting on the owner's two-account run; phases
      4–6 (Drive-only storage, test-shoot photos, cutover) start from its
      answers.
    - **Phase 1 (paper fields).** `src/ui/paper-field.js` + `paper-field.css`:
      writing inputs are `--paper-page` with black `var(--f-script)`; the app
      stays dark. `paperScope()` covers blueprint steps (raw JSON blocks
      included); dates, money, numbers and search stay dark (`NOT_PROSE_KEY`
      in steps.js, `TP_NOT_PROSE` on the dashboard). Focus is a violet ring
      plus an ink border (the ink ring alone sat on the dark ground at ~1:1).
      `test:paper` fails a writing file that builds a bare textarea.
    - **Phase 2 (pipeline + analysis).** `src/lib/script-pipeline.js` runs
      scenes, characters, locations, prop suggestions, shots, proposed days,
      budget days and analysis, each filling blanks only, with an in-memory
      undo that survives closing the sheet (an Undo toast). The scenes step
      runs `runBreakdown` with `fillOnly`, so a location typed on a linked
      row is never overwritten, and it never bins rows silently.
      "Enhance with AI" chains the Desk tasks (new `tension-notes`), the
      user's own key, nothing written before Accept. Script analysis is a
      tab on screenplay.html (`script-analysis-model.js`): tension against
      the framework convention, pacing, structure by page, cast lines,
      coverage. `test:pipeline`, `test:analysis`, prove:script case 19.
    - **Phase 3 (shot list + storyboard).** `shots.js` `readAll()` now
      carries unknown fields through a save (an older tab no longer wipes a
      newer build's fields). Shot `mins`/`setup`/`numLocked`, frame
      `action`/`dialogue`/`camera`. List ⇄ Board, a Columns menu that also
      shapes PDF exports (the CSV keeps its fixed header), setup grouping,
      time per scene and per shoot day, drag/keyboard reorder that
      renumbers only plain ordinals and never a typed number, frames per
      row, bulk picture drop (one frame each, one Undo), PDF list/4/6
      grids, image ZIP. View prefs ride `fms_studio_prefs_v1` as `shotView`.
    - A ten-agent review workflow (review → skeptic → fixer per phase) found
      12 confirmed problems, 2 of them blockers (typed scene locations
      overwritten; typed shot numbers renumbered), all fixed with
      regression tests before the merge.
    - **The gate's "11".** On 20 Oct the lookbook step left the preprod
      path and verify missed the word "11"; an EXPECTED row for it went
      stale the next day because "11" was then also a festival COUNTDOWN
      number, which verify strips from both sides. A digit that can be a
      countdown cannot be allowed by row: re-baselined on 21 Oct instead.

55. **Yearly plans, marketed by the day (21 Oct 2026).** The owner changed
    the model from "pay once, yours for good" to one year per payment, same
    rows (₹599 / ₹799 / ₹999), renewed by buying again, the 31 Oct rise kept,
    and existing buyers given a year from the switch.
    - **Schema §52** (`schema-52-yearly-plans.sql`, 23 checks in
      `scripts/schema-tests/yearly.sql`, seeded with the pre-§52 functions so
      the backfill has something to switch). The machinery was already there —
      `account_plan()` reads `plan_until`, `billing_status()` returns it —
      §18 had only switched it off.
    - **Client.** Cards print "₹599 a year · ≈ ₹1.64 a day", "Valid until …",
      RENEW on the plan held, an upgrade line naming the unused year; the rail
      warns in the last 14 days; settings, invoice, receipts and the console
      ledger say a year. `Billing.perDayPaise` was missing from the default
      export, which `prove:billing` caught as a lock line falling back.
    - **Marketing.** Pricing, home and FAQ lead with the per-day figure from
      build stamps (the FAQ JSON-LD resolves them too, since it is itself a
      stamp value); the about page keeps to brand stamps, so it says "less than
      a cup of tea a day", true at every tier before and after the rise.
      og.png, posters and captions follow; `make-og.mjs` learnt to read rgba
      tokens (it had failed since the Swiss palette).
    - **Legal.** Terms §4/§5 and the refund policy dated 21 Oct 2026, each with
      a "What changed"; the three refund exceptions unchanged.
    - **Gate.** test:all (schema 1270), verify (two EXPECTED rows for the
      removed "pay once" words on invite and purchase), prove:billing 298
      (renewal stacks, credit against a year that has not begun is exact),
      prove:gate 230, prove:growth, prove:legal, prove:scroll — all green.

56. **Ponytail installed, the whole repo audited (21 Oct 2026).** The owner
    pointed at Ponytail (github.com/DietrichGebert/ponytail, MIT): the
    smallest complete change, a test for risky logic, never cut
    validation, data-loss handling, security or accessibility. Its skill
    is vendored at `.claude/skills/ponytail/` (CLAUDE.md wins where they
    disagree; the long why-comments stay).
    - **Audit.** Eight agents in four areas (data and sync, trust boundary,
      views, build and lean), each finding attacked by a skeptic: 21 kept
      (1 must, 10 should, 10 nice), 2 disproved. Report:
      https://claude.ai/artifact/XGt7KJMdwNKKXFYkEXPCkP.
    - **Fixed, each with a test that fails before and passes after:**
      - a push no longer rolls the local edit clock BACK (`markRemoteSeen`):
        a save that landed mid-upsert used to be pushed with the older
        stamp, so another device's older edit beat continuous typing;
      - a copy received from the server is not salvaged (fingerprint `h` in
        the meta row), so a collaborator's arrivals no longer push the one
        offline copy worth keeping out of the 12-slot ring;
      - a write storage refused no longer fires `saved` (store.js), so sync
        never pushes the old value under a new stamp;
      - `writeFields` reads back, so `takeSlot` never blanks a character
        field the blueprint did not store;
      - `rzp-order` refuses (502) when it cannot record the order, and marks
        the pending row failed (`attachOrder` in `_shared/razorpay.js`);
      - **§54** (`schema-54-cap-locks.sql`, RUN LIVE 22 Oct 2026; the file's own header still says not run, left alone because editing it changes the checksum): the four
        plan-cap triggers take an advisory transaction lock before they
        count, proved by a real two-connection race in `test:schema`;
      - Stage Guides built on each render no longer leak their global
        listeners (an AbortController per mount); Drive pictures share one
        in-flight download per file;
      - scriptgen's write-before-Accept `run*` exports are gone (no caller in
        the tree), `acorn` is a declared devDependency, `test:ai-desk` is in
        `test:all`.
    - **The 10 Nice findings, fixed the same day:** automatic "From another
      device" drafts capped at the newest 10 (by `ARRIVAL_PREFIX`; named
      and "Your version" drafts never touched); `locations.js` `readAll`
      passes unknown fields through like `shots.js`; a failed Razorpay
      create marks its row failed at once (`failPending`); the retired
      status bar's mount code and 13 unreferenced exports removed; one
      `download()` in dom.js, one `fmtDate`, `esc` and `escapeRe`, one
      `newId(prefix)` in `src/lib/record-id.js` for the ten models whose
      id shape was identical, one `slug()`. About 470 lines gone. Copies
      that differ on purpose (revoke timing, a BOM, other id shapes,
      CORE/landing bundles) were KEPT and named in each commit.

57. **The US / international market wave (21–22 Oct 2026).** The owner asked
    for the US market and for location pricing: India sees and pays rupees,
    everyone else dollars, at amounts the owner types in the console. Built
    as a multi-agent workflow on `us/*` branches against one contract,
    `docs/US-MARKET-PLAN.md`, then merged as `us/release`.
    - **Region:** `src/lib/region-core.js` (pure, `startlib`) guesses the
      visitor's region from the time zone and language, never a network
      call. A film carries `region` ('IN' | 'INT') on its project entry and
      the buyer's pick is `payCurrency` inside `fms_studio_prefs_v1`: no new
      key. A film with no region keeps exactly the output it had.
    - **Charging (§56, `schema-56-usd-checkout.sql`, NOT run live):** the
      client sends only a currency; INR is priced from `plans`, USD from the
      owner's `plan_prices`. Dollar checkout is OFF until the owner turns it
      on (`admin_set_usd_checkout`). An international card on a rupee order
      is RECORDED (`payments.international`, `card_country`) and shown in
      the console, never blocked (owner, 22 Oct 2026). Refunds, receipts,
      invoices and the affiliate report are per currency, never summed.
      It was written as §54, then §55; both numbers were taken on develop
      while it was being built (cap locks, budget privacy).
    - **Product:** one Final Draft writer (`screenplay-fdx.js`, lazy) with a
      round-trip test; a dollar budget with sourced US rate bands
      (`rates.us.json`), the budget's currency fixed by its first figure;
      Letter / A4 and date style follow the film; stripboard and DOOD CSV;
      India-only content (CBFC, Tamil hints) hidden for INT films and INT
      visitors, never removed from the DOM.
    - **Legal:** terms, privacy (a US / California section, later sections
      renumbered, ids kept) and refund wording match the code; the refund
      policy's substance is unchanged (owner's call).
    - **Review:** three reviewers found 18 defects (affiliate totals adding
      cents to paise, a refund panel in the wrong currency, dashboard cards
      ignoring the budget currency, a relabel that changed numbers, a Drive
      pull deleting a film's region, …); all 18 fixed and tested.

58. **One list: the rail and the page agree (22 Oct 2026).** The owner's
    screenshots showed the Pre-Production flyout and Breakdown's tab strip
    listing different things. An audit of every page found four kinds of
    drift: order (the strip kept DOM order: Breakdown, Plan, Reports and
    Contacts all read differently), labels ("Unit directory" against
    "Cast & Crew", "Write" against "Screenplay Writer", "Checklist" against
    "Deliverables"), icons and hints (two sources: section-icons.json and
    navigation.json), and tabs the rail did not list at all (Whole script;
    DPR, One-liner, Equipment; Draft, Blocking, Scene board; Budget's nine;
    Story's four steps; Script analysis; Certification and Dialogue list).
    - The owner chose to put those in the rail. A new MODULE would have
      pulled in plan-matrix, the §36 generator, test:plans and the launcher
      counts, so each is a `sections` entry of the module that owns it,
      gated with it. Story's steps are derived from story-paths.json, not
      typed twice; their icons moved there from story-model.js.
    - `pageEntries()` in navmodel.js is the one derivation; tabs.js, the
      rail flyout (indented sub-rows, the current one marked from the
      hash), the phone's Go to sheet, Screenplay's and Deliverables' own
      strips all read it. A strip on a page the rail lists is no longer
      grouped by section-icons `group`, which had reordered Reports.
    - Default tabs follow the rail's first entry (Reports opens on Screen
      Time, Contacts on Cast & Crew); every rail link carries its hash.
    - `prove:nav` compares each strip with its flyout rows (shown or not:
      Story's strip is hidden on an empty project). Run against the build
      from before this change it fails nine pages; against this one it
      passes. Verify: four EXPECTED rows for old hint words and an icon
      name. One test:schema run failed once in security-51 and passed on
      the rerun and in test:all. prove:nav's older "tools differs by
      arrival" check on story.html still races the deferred video-help
      control (2 of 4 runs here); that is not this change.

59. **UI/UX review, fixed and confirmed (22 Oct 2026).** The owner asked for
    the veluthoor ui-ux-design-review-agent to be run, its findings fixed and
    each fix confirmed, as a workflow. By the owner's choice its RUBRIC was run
    by Claude agents on the real built pages (1440 and 390, sample and empty)
    instead of the script itself, which would have sent ten truncated files to
    Gemini; its palette/animation/layout reports were not applied. Six
    reviewers raised 74 findings; triage kept 49 (2 report-only, 23 dropped
    with reasons, no blocker or high among them); four fixers worked in
    worktrees on `uiux/batch-1..4`, files never shared; two verifiers per
    batch tried to refute each fix and re-measured before and after; three
    batches needed their one retry; **49 of 49 confirmed by both**. Full
    record: `docs/UI-UX-REVIEW-2026-10-22.md`.
    - The shared measuring tool lived in the session scratchpad
      (`review-shot.mjs`): screenshots plus contrast, overflow, 390 tap
      targets, unnamed controls, console errors. Verifiers used the same one,
      which is what makes a before and an after comparable.
    - **A fix can expose an old bug the gate never saw.** Folding the edit
      log's per-scene forms took the page from 13,772px to 8,621px, and the
      Cut versions section's scroll-time lazy fill (always ~1,600px) crossed
      `prove:scroll`'s 15% jump rule. Measured on the pre-merge build first,
      then fixed by loading the 5 KB chunk after render.
    - Merge conflicts were all two sessions adding to the same place; the
      one to watch was `budget-costs.js`, where batch 4's line reintroduced
      the rupee-only `fmtINR` import that the US-market work had replaced
      with the currency-aware `glance()`. Grep a merge for re-added
      `fmtINR` / `₹` after any batch that predates the currency work.
    - The completeness critic's coverage gaps (screening.html, the
      `?stay=1` blueprints, some Settings and console tabs, print preview,
      the motion layer under a real browser) are listed in the report for the
      next pass.

60. **The receipt PDF, redone (22 Oct 2026).** The owner asked to change the
    receipt and chose three things: a branded design, the plan's year on it,
    and one page. The title stays "Bill of Supply" (the GST-correct name for an
    unregistered supplier; the owner did not pick the rename).
    - **Schema §57** (`schema-57-invoice-year.sql`, 5 checks in
      `scripts/schema-tests/invoice-year.sql`, seeded before it so the backfill
      has work). The year was on the payment since §52 and not on the invoice.
      §35's `invoices_payment_facts()` BEFORE INSERT trigger already copied the
      payment's facts, so it now copies `starts_at` / `ends_at` too;
      `issue_invoice()` is untouched. A payment that applied no plan carries no
      year. An invoice keeps the year it SOLD even after a refund takes that
      year off the account.
    - **The PDF.** Monogram tile and name over one violet rule
      (`--print-accent`, new in the `--print-*` family), the PAID badge and the
      total in the same violet and nothing else; Supplier, Billed to and Payment
      details side by side; "Plan valid 22 Oct 2026 – 22 Oct 2027"; "1-year plan
      · about ₹2.19 a day · nothing renews by itself"; the refund terms one line.
      Rendered with `page.pdf()` for INR with a year, INR without and USD: one
      A4 page each. The first render printed the title near-white (a page `h1`
      ink reached into the document) and squeezed the notes to a reading
      measure; both are reset inside `.inv-doc`.
    - `monogram()` moved from shell.js to brand.js so the rail and the receipt
      share one derivation of "FS".

61. **Sticky notes, and a short film that keeps to the short (23 Oct 2026).**
    The owner asked for Celtx-style sticky notes "I can use while writing the
    scene order or synopsis", and for a short film to follow only the
    short-film flow, "5 beats, nothing other than that". Choices: notes beside
    the Beat Sheet and Synopsis, the Scene List, the Screenplay Writer and on a
    board; colours, pin to a beat or a scene, drag to reorder, send into the
    text; the short keeps its four steps with the beats locked.
    - **No new key.** A note is a record in the Idea Vault array
      (`fms_idea_vault_v1`, already scoped, backed up, reset and synced):
      `{ id, kind: 'note', snippet, color, beat, sceneId, at }`.
      `src/lib/notes-model.js` is pure; `story.js` gained `addNoteToVault`,
      `moveInVault`, `restoreToVault`, each re-reading the array first. The
      array order is the board order. `test:notes` (30), `prove:notes` (25).
    - **The dock** (`src/ui/notes-dock.js`, lazy) sits on the right at 1100px
      and up and `main` narrows beside it (the AI Desk's frame; the Desk steps
      aside when it opens), a bottom sheet below that. `notes-button.js` puts a
      Notes button in the Story header, the Scene List toolbar and the
      Screenplay toolbar, and fills `notesPin()` slots with a chip on a pinned
      beat or scene. Gated like the Idea Vault (`guard('idea-vault')`).
      Controls carry `data-nt`, never `data-st` (Story and the Scene List read
      that). "Add to the scene" and "Add to synopsis" undo from the toast; in
      the Screenplay Writer a note is copied, never inserted, because script
      types change only through `setElementType`.
    - **The board** is vault.html: notes and clippings in one grid, filters
      (All, Notes, Pinned, Clippings, a colour), drag by the grip or arrow keys
      on it. Moves are offered on the unfiltered board only.
    - **Five note stocks** in tokens.css (`--note-*`, ≥ 12:1 for the ink).
    - **The short film.** `effectiveFramework()` is always `short_five` for a
      short: no picker, the five beats, the short blueprint's step-04 answers
      beside them (the feature-only condition was removed). Steps written under
      another beat sheet are kept and wait in Unassigned. No sample (both are
      Save the Cat! features) and no feature wording; the Save the Cat video
      left `step:short/step-04`. The rail's Story flyout reads the open
      project's path (`navmodel.js` had read `PATHS.feature` every time).

62. **The Celtx gaps: beat colours, beat ↔ scene sync, a shared beat sheet
    (23–24 Oct 2026).** The owner asked to finish what Celtx has before the
    script that the studio did not: colouring beats, beats kept in step with
    their scenes, and editing the beat sheet together. Built by a multi-agent
    workflow (two builders, then two rounds of three testers, a skeptic per
    finding and a fixer); 17 findings confirmed and fixed, 2 judged by design.
    - **Colours.** `setStepColor` (story.js), names from `notes-model.js`
      `COLORS`, `--note-*` tokens. Stored on the step only; the Scene List row,
      the index card and the beat board chip derive it (`stepsByScene`).
    - **Beat ↔ scene sync.** Pure `src/lib/step-scene-sync.js` `plan()` over a
      `synced` baseline on the step (and `syncedBeat`, `syncedWas`): push, pull,
      conflict, adopt, apart, gone. `reconcileStepScenes()` writes only when
      something differs. The send writes the full text. A conflict shows on both
      pages with a choice and an Undo for both sides; a binned scene offers
      Restore / Send again; a locked outline is never rewritten; a pair that
      never agreed (the samples, old breakdown steps) is left apart. Both pages
      redraw on a write in another tab or window (`onWriteElsewhere`), so a
      stale field never saves over a newer edit.
    - **Shared beat sheet.** Pure `src/lib/story-merge.js` (steps and marks via
      `mergeElements`, a step's colour merged on its own, the prose by `pick3`
      with both texts kept in `sourceConflicts`, every unknown field carried).
      cloud.js has one `COEDIT` table for `script` and `story`, still behind
      §49's switch; a push carries `_sync` so a delete by the other writer stays
      deleted. story.html handles arrivals (`cloud:incoming` flushes typing
      first) and shows presence (`src/ui/story-presence.js`). Found on the way:
      `coEditingKnown` was missing from `window.StudioCloud`, so the Screenplay
      Writer never merged on the page even with the switch on.
    - Tests: `test:step-sync`, `test:story-merge`, `test:cloud`, `test:presence`;
      proofs `prove:beat-sync`, `prove:story-coedit`.

63. **The marketing and conversion pass (26 Oct 2026).** The owner asked for
    every marketing strategy the product can carry, built fully, so that as
    many visitors as possible buy. Owner decisions: a 3-day whole-studio trial
    and the founding-price rise moved from 31 Oct to 31 Dec (both console
    steps, `docs/LIVE-STEPS-2026-10-26.md`), comparison pages vs Celtx and
    Final Draft (facts only), schema for funnel + traffic source and for
    testimonial consent, no gift licences. Built by two workflows of lanes in
    worktrees, each lane challenged by two refuting reviewers with one retry.
    - **Attribution.** Pure, import-free `src/lib/attribution.js` (startlib):
      `?ref=` and `?src=` / `utm_*` kept in sessionStorage
      (`fms_attrib_session`, no localStorage key) and carried to purchase.html,
      where the code box is prefilled and the ref cleared on a paid order or a
      REMOVE. Referral links from shared documents (`/start?ref=`) no longer
      lose the code.
    - **Funnel + source (§58).** Ten steps (adds `trial_start`, `sample_open`,
      `signin_done`, `plan_view_in_app`) per bucketed source; `bump_event` keeps
      its one-argument form. `sourceBucket()` in funnel.js is the ONE contract:
      fixed names plus prefix families (`ig-*`, `yt-*`, `school-*`, `fest-*` …),
      never a slug, never `utm_campaign`. The playbook's tags follow it.
    - **Testimonial consent (§59).** Members write their own; nothing is shown
      until the owner approves in the console; Settings lists one's own with
      TAKE IT BACK (`SETTINGS_ROUTE_WIRED`), revocation and account deletion
      land in a takedown queue. Approved quotes are still copied by hand into
      `testimonials.json`.
    - **A pressed trial follows the scope (§60).** `start_trial()` forced
      `src='signup'` trials to `sample`; it now reads `billing_settings.trial_scope`.
      `trial_offer()` gains `trial_scope`. Public copy still names no scope
      (`test:marketing` fails a trial or sample sentence that claims every
      module or the whole studio): a scope sentence must be true under every
      console setting.
    - **Public site.** Seven guides, a guides index, two "Switching from
      Celtx / Final Draft" pages (competitor rows render only when the owner
      has read the source: `status: "read"` in `marketing-compare.json`; the
      sources could not be fetched from the sandbox), a trust page, JSON-LD,
      the trial length read from `trial_offer()` at runtime
      (`data-trial-length`, grammatical at any length), the e-mail capture
      form (hidden until `lead.live`, which waits on the owner's privacy
      paragraph), a student band (names no code until `student.live`; the
      purchase page's education band reads the same flag).
    - **In the app.** Upgrade nudges name the next plan and the difference
      price; a dashboard referral panel with copy and WhatsApp share
      (`&src=referral`); a "Made with" line on every PDF export bar Pro;
      Settings "What's in my plan"; a changelog drawer ("What's new" in the
      avatar menu); a "Choose a plan" checklist step; trial-ending reminders
      scaled to the trial's length. `prove:conversion`.
    - **Playbook.** `docs/MARKETING-PLAYBOOK.md` and `docs/marketing/`
      (e-mail series, ad copy, outreach, content calendar), `social/CAPTIONS.md`,
      posters regenerated. Dates and the trial length are placeholders read
      from the console on the day of posting. Claims checked against the code:
      the budget starts from an INDICATIVE rate card, and only the figures
      re-read against a public page carry a source.

64. **Site hygiene against "the 20 signs of a vibe-coded website" (27 Oct
    2026).** The owner shared a reel listing them; the built site was checked
    item by item. Already true: own domain in every canonical and OG URL, a
    404 page, distinct titles, meta descriptions, OG images, JSON-LD, one h1
    per public page, `lang` on every page, alt on every img, no source maps,
    robots.txt open to every crawler (AI ones included) with the sitemap
    linked, and a ~32 KB first paint on the public pages. Fixed:
    - the domain root (`index.html`, the gated hub) was an empty `#app` in
      View Source with no canonical. It now carries a static h1, one sentence
      and links to start/pricing/guides, and a canonical to `/start`; the
      hub's `render()` uses `replaceChildren`, so members never see it;
    - the 25 studio shells were indexable. The `fms-indexing` plugin in
      `vite.config.js` gives every `#app` page except `index.html` a
      `noindex` (unless it already states robots) and every page an
      apple-touch-icon;
    - `public/llms.txt`, generated by `make:marketing` from the public pages'
      own titles and descriptions (drift-checked by `test:marketing`), and
      named in robots.txt;
    - `public/favicon.ico` (16/32/48 PNGs in an ICO; `npm run icons` writes it);
    - Organization JSON-LD on about.html and contact.html (`orgLd()`).
    Guard: `npm run test:site` (`scripts/test-site-hygiene.mjs`, in CI after
    `build:verify`) reads the built markup and fails on any of the reel's
    tells; proved red by stripping the canonical, a noindex and llms.txt.

65. **The launch week pass replaces the public free trial (27 Oct 2026).**
    Owner decisions: a paid week of the whole studio (Pro), ₹49 today and
    editable in the console (₹99 or any figure, quick-set buttons), once per
    account, no credit toward a yearly plan, sold as a LAUNCH OFFER with a
    real deadline and an optional real cap; when it ends the pass closes
    entirely and only the yearly plans remain. Invite codes keep their free
    trial. Built in three lanes on one contract, `src/lib/pass-offer.js`
    (pure, startlib: the server's `pass` block, a countdown on the SERVER's
    clock, fails closed).
    - **Server (§61, `schema-61-week-pass.sql`).** Period `'pass'` on the
      existing `pro` plan, priced from `billing_settings.pass_*`; `quote_pass`
      refuses disabled / closed / inr_only / used / has_plan / code; a paid
      pass is always activated even if the cap filled meanwhile; a yearly
      purchase replaces a running pass from now (no credit, no stack); passes
      stay out of founding seats, referral payouts and refund→trial;
      `rzp-order` now returns `{error, reason}` for every refusal. **The free
      trial is not switched off** (`trial_enabled` stays true, because
      `trial_active()` carries the §30 grandfathered members); `start_trial()`
      refuses a `signup` trial with `reason: 'pass'` while the pass is on.
      57 schema checks in `week-pass.sql`.
    - **App.** `pass-view.js` (state, may-buy, refusal sentences);
      `buyPass()` / `passOffer()` in billing.js; invite.html leads with the
      pass (signed out, the intent survives sign-in as `stashPlan('pass')`);
      the wall offers the pass above the plans; pass-ending reminders at 24h
      and 2h; "PASS ENDS IN" on the rail; a pass card on purchase.html; the
      console's "Launch pass" block (live line, price with ₹49/₹99 quick-set,
      days, plan, deadline in IST, cap, sold/left). `pass_buy` funnel step.
    - **Public site.** One hidden launch band (`passBand()`) on start,
      pricing, product, guide, switching and trust pages, filled at run time;
      the static HTML holds no figure, date, count or clock (`test:marketing`
      asserts it). Every public free-trial mention is gone; FAQ: "Is there a
      free trial? No." Legal passages in terms §3/§4/§5/§7, refund and
      privacy are DRAFTS awaiting the owner. Playbook, e-mails, captions and
      posters rewritten around `{PASS_PRICE}` / `{PASS_ENDS}` / `{PASS_LEFT}`.
    - Owner steps: `docs/LIVE-STEPS-2026-10-27.md`.

66. **A clean slate, and auto-renew as a console choice (27 Oct 2026).**
    - **Purge before launch.** The app never launched, so every account is a
      test account (owner). `supabase/schema/patches/purge-test-data-2026-10-27.sql`
      keeps exactly one admin, `arunkumarmohanans@gmail.com`, and removes
      everything else: other accounts and their work, every payment, invoice,
      refund and referral credit (the keeper's too), funnel counts and leads,
      invite/promo codes, requests, testimonials, support and audit records.
      Plans, prices, billing settings and the announcement are untouched. Three
      parts (PREVIEW, PURGE in one guarded transaction, READ-BACK), each with
      its own checksum; it refuses unless exactly one keeper exists and the
      role is `postgres`, and refuses when a public table is unclassified, so
      a new table must be placed on its lists. `scripts/schema-tests/purge.sql`
      seeds every user-linked table, runs the REAL file and scans every uuid
      and text column for a deleted person; it runs LAST in `test:schema`.
      Invoice numbering restarts at 000001 — lawful only because every
      invoice so far was test mode. `.env` `VITE_ADMIN_EMAILS` names the
      keeper only.
    - **Auto-renew (§62).** The owner reversed §18's "no subscription model"
      as a CHOICE: `billing_settings.pass_mode` / `plan_mode` are `once`
      (default, today's behaviour byte for byte) or `renew`, set in the
      console; the buyer sees only that mode. Razorpay Subscriptions:
      `rzp-subscribe` (lazy Razorpay plan per product/period/amount in
      `rzp_plans`, so a console price change never touches an existing
      subscriber — the price lock), `rzp-cancel` (cancel at cycle end: access
      runs to the end of the paid period, no pro-rata refund), `rzp-verify`
      checks `HMAC(payment_id|subscription_id)`, `rzp-webhook` applies every
      `subscription.charged` through `apply_subscription_charge` (idempotent
      on the payment id; one `payments` row and one invoice per charge; a
      renewing pass stacks its days). An upgrade under renew mode is paid
      once (reason `upgrade`: a subscription cannot carry upgrade credit).
      The launch deadline and cap close the pass to NEW subscribers only.
    - **Copy follows the mode.** `src/lib/offer-terms.js` (pure, startlib)
      is the one wording of renewal terms; the public pages hold empty
      `[data-offer-terms]` slots and hidden `[data-mode-answer]` FAQ answers
      filled from `trial_offer()`'s `plan_mode` / `pass.mode`; an unknown
      mode says neither. `test:marketing` fails a renewal claim typed outside
      a slot. Legal passages are DRAFTS awaiting the owner.
    - **prove:gate's false "0ms".** The veil recorder stopped ticking once
      `<main>` had text, and index.html's static crawler summary has text
      before the gate marks the page pending; it skips `main.hub-static` now
      and keeps ticking until the veil is recorded.

67. **Full-app QA, fixed and re-verified (25–27 Oct 2026).** The owner asked
    for the whole app to be tested as QA, every bug fixed and re-verified, and
    the result released to `main`. One Workflow script: 8 areas (Story,
    Screenplay, Breakdown, Schedule & reports, Visualize & post, Budget &
    money, Account & business, Public site & shell) × 2 testers with different
    angles per round, 1–2 skeptics per finding, then one fixer per area in
    turn in the main checkout. Four rounds (the cap; the fourth still found
    new items, so it never ran dry).
    - **Counts.** 422 confirmed (145 bugs, 167 UX, 110 polish; 18 high, 144
      medium, 260 low), 49 refuted, 394 fixed, 29 declined with a reason
      (`docs/KNOWN-ISSUES.md`, "Left open by the full-app QA"). Per round:
      126, 135, 84, 77 confirmed. Every high was fixed; the two found in
      round 4 (a >64 KB script arriving from another window was dropped and
      then overwritten; the receipt PDF from the Purchase page printed the
      whole page) were fixed in round 4 and are covered by `prove:script`
      section 23 and `test:account-r4`, not by a fifth round of testers.
    - **Shapes worth keeping.** Focus after a redraw goes to the control's
      replacement, never `<body>`, and never with a scroll that moves the
      page away (breakdown). Undo restores only what it wrote and refuses
      when the text has moved on since (note → synopsis). A page that reads a
      blob once and saves it later must re-read first (drafts.html). A fixed
      delay in a proof is a race: wait for the signal (`prove:nav` waits for
      `data-vid-help-pending` to clear, which is the Story-page flake fixed).
    - **Copy.** The public header and footer say "Sign in", not "Log in";
      the Catalog product is named "Elements" everywhere; the sign-up modal
      says "Sign up to start your trial". The legal pages changed only in that
      shared frame. The Pro plan's seed blurb reads "no cap on films, links or
      collaborators" (the seed is `on conflict do nothing`, so the LIVE row
      keeps its old text until a schema section updates it).
    - CI now also runs `prove:notes`, `prove:beat-sync`, `prove:story-coedit`
      and the other proofs that had been left out.

68. **Everything the repo could finish after the QA (28 Oct 2026).** The owner
    asked for every pending item that the local repo can do, and decided four
    things: finalize the legal DRAFTs; beat pages use the target length if set,
    else the script as written; a film made outside India hides India-only
    budget items; and build the three small extras. One workflow, eight lanes
    in pairs, two skeptics per lane, one repair (lane B).
    - **Legal.** privacy, terms and refund have no DRAFT left and are dated
      28 October 2026. Every passage was checked against §59–§63 and the
      code; what depends on a console switch or an unrun section is worded
      conditionally ("while the launch pass is on offer", "we may also
      e-mail you a reminder"). `test:marketing` now fails on a DRAFT marker
      and on a "Last updated" date that differs from the "What changed"
      heading. `lead.live` stays false: privacy #leads is final, so the owner
      may flip it; `student.live` waits for STUDENT50 to exist.
    - **Beat pages.** One pure `beatPageBasis()`; both the beats panel and
      Script analysis name their basis in one line. A cold Script analysis
      reads the target first (the repair).
    - **Dollar budget.** `showIndia()` (the Tamil-typing rule) hides GST, TDS,
      GSTIN and the FEFSI wage material; Batta and UPI display as Per diem and
      Bank/card. Stored ids and values are unchanged. The CSV exports keep their
      fixed header (KNOWN-ISSUES).
    - **Cast Matrix and Screen Time** each have one Export menu: print, PDF
      and CSV.
    - **Clippings** cut at `VAULT_MAX` carry `cut: true` on the vault record
      (no new key), and the card says so.
    - **The beat-note line** follows a note written in another window or
      synced, and never redraws under focus (it waits for blur).
    - **QA leftovers.** Empty-state focus, plan.js plurals, the import copy,
      an Undo for float and payment deletes, plus browser proofs for the
      breakdown, the edit log and the estimator print.
    - **§64** (`schema-64-pro-blurb.sql`) updates the live Pro blurb. It is an
      owner step, with its checksum in `docs/LIVE-STEPS-2026-10-27.md`.

69. **The 8B revamp, and its final QA fix pass (28 Oct 2026).** The owner
    asked for the whole site, public pages and studio, to read as ONE
    professionally built template product: a consistent grid and type
    scale, restrained colour, one obvious primary action per screen, plain
    short copy, features kept but presented simply. One foundation commit,
    four lanes (public, shell, writing, production) merged into `develop`
    in that order, then a QA round and this fix pass.
    - **Palette: the "dark only" rule is REVERSED, on purpose.** The 14 Oct
      Swiss Precision palette (obsidian ground, dark only) is replaced by
      the 8B template mix: bare `:root` is the LIGHT work surface (canvas
      `#f4f3f8`, white cards, near-black inks) and a class-scoped DARK SCOPE
      (`.sh-rail`, `.sh-bar`, the phone bar and sheets, `[data-surface="dark"]`)
      restates the same token names for the rail, the band and the public
      site's dark bands. ONE violet (`#6c3cff`). Still one palette and no
      toggle: `fms_studio_theme_v1` is read, never written. verify's
      scripts-off probe now expects the light canvas under both OS
      preferences; that was changed deliberately in the foundation commit.
    - **Fonts.** Gabarito (headings) and Onest (interface) self-hosted from
      `@fontsource`, with the template's metric-matched fallbacks. Courier
      Prime stays for screenplay text and the Tamil face stays LAST in
      `--f-script`. JetBrains Mono is now DATA only (eighths, timecodes,
      DOOD codes, INT/EXT tags, slugs, money columns).
    - **Tailwind v4 is the public site only** (`src/styles/site.css` via
      `@tailwindcss/vite`, `source(none)` scanning the public pages, `@theme
      inline` mapped to the tokens). Studio pages are styled through
      `tokens.css`, `skins/studio.css`, the kit and page CSS: 41k lines of
      unlayered CSS would beat layered utilities.
    - **Motion.** The bundled `motion` package (`motion/mini`): public
      headings rise in and cards stack on scroll, studio panels and lists
      move subtly. Every translate is multiplied by `--motion`; nothing
      moves under `prefers-reduced-motion` or the device's own Reduce
      motion switch; pages read fully without JS. `motion-app.js` is still
      inert under `navigator.webdriver`, so motion was checked by hand with
      it hidden (no page errors; only the sandbox proxy's
      `ERR_TUNNEL_CONNECTION_FAILED`).
    - **Templates and licences.** 8B design-studio template (MIT) is the
      code base; its notice is in `docs/CREDITS.md`. Cruip (GPL-3.0) was
      LAYOUT INSPIRATION ONLY: no code, markup or class list was copied.
      The UI UX Pro Max rulebook was used from the scratchpad but is NOT
      vendored into `.claude/skills`: its `package.json` says MIT and its
      README says CC-BY-NC-4.0, and a non-commercial licence cannot be
      checked into a commercial product's repo on a guess. The owner can
      vendor it once the licence is settled.
    - **Removed or moved by the lanes.** Dashboard: the closed Project
      overview, the favourite-film line, the "Project dashboard" chip, the
      "Boarded shots" figure. Rail flyouts: section rows (sections live in
      the page's tab strip; `prove:nav` compares exactly that). Band: purpose
      lines and the "Studio" root crumb. Rail: the 64px icon column became a
      labelled 224px sidebar. Hub: the "ACTIVE" tag. Story: "Clear synopsis"
      into a More menu. Library: the "N SHELVES" pill and the ▶ glyph. Plan
      recce card: 7 answers behind "More details" (still in the DOM and in
      print). Budget: the who-can-see paragraph into a disclosure. Public
      home: the facts, exports and four-answers blocks. Public header and
      footer: Guides and Switching into the Product menu, a 3-column footer.
      Pricing: 9 FAQ questions cut (21 to 12), the comparison table
      collapsed. Product pages: the label bar and the duplicate tools block.
    - **The fix pass (QA findings).** ONE FILL: every selected, active,
      pressed and progress fill is `--brand`; a phase hue is a mark only
      (rail dot, 3px rule, icon tile wash), and a selected tab is a tint
      (`--brand-wash` under `--brand-deep`). About 300 mono-caps LABEL rules
      moved to Onest, sentence case, normal tracking, by a block-level
      rewrite that skipped data selectors (slug, tag, eighths, numbers,
      DOOD, codes, time); the band's "[FEATURE]" is a small badge. The
      first-run doors are three equal kit cards with one primary. The
      dashboard: the h1 is the film's title, ONE Continue card (the
      "Suggested next" row only when it names another stage), and the
      readiness list, all tools and the title page behind `details.db-more`
      disclosures; `revealTarget()` in `tabs.js` now opens a closed
      disclosure around a fragment target, so `dashboard.html#title-page`
      still lands. The readiness eyebrow no longer runs into its heading.
      Phones: one navigation entry (the band's rail toggle is hidden under
      `html.mn-on`; Go to carries the navmodel), the crumb in Onest, a
      compact stat strip. The save state sits in the band beside the crumb.
      `fragments.js` moves FOCUS with an in-page jump, so "Skip to content"
      works for a keyboard. Plan's permission chips take `-deep` inks (they
      were 2.15–2.54:1). Dialogs carry `aria-describedby`. Dingbats in UI
      chrome (✓ ✕) are Material Symbols. At most three glossary terms per
      section. Visualize's shot table and the scene board's Shots table fit
      their panels again beside the 224px rail. Public: the analytics
      opt-out is in the footer's legal row; veiled sections are restored for
      print and after an 8s backstop; the device Reduce-motion switch is
      honoured (`src/lib/device-motion.js`, read-only, import-free); 44px
      targets under a coarse pointer; the header reflows at 320px; videos
      have an accessible name; two h1 tiers (76px display on home and
      product pages, 60px elsewhere, pricing included); the contact hero
      leads with "Write to us". `npm run density` had a hard-coded macOS
      path and now resolves the repo itself.
    - **Tests changed, each a layout or wording-shape update, none a
      weakened behaviour check.** `prove-story-path` opens the dashboard's
      "Project details" before filling the Title page; `prove-schedule`
      reads the launcher's "days dated" through `textContent` (it sits in a
      closed disclosure); `prove-budget-money` 19 matches the sentence-case
      stat labels case-insensitively; `prove-shell-a11y` keeps only the
      "not mapped to every step" half of the library cover check (the word
      "craft-book" left with the copy rewrite); `test-region-content` reads
      the sentence-case setup question; `prove-conversion` uses
      plan-gate's documented `__fmsKeepWall` hook for the wall's and
      Settings' own wording and gains two checks that a walled member is
      SENT to purchase.html and offered the pass there (the "one payment
      page" commit 0c92506 had made five checks stale before the revamp);
      `test-marketing` allows the import-free `device-motion.js` and
      asserts it never writes. `scripts/baseline.json` was re-baselined
      deliberately: the dashboard lost "go, next, stands, suggested" (its
      sub line and the duplicate suggestion), no data-key was lost (851).
