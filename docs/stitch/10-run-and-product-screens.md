# Console: shell, Run group and Product group screens (design handoff)

Extracted from code: `src/pages/admin.js`, `src/pages/admin-tabs/{health,rpc,_rpc,audit,usage,sync}.js`, `src/ui/admin-kit.js`, `src/ui/admin-charts.js`, `src/styles/admin.css`, `src/ui/tabs.js`.

## 0. Shared kit (used by every screen below)

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

## Console shell, group sub-navigation and status bar (hash `#overview` default; every tab id is a hash)

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

## Overview (hash `#overview`)

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

## Launch & health (hash `#health`)

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

## Audit log (hash `#audit`)

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

## Usage (hash `#usage`)

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

## Sync & storage (hash `#sync`)

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
