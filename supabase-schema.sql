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
                'feature_prefs','short_prefs','library_prefs','activity',
                'scenes',
                'contacts',
                'shots',
                'script',
                'locations',
                'workbench',
                'dissect'
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
    -- An expired link must not keep answering. It previously returned
    -- the project title to anyone holding a revoked token, with
    -- is_expired set alongside it; the caller shows a generic
    -- "invalid or expired" instead.
    and (s.expires_at is null or s.expires_at > now())
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

-- An UPDATE policy with no WITH CHECK reuses its USING expression for
-- the new row (Postgres docs, "Row Security Policies"). USING passed for
-- any 'edit' collaborator, and it passed again for the row they wrote —
-- so an editor could set owner_id to themselves or to a stranger, and
-- the new row still satisfied it. The new owner could then delete the
-- project, drop the real owner's collaborator row and lock them out
-- entirely. WITH CHECK alone cannot fix this, because it has no access
-- to the OLD row; the trigger below does the OLD/NEW comparison.
drop policy if exists proj_update on public.projects;
create policy proj_update on public.projects
  for update using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_collaborators c
      where c.project_id = id and c.user_id = auth.uid() and c.role = 'edit'
    )
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_collaborators c
      where c.project_id = id and c.user_id = auth.uid() and c.role = 'edit'
    )
  );

create or replace function public.projects_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then
    raise exception 'Only the owner can transfer ownership' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists projects_guard_owner on public.projects;
create trigger projects_guard_owner
  before update on public.projects
  for each row execute function public.projects_guard_owner();

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

-- Same missing-WITH-CHECK shape as proj_update had. USING only asks
-- "are you the author"; with no WITH CHECK the new row was asked the
-- same question, which stayed true however project_id changed. An author
-- could therefore re-point their own comment at any project whose uuid
-- they knew — including one their access had since been revoked, since
-- the INSERT policy's has_project_access() check never runs on UPDATE.
drop policy if exists cm_update on public.comments;
create policy cm_update on public.comments
  for update using (
    author_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    public.has_project_access(project_id, 'comment')
    and (
      author_id = auth.uid()
      or exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner_id = auth.uid()
      )
    )
  );

-- author_name was whatever the client sent. cm_insert pinned author_id
-- to auth.uid() but never the display name, so a signed-in collaborator
-- could post as anyone. Both identity columns are now set server-side
-- and frozen; the client's values are ignored rather than trusted.
create or replace function public.comments_set_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id   := auth.uid();
    new.author_name := coalesce(nullif(auth.jwt() ->> 'email', ''), 'Anonymous');
  else
    new.author_id   := old.author_id;
    new.author_name := old.author_name;
  end if;
  return new;
end;
$$;
drop trigger if exists comments_set_author on public.comments;
create trigger comments_set_author
  before insert or update on public.comments
  for each row execute function public.comments_set_author();

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

-- ============================================================
-- 6. ACCOUNTS — the org tier above projects (v4)
-- ------------------------------------------------------------
-- Added before there is production data, deliberately. Retrofitting a
-- tenant above `projects` later means migrating live rows, and the
-- first invariant of this app is that saved work is a contract.
--
-- TWO ROLE AXES, kept separate on purpose:
--   account_members.role      owner / admin / member
--     governs billing, seats, and who may create projects.
--   project_collaborators.role  view / comment / edit
--     governs access to one project's data.
-- An account 'member' gets NO blanket access to the account's projects;
-- they need an explicit collaborator row. Only owner/admin see
-- everything, which is the privacy-preserving default. Flip that in
-- has_project_access() below if you want company-wide visibility.
-- ============================================================
create table if not exists public.accounts (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null default 'My Studio',
  owner_id         uuid        not null references auth.users(id) on delete restrict,
  plan             text        not null default 'free'
                   check (plan in ('free','starter','indie','pro')),
  seat_limit       int         not null default 1  check (seat_limit >= 1),
  storage_limit_mb int         not null default 500 check (storage_limit_mb >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists accounts_owner_idx on public.accounts(owner_id);

-- Seats. user_id stays null until a pending invite is claimed, so a
-- person can be invited before they have signed up; the email is the
-- stable key. Store it lowercased — the trigger below enforces that
-- rather than trusting the caller.
create table if not exists public.account_members (
  account_id    uuid        not null references public.accounts(id) on delete cascade,
  invited_email text        not null,
  user_id       uuid        references auth.users(id) on delete cascade,
  role          text        not null check (role in ('owner','admin','member')),
  status        text        not null default 'pending'
                check (status in ('pending','active','revoked')),
  invited_by    uuid        references auth.users(id),
  created_at    timestamptz not null default now(),
  joined_at     timestamptz,
  primary key (account_id, invited_email)
);
create unique index if not exists account_members_user_idx
  on public.account_members(account_id, user_id) where user_id is not null;
create index if not exists account_members_lookup_idx
  on public.account_members(user_id, status);

-- Nullable for now: the column has to exist before the backfill can run,
-- and the client still creates projects without it. Make it NOT NULL in
-- a later migration once every row is populated and cloud.js sets it.
alter table public.projects
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;
create index if not exists projects_account_idx on public.projects(account_id);

-- ---- backfill: one personal account per existing project owner ------
-- Idempotent. Re-running finds the account it made last time and only
-- fills projects still carrying a null account_id.
do $$
declare
  r      record;
  acc_id uuid;
begin
  for r in select distinct owner_id from public.projects where account_id is null loop
    select id into acc_id
      from public.accounts
     where owner_id = r.owner_id
     order by created_at
     limit 1;

    if acc_id is null then
      insert into public.accounts (name, owner_id)
      values ('Personal', r.owner_id)
      returning id into acc_id;

      insert into public.account_members
        (account_id, invited_email, user_id, role, status, joined_at)
      select acc_id, lower(coalesce(u.email, u.id::text)), r.owner_id, 'owner', 'active', now()
        from auth.users u
       where u.id = r.owner_id
      on conflict (account_id, invited_email) do nothing;
    end if;

    update public.projects
       set account_id = acc_id
     where owner_id = r.owner_id
       and account_id is null;
  end loop;
end $$;

-- ---- helpers --------------------------------------------------------
-- security definer so it bypasses RLS: account_members policies below
-- ask "am I a member of this account", and answering that by querying
-- account_members under RLS would recurse infinitely. This is the
-- standard way out of that trap.
create or replace function public.account_role(aid uuid)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select m.role
    from public.account_members m
   where m.account_id = aid
     and m.user_id    = auth.uid()
     and m.status     = 'active'
   limit 1;
$$;
grant execute on function public.account_role(uuid) to authenticated;

create or replace function public.normalise_member_email()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.invited_email := lower(trim(new.invited_email));
  return new;
end;
$$;
drop trigger if exists account_members_normalise on public.account_members;
create trigger account_members_normalise
  before insert or update on public.account_members
  for each row execute function public.normalise_member_email();

-- Seats are what the plan sells, so the limit is enforced in the
-- database rather than in the client that happens to be asking.
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  used int;
  lim  int;
begin
  select seat_limit into lim from public.accounts where id = new.account_id;
  select count(*) into used
    from public.account_members
   where account_id = new.account_id
     and status in ('pending','active');
  if used >= lim then
    raise exception 'Seat limit reached for this account (% of %). Add seats to invite more people.', used, lim
      using errcode = '53400';
  end if;
  return new;
end;
$$;
drop trigger if exists account_members_seat_limit on public.account_members;
create trigger account_members_seat_limit
  before insert on public.account_members
  for each row execute function public.enforce_seat_limit();

-- ---- access: account owners/admins reach their account's projects ---
create or replace function public.has_project_access(pid uuid, min_role text default 'view')
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
    select 1
      from public.projects p
      join public.account_members m on m.account_id = p.account_id
     where p.id = pid
       and m.user_id = auth.uid()
       and m.status  = 'active'
       and m.role in ('owner','admin')
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

-- ---- RLS ------------------------------------------------------------
alter table public.accounts        enable row level security;
alter table public.account_members enable row level security;

drop policy if exists acc_select on public.accounts;
create policy acc_select on public.accounts
  for select using (owner_id = auth.uid() or public.account_role(id) is not null);

drop policy if exists acc_insert on public.accounts;
create policy acc_insert on public.accounts
  for insert with check (owner_id = auth.uid());

-- WITH CHECK is explicit, not inherited from USING. Without it Postgres
-- reuses USING for the new row, which is how an 'edit' collaborator was
-- once able to rewrite projects.owner_id and seize a project.
drop policy if exists acc_update on public.accounts;
create policy acc_update on public.accounts
  for update
  using  (owner_id = auth.uid() or public.account_role(id) = 'owner')
  with check (owner_id = auth.uid() or public.account_role(id) = 'owner');

drop policy if exists acc_delete on public.accounts;
create policy acc_delete on public.accounts
  for delete using (owner_id = auth.uid());

drop policy if exists am_select on public.account_members;
create policy am_select on public.account_members
  for select using (
    user_id = auth.uid() or public.account_role(account_id) in ('owner','admin')
  );

drop policy if exists am_write on public.account_members;
create policy am_write on public.account_members
  for all
  using  (public.account_role(account_id) in ('owner','admin'))
  with check (public.account_role(account_id) in ('owner','admin'));

-- NOTE: proj_select and proj_insert are REDEFINED here, superseding the
-- versions in section "ROW-LEVEL SECURITY" above. The file is applied
-- top to bottom and every policy is drop-then-create, so the last
-- definition wins — these are the live ones. proj_update, pd_*, pc_*,
-- sh_* and cm_* are unchanged and still defined above.
--
-- Projects become visible to account owners/admins as well.
drop policy if exists proj_select on public.projects;
create policy proj_select on public.projects
  for select using (public.has_project_access(id, 'view'));

-- A new project must land in an account the creator actually belongs to.
drop policy if exists proj_insert on public.projects;
create policy proj_insert on public.projects
  for insert with check (
    owner_id = auth.uid()
    and (account_id is null or public.account_role(account_id) is not null)
  );
