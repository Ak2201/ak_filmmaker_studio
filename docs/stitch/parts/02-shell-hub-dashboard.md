# Part 02 — Global shell, Studio Hub, Project Dashboard

Source: worktree `.claude/worktrees/admin-fixes` (read-only). Files read: `src/ui/{shell,chrome,auth,mobile-nav,palette,project-switcher,stage-guide,tabs,section-menu,actionbar,dialog,trial-band,footer,tour,learn,topbar-backup,project-setup,no-project,stepper}.js`, `src/lib/{plan-gate,journey,readiness,navmodel,money}.js`, `src/pages/{hub,dashboard}.js`, `src/pages/hub/*.js`, `src/data/{navigation,tour,learn,glossary,brand}.json`, `src/styles/{tokens,chrome,palette,plan-gate,mobile-nav,dashboard,hub-doors}.css`.

## 0. Shared tokens and conventions (read once; every surface below uses them)

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

# PART A — GLOBAL SHELL

## A1. Top band (`.sh-bar`, built by `src/ui/shell.js`; controls from `chrome.js`, `auth.js`, `topbar-backup.js`, `project-switcher.js`)

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

## A2. Studio rail (`nav#studioRail.sh-rail`, `shell.js buildRail`, `trial-band.js`)

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

## A3. Phone bottom bar and its sheets (`chrome.js attachMobileActionBar`, `src/ui/mobile-nav.js`)

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

## A4. Command palette (`src/ui/palette.js`, `palette.css`)

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

## A5. Project switcher popover (`src/ui/project-switcher.js`)

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

## A6. Sign-in modal (`auth.js` cloud auth modal) and account pill states

**Purpose** Optional account sign-in; Google is the only method.
**Who sees it** Signed-out user pressing the "Sign in" pill.
**Layout** Centered modal card (`.cm-card`) on a scrim, close "×" top-right.
**Elements** Eyebrow "ACCOUNT · OPTIONAL"; heading "Sign **in.**" (italic emphasis; variants "Account settings." / "Connect an account."); deck "Your writing is saved on this device either way. An account adds a durable backup and lets you pick the same project up on another machine."; error line (role alert, hidden); button "CONTINUE WITH GOOGLE" with Google mark (busy: "OPENING GOOGLE…"); hint "Sign in with your Google account — there is no separate password to remember."; admin-only link "Configure your own Supabase project →" and a config block (fields "Supabase Project URL", "Anon (public) key", button "SAVE & CONTINUE"). Share-invite variant adds a callout "📎 You have been invited: “Dragon” · role: editor. Sign in to claim it."
**States** busy, error text, config block hidden for normal visitors. Esc/× /scrim closes.
**Stitch prompt** Design a modest sign-in modal for a dark violet filmmaking app (#120f1c ground, #1b1727 card, #9575f8, Catamaran, 16px radius). Mono eyebrow "ACCOUNT · OPTIONAL", heading "Sign in." with italic "in.", a two-sentence deck about local saving versus backup, one full-width pill button with the Google mark "CONTINUE WITH GOOGLE", a muted hint line, a close ×. Include a busy state and an error line.

---

## A7. Stage guide panel (`src/ui/stage-guide.js` + `stage-guide-body.js` + `stepper.js`)

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

## A8. Tabs / section menu (`src/ui/tabs.js`, `section-menu.js`)

**Purpose** A page's sibling sections as tabs instead of one long scroll.
**Who sees it** settings, admin, library, breakdown, stripboard, reports, contacts, visualize, write, plan, budget (explicit list); hash picks the tab (`breakdown.html#elements`).
**Layout** 3+ tabs: "side" layout — a vertical sub-nav column beside the panel at >=1100px (pinned), a horizontally scrolling strip plus a "Sections" sheet below. Fewer than 3: plain strip pinned under the band. Optional group headings, row icon (Material symbol), label, hint tooltip, count badge, ✓ done / ◐ doing marks, "PLAN" lock flag.
**Elements** `role=tablist` > `role=tab` buttons (aria-selected), `tabpanel`s; a "Sections" button (menu icon + "Sections") opens a sheet with the same frame as A3 (title "Sections", rows with label + purpose hint + badge/✓/◐/PLAN).
**States** locked tab shows inline lock card (A13). Keys: arrows, Home, End.
**Stitch prompt** Design a vertical section sub-navigation for a dark violet app page (#120f1c, #1b1727, #9575f8, Catamaran): left column of tab rows (icon, label, tiny count badge, ✓ or ◐ progress mark, "PLAN" lock flag) under small group headings, the active row violet-tinted with a left rule, content panel at right; plus a 390px version with a horizontally scrolling tab strip and a "Sections" button that opens a bottom sheet.

---

## A9. Footer (`src/ui/footer.js`)

**Purpose** Legal links, copyright, support, growth line.
**Who sees it** Every chrome page (appended to `<body>` after `#app`; clears the rail and bottom bar).
**Elements** `nav "Legal"`: "Privacy" (`privacy.html`) · "Terms" (`terms.html`) · "Refunds" (`refund.html`) · optional "Help on WhatsApp" link (only when a support number is configured; opens wa.me in a new tab) ; line "© 2026 FilmMakerStudio" ; hidden "Made with FilmMakerStudio — filmmakerstudio.in/start" line, shown only in print of a call sheet.
**Stitch prompt** Design a slim footer for a dark violet app: centered row of three muted links "Privacy · Terms · Refunds" plus an optional "Help on WhatsApp" link, under it small mono "© 2026 FilmMakerStudio"; hairline top border; dark #120f1c ground.

---

## A10. Action menus and page action bar (`src/ui/actionbar.js`)

**Purpose** Grouped page actions: a menu with a verb ("Export", "Backup") instead of twenty flat buttons.
**Component** `actionMenu(label, items)`: button `.btn.tb-menu-btn` with label + caret "▾" (compact variant: label only), panel `.tb-menu-panel` (role menu, hidden). Item types: link/button row with optional icon, label, right-aligned muted hint; separator; group heading; radio-choice rows; danger rows (red) kept at the foot below a separator. Panel clamps itself inside the viewport (right-aligned near the right edge; never under the rail). Keys: ArrowDown/Up/Home/End, Escape closes and returns focus. `wireActionBar()` binds all `data-action="tb-menu-toggle"` clicks and closes other menus.
**Example (real, Backup menu):** note line "Last backup: 2 hours ago" · "Export everything  .json" · "Import a backup" · "Studio overview  .pdf" · ─ · "Google Drive backup  Settings".
**Stitch prompt** Design a small action-menu dropdown for a dark violet app: outlined pill button "Backup ▾" with a status dot; panel (#1b1727, 1px hairline, 16px radius) with a muted note line, three rows with right-aligned mono hints (.json, ., .pdf), a divider, and a "Google Drive backup — Settings" row; include a red danger row example and focus states.

---

## A11. Toasts (`chrome.js StudioUI.toast`)

**Purpose** Transient notices; the only undo surface.
**Layout** Two live hosts fixed bottom area at z 1500: polite (`role=status`) and assertive (`role=alert`, errors only). A toast is a card with a coloured left rule by type (success, info, error), message, optional action button, and an "×" Dismiss when it has no timeout.
**Behaviour** Default 3.2s; a toast with an action stays until acted on or dismissed; every toast pauses on hover/focus; fade+slide in (distance times the motion factor, zero under reduced motion).
**Real examples:** "Theme: Light" (info, 1.4s) · "Switched to “Dragon”" (info, 1.6s) · "Project duplicated." (success) · "Renamed to “Dragon cut 2”" · "Dragon (2025) is open — 36 scenes, 105 pages, 18 shoot days, 29 on the unit list, and the script they were broken down from. Edit or delete any of it." (success, 6s) · "“Dragon” is now in arun.k@example.com — and still on this device." (success, 5s) · "10 minutes left in your free trial. Plans from ₹599, one payment. Everything you did stays." + action "SEE PLANS" · "Could not open the sample project. <reason>" (error).
**Stitch prompt** Design three stacked toast notifications for a dark violet app (#1b1727, hairline, 16px radius, Catamaran): a success toast with green left rule, an info toast with violet rule and a pill action button "SEE PLANS" and a small × dismiss, and an error toast with red rule.

---

## A12. Dialogs (`src/ui/dialog.js`, replaces native confirm/alert/prompt)

**Purpose** The only confirm, alert and prompt in the app.
**Layout** Scrim `.modal-overlay.dlg-overlay`; card `.modal.dlg` (role dialog, aria-modal, labelled by its `h3`): title (`h3`, default "Are you sure?"), muted paragraphs (`.deck`), optional tick box row, optional "Type X to confirm." hint + field, then `.modal-actions` with the cancel button first and the confirm button last (primary pill; red when `danger`). One at a time; Escape and scrim click = cancel; focus on the confirm button (or on the field for type-to-confirm/prompt).
**Variants** `ask` (confirm: buttons "Cancel" / "OK" by default), `askDanger` (red), `tell` (alert, single "OK"), `askText` (prompt with a text field, placeholder, Enter submits).
**Real examples** Delete project: title "Delete project “Dragon”?", body "All blueprint data inside it will also be deleted. This cannot be undone.", buttons "Cancel" / "DELETE" (red). Tell: "Give your project a title." (OK).
**Stitch prompt** Design a confirmation dialog for a dark violet app: scrim, centered 16px-radius card (#1b1727) with title "Delete project “Dragon”?", a muted two-line explanation, and two pill buttons at right: outlined "Cancel" and red-filled "DELETE". Also a second variant with a type-to-confirm field and disabled confirm.

---

## A13. Plan-gate walls and locks (`src/lib/plan-gate.js`, `plan-gate.css`)

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

## A14. First-run panel, project doors, "Start your film" sheet, hub New-project modal (`src/pages/hub/first-run.js`, `src/ui/project-setup.js`, `hub.js modalMarkup`)

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

## A15. Onboarding tour (`src/ui/tour.js`, `src/data/tour.json`; key `fms_tour_v1`)

**Purpose** A 10-step walkthrough of the studio on the Dragon sample.
**Who sees it** Started from the hub checklist button, Settings → Preferences → Help, or palette "Take the tour". Resumes across pages while active. State written only on a click/key.
**Layout** Non-modal `role=dialog` card (`aria-modal=false`, focus moves into it) anchored near the element it describes, with a highlight ring; on pages where the anchor is on another page a floating chip `div.tour-chip` ("Tour · step 4 of 10: Scene Breakdown" + "Continue" + "End tour"). A hub invitation block ("New here? Take a 2-minute tour of the studio." + "Take the tour" / "Skip") exists in code but has no host on Home now.
**Card elements** mono "Tour · step 2 of 10"; `h2` title; paragraph; actions: primary "Next: Story" (label = next step's title before the colon; last step "Finish the tour"; step 1 "Open the sample"), outlined "Back" (not on step 1), outlined "End tour"; hint "Esc ends the tour. You can start it again from the hub."
**The ten steps (title / body):** 1 "Start with a real film" — The Dragon sample is a complete production — a screenplay, its scenes broken down, a schedule, a unit list and call sheets… · 2 "Story: the idea, the logline, the beats" · 3 "Screenplay Writer: write the screenplay" · 4 "Scene Breakdown: what each scene needs" · 5 "Stripboard: scenes into shoot days" · 6 "Budget: what the schedule costs" · 7 "Call sheets: who, where, when" · 8 "Shoot day: on the phone, on the set" · 9 "Edit log: what is in the can" · 10 "Deliverables: what leaves, and where it goes" (counter reads "of 10").
**Hub first-week checklist** (section `#firstweek`, below the projects hero): mono label "YOUR FIRST WEEK", `h2` "Find your way round.", deck "Six things to try. The ticks are read from the open film every time this page draws — nothing here is stored.", right counter "2 OF 6 DONE", a segmented meter, six rows with a ✓ mark: "Write a logline or a synopsis", "Start the screenplay", "Have a scene in the Scene List", "Put a scene on a shoot day", "Make a call sheet", "Mark a scene on the shoot day"; buttons primary "Take the tour" (or "Resume the tour" / "Take the tour again") and "Hide this list"; on the sample: "You are in the sample film, so these stay unticked. Start your own film to tick them off." Finish toast: "Tour finished. The first-week list on the hub keeps count."
**Stitch prompt** Design an onboarding tour popover for a dark violet filmmaking app (#1b1727 card, #9575f8, Catamaran, 16px radius): mono caption "Tour · step 4 of 10", title "Scene Breakdown: what each scene needs", body paragraph, a violet highlight ring around a page element behind it, buttons primary "Next: Stripboard", outlined "Back" and "End tour", muted hint "Esc ends the tour." Also a bottom floating chip "Tour · step 4 of 10: Scene Breakdown · Continue · End tour". And a "YOUR FIRST WEEK" checklist card with six ticks and a segmented meter.

---

## A16. Learn panel, glossary popovers, shortcut sheet, no-project banner

**learn() panel** (`src/ui/learn.js`, topics in `learn.json`, 55 topics) — a quiet `<details class="learn">` line: summary text is a question ("What is a logline?" / "What is an arc?"), closed by default; body built on first open: while loading "Loading…"; then definition (from glossary), a Tanglish line (mono, italic), "In Dragon: <film example>" (+ a short list of other films' examples "96: …"), up to two click-to-load videos, a "Why it matters" labelled block (<=260 chars from the blueprint step), and a link "Go deeper: the blueprint step" or "Go deeper: film terminology" (`library.html#…`). Failure shows a link "Open film terminology". Writes nothing.
**Glossary popover** (`#glossaryPopover`, `chrome.js`) — dotted-underline terms in prose (`.glossary-term`, aria-label "<term> — what this means, with examples"); on hover/focus a small floating card (z overlay, kept 8px inside the viewport, above the term else below): mono caps term (e.g. "LOGLINE"), definition, Tanglish line, then examples: bold film name + note ("Dragon A college dropout buys a fake degree…"). Enter/Space toggle, Esc closes without moving focus.
**Shortcut sheet** (`#shortcutSheet`, `?` key) — modal "Keyboard *shortcuts.*" deck "A working desk needs muscle memory. Press ? any time." table of key caps and meanings: `?` Open this shortcut sheet · `Esc` Close any open dialog / dropdown · `⌘/Ctrl S` Save current blueprint · `⌘/Ctrl D` Switch theme (Dark ↔ Light) · `j` Next step (in any blueprint) · `k` Previous step · `g g` Jump to top · `G` Jump to end · `/` Focus the search input on this page (the hub, the blueprints) · `⌘ K` `Ctrl K` Search the whole studio — modules, scenes, people, places, script lines. Start with > for commands, # for a scene number, @ for a person. A page may append its own group (e.g. the screenplay writer's key preset).
**No-project banner** (`#studioNoProjectBanner`, role status, fixed at the top of project-writing pages when no project is open) — red-tinted strip: "NO PROJECT OPEN — what you do here is kept on this device, and moves into the next project you create." + link "CREATE OR OPEN A PROJECT →" (`index.html`).
**Stitch prompt** Design four small supporting UI pieces for a dark violet app (#1b1727, #9575f8, Catamaran, 16px radius): (1) a collapsed "What is a logline?" disclosure row that expands into a definition card with a muted Tanglish line, "In Dragon: …" example, a "Why it matters" block and a "Go deeper" link; (2) a floating glossary tooltip with mono caps "LOGLINE", definition, Tanglish, and film examples; (3) a "Keyboard shortcuts." modal with a two-column table of key caps; (4) a thin red-tinted banner "NO PROJECT OPEN — … CREATE OR OPEN A PROJECT →".

---

# PART B — STUDIO HUB (`index.html`, `src/pages/hub.js`, `src/pages/hub/*`)

## B1. Studio Hub

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

# PART C — PROJECT DASHBOARD (`dashboard.html`, `src/pages/dashboard.js`, `src/lib/journey.js`)

## C1. Dashboard

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
