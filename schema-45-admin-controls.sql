-- ============================================================
-- 45. ADMIN CONTROLS: ROLES, FEATURE OVERRIDES, BANNER, SUPPORT QUEUE,
--     PASSES AND SHARES, DATA-SUBJECT TOOLS          RUN LIVE: 13 Oct 2026
-- ------------------------------------------------------------
-- Admin console v2, docs/ADMIN-CONSOLE-PLAN.md §3.7-§3.10, narrowed by
-- §11 (owner decisions, 12 Oct 2026): NO public contact form, NO anon
-- submit_support, NO outbound mail, NO digest. Nothing in this section
-- is callable by anon except the read-only banner.
--
-- REQUIRES SECTION 40. Every mutating RPC below ends in
-- public.admin_audit_write(...), which section 40 defines. Run 40 first;
-- this section refuses to load without it (the guard just below).
--
-- WHAT IS HERE, in the order the console uses it
--   45.1  ROLES. admin_roles (owner | finance | support), studio_role(),
--         require_role(), a last-owner guard, admin_list_roles(),
--         admin_set_role(). Every existing admin is backfilled `owner`.
--   45.2  FEATURE OVERRIDES. feature_overrides over plans.features,
--         effective_features(), admin_set_feature_override(),
--         admin_list_feature_overrides().
--   45.3  THE ANNOUNCEMENT BANNER. site_announcement,
--         site_announcement_now() (anon-callable, read-only),
--         admin_set_announcement(), admin_clear_announcement().
--   45.4  THE MANUAL SUPPORT QUEUE. support_tickets, support_ticket_notes,
--         admin_log_ticket(), admin_update_ticket(), admin_list_support().
--   45.5  ACCESS AND SHARING. admin_list_passes(), admin_revoke_pass(),
--         admin_extend_pass(), admin_list_shares(), admin_revoke_share().
--   45.6  DATA-SUBJECT TOOLS. deleted_subjects (the tombstone),
--         admin_export_user(), admin_delete_user().
--
-- THE ROLE MATRIX (the intended one; the main thread retrofits the
-- EXISTING admin_* RPCs to it with require_role(), this section does not
-- touch them). owner always passes require_role(); the other two list
-- what they add:
--     owner    the switch, prices, flags/overrides, roles, banner,
--              export/delete of a person, and everything below
--     finance  refunds, invoices, payments, promo codes
--     support  notes, trial grants, sessions, the support queue,
--              passes and shares
--
-- IS_STUDIO_ADMIN() IS NOT RESTATED. It reads studio_members.role =
-- 'admin' and stays true for all three roles, because admin_set_role()
-- keeps studio_members in step (a person with a console role IS an
-- admin member). Every existing caller and policy is untouched.
-- studio_role() narrows on top of it. A studio admin with no admin_roles
-- row (promoted by SQL after this ran) reads as 'owner' — the
-- backfill's rule, kept for them, so nothing that worked yesterday can
-- lock somebody out of the console today.
--
-- EVERY NEW TABLE: RLS on, no policies, all client privileges revoked.
-- Every function: SECURITY DEFINER, search_path = public, pg_temp,
-- 42501 for the wrong caller, execute revoked from public and anon.
--
-- IDEMPOTENT: create-if-not-exists, create-or-replace, guarded
-- backfill. Re-running changes nothing.
-- ============================================================

do $guard$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_audit_write'
  ) then
    raise exception 'Section 45 needs section 40 (public.admin_audit_write). Run section 40 first.';
  end if;
end
$guard$;

-- ============================================================
-- 45.1 ROLES
-- ============================================================
create table if not exists public.admin_roles (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  role       text        not null check (role in ('owner','finance','support')),
  granted_by uuid        references auth.users(id) on delete set null,
  at         timestamptz not null default now()
);
alter table public.admin_roles enable row level security;
revoke all on public.admin_roles from public, anon, authenticated;

-- Every administrator that exists when this runs is an owner. Guarded,
-- so a re-run never overwrites a role somebody has since narrowed.
insert into public.admin_roles (user_id, role)
select m.user_id, 'owner'
  from public.studio_members m
 where m.role = 'admin'
on conflict (user_id) do nothing;

/** The caller's console role, or null for anybody who is not an admin.
 *  Internal truth is is_studio_admin() (unchanged); this narrows it. */
create or replace function public.studio_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when not public.is_studio_admin() then null
           else coalesce((select r.role from public.admin_roles r where r.user_id = auth.uid()), 'owner')
         end;
$$;

/** The one line an admin RPC adds to narrow itself:
 *      perform public.require_role(array['finance']);
 *  owner always passes. Anybody else gets a sentence, errcode 42501. */
create or replace function public.require_role(p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare r text := public.studio_role();
begin
  if r is null then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if r = 'owner' or r = any(coalesce(p_roles, '{}'::text[])) then return; end if;
  raise exception 'Your role (%) cannot do this. It needs the % role.', r,
    coalesce(nullif(array_to_string(p_roles, ' or '), ''), 'owner') using errcode = '42501';
end;
$fn$;

/** Owners other than p_exclude: an admin_roles owner who is still an
 *  admin member, plus a studio admin with no row (they read as owner). */
create or replace function public._other_owner_count(p_exclude uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from (
    select r.user_id
      from public.admin_roles r
      join public.studio_members m on m.user_id = r.user_id and m.role = 'admin' and m.disabled_at is null
     where r.role = 'owner' and r.user_id is distinct from p_exclude
    union
    select m.user_id
      from public.studio_members m
     where m.role = 'admin' and m.disabled_at is null and m.user_id is distinct from p_exclude
       and not exists (select 1 from public.admin_roles r where r.user_id = m.user_id)
  ) x;
$$;

/** The last owner can be neither removed nor demoted. */
create or replace function public.admin_roles_keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if public._other_owner_count(old.user_id) = 0 then
      raise exception 'There must always be at least one owner. Make somebody else an owner first.'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$fn$;
drop trigger if exists admin_roles_keep_an_owner on public.admin_roles;
create trigger admin_roles_keep_an_owner
  before delete or update of role on public.admin_roles
  for each row execute function public.admin_roles_keep_an_owner();

create or replace function public.admin_list_roles()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.require_role(array['owner']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', m.user_id, 'email', u.email,
             'role', coalesce(r.role, 'owner'), 'explicit', r.user_id is not null,
             'granted_by', r.granted_by, 'at', r.at)
           order by coalesce(r.at, m.created_at))
      from public.studio_members m
      join auth.users u on u.id = m.user_id
      left join public.admin_roles r on r.user_id = m.user_id
     where m.role = 'admin' and m.disabled_at is null
  ), '[]'::jsonb);
end;
$fn$;

/** Give somebody a console role, or take it away (p_role null). A role
 *  makes them an admin MEMBER (is_studio_admin() true); removing it
 *  returns them to an ordinary member. Owner only. */
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before text;
  v_m      public.studio_members;
begin
  perform public.require_role(array['owner']);
  if p_user is null then raise exception 'No user given' using errcode = '22023'; end if;
  if p_role is not null and p_role not in ('owner','finance','support') then
    raise exception 'A role is owner, finance or support.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'There is no such account.' using errcode = '22023';
  end if;
  select * into v_m from public.studio_members m where m.user_id = p_user;
  v_before := case when v_m.role = 'admin' and v_m.disabled_at is null
                   then coalesce((select r.role from public.admin_roles r where r.user_id = p_user), 'owner') end;

  if p_role is null then
    -- Demote the membership too, or is_studio_admin() would still say yes.
    delete from public.admin_roles where user_id = p_user;   -- the last-owner trigger speaks here
    if v_before = 'owner' and not exists (select 1 from public.admin_roles r where r.user_id = p_user)
       and public._other_owner_count(p_user) = 0 then
      -- an owner with no row (legacy admin) is not covered by the trigger
      raise exception 'There must always be at least one owner. Make somebody else an owner first.'
        using errcode = '23514';
    end if;
    update public.studio_members set role = 'user' where user_id = p_user and role = 'admin';
  else
    if v_m.user_id is not null and v_m.disabled_at is not null then
      raise exception 'That account is disabled. Enable it before giving it a role.' using errcode = '22023';
    end if;
    if v_before = 'owner' and p_role <> 'owner' and public._other_owner_count(p_user) = 0 then
      raise exception 'There must always be at least one owner. Make somebody else an owner first.'
        using errcode = '23514';
    end if;
    insert into public.studio_members (user_id, role) values (p_user, 'admin')
      on conflict (user_id) do update set role = 'admin';
    insert into public.admin_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
      on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, at = now();
  end if;

  perform public.admin_audit_write('role.set', 'user', p_user::text,
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role), null);
  return jsonb_build_object('user_id', p_user, 'role', p_role, 'was', v_before);
end;
$fn$;

-- ============================================================
-- 45.2 FEATURE OVERRIDES
-- ------------------------------------------------------------
-- Resolution, most specific wins:  account > plan > global > the plan
-- matrix. A kill switch is `enabled = false`; an override of `true`
-- adds a feature a plan lacks. Within one scope two rows can meet (a
-- person in two accounts): the RESTRICTIVE one wins.
--
-- billing_status() IS NOT RESTATED. It has been restated in five
-- sections and any copy made here would silently roll back whichever
-- later one it raced; its shape is also the client's contract. So the
-- overrides are served by effective_features(), which starts from
-- billing_status() -> 'features' (whatever that currently means) and
-- applies the rows. THE ONE-LINE CLIENT CHANGE, in plan-gate.js:
--     features = (await rpc('effective_features')) ?? billing.features
-- (read a missing/failed answer as the old map). It FAILS OPEN: any
-- error, no session, or no override rows returns the plan's own map.
--
-- Scopes: global -> scope_id ''. plan -> a plans.id. account -> an
-- accounts.id (the organisation; its owner and active members).
-- An override is a named feature of a plan matrix and nothing else:
-- the key must exist in plans.features of some plan, must be a
-- boolean there, and is never `sample_only` (a restriction, not a
-- feature). A plan-scope row touches users of THAT plan only.
-- ============================================================
create table if not exists public.feature_overrides (
  key      text        not null check (length(key) between 1 and 64),
  scope    text        not null check (scope in ('global','plan','account')),
  scope_id text        not null default '',
  enabled  boolean     not null,
  set_by   uuid        references auth.users(id) on delete set null,
  at       timestamptz not null default now(),
  primary key (key, scope, scope_id),
  check ((scope = 'global') = (scope_id = ''))
);
alter table public.feature_overrides enable row level security;
revoke all on public.feature_overrides from public, anon, authenticated;

create or replace function public.effective_features()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  base jsonb;
  outp jsonb;
  pl   text;
  r    record;
begin
  if uid is null then return '{}'::jsonb; end if;
  base := coalesce(public.billing_status() -> 'features', '{}'::jsonb);
  outp := base;
  begin
    pl := public.user_plan(uid);
    for r in
      select o.key, o.enabled,
             case o.scope when 'account' then 3 when 'plan' then 2 else 1 end as rnk
        from public.feature_overrides o
       where o.scope = 'global'
          or (o.scope = 'plan' and o.scope_id = pl)
          or (o.scope = 'account' and o.scope_id in (
                select a.id::text from public.accounts a where a.owner_id = uid
                union
                select m.account_id::text from public.account_members m
                 where m.user_id = uid and m.status = 'active'))
       order by rnk, o.enabled desc            -- false lands last within a scope
    loop
      outp := outp || jsonb_build_object(r.key, r.enabled);
    end loop;
  exception when others then
    return base;                               -- fail OPEN to the plan's own map
  end;
  return outp;
end;
$fn$;

create or replace function public.admin_set_feature_override(p_key text, p_scope text, p_scope_id text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id     text := coalesce(btrim(p_scope_id), '');
  v_before jsonb;
begin
  perform public.require_role(array['owner']);
  if p_scope is null or p_scope not in ('global','plan','account') then
    raise exception 'The scope is global, plan or account.' using errcode = '22023';
  end if;
  if p_key is null or p_key = 'sample_only' or not exists (
       select 1 from public.plans p, jsonb_each(p.features) e(k, v)
        where e.k = p_key and jsonb_typeof(e.v) = 'boolean') then
    raise exception 'There is no feature called "%".', coalesce(p_key, '') using errcode = '22023';
  end if;
  if p_scope = 'global' then
    v_id := '';
  elsif p_scope = 'plan' then
    if not exists (select 1 from public.plans p where p.id = v_id) then
      raise exception 'There is no plan called "%".', v_id using errcode = '22023';
    end if;
  else
    if v_id !~ '^[0-9a-fA-F-]{36}$' or not exists (select 1 from public.accounts a where a.id::text = lower(v_id)) then
      raise exception 'There is no such account.' using errcode = '22023';
    end if;
    v_id := lower(v_id);
  end if;

  select to_jsonb(o) - 'set_by' into v_before from public.feature_overrides o
   where o.key = p_key and o.scope = p_scope and o.scope_id = v_id;

  if p_enabled is null then                     -- null = remove the override
    delete from public.feature_overrides where key = p_key and scope = p_scope and scope_id = v_id;
  else
    insert into public.feature_overrides (key, scope, scope_id, enabled, set_by)
      values (p_key, p_scope, v_id, p_enabled, auth.uid())
      on conflict (key, scope, scope_id) do update set enabled = excluded.enabled, set_by = excluded.set_by, at = now();
  end if;

  perform public.admin_audit_write('feature_override.set', 'feature', p_key || ':' || p_scope || ':' || v_id,
    v_before, jsonb_build_object('enabled', p_enabled), null);
  return jsonb_build_object('key', p_key, 'scope', p_scope, 'scope_id', v_id, 'enabled', p_enabled);
end;
$fn$;

create or replace function public.admin_list_feature_overrides()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.require_role(array['owner']);
  return jsonb_build_object(
    'overrides', coalesce((select jsonb_agg(jsonb_build_object(
                    'key', o.key, 'scope', o.scope, 'scope_id', o.scope_id, 'enabled', o.enabled,
                    'set_by', o.set_by, 'at', o.at) order by o.key, o.scope, o.scope_id)
                  from public.feature_overrides o), '[]'::jsonb),
    'known_keys', coalesce((select jsonb_agg(k order by k) from (
                    select distinct e.k from public.plans p, jsonb_each(p.features) e(k, v)
                     where jsonb_typeof(e.v) = 'boolean' and e.k <> 'sample_only') x(k)), '[]'::jsonb)
  );
end;
$fn$;

-- ============================================================
-- 45.3 THE ANNOUNCEMENT BANNER
-- ------------------------------------------------------------
-- One message at a time. admin_set_announcement() retires whatever was
-- active and inserts the new one; site_announcement_now() returns the
-- single live row (newest wins if rows were ever edited by hand) or
-- null. Plain text, 200 characters: the client renders it as text.
-- ============================================================
create table if not exists public.site_announcement (
  id         uuid        primary key default gen_random_uuid(),
  text       text        not null check (length(btrim(text)) between 1 and 200),
  level      text        not null default 'info' check (level in ('info','warn')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  active     boolean     not null default true,
  set_by     uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists site_announcement_active_idx on public.site_announcement (active, starts_at desc);
alter table public.site_announcement enable row level security;
revoke all on public.site_announcement from public, anon, authenticated;

create or replace function public.site_announcement_now()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(x) from (
    select a.id, a.text, a.level, a.starts_at, a.ends_at
      from public.site_announcement a
     where a.active and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
     order by a.starts_at desc, a.created_at desc
     limit 1
  ) x;
$$;

create or replace function public.admin_set_announcement(
  p_text text, p_level text default 'info', p_starts_at timestamptz default null, p_ends_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_text   text := btrim(coalesce(p_text, ''));
  v_start  timestamptz := coalesce(p_starts_at, now());
  v_id     uuid;
  v_before jsonb;
begin
  perform public.require_role(array['owner']);
  if length(v_text) < 1 or length(v_text) > 200 then
    raise exception 'The announcement is 1 to 200 characters.' using errcode = '22023';
  end if;
  if coalesce(p_level, 'info') not in ('info','warn') then
    raise exception 'The level is info or warn.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at <= v_start then
    raise exception 'The end has to be after the start.' using errcode = '22023';
  end if;
  select to_jsonb(a) - 'set_by' into v_before from public.site_announcement a
   where a.active order by a.created_at desc limit 1;
  update public.site_announcement set active = false where active;
  insert into public.site_announcement (text, level, starts_at, ends_at, active, set_by)
    values (v_text, coalesce(p_level, 'info'), v_start, p_ends_at, true, auth.uid())
    returning id into v_id;
  perform public.admin_audit_write('announcement.set', 'announcement', v_id::text, v_before,
    jsonb_build_object('text', v_text, 'level', coalesce(p_level, 'info'), 'starts_at', v_start, 'ends_at', p_ends_at), null);
  return v_id;
end;
$fn$;

create or replace function public.admin_clear_announcement()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n int;
begin
  perform public.require_role(array['owner']);
  update public.site_announcement set active = false where active;
  get diagnostics n = row_count;
  perform public.admin_audit_write('announcement.clear', 'announcement', null, jsonb_build_object('cleared', n), null, null);
  return n;
end;
$fn$;

-- ============================================================
-- 45.4 THE MANUAL SUPPORT QUEUE
-- ------------------------------------------------------------
-- Support arrives by e-mail to the support mailbox; an admin logs what
-- needs tracking by hand. No public form, no anon function, no mail.
-- admin_list_support() lays refund requests and invite requests beside
-- the tickets under one status vocabulary:
--     ticket   open | waiting | closed        (as stored)
--     refund   pending -> open, approved -> waiting;
--              declined / refunded are done and are not listed
--     invite   pending -> open; approved / declined are done, not listed
-- so p_status = 'closed' lists tickets only.
-- ============================================================
create table if not exists public.support_tickets (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null check (length(email) between 3 and 254),
  subject    text        not null check (length(btrim(subject)) between 1 and 200),
  body       text        not null default '' check (length(body) <= 4000),
  status     text        not null default 'open' check (status in ('open','waiting','closed')),
  assignee   uuid        references auth.users(id) on delete set null,
  created_by uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_email_idx  on public.support_tickets (lower(email));
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;

create table if not exists public.support_ticket_notes (
  id         uuid        primary key default gen_random_uuid(),
  ticket_id  uuid        not null references public.support_tickets(id) on delete cascade,
  author     uuid        references auth.users(id) on delete set null,
  body       text        not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_notes_ticket_idx on public.support_ticket_notes (ticket_id, created_at);
alter table public.support_ticket_notes enable row level security;
revoke all on public.support_ticket_notes from public, anon, authenticated;

create or replace function public.admin_log_ticket(p_email text, p_subject text, p_body text default '')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  s text := btrim(coalesce(p_subject, ''));
  b text := coalesce(p_body, '');
  v_id uuid;
begin
  perform public.require_role(array['support']);
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(e) > 254 then
    raise exception 'That does not look like an e-mail address.' using errcode = '22023';
  end if;
  if length(s) < 1 or length(s) > 200 then
    raise exception 'The subject is 1 to 200 characters.' using errcode = '22023';
  end if;
  if length(b) > 4000 then
    raise exception 'The message is at most 4000 characters.' using errcode = '22023';
  end if;
  insert into public.support_tickets (email, subject, body, created_by)
    values (e, s, b, auth.uid()) returning id into v_id;
  perform public.admin_audit_write('support.log', 'ticket', v_id::text, null,
    jsonb_build_object('subject', s), null);
  return v_id;
end;
$fn$;

create or replace function public.admin_update_ticket(
  p_id uuid, p_status text default null, p_assignee uuid default null,
  p_note text default null, p_unassign boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  t       public.support_tickets;
  v_old   jsonb;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.require_role(array['support']);
  select * into t from public.support_tickets x where x.id = p_id for update;
  if not found then raise exception 'There is no such ticket.' using errcode = '22023'; end if;
  if p_status is not null and p_status not in ('open','waiting','closed') then
    raise exception 'A status is open, waiting or closed.' using errcode = '22023';
  end if;
  if p_assignee is not null and not exists (
       select 1 from public.studio_members m where m.user_id = p_assignee and m.role = 'admin' and m.disabled_at is null) then
    raise exception 'Only an administrator can be assigned a ticket.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'A note is at most 2000 characters.' using errcode = '22023';
  end if;
  v_old := jsonb_build_object('status', t.status, 'assignee', t.assignee);

  update public.support_tickets
     set status     = coalesce(p_status, status),
         assignee   = case when p_unassign then null else coalesce(p_assignee, assignee) end,
         updated_at = now()
   where id = p_id
   returning * into t;
  if v_note is not null then
    insert into public.support_ticket_notes (ticket_id, author, body) values (p_id, auth.uid(), v_note);
  end if;

  perform public.admin_audit_write('support.update', 'ticket', p_id::text, v_old,
    jsonb_build_object('status', t.status, 'assignee', t.assignee, 'note_added', v_note is not null), null);
  return jsonb_build_object('id', t.id, 'status', t.status, 'assignee', t.assignee, 'note_added', v_note is not null);
end;
$fn$;

create or replace function public.admin_list_support(p_status text default null, p_limit int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare lim int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  perform public.require_role(array['support','finance']);
  if p_status is not null and p_status not in ('open','waiting','closed') then
    raise exception 'A status is open, waiting or closed.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.created_at desc)
      from (
        select * from (
          select 'ticket'::text as source, t.id::text as id, t.email, t.subject, t.status,
                 t.assignee, au.email as assignee_email, t.created_at, left(t.body, 300) as detail,
                 (select count(*) from public.support_ticket_notes n where n.ticket_id = t.id)::int as notes
            from public.support_tickets t
            left join auth.users au on au.id = t.assignee
          union all
          select 'refund', r.id::text, u.email, 'Refund request: ' || r.category,
                 case r.status when 'pending' then 'open' else 'waiting' end,
                 null::uuid, null::text, r.created_at, left(r.message, 300), 0
            from public.refund_requests r
            left join auth.users u on u.id = r.user_id
           where r.status in ('pending','approved')
          union all
          select 'invite', i.user_id::text, i.email, 'Invite request' || coalesce(': ' || nullif(i.display_name, ''), ''),
                 'open', null::uuid, null::text, i.requested_at, left(coalesce(i.note, ''), 300), 0
            from public.invite_requests i
           where i.status = 'pending'
        ) u
         where p_status is null or u.status = p_status
         order by u.created_at desc
         limit lim
      ) q
  ), '[]'::jsonb);
end;
$fn$;

-- ============================================================
-- 45.5 ACCESS AND SHARING — metadata only. No share token, no
-- redeemer e-mail address ever leaves in these.
-- ============================================================
create or replace function public.admin_list_passes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.require_role(array['support']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', c.code, 'pass_type', c.pass_type, 'label', c.label,
             'project_id', c.target_project_id, 'project_title', p.title,
             'created_by', c.created_by, 'created_by_email', cu.email, 'created_at', c.created_at,
             'uses', c.redemptions_count, 'max_uses', c.max_redemptions,
             'expires_at', c.expires_at, 'revoked_at', c.revoked_at,
             'status', case when c.revoked_at is not null then 'revoked'
                            when c.expires_at is not null and c.expires_at <= now() then 'expired'
                            when c.redemptions_count >= c.max_redemptions then 'used up'
                            else 'active' end)
           order by c.created_at desc)
      from public.invite_codes c
      left join public.projects p on p.id = c.target_project_id
      left join auth.users cu on cu.id = c.created_by
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.admin_revoke_pass(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare c public.invite_codes;
begin
  perform public.require_role(array['support']);
  select * into c from public.invite_codes x where x.code = btrim(p_code) or lower(x.code) = lower(btrim(p_code)) limit 1;
  if not found then raise exception 'There is no such code.' using errcode = '22023'; end if;
  update public.invite_codes set revoked_at = coalesce(revoked_at, now()) where id = c.id returning * into c;
  perform public.admin_audit_write('pass.revoke', 'pass', c.code,
    jsonb_build_object('revoked', false), jsonb_build_object('revoked', true), null);
  return jsonb_build_object('code', c.code, 'revoked_at', c.revoked_at);
end;
$fn$;

create or replace function public.admin_extend_pass(p_code text, p_days int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare c public.invite_codes; v_old timestamptz;
begin
  perform public.require_role(array['support']);
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Extend by 1 to 365 days.' using errcode = '22023';
  end if;
  select * into c from public.invite_codes x where x.code = btrim(p_code) or lower(x.code) = lower(btrim(p_code)) limit 1;
  if not found then raise exception 'There is no such code.' using errcode = '22023'; end if;
  if c.revoked_at is not null then
    raise exception 'That code has been revoked. A revoked code is not extended.' using errcode = '22023';
  end if;
  if c.expires_at is null then
    raise exception 'That code never expires.' using errcode = '22023';
  end if;
  v_old := c.expires_at;
  update public.invite_codes set expires_at = greatest(expires_at, now()) + make_interval(days => p_days)
   where id = c.id returning * into c;
  perform public.admin_audit_write('pass.extend', 'pass', c.code,
    jsonb_build_object('expires_at', v_old), jsonb_build_object('expires_at', c.expires_at, 'days', p_days), null);
  return jsonb_build_object('code', c.code, 'expires_at', c.expires_at);
end;
$fn$;

create or replace function public.admin_list_shares()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.require_role(array['support']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'project_id', s.project_id, 'project_title', p.title,
             'owner_email', ou.email, 'role', s.role,
             'created_by_email', cu.email, 'created_at', s.created_at, 'expires_at', s.expires_at,
             'active', s.expires_at is null or s.expires_at > now())
           order by s.created_at desc)
      from public.shares s
      join public.projects p on p.id = s.project_id
      left join auth.users ou on ou.id = p.owner_id
      left join auth.users cu on cu.id = s.created_by
  ), '[]'::jsonb);
end;
$fn$;

/** Ends the LINK: expires it now (the row stays, so the console can still
 *  show it). People who already joined through it keep the access they
 *  were given; that is project_collaborators and is not touched here. */
create or replace function public.admin_revoke_share(p_share uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare s public.shares; v_old timestamptz;
begin
  perform public.require_role(array['support']);
  select * into s from public.shares x where x.id = p_share for update;
  if not found then raise exception 'There is no such share link.' using errcode = '22023'; end if;
  v_old := s.expires_at;
  update public.shares set expires_at = least(coalesce(expires_at, now()), now()) where id = p_share returning * into s;
  perform public.admin_audit_write('share.revoke', 'share', p_share::text,
    jsonb_build_object('expires_at', v_old), jsonb_build_object('expires_at', s.expires_at), null);
  return jsonb_build_object('id', s.id, 'expires_at', s.expires_at);
end;
$fn$;

-- ============================================================
-- 45.6 DATA-SUBJECT TOOLS
-- ============================================================
-- The tombstone. A one-way hash of the lower-cased address and a date:
-- enough to refuse to add the person to the leads list again, not
-- enough to say who they were. No client privilege, no policy.
create table if not exists public.deleted_subjects (
  email_hash text        primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  deleted_at timestamptz not null default now(),
  deleted_by uuid        references auth.users(id) on delete set null
);
alter table public.deleted_subjects enable row level security;
revoke all on public.deleted_subjects from public, anon, authenticated;

create or replace function public._email_hash(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex'); $$;

-- A tombstoned address is refused at the door of the leads table. The
-- refusal is SILENT (the row is skipped), like a repeat sign-up: add_lead()
-- stays an oracle-free no-op, and is not restated here.
create or replace function public.leads_refuse_tombstoned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if exists (select 1 from public.deleted_subjects d where d.email_hash = public._email_hash(new.email)) then
    return null;
  end if;
  return new;
end;
$fn$;
drop trigger if exists leads_refuse_tombstoned on public.leads;
create trigger leads_refuse_tombstoned
  before insert on public.leads
  for each row execute function public.leads_refuse_tombstoned();

/** Everything the SERVER holds about one person. Owner only, audited.
 *  Other people's rows are never in it: a project's collaborators are a
 *  count, comments by others are left out, share tokens are not shown. */
create or replace function public.admin_export_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  u  auth.users;
  em text;
  out jsonb;
begin
  perform public.require_role(array['owner']);
  if p_user is null then raise exception 'No user given' using errcode = '22023'; end if;
  select * into u from auth.users x where x.id = p_user;
  if not found then raise exception 'There is no such account.' using errcode = '22023'; end if;
  em := lower(u.email);

  out := jsonb_build_object(
    'exported_at', now(),
    'note', 'Only what is stored on the server is in this export. Work that lives only in the person''s own browser (local-only projects, drafts that never synced, the scene bin) was never uploaded and cannot be included.',
    'profile', jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                 'last_sign_in_at', u.last_sign_in_at, 'metadata', u.raw_user_meta_data),
    'membership', (select to_jsonb(m) - 'user_id' from public.studio_members m where m.user_id = p_user),
    'console_role', (select r.role from public.admin_roles r where r.user_id = p_user),
    'accounts_owned', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'plan', a.plan,
                          'seat_limit', a.seat_limit, 'created_at', a.created_at))
                        from public.accounts a where a.owner_id = p_user), '[]'::jsonb),
    'account_seats', coalesce((select jsonb_agg(jsonb_build_object('account_id', m.account_id, 'role', m.role,
                          'status', m.status, 'joined_at', m.joined_at))
                        from public.account_members m where m.user_id = p_user), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'plan_id', p.plan_id, 'period', p.period,
                          'amount_paise', p.amount_paise, 'currency', p.currency, 'status', p.status, 'note', p.note,
                          'razorpay_order_id', p.razorpay_order_id, 'razorpay_payment_id', p.razorpay_payment_id,
                          'created_at', p.created_at, 'paid_at', p.paid_at) order by p.created_at)
                        from public.payments p where p.user_id = p_user), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('number', i.number, 'buyer_name', i.buyer_name,
                          'buyer_email', i.buyer_email, 'plan_name', i.plan_name, 'amount_paise', i.amount_paise,
                          'currency', i.currency) order by i.number)
                        from public.invoices i where i.user_id = p_user), '[]'::jsonb),
    'refund_requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'category', r.category,
                          'message', r.message, 'status', r.status, 'created_at', r.created_at))
                        from public.refund_requests r where r.user_id = p_user), '[]'::jsonb),
    'invite_request', (select to_jsonb(i) - 'user_id' - 'user_agent' from public.invite_requests i where i.user_id = p_user),
    'invite_redemptions', coalesce((select jsonb_agg(jsonb_build_object('redeemed_at', x.redeemed_at, 'access_id', x.access_id))
                        from public.invite_redemptions x where x.user_id = p_user), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', pr.id, 'title', pr.title, 'format', pr.format, 'created_at', pr.created_at,
                          'updated_at', pr.updated_at,
                          'collaborator_count', (select count(*) from public.project_collaborators pc where pc.project_id = pr.id),
                          'data', coalesce((select jsonb_object_agg(d.scope, d.data) from public.project_data d where d.project_id = pr.id), '{}'::jsonb))
                          order by pr.created_at)
                        from public.projects pr where pr.owner_id = p_user), '[]'::jsonb),
    'collaborating_on', coalesce((select jsonb_agg(jsonb_build_object('project_id', pc.project_id, 'role', pc.role, 'granted_at', pc.granted_at))
                        from public.project_collaborators pc where pc.user_id = p_user), '[]'::jsonb),
    'shares_created', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'project_id', s.project_id, 'role', s.role,
                          'created_at', s.created_at, 'expires_at', s.expires_at))
                        from public.shares s where s.created_by = p_user), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('project_id', c.project_id, 'scope', c.scope,
                          'field_key', c.field_key, 'body', c.body, 'created_at', c.created_at))
                        from public.comments c where c.author_id = p_user), '[]'::jsonb),
    'support_tickets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'body', t.body,
                          'status', t.status, 'created_at', t.created_at,
                          'notes', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'created_at', n.created_at) order by n.created_at)
                                               from public.support_ticket_notes n where n.ticket_id = t.id), '[]'::jsonb)))
                        from public.support_tickets t where lower(t.email) = em), '[]'::jsonb),
    'email_grant', (select to_jsonb(g) - 'email' from public.email_grants g where g.email = em),
    'on_leads_list', exists (select 1 from public.leads l where lower(l.email) = em)
  );

  perform public.admin_audit_write('user.export', 'user', p_user::text, null,
    jsonb_build_object('projects', jsonb_array_length(out -> 'projects')), null);
  return out;
end;
$fn$;

/** Removes a person: admin_reset_user()'s clean-up (membership, request,
 *  freed redemptions, device lock, sessions) plus their films, team,
 *  payments, tickets, grant and lead row, then the sign-in itself, and
 *  leaves a tombstone. Owner only, audited, and it asks for the person's
 *  e-mail address to be typed back. Refuses yourself, and the last owner.
 *
 *  KEPT, on purpose: invoices (the Bills of Supply are the seller's
 *  statutory record, and invoices has no foreign key to the person);
 *  the audit trail. Both are flagged in the reply. */
create or replace function public.admin_delete_user(p_user uuid, p_confirm_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email    text;
  v_projects int; v_payments int; v_invoices int; v_tickets int; v_leads int;
  v_is_owner boolean;
begin
  perform public.require_role(array['owner']);
  if p_user is null then raise exception 'No user given' using errcode = '22023'; end if;
  if p_user = auth.uid() then
    raise exception 'You cannot delete your own account.' using errcode = '42501';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user;
  if not found then raise exception 'There is no such account.' using errcode = '22023'; end if;
  if v_email is null or v_email = '' then
    raise exception 'That account has no e-mail address to confirm against.' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> v_email then
    raise exception 'The e-mail address typed does not match this account. Nothing was deleted.' using errcode = '22023';
  end if;

  v_is_owner := exists (select 1 from public.studio_members m where m.user_id = p_user and m.role = 'admin' and m.disabled_at is null)
                and coalesce((select r.role from public.admin_roles r where r.user_id = p_user), 'owner') = 'owner';
  if v_is_owner and public._other_owner_count(p_user) = 0 then
    raise exception 'That account is the last owner. Make somebody else an owner first.' using errcode = '42501';
  end if;
  if exists (select 1 from public.accounts a join public.account_members m on m.account_id = a.id
              where a.owner_id = p_user and m.status = 'active' and m.user_id is not null and m.user_id <> p_user) then
    raise exception 'That person owns a team with other active members. Transfer or close the team first.' using errcode = '22023';
  end if;

  select count(*) into v_projects from public.projects where owner_id = p_user;
  select count(*) into v_payments from public.payments where user_id = p_user;
  select count(*) into v_invoices from public.invoices where user_id = p_user;

  -- audited BEFORE the work, inside the same transaction: if the delete
  -- fails the entry rolls back with it.
  perform public.admin_audit_write('user.delete', 'user', p_user::text,
    jsonb_build_object('projects', v_projects, 'payments', v_payments, 'role', case when v_is_owner then 'owner' end), null,
    'data-subject deletion; e-mail confirmed');

  -- references that would otherwise block the delete of the sign-in
  delete from public.shares where created_by = p_user;
  -- comments_set_author pins author_id/author_name on UPDATE (an author must
  -- not be editable by anybody), so it is stood down for this one statement.
  -- ALTER TABLE is transactional: a failure below puts the trigger back.
  alter table public.comments disable trigger comments_set_author;
  update public.comments set author_id = null, author_name = 'Deleted user' where author_id = p_user;
  alter table public.comments enable trigger comments_set_author;
  update public.project_data set updated_by = null where updated_by = p_user;
  update public.account_members set invited_by = null where invited_by = p_user;
  update public.invite_redemptions set viewer_email = null where lower(viewer_email) = v_email;
  delete from public.accounts where owner_id = p_user;

  -- the reset's own clean-up (admin_reset_user), kept explicit
  delete from public.invite_requests      where user_id = p_user;
  delete from public.user_active_sessions where user_id = p_user;
  delete from public.studio_members       where user_id = p_user;

  -- what is keyed by the address rather than the account
  delete from public.support_tickets where lower(email) = v_email;
  get diagnostics v_tickets = row_count;
  delete from public.email_grants    where email = v_email;
  delete from public.leads           where lower(email) = v_email;
  get diagnostics v_leads = row_count;

  insert into public.deleted_subjects (email_hash, deleted_by)
    values (public._email_hash(v_email), auth.uid())
    on conflict (email_hash) do nothing;

  -- the sign-in last; it cascades projects, payments and the rest
  delete from auth.users where id = p_user;

  return jsonb_build_object(
    'deleted', true,
    'projects_removed', v_projects,
    'payments_removed', v_payments,
    'support_tickets_removed', v_tickets,
    'lead_removed', v_leads > 0,
    'tombstone', true,
    'invoices_retained', v_invoices,
    'note', 'Invoices are kept as the seller''s statutory record. The audit entry is kept.'
  );
end;
$fn$;

-- ============================================================
-- 45.7 GRANTS
-- ------------------------------------------------------------
-- The default grants hand every function to anon; take them back, then
-- give each one back to exactly who may call it. site_announcement_now()
-- is the one anon-callable function: it reads one banner row and nothing
-- else.
-- ============================================================
revoke execute on function public.studio_role()                                   from public, anon;
revoke execute on function public.require_role(text[])                            from public, anon;
revoke execute on function public._other_owner_count(uuid)                        from public, anon, authenticated;
revoke execute on function public.admin_roles_keep_an_owner()                     from public, anon, authenticated;
revoke execute on function public.admin_list_roles()                              from public, anon;
revoke execute on function public.admin_set_role(uuid, text)                      from public, anon;
revoke execute on function public.effective_features()                            from public, anon;
revoke execute on function public.admin_set_feature_override(text, text, text, boolean) from public, anon;
revoke execute on function public.admin_list_feature_overrides()                  from public, anon;
revoke execute on function public.site_announcement_now()                         from public;
revoke execute on function public.admin_set_announcement(text, text, timestamptz, timestamptz) from public, anon;
revoke execute on function public.admin_clear_announcement()                      from public, anon;
revoke execute on function public.admin_log_ticket(text, text, text)              from public, anon;
revoke execute on function public.admin_update_ticket(uuid, text, uuid, text, boolean) from public, anon;
revoke execute on function public.admin_list_support(text, int)                   from public, anon;
revoke execute on function public.admin_list_passes()                             from public, anon;
revoke execute on function public.admin_revoke_pass(text)                         from public, anon;
revoke execute on function public.admin_extend_pass(text, int)                    from public, anon;
revoke execute on function public.admin_list_shares()                             from public, anon;
revoke execute on function public.admin_revoke_share(uuid)                        from public, anon;
revoke execute on function public._email_hash(text)                               from public, anon, authenticated;
revoke execute on function public.leads_refuse_tombstoned()                       from public, anon, authenticated;
revoke execute on function public.admin_export_user(uuid)                         from public, anon;
revoke execute on function public.admin_delete_user(uuid, text)                   from public, anon;

grant execute on function public.studio_role()                                    to authenticated;
grant execute on function public.require_role(text[])                             to authenticated;
grant execute on function public.admin_list_roles()                               to authenticated;
grant execute on function public.admin_set_role(uuid, text)                       to authenticated;
grant execute on function public.effective_features()                             to authenticated;
grant execute on function public.admin_set_feature_override(text, text, text, boolean) to authenticated;
grant execute on function public.admin_list_feature_overrides()                   to authenticated;
grant execute on function public.site_announcement_now()                          to anon, authenticated;
grant execute on function public.admin_set_announcement(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_clear_announcement()                       to authenticated;
grant execute on function public.admin_log_ticket(text, text, text)               to authenticated;
grant execute on function public.admin_update_ticket(uuid, text, uuid, text, boolean) to authenticated;
grant execute on function public.admin_list_support(text, int)                    to authenticated;
grant execute on function public.admin_list_passes()                              to authenticated;
grant execute on function public.admin_revoke_pass(text)                          to authenticated;
grant execute on function public.admin_extend_pass(text, int)                     to authenticated;
grant execute on function public.admin_list_shares()                              to authenticated;
grant execute on function public.admin_revoke_share(uuid)                         to authenticated;
grant execute on function public.admin_export_user(uuid)                          to authenticated;
grant execute on function public.admin_delete_user(uuid, text)                    to authenticated;

notify pgrst, 'reload schema';

-- 45.8 CHECKS TO RUN LIVE, none of which has been run live ----------------
--  1. as a member / anon / the wrong role: every admin_* above -> 42501.
--  2. the last owner cannot be demoted or removed; a second owner can.
--  3. admin_set_feature_override with an unknown key -> 22023; a plan
--     override changes that plan's effective_features() and no other's.
--  4. site_announcement_now() as anon -> one row or null, never two.
--  5. admin_list_support() shows tickets, pending refunds and pending invites.
--  6. admin_export_user() for a test account holds nobody else's rows.
--  7. admin_delete_user() on a throwaway account: tombstone present,
--     add_lead() of the same address a silent no-op, and that the auth
--     delete is permitted to the function owner on THIS project (the one
--     step the scratch database cannot prove).
-- Test file: scripts/schema-tests/admin-controls.sql (npm run test:schema).
-- END OF SECTION 45
-- ============================================================
