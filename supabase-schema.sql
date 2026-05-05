-- ============================================================
-- THE FILMMAKER'S STUDIO — SUPABASE SCHEMA (v3)
-- ------------------------------------------------------------
-- Run this ONCE in your Supabase project's SQL editor.
-- (https://supabase.com/dashboard → your project → SQL Editor → New Query → paste → Run)
--
-- Before running, in Authentication → URL Configuration:
--   Site URL:           https://ak-filmmaker-studio.vercel.app
--   Redirect URLs:      https://ak-filmmaker-studio.vercel.app/*
--                       http://localhost:*
--
-- And in Authentication → Providers:
--   - Enable Email (magic link is on by default)
--   - Enable Google (paste your OAuth client ID + secret from Google Cloud Console)
-- ============================================================

-- ============================================================
-- 1. PROJECTS — one row per film/short/doc/etc.
-- ============================================================
create table if not exists public.projects (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default 'Untitled Project',
  format      text        not null default 'feature'
              check (format in ('feature','short','documentary','musicvideo','adfilm')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_owner_idx on public.projects(owner_id);

-- ============================================================
-- 2. PROJECT_DATA — one row per (project, scope)
-- Mirrors the localStorage-scoped keys in studio-store.js.
-- ============================================================
create table if not exists public.project_data (
  project_id  uuid        not null references public.projects(id) on delete cascade,
  scope       text        not null
              check (scope in (
                'feature','short','library',
                'feature_prefs','short_prefs','library_prefs','activity'
              )),
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users(id),
  primary key (project_id, scope)
);
create index if not exists project_data_updated_idx on public.project_data(project_id, updated_at desc);

-- ============================================================
-- 3. PROJECT_COLLABORATORS — explicit per-user access grants.
-- Owners are NOT inserted here (they're identified by projects.owner_id).
-- ============================================================
create table if not exists public.project_collaborators (
  project_id  uuid        not null references public.projects(id) on delete cascade,
  user_id     uuid        not null references auth.users(id)     on delete cascade,
  role        text        not null check (role in ('view','comment','edit')),
  granted_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists pc_user_idx on public.project_collaborators(user_id);

-- ============================================================
-- 4. SHARES — link-based invitations
-- ============================================================
create table if not exists public.shares (
  id          uuid        primary key default gen_random_uuid(),
  project_id  uuid        not null references public.projects(id) on delete cascade,
  role        text        not null check (role in ('view','comment','edit')),
  token       text        not null unique,
  expires_at  timestamptz,
  created_by  uuid        not null references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists shares_project_idx on public.shares(project_id);
create index if not exists shares_token_idx   on public.shares(token);

-- ============================================================
-- 5. COMMENTS — per-field threads (the "corrections" loop)
-- ============================================================
create table if not exists public.comments (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        not null references public.projects(id) on delete cascade,
  scope         text        not null,                -- 'feature' | 'short' | …
  field_key     text        not null,                -- the data-key value (e.g. 's4_name')
  author_id     uuid        references auth.users(id),
  author_name   text        not null,
  body          text        not null,
  type          text        not null default 'comment'
                check (type in ('comment','suggestion','correction','question')),
  status        text        not null default 'open'
                check (status in ('open','accepted','rejected','resolved')),
  parent_id     uuid        references public.comments(id) on delete cascade,
  suggest_from  text,                                 -- only for type='suggestion'
  suggest_to    text,
  created_at    timestamptz not null default now()
);
create index if not exists comments_field_idx
  on public.comments(project_id, scope, field_key, created_at);

-- ============================================================
-- HELPER FUNCTION — used by RLS policies on project_data + comments
-- security definer + stable so it passes the planner; safe because
-- the only thing it leaks is "do you have access" booleans.
-- ============================================================
create or replace function public.has_project_access(pid uuid, min_role text default 'view')
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_collaborators c
    where c.project_id = pid
      and c.user_id    = auth.uid()
      and case min_role
            when 'view'    then true
            when 'comment' then c.role in ('comment','edit')
            when 'edit'    then c.role = 'edit'
          end
  );
$$;
grant execute on function public.has_project_access(uuid, text) to authenticated, anon;

-- ============================================================
-- claim_share — public RPC. Validates a share token, then inserts
-- a project_collaborators row for the calling user. Used after a
-- recipient signs in from a /shared/:token URL.
-- ============================================================
create or replace function public.claim_share(p_token text)
returns table (project_id uuid, role text)
language plpgsql
security definer
as $$
declare
  s_record record;
begin
  -- caller must be authenticated to claim
  if auth.uid() is null then
    raise exception 'Sign in required to claim share' using errcode = '42501';
  end if;
  -- find a non-expired share
  select * into s_record from public.shares
  where token = p_token
    and (expires_at is null or expires_at > now())
  limit 1;
  if not found then
    raise exception 'Share is invalid or expired' using errcode = '22023';
  end if;
  -- insert/upgrade collaborator row (don't downgrade if user already has higher role)
  insert into public.project_collaborators (project_id, user_id, role)
  values (s_record.project_id, auth.uid(), s_record.role)
  on conflict (project_id, user_id) do update set
    role = case
      -- 'edit' > 'comment' > 'view' — keep the higher one
      when public.project_collaborators.role = 'edit' then 'edit'
      when public.project_collaborators.role = 'comment' and excluded.role = 'view' then 'comment'
      else excluded.role
    end;
  -- return what they got
  return query
    select s_record.project_id, c.role
    from public.project_collaborators c
    where c.project_id = s_record.project_id and c.user_id = auth.uid();
end;
$$;
grant execute on function public.claim_share(text) to authenticated;

-- ============================================================
-- resolve_share — public RPC. Looks up a token without claiming;
-- lets a logged-out visitor see what they're being invited to.
-- Returns the project meta + role + first-blueprint-data preview.
-- ============================================================
create or replace function public.resolve_share(p_token text)
returns table (
  project_id  uuid,
  title       text,
  format      text,
  role        text,
  expires_at  timestamptz,
  is_expired  boolean
)
language sql
security definer
stable
as $$
  select
    p.id,
    p.title,
    p.format,
    s.role,
    s.expires_at,
    (s.expires_at is not null and s.expires_at <= now()) as is_expired
  from public.shares s
  join public.projects p on p.id = s.project_id
  where s.token = p_token
  limit 1;
$$;
grant execute on function public.resolve_share(text) to authenticated, anon;

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table public.projects               enable row level security;
alter table public.project_data           enable row level security;
alter table public.project_collaborators  enable row level security;
alter table public.shares                 enable row level security;
alter table public.comments               enable row level security;

-- ----- projects ---------------------------------------------------
drop policy if exists proj_select on public.projects;
create policy proj_select on public.projects
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_collaborators c
      where c.project_id = id and c.user_id = auth.uid()
    )
  );

drop policy if exists proj_insert on public.projects;
create policy proj_insert on public.projects
  for insert with check (owner_id = auth.uid());

drop policy if exists proj_update on public.projects;
create policy proj_update on public.projects
  for update using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_collaborators c
      where c.project_id = id and c.user_id = auth.uid() and c.role = 'edit'
    )
  );

drop policy if exists proj_delete on public.projects;
create policy proj_delete on public.projects
  for delete using (owner_id = auth.uid());

-- ----- project_data ----------------------------------------------
drop policy if exists pd_select on public.project_data;
create policy pd_select on public.project_data
  for select using (public.has_project_access(project_id, 'view'));

drop policy if exists pd_write on public.project_data;
create policy pd_write on public.project_data
  for all
  using (public.has_project_access(project_id, 'edit'))
  with check (public.has_project_access(project_id, 'edit'));

-- ----- collaborators ---------------------------------------------
drop policy if exists pc_select on public.project_collaborators;
create policy pc_select on public.project_collaborators
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists pc_owner_write on public.project_collaborators;
create policy pc_owner_write on public.project_collaborators
  for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );
-- self-claim happens via the security-definer claim_share() function;
-- no direct INSERT permission needed for collaborators.

-- ----- shares ----------------------------------------------------
drop policy if exists sh_owner_select on public.shares;
create policy sh_owner_select on public.shares
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists sh_owner_write on public.shares;
create policy sh_owner_write on public.shares
  for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
    and created_by = auth.uid()
  );

-- ----- comments --------------------------------------------------
drop policy if exists cm_select on public.comments;
create policy cm_select on public.comments
  for select using (public.has_project_access(project_id, 'view'));

drop policy if exists cm_insert on public.comments;
create policy cm_insert on public.comments
  for insert with check (
    public.has_project_access(project_id, 'comment')
    and author_id = auth.uid()
  );

drop policy if exists cm_update on public.comments;
create policy cm_update on public.comments
  for update using (
    author_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists cm_delete on public.comments;
create policy cm_delete on public.comments
  for delete using (
    author_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

-- ============================================================
-- REALTIME — broadcast changes to `project_data` and `comments`
-- so connected clients see edits / new comments live.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_data'
  ) then
    alter publication supabase_realtime add table public.project_data;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- ============================================================
-- DONE. Verify with:
--   select count(*) from projects;       -- should be 0 as anon
--   select * from has_project_access('00000000-0000-0000-0000-000000000000', 'view');  -- false
-- ============================================================
