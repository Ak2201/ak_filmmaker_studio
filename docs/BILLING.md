# Billing — Razorpay, three paid tiers, and what a plan caps

Last reviewed: 2026-10-19. Live state (which schema sections ran, what is deployed, what
is still unset) is recorded in `docs/HANDOFF.md` §4 and §6c and in `CLAUDE.md`; where a
section below was written before it ran, its heading now says RUN LIVE and the original
prose is kept as the history of how it was decided.

Written 5 Oct 2026 for the owner's ask: *Razorpay payments, three tier
amounts set from the admin console, restrictions by plan.* Four decisions
were asked before a line was written, and every file below follows from
them:

| Decision | Answer |
| --- | --- |
| How does a plan recur? | **Prepaid periods.** One Razorpay Order buys a plan for a month (30 days) or a year (365). Nothing auto-renews; nothing is a mandate. A lapse is computed from `plan_until`, never scheduled. |
| Who holds the plan? | **The organisation** (`accounts.plan`, which section 6 of the schema reserved for exactly this). A buyer who owns no organisation gets one made at activation. |
| Does paying admit a stranger? | **Yes.** Activation inserts the `studio_members` row, so a paying visitor is through the invite gate with no code. A *disabled* member cannot buy their way back in. |
| What do the tiers cap? | **The cloud and the extension, never local work.** Projects synced, live share links, collaborators per film, organisation seats, and the Chrome extension. Drive backup and the AI features are never limited. |

## 0. The tiers, as seeded

**Full-time access (§18, 6 Oct 2026).** A plan is bought ONCE and kept for
good — no monthly or yearly period, nothing to renew, nothing to lapse.
`plans.price_paise` is the one price; the monthly/yearly columns are left
in place and read by nothing. The console edits all of this; these are the
rows §16.1 inserts and §18 adjusts so that the pages have something to show.
The §18 seed figures were placeholders (§18 copied the old yearly figure into the
one-time price); the live table has real prices (next paragraph's table), set on
`admin.html`. A price rise is scheduled in the database for 31 Oct 2026 (§30, §12 below).

**Features by plan (§18, same day).** `plans.features` is a map of feature
key → boolean that the console's **Features** matrix edits: every built
module from `navigation.json`, plus `sample_only`, `new_projects`,
`script_import`, `ai_tools`, `exports`, `drive_backup`. A missing key is
allowed; only `false` locks. `src/lib/plan-gate.js` reads it off
`billing_status()` for a signed-in member: an unticked module's page shows
an upgrade panel over the (still present) content, the shell and launcher
flag it, and the hub honours `sample_only` (the Dragon sample and nothing
else) and `new_projects`. Signed-out and code-only visitors are not gated
here — the site gate already decided whether they see the app. This is the
owner's product boundary; the data boundary stays RLS and the triggers.

| | Free | Basic (`starter`) | Intermediate (`indie`) | Pro |
| --- | --- | --- | --- | --- |
| Price, once (live, 8 Oct 2026; confirmed by the owner 19 Oct 2026) | — | ₹599 (59900 paise) | ₹799 (79900) | ₹999 (99900) |
| Scheduled rise (§30, kept by the owner 19 Oct 2026) | — | ₹999 on 31 Oct 2026 | ₹1,499 | ₹1,999 |
| Sample only / new projects | yes / no | no / yes | no / yes | no / yes |
| Cloud projects | 1 | 3 | 10 | unlimited |
| Collaborators / film | 0 | 2 | 5 | unlimited |

> **Labels.** Tiers are labelled Basic / Intermediate / Pro (§26,
> `plans.name`); the ids `free / starter / indie / pro`, the CHECKs,
> `plan_rank` and `PLAN_ORDER` are unchanged. The prices are the live
> ones, read from the `plans` table on 8 Oct 2026; the server reads the
> price from the table on every order. The seeded figures §18 wrote
> (₹2,999 / ₹7,999 / ₹19,999) are history. **What each plan includes**
> is `src/data/plan-matrix.json` (owner, 11 Oct 2026; §16 below):
> schema §36 writes it into `plans.features`, and start.html, the plan
> cards and the console all read from it or from those rows.

| Live share links | 0 | 3 | 10 | unlimited |
| Organisation seats | 1 | 1 | 3 | 10 |
| Chrome extension | no | yes | yes | yes |

A blank limit in the console is unlimited. A price of 0 means "not for
sale" and the card offers no button. The free tier may not carry a price
(the RPC refuses it).

## 1. Order of operations

**One command does steps 1, 3, 4 and 5 below** from a machine that can
reach Supabase and holds a personal access token in
`SUPABASE_ACCESS_TOKEN` (and the three `RAZORPAY_*` secrets, if they
are to be set in the same run): `node scripts/deploy-billing.mjs`. It
slices `supabase/schema/supabase-schema.sql` from the §16 heading to the END of the
file (so today that is §16–§39, not just §16–§17; the script's own comments still
say "§16 and §17"), runs it through the
Management API, asks the database that they landed, and deploys the
functions (all four, `rzp-refund` included) with the CLI via npx. `--print` writes the same SQL to stdout
for the dashboard editor instead. The cloud session this was built in
could do neither: its network policy denies every Supabase host and it
holds no token, which is why the script exists.

**Status (19 Oct 2026):** §16–§39 have all run live, the three edge functions in
this list and `rzp-refund` are deployed, and a TEST-mode purchase has been made
end to end (8 Oct); there is still no LIVE Razorpay key and a refund has never
been exercised (`docs/HANDOFF.md` §4). The steps below are the original deploy
recipe and still the right order for a fresh project. The schema section passes `npm run test:schema` on a real PostgreSQL;
the whole purchase passes `npm run prove:billing` against a faked
Razorpay and a faked Supabase. The order:

1. **Run §16 of `supabase/schema/supabase-schema.sql`** in the dashboard SQL editor.
   Then ask the database, not the file: `select id from plans order by
   sort` should return four rows through PostgREST as any signed-in
   user, and `billing_status()` should answer with `plan: 'free'`.
2. **Create a Razorpay account** (test mode first). From *Settings →
   API Keys* take the key id and the key secret.
3. **Set the secrets on the Supabase project** — never in this repo:
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_… RAZORPAY_KEY_SECRET=…
   ```
4. **Deploy the edge functions** (three here; `rzp-refund` joined with §27, see §10):
   ```bash
   supabase functions deploy rzp-order
   supabase functions deploy rzp-verify
   supabase functions deploy rzp-webhook --no-verify-jwt
   ```
   The first two verify the caller's Supabase JWT themselves (the
   gateway's check is fine too). The webhook is called by Razorpay,
   which carries no JWT, so the gateway must let it through and the
   function verifies the body's HMAC instead.
5. **Register the webhook** in the Razorpay dashboard: URL
   `https://<ref>.supabase.co/functions/v1/rzp-webhook`, events
   `payment.captured`, `payment.failed`, `refund.processed` (and `refund.failed`, added with §27). Choose a
   webhook secret there and set it:
   ```bash
   supabase secrets set RAZORPAY_WEBHOOK_SECRET=…
   ```
6. **Put the PUBLIC key id in `.env`** as `VITE_RAZORPAY_KEY_ID` and
   rebuild. Until it is set every BUY renders disabled with a sentence
   saying payments are not on; the tiers still show and the console
   still edits them.
7. **Set the real prices** on `admin.html` → Billing.
8. **Run the §16.10 checks** (twelve of them, in the schema) and then a
   test-mode purchase end to end with Razorpay's test cards. Only then
   swap to a live key — which is one `secrets set` and one `.env` line.
9. **§19 and §20 (7 Oct 2026).** `node scripts/deploy-billing.mjs --sql`
   slices from §16 to the end of the file, so a run after 7 Oct carries
   both; through the dashboard editor, paste them in order (§19 first —
   §20 drops and recreates `create_pending_payment` and
   `admin_list_payments`, so the old signatures must exist). Then
   **redeploy `rzp-order`** — it passes `p_code` now, and the
   five-argument RPC must be live before the function is, or every
   order fails with PGRST202 on the argument list. Ask the database:
   `select count(*) from promo_codes` as the anon key → `42501`
   (not `42P01`, which would mean §20 never ran); `quote_order('indie',
   null)` → the list price; an insert of a Pro account through
   PostgREST → `42501`. The 19.1 and 20.2 checks are the full list.
10. **Make the launch codes** on `admin.html` → Billing → Promo codes.

## 2. The flow, once it is on

```
settings.html#plan  (or invite.html, for a visitor outside the gate)
   │  BUY
   ▼
rzp-order     JWT → who; create_pending_payment() → the price FROM THE
(edge)        TABLE, a 'created' row; POST /v1/orders at Razorpay;
              attach_razorpay_order(). Returns order id, amount, key id.
   │
   ▼
Checkout      Razorpay's own form, over the page. The buyer pays.
   │
   ├─ handler ──► rzp-verify  HMAC-SHA256(order|payment, KEY_SECRET)
   │              (edge)      must match; the order must be the
   │                          caller's; activate_payment().
   │
   └─ tab closed ─► rzp-webhook  payment.captured → activate_payment()
                    (edge)       (the same RPC; a second call is a no-op)
                                 payment.failed → mark_payment_failed()
                                 refund.processed → mark_payment_refunded()
   ▼
activate_payment()   the row reads 'paid'; apply_plan() on the buyer's
                     newest organisation (or a new one); the buyer's
                     studio_members row exists; plan_until is 30/365
                     days out — from the OLD expiry if the same tier
                     was bought again before it lapsed.
   ▼
the browser          billing_status() re-read; runGate() re-run, because
                     a stranger who paid is a member now.
```

**The price is never trusted from the client.** `rzp-order` takes a
plan id and a period and reads the amount from `plans`. A console edit
is live on the next order with no Razorpay object to update.

**The signature is checked twice and the activation is idempotent.**
`rzp-verify` and the webhook can both fire for one payment;
`activate_payment` answers `already: true` the second time and changes
nothing. A tampered signature is refused with a sentence that says
money, if it left, is matched or refunded by Razorpay — the row stays
`created` and the webhook will settle it.

## 3. The limits, enforced

The caps live in triggers (§16.8), not in the UI:

| Table | Trigger | Counts |
| --- | --- | --- |
| `projects` | `projects_plan_limit` | the owner's projects |
| `shares` | `shares_plan_limit` | live links (unexpired) across the owner's projects |
| `project_collaborators` | `collaborators_plan_limit` | collaborators on that project |
| `account_members` | (existing) `enforce_seat_limit` | seats, which `apply_plan` now sets from the tier |

Each raises **`P0402`** with the plan and the cap in the message
("Your Free plan syncs up to 1 project. Upgrade to add another to the
cloud; it is still saved on this device."). The browser's half is in
`cloud.js`: a `P0402` on a project insert is **not** queued (retrying
every thirty seconds would fail every thirty seconds), the sync status
reads *Not synced — plan limit reached*, and a toast names the cap and
offers the plan page, at most once a minute. The film stays on the
device. The next activation re-runs the queue.

The extension is the one cap the client enforces, because the server
cannot tell an extension's request from a page's: `panel.js` reads
`limits.extension` from `billing_status()` and shows the plan page
instead of the panel when it is false.

A **lapse** needs no job: `account_plan()` answers `'free'` once
`plan_until` is past, and `billing_status()` reports `lapsed: true` with
the plan that was bought so the page can say so. The organisation's
`seat_limit` is left where the plan set it — seats already filled are
not evicted by a lapse; they are refused on the next insert.

## 4. Where things are

| | |
| --- | --- |
| `supabase/schema/supabase-schema.sql` §16 | plans, payments, `accounts.plan_until`/`plan_period`, `apply_plan`, the service-role surface, `billing_status`, the triggers, the console RPCs, twelve checks |
| `supabase/functions/_shared/razorpay.js` | HMAC, signature checks, periods, prices, paise formatting. Plain JS so the browser imports the same formatter |
| `supabase/functions/rzp-order` `rzp-verify` `rzp-webhook` `rzp-refund` | the four edge functions (Deno); `rzp-refund` since §27 |
| `src/lib/billing.js` | the browser's half: plans, status, `buy()`, the admin RPCs. Writes nothing to localStorage |
| `supabase/schema/supabase-schema.sql` §19 | the accounts INSERT guard (A1b in `docs/SECURITY-RLS.md`) |
| `supabase/schema/supabase-schema.sql` §20 | `promo_codes`, `quote_order`, `promo_price`, the code on `payments`, the console RPCs |
| `src/ui/plan-cards.js` + `src/styles/plans.css` | the four cards, the "Have a code?" box, the usage list |
| `src/ui/billing-admin.js` | the console: overview, tier editor, promo codes, grant form, ledger |
| `src/pages/settings.js` #plan · `purchase.html` #plan (the only buy screen) · `admin.html` #billing · `panel.js` | where they are drawn |
| `src/lib/cloud.js` `_pushProjectMeta` | the `P0402` handling |
| `vercel.json`, `netlify.toml` | CSP: `checkout.razorpay.com` (script, connect, frame), `api.razorpay.com` (connect, frame), `lumberjack.razorpay.com` (connect — Checkout's telemetry), `*.razorpay.com` images |

## 5. What is proved, and what is not

**Proved, in this repo:**

- `npm run test:billing` — 79 assertions (re-run 19 Oct 2026; 50 when first written) on the shared helper: both
  HMACs against known vectors, timing-safe compare, periods, prices,
  `fmtPaise`, `parseRupees`, and the promo helpers (`normalisePromo`,
  `isPromoShaped`, `promoPrice` mirroring `public.promo_price`,
  `promoLabel`).
- `npm run test:schema` — the WHOLE schema loads on
  a real PostgreSQL 16 under a shim for the `auth` schema and the API
  roles (§1–§39 plus the `supabase/schema/schema-40..47` files; `CLAUDE.md` gives
  the current total, 478 checks). The paragraph below is the count when §20
  was the last section — 133 checks in three files: `billing.sql` (50, §16 +
  §18: the price from the table, both activation paths, idempotence,
  the account made for a first buyer, every trigger's refusal and its
  lifting after a grant, the refund lapsing the plan, `accounts_guard`
  refusing a client CHANGE while `apply_plan` passes, the ledger
  totals), `accounts.sql` (15, §19: a self-minted Pro organisation
  refused column by column, a plain create landing on the defaults,
  `acc_insert` unchanged, the service role and the admin's grant path
  both still through) and `promo.sql` (68, §20: the table closed to
  anon and authenticated, the console RPCs admin-only, the quote
  maths including the ₹1 floor and the paise floor, all five refusal
  reasons, the order carrying the code with `uses` untouched,
  activation spending it exactly once, exhaustion closing it, the
  webhook amount check, the ledger columns, deactivate/reactivate).
- `npm run prove:billing` — the shipped pages in Chromium against a
  faked Supabase and a stubbed Checkout that signs with the fake's
  secret: the cards from the table, yearly default and the period
  switch, a purchase from BUY to the card reading *Your plan* with the
  ledger paid and the organisation on Indie, a tampered signature
  refused, a dismissed Checkout left `created`, a stranger paying on
  `invite.html` and landing on *You're in* as a member, the project cap
  as a toast and a sync status with the film still on the device, the
  console editing a price and a limit, granting Pro and the ledger
  showing it, no plan or order or payment id in localStorage, no
  overflow at 390px, no page errors — and, since §20, (j): an unknown
  code refused with the server's sentence and no card repriced, a live
  code repricing three cards with the list price struck, BUY carrying
  it, Checkout opening at the DISCOUNTED amount, the ledger row with
  code / list / discount, the use count moving at activation, the code
  in no localStorage key or value, the console listing, adding and
  deactivating a code, and `invite.html` refusing the deactivated code
  while pricing the new one on the plans it names. 93 assertions.

**Not proved (as of 19 Oct 2026):** anything against a LIVE Razorpay
account, and the §16.10 checks against the live database (the schema's own
PostgreSQL tests pass; the live RLS checks needing two accounts are unrun, see
`docs/SECURITY-RLS.md`). Specifically still unproved: the real Orders API, a real Checkout, the
webhook's delivery and its retries, refunds from the dashboard, and
Razorpay's KYC and settlement. The fake Razorpay signs exactly as the
real one does, but it is still a fake.

## 6. Things to know before changing it

- **A key in a URL is a key in a log.** The key id is public; the
  secret is read from `Deno.env` in the functions and nowhere else.
  Do not pass it as a query parameter, do not put it in `.env`, do not
  build a "server-side fallback" into the browser bundle.
- **`fms.billing` is a transaction-local GUC**, set by `apply_plan`
  and read by `accounts_guard`, so a plan write passes the guard that
  has refused client writes to `plan`/`seat_limit` since section 6.
  It is `set_config(..., true)` — local to the transaction — so it
  cannot leak into a later statement on the same connection.
- **Both importers of the backup file ignore the plan**, correctly:
  the plan is a fact about an account on the server, and nothing about
  it is in `GLOBAL_KEYS`, `PROJECT_KEYS` or any other registry.
- **The grant is a ₹0 payment**, status `granted`, so the ledger is
  one list and the overview's sums exclude it by status rather than by
  amount.
- **The proof builds its own `dist-billing/`** with a fake key id and
  the gate ON, because the committed `.env` carries no key id until
  the owner has one and a build without one disables every BUY —
  which is the right behaviour and the wrong fixture.

## 7. Promo codes (schema §20, 7 Oct 2026)

The owner is launching and asked for offers. The design is one table
and one function, kept inside the decisions above:

**The client never sends a price — it sends a CODE.** `quote_order(plan,
code)` is a `security definer` RPC callable by `anon` and
`authenticated` (the cards are drawn for a signed-out visitor on
`invite.html`). It answers `{ ok, amount_paise, list_paise,
discount_paise, code, reason, sentence }` and *never raises for a bad
code*: `ok: false` with one of five reasons — `unknown`, `expired`,
`exhausted`, `not_for_plan`, `inactive` (which also covers "not yet
valid") — and the sentence the buyer reads. `create_pending_payment()`
calls the **same function** when `rzp-order` makes the order, so the
price on the card and the price Razorpay charges are one computation,
and a console edit to a code is live on the next quote with nothing to
redeploy. A refused code at order time is a `22023` whose message is
the sentence; `rzp-order` passes it to the page as the status line.

**The table is readable by nobody from the browser.** `promo_codes` has
RLS on, no policies, and `anon`/`authenticated` revoked outright — a
`select` is `42501`, not an empty list. The console reads through
`admin_list_promo_codes()` and writes through `admin_set_promo_code()`,
both behind `is_studio_admin()`, the check the plan console already
uses. A code is `percent_off` (1–100) **or** `amount_off_paise`, never
both; `plan_ids` null means every paid plan; `max_uses` null means
unlimited; `valid_from`/`valid_until` is the window; `active` is the
switch. The code itself is upper-cased with whitespace removed — a
buyer may type `launch 10` — and is never renamed, because the ledger
refers to it.

**A use is counted at ACTIVATION, not at order.** An abandoned
Checkout must not spend a code, so `uses` moves inside
`activate_payment()`, once per payment, and `max_uses` is checked at
quote time. Two buyers racing for the last use can both pay: the count
overshoots by one and both show in the ledger, which is cheaper than
refusing a customer whose money has left.

**Never below ₹1.** Razorpay refuses an order under 100 paise, so
`promo_price()` floors there: a 100% code costs the buyer ₹1, and the
console says so. To give a plan away, use a **grant** — that path
already exists and records ₹0. A percentage keeps its paise: 10% off
₹7,999 is ₹7,199.10, and the card prints exactly that.

**The amount is checked where it can be.** The webhook's payment
entity carries `amount`, and `activate_payment()` now refuses one that
is not the row's (`22023`, the row stays `created`, the code is not
spent). Checkout's success handler carries no amount, so `rzp-verify`
is unchanged — the signature over `order_id|payment_id` is what proves
that path, and the order was created at the discounted amount.

**Where it is.** `payments` gained `promo_code`, `list_paise`,
`discount_paise`; `admin_list_payments()` returns them (dropped and
recreated — a return type cannot be replaced in place).
`src/lib/billing.js` has `quote()`, passes `code` on `buy()`, and
`admin.listPromoCodes()` / `admin.setPromoCode()`. `plan-cards.js`
draws "Have a code?" under the row; APPLY quotes every plan the row can
sell, a card whose quote is ok reprices itself (list price struck
beside it), the box says which plans took it, and BUY carries the
code. The code lives in the module's memory for the page and in no
storage. `billing-admin.js` has the Promo codes block: list with
DEACTIVATE / REACTIVATE, and a form (code, % or ₹, value, max uses,
valid-until date, note, plan tick-boxes). `scripts/schema-tests/
promo.sql` is the proof against PostgreSQL; `prove-billing.mjs` (j)
the proof in the browser.

**Not done, on purpose.** No per-user limit (a code is an offer, not a
credential; a code you want one person to use once gets `max_uses: 1`
and a note saying who). No stacking: one code per order. No code
on a grant — a grant is already ₹0. No rate limit on `quote_order`:
a brute-forced code buys a discount, not entry, and the codes are the
owner's to make unguessable; if that ever matters, revoke it from
`anon` and the box on `invite.html` will say to sign in first.

## 8. What an invite code means for the plan gate

> **SUPERSEDED IN PART (12 Oct 2026).** A code is no longer a key on its own: the
> box holds it (`fms_invite_code_v1`) and goes to Google, and `runGate()` redeems
> it for the account that comes back, worth a 7-day trial (`startCodeTrial()` in
> `cloud.js`). So the "code alone, no account" visitor described below no longer
> exists outside demo links (`…&demo=1`). Kept as the record of the original
> reasoning; see `CLAUDE.md` (top) and `docs/GATE.md` §0. Also, the Free column in
> §0 is the "no plan" state since §38 (`active = false`, named "No plan").

A visitor who enters on a **code alone** — `invite.html#code=…`, or the
code typed into the box, with no Google sign-in — is through the site
gate but has **no account**. `plan-gate.js` reads the plan off
`billing_status()`, which needs a signed-in user, and its rule is
stated in §0 above: *signed-out and code-only visitors are not gated*.
So a code-only visitor sees **every module, with no feature lock and
no `sample_only`** — the full product, as if on Pro — while the cloud
caps (projects synced, share links, collaborators, seats) do not apply
to them either, because those are triggers on rows they cannot write
without a session.

That is the intended behaviour, not a hole: the code is the owner's
own key, handed out by hand, and the plan tiers are a product boundary
for people with accounts. But it means **a gifted code is a gift of
the whole product**, not of the free tier. The console's "Issue a
code" form says so in one line. If the owner wants a code that admits
somebody to the free tier's view, the route is: issue the code, have
them sign in with Google as well, and the gate then reads their (free)
plan — or approve their request from the queue, which admits them with
an account from the start. A screening pass is unaffected: it opens
one project read-only and nothing else.

## 9. Growth — schema §21 onward (7 Oct 2026). §21–§23 RUN LIVE 8 Oct 2026.

Eight additions asked for at launch, each its own schema section, each
with checks in `scripts/schema-tests/<name>.sql` (run by
`npm run test:schema` AFTER §1–§20 and their own three files, because
§21 deliberately changes what §20 charged a returning buyer) and live
checks in `docs/SECURITY-RLS.md` §6c. The rule of §7 holds throughout:
**the client never sends an amount** — it sends a plan id, a code, and
now optional buyer details; every price is computed in the database.

### 9.1 Upgrade by paying the difference (§21)

`quote_for(user, plan, code)` is now THE price, and both callers use it:
`quote_order()` asks it for `auth.uid()` (the cards), and
`create_pending_payment()` for the buyer `rzp-order` verified. For a
signed-in buyer:

```
credit = sum(amount_paise) of their payments with status 'paid' and period 'lifetime'
due    = list − credit, floored at ₹1 (100 paise)  → never below 0
amount = promo_price(due, code)                    → a code discounts the DIFFERENCE
```

A grant (₹0) credits nothing, a refunded payment credits nothing, and a
month/year payment from before §18 credits nothing — it bought a period,
not the plan. The plan already held, or a lower one, is refused with
`22023` (hint `same_plan` / `downgrade`) at quote and at order.
`payments.credit_paise` records the credit, so every row reads
`amount = list − credit − discount`. `activate_payment()` now applies a
plan only when it is HIGHER than the organisation's current one: two
orders paid out of order no longer leave a Pro buyer on Indie.

The cards (`plan-cards.js`) ask `quote_order(plan, null)` for each higher
tier once per (plan held, payments) state, and a card with a credit
reads **"Upgrade to Indie — ₹5,000 (you paid ₹2,999 for Starter)"**, the
list price struck beside the difference. A signed-out quote has no user
and is unchanged. `rzp-order` returns `credit_paise` and must be
redeployed after §21 runs. Proved: `upgrade.sql` (28 checks) and
`prove-billing.mjs` (k).

### 9.2 Referral codes (§22)

A referral code is a `promo_codes` row with `kind = 'referral'` and
`owner_user_id` — so §20's whole path (the quote, the code on the order,
the use counted at activation) carries it unchanged. Every member with an
activated payment above ₹0 gets one, `REF-` + six characters from the
invite alphabet: minted by the `payments_referral_after` trigger at
activation, or on first ask by `my_referral()` for somebody who paid
before §22 ran. One per member (partial unique index).

- **The friend** gets `billing_settings.referral_friend_pct` off (default
  10%). Changing it on the console reprices every referral code at once.
- **The referrer** is owed, per ACTIVATED payment made with their code,
  one `referral_credits` row: `referral_reward_pct` of what the friend
  actually paid, OR a fixed `referral_reward_paise` (never more than the
  friend paid) — exactly one is set. Default: 10%.
- **Self-referral** is refused by `quote_for()` with reason `own_code`
  wherever the buyer is known (the signed-in card, and always at
  `rzp-order`). A refund of the friend's payment voids an unpaid credit.
- **Payout is by hand.** The Growth tab on `admin.html` lists every
  credit (referrer, friend, plan, what the friend paid, what is owed);
  tick the ones paid by bank/UPI and MARK SELECTED PAID with a note.
- **The member** sees their code with a COPY button, what it gives and
  earns, and their credits (owed / paid / void) under the plan cards on
  `settings.html#plan` — the account's billing tab rather than the
  Account panel, which is not a billing file.

`billing_settings` and `referral_credits` are closed to the client (RLS
on, no policy, API roles revoked). Proved: `referral.sql` (37 checks),
`prove-billing.mjs` (l). Nothing to redeploy.

### 9.3 Affiliate codes (§23)

An affiliate code is a promo code with `commission_pct` (0 < pct ≤ 100);
`admin_set_promo_code()` learns that one key and sets `kind =
'affiliate'` (clearing it makes the code a plain `promo` again; referral
and gift codes refuse one). Make it on Billing → Promo codes with
"Commission %" filled in. The buyer's discount is the code's, as §20.

**Nothing is stored per order.** `admin_affiliate_report()` derives, per
code, from the ledger at read time: paid orders, revenue (the sum of
`amount_paise` — already net of the discount AND any §21 upgrade
credit), the discount given, `commission_due = floor(revenue × pct /
100)`, refunds (which drop out of revenue by status), and the last order.
`admin_affiliate_orders(code)` lists who bought. The Growth tab shows
both; the commission is paid by hand. Proved: `affiliate.sql` (19
checks), `prove-billing.mjs` (m). Nothing to redeploy.



## 10. Refunds — schema §27 (8 Oct 2026). RUN LIVE 9 Oct 2026; `rzp-refund` deployed 12 Oct; never exercised end to end.

`refund.html` says purchases are final except a duplicate charge, a charge
that was not delivered, and where the law requires. §27 is how the studio
honours those without the Razorpay dashboard, and how a customer asks.

**Deploy order** (historical; all of it is done). (1) Run §27 of `supabase/schema/supabase-schema.sql` (it needs §16, §18
and §22 — it adds a column to `billing_settings` — and replaces
`mark_payment_refunded`). (2) `supabase functions deploy rzp-refund`
(verifies the JWT itself; the gateway check is fine too). (3) **Redeploy
`rzp-webhook`** — it now calls `record_refund()` on `refund.processed` and
learns `refund.failed`; add `refund.failed` to the webhook's events in the
Razorpay dashboard. Secrets are reused: `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET`; nothing new is set. `node scripts/deploy-billing.mjs
--functions` now deploys `rzp-refund` too. Then ship the client.

**`rzp-refund` WAS NOT ACTUALLY DEPLOYED UNTIL 12 Oct 2026**, and nothing
said so. Step (2) above was written on 9 Oct and read as done; the live
project answered **`404 NOT_FOUND`** for `/functions/v1/rzp-refund` for three
days while `rzp-order`, `rzp-verify` and `rzp-webhook` all answered 401. So
the console's REFUND button and the whole admin refund path were dead on a
site whose `refund.html` promises refunds in three non-discretionary cases.
It surfaced only from probing all four endpoints, not from reading anything.

The database side was complete the whole time: `begin_refund`,
`record_refund` and `mark_payment_refunded` all exist live and answer 42501
to anon. **Probe them WITH their argument names** — called with `{}` all
three answer `PGRST202`, which looks like "missing" and is not: PGRST202 is
*no matching signature*, and every one of them takes arguments. That misread
nearly got reported as three missing functions.

It is deployed now and answers `401 UNAUTHORIZED_NO_AUTH_HEADER`, the same
as `rzp-order` and `rzp-verify`. The route that worked:

```bash
npx --yes supabase@latest login        # in a REAL terminal: it needs a TTY
npx --yes supabase@latest functions deploy rzp-refund --project-ref conhlrulxfwkhsnymakz
```

Two things worth knowing before anyone tries this from a tool or a script.
`supabase login` refuses a non-TTY shell (`LoginMissingTokenError`) and wants
`--token` or `SUPABASE_ACCESS_TOKEN` instead — do not put a token in a file
or a command line; run the login in the user's own terminal and let the CLI
keep it in `~/.supabase`. And `WARNING: Docker is not running` is harmless
here: deploy uploads the sources (it uploaded `index.ts` **and**
`_shared/razorpay.js`) rather than bundling locally.

**Do not deploy this one from the dashboard's in-browser editor.** It imports
`basicAuth` from `../_shared/razorpay.js`, and that editor has no parent
directory, so the only way through it is to inline a copy of a shared file —
the duplication this codebase has already paid for twice (see the money
parser in CLAUDE.md). The CLI resolves `../_shared/` correctly.

**Still unexercised:** a refund has never actually been run end to end, in
test mode or live. Deploying the function makes it possible, not proven.

**The button (A).** Console → Billing → Payments: REFUND on every `paid`
row. The dialog asks for an amount (rupees, full by default, never more
than was paid) and a REQUIRED reason, and warns that a refund ends the
plan. The function: Auth names the caller, then `require_role(['finance'])`
is called AS the caller (the §45/§46 role matrix: owner and finance pass) —
a non-admin or a support admin gets 403 and nothing else runs; since §50
`begin_refund()` refuses an actor who is not owner or finance as well, so
the function is not the only gate. `begin_refund()` then locks the
payment row and checks it is captured, not refunded, has no refund in
flight, and that the amount fits; it writes a `refunds` row (`initiated`)
BEFORE Razorpay is called. Razorpay is called with Basic auth, the amount,
`receipt` = the refunds row id, `X-Refund-Idempotency` = the same id and
notes (reason, admin e-mail). `record_refund()` stores `pending` or
`processed`, or `failed` with Razorpay's sentence (a failed attempt does not
block a retry; an `initiated` row from a crash does, until looked at). One
refund per payment: a second partial is refused rather than guessed at.

**Who ends the plan — decided: both paths, idempotent.** A `processed`
answer (instant refunds) makes `record_refund()` call
`mark_payment_refunded()`; normal-speed refunds answer `pending` and the
`refund.processed` webhook does the same through `record_refund()` and
`mark_payment_refunded()`. `mark_payment_refunded()` now returns at once
for a payment already `refunded`, and `refunds` is upserted by the Razorpay
refund id, so whichever arrives first does the work and the other changes
nothing — including a webhook redelivered after the buyer bought again,
which used to end the new plan. A refund made in the Razorpay dashboard is
recorded by the webhook too. **A partial refund also ends the plan** (that
is what the webhook has always done); the dialog says so.

**Requests (B, C).** `billing_settings.refund_requests_enabled`, OFF by
default, is flipped by the switch on Billing ("Let customers request
refunds from Settings") through `admin_set_refund_requests_enabled()`; the
one public fact is `refund_requests_enabled()`. While off,
`request_refund()` refuses (42501), the Settings block does not draw and
the INSERT policy refuses a direct insert. When on, settings.html#plan
shows "Request a refund" to a member with a captured, unrefunded payment
(`my_refund_status()`): a reason category and some words, filed as a
`refund_requests` row — never a refund. One open request per payment, three
a day. The block shows pending / approved / declined (with the admin's
note) and the form returns only when a new request may be made. The
console's "Refund requests" list: APPROVE opens the REFUND dialog with the
request attached (on success the request becomes `refunded`; on a refused
refund it stays pending), DECLINE requires a note
(`admin_decide_refund_request`). `refunds` is closed to the client; the
console reads it through `admin_list_refunds()`.

**Proved:** `scripts/schema-tests/refunds.sql` (46 checks: RLS and RPC
refusals, the lock, double processing) in `npm run test:schema`; `prove:billing`
(n) against a faked Razorpay refund endpoint. **Not proved:** the function
against real Razorpay (the `X-Refund-Idempotency` header and the
`receipt`/`notes` fields follow Razorpay's refund API but have not met a
live account), and the live checks at the foot of §27.

## 11. Buyer invoices — Bill of Supply (schema §28, 8 Oct 2026). RUN LIVE 9 Oct 2026.

The seller is an individual **not registered for GST**, so the document is a
**Bill of Supply**: no tax is charged or shown. `doc_type` is CHECKed to
`bill_of_supply`; when `src/data/brand.json` `gstin` is filled, widen that
CHECK in a new section and add a tax-invoice mode (CGST+SGST vs IGST). Until
then an empty `gstin` prints "supplier not registered under GST". `address`
and `gstin` are optional brand keys, empty by default.

- **Number** `FMS/2026-27/000123`: FY is 1 April to 31 March read in
  Asia/Kolkata; the counter restarts each FY. Gapless: `issue_invoice()` locks
  the FY's `invoice_counters` row `FOR UPDATE` and bumps it in the same
  transaction as the insert. Invoices are never edited or deleted.
- **When**: an AFTER UPDATE trigger on `payments` (`payments_invoice_after`)
  issues one when a payment becomes `paid` with a price above zero, so
  `activate_payment()` and its redefinitions are untouched. Granted and
  zero-rupee payments get none. A failure in the sub-block warns, leaves the
  payment paid and burns no number; `admin_issue_invoice(payment_id)` repairs it.
- **Buyer GSTIN** (optional): `gstin_valid()` checks format, state code and the
  mod-36 checksum; `src/lib/invoice.js` mirrors it. `set_buyer_gstin()` works
  **only before issue** (payment `created`/`failed`): an issued number is a
  legal record and is never edited. After issue it raises 22023.
- **RLS**: buyer reads own (`inv_select_own`), admin all; counters and buyer
  details are closed; `my_invoices()`, `admin_list_invoices()`.
- **Client**: Plan tab lists invoices with DOWNLOAD PDF; the console has an
  Invoices section (`src/ui/invoice-panels.js`). The PDF is built in the
  browser through the print path (`src/lib/invoice-pdf.js`, lazy).
- **Run order**: after §16–§26, run §28 in the SQL editor (idempotent). Nothing
  to redeploy; payments made before §28 are not back-filled (call
  `admin_issue_invoice` per payment if wanted). Proved: `npm run test:schema`
  (`invoice.sql`) and `npm run test:invoice`.

## 12. The trial, and the free plan's withdrawal (schema §30, 9 Oct 2026). RUN LIVE 9 Oct 2026.

**The owner's decision: the free plan stops being a place to live.** Signing
in buys **thirty minutes with the Dragon sample**; an invite code buys
**seven days**; then a wall. One switch in the console turns trials off
entirely, and sign-in then lands straight on the wall.

### Entitlement is a second axis

```
entitled     = user_plan(uid) <> 'free'  OR  trial_active
trial_active = trial_started_at is not null
           AND now() < trial_started_at + trial_minutes
           AND billing_settings.trial_enabled
           AND disabled_at is null
```

**Nothing in §30 touches `plan`, `plan_until`, `plan_period`,
`apply_plan()`, `accounts_guard` or `mark_payment_refunded()`.** A trial
user's plan is literally `free`, and free's `features` map was already
`{"sample_only": true, "new_projects": false}` from §18 — so the trial's
scope needed **no new gating anywhere**. `plan-gate.js`, `hub.js` and
`hub/project-cards.js` already filter the studio to the sample.

**The design that was rejected, and why it matters.** The first draft
granted `pro` for the trial's length. It reads better and it is wrong:
`quote_for` raises `same_plan` / `downgrade` for anybody whose
`user_plan` is not free, so **a trial user on `pro` could not have bought
anything at all** for the length of their trial. The feature would have
sold nothing.

**The trial columns live on `studio_members`, not `accounts`.** Two
independent holes closed by that choice: `acc_delete` is
`for delete using (owner_id = auth.uid())`, so a user can DELETE their own
accounts row through PostgREST and come back for a fresh trial; and
`accounts_guard` defends only the six columns it names, so a `PATCH` from
the devtools console would reset `trial_started_at`. `studio_members` has
select-only RLS and no write grants — the absence of a policy is the
policy.

**`trial_minutes` is a snapshot per member.** Read live from the settings
and an owner editing 30 → 10 would end every running trial mid-sentence,
and 30 → 240 would resurrect expired ones. The setting decides only what
the *next* trial gets; the console says so.

**The grandfather backfill is not optional.** `trial_enabled` defaults
true and no existing member has a `trial_started_at`, so the instant the
predicates exist every member invited under the old rules is
`entitled = false` and meets the wall. §30 backfills everyone already
through the gate with a year at full scope, **in the same transaction** —
between the two, every existing member is locked out.

### The price rise fires itself

`plans.next_price_paise` + `plans.next_price_at`, and
`billing_settings.price_rises_after_buyers`. `effective_price(plan)`
returns the new figure once the date has passed **or** the buyer cap has
filled, whichever comes first, and **`quote_for` reads it** — nothing else
in the file computes a price.

That is the whole legal basis for the countdown on the landing page. A
price rise announced and not executed is "false urgency", the first named
practice in India's CCPA *Guidelines for Prevention and Regulation of Dark
Patterns, 2023*, and this is an Indian seller charging through Razorpay.
So the database refuses a rise that is not one: `plans_next_price_check`
requires `next_price_paise > price_paise`, and `admin_set_next_price()`
refuses a lower price, a price with no date, and (via the constraint) a
date with no price.

Seeded 9 Oct 2026, editable from the console: starter ₹599 → **₹999**,
indie ₹799 → **₹1,499**, pro ₹999 → **₹1,999**, all at 31 Oct 2026
23:59 IST, cap **100** buyers.

**Each seeded update is guarded with `price_paise < <new>`.** The file's
own §18 seed carries the yearly placeholders (299900 / 799900 / 1999900),
against which those "rises" are falls — and a raised `check_violation`
there would roll back the whole of §30, the trial included. Guarded, a
tier whose price is not what was measured is skipped rather than fatal.

### What `entitled` is not

**A product boundary, not a data one.** Every page, script and JSON file
on this site is public and static; a lapsed visitor with devtools can
delete the wall and read all of it, and can still sync one cloud project
because the free plan's limits allow one. RLS and the P0402 limit triggers
are the real boundary and §30 does not move them. The client says so in
`plan-gate.js`'s banner and the schema says so in §30's header.

Two more honest limits, both written into the section: founding seats are
**not reserved** between order creation and activation, so several buyers
at the last seat all get the old price; and an order quoted while the old
price stood **activates at its quoted amount** afterwards, because you
cannot re-charge a card.

### The client half

| | |
|---|---|
| `plan-gate.js` | `entitlement()`, `entitled()`, `trialEndsAt()`, `walled()`; the wall is `.pg-lock.pg-wall`, a VARIANT of the existing lock, never a rename |
| `ui/trial-band.js` | borrows the single `.sh-plate` and gives it back; minutes, not seconds |
| `billing.js` | `startTrial()` → `rpc('start_trial')` |
| `funnel.js` | `priceNotice()` → `rpc('price_notice')`, plain fetch, never throws |
| `invite.js` | the trial CTA — FIRST on the page since 12 Oct 2026, and the request block is off the public door |
| `hub.js` | opens the sample by itself when a trial is running and the studio is empty |

**THE TRIAL WAS UNREACHABLE FROM 11 TO 12 OCT 2026, AND ONE LINE DID IT.**
`invite.js`'s `readTrialOffer()` offered a trial only when
`st.entitled !== true`. `billing_status()` computes `entitled` as
`(not purchase_required) or (plan <> 'free') or trial_active`, and the live
switch is OFF — so `entitled` is **true for everybody**, so the offer was
never on, so the "Start your free trial" block was never drawn and nobody
could begin one. The feature was built, deployed, enabled at thirty minutes,
and invisible. Entitlement answers *may they use the app*; whether to OFFER a
trial is a different question, and the four facts that answer it are: trials
are on, this account has not had one, is not in one, and has never paid.

**Nothing starts a trial by itself** (owner, 12 Oct 2026). It begins on a
press. The one exception is a redeemed invite code — `startCodeTrial()` in
`cloud.js`, inside the code-redemption block — because `redeem_invite()`
writes the membership row but never `trial_started_at`, so with the purchases
switch ON a code holder became a member who was not entitled and got walled by
the very thing the code was supposed to open. Submitting the code was the
press.

**After the press, the trial lands on the FILM.** `startTrial()` goes to
`enterAddress()` (the demo link's existing landing) rather than a bare hub: the
button's own sentence promises the Dragon sample and a signup trial's scope
*is* `'sample'`, so an empty hub hands somebody a studio with nothing in it and
thirty minutes to find what they were shown.

**`entitlement()` fails OPEN** — unknown means entitled. See the trap of
that name in `CLAUDE.md`: a paywall that closes when it cannot reach the
server locks out the people who have paid, and `npm run verify` loads all
21 pages signed out.

### Deploy order

§26 → §27 → §28 → §29 → §30 → §31. **ALL SIX RAN LIVE on 9 Oct 2026**,
each verified afterwards over PostgREST rather than from the screen.

**§32–§39 all RAN LIVE on 12 Oct 2026** (§13–§19 below; §34 on the owner's
word, not a probe). They were written as "next owner steps" in the order
**§32 → §33 → §34 → §35 → §36**, which is kept in each section's deploy list
as the order to follow on a fresh project.

**Checksum every paste.** `pbcopy` → Chrome turns an em-dash into `‚Äî`;
§30's refusal sentences carry em-dashes and `₹`, so that mojibake would
have reached buyers. Base64 the section, decode it in the page, set the
Monaco model, then SHA-256 the editor against the file before Run.

## 13. Purchases required, and access by e-mail (schema §32, 11 Oct 2026). RUN LIVE 12 Oct 2026.

**The owner's decisions.** The studio is free to use right now: nothing to
buy, nothing walled, nothing capped. One console switch, **Purchases
required** (admin.html → Purchases tab), turns buying on; from then on
everyone who has neither paid nor a running trial meets the §30 wall —
people mid-session too, because `plan-gate.js` re-reads `billing_status()`
on window focus / visibility (throttled to 5s) and every 4 minutes. And the
console can **give access by e-mail** (admin.html → Give access): Member or
Admin, a plan from the plans table or none, "Until I remove it" (default) or
N days; applied at once if the address has a confirmed account, otherwise at
its first sign-in; a granted address passes the invite gate with no code.

**What §32 contains.**

| Object | What it does |
| --- | --- |
| `billing_settings.purchase_required` | boolean, **default false** — running §32 turns purchasing OFF on the live project. That is the decision. |
| `purchases_required()` | anon + authenticated; the landing page reads it with plain `fetch` (no SDK) |
| `user_limits()` (restated) | `'{}'` while off, so the three P0402 triggers stand down |
| `open_features()` | internal; the top paid plan's `features`, chosen by `plan_rank()` |
| `billing_status()` (restated in full from §30.6) | every key kept, plus `purchase_required`; off ⇒ `entitled` true and `features` = `open_features()` |
| `admin_set_billing_settings()` (restated from §30.9) | accepts `purchase_required`, JSON boolean only |
| `email_grants` | one row per address, RLS on, no policy, no client grants |
| `apply_email_grant()` / `undo_email_grant()` | internal; membership + role + the plan via `account_for_buyer()` → `apply_plan()` (the `admin_grant_plan` path); records what it changed |
| trigger `email_grants_on_user` on `auth.users` | applies a pending grant at sign-up / confirmation; never fails a sign-up |
| `studio_status()` (restated, now plpgsql/volatile) | claims a pending grant first, then the §14.2 answer unchanged |
| `admin_grant_email(email, role, plan, days, note)`, `admin_revoke_email_grant(email)`, `admin_list_email_grants()` | admin-only (`is_studio_admin()`, 42501 otherwise) |

**Rules worth holding.** A grant writes no `payments` row (that would make
`start_trial()` answer `paid`). Matching needs a CONFIRMED address. A timed
grant is not laid over a plan the person bought (its lapse would end the
purchase too). Revoke restores the prior plan only if nothing was paid
since, demotes an admin it made, and DISABLES a membership the grant itself
created (not deleted — a deleted row would hand out a fresh trial).

**The client.** `plan-gate.js` publishes the flag only when the key is
PRESENT; while it is `false`, `html[data-purchases="off"]` hides every
`a[href^="purchase.html"]` (the rail's Purchase entry, Settings' "Plan &
purchases", the dashboard's plan tile, lock-card and hub links), the trial
band does not draw (reason `free`), and purchase.html says *"The studio is
free to use right now — nothing to buy."* start.html hides its price list
on an explicit `false` from the anon call. A database without §32 sends no
key and nothing changes. Signed-out purchase.html does NOT ask (verify
loads it signed out; its words must not depend on a live database).

**Proved.** `test:schema` (`scripts/schema-tests/purchases.sql`, run after
§32 loads — the schema test now loads in three phases so the §30 checks
still describe the switched-on database), `prove:billing` (p),
`prove:gate` (m2), `prove:growth` (start.html off). The fake defaults the
switch ON so every older proof still asserts the wall.

### Deploy (owner)

1. Run **§32** (from `-- 32. PURCHASES REQUIRED` down to, NOT including,
   `-- 33. A FREE TRIAL` — §33 follows as its own step, §14 below) in the
   dashboard SQL editor, the documented way:
   base64 the section → decode in the page → set the Monaco model →
   SHA-256 the editor's contents against the file → Run.
2. Confirm over PostgREST: `rpc/purchases_required` with the anon key
   returns `false`; `rpc/admin_list_email_grants` with the anon key returns
   42501 (exists, refuses).
3. If the trigger on `auth.users` is refused (owner privileges), the grant
   still applies at first sign-in through `studio_status()`; record it.
4. Until §32 runs the site behaves exactly as today, because the key is
   absent and the client keeps its current rules.


## 14. A free trial, not a free plan — set in hours (schema §33, 11 Oct 2026). RUN LIVE 12 Oct 2026.

**The owner's decisions.** "Let's not have a free version; it can be a free
TRIAL version that lasts for configured HOURS." And: users ended in a loop
when the trial ran out, and trial users had a sign-out problem.

**Nothing is stored differently.** The trial's length stays in MINUTES
(`billing_settings.trial_minutes`, and the snapshot on
`studio_members.trial_minutes`), so every row already written stays valid
and no running trial moves. The console (admin.html → Growth → Trial) takes
and shows it in **hours** (`hours × 60` is saved; 30 minutes reads 0.5), and
so does "Grant more time". `src/lib/trial-time.js` is the one formatter
(pure, in the `startlib` chunk with funnel.js): the band says "2 h 15 min
left", invite.html "START MY 3 HOURS", the landing page's trial card "3
hours".

**No Free plan anywhere.** The `free` plans row stays — it is the "no plan"
state `user_plan()` answers, and `quote_for()` already refuses it — but it is
never drawn as a choice: no Free card on purchase.html or invite.html, no
Free tier or column on start.html (the first card is the free TRIAL; the
build checks `li[data-tier]` is the PAID tiers plus exactly one
`li[data-trial]`), no Free option in either console grant list (there never
was), and the Features matrix labels that column "Free trial (no plan)". With
**Purchases required OFF** nothing changes from §32: the studio is free to
use and purchase.html says so.

**What §33 contains.**

| Object | What it does |
| --- | --- |
| `trial_offer()` | anon + authenticated: `{trial_enabled, trial_minutes, trial_hours, purchase_required}` for start.html's trial card |
| `billing_status()` (restated in full from §32.3) | every key kept, plus `trial_hours`, `server_now` — the trial band counts against the SERVER's clock — and `granted` |
| `email_grant_active(uid)` | internal: an applied, unexpired (`until` null or future), PLAN-LESS grant on a membership that is not disabled |
| `user_limits()` (restated from §32.2) | also `'{}'` for somebody on no plan while `email_grant_active()` |
| `admin_get_billing_settings()` (restated) | adds `trial_hours` |

**Access given by e-mail is access (owner, 11 Oct 2026).** With purchases
required, a Member or Admin given access by e-mail WITHOUT a plan gets the
whole studio — `entitled` true, `features` = `open_features()`, limits
`'{}'`, `granted` true — until the grant is revoked or its `until` passes.
Then they are in the ordinary state: the trial if they never used it, else
the wall. A grant that NAMES a plan is that plan (`granted` false). Client:
`plan-gate.js` reason `granted` (no band, no wall), the dashboard tile and
purchase.html say "Access given by the studio", invite.html's "You're in"
says so too.

No ALTER, no data change, CREATE OR REPLACE throughout; re-runs cleanly.

**The loop, and the sign-out.** No automatic redirect loop exists: counted
in the fake, a trial expiring on an open page causes 0 navigations and a
fresh load after expiry 1. The loop users met was a cycle with no exit: the
wall hid `.sh-bar` and the phone's `.mab` (plan-gate.css, `[data-paywall]`),
which held the only sign-out route (the account pill → Settings); the wall
offered only SEE PLANS and DOWNLOAD; invite.html told the same member
"You're in — GO TO THE STUDIO", back to the wall; and the landing page's
Continue with Google came straight back to it. Now the wall carries SIGN OUT
(and, for a member who never had a trial, START MY N HOURS), invite.html and
purchase.html say the trial ended and offer SIGN OUT, a plan bought in one
tab takes another tab's wall down (BroadcastChannel `fms-billing`, nothing
stored), and the band's expiry re-asks the server once if the two clocks
disagreed.

**Proved.** `test:schema` (`scripts/schema-tests/trial-hours.sql`, check 8
for the grant), `prove:billing` (q), (r) and (s), `prove:gate` (m2) and
(q), `prove:growth`.

### Deploy (owner) — after §32 (done 12 Oct 2026)

1. Run **§33** (from `-- 33. A FREE TRIAL` down to, NOT including,
   `-- 34. A REFUND GIVES A FRESH TRIAL` — §34 is its own step, §15 below)
   the same checksummed way as §32.
2. Confirm over PostgREST: `rpc/trial_offer` with the anon key answers the
   four keys; `rpc/billing_status` signed in carries `server_now` and
   `granted`.
3. In the console, set the trial length in hours (Growth → Trial). Until §33
   runs the client still works: it reads `trial_minutes`, and
   `server_now`/`trial_offer()`/`granted` are optional (absent ⇒ the
   browser's clock, the landing page's "a limited time", and no grant
   wording — which, with purchases required, would wall a plan-less grant,
   so run §33 BEFORE turning Purchases required on).
4. Legal copy: refund.html §7 and terms.html §4–§5 now say "free trial"
   of the configured hours instead of "the free plan" (11 Oct 2026).

## 15. A refund gives a fresh trial (schema §34, 11 Oct 2026). RUN LIVE 12 Oct 2026.

**The owner's decision.** A refunded buyer gets a FRESH trial of the
configured length. `start_trial()` still refuses a second trial on request
(`used` / `paid`); the refund gives one by itself.

**One trigger covers every path.** A payment becomes `refunded` only in
`mark_payment_refunded()` (§16.6 / §27.7), reached from rzp-webhook's
`refund.processed`, from rzp-refund via `record_refund('processed')`, and
from a dashboard refund (the webhook again). `payments_refund_trial` is a
CONSTRAINT trigger on `payments.status`, **deferred to commit**: the status
is written before the plan is ended, so only at commit is "no other active
paid plan" simply `user_plan() = 'free'`. Then the studio_members row gets
`trial_started_at = now()`, `trial_minutes` = the current setting,
`trial_source = 'refund'`, `trial_scope` = the configured scope;
`disabled_at` is never touched. A redelivered webhook is a no-op
(`old.status` already `refunded`); a buyer still on another plan keeps their
row untouched; a failure inside is a WARNING, never a lost refund.

| Object | What it does |
| --- | --- |
| `studio_members_trial_source_check` | dropped and re-added with `'refund'` |
| `payments_refund_trial()` + constraint trigger `payments_refund_trial` | the fresh trial, at commit |

**Proved.** `test:schema` (`scripts/schema-tests/refund-trial.sql`),
`prove:billing` (s) (a refunded buyer sees the trial band).

### Deploy (owner) — after §33

1. Run **§34** (from `-- 34. A REFUND GIVES A FRESH TRIAL` up to, NOT
   including, `-- 35. RECEIPT AND REFUND E-MAILS`) the same checksummed way.
2. Confirm: `select tgname, tgdeferrable, tginitdeferred from pg_trigger
   where tgname = 'payments_refund_trial'` → one row, true, true; and
   `pg_get_constraintdef` of `studio_members_trial_source_check` names
   `refund`.
3. No edge function changes and no redeploy are needed.

## 16. Receipt and refund e-mails, and a clearer invoice (schema §35, 11 Oct 2026). RUN LIVE 12 Oct 2026.

**The owner's decision.** "Once a user has purchased the product we should
send mail to the user, from support@filmmakerstudio.in." Provider: **Resend**.
Scope: the purchase receipt and refund updates (processed / failed).

**How it is sent.** Server-side only, from the edge functions, through
`supabase/functions/_shared/mail.js`, never from the browser (the API key is a
secret). The Hostinger mailbox is untouched: it still RECEIVES mail and every
message carries `Reply-To: support@filmmakerstudio.in`, so a customer's reply
lands there. Hostinger's SMTP is not used, because Supabase Edge Functions
cannot open SMTP ports 25/587.

| Event | Who sends | Mail |
| --- | --- | --- |
| checkout success | `rzp-verify` (in the background, after activation) | receipt |
| `payment.captured` | `rzp-webhook` | receipt (whichever claims first; the other sends nothing) |
| `refund.processed` | `rzp-webhook` | "Refund processed" |
| `refund.failed` | `rzp-webhook` | "Your refund could not be completed" |
| console RESEND RECEIPT | `rzp-verify` `{resend_invoice}` (admin-checked by `admin_resend_receipt()` as the caller) | receipt again |

**Sent exactly once.** §35 claims each mail with an UPDATE only one caller can
win (`invoices.emailed_at`, `refunds.emailed_status`); the winner sends; a
failed send releases the claim so a retry can send. Resend's `Idempotency-Key`
(`receipt-<invoice id>`, `refund-<id>-<status>`) is the second guard. A mail
failure never fails the payment: it is logged and the function still answers
200. Without `RESEND_API_KEY` / `MAIL_FROM` nothing is claimed and nothing is
sent, so mail can be switched on later and nothing is lost. Invoices issued
BEFORE §35 are left unmailed on purpose; RESEND RECEIPT sends one.

**What §35 contains.** `invoices` gains `razorpay_payment_id`,
`razorpay_order_id`, `paid_at` (copied from `payments` by a BEFORE INSERT
trigger; existing rows backfilled once) and `emailed_at`; `refunds` gains
`emailed_status`. Service role only: `claim_receipt_email(order)`,
`release_receipt_email(invoice)`, `claim_refund_email(rzp_refund, status)`,
`release_refund_email(refund)`. Admin: `admin_resend_receipt(invoice)`.
`issue_invoice()`, `my_invoices()` and `admin_list_invoices()` are not
restated. Proved by `test:schema` (`scripts/schema-tests/receipt-email.sql`)
and `test:billing` (the builders, the Resend call, claim → send → release
against a fake client).

**The invoice PDF** (`src/lib/invoice-pdf.js`) now prints a PAID mark,
supplier (name, address once `brand.json` `address` is filled, e-mail,
website), payment details (dates in IST, Razorpay payment and order ids,
method), Qty / Rate / Amount with "one-time purchase · lifetime access · no
renewal", the amount in words, the GST note, a **Refund policy** box, and
"computer-generated, needs no signature". The refund sentence is
`REFUND_TERMS` in `supabase/functions/_shared/terms.js`, shared with the
e-mail and worded as `refund.html` words it: purchases are final and
non-refundable EXCEPT a duplicate/erroneous charge, a plan never activated,
or where Indian law requires a refund. A flat "no refunds" would contradict
the published policy. Change both together.

### Deploy (owner)

1. **Resend → Domains → Add `filmmakerstudio.in`.** Add the records it lists
   at **Hostinger DNS**: the DKIM TXT (`resend._domainkey`) and the `send`
   subdomain's MX and SPF TXT. They sit on `send.` and `resend._domainkey`, so
   the root MX / SPF / DMARC that serve the mailbox are NOT edited. Wait for
   "Verified".
2. **Resend → API Keys → create** a key with *Sending access* for that domain.
3. `supabase secrets set RESEND_API_KEY=re_… MAIL_FROM="FilmMakerStudio <support@filmmakerstudio.in>"`
4. Run **§35** (from `-- 35. RECEIPT AND REFUND E-MAILS` up to, NOT including,
   `-- 36. PLAN FEATURES FROM THE MATRIX`; the file now runs on to §39) the checksummed way, after §32, §33 and §34.
5. Redeploy **`rzp-verify`** and **`rzp-webhook`** from current source (both
   import `_shared/mail.js`). Keep `rzp-webhook` on `--no-verify-jwt`.
6. Check: one test purchase → the receipt arrives; in Gmail, *Show original*
   reads SPF, DKIM and DMARC **PASS**. Then one refund → the refund mail. The
   console's Invoices list shows "Sent <date>".
## 17. Three plans, each including everything below it (schema §36, 11 Oct 2026). RUN LIVE 12 Oct 2026.

The owner's decision: **Basic writes the film, Intermediate prepares it,
Pro is everything** — and the matrix REPLACES the live features map (the
console's Features table can fine-tune it afterwards).

| Plan | Adds |
| --- | --- |
| Basic | Story (Beats & Pacing, Idea Vault, the Story Bible on story.html), Screenplay (Script, Drafts & revisions, Import a script), Script Breakdown, Scene List, Screen Time, Title page & documents, the whole Library, PDF exports, script import, new projects |
| Intermediate | Scene Breakdowns, Elements, Auto-Tagging, Cast Matrix, Shot List, Storyboard, Lookbook, Pitch Deck, Media, Budget, Contacts, Stripboard, Songs, Calendar, Locations, Day Out of Days, Sides, Reports, Google Drive backup, the Chrome extension |
| Pro | Shoot Day, Call Sheets, Edit Log, Deliverables, AI tools (own key), Remove branding |

(`docs`, "Title page & documents" on drafts.html, was not named by the
owner; it is Basic, beside Drafts. One edit to the JSON moves it.)

**One source.** `src/data/plan-matrix.json` covers every module id in
`navigation.json` and every capability; `npm run test:plans` fails on a
module missing from it, on a plan that is not a superset of the one
below, and on §36 differing from what
`node scripts/make-plan-features-sql.mjs` generates. To change the split:
edit the JSON, run the script with `--write`, commit both, and run the
new §36. The 'free' row (the trial / no-plan state) is not touched.

**What enforces it (client; fails open like everything in plan-gate.js).**
A page whose every module is off shows the plan lock; a module that is
one SECTION of a page shared with a lower plan's modules locks that
section in place (`[data-tab-lock]`) — Cast Matrix / Sides / Reports on
reports.html for Basic, Call Sheets on contacts.html for Intermediate. A
target nested inside an allowed module's (breakdown.html `#breakdown`,
the cards inside the Scene List) is not hidden. Capabilities:
`exports` in `pdf.js` exportPDF (an invoice is never held back; the
backup download never is either), `script_import` in the importers of
script.html, write.html and breakdown.html, `drive_backup` in
drive-sync.js connect()/push and on Settings, `ai_tools` in ai-panel.js,
`remove_branding` in footer.js, `new_projects` on the hub, and
`limits.extension` (which §36 also sets: off on Basic) in the panel.

**What §36 writes.** `plans.features` for starter / indie / pro, replaced
whole, every key true or false (no `sample_only` on a paid plan), and
`limits.extension` merged into `limits`. While purchases are not
required, or for a plan-less e-mail grant, `billing_status()` serves
`open_features()` — now Pro's map. Proved on a real PostgreSQL by
`scripts/schema-tests/plan-features.sql` and in the browser by
`prove:billing` (t).

### Deploy (owner) — after §34

1. Run **§36** (from `-- 36. PLAN FEATURES FROM THE MATRIX` to `-- END OF SECTION 36 (generated)`;
   §37 below is its own run) the same checksummed way.
2. Confirm: `select id, features, limits->'extension' from plans` — the
   three paid rows match `matrixFeatures(id)`; free is unchanged.
3. Open admin.html#features: the ticks are the split above.

## 18. Writing-goal history syncs across devices (schema §37, 12 Oct 2026). RUN LIVE 12 Oct 2026.

Not billing, but it is a schema section and its deploy steps live here with
§24's siblings. `project_data.scope` gains `write_goals`; `fms_write_goals_v1`
(focus-mode goal + per-day history) moves out of `LOCAL_ONLY` in `cloud.js`
and is merged day by day (`mergeWriteGoals`), so two devices keep each
other's days. Tests: `scripts/schema-tests/goals-sync.sql`.

### Deploy (owner) — independent of §32–§36

1. Take the text from `-- 37. ONE MORE SYNC SCOPE: write_goals` to
   `-- END OF SECTION 37` in `supabase/schema/supabase-schema.sql` (the file now
   continues with §38 and §39). Base64 it (`base64 -w0`), paste the ASCII, decode
   in the SQL editor page (never paste raw SQL through the clipboard — it
   corrupts non-ASCII), and compare the editor's SHA-256 with
   `sha256sum` of the same text before pressing Run.
2. Expect "Success. No rows returned". Read back: `select pg_get_constraintdef(oid)
   from pg_constraint where conname = 'project_data_scope_check'` names
   `'write_goals'` and still `'characters'`, `'costs'`.
3. Re-running is safe. Until it runs, only that one scope's saves are refused
   (and retried); nothing else is affected. Then mark it RUN in the header.

## 19. The free plan is retired, and the switch that requires one (schema §38 and §39, 12 Oct 2026). §38 and §39 RUN LIVE 12 Oct 2026 — THE SWITCH IS NOT THROWN.

The owner decided on 11 Oct 2026 that there is no free version, only a free
trial. §33 recorded the decision, kept the row and said that never drawing it
as a choice was "client work". The client did its half. The server did not,
and on 12 Oct 2026 an anonymous caller still got this from the live project:

```
price_notice()            -> plans[0] = {"id":"free","name":"Free","price_paise":0}
/rest/v1/plans?id=eq.free -> blurb "Admitted, unpaid. One film in the cloud."
```

So the one price feed a stranger can read was advertising a free plan on a
site whose own Terms of Service deny it exists. **§38 closes that. §39 does
not close the other half, and must not yet.**

### What each section does

**§38 — the offer is withdrawn, the row stays.** `plans.free` becomes
`active = false`, named "No plan", with a CHECK so a console toggle cannot
re-list it. The row cannot be deleted: `user_plan()` returns `'free'` for
anybody who has bought nothing, and `billing_status()`, `user_limits()` and
the three P0402 limit triggers all read it as the "no plan" state.

It is safe because of a property worth re-checking before anyone changes it:
**every read that can receive `'free'` reads `plans` WITHOUT an `active`
filter**, and **every read that filters on `active` is a purchase path** that
already refuses `free` by id or by its zero price. The only two readers that
filter on `active` and are not purchase paths are `price_notice()` and
`price_notice(currency)` — which is the whole point. Nobody's entitlement,
limit or feature map is read differently after §38 than before it.

**§39 — the census, and one guard.** It adds `admin_purchase_wall()`
(members / paid / in_trial / walled / grandfathered_walled, admin only) and
restates `admin_set_billing_settings()` with a single new refusal.

**§39 DOES NOT THROW THE SWITCH.** `billing_settings.purchase_required` is
operational state with an admin RPC of its own, and §32's own check 1 asserts
it is false after loading — flipping it in the schema file would change the
fixture every later test runs against. It stays an owner step, below.

### Deploy (owner) — DONE 12 Oct 2026

Both sections were run through the dashboard SQL editor, each loaded into
the Monaco model from base64 (§39 gzipped) rather than pasted, and each
SHA-256'd **in the editor** against the file before Run. §39 carries the
referral sentence's **en-dashes** (`1–100%`), copied byte-for-byte from
§32.4 — the character the clipboard has mangled before — and the digest
confirmed them intact.

Verified afterwards over PostgREST, not read off the screen:

| Probe | Answer |
|---|---|
| `price_notice()` | three plans, no `free` |
| `price_notice('USD')` | three plans, no `free` |
| `plans?id=eq.free` | name "No plan", `active false`, `limits` and `features` **unchanged** |
| `quote_order('free')` | 22023 "That plan is not for sale" |
| `quote_order` starter / indie / pro | 59900 / 79900 / 99900 — selling unbroken |
| `admin_purchase_wall()` | 42501 (exists and refuses anon; PGRST202 would be missing) |
| `admin_set_billing_settings()` | 42501 (exists) |
| `purchases_required()` | **false** on 12 Oct — the switch was not thrown by §39. **Read TRUE on 19 Oct 2026** (owner threw it; census: members 6, paid 3, walled 3, grandfathered_walled 0) |

### Throwing the switch — NOT YET, and here is the order

Requiring a plan is one call:

```sql
select public.admin_set_billing_settings('{"purchase_required": true}');
```

**Do not make it until all four of these hold.**

1. **Resend works** (§16 above) — STILL OPEN at the 13 Oct record: `RESEND_API_KEY`
   and `MAIL_FROM` were unset (`docs/HANDOFF.md` B14). §35 is live, so a payment already CLAIMS a
   receipt and then fails to send it. Requiring a purchase before that is
   fixed means the first person walled is also the first person to pay and
   get nothing in writing.
2. **One real purchase has been proved end to end** on the live Razorpay key,
   with the webhook delivering **200** — and a refund exercised once.
3. **§36 (three plans from the matrix) has run — SATISFIED, run live 12 Oct
   2026.** Before it ran, probed live on 12 Oct
   2026: `starter`, `indie` and `pro` all carry an EMPTY `features` map, so
   `allowed()` finds no key and permits everything. Require purchases before
   §36 runs and the three paid tiers are indistinguishable — a Basic buyer
   gets Pro. This was not obvious and is the reason to read the table rather
   than assume the tiers differ.
4. **`admin_purchase_wall()` reads `grandfathered_walled: 0`.** §30's
   backfill gave every member admitted before 9 Oct 2026 a year at full
   scope, because "they were let in on a promise of a free plan; taking it
   away retroactively is not what the owner asked for". That year runs out in
   **October 2027**. §39's guard refuses the switch rather than let it lock
   those people out silently; if it ever fires, give them a plan, a longer
   trial or an e-mail grant first. A member who arrived *after* that line and
   let a 30-minute trial lapse does not block it — walling them is the intent.

### What is still not true after §38 and §39

refund.html §7 says *"There is no free plan: when that trial ends, a plan is
needed again."* The first half becomes true with §38. **The second half stays
false until the switch is thrown**, because `purchase_required` is false and
`billing_status().entitled` is therefore true for everybody. The same
sentence sits on terms.html:74 and start.html. Either throw the switch or
soften the pages — do not leave a legal page making a claim the database
contradicts.

## 20. Refunds follow the role matrix, seats follow the plan, a decline sticks (schema §50, 19 Oct 2026). NOT YET RUN LIVE.

Three corrections, each restating one function body plus a marked block
(`supabase/schema/schema-50-refund-seat-trial.sql`, checks in
`scripts/schema-tests/refund-seat-trial.sql`):

- **Refunds are a finance decision end to end.** `rzp-refund` asks
  `require_role(['finance'])` as the caller (owner always passes) instead of
  `is_studio_admin()`, and `begin_refund()` refuses a `p_admin` who is not an
  owner or finance administrator (42501, which the function maps to 403).
- **A pending refund does not settle the request.** `record_refund()` marks a
  linked refund request `refunded` only on `processed`; while Razorpay says
  `pending` the request reads `approved`. The plan still ends only on
  `processed` (unchanged), and a refund that later fails leaves an open,
  approved request to retry. Once the PAYMENT reads refunded, its open
  request is settled `refunded` whichever refunds row carried the news (the
  `refund.processed` webhook can arrive before `rzp-refund` stored the
  Razorpay id and record its own row), and a late `pending` never walks it
  back. `admin_decide_refund_request()` refuses to decline a request while a
  refund on its payment is `initiated` or `pending` (22023).
- **Seats follow the plan the account is on now.** `enforce_seat_limit()`
  caps the stored `accounts.seat_limit` by `account_plan()`'s `seats` limit,
  so a lapsed timed grant or a refunded plan stops admitting new seats; and
  `mark_payment_refunded()` brings `seat_limit` down to the free plan's cap
  when it ends the plan. Seats already taken are not removed.
- **A declined invite request stays declined for the trial.** New column
  `invite_requests.last_declined_at`, kept by a trigger: set when a request
  becomes `declined`, cleared only when it becomes `approved`;
  `request_invite()`'s re-ask leaves it alone. `start_trial()` refuses a
  non-member while it is set. The backfill marks today's declines and any
  pending re-ask by a non-member; it runs before the trigger is created,
  because the trigger keeps a pending row's (null) mark and would otherwise
  make the re-ask half write nothing.

**Owner steps.**
1. Run §50 in the SQL editor — after §49 (develop's co-editing switch) — verifying the checksum first
   (`shasum -a 256 supabase/schema/schema-50-refund-seat-trial.sql` must read
   `95f801230f19eca0736df3f0f388d049137945f8330aa9bbee5f5b1a23b4e275`, compared
   with the editor's contents; see `supabase/schema/README.md`).
2. Redeploy the refund function with the CLI (never the dashboard editor):
   `npx --yes supabase@latest functions deploy rzp-refund --project-ref conhlrulxfwkhsnymakz`.
   Run §50 first: the new function needs nothing new from the database
   (`require_role()` is §45, already live), but §50 is what makes the
   database refuse a support actor too.
3. Read back: the checks at 48.5 in the section file.

## 21. The security follow-ups (schema §51, 19 Oct 2026). NOT YET RUN LIVE.

The 18 Oct security audit left leads it could not execute. Each was re-derived
from source, written as a failing check against the real schema
(`scripts/schema-tests/security-51.sql`, seed `security-51-seed.sql`), and
fixed in `supabase/schema/schema-51-security-followups.sql`. The money ones:

- **A limited promo code is reserved when an order opens.** `quote_for()`
  counts other buyers' open orders on the code (opened in the last hour)
  toward `max_uses`; `create_pending_payment()` locks the code row while it
  prices; `activate_payment()` refuses (22023, hint `exhausted`) a payment on
  a code already at its cap, so `uses` never passes `max_uses`. Before, every
  order opened before the first activation could be paid at the discount. The
  refused payment stays `created`; if Razorpay captured it (an order paid more
  than an hour after it was opened, after the code filled), refund it from the
  console.
- **Upgrade credit follows the organisation and the plan.** `paid_credit_paise()`
  counts only payments on organisations the buyer still owns (handing a paid
  organisation away used to price a re-buy at the Rs 1 floor) and only payments
  that applied a plan — new column `payments.plan_applied`, backfilled — so a
  duplicate charge is a refund, not credit. `activate_payment()` refuses an
  order whose stored credit no longer exists (hint `credit_gone`), and
  `begin_refund()` refuses to refund a payment a later paid upgrade was
  credited with (hint `credited`: refund the upgrade first).
- **rzp-verify activates a CAPTURED payment, not a signature.** Checkout signs
  at authorization. `rzp-verify` now reads the payment back
  (`GET /v1/payments/{id}`): captured → activate, with the entity, so the amount
  check runs; authorized → capture it for exactly the recorded amount, then
  activate; anything else → `202 { pending }` and no plan (the
  `payment.captured` webhook activates it if the money arrives). The page says
  the payment is still being confirmed and not to pay again. It needs
  `RAZORPAY_KEY_ID` as a function secret (already set for `rzp-order`).

The rest of §51 (roles, sharing, comments, teams) is listed at the head of the
section file and in `docs/ADMIN-CONSOLE.md`. One is a plain break: **share
links could not be claimed at all** — `claim_share()` failed 42702 ("column
reference project_id is ambiguous") on every call — and §51 repairs it.

**Owner steps.**
1. Run §51 in the SQL editor — after §50 — verifying the checksum first:
   `shasum -a 256 supabase/schema/schema-51-security-followups.sql` must read
   `860ed0741bad08c196d40d00602c4fb5481290519017691a30529bb4ac63ac44`,
   and the editor's contents must hash the same (see `supabase/schema/README.md`).
2. Redeploy the verify function with the CLI (never the dashboard editor):
   `npx --yes supabase@latest functions deploy rzp-verify --project-ref conhlrulxfwkhsnymakz`.
   Order does not matter for safety: the new function needs nothing from §51.
3. Read back: the checks at 49.16 in the section file.
4. Razorpay dashboard → Account & Settings → Payment Capture: note whether it is
   Automatic (and its window) or Manual. Either now works; Manual means
   `rzp-verify` does the capture.
5. Supabase dashboard → Authentication → Providers: confirm Anonymous sign-ins
   are OFF, and that the Email provider is off (or, if on, "Confirm email" and
   secure e-mail change are on) — a pending e-mail grant, including an admin
   one, goes to the first account with that CONFIRMED address.
6. Do not run `node scripts/deploy-billing.mjs --sql` against this project: it
   now refuses (§45 has run), because replaying §16 onward would undo §46–§51.

## 22. Plans are a year, renewed by buying again (schema §52, 21 Oct 2026). RAN LIVE 21 Oct 2026.

The owner reversed §18 ("a plan, for good"). A paid plan now lasts **365 days**.
The prices are the same rows — Basic ₹599, Intermediate ₹799, Pro ₹999 — read
as a year, and the §30 rise on 31 Oct applies to the yearly price. The site
markets them by the day: `perDay()` in `src/lib/plans.js` (₹1.64 / ₹2.19 /
₹2.74) and the build stamps `{{fms:price.<id>.day}}` / `{{fms:price.from.day}}`.

- **Nothing renews by itself.** No mandate, no subscription. Buying the SAME
  plan again is a renewal: full price, no credit, and the new year starts where
  the running one ends (`apply_plan` stacks). The card says "Valid until …",
  turns to "Ends in N days" inside 30 days, and the rail shows PLAN ENDS IN in
  the last 14 (`trial-band.js`).
- **Upgrade** starts the higher plan's year today; the unused part of the
  current year is credit (`paid_credit_paise`: value × time left / length).
  **Downgrade** is refused while a year runs (hint `downgrade`) and allowed,
  with no credit, after it ends.
- **A refund takes off that payment's own year** (`ends_at − starts_at`), so
  refunding a renewal leaves the first year; §34's fresh trial follows only
  when no paid time is left.
- **Grants are unchanged.** The console grants for good (`p_days` 0); a timed
  grant honours its days.
- **The backfill (owner's decision):** every account holding a paid plan for
  good on the strength of a real payment gets one year from the instant §52
  runs (`billing_settings.yearly_switch_at`, once). Grants stay for good.
- **Order in between is safe.** The deployed `rzp-order` sends `'lifetime'`
  until it is redeployed; `create_pending_payment` records that as a year.

**Owner steps** (`docs/LIVE-STEPS-2026-10-21.md` is the step-by-step).
1. DONE 21 Oct 2026: run §52 in the SQL editor — after §51 — verifying the checksum first:
   `shasum -a 256 supabase/schema/schema-52-yearly-plans.sql` must read
   `6c1a80996bc1d6df5d321ad4dc1e7830c61812d36e27a52b0a7f74f42318945f`.
2. Redeploy all four functions with the CLI (receipt wording and periods):
   `npx --yes supabase@latest functions deploy rzp-order rzp-verify rzp-webhook rzp-refund --project-ref conhlrulxfwkhsnymakz`.
3. Read back with the checks at 52.9 in the section file.
4. Tell the existing buyers (draft in the live-steps file) — NOT NEEDED while the app is unpublished (owner, 21 Oct 2026): the accounts the backfill moved were the owner's own test accounts, and the two 8 Oct payments are Razorpay test mode. Two other `pro` accounts remain `for good`/`lifetime` (probably console grants; unchecked).
5. Only then release the client to `main`: a client that sells "a year"
   against a database that still grants "for good" would mis-sell.

Not built: an expiry reminder e-mail. It needs a scheduled job and Resend; the
in-app notices cover it until then.

## 23. The billing audit fixes (schema §53, 21 Oct 2026). NOT YET RUN LIVE.

Four findings from the 21 Oct 2026 audit, each proved by a check in
`scripts/schema-tests/audit-53.sql` that failed against §52 first.

- **Upgrade credit belongs to one organisation (bug 10).** Up to §52 the
  credit added up every organisation the buyer owned, so Pro for an empty
  organisation was priced as an upgrade from another one's Basic year, and
  that year kept running. Now `buyer_target_account()` picks where the plan
  lands (the one named; else the one holding the best plan; else the newest),
  the quote reads that organisation's plan and end date, the credit counts
  only its payments, and `create_pending_payment` stores it on the order. A
  renewal with no organisation named now stacks onto the year it renews.
- **A payment refused after capture is refundable (bug 8).** `rzp-verify`
  asks `payment_can_activate()` BEFORE it captures an authorised payment; a
  used-up promo code or a vanished credit is not captured at all, and
  Razorpay releases the hold. One captured anyway (dashboard auto-capture, or
  a race) is recorded `paid` with its Razorpay id, `plan_applied = false` and
  `payments.unapplied_reason`; the buyer can ask for a refund from Settings,
  the console can refund it, a dashboard refund is matched, and refunding it
  takes no time off a plan another payment bought.
- **No answer from Razorpay is not a failed refund (bug 9).** `rzp-refund`
  records `failed` only when Razorpay answered with a refusal. A call that
  threw, a 5xx or an empty 2xx is looked up by receipt; with no match the
  refunds row stays `initiated` and the console says to check the dashboard.
  Pressing REFUND again after a minute gets the SAME row back from
  `begin_refund`, so the retry carries the same `X-Refund-Idempotency` key and
  cannot refund twice. The `refund.processed` webhook finds that row by its
  receipt instead of making a second "dashboard" row.
- **A lapsed year says when it ended (bug 5, server half).** `billing_status()`
  returns `plan_until` when `lapsed` is true (it returned null, and the plan
  page printed 1 Jan 1970).

**Owner steps.**
1. Run §53 in the SQL editor — after §52 — verifying the checksum first:
   `shasum -a 256 supabase/schema/schema-53-audit-fixes.sql` must equal the
   sha256 in `supabase/schema/README.md` and the editor's contents (never
   paste schema SQL without a checksum).
2. Redeploy the two functions with the CLI (never the dashboard editor; both
   import `../_shared/razorpay.js`):
   `npx --yes supabase@latest functions deploy rzp-verify rzp-refund --project-ref conhlrulxfwkhsnymakz`.
   Run §53 FIRST. The functions deployed now keep working against §53 (they
   call nothing whose arguments changed), but the new `rzp-verify` calls
   `payment_can_activate`, and against a §52 database an authorised payment
   would be answered "still being confirmed" (and left uncaptured) until §53
   exists.
3. Read back with the checks at 53.5 in the section file.

