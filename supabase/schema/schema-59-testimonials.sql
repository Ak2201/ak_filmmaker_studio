-- RUN: owner, in the Supabase SQL editor, AFTER §58 (it needs §45's
--      require_role() and §40's admin_audit_write()). Hash the file first
--      (shasum -a 256 supabase/schema/schema-59-testimonials.sql) and compare
--      it with the editor's contents before pressing Run (docs/LAUNCH.md §4).
--      Re-runnable. No function redeploy. Read back with 59.7 below.
-- ============================================================
-- 59. TESTIMONIALS, WITH CONSENT, THAT THE AUTHOR CAN TAKE BACK
-- ------------------------------------------------------------
-- The public site carries no social proof until a REAL person has said
-- something and agreed to its publication (a fabricated review is
-- prohibited; src/data/testimonials.json says why). This is where a
-- member says it, inside the studio, after sustained real use
-- (src/ui/testimonial-prompt.js), and where the owner reviews it.
--
--   author      the member, always auth.uid(): the column has a default
--               and is NOT in the insert grant, so it cannot be forged.
--   quote, display_name, role, film      what would be shown.
--   consent_text  the exact sentence the author agreed to, as shown.
--   consented_at  set by the database at insert (a trigger), not sent.
--   revoked_at    set by revoke_testimonial(); a revoked row drops out of
--                 public_testimonials() at once and can never be approved
--                 again.
--   status        pending | approved | rejected — only the owner moves it.
--   site_removed_at  set by the OWNER (admin_mark_testimonial_removed)
--                 once a taken-back testimonial is off the public site.
--   first_approved_at  the first time the owner approved it, NEVER cleared.
--                 approved_at follows the status (an un-approved row has
--                 none), but a row approved once may already be copied
--                 onto the site, so the takedown list keys on this one:
--                 approve -> reject -> revoke still lands there.
--
-- WHEN THE AUTHOR'S ACCOUNT IS DELETED (admin_delete_user, or the Supabase
-- dashboard): a deleted account cannot press "take it back", so deletion
-- IS the taking back. A trigger on auth.users, before the row goes:
--   never approved   the testimonial is deleted with the account (it was
--                    never shown, so there is nothing to take down);
--   approved once    revoked_at is stamped, so it leaves
--                    public_testimonials() at once, can never be approved
--                    again, and waits on the takedown list; then the
--                    foreign key sets author to NULL. Its words are kept
--                    ONLY so the owner can find the copy on the site:
--                    marking it off the site deletes the row.
--
-- WHAT "TAKE IT BACK" CAN AND CANNOT DO, said plainly because the consent
-- sentence the author agrees to has to be true: the public site is static
-- and draws testimonials from src/data/testimonials.json, which the owner
-- edits by hand (the console's COPY FOR THE SITE). A revoke therefore
-- cannot reach the site by itself. It does three things at once — hides
-- the row from public_testimonials(), forbids publishing it again, and
-- puts it on the console's Overview under "Needs attention" until the
-- owner has taken the copy down and pressed TAKEN OFF THE SITE (which
-- sets site_removed_at). The words the member agrees to say exactly that
-- (src/lib/testimonials.js consentText()).
--
-- RLS. authenticated may INSERT (only quote, display_name, role, film,
-- consent_text — a column grant, so naming status, author, approved_by or
-- consented_at is 42501) and SELECT, both only where author = auth.uid().
-- No UPDATE and no DELETE grant: the author revokes through
-- revoke_testimonial() (their own row only), the owner decides through
-- admin_set_testimonial_status(). anon has no grant on the table at all
-- and reads published ones through public_testimonials(), which returns
-- the display fields of approved, unrevoked rows and nothing else — no
-- author id, no consent text, no e-mail.
--
-- WHO APPROVES: the console OWNER role (require_role(array[]::text[])).
-- Publishing somebody's words on the public site is a public statement,
-- like the price rise; support and finance can READ the queue
-- (admin_list_testimonials, is_studio_admin) but not publish. Every
-- decision writes an admin_audit row.
--
-- A FLOOD GUARD: at most 5 testimonials per author per day (P0429).
-- ============================================================

do $guard$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'require_role') then
    raise exception 'Section 59 needs section 45 (public.require_role). Run section 45 first.';
  end if;
end
$guard$;

-- 59.1 the table -----------------------------------------------------------
create table if not exists public.testimonials (
  id           uuid        primary key default gen_random_uuid(),
  author       uuid        default auth.uid() references auth.users(id) on delete set null,
  quote        text        not null check (length(btrim(quote)) between 20 and 600),
  display_name text        not null check (length(btrim(display_name)) between 1 and 80),
  role         text        check (role is null or length(role) <= 80),
  film         text        check (film is null or length(film) <= 120),
  consent_text text        not null check (length(btrim(consent_text)) between 20 and 1000),
  consented_at timestamptz not null default now(),
  revoked_at   timestamptz,
  status       text        not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by  uuid        references auth.users(id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.testimonials add column if not exists site_removed_at timestamptz;
alter table public.testimonials add column if not exists first_approved_at timestamptz;
update public.testimonials set first_approved_at = approved_at where first_approved_at is null and approved_at is not null;
/* For a database that ran an earlier draft of this section (author NOT
   NULL, ON DELETE CASCADE): the author may be null once the account is
   gone, and the key no longer takes the row with it. The insert trigger
   below still refuses a null author, so only a deletion can make one. */
alter table public.testimonials alter column author drop not null;
alter table public.testimonials drop constraint if exists testimonials_author_fkey;
alter table public.testimonials add constraint testimonials_author_fkey
  foreign key (author) references auth.users(id) on delete set null;
create index if not exists testimonials_author_idx on public.testimonials (author, created_at desc);
create index if not exists testimonials_status_idx on public.testimonials (status, created_at desc);
alter table public.testimonials enable row level security;
revoke all on public.testimonials from public, anon, authenticated;
grant select on public.testimonials to authenticated;
grant insert (quote, display_name, role, film, consent_text) on public.testimonials to authenticated;

drop policy if exists tm_author_select on public.testimonials;
create policy tm_author_select on public.testimonials for select to authenticated
  using (author = auth.uid());
drop policy if exists tm_author_insert on public.testimonials;
create policy tm_author_insert on public.testimonials for insert to authenticated
  with check (author = auth.uid() and status = 'pending' and revoked_at is null and approved_by is null and approved_at is null);

-- 59.2 the insert trigger: the database's clock, trimmed text, the guard --
create or replace function public.testimonials_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.author is null then raise exception 'Sign in to send a testimonial.' using errcode = '42501'; end if;
  if (select count(*) from public.testimonials t where t.author = new.author and t.created_at > now() - interval '1 day') >= 5 then
    raise exception 'That is plenty for one day. Thank you.' using errcode = 'P0429';
  end if;
  new.quote        := btrim(new.quote);
  new.display_name := btrim(new.display_name);
  new.role         := nullif(btrim(coalesce(new.role, '')), '');
  new.film         := nullif(btrim(coalesce(new.film, '')), '');
  new.consent_text := btrim(new.consent_text);
  new.consented_at := now();
  new.created_at   := now();
  return new;
end;
$fn$;
revoke execute on function public.testimonials_before_insert() from public, anon, authenticated;
drop trigger if exists testimonials_before_insert on public.testimonials;
create trigger testimonials_before_insert before insert on public.testimonials
  for each row execute function public.testimonials_before_insert();

-- 59.3 the author's half ---------------------------------------------------
/* SECURITY INVOKER on purpose: the insert goes through the grant and the
   policy above, exactly as a direct insert would. */
create or replace function public.submit_testimonial(p_quote text, p_display_name text, p_role text, p_film text, p_consent text)
returns public.testimonials
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare r public.testimonials;
begin
  if auth.uid() is null then raise exception 'Sign in to send a testimonial.' using errcode = '42501'; end if;
  insert into public.testimonials (quote, display_name, role, film, consent_text)
  values (p_quote, p_display_name, p_role, p_film, p_consent)
  returning * into r;
  return r;
end;
$fn$;

create or replace function public.my_testimonials()
returns setof public.testimonials
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from public.testimonials where author = auth.uid() order by created_at desc;
$$;

/* Revoking drops it from public_testimonials() at once (the site's own
   copy is the owner's to remove; see the header). A
   second revoke keeps the first time. Somebody else's id is "not found",
   the same answer as an id that does not exist. */
create or replace function public.revoke_testimonial(p_id uuid)
returns public.testimonials
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare r public.testimonials;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  update public.testimonials t set revoked_at = coalesce(t.revoked_at, now())
   where t.id = p_id and t.author = auth.uid()
  returning * into r;
  if r.id is null then raise exception 'No such testimonial of yours.' using errcode = 'P0002'; end if;
  return r;
end;
$fn$;

-- 59.4 what anybody may read ----------------------------------------------
create or replace function public.public_testimonials()
returns table (id uuid, quote text, display_name text, role text, film text, approved_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.quote, t.display_name, t.role, t.film, t.approved_at
    from public.testimonials t
   where t.status = 'approved' and t.revoked_at is null
   order by t.approved_at desc nulls last
   limit 100;
$$;

-- 59.5 the console ---------------------------------------------------------
/* p_status: null (all), pending | approved | rejected (not taken back),
   revoked (taken back, or its account deleted), or takedown — taken back
   after it was EVER approved (first_approved_at, so an approval later
   undone still counts: the copy may be on the site) and not yet marked
   off the site: the owner's to-do, which the
   Overview counts. Dropped first: a re-run over an earlier draft whose
   return table had no site_removed_at would otherwise refuse (42P13). */
drop function if exists public.admin_list_testimonials(text);
create or replace function public.admin_list_testimonials(p_status text default null)
returns table (id uuid, author uuid, author_email text, quote text, display_name text, role text, film text,
               consent_text text, consented_at timestamptz, revoked_at timestamptz, status text,
               approved_by uuid, approved_at timestamptz, created_at timestamptz, site_removed_at timestamptz,
               first_approved_at timestamptz, author_deleted boolean)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select t.id, t.author, u.email::text, t.quote, t.display_name, t.role, t.film, t.consent_text, t.consented_at,
           t.revoked_at, t.status, t.approved_by, t.approved_at, t.created_at, t.site_removed_at,
           t.first_approved_at, t.author is null
      from public.testimonials t
      left join auth.users u on u.id = t.author
     where p_status is null
        or (p_status = 'revoked' and t.revoked_at is not null)
        or (p_status = 'takedown' and t.revoked_at is not null and t.first_approved_at is not null and t.site_removed_at is null)
        or (p_status not in ('revoked', 'takedown') and t.status = p_status and t.revoked_at is null)
     order by t.created_at desc
     limit 1000;
end;
$fn$;

create or replace function public.admin_set_testimonial_status(p_id uuid, p_status text)
returns public.testimonials
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare before_r public.testimonials; r public.testimonials;
begin
  perform public.require_role(array[]::text[]);
  if p_status is null or p_status not in ('pending','approved','rejected') then
    raise exception 'A testimonial is pending, approved or rejected.' using errcode = '22023';
  end if;
  select * into before_r from public.testimonials where id = p_id for update;
  if before_r.id is null then raise exception 'No such testimonial.' using errcode = 'P0002'; end if;
  if before_r.revoked_at is not null then
    raise exception 'The author took this back. It cannot be published.' using errcode = '22023';
  end if;
  update public.testimonials t
     set status = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() end,
         approved_at = case when p_status = 'approved' then now() end,
         first_approved_at = coalesce(t.first_approved_at, case when p_status = 'approved' then now() end)
   where t.id = p_id
  returning * into r;
  perform public.admin_audit_write('testimonial_' || p_status, 'testimonial', p_id::text,
    jsonb_build_object('status', before_r.status), jsonb_build_object('status', r.status), null);
  return r;
end;
$fn$;

/* The owner's word that a taken-back testimonial is off the public site
   (src/data/testimonials.json and anything made from it). Only a
   taken-back row; owner only, like publishing; audited. Idempotent: the
   first time is kept. */
create or replace function public.admin_mark_testimonial_removed(p_id uuid)
returns public.testimonials
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare r public.testimonials;
begin
  perform public.require_role(array[]::text[]);
  select * into r from public.testimonials where id = p_id for update;
  if r.id is null then raise exception 'No such testimonial.' using errcode = 'P0002'; end if;
  if r.revoked_at is null then
    raise exception 'Only a testimonial its author took back is marked off the site.' using errcode = '22023';
  end if;
  update public.testimonials t set site_removed_at = coalesce(t.site_removed_at, now())
   where t.id = p_id returning * into r;
  perform public.admin_audit_write('testimonial_site_removed', 'testimonial', p_id::text, null,
    jsonb_build_object('site_removed_at', r.site_removed_at, 'author_deleted', r.author is null), null);
  -- An account that no longer exists: the words were kept only so the
  -- copy could be found. Off the site, they go. (The audit row keeps the
  -- id and the time, not the words.)
  if r.author is null then
    delete from public.testimonials t where t.id = p_id;
  end if;
  return r;
end;
$fn$;

-- 59.5b an account deleted: deletion is the taking back ----------------------
/* BEFORE DELETE on auth.users, so it runs whichever way the account goes
   (admin_delete_user, the dashboard, the auth admin API). Never-approved
   rows go with the account; ever-approved ones are revoked and kept for
   the takedown list, and the foreign key then sets their author to null. */
create or replace function public.testimonials_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  delete from public.testimonials t where t.author = old.id and t.first_approved_at is null;
  update public.testimonials t set revoked_at = coalesce(t.revoked_at, now())
   where t.author = old.id;
  return old;
end;
$fn$;
revoke execute on function public.testimonials_on_user_delete() from public, anon, authenticated;
drop trigger if exists testimonials_on_user_delete on auth.users;
create trigger testimonials_on_user_delete before delete on auth.users
  for each row execute function public.testimonials_on_user_delete();

-- 59.6 grants --------------------------------------------------------------
revoke execute on function public.submit_testimonial(text, text, text, text, text) from public, anon;
revoke execute on function public.my_testimonials()                              from public, anon;
revoke execute on function public.revoke_testimonial(uuid)                       from public, anon;
revoke execute on function public.public_testimonials()                          from public;
revoke execute on function public.admin_list_testimonials(text)                  from public, anon;
revoke execute on function public.admin_set_testimonial_status(uuid, text)       from public, anon;
revoke execute on function public.admin_mark_testimonial_removed(uuid)           from public, anon;
grant  execute on function public.submit_testimonial(text, text, text, text, text) to authenticated;
grant  execute on function public.my_testimonials()                              to authenticated;
grant  execute on function public.revoke_testimonial(uuid)                       to authenticated;
grant  execute on function public.public_testimonials()                          to anon, authenticated;
grant  execute on function public.admin_list_testimonials(text)                  to authenticated;
grant  execute on function public.admin_set_testimonial_status(uuid, text)       to authenticated;
grant  execute on function public.admin_mark_testimonial_removed(uuid)           to authenticated;

notify pgrst, 'reload schema';

-- 59.7 CHECKS TO RUN LIVE (read-only, as the owner in the SQL editor) ----
-- select relrowsecurity from pg_class where oid = 'public.testimonials'::regclass;   -> true
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'testimonials' order by 1, 2;    -> authenticated SELECT only (INSERT is per column)
-- select grantee, column_name from information_schema.column_privileges
--  where table_name = 'testimonials' and privilege_type = 'INSERT' order by 2;
--    -> authenticated: consent_text, display_name, film, quote, role
-- select count(*) from public.public_testimonials();   -> 0 until one is approved
-- select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'testimonials_on_user_delete';   -> one row
-- select confdeltype from pg_constraint where conname = 'testimonials_author_fkey';   -> n (SET NULL, not CASCADE)
-- select count(*) from public.testimonials where approved_at is not null and first_approved_at is null;   -> 0
-- Scratch-database checks: scripts/schema-tests/testimonials.sql (npm run test:schema);
-- the two-account RLS checks: docs/SECURITY-RLS.md §59.
-- ============================================================
