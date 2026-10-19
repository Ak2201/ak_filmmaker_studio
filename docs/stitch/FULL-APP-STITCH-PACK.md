# FilmMakerStudio — full-app Stitch hand-off pack (single document)

Scope: the WHOLE app — every page of the product plus the owner's admin console. This is ONE file.
Part A = workflow and design system (read first). Parts B–I = the screens. Give Stitch Part A first, then one screen at a time.

## Screen index (use this to pick the right prompt)

- **Part B — Global shell, Studio Hub and Dashboard**
  - 0. Shared tokens and conventions (read once; every surface below uses them)
  - A1. Top band (`.sh-bar`, built by `src/ui/shell.js`; controls from `chrome.js`, `auth.js`, `topbar-backup.js`, `project-switcher.js`)
  - A2. Studio rail (`nav#studioRail.sh-rail`, `shell.js buildRail`, `trial-band.js`)
  - A3. Phone bottom bar and its sheets (`chrome.js attachMobileActionBar`, `src/ui/mobile-nav.js`)
  - A4. Command palette (`src/ui/palette.js`, `palette.css`)
  - A5. Project switcher popover (`src/ui/project-switcher.js`)
  - A6. Sign-in modal (`auth.js` cloud auth modal) and account pill states
  - A7. Stage guide panel (`src/ui/stage-guide.js` + `stage-guide-body.js` + `stepper.js`)
  - A8. Tabs / section menu (`src/ui/tabs.js`, `section-menu.js`)
  - A9. Footer (`src/ui/footer.js`)
  - A10. Action menus and page action bar (`src/ui/actionbar.js`)
  - A11. Toasts (`chrome.js StudioUI.toast`)
  - A12. Dialogs (`src/ui/dialog.js`, replaces native confirm/alert/prompt)
  - A13. Plan-gate walls and locks (`src/lib/plan-gate.js`, `plan-gate.css`)
  - A14. First-run panel, project doors, "Start your film" sheet, hub New-project modal (`src/pages/hub/first-run.js`, `src/ui/project-setup.js`, `hub.js modalMarkup`)
  - A15. Onboarding tour (`src/ui/tour.js`, `src/data/tour.json`; key `fms_tour_v1`)
  - A16. Learn panel, glossary popovers, shortcut sheet, no-project banner
  - B1. Studio Hub
  - C1. Dashboard
- **Part C — Entry and account: landing, invite, purchase, screening room, extension panel, legal, 404**
  - Landing page (file `start.html`)
  - Invite / doorway (file `invite.html`)
  - Purchase (file `purchase.html`, plus stub `purchases.html`)
  - Screening room (file `screening.html`)
  - Chrome-extension side panel (file `extension/panel.html`, script `src/pages/panel.js`)
  - Legal pages (files `privacy.html`, `terms.html`, `refund.html`)
  - 404 page (file `404.html`)
- **Part D — Settings, Library, Idea Vault and Story stage**
  - Settings › Account (`settings.html#account`)
  - Settings › Preferences (`settings.html#preferences`)
  - Settings › Data & backup (`settings.html#backup`)
  - Settings › Team (`settings.html#team`)
  - Settings › Admin (`settings.html#admin`)
  - Library › Films (`library.html#films`)
  - Library › Directors (`#directors`)
  - Library › Rules (`#rules`)
  - Library › Equipment & rates (`#equipment`)
  - Library › Watch list (`#watch`)
  - Library › Film terminology / Glossary (`#glossary`)
  - Library › Case Studies (`#case-studies`)
  - Library › Dissection (`#dissection`)
  - Retired stubs
  - Story › Start cards (first visit, empty story) (`story.html`)
  - Story › Idea / Seed (`story.html#path-idea`)
  - Story › Logline (`#path-logline`)
  - Story › Story Bible (`#path-bible`; short film: Character `#path-character`, World `#path-world`, Conflict `#path-conflict`)
  - Story › Scene order (`#path-structure`)
  - Story › Step outline (`#path-outline`)
  - Story › Setups & payoffs (`#path-setups`, feature only) and Timeline (`#path-timeline`, feature only)
  - Story › Synopsis (`#path-synopsis`)
  - Story › Lock the outline (`#path-lock`)
  - Story › Open the Screenplay Writer (`#path-screenplay`)
  - Story › Beats & pacing (`story.html#pacing`)
  - Story › Pitch deck (`story.html#pitch`)
  - Story › Cover sheet (`story.html#guide`)
  - Story — shared states, dialogs, mobile
- **Part E — Screenplay writer, Drafts and Breakdown**
  - Screenplay Writer — editor surface (`screenplay.html`)
  - Screenplay Writer — Beats panel (`screenplay.html`, toggled by "Beats ◧")
  - Screenplay Writer — Import Screenplay (`screenplay.html`, `#import`)
  - Screenplay Writer — Focus mode (`screenplay.html`, button "Focus")
  - Screenplay tools — AI coverage and Write from a synopsis (`write.html?stay=1`)
  - Drafts — list (`drafts.html`)
  - Drafts — Compare (`drafts.html`, `#dr-compare`)
  - Drafts — Title Page (`drafts.html#title`)
  - Breakdown — page shell (`breakdown.html`)
  - Breakdown — Screenplay Analysis (`breakdown.html#script`)
  - Breakdown — Whole script, the one-click breakdown (`breakdown.html#overview`)
  - Breakdown — Scene Breakdown / Scene List (`breakdown.html#scenes` and `#breakdown`)
  - Breakdown — Auto-Tag (`breakdown.html#suggest`)
  - Breakdown — Songs (`breakdown.html#songs`)
  - Breakdown — Elements (`breakdown.html#elements`)
  - Pre-Production path (`preprod.html`) — NOT retired
- **Part F — Reports, Visualize, Plan and Stripboard**
  - Shared frame (applies to all four pages; described once)
  - Production Reports (`reports.html#reports`)
  - Sides (`reports.html#sides`)
  - Screen Time (`reports.html#screentime`)
  - Cast Matrix (`reports.html#cast-matrix`)
  - One-liner (`reports.html#oneliner`)
  - DPR — daily production report (`reports.html#dpr`)
  - Equipment (`reports.html#kit`)
  - Shot List (`visualize.html#shot-list`)
  - Draft a shot division (`visualize.html#draft`)
  - Storyboard (`visualize.html#storyboard`)
  - Blocking (`visualize.html#blocking`)
  - Scene board (`visualize.html#scene-board`)
  - Lookbook (`visualize.html#lookbook`)
  - Shoot Calendar (`plan.html#calendar`)
  - Locations (`plan.html#locations`)
  - Reference Media (`plan.html#media`)
  - Stripboard (`stripboard.html#stripboard`)
  - Day Out of Days (`stripboard.html#dood`)
- **Part G — Budget, Cast & Crew, Shoot Day, Edit Log and Deliverables**
  - Shared shell (every page below)
  - Budget · Estimate (`budget.html#estimate`)
  - Budget · Petty cash (`budget.html#expenses`)
  - Budget · Cost report (`budget.html#actuals`)
  - Budget · Crew payments (`budget.html#crew`)
  - Budget · Top sheet (`budget.html#topsheet`)
  - Budget · Schedule impact (`budget.html#schedule`)
  - Budget · Versions (`budget.html#versions`)
  - Budget · Wage table (`budget.html#wages`)
  - Budget · Export (`budget.html#export`)
  - Contacts · Unit list (`contacts.html#contacts`)
  - Contacts · Call sheets (`contacts.html#call-sheets`)
  - Deliverables · Checklist (`deliverables.html#checklist`)
  - Deliverables · Certification (`deliverables.html#certification`)
  - Deliverables · Dialogue list (`deliverables.html#dialogue-list`)
- **Part H — Blueprints (feature and short film) and how they live inside the stages**
  - 0. READ THIS FIRST — what is actually reachable
  - 1. Feature-film blueprint page (feature.html?stay=1 / src/pages/feature.js)
  - 2. Short-film blueprint page (short.html?stay=1 / src/pages/short.js)
  - 3. How the blueprints now live inside the stages
  - 4. Block catalogue — every type the step renderer can draw
  - 5. Three fully worked example steps
  - 6. The six hues and where they appear
- **Part I — Owner admin console (11 tabs, drawer, banner, dialogs)**
  - Console: shell, Run group and Product group screens (design handoff)
  - Admin console: People group screens (spec extracted from code)
  - Admin console: Money tabs, Controls tab, global surfaces

## 1. What you should do (the workflow)

1. **Open Google Stitch** (stitch.withgoogle.com, a Google Labs tool; menus change, so treat the
   exact button names below as approximate).
2. **Set the style once.** Start a project, choose *Web / Desktop*, and paste the "Design system prompt"
   (section 3 below) as the first prompt so every screen shares the look. Re-use it as the preamble of
   every later prompt.
3. **One screen per generation.** For each screen, paste its **Stitch prompt** from the screen files,
   then paste the **Elements** table under it if Stitch accepts long prompts (otherwise attach it as
   notes and refine with short follow-up prompts: "add the density toggle", "show the error state").
   Generate **desktop (1280)** first, then ask for the **mobile (390)** variant of the same screen.
4. **Generate the states too**, not just the happy path: loading (skeleton), empty, error, and the
   role-limited view. Those are all in the spec; designers usually skip them and that is where the
   build breaks.
5. **Export each screen**: Stitch lets you copy the generated HTML/CSS and/or paste to Figma. Do both if
   you can: **Paste to Figma** (so Claude can read it through the Figma connection) and **save the
   HTML+CSS** and a **PNG screenshot** of every screen and state.
6. **Give it back to Claude** in one message per batch: the Figma link(s) *or* the HTML/CSS files +
   PNGs, and say which screens they are. Say "match the spec files in docs/stitch/ for behaviour".
   Claude will rebuild them in the real code (see section 5 for what it will and will not change).

### What to hand back (checklist)
- [ ] a PNG per screen at 1280px and at 390px, light **and** dark if you generate both
- [ ] the Figma frame URL or the exported HTML/CSS for each screen
- [ ] one line of anything you changed from the spec on purpose (a new colour, a moved region)
- [ ] the screens you did NOT redesign, so Claude leaves them alone

## 2. Product and brand facts

- Product: **FilmMakerStudio** — local-first browser tools for filmmakers: a hub, a story stage, a screenplay
  writer, pre-production (breakdown, stripboard, budget, schedule), production (shoot day), post (edit log,
  deliverables), a reference library, and an owner-only admin console. Writing tools are calm and literary;
  production tools are dense and operational; the console is the densest.
- Voice: plain sentences, no exclamation marks, no jargon. A failure says what was observed, never
  guesses a cause. Empty states say *what* is empty and *when it was checked*.
- Default theme is **dark ("ink")**: near-black ground with a violet cast. A **light ("paper")** theme
  exists: lavender-tinted white. Design both; they swap tokens only.
- Shapes: cards 16px radius with a 1px hairline border and a soft shadow; **buttons are pills**
  (fully rounded); fields 10px radius; focus ring 2px in the brand colour.
- Roles seen in the console: **owner**, **finance**, **support** (a member who is not an admin sees
  only "Administrators only"). Screens say which role can do what.

## 3. Design system prompt (paste first into Stitch)

> Design a desktop web admin console for a film-production software product. Dark theme by default:
> background #120f1c, raised cards #1b1727 with a 1px #2a2440 border and 16px corners, text #ece9f6
> with secondary text #c9c4db and muted #9a94b0. One accent: violet #9575f8 (lighter text variant
> #b69bfb, tint #241a3d). Status colours: success #34d399, warning #d6a44a, danger #f87171, each with
> a dark tinted wash for pill backgrounds (#102b22, #2e2415, #341a1c). Typeface Catamaran throughout,
> 14px body, 11–12px uppercase tracking-wide labels, 22–28px page headings. Buttons are fully rounded
> pills: primary violet fill with dark text, secondary outlined. Tables are dense with a sticky header
> and subtle row hover. Small pills for status. Calm and operational, generous spacing on an 8px
> grid, no gradients, no illustrations. Provide a matching light theme: background #f7f5fc, cards
> #ffffff with border #e4dff3, text #171233, accent #6d28d9.

## 4. Tokens (the real values; use these, do not invent new colours)

| Role | Dark (default) | Light |
| --- | --- | --- |
| Page background `--paper` | `#120f1c` | `#f7f5fc` |
| Card surface `--paper-raised` | `#1b1727` | `#ffffff` |
| Sunk/inset `--paper-sunk` | `#0d0b15` | `#f1eefa` |
| Border/edge `--paper-edge` | `#2a2440` | `#e4dff3` |
| Text `--ink` | `#ece9f6` | `#171233` |
| Body text `--ink-body` | `#c9c4db` | `#3f3960` |
| Muted text `--ink-muted` | `#9a94b0` | `#615a7d` |
| Faint text `--ink-faint` | `#6d6785` | `#9a93b0` |
| Brand `--brand` | `#9575f8` | `#6d28d9` |
| Brand as text `--brand-deep` | `#b69bfb` | `#5b21b6` |
| Brand tint `--brand-wash` | `#241a3d` | `#ede9fe` |
| OK / text / wash | `#34d399` / `#6ee7b7` / `#102b22` | `#15803d` / `#166534` / `#dcf5e4` |
| Warn / text / wash | `#d6a44a` / `#e8c384` / `#2e2415` | `#a04c08` / `#7f3c06` / `#fdf0d9` |
| Danger / wash | `#f87171` / `#341a1c` | `#c62828` / `#fde4e2` |
| Top band `--chrome` | `#16121f` (text `#f3f0fb`) | `#ffffff` (text `#171233`) |
| Floating surfaces (toast, tooltip, popover) `--panel` | `#1a1430`, text `#f1eefb` — dark in BOTH themes | |

Rules that matter: a status colour is a **fill**, never body text — text uses the "deep" variant on
a wash (otherwise contrast fails AA 4.5:1). Status colours are never the six phase hues. Text on a
brand-filled button is the dark on-fill colour, never the page background.

Type scale (px): 11 micro labels · 12 tiny · 14 small/body · 16 base · 18 lg · 22 xl · 28 2xl · 36 3xl.
Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Radii: field 10 · card 16 · large 18 · pill 999.
Shadows: sm `0 1px 2px rgba(0,0,0,.40)` · md `0 4px 16px rgba(0,0,0,.46)` · lg `0 18px 48px rgba(0,0,0,.54)`.
Font: **Catamaran** (display and body); code/ids in **JetBrains Mono**.
Breakpoints: ≥1100px = desktop (tab groups as a vertical sub-nav inside the content); <1100px = a
horizontally scrolling tab strip; <720px = phone (the app's own bottom bar appears).

## 5. Shared components (appear on many screens)

- **KPI tile** — label (11px caps, muted) over a large value (28px), optional delta chip (▲/▼ with
  good/bad tone), optional 14-day sparkline, optional "needs attention" tone; the whole tile is a link
  to where it is acted on.
- **Pill** — small rounded label; tones ok / warn / danger / neutral / accent; optional leading dot;
  always text on a wash.
- **Meter** — thin bar with a value/max label; tone from fill level.
- **Checklist** — rows with a state icon (✓ pass, ✕ fail, … waiting, – skipped) + title + muted note
  + optional link. A step that cannot be seen is "Not checked", never a pass.
- **Timeline** — rows of (time ago, title, sub-line with a mono target id, optional tone); absolute
  time on hover.
- **Diff** — two columns Before / After of key: value, changed keys highlighted.
- **Data table** — sticky header, hover row, keyboard-focusable rows (Enter opens), density toggle
  (comfortable / compact), caption for screen readers, designed empty row.
- **Drawer** — 520px right sheet over a scrim; sticky header; collapsible sections; Esc closes.
- **Empty state** — title, one-sentence body, optional action, and a "checked hh:mm" stamp.
- **Error state** — title, a sentence saying *why*, a Retry button.
- **Skeleton** — kpi / rows / block placeholders while loading.
- **Charts (all hand-drawn SVG)** — sparkline, bar, stepped funnel (with drop-off %), heat-grid
  (module × week), retention/conversion table; each has a hidden data table for screen readers and a
  tooltip on hover **and** keyboard focus.
- **Dialog** — confirm / danger-confirm / typed-confirmation (type a word or an e-mail to enable the
  button); states the consequence in a sentence.
- **Toast** — floating dark panel; success/error; an actionable toast ("View in audit log") stays until
  dismissed.
- **Shell** — top band (brand, project switcher hidden on admin, theme menu), the studio rail on the
  left (shared with the whole app — do not redesign it), then the console page: title "Console",
  status bar (TEST/LIVE pill, purchases-required pill, "Refreshed hh:mm · Refresh"), tab sub-nav
  grouped Run / People / Money / Product, then the tab content.


---

# PART B — Global shell, Studio Hub and Dashboard

## Part 02 — Global shell, Studio Hub, Project Dashboard

Source: worktree `.claude/worktrees/admin-fixes` (read-only). Files read: `src/ui/{shell,chrome,auth,mobile-nav,palette,project-switcher,stage-guide,tabs,section-menu,actionbar,dialog,trial-band,footer,tour,learn,topbar-backup,project-setup,no-project,stepper}.js`, `src/lib/{plan-gate,journey,readiness,navmodel,money}.js`, `src/pages/{hub,dashboard}.js`, `src/pages/hub/*.js`, `src/data/{navigation,tour,learn,glossary,brand}.json`, `src/styles/{tokens,chrome,palette,plan-gate,mobile-nav,dashboard,hub-doors}.css`.

### 0. Shared tokens and conventions (read once; every surface below uses them)

- **Theme.** Two themes. Default is dark ("Dark", stored id `ink`): ground `--paper` `#120f1c`, raised card `--paper-raised` `#1b1727`, text `--ink` `#ece9f6`, muted text `--ink-muted` `#9a94b0`, hairline `--rule` `#322c48`, brand/accent violet `--brand` `#9575f8`. Light theme ("Light", id `paper`): page `#f7f5fc` lavender, cards `#ffffff`, ink `#171233`, muted `#615a7d`, hairline `#ded8ef`, brand `#6d28d9`. Text on a brand fill is `--brand-on`. The theme follows OS until the user flips the toggle in the band.
- **Type.** Catamaran (400-800) for everything including display; JetBrains Mono for eyebrows, labels, key caps, counts (uppercase, letter-spaced); Courier Prime only for screenplay text; Noto Sans Tamil as fallback.
- **Shape.** Cards radius 16px (`--sk-radius`), 1px hairline border, buttons are pills (`--sk-btn-radius`/`--radius-pill`), primary button = violet fill + glow, secondary = outlined pill. Spacing `--s1..--s9` (4/8/12/16/24/32/...px), page gutter 16px on phone, 24px on desk.
- **Stage hues (each stage owns a colour, used only as a small dot, left rule, tint or label).** Story violet `#9575f8` · Screenplay gold `#d6a44a` · Pre-Production teal `#2dd4bf` · Production pink `#f472b6` · Post-Production fuchsia `#e879f9` (light-theme deeper variants exist). Library shelf is gold, Blueprints blue `#60a5fa`. Semantic ok/warn/danger are separate from these. Colour is never the only signal (words and glyphs accompany it).
- **Z-order (low to high).** page content < step rail 50 < `.sh-bar` band 100 (`--z-toolbar`) < rail drawer 102 / scrim 101 < dropdowns, focus timer, save indicator 150 < overlays (modals, sheets, palette, popovers) 1100 < toasts 1500.
- **Breakpoints.** 1100px: rail becomes a permanent left column and the band becomes a grid. 720px: phone mode (bottom bar, slim band). Below 1100 the rail is an overlay drawer.
- **Product name** (single source `brand.json`): "FilmMakerStudio"; short "Studio"; tagline "Write, plan and shoot your film"; support e-mail `support@filmmakerstudio.in`.
- **Navigation model** (`navigation.json`): 6 global entries, 5 stages with 24 modules. Used by rail, palette, Go-to sheet, launcher.

  | Global entry | Label | File | Material symbol | Purpose line |
  | --- | --- | --- | --- | --- |
  | home | Home | `index.html` | `home` | Your films, and where you left off |
  | dashboard | Dashboard | `dashboard.html` | `speed` | How far along the open film is, at a glance |
  | library | Library | `library.html` | `local_library` | Films, directors, rules, rates, case studies, dissection, glossary (shelf modules: Case Studies, Dissection, Film Terminology) |
  | settings | Settings | `settings.html` | `settings` | Your account, your AI key on this device, and how the studio looks |
  | purchase | Purchase | `purchase.html` | `shopping_cart` | Plans, checkout, your invoices and refund requests |
  | admin | Console | `admin.html` | `admin_panel_settings` | The application console (admin accounts only) |

  | Stage (hue) | Blurb | Modules (label · file#frag) |
  | --- | --- | --- |
  | Story (violet) | Idea, logline, beats | Beats & Pacing `story.html` · Idea Vault `vault.html#vault` · Pitch Deck `story.html#pitch` |
  | Screenplay (gold) | Write it, version it, bring one in | Screenplay Writer `screenplay.html` · Drafts `drafts.html` · Title Page `drafts.html#title` · Import Screenplay `screenplay.html#import` |
  | Pre-Production (teal) | Break it down, see it, plan it, cost it. Stage home: "Pre-production path" `preprod.html` | Screenplay Analysis, Scene Breakdown, Scene List, Elements, Auto-Tag, Songs (`breakdown.html#…`) · Screen Time, Cast Matrix, Sides, Production Reports (`reports.html#…`) · Shot List, Storyboard, Lookbook (`visualize.html#…`) · Reference Media, Locations, Shoot Calendar (`plan.html#…`) · Stripboard, Day Out of Days (`stripboard.html#…`) · Budget `budget.html` · Cast & Crew `contacts.html#contacts` |
  | Production (pink) | The shoot day | Shoot Day `shoot.html` · Call Sheets `contacts.html#call-sheets` |
  | Post-Production (fuchsia) | The cut, and what leaves the building | Edit Log `edit.html#log` · Deliverables `deliverables.html#checklist` |

- **Hub and Library/Settings/Purchase/Admin/Invite are "global mode" pages** (no project items in the chrome). Dashboard and every stage/module page are "project mode".

---

## PART A — GLOBAL SHELL

### A1. Top band (`.sh-bar`, built by `src/ui/shell.js`; controls from `chrome.js`, `auth.js`, `topbar-backup.js`, `project-switcher.js`)

**Purpose** One sticky navigation band that says where you are, lets you jump anywhere, and holds the studio-wide controls (project, backup, theme, account).
**Who sees it / when** Every app page (hub, dashboard, all module pages, library, settings, purchase, admin, invite). Hidden under the trial/plan "wall" (`[data-paywall]`) and absent on privacy/terms/refund/start. Two modes: `project` (full) and `global` (hub, library, settings, admin, purchase, invite: no stage strip, no Dashboard).
**Data source** `navigation.json` via `navmodel.js` (region-filtered); `fms_studio_theme_v1` (theme); Store project list/current project; `StudioCloud` session, sync state, gate role; `fms_studio_activity_v1` (last backup line). Nothing here writes storage except the theme toggle and a project choice.

**Layout**
- At >=1100px the band is a 4-column grid: `[breadcrumb (left, flexible)] [five stage pills] [search field] [right-hand tools zone]`. In global mode the grid is 3 columns: `crumb | search | tools` (no stage pills). Min height 52px, padding 8px 16px, bottom 1px hairline, background `--chrome` (near-black in dark, white in light), sticky at top (>=1100px; below that the band scrolls away with the page and only the phone bottom bar stays). A white/near-black "glass" strip, not a coloured one.
- 720-1099px: band is flex-wrap; row 1 = burger + crumb, row 2 = stage pills; search field stays at the end of row 1; page toolbar stacks.
- Below 720px: ONE slim row (burger + crumb + optional trial chip); stage strip, search field and tools zone are hidden (they move into the bottom bar's sheets). The crumb's stage segment opens the Go-to sheet at that stage.
- The Studio rail (A2) is fixed at the left edge beside it; at >=1100px `body` gets `padding-left: 76px` while the rail is open.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Left | Rail toggle `#railToggle` | burger icon button (3 lines), 44px tap | aria-label "Studio menu" | Opens/closes the rail drawer (below 1100px). At >=1100 the rail is open by default; the choice persists in `fms_studio_rail_open_v1` ("0" = closed). | `aria-expanded` true/false |
| Left (phone only, while a trial runs) | Trial chip `.sh-trial-chip` | small pill button right of burger | "Trial" + countdown e.g. "27:41" | Taps open the rail drawer (where the full timer lives) | Urgent colour in last 10 minutes; aria-label "Trial time left. Open the menu" |
| Left | Breadcrumb `nav#studioWhere` ("You are here") | text + icon steps separated by "›" | Pre-Production example: `[home icon] Studio › [stage dot] Pre-Production › [module icon] Scene List` followed by a muted purpose line "Every scene in order, with where it happens and whether it is day or night" (purpose only shows when there is room) | "Studio" is a link to `index.html`. The stage segment is a button: desktop goes to the stage's first module page; phone opens Go-to sheet at that stage. Last segment is the current page, `aria-current="page"`. On blueprint pages a 4th segment "Part II · Screenplay". If the page name equals the stage name (Story, Screenplay) the stage segment itself is current and the page segment is dropped. Crumb follows hash and scroll live. | Hub: only "Studio" (here) + purpose "Your films, and where you left off". Global pages: "Studio › Library › Dissection". Stage segment tinted by stage hue. |
| Left (after crumb) | "Sections" disclosure `#pageNavBtn` | text button with caret | "Sections ▾" (aria-label "Sections of this page", title "Jump to a section of this page") | Opens a panel headed "Sections of this page" listing the page's own in-page anchors (hub: "Projects"). Closes on Escape/outside/row click. | Only on pages that declare section links (hub, library); absent elsewhere. aria-expanded |
| Middle | Stage pills `.sh-phases` (project mode, >=720px) | 5 link-pills with a coloured dot + label | "Story", "Screenplay", "Pre-Production", "Production", "Post-Production" | Each is a plain link to the stage's first built module (Story→`story.html`, Screenplay→`screenplay.html`, Pre-Production→`preprod.html`, Production→`shoot.html`, Post→`edit.html#log`). Active stage has `.is-active` + `aria-current="page"`. Title attr = stage blurb. Strip scrolls sideways below 720 with edge fades. | Locked stage shows a small "PLAN"/plan-name flag (see A13); animates in when arriving from the dashboard |
| Middle-right | Search field `.sh-find` | pill field with magnifier glyph "⌕", an input, and a key cap | placeholder "Search the studio"; key cap "⌘K" (Mac) / "Ctrl K" | A launcher with a field's shape: click, Enter, or the first printable key opens the command palette (A4) carrying what was typed. title "Search the studio  (⌘K)". | Key cap and label hide when the band has a toolbar; field hidden below 720 |
| Right | Page toolbar `.toolbar` (hub: "Projects" link + hidden "⇣ INSTALL" button; blueprint pages: save status, step jumper, etc.) | adopted page controls | Hub: "⇣ INSTALL" (title "Install the Studio as an app", appears only when the browser offers install) | Install calls the browser install prompt | Save status text (blueprint pages) "●  ready" / saving states |
| Right | Tools zone `.sh-tools` ("Project, backup, theme and account") in this order: | group | | | |
| 1 | Project switcher `.ps-btn` | button: format tag + title + caret | e.g. `[Feature] Dragon ▾`. Empty: "No project — start one" or "Pick a project" | Opens the switcher popover (A5); with no projects navigates to hub | aria-label "Switch project"; title "Switch project (open: Dragon)" |
| 2 | Backup menu `[data-tb-backup]` | "Backup ▾" menu button + a small dot | "Backup" | Menu (A10 style): note line "Last backup: 2 hours ago" / "Never backed up" (dot turns warning when never or >7 days) · "Export everything" (hint ".json", title "Every project, not just the open one") · "Import a backup" · "Studio overview" (hint ".pdf") · divider · "Google Drive backup" (hint "Settings", link `settings.html#backup`) | aria-label "Backup — export, import, or back up to Google Drive. <note>"; right-aligned panel |
| 3 | Theme toggle `[data-theme-toggle]` | small button, glyph + word | "☾ Dark" or "☀ Light" (shows the CURRENT theme) | Flips theme; toast "Theme: Light" (1.4s). aria-label "Dark theme. Switch to Light." title "Switch to Light". Also Ctrl/Cmd+D. | Two states |
| 4 | Sign-in pill `#signInPill` | pill: avatar circle (initials, hidden when signed out) + 6px sync dot + label | Signed out "Sign in"; redirecting "Opening Google…" (disabled); signed in = first name e.g. "Arun" with avatar "AK"; gate closed "Invite needed" / "Invite pending" | Signed out: opens the sign-in modal (A6). Signed in: goes to `settings.html#account`. title signed out: "Sign in to back up your projects to your account and pick them up on another device. Local-only keeps working either way." signed in: "Signed in as arun@example.com · <sync detail> — open your account". | Dot tone by sync: ok/busy/waiting/error/off |
| Right | "How this works" help button | small pill with "▶ " | "How this works" | Appears after first interaction only on pages whose module has an approved video; opens a modal "How <Module> works" (or "How this works") with click-to-load video facades and a one-line "why" under each, and a "Close" button | Absent when no video |
| Hub only, leading | (Admin-only rail item etc. are in A2.) | | | | |

**Lists & tables / cards** — none (the band is chrome). Menu panels use the shared menu card: 1px hairline, 16px radius, `--panel`-family dark surface in both themes for floating family; rows 40px, icon + label + muted hint.

**States**
- *Loading:* the band is built synchronously; sign-in pill label "Sign in" until the cloud module answers; the whole document is hidden (veiled) until the site gate answers.
- *No project:* project switcher reads "No project — start one"; every project-page also shows the red "no project" banner (see A17).
- *Signed out / signed in:* pill as above; signed-in shows avatar initials and a coloured sync dot.
- *Trial running:* trial chip (phone) and rail block (A2). *Locked / walled:* band hidden entirely while the plan wall is up (A13).
- *Admin:* the Console rail item appears for admin accounts only.

**Dialogs & overlays opened from the band:** Switcher popover (A5), Backup menu, sign-in modal (A6), command palette (A4), shortcut sheet (A16), How-this-works video modal. Menus close on Escape; outside click closes; ArrowDown opens a menu on the first item, ArrowUp on the last; Home/End jump.

**Keyboard & accessibility** `⌘K / Ctrl K` palette; `⌘/Ctrl+D` theme; `?` shortcut sheet; `Esc` closes any open menu/dialog; band has `role="navigation"` "Studio navigation"; menus are disclosures (aria-expanded/controls), not `role=menu` except the action menu panels. Skip link "Skip to content" precedes the page.

**Sample data** Pre-Production, Scene List page, signed in as "Arun K" (arun.k@example.com), project "Dragon" (Feature), last backup "2 hours ago", Dark theme.

**Mobile (390px)** One row: burger (44px) · crumb "Pre-Production › Scene List" (stage segment opens Go to) · (trial chip). Everything else lives in the bottom bar (A3).

**Stitch prompt** Design the top navigation band of a dark violet filmmaking web app (ground #120f1c, cards #1b1727, accent #9575f8, Catamaran, pill buttons, 16px radius). A 52px sticky near-black band with a 1px hairline underneath. Left: burger icon button, then a breadcrumb "Studio › Pre-Production › Scene List" with small icons, the stage name tinted teal with a dot, a muted one-line purpose after it, and a "Sections ▾" disclosure. Centre: five pill links with coloured dots (Story violet, Screenplay gold, Pre-Production teal, Production pink, Post-Production fuchsia), active one highlighted. Then a search field "Search the studio" with a ⌘K key cap. Right zone: project switcher pill "[Feature] Dragon ▾", "Backup ▾" with a status dot, a "☾ Dark" toggle, and a sign-in pill with initials avatar "AK", green sync dot, label "Arun". Also show the 390px version: single row with burger and breadcrumb only.

---

### A2. Studio rail (`nav#studioRail.sh-rail`, `shell.js buildRail`, `trial-band.js`)

**Purpose** The app's permanent left navigation: global destinations (and, on a phone, the five stages) plus the live trial clock.
**Who sees it / when** Every shell page. Open by default at >=1100px (remembers `fms_studio_rail_open_v1`); below 1100px a drawer opened by the burger, with a dim scrim and focus trap; closes on link tap, Escape, or tapping the scrim.
**Data source** `navigation.json` `global[]` (+ `phases` on phones); `plan-gate.js markLocked()`; gate role (Console item); `PlanGate.trialEndsAt()` and server clock for the trial block.

**Layout** Fixed column, 76px wide, full height (above the bottom bar on phones), `--chrome` background, 1px right hairline, shadow when drawer. Items stacked top to bottom, each 76px wide: icon above an 11px label. Trial block at the foot. Drawer slides in from the left (`translateX`), z-index above the band.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Top | Home | rail item (Material symbol `home` + label) | "Home" (title "Your films, and where you left off") | link `index.html` | active |
| | Dashboard | `speed` | "Dashboard" (title "How far along the open film is, at a glance") | `dashboard.html`. Hidden in global mode. | active |
| | Library | `local_library` | "Library" | `library.html`; lit also on its module pages | active |
| | Settings | `settings` | "Settings" | `settings.html` | active |
| | Purchase | `shopping_cart` | "Purchase" | `purchase.html` | active |
| | Console | `admin_panel_settings` | "Console" | `admin.html`; present in DOM for everyone, HIDDEN unless the account's role is admin | hidden/visible |
| Phones only (<720px) | Stages group `.sh-rail-stages` (aria "Stages") | 5 items with stage icon + hue dot | "Story", "Screenplay", "Pre-Production", "Production", "Post-Production" (icons `auto_stories`, `edit_note`, `checklist`, `videocam`, `tune`) | each links to the stage's first built page; title = blurb + each module's "label: purpose"; locked stage carries a plan flag | active stage highlighted |
| Foot (only while a trial runs) | Trial block `.sh-rail-trial` | small card | label "TRIAL ENDS IN"; big mono timer e.g. "27:41" (ticks every second, role=timer); link "SEE PLANS" → `purchase.html` | Urgent colour in last 10 minutes; a hidden polite live region speaks at 10 min, 1 min, and expiry | hidden when no trial |

**States** Active item has a violet left accent and `aria-current="page"`. Locked modules elsewhere get a `PLAN` flag (A13). Closed drawer is `visibility:hidden` (not tab-reachable).
**Dialogs & overlays** On the ten-minute mark a toast: "10 minutes left in your free trial. Plans from ₹599, one payment. Everything you did stays." with action "SEE PLANS" (stays until dismissed).
**Keyboard & accessibility** Focus is trapped inside the open drawer; Escape closes; every item has a descriptive title/description.
**Sample data** Dark theme, signed in, trial running at 27:41, on `dashboard.html` (Dashboard item active).
**Mobile (390px)** Drawer 76px wide over a scrim; includes the five stages group below the global items.

**Stitch prompt** Design a narrow 76px-wide left app rail for a dark violet filmmaking product (#120f1c ground, #1b1727 surface, #9575f8 accent, Catamaran, JetBrains Mono for labels). Top-to-bottom icon-over-label items: Home, Dashboard (active, violet left accent bar and tinted background), Library, Settings, Purchase. Below them, a compact trial card at the foot: mono caption "TRIAL ENDS IN", a large mono countdown "27:41", and a pill link "SEE PLANS". Show a second variant of the rail as a phone drawer (390px) that also lists five stage items with coloured dots: Story violet, Screenplay gold, Pre-Production teal, Production pink, Post-Production fuchsia, over a dimmed scrim. Show an urgent state for the timer (warm tint, same words).

---

### A3. Phone bottom bar and its sheets (`chrome.js attachMobileActionBar`, `src/ui/mobile-nav.js`)

**Purpose** Phone navigation at 720px and below (and landscape-aware). Replaces the stage strip, search field and toolbar.
**Who sees it** Viewports <=720px, every shell page except those with `data-no-actionbar` (extension panel, screening room). Sets `html.mn-on`, publishes its measured height as `--mab-h`.
**Data source** `navigation.json`; project list; `data-sh-module` (the shell's current module); admin role; plan locks.

**Layout** Fixed bottom bar (`nav#mobileActionbar`, aria "Studio"), four equal items, each icon over label, 48px+ targets, safe-area padding. Sheets rise from the bottom: full width, max height `100dvh - 32px`, top corners radius 16px, 1px top hairline, sticky header with title and a 44px round "×" close button; page behind is scroll-locked.

**Elements (bar)**

| Item | Glyph | Label | Behaviour |
| --- | --- | --- | --- |
| Home | ⌂ | "Home" | link `index.html`; `aria-current` on the hub |
| Go to | ☰ | "Go to" | opens Go-to sheet (aria-haspopup dialog, aria-expanded) |
| Search | ⌕ | "Search" | opens the command palette (project mode only) |
| Tools | ⋯ | "Tools" | opens Tools sheet |
In global mode (hub, library, settings, admin, purchase) the third item is `⚙ Settings` (link `settings.html`) instead of Search.

**Go-to sheet** (title "Go to"): 1) a row of tiles (grid of 96px-min columns, 64px tall) for the app-scope destinations: Home, Dashboard (project mode only), Library, Settings, Purchase, Console (admins only), each icon over label; the current one marked. 2) Project group headed "Project: Dragon · Feature film · Switch" (or "Project: none open · Switch") with one row per project (same rows as A5), then link "+ New project" (or "No project — start one" when there are none). Project group hidden in global mode. 3) One group per stage (heading = hue dot + stage name) listing every module as a 48px row: icon, bold label, muted purpose line; planned modules show a "SOON" flag and are not links; locked modules show a plan flag; the current module is marked `is-here`. 4) Shelf groups: "Library" (Case Studies, Dissection, Film Terminology). Opening from a stage crumb scrolls to that stage's group. Sub-headings group modules (e.g. Pre-Production groups) as small caption lines.
**Tools sheet** (title "Tools"): borrows the REAL page toolbar and tools zone and returns them on close. Sections: "This page" (the page's toolbar: save status, page controls) and "Account and appearance" (project switcher, Backup menu, theme toggle, sign-in pill). Empty copy: "This page has no tools of its own."
**States** Sheets are `role=dialog aria-modal`, labelled by the title; Escape closes (unless a dialog/palette/menu is on top); tapping a destination in Go to closes the sheet first.
**Keyboard & accessibility** Focus trap; close returns focus to the opener; the bar items have `data-mn-item` ids and expose `aria-expanded`.
**Sample data** Go-to open on Pre-Production, current module "Scene List", projects: "Dragon · Feature · edited 2h ago", "Kaadhal Mazhai · Short · edited 3d ago".
**Mobile (390px)** This surface IS the 390px layout; desktop does not show it.

**Stitch prompt** Design the phone bottom navigation for a dark violet filmmaker app at 390px (ground #120f1c, surface #1b1727, accent #9575f8, Catamaran, 16px radius). A fixed bottom bar with four equal items: Home (⌂), Go to (☰), Search (⌕), Tools (⋯), icon above a small label, safe-area padding. Show the "Go to" bottom sheet open: sticky header "Go to" with a round × button; a grid of six small tiles (Home, Dashboard, Library, Settings, Purchase, Console); a project group "Project: Dragon · Feature film · Switch" with two project rows and "+ New project"; then stage groups with coloured dots (Story violet, Screenplay gold, Pre-Production teal, Production pink, Post-Production fuchsia), each listing 48px module rows with icon, bold label and muted one-line purpose, the current row "Scene List" highlighted, a "SOON" flag on one planned row and a "PLAN" flag on a locked one.

---

### A4. Command palette (`src/ui/palette.js`, `palette.css`)

**Purpose** One searchable index over modules, settings, scenes, people, places, projects, screenplay lines, commands and AI tools.
**Who sees it** Anyone on any shell page: `⌘K`/`Ctrl K`, the band's search field, the phone "Search" button, or typing into the field. Not on global phone pages (Settings takes that slot).
**Data source** Derived at open; writes nothing. Modules/globals from `navigation.json`; themes; projects (`listProjects`); scenes (`scenes.js`), contacts, script characters, locations, screenplay lines, AI entries (lazy-loaded after the shell paints). Recents are in memory only.

**Layout** Full-screen scrim (blurred, `--scrim`), box top-anchored (`padding-top` about 10vh) so the field never moves: width min(640px,100%), max-height min(68vh,560px), radius 16px, 1px hairline, modal shadow, `--paper-raised` surface. Stack: field row, optional one-line hint, results list (scrolls), footer key hints. On phones it is full-screen with a 44px "Close" button.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | States |
| --- | --- | --- | --- | --- | --- |
| Field row | Magnifier | glyph "⌕" (violet) | | | |
| | Input `#palInput` | combobox, large display font | placeholder "Search scenes, people, places, tools, settings, screenplay lines…" | Filters live; `aria-expanded/controls/activedescendant`; focus never leaves it | |
| | Close button | bordered mono caps pill | "Close" (aria-label "Close search") | Closes | min 44px |
| Hint line | prefix explainer | muted text, shown only when the field is exactly a prefix | `>`: "Commands only: back up, switch theme, open Settings, take the tour. Type to narrow." · `#`: "Scenes by number: type 12 for scene 12 and 12A." · `@`: "People only: crew contacts and the characters in your script." | | |
| List | Group separators | mono uppercase captions | "Recent" then "Everything" (empty field only) | | |
| | Result row | icon, label, muted sub, right tag | label + sub; right side group tag in mono (e.g. "Pre-Production", "Studio", "Scenes", "People", "Places", "Projects", "Appearance", "Help", "Commands", "AI", "Screenplay") and a status word "PARTIAL"/"SOON" where relevant | Enter/click navigates; active row highlighted | locked rows dimmed with plan flag; AI rows "AI: <label>" with sub "Opens the AI Desk" or "AI tools come with Pro" |
| Footer | key hints | mono | "↑↓ move" · "↵ open" · "esc close" · "> commands  # scene  @ people" | | |
| Live region | result count | polite status | e.g. "12 results" / "No results" | | |
| Empty | message | muted | "Nothing matches “zzz”. Try a module, a scene number or a name." (variants: "No command matches “x”. Clear the > to search everything." / "No scene numbered “x”." / "Nobody named “x” in your contacts or script." / "Nothing to show.") | | |

**Index contents (real rows)** Studio entries (Home, Dashboard, Library, Settings, Purchase, Console); every stage module with its purpose as sub (group = stage name); Projects ("Switch to this project"); Appearance ("Theme: Dark" / "Theme: Light" — "Switch the whole studio to dark"); Help ("Keyboard shortcuts — Everything this desk answers to", "Print this page — Uses the print stylesheet, not the screen one", "Jump to the top — Same as g g"); Commands (group "Commands"): "Export a backup — Every project, as one .json file", "Import a backup — Restore from a .json backup file", "Studio overview (PDF) — The studio overview as a paginated A4 document", "Google Drive backup — Connect Drive, back up now, restore an earlier version", "Open Settings — Account, data and backup, appearance", "New project — Start another film", "Take the tour — A short walk through the studio"; Scenes ("Scene 14 · INT. HOSTEL ROOM - NIGHT", sub = synopsis or "No synopsis yet"); People (crew contacts and script characters); Places; Screenplay lines (snippet with ellipses); AI ("AI key · Pro").
**Scoring** exact label > prefix > word-prefix > substring > subsequence; max 60 rows.
**States** Loading late content: overlay shows instantly, film rows land after. Empty field = Recent + everything.
**Keyboard & accessibility** `↑/↓` move, `Enter` open, `Esc` close (first), prefixes `>` `#` `@`; combobox/listbox/option roles; focus returns to opener.
**Sample data** Query "stri" → "Stripboard · Pre-Production · Your scenes in shooting order, grouped into shoot days" ; query "#14" → "Scene 14 · EXT. COLLEGE GATE - DAY"; query "@mur" → "Murugan · People · Cast".
**Mobile (390px)** Full-screen sheet; 44px Close; same list.

**Stitch prompt** Design a command-palette modal for a dark violet filmmaking app (#120f1c ground, #1b1727 card, #9575f8 accent, Catamaran, 16px radius, pill buttons). A dimmed blurred scrim; a 640px box anchored near the top. Header row: magnifier, a large input with placeholder "Search scenes, people, places, tools, settings, screenplay lines…", and a small bordered "Close" button. Under it a muted one-line hint. Results list with mono-caps separators "Recent" and "Everything"; each row has an icon, a bold label, a muted subtitle, and a right-aligned mono group tag (Pre-Production, Scenes, People, Commands, Help). One active row highlighted in violet tint. Include examples: "Stripboard", "Scene 14 · INT. HOSTEL ROOM - NIGHT", "Export a backup". Footer mono key hints "↑↓ move · ↵ open · esc close · > commands # scene @ people". Add an empty state and a 390px full-screen variant.

---

### A5. Project switcher popover (`src/ui/project-switcher.js`)

**Purpose** Change film from any page and land on that film's dashboard.
**Who sees it** Anyone with a band; button is the first control in the tools zone.
**Data source** `Store.listProjects()` (namespace-filtered), `Store.currentProject()`; writes only `setCurrentProject()` on a choice.

**Layout** Popover attached under the button (`position: fixed`, top = button bottom + 6px), width min(340px, viewport-16px), left clamped to the viewport, `role="menu"` "Projects", z above band. Rows 1-per-project.

**Elements**

| Element | Type | Text | Behaviour |
| --- | --- | --- | --- |
| Header | caption | "Switch project" | |
| Project row `.ps-item` | menuitem button, two lines | Title (e.g. "Dragon") + meta "Feature · edited 2h ago" (format words: Feature, Short, Doc, Music video, Ad film; time as "just now", "5m ago", "2h ago", "3d ago", else "Oct 5"); current row `is-current` + `aria-current` | Sets the project and navigates to `dashboard.html` |
| Link | "+ New project" | link to `index.html` | |
| Link | "All projects" | link to `index.html#projects` | |
Button face: `[Feature]` format tag + title + "▾"; empty: "No project — start one"/"Pick a project".
**States** No projects: clicking the button goes to the hub instead of opening. Closes on Escape (returns focus), outside mousedown, Tab, or any projects/current change.
**Keyboard** ArrowDown/ArrowUp/Home/End roam rows; first focus lands on the current row.
**Sample data** "Dragon — Feature · edited 2h ago" (current), "Kaadhal Mazhai — Short · edited 3d ago", "Vaanam Kottattum — Feature · edited Oct 5".
**Mobile** Same list is embedded in the Go-to sheet (A3); the popover is not used on phones.

**Stitch prompt** Design a small project-switcher dropdown for a dark violet filmmaking app (#120f1c, #1b1727 card, #9575f8 accent, Catamaran, 16px radius). A 340px popover under a pill button "[Feature] Dragon ▾". Header caption "Switch project". Three two-line rows: bold title and muted meta ("Feature · edited 2h ago"), the current one tinted violet with a check state; then two text links "+ New project" and "All projects". Add a hover and keyboard-focus state.

---

### A6. Sign-in modal (`auth.js` cloud auth modal) and account pill states

**Purpose** Optional account sign-in; Google is the only method.
**Who sees it** Signed-out user pressing the "Sign in" pill.
**Layout** Centered modal card (`.cm-card`) on a scrim, close "×" top-right.
**Elements** Eyebrow "ACCOUNT · OPTIONAL"; heading "Sign **in.**" (italic emphasis; variants "Account settings." / "Connect an account."); deck "Your writing is saved on this device either way. An account adds a durable backup and lets you pick the same project up on another machine."; error line (role alert, hidden); button "CONTINUE WITH GOOGLE" with Google mark (busy: "OPENING GOOGLE…"); hint "Sign in with your Google account — there is no separate password to remember."; admin-only link "Configure your own Supabase project →" and a config block (fields "Supabase Project URL", "Anon (public) key", button "SAVE & CONTINUE"). Share-invite variant adds a callout "📎 You have been invited: “Dragon” · role: editor. Sign in to claim it."
**States** busy, error text, config block hidden for normal visitors. Esc/× /scrim closes.
**Stitch prompt** Design a modest sign-in modal for a dark violet filmmaking app (#120f1c ground, #1b1727 card, #9575f8, Catamaran, 16px radius). Mono eyebrow "ACCOUNT · OPTIONAL", heading "Sign in." with italic "in.", a two-sentence deck about local saving versus backup, one full-width pill button with the Google mark "CONTINUE WITH GOOGLE", a muted hint line, a close ×. Include a busy state and an error line.

---

### A7. Stage guide panel (`src/ui/stage-guide.js` + `stage-guide-body.js` + `stepper.js`)

**Purpose** The blueprint's questions, answered inside each stage page, saved to the same blueprint blob.
**Who sees it** Stage pages (Story, Screenplay, Pre-Production, Production, Post): a "Guide" tab/section `#guide` (`data-tab-label="Guide"`). With no project it renders only the heading (the red no-project banner carries the message).
**Data source** `steps.stages.json` sidecar, `steps.feature.json`/`steps.short.json`, `story-paths.json`; storage via `blueprint-store` merge-write into `fms_filmmaker_combined_v1` / `fms_shortfilm_blueprint_v1`.

**Layout** A section: header (mono eyebrow "Guide · Pre-Production", `h2` "The questions for this stage." — Story's is "The cover sheet."), a deck paragraph, then `div.sg-body` holding a step bar and one step panel at a time with a footer. Lazy: "Loading the questions…" until near the viewport or `#guide` in the hash.
**Elements** Deck: "These are the Feature Blueprint’s questions for pre-production, answered here for “Dragon”. Your answers are the blueprint’s own — the same ones, saved in the same place." (Story: "Every question the Feature Blueprint asks for the story is answered in the path above, once. What is left here is the film’s cover sheet for “Dragon”: its title, writer and draft.") · cover fields (e.g. Project title, Writer / Director, Started on "DD / MM / YYYY", Stage, Working title, Genre dropdown "Pick a genre...", Draft "01 — Treatment") · step bar `nav.stp-bar` (numbered circular tabs, ✓ when done, labels) · step panel with the step's fields and tables (button "+ Add a row", note "Reorder, duplicate or delete rows in the full blueprint.", per-field private-note "✎") · footer `div.stp-nav`: "← BACK: <PREV LABEL>" · "Step 3 of 12" · "NEXT: <NEXT LABEL> →" (primary).
**States** Empty stage: "This stage has no blueprint questions."; failure: "The guide could not load. Reload the page to try again."
**Keyboard** Tabs use arrow keys in the stepper; fields autosave.
**Sample data** Pre-Production guide for Dragon, step "Step 3 of 11", NEXT: "VISION & LOOK →".
**Mobile** Single column; footer buttons stack; step bar scrolls.
**Stitch prompt** Design a "Guide" panel inside a dark violet filmmaking app stage page (#120f1c, #1b1727 cards, #9575f8, Catamaran, 16px radius). Mono eyebrow "GUIDE · PRE-PRODUCTION", heading "The questions for this stage.", a muted deck, a horizontal stepper of numbered circles with labels (done ones show ✓, current violet), one card with labelled text fields and a small table with a "+ Add a row" link, and a footer with "← BACK: LOCATIONS", centered mono "Step 3 of 11", primary pill "NEXT: VISION & LOOK →". Show loading ("Loading the questions…") and empty states.

---

### A8. Tabs / section menu (`src/ui/tabs.js`, `section-menu.js`)

**Purpose** A page's sibling sections as tabs instead of one long scroll.
**Who sees it** settings, admin, library, breakdown, stripboard, reports, contacts, visualize, write, plan, budget (explicit list); hash picks the tab (`breakdown.html#elements`).
**Layout** 3+ tabs: "side" layout — a vertical sub-nav column beside the panel at >=1100px (pinned), a horizontally scrolling strip plus a "Sections" sheet below. Fewer than 3: plain strip pinned under the band. Optional group headings, row icon (Material symbol), label, hint tooltip, count badge, ✓ done / ◐ doing marks, "PLAN" lock flag.
**Elements** `role=tablist` > `role=tab` buttons (aria-selected), `tabpanel`s; a "Sections" button (menu icon + "Sections") opens a sheet with the same frame as A3 (title "Sections", rows with label + purpose hint + badge/✓/◐/PLAN).
**States** locked tab shows inline lock card (A13). Keys: arrows, Home, End.
**Stitch prompt** Design a vertical section sub-navigation for a dark violet app page (#120f1c, #1b1727, #9575f8, Catamaran): left column of tab rows (icon, label, tiny count badge, ✓ or ◐ progress mark, "PLAN" lock flag) under small group headings, the active row violet-tinted with a left rule, content panel at right; plus a 390px version with a horizontally scrolling tab strip and a "Sections" button that opens a bottom sheet.

---

### A9. Footer (`src/ui/footer.js`)

**Purpose** Legal links, copyright, support, growth line.
**Who sees it** Every chrome page (appended to `<body>` after `#app`; clears the rail and bottom bar).
**Elements** `nav "Legal"`: "Privacy" (`privacy.html`) · "Terms" (`terms.html`) · "Refunds" (`refund.html`) · optional "Help on WhatsApp" link (only when a support number is configured; opens wa.me in a new tab) ; line "© 2026 FilmMakerStudio" ; hidden "Made with FilmMakerStudio — filmmakerstudio.in/start" line, shown only in print of a call sheet.
**Stitch prompt** Design a slim footer for a dark violet app: centered row of three muted links "Privacy · Terms · Refunds" plus an optional "Help on WhatsApp" link, under it small mono "© 2026 FilmMakerStudio"; hairline top border; dark #120f1c ground.

---

### A10. Action menus and page action bar (`src/ui/actionbar.js`)

**Purpose** Grouped page actions: a menu with a verb ("Export", "Backup") instead of twenty flat buttons.
**Component** `actionMenu(label, items)`: button `.btn.tb-menu-btn` with label + caret "▾" (compact variant: label only), panel `.tb-menu-panel` (role menu, hidden). Item types: link/button row with optional icon, label, right-aligned muted hint; separator; group heading; radio-choice rows; danger rows (red) kept at the foot below a separator. Panel clamps itself inside the viewport (right-aligned near the right edge; never under the rail). Keys: ArrowDown/Up/Home/End, Escape closes and returns focus. `wireActionBar()` binds all `data-action="tb-menu-toggle"` clicks and closes other menus.
**Example (real, Backup menu):** note line "Last backup: 2 hours ago" · "Export everything  .json" · "Import a backup" · "Studio overview  .pdf" · ─ · "Google Drive backup  Settings".
**Stitch prompt** Design a small action-menu dropdown for a dark violet app: outlined pill button "Backup ▾" with a status dot; panel (#1b1727, 1px hairline, 16px radius) with a muted note line, three rows with right-aligned mono hints (.json, ., .pdf), a divider, and a "Google Drive backup — Settings" row; include a red danger row example and focus states.

---

### A11. Toasts (`chrome.js StudioUI.toast`)

**Purpose** Transient notices; the only undo surface.
**Layout** Two live hosts fixed bottom area at z 1500: polite (`role=status`) and assertive (`role=alert`, errors only). A toast is a card with a coloured left rule by type (success, info, error), message, optional action button, and an "×" Dismiss when it has no timeout.
**Behaviour** Default 3.2s; a toast with an action stays until acted on or dismissed; every toast pauses on hover/focus; fade+slide in (distance times the motion factor, zero under reduced motion).
**Real examples:** "Theme: Light" (info, 1.4s) · "Switched to “Dragon”" (info, 1.6s) · "Project duplicated." (success) · "Renamed to “Dragon cut 2”" · "Dragon (2025) is open — 36 scenes, 105 pages, 18 shoot days, 29 on the unit list, and the script they were broken down from. Edit or delete any of it." (success, 6s) · "“Dragon” is now in arun.k@example.com — and still on this device." (success, 5s) · "10 minutes left in your free trial. Plans from ₹599, one payment. Everything you did stays." + action "SEE PLANS" · "Could not open the sample project. <reason>" (error).
**Stitch prompt** Design three stacked toast notifications for a dark violet app (#1b1727, hairline, 16px radius, Catamaran): a success toast with green left rule, an info toast with violet rule and a pill action button "SEE PLANS" and a small × dismiss, and an error toast with red rule.

---

### A12. Dialogs (`src/ui/dialog.js`, replaces native confirm/alert/prompt)

**Purpose** The only confirm, alert and prompt in the app.
**Layout** Scrim `.modal-overlay.dlg-overlay`; card `.modal.dlg` (role dialog, aria-modal, labelled by its `h3`): title (`h3`, default "Are you sure?"), muted paragraphs (`.deck`), optional tick box row, optional "Type X to confirm." hint + field, then `.modal-actions` with the cancel button first and the confirm button last (primary pill; red when `danger`). One at a time; Escape and scrim click = cancel; focus on the confirm button (or on the field for type-to-confirm/prompt).
**Variants** `ask` (confirm: buttons "Cancel" / "OK" by default), `askDanger` (red), `tell` (alert, single "OK"), `askText` (prompt with a text field, placeholder, Enter submits).
**Real examples** Delete project: title "Delete project “Dragon”?", body "All blueprint data inside it will also be deleted. This cannot be undone.", buttons "Cancel" / "DELETE" (red). Tell: "Give your project a title." (OK).
**Stitch prompt** Design a confirmation dialog for a dark violet app: scrim, centered 16px-radius card (#1b1727) with title "Delete project “Dragon”?", a muted two-line explanation, and two pill buttons at right: outlined "Cancel" and red-filled "DELETE". Also a second variant with a type-to-confirm field and disabled confirm.

---

### A13. Plan-gate walls and locks (`src/lib/plan-gate.js`, `plan-gate.css`)

**Purpose** Say plainly what the plan does and does not include; never hide or delete work.
**Who sees it** Signed-in users whose plan/trial excludes a module or has ended; only when the "purchases required" switch is on (currently off in production, so most users see none of these). Exempt pages: settings, purchase(s), invite, start, screening, admin.
**Data source** `billing_status()`, `plans` table, `price_notice()` via PlanGate; `trial_offer()`; `start_trial()` RPC.

**Variants**
1. **PLAN flag** `.pg-flag` — a tiny mono uppercase outlined pill appended to a locked rail/launcher/palette/Go-to door, text = lowest plan name (e.g. "INTERMEDIATE") or "PLAN"; title "Comes with the Intermediate plan" / "Not on your plan"; the door is dimmed to 55% opacity.
2. **Module lock** `.pg-lock` — a full-area panel (fixed below the band, `background --paper`, content centered top) hiding `main` (not removing it). Card width min(100%, 36rem), 16px radius, hairline. Content: mono eyebrow "Your plan"; heading "Not on the Basic plan." (or "Not part of the free trial." / "Not part of the access the studio gave you."); a list "What this part of the studio does" (each row: bold module label + muted purpose, left violet rule); paragraph "Breakdown, Scene List are part of a higher tier. Everything you have written here is still saved on this device; it reappears the moment the plan includes it."; plan line "Included in the Intermediate plan — ₹799, one payment."; buttons: primary "SEE PLANS" (becomes "UPGRADE FOR ₹200 MORE" when a credit applies) and "BACK TO THE STUDIO".
3. **Inline lock** `.pg-lock-inline` — the same card inside one tab/section (the section keeps its place in the tab strip, which shows PLAN).
4. **Trial wall** `.pg-lock.pg-wall` (band and phone bar hidden under it). Eyebrow "Your trial" ("The studio" when purchases are off). Headings by state: new user "Start your free trial." · lapsed "Your free trial is over." · other "Choose a plan to come in." · off "The studio is open to members.". Body e.g. "You have been reading Dragon — a complete Tamil feature, scene by scene. A plan opens the same desk for your own film: your script, your breakdown, your schedule, your budget, your call sheets." Safety callout (violet left rule, sunk surface): "Everything you wrote is still here. Nothing has been deleted and nothing is locked away from you — download all of it, right now, with no plan." Plans list (`ul` of linked rows: bold plan name, price right-aligned e.g. "₹599", muted blurb; footer row "One payment each. Nothing renews, and your work is already here."). Actions: primary "START MY 30 MINUTES" (or "START MY FREE TRIAL") for fresh users, "SEE PLANS", "DOWNLOAD MY WORK" (states: "PREPARING…", "DOWNLOADED", "COULD NOT DOWNLOAD"), "SIGN OUT". A status line (role status) prints refusals: "You have already had your trial on this account. A plan opens the studio for good." / "Trials are not open at the moment. A plan opens the studio for good." / "That did not start. Please try again." Deliberately calm: no red, no shake.
**Feature chips used in Settings → Plan:** Sample project only · New projects · Script import · PDF exports · Google Drive backup · AI tools · Remove branding.
**Stitch prompt** Design a calm "trial ended" wall for a dark violet filmmaking app (#120f1c, #1b1727, #9575f8, Catamaran, 16px radius). Centered 36rem card: mono eyebrow "YOUR TRIAL", heading "Your free trial is over.", a paragraph about reading the Dragon sample and what a plan opens, a callout with a violet left rule "Everything you wrote is still here… download all of it, right now, with no plan.", three plan rows (Basic ₹599, Intermediate ₹799, Pro ₹999, each with a one-line blurb), a muted "One payment each. Nothing renews." line, and buttons: outlined "SEE PLANS" primary variant, "DOWNLOAD MY WORK", "SIGN OUT". Also show a smaller module-lock card "Not on the Basic plan." with a module list and "SEE PLANS" / "BACK TO THE STUDIO".

---

### A14. First-run panel, project doors, "Start your film" sheet, hub New-project modal (`src/pages/hub/first-run.js`, `src/ui/project-setup.js`, `hub.js modalMarkup`)

**Purpose** What a stranger sees before anything is saved, and the one creation path for a film.
**Who sees it** Hub with zero projects (first-run doors); every "new project" control (sheet).
**Data source** `films.json`, `directors.json`, `rules.json` counts; `sample.dragon.json` figures; `studies.json` (favourite film cards); `PlanGate.allowed('new_projects')`; `Store.createProject({title, format, fav, adopt:true})`.

**First-run panel** (`div#doors.first-run-doors`): mono label "PICK A PATH"; deck "New to filmmaking? That is fine. Choose what you want to do first. We will ask for a name and a favourite film, then open your project dashboard, where you can always see how far you have got." Then three **door cards** (`.door`, auto-fit grid min 330px, gap 24px; 1 column on phones), each: tag row with a numbered circle + caps; big title with italic light second line; sub line; full-width CTA with arrow.

| Door | Tag | Title | Sub | CTA |
| --- | --- | --- | --- | --- |
| I (violet) | "I A FULL-LENGTH STORY" | "Feature *film.*" | "A story you tell over an hour or more. We walk you from the first spark to the finished film, one stage at a time." | "START A FEATURE →" (opens sheet, format feature) |
| II (blue, `.shorts`) | "II UNDER 30 MINUTES" | "Short *film.*" | "The quickest way to make something real. A tighter story, a smaller crew, a film you can finish and show." | "START A SHORT →" |
| III (gold, `.library`) | "III LEARN FIRST" | "Learning *library.*" | "Not ready to start? Read how films you know were built: 96 films, 10 directors and 40 rules of thumb. No project needed." (numbers are derived) | "OPEN THE LIBRARY →" (link `library.html`) |
Below: sample buttons "OR OPEN A SAMPLE FILM: DRAGON (2025)" and "OR OPEN A SAMPLE FILM: THE DARK KNIGHT (2008)" (titles = their blurbs: "A Tamil campus-to-corporate drama, scene by scene." / "A crime epic, imagined as a Chennai unit’s production, in rupees."); fine print "A sample is a real project you can edit or delete: a feature, its pages of script (Dragon has 105), the 36 scenes broken down from them, a crew and a budget. Everything you write stays in this browser unless you sign in."
**Sample-only state** (plan has `sample_only`): title "Open a sample film."; deck "Your free trial opens the sample projects — scenes, a crew, a budget and a schedule to explore in every module. A plan adds films of your own."; buttons "OPEN DRAGON (2025)", "OPEN THE DARK KNIGHT (2008)", and "SEE PLANS" (becomes "OWN FILM: <PLAN> ₹…").
**"Start your film" sheet** (`#projectSetup`, modal `form.ps-sheet`, ×-close top-right): heading "Start your *film.*" (becomes "Start your *short film.*"/"*feature film.*" with format); deck "Two quick questions. You can switch between films whenever you like and pick up where you left off."; label "PROJECT NAME" (text, max 120, default "My feature film"/"My short film", error "Give your project a name."); fieldset "FORMAT" with two radio pills "Feature film" / "Short film"; fieldset "YOUR FAVOURITE FILM" with hint "Pick one. We’ll explain every step with it, so the ideas land on a film you already know." and a grid of radio film cards (title, "Director · year", genre; hue-coloured), e.g. "Dragon — Ashwath Marimuthu · 2025 — Drama · Character study", "Por Thozhil — Vignesh Raja · 2023 — Investigative Crime Thriller", "Vikram Vedha — Pushkar–Gayathri · 2017 — Neo-noir · Moral thriller", "96 — C. Prem Kumar · 2018 — Romance · Memory"; actions "CANCEL" / primary "CREATE & OPEN". Creates, waits up to 3s for cloud settle, then goes to `dashboard.html`.
**Hub "New project" modal** (`#projectModal`, used for rename too): heading "New *project.*" (rename: "Rename *project.*"), deck "A project is the home for one film. Title and format. You can change the title later — format stays.", "PROJECT TITLE" input (placeholder "e.g. Por Thozhil, Untitled Thriller…"), "FORMAT" select (Feature film / Short film), "CANCEL" / "CREATE".
**Keyboard** Escape closes; focus trapped; name field auto-selected.
**Stitch prompt** Design a first-run "Pick a path" screen section for a dark violet filmmaking app (#120f1c, #1b1727 cards, #9575f8, Catamaran, 16px radius, pill buttons): mono label "PICK A PATH", a friendly deck, then three equal door cards in a row (stack on mobile): I "A FULL-LENGTH STORY — Feature film." violet with button "START A FEATURE →"; II "UNDER 30 MINUTES — Short film." blue "START A SHORT →"; III "LEARN FIRST — Learning library." gold "OPEN THE LIBRARY →". Each card has a numbered circle, large title with a lighter italic second word, a sub line. Under: outlined pill buttons "OR OPEN A SAMPLE FILM: DRAGON (2025)". Also design the "Start your film." modal sheet with project name, Feature/Short radio pills and a 2x2 grid of favourite-film radio cards, actions CANCEL / CREATE & OPEN.

---

### A15. Onboarding tour (`src/ui/tour.js`, `src/data/tour.json`; key `fms_tour_v1`)

**Purpose** A 10-step walkthrough of the studio on the Dragon sample.
**Who sees it** Started from the hub checklist button, Settings → Preferences → Help, or palette "Take the tour". Resumes across pages while active. State written only on a click/key.
**Layout** Non-modal `role=dialog` card (`aria-modal=false`, focus moves into it) anchored near the element it describes, with a highlight ring; on pages where the anchor is on another page a floating chip `div.tour-chip` ("Tour · step 4 of 10: Scene Breakdown" + "Continue" + "End tour"). A hub invitation block ("New here? Take a 2-minute tour of the studio." + "Take the tour" / "Skip") exists in code but has no host on Home now.
**Card elements** mono "Tour · step 2 of 10"; `h2` title; paragraph; actions: primary "Next: Story" (label = next step's title before the colon; last step "Finish the tour"; step 1 "Open the sample"), outlined "Back" (not on step 1), outlined "End tour"; hint "Esc ends the tour. You can start it again from the hub."
**The ten steps (title / body):** 1 "Start with a real film" — The Dragon sample is a complete production — a screenplay, its scenes broken down, a schedule, a unit list and call sheets… · 2 "Story: the idea, the logline, the beats" · 3 "Screenplay Writer: write the screenplay" · 4 "Scene Breakdown: what each scene needs" · 5 "Stripboard: scenes into shoot days" · 6 "Budget: what the schedule costs" · 7 "Call sheets: who, where, when" · 8 "Shoot day: on the phone, on the set" · 9 "Edit log: what is in the can" · 10 "Deliverables: what leaves, and where it goes" (counter reads "of 10").
**Hub first-week checklist** (section `#firstweek`, below the projects hero): mono label "YOUR FIRST WEEK", `h2` "Find your way round.", deck "Six things to try. The ticks are read from the open film every time this page draws — nothing here is stored.", right counter "2 OF 6 DONE", a segmented meter, six rows with a ✓ mark: "Write a logline or a synopsis", "Start the screenplay", "Have a scene in the Scene List", "Put a scene on a shoot day", "Make a call sheet", "Mark a scene on the shoot day"; buttons primary "Take the tour" (or "Resume the tour" / "Take the tour again") and "Hide this list"; on the sample: "You are in the sample film, so these stay unticked. Start your own film to tick them off." Finish toast: "Tour finished. The first-week list on the hub keeps count."
**Stitch prompt** Design an onboarding tour popover for a dark violet filmmaking app (#1b1727 card, #9575f8, Catamaran, 16px radius): mono caption "Tour · step 4 of 10", title "Scene Breakdown: what each scene needs", body paragraph, a violet highlight ring around a page element behind it, buttons primary "Next: Stripboard", outlined "Back" and "End tour", muted hint "Esc ends the tour." Also a bottom floating chip "Tour · step 4 of 10: Scene Breakdown · Continue · End tour". And a "YOUR FIRST WEEK" checklist card with six ticks and a segmented meter.

---

### A16. Learn panel, glossary popovers, shortcut sheet, no-project banner

**learn() panel** (`src/ui/learn.js`, topics in `learn.json`, 55 topics) — a quiet `<details class="learn">` line: summary text is a question ("What is a logline?" / "What is an arc?"), closed by default; body built on first open: while loading "Loading…"; then definition (from glossary), a Tanglish line (mono, italic), "In Dragon: <film example>" (+ a short list of other films' examples "96: …"), up to two click-to-load videos, a "Why it matters" labelled block (<=260 chars from the blueprint step), and a link "Go deeper: the blueprint step" or "Go deeper: film terminology" (`library.html#…`). Failure shows a link "Open film terminology". Writes nothing.
**Glossary popover** (`#glossaryPopover`, `chrome.js`) — dotted-underline terms in prose (`.glossary-term`, aria-label "<term> — what this means, with examples"); on hover/focus a small floating card (z overlay, kept 8px inside the viewport, above the term else below): mono caps term (e.g. "LOGLINE"), definition, Tanglish line, then examples: bold film name + note ("Dragon A college dropout buys a fake degree…"). Enter/Space toggle, Esc closes without moving focus.
**Shortcut sheet** (`#shortcutSheet`, `?` key) — modal "Keyboard *shortcuts.*" deck "A working desk needs muscle memory. Press ? any time." table of key caps and meanings: `?` Open this shortcut sheet · `Esc` Close any open dialog / dropdown · `⌘/Ctrl S` Save current blueprint · `⌘/Ctrl D` Switch theme (Dark ↔ Light) · `j` Next step (in any blueprint) · `k` Previous step · `g g` Jump to top · `G` Jump to end · `/` Focus the search input on this page (the hub, the blueprints) · `⌘ K` `Ctrl K` Search the whole studio — modules, scenes, people, places, script lines. Start with > for commands, # for a scene number, @ for a person. A page may append its own group (e.g. the screenplay writer's key preset).
**No-project banner** (`#studioNoProjectBanner`, role status, fixed at the top of project-writing pages when no project is open) — red-tinted strip: "NO PROJECT OPEN — what you do here is kept on this device, and moves into the next project you create." + link "CREATE OR OPEN A PROJECT →" (`index.html`).
**Stitch prompt** Design four small supporting UI pieces for a dark violet app (#1b1727, #9575f8, Catamaran, 16px radius): (1) a collapsed "What is a logline?" disclosure row that expands into a definition card with a muted Tanglish line, "In Dragon: …" example, a "Why it matters" block and a "Go deeper" link; (2) a floating glossary tooltip with mono caps "LOGLINE", definition, Tanglish, and film examples; (3) a "Keyboard shortcuts." modal with a two-column table of key caps; (4) a thin red-tinted banner "NO PROJECT OPEN — … CREATE OR OPEN A PROJECT →".

---

## PART B — STUDIO HUB (`index.html`, `src/pages/hub.js`, `src/pages/hub/*`)

### B1. Studio Hub

**Purpose** Landing page of the app after the gate: pick, continue, create, back up and share films.
**Who sees it / when** Every signed-in (or open-build) visitor; title "FilmMakerStudio". Global shell mode (no stage strip). Welcome card appears once after a purchase (`?welcome=plan`).
**Data source** `Store.listProjects()/currentProject()` (namespace-scoped by account `ns`); `fms_studio_projects_v1`; per-project blueprint blobs `fms_filmmaker_combined_v1__<id>` / `fms_shortfilm_blueprint_v1__<id>` read raw for percent; `fms_studio_activity_v1` (30-line log); `fms_tour_v1`; `PlanGate` (sample_only, new_projects); samples `sample.dragon.json`, `sample.darkknight.json`; `preprod-path.js` for the Today line (lazy). RPC none directly.

**Layout (1280px, top to bottom)**
1. Band (global mode grid: crumb "Studio · Your films, and where you left off" | search | tools); left rail 76px open.
2. `main#main` > hero `section#top` > `section#projects` (inner width up to the page measure, 24px gutters):
   - optional Welcome card `#welcomePlan` (before projects).
   - `.projects-head`: left = mono label "PROJECTS · ONE PER FILM", `h1#projectsHeading` "Continue *where you left off.*" (zero projects: "Pick *a path.*"), greeting line `#hubGreeting`; right = primary pill "+ NEW PROJECT".
   - `#adoptNotice` (hidden unless signed in with device-only projects).
   - `#todayLine` "Today" strip (hidden until loaded and only with scenes).
   - `#projectsToolbar` (hidden when fewer than 2 projects): search, filter group, sort select.
   - `#projectsGrid`: project cards, or first-run doors (A14), or empty/no-match states.
3. First-week checklist section `#firstweek` after the hero (A15).
4. Footer (A9).
Projects grid: `repeat(auto-fill, minmax(280px, 1fr))`, gap 16px (4 cols at 1280 inside the measure: typically 3-4 cards per row); 1 column at 390.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Head | Eyebrow | mono label | "PROJECTS · ONE PER FILM" | | |
| Head | Heading `h1` | large display | "Continue *where you left off.*" / "Pick *a path.*" | | italic accent on the second part |
| Head | Greeting | muted sentence | zero projects: "Good morning. **The desk is empty** — what are we making?"; open project: "Good afternoon. Active project: **Dragon** · 3 total."; none open: "Good evening. **3 projects on the desk.** Pick one to keep working." (greeting by hour: "Working late" <5 or >=21, "Good morning" <12, "Good afternoon" <17, "Good evening" <21) | | |
| Head | New project | primary pill | "+ NEW PROJECT" | opens A14 "Start your film" sheet via hub modal | hidden if plan lacks `new_projects` |
| Banner | Welcome card | section | title "You’re on Intermediate. Welcome in." (or "Welcome in."); deck "Your plan is active — one payment, yours for good. Your invoice is listed on the Purchase page."; buttons primary "START YOUR FILM", "SEE WHAT UNLOCKED", "DISMISS" | | one-time |
| Adopt panel `.adopt-panel` | region "Projects on this device only" | card | eyebrow "ON THIS DEVICE ONLY"; title "One project is on this device and not in this account." / "3 projects are on this device and not in this account."; deck "Nothing is copied and nothing is taken away. It stays on this device, in this browser, exactly where it is — and also become reachable while you are signed in as arun.k@example.com. One copy of the work, listed in both places: sign out and it is still here."; "This affects one project:" / "This affects all 3 of them:"; list rows (name + format caps); primary "ADD IT TO THIS ACCOUNT" / "ADD ALL 3 TO THIS ACCOUNT"; fine "A film can belong to this device and to one account. To put one into a different account, download a backup here and import it there." | Not dismissible; disappears when nothing is adoptable | signed-in only |
| Today line `.today-line` | strip | mono "Today"; text "Pre-production · step 3 of 11 · next: **Vision & look**" (all done: "Pre-production · every step done · **ready to shoot**"); primary pill "Open →" (aria "Open Vision & look — Dragon") | Hidden with no open film or no scenes | |
| Toolbar | Search | search input | placeholder "Search projects by name…" | filters the grid live | |
| Toolbar | Filter group | pill toggles | "ALL" (active) · "FEATURE" · "SHORT" (+ "DOC" / "MV" / "AD" only if such projects exist) | | |
| Toolbar | Sort select | select | "↻ RECENT" · "A → Z" · "OLDEST" | | |
| Grid | **Project card** | card, role button, tabindex 0 | see below | click/Enter switches project (toast "Switched to “Dragon”") | active / format-colour / hover |
| Grid | New-project tile | dashed card | "+" and "NEW PROJECT" (aria "Create new project") | opens sheet | hidden without `new_projects` |
| Grid | Plan note | muted text | "Your free trial opens the sample films. A plan adds films of your own." then link e.g. "Intermediate ₹799" + " adds films of your own — one payment." | | sample-only plans |
| Empty-filter | card | title "No projects match." deck "Try a different filter or clear your search." button "RESET FILTERS" | | |

**Project card (cards)** — top-right hover actions: "✎" Rename, "⎘" Duplicate, "×" Delete (aria-labelled, titles "Rename", "Duplicate", "Delete"). Top line mono caps: "FEATURE FILM · ACTIVE · PRE-PRODUCTION" (format · "ACTIVE" if open · stage label from the journey, or "EMPTY" when nothing started, or "ALL 5 STAGES"). Title (display, double-click renders rename; title attr "Double-click to rename"). Bottom row: muted "69% · edited 2h ago"; right cluster: "↗ SHARE" (opens share dialog; needs cloud) and link "open →" (switches and goes to `dashboard.html`). Format colours: feature violet, short blue; active card has a violet outline.
**Example card:** `FEATURE FILM · ACTIVE · PRE-PRODUCTION` / **Dragon** / `69% · edited 2h ago` · `↗ SHARE` `open →`.

**States**
- *Loading:* first paint synchronous; hub idle-imports the Today line.
- *Empty (no project):* three doors + sample buttons (A14); toolbar hidden.
- *Sample-only plan:* only sample projects listed; sample-only panel.
- *Signed in vs out:* adopt panel only signed in; account projects filtered by namespace.
- *Error:* sample failure toast "Could not open the sample project. <reason>"; share without cloud → dialog "Sharing requires the cloud module — please configure it from Settings."
- *Filters yielding nothing:* "No projects match."

**Dialogs & overlays** Start-your-film sheet (A14); rename modal ("Rename *project.*"); delete confirm (A12: "Delete project “Dragon”?" / "All blueprint data inside it will also be deleted. This cannot be undone." / DELETE red); share dialog (cloud: role selector "Share role", expiry "Expiry"); toasts ("Project duplicated.", "Renamed to “…”", "Project “…” created.", sample-opened toast); adopt result toast.
**Keyboard & accessibility** `/` focuses the page search; Enter/Space activate cards (inner buttons keep their own keys); `⌘K` palette; Escape closes modals; cards have aria-label "Switch to project Dragon"; the hub's `h1` is the projects heading.
**Backup menu** lives in the band (A1), not on the hub body: "Export everything", "Import a backup", "Studio overview", "Google Drive backup".
**Not drawn (exists in code only):** resume cards, the cover/launcher on Home and the tour invitation host were removed from the page (12 Oct 2026); do not design them.

**Sample data**
```
Greeting: "Good evening. Active project: Dragon · 3 total."
Today: Pre-production · step 3 of 11 · next: Vision & look      [Open →]
Cards:
 FEATURE FILM · ACTIVE · PRE-PRODUCTION   Dragon                    69% · edited 2h ago
 SHORT FILM · SCREENPLAY                  Kaadhal Mazhai            34% · edited 3d ago
 FEATURE FILM · EMPTY                     Vaanam Kottattum          0% · edited Oct 5
 [+ NEW PROJECT]
Checklist: YOUR FIRST WEEK — 4 OF 6 DONE
```
**Mobile (390px)** Band collapses to burger + crumb "Studio"; bottom bar Home · Go to · Settings · Tools; head stacks (heading, greeting, full-width "+ NEW PROJECT"); toolbar stacks (search full width, filter pills wrap, sort full width); grid 1 column; doors stack one per row with full-width CTAs; adopt panel full width.

**Stitch prompt** Design the Studio Hub home screen for a dark violet filmmaking web app (ground #120f1c, cards #1b1727, accent #9575f8, Catamaran, pill buttons, 16px radius). Left 76px icon rail; slim top band with breadcrumb "Studio · Your films, and where you left off", a search field "Search the studio ⌘K", and project/backup/theme/sign-in controls. Content: mono label "PROJECTS · ONE PER FILM", h1 "Continue where you left off." (italic violet second half), greeting "Good evening. Active project: Dragon · 3 total.", primary pill "+ NEW PROJECT" top-right. A "Today" strip: "Pre-production · step 3 of 11 · next: Vision & look" with "Open →". A search/filter/sort row (ALL, FEATURE, SHORT pills; ↻ RECENT). A 3-column grid of project cards (mono caps "FEATURE FILM · ACTIVE · PRE-PRODUCTION", title "Dragon", "69% · edited 2h ago", "↗ SHARE" and "open →", hover icons ✎ ⎘ ×, active card violet outline) plus a dashed "+ NEW PROJECT" tile. Below, a "YOUR FIRST WEEK" checklist card with six ticks. Also create the empty "Pick a path." state with three door cards (feature violet, short blue, library gold) and the 390px layout.

---

## PART C — PROJECT DASHBOARD (`dashboard.html`, `src/pages/dashboard.js`, `src/lib/journey.js`)

### C1. Dashboard

**Purpose** Where the open film stands: what to do next, how ready it is, the five stages, this week's shoot days, and the full module map. Read-only: it stores nothing (the only write is choosing a project elsewhere).
**Who sees it / when** Anyone with a shell; project mode. Lands here after creating, switching or opening a project. Re-renders on `current:changed`.
**Data source** Derived at render from: `scenes.js`, `locations.js` (shoot days, unscheduled), `contacts.js` (people, call sheets), `shots.js` (shots, boards), `script.js` (pages, drafts), blueprint blobs (`fms_filmmaker_combined_v1`/`fms_shortfilm_blueprint_v1`), `fms_library_calc_v1` (budget lines: days x rate, ₹ via `fmtINR`), `fms_studio_activity_v1` (log), `scenes.shotAt`, `readiness.js`, `journey.js` (stage states, suggestNext, lastWorked), `PlanGate.currentPlan()`, `getDriveStatus()`, `dpr.js`, `preprod-path.js` (lazy), `studies.js` (favourite film title, lazy), `navigation.json` (launcher).

**Layout (1280px, top to bottom; content width 1200px, 24px gutters)**
1. Band (project mode, Dashboard highlighted in the rail; crumb "Studio › Dashboard").
2. Header `.bd-head.db-head`: eyebrow, h1 title, deck, favourite line, stats strip.
3. **Focus row** `#focus`: 2 cards, auto-fit min 360px (2 columns at 1280): "Continue" card, "Readiness" card.
4. **Stages** `#stages`: eyebrow "The five stages", h2 "Where the film stands.", ordered list `#journey` of 5 stage cards, auto-fit min 200px (5 across at 1280, wrapping to 2-3 across below ~1100), then footnote.
5. **Body** `.db-body`: at >=1100px a 2-column grid `minmax(0,1fr) | 280-340px`: left main column `.db-col` (The chain, Readiness `#readiness`, Recent) and right sticky `aside#desk` (this week, plan, backup). Below 1100: one column, desk after the column.
6. **Launcher** `section#modules` "THE MAP · EVERY MODULE BY PHASE" (full width).
7. Footer.
Sticky: band; desk aside is `position: sticky` at >=1100px.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
| --- | --- | --- | --- | --- | --- |
| Header | Eyebrow | mono | "Feature film · Project dashboard · Stage: Pre-Production" (format word: Feature film / Short film / Documentary / Music video / Ad film) | | |
| Header | Title `h1` | display | project title e.g. "Dragon" | | |
| Header | Deck | muted | "Five stages, in any order, each read from what you have already made. Nothing is mandatory: with a screenplay in hand, start straight in Pre-Production." | | |
| Header | Favourite line `#favourite` | muted + link | "Favourite film: **Dragon** · change" or "No favourite film chosen yet · choose one" (links to `settings.html#favourite`) | | |
| Header | Stats strip `.bd-stats` | 6 stat tiles (big number over small label), auto-fit min 150px | "36 scenes" · "13¼ pages"-style eighths figure + "pages" · "18 shoot days" · "29 people" · "48 shots" · "₹ 1.42 Cr budget" (singular/plural aware: scene/scenes, shoot day/days, shot/shots) | | hidden when the project is entirely empty |
| Focus 1 | "Continue" card `.db-up` | tile: eyebrow "Continue", h2 "Pick up where you left off", line `#resume` "Scene Breakdown — 18 of 36 scenes tagged · edited 2h ago", primary big pill "Continue  →" (link to the last-worked place) | | |
| Focus 1 | Suggested-next block `#suggested` | inset: eyebrow "Suggested next · only a suggestion", stage line (hue dot + bold stage name e.g. "Pre-Production"), reason ("Nothing started yet, so the story is a natural first step." / "Work is under way here." / "Everything started is finished; this is the earliest stage not started."), outlined pill "Go to Pre-Production  →", link "Next step: Vision & look"; when all done: "Every stage is done. Open any card to review it." | | |
| Focus 2 | "Readiness" card `.db-ready` | tile: eyebrow "Readiness", h2 "Three things to do"; big score "9/12" + "checks pass"; segmented bar (one segment per check, ordered blockers, gaps, passes, colour red/amber/green plus text); line "Readiness: 9 of 12 checks pass · 2 blockers, 1 gap"; up to 3 actions (link e.g. "Scenes not on a shoot day — 4" + muted hint "Unscheduled scenes are invisible to the stripboard and to every report after it."); link "See every check ↓" (`#readiness`) | no scenes: "No scenes yet, so nothing to check." + link "Add the scenes" + "Readiness is derived from them." | |
| Stages | Stage card `li.st-card` (id `stage-<id>`) | hue-tinted card, 6 rows | head: "Part I" + chip "Suggested next" or "You are here"; name h3 (Story / Screenplay / Pre-Production / Production / Post-Production); status "○ Not started" / "◐ In progress" / "● Done"; two meters "Guide 42%" and "Tools 3/8" (bar + value, "—" when none); facts list; actions: pill "Start  →" / "Continue  →" / "Open  →" (primary on the suggested card) + for not-started Screenplay link "Already have a screenplay? Import it", Pre-Production "Have a screenplay? Upload it and we’ll break it down" | Card is a link target; status never colour-only | suggested / current / none / doing / done |
| Stages | Footnote `.db-foot` | muted | "Guide is how much of the blueprint is answered; Tools is how much of the stage’s work exists. Prefer to be asked questions? **Guided questions** (42% answered) are a companion, not a step." | | |
| Main col | **The chain** `#chain` | eyebrow "The chain", h2 "Scene to call sheet.", deck "One scene model, read by every module below. Move a scene and all of these move with it."; four groups with caption + card grid (min 170px): see below | | hidden when project empty |
| Main col | **Readiness** `#readiness` | eyebrow "Derived from your scenes · nothing to tick" (coloured dot by worst state), h2 "Could you shoot tomorrow?", deck "2 things would stop a shoot day, and 1 more will cost you one." / "Nothing blocks a shoot day. 1 thing is still missing." / "Every check passes. Nothing here is missing."; failing rows `.rd-row` (marker •, bold "Scenes not on a shoot day — 4", muted item names "Scene 7 · Scene 9 · … and 3 more" (max 8), hint sentence, link "Fix it →"); then "Passing · 9 of 12" and ✓ chips "Scenes with no location — none" | Empty state: deck "Nothing to check yet. Once this film has scenes — written, imported or broken down — and this becomes a list of what would stop a shoot day." (the id always renders) | |
| Main col | **Recent** `#recent` | eyebrow "Recent", h2 "What moved lately.", deck "Blueprint progress, equipment lists and backups from the studio log, plus scenes marked shot on set. Edits to scenes, people and the script are not logged. This project only."; ordered rows: link text + right time ("12m ago", "2h ago", "3d ago", "2mo ago") | Not rendered when no entries (max 8) | |
| Desk | **This week** | tile: eyebrow "This week", h2 "Shoot days and call sheets"; bold line "Next shoot: day 4 · in 3 days" (or "Shoot countdown: no upcoming dated day." / "…no shoot days planned yet."); rows for days -1..+7: link "Day 4 · in 3 days" + muted "5 scenes · no call sheet" or "call sheet made" (+ " · report started/not started" for today and past); empty: "No shoot day falls in the next seven days." / "No shoot day has a date yet." + link "Open the Shoot Calendar" | | |
| Desk | **Plan** | tile: eyebrow "Plan", h2 "Your plan"; line: "Not signed in — working locally on this device" / "Intermediate plan" / "Access given by the studio" / "Free trial" / "Free to use right now" / "No plan yet"; button "Manage plan" or "See plans" (`purchase.html`) | | |
| Desk | **Backup** | tile: eyebrow "Backup", h2 "Is your work safe?"; status "● Google Drive: connected, last synced 2h ago." / "Google Drive: connected, not yet synced." / "Google Drive: not connected."; note "Everything lives in this browser. A backup file is the only other copy unless Drive is on; this page cannot see when you last exported one."; button "Export a backup" (to `index.html`) | | |
| Foot | **Launcher** `#modules` | label "THE MAP · EVERY MODULE BY PHASE"; h2 "Every tool, *24 modules.*" (count derived); deck "A film moves through these in order, and so does the studio. Open any module directly."; right counts "24 OF 24 BUILT" and "9 HOLD WORK"; then a row per stage: phase tile (label, blurb, "5 of 5 ready", "3 with work" or "nothing here yet") + grid of module tiles (icon, bold label, purpose, state chip showing work state, "PARTIAL"/"SOON" flag, "THIS PAGE" mark, plan flag if locked); a "YOU ARE HERE" line with trail | | |

**Chain cards** (number, label, note, link; hue left rule): *Breakdown* — "36 / Scenes / Breakdown — the one place a scene is typed" · "13 / Scene pages / Length in eighths, from the breakdown" (value formatted as pages and eighths) · "142 / Elements tagged / Cast, props, wardrobe, vehicles" · "105 / Screenplay pages / Written in the editor · 3 drafts saved". *Plan & Schedule* — "17 / Locations / Distinct places named on a scene" · "18 / Shoot days / 4 scenes still unscheduled" (or "Every scene has a day") · "12 / Dated days / Shoot days with a real date against them" · "₹ 1.42 Cr / Budget / ₹ 1,42,00,000 across 31 line items" (or "Nothing costed yet"). *Budget & People* — "29 / Cast & Crew / Cast and crew, by department" · "6 / Call sheets / Built from the day, the scenes and the people". *Visualise* — "48 / Shots / Shot list, hung off the scenes" · "9 / Storyboards / Frames, in order".

**Stage card example (Pre-Production, suggested):** `Part III` `Suggested next` / **Pre-Production** / `◐ In progress` / Guide `31%` · Tools `5/9` / facts: "Step 3 of 11 · next: Vision & look", "36 scenes · 18 tagged broken down" / [Continue →] (primary).
Other stage facts (real patterns): Story "6 of 14 questions done", "182 words of synopsis"; Screenplay "105 pages", "36 scene headings" (or "No screenplay yet"); Production "12 of 36 scenes shot", "2 part-shot", "1 dropped" (or "No scenes to shoot yet"); Post "9 of 12 scenes in the cut" (or "No cut logged yet").

**States**
- *No project open:* header eyebrow "Studio", h1 "Project dashboard", deck "Where a film stands across story, screenplay, pre-production, production and post — read from the project you have open."; empty block (`#stages`): mark "◴", h2 "Pick or start a project", text "The dashboard reports on one film at a time. Start a new project or open one of yours, and its five stages appear here.", primary "Pick or start a project  →" + outlined "Look around the library first"; plus the Readiness section empty state.
- *Project with nothing in it (`isEmpty`):* stats strip and The chain are omitted; Focus, Stages, Readiness (empty state), Desk, Launcher remain.
- *Loading:* synchronous; favourite film title and the pre-production path fact (adds a "Step N of M · next: …" line to the Pre-Production card) land after idle.
- *Signed in/out/plan:* only the Plan and Backup tiles vary.
- *Error:* a stage that cannot be read shows fact "Could not be read".
- *Locked modules:* launcher tiles and stage doors carry plan flags (A13).

**Dialogs & overlays** None own; shell overlays apply. A plan-limit refusal is carried from project creation as a toast.
**Keyboard & accessibility** Stage list is `ol` labelled "The five stages of this film"; each stage button has aria-label e.g. "Continue Pre-Production — In progress"; readiness bar `role=img` with a text equivalent; sections use `aria-labelledby`; fragments `#stages #journey #readiness #focus #desk #recent #chain #modules #suggested #resume #favourite` always exist; `scroll-padding` accounts for the sticky band; reveal animations disabled under reduced motion.
**Sample data** (Dragon, Feature, Pre-Production stage, Dark theme)
```
Feature film · Project dashboard · Stage: Pre-Production
Dragon
Favourite film: Dragon · change
36 scenes | 13 pages 1/8 | 18 shoot days | 29 people | 48 shots | ₹ 1.42 Cr budget
CONTINUE  — Scene Breakdown · edited 2h ago  [Continue →]
SUGGESTED NEXT — Pre-Production. Work is under way here. [Go to Pre-Production →] Next step: Vision & look
READINESS 9/12 checks pass · 2 blockers, 1 gap
  Scenes not on a shoot day — 4 · Shoot days with no date — 2 · Shoot days with no call sheet — 6
STAGES  I Story ● Done | II Screenplay ● Done | III Pre-Production ◐ In progress | IV Production ○ Not started | V Post-Production ○ Not started
THIS WEEK  Next shoot: day 4 · in 3 days → Day 4 · in 3 days — 5 scenes · no call sheet
PLAN  Intermediate plan [Manage plan]   BACKUP  Google Drive: connected, last synced 2h ago.
```
**Mobile (390px)** One column: header (stats strip wraps to 2 columns), Continue card, Readiness card, the five stage cards stacked (full width), then the chain (cards 2 per row, min 170px), Readiness, Recent, then the desk tiles, then the launcher (phase tile above its module tiles). Page text starts below the slim band; bottom bar Home · Go to · Search · Tools; footer clears the bar via `--mab-h`.

**Stitch prompt** Design the project Dashboard for a dark violet filmmaking web app (#120f1c ground, #1b1727 cards, #9575f8 accent, pill buttons, 16px radius, Catamaran, JetBrains Mono eyebrows). Left 76px rail (Dashboard active), top band with crumb "Studio › Dashboard". Header: mono eyebrow "FEATURE FILM · PROJECT DASHBOARD · STAGE: PRE-PRODUCTION", h1 "Dragon", muted deck, "Favourite film: Dragon · change", and a six-tile stat strip (36 scenes, 13 pages, 18 shoot days, 29 people, 48 shots, ₹ 1.42 Cr budget). Two focus cards: "Continue — Pick up where you left off" with a big "Continue →" pill and a "Suggested next" inset; and "Readiness — Three things to do" with "9/12 checks pass", a segmented red/amber/green bar and three action links. Then "The five stages — Where the film stands." as five cards in a row (Part I-V, hue-coded: violet, gold, teal, pink, fuchsia; status "● Done / ◐ In progress / ○ Not started", Guide and Tools meters, facts, pill "Continue →", the suggested card outlined). Below, a two-column area: left "The chain — Scene to call sheet." cards, "Could you shoot tomorrow?" readiness list with "Fix it →" links, "Recent"; right sticky column with "This week", "Your plan", "Backup" tiles. End with "THE MAP · EVERY MODULE BY PHASE" module grid. Add the no-project empty state and a 390px single-column version.


---

# PART C — Entry and account: landing, invite, purchase, screening room, extension panel, legal, 404

## Part 01 — Entry, purchase and account-edge screens

Source: worktree `.claude/worktrees/admin-fixes` (read-only). Screens: Landing, Invite/doorway, Purchase (+ purchases stub), Screening room, Extension side panel, Legal (privacy, terms, refund), 404.

**Shared tokens, so each screen below can stay short.** Dark ink theme is default: ground ~`#120f1c`, card `--sk-card-bg` ~`#1b1727`, accent/brand violet ~`#9575f8`, primary button fill `--cta-fill` (violet) with `--brand-on` label, pill buttons (`--sk-btn-radius`), card radius `--sk-radius` 16px, hairline 1px card borders, Catamaran body/display (weights 400–800), JetBrains Mono for eyebrows/labels (uppercase, letter-spaced). A light theme ("paper", lavender-tinted page, white cards) exists and follows the reader's choice or the OS. Spacing scale `--s1…--s9`; page gutter `--gutter`. Reduced motion is honoured everywhere.

**Two page families.**
- *Landing family* (`start.html`): own sticky glass header `.st-top`, no app shell, words in markup.
- *App-shell family* (`invite.html`, `purchase.html`): the studio's `.sh-bar` band at the top (brand plate + breadcrumb "Studio · <page>" + toolbar with sign-in pill / Appearance menu), then `main#main` with a `.bd-head` header (mono eyebrow, h1 `.bd-title`, deck paragraph) and a single column body of `.st-sec` sections, each = eyebrow + `h2.bd-h2` + `p.bd-sub` + controls. Body measure `--measure-wide`, horizontal padding `--s5` (24px) at desk, `--s4` (16px) below 720px. Below 720px the band collapses to breadcrumb only and a bottom bar (Home · Go to · Search · Tools) appears.

---

### Landing page (file `start.html`)

**Purpose** The public entry and purchase page: one promise, plans, the free trial, proof, FAQ, e-mail capture, Google sign-in.
**Who sees it / when** Every signed-out visitor (it is outside the site gate and is where the gate sends strangers). Signed-in visitors also may open it (buttons change). Theme: reads `fms_studio_theme_v1` raw, else OS.
**Data source** All words are static markup, stamped at build from `src/lib/plans.js` (names Basic / Intermediate / Pro, list prices ₹599 / ₹799 / ₹999), `src/data/plan-matrix.json` (tier lines + feature rows), `sample.dragon.json` (Dragon figures), `short/feature steps`, `studies.count`, `glossary.count`. Runtime (plain fetch, no SDK): anon RPCs `trial_offer()` (trial on/off + length), `price_notice()` (scheduled price rise, seats), `purchases_required()`; `bump_event()` counters; `addLead` (e-mail capture); `testimonials.json` (empty, so Voices stays hidden). Storage read: Supabase session shape (signed-in detection), `fms_studio_theme_v1`. Session storage: `fms_invite_plan` (plan chosen, survives Google hop), the sign-in error key. Invite code arriving as `start.html#code=XXXX-XXXX` is held (`fms_invite_code_v1`) and stripped from the URL.

**Layout** (top to bottom)
1. **Sticky glass header `.st-top`** (z 20, blur glass, 1px bottom hairline). One row: brand name (left, 800 weight, ellipsis), `nav.st-nav` (hidden below 720px; links Plans · What you get · Samples · FAQ), primary small pill button (44px high) at right.
2. **Invite band `aside.st-invite#inviteBand`** — hidden unless arrived with a code. Card with eyebrow, h2, two lines, mono code.
3. **Hero `section.st-hero`** — 1280px: 2 columns 6fr / 5fr, vertically centred, soft violet radial glow ("aurora") behind headline, padding top s5. Left copy column; right figure `st-shot-hero` (1280×800 screenshot `shots/hub.webp`, tilt + slow parallax). 390px: single column, **screenshot is hidden** (display none below 720px) so plans are close.
4. **Plans `section#pricing.st-plans`** — eyebrow (gold-style), h2, lede, hidden price-rise note, then `ul.st-tiers`: 1280px = 3 columns (trial strip spans the full row above them as a horizontal strip: text left, button right); 390px = 1 column stack (trial card first, then Basic, Intermediate, Pro). Below: "Compare every feature" disclosure (full-width table, fixed layout, first column 46% desk / 36% phone), comparison sentence, small note.
5. **What you get `#features`** — eyebrow, h2, lede, 3-column grid of 6 cards (desk; auto-fit 15rem at 560–999px; 1 col below), then a full-width screenshot figure (stripboard) with caption.
6. **Everything it does `#everything`** — eyebrow, h2, lede, 3-col grid of 6 stage cards each with chip + h3 + tool list (title in bold, one-liner below), then sub-heading "And across the whole film" and another 3-col grid of 6 cards, then CTA row.
7. **Proof `#proof`** — eyebrow, h2, 2-col grid of sample-film cards, note, 16:9 video figure with poster, 4-col facts grid (numbers count up on scroll; prices never count).
8. **Voices `#voices`** — hidden (empty data). Would hold testimonial blockquotes and film list.
9. **FAQ `#faq`** — eyebrow, h2, 7 `details` accordions (height animates; 48px summary on touch).
10. **Close `#go`** — h2, lede, CTA row, legal line.
11. **Offers `#offers.st-lead`** — h3, e-mail form (label above input + button on one row at desk, stacked on phone), consent checkbox row, status line, tracking note with "Don't count this visit" text-button.
12. **Footer `.st-foot`** — © brand left; "Legal" label + 3 links right.
13. **Thumb rail `#startBar`** (fixed bottom, glass) — phone only (≤720px), appears after the hero scrolls out of view and hides while the plans section is on screen; one full-width primary button; height measured into `--st-bar-h`.
Sections use scroll-reveal fade (JS-added only; content visible without JS). Fragment jumps land under the sticky header (`--st-top-h` measured).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click/type | Variants/states |
|---|---|---|---|---|---|
| Header | Brand | link | `{brand name}` (FilmMakerStudio) | `#top` | — |
| Header | Nav | 4 links | `Plans` `What you get` `Samples` `FAQ` | anchors `#pricing #features #proof #faq` | hidden <720px |
| Header | Sign-in | primary pill, small | narrow (<560px): `Sign in`; wide: `Continue with Google` | no JS → `invite.html`; with a Supabase project → Google OAuth, status in `#authMsg` | Signed in: `Open the studio`, href `/` |
| Invite band | Eyebrow / h2 | text | `Your invite` / `You arrived with an invite code.` | — | shown only with `#code=` |
| Invite band | Body | text | `It is held in this browser and is worth a seven-day run of the whole studio, for your own films. Sign in to claim it — the code is spent against your account, not against this device.` | — | — |
| Invite band | Code | mono | formatted code, e.g. `K7QM-4TZP-82WD` | — | — |
| Hero | Eyebrow | text | `The film studio in your browser` | shimmer | — |
| Hero | H1 | heading | `Make your first film. Pay once.` | words animate in | — |
| Hero | Hook | paragraph | `Story → Screenplay → Pre-Production → Production → Post-Production, in one studio that teaches every step as you do it. No subscription — one payment, yours for good.` | — | — |
| Hero | Primary CTA `#ctaOpen` | primary pill (shine loop, glow) | `Start your free trial` | Google sign-in (`bumpEvent('signup')`, "Taking you to Google…") | Signed in: `Open the studio`; purchases OFF: `Sign in` |
| Hero | Secondary CTA | outlined pill | `See the plans` | `#pricing` | — |
| Hero | Trust list | 3 bullets | `No card for the trial` · `Your work stays in your browser` · `Sign in with Google` | — | purchases OFF: first becomes `No card needed` |
| Hero | Legal line | small | `Signing in means you accept the Terms of Service and the Privacy Policy.` | links to terms.html, privacy.html | — |
| Hero | Status `#authMsg` | live region | empty; `Taking you to Google…`; `Sign-in did not complete. {reason}`; `Could not open the Google sign-in just now. Try again, or use the invite page.` | — | error variant red-tinted |
| Hero | Screenshot | image | alt `The studio's home screen with the Dragon sample film open, showing where you left off.` | — | hidden <720px |
| Plans | Eyebrow / h2 | text | `Plans` / `One payment. Yours for good.` | — | — |
| Plans | Lede | text | `Pick the stage you need. Every plan is bought once, never renews and never lapses. Not sure yet? A free trial of the whole studio sits under the plans.` | — | purchases OFF: `Pick the stage you need. Every plan is bought once, never renews and never lapses.` |
| Plans | Launch-price note `#offer` | bordered note | eyebrow `Launch price`, h3 `The price goes up, and the date is already set.`, line (runtime) e.g. `₹799 today. ₹1,499 from 31 October — or once 100 people have joined, whichever comes first.`, chips `1 of 100 taken` and `18d 6h left`, fine print `Nothing here resets. The rise is scheduled on the server and fires by itself, so reloading this page shows you less time, never more.` | countdown updates per minute | **Hidden** unless `price_notice()` reports a real scheduled rise AND purchases are required |
| Plans | Trial strip `li[data-trial]` | card-strip | bold `Not sure yet? Try it free`; text `Every module, on the Dragon and The Dark Knight sample films, for {30 minutes | a limited time}. No card. Then keep the plan that fits.`; button `Start the free trial` | Google sign-in | Hidden when trials off or purchases off; length filled from `trial_offer()` (e.g. `30 minutes`, `2 hours`, `7 days`); signed in: button `Open the studio` |
| Plans | Plan card ×3 | card | name, one-line, price, `one payment`, feature list, Buy button, alt link | see below | Intermediate is "picked" |
| Plans | Compare disclosure | `details` | summary `Compare every feature` | opens table | — |
| Plans | Compare sentence / note | text | `Subscription tools charge every month for as long as you keep making films. Here you pay once and the desk is yours.` / `One-time list prices in Indian rupees, paid through Razorpay and confirmed at checkout. Move up a plan later by paying the difference. The learning library and your local work are on every plan.` | — | — |
| Features | 6 cards | chip + h3 + p | see Lists & tables | spotlight on hover | — |
| Features | Figure | image + caption | `The stripboard of the Dragon sample: scenes laid into shoot days, straight from the script.` | — | lazy |
| Everything | CTA row | primary + outlined | `Start your free trial` / `See the plans` | as above | — |
| Proof | Video | `video` controls | caption `The tour in 90 seconds: a screen recording, no narration, of the Dragon sample — the story, the script, the breakdown, the schedule, the call sheets and the dashboard.`; fallback `This browser cannot play the walkthrough. The same film is in the sample once you are in.` | preload none, poster `media/demo-poster.webp` | — |
| FAQ | 7 accordions | `details` | see Lists & tables | smooth height | — |
| Close | h2 / lede | text | `Your first film starts tonight.` / `Open the samples, try every module, then keep the plan that fits. One payment, yours for good.` | — | — |
| Close | CTAs + legal line | as hero | `Start your free trial` / `See the plans` | — | — |
| Offers | h3 | text | `Not ready yet? Get offers and new steps by e-mail` | — | — |
| Offers | E-mail | input type=email | label `E-mail` (no placeholder), max 254 | validated on submit | — |
| Offers | Submit | outlined pill | `Send me offers` | adds lead, disables while saving | — |
| Offers | Consent | checkbox + label | `I agree that {brand} may e-mail me about offers and new steps at this address. I can withdraw this at any time — see the Privacy Policy for how.` | required | — |
| Offers | Status `#leadMsg` | live | `Saving…` · `Thank you. You are on the list.` · errors below | — | red on error |
| Offers | Tracking line | text + link-button | `This page counts visits in aggregate (a number per day, nothing about you) and honours Do Not Track.` button `Don't count this visit` | opt out → button text `This visit is not counted`, disabled | — |
| Footer | Links | 3 | `Privacy Policy` `Terms of Service` `Refunds` | — | label `Legal` |
| Thumb rail | Button | primary pill | `Start your free trial` | Google sign-in | Signed in: `Open the studio`; purchases OFF: `Sign in` |

Plan card anatomy (`li[data-tier]`): name (display, large) · tier line (`Write the film.` / `Prepare it.` / `Shoot it and finish it: everything.`) · price (bold, large; `₹599` / `₹799` / `₹999`; a scheduled rise appends a small `₹1,499 from 31 October`) · `one payment` · bullet list · primary button · text link `or start the free trial first` (alt link, same Google sign-in; signed in: `or open the studio`; hidden when trial off). Intermediate card carries flag `Recommended for a first film` and an even violet 2–3px border with glow. Buy button label `Buy {Plan}` → `purchase.html?plan=<id>`; signed out and Supabase configured it first stashes the plan and goes to Google; purchases OFF: label `Sign in`.

**Lists & tables**
- **Plan cards (stamped):**
  - Basic ₹599 — `Write the film.` bullets: Screenplay Writer · Beats & Pacing · Drafts · Import Screenplay · PDF exports · Case Studies · `+ 9 more in the comparison`.
  - Intermediate ₹799 (recommended) — `Prepare it.` bullets: `Everything in Basic` · Scene Breakdown · Stripboard · Budget · Locations · Storyboard · Google Drive backup · `+ N more in the comparison` (N is derived from the matrix).
  - Pro ₹999 — `Shoot it and finish it: everything.` bullets: `Everything in Intermediate` · Shoot Day · Call Sheets · Edit Log · Deliverables · AI tools (your own key) · Remove branding.
- **Comparison table** columns: `What you get` | Basic | Intermediate | Pro; rows grouped by the plan that first adds them, each cell ✓ ("Included") or — ("Not included"). Example rows: `New projects | ✓ ✓ ✓`, `Google Drive backup | — ✓ ✓`, `Shoot Day | — — ✓`, `AI tools (your own key) | — — ✓`.
- **What you get cards (chip → h3 → p):** `Story` From an idea to a story that holds · `Screenplay` A screenplay that formats itself · `Pre-Production` Breakdown, stripboard and budget · `Production` The day on your phone · `Post` What is in the can, and what leaves · `Made here` Built for a first film in Tamil Nadu. Body copy as in the markup (e.g. Story: "Logline, character, conflict and beats, one step at a time — each with the formula, a worked example and a check that it is done.").
- **Everything it does** (6 stage cards, chip → h3 → bold tool name + one line): `1 · Story` "Find the film" (Guided story path, Beats & Pacing, Idea Vault, Pitch Deck); `2 · Screenplay` "Write it properly" (Screenplay Writer, Drafts, Title Page, Import Screenplay); `3 · Pre-Production, the script` "Understand what you wrote" (Screenplay Analysis, Scene List, Screen Time, Cast Matrix, Auto-Tag, Scene Breakdown & Elements); `3 · Pre-Production, the look` "See it before you shoot it" (Shot List, Storyboard, Blocking, Scene Board, Lookbook, Reference Media, Songs, Locations); `3 · Pre-Production, the plan` "Schedule it and cost it" (Shoot Calendar, Stripboard, Day Out of Days, Sides, Budget, Schedule Impact, Budget Versions, Cast & Crew, Production Reports); `4 · Production & 5 · Post` "Shoot it and finish it" (Shoot Day, Call Sheets, Edit Log, Cut Versions, Deliverables, Cloud Workflow). Then 6 cross-cutting cards: Learn · AI Desk · Your work · Anywhere · Share · Made here.
- **Proof:** sample cards `Dragon (2025)` — "A full {n}-scene screenplay of {n} pages, broken down into {n} shoot days across {n} locations, a {n}-person unit, a budget and {word} call sheets." and `The Dark Knight (2008)` — "The same desk, worked through as a Chennai production priced in rupees — so you can see a much larger film laid out stage by stage." Note: "Both are reconstructions for teaching. …invented for the demonstration and says so wherever it appears." Facts row (big number + caption): `guided steps to a finished short` · `steps in the feature blueprint` · `Tamil films taken apart, beat by beat` · `craft terms in plain words`.
- **FAQ questions:** `What do I get in the free trial?` (signed-in/off variant: `What do I get when I sign in?`) · `Which plan is right for me?` · `Is it really one payment? No subscription?` · `I have never made a film. Is this actually for me?` · `Can I write in Tamil?` · `Where is my data, and who can read it?` · `What if I want my money back?`

**States**
- *Loading:* page is fully readable instantly; runtime-only parts (trial length, price rise, purchases flag) fill in late. Trial length reads `a limited time` until the server answers.
- *Empty:* Voices section hidden (no consented testimonials); price-rise note hidden.
- *Error:* sign-in failure line in `#authMsg` (see Elements); lead form `Please enter a valid e-mail address.` / `Please tick the box to say you agree.` / server message.
- *Signed out (default):* CTAs say Start your free trial / Continue with Google. *Signed in:* every Google CTA becomes `Open the studio` (to `/`); Buy buttons go straight to `purchase.html?plan=…` and read `Buy {Plan}`; FAQ #1 swaps.
- *Trial running:* no distinct variant on this page.
- *Purchases OFF (server says `purchases_required()` false):* plans remain; trial strip and per-card "or start the free trial first" hide; hero CTA `Sign in`; trust bullet `No card needed`; lede shortened; FAQ #1 `What do I get when I sign in?` with answer "Sign in with Google and every module in the studio is open, with the Dragon and The Dark Knight sample films to look at — nothing to install. Your work is saved in your browser, and you can choose a plan whenever you like."; price-rise band never drawn. *Purchases ON:* as default.
- *Trials off:* trial strip and alt links hide.

**Dialogs & overlays** None. Transient: invite band; thumb rail; price-rise note.

**Sample data** Invite band code `K7QM-4TZP-82WD`; price-rise line `₹799 today. ₹1,499 from 31 October — or once 100 people have joined, whichever comes first.` with chips `1 of 100 taken`, `18d 6h left`; trial length `30 minutes`; lead e-mail `anita.r@example.com`; Dragon figures illustrative `62 scenes · 118 pages · 24 shoot days · 14 locations · 38-person unit`.

**Mobile (390px)** Header shows brand + `Sign in` (short label) only; nav hidden. Hero single column, screenshot removed, CTAs full-width stacked (48px), trust list stacked. Trial card first then plan cards in one column; comparison table shrinks to three equal columns, first column 36%, small header type. Grids 1 column. Lead form stacks. Fixed thumb rail with one full-width primary button appears after the hero and disappears over the plans.

**Stitch prompt**
Design a dark violet landing and pricing page for "FilmMakerStudio", a browser filmmaking toolkit. Ground #120f1c, cards #1b1727 with 1px hairline borders and 16px radius, accent #9575f8, pill buttons, Catamaran type with mono uppercase eyebrows. Sections: sticky glass header (brand left, links Plans / What you get / Samples / FAQ, small violet pill "Continue with Google"); hero in two columns — eyebrow, H1 "Make your first film. Pay once.", hook line with five stages, primary "Start your free trial", outlined "See the plans", three trust bullets, a terms line, and a studio screenshot at right with soft violet glow. Plans: full-width trial strip ("Not sure yet? Try it free" + button), then three cards Basic ₹599, Intermediate ₹799 (violet border, flag "Recommended for a first film"), Pro ₹999, each with tier line, "one payment", bullet list, Buy button, text link; collapsible comparison table with ticks. Then six feature cards, six stage tool-list cards, two sample-film cards, video with poster, four big stats, FAQ accordions, closing CTA, e-mail offers form with consent checkbox, footer. Mobile: single column and a fixed bottom CTA bar.

---

### Invite / doorway (file `invite.html`)

**Purpose** "Come in." The offer page: where a closed site gate lands anybody not yet through. Trial first, plans second, invite-code box third; request-an-invite only behind `#request`.
**Who sees it / when** Anyone refused by the site gate (signed out → they usually hit `start.html` first; every other refusal lands here), a fresh Google sign-in that is not a member, a lapsed trial, a code link (`invite.html#code=…`), and a demo link (`…&demo=1`, anonymous landing). It is exempt from the gate and never blocks local work.
**Data source** `window.StudioCloud` (session, gate state, user e-mail), `Billing.status()` (billing_status: `trial_enabled`, `trial_used`, `trial_active`, `trial_minutes`, `entitled`, `granted`, `payments`), anon `trial_offer()` and `purchases_required()`, `LIST_PRICE` + lazy `plan-matrix.json` lines (price block), `getCodePass()` (`fms_invite_code_v1`), session keys `fms_sitegate_why`, `fms_invite_view`, `fms_invite_plan`, `fms_purchases_req`, return-to page (`return-to.js`). RPCs: start_trial, verify/redeem code, request invite.

**Layout** App-shell family. Band (global mode, crumb "Studio · Come in"), then `main#main`: `.bd-head` (eyebrow `Studio · Come in`, h1 `Come in.`, deck sentence that changes by state), then `.iv-body` single column (max `--measure-wide`, gap `--sk-grid-gap`) of `section.iv-sec` blocks, each a vertical stack gap s4. Action rows are `.iv-actions` (flex wrap, gap s2). 1280px and 390px are the same single column; side padding 24px → 16px. Whole `main` is redrawn on every gate/auth/plan event (the request note textarea is preserved).

**Elements** (signed-out default; other states below)

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Head | Eyebrow / H1 | text | `Studio · Come in` / `Come in.` | — | — |
| Head | Deck | text | signed-out: `Start a free trial of the whole studio, buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.` | — | other decks in States |
| Why line | status paragraph | text | e.g. `You were sent here from dashboard.html because you are not signed in.` | — | only when the gate left a reason |
| Trial section `#trial` | eyebrow / h2 | text | `Free trial` / `Start your free trial.` | — | hidden when server says trials off |
| Trial | Body | text | `The whole studio, on the Dragon and The Dark Knight sample films, for 30 minutes. No card, nothing to install. Sign in and it begins.` (`, for N` omitted until length known) | — | — |
| Trial | Button | primary | `CONTINUE WITH GOOGLE` | Google sign-in | — |
| Trial | Legal | small | `By continuing you agree to the Terms of Service and the Privacy Policy.` | links | — |
| Buy `#buy` | eyebrow / h2 / deck | text | `Or` / `Buy a plan and come straight in.` / `One payment, access for good — no trial first if you already know you want it.` | — | — |
| Buy | Price block | list | 3 rows: bold name, price, one-line (e.g. `Basic` `₹599` `Write the film.`); `aria-label="Plans and prices"` | — | line arrives lazily |
| Buy | Note | small | `One payment each, in Indian rupees, confirmed at checkout. Nothing renews. Each plan includes everything in the one before it.` | — | — |
| Buy | Buttons | primary + outlined | `SEE PLANS AND BUY` → `purchase.html`; `COMPARE EVERY FEATURE` → `start.html#pricing` | — | — |
| Code `#invite` | eyebrow / h2 / deck | text | `With a code` / `Have an invite code?` / `Enter the code you were given and sign in with Google in one go: the code is spent on your account, and the trial it carries starts there.` | — | signed in: eyebrow `Invite`, deck `If somebody handed you a code, enter it and you are through, with the free trial it carries.` |
| Code | Label / input | text input | label `Invite or screening pass code`; placeholder `XXXX-XXXX-XXXX`; mono, uppercase, auto-formats; hint `Spaces and dashes are ignored. A screening pass opens the screening room instead.` | — | prefilled from `#code=` link |
| Code | Submit | primary | `CONTINUE WITH GOOGLE` (signed in: `REDEEM CODE`; busy: `CHECKING…`) | holds code then Google; a screening pass goes to `screening.html?pass=…` | — |
| Code | Error | alert | `Enter the code you were given. With no code, sign in with Google and choose a plan or a free trial.` (signed in: `Enter the code you were given, or choose a plan or the free trial above.`) | — | server errors verbatim |
| Code | Link | text link | `What is this? About FilmMakerStudio →` → `start.html` | — | — |
| Request `#request` | eyebrow / h2 | text | `Or` / `Ask for an invite.` | — | only for signed-in non-members when `#request`, an existing request, or backend not deployed |
| Request | Block | form | see Lists & tables | — | — |
| Meanwhile | h2 etc. | text | `Meanwhile` / `Your work is safe.` / `Anything already saved on this device stays exactly as it is. Once you are in, everything opens again and sync starts by itself.` | — | signed-in closed only |
| Meanwhile | Buttons | pills | `TRY AGAIN` (primary, only if the check could not be made) · `SIGN OUT` · `ABOUT THE STUDIO` → `start.html` | retry re-runs the gate (`CHECKING…`) | — |

**Lists & tables** *Request block (`.ir`)*: mono label `What the administrator will see`; definition list `Name` `Asha Venkat` / `Google account` `asha.v@example.com` / `Asked from` `Chrome on macOS`; meta `These details come from your Google sign-in.`; label `A line for them (optional)`; textarea (3 rows, 1000 max) placeholder `Who you are, which film this is for, who told you about the studio.`; primary `REQUEST AN INVITE` (declined: `ASK AGAIN`; busy `SENDING…`). Status variants: `Requested · 14 Oct 2026, 10:42` + `An administrator will see this request the next time they open the console. Once it is approved you are through on your next visit — nothing else to do. Until then, everything you write is saved on this device as usual.` + `CHECK AGAIN`; `Declined · {date}` + italic quote of the administrator's note + `You can ask again from {date+7d}. Your work on this device is unaffected.`; unreachable: `The studio could not be reached to check your invite. Sync is paused until it can; everything you write stays on this device meanwhile.` + `TRY AGAIN`; not deployed: `Invites are not open yet, so there is nothing to request right now. Please check back soon — your work on this device is safe meanwhile.` + `CHECK AGAIN`; disabled account: `This account was disabled by an administrator, so it no longer syncs. Nothing on this device has been touched. If you think that is a mistake, ask them to re-enable it — approving a new request below does that.`

**States** (by who is looking; each replaces the body)
- *Cloud not configured:* section `Local only` / `Nothing to redeem.` / `Cloud sync is not available right now. Your work lives in this browser; you can back it up from Settings.` Deck: `Invites are not available right now. Everything you write is saved in this browser.`
- *Signed out, holding a code (from link/box):* deck `This browser is holding an invite code. Sign in with Google to spend it on your account and start the trial it carries.`; section `Your code` / `Sign in to spend your code.` / `Code {XXXX-XXXX-XXXX} is held in this browser. Sign in with Google and it is redeemed on your account, with the free trial it carries. Nothing on this device changes.`; buttons `CONTINUE WITH GOOGLE`, `FORGET THIS CODE`; legal line.
- *Demo pass:* section `Through` / `You're in, with a code.` / `Code … opened this browser. Your work is saved here; an account would back it up and let you pick it up elsewhere.` Buttons `GO TO THE STUDIO`, `SIGN IN WITH GOOGLE`, `FORGET THIS CODE`.
- *Signed out, trials off:* deck `Buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.`; trial section absent.
- *Checking:* `One moment` / `Checking your invite…` / `Checking the invite for {email}.`
- *Signed in, closed (new signup lands here):* deck `Start a free trial, buy a plan, or enter the code you were given. Everything on this device is still here, exactly as you left it.` Sections: Trial (if offered: h2 `Start your free trial.`, body `Open the Dragon and The Dark Knight samples — two whole films, each with its script, its breakdown, its schedule and its call sheets — and read them from the inside, for 30 minutes. No card, nothing to fill in.`, primary `START MY 30 MINUTES`, live status line); Buy (`Or` / `Buy a plan and come straight in.` / `One payment, access for good — and the only thing that keeps the studio open once a trial has run out.` + price block + outlined `SEE PLANS AND BUY`); code box; optional request; Meanwhile. If no trial available: eyebrow `Plans` / h2 `Choose a plan to come in.` (after a used trial: eyebrow `Your trial` / `Your free trial is over.`) with deck `Signed in as {email}. Everything you wrote is still saved on this device, exactly as it is. One payment, access for good.` and the buy button is primary.
- *Trial start errors (status line):* `You have already had your trial on this account. A plan opens the studio for good.` · `You have already bought a plan — you should be in. Try reloading.` · `Trials are not open at the moment.` · `That did not start. Please try again.`; success `You are in. Opening the studio…` then redirect to the Dragon sample.
- *Through but trial over / not entitled:* section `Your trial` / `Your free trial is over.` (never had one: `The studio` / `Choose a plan to come in.`) / `Signed in as {email}. Everything you wrote is still saved on this device; a plan opens the studio for good.` + price block + `SEE PLANS AND BUY`, `SIGN OUT` + code box.
- *Through (open):* deck `You are in. Your projects sync to this account.` Section `Through` / `You're in.` / `Signed in as {email}. {Access given by the studio — the whole studio is open to you. }Projects you open sync to this account, and the Chrome extension signs in with it too.` Buttons `GO TO THE STUDIO` (primary, goes to the page they came from), `ACCOUNT SETTINGS`, `SIGN OUT`. Purchases-off variant body: `The studio is open to everyone who signs in. Your work is saved on this device; syncing it to your account needs an invite or a plan.`
- *Lost session:* deck `This account is active on another device, so sync is paused here.`; section `Elsewhere` / `Active on another device.` / `Take the session back to sync here; the other window pauses. Or leave it — this device keeps saving locally.` button `TAKE OVER SESSION`.
- *Why-lines:* `…because this site is not connected to its server just now. Everything on this device is still here.` / `…because your invite could not be checked just then. Everything on this device is still here.` / `…because this account has no trial running and no plan yet.`

**Dialogs & overlays** None (all inline sections). Toast on code accept: `Invite code accepted — sync is on.`

**Sample data** Signed in as `asha.v@example.com`; code `K7QM-4TZP-82WD`; trial `30 minutes`; prices Basic ₹599 / Intermediate ₹799 / Pro ₹999.

**Mobile (390px)** Same single column; side padding 16px; band reduces to crumb with bottom nav bar; action buttons wrap, each ≥44px; input full-width.

**Stitch prompt**
Design the "Come in." doorway screen for FilmMakerStudio in a dark violet product UI (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase eyebrows). App shell band on top with breadcrumb "Studio · Come in". Page header: eyebrow "Studio · Come in", big H1 "Come in.", one-sentence deck. Below, a single centred column of stacked sections, each with a mono eyebrow, an H2, a sub line and actions: 1) "Free trial — Start your free trial." with body and a primary "CONTINUE WITH GOOGLE" button plus a small legal line; 2) "Or — Buy a plan and come straight in." with a three-row price list (Basic ₹599 Write the film., Intermediate ₹799 Prepare it., Pro ₹999 Shoot it and finish it: everything.), a note, primary "SEE PLANS AND BUY" and outlined "COMPARE EVERY FEATURE"; 3) "With a code — Have an invite code?" with a mono code input (XXXX-XXXX-XXXX), hint text, primary "CONTINUE WITH GOOGLE" and a text link. Include a signed-in variant with "You're in." and GO TO THE STUDIO / ACCOUNT SETTINGS / SIGN OUT.

---

### Purchase (file `purchase.html`, plus stub `purchases.html`)

**Purpose** The single buying space: plan cards, promo code, checkout (Razorpay), referral code, refund request, invoices. Prices, promo codes, checkout and upgrade credit live nowhere else.
**Who sees it / when** Everybody (exempt from the site gate and from the paywall, never walled): signed out (sign-in prompt + list prices), signed in free/no-plan, in a trial, lapsed, paid buyer, access-granted account, purchases-off studio. `?plan=<id>` marks and (once signed in) opens that card's checkout; `?for=<id>` adds a "Opens X, the part of the studio you just tried." line; `?ref=` / `?code=` pre-fills the promo box. `purchases.html` is only an admin redirect stub: page body `Purchases moved into the console.` (link to `admin.html#purchases`), refreshes there.
**Data source** `Billing.listPlans()` (plans table: name, blurb, price, limits, features), `Billing.status()` (plan, plan_name, account_name, trial_active, trial_ends_at, trial_used, entitled, granted, lapsed, bought_plan, plan_until, purchase_required, usage, limits, payments, disabled), `Billing.quote()` (promo + upgrade-difference quotes), `Billing.buy()` (Razorpay checkout via edge functions), `my_referral()`, `my_refund_status()`, `my_invoices()`, `plan-matrix.json` (lazy), `LIST_PRICE` for signed-out. Nothing stored locally; session key `fms_purchase_plan` carries `?plan=` across Google.

**Layout** App-shell family. Band (crumb "Studio · Purchase") → `.bd-head` (eyebrow `Studio · Purchase`, h1 `Purchase.`, deck) → `.pu-body` (max `--measure-wide`, centred) containing ONE section `#plan` (eyebrow `Plan`, h2, deck) then, top to bottom: trial/status line → usage list (buyers only) → lapsed note → **plan card row** (`.pl-row`: 3 columns at 1280px — auto-fit min 14rem; 1 column at 390px; cards equal height, button pinned to the bottom) → "Compare every feature" disclosure table → "Have a code?" disclosure → payment notes → referral panel → refund-request panel → invoices table → optional plan extras (branding toggle, WhatsApp help line).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Head | Deck | text | `Choose a plan, pay once, and find your invoices and refund requests in the same place.` | — | purchases OFF: `Nothing is for sale at the moment, and every part of the studio is open.` |
| Section | Eyebrow / h2 | text | `Plan` / `Choose a plan.` | — | buyer: `{Plan name} · {account name}`; granted: `Access given by the studio.` |
| Section | Deck | text | `A plan opens the stages of your own film — Basic to write it, Intermediate to prepare it, Pro to shoot and finish it — and sets how much syncs to the cloud. One payment, yours for good. Nothing you write is ever deleted, on any plan or none.` | — | signed out: plus ` A plan belongs to an account, so you sign in with Google first — you come straight back to this page.` |
| Trial line | status | text | active: `Your free trial has 24 minutes left. A plan keeps the studio open after it ends.`; over: `Your free trial ended on 14 Oct 2026, 10:30 am. Choose a plan to keep using the studio. Everything you wrote is still saved on this device.` + outlined `SIGN OUT`; granted: `Access given by the studio. An administrator has opened the whole studio to you — there is nothing to buy while this access stands. A plan is here if you want one of your own.` | — | only when plan is none and purchases required |
| Usage | h3 + list | text | `Your usage`; lines `Cloud projects: 1 of 3`, `Live share links: 0 of 5`, `Most collaborators on one film: 2 of 5`, `Organisation seats used: 1 of 1` (` — at the limit` marks full) | — | buyers only |
| Lapsed | note | text | `Your Basic plan ended on 14 Oct 2026 (refunded). Choose a plan to keep using the studio.` | — | refunded buyers |
| Cards | Plan card ×3 | `article.pl-card` | eyebrow `Your plan` (current, else blank) · name · blurb · price line `₹799 once · yours for good` · adds block · limits list · feature count + "What's included" disclosure · button | see below | current / picked / promo / upgrade |
| Card | Buy button | button | `BUY` (primary when no plan) / `UPGRADE` (when you already hold a lower plan) / `OPENING…` | opens Razorpay | only on tiers higher than yours; disabled if payments not configured or account disabled |
| Card | Current note | text | `Yours, for good. Nothing to renew.` | — | on your tier |
| Card | Picked flag | text | `Opens {feature}, the part of the studio you just tried.` | — | `?for=` link |
| Compare | Disclosure | `details` | summary `Compare every feature`; table `Feature` + one column per paid plan; stage group rows then `Capabilities` | — | — |
| Promo | Disclosure | `details` | summary `Have a code?`; label `Promo code`; input placeholder `e.g. LAUNCH10`; buttons `APPLY` (→ `RE-CHECK`, `CHECKING…`) and `REMOVE`; hint `Spaces and case do not matter. The discount shows on the card before you pay.`; success `LAUNCH10 applied to Basic, Intermediate. The price above is what you will pay.` | quote asked per plan; opens automatically for a `?ref=` link | shown only when something is buyable and payments configured |
| Notes | Payment line | small | `One payment, full access for good — nothing recurs and nothing expires. Paid through Razorpay in INR; an invoice arrives from Razorpay by e-mail.` | — | — |
| Notes | Promise | small | `Refunded in full if you are charged twice or by mistake, or if the plan is not activated on your account. Otherwise a plan is final — which is why the trial comes first. Move up later and pay only the difference.` | — | — |
| Notes | Legal | small | `By paying you agree to the Terms of Service and the Refund & Cancellation Policy. See also our Privacy Policy.` | links | — |
| Notes | Status | live | `Preparing your order…` → `Opening the payment form…` → `Confirming with the studio…` or the failure message (default `The payment did not complete.`) | — | — |
| Notes | Unavailable | small | `Payments are not available yet. Please check back soon.` / `This account has been disabled by an administrator, so it cannot buy a plan.` | — | conditional |
| Success | Card above row | status card | eyebrow `Payment received`, h3 `You're on Intermediate.`, `Just unlocked:` bullet list (up to 8), `Your invoice is on its way from Razorpay by e-mail, and listed under Invoices on the Purchase page.`, primary `START YOUR FILM` → `index.html?welcome=plan` | — | after a purchase |
| Referral | Panel (paid) | card | h3 `Your referral code`; lead `Share it with a friend. They get 10% off any plan, and you earn 10% of what they pay once their payment is confirmed.`; mono code `REF-4D9K2X` + buttons `COPY`, `COPY LINK`; meta `The link opens this page with your code already in the “Have a code?” box. Credits are paid out by hand by the studio; your own purchases cannot use your code.`; three stat tiles `Owed to you ₹80` / `Paid out ₹0` / `Used by friends 1 time`; credit list `14 Oct 2026 — ₹80 · owed` | toast `Copied REF-4D9K2X.` | switched-off: `This code is switched off at the moment, so a friend cannot use it.` |
| Referral | Panel (unpaid) | card | h3 `Refer a friend`; `Once you have bought a plan you get a referral code of your own. A friend who buys with it gets 10% off, and you earn a credit when their payment is confirmed.` | — | — |
| Refund | Panel | card | h3 `Request a refund`; state line `Your Intermediate plan, ₹799, paid 14 Oct 2026. Purchases are final, except a duplicate charge, a charge where you did not receive what you paid for, or where the law requires. This sends a request; the studio decides, and a refund ends the plan.`; select `Reason`; textarea `Tell us more` placeholder `What happened? Include the date and anything that helps us find it.`; primary `SEND REQUEST` (`SENDING…`); link `Read the refund policy` | toast `Request sent. We will answer on this page.` | only when admin switched it on and a captured payment exists |
| Invoices | Table | table | h3 `Invoices`; columns `Number` `Date` `Plan` `Amount` and an action column with `DOWNLOAD PDF` | PDF drawn in browser | empty: `Your invoice appears here when a payment goes through.` |
| Extras | Branding toggle | checkbox | `Show “Made with FilmMakerStudio” on pitch decks, call sheets and the screening room` + hint `Your plan lets you remove the line. The choice is kept on this device.` | — | Pro only |
| Extras | Help | text | `Stuck, or deciding on a plan? ` + WhatsApp link | — | only if configured |

**Lists & tables**
- Plan card content example (Intermediate, signed in, no plan): eyebrow blank · `Intermediate` · blurb · `₹799` bold + ` once · yours for good` · "Everything in Basic, plus:" list (Scene Breakdown, Stripboard, Budget…) · limits list (`3 cloud projects`, `5 collaborators per film`, `5 live share links`, `1 organisation seat`, `Chrome extension included`, `Local work, Drive backup and AI tools (your own key) are included`) · `19 of 40 features` + disclosure `What's included` with per-stage lists (`Pre-Production · 18 of 20`, struck/dim items when off) · button `BUY`.
- Promo variant: price shows discounted figure large, list price struck beside it, and `₹80 off with LAUNCH10`. Upgrade variant: `Upgrade to Pro — ₹200 (you paid ₹799 for Intermediate)`.
- Refund categories: `I was charged twice` · `I was charged but my plan did not arrive` · `Another ground the law gives me` · `Something else`. Request states: `Waiting for the studio to look at it` · `Approved — your refund is on its way` · `Declined` · `Refunded`; line `Your last request, 14 Oct 2026:` + pill; `The studio wrote: {note}`; pending: `You do not need to do anything else. We will answer here.`; empty "other" error `Tell us what happened, in a sentence or two.`

**States**
- *Loading:* h2 `Loading the plans…`, outlined button `LOADING…` (disabled).
- *Error:* h2 `The plans did not load.` + red alert with message + `TRY AGAIN`. Missing schema: h2 `Plans are not set up on this project yet.` + `TRY AGAIN`.
- *No cloud build:* h2 `No cloud, no plan.` + hint `This build is not connected to a cloud project, so there is no account to put a plan on.`
- *Signed out:* h2 `Sign in to buy a plan.`; price block (3 rows + note); if arrived by referral: `You arrived with the referral code REF-4D9K2X. Sign in, then enter it under “Have a code?” below the plan cards to see your discount.`; buttons primary `SIGN IN TO BUY`, outlined `COMPARE EVERY FEATURE` (→ `start.html#pricing`).
- *Trial running:* trial line above cards (no cards hidden). *Lapsed trial:* over-line with SIGN OUT.
- *Paid buyer:* h2 shows plan name; usage; current card says "Your plan" and "Yours, for good. Nothing to renew."; only higher tiers show UPGRADE; referral, refund, invoices appear.
- *Purchases OFF:* h2 `Free to use.` with one line `The studio is free to use right now — nothing to buy.` and invoices only (no cards, promo, checkout). *Purchases ON:* everything above.

**Dialogs & overlays** Razorpay's hosted checkout modal (external; plan, amount in ₹, UPI/card). Toasts: copy confirmations, `Request sent. We will answer on this page.` No in-app confirm dialog on this page.

**Sample data** Signed in `asha.v@example.com`, Intermediate buyer: invoice `FMS/2026-27/000012 | 14 Oct 2026 | Intermediate | ₹799 | DOWNLOAD PDF`; promo `LAUNCH10`; referral `REF-4D9K2X`; trial line `Your free trial has 24 minutes left.`

**Mobile (390px)** Plan cards stack one per row, full width, each with its own disclosure; comparison table scrolls within its own focusable region (`role=region`, tabindex 0); promo and refund forms are single column; invoice table wraps into the card width; band reduced + bottom bar.

**Stitch prompt**
Design the Purchase screen for FilmMakerStudio, dark violet product UI (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase eyebrows) inside the app shell with breadcrumb "Studio · Purchase". Header: eyebrow, H1 "Purchase.", deck "Choose a plan, pay once, and find your invoices and refund requests in the same place." One section "Plan — Choose a plan." with a trial status line ("Your free trial has 24 minutes left…"), then three equal plan cards: Basic ₹599, Intermediate ₹799, Pro ₹999, each showing "once · yours for good", "Everything in the plan below, plus:" list, limits list (cloud projects, collaborators, share links, seats, Chrome extension), "19 of 40 features" with a "What's included" disclosure and a BUY button (the current plan says "Yours, for good. Nothing to renew."). Under the row: "Compare every feature" table, "Have a code?" disclosure with promo input and APPLY, three small policy notes, a "Your referral code" card with COPY / COPY LINK and three stat tiles, a "Request a refund" form, and an Invoices table with DOWNLOAD PDF. Add signed-out and purchases-off variants.

---

### Screening room (file `screening.html`)

**Purpose** A time-limited, read-only, watermarked view of one film for an investor / festival programmer / producer. No studio navigation, no account.
**Who sees it / when** Anyone holding a screening pass code (arrives from the sender's message, or from the invite code box which forwards `screening.html?pass=CODE`). Exempt from the gate. Nothing is written to storage; its Supabase client keeps no session. Theme follows the OS only.
**Data source** RPC `screening_open()` (title, expiry, access id, `scopes`: `feature` blueprint, `story`, `scenes`; never contacts or money; optional `branding`, `ref`), `story.js` (beat matrix), `pitch-deck.js` (`collectFrom`, `buildDeck`), `watermark.js`. Flagged-off feature: `screening.html#view=<token>` shared pitch deck / call sheet (not live).

**Layout** No shell or rail. Centred `main.sc-main` (max `--measure-wide`, padding s6 / gutter). *Enter stage:* `.bd-head` then a narrow form (max 28rem). *Room stage:* head (eyebrow, h1 = film title, deck = logline, expiry line in mono), then stacked bordered blocks (`section.sc-block`, paper-raised, 1px rule, 16px radius): Beat sheet, Character map, Pitch deck; then the brand line and "About the studio" link, centred. A fixed forensic watermark overlays the content. Text selection and right-click are disabled in the room; printing replaces the page with a message.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Enter | Eyebrow / h1 / deck | text | `Screening room` / `You have been sent a film.` / `Enter the screening pass you were given. It opens one project, read-only, for a limited time — no account needed.` | — | — |
| Enter | Pass | text input (mono, large, uppercase) | label `Screening pass`; placeholder `XXXX-XXXX-XXXX` | auto-formats; prefilled from `?pass=` | — |
| Enter | E-mail | email input | label `Your e-mail (optional)`; placeholder `you@example.com` | not verified | — |
| Enter | Note | small | `Whatever you open here is watermarked with this pass, the e-mail above and the time. The e-mail is not checked; it is printed on the page so the sender knows who is watching.` | — | — |
| Enter | Submit | primary | `OPEN THE SCREENING` | `OPENING…` while busy | — |
| Enter | Error | alert (red wash, left rule) | see States | — | — |
| Room | Eyebrow | mono | `Screening room · read-only` | — | — |
| Room | H1 | heading | film title (or `Untitled film`) | — | — |
| Room | Deck | text | logline | — | omitted if none |
| Room | Expiry | mono | `This pass closes in 3 hours.` | refreshes every 30 s | `…closes in 12 minutes.` / `…in 2 days.` / `This pass has expired.` |
| Room | Beat sheet block | section | h2 `Beat sheet · Three-act structure` (framework label), synopsis paragraph, ordered list: bold beat label + the passages tagged to it joined by ` … ` or `—` | — | only if a synopsis exists; empty beats dimmed |
| Room | Character map | section | h2 `Character map`; auto-fit grid (14rem) of cards: mono role, name h3, one line | — | only if characters |
| Room | Pitch deck | section | h2 `Pitch deck`; stacked slides | — | always |
| Room | Brand line | text | `Made with FilmMakerStudio — {link text}` | link | hidden if pass says `branding: false` |
| Room | About link | text link | `About the studio` → `start.html` | — | always |

**Lists & tables** Deck slides (`.pd-slide` cards with mono eyebrow): cover (eyebrow = genre or `A film`, display title, logline); `Synopsis`; `Structure` (title = framework, numbered beats); `Characters` (grid); `Key scenes` (numbered); `The production` (big numbers row: label under each figure). Example: Beat `Opening Image` → `Kavya sells her last gold bangle to buy a second-hand camera … The tailor's shutter rolls up.`; Character card `PROTAGONIST · Kavya` `A tailor's daughter who films weddings and wants to shoot a feature.`

**States**
- *Loading:* button `OPENING…`. Shared-link flow: `Opening the shared link…` status.
- *Errors (red alert):* `Enter the screening pass you were given — the code in the message from the sender.` · `This copy of the studio is not connected to a cloud project, so it cannot open passes.` · `That screening pass could not be opened.` / server sentence · offline `This device is offline. Connect to the internet and try again.` · `The studio could not reach its server. Check the connection and try again.` · expiry `This screening pass has expired. Ask the sender for a new one.` · tamper `The screening was closed because its watermark was removed. Open the pass again to continue.`
- *Empty room:* `This project has nothing shared in it yet.`
- *Signed-out only:* there is no signed-in variant; no purchases/trial variants.
- *Print:* page hidden, message `Printing is turned off for screening passes.`

**Dialogs & overlays** Watermark layer: three lines repeated across the page in faint ink — `SCREENING PASS · ACCESS {id}`, viewer e-mail (or `viewer not named`), `2026-10-14 10:42 UTC`.

**Sample data** Pass `QX7M-D2LA-9HRT`, e-mail `programmer@example.com`, film `Kodai Mazhai` (mystery short, 3-act), expires in 2 days; watermark `SCREENING PASS · ACCESS 4F2A91` / `programmer@example.com` / `2026-10-14 10:42 UTC`.

**Mobile (390px)** Single column; form full width; blocks keep padding; character grid 1 column; deck slides stack; deck numbers wrap.

**Stitch prompt**
Design a minimal "Screening room" for FilmMakerStudio in dark violet (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase labels), with no navigation. Screen 1: centred narrow column — eyebrow "Screening room", H1 "You have been sent a film.", deck, a large monospace uppercase input labelled "Screening pass" (XXXX-XXXX-XXXX), an optional e-mail input, a small note about watermarking, primary pill "OPEN THE SCREENING", and a red-tinted error strip. Screen 2 (room): header with eyebrow "Screening room · read-only", film title H1, logline deck and a mono line "This pass closes in 3 hours."; then bordered blocks: "Beat sheet · Three-act structure" (synopsis plus numbered beats with tagged passages), "Character map" (card grid: role, name, line), "Pitch deck" (stacked slides: cover, Synopsis, Structure, Characters, Key scenes, The production with big numbers); footer "Made with FilmMakerStudio —" and "About the studio". Overlay a faint diagonal watermark: pass access id, viewer e-mail, UTC time.

---

### Chrome-extension side panel (file `extension/panel.html`, script `src/pages/panel.js`)

**Purpose** The extension's front door, docked beside any tab (~360px wide): gatekeeper, sign-in, and the five-stage pipeline launcher; also queues web clippings for the Idea Vault.
**Who sees it / when** Only inside the Chrome extension. Outside it: a "not the extension" notice. Flow: no session → gatekeeper (step 1) → code held → Google (step 2) → gate closed → request/redeem → session on another device → takeover → plan lacks extension → upsell → pipeline.
**Data source** `window.StudioCloud` (session, gate state, user e-mail), `chrome.storage.local` clip queue (`CLIP_QUEUE_KEY`), `Billing.status()` (`limits.extension`), `plan-matrix.json` (`extension` row: plans Intermediate, Pro), `navmodel.moduleGroups()` (stages and shelves with blurbs and modules), `Store.currentProject()`.

**Layout** Single column `main.pn-main` (padding s4, gap s3, max 40rem, left-aligned; designed at ~360px). Each screen: `header.pn-head` (mono eyebrow, h1 `pn-title` display xl, optional deck small) then controls stacked, all buttons `justify-self: start`. Pipeline: an ordered list of 5 + shelf cards (1px rule border, 16px radius, paper-raised); each card header is a full-width button with a 10px hue dot, bold stage name and muted blurb beneath; open card gets a hue-coloured border and a body.

**Elements**

| Screen | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Not extension | head | text | eyebrow `FilmMakerStudio` · h1 `This is the extension panel.` · deck `Open it from the FilmMakerStudio button in Chrome’s toolbar. On the website, everything here is on the hub.` | — | — |
| Not extension | button | outlined | `GO TO THE HUB` | link | — |
| Gatekeeper | head | text | eyebrow `Step 1 of 3` · h1 `Enter Invite / Screening Pass Code` · deck `FilmMakerStudio is invite-only. A screening pass opens one film read-only, without an account. No code? Sign in with Google and ask for an invite.` | — | — |
| Gatekeeper | code input | mono input | label `Code`, placeholder `XXXX-XXXX-XXXX` | auto-format | — |
| Gatekeeper | submit | primary | `CONTINUE` (`CHECKING…`) | verifies; screening pass opens `screening.html` in a new tab | — |
| Gatekeeper | not-deployed | meta | `Invite codes are not switched on for this studio yet; an administrator has to enable them before anybody can be let in.` | — | conditional |
| Gatekeeper | alt | outlined | `NO CODE? SIGN IN TO REQUEST ONE` | Google sign-in | — |
| Gatekeeper | error | alert | verbatim server/gate message | — | — |
| Gatekeeper / Pipeline | clip line | small | `Select text on any page and choose “Send to FilmMakerStudio” to keep it in the Idea Vault.` — or with queue: `2 clippings waiting for the Idea Vault — they arrive when you open a page.` | — | — |
| Sign-in | head | text | eyebrow `Step 2 of 3` · h1 `Sign in with Google.` · deck `Your code is held for ten minutes and spent only once Google has said who you are.` | — | — |
| Sign-in | buttons | primary + outlined | `SIGN IN WITH GOOGLE` (`WAITING FOR GOOGLE…`) · `USE A DIFFERENT CODE` | — | error `Google sign-in did not complete.` |
| Closed | head | text | eyebrow `Invite needed` · h1 `Ask for an invite, or redeem a code.` (pending: `Your request is in.`) · deck `Signed in as asha.v@example.com, which is not a member yet.` | — | — |
| Closed | request block | form | same block as invite.html (Name / Google account / Asked from, note textarea, `REQUEST AN INVITE`) | — | — |
| Closed | redeem | form | label `Or an invite code, if you were given one`; primary `REDEEM` | — | only when backend deployed |
| Closed | out | outlined | `SIGN OUT` | — | — |
| Lost | head | text | eyebrow `Session elsewhere` · h1 `Active on another device.` · deck `Your account is open in another Chrome window. Take the session back to continue here; the other window pauses.` | — | — |
| Lost | buttons | primary + outlined | `TAKE OVER SESSION` · `SIGN OUT` | — | — |
| Checking | head | text | `One moment` · `Checking your invite…` · `Asking the studio whether this account is through the gate and free to open here.` | — | — |
| No extension | head | text | eyebrow `Your plan` · h1 `The extension is not in your plan.` · deck `Your plan covers the website and local work. Intermediate and Pro include the Chrome extension — the side panel, the web clipper and the device lock.` | — | — |
| No extension | buttons | primary + 2 outlined | `SEE PLANS` (new tab → purchase) · `I HAVE UPGRADED` · `SIGN OUT` | recheck | — |
| Pipeline | head | text | eyebrow `Pipeline` · h1 = open project title (e.g. `Kodai Mazhai`) or `FilmMakerStudio` · deck `No project open — pick one on the hub, or start in Story.` | — | deck only if none open |
| Pipeline | stage rows | accordion buttons | name + blurb, `aria-expanded` | toggles one open | open = hue border |
| Pipeline | foot | row | e-mail (muted) left, outlined `SIGN OUT` right | — | — |

**Lists & tables** Stage cards in order: `Story` — Idea, logline, beats · `Screenplay` — Write it, version it, bring one in · `Pre-Production` — Break it down, see it, plan it, cost it · `Production` — The shoot day · `Post-Production` — The cut, and what leaves the building · then shelf `Library` — The reference shelf: read a film, then take one apart. Opened body: for Story and Screenplay, three "way in" tiles (bold label + muted sub): Story → `Sample` The sample synopsis, ready to tag. / `New` A blank synopsis and a beat framework. / `Import` .docx, .pdf or .txt — or drag it onto the page.; Screenplay → `Sample` Open the sample project, a whole feature filled in. / `New` A blank screenplay. / `Import` Fountain, Final Draft (.fdx), PDF or plain text. Then a module list: link (hue-deep, 600) + muted purpose line, e.g. `Beats & Pacing` — "Write the story and check its shape: where it rises, where it sags."; planned modules show a dim label + `in development`.

**States** Loading = `One moment` screen. Error lines: `Your account was opened on another device, so this panel signed out.` · `Your invite was revoked by an administrator.` · `That code could not be checked.` Request block variants as on invite.html. No trial or purchases-off variants beyond the "not in your plan" screen.

**Dialogs & overlays** None; Google sign-in via Chrome identity popup; a screening pass opens a new browser tab.

**Sample data** Open project `Kodai Mazhai`; signed in `asha.v@example.com`; 2 queued clippings; Story stage open.

**Mobile (390px)** The panel is already narrow; at 390px it is identical (full width, left aligned, buttons ≥44px). Wide windows cap at 40rem.

**Stitch prompt**
Design a narrow (360px) Chrome side-panel UI for FilmMakerStudio, dark violet (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase eyebrows). Produce three states. 1) Gatekeeper: eyebrow "Step 1 of 3", title "Enter Invite / Screening Pass Code", short deck, mono code input labelled "Code" (XXXX-XXXX-XXXX), primary "CONTINUE", outlined "NO CODE? SIGN IN TO REQUEST ONE", and a muted line about sending selected text to the Idea Vault. 2) Pipeline: eyebrow "Pipeline", project title "Kodai Mazhai", then stacked accordion cards for Story, Screenplay, Pre-Production, Production, Post-Production and Library, each with a coloured hue dot, bold name and muted blurb; the open Story card shows three tiles (Sample, New, Import with one-line subtitles) and a list of module links with purpose lines; footer with e-mail and outlined "SIGN OUT". 3) Closed: "Ask for an invite, or redeem a code." with request details list, note textarea and "REQUEST AN INVITE".

---

### Legal pages (files `privacy.html`, `terms.html`, `refund.html`)

**Purpose** Public policy documents (required for the Google consent screen and Razorpay). Words are in markup, readable with scripts off.
**Who sees it / when** Everybody, signed in or out; outside the site gate; linked from sign-in lines, footers, checkout notes. No app chrome, no shell, no skin, no storage; follows OS light/dark only. **Not** in the verify gate, so check at 390px by eye.
**Data source** Static copy; `{brand:name}` and `{brand:email}` stamped at build; "Last updated 12 October 2026".

**Layout** One column `main.legal`, max `--measure-wide`, padding s7 top / gutter sides / s9 bottom; paragraphs capped at `--measure`. Top to bottom: back link (mono uppercase violet-deep `← FilmMakerStudio`, → `/`), h1 (display, 4xl), sub-line (large muted), date line (mono uppercase muted with hairline below), a key box `.legal-key` (accent wash, 1px rule, 3px brand left rule, radius-lg, bold lead sentence), numbered h2 sections (display xl) with h3 subsections, bullet lists, footer line `.legal-foot` (top rule, small muted: brand · other two legal links · `Back to the studio`). No sticky parts, no table of contents. Placeholders needing owner input render as dashed amber `.legal-ph` chips.

**Elements / heading outlines**

| Page | H1 | Sub-line | Key box (bold leads) | H2 outline |
|---|---|---|---|---|
| `privacy.html` | `Privacy Policy` | `What we collect, why we collect it, who helps us process it, and the rights you have over it.` | `Your work stays on your device unless you choose otherwise.` + no-sale / no-ads / no-AI-training paragraph | 1 Who we are · 2 What we collect (h3: When you use the studio without signing in · When you sign in with Google · When you buy a plan · When you use AI features · Technical data · Counts of which tools are used (signed in) · Launch-offer e-mails and visit counts) · 3 Why we use it · 4 Who processes it for us · 5 Google Drive backup · 6 Cookies and browser storage · 7 How long we keep it · 8 Your rights · 9 Security · 10 Children · 11 Changes to this policy · 12 Contact and grievances |
| `terms.html` | `Terms of Service` | `The agreement between you and FilmMakerStudio when you use the studio.` | `Your work is yours.` / `Keep your own backups.` | 1 About these terms · 2 Eligibility and accounts · 3 Invite-only access · 4 Plans and payments · 5 Refunds and cancellation · 6 Your content · 7 AI features · 8 Third-party services · 9 Reference material is not professional advice · 10 Acceptable use · 11 Our content · 12 Availability and changes to the Service · 13 Disclaimer · 14 Limitation of liability · 15 Indemnity · 16 Ending your use · 17 Governing law and disputes · 18 Changes to these Terms · 19 Contact |
| `refund.html` | `Refund & Cancellation Policy` | `Plans are a one-time purchase. Purchases are final, with the exceptions below.` | `Plans are a one-time purchase.` / `Purchases are final and not refundable` (except duplicate charge etc.) | 1 Who sells the plans, and what this policy covers · 2 Cancellation · 3 Purchases are final · 4 The exceptions · 5 How to ask · 6 How refunds are paid · 7 What happens to your account · 8 Governing law · 9 Contact |

Footer links: privacy → `Terms of Service · Refund & Cancellation · Back to the studio`; terms → `Privacy Policy · Refund & Cancellation · Back to the studio`; refund → `Terms of Service · Privacy Policy · Back to the studio`. Contact is a `mailto:` of the brand support address (e.g. `support@example.com` as sample).

**Lists & tables** Bullet lists only (indent s4, items margin s2); inline `code` chips (mono, sunken bg, hairline); no tables.
**States** Static. No loading, empty, error, signed-in or purchase variants.
**Dialogs & overlays** None.
**Sample data** Date line `Last updated 12 October 2026`; contact `support@example.com`.
**Mobile (390px)** Same single column with 16px gutter; h1 shrinks via tokens; back link has ≥35px tap height; lists indent keeps.

**Stitch prompt**
Design a long-form legal document page for FilmMakerStudio in dark violet (ground #120f1c, cards #1b1727, accent #9575f8, Catamaran, mono uppercase small labels, 16px radius). No navigation chrome. Single readable column with comfortable measure: a mono uppercase violet back link "← FilmMakerStudio"; large display H1 "Privacy Policy"; muted large sub-line; mono date line "Last updated 12 October 2026" with a hairline rule under it; a highlighted key-points box (soft violet wash, 1px border, thick violet left edge, bold first sentence "Your work stays on your device unless you choose otherwise."); then numbered H2 sections ("1. Who we are", "2. What we collect" with H3 subsections, … "12. Contact and grievances"), body paragraphs, bullet lists, inline code chips; and a footer line with links to Terms of Service, Refund & Cancellation, Back to the studio above a top rule. Provide the same template for Terms and Refund. Mobile: same column, 16px gutters.

---

### 404 page (file `404.html`)

**Purpose** Friendly dead-end for any unknown URL, reassuring that local work is safe.
**Who sees it / when** Anyone following a bad link (served at any unknown path; `<base href="/">` keeps assets loading). Outside the gate; legal-page styling (no shell, no skin, no storage).
**Data source** Static markup only; brand name stamped.

**Layout** Same `main.legal` single column as the legal pages: back link, h1, sub-line, two link lines. Nothing sticky. Plain violet-dark ground.

**Elements**

| Region | Element | Type | Exact text | Behaviour |
|---|---|---|---|---|
| Top | Back link | mono violet link | `← FilmMakerStudio` | `/` |
| Body | H1 | heading | `That page is not here.` | — |
| Body | Sub-line | muted large | `The link may be old, or the address mistyped. Your work is untouched — it lives in your browser.` | — |
| Body | Link 1 | mono violet link | `Go to the studio` | `/` |
| Body | Link 2 | mono violet link | `About FilmMakerStudio` | `/start` |

**Lists & tables** None. **States** Static; no variants. **Dialogs & overlays** None. **Sample data** n/a.
**Mobile (390px)** Same column, 16px gutters, large display heading wraps.

**Stitch prompt**
Design a calm 404 screen for FilmMakerStudio, dark violet product UI (ground #120f1c, accent #9575f8, Catamaran, mono uppercase links, no navigation chrome). Left-aligned single readable column near the top: a small mono uppercase violet back link "← FilmMakerStudio", a large display heading "That page is not here.", a muted large sub-line "The link may be old, or the address mistyped. Your work is untouched — it lives in your browser.", then two stacked mono uppercase violet text links, "Go to the studio" and "About FilmMakerStudio". Optionally add a subtle violet radial glow and a small film-slate glyph, but keep copy exactly as given. Generous whitespace, 16px gutters on mobile.


---

# PART D — Settings, Library, Idea Vault and Story stage

## Part 03 — Settings, Library, Idea Vault, Story stage

Extracted from the code in worktree `admin-fixes` (read-only). Strings are quoted from source. Global conventions used below:

- **Shell band** (every page): sticky top band with breadcrumb ("Studio › <Page>"), sign-in pill, Backup menu, Dark/Light button; below 720px the band is breadcrumb-only and a **bottom bar** (Home · Go to · Search · Tools) takes over.
- **Side menu** (shared `section-menu.js` / `tabs.js`): at >=1100px a 13.75rem (220px) vertical column of grouped rows (icon + label, optional tick/badge/lock), 24px gap, content column up to ~76rem; below 1100px it becomes a sticky horizontally scrolling tab strip plus a "Sections"/"Steps" sheet button. Hash picks the tab.
- **Page header** pattern `.bd-head`: mono eyebrow (uppercase), H1 with trailing full stop, grey deck paragraph.
- **Card** `.st-sec.st-card`: eyebrow (mono caps), H2 `bd-h2`, sub `bd-sub`, then controls. Buttons are pills; `.btn.primary` is violet; `.btn.danger` is red-outlined.
- Tokens: ground `#120f1c`, card `#1b1727`, accent `#9575f8`, radius 16px, font Catamaran (mono labels JetBrains Mono, screenplay Courier Prime).

---
## 1. SETTINGS — `settings.html`

Page title "Settings." Eyebrow "Studio". Deck: "Your account, how the studio behaves on this device, where your work is kept and backed up, and your team." Container `.st-body.st-console` (max 76rem). Five tab panels (`section.st-tab`) in the side menu; a panel with no cards is not drawn (Team signed out, Admin for non-admins). Old billing anchors (#plan, #billing, #invoices, #refund, #promo, #gift, #trial, #referral) redirect to `purchase.html#plan`. Card ids still resolve as hashes (#drive, #ai, #danger, #favourite …) and open the owning tab.

**Side menu (group → tab, icon, hint)**
| Group | Tab | Icon | Hint |
|---|---|---|---|
| You | Account (`#account`) | person | Your sign-in, your plan, your activity and invites. |
| This device | Preferences (`#preferences`) | tune | Region, motion, favourite film, your AI key and privacy. |
| This device | Data & backup (`#backup`) | backup | Where your work is kept, cloud sync, Drive backup and erase. |
| Together | Team (`#team`) | groups | Who you share films with. |
| Admin | Admin (`#admin`) | admin_panel_settings | Studio-wide settings for administrators. |

Common to all Settings sub-screens — **Data source:** per-device `localStorage` (almost nothing here is in a project, backup or synced), `window.StudioCloud` (Supabase session, `gate.status()`, `setSyncEnabled`), `PlanGate` / `Billing.status()` (RPC `billing_status`). **Who sees it:** everyone; signed-in/plan/admin states noted per card. **No-project:** Settings is an app-scope page, no no-project banner; Favourite film then applies to the browser.

### Settings › Account (`settings.html#account`)
**Purpose** sign-in, plan summary, activity timeline, invite-code box. **Who** all visitors; cards vary by sign-in.
**Layout** one column of four cards, each full panel width (~58rem at 1280, full width minus 16px gutters at 390).
**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Card "Your account." (id `you`) | eyebrow/H2/sub | text | "You" / "Your account." (signed out: "Sign in.") / "You are signed in. Signing in is what lets your films sync between devices and be shared." (signed out: "Everything works without an account. Signing in adds sync between devices and sharing.") | — | signed in vs out |
| same | Account block (`#amBlock`) | inline panel | signed in: avatar circle with initials, name, e-mail; sync dot + status ("Local only" default); rows "↻ SYNC NOW", "⚙ CLOUD SETTINGS", "SIGN OUT" (danger); footnote "Signing out leaves every project on this device." Admin gets "→ ADMIN CONSOLE" (or "→ CONSOLE · 3 REQUESTS WAITING"); gate-closed gets "→ START YOUR FREE TRIAL" / "→ YOUR INVITE REQUEST". Signed out: note "You are not signed in. Your projects are saved on this device either way." + button "SIGN IN" | SIGN IN opens Google auth modal; SYNC NOW syncs; CLOUD SETTINGS opens modal in settings mode; SIGN OUT signs out | build with no cloud: "This build is not connected to a cloud project, so there is no account to sign in to." |
| Card "Plan." (`plan-summary`) | eyebrow "Your plan", H2 "Plan.", sub "What you have, and when it ends. Everything about buying, invoices and refunds is on the Purchase page." | text | | | |
| same | plan line `st-plan-line` | text | purchases off: "The studio is free to use right now. Nothing needs buying." · trial: "Free trial · ends 31 Oct 2026, 11:59 pm." · paid: "Intermediate · yours for good." · granted: "Access given to you by the studio · Pro." · expired: "Your free trial has ended. A plan brings it back." · else "No plan." / "Plan details load when you are signed in." | — | 6 states |
| same | plan note `st-plan-note` | grey small | "The studio is open, so nothing is capped: sync as many films as you like and share them freely." / "Nothing is capped while this access stands." / "Plan limits on synced films and shares apply once you choose a plan." / "Everything you wrote is still saved on this device." | | |
| same | usage block (paid only) | H3 mono caps "Your usage" + list | "Cloud projects: 3 of 10" · "Live share links: 1 of 5" · "Most collaborators on one film: 2 of 4" · "Organisation seats used: 1 of 3" (appends " — at the limit" and highlights when full) | | loading "Counting your usage…"; error "Your usage could not be loaded just now. The Purchase page shows it too." |
| same | link button | primary | "Manage plan →" (paid) / "Plan & purchases →" | goes to `purchase.html` | |
| Card "Activity log." (`activity`) | eyebrow "This studio", sub "A timeline of your recent edits. Updates whenever you save. Click an entry to jump back." | list (below) + 2 mini buttons "↻ REFRESH", "CLEAR LOG" (danger) | count chip "12 ENTRIES" (or "1 ENTRY") | CLEAR LOG → dialog | |
| Card "Have an invite code?" (`invite`; drawn only if cloud configured and not an already-registered member) | eyebrow "With a code" (signed in: "Invite") | form | label "Invite or screening pass code", input placeholder `XXXX-XXXX-XXXX` (uppercase), hint "Spaces and dashes are ignored. A screening pass opens the screening room instead.", primary button "CONTINUE WITH GOOGLE" (signed in: "REDEEM CODE"; busy "CHECKING…"), links "No code? Start a free trial →" and "What is this? About FilmMakerStudio →" | empty submit shows red alert "Enter the code you were given. With no code, sign in with Google and choose a plan or a free trial." | |
**Lists & tables** Activity row: `when · WHERE chip · what` e.g. `2h ago | FEATURE | Filled in Step 08 — Save the Cat beats`. Chip labels FEATURE / SHORT / LIBRARY / STUDIO, each a hue.
**States** Activity empty: "No activity yet. Start a film and begin filling things in. Activity updates whenever you save."
**Dialogs** Clear log: title "Clear the activity log?", body "Your blueprint data is not affected.", confirm "CLEAR LOG" (danger).
**Sample data** Account: Karthik Raja, karthik@example.com; "Local only"; plan "Intermediate · yours for good."; usage 3 of 10 cloud projects.
**Mobile (390px)** side menu becomes sticky tab strip (Account · Preferences · Data & backup · Team · Admin) + sections sheet; cards stack, padding 16px; action buttons wrap full-width.
**Stitch prompt** Dark violet product UI (ground #120f1c, cards #1b1727, accent #9575f8, pills, 16px radius, Catamaran). Settings page, Account tab. Left: 220px vertical side menu grouped "You / This device / Together / Admin" with icon rows (Account selected, violet wash). Right column: page header "Settings." with mono eyebrow "STUDIO" and grey deck. Four stacked cards: (1) "Your account." with avatar-initials row, name, e-mail, green sync dot "Local only", ghost rows Sync now / Cloud settings, red Sign out, footnote; (2) "Plan." with line "Intermediate · yours for good.", a small usage list (Cloud projects 3 of 10…) and primary pill "Manage plan →"; (3) "Activity log." with "12 ENTRIES" chip, rows of time, colored FEATURE/SHORT chip and text, Refresh and red Clear log mini buttons; (4) "Have an invite code?" with code input XXXX-XXXX-XXXX and primary "Continue with Google". Mobile: tab strip on top.

### Settings › Preferences (`settings.html#preferences`)
**Purpose** device-level choices that change what the studio offers. Six cards. Data: `fms_studio_prefs_v1` (motion), region key (`region.js`), project fav (`store.js` projectFav) or `fms_studio_demo_v1`, AI key `fms_ai_key_v1` (raw, in no registry), `fms_usage_optout_v1`, tour state `fms_tour_v1`.
**Elements**
| Card (id) | Element | Type | Exact text | Behaviour | States |
|---|---|---|---|---|---|
| Where you are making this film (`region`) eyebrow "This device · not part of the film" | radio group "Mode" | 2 pill radios | "India" (title "Chennai rates, Indian festivals and the certification checks.") · "International" ("The same studio without the India-only parts.") | click saves and **reloads the page** | explanation note switches: India = "India: the certification checks, the Chennai rate card and the Indian festival deadlines are all on, and prices show in rupees."; International = "International: the India-only parts of the studio are hidden rather than replaced. …" ; second note "You chose this, so it stays chosen…" or "Guessed from your device's time zone (India). Nothing was looked up…" |
| Motion (`motion`) sub "Reduce the animation, or follow your device. Your choice is not part of any project or backup." | radio group "Reduce motion" | 2 pills | "Auto (follow system)" · "Reduced" | instant, stored in prefs | |
| Favourite film (`favourite`) eyebrow "This film" (project open) / "This device" | 4 radio cards | `fav-card` | each: title, "year · director", genre — "96 / 2018 · C. Prem Kumar / Romance · Memory"; "Por Thozhil / 2023 · Vignesh Raja / Investigative Crime Thriller"; "Dragon / 2025 · Ashwath Marimuthu / Drama · Character study"; "Vikram Vedha / 2017 · Pushkar–Gayathri / Neo-noir · Moral thriller" | selecting writes on click only | note: "Saved with this project. Another project keeps its own favourite." / "No project is open, so this applies to this browser. Open a project and pick again to give that project its own." |
| Your Anthropic API key. (`ai`; title uses current provider label) eyebrow "This device · never synced" | key area | Key bar (key present): "Key on this device: ••••••••••••abcd", Provider select (Anthropic / Google Gemini), Model select ("Sonnet 5 — quick — the default" / "Opus 5 — slower, more considered"; Gemini: "Gemini 3.8 Flash", "Gemini 3.1 Pro"), buttons "Test the key", "Replace key", "Forget key" (danger), status line `ai-test` ("Not tested yet. "Test the key" sends one short request to … and says whether it worked." → ok green / warn / bad red). No key: gate "No API key on this device. Every AI tool in the studio runs on … Paste a key below to use it." + provider picker + password input (placeholder per provider) + primary "Save the key" + link "Where do I get one?  ↗". Always: disclosure box "What gets sent, and where — Your key stays on this device. It is never put in a backup, never synced and never sent to us. It goes only to <api host>, and only when you run a tool. Usage is billed to your own account. Forget key removes it from this device without touching your work." | | **Locked (no AI on plan):** note "AI tools come with Pro. Your key would be kept on this device only." + pill "Unlock AI tools" |
| Privacy. (`privacy`) eyebrow "This device · what the studio may count" sub "The studio never reads what you write. This switch is only about whether it may count which tools get used." | checkbox | "Count which tools I use (no content, ever)" then " — on. When you are signed in, the studio adds one to a daily total for a tool you opened or a feature you used, such as "budget opened" or "PDF exported". The total has no name, e-mail, film, script or text on it." / " — off. Nothing is counted from this device." | writes key only when opted out | + two notes and link "Read exactly what is counted" → privacy.html#usage-counts |
| Take the tour. (`tour`) eyebrow "Help" sub "A two-minute walk through the studio. It never starts by itself; this is the button for it." | ghost button | "Take the tour again" | starts tour; failure toast "The tour did not load." | |
**Sample data** Region India (guessed); Motion Auto; favourite "Dragon"; key "Key on this device: ••••••••••••9xQ2"; Privacy on.
**Mobile** cards stack; radio pills wrap; favourite cards become a 1-column (auto-fit min 13rem, 2 columns ≥ 480px).
**Stitch prompt** Dark violet UI (#120f1c / #1b1727 / #9575f8, pills, 16px radius, Catamaran). Settings › Preferences. Side menu left (Preferences selected). Six cards in a column: "Where you are making this film." with two pill radios India (selected, violet) / International and an explanatory note; "Motion." with radios Auto (follow system) / Reduced; "Favourite film." with four selectable cards (96, Por Thozhil, Dragon selected with violet border, Vikram Vedha) each title, year · director, genre; "Your Anthropic API key." with key bar "Key on this device: ••••9xQ2", provider and model dropdowns, buttons Test the key / Replace key / Forget key (red), green status line, and a bordered disclosure "What gets sent, and where"; "Privacy." with a checkbox switch and explanation; "Take the tour." with ghost pill button.

### Settings › Data & backup (`settings.html#backup`)
Four cards: Storage, Cloud sync, Drive backup, Danger zone. Data: `storageUsage()` (store.js key walk), `DriveSync` (`fms_drive_sync_v1`), `StudioCloud`, backup.js builder.
**Elements**
| Card | Element | Exact text / behaviour | States |
|---|---|---|---|
| Storage. (`storage`) eyebrow "This device · where the work actually sits" | sub | "Everything you write is saved in this browser. Everyday work — blueprint answers, scenes, contacts, the schedule — uses the browser's main storage, which has limited room. Large items such as screenplays are kept in a second, much larger store." | |
| | Two meters `st-meter` | (1) "Main storage" — "312 KB of about 10.0 MB" (figure right), progress bar (violet fill; amber `is-warn` >=75%, red `is-bad` >=90%), note "3% full, across every project on this browser." (warn adds " There is still room, but now is a good time to take a backup."). (2) "Large-item storage" — "nothing here yet" / "1.4 MB across 2 items", note "Browsers allow hundreds of megabytes here, so there is plenty of room." / "Nothing large enough to need it yet. A screenplay is usually the first." | tier down |
| | alarm cards `st-alarm` (red border) | "Part of your storage did not open." + "This browser could not open the storage used for large items such as screenplays, so a script may look empty when it is not. Nothing has been lost, and saving over it is blocked. Reload the page before you type anything…"; "Storage is nearly full." + "Saves may soon start to fail. Download a backup below, then delete a project you have finished with from Home to make room." Also note "Large-item storage has not been checked yet, so its figure below is not shown." | |
| | notes | "The limit is an estimate: most browsers allow about 5 MB of main storage. These figures count only your work, not the app itself." · "To take a copy of every project, use Backup in the top bar (Export everything). Keep it somewhere safe — browsers can clear their storage without asking." | |
| Cloud sync. (`cloud-sync`) eyebrow "Your account" sub "Keeps your projects the same on every device you sign in on. Independent of Google Drive." | checkbox "Cloud sync" + " — your work goes up to your account a few seconds after you stop typing." / " — off. Changes on this device are kept here and will reach your account when you turn it back on." | Turning OFF → dialog "Turn off cloud sync?" body "Changes on this device won't reach your other devices until you turn it back on. Nothing is deleted." confirm "TURN OFF". Signed out: note "Sign in to turn on cloud sync. Everything works without an account; your projects stay on this device." + primary "Sign in". Signed in without support: "Cloud sync is not available in this build." |
| Back up to Google Drive. (`drive`) eyebrow "This device · your own Drive" sub "A copy of every project on this browser, in your own Google Drive. Drive keeps earlier versions, so you can go back. Your AI key is never included. (Quick exports and imports are in Backup, in the top bar.)" | status pill `st-drive-status`: dot (grey / green synced / amber conflict / red error) + detail text e.g. "Synced 2 minutes ago" | | **Locked (plan lacks `drive_backup`):** note "Google Drive backup comes with Intermediate (₹ … ) — one payment. You can still export a backup file from Backup in the top bar." + ghost link "SEE INTERMEDIATE" / "SEE PLANS". **Not configured:** "Google Drive backup is not available right now. You can still export a backup file from Backup in the top bar." |
| | Not connected | note "Connecting gives the studio access to the one backup file it creates in your Drive — nothing else." + primary "Connect Google Drive" (busy "Asking Google…") | |
| | Connected | note "Last synced 12 Oct 2026, 04:10 pm. Changes go up a few seconds after you stop typing." Buttons row: primary "Back up now", "Restore from Drive", "Earlier versions" / "Hide earlier versions", "Disconnect". Error state adds primary "Reconnect Google Drive". Cloud-sync-on note: "Cloud sync is on, so your account already keeps your work up to date. Drive is your extra copy: press Back up now whenever you want one. It does not also upload by itself, so two devices never overwrite one file." Footer link "The file is yours to open, copy or download: open it in Drive. Disconnecting here never deletes it." | busy labels "Uploading…", "Reading Drive…", "Reading…" |
| | Earlier versions list | rows `date · [Restore this one]`; empty "Drive is not holding any earlier versions of this file yet." | |
| | Conflict card `st-conflict` | "Both copies changed." / "The backup in Drive was changed somewhere else, and this browser has changes too. Nothing has been overwritten. Choose which copy to keep — Drive keeps the earlier version either way." rows "This browser — last edited …", "In Drive — last changed …"; buttons "Keep mine — upload over Drive", "Take theirs — replace this browser" | |
| | Restore preview `st-restore` (opens before confirmation) | H3 "Check before you restore"; two sides "In the backup" / "In this browser now" with totals; per-project rows (name, format, "Backup: 42 scenes, 118 pages", fate "Replaces your copy (now …)" amber or "Added — this browser does not have it" green); warning block "What restoring replaces" + sentences ("Replaces 2 projects in this browser with the backup's copy: …", "Adds 1 project this browser does not have yet: …", "It also sets your studio preferences (theme, writing settings, tour progress) and your saved notes to the backup's.", "The file in Drive is not changed by a restore. Unsure? Download this browser's backup first."); buttons primary "Restore this backup…", "Download this browser's backup first", "Cancel" | |
| Erase what you have written. (`danger`) eyebrow "Danger zone" (red) sub "These cannot be undone. Export a backup first (Backup, in the top bar) if you want to keep anything." | red-bordered rows | "Removes every project, setting and saved key from this browser, and signs you out." + danger button "Erase everything on this device"; signed in adds "Deletes the cloud copy of every project you own. The copies on this device stay." + "Delete my cloud projects" | |
**Dialogs** Erase: title "Erase everything on this device?", body "Every project, setting and saved key in this browser is erased. You stay signed in; the cloud copies of your projects are not touched, and cloud sync is paused so the empty device does not upload over them. This cannot be undone.", type-to-confirm "ERASE", checkbox "Also delete my Google Drive backup file", confirm "ERASE EVERYTHING" (danger); result "Erased" / "Not everything was erased". Delete cloud: title "Delete my cloud projects?", body "Deletes the cloud copy of every project you own. The copies on this device stay. Cloud sync will be paused so nothing re-uploads.", type "DELETE", confirm "DELETE CLOUD COPIES". Drive disconnect: "Stop syncing to Drive from this browser?" / "The file in your Drive is not deleted and nothing you have written is touched." / "STOP SYNCING". Restore confirm: "Replace this browser's copy?" … "REPLACE" (danger).
**Mobile** meters full width, drive buttons wrap into a 2-column grid / stacked, restore rows stack.
**Stitch prompt** Dark violet UI (#120f1c, cards #1b1727, accent #9575f8, pills, 16px radius, Catamaran). Settings › Data & backup. Four cards. "Storage." with two meter blocks: "Main storage — 312 KB of about 10.0 MB" with a thin violet progress bar (amber and red variants shown beside) and "Large-item storage — nothing here yet"; a red-bordered alarm card variant "Storage is nearly full."; "Cloud sync." with a toggle row; "Back up to Google Drive." with status pill (green dot "Synced"), "Last synced" note, button row Back up now (primary) / Restore from Drive / Earlier versions / Disconnect, an amber "Both copies changed." conflict card, and a "Check before you restore" comparison panel with two side figures and project rows; "Erase what you have written." danger zone with red outline and red pill buttons.

### Settings › Team (`settings.html#team`)
Drawn only when signed in. Card "Who else can open these films." (id `account-people`), eyebrow "Your account · shared with people you invite", sub "An account is the one thing on this page that is not about this browser. It is how a film reaches somebody else — they sign in with Google and the films in this account are there. Everything else on this page stays on this device." Data: RPC-backed `Account.loadAccount()`, `listProjects()`, `inviteMember`, `revokeMember`, `setProjectAccount`.
**States**
- loading: "Reading the account…"; error: red alert line.
- none: note "You do not have a studio account yet. Creating one lets you invite other people to the films you put in it. Your work is unaffected either way — this adds a shared space, it does not move anything into one." + label "STUDIO NAME" + input placeholder "My Studio" + primary "Create the account" (busy "Creating…").
- ready: account name (display font), seats line "Seats: 2 of 3." (full → red + " To invite anyone else you need another seat — upgrade your plan to add seats."), member list rows `e-mail (you) / "Owner · joined"`, `"Member · invited — has not signed in yet"` with button "Cancel invite" / "Remove" (owner row has none; empty "No member rows yet."). If manager and seats free: label "INVITE BY EMAIL", email input "someone@example.com", select (options "Member — the films you share with them", "Admin — every film in the account"), button "Send the invite" (busy "Inviting…"), note "They join by signing in with Google using that exact address — there is no link to forward and nothing to copy. An admin can reach every film in this account, so invite as a member unless you mean it." Then label "FILMS IN THIS ACCOUNT" list rows (title + "shared with this account" / "yours alone" / "in another account") with button "Share with the account" / "Make it mine alone"; empty "No films have reached the cloud yet. A project appears here once it has synced — this list is the account's, not this browser's."
**Dialogs** attach: `Share "Dragon" with Chennai Frames Studio? Everybody who is an owner or admin of this account — now or later — will be able to open and EDIT it. Nothing is copied or moved; you stay its owner.` Detach: `Take "…" back out of …? Members lose access to it. Nothing written is deleted, and anybody invited to the film itself keeps that.` Revoke (danger): `Remove asha@example.com from this account? They lose access to the films in it. Nothing they wrote is deleted.`
**Sample data** Account "Chennai Frames Studio"; Seats 2 of 3; karthik@example.com Owner (you) joined; asha@example.com Member joined; ravi@example.com Member invited; films "Dragon" shared, "Kaalam" yours alone.
**Mobile** member rows stack e-mail over status with the action button underneath; invite form single column.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Settings › Team tab. Card "Who else can open these films." Inside: account name "Chennai Frames Studio", small line "Seats: 2 of 3.", list of three member rows (e-mail, mono role · status such as "Owner · joined", "Member · invited — has not signed in yet", ghost "Cancel invite" button), an invite sub-form with mono label INVITE BY EMAIL, e-mail input, role select (Member / Admin), ghost "Send the invite" and a help note, then "FILMS IN THIS ACCOUNT" list with rows and ghost buttons "Share with the account" / "Make it mine alone". Include the create-account empty state variant with STUDIO NAME input and primary "Create the account".

### Settings › Admin (`settings.html#admin`)
Drawn only for admins (gate role admin) or builds with no Supabase project. Two cards.
- **"The application console."** (`admin-console`), eyebrow "Administrator", sub "Invite requests, codes, members and sessions, and the studio as a whole in numbers, are on their own page." Primary link "OPEN THE CONSOLE" (→ admin.html) + muted "3 invite requests waiting".
- **"The database this build talks to."** (`database`), eyebrow "Admin · not shown to other people", sub "Everyone else signs in without ever meeting these two values… the anon key is public by design — what keeps one account out of another's projects is the row-level policy on the database, not the secrecy of this string." Note "This build ships with https://xxxx.supabase.co, so a new visitor can sign in with no setup at all." (or no-project variant). Status pill dot + "USING THE BUILD'S OWN PROJECT" (green) / "THIS BROWSER IS OVERRIDING THE BUILD" (amber). "In use right now: <url>". Buttons "Point at another project" / "Change the project" and (override only) "Use the build's project". Note "Reset everything on Home no longer clears this, so a wipe does not cost you a trip to the Supabase dashboard. It does sign you out."
**Dialog** "Use the build's own Supabase project?" / "Drops this browser's own Supabase project and goes back to the one this build ships with. Nothing you have written is touched. You will be signed out of the current project." / "USE BUILT-IN".
**Mobile** stacks. **Stitch prompt** Dark violet UI as above. Settings › Admin tab with two cards: "The application console." with eyebrow ADMINISTRATOR, primary pill "OPEN THE CONSOLE" and text "3 invite requests waiting"; and "The database this build talks to." with a green-dot status pill "USING THE BUILD'S OWN PROJECT", mono URL line, and ghost buttons "Point at another project" / "Use the build's project", plus small grey notes.

---
## 2. LIBRARY — `library.html`

Title "The Filmmaker's Library". Data-volume `library`. Data: `src/data/films.json` (22), `directors.json` (10), `rules.json` (50), `rates.chennai.2024.json` + `rates.chennai.checks.json`, `watchlist.json` (24 steps × 3 films), `studies.json` (4 case studies), `dissections.json` (shipped worked examples), `glossary.json` (terms, 4 films, `stage` per term), `navigation.json` (shelf labels). Storage: `fms_dissect_v1` (your dissection), `fms_workbench_v1` (case-study workbench, per project), `fms_studio_demo_v1` (chosen demo film). Everything else read-only. Plan: a shelf tab the plan excludes shows a lock card (`PlanGate.lockTabs`): eyebrow "Your plan", H2 "Not part of the free trial." / "Not on the Intermediate plan.", list of the locked modules (label + purpose), text "… is part of a higher tier. Everything you have written here is still saved on this device; it reappears the moment the plan includes it.", buttons primary "SEE PLANS" and "BACK TO THE STUDIO".

**Page frame (above the tabs)**
1. Toolbar zone in the shell band: link "← STUDIO" (project crumb), nav-jump anchors (FILMS · DIRECTORS · RULES · EQUIPMENT · WATCH LIST · CASE STUDIES · DISSECTION · TERMINOLOGY), theme button "◐".
2. **Cover** `section.cover`: mono mark "A reference companion to every stage of the studio"; H1 "The Filmmaker's Library." (word Filmmaker's in light weight, line break); sub "A curated reference: 22 Tamil & Indian films analyzed for craft, 10 director archetypes, 50 craft rules, equipment cost ranges (Chennai 2024-25), and a 72-film watch list mapped to every step of the blueprint."; contents nav of 8 cards ("SECTION I" … + title + desc).
3. **Library index** `#library-index`: label "THE LIBRARY · INDEX", H2 "The library index.", deck "Every shelf, and the films, directors, rate tables and watch-list steps on it, in one place. Open one to jump straight in.", right "8 SHELVES"; a grid of cards (head link title + desc; `<details>` "N on this shelf" listing item links).
4. **Side menu** groups: **The shelf** (Films `movie`, Directors `videocam`), **Craft** (Rules `rule`, Film terminology `sort_by_alpha`), **Practice** (Equipment `photo_camera`, Watch list `visibility`), **Study** (Case Studies `menu_book`, Dissection `category`). Hints: "Tamil films and the craft lesson in each." / "Director archetypes to study." / "Rules of thumb, attributed." / "Every film term, with examples." / "Rate tables for kit and crew." / "Films to watch for each blueprint step." / "Films read beat by beat." / "A finished film taken apart."
5. After tabs: **Final page** quote: "Watch films like a director, not an audience. Then write films like an audience, not a director." signature "THE FILMMAKER'S LIBRARY".

Each tab section starts with `.section-head`: left = mono label "SECTION I", H2 (with italic em tail), deck; right = mono count chip. Tabs with a long list also get a **sticky left rail** (`nav.lib-rail` at >=1100px, label "IN THIS TAB") listing anchors (films, directors, rate tables, watch steps, glossary stages), body to its right (`lib-split`).

**Search:** the Library has no own search box; search is the global command palette (Search in bottom bar / ⌘K), which indexes films, directors, rules, rate rows, terms (`library-search.js` ids). The glossary tab has its own filter.

### Library › Films (`library.html#films`)
**Purpose** 22 films, one craft lesson each. Head: "SECTION I", "The Tamil Cinema *Craft Library.*", deck "Twenty-two films, mostly Tamil with a few Malayalam neighbours. For each one, the single craft lesson worth taking. Not reviews — extractable techniques you can apply to your own work.", chip "22 FILMS".
**Layout** rail (left, sticky, 22 film titles) + `films-grid` of `article.film-card` (auto-fill, ~3 columns at 1280 with rail; 1 at 390).
**Card** mono meta "2017 · NEO-NOIR" · H3 title · director "PUSHKAR–GAYATHRI" · tag chips "STRUCTURE", "DUAL HERO", "FOLKLORE FRAME" · lesson paragraph with bold lead ("**Story-within-story as engine.** The Vikram-Betaal frame isn't decoration …") · optional Tanglish line (italic, smaller).
**Sample row** Vikram Vedha / 2017 · NEO-NOIR / PUSHKAR–GAYATHRI.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Library › Films tab. Left 220px side menu in four groups (The shelf, Craft, Practice, Study), Films selected. Section head: mono "SECTION I", big H2 "The Tamil Cinema Craft Library." with italic violet tail, deck, right-aligned chip "22 FILMS". Below, a sticky mini rail "IN THIS TAB" listing film names, and a responsive grid of film cards: mono meta "2017 · NEO-NOIR", bold title, director in caps, three small tag chips, a lesson paragraph with bold lead sentence and an italic Tanglish gloss.

### Library › Directors (`#directors`)
Head "SECTION II" "Director *Archetypes.*", deck "Ten directors whose grammar is distinct enough to study as schools of filmmaking. For each: the signature traits, the film to start with, and a Tanglish gloss on what makes them unique.", chip "10 ARCHETYPES". Rail of 10 director names. Body: stacked `article.director-card`: name row (H3 "Mani Ratnam" + mono era "1986 – PRESENT · ROMANCE / EPIC"), definition list `dl.traits` of term/value rows (Signature, Visual grammar, Recurring concern, Watch for …), a "study" block (label + paragraph, e.g. start-with film), Tanglish line.
**Stitch prompt** Same style; Library › Directors: stacked wide cards, each with large name left and mono era chip right, a two-column definition list (Signature / Visual grammar / Recurring concern / Watch for), a highlighted "Start with" box and an italic Tanglish line; sticky rail of director names at left.

### Library › Rules (`#rules`)
Head "SECTION III" "Fifty *Rules of Thumb.*", deck "Craft maxims, attributed where the source is known. Treat them as starting points, not laws — every great film breaks at least one.", chip "50 RULES". No rail. `rules-grid` of `rule-card` (numbered `data-n`): large quote text, mono attribution. Example: 1 · "If you can show it, don't say it." — CINEMATIC FIRST PRINCIPLE.
**Stitch prompt** Library › Rules: masonry/auto-fit grid of 50 cards on #1b1727, each with a big violet number, quote text and small mono attribution caps; 3 columns at 1280, 1 at 390.

### Library › Equipment & rates (`#equipment`)
Head "SECTION IV" "Equipment & *Rates.*", deck "Indicative daily rental ranges, Chennai market, 2024-25, in six tables. The Budget page reads them to estimate kit cost for your shoot. Rates fluctuate; verify with vendors before locking your budget.", chip "6 RATE TABLES · 2024-25". Rail: Camera Bodies, Lens Kits, Lighting & Grip, Sound & Power, Crew (Daily Rates), Music & Post.
**Elements** (1) disclaimer card: label "⚠ DISCLAIMER", paragraph ("These are indicative ranges based on Chennai market, 2024–25 … Always verify with at least three vendors…"), two hints: "Rate card as of 2024-25 — about two years old. Most of these figures have not been updated since; treat them as historical and re-quote before you budget." and "Re-checked on <date>. <method>". (2) per table `equip-block`: H3 heading, optional note, hint line about re-checks, optional section-check line with confidence tag + source link, then table. (3) "What could not be found" block (H3, hint "Looked for on <date> and not published anywhere …", bullet list). (4) Moved-calculator card: H3 "Working out what it costs", hint "The line-item estimator reads these rates and your shoot days …", primary "OPEN THE BUDGET →".
**Table columns** `Body | Rate (₹/day) | Notes` (other tables have their own column names). Example row: `ARRI Alexa 35 | 40,000 – 55,000 (+ confidence tag e.g. CHECKED, with "Looked for on …" source/caveat line) | Latest sensor; best HDR; high demand.` Confidence tags come from `CONFIDENCE_LABEL` (falls back to "NOTE"); orphan checks listed under "Checked, but no row in the table above carries this name any more:".
**Stitch prompt** Library › Equipment: amber-bordered disclaimer card, then six titled tables on #1b1727 with sticky header row (Body, Rate ₹/day, Notes), zebra-free hairline rows, rate cells with a small confidence chip and grey caveat below; closing card with primary pill "OPEN THE BUDGET →". Rail at left lists the six tables. Mobile: tables scroll horizontally inside rounded wrapper.

### Library › Watch list (`#watch`)
Head "SECTION V" "Watch List *per Step.*", deck "For every one of the first 24 blueprint steps (story and writing; the Feature Blueprint runs to <N>), three films to study for that exact craft concept. 72 films total. Watch them with the step's question in mind — the films will teach you more than the blueprint can.", chip "72 FILMS · 24 STEPS". Rail = 24 labels ("VOL I · STEP 01"…). Body: `watch-step` blocks — pill link tag "VOL I · STEP 01 ↗" (to the blueprint step), H4 "The Spark", three `watch-film` rows: bold "Magnolia (1999)" + why text ("Multiple "what if"s woven into one fabric. Watch how each spark recurs.").
**Stitch prompt** Library › Watch list: vertical list of step blocks; each has a violet pill link "VOL I · STEP 01 ↗", H4 title, and three film rows (title+year bold left, one-line reason right-grey).

### Library › Film terminology / Glossary (`#glossary`)
Head "SECTION VIII" "Film *Terminology.*", deck "Every term a filmmaker meets, from logline to edit sheet, grouped by the stage where it matters. Each opens with a plain definition, a Tanglish line, an example in your favourite film and, where there is one, a short video. The same definitions open as popovers wherever a term appears in the blueprints.", chip updates to "NN TERMS · 4 FILMS". Rail: five stage anchors (Story, Screenplay, Pre-production, Production, Post).
**Elements** filter row: label "Filter terms", search input placeholder "subtext, dolly, picture lock…", live count "NN terms" / "3 of NN terms" (role status). Host (loading: "Loading film terminology…"; failure "Film terminology could not be loaded. Reload the page to try again."). Per stage `lib-stage` with H3 "Story  12" (count) and `lib-term-grid` of `article.lib-term`: H4 term + "· aliases" muted, definition, `<details>` "Tanglish, example, video" (lazy body: "Loading…" / "Could not load the examples."; contains Tanglish line, example in favourite film, video slot), "SEE ALSO" links. Empty filter: "No term matches that. Try a shorter word — the definitions are searched too." Footer hint with link "feature blueprint's glossary" (department terms).
**Sample card** "Subtext" — "What a character means beneath what they say." · see also: Dialogue.
**Stitch prompt** Library › Film terminology: filter input with live count at top, five stage headings with count badges, 2–3 column grid of term cards (term bold with muted aliases, definition, collapsible "Tanglish, example, video" row, "SEE ALSO" links); sticky stage rail left; empty-filter message variant.

### Library › Case Studies (`#case-studies`)
Head "SECTION VI" "Case *Studies.*", chip "4 FILMS", deck "Pick one of four films and every card below speaks in its terms: the concept, the logline, the characters, the beats, the scene craft. Each card is the same three steps — what the thing is, how this film did it, how to write yours." Body is `src/ui/case-studies.js` (`#caseStudiesHost`), rebuilt on film change. Data: `studies.json` (96, Por Thozhil, Dragon, Vikram Vedha; fields meta, concept, logline, characters, beats, scenes, directorNotes, glossary, beatSheets), `glossary.json`, workbench key `fms_workbench_v1`. Hash `#study-<slug>` selects a film, `#cs-<part>` a part.
**Layout** (1) **Demo film selector** bar: mono label "Demo film · the whole workspace follows this choice"; four hue-tinted tab buttons (title, "year · director", genre, optional flag). (2) **Parts strip** `nav.cs-tabs` (role tablist, "Parts of this study"): Overview · Concept · Characters · (Beats) · Beat sheet (only films with it) · Scenes · Glossary · Workbench; one part visible at a time. (3) the part.
**Parts and elements**
- **Overview** header: eyebrow "Case study · Romance · Memory", H2 film title, byline "2018 · dir. C. Prem Kumar", deck = premise (unwritten: "This study has not been written yet. The structure below shows what it will cover…"), stats strip "7/7 beats written · 3 characters · 5 scene studies · 8 core terms", gap line "N parts of this study are still unwritten. They are named where they belong rather than hidden.", notes "What the director keeps doing" bullets.
- **Concept** ("The idea" / "Concept and logline"; deck "What the story is, before a single scene exists. Two cards, each in the same three steps: what it is, how 96 did it, how to write yours."): two guide cards ("Concept — The premise", "Logline — One sentence, five parts"), each an ordered three-part list (numbered circle, label "What a premise is" / "How 96 did it…" / "How to write yours", body). Logline card shows a blockquote and a 5-row anatomy table `Part | What it does | In 96` rows Protagonist ("Who wants it, and what is wrong with them"), Inciting incident, Conflict, Goal, Cost.
- **Characters** ("Who it happens to" / "Character arcs", deck "A want is what they say. A need is what the story is actually about…"): grid `st-char` cards: name + role chip, flaw, two-column pairs Want / Need, External stakes / Internal stakes, Arc line.
- **Beats** ("How it is built" / "The seven beats"): grouped by act (heading "Act 1 …"); `st-beat` cards: label + "Act 1", "Structural function", in-film line, "Steal this" craft line; missing beats get dashed "is-missing" with "The structural function has not been written for this study yet."
- **Beat sheet** ("The Save the Cat sheet", or "Named beat sheets"): language toggle (English / Tanglish; hint "Switches the explanation only. Beat names and page targets stay in English."), method name, attribution, "Written against", note; ordered cards with number, label, pages ("p. 1"), a position bar, function, in-film, "Steal this".
- **Scenes** ("How it is written" / "Scene craft"): cards with eyebrow technique, title, "How it is done", Tanglish.
- **Glossary** ("The words" / "Glossary, in 96's terms"): filter input "Filter terms" + count "NN terms"; core terms flagged "Core to 96" first; each term: dt term (+aliases), dd definition, Tanglish, example `Film · dir. … + note` or "No 96 example for this term yet."; empty "No term matches that…".
- **Workbench** (see below).
**Empty/missing:** "No case studies yet" with ◉ mark and "There are no film studies in this edition of the Library yet. The other shelves are all here."; gap panel eyebrow "Not written yet" listing "Missing from <film>: …"; "Not written yet." placeholders.
**Workbench (two panes, `wb-panes`: 5fr / 6fr at >=62rem, stacked below)**: left read-only reference `aside.wb-ref` (eyebrow "Reference · read only", H2 film title, "director · year · genre", sections for logline, seven beats (numbered, "Act N"), characters, scenes); right editor `section.wb-edit` (eyebrow "Your page · saves as you type", H2 "Write it yourself", "These notes are filed under 96…"): "Your logline" — "Five blanks. Fill them in any order — the sentence assembles itself below." (five labelled inputs Protagonist / Inciting incident / Conflict / Goal / Cost, each with prompt and "In 96: …" model; live "Assembled" preview "When ___, ___ must ___ against ___ — or ___."), "Your beats" (seven textareas with number, label, Act chip, filled dot), "Scratchpad" (placeholder "Scenes, fragments, arguments with yourself…"), copy buttons "Logline template", "Beat sheet template", "Your draft".
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Library › Case Studies. Top: demo-film selector bar with four selectable film cards (96, Por Thozhil, Dragon, Vikram Vedha — title, year · director, genre, each with its own hue accent). Beneath, a pill tab strip: Overview, Concept, Characters, Beats, Beat sheet, Scenes, Glossary, Workbench. Overview: eyebrow "CASE STUDY · ROMANCE · MEMORY", H2 "96", byline, premise deck, four stat tiles. Show one part, e.g. Beats: act groups with beat cards (label, Act chip, Structural function, in-film line, violet "Steal this" callout). Add a Workbench variant: two-pane layout, left read-only reference, right "Write it yourself" with five logline inputs and an "Assembled" sentence preview.

### Library › Dissection (`#dissection`)
Head "SECTION VII" "Film *Dissection.*", chip "1 WORKED EXAMPLE", deck "The blueprints build a script forwards. This runs the other way: start with a film that works, and name the job every sequence is doing. Read the worked example, then fill the same fields in about yours." Body `src/ui/dissection.js`. Data `dissections.json` (The Dark Knight, 2008, Christopher Nolan, "Crime · Moral thriller"), your own in `fms_dissect_v1` (per project).
**Layout** top: worked example (read-only); below: "Your dissection" form with the same fields. Writes on blur/debounce; add/remove rebuild.
**Worked example elements** eyebrow "Worked example · read the method, not the film", H2 title, meta "The Dark Knight · 2008 · Christopher Nolan · Crime · Moral thriller"; two claim blocks "Thesis — What the film argues", "Engine — What drives the structure"; three act columns "Act One / 5 sequences" etc. of `ds-seq` cards (mono position "~0:00", bold label "A prologue that closes itself", dl Function / Technique / Why); H3 "Sequence by sequence" + sub "Each one named for the job it does, not for what happens in it. That is the discipline — if the label is an event, you are summarising."; "Motifs, planted and paid" ("An idea that recurs is a promise. The second column is where it is made; the third is where it is kept.") motif cards name + what + chain "Plant → Payoff"; "What is transferable" craft cards per area (Structure, Character, Dialogue, Image, Editing, Sound) with lesson sentences; "Ask these of your own film" numbered questions.
**Your dissection (`#mine`)** eyebrow "Your dissection · the same fields, your film", H2 "Take one apart yourself.", sub "Everything you write here stays in this browser, on this project. The two strips below are worked out from what you have typed — …". Form blocks: "The film" (input placeholder "e.g. Aaranya Kaandam (2011, Thiagarajan Kumararaja)"), "Thesis" (textarea "The film argues that…"), "Engine" ("The structure advances because…"); "Sequences" rows (number, title input "What job does this sequence do?", position input "~0:00", up/down/✕ icon buttons, three textareas Function "This sequence…", Technique "Done by…", Why "It works because…"), add button "+  Add sequence", empty "No sequences yet. Ten to fourteen is a feature; start with the ones you can already name."; "Motifs" (name input "Name the motif", What recurs "It keeps coming back as…", Plant "First established by…", Payoff "It is cashed when…", "+ Add motif"); "Transferable notes" (area select + sentence "One sentence you could use on a different film.", empty "Nothing noted yet. A note you could not use on your own film is an observation, not a lesson."); "Questions for my film" (placeholder "Ask this of your own draft…", empty "No questions yet. Five to seven is plenty, and the awkward ones are the useful ones."). **Derived strips (never stored):** stats "4 sequences · 2 · 1 · 1 across the three acts · 60% of sequence fields written · 1 / 2 motifs paid off"; dangling-motif panel ("Dangling motifs" … "1 dangling motif — Planted, never paid. Either the film cashes it somewhere you have not spotted yet, …" + list; none: "None. Every motif you have listed has a payoff written against it."; empty: "Nothing to check yet. Add a motif and this panel watches it for you.").
**Empty state** (nothing yet): ◎ mark, H2 "Take a film apart", "Watching teaches you what a film did. Dissecting teaches you how. Pick one you admire, watch it twice, …", three how-steps (1 "Name the engine", 2 "Label by function", 3 "Chase the payoffs"), example callout "The example above has fourteen sequences and five motifs. You do not need that many…", primary "+  Start a dissection".
**Dialogs** remove rows use `askDanger` confirms.
**Mobile** act columns, motif chain (Plant → Payoff) and the form rows go single-column below 640px.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Library › Dissection. Top: worked example for The Dark Knight: header with eyebrow, title, meta, two claim cards (Thesis, Engine), three columns "Act One / Act Two / Act Three" of sequence cards (mono time, bold job label, Function/Technique/Why list), a Motifs section with Plant → arrow → Payoff cards, craft-lesson cards by area chips. Below: "Take one apart yourself." form with film/thesis/engine fields, sequence rows with up/down/remove icon buttons, "+ Add sequence" ghost pill, a stats strip (4 sequences · 60% written · 1/2 motifs paid) and an amber "Dangling motifs" panel; include the empty state with 3 numbered how-steps and primary "+ Start a dissection".

### Retired stubs
`study.html` → `library.html#case-studies` (ids prefixed `cs-`); `dissect.html` → `library.html#dissection`. Each is a blank page whose `moved.js` replaces the location immediately; no UI.

---
## 3. IDEA VAULT — `vault.html`

**Purpose** one place for clippings (links, lines, references) for this film. **Who/when** open project; reached in one click from the Story stage; the Chrome extension's "Send to FilmMakerStudio" lands here (`extension-bridge.js` drains `clipQueue`, toast "N clipping(s) arrived in the Idea Vault."). **Data** `fms_idea_vault_v1` via `src/lib/story.js` (list/add/update/remove), story framework from `fms_story_v1` (for beat pinning); "ADD TO SYNOPSIS" appends to `fms_story_v1.source`.
**Layout** single centred column (max ~76rem measure, padding 24px; 16px at 390): header, then one section `#vault` (tab label "Idea Vault") containing: sub-paragraph, add form, list. No sticky parts besides the shell band.
**Elements**
| Region | Element | Type | Exact text | Behaviour | States |
|---|---|---|---|---|---|
| Header | eyebrow / H1 / deck | text | "Story" / "Idea Vault." / "Everything you collect for this film, in one place. Pin a clipping to a beat, or add it to the synopsis when it earns its place." | | |
| Intro | sub | text | "The Chrome extension's "Send to FilmMakerStudio" lands here with the page it came from; you can also add one by hand." | | |
| Add | label + textarea `#stClip` (2 rows) + button | form | "Add a clipping" · textarea · "ADD TO VAULT" | adds (ignores empty), re-renders | |
| List | clipping `li.st-clip` | card | snippet text; meta row: source hostname link (new tab, e.g. `thehindu.com`), date "11 Oct 2026", select "Pin to a beat…" (options = current framework's beats, e.g. "Opening Image", "Catalyst"; selected shows the pinned beat), button "ADD TO SYNOPSIS", button "REMOVE" | ADD TO SYNOPSIS → toast "Added to the end of the synopsis."; REMOVE deletes with toast "Clipping removed." + action "UNDO" (restores incl. beat) | |
**States** Empty: "Nothing clipped yet." (muted). No project: shell banner "CREATE OR OPEN A PROJECT →" (clips go to the holding slot and are adopted into the next project). No loading or error states (local).
**Sample data** Clip 1: "The 1992 Madurai flood story — families sheltering on a temple roof for three days." · thehindu.com · 9 Oct 2026 · pinned "Catalyst". Clip 2: "Line overheard at Koyambedu market: 'Evlo vittaalum ennaala maraka mudiyaadhu.'" · (no source) · 11 Oct 2026 · Pin to a beat….
**Mobile (390px)** meta row wraps: source and date on one line, select full width, the two buttons side by side at 44px height.
**Stitch prompt** Dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, pills, 16px radius, Catamaran). "Idea Vault." page under shell band. Header: mono eyebrow "STORY", H1 "Idea Vault.", grey deck. One card: intro line about the Chrome extension, labelled textarea "Add a clipping" with ghost pill "ADD TO VAULT". Below, a list of clipping cards on #1b1727: snippet text, then a meta row with violet source link "thehindu.com", muted date "9 Oct 2026", a dropdown "Pin to a beat…" (selected "Catalyst"), pill buttons "ADD TO SYNOPSIS" and red-outline "REMOVE". Second clipping with no source. Include empty state "Nothing clipped yet." and a toast "Clipping removed. UNDO". Mobile: stacked controls.

---
## 4. STORY STAGE — `story.html`

Title "Story · FilmMakerStudio". **Purpose** write a story along a path: idea → logline → bible → scene order → step outline → synopsis → lock → screenplay, then pacing and pitch. **Who** an open project (format `feature` or `short` changes the path). **Data** `fms_story_v1` (idea, logline, source/synopsis, framework, frameworkChosen, marks, tension, outline steps, conflicts, conflictLine, outlineLockedAt), `fms_idea_vault_v1`, `fms_characters_v1`, blueprint blobs through `blueprint-store.js` merge-write (feature `fms_filmmaker_combined_v1`, short), `fms_scenes_v1__<id>`, `src/data/story-paths.json`, `frameworks.json`, `story-bible.json`, `samples.js` (Dragon, The Dark Knight). AI via the AI Desk (`aiPill`), disabled without a key/plan. Nothing is gated or mandatory; ticks mean "has something in it". Which step is lit is in memory and in the hash `#path-<id>` (old `#path-N` still land).

**Common page frame** header `.bd-head`: eyebrow "Story · beats & pacing", H1 "Story.", deck (feature) "From an idea to a step outline to a synopsis, against the beat sheet of your choice. Everything is on this page, in order; tag the passages that turn the story and watch where the tension sags." / (short) "From a seed to a step outline to a synopsis. Everything a short film needs is on this page: the character, the world, the conflict, the order of the beats." Then (once an idea exists) a **tool bar** `.st-bar`: "IMPORT" (file input .txt .md .docx .pdf), "SYNOPSIS .TXT", "OUTLINE .MD" (disabled until content), danger "START OVER" (when a synopsis or marks exist). Then the **step menu**: side menu >=1100px (13.75rem left, content right) with a done tick per step and hint "Done · 6 steps" / "To do"; below 1100px sticky strip + "Steps" sheet. Each step panel has stepper footer: "← BACK: <PREV LABEL>" · "Step 3 of 12" · primary "NEXT: <NEXT LABEL> →". Only the lit panel is visible (others `hidden`, fields still in DOM). Every step starts with eyebrow "Step N of M", H2, lead, and a closed "learn" box ("What is a …?", told in the favourite film).

**Path menu (feature)** group **Idea**: Idea (lightbulb), Logline (edit_note); **Build**: Story Bible (menu_book), Scene order (format_list_numbered), Step outline (list), Setups & payoffs (link), Timeline (timeline); **Write up**: Synopsis & treatment (description), Lock the outline (lock), Open the Screenplay Writer (movie); **Tools** (no ticks): Beats & pacing (trending_up — "Where the tension sags and where it peaks, against the beat sheet."), Pitch deck (slideshow — "A pitch deck built from the story so far."), Cover sheet (local_library — "The cover sheet: what the path above leaves out.").
**Path menu (short)** **Idea**: Seed, Logline; **Build**: Character (person), World (public), Conflict (bolt), Scene order, Step outline; **Write up**: Synopsis, Lock the outline, Open the Screenplay Writer; Tools same three.

### Story › Start cards (first visit, empty story) (`story.html`)
Shown when the story is empty and the start cards are unanswered; step menu hidden. Four cards `st-mode` in a responsive grid (auto-fit, min 16rem): 
1. eyebrow "Sample", H2 "Start from a sample.", body "A sample project's story: its idea, logline, a Save the Cat! step outline and the synopsis built from it, ready to tag. A quick way to see what the path, the matrix and the curve do.", buttons "USE DRAGON (2025)", "USE THE DARK KNIGHT (2008)" (title tooltips: "A Tamil campus-to-corporate drama, scene by scene." / "A crime epic, imagined as a Chennai unit's production, in rupees.").
2. "New" — "Start with the idea." — "A guided path: the idea, a logline, the people and the world, a scene order, then a step outline. Every step is on this page; start anywhere. The synopsis can be built from the outline when you get there." — primary "START THE PATH".
3. "Skip ahead" — "I already have a synopsis." — "Paste it and go straight to tagging it against a structure. Every step of the path stays a click away above." — "PASTE A SYNOPSIS".
4. "Import" — "Bring a file." — "A synopsis or treatment from Word, a PDF or plain text. Nothing is changed until you see it here." — dashed drop area "Drop a .docx, .pdf or .txt here, or choose a file".
**Dialogs/toasts** sample replace confirm "Replace the story on this page with the Dragon sample? Your idea, logline, outline and synopsis here are replaced. The Idea Vault is kept."; import success toast from `importedSentence`.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Story page first-run: header "Story." + deck, then four equal cards in a 4-up grid (2×2 on tablet, stacked on phone): Sample (two ghost pills USE DRAGON (2025) / USE THE DARK KNIGHT (2008)), New (primary pill START THE PATH), Skip ahead (ghost PASTE A SYNOPSIS), Import (dashed drop zone "Drop a .docx, .pdf or .txt here, or choose a file"). Each card has mono eyebrow, bold title, grey body.

### Story › Idea / Seed (`story.html#path-idea`)
H2 "The idea" (short: "The seed"), lead "What is the film, in a sentence or two? A "what if", an image, a question that will not leave you alone. Nothing here is final." (short: "…A single image, a moment, a question. A short film is one thing; nothing here is final."). Elements: optional "Three ways in" offer bar when the story is empty and cards were answered (text "Three ways in: start from an idea below, paste a synopsis you already have, or import one from a .docx or .txt file. Or open the sample film to see a finished one." + primary "START FROM AN IDEA", "PASTE A SYNOPSIS", "IMPORT A .DOCX OR .TXT", "OPEN DRAGON (2025)", "OPEN THE DARK KNIGHT (2008)"); label "Your idea" ("Your seed"), textarea 3 rows (autosave on blur/pointer); blueprint offer box "Feature blueprint, step 01: "…" [USE MY BLUEPRINT ANSWER]" when idea empty and blueprint s1_whatif exists; film example box "<Film>: "<premise>"" with "Examples from <Film> · change in Settings" (fills in ~2.5s after load); sub-heading "Your spark" + "The blueprint's own questions for an idea: the what-if, the image and why it has to be you." (short: "The seed, the image, why you") then the absorbed Feature step-01 fields (inline, "Loading the questions…" placeholder until loaded).
**Stitch prompt** Story › Idea step: side menu left with "Idea" lit (violet bar) and ticks on done steps; right panel eyebrow "STEP 1 OF 13", H2 "The idea", lead, a collapsed "What is an idea?" learn box, big labelled textarea "Your idea", a quoted example block "Dragon: "…"" with small link, a "Your spark" sub-heading and a stack of blueprint question fields, footer with primary pill "NEXT: LOGLINE →" and "Step 1 of 13".

### Story › Logline (`#path-logline`)
H2 "The logline", lead "One sentence: who the story is about, what they want, what stands in the way, and what it costs if they fail." Label "Your logline" + 3-row textarea; blueprint offer ("Feature blueprint, step 02: …"); example box; **Logline workshop** (AI check + variants, `logline-workshop.js`, via aiPill; disabled/locked states as AI); sub-heading "Drafts, then the final one" + "Write it three ways — a first go, a sharper one, the one you will use — then keep the best as your logline above." + blueprint step-02 fields; closed details "Earlier version of your logline (treatment ladder, rung 1)" with button "USE THIS AS MY LOGLINE" (toast "Nothing written in that earlier version yet." when empty).
**Stitch prompt** Story › Logline: labelled textarea card, example quote, an AI "check my logline" pill with sparkle, three stacked draft fields (first go / sharper / final), collapsed "Earlier version" disclosure, footer BACK / NEXT.

### Story › Story Bible (`#path-bible`; short film: Character `#path-character`, World `#path-world`, Conflict `#path-conflict`)
H2 "Story Bible", lead "The facts of your film in one place: who is in it, what it is fought over, what is at stake, what it is about and where it happens. Fill what you know; none of it is required." Short variants: Character "Who is the film about? Their name, what they want, what stands in their way, and the turn that changes everything. Add anyone else who matters."; World "Where and when it happens, and the few rules of the place. A short film has room for one location done well."; Conflict "What the film is fought over, and against what. Pick every kind that applies, then say it in one line." Body = `story-bible.js`: a row of **jump chips** (numbered 1–5, label, "Filled"/"Empty") scrolling to five cards (all on the page at once; a short film shows only its path's cards, plus Stakes/Theme only if their feature keys hold text). Then closed details "The blueprint's notes and checklist for this step".
Cards (id, label, lead, fields):
- **Characters** "Who is this about, and who stands in their way? Start with the protagonist and the antagonist; add the rest as they turn up." — collapsible character cards (name, role chip, tags "from the script"/"from your blueprint", stat text); each card groups **Who** (Name [placeholder RAVI], Also written as, Role in the story [Protagonist, Antagonist, Ally / confidant, Mentor, Love interest / mirror, Family, Other], Age / role / context [30s], Look, Voice notes — how they talk), **Drive** (Want — what they are after, Need — what they lack, Stakes — what they lose if they fail, Fear, The lie they believe), **Make-up** (Weakness / flaw, Strength / skill, Wound — the past event behind it, Secret), **Change** (Who they are at the start, Who they are at the end, Arc — how they change), **Ties** (Relationships, Cast as; relationship rows). Empty roster: note "Start with the two people the story turns on." (short: "Start with the person the film is about.") + primary "ADD THE PROTAGONIST", "ADD THE ANTAGONIST". Add row: label "Add another character", input placeholder "Name", button "ADD". Unfilled roles show a "not in your cast yet" card: "These are the blueprint's own questions for this role. Add the character above, or give someone this role, and the same answers appear on their card." Private-note pencil buttons on blueprint fields.
- **Conflict** "What the story is fought over, and against what. Pick every kind that applies, then say it in one line." — 8 toggle chips with meaning: "Person vs Person — Someone with their own goal stands in the hero's way.", "Person vs Self — The hero's own fear, flaw or habit is the obstacle.", "Person vs Society — A community, system, law or tradition pushes back.", "Person vs Nature — Weather, wilderness, an animal or a body that will not obey.", "Person vs Fate / the supernatural — Destiny, a curse, a god or a ghost decides what is possible.", "Person vs Technology — A machine, a network or an invention turns on its user.", "Family — Loyalty, duty or blood pulls two ways.", "Time / a deadline — The clock is the opponent: it must be done before it is too late."; textarea "The central conflict in one line" placeholder "e.g. A cop who cannot forgive himself must stop the one man who knows why."
- **Stakes** "What is lost if the hero fails: in the world, and inside them." — "Outer stakes — what happens in the world", "Inner stakes — what dies inside the hero".
- **Theme** "What the film is about underneath what happens in it." — "Your theme, as a sentence with a verb", "Philosophical stakes — the idea on trial".
- **World** "Where and when it happens, and the rules of the place." — feature: Era / time period, Specific location, How long the story lasts, 3–5 unbreakable rules of your world, Sensory signature — palette, sound, texture, a recurring object; short: Primary location — describe it like a character, Time of day and weather, Three sensory anchors — sound, texture, recurring object, Rules the world establishes (3–5).
Each card has H3, lead, "learn" box. Writes: characters via `fms_characters_v1` (400ms autosave, flush on pagehide), conflict via story model, others via blueprint merge-write.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Story › Story Bible: row of five numbered jump chips (Characters Filled, Conflict Empty, Stakes, Theme, World) above five stacked cards. Characters card with an expandable character card (RAVI · Protagonist chip · "from the script" tag) showing grouped fields Who / Drive / Make-up / Change / Ties as a two-column field grid, plus "Add another character" input + ADD pill and primary "ADD THE PROTAGONIST". Conflict card with eight outlined toggle chips (two selected in violet) and a one-line textarea. Stakes, Theme, World cards with labelled textareas. Footer BACK / NEXT.

### Story › Scene order (`#path-structure`)
H2 "Scene order", lead "The order your story's big moments come in — pick a beat sheet to lay them out. You do not have to: the outline and the screenplay work without one." Note "Every format is here. The suggestion is only a suggestion, and switching later is a view change: your steps keep the beat they were written under, and anything that does not fit the new format is listed rather than lost." **Framework grid** `st-fw-grid` (auto-fit, min 16rem; ~3 columns at 1280, 1 at 390) of 10 selectable cards (toggle, `aria-pressed`): top row name + badges "Suggested" / "In use"; count line "15 beats · peaks at Finale"; mini tension curve (SVG 120×36, violet line + dots + area); "suits" sentence. Frameworks: Three-Act Structure (7 beats), Save the Cat! (15), Story Circle (Dan Harmon) (8), Hero's Journey (Vogler) (12), Seven-Point Structure (7), Freytag's Pyramid / Five-Act (5), Fichtean Curve (6), Kishōtenketsu (4), Eight-Sequence (8), Two-Half / Interval Structure (9; the Tamil/Indian one), Short Film Five-Beat (5). Status line when none chosen: "Using Three-Act Structure until you choose a scene order." Then sub "Your beat notes" ("The fifteen beats, in your own words. They show beside the matching beat in the step outline.") (short: "Your five beats" / "One line for each of the short film's five beats, and the test it has to pass.") + blueprint step-08 (feature) / step-04 (short) fields. Toast on pick: "Scene order: Save the Cat!."
**Stitch prompt** Story › Scene order: grid of selectable framework cards, each with name, optional violet "Suggested" badge, "15 beats · peaks at Finale", a small violet tension-curve sparkline with dots, and a one-sentence "suits" description; the chosen card has violet border and "In use" badge; status line below; blueprint note fields.

### Story › Step outline (`#path-outline`)
H2 "Step outline · Save the Cat!", lead "A numbered list of what happens, beat by beat. One or two lines a step. Add, reorder and move steps between beats as the story finds its shape." Elements: when no framework chosen: "Using Save the Cat! until you choose a scene order. [Choose one]"; locked banner "Locked on 12 Oct 2026 at 04:10 pm. The outline is read-only. [Unlock to edit]"; coverage line "**9 of 15 beats have a step** · 12 steps written · 2 not placed in this format". Ordered beat list: each `li` has H3 beat label, mono "Act 1 · ~5%", prompt text, (feature+Save the Cat) quoted "Your blueprint, step 08: "…"", then numbered step rows (label "Step 3", textarea placeholder "What happens?", buttons "UP"/"DOWN" (disabled at ends), select "Move to beat…", "REMOVE"), then "ADD A STEP" and AI pill "Suggest steps for this beat". Empty beats are dimmed. **Unplaced section** "Not placed in 3-Act" (when switching format): note "These steps were written under another format. They are kept as they are; file them under a beat here, or switch the format back to see them where they were.", buttons "FILE ALL BY POSITION", per-row "FILE UNDER CATALYST" and a line "Written under Save the Cat!: Catalyst". Closed details "Earlier step outline (free text, treatment ladder rung 5)". Toasts: "Step removed." (UNDO), "3 steps filed under the nearest 3-Act beat."
**Stitch prompt** Story › Step outline: coverage line in bold, then a numbered list of beat cards (label, mono "Act 1 · ~5%", grey prompt, a callout of the writer's blueprint answer), inside each numbered step textareas with a column of small UP / DOWN / REMOVE buttons and a "Move to beat…" dropdown, ghost "ADD A STEP" and a sparkle "Suggest steps for this beat" pill; an amber "Not placed in 3-Act" tray at the bottom; locked variant with banner and read-only text.

### Story › Setups & payoffs (`#path-setups`, feature only) and Timeline (`#path-timeline`, feature only)
Setups & payoffs lead "What you plant early and pay off late. A setup nobody notices is the best kind; list the ones you know about." Timeline lead "The order things happen in the world, against the order the audience sees them. Only needed if the film jumps around." Each is the matching blueprint step (feature step-10 / step-09) drawn inline as its own question fields, with its formula/craft/examples notes and "before moving on" checklist.
**Stitch prompt** Story › Setups & payoffs: lead text and a stack of blueprint question fields with a tick-list "before moving on"; footer BACK/NEXT.

### Story › Synopsis (`#path-synopsis`)
H2 "Synopsis & treatment" (short "Synopsis"), lead "The story as prose. Build it from the outline — one paragraph per act, every step tagged with its beat — or write and tag your own." Elements: build row — primary "BUILD MY SYNOPSIS FROM THE OUTLINE" (or ghost "REBUILD FROM THE OUTLINE" once text exists), "UNDO THE BUILD"; live line `#stWhere` "Place the caret or select a passage to see where you are against Save the Cat!."; **two panes** `st-panes` (1.1fr / 1fr at >=900px, stacked below; single column 1100–1279 with the side menu): (A) **Synopsis pane**: H3 "Synopsis", toggle group "TAG" | "EDIT" (pressed state). EDIT: label "Write or paste the synopsis. Highlights follow their passage when you edit around them." + 18-row textarea. TAG: bar "Select text, then tag it as" + beat select + primary "TAG SELECTION" (disabled until a selection) over a read-only text area (tab-focusable) with `<mark>` highlights (solid for hand-tagged, dashed for "placed by position", glowing for the lit beat). (B) **Beat matrix**: H3 framework label (e.g. "Save the Cat!"), blurb, ordered beat cards: beat-name button (lights passages), mono "~15%", "Tension" label + number input 1–10, prompt, tagged passages as quote buttons (up to 160 chars), badges "placed by position" / "drafted by AI" / "from the outline", select "Untag (place by position)" / "Tag as…", "REMOVE", optional rationale line; empty beats dimmed. Below: open "From synopsis to treatment" blueprint ladder (rungs: synopsis, one-pager, treatment). Dialog: "Rebuild the synopsis from the outline? The synopsis on this page is replaced; highlights you made by hand are kept where their words still appear. You can undo this once." Toasts: "Synopsis built from the outline — every step tagged with its beat." (UNDO), "Tagged as Catalyst.", error "That overlaps a passage already tagged. Remove that highlight first, or select different words."
**Stitch prompt** Story › Synopsis: top build row with primary "BUILD MY SYNOPSIS FROM THE OUTLINE". Two side-by-side panes. Left pane "Synopsis" with segmented TAG/EDIT toggle; in TAG mode a tag bar ("Select text, then tag it as" [Catalyst ▾] primary TAG SELECTION) above flowing prose with violet highlighted passages. Right pane "Save the Cat!": 15 beat cards each with name, "~10%", small tension number input, prompt, quoted tagged passage with badge chips "from the outline" and a "Move" dropdown, REMOVE. Empty beats are dimmed.

### Story › Lock the outline (`#path-lock`)
H2 "Lock the outline", lead "When the step outline says what you mean, lock it. A lock is a promise to yourself that the outline is finished: it stops taking edits until you unlock it, and the path counts as done. Nothing else changes, and you can unlock at any time." Status line "**Not locked** · 12 steps written · 9 of 15 beats have a step" / "**Locked on 12 Oct 2026 at 04:10 pm** · …". Button primary "LOCK THE OUTLINE" (never disabled; empty: toast "Write a step or two in the step outline first, then lock it." and muted "Write a step or two in the step outline first.") / "UNLOCK THE OUTLINE". Toasts "Outline locked. The path is finalised; unlock any time to edit." / "Outline unlocked."

### Story › Open the Screenplay Writer (`#path-screenplay`)
H2 "Open the Screenplay Writer", lead "One placeholder scene per step, each linked to its beat, so the Screenplay Analysis's outline, the Breakdown and the Stripboard have the shape of the story before a page is written. Nothing already in the scene list is changed." Note "None of this is required before you write. A scene order, an outline and a lock are all optional: open the Screenplay Writer whenever you like and start on the first page." Status "**12 steps to send** · 0 already have a scene · 12 written". Buttons primary "SEND THE OUTLINE TO THE SCREENPLAY WRITER" (disabled when nothing to send), "UNDO THE SEND" (after a send), link button "OPEN THE SCREENPLAY WRITER" (→ screenplay.html). Toasts: "12 placeholder scenes added to the scene list; the pages in the Screenplay Writer start empty." (UNDO), "Every written step already has a scene.", "12 placeholder scenes removed. Nothing else in the scene list was touched." Empty: muted "Write a step or two in the step outline first."
**Stitch prompt (lock + screenplay)** Story › Lock / Screenplay: two plain step panels with lead paragraph, a bold status line, a primary pill ("LOCK THE OUTLINE" / "SEND THE OUTLINE TO THE SCREENPLAY WRITER") and ghost pills (UNLOCK, UNDO THE SEND, OPEN THE SCREENPLAY WRITER); lock icon variant with the "Locked on…" status.

### Story › Beats & pacing (`story.html#pacing`)
Section `#pacing` (Tools group). H2 "Beats & pacing". **Empty:** "The tension curve draws once there is a synopsis — build one from the outline, or write your own." **Heatmap / tension chart** (`story-kit.renderHeat`, figure `st-heat`):
- Type: SVG bar-and-line chart, viewBox 1000×140 stretched full width (preserveAspectRatio none), height ~140px.
- X axis: position through the story 0–100% in N equal slices (one bar per slice, 2px gap); below it an HTML **act strip** with the framework's own regions as labelled columns (e.g. "Act 1 | Act 2 | Act 3"; two halves for Interval; five acts for Freytag) and faint vertical act dividers.
- Y axis: tension 1–10 (unlabelled; bar height). 
- Marks: bars in one hue (violet) with opacity 0.25–1.0 by tension; estimated slices are visually distinct (`is-est`); hover title "42% — tension 6.5 (Midpoint), convention 6.0"; amber translucent full-height rectangles behind bars for slack stretches; a solid polyline "This story" through bar tops; a dashed polyline "convention" (the framework's expected curve). Interactive: clicking a bar jumps to that spot in the synopsis (Tag mode).
- Legend (figcaption): "This story" (solid line key), "Save the Cat! convention" (dashed key), "Slack stretch" (amber swatch), note "Tagged passages take their beat's tension; the rest is estimated from the words and is only a prompt to look."
- Table alternative: `<details>` "Show as a table" with columns Where | Tension | Convention | Source (rows "42% | 6.5 | 6.0 | Midpoint" or "estimated").
- Screen-reader label "Tension across the story in 20 slices, from 2 to 9 out of 10. 1 slack stretch flagged."
**Pacing notes** list `ul.st-flags` (aria "Pacing notes"); each note is a button that jumps to the span: levels warn/info. Texts: "Low tension from 35% to 48% of the story …", "Midpoint lands at 62% — conventionally around 50%.", "Not tagged by hand in Save the Cat!: Catalyst, Debate.", "2 highlighted passages are no longer in the synopsis. …". Ok lines: "The pacing notes need a longer synopsis — about 150 words or more. This one has 87." / "No pacing flags for this framework." / "Tag a few passages and the pacing notes appear here."
**Map the beats with AI** (`#ai-map`): H2 "Map the beats with AI", sub "The model quotes the passage it thinks performs each beat. A quote that is not word for word in your synopsis is dropped and counted, and a passage you already tagged in this framework is never moved." No synopsis: "No synopsis yet. Write, paste or import one first; the model reads only what is on this page." Else aiPill "Map Save the Cat! beats" (locked/no-key states as AI; results listed as quoted passages to tick, Accept tags them, Undo).
**Sample data** 15 Save the Cat! slices; bars 2,3,3,4,5,5,6,6,7,6,8,9,6,8,5 … slack stretch 35–48%.
**Mobile** chart spans full width at ~110px tall; act strip text shrinks; flags full width, 44px tap rows.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Story › Beats & pacing. A card with a full-width tension chart: ~20 violet vertical bars whose opacity grows with tension, a solid violet line along their tops, a dashed grey line for "Save the Cat! convention", one translucent amber band behind the bars marking a "slack stretch", thin vertical act dividers, and a row of act labels (Act 1 / Act 2 / Act 3) under it. Legend: "This story", "Save the Cat! convention", "Slack stretch" and a small italic note. "Show as a table" disclosure. Below: a list of pacing notes (amber warn dot "Low tension from 35% to 48% of the story…", blue info) as clickable rows, then a card "Map the beats with AI" with a sparkle pill "Map Save the Cat! beats".

### Story › Pitch deck (`story.html#pitch`)
Section `#pitch`. H2 "Pitch deck", sub "A landscape PDF compiled from this project: the logline, this synopsis, the tagged beats, the characters, key scenes and the numbers. A slide with nothing to say is left out." Status muted "In the deck: logline · synopsis · 7 beats · 4 characters · 6 key scenes · production numbers." (empty: "Nothing to pitch yet — add a synopsis or a logline first."). Primary button "EXPORT PITCH DECK (PDF)" (disabled when empty; toast error "Nothing to put in a deck yet."). Data: `pitch-deck.js` `collectPitch()` reads `fms_filmmaker_combined_v1` (s2_log_final/2/1 logline, s3_theme, s4_* protagonist, s5_* antagonist, s6_ally/lover/mentor, v1_genre, s7_era/s7_location), `fms_story_v1`, scenes, script; printed through `pdf.js`, selectable text, Tamil-safe; built into `#main` for the print job and removed after.
**Slide types (landscape, one per `section.pd-slide`; a slide with nothing is omitted)**
1. **Cover**: mono eyebrow = genre (or "A film"), huge title (project title, or "Untitled film"), logline paragraph, world line (era · location).
2. **Synopsis**: eyebrow "Synopsis", up to six paragraphs (each clipped to 900 chars), optional theme line.
3. **Structure**: eyebrow "Structure", title = framework label, numbered list `strong beat label + span passage (<=260 chars)` for tagged beats only.
4. **Characters**: eyebrow "Characters", grid of cards: mono role (Protagonist / Antagonist / Ally / Love interest / Mentor, or "7 scenes" from the cast matrix), name H3, line ("Wants: … Needs: …", <=220 chars).
5. **Key scenes**: eyebrow "Key scenes", ordered list up to 6 scenes spread across the film: number, bold slug "INT · Hostel room · Night", synopsis (<=200 chars).
6. **The production**: eyebrow "The production", row of big numbers with captions: "94 scenes", "1h 52m estimated running time", "28 shoot days", "14 locations".
Last slide carries the "Made with FilmMakerStudio" line (with member ref code) unless a paid plan switched it off.
**Sample deck** cover "Dragon" / Drama · Character study / logline "When a topper turns slacker…" / world "2018 · Chennai"; Structure slide with Opening Image, Catalyst, Midpoint; Characters: Raghavan (Protagonist) etc.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, pills, 16px, Catamaran). Story › Pitch deck section: card with H2 "Pitch deck", description, a muted "In the deck: logline · synopsis · 7 beats · 4 characters · 6 key scenes · production numbers." line and primary pill "EXPORT PITCH DECK (PDF)". Beside or below, show six landscape 16:9 slide thumbnails on #1b1727: Cover (mono genre eyebrow, huge title, logline, world line), Synopsis (paragraphs + theme line), Structure (numbered beat list), Characters (3-up cards with role, name, want/need), Key scenes (numbered list with slugs), The production (four big numerals: 94 scenes, 1h 52m, 28 shoot days, 14 locations). Disabled variant with "Nothing to pitch yet — add a synopsis or a logline first."

### Story › Cover sheet (`story.html#guide`)
Tools group. Rendered by `stage-guide.js` (stage `story`): eyebrow "Guide · Story", H2 "The cover sheet.", text "Every question the Feature Blueprint asks for the story is answered in the path above, once. What is left here is the film's cover sheet for "<Project>": its title, writer and draft." Fields (feature): Project title ("Untitled film"), Writer / Director ("Your name"), Started on ("DD / MM / YYYY"), Working title, Genre (select: … Sci-Fi, Fantasy, Family, Coming-of-Age, Biopic, Documentary, Anthology, Experimental, Other; placeholder "Pick a genre..."); short: Project title ("Untitled short"), Writer / Director, Started on, Target runtime ("e.g. 8 min"). Loading "Loading the questions…"; failure "The guide could not load. Reload the page to try again." Writes via blueprint merge-write.
**Stitch prompt** Story › Cover sheet: simple form card, eyebrow "GUIDE · STORY", H2 "The cover sheet.", grey deck, labelled fields (Project title, Writer / Director, Started on, Working title, Genre dropdown), footer BACK.

### Story — shared states, dialogs, mobile
- **States** no project: shell banner "CREATE OR OPEN A PROJECT →" (work goes to a holding slot adopted into the next project); loading blueprint hosts "Loading the questions…"; import errors toast (error type) with the reader's message; AI pills locked: "AI tools come with Pro" pill or "Add your AI key in Settings →".
- **Dialogs** "Clear the synopsis, every highlight and every tension score on this page? The idea, the logline, the step outline and the Idea Vault are kept." (START OVER, danger); sample replace; rebuild synopsis (above).
- **Mobile (390px)** start cards stack; step menu becomes a sticky horizontal strip of step pills with a "Steps" button opening a bottom sheet of grouped rows (ticks included); stepper footer buttons full-width stacked with count between; synopsis panes stack (matrix under the text); framework cards 1 column; heat chart full width; bottom bar Home · Go to · Search · Tools persists.
- **Overall Stitch prompt (Story stage)** Dark violet product UI (#120f1c ground, #1b1727 cards, #9575f8 accent, pill buttons, 16px radius, Catamaran, JetBrains Mono for eyebrows). Story page for a feature film: sticky shell band with breadcrumb "Studio › Story"; page header "Story." with mono eyebrow "STORY · BEATS & PACING"; a toolbar row (Import, Synopsis .txt, Outline .md, red Start over); left 220px grouped side menu — Idea (Idea, Logline), Build (Story Bible, Scene order, Step outline, Setups & payoffs, Timeline), Write up (Synopsis & treatment, Lock the outline, Open the Screenplay Writer), Tools (Beats & pacing, Pitch deck, Cover sheet) — with green tick circles on done steps and a violet highlight on "Step outline". The panel shows the step outline: coverage line, numbered beat cards with step textareas, UP/DOWN/REMOVE buttons, "Move to beat…" dropdowns, "ADD A STEP" and an AI sparkle pill, and a footer with "← BACK: SCENE ORDER · Step 4 of 13 · NEXT: SETUPS & PAYOFFS →".


---

# PART E — Screenplay writer, Drafts and Breakdown

## Part 04 — Screenplay Writer, Drafts, Breakdown (and the two "retired" pages)

Source: worktree `admin-fixes`. Strings are quoted from code. Global look: ink ground `#120f1c`, cards `#1b1727`, accent `#9575f8`, pill buttons, 16px radius (`--sk-radius`). Eyebrows/labels are uppercase mono (`--f-mono`, JetBrains Mono); display headings use Catamaran. Every page below also carries the shared shell (nav band, stage tabs, crumb, project switcher), the red **NO PROJECT OPEN** banner when no film is open, and the phone bottom bar (Home · Go to · Search · Tools). Those are another part's job; they are only mentioned where they change a screen.

Common facts used below:
- Script storage: `fms_script_v1` (per project). One script = list of elements `{id, type, text}`; types `scene | action | character | paren | dialogue | transition | shot`. Also holds `revisions` (drafts), `titlePage`, `numbering`.
- Scenes: `fms_scenes_v1`. Songs: `fms_songs_v1`. Scene bin: `fms_scene_bin_v1`. Characters: `fms_characters_v1`. Writing goals: `fms_write_goals_v1`. Editor prefs (keyboard preset, hints on/off, focus options): `fms_write_prefs_v1` (device).
- Revision colours (derived, in order): White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, then Double White, Double Blue…
- Breakdown element categories and hues: Cast (rose `#fb7185`), Background (blue `#60a5fa`), Props (sky `#38bdf8`), Set Dressing (slate `#94a3b8`), Wardrobe (magenta `#e879f9`), Hair & Makeup (teal `#2dd4bf`), Vehicles (yellow `#facc15`), Stunts (orange `#fb923c`), SFX (cyan `#22d3ee`), VFX (indigo `#818cf8`), Sound (green `#4ade80`), Animals (tan `#d6a77a`), Special Equipment (pink `#f472b6`).
- Sample project "Dragon feature" (reconstruction, 36 scenes, 105 pages, Tanglish dialogue, English slugs/action). Scene 1: `INT. SCHOOL ASSEMBLY HALL, ASHOK NAGAR - DAY (2014)`, cast YOUNG RAGAVAN, 18 eighths (2 1/4 pages), shoot day 17. Scene 2: `EXT. Ragavan's house, Villivakkam`, 14 eighths, day 16. Scene 3: Engineering college front block, 20 eighths, day 1. Scene 4: College corridor — arrears board, 16 eighths, day 3. Dialogue sample: `YOUNG RAGAVAN` / `(to the hall)` / `Physics-la naalu mark poachu. Question nine.` / `CUT TO:`.

---

### Screenplay Writer — editor surface (`screenplay.html`)

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

### Screenplay Writer — Beats panel (`screenplay.html`, toggled by "Beats ◧")

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

### Screenplay Writer — Import Screenplay (`screenplay.html`, `#import`)

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

### Screenplay Writer — Focus mode (`screenplay.html`, button "Focus")

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

### Screenplay tools — AI coverage and Write from a synopsis (`write.html?stay=1`)

`write.html` is **retired**: opened without `?stay=1` it redirects by fragment (`#screenplay`→`screenplay.html`, `#import`→`screenplay.html#import`, `#revisions`→`drafts.html`, `#documents`→`drafts.html#title`, `#outline` and `#characters`→`breakdown.html#script`, `#guide`→`screenplay.html#guide`, anything else→`screenplay.html`). Only two sections survive behind `?stay=1`, titled in the crumb "Screenplay tools": `#coverage` (tab label **AI coverage**) and `#generate` (tab label **Write from a synopsis**). A ghost button `← Back to the Screenplay Writer` sits above the tabs. Linked from Screenplay Analysis ("AI coverage report") and the editor's ⋯ menu. Data: the script, AI key in `fms_ai_key_v1` (no backup), AI plan feature; results are saved inside the script as documents.

#### Tab: AI coverage (`write.html?stay=1#coverage`)
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

#### Tab: Write from a synopsis (`write.html?stay=1#generate`)
**Purpose** Three stages: synopsis → beat sheet (cheap) → scene board → pages, each read before the next runs; output lands under a revision.
**Elements (stage 1 "synopsis")**: heading `From a synopsis`; deck "A synopsis becomes a beat sheet, the beat sheet becomes a scene board, and the scene board becomes pages. You read each one before the next one runs. Everything it writes is a draft by a machine, and it lands under a revision so your own pages are never what gets overwritten."; textarea `Synopsis` (7 rows, max 6000, placeholder "A paragraph or three. Who it is about, what they want, what is in the way, and how it ends if you know. The more you give it, the less it invents."); upload of a synopsis file; select `Length` (`Feature — about 100 pages`, `Short — about 15 pages`); select `Language` (`Tamil dialogue · English slugs and action`, `Tanglish throughout`, `Tamil throughout`, `English`) with hint line and, for Tamil throughout, a warning that page count becomes an estimate; AI pill `Draft the beat sheet`; cost line "One request. This is the cheap stage — argue with the structure here, not after a hundred pages exist."; disclosure box `What gets sent, and where` ("What is sent: the synopsis you wrote, the beats as they stand, and for each batch of scenes its own slug lines plus the two scenes either side for continuity. Not your other projects, not your notes, not the rest of the screenplay. Nothing is sent until you press a button, and the key never leaves this device except as the one header that authorises the request.").
**Stage 2 "beats"**: logline, deck "Fifteen beats, the Save the Cat spine the blueprint already teaches.", 15 editable beat rows (name + textarea `<beat> — what happens`), checkbox "Replace the N scenes …", AI pill `Lay out the scenes`, cost line "One request. This one writes the SCENE BOARD — so the breakdown…".
**Stage 3 "pages"**: progress `All N scenes are written. They are in the screenplay above…` with `Start a new one`; run controls `Write all N scenes` / `Resume and write the rest`, AI pill `Next 5 scenes, in the Desk`, `Stop` (danger while busy), `Start over`, text `About N requests`.
**States** Status/error lines under the stage; page figure estimate note when Tamil in action.
**Stitch prompt** Dark violet wizard page (#120f1c, #1b1727 cards, #9575f8 accent, 16px radius) titled "From a synopsis" with a three-step stepper (Synopsis, Beats, Pages). Stage one: big textarea "Synopsis" with placeholder text, an "Upload a file" link, two dropdowns "Length — Feature, about 100 pages" and "Language — Tamil dialogue · English slugs and action", a violet AI pill "Draft the beat sheet", muted cost note, and a bordered disclosure card "What gets sent, and where". Include stage two as a list of 15 beat cards with editable text and a "Lay out the scenes" pill.

---

### Drafts — list (`drafts.html`)

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

### Drafts — Compare (`drafts.html`, `#dr-compare`)

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

### Drafts — Title Page (`drafts.html#title`)

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

### Breakdown — page shell (`breakdown.html`)

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

### Breakdown — Screenplay Analysis (`breakdown.html#script`)

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

### Breakdown — Whole script, the one-click breakdown (`breakdown.html#overview`)

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

### Breakdown — Scene Breakdown / Scene List (`breakdown.html#scenes` and `#breakdown`)

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

### Breakdown — Auto-Tag (`breakdown.html#suggest`)

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

### Breakdown — Songs (`breakdown.html#songs`)

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

### Breakdown — Elements (`breakdown.html#elements`)

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

### Pre-Production path (`preprod.html`) — NOT retired

`preprod.html` is a **live** page ("Pre-Production", stage page `Path`; crumb `Pre-Production › Path`), the step-by-step path from script to first shoot day. It stores and writes nothing: every step's state is derived from the film (`src/lib/preprod-path.js` over `src/data/preprod-path.json`, plus `readiness.js`). Included here because Breakdown tabs belong to its steps and the same strip appears above Breakdown (`mountPathBar`).
Layout: eyebrow `Studio · Pre-Production`, title `Pre-Production.`, deck `From the script to the first day of shooting, one step at a time. Each step says what it is for and what is still missing, then opens the tool where it is done.` A progress summary `4 of 12 steps done · next: Break it down` with a thin meter. At >=1100px a left side menu of steps in four groups beside the open step panel; below that, a horizontally scrolling strip. Steps (group · label · tool button): Script · Lock the screenplay · `OPEN THE SCREENPLAY WRITER →`; Script · Scene list · `OPEN THE SCENE LIST →`; Script · Break it down · `OPEN SCENE BREAKDOWN →`; Look · Vision & look; Look · Shots & storyboard; People & places · Cast & Crew; People & places · Locations & recce; People & places · Songs (only if the film has songs); Plan · Budget; Plan · Schedule; Plan · Sides & call sheets; Check · Ready to shoot. Each panel: `Step N`, heading, state chip (`Done` / `In progress` / `Not started`), about sentence, facts line, `Still to do` list, a tool button (primary unless done), and Back/Next footer. "Ready to shoot" lists readiness checks (✓ passes, ✕ blocker, ! gap, each with `Fix →`), a `DOWNLOAD ONE-PAGE PDF` button ("Checks, shoot days, budget and open permissions, on one A4 page.") and buttons `MAKE THE CALL SHEET →`, `OPEN THE SHOOT DAY →`. No project: `No film is open. Open or create one from Home, and its path appears here.` Zero checks: `Add scenes first; there is nothing to check yet.` A one-page PDF failure toast: `The page could not be prepared.`
**Stitch prompt** Dark violet stepper page (#120f1c, #1b1727, #9575f8, 16px radius): eyebrow "STUDIO · PRE-PRODUCTION", title "Pre-Production.", summary "4 of 12 steps done · next: Break it down" with a violet meter. Left side menu of grouped steps (Script, Look, People & places, Plan, Check) with done ticks and the current step highlighted; right, the open step card: "Step 3 · Break it down · In progress", about line, "Still to do" bullets, primary pill "OPEN SCENE BREAKDOWN →", Back/Next footer.


---

# PART F — Reports, Visualize, Plan and Stripboard

## Part 05 — Reports, Visualize, Plan, Stripboard

Source: worktree `admin-fixes`. Pages: `reports.html`, `visualize.html`, `plan.html`, `stripboard.html` (each is a bare `<div id="app">` + one module script; everything is rendered by JS).

### Shared frame (applies to all four pages; described once)

- **Chrome (top to bottom):** the sticky shell band (breadcrumb + project switcher + tools), then `<main id="main">`. All four are *module pages with a project*; with no project the shell shows "No project — start one" in the project switcher.
- **Page header (`header.bd-head`)**: eyebrow (small caps mono, violet-deep), H1 `bd-title`, deck paragraph, then a stat strip (`div.bd-stats`: bordered cards, big number over small label).
- **Tabs:** `src/ui/tabs.js` turns every top-level `section[id]` of the page into a tab, in a strip pinned under the shell. Exactly one section is visible; hash picks the tab (`reports.html#sides`). Tab label = `data-tab-label`, else the navigation.json module label for that fragment, else the section heading. At 390px the strip scrolls sideways inside itself.
- **Pre-production path bar** (`mountPathBar`, only with a project): a numbered strip (first item "◷ Path", then one tab per step with ✓ if done, current lit) under the header, plus a footer row `← BACK: <STEP>` · `Step N of M` · `NEXT: <STEP> →` (primary pill).
- **Export menu** (`actionMenu`): a pill button `Export` + caret `▾`, opens a `role=menu` panel; items listed per screen. Any PDF export is gated by the plan capability "PDF exports": if the plan lacks it, nothing prints and a toast says "PDF exports is not part of the <plan name> plan. It comes with <offer> — one payment." with action `SEE <OFFER>` (or `SEE PLANS`).
- **Empty-state card (`div.bd-empty`)**: big glyph in `bd-empty-mark`, H2, paragraph, three numbered how-steps (`bd-how-step`: number badge, bold title, one line), a "why" example strip (`bd-example`, bold label then sentence), and a primary pill CTA.
- **Hue legend used in all four:** violet `#9575f8` (feature/accent), amber `#d6a44a` (library / DAY), blue `#60a5fa` (shorts / NIGHT), magenta `#e879f9` (visualize / CONTINUOUS), teal `#2dd4bf` (plan), pink `#f472b6` (shoot / DUSK). Semantic: ok `#34d399`, warn `#d6a44a`, danger `#f87171`. Washes are dark tints (e.g. `#241a3d`, `#2e2415`, `#16233c`).

---

## 1. REPORTS — `reports.html`

Title: "Production Reports · FilmMakerStudio". Header (all tabs): eyebrow `Production Reports · from your scenes`, H1 `Production Reports.`, deck "Every number on this page is counted from the scene breakdown the moment you open it. Change a scene there and the reports change here — there is nothing to regenerate, and nothing to keep in step." Stats: `<n> scenes`, `<pages> pages`, `<pages> night pages`, `<n> locations`, `<n> elements`. (Pages are shown in eighths notation, e.g. `1 3/8`.)

Tabs (7): **Production Reports** (#reports) · **Sides** (#sides) · **Screen Time** (#screentime) · **Cast Matrix** (#cast-matrix) · **One-liner** (#oneliner) · **DPR** (#dpr) · **Equipment** (#kit).

Common: Data source is derived each render from `fms_scenes_v1` (Scenes.listScenes, elementIndex), `script` blob (loadScript), `fms_locations_v1` (shoot days, DPR records, kit, banners, schedule prefs), the songs blob (songs + target minutes), story blob (framework). No RPCs. Nothing about reports is stored except what the DPR/Kit/target fields write.

### Production Reports (`reports.html#reports`)
**Purpose** Totals a 1st AD / line producer asks for first. **Who/when** Anyone with scenes; after breakdown. **Data source** `fms_scenes_v1`.

**Layout** Eyebrow `Production reports`, H2 `What the schedule is made of.`, sub "Totals, the interior/exterior and day/night splits, every location and every tagged element — the five things a 1st AD and a line producer ask for before anything else." Then Export row, two side-by-side cards (`.rp-cards`, auto-fit min 300px → 2 columns at 1280, 1 at 390), H3 `By location` + table, H3 `Elements` + category grid + table. Nothing sticky except the shell/tab strip.

**Elements**
| Region | Element | Type | Label | Behaviour | States |
|---|---|---|---|---|---|
| Tools row | Export menu | menu button | `Export` ▾ | opens menu | items: `Print the reports`, `Save as PDF` (hint `A4`) |
| Cards | Interior / Exterior card | card | eyebrow `Interior / Exterior`, note "Exteriors are the weather risk and the permit; the split is the first thing a line producer reads." | none | rows INT, EXT, INT/EXT (only rows with count>0) |
| Cards | Day / Night card | card | `Day / Night`, note "Night pages cost more than day pages. Counted separately because they are budgeted separately." | none | rows DAY, NIGHT, DAWN, DUSK, CONTINUOUS |
| Location section | table | table | caption "Scenes and page count per location — the order a schedule gets built in." | none | footer row totals |
| Elements | category tiles | tiles | per category: label, count of distinct names, "distinct · N appearances" (or "name · …" when 1) | none | |
| Elements | element table | table | caption "Every tagged element and the scenes it appears in. Tagged once on the breakdown, counted here." | none | |

**Cards/rows** Distribution row = `[key label 5.5rem] [meter bar, fill width = % of scenes, min 2%] [“3 scenes · 2 1/8 pp”]`, each row hue-coded: INT=blue, EXT=teal, INT/EXT=magenta; DAY=amber, NIGHT=magenta, DAWN=teal, DUSK=pink, CONTINUOUS=blue. Example: `EXT   ▓▓▓▓▓░░░  4 scenes · 3 5/8 pp`.

**Tables** Location table columns: `Location | Scenes | Pages | Int / Ext | Day / Night | Scene numbers`. Example row: `Perambur Chawl | 3 | 2 4/8 | INT 2 · EXT 1 | DAY 2 · NIGHT 1 | 4, 7, 12`. Unassigned scenes group as `Unassigned`. Footer: `5 locations | 14 | 11 2/8 | | |`. Element table columns: `Element | Category | Scenes | Appears in`; category cell is a coloured chip (hue per category). Example: `Royal Enfield Bullet | Vehicles | 3 | 4, 9, 15`.

**Element categories (label → hue):** Cast (red `#fb7185`), Background (blue), Props (sky `#38bdf8`), Set Dressing, Wardrobe (magenta), Hair & Makeup (teal), Vehicles (yellow `#facc15`), Stunts (orange `#fb923c`), SFX (cyan `#22d3ee`), VFX (indigo `#818cf8`), Sound (green `#4ade80`), Animals (tan `#d6a77a`), Special Equipment (pink).

**Charts** Horizontal stacked-label bars (meters) only: x = share of scenes, no axes, legend is the row key; print renders monochrome (outlined trough, solid ink fill).

**States** No scenes: `#reports` holds the empty card — glyph ▤, H2 `Production Reports need scenes`, "A report is arithmetic on the breakdown — it cannot invent what has not been typed. Add the scenes once and every number on this page, and every page of sides, builds itself from them." Steps: `1 Break the script down` ("One line per scene on the breakdown page: INT or EXT, day or night, where, and how long in eighths."), `2 Tag what each scene needs` ("Cast, props, wardrobe, vehicles. The element counts below are that tagging, counted."), `3 Print what the day needs` ("Tick the scenes being shot and the sides come out with slug, length, synopsis and elements."). Example label `Why it matters`: "A line producer asks three questions — how many pages, how many night pages, and how many days at each location. All three are on this page the moment the breakdown exists, and none of them are worth answering twice by hand." CTA `Go to the breakdown  →`. No elements tagged: "Nothing tagged yet. Tag cast, props or wardrobe on any scene in the breakdown and the counts and the index appear here."

**Dialogs** none. **Print layout** `Print the reports` adds body class `rp-print-reports`: hides sides and the day views, tools hidden, cards become stacked bordered blocks (no shadows, ink on paper, `break-inside: avoid`), tables captions get a light wash. `Save as PDF` = A4, page margin 18mm 14mm, masthead at top: project name (left) + `Production reports` (right), rule line, meta line `<n> scenes · <pages> pages  ·  <date>`.

**Sample data** 14 scenes, 11 2/8 pages, 3 night pages; INT 8 scenes/6 pp, EXT 5/4 pp, INT/EXT 1; locations Perambur Chawl, Marina Beach, Kasimedu Harbour, Mylapore Temple Street, Police Station Set.
**Mobile** cards stack; dist row grid 4.5rem + bar; tables scroll inside their own box.
**Stitch prompt** Dark violet product UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, 16px radius, pill buttons). Screen "Production Reports": sticky top band with breadcrumb and project switcher; tab strip with Production Reports (active), Sides, Screen Time, Cast Matrix, One-liner, DPR, Equipment; pre-production path bar. Header: mono eyebrow, big title "Production Reports.", deck, five stat cards (scenes, pages, night pages, locations, elements). Section: Export dropdown pill; two cards "Interior / Exterior" and "Day / Night" each with hue-coded horizontal meter rows "EXT ▓▓▓ 4 scenes · 3 5/8 pp"; "By location" table (Location, Scenes, Pages, Int/Ext, Day/Night, Scene numbers) with totals footer; "Elements" 13-category tile grid in category colours plus element index table with coloured category chips. Mobile: single column, tables scroll inside.

### Sides (`reports.html#sides`)
**Purpose** Printable one-block-per-scene pages for the day ("what a 1st AD photocopies at 6am"). **Data** `fms_scenes_v1`; the tick selection is memory only (first visit = all ticked).

**Layout** Eyebrow `Sides`, H2 `Pages for the day.`, sub "Tick the scenes being shot. Each one prints with its slug line, its length, what happens and everything tagged to it — one block per scene, never split across a page." Tools row (left→right): `Select all` · `Clear` · count `N of M selected` · spacer · `Export` ▾ (right-aligned; `Print the sides`, `Save as PDF` hint `A4`). Then the picker list (checkbox rows), then the sides output.

**Elements** Picker row (`label.rp-pick`): checkbox (aria "Include scene N in the sides") · scene number (mono) · slug `INT · Perambur Chawl · NIGHT` · pages (`1 3/8`). Output: head `Sides` + `3 scenes · 2 5/8 pages`; each scene block `article.rp-side`: bar = number chip · slug · `1 3/8 pp`; synopsis (or italic "No synopsis written for this scene yet."); element rows (`Cast` label 9rem | names comma list) coloured by category hue; only categories with names.
**States** Nothing ticked: "No scenes ticked. Tick the scenes being shot and they appear here, in script order, ready to print." No scenes: eyebrow/H2 plus "Nothing to print yet. Once the breakdown has scenes you tick the ones being shot and each prints with its slug line, its length, what happens and everything tagged to it."
**Print** only `#sides` prints; each block bordered with a 3px ink left rule, number chip outlined, monochrome. Starts own page when whole page printed. Masthead label `Sides`, meta `3 scenes · 2 5/8 pages · date`.
**Sample** `3 | INT · Perambur Chawl · NIGHT | 1 3/8 pp` — "Murugan returns to find the lock cut." Cast: Murugan, Kavitha; Props: Hurricane lamp, torn ration card.
**Mobile** element rows go single column.
**Stitch prompt** Dark violet UI (#120f1c, cards #1b1727, accent #9575f8, Catamaran, 16px radius, pills). "Sides" tab: H2 "Pages for the day."; toolbar with ghost pills "Select all", "Clear", counter "3 of 14 selected", right-aligned Export dropdown. Below, a compact checklist of scenes (checkbox, mono scene number, slug "INT · Perambur Chawl · NIGHT", pages). Below that a print-preview stack titled "Sides · 3 scenes · 2 5/8 pages": each scene is a card with a left rule, header bar (number chip, slug, "1 3/8 pp"), synopsis paragraph, and category rows (Cast, Props, Vehicles) with label column and comma-separated names in category colours. Mobile single column.

### Screen Time (`reports.html#screentime`)
**Purpose** Estimated running time per scene and overall, with songs against a target. **Data** scenes + script elements (`Analysis.screenTime`), songs blob (durations `m:ss`, target minutes inside it), story framework (acts/beats). Writes only: target minutes and each song's length.

**Layout** Eyebrow `Screen time`, H2 `How long it will play.`, sub "An estimate per scene from the script: dialogue at speaking pace, action by the rhythm of its sentences, two seconds to establish each heading. The page-a-minute figure is beside it; a scene with no script text uses that alone." Order: stat strip (3 cards) → runtime box → match note → per-scene table.

**Elements**
| Region | Element | Type | Label | Behaviour | States |
|---|---|---|---|---|---|
| Stats | cards | stat | `estimated running time` · `by page count` · `N / M` `scenes read from the script` | – | |
| Runtime box | H3 | – | `With the songs, against your target` | | |
| Runtime box | Target input | number (1–600) | label `Target running time, in minutes`, placeholder `e.g. 140` | change saves, box rebuilds, focus kept | |
| Runtime box | stat cards | | `estimated, songs included` · `target` / `no target set` · delta e.g. `+0:12:30` with `over the target` / `under the target` / `difference` (`on target`) | | |
| Runtime box | note | text | "No songs on the list, so this is the page estimate alone." or "N songs have a length, adding …"; "N songs have no length yet and add nothing — give each one below."; "N scenes linked to timed songs use the song's length instead of the page estimate, so nothing is counted twice." | | |
| Songs table | length inputs | text `4:30` | col `Length` | change saves | |
| Per-scene table | table | | caption "Estimated screen time per scene, against the page-a-minute rule." | | |

**Tables** Songs: caption "Each song's length, as m:ss (4:30). The recording decides it, not the page." cols `No. | Song | Kind | Length | Linked scenes`; row `3 | Kaadhal Vaasam | (kind label) | [4:30] | 12, 13`; untitled → `Untitled song`. Acts: caption "Per act, against the target split by each act's conventional share of the story framework." (or "Per act. Set a target above to see each act against its share of it.") cols `Act | Scenes | Songs | Estimate | Target | Difference`, extra row `Not linked to a beat`. Beats: caption "Per beat, in story order. A beat has no target of its own; the act does." cols `Beat | Scenes | Songs | Estimate | Share of the film` (e.g. `45%`). Scene table cols `Scene | Slug line | Estimate | By pages | Dialogue words | Read from`; row `7 | INT. PERAMBUR CHAWL - NIGHT | 2:10 | 1:45 | 148 | script`; read-from values `page count`, `script, by position`, `script`.
**States** No scenes: "No scenes yet. Import or write a script and the estimate appears here, scene by scene." No beats: "No scene is linked to a story beat yet, so there is no per-act split. Link scenes to beats on the Write page's Outline and each act appears here against its share of the target." Match notes (unpaired headings) shown in a note line.
**Print** none specific; PDF "reports" scope does not include it.
**Mobile** all tables scroll horizontally inside `.rp-scroll`.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727 cards, #9575f8, Catamaran, 16px, pills). "Screen Time" tab: H2 "How long it will play." Three stat cards (est. running time 2:18:40, by page count 2:24:00, 12 / 14 scenes read from script). Card "With the songs, against your target": number field "Target running time, in minutes", stat trio (estimated incl. songs, target, +0:12:30 over the target), explanatory note, songs table with inline m:ss inputs, per-act table (Act, Scenes, Songs, Estimate, Target, Difference), per-beat table with share %. Then per-scene table (Scene, Slug line, Estimate, By pages, Dialogue words, Read from). Tables right-align numerics, mono for scene numbers; scroll horizontally on mobile.

### Cast Matrix (`reports.html#cast-matrix`)
**Purpose** Characters × scenes grid; names the scheduling constraints. **Data** breakdown cast tags ∪ script character cues (`Analysis.castMatrix`).
**Layout** Eyebrow `Cast matrix`, H2 `Who is in what, and with whom.`, sub "Every character against every scene, from the breakdown's cast tags and the script's cues. The pairs who share the most scenes and the scenes that call the most of the cast are the scheduling constraints." Optional note "Cues are read only from scenes matched to a heading. …". Matrix table (scrolls), then two columns (auto-fit 18rem): `Most scenes together` and `Dense scenes (N+ cast)`.
**Table** caption "`6 characters across 14 scenes`. ● in the scene; the last row counts the cast each scene calls." Header: `Character | Scenes | <scene number per column>`; dense columns carry a wash AND heavier rule. Cells: `●` when present (aria "<name> in scene N"), blank otherwise. Footer row `Cast called` with counts per scene. Row example: `Murugan | 11 | ● ● ● ● ● …`.
**Lists** `Murugan & Kavitha — 8 scenes` (top 8 pairs, ordered list); `Scene 12 — INT · Marina Beach · DAY: 6 cast`.
**States** "No cast yet. Tag cast on the breakdown or write character cues in the script, and the grid fills in." / "No two characters share a scene yet." / "No scene calls more than a handful of the cast."
**Mobile** matrix scrolls inside its box; notes stack.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8 accent, Catamaran, 16px). "Cast Matrix" tab, H2 "Who is in what, and with whom." A wide dot-matrix table: sticky-left character names, a Scenes count column, then one narrow column per scene number; filled violet dots mark presence; dense scene columns have a lighter violet wash and thicker rule; footer row "Cast called" with counts. Below, two cards side by side: "Most scenes together" numbered list of pairs ("Murugan & Kavitha — 8 scenes") and "Dense scenes (5+ cast)" list. Horizontal scroll inside the table on mobile.

### One-liner (`reports.html#oneliner`)
**Purpose** The whole shoot, one line per scene, by shoot day. **Data** scenes + `fms_locations_v1` (day order, dates, banners, page target). **Layout** eyebrow `One-liner`, H2 `The whole shoot, one line a scene.`, sub "Day by day in shooting order: scene, interior or exterior, day or night, where, how long in eighths and the cast by number — with the board's banners in place and a page total under every day." Export (`Print the one-liner`, `Save as PDF` A4), table, cast key.
**Table** caption `5 shoot days · 11 2/8 pages · cast by number, key below`; cols `Day | Date | Sc | I/E | D/N | Set | Pages | Cast`. Each day = a `tbody`: head band `Day 2 · Monday, 2 November 2026`; scene lines (`D2 | Mon 2 Nov | 7 | INT | NIGHT | Perambur Chawl | 1 3/8 | 1, 2, 4`); banner rows (e.g. `Company move: Perambur → Marina — 40 min, one truck`); total row `End of Day 2` + page sum, with ` · over the 4 7/8-page target` and an over style when exceeded. Final group `Not scheduled yet`. Key: `Cast: 1 Murugan · 2 Kavitha · 3 Inspector Raghav` and note "Numbered by scene count, most first, from the breakdown's cast tags — they renumber if the tagging changes."
**States** no scenes: "No scenes yet. The one-liner is the schedule printed small; it needs scenes on days." No days: "No scene is on a shoot day yet. Until then every scene is listed below as unscheduled. Schedule them on the stripboard →". Missing location: `Location not set` (table prints "Location not set").
**Print** class `rp-print-oneliner`; only `#oneliner` prints; masthead label `One-liner`, meta `5 shoot days · 11 2/8 pages`.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran). "One-liner" tab: Export dropdown; dense table with columns Day, Date, Sc, I/E, D/N, Set, Pages, Cast. Group per shoot day: dark band "Day 2 · Monday, 2 November 2026", mono scene lines, italic banner rows for company moves, total row "End of Day 2 … 4 7/8" turning amber when over target. Last group "Not scheduled yet". Footer cast key "1 Murugan · 2 Kavitha …". Mobile: scroll horizontally.

### DPR — daily production report (`reports.html#dpr`)
**Purpose** What the day did; typed times/delays/incidents + derived planned vs shot. **Data** `fms_locations_v1` (DPR records per day, via `dpr.js`), scene `shotState` (written on shoot.html only), call sheets (Contacts). **Layout** eyebrow `Daily production report`, H2 `What the day did.`, sub "Times, setups, delays, incidents and weather are typed here. What was planned and what was shot are not: they come from the schedule and from the marks made on the shoot day, so the report cannot disagree with the floor." Tools row: `Shoot day` select (`Day 2 · Mon 2 Nov`) · link-button `Mark scenes on the shoot day` · spacer · Export (`Print the DPR`, `Save as PDF`). Sheet: H3 `Day 2 of 5 · Monday, 2 November 2026 · Perambur Chawl, Marina Beach`; 6-stat grid (6 across ≥1100px, 3 ≥600, 2 below): `2 / 3 scenes shot`, `3 2/8 / 4 1/8 pages shot`, `part shot`, `dropped`, `setups`, `lost to delays`. Sections: H4 `Times` (six `type=time` fields: Crew call, First shot, Lunch in, Lunch out, Camera wrap, Wrap) + calc line ("Call to wrap 11h 30m · lunch 45m · worked 10h 45m · call to first shot 1h 15m." or "Type the call and wrap times and the day's length works itself out."); H4 `Scenes planned and shot` table (`Scene | Slug line | Pages | On the day`, status pill `Shot` (ok) / `Part` (warn) / `Dropped` / `Not marked`) + optional note "Also marked on this date, from other days: scene 9 (Day 3)."; fields `Setups` (number) and `Weather` (placeholder `Clear, 34°, rain after 4pm`); H4 `Delays` rows (select reason: Weather, Light, Location / permission, Cast late, Crew late, Equipment, Technical, Make-up / costume, Meal, Other · minutes `min` · note `What happened` · `Remove`), empty "No delays logged.", button `+ Add a delay`; H4 `Injuries and incidents` rows (`What happened, to whom` · `Action taken` · `Remove`), empty "None reported.", `+ Add an incident`; H4 `Notes` textarea (placeholder "Anything the producer should read tonight"). Below: **Offline on set** block (H3 `Offline on set`, copy "Locations rarely have signal. This keeps the shoot day, the call sheets and the reports in this browser so they open with no network. The scenes and reports are already stored on this device; it is the pages themselves that need keeping.", primary button `Make today available offline` → `Keeping the pages…`, status list lines like `Shoot day — ready offline (4 files, both addresses)` / `Call sheets — not kept yet` / `Reports, sides and DPR — …`; unsupported: "No service worker is running on this page, so nothing can be kept offline here. Open the live site (or the installed app) once and try again."; success note "Done. Turn on airplane mode and open the shoot day to check."). Toasts: `Today is available offline.` / `Some pages could not be kept offline.`
**States** no days: "No scene is on a shoot day yet. The report is written against a day. Schedule them on the stripboard →" (offline block still shown).
**Print** class `rp-print-dpr`; offline block and buttons hidden; masthead meta `Day 2 · Monday, 2 November 2026`.
**Mobile** delay row → reason+minutes on one line, note full width; incident row single column.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills). "DPR" tab: toolbar with Shoot day select, "Mark scenes on the shoot day" button, Export dropdown. Card "Day 2 of 5 · Monday, 2 November 2026": six stat tiles (scenes shot, pages shot, part shot, dropped, setups, lost to delays); Times grid of six time fields with a computed summary line; table of planned scenes with status pills (Shot green, Part amber, Dropped grey, Not marked); Setups and Weather inputs; Delays rows (reason select, minutes, note, Remove) with "+ Add a delay"; Incidents rows; Notes textarea. Bottom card "Offline on set" with primary pill "Make today available offline" and status list with green/grey ticks. Mobile single column.

### Equipment (`reports.html#kit`)
**Purpose** Per-department kit list per shoot day. **Data** `fms_locations_v1` (kit per day), budget calc lines (`fms_library_calc_v1`, kit lines classified by item). **Layout** eyebrow `Equipment`, H2 `What goes on the truck.`, sub "A list per department for each shoot day — item, quantity, vendor, and a tick when it is picked up and when it goes back. Start it from the budget estimator's kit lines, or from the day before." Tools: `Shoot day` select · `Fill from the budget (N)` button (or link `No kit lines in the budget yet`) · `Copy from Day N` (if an earlier day has items) · spacer · Export (`Print the kit list`, `Save as PDF`). Title `Day 2 · Monday, 2 November 2026 · 9 items · 4 picked up · 0 returned`. Grid (auto-fill min 9rem... cards in 34rem auto-fit → 2 columns at 1280, 1 at 390) of six department cards: Camera, Lighting, Grip, Sound, Art, Costume; heading `Camera · 3`; table `Item | Qty | Vendor | Out | Back | (Remove ×)` with inline text inputs, two checkboxes, `×` button; empty "Nothing listed."; foot input `Add to camera…` + `Add` (Enter adds). Toasts: `Added N lines from the budget.` / `Every budget kit line is already on this day.` / `Copied N items from Day 1, ticks cleared.` / `Everything on Day 1 is already here.` Empty days: "No scene is on a shoot day yet. Kit is listed against a day."
**Sample** Camera: `ARRI Alexa Mini LF kit | 1 | Cine Rentals Chennai | ☑ | ☐`. **Print** class `rp-print-kit`.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills). "Equipment" tab: toolbar (Shoot day select, "Fill from the budget (6)", "Copy from Day 1", Export). Title line "Day 2 · Monday, 2 November 2026 · 9 items · 4 picked up · 0 returned". Responsive grid of six department cards (Camera, Lighting, Grip, Sound, Art, Costume) each with an editable table (Item, Qty, Vendor, Out and Back checkboxes, × remove) and an "Add to camera…" input with Add pill. Mobile: one column.

---

## 2. VISUALIZE — `visualize.html`

Title area: eyebrow `Visualise · the film seen before it is shot`, H1 `Shots & Frames.`, deck "A shot list is the scene broken into the pieces the camera actually records. The storyboard draws those pieces and the lookbook says what they should feel like — all three hang off the scenes you have already broken down, so nothing is described twice." Stats: `<n> shots`, `<covered> / <scenes> scenes covered`, `<n> frames`, `<n> references`.

Tabs (6 sections, in order): **Shot List** (#shot-list) · **Draft a shot division** (#draft) · **Storyboard** (#storyboard) · **Blocking** (#blocking) · **Scene board** (#scene-board) · **Lookbook** (#lookbook). Data: single key `fms_shots_v1` holding four collections (shots, frames, boards, blocking) + `fms_scenes_v1` (read only) + script blob. Common vocab: Size options `EWS · extreme wide, WS · wide, LS · long, MLS · medium long, MS · medium, MCU · medium close, CU · close-up, ECU · extreme close`; Angle `eye level, high, low, overhead, dutch`; Movement `static, pan, tilt, dolly, track, handheld, crane, drone`; Lens suggestions (datalist) `14mm … 200mm, zoom`. Slug format `INT. Perambur Chawl — NIGHT` (`Location TBC` when empty).

### Shot List (`visualize.html#shot-list`)
**Purpose** Per-scene shot division table. **Who** director/DP/1st AD, after breakdown.
**Layout** H2 `Shot list`, sub "Grouped by scene, in script order. The scene number, the slug line and the counts are read from the breakdown — this page only adds the shots." If any shots: tools row `<n> setups across <m> scenes` · spacer · Export menu `Export the shot division` ▾ (`Whole script — PDF` hint A4, `Whole script — CSV` hint spreadsheet). Then one block per scene.
**Scene block** header (`vz-scene-head`): scene number chip · slug · `3 shots` / `no shots yet`. Orphan group: head with `!` chip, `Scene deleted in the breakdown`, `2 orphaned shots`, note "These shots point at a scene that no longer exists. They are shown so you can move the writing somewhere else or delete them on purpose — nothing here is thrown away quietly." Hint (below 940px only): "Swipe the table sideways for every column →". Table cols: `Shot | Size | Angle | Move | Lens | What we see | Got it | (controls)`. Row cells: shot number input (placeholder = ordinal; badge `AI draft` (hover "Drafted by AI — edit or delete it like any other shot") or `Basic` (hover "Drafted by the basic breakdown from the script — edit or delete it like any other shot")); three selects; lens text input (placeholder `35mm`); description textarea 2 rows (placeholder "One line of what the audience sees"); checkbox with label `to shoot` / `in the can` (row dims `is-done`); controls `↑` `↓` `✕` (disabled at ends; ✕ danger). Under table: `+  Add shot` pill and, if shots exist, `Export this scene` ▾ (`This scene — PDF`, `This scene — CSV`). Auto-saves on input (debounced) and on change.
**Sample row** `1A | MS · medium | eye level | static | 35mm | Murugan reads the notice on the chawl wall | ☐ to shoot`.
**States** No scenes + no shots (empty card): ▥, H2 `A shot list needs scenes first`, "A shot belongs to a scene — that is what makes it schedulable, countable and shootable. Break the script into scenes once and this page has something to hang shots on." steps `1 Break it down` ("List the scenes with INT/EXT, time, location and length. That is the breakdown page."), `2 Come back here` ("Every scene appears with its own shot list, already numbered."), `3 Cover the scene` ("A wide to see where we are, a medium to play it, a close for the moment that matters."); example label `Why it works this way`; CTA `Go to the breakdown  →`. Scenes but no shots: ◱, H2 `Cover the first scene`, "A shot is one continuous run of the camera. Say how big it is, where it looks from, whether it moves, and what we see — four decisions, and the scene is planned." steps `Size it`/`Place it`/`Describe it`; example `Por Thozhil` ("holds its interrogation scenes in long, static mediums and saves the close-up for the line that turns the case…"); button `+  Add the first shot`.
**Dialogs** Delete shot: "Delete shot "<first 40 chars>"? Its 2 frames go with it." (danger confirm). Export toasts: "Exported N setups as CSV." / "There are no shots in that scope yet." / "The exporter could not be loaded. Check the connection and try again."
**Print/export layout** PDF (A4): masthead `<Project> — Shot division — whole script` (or `— scene 7`), meta `12 setups · 5 scenes covered · 9 6/8 pages`. Each scene: number chip, slug, `1 3/8 pages · 3 shots`, synopsis, table `Shot | Size | Angle | Move | Lens | What we see | ✓` (widths 7/9/9/9/9/48/5%; ✓ = `✓` or `☐`; empty scene "No shot division for this scene yet."), footer summary: `12 setups`, `5 scenes covered`, `9 6/8 pages`, `3 in the can`. Empty: "No shots to export yet. Add a shot to a scene and it appears here." CSV header: `Scene, Slug, Int/Ext, Time, Location, Scene pages, Shot, Size, Angle, Movement, Lens, What we see, Status, Drafted by`.
**Mobile** table scrolls inside itself (min widths: shot 4rem, lens 5rem, description 14rem, done 5.5rem, controls 5.5rem).
**Stitch prompt** Dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, 16px, pills). Visualize page, tab "Shot List": tab strip (Shot List active, Draft a shot division, Storyboard, Blocking, Scene board, Lookbook); header "Shots & Frames." with four stat cards. Toolbar "12 setups across 5 scenes" + "Export the shot division" dropdown. Per-scene blocks: header bar with scene number chip, slug "INT. Perambur Chawl — NIGHT", count "3 shots"; editable table (Shot with small AI/Basic tag, Size/Angle/Move selects, Lens input, What we see textarea, Got it checkbox "to shoot/in the can", ↑ ↓ ✕ buttons); below "+ Add shot" pill and "Export this scene". Done rows dimmed. Mobile: table scrolls with "Swipe the table sideways" hint.

### Draft a shot division (`visualize.html#draft`)
**Purpose** First-pass coverage from the script: rules-based (no key) or AI. **Data** script blob, scenes, shots; AI via the AI Desk 'shot-draft' task (key lives in Settings; not here). **Layout** H2 `Draft a shot division`, sub "A first pass at the coverage, from the script you have already written. It is a draft — every shot it makes is an ordinary shot you can change, reorder or delete, and it is marked so you always know which is which." Note card: **No key needed.** "The basic breakdown reads the ticked scenes on this device, by rule: a master, an over-the-shoulder pair for a two-hander, a single for each speaker, the shot lines you wrote, a move where somebody runs, a POV where somebody looks, and inserts for the props. Nothing leaves this browser. The AI draft sends the ticked scenes only, and shows you what it sends before it does." Pick row: `Tick all` · `Clear` · `3 scenes selected · 2 5/8 pages`. Optional match note. Scene checklist rows: checkbox · number · slug · meta (`synopsis only` / `script matched` / `script matched by position, check it` + ` · 2 shots already`; rows with shots start unticked). Action row: primary `Basic breakdown (no AI key needed)` (disabled with none ticked) · AI pill `Draft 3 scenes with AI` (greyed with Pro offer on a plan without AI, links to Settings with no key) · `Undo the last draft (N)`. Status line (`role=status`): "N shots drafted by AI. Every one of them is marked and editable." / "N shots drafted by the basic breakdown across M scenes — K ticked scenes had no script to read. Every one of them is marked Basic and editable." Error (`role=alert`, bold `It did not run.`): "Tick at least one scene." / "The basic breakdown needs script pages to read, and the ticked scene has none matched. Nothing was added." Toast: "N shots drafted. Read them before you shoot them."
**Gate states** No script: gate "**There is no script yet.** A shot division is a reading of the scene as written — without the pages there is nothing to read, and a division invented from a slug line is a guess dressed up as a plan." + primary `Write the screenplay  →`. No scenes: "Break the script into scenes first — a shot belongs to a scene, and the breakdown is where scenes are made."
**Dialog** Undo: "Remove the N shots from the last draft?\n\nOnly those shots are removed. Anything you wrote or edited since is kept." (danger).
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills). "Draft a shot division" tab: explanatory H2 and sub; highlighted note card "No key needed."; toolbar (Tick all, Clear, "3 scenes selected · 2 5/8 pages"); scene checklist rows with checkbox, number, slug, grey meta ("script matched · 2 shots already"); action row with primary pill "Basic breakdown (no AI key needed)", violet-outline AI pill "Draft 3 scenes with AI", ghost "Undo the last draft (6)"; status line in green, error line in red. Alternate gate card when no script with CTA "Write the screenplay →".

### Storyboard (`visualize.html#storyboard`)
**Purpose** Frames per shot, no image uploads. **Layout** H2 `Storyboard`, sub "A frame per drawing, hanging off the shot it draws. Grouped by scene, in shot order — move a shot above and the board follows it." Note: **No image uploads.** "A frame here holds a link or a description, not a picture. The studio keeps your work in this browser, where an image file would not fit and would not survive a backup — so paste the URL of your drawing, or write the frame in words. Words are often the better storyboard anyway." Per scene: head (number chip · slug · `3 shots`) + a strip of shot columns (auto-fill min 260px → 3-4 columns at 1280, 1 at 390). Shot column: head `1A` · `MS · static` · `2 frames`; the shot's description line; frames; `+  Frame` button. Frame card: 16:9 slate with badge `1a` (shot number + letter) and a view — link `Open the reference  ↗` (if URL), the typed text, or "No reference yet — paste a link, or describe it below."; fields `Reference` (placeholder `https://… or describe the frame in words`), `Caption` (placeholder "What changes by the end of the shot"); buttons `↑ ↓ ✕`.
**States** No shots: "A frame draws a shot, so the shot list comes first. Add a shot above and every shot gets a slot on the board." No frames: ▢ H2 `Draw the first frame`, "A storyboard is not art — it is a question answered in advance. Where is the camera, who is in the frame, and what changes by the end of the shot. A frame that answers those three is doing its job." steps `Pick the shot`, `Point at the image`, `Or write it`; example `Kaaka Muttai` (boarded in a notebook by hand…); button `+  Add the first frame`.
**Dialog** "Delete this frame? The shot it draws is untouched."
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px). "Storyboard" tab: info note "No image uploads."; per-scene header bar; horizontal-wrapping grid of shot columns, each with header "1A · MS · static · 2 frames", shot description, stacked frame cards (16:9 dark slate with "1a" badge and text/link, Reference and Caption inputs, ↑ ↓ ✕), and "+ Frame" pill. Mobile: single column.

### Blocking (`visualize.html#blocking`)
**Purpose** Top-down maps of actor/camera positions. **Data** blocking collection in `fms_shots_v1`. **Layout** H2 `Blocking`, sub "A top-down map of where the actors stand, where the camera sits and what it faces, and where anyone moves to. Drag a mark, or focus it and use the arrow keys. It is a few numbers per mark, so it costs nothing to keep." A learn panel (`blocking-diagram`) is inserted under the H2. Pick row: label `scene` + select (`7 · INT. Perambur Chawl — NIGHT`) + `+  Add a setup`. Setup card: name input (placeholder `Setup name`) + danger `Delete setup`; tool buttons `+ Actor` `+ Camera` `+ Mark`; the SVG map (100×70 units, grid of 10 units, ground rect; actor = circle with facing tick, camera = triangle with two FOV lines, mark = diamond; label under each; move = line with arrowhead to a draggable end handle; selected mark highlighted); selection bar (label input `Label`, `↺` `↻` 15° turns, `Add a move` / `Clear the move`, danger `Remove mark`) or hint "Pick a mark to name it, turn it or give it a move."; note input (placeholder "A note for the crew — what the move is, where the light comes from…"). Keyboard: arrows move a mark, `[` `]` turn it.
**States** no scenes: "Blocking belongs to a scene, so the breakdown comes first. Break the script into scenes and each one can have its maps." none yet: "No maps for this scene yet. Add a setup, then place the actors and the camera."
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px). "Blocking" tab: scene selector + "+ Add a setup"; card with setup name input, "+ Actor / + Camera / + Mark" pills, a 10:7 overhead map with faint grid, violet circles (actors with facing tick), triangle camera with FOV lines, diamonds, dashed arrow for a move with a round drag handle; selected-mark toolbar (Label, ↺ ↻, Add a move, Remove mark); crew-note input.

### Scene board (`visualize.html#scene-board`)
**Purpose** One scene on one page, read-only synthesis. **Layout** H2 `Scene board`, sub "One scene on one page: the script, the shots, the storyboard frames and the maps, read from the places they live. Print it for the director, the DP and the first AD." Pick row: `scene` select + `Print this board`. Sheet: header (number chip · slug · `3 eighths`), synopsis, `Reader note: …`; four columns (auto-fit min 22rem → 2-3 at 1280, 1 at 390): `Script` (up to 60 elements, styled by type, `…` if more), `Shots · 4` (mini table `# | Size | Angle | Move | Lens | What we see`), `Frames · 3` (ordered list "**Shot 1A** caption"), `Blocking · 2` (figures with read-only maps + caption `name — note`). Empty lines: "No script text is matched to this scene.", "No shots yet for this scene.", "No frames drawn for this scene.", "No maps for this scene. Add one under Blocking."; no scenes: "The scene board needs a scene. Break the script into scenes in the breakdown."
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px). "Scene board" tab: scene select and "Print this board"; a one-page sheet with scene header chip + slug + "3 eighths", synopsis, then a 2-column grid of cards: Script (screenplay-styled lines), Shots (compact table), Frames (numbered list), Blocking (small overhead maps with captions).

### Lookbook (`visualize.html#lookbook`)
**Layout** H2 `Lookbook`, sub "Named boards — palette, light, texture, wardrobe — each holding the references you will hand to a department, and the reason each one is there." Note **No image uploads.** "References are links or notes, never uploaded images. A board that says why a reference matters survives the meeting; a wall of pictures does not." Board cards stacked: head = name input (placeholder `Board name — Palette, Light, Texture…`) · `3 references` · `↑ ↓ ✕`; field `What this board is for` (placeholder "One line the department can read first"); table `Title | Reference | Why it matters | (✕)` (placeholders `What it is`, `https://… or a note`, "Why it matters — what the department should take from it"; a URL grows `Open  ↗` link); empty "Nothing on this board yet. A reference is a title, a link or a note, and the sentence that says why it is here."; `+  Add reference`. After all boards: `+  Add board`. Suggested names in order: Palette, Light, Texture, Wardrobe, Location, Camera, Sound.
**Empty** ◈ `Say what the film looks like`, "A lookbook is how a department head learns the film without reading the script. Four boards is usually enough: the palette, the light, the textures and the wardrobe." steps `Name a board`, `Add references`, `Hand it over`; example `Why the third column exists`; button `+  Add the first board`.
**Dialog** Delete board: `Delete the board "Palette"? Its 3 references go with it.` Removing a reference shows a toast `Reference removed: <title>` with action `Undo`.
**Sample** Board `Light` — note "Practicals only, nothing lit from the front"; row `Kasimedu night market | https://… | Open ↗ | Sodium vapour spill, faces half-lit`.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px). "Lookbook" tab: info note; stack of board cards each with big name input, reference count, up/down/delete icon buttons, "What this board is for" input, a 3-column editable table (Title, Reference with "Open ↗" link, Why it matters) and "+ Add reference"; "+ Add board" pill at the end. Empty state card with diamond glyph "Say what the film looks like".

---

## 3. PLAN — `plan.html`

Header: eyebrow `Plan · dates, places, references`, H1 `Shoot Calendar & Locations.`, deck "The schedule already exists — the stripboard made it. This page puts real dates on those shoot days, keeps a recce record for every place the script names, and indexes the reference material you have gathered. Not one scene is typed again here." Stats: `N shoot days`, `N dates set`, `N locations`, `N references`. Tabs: **Shoot Calendar** (#calendar) · **Locations** (#locations) · **Reference Media** (#media). Data: `fms_scenes_v1` (read), `fms_locations_v1` (day dates, day order, recce per location key, media list), call sheets + DPR (for wrap time), recce-light (pure sun maths). No RPCs. This page writes only: a date per day number, a recce record per location name, media links.

### Shoot Calendar (`plan.html#calendar`)
**Layout** H2 `Shoot Calendar`, sub "One card per shoot day, in order, straight off the board. The date is the only thing this page saves — the scenes, the pages and the cast on each day are read back from the breakdown every time you open it." Day cards stacked (single column).
**Day card** head: `Day 2` · label `Date` + native date input (aria "Calendar date for shoot day 2") · when-text `Monday · 2 November 2026` / `No date yet` (+ ` · shared with another day` if a date clashes) · meta `3 scenes · 2 5/8 pages`. Rows: `Locations` (chips; label `Location` if 1); `Cast` chips or "No cast tagged on these scenes — tag them in the breakdown and they appear here." Table `Sc | I/E | Location | Time | Pages | What happens` (row `7 | INT | Perambur Chawl | NIGHT | 1 3/8 | Murugan returns to find the lock cut.`). A date saves only when complete (yyyy-mm-dd); clearing saves on blur.
**Extra blocks** `N scenes not on any day` (head), "They are in the script and they are counted in the page total, but no day carries them yet. Scheduling happens on the stripboard.", chips `Sc 5`, button `Schedule them  →`. `Dates with no scenes` list: "These shoot days had scenes when the date was set and do not now. Nothing was deleted for you — clear a date once you are sure." rows: chip `Day 4` · date · `✕` (title "Clear this date").
**States** No scenes: empty card ▦ `The Shoot Calendar needs a schedule first`, "This page does not hold a schedule of its own. A shoot day is a number on a scene, and a location is the place typed on a scene — so both arrive here the moment they exist, and neither is ever typed twice.", steps `Break the script down`, `Schedule them` ("Group the strips and hand each group a shoot day. That is the stripboard."), `Come back here` ("Put a real date on each day, write the recce up, and file the reference links."), example `Why it works this way`, two CTAs `Add the scenes  →` (primary) and `Schedule them  →` (alt). Scenes but no days: "None of the 14 scenes has a shoot day yet. Give a strip a day on the stripboard — or use "Schedule by location" there — and the calendar fills itself in." + `Go to the stripboard  →`.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills). "Shoot Calendar" tab: stacked day cards. Each card head: "Day 2" badge, date input, "Monday · 2 November 2026", "3 scenes · 2 5/8 pages" (amber note if the date is shared); rows with teal location chips and violet cast chips; a compact scene table (Sc, I/E, Location, Time, Pages, What happens). Below: card "2 scenes not on any day" with chips and "Schedule them →". Mobile single column, table scrolls.

### Locations (`plan.html#locations`)
**Purpose** Recce card per location. **Layout** H2 `Locations`, sub "Every place the script names, derived from the scenes — there is no "add a location" here, because a location is where a scene happens. What this page keeps is the recce: how to get in, who to ask, and what is missing when you do." One card per location (left rule coloured by permission tone: none grey, open amber, ok green, no red).
**Card** head: name (H3) · permission chip · `4 scenes · 3 2/8 pages`. `Days` row: chips `Day 1`, `Day 3`, `2 scenes unscheduled` or "Not on the board yet." **Daylight** block (only if days exist): `Daylight` label + list rows `Day 2 · Mon 2 November 2026` / `Sunrise 06:02 · Sunset 17:41 · Golden hour 16:55 (IST)`; flag: "Day 2 is planned to wrap at 19:30, after sunset (17:41). Exterior scene 12 here needs daylight; place it early in the day or move the wrap." Without pin: "Add a map pin below to see sunrise and sunset on this location's shoot days."; without dates: "Give this location's shoot days a date above, and its sunrise and sunset appear here." Recce form grid (auto-fit min 230px → 3 cols at 1280, 1 at 390): `Address` ("Where the van goes — a pin, a landmark, a street"), `Who to ask` ("Owner, caretaker, office — and a number"), `Permission` select (`Not asked yet`, `Scouting`, `Asked`, `Approved`, `Refused`), `Best time of day` ("Before 9am · after the market closes · golden hour"), `Power` ("Mains on site? How far is the point? Genny needed?"), `Parking` ("Where the unit parks, and how far the carry is"), `Toilets` ("On site, next door, or bring one"), `Map pin` ("Paste a Google Maps link, or 13.0827, 80.2707"; invalid → red aria-invalid + title "No coordinates in that. Paste a Maps link, or two numbers like 13.0827, 80.2707." or for short links "A short link carries no coordinates. Paste the long address-bar link."), `Nearest hospital` ("Name, distance, casualty phone"), `Nearest police station` ("Station, and its number"), `Cost` ("Per day, plus whatever they actually meant"); `Notes` textarea 2 rows ("Anything the recce turned up — noise, light, neighbours, the stairs."). Foot: `Scenes here` chips `Sc 7 · INT NIGHT`.
**Extra** `N scenes with no location` card ("A scene with no place cannot be scouted, scheduled by location or put on a call sheet. The field is on the scene, in the breakdown.", `Go to the breakdown  →`). `Recce notes with no scenes` list ("No scene names these places any more — they were renamed in the breakdown, or their last scene went. The notes were kept rather than quietly dropped; rename the scene back to recover them, or discard them here."), `✕` (title "Discard these notes").
**States** none: "No scenes yet, so no locations. Type a place on a scene in the breakdown and a recce card appears here with the scenes already attached." + `Go to the breakdown  →`; "None of the N scenes has a location typed on it yet. Fill in the location field on a scene and its recce card appears here."
**Dialog** `Discard the recce notes for "<key>"? No scene points at this place any more, and this cannot be undone.`
**Sample** `Marina Beach` — Approved (green rule) — Address "Near Gandhi statue, Kamarajar Salai", Who to ask "GCC beach office, Mr. Selvam 98400 12345", Power "Genny needed", Cost "₹15,000 per day", hospital "Apollo Mylapore, 2.5 km".
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills). "Locations" tab: stack of recce cards with a coloured left rule by permission (green Approved, amber Asked/Scouting, red Refused, grey Not asked yet). Card head: name, permission chip, "4 scenes · 3 2/8 pages"; Days chips; Daylight list with sunrise/sunset/golden hour and an amber warning line; a 3-column form grid (Address, Who to ask, Permission select, Best time, Power, Parking, Toilets, Map pin, Nearest hospital, Nearest police, Cost) and a Notes textarea; footer chips of scenes here. Mobile: one column.

### Reference Media (`plan.html#media`)
**Layout** H2 `Reference Media`, sub "Recce photographs, a lookbook, a location video, the sound reference — wherever they already live, listed in one place and attached to the day or the location they belong to." Honest-note card: eyebrow `What this is, and what it is not`, two paragraphs ("The studio runs entirely in this browser. There is no server behind it and nowhere for a file to go, so nothing here uploads and nothing is copied. Your photographs and cuts stay wherever you already keep them — a drive, a phone, a folder on the edit machine, a shared link." / "What is saved is the title, the link, the kind and your note. This is an index of where the material is, not a store of the material itself, and a link that stops working is a link you will have to fix at the source."). Reference cards stacked; `+  Add a reference` pill.
**Card** bar: title input (placeholder `What is it? — "Perambur house, recce 12 Jan"`) · kind select (`Reference image, Recce photos, Video, Audio, Document, Folder, Other`) · link-to select (`Not linked`, each location name, `Day N`; stale: `<label> — no longer in the script`) · `✕` (title "Remove this reference"). Link row: URL input (placeholder `https://… or the path where the file lives`) + `Open  ↗` (only if http/https). Note input ("Note — what to look at, who shot it, what it is for").
**Empty** "Nothing indexed yet. Paste the link to a folder of recce photographs, or to the lookbook, give it a title, and say which location or which day it belongs to."
**Dialog** `Remove the reference "<title>"? The file itself is wherever you keep it and is untouched.`
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills). "Reference Media" tab: a bordered info card "What this is, and what it is not"; stack of reference cards each with title input, kind select, link-to select, red ✕; URL input with "Open ↗"; note input; "+ Add a reference" pill at the bottom. Mobile: bar fields stack.

---

## 4. STRIPBOARD — `stripboard.html`

Header: eyebrow `Stripboard · the schedule`, H1 `The Board.`, deck "One strip per scene, straight from the breakdown. Group them the way you will shoot them — everything in one location together, every night exterior together — then hand each group a shoot day. The day out of days below builds itself from that." Stats: `N strips`, `N pages`, `N shoot days`, `N unscheduled`. Tabs: **Stripboard** (#stripboard) · **Day Out of Days** (#dood). Data: `fms_scenes_v1` (writes only `shootDay` per scene, through updateScene/placeScene), `fms_locations_v1` (per-day `order`, banners, page target), songs blob (grouping), script (hours estimate, lazy). Grouping is a view, not persisted.

### Stripboard (`stripboard.html#stripboard`)
**Layout** H2 `Stripboard`, sub "Grouping is how you are looking at the board, not how the script reads — the scene order in the breakdown never moves." Controls row (wraps on mobile): segmented control `Group by` [`Script order` · `Location` · `Day / night` · `Shoot day` · `Song`] (toggle buttons, `aria-pressed`, active highlighted) and, right, action cluster: `Schedule by location` · danger `Clear days` · `Export` ▾ (`Stripboard as PDF` hint landscape, `Day Out of Days as PDF` hint landscape, separator, `Print this page`). Then the **Key** legend: `Key` · chips DAY, DAWN, DUSK, NIGHT, CONTINUOUS (each coloured) · `EXT` filled badge + "filled badge is exterior". In *Shoot day* grouping only: a select `Pages per day before a warning` (options 2 to 8 pages in 1/8 steps, e.g. `4 7/8 · default`) and the hint "Drag a strip by its handle to change its place in the day or drop it on another day — the order you set here is the order the shoot day and the call sheet read. Without a mouse: Alt+↑ and Alt+↓ move the strip you are on, the handle opens a Move menu, and the shoot-day picker moves it to another day." Then groups, each: head (`h3` group name + meta `4 scenes · 3 2/8 pages`; in a Day group also an amber chip `Over target · 5 3/8 / 4 7/8 pp` when over, hours text `≈ 9.5 h to shoot` (amber if over a 12-hour day, filled lazily when script exists) and a `+ Banner` menu: `Company move`, `Travel day`, `Holding / day off`, `Note`) and a **rack** of strips with a 2px gap (like pressed cardboard). Group names by mode: Script order → one group `Script order`; Location → location name or `Location not set`; Day / night → `INT · DAY`, `EXT · NIGHT` (sorted DAY, DAWN, DUSK, NIGHT, CONTINUOUS, then INT < EXT < INT/EXT); Shoot day → `Day 1…`, last `Not scheduled yet`; Song → `3. Kaadhal Vaasam`, last `Not part of a song`. In Shoot day mode, after the racks: dashed drop zones `Drop a strip here to start Day N` and (when none unscheduled) `Drop a strip here to take it off the schedule`.

**Strip anatomy (`article.sb-strip`, a CSS grid, background = wash of its time-of-day hue, 4–5px left rule in the solid hue, 16px radius)**: columns at ≥720px: [grip `⠿` (only in Shoot day grouping)] · [scene number, mono bold, 2.6rem] · [INT/EXT badge] · [location/slug, display font bold, ellipsised, takes remaining space] · [time-of-day word, mono small caps, hue-coloured text] · [pages in eighths mono `1 3/8`, title "11 eighths of a page"] · [Shoot day picker: label `Shoot day` + select `—`, `1`, `2`… `N · new`]. Row 2 (spans): shot-state link (if any: `Shot` (green outline), `Part shot` (amber), `Dropped` (dashed); link to shoot.html, title "Marked on the shoot day — change it there"), then label `Cast` + cast name chips, or "No cast tagged — this scene is invisible to the day out of days." Row 3: synopsis paragraph (if any). Focus-within turns the border accent violet.
**Colour rules** Fill by time of day: DAY amber (`#d6a44a` rule, `#2e2415` wash, deep text `#e8c384`); DAWN violet (`#9575f8`, `#241a3d`, `#b69bfb`); NIGHT blue (`#60a5fa`, `#16233c`, `#93c5fd`); DUSK pink (`#f472b6`, neutral sunk wash, `#f9a8d4`); CONTINUOUS magenta (`#e879f9`, raised-paper wash, `#f0abfc`). INT vs EXT is the badge: INT = outlined badge in the strip hue; EXT (and INT/EXT) = filled badge (`is-ext`) with on-fill text. Green/yellow are deliberately NOT used (they mean status).
**Move/drag/place/nudge** Only in Shoot day grouping. Grip button = menu (`Move up` Alt+↑, `Move down` Alt+↓, separator, `Move to top of day`, `Move to bottom of day`; unscheduled strip: single item `Pick a shoot day to place this strip`). Aria: "Move scene 7: drag it, or open for up, down, top and bottom" / "Scene 7 is not scheduled: drag it onto a day, or pick one". Dragging (pointer events, works by touch; starts after 6px): the strip dims and shrinks slightly, a horizontal drop line shows where it lands, a floating tag `Scene 7` follows the pointer, racks and drop zones highlight (`is-over`), page autoscrolls within 72px of the viewport edge; Esc or cancel restores and announces "Drag cancelled. Nothing moved."; dropping on `Not scheduled yet` clears its day. Picker change also places it (end of the new day). Every move: live-region announcement ("Scene 7 moved to Day 2, position 3 of 5." / "Scene 7 is off the schedule.") and a toast with action `UNDO`; edge cases: "Already at the top of the day." / "Already at the bottom of the day.".
**Banners (`div.sb-banner`, neutral sunk band with heavy ink left rule; company move = dashed rule)**: kind word (`Company move` / `Travel day` / `Holding / day off` / `Note`) + for moves two inputs `From` → `To` + a text input (placeholders: move "How long, what travels"; travel "Where to, how"; holiday "Why: Sunday, festival, holding for weather"; note "Anything the unit should know") + position select (`Top of the day`, `After scene 7`…, `After the day`) + danger `Remove`. Add toasts/announcements: "Company move added to Day 2." / removal toast "Travel day removed from Day 2." with `UNDO`. Adding a move pre-fills From/To from consecutive scene locations.
**Actions** `Schedule by location`: if scenes already have days, confirm "N scenes already have a shoot day. Re-schedule every scene by location?" then one day per distinct location in script order, switches to Shoot day grouping, toast "Scheduled into 5 days, one per location." `Clear days`: danger confirm "Clear the shoot day from N scenes? The scenes themselves are untouched." Clears day orders too.
**States** No scenes: `#stripboard` holds the empty card ▤ `The board needs scenes first`, "A stripboard is not a second document — it is the scene list stood on its side. Every strip here is one scene from the breakdown, so there is nothing to type on this page that you have not already typed once." steps `Break the script down` ("List the scenes with INT/EXT, time, location and length. That is the breakdown page."), `Tag the cast` ("Who is in each scene. The day out of days is built entirely from those tags."), `Come back and schedule` ("Group the strips by location, hand each group a day, and the schedule is done."), example "A scene that moves on the board must not move in the script. Grouping here is a way of looking; the only thing the board writes back to a scene is the day you shoot it.", CTA `Go to the breakdown  →`.
**Print layout** `Stripboard as PDF`: A4 landscape, margins 13mm 12mm, masthead `<Project>` left / `Stripboard` right, meta `14 scenes · 11 2/8 pages · 5 shoot days · date`; app chrome removed; strips keep 6-column grid (no grip), colour by time of day reduced to print inks.
**Sample strips (Shoot day grouping)** `Day 2 — 3 scenes · 2 5/8 pages` · `Over target · 5 3/8 / 4 7/8 pp` · `≈ 9.5 h to shoot` ·
`⠿ | 7 | INT | Perambur Chawl | NIGHT | 1 3/8 | Shoot day [2]` / `Cast Murugan Kavitha` / "Murugan returns to find the lock cut."
`⠿ | 9 | EXT | Marina Beach | DAWN | 6/8 | Shoot day [2]` (filled EXT badge; Shot tag)
Banner: `Company move [Perambur] → [Marina] [40 min, one truck] [After scene 7 ▾] Remove`.
**Mobile (390px)** controls left-aligned and wrapped; strip grid collapses to [number | badge | slug] (grip first when present) with time word, pages, cast and the picker wrapping to full-width rows beneath (picker spans the whole row); group head wraps; drag via touch on the grip; drop zones full width.
**Stitch prompt** Dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, 16px radius, pills). Stripboard page, tab "Stripboard": header "The Board." with four stat cards; segmented control "Group by: Script order / Location / Day / night / Shoot day (active) / Song"; buttons "Schedule by location", red "Clear days", "Export" dropdown; colour key chips DAY amber, DAWN violet, DUSK pink, NIGHT blue, CONTINUOUS magenta plus "EXT filled badge"; page-target select. Day groups: header "Day 2 · 3 scenes · 2 5/8 pages" with amber "Over target" chip, "≈ 9.5 h to shoot", "+ Banner" menu. Strips: tight stack with 2px gaps, each a rounded bar tinted by time of day with a thick coloured left rule: grip ⠿, scene number mono, INT/EXT badge (outlined vs filled), bold location, time word, pages "1 3/8", "Shoot day" select; second row cast chips and shot-state tag; third synopsis. Neutral banner strip "Company move: From → To". Dashed drop zones "Drop a strip here to start Day 3". Mobile: strips wrap into two rows.

### Day Out of Days (`stripboard.html#dood`)
**Purpose** Who is needed on which day; cast pay-span report. **Data** cast element index × scenes' `shootDay`; derived entirely, nothing stored. **Layout** H2 `Day Out of Days`, sub "Who is needed, and on which day. Built from the cast tags and the days assigned above — there is nothing to fill in here." Horizontally scrollable grid (`sb-dood-scroll`) with sticky first column; then the legend note. Export: via the Stripboard tab's Export menu (`Day Out of Days as PDF`, landscape, A4, masthead label `Day Out of Days`).
**Grid** Header: `Cast` (name column) · one column per shoot day in use (header = day number, `1 2 3 4 5`) · totals `W` (title "Days worked") · `H` (title "Days on hold") · `Total` (title "Days from start to finish — the days the part is on the payroll"). Rows sorted by days worked desc, then name. Name cell: bold name + small `4 scenes`. Cell symbols (cell title `Day 3 · works`):
- `SW` — start work: first day a performer works (title "starts work"); filled violet accent, on-accent text
- `W` — work: every working day after the first (not the last) ("works"); accent-wash with deep violet text
- `H` — hold: a day between first and last working day on which they do NOT work ("on hold"); amber warn-wash with deep amber text
- `WF` — work finish: the last working day ("works and finishes"); filled violet
- `SWF` — single-day part: starts, works and finishes the same day ("starts, works and finishes"); filled violet
- blank — off (title "Day N · not needed"; muted)
Totals: W = count of working days, H = count of hold days, Total = span (last − first + 1). Example row: `Murugan 11 scenes | SW W H W WF | 4 | 1 | 5`. Scenes with no shoot day are not counted.
Legend note: "SW starts work · W works · H is held between two working days · WF finishes · SWF is a single-day part. Scenes with no shoot day are not counted."
**States** no scenes: heading + "Who is needed, and on which day. It builds itself from the cast tags and the shoot days on the breakdown, so there is nothing to fill in here and nothing to show until there are scenes." No cast: "No cast tagged yet. Tag a performer on any scene in the breakdown and a row appears here, with every day they work, hold and finish." No days: "No shoot days assigned yet. Give a strip a day above — or use "Schedule by location" — and the grid fills itself in."
**Print layout** A4 landscape, margins 13mm 12mm; masthead `Day Out of Days`, meta `14 scenes · 11 2/8 pages · 5 shoot days`; grid prints with symbols in ink.
**Sample** Days 1–5; rows: `Murugan` days 1-5 = `SW | W | H | W | WF` → W 4, H 1, Total 5; `Kavitha` = `(blank) | SWF | (blank) | (blank) | (blank)` → W 1, H 0, Total 1; `Inspector Raghav` = `(blank) | SW | H | WF | (blank)` → W 2, H 1, Total 3.
**Mobile** grid scrolls horizontally inside its box, name column stays sticky; note wraps.
**Stitch prompt** Dark violet UI (#120f1c, #1b1727, #9575f8, Catamaran, 16px). Stripboard page, tab "Day Out of Days": H2 and sub; a wide grid card with sticky left Cast column (bold name plus "4 scenes"), day columns headed 1–5, and totals W, H, Total. Cells are small rounded squares: filled violet "SW", "WF", "SWF"; pale violet "W"; amber-tinted "H"; empty muted for off days. Legend line beneath: "SW starts work · W works · H is held between two working days · WF finishes · SWF is a single-day part." Mobile: horizontal scroll with sticky name column.


---

# PART G — Budget, Cast & Crew, Shoot Day, Edit Log and Deliverables

## 06 — Budget, Cast & Crew / Call Sheets, Shoot Day, Edit Log, Deliverables

Extracted from the code in the `admin-fixes` worktree. All strings are verbatim. Design tokens: ground #120f1c, card #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran body, JetBrains Mono for figures/labels/eyebrows, Courier Prime only for script text.

### Shared shell (every page below)

- **Top band (sticky, shell.js):** brand plate, stage/phase menu, breadcrumb, right-hand tools (sign-in pill, Appearance, sync). Below 720px the band is breadcrumb only and a **bottom bar** appears: Home · Go to · Search · Tools.
- **Page head `header.bd-head`:** mono eyebrow (uppercase tracked), `h1.bd-title` ending in a full stop, `p.bd-deck` paragraph, optionally a `.bd-stats` strip of stat cards (big number over mono caption).
- **Tab strip (`src/ui/tabs.js`)** on Budget and Cast & Crew only: sticky under the band, ONE row that scrolls sideways at 390px, tabs are 36px+ text pills; selected tab = filled accent with `--accent-on` text and a 3px leading bar; others transparent, hover wash. The hash picks the tab. Edit Log, Shoot Day and Deliverables do not use this strip (Deliverables draws its own, see below).
- **Path bar (`mountPathBar`)** on Budget and Cast & Crew: pre-production path above the tool and Back / Next buttons at the foot.
- **Stat card (`.bd-stat`):** `strong` number (display size, no-wrap) over a `span` caption in mono uppercase.
- **Toasts:** bottom, polite; actionable toasts (UNDO) stay until dismissed.
- **Confirm dialog (`askDanger`):** modal with the question text, a cancel button and a red confirm button.
- **Stage guide:** a collapsed "guided questions" block mounted at the foot of Shoot Day (`stage: production`) and Edit Log (`stage: post`); not specified further here.
- Money formats: `rs()` = `₹` + non-breaking space + Indian grouping (`₹ 25,65,000`, `₹ 1,25,00,000`), negatives `−₹ 4,600`. `fmtINR` abbreviations: `₹ 4,600`→`₹ 5k`, `₹ 2.5 L`, `₹ 1.2 Cr` (used only in "≈" captions, top-sheet subtitle).

---

## 1. BUDGET — `budget.html`

Header (all tabs): eyebrow `Budget & People · what it costs`; h1 `Budget.`; deck: "A line-item estimate that reads your schedule. Days come from the stripboard if you have built one, rates from the Chennai tables if you want them, and every figure stays editable. Then, once you are shooting: petty cash, crew payments and the cost report against it."

Tab strip, in order: **Estimate · Petty cash · Cost report · Crew payments · Top sheet · Schedule impact · Versions · Wage table · Export** (ids `#estimate #expenses #actuals #crew #topsheet #schedule #versions #wages #export`). Body column is `.bd-list` (centred max-width column with side gutters).

Shared UI inside the cost tabs (class `cx-*`):
- `cx-intro`: `h2.cx-h2` + `p.cx-deck`.
- `cx-card`: raised card with 16px radius, hairline border, stacked fields.
- `cx-field`: label (mono small caps `cx-flabel`) above control, optional grey `cx-hint` under.
- `cx-quick-row`: two fields side by side (auto-fit, stacks at narrow width).
- `cx-chips`: radio group of pill chips; checked chip filled accent.
- `cx-table`: tables with `caption`, numeric columns right-aligned; wrapper `cx-scroll` scrolls sideways on phones.
- `cx-alert`: left-ruled note box. `cx-empty`: empty state = sentence + `mini-btn` link.
- `bd-icon` `×`: 44px round ghost icon button for deletes.
- Buttons: `.btn` (pill, outline), `.btn.primary` (filled accent), `.mini-btn` (small caps pill), `.mini-btn.danger`.
- Forms commit on `change`; each tab is re-rendered whole after any change, focus restored to the same control.

### Budget · Estimate (`budget.html#estimate`)

**Purpose** Day-rate line-item estimator that can read shoot days from the stripboard. · **Who/when** Producer/line producer in pre-production; always visible, works with no project-scenes. · **Data source** `fms_library_calc_v1` (keys `ci_<n>_item|custom|days|rate`, byte-stable), scenes (`fms_scenes_v1`), songs (`listSongs`), `src/data/rates.chennai.2024.json` (52 presets, 6 sections, asOf `2024-25`), `rates.chennai.checks.json` (re-checked vendor figures, lastChecked 2026-09-29). No RPCs.

**Layout** Top-to-bottom: (0) Learn-in-place boxes prepended (topics "atl-btl", "schedule-budget", "who-owns-what"; collapsed explainers). (1) **"From your schedule"** block (`calc-block calc-schedule`). (2) **"Quick Cost Estimator"** block (`calc-block`, a tinted slab). (3) **"Where the numbers come from"** notes block. At 1280px the estimator row is a 4-column grid `2fr 1fr 1fr 1fr` (Item | Days | Rate | Subtotal) with a column-caption header strip; at ≤820px each row stacks to one column with visible labels and a hairline divider between line items.

**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Schedule block | h3 | heading | `From your schedule` | – | – |
| Schedule block | 4 stat cards | `.bd-stat` | `18` shoot days · `64` scenes · `92 3/8` pages · `11` locations | derived from scenes | only when scenes exist |
| Schedule block | hint | text | "Every scene has a day. This is your shoot length." / "18 scheduled days, with 6 scenes still unscheduled — so this is a floor, not the final count." | – | singular/plural forms |
| Schedule block | songs hint | text | "Plus 3 days for 2 songs whose scenes are not on the board yet. Songs are planned before their scenes exist, so the scene count cannot see those days — 21 is the figure to budget." | – | only if uncounted song days |
| Schedule block | button | `mini-btn` | `USE 21 DAYS IN THE ESTIMATE` | fills ONLY empty Days fields on rows that have an item or a rate; toast "N lines set to 21 days; M you had already set were left alone." / "Every line already has days set — nothing was overwritten." / "Pick an item or set a rate on a line first, then this fills its days." | hidden if no days |
| Estimator | h3 | heading | `Quick Cost Estimator` | – | – |
| Estimator | hint | text | "Add line items, set days × daily rate, get a running total. Saves to your browser only. Click PRINT to keep a hard copy." | – | – |
| Estimator | header strip | captions | `Item` `Days` `Rate (₹/day)` `Subtotal` | decorative, aria-hidden | hidden ≤820px |
| Row | Item select | select | first option `Pick item or type below…`, then 52 presets (`ARRI Alexa Mini`, `Sony Venice 2`, `RED Komodo`, `Cooke S4 lens kit`, `HMI 2.5K`, `Dolly + 30ft track`, `Generator 30 KVA`, `DOP`, `1st AD`, `Gaffer`, `DI / color grade`, `VFX shot`, `Other (custom)` …) | change → recompute + save | – |
| Row | Custom name | text input | placeholder `or type your own…` | wins over the select | – |
| Row | Days | text, decimal | placeholder `Days` | accepts `2.5`, `1,20,000`, `₹18k`, `2L` (parseNum) | – |
| Row | Rate | text, decimal | placeholder `₹/day`; label `Rate (₹ per day)` | – | – |
| Row | Card-rate note | mono accent line under rate | "Rate card 2024-25: 25,000 – 35,000" or "Checked 2026-09-29: ₹25,000/day · card 2024-25 said 40,000 – 55,000 — about 1.6x more. The checked figure is one vendor's list price and may be body-only; budget the band until you have confirmed what it includes." or "Rate card 2024-25: … · no current Chennai rate found" | never auto-fills a number | empty hides |
| Row | Subtotal | output | `₹ 0` → `₹ 1,20,000` (right-aligned mono accent, rounded field) | aria-label "Subtotal for ARRI Alexa Mini: ₹ 1,20,000" | – |
| Actions | buttons | `mini-btn` | `+ ADD ITEM` · `+ ADD 5` · `PRINT` · `RESET`(danger) | add rows / `window.print()` / reset opens confirm | – |
| Grand | row | big total | label `GRAND TOTAL`; value `₹ 25,65,000` + caption `across 12 line items · ≈₹ 25.65 L` | `aria-live=polite`; "≈" only ≥ ₹1 lakh | – |
| Notes | h3 + 2 paragraphs | text | `Where the numbers come from` / "Preset rates are Chennai 2024-25. 6 were re-checked on 2026-09-29 and are shown with that date — next to the 2024-25 band, not over it, because the checked figures come in well under it and it is not settled why. 4 more were looked for and found published nowhere, so the 2024-25 figure stands and says so on the line. They are a starting point for a line, not a quote — every one of them is editable." / "The full rate tables — camera, crew, post, equipment — are in the **craft library**. Shoot days come from the **stripboard**, which reads the scenes you broke down in the **breakdown**." | links → `library.html#equipment`, `stripboard.html#stripboard`, `breakdown.html#scenes` | – |

**Lists & tables / cards** Estimator row columns: Item (select over custom input) | Days | Rate (₹/day) | Subtotal. Example row: `ARRI Alexa Mini` | `18` | `25,000` | `₹ 4,50,000`; second row `DOP` | `18` | `20,000` | `₹ 3,60,000`; third `Bolex reversal stock - 3 rolls` (custom) | `1` | `4,600` | `₹ 4,600`. Page opens with 5 blank rows minimum.

**States** No scenes: schedule block shows h3, hint "No scenes yet. Break the script down first and this fills itself in — the estimator can then use your real shoot-day count instead of a guess." + `mini-btn` `GO TO THE BREAKDOWN`. Scenes but no shoot days: stats strip + hint "None of these scenes has a shoot day yet. Assign days on the stripboard and the estimator can use the real count." + `SCHEDULE ON THE STRIPBOARD`. No project / loading: no skeleton (instant, local). Locked-by-plan: none.

**Dialogs** Reset: danger confirm "Clear all calculator rows?". Toast on use-days (above).

**Print layout** `PRINT` prints the estimator on paper: the calc block alone as plain rows (item, days, rate, subtotal) and the GRAND TOTAL line; chrome, tabs, buttons hidden (print.css).

**Sample data** see rows above; grand total `₹ 25,65,000 across 12 line items · ≈₹ 25.65 L`; schedule: 18 shoot days, 64 scenes, 92 3/8 pages, 11 locations.

**Mobile (390px)** Rows stack: Item select, custom input, Days, Rate (+ note), Subtotal, each with visible label; hairline between items. Stats strip wraps 2×2. Action buttons wrap. Tab strip scrolls sideways.

**Stitch prompt** Design a dark violet (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, 16px radius, pill buttons) "Budget" page. Top band, then eyebrow "Budget & People · what it costs", title "Budget.", a sideways-scrolling tab strip (Estimate selected, filled violet pill; Petty cash, Cost report, Crew payments, Top sheet, Schedule impact, Versions, Wage table, Export). Card 1 "From your schedule": four stat tiles (18 shoot days, 64 scenes, 92 3/8 pages, 11 locations), helper text, pill button "USE 21 DAYS IN THE ESTIMATE". Card 2 "Quick Cost Estimator": column header Item/Days/Rate (₹/day)/Subtotal; rows with a preset dropdown over a custom-name input, days field, rate field with a small mono violet rate-card hint, and a right-aligned mono subtotal "₹ 4,50,000"; buttons + ADD ITEM, + ADD 5, PRINT, RESET; big GRAND TOTAL "₹ 25,65,000 across 12 line items". Footer note block "Where the numbers come from" with three inline links.

### Budget · Petty cash (`budget.html#expenses`)

**Purpose** Log daily cash expenses and cash floats issued to people. · **Who/when** Production manager / accountant on set (quick-add tuned for a phone). · **Data source** `fms_costs_v1` (`expenses`, `floats`), contacts (`fms_contacts_v1`), `calendarDays()` for day options.

**Layout** Intro → 5 stat cards → "Log an expense" card → "Floats — cash issued to a person" card → "Balance by person" table → collapsible float log → "Expense log" grouped by date. One column, max-width page column; at 1280px stats in a row, quick-row pairs side by side; at 390px everything single column, amount input large.

**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Intro | h2 / deck | text | `Petty cash` / "Every rupee that leaves a pocket on the shoot, logged the day it goes. Issue floats to whoever carries cash, log what they spend, and the balance in each hand is worked out for you." | – | – |
| Stats | 5 cards | stat | `₹ 50,000` floats issued · `₹ 18,450` spent · `₹ 31,550` cash in hand · `₹ 0` owed back to people · `14` entries / `entry` | derived | – |
| Expense form | h3 | – | `Log an expense` | – | – |
| | Amount | text decimal, required, large | label `Amount (₹, bill total)`, placeholder `e.g. 1,850 or 2k` | autofocus returns here after add | – |
| | Date | date | `Date` | defaults to today / last used | – |
| | Category | radio chips | legend `Category`: `Batta` `Food` `Transport / fuel` `Location` `Props` `Misc` (default Food) | – | – |
| | Paid by | select | `Paid by` options: `Office / producer — no float`, then `Name — Role` per contact | remembered for the visit | – |
| | Shoot day | select | `Shoot day`: `Not a shoot day`, `Day 3 · 2026-11-04` … | remembered | – |
| | Paid with | radio chips | legend `Paid with`: `Cash` `UPI` `Card` (Bank transfer excluded) | remembered | – |
| | Budget line | select | `Budget line`: `Not on a budget line`, `ARRI Alexa Mini · ₹ 4,50,000` … | – | – |
| | Details | `<details>` | summary `Bill details — GST, vendor, receipt` containing: `GST in the bill` (No GST/5%/12%/18%/28%), `Vendor`, `Vendor GSTIN` (placeholder `15 characters`, maxlength 15), `Receipt link` (url, `https://… (a photo in your Drive)`), `Paid by someone not in contacts` (`a name — used instead of the list above`), `Note` | – | folded by default |
| | Submit | primary btn | `ADD EXPENSE` | toast "₹ 1,850 logged under Food." (2s) ; focus back to amount | invalid amount: toast error `Type the amount first — "1850", "1,850" and "1.85k" all work.`; bad GSTIN: `That GSTIN does not look like 15 characters of the usual shape — saved as typed; check it against the bill.` |
| Float form | h3 | – | `Floats — cash issued to a person` | – | – |
| | fields | – | `To` (`Pick a person…`), `Amount (₹)`, `Date`, `Method` (Cash/UPI/Card/Bank transfer), `Or a name not in contacts` | – | – |
| | button | btn | `ISSUE FLOAT` | error toast `A float needs a person and an amount.` | – |
| Balance table | caption/cols | table | `Balance by person`: Person · Issued · Spent · Balance | row class owed → `₹ 1,200 owed back` | only if floats exist |
| Float log | details | summary | `3 floats issued` / `1 float issued`; rows `₹ 20,000` · `to Murugan — Production Manager · 2026-11-02 · Cash` + `×` (aria "Delete this float") | confirm | – |
| Log | h3 | – | `Expense log` | – | – |
| Day group | header | – | date (or `No date`) + day total `₹ 4,200` | newest first | – |
| Log row | row | – | amount mono · "Food · Day 3 · Murugan · Cash · GST 5% ₹ 88 · Annapoorna Caterers (33ABCDE1234F1Z5)" + optional note line + `receipt` link + `×` | delete → undo toast `Expense of ₹ 1,850 deleted.` `UNDO` | – |

**Lists & tables / cards** Log row example: `₹ 1,850` | `Food · Day 3 · Murugan · Cash` | `×`. Balance row example: `Murugan` | `₹ 20,000` | `₹ 14,300` | `₹ 5,700`.

**States** Empty log: "Nothing logged yet. The first expense you add above appears here, under its date." No contacts: person selects show only the none option. Errors via toasts above. No plan lock.

**Dialogs** `Delete this float? The balance in that person's hand is worked out again without it.` (danger confirm).

**Sample data** Floats: Murugan (Production Manager) ₹20,000 cash 2 Nov; Kavitha (Costume) ₹10,000 UPI. Expenses: 4 Nov Food ₹1,850 Annapoorna Caterers GST 5%; 4 Nov Transport / fuel ₹3,200 Murugan Cash; 3 Nov Batta ₹6,000.

**Mobile (390px)** Quick-add card stacks; category and payment chips wrap; submit full-width; log rows are 3-column (amount | text | ×).

**Stitch prompt** Petty-cash tab of a dark violet film-budget app (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, 16px radius, pills). Heading "Petty cash" with a one-line deck, five stat tiles (floats issued, spent, cash in hand, owed back, entries). A "Log an expense" card built for a phone: large amount field first, date, Category chips (Batta, Food, Transport / fuel, Location, Props, Misc), Paid by and Shoot day dropdowns, Paid with chips (Cash, UPI, Card), Budget line dropdown, a collapsed "Bill details — GST, vendor, receipt" disclosure, filled violet pill "ADD EXPENSE". Second card "Floats — cash issued to a person" with To, Amount, Date, Method, "ISSUE FLOAT". Then a "Balance by person" table and an "Expense log" grouped under date headers with day totals, rows with mono rupee amounts and × delete.

### Budget · Cost report (`budget.html#actuals`)

**Purpose** Estimate vs actual, line by line, with contingency. · **Who/when** Line producer, during shoot. · **Data source** estimate rows + `fms_costs_v1` (`expenses`, `payments`, `lines` dept map, `settings.contingencyPct`).

**Layout** Intro → contingency card → 6 stat cards → optional red-ruled over-budget alert → one wide table grouped by department (tbody per department) → tax note. Table scrolls sideways at 390px (`cx-scroll`).

**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Intro | h2/deck | – | `Cost report` / "The estimate against what has actually gone out — expenses on each line plus crew payments — with the variance and how much of each line is used. Worked out fresh every time; nothing here is stored." | – | – |
| Card | Contingency | text decimal | label `Contingency (% of the estimate)`, hint "Usually 10%. It is added on top of the estimate; spending past the estimate eats into it." | change → saves `contingencyPct` | – |
| Stats | 6 cards | – | `₹ 25,65,000` estimate · `₹ 2,56,500` contingency 10% · `₹ 6,40,000` actual, with GST · `₹ 5,95,000` actual, without GST · `₹ 21,81,500` left / over budget (`−₹ …`) · `23%` used | – | variance negative → "over budget" |
| Alert | note | `cx-alert` | strong `2 lines are over budget` + list `Camera: ARRI Alexa Mini — ₹ 5,00,000 against ₹ 4,50,000` (`(no line in the estimate)` if unbudgeted) | – | hidden if none |
| Table | columns | table | caption `By department and line`; headers `Line · Department · Estimate · Actual · Excl. GST · Variance · Used` | – | – |
| Table | dept header row | rowgroup | `2200 · Camera` with dept totals | – | over → variance in danger colour |
| Table | line row | – | name (+ red `OVER` flag), Department select (`1100 Story & screenplay` … `4100 General & other`) or hint `not in the estimate`, estimate, actual, excl. GST, variance, `%` + thin progress bar | select change moves the line's department | `is-over` red rule |
| Table | tfoot | – | `Contingency 10%` row; bold `Total` row | – | – |
| Note | hint | – | "GST paid on bills: ₹ 22,400. TDS withheld on crew payments: ₹ 18,000 — owed to the income-tax department, and counted in the actual because it is part of the fee. An expense is logged as the bill total, tax included; the GST share is worked out from its rate." | – | – |

**Departments (acct · label · group):** 1100 Story & screenplay, 1200 Producers, 1300 Direction, 1400 Cast (above the line); 2100 Production crew, 2200 Camera, 2300 Lighting & grip, 2400 Sound, 2500 Art, costume & make-up, 2600 Locations, 2700 Transport & power, 2800 Food & batta (below the line — production); 3100 Post, music & VFX; 4100 General & other.

**Lists & tables** Example line row: `ARRI Alexa Mini` | `Camera` select | `₹ 4,50,000` | `₹ 5,00,000` | `₹ 4,76,190` | `−₹ 50,000` | `111%` bar full.

**States** Empty: "Nothing to report yet. Price some lines in the estimate, then log what you spend — this compares the two." + `GO TO THE ESTIMATE` (`#estimate`).

**Dialogs** none. **Sample data** as above.

**Mobile (390px)** Stats wrap 2-up; table scrolls horizontally inside its card; contingency field full width.

**Stitch prompt** "Cost report" tab in dark violet UI (#120f1c, #1b1727 cards, #9575f8, Catamaran, 16px radius). Deck line, a card with a "Contingency (% of the estimate)" field, six stat tiles (estimate ₹ 25,65,000, contingency 10%, actual with GST, actual without GST, left, % used), a red-ruled alert "2 lines are over budget" with a bullet list, then a wide table "By department and line": department group rows ("2200 · Camera") with totals and indented line rows (name with a red OVER pill, department dropdown, Estimate, Actual, Excl. GST, Variance, Used % with a thin progress bar). Footer rows Contingency and bold Total; a small-print tax note about GST and TDS. Mono tabular figures, right-aligned.

### Budget · Crew payments (`budget.html#crew`)

**Purpose** Per-person fee, advances ledger, TDS, settlement sheet. · **Data** contacts, `fms_costs_v1` (`crew`, `payments`), `wages.fefsi.json` hints, day-out-of-days and call sheets for derived days.

**Layout** Intro → 4 stat cards → per-department blocks (`h3` department name, then a `<details>` card per person). Closed summary row: name · "Role · Department" · due-chip. Open body is a form grid.

**Elements**
| Element | Type | Exact text | Behaviour |
|---|---|---|---|
| h2/deck | – | `Crew payments` / "What each person was promised, what they have had, and what is still owed. Days come from the day out of days for the cast and from the call sheets for everyone else, unless you type them." | – |
| Stats | 4 | `₹ 9,60,000` fees agreed · `₹ 4,20,000` paid · `₹ 5,40,000` still due · `₹ 48,000` TDS to deposit | – |
| Summary | row | name; `1st AC · Camera`; due chip `₹ 24,000 due` / `settled` / `overpaid ₹ 2,000` / `no fee set` | toggles open; open state remembered for visit |
| Fields | select | `Fee basis`: `Per day` / `Lump sum` | – |
| | text | `Agreed fee (₹ per day)` or `Agreed fee (₹, lump)` | – |
| | select | `Wage-table hint` (`None` + crafts), hint text e.g. "Camera assistant: No published figure … Set your own on the wage table tab." or "…/day — reported for the 2022 MoU, EXPIRED. Confirm with your union." | – |
| | button | `USE ₹ 1,500 AS THE FEE` (shown when a bata exists and fee basis is per day) | sets fee; toast "Fee set from the wage table — confirm it with the person and the union." |
| | text | `Days worked` (disabled for lump; hint "From the call sheets. Type a number to override." / "You set this. The call sheets say 12." / "Nothing to count from yet — type the days." / "A lump sum does not count days.") | – |
| | select | `TDS deducted` (None/1%/2%/10%) hint "194J professional fees are usually 10%; 194C contracts 1–2%. Check with your accountant." | – |
| | select | `Budget line it is paid from` | – |
| Summary list | dl | `Gross fee` `TDS 10%` `Net payable` `Paid so far` `Balance due` / `Overpaid` | derived |
| Ledger | h4 | `Advances and payments`; rows `₹ 9,000` · `2026-11-02 · Bank transfer · advance` + `×`; empty `Nothing paid yet.` | delete confirm |
| Payment form | – | `Amount paid (₹, after TDS)`, `Date`, `Method` (default Bank transfer), `Note` (`advance, final settlement…`); buttons `RECORD PAYMENT`, `PRINT SETTLEMENT` | error toast `Type the amount paid.` |

**States** No contacts: "No contacts yet. Add the unit on the Cast & Crew page and each person gets a ledger here." + `GO TO CAST & CREW`. **Dialogs** `Delete this payment from the ledger?`.

**Print — Crew settlement sheet (one page)** Eyebrow `<Film title> · Crew settlement`; h1 person name; sub "Role · Department · phone"; table (Fee `₹ 2,000 per day × 12 days (from the call sheets)`, Gross, `TDS deducted (10%)`, Net payable); table caption `Paid` with columns Date · Method · Note · Amount, rows, tfoot `Total paid`, bold `Balance due`/`Overpaid`; at foot "Received the above in full settlement." with three signature lines `Signature`, `Date`, `For the production`. Only this document prints (`body.cx-printing`).

**Sample data** Ravi Shankar — 1st AC, Camera, ₹2,000/day × 12 = gross ₹24,000, TDS 10% ₹2,400, net ₹21,600, paid ₹9,000 (2 Nov, bank, advance), balance ₹12,600.

**Mobile** Cards full width; quick-row pairs stack; payment log rows 3-col.

**Stitch prompt** "Crew payments" tab, dark violet (#120f1c/#1b1727/#9575f8, Catamaran, 16px radius). Deck sentence, four stat tiles (fees agreed, paid, still due, TDS to deposit). Grouped by department heading (Camera, Sound, Production…), each person is a collapsible card whose summary row shows name, "1st AC · Camera" and a right chip "₹ 12,600 due". Expanded: Fee basis (Per day/Lump sum), Agreed fee, Wage-table hint dropdown with grey hint and a small pill "USE ₹ 1,500 AS THE FEE", Days worked, TDS deducted, Budget line; a five-row summary (Gross fee, TDS 10%, Net payable, Paid so far, Balance due); "Advances and payments" log with × deletes; a payment form (Amount paid, Date, Method, Note) and pills RECORD PAYMENT and PRINT SETTLEMENT.

### Budget · Top sheet (`budget.html#topsheet`)

**Purpose** One-page financier summary above/below the line. · **Data** estimate lines + dept map + contingency.

**Layout** Intro → (if lines) primary pill `PRINT TOP SHEET` → one card containing the document.

**Document content** Eyebrow `Budget top sheet · <Film>`; h1 = grand total `₹ 28,21,500`; sub "≈₹ 28.22 L · Prepared 2026-10-14 from 12 estimate lines." (≈ only ≥₹1 lakh); table `Acct | Department | Estimate` with group header rows `Above the line` / `Below the line — production` / `Below the line — post` / `Below the line — other`, department rows (`2200 | Camera | ₹ 4,50,000`), per-group `Total above the line`; tfoot rows `Above the line ₹ 6,00,000 · 23%`, `Below the line … · 77%`, `Subtotal`, `Contingency 10%`, bold `Grand total`; closing hint "Rates are a starting point, not quotes: the Chennai card is 2024-25 and crew rates have no current union floor."
**Intro text** `Top sheet` / "The one page a financier asks for: department totals, above and below the line, contingency and the grand total — folded from the estimate. Move a line to another department on the cost report."
**Empty** "No priced lines yet. The top sheet fills itself from the estimate." + `GO TO THE ESTIMATE`.
**Print** The document alone on A4 (title large, table with hairline rows, bold total).
**Mobile** Document card scrolls table if needed; print button full width.

**Stitch prompt** Dark violet "Top sheet" tab: deck line, filled violet pill "PRINT TOP SHEET", and one card styled like a paper financier summary: tiny eyebrow "Budget top sheet · <Film>", huge grand-total "₹ 28,21,500", subline "≈₹ 28.22 L · Prepared … from 12 estimate lines", then a table Acct | Department | Estimate with group header rows (Above the line, Below the line — production, — post, — other), department rows with 4-digit account numbers, group total rows, and footer rows Above the line ₹ 6,00,000 · 23%, Below the line, Subtotal, Contingency 10%, bold Grand total. Mono right-aligned figures; small disclaimer at the bottom.

### Budget · Schedule impact (`budget.html#schedule`)

**Purpose** What a shoot day costs and what cutting scenes really saves. · **Data** scenes/shoot days; `schedule-impact.js`; per-line `scales` flag stored in `fms_costs_v1.lines`.

**Layout** Intro (with role-lens row) → 5 stat cards → collapsible "Which lines scale" card → "The shoot days" card/table → "If we cut…" card/table.

**Elements** Lens row: label `Start where you work` + buttons `Producer` (→ `#topsheet`, title "Top sheet: above and below the line, contingency, grand total"), `Line producer` (→ `#actuals`), `1st AD` (→ `#schedule`). Intro `Schedule impact` / "What a shoot day costs, worked from the lines you priced per day, and what cutting a scene would really save. Nothing here is stored except which lines you mark as scaling with the shoot." Stats: `18` shoot days · `6` unscheduled · `₹ 1,35,000` a shoot day costs · `7 lines` scale with the shoot · `₹ 25,65,000` estimate. Hint when no scaling: "No estimator line is priced at exactly 18 days, so no line is taken to scale with the shoot yet. Mark the lines below that do (crew, camera package, transport) and the figures follow." Details summary `Which lines scale with the shoot · 7 of 12`, hint "Automatic takes a line priced at exactly 18 days as scaling. Override it where that is wrong: a lens package for the whole shoot scales, a one-day stunt does not."; table `Line | Days | Rate | Treat as` with select options `Automatic · scales`, `Scales with shoot days`, `Fixed cost`. Card `The shoot days` table `Day | Scenes | Pages | Day cost` (`Day 3 | 4 | 5 2/8 | ₹ 1,35,000`). Card `If we cut…`, hint "Tick scenes. A day is saved only when every scene on it is ticked.", table `Cut | Scene | Pages | What it does alone` with checkbox and note: `frees Day 5 — saves ₹ 1,35,000` / `Day 3 still shoots (3 other scenes) — a share of ₹ 33,750, not a saving` / `not scheduled`; scene label `Sc 12 · INT · Lalitha's house · NIGHT`; result line (role=status) `2 scenes cut: frees 1 day (Day 5), saving ₹ 1,35,000. Estimate ₹ 25,65,000 → ₹ 24,30,000.` or `… frees no shoot day, so the estimate does not move.` or `Nothing ticked.`; `CLEAR` button when ticked.
**States** No scenes: "No scenes yet. Break the script down and give scenes a shoot day on the stripboard; this tab then works out what the schedule costs." + `GO TO THE STRIPBOARD`. No days: "None of the 64 scenes has a shoot day yet. Assign days on the stripboard and the cost of a day appears here." + `SCHEDULE ON THE STRIPBOARD`.
**Mobile** tables use `scene-table` styling and scroll; stats wrap.

**Stitch prompt** Dark violet "Schedule impact" tab (#120f1c, #1b1727, #9575f8, Catamaran, pills, 16px). Intro with three role pills "Start where you work: Producer / Line producer / 1st AD". Five stat tiles (18 shoot days, 6 unscheduled, ₹ 1,35,000 a shoot day costs, 7 lines scale, ₹ 25,65,000 estimate). A collapsible card "Which lines scale with the shoot · 7 of 12" (table with Treat as dropdowns), a card "The shoot days" (Day, Scenes, Pages, Day cost) and a card "If we cut…" with a checkbox table whose last column explains "frees Day 5 — saves ₹ 1,35,000" or "Day 3 still shoots — a share of ₹ 33,750, not a saving", plus a bold result sentence and a CLEAR pill.

### Budget · Versions (`budget.html#versions`)

**Purpose** Lock immutable budget snapshots and compare to now. · **Data** `fms_costs_v1.versions`.

**Elements** Intro `Versions` / "Lock the budget as it stands — before a schedule change, before the financier sees it — and compare any later state against it. A locked version never changes; delete it if you no longer want it." + lens row. Form card: `Name` (placeholder `Pre-schedule lock`), `Note` (`Why you are locking it`), primary pill `LOCK THIS BUDGET · ₹ 28,21,500`. Hint `Nothing locked yet.` Version cards newest first: bold name, grey ` locked 2026-10-12`, right mono `₹ 28,21,500 · 18 days`, optional note, buttons `COMPARE WITH NOW`/`HIDE COMPARISON`, `DELETE` (danger; toast `Deleted “Pre-schedule lock”.` UNDO). Comparison panel: "Estimate then ₹ 25,65,000, now ₹ 26,10,000 — +₹ 45,000." ; table `Department | Then | Now | Change`; hints `Added since: …`, `Removed since: …`, `Repriced: Gaffer (+₹ 6,000)`.
**Empty** "No priced lines yet. Price the estimate, then lock a version of it here." + `GO TO THE ESTIMATE`.
**Mobile** form fields stack; cards full width.

**Stitch prompt** Dark violet "Versions" tab: deck, lens pills, a form card (Name, Note, filled pill "LOCK THIS BUDGET · ₹ 28,21,500"), then stacked version cards each with bold name, grey "locked 2026-10-12", right-aligned mono total "₹ 28,21,500 · 18 days", note text, outline pills COMPARE WITH NOW and red DELETE; one expanded card shows a comparison sentence and a Department/Then/Now/Change table plus "Added since / Removed since / Repriced" lines.

### Budget · Wage table (`budget.html#wages`)

**Purpose** Keep the unit's agreed daily bata per craft (union MoU expired). · **Data** `wages.fefsi.json` (16 crafts: Camera assistant, Light technician / lightman, Grip / dolly / crane operator, Sound assistant / boom, Art assistant, Set worker — carpenter, painter, moulder, Costumer / dresser, Make-up artist, Hair dresser, Assistant director, Production assistant / manager's assistant, Driver, Unit cook / catering, Junior artist (extra), Stunt artist, Dancer) + `wageOverrides`.
**Elements** Intro `Crew wage table` / "A place to keep the daily bata your unit actually agreed, per craft, with the call hours and overtime rule beside it. The crew payments tab offers these as hints." Amber/expired alert: strong `Last published: FEFSI–TFPC wage MoU, 2022 — EXPIRED`, paragraphs ("Last published agreement (2022 MoU) — EXPIRED 9 March 2025, in Madras High Court mediation. No current union floor exists. Confirm every figure with your union before you budget it." and the rules note about call-time/overtime), a list of source links with "says" text. Table caption `Per craft · valid 2022-03 to 2025-03-09 · checked <date>`; columns `Craft | Published | Your bata (₹/day) | Call hours | Overtime rule | (reset)`; row: `Camera assistant` + grey dept, `not published` or `₹ 1,200 (reported, expired)`, three text inputs (placeholders `—`, `—`, `e.g. ½ bata per 2 h`), `↺` reset button (aria "Clear your figures for …") only when overridden; overridden rows tinted.
**Mobile** table scrolls inside card.

**Stitch prompt** Dark violet "Crew wage table" tab: heading + deck, an amber-ruled alert "Last published: FEFSI–TFPC wage MoU, 2022 — EXPIRED" with explanatory paragraphs and source links, then a table "Per craft · valid 2022-03 to 2025-03-09" with columns Craft (with grey department), Published ("not published"), editable Your bata (₹/day), Call hours, Overtime rule (placeholder "e.g. ½ bata per 2 h") and a ↺ reset icon; 16 crafts from Camera assistant to Dancer; user-edited rows get a faint violet tint.

### Budget · Export (`budget.html#export`)

Intro `Export` / "Spreadsheet files your accountant, line producer or budgeting software can open. The budget uses the account-number layout Movie Magic Budgeting reads — account, description, amount, units, rate, subtotal." Three cards (auto-fit, ≥15rem each): `Budget` — "12 lines in 6 accounts, with contingency and the grand total." + primary `DOWNLOAD BUDGET CSV`; `Actuals` — "Estimate, actual with and without GST, TDS, variance and % used, per line and department." + `DOWNLOAD ACTUALS CSV`; `Expense log` — "14 expenses, with GST, vendor GSTIN and receipt links — for the books." + `DOWNLOAD EXPENSES CSV`. Files named `<film-slug>-budget-2026-10-14.csv` (UTF-8 BOM so ₹ and Tamil open in Excel). Mobile: cards stack.

**Stitch prompt** Dark violet "Export" tab: heading, deck about Movie Magic account-number layout, and three equal cards (Budget, Actuals, Expense log) each with a heading, one grey explanatory line with live counts and a pill download button (first filled violet "DOWNLOAD BUDGET CSV", others outline).

---

## 2. CAST & CREW — `contacts.html`

Header (both tabs): eyebrow `Cast & Crew · people, and the day they are called`; h1 `Cast & Crew.`; deck "Everybody on the film, once, with a department and a number. The call sheets are built from this list and from the scenes in the breakdown — so a name is typed here and nowhere else."; stat strip: `34` people · `12` in the cast · `9` departments · `3` call sheets (singular forms `person`, `department`, `call sheet`). Tabs (tabs.js): **Cast & Crew** (`#contacts`, label from navigation) and **Call sheets** (`#call-sheets`). Command palette deep link `contacts.html#c-<id>` lands on a person card. Path bar below.

### Contacts · Unit list (`contacts.html#contacts`)

**Purpose** One record per person, grouped by department. · **Who/when** Production office, throughout. · **Data** `fms_contacts_v1` (`contacts`, `callSheets`). Fields: name, role, department, phone, email, notes. Departments (fixed order): Cast, Direction, Camera, Sound, Art, Costume, Makeup, Production, Post (unknown stored values appended to the select).

**Layout** `h2 The unit list`, sub "Grouped by department. The colour down the side is the department, nothing else." Then department blocks: a head bar (hue-ruled) with name + count (`5 people`), followed by person cards (`article.ct-person`, 4px left rule in the department's hue: Cast=feature, Direction=plan, Camera=shorts, Sound=visualize, Art=library, Costume=shoot, Makeup=visualize, Production=plan, Post=shorts). Finally `+  Add person`. Person card, top row: Name input, Role input, Department select, `✕` remove; second row (auto-fit ≥200px columns, 3 across at 1280, 1 at 390): Phone, Email, Notes.

**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Card | Name | text | placeholder `Name` | autosave on input | – |
| Card | Role | text | placeholder `Role or job — "Ravi", "1st AC", "Line Producer"` | – | – |
| Card | Department | select | 9 departments | moves card to that group on re-render | – |
| Card | Remove | icon btn danger | `✕` title `Remove this person` | confirm | – |
| Card | Phone | tel | label `Phone`, placeholder `+91 …` | validity hint `Not a number anyone can dial` (red border, aria-invalid) when <6 digits or bad chars; saved anyway | – |
| Card | Email | email | label `Email`, placeholder `name@example.com` | hint `Not an email address` | – |
| Card | Notes | text | label `Notes`, placeholder `Agent, dietary, travel — anything the office needs` | – | – |
| Foot | Add | btn | `+  Add person` | adds blank card | – |

**Dialogs** `Remove <name>? They come off every call sheet too.` (danger confirm).
**States** Empty (teaching state, `bd-empty`): glyph `◒`; h2 `Start with the people`; "A unit list is one line per person: who they are, what they do, and how you reach them at eleven at night when the location falls through. Everything a production office does runs on this list."; three numbered steps — `1 Name them` "Name, the role they play or the job they do, and the department they sit in." · `2 Reach them` "One phone number and one email. The number is the one that matters on a shoot day." · `3 Call them` "Build a call sheet, tick the scenes you are shooting, and give each person a time."; example strip `Kaaka Muttai` "was shot with two children who had never acted, which means the call sheet carried a guardian beside each of them. The list is not only the crew — it is everyone who has to be somewhere at a time."; primary pill `+  Add the first person`.
**Sample data** Cast — Ilango R. · "Ravi (lead)" · +91 98400 12345 · ilango@example.com · "Vegetarian; travels from Madurai"; Camera — Meenakshi S. · "DOP" · +91 98410 22334 · meenakshi@example.com; Production — Murugan K. · "Production Manager" · +91 98420 33445.
**Mobile** department block heads full width; top row wraps (name, role, dept each full width, ✕ right); reach fields one column.

**Stitch prompt** Dark violet (#120f1c, #1b1727, #9575f8, Catamaran, 16px radius, pills) "Cast & Crew" page: header with eyebrow, title, deck and four stat tiles (34 people, 12 in the cast, 9 departments, 3 call sheets); tab strip with "Cast & Crew" selected and "Call sheets". Section "The unit list" grouped by department: coloured head bar with name and "5 people", cards with a 4px coloured left rule — top row Name, Role, Department dropdown, ✕; below Phone (+91 …), Email (name@example.com), Notes. Red inline hint under a bad phone. A pill "+  Add person" at the end. Also design the empty state: ◒ glyph, "Start with the people", three numbered steps, a Kaaka Muttai example strip, filled pill "+  Add the first person".

### Contacts · Call sheets (`contacts.html#call-sheets`)

**Purpose** One call sheet per shoot day: date, times, place, scenes, who is called with their own time, route & safety, send by WhatsApp, print/PDF. · **Data** `fms_contacts_v1.callSheets` {id,title,date,generalCall,wrap,location,notes,sceneIds[],calls{contactId:'HH:MM'}}; scenes (read-only), `src/lib/locations.js` (recce record: address, parking, hospital, police, lat/lng — shared with Plan page), DPR wrap (`dpr.js`), `sun.js` (offline sunrise/sunset/golden hour), `recce-geo.js`, `callsheet-text.js`. Nothing about names/slugs is copied: sheets hold ids.

**Layout** `h2 Call sheets`, sub "One per shoot day. Tick the scenes you are shooting and the people you are calling; anyone without their own time is called at the general call. Print gives you the sheet on its own, on as few pages as it needs." Then one **sheet card** per day (`article.ct-sheet`), then `+  New call sheet`. Each card has two renderings built together: the **edit form** (`.ct-edit`, screen) and the **paper document** (`.ct-doc`, display:none on screen, shown in print).

**Edit form, top to bottom**
| Region | Element | Type | Exact label/text | Behaviour |
|---|---|---|---|---|
| Bar | Title | text | placeholder `Shoot day` | – |
| Bar | Export menu | action menu (right-aligned) | button `Export` → `Print this sheet`, `Save as PDF` (hint `this sheet only`) | print marks only this sheet |
| Bar | Delete | icon danger | `✕` title `Delete this call sheet` | confirm |
| Facts | 4 fields (auto-fit ≥180px) | date/time/time/text | `Date`, `General call` (time), `Planned wrap` (time), `Location` placeholder `Unit base — where everybody reports` | – |
| Schedule line | note (aria-live) | text | variants: "Day 4 on the schedule — the same date." · "The schedule has Day 4 on 4 November 2026, not this date. " + button `Use the schedule’s date` · "Day 4 on the schedule is 4 November 2026. " + `Use that date` · "These scenes are Day 4 on the stripboard, which has no date yet — set it on the Plan calendar." (link `plan.html#calendar`) · "These scenes are on days 3, 4 of the schedule, so the sheet’s date is the only one there is." | warn variant has left rule |
| Light | `dl` 4 cells | read-only | `Sunrise` `06:03`, `Sunset` `17:41`, `Golden · morning` `05:48–06:32`, `Golden · evening` `17:11–17:55`; note "Times at Marina Beach, IST. Golden hour: the sun between 4° below and 6° above the horizon." or "Times for Chennai (IST) — no location on this sheet has a pin yet. Add one under Route & safety." ; no date: "Give the sheet a date and its sunrise, sunset and golden hour appear here." ; late flag (role=note, left rule): "Wrap 19:30 is after sunset (17:41). Exterior scenes 12, 14 need the light — shoot them before 17:41." |
| Notes | textarea (2 rows) | – | label `Notes`, placeholder `Weather, parking, nearest hospital, anything the day needs` | – |
| Scenes | picker `h3 Scenes this day` | scrolling checklist (max-height 22rem) | rows: checkbox · scene no. · slug `EXT. Marina Beach — DAY` · pages `1 2/8`; none: "No scenes in the breakdown yet. **Build the scene list** and every scene appears here to be scheduled." | tick toggles |
| People | picker `h3 Who is called` | scrolling checklist grouped by department headers (hued) | row: checkbox + name + role, and a time input (placeholder `General`, disabled until ticked) | – |
| Route | `h3 Route & safety` | per-location `<details>` | summary: location name + chip `Pinned`/`No pin`. Fields: `Address` (`Where the van goes — a pin, a landmark, a street`), `Parking` (`Where the unit parks, and how far the carry is`), `Nearest hospital` (`Name, distance, casualty phone`), `Nearest police station` (`Station, and its number`), `Map pin` (`Paste a Google Maps link, or 13.0827, 80.2707`; status "Pinned at 13.0827, 80.2707" / "No pin yet — sunrise and sunset fall back to Chennai." / "No coordinates in that. Paste a Google Maps link, or two numbers like 13.0827, 80.2707."). Buttons `Use this device’s location` (if geolocation), link-button `Open in Maps`. Intro "Filed against the location, so every sheet and the Plan page’s recce card share them."; none: "Tick a scene with a location and its route and safety details appear here — and on the printed sheet." |
| Send | `h3 Send this sheet` | – | primary link `Send to WhatsApp`, `Share…` (if Web Share), `Copy text`; note "One message for the whole unit — WhatsApp asks which chat or group. 842 characters." Per-person list (called people): name, "Department · Role", call time (`06:30` or `07:00 (general)` or `General call`), button `WhatsApp` (if phone digits valid, link with that person's own message) else `Copy text`. Empty: "Call somebody above and each person gets their own message, with their own call time first." |

Toasts: `Call sheet copied — paste it into the unit group.` · `Could not reach the clipboard.` · `Copied Ravi’s call — there is no phone number to send it to.` · `Sharing did not open on this device. Use Copy text.` · `<place> pinned where this device is, to about N m.` · `Location permission was refused — paste a Maps link instead.` · `This device could not find where it is. Paste a Maps link instead.`
WhatsApp message structure (plain text, ≤3,800 chars): `*<Film> — <Title>*`, `Day 4 · 4 November 2026`, `General call: 06:30`, `Planned wrap: 18:00`, `Location: …`, `Map: <url>`, `Sunrise 06:03 · Sunset 17:41 (IST)`, `*Scenes (6 · 5 3/8 pages)*` lines `12 · EXT. Marina Beach — DAY · 1 2/8 pp`, `*Notes*`; per-person adds "Ravi, your call: *06:30*".

**Printed call sheet (the paper)** Only `.ct-doc` prints (edit form, shell, buttons hidden). Each sheet is one block with a 2px ink rule on top, one sheet per page (page-break after, never inside a row; table headers repeat). Top to bottom: eyebrow `Call sheet`; title (sheet title or `Shoot day`); 4-fact row (mono small label over bold value): `Date` `4 November 2026` (or `… (from the schedule)` / `Date not set`), `General call` `06:30` (`Not set`), `Location`, `Scenes` `6 · 5 3/8 pages`. If a date: second fact row `Sunrise · Sunset · Golden hour (am · pm) · Planned wrap`, a small line with the light note, and a bold flag paragraph with a 3px left rule if wrap is after sunset. Table caption `Scenes`: `Sc. | Set | I/E · D/N | Synopsis | Pages` (`12 | Marina Beach | EXT · DAY | Ravi meets Lalitha | 1 2/8`). Table caption `Called`: `Name | Role | Department | Call | Phone` sorted by department order then name; call shows own time, else `06:30 (general)` / `General call`; none: "Nobody is called on this sheet yet." Table caption `Route & safety`: `Location | Address · map | Parking | Nearest hospital | Nearest police` (`Not noted`, pin coordinates, underlined `Map` link). Notes block with `Notes` eyebrow. All black ink on white; hairline row rules. On screen the tables are hidden; on a phone they would scroll sideways.

**States** No contacts: "A call sheet calls people, so it needs the unit list first. Add somebody to **the unit list** and a shoot day becomes possible." No sheets: "No call sheets yet. One sheet is one shoot day: a date, a time, a place, the scenes, and who has to be there." then `+  New call sheet`. 
**Dialogs** `Delete call sheet <title>? The people and the scenes stay.` (danger confirm).
**Sample data** Sheet "Day 4 — Marina Beach": date 2026-11-04, general call 06:30, wrap 18:00, location "Marina Beach, near Lighthouse"; scenes 12, 14, 15; called: Ilango R. 06:30, Meenakshi S. 06:00, Murugan K. (general). Route: address "Kamarajar Salai, opp. Lighthouse", parking "Corporation lot, 200 m carry", hospital "Rajiv Gandhi GH, 4 km, 044 2530 5000", police "Marina Police Station, 044 2345 1234".
**Mobile (390px)** Facts one column; picker lists scroll inside 22rem; call-time inputs wrap to full width under the name; route grid one column; send list rows stack; export menu and delete stay top-right; paper tables scroll horizontally.

**Stitch prompt** Dark violet (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, pills, 16px) "Call sheets" tab. A sheet card: title input "Day 4 — Marina Beach", an Export dropdown (Print this sheet, Save as PDF) and a ✕. Four-field row Date, General call, Planned wrap, Location; an info line "Day 4 on the schedule — the same date."; a four-cell daylight strip (Sunrise 06:03, Sunset 17:41, Golden morning, Golden evening) with a small note and an amber flag about late wrap; Notes textarea; two scrolling checklists "Scenes this day" (checkbox, scene no, slug, pages) and "Who is called" (department headers, checkbox, name, role, time input "General"); "Route & safety" expandable per location with Address, Parking, Nearest hospital, Nearest police station, Map pin, "Use this device’s location", "Open in Maps"; "Send this sheet" with filled "Send to WhatsApp", "Share…", "Copy text" and a per-person list with WhatsApp buttons. Add a white printed-paper variant of the sheet.

---

## 3. SHOOT DAY — `shoot.html`

**Purpose** The page held on the floor: mark each scene of today shot / part / dropped. The ONE view that writes back to a scene (`scenes.shotState` + `shotAt`). · **Who/when** 1st AD, script supervisor, producer on set, on a phone or tablet. · **Data** `fms_scenes_v1` (fields `shotState`, `shotAt`, `shootDay`), `fms_locations_v1` (days, recce, DPR wrap), call sheets (planned wrap), `sun.js`. View state (`openDay`) is memory only.

**Designed at 390px and widened.** Single page column (`sd-main`, max wide measure, gutter), no tables, no tabs.

**Layout top-to-bottom** (1) Head: eyebrow `Shoot · today` (only when the day's date is today) else `Shoot · day 3 of 18`; h1 `Day 3.`; deck = long date `Wednesday, 4 November 2026` or "This day has no date yet — set one in the stripboard and the page can find it on the morning." (2) Stats row (3 cards, wrap, ≥8rem each): `2 / 5` scenes today · `3 1/8 / 5 2/8` pages today · `17 / 64` scenes in the film. (3) Locations line (mono, grey) `Marina Beach · Lalitha's house`. (4) Daylight card. (5) Day switcher: row of pill buttons `D1 D2 D3 …` (current = filled accent, `aria-current`; completed days = green border + muted text). (6) Scene card list. (7) Footer links. (8) Stage guide (production), collapsed.

**Daylight card** `dl` four cells (auto-fit ≥7.5rem): `Sunrise` `06:03`, `Sunset` `17:41`, `Golden · am` `05:48–06:32`, `Golden · pm` `17:11–17:55`; note "At Marina Beach, IST." or "For Chennai (IST) — Marina Beach has no map pin yet." plus button `Pin Marina Beach where this phone is` (only when fallback and geolocation exists; sets the recce lat/lng, toast `Marina Beach pinned here, to about 12 m.`; errors `Location permission was refused. Paste a Maps link on the call sheet instead.` / `This phone could not find where it is. Paste a Maps link on the call sheet instead.`). No date: "Sunrise and sunset appear once this day has a date." Flag (role=note, left rule): "Wrap 19:30 is after sunset (17:41). 2 exterior scenes need the light: 12, 14." or "… No exterior left to shoot today." (wrap = later of call sheet's planned wrap and DPR wrap).

**Scene card (`article.sd-card`, 4px left rule by state)** Top: mono scene number (`12`, `—` if none) + slug as the biggest text on the card (display font, `EXT. Marina Beach — DAY`, `NO LOCATION` fallback). Meta row (mono caps): `1 2/8 pages` + state word (`Shot`/`Part`/`Dropped`) when marked. Synopsis (small body) if present. Cast chips (pill, mono tiny): `Ravi` `Lalitha` or grey caps `No cast tagged`. Late flag text (when applicable): `Exterior · needs the light — shoot before sunset`. **Action row** (group, aria-label `Mark scene 12`): three equal-width buttons `Shot` `Part` `Dropped`, 48px min height; the active one is filled and `aria-pressed=true`; tapping the live one clears it (back to **not shot**, the 4th state, which has no button).

**Four shot states**
| State | Stored | Card | Button when on |
|---|---|---|---|
| Not shot | `''` | neutral grey left rule, no state word | none pressed |
| Shot (`Shot`, ok) | `shot` | green left rule | filled green, light text |
| Part (`Part`, warn) | `part` | amber left rule | filled amber |
| Dropped (`Dropped`) | `dropped` | dashed card frame, solid grey left rule, sunk ground, slug struck through | filled muted grey |
Unmarked buttons: outline with a visible border. Semantic ok/warn/muted colours only, plus words — never colour alone.

**Footer** `End of day → DPR` (→ `reports.html?day=3#dpr`, the Daily Production Report is written on Production Reports) and `Next: Edit Log →` (→ `edit.html#log`).

**Empty states** (head only: eyebrow `Shoot · today`, h1 `Shoot day.`, deck, one `.btn`): no scenes — "No scenes yet. Break the script down first and the day builds itself — this page is a view of the scene list, not a second copy of it." + `Open the Scene List →`; scenes but none on a day — "No scene is on a shoot day yet. Put them on days in the stripboard and they appear here, in the order you scheduled them." + `Open the stripboard →`.
**Interaction notes** Scenes appear in stripboard (shooting) order, never re-sorted. Marking re-renders and returns focus to the same button. No dialogs.

**Sample data** Day 3 · Wed 4 Nov 2026 · Marina Beach · Lalitha's house. Cards: Sc 12 `EXT. Marina Beach — DAY`, 1 2/8 pages, synopsis "Ravi waits; Lalitha does not come.", cast Ravi, Lalitha, state Shot; Sc 14 `EXT. Marina Beach — GOLDEN`, 2 pages, Part, late flag; Sc 15 `INT. Lalitha's house — NIGHT`, 1 6/8, not shot; Sc 16 `INT. Lalitha's house — NIGHT`, 3/8, Dropped.

**Mobile (390px) is the primary design:** one card per row, 16px side gutters, three 48px buttons across full width; ≥720px the list becomes two columns; stat cards wrap.

**Stitch prompt** Phone-first (390px) dark violet (#120f1c, #1b1727, #9575f8, Catamaran, 16px radius, pills) "Shoot day" screen for use on a film set. Eyebrow "Shoot · today", huge title "Day 3.", date line, three stat cards (2 / 5 scenes today, 3 1/8 / 5 2/8 pages today, 17 / 64 scenes in the film), locations line, daylight card (Sunrise, Sunset, Golden am/pm, small note, amber "wrap after sunset" flag), a wrapping row of day pills D1…D18 (current filled violet, finished with green outline). Then stacked scene cards with a 4px state-coloured left edge: mono scene number, slug line as largest text, "1 2/8 PAGES · SHOT", synopsis, cast chips, and a row of three full-width 48px buttons Shot / Part / Dropped (pressed one filled green / amber / grey; dropped card dashed with struck-through slug). Footer pills "End of day → DPR", "Next: Edit Log →".

---

## 4. EDIT LOG — `edit.html`

**Purpose** What the cut still needs vs what the set shot, scene by scene; the editor's one write is cut status + notes + pick-ups + links. The shoot day's marks and the shot list are read-only here. · **Who/when** Editor/post supervisor/producer after shooting began; desk page that also reads on a phone (no tables). · **Data** `fms_edit_v1` (per scene `{cut, note, links}`, `pickups`, `cuts`, dailies links by day), scenes (`shotState`), shot list `listShots()` (setups and ticks), stage guide post.

**Layout** Head → stats strip → (conflict box) → (orphan pick-ups box) → toolbar (filters + copy) → scene list (`#log`) → Cut versions section (`#cuts`, lazy chunk loaded when near viewport) → Dailies by shoot day (`#dailies`) → onward link → stage guide (post) + learn boxes (camera-to-cloud, proxy, 3-2-1 backup, checksum). Single column; scene rows one per line at all widths.

**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Head | eyebrow / h1 / deck | – | `Post · edit log`; `Edit log.` or `Ready to lock.` (when nothing owed and no conflict); deck "What the set got, against what the cut needs. The marks come from the shoot day, the setups from the shot list; only the cut column and the notes are written here." / ready: "Everything the cut needs is in the can and nothing it claims was dropped. Nothing here is stored — it is read from the shoot day’s marks and the shot list." | – | – |
| Stats | 5 cards | stat | `38 / 52` pages in the can · `7` scenes still owed (`scene still owed`) · `21` in the cut · `9` locked · `4` pick-ups open (`pick-up open`) | derived | – |
| Conflict | box (red rule) | section | h2 `One scene the set dropped and the cut still wants` / `2 scenes the set dropped and the cut still wants`; list `Sc 16 · INT Lalitha's house — NIGHT`; "Either the day out of days gets a pick-up day, or the cut lets the scene go. Decide it here, not in the grade." | – | only when conflicts |
| Orphans | box | section | h2 `One pick-up on a scene no longer in the list` / `3 pick-ups on scenes no longer in the list`; pick-up items; "Restore the scene from the Breakdown’s bin, or remove the pick-up here." | tick / remove | only when orphans |
| Toolbar | filter pills | toggle group `Show` | `All scenes · 52` · `Still owed · 7` · `In the can · 31` · `In the cut · 30` · `Cut out · 3` (counts live) | `aria-pressed`; in-memory filter | on = filled accent |
| Toolbar | button | `.btn` | `COPY PICK-UP LIST` (title "The unshot scenes, the part-shot scenes and every open pick-up, as text") | copies text; toast `Pick-up list copied` / error `Could not copy — select the text on the page instead`; if nothing owed copies "Nothing owed — every scene the cut needs is in the can." | – |
| List | empty filter | text | `Nothing matches this filter.` | – | – |

**Scene row (`article.el-row`, 4px left rule: owed=amber, locked=green, conflict=red, cut-out=grey and 78% opacity)** 
1. Head: mono scene no · slug (`EXT. Marina Beach — DAY`) · right-aligned `1 2/8 pp`.
2. Facts line (wraps): (a) **set's word badge** — read-only pill link to `shoot.html` (title "Marked on the shoot day — change it there"): `Shot` (green wash) / `Part` (amber wash) / `Dropped` (struck, muted) / `Not shot` (neutral); (b) **setups pill** — link to `visualize.html#shot-list`: `3 of 5 setups ticked` (amber outline when open) or dashed `no shot list`; (c) **cut select**, right-aligned: `Not in cut yet` · `In the cut` · `Locked` · `Cut out`.
3. Verdict sentence (only when something to say; conflict is red-ruled): "Dropped on the day, but the cut has it. One of those two is wrong." · "Shot, then cut. Coverage the film will not use." · "Dropped on the day. Mark it cut out, or the cut is waiting on nothing." · "Not shot yet." · "Part shot — pick-ups owed before this scene can lock." · "In the can on the set’s word; the shot list still has setups unticked."
4. Note textarea (1 row, auto-saves as typed): placeholder `Editor’s note — what the cut needs from this scene`.
5. Links block: small heading `Dailies`, list of anchors (label or URL host) each with `×`, and a form: URL input `Paste a link (Drive, Frame.io…)`, `Label (optional)`, `ADD LINK`. Bad link → error toast with the reason.
6. Pick-ups list (if any): each = checkbox + text + `×`; removing shows toast `Pick-up removed: <text>` with Undo.
7. Add pick-up form: input `Add a pick-up — an insert, a line, a wide` + `ADD`.

**Cut versions (`#cuts`)** h2 `Cut versions`; sub "Assembly, rough cut, fine cut. Each keeps its own notes pinned to a time, and the address of the file — the studio stores links, never footage." Each cut card: head with name (`Rough cut v1`), date, `×` (aria "Remove cut …"); links block headed `Where this cut lives`; note list (open notes first, each in time order; done ones struck): checkbox + mono timecode `0:42` + optional `Sc 12 — ` + text, `×`; empty `No notes on this cut yet.`; add-note form: timecode input (placeholder `0:42`; accepts seconds, M:SS, H:MM:SS), select `Any scene` / `Sc 12 · Marina Beach`, text `Note — trim the pause, swap the take`, `ADD NOTE`; button `COPY NOTES` (title "This cut’s notes as plain text for an email"; toast `Notes copied`). Invalid timecode toast: `That is not a timecode. Use seconds (42), 0:42 or 1:02:05.` Add-cut form: name `New cut — Assembly, Rough cut v1`, date (today), `ADD CUT`. Removing cut/note → toast `Cut removed: …`/`Note removed: …` with Undo.
**Dailies by shoot day (`#dailies`)** h2 `Dailies by shoot day`; for each shoot day an `h3 Day 3` and a link block (no heading).

**Onward** `Next: Deliverables →` (→ `deliverables.html#checklist`).

**States** No scenes (head only, `#log` kept so the nav fragment resolves): eyebrow `Post · edit log`, h1 `Edit log.`, deck "No scenes yet. This page reads the shoot day’s marks against the scene list, so break the script down first and come back when the cameras have rolled." + `Open the Scene List →`. Cut section shows only its heading until its chunk loads. No dialogs (undo toasts instead).

**Sample data** Stats 38 / 52 pages in the can, 7 owed, 21 in the cut, 9 locked, 4 pick-ups. Row Sc 14 `EXT. Marina Beach — GOLDEN`, 2 pp, badge `Part`, `1 of 3 setups ticked`, cut `Not in the cut yet`, verdict "Part shot — pick-ups owed before this scene can lock.", pick-up "Wide of Lalitha leaving, magic hour". Cuts: "Assembly" 2026-12-10 with note `1:14  Sc 12 — trim the pause before Ravi's line`.

**Mobile (390px)** Rows are one column; facts pills wrap to up to three lines; cut select drops under badges; filter pills wrap; touch targets 44px+.

**Stitch prompt** Dark violet (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills) "Edit log" page. Eyebrow "Post · edit log", title "Edit log." (or "Ready to lock."), deck, five stat tiles (38 / 52 pages in the can, 7 scenes still owed, 21 in the cut, 9 locked, 4 pick-ups open). A red-ruled conflict card, then filter pills (All scenes · 52, Still owed · 7, In the can · 31, In the cut · 30, Cut out · 3) and an outline pill "COPY PICK-UP LIST". Scene rows as cards with state-coloured left edge: mono number, slug, "2 pp"; a facts line with a green/amber/struck "Shot / Part / Dropped" badge linking to the shoot day, "1 of 3 setups ticked" pill, and a "Cut status" dropdown (Not in cut yet / In the cut / Locked / Cut out); a one-line verdict; Editor’s note textarea; Dailies links with ADD LINK; pick-up checklist with "Add a pick-up" and ADD. Below: "Cut versions" cards with timecoded notes (0:42) and "Dailies by shoot day".

---

## 5. DELIVERABLES — `deliverables.html`

Header: eyebrow `Post · deliverables`; h1 `Deliverables.` (or `Ready to deliver.` when every counted item is done); deck "The censor certificate, the subtitles, the DCP, the stills and the paper behind them, as one list. Tick what is done, mark what this film does not need, and the festival formats come from the tracker rather than from memory." Stats: `12 / 31` delivered · `4` in progress · `3` not needed · `2` festivals tracked (`festival tracked` singular). Then the page's own **tab strip** (`role=tablist`, arrow/Home/End keys): `Checklist` · `Certification` · `Dialogue list` — underlined-file-tab style: selected tab has raised card ground, hairline border, 3px accent bar inset at top; 44px tall; three tabs fit at 390px. URL hash `#certification` / `#dialogue-list`; anything else is the checklist (`#checklist`, `#festivals`, `#g-<group>`). Certification and dialogue panels are built only when shown.

### Deliverables · Checklist (`deliverables.html#checklist`)

**Purpose** One list of everything that leaves with the film, plus festival formats. · **Who/when** Producer/post supervisor, final weeks. · **Data** `src/data/deliverables.json` (catalogue; item ids are storage keys); state in `fms_deliverables_v1` (per item `state`, `note`, `links`; custom items; optional groups on/off); festival tracker `fms_festivals_v1` (set up on the Short Film Blueprint step 10) joined with `src/data/festivals.json` (format, max length); blueprint answers in `fms_filmmaker_combined_v1` (`po_deliver_list`, `po_release_plan`, read-only); project format hides short/feature-only items. Region check for certification.

**Layout** Panel in this order: (a) "What the blueprint says" (only if either blueprint answer is filled), (b) "What your festivals ask for", (c) "Streamer checklists", (d) filter pills, (e) groups of item cards (two columns ≥720px, one column at 390), (f) "Your own" group, (g) add-your-own form.

**Elements**
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Blueprint | h2 | – | `What the blueprint says` | – | – |
| | label+quote | – | `Who needs what, in which format — step 32` + blockquote; `First screening, and the date you are working towards` + blockquote | read-only | each only if filled |
| | link | text link | `Edit on the blueprint` | → feature blueprint step 32 | – |
| Festivals | h2 | – | `What your festivals ask for` | – | – |
| | blurb | – | "Read from the submission tracker and the festival catalogue. A festival whose format the catalogue does not record says so — look it up on their page rather than guess." | – | – |
| | rows | list | strong festival name · status (`Targeting`, `Submitted`, `In competition`, `Selected`; rejected/withdrawn are hidden) · format text `Format: DCP · ≤15 min` / `Format not recorded in the catalogue` / `Not in the catalogue — check their page` (dashed/unknown styling) | – | – |
| | empty (feature) | text + btn | "No festivals tracked yet. The submission tracker lives on the Short Film Blueprint’s festival step and keeps this project’s festivals whatever its format — add a feature’s festivals there and each one appears here with the format it asks for." + `OPEN THE SUBMISSION TRACKER (SHORT FILM BLUEPRINT)` | – | short: "No festivals tracked yet. Add them on the short film’s festival step and each one appears here with the format it asks for." + `OPEN THE SUBMISSION TRACKER` |
| Streamers | h2 | – | `Streamer checklists` | – | – |
| | blurb | – | "Switch on the platforms this film is going to and their delivery items join the list below. Netflix and Prime Video publish specifications; the others are templates to fill in from the sheet their team sends you. The platform’s own requirements for your title always win." | – | – |
| | rows | checkbox + label | `Cloud workflow` — "our own checklist · checked 13 Oct 2026"; `Netflix` — "published spec · checked 7 Oct 2026"; `Amazon Prime Video` — "published spec · checked 7 Oct 2026"; `Aha`, `Sun NXT`, `ZEE5` — "no published spec — template" | toggles group into the list below | 2 columns ≥720px |
| Filter | pills | toggle group `Show items needed for` | `Everything` · `Any screening` · `Festivals` · `Release and sales` (items marked "Any screening" always stay) | aria-pressed | on = filled |
| Group | header | – | h2 group label + count `3 of 5`; blurb; optional groups also show a source line "Source: … Checked 7 Oct 2026." + host links | – | – |
| Item card (`article.dv-item`, left rule: doing=amber, done=green, na=grey+72% opacity) | head | – | h3 label (e.g. `DCP — Digital Cinema Package`), right mono tag from `when`: `Any screening` / `Festivals` / `Release and sales`; `×` only for your own items | – | done → label muted |
| | why | text | e.g. "What a cinema projector plays. 2K or 4K, SMPTE standard, unencrypted for festivals unless the festival asks for…" | – | – |
| | tool link | text link | `Prepare the dialogue list and the subtitle skeleton` / `Check the script for certification flags` | switches tab | only for items with `tool` |
| | asked line | text | "Asked for by Cannes Court Métrage, Clermont-Ferrand — from your submission tracker." | – | only when a tracked festival's format needs this item |
| | status select | select | `To do` · `In progress` · `Done` · `Not needed` (aria `Status: <label>`) | re-render; "Not needed" leaves the progress denominator | – |
| | note | text | placeholder `Where it is, who has it, what is wrong with it` | auto-saves while typing | – |
| | links | list + `<details>` | summary `Add link`; form: URL `https://…`, kind select (`Google Drive`, `Frame.io`, `LucidLink`, `Dropbox`, `Other`; auto-guessed from the URL until touched), `Label (optional)`, `Add`; error text (role=alert) under it; max 6 links per item; each link row = anchor + `×` | success toast `Link added`; removal toast `Link removed` Undo | – |
| Add form | – | row | text `Add a deliverable the list does not have`, select `Who asks for it` (Any screening / Festivals / Release and sales), button `ADD` | toast `Added to the list`; shows under group `Your own` ("Anything a buyer or a festival asked for that the list above does not have.") | – |

**Catalogue (group → items, `when`):**
- **Picture masters** ("The versions of the film itself. Make the top one first; everything else is exported from it."): Graded master — ProRes 4444 or 422 HQ (any) · Textless master (release) · DCP — Digital Cinema Package (festival) · Screener — H.264, 1080p (any) · Trailer or clip (festival).
- **Sound** ("Delivered separately from the picture, because the picture gets re-cut for territories and the sound has to follow."): 5.1 printmaster (any) · Stereo fold-down (any) · M&E — music and effects stems (release) · Music cue sheet (release).
- **Subtitles and access** ("The film's words, outside the picture."): English subtitles — SRT and a timed master list (any) · Burnt-in subtitle version (festival) · Closed captions — SDH (release) · Dialogue list — combined continuity and spotting list (release). All link to the dialogue-list tab.
- **Certification and chain of title** ("Nothing here is glamorous and every one of them can stop a screening."): CBFC certificate (release; links to certification tab) · Chain of title (release) · Releases — cast, crew, locations, music, artwork (any) · Errors and omissions insurance (release) · QC report (release).
- **Publicity and festival materials** ("What a selector, a programmer or a journalist opens before they press play."): Production stills — at least ten, high resolution (any) · Poster — one-sheet, portrait (festival) · Logline and three synopses — one line, 100 words, 300 words (any) · Director's statement, biography and photograph (festival) · Full credit list (any) · Press kit — EPK (festival).
- Optional (off until switched on): **Cloud workflow** (8: camera originals offloaded and checksum-verified on set, 3-2-1 backup, folder structure, camera-to-cloud upload, proxies, dailies shared, relinked to full-res at conform, final masters archived with checksums); **Netflix** (6: Delivery Requirements List, IMF package SMPTE ST 2067-21 App #2E, Dolby Vision HDR master, audio, non-subtitled version, timed text TTML1); **Amazon Prime Video** (5: video mezzanine, semi-textless master, HDR, audio per language, timed text); **Aha / Sun NXT / ZEE5** templates (6 each: their spec in writing, picture master, audio, subtitles and captions, key art/stills/metadata, their QC pass).

**Festival countdowns:** there are NONE on this page. Festival deadlines/countdowns ("in 12 days" / "5 days ago") live on the Short Film Blueprint's festival step; this page shows only tracked festival name, status and catalogue format/length.

**States** Fresh project: all items `To do`, stats `0 / N delivered`. All counted items done → h1 becomes `Ready to deliver.` No project/plan lock states. Print: tab strip hidden; items print as plain cards.
**Dialogs** none (toasts only).
**Sample data** Stats `12 / 31 delivered · 4 in progress · 3 not needed · 2 festivals tracked`; festivals "Cannes Court Métrage — Submitted — Format: DCP · ≤15 min", "Clermont-Ferrand — Targeting — Format not recorded in the catalogue"; DCP card: state In progress, note "Mastering at Prasad Labs, ETA 20 Dec", link "Google Drive: DCP folder".
**Mobile (390px)** Tabs shrink padding, remain one row; item grid one column; link form fields stack; streamer list one column; filters wrap.

**Stitch prompt** Dark violet (#120f1c, #1b1727, #9575f8, Catamaran, pills, 16px) "Deliverables" page. Eyebrow "Post · deliverables", title "Deliverables.", deck, four stat tiles (12 / 31 delivered, 4 in progress, 3 not needed, 2 festivals tracked), then a file-tab strip Checklist (selected, raised with a violet top bar) · Certification · Dialogue list. Panel: a "What your festivals ask for" list (festival, status chip, "Format: DCP · ≤15 min"), a "Streamer checklists" switch list (Cloud workflow, Netflix, Amazon Prime Video, Aha, Sun NXT, ZEE5 with "published spec"/"template" captions), pills "Everything / Any screening / Festivals / Release and sales", then grouped item cards (Picture masters, Sound, Subtitles and access, Certification and chain of title, Publicity…) with group counts "3 of 5": each card has title, small mono "Festivals" tag, a why paragraph, status dropdown (To do / In progress / Done / Not needed), a note field, "Add link" disclosure, left edge amber/green/grey by state. End with an "Add a deliverable the list does not have" row.

### Deliverables · Certification (`deliverables.html#certification`)

**Purpose** Word-search of every scene against Indian certification rules, with a likely-rating hint. No AI. · **Who/when** Producer, before submitting to CBFC. · **Data** `src/data/cbfc-rules.json` (12 rules, ratings U / UA 7+ / UA 13+ / UA 16+ / A, sources, `checked 2026-10-08`), scenes + script elements (`loadScript()`), `cbfc.js`; region setting (`isIndia()`).

**Layout** One column: h2 → blurb → disclaimer → hint card → 3 stats → "What the flags mean, and what to do" rule cards → quiet list → two source notes → "Scene by scene" ordered list.

**Elements**
- h2 `Certification flags`; blurb "Every scene read against the things a CBFC application will ask about: the tobacco and drug warnings, the AWBI permission for animals, child artists, national symbols and uniforms, and the content the examining committee weighs. A word search, rule by rule, with the line each flag came from. No AI."
- Disclaimer note (`role=note`, bordered): text from the rules file (`disclaimer`).
- **Hint card:** eyebrow `Likely rating — a hint, not advice`; large rating `UA 13+`; meaning line; "Because of: violence and gore (review, 3 scenes); smoking or tobacco on screen (requirement, 2 scenes)." or "Nothing in the word lists that this app associates with a higher category."; foot "The app’s own heuristic over the words above — the Board certifies the finished film as a whole, and how a scene is shot moves it more than what the page says. Categories: U, UA 7+, UA 13+, UA 16+, A." plus a source line "Source: Cinematograph (Amendment) Act, 2023 and … Checked 8 Oct 2026." with host links (medianama.com, drishtiias.com, cbfcindia.gov.in).
- Stats: `7 / 64` scenes flagged · `3` requirements to act on · `64 / 64` read from the script.
- h3 `What the flags mean, and what to do`; rule cards (`article.dv-rule`, left rule by kind): head h4 rule label + mono kind tag (`Requirement` / `For the committee` / `Legal caution`); "2 scenes: 4, 9" (first 12 numbers then `, …`); `what` paragraph; bullet `do` list; source line; confidence line (`Read on the regulator’s own site.` / `Read from reports of the official text, not the text itself.` / `Uncertain — reported, not confirmed.` plus `Check: …`).
- Rules (id · label · kind): tobacco `Smoking or tobacco on screen` requirement; drugs `Narcotic drugs or psychotropic substances` requirement; alcohol `Alcohol` review; animals `Animals on screen` requirement; violence `Violence and gore` review; sexual `Sexual content` review; language `Abusive language and slurs` review; community `Caste, religion or community references` review; realnames `Real people, brands and institutions` caution; emblems `National emblem, flag, police or armed-forces uniforms` requirement; children `Children on set, and in hazardous scenes` requirement.
- Quiet line: "Nothing found for: alcohol; animals on screen; …."
- Two small source notes: the guidelines note (revised 16 September 2026 text) and "The Tamil and Tanglish words are romanised STARTER lists — common terms only, nowhere near complete. A word the list does not know is not flagged; read the script yourself."
- h3 `Scene by scene`: ordered list; each item "**Scene 12** EXT. Marina Beach — DAY" (or "**Heading 7** … (no scene row on the breakdown)") with flag rows: kind tag + `Violence and gore · hint UA 13+` + terms `slap, blood` + up to 2 quoted evidence lines (`q`, title shows element type: dialogue/action/heading/parenthetical/scene synopsis/breakdown tag).
**States** Not India: h2 + only "These checks read a script against Indian certification law — the CBFC’s examining guidelines, the COTPA tobacco warnings, the AWBI’s animal permission. Your studio is set to International, so they are off: they would cite a regulator that has no say over your film. Nothing equivalent is offered for other countries yet, because getting it wrong would be worse than leaving it out. Switch to India in Settings if you are certifying here." No scenes/script: "No scenes and no script yet. Write or import the script and every scene is read here." No flags: "No scene matched any rule." Loading: panel builds after lazy chunks (pdf, cbfc, rules) load.
**Mobile** rule cards and flag rows stack; hint rating stays large.

**Stitch prompt** Dark violet (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills) "Certification flags" tab of Deliverables. A bordered disclaimer note, then a prominent hint card: eyebrow "Likely rating — a hint, not advice", giant "UA 13+", meaning line, "Because of: violence and gore (review, 3 scenes)…", fine print and source links. Three stat tiles (7 / 64 scenes flagged, 3 requirements to act on, 64 / 64 read from the script). Section "What the flags mean, and what to do": rule cards with coloured left rule and a kind tag (Requirement, For the committee, Legal caution), scene list "2 scenes: 4, 9", explanation, bullet "what to do" list, source line with date, and a grey confidence line. A "Nothing found for…" line. Then "Scene by scene": numbered list, each scene with flag rows (kind tag, rule label, matched terms, two quoted evidence lines).

### Deliverables · Dialogue list (`deliverables.html#dialogue-list`)

**Purpose** Numbered list of every spoken line with reel, scene, character and an empty English column; CSV, SRT skeleton and print. · **Data** script elements (`loadScript()`), scenes, `dialogue-list.js` (`REEL_MINUTES`, reels estimated from screen time).

**Layout** h2 `Dialogue list and subtitle prep` → blurb "Every spoken line in the script, numbered, with its reel, scene, character and parenthetical — the original line beside an empty English column for the translator. Read from the script every time you open it, so it is never out of date." → 4 stats → action row → notes list → source line → preview list.

**Elements** Stats: `412` lines · `64` scenes with dialogue · `18` speaking parts · `9` reels, estimated. Buttons: `DOWNLOAD CSV`, `DOWNLOAD SRT SKELETON`, `PRINT OR SAVE AS PDF`. Four notes: CSV opens in Excel/Sheets with Tamil intact (UTF-8), English column empty; "The SRT is a skeleton: one numbered cue per line, every timecode 00:00:00,000 --> 00:00:00,000, for a subtitler to time against the locked picture. Do not play it."; reels estimated at N minutes each from the Production Reports screen-time estimate; and the e-Cinepramaan note about no prescribed dialogue-list template and song lyrics. Preview heading `The first 30 lines` (or `The lines` if ≤30), then ordered rows: mono meta `7 · reel 1 · scene 3`, speaker `RAVI (angrily)` / `NO CUE`, line text; footnote "The download and the printed list carry all 412." Files: `<film>-dialogue-list.csv`, `<film>-subtitle-skeleton.srt`.
**States** No dialogue: "No dialogue in the script yet. Write or import the script, and every line is listed here."
**Print layout (A4, via PDF export)** Title "Dialogue list" with subtitle "412 lines · 64 scenes · reels estimated at 12 minutes"; one table with columns `No. | Reel | Sc. | TC in | Character | Dialogue — original | English` (TC in and English blank for hand-filling); a full-width sub-header row at each scene change `Scene 3 — INT. Lalitha's house — NIGHT` (or `Before the first scene`); black on white with hairline row rules; all lines, not just 30.
**Mobile** buttons stack; rows show meta over speaker over line.

**Stitch prompt** Dark violet (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills) "Dialogue list and subtitle prep" tab: blurb, four stat tiles (412 lines, 64 scenes with dialogue, 18 speaking parts, 9 reels estimated), three pills DOWNLOAD CSV, DOWNLOAD SRT SKELETON, PRINT OR SAVE AS PDF, a bullet list of four grey notes, then "The first 30 lines" as a numbered list where each row has a mono meta line "7 · reel 1 · scene 3", the speaker "RAVI (angrily)" and the dialogue. Also design the A4 print: a 7-column table (No., Reel, Sc., TC in, Character, Dialogue — original, English) with full-width scene header rows.


---

# PART H — Blueprints (feature and short film) and how they live inside the stages

## Part 07 — The Blueprints (feature.html, short.html, and how they live in the stages)

Source of truth: the worktree `admin-fixes`. Files read: `src/pages/feature.js`, `src/pages/short.js`, `src/ui/steps.js`, `src/ui/step-stages.js`, `src/ui/stage-guide.js`, `src/ui/stage-guide-body.js`, `src/ui/chrome.js` (rail, reading progress, save indicator, beat visualiser), `src/ui/blueprint-rows.js`, `src/ui/blueprint-entry.js`, `src/lib/blueprint-route.js`, `src/pages/blueprint-redirect.js`, `src/data/steps.*.json`, `festivals.json`, `festivals.checks.json`, `tokens.css`.

House style used in every Stitch prompt: dark violet product UI, page ground `#120f1c`, cards `#1b1727`, accent `#9575f8`, pill buttons, 16px radius, Catamaran (UI/body), JetBrains Mono (eyebrows, labels, numbers), Courier Prime (screenplay only).

---

### 0. READ THIS FIRST — what is actually reachable

1. `feature.html` and `short.html` are still full pages, but **both call `enableRedirect()` before rendering** (`src/pages/blueprint-redirect.js`). Arriving by their plain URL (with or without `#step-NN`, `#vol-2`, `#glossary`) does a `location.replace()` to the stage page that now owns that step. The only way to see the full page is the exemption `?stay=1` (`feature.html?stay=1`, `short.html?stay=1`), which stage-guide widgets and a few cards link to as a fallback.
2. The three legacy files `arunak-filmmaker-blueprint.html`, `arunak-shortfilm-blueprint.html`, `arunak-filmmaker-library.html` are **redirect stubs** (see section 3).
3. For a designer this means there are **two surfaces drawing the same questions**: the full long pages (this file sections 1–2, 4–6) and the per-stage **Guide** section (section 3, `#guide` on every stage page, one step at a time with a stepper). Both use the same block renderers and the same saved answers.

Block vocabulary shared by both blueprints and the stage guide (full catalogue in section 4): `formula`, `craft`, `why`, `hint`, `examples`, `asks`, `check`, `raw` (authored HTML: related-chips, char-block, char-map, beat-table, pacing-viz, pp-table + row-actions, scene-timeline, palette-picker, dept-grid, budget-summary, hod-signoff — feature; scene-table, beat-grid, page-counter, script-editor, ai-prompt-block, script-preview, prod-grid — short), and the short-only page renderers `beatviz` and `festgrid`.

---

### 1. Feature-film blueprint page (feature.html?stay=1 / src/pages/feature.js)

**Purpose** — Guided, 32-step walk from the first "what if" to delivery, in five parts (one per app stage). Every field autosaves to the user's browser. Steps 01–24 are `steps.feature.json` (vol1 = 01–10 ... vol2 = 11–24, regrouped into parts by the sidecar); 25–32 are `steps.production.json`.

**Data source** — Content: `src/data/steps.feature.json`, `steps.production.json`; part/stage/tools/readout sidecar `steps.stages.json`; "spine" (essential steps) `steps.priority.json`; Tanglish translations `steps.tanglish.json`; English copy patches `steps.copy.json`. Saved answers: one blob in `localStorage` key `fms_filmmaker_combined_v1` (every `data-key` is a field), preferences `fms_filmmaker_prefs_v1`, per-field private notes `fms_note_<key>`.

**Layout** — Single column of reading content inside `<main id="main">`, content max width ~ a 760–860px reading measure centred. Chrome around it:
- 1280px: shell band (global rail + stage phase menu) pinned at top; below it the page **toolbar** (merged into the band as a right-hand zone); fixed vertical tab "STEPS" on the left edge opens the **step rail** (220px wide drawer, left, 804px tall). Fixed round **focus timer** bottom-right. Thin **reading-progress bar** fixed at the very top of the viewport. Small **save indicator** toast fixed in a corner.
- 390px: toolbar wraps / folds into the bottom action bar + phone nav (bottom bar Home · Go to · Search · Tools). The STEPS tab is a 44px-wide vertical tab hugging the left edge; the content is inset by that width. Tables become horizontally scrollable.

Page order (top to bottom): toolbar → master cover → (blank-blueprint entry panel, only when nothing is written) → "Start here / The spine" panel → [Part I cover, how-to, steps 01–10 with Treatment Ladder interlude after 02, Tanglish toggle above step 01] → [Part II cover, 11, 12, "Write the draft" interlude, 13, "story is locked" interlude] → [Part III cover, how-to, three phase dividers before 14 / 17 / 21, steps 14–24] → [Part IV cover, steps 25–28] → [Part V cover, steps 29–32] → Pitch deck section → Sync & backup section → Glossary → Final page → focus timer.

#### 1a. Toolbar (`div.toolbar`)

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Left | Project link `#studioProjLink` | link | arrow `←` + project name (default `STUDIO`) | Goes to `index.html`; tooltip "Back to Studio · current project" | Shows the open project's title |
| Centre-left | Progress meter | bar + text | track with fill `#progressFill`, text `#progressText` default `0%` | Tooltip "Overall completion across all 32 steps"; fill = filled fields + ticked checks / total | 0–100% |
| | Step jumper `#stepJumper` | select | placeholder `Jump to…`; optgroup OVERVIEW: `↑ Master cover`, `→ Pitch Deck`, `→ Sync & backup`, `→ Glossary`; then one optgroup per part (`PART I · STORY` … `PART V · POST-PRODUCTION`) holding `→ Part I cover`, then `01 · The Spark`, `02 · The Logline`, `→ Treatment Ladder` (after 02), … `→ Write the draft` (after 12) | Smooth-scrolls to the section | Built from data, never hand-written |
| | Search | text input `#searchInput` + count `#searchCount` | placeholder `Search any field…` | Typing highlights matching fields (`search-hit`), count shows hits; `/` focuses; Enter jumps to next hit | Empty / hits / no hits |
| | Save status `#saveStatus` | status text | `●  ready` | While typing: `●  saving...` (busy style); after save: `●  saved · just now`, then `saved · 12s ago`, `Nm ago`, `Nh ago` | ready / saving / saved |
| Right | **Export** menu | action menu button | `Export` → items: `Print` (hint "Print or save as PDF"), `Save as PDF` (hint `A4`), `Zine layout`, divider, `JSON` (hint `data`), `Markdown` (hint `document`), `Email to myself` | Dropdown | Closed / open |
| | **More** menu (right aligned) | action menu | `More` → `Reading mode` (hides inputs), `Pitch deck` (→ `#pitch-deck`), `Sync & backup` (→ `#sync-section`), divider, `Import JSON`, one `Load sample: <name>` per sample pack, divider, `Reset this blueprint` (danger red) | Reset asks a danger confirm | |
| | Theme toggle `#darkBtn` | icon button | `◐` | Cycles ink / paper themes; tooltip "Theme — ink, paper" order | |

**States** — Empty: `0%`, `● ready`. Filled: percent and "saved · …" text. Error: save indicator shows `SAVE FAILED` (red). Search no match: count empty.

**Mobile (390px)** — Export / More collapse into the bottom Tools sheet; progress meter and save status stay visible in the band; jumper becomes a full-width select.

**Stitch prompt** — "Design the top toolbar of a long-form writing tool, dark violet UI (ground #120f1c, cards #1b1727, accent #9575f8, Catamaran, JetBrains Mono for tiny labels, pill buttons, 16px radius). One sticky row: a back link '← STUDIO', a thin 8px pill progress track with a violet fill and '0%' label in mono, a 'Jump to…' select, a rounded search field with placeholder 'Search any field…' and a small hit counter, a muted status text '●  ready', two outlined pill menu buttons 'Export' and 'More' with a caret (show 'Export' open: Print, Save as PDF A4, Zine layout, divider, JSON, Markdown, Email to myself, each with a faint mono hint on the right), and a round '◐' theme button. Under it a 3px violet reading-progress line across the viewport top. Show desktop 1280 and a 390px version where the row wraps to two lines."

#### 1b. Reading-progress bar, save indicator, focus timer (fixed overlays)

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Viewport top | `.reading-progress` / `.reading-progress-bar` | 3px bar | none | Width = scrolled % of page | 0–100% |
| Corner | `#saveIndicator.save-indicator` | toast chip, `aria-live=polite` | dot + `SAVED` | Appears 1.8s after a save then fades | `SAVING…` (animated dot), `SAVED`, `SAVE FAILED` (error colour) |
| Bottom-right | `#focusTimer.focus-timer` | pill button | `◷` icon, `25:00`, `×0` | Click start/pause; Shift+click or right-click resets; counts pomodoros (`×N`); aria "Focus timer, 25:00, not started" | idle / running (counting down) / paused |
| Per field | `.field-saved-mark` | tick | `✓` | Flashes beside a field when it saves | |

**Stitch prompt** — "Three small floating overlays for a dark violet writing app (#120f1c ground, #1b1727 surfaces, #9575f8 accent, Catamaran + JetBrains Mono). (1) A 3px violet progress line pinned to the very top of the viewport, 42% filled. (2) A compact bottom-left save chip with a 6px dot and the mono text 'SAVED'; show three variants side by side: 'SAVING…' with a pulsing amber dot, 'SAVED' with a green dot, 'SAVE FAILED' with a red dot and red text. (3) A fixed bottom-right pill timer button: a '◷' glyph, '25:00' in mono, and a faint '×0' pomodoro count, with a violet glow ring on hover, plus a running state '18:42 ×1' in the accent colour. Dark theme, 16px radius, subtle 1px #322c48 borders. Include a 390px phone frame where the timer sits above the bottom nav."

#### 1c. Step rail (`aside#stepRail.step-rail`, toggle `#stepRailToggle`)

**Purpose** — Table of contents for the whole blueprint, grouped by part.

**Layout** — 220px drawer fixed left, full height, scrollable; opened by the vertical "STEPS" tab fixed at the left edge (`writing-mode: vertical-rl`). Collapsed by default (`.collapsed`); `.show` opens it and sets `body.rail-open`. On widths ≤1100px choosing a step closes the drawer.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Edge | Toggle tab | vertical button | `STEPS` (aria "Toggle step navigation") | Opens/closes rail, `aria-expanded` | collapsed / open (tab shifts to `left: 220px`) |
| Rail head | Heading | label | `STEPS` | — | |
| Group | Group label | mono caps | `PART I · STORY`, `PART II · SCREENPLAY`, `PART III · PRE-PRODUCTION`, `PART IV · PRODUCTION`, `PART V · POST-PRODUCTION` (the label comes from the sidecar `data-part-label`; fallback `INTERLUDE`) | — | |
| Item | Rail link `.step-rail-item` | row: number, title, check | number `01`, title `The Spark`, tick circle | Jumps to `#step-01`; the current step is highlighted (scroll-spy); a step with all its checklist ticked shows the tick filled | default / current / complete / `.is-spine` (kept when "Show only these 10" is on; others hidden) |

**Mobile (390px)** — Same drawer overlays content; the 44px STEPS tab is always visible on the left edge.

**Stitch prompt** — "A slide-out navigation rail for a 32-step writing guide, dark violet UI (#120f1c ground, rail surface #1b1727, accent #9575f8, Catamaran, JetBrains Mono caps for group labels, 16px radius). Left drawer 220px wide, full height. Header 'STEPS' in mono. Five collapsible-looking groups with mono caps labels: 'PART I · STORY', 'PART II · SCREENPLAY', 'PART III · PRE-PRODUCTION', 'PART IV · PRODUCTION', 'PART V · POST-PRODUCTION', each tinted with its stage hue (violet, gold #d6a44a, teal #2dd4bf, pink #f472b6, magenta #e879f9). Rows: mono number '01', title 'The Spark', and a small circle check on the right. Show one current row with violet wash highlight, two completed rows with filled check, rest empty. Beside the drawer show the fixed vertical 'STEPS' tab on the left edge. Provide a 390px phone version with the drawer over the content."

#### 1d. Master cover (`section.master-cover`)

**Elements**

| Region | Element | Type | Exact label/text | Behaviour |
|---|---|---|---|---|
| Top | Mark | mono eyebrow | `A complete guide to building a film, from idea to camera` | |
| | Title (h1) | display | `The Filmmaker's` (light weight) / `Blueprint.` | |
| | Sub | paragraph | `Five parts. Thirty-two guided steps. From the first "what if?" through "ROLL CAMERA" to delivery. Examples from Dragon, Vikram Vedha, 96 & Por Thozhil, with every concept explained in English & Tanglish.` (the counts are derived) | |
| | Stamps | 5 chips `.vol-stamp` | `PART I · STORY · 10 STEPS`, `PART II · SCREENPLAY · 3 STEPS`, `PART III · PRE-PRODUCTION · 11 STEPS`, `PART IV · PRODUCTION · 4 STEPS`, `PART V · POST-PRODUCTION · 4 STEPS` — each in its stage hue | |
| | Meta grid | 4 fields | `Project title` (ph `Untitled film`, key `meta_title`), `Writer / Director` (ph `Your name`, `meta_writer`), `Started on` (ph `DD / MM / YYYY`, `meta_started`), `Stage` (ph `Story / Screenplay / Pre-prod…`, `meta_stage`) | Text inputs; the title syncs to every other cover and to the project name |

**Part covers** (`section.vol-cover`, ids `vol-1`, `part-2`, `vol-2`, `phase-3`, `phase-4`): mono mark `PART I` … `PART V`; tag chip e.g. `STORY · 10 STEPS`; heading `The Story / Blueprint.` (light word + bold word), `The Screenplay / Blueprint.`, `The Pre-Production / Blueprint.`, `The Production / Blueprint.`, `The Post-Production / Blueprint.`; a sub paragraph; and meta-grid fields:
- Part I (`vol-1`): `Working title` (ph `Untitled film`, `v1_title`), `Genre` (select `v1_genre`: `Pick a genre...`, Drama, Romance, Thriller, Crime / Noir, Comedy, Action, Horror, Sci-Fi, Fantasy, Family, Coming-of-Age, Biopic, Documentary, Anthology, Experimental, Other), `Draft` (ph `01 — Treatment`, `v1_draft`).
- Part II (`part-2`): **no fields** by design.
- Part III (`vol-2`): `Director` (`v2_director`), `Producer` (`v2_producer`), `Pre-prod start` (ph `DD / MM / YYYY`, `v2_start`), `Target shoot start` (`v2_shoot`), `Estimated budget` (`v2_budget`).
- Part IV (`phase-3`): `First day of shoot` (`p3_start`), `Shoot days planned` (ph `e.g. 28`, `p3_days`), `1st AD` (`p3_ad`), `Unit base` (ph `Chennai, Madurai…`, `p3_base`).
- Part V (`phase-4`): `Editor` (`p4_editor`), `Sound designer` (`p4_sound`), `Composer` (`p4_music`), `Target lock date` (ph `DD / MM / YYYY`, `p4_lock`).

**Mobile (390px)** — meta-grid goes to one column; stamps wrap.

**Stitch prompt** — "Cover section of a filmmaking blueprint, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, JetBrains Mono for eyebrows, pill chips, 16px radius). Mono eyebrow 'A COMPLETE GUIDE TO BUILDING A FILM, FROM IDEA TO CAMERA'. Huge two-line title: \"The Filmmaker's\" in light weight, 'Blueprint.' in bold, with a violet full stop. Paragraph: 'Five parts. Thirty-two guided steps. From the first \"what if?\" through \"ROLL CAMERA\" to delivery.' Five pill stamps in a row, each in a different hue: PART I · STORY · 10 STEPS (violet), PART II · SCREENPLAY (gold), PART III · PRE-PRODUCTION (teal), PART IV · PRODUCTION (pink), PART V · POST-PRODUCTION (magenta). Below, a 2x2 grid of labelled inputs: Project title (Untitled film), Writer / Director (Your name), Started on (DD / MM / YYYY), Stage. Desktop and 390px stacked versions."

#### 1e. Blank-blueprint entry panel (`blueprintEntry`, only while nothing is written)

Eyebrow `BEFORE STEP 01`; title `Two ways in.`; deck `This blueprint is 32 steps and nothing has been written in it yet. Typing into step 01 is one way to fill it. If the film already exists on paper — a synopsis, a treatment, a screenplay — bring that in instead, and the steps downstream of it start with something to read.` Two link cards: `I already have a screenplay` (note: "Read in this browser, never uploaded, and shown to you before a word is stored. It fills the screenplay AND the scene list, so the breakdown, stripboard, budget and reports have something to read.") → `screenplay.html#import`; `I have a synopsis` (note about the staged AI draft, needs the user's own API key) → `write.html?stay=1#generate`. Primary pill button `START FROM SCRATCH`; fine print "Nothing on this panel writes anything…"; a `✕` hide button (aria "Hide the ways-in panel"). The panel disappears once anything is saved.

#### 1f. "Start here — The spine" panel (`section#start-here.st-path`)

**Purpose** — Names the 10 essential steps so a beginner can do the shortest path.

| Element | Type | Exact text | Behaviour |
|---|---|---|---|
| Eyebrow | mono | `START HERE` | |
| Title | h2 | `The spine.` | |
| Deck | paragraph | `There are 32 steps below and they are in the order you do them, not the order they matter. These 10 are the shortest path to a blueprint you could put in front of somebody: fill only these and the pitch deck builds, the scene list feeds the breakdown, and the numbers add up. The other 22 are not optional — they are later.` | |
| List | 10 rows `li.st-path-item` | tick `○` (becomes filled when the step is complete), number, name, note | Rows: 01 The Spark ("The one question the film is. Everything below is an answer to it."), 02 The Logline ("One sentence. Until it exists you cannot tell anyone what you are making."), 03 The Theme & Stakes ("What the film argues, and what it wagers on the argument."), 04 The Protagonist ("Who changes. Name, want, need, wound, arc — five lines, and the film has a spine."), 05 The Antagonist ("The opposing want. A protagonist with nothing pushing back is a description, not a story."), 07 The World ("Era, place, rules. The third character, and the one the budget is really about."), 08 The 15 Beats ("Fifteen beats. The first point at which the whole film exists in one place."), 11 The Scene List ("Everything downstream of the blueprint — breakdown, board, schedule — starts here."), 14 The Director's Vision ("One page every department reads. Without it the crew are making different films."), 23 The Schedule, Budget & Crew ("Days, money, heads of department. The three numbers a producer asks for first.") — each links to `#step-NN` |
| Button | primary pill, `aria-pressed` | `Show only these 10` | Toggles `body.prio-spine-only`: hides every step without `.is-spine` (and the same rail entries). Nothing is deleted |
| Hint | caption | `Nothing is deleted or hidden on disk — this only narrows what is on screen, and every one of the 32 steps keeps whatever you have written in it.` | |

**Stitch prompt** — "A 'start here' checklist panel on a dark violet writing-tool page (#120f1c ground, panel #1b1727, accent #9575f8, Catamaran, JetBrains Mono eyebrow, 16px radius, pill buttons). Mono eyebrow 'START HERE', heading 'The spine.', a two-sentence deck explaining that 10 of 32 steps are the shortest path to a pitchable blueprint. A numbered list of 10 rows; each row has a ring tick '○', a mono step number (01, 02, 03, 04, 05, 07, 08, 11, 14, 23), a name link ('The Spark', 'The Logline', …) and a one-line muted note on the right. Show 3 rows ticked (filled violet check). Footer: a primary pill button 'Show only these 10' with aria-pressed state, and a small caption about nothing being deleted. Desktop 1280 and 390px stacked."

#### 1g. Language toggle (`div.steps-lang`, above step 01)

A segmented control from `lang.js` (English / Tanglish; tooltip "Switches the step explanations. Field labels, step names and your own writing are untouched."). In Tanglish mode step decks and the "Why this matters" paragraphs swap in place (no re-render, so typed text survives). Formula and craft blocks always show their short Tanglish gloss line in italics beneath.

#### 1h. The step frame (every step, `section.step#step-NN`)

**Layout** — A card/section per step, full reading width. Vertical order: header row → stage row → "why/feeds" line → deck → blocks in data order → empty video slot (hidden unless a video joins). Printing puts each step on its own page.

| Region | Element | Type | Exact text | Behaviour | Variants |
|---|---|---|---|---|---|
| Header | Step number `.step-num` | big mono numeral | `01` … `32` | | In stage hue |
| | Title `.step-title` | display heading with italic emphasis | e.g. `The <em>Spark.</em>` | | |
| | Spine chip `.st-spine-chip` | small chip | `ESSENTIAL · 1 of 10` (tooltip = spine note) | Only on spine steps | present/absent |
| | Time `.step-time` | mono right-aligned | e.g. `~ 1 EVENING`, `~ 2-3 EVENINGS`, `~ 2-4 WEEKS`, `~ EVERY DAY` | | |
| | Badge `.step-badge` | pill | `EMPTY` → `IN PROGRESS · 40%` → `COMPLETE` | Computed live from filled fields + ticked checks in that step | empty (grey) / partial (amber) / complete (green) |
| Stage row | Chip `.st-stage-chip` | pill in stage hue | e.g. `PART I · STORY`, `PART III · PRE-PRODUCTION`; the final-lock step reads `FINAL LOCK · SCREENPLAY`; a step spanning two stages shows a second hue as a small swatch | | 5 hues |
| | "DO THIS IN" | label + link buttons | label `DO THIS IN`, buttons like `Idea Vault →`, `Beats & Pacing →`, `Screenplay › Outline →`, `Scene list →`, `Stripboard →`, `Budget →`, `Contacts →` (resolved from navigation.json) | Links into the module that does the work | 0–3 buttons |
| | Live readout `.st-readout` (role=status) | text | step 11: `12 scenes · 14 pages · every scene has a location` or `Nothing in the Breakdown yet`; step 23: `3 shoot days · 8 people`; step 25: `Day 2 of 5 · 4 scenes shot`; Write-the-draft: `32 pages · 12 scenes in the script` or `No pages in the Screenplay Writer yet` | Derived, stored nowhere; re-reads when the tab becomes visible; empty state may carry a CTA | filled / empty |
| Feeds line | `.st-why` | text | bold spine note + label `FEEDS` + what reads this step, e.g. `FEEDS Pitch deck slides 02 and 10`, `FEEDS The scene charge timeline on this step · the Markdown export's scene table` | | spine or feeds only |
| Deck | `.step-deck` | italic lead paragraph | e.g. "Every film starts as a question that won't leave you alone. Capture it here — raw, unedited, in any form." | Swaps to Tanglish translation when selected | |
| Body | blocks | see section 4 | | | |
| Per field | Comment button | small icon on text fields | `✎`/count | Opens a private note thread (`fms_note_<key>`) | has-note badge |

The 32 steps (number, title, time, blocks) — titles only, for orientation:
01 The Spark · 02 The Logline · 03 The Theme & Stakes · 04 The Protagonist · 05 The Antagonist · 06 The Supporting Cast · 07 The World · 08 The 15 Beats · 09 The Timeline · 10 The Setups & Payoffs · 11 The Scene List · 12 The Final Check · 13 The Script Lock · 14 The Director's Vision · 15 The Lookbook · 16 The Storyboard & Shot List · 17 The Cinematography Plan · 18 The Production Design · 19 The Costume, Hair & Makeup · 20 The Casting · 21 The Locations & Recce · 22 The Sound & Music · 23 The Schedule, Budget & Crew · 24 The Tech Recce & Final Lock · 25 The Shoot Day · 26 The Continuity Log · 27 The Dailies · 28 The Wrap · 29 The Assembly · 30 The Picture Lock · 31 The Sound & Music · 32 The Delivery.
Parts: I = 01–10, II = 11–13 (+ "Write the draft" interlude between 12 and 13), III = 14–24, IV = 25–28, V = 29–32. Short stage names in the guide stepper: Spark, Logline, Theme & stakes, Protagonist, Antagonist, Supporting cast, World, 15 beats, Timeline, Setups & payoffs, Scene list, Final check, Script lock, Director's vision, Lookbook, Storyboard & shots, Cinematography, Production design, Costume & makeup, Casting, Locations & recce, Sound & music, Schedule & budget, Tech recce & lock, Shoot day, Continuity, Dailies, Wrap, Assembly, Picture lock, Sound & music, Delivery.

**States** — empty step: badge `EMPTY`, fields blank, checks hollow. Partial: amber badge with %. Complete: green badge, rail tick. Spine-only filter on: non-spine steps vanish.

**Mobile (390px)** — header wraps: number + title on the first line, time and badge below; stage row chip then buttons wrap; tables scroll sideways inside their wrapper.

**Stitch prompt** — "One step card from a long guided filmmaking blueprint, dark violet UI (#120f1c ground, card #1b1727, accent #9575f8, Catamaran, JetBrains Mono for numerals and labels, pill chips and buttons, 16px radius). Header row: a big mono numeral '01' in violet, title 'The *Spark.*' with an italic emphasised word, a small 'ESSENTIAL · 1 of 10' chip, right-aligned mono '~ 1 EVENING', and a status pill 'IN PROGRESS · 40%' in amber. Below: a stage row with a violet pill 'PART I · STORY', the mono label 'DO THIS IN' and an outlined pill button 'Idea Vault →', and a live readout text. Then a line 'FEEDS Pitch deck slides 02 and 10', then an italic lead paragraph. Leave a body area. Show badge variants EMPTY (grey), IN PROGRESS (amber), COMPLETE (green). 1280 and 390px."

#### 1i. Interludes and dividers

- **Treatment Ladder** (`section.ladder-step#treatment-ladder`, between 02 and 03): mono eyebrow `INTERLUDE · BETWEEN STEPS 02 AND 03`; title `The Treatment Ladder.`; intro paragraph ("Five rungs from one sentence to a step outline…"); a formula box ("Each rung must be readable on its own…" with a Tanglish line); then five rung cards `.ladder-rung`, each with `h4`, a mono target line, a textarea and a hint: `Rung 1 — The Logline` (target `5 – 30 words · already done in Step 02`, key `lad_1_logline`, 2 rows), `Rung 2 — One-Paragraph Synopsis` (`100 – 150 words · the elevator pitch`, `lad_2_synopsis`, 6 rows), `Rung 3 — One-Pager` (`~ 400 – 500 words · one printed page`, `lad_3_onepager`, 14 rows), `Rung 4 — The Treatment` (`5 – 12 pages · prose narrative of the whole film`, `lad_4_treatment`, 16 rows), `Rung 5 — Step Outline` (`15 – 40 numbered scenes · the bridge to script`, `lad_5_outline`, 14 rows); closing italic tip.
- **Write the draft** (`#write-the-draft`): eyebrow `INTERLUDE · BETWEEN STEPS 12 AND 13`; title `Write the draft.`; deck about writing in the Screenplay Writer; a slot holding the stage row (chip, `DO THIS IN` → Screenplay Writer, live readout of pages/scenes). No fields.
- **"The story is locked"** (`section.interlude`): `▼ ▼ ▼`, heading `The story is locked. Now the film gets made.`, one paragraph.
- **How-to cards** (`section.how-to`, after Part I and Part III covers): heading `How to use Part I.` / `How to use Pre-production.`, a deck, a numbered list of 6 rules, and tip boxes (`A NOTE ON RHYTHM` / `SHORTCUTS & FEATURES` / `A NOTE ON SCALE`) with a left accent border.
- **Phase dividers** before steps 14, 17, 21 (`section.phase`): label `PART III · 1` / `· 2` / `· 3`, headings `From Script to Vision.`, `Building the World.`, `The Logistics & Lock.`, with a one-line step range description.

**Stitch prompt** — "Interlude sections in a dark violet writing app (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono eyebrows, 16px radius, pill buttons). Design: (A) 'The Treatment Ladder' — mono eyebrow 'INTERLUDE · BETWEEN STEPS 02 AND 03', heading, a formula callout, then a vertical stack of five rung cards. Each card has a title ('Rung 1 — The Logline'), a mono target line ('5 – 30 words'), a tall textarea with placeholder and a muted hint; textareas grow taller down the ladder. (B) A centred 'The story is locked. Now the film gets made.' interlude with '▼ ▼ ▼' above it. (C) A phase divider: mono label 'PART III · 1', heading 'From Script to Vision.' and a one-line description, with a hairline. Desktop and 390px."

#### 1j. Pitch deck, Sync & backup, Glossary, Final page

- **Pitch deck** (`section.pitch-section#pitch-deck`): mono eyebrow `AUTO-GENERATED · 10 SLIDES`; heading `The Pitch Deck.`; deck "Auto-generated from your filled fields above. The deck refreshes every time you save…"; buttons `↻ REBUILD FROM DATA` (primary), `EXPORT .PPTX`, `PRINT DECK ONLY`; a `#pitchDeckContainer` that holds ten 16:9 slide cards built from the answers (slides: logline, spark, theme, protagonist, antagonist, world, structure, … cast/budget/camera line).
- **Sync & backup** (`#sync-section`): heading `Sync & backup.`; deck pointing to the sign-in pill and Home backup; one button `BACKUP SETTINGS` → `settings.html#drive`.
- **Glossary** (`#glossary`): heading `The Glossary.`; deck; a grid of category labels (`CAMERA & LENS`, `SHOT & COVERAGE TYPES`, `CAMERA MOVEMENT`, …) each followed by term cards: bold term (`FOCAL LENGTH (mm)`, `ANAMORPHIC`, `MASTER`, `WS / EWS`, `DOLLY` …) with a definition.
- **Final page** (`section.final-page`): quote `"Pre-production is where you direct the film. The shoot is where you protect it."`, signature `THE FILMMAKER'S BLUEPRINT`, and `PARTS I–V · COMPLETE · END OF DOCUMENT`.

**Stitch prompt** — "Closing sections of a filmmaking guide in dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono labels, 16px radius, pill buttons). Section 1: mono eyebrow 'AUTO-GENERATED · 10 SLIDES', heading 'The Pitch Deck.', three buttons ('↻ REBUILD FROM DATA' primary, 'EXPORT .PPTX', 'PRINT DECK ONLY'), then a 2-column grid of ten 16:9 slide thumbnails (dark cards with a mono slide number, a big title and two lines of text). Section 2: 'Sync & backup.' with one outlined button 'BACKUP SETTINGS'. Section 3: 'The Glossary.' as a 3-column term grid, with mono category labels 'CAMERA & LENS' and cards holding a bold uppercase term and a short definition. Section 4: a centred quote page with a signature in mono caps. Desktop and 390px."

---

### 2. Short-film blueprint page (short.html?stay=1 / src/pages/short.js)

**Purpose** — Eleven steps from one image to a festival-ready short, with a structured script editor, Fountain export, AI-prompt builder, a five-beat visualiser and a festival tracker.

**Data source** — `src/data/steps.short.json` (`steps` + `beats`), `festivals.json` (18 reference cards, "tier" + deadline text), `festivals.checks.json` (the verified 2026 overlay: per-festival `checked` date, `fee`, `deadlines`, `notes`, source URL), the user's campaign in `fms_festivals_v1` (NOT part of the blueprint blob). Saved answers: `fms_shortfilm_blueprint_v1` (fields keyed by `data-key`, plus script scenes and scene-map rows in the same blob), debounced 600ms.

**Layout** — Same frame as the feature page: toolbar, cover, how-to, 11 steps, glossary, final page; step rail built from the sections; reading-progress bar; save indicator. No spine panel, no part covers, no pitch deck. Single reading column at 1280; at 390 everything stacks and tables scroll.

#### 2a. Toolbar (short)

Same elements as 1a except:
- Jumper (`#stepJumper`, aria "Jump to a step"): `Jump to…`, `↑ Cover`, optgroups named by stage label from the sidecar (`PART I · STORY`, `PART II · SCREENPLAY`, `PARTS III–IV · PRE-PRODUCTION & PRODUCTION`, `PART V · POST-PRODUCTION`, `FINAL LOCK · SCREENPLAY`) holding `01 · The Seed` … `11 · The Final Lock`, then `→ Glossary`.
- Save status `●  ready` (flash messages last 1.5s, e.g. `●  plain text copied`).
- **Export** menu: `Print`, `Save as PDF` (`A4`), divider, `JSON` (`data`), `Fountain` (`screenplay`). **More** menu: `Import JSON`, divider, `Reset this blueprint` (danger). No search, no Markdown, no samples.

#### 2b. Cover and how-to

- Cover `section.cover#top`: mono mark `A focused guide for the short form`; h1 `The Short Film` (light) / `Blueprint.`; sub `Eleven steps from a single image to a festival-ready short. Includes a structured script editor, Fountain-format export, and AI prompt generator. For films under 30 minutes.`; stamps `SHORT FILM · 11 STEPS` (blue, the shorts hue `#60a5fa`), `FEATURE · PART I · STORY` and `FEATURE · PART III · PRE-PROD` (faded); fields `Project title` (ph `Untitled short`, `meta_title`), `Writer / Director` (`meta_writer`), `Started on` (`meta_started`), `Target runtime` (ph `e.g. 8 min`, `meta_runtime`).
- How-to `section.how-to`: label `HOW TO USE THIS BLUEPRINT`; h2 `One idea, told cleanly.` (italic emphasis on "idea" and "cleanly."); two paragraphs about compression and Fountain; two compare cards `.sf-vs-feature`:
  - `SHORT FILM`: One central moment — a turn, a reveal, a small but decisive change · One protagonist with one want · One or two locations · 5–30 minutes (festival sweet spot is 8–15) · Ends on a single image that contains the meaning · Festival calling card — your "business card" as a director
  - `FEATURE FILM` (muted variant): Multiple moments / acts — a full character arc · Protagonist + antagonist + supporting cast · Multiple locations · 90–180 minutes · Ends on a transformed character · A theatrical / OTT product to be sold and distributed

**Stitch prompt** — "Cover and how-to for a short-film guide, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent but this page's volume hue is blue #60a5fa, Catamaran, mono eyebrows, pill chips, 16px radius). Mono mark 'A FOCUSED GUIDE FOR THE SHORT FORM', huge title 'The Short Film' light + 'Blueprint.' bold, a sub paragraph, three stamp chips (SHORT FILM · 11 STEPS in blue, two faded outline chips 'FEATURE · PART I · STORY', 'FEATURE · PART III · PRE-PROD'), and a 2x2 labelled input grid (Project title, Writer / Director, Started on, Target runtime). Then a how-to card: label 'HOW TO USE THIS BLUEPRINT', heading 'One idea, told cleanly.', two paragraphs and two side-by-side comparison cards 'SHORT FILM' (blue accent, six bullets) and 'FEATURE FILM' (muted, six bullets). Desktop and 390px stacked."

#### 2c. The 11 steps (titles, time, blocks)

01 The Seed. (~ ONE EVENING) · 02 The Logline. (~ TWO EVENINGS) · 03 The Character. · 04 The 5-Beat Structure. · 05 The World. (~ ONE EVENING) · 06 The Scene Map. · 07 The Script Pages. (~ 5-10 SESSIONS) · 08 Format & Export. · 09 Production Reality. · 10 Festival Strategy. · 11 The Final Lock. (~ 30 MIN). Each has a badge starting at `EMPTY`. Stage mapping (sidecar short names): Seed, Logline, Character, 5-beat structure, World (Story) · Scene map, Script pages, Format & export (Screenplay) · Production reality (Pre-production + Production, two hue swatches) · Festival strategy (Post) · Final lock (`FINAL LOCK · SCREENPLAY`, locks the script).

#### 2d. Five-beat visualiser (`beatviz`, step 04) and beat grid

**Purpose** — A 800×200 curve with five dots that fill in as the five beat fields are written; clicking a dot scrolls to its field.

**Data** — `steps.short.json` `beats`: Setup (`BEAT 1 · ≤15%`, key `b1_setup`, dot 40,130, label "SETUP"), Disturbance (`BEAT 2 · ~10%`, `b2_disturb`, 120,110, "DISTURB"), Escalation (`BEAT 3 · ~50%`, `b3_escalate`, 380,65, "ESCALATE", label above), Turn (`BEAT 4 · ~15%`, `b4_turn`, 580,80, "TURN"), Image (`BEAT 5 · ~10%`, `b5_image`, 780,90, "IMAGE").

| Region | Element | Type | Text | Behaviour | States |
|---|---|---|---|---|---|
| Visual | `.beat-viz` svg | SVG 800×200 | axis line at y=100, smooth quadratic curve through the five dots anchored to both edges | Hover shows `.beat-tooltip` | |
| | `.beat-dot` | circle r5, focusable (role button, aria "Beat 1 · Setup — jump to this field") | label under/over each dot (SETUP, DISTURB, ESCALATE, TURN, IMAGE) | Click/Enter jumps to the matching textarea | hollow → `.filled` when the field has text |
| Grid below (`raw .beat-grid`) | 5 `.beat-cell` | mono position `BEAT 1 · ≤15%` / `BEAT 2 · ~10%` / `BEAT 3 · ~50%` / `BEAT 4 · ~15%` / `BEAT 5 · ~10%`; h4 `Setup` / `Disturbance` / `Escalation` / `Turn` / `Image`; textarea with the beat description as placeholder (e.g. Setup: "Establish the protagonist, the world, the normal. End the moment they touch something that hints at the want.") | Autosaves under the beat key | empty / filled |
| Before | formula `FORMULA · 5 BEATS` listing the five beats with percentages; why-block "The 5-beat is the minimum a short film needs…" | | |
| After | ask `Self-test — Read the five beats aloud back-to-back. Does it feel like a story?` (`s4_test`, 3 rows, ph "Note any beat that felt thin, and what it's missing.") and check `STRUCTURE LOCK CHECK` (4 items) | | |

(The feature page has the equivalent `#beatVisualizer` built by `chrome.js` above step 08's table: header `15-BEAT EMOTIONAL CURVE` / `CLICK A DOT TO JUMP`, 800×220 SVG, 15 dots with short labels Opening, Theme, Setup, Catalyst, Debate, Break II, B-Story, Fun & Games, Midpoint, Bad guys, All lost, Dark night, Break III, Finale, Final; dots fill as `b01`–`b15` are filled.)

**Mobile (390px)** — SVG scales to width (labels shrink); beat grid becomes one column.

**Stitch prompt** — "A five-beat story-shape visualiser plus a beat grid for a short-film guide, dark violet UI (#120f1c ground, #1b1727 card, blue accent #60a5fa for the shorts hue with violet #9575f8 secondary, Catamaran, JetBrains Mono labels, 16px radius). Top: a wide card with an SVG curve: faint horizontal axis, a smooth line rising from SETUP (low-left) through DISTURB, peaking around ESCALATE, TURN, falling slightly to IMAGE, with five round dots and mono labels (SETUP, DISTURB, ESCALATE above its dot, TURN, IMAGE); two dots filled blue, three hollow; a small tooltip 'Beat 3 · Escalation'. Below: five equal cards in a row (stack at 390px), each with a mono caption 'BEAT 1 · ≤15%', a title 'Setup' and a textarea with a faint placeholder sentence. Show filled vs empty cells."

#### 2e. Festival block (`festgrid`, step 10) — tracker, countdown cards, catalogue

Structure: `div.fest-block` = **tracker** (`section#festival-tracker`) above a **grid of 18 festival cards** (`div.fest-grid`).

**Tracker elements**

| Region | Element | Type | Exact text | Behaviour | Variants |
|---|---|---|---|---|---|
| Head | h4 | heading | `Your submission campaign` | | |
| | hint | paragraph | `The cards below are the reference list. This is your run at it — what you are targeting, what you sent, what it cost and what came back. Saved to this project in your browser, and included in the studio backup.` | | |
| Alerts | `.ft-alerts` (role=status) | alert cards, each with a tag + sentence | Clear case: tag `PREMIERE` + "No festival is holding your premiere right now. Nothing here blocks an online release." or "Nothing is holding your premiere yet. Add the Tier 1 festivals you are targeting and this will tell you when it is safe to post the film." Conflicts: tag `DO NOT POST` (online premiere scheduled while a festival holds it), `PREMIERE HELD`, `UNSENT` | Text comes from the premiere rule | `ok` / `warn` / `danger` levels |
| Stats | 5 `.ft-stat` tiles | big number + mono label | `NEXT DEADLINE` (value like `in 12 days`, `tomorrow`, `today`; becomes `MISSED DEADLINE` with `3 days ago`; `urgent` style when ≤14 days), `TRACKED`, `OUT THERE` (submitted + in competition), `ANSWERED`, `FEES PAID` (e.g. `$120 + ₹500`; per-currency, never summed) | | |
| | next line | caption | `Next up: <festival> — <yyyy-mm-dd>, in N days.` | | |
| Rows | `.ft-row.t1/.t2/.t3` | one card per tracked festival with a tier-coloured left edge | head: editable name input (aria "Festival name", ph `Festival name`), flag `HOLDS PREMIERE` (tooltip "This festival requires a premiere — it holds your film off the internet until it answers."), delete `✕` (aria "Stop tracking …"); fields: `Status` (select: Targeting, Submitted, In competition, Selected, Rejected, Withdrawn), `Deadline` (date), `Submitted` (date), `Fee paid` (text ph `0` + currency select USD/INR), `Heard back` (date); notes input ph `Notes — which cut you sent, the FilmFreeway reference, who to chase`; marks line below | Field changes save to `fms_festivals_v1`; the tracker redraws on change (not per keystroke) | Marks: overdue `Deadline was 3 days ago and it is still only a target.`; soon `Deadline in 5 days.`; approximate `The catalogue says ~Feb each year. Look up the real date and put it in — this cannot warn you about an approximation.` |
| Empty | `.ft-empty` | text | `Nothing tracked yet. Pick a festival below, or add one that is not on the list.` | | |
| Add | `.ft-add` | select + 2 buttons | label `Add from the list`, select `Choose a festival…` then `<name> — tier N`, buttons `+ TRACK IT`, `+ ONE NOT ON THE LIST` | | |
| Premiere | `.ft-premiere` | planner | label `Your planned online premiere`; hint "Fill this in and the warning above checks it against every festival still holding your film. Leave it blank until you have the rejections."; `Date` (date), `Where` (ph `YouTube, Vimeo Staff Picks, a platform deal…`) | | |

**Festival countdown cards (catalogue grid `div.fest-card.t1/.t2/.t3`, 18 cards)**

| Element | Type | Exact text/sample | Behaviour | Variants |
|---|---|---|---|---|
| Tier tag `.tier` | mono caps | `TIER 1 · OSCAR-QUALIFYING`, `TIER 1`, `TIER 2 · INTERNATIONAL`, `TIER 2 · USA`, `TIER 2 · INDIA`, `TIER 3 · GENRE`, `TIER 3 · ONLINE`, `TIER 3 · INDIA` | | colour per tier t1/t2/t3 (left rule or tint) |
| Name h4 | | `Cannes Court Métrage`, `Sundance Shorts`, `Berlinale Shorts`, `TIFF · Toronto`, `SXSW Shorts`, `Locarno Pardi di domani`, `Clermont-Ferrand`, `Palm Springs ShortFest`, `Aspen ShortsFest`, `MAMI · Mumbai Film Festival`, `IFFK · Kerala`, `IFFI · Goa`, `Fantasia (Montreal)`, `Sitges (Spain)`, `Vimeo Staff Picks`, `Short of the Week`, `Dharamshala International`, `Bengaluru International` | | |
| Description | paragraph | e.g. "The career-launcher for U.S. and international shorts. Submission via FilmFreeway. 70+ shorts selected from 12,000+." | | |
| Requirements `.req` | mono line | e.g. `Deadline: ~Aug · Format: DCP / ProRes · Length ≤40 min` | | |
| **Check box `.fest-check`** (the countdown) | provenance + live dates | **Checked:** tag `CHECKED 2026-09-29` (green); fee line, e.g. "€75 processing fee for a short film (€175 for a feature), payable once however many sections you apply to, non-refundable."; a dated list, each line `Short film registration: 2026-11-04 — in 21 days` (relative text: `today`, `tomorrow`, `yesterday`, `in N days`, `N days ago`; passed dates struck/`gone`); note paragraphs (e.g. "Not on FilmFreeway…"); if every checked deadline has passed: "Every checked deadline for this edition has passed. The next cycle's dates were not published when this was looked up." **Warning/blocked:** tag `UNCONFIRMED` or `COULD NOT CHECK` (amber) + notes. **Not re-checked:** tag `NOT RE-CHECKED` (grey) + "The line above is the blueprint's own approximation from 2023 and nobody has verified it since. Look the date and the fee up yourself before you plan around them." | Dates are real calendar dates; the number of days is computed against today when rendered (so the card text changes daily) | checked / unconfirmed / blocked / not-checked |
| Track button `.fest-track` | pill | `+ TRACK` → disabled `TRACKED` once added | Adds a row to the tracker | enabled / disabled |

Sample checked entries: Berlinale Shorts — checked 2026-09-29, deadline "Short film registration 2026-11-04", fee €75; Sundance Shorts — checked 2026-09-29, three past deadlines (Early 2026-07-13, Official 2026-08-03, Late 2026-08-31), note that all had passed and the fee could not be read.
Under the grid: italic note `Note: Deadlines and rules change every year. Always verify current dates on each festival's official site or via FilmFreeway before submitting.` Then asks `My target festivals (3 tier-1, 5 tier-2, 5 tier-3)` (`s10_targets`, 6 rows), `My festival positioning — one paragraph` (`s10_pos`, hint about programmers, 4 rows), `Submission budget` (`s10_budget`, 2 rows, hint "Tier-1 shorts are usually $40–$70. Tier 2: $25–$50. Tier 3: $10–$30. Plan for $400–$800 total."); check `FESTIVAL STRATEGY CHECK` (5 items).

**Mobile (390px)** — tracker stats wrap 2 per row; each row's five fields stack in a 2-column then 1-column grid; the 18 catalogue cards become one column.

**Stitch prompt** — "Festival submission tracker and countdown cards for a short-film guide, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, JetBrains Mono, pill buttons, 16px radius; tier colours: tier 1 gold #d6a44a, tier 2 blue #60a5fa, tier 3 teal #2dd4bf as left edges). Top card 'Your submission campaign': a green alert chip 'PREMIERE' with one sentence; five stat tiles (NEXT DEADLINE 'in 12 days' with urgent amber state, TRACKED 3, OUT THERE 1, ANSWERED 0, FEES PAID '$120 + ₹500'). Two tracker rows: festival name input, 'HOLDS PREMIERE' flag, ✕, then fields Status select, Deadline, Submitted, Fee paid + currency, Heard back, and a notes input; one row shows a red overdue mark. Below, a 3-column grid of festival cards: mono tier tag, name 'Berlinale Shorts', description, requirement line, a green 'CHECKED 2026-09-29' tag, a dated list 'Short film registration: 2026-11-04 — in 21 days', and a '+ TRACK' pill (one 'TRACKED' disabled). Include one grey 'NOT RE-CHECKED' card. 390px: single column."

#### 2f. Short-film-only widgets (raw blocks)

**Scene map (step 06)** — `table.scene-table`, header `# | Slug (INT./EXT. — Place — Time) | Who | What happens | Beat | Pages |` (last column is row controls). Row (built in JS, **rows carry `data-field`, not `data-key`; saved as an array in the blob**): number `01` (renumbers), slug input (ph `INT. APARTMENT - DAY`), who input (ph `Ravi, Maya`), what textarea (ph `What happens. End on a different value than start.`), beat select (`—`, Setup, Disturb, Escalate, Turn, Image), pages input (ph `0.5`, 60px), controls `⎘` duplicate and `✕` delete. Buttons under the table: `+ ADD SCENE` (primary), `+ ADD 3`. Ask `Self-test: read the "What happens" column top-to-bottom` (`s6_test`, hint "Do the scenes escalate?…"). Check `SCENE MAP LOCK CHECK` (4). Formula: "For each scene, ask: WHO is in it? What do they WANT? What's the OBSTACLE? How does it END differently from how it started?…".

**Script editor (step 07)** — formula `FORMULA · 1 PAGE = 1 MINUTE`; **page counter** (`div.page-counter`): three stat tiles `TOTAL WORDS` (`0`), `EST. PAGES` (`0.0`), `EST. RUNTIME` (`0:00`) plus a status line (`enter scenes below`; compares against the cover's target runtime; 210 words ≈ 1 page); **editor** (`div.script-editor`): stack of scene blocks, each with header (`SCENE 01` tag, slug input ph `INT. APARTMENT - DAY`, `✕` delete), label `ACTION`, action textarea (ph `Describe what happens. Present tense. Third person. No camera directions unless essential.`), a list of dialogue blocks (character input ph `CHARACTER NAME`, line textarea ph `The dialogue line.`, `✕`, and a parenthetical input ph `(parenthetical, optional — e.g. whispering, off-screen)`), button `+ ADD DIALOGUE`; footer button `+ ADD SCENE`; action row (mini buttons) `↻ REFRESH PREVIEW`, `COPY AS FOUNTAIN`, `COPY AS PLAIN TEXT`, danger `CLEAR SCRIPT` (asks to confirm). Check `SCRIPT LOCK CHECK` (5).

**Format & export (step 08)** — formula `FORMULA · WHY FOUNTAIN`; **AI prompt block** (`div.ai-prompt-block`): h4 `AI PROMPT GENERATOR`, paragraph "Stuck on a scene? This builds a prompt from your blueprint data — character, want, world, beat — that you can paste into Claude, ChatGPT, or any AI tool to draft a scene. Your data stays here; only the prompt is copied.", read-only textarea (ph `Click 'BUILD PROMPT' to generate.`), buttons `BUILD SCENE PROMPT`, `BUILD DIALOGUE PROMPT`, `BUILD FEEDBACK PROMPT` (alt style), `COPY TO CLIPBOARD`; mono heading `FORMATTED PREVIEW`; **script preview** (`div.script-preview`, Courier Prime page on a light-toned "paper" panel: slug lines caps, action, centred character names and dialogue; empty text `Add scenes and dialogue in Step 7 to see the formatted preview here.`); buttons `↓ DOWNLOAD .FOUNTAIN` (primary), `↓ DOWNLOAD .TXT`, `PRINT SCRIPT ONLY`. Check `EXPORT CHECK` (4).

**Production reality (step 09)** — related chips (FEATURE Step 23 Schedule & Budget, LIBRARY Equipment Estimator), formula (BUDGET = (DAYS × CREW SIZE × LOCATION FEE) + EQUIPMENT + POST…), why block, **prod-grid** of 12 labelled inputs (keys): `SHOOT DAYS` (`p_days`, ph `e.g. 2 days`), `CAST` (`p_cast`, `e.g. 3 speaking, 2 background`), `LOCATIONS` (`p_locs`, `e.g. 1 — apartment`), `CREW SIZE` (`p_crew`, `e.g. 6`), `CAMERA` (`p_cam`, `e.g. Sony FX3 (owned)`), `LENS KIT` (`p_lens`), `SOUND` (`p_sound`), `LIGHTING` (`p_light`), `BUDGET (TOTAL)` (`p_budget`, `e.g. ₹1.5L`), `FUNDING` (`p_funding`), `POST-PRO` (`p_post`), `SHOOT MONTH` (`p_month`, `e.g. March 2026`); asks `Five things in the script I cannot afford to shoot` (`p_cuts`, 4 rows), `My biggest production risk` (`p_risk`, 3 rows); check `PRODUCTION REALITY CHECK` (4).

**Logline counter (step 02)** — under the `Draft 3 — The locked logline` textarea (`s2_log_final`): mono caption `0 / 25 words` that turns warn-amber over 25.

**Stitch prompt** — "Three widgets from a short-film writing tool, dark violet UI (#120f1c ground, #1b1727 cards, blue accent #60a5fa, violet #9575f8, Catamaran, mono labels, 16px radius, pill buttons). (1) A scene-map table: header '# | Slug (INT./EXT. — Place — Time) | Who | What happens | Beat | Pages', rows with mono number '01', inputs, a Beat select (Setup/Disturb/Escalate/Turn/Image) and ⎘ ✕ row controls; buttons '+ ADD SCENE' (primary) and '+ ADD 3'. (2) A structured script editor: a three-tile counter (TOTAL WORDS 412, EST. PAGES 2.0, EST. RUNTIME 2:00) and a status line; a scene block with 'SCENE 01' tag, slug input, 'ACTION' label and textarea, a dialogue row with 'CHARACTER NAME', line and parenthetical inputs, '+ ADD DIALOGUE'; footer mini buttons '↻ REFRESH PREVIEW', 'COPY AS FOUNTAIN', 'CLEAR SCRIPT' (danger). (3) A Courier Prime formatted-script preview on a pale page. Desktop + 390px."

---

### 3. How the blueprints now live inside the stages

**The relationship in one paragraph** — The two blueprints are no longer destinations; they are the question bank for the five stage pages. Each stage page (Story, Screenplay, Pre-Production, Production, Post-Production) ends with a **Guide** section (`section#guide.sg`, tab label "Guide", reachable as `<stage page>#guide`) that draws that stage's slice of the blueprint for the open project's format (feature or short — read from the project, not chosen on the page). The answers are the blueprint's own: written to the same blob (`fms_filmmaker_combined_v1` / `fms_shortfilm_blueprint_v1`) but only through a **merge-write of the fields touched**, so the full blueprint page and the guide never overwrite each other. Old links keep working: `feature.html` / `short.html` (and the `arunak-*.html` stubs that bounce to them) forward to the owning stage guide.

**Which stage owns which step** (`steps.stages.json`, derived — never listed in code)
- Story (`story.html`): feature 01–10 + Treatment Ladder; short 01–05. On the Story page the guide **omits steps the Story path already asks inline** (`story-paths.json` `absorbs`), so a question appears once; what remains is the cover sheet (Project title, Writer / Director, Started on, Stage, Working title, Genre, Draft; short: Project title, Writer / Director, Started on, Target runtime).
- Screenplay (`screenplay.html`): feature 11, 12, "Write the draft", 13; short 06, 07, 08, and 11 (final lock).
- Pre-Production (`breakdown.html#script` is the first module): feature 14–24; short 09 (shared with Production).
- Production (`shoot.html`): feature 25–28; short 09.
- Post-Production (`edit.html#log`): feature 29–32; short 10.

**Redirects and routing**
| From | To |
|---|---|
| `feature.html#step-07`, `short.html#step-04` | `<stage page>?step=<feature|short>/<step-id>#guide`, e.g. `story.html?step=feature/step-07#guide` (feature 25–32 also use `feature/`) |
| `feature.html#vol-1`, `#part-2`, `#vol-2`, `#phase-3`, `#phase-4` | the guide of the stage that cover opens (`story`, `screenplay`, `preprod`, `production`, `post`) |
| `feature.html#treatment-ladder`, `#write-the-draft` | Story guide / Screenplay guide at that step |
| `#glossary` | `library.html#glossary` |
| `feature.html#pitch-deck` | `story.html#pitch` |
| `feature.html#sync-section` | `settings.html#drive` |
| `short.html#festival-tracker` | `deliverables.html#festivals` |
| anything unknown | `story.html#guide` |
| `?stay=1` on feature/short | no redirect: the full legacy page |
| `arunak-filmmaker-blueprint.html`, `arunak-shortfilm-blueprint.html`, `arunak-filmmaker-library.html` | meta-refresh + `location.replace` stubs (title "Moved — <brand>") to `feature.html`, `short.html`, `library.html`, carrying the hash; page text `This page moved to <a>` and "Your saved work is untouched — it lives in this browser and the new page reads the same storage." Never cached by the service worker. |

#### 3a. Stage guide section (`section#guide.sg`, src/ui/stage-guide.js + stage-guide-body.js)

**Purpose** — Answer the blueprint's questions for the current stage without leaving it.

**Layout** — Appended below the stage page's own modules; also one of the page's tabs (`data-tab-label="Guide"`). Lazy: the heavy body loads when the section nears the screen or the hash is `#guide`. A single card column; one step visible at a time ("stepper"), the rest are `hidden` (still in the DOM, so no saved field is lost).

| Region | Element | Type | Exact text | Behaviour | States |
|---|---|---|---|---|---|
| Head | Eyebrow `.sg-eyebrow` | mono | `Guide · Story` / `Screenplay` / `Pre-Production` / `Production` / `Post-Production` | | |
| | Title `.sg-title` | h2 | Story: `The cover sheet.`; others: `The questions for this stage.` | | |
| | Deck `.sg-deck` | paragraph | Story: `Every question the Feature Blueprint asks for the story is answered in the path above, once. What is left here is the film's cover sheet for "<title>": its title, writer and draft.` Others: `These are the Feature Blueprint's questions for pre-production, answered here for "<title>". Your answers are the blueprint's own — the same ones, saved in the same place.` (Short Film Blueprint for short projects) | | |
| Body | Loading | text | `Loading the questions…` | | loading |
| | Step bar `.stp-list` | horizontal pill strip, scrolls sideways | Cover pill `Cover`, then one pill per step: blueprint step number + short name (`11 Scene list`, `12 Final check`, …); done pill when all that step's checks are ticked; current pill `.is-on` | Click switches the visible step; footer shows "Step 3 of 12" with Back / Next buttons named after the neighbouring steps' short names | current / done / default |
| | Cover fields `.sg-cover` | meta-grid | the stage's cover fields (see above) | | |
| | Step panel | the step rendered by the same `renderStep()` (header, stage row hidden of duplicates, deck, all blocks of section 4) | Tables show an `+ Add a row` button and the note `Reorder, duplicate or delete rows in the full blueprint.` | | |
| | Private note toggle | `✎` button (tooltip "Add a private note (saved on your device)") | feature only | | |
| Empty | No project | the section keeps only its heading; the red "NO PROJECT OPEN" banner above the page links to the hub | | no-project |
| | Nothing for stage | `This stage has no blueprint questions.` | | |
| Error | `The guide could not load. Reload the page to try again.` | | |

**Mobile (390px)** — step bar is a one-line horizontally scrolling strip (the active pill is scrolled into view); Back / Next stack full width; blocks as in section 4 at phone width.

**Stitch prompt** — "A 'Guide' section embedded at the bottom of a stage page in a filmmaking studio, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono eyebrow, pill buttons, 16px radius). Mono eyebrow 'GUIDE · SCREENPLAY', heading 'The questions for this stage.', deck sentence naming the project in quotes. A horizontally scrolling stepper of pills: 'Cover', '11 Scene list' (current, violet fill), '12 Final check', 'Write the draft', '13 Script lock', with a small tick on completed pills. Below, one step card (mono number, title, formula callout, a table with columns Slug / POV / Want / Conflict / Charge, and a '+ Add a row' button with a muted note). Footer: caption 'Step 2 of 5' with outlined pill buttons '← Cover' and 'Final check →'. Provide 1280 and 390px frames, plus a no-project empty state."

---

### 4. Block catalogue — every type the step renderer can draw

Renderer: `renderStep()` in `src/ui/steps.js` iterates `step.blocks`; each block's `type` is looked up first in the page's extra renderers (`beatviz`, `festgrid` on short.html and in the short stage guide), then in `BLOCKS`. An unknown type is skipped with a console warning. Saving is the same for every field: any element with `data-key` is read into the page blob on input (400ms debounce on feature, 600ms on short), restored on load; checklist items save `true/false` under their `data-key`.

#### 4.1 `formula` — Formula box (`div.formula-box`)
**Purpose** — The one-line "equation" of the step. **Data** — `{type, label, eq (HTML), tanglish}`. **Layout** — a tinted slab (brand-washed lavender in light, deep violet in dark; follows the theme) full width; mono label top-left, equation in larger text with `<code>` chips for key terms.
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Top | `.label` | mono caps | `FORMULA` (default; short film uses `FORMULA · 5 BEATS`, `FORMULA · 1 PAGE = 1 MINUTE`, `FORMULA · WHY FOUNTAIN`, `FORMULA · THE FESTIVAL HIERARCHY`) | | |
| Body | `.eq` | rich text | Step 01: `SPARK = What if + [unusual situation] + happening to + [specific person] + in [specific world]` (the "What if" is a `code` chip) | | |
| Gloss | `.tn` span | italic muted | Tanglish line e.g. `SPARK = "Enna aagum?" + [… ] …` | Always shown | |
**States** read-only. **Sample** Step 11: `SCENE = Slug + POV + Want + Conflict + Charge flip / If charge doesn't flip (+→− or −→+), it's not yet a scene.` **Mobile** same, wraps.
**Stitch prompt** — "A 'formula' callout box in a dark violet guide (#120f1c page, slab fill #241a3d-ish violet wash, accent #9575f8, Catamaran, JetBrains Mono label, 16px radius). Mono caps label 'FORMULA' top-left in light violet. Equation text 'SPARK = [What if] + [unusual situation] + happening to + [specific person] + in [specific world]' where bracketed terms are rounded code chips with a slightly lighter violet background. Under it an italic muted Tanglish gloss line. Generous 20px padding, subtle 1px border, no shadow. Show a two-line equation variant (PROTAGONIST = (Want ↔ Need) + The Lie + The Wound + The Flaw / ARC = Lie believed → Lie tested → Lie broken → New self). Desktop and 390px."

#### 4.2 `craft` — Craft lesson (`div.por-thozil`)
**Data** `{label, trade, body, tanglish}`. Card with left accent bar. Label `POR THOZHIL · CRAFT LESSON` (mono), bold trade headline (e.g. `Vignesh Raja's spark that survived a decade`, `Prakash — the rookie who shouldn't be a cop`), paragraph body (with italic film names), Tanglish gloss span. 23 of 24 feature steps have one. **States** read-only.
**Stitch prompt** — "A 'craft lesson' card in a dark violet guide (#1b1727 card on #120f1c, accent #9575f8, Catamaran, mono label, 16px radius). 4px violet left accent bar. Mono caps label 'POR THOZHIL · CRAFT LESSON', a bold one-line headline 'Vignesh Raja's spark that survived a decade', a paragraph of body text with italic film titles, and an italic muted Tanglish line below separated by a thin rule. Show desktop and 390px."

#### 4.3 `why` — Why this matters (`div.why-this`)
**Data** `{label, body, tanglish}`. Label `WHY THIS MATTERS` (mono), one paragraph. In Tanglish mode the paragraph is **replaced** by the full translation (not appended). **Sample** "Most stories die because the writer can't articulate why this story, why now, why them."
**Stitch prompt** — "A 'why this matters' note in a dark violet guide: card #1b1727 with a hairline #322c48 border, small mono caps label 'WHY THIS MATTERS' in light violet #b69bfb, then one calm paragraph in #ece9f6. Slight inset, 16px radius, 18px padding. Also show a language-toggle state where the same paragraph is swapped for Tanglish text. Desktop + 390px."

#### 4.4 `hint` — plain hint (`div.hint`)
A muted italic line, optional Tanglish gloss. Used for helper sentences.

#### 4.5 `examples` — Example cards (`div.examples` > `div.example` / `.example.alt`)
**Data** `{items:[{heading?, label, body, tanglish, alt}]}`. Two side-by-side cards (stack at 390px): first in the default tone, second `alt` (second hue wash). Mono label (`VIKRAM VEDHA`, `96`, `VIKRAM VEDHA — VIKRAM`, `96 — RAM`), body paragraph, italic Tanglish gloss. **Sample** Step 01: VIKRAM VEDHA "What if the gangster a righteous cop is hunting voluntarily walked into the station and started telling him stories that proved the cop's "good kills" were murders?" / 96 "What if two high-school sweethearts who lost touch for 22 years met for one single night at a school reunion — knowing nothing could come of it?"
**Stitch prompt** — "A pair of example cards for a screenwriting guide, dark violet UI (#120f1c ground, cards #1b1727, accent #9575f8, secondary hue gold #d6a44a for the alternate card, Catamaran, mono labels, 16px radius). Two equal cards side by side: each has a mono caps label ('VIKRAM VEDHA' / '96'), a body paragraph quoting a 'What if…' premise, and a muted italic Tanglish line. The second card has a gold-tinted left edge. At 390px they stack. Hairline borders, 20px padding."

#### 4.6 `asks` — Question fields (`div.ask`, one per item)
**Data** `{items:[{key, label, hint, kind: textarea|input|select, placeholder, rows, size, inputType, readonly, options, extras}]}`. Each ask is: `label.ask-label` (real `<label for="f_<key>">`), optional `div.hint`, the control (`textarea` default; `input`; `select` with optional placeholder option), size class (`lg` taller textarea), optional extras HTML after (e.g. the word counter). **Sample (step 01, textarea):** `A · The "What If" question that won't let you sleep` (ph `What if...`, size lg, key `s1_whatif`); `B · Why YOU have to tell this story` (ph `What in your life makes you the right person for this?`, `s1_why_me`); `C · The image, scene, or moment you can already see` (ph `The visual that started it all...`, `s1_image`). **States** empty (placeholder), focused (violet ring 2px), filled, saved (field-saved tick `✓` flashes at the corner), search-hit highlight, reading-mode (inputs hidden), read-only (greyed). Errors: none inline; a failed save shows the SAVE FAILED indicator.
**Stitch prompt** — "Question fields from a writing guide, dark violet UI (#120f1c ground, #1b1727 card, input fill #120f1c, accent #9575f8, Catamaran, mono for hints, pill-radius 16px inputs). Three stacked asks: label 'A · The \"What If\" question that won't let you sleep' (bold), a tall textarea with placeholder 'What if...'; label 'B · Why YOU have to tell this story' with a normal textarea; label 'C · The image, scene, or moment you can already see'. Show states: empty, focused (2px violet ring), filled with a small green '✓' flash at the corner, and a search-highlighted field with amber outline. Include a one-line select variant ('Pick a genre...') and a single-line input variant. 390px full width."

#### 4.7 `check` — Checklist (`div.step-check`)
**Data** `{heading, items:[{key, text}]}`. Heading `BEFORE MOVING ON` (default; short film uses `STRUCTURE LOCK CHECK`, `SCENE MAP LOCK CHECK`, `SCRIPT LOCK CHECK`, `EXPORT CHECK`, `PRODUCTION REALITY CHECK`, `FESTIVAL STRATEGY CHECK`). Items are `li[role=checkbox]` (tabindex 0, `aria-checked`), a square tick box + sentence; click/Space toggles; saved as boolean under `ck_s1_a` etc.; ticked items count toward the step badge, the progress meter and the rail tick (all ticked = complete). A slab surface like the formula box. **Sample (step 11):** Every scene has a clear POV character. / Every scene has someone wanting something. / Every scene has a clear obstacle. / Each scene's charge flips by the time it ends. **States** unticked, ticked (filled violet box with ✓, text unchanged), keyboard-focus ring.
**Stitch prompt** — "A 'before moving on' checklist inside a dark violet guide slab (#241a3d wash on #120f1c page, accent #9575f8, Catamaran, mono heading, 16px radius). Heading 'BEFORE MOVING ON' in mono caps. Four rows each with a 20px rounded checkbox and a sentence: 'Every scene has a clear POV character.', 'Every scene has someone wanting something.', 'Every scene has a clear obstacle.', 'Each scene's charge flips by the time it ends.' Show two ticked (violet fill, white tick) and two empty, one with a keyboard focus ring. Rows are full-width tap targets (48px at 390px)."

#### 4.8 `raw` — authored bespoke widgets (re-inserted as HTML; handlers rewired to data-actions)
The following are the distinct raw widgets. Each has the exact class name listed.

**4.8.1 Related chips** (`div.related-chips`) — mono label `RELATED:` + link chips (`a.related-chip.short|feat|lib` with a tiny `.src` tag), e.g. `SHORTS · Step 03 Character` (feature step 04), `FEATURE · Step 08 The 15 Beats`, `LIBRARY · Equipment Estimator`. Cross-blueprint links (now forwarded by the redirects). Chip hue: blue = shorts, violet = feature, gold = library.
*Prompt:* "A row of small cross-link chips on a dark violet page (#120f1c, accent #9575f8, Catamaran, mono label): label 'RELATED:' then pill chips each with a tiny uppercase source tag and text — 'SHORTS · Step 03 Character' (blue #60a5fa tint), 'FEATURE · Step 08 The 15 Beats' (violet tint), 'LIBRARY · Equipment Estimator' (gold #d6a44a tint). Hover raises border brightness. Wraps at 390px."

**4.8.2 Character block** (`div.char-block`, steps 04, 05, 06) — card with `h4` + `div.dept-fields` two-column label/input pairs. Step 04 `Your Protagonist`: `Name` (`s4_name`), `Age / role / context` (`s4_age`), `External Want` (`s4_want`), `Internal Need` (`s4_need`), `The Lie They Believe` (`s4_lie`), `Wound (the past event)` (`s4_wound`), `Skill / Weapon` (`s4_skill`), `Fatal Flaw` (`s4_flaw`). Step 06 blocks have an italic description line (e.g. `Ally / Confidant`: "The one who knows the hero well. Often the deepest betrayal — or the deepest loss." fields `Name` (`s6_ally_name`), `What They Reflect About the Hero`, `Their Independent Subplot`, `The Moment They Leave / Betray / Die`). Names typed here feed the relationship map and the pitch deck.
*Prompt:* "A character profile form card in dark violet UI (#1b1727 card, #120f1c inputs, accent #9575f8, Catamaran, 16px radius): bold heading 'Your Protagonist', then a 2-column grid of labelled single-line inputs: Name, Age / role / context, External Want, Internal Need, The Lie They Believe, Wound (the past event), Skill / Weapon, Fatal Flaw. Small muted labels above each input, 12px gaps. One variant with an italic helper line under the heading (Ally / Confidant). 390px single column."

**4.8.3 Relationship map** (`div.char-map`, step 06) — label `RELATIONSHIP MAP`, deck "Every character orbits your protagonist. As you fill names above, they appear here. The dotted line connects narrative function — solid lines mean "active relationship in the story."", an SVG (`#charMapSvg`, viewBox 720×380): protagonist node in the centre, other named characters as nodes on an orbit, lines between. Derived from the typed names (nothing stored). Empty = just the centre/placeholder.
*Prompt:* "A character relationship map card in dark violet UI (#1b1727 card, accent #9575f8, Catamaran, mono label, 16px radius). Mono label 'RELATIONSHIP MAP', a muted deck sentence, and a 720×380 SVG: a large violet node for the protagonist in the centre, five smaller labelled nodes (Antagonist, Ally, Mentor, Love interest, Rival) orbiting it, solid violet lines for active relationships and dotted grey lines for narrative function. Show an empty state with only the centre node and the text 'Fill the names above to see them appear'. Desktop and 390px."

**4.8.4 Beat table** (`table.beat-table`, feature step 08) — header `Beat | Your Version`; 15 rows: left cell `.beat-name` = bold `01 · Opening Image` (names derived from the Save-the-Cat method: Opening Image, Theme Stated, Set-Up, Catalyst, Debate, Break Into Two, B Story, Fun and Games, Midpoint, Bad Guys Close In, All Is Lost, Dark Night of the Soul, Break Into Three, Finale, Final Image), a mono page marker (`Page 1`, `~ Page 5`, `Pages 1-10`, `~ Page 12`, `Pages 12-25`, `Page 25`, `Page 30`, `Pages 30-55`, `Page 55`, `Pages 55-75`, `Page 75`, `Pages 75-85`, `Page 85`, `Pages 85-110`, `Last page`) and a hint (`Hero's world before change.`, `Someone says the lesson aloud.`, `Establish world, flaw, want.`, `The thing that breaks status quo.`, `Hero hesitates.`, `Hero commits. New rules.`, `Second relationship begins.`, `Promise of the premise.`, `False victory or defeat. Goal inverts.`, `Pressure mounts.`, `A death — literal or symbolic.`, `Hero alone. Lie cracks.`, `New plan. New self.`, `Resolves external + internal.`, `Mirror of opening, transformed.`); right cell a textarea keyed `b01`…`b15` (placeholders on 01, 04, 09 give VV / 96 examples). A worked-example card from the Dragon case study is inserted **right after** the table (`beat-eg-card`, lazy-loaded).
*Prompt:* "A 15-row beat sheet table for a screenwriting guide, dark violet UI (#120f1c ground, #1b1727 table surface, hairline #322c48 rules, accent #9575f8, Catamaran, mono for page markers, 16px radius). Two columns: 'Beat' (a bold '01 · Opening Image', a small mono page marker 'Page 1', and a muted hint 'Hero's world before change.') and 'Your Version' (an auto-growing textarea with placeholder). Show rows 01–04 and 09 with the filled/empty difference, a faint violet tint on filled rows. At 390px each row stacks beat above textarea. Add a small collapsible 'worked example' card under the table."

**4.8.5 Pacing visualiser** (`div.pacing-viz`, feature step 08) — label `PACING VISUALIZER`, deck "Each beat lights up as you fill it. The dotted arc traces the typical rise and fall of dramatic intensity…", SVG `#pacingSvg` (720×200), and four stats: `Beats filled: 0 / 15`, `Act 1: 0/3`, `Act 2: 0/8`, `Act 3: 0/4`. Derived live from `b01–b15`.
*Prompt:* "A pacing visualiser card: mono label 'PACING VISUALIZER', a short deck, a wide 720×200 SVG with a dotted violet arc of dramatic intensity and fifteen small beat bars/dots that light up in violet as they are filled (show 6 lit), and four stat chips below: 'Beats filled: 6 / 15', 'Act 1: 3/3', 'Act 2: 3/8', 'Act 3: 0/4'. Dark violet UI (#1b1727 card, #9575f8 accent, Catamaran, mono), 16px radius."

**4.8.6 Table with row actions** (`table.pp-table` + `div.row-actions`) — used for tables of repeated rows:
- Step 10 Setups & payoffs: columns `# | Setup (what + roughly which page) | Payoff (what + roughly which page)`; five fixed rows `01`–`05` with two textareas each (`s10_setup_N`, `s10_pay_N`; ph `What you plant + page...` / `How it lands + page...`).
- Step 11 Scene list: columns `# | Slug (location + time) | POV | Want | Conflict | Charge`; rows built in JS (`sl_N_slug` ph `INT. LOCATION – DAY`, `sl_N_pov` ph `POV`, `sl_N_want` ph `Wants...`, `sl_N_conf` ph `What blocks it...`, `sl_N_charge` select `—`, `+ → −`, `− → +`, `+ → ++`, `− → −−`) — the charge cell is tinted by value; each row ends with `⎘` duplicate and `✕` delete controls. Buttons `+ ADD SCENE`, `+ ADD 5`, `CLEAR EMPTY` (mini buttons).
- Step 16 Shot list: `#` / `Sc#` (`shot_N_scene`) / `Action / blocking` (`_desc`) / `Lens...` select (groups Wide 12–24mm, Normal 28–50mm, Tele 65–200mm, Anamorphic 32–75 Ana, Other: Zoom 24-70, Zoom 70-200, Macro, Probe lens) / `Move...` select (Static, Pan, Tilt, Dolly in/out/with, Push in, Pull out, Handheld, Steadicam, Gimbal, Slider, Crane / Jib, Drone / Aerial, Whip pan, Tracking, Snap zoom) / `Coverage...` select (Master, Establishing, EWS — Extreme Wide, WS — Wide Shot, MS — Medium, MCU — Medium CU, CU — Close Up, ECU — Extreme CU, OS — Over Shoulder, 2-Shot, POV, Insert, Cutaway) / `Lighting / notes`.
- Step 20 Cast list: `# | Character name | Actor | Status... | Notes, dates, conflicts`; status options Not contacted, Audition scheduled, Auditioned, Callback, Look test, Chemistry read done, Verbally confirmed, Contract signed, Fully locked, Declined / withdrawn.
- Step 21 Locations: `# | Scene | Location name & address | Type | Permit | Recce date`; type options Real (as-is), Real (dressed), Built set, Partial build, Hybrid (real + build), Studio, Green screen; permit options Not required, Researching, Application pending, Application filed, Approved, Denied — need backup; recce ph `DD / MM`.
All row fields save as indexed keys (`sl_3_slug`, `shot_2_lens`, `cast_1_status`, `loc_4_permit`); a row number renumbers on delete; duplicate copies the row's values. `CLEAR EMPTY` removes all-blank rows. **States** empty table (zero rows, only add buttons), 1+ rows, charge colour variants.
*Prompt:* "An editable scene-list table for a screenwriting tool, dark violet UI (#120f1c ground, #1b1727 table, hairline #322c48, accent #9575f8, Catamaran, mono numerals, 16px radius, pill buttons). Header: '# | Slug (location + time) | POV | Want | Conflict | Charge'. Three rows: mono '01', slug input 'INT. LOCATION – DAY', POV input, two auto-growing textareas, and a charge select showing '+ → −' with a green tint, '− → +' with a red tint; each row ends with small ⎘ and ✕ icon buttons. Below the table three small outlined pill buttons: '+ ADD SCENE', '+ ADD 5', 'CLEAR EMPTY'. 390px: horizontally scrollable with the # column sticky."

**4.8.7 Scene charge timeline** (`div.scene-timeline`, feature step 11) — label `SCENE CHARGE TIMELINE`, deck "Every scene's emotional charge plotted in order. Bars above the line are positive flips, below are negative…", a bar chart `#sceneChart` (one bar per scene up or down from a centre line), legend `+ → −`, `− → +`, `+ → ++`, `− → −−` (each with a coloured swatch), four stats: `Total scenes: 0`, `With charge: 0`, `Polarity flips: 0`, `Longest single-polarity run: —`.
*Prompt:* "A scene charge timeline card, dark violet UI (#1b1727, accent #9575f8, ok green and danger red for polarity, Catamaran, mono labels, 16px radius). Mono label 'SCENE CHARGE TIMELINE', a deck sentence, a bar chart of 14 slim bars rising above and falling below a centre axis (green positive, red negative, double-height for ++/−−), a legend with four swatches '+ → −', '− → +', '+ → ++', '− → −−', and a stats row 'Total scenes: 14', 'With charge: 11', 'Polarity flips: 7', 'Longest single-polarity run: 3'. Empty variant: flat axis and '—'."

**4.8.8 Colour palette picker** (`div.palette-picker`, feature step 15) — label `VISUAL PALETTE — pick three colors that signature every frame`; three rows each = swatch (clickable, contains `input[type=color]`, keys `palette_c1..c3`, seeds `#b03a1f`, `#a87a32`, `#1f5d4a`), read-only hex text (`palette_cN_hex`), a name input (`palette_cN_name`, ph `What this color is for (e.g. blood, anger, the gangster world)`, `Second color & meaning...`, `Third color & meaning...`); below, a 3-segment colour bar `#paletteBar` mirrors the swatches. The pitch deck reads these.
*Prompt:* "A three-colour palette picker in a dark violet UI (#1b1727 card, accent #9575f8, Catamaran, mono hex text, 16px radius). Label 'VISUAL PALETTE — pick three colors that signature every frame'. Three rows: a 44px rounded swatch (brick red, ochre, forest green), a read-only mono hex field '#B03A1F', and a wide text input 'What this color is for (e.g. blood, anger, the gangster world)'. Under the rows a 24px tall tri-colour bar made of the three swatches with equal widths and 16px rounded ends. 390px: swatch + hex on one line, name input below."

**4.8.9 Department grid** (`div.dept-grid` of `div.dept-block`; steps 17, 18, 19, 22, 23) — a stack of cards, each with an `h4` and `div.dept-fields` (2-column label/field pairs; some blocks force one column). Fields are inputs, textareas and selects. **Sample (step 18):** block `Sets & Spaces` (textareas `Major built sets needed` `v2s6_sets`, `Real locations to be dressed (not built)` `v2s6_dressed`), block `Props & Signature Objects` (`Hero props (essential to story)` ph "e.g. the gun in Vikram Vedha; the photograph in 96", `Recurring objects (gather meaning across scenes)`, `Period-specific items needing research`), block `Art Director / Designer` (`Production designer`, `Art director`, `Set construction lead`, `Art dept budget`). **Sample (step 23):** blocks `Schedule` (`Total shoot days`, `Average pages per day` select `Pick avg...` ~1 page (heavy production) / ~2 pages (standard prestige) / ~3 pages (mainstream) / ~4 pages (TV / fast-paced) / ~5+ pages (indie / low-budget), `Number of schedules / blocks`, `1st AD name`, `Most expensive day on schedule (and why)`), `Budget` (`Total budget`, `Above-the-line`, `Below-the-line`, `Post-production`, `Contingency` select `Pick contingency...` 5% (very tight) / 10% (standard minimum) / 12.5% / 15% (recommended) / 20% (first-time / risky) / 25%+ (high-risk shoot), `Largest single line item`) plus the budget summary below, and `Heads of Department` (`DOP / Cinematographer`, `Production Designer`, `Editor`, `Composer`, `Sound Designer`, `Costume Designer`, `Casting Director`, `Production Manager`).
*Prompt:* "A department planning grid, dark violet UI (#120f1c ground, #1b1727 cards, accent #9575f8, Catamaran, mono small labels, 16px radius). A vertical stack of three cards: 'Sets & Spaces' (two full-width textareas 'Major built sets needed', 'Real locations to be dressed (not built)'), 'Props & Signature Objects' (three textareas with placeholder 'e.g. the gun in Vikram Vedha; the photograph in 96'), 'Art Director / Designer' (2x2 grid of single-line inputs: Production designer, Art director, Set construction lead, Art dept budget). Card headings are bold with a thin violet underline. Show filled vs empty. 390px single column."

**4.8.10 Budget summary** (`div.budget-summary`, inside the Budget block of step 23) — label `AUTO-CALCULATED TOTAL`; total `#budgetTotal` shows `— (fill numbers above)` until numbers exist, then the formatted rupee total; a stacked bar `#budgetBar` (segments Above-the-line, Below-the-line, Post, Contingency) with legend dots; hint `Type any number format — 50, 50,00,000, 50L, 50 lakh, 2cr — the totals add up automatically.` (money parser: whole-string suffix match). 
*Prompt:* "An auto-calculated budget summary panel in dark violet UI (slab #241a3d wash, accent #9575f8, Catamaran, mono label, 16px radius). Mono label 'AUTO-CALCULATED TOTAL', a huge total '₹ 1.2 Cr' (empty variant '— (fill numbers above)' with a muted '(fill numbers above)'), a 14px stacked bar split into four segments in violet, blue #60a5fa, teal #2dd4bf and amber, a legend with four coloured dots 'Above-the-line', 'Below-the-line', 'Post', 'Contingency', and a caption with kbd chips '50', '50,00,000', '50L', '50 lakh', '2cr'."

**4.8.11 HOD sign-off** (`div.hod-signoff`, feature step 24) — `h4` `HOD SIGN-OFF — DEPARTMENT LOCK`, deck "Each Head of Department countersigns that their work is locked, schedule-ready, and budget-aligned. Once all rows are checked, you can call ROLL CAMERA. Signatures here are honour-bound; they don't replace contracts."; 11 rows `div.hod-row`: role label (`Director`, `Producer`, `DOP`, `Production Designer`, `1st AD`, `Sound Designer`, `Composer`, `Editor`, `Costume`, `Casting Director`, `Production Manager`), a `Name` input, a `Date` input, a checkbox (keys `hod_dir_name`, `hod_dir_date`, `hod_dir_check`, …; tooltip "Director sign-off").
*Prompt:* "A sign-off sheet card for department heads, dark violet UI (#1b1727 card, accent #9575f8, Catamaran, mono heading, 16px radius). Heading 'HOD SIGN-OFF — DEPARTMENT LOCK', a deck sentence, then 11 aligned rows: role text (Director, Producer, DOP, Production Designer, 1st AD, Sound Designer, Composer, Editor, Costume, Casting Director, Production Manager), a 'Name' input, a 'Date' input and a round checkbox. Show three rows signed (checked, violet) with names and dates. 390px: role on its own line, name/date side by side, checkbox right."

**4.8.12 Short-film raw widgets** — `beat-grid` (see 2d), `scene-table`, `page-counter`, `script-editor`, `ai-prompt-block`, `script-preview`, `editor-actions`, `prod-grid` (see 2f). Heading `FORMATTED PREVIEW` mono in step 08.

#### 4.9 `beatviz` (short only) — see 2d. 
#### 4.10 `festgrid` (short only) — see 2e.
#### 4.11 `video slot` — empty div at the end of a step; filled only when an approved video is attached (not in step JSON).

---

### 5. Three fully worked example steps

#### 5.1 Step 01 — The Spark (first step, text-only, spine #1)
- Header: `01` · `The Spark.` · `~ 1 EVENING` · chip `ESSENTIAL · 1 of 10` · badge `EMPTY`.
- Stage row: pill `PART I · STORY`; `DO THIS IN` → `Idea Vault →`.
- Feeds: `FEEDS Pitch deck slides 02 and 10`.
- Deck: "Every film starts as a question that won't leave you alone. Capture it here — raw, unedited, in any form."
- Blocks in order:
  1. **formula** `FORMULA`: "SPARK = What if + [unusual situation] + happening to + [specific person] + in [specific world]"; Tanglish gloss.
  2. **craft** `POR THOZHIL · CRAFT LESSON`, trade `Vignesh Raja's spark that survived a decade`, body: "The "what if" behind Por Thozhil — a serial killer from 1979 starts killing again — was so strong it survived TWO scares of obsolescence: the writers reworked the script after Jigarthanda released, then again after Ratsasan. A real spark doesn't die when nearby films release."
  3. **why** `WHY THIS MATTERS`: "Most stories die because the writer can't articulate why this story, why now, why them."
  4. **examples** (two cards): `VIKRAM VEDHA` and `96` (text in 4.5).
  5. **asks** (3 textareas): `A · The "What If" question that won't let you sleep` (ph `What if...`, lg, `s1_whatif`); `B · Why YOU have to tell this story` (ph `What in your life makes you the right person for this?`, `s1_why_me`); `C · The image, scene, or moment you can already see` (ph `The visual that started it all...`, `s1_image`).
  6. **check** `BEFORE MOVING ON`: My "what if" is specific, not generic. / I can name an emotional reason this story matters to me. / I can already see at least one scene clearly in my head. (`ck_s1_a/b/c`)
- Saved: 6 fields (3 text + 3 checks) in `fms_filmmaker_combined_v1`; badge goes `IN PROGRESS · 17%` after the first text answer (1 of 6).

**Stitch prompt** — "Full desktop and 390px screen for a guided-writing step page, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, JetBrains Mono, pill buttons, 16px radius). Header: mono '01', title 'The *Spark.*', chip 'ESSENTIAL · 1 of 10', '~ 1 EVENING', amber 'IN PROGRESS · 17%'. Stage row: violet pill 'PART I · STORY', 'DO THIS IN' + outlined button 'Idea Vault →', line 'FEEDS Pitch deck slides 02 and 10'. Italic deck 'Every film starts as a question that won't leave you alone.' Then: formula slab 'SPARK = What if + [unusual situation] + happening to + [specific person] + in [specific world]'; craft lesson card; why note; two example cards (VIKRAM VEDHA, 96); three labelled textareas A/B/C; a 'BEFORE MOVING ON' checklist with three items. Left STEPS tab and top reading-progress line visible."

#### 5.2 Step 04 — The Protagonist (form-heavy)
- Header: `04` · `The Protagonist.` · `~ 2-3 EVENINGS` · `ESSENTIAL · 4 of 10` · stage `PART I · STORY` (no DO THIS IN buttons). Feeds: `Pitch deck slide 04 · the character map below`. Deck: "Build your hero from the inside out. The lie they believe at page 1 is the whole arc."
- Blocks: related chips (`SHORTS · Step 03 Character`); formula "PROTAGONIST = (Want ↔ Need) + The Lie + The Wound + The Flaw / ARC = Lie believed → Lie tested → Lie broken → New self"; craft `Prakash — the rookie who shouldn't be a cop` ("Want: do well in his first case. Need: stop being a cop because someone else wants him to. Lie: "this uniform is enough." Wound: family pressure. Flaw: book-smart, body-blind…"); examples `VIKRAM VEDHA — VIKRAM` and `96 — RAM`; **character block** `Your Protagonist` with 8 inputs (`Name` `s4_name`, `Age / role / context` `s4_age`, `External Want` `s4_want`, `Internal Need` `s4_need`, `The Lie They Believe` `s4_lie`, `Wound (the past event)` `s4_wound`, `Skill / Weapon` `s4_skill`, `Fatal Flaw` `s4_flaw`); **ask** `Who is the protagonist at the end? (one sentence)` (ph `By the final scene, they have become...`, `s4_arc`); check `BEFORE MOVING ON`: My hero's want and need are clearly different. / I can name the exact lie they believe on page 1. / I can name the wound that created that lie. / My hero changes meaningfully by the end.
- Saved: 9 text keys + 4 check keys. The typed name feeds the relationship map in step 06 and pitch-deck slide 04.

**Stitch prompt** — "Form-heavy step screen, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono labels, 16px radius). Header 'The *Protagonist.*' with '04', 'ESSENTIAL · 4 of 10', '~ 2-3 EVENINGS'. Feeds line 'Pitch deck slide 04 · the character map below'. A 'RELATED:' chip row, a two-line formula slab, a craft card, two example cards, then the main card 'Your Protagonist' with a 2-column grid of 8 labelled inputs (Name, Age / role / context, External Want, Internal Need, The Lie They Believe, Wound (the past event), Skill / Weapon, Fatal Flaw), then a labelled textarea 'Who is the protagonist at the end? (one sentence)', then a 4-item checklist. Show desktop and 390px (inputs single column)."

#### 5.3 Step 11 — The Scene List (table-heavy, spine #8)
- Header: `11` · `The Scene List.` · `~ 2-4 WEEKS` · `ESSENTIAL · 8 of 10` · stage pill `PART II · SCREENPLAY` (gold). Stage row: `DO THIS IN` → `Scene list →`; live readout `12 scenes · 14 pages · every scene has a location` (or `Nothing in the Breakdown yet`). Feeds: `The scene charge timeline on this step · the Markdown export's scene table`. Deck: "Break each beat into actual scenes. This is the bridge between outline and draft."
- Blocks: formula "SCENE = Slug + POV + Want + Conflict + Charge flip / If charge doesn't flip (+→− or −→+), it's not yet a scene."; craft (railway-crossing scene, Por Thozhil); **scene table** (`# | Slug (location + time) | POV | Want | Conflict | Charge`, rows from JS); row-actions `+ ADD SCENE` / `+ ADD 5` / `CLEAR EMPTY`; **scene charge timeline** (4.8.7); check `BEFORE MOVING ON`: Every scene has a clear POV character. / Every scene has someone wanting something. / Every scene has a clear obstacle. / Each scene's charge flips by the time it ends.
- Saved: per-row keys `sl_N_slug|pov|want|conf|charge` plus check keys `ck_s11_a–d`; the page-1 scene bin and breakdown read the rows.

**Stitch prompt** — "Table-heavy step screen for a screenwriting tool, dark violet UI (#120f1c ground, #1b1727 cards, gold stage hue #d6a44a for the Screenplay part, accent #9575f8, Catamaran, mono, 16px radius). Header '11 The *Scene List.*', 'ESSENTIAL · 8 of 10', '~ 2-4 WEEKS', gold pill 'PART II · SCREENPLAY', 'DO THIS IN' + 'Scene list →', live readout '12 scenes · 14 pages · every scene has a location'. Formula slab, craft card, then a scene table (# / Slug / POV / Want / Conflict / Charge select) with 4 rows and per-row ⎘ ✕, three mini buttons under it, then a 'SCENE CHARGE TIMELINE' bar chart card with four stats, then a 4-item checklist. Desktop and 390px (table scrolls sideways)."

---

### 6. The six hues and where they appear

The five **stage** hues are carried by classes `.sh-ph-<stage>` (and the same colours are the older volume hues `.hue-*`); a sixth, blue, is the short-film volume hue. The hue is set on `--hue` / `--hue-deep` / `--hue-lift` / `--hue-on` and a `*-wash` tint exists for each. Dark theme values (default):

| # | Name | Meaning | Fill | Deep (as text on light) / lift | Wash | Where it appears in the blueprints |
|---|---|---|---|---|---|---|
| 1 | feature / story (violet) | Story stage, Part I, feature blueprint, the brand | `#9575f8` | `#b69bfb` | `#241a3d` | Part I stamp and cover, step chips for 01–10, step rail group label, the product accent |
| 2 | library / screenplay (gold) | Screenplay stage, Part II | `#d6a44a` | `#e8c384` | `#2e2415` | Part II stamp and cover, chips for 11–13 and "Write the draft"; library chips on related-chips |
| 3 | plan / preprod (teal) | Pre-Production, Part III | `#2dd4bf` | `#7fe8da` | `#11302c` | Part III stamp and cover, chips for 14–24 |
| 4 | shoot / production (pink) | Production, Part IV | `#f472b6` | `#f9a8d4` | `#33182a` | Part IV stamp and cover, chips for 25–28 |
| 5 | visualize / post (magenta) | Post-Production, Part V | `#e879f9` | `#f0abfc` | `#2e1030` | Part V stamp and cover, chips for 29–32 |
| 6 | shorts (blue) | Short-film volume | `#60a5fa` | `#93c5fd` | `#16233c` | The short blueprint's cover stamp `SHORT FILM · 11 STEPS`, its related-chip `SHORTS` tag, `vol-stamp.blue`, short-film accents |

Where hues are applied: stage chip colour on each step (`.st-stage-chip.sh-ph-*`); step-rail group label per part; the part stamps on the master cover; the part covers' tag chip; a part's divider labels; a step spanning two stages shows the second hue as a small circular swatch next to the chip; festival tier cards use their own tier left-edge colours (tier 1/2/3) rather than phase hues; semantic colours (ok green, warn amber, danger red) are never one of these hues. Light theme (`paper`, alternate): same roles with darker fills — feature `#6d28d9`, shorts `#2563eb`, library `#8f5a07`, visualize `#b21ec4` (page `#f7f5fc`, ink `#171233`, brand `#6d28d9`).

**Stitch prompt** — "A colour-key legend for six stage hues on a dark violet UI (#120f1c ground, #1b1727 cards, Catamaran, JetBrains Mono labels, pill chips, 16px radius). Six pill chips in a row labelled in mono caps: 'PART I · STORY' (#9575f8), 'PART II · SCREENPLAY' (#d6a44a), 'PART III · PRE-PRODUCTION' (#2dd4bf), 'PART IV · PRODUCTION' (#f472b6), 'PART V · POST-PRODUCTION' (#e879f9), 'SHORT FILM' (#60a5fa). Under each chip show: a 48px swatch, its hex, its wash tint, and a mini step-rail row ('01 The Spark') coloured with that hue, plus a step header chip. Include a combined chip with a small second-hue swatch (a step spanning Pre-production and Production). Desktop and 390px (two per row)."


---

# PART I — Owner admin console

# Run and product screens: shell, Overview, Launch & health, Audit log, Usage, Sync & storage

## Console: shell, Run group and Product group screens (design handoff)

Extracted from code: `src/pages/admin.js`, `src/pages/admin-tabs/{health,rpc,_rpc,audit,usage,sync}.js`, `src/ui/admin-kit.js`, `src/ui/admin-charts.js`, `src/styles/admin.css`, `src/ui/tabs.js`.

### 0. Shared kit (used by every screen below)

| Component | Anatomy |
|---|---|
| **Pill** `pill(text, tone, {dot,title})` | Small rounded-full label. Tones: `ok` (green), `warn` (amber), `danger` (red), `neutral` (grey), `accent` (violet). Optional leading 6px dot. |
| **KPI tile** `kpi({label,value,sub,href,attention})` | Card: big number (value) on top, label under it, optional row with delta chip and a small sub caption, optional sparkline. If `href` the whole tile is a link. `attention` adds a warn-coloured emphasis. Grid: `repeat(auto-fit, minmax(8.5rem,1fr))`. |
| **Delta chip** | Arrow glyph (up, down, flat square) plus signed number. Good=green, bad=red, flat=grey. |
| **Meter** | Label, 100%-width track with fill, text "`used of cap · pct%`". Fill tone: under 70% ok, 70-89% warn, 90%+ danger. Has role=meter. |
| **Checklist** | Ordered list. Each row: glyph + word + label + optional note. States: pass (check glyph, word "Passing"), fail (cross, "Failing"), wait (ellipsis, "Checking"), skip (dash, "Not checked"). The word is visually hidden; the glyph is visible. Never colour alone. |
| **Timeline** | Vertical list, a dot per row, a title line (bold text plus relative time), a sub line, and an optional link/chip at the right edge. Row tone `warn` colours the dot. |
| **Diff** | 3-column grid: Field / Before / After, only changed keys. Before cell shows value or "(absent)"; After shows value or "(removed)". If nothing differs: "No fields changed." On narrow screens rows stack into one column. |
| **Empty state** | Centered: glyph icon, bold title, grey body, optional button, optional stamp line "Checked <relative time>". |
| **Error state** | `role=alert` panel: bold title, body that says why, `RETRY` button (only if a retry handler exists). Default title "This could not load"; default why "The server did not say why." |
| **Skeleton** | Shimmer placeholders. kinds: `kpi` (default 4 tiles, auto-fit minmax 10rem), `rows` (default 5 bars), `block` (1 large block). |
| **Data table** | Wrapper with a toolbar row (left: grey caption; right: tools plus a **density chip** that reads `Comfortable` or `Compact`, toggles, aria-pressed). Then a horizontally scrollable table with sticky header (`position: sticky; top:0`). Numeric columns right-aligned (`is-end`). Cells over 28 characters get a title tooltip. Empty cell shows an em dash. If a row handler exists rows are focusable (Tab), open on click/Enter/Space, Up/Down arrows move row focus. Click on a button or link inside the row does not open it. |
| **Chip** | Pill-shaped toggle button (`ad-chip`); `aria-pressed=true` is the filled/selected state. |
| **Facts list** | Two-column definition list (`max-content` / `1fr`), collapses to one column under 720px. |
| **Charts** | Hand-drawn SVG, no colour named in code: strokes `currentColor`, fills from tokens. Every chart is a `<figure>` with a visually hidden text table twin. One shared dark tooltip follows hover AND keyboard focus. No animation. See each screen. |
| **Relative time** | "just now", "12m ago", "3h ago", "5d ago", else medium date; absolute time in the tooltip. |
| **Drawer** (customer sheet, opened by the Sync tab rows) | Right-side sheet over a scrim, header with title/sub and a `CLOSE` button, Esc closes, hash-linked `#people?user=<id>`. Not owned by these screens. |

Density preference is the only stored UI preference (`fms_admin_density_v1`).

---

### Console shell, group sub-navigation and status bar (hash `#overview` default; every tab id is a hash)

**Purpose** Frame for all 11 tabs: page heading, environment status bar, a grouped sub-navigation, and one visible tab panel at a time.
**Who sees it** Only signed-in studio administrators (`studio_status().role === 'admin'` and `deployed`). Everyone else sees a single-card state (see States).
**Data source** `studio_status()` (via `gate.status()`), `admin_overview` / `listAccounts` / `listUsers` (via `gate.admin`, loaded once for the shell), and `billingSnapshot()`, `growthSnapshot()`, `purchasesRequiredNow()` caches. Every RPC re-checks `is_studio_admin()` server side.

**Layout**
- Top to bottom: shell band and step rail (site chrome, not owned here) then `main`:
  1. Header block: eyebrow `Administration`, H1 `Console`, grey line `Signed in as <email>` (admins only).
  2. **Status bar** (full-width, max width 80rem, centred, flex-wrap): left = two pills; right (margin-left auto) = refresh text and `REFRESH` button.
  3. **Console body** with a left sub-navigation and the active tab panel.
- At 1280px (>= 1100px): body is a 2-column grid, `13.5rem` left column (sub-navigation) and the rest for the panel, column gap `--s6`. The sub-navigation is vertical, sticky (`top = chrome height + --s3`), transparent background, with four groups, each a small mono uppercase heading (`RUN`, `PEOPLE`, `MONEY`, `PRODUCT`, micro size, wide letter-spacing, muted) above its tab buttons stacked 2px apart. Each tab button is full-width, left-aligned, label left and optional count badge right, 16px radius. The panel is column 2. The panel scrolls with the page; the sub-navigation stays pinned.
- At 390px (< 1100px): single column. The sub-navigation becomes ONE horizontally scrolling strip of tabs; group headings are hidden (group runs are flattened in order). It is not pinned above the panel in the vertical sense used on desktop. Header and status bar get 16px side padding (`--s4`).
- Tabs, in order, with group: RUN: `Overview`, `Launch & health`, `Audit log`. PEOPLE: `People`, `Support`, `Access & sharing` (id `requests`). MONEY: `Purchases`, `Growth`. PRODUCT: `Usage`, `Sync & storage`, `Controls`.
- A tab that throws while drawing shows its own error card (title `<Tab label> could not draw`, why = the exception message, `RETRY`) and never takes the others down.
- A re-render preserves typed form text and focus (invisible to the designer).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Header | Eyebrow | text | `Administration` | none | |
| Header | Title | H1 | `Console` | none | |
| Header | Identity line | text | `Signed in as arun@example.com` (falls back to `an administrator`) | none | admins only |
| Status bar | Razorpay pill | pill with dot | `Razorpay TEST` / `Razorpay LIVE` / `Razorpay not set` | none; tooltip `From the public key id’s prefix (VITE_RAZORPAY_KEY_ID)` or `No VITE_RAZORPAY_KEY_ID in this build` | TEST = warn, LIVE = danger, not set = neutral |
| Status bar | Purchases pill | pill with dot | `Purchases required: ON` / `Purchases required: OFF` / `Purchases required: unknown` | none; unknown tooltip `Section 32 has not answered` | ON = warn, OFF/unknown = neutral |
| Status bar | Refreshed text | meta + `<time>` | `Refreshed 4:12 PM` (time tooltip = full date), or `Refreshing…` while loading, or `Refreshed —` | none | |
| Status bar | Refresh | button (`btn ad-refresh`, compact) | `REFRESH` | Reloads overview numbers, the health report and the recent audit rows | disabled while the overview is loading |
| Sub-nav | Group heading x4 | label | `RUN`, `PEOPLE`, `MONEY`, `PRODUCT` | none | hidden below 1100px |
| Sub-nav | Tab button x11 | tab (role=tab, vertical list) | see tab list above | Shows that tab panel, writes the hash (`#health`), back button honest | selected = filled; `aria-selected` |
| Sub-nav | Count badge | small warn pill after the label | number 1-99 | none (part of the tab button; aria-label reads `Audit log, 3 waiting`) | appears only if count > 0. Counts: `Access & sharing` = pending invite requests; `Purchases` = pending refund requests; `Launch & health` = number of health checks that are warn or unknown. Audit, Usage, Sync have none |
| Panel | Active tab section | section | tab content | | one visible at a time; others hidden but in DOM |

**Tables** none in the shell.
**Charts** none.

**States**
- Boot not finished: nothing drawn until the session restore lands (prevents flicker).
- No cloud (build has no Supabase): card `No cloud, no console` / `This build carries no Supabase project (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).`
- Signed out: card `Sign in` / `Use an administrator’s Google account.` with primary pill button `CONTINUE WITH GOOGLE`.
- Status unknown yet: card `Checking…` (no body).
- Not an admin: card `Administrators only` / `Signed in as <email>. Access is granted by the studio’s owner.` with button link `BACK TO THE STUDIO` (to index.html). No status bar, no sub-navigation.
- Admin: the full console. A forced-open page for a non-admin gets 42501 from every RPC.

**Dialogs & confirmations** None owned by the shell.

**Sample data** Status bar: `Razorpay TEST` (amber), `Purchases required: OFF` (grey), `Refreshed 4:12 PM`, `REFRESH`. Sub-nav badges: Launch & health `2`, Access & sharing `3`, Purchases `1`.

**Stitch prompt**
Design the admin console frame for FilmMakerStudio, a dark violet product UI with near-black background, violet accent, pill-shaped buttons and 16px-radius cards, data-dense but calm. Desktop 1280px: page header with small eyebrow "Administration" and H1 "Console", grey line "Signed in as arun@example.com". Under it a full-width status bar: amber pill with dot "Razorpay TEST", grey pill with dot "Purchases required: OFF", right-aligned grey text "Refreshed 4:12 PM" and a compact outlined pill button "REFRESH". Below, a two-column layout: a 13.5rem sticky vertical sub-navigation on the left with four groups headed by tiny mono uppercase labels RUN, PEOPLE, MONEY, PRODUCT, each listing full-width left-aligned tab buttons (Overview, Launch & health, Audit log; People, Support, Access & sharing; Purchases, Growth; Usage, Sync & storage, Controls); selected tab filled violet, small amber count badges on Launch & health (2), Access & sharing (3), Purchases (1). Content panel on the right. Also draw the 390px version: single column, tabs as one horizontally scrolling strip with no group headings.

---

### Overview (hash `#overview`)

**Purpose** Command centre: ten headline numbers, a ranked "Needs attention" list, the latest admin activity.
**Who sees it** Administrators only.
**Data source** `admin_overview` (+ `listAccounts`, `listUsers`) via the shell; `admin_health` (shared with Launch & health); `admin_list_audit` (last 15 rows, shared with Audit log); billing and growth snapshots.

**Layout**
- Top: KPI grid `.ad-stats.ad-kpis`, `repeat(auto-fit, minmax(8.5rem,1fr))`: at 1280px (panel about 62rem) roughly 6-7 per row so ten tiles wrap onto 2 rows; at 390px 2 per row.
- Middle: two-card row `.ad-cols`, `repeat(auto-fit, minmax(min(100%,22rem),1fr))`: left card **Needs attention**, right card **Activity**. Stacks at narrow widths (390px: one column, Needs attention first).
- Bottom: one grey meta line of counts.
- Nothing sticky inside the tab; only the sub-navigation is sticky. Page scrolls.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| KPI 1 | Tile | link card | value `48`, label `Members`, sub `3 admin` | goes to `#people` | |
| KPI 2 | Tile | link card | label `Pending requests`, value count | `#requests` | `attention` style when > 0 |
| KPI 3 | Tile | link card | label `Paying accounts`, value count of active non-free plan holders | `#billing` (opens Purchases) | value `…` while billing snapshot not loaded |
| KPI 4 | Tile | link card | label `Revenue`, value rupees (e.g. `₹1,24,500`), sub `₹18,900 in 30 days` | `#billing` | `…` until loaded |
| KPI 5 | Tile | link card | If the server sends integer `trials_active`: label `Trials running`, value count. Otherwise label `Trial`, value `On` / `Off` / `…`, sub = trial length (e.g. `30 minutes`) | `#growth` | variant by data |
| KPI 6 | Tile | link card | label `Purchases required`, value `On` / `Off` / `—` | `#purchasesRequired` | |
| KPI 7 | Tile | link card | label `Failed receipts`, sub `last 7 days` | `#health` | attention when > 0 |
| KPI 8 | Tile | link card | label `Abandoned payments`, sub `open over 1 hour` | `#purchases` | never attention |
| KPI 9 | Tile | link card | label `Refund backlog`, sub `pending, approved, failed` (sum of pending + approved-not-refunded + failed) | `#purchases` | attention when > 0 |
| KPI 10 | Tile | link card | label `Walled`, sub `out of the studio` (purchases ON) or `if purchases were required` (OFF) | `#health` | never attention |
| Needs attention | Card heading | H3 | `Needs attention` | | |
| Needs attention | Row | link row: pill + sentence + `→` | see list below | Opens named tab through `go()` (params carried in the hash) | pill tone per row |
| Activity | Card heading | H3 | `Activity` | | |
| Activity | Timeline rows | timeline | title `<Action in words> by <actor email or first 8 chars of id or "unknown">`, relative time, sub `<target_kind> · <target_id>` in a code chip, link `Everything about this target` | goes to `#audit?target=<id>` | warn dot when action matches reset/terminate/revoke/delete/refund |
| Activity | Footer link | text link | `Open the audit log →` | `#audit` | only when rows exist |
| Footer | Meta line | text | `<N> signed in · <N> active this week · <N> organisations · <N> films · <N> online · <N> codes open · counted 4:12 PM` (singular/plural handled) | none | |

Tiles 7-10 read the health report: if the report errored, value `—` with sub `unknown`; while loading, value `…`; if that one slot has `{error}`, value `—`, sub `unknown`, tooltip = server message. Never a zero that reads as healthy.

"Needs attention" list, in rank order (each row only when applicable):
1. Health report failed: pill `Health` (danger) + `The health report could not load: <why>` -> health.
2. Each health check at level warn (not already covered by receipts/payments/refunds/invites): pill `Health` (danger) + the check's observed sentence -> health; level unknown: pill `Unknown` (neutral).
3. Unknown checks among receipts/payments_created/refunds/invite_requests: pill `Unknown` (neutral) + observed text.
4. Receipts: pill `<N>` (warn) + `receipts from the last 7 days have no mail recorded` (singular `receipt ... has`) -> health.
5. Refund requests older than 48h: pill `<N>` (danger) + `refund requests waiting, the oldest 3d` -> purchases.
6. Invite requests: pill `<N>` (warn) + `people are waiting for an invite` (singular `person is waiting for an invite`) -> requests.
7. Other refund requests: pill `<N>` (warn) + `refund requests are waiting for an answer` -> purchases.
8. Abandoned payments: pill `<N>` (neutral) + `payments still open after an hour (abandoned or not yet settled)` -> purchases.

**Tables** none.
**Charts** none (no sparklines in code on this tab).

**States**
- Loading: `kpi` skeleton + 2 `block` skeletons. Activity card: 4 `rows` skeleton. Needs attention while health loads: 3 `rows` skeleton.
- Overview error: error state, title `The numbers could not load`, why = server message, `RETRY`.
- Activity error: title `The audit log could not load`, why, `RETRY`.
- Activity empty: icon `◷`, title `No admin action recorded yet`, body `Every admin write is listed here, newest first.`, stamp `Checked just now`.
- Needs attention empty (health OK): icon `✓`, title `Nothing needs you`, body `The health checks pass, and no receipt, refund, invite or payment is waiting.`, stamp.
- Needs attention with no health report: icon `?`, title `Nothing found so far`, body `The health report did not load, so this is not an all-clear.`
- Unknown/not observable: tiles show `—` + `unknown`, rows show the neutral `Unknown` pill.

**Dialogs & confirmations** none.

**Sample data**
Tiles: Members 48 (3 admin); Pending requests 5 (attention); Paying accounts 11; Revenue ₹1,24,500 (₹18,900 in 30 days); Trials running 7; Purchases required Off; Failed receipts 2 (last 7 days, attention); Abandoned payments 4; Refund backlog 1 (attention); Walled 0 (if purchases were required).
Needs attention: `[2] receipts from the last 7 days have no mail recorded`; `[1] refund request waiting, the oldest 3d`; `[5] people are waiting for an invite`; `[4] payments still open after an hour (abandoned or not yet settled)`.
Activity: `Set billing settings by admin@example.com` 2h ago, `billing_settings · global`; `Refund approved by admin@example.com` 1d ago, `payment · pay_Nx41kQ`.
Footer: `62 signed in · 21 active this week · 9 organisations · 134 films · 3 online · 4 codes open · counted 4:12 PM`.

**Stitch prompt**
Design the Overview tab of a dark violet admin console (near-black ground, violet accent, pill buttons, 16px-radius cards, data-dense but calm). Top: a responsive grid of ten KPI tiles, each a rounded card with a large number, small label and tiny grey sub caption: Members 48 "3 admin", Pending requests 5, Paying accounts 11, Revenue ₹1,24,500 "₹18,900 in 30 days", Trials running 7, Purchases required Off, Failed receipts 2 "last 7 days", Abandoned payments 4 "open over 1 hour", Refund backlog 1 "pending, approved, failed", Walled 0 "if purchases were required"; attention tiles get an amber emphasis. Below, two equal cards side by side: "Needs attention" with link rows (coloured count pill, one sentence, right arrow) and "Activity" with a vertical timeline (dot, bold action by actor, relative time, monospace target chip, link "Everything about this target") plus footer link "Open the audit log →". Bottom: one grey line of counts. Include empty states ("Nothing needs you" with check icon) and a 390px stacked layout.

---

### Launch & health (hash `#health`)

**Purpose** Ask the live project how it is; walk the launch checklist that ends in the Purchases-required switch; probe the four payment edge functions; list receipts not mailed.
**Who sees it** Administrators only. Opens (loads data, probes) when the tab is visited.
**Data source** RPCs `admin_health`, `admin_launch_preview`, `admin_list_invoices`, `admin_list_audit` (filtered `set_billing_settings`, target `billing_settings:global`, limit 50), `admin_resend_receipt` (write), `admin_set_billing_settings` (write, patch `{purchase_required}`). Plus browser POSTs to `<supabase url>/functions/v1/rzp-order`, `rzp-verify`, `rzp-webhook`, `rzp-refund`. Errors pass through `rpc.js`, which words them as one sentence (see States).

**Layout**
1. **Read bar** (flex, space-between): left grey text `Read 3m ago from the live project.` (or `Reading the live project…`); right `REFRESH` button.
2. **KPI row** (3 tiles): `Checks OK`, `Need a look`, `Unknown`. 1280px: 3 across; 390px: 2 then 1 (auto-fit 8.5rem).
3. **Launch checklist card** (full width) containing checklist and the purchases-switch block.
4. **Two-card row** `.ad-cols` (min 22rem each; stacks at 390px): **Payment functions** card | **Receipts not mailed** card.
5. **Slot grid** `.ad-hgrid` `repeat(auto-fit, minmax(min(100%,22rem),1fr))`, align start: up to 11 cards, 2-3 per row at 1280px, 1 at 390px.
Nothing sticky except the sub-navigation. Tables inside cards scroll horizontally.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Read bar | Status text | meta | `Read <rel time> from the live project.` | none | `Reading the live project…` while loading |
| Read bar | Refresh | button | `REFRESH` | reloads health, preview, invoices and switch history | disabled while loading |
| KPI | Checks OK | tile | label `Checks OK`, value `9 of 11` | none | |
| KPI | Need a look | tile | label `Need a look`, value count | none | attention if > 0 |
| KPI | Unknown | tile | label `Unknown`, value count, sub `could not be read` | none | attention if > 0 |
| Launch card | Heading | H3 + pill | `Launch checklist`; pill `<N> failing` (warn) / `<N> unconfirmed` (neutral) / `All passing` (ok) | none | pill shown only when report loaded |
| Launch card | Intro | meta | `The order BILLING.md §19 gives for throwing the switch. Each step is read live; a step the page cannot see is “not checked”, never a pass.` | | |
| Launch card | Checklist (9 steps) | checklist | see list below | none | pass / fail / skip / wait |
| Switch block | Heading | H4 | `The purchases switch` | | |
| Switch block | State line | text + pill with dot | `Purchases required is [OFF]` then ` — nobody is walled; every signed-in member is in.` or `[ON]` then ` — a member with no plan and no trial is walled.` | | ON = warn, OFF = neutral |
| Switch block (OFF) | Preview | paragraph | `**N members** would be walled (M once e-mail grants are counted), of X members: P paid, T in a trial.` (singular `member`) | | |
| Switch block (OFF) | Refusal warning | unknown-style line, role=status | `The server will refuse: N member(s) admitted before purchases existed, whose grandfathered access has run out, would be walled. Give them a plan, a longer trial or an e-mail grant first.` | | only when `can_throw` is false |
| Switch block (OFF) | Who-would-be-walled | `<details>` disclosure | summary `Who would be walled (12)` (or `12 of 80` when truncated) | expands data table | only if members list non-empty |
| Switch block (OFF) | Throw button | primary danger button | `REQUIRE PURCHASES` (`WORKING…` while busy) | opens typed-word dialog | disabled while busy, when `can_throw` is false, or preview not loaded |
| Switch block (OFF) | Helper | meta | `You will be asked to type REQUIRE. The server refuses the switch while it would wall a grandfathered member.` | | |
| Switch block (ON) | Window line | meta + `<time>` | `Turned on 3h ago. One-click rollback stays here for 21h more.`; or `Turned on 2d ago. The 24-hour rollback window has passed; it can still be turned off from Purchases.`; or `The audit log has no row that turned it on, so the 24-hour window is unknown. Rollback is available anyway: the server never refuses it.`; or (log unreadable) `When it was turned on could not be read from the audit log (<why>), so the 24-hour window is unknown. Rollback is offered anyway: the server never refuses it.` | | |
| Switch block (ON) | Rollback | danger button | `ROLL BACK: PURCHASES NOT REQUIRED` (`WORKING…`) | opens confirm dialog | shown when within 24h, window unknown, or log error; else a plain button link `OPEN PURCHASES` (to `#purchases`) replaces it |
| Switch block | Result message | meta or danger line | `Purchases are now required.` / `Purchases are no longer required; everyone is back in.` / the server's own refusal sentence (danger, role=alert) | | |
| Payment functions | Heading + button | H3 + button | `Payment functions` / `RE-PROBE` (`PROBING…`) | re-runs the 4 probes | disabled while running |
| Payment functions | Intro | meta | `An unauthenticated POST to each function. 401, 400 and 503 are answers from a deployed function; 404 is a missing one.` | | |
| Payment functions | Probe list x4 | list: monospace name + pill + grey detail | names `rzp-order`, `rzp-verify`, `rzp-webhook`, `rzp-refund` | none | pills: `Answers` (ok), `Missing (404)` (danger), `Unreachable` (danger), `Server error` (warn), `Not probed` (neutral) |
| Payment functions | Probed time | meta | `Probed 2m ago.` | | |
| Payment functions | Facts | facts list | `Razorpay mode`: pill `TEST` (warn) / `LIVE` (danger) / `Not set` (neutral). `Resend`: pill `Inferred working` (ok) / `Inferred failing` (warn) / `Not observable` (neutral, tooltip `Inferred: the secret is not readable`) + sentence. `Last webhook seen`: pill `Not observable` (neutral, tooltip `No table records a webhook delivery`) | | |
| Receipts card | Heading + count pill | H3 + pill | `Receipts not mailed`, pill count (warn if > 0 else ok) | | |
| Receipts card | Note | meta | `An invoice with a buyer e-mail and no mail recorded. Older ones may pre-date receipt mailing. Resend clears the mark so the receipt is queued again.` | | |
| Receipts card | Resend | button per row | `RESEND` (aria-label `Resend the receipt for <invoice number>`) | confirm dialog, then write | |
| Slot cards | Card | card with heading + level pill | titles below | none | pill words `OK` (ok), `Needs a look` (warn), `Info` (neutral), `Unknown` (neutral) |

Launch checklist steps (in order, each read live; label then note):
1. `Every schema section is present` (from check `sections`).
2. `Resend delivers receipts (BILLING §19.1)`: pass = inferred (note starts `Inferred. `), fail if recent receipts have no mail, else not checked.
3. `The four payment functions answer (BILLING §19.2)`: wait `Probing…`/`Not probed yet.`; pass `All four answered an unauthenticated request.`; fail lists `rzp-refund: missing (404)`; skip `This build carries no Supabase URL to probe.`
4. `Razorpay is on a live key`: pass LIVE, fail TEST (`The key id's prefix says TEST.`), skip when no key.
5. `A real payment has been captured`: note `<N> paid; the last 3d ago. A paid row does not say whether it was test or live.`
6. `A refund has been exercised`: note `The last processed 5d ago.` or `No refund has been processed.`
7. `Every paid plan has its features set (BILLING §19.3)`
8. `No grandfathered member would be walled (BILLING §19.4)`: note `<N> grandfathered member(s) would be walled.`
While no report: single row `Reading the live checks…` (wait).

Slot cards, in order (only those present in the report): `Schema sections`, `Plan features`, `Purchases switch`, `Trial`, `Prices`, `Receipts`, `Payments`, `Refunds`, `Invite requests`, `Purchase wall census`, `Billing settings last changed`. Each shows the check's observed sentence (grey) then a facts list of the slot's scalar fields (label = key with underscores to spaces, capitalised, `_seconds` dropped; `*_age_seconds` shown as `3d old`; ISO dates as relative `<time>`; booleans `Yes`/`No`; a string containing "not observable" becomes a neutral pill `Not observable`; nested objects skipped). Special bodies: **Schema sections** = facts `Expected`, `Present` (count), then a failing checklist `§<n>` + `marker not found: <marker>` per missing section, plus meta `§X, §Y are weak markers: finding one proves the object, not that every statement of its section ran.` **Plan features** = table (below).

**Tables**
- *Who would be walled* (inside the details): `Member` | `Since` | `Trial ended` | `Notes`. Row: `meera@example.com` | `Oct 2, 2026, 11:20 AM` | `4d ago` | `grandfathered, has an e-mail grant` (or `—`). Up to 50 rows; caption `The server lists the first 500.` when truncated. No row actions. Empty: the whole disclosure is omitted.
- *Receipts not mailed* (data table, caption `3 waiting`, max 25 rows): `Invoice` | `Buyer` | `Amount` (right) | `Issued` | (blank header: action). Row: `FMS-2026-0041` | `buyer@example.com` | `₹5,999` | `2d ago` | button `RESEND`. Empty state: icon `✓`, title `Every receipt has a mail recorded`, body `Invoices with a buyer e-mail and no mail time would be listed here.`, stamp.
- *Plan features* (inside the Plan features slot card): `Plan` | `Features on` (right) | `Of keys` (right) | `State`. Rows: `Basic` / `15` / `40` / pill `Set` (ok); `Pro` / `40` / `40` / `Set`; an empty map shows pill `Empty map` (danger); inactive plan appends ` (not on offer)`. No rows: `The server returned no paid plan rows.`

**Charts** none.

**States**
- Loading: 3 `kpi` skeleton tiles + 2 `block` skeletons; receipts card 2 `rows`; preview block 1 `block`.
- Report error: error state, title `The health report could not load`, why = sentence, `RETRY`. The launch card and probe card still draw.
- Per-slot error (`{error, message}`): inside that card a status line `Unknown: <message> (<code>). Nothing here is a pass.` and pill `Unknown`; never a green tick, never an empty list.
- Invoices error: title `The invoices could not load`; preview error: title `Who it would wall could not load`, both with `RETRY`.
- Switch state unknown: `The switch’s state is unknown: <why>. Neither button is offered.` Before the report lands: `Waiting for the live state.`
- RPC wording (`rpc.js`): missing function = `The server has no function <name> (PGRST202).`; refusal = `Administrators only (42501).`; otherwise `<message> (<code>)`; no client = `There is no connection to the project (signed out, or this build carries no Supabase project).`
- Probe details: `HTTP 401: <message>`; `Deployed: answered, but sends no CORS headers (as a webhook should), so the browser cannot read its status`; `No readable answer (no answer in 8 seconds)`; `No readable answer (a network error or a CORS refusal look the same to a page)`; `Probing…`; `Not probed yet`.
- Non-admin: whole console replaced (see shell).
- Not observable: Resend, Last webhook seen, any slot value containing "not observable".

**Dialogs & confirmations**
1. Resend: title `Queue this receipt again?`; body `This clears the “mailed” mark on invoice FMS-2026-0041, so the receipt to buyer@example.com is queued again. It writes to a customer.`; buttons `Resend` (confirm) / cancel. On success toast `Receipt for FMS-2026-0041 queued again.` with action `View in audit log`; failure toast (error type) = server sentence.
2. Throw: title `Require a plan to use the studio?`; body `12 member(s) will be walled until they buy a plan or start a trial. Not passing: <labels with the (BILLING …) suffix removed, joined by "; ">. Rollback stays one click away for 24 hours.` (or `Every launch step is passing. ` in place of the not-passing sentence); buttons `Require purchases` (danger) / cancel; **typed-word confirmation `REQUIRE`**. Success toast `Purchases are now required.` + `View in audit log`. Server refusal stays as a sentence on the card.
3. Rollback: title `Stop requiring purchases?`; body `Everyone who is walled is let back in at once. No plan or trial is changed.`; buttons `Roll back` (danger) / cancel; no typed word. Toast `Purchases are no longer required.` + `View in audit log`.

**Sample data**
KPI: `Checks OK 9 of 11`, `Need a look 1`, `Unknown 1 (could not be read)`.
Checklist: pass Every schema section is present; skip Resend delivers receipts ("No evidence either way: no payment in the last 7 days…"); pass four functions; fail Razorpay is on a live key ("The key id's prefix says TEST."); pass A real payment has been captured ("6 paid; the last 3d ago…"); fail A refund has been exercised ("No refund has been processed."); pass plan features; pass grandfathered.
Switch OFF: `0 members would be walled (0 once e-mail grants are counted), of 48 members: 11 paid, 7 in a trial.`
Probes: `rzp-order` Answers `HTTP 401: Missing authorization header`; `rzp-verify` Answers `HTTP 401`; `rzp-webhook` Answers `Deployed: answered, but sends no CORS headers…`; `rzp-refund` Answers `HTTP 401`.

**Stitch prompt**
Design the "Launch & health" admin tab, dark violet product UI (near-black, violet accent, pill buttons, 16px-radius cards, calm and data-dense). Top bar: grey "Read 3m ago from the live project." and a pill button REFRESH. Three KPI tiles: "Checks OK 9 of 11", "Need a look 1", "Unknown 1 could not be read". A wide "Launch checklist" card with a status pill "2 failing", intro line, and a 9-row checklist using glyphs (check, cross, ellipsis, dash) with notes, ending in a boxed "The purchases switch" section: "Purchases required is [OFF pill] — nobody is walled", a sentence about members who would be walled, a collapsible "Who would be walled" table, and a red pill button REQUIRE PURCHASES with helper text about typing REQUIRE. Next, two cards: "Payment functions" (RE-PROBE button, four rows of monospace function name, status pill, grey detail; facts for Razorpay mode, Resend, Last webhook seen as neutral pills) and "Receipts not mailed" (table with RESEND buttons or a green-check empty state). Finally a grid of small status cards (Schema sections, Plan features table, Trial, Prices, Receipts, Payments, Refunds, Invite requests, Purchase wall census) each with an OK / Needs a look / Unknown pill. Add a typed-confirmation modal and a 390px layout.

---

### Audit log (hash `#audit`)

**Purpose** Read-only, append-only record of who changed what and when, with before/after diffs; filterable, pageable, exportable.
**Who sees it** Administrators only.
**Data source** `admin_list_audit` (params `p_actor`, `p_action` (prefix), `p_target`, `p_from`, `p_to` (ISO, from whole local days), `p_limit` 50, `p_before` keyset cursor). Response `{rows, has_more, next_before}`. Never writes.

**Layout**
1. **Filter form** (`role=search`, aria-label `Filter the audit log`): grid `repeat(auto-fit, minmax(min(100%,11rem),1fr))`, aligned to bottom; 1280px: all 5 fields plus the button group on one or two rows; 390px: single column.
2. **Tools row**: left grey count text, right three chips.
3. **List area**: Timeline view or Table view.
4. Optional inline error, **LOAD MORE** button centred.
5. Footer meta line with an `Append-only` pill.
Nothing sticky in the tab (table header sticky within its scroll box). Page scrolls.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Filter | Actor | text input (id `adAuditActor`) | label `Actor`, placeholder `e-mail or id` | submit with form | autocomplete off |
| Filter | Action | text input | label `Action starts with`, placeholder `e.g. set_` | prefix match | |
| Filter | Target | text input | label `Target`, placeholder `id, kind:id or user id` | | also set by the hash `#audit?target=<id>` |
| Filter | From | date input | label `From` | whole day, browser time zone | |
| Filter | To | date input | label `To` | to end of that day | |
| Filter | Apply | primary pill button (submit) | `APPLY` | runs the query, writes filters to the hash | |
| Filter | Clear | button | `CLEAR` | empties all filters, reloads | disabled when no filter is set |
| Tools | Count | meta | `50 rows loaded, more available (filtered)` (singular `1 row loaded`) | none | blank until loaded |
| Tools | View chip | chip toggle | `Timeline` | switch to timeline | aria-pressed |
| Tools | View chip | chip toggle | `Table` | switch to table | aria-pressed |
| Tools | Export | chip button | `Export CSV` (tooltip `Download the rows loaded here as CSV`) | downloads `audit-log-YYYY-MM-DD.csv` of exactly the loaded rows, columns at, actor, actor_email, action, target_kind, target_id, note, before, after; cells starting with = + - @ are prefixed with an apostrophe | disabled with no rows |
| Timeline row | Title | bold action + text | `<Action in words> by <actor email, or first 8 chars of id, or "unknown">` (e.g. `Set billing settings by admin@example.com`) + relative time (tooltip absolute) | none | warn dot for reset/terminate/revoke/delete/refund actions |
| Timeline row | Target line | code chip + note | `<target_kind> · <target_id>` then ` — <note>` if a note exists | | |
| Timeline row | Before/after | `<details>` | summary `Before and after`, body = diff component | expands | only if before or after is non-null |
| Timeline row | Target chip | chip button | `Everything about this target` (tooltip `Show every row about this target`) | sets Target filter to that id, reloads, scrolls to top | |
| Footer | Load more | pill button | `LOAD MORE` (`LOADING…`) | appends next 50 rows | only when `has_more`; disabled while loading |
| Footer | Append-only | pill (neutral) + text | `Append-only` (tooltip `The server refuses any update or delete of an audit row`) + ` Times are in this browser’s time zone.` | | |

**Tables** (Table view, data table, caption `50 rows loaded`): columns in order `When` | `Actor` | `Action` | `Target` | `Note` | (blank: action). Example row: `Oct 14, 2026, 3:42 PM` | `admin@example.com` | `Set billing settings` | `billing_settings · global` | `Turned purchases switch off` | chip `Everything about this target`. Row actions: the chip only; rows are not clickable. Empty table message: title `No rows`. Density chip in the toolbar.

**Charts** none.

**States**
- Loading/idle: `rows` skeleton, 4 rows.
- Error: title `The audit log could not load`, why = sentence, `RETRY`. A failed Load more keeps the list and adds `More rows could not load` + why + `RETRY`.
- Empty unfiltered: icon `◷`, title `No admin action has been recorded yet`, body `Every admin write lands here, with a before and an after.`, stamp `Checked <time>`.
- Empty filtered: title `No rows match these filters`, body `Clear a filter to widen the search.`, button `CLEAR FILTERS`.
- Diff with no changes: `No fields changed.`
- Role: admins only; the server refuses others (`Administrators only (42501).`).

**Dialogs & confirmations** none (read-only; CSV downloads directly).

**Sample data**
Rows: (1) 3:42 PM, `admin@example.com`, Set billing settings, `billing_settings · global`, note `purchase_required off`, diff Field `purchase_required` Before `true` After `false`. (2) 1:05 PM, `admin@example.com`, Refund approved (warn dot), `payment · pay_Nx41kQ`. (3) Yesterday, `ops@example.com`, Grant plan, `user · 7c1e4a90`, diff `plan` Before `"free"` After `"starter"`.
Filters example: Actor `admin@example.com`, Action starts with `set_`, From `2026-10-01`, To `2026-10-14`.

**Stitch prompt**
Design the "Audit log" admin tab in a dark violet product UI (near-black, violet accent, pill buttons, 16px cards, calm but data-dense). Top: a search form on a card with five labelled inputs in a responsive row (Actor "e-mail or id", Action starts with "e.g. set_", Target "id, kind:id or user id", From date, To date) and two pill buttons APPLY (violet filled) and CLEAR (outlined). Under it a tools row: grey "50 rows loaded, more available" on the left; on the right three chips: Timeline (selected), Table, Export CSV. Main area: a vertical timeline, each entry with a dot (amber for destructive actions), bold "Set billing settings by admin@example.com", relative time, monospace chip "billing_settings · global — note", a collapsible "Before and after" with a three-column Field/Before/After diff, and a small chip "Everything about this target". Below, centred pill button LOAD MORE. Footer: neutral pill "Append-only" and "Times are in this browser’s time zone." Include the alternate sortable Table view (When, Actor, Action, Target, Note), empty and error states, and a 390px layout.

---

### Usage (hash `#usage`)

**Purpose** Which tools are opened and which features are used, from privacy-preserving daily counters; every figure is a floor.
**Who sees it** Administrators only.
**Data source** `admin_usage(p_days)` (schema §43); if the function is missing the error says `The database has no admin_usage() yet — schema section 43 has not been run on it.`; refusal says `The database refused: this account is not an administrator.`

**Layout**
1. **Range bar** `.us-bar` (flex): label `Range`, three chips, flexible spacer, status text, `REFRESH`.
2. Card **Who is here**: heading, 4-tile KPI row, two meta paragraphs.
3. Two-card row `.ad-cols`: **Unused for 14 days** | **Limit hits, by plan** (stack at 390px).
4. Card **Opens by module and week** (heat grid; its container scrolls horizontally).
5. Card **Every module** (table).
6. Card **Feature use by plan** (table).
Nothing sticky inside; page scrolls.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Range bar | Label | meta | `Range` | | |
| Range bar | Range chips x3 | chip group (role=group aria-label `Range`) | `7 days`, `30 days`, `90 days` | sets range, reloads | selected = aria-pressed; default 30 |
| Range bar | Status | meta | `Counting…` or `Counted 2m ago` (tooltip absolute) | | |
| Range bar | Refresh | button | `REFRESH` | refetch | disabled while loading |
| Who is here | Heading | H3 | `Who is here` | | |
| Who is here | KPI | tile | `Active, last 24 hours` (tooltip `People who sent at least one batch of counts in the last 24 hours`) | | |
| Who is here | KPI | tile | `Active, last 48 hours` | | |
| Who is here | KPI | tile | `Counted events, 30 days` (range-dependent) | | |
| Who is here | KPI | tile | `Counting began` with medium date or `Not yet` | | |
| Who is here | Notes | meta | `A weekly active figure is not available, by design: it would need an account id kept for a week, and these counters keep none. Every figure here counts signed-in people who have not turned counting off, so it is a floor, not the whole audience.` and `Source: <source>.` (if provided) | | |
| Unused | Heading | H3 | `Unused for 14 days (2 of 22)` | | |
| Unused | Notes | meta | `Modules with no counted open in the last 14 days. These counts come only from signed-in people who have not turned counting off, so a module listed here may still be used by someone who is not counted.` | | |
| Unused | Warning | meta (warn) | `Counting began Oct 9, 2026, under 14 days ago: every quiet module is expected to look unused until then.` or `Nothing has been counted yet, so every module looks unused.` | | shown if tracking began under 14 days ago or never |
| Unused | Chips | list of module chips | module label e.g. `Songs`, `Visualize` (tooltip `module_open:<id>`) | none | |
| Limit hits | Heading | H3 | `Limit hits, by plan` | | |
| Limit hits | Note | meta | `How often a plan limit stopped someone, ranked by plan. It records that a limit was met and the plan; not which limit, and not who.` | | |
| Limit hits | Total + trend | pill + sparkline | pill `6 in 30 days` (warn if > 0 else neutral); sparkline 140x28 `Limit hits per day` only when more than 1 day of data | | |
| Limit hits | Bar chart | horizontal bars | one per plan, ranked high to low, label `Basic`, value | | |
| Heat | Heading + note | H3 + meta | `Opens by module and week`; `Darker is more opens. Columns are weeks, labelled by the Monday they start (day/month); the first and last may be partial.` | | |
| Heat | Heat grid | chart | see Charts | arrow keys move between cells | |
| Modules | Heading | H3 | `Every module` | | |
| Features | Heading + note | H3 + meta | `Feature use by plan`; `How many times each feature was used, split by the plan of the person using it. Uses, not people: one person using a feature ten times is ten.` | | |

**Tables**
- *Every module* (caption `22 modules, most opened first`, density chip): `Module` | `Opens (30d)` (right) | `Trend` (110x26 sparkline, label `<module> opens per day`) | `Last opened`. Example: `Stripboard` | `412` | sparkline | `Oct 13, 2026`; never-opened shows `never`. Rows not clickable. Empty: `No modules` / `Nothing to list.`
- *Feature use by plan* (caption `7 features`): `Feature` | `Uses (30d)` (right) | one right-aligned column per plan present in the data in this order `No plan`, `Basic`, `Intermediate`, `Pro` (unknown plan ids appended as-is) | `Trend` (100x24 sparkline). `limit_hit` is excluded here (it has its own card). Feature labels: `Script imported`, `PDF exported`, `Word file exported`, `AI request answered`, `Google Drive connected`, `Share link created`, `Screening pass used` (also `Plan limit met` is defined but excluded). Example: `PDF exported` | `318` | `0` | `140` | `122` | `56` | sparkline. Empty: `No feature names` / `The server returned none.`

**Charts**
- *Heat grid*: rows = modules (label truncated to 18 chars with an ellipsis), columns = weeks labelled day/month of their Monday (e.g. `6/10`); cell 26x22px, 3px radius; no axes titles; a cell's fill opacity = its opens divided by the grid maximum (range 0.06 to 0.55); no legend (the note says "Darker is more opens"). Tooltip `Stripboard · 6/10: 112 opens`. Roving focus, arrows move. Hidden table twin: caption `Module opens by week`, header blank + week labels, one row per module.
- *Sparklines* (in tables and Limit hits): 1.5px line over a faint area, a dot on the latest point, no axes; tooltip per day `<n>`; focusable figure tooltip `<label>: latest N (low L, high H)`. With fewer than 2 points a flat baseline. Hidden twin table `Point` / `Value`.
- *Bar* (Limit hits): list rows `[label | track with fill | value]`, label column 5-11rem, fill = value / max; tooltip `Basic: 4`; twin table (aria-hidden since the list is text) `Label` / `Value`.

**States**
- Loading/idle: `kpi` skeleton + 2 `block` skeletons (range bar still shown).
- Error: title `Usage could not load`, why as above, `RETRY` (replaces all content under the range bar).
- Empty pieces: `No modules in the list` / `The server returned no module names.`; Unused empty: icon `✓`, title `Every module was opened`, body `All modules have at least one counted open in the last 14 days.`, stamp; Limit hits empty: icon `✓`, title `No limit was hit`, body `Nothing counted in the last 30 days.`, stamp.
- Role: admins only.

**Dialogs & confirmations** none.

**Sample data**
Who is here: Active 24h `9`; 48h `14`; Counted events 30 days `3,482`; Counting began `Oct 9, 2026`.
Unused (2 of 22): chips `Songs`, `Visualize`, with the young-tracking warning.
Limit hits: `6 in 30 days`; bars Basic 4, No plan 2.
Heat rows: Script 120/98/140/60; Stripboard 112/90/131/70; Breakdown 150/101/96/55; columns `22/9`, `29/9`, `6/10`, `13/10`.
Features: Script imported 87 / 12 / 40 / 28 / 7; PDF exported 318 / 0 / 140 / 122 / 56; AI request answered 204 / 0 / 61 / 99 / 44.

**Stitch prompt**
Design the "Usage" admin tab, dark violet product UI (near-black, violet accent, pill buttons, 16px-radius cards, data-dense but calm). Top bar: label "Range", three chip toggles "7 days", "30 days" (selected), "90 days", spacer, grey "Counted 2m ago", outlined pill REFRESH. Card "Who is here": four KPI tiles (Active last 24 hours 9, Active last 48 hours 14, Counted events 30 days 3,482, Counting began Oct 9, 2026) plus a grey caveat paragraph that every figure is a floor. Two cards side by side: "Unused for 14 days (2 of 22)" with an amber warning line and module chips, and "Limit hits, by plan" with a pill "6 in 30 days", a tiny sparkline and ranked horizontal bars. Then card "Opens by module and week": a heat grid, modules as rows, weeks labelled 22/9, 29/9, 6/10, columns, violet cells darker for more opens. Then a table "Every module" (Module, Opens (30d), Trend sparkline, Last opened) and a table "Feature use by plan" (Feature, Uses, No plan, Basic, Intermediate, Pro, Trend). Include skeleton, error with RETRY, and 390px layouts.

---

### Sync & storage (hash `#sync`)

**Purpose** Show how fresh each account's cloud sync is, how much is stored, whether the app and the database agree on which data kinds ("scopes") may be saved, what refused saves browsers reported, and who is near a plan limit. Changes nothing.
**Who sees it** Administrators only.
**Data source** `admin_sync_overview()` and `admin_limit_pressure()` (schema §44); client scope list read from the running code (`StudioCloud.KEY_BY_SCOPE`). Missing function: `The database has no admin_sync_overview() yet — schema section 44 has not been run on it.`

**Layout**
1. **Head bar** (flex): spacer, status text, `REFRESH`.
2. **KPI row** (5 tiles; 1280px about 5-6 across; 390px 2 across).
3. **Scope card** "Client and database agree on scopes?" full width (turns alarm-styled when the client is ahead).
4. Two-card row `.ad-cols`: **When did members last sync?** | **Refused saves reported by browsers**.
5. Card **Largest accounts** (table).
6. Card **Rows per scope** (table).
7. Card **Near a limit** (pill row, notes, table).
Nothing sticky inside; page scrolls; tables scroll horizontally.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Head | Status | meta | `Checking…` or `Checked 1m ago` | | |
| Head | Refresh | button | `REFRESH` | refetch both reads | disabled while either loads |
| KPI | Tiles | tiles | `Members`; `Accounts with synced work`; `Stored rows`; `Stored in all` (bytes, e.g. `18 MB`; tooltip `Logical size of the stored JSON, not the compressed size on disk`); `Refused saves, 14 days` | none | last tile attention when > 0 |
| Scope card | Heading | H3 | `Client and database agree on scopes?` | | alarm style when ahead |
| Scope card | Loud alert (when client ahead) | role=alert block | heading `Client ahead of database`; text `This build can save a kind of data that the database refuses: write_goals. Every save of it fails (23514) and waits in the person's queue. Run the schema section that widens the project_data scope CHECK before this build goes live.` (plural: `<N> kinds of data`, `Every save of them`) | | |
| Scope card | In-step line | pill with dot + text | `[In step]` + ` All 14 scopes this build can save are allowed by the database.` | | when none ahead |
| Scope card | Warnings | meta (warn) | `Rows already stored under a scope the CHECK no longer lists: <list>.` and `The error counter lists scopes the CHECK does not allow: <list>.` | | only if present |
| Scope card | Summary | meta | `Client: 14 scopes (read from the code running in this tab). Database CHECK: 15.` + ` The database also allows <list>, which this build does not save.` | | |
| Buckets | Heading + note | H3 + meta | `When did members last sync?`; `48 active members, by the newest save that reached their account. "Never synced" includes people who simply work on one device.` | | |
| Buckets | Bar chart | bars | `Within a day`, `1 to 7 days`, `7 to 30 days`, `Over 30 days`, `Never synced` | | |
| Errors | Heading + note | H3 + meta | `Refused saves reported by browsers`; `Since <date or "two weeks ago">. Browsers report only the kind of data and the refusal code, once per page load, and not at all if the person turned counting off; so this is a floor.` | | |
| Errors | Total + trend | pill + sparkline | pill `3 reported` (warn if > 0 else ok); sparkline 140x28 `Refused saves per day` only if more than 1 day | | |
| Errors | Warning | meta (warn) | `Refusals on scopes the CHECK does not allow: <scope> (<count>), ….` | | only if present |
| Errors | Bar chart | bars | one per refusal code, high to low; tooltip note is the code meaning | | |
| Largest | Heading | H3 | `Largest accounts` | | |
| Near limit | Heading | H3 | `Near a limit` | | |
| Near limit | Enforcement pill | pill with dot | `Limits are enforced` (warn; tooltip `purchases_required() is on: the database refuses writes past a cap`) or `Limits are not enforced` (neutral; tooltip `purchases_required() is off: nobody is walled or capped yet`) | | |
| Near limit | Count | meta | `3 accounts are at 80% or more of a cap` (singular `1 account is`) | | threshold from server, default 80 |
| Near limit | Explanation | meta | enforced: `Past a film, share or seat cap the database refuses the write.` else `Purchases are not required, so no one is capped today: this is a view of who would be.` followed by ` Storage is never enforced by anything yet, so a full storage meter is a heads-up only. This is a report: the console sends nothing to these people.` | | |

There is deliberately no "send an upgrade nudge" button.

Refusal code meanings (bar tooltip and Code-cell tooltip): `23514` A CHECK refused it (an unknown kind of data); `42501` Row security refused it; `P0401` Not a studio member; `P0402` A plan limit; `P0429` Rate limit; `23505` A conflict; `PGRST202` Function missing; `network` The request never arrived; `other` Something else.

**Tables**
- *Largest accounts* (caption `Top 10 by stored size. Open a row for the customer.`): `Account` | `Films` (right) | `Rows` (right) | `Stored` (right, formatted B/KB/MB/GB) | `Last sync` (relative). Example: `producer@example.com` | `6` | `412` | `3.4 MB` | `2h ago` (or `never`). Row action: whole row is focusable and opens the customer drawer (`#people?user=<id>`). Empty: title `No accounts have synced anything`, body `There are no projects on the database yet.`
- *Rows per scope* (caption `1,980 rows, 18 MB in all (logical size of the stored JSON)`): `Scope` (a scope not allowed by the CHECK shows the name plus a danger pill `not allowed`) | `Rows` (right) | `Stored` (right) | `Last write`. Example: `scenes` | `640` | `5.1 MB` | `12m ago`; `write_goals` | `38` | `12 KB` | `—`. No row actions. Empty: `Nothing stored yet` / `project_data has no rows.`
- *Refusals by kind and code* (inside Errors, caption `By kind of data and code`): `Scope` | `Code` (tooltip meaning) | `Count` (right). Example: `write_goals` | `23514` | `3`.
- *Near a limit* (caption `Heaviest first, 10 of 14 shown. Open a row for the customer.`): `Account` | `Plan` | `Fullest` (right, e.g. `92%`) | `Meters` (meters only for metrics at or above the threshold). Meter labels: `Films`, `Share links`, `Collaborators`, `Seats`, `Storage`; text `9 of 10 · 90%` (storage formatted as bytes, e.g. `92 MB of 100 MB · 92%`). Row opens the customer drawer. Empty: title `Nobody is near a limit`, body `No account is at or above the threshold.`

**Charts**
- *Bar* charts (`Members by last sync`, `Refusals by code`): horizontal ranked rows `[label | track+fill | value]`, label column 5-11rem (4-7rem at 390px), fill width = value / max; tooltip `Within a day: 31`; no legend, no axis (value printed at the row end); twin table `Label` / `Value` (aria-hidden because the list is real text).
- *Sparkline* for refused saves per day: line + faint area + latest-point dot; hidden twin `Point` / `Value`.
- *Meters* (limit gauge) described in section 0.

**States**
- Loading/idle: `kpi` skeleton + 2 `block` skeletons; the Near-a-limit card has its own `rows` skeleton (3 rows).
- Overview error: title `Sync health could not load`, why, `RETRY`; the Near a limit card still renders below it.
- Pressure error: inside its card, title `Limit pressure could not load`, why, `RETRY`.
- Database returned no scopes: error state in the scope card, title `The database did not list its allowed scopes`, why `admin_sync_overview() returned no scopes from the project_data CHECK constraint, so the comparison cannot be made.` (no Retry button).
- Refusals empty: icon `✓`, title `No refused saves reported`, body `Nothing has been refused in the last two weeks, or nobody reporting has met a refusal.`, stamp.
- Role: admins only.

**Dialogs & confirmations** none (the customer drawer is opened by row click and is owned by the People screen).

**Sample data**
KPIs: Members `48`; Accounts with synced work `31`; Stored rows `1,980`; Stored in all `18 MB`; Refused saves, 14 days `3` (attention).
Scope card: alarm, `Client ahead of database` for `write_goals`.
Buckets: Within a day 31, 1 to 7 days 8, 7 to 30 days 4, Over 30 days 2, Never synced 3.
Errors: `3 reported`; `write_goals` / `23514` / 3.
Largest accounts: `producer@example.com` 6 films 412 rows 3.4 MB 2h ago; `director@example.com` 4 / 288 / 2.2 MB / 1d ago.
Near a limit: `Limits are not enforced`; `2 accounts are at 80% or more of a cap`; `studio-chennai@example.com` Basic 92% meters Films `9 of 10 · 90%`, Storage `92 MB of 100 MB · 92%`.

**Stitch prompt**
Design the "Sync & storage" admin tab in a dark violet product UI (near-black, violet accent, pill buttons, 16px-radius cards, data-dense but calm). Top right: grey "Checked 1m ago" and an outlined pill button REFRESH. A row of five KPI tiles: Members 48, Accounts with synced work 31, Stored rows 1,980, Stored in all 18 MB, Refused saves 14 days 3 (amber emphasis). Next a full-width card "Client and database agree on scopes?" with a red-bordered alert "Client ahead of database" explaining that write_goals is refused with code 23514, plus a grey summary "Client: 14 scopes. Database CHECK: 15." (also show the calm variant with a green "In step" pill). Two cards side by side: "When did members last sync?" with five ranked horizontal bars (Within a day, 1 to 7 days, 7 to 30 days, Over 30 days, Never synced) and "Refused saves reported by browsers" with an amber pill "3 reported", sparkline, bars by code and a small table. Then tables "Largest accounts" (clickable rows) and "Rows per scope" (red "not allowed" pill), and a card "Near a limit" with a neutral "Limits are not enforced" pill and rows containing usage meters (Films 9 of 10 · 90%, Storage 92 MB of 100 MB · 92%). Include empty and error states and a 390px layout.


---

# People screens: People, Customer 360 drawer, Support, Access & sharing

## Admin console: People group screens (spec extracted from code)

Sources: `src/pages/admin.js`, `src/ui/gate-ui.js`, `src/ui/access-admin.js`, `src/ui/admin-customer.js`, `src/pages/admin-tabs/support.js`, `src/ui/admin-kit.js`, `src/styles/admin.css`, `src/styles/gate.css`, `src/ui/dialog.js`.

### Shared frame and components (applies to all four screens)

- **Page**: h1 "Console" (eyebrow "Administration"), line "Signed in as <email>". Under it a status bar (`.ad-status`, role region "Environment"): pill "Razorpay TEST" (warn) / "Razorpay LIVE" (danger) / "Razorpay not set" (neutral); pill "Purchases required: ON" (warn) / "OFF" / "unknown"; right side "Refreshed <time>" (or "Refreshing…") + REFRESH button.
- **Navigation**: 11 tabs in 4 groups. At >=1100px a left vertical sub-nav 13.5rem wide (sticky, under the shell band) with group headings (mono, uppercase, tiny, muted) and content column to the right (gap `--s6`). Below 1100px: one horizontally scrolling tab strip. People group = **People** (`#people`), **Support** (`#support`), **Access & sharing** (`#requests`). Tabs may carry a numeric badge (max 99): `requests` = pending invite requests; `support` = number of open rows.
- **Roles** (from `studio_role()`): owner, finance, support. Hidden-not-enforced; the server re-checks every RPC (42501) and its refusal sentence is shown as sent. If `studio_role` RPC is missing (schema §45 not run) the role resolves to `owner`. Capability map: notes = owner/support/finance; trial = owner/support; plan = owner/finance; session = owner/support; reset = owner/support; invoice = owner/finance; money = owner/finance; ticket = owner/support; passes = owner/support. Unknown role shows no write controls.
- **Components**: pill (tones ok, warn, danger, neutral, accent; optional leading dot), KPI tile (big number, label, optional sub), meter (label, bar, "X of Y · N%"), timeline (dot, bold title, relative time, sub, optional link), `dataTable` (caption left, toolbar chips right incl. density chip "Comfortable"/"Compact"; sticky-less scroll wrapper), empty state (icon glyph, title, body, optional "Checked <time>" stamp), error state (role alert, title, why, RETRY button), skeleton (rows/kpi/block shimmer lines), `gt-table` (plain table, 13px-ish small text, hairline row rules, header muted semibold), chip (`.ad-chip` toggle with `aria-pressed`, active = brand wash fill + brand border).
- **Dialogs** (`dialog.js`): centered card, h3 title, paragraphs, optional "Type <word> to confirm." hint + text field (confirm disabled until exact match, trimmed), footer buttons [Cancel] [Confirm]; the confirm is red when `danger`. `askText` adds one text input; Cancel returns null, empty confirm returns "".
- **Toasts**: success toasts after writes carry action "View in audit log" (closes the drawer, goes to `#audit`) in the drawer and Support flows. Errors are red toasts with the server sentence.
- **Time**: relative ("3h ago", "just now", "in 2d"), absolute in tooltip. Currency: paise formatted as rupees.

---

### People tab (hash `#people`)

**Purpose** One page to see every member, give access by e-mail, see everyone who has ever signed in, and see organisations; any person row opens the Customer 360 drawer.
**Who sees it** Any studio administrator. All four blocks are read-only except buttons inside Members (END SESSION / DISABLE / CLEAR) and Give access (form + REVOKE). Those buttons are NOT role-gated in the People tab (they are shown by member state only: see Elements); the server decides. The tab as a whole is hidden from non-admins ("Administrators only" state).
**Data source** `admin_overview`, `admin_list_accounts`, `admin_list_users` (Everyone signed in, Organisations, via `g.admin.overview/listAccounts/listUsers`); Members block: `listCodes`, `listMembers`, `listRedemptions`, `listRequests`, `listProjects` (gate admin helpers, shared state); Give access: `Growth.admin.settings`, `Growth.admin.listEmailGrants`, `Billing.listPlans`, `Growth.admin.grantEmail`, `Growth.admin.revokeEmailGrant`; END SESSION / DISABLE: `g.admin.terminate`; CLEAR: `g.admin.resetUser`; row click: `admin_customer` (see drawer).

**Layout** Single column inside the content area, blocks stacked, in this order: (1) Members, (2) Give access, (3) Everyone signed in, (4) Organisations. Blocks 3 and 4 appear only once the overview has loaded (`ov.phase === 'ok'`); block 1 and 2 appear after the gate console data loads (until then a muted "Loading…" line under a "Members" shell). At 1280px: sub-nav left (13.5rem) + one content column; tables full width with horizontal scroll if too wide. At 390px: tab strip at top; each block full width; tables scroll sideways inside `.gt-scroll`; row-action buttons wrap. Nothing in the tab is sticky except the sub-nav (>=1100px) / tab strip. Each block heading is an h3 (display font, large, margin above).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Members | heading | h3 | `Members (<n>)` | none | n = member count |
| Members | table header | th x5 | `Email`, `Role`, `Session`, `Where`, (blank) | none | |
| Members | member row | tr, tabindex 0, aria-label "Open <email>" | email in cell 1 | click or Enter/Space opens the Customer 360 drawer for that member (`#people?user=<id>`); clicks on buttons inside the row do not | |
| Members | Role cell | text | `member` / `admin` / `<role> (disabled)` | none | disabled members show "(disabled)" |
| Members | Session cell | text | `Active · <n seconds/minutes ago>` (heartbeat under 90s) / `Idle since <date, time>` / `None` | none | |
| Members | Where cell | text | `<Browser> on <OS> · <ip>` e.g. `Chrome on macOS · 103.21.4.18` | none | blank when unknown |
| Members | END SESSION | button.btn | `END SESSION` | RPC terminate (no confirm); toast "Session ended. If that device is still open it can take the session back." | only when session is Active |
| Members | DISABLE | button.btn.danger | `DISABLE` (aria "Disable <email>") | danger confirm dialog, then terminate + disable | hidden when already disabled or role admin |
| Members | CLEAR | button.btn.danger | `CLEAR` (aria "Clear <email>") | danger confirm dialog, then reset user | hidden for admins |
| Give access | heading | h3 | `Give access` | | |
| Give access | form (panel card) | form | fields below | submit grants | |
| Give access | E-mail | input email, required, max 320 | label `E-mail`, placeholder `name@example.com` | | |
| Give access | As | select | label `As`; options `Member`, `Admin` | | default Member |
| Give access | Plan | select | label `Plan`; options `No plan (membership only)` then every non-free plan from the plans table (names e.g. Basic, Intermediate, Pro) | | |
| Give access | For how long | select | label `For how long`; options `Until I remove it`, `For a number of days` | | default "Until I remove it" |
| Give access | Days | input number 1 to 3650 step 1, default 30 | label `Days` | | field is always drawn; only used when "For a number of days" |
| Give access | submit | button.btn.primary | `GIVE ACCESS` | validates then grants | disabled while busy |
| Give access | success note | span, role status | `Given — applied now.` or `Given — it applies when <email> first signs in.` | fades after 4 seconds | |
| Give access | help line | meta p | `Applies now, or at the first Google sign-in. No invite code needed.` | | |
| Give access | grants table | table | see Tables | | |
| Everyone signed in | heading | h3 | `Everyone signed in (<n>)` | | |
| Everyone signed in | row | tr, tagged openable (tabindex 0, aria "Open <email>", pointer cursor, hover sunk background) | name (bold) + e-mail below in muted | opens drawer (looks up id by e-mail via `admin_list_users`, cached 60s); if not found toast "That person could not be found." | |
| Everyone signed in | Standing tag | `.ad-tag` | `admin` / `member` / `disabled` / `waiting` / `declined` / `not a member` | none | admin, disabled, waiting, declined have distinct tag colours |
| Organisations | heading | h3 | `Organisations (<n>)` | | |
| Organisations | row | tr | see Tables | not clickable | |

**Tables**

1. Members. Columns: `Email` | `Role` | `Session` | `Where` | (actions). Example row: `meera.nair@example.com` | `member` | `Active · 12 seconds ago` | `Chrome on macOS · 103.21.4.18` | [END SESSION] [DISABLE] [CLEAR]. Row action visibility as above. Empty: no table is drawn at all (only the heading `Members (0)`); there is no empty message.
2. Give-access grants. Columns: `E-mail` | `As` | `Plan` | `Until` | `Applied` | (action). Example: `karthik.s@example.com` | `Member` | `Intermediate` | `Until removed` | `At first sign-in` | [REVOKE]. "Plan" is `—` when none; "Until" is a medium date or `Until removed`; "Applied" is `Yes, <date>` / `Not yet` (account exists but not applied) / `At first sign-in` (no account). REVOKE is a plain button. Empty (below the form): `No access has been given by e-mail.` (muted line).
3. Everyone signed in. Columns: `Who` | `Standing` | `Last sign-in` | `Joined` | `Films` | `Orgs` | `Now`. Example: Ananya Rao (bold) / `ananya.rao@example.com` (muted) | `member` tag | `14 Oct 2026, 9:42 am` | `2 Oct 2026` | `3` | `1` | `Active` (blank unless a heartbeat is under 90s old). Row opens drawer. Empty: `Nobody yet.`
4. Organisations. Columns: `Organisation` | `Owner` | `Plan` | `Seats` | `Films` | `Since`. Example: **Lantern Reel Studios** | `producer@lanternreel.example.com` | `pro` | `3 of 5 · 1 invited` | `7` | `29 Sep 2026`. "Plan" is the raw plan id or `—`. Not clickable. Empty: `None yet.`

**States**
- Loading: Members shell shows muted `Loading…`; blocks 3 and 4 are simply absent until the overview lands; Give access shows `Loading…` until its data is ready.
- Error: gate console failure shows a red inline alert bar (`gt-error`, red left rule on a red wash) with the server sentence, default `The console could not load.`; Give access error shows its message in the muted line. Overview failure draws nothing in this tab (the Overview tab shows the retry card).
- Give access, schema §32 not run: `Access by e-mail is not available on this database yet (schema section 32 has not run).`
- Role-limited: the People tab does not hide Members buttons by role; refusal arrives as an error toast. Drawer rows are role-aware (see drawer).
- Refusals/validation toasts: `That does not look like an e-mail address.` ; `A grant lasts 1 to 3650 days, or until you remove it.`; server errors as sent (fallback `Access was not given.` / `Access was not revoked.`).
- A REFRESH button (`REFRESH`) sits at the bottom of the Members shell.

**Dialogs & confirmations**
- DISABLE (Members): title `Disable <email>?`; body `Their session ends and their cloud sync stops. Nothing on their own device is touched.`; buttons `Cancel` / `OK` (red). No typed confirmation.
- CLEAR (Members): title `Clear <email>?`; body paragraph 1 `This removes their membership, their invite request, the invite code they used (freeing it) and their session — so their next sign-in starts as a new one.` paragraph 2 `Their projects, their organisation and any payment are NOT touched.`; buttons `Cancel` / `OK` (red). No typed confirmation here (the drawer version does require one). Success toast (6s): `<email> is a stranger again — membership removed, request cleared, 1 code use freed, device lock cleared, signed out.` (parts appear only when true; ends `signed out` or `session left in place`).
- REVOKE (grant): title `Revoke access for <email>?`; body `The plan this grant gave is taken back (a plan they bought is not), an admin role it gave goes back to member, and if this grant is what let them in, they are let out.`; buttons `Cancel` / `Revoke` (red). Toast `Access revoked for <email>.`

**Sample data**
Members: meera.nair@example.com (member, Active, Chrome on macOS), rohit.menon@example.com (admin, Idle since 13 Oct 2026, 6:10 pm, Edge on Windows), divya.k@example.com (member disabled, None). Give access: karthik.s@example.com Member / Intermediate / Until removed / At first sign-in; sneha.p@example.com Admin / — / 31 Dec 2026 / Yes, 12 Oct 2026. Signed in: 42 people. Organisations: Lantern Reel Studios, Madras Frame Co-op (seats 2 of 3).

**Stitch prompt**
Design a dark violet admin web UI, "People" tab of a filmmaker studio console, 1280px desktop plus 390px mobile. Left vertical sub-navigation grouped Run / People / Money / Product with People active, a thin status bar of pills (Razorpay TEST, Purchases required: OFF, Refreshed 9:42 am, REFRESH button). Main column stacks four blocks with display-font h3 headings. 1) "Members (12)": hairline-ruled data table (Email, Role, Session, Where, actions) with pill-shaped small buttons END SESSION, red DISABLE, red CLEAR; rows are clickable and hover-lit. 2) "Give access": a 16px-radius card with a 5-field grid (E-mail, As, Plan, For how long, Days), a primary pill GIVE ACCESS, muted helper line, and a grants table with REVOKE. 3) "Everyone signed in (42)": table with name over muted e-mail, a coloured standing tag, dates, counts, "Active" marker. 4) "Organisations (4)": table with seats "3 of 5 · 1 invited". Calm, data-dense, 16px cards, pill buttons, tokens only. Mobile: tab strip on top, tables scroll sideways.

---

### Customer 360 drawer (hash `#people?user=<user id>`; opens from any row naming a person, also from Support PERSON buttons and Access-queue rows)

**Purpose** One sheet per person: who they are, how they stand, money, devices, work, notes, and the few actions that change them.
**Who sees it** Any administrator. Role limits what is drawn: support sees give-time, notes, end session, disable, clear; finance sees give-plan, issue-invoice, refunds link, notes; owner sees all. Everyone sees the read-only sections. No work content is ever shown: counts and sizes only.
**Data source** `admin_customer(p_user)` (one jsonb: identity, standing, trial, payments, invoices, refunds, refund_requests, referral, redemptions, sessions, work, orgs, notes, audit); `studio_role`; `Billing.listPlans` (only fetched for roles with plan capability); writes: `admin_add_note`, `admin_grant_trial` (via `Billing.admin.grantTrial`), `admin_grant_plan` (`Billing.admin.grantPlan`), `admin_issue_invoice`, `admin_terminate_session`, `admin_reset_user`; lookup by e-mail `admin_list_users`.

**Layout** A right-hand sheet (modal, role dialog) on top of a scrim; width min(32.5rem, 100vw) = 520px at 1280px, full width at 390px; full height, border-left hairline, large shadow, slides in from the right (240ms; no motion under reduced motion). Two grid rows: (a) sticky header (raised surface, hairline bottom border): left block = h2 (person's name, or e-mail if no name, or "Person" while loading) with sub block under it (muted e-mail line, only if a name exists, else "Administrator" for admins; then a pill row: standing pill with dot + "Admin" accent pill for admins); right block = header action buttons then a `CLOSE` button; header wraps to two rows on narrow widths (title block min 14rem). (b) scrolling body (only this scrolls; page behind is locked): 12 collapsible sections stacked, 16px gap. Esc, scrim click and CLOSE close it and remove `?user=` from the hash. Focus is trapped. Inputs inside are full-width, small text. At 390px the definition lists (label/value) collapse to one column (value under label).

**Header actions (sticky), exact labels and role hiding**
1. `GIVE TIME` (plain button) — drawn when the role has trial capability (owner, support) OR plan capability (owner, finance), so all three roles see it. Click scrolls to and opens the "Give & manage" section and focuses its first field.
2. `ADD NOTE` — drawn when role has notes capability (all three roles). Scrolls to Notes section, opens it, focuses the textarea.
3. Third slot toggles: `END SESSION` when role has session capability (owner/support) AND the person's device-lock heartbeat is under 90s old; otherwise `COPY E-MAIL` (copies, toast `E-mail copied.`, error toast `Copy is not available here.`). A finance admin always sees COPY E-MAIL.
4. `CLOSE` always.

**Sections** (each a `<details>` card: header row = title left, optional count pill, `+`/`–` indicator right; open by default; fold state is remembered across refreshes after an action). Order as drawn: Identity & standing, Trial clock, Give & manage (omitted entirely if no parts apply), Payments, Invoices, Refunds & requests, Referral, Sessions & devices, Work, Organisations, Notes, Audit slice.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Header | title | h2 | name or e-mail | | |
| Header | standing pill | pill with dot | `Disabled` (danger) / `Not a member` (neutral) / `Paying · <Plan>` (ok) / `Grandfathered` (accent) / `On trial` (accent) / `Walled` (danger) / `Member` (neutral) | | evaluated in that priority order |
| Header | Admin pill | pill accent | `Admin` | | only if role is admin |
| Identity & standing | standing line | p | pill + sentence: Disabled: `Their session ended and sync stopped <rel> ago.` ; Not a member: `Signed in with Google but has not been let in.` ; Paying: `On the <Plan> plan.` ; Grandfathered: `Admitted before purchases were required; a year-long trial stands in for a plan.` ; On trial: `Trial ends <rel>.` ; Walled: `A member with no plan and no running trial: they meet the purchase wall.` ; Member: `A member.` or `A member. Purchases are not required, so nothing is walled.` | | |
| Identity & standing | facts (dl) | label/value pairs | `E-mail`, `Name`, `Joined` (date + relative), `Last sign-in`, `E-mail confirmed` (Yes/No), `Role` (Administrator / Member / Not a member), `Member since`, `Plan` (plan name or `No plan`), `Entitled` (`Yes`, `Yes (purchases are not required)`, `No`), `Admitted by` (e.g. `Standard · Demo`), `E-mail grant` (`Member · Intermediate · until 31 Dec 2026 · applied` / `waiting for first sign-in`; `no plan`, `until removed` variants), `User id` (mono code) | | empty values show `—` |
| Identity & standing | Codes used | h4 + list | `Codes used` then lines `<Pass type> · <label> <relative time>` | | only if redemptions exist |
| Trial clock | no-trial text | muted p | `No trial has been started for this person.` | | when `started_at` missing |
| Trial clock | facts | dl | `State` (pill `Running` ok / `Ended` neutral, with dot), `Started`, `Length` (e.g. `7 days`, or `<n> minutes`), `Source`, `Covers`, `Ends` (absolute + relative), `Time left` (`6d 4h`, `3h 20m`, `45m 10s`; only while running) | | |
| Give & manage | Give trial time form | h4 + form | `Give trial time`; select `For`: `1 hour`, `1 day`, `3 days`, `7 days` (default), `30 days`; input `Note (optional)` (max 200, placeholder `Why`); primary `GIVE TIME` | confirm dialog then write | role trial (owner, support) |
| Give & manage | Grant a plan form | h4 + form | `Grant a plan`; select `Plan` (non-free plans from the plans table); select `Days`: `30 days`, `90 days`, `1 year`, `About ten years`; input `Note (optional)` (placeholder `Why`); primary `GRANT PLAN` | confirm dialog then write | role plan (owner, finance) AND plans loaded |
| Give & manage | Clear this person | red-tinted panel | h4 `Clear this person`; text `Removes their membership, their invite request, the code they used (freeing it) and their session, so their next sign-in starts as a new one. Their films, organisation and payments are not touched.`; red button `CLEAR…` | typed-confirm dialog | role reset (owner, support) AND person is not an admin AND not you AND (is a member OR has redemptions) |
| Payments | count pill + list | rows | each row: bold plan name (or `Payment`), status pill (`Paid` ok, `Granted` accent, `Pending`/`Created` warn, `Failed` danger, `Refunded`/`Partially refunded` neutral), right-aligned amount (e.g. `₹7,999`; currency suffix if not INR); sub line: relative time, ` · <Period>`, ` · code <PROMO>`, ` · <amount> off`, mono Razorpay payment id, ` · invoiced` | | |
| Payments | `ISSUE INVOICE` | mini button | `ISSUE INVOICE` (aria "Issue an invoice for <amount>") | confirm dialog | role invoice (owner, finance), status paid, amount over 0, no invoice yet |
| Invoices | count pill + list | rows | bold invoice number (e.g. `FMS/2026-27/0007`), amount; sub: plan name, issued time, `e-mailed <time>` or `not e-mailed` | | empty: `No invoices.` |
| Refunds & requests | count pill (warn if any request pending) | h4 `Requests`, h4 `Refunds` | Request row: bold category, status pill (`Pending` warn, `Approved` accent, `Declined` neutral, `Processed` ok, `Failed` danger), sub `asked <time> · decided <time>`, quote of their message, `Our note: <admin note>`. Refund row: bold amount, status pill, sub time + ` · <reason>` | | empty: `No refunds and no refund requests.` |
| Refunds & requests | link | text link | `Refunds are decided in Purchases →` | closes drawer, goes to `#refunds` | role money (owner, finance) only |
| Referral | facts + credits | dl + rows | `Code` (mono, or `None`); credit rows: amount, pill `Paid` ok / other warn, sub created / `paid <time>` | | empty: `No referral credits.`; count pill = credits |
| Sessions & devices | device lock | dl | `Device` (`Chrome on macOS · <ip>`), `State` (pill `Active now` ok / `Idle` neutral), `Last heartbeat`; or muted `No device holds the one-window lock.` | | live = heartbeat under 90s |
| Sessions & devices | sign-ins | dl + list | `Signed-in sessions` (count), `Last active`; list `<Browser on OS or Unknown device> · <ip> <time>` | | if provider table unavailable: `The sign-in provider’s session table did not answer, so sign-ins are not listed.` |
| Sessions & devices | buttons | row | `END SESSION` (plain), `DISABLE` (red) | end: confirm; disable: danger confirm | END: role session AND live lock; DISABLE: role session AND is member AND not disabled AND not admin AND not you |
| Work | KPI row | 3 tiles | `Films` (count, sub like `2 feature, 1 short`), `Stored` (e.g. `1.4 MB`), `Last sync` (relative or `Never`) | | |
| Work | facts | dl | `Collaborating on`, `Share links made` | | |
| Work | By kind of data | h4 + meters | one meter per scope, green: label `<Scope> · <n> rows` (`1 row`), value `X KB of Y KB · N%` relative to the largest scope | | only if scopes exist |
| Work | footnote | muted p | `Counts and sizes only. Titles and contents are never shown in the console.` | | |
| Organisations | count pill | rows | `Owns` rows: bold name, neutral pill plan (`No plan` if none), sub `3 of 5 seats · 2,048 MB storage · until <date>`. `Member of` rows: bold name, neutral role pill, warn pill if status not active, sub `joined <time>` | | empty: `Not part of an organisation.` |
| Notes | add form | form | textarea (3 rows, max 1000, placeholder `What did you learn? Visible to administrators only.`, aria "A note about this person"); primary `ADD NOTE`; muted `Up to 1000 characters. Notes cannot be edited or deleted.` | submit writes immediately (no confirm) | form drawn for all three roles (notes capability); toast `Write something first.` if blank |
| Notes | thread | list | each note: bold author e-mail (or `An administrator`) + relative time, body (pre-wrap) on a sunk background card | | empty: `No notes yet.`; count pill |
| Audit slice | timeline | timeline | title = humanised action (e.g. `Admin grant trial`), relative time, sub `by <actor> — <note>`; then link `The full log is in Audit log →` (closes drawer, `#audit`) | | empty: `No admin has changed anything about this person.`; count pill |

**Tables** The drawer has no `<table>`; lists are `cu-rows` (card-like rows: main line, sub line, optional button). Example payment row: **Intermediate** `Paid` ₹7,999 / `3h ago · Yearly · code DIWALI10 · ₹800 off · pay_Qx81aB2cD3eF4g · invoiced`. Example invoice: **FMS/2026-27/0007** ₹7,999 / `Intermediate · 4 Oct 2026 · e-mailed 4 Oct 2026`. Row actions only `ISSUE INVOICE` on payments.

**States**
- Loading: drawer opens immediately with title `Person` and a 6-line row skeleton; refreshes after a write are quiet (no skeleton; scroll position kept).
- Error: error state in the body: title `This person could not load`, why = server sentence (fallback `The server did not say why.`), button `RETRY`. A deep link that cannot open: drawer titled `Could not open this` with `This could not load` + RETRY.
- Role-limited: buttons absent (not disabled). Unknown role: nothing writable. Finance sees no trial form, no END SESSION/DISABLE/CLEAR; support sees no plan form, no ISSUE INVOICE, no refunds link.
- Refusals: server sentence in a red toast.
- Not found from a list: toast `That person could not be found.`

**Dialogs & confirmations**
- End session: title `End <email>’s session?`; body `Their open window is signed off the studio now. Nothing on their device is touched and they can sign straight back in.`; `Cancel` / `End session`. Success toast `Session ended for <email>.` + action View in audit log.
- Disable: danger; title `Disable <email>?`; body `Their session ends and their cloud sync stops until they are let in again. Nothing on their own device is touched.`; `Cancel` / `Disable` (red). Toast `<email> is disabled.`
- Clear: danger; title `Clear <email>?`; body `This removes their membership, their invite request, the invite code they used (freeing it) and their session, so their next sign-in starts as a new one.` / `Their projects, their organisation and any payment are NOT touched.`; hint `Type <email> to confirm.` + input (placeholder = the e-mail); `Cancel` / `Clear this person` (red, disabled until exact e-mail typed). Toast `<email> is a stranger again — membership removed, request cleared, 1 code use freed, signed out.`
- Give trial: title `Give <email> <length>?` (e.g. `Give ananya.rao@example.com 7 days?`); body `A fresh trial of <length> starts for them now and replaces any trial clock they have. It does not refuse a second trial, and it makes them a member if they are not one.`; `Cancel` / `Give <length>`. Toast `Gave <email> <length>.`
- Grant plan: title `Grant <email> the <Plan> plan for <n> days?`; body `They get the plan now at no charge. A zero-rupee “granted” payment is recorded against them, and they become a member if they are not one.`; `Cancel` / `Grant plan`. Toast `<Plan> granted to <email>.`
- Issue invoice: title `Issue an invoice for <amount>?`; body `A Bill of Supply is numbered now from the gapless series for this financial year. A number is never reused, so this cannot be undone.`; `Cancel` / `Issue invoice`. Toast `Invoice <number> issued.`
- Add note: no dialog. Toast `Note added.`

**Sample data**
Header: **Ananya Rao**, `ananya.rao@example.com`, pill `Paying · Intermediate`. Identity: Joined 2 Oct 2026, Last sign-in 3h ago, E-mail confirmed Yes, Role Member, Entitled Yes, Admitted by `Standard · Diwali batch`. Trial: Ended, 7 days, source Code, covers All features. Payment: Intermediate Paid ₹7,999 invoiced. Referral code ANANYA10 with 1 credit ₹500 Paid. Sessions: Chrome on macOS, 103.21.4.18, Active now; 2 signed-in sessions. Work: Films 3 (2 feature, 1 short), Stored 1.4 MB, Last sync 12m ago; meters Script 640 KB, Scenes 410 KB. Orgs: Owns Lantern Reel Studios (3 of 5 seats). Note by rohit.menon@example.com: "Asked about GST invoice; sent bill of supply." Audit: `Admin grant trial` by rohit.menon@example.com.

**Stitch prompt**
Design a right-side detail sheet "Customer 360" for a dark violet admin product UI, 520px wide on desktop, full-screen on mobile, over a dimmed scrim. Sticky raised header: name "Ananya Rao" with muted e-mail, a green "Paying · Intermediate" pill with dot, buttons GIVE TIME, ADD NOTE, END SESSION and CLOSE. Scrolling body of twelve collapsible 16px-radius cards with +/– indicators and count pills: Identity & standing (label/value list, user id in mono), Trial clock (Running pill, time left), Give & manage (Give trial time form, Grant a plan form, red-tinted "Clear this person" danger panel with CLEAR… button), Payments (rows with status pill, rupee amount, small ISSUE INVOICE pill button), Invoices, Refunds & requests (quoted messages), Referral, Sessions & devices (Active now pill, END SESSION, red DISABLE), Work (three KPI tiles plus green storage meters), Organisations, Notes (textarea, ADD NOTE, note cards), Audit slice (timeline). Data-dense but calm, pill buttons, hairline borders.

---

### Support tab (hash `#support`)

**Purpose** A manual queue of everything needing a human reply: tickets logged by hand from the support mailbox, pending refund requests, pending invite requests.
**Who sees it** Any administrator may read the queue. Owner and support (ticket capability) get write controls: status select, ASSIGN TO ME / UNASSIGN, NOTE, and the Log a ticket form. Finance reads only and sees a notice card instead of the form. Refund and invite rows are never edited here; they link to Purchases / Access queue.
**Data source** `admin_list_support(p_status null, p_limit 500)`; writes `admin_update_ticket(p_id,p_status,p_assignee,p_note,p_unassign)`, `admin_log_ticket(p_email,p_subject,p_body)`; PERSON opens the drawer (`admin_customer`). Tab badge = count of rows with status open.

**Layout** Top to bottom: (1) intro line; (2) filter bar with three labelled chip groups; (3) data table card (caption + toolbar chips, then the table); (4) "Log a ticket" card (or the read-only notice). At 1280px the filter groups sit in one wrapped row (gap 16px between groups); the table is full content width with seven columns; the Request column holds three stacked lines. At 390px: groups wrap onto separate lines, the table scrolls horizontally inside its scroller, form fields stack to one column. Nothing sticky except the shell sub-nav.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Intro | meta line | p | `A manual queue: refund requests, invite requests, and tickets an administrator logs by hand from the support mailbox.` | | |
| Filters | Status group (label `Status`) | 5 chips with count | `Active <n>` (not closed; default on), `Open <n>`, `Waiting <n>`, `Closed <n>`, `All <n>` | sets filter, redraws | `aria-pressed`; active chip brand wash |
| Filters | Source group (`Source`) | 4 chips | `All`, `Tickets <n>`, `Refunds <n>`, `Invites <n>` | | default All |
| Filters | Assigned group (`Assigned`) | 3 chips | `Anyone`, `Me`, `Nobody` | | default Anyone |
| Table toolbar | caption | meta | `<shown> of <total> in view` | | |
| Table toolbar | Reload chip | chip | `Reload` (title "Load the queue again") | refetches | |
| Table toolbar | density chip | chip | `Comfortable` / `Compact` | toggles density (saved in the browser) | |
| Row | Source pill | pill | `Ticket` (neutral), `Refund` (warn), `Invite` (accent) | | |
| Row | Request cell | 3 lines | bold subject; muted e-mail (or `—`); optional detail line | | tooltip shows detail/subject |
| Row | Status pill (with dot) | pill | `Open` (warn), `Waiting` (accent), `Closed` (ok) | | |
| Row | Assigned | text | assignee e-mail or `Nobody` (tickets only), else `—` | | |
| Row | Notes | right-aligned count | number (tickets only) else `—` | | |
| Row | Logged | time | relative, absolute on hover | | |
| Row actions (ticket, writer role) | status select | select | options `Open`, `Waiting`, `Closed` (aria "Status of <subject>") | on change writes immediately; toast `Marked <status>.` | |
| Row actions | assign | mini button | `ASSIGN TO ME` / `UNASSIGN` (if assigned to you) | writes; toast `Assigned to you.` / `Unassigned.` | |
| Row actions | note | mini button | `NOTE` | opens text dialog | |
| Row actions (refund row) | link-button | `OPEN IN PURCHASES` | goes to `#refunds` | |
| Row actions (invite row) | link-button | `OPEN REQUEST` | goes to `#admin-console` (Access & sharing) | |
| Row actions | person | mini button | `PERSON` (aria "Open <email>") | opens Customer 360 drawer | only when the person is known: invite rows always; others if the e-mail matches a signed-in user |
| Log form | card heading | h3 | `Log a ticket` | | |
| Log form | help | meta | `For a message that arrived at the support@ mailbox. Nothing is sent to the person from here.` | | |
| Log form | Their e-mail | input email required max 254 | label `Their e-mail`, placeholder `name@example.com` | | |
| Log form | Subject | input text required max 200 | label `Subject` | | |
| Log form | What they said | textarea 4 rows max 4000 | label `What they said`, placeholder `Paste or summarise the message (up to 4000 characters)` | | |
| Log form | submit | primary | `LOG TICKET` | writes; toast `Ticket logged.` | disabled while busy |
| Log form (non-writer) | notice card | h3 + meta | `Log a ticket` / `Your role (<role or none>) can read this queue but not change it. Logging and updating tickets needs the support role.` | | finance |

**Tables** Support queue. Columns: `Source` | `Request` | `Status` | `Assigned` | `Notes` (right-aligned) | `Logged` | (actions, no header). Example row: `Ticket` | **GST invoice not received** / `ananya.rao@example.com` / "Paid on 4 Oct, no mail yet" | `Open` | `rohit.menon@example.com` | `2` | `3h ago` | [status select: Open] [UNASSIGN] [NOTE] [PERSON]. Refund example: `Refund` | **Refund request: duplicate payment** / `meera.nair@example.com` | `Waiting` | `—` | `—` | `1d ago` | [OPEN IN PURCHASES] [PERSON]. Invite example: `Invite` | **Invite request** / `guest.writer@example.com` | `Open` | `—` | `—` | `20m ago` | [OPEN REQUEST] [PERSON]. Rows are not themselves clickable. Closed tickets are the only closed rows. Empty (no rows at all): icon ✓ stamp-style, title `The queue is empty`, body `No tickets are logged, no refund request is waiting and nobody is waiting for an invite.`, "Checked <time>". Empty with filters: icon ◇, title `Nothing matches these filters`, body `Widen Status or Source to see more.`

**States**
- Loading: intro line then 5-row skeleton.
- Error: error card, title `The queue could not load`, why = server sentence (fallback `The queue could not load.`), button `RETRY`.
- Role-limited: finance sees no per-row write controls for tickets and the notice card (above). Role not yet known: the form area is absent until the role resolves.
- Write refusals: red toast with server sentence (fallbacks `The ticket was not changed.` / `The ticket was not logged.`). Success toasts carry action `View in audit log`.

**Dialogs & confirmations**
- NOTE: text dialog titled `Add a note to “<subject>”?`; body `Kept with the ticket for administrators; the audit log records that a note was added. It is not sent to anyone.`; input placeholder `Up to 2000 characters`; buttons `Cancel` / `Add note`. Empty text does nothing. Toast `Note added.`
- Status change, assign, unassign, log: no confirmation.

**Sample data**
Rows: (1) Ticket, "GST invoice not received", ananya.rao@example.com, Open, assigned rohit.menon@example.com, 2 notes, 3h ago. (2) Ticket, "Cannot export call sheet PDF", vikram.j@example.com, Waiting, Nobody, 0, 1d ago. (3) Refund, "Refund request: duplicate payment", meera.nair@example.com, Waiting, 2d ago. (4) Invite, "Invite request", guest.writer@example.com, Open, 20m ago. (5) Ticket closed "Change billing name", Closed, 6d ago. Counts: Active 4, Open 2, Waiting 2, Closed 1, All 5.

**Stitch prompt**
Design the "Support" tab of a dark violet filmmaker-studio admin console, 1280px and 390px. Left grouped sub-navigation with Support active and a small warn badge "2". Content: a one-line muted intro, then a filter bar with three labelled chip groups (Status: Active 4, Open 2, Waiting 2, Closed 1, All 5; Source: All, Tickets, Refunds, Invites; Assigned: Anyone, Me, Nobody) where the selected chip has a violet wash and border. Below, a data-dense table card with caption "4 of 5 in view", Reload and Comfortable chips, columns Source pill (Ticket neutral, Refund amber, Invite violet), Request (bold subject, muted e-mail, detail), Status pill with dot, Assigned, Notes, Logged, and tiny pill action buttons (status select, ASSIGN TO ME, NOTE, PERSON, OPEN IN PURCHASES). Last, a 16px-radius "Log a ticket" card: e-mail, subject, message textarea, primary pill LOG TICKET. Calm, hairline rules, mobile scrolls table sideways.

---

### Access & sharing tab (hash `#requests`; the section id inside is `#admin-console`)

**Purpose** Decide who gets in: the invite-request queue, issue and manage invite codes and screening passes, make a demo link, see redemptions, and manage screening passes and film share links.
**Who sees it** Any administrator sees everything. Screening-pass and share-link buttons (+7 DAYS, +30 DAYS, REVOKE) need the passes capability (owner, support); finance sees those lists without buttons. The invite queue, code and demo controls are not role-gated in the UI (server decides).
**Data source** `listRequests`, `listCodes`, `listMembers`, `listRedemptions`, `listProjects` (gate console, shared state); `decideRequest`, `recoverRequest`, `resetUser`, `terminate`, `createCode`, `revokeCode`; `admin_list_passes`, `admin_list_shares`, `admin_revoke_pass`, `admin_extend_pass`, `admin_revoke_share`. Tab badge = pending request count (from overview).

**Layout** One column, blocks stacked, with a refresh button at the very bottom. Order: (1) `Invite requests (n waiting)` table, with a collapsed "Decided" disclosure; (2) `Issue a code` form; (3) `Demo link` block; (4) `Codes (n)` table; (5) `Recent redemptions and screening opens` list; (6) the `Sharing` wrapper holding `Screening passes` (id `screening-passes`) then `Share links` (id `share-links`); (7) `REFRESH`. At 1280px the form fields sit in an auto-fit grid (cards min 14rem wide, typically 3 per row; 5 fields); tables full width. At 390px grids go to one column, tables scroll sideways, button groups wrap. The Their-note column in the queue is capped about 22rem and wraps.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Queue | heading | h3 | `Invite requests (<n> waiting)` | | |
| Queue | empty | muted p | `Nobody is waiting.` | | |
| Queue | table header | th | `Who`, `Asked`, `Their note`, `From`, (blank) | | |
| Queue | row | tr, tabindex 0, aria "Open <email>" | | opens the Customer 360 drawer | |
| Queue | APPROVE | primary button (aria "Approve <email>") | `APPROVE` | approves, no confirm; toast `<email> is in. They are through the gate on their next visit.` | |
| Queue | DECLINE | red button | `DECLINE` | text dialog (below) | |
| Decided | disclosure | details | `Decided (<n>)` (collapsed) | expands list; first 30 shown | |
| Decided | row | line + actions | `<date time> — <email> — <status> by <decider> — “<note>”` | | |
| Decided | `LET THEM IN` | primary | `LET THEM IN` (aria "Let <email> in") | undoes decline; toast `<email> is in after all. The decline is undone and the cooling-off with it.` | declined rows only |
| Decided | `CLEAR` | red | `CLEAR` | clear dialog | hidden for admins and for you |
| Decided | `SHOW ALL (<n>)` / `SHOW FEWER` | button | | toggles | when more than 30 decided |
| Issue a code | heading | h3 | `Issue a code` | | |
| Issue a code | Kind | select | label `Kind`; `Standard invite — makes an account`, `Screening pass — read-only, one project` | | |
| Issue a code | Uses | number 1 to 1000, default 1 | label `Uses (opens, for a pass)` | | |
| Issue a code | Expires after | select | label `Expires after`; `2 hours`, `24 hours`, `7 days` (default), `30 days`, `Never` | | |
| Issue a code | Project | select | label `Project (screening pass)`; `Choose a project…` then film titles | | needed for passes |
| Issue a code | Label | text max 120 | label `Label`, placeholder `Who is it for?` | | |
| Issue a code | submit | primary | `ISSUE CODE` | creates | validation toasts below |
| Issue a code | help | meta | `A code is spent when its holder signs in, and buys them a 7-day trial; tier locks apply as usual.` | | |
| Issue a code | result | line | `New code: ` + mono `ABCD-EFGH-JKLM` + `COPY CODE`; for standard codes also `Or share the link: ` + mono link + primary `COPY LINK` | copy to clipboard; toasts `Code copied.` / `Invite link copied — it opens the landing page and starts a 7-day trial on sign-in.` | after creation; typed values are kept across reloads |
| Demo link | heading + help | h3 + meta | `Demo link` / `Opens the Dragon sample with no sign-in; work stays on their device.` | | |
| Demo link | Uses | number 1 to 1000, default 50 | label `Uses` | | |
| Demo link | Expires after | select | label `Expires after`, default `7 days` | | |
| Demo link | create | primary | `CREATE DEMO LINK` | creates a standard code labelled "Demo" | |
| Demo link | result | line | `Demo link: ` + mono link + primary `COPY DEMO LINK` | toast `Demo link copied — it opens the invite page, lets them in with no sign-in and lands on the Dragon sample.` | after creation |
| Codes | heading | h3 | `Codes (<n>)` | | |
| Codes | empty | muted | `None issued yet.` | | |
| Codes | row buttons | buttons | `COPY LINK` (active standard codes), red `REVOKE` (active codes) | | |
| Redemptions | heading | h3 | `Recent redemptions and screening opens` | | |
| Redemptions | empty | muted | `Nothing redeemed yet.` | | |
| Passes | block | div | h3 `Screening passes` + meta `Read-only links to one film. Revoke ends a pass now; extend moves its expiry out.` | | |
| Passes | row buttons | buttons | `+7 DAYS`, `+30 DAYS` (aria "Extend <code> by 7 days"), red `REVOKE` (aria "Revoke <code>") | dialogs below | role passes and not revoked; +days only if it has an expiry; REVOKE only if Active |
| Shares | block | div | h3 `Share links` + meta `Links people made to share a film. No link address is shown here. Revoke ends the link; anybody who already joined through it keeps their access.` | | |
| Shares | row button | red | `REVOKE` (aria "Revoke the share link for <film>") | dialog | role passes and link active |
| Bottom | refresh | button | `REFRESH` | reloads console data | |

**Tables**
1. Invite requests (pending). Columns: `Who` | `Asked` | `Their note` | `From` | (actions). Example: **Kavya Iyer** / `kavya.iyer@example.com` | `13 Oct 2026, 7:15 pm · asked 2×` | `Assistant director on a Tamil short, would like to try the stripboard.` | `Safari on iOS` | [APPROVE] [DECLINE]. Display name above e-mail only if known. Empty: `Nobody is waiting.`
2. Decided (list, not a table): `12 Oct 2026, 4:30 pm — vikram.j@example.com — declined by rohit.menon@example.com — “Please use your work address.”` with [LET THEM IN] [CLEAR].
3. Codes. Columns: `Code` | `Kind` | `Label` | `Used` | `Expires` | `State` | (actions). Example: mono `K7QM-92XD-PL4T` | `Invite` (or `Pass · <film title>`) | `Diwali batch` | `3 / 25` | `20 Oct 2026, 11:59 pm` (`—` if never) | `Active` (also `Revoked`, `Expired`, `Used up`; plain text) | [COPY LINK] [REVOKE]. Empty `None issued yet.`
4. Redemptions (list, up to 50): `<date time> — K7QM-92XD-PL4T — meera.nair@example.com`; variants ` — <typed email> (typed, not verified)` and ` — anonymous viewer`, plus ` · access <id>`.
5. Screening passes. Columns: `Code` | `Film` | `Made by` | `Used` | `Expires` | `State` | (actions). Example: mono `T4WB-71NC-QD8S` with muted label `Festival jury` | `Dragon: Rise of the Reel` | `rohit.menon@example.com` | `4 / 10` | `25 Oct 2026, 6:00 pm` (or `Never`) | pill with dot `Active` (ok) / `Revoked` (danger) / other neutral | [+7 DAYS] [+30 DAYS] [REVOKE]. Empty: icon ◇, title `No screening passes`, body `Issue one under Issue a code above; it will be listed here.`
6. Share links. Columns: `Film` | `Owner` | `Gives` | `Made by` | `Made` | `Expires` | `State` | (actions). Example: `Monsoon Diaries` | `meera.nair@example.com` | `Viewer` (Capitalised role) | `meera.nair@example.com` | `10 Oct 2026` | `Never` | pill `Active` ok / `Ended` neutral | [REVOKE]. Empty: icon ◇, title `No share links`, body `Nobody has shared a film by link yet.`

**States**
- Loading: muted `Loading…` under the heading before data arrives; passes and shares show a 3-row skeleton each.
- Error (console): red alert bar with server sentence (fallback `The console could not load.`). Passes/shares: error card title `Screening passes could not load` / `Share links could not load`, why, RETRY.
- Role-limited: finance sees passes and shares lists with no action buttons.
- Validation toasts: `Choose the project the pass opens.`; `A screening pass needs an expiry.`; server refusals as sent (fallbacks `The code was not created.`, `The demo link was not created.`, `That did not work.`).
- Buttons disable during their own request (one click, one call).

**Dialogs & confirmations**
- DECLINE: text dialog; title `Decline <email>? They can ask again after seven days.` (first paragraph), body `A line for them (optional):`, placeholder `Optional note`, buttons `Cancel` / `Decline`. The note is shown to the person. Empty note allowed.
- CLEAR: same wording as the People-tab CLEAR dialog (danger, `Cancel` / `OK`, no typed confirmation); toast ends with `device lock cleared` variants.
- REVOKE code: danger; title `Revoke this code?`, body `Nobody can redeem or open it again. Accounts already made with it are not affected.`; `Cancel` / `OK`.
- Revoke pass: danger; title `Revoke screening pass <CODE>?`; body `Nobody can open the screening room with it again, including people who hold the link now. The row stays in this list.`; `Cancel` / `Revoke pass`. Toast `Pass <CODE> revoked.`
- Extend pass: title `Extend pass <CODE> by <7|30> days?`; body `It will expire on <date time>. If it has already expired it counts from now, and it opens again.`; `Cancel` / `Extend <n> days`. Toast `Pass <CODE> extended by <n> days.`
- Revoke share: danger; title `Revoke the share link for <film>?`; body `The link stops working now. People who already joined through it keep the access they were given; that is not touched here.`; `Cancel` / `Revoke link`. Toast `Share link revoked.`
- APPROVE, LET THEM IN, ISSUE CODE, CREATE DEMO LINK, copy buttons: no confirmation.

**Sample data**
Queue: Kavya Iyer (kavya.iyer@example.com, asked 2x, Safari on iOS); Arjun D (arjun.d@example.com, no note, Chrome on Windows). Codes: K7QM-92XD-PL4T Invite "Diwali batch" 3/25 Active; DEMO-5H2J-9PLA Invite "Demo" 18/50 Active; T4WB-71NC-QD8S Pass "Festival jury" 4/10 Active. Redemptions: `13 Oct 2026, 8:02 pm — K7QM-92XD-PL4T — meera.nair@example.com`. Share link: Monsoon Diaries / meera.nair@example.com / Viewer / Active.

**Stitch prompt**
Design the "Access & sharing" tab for a dark violet filmmaker-studio admin console, desktop 1280px and mobile 390px, sub-nav left with a violet badge "2". Stack blocks with display-font headings: "Invite requests (2 waiting)" table (Who with e-mail, Asked, Their note, From, APPROVE primary pill and red DECLINE), a collapsed "Decided (14)" disclosure with LET THEM IN and CLEAR; an "Issue a code" 16px-radius card with a five-field grid (Kind, Uses, Expires after, Project, Label), ISSUE CODE, and a result line showing a mono code, COPY CODE and COPY LINK; a "Demo link" card (Uses, Expires after, CREATE DEMO LINK, copy result); "Codes (12)" table with mono codes and state text; "Recent redemptions" list; "Screening passes" table with state pills and +7 DAYS, +30 DAYS, red REVOKE; "Share links" table. REFRESH at bottom. Hairline rules, calm data-dense, pill buttons, tables scroll sideways on mobile.


---

# Money, controls and global surfaces: Purchases, Growth, Controls, banner, states, dialogs

## Admin console: Money tabs, Controls tab, global surfaces

Design-handoff spec extracted from code (worktree `admin-fixes`). Sources: `src/pages/admin.js`, `src/ui/admin-kit.js`, `src/ui/admin-charts.js`, `src/styles/admin.css`, `src/ui/access-admin.js`, `src/ui/billing-admin.js`, `src/ui/refund-admin.js`, `src/ui/invoice-panels.js`, `src/ui/plan-features.js`, `src/ui/growth-admin.js`, `src/pages/admin-tabs/controls*.js`, `src/ui/site-banner.js`, `src/styles/site-banner.css`, `src/ui/dialog.js`, `src/ui/chrome.js` (toast).

### 0. Shared shell and components (read first)

**Page frame (every admin screen).** `main` holds, top to bottom: header (`Administration` eyebrow, `Console` h1, `Signed in as <email>` meta line, shown only to an admin); the status bar; then `.ad-body`. Column max-width 80rem, centred, 24px side padding (16px below 720px).

**Status bar** (`role=region`, aria-label `Environment`; admins only). Left: two pills with a leading dot. Pill 1: `Razorpay TEST` (warn/amber), `Razorpay LIVE` (danger/red), `Razorpay not set` (neutral); tooltip says it comes from the public key id prefix. Pill 2: `Purchases required: ON` (warn), `Purchases required: OFF` (neutral), `Purchases required: unknown` (neutral; tooltip `Section 32 has not answered`). Right (margin-left auto, wraps): meta `Refreshed <time>` (or `Refreshing…` while loading) and a secondary button `REFRESH` (disabled while loading).

**Navigation.** Eleven tabs in four groups: Run (Overview, Launch & health, Audit log), People (People, Support, Access & sharing), Money (Purchases, Growth), Product (Usage, Sync & storage, Controls). At 1100px and over: a 13.5rem vertical sub-nav in the left column (group headings in mono uppercase micro text, sticky under the site chrome), tab content in the right column. Under 1100px: one horizontally scrolling tab strip with the group headings inline. A tab can carry a numeric badge (max 99): Access & sharing = pending invite requests; Purchases = refund requests waiting. The URL hash picks the tab (`#purchases`, `#growth`, `#controls`). A fragment inside a tab (`#billing`, `#tiers`, `#promos`, `#features`, `#invoices`, `#purchasesRequired`) opens that tab. `#<tab>?user=<id>` opens the right-hand drawer.

**Components (admin-kit).**
- Pill: rounded, tone ok / warn / danger / neutral / accent, optional dot.
- KPI tile (`.ad-stat`): big number, small mono uppercase label, optional sub line, optional link (whole tile), optional attention state.
- Card (`.ad-card`): `h3` heading (`.ad-card-h`), optional meta line, content.
- Data table (`dataTable`): top bar with caption (left, meta text) and a density chip (right) reading `Comfortable` or `Compact` (toggles, aria-pressed); table with column headers; rows that can be keyboard-focusable; empty state inside. Older tables (`.gt-table`) sit inside a horizontal scroller.
- Field grid: auto-fill columns, min 9.5rem; labels are mono uppercase micro text, muted, bottom-aligned so wrapped labels do not push inputs down.
- Buttons: `.btn` (outlined pill), `.btn.primary` (filled violet pill, glow), `.btn.danger` (red).
- Empty state: icon glyph, title, body, optional action button, optional `Checked <time>` stamp.
- Error state (`role=alert`): bold title, reason sentence (default `The server did not say why.`), `RETRY` button.
- Skeleton: shimmering placeholder rows / KPI tiles / block.
- Saved note: `.ba-saved` inline `role=status` text next to a form's button, clears itself after 2.5 s (4 s for grants).

---

### Purchases tab (hash `#purchases`)
**Purpose** The money half of the console: the Purchases-required switch, tiers and grants, payments and refunds, invoices, promo codes and the plan-feature matrix, in one scroll.
**Who sees it** Any account the server reports as studio admin (`studio_status().role === 'admin'`). Every RPC re-checks `is_studio_admin()`; a forced-open page gets 42501. Non-admins never reach the tab (see Global states). The tab badge is the count of refund requests with status `pending` on a `paid` payment. The Controls-tab roles (finance can do refunds, invoices, payments, promo codes, referral payouts; owner can do everything) are enforced by the server, not drawn differently here.
**Data source** `admin_get_billing_settings` (switch), `admin_set_billing_settings`, plans via `Billing.listPlans/refreshPlans`, `admin_list_payments(200)`, `admin_billing_overview`, `admin_list_promo_codes`, `admin_list_refunds`, `admin_list_refund_requests`, `refund_requests_enabled` / `admin_set_refund_requests_enabled`, `admin_set_plan`, `admin_set_promo_code`, `admin_grant_plan`, `admin_list_members` (via the gate, for the grant picker), `admin_list_invoices`, `admin_resend_receipt`, edge function `rzp-refund`, `admin_decide_refund_request`.

**Layout** One column of six blocks stacked with 32px gaps (each block is a grid with 12px gap), top to bottom:
1. Purchases required switch (panel, id `purchasesRequired`).
2. Tiers & grants (id `tiers`): heading `Plans & prices`; plan cards in a grid (auto-fit, min 24rem, so 2 across at 1280px inside the content column, 1 at 390px); one-line note; then `Promo codes` is NOT here (see 4). Then `Grant a plan` form.
3. Billing / payments (id `billing`): six KPI tiles in a row (auto-fit min 7.5rem: 6 across at 1280px, 2 across at 390px), `Payments (N)` ledger table, `Refund requests (N waiting)` block (id `refunds`), `REFRESH` button.
4. Invoices (id `invoices`), heading `Invoices`.
5. Promo codes (id `promos`): table, then `Add a code` form.
6. Plan features (id `features`), heading `Plan features`, the matrix (~40 rows) last.
Tables scroll horizontally inside their own scroller; nothing sticky except the sub-nav. Order inside the tab in the DOM: switch, tiers, payments, invoices, promos, features (note: grant form is inside the tiers block, promo form is inside the promos block).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Switch | Heading | h3 | `Purchases required` | none | none |
| Switch | Checkbox + label | checkbox | `Purchases required` | Reverts the tick at once, opens the confirmation dialog (see Dialogs). Only on Yes does it call `admin_set_billing_settings({purchase_required})`, toast, notify billing change | disabled while saving; unchecked = OFF |
| Switch | State sentence | meta | ON: `On: everyone who has not bought a plan is blocked until they buy, including people using the studio now.` OFF: `Off: the studio is free; nothing is walled or capped.` | none | `data-acc-state` on/off |
| Switch | Loading | meta | `Loading…` (or the load error) | none | while the access state loads |
| Switch | Missing | meta | `This switch is not available on this database yet (schema section 32 has not run). Until it runs, the studio behaves as it always has.` | none | replaces the checkbox |
| Tiers | Heading | h3 | `Plans & prices` | none | none |
| Tiers | Plan card (one per plan, form) | card | header: bold plan name, mono id (`starter`, `indie`, `pro`; the free row reads `free · the no-plan state: what a trial or a lapsed member has; never sold or shown as a plan`), badge `not for sale` when inactive | none | free row has no price or listing fields |
| Tiers | Name | text input (max 40) | label `Name` | none | none |
| Tiers | Price | text input, decimal | label `Price (₹, once)`, placeholder `not for sale`, value in rupees | none | blank saves 0 (not for sale); not on free row |
| Tiers | Four limits | number inputs (min 0) | `Cloud projects`, `Collaborators / film`, `Live share links`, `Org seats`; placeholder `unlimited` | none | blank = unlimited |
| Tiers | Chrome extension | select | `Chrome extension`: `Included` / `Not included` | none | none |
| Tiers | Listing | select | `Listing`: `For sale` / `Hidden` | none | not on free row |
| Tiers | One line | text input (max 200), full width | `One line` | none | none |
| Tiers | Save | primary button | `SAVE BASIC` / `SAVE INTERMEDIATE` / `SAVE PRO` / `SAVE NO PLAN` (plan name uppercased) | Calls `admin_set_plan`, reloads, shows `Saved.` beside it | error toast on failure |
| Tiers | Footnote | meta | `Price in ₹, paid once, for good. A blank limit is unlimited.` | none | none |
| Grant | Heading | h3 | `Grant a plan` | none | none |
| Grant | Who | select | `Who`: `Choose a member…`, then `email` (`email (disabled)` for disabled accounts) | none | none |
| Grant | Plan | select | `Plan` (every non-free plan name) | none | none |
| Grant | Why | text (max 300), wide | `Why (bank transfer, comp…)` | none | none |
| Grant | Submit | button | `GRANT` | `admin_grant_plan`; note `Granted — full access, for good.` | toast `Choose who the grant is for.` if empty |
| Grant | Footnote | meta | `For good; admits a non-member; recorded as a ₹0 payment.` | none | none |
| Payments | KPI tiles (6) | stat tiles | `paid, last 30 days`; `paid, all time`; `payments, 30 days`; `on a paid plan` (sub: `12 Basic · 7 Intermediate · 3 Pro`); `granted by hand`; `refunds` | none | none |
| Payments | Heading | h3 | `Payments (N)` | none | none |
| Payments | Row action | danger button | `REFUND` (aria-label `Refund <email>, <plan>, <amount>`) | Opens the refund dialog | only when status `paid`, has a Razorpay payment id, amount > 0 and no refund in flight; column exists only if refunds section has run |
| Refunds | Heading | h3 | `Refund requests (N waiting)` | none | none |
| Refunds | Switch | checkbox | `Let customers request refunds from the Purchase page` | `admin_set_refund_requests_enabled`; toast `Customers can now request refunds from Settings.` or `Refund requests are off. Customers no longer see the form.` | disabled while saving; reverts on error |
| Refunds | Meta | text | `A request refunds nothing until you approve it. Policy: refund.html.` | none | none |
| Refunds | Row actions | danger + outline buttons | `APPROVE`, `DECLINE` | `APPROVE` opens refund dialog with the request; `DECLINE` opens decline dialog | shown only while request is pending/approved and payment is `paid`; `DECLINE` only while pending |
| Payments | Refresh | button | `REFRESH` | reloads all billing data | none |
| Invoices | Table | table | see Tables | none | none |
| Invoices | Row buttons | outline | `DOWNLOAD PDF`; `RESEND RECEIPT` | PDF is drawn in the browser; resend asks first | resend only if buyer e-mail and Razorpay order exist |
| Promos | Heading | h3 | `Promo codes (N)` | none | none |
| Promos | Row toggle | outline button | `DEACTIVATE` / `REACTIVATE` | `admin_set_promo_code` {active} then reload, no dialog | row dimmed (`is-off`) when not live |
| Promos | `Add a code` form | form | strong `Add a code`; fields: `Code` (placeholder `LAUNCH10`, max 32, upper-case hint), `Discount` (`% off` / `₹ off`), `Value (% or ₹)` (placeholder `10`), `Max uses` (placeholder `unlimited`), `Valid until` (date), `Commission % (affiliate)` (placeholder `none`), `Note (who it is for, where it was printed)` (wide, max 300); `Applies to:` row of one checkbox per paid plan, all ticked | Submit `ADD CODE` | draft survives refreshes; note `Added LAUNCH10.` |
| Promos | Footnote | meta | `Counted when a payment confirms. Never below ₹1 — to give a plan away, grant it.` | none | none |
| Features | Matrix | table in a form | see Tables | none | none |
| Features | Save | primary button | `SAVE FEATURES` | Writes every plan whose boxes changed; note `Saved 2 plans.` or `Nothing changed.` | toast on failure |
| Features | Footnote | meta | `Live for everyone on the plan at their next page load.` | none | none |

**Tables**

*Payments ledger* (class `ba-ledger`). Columns: `When` | `Who` | `Plan` | `Access` | `Amount` | `Code` | `Status` | `Razorpay` | (blank action column, only if refunds exist).
Example row: `3 Oct 2026` | `anitha.r@example.com` + muted second line `Kodambakkam Pictures Pvt Ltd` | `Intermediate` | `for good` | `₹799` | `LAUNCH10 (₹80 off)` | `paid` | `pay_PqX8s2K1mNa0Zt` (mono) | `REFUND`. Variants: Amount for grants `₹0 (grant)`; upgrades `₹399 (upgrade; ₹599 already paid)`; Status `paid · refund pending`, grants `granted — bank transfer`. Empty: `No payments yet.`

*Refund requests* (class `rf-requests`). Columns: `When` | `Who` | `Payment` | `Why` | `State` | (actions).
Example: `4 Oct 2026` | `karthik.s@example.com` | `Basic · ₹599` | bold `I was charged twice` + message line `Second charge came through 2 minutes later` | state pill `pending` (variants `approved`, `declined`, `refunded`; admin note shown under it) | `APPROVE` `DECLINE`. Empty: `No requests yet.` Category texts: `I was charged twice`, `I was charged but my plan did not arrive`, `Another ground the law gives me`, `Something else`.

*Invoices*. Columns: `Number` | `Date` | `Buyer` | `Plan` | `Amount` | `Receipt` | (actions).
Example: `FMS/2026-27/0042` | `3 Oct 2026` | `anitha.r@example.com` | `Intermediate` | `₹799` | `Sent 3 Oct 2026` (or `Not sent`) | `DOWNLOAD PDF` `RESEND RECEIPT`. Empty: `No invoices yet.` Meta line above: `Every invoice issued on payment, newest first. Numbers are gapless within a financial year (April to March).` Missing: `Invoices are not set up on this project yet (schema §28).` Loading: `Loading…`.

*Promo codes*. Columns: `Code` | `Discount` | `Plans` | `Used` | `Valid` | `State` | `Note` | (toggle).
Example: `LAUNCH10` (mono) | `10% off` or `10% off · 15% commission` | `every plan` or `Basic, Pro` | `14 of 100` | `until 31 Oct 2026` (or `from … until …`, `no end`) | `live` (others: `inactive`, `expired`, `used up`) | `Printed on festival flyers` | `DEACTIVATE`. Empty: `No codes yet.` Section missing: `Promo codes are not available on this database yet (schema section 20 has not run).`

*Plan features matrix* (`pf-table`). First column header `Feature`, then one column per plan: `Free trial (no plan)`, `Basic`, `Intermediate`, `Pro`. Row-group header rows (full width): `Capabilities`, then one per stage (from navigation.json). Each row: row header = feature label plus muted ` — hint`; each cell is one checkbox (aria-label `<label> on <plan>`). Example row: `Script export — PDF` with ticks off/on/on/on. Module rows with siblings carry the hint `shares a page with <names>; unticked, its own section locks, and the whole page once all are unticked`. `sample_only` capability defaults unticked; everything else defaults ticked.

**Charts** None on this tab.

**States**
- Loading: each block draws `Loading…` meta text until its data lands (plans/payments share one load; matrix has its own). Switch block shows `Loading…`.
- Load error: red `gt-error` line (`role=alert`) with the exception message, e.g. `The billing console could not load.` or `The plans could not be loaded.` (no Retry button on these older blocks; `REFRESH` re-runs).
- Empty: per table above (one-line meta, not the empty-state card).
- Section not run: one-line meta sentences quoted above (32, 20, 28).
- Role-limited: non-admins never see the tab. Finance admins see the tab; owner-only actions (switch) are refused by the server and the refusal sentence appears as an error toast with the server message.
- Refusals as sentences: price `"abc" is not a rupee amount.`; promo `A code is 3 to 32 letters, digits or dashes.`, `"x" is not a whole percentage from 1 to 100.`, `"x" is not a commission from 0.01 to 100%.`, `Tick at least one plan the code applies to.`; grant `Choose who the grant is for.`; refund approval `That payment is not in the ledger’s latest 200 rows. Refund it from the ledger once it is.`; switch `The switch was not saved.` (server text replaces it).

**Dialogs & confirmations**
- Switch ON (danger). Title `Turn purchases ON?`. Body (three paragraphs): `On: everyone who has not bought a plan is blocked until they buy, including people using the studio now.` / `Off: the studio is free; nothing is walled or capped.` / `It applies to everyone at once — an open tab follows within a few minutes, or as soon as it is focused.` Buttons `Cancel`, red `Require purchases`. No typed word on this tab (the typed word `REQUIRE` lives in the Launch & health tab's switch, see Dialog patterns).
- Switch OFF. Title `Turn purchases OFF?`. Same body with the two sentences swapped. Buttons `Cancel`, primary `Make it free`.
- Refund (custom modal, `rf-dialog`). Heading `Refund this payment?` (or `Approve and refund?` for a request). Facts line: `anitha.r@example.com · Intermediate · paid ₹799 · pay_PqX8s2K1mNa0Zt`; for a request also `They asked: I was charged twice — “…”`. Fields: label `Amount to refund (₹)` (prefilled with the full amount) with hint `Up to ₹799, which is what was paid. Leave it as it is to refund in full.`; label `Reason (required, kept with the refund)` textarea (500 max, placeholder `Duplicate charge, not delivered, …`, prefilled from a request). Red warning: `This ends <email>’s <Plan> plan today, even for a partial amount, and it cannot be undone from here. Razorpay returns the money to the customer’s original payment method.` Inline error line (`role=alert`). Buttons: red `REFUND` (becomes `REFUNDING…` and everything locks while in flight), `CANCEL`. Errors: `The amount is between ₹0.01 and ₹799.`, `Write the reason. It is kept with the refund.`, or the server text / `The refund did not go through. Nothing was refunded.` Escape cancels unless busy. Success toast: `Refunded ₹799 to <email>. Their plan has ended.` or `Refund of ₹799 sent to Razorpay for <email>. It is pending; their plan ends when Razorpay confirms.`
- Decline. Heading `Decline this request?`; facts `<email> asked: <category> — “message”`, `They will read your note on their Settings page. Nothing is refunded.`; label `Note to the customer (required)` textarea (500, placeholder `For example: this is outside the refund policy because …`); error `Say why, in a sentence. The customer will read it.`; buttons red `DECLINE` (`DECLINING…`), `CANCEL`. Success toast `Declined. The customer will see your note.`
- Resend receipt. Title `Send the receipt again?`, body `FMS/2026-27/0042 goes to anitha.r@example.com.`, buttons `Cancel`, `Send`. Toasts `Receipt sent to <email>.` / `Nothing was sent: the invoice has no buyer e-mail.`
- Promo deactivate/reactivate and plan save: no dialog.

**Sample data**
Plans: Basic (id starter) ₹599, Intermediate (id indie) ₹799, Pro ₹999; limits e.g. Basic 3 cloud projects / 2 collaborators / 2 share links / 1 seat, Intermediate 10 / 5 / 10 / 3, Pro unlimited / 20 / unlimited / 10; Chrome extension Not included / Included / Included. KPIs: `₹38,400` paid last 30 days, `₹1,92,500` all time, `52` payments, `41` on a paid plan (`24 Basic · 12 Intermediate · 5 Pro`), `3` granted by hand, `2` refunds. Payments: Anitha R. (Kodambakkam Pictures Pvt Ltd), Karthik S., Meera Iyer (Besant Nagar Studios), all example.com. Promo: `LAUNCH10` 10% off, `FEFSI-FRIENDS` ₹100 off with 12% commission note `Chennai film-school affiliates`.

**Stitch prompt**
Design a dark violet admin web UI tab called "Purchases" for a filmmaker tool, pill buttons, 16px-radius cards, calm but data-dense. Left: a vertical sub-navigation grouped Run, People, Money (Purchases selected, badge 2), Product. Top: a status bar with pills "Razorpay TEST" (amber), "Purchases required: OFF" and a REFRESH button. Content, stacked: (1) card "Purchases required" with a toggle and one sentence of consequence; (2) "Plans & prices": three plan form cards (Basic ₹599, Intermediate ₹799, Pro ₹999) with name, price, four limit inputs, extension and listing selects, one-line description, primary button "SAVE BASIC"; (3) "Grant a plan" inline form; (4) six KPI tiles then a Payments table (When, Who, Plan, Access, Amount, Code, Status, Razorpay, red REFUND button) and a Refund requests table with APPROVE/DECLINE; (5) Invoices table with DOWNLOAD PDF; (6) Promo codes table plus "Add a code" form with plan checkboxes; (7) a Plan features checkbox matrix with group header rows. Include a red refund modal.

---

### Growth tab (hash `#growth`)
**Purpose** Set the free-trial terms, schedule a public price rise, pay referral credits, review affiliates and leads, and read the acquisition funnel and cohort conversion.
**Who sees it** Studio admins only (server role `admin`). The tab has no role-specific rendering; each block loads through an `admin_*` RPC and a block whose schema section has not run says so in one line while the others draw. No tab badge.
**Data source** `admin_get_billing_settings` / `admin_set_billing_settings` (trial and referral and price-cap settings), `admin_list_referral_credits`, `admin_mark_referral_paid`, `admin_affiliate_report`, `admin_affiliate_orders`, `admin_list_leads`, `admin_funnel(from,to)`, `price_notice` (read, same as the public page), `admin_set_next_price`, `admin_grant_trial`, `admin_cohorts(p_weeks)`, member list via the gate.

**Layout** Single column, blocks in this order, each with an `h3` and 12px grid gap: Trial (settings panel, then a `Grant more time` panel), Price rise (meta, form panel, "Scheduled now" list), Referrals (terms panel, credits summary line, credits table with payout row), Affiliates (table plus total line), Leads (count line, export button, table), Funnel (table), Cohorts and the trial funnel (window chips, funnel bars, three tables). Final `REFRESH` button. Form panels use the field grid (auto-fill, min 9.5rem: about 4 fields across at 1280px, 1 at 390px). Tables scroll horizontally.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Trial | Heading | h3 | `Trial` | none | none |
| Trial | Switch | checkbox | `Signing in starts a trial` | none until save | none |
| Trial | State sentence | meta | ON: `On: somebody who signs in gets a 30 minutes free trial with the Dragon sample, then must buy a plan. An invite code gets 7 days instead.` (length phrase is `trialLength`, so 0.5 h reads as 30 minutes, longer reads in hours; `day`/`days`) OFF: `Off: signing in lands on the paywall. A trial already running keeps its clock.` | none | none |
| Trial | Fields | inputs | `Trial length (hours)` (number, step any, max 744, value 0.5), `An invite code buys (days)` (1 to 365, 7), `A code trial shows` select (`The Dragon sample only` / `The whole studio`), `A whole-studio trial borrows` select (`The usual default` plus each paid plan) | none | none |
| Trial | Save | primary | `SAVE TRIAL TERMS` | `admin_set_billing_settings`, note `Saved.` | validation toasts |
| Trial | Footnote | meta | `A new length applies to trials that start after you save; running trials keep theirs.` | none | none |
| Trial | Subheading | h3 | `Grant more time` | none | none |
| Trial | Grant fields | inputs | `Who` select (`Choose a member…`, emails, `(disabled)` suffix), `Hours (up to a year)` (min 0.5, max 8760, default 168), `Why` (max 300, placeholder `asked by e-mail, demo…`) | none | none |
| Trial | Grant button | outline | `GRANT MORE TIME` | `admin_grant_trial`; note `Granted — 1 week, starting now.` style (`trialLength`) | none |
| Trial | Footnote | meta | `A fresh whole-studio trial from now; not a plan. 168 hours is a week.` | none | none |
| Price rise | Heading + warning | h3, meta | `Price rise`; `A rise fires by itself on the date or when the cap fills, and the landing page announces it. Schedule only what you mean.` | none | none |
| Price rise | Per-plan price | text inputs | label `Basic — ₹599 today`, placeholder `no rise`, value in rupees | typing repaints the preview | one per paid plan with a price |
| Price rise | Date | datetime-local | `They all rise on` | repaints preview | none |
| Price rise | Cap | number | `Or after this many buyers`, placeholder `no cap` | repaints preview | none |
| Price rise | Seats line | meta | `37 people have bought of the 100 the cap allows.` / `1 person has bought` / `Buyers are counted only while a rise is scheduled.` | none | none |
| Price rise | Preview | live region (`role=status`, `aria-live=polite`) under the label `What the public page will say` | lines like `Basic: ₹599 today. ₹999 from 31 October, or once 100 people have joined — whichever comes first.` | none | error lines in red; if nothing rising: `Nothing is rising, so the page will show the plain price and no countdown.`; if no date: `… — NO DATE SET, so nothing would ever change` |
| Price rise | Submit | primary | `SCHEDULE THE RISE` | validates, confirmation dialog, saves cap then each tier | note `Saved.` |
| Price rise | Warning | red message | `The tiers are currently scheduled for 2 different dates. Saving this form puts them all on the one above.` | none | only if dates differ |
| Price rise | List | list | `Scheduled now:` then rows `Basic: ₹599 → ₹999 on 31 Oct 2026, 11:59 pm` + button `CANCEL THE RISE` | confirmation dialog, then `admin_set_next_price(id,null,null)` | else meta `No rise is scheduled.` |
| Referrals | Terms fields | inputs | `Friend gets (% off)` (1 to 100, default 10), `Referrer earns` select (`% of what the friend pays` / `₹ per purchase`), `Reward (% or ₹)` | none | none |
| Referrals | Save | primary | `SAVE REFERRAL TERMS` | saves, `Saved.` | validation toasts |
| Referrals | Footnote | meta | `Every paying member has a REF- code; the referrer is owed once the friend’s payment confirms.` | none | none |
| Referrals | Summary | meta | `Credits: 6 · owed ₹1,200 across 3 referrer(s).` | none | none |
| Referrals | Checkbox column | checkbox | aria `Select the credit for <email>` | selects for payout | only on `owed` rows |
| Referrals | Payout row | input + button | label `Payout note`, placeholder `UPI ref, date`, button `MARK SELECTED PAID` | `admin_mark_referral_paid`; toast `Marked 2 credits paid.` | row only if any credit is owed; none ticked: toast `Tick the credits you have paid out.` |
| Affiliates | Intro | meta | `A promo code with a commission (Purchases → Promo codes). Revenue is net; refunds drop out.` | none | none |
| Affiliates | Row button | outline | `ORDERS` / `HIDE ORDERS` | Expands a full-width row listing orders | expanded: `Loading…` then list lines like `3 Oct 2026 — meera@example.com · Intermediate · paid ₹719 (₹80 off)`, refunded ones `· refunded` and dimmed; empty `No orders yet.` |
| Affiliates | Total | meta | `Commission due across all affiliates: ₹2,340.` | none | none |
| Leads | Count | meta | `128 addresses from “Get launch offers”, each with its consent.` (`1 address`) | none | none |
| Leads | Export | outline | `EXPORT CSV` | Downloads `leads.csv` (columns email, source, created_at, consent_text; formula-safe) | only if rows exist |
| Leads | Overflow | meta | `Showing the newest 200 of 342; the CSV has them all.` | none | only past 200 |
| Funnel | Intro | meta | `Anonymous daily totals; Do Not Track visits are left out, so a floor.` | none | none |
| Cohorts | Heading | h3 | `Cohorts and the trial funnel` | none | `Counting cohorts…` while loading |
| Cohorts | Window chips | chip group (`role=group`, aria `Cohort window`) | meta `Sign-up window`, chips `8 weeks`, `12 weeks`, `26 weeks` | switches window, reloads (`aria-pressed` marks the active one, default 12) | none |
| Cohorts | Explanation | meta | `People who signed up from <since> to <until>. Each step counts the people who reached it, on its own; none is forced to imply the one before, so a step can be larger than the one above it. "Active in trial" only sees work that synced to an account, so it undercounts people who write offline.` | none | none |
| Cohorts | Refund line | meta | `1 of 18 paying people were refunded.` (`1 of 1 paying person was refunded.`) | none | none |
| Cohorts | Subheads | h4 | `Conversion by sign-up week`, `By source`, `By promo attribution` | none | none |

**Tables**

*Credits*. Columns: (checkbox) | `When` | `Referrer` | `Code` | `Friend` | `Plan` | `Friend paid` | `Owed` | `Status`. Example: ☐ | `2 Oct 2026` | `divya.m@example.com` | `REF-DIVYA7` (mono) | `rahul.k@example.com` | `Basic` | `₹539` | `₹54` | `owed` (paid rows read `paid 5 Oct 2026 — UPI 9482`; non-owed rows dimmed). Empty: table not drawn (only the summary line).

*Affiliates*. Columns: `Code` | `Gives` | `Rate` | `Orders` | `Revenue (net)` | `Discount given` | `Commission due` | `Refunded` | `Last order` | (button). Example: `FEFSI-FRIENDS` + muted note | `₹100 off` | `12%` | `18` | `₹12,400` | `₹1,800` | **`₹1,488`** | `1` | `3 Oct 2026` | `ORDERS`. Inactive rows dimmed. Empty: `No affiliate codes yet.`

*Leads* (first 200). Columns: `When` | `E-mail` | `Source`. Example: `2 Oct 2026` | `priya.n@example.com` | `start-page`. Empty: only the count line.

*Funnel*. Columns: `Step` | `Count` | `Of start-page visits`. Rows and labels: `Start page visits`, `Reached pricing`, `Invite requests`, `Sign-ups`, `Checkouts started`, `Purchases`. Example: `Reached pricing` | `1,240` | `31%` (first row shows `—`). 

*Conversion by sign-up week* (data table; density chip; caption `Percent of each sign-up week that reached each step`). Columns: `Week of` | `Signed up` | `Became a member` | `Started a trial` | `Active in trial` | `Started checkout` | `Paid` (numeric columns right-aligned). Example: `2026-09-28` | `64` | `71.9%` | `53.1%` | `28.1%` | `14.1%` | `9.4%` (cell tooltip `6 of 64`). Empty inside card: title `No weeks`, body `No sign-ups in the window.` Footnote: `Each cell is the share of that week’s sign-ups that reached the step. Recent weeks are still converting, so they read lower than they will.`

*By source* (caption `Source: a standard invite code, or how the trial began; "none" never started one`) and *By promo attribution* (caption `The kind of code on the first payment`). Columns: `Came in by` (or `Promo kind`) | `Signed up` | `Trial` | `Checkout` | `Paid` | `Refunded`. Example: `code` | `42` | `38 (90.5%)` | `9 (21.4%)` | `6 (14.3%)` | `0`. Empty: `Nothing to compare` / `No sign-ups in the window.`

**Charts**
- Cohort funnel (`funnel()`): horizontal stepped bars, one `<li>` row per stage, label `Signed up to paid`. Rows (grid: label 5 to 11rem, bar track, count, drop-off 3.5rem): `Signed up`, `Became a member`, `Started a trial`, `Active in trial`, `Started checkout`, `Paid` (the `refunded` stage is excluded and reported in the sentence below). Bar width = share of the first step (min 1%). Right column shows `−N%` drop from the previous step (blank on the first). Because each stage counts people who reached it independently, a bar can be longer than the one above and the drop then shows a smaller or odd value; the explanatory sentence says so. Rows are focusable; a shared tooltip (hover and focus, Escape hides) reads `Started a trial: 34 · 53% of Became a member, 47% dropped`. No colour-only meaning: values and percentages are text. Below 720px the label column shrinks to 4 to 7rem.
- Hidden text table fallback (visually hidden, `aria-hidden` because the rows are already text): caption `Signed up to paid`, columns `Step`, `Count`, `Share of previous step` (first row `100%`).
- No axes, no legend; there is no sparkline, heat grid or retention triangle on this tab (the retention triangle is deliberately absent; conversion by week is the grid of numbers above).

**States**
- Tab loading: `Loading…` meta (blocks appear all at once when ready). Load error: red `gt-error` line with `The growth console could not load.` or the exception text (REFRESH retries).
- Block unavailable (single meta lines): `Referral codes are not available on this database yet (schema section 22 has not run).`; `Settings are not available on this database yet (schema section 22 has not run).`; `The trial is not available on this database yet (schema section 30 has not run).`; `The scheduled price rise is not available on this database yet (schema section 30 has not run).`; `Affiliate reports are not available on this database yet (schema section 23 has not run).`; `Leads are not available on this database yet (schema section 29 has not run).`; `Funnel counts are not available on this database yet (schema section 29 has not run).`; `No paid plan is on sale, so there is no price to raise.`
- Cohorts: error state card, title `Cohorts could not load`, reason `The database has no admin_cohorts() yet — schema section 43 has not been run on it.` or the server text or `This build has no cloud project configured.`, button `RETRY`. Empty window: empty state, title `Nobody signed up in this window`, body `Try a longer window.`
- Role-limited: none drawn; server refusal appears as the toast text.
- Validation toasts (red): `A trial lasts up to 744 hours (31 days); give it at least a minute.`; `An invite code buys between 1 and 365 days.`; `Choose who the time is for.`; `Between half an hour and a year (8760 hours).`; `"x" is not a rupee amount.`; `"x" is not a whole percentage from 1 to 100.`; `Tick the credits you have paid out.`; price rise errors: `Basic: ₹499 is not above ₹599. A "rise" that is not a rise is the one thing this cannot be used for.`, `A rise needs a date. Without one nothing would ever change and the notice would be untrue.`, `That date has already passed, so the new price would take effect the moment you save it.`, `That date could not be read.`, `A founding-seat cap is a whole number of people, at least 1 — or empty for no cap.`

**Dialogs & confirmations**
- Schedule the rise (ordinary confirm, not danger; the string is split into title and body at the first blank line): Title `This will be shown to everyone, and it will happen by itself:`; body: the preview sentences, one per line, then `Schedule it?`. Buttons `Cancel`, `OK`. No typed word.
- Cancel a rise (danger): Title `Cancel the scheduled rise for this plan?`; body `The price stays where it is and the landing page stops saying it will change.`; buttons `Cancel`, red `OK`.
- Trial, referral and grant saves have no dialog.

**Sample data** Trial: enabled, 0.5 hours, 7 days for codes, scope Dragon sample only. Price rise: Basic ₹599 → ₹999, Intermediate ₹799 → ₹1,499, Pro ₹999 → ₹1,999 on 31 Oct 2026, cap 100, 37 bought. Referral: friend 10% off, referrer earns 10%. Credits: divya.m@example.com owed ₹54, suresh.p@example.com paid. Affiliate FEFSI-FRIENDS as above. Leads: priya.n@example.com. Funnel: 3,980 / 1,240 / 96 / 412 / 138 / 61. Cohort 12 weeks, 480 signed up, 410 members, 290 trials, 130 active, 90 checkouts, 61 paid, 3 refunded.

**Stitch prompt**
Create the "Growth" tab of a dark violet admin console for a filmmaker SaaS: pill buttons, 16px-radius cards, calm, data-dense, left grouped sub-navigation with Money > Growth selected. Stack these blocks: "Trial" panel with a toggle "Signing in starts a trial", plain-English consequence sentence, fields (trial hours, invite-code days, scope select, borrowed plan select) and primary "SAVE TRIAL TERMS", plus a small "Grant more time" form; "Price rise" panel with a price input per plan, a date-time field, a buyer cap, a live preview box titled "What the public page will say" and primary "SCHEDULE THE RISE", then a "Scheduled now" list with "CANCEL THE RISE"; "Referrals" terms form and credits table with checkboxes and "MARK SELECTED PAID"; "Affiliates" table with ORDERS toggle; "Leads" table with "EXPORT CSV"; "Funnel" table; and "Cohorts and the trial funnel" with 8/12/26-week chips, horizontal stepped funnel bars showing counts and −% drop-off, and conversion-by-week tables.

---

### Controls tab (hash `#controls`)
**Purpose** Four owner-only tools: who is an administrator, per-feature kill switches or additions, the one-line site banner, and export or erase of one person's server-side data.
**Who sees it** The tab exists for every admin, but its content is loaded on demand (own code chunk, fetched the first time the tab is on screen; nothing is requested before). `studio_role()` decides: `owner` sees the four cards; `finance` or `support` see an empty-state card (title `Controls are for owners`, body `Your role is finance. Roles, feature switches, the banner and data requests need the owner role. Ask an owner to make the change, or to change your role.`); a non-role admin account sees title `Controls are for administrators`, body `This account is not an administrator.` The server re-checks `require_role(owner)` on every RPC.
**Data source** `studio_role`, `admin_list_roles`, `admin_set_role`, `admin_list_feature_overrides` (returns overrides plus known_keys), `admin_set_feature_override`, `site_announcement_now`, `admin_set_announcement`, `admin_clear_announcement`, `admin_list_users`, `admin_export_user`, `admin_delete_user`, `Billing.listPlans`.

**Layout** One column of four cards (`.ad-card` with `h3`, a meta lede, content), top to bottom: Roles, Feature overrides, Announcement banner, Data tools. In each of the first two cards: data table first, form below. Form fields sit in an auto-fill grid (min 9.5rem; 2 to 4 across at 1280px, 1 at 390px); the message field and person field are full-width. Nothing sticky. Drafts live in memory so a re-render of the console never wipes typing.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Roles | Card heading and lede | h3, meta | `Roles` / `Owners can do everything. Finance and support see only their own part of the console, and the server refuses the rest.` | none | none |
| Roles | Table caption | meta | `3 administrators` / `1 administrator` | none | density chip at right |
| Roles | Row buttons | outline | `EDIT` (aria `Edit the role of <email>`), `REMOVE` (aria `Remove the role of <email>`) | `EDIT` copies the person and role into the form and focuses the person field; `REMOVE` opens the danger dialog | none |
| Roles | Person | text | label `E-mail or user id`, placeholder `person@example.com` | none | none |
| Roles | Role | select | label `Role`: `owner`, `finance`, `support` | redraws the help line | none |
| Roles | Help | meta | role reach text + ` Anyone given a role becomes an administrator.` Owner: `Everything: the purchases switch, prices, feature switches, roles, the banner, export and erase of a person.` Finance: `Refunds, invoices and receipts, payments, promo codes and referral payouts.` Support: `Notes, trial grants, ending sessions, the support queue, passes and shares.` | none | none |
| Roles | Submit | primary | `SET ROLE` | resolves the person, confirmation dialog, `admin_set_role` | disabled while any form is busy; note `Role set.` / `Role removed.` |
| Overrides | Heading and lede | h3, meta | `Feature overrides` / `Switch one feature off for a while, or add it for someone, without editing the plans.` | none | none |
| Overrides | Caption | meta | `2 overrides` / `1 override` | none | none |
| Overrides | Row button | outline | `CLEAR` (aria `Clear the override for <key>`) | confirmation, then `admin_set_feature_override` with enabled null | none |
| Overrides | Feature | select (or text, placeholder `feature key`, if no known keys) | `Feature` | none | none |
| Overrides | Applies to | select | `Applies to`: `everybody`, `one plan`, `one account` | resets scope id, redraws | none |
| Overrides | Scope id | select or text | `Plan` (select of plan names) or `Plan id` (placeholder `indie`) or `Account id` (placeholder `account id (uuid)`) | none | hidden when scope is everybody |
| Overrides | Effect | select | `Effect`: `Switch it OFF (kill switch)`, `Force it ON (add it)` | none | none |
| Overrides | Help | meta | `Which one wins, most specific first: an override for one account, then one for a plan, then one for everybody, then the plan’s own list. Two overrides of the same kind that disagree: the restrictive one wins. If this cannot be read, the plan’s own list applies and nothing is hidden.` | none | none |
| Overrides | Submit | primary | `SAVE OVERRIDE` | confirmation, then save | note `Saved.` / `Cleared.` |
| Banner | Heading and lede | h3, meta | `Announcement banner` / `One notice above every page, for planned downtime or news. Plain text, never changes by itself.` | none | none |
| Banner | Live line | meta + live sample | `Showing now, until 31 Oct 2026, 6:00 pm:` (or `, with no end date:`) then the banner bar preview; or `No banner is showing. Visitors see nothing extra.` | none | skeleton while loading; error card `The live banner could not be read` with RETRY |
| Banner | Message | textarea, 2 rows, max 200 | label `Message`, placeholder `A short notice, in one or two sentences. Plain text.` | updates the preview and the counter | none |
| Banner | Kind | select | `Kind`: `Information`, `Warning` | repaints preview | none |
| Banner | Dates | datetime-local x2 | `Starts (your time)`, `Ends (your time)` | none | none |
| Banner | Counter and hint | meta | `0 / 200`; `Leave the dates empty to start now and run until cleared.` | none | none |
| Banner | Preview | framed banner | small mono label `PREVIEW`, the banner as visitors see it, or `Type a message to see it here, exactly as visitors will.` | none | the sample's close button is disabled |
| Banner | Buttons | primary + outline | `SET BANNER`, `CLEAR BANNER` | Set opens confirm; Clear opens confirm | `CLEAR BANNER` disabled when none live; notes `Banner set.` / `Banner cleared.` |
| Data | Heading and lede | h3, meta | `Data tools` / `Answer a data request about one person: give them a copy, or erase them.` | none | none |
| Data | Person | text, full width | `E-mail or user id`, placeholder `person@example.com` | none | none |
| Data | Warning | meta | `Export covers what is on the server: profile, payments, invoices, notes, sessions and synced projects. Work kept only in someone’s own browser is not here, and the file says so. Erasing keeps invoices (they are the seller’s legal record), deletes the person’s sign-in and synced work, and cannot be undone.` | none | none |
| Data | Export | primary | `EXPORT AS JSON` | `admin_export_user`, downloads `studio-export-<slug>-<yyyy-mm-dd>.json` | note `Export downloaded. This was recorded in the audit log.` |
| Data | Erase | red-outline button | `ERASE THIS PERSON…` | resolves the person, then the typed-confirmation dialog | note `Erased.` |

**Tables**

*Roles*. Columns: `Person` | `Role` | `Since` | `Set by` | (actions, right-aligned). Example: `devi.krishnan@example.com` | pill `owner` (accent; others neutral; tooltip is the role's reach text) | `3d ago` (tooltip full date; or `from the start`) | `arun.a@example.com` (or `—`, or `no role row: reads as owner`) | `EDIT` `REMOVE`. Empty card: title `No administrators`, body `That should not happen: the console needs at least one owner.`

*Feature overrides*. Columns: `Feature` | `Applies to` | `Effect` | `Set by` | `When` | (actions). Example: `ai_assistant` | `everybody` (or `plan indie`, `account 3f9a1c2e…`) | pill `switched OFF` (danger) or `forced ON` (ok) | `devi.krishnan@example.com` | `2h ago` | `CLEAR`. Empty card: title `No overrides`, body `Every feature follows its plan. Nothing here is switched off or forced on.`

**Charts** None.

**States**
- Loading (role unknown): two block skeletons. Each card's table shows 3 skeleton rows while its list loads.
- Error: whole tab `Controls could not load` with the reason and `RETRY` (role could not be read, for example section 45 not run); each card has `<Roles|Feature overrides> could not load` plus reason and `RETRY`; the controls code chunk failing: `Controls could not load` with the chunk error and `RETRY`.
- Empty: per table above; banner `No banner is showing. Visitors see nothing extra.`
- Role-limited: see Who sees it.
- Refusals: any failed action opens an alert dialog (not a toast) titled `That did not go through` with the server sentence (default `The server did not say why.`), single button `OK`. Person lookup failures open `Check the person`: `Type the person’s e-mail address or user id first.` or `No account has the e-mail address “x”. Check the spelling, or paste the user id.` Other tell dialogs: `Pick a feature` / `Choose the feature this applies to.`; `Which plan?` or `Which account?` / `Say which plan this override is for.`; `Write the message` / `The banner needs 1 to 200 characters.`; `No e-mail address` / `That account has no e-mail address to confirm against, so it cannot be erased from here.`

**Dialogs & confirmations** (all in-app modal; Escape and clicking the scrim cancel; Enter confirms)
- Set role: Title `Make devi@example.com an owner?` / `a finance admin` / `a support admin`; body is the role's reach text; buttons `Cancel`, `Set role`.
- Remove role (danger): Title `Remove the role of <who>?`; body `They stop being an administrator and become an ordinary member. Their own work is not touched.`; buttons `Cancel`, red `Remove role`.
- Save override: Title `Switch off ai_assistant for everybody?` or `Force ai_assistant ON for plan indie?` (scope phrase is `everybody` or `<scope> <id>`); body ON: `People in that scope get the feature even if their plan does not include it.` OFF: `People in that scope lose the feature even if their plan includes it. It takes effect the next time their page reads its plan.`; buttons `Cancel`, `Save override` (red when switching OFF).
- Clear override: Title `Clear the override for <key>?`; body `The feature goes back to following the plan` + (` for that plan/account` when not global) + `.`; buttons `Cancel`, `Clear`.
- Set banner: Title `Show this banner on every page?`; body `It replaces any banner showing now. Visitors can close it for their visit.`; buttons `Cancel`, `Set banner`.
- Clear banner: Title `Take the banner down?`; body `It disappears for everybody the next time a page loads.`; buttons `Cancel`, `Clear banner`.
- Erase person (danger, typed): Title `Erase <email>?`; body `This deletes their sign-in and the work synced to the server. Invoices are kept. It cannot be undone, and it is recorded in the audit log. Work kept only in their own browser is not touched.`; hint `Type <the e-mail, lower-cased> to confirm.` with a text field whose placeholder is that e-mail; red `Erase this person` stays disabled until the field matches exactly; `Cancel`. Result alert `Erased` / `<email> has been erased. (3 projects, 12 notes)`.

**Sample data** Roles: devi.krishnan@example.com owner, since `from the start`, set by `no role row: reads as owner`; arun.a@example.com owner; lakshmi.f@example.com finance, 5d ago, set by devi; ravi.s@example.com support, 12d ago. Overrides: `ai_assistant` switched OFF for everybody by devi 2h ago; `story_bible` forced ON for plan `starter`. Banner: level Warning, `Scheduled maintenance on Sunday 18 Oct, 2 to 3 am IST. Sync may pause.` ends 18 Oct 2026, 3:00 am. Data tools: person `meena.v@example.com`.

**Stitch prompt**
Design the "Controls" tab of a dark violet product admin console (pill buttons, 16px-radius cards, calm and data-dense, left grouped sub-navigation with Product > Controls selected). Show four stacked cards. "Roles": table (Person, Role pill owner/finance/support, Since, Set by, EDIT and REMOVE buttons) and a form with E-mail field, Role select, helper sentence describing the role's reach, primary "SET ROLE". "Feature overrides": table (Feature, Applies to, Effect pill "switched OFF" red or "forced ON" green, Set by, When, CLEAR) and a form with Feature select, Applies to select, scope select, Effect select, long explanatory paragraph, "SAVE OVERRIDE". "Announcement banner": a live-banner sample, message textarea with "0 / 200" counter, Kind select, start and end date-time fields, a framed PREVIEW of the banner, buttons SET BANNER and CLEAR BANNER. "Data tools": person field, warning paragraph, "EXPORT AS JSON" and a red outlined "ERASE THIS PERSON…". Also include a typed-confirmation modal.

---

### Global surfaces

#### G1. Console full-page states (hash none; shown instead of the tabs)
**Purpose** Say clearly why the console is not showing: no cloud, signed out, still checking, or not an administrator.
**Who sees it** Anyone who opens `admin.html` who is not a confirmed admin. The page waits for the session boot before drawing, so a signed-in admin never sees the sign-in card flash first.
**Data source** `StudioCloud.isConfigured()`, `getSession()`, `gate.status()` (`studio_status`: deployed + role).

**Layout** Standard header (eyebrow `Administration`, h1 `Console`; the `Signed in as …` line only for admins), no status bar, then one centred-left card (`.ad-state`: max-width 32rem, 16px padding, 1px hairline border, 16px radius, raised surface) with an `h2` (display font, xl), a meta sentence and an optional row of buttons. Identical at 390px (card fills width minus 16px gutter).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Card | Heading | h2 | `No cloud, no console` | none | state `local` |
| Card | Line | meta | `This build carries no Supabase project (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).` | none | no buttons |
| Card | Heading + line | h2 + meta | `Sign in` / `Use an administrator’s Google account.` | none | state `signin` |
| Card | Button | primary | `CONTINUE WITH GOOGLE` | starts Google sign-in | state `signin` |
| Card | Heading | h2 | `Checking…` | none | state `checking`, no line, no buttons |
| Card | Heading + line | h2 + meta | `Administrators only` / `Signed in as <email>. Access is granted by the studio’s owner.` (falls back to `this account`) | none | state `denied` |
| Card | Button | outline link | `BACK TO THE STUDIO` | goes to `index.html` | state `denied` |

**Tables** none. **Charts** none.

**States** The four cards above are the states. Loading overview inside the console: skeleton KPI row plus skeleton block (Overview tab). Error inside a tab: error state `<Tab label> could not draw` with the exception message and `RETRY` (one failing tab never breaks the others); the Overview shows `The numbers could not load` with the reason and `RETRY`.
**Dialogs** none.
**Sample data** Denied: `Signed in as guest.editor@example.com. Access is granted by the studio’s owner.`

**Stitch prompt**
Design four full-page "state" screens for a dark violet admin console titled "Console" with eyebrow "Administration": (1) card "Sign in" with the line "Use an administrator’s Google account." and a primary pill button "CONTINUE WITH GOOGLE"; (2) card "Checking…" with no body; (3) card "Administrators only" saying "Signed in as guest.editor@example.com. Access is granted by the studio’s owner." with an outlined button "BACK TO THE STUDIO"; (4) card "No cloud, no console" explaining that the build carries no Supabase project. Each card is a 32rem-wide, 16px-radius raised panel with a hairline border and a display-font heading, centered content column, calm spacing, near-black violet background, mobile-friendly at 390px.

#### G2. Site announcement banner bar (every page of the studio, not only the console)
**Purpose** One owner-set notice above every page, for planned downtime or news.
**Who sees it** Every visitor, signed in or not, while a banner is live (starts_at passed, ends_at not reached) and they have not dismissed it this browser session. The bar appears only when a row exists; with none, nothing is in the DOM. Only an owner can set it (Controls tab).
**Data source** `site_announcement_now` (one POST with the public key, once per session, after the page is idle; session cache, dismissal stored per session).

**Layout** A full-width bar inserted at the very top of the body (after a skip link), static (scrolls away, does not pin). Flex row, gap 12px, padding 8px 16px (12px gutter under 720px), hairline bottom border, small text. Left: a mono uppercase micro kind label (`Notice` for info with brand-wash background and brand text; `Heads up` for warn with warn-wash background and warn text). Middle: message text (flexes, wraps anywhere). Right: a close button `×` (aria-label `Dismiss this announcement`), 32px target, 44px on touch. Hidden in print. In the console's Controls tab and live line the same bar is drawn as a framed sample (1px border, 16px radius), close button disabled, no `role`.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Bar | Kind label | strong | `Notice` / `Heads up` | none | info vs warn |
| Bar | Message | text (plain, 1 to 200 chars) | `Scheduled maintenance on Sunday 18 Oct, 2 to 3 am IST. Sync may pause.` | none | none |
| Bar | Close | icon button | `×` | removes the bar and remembers the dismissal for this session | disabled and out of tab order in preview; hover shows sunk-surface background; focus shows an accent outline |

**Tables / Charts** none.
**States** No row, error, or §45 not run: nothing is drawn (no message). Dismissed: gone for the session. Live bar has `role=status`.
**Dialogs** none.
**Sample data** As above, plus info example `Basic and Intermediate plans are now open for the festival season.`

**Stitch prompt**
Design a slim announcement banner bar for a dark violet product UI, full width at the top of the page above the navigation. Two variants, shown stacked: an info bar with a soft violet wash, mono uppercase label "NOTICE", message "Basic and Intermediate plans are now open for the festival season." and a close "×" at the right; and a warning bar with a soft amber wash, label "HEADS UP", message "Scheduled maintenance on Sunday 18 Oct, 2 to 3 am IST. Sync may pause." and close "×". Small text, 1px hairline bottom border, 16px side padding, text wraps on mobile at 390px while the close target stays 44px. Also show the framed preview version: 16px-radius bordered sample with a disabled close button, captioned "PREVIEW".

#### G3. Toasts, including the "View in audit log" action
**Purpose** Short confirmations and errors after an action; some offer a jump to the audit entry the action wrote.
**Who sees it** The admin who performed the action.
**Data source** `StudioUI.toast(message, {type, action, onAction, duration})`.

**Layout** Toasts stack in a polite live region (`toastHost`) at the page edge; errors go to a second `role=alert` host. Each toast: message text, then (if present) an action button, then (if it does not time out) a small `×` close button (aria-label `Dismiss`). Types: default, `success`, `error`, `info`. Show animates in on the next frame, hides over ~260 ms.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click | Variants/states |
|---|---|---|---|---|---|
| Toast | Message | text | e.g. `Purchases are now required.`, `Receipt for FMS/2026-27/0042 queued again.`, `Access revoked for <email>.`, `Role set.` (note: Controls uses inline notes, not toasts, for its own saves) | none | success / error / info tint |
| Toast | Action | text button | `View in audit log` | Runs the action then dismisses: from Launch & health it goes to `#audit?target=billing_settings:global` (switch) or `#audit?target=<invoice id>` (receipt); from Support and People drawer it goes to `#audit` (closing the drawer first) | present on admin writes that are audited |
| Toast | Close | button | `×` | dismisses | only on toasts that do not time out |

**Behaviour rules.** Default life 3.2 s; a toast with an action never times out (needs close or action); the countdown pauses on pointer hover and on keyboard focus and resumes after; a toast never steals focus; errors use the assertive host.
**Examples of paired copy:** `Purchases are now required.` + `View in audit log`; `Purchases are no longer required.` + `View in audit log`; `<email> is disabled.` + `View in audit log`.
**Tables / Charts** none. **States** n/a. **Dialogs** none.
**Sample data** `Receipt for FMS/2026-27/0042 queued again.` [View in audit log] [×].

**Stitch prompt**
Design a toast notification component set for a dark violet product UI, 16px-radius, pill action button, calm. Show four stacked toasts at the bottom-right: a success toast "Purchases are now required." with a text action "View in audit log" and a small close ×; an error toast (red tint, assertive) "That payment is not in the ledger’s latest 200 rows. Refund it from the ledger once it is."; a plain info toast "Theme: ink" that auto-dismisses (no close); and a success toast "Refunded ₹799 to anitha.r@example.com. Their plan has ended." Include the hover/focus pause state and a mobile version at 390px with toasts full width above the safe area.

#### G4. Dialog patterns used across the console
**Purpose** One in-app modal replaces the browser's confirm, alert and prompt. Every console confirmation uses it.
**Who sees it** The admin who triggers the action. Server authorisation is separate.
**Data source** none (`ask`, `askDanger`, `tell`, `askText` in `dialog.js`; refund and decline are separate custom modals described under Purchases).

**Layout** Full-viewport dimmed scrim (clicking it cancels) with a centred card (`.modal.dlg`, role `dialog`, `aria-modal`, labelled by its title). Card, top to bottom: `h3` title (default `Are you sure?`), one or more body paragraphs (split on blank lines, `deck` style), optionally a checkbox row, optionally the typed-confirmation hint and field, then an actions row with `Cancel` on the left and the confirm button on the right (focus starts on the confirm button, or on the field when one exists). Focus is trapped; Escape and the scrim cancel; one dialog at a time (a second waits). At 390px the card fills the width with side margins.

**Variants**

| Variant | Title (example) | Buttons | Typed word | Where used |
|---|---|---|---|---|
| Ask | `Turn purchases OFF?` | `Cancel` + primary (custom confirm label, default `OK`) | none | switch off, set role, clear override, set banner, clear banner, send receipt, extend pass |
| Ask danger | `Revoke access for <email>?` | `Cancel` + red primary | none | revoke access (body: `The plan this grant gave is taken back (a plan they bought is not), an admin role it gave goes back to member, and if this grant is what let them in, they are let out.`, confirm `Revoke`), revoke screening pass (`Revoke pass`), revoke share link (`Revoke link`), remove role, cancel price rise, disable user |
| Ask with typed confirmation | `Erase <email>?` | `Cancel` + red confirm, disabled until the typed text matches exactly (trimmed, case-sensitive) | the person's lower-cased e-mail (Controls erase; the People drawer's `Clear <email>?` uses the e-mail as typed) | see below |
| Typed word `REQUIRE` | `Require a plan to use the studio?` | `Cancel` + red `Require purchases` | `REQUIRE` | Launch & health tab's switch card. Body: `<N> member(s) will be walled until they buy a plan or start a trial. Not passing: <launch steps>. Rollback stays one click away for 24 hours.` Its rollback dialog `Stop requiring purchases?` (`Everyone who is walled is let back in at once. No plan or trial is changed.`, button `Roll back`, red, no typed word) |
| Ask with checkbox | (e.g. `Also delete the Google Drive backup`) | result is `{ok, checked}`; checkbox label is the caller's | none | not used in the admin console's money or controls tabs |
| Tell (alert) | `That did not go through` | single primary `OK` | none | Controls errors and person lookups |
| Ask text (prompt) | caller's | `Cancel` + `OK`; field with placeholder; Enter confirms; resolves trimmed text or null | none | not used on these tabs |

**Typed-confirmation behaviour.** Under the body, a muted hint reads `Type <WORD> to confirm.` followed by a text field (autocomplete off, aria-label `Type <WORD> to confirm`, placeholder is the word itself). The confirm button is disabled until the trimmed field equals the word exactly; Enter in the field confirms once enabled. Other app-level typed words (outside the console, for reference): `ERASE` (erase all local data), `DELETE` (delete cloud copies, red `DELETE CLOUD COPIES`).
**Custom modals.** Refund and Decline use the console's second modal style (`cm-overlay` / `cm-card`): same centred-card look but with a form (amount, reason or note), an inline red error line, and in-flight locking (button text `REFUNDING…` / `DECLINING…`).
**Tables / Charts** none. **States** busy states only for the custom modals. **Sample data** Erase dialog for `meena.v@example.com`: hint `Type meena.v@example.com to confirm.`

**Stitch prompt**
Design a modal dialog component family for a dark violet product UI: centred card, 16px radius, dimmed scrim, display-font title, body paragraphs, actions row with an outlined "Cancel" pill on the left and the confirm pill on the right. Show three variants side by side: (1) standard "Turn purchases OFF?" with two explanatory sentences and a violet "Make it free" button; (2) danger "Revoke access for ravi.s@example.com?" with a red "Revoke" button; (3) typed confirmation "Require a plan to use the studio?" with the hint "Type REQUIRE to confirm.", a text field with placeholder REQUIRE, and a red "Require purchases" button shown disabled. Add an alert variant titled "That did not go through" with a single "OK" button, and a refund form modal with amount, required reason textarea, red warning text and a red "REFUND" button.
