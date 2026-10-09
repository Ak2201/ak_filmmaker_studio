# Build history — the open items, as they were worked

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
   a long time that `supabase-schema.sql` had never met a database, and that
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

15. **The screenplay writer (6 Oct 2026): `docs/SCREENPLAY-WRITER-PLAN.md`,
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
    scenes (6 Oct 2026): `docs/BLUEPRINT-REALIGN-PLAN.md` revision 3,
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
    and 30 of 31 Low items in `docs/UX-AUDIT-2026-10-06.md`, struck
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
    `docs/HANDOFF.md`, `docs/WIP.md` and `docs/BRANCHING.md` record it.

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
