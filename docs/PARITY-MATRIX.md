# Parity matrix: mobile and desktop prototypes against the app

> Generated 14 Oct 2026 by the audit stage of the mobile-and-revamp workflow (`docs/PROMPT-FOR-NEXT-PERSON.md`, stage 1).
> Source: the audit JSON for this stage. Stitch sets: desktop `stitch_film_making`, mobile-1 `m1`, mobile-2 `m2`.
> Column meanings: **mobile proto** / **desktop proto** = the feature appears on that prototype screen;
> **app web** / **app phone** = the feature exists in the app at desktop width / below 720px.
> **bin**: `ok` = already in the app, no action beyond restyling; `a-fix-layout` = in the app but missing or wrong in one layout, fix;
> `b-derivable-build-both` = derivable from current data, build for both layouts; `c-ask-owner` = needs data or a new feature, owner decides.
> Rule: only placement differs between layouts. Evidence cites the code that backs the row.
> Pipes inside evidence text are written as `/`.

Legend for the table: yes = present, no = absent.

## dashboard (per-project page: dashboard.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Project head: title (Playfair), format/stage chips, deck line | yes | yes | yes | yes | ok | renderHead() in src/pages/dashboard.js; one responsive codebase, no phone hiding rule |
| Six-tile KPI strip (scenes, pages, shoot days, crew and cast, boarded shots, budget) | yes | yes | yes | yes | ok | statStrip in renderHead(); prototype mobile shows 2-col grid, app grid collapse is kit.css territory (layout pass, not a missing feature). Sub-captions in the mobile proto are separate rows below |
| KPI sub-captions: 'Locked 100%', '22 signed', 'Day 4 next', '105 script pp' | no | yes | no | no | b-derivable-build-both | Mobile screen.png tiles carry a second line; app stat() has value+unit only. Day-next from snap.days+localDay, signed from contacts, script pages from loadScript; 'Locked' only if lock flag is real |
| Budget tile '88% Allocated' | yes | no | no | no | c-ask-owner | No allocation/target budget stored (fms_costs_v1 holds spend lines); would need a budget ceiling field. Hide |
| Slate subtitle 'Principal Photography Prep · change' and ID '#DRG-24' | yes | no | no | no | c-ask-owner | No project subtitle or short id field on the project record; project-id exists but is an internal uuid-like string. New field or drop |
| Favourite film chip / line with change link | no | yes | yes | yes | ok | p.st-fav in renderHead() visible at every width; mobile proto omits it, app keeps it (parity favours keeping) |
| Continue card: what you were doing + Continue button | yes | yes | yes | yes | ok | renderContinue(), #resume; .db-focus single column below 1100 presumably |
| Continue card progress bar with 'N% completed' and scene chips (Ext/Night, 2/8 pgs) | yes | yes | no | no | b-derivable-build-both | Proto shows '18 of 36 scenes tagged' + meter; app Continue shows only a text line + 'edited N ago'. Stage guide meter and tagged-scene counts are derivable (journey.js, breakdown element tags). Scene-specific resume (Scene 14) is not tracked: derive only the stage-level figure |
| Suggested next box inside Continue card (stage + go-to link) | no | yes | yes | yes | ok | #suggested in renderContinue(); mobile proto folds it into the lifecycle list's SUGGESTED NEXT label, app keeps both |
| Readiness summary: score 9/12, segmented bar, top fixes with 'Fix it' links | yes | yes | yes | yes | ok | renderReadyTile() + db-seg/db-score; at <=480 .db-fix stacks, Fix it link goes to full width |
| Readiness footer 'Camera test in 48 hours' / 'Updated 14m ago' | no | yes | no | no | c-ask-owner | Camera test is an event type that does not exist in the calendar; readiness is computed live, so 'updated' is always now. Hide |
| Full 'Could you shoot tomorrow?' list with passing checks as ticks | yes | yes | yes | yes | ok | renderReadiness() #readiness; proto's 4 sample checks are hand-written, app derives all from readiness.js. Proto mobile adds '75% Ready' figure and expected-date column: percent derivable from pass/total, the rest not |
| 'NN% Ready' badge on the shoot-tomorrow block | yes | yes | no | no | b-derivable-build-both | readiness().checks passed/total; app shows 'N/M checks pass' in the tile but no percent on #readiness section |
| Five stage cards with status, guide/tools meters, facts, open button | yes | yes | yes | yes | ok | renderStages() li.st-card, #stages #stage-*; mobile proto is a vertical Part I-V list with Locked/In progress/Queued badges, app has the same cards stacked |
| 'Step 3 of 5' lifecycle counter and 'Locked' state badges on done stages | yes | yes | no | no | b-derivable-build-both | App shows Done/Doing/None words; 'Locked' derivable from story outline lock + screenplay draft lock (lockedWhen, Drafts), counter from journey.js current index |
| Chain: Scene to call sheet cards (breakdown, stripboard, visualise groups with counts) | no | yes | yes | yes | ok | renderChain() four groups, more detailed than the proto's three. Mobile proto shows only three icon shortcuts inside the Next Shoot card; app chain covers them |
| Next shoot card: day, location, setup, crew call, 'View call sheet' link | yes | yes | yes | yes | b-derivable-build-both | renderWeek() shows day, date, scene count, call sheet made/not, report state. Location (first scene location), crew call (call sheet record) and a direct 'View call sheet' link are derivable and absent. Setup 'Rain FX Rig' is not data |
| Quick-link trio on the Next Shoot card (Breakdown, Stripboard, Visualise) | yes | no | yes | yes | a-fix-layout | Present as chain cards + launcher in app at all widths; only placement differs from the mobile proto. Optional shortcut row, not a missing feature |
| Recent activity log | no | yes | yes | yes | ok | renderActivity() #recent; app copy honest about what is logged. Proto's 'by Arun / Maya / System' author attribution is not stored (single-user log): do not add |
| Plan tile (tier, usage bar, Manage plan) | no | yes | yes | yes | ok | renderPlanTile(); lacks cloud storage '14.2 / 50 GB' bar and 'Team collaborators 4/10', 'IndexedDB cache synced (128MB)' |
| Plan tile: cloud storage meter, collaborator count, cache size | no | yes | no | no | c-ask-owner | No storage-quota or collaborator-seat model in the client; localStorage size is measurable but is not 'cloud storage'. Collaborators exist in account_members (item 5, unrun live). Ask before showing |
| Backup and Vault tile: Google Drive status, 'Force Sync' | no | yes | yes | yes | b-derivable-build-both | renderBackupTile() shows Drive status and an 'Export a backup' link; a Sync now button exists in drive-sync.js and Settings but is not on the tile. 'Automatic snapshot every 15 minutes' is not a real behaviour; do not copy |
| Console Directory: every module by phase with per-module status dots and legend | no | yes | yes | yes | ok | renderLauncher() from ui/launcher.js; on phone the bottom bar Go-to sheet carries the same index |
| Status bar telemetry: IndexedDB cache, gateway operational, 14.2 GB storage | yes | yes | no | no | c-ask-owner | App has a real-data status bar (shell); gateway and telemetry figures are unmeasurable. Hide or show only measurable (sync state, local size) |
| Bell/notifications, Sync pill, avatar in top bar | yes | yes | no | no | c-ask-owner | Sync pill and avatar exist in shell sign-in pill; no notifications model exists, so a bell is a new feature |

## hub (projects hub: index.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Hub (index.html) has no matching prototype screen | no | no | yes | yes | ok | No code.html or screen.png in the three Stitch sets targets the projects hub; the dashboard prototypes cover the per-project page only. Hub (src/pages/hub.js: three doors, project cards, resume cards, shelves, backup menu, NEW PROJECT) stays on the kit restyle pass; hub-projects.css has width media queries and only hides the hover pulse on touch (cosmetic) |
| Project cards grid, new project, backup menu, resume cards, shelves | no | no | yes | yes | ok | hub-projects.css: grid 3 -> 2 (<=1100) -> 1 (<=640); no display:none of any control at phone width |

## story (story.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Header actions: Import .fdx/.docx, Export Synopsis .txt, Beat Matrix PDF, Generate AI Coverage | yes | yes | yes | yes | a-fix-layout | story.js draw(): Import (.txt/.md/.docx/.pdf), Synopsis .txt, Outline .md, Start over in pageHeader actions. Proto's .fdx import is not supported (do not add); Beat Matrix PDF equals the Pitch deck PDF; AI coverage equals Map with AI. Placement only: proto puts them in a scrolling chip row on phone |
| Stage navigation: Idea, Logline, Bible, Scene order, Outline, Pitch deck, Beats and pacing | yes | yes | yes | yes | ok | renderStepper()/tabs-has-side: left column on desktop, strip on narrow; mobile proto's scrolling chip row matches |
| KPI strip: Structure coverage 15/15 beats, Character arcs, Climax tension, Script reconciliation, Canon framework | yes | yes | no | no | b-derivable-build-both | No statStrip in story.js. Beats tagged N of 15 (renderDeck already prints it in pc-deck-meta), max tension from beat tension scores, framework label from Story.frameworkById, characters count from fms_characters_v1, page total from pageCount(). 'Locked'/'Optimal Surge'/'100% in sync' wording only if backed by real flags; arcs 'Main + 3 sub' is not data |
| Dramatic tension curve with act bands, beat dots, convention overlay, legend | yes | yes | yes | yes | ok | PacingView.renderCurve(): This story vs convention, Scored by hand, Placed by tagged passage; phone plot 200px. Proto's 'Emotional stakes' second line and 'Climax shockwave' marker are not data |
| Curve 'Re-Calculate' button / 'Real-time' badge | yes | yes | yes | yes | ok | Curve is derived at render, so no button is needed; stated as parity-by-design |
| Scene-by-scene intensity distribution with Low/Moderate/High/Peak legend | no | yes | yes | yes | ok | PacingView.renderIntensity() strip + shares; plus detailed heatmap in details.pc-more. Proto's 'Pacing Score 94/100' is invented; app has renderFlags() pacing flags instead |
| Pacing check banner (healthy rising action, no slack in Act II-B) | no | yes | yes | yes | ok | renderFlags(s) in renderPacing(); derived flags |
| 15-beat deck: number, act tag, title, page target, tension meter, tagged passage, scene link, 'In synopsis' and 'Open in script' | yes | yes | yes | yes | ok | PacingView.renderDeck()/pc-card; .pc-card-foot wraps. Proto 'Jump to Script' = 'Open in script' |
| Adjust tension (stepper -/+ and 0-100 slider on the beat card) | yes | yes | yes | yes | a-fix-layout | Tension field with label 'Tension' per beat in the tagged-synopsis beat list (story.js ~826) and scored value in pc-card meter; the +/- stepper UI on the deck card is not there: deck card shows a read-only meter, editing happens in the Synopsis step. Make the deck card link or inline-edit on both widths. App scale is 0-10, proto mixes 0-10 and 0-100: keep 0-10 |
| Beat filter 'All Acts (15)' and 'Sort by Act' | yes | yes | no | no | b-derivable-build-both | Deck is a fixed list in framework order; fw.beats has region per beat, so an act filter is a pure view change |
| 'New Beat' / 'Add Sub-beat' / 'Append Custom Intermediate Beat' | yes | yes | no | no | c-ask-owner | Frameworks are fixed (Story.frameworkById); custom beats need a new stored shape. 'ADD A STEP' in the step outline is the existing way to add intermediate material |
| Treatment / synopsis panel with tagged passages, tension tags, word count, est. screen time, Quick Edit | yes | no | yes | yes | b-derivable-build-both | Synopsis step has editor, tag bar ('Select text, then tag it as') and beat-mark list with quotes. Word count, 'Scenes mapped' and est. runtime strip are not shown: words from s.source, scenes mapped from scene-sync/beat marks, runtime from screenplay-analysis.js screen time. 'Coverage score 94%' is not a measure: omit |
| Refine Beat and AI Punch buttons on a beat card | yes | no | no | no | c-ask-owner | AI per-beat rewrite does not exist; story-map and story-steps Desk tasks are the only AI hooks. New AI feature, ask. aiPill rules apply |
| Run AI Dramaturg Coverage / Re-analyze Pacing and Stakes | yes | yes | yes | yes | ok | renderAI() 'Map the beats with AI' (#ai-map, task story-map via aiPill). Same job under a different name |
| Export Beat Sheet (PDF) / Export Pitch Treatment (PDF) | yes | yes | yes | yes | ok | renderPitch(): 'EXPORT PITCH DECK (PDF)' (landscape deck of logline, synopsis, tagged beats, characters). A beat-sheet-only PDF is not separate |
| Send to Screenplay Writer (dramaturg dispatch) | no | yes | yes | yes | ok | 'SEND THE OUTLINE TO THE SCREENPLAY WRITER' with undo and 'OPEN THE SCREENPLAY WRITER' in the Lock/send step (story.js ~747) |
| Tested Logline Formula panel (protagonist, incident, goal, stakes) with Edit Formula | yes | yes | yes | yes | ok | Logline step: 'Your logline', 'USE THIS AS MY LOGLINE' from the blueprint ladder (story.js ~433-464). Proto's colour-coded role chips are not stored. 'Producer ready' badge and flaw/theme lines come from the Story Bible |
| Sidebar: stage list with done ticks and 2/2, 3/5 counters; Target page count 120 with logged pages and % locked; Framework card | no | yes | no | no | b-derivable-build-both | Stepper items carry done flags (STEP_ICON, done) but not counters. Logged pages from pageCount(); a TARGET of 120 has no field (ask), so show pages only. Framework note derivable from Story.frameworkById |
| Beat sheet 'N of 15 displayed' count and expand/collapse of cards (6 OF 15 EXPANDED) | yes | yes | no | no | b-derivable-build-both | pc-deck-meta prints 'N of 15 tagged · M with a scene' already; collapsible compact beat rows (mobile proto) are a layout variant of pc-card, same data |
| Synopsis fullscreen and undo icon buttons | no | no | no | no | c-ask-owner | Present only in the second desktop variant (swiss_precision_suite). Focus view of the synopsis is a new feature; synopsis undo is not modelled (only build/send undo) |
| Story Bible, Step outline, Setups and payoffs, Timeline, Cover sheet, Idea Vault link | yes | yes | yes | yes | ok | Path steps from story-paths.json, EXTRAS Beats & pacing / Pitch deck / Cover sheet; Idea Vault lives on vault.html. Proto 'Tension Heatmap STABLE' badge is not data. Variant choice: desktop = 'story_stage_beats_pacing' fits the kit and the existing column stepper; mobile = story_beats_mobile_2 matches the kit strip pattern; mobile_1 adds a pacing meter and Refine/AI Punch that need new features |

## vault (vault.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| No prototype screen for the Idea Vault in any of the three Stitch sets | no | no | yes | yes | ok | grep of every code.html finds only the dashboard's 'Backup & Vault' (Drive) tile. App vault: add clipping textarea, list of clippings with source host, date badge, 'Pin to a beat' select, 'Add to synopsis', 'Remove' with UNDO toast, extension clip queue; vault.css has only a padding rule at <720px. Restyle with kit tokens, no parity gaps |

## drafts (drafts.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| No prototype screen for Drafts in any set | no | no | yes | yes | ok | drafts.js: Title Page card, numbered draft cards (Current badge, Download PDF, Compare with, Restore as working copy), Save as new draft, Update, Back to the Screenplay Writer, compare panel; drafts.css switches to a 2-col grid only from 720px up, so phone is single column with all controls. Kit restyle only |

## screenplay (screenplay.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Scene-type chip row (Scene/Action/Character/Dialogue/Paren/Trans) | yes | yes | yes | yes | a-fix-layout | buildChips() in screenplay.js; CSS shows it at all widths (.sc-chips @720 rule) and the type select exists too. Present both. Mark ok, except the prototype's Scene/Action row also sits inside the desktop bar as a Scene Heading [Alt+1] dropdown, which is the typePill. ok |
| Current-line type dropdown with Alt+n hint | no | yes | yes | yes | ok | typePill/#scType in buildTop(); phone gets chips instead of the visible pill, but the select is still there |
| Beats toggle button + Beats panel (side column on wide, drawer/bottom sheet on phone) | yes | yes | yes | yes | ok | sc-beats action, #beatsPanel, beats-panel.js; beats-panel.css @max-width 719.98 makes it position:fixed sheet. Prototype's phone bottom-sheet look should be restyled only |
| Beats framework progress '4 / 15 linked (27%)' + meter | yes | yes | yes | yes | ok | beats-panel.js bp-progress + progressMeter, derived by deriveBeats() |
| Beat rows: name, ~page, Linked/Pending state, Jump/Focus line | yes | yes | yes | yes | ok | bp-beat rows with bp-page, bp-state, bp-go |
| Beats framework picker (Save the Cat! / Blake Snyder 15-beat) dropdown | no | yes | no | no | c-ask-owner | Panel shows d.fw.name as a label only. Story stage owns the framework choice (story.js frameworks()). Switching it from the writer is a new control, not derived: ask, or link to Story |
| Beats filter tabs All 15 / Linked / Active | no | yes | no | no | b-derivable-build-both | Every row already has linked/current from deriveBeats(); a filter is pure view. Build for both layouts |
| Per-beat 'Tension: NN%' on rows and active beat meter | yes | yes | no | no | b-derivable-build-both | story.js tensionOf(story, fw, beat) and setTension exist; hide when unset (do not default to a number) |
| Beat row 'Link Scene' (add_link) on pending beats | no | yes | no | no | c-ask-owner | Linking is done by marks in Story (addMark/tagMark). A one-tap link from the writer is a new write path into fms_story_v1; owner decision |
| Beats panel 'AI' (auto_awesome) and 'tune' icon buttons per header | no | yes | no | no | c-ask-owner | No beat-map AI action in the panel; Story has applyBeatMap. Needs a decision on whether to expose it here (aiPill) and what 'tune' opens |
| AI pill menu: Coverage report, Dialogue pass, Scene critique | yes | yes | yes | yes | ok | aiPill tasks coverage / dialogue-pass / beat-critique in buildTop() |
| Focus button in the bar (enter focus mode) | no | yes | yes | yes | ok | focus-mode.js fm-enter button moved into #scFocusSlot. Phone prototype hides it inside the more_horiz menu; placement only |
| File menu: Import (.fdx/final draft) and Export PDF | no | yes | yes | yes | ok | fileMenu sc-import / sc-pdf. Prototype names .fdx; app import reads PDF/docx per script-import.js, so label copy must stay truthful, not .fdx |
| Tools menu: Tamil typing Alt+T, Voice dictation, Format check, shortcuts | yes | yes | yes | yes | ok | menu items sc-tamil/sc-dictate/sc-check/sc-keys. Prototype 'Fn Fn' dictation hint is not an app shortcut; do not copy |
| Draft + Saved status in crumb ('Draft 2 · Saved') | yes | yes | yes | yes | ok | sc-draft / sc-status in buildTop crumb |
| Words / Pages / Est. runtime stat line | yes | yes | yes | yes | a-fix-layout | p.sc-stats exists at all widths. Prototype phone puts '105m / 18/8 pp' in the top bar and a second strip; only placement/restyle (verify it isn't clipped at 390 by a direct-load screenshot) |
| Runtime telemetry popover: Dialogue vs Action split (68m 65% / 37m 35%), words-per-second density | no | yes | no | no | b-derivable-build-both | screenplay-analysis.js screenTime() already separates dialogueWords/actionWords at 2.6 wps. Show only when script has words; omit the invented 'Standard 1:1 Spec' |
| 'On Track (95% target)' / 'Target: 110m, 5m buffer left' | no | yes | no | no | c-ask-owner | Only a hard-coded 110pp/15pp target passed to the beats panel. Reports has a target runtime and Edit Log is proposing another (open question 1 in handoff). Needs the owner's one-field decision |
| Scene position pill 'Scene 1 of 36' and phone strip 'Scene 14 (Beat: Catalyst) · pp · est.' | yes | yes | no | no | b-derivable-build-both | Current scene from caret (curId) + scene count + deriveBeats current beat + screenplay-analysis runtime; all derived. Build one status strip used by both layouts |
| Zoom control (- 100% +) | no | yes | no | no | c-ask-owner | Not in app. New feature plus a persisted pref (would sit in fms_write_prefs_v1 as one field). Ask |
| Per-line floating toolbar: Dual dialogue, Add CONT'D, move up/down, delete | yes | yes | yes | yes | ok | sc-linebar (hover on desktop) and sc-line-more menu on phone; sc-dual/sc-contd/sc-up/sc-down/sc-del all wired. Placement differs by design |
| Page break markers 'Page 2 · 18/8 pp' with scene numbers in gutters | no | yes | no | no | c-ask-owner | Page breaks exist (applyBreaksSoon); scene-number gutters and the 'N/8 pp' marker are not drawn. Handoff open question 2 lists scene gutters as build-or-leave; Alt+N 'Toggle scene numbers' needs owner nod |
| Phone: 'Coverage Estimate: 1 Setup · Steadycam · 45 mins' + Breakdown link under scene | yes | no | no | no | c-ask-owner | Setup count is derivable from shots, but 'Steadycam' and '45 mins' have no data (no per-setup time field). Could show only shot count + movement from shots; owner to decide. Link to breakdown.html#script exists as 'Go to Screenplay Analysis' at page foot |
| Phone footer status 'IndexedDB: Synced · 24.8k w · 36 sc · Courier Prime'; desktop status bar telemetry (14.2 GB / 50 GB, gateway) | yes | yes | yes | no | c-ask-owner | The app's 32px real-data status bar exists on web. Words/scenes are derivable; storage GB, IndexedDB ms and Gateway are fabricated in the prototype and must not be built (local-first uses localStorage). Mirror the real status bar on phone only if it fits above the bottom bar |

## focus mode (focus-mode.js, opened from the Screenplay Writer)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Typewriter marker Frame / Line / None | yes | yes | yes | yes | ok | focus-mode.js MARKERS + fm-marker radio group in #fm-opts |
| Session target value + unit (words / pages / minutes) | yes | yes | yes | yes | ok | fm-goal-kind select + fm-goal-target; GOAL_KINDS. Prototype shows segmented control on phone; select is fine functionally |
| Dim the rest / Night velvet checkboxes | yes | yes | yes | yes | ok | check('fm-dim') and check('fm-night'); prefs.dim / prefs.night |
| Full screen toggle (F11) | no | yes | yes | yes | ok | fm-fullscreen button in the options panel; iOS Safari has no Fullscreen API so it is CSS-only there |
| Today: +212 words, +1.1 pages badge and 7-day history grid (Week total on phone) | yes | yes | yes | yes | ok | fm-today and ol.fm-hist from the write-goals tracker. Phone 'Week Total: 1,464 words' line is derivable and not shown: a small b-item, add to both |
| HUD: Exit focus (Esc), words done / target, sprint timer, Pause, Reset, Options | yes | yes | yes | yes | ok | fm-hud: fm-exit, fm-sprint, fm-sprint-reset, fm-opts. Phone prototype shows Options as a bottom sheet; placement/restyle only |
| Top strip: 'Project: Dragon · Scene 14 — Draft 4' + progress line | yes | yes | no | no | b-derivable-build-both | Project title, current scene number and draft label are all available (Script.projectTitle, draftLabel, caret scene). Not drawn in focus mode today. The 'IndexedDB synced' pill is not real; use the existing Saved state |
| Typewriter anchor tag '33%' and phone 'p. 18 3/8', 'ACT-LN 184' gutter tag | yes | yes | no | no | b-derivable-build-both | Caret page (eighths) and line number are computable from the editor; anchor % only if focus-mode has a configurable anchor, otherwise hide it. 'Typewriter lock' label is just prefs |
| Footer 'Focus Mode Active · Typewriter Lock' + telemetry (GB, gateway, IndexedDB ms) | yes | yes | no | no | c-ask-owner | Telemetry numbers are unmeasurable here; do not build. Only the 'Focus mode on' wording is real |

## breakdown (breakdown.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| KPI strip: scenes, pages (eighths), elements (categories), locations (INT/EXT), songs, cast | yes | yes | yes | yes | ok | kpis() in breakdown.js. Prototype notes '100% Locked' and '29 Speaking Roles': locked is derivable from isNumberingLocked(), 'speaking' is not (only 'tagged') |
| Draft / 'Locked' badge in header ('Draft 4.2 · Shoot Ready' / LOCKED chip) | yes | yes | no | no | b-derivable-build-both | isNumberingLocked() and the draft label are imported; header shows neither. 'Shoot ready' only if readiness.js says so |
| Header actions: Re-measure Pages, AI Desk (Run Breakdown Again / Add Element on phone) | yes | yes | yes | yes | ok | eighths-measure button + aiPill; whole-script breakdown run lives on the Whole script tab. Phone 'Add Element' primary button has no single equivalent: elements are attached per scene (el-attach). Treat as a shortcut to the first open scene, owner ask if it should be global |
| Tab strip: Scene Breakdown, Screenplay Analysis, Whole Script (One-Click), Auto-Tag Suggestions (count badge), Songs, Elements Index | yes | yes | yes | yes | ok | tabs.js TABBED includes breakdown; sections scenes/script/overview/auto-tag/songs/elements. Only the Auto-Tag tab's count badge (12) is not shown: derivable from suggestAll(), b-item for both |
| Scene list search + INT/EXT, Time, Status filters | yes | yes | yes | yes | ok | bd-sl-bar: search, ie, dn, st selects. Phone prototype collapses filters behind a tune icon (placement) |
| Quick filters: Night Exteriors, Untagged Scenes; Expand All | yes | yes | yes | yes | ok | Built-in presets p-night-ext and p-untagged, plus SAVE THIS FILTER; sl-expand button. App also has saved filters the prototype lacks |
| Scene card: number, slug, eighths/pp, cast, 'Day N of M', expand chevron | yes | yes | yes | yes | a-fix-layout | The app renders a table row (grid columns No/Location/INT-EXT/Time/Length/Cast/Status) from scene-list.css with no phone stacking found. Mobile prototype is stacked cards with chips; handoff says table to stacked cards. Layout fix. 'Day N of M' is derivable from the stripboard day (status column shows 'Day N' only) |
| Expanded scene: synopsis, tracked musical cue (song, duration), tagged elements as category chips with remove, Attach Element row | yes | yes | yes | yes | ok | Scene detail: synopsis field, bd-scene-songlink / musical cue note, tagged element chips with x removal, bd-add-cat + el-add + el-attach. Cue duration (01:42) is not in the song record; hide |
| Collapsed scene card: category count chips (2 Cast, 45 BG Extras, Stunts Required) | yes | yes | no | no | b-derivable-build-both | Row shows only a cast text; scene.elements by category are all present. Summary chips are derivable for both layouts |
| Scene gutter menu (more_vert) and lock icon per scene; reorder, select, bin | yes | yes | yes | yes | ok | Row has drag grip, pick checkbox, move earlier/later, bin; bulk bar sl-bulk-bin; numbers lock indicated at line 1016. Phone needs the actions inside the scene menu to hit 44px |
| Element Index side panel: categories with counts + 'Batch Tag' | yes | yes | yes | yes | ok | bdx-side element index with category counts, Batch tag box (ex-batch). On the phone prototype it is a summary chips block with 'View All'; app shows it on the Elements tab (placement) |
| Export Breakdown Sheets (PDF / CSV) | yes | yes | yes | yes | ok | ex-csv / ex-pdf buttons in element index side |
| Songs tab | yes | yes | yes | yes | ok | renderSongs with song fields, planned days/locations, add/delete |
| Auto-Tag suggestions (ADD ALL / ADD THESE) | yes | yes | yes | yes | ok | sug-all / sug-scene with suggestAll() |
| Removed-scenes bin, saved filters, bulk set INT/EXT/time (app only) | no | no | yes | yes | a-fix-layout | Present in app on both layouts, absent from every prototype; must remain reachable on phone after the cards rework (bulk bar and bin are not in the mobile design) |

## visualize (visualize.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Header: Export Slate Binder + Add Setup (primary) | yes | yes | yes | yes | ok | Whole-script PDF/CSV export menu (vz-pdf-all, vz-csv-all) and vz-shot-add 'Add shot'. App's word is 'shot', prototype 'setup'; keep the app's |
| Stat cards: Boarded setups, Coverage x of y scenes, Sketches, Lookbook refs, Primary lens | yes | yes | yes | yes | ok | statStrip in visualize.js: shots (with in the can), scenes covered, frames, references, primary lens. 'Primary glass: ARRI Anamorphic' is a make-up of lens+camera; app shows lens only. Fine |
| Tab strip: Shot List (count), Draft Coverage, Storyboard Grid, 2D Camera Blocking, Scene Board, Lookbook & Palette | yes | yes | yes | yes | ok | Sections shot-list, draft, storyboard, blocking, (scene board in blocking.js), lookbook, tabbed by tabs.js. Tab count badge '4' on Shot List not shown (derivable, b-item) |
| Viewport selector (2.39:1 Scope) and Aspect ratio on storyboard cards | yes | yes | no | no | c-ask-owner | No aspect-ratio field in shots/frames. New field on an existing record plus CSS frame ratio; ask |
| Current-scene header card: scene no., slug, EXT badge, DAY badge, pages, 'Day 04 on stripboard', 'N setups planned', scheduled time | yes | yes | no | no | b-derivable-build-both | Scene head rows exist per scene but show slug/count only. IE/DN, eighths and stripboard day are on the scene model and Locations schedule. A call time is only derivable if the DPR/call sheet holds it; hide otherwise |
| Auto-Draft Coverage (and Basic breakdown without a key) | yes | yes | yes | yes | ok | Draft section: Basic breakdown button, Draft N scenes with AI, undo last draft, AI draft/Basic tags. AI coverage generation already exists in the app |
| Export Shot List (PDF/CSV) per scene | yes | yes | yes | yes | ok | vz-pdf-scene / vz-csv-scene menu per scene |
| Coverage table: setup #, size/angle, movement, glass/lens, framing description, lighting/rig, status pill | yes | yes | yes | yes | a-fix-layout | Table with columns incl. camera link, rig, status pill (vz-shot-status). On phone the app shows a sideways-scrolling table with 'Swipe the table sideways' hint where the prototype has stacked execution-queue cards. Layout fix |
| Coverage table Filter and Compact toggles | no | yes | no | no | b-derivable-build-both | Pure view state on existing shot rows (status, camera). No data needed; build as one control for both layouts or ask if wanted |
| Execution queue extras: 'Setup 1 of 4 completed', Priority tag, 'N takes recorded', 'Take est: 45s', 'Slow Mo 60fps' | yes | yes | no | no | c-ask-owner | 'x of y completed' is derivable from shot.done and can be built; priority, takes recorded, estimates and fps have no field. Ask whether to add one field per item |
| Storyboard framing cards: frame no., size tag, lens, movement chip, caption, 'Take 03' / 'Synced with Audio A12' / 'Pending Call Sheet' footers | yes | yes | yes | yes | a-fix-layout | renderStoryboard shows frames per shot with ref + caption as text fieldsets. Cards with shot number/size/lens/movement header are derivable from the parent shot (b). The 'Reorder Frames' button is not present; frame images are P3c/ask |
| Storyboard images / drawn frames in cards, 'View All (9)' horizontal strip on phone | yes | yes | no | no | c-ask-owner | App stores a ref (link or words) only, 'No image uploads' note. Images are the planned P3c (Gemini + Drive); needs owner and a real key |
| 2D Camera Blocking canvas (top-down, actors, dolly arc, legend) with note card | yes | yes | yes | yes | ok | renderBlocking() / blocking.js diagram, scene board and highlightCamera link from a shot. Phone touch/pan on the canvas is a pass item, so verify it at 390 directly |
| Lookbook & Palette: named boards with category filter pills (All, Atmosphere, Lighting, Costume) and colour swatches with hex | yes | yes | no | no | c-ask-owner | Lookbook boards hold entries (title, ref, why) with no colour or category field. Swatches/hex/filter need a field on existing board entries; owner decision. Lookbook boards themselves exist on both layouts |

## stripboard (stripboard.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Header KPI strip: Strips (with scheduled meter), Script pages, Shoot days, Unscheduled | yes | yes | yes | yes | ok | stripboard.js renderHeader statStrip; prototype shows the same four, rewrapped to 2-3 columns on phone |
| Group-by control (Script order / Location / Day-night / Shoot day / Song) | yes | yes | yes | yes | ok | renderControls seg, view.group; mobile protos 1 and 2 show the same group chips |
| Schedule by location, Clear days, Export menu (Stripboard PDF, DOOD PDF, print) | yes | yes | yes | yes | ok | stripboard.js lines 418-429, one codebase; proto 1 has them in a bottom row on phone |
| Lock Production Draft button and Draft locked state | yes | yes | yes | yes | ok | lockButton() in sb-lock-host in the page header; proto shows Lock Draft and a DRAFT v3.2 badge. Check the button fits 390px beside the title |
| Time legend (DAY/NIGHT/DAWN/DUSK/CONTINUOUS) and EXT/INT strip styling | yes | yes | yes | yes | ok | sb-legend, todBadge; the legend chip row on phone |
| Pages-per-day warning target selector | no | yes | yes | yes | ok | loadTargetControl in the legend. Only the desktop proto shows a Threshold or Target select; the app has it on both |
| Per-day group header: day number, date, scene count, pages, Over target badge, night-shoot badge, locations | yes | yes | yes | yes | ok | sb-group-head with dayLoadBits, sb-night-badge, sb-group-locs, localDate |
| Per-day estimated shoot hours (Est. 8.5 h) | no | yes | yes | yes | ok | fillHours, a derived '≈ N h to shoot' from screen time, shown only when the script gives a model |
| Drag handle and Move menu to reorder strips and move them between days; shoot-day picker per strip | yes | yes | yes | yes | ok | moveHandle, dayPicker, Alt+arrows. Touch drag is untested at 390px and the Move menu is the phone route |
| Banner menu (Company move / Travel day / Holding / Production note) and implied company-move strip | yes | yes | yes | yes | ok | bannerMenu, renderBanner, impliedMove; the proto Unit logistics move card shows the same From to To, minutes and vans |
| Shot-state badge on a strip (Shot / Part shot) | yes | no | yes | yes | ok | sb-shot link read from scene.shotState. Mobile proto 3 shows Shot / Ready / Queued / Scheduled; the app has Shot and Part, which are the real states |
| Cast chips on each strip (names, with a no-cast warning) | yes | yes | yes | yes | ok | app prints names as chips; the protos print cast ID number circles. Same data, different treatment; the chips are the better fit for the kit |
| Day Out of Days grid (SW/W/H/WF key, per-day columns with dates, W / H / Total, today column tint, scene count) | yes | yes | yes | yes | ok | renderDood, a real k-table with a sticky first column. On phone it is the same table scrolling sideways, whereas the mobile proto stacks per-actor cards (see the layout fix below) |
| DOOD on phone as stacked per-actor cards (name, W/H counts, span, day-cell row) with a Full Matrix link | yes | no | yes | yes | a-fix-layout | The app has no card layout below 720px; stripboard.css @media 719 handles only the strips. Table to stacked cards. The data already exists in doodRows. Keep the full-grid table as the desktop form and add a card mode |
| Tabs Stripboard / DOOD Matrix on a segmented strip | yes | yes | yes | yes | ok | tabs.js TABBED includes stripboard; the sections #stripboard and #dood. Proto 2 has a Rack / Matrix toggle, the same idea |
| Calendar tab (date_range) beside Stripboard and DOOD | yes | no | no | no | b-derivable-build-both | Mobile protos 1 and 3 only. No calendar section on stripboard.html; the Plan page owns the calendar and Locations.calendarDays already supplies dated days. Build a read-only tab for both layouts, or link to plan.html#calendar |
| Avg pp per day stat (0.73 pp / day) | yes | yes | no | no | b-derivable-build-both | Total eighths divided by shoot days; the Script pages stat card has no such note. Note that 13 1/8 pp over 18 days is 0.73. Add it to the pages note |
| Shoot-day span note (4 Full Six-Day Weeks / 4x 6-Day Wks) | yes | yes | no | no | b-derivable-build-both | Days divided by a six-day week is derivable, but a six-day week is an assumption. Safer to derive from calendarDays date span or leave out; ask only if wanting the assumption |
| Est. runtime stat (105m on screen, target ~110m) | yes | yes | no | no | b-derivable-build-both | Reports has a runtime box and screenTime in screenplay-analysis. Derive the total from the script only; hide it when the script gives no timing; skip the target text unless Edit Log's target field is the one used |
| Cast on DOOD count (29 Actors, 3 Working Today) | yes | no | no | no | b-derivable-build-both | Mobile proto 3 only. doodRows gives the row count; Working Today needs the calendar date. Build both with the real count only |
| Unscheduled strip card (Unscheduled: 4 scenes, Reserve shelf) | yes | yes | yes | yes | ok | The Unscheduled stat card and the Not scheduled yet group. Reserve Shelf #03 is not a thing in the app; drop that label |
| Per-strip estimated time (Est: 3h 15m) and per-day Call time (Call: 06:00 AM) in the day header | yes | no | no | no | b-derivable-build-both | Per-scene seconds from screenTime rows exist (fillHours uses them per day); crew call is in DPR.getDPR(day).crewCall and the call sheet generalCall. Show only when set. The per-strip estimate must be flagged as an estimate |
| Department/gear tags per strip (Stunts & Rigging, Pyro FX) and Cast: names under ID circles | yes | no | no | no | c-ask-owner | Elements categories may exist in the breakdown (stunts, SFX) which could be shown as chips, but this is a new strip field/presentation. Ask the owner; if yes, derive from scene.elements |
| Route & ETA button and Est. Arrival on a company move; call crew transit time | yes | yes | no | no | c-ask-owner | No routing data. The app's move banner stores from/to, duration and what travels. ETA and map routing would be a new feature |
| Auto-Balance Pages button | yes | yes | no | no | c-ask-owner | A new scheduling algorithm that moves strips across days. The handoff open question 2 already lists it. Do not build before the owner decides |
| Draft version badge (PROD LOCK / DRAFT v3.2 / LOCKED DRAFT 4.2) | yes | yes | no | no | b-derivable-build-both | The app shows a Draft locked state with a stamp near the Lock button, but no named revision on the header. The revisions numbering in the script blob could supply a real name for the lock; show only what is stored |
| Draft/Auto-saved to Production Vault notice, Telemetry GB, Gateway Live status bar | yes | yes | no | no | c-ask-owner | Storage telemetry and gateway status are not measurable in a local-first app. The kit's status bar already shows real sync state. Drop these |
| Pacing threshold presets (Strict 3 4/8, Complex Stunts, Dialogue Heavy, High volume) | no | yes | no | no | c-ask-owner | The app has a free 2 to 8 page select. The named presets are a labelled shortcut for the same value, but the 'Complex Stunts' semantics are invented. Ask or leave out |
| Strip Add (Add Strip button) | yes | yes | yes | yes | ok | Strips are scenes from the breakdown; the page links to the Scene List. The proto's global add button maps to the shell's quick add; not a stripboard feature |

## shoot (shoot.html, the on-set day view)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Hero: Day N On Set, date and locations, Today badge | yes | yes | yes | yes | ok | shoot.js titleBox; proto 3 reads 'Day 04.' with the date and place. Same data |
| Day KPI strip: Scenes shot, Pages shot, Scenes left, Wrap estimate (with the zone) | yes | yes | yes | yes | ok | kpis; the proto splits it a little differently but the scene and page figures match |
| Film-total 'In the can' (19 / 36, 52%) and film pages total | yes | yes | no | no | b-derivable-build-both | render() computes Shoot.overall(scenes) at line 202 and never displays it. Add an In the can stat card with the real shot/total count |
| Schedule status (On pace +0.5 day) | yes | yes | no | no | c-ask-owner | Needs a definition of 'on pace' (shot pages versus planned pages up to today). It is derivable but is an invented judgment; ask the owner on the rule before showing it |
| Shooting-days horizon strip (D1..D18 with ticks, current marker) | yes | yes | yes | yes | ok | nav.sd-days with wrapped ticks and the current mark. Proto 2 adds dates under each day; a small a-fix is to show the date on each button when set |
| Solar engine: sunrise, golden hours, sunset, daylight timeline bar with call, wrap and now ticks | yes | yes | yes | yes | ok | renderSun / timeline in shoot.js, offline sun.js |
| Pin location where device is (geolocation) button | yes | yes | yes | yes | ok | The locate action 'Pin <loc> where this phone is', shown when the location has no pin |
| Night wrap flag (wrap after sunset, exterior scenes need the light) | yes | yes | yes | yes | ok | The sd-flag with exterior scene numbers; the per-card flag as well |
| Times row: crew call, first shot, lunch break, camera wrap | no | yes | yes | yes | ok | timesRow from the DPR; the desktop proto 1 shows the call, first shot, lunch and wrap rows. The phone protos omit them; the app keeps them on both |
| Scene roster with filter All / Incomplete | yes | yes | yes | yes | ok | rosterFilter; the proto 2 mobile shows an 'All Scenes (5)' chip |
| Scene card: number, slug, pages, state pill, synopsis, cast, next-up mark | yes | yes | yes | yes | ok | sceneCard; proto 3 mobile shows the slug-first card, which the app also does at 390px |
| Shot / Part / Dropped one-tap marks (48px targets, tap again to clear) | yes | yes | yes | yes | ok | SHOT_STATES row in sceneCard; the owner's own 'the floor' design |
| Takes log with circled take and +Take / Undo | yes | yes | yes | yes | ok | takesBlock reads scene.takes; the desktop proto 1 shows '4 takes (Take 3 circled)', mobile proto 1 'Take Notes' |
| End of Day -> DPR and Next: Edit Log buttons | yes | yes | yes | yes | ok | The sd-dpr row |
| View Call Sheet #04 button in the header | yes | yes | no | no | b-derivable-build-both | Shoot.sheetsForDay already finds the sheet; link to contacts.html#call-sheets for that sheet. The app has only the DPR link |
| Day-change selector showing the dated day (proto 2: OCT 24 D1, TODAY D4 27) | yes | no | yes | yes | a-fix-layout | Day buttons print only D1... with the date in the hero; the proto adds the date on each. Small kit variant using calendarDays; both layouts |
| Per-scene note field (Take Notes, Floor Note, Re-take Insert Required, Queue Note) and Add Floor Note | yes | yes | no | no | c-ask-owner | No scene note exists on the shoot page. It would be one field on the scene record (like takes); a genuinely new feature, so ask. Note also a re-take flag |
| Costume, props, lighting/rig and gear chips on the next-up card (Costume, Props, Special Gear, Cameras A+B) | yes | yes | no | no | b-derivable-build-both | The breakdown elements (props, wardrobe) are on scene.elements, and the shot list holds lighting/rig. Derive and show only what is tagged. Camera and lens come from the shot list only; hide if empty |
| Crew checked in 28/31 and Crew On Set list with radio/call buttons | yes | yes | no | no | c-ask-owner | There is no check-in data. Crew exists in contacts and a Call link could derive from called people with phones, but check-in is a new feature |
| Emergency / nearest hospital card with distance and phone | yes | yes | no | no | b-derivable-build-both | Locations.getRecce(name) holds hospital and police for each location (used on the call sheet). Show it on the shoot day, with a tel: link where a number is stored. Hide the distance (the app has none) |
| Script Supervisor Pad with Active Take Counter and ROLL button | no | yes | no | no | c-ask-owner | A live slate counter overlaps the existing +Take but with a ROLL/Ready state. A new feature; ask |
| Roll New Slate and Call Cast buttons | yes | yes | no | no | c-ask-owner | Slate and Call Cast actions have no app equivalent. Call Cast could reuse the call sheet's WhatsApp dispatch, but ask |
| Sound roll / mag checksum DIT footer, battery and floor clock, FLOOR LIVE camera-ready badge | yes | yes | no | no | c-ask-owner | Not measurable here (checksums, battery, camera status). Drop them; the floor clock is only meaningful as the same 'now' tick already on the solar bar |
| Dropped scene 'Scheduled for post pickup' label and Resume Strike on part-shot scenes | yes | yes | no | no | c-ask-owner | The state is stored; a pickup scheduling note is not. Resume Strike is just the existing state toggle on a part-shot card, so call it ok if reworded |

## budget (budget.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Header actions: Versions (revision history), Export CSV, New cost line | yes | yes | yes | yes | ok | budget.js pageHeader actions; the proto has Revision History v4, Export CSV and New Cost Line |
| KPI strip: Stripboard sync days, Total budget, Actual spent (with % used), Remaining, Contingency | yes | yes | yes | yes | ok | renderKpis. Proto labels these Total Approved, Remaining Buffer; the figures are the same. Proto 'through Day 4' and 'Approved' ceiling would need a data source, so hide |
| Tabs: Estimate, Petty Cash, Cost Report, Crew Payments, Top Sheet, Schedule Impact, Versions, Wage Table, Export | yes | yes | yes | yes | ok | budget-costs.js lines 706-713. Mobile proto drops Schedule Impact and Versions from the strip; the app keeps them on both |
| Live pipeline connector from stripboard (days, strips, pages, locations) with Use N Days in Estimate | yes | yes | yes | yes | ok | ui/budget.js 'From your schedule' block with Use N days. The proto also shows the 17 locations count and a last-synced time; locations count is derivable (locationIndex) and can be added to the block |
| Quick Cost Estimator: item, days, rate, subtotal, Add item, Add 5, Print, Reset, grand total | yes | yes | yes | yes | ok | ui/budget.js. Phone proto uses stacked cards (item, subtotal, 'd x rate'); the app table needs a card mode below 720px |
| Estimator rows as stacked cards on phone (name, per-line 18 d x rate, subtotal) | yes | no | yes | yes | a-fix-layout | The rows are a table at all widths; budget.css has 720 and 480 breakpoints, which should be checked against the card design by screenshot |
| Union Verified badge and checked date per preset line | yes | yes | yes | yes | ok | rateChecks overlay, the app shows the checked date next to the band. The proto's 'Union Verified' wording would claim more than the data says (no union floor exists), so keep 'Checked <date>' |
| Contingency cushion with locked safety pool and 10% included | yes | yes | yes | yes | ok | Contingency stat plus the contingency line in the by-department report; 'Locked' is not a state the app has, so drop that word |
| Petty cash & floats panel: floats issued per person with cash/UPI, logged today, expense vouchers, Log New Petty Cash Bill | yes | yes | yes | yes | ok | costAside and the Petty cash tab (Add an expense, Issue a float, Balance by person, Expense log with Paid with) |
| Voucher number and 'Verified' badge on a petty cash bill | yes | yes | no | no | c-ask-owner | Expenses carry receipt/bill details, not a voucher numbering or a verified flag. The verified state is a new approval workflow; ask. A derived running voucher number is possible but stable numbering would need storing |
| FEFSI Chennai Rates Lock card (overtime after 8.5 camera hours, batta auto-calculated from wrap timestamp) | no | yes | no | no | c-ask-owner | Claims a union rule and an automatic batta calculation; CLAUDE.md says no union floor exists (FEFSI MoU expired). Not derivable. Do not build; the wage table's overtime note is the honest version |
| Estimate consolidation / Grand Total with contingency included | yes | yes | yes | yes | ok | Grand total in the estimator and the Top sheet tab |
| Stripboard 'Sync changed 2h ago' note | no | yes | no | no | c-ask-owner | The schedule connector is computed live, so no sync time exists and this would be invented. Drop it |

## contacts (contacts.html, call sheets and unit directory)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Call Sheets & Dispatch header with New shoot day | yes | yes | yes | yes | ok | contacts.js header; the proto mobile has New Shoot Day and Archive |
| Unit figures: roster, talent registry, production base (departments), slates built | yes | yes | yes | yes | ok | statStrip lines 94-99, the same four |
| Tabs Call Sheets / Unit Directory & Contacts | yes | yes | yes | yes | ok | data-tab-label Unit directory and Call sheets |
| Unit directory by department (add, edit, call, email) | no | yes | yes | yes | ok | ct-people. Prototypes show only the tab label; app is richer |
| Archive Logs button for old call sheets | yes | yes | no | no | c-ask-owner | No archive concept on a call sheet. Could be a filter by date, but is a new feature; ask |
| Day-at-a-glance panel: day number, date, general call, ready to shoot, planned wrap | yes | yes | yes | yes | ok | glanceFact in contacts.js line 390 to 399, including dpr.firstShot as Ready to shoot |
| Edit Metadata and Lock Schedule buttons | no | yes | no | no | c-ask-owner | The app edits fields in the sheet form directly (so Edit Metadata is the existing form). Lock Schedule per call sheet is a new state; ask |
| Weather badge (Clear 29C) and Day 04 of 42 label | yes | yes | no | no | c-ask-owner | Weather needs a forecast source or the DPR weather field (typed, after the day); no live source. Day N of M is derivable from calendar days (the proto's 42 conflicts with the app's 18), so build 'Day N of M' only |
| Location & unit base with coordinates and Open in Maps | yes | yes | yes | yes | ok | Location & unit base, Lat, Open in Maps, the pin editor |
| Solar & daylight with wrap-after-sunset flag | yes | yes | yes | yes | ok | Solar & daylight, wrapOf and the flag text |
| Route & emergency safety: nearest hospital and police with phone, distance | yes | yes | yes | yes | ok | Route & emergency safety from the recce card. Distance is not stored; only the hospital and police text. A Call button is a derivable tel: link if a number is in the text |
| Scenes to shoot list with page totals and cast names | yes | yes | yes | yes | ok | Scenes to shoot with tick list; scene-by-scene cast names appear in the printed sheet |
| Who is called with staggered call times and call notes (H/MU CALL, EARLY RIG labels, ready-on-set time) | yes | yes | yes | yes | ok | Who is called, per-person call time input. Call-type labels and 'Ready on set' per person are not stored, so they would need a field; the department and role are the real grouping |
| Cast call times versus key crew call times as two groups | yes | yes | no | no | b-derivable-build-both | The called list is one list; the contact department already distinguishes Cast from crew, so grouping is derivable |
| Instant Dispatch Center: live WhatsApp message preview, Send to WhatsApp, Share, Copy text, per-person messages | yes | yes | yes | yes | ok | callsheet-text.js and the Dispatch block: Message preview, Send to WhatsApp, Share, Copy text, WhatsApp per person |
| Dispatch target group name (Target: DRAGON - Main Unit (34)) and E2E Encrypted badge | yes | yes | no | no | c-ask-owner | wa.me opens the chat picker, so no group is known; the E2E claim is not ours to make (WhatsApp is). Drop both. Relay Connected status is likewise unmeasurable |
| PDF Sheet, Sides Packet, print | yes | no | yes | yes | ok | Print this sheet, Save as PDF, Download sides packet. Desktop proto shows only the message; phone proto shows the three buttons |

## edit (edit.html, Post-Production edit log)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Hero: title 'Edit Log & Cut Continuity' + deck | yes | yes | yes | yes | ok | edit.js pageHeader (eyebrow Post / Edit log, title flips to 'Ready to lock.'); restyle only |
| Primary button: + New Cut Version | yes | yes | yes | yes | ok | Exists as the ADD CUT form in src/ui/edit-cuts.js (cutsShell, lazy-loaded below the log). Placement differs: prototype puts it in the hero. Could add a hero button that jumps to #cuts; no data needed |
| Button: Diff v0.8 vs v1.2 (cut-to-cut comparison) | yes | yes | no | no | c-ask-owner | editlog.js cuts hold only name, date, links and timecoded notes. No per-cut scene membership or runtime, so a diff cannot be derived. A new feature |
| Stat: Scenes in cut (12 / 36 total, progress bar) | yes | yes | yes | yes | b-derivable-build-both | The app has an 'In the cut' count in statStrip (cov.counts.inCut) but no '/ total' and no bar. cov.rows.length gives the total. Add the denominator and kit progress bar |
| Stat: Pages in the can (38 / 105 + bar) | yes | yes | yes | yes | ok | statStrip 'Pages in the can' = cov.pages.inCan / cov.pages.need. Only the progress bar is missing, which is derivable |
| Stat: Open pickups (2 urgent, 'Sc 15B insert needed') with warn state | yes | yes | yes | yes | b-derivable-build-both | The count exists with a 'owed by the editor' warn note. The prototype names the scene, which is derivable from data.pickups and sceneId. 'URGENT' is not stored, so show a warn tone only |
| Stat: Assembly runtime (1h 48m, -8m trim, Target 2h 10m Locked) | yes | yes | yes | yes | ok | runPanel: running time estimated from the script, over/under the target, and an editable target length. The app already says 'estimate'. 'Locked' is a prototype word; the app has no target lock |
| Stat: Target deliverable (DCI 4K Scope, SMPTE 24fps, 4096x1716) | yes | yes | no | no | c-ask-owner | No target format or resolution is stored on the edit log or the project. deliverables.json lists a DCP item but no chosen spec. Needs a field on an existing record and the owner's decision |
| Stat: Locked count | no | no | yes | yes | ok | In the app's statStrip, not in either prototype. Keep it (parity rule: app features stay) |
| Filter chips: All / In cut / Still owed / In the can / Cut out, each with a count | yes | yes | yes | yes | ok | FILTERS in edit.js with counts in .el-filters. The mobile prototype scrolls the chips sideways; check that the app's group wraps or scrolls at 390px |
| Copy Pick-Up List button | yes | yes | yes | yes | ok | data-edit-action copy-pickups |
| Export Continuity (CSV) | yes | yes | yes | yes | ok | export-csv -> Edit.toCSV |
| 'Sorted by script order' label and 'N active shown' count | yes | yes | no | no | b-derivable-build-both | Pure derivation from the list order and cov.rows. Not drawn in the app. Add as a section meta line |
| Scene card: number tag, slug line, pages in eighths, shoot day ('Day 04 Shoot') | yes | yes | yes | yes | b-derivable-build-both | el-num, el-slug and el-pages exist. The shoot day per scene is derivable from the schedule (scene.day / locations order). The 'Dailies by shoot day' block in edit-cuts.js already groups by day |
| Scene badges: Shot / Part-Shot with setups complete (4 Setups Complete, 2/3 Setups) | yes | yes | yes | yes | ok | gotBadge (shotState from shoot.html) and setupsLine ('x of y setups ticked'). Both are links to the page that owns the data |
| Badge: In The Cut / Rough v1.2 (which cut version the scene sits in) | yes | yes | no | no | c-ask-owner | The app stores a cut state per scene (in / out / locked) but not which cut version it is in. Needs one new field on the scene's edit record. Show 'In the cut' from the existing state meanwhile |
| Cut state control: Locked / Cut status (select) | yes | yes | yes | yes | ok | cutSelect: in / out / locked. The prototype shows it as a read-only badge; the app's version is editable, which is better |
| Scene timecode (TC 14:22:08:12) | yes | yes | no | no | c-ask-owner | Scenes carry no timecode. Cut notes have a tc, but that is a note's position in a cut, not the scene's. A new field |
| Editor's Log note on the scene (quote, 'Chief Editor' author tag) | yes | yes | yes | yes | ok | Editor's note textarea per scene (aria 'Editor's note for scene'). The author tag 'Chief Editor' is a role label with no data behind it, so leave it out |
| Audio Sync & Stems card ('Locked Sync', stem description text) | yes | yes | yes | yes | a-fix-layout | The app has an 'Audio synced' checkbox (el-sync), so the feature exists on both. The prototype adds free text about stems. That part is a new field (c-ask-owner); the checkbox could be restyled as the 'Locked Sync' badge on both layouts |
| Volume / Frame.io link line with camera format | yes | yes | yes | yes | ok | linksBlock: per-scene links with an optional label. The camera and format text is not stored. Do not invent it |
| Critical pickup card: warn border, 'Action Item #PU-102', quoted need, Lens / Lighting, Dailies reel id | yes | yes | yes | yes | b-derivable-build-both | Pickups exist per scene (pickupItem: text, tick, remove, add form) and rows get .is-owed/.is-conflict. The warn card styling is a restyle. Sequential ids ('#PU-n') can be derived from list index. Lens and lighting are not stored, so skip them. Dailies reel id is not stored either |
| Add to Call Sheet 06 (pickup onto a call sheet) | yes | yes | no | no | c-ask-owner | Pickups are not linked to the schedule or call sheets. Needs pickups to be scheduled onto a shoot day. This is a new feature. (conflict-pickup only adds an open pick-up.) |
| Flags: Flagged for 2nd Unit, VFX Shot Sent, Pending Pickup chip | yes | yes | no | no | c-ask-owner | 'Pending pickup' is derivable from row.pickups. '2nd unit' and 'VFX sent' have no field and would be new. Foley / sound design passed to supervisor is also new |
| Cut Version Timeline panel (versions, date, runtime, 'Active Master Cut', notes) | yes | yes | yes | yes | a-fix-layout | Cut versions with date, links and notes exist as cut cards in #cuts, loaded lazily at the bottom of the page. The prototype shows a compact timeline in a right column on desktop and after the log on phone. Per-cut runtime and 'Active Master Cut' are not stored. Cut cards are the real data; a timeline header is a layout change |
| Sound Pre-Dub Sync Check (98% PASS, progress bar) | yes | yes | no | no | b-derivable-build-both | The prototype's 98% and '64 dialogue stems' are invented. The honest version is derivable: scenes with Audio synced ticked over scenes in the cut, shown as 'n of m scenes synced' with a bar. Build on both layouts and drop the dialogue-stem wording |
| Master Deliverables & CBFC side panel (DCP status, CBFC 8/9 checks, owed affidavit, subtitle continuity, ProRes, 'Checklist') | yes | yes | no | no | b-derivable-build-both | Edit page only has a 'Next: Deliverables' link. Deliverables.progress / listItems give done / doing / total and per-item state. Certification tab has real CBFC checks. A compact summary and 'x of y delivered' with the first open items can be derived and linked to deliverables.html. DCP sub-specs are not stored |
| Generate DCI Packaging Manifest button | yes | yes | no | no | c-ask-owner | Nothing generates a DCP manifest, and it would need technical metadata the app does not hold. New feature |
| Conflict banners (dropped scene still in cut): Mark cut out / Schedule pick-up | no | no | yes | yes | ok | In the app only (notice banner with data-edit-action conflict-cut-out, conflict-pickup). Keep it; the prototype's critical-pickup card is its nearest cousin |
| Running-time target field, orphan pickups box, stage guide, 'Next: Deliverables' link | no | no | yes | yes | ok | App-only (runPanel field, orphanBox, mountStageGuide stage 'post', bd-onward link). Keep and style with the kit |

## deliverables (deliverables.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Page with Checklist / Certification / Dialogue list tabs, stat row, festival block, streamer block, filters, custom add | no | no | yes | yes | ok | No separate prototype screen: deliverables.js is only represented by the Master Deliverables panel on the edit-log prototype. Tabs, filters, the add-your-own form and the print views are app-only and already use the kit. Use the prototype's row style for the checklist items |
| Deliverable row: title, status chip (In Progress / Ready for Conform), spec sub-line, 'Owed:' line | yes | yes | yes | yes | ok | deliverables.js group() items carry state (done / doing / skipped), a blurb, links with a 'why' note and festival flags. Spec strings come from deliverables.json copy. The 'Owed:' line is derivable from open items; do not invent specs |

## library (library.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Hero 'The library index.' + deck + '8 shelves active' pill | yes | yes | yes | yes | ok | renderCover: title, blurb with real counts and cover-pill '${SECTIONS.length} SHELVES'. The count in the prototype says 8 and the mobile one says 6; the app derives it, so leave it |
| Bento / List view toggle | no | yes | no | no | c-ask-owner | Desktop prototype only, which breaks parity as drawn. The app has the card grid only. Needs an owner decision: build it on both (a stored view preference would be a new key; session-only would cost nothing) or drop it |
| Four stat tiles: Studied works 78, Director blueprints 10, Deconstructions 04, Chennai rate card 2024-25 Verified | yes | yes | no | no | b-derivable-build-both | library.js already has N_FILMS, N_DIRECTORS, N_DISSECTED and rates.asOf. They appear only inside the blurb and the TOC counts. Add a kit statStrip with the real numbers. The word 'Verified' only if rates.json carries a lastChecked or verified flag; otherwise show 'as of 2024-25' |
| Shelf cards (8): shelf number, count badge ('22 on this shelf'), title, blurb, footer chips, arrow | yes | yes | yes | yes | ok | cover-toc .toc-item: SECTION n, title, desc, count foot, arrow glyph. Restyle to the prototype's card. The prototype's sample footers must come from SECTIONS data, not be typed |
| Shelf chips on mobile: All shelves / Tamil Cinema / Rates / Case Studies | no | yes | yes | yes | a-fix-layout | The app's tabs strip (tabs.js, section-menu.js, data-tab-group) does the same job and is the same on both layouts. The prototype's chips are a restyle of it. The 'All shelves' tab is the cover. No new feature |
| Search shelves, films, directors, rules (inline, with Cmd-K hint) | yes | yes | yes | yes | a-fix-layout | library.js: 'search is the palette's now' (palette.js plus library-search.js index; the glossary tab has its own filter). The prototype draws a field in the page header on both layouts. The band's search and the phone's bottom-bar Search already open it. Not a gap; at most a field that opens the palette |
| 'Shift + click to batch export tags' | no | yes | no | no | c-ask-owner | Desktop-only hint for a feature that does not exist. A new feature and not parity-safe (no shift key on a phone). Recommend dropping |
| Featured case file 'Deep Dive: Vikram Vedha & Por Thozhil' with two-film split, tension model, sound architecture, 120-minute timeline scrub, 'Inspect Breakdown Notes' | yes | yes | no | no | c-ask-owner | The Case Studies tab (case-studies.js, studies data) has the real material, so a link card is derivable. The comparison facts (inciting parable at minute 18, tension model, sound cue, arc timeline) are not in the data and look invented. Build only a featured card from a real study linking to the tab |
| Chennai Rental Rates verified table (4 kits, shift prices) + 'Open Complete 2024 Rate Card (PDF)' | yes | yes | yes | yes | a-fix-layout | Rate tables live in the Equipment & rates tab (rates.json, rate-table rail, rates.css). A cover-level teaser of the first rows is derivable on both. The PDF button conflicts with the owner's 11 Oct note ('No print button: the Library is a page for reading') so do not build it. 'Verified' needs a real flag |
| Blueprint step watch lists: Step 01-04 cards with themed films + 'View all 32 blueprint stages' | no | yes | no | no | b-derivable-build-both | The Watch list tab (watchlist.json, watchId rail) holds this. The first four steps with their films can be derived as a cover preview. The prototype says 32 stages while the watch list covers steps 01-24 only, so use the app's number. Build it on both |
| Sticky 'In this tab' rail, Film terminology search, glossary expand | no | no | yes | no | ok | The rail is shown at 1100px and up only (library-shelf.css line 195), and the phone gets the tab strip instead. Presence difference: on a phone, jumping inside a long tab has no index. Flag as a layout fix if the owner holds strict parity; the section-menu or a disclosure could carry it |

## settings (settings.html)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Page title 'Account & Workstation' + deck, 'Node Secure' badge | yes | yes | no | no | c-ask-owner | The app's title is 'Settings'. 'Node Secure' is a claim with nothing measured behind it. Drop the badge or tie it to something real. The page title is a copy choice |
| Section nav: Account / Preferences / Data & Backup (LIVE badge) / Team (2/4) / Admin Console | yes | yes | yes | yes | ok | tabPane() builds account, preferences, backup, team, admin with groups You / This device / Together / Admin. 'LIVE' and 'n/m' badges are derivable via data-tab-badge, but the seat cap is a plan limit to read from billing_status |
| Identity card: avatar initials, name, email, 'Local only' / sync badge | yes | yes | yes | yes | ok | auth.js renderAccountBlock (am-avatar, name, mail, sync state from st.detail 'Local only'). Restyle |
| Role / License line ('FilmMakerStudio Owner') | yes | yes | no | no | b-derivable-build-both | Derivable from the studio role (admin / member) and the plan name via PlanGate.currentPlan. Do not print an owner name (brand.json seller is empty by decision) |
| Seat assignment ('1 of 10 seats allocated') | yes | yes | no | no | b-derivable-build-both | Plan limits and usage come from billing_status() (usageList in plan-cards.js). If a seats/collaborators limit exists there, show it; if not, hide it |
| Encryption scheme ('AES-256 Client-Side') | yes | yes | no | no | c-ask-owner | The app does not encrypt work client-side. localStorage is plain, Drive backup is in the user's own Drive. This would be a false statement. Do not build |
| Last desktop sync ('Just now (Auto)') | yes | yes | no | no | b-derivable-build-both | Cloud sync status and Drive last-sync time are known (cloudSyncSwitch, drive-sync meta, st.detail). Derive a real timestamp and drop 'Desktop' |
| Account actions: Sync Now / Cloud Settings / Sign Out | yes | yes | yes | yes | a-fix-layout | These exist as the account menu items (data-auth-action sync, settings, signout) and the Account block, plus Drive and cloud sync buttons under Data & backup. Make the identity card carry the three buttons on both layouts |
| Band: 'Backup Live' pill, Sync Now button, theme moon, notification bell with dot | yes | yes | yes | yes | c-ask-owner | Band has the project switcher, Backup, Dark/Light and the name pill (shell.js). Sync-state pill is derivable. The notification bell has no data source (no notifications model), so it would be a new feature; the dot would be fake. Ask |
| Tier ticket card: plan name, 'yours for good', description, usage meters (cloud projects 3/10, share links 1/5, collaborators 2/4), Manage Plan | yes | yes | yes | yes | ok | renderPlanCard: LED pill (Active / Trial / Open), 'yours for good' line, usageList(st) meters for paid plans, 'Manage plan' to purchase.html. Placement differs: prototype puts it in the right column on desktop |
| Region: India / International segmented control + FEFSI 'Standard Agreement 2024-2026 Applied / Active' | yes | yes | yes | yes | a-fix-layout | renderRegion choices (data-region-choice) with a note. The FEFSI agreement strip is not shown. The FEFSI MoU expired in 2025 and there is no union floor, so an 'Active' badge would be false. Show it only as a statement of the rate card actually applied |
| Your AI Key: provider tabs, masked field with eye toggle, Test Key, 'Key verified', privacy note | yes | yes | yes | yes | a-fix-layout | renderKey / ai-panel.js: provider select, key field, Save, Test the key, Replace, Forget, model select, 'What gets sent' note. The eye (reveal) toggle is missing and the provider is a select, not tabs. 'Key verified' is derivable from lastTest |
| Workstation Storage: used size, 'of 10.0 MB allocated' bar, IndexedDB tag | yes | yes | yes | yes | ok | renderStorage: main storage meter in three bands, large-item tier, honest ceiling wording. Keep the app's measured figures; the prototype's '10 MB' is a made-up allotment |
| Activity Log with entry count, entry rows, Clear Log | yes | yes | yes | yes | ok | renderActivitySection -> activity-log.js (count, list, Refresh, CLEAR LOG with confirmation) |
| Footer strip 'macOS Node Build 2.4.19 Standalone Client' + ticker 'IndexedDB Cache: Synced - Gateway Operational - Telemetry 14.2 GB / 50 GB' | yes | yes | no | no | c-ask-owner | The platform, build, gateway and telemetry figures are not measured by the app. A version string is derivable from package.json at build time; the rest is decoration. Recommend not building the ticker |
| Preferences / Data & backup / Team / Admin tab bodies not drawn in the prototype | no | no | yes | yes | ok | Motion, favourite film, privacy count switch, tour, cloud sync switch, Drive backup with conflict and versions, erase, team (accountSection), invites and admin settings are app-only. Keep them |

## admin (admin.html, application console)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Band crumb 'Studio > Console', search commands/users, project pill, Sync Now, bell | yes | yes | yes | yes | ok | The shared shell band and palette are on admin.html. The bell is covered under settings |
| Status bar: Razorpay LIVE / TEST pill, Purchases required ON pill, Refreshed time, Refresh | yes | yes | yes | yes | ok | statusBar() in admin.js, derived from the key prefix and purchasesRequiredNow() |
| Grouped tab strip: Run (Overview, Launch & Health, Audit Log) / People / Money / Product, with count badge | yes | yes | yes | yes | ok | TABS (11 tabs, 4 groups) with data-tab-badge counts. The prototype shows the badge '1' on Launch & Health, which the app derives from attention counts |
| Telemetry snapshot: 10 KPI tiles (Members, Pending Req, Paying Acc, Gross Rev, Trials Run, Purchase Gate, Failed Rcpt, Abandoned, Refund Queue, Pay Walled) with attention colouring, 'Auto-refresh: 30s' | yes | yes | yes | yes | ok | overviewTab: the same ten kpi() tiles from real RPCs, each a link to its tab, attention flags on pending requests and failed receipts. Not built: an auto-refresh timer or 'Auto-refresh: 30s' label (Refresh button only); a timer would be new behaviour and costs RPC calls |
| Needs attention list: severity tag (CRIT / HIGH / MED / LOW), title, detail, 'Fix it' link, 'Sort: severity', '4 critical' pill, escalation footer | yes | yes | yes | yes | a-fix-layout | attentionList / attentionItem produce pill, sentence and a link into the right tab. Severity labels exist only as tones (danger / warn / neutral). Map tone to CRIT / HIGH / MED / LOW and add a critical-count pill from the same list. 'Fix it' is today a whole-row arrow link. 'Sort' control is not needed. The 'Escalation Rule' footer is invented; skip |
| Activity: Immutable Audit Log card (action, actor, target, amount, status chips, 'x ago', Export CSV, 'View Complete Log', 'Showing latest 4 of 1,289') | yes | yes | yes | yes | a-fix-layout | activityCard(ctx) shows recent audit rows with an 'Everything about this target' link and 'Open the audit log'. The audit tab (admin-tabs/audit.js) holds the full log. Check there for Export CSV and the 'Showing n of total' line; add on the card if missing. Chip-style key:value detail is a restyle |
| Storage & Engine Nodes card (IOPS 4,820, latency 14ms, cluster ap-south-1, asset store 14.2 / 50 GB bar, IndexedDB healthy, auto-purge proxies) | yes | yes | no | no | c-ask-owner | None of these figures are measured. The app has a Sync & storage tab (admin-tabs/sync.js) with real stored-work counts. IOPS, latency, cluster and proxy auto-purge are infrastructure telemetry the app cannot read. Do not build; link to the Sync & storage tab instead |
| Mobile bottom bar: Projects / Studio / Console / Nodes / Settings | yes | no | yes | yes | ok | Owner rule: the phone bar stays Home / Go to / Search / Tools (mobile-nav.js). 'Nodes' has no counterpart |
| Tabs the prototype does not draw: People, Support, Access & sharing, Purchases, Growth, Usage, Sync & storage, Controls, Audit, Health | no | no | yes | yes | ok | App-only bodies from admin-tabs/*.js and the people, purchases and growth blocks. They are in the strip in both prototypes as names only. Keep them; style them with the kit panels and tables |

## public (start.html, the landing page)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| Top bar: brand, nav (Workflow / Interactive Demo / Features / Pricing / FAQ), Login with Google, Launch Studio | no | yes | yes | yes | ok | start.html .st-top: Workflow, Demo, Samples, Pricing, FAQ, Login with Google, 'Sign in' on narrow and 'Launch the studio' on wide. The nav links are hidden on narrow screens (st-nav display:none). The mobile prototype's top bar is the same |
| Hero: trust badges (in-browser privacy, lifetime licence, Indian cinema), headline 'From First Draft to Final Call Sheet. Zero Cloud Lock-In.', CTAs | yes | yes | yes | yes | a-fix-layout | The same three badges and a headline exist (sn-badges, st-title). CTAs differ: the prototype has 'Try Interactive Demo (No Sign-up)' and 'Start Writing Free', the app has 'Start your free trial' and 'See it working'. A no-sign-up demo does not exist and the gate is on, so the demo button is c-ask-owner. 'Start Writing Free' cannot stand while no plan is free (terms.html). Keep the app's CTAs |
| Hero product picture: window with scene strips, screenplay page, element breakdown, 'Total $38,400 (Lakhs of INR)' budget | no | yes | yes | no | ok | The app's sn-bench figure shows scene list, page and breakdown from the Dragon sample with build-time figures. It is hidden below 720px (start.css line 941), as in the mobile prototype. The prototype's dollar budget figure is not real data; skip it |
| Sample breakdown cards: Hollywood (The Dark Knight) and Chennai (Dragon) with rows and 'Import Full Breakdown' | yes | yes | yes | yes | a-fix-layout | Both cards exist (st-sample). One copy problem: the Dark Knight card body says 'The same desk, worked through as a Chennai production priced in rupees', and no Dark Knight sample ships (HANDOFF item 8 says only Dragon). Check that a Hollywood sample exists before keeping the card. If it does not, remove it. Layout is fine on both |
| 4-stage workflow cards (Story and character bible, Industry-standard screenplay, Automatic scene breakdown, Stripboard and one-liner schedule) | no | yes | yes | yes | ok | #workflow section and the 'Every tool a film needs' list from navigation.json. The mobile prototype omits it but the app shows it on both |
| Native regional presets block: offline, Tamil/Tanglish and CBFC, FEFSI and Chennai rates, no AI ingestion | no | yes | yes | yes | ok | #real-world with four cards. 'Zero AI ingestion' is a different claim from the app's 'Your script stays yours' (bring-your-own-key AI exists), so keep the app's wording |
| Pricing: 3 tiers in USD one-time with 'Most popular', 14-day money-back, 'Get Screenwriter License' | yes | yes | yes | yes | a-fix-layout | The app's plans come from plan-matrix.json and the purchases switch (Basic / Intermediate / Pro, INR, price-rise notice, trial first, compare-all). The prototype's names, USD prices and '14-day refund' contradict refund.html (purchases final bar three cases). Do not copy the numbers; restyle the real cards only. Both layouts show them |
| FAQ accordion (4 questions) | yes | yes | yes | yes | ok | st-faq details elements; the app has nine. Keep the app's questions |
| Closing CTA 'Ready to streamline your pre-production?' and footer links (Workflow, Demo, Samples, Pricing, FAQ, Privacy, Terms, Refunds) | yes | yes | yes | yes | ok | #go section and .st-foot. The app also has the e-mail offers form, invite-code band, Don't count this visit, the price-notice offer band and the phone thumb rail (st-bar) that the prototype does not show; keep those |

## public (other pages: invite, purchase, purchases, legal, kit, 404)

| Feature | Mobile proto | Desktop proto | App web | App phone | Bin | Evidence |
|---|---|---|---|---|---|---|
| invite.html, purchase.html, purchases.html, privacy/terms/refund, kit.html, 404 | no | no | yes | yes | ok | No prototype screen exists for any of them in the three Stitch sets; legal pages are markup-only and load no skin. Out of scope for restyling beyond the shared kit tokens |


## Summary

Total rows: 272. Bins: ok 147, a-fix-layout 25, b-derivable-build-both 45, c-ask-owner 55.

Open bin a and b rows (work to build, no owner decision needed): these are the 25 `a-fix-layout` and 45 `b-derivable-build-both` rows in the tables above. They are built for both layouts, or fixed in the layout that lacks them.

## Owner decisions needed (bin c, one yes/no per item)

The stage-1 rule is: stop, show the owner this list, and get a yes/no per item before any build. Nothing below is built. Each item is a row marked `c-ask-owner` above.

1. **dashboard** — Budget tile '88% Allocated' — decision: ______
2. **dashboard** — Slate subtitle 'Principal Photography Prep · change' and ID '#DRG-24' — decision: ______
3. **dashboard** — Readiness footer 'Camera test in 48 hours' / 'Updated 14m ago' — decision: ______
4. **dashboard** — Plan tile: cloud storage meter, collaborator count, cache size — decision: ______
5. **dashboard** — Status bar telemetry: IndexedDB cache, gateway operational, 14.2 GB storage — decision: ______
6. **dashboard** — Bell/notifications, Sync pill, avatar in top bar — decision: ______
7. **story** — 'New Beat' / 'Add Sub-beat' / 'Append Custom Intermediate Beat' — decision: ______
8. **story** — Refine Beat and AI Punch buttons on a beat card — decision: ______
9. **story** — Synopsis fullscreen and undo icon buttons — decision: ______
10. **screenplay** — Beats framework picker (Save the Cat! / Blake Snyder 15-beat) dropdown — decision: ______
11. **screenplay** — Beat row 'Link Scene' (add_link) on pending beats — decision: ______
12. **screenplay** — Beats panel 'AI' (auto_awesome) and 'tune' icon buttons per header — decision: ______
13. **screenplay** — 'On Track (95% target)' / 'Target: 110m, 5m buffer left' — decision: ______
14. **screenplay** — Zoom control (- 100% +) — decision: ______
15. **screenplay** — Page break markers 'Page 2 · 18/8 pp' with scene numbers in gutters — decision: ______
16. **screenplay** — Phone: 'Coverage Estimate: 1 Setup · Steadycam · 45 mins' + Breakdown link under scene — decision: ______
17. **screenplay** — Phone footer status 'IndexedDB: Synced · 24.8k w · 36 sc · Courier Prime'; desktop status bar telemetry (14.2 GB / 50 GB, gateway) — decision: ______
18. **focus mode** — Footer 'Focus Mode Active · Typewriter Lock' + telemetry (GB, gateway, IndexedDB ms) — decision: ______
19. **visualize** — Viewport selector (2.39:1 Scope) and Aspect ratio on storyboard cards — decision: ______
20. **visualize** — Execution queue extras: 'Setup 1 of 4 completed', Priority tag, 'N takes recorded', 'Take est: 45s', 'Slow Mo 60fps' — decision: ______
21. **visualize** — Storyboard images / drawn frames in cards, 'View All (9)' horizontal strip on phone — decision: ______
22. **visualize** — Lookbook & Palette: named boards with category filter pills (All, Atmosphere, Lighting, Costume) and colour swatches with hex — decision: ______
23. **stripboard** — Department/gear tags per strip (Stunts & Rigging, Pyro FX) and Cast: names under ID circles — decision: ______
24. **stripboard** — Route & ETA button and Est. Arrival on a company move; call crew transit time — decision: ______
25. **stripboard** — Auto-Balance Pages button — decision: ______
26. **stripboard** — Draft/Auto-saved to Production Vault notice, Telemetry GB, Gateway Live status bar — decision: ______
27. **stripboard** — Pacing threshold presets (Strict 3 4/8, Complex Stunts, Dialogue Heavy, High volume) — decision: ______
28. **shoot** — Schedule status (On pace +0.5 day) — decision: ______
29. **shoot** — Per-scene note field (Take Notes, Floor Note, Re-take Insert Required, Queue Note) and Add Floor Note — decision: ______
30. **shoot** — Crew checked in 28/31 and Crew On Set list with radio/call buttons — decision: ______
31. **shoot** — Script Supervisor Pad with Active Take Counter and ROLL button — decision: ______
32. **shoot** — Roll New Slate and Call Cast buttons — decision: ______
33. **shoot** — Sound roll / mag checksum DIT footer, battery and floor clock, FLOOR LIVE camera-ready badge — decision: ______
34. **shoot** — Dropped scene 'Scheduled for post pickup' label and Resume Strike on part-shot scenes — decision: ______
35. **budget** — Voucher number and 'Verified' badge on a petty cash bill — decision: ______
36. **budget** — FEFSI Chennai Rates Lock card (overtime after 8.5 camera hours, batta auto-calculated from wrap timestamp) — decision: ______
37. **budget** — Stripboard 'Sync changed 2h ago' note — decision: ______
38. **contacts** — Archive Logs button for old call sheets — decision: ______
39. **contacts** — Edit Metadata and Lock Schedule buttons — decision: ______
40. **contacts** — Weather badge (Clear 29C) and Day 04 of 42 label — decision: ______
41. **contacts** — Dispatch target group name (Target: DRAGON - Main Unit (34)) and E2E Encrypted badge — decision: ______
42. **edit** — Button: Diff v0.8 vs v1.2 (cut-to-cut comparison) — decision: ______
43. **edit** — Stat: Target deliverable (DCI 4K Scope, SMPTE 24fps, 4096x1716) — decision: ______
44. **edit** — Badge: In The Cut / Rough v1.2 (which cut version the scene sits in) — decision: ______
45. **edit** — Scene timecode (TC 14:22:08:12) — decision: ______
46. **edit** — Add to Call Sheet 06 (pickup onto a call sheet) — decision: ______
47. **edit** — Flags: Flagged for 2nd Unit, VFX Shot Sent, Pending Pickup chip — decision: ______
48. **edit** — Generate DCI Packaging Manifest button — decision: ______
49. **library** — Bento / List view toggle — decision: ______
50. **library** — 'Shift + click to batch export tags' — decision: ______
51. **settings** — Page title 'Account & Workstation' + deck, 'Node Secure' badge — decision: ______
52. **settings** — Encryption scheme ('AES-256 Client-Side') — decision: ______
53. **settings** — Band: 'Backup Live' pill, Sync Now button, theme moon, notification bell with dot — decision: ______
54. **settings** — Footer strip 'macOS Node Build 2.4.19 Standalone Client' + ticker 'IndexedDB Cache: Synced - Gateway Operational - Telemetry 14.2 GB / 50 GB' — decision: ______
55. **admin** — Storage & Engine Nodes card (IOPS 4,820, latency 14ms, cluster ap-south-1, asset store 14.2 / 50 GB bar, IndexedDB healthy, auto-purge proxies) — decision: ______

