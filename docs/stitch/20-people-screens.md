# Admin console: People group screens (spec extracted from code)

Sources: `src/pages/admin.js`, `src/ui/gate-ui.js`, `src/ui/access-admin.js`, `src/ui/admin-customer.js`, `src/pages/admin-tabs/support.js`, `src/ui/admin-kit.js`, `src/styles/admin.css`, `src/styles/gate.css`, `src/ui/dialog.js`.

## Shared frame and components (applies to all four screens)

- **Page**: h1 "Console" (eyebrow "Administration"), line "Signed in as <email>". Under it a status bar (`.ad-status`, role region "Environment"): pill "Razorpay TEST" (warn) / "Razorpay LIVE" (danger) / "Razorpay not set" (neutral); pill "Purchases required: ON" (warn) / "OFF" / "unknown"; right side "Refreshed <time>" (or "Refreshing…") + REFRESH button.
- **Navigation**: 11 tabs in 4 groups. At >=1100px a left vertical sub-nav 13.5rem wide (sticky, under the shell band) with group headings (mono, uppercase, tiny, muted) and content column to the right (gap `--s6`). Below 1100px: one horizontally scrolling tab strip. People group = **People** (`#people`), **Support** (`#support`), **Access & sharing** (`#requests`). Tabs may carry a numeric badge (max 99): `requests` = pending invite requests; `support` = number of open rows.
- **Roles** (from `studio_role()`): owner, finance, support. Hidden-not-enforced; the server re-checks every RPC (42501) and its refusal sentence is shown as sent. If `studio_role` RPC is missing (schema §45 not run) the role resolves to `owner`. Capability map: notes = owner/support/finance; trial = owner/support; plan = owner/finance; session = owner/support; reset = owner/support; invoice = owner/finance; money = owner/finance; ticket = owner/support; passes = owner/support. Unknown role shows no write controls.
- **Components**: pill (tones ok, warn, danger, neutral, accent; optional leading dot), KPI tile (big number, label, optional sub), meter (label, bar, "X of Y · N%"), timeline (dot, bold title, relative time, sub, optional link), `dataTable` (caption left, toolbar chips right incl. density chip "Comfortable"/"Compact"; sticky-less scroll wrapper), empty state (icon glyph, title, body, optional "Checked <time>" stamp), error state (role alert, title, why, RETRY button), skeleton (rows/kpi/block shimmer lines), `gt-table` (plain table, 13px-ish small text, hairline row rules, header muted semibold), chip (`.ad-chip` toggle with `aria-pressed`, active = brand wash fill + brand border).
- **Dialogs** (`dialog.js`): centered card, h3 title, paragraphs, optional "Type <word> to confirm." hint + text field (confirm disabled until exact match, trimmed), footer buttons [Cancel] [Confirm]; the confirm is red when `danger`. `askText` adds one text input; Cancel returns null, empty confirm returns "".
- **Toasts**: success toasts after writes carry action "View in audit log" (closes the drawer, goes to `#audit`) in the drawer and Support flows. Errors are red toasts with the server sentence.
- **Time**: relative ("3h ago", "just now", "in 2d"), absolute in tooltip. Currency: paise formatted as rupees.

---

## People tab (hash `#people`)

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

## Customer 360 drawer (hash `#people?user=<user id>`; opens from any row naming a person, also from Support PERSON buttons and Access-queue rows)

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

## Support tab (hash `#support`)

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

## Access & sharing tab (hash `#requests`; the section id inside is `#admin-console`)

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
