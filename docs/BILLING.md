# Billing — Razorpay, three paid tiers, and what a plan caps

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

The console edits all of this; these are the rows `supabase-schema.sql`
§16.1 inserts so that the pages have something to show. **The prices are
placeholders** — set the real ones on `admin.html` before the key goes
live.

| | Free | Starter | Indie | Pro |
| --- | --- | --- | --- | --- |
| Monthly | — | ₹299 | ₹799 | ₹1,999 |
| Yearly | — | ₹2,999 | ₹7,999 | ₹19,999 |
| Cloud projects | 1 | 3 | 10 | unlimited |
| Collaborators / film | 0 | 2 | 5 | unlimited |
| Live share links | 0 | 3 | 10 | unlimited |
| Organisation seats | 1 | 1 | 3 | 10 |
| Chrome extension | no | yes | yes | yes |

A blank limit in the console is unlimited. A price of 0 means "not sold
for that period" and the card hides that period. The free tier may not
carry a price (the RPC refuses it).

## 1. Order of operations

**One command does steps 1, 3, 4 and 5 below** from a machine that can
reach Supabase and holds a personal access token in
`SUPABASE_ACCESS_TOKEN` (and the three `RAZORPAY_*` secrets, if they
are to be set in the same run): `node scripts/deploy-billing.mjs`. It
slices §16–§17 out of `supabase-schema.sql`, runs them through the
Management API, asks the database that they landed, and deploys the
functions with the CLI via npx. `--print` writes the same SQL to stdout
for the dashboard editor instead. The cloud session this was built in
could do neither: its network policy denies every Supabase host and it
holds no token, which is why the script exists.

Nothing here has met the live database or a live Razorpay account.
The schema section passes `npm run test:schema` on a real PostgreSQL;
the whole purchase passes `npm run prove:billing` against a faked
Razorpay and a faked Supabase. The order:

1. **Run §16 of `supabase-schema.sql`** in the dashboard SQL editor.
   Then ask the database, not the file: `select id from plans order by
   sort` should return four rows through PostgREST as any signed-in
   user, and `billing_status()` should answer with `plan: 'free'`.
2. **Create a Razorpay account** (test mode first). From *Settings →
   API Keys* take the key id and the key secret.
3. **Set the secrets on the Supabase project** — never in this repo:
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_… RAZORPAY_KEY_SECRET=…
   ```
4. **Deploy the three edge functions:**
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
   `payment.captured`, `payment.failed`, `refund.processed`. Choose a
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
| `supabase-schema.sql` §16 | plans, payments, `accounts.plan_until`/`plan_period`, `apply_plan`, the service-role surface, `billing_status`, the triggers, the console RPCs, twelve checks |
| `supabase/functions/_shared/razorpay.js` | HMAC, signature checks, periods, prices, paise formatting. Plain JS so the browser imports the same formatter |
| `supabase/functions/rzp-order` `rzp-verify` `rzp-webhook` | the three edge functions (Deno) |
| `src/lib/billing.js` | the browser's half: plans, status, `buy()`, the admin RPCs. Writes nothing to localStorage |
| `src/ui/plan-cards.js` + `src/styles/plans.css` | the four cards, the period switch, the usage list |
| `src/ui/billing-admin.js` | the console: overview, tier editor, grant form, ledger |
| `src/pages/settings.js` #plan · `invite.html` #buy · `admin.html` #billing · `panel.js` | where they are drawn |
| `src/lib/cloud.js` `_pushProjectMeta` | the `P0402` handling |
| `vercel.json`, `netlify.toml` | CSP: `checkout.razorpay.com` (script, connect, frame), `api.razorpay.com` (connect, frame), `lumberjack.razorpay.com` (connect — Checkout's telemetry), `*.razorpay.com` images |

## 5. What is proved, and what is not

**Proved, in this repo:**

- `npm run test:billing` — 33 assertions on the shared helper: both
  HMACs against known vectors, timing-safe compare, periods, prices,
  `fmtPaise`, `parseRupees`.
- `npm run test:schema` — the WHOLE schema (sixteen sections) loads on
  a real PostgreSQL 16 under a shim for the `auth` schema and the API
  roles, and 48 checks exercise §16: the price from the table, both
  activation paths, idempotence, the account made for a first buyer,
  renewal from the old expiry, every trigger's refusal and its lifting
  after a grant, the refund lapsing the plan, `accounts_guard` still
  refusing a client while `apply_plan` passes, the ledger totals.
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
  overflow at 390px, no page errors.

**Not proved:** anything against the live database or a live Razorpay
account — the §16.10 checks, the real Orders API, a real Checkout, the
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
