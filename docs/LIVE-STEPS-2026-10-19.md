# Live steps, 19 Oct 2026 — §36 (again), §48, §49

Three pieces of SQL to run on the live project (`conhlrulxfwkhsnymakz`),
in this order. None of them is needed for the site to keep working. Each
one turns on something the code already ships:

| Order | Section | What it turns on | If you never run it |
| --- | --- | --- | --- |
| 1 | §36, regenerated | The six modules that came back (auto-tag, screen time, cast matrix on Intermediate; shoot day, edit log, deliverables on Pro). Also the Idea Vault on Basic and up | The live plans still carry the 12 Oct map: those seven modules stay off for paying buyers once purchases are required. While purchases are not required, everybody gets `open_features()`, which is Pro's map, so that has the same gap |
| 2 | §48 | Co-writing presence ("Meera is also here", live carets) | The Screenplay Writer shows nobody. Sync is unaffected |
| 3 | §49 | The co-editing switch in the console (People tab) | The console says "not available on this database yet". Scripts keep the old rule: the newer copy wins, and the other copy is kept as a draft |

§36 and §48 are independent. §49 needs §40 (`admin_audit_write`) and §45
(`require_role`), which are both live. All three can be re-run safely.

## 0. The paste rule (every section)

Never paste SQL through the clipboard as text. Every em-dash in it turns
into `‚Äî` (see CLAUDE.md, "Pasting SQL through the clipboard corrupts
it"). Paste base64 instead, decode it in the page, and check the checksum
before you press Run.

On your Mac, from the repo root on `develop`:

```bash
# §36 is a slice of the big file. Cut it out by its markers, not by line numbers:
awk '/^-- 36\. PLAN FEATURES FROM THE MATRIX/{p=1; print prev} p{print} /^-- END OF SECTION 36 \(generated\)/{exit} {prev=$0}' \
  supabase/schema/supabase-schema.sql > /tmp/s36.sql

shasum -a 256 /tmp/s36.sql supabase/schema/schema-48-presence.sql supabase/schema/schema-49-co-editing.sql
```

At commit `dac7de8` the checksums are:

```
b1f5bc655ff35daed53f2030ab3db9663ff36313e4a2fcabba223e97218abaec  /tmp/s36.sql   (66 lines)
752919adb42732305bcb57e35317f2de14ddaebdb279d01b433a75bb3a1950af  schema-48-presence.sql
fa4ce74553262824e9f80b5eed7d7cfdaea11152ac847d7e3be605282a3c31f5  schema-49-co-editing.sql
```

If yours differ, stop. You are not on the same commit, or the cut went
wrong.

Then, for each file in turn:

1. `base64 -i <file> | pbcopy`
2. Open the Supabase dashboard → SQL Editor → New query.
3. Open the browser console (⌥⌘J) on that tab, and run this, pasting the
   base64 where it says:

   ```js
   const b64 = '<paste here>';
   const text = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
   monaco.editor.getModels().at(-1).setValue(text);
   const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(monaco.editor.getModels().at(-1).getValue())))]
     .map(b => b.toString(16).padStart(2, '0')).join('');
   hash;
   ```

4. Compare the printed hash with the checksum above. It must match
   exactly. Then press **Run**.
5. Run that section's read-back (below) in a **new** query, and copy me
   the results.

## 1. §36, regenerated — plan features

**What it does:** it replaces `plans.features` for `starter`, `indie` and
`pro`, and merges `limits.extension`. It does not touch the `free` row.
It is the same section that ran on 12 Oct, regenerated from
`src/data/plan-matrix.json`. Never edit it by hand.

**Read-back:**

```sql
select id,
       (select count(*) from jsonb_each(features) where value = 'true'::jsonb) as on_count,
       (select count(*) from jsonb_object_keys(features)) as keys,
       features->'idea-vault'   as idea_vault,
       features->'auto-tag'     as auto_tag,
       features->'shoot-day'    as shoot_day,
       limits->'extension'      as extension
  from plans where id in ('starter','indie','pro') order by price_paise;
```

**Expect:**

| id | on_count | keys | idea_vault | auto_tag | shoot_day | extension |
| --- | --- | --- | --- | --- | --- | --- |
| starter | 10 | 40 | true | false | false | false |
| indie | 26 | 40 | true | true | false | true |
| pro | 32 | 40 | true | true | true | true |

Pro is 32 and not 40 on purpose. The eight modules that stay hidden are
false on every plan.

## 2. §48 — presence

**What it does:**

- Creates `can_join_presence(topic)`.
- Adds two policies on `realtime.messages`. They let in only people who
  can already read the project (`has_project_access`), and only for the
  presence extension.
- Stores nothing.

**Do not** switch Realtime to "private channels only" in the dashboard.
The sync channels are public and stay public; only presence is private.

**Read-back:**

```sql
select policyname, cmd, roles from pg_policies
 where schemaname = 'realtime' and tablename = 'messages' and policyname like 'fms presence:%'
 order by policyname;

select public.can_join_presence('pr:not-a-uuid') as junk_topic,
       public.can_join_presence('pr:00000000-0000-0000-0000-000000000000') as nobodys_project;
```

**Expect:**

- Two policy rows:
  - `fms presence: project readers receive` / `SELECT` / `{authenticated}`
  - `fms presence: project readers send` / `INSERT` / `{authenticated}`
- Both probes return `false`. (The SQL editor runs as `postgres`, which has
  no `auth.uid()`, so even a real project id answers false there. That is
  expected.)

If the first query returns no rows and the run printed
`§48: realtime.messages does not exist here`, Realtime is not enabled on
the project. Tell me, and don't go further with presence.

**Two-account check (after §48):**

1. Sign in as A in one browser and B in another (or a private window).
2. A shares a project with B (Settings → Sharing).
3. Both open `screenplay.html` on that project.
4. Each should see the other's name in the top bar within a few seconds.
5. Clicking into a line on one side should show a thin named caret on
   the other.

## 3. §49 — the co-editing switch

**What it does:**

- Adds `billing_settings.co_editing_enabled`, default **false**.
- Adds `co_editing_enabled()`, which anyone can call.
- Adds `admin_set_co_editing_enabled(bool)`, which only the owner can
  call, and which is written to the audit log.

Running it changes no behaviour, because the switch starts off.

**Read-back:**

```sql
select public.co_editing_enabled() as on_now;
select co_editing_enabled from public.billing_settings;
select proname, proacl from pg_proc
 where proname in ('co_editing_enabled','admin_set_co_editing_enabled') order by proname;
```

**Expect:**

- `on_now = false`, and the column is `false`.
- In `proacl`:
  - `co_editing_enabled` lists `anon` and `authenticated`.
  - `admin_set_co_editing_enabled` lists `authenticated`, and does not
    list `anon`.

Over PostgREST with the anon key:

- `POST /rest/v1/rpc/co_editing_enabled {}` → `false`
- `POST /rest/v1/rpc/admin_set_co_editing_enabled {"p_enabled":true}` →
  **42501**

## 4. Turning co-editing on (later, your call)

Only do this after the §48 two-account check works:

1. Open `admin.html#people` → **Co-editing** → tick "Merge
   collaborators' edits line by line" → confirm.
2. Reload both browsers. Each page reads the switch once, when it loads.
3. A and B type in **different** lines of the same scene at the same
   time. After both saves land (a few seconds), each should see both
   edits, and nothing should be lost.
4. Both edit the **same** line. The later edit wins. The other is not
   kept as a draft in this mode, so try it on a throwaway line.
5. A deletes a line while B edits a different one. The delete should
   hold.

If anything looks wrong, untick the switch. Pages go back to "the newer
copy wins, the other is kept as a draft" on their next load.

## 5. What to tell me back

- The three hashes you saw before each Run, and whether they matched.
- The read-back output of each section, copied as text.
- For §48: whether the two-account check showed names and carets.
- For §49, if you turn it on: what happened in steps 3–5, in a line each.

Once you send these, I will mark §36 (re-run), §48 and §49 as **RUN LIVE**
in their headers, in `CLAUDE.md` and in `docs/HANDOFF.md`.
