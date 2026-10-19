# Admin console: Money tabs, Controls tab, global surfaces

Design-handoff spec extracted from code (worktree `admin-fixes`). Sources: `src/pages/admin.js`, `src/ui/admin-kit.js`, `src/ui/admin-charts.js`, `src/styles/admin.css`, `src/ui/access-admin.js`, `src/ui/billing-admin.js`, `src/ui/refund-admin.js`, `src/ui/invoice-panels.js`, `src/ui/plan-features.js`, `src/ui/growth-admin.js`, `src/pages/admin-tabs/controls*.js`, `src/ui/site-banner.js`, `src/styles/site-banner.css`, `src/ui/dialog.js`, `src/ui/chrome.js` (toast).

## 0. Shared shell and components (read first)

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

## Purchases tab (hash `#purchases`)
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

## Growth tab (hash `#growth`)
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

## Controls tab (hash `#controls`)
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

## Global surfaces

### G1. Console full-page states (hash none; shown instead of the tabs)
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

### G2. Site announcement banner bar (every page of the studio, not only the console)
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

### G3. Toasts, including the "View in audit log" action
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

### G4. Dialog patterns used across the console
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
