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

**Full-time access (§18, 6 Oct 2026).** A plan is bought ONCE and kept for
good — no monthly or yearly period, nothing to renew, nothing to lapse.
`plans.price_paise` is the one price; the monthly/yearly columns are left
in place and read by nothing. The console edits all of this; these are the
rows §16.1 inserts and §18 adjusts so that the pages have something to show.
**The prices are placeholders** (§18 copies the old yearly figure into the
one-time price) — set the real ones on `admin.html` before the key goes live.

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

| | Free | Starter | Indie | Pro |
| --- | --- | --- | --- | --- |
| Price, once | — | ₹2,999 | ₹7,999 | ₹19,999 |
| Sample only / new projects | yes / no | no / yes | no / yes | no / yes |
| Cloud projects | 1 | 3 | 10 | unlimited |
| Collaborators / film | 0 | 2 | 5 | unlimited |
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
| `supabase-schema.sql` §16 | plans, payments, `accounts.plan_until`/`plan_period`, `apply_plan`, the service-role surface, `billing_status`, the triggers, the console RPCs, twelve checks |
| `supabase/functions/_shared/razorpay.js` | HMAC, signature checks, periods, prices, paise formatting. Plain JS so the browser imports the same formatter |
| `supabase/functions/rzp-order` `rzp-verify` `rzp-webhook` | the three edge functions (Deno) |
| `src/lib/billing.js` | the browser's half: plans, status, `buy()`, the admin RPCs. Writes nothing to localStorage |
| `supabase-schema.sql` §19 | the accounts INSERT guard (A1b in `docs/SECURITY-RLS.md`) |
| `supabase-schema.sql` §20 | `promo_codes`, `quote_order`, `promo_price`, the code on `payments`, the console RPCs |
| `src/ui/plan-cards.js` + `src/styles/plans.css` | the four cards, the "Have a code?" box, the usage list |
| `src/ui/billing-admin.js` | the console: overview, tier editor, promo codes, grant form, ledger |
| `src/pages/settings.js` #plan · `invite.html` #buy · `admin.html` #billing · `panel.js` | where they are drawn |
| `src/lib/cloud.js` `_pushProjectMeta` | the `P0402` handling |
| `vercel.json`, `netlify.toml` | CSP: `checkout.razorpay.com` (script, connect, frame), `api.razorpay.com` (connect, frame), `lumberjack.razorpay.com` (connect — Checkout's telemetry), `*.razorpay.com` images |

## 5. What is proved, and what is not

**Proved, in this repo:**

- `npm run test:billing` — 50 assertions on the shared helper: both
  HMACs against known vectors, timing-safe compare, periods, prices,
  `fmtPaise`, `parseRupees`, and the promo helpers (`normalisePromo`,
  `isPromoShaped`, `promoPrice` mirroring `public.promo_price`,
  `promoLabel`).
- `npm run test:schema` — the WHOLE schema (twenty sections) loads on
  a real PostgreSQL 16 under a shim for the `auth` schema and the API
  roles, and 133 checks run in three files: `billing.sql` (50, §16 +
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
