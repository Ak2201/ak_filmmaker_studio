-- ============================================================
-- 55. KEEP THE BUDGET PRIVATE   NOT YET RUN LIVE
-- ------------------------------------------------------------
-- 22 Oct 2026, owner decision. A per-film, OWNER-ONLY switch. When it is
-- ON, the budget — the two project_data scopes
--
--   'library'  fms_library_calc_v1   the estimate
--   'costs'    fms_costs_v1          petty cash, crew payments, cost report
--
-- is readable and writable only by the film's owner and an 'edit'
-- collaborator whose grant has not expired (has_budget_access, 55.3). An
-- owner/admin of the organisation account the film sits in is NOT admitted
-- to a private budget, although has_project_access gives them every other
-- scope (§6): the owner's words were "only the owner and edit
-- collaborators". A 'view' or 'comment' collaborator loses READ on those
-- two scopes and nothing else. OFF (the default for every film, old and
-- new) changes nothing at all.
--
-- WHAT IT DOES NOT HIDE. The blueprints' own budget questions live inside
-- the 'feature' scope (v2s11_total / _atl / _btl / _post / _cont /
-- _largest / _expday) and the 'short' scope (s10_budget). RLS gates rows,
-- never keys inside a row, so those answers stay readable by everyone the
-- film is shared with, and screening_open() returns 'feature' and 'short'
-- to a screening pass. The client's copy names the budget PAGE (estimate,
-- petty cash, crew payments, cost report) and says the blueprint's budget
-- step stays visible; schema-tests/budget-private.sql asserts it.
--
-- What it touches, and why each one:
--
--   projects.budget_private            the switch; not null default false
--   projects_guard_budget_private      BEFORE UPDATE trigger: only the owner
--                                      (or the service role / SQL editor)
--                                      may change it. proj_update lets an
--                                      'edit' collaborator write the row,
--                                      and RLS gates rows, never columns —
--                                      a policy alone cannot stop an editor
--                                      flipping it (same shape as §5's
--                                      projects_guard_owner).
--   set_budget_private(uuid, boolean)  the owner's RPC; 42501 for anyone else
--   budget_privacy(uuid)               what the client reads: private,
--                                      visible (to me), can_change (am I the
--                                      owner). null when I cannot see the film.
--   has_budget_access(uuid)            owner, or an unexpired 'edit' row
--   has_scope_access(uuid,text,text)   the one rule: a budget scope on a
--                                      private film needs has_budget_access;
--                                      every
--                                      other (scope, film) is exactly
--                                      has_project_access(pid, min_role).
--   pd_select / pd_write               project_data, re-pointed at it. This is
--                                      also Realtime: postgres_changes
--                                      delivers a row to a subscriber only
--                                      if pd_select admits it.
--   cm_select / cm_insert / cm_update  comments carry a scope and a field key,
--                                      and a suggestion carries the value; a
--                                      thread on a budget field follows the
--                                      budget.
--
-- What it does NOT need to touch (every other read of project_data was
-- checked on 22 Oct 2026):
--   screening_open()        returns only story/feature/short/scenes — the
--                           budget was never in a screening pass.
--   admin export (§45), Customer 360 (§42), sync limits (§44), usage (§43)
--                           administrator-only; they read the OWNER's own
--                           films, never a collaborator's view.
--   presence (§48)          carries who is here, never project_data.
--
-- Before this runs the client must read the column / RPC as absent and
-- treat every film as "not private" (hide the switch). After it runs,
-- nothing changes until an owner turns a film's switch on.
--
-- ORDER: after §54. Needs has_project_access (§7.2), project_owner_is_caller
-- and is_privileged_caller (supabase-schema.sql) and §10.2's cm_update. Restates pd_select, pd_write,
-- cm_select, cm_insert and cm_update — no later section restates them, so
-- running an EARLIER file after this one would put the unguarded policies
-- back (README "Never replay an EARLIER file"). Re-runnable. No edge
-- function redeploy.
-- ============================================================

-- 55.1 the switch ------------------------------------------------------------
alter table public.projects add column if not exists budget_private boolean not null default false;

-- 55.2 the budget scopes, named once -----------------------------------------
create or replace function public.is_budget_scope(p_scope text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select p_scope in ('library', 'costs'); $$;
grant execute on function public.is_budget_scope(text) to anon, authenticated;

-- 55.3 the one rule ------------------------------------------------------------
-- security definer: it reads projects.budget_private whatever the caller's
-- own row visibility is, like has_project_access does. It leaks a boolean.
--
-- A PRIVATE BUDGET IS THE OWNER'S AND THE EDIT LINKS', AND NOBODY ELSE'S
-- (owner, 22 Oct 2026: "ONLY the project owner and collaborators whose role
-- is 'edit'"). That is narrower than has_project_access(pid, 'edit'), which
-- also admits the active owner/admin of the film's organisation account
-- with no collaborator row at all — so the budget branch spells the two
-- admitted groups out instead of calling it. The collaborator half carries
-- §7.2's expiry test: a lapsed edit link is not an edit link.
create or replace function public.has_budget_access(pid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
     where p.id = pid and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_collaborators c
     where c.project_id = pid
       and c.user_id    = auth.uid()
       and c.role       = 'edit'
       and (c.expires_at is null or c.expires_at > now())
  );
$$;
grant execute on function public.has_budget_access(uuid) to anon, authenticated;

create or replace function public.has_scope_access(pid uuid, p_scope text, min_role text default 'view')
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case
           when public.is_budget_scope(p_scope)
                and coalesce((select p.budget_private from public.projects p where p.id = pid), false)
             then public.has_budget_access(pid)
           else public.has_project_access(pid, min_role)
         end;
$$;
grant execute on function public.has_scope_access(uuid, text, text) to anon, authenticated;

-- 55.4 only the owner changes it ----------------------------------------------
create or replace function public.projects_guard_budget_private()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.budget_private is distinct from old.budget_private
     and not public.is_privileged_caller()
     and old.owner_id is distinct from auth.uid() then
    raise exception 'Only the film''s owner can change who sees the budget' using errcode = '42501';
  end if;
  return new;
end;
$fn$;
drop trigger if exists projects_guard_budget_private on public.projects;
create trigger projects_guard_budget_private
  before update on public.projects
  for each row execute function public.projects_guard_budget_private();

create or replace function public.set_budget_private(p_project uuid, p_private boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_owner uuid;
begin
  if p_private is null then
    raise exception 'Say on or off' using errcode = '22023';
  end if;
  select p.owner_id into v_owner from public.projects p where p.id = p_project;
  -- One answer for "not yours" and "no such film": the second would be an
  -- oracle for film ids.
  if auth.uid() is null or v_owner is null or v_owner <> auth.uid() then
    raise exception 'Only the film''s owner can change who sees the budget' using errcode = '42501';
  end if;
  update public.projects p set budget_private = p_private where p.id = p_project;
  return p_private;
end;
$fn$;
revoke execute on function public.set_budget_private(uuid, boolean) from public, anon;
grant  execute on function public.set_budget_private(uuid, boolean) to authenticated;

-- 55.5 what the client reads ---------------------------------------------------
-- {private, visible, can_change}; null when the caller cannot see the film
-- at all (so a stranger learns nothing, not even "it is private").
create or replace function public.budget_privacy(p_project uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case
           when not public.has_project_access(p_project, 'view') then null
           else jsonb_build_object(
                  'private',    coalesce(p.budget_private, false),
                  'visible',    public.has_scope_access(p_project, 'library', 'view'),
                  'can_change', p.owner_id = auth.uid())
         end
    from public.projects p
   where p.id = p_project;
$$;
revoke execute on function public.budget_privacy(uuid) from public, anon;
grant  execute on function public.budget_privacy(uuid) to authenticated;

-- 55.6 project_data ------------------------------------------------------------
-- pd_write's rule was already 'edit' for every scope, which is exactly the
-- budget rule; it is restated through the same function so the two
-- policies cannot drift apart.
drop policy if exists pd_select on public.project_data;
create policy pd_select on public.project_data
  for select using (public.has_scope_access(project_id, scope, 'view'));

drop policy if exists pd_write on public.project_data;
create policy pd_write on public.project_data
  for all
  using      (public.has_scope_access(project_id, scope, 'edit'))
  with check (public.has_scope_access(project_id, scope, 'edit'));

-- 55.7 comments on a budget field ---------------------------------------------
-- Bodies are §1's cm_select / cm_insert and §10.2's cm_update with
-- has_project_access(project_id, r) replaced by has_scope_access(project_id, scope, r).
drop policy if exists cm_select on public.comments;
create policy cm_select on public.comments
  for select using (public.has_scope_access(project_id, scope, 'view'));

drop policy if exists cm_insert on public.comments;
create policy cm_insert on public.comments
  for insert with check (
    public.has_scope_access(project_id, scope, 'comment')
    and author_id = auth.uid()
  );

drop policy if exists cm_update on public.comments;
create policy cm_update on public.comments
  for update
  using (
    author_id = auth.uid() or public.project_owner_is_caller(project_id)
  )
  with check (
    public.has_scope_access(project_id, scope, 'comment')
    and (author_id = auth.uid() or public.project_owner_is_caller(project_id))
  );

notify pgrst, 'reload schema';

-- 55.8 CHECKS TO RUN LIVE (read-only) ------------------------------------------
-- select column_default, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'projects' and column_name = 'budget_private';
--                                                                    -> false | NO
-- select count(*) from public.projects where budget_private;          -> 0 (nobody has turned it on yet)
-- select polname, pg_get_expr(polqual, polrelid) from pg_policy
--  where polrelid = 'public.project_data'::regclass order by polname;
--                                                                    -> pd_select / pd_write, both has_scope_access(...)
-- select pg_get_expr(polqual, polrelid) from pg_policy
--  where polrelid = 'public.comments'::regclass and polname = 'cm_select';
--                                                                    -> has_scope_access(project_id, scope, 'view'::text)
-- select tgname from pg_trigger where tgrelid = 'public.projects'::regclass and tgname = 'projects_guard_budget_private';
--                                                                    -> one row
-- select has_function_privilege('anon', 'public.set_budget_private(uuid, boolean)', 'execute');
--                                                                    -> false
-- THE REGRESSION PROBE. Replaying supabase-schema.sql (or its §1 / §9 / §10)
-- after this file puts the unguarded policies back without an error. This
-- read says so; anything but 5 means re-run §55:
-- select count(*) from pg_policy
--  where (polrelid = 'public.project_data'::regclass and polname in ('pd_select', 'pd_write')
--      or polrelid = 'public.comments'::regclass and polname in ('cm_select', 'cm_insert', 'cm_update'))
--    and coalesce(pg_get_expr(polwithcheck, polrelid), pg_get_expr(polqual, polrelid)) like '%has_scope_access(project_id, scope%';
--                                                                    -> 5
