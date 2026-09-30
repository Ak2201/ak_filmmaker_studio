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
                'dissect',
                'festivals'
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

-- ============================================================
-- 7. SECURITY HARDENING (v5)
-- ------------------------------------------------------------
-- Everything below was written after a line-by-line audit of the
-- sections above (docs/SECURITY-RLS.md records the findings and the
-- reasoning). It is appended rather than edited in place for the same
-- reason section 6 was: the file is applied top to bottom, every
-- policy/function/trigger here is drop-then-create, and the last
-- definition wins. Read the audit before changing any of it — each
-- guard below closes a named hole, and several of them cannot be
-- expressed as RLS at all, because a policy cannot see the OLD row.
--
-- NOTHING HERE WIDENS ACCESS. The only reachability that changes is
-- that an account's own owner_id can now manage that account's member
-- rows before a membership row exists for them (previously nobody
-- could, which made a fresh account unusable).
-- ============================================================

-- ------------------------------------------------------------
-- 7.0 Who is asking
-- ------------------------------------------------------------
-- Distinguishes a browser holding the anon/authenticated key from a
-- trusted backend (service_role) or a human in the SQL editor. Not
-- security definer ON PURPOSE: a definer function would report the
-- DEFINER's role, so every caller would look privileged.
create or replace function public.is_privileged_caller()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'role', current_user)
         in ('service_role', 'postgres', 'supabase_admin');
$$;
grant execute on function public.is_privileged_caller() to authenticated, anon;

create or replace function public.account_owner(aid uuid)
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select a.owner_id from public.accounts a where a.id = aid;
$$;
grant execute on function public.account_owner(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7.1 A share link that expires must expire the ACCESS, and a
--     revoked link must actually revoke.
-- ------------------------------------------------------------
-- The share dialog offers "7 DAYS" and its revoke button says "Anyone
-- using it will lose access." Neither was true. claim_share() wrote a
-- permanent project_collaborators row; after that the shares row was
-- decoration. Deleting it (revoke) or letting it lapse (expiry)
-- changed nothing at all, because no policy ever looked at shares
-- again. A link handed to the wrong person could not be taken back.
--
-- Two columns fix it at the source rather than in the caller:
--   via_share   the grant is OWNED by the link. ON DELETE CASCADE, so
--               revoking the link deletes the access with it — including
--               a revoke done straight against the table, not only one
--               that goes through the app.
--   expires_at  copied from the link at claim time and honoured in
--               has_project_access() below.
-- A grant the owner made by hand has via_share = null and expires_at =
-- null, so neither mechanism can touch it: a link cannot claim, and
-- therefore cannot revoke, a manual grant.
alter table public.project_collaborators
  add column if not exists via_share uuid references public.shares(id) on delete cascade;
alter table public.project_collaborators
  add column if not exists expires_at timestamptz;
create index if not exists pc_via_share_idx on public.project_collaborators(via_share);

create or replace function public.claim_share(p_token text)
returns table (project_id uuid, role text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s_record record;
begin
  if auth.uid() is null then
    raise exception 'Sign in required to claim share' using errcode = '42501';
  end if;
  select * into s_record from public.shares
  where token = p_token
    and (expires_at is null or expires_at > now())
  limit 1;
  if not found then
    raise exception 'Share is invalid or expired' using errcode = '22023';
  end if;

  insert into public.project_collaborators (project_id, user_id, role, via_share, expires_at)
  values (s_record.project_id, auth.uid(), s_record.role, s_record.id, s_record.expires_at)
  on conflict (project_id, user_id) do update set
    role = case
      when public.project_collaborators.role = 'edit' then 'edit'
      when public.project_collaborators.role = 'comment' and excluded.role = 'view' then 'comment'
      else excluded.role
    end,
    -- A manual grant (via_share is null) is never re-attributed to a
    -- link: otherwise revoking the link would silently delete access
    -- the owner granted deliberately.
    via_share = case
      when public.project_collaborators.via_share is null then null
      else excluded.via_share
    end,
    expires_at = case
      when public.project_collaborators.via_share is null then public.project_collaborators.expires_at
      when public.project_collaborators.expires_at is null or excluded.expires_at is null then null
      else greatest(public.project_collaborators.expires_at, excluded.expires_at)
    end;

  return query
    select s_record.project_id, c.role
    from public.project_collaborators c
    where c.project_id = s_record.project_id and c.user_id = auth.uid();
end;
$$;
grant execute on function public.claim_share(text) to authenticated;

-- Housekeeping for the operator: expired links keep answering "invalid
-- or expired" either way, but there is no reason to keep the bearer
-- token sitting in the table. Schedule with pg_cron if you have it.
create or replace function public.purge_expired_shares()
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with gone as (
    delete from public.shares where expires_at is not null and expires_at <= now()
    returning 1
  ) select count(*)::int from gone;
$$;
revoke execute on function public.purge_expired_shares() from authenticated, anon;

-- ------------------------------------------------------------
-- 7.2 has_project_access — honour the collaborator expiry
-- ------------------------------------------------------------
-- Same three branches as the section-6 version, plus the expiry test
-- on the collaborator branch. Owner and account-admin access do not
-- expire; a link-derived grant does.
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
       and (c.expires_at is null or c.expires_at > now())
       and case min_role
             when 'view'    then true
             when 'comment' then c.role in ('comment','edit')
             when 'edit'    then c.role = 'edit'
           end
  );
$$;
grant execute on function public.has_project_access(uuid, text) to authenticated, anon;

-- ------------------------------------------------------------
-- 7.3 projects — an editor may not move the project to another account
-- ------------------------------------------------------------
-- proj_update lets an 'edit' collaborator write the row, and nothing
-- guarded account_id. projects.account_id cascades on account delete
-- and has_project_access grants account owners/admins full access to
-- every project in their account, so an editor could:
--   (a) move the project into an account they own -> permanent access
--       that survives having their collaborator row deleted, and
--   (b) then delete that account -> the project and every project_data
--       row cascade away. A comment-and-edit guest could destroy the
--       screenplay outright.
-- A policy cannot express this: WITH CHECK never sees the OLD row.
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
  if new.account_id is distinct from old.account_id then
    if old.owner_id <> auth.uid() then
      raise exception 'Only the owner can move a project between accounts' using errcode = '42501';
    end if;
    -- and only into an account they are actually in
    if new.account_id is not null and public.account_role(new.account_id) is null then
      raise exception 'You are not a member of that account' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_guard_owner on public.projects;
create trigger projects_guard_owner
  before update on public.projects
  for each row execute function public.projects_guard_owner();

-- ------------------------------------------------------------
-- 7.4 project_data — the writer is who the server says it is
-- ------------------------------------------------------------
-- updated_by was whatever the client sent. cloud.js uses it as the
-- self-echo guard (`if (row.updated_by === session.user.id) return`),
-- so an editor who stamped a collaborator's id on every write would
-- make that collaborator's browser ignore the change forever: their
-- screen quietly stops matching the document. Not a data leak, but
-- the column is an identity claim and an identity claim from the
-- client is worth nothing.
--
-- updated_at is deliberately NOT forced. It is the clock the
-- last-write-wins merge in cloud.js compares against markRemoteSeen();
-- overwriting it server-side would desynchronise that clock and
-- produce a push/pull ping-pong.
create or replace function public.project_data_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists project_data_stamp on public.project_data;
create trigger project_data_stamp
  before insert or update on public.project_data
  for each row execute function public.project_data_stamp();

-- ------------------------------------------------------------
-- 7.5 comments — integrity of a thread, and who may resolve one
-- ------------------------------------------------------------
-- Three separate holes, all reachable by a plain 'comment' guest:
--
--  1. cm_update's USING allows the AUTHOR, and status is just another
--     column, so the person making a suggestion could mark their own
--     suggestion 'accepted'. The value never changes (the accept is
--     applied client-side by whoever is editing), so what this
--     produces is a lie in the record: a suggestion that reads as
--     approved and never was. Resolving is now an edit-level act.
--  2. parent_id was unconstrained. A reply could point at a comment
--     in a different project, a different field, or at another reply,
--     and comments.parent_id cascades on delete.
--  3. Which made cm_delete worse than it looks: an author deleting
--     their own root comment cascaded away every reply other people
--     had written under it. Deleting a comment with replies is now
--     the project owner's call.
--
-- Threads are also capped at one level. That is a product decision as
-- much as a security one, but it bounds the cascade and it is what the
-- UI renders.
alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments add  constraint comments_body_len
  check (char_length(body) between 1 and 4000);
alter table public.comments drop constraint if exists comments_field_len;
alter table public.comments add  constraint comments_field_len
  check (char_length(field_key) between 1 and 160);
alter table public.comments drop constraint if exists comments_scope_fmt;
alter table public.comments add  constraint comments_scope_fmt
  check (scope ~ '^[a-z][a-z0-9_]{0,31}$');
alter table public.comments drop constraint if exists comments_suggest_len;
alter table public.comments add  constraint comments_suggest_len
  check (coalesce(char_length(suggest_from), 0) <= 20000
     and coalesce(char_length(suggest_to),   0) <= 20000);

create or replace function public.comments_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  par record;
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select * into par from public.comments where id = new.parent_id;
      if not found
         or par.project_id is distinct from new.project_id
         or par.scope      is distinct from new.scope
         or par.field_key  is distinct from new.field_key then
        raise exception 'A reply must belong to the same field thread as the comment it answers'
          using errcode = '23514';
      end if;
      if par.parent_id is not null then
        raise exception 'Replies are one level deep' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE. What a thread is ABOUT never moves.
  new.project_id   := old.project_id;
  new.scope        := old.scope;
  new.field_key    := old.field_key;
  new.parent_id    := old.parent_id;
  new.created_at   := old.created_at;
  new.type         := old.type;
  new.suggest_from := old.suggest_from;
  new.suggest_to   := old.suggest_to;

  if new.status is distinct from old.status
     and not public.has_project_access(new.project_id, 'edit') then
    raise exception 'Only someone who can edit this project may resolve a comment'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
  before insert or update on public.comments
  for each row execute function public.comments_guard();

create or replace function public.comments_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.comments c where c.parent_id = old.id)
     and not exists (
       select 1 from public.projects p
        where p.id = old.project_id and p.owner_id = auth.uid()
     ) then
    raise exception 'This comment has replies. Only the project owner can delete it.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists comments_guard_delete on public.comments;
create trigger comments_guard_delete
  before delete on public.comments
  for each row execute function public.comments_guard_delete();

-- author_name used to be the signed-in EMAIL ADDRESS, stamped onto
-- every comment and readable by everyone with view access — which,
-- with link sharing, is "whoever was sent the link". A share link
-- should not hand out the crew's email addresses as a side effect of
-- them having said something. Prefer a real display name; fall back to
-- the local part, which identifies a person to their collaborators
-- without being a working address.
create or replace function public.comments_set_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claims jsonb;
  nm     text;
begin
  if tg_op = 'INSERT' then
    claims := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
    nm := nullif(trim(coalesce(
            claims ->> 'full_name',
            claims ->> 'name',
            split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
          )), '');
    new.author_id   := auth.uid();
    new.author_name := coalesce(nm, 'Anonymous');
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

-- ------------------------------------------------------------
-- 7.6 accounts — the plan is not a field the buyer fills in
-- ------------------------------------------------------------
-- acc_update let the account owner write any column on their own row,
-- and seat_limit / storage_limit_mb / plan are columns. The seat-limit
-- TRIGGER was doing its job perfectly against a limit the person being
-- limited could set to 9999 with one PATCH against the public REST
-- endpoint. Enforcing a paid limit in the database only helps if the
-- limit itself is not client-writable.
--
-- Separately: acc_update's USING accepts `account_role(id) = 'owner'`,
-- which is a MEMBER row, not accounts.owner_id. An owner-role member
-- could therefore set owner_id to themselves and take the account —
-- exactly the bug proj_update already had and had fixed.
--
-- Not security definer: it asks is_privileged_caller(), which has to
-- see the real caller.
create or replace function public.accounts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_privileged_caller() then return new; end if;
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then
    raise exception 'Only the account owner can transfer the account' using errcode = '42501';
  end if;
  if new.plan             is distinct from old.plan
  or new.seat_limit       is distinct from old.seat_limit
  or new.storage_limit_mb is distinct from old.storage_limit_mb then
    raise exception 'Plan and limits are set by billing, not by the client' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists accounts_guard on public.accounts;
create trigger accounts_guard
  before update on public.accounts
  for each row execute function public.accounts_guard();

-- ------------------------------------------------------------
-- 7.7 account_members — an admin is not a second owner
-- ------------------------------------------------------------
-- am_write is `for all` on account_role in ('owner','admin'), with no
-- distinction between the two and no OLD-row comparison. So an admin
-- could insert a row for themselves with role='owner', or demote or
-- DELETE the real owner's row (USING applies to delete; WITH CHECK
-- does not). From 'owner' they reach accounts_guard's owner_id path
-- and, via has_project_access, every project in the account.
--
-- Two changes. The policies now also admit the account's own
-- owner_id — without that a freshly created account has no member
-- rows, account_role() is null, and its creator cannot invite anybody.
-- The trigger then does what a policy cannot: compares OLD and NEW.
drop policy if exists am_write on public.account_members;
create policy am_write on public.account_members
  for all
  using (
    public.account_role(account_id) in ('owner','admin')
    or public.account_owner(account_id) = auth.uid()
  )
  with check (
    public.account_role(account_id) in ('owner','admin')
    or public.account_owner(account_id) = auth.uid()
  );

drop policy if exists am_select on public.account_members;
create policy am_select on public.account_members
  for select using (
    user_id = auth.uid()
    or public.account_role(account_id) in ('owner','admin')
    or public.account_owner(account_id) = auth.uid()
  );

create or replace function public.account_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_owner bool;
  row_acc  uuid := coalesce(new.account_id, old.account_id);
begin
  is_owner := public.account_owner(row_acc) = auth.uid()
              or public.account_role(row_acc) = 'owner';

  if tg_op = 'DELETE' then
    if old.role = 'owner' and not is_owner then
      raise exception 'Only an account owner can remove an owner' using errcode = '42501';
    end if;
    if old.user_id = public.account_owner(row_acc) then
      raise exception 'The account owner cannot be removed from their own account'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- Minting or granting 'owner' is an owner-only act.
  if new.role = 'owner' and not is_owner then
    raise exception 'Only an account owner can grant the owner role' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.role = 'owner' and not is_owner then
      raise exception 'Only an account owner can change an owner row' using errcode = '42501';
    end if;
    if old.user_id is not null and new.user_id is distinct from old.user_id then
      raise exception 'A claimed seat cannot be reassigned' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists account_members_guard on public.account_members;
create trigger account_members_guard
  before insert or update or delete on public.account_members
  for each row execute function public.account_members_guard();

-- Seats were only counted on INSERT, so flipping a 'revoked' row back
-- to 'active' walked straight past the limit.
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
  if tg_op = 'UPDATE'
     and not (old.status = 'revoked' and new.status in ('pending','active')) then
    return new;
  end if;
  select seat_limit into lim from public.accounts where id = new.account_id;
  select count(*) into used
    from public.account_members
   where account_id = new.account_id
     and status in ('pending','active')
     and (tg_op = 'INSERT' or (account_id, invited_email) <> (new.account_id, new.invited_email));
  if used >= lim then
    raise exception 'Seat limit reached for this account (% of %). Add seats to invite more people.', used, lim
      using errcode = '53400';
  end if;
  return new;
end;
$$;
drop trigger if exists account_members_seat_limit on public.account_members;
create trigger account_members_seat_limit
  before insert or update on public.account_members
  for each row execute function public.enforce_seat_limit();

-- ============================================================
-- END v5. docs/SECURITY-RLS.md carries the per-table verdict, the
-- findings that are NOT fixed here (and why), and the checks an
-- operator should run against a live database — none of the above has
-- ever been executed against one.
-- ============================================================

-- ============================================================
-- SECTION 8 BELOW NEVER RAN, AND CANNOT. SEE SECTION 9.
-- ------------------------------------------------------------
-- Kept verbatim because the way it was wrong is the lesson. It
-- was written from the file rather than from the database, and
-- every one of its four failures is a thing the file asserts and
-- the database does not have:
--
--   public.account_members   no such table   (section 6 never ran)
--   projects.account_id      no such column  (section 6 never ran)
--   c.expires_at             no such column  (section 7 never ran)
--   policy sh_owner_all      not the name    (sh_owner_select /
--                                             sh_owner_write)
--
-- `create policy` against a missing relation aborts the block, so
-- the section failed on its first statement after the function and
-- committed nothing — including the `notify pgrst` at the end.
-- Nothing in the editor's output said so loudly enough to notice,
-- and the sweep afterwards came back byte-identical, which is what
-- eventually gave it away.
--
-- ITS DIAGNOSIS OF THE LOOP IS ALSO WRONG. Section 8 says the cycle
-- is proj_select -> has_project_access() -> projects. The deployed
-- proj_select never called has_project_access at all. The real loop
-- was between two policies on two tables:
--
--   projects.proj_select  reads project_collaborators
--   project_collaborators.pc_select  reads projects
--
-- Postgres reports mutual policy recursion against whichever
-- relation you entered through, so the 42P17 named `projects` and
-- the error message was read as if projects alone were at fault.
--
-- WHAT THE DATABASE ACTUALLY CONTAINS, verified 30 Sep 2026:
-- five tables (projects, project_data, project_collaborators,
-- shares, comments) and four functions (has_project_access,
-- claim_share, resolve_share, rls_auto_enable). Sections 6 and 7
-- are absent entirely; the run that created this database stopped
-- somewhere around line 200. src/lib/cloud.js touches only those
-- five tables, so the account tier is unbuilt rather than broken,
-- and section 9 deliberately does not create it.
-- ============================================================


-- ============================================================
-- 8. RECURSION FIX (v6)
-- ------------------------------------------------------------
-- FOUND BY TESTING THE LIVE DATABASE, which is the point of the ten
-- checks in docs/SECURITY-RLS.md. The audit that produced section 7
-- was static and could not have seen this: every read of projects,
-- project_collaborators and shares failed with
--
--     42P17  infinite recursion detected in policy for relation "projects"
--
-- so the cloud layer did not work at all, for anyone.
--
-- THE LOOP. Section 7 redefined proj_select as
--     using (public.has_project_access(id, 'view'))
-- and has_project_access() opens with
--     select 1 from public.projects p where p.id = pid ...
-- A policy ON projects therefore has to evaluate a function that
-- reads projects, which re-enters the same policy. security definer
-- did not save it here, so this does not rely on it saving us.
--
-- THE FIX is to make each policy read only tables OTHER than the one
-- it guards, and to keep the owner test on the row's own column:
--
--   projects.proj_select      -> owner_id on the row itself, plus
--                                project_collaborators, plus
--                                account_members. Never projects.
--   project_collaborators.pc_select
--                             -> the caller's own rows, plus a
--                                definer lookup of the owner id.
--
-- has_project_access() itself is left exactly as section 7 wrote it.
-- It is correct and still used by project_data, comments and shares,
-- none of which it reads — the bug was only ever calling it from a
-- policy on projects.
-- ============================================================

-- 8.1 the owner lookup, kept out of any policy that guards projects
create or replace function public.project_owner_is_caller(pid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
     where p.id = pid and p.owner_id = auth.uid()
  );
$$;
grant execute on function public.project_owner_is_caller(uuid) to authenticated, anon;

-- 8.2 projects — same three branches as has_project_access, inlined so
--     that nothing here reads projects.
drop policy if exists proj_select on public.projects;
create policy proj_select on public.projects
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_collaborators c
       where c.project_id = projects.id
         and c.user_id    = auth.uid()
         and (c.expires_at is null or c.expires_at > now())
    )
    or exists (
      select 1 from public.account_members m
       where m.account_id = projects.account_id
         and m.user_id    = auth.uid()
         and m.status     = 'active'
         and m.role in ('owner','admin')
    )
  );

-- 8.3 project_collaborators — read your own rows, or any row on a
--     project you own. The owner test goes through the definer
--     function so this policy never reads projects directly.
drop policy if exists pc_select on public.project_collaborators;
create policy pc_select on public.project_collaborators
  for select using (
    user_id = auth.uid()
    or public.project_owner_is_caller(project_id)
  );

drop policy if exists pc_owner_write on public.project_collaborators;
create policy pc_owner_write on public.project_collaborators
  for all
  using      (public.project_owner_is_caller(project_id))
  with check (public.project_owner_is_caller(project_id));

-- 8.4 shares — same treatment; sh_* previously reached projects too.
drop policy if exists sh_owner_all on public.shares;
create policy sh_owner_all on public.shares
  for all
  using      (public.project_owner_is_caller(project_id))
  with check (public.project_owner_is_caller(project_id));

-- 8.5 PostgREST caches the schema. accounts and account_members were
--     returning PGRST205 "could not find the table" while plainly
--     existing — the function above resolves them, and a missing
--     relation errors 42P01, not 42P17. Nudge the cache.
notify pgrst, 'reload schema';

-- ============================================================
-- 9. RECURSION FIX (v7) — WRITTEN AGAINST THE LIVE DATABASE
-- ------------------------------------------------------------
-- RAN SUCCESSFULLY 30 SEP 2026 against conhlrulxfwkhsnymakz.
-- This is the first section of this file that has ever executed
-- and been verified from outside afterwards.
--
-- THE LOOP, correctly this time:
--
--   projects.proj_select
--     -> exists (select 1 from project_collaborators ...)
--        -> project_collaborators.pc_select
--           -> exists (select 1 from projects ...)
--              -> projects.proj_select            <-- 42P17
--
-- Two policies on two tables, each reading the other's. Cutting
-- either edge is enough; cutting the one on project_collaborators
-- is the right half, because projects' own policy is the one that
-- has to answer "may this caller see this row" for the app's main
-- read path and should stay inlined and indexable.
--
-- THE CUT is a security definer function. It runs as the function
-- owner, who is the table owner, and table owners bypass RLS unless
-- the table is FORCE ROW LEVEL SECURITY — so the read of projects
-- inside it does not re-enter proj_select.
--
-- That this works was already observable before the fix and was
-- missed: project_data returned 200 while projects returned 500,
-- and pd_select's only test is has_project_access(), which reads
-- projects. A definer function reading projects was demonstrably
-- fine. Section 8's header asserts the opposite ("security definer
-- did not save it here") on no evidence.
--
-- SCOPE. This fixes the recursion and nothing else. It does not
-- create the account tier (sections 6-7), does not add expires_at
-- to project_collaborators, and does not backfill any of section
-- 7's hardening. All of that is still absent from the database and
-- is tracked in docs/SECURITY-RLS.md. Mixing a hardening pass into
-- an outage fix is how you end up unable to say which change broke
-- what.
-- ============================================================

-- 9.1 the owner lookup. Reads projects from outside RLS, so nothing
--     that guards project_collaborators, shares or comments has to
--     reach projects through a policy any more.
create or replace function public.project_owner_is_caller(pid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.projects p
     where p.id = pid and p.owner_id = auth.uid()
  );
$fn$;

-- anon needs execute as well as authenticated: a policy that invokes
-- a function the caller cannot execute errors rather than returning
-- false, which would break every anonymous share-link read.
grant execute on function public.project_owner_is_caller(uuid) to authenticated, anon;

-- 9.2 project_collaborators — this is the edge that closed the loop.
drop policy if exists pc_select on public.project_collaborators;
create policy pc_select on public.project_collaborators
  for select using (
    user_id = auth.uid() or public.project_owner_is_caller(project_id)
  );

drop policy if exists pc_owner_write on public.project_collaborators;
create policy pc_owner_write on public.project_collaborators
  for all using      (public.project_owner_is_caller(project_id))
          with check (public.project_owner_is_caller(project_id));

-- 9.3 shares — not part of the cycle, but it reached projects the
--     same way and would have joined the cycle the moment anything
--     on projects consulted shares. Note the real policy names.
drop policy if exists sh_owner_select on public.shares;
create policy sh_owner_select on public.shares
  for select using (public.project_owner_is_caller(project_id));

drop policy if exists sh_owner_write on public.shares;
create policy sh_owner_write on public.shares
  for all using      (public.project_owner_is_caller(project_id))
          with check (public.project_owner_is_caller(project_id));

-- 9.4 comments — same treatment for the two that inlined the owner
--     lookup. cm_select already went through has_project_access and
--     is left alone.
drop policy if exists cm_update on public.comments;
create policy cm_update on public.comments
  for update using (
    author_id = auth.uid() or public.project_owner_is_caller(project_id)
  );

drop policy if exists cm_delete on public.comments;
create policy cm_delete on public.comments
  for delete using (
    author_id = auth.uid() or public.project_owner_is_caller(project_id)
  );

-- ------------------------------------------------------------
-- 9.5 VERIFICATION, run after the above. Both were run on
--     30 Sep 2026 and both passed.
--
-- (a) no policy may read the table it guards, and none may form a
--     cycle with another. The direct case, as SQL:
--
--   select c.relname,
--          (select count(*) from pg_policies p
--            where p.schemaname='public' and p.tablename=c.relname
--              and (coalesce(p.qual,'')||coalesce(p.with_check,''))
--                  ~ ('FROM ' || c.relname)) as self_reading
--     from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='r';
--
--     RESULT: self_reading = 0 for all five tables. The only
--     remaining RLS edge between tables is
--     projects -> project_collaborators, and project_collaborators
--     now has no outgoing edge, so the graph is acyclic.
--
-- (b) the check that actually matters, from outside, anonymously,
--     with the publishable key — because (a) is a claim about the
--     catalogue and this is a claim about the database:
--
--   for t in projects project_data project_collaborators shares comments; do
--     curl -s -o /dev/null -w "$t %{http_code}\n" \
--       "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" \
--       -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
--   done
--
--     BEFORE: projects 500, project_collaborators 500, shares 500
--             (42P17), project_data 200, comments 200.
--     AFTER:  all five 200, body [].
--
-- WHAT (b) DOES NOT PROVE, and this was claimed once already in
-- this project and was wrong: an empty [] from an anonymous read is
-- NOT evidence that RLS is denying anything. With RLS on and no
-- matching policy a SELECT returns [] rather than an error, so an
-- empty table and a correctly locked table are indistinguishable
-- from outside. projects is empty (0 rows, 1 user in auth.users).
-- Resolving it needs one real row to exist and then still come back
-- as [] to an anonymous caller. That check is NOT done.
-- ============================================================

-- ============================================================
-- 10. SECTIONS 6 AND 7 APPLIED, PLUS THE REPAIRS THEY NEEDED
-- ------------------------------------------------------------
-- RAN 30 SEP 2026, immediately after section 9, in this order:
-- section 6 whole, section 7 in five parts (7.0-7.4, then 7.5 in
-- three, then 7.6-7.7), then the repairs below. Every part returned
-- "Success. No rows returned" and was re-read from the catalogue
-- afterwards rather than assumed.
--
-- Sections 6 and 7 applied UNCHANGED. What follows is only the set of
-- things that were wrong once they were live, found by reading the
-- catalogue and by probing the REST API anonymously.
--
-- CONTEXT FOR ANYONE RE-RUNNING THIS FILE ON A FRESH DATABASE: the
-- repairs below are corrections to sections 5 and 7, not to section 9.
-- On a clean run they still apply, because the file's own text still
-- contains what they fix. They are appended rather than edited in
-- place, per the convention the rest of this file follows.
-- ============================================================

-- 10.1 proj_update ignored the collaborator expiry.
--
-- Section 5 writes proj_update with an INLINE collaborator test:
--   exists (select 1 from project_collaborators c
--            where c.project_id = id and c.user_id = auth.uid()
--              and c.role = 'edit')
-- and section 7.1's entire purpose is that an expired or revoked share
-- must expire the ACCESS. It added expires_at and taught
-- has_project_access() to honour it — but nothing taught proj_update,
-- because proj_update never called has_project_access().
--
-- The result was a split: an expired collaborator lost SELECT (through
-- proj_select -> has_project_access) and KEPT UPDATE. They could not
-- read the project row and could still write it. Worse for being
-- silent, since the app would show them nothing while their writes
-- still landed.
--
-- Routing it through has_project_access(id,'edit') honours the expiry,
-- matches what every other write policy in the file already does, and
-- removes the last RLS edge out of projects.
drop policy if exists proj_update on public.projects;
create policy proj_update on public.projects
  for update
  using      (public.has_project_access(id, 'edit'))
  with check (public.has_project_access(id, 'edit'));

-- 10.2 cm_update had no WITH CHECK, and section 9 did not add one.
--
-- An UPDATE policy with no WITH CHECK reuses its USING expression for
-- the NEW row. USING asks "are you the author", which stays true
-- however project_id changes — the hole section 5 documents for
-- proj_update, present on cm_update the whole time. Section 9
-- recreated this policy and left it without one, which was a chance to
-- fix it that was missed rather than a regression introduced.
drop policy if exists cm_update on public.comments;
create policy cm_update on public.comments
  for update
  using (
    author_id = auth.uid() or public.project_owner_is_caller(project_id)
  )
  with check (
    public.has_project_access(project_id, 'comment')
    and (author_id = auth.uid() or public.project_owner_is_caller(project_id))
  );

-- 10.3 sh_owner_write lost `created_by = auth.uid()`. THIS ONE WAS A
--      REGRESSION, introduced by section 9 and caught here.
--
-- Section 5's WITH CHECK is `exists(owner...) and created_by =
-- auth.uid()`. Section 9 replaced the whole expression with
-- project_owner_is_caller(project_id) and dropped the second
-- conjunct with it, so a project owner could mint a share row
-- attributed to somebody else. Restored.
drop policy if exists sh_owner_write on public.shares;
create policy sh_owner_write on public.shares
  for all
  using      (public.project_owner_is_caller(project_id))
  with check (public.project_owner_is_caller(project_id)
              and created_by = auth.uid());

-- 10.4 REVOKE FROM TWO ROLES IS NOT A REVOKE.
--
-- Section 7.1 ends with
--   revoke execute on function public.purge_expired_shares()
--     from authenticated, anon;
-- and that function DELETES ROWS. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, and revoking from two named roles
-- leaves the PUBLIC grant untouched — so anon still inherited it.
--
-- Confirmed live, not reasoned about: an anonymous POST to
-- /rest/v1/rpc/purge_expired_shares with the publishable key returned
-- 200 and the delete count. Anyone with the key, which ships in the
-- client, could purge the shares table.
--
-- account_role() and account_owner() had the same shape: granted to
-- authenticated on purpose, and to PUBLIC by accident, which handed
-- anon an account-membership oracle.
revoke execute on function public.purge_expired_shares() from public, anon, authenticated;
revoke execute on function public.account_owner(uuid)    from public, anon;
revoke execute on function public.account_role(uuid)     from public, anon;

-- The three that anon legitimately needs keep their grants, because a
-- policy invoking a function the caller cannot execute ERRORS rather
-- than returning false, which would break every share-link read:
--   has_project_access, project_owner_is_caller, resolve_share.

-- 10.5 Realtime. Section 5's publication block had never run either.
do $$
begin
  if not exists (select 1 from pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public' and tablename='project_data') then
    alter publication supabase_realtime add table public.project_data;
  end if;
  if not exists (select 1 from pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public' and tablename='comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- ------------------------------------------------------------
-- 10.6 VERIFICATION. All of this was run on 30 Sep 2026 and passed.
--
-- (a) catalogue: 20 policies across 7 tables, RLS enabled on all 7,
--     ZERO policies missing a WITH CHECK on UPDATE/ALL, and ZERO
--     policies that read any RLS-protected table. Every cross-table
--     test now goes through a security definer function, so policy
--     recursion is structurally impossible rather than merely absent:
--
--   select tablename||'.'||policyname||
--          case when cmd in ('UPDATE','ALL') and with_check is null
--               then '  <<NO WITH CHECK>>' else '' end ||
--          case when (coalesce(qual,'')||coalesce(with_check,''))
--                    ~ 'FROM (public\.)?(projects|project_collaborators|shares
--                       |comments|accounts|account_members|project_data)'
--               then '  RLS-EDGE' else '' end
--     from pg_policies where schemaname='public' order by 1;
--
-- (b) anonymous REST sweep with the publishable key:
--       all 7 tables            200 []   (accounts and account_members
--                                         no longer PGRST205)
--       POST projects           401 42501 new row violates RLS
--       POST accounts           401 42501 new row violates RLS
--       rpc purge_expired_shares 401 42501 permission denied
--       rpc account_owner        401 42501 permission denied
--       rpc account_role         401 42501 permission denied
--       rpc has_project_access   200 false
--       rpc project_owner_is_caller 200 false
--       rpc resolve_share        200 []
--
-- (c) the app: all 15 production routes plus 15 .html entries, the 3
--     legacy stubs and /shared/:token return 200; all 15 pages render
--     under Playwright with real content, zero console errors and zero
--     horizontal overflow.
--
-- STILL NOT PROVEN, and it is the same gap as before: projects holds 0
-- rows. An anonymous [] cannot distinguish "RLS denied it" from
-- "nothing is there". Every write path above is genuinely proven (a
-- 42501 is a refusal, not an empty set); every READ path is not. One
-- real row, saved by a signed-in user, then still [] to an anonymous
-- caller, closes it. Until then the read side is unverified.
-- ============================================================
