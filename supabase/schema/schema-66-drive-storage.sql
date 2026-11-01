-- RUN: owner, in the Supabase SQL editor, AFTER §65. Hash the file first
--      (shasum -a 256 supabase/schema/schema-66-drive-storage.sql), base64
--      it across the clipboard and compare the editor's SHA-256 with the
--      file's before pressing Run (CLAUDE.md, "PASTING SQL THROUGH THE
--      CLIPBOARD CORRUPTS IT"; docs/LIVE-STEPS-2026-10-31.md §3).
--      Re-runnable. Needs §40 (admin_audit_write) and §45 (require_role).
-- ============================================================
-- 66. DRIVE-ONLY STORAGE: THE SERVER HALF, AND THE FIRST-EVER TOUR
-- ------------------------------------------------------------
-- docs/DRIVE-STORAGE.md is the design. In one breath: a film's content
-- moves to its owner's own Google Drive, one folder per project, and
-- this database keeps who people are, what they paid for, the gate and
-- the console. NOTHING CHANGES LIVE until the owner flips
-- billing_settings.storage_mode to 'drive' from the console; while it
-- reads 'supabase' (the default) every sync path is what it was.
--
--   66.1 storage_mode            the switch, read by anyone, set by the owner
--   66.2 google_tokens           a server-held Google refresh token per
--                                person, ENCRYPTED by the google-token edge
--                                function (AES-256-GCM, key in a function
--                                secret, the user id as AAD). No client
--                                role may read the table at all; the
--                                function reaches it with the service role.
--   66.3 account_profile         the account's "first ever sign-in" flag for
--                                the studio tour, true exactly once across
--                                every device
--   66.4 screening passes        a pass may point at a Drive file (a
--                                read-only export) instead of a project row
--   66.5 the migration RPCs      copy-verify-delete, owner only, drive mode
--                                only: a server row is deleted only when
--                                the client hands back EXACTLY what it read
--   66.6 admin_storage_overview  counts for the console, never content
--
-- ORDER. The client is safe before this runs: get_storage_mode() missing
-- reads as 'supabase', mark_tour_started() missing falls back to the
-- device-local tour rule, and google-token answers 503 until its secrets
-- are set. Run this, deploy google-token, THEN flip the switch.
-- ============================================================

begin;

-- 66.1 THE SWITCH ---------------------------------------------------------
-- On the one settings row the studio has, beside co_editing_enabled (§49)
-- and purchase_required (§32). It is not about billing.
alter table public.billing_settings
  add column if not exists storage_mode text not null default 'supabase'
  constraint billing_settings_storage_mode_check check (storage_mode in ('supabase', 'drive'));

/** 'supabase' | 'drive'. Anyone may ask, signed in or not: start.html asks
 *  it with a bare fetch to decide whether sign-in requests offline access.
 *  A missing row reads as 'supabase', the side that changes nothing. */
create or replace function public.get_storage_mode()
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$ select coalesce((select s.storage_mode from public.billing_settings s where s.id), 'supabase'); $$;

/** The owner's switch, audited like §49's. Flipping back to 'supabase' is
 *  the rollback: content already moved stays in Drive, and the clients
 *  re-upload from their local copies on the next sign-in. */
create or replace function public.admin_set_storage_mode(p_mode text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_old text; v_new text := lower(btrim(coalesce(p_mode, '')));
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['owner']);
  if v_new not in ('supabase', 'drive') then
    raise exception 'The storage mode is supabase or drive' using errcode = '22023';
  end if;
  select s.storage_mode into v_old from public.billing_settings s where s.id;
  update public.billing_settings s set storage_mode = v_new, updated_at = now(), updated_by = auth.uid() where s.id;
  perform public.admin_audit_write('set_storage_mode', 'setting', 'storage_mode',
    jsonb_build_object('mode', v_old), jsonb_build_object('mode', v_new));
  return v_new;
end;
$fn$;

revoke execute on function public.get_storage_mode()            from public;
grant  execute on function public.get_storage_mode()            to anon, authenticated;
revoke execute on function public.admin_set_storage_mode(text)  from public, anon;
grant  execute on function public.admin_set_storage_mode(text)  to authenticated;

-- 66.2 GOOGLE REFRESH TOKENS ----------------------------------------------
-- Account data, not content: the grant that lets the google-token function
-- mint a fresh access token silently, so Drive keeps working after the
-- one-hour sign-in grant runs out (DRIVE-STORAGE.md, "Token renewal").
-- enc_refresh is base64(iv[12] || AES-256-GCM ciphertext + tag); the
-- plaintext never reaches this database, and the key never leaves the
-- function's secrets. Deleting the person (admin_delete_user, §45/§47)
-- drops the row with the sign-in.
create table if not exists public.google_tokens (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  enc_refresh text        not null check (length(enc_refresh) between 40 and 8192),
  scope       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.google_tokens enable row level security;
-- NO policy and NO grant: not even the owner of the token may select it.
-- The ciphertext is useless without the key, and the cheapest leak to
-- prevent is the one nobody can make.
revoke all on public.google_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.google_tokens to service_role;

/** Whether this account has a stored grant, and when it was last renewed.
 *  Never the token, never the ciphertext. */
create or replace function public.google_token_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare r public.google_tokens;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into r from public.google_tokens g where g.user_id = auth.uid();
  return jsonb_build_object('has_token', r.user_id is not null, 'updated_at', r.updated_at, 'scope', r.scope);
end;
$fn$;
revoke execute on function public.google_token_status() from public, anon;
grant  execute on function public.google_token_status() to authenticated;

-- 66.3 THE FIRST-EVER TOUR --------------------------------------------------
-- "The first time an account EVER signs in, on any device, the tour starts
-- by itself" (owner, 31 Oct 2026). The device's own progress stays in
-- fms_tour_v1; THIS is only the once-per-account flag, so a second laptop
-- does not tour a person who has already been toured.
--
-- THE BACKFILL RUNS ONCE, when the table is first made: every account that
-- exists now has already signed in, and "first ever" must not tour them.
-- A re-run must NOT backfill again, or everybody who signed up between the
-- two runs would lose a tour they never had.
do $do$
declare fresh boolean := to_regclass('public.account_profile') is null;
begin
  create table if not exists public.account_profile (
    user_id          uuid        primary key references auth.users(id) on delete cascade,
    tour_started_at  timestamptz,
    tour_finished_at timestamptz,
    created_at       timestamptz not null default now()
  );
  if fresh then
    insert into public.account_profile (user_id, tour_started_at)
    select u.id, now() from auth.users u
    on conflict (user_id) do nothing;
  end if;
end
$do$;
alter table public.account_profile enable row level security;
revoke all on public.account_profile from public, anon, authenticated;
grant select on public.account_profile to authenticated;
grant select, insert, update, delete on public.account_profile to service_role;
drop policy if exists account_profile_own_select on public.account_profile;
create policy account_profile_own_select on public.account_profile
  for select to authenticated using (user_id = auth.uid());

/** True EXACTLY ONCE per account, across every device and every tab: the
 *  first caller's insert (or its fill of a null start) is the only one that
 *  returns a row. The client starts the tour on true. */
create or replace function public.mark_tour_started()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.account_profile as a (user_id, tour_started_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set tour_started_at = now()
    where a.tour_started_at is null
  returning true into v;
  return coalesce(v, false);
end;
$fn$;

create or replace function public.mark_tour_finished()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.account_profile as a (user_id, tour_started_at, tour_finished_at)
  values (auth.uid(), now(), now())
  on conflict (user_id) do update
    set tour_started_at  = coalesce(a.tour_started_at, now()),
        tour_finished_at = coalesce(a.tour_finished_at, now())
  returning a.tour_finished_at into v;
  return v;
end;
$fn$;

create or replace function public.tour_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare r public.account_profile;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into r from public.account_profile a where a.user_id = auth.uid();
  return jsonb_build_object('started_at', r.tour_started_at, 'finished_at', r.tour_finished_at);
end;
$fn$;

revoke execute on function public.mark_tour_started()  from public, anon;
revoke execute on function public.mark_tour_finished() from public, anon;
revoke execute on function public.tour_status()        from public, anon;
grant  execute on function public.mark_tour_started()  to authenticated;
grant  execute on function public.mark_tour_finished() to authenticated;
grant  execute on function public.tour_status()        to authenticated;

-- 66.4 SCREENING PASSES THAT POINT AT DRIVE ----------------------------------
-- In drive mode a pass carries no content: the owner's client writes
-- screening-<passId>.json into the film's folder, shares THAT FILE with
-- anyone-with-the-link as a reader, and records the file id here. The pass
-- (code, expiry, open count, the viewer log) stays the gate: the file id is
-- only ever handed out by screening_open(), which refuses an expired,
-- revoked or used-up pass exactly as before.
alter table public.invite_codes add column if not exists drive_file_id text
  constraint invite_codes_drive_file_shape check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$');
alter table public.invite_codes add column if not exists drive_title  text;
alter table public.invite_codes add column if not exists drive_format text;
-- §13 said "a screening pass is FOR a project". It may now be for a Drive
-- file, and a pass made in drive mode has no project row to point at; a
-- standard code still points at nothing.
alter table public.invite_codes drop constraint if exists invite_codes_target_check;
alter table public.invite_codes add constraint invite_codes_target_check check (
  pass_type = 'screening_pass' or (target_project_id is null and drive_file_id is null)
);

/** The owner of a pass attaches (or, with null, detaches) the Drive export
 *  it opens. Only in drive mode: in supabase mode screening_open() serves
 *  the synced scopes and a file id would hide them. */
create or replace function public.screening_set_drive_file(p_pass uuid, p_file_id text, p_title text default null, p_format text default null)
returns public.invite_codes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare c public.invite_codes;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into c from public.invite_codes ic where ic.id = p_pass for update;
  if c.id is null or c.pass_type <> 'screening_pass' then
    raise exception 'That is not a screening pass' using errcode = '22023';
  end if;
  if c.created_by is distinct from auth.uid()
     and not exists (select 1 from public.projects p where p.id = c.target_project_id and p.owner_id = auth.uid()) then
    raise exception 'Only the person who made this pass can change what it opens.' using errcode = '42501';
  end if;
  if p_file_id is not null and public.get_storage_mode() <> 'drive' then
    raise exception 'Screening passes open a Drive file only when films are kept in Google Drive.' using errcode = '55000';
  end if;
  if p_file_id is not null and c.revoked_at is not null then
    raise exception 'That pass has been revoked' using errcode = '22023';
  end if;
  update public.invite_codes ic
     set drive_file_id = nullif(btrim(p_file_id), ''),
         drive_title   = case when p_file_id is null then null else left(nullif(btrim(coalesce(p_title, '')), ''), 200) end,
         drive_format  = case when p_file_id is null then null else left(nullif(btrim(coalesce(p_format, '')), ''), 32) end
   where ic.id = c.id
  returning * into c;
  return c;
end;
$fn$;
revoke execute on function public.screening_set_drive_file(uuid, text, text, text) from public, anon;
grant  execute on function public.screening_set_drive_file(uuid, text, text, text) to authenticated;

-- §13.6's screening_open, restated: one more column (drive_file_id), and a
-- pass that has one returns it INSTEAD of the scopes. A pass with neither a
-- project nor a file opens nothing and is refused like any invalid pass.
-- The return type grew, so the old function is dropped first.
drop function if exists public.screening_open(text, text);
create function public.screening_open(p_code text, p_viewer_email text default null)
returns table (project_id uuid, title text, format text, access_id text,
               expires_at timestamptz, scopes jsonb, drive_file_id text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  c   public.invite_codes;
  aid text;
begin
  select * into c from public.invite_codes ic where ic.code = public.normalise_code(p_code) for update;
  if c.id is null or c.pass_type <> 'screening_pass'
     or c.revoked_at is not null
     or c.expires_at is null or c.expires_at <= now()
     or c.redemptions_count >= c.max_redemptions
     or (c.target_project_id is null and c.drive_file_id is null) then
    raise exception 'That screening pass is not valid' using errcode = '22023';
  end if;
  aid := upper(encode(gen_random_bytes(4), 'hex'));
  update public.invite_codes ic set redemptions_count = ic.redemptions_count + 1 where ic.id = c.id;
  insert into public.invite_redemptions (code_id, viewer_email, access_id)
  values (c.id, nullif(left(lower(trim(coalesce(p_viewer_email, ''))), 255), ''), aid);
  if c.drive_file_id is not null then
    return query
      select c.target_project_id,
             coalesce(c.drive_title, p.title, 'Untitled Project'),
             coalesce(c.drive_format, p.format, 'feature'),
             aid, c.expires_at, null::jsonb, c.drive_file_id
        from (select 1) one
        left join public.projects p on p.id = c.target_project_id;
    return;
  end if;
  return query
    select p.id, p.title, p.format, aid, c.expires_at,
           coalesce((select jsonb_object_agg(d.scope, d.data)
                       from public.project_data d
                      where d.project_id = p.id
                        and d.scope in ('story','feature','short','scenes')), '{}'::jsonb),
           null::text
      from public.projects p
     where p.id = c.target_project_id;
end;
$fn$;
revoke execute on function public.screening_open(text, text) from public;
grant  execute on function public.screening_open(text, text) to anon, authenticated;

-- 66.5 MOVING EXISTING FILMS TO DRIVE --------------------------------------
-- The client copies each scope to Drive, READS IT BACK, compares canonical
-- hashes, and only then asks for the server row to go — handing back the
-- very JSON it read. drive_migrate_delete_scope() deletes ONLY when the row
-- still equals that payload (jsonb equality: key order and whitespace do
-- not matter, a changed value does), so an edit that landed between the
-- read and the delete survives and the client goes round again. Nothing is
-- deleted before the read-back matches, and a run killed anywhere resumes:
-- every step is idempotent.
--
-- All of them: owner only (projects.owner_id = auth.uid()), drive mode only.
-- A collaborator's films are moved by their owner, never by them.

create or replace function public._drive_migrate_guard(p_project uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if public.get_storage_mode() <> 'drive' then
    raise exception 'Films are kept on the studio server at the moment; nothing is moved to Drive.' using errcode = '55000';
  end if;
  if p_project is not null
     and not exists (select 1 from public.projects p where p.id = p_project and p.owner_id = auth.uid()) then
    raise exception 'Only the film''s owner can move it to Drive.' using errcode = '42501';
  end if;
end;
$fn$;
revoke execute on function public._drive_migrate_guard(uuid) from public, anon, authenticated;

/** What this person owns on the server: ids, titles, scope NAMES. No data. */
create or replace function public.drive_migrate_list()
returns table (project_id uuid, title text, format text, scopes text[],
               comments int, collaborators int, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._drive_migrate_guard(null);
  return query
    select p.id, p.title, p.format,
           coalesce((select array_agg(d.scope order by d.scope) from public.project_data d where d.project_id = p.id), '{}'::text[]),
           (select count(*)::int from public.comments c where c.project_id = p.id),
           (select count(*)::int from public.project_collaborators pc where pc.project_id = p.id),
           p.updated_at
      from public.projects p
     where p.owner_id = auth.uid()
     order by p.updated_at desc;
end;
$fn$;

create or replace function public.drive_migrate_read(p_project uuid, p_scope text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._drive_migrate_guard(p_project);
  return (select d.data from public.project_data d where d.project_id = p_project and d.scope = p_scope);
end;
$fn$;

/** Deletes the row only if it still equals p_data. False: it changed (or is
 *  already gone) — read it again. A null payload never matches. */
create or replace function public.drive_migrate_delete_scope(p_project uuid, p_scope text, p_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._drive_migrate_guard(p_project);
  if p_data is null then return false; end if;
  delete from public.project_data d
   where d.project_id = p_project and d.scope = p_scope and d.data = p_data;
  return found;
end;
$fn$;

/** The people a film is shared with, for the client to share the Drive
 *  folder with: e-mail and role (view | comment | edit). */
create or replace function public.drive_migrate_collaborators(p_project uuid)
returns table (email text, role text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._drive_migrate_guard(p_project);
  return query
    select lower(u.email)::text, pc.role::text
      from public.project_collaborators pc
      join auth.users u on u.id = pc.user_id
     where pc.project_id = p_project and u.email is not null
     order by 1;
end;
$fn$;

/** Deletes the named comments of one film, and NOTHING the client did not
 *  name: a comment with a reply the client never saw (posted after its
 *  read) is kept, because deleting a parent cascades to its replies.
 *  Returns how many went. */
create or replace function public.drive_migrate_delete_comments(p_project uuid, p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n int;
begin
  perform public._drive_migrate_guard(p_project);
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  with recursive unseen as (            -- comments the client did not name
    select c.id, c.parent_id from public.comments c
     where c.project_id = p_project and not (c.id = any(p_ids))
  ), above(id) as (                     -- every ancestor of one of them
    select u.parent_id from unseen u where u.parent_id is not null
    union
    select c.parent_id from public.comments c join above a on c.id = a.id where c.parent_id is not null
  )
  delete from public.comments c
   where c.project_id = p_project and c.id = any(p_ids)
     and c.id not in (select a.id from above a);
  get diagnostics n = row_count;
  return n;
end;
$fn$;

/** The last step, refused while any content row remains. Shares and
 *  collaborators go (the Drive folder's permissions replace both), then the
 *  project row. A screening pass that already opens a Drive file is kept
 *  (unlinked from the row); one that still served the synced scopes has
 *  nothing left to show and is revoked, with its viewer log kept. */
create or replace function public.drive_migrate_finish(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n_data int; n_comments int; n_shares int; n_collab int; n_kept int; n_revoked int;
begin
  perform public._drive_migrate_guard(p_project);
  perform 1 from public.projects p where p.id = p_project for update;
  select count(*) into n_data from public.project_data d where d.project_id = p_project;
  select count(*) into n_comments from public.comments c where c.project_id = p_project;
  if n_data > 0 or n_comments > 0 then
    raise exception 'This film still has % scope(s) and % comment(s) on the server; they are moved and checked first.', n_data, n_comments
      using errcode = 'P0001';
  end if;
  update public.invite_codes ic set target_project_id = null
   where ic.target_project_id = p_project and ic.drive_file_id is not null;
  get diagnostics n_kept = row_count;
  update public.invite_codes ic set target_project_id = null, revoked_at = coalesce(ic.revoked_at, now())
   where ic.target_project_id = p_project and ic.drive_file_id is null;
  get diagnostics n_revoked = row_count;
  delete from public.shares s where s.project_id = p_project;
  get diagnostics n_shares = row_count;
  delete from public.project_collaborators pc where pc.project_id = p_project;
  get diagnostics n_collab = row_count;
  delete from public.projects p where p.id = p_project;
  return jsonb_build_object('project_id', p_project, 'shares', n_shares, 'collaborators', n_collab,
                            'passes_kept', n_kept, 'passes_revoked', n_revoked);
end;
$fn$;

revoke execute on function public.drive_migrate_list()                              from public, anon;
revoke execute on function public.drive_migrate_read(uuid, text)                    from public, anon;
revoke execute on function public.drive_migrate_delete_scope(uuid, text, jsonb)     from public, anon;
revoke execute on function public.drive_migrate_collaborators(uuid)                 from public, anon;
revoke execute on function public.drive_migrate_delete_comments(uuid, uuid[])       from public, anon;
revoke execute on function public.drive_migrate_finish(uuid)                        from public, anon;
grant  execute on function public.drive_migrate_list()                              to authenticated;
grant  execute on function public.drive_migrate_read(uuid, text)                    to authenticated;
grant  execute on function public.drive_migrate_delete_scope(uuid, text, jsonb)     to authenticated;
grant  execute on function public.drive_migrate_collaborators(uuid)                 to authenticated;
grant  execute on function public.drive_migrate_delete_comments(uuid, uuid[])       to authenticated;
grant  execute on function public.drive_migrate_finish(uuid)                        to authenticated;

-- 66.6 THE CONSOLE'S VIEW -------------------------------------------------
-- Counts only. In drive mode the console can no longer open anybody's
-- writing, and that is the point of the change.
create or replace function public.admin_storage_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['owner', 'finance', 'support']);
  return jsonb_build_object(
    'mode',                    public.get_storage_mode(),
    'users',                   (select count(*) from auth.users),
    'users_with_token',        (select count(*) from public.google_tokens),
    'projects_on_server',      (select count(*) from public.projects),
    'owners_on_server',        (select count(distinct p.owner_id) from public.projects p),
    'scopes_on_server',        (select count(*) from public.project_data),
    'comments_on_server',      (select count(*) from public.comments),
    'drive_screening_passes',  (select count(*) from public.invite_codes ic where ic.drive_file_id is not null and ic.revoked_at is null),
    'toured_accounts',         (select count(*) from public.account_profile a where a.tour_started_at is not null)
  );
end;
$fn$;
revoke execute on function public.admin_storage_overview() from public, anon;
grant  execute on function public.admin_storage_overview() to authenticated;

commit;
