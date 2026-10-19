# Admin console — Stitch hand-off pack (single document)

Scope: the **admin console** (`admin.html`) — 11 tabs, a customer drawer, a banner, shared dialogs.
The other 20-odd pages of the app (hub, blueprints, stage pages) are not in this pack.

This is ONE file. Part A is the workflow and design system; Parts B, C and D are the screens.
Give Stitch Part A first, then one screen at a time.

## Contents
- Part A — Workflow, brand, design tokens, shared components (this section)
- Part B — Shell and status bar · Overview · Launch & health · Audit log · Usage · Sync & storage
- Part C — People · Customer 360 drawer · Support · Access & sharing
- Part D — Purchases · Growth · Controls · Global surfaces (full-page states, banner, toasts, dialogs)

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

- Product: **FilmMakerStudio** — local-first browser tools for filmmakers (scripts, breakdown,
  stripboard, budgets). The admin console is for the owner/staff only; it is dense, calm, operational.
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

# PART B — Run and product screens: shell, Overview, Launch & health, Audit log, Usage, Sync & storage

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

# PART C — People screens: People, Customer 360 drawer, Support, Access & sharing

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

# PART D — Money, controls and global surfaces: Purchases, Growth, Controls, banner, states, dialogs

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
