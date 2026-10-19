-- ============================================================
-- 42. CUSTOMER 360 AND ADMIN NOTES   RUN LIVE 13 Oct 2026
-- ------------------------------------------------------------
-- Admin console v2, docs/ADMIN-CONSOLE-PLAN.md §3.3. One call that
-- answers "what does this person's account look like?", and a place to
-- write down what you learned. Needs §40 (it audits, and it reads the
-- audit log): run §40 first.
--
--   42.1  admin_notes            internal notes about a person. RLS on,
--                                no grants. Append-only by convention:
--                                there is no edit and no delete RPC.
--   42.2  admin_add_note()       audited. The audit row names the note by
--                                id; the BODY is not copied into the log.
--   42.3  admin_list_notes()     newest first.
--   42.4  admin_customer()       the whole picture, as one jsonb.
--
-- COUNTS AND SIZES, NEVER CONTENT (plan, principle 2). admin_customer()
-- returns, for a person's work: how many projects, their formats, and per
-- scope the number of rows and the byte size of the stored JSON. It never
-- returns a project title, a project_data value, a script, a character,
-- an AI prompt, or a Razorpay `raw` blob. The test seeds a marker string
-- into a title and into project_data and asserts it is absent from the
-- whole response.
--
-- NEVER ANOTHER PERSON'S DATA. Every read is keyed on p_user. Where a
-- table holds other people (account members, invite redemptions of a
-- shared code) the response carries a COUNT, not a row. The audit slice
-- is the rows whose target is this person: target_kind 'user' with their
-- id, or a user_id inside before/after — the convention §40 sets.
--
-- admin_customer() does not itself write an audit row: reading a person's
-- page is not a change. If that policy turns, it is one line here.
-- ============================================================

-- 42.1 NOTES ------------------------------------------------------------
create table if not exists public.admin_notes (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  at           timestamptz not null default clock_timestamp(),
  author       uuid,                       -- no FK: a departed admin's notes stay
  author_email text,
  body         text        not null check (length(body) between 1 and 1000)
);
create index if not exists admin_notes_user_idx on public.admin_notes (user_id, at desc);
alter table public.admin_notes enable row level security;
revoke all on public.admin_notes from public, anon, authenticated;
-- no policies: RLS on, no grants. The two RPCs are the only way in or out.

-- 42.2 ADD ----------------------------------------------------------------
create or replace function public.admin_add_note(p_user uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  b    text := btrim(coalesce(p_body, ''));
  n    public.admin_notes;
  mail text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'No such user' using errcode = '22023';
  end if;
  if length(b) = 0 or length(b) > 1000 then
    raise exception 'A note is 1 to 1000 characters.' using errcode = '22023';
  end if;
  mail := coalesce(nullif(auth.jwt() ->> 'email', ''), (select u.email from auth.users u where u.id = auth.uid()));
  insert into public.admin_notes (user_id, author, author_email, body)
  values (p_user, auth.uid(), mail, b)
  returning * into n;
  perform public.admin_audit_write('add_note', 'user', p_user::text, null,
    jsonb_build_object('note_id', n.id, 'length', length(b)));
  return jsonb_build_object('id', n.id, 'user_id', n.user_id, 'at', n.at,
                            'author', n.author, 'author_email', n.author_email, 'body', n.body);
end;
$fn$;

-- 42.3 LIST ---------------------------------------------------------------
create or replace function public.admin_list_notes(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'at', n.at, 'author', n.author,
                                                       'author_email', n.author_email, 'body', n.body)
                                    order by n.at desc, n.id desc)
                     from public.admin_notes n where n.user_id = p_user), '[]'::jsonb);
end;
$fn$;

-- 42.4 THE PICTURE ----------------------------------------------------------
create or replace function public.admin_customer(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  u        auth.users;
  m        public.studio_members;
  v_ends   timestamptz;
  v_auth   jsonb;
  v_scopes jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  select * into u from auth.users x where x.id = p_user;
  if u.id is null then raise exception 'No such user' using errcode = '22023'; end if;
  select * into m from public.studio_members x where x.user_id = p_user;
  v_ends := public.trial_ends_at(p_user);

  -- Supabase's own session table is not ours and may refuse us; it is
  -- also absent from a bare PostgreSQL. A missing answer is null, said so.
  begin
    execute $q$
      select jsonb_build_object(
               'count',       count(*),
               'last_active', max(coalesce(s.refreshed_at, s.updated_at, s.created_at)),
               'recent',      coalesce((select jsonb_agg(jsonb_build_object('created_at', r.created_at, 'user_agent', r.user_agent, 'ip', host(r.ip))
                                                          order by r.created_at desc)
                                          from (select * from auth.sessions z where z.user_id = $1 order by z.created_at desc limit 5) r),
                                       '[]'::jsonb))
        from auth.sessions s where s.user_id = $1 $q$
      into v_auth using p_user;
  exception when others then
    v_auth := null;
  end;

  select coalesce(jsonb_agg(jsonb_build_object('scope', t.scope, 'rows', t.n, 'bytes', t.bytes) order by t.bytes desc, t.scope), '[]'::jsonb)
    into v_scopes
    from (select d.scope, count(*) as n, sum(octet_length(d.data::text))::bigint as bytes
            from public.project_data d
            join public.projects pr on pr.id = d.project_id
           where pr.owner_id = p_user
           group by d.scope) t;

  return jsonb_build_object(
    'generated_at', now(),

    'identity', jsonb_build_object(
      'id', u.id, 'email', u.email,
      'name', coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', '')),
      'created_at', u.created_at, 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at),

    'standing', jsonb_build_object(
      'is_member',         m.user_id is not null,
      'role',              m.role,
      'disabled_at',       m.disabled_at,
      'member_since',      m.created_at,
      'plan',              public.user_plan(p_user),
      'entitled',          public.is_entitled(p_user),
      'purchases_required', public.purchases_required(),
      'grandfathered',     coalesce(m.trial_source = 'admin' and m.trial_minutes >= 525600, false),
      'admitted_by',       (select jsonb_build_object('pass_type', c.pass_type, 'label', c.label)
                              from public.invite_codes c where c.id = m.invite_code_id),
      'email_grant',       (select jsonb_build_object('role', g.role, 'plan', g.plan, 'until', g.until,
                                                      'applied', g.applied_user is not null, 'applied_plan', g.applied_plan)
                              from public.email_grants g where g.email = lower(u.email))),

    'trial', jsonb_build_object(
      'started_at',   m.trial_started_at,
      'minutes',      m.trial_minutes,
      'source',       m.trial_source,
      'scope',        m.trial_scope,
      'ends_at',      v_ends,
      'active',       public.trial_active(p_user),
      'seconds_left', case when v_ends is null then null else greatest(0, floor(extract(epoch from (v_ends - now()))))::bigint end),

    'payments', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'plan_id', p.plan_id, 'period', p.period, 'status', p.status,
                  'amount_paise', p.amount_paise, 'currency', p.currency, 'discount_paise', p.discount_paise,
                  'credit_paise', p.credit_paise, 'promo_code', p.promo_code,
                  'razorpay_order_id', p.razorpay_order_id, 'razorpay_payment_id', p.razorpay_payment_id,
                  'note', p.note, 'created_at', p.created_at, 'paid_at', p.paid_at) order by p.created_at desc)
                  from (select * from public.payments x where x.user_id = p_user order by x.created_at desc limit 100) p), '[]'::jsonb),

    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', i.id, 'number', i.number, 'payment_id', i.payment_id, 'plan_name', i.plan_name,
                  'amount_paise', i.amount_paise, 'currency', i.currency, 'issued_at', i.issued_at,
                  'emailed_at', i.emailed_at) order by i.issued_at desc)
                  from public.invoices i where i.user_id = p_user), '[]'::jsonb),

    'refunds', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', r.id, 'payment_id', r.payment_id, 'amount_paise', r.amount_paise, 'status', r.status,
                  'reason', r.reason, 'created_at', r.created_at, 'processed_at', r.processed_at) order by r.created_at desc)
                  from public.refunds r join public.payments p on p.id = r.payment_id where p.user_id = p_user), '[]'::jsonb),

    'refund_requests', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', q.id, 'payment_id', q.payment_id, 'category', q.category, 'message', q.message,
                  'status', q.status, 'admin_note', q.admin_note, 'created_at', q.created_at, 'decided_at', q.decided_at)
                  order by q.created_at desc)
                  from public.refund_requests q where q.user_id = p_user), '[]'::jsonb),

    'referral', jsonb_build_object(
      'code',    (select c.code from public.promo_codes c where c.kind = 'referral' and c.owner_user_id = p_user),
      'credits', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', rc.id, 'payment_id', rc.payment_id, 'amount_paise', rc.amount_paise, 'status', rc.status,
                    'created_at', rc.created_at, 'paid_at', rc.paid_at) order by rc.created_at desc)
                    from public.referral_credits rc where rc.referrer_user_id = p_user), '[]'::jsonb)),

    'sessions', jsonb_build_object(
      'device_lock', (select jsonb_build_object('last_heartbeat', s.last_heartbeat, 'client_ip', s.client_ip, 'user_agent', s.user_agent)
                        from public.user_active_sessions s where s.user_id = p_user),
      'auth',        v_auth),

    'redemptions', coalesce((select jsonb_agg(jsonb_build_object(
                    'pass_type', c.pass_type, 'label', c.label, 'redeemed_at', rd.redeemed_at) order by rd.redeemed_at desc)
                    from public.invite_redemptions rd join public.invite_codes c on c.id = rd.code_id
                   where rd.user_id = p_user), '[]'::jsonb),

    'work', jsonb_build_object(
      'projects',      (select count(*) from public.projects pr where pr.owner_id = p_user),
      'formats',       coalesce((select jsonb_object_agg(f.format, f.n)
                                   from (select pr.format, count(*) as n from public.projects pr where pr.owner_id = p_user group by pr.format) f), '{}'::jsonb),
      'scopes',        v_scopes,
      'total_bytes',   coalesce((select sum((e ->> 'bytes')::bigint) from jsonb_array_elements(v_scopes) e), 0),
      'last_sync',     (select max(d.updated_at) from public.project_data d join public.projects pr on pr.id = d.project_id where pr.owner_id = p_user),
      'collaborating_on', (select count(*) from public.project_collaborators pc where pc.user_id = p_user),
      'shares_created',   (select count(*) from public.shares sh where sh.created_by = p_user)),

    'orgs', jsonb_build_object(
      'owned',  coalesce((select jsonb_agg(jsonb_build_object(
                    'id', a.id, 'name', a.name, 'plan', a.plan, 'plan_until', a.plan_until, 'seat_limit', a.seat_limit,
                    'storage_limit_mb', a.storage_limit_mb,
                    'seats_used', (select count(*) from public.account_members am where am.account_id = a.id and am.status = 'active'))
                    order by a.created_at)
                    from public.accounts a where a.owner_id = p_user), '[]'::jsonb),
      'member_of', coalesce((select jsonb_agg(jsonb_build_object(
                    'account_id', am.account_id, 'name', a.name, 'role', am.role, 'status', am.status, 'joined_at', am.joined_at)
                    order by am.created_at)
                    from public.account_members am join public.accounts a on a.id = am.account_id
                   where am.user_id = p_user and a.owner_id <> p_user), '[]'::jsonb)),

    'notes', public.admin_list_notes(p_user),

    'audit', coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc, x.id desc)
                         from (select au.* from public.admin_audit au
                                where (au.target_kind = 'user' and au.target_id = p_user::text)
                                   or au.after  ->> 'user_id' = p_user::text
                                   or au.before ->> 'user_id' = p_user::text
                                order by au.at desc, au.id desc limit 20) x), '[]'::jsonb)
  );
end;
$fn$;

-- 42.5 GRANTS -----------------------------------------------------------
revoke execute on function public.admin_add_note(uuid, text)  from public, anon;
revoke execute on function public.admin_list_notes(uuid)      from public, anon;
revoke execute on function public.admin_customer(uuid)        from public, anon;
grant  execute on function public.admin_add_note(uuid, text)  to authenticated;
grant  execute on function public.admin_list_notes(uuid)      to authenticated;
grant  execute on function public.admin_customer(uuid)        to authenticated;

notify pgrst, 'reload schema';

-- 42.6 CHECKS TO RUN, none of which has been run live -------------------
--  1. anon and a non-admin: admin_add_note, admin_list_notes and
--     admin_customer -> 42501. select on admin_notes -> permission denied.
--  2. admin: admin_add_note(uid, '') and a 1001-character body -> 22023;
--     a unknown uid -> 22023 'No such user'.
--  3. admin: admin_add_note writes ONE admin_audit row ('add_note') in the
--     same transaction; roll the transaction back and both are gone.
--  4. admin_customer(uid): identity.email is that user's; payments and
--     invoices are only theirs; work.scopes holds scope/rows/bytes and no
--     project title or project_data value appears anywhere in the text.
--  5. admin_customer(random uuid) -> 22023.
--  6. a grandfathered member reads standing.grandfathered true; a signup
--     trial reads false.
-- Test file: scripts/schema-tests/admin-customer.sql (run by npm run test:schema).
-- ============================================================
