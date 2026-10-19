# 06 — Budget, Cast & Crew / Call Sheets, Shoot Day, Edit Log, Deliverables

Extracted from the code in the `admin-fixes` worktree. All strings are verbatim. Design tokens: ground #120f1c, card #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran body, JetBrains Mono for figures/labels/eyebrows, Courier Prime only for script text.

## Shared shell (every page below)

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

# 1. BUDGET — `budget.html`

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

## Budget · Estimate (`budget.html#estimate`)

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

## Budget · Petty cash (`budget.html#expenses`)

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

## Budget · Cost report (`budget.html#actuals`)

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

## Budget · Crew payments (`budget.html#crew`)

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

## Budget · Top sheet (`budget.html#topsheet`)

**Purpose** One-page financier summary above/below the line. · **Data** estimate lines + dept map + contingency.

**Layout** Intro → (if lines) primary pill `PRINT TOP SHEET` → one card containing the document.

**Document content** Eyebrow `Budget top sheet · <Film>`; h1 = grand total `₹ 28,21,500`; sub "≈₹ 28.22 L · Prepared 2026-10-14 from 12 estimate lines." (≈ only ≥₹1 lakh); table `Acct | Department | Estimate` with group header rows `Above the line` / `Below the line — production` / `Below the line — post` / `Below the line — other`, department rows (`2200 | Camera | ₹ 4,50,000`), per-group `Total above the line`; tfoot rows `Above the line ₹ 6,00,000 · 23%`, `Below the line … · 77%`, `Subtotal`, `Contingency 10%`, bold `Grand total`; closing hint "Rates are a starting point, not quotes: the Chennai card is 2024-25 and crew rates have no current union floor."
**Intro text** `Top sheet` / "The one page a financier asks for: department totals, above and below the line, contingency and the grand total — folded from the estimate. Move a line to another department on the cost report."
**Empty** "No priced lines yet. The top sheet fills itself from the estimate." + `GO TO THE ESTIMATE`.
**Print** The document alone on A4 (title large, table with hairline rows, bold total).
**Mobile** Document card scrolls table if needed; print button full width.

**Stitch prompt** Dark violet "Top sheet" tab: deck line, filled violet pill "PRINT TOP SHEET", and one card styled like a paper financier summary: tiny eyebrow "Budget top sheet · <Film>", huge grand-total "₹ 28,21,500", subline "≈₹ 28.22 L · Prepared … from 12 estimate lines", then a table Acct | Department | Estimate with group header rows (Above the line, Below the line — production, — post, — other), department rows with 4-digit account numbers, group total rows, and footer rows Above the line ₹ 6,00,000 · 23%, Below the line, Subtotal, Contingency 10%, bold Grand total. Mono right-aligned figures; small disclaimer at the bottom.

## Budget · Schedule impact (`budget.html#schedule`)

**Purpose** What a shoot day costs and what cutting scenes really saves. · **Data** scenes/shoot days; `schedule-impact.js`; per-line `scales` flag stored in `fms_costs_v1.lines`.

**Layout** Intro (with role-lens row) → 5 stat cards → collapsible "Which lines scale" card → "The shoot days" card/table → "If we cut…" card/table.

**Elements** Lens row: label `Start where you work` + buttons `Producer` (→ `#topsheet`, title "Top sheet: above and below the line, contingency, grand total"), `Line producer` (→ `#actuals`), `1st AD` (→ `#schedule`). Intro `Schedule impact` / "What a shoot day costs, worked from the lines you priced per day, and what cutting a scene would really save. Nothing here is stored except which lines you mark as scaling with the shoot." Stats: `18` shoot days · `6` unscheduled · `₹ 1,35,000` a shoot day costs · `7 lines` scale with the shoot · `₹ 25,65,000` estimate. Hint when no scaling: "No estimator line is priced at exactly 18 days, so no line is taken to scale with the shoot yet. Mark the lines below that do (crew, camera package, transport) and the figures follow." Details summary `Which lines scale with the shoot · 7 of 12`, hint "Automatic takes a line priced at exactly 18 days as scaling. Override it where that is wrong: a lens package for the whole shoot scales, a one-day stunt does not."; table `Line | Days | Rate | Treat as` with select options `Automatic · scales`, `Scales with shoot days`, `Fixed cost`. Card `The shoot days` table `Day | Scenes | Pages | Day cost` (`Day 3 | 4 | 5 2/8 | ₹ 1,35,000`). Card `If we cut…`, hint "Tick scenes. A day is saved only when every scene on it is ticked.", table `Cut | Scene | Pages | What it does alone` with checkbox and note: `frees Day 5 — saves ₹ 1,35,000` / `Day 3 still shoots (3 other scenes) — a share of ₹ 33,750, not a saving` / `not scheduled`; scene label `Sc 12 · INT · Lalitha's house · NIGHT`; result line (role=status) `2 scenes cut: frees 1 day (Day 5), saving ₹ 1,35,000. Estimate ₹ 25,65,000 → ₹ 24,30,000.` or `… frees no shoot day, so the estimate does not move.` or `Nothing ticked.`; `CLEAR` button when ticked.
**States** No scenes: "No scenes yet. Break the script down and give scenes a shoot day on the stripboard; this tab then works out what the schedule costs." + `GO TO THE STRIPBOARD`. No days: "None of the 64 scenes has a shoot day yet. Assign days on the stripboard and the cost of a day appears here." + `SCHEDULE ON THE STRIPBOARD`.
**Mobile** tables use `scene-table` styling and scroll; stats wrap.

**Stitch prompt** Dark violet "Schedule impact" tab (#120f1c, #1b1727, #9575f8, Catamaran, pills, 16px). Intro with three role pills "Start where you work: Producer / Line producer / 1st AD". Five stat tiles (18 shoot days, 6 unscheduled, ₹ 1,35,000 a shoot day costs, 7 lines scale, ₹ 25,65,000 estimate). A collapsible card "Which lines scale with the shoot · 7 of 12" (table with Treat as dropdowns), a card "The shoot days" (Day, Scenes, Pages, Day cost) and a card "If we cut…" with a checkbox table whose last column explains "frees Day 5 — saves ₹ 1,35,000" or "Day 3 still shoots — a share of ₹ 33,750, not a saving", plus a bold result sentence and a CLEAR pill.

## Budget · Versions (`budget.html#versions`)

**Purpose** Lock immutable budget snapshots and compare to now. · **Data** `fms_costs_v1.versions`.

**Elements** Intro `Versions` / "Lock the budget as it stands — before a schedule change, before the financier sees it — and compare any later state against it. A locked version never changes; delete it if you no longer want it." + lens row. Form card: `Name` (placeholder `Pre-schedule lock`), `Note` (`Why you are locking it`), primary pill `LOCK THIS BUDGET · ₹ 28,21,500`. Hint `Nothing locked yet.` Version cards newest first: bold name, grey ` locked 2026-10-12`, right mono `₹ 28,21,500 · 18 days`, optional note, buttons `COMPARE WITH NOW`/`HIDE COMPARISON`, `DELETE` (danger; toast `Deleted “Pre-schedule lock”.` UNDO). Comparison panel: "Estimate then ₹ 25,65,000, now ₹ 26,10,000 — +₹ 45,000." ; table `Department | Then | Now | Change`; hints `Added since: …`, `Removed since: …`, `Repriced: Gaffer (+₹ 6,000)`.
**Empty** "No priced lines yet. Price the estimate, then lock a version of it here." + `GO TO THE ESTIMATE`.
**Mobile** form fields stack; cards full width.

**Stitch prompt** Dark violet "Versions" tab: deck, lens pills, a form card (Name, Note, filled pill "LOCK THIS BUDGET · ₹ 28,21,500"), then stacked version cards each with bold name, grey "locked 2026-10-12", right-aligned mono total "₹ 28,21,500 · 18 days", note text, outline pills COMPARE WITH NOW and red DELETE; one expanded card shows a comparison sentence and a Department/Then/Now/Change table plus "Added since / Removed since / Repriced" lines.

## Budget · Wage table (`budget.html#wages`)

**Purpose** Keep the unit's agreed daily bata per craft (union MoU expired). · **Data** `wages.fefsi.json` (16 crafts: Camera assistant, Light technician / lightman, Grip / dolly / crane operator, Sound assistant / boom, Art assistant, Set worker — carpenter, painter, moulder, Costumer / dresser, Make-up artist, Hair dresser, Assistant director, Production assistant / manager's assistant, Driver, Unit cook / catering, Junior artist (extra), Stunt artist, Dancer) + `wageOverrides`.
**Elements** Intro `Crew wage table` / "A place to keep the daily bata your unit actually agreed, per craft, with the call hours and overtime rule beside it. The crew payments tab offers these as hints." Amber/expired alert: strong `Last published: FEFSI–TFPC wage MoU, 2022 — EXPIRED`, paragraphs ("Last published agreement (2022 MoU) — EXPIRED 9 March 2025, in Madras High Court mediation. No current union floor exists. Confirm every figure with your union before you budget it." and the rules note about call-time/overtime), a list of source links with "says" text. Table caption `Per craft · valid 2022-03 to 2025-03-09 · checked <date>`; columns `Craft | Published | Your bata (₹/day) | Call hours | Overtime rule | (reset)`; row: `Camera assistant` + grey dept, `not published` or `₹ 1,200 (reported, expired)`, three text inputs (placeholders `—`, `—`, `e.g. ½ bata per 2 h`), `↺` reset button (aria "Clear your figures for …") only when overridden; overridden rows tinted.
**Mobile** table scrolls inside card.

**Stitch prompt** Dark violet "Crew wage table" tab: heading + deck, an amber-ruled alert "Last published: FEFSI–TFPC wage MoU, 2022 — EXPIRED" with explanatory paragraphs and source links, then a table "Per craft · valid 2022-03 to 2025-03-09" with columns Craft (with grey department), Published ("not published"), editable Your bata (₹/day), Call hours, Overtime rule (placeholder "e.g. ½ bata per 2 h") and a ↺ reset icon; 16 crafts from Camera assistant to Dancer; user-edited rows get a faint violet tint.

## Budget · Export (`budget.html#export`)

Intro `Export` / "Spreadsheet files your accountant, line producer or budgeting software can open. The budget uses the account-number layout Movie Magic Budgeting reads — account, description, amount, units, rate, subtotal." Three cards (auto-fit, ≥15rem each): `Budget` — "12 lines in 6 accounts, with contingency and the grand total." + primary `DOWNLOAD BUDGET CSV`; `Actuals` — "Estimate, actual with and without GST, TDS, variance and % used, per line and department." + `DOWNLOAD ACTUALS CSV`; `Expense log` — "14 expenses, with GST, vendor GSTIN and receipt links — for the books." + `DOWNLOAD EXPENSES CSV`. Files named `<film-slug>-budget-2026-10-14.csv` (UTF-8 BOM so ₹ and Tamil open in Excel). Mobile: cards stack.

**Stitch prompt** Dark violet "Export" tab: heading, deck about Movie Magic account-number layout, and three equal cards (Budget, Actuals, Expense log) each with a heading, one grey explanatory line with live counts and a pill download button (first filled violet "DOWNLOAD BUDGET CSV", others outline).

---

# 2. CAST & CREW — `contacts.html`

Header (both tabs): eyebrow `Cast & Crew · people, and the day they are called`; h1 `Cast & Crew.`; deck "Everybody on the film, once, with a department and a number. The call sheets are built from this list and from the scenes in the breakdown — so a name is typed here and nowhere else."; stat strip: `34` people · `12` in the cast · `9` departments · `3` call sheets (singular forms `person`, `department`, `call sheet`). Tabs (tabs.js): **Cast & Crew** (`#contacts`, label from navigation) and **Call sheets** (`#call-sheets`). Command palette deep link `contacts.html#c-<id>` lands on a person card. Path bar below.

## Contacts · Unit list (`contacts.html#contacts`)

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

## Contacts · Call sheets (`contacts.html#call-sheets`)

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

# 3. SHOOT DAY — `shoot.html`

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

# 4. EDIT LOG — `edit.html`

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

# 5. DELIVERABLES — `deliverables.html`

Header: eyebrow `Post · deliverables`; h1 `Deliverables.` (or `Ready to deliver.` when every counted item is done); deck "The censor certificate, the subtitles, the DCP, the stills and the paper behind them, as one list. Tick what is done, mark what this film does not need, and the festival formats come from the tracker rather than from memory." Stats: `12 / 31` delivered · `4` in progress · `3` not needed · `2` festivals tracked (`festival tracked` singular). Then the page's own **tab strip** (`role=tablist`, arrow/Home/End keys): `Checklist` · `Certification` · `Dialogue list` — underlined-file-tab style: selected tab has raised card ground, hairline border, 3px accent bar inset at top; 44px tall; three tabs fit at 390px. URL hash `#certification` / `#dialogue-list`; anything else is the checklist (`#checklist`, `#festivals`, `#g-<group>`). Certification and dialogue panels are built only when shown.

## Deliverables · Checklist (`deliverables.html#checklist`)

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

## Deliverables · Certification (`deliverables.html#certification`)

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

## Deliverables · Dialogue list (`deliverables.html#dialogue-list`)

**Purpose** Numbered list of every spoken line with reel, scene, character and an empty English column; CSV, SRT skeleton and print. · **Data** script elements (`loadScript()`), scenes, `dialogue-list.js` (`REEL_MINUTES`, reels estimated from screen time).

**Layout** h2 `Dialogue list and subtitle prep` → blurb "Every spoken line in the script, numbered, with its reel, scene, character and parenthetical — the original line beside an empty English column for the translator. Read from the script every time you open it, so it is never out of date." → 4 stats → action row → notes list → source line → preview list.

**Elements** Stats: `412` lines · `64` scenes with dialogue · `18` speaking parts · `9` reels, estimated. Buttons: `DOWNLOAD CSV`, `DOWNLOAD SRT SKELETON`, `PRINT OR SAVE AS PDF`. Four notes: CSV opens in Excel/Sheets with Tamil intact (UTF-8), English column empty; "The SRT is a skeleton: one numbered cue per line, every timecode 00:00:00,000 --> 00:00:00,000, for a subtitler to time against the locked picture. Do not play it."; reels estimated at N minutes each from the Production Reports screen-time estimate; and the e-Cinepramaan note about no prescribed dialogue-list template and song lyrics. Preview heading `The first 30 lines` (or `The lines` if ≤30), then ordered rows: mono meta `7 · reel 1 · scene 3`, speaker `RAVI (angrily)` / `NO CUE`, line text; footnote "The download and the printed list carry all 412." Files: `<film>-dialogue-list.csv`, `<film>-subtitle-skeleton.srt`.
**States** No dialogue: "No dialogue in the script yet. Write or import the script, and every line is listed here."
**Print layout (A4, via PDF export)** Title "Dialogue list" with subtitle "412 lines · 64 scenes · reels estimated at 12 minutes"; one table with columns `No. | Reel | Sc. | TC in | Character | Dialogue — original | English` (TC in and English blank for hand-filling); a full-width sub-header row at each scene change `Scene 3 — INT. Lalitha's house — NIGHT` (or `Before the first scene`); black on white with hairline row rules; all lines, not just 30.
**Mobile** buttons stack; rows show meta over speaker over line.

**Stitch prompt** Dark violet (#120f1c, #1b1727, #9575f8, Catamaran, 16px, pills) "Dialogue list and subtitle prep" tab: blurb, four stat tiles (412 lines, 64 scenes with dialogue, 18 speaking parts, 9 reels estimated), three pills DOWNLOAD CSV, DOWNLOAD SRT SKELETON, PRINT OR SAVE AS PDF, a bullet list of four grey notes, then "The first 30 lines" as a numbered list where each row has a mono meta line "7 · reel 1 · scene 3", the speaker "RAVI (angrily)" and the dialogue. Also design the A4 print: a 7-column table (No., Reel, Sc., TC in, Character, Dialogue — original, English) with full-width scene header rows.
