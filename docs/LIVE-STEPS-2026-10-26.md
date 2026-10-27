# Live steps, 26 Oct 2026 — the marketing pass (§58, §59, §60 and the console)

The client half of the marketing pass (HISTORY item 63) is safe before any of
this runs: every new call degrades silently (`bump_event` falls back to its
one-argument form, the testimonial ask never appears without §59, trial copy
stays generic without §60's `trial_scope`). Do the steps in this order.

## 0. The paste rule

Never paste SQL through the clipboard as text. Paste base64, decode it in the
page, and compare the checksum with the editor's contents before pressing Run.

```bash
shasum -a 256 supabase/schema/schema-58-funnel-source.sql
# 92604bb72840583daf38a4ebc0ef6444f79b6b93be5a71307750b97029a235fe
shasum -a 256 supabase/schema/schema-59-testimonials.sql
# 866d3f94c4d81424501335ea8ea5fb454aa1eee30097b01bbec39ffabe9a4e34
shasum -a 256 supabase/schema/schema-60-signup-trial-scope.sql
# 7f983a36d52f70613e378a42fbab152a1efc40afc325e334efb5c42c8d8c7e55
```

## 1. FIRST, and before 2026-10-31T18:29Z: move the price rise to 31 Dec

The founding prices rise by themselves at `plans.next_price_at`, which reads
2026-10-31T18:29Z (midnight IST). Your decision was to push it to 31 Dec. In
the console → Billing, for each of Basic, Intermediate and Pro, keep the next
price and set its date to **2026-12-31 23:59 IST** (stored as
2026-12-31T18:29Z). Then read it back over the anonymous API — the date every
public page prints comes from this, never from copy:

```sql
select id, next_price_paise, next_price_at from public.plans order by id;   -- three rows, 2026-12-31 18:29:00+00
select public.price_notice();                                               -- the same date in every row
```

If this is missed, the rise fires on 1 Nov and the playbook's `{RISE_DATE}`
posts would be wrong — nothing in code can stop it.

## 2. Run §58 (funnel steps + traffic source), then read back

```sql
select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.events'::regclass order by conname;
  -- events_name_check lists ten names; events_pkey is (day, name, source)
select oid::regprocedure from pg_proc where proname = 'bump_event';    -- bump_event(text) AND bump_event(text,text)
select * from public.admin_funnel_by_source(current_date - 7, current_date);
```

## 3. Run §59 (testimonial consent), then read back

```sql
select relrowsecurity from pg_class where oid = 'public.testimonials'::regclass;   -- true
select count(*) from public.public_testimonials();                                 -- 0 until one is approved
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'testimonials_on_user_delete';   -- one row
select confdeltype from pg_constraint where conname = 'testimonials_author_fkey';  -- n
```

Approved quotes are NOT published automatically: `src/data/testimonials.json`
stays hand-curated, and `check-testimonials` still demands the consent fields.

## 4. Run §60 (a pressed trial follows the console's scope), then read back

```sql
select pg_get_functiondef('public.start_trial(text)'::regprocedure) like '%§60%';   -- true
select public.trial_offer() ? 'trial_scope';                                      -- true
```

## 5. The trial: 3 days, whole studio

In the console → Growth → Trial: length **3 days** (`trial_minutes` 4320),
scope **full**, and the trial plan **Pro** — a full trial opens the features of
`trial_plan` (Intermediate when unset), so "the whole studio" needs Pro. Note
what a full trial does NOT widen: `user_limits()` still reads the no-plan row,
so a trial keeps one film in the cloud, no shares and no collaborators (local
work is never capped). Read back:

```sql
select trial_scope, trial_minutes, trial_plan from public.billing_settings;   -- full, 4320, pro
select public.trial_offer();
```

The public pages say the length from `trial_offer()` at runtime. They do not
name a scope (`test:marketing` fails a trial sentence that does), because a
scope sentence must be true for every setting the console allows.

## 6. Two-account checks

`docs/SECURITY-RLS.md` §58, §59 and §60.

## 7. Before `lead.live` and `student.live` go on

- **privacy.html** carries three DRAFT passages, each marked with an HTML
  comment "DRAFT, AWAITING THE OWNER": `#visit-counts`, `#leads` and the
  26 October line under What changed. Approve or rewrite them, move "Last
  updated" to the approval day, and only then set `lead.live` true in
  `src/data/marketing-site.json` and run `npm run make:marketing`. **Do not
  release develop to `main` with a DRAFT comment in a legal page.**
- **Student code.** Create `STUDENT50` in the console's promo codes, check it
  with `quote_order()` in INR (an amount-off code is refused for USD orders),
  then set `student.live` true in `marketing-site.json`. The pricing band and
  the purchase page's education band both read that flag; until it is true
  neither names a code.
- **Competitor rows** on the two "Switching from" pages render only when a
  row's `status` is `read` in `src/data/marketing-compare.json`. Open each
  source URL, correct or drop the row, set `status: "read"` and `checked` to
  that day, run `npm run make:marketing`.

## 8. Then, in this order

Resend (`RESEND_API_KEY`, `MAIL_FROM`, DNS — `docs/BILLING.md` §13/§16) before
any real payment; redeploy the four edge functions (`docs/LIVE-STEPS-2026-10-21.md`);
publish the Chrome extension; release through `docs/BRANCHING.md`; start the
channel plan in `docs/MARKETING-PLAYBOOK.md`.
