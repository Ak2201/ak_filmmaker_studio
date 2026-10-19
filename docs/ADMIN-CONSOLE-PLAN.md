# Admin console v2 — full plan (12 Oct 2026)

Status: PLAN, nothing built. Owner asked for every idea in the analysis plus a
nicer UI. Re-checked 12 Oct 2026 after pulling `develop` to `37e7ecc` (15 newer commits,
none touch the admin modules or the schema); see §10. The last schema section is
**§39**, so this plan uses **§40–§45**. Fetch before you number (see
[[concurrent-sessions-share-the-checkout]]) — if another session has taken §40,
renumber, don't collide.

## 0. Where we are

`admin.html` / `src/pages/admin.js` is five tabs — Overview, People, Requests,
Purchases, Growth — re-housing blocks from `gate-ui.js` (616 lines),
`access-admin.js` (208), `growth-admin.js` (610). ~45 `admin_*` RPCs, each
re-checking `is_studio_admin()`. It is a money-and-access console. It cannot
answer: *is it healthy? who changed that? what does this person's account look
like? which modules are used?*

Not in scope: changing how the gate, billing or sync work. The console reads
and, where noted, writes through RPCs; it never touches a table directly (RLS
stays on, no client grants — the `leads`/`events` pattern).

## 1. Principles (these decide arguments)

1. **Server is the boundary.** The page appearing is a convenience; every new
   RPC starts with `is_studio_admin()` / the role check and raises 42501.
2. **Counts, never content.** No script text, notes, character names, AI
   prompts or file contents ever reach an admin RPC or an event row. Usage
   analytics are daily counters keyed by a fixed name list (CHECK constraint).
3. **Every admin write is audited, in the same transaction.** An action and
   its audit row commit together or not at all.
4. **Ask the server, not the file.** Health and launch checks probe live state
   (functions answer, sections exist, columns populated) — the lesson of the
   rzp-refund 404 and the empty `plans.features`.
5. **Re-house, don't rewrite.** Existing blocks keep their ids and handlers;
   new tabs are new modules. Old deep links (`#billing`, `#promos` …) keep
   working.
6. **Fail visible.** A panel that cannot load says why and offers retry; it
   never renders an empty table that reads as "all clear" (the hue-assertion
   trap, applied to dashboards).

## 2. Information architecture

Tabs grouped under four headings (left rail ≥1100px, a scrollable strip below,
and the mobile Go-to sheet is untouched — admin is desktop-first but must not
overflow at 390px):

| Group | Tab | Hash | Status |
| --- | --- | --- | --- |
| **Run** | Overview (command centre) | `#overview` | rebuilt |
| | Launch & health | `#health` | **new** |
| | Audit log | `#audit` | **new** |
| **People** | People (list + Customer 360 drawer) | `#people` | extended |
| | Support inbox | `#support` | **new** |
| | Access & sharing (codes, passes, shares) | `#requests` | extended |
| **Money** | Purchases (unchanged blocks) | `#purchases` | re-housed |
| | Growth & cohorts | `#growth` | extended |
| **Product** | Usage | `#usage` | **new** |
| | Sync & storage | `#sync` | **new** |
| | Controls (flags, banner, roles) | `#controls` | **new** |

`src/ui/tabs.js` already derives labels from `data-tab-label`; add a
`data-tab-group` attribute and let the rail group by it. No new nav system.

## 3. Features, with the data each needs

### 3.1 Audit log (Tier 1) — §40
- Table `admin_audit(id, at, actor uuid, actor_email, action text, target_kind,
  target_id, before jsonb, after jsonb, note)`. RLS on, no grants.
- Helper `admin_audit_write(action, target_kind, target_id, before, after)`
  called from **every existing** `admin_*` writer (grant_plan, grant_email,
  grant_trial, set_plan, set_billing_settings, set_promo_code,
  set_next_price, decide_request, decide_refund_request, issue_invoice,
  resend_receipt, reset_user, terminate_session, create/revoke_invite,
  mark_referral_paid …). Restate each function in full — do not wrap.
- `admin_list_audit(p_actor, p_action, p_target, p_from, p_to, p_limit, p_before)`
  keyset-paged. Append-only: a trigger refuses UPDATE/DELETE.
- UI: reverse-chronological timeline, filter chips, JSON diff of before/after,
  "show everything about this target" link from any row. Export CSV.
- Also surfaces in Customer 360 (filtered to that person).

### 3.2 Launch control panel + system health (Tier 1) — §41
- `admin_health()` returns, from live state: schema sections present (probe
  for a marker object per section §1–§n), `plans.features` non-empty per paid
  tier, `purchases_required()`, `trial_offer()`, `price_notice()` sanity,
  receipts claimed-but-unsent count and age of oldest, payments `created` older
  than 1h (abandoned), last webhook seen, refund backlog, pending invite
  requests, `admin_purchase_wall()` census.
- Edge-function reachability can't be probed from SQL: the **client** pings
  `/functions/v1/{rzp-order,rzp-verify,rzp-webhook,rzp-refund}` with a
  deliberately unauthenticated request and reads the status (401/503 = alive,
  404 = missing). Webhook 401 "bad signature" = healthy. Show Razorpay mode by
  the key-id prefix (`rzp_test_` / `rzp_live_`) — public value, safe to show.
  Resend configured: derive from the receipt queue (failed sends) since the
  secret is not readable; say "inferred".
- **Launch checklist** card: ordered steps from BILLING §19 "Throwing the
  switch", each with live pass/fail, ending in the switch itself. Throwing it
  shows the wall preview (who would be walled, from `admin_purchase_wall()`),
  requires typing the word `REQUIRE`, writes an audit row, and offers one-click
  rollback for 24 hours. The existing refusal in `admin_set_billing_settings`
  (grandfathered-walled) is surfaced as a plain sentence, not an error toast.
- Failed-receipt queue with per-row "resend" (reuses `admin_resend_receipt`).

### 3.3 Customer 360 (Tier 1) — §42
- `admin_customer(p_user)` one JSON: identity, standing (member/trial/plan/
  grandfathered), trial clock, payments, invoices, refunds + requests,
  referral credits, devices/sessions, project count and per-scope byte sizes
  (sizes only), last sync, orgs, internal notes, audit slice.
- `admin_notes(user_id, at, author, body ≤1000)` + add/list RPCs (audited).
- Actions from the drawer reuse existing RPCs: grant plan/trial/email,
  terminate session, reset user (behind `dialog.js` ask), issue invoice.
- UI: a right-hand **drawer** opened from any people/payment/refund/audit row
  (`?user=` in the hash so it is linkable); sections collapse; the sticky
  header shows name, e-mail, standing pill and the three most likely actions.

### 3.4 Usage analytics (Tier 2) — §43
- Widen `events`: today its CHECK allows six funnel names. Add a second table
  `usage_daily(day, name, plan, count)` rather than loosening the funnel CHECK
  (different retention, different sensitivity). `name` is a CHECK list:
  `module_open:<id>` for the module ids in `navigation.json` (generated into
  the CHECK by a script, like `make-plan-features-sql.mjs`), `script_import`,
  `export_pdf`, `export_docx`, `ai_call`, `drive_connect`, `limit_hit`,
  `share_created`, `screening_pass_used`.
- Client: `bumpUsage(name)` in the pure `startlib` family? **No** — it is
  imported by app pages, not the landing page; put it in `src/lib/usage.js`,
  batched, one RPC per session end/visibility change, **opt-out** honoured by
  a Settings → Privacy toggle (`fms_usage_optout_v1` — new key, add to
  `ALL_KEYS`, NOT to a backup). Writes nothing under verify's four idle
  seconds (flush on `pagehide`, never on a timer).
- `admin_usage(p_days)` → per-module opens, DAU/WAU, feature adoption by plan,
  limit-hit leaderboard. UI: heat-grid (module × week), sparkline per row,
  "dead modules" list (zero opens in 14 days).
- Update `privacy.html` in the **same commit** — words stay in markup there.

### 3.5 Cohorts & trial funnel (Tier 2) — §43 (same section, read-only RPCs)
- `admin_cohorts(p_weeks)` joins `studio_members`, `payments`, `refunds`,
  `invite_redemptions`, affiliate/referral attribution:
  signup → trial start → active during trial → checkout → paid → refunded,
  by signup week and by source. UI: stepped funnel bars with drop-off %, a
  cohort retention triangle, source comparison.

### 3.6 Sync & storage health (Tier 2) — §44
- `admin_sync_overview()`: accounts by last sync age buckets, `project_data`
  bytes total and top N accounts, rows per scope, scopes present vs the
  CHECK list (would have flagged §37 as code-ahead-of-database: the client's
  scope list is shipped as a small JSON the console diffs against
  `pg_constraint`).
- Client-reported failures: add a tiny `sync_errors(day, scope, code, count)`
  counter fed by `cloud.js` when a write is refused (23514, 42501, P0402) —
  counts by code only.
- `admin_limit_pressure()`: accounts ≥80% of films/seats/storage caps from
  `user_limits()`. UI: table with fill bars and "send upgrade nudge"
  (queues an e-mail through `_shared/mail.js` — claimed first, per the mail
  rule; **not** built until the owner OKs outbound nudges).

### 3.7 Support inbox (Tier 3) — §45
- `support_tickets(id, user_id nullable, email, subject, body ≤4000, status
  open|waiting|closed, assignee, created_at)` + `support_replies`.
  Public `submit_support(email, subject, body)` rate-limited like `add_lead`
  (anon-callable, per-minute and per-day caps). Linked from Settings and the
  footer; replies go out via an edge function (`support-reply`, claim-first).
- Unified queue view: tickets + refund requests + invite requests, one
  status vocabulary, assignee, canned replies (stored in a table, editable).
- Needs Resend (`RESEND_API_KEY`, `MAIL_FROM`) — blocked on the same owner
  step as §35.

### 3.8 Access & sharing (Tier 3) — §45
- Screening passes (`invite_codes.pass_type = 'screening_pass'`), shares,
  collaborators: list with project, creator, uses, expiry; **revoke** and
  **extend**. `admin_list_passes`, `admin_revoke_pass`, `admin_list_shares`,
  `admin_revoke_share`. All audited.

### 3.9 Controls (Tier 3) — §45
- **Announcement banner:** `site_announcement(id, text ≤200, level info|warn,
  starts_at, ends_at, active)`; anon-callable `site_announcement_now()` read by
  `chrome.js` at most once per session and cached; rendered in the brand
  plate region as a dismissible bar. It is **text in a row, not in the
  baseline** — the brand plate must still not rotate by itself; a banner is a
  single message, shown on every page, absent from `baseline.json`, so verify
  must run with the banner table empty (document in the verify notes).
- **Feature flags / kill switches:** `feature_overrides(key, scope
  global|plan|account, scope_id, enabled)` layered **over** `plans.features`
  inside `billing_status().features`. Resolution order: account > plan >
  global > plan matrix. Kill switches default to *on*; failing open is
  correct here for the same reason `entitlement()` fails open. Flags only
  *remove* or *add* a named feature that exists in `plan-matrix.json`;
  unknown keys are refused. `npm run test:plans` gains an override case.
- **Admin roles:** `admin_roles(user_id, role owner|finance|support)`.
  `is_studio_admin()` stays true for all three (so nothing breaks); new
  `studio_role()` and per-RPC checks narrow it: finance = refunds, invoices,
  payments, promo; support = notes, grants of trial, sessions, tickets;
  owner = switch, prices, flags, roles. Existing admins are backfilled
  `owner`. The last owner cannot be removed (trigger).

### 3.10 Data-subject tools — §45
- `admin_export_user(p_user)` returns the account-side data (profile,
  payments, invoices, notes, sessions, project row metadata and the synced
  `project_data` JSON). Local-only work is not on the server and the response
  says so. `admin_delete_user` = the existing `admin_reset_user` plus
  auth deletion; ask-twice dialog, audited, writes a tombstone (hashed e-mail,
  date) so a deleted lead is not re-mailed.

### 3.11 Scheduled digest — after §45
- Edge function `admin-digest` on a Supabase cron: weekly e-mail of signups,
  trial conversion, revenue, refunds, failed receipts, limit pressure, top
  and dead modules. Claim-first, never fails anything else. Recipient list =
  owners. Blocked on Resend.

## 4. UI / design plan

Goal: a console that looks like part of the product (violet, pill buttons,
16px radius, ink default) but reads like an instrument panel: dense where it
should be, calm everywhere else.

### 4.1 Rules it must obey
- Every colour from `tokens.css`; every shape a `--sk-*` variable
  (`var(--sk-radius, var(--radius))`). Add new variables to
  `skins/_contract.css`, don't hard-code. No `body.dark`.
- Text on a fill takes `--brand-on`; status colours are ok/warn/danger, never
  one of the six phase hues. A fill is not a text colour: pills use
  `--ok-deep`-style text on a wash, not the fill.
- No inline handlers; `delegate()` + `data-action`. No native
  confirm/alert/prompt: `dialog.js`. `Element.append(null)` prints "null":
  filter. Lazy chunks for charts (none needed — SVG by hand).
- `motion-app.js` is off under webdriver, so verify can't see motion; every
  transform is `calc(<d> * var(--motion))` and the drawer must work with
  reduced motion.
- AA 4.5:1 in both themes (the walk is not run on admin signed-out, so
  check by hand in a signed-in build). 390px: no horizontal page scroll —
  wide tables sit in `.gt-scroll`.

### 4.2 Layout
- **Shell:** left rail (grouped tabs with icons from `ICON-MAP.json`, badge
  counts for pending items: requests, refunds, failed receipts, tickets) +
  content column max 1280px. Below 1100px the rail becomes the existing
  strip. A thin **status bar** under the band: environment pill (TEST/LIVE
  from the Razorpay key prefix), purchases-required pill, "last refreshed
  hh:mm · Refresh" — so the two facts that change what every action means are
  never off screen.
- **Command centre (Overview):** a row of KPI tiles (people, trials running,
  paid, MRR-equivalent, refunds 30d, failed receipts, open tickets, limit
  pressure), each with a 14-day sparkline and a delta chip; below, a
  two-column **Needs attention** list (ranked: failed receipts, refund
  requests older than 48h, invite queue, abandoned payments, health
  failures — each one a link that opens the right tab/drawer) and an **Activity**
  feed (last 15 audit rows). Empty attention list says "Nothing needs you"
  *with a timestamp*, so a stale panel is distinguishable from a quiet one.
- **Tables:** sticky header, row hover, density toggle (comfortable/compact —
  UI preference, localStorage with try/catch), column text truncation with
  title, keyboard row focus, `Enter` opens the drawer. Sort and filter chips
  in the URL hash. Empty and error states are designed, not blank.
- **Customer drawer:** 520px right sheet, focus-trapped via `modal-focus.js`,
  `Esc` closes, deep-linkable, scroll position kept when you act and the
  panel refreshes (reuse `carryFields()` thinking).
- **Command palette integration:** `palette.js` already derives its index;
  add an admin group (jump to tab, search a person by e-mail) that loads only
  for admins via the dynamic `loadContent()`.
- **Charts:** hand-rolled inline SVG, `currentColor`/token strokes, a shared
  `src/ui/admin-charts.js` (sparkline, bar, stepped funnel, heat-grid,
  retention triangle). Each has a text/table fallback (`<table>` visually
  hidden) for screen readers, and tooltips on focus as well as hover. No
  library — keeps first paint inside `scripts/budget.json`.
- **Components** (all in `src/ui/admin-kit.js`, styled in `admin.css`): `kpi`,
  `pill`, `delta`, `meter` (limit pressure), `checklist` (launch steps),
  `timeline` (audit), `diff` (before/after), `drawer`, `emptyState`,
  `errorState`, `dataTable`. The existing `.ad-stat` and `.gt-table` become
  thin wrappers so old blocks inherit the new look with no edit.
- **Safety affordances in the UI:** destructive/irreversible actions use a
  danger-wash button + a typed confirmation for the three that move money or
  access broadly (throw the switch, delete user, bulk revoke); everything
  else uses an `ask()` dialog with the *consequence* stated ("This walls 14
  people"). After any write, a toast with "View in audit log".

### 4.3 Look-and-feel checklist (what "nicer" means concretely)
Consistent 8px rhythm via `--s*`; display font for numbers and tab titles,
body font for tables; one accent per surface; subtle card elevation using the
existing `--sk-card-shadow`; hover lift via `--sk-lift`; skeleton loaders
instead of "Loading…" text; relative times ("3h ago") with absolute in the
title; currency always through `fmtPaise`/`money.js`; no more than one primary
button per card.

## 5. Delivery phases

Each phase ends with `npm run test:all`, `npm run build:open && npm run
verify`, and the relevant `prove:*`, then a push to `develop` (batch pushes —
two Vercel projects watch the repo). Schema sections are run by the owner in
the SQL editor with the **base64 + SHA-256 checksum** method (never paste SQL
through the clipboard); each section is verified over PostgREST afterwards
and gets a `scripts/schema-tests/*.sql` file.

| Phase | Contents | Schema | Depends on |
| --- | --- | --- | --- |
| **A. Foundation** | `admin-kit.js`, `admin-charts.js`, `admin.css` rebuild, rail + status bar, tab groups, drawer shell, old blocks inherit new look. No new data. | — | — |
| **B. Safety net** | Audit log + wire every writer; Launch & health; Customer 360 + notes; command-centre Overview | §40, §41, §42 | A |
| **C. Insight** | Usage counters + privacy toggle + privacy.html; cohorts; sync/limits | §43, §44 | B (audit) |
| **D. Operate** | Support inbox, passes/shares, banner, flags, roles, export/delete | §45 | B; support needs Resend |
| **E. Digest** | `admin-digest` edge function, cron | — | D, Resend |

Sizing (rough): A ≈ 2 days, B ≈ 4, C ≈ 3, D ≈ 4, E ≈ 1.

Parallel lanes once A lands: B's three RPC sets are independent of each
other; C's UI can be built against a fixture while §43 is authored. Use
subagents per lane, keep schema numbering and the audit wiring on the main
thread (credentials and decisions stay there).

## 6. Test plan
- `test:schema` (real PostgreSQL): per section — admin-only (42501 for a
  member and for anon), audit row written in the same transaction as the
  action (force a failure and assert both roll back), audit append-only,
  `admin_health` on a seeded DB, override resolution order, last-owner
  trigger, usage CHECK list equals `navigation.json` ids, export contains no
  other user's rows.
- `prove:gate` additions: console renders for admin, absent for member; every
  new tab reachable by hash; drawer deep link; banner empty → no DOM.
- New `prove:admin`: signed-in admin against a faked backend — attention list
  ordering, launch checklist states, throw-switch typed confirmation and
  rollback, drawer focus trap and `Esc`.
- `test:undef` (the motion-layer trap applies to anything gated on
  `navigator.webdriver`), `test:brand`, `test:dialogs`, `test:plans`,
  `npm run density`. Check the AA walk and 390px by hand signed in.
- Verify budget: console JS is its own page chunk; first paint of other pages
  must not grow (`scripts/budget.json`). `usage.js` is the only addition to
  CORE and must stay small.

## 7. Risks and mitigations
| Risk | Mitigation |
| --- | --- |
| Restating ~15 admin writers to add audit introduces a regression | Do it in one section with `billing.sql` / `refunds.sql` tests re-run unchanged; diff each function against its previous body |
| Usage tracking erodes the "local-first" promise | Counts only, fixed name list, opt-out, privacy page updated, owner sign-off before §43 runs |
| Feature-flag overrides lock paying users out | Overrides can only narrow *named* features and default to on; `entitlement()` stays fail-open |
| Outbound e-mail features ship before Resend is configured | Support replies, nudges and the digest are gated on a health check; the UI says "mail not configured" instead of queueing |
| Health probes lie | Every probe states what it observed and never guesses a cause; "inferred" is labelled |
| Banner/flags make baseline flaky | Banner absent when table empty; verify documents it |
| Role split breaks the one existing admin | Backfill owner in the same section; `is_studio_admin()` unchanged |

## 8. Decisions needed from the owner
1. Usage analytics: approve counts-only with opt-out? (blocks §43)
2. Admin roles now, or later? (default here: now, but everyone starts `owner`)
3. Outbound mail from the console (support replies, upgrade nudges, digest):
   yes, once Resend is set? (blocks §45 support, phase E)
4. Support inbox: build a public contact form, or keep support on
   `support@filmmakerstudio.in` and only log tickets by hand?
5. Is a 24-hour rollback window on the purchases switch right?

## 9. First steps when building starts
1. `git fetch`; confirm the next free section number.
2. Read `docs/HANDOFF.md` §6c and add an ID-numbered block for this work
   (registry lane **A** = admin).
3. Phase A on a branch off `develop`; screenshots of the console in both
   themes at 1280 and 390 before anything else.

## 10. Re-check after pulling develop (12 Oct 2026, `37e7ecc`)

Pulled 15 commits past `b25b526`. Verified:
- **Schema:** `supabase/schema/supabase-schema.sql` unchanged; still ends at §39, so §40–§45 stand.
- **Admin code:** `admin.js`, `access-admin.js`, `growth-admin.js`, `admin.css`
  unchanged. `gate-ui.js` changed copy only (the code-box error text).
- **Edge functions:** still four; no admin or digest function exists yet.

Three changes DO affect the plan:
1. **The shell now has a studio rail** (`#studioRail`, with a live trial block
   at its foot, `trial-band.js`). §2/§4.2 said "left rail for admin tabs" — that
   must NOT be a second rail beside it. Revised: the admin tab groups render as
   a **sub-navigation inside the content column** (vertical list ≥1100px,
   the existing strip below), and the shell's rail is left alone. Admin is a
   global page, so check it shows no trial block and no project chrome
   (`navmodel` `global[]` / `EXTRA_GLOBAL_PAGES`).
2. **`tabs.js` gained `?stay=1` filtering** (`stayEntry` from `navmodel.js`).
   Group headings (`data-tab-group`) must be added without disturbing it; test
   admin with and without a query string.
3. **The palette and Go-to now mark plan-locked modules** (`markLocked` in
   `plan-gate.js`). The admin palette group is for admins only and must not be
   run through `markLocked` (admin tabs are not plan modules). Project switching
   now goes through `switchProject()` — use it from the Customer drawer if it
   ever opens a person's film (it does not; admin sees metadata only).

Working tree note: `src/pages/settings.js` and `src/ui/actionbar.js` show
uncommitted edits that are not from this plan (another session). Phase A must
branch from a clean `develop` and not sweep those in.

## 11. Owner decisions (12 Oct 2026) — these override earlier sections

1. **Usage analytics: YES.** Counts only, fixed name list, opt-out in Settings,
   `privacy.html` updated in the same commit. §43 is unblocked.
2. **Admin roles: YES, now.** owner / finance / support; every current admin is
   backfilled `owner`.
3. **Outbound mail: NONE for now.** Dropped from scope: support replies, upgrade
   nudges, the weekly digest (phase E is cancelled), and `admin-digest`. The
   "send upgrade nudge" button in Sync & limits is not built; limit pressure is
   a read-only report. The failed-receipt "resend" stays (it is existing
   behaviour, `admin_resend_receipt`).
4. **Support: keep `support@filmmakers…` e-mail.** No public contact form, no
   anon `submit_support`, no `support-reply` function. The Support tab becomes a
   **manual queue**: refund requests + invite requests + tickets an admin logs by
   hand (`support_tickets` with admin-only insert; status, assignee, notes).
   No rate-limited anon RPC is needed.
5. **Rollback window: 24 hours** (default; not asked — say if you want another).

Effect on phases: A, B, C unchanged. D shrinks (no mail, no contact form).
E is removed. Total ≈ 12 days. §45 no longer contains anon-callable functions.

## 12. Build status (12 Oct 2026, branch `admin-console-v2`)

BUILT and merged on `admin-console-v2`, NOT pushed, NOT run live:
phase A (kit, charts, groups, status bar), §40 audit, §41 health, §42 customer
360, §43 usage + cohorts, §44 sync + limits, §45 controls, §46 role matrix; tabs:
Overview, Launch & health, Audit, People (+ drawer), Support, Access & sharing,
Usage, Sync & storage, Controls, cohorts in Growth; client usage tracker with
opt-out, privacy.html, sync-error reports, site banner, effective_features.

Gates on the integrated branch: test:all exit 0 (schema 1130/0), verify exit 0,
prove:gate 204/0, prove-admin-health 66/0, prove-admin-people 95/0.
prove:growth 88/2 — the same two screening-branding failures occur on clean
`develop` (not caused by this work).

Deliberate: admin first-paint budget row raised 596562 -> 756932 measured
(only that row). Not built: `screening_pass_used` (needs a server-side count in
screening_open), `export_docx` (no Word export exists), true retention triangle
(no per-period data), upgrade nudges and digest (owner: no mail).
Owner steps remaining: run §40–§46 in order with the checksum method and read
each back; review the §46 role calls; decide invoice retention on user delete.
