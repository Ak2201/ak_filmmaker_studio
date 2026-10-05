# The gate — switching it on, and what it does once it is

`supabase-schema.sql` sections 13 and 14 are the invite gate: codes, the
invite-request queue, the one-device lock, screening passes, the admin
console. **Both ran against the live project on 5 October 2026** (dashboard
SQL editor, "Success" each; verified through PostgREST — every function
answers 401 to anon where it answered `PGRST202` that morning), and the 13.2
bootstrap made `arunkumarmohanans@gmail.com` the admin. `auth.users` held
exactly one account at the time, so nobody was locked out by the switch-on.
`arunaaron85@gmail.com` had never signed in; it gets its row the first time
it does (re-run step 3 below, or approve its request from the console).

The client **fails closed** whenever the functions are missing or the account
is not a member: sync pauses, nothing is uploaded, and the page says why. It
used to fail open so the code could ship before the SQL, and the result was a
studio any Google account could sync to. That is the bug this document
exists to close. Section 1 is kept as the runbook for a fresh project.

## 1. Order of operations

Do these in this order. Each is idempotent.

1. **Section 13**, in the Supabase SQL editor, as the project owner. Tables,
   the RPCs, the lock, the screening room, the 13.6b triggers that make the
   gate binding at the database.
   - The **grandfathering insert in 13.6b is commented out.** It would admit
     everyone who already owns a cloud project, and because the gate failed
     open that set includes anyone who ever signed in. Leave it off unless
     you have read `select owner_id from public.projects` and want every one
     of them in; the people you do know can ask through the new flow.
2. **Section 14.** The request queue, the widened `studio_status()`, the
   console's two RPCs, the trigger that closes a request when a code is
   redeemed instead.
3. **The first admin**, by hand — 13.2 has the line:
   ```sql
   insert into public.studio_members (user_id, role)
   select id, 'admin' from auth.users where email in ('arunkumarmohanans@gmail.com','arunaaron85@gmail.com')
   on conflict (user_id) do update set role = 'admin';
   ```
   No UI does this on purpose: anything that can grant the first admin can
   grant the second. `VITE_ADMIN_EMAILS` only decides who is *shown* the
   console; `is_studio_admin()` decides who can use it.
4. **Deploy the build.** A build deployed before step 1 closes the gate on
   everybody, administrators included, with the message "not switched on in
   this studio's database yet" — correct, and useless, so do the SQL first.

## 2. Check it took

From the repo, no credentials beyond `.env`:

```bash
node -e "
const fs=require('fs');const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim()]}));
fetch(env.VITE_SUPABASE_URL+'/rest/v1/rpc/studio_status',{method:'POST',headers:{apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:'{}'}).then(r=>r.text().then(t=>console.log(r.status,t.slice(0,120))))"
```

- `404 … PGRST202` — not deployed.
- `401 … 42501 permission denied` — deployed (anon has no grant; that is the
  function existing and refusing, which is the right answer).

Then the live checks in 13.8 and 14.5, which need two real accounts. None
has been run.

## 3. The flow, once it is on

```
visitor ── Google sign-in ──► studio_status()
                                 │
            registered & not disabled ──► open: sync, extension, (admin: console)
                                 │
                   not registered ──► invite.html   (the FIRST load after the
                                 │                   sign-in only; local work
                                 │                   is never behind the gate)
                        ┌────────┴────────┐
                   has a code        REQUEST AN INVITE
                   verify → redeem   request_invite(): email + name from
                        │            auth.users, a note, the browser
                        │                   │
                        │            admin console (settings.html)
                        │              APPROVE → studio_members row
                        │              DECLINE → note, 7-day cooling-off
                        └────────┬────────┘
                              next load: open
```

- **Sign in first, then ask.** The request is made *by* an account, so the
  address the administrator reads is the one Google attested. Nothing on the
  form can be edited; the note is the only free text.
- **Only the first load lands on invite.html.** `cloud.js` writes a
  sessionStorage marker (`fms_gate_landing`) when a sign-in begins and the
  first `runGate()` consumes it. After that the pill says `INVITE NEEDED` /
  `INVITE PENDING` on every page with a menu row back to the doorway, and
  every page keeps working locally.
- **Approval is membership.** `admin_decide_request(uid, true)` inserts the
  `studio_members` row; no code is minted. It also re-enables a member who
  was disabled, which is the one way back after `admin_terminate_session(…,
  true)`.
- **A code closes a request too** (14.4 trigger), so somebody who asked and
  then got a code from a friend does not sit in the queue.
- **Decline is sticky for a week.** `request_invite()` refuses with the date
  they may ask again; the page shows the administrator's note.
- **One answer, three readers.** `studio_status()` carries the request's
  standing and, for an admin, the pending count. The pill, the account menu
  and `invite.html` all read `getGateState().status` and print
  `gateDetail(reason)`; none composes its own sentence.

## 4. Where things are

| Thing | Where |
|---|---|
| SQL | `supabase-schema.sql` §13, §14 |
| Client calls | `src/lib/gate.js` (`status`, `requestInvite`, `admin.listRequests`, `admin.decideRequest`) |
| The decision | `src/lib/cloud.js` `runGate()`, `getGateState()`, `gateDetail()` |
| The doorway | `invite.html`, `src/pages/invite.js`, `src/styles/invite.css` |
| The request block (shared with the extension panel) | `src/ui/invite-request.js` |
| Code box + admin console | `src/ui/gate-ui.js` |
| Pill and account menu | `src/ui/auth.js` |
| Extension panel | `src/pages/panel.js` |
| Proof against a fake Supabase | `scripts/prove-gate.mjs`, `scripts/fake-supabase.mjs` |

## 5. What is proved, and what is not

`npm run build && npm run prove:gate` exercises the shipped build against an
in-memory implementation of §13 and §14: fail-closed when the functions are
missing, the landing and its one-shot-ness, request → approve → open,
request → decline → the note and the cooling-off, plus everything the proof
already covered (codes, the lock, the console, the screening room).

Not proved: either section against the live database; the live checks in
13.8 and 14.5; `auth.users.raw_user_meta_data` carrying `full_name` for
every Google account (the function falls back to the e-mail when it does
not).
