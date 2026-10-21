# US / international market — the contract

Written 21 Oct 2026 on branch `us/foundation` (from `develop` at `df34dce`).
Every branch in this wave builds against this file. If your work needs
something this file does not allow, stop and report; do not widen it
yourself.

**The owner decided:** visitors in India see and pay rupees, everyone
else sees and pays US dollars. The OWNER types the dollar amounts in the
console. No dollar price is hard-coded anywhere in the client or the
build. The product gaps for US users are: a Final Draft .fdx export, a
dollar budget with US rate bands, US Letter paper and US dates on the
production paperwork, CSV export of the stripboard and the Day Out of
Days, and hiding India-only material for a film made outside India.

Shipped on `us/foundation`: this file, `src/lib/region-core.js` (pure,
in the `startlib` chunk), additions to `src/lib/region.js`, `region` accepted by
`Store.createProject()` and carried by the backup applier, and
`npm run test:region` (in `test:all`).

---

## A. The region model

### A1. Values

There are two regions: **`'IN'`** and **`'INT'`**.

`'INT'` is NOT respelt as `'INTL'`. `fms_region_v1` has stored `'IN' | 'INT'`
since 9 Oct 2026 (`src/lib/region.js`), so the spelling is part of a storage
contract. `normaliseRegion()` reads `'INTL'`, `'international'` and `'India'`
and returns the canonical value. Code writes only `'IN'` or `'INT'`. No ISO
country code is stored anywhere. We have no per-country behaviour, and storing
a country would be location data with no use.

### A2. Three separate questions

| Question | Where it lives | Who reads it |
| --- | --- | --- |
| The DEVICE's market: which modules the map offers | `fms_region_v1` (existing key, device-wide, raw get/set, in NO registry; see the header of `region.js`) | `navmodel.js`, Settings → Region. **Unchanged.** |
| A PROJECT's region: the film's paperwork and its India-only content | a **`region` field on the project's entry in `fms_studio_projects_v1`**, next to `title`, `format`, `fav` and `subtitle`. **No new key.** | every page that prints money, paper or dates for a film, plus deliverables, the budget and the hints |
| The PRICING currency: what the shop quotes this visitor | the buyer's pick, as a **`payCurrency` field (`'INR' \| 'USD'`) inside the existing `fms_studio_prefs_v1` blob**, then the device market, then the guess | purchase, pricing, start, the marketing price blocks |

**No new localStorage key was added for any of the three.** `fms_studio_projects_v1`
and `fms_studio_prefs_v1` are already in their registries (the projects list,
`GLOBAL_KEYS.studio_prefs`, `ALL_KEYS`), so nothing has to join a registry.
`docs/STORAGE-MODEL.md` § "Region" records the two new fields.

### A3. The project entry field

- `entry.region ∈ {'IN','INT'}` or absent.
- **An existing project has no field, and nothing changes for it.**
  `projectRegion(entry)` answers `'IN'`, so its paperwork stays A4, INR and
  Indian dates, which is what everyone has today. Its India-only CONTENT
  keeps following the DEVICE market, exactly as `deliverables.js` does today
  with `isIndia()`. `projectPrefs(entry, deviceRegion)` implements both rules.
- **A new project** gets `region: regionForNewProject()`: the device's stated
  choice (`chosenRegion()`) if there is one, otherwise the visitor guess (§B).
  The caller passes it to `Store.createProject({ …, region })`. `store.js`
  checks only the spelling, because it imports nothing from `region.js`.
- An optional **`entry.paper ∈ {'A4','Letter'}`** overrides the paper alone,
  for example a London film that is INT and wants A4. No UI is required in
  this wave. REGION-CONTENT may add it.
- Writer: `setProjectRegion(r, id?)` in `region.js` goes through
  `Store.updateProject(id, { region })`. `''` removes the field. It notifies
  `region:project` `{id, region}` when the value moved. It runs on a click only,
  never on load, because verify asserts zero idle writes.
- Carried by: the backup file (export already writes whole entries, and the
  applier now passes `region` on both the create and the replace branch).
  Drive uses the same format, so it carries the field too.
- **Not carried by Supabase sync, as a known gap.** `fav` and `subtitle` are
  not synced either. `cloud.js` writes only `title` and `format` to
  `projects`, so a collaborator's device reads the film as having no region
  (`'IN'` paperwork, device content). Closing this needs a `projects.region`
  column, which is NOT part of §53 and is a later section. Do not send a
  `region` column from `cloud.js` before that section exists (the
  "code ahead of the database" trap).

### A4. Derived prefs (stored nowhere)

`regionPrefs(region)`:

| | `'IN'` | `'INT'` |
| --- | --- | --- |
| `currency` | `'INR'` | `'USD'` |
| `paper` | `'A4'` | `'Letter'` |
| `dateStyle` | `'IN'`: 21 Oct 2026, 21/10/2026 | `'US'`: Oct 21, 2026, 10/21/2026 |
| `locale` | `'en-IN'` | `'en-US'` |
| `showIndiaContent` | `true` | `false` |

`projectPrefs(entry, deviceRegion)` returns the same shape plus `explicit`
(whether the entry carries a region). `currentProjectPrefs(id?)` in
`region.js` is the call pages make. With no project open, the device market
decides.

`formatPaperDate(dayOrDate, prefs, 'long'|'medium'|'numeric'|'weekday')` is
the one way paperwork prints a date. A `'YYYY-MM-DD'` value is treated as a DAY
and built at local noon, so no time zone can move it.

### A5. API (`src/lib/region-core.js`, pure, import-free, `startlib`)

```
REGION_IDS = ['IN','INT'], CURRENCIES = ['INR','USD'], PAPERS = ['A4','Letter'], PREFS_KEY
normaliseRegion(v) → 'IN'|'INT'|''        normaliseCurrency(v) → 'INR'|'USD'|''
guessVisitorRegion(env?) → 'IN'|'INT'     env = { timeZone, languages, offset } (omitted: read the browser)
currencyForRegion(r) → 'INR'|'USD'
regionPrefs(r) → { region, currency, paper, dateStyle, locale, showIndiaContent }
projectRegion(entry) → 'IN'|'INT'
projectPrefs(entry, deviceRegion) → regionPrefs + { explicit }
newProjectRegion({ chosen, guess }) → 'IN'|'INT'
pricingCurrency({ override, chosen, guess }) → 'INR'|'USD'
readPayCurrency(storage?) → 'INR'|'USD'|''
writePayCurrency(cur, storage?) → boolean     // merges into fms_studio_prefs_v1; '' clears; on a click only
formatPaperDate(d, prefs, style?) → string
```

`src/lib/region.js` (CORE, imports store.js) re-exports all of these and adds
`currentProjectPrefs(id?)`, `regionForNewProject()` and `setProjectRegion(r, id?)`,
next to the existing `region()`, `chosenRegion()`, `detectRegion()`,
`setRegion()` and `isIndia()`. `detectRegion()` (the MAP's guess) is left
as it was. It agrees with `guessVisitorRegion()` (the SHOP's guess) in every
case but one: a zone with no location (UTC, Etc/*) next to an Indian language
subtag. The map reads that as INT and the shop reads it as IN. Making
`detectRegion()` delegate cost about 650 bytes of first paint on every page,
and on 21 Oct 2026 the Library had 376 bytes to spare under
`scripts/budget.json`. Fold the two together only with a deliberate budget
recapture.

**First-paint budget, for every feature:** `region-core.js` costs nothing
until a page imports from it, because there is no default export and the
bundler drops what is never called. The Library page is about 0.03% under its
`scripts/budget.json` row on `develop`. Anything that adds code to CORE or
`startlib` (both are on every page) will go over. Lazy-load with `import()` at
the press, as `screenplay-docx.js` does. Do not raise the budget to make verify
pass. A deliberate recapture is the owner's call, and is made only when you say so.

**The startlib rule:** a public page (start, pricing, product-*, contact,
about) imports `region-core.js`, NEVER `region.js`. `region-core.js` must stay
import-free. `test:region` fails if it gains an import or leaves the
`startlib` chunk.

---

## B. The visitor's region guess (pricing display)

All of this runs client-side. **It never makes a network geo call** and never
reads an IP.

1. A meaningful time zone decides. `Asia/Kolkata` or `Asia/Calcutta` gives IN,
   and any other zone gives INT. A zone is where the machine is. A language
   only says who the person is, so a browser in Dubai set to `en-IN` pays in
   dollars.
2. If there is no zone, or the zone carries no location (`UTC`, `GMT`,
   `Etc/*`, which is also what fingerprint-resistant browsers report), the
   first `navigator.languages` entry with a region subtag decides (`ta-IN`
   gives IN, any other region gives INT).
3. If that still decides nothing, a UTC offset of −330 gives IN.
4. Otherwise the answer is INT.

**Precedence for the pricing currency**, in `pricingCurrency()`:
the buyer's own pick (`payCurrency`), then the device's chosen market
(`fms_region_v1`), then the guess. The purchase page shows a switch reading
"Prices in ₹ INR / $ USD". Pressing it calls `writePayCurrency()` and
re-quotes. It never touches `fms_region_v1`: picking a currency must not hide
the CBFC tab.

The verify gate already pins `fms_region_v1 = 'IN'`, so every baselined page
measures India. The public pages are outside the baseline. Read them by hand
in both currencies.

---

## C. Charging — schema section **§53**

`git fetch origin` on 21 Oct 2026 showed that `origin/develop`, `origin/main` and every
local branch end at `schema-52-yearly-plans.sql`. **§53 is the next free
number** and it is reserved for this work:
`supabase/schema/schema-53-usd-checkout.sql`. Fetch again before you NUMBER it.
If 53 has been taken by then, take the next number and say so.

### C1. Principles

- An order is in **`'INR'` or `'USD'`**. The **client chooses the currency and
  never the amount.** The server prices that currency: `plans` and
  `effective_price()` for INR, `plan_prices` for USD.
- USD charging is OFF until the owner turns it on
  (`billing_settings.usd_checkout`, default `false`). While it is off,
  everything behaves exactly as today. A USD visitor sees dollar display
  figures and the card says the charge is in rupees (§31 behaviour, kept). An
  order is in INR.
- **Column names are not changed.** Every `*_paise` column (`payments.amount_paise`,
  `list_paise`, `discount_paise`, `credit_paise`, `refunds.amount_paise`,
  `invoices.amount_paise`) holds **minor units of that row's `currency`**:
  paise for INR, cents for USD. Renaming them would mean restating every
  function since §16. New JSON keys use `_minor`, and the old `_paise` keys
  are kept with the same value for older clients.
- `apply_plan()` and everything about access (the year, stacking, upgrades,
  grants, the gate, `entitlement()`) **is blind to currency.** Nothing in §52's
  access rules changes.
- One price-rise date per plan, as in §31. The USD next price follows
  `plans.next_price_at`.

### C2. Tables

```
billing_settings.usd_checkout   boolean not null default false
payments.currency               CHECK (currency in ('INR','USD'))        -- column exists, default 'INR'
payments.international          boolean            -- Razorpay payment entity `international`; null = not reported
payments.card_country           text               -- payment.card.country when Razorpay sends it; null otherwise
refunds.currency                text not null default 'INR' CHECK in ('INR','USD')  -- stamped from the payment
plan_prices                     unchanged; USD amount_minor 0 = "not sold in dollars"
```

### C3. Functions (every signature that changes)

| Function | §53 signature | Rule |
| --- | --- | --- |
| `effective_price_minor` | **new** `(p_plan text, p_currency text) → int` | INR returns `effective_price(p_plan)`. USD returns `plan_prices.amount_minor`, or `next_amount_minor` once the plan's rise has fired (the rule `price_notice(text)` already uses for `display_minor`). Null or ≤0 means not for sale in that currency. |
| `paid_credit_minor` | **new** `(p_user uuid, p_currency text) → int` | §52's unused-part-of-the-year credit, expressed in `p_currency`. A payment in another currency is converted at the ratio of THAT plan's list prices: `value × effective_price_minor(plan, p_currency) / effective_price_minor(plan, pay.currency)`. **No FX rate is ever used.** `paid_credit_paise(p_user)` is kept, as `paid_credit_minor(p_user,'INR')`. |
| `quote_for` | **DROP `(uuid,text,text)`, create `(p_user uuid, p_plan text, p_code text default null, p_currency text default 'INR')`** | It is internal (revoked), so there is one function and no ambiguity. It refuses with 22023 for a currency outside INR/USD (hint `currency`), for USD while `usd_checkout` is off (hint `currency_closed`), and for a plan with no USD price (hint `currency`). The minimum due is 100 minor units in either currency. It returns all §52 keys (now in minor units of `currency`) plus `currency`, `list_minor`, `due_minor`, `amount_minor`, `credit_minor`, `discount_minor`, `next_minor`. **Promo codes:** `percent_off` applies in any currency. An `amount_off_paise` code on a USD order answers `ok:false, reason:'currency'`. Gift codes are unchanged. |
| `promo_reason_sentence` | restated | It gains `'currency'`: "This code takes a rupee amount off, so it works only when you pay in rupees." |
| `quote_order` | **new overload `(p_plan text, p_code text, p_currency text)` with NO default** | The 2-arg `(text, text default null)` stays exactly as it is, which avoids the §31 "function is not unique" trap. Grant to anon and authenticated. |
| `create_pending_payment` | **DROP `(uuid,text,text,uuid,text)`, create `(p_user uuid, p_plan text, p_period text, p_account uuid default null, p_code text default null, p_currency text default 'INR')`** | The return table is unchanged (it already has `currency`). It writes `payments.currency`. The old rzp-order sends 5 named args, which resolve to this function with INR, so checkout keeps working between the SQL and the redeploy. |
| `activate_payment` | signature unchanged `(text,text,jsonb)` | It also refuses when `p_raw->'payment'->>'currency'`, if present, differs from `pay.currency`. It records `international` and `card_country` from `p_raw->'payment'`. The credit re-check uses `paid_credit_minor(user, pay.currency)`. |
| `price_notice(text)` | signature unchanged | `'charged_currency'` becomes `'USD'` when asked for USD and `usd_checkout` is on and every active plan has a USD price. Otherwise it stays `'INR'` as today. New key **`'usd_checkout'` (boolean)**. The rupee keys are still always present. `price_notice()` with zero args is untouched. |
| `admin_set_plan_price` | signature unchanged `(text,text,int,int,timestamptz)` | **Owner only** (`require_role(['owner'])`, already). It still REFUSES INR, because rupees keep their two authors (`admin_set_plan`, `admin_set_next_price`). For USD, the "display only" comment and wording go: the amount is CHARGED once `usd_checkout` is on. It refuses 1–99 cents (0 means not sold in USD). The rule that a next price must be a rise on the plan's own date stays. It is audited, as today. |
| `admin_set_usd_checkout` | **new** `(p_on boolean) → jsonb` | Owner only, and audited. It refuses ON while any active paid plan lacks a USD price ≥ 100. It returns `price_notice('USD')`. |
| `issue_invoice` | unchanged signature | It already copies `pay.currency`. The invoice series stays ONE series. Whether a USD sale needs a different document type (export of services / LUT) is an OWNER + accountant decision, recorded as a LEGAL open item. Until then `doc_type` stays `bill_of_supply`. |
| `begin_refund` | unchanged signature | `p_amount` is in minor units of the PAYMENT's currency. It stamps `refunds.currency`. Razorpay refunds in the original currency. |
| `record_refund`, `mark_payment_refunded` | unchanged | They are currency-blind. A refund removes that payment's own year (§52). |
| `admin_billing_overview` | restated | It gains `'paid_by_currency': {INR:{total_minor,d30_minor,count}, USD:{…}}`. `paid_total_paise` and `paid_30d_paise` now mean **INR only**. They were all-INR until now, so no number moves today. |
| `admin_list_payments` | restated | Every row carries `currency`, `international` and `card_country`. |
| `paid_buyers()`, `start_trial()`, referral credits | unchanged | Referral rewards stay INR-only and are not applied to USD orders. |

### C4. International cards on rupee orders

Razorpay's payment entity carries `international: true` when the card was
issued abroad. **Record it** (`payments.international`, plus `card_country`
when sent) and **show it in the console** ledger and Customer 360 as an
"Intl card" badge. **Do not block it and do not re-price it.** The owner may
set a policy later. The same flag is recorded on USD orders.

### C5. Edge functions (PRICING-SERVER)

- `rzp-order`: the body gains `currency` (`'INR'|'USD'`, default `'INR'`, any
  other value is a 400). It passes `p_currency` and creates the Razorpay order
  in `row.currency`. The response keeps every key and adds `currency` (already
  present) and the `_minor` mirrors.
- `rzp-verify`, `rzp-webhook`: they already pass the payment entity in `p_raw.payment`
  and compare amounts. They capture with `pay.currency` (verify already does).
  No logic change beyond what `activate_payment` does.
- `rzp-refund`: the amount is in the payment's currency, and the response adds `currency`.
- `_shared/razorpay.js` gains **`fmtMinor(minor, currency='INR')`**
  (`'₹599'`, `'₹599.50'`, `'$19'`, `'$19.50'`, with en-IN grouping for INR and
  en-US for USD) and **`perDayMinor(minor) → int`** (same rounding as
  `perDayPaise`, which stays). It also gains `parseMinor(s, currency)` for the
  console (`'$19.50'` gives 1950). `fmtPaise` and `parseRupees` stay
  unchanged, because the client imports them.
- `_shared/mail.js`: receipts and refund mails print `fmtMinor(amount, currency)`.
- **Deploy order:** §53 SQL first (with a checksum, as always), then redeploy
  all four functions from current source. Then, only after Razorpay has
  **International payments** enabled on the account (an owner step in the
  Razorpay dashboard), the owner turns `usd_checkout` on in the console.

---

## D. The console price editor

- **Where:** `admin.html#purchases`, in the **Tiers & grants** block (`#tiers`),
  drawn by `src/ui/billing-admin.js` (`part: 'tiers'`). That is where each
  tier's rupee price is edited today through `admin_set_plan`. The scheduled
  rise stays in `#growth` (`src/ui/growth-admin.js`, `admin_set_next_price`).
- **What:** per plan, a **USD price** field and a **USD next price** field.
  The next-price field is enabled only while the plan has a rise scheduled
  (one date per plan, shown read-only beside it). There is also a
  **"Charge in US dollars"** switch at the top of the block. Prices are typed
  in dollars (`parseMinor(s,'USD')`), saved through `admin_set_plan_price(plan, 'USD', amount, next, plan.next_price_at)`,
  and the switch goes through `admin_set_usd_checkout`.
- **Who:** the owner role only. The fields render for an admin who is not the
  owner, with a note saying they are disabled. The server refuses them anyway
  (42501).
- The block reads `price_notice('USD')` for the current figures (the same read
  the public sees) and `plan_prices` through it. There are no hard-coded
  numbers. §31's seed values ($19/$29/$39) are the starting figures, and the
  owner replaces them.
- The owner's word "settings page" means this console tab. `settings.html` is
  each user's own settings and holds no price editor.

---

## E. Features and the files each one owns

Merge order: **`us/foundation` → PRICING-SERVER → PRICING-CLIENT → {FDX-EXPORT,
BUDGET-USD, PAPERWORK, REGION-CONTENT} in any order → LEGAL last.** Each branch
starts from `us/foundation`.

**Shared-file rules (all features):**
- `package.json`: append ONLY your own `test:<x>` script and append
  ` && npm run test:<x>` to the END of `test:all`. Resolve conflicts by
  keeping both.
- Do **not** edit `CLAUDE.md`, `docs/HANDOFF.md` or `docs/HISTORY.md`. Report
  in your summary and the integrator writes those.
- `src/lib/region-core.js` and `src/lib/region.js` belong to **this
  foundation**. A feature that needs a new derived pref asks for it and does
  not add it. The one exception is REGION-CONTENT, which may add exported
  helpers to `region.js` only (not to core).
- `scripts/verify-migration.mjs` `EXPECTED`: add rows only for your own
  pages, each with a reason. **Never re-baseline.**
- New user-facing copy goes in `src/data/*.json` where a page already reads
  JSON. Colours come from tokens, there are no inline handlers, `dialog.js`
  is used for prompts, the brand name comes from `brand.json`, and rupee
  parsing goes only through `money.js`.
- The MAIN checkout holds uncommitted edits to marketing, pricing, purchase,
  budget and start files from another session (21 Oct). Expect to rebase over
  that work when it lands.

### PRICING-SERVER (the database and edge functions)
Owns: `supabase/schema/schema-53-usd-checkout.sql` (new),
`supabase/schema/README.md` (one row), `scripts/schema-tests/usd-checkout.sql`
(new) and its line in `scripts/test-schema.mjs`, `supabase/functions/**`
(rzp-order, rzp-verify, rzp-webhook, rzp-refund, `_shared/razorpay.js`,
`_shared/mail.js`), `scripts/test-billing.mjs`, `docs/BILLING.md` (new **§23**)
and `docs/LIVE-STEPS-2026-10-2x.md`.
Does not touch `src/`. `_shared/terms.js` wording belongs to LEGAL, so
PRICING-SERVER only adds a currency argument there if one is needed.
Must not run SQL live, deploy functions, or push.

### PRICING-CLIENT (everything that shows or takes a price)
Owns: `src/lib/plans.js` (adds `perDayMinor`-based `perDayIn(minor,currency)`.
`LIST_PRICE` stays INR, and there is no USD constant), `src/lib/billing.js`
(`buy(plan, period, {currency})`, `quote(plan, code, currency)` calling the 3-arg
`quote_order` and falling back to 2-arg INR on PGRST202, `priceNotice(currency)`,
`admin.setPlanPrice`, `admin.setUsdCheckout`), `src/lib/start-model.js`,
`src/pages/start.js`, `src/pages/purchase.js` + `src/styles/purchase.css`,
`src/pages/pricing.js`, `src/ui/plan-cards.js`, `src/ui/billing-admin.js`
(USD fields and the switch, §D), `src/ui/growth-admin.js` (shows the USD next
price beside the rupee rise; read-only), `src/ui/invoice-panels.js`,
`src/lib/invoice-pdf.js`, `src/ui/refund-admin.js` and `src/ui/refund-request.js`
(amounts in the payment's currency), `src/ui/admin-customer.js` and
`src/pages/admin.js` KPI (revenue per currency, the "Intl card" badge), the
price-stamping half of `scripts/make-marketing-pages.mjs` and the vite
`fms-start-figures` plugin, `scripts/fake-supabase.mjs`,
`scripts/fake-admin-rpcs.mjs`, `scripts/prove-billing.mjs`,
`scripts/prove-growth.mjs`.
Rules: the build stamps INR only, so crawlers and no-JS visitors see rupees.
The runtime swaps to dollars when `pricingCurrency()` is USD and
`price_notice('USD')` answers. If it does not answer, keep rupees and say
"prices in rupees". `usd_checkout` is believed only when
`typeof notice.usd_checkout === 'boolean'`, the `entitlement()` lesson.
While it is false, a dollar card says "charged as ₹X at checkout". It imports
`region-core.js` on public pages and `region.js` in the app.

### FDX-EXPORT
`Script.toFDX()` and the `sc-fdx` menu item **already exist**
(`src/lib/script.js`, `src/pages/screenplay.js`). This feature brings the file up to what
Final Draft writes: a `<TitlePage>` from the cover keys,
`<PageLayout>` (Letter, standard margins), `<SmartType>` (characters, times,
scene intros), `<HeaderAndFooter>` page numbers, locked pages and
scene numbers, and revision marks if the model carries them.
Owns: the `.fdx` export section of `src/lib/script.js` (from "Final Draft (.fdx) export"
to the end of `toFDX`), `scripts/test-fdx.mjs` (new; round-trips through
`script-import.js`'s reader, which it may READ but not change), and the
export menu line in `src/pages/screenplay.js` and `src/pages/write.js`
(the label and hint only).

### BUDGET-USD
Owns: `src/lib/budget-model.js`, `src/ui/budget.js`, `src/pages/budget.js`,
`src/styles/budget.css`, `src/ui/budget-costs.js`, `src/lib/costs.js`,
`src/data/rates.us.json` (new), and `money.js` **additions only**
(`parseAmount(s, currency)` and `fmtMoney(n, currency)`. `parseNum`, `fmtINR`, `INR` and
`USD` stay byte-identical, and the lakh/crore whole-string rule is untouched).
Storage: a budget's currency lives INSIDE its existing record, as `ci_currency`
in `fms_library_calc_v1` and `currency` on `fms_costs_v1` entries. If absent, it is
INR. It is set once from `currentProjectPrefs().currency` when the first row
is written. **A budget is never auto-converted or relabelled when the project's
region changes.** The page says "This budget is in ₹, the film is set to US"
and offers a deliberate switch that changes the LABEL only. Check that every
`ci_<n>_…` reader ignores `ci_currency` before writing it.
US rate bands: every figure carries `source` and `lastChecked`, and the page
shows the band AND the checked figure. No inflation multiplier is applied
(CLAUDE item 7). A role with no sourced figure shows none rather than an
invented one.

### PAPERWORK
Owns: `src/lib/pdf.js` (`SETUPS` gains `letter`, `letter-landscape` and
`sheet-letter`. `exportPDF` resolves the setup's paper from
`currentProjectPrefs().paper`. The `screenplay` setups are already Letter and
do not change. The masthead date uses `formatPaperDate`), `src/styles/pdf.css`
and `print.css` (Letter rules), `src/lib/callsheet-text.js`, `src/pages/reports.js` +
`reports.css`, `src/pages/stripboard.js` (the export menu only) and
`src/lib/stripboard-model.js` (new pure `boardCsv(groups)` and
`doodCsv(rows, days)`, RFC 4180 quoting, a UTF-8 BOM so Excel opens Tamil
correctly, and dates through `formatPaperDate`), `src/pages/shoot.js` (dates
only), and `scripts/test-paperwork.mjs` (new).
It does NOT change `invoice` (PRICING-CLIENT) or the budget print (BUDGET-USD),
which both read `pdf.js`'s new setups.

### REGION-CONTENT
Owns: `src/ui/project-setup.js` (passes `region: regionForNewProject()`, plus
a "Where is this film being made? India / Elsewhere" control),
`src/pages/hub.js` line 522 (the duplicate copies `region`), `src/pages/settings.js`
`renderRegion()` (adds the open film's region next to the device mode, and
corrects "it settles in rupees either way"), `src/pages/dashboard.js` (Title page card:
a region control through `setProjectRegion`), `src/pages/deliverables.js`
(`isIndia()` becomes `currentProjectPrefs().showIndiaContent`), and the India-only
hint surfaces: `src/ui/tamil-type.js`, `src/ui/dictation.js`,
`src/ui/format-guide.js`, `src/ui/alt-lines.js`, `src/ui/case-studies.js`, rupee
examples in `src/data/*.json` copy, and the non-price marketing lines
(`src/data/marketing-*.json` variant lines and `src/pages/marketing.js`
runtime swap). A hidden section keeps its id and says why it is empty (the
fragment trap). `navmodel.js` keeps following the DEVICE market, with no change.
May add helpers to `region.js`. `scripts/test-region-content.mjs` (new).
Must not touch prices (PRICING-CLIENT) or `budget*` (BUDGET-USD).

### LEGAL (after PRICING-SERVER and PRICING-CLIENT have merged)
Owns: `privacy.html`, `terms.html`, `refund.html` (words in markup, between the
`mk:` markers only), `supabase/functions/_shared/terms.js` (refund wording),
and `src/data/marketing-company.json` (contact/about money lines).
It covers USD pricing and charging, international cards, refunds in the paid currency,
that the region guess is local (no IP lookup), and the open owner question on
export-of-services invoicing. Until the owner and an accountant answer, it says
nothing about GST status for foreign buyers beyond what is true today.

---

## F. What is NOT decided here (owner)

1. Turning `usd_checkout` on. This needs Razorpay International payments
   approved on the account first.
2. Whether a buyer in India may pay in USD. It is allowed today, because the
   switch is the buyer's.
3. Any policy on international cards paying INR. Today they are recorded and
   never blocked.
4. The invoice document type for foreign buyers (export of services / LUT).
5. Syncing a project's region to Supabase (a `projects.region` column, a later section).
6. The final USD amounts. The owner types them in `#tiers`.
