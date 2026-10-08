-- ============================================================
-- THE FILMMAKER'S STUDIO — SUPABASE SCHEMA (v3)
-- ------------------------------------------------------------
-- Run this ONCE in your Supabase project's SQL editor.
-- (https://supabase.com/dashboard → your project → SQL Editor → New Query → paste → Run)
--
-- Before running, in Authentication → URL Configuration:
--   Site URL:           https://thefilmmakerstudio.vercel.app
--   (was ak-filmmaker-studio.vercel.app, and before that it pointed at a
--    DIFFERENT app entirely — filmmakerstudio.vercel.app, the portfolio —
--    which is where every sign-in that missed the allow list was being sent.)
--   Redirect URLs:      https://thefilmmakerstudio.vercel.app/**
--                       http://localhost:**
--   BOTH NEED THE DOUBLE STAR. Supabase matches these with glob where a
--   single `*` stops at `.` and `/`, so `http://localhost:*` matched
--   `http://localhost:5173` and NOTHING with a path after it — every
--   local sign-in fell through to the Site URL instead.
--
-- And in Authentication → Providers — GOOGLE ONLY, and this is not a
-- cosmetic preference. The app ships exactly one sign-in call
-- (signInWithGoogle in src/lib/cloud.js); every other provider you
-- leave enabled is still reachable, because the anon key is public by
-- design and anyone can call this project's /auth/v1 endpoints
-- directly. A provider nobody's UI offers is a way in nobody's UI
-- shows.
--   - Enable  Google (paste your OAuth client ID + secret from Google
--             Cloud Console)
--   - DISABLE Email. This turns off both the magic-link/OTP path and
--             email+password signup. The app used to offer magic links
--             and no longer does; leaving the provider on means an
--             account can be created and a session minted without ever
--             touching Google, which is the thing "Google only" is
--             supposed to rule out.
--   - DISABLE Anonymous sign-ins, and every other provider (Apple,
--             GitHub, phone/SMS, SAML, …). Default-off, so this is a
--             check rather than a change — but check it, because an
--             anonymous session satisfies `auth.uid() is not null` and
--             therefore passes the "is the caller signed in?" half of
--             every policy below.
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
                'festivals',
                'scriptgen',
                'songs',
                'story',
                'idea_vault'
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

-- ============================================================
-- 11. CLAIM_INVITE (v8) — the account tier's missing half
-- ------------------------------------------------------------
-- NOT RUN AGAINST ANY DATABASE. Written from the file and from the
-- catalogue readings recorded in docs/SECURITY-RLS.md. Treat every
-- claim below as reasoning, not as a test result, until the live
-- checks in that document's section on this function have been run.
--
-- THE GAP THIS CLOSES, quoted from the audit (finding A6):
--   "account_members.user_id stays null until an invite is claimed,
--    and nothing in the schema ever claims one."
-- am_write requires the caller to already be an owner/admin of the
-- account they are being invited to, so an invitee cannot flip their
-- own row; am_select matches on user_id = auth.uid(), which is null
-- on a pending row, so they cannot even see it. Section 6 built the
-- invite table, section 7 hardened it, and nobody could ever join.
--
-- WHY THIS IS NOT claim_share(p_token) WITH A DIFFERENT TABLE NAME.
-- The audit suggested "a claim_invite(p_token) RPC modelled on
-- claim_share()". It is modelled on it in shape — one security
-- definer RPC, no new RLS policy, the self-claim path bypassing the
-- table's own write policy — and deliberately NOT in its credential.
--
-- A share token is a bearer credential: whoever holds the string gets
-- the access, and docs/SECURITY-RLS.md opens by saying so and by
-- noting that nothing in a database can fix it. For one project that
-- is an accepted trade. For an ACCOUNT it is not:
-- account_members.role of 'owner' or 'admin' is read by
-- has_project_access(), which grants edit on EVERY project in the
-- account, unconditionally, with no collaborator row. A forwardable
-- string that confers that is a worse credential than anything else
-- in this file, and it would also need a token column, a
-- distribution channel and an expiry — three new things, each of
-- which can be wrong.
--
-- The invite already has a credential, and the table says so in its
-- own comment: "the email is the stable key". So the authorisation
-- here is "the identity provider says you are the person this invite
-- was addressed to", which is checkable, unforwardable, and needs no
-- new column. Google is the only sign-in method the app offers, so
-- the email is attested by Google rather than typed by the claimant.
--
-- WHERE THE EMAIL COMES FROM, and why not from the JWT. auth.jwt()
-- is what comments_set_author() reads, and for a DISPLAY NAME that is
-- fine. This is an authorisation decision, so it reads auth.users
-- instead — the row the provider wrote — and requires
-- email_confirmed_at to be set. Two things follow:
--   * an anonymous Supabase session has a non-null auth.uid() and no
--     email at all, so it cannot match any invite. The is_anonymous
--     test below is belt and braces; the email requirement is the
--     belt. "Signed in" is not "has an account" anywhere in this file.
--   * an alias does not match. An invite to alice@example.com is not
--     claimable by alice+film@example.com. That is deliberate, and it
--     is the support question this will generate.
--
-- A PENDING 'owner' INVITE IS NOT CLAIMABLE, on purpose. The claim is
-- an UPDATE on account_members, so account_members_guard still fires,
-- and section 7.7 makes granting or changing an owner row owner-only
-- — the claimant is not an owner, so the guard would refuse with a
-- message about granting roles, which is not what happened. The
-- filter below excludes those rows instead, so the guard is never
-- reached and the behaviour is stated here rather than discovered.
-- To add a second owner: invite them as 'admin', let them claim, then
-- promote the row as the owner. An owner-role member can write
-- accounts (acc_update), so handing that out through a self-claim
-- flow is the one widening this function refuses to do.
--
-- SEATS. enforce_seat_limit() counts 'pending' and 'active' together
-- and returns early on an UPDATE that is not revoked -> pending/active,
-- so claiming consumes no additional seat: the invite already spent
-- it. That is correct, and it is why the trigger is not touched here.
--
-- AN EMPTY RESULT IS THE NORMAL ANSWER. The client calls this once per
-- sign-in and almost every call has nothing to claim. Raising for that
-- would make a routine sign-in look like a failure, so the sweeping
-- form (p_account_id null) returns zero rows and never raises. Naming
-- one account is a deliberate "accept this invite", so that form does
-- raise when there is nothing to accept.
-- ============================================================

-- The PK is (account_id, invited_email); an email-only lookup cannot
-- use it. Partial, because the only rows this function ever looks for
-- are the unclaimed ones.
create index if not exists account_members_email_idx
  on public.account_members(invited_email) where user_id is null;

create or replace function public.claim_invite(p_account_id uuid default null)
returns table (account_id uuid, account_name text, role text, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid         uuid := auth.uid();
  mail        text;
  claimed_ids uuid[];
begin
  if uid is null then
    raise exception 'Sign in required to accept an invite' using errcode = '42501';
  end if;

  -- An anonymous session satisfies auth.uid() is not null, which is the
  -- "are you signed in" half of every policy in this file. It is not an
  -- account. It also has no email, so the lookup below would refuse it
  -- anyway; this says so where a reader will see it.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'An anonymous session cannot accept an invite' using errcode = '42501';
  end if;

  -- The provider's row, not the token's claims. normalise_member_email()
  -- lowercases and trims invited_email on write, so compare like for like.
  select lower(trim(u.email)) into mail
    from auth.users u
   where u.id = uid
     and u.email_confirmed_at is not null
     and nullif(trim(u.email), '') is not null;

  if mail is null then
    raise exception 'A confirmed email address is required to accept an invite'
      using errcode = '42501';
  end if;

  -- security definer, so this UPDATE is not subject to am_write. That is
  -- the whole point: am_write asks whether the caller already runs the
  -- account, and an invitee by definition does not. No new policy is
  -- added, because any policy wide enough to let a stranger write this
  -- row would be wide enough to let them write somebody else's.
  --
  -- Every column reference is qualified on purpose: the OUT parameters
  -- of a `returns table` function are plpgsql variables, and this
  -- function has OUT parameters called account_id, role and status. A
  -- bare `role` or `status` in here is ambiguous at run time. Keep them
  -- qualified.
  with claimed as (
    update public.account_members m
       set user_id   = uid,
           status    = 'active',
           joined_at = now()
     where m.invited_email = mail
       and m.user_id is null
       and m.status        = 'pending'
       -- see the header: an owner row is an owner's to grant
       and m.role         <> 'owner'
       and (p_account_id is null or m.account_id = p_account_id)
       -- account_members_user_idx is unique on (account_id, user_id)
       -- where user_id is not null. Somebody invited twice under two
       -- addresses would otherwise hit 23505 instead of a clear answer.
       and not exists (
         select 1 from public.account_members x
          where x.account_id = m.account_id
            and x.user_id    = uid
       )
    returning m.account_id as acc
  )
  select array_agg(c.acc) into claimed_ids from claimed c;

  if claimed_ids is null then
    if p_account_id is not null then
      raise exception 'No invite on that account for this email address is available to claim'
        using errcode = '22023';
    end if;
    return;   -- nothing was pending. Not an error; see the header.
  end if;

  return query
    select a.id, a.name, m.role, m.status
      from public.account_members m
      join public.accounts a on a.id = m.account_id
     where m.user_id    = uid
       and m.account_id = any (claimed_ids);
end;
$fn$;

-- Section 10.4 is the reason this is two statements and not one.
-- Postgres grants EXECUTE on every new function to PUBLIC by default,
-- and `revoke ... from authenticated, anon` leaves that grant in place
-- — which is how purge_expired_shares() ended up callable with nothing
-- but the publishable key that ships in the client. Revoke from PUBLIC
-- explicitly, then grant the one role that should have it.
--
-- anon must NOT have it: this function writes account_members, and the
-- 10.4 exemption does not apply — no RLS policy invokes claim_invite(),
-- so revoking it cannot make a policy error instead of returning false.
-- The body would refuse an anonymous caller too; that is the second
-- line of defence, not the first.
revoke execute on function public.claim_invite(uuid) from public, anon;
grant  execute on function public.claim_invite(uuid) to authenticated;

-- PostgREST resolves `rpc/claim_invite` out of its schema cache.
notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 11.1 WHAT HAS NOT BEEN VERIFIED
--
-- Nothing above has run. The specific unverified assumptions, so that
-- whoever runs it knows what to watch:
--
--   a) a security definer function owned by `postgres` can SELECT
--      auth.users. The section-6 backfill reads auth.users, but from a
--      DO block in the SQL editor, which is not the same privilege
--      context. If this is wrong, claim_invite() fails on its first
--      call with 42501 "permission denied for table users", and the
--      fix is a grant on auth.users to the function's owner, not a
--      rewrite of the function.
--   b) Google sign-in sets auth.users.email_confirmed_at. If it does
--      not, every claim refuses with "A confirmed email address is
--      required" and the predicate has to be reconsidered — do NOT
--      relax it to `email is not null` without first deciding whether
--      an unconfirmed address is an identity.
--   c) a data-modifying CTE feeding `select array_agg(...) into` inside
--      plpgsql. Chosen over `get diagnostics row_count` after
--      `return query` deliberately: this shape does not depend on which
--      Postgres version started setting ROW_COUNT there.
--   d) that the OUT-parameter/column ambiguity discussed above does not
--      fire. It is a run-time error in plpgsql, not a create-time one,
--      so a successful `create function` proves nothing about it. The
--      first live call is the test.
-- ------------------------------------------------------------

-- ============================================================
-- 12. TWO MORE SYNC SCOPES: scriptgen and songs
-- ------------------------------------------------------------
-- RAN 02 OCT 2026, in two steps, on conhlrulxfwkhsnymakz. Recorded
-- here as one section, and the reason is a numbering collision worth
-- writing down rather than quietly resolving.
--
-- THESE SECTIONS WERE WRITTEN TWICE, ON TWO BRANCHES, BOTH AS "11".
-- `main` appended section 11 (claim_invite) while `revamped-ui`
-- appended its own 11 (the scriptgen scope) and 12 (songs). Nothing
-- in the SQL overlapped — both branches only ever appended — but the
-- numbers did, so merging them naively produces two section 11s and
-- a file whose numbering lies about what ran in what order.
--
-- Resolved by keeping claim_invite as 11, because it was on the trunk,
-- and folding the two scope widenings into this one section. They are
-- safe to fold: each is the same `drop constraint, add constraint`
-- against the same column, so the second already superseded the first
-- the moment it ran. Preserving both as separate sections would have
-- carried one dead statement for the sake of a chronology that the
-- next reader cannot act on. The ORDER of 11 and 12 does not matter
-- either — claim_invite touches functions, this touches a CHECK, and
-- neither reads the other.
--
-- (Section 8 is still kept verbatim under its banner, by contrast,
-- because THAT one is instructive: it never ran, and how it was wrong
-- is the lesson. A superseded statement that worked is not.)
--
-- WHAT THE TWO SCOPES HOLD
--   scriptgen  `fms_scriptgen_v1` — the synopsis-to-script job: the
--              synopsis, the agreed fifteen beats, the scene list and
--              a cursor. The beats and the scene list are the writer's
--              work rather than run state, so the key is project
--              scoped and syncs.
--   songs      `fms_songs_v1` — four to six rows on a Tamil feature,
--              each a production unit with its own days, dancers,
--              playback state and unit.
--
-- The CHECK in section 2 is edited in place as well, for a database
-- created fresh from this file. This section is what an EXISTING
-- database needs, because `create table if not exists` will not
-- re-run and a column CHECK is not replaced by re-declaring it.
--
-- The constraint name is looked up rather than typed: Postgres
-- generates `project_data_scope_check` for an inline column CHECK,
-- but a database that has been through a rename would not have it.
-- ============================================================
do $$
declare
  cname text;
begin
  select con.conname into cname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'project_data'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%scope%'
   limit 1;

  if cname is not null then
    execute format('alter table public.project_data drop constraint %I', cname);
  end if;

  alter table public.project_data
    add constraint project_data_scope_check check (scope in (
      'feature','short','library',
      'feature_prefs','short_prefs','library_prefs','activity',
      'scenes','contacts','shots','script','locations',
      'workbench','dissect','festivals','scriptgen','songs'
    ));
end $$;

-- VERIFY. cloud.js derives its scope list from Store.SCOPED_KEYS and
-- warns at load about any scoped key with no scope name, so the two
-- halves check each other; this is the half Postgres enforces.
--
--   select string_agg(m[1], ' ' order by m[1])
--     from pg_constraint con
--     join pg_class c on c.oid = con.conrelid
--     join pg_namespace n on n.oid = c.relnamespace,
--          regexp_matches(pg_get_constraintdef(con.oid),
--                         '''([a-z_]+)''::text', 'g') as m
--    where n.nspname='public' and c.relname='project_data'
--      and con.contype='c';
--
-- RESULT 02 OCT 2026, read back off the live database:
--   activity contacts dissect feature feature_prefs festivals library
--   library_prefs locations scenes script scriptgen short short_prefs
--   shots songs workbench
-- Seventeen, matching SCOPE_BY_KEY exactly.
--
-- STILL NOT RUN: section 11, claim_invite. The live catalogue holds 18
-- functions and claim_invite is not among them, so the account tier
-- still cannot be joined. That section's own header says it has never
-- been run; this is a second confirmation from the database rather
-- than a new finding.
-- ============================================================

-- ============================================================
-- 13. THE INVITE GATE, SCREENING PASSES AND THE ONE-DEVICE LOCK
-- ------------------------------------------------------------
-- RUN 5 Oct 2026 against conhlrulxfwkhsnymakz, through the dashboard's
-- SQL editor, with the full-line comments stripped and the executable
-- text verified byte-for-byte against this file first: "Success. No
-- rows returned". Verified through PostgREST afterwards: every function
-- here answers 401/42501 to anon (exists, refuses) where it answered
-- PGRST202 (missing) that morning. The 13.2 bootstrap ran the same day;
-- auth.users held ONE account, which is now the admin. The 13.8 live
-- checks are still unrun — deployed is not the same claim as behaving.
-- Written for PRD 2.0.0 sections 4.1, 4.2 and 5.
--
-- THE CLIENT NO LONGER FAILS OPEN WHILE THIS IS MISSING. It did, so
-- that the code could ship before the SQL — and the result was a
-- studio where every Google account walked straight through, which
-- is the opposite of a gate. cloud.js's runGate() now treats "the
-- function does not exist" as CLOSED (reason `notdeployed`), pauses
-- sync and says so on invite.html. So the order of operations is:
-- run this section AND section 14, bootstrap the first admin (13.2),
-- THEN deploy a build — see docs/GATE.md.
--
-- SCOPE, decided before a line was written: the gate guards the CLOUD
-- and the EXTENSION, not the local app. Somebody who opens the site
-- and writes in their own browser needs no code, no account and no
-- lock, exactly as before — locking months of local work behind an
-- invite would be the worst trade available to a writing tool. What a
-- code buys is: cloud sync, the Chrome extension, and (for an admin)
-- the console. cloud.js asks studio_status() after sign-in and stops
-- syncing for an account that has not redeemed one.
--
-- HOW THE PRD'S TABLES MAP ONTO THIS SCHEMA, and why four of its seven
-- are not created as written:
--   invite_codes          created, as specified, plus revocation,
--                         a label and the creating admin.
--   users                 NOT created. auth.users already holds the
--                         Google identity (sub, email, name); a second
--                         users table is a second copy of who somebody
--                         is. `studio_members` holds only what the PRD
--                         adds to it: role and the redeeming code.
--   user_active_sessions  created, as specified.
--   projects              NOT created. public.projects exists, owns
--                         every collaborator, share and comment row,
--                         and has live data. `stage` and `framework`
--                         are properties of the story blob, which is
--                         where the app reads them.
--   idea_vault,           NOT created as tables. Every per-project
--   story_beats           model in this app syncs as ONE jsonb blob
--                         per scope in project_data; two normalised
--                         tables beside the blob would be two
--                         representations of one thing, which
--                         CLAUDE.md names as the bug that stranded
--                         scene rows. They are scopes instead —
--                         'story' and 'idea_vault' below — with the
--                         same RLS every other scope already has.
--   script_scenes         NOT created, for the same reason: it is the
--                         existing 'scenes' scope.
--
-- THE PRE-AUTH TICKET. The PRD's flow is: verify a code (anonymous),
-- receive a ticket with a 10-minute TTL, sign in with Google, redeem
-- the ticket. The ticket is 32 random bytes, returned once, and only
-- its SHA-256 is stored — so a read of invite_tickets, by an admin or
-- by a leak, yields nothing that can be redeemed. That is the
-- "encrypted" in FR-101 delivered as something checkable.
--
-- A CODE IS NOT DECREMENTED BY VERIFYING IT. verify_invite() only
-- checks and issues a ticket; redeem_invite() is the step that spends
-- a use, under a row lock, after Google has said who is redeeming. A
-- code verified and abandoned at the consent screen costs nothing.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- 13.1 TABLES ---------------------------------------------------

create table if not exists public.invite_codes (
  id                 uuid        primary key default gen_random_uuid(),
  code               varchar(32) unique not null,
  pass_type          varchar(16) not null default 'standard'
                     check (pass_type in ('standard','screening_pass')),
  target_project_id  uuid        references public.projects(id) on delete cascade,
  max_redemptions    int         not null default 1 check (max_redemptions >= 1),
  redemptions_count  int         not null default 0 check (redemptions_count >= 0),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  label              text,
  created_by         uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  -- A screening pass is FOR a project; a standard code is not.
  constraint invite_codes_target_check check (
    (pass_type = 'screening_pass') = (target_project_id is not null)
  )
);

create table if not exists public.studio_members (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  role            varchar(32) not null default 'user' check (role in ('admin','user','guest')),
  invite_code_id  uuid        references public.invite_codes(id) on delete set null,
  disabled_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.invite_tickets (
  ticket_hash  text        primary key,
  code_id      uuid        not null references public.invite_codes(id) on delete cascade,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_by      uuid        references auth.users(id) on delete set null
);

create table if not exists public.invite_redemptions (
  id           uuid        primary key default gen_random_uuid(),
  code_id      uuid        not null references public.invite_codes(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  viewer_email text,       -- screening passes only; typed, NOT attested
  access_id    text,       -- the short id printed in the watermark
  redeemed_at  timestamptz not null default now()
);
create index if not exists invite_redemptions_code_idx on public.invite_redemptions(code_id, redeemed_at desc);

create table if not exists public.user_active_sessions (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  session_id      uuid        not null,
  last_heartbeat  timestamptz not null default now(),
  client_ip       varchar(45),
  user_agent      text
);

alter table public.invite_codes         enable row level security;
alter table public.studio_members       enable row level security;
alter table public.invite_tickets       enable row level security;
alter table public.invite_redemptions   enable row level security;
alter table public.user_active_sessions enable row level security;

-- 13.2 WHO IS AN ADMIN ------------------------------------------
-- There is no UI that makes the first admin, deliberately: anything
-- that can grant the first admin can grant the second. Run, once, as
-- the project owner in the SQL editor:
--   insert into public.studio_members (user_id, role)
--   select id, 'admin' from auth.users where email = '<you>'
--   on conflict (user_id) do update set role = 'admin';
-- VITE_ADMIN_EMAILS in the client decides who is SHOWN the console;
-- this function decides who can USE it. Visibility is not a boundary.
create or replace function public.is_studio_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.studio_members m
     where m.user_id = auth.uid() and m.role = 'admin' and m.disabled_at is null
  );
$$;
-- Invoked by the policies below, so authenticated must be able to
-- execute it (a policy calling a function the caller cannot execute
-- ERRORS — section 10.4). anon never reaches those policies.
revoke execute on function public.is_studio_admin() from public, anon;
grant  execute on function public.is_studio_admin() to authenticated;

-- Admins read everything here; nobody else reads anything directly.
-- Every write goes through a security definer RPC, so there are no
-- insert/update/delete policies at all — the absence IS the policy.
drop policy if exists ic_admin_select on public.invite_codes;
create policy ic_admin_select on public.invite_codes for select using (public.is_studio_admin());
drop policy if exists sm_select on public.studio_members;
create policy sm_select on public.studio_members for select
  using (user_id = auth.uid() or public.is_studio_admin());
drop policy if exists ir_admin_select on public.invite_redemptions;
create policy ir_admin_select on public.invite_redemptions for select using (public.is_studio_admin());
drop policy if exists uas_select on public.user_active_sessions;
create policy uas_select on public.user_active_sessions for select
  using (user_id = auth.uid() or public.is_studio_admin());
-- invite_tickets: no policy. Only the RPCs ever touch it.

-- 13.3 THE GATE ---------------------------------------------------

-- Codes are stored as typed by the generator: upper case, no spaces.
-- The client normalises too (FR-101), but the server is what decides.
create or replace function public.normalise_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Anonymous. Checks a STANDARD code and issues a ticket; spends nothing.
-- Every failure is the same sentence on purpose: "expired", "revoked"
-- and "no such code" as three answers would be an oracle telling
-- somebody guessing codes which guesses were once real.
create or replace function public.verify_invite(p_code text)
returns table (ticket text, pass_type text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  c   public.invite_codes;
  raw text;
begin
  select * into c from public.invite_codes ic
   where ic.code = public.normalise_code(p_code);
  if c.id is null
     or c.revoked_at is not null
     or (c.expires_at is not null and c.expires_at <= now())
     or c.redemptions_count >= c.max_redemptions then
    raise exception 'That code is not valid' using errcode = '22023';
  end if;
  if c.pass_type <> 'standard' then
    -- A screening pass opens the screening room; it does not make an
    -- account. Say so, rather than the generic refusal, because the
    -- holder of a real pass typed it into the wrong box.
    raise exception 'That is a screening pass — open it in the screening room' using errcode = '22023';
  end if;
  raw := encode(gen_random_bytes(32), 'hex');
  insert into public.invite_tickets (ticket_hash, code_id, expires_at)
  values (encode(digest(raw, 'sha256'), 'hex'), c.id, now() + interval '10 minutes');
  -- Expired tickets are garbage; sweep a few on the way past rather
  -- than needing a scheduled job a static app has nowhere to run.
  delete from public.invite_tickets t where t.expires_at < now() - interval '1 day';
  return query select raw, c.pass_type::text, now() + interval '10 minutes';
end;
$fn$;
revoke execute on function public.verify_invite(text) from public;
grant  execute on function public.verify_invite(text) to anon, authenticated;

-- Authenticated. Spends one use of the code behind a ticket and makes
-- the caller a member. Idempotent for somebody who is already one: a
-- returning member redeeming a second code keeps their role and does
-- NOT spend the code, so an admin cannot be demoted by a stray ticket.
create or replace function public.redeem_invite(p_ticket text)
returns table (role text, invite_code_id uuid)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  t    public.invite_tickets;
  c    public.invite_codes;
  mem  public.studio_members;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google to redeem a code' using errcode = '42501';
  end if;

  select * into mem from public.studio_members m where m.user_id = uid;
  if mem.user_id is not null and mem.disabled_at is null then
    return query select mem.role::text, mem.invite_code_id;
    return;
  end if;
  if mem.disabled_at is not null then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;

  select * into t from public.invite_tickets it
   where it.ticket_hash = encode(digest(coalesce(p_ticket, ''), 'sha256'), 'hex')
   for update;
  if t.ticket_hash is null or t.used_at is not null or t.expires_at <= now() then
    raise exception 'That sign-in took too long or the code was already used — enter the code again' using errcode = '22023';
  end if;

  -- The row lock is what makes max_redemptions a limit rather than a
  -- suggestion: two people redeeming the last use at once serialise
  -- here, and the second sees the incremented count.
  select * into c from public.invite_codes ic where ic.id = t.code_id for update;
  if c.revoked_at is not null
     or (c.expires_at is not null and c.expires_at <= now())
     or c.redemptions_count >= c.max_redemptions then
    raise exception 'That code is not valid' using errcode = '22023';
  end if;

  update public.invite_codes ic set redemptions_count = ic.redemptions_count + 1 where ic.id = c.id;
  update public.invite_tickets it set used_at = now(), used_by = uid where it.ticket_hash = t.ticket_hash;
  insert into public.invite_redemptions (code_id, user_id) values (c.id, uid);
  insert into public.studio_members (user_id, role, invite_code_id)
  values (uid, 'user', c.id)
  on conflict (user_id) do nothing;

  return query select m.role::text, m.invite_code_id from public.studio_members m where m.user_id = uid;
end;
$fn$;
revoke execute on function public.redeem_invite(text) from public, anon;
grant  execute on function public.redeem_invite(text) to authenticated;

-- What the client asks after sign-in: is this account through the gate?
-- SUPERSEDED by the definition in section 14, which adds the invite
-- request's status to the answer; kept so this section still runs on
-- its own. Section 14 drops and recreates it (the return type grows,
-- which CREATE OR REPLACE cannot do).
create or replace function public.studio_status()
returns table (registered boolean, role text, disabled boolean)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select m.user_id is not null, coalesce(m.role, '')::text, m.disabled_at is not null
    from (select 1) one
    left join public.studio_members m on m.user_id = auth.uid();
$$;
revoke execute on function public.studio_status() from public, anon;
grant  execute on function public.studio_status() to authenticated;

-- 13.4 THE ONE-DEVICE LOCK ---------------------------------------
-- FR-203/204/205. One row per user; the row IS the lock. A lock whose
-- heartbeat is older than 90 seconds is stale and anybody may take it
-- (three missed 30-second pings: one dropped packet must not cost a
-- writer their session). A fresh one held by another session_id is a
-- CONFLICT, and the client asks before calling session_takeover().
--
-- WHAT THIS IS AND IS NOT. It stops one account being used on two
-- machines at once through the extension and the cloud. It does not
-- and cannot stop the LOCAL app being opened in two tabs: that writes
-- to one browser's storage and was never the PRD's concern.
--
-- The client's IP is read from the forwarded header PostgREST exposes.
-- It is advisory — shown to an admin and in the takeover prompt — and
-- authorises nothing.

create or replace function public.session_client_ip()
returns text language sql stable as $$
  select left(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1), 45);
$$;

create or replace function public.session_require_member()
returns uuid
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.studio_members m
                  where m.user_id = uid and m.disabled_at is null) then
    -- 'P0401' maps to the PRD's 401: the client clears its session
    -- storage and returns to the gatekeeper.
    raise exception 'This account has no active invite' using errcode = 'P0401';
  end if;
  return uid;
end;
$fn$;
revoke execute on function public.session_require_member() from public, anon, authenticated;

-- Acquire. status = 'ok' | 'conflict'. On conflict nothing is written,
-- and the caller learns how recently the other session was seen and
-- on what, so the prompt can say more than "somewhere".
create or replace function public.session_acquire(p_session uuid, p_user_agent text default null)
returns table (status text, other_last_seen timestamptz, other_user_agent text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid uuid := public.session_require_member();
  cur public.user_active_sessions;
begin
  select * into cur from public.user_active_sessions s where s.user_id = uid for update;
  if cur.user_id is not null
     and cur.session_id <> p_session
     and cur.last_heartbeat > now() - interval '90 seconds' then
    return query select 'conflict'::text, cur.last_heartbeat, cur.user_agent;
    return;
  end if;
  insert into public.user_active_sessions as s (user_id, session_id, last_heartbeat, client_ip, user_agent)
  values (uid, p_session, now(), public.session_client_ip(), left(p_user_agent, 400))
  on conflict (user_id) do update
     set session_id = excluded.session_id, last_heartbeat = now(),
         client_ip = excluded.client_ip, user_agent = excluded.user_agent;
  return query select 'ok'::text, null::timestamptz, null::text;
end;
$fn$;

-- Takeover. One UPDATE under the primary key, so the swap is a single
-- statement — well inside the PRD's 250ms. The old session learns on
-- its next ping, which answers 'conflict'.
create or replace function public.session_takeover(p_session uuid, p_user_agent text default null)
returns table (status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare uid uuid := public.session_require_member();
begin
  insert into public.user_active_sessions as s (user_id, session_id, last_heartbeat, client_ip, user_agent)
  values (uid, p_session, now(), public.session_client_ip(), left(p_user_agent, 400))
  on conflict (user_id) do update
     set session_id = excluded.session_id, last_heartbeat = now(),
         client_ip = excluded.client_ip, user_agent = excluded.user_agent;
  return query select 'ok'::text;
end;
$fn$;

-- Ping. 'ok' refreshes the heartbeat; 'conflict' (the PRD's 409) means
-- somebody took the lock; a revoked member raises P0401 (the 401).
-- A ping for a session that holds NO lock — released, or swept —
-- re-acquires it if nobody else has, because a laptop that slept for
-- two minutes has not been replaced by anybody.
create or replace function public.session_ping(p_session uuid)
returns table (status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid uuid := public.session_require_member();
  cur public.user_active_sessions;
begin
  select * into cur from public.user_active_sessions s where s.user_id = uid for update;
  if cur.user_id is null
     or (cur.session_id <> p_session and cur.last_heartbeat <= now() - interval '90 seconds') then
    insert into public.user_active_sessions as s (user_id, session_id, last_heartbeat, client_ip)
    values (uid, p_session, now(), public.session_client_ip())
    on conflict (user_id) do update
       set session_id = excluded.session_id, last_heartbeat = now(), client_ip = excluded.client_ip;
    return query select 'ok'::text;
  elsif cur.session_id <> p_session then
    return query select 'conflict'::text;
  else
    update public.user_active_sessions s set last_heartbeat = now() where s.user_id = uid;
    return query select 'ok'::text;
  end if;
end;
$fn$;

-- Release. Only the holder can release; anybody else's call is a no-op,
-- so a stale tab closing cannot free a lock it lost an hour ago.
create or replace function public.session_release(p_session uuid)
returns table (status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  delete from public.user_active_sessions s
   where s.user_id = auth.uid() and s.session_id = p_session;
  return query select 'released'::text;
end;
$fn$;

revoke execute on function public.session_acquire(uuid, text)  from public, anon;
revoke execute on function public.session_takeover(uuid, text) from public, anon;
revoke execute on function public.session_ping(uuid)           from public, anon;
revoke execute on function public.session_release(uuid)        from public, anon;
grant  execute on function public.session_acquire(uuid, text)  to authenticated;
grant  execute on function public.session_takeover(uuid, text) to authenticated;
grant  execute on function public.session_ping(uuid)           to authenticated;
grant  execute on function public.session_release(uuid)        to authenticated;

-- 13.5 THE ADMIN CONSOLE ------------------------------------------
-- Codes are 12 characters from a 32-letter alphabet with no 0/O/1/I/L
-- — 60 bits, read aloud over a phone without a spelling. Generated
-- here rather than in the browser, so the randomness is the
-- database's and the client cannot choose a code.

create or replace function public.admin_create_invite(
  p_pass_type text default 'standard',
  p_max_redemptions int default 1,
  p_expires_at timestamptz default null,
  p_target_project uuid default null,
  p_label text default null
)
returns public.invite_codes
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  v text;
  row public.invite_codes;
  i int;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if p_pass_type = 'screening_pass' and p_expires_at is null then
    -- FR-103: a screening pass is time-limited by definition.
    raise exception 'A screening pass needs an expiry' using errcode = '22023';
  end if;
  loop
    bytes := gen_random_bytes(12);
    v := '';
    for i in 0..11 loop
      v := v || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes ic where ic.code = v);
  end loop;
  insert into public.invite_codes (code, pass_type, target_project_id, max_redemptions, expires_at, label, created_by)
  values (v, p_pass_type, p_target_project, greatest(1, p_max_redemptions), p_expires_at, left(p_label, 120), auth.uid())
  returning * into row;
  return row;
end;
$fn$;

create or replace function public.admin_revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  update public.invite_codes ic set revoked_at = coalesce(ic.revoked_at, now()) where ic.id = p_id;
end;
$fn$;

-- Force-terminate a device lock (FR-102). The holder's next ping finds
-- no row and, since nobody else holds it, would simply re-acquire — so
-- termination also DISABLES the member when p_disable is set, which is
-- what turns "kick this session" into "and keep them out".
create or replace function public.admin_terminate_session(p_user uuid, p_disable boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if p_user = auth.uid() and p_disable then
    raise exception 'You cannot disable your own account' using errcode = '22023';
  end if;
  delete from public.user_active_sessions s where s.user_id = p_user;
  if p_disable then
    update public.studio_members m set disabled_at = now() where m.user_id = p_user;
  end if;
end;
$fn$;

-- The console's member list needs an email, which lives in auth.users
-- and is not readable through PostgREST. Admin only.
create or replace function public.admin_list_members()
returns table (user_id uuid, email text, role text, disabled_at timestamptz,
               created_at timestamptz, last_heartbeat timestamptz, client_ip text, user_agent text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role::text, m.disabled_at, m.created_at,
           s.last_heartbeat, s.client_ip::text, s.user_agent
      from public.studio_members m
      join auth.users u on u.id = m.user_id
      left join public.user_active_sessions s on s.user_id = m.user_id
     order by m.created_at desc;
end;
$fn$;

revoke execute on function public.admin_create_invite(text, int, timestamptz, uuid, text) from public, anon;
revoke execute on function public.admin_revoke_invite(uuid)                               from public, anon;
revoke execute on function public.admin_terminate_session(uuid, boolean)                  from public, anon;
revoke execute on function public.admin_list_members()                                    from public, anon;
grant  execute on function public.admin_create_invite(text, int, timestamptz, uuid, text) to authenticated;
grant  execute on function public.admin_revoke_invite(uuid)                               to authenticated;
grant  execute on function public.admin_terminate_session(uuid, boolean)                  to authenticated;
grant  execute on function public.admin_list_members()                                    to authenticated;

-- 13.6 THE SCREENING ROOM -----------------------------------------
-- FR-103. Anonymous: a pass is the whole credential, by design — the
-- reviewer has no account. That makes the pass a BEARER token exactly
-- like a share link, with the same accepted trade, narrowed three ways:
-- it expires (required at creation), it is read-only (this function
-- returns data and writes only a log row), and it returns a FIXED set
-- of scopes — the story, the blueprint and the scenes — never
-- contacts, budget or anything with a phone number in it.
--
-- Every open is logged with the typed viewer email and a short access
-- id, and the page burns both into its watermark. The email is TYPED,
-- not attested: it identifies an honest viewer and deters a casual
-- leak, and it is labelled as such in the console.
--
-- max_redemptions on a screening pass counts OPENS. A pass for one
-- investor meeting can be set to a handful; a reload is an open.
create or replace function public.screening_open(p_code text, p_viewer_email text default null)
returns table (project_id uuid, title text, format text, access_id text,
               expires_at timestamptz, scopes jsonb)
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
     or c.redemptions_count >= c.max_redemptions then
    raise exception 'That screening pass is not valid' using errcode = '22023';
  end if;
  aid := upper(encode(gen_random_bytes(4), 'hex'));
  update public.invite_codes ic set redemptions_count = ic.redemptions_count + 1 where ic.id = c.id;
  insert into public.invite_redemptions (code_id, viewer_email, access_id)
  values (c.id, nullif(left(lower(trim(coalesce(p_viewer_email, ''))), 255), ''), aid);
  return query
    select p.id, p.title, p.format, aid, c.expires_at,
           coalesce((select jsonb_object_agg(d.scope, d.data)
                       from public.project_data d
                      where d.project_id = p.id
                        and d.scope in ('story','feature','short','scenes')), '{}'::jsonb)
      from public.projects p
     where p.id = c.target_project_id;
end;
$fn$;
revoke execute on function public.screening_open(text, text) from public;
grant  execute on function public.screening_open(text, text) to anon, authenticated;

-- 13.6b THE GATE AS A BOUNDARY, NOT A SCREEN --------------------
-- Everything above makes the gate CHECKABLE; nothing above makes it
-- BINDING. cloud.js stops syncing for a non-member, but a client that
-- skips that check could still insert projects with the publishable
-- key — the lesson VITE_ADMIN_EMAILS already taught: visibility is not
-- a boundary. So the two writes that put a studio in the cloud are
-- refused here for a signed-in user who has not redeemed a code:
--   * creating a project (projects INSERT), and
--   * writing data to a project you OWN (project_data INSERT/UPDATE).
-- A collaborator writing to SOMEBODY ELSE's project is not refused: a
-- member invited them, through a share or an account, and that grant
-- is the member's decision. Reads are not gated at all — revoking a
-- code must never make somebody's own work unreadable to them.
--
-- Additive on purpose: TRIGGERS, not edits to the existing policies,
-- so not one line of sections 1-12 changes and nothing that already
-- passes their checks can start failing for another reason.

create or replace function public.is_studio_member(p_user uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.studio_members m
                  where m.user_id = p_user and m.disabled_at is null);
$$;
revoke execute on function public.is_studio_member(uuid) from public, anon;
grant  execute on function public.is_studio_member(uuid) to authenticated;

create or replace function public.require_studio_member_projects()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- auth.uid() is null for the service role and the SQL editor, which
  -- must keep working (migrations, the admin bootstrap above).
  if auth.uid() is not null and not public.is_studio_member(auth.uid()) then
    raise exception 'Redeem an invite code to sync projects to the cloud' using errcode = 'P0401';
  end if;
  return new;
end;
$fn$;

create or replace function public.require_studio_member_data()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid;
begin
  if auth.uid() is null then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  if owner = auth.uid() and not public.is_studio_member(auth.uid()) then
    raise exception 'Redeem an invite code to sync projects to the cloud' using errcode = 'P0401';
  end if;
  return new;
end;
$fn$;

drop trigger if exists projects_require_member on public.projects;
create trigger projects_require_member before insert on public.projects
  for each row execute function public.require_studio_member_projects();
drop trigger if exists project_data_require_member on public.project_data;
create trigger project_data_require_member before insert or update on public.project_data
  for each row execute function public.require_studio_member_data();

-- GRANDFATHERING — NOW A CHOICE, NOT A DEFAULT. This used to admit
-- everybody who already owns a cloud project, so that turning the gate
-- on locked out strangers and nobody who was already here. But the
-- gate failed open for long enough that "already here" and "stranger"
-- are the same set: anyone with a Google account could sign in and
-- sync a project. Running this insert would wave all of them through.
--
-- Section 14 gives them the other route instead: they sign in, land
-- on invite.html, ask for an invite with the e-mail Google attested,
-- and an administrator approves the ones they know. Uncomment ONLY
-- if you have looked at `select owner_id from projects` and want every
-- one of them in. Idempotent either way.
--
-- insert into public.studio_members (user_id, role)
-- select distinct p.owner_id, 'user' from public.projects p
-- on conflict (user_id) do nothing;

-- 13.7 TWO MORE SYNC SCOPES: story and idea_vault ------------------
-- Same procedure as section 12, for the same reason: cloud.js derives
-- its scope list from Store.SCOPED_KEYS and warns at load about any
-- key without one, and this is the half Postgres enforces.
do $$
declare
  cname text;
begin
  select con.conname into cname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'project_data'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%scope%'
   limit 1;
  if cname is not null then
    execute format('alter table public.project_data drop constraint %I', cname);
  end if;
  alter table public.project_data
    add constraint project_data_scope_check check (scope in (
      'feature','short','library',
      'feature_prefs','short_prefs','library_prefs','activity',
      'scenes','contacts','shots','script','locations',
      'workbench','dissect','festivals','scriptgen','songs',
      'story','idea_vault'
    ));
end $$;

notify pgrst, 'reload schema';

-- 13.8 CHECKS TO RUN, none of which has been run yet ---------------
--  1. anon: rpc/verify_invite with a real standard code -> a ticket;
--     with a revoked, expired, exhausted or made-up code -> the SAME
--     sentence each time.
--  2. anon: rpc/redeem_invite -> 42501 (no grant).
--  3. signed in, no membership: redeem a fresh ticket -> role 'user',
--     redemptions_count + 1; redeem the same ticket again -> refused.
--  4. two sessions redeeming the last use of a one-use code at once:
--     exactly one succeeds.
--  5. session_acquire from A -> ok; from B within 90s -> conflict;
--     session_takeover from B -> ok; session_ping from A -> conflict.
--  6. stop pinging from B for 91s; session_acquire from A -> ok.
--  7. admin_terminate_session(B, true); session_ping from B -> P0401.
--  8. a non-admin calling any admin_* -> 42501; selecting invite_codes
--     -> zero rows, not an error.
--  9. anon: screening_open with a valid pass -> the four scopes and
--     nothing else; after expires_at -> refused.
-- 10. anon: rpc/session_require_member -> refused (no grant to anyone).
-- 11. signed in, no membership: insert into projects -> P0401; upsert
--     project_data on a project you own -> P0401; on a project shared
--     with you for edit -> allowed.
-- 12. after running this section, NO owner_id in projects has gained a
--     studio_members row unless the grandfathering insert was run on
--     purpose (it is commented out above).
-- ============================================================


-- ============================================================
-- 14. INVITE REQUESTS — the queue behind the gate
-- ------------------------------------------------------------
-- RUN 5 Oct 2026, immediately after section 13, the same way (see its
-- header): "Success. No rows returned", and request_invite answers
-- 401/42501 to anon through PostgREST. The 14.5 live checks are still
-- unrun. docs/GATE.md is the runbook.
--
-- THE FLOW THIS COMPLETES. Section 13 lets somebody in who was HANDED
-- a code. It had no answer for somebody who was not: they signed in,
-- the gate closed, and the only move left was to e-mail the owner.
-- Now: sign in with Google first, so the address is attested rather
-- than typed; if the account is not a member, invite.html offers two
-- routes — a code, or REQUEST AN INVITE, which queues the account's
-- login details (the Google e-mail and name, when it was asked, what
-- they wrote, which browser) for an administrator, who approves or
-- declines from the console on settings.html. Approval IS membership:
-- it writes the studio_members row directly, no code changes hands,
-- and the requester is through the gate on their next load.
--
-- WHY THE ROW IS KEYED BY user_id AND NOT BY E-MAIL. The request is
-- made by a signed-in account and can only be made for that account,
-- so there is nothing to type and nothing to forge: `email` and
-- `display_name` are copied out of auth.users by the function, never
-- accepted from the client. One row per account; asking again after
-- a decline updates the row rather than adding a second.
--
-- WHAT A NON-ADMIN CAN SEE. Their own row, and nothing else — the
-- select policy below. Every write goes through a security definer
-- RPC, so there are no insert/update/delete policies, as in 13.
-- ============================================================

create table if not exists public.invite_requests (
  user_id        uuid        primary key references auth.users(id) on delete cascade,
  email          text        not null,
  display_name   text,
  note           text,
  user_agent     text,
  status         varchar(16) not null default 'pending'
                 check (status in ('pending','approved','declined')),
  times_asked    int         not null default 1,
  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid        references auth.users(id) on delete set null,
  decision_note  text
);
create index if not exists invite_requests_status_idx on public.invite_requests(status, requested_at desc);
alter table public.invite_requests enable row level security;

drop policy if exists ireq_select on public.invite_requests;
create policy ireq_select on public.invite_requests for select
  using (user_id = auth.uid() or public.is_studio_admin());

-- 14.1 THE REQUEST ---------------------------------------------------
-- Authenticated. Idempotent while pending. A DECLINED account may ask
-- again after seven days — long enough that a decline is not undone by
-- the next click, short enough that a mistaken one is not forever —
-- and the row keeps count of how often it has asked. Nothing is ever
-- deleted; the console reads the history off the same row.
create or replace function public.request_invite(p_note text default null, p_user_agent text default null)
returns table (status text, requested_at timestamptz, decided_at timestamptz, decision_note text, times_asked int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid   uuid := auth.uid();
  u     auth.users;
  r     public.invite_requests;
  nm    text;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google to request an invite' using errcode = '42501';
  end if;
  if public.is_studio_member(uid) then
    -- Nothing to ask for. Say so rather than queueing a request an
    -- administrator would have to read and discard.
    raise exception 'This account is already a member' using errcode = '22023';
  end if;
  select * into u from auth.users au where au.id = uid;
  nm := nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '');

  select * into r from public.invite_requests ir where ir.user_id = uid for update;
  if r.user_id is null then
    insert into public.invite_requests (user_id, email, display_name, note, user_agent)
    values (uid, u.email, nm, nullif(left(trim(coalesce(p_note, '')), 1000), ''), left(p_user_agent, 300));
  elsif r.status = 'pending' then
    -- Asked already and still waiting: refresh what they wrote, keep the
    -- place in the queue.
    update public.invite_requests ir
       set note = coalesce(nullif(left(trim(coalesce(p_note, '')), 1000), ''), ir.note),
           user_agent = coalesce(left(p_user_agent, 300), ir.user_agent),
           email = u.email, display_name = coalesce(nm, ir.display_name)
     where ir.user_id = uid;
  elsif r.status = 'declined' and r.decided_at > now() - interval '7 days' then
    raise exception 'This request was declined on %. You can ask again from %.',
      to_char(r.decided_at, 'DD Mon YYYY'), to_char(r.decided_at + interval '7 days', 'DD Mon YYYY')
      using errcode = '22023';
  else
    -- Declined long enough ago, or approved and since disabled: a fresh ask.
    update public.invite_requests ir
       set status = 'pending', requested_at = now(), times_asked = ir.times_asked + 1,
           decided_at = null, decided_by = null, decision_note = null,
           note = nullif(left(trim(coalesce(p_note, '')), 1000), ''),
           user_agent = left(p_user_agent, 300), email = u.email, display_name = coalesce(nm, ir.display_name)
     where ir.user_id = uid;
  end if;

  return query
    select ir.status::text, ir.requested_at, ir.decided_at, ir.decision_note, ir.times_asked
      from public.invite_requests ir where ir.user_id = uid;
end;
$fn$;
revoke execute on function public.request_invite(text, text) from public, anon;
grant  execute on function public.request_invite(text, text) to authenticated;

-- 14.2 THE STATUS, WIDENED -------------------------------------------
-- One round trip after sign-in answers everything invite.html needs:
-- membership, and if there is none, where the request stands. For an
-- admin it also counts the queue, so the account menu can say "3
-- requests waiting" without a second query; everybody else reads 0.
drop function if exists public.studio_status();
create or replace function public.studio_status()
returns table (registered boolean, role text, disabled boolean,
               request_status text, requested_at timestamptz, decided_at timestamptz,
               decision_note text, pending_requests int)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select m.user_id is not null,
         coalesce(m.role, '')::text,
         m.disabled_at is not null,
         coalesce(r.status, '')::text,
         r.requested_at,
         r.decided_at,
         r.decision_note,
         case when m.role = 'admin' and m.disabled_at is null
              then (select count(*)::int from public.invite_requests q where q.status = 'pending')
              else 0 end
    from (select 1) one
    left join public.studio_members  m on m.user_id = auth.uid()
    left join public.invite_requests r on r.user_id = auth.uid();
$$;
revoke execute on function public.studio_status() from public, anon;
grant  execute on function public.studio_status() to authenticated;

-- 14.3 THE CONSOLE -----------------------------------------------------
create or replace function public.admin_list_requests(p_status text default null)
returns table (user_id uuid, email text, display_name text, note text, user_agent text,
               status text, times_asked int, requested_at timestamptz,
               decided_at timestamptz, decided_by_email text, decision_note text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  return query
    select r.user_id, r.email, r.display_name, r.note, r.user_agent,
           r.status::text, r.times_asked, r.requested_at,
           r.decided_at, d.email::text, r.decision_note
      from public.invite_requests r
      left join auth.users d on d.id = r.decided_by
     where p_status is null or r.status = p_status
     order by (r.status = 'pending') desc, r.requested_at desc
     limit 500;
end;
$fn$;

-- Approve = membership, directly. A member who was disabled and asks
-- again is re-enabled by the same path (the ON CONFLICT branch), which
-- is the one way back in after admin_terminate_session(…, true).
create or replace function public.admin_decide_request(p_user uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.invite_requests;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  select * into r from public.invite_requests ir where ir.user_id = p_user for update;
  if r.user_id is null then
    raise exception 'No such request' using errcode = '22023';
  end if;
  if p_approve then
    insert into public.studio_members (user_id, role)
    values (p_user, 'user')
    on conflict (user_id) do update set disabled_at = null;
  end if;
  update public.invite_requests ir
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_at = now(), decided_by = auth.uid(),
         decision_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
   where ir.user_id = p_user;
end;
$fn$;

revoke execute on function public.admin_list_requests(text)                from public, anon;
revoke execute on function public.admin_decide_request(uuid, boolean, text) from public, anon;
grant  execute on function public.admin_list_requests(text)                to authenticated;
grant  execute on function public.admin_decide_request(uuid, boolean, text) to authenticated;

-- 14.4 A CODE CLOSES THE REQUEST TOO --------------------------------
-- Somebody who asked, and then got a code from a friend, must not sit
-- in the queue as a pending stranger. Membership arriving by ANY route
-- (redeem_invite, admin_decide_request, the 13.2 bootstrap) marks their
-- request approved.
create or replace function public.invite_requests_close_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.invite_requests ir
     set status = 'approved', decided_at = coalesce(ir.decided_at, now())
   where ir.user_id = new.user_id and ir.status = 'pending';
  return new;
end;
$fn$;
drop trigger if exists studio_members_close_request on public.studio_members;
create trigger studio_members_close_request after insert on public.studio_members
  for each row execute function public.invite_requests_close_on_membership();

notify pgrst, 'reload schema';

-- 14.5 CHECKS TO RUN, none of which has been run yet ---------------
--  1. anon: rpc/request_invite -> 42501 (no grant).
--  2. signed in, no membership: request_invite('hello') -> pending,
--     times_asked 1; again -> still pending, note updated, times_asked
--     unchanged; select from invite_requests -> exactly one row, own.
--  3. a member calling request_invite -> 22023 'already a member'.
--  4. non-admin: admin_list_requests -> 42501; admin: the row from 2,
--     with the Google e-mail and name (not anything the client sent).
--  5. admin_decide_request(B, true): B has a studio_members row, the
--     request reads approved; B's studio_status -> registered.
--  6. admin_decide_request(C, false, 'not now'): C's studio_status
--     carries request_status 'declined' and the note; C calling
--     request_invite within 7 days -> 22023 naming the date.
--  7. D requests, then redeems a code: D's request reads approved
--     without any admin action (the trigger).
--  8. a disabled member (13.5) requests -> pending; approve -> their
--     disabled_at is null again.
--  9. admin's studio_status.pending_requests equals the pending count;
--     a non-admin's is 0 whatever the queue holds.
-- ============================================================


-- ============================================================
-- 15. THE APPLICATION CONSOLE — what the whole studio looks like
-- ------------------------------------------------------------
-- RUN 5 Oct 2026 against conhlrulxfwkhsnymakz, the same way as 13 and
-- 14 (see 13's header): "Success. No rows returned", and all three
-- functions answer 401/42501 to anon through PostgREST. The 15.1 live
-- checks are still unrun. Written for admin.html.
--
-- Three read-only RPCs for an administrator (is_studio_admin(), the
-- same check every admin_* function makes): the counts that describe
-- the application as a whole, the organisations (accounts) in it, and
-- everybody who has ever signed in — members, requesters and strangers
-- alike, which is the one list nothing else here can show, because a
-- non-member has no row anywhere but auth.users.
--
-- All three are security definer so they can read auth.users, and all
-- three refuse a non-admin with 42501 before touching anything. None
-- writes. They are COUNTS and LISTS, not controls: every action an
-- administrator can take still goes through sections 13 and 14.
-- ============================================================

create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_total',             (select count(*) from auth.users),
    'users_active_7d',         (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'users_new_30d',           (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'members_active',          (select count(*) from public.studio_members where disabled_at is null),
    'members_admin',           (select count(*) from public.studio_members where role = 'admin' and disabled_at is null),
    'members_disabled',        (select count(*) from public.studio_members where disabled_at is not null),
    'requests_pending',        (select count(*) from public.invite_requests where status = 'pending'),
    'requests_approved',       (select count(*) from public.invite_requests where status = 'approved'),
    'requests_declined',       (select count(*) from public.invite_requests where status = 'declined'),
    'accounts',                (select count(*) from public.accounts),
    'account_members_active',  (select count(*) from public.account_members where status = 'active'),
    'account_members_pending', (select count(*) from public.account_members where status = 'pending'),
    'projects',                (select count(*) from public.projects),
    'projects_new_30d',        (select count(*) from public.projects where created_at > now() - interval '30 days'),
    'projects_updated_7d',     (select count(*) from public.projects where updated_at > now() - interval '7 days'),
    'collaborators',           (select count(*) from public.project_collaborators),
    'shares_live',             (select count(*) from public.shares where expires_at is null or expires_at > now()),
    'sessions_live',           (select count(*) from public.user_active_sessions where last_heartbeat > now() - interval '90 seconds'),
    'sessions_24h',            (select count(*) from public.user_active_sessions where last_heartbeat > now() - interval '24 hours'),
    'codes_active',            (select count(*) from public.invite_codes
                                 where revoked_at is null and (expires_at is null or expires_at > now())
                                   and redemptions_count < max_redemptions),
    'generated_at',            now()
  );
end;
$fn$;

create or replace function public.admin_list_accounts()
returns table (id uuid, name text, owner_email text, plan text, seat_limit int,
               seats_used int, members_pending int, projects int, created_at timestamptz)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  return query
    select a.id, a.name, u.email::text, a.plan, a.seat_limit,
           (select count(*)::int from public.account_members m where m.account_id = a.id and m.status = 'active'),
           (select count(*)::int from public.account_members m where m.account_id = a.id and m.status = 'pending'),
           (select count(*) from public.projects p where p.account_id = a.id)::int,
           a.created_at
      from public.accounts a
      left join auth.users u on u.id = a.owner_id
     order by a.created_at desc
     limit 500;
end;
$fn$;

create or replace function public.admin_list_users()
returns table (user_id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz,
               studio_role text, disabled_at timestamptz, request_status text,
               projects int, accounts int, last_heartbeat timestamptz)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text,
           nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ''),
           u.created_at, u.last_sign_in_at,
           coalesce(m.role, '')::text, m.disabled_at,
           coalesce(r.status, '')::text,
           (select count(*)::int from public.projects p where p.owner_id = u.id),
           (select count(*)::int from public.account_members am where am.user_id = u.id and am.status = 'active'),
           s.last_heartbeat
      from auth.users u
      left join public.studio_members m on m.user_id = u.id
      left join public.invite_requests r on r.user_id = u.id
      left join public.user_active_sessions s on s.user_id = u.id
     order by u.last_sign_in_at desc nulls last, u.created_at desc
     limit 1000;
end;
$fn$;

revoke execute on function public.admin_overview()      from public, anon;
revoke execute on function public.admin_list_accounts() from public, anon;
revoke execute on function public.admin_list_users()    from public, anon;
grant  execute on function public.admin_overview()      to authenticated;
grant  execute on function public.admin_list_accounts() to authenticated;
grant  execute on function public.admin_list_users()    to authenticated;

notify pgrst, 'reload schema';

-- 15.1 CHECKS TO RUN, none of which has been run yet ---------------
--  1. anon: any of the three -> 42501 (no grant).
--  2. a member who is not an admin: any of the three -> 42501.
--  3. admin: admin_overview().users_total equals select count(*) from
--     auth.users; members_active equals the console's member count.
--  4. admin: admin_list_users() includes an account that has signed in
--     but never asked or redeemed (studio_role '' and request_status '').
-- ============================================================


-- ============================================================
-- 16. BILLING — plans, Razorpay payments, and the limits a plan buys
-- ------------------------------------------------------------
-- RUN 6 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor (§16 and §17 together, comments stripped, the text
-- verified byte-for-byte against this file first): "Success. No rows
-- returned". Verified through PostgREST afterwards: every function
-- here answers 401/42501 to anon where admin_billing_overview had
-- answered PGRST202 from the live console that morning. The EDGE
-- FUNCTIONS (rzp-order, rzp-verify, rzp-webhook) and the Razorpay
-- secrets are NOT deployed — those need a personal access token and
-- a Razorpay account, docs/BILLING.md §1 steps 2-5 — so the plans,
-- the limits and the console's billing view are live and a purchase
-- is not yet possible. Written for the owner's ask of 5 Oct 2026: Razorpay payments, three paid tiers, prices set from the
-- console, restrictions by plan. Decisions taken before a line was
-- written, each one asked:
--   * PREPAID PERIODS, not mandates. One Razorpay Order buys a plan for
--     30 or 365 days; nothing recurs. A price change in the console
--     takes effect on the next purchase and needs no Razorpay object.
--   * THE PLAN SITS ON THE ORGANISATION (accounts.plan, which section 6
--     reserved for exactly this and accounts_guard has defended as
--     "set by billing" since). A buyer who owns no organisation gets
--     one made for them at activation, so nobody has to know what an
--     organisation is to pay.
--   * PAYING GRANTS ENTRY. Activation inserts the studio_members row,
--     so a stranger who pays is through the gate (sections 13-14)
--     without a code. A DISABLED member cannot buy their way back in:
--     create_pending_payment refuses them before an order exists.
--   * LIMITS ARE ENFORCED HERE, in triggers, and merely EXPLAINED in the
--     UI. Local work is never limited; what a plan caps is the cloud —
--     projects synced, share links live, collaborators per project,
--     organisation seats — and the extension, which the client gates
--     (the server cannot tell an extension request from a page's).
--
-- WHO WRITES WHAT. The three Razorpay edge functions run as the
-- service role and call create_pending_payment / activate_payment /
-- mark_payment_*; those refuse any other caller. The console's three
-- admin_* RPCs re-check is_studio_admin(). The browser can only READ:
-- the active plans, its own payments, and billing_status().
--
-- A LAPSE IS COMPUTED, NEVER SCHEDULED. accounts.plan keeps the last
-- plan bought; account_plan() answers 'free' once plan_until is past.
-- No cron, nothing to forget to run.
--
-- ERROR CODE P0402 is "your plan does not allow this" everywhere below
-- (P0401 is the gate's "no invite"). cloud.js maps it to a toast with
-- the limit and the plan named, and an upgrade link.
-- ============================================================

-- 16.1 PLANS ------------------------------------------------------
-- `limits` keys: projects, collaborators, shares, seats (integers; a
-- JSON null = unlimited) and extension (boolean). The seed prices are
-- PLACEHOLDERS for the console to overwrite; nothing below depends on
-- the numbers. monthly_paise/yearly_paise of 0 means "not sold at this
-- period" (free is never for sale).
create table if not exists public.plans (
  id             text        primary key check (id in ('free','starter','indie','pro')),
  name           text        not null,
  blurb          text        not null default '',
  monthly_paise  int         not null default 0 check (monthly_paise >= 0),
  yearly_paise   int         not null default 0 check (yearly_paise >= 0),
  limits         jsonb       not null default '{}'::jsonb,
  sort           int         not null default 0,
  active         boolean     not null default true,
  updated_at     timestamptz not null default now(),
  updated_by     uuid        references auth.users(id) on delete set null
);
insert into public.plans (id, name, blurb, monthly_paise, yearly_paise, limits, sort) values
  ('free',    'Free',    'Admitted, unpaid. One film in the cloud.',
     0, 0, '{"projects":1,"collaborators":0,"shares":0,"seats":1,"extension":false}', 0),
  ('starter', 'Starter', 'One writer, a few films, a couple of readers.',
     29900, 299900, '{"projects":3,"collaborators":2,"shares":3,"seats":1,"extension":true}', 1),
  ('indie',   'Indie',   'A small team taking a film through production.',
     79900, 799900, '{"projects":10,"collaborators":5,"shares":10,"seats":3,"extension":true}', 2),
  ('pro',     'Pro',     'A production house. No caps.',
     199900, 1999900, '{"projects":null,"collaborators":null,"shares":null,"seats":10,"extension":true}', 3)
on conflict (id) do nothing;

alter table public.plans enable row level security;
drop policy if exists plans_select on public.plans;
-- Prices are shown to a signed-in non-member on invite.html, so
-- authenticated reads them; anon has no page that needs them.
create policy plans_select on public.plans for select to authenticated using (true);

create or replace function public.plan_rank(p text)
returns int language sql immutable as $$
  select case p when 'pro' then 3 when 'indie' then 2 when 'starter' then 1 else 0 end;
$$;

-- 16.2 THE ORGANISATION'S PLAN, WITH AN EXPIRY ---------------------
alter table public.accounts add column if not exists plan_until  timestamptz;
alter table public.accounts add column if not exists plan_period text check (plan_period in ('month','year','grant'));

/** The plan an account is on RIGHT NOW: what it bought, unless that has
 *  lapsed. */
create or replace function public.account_plan(p_account uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when a.plan = 'free' then 'free'
              when a.plan_until is null or a.plan_until > now() then a.plan
              else 'free' end
    from public.accounts a where a.id = p_account;
$$;

/** The plan a USER is on: the best current plan among the organisations
 *  they own, else free. Owned, not merely joined — a seat on somebody
 *  else's Pro does not make your own films Pro. */
create or replace function public.user_plan(p_user uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select public.account_plan(a.id) from public.accounts a
      where a.owner_id = p_user
      order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last
      limit 1),
    'free');
$$;

create or replace function public.user_limits(p_user uuid default auth.uid())
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.limits from public.plans p where p.id = public.user_plan(p_user)), '{}'::jsonb);
$$;

/** An integer cap, or null for unlimited (missing key = unlimited too). */
create or replace function public.plan_cap(p_limits jsonb, p_key text)
returns int language sql immutable as $$
  select case when p_limits ? p_key and jsonb_typeof(p_limits -> p_key) = 'number'
              then (p_limits ->> p_key)::int else null end;
$$;

revoke execute on function public.account_plan(uuid)  from public, anon;
revoke execute on function public.user_plan(uuid)     from public, anon;
revoke execute on function public.user_limits(uuid)   from public, anon;
grant  execute on function public.account_plan(uuid)  to authenticated;
grant  execute on function public.user_plan(uuid)     to authenticated;
grant  execute on function public.user_limits(uuid)   to authenticated;

-- 16.3 PAYMENTS ----------------------------------------------------
create table if not exists public.payments (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  account_id           uuid        references public.accounts(id) on delete set null,
  plan_id              text        not null references public.plans(id),
  period               text        not null check (period in ('month','year','grant')),
  amount_paise         int         not null check (amount_paise >= 0),
  currency             text        not null default 'INR',
  razorpay_order_id    text        unique,
  razorpay_payment_id  text        unique,
  status               text        not null default 'created'
                       check (status in ('created','paid','failed','refunded','granted')),
  note                 text,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz,
  starts_at            timestamptz,
  ends_at              timestamptz,
  raw                  jsonb
);
create index if not exists payments_user_idx on public.payments(user_id, created_at desc);
alter table public.payments enable row level security;
drop policy if exists pay_select_own on public.payments;
create policy pay_select_own on public.payments for select using (user_id = auth.uid());
-- No insert/update/delete policies: the service-role functions below
-- are the only writers, and they bypass RLS.

-- 16.4 accounts_guard LEARNS ONE MORE CALLER -----------------------
-- Section 7's guard lets the SERVICE ROLE change plan and limits and
-- nobody else. The console's admin_grant_plan runs as an administrator
-- through PostgREST, so auth.jwt()->>'role' is 'authenticated' even
-- inside a security definer body and is_privileged_caller() says no.
-- apply_plan() therefore raises a transaction-local flag the guard
-- honours. `set local` dies with the transaction; a client cannot set
-- it, because the only statements a client runs are the ones RLS and
-- these functions let through.
create or replace function public.accounts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_privileged_caller() then return new; end if;
  if current_setting('fms.billing', true) = 'on' then return new; end if;
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then
    raise exception 'Only the account owner can transfer the account' using errcode = '42501';
  end if;
  if new.plan             is distinct from old.plan
  or new.plan_until       is distinct from old.plan_until
  or new.plan_period      is distinct from old.plan_period
  or new.seat_limit       is distinct from old.seat_limit
  or new.storage_limit_mb is distinct from old.storage_limit_mb then
    raise exception 'Plan and limits are set by billing, not by the client' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 16.5 APPLYING A PLAN ---------------------------------------------
-- Internal. Renewing the SAME tier before it lapses extends from the
-- current expiry, so paying early never loses days; buying a different
-- tier starts today (an upgrade is wanted now; a downgrade is a choice).
create or replace function public.apply_plan(p_account uuid, p_plan text, p_period text, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  a      public.accounts;
  lim    jsonb;
  start  timestamptz := now();
  until  timestamptz;
begin
  select * into a from public.accounts x where x.id = p_account for update;
  if a.id is null then raise exception 'No such account' using errcode = '22023'; end if;
  select limits into lim from public.plans p where p.id = p_plan;
  if lim is null then raise exception 'No such plan' using errcode = '22023'; end if;
  if a.plan = p_plan and a.plan_until is not null and a.plan_until > now() then start := a.plan_until; end if;
  until := start + make_interval(days => p_days);
  perform set_config('fms.billing', 'on', true);
  update public.accounts x
     set plan = p_plan, plan_until = until, plan_period = p_period,
         seat_limit = greatest(1, coalesce(public.plan_cap(lim, 'seats'), 1000)),
         updated_at = now()
   where x.id = p_account;
  return until;
end;
$fn$;
revoke execute on function public.apply_plan(uuid, text, text, int) from public, anon, authenticated;

/** The organisation a payment lands on: the one named on the row, else
 *  the newest one the buyer owns, else a new one in their name. */
create or replace function public.account_for_buyer(p_user uuid, p_account uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  acc  uuid;
  nm   text;
  mail text;
begin
  if p_account is not null then
    select id into acc from public.accounts a where a.id = p_account and a.owner_id = p_user;
    if acc is not null then return acc; end if;
  end if;
  select id into acc from public.accounts a where a.owner_id = p_user order by a.created_at desc limit 1;
  if acc is not null then return acc; end if;
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)), lower(u.email)
    into nm, mail from auth.users u where u.id = p_user;
  insert into public.accounts (name, owner_id) values (coalesce(nm, 'My') || '''s Studio', p_user) returning id into acc;
  insert into public.account_members (account_id, invited_email, user_id, role, status, invited_by, joined_at)
  values (acc, coalesce(mail, p_user::text), p_user, 'owner', 'active', p_user, now())
  on conflict do nothing;
  return acc;
end;
$fn$;
revoke execute on function public.account_for_buyer(uuid, uuid) from public, anon, authenticated;

-- 16.6 THE SERVICE-ROLE SURFACE (the edge functions) ---------------
create or replace function public.billing_require_service()
returns void language plpgsql as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'Billing functions are called by the payment service only' using errcode = '42501';
  end if;
end; $$;
revoke execute on function public.billing_require_service() from public, anon, authenticated;

/** rzp-order: record the intent before the Razorpay order exists, so a
 *  failure between the two leaves a 'created' row and never a charge
 *  without a record. Refuses a disabled member and a plan not for sale. */
create or replace function public.create_pending_payment(p_user uuid, p_plan text, p_period text, p_account uuid default null)
returns table (payment_id uuid, amount_paise int, currency text, plan_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  amt int;
  pid uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  amt := case p_period when 'month' then pl.monthly_paise when 'year' then pl.yearly_paise else 0 end;
  if coalesce(amt, 0) <= 0 then raise exception 'That plan is not sold %ly', p_period using errcode = '22023'; end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise)
  values (p_user, p_account, p_plan, p_period, amt) returning id into pid;
  return query select pid, amt, 'INR'::text, pl.name;
end;
$fn$;

create or replace function public.attach_razorpay_order(p_payment uuid, p_order_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.billing_require_service();
  update public.payments set razorpay_order_id = p_order_id where id = p_payment and status = 'created';
end;
$fn$;

/** The one activation, reached from rzp-verify AND rzp-webhook, so a
 *  payment the browser never reported still lands. Idempotent on the
 *  payment id: the second caller finds 'paid' and returns the same row. */
create or replace function public.activate_payment(p_order_id text, p_payment_id text, p_raw jsonb default null)
returns table (payment_id uuid, account_id uuid, plan_id text, ends_at timestamptz, already boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay   public.payments;
  acc   uuid;
  days  int;
  until timestamptz;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    return query select pay.id, pay.account_id, pay.plan_id, pay.ends_at, true;
    return;
  end if;
  if pay.status <> 'created' and pay.status <> 'failed' then
    raise exception 'Payment is %', pay.status using errcode = '22023';
  end if;
  acc  := public.account_for_buyer(pay.user_id, pay.account_id);
  days := case pay.period when 'month' then 30 when 'year' then 365 else 0 end;
  until := public.apply_plan(acc, pay.plan_id, pay.period, days);
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc, starts_at = until - make_interval(days => days), ends_at = until,
         raw = coalesce(p_raw, p.raw)
   where p.id = pay.id;
  -- PAYING GRANTS ENTRY. A new member, or an existing one untouched;
  -- never a disabled one re-enabled (create_pending_payment refused them).
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, until, false;
end;
$fn$;

create or replace function public.mark_payment_failed(p_order_id text, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.billing_require_service();
  update public.payments p set status = 'failed', raw = coalesce(p_raw, p.raw)
   where p.razorpay_order_id = p_order_id and p.status = 'created';
end;
$fn$;

/** A refund ends the plan it bought, today. The row keeps its history. */
create or replace function public.mark_payment_refunded(p_payment_id text, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare pay public.payments;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_payment_id = p_payment_id for update;
  if pay.id is null then return; end if;
  update public.payments p set status = 'refunded', raw = coalesce(p_raw, p.raw) where p.id = pay.id;
  if pay.account_id is not null then
    perform set_config('fms.billing', 'on', true);
    update public.accounts a set plan_until = least(a.plan_until, now()), updated_at = now()
     where a.id = pay.account_id and a.plan = pay.plan_id;
  end if;
end;
$fn$;

revoke execute on function public.create_pending_payment(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.attach_razorpay_order(uuid, text)              from public, anon, authenticated;
revoke execute on function public.activate_payment(text, text, jsonb)            from public, anon, authenticated;
revoke execute on function public.mark_payment_failed(text, jsonb)               from public, anon, authenticated;
revoke execute on function public.mark_payment_refunded(text, jsonb)             from public, anon, authenticated;

-- 16.7 WHAT THE BROWSER ASKS -----------------------------------------
/** The signed-in user's plan, limits and usage, in one call. */
create or replace function public.billing_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  pl   text;
  acc  public.accounts;
  lim  jsonb;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  pl := public.user_plan(uid);
  select * into acc from public.accounts a where a.owner_id = uid
   order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last limit 1;
  lim := public.user_limits(uid);
  return jsonb_build_object(
    'plan',        pl,
    'plan_name',   (select name from public.plans where id = pl),
    'limits',      lim,
    'account_id',  acc.id,
    'account_name', acc.name,
    'plan_until',  case when pl <> 'free' then acc.plan_until end,
    'bought_plan', acc.plan,
    'lapsed',      acc.plan is not null and acc.plan <> 'free' and acc.plan_until is not null and acc.plan_until <= now(),
    'disabled',    exists (select 1 from public.studio_members m where m.user_id = uid and m.disabled_at is not null),
    'member',      exists (select 1 from public.studio_members m where m.user_id = uid and m.disabled_at is null),
    'usage', jsonb_build_object(
      'projects',      (select count(*) from public.projects p where p.owner_id = uid),
      'shares',        (select count(*) from public.shares s join public.projects p on p.id = s.project_id
                         where p.owner_id = uid and (s.expires_at is null or s.expires_at > now())),
      'collaborators', (select coalesce(max(c), 0) from (select count(*) c from public.project_collaborators pc
                         join public.projects p on p.id = pc.project_id where p.owner_id = uid group by pc.project_id) t),
      'seats',         (select count(*) from public.account_members am where am.account_id = acc.id and am.status in ('pending','active'))
    ),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'plan_id', x.plan_id, 'period', x.period,
                   'amount_paise', x.amount_paise, 'status', x.status, 'created_at', x.created_at, 'ends_at', x.ends_at)
                   order by x.created_at desc)
                  from (select * from public.payments q where q.user_id = uid order by q.created_at desc limit 12) x), '[]'::jsonb)
  );
end;
$fn$;
revoke execute on function public.billing_status() from public, anon;
grant  execute on function public.billing_status() to authenticated;

-- 16.8 THE LIMITS, ENFORCED ------------------------------------------
-- Each refuses with P0402 and a sentence that names the cap and the
-- plan. A privileged caller (service role, the SQL editor) is never
-- capped, so migrations and support never hit a customer's limit.
create or replace function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  pl  := public.user_plan(new.owner_id);
  cap := public.plan_cap(public.user_limits(new.owner_id), 'projects');
  if cap is null then return new; end if;
  select count(*) into n from public.projects p where p.owner_id = new.owner_id;
  if n >= cap then
    raise exception 'Your % plan syncs up to % project%. Upgrade to add another to the cloud; it is still saved on this device.',
      initcap(pl), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;
drop trigger if exists projects_plan_limit on public.projects;
create trigger projects_plan_limit before insert on public.projects
  for each row execute function public.enforce_project_limit();

create or replace function public.enforce_share_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid; cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  pl  := public.user_plan(owner);
  cap := public.plan_cap(public.user_limits(owner), 'shares');
  if cap is null then return new; end if;
  select count(*) into n from public.shares s join public.projects p on p.id = s.project_id
   where p.owner_id = owner and (s.expires_at is null or s.expires_at > now());
  if n >= cap then
    raise exception 'Your % plan allows % live share link%. Revoke one, or upgrade.',
      initcap(pl), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;
drop trigger if exists shares_plan_limit on public.shares;
create trigger shares_plan_limit before insert on public.shares
  for each row execute function public.enforce_share_limit();

create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid; cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  pl  := public.user_plan(owner);
  cap := public.plan_cap(public.user_limits(owner), 'collaborators');
  if cap is null then return new; end if;
  select count(*) into n from public.project_collaborators pc where pc.project_id = new.project_id;
  if n >= cap then
    raise exception 'This film''s owner is on the % plan, which allows % collaborator% per film.',
      initcap(pl), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;
drop trigger if exists collaborators_plan_limit on public.project_collaborators;
create trigger collaborators_plan_limit before insert on public.project_collaborators
  for each row execute function public.enforce_collaborator_limit();

-- 16.9 THE CONSOLE -----------------------------------------------------
/** Edit a plan: name, blurb, both prices (paise), limits, on sale. Only
 *  the keys passed change. Limits are validated key by key. */
create or replace function public.admin_set_plan(p_id text, p_patch jsonb)
returns public.plans
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row public.plans;
  lim jsonb;
  k   text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  select * into row from public.plans p where p.id = p_id for update;
  if row.id is null then raise exception 'No such plan' using errcode = '22023'; end if;
  if p_patch ? 'limits' then
    lim := p_patch -> 'limits';
    if jsonb_typeof(lim) <> 'object' then raise exception 'limits must be an object' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(lim) loop
      if k not in ('projects','collaborators','shares','seats','extension') then
        raise exception 'Unknown limit "%"', k using errcode = '22023';
      end if;
      if k = 'extension' then
        if jsonb_typeof(lim -> k) <> 'boolean' then raise exception 'extension must be true or false' using errcode = '22023'; end if;
      elsif jsonb_typeof(lim -> k) not in ('number', 'null') or (jsonb_typeof(lim -> k) = 'number' and (lim ->> k)::numeric < 0) then
        raise exception '% must be a whole number or null for unlimited', k using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_id = 'free' and ((p_patch ? 'monthly_paise' and (p_patch ->> 'monthly_paise')::int > 0)
                     or (p_patch ? 'yearly_paise'  and (p_patch ->> 'yearly_paise')::int  > 0)) then
    raise exception 'The free plan cannot have a price' using errcode = '22023';
  end if;
  update public.plans p
     set name          = coalesce(nullif(left(trim(p_patch ->> 'name'), 40), ''), p.name),
         blurb         = case when p_patch ? 'blurb' then left(coalesce(p_patch ->> 'blurb', ''), 200) else p.blurb end,
         monthly_paise = coalesce((p_patch ->> 'monthly_paise')::int, p.monthly_paise),
         yearly_paise  = coalesce((p_patch ->> 'yearly_paise')::int,  p.yearly_paise),
         limits        = case when p_patch ? 'limits' then p.limits || (p_patch -> 'limits') else p.limits end,
         active        = coalesce((p_patch ->> 'active')::boolean, p.active),
         updated_at    = now(), updated_by = auth.uid()
   where p.id = p_id
   returning * into row;
  return row;
end;
$fn$;

create or replace function public.admin_list_payments(p_limit int default 200)
returns table (id uuid, email text, account_name text, plan_id text, period text, amount_paise int,
               status text, razorpay_order_id text, razorpay_payment_id text, note text,
               created_at timestamptz, paid_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, a.name, p.plan_id, p.period, p.amount_paise, p.status,
           p.razorpay_order_id, p.razorpay_payment_id, p.note, p.created_at, p.paid_at, p.ends_at
      from public.payments p
      join auth.users u on u.id = p.user_id
      left join public.accounts a on a.id = p.account_id
     order by p.created_at desc
     limit greatest(1, least(p_limit, 1000));
end;
$fn$;

/** A plan without a payment: a comp, a bank transfer, a refund made
 *  good. Recorded as a 'granted' payment so the ledger stays whole. */
create or replace function public.admin_grant_plan(p_user uuid, p_plan text, p_days int, p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare acc uuid; until timestamptz;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if p_days < 1 or p_days > 3660 then raise exception 'Days must be between 1 and 3660' using errcode = '22023'; end if;
  if not exists (select 1 from public.plans p where p.id = p_plan and p.id <> 'free') then
    raise exception 'No such paid plan' using errcode = '22023';
  end if;
  acc   := public.account_for_buyer(p_user, null);
  until := public.apply_plan(acc, p_plan, 'grant', p_days);
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, status, note, paid_at, starts_at, ends_at)
  values (p_user, acc, p_plan, 'grant', 0, 'granted', left(p_note, 300), now(), until - make_interval(days => p_days), until);
  insert into public.studio_members (user_id, role) values (p_user, 'user') on conflict (user_id) do nothing;
  return until;
end;
$fn$;

revoke execute on function public.admin_set_plan(text, jsonb)                 from public, anon;
revoke execute on function public.admin_list_payments(int)                   from public, anon;
revoke execute on function public.admin_grant_plan(uuid, text, int, text)    from public, anon;
grant  execute on function public.admin_set_plan(text, jsonb)                 to authenticated;
grant  execute on function public.admin_list_payments(int)                   to authenticated;
grant  execute on function public.admin_grant_plan(uuid, text, int, text)    to authenticated;

-- The console's overview gains the money.
create or replace function public.admin_billing_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'paid_30d_paise',  (select coalesce(sum(amount_paise), 0) from public.payments where status = 'paid' and paid_at > now() - interval '30 days'),
    'paid_total_paise',(select coalesce(sum(amount_paise), 0) from public.payments where status = 'paid'),
    'payments_30d',    (select count(*) from public.payments where status = 'paid' and paid_at > now() - interval '30 days'),
    'active_by_plan',  (select coalesce(jsonb_object_agg(pl, n), '{}'::jsonb) from (
                          select public.account_plan(a.id) pl, count(*) n from public.accounts a group by 1) t),
    'lapsing_14d',     (select count(*) from public.accounts a where a.plan <> 'free' and a.plan_until between now() and now() + interval '14 days'),
    'refunds',         (select count(*) from public.payments where status = 'refunded')
  );
end;
$fn$;
revoke execute on function public.admin_billing_overview() from public, anon;
grant  execute on function public.admin_billing_overview() to authenticated;

notify pgrst, 'reload schema';

-- 16.10 CHECKS TO RUN, none of which has been run yet --------------
--  1. authenticated: select * from plans -> four rows; update plans ->
--     42501 (no policy); admin_set_plan as non-admin -> 42501.
--  2. admin_set_plan('indie', '{"monthly_paise":59900}') -> row shows
--     59900; '{"limits":{"bogus":1}}' -> 22023; free with a price -> 22023.
--  3. authenticated calling create_pending_payment -> 42501; the same
--     with the service key -> a 'created' row with the plan's price.
--  4. activate_payment(order, pay) with the service key: payments row
--     'paid', the buyer owns an account on that plan with plan_until
--     30/365 days out, the buyer has a studio_members row; a second
--     call returns already = true and changes nothing.
--  5. activate for a user who owns no account creates "<Name>'s Studio"
--     with an owner member row; for one who owns two, uses the newest.
--  6. same tier bought again before expiry: plan_until moves out by the
--     period from the OLD expiry; a different tier starts from now().
--  7. a Free owner with 1 project inserting a second -> P0402 with
--     "Free plan syncs up to 1 project"; after admin_grant_plan(...,
--     'starter', 30) the insert succeeds; the third and fourth too;
--     the fifth -> P0402 naming Starter and 3.
--  8. shares and project_collaborators: the same shape, against
--     'shares' and 'collaborators'; a Pro owner is never refused.
--  9. mark_payment_refunded(pay) sets the account's plan_until to now()
--     and user_plan() answers 'free' on the next call.
-- 10. a DISABLED member: create_pending_payment -> 42501.
-- 11. accounts_guard still refuses a client update of plan/plan_until/
--     seat_limit (42501) while apply_plan through admin_grant_plan
--     succeeds (the fms.billing flag).
-- 12. billing_status() for a Free owner shows usage.projects and the
--     limits of the free row; for the admin after a grant, the plan.

-- 17. TWO MORE SYNC SCOPES: edit and deliverables
-- ------------------------------------------------------------
-- RUN 6 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor ("Success. No rows returned"); re-read afterwards:
-- project_data_scope_check now names 'edit' and 'deliverables' (the
-- definition grew to 407 characters). It had been shipped with the two
-- modules a day earlier and NOT run, so for that day a signed-in
-- member's edit log and deliverables checklist saved locally and
-- synced nowhere: cloud.js names both scopes (SCOPE_BY_KEY), the
-- upsert reached project_data, and the CHECK refused it. Nothing else
-- was affected, and the two pages reported the failure in the console
-- — that is the tell, if it ever recurs for a new scope.
--
-- Same procedure as sections 12 and 13.7 (and 16 sits between for
-- no reason but arrival order: billing landed on the branch while
-- these two scopes landed on main), for the same reason: the
-- constraint is rebuilt rather than altered, because Postgres has no
-- ALTER CONSTRAINT for a CHECK, and the existing one is found by
-- its definition rather than by name because an inline column CHECK
-- is named by the server.
--
--   edit          `fms_edit_v1` — the cut's word on each scene, the
--                 editor's notes and the pick-ups owed. The shoot
--                 day's marks stay on the scene record.
--   deliverables  `fms_deliverables_v1` — the state of each
--                 catalogue item and the user's own additions.
-- ============================================================
do $$
declare
  cname text;
begin
  select con.conname into cname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'project_data'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%scope%'
   limit 1;
  if cname is not null then
    execute format('alter table public.project_data drop constraint %I', cname);
  end if;
  alter table public.project_data
    add constraint project_data_scope_check check (scope in (
      'feature','short','library',
      'feature_prefs','short_prefs','library_prefs','activity',
      'scenes','contacts','shots','script','locations',
      'workbench','dissect','festivals','scriptgen','songs',
      'story','idea_vault',
      'edit','deliverables'
    ));
end $$;

notify pgrst, 'reload schema';

-- 17.1 CHECKS TO RUN, none of which has been run yet ---------------
--  1. a member upserting project_data with scope 'edit' on a project
--     they own -> allowed; with scope 'deliverables' -> allowed; with
--     scope 'anything_else' -> 23514 (check violation).
--  2. the two scopes round-trip: a cut state written on device A
--     appears on device B after its next pull, and the edit log on B
--     renders the same owed count.
-- ============================================================


-- ============================================================
-- 18. FULL-TIME ACCESS — the subscription model is withdrawn
-- ------------------------------------------------------------
-- RUN 6 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor (text verified byte-for-byte against this file first):
-- "Success. No rows returned". Read back: price_paise 0 / 299900 /
-- 499900 / 799900 — the live yearly figures, which someone had already
-- edited on the console, not the seed — and features
-- {"sample_only": true, "new_projects": false} on free, {} elsewhere;
-- anon reads plans. The 18.1 live checks are still unrun. Owner's
-- decision, 6 Oct 2026, one day after section 16 went live: "I don't want a subscription model, I
-- want a full-time access model." So a plan is bought ONCE and kept
-- FOR GOOD. No 30-day or 365-day period, nothing to renew, nothing to
-- lapse. One price per tier.
--
-- WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT.
--   * plans gains `price_paise`, the one price. The monthly/yearly
--     columns stay (dropping a column a live function reads is not a
--     one-liner to undo) but nothing reads them after this; the seed
--     copies the yearly figure into the new column as a PLACEHOLDER —
--     the console sets the real prices.
--   * `period` admits 'lifetime' on payments and accounts. The old
--     values stay legal so history keeps loading.
--   * apply_plan() KEEPS ITS SIGNATURE and ignores p_days: plan_until
--     is written NULL, which account_plan() has always read as "no
--     end". Every caller — activation, grant, refund — works unchanged,
--     and section 16's functions below are replaced only where the
--     period mattered: pricing, the stored period, the end date.
--   * admin_grant_plan() keeps its signature too; p_days is ignored
--     and it returns NULL ("for good") where it returned a date.
--   * A refund still ends the plan today: mark_payment_refunded sets
--     plan_until = least(plan_until, now()), and least() skips a NULL,
--     so a lifetime plan refunded ends now. No change needed there.
--
-- FEATURES BY PLAN (same day, same ask): "a space in the admin console
-- to choose what shows for what plan — features, sections, everything".
-- `plans.features` is a jsonb map of feature key -> boolean. The KEYS
-- are the app's: every module id in navigation.json, plus a handful of
-- capabilities (sample_only, new_projects, script_import, ai_tools,
-- exports, drive_backup). The database does not know the ids and does
-- not need to: it keeps the shape honest (an object, boolean values,
-- sane keys) and the client — src/lib/plan-gate.js — reads a missing
-- key as ALLOWED, so an unedited plan hides nothing and a tick removed
-- in the console is the only thing that ever locks a page. The free
-- tier is seeded sample_only + no new projects: "free can see the
-- Dragon sample alone". What a plan hides is UI; what it ENFORCES is
-- still the triggers above — this is the owner's product boundary,
-- not a security one, and the file says so where it matters.
-- ============================================================

alter table public.plans add column if not exists price_paise int not null default 0 check (price_paise >= 0);
update public.plans set price_paise = yearly_paise where price_paise = 0 and yearly_paise > 0;
alter table public.plans add column if not exists features jsonb not null default '{}'::jsonb;
update public.plans set features = '{"sample_only": true, "new_projects": false}'::jsonb
 where id = 'free' and features = '{}'::jsonb;

-- The plan cards are drawn for a signed-out visitor on invite.html too,
-- and prices and limits are the one thing about a plan that is public
-- by nature. anon reads; nobody but admin_set_plan() writes.
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to anon, authenticated using (true);

do $$
declare cname text;
begin
  select con.conname into cname
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'payments' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%period%' limit 1;
  if cname is not null then execute format('alter table public.payments drop constraint %I', cname); end if;
  alter table public.payments add constraint payments_period_check check (period in ('month','year','grant','lifetime'));

  select con.conname into cname
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'accounts' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%plan_period%' limit 1;
  if cname is not null then execute format('alter table public.accounts drop constraint %I', cname); end if;
  alter table public.accounts add constraint accounts_plan_period_check check (plan_period in ('month','year','grant','lifetime'));
end $$;

/** A plan, for good. Same signature as section 16's; p_days is ignored
 *  and plan_until is NULL, which account_plan() reads as "no end". */
create or replace function public.apply_plan(p_account uuid, p_plan text, p_period text, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  a    public.accounts;
  lim  jsonb;
begin
  select * into a from public.accounts x where x.id = p_account for update;
  if a.id is null then raise exception 'No such account' using errcode = '22023'; end if;
  select limits into lim from public.plans p where p.id = p_plan;
  if lim is null then raise exception 'No such plan' using errcode = '22023'; end if;
  perform set_config('fms.billing', 'on', true);
  update public.accounts x
     set plan = p_plan, plan_until = null, plan_period = 'lifetime',
         seat_limit = greatest(1, coalesce(public.plan_cap(lim, 'seats'), 1000)),
         updated_at = now()
   where x.id = p_account;
  return null;
end;
$fn$;
revoke execute on function public.apply_plan(uuid, text, text, int) from public, anon, authenticated;

/** rzp-order. The price is the ONE price; a month or a year is refused
 *  by name, so an old client cannot buy a period that no longer exists. */
create or replace function public.create_pending_payment(p_user uuid, p_plan text, p_period text, p_account uuid default null)
returns table (payment_id uuid, amount_paise int, currency text, plan_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  pid uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  if p_period in ('month', 'year') then
    raise exception 'Plans are bought once, for good — not by the month or the year' using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if coalesce(pl.price_paise, 0) <= 0 then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise)
  values (p_user, p_account, p_plan, 'lifetime', pl.price_paise) returning id into pid;
  return query select pid, pl.price_paise, 'INR'::text, pl.name;
end;
$fn$;
revoke execute on function public.create_pending_payment(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.activate_payment(p_order_id text, p_payment_id text, p_raw jsonb default null)
returns table (payment_id uuid, account_id uuid, plan_id text, ends_at timestamptz, already boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay   public.payments;
  acc   uuid;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    return query select pay.id, pay.account_id, pay.plan_id, pay.ends_at, true;
    return;
  end if;
  if pay.status <> 'created' and pay.status <> 'failed' then
    raise exception 'Payment is %', pay.status using errcode = '22023';
  end if;
  acc := public.account_for_buyer(pay.user_id, pay.account_id);
  perform public.apply_plan(acc, pay.plan_id, 'lifetime', 0);
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc, starts_at = now(), ends_at = null,
         raw = coalesce(p_raw, p.raw)
   where p.id = pay.id;
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, null::timestamptz, false;
end;
$fn$;
revoke execute on function public.activate_payment(text, text, jsonb) from public, anon, authenticated;

/** Same signature as section 16's. p_days is ignored; the grant is for
 *  good and the function returns NULL where it returned an end date. */
create or replace function public.admin_grant_plan(p_user uuid, p_plan text, p_days int, p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare acc uuid;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans p where p.id = p_plan and p.id <> 'free') then
    raise exception 'No such paid plan' using errcode = '22023';
  end if;
  acc := public.account_for_buyer(p_user, null);
  perform public.apply_plan(acc, p_plan, 'lifetime', 0);
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, status, note, paid_at, starts_at, ends_at)
  values (p_user, acc, p_plan, 'grant', 0, 'granted', left(p_note, 300), now(), now(), null);
  insert into public.studio_members (user_id, role) values (p_user, 'user') on conflict (user_id) do nothing;
  return null;
end;
$fn$;
revoke execute on function public.admin_grant_plan(uuid, text, int, text) from public, anon;
grant  execute on function public.admin_grant_plan(uuid, text, int, text) to authenticated;

/** admin_set_plan learns `price_paise` (the free tier may not carry it)
 *  and `features` (an object of booleans; keys are the client's, and
 *  the patch REPLACES the map rather than merging, so an untick lands). */
create or replace function public.admin_set_plan(p_id text, p_patch jsonb)
returns public.plans
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row public.plans;
  lim jsonb;
  k   text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  select * into row from public.plans p where p.id = p_id for update;
  if row.id is null then raise exception 'No such plan' using errcode = '22023'; end if;
  if p_patch ? 'limits' then
    lim := p_patch -> 'limits';
    if jsonb_typeof(lim) <> 'object' then raise exception 'limits must be an object' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(lim) loop
      if k not in ('projects','collaborators','shares','seats','extension') then
        raise exception 'Unknown limit "%"', k using errcode = '22023';
      end if;
      if k = 'extension' then
        if jsonb_typeof(lim -> k) <> 'boolean' then raise exception 'extension must be true or false' using errcode = '22023'; end if;
      elsif jsonb_typeof(lim -> k) not in ('number', 'null') or (jsonb_typeof(lim -> k) = 'number' and (lim ->> k)::numeric < 0) then
        raise exception '% must be a whole number or null for unlimited', k using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_patch ? 'features' then
    if jsonb_typeof(p_patch -> 'features') <> 'object' then raise exception 'features must be an object' using errcode = '22023'; end if;
    if (select count(*) from jsonb_object_keys(p_patch -> 'features')) > 200 then raise exception 'too many feature keys' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(p_patch -> 'features') loop
      if k !~ '^[a-z0-9_-]{1,40}$' then raise exception 'Bad feature key "%"', k using errcode = '22023'; end if;
      if jsonb_typeof(p_patch -> 'features' -> k) <> 'boolean' then raise exception 'feature "%" must be true or false', k using errcode = '22023'; end if;
    end loop;
  end if;
  if p_id = 'free' and ((p_patch ? 'price_paise'   and (p_patch ->> 'price_paise')::int   > 0)
                     or (p_patch ? 'monthly_paise' and (p_patch ->> 'monthly_paise')::int > 0)
                     or (p_patch ? 'yearly_paise'  and (p_patch ->> 'yearly_paise')::int  > 0)) then
    raise exception 'The free plan cannot have a price' using errcode = '22023';
  end if;
  update public.plans p
     set name          = coalesce(nullif(left(trim(p_patch ->> 'name'), 40), ''), p.name),
         blurb         = case when p_patch ? 'blurb' then left(coalesce(p_patch ->> 'blurb', ''), 200) else p.blurb end,
         price_paise   = coalesce((p_patch ->> 'price_paise')::int,   p.price_paise),
         monthly_paise = coalesce((p_patch ->> 'monthly_paise')::int, p.monthly_paise),
         yearly_paise  = coalesce((p_patch ->> 'yearly_paise')::int,  p.yearly_paise),
         limits        = case when p_patch ? 'limits' then p.limits || (p_patch -> 'limits') else p.limits end,
         features      = case when p_patch ? 'features' then p_patch -> 'features' else p.features end,
         active        = coalesce((p_patch ->> 'active')::boolean, p.active),
         updated_at    = now(), updated_by = auth.uid()
   where p.id = p_id
   returning * into row;
  return row;
end;
$fn$;
revoke execute on function public.admin_set_plan(text, jsonb) from public, anon;
grant  execute on function public.admin_set_plan(text, jsonb) to authenticated;

/** billing_status() carries the plan's features, so one round trip
 *  tells a page both what it may sync and what it may show. */
create or replace function public.billing_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  pl   text;
  acc  public.accounts;
  lim  jsonb;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  pl := public.user_plan(uid);
  select * into acc from public.accounts a where a.owner_id = uid
   order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last limit 1;
  lim := public.user_limits(uid);
  return jsonb_build_object(
    'plan',        pl,
    'plan_name',   (select name from public.plans where id = pl),
    'limits',      lim,
    'features',    coalesce((select p.features from public.plans p where p.id = pl), '{}'::jsonb),
    'account_id',  acc.id,
    'account_name', acc.name,
    'plan_until',  case when pl <> 'free' then acc.plan_until end,
    'bought_plan', acc.plan,
    'lapsed',      acc.plan is not null and acc.plan <> 'free' and acc.plan_until is not null and acc.plan_until <= now(),
    'disabled',    exists (select 1 from public.studio_members m where m.user_id = uid and m.disabled_at is not null),
    'member',      exists (select 1 from public.studio_members m where m.user_id = uid and m.disabled_at is null),
    'usage', jsonb_build_object(
      'projects',      (select count(*) from public.projects p where p.owner_id = uid),
      'shares',        (select count(*) from public.shares s join public.projects p on p.id = s.project_id
                         where p.owner_id = uid and (s.expires_at is null or s.expires_at > now())),
      'collaborators', (select coalesce(max(c), 0) from (select count(*) c from public.project_collaborators pc
                         join public.projects p on p.id = pc.project_id where p.owner_id = uid group by pc.project_id) t),
      'seats',         (select count(*) from public.account_members am where am.account_id = acc.id and am.status in ('pending','active'))
    ),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'plan_id', x.plan_id, 'period', x.period,
                   'amount_paise', x.amount_paise, 'status', x.status, 'created_at', x.created_at, 'ends_at', x.ends_at)
                   order by x.created_at desc)
                  from (select * from public.payments q where q.user_id = uid order by q.created_at desc limit 12) x), '[]'::jsonb)
  );
end;
$fn$;
revoke execute on function public.billing_status() from public, anon;
grant  execute on function public.billing_status() to authenticated;

notify pgrst, 'reload schema';

-- 18.1 CHECKS TO RUN, none of which has been run yet ---------------
--  0. select id, features from plans: free carries sample_only and
--     new_projects:false; the others '{}'. anon can select plans.
--  0b. admin_set_plan('starter', '{"features": {"story-beats": false}}')
--     -> features replaced; billing_status() for a starter owner carries
--     it; a non-boolean value or a bad key -> 22023.
--  1. select price_paise from plans: starter 299900, indie 799900,
--     pro 1999900 (the yearly placeholders, until the console sets them).
--  2. service: create_pending_payment(B, 'indie', 'lifetime') -> the
--     plan's price_paise; with 'month' -> 22023 naming "once, for good".
--  3. service: activate -> accounts.plan 'indie', plan_until NULL,
--     plan_period 'lifetime', payments.ends_at NULL; account_plan()
--     answers 'indie' and keeps answering it (nothing to lapse).
--  4. admin_grant_plan(C, 'pro', 0) -> NULL; C's organisation is on
--     pro with plan_until NULL; the ledger row reads period 'grant'.
--  5. mark_payment_refunded on a lifetime payment -> plan_until = now(),
--     account_plan() 'free' at once.
-- ============================================================


-- ============================================================
-- 19. THE ACCOUNTS INSERT HOLE — a self-minted Pro organisation
-- ------------------------------------------------------------
-- RUN 8 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor, as sections 19 and 24 together (the only two outstanding
-- sections that matter before the 8 Oct build is deployed; 20-23 are
-- deferred until Razorpay is live): "Success. No rows returned".
-- Read back immediately afterwards: accounts_guard tgtype 23, i.e.
-- BEFORE INSERT OR UPDATE FOR EACH ROW (tgtype & 4 and tgtype & 16 both
-- true), where it had been 19 — BEFORE UPDATE only — all its life. The
-- insert hole described below was open until this run. NOTE for anyone
-- verifying: docs/LAUNCH.md section 4 said to expect tgtype 7; that is
-- wrong and has been corrected. 7 is ROW+BEFORE+INSERT, insert only.
-- BEFORE INSERT OR UPDATE FOR EACH ROW is 1+2+4+16 = 23.
-- The 19.1 live checks are still unrun.
-- Found while the account
-- panel was being built and left on record in CLAUDE.md (open item 5)
-- and docs/SECURITY-RLS.md (A1b): acc_insert checks only
-- `owner_id = auth.uid()`, and accounts_guard — the trigger carrying
-- "Plan and limits are set by billing, not by the client" since 7.6 —
-- is BEFORE UPDATE. So
--
--   insert into accounts (name, owner_id, plan, seat_limit)
--   values ('Mint', auth.uid(), 'pro', 999)
--
-- through PostgREST was refused by nothing. Any signed-in user could
-- mint themselves an unlimited organisation, and user_plan() — which
-- every limit trigger in 16.8 and billing_status() read — answered
-- 'pro' for them from then on. The guard was enforced on update and
-- open on insert.
--
-- THE FIX IS THE GUARD, NOT THE POLICY. Two mechanisms could carry this
-- rule and the trigger is the one every existing caller already knows
-- how to pass: the service role is privileged, apply_plan() raises the
-- fms.billing flag, and account_for_buyer() inserts with the table's
-- defaults. A WITH CHECK on acc_insert would be a second statement of
-- the same rule in a place none of those reach, and the policy would
-- not fire for the definer functions at all (the table owner bypasses
-- RLS), which is exactly the inconsistency that let this through. The
-- trigger now fires on INSERT too and, for a caller that is neither
-- privileged nor billing, refuses a row whose plan or limits are not
-- the table's own defaults (§6: plan 'free', seat_limit 1,
-- storage_limit_mb 500; §16.2: plan_until and plan_period null). The
-- sentence and the SQLSTATE are the UPDATE branch's, so nothing in the
-- client changes.
--
-- Worth knowing: account_for_buyer() runs INSIDE admin_grant_plan(),
-- which an administrator calls through PostgREST, so auth.jwt() says
-- 'authenticated' and is_privileged_caller() is FALSE there even
-- though the function is security definer. That path still works
-- because it inserts (name, owner_id) and nothing else — which is why
-- the check is "equals the defaults" and not "is privileged".
--
-- acc_insert itself is unchanged: `owner_id = auth.uid()` is still the
-- right answer to who may create an organisation.
-- ============================================================
create or replace function public.accounts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_privileged_caller() then return new; end if;
  if current_setting('fms.billing', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    -- A client may create an organisation; billing decides what it is on.
    if new.plan             is distinct from 'free'
    or new.seat_limit       is distinct from 1
    or new.storage_limit_mb is distinct from 500
    or new.plan_until       is not null
    or new.plan_period      is not null then
      raise exception 'Plan and limits are set by billing, not by the client' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then
    raise exception 'Only the account owner can transfer the account' using errcode = '42501';
  end if;
  if new.plan             is distinct from old.plan
  or new.plan_until       is distinct from old.plan_until
  or new.plan_period      is distinct from old.plan_period
  or new.seat_limit       is distinct from old.seat_limit
  or new.storage_limit_mb is distinct from old.storage_limit_mb then
    raise exception 'Plan and limits are set by billing, not by the client' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists accounts_guard on public.accounts;
create trigger accounts_guard
  before insert or update on public.accounts
  for each row execute function public.accounts_guard();

-- 19.1 CHECKS TO RUN, none of which has been run yet ---------------
--  1. authenticated B: insert into accounts (name, owner_id, plan,
--     seat_limit) values ('Mint', B, 'pro', 999) -> 42501 "Plan and
--     limits are set by billing". The same with only plan = 'pro', only
--     seat_limit = 2, only storage_limit_mb = 1, or plan_until = now()
--     -> 42501 each.
--  2. authenticated B: insert into accounts (name, owner_id) values
--     ('Plain', B) -> a row on free / 1 / 500 with plan_until null.
--     This is what src/lib/account.js createAccount() sends.
--  3. authenticated B: insert ... owner_id = <somebody else> -> 42501
--     (acc_insert, unchanged).
--  4. service role: insert with plan 'pro' -> allowed (privileged).
--  5. admin: admin_grant_plan(<user with no organisation>, 'pro', 0)
--     -> an organisation is created on free by account_for_buyer()
--     and moved to pro by apply_plan(); user_plan() answers 'pro'.
--  6. §16.10 check 11 still holds: B updating their own plan -> 42501.
-- ============================================================


-- ============================================================
-- 20. PROMO CODES — a discount on the one price, decided by the server
-- ------------------------------------------------------------
-- RUN 8 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor, as sections 20 to 23 together (the owner's call, once the
-- Razorpay work began): "Success. No rows returned". Read back
-- immediately afterwards: all 22 objects these four sections create are
-- present -- promo_codes, referral_credits and billing_settings, and the
-- functions quote_order, quote_for, promo_price, promo_reason_sentence,
-- paid_credit_paise, ensure_referral_code, my_referral,
-- payments_referral_after, admin_set_promo_code, admin_list_promo_codes,
-- admin_list_referral_credits, admin_mark_referral_paid,
-- admin_affiliate_report, admin_affiliate_orders,
-- admin_get_billing_settings, admin_set_billing_settings -- plus
-- create_pending_payment, activate_payment and admin_list_payments, which
-- section 20 drops and recreates. plans still holds 4 rows.
-- THE DEPLOY DEBT THIS CREATES: rzp-order must be deployed from the
-- CURRENT source, because it passes p_code to the five-argument
-- create_pending_payment that now exists. It is not deployed at all yet,
-- so nothing is broken in the meantime -- but do not deploy an older copy.
-- The 20.2 / 21.1 / 22.2 / 23.1 live checks are still unrun.
-- Owner's ask, 7 Oct 2026.
-- 7 Oct 2026: offers and promo codes. Kept inside the decisions §16
-- and §18 already made (docs/BILLING.md §7 has the long form):
--
--   * THE PRICE IS STILL READ BY THE SERVER. The client sends a plan id
--     and a CODE and never an amount. quote_order() answers what the
--     code does to the table's price; create_pending_payment() calls
--     the same function when the order is made, so the number the card
--     shows and the number Razorpay charges come out of ONE
--     computation, and a console edit to a code is live on the next
--     quote with nothing to redeploy.
--   * ONE TABLE, READABLE BY NOBODY FROM THE CLIENT. RLS is on and no
--     policy exists; the API roles are revoked outright (10.4). A code
--     is validated through quote_order() (security definer) and
--     administered through admin_* RPCs behind is_studio_admin(), the
--     same check the plan console uses.
--   * A USE IS COUNTED AT ACTIVATION, not at order. An abandoned
--     Checkout must not spend somebody's code, so `uses` moves inside
--     activate_payment(), once per payment, and max_uses is checked at
--     quote time. Two buyers racing for the last use can both pay: the
--     count overshoots by one and the ledger shows both, which is
--     cheaper than refusing a customer whose money has left.
--   * NEVER BELOW ₹1. Razorpay refuses an order under 100 paise, so
--     the discounted amount floors there: a 100% code costs ₹1, and
--     the console says so. A ₹0 plan is a GRANT, which already exists.
--   * The webhook's payment entity carries `amount`; activate_payment()
--     now refuses one that is not the row's, so a discounted order
--     cannot be settled by a payment for a different sum. Checkout's
--     handler carries no amount, so the verify path is unchanged.
--
-- The code is stored UPPER-CASE with no whitespace and compared that
-- way; a buyer may type it however they like.
-- ============================================================
create table if not exists public.promo_codes (
  code              text        primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  percent_off       int         check (percent_off between 1 and 100),
  amount_off_paise  int         check (amount_off_paise > 0),
  plan_ids          text[],                             -- null = every paid plan
  max_uses          int         check (max_uses > 0),   -- null = unlimited
  uses              int         not null default 0 check (uses >= 0),
  valid_from        timestamptz,
  valid_until       timestamptz,
  active            boolean     not null default true,
  note              text,
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint promo_codes_one_discount check ((percent_off is null) <> (amount_off_paise is null)),
  constraint promo_codes_window       check (valid_from is null or valid_until is null or valid_until > valid_from)
);
alter table public.promo_codes enable row level security;
-- No policies, on purpose. And no privileges either: the browser never
-- reads this table, the RPCs below are the only way in.
revoke all on public.promo_codes from public, anon, authenticated;

alter table public.payments add column if not exists promo_code     text references public.promo_codes(code) on delete set null;
alter table public.payments add column if not exists list_paise     int check (list_paise >= 0);
alter table public.payments add column if not exists discount_paise int not null default 0 check (discount_paise >= 0);

/** The one piece of arithmetic, kept pure so a test can hit it: the
 *  list price less a percentage (floored) or a flat amount, never below
 *  100 paise and never above the list price. */
create or replace function public.promo_price(p_list int, p_percent int, p_amount_off int)
returns int language sql immutable as $$
  select case when p_list is null then null
              else least(p_list, greatest(100,
                     p_list - coalesce(case when p_percent is not null then (p_list * p_percent) / 100 end,
                                       p_amount_off, 0)))
         end;
$$;

/** Why a code was refused, as the sentence the buyer reads. */
create or replace function public.promo_reason_sentence(p_reason text)
returns text language sql immutable as $$
  select case p_reason
    when 'unknown'      then 'That code is not one we know. Check the spelling.'
    when 'expired'      then 'That code has expired.'
    when 'exhausted'    then 'That code has been used as many times as it allows.'
    when 'not_for_plan' then 'That code does not apply to this plan.'
    when 'inactive'     then 'That code is not active right now.'
    else 'That code cannot be used.' end;
$$;

/** What a plan costs with (or without) a code. Never raises for a bad
 *  code — it answers ok:false and a reason in ('unknown','expired',
 *  'exhausted','not_for_plan','inactive') with the list price — so the
 *  card can print the refusal as a sentence. A plan not for sale is
 *  the caller's mistake and does raise. */
create or replace function public.quote_order(p_plan text, p_code text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  pl     public.plans;
  pc     public.promo_codes;
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  amt    int;
  reason text;
begin
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(pl.price_paise, 0) <= 0 then
    raise exception 'That plan is not for sale' using errcode = '22023';
  end if;
  if v_code is null then
    return jsonb_build_object('plan_id', pl.id, 'list_paise', pl.price_paise, 'amount_paise', pl.price_paise,
                              'discount_paise', 0, 'code', null, 'ok', true, 'reason', null, 'sentence', null);
  end if;
  select * into pc from public.promo_codes c where c.code = v_code;
  reason := case
    when pc.code is null                                                   then 'unknown'
    when not pc.active                                                     then 'inactive'
    when pc.valid_from is not null and pc.valid_from > now()               then 'inactive'
    when pc.valid_until is not null and pc.valid_until <= now()            then 'expired'
    when pc.max_uses is not null and pc.uses >= pc.max_uses                then 'exhausted'
    when pc.plan_ids is not null and not (pl.id = any (pc.plan_ids))       then 'not_for_plan'
  end;
  if reason is not null then
    return jsonb_build_object('plan_id', pl.id, 'list_paise', pl.price_paise, 'amount_paise', pl.price_paise,
                              'discount_paise', 0, 'code', v_code, 'ok', false, 'reason', reason,
                              'sentence', public.promo_reason_sentence(reason));
  end if;
  amt := public.promo_price(pl.price_paise, pc.percent_off, pc.amount_off_paise);
  return jsonb_build_object('plan_id', pl.id, 'list_paise', pl.price_paise, 'amount_paise', amt,
                            'discount_paise', pl.price_paise - amt, 'code', v_code, 'ok', true, 'reason', null, 'sentence', null,
                            'percent_off', pc.percent_off, 'amount_off_paise', pc.amount_off_paise);
end;
$fn$;
-- The cards are drawn for anon on invite.html (§18 let anon read
-- plans), so anon may ask for a quote too. A code is an offer, not a
-- credential: knowing one buys a discount, never entry.
revoke execute on function public.quote_order(text, text) from public;
grant  execute on function public.quote_order(text, text) to anon, authenticated;

/** rzp-order, with a code. The old four-argument signature is DROPPED
 *  rather than overloaded: PostgREST cannot tell two overloads apart
 *  when the extra argument has a default, and answers 300. Every
 *  caller passes named arguments, so the default covers them. The row
 *  records the list price, the discount and the code; the code's
 *  `uses` is untouched until activation. */
drop function if exists public.create_pending_payment(uuid, text, text, uuid);
create or replace function public.create_pending_payment(p_user uuid, p_plan text, p_period text, p_account uuid default null, p_code text default null)
returns table (payment_id uuid, amount_paise int, currency text, plan_name text, list_paise int, discount_paise int, promo_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  q   jsonb;
  pid uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  if p_period in ('month', 'year') then
    raise exception 'Plans are bought once, for good — not by the month or the year' using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if coalesce(pl.price_paise, 0) <= 0 then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  q := public.quote_order(p_plan, p_code);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'sentence' using errcode = '22023', hint = q ->> 'reason';
  end if;
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, list_paise, discount_paise, promo_code)
  values (p_user, p_account, p_plan, 'lifetime', (q ->> 'amount_paise')::int, (q ->> 'list_paise')::int, (q ->> 'discount_paise')::int, q ->> 'code')
  returning id into pid;
  return query select pid, (q ->> 'amount_paise')::int, 'INR'::text, pl.name, (q ->> 'list_paise')::int, (q ->> 'discount_paise')::int, q ->> 'code';
end;
$fn$;
revoke execute on function public.create_pending_payment(uuid, text, text, uuid, text) from public, anon, authenticated;

/** Activation, as §18 left it, plus two things: the amount Razorpay
 *  reports (webhook only) must be the row's, and a code is spent here. */
create or replace function public.activate_payment(p_order_id text, p_payment_id text, p_raw jsonb default null)
returns table (payment_id uuid, account_id uuid, plan_id text, ends_at timestamptz, already boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay   public.payments;
  acc   uuid;
  rep   bigint := nullif(p_raw -> 'payment' ->> 'amount', '')::bigint;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    return query select pay.id, pay.account_id, pay.plan_id, pay.ends_at, true;
    return;
  end if;
  if pay.status <> 'created' and pay.status <> 'failed' then
    raise exception 'Payment is %', pay.status using errcode = '22023';
  end if;
  if rep is not null and rep <> pay.amount_paise then
    raise exception 'Razorpay reports % paise for an order recorded at %', rep, pay.amount_paise using errcode = '22023';
  end if;
  acc := public.account_for_buyer(pay.user_id, pay.account_id);
  perform public.apply_plan(acc, pay.plan_id, 'lifetime', 0);
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc, starts_at = now(), ends_at = null,
         raw = coalesce(p_raw, p.raw)
   where p.id = pay.id;
  if pay.promo_code is not null then
    update public.promo_codes c set uses = c.uses + 1, updated_at = now() where c.code = pay.promo_code;
  end if;
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, null::timestamptz, false;
end;
$fn$;
revoke execute on function public.activate_payment(text, text, jsonb) from public, anon, authenticated;

-- 20.1 THE CONSOLE ------------------------------------------------------
create or replace function public.admin_list_promo_codes()
returns setof public.promo_codes
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query select * from public.promo_codes c order by c.active desc, c.created_at desc;
end;
$fn$;

/** Create or edit a code. A key present in the patch is written (JSON
 *  null clears it); a key absent is left alone. A new code needs
 *  exactly one of percent_off / amount_off_paise. plan_ids must name
 *  paid plans; an empty list means every plan. Deactivating is
 *  {"active": false}. The code is never renamed — it is the key the
 *  ledger refers to. */
create or replace function public.admin_set_promo_code(p_code text, p_patch jsonb)
returns public.promo_codes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  row  public.promo_codes;
  ids  text[];
  bad  text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' then
    raise exception 'A code is 3 to 32 letters, digits or dashes' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be an object' using errcode = '22023'; end if;
  if p_patch ? 'plan_ids' then
    if jsonb_typeof(p_patch -> 'plan_ids') = 'array' then
      select array_agg(x) into ids from jsonb_array_elements_text(p_patch -> 'plan_ids') x;
      if ids is not null and cardinality(ids) = 0 then ids := null; end if;
      select x into bad from unnest(ids) x where x not in (select id from public.plans where id <> 'free') limit 1;
      if bad is not null then raise exception 'No such paid plan "%"', bad using errcode = '22023'; end if;
    elsif jsonb_typeof(p_patch -> 'plan_ids') <> 'null' then
      raise exception 'plan_ids must be a list of plan ids or null' using errcode = '22023';
    end if;
  end if;
  select * into row from public.promo_codes c where c.code = v_code for update;
  if row.code is null then
    insert into public.promo_codes (code, percent_off, amount_off_paise, plan_ids, max_uses, valid_from, valid_until, active, note, created_by)
    values (v_code,
            (p_patch ->> 'percent_off')::int,
            (p_patch ->> 'amount_off_paise')::int,
            case when p_patch ? 'plan_ids' then ids end,
            (p_patch ->> 'max_uses')::int,
            (p_patch ->> 'valid_from')::timestamptz,
            (p_patch ->> 'valid_until')::timestamptz,
            coalesce((p_patch ->> 'active')::boolean, true),
            left(p_patch ->> 'note', 300),
            auth.uid())
    returning * into row;
  else
    update public.promo_codes c
       set percent_off      = case when p_patch ? 'percent_off'      then (p_patch ->> 'percent_off')::int        else c.percent_off end,
           amount_off_paise = case when p_patch ? 'amount_off_paise' then (p_patch ->> 'amount_off_paise')::int   else c.amount_off_paise end,
           plan_ids         = case when p_patch ? 'plan_ids'         then ids                                      else c.plan_ids end,
           max_uses         = case when p_patch ? 'max_uses'         then (p_patch ->> 'max_uses')::int           else c.max_uses end,
           valid_from       = case when p_patch ? 'valid_from'       then (p_patch ->> 'valid_from')::timestamptz  else c.valid_from end,
           valid_until      = case when p_patch ? 'valid_until'      then (p_patch ->> 'valid_until')::timestamptz else c.valid_until end,
           active           = coalesce((p_patch ->> 'active')::boolean, c.active),
           note             = case when p_patch ? 'note' then left(p_patch ->> 'note', 300) else c.note end,
           updated_at       = now()
     where c.code = v_code
     returning * into row;
  end if;
  return row;
exception
  when check_violation then
    raise exception 'A code takes either a percentage (1–100) or an amount off in paise, not both; uses must be positive and the window must end after it starts' using errcode = '22023';
end;
$fn$;

/** The ledger learns the code and the discount. Same rows as §16.9's,
 *  three columns wider; a return type cannot be replaced in place, so
 *  the function is dropped and made again. */
drop function if exists public.admin_list_payments(int);
create or replace function public.admin_list_payments(p_limit int default 200)
returns table (id uuid, email text, account_name text, plan_id text, period text, amount_paise int,
               status text, razorpay_order_id text, razorpay_payment_id text, note text,
               created_at timestamptz, paid_at timestamptz, ends_at timestamptz,
               promo_code text, discount_paise int, list_paise int)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, a.name, p.plan_id, p.period, p.amount_paise, p.status,
           p.razorpay_order_id, p.razorpay_payment_id, p.note, p.created_at, p.paid_at, p.ends_at,
           p.promo_code, p.discount_paise, p.list_paise
      from public.payments p
      join auth.users u on u.id = p.user_id
      left join public.accounts a on a.id = p.account_id
     order by p.created_at desc
     limit greatest(1, least(p_limit, 1000));
end;
$fn$;

revoke execute on function public.admin_list_promo_codes()               from public, anon;
revoke execute on function public.admin_set_promo_code(text, jsonb)      from public, anon;
revoke execute on function public.admin_list_payments(int)               from public, anon;
grant  execute on function public.admin_list_promo_codes()               to authenticated;
grant  execute on function public.admin_set_promo_code(text, jsonb)      to authenticated;
grant  execute on function public.admin_list_payments(int)               to authenticated;

notify pgrst, 'reload schema';

-- 20.2 CHECKS TO RUN, none of which has been run yet ---------------
--  1. anon and authenticated: select from promo_codes -> 42501
--     (permission denied; no policy and no privilege). A non-admin
--     calling admin_list_promo_codes / admin_set_promo_code -> 42501.
--  2. admin: admin_set_promo_code('launch 10', '{"percent_off":10}')
--     -> a row coded LAUNCH10, active, uses 0, plan_ids null. A code
--     with both discounts, with neither, with a bad name, or naming a
--     plan that is not a paid one -> 22023.
--  3. quote_order('indie', null) -> ok, amount = the list price.
--     quote_order('indie', 'launch10') -> ok, amount = list less 10%
--     floored, discount = the difference. A ₹500-off code on a plan
--     priced below ₹501 -> amount 100 (the ₹1 floor). A 100% code ->
--     amount 100.
--  4. reasons: an unknown code -> 'unknown'; valid_until in the past
--     -> 'expired'; active false, or valid_from in the future ->
--     'inactive'; plan_ids {indie} quoted for starter -> 'not_for_plan';
--     uses = max_uses -> 'exhausted'. Each with ok false, the list
--     price, and a sentence.
--  5. service: create_pending_payment(B, 'indie', 'lifetime', null,
--     'LAUNCH10') -> amount_paise discounted, list_paise, discount_paise
--     and promo_code on the row; uses STILL 0. With a refused code ->
--     22023 whose message is the sentence.
--  6. activate_payment on that order -> paid, uses 1; the second call
--     (already) leaves uses at 1. A code with max_uses 1 then quotes
--     'exhausted' and create_pending_payment refuses it.
--  7. activate_payment with p_raw {"payment":{"amount": <wrong>}} ->
--     22023 and the row still 'created'; with the right amount -> paid.
--  8. admin_list_payments shows promo_code, discount_paise and
--     list_paise on the discounted row and nulls/0 on the others.
--  9. admin_set_promo_code('LAUNCH10', '{"active": false}') -> quotes
--     'inactive'; '{"active": true}' -> ok again.
-- 10. the browser: the "Have a code?" box on settings.html#plan and
--     invite.html reprices the cards, BUY sends the code, Checkout
--     opens with the discounted amount, the ledger row carries the
--     code (scripts/prove-billing.mjs (j)).
-- ============================================================


-- ============================================================
-- 21. UPGRADE BY PAYING THE DIFFERENCE
-- ------------------------------------------------------------
-- RUN 8 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor, as sections 20 to 23 together (the owner's call, once the
-- Razorpay work began): "Success. No rows returned". Read back
-- immediately afterwards: all 22 objects these four sections create are
-- present -- promo_codes, referral_credits and billing_settings, and the
-- functions quote_order, quote_for, promo_price, promo_reason_sentence,
-- paid_credit_paise, ensure_referral_code, my_referral,
-- payments_referral_after, admin_set_promo_code, admin_list_promo_codes,
-- admin_list_referral_credits, admin_mark_referral_paid,
-- admin_affiliate_report, admin_affiliate_orders,
-- admin_get_billing_settings, admin_set_billing_settings -- plus
-- create_pending_payment, activate_payment and admin_list_payments, which
-- section 20 drops and recreates. plans still holds 4 rows.
-- THE DEPLOY DEBT THIS CREATES: rzp-order must be deployed from the
-- CURRENT source, because it passes p_code to the five-argument
-- create_pending_payment that now exists. It is not deployed at all yet,
-- so nothing is broken in the meantime -- but do not deploy an older copy.
-- The 20.2 / 21.1 / 22.2 / 23.1 live checks are still unrun.
-- Owner's ask, 7 Oct 2026.
-- somebody on Starter who wants Indie pays Indie's price LESS what they
-- have already paid, not Indie's price again. Kept inside §16/§18/§20:
--
--   * THE SERVER STILL PRICES. quote_for(user, plan, code) is the one
--     computation; quote_order() (the cards) asks it for auth.uid() and
--     create_pending_payment() (rzp-order) asks it for the buyer the
--     JWT named. A signed-out quote has no user and is the list price,
--     exactly as before.
--   * THE CREDIT is the sum of the buyer's ACTIVATED full-time payments
--     — status 'paid', period 'lifetime' — at the amount actually paid
--     (after any code). A grant paid ₹0 and credits ₹0; a refunded
--     payment is 'refunded' and credits nothing; a month/year payment
--     from before §18 bought a period, not the plan, and credits
--     nothing. Summed per USER, as user_plan() is decided per user.
--   * due = list − credit, floored at ₹1 (100 paise, Razorpay's
--     minimum) and therefore never below 0; a promo code then applies
--     to the DIFFERENCE, not to the list. The row records list_paise,
--     credit_paise and discount_paise, so amount = list − credit −
--     discount reads off the ledger.
--   * A DOWNGRADE OR THE SAME PLAN IS REFUSED (22023, hint 'same_plan'
--     or 'downgrade'): there is nothing to sell somebody who holds the
--     plan for good, and paying to have less is not a purchase.
--   * activate_payment() no longer LOWERS a plan. Two orders opened at
--     once (Indie, then Pro) and paid in the wrong order used to leave
--     the buyer on whichever activated last; now a plan is applied only
--     when it is higher than the organisation's current one. The money
--     is recorded either way, and the console sees both rows.
-- ============================================================
alter table public.payments add column if not exists credit_paise int not null default 0 check (credit_paise >= 0);

/** What a user has already paid for full-time access. */
create or replace function public.paid_credit_paise(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.amount_paise), 0)::int
    from public.payments p
   where p.user_id = p_user and p.status = 'paid' and p.period = 'lifetime';
$$;
revoke execute on function public.paid_credit_paise(uuid) from public, anon, authenticated;

/** THE price. p_user null = a signed-out quote (no credit, no plan to
 *  compare). Never raises for a bad CODE (ok:false + reason, as §20);
 *  raises 22023 for a plan not for sale and for a downgrade/same plan. */
create or replace function public.quote_for(p_user uuid, p_plan text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl     public.plans;
  pc     public.promo_codes;
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  cur    text := 'free';
  credit int  := 0;
  due    int;
  amt    int;
  reason text;
  base   jsonb;
begin
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(pl.price_paise, 0) <= 0 then
    raise exception 'That plan is not for sale' using errcode = '22023';
  end if;
  if p_user is not null then
    cur := public.user_plan(p_user);
    if cur <> 'free' and public.plan_rank(pl.id) <= public.plan_rank(cur) then
      if cur = pl.id then
        raise exception 'You already have % — for good. There is nothing to pay.', pl.name using errcode = '22023', hint = 'same_plan';
      end if;
      raise exception 'You are on % already; % is a lower plan, and paying to have less is not something we sell.',
        coalesce((select x.name from public.plans x where x.id = cur), initcap(cur)), pl.name using errcode = '22023', hint = 'downgrade';
    end if;
    credit := public.paid_credit_paise(p_user);
  end if;
  due := pl.price_paise - credit;
  if due < 100 then due := least(pl.price_paise, 100); end if;   -- never below ₹1, so never below 0
  base := jsonb_build_object('plan_id', pl.id, 'list_paise', pl.price_paise, 'credit_paise', pl.price_paise - due,
                             'due_paise', due, 'amount_paise', due, 'discount_paise', 0, 'code', v_code,
                             'ok', true, 'reason', null, 'sentence', null,
                             'upgrade_from', case when credit > 0 then cur end,
                             'upgrade_from_name', case when credit > 0 then (select x.name from public.plans x where x.id = cur) end,
                             'paid_paise', credit);
  if v_code is null then return base; end if;
  select * into pc from public.promo_codes c where c.code = v_code;
  reason := case
    when pc.code is null                                                   then 'unknown'
    when not pc.active                                                     then 'inactive'
    when pc.valid_from is not null and pc.valid_from > now()               then 'inactive'
    when pc.valid_until is not null and pc.valid_until <= now()            then 'expired'
    when pc.max_uses is not null and pc.uses >= pc.max_uses                then 'exhausted'
    when pc.plan_ids is not null and not (pl.id = any (pc.plan_ids))       then 'not_for_plan'
  end;
  if reason is not null then
    return base || jsonb_build_object('ok', false, 'reason', reason, 'sentence', public.promo_reason_sentence(reason));
  end if;
  amt := public.promo_price(due, pc.percent_off, pc.amount_off_paise);
  return base || jsonb_build_object('amount_paise', amt, 'discount_paise', due - amt,
                                    'percent_off', pc.percent_off, 'amount_off_paise', pc.amount_off_paise);
end;
$fn$;
revoke execute on function public.quote_for(uuid, text, text) from public, anon, authenticated;

/** The cards' quote: the same function, for whoever is asking. */
create or replace function public.quote_order(p_plan text, p_code text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.quote_for(auth.uid(), p_plan, p_code);
$$;
revoke execute on function public.quote_order(text, text) from public;
grant  execute on function public.quote_order(text, text) to anon, authenticated;

/** rzp-order. Same five arguments as §20; the answer gains credit_paise
 *  (a return type cannot be replaced in place, so drop and make). */
drop function if exists public.create_pending_payment(uuid, text, text, uuid, text);
create or replace function public.create_pending_payment(p_user uuid, p_plan text, p_period text, p_account uuid default null, p_code text default null)
returns table (payment_id uuid, amount_paise int, currency text, plan_name text, list_paise int, discount_paise int, promo_code text, credit_paise int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  q   jsonb;
  pid uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  if p_period in ('month', 'year') then
    raise exception 'Plans are bought once, for good — not by the month or the year' using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(pl.price_paise, 0) <= 0 then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  q := public.quote_for(p_user, p_plan, p_code);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'sentence' using errcode = '22023', hint = q ->> 'reason';
  end if;
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, list_paise, discount_paise, promo_code, credit_paise)
  values (p_user, p_account, p_plan, 'lifetime', (q ->> 'amount_paise')::int, (q ->> 'list_paise')::int,
          (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int)
  returning id into pid;
  return query select pid, (q ->> 'amount_paise')::int, 'INR'::text, pl.name, (q ->> 'list_paise')::int,
                      (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int;
end;
$fn$;
revoke execute on function public.create_pending_payment(uuid, text, text, uuid, text) from public, anon, authenticated;

/** Activation as §20 left it, except that a plan is applied only when it
 *  is HIGHER than the organisation's current one. */
create or replace function public.activate_payment(p_order_id text, p_payment_id text, p_raw jsonb default null)
returns table (payment_id uuid, account_id uuid, plan_id text, ends_at timestamptz, already boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay   public.payments;
  acc   uuid;
  rep   bigint := nullif(p_raw -> 'payment' ->> 'amount', '')::bigint;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    return query select pay.id, pay.account_id, pay.plan_id, pay.ends_at, true;
    return;
  end if;
  if pay.status <> 'created' and pay.status <> 'failed' then
    raise exception 'Payment is %', pay.status using errcode = '22023';
  end if;
  if rep is not null and rep <> pay.amount_paise then
    raise exception 'Razorpay reports % paise for an order recorded at %', rep, pay.amount_paise using errcode = '22023';
  end if;
  acc := public.account_for_buyer(pay.user_id, pay.account_id);
  if public.plan_rank(pay.plan_id) > public.plan_rank(public.account_plan(acc)) then
    perform public.apply_plan(acc, pay.plan_id, 'lifetime', 0);
  end if;
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc, starts_at = now(), ends_at = null,
         raw = coalesce(p_raw, p.raw)
   where p.id = pay.id;
  if pay.promo_code is not null then
    update public.promo_codes c set uses = c.uses + 1, updated_at = now() where c.code = pay.promo_code;
  end if;
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, null::timestamptz, false;
end;
$fn$;
revoke execute on function public.activate_payment(text, text, jsonb) from public, anon, authenticated;

/** The ledger learns the credit. Same as §20's, one column wider. */
drop function if exists public.admin_list_payments(int);
create or replace function public.admin_list_payments(p_limit int default 200)
returns table (id uuid, email text, account_name text, plan_id text, period text, amount_paise int,
               status text, razorpay_order_id text, razorpay_payment_id text, note text,
               created_at timestamptz, paid_at timestamptz, ends_at timestamptz,
               promo_code text, discount_paise int, list_paise int, credit_paise int)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, a.name, p.plan_id, p.period, p.amount_paise, p.status,
           p.razorpay_order_id, p.razorpay_payment_id, p.note, p.created_at, p.paid_at, p.ends_at,
           p.promo_code, p.discount_paise, p.list_paise, p.credit_paise
      from public.payments p
      join auth.users u on u.id = p.user_id
      left join public.accounts a on a.id = p.account_id
     order by p.created_at desc
     limit greatest(1, least(p_limit, 1000));
end;
$fn$;
revoke execute on function public.admin_list_payments(int) from public, anon;
grant  execute on function public.admin_list_payments(int) to authenticated;

notify pgrst, 'reload schema';

-- 21.1 CHECKS TO RUN, none of which has been run yet ---------------
--  1. anon: quote_order('indie', null) -> the list price, credit 0
--     (unchanged from §20). quote_for / paid_credit_paise as anon or
--     authenticated -> 42501 (internal).
--  2. authenticated B who paid ₹2,999 for Starter: quote_order('indie')
--     -> amount = indie − 299900, credit_paise 299900, upgrade_from
--     'starter'. quote_order('starter') -> 22023 hint same_plan;
--     a Pro holder quoting indie -> 22023 hint downgrade.
--  3. with LAUNCH10: the 10% comes off the DIFFERENCE, not the list.
--  4. a credit at or above the target price -> amount 100 (₹1), never 0.
--  5. service: create_pending_payment(B, 'indie', …) -> the row has
--     list_paise, credit_paise and amount = list − credit − discount;
--     activate -> B's organisation on Indie.
--  6. two orders (Indie, Pro) opened together, Pro activated first,
--     then Indie -> the organisation stays on Pro; both rows 'paid'.
--  7. a refunded payment credits nothing; a grant credits ₹0.
--  8. after deploying rzp-order (it returns credit_paise now): an
--     upgrade from settings.html#plan opens Checkout at the difference.
-- ============================================================


-- ============================================================
-- 22. REFERRAL CODES — every paying member brings a friend a discount
-- ------------------------------------------------------------
-- RUN 8 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor, as sections 20 to 23 together (the owner's call, once the
-- Razorpay work began): "Success. No rows returned". Read back
-- immediately afterwards: all 22 objects these four sections create are
-- present -- promo_codes, referral_credits and billing_settings, and the
-- functions quote_order, quote_for, promo_price, promo_reason_sentence,
-- paid_credit_paise, ensure_referral_code, my_referral,
-- payments_referral_after, admin_set_promo_code, admin_list_promo_codes,
-- admin_list_referral_credits, admin_mark_referral_paid,
-- admin_affiliate_report, admin_affiliate_orders,
-- admin_get_billing_settings, admin_set_billing_settings -- plus
-- create_pending_payment, activate_payment and admin_list_payments, which
-- section 20 drops and recreates. plans still holds 4 rows.
-- THE DEPLOY DEBT THIS CREATES: rzp-order must be deployed from the
-- CURRENT source, because it passes p_code to the five-argument
-- create_pending_payment that now exists. It is not deployed at all yet,
-- so nothing is broken in the meantime -- but do not deploy an older copy.
-- The 20.2 / 21.1 / 22.2 / 23.1 live checks are still unrun.
-- Owner's ask, 7 Oct 2026.
--
--   * A REFERRAL CODE IS A PROMO CODE. One more row in promo_codes,
--     kind 'referral', owner_user_id the member it belongs to, a
--     percentage off for the friend (billing_settings, default 10%).
--     Everything §20 built — the quote, the order carrying the code,
--     the use counted at activation — works on it unchanged, and the
--     price is still decided by quote_for().
--   * WHO GETS ONE: a member with at least one activated payment of
--     more than ₹0. It is minted at that activation (a trigger), or on
--     first ask by my_referral() for somebody who paid before this ran.
--     One per member (a partial unique index).
--   * THE REWARD IS A LEDGER, NOT A DISCOUNT. Each ACTIVATED payment
--     made with somebody's referral code writes one referral_credits
--     row for its owner: a percentage of what the friend actually paid,
--     or a fixed amount (never more than they paid) — whichever the
--     admin set. The owner pays these out by hand (bank/UPI) and marks
--     them paid on the console; nothing here moves money. A refunded
--     friend's payment voids an unpaid credit.
--   * SELF-REFERRAL IS REFUSED where the buyer is known: quote_for()
--     answers reason 'own_code' for a member quoting their own code,
--     so neither the card nor rzp-order will price it. A signed-out
--     quote has no buyer and cannot know; the order always does.
--   * NEITHER TABLE IS READABLE FROM THE BROWSER. billing_settings and
--     referral_credits have RLS on, no policies, the API roles revoked
--     outright. A member reads their own code and credits through
--     my_referral(); the admin through admin_* RPCs.
--
-- promo_codes.kind admits 'affiliate' and 'gift' from the start; §23
-- and §25 use them, and widening a CHECK twice is two more chances to
-- strand a row.
-- ============================================================
alter table public.promo_codes add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.promo_codes add column if not exists kind text not null default 'promo';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'promo_codes_kind_check') then
    alter table public.promo_codes add constraint promo_codes_kind_check check (kind in ('promo','referral','affiliate','gift'));
  end if;
end $$;
create unique index if not exists promo_codes_one_referral on public.promo_codes (owner_user_id) where kind = 'referral';

create table if not exists public.billing_settings (
  id                     boolean     primary key default true check (id),
  referral_friend_pct    int         not null default 10 check (referral_friend_pct between 1 and 100),
  referral_reward_pct    int         default 10 check (referral_reward_pct between 1 and 100),
  referral_reward_paise  int         check (referral_reward_paise > 0),
  updated_at             timestamptz not null default now(),
  updated_by             uuid        references auth.users(id) on delete set null,
  constraint billing_settings_one_reward check ((referral_reward_pct is null) <> (referral_reward_paise is null))
);
insert into public.billing_settings (id) values (true) on conflict (id) do nothing;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from public, anon, authenticated;

create table if not exists public.referral_credits (
  id                uuid        primary key default gen_random_uuid(),
  referrer_user_id  uuid        not null references auth.users(id) on delete cascade,
  payment_id        uuid        not null unique references public.payments(id) on delete cascade,
  code              text        not null,
  basis_paise       int         not null check (basis_paise >= 0),   -- what the friend paid
  amount_paise      int         not null check (amount_paise >= 0),  -- what the referrer is owed
  status            text        not null default 'owed' check (status in ('owed','paid','void')),
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  paid_by           uuid        references auth.users(id) on delete set null,
  paid_note         text
);
create index if not exists referral_credits_referrer_idx on public.referral_credits (referrer_user_id, created_at desc);
alter table public.referral_credits enable row level security;
revoke all on public.referral_credits from public, anon, authenticated;

/** The member's referral code, minted if they have paid and have none.
 *  NULL for somebody who has not paid. 'REF-' + 6 characters from the
 *  invite alphabet (no 0/O/1/I/L), read aloud without a spelling. */
create or replace function public.ensure_referral_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v     text;
  bytes bytea;
  i     int;
  pct   int;
begin
  if p_user is null then return null; end if;
  select c.code into v from public.promo_codes c where c.kind = 'referral' and c.owner_user_id = p_user;
  if v is not null then return v; end if;
  if not exists (select 1 from public.payments p where p.user_id = p_user and p.status = 'paid' and p.amount_paise > 0) then
    return null;
  end if;
  select s.referral_friend_pct into pct from public.billing_settings s where s.id;
  loop
    bytes := gen_random_bytes(6);
    v := 'REF-';
    for i in 0..5 loop
      v := v || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.promo_codes c where c.code = v);
  end loop;
  insert into public.promo_codes (code, percent_off, kind, owner_user_id, note)
  values (v, coalesce(pct, 10), 'referral', p_user,
          left('Referral: ' || coalesce((select u.email from auth.users u where u.id = p_user), p_user::text), 300))
  on conflict do nothing;
  -- A concurrent mint for the same member lost the unique index race:
  -- read back whichever row won.
  select c.code into v from public.promo_codes c where c.kind = 'referral' and c.owner_user_id = p_user;
  return v;
end;
$fn$;
revoke execute on function public.ensure_referral_code(uuid) from public, anon, authenticated;

/** The sentence for a refused code, learning 'own_code' and 'gift'. */
create or replace function public.promo_reason_sentence(p_reason text)
returns text language sql immutable as $$
  select case p_reason
    when 'unknown'      then 'That code is not one we know. Check the spelling.'
    when 'expired'      then 'That code has expired.'
    when 'exhausted'    then 'That code has been used as many times as it allows.'
    when 'not_for_plan' then 'That code does not apply to this plan.'
    when 'inactive'     then 'That code is not active right now.'
    when 'own_code'     then 'That is your own referral code — it is for the friends you share it with.'
    when 'gift'         then 'That is a gift code. Redeem it under "Have a gift code?" instead.'
    else 'That code cannot be used.' end;
$$;

/** §21's price, refusing a member's own referral code (and, for §25, a
 *  gift code typed into the discount box). */
create or replace function public.quote_for(p_user uuid, p_plan text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl     public.plans;
  pc     public.promo_codes;
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  cur    text := 'free';
  credit int  := 0;
  due    int;
  amt    int;
  reason text;
  base   jsonb;
begin
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(pl.price_paise, 0) <= 0 then
    raise exception 'That plan is not for sale' using errcode = '22023';
  end if;
  if p_user is not null then
    cur := public.user_plan(p_user);
    if cur <> 'free' and public.plan_rank(pl.id) <= public.plan_rank(cur) then
      if cur = pl.id then
        raise exception 'You already have % — for good. There is nothing to pay.', pl.name using errcode = '22023', hint = 'same_plan';
      end if;
      raise exception 'You are on % already; % is a lower plan, and paying to have less is not something we sell.',
        coalesce((select x.name from public.plans x where x.id = cur), initcap(cur)), pl.name using errcode = '22023', hint = 'downgrade';
    end if;
    credit := public.paid_credit_paise(p_user);
  end if;
  due := pl.price_paise - credit;
  if due < 100 then due := least(pl.price_paise, 100); end if;
  base := jsonb_build_object('plan_id', pl.id, 'list_paise', pl.price_paise, 'credit_paise', pl.price_paise - due,
                             'due_paise', due, 'amount_paise', due, 'discount_paise', 0, 'code', v_code,
                             'ok', true, 'reason', null, 'sentence', null,
                             'upgrade_from', case when credit > 0 then cur end,
                             'upgrade_from_name', case when credit > 0 then (select x.name from public.plans x where x.id = cur) end,
                             'paid_paise', credit);
  if v_code is null then return base; end if;
  select * into pc from public.promo_codes c where c.code = v_code;
  reason := case
    when pc.code is null                                                   then 'unknown'
    when pc.kind = 'gift'                                                  then 'gift'
    when not pc.active                                                     then 'inactive'
    when pc.valid_from is not null and pc.valid_from > now()               then 'inactive'
    when pc.valid_until is not null and pc.valid_until <= now()            then 'expired'
    when pc.max_uses is not null and pc.uses >= pc.max_uses                then 'exhausted'
    when pc.plan_ids is not null and not (pl.id = any (pc.plan_ids))       then 'not_for_plan'
    when p_user is not null and pc.owner_user_id = p_user                  then 'own_code'
  end;
  if reason is not null then
    return base || jsonb_build_object('ok', false, 'reason', reason, 'sentence', public.promo_reason_sentence(reason));
  end if;
  amt := public.promo_price(due, pc.percent_off, pc.amount_off_paise);
  return base || jsonb_build_object('amount_paise', amt, 'discount_paise', due - amt, 'kind', pc.kind,
                                    'percent_off', pc.percent_off, 'amount_off_paise', pc.amount_off_paise);
end;
$fn$;
revoke execute on function public.quote_for(uuid, text, text) from public, anon, authenticated;

/** After a payment changes state: an activation mints the payer's own
 *  referral code and credits the owner of the code they used; a refund
 *  voids that credit if it has not been paid out. AFTER UPDATE, so it
 *  sees the row exactly as activate_payment() / mark_payment_refunded()
 *  left it, and it adds no line to either. */
create or replace function public.payments_referral_after()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pc  public.promo_codes;
  st  public.billing_settings;
  amt int;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if new.amount_paise > 0 then perform public.ensure_referral_code(new.user_id); end if;
    if new.promo_code is not null then
      select * into pc from public.promo_codes c where c.code = new.promo_code;
      if pc.kind = 'referral' and pc.owner_user_id is not null and pc.owner_user_id <> new.user_id then
        select * into st from public.billing_settings s where s.id;
        amt := case when st.referral_reward_pct is not null then (new.amount_paise * st.referral_reward_pct) / 100
                    else least(coalesce(st.referral_reward_paise, 0), new.amount_paise) end;
        insert into public.referral_credits (referrer_user_id, payment_id, code, basis_paise, amount_paise)
        values (pc.owner_user_id, new.id, pc.code, new.amount_paise, amt)
        on conflict (payment_id) do nothing;
      end if;
    end if;
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    update public.referral_credits r set status = 'void' where r.payment_id = new.id and r.status = 'owed';
  end if;
  return new;
end;
$fn$;
revoke execute on function public.payments_referral_after() from public, anon, authenticated;
drop trigger if exists payments_referral_after on public.payments;
create trigger payments_referral_after after update of status on public.payments
  for each row execute function public.payments_referral_after();

/** The member's own view: their code (minted now if they have paid and
 *  have none), what it gives a friend, and their credits. */
create or replace function public.my_referral()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  v    text;
  pc   public.promo_codes;
  st   public.billing_settings;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  v := public.ensure_referral_code(uid);
  select * into st from public.billing_settings s where s.id;
  if v is null then
    return jsonb_build_object('eligible', false, 'friend_pct', st.referral_friend_pct);
  end if;
  select * into pc from public.promo_codes c where c.code = v;
  return jsonb_build_object(
    'eligible', true, 'code', pc.code, 'active', pc.active, 'percent_off', pc.percent_off, 'uses', pc.uses,
    'reward_pct', st.referral_reward_pct, 'reward_paise', st.referral_reward_paise,
    'owed_paise', (select coalesce(sum(r.amount_paise), 0) from public.referral_credits r where r.referrer_user_id = uid and r.status = 'owed'),
    'paid_paise', (select coalesce(sum(r.amount_paise), 0) from public.referral_credits r where r.referrer_user_id = uid and r.status = 'paid'),
    'credits', coalesce((select jsonb_agg(jsonb_build_object('amount_paise', r.amount_paise, 'status', r.status,
                            'created_at', r.created_at, 'paid_at', r.paid_at) order by r.created_at desc)
                           from (select * from public.referral_credits x where x.referrer_user_id = uid order by x.created_at desc limit 50) r), '[]'::jsonb));
end;
$fn$;
revoke execute on function public.my_referral() from public, anon;
grant  execute on function public.my_referral() to authenticated;

-- 22.1 THE CONSOLE ------------------------------------------------------
create or replace function public.admin_get_billing_settings()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return (select to_jsonb(s) - 'id' from public.billing_settings s where s.id);
end;
$fn$;

/** Patch the settings. Referral keys: referral_friend_pct (also applied
 *  to every existing referral code, so the friend's discount is one
 *  number), and EXACTLY one of referral_reward_pct / referral_reward_paise
 *  (sending one clears the other). Later sections add their keys. */
create or replace function public.admin_set_billing_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare k text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be an object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('referral_friend_pct', 'referral_reward_pct', 'referral_reward_paise') then
      raise exception 'Unknown setting "%"', k using errcode = '22023';
    end if;
  end loop;
  update public.billing_settings s
     set referral_friend_pct   = coalesce((p_patch ->> 'referral_friend_pct')::int, s.referral_friend_pct),
         referral_reward_pct   = case when p_patch ? 'referral_reward_pct' then (p_patch ->> 'referral_reward_pct')::int
                                      when p_patch ? 'referral_reward_paise' and p_patch ->> 'referral_reward_paise' is not null then null
                                      else s.referral_reward_pct end,
         referral_reward_paise = case when p_patch ? 'referral_reward_paise' then (p_patch ->> 'referral_reward_paise')::int
                                      when p_patch ? 'referral_reward_pct' and p_patch ->> 'referral_reward_pct' is not null then null
                                      else s.referral_reward_paise end,
         updated_at = now(), updated_by = auth.uid()
   where s.id;
  if p_patch ? 'referral_friend_pct' then
    update public.promo_codes c set percent_off = (p_patch ->> 'referral_friend_pct')::int, updated_at = now() where c.kind = 'referral';
  end if;
  return public.admin_get_billing_settings();
exception
  when check_violation then
    raise exception 'A referral pays the friend 1–100%% off, and the referrer EITHER a percentage (1–100) OR a fixed amount in paise' using errcode = '22023';
end;
$fn$;

create or replace function public.admin_list_referral_credits(p_status text default null)
returns table (id uuid, referrer_user_id uuid, referrer_email text, code text, friend_email text, plan_id text,
               basis_paise int, amount_paise int, status text, created_at timestamptz, paid_at timestamptz, paid_note text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select r.id, r.referrer_user_id, ru.email::text, r.code, fu.email::text, p.plan_id,
           r.basis_paise, r.amount_paise, r.status, r.created_at, r.paid_at, r.paid_note
      from public.referral_credits r
      join public.payments p on p.id = r.payment_id
      left join auth.users ru on ru.id = r.referrer_user_id
      left join auth.users fu on fu.id = p.user_id
     where p_status is null or r.status = p_status
     order by (r.status = 'owed') desc, r.created_at desc
     limit 1000;
end;
$fn$;

/** Mark credits paid out (by hand, outside this app). Only 'owed' rows
 *  move; the count of rows that did is returned. */
create or replace function public.admin_mark_referral_paid(p_ids uuid[], p_note text default null)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n int;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  update public.referral_credits r
     set status = 'paid', paid_at = now(), paid_by = auth.uid(), paid_note = left(p_note, 300)
   where r.id = any (coalesce(p_ids, '{}')) and r.status = 'owed';
  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke execute on function public.admin_get_billing_settings()               from public, anon;
revoke execute on function public.admin_set_billing_settings(jsonb)          from public, anon;
revoke execute on function public.admin_list_referral_credits(text)          from public, anon;
revoke execute on function public.admin_mark_referral_paid(uuid[], text)     from public, anon;
grant  execute on function public.admin_get_billing_settings()               to authenticated;
grant  execute on function public.admin_set_billing_settings(jsonb)          to authenticated;
grant  execute on function public.admin_list_referral_credits(text)          to authenticated;
grant  execute on function public.admin_mark_referral_paid(uuid[], text)     to authenticated;

notify pgrst, 'reload schema';

-- 22.2 CHECKS TO RUN, none of which has been run yet ---------------
--  1. anon and authenticated: select from billing_settings and from
--     referral_credits -> 42501. A non-admin calling any admin_* here
--     -> 42501. anon calling my_referral -> 42501.
--  2. a member who has paid nothing: my_referral() -> eligible false.
--     After one activated payment: eligible, a code 'REF-XXXXXX' with
--     percent_off 10; a second call returns the SAME code.
--  3. that member quoting their own code -> ok false, reason own_code;
--     create_pending_payment with it -> 22023.
--  4. a friend buying with it -> 10% off; activation -> one
--     referral_credits row 'owed' for the referrer at the reward
--     setting; the code's uses 1; a second activation (already) adds
--     nothing.
--  5. admin_set_billing_settings('{"referral_reward_paise": 50000}')
--     -> the pct cleared; the next referred payment credits ₹500 (or
--     the payment, if less).
--  6. mark_payment_refunded on the friend's payment -> the credit void.
--  7. admin_mark_referral_paid([id]) -> 'paid', paid_at set; marking a
--     void or paid row again changes nothing (count 0).
-- ============================================================


-- ============================================================
-- 23. AFFILIATE CODES — a promo code that earns its owner a commission
-- ------------------------------------------------------------
-- RUN 8 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor, as sections 20 to 23 together (the owner's call, once the
-- Razorpay work began): "Success. No rows returned". Read back
-- immediately afterwards: all 22 objects these four sections create are
-- present -- promo_codes, referral_credits and billing_settings, and the
-- functions quote_order, quote_for, promo_price, promo_reason_sentence,
-- paid_credit_paise, ensure_referral_code, my_referral,
-- payments_referral_after, admin_set_promo_code, admin_list_promo_codes,
-- admin_list_referral_credits, admin_mark_referral_paid,
-- admin_affiliate_report, admin_affiliate_orders,
-- admin_get_billing_settings, admin_set_billing_settings -- plus
-- create_pending_payment, activate_payment and admin_list_payments, which
-- section 20 drops and recreates. plans still holds 4 rows.
-- THE DEPLOY DEBT THIS CREATES: rzp-order must be deployed from the
-- CURRENT source, because it passes p_code to the five-argument
-- create_pending_payment that now exists. It is not deployed at all yet,
-- so nothing is broken in the meantime -- but do not deploy an older copy.
-- The 20.2 / 21.1 / 22.2 / 23.1 live checks are still unrun.
-- Owner's ask, 7 Oct 2026.
-- codes for film schools, YouTubers and festival desks that pay their
-- holder a share of what comes in through them.
--
--   * AN AFFILIATE CODE IS A PROMO CODE WITH commission_pct. Made on
--     the console like any other (admin_set_promo_code learns one key);
--     kind becomes 'affiliate'. The buyer's discount is the code's
--     percent_off / amount_off_paise, exactly as §20 — an affiliate
--     code may also give nothing off (a 1% code is the smallest offer
--     the table allows, so "no discount" is a separate decision the
--     owner makes by choosing a small one).
--   * NOTHING IS STORED PER ORDER. Revenue and commission are DERIVED
--     from the ledger at read time: the sum of amount_paise over the
--     code's 'paid' payments — which is already net of the discount and
--     of any §21 credit — and floor(revenue × pct / 100). A refunded
--     payment is 'refunded' and drops out of both by itself. A stored
--     running total would be a second representation of the ledger,
--     and the first refund would make the two disagree.
--   * Commission is a number for the owner to pay by hand; the report
--     says what is due, not what was paid. (Referral credits, §22, are a
--     ledger because they belong to members who read them; an affiliate
--     is somebody the owner settles with directly.)
-- ============================================================
alter table public.promo_codes add column if not exists commission_pct numeric(5,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'promo_codes_commission_check') then
    alter table public.promo_codes add constraint promo_codes_commission_check check (commission_pct is null or (commission_pct > 0 and commission_pct <= 100));
  end if;
end $$;

/** §20's console write, learning `commission_pct` (a number, or null to
 *  clear it). A code with a commission is kind 'affiliate'; clearing it
 *  makes it a plain 'promo' again. Referral and gift codes take none. */
create or replace function public.admin_set_promo_code(p_code text, p_patch jsonb)
returns public.promo_codes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  row  public.promo_codes;
  ids  text[];
  bad  text;
  comm numeric;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' then
    raise exception 'A code is 3 to 32 letters, digits or dashes' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be an object' using errcode = '22023'; end if;
  if p_patch ? 'plan_ids' then
    if jsonb_typeof(p_patch -> 'plan_ids') = 'array' then
      select array_agg(x) into ids from jsonb_array_elements_text(p_patch -> 'plan_ids') x;
      if ids is not null and cardinality(ids) = 0 then ids := null; end if;
      select x into bad from unnest(ids) x where x not in (select id from public.plans where id <> 'free') limit 1;
      if bad is not null then raise exception 'No such paid plan "%"', bad using errcode = '22023'; end if;
    elsif jsonb_typeof(p_patch -> 'plan_ids') <> 'null' then
      raise exception 'plan_ids must be a list of plan ids or null' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'commission_pct' then
    if jsonb_typeof(p_patch -> 'commission_pct') not in ('number', 'null') then
      raise exception 'commission_pct must be a number or null' using errcode = '22023';
    end if;
    comm := (p_patch ->> 'commission_pct')::numeric;
  end if;
  select * into row from public.promo_codes c where c.code = v_code for update;
  if row.code is not null and row.kind in ('referral', 'gift') and p_patch ? 'commission_pct' and comm is not null then
    raise exception 'A % code carries no commission', row.kind using errcode = '22023';
  end if;
  if row.code is null then
    insert into public.promo_codes (code, percent_off, amount_off_paise, plan_ids, max_uses, valid_from, valid_until, active, note, created_by, commission_pct, kind)
    values (v_code,
            (p_patch ->> 'percent_off')::int,
            (p_patch ->> 'amount_off_paise')::int,
            case when p_patch ? 'plan_ids' then ids end,
            (p_patch ->> 'max_uses')::int,
            (p_patch ->> 'valid_from')::timestamptz,
            (p_patch ->> 'valid_until')::timestamptz,
            coalesce((p_patch ->> 'active')::boolean, true),
            left(p_patch ->> 'note', 300),
            auth.uid(),
            comm,
            case when comm is not null then 'affiliate' else 'promo' end)
    returning * into row;
  else
    update public.promo_codes c
       set percent_off      = case when p_patch ? 'percent_off'      then (p_patch ->> 'percent_off')::int        else c.percent_off end,
           amount_off_paise = case when p_patch ? 'amount_off_paise' then (p_patch ->> 'amount_off_paise')::int   else c.amount_off_paise end,
           plan_ids         = case when p_patch ? 'plan_ids'         then ids                                      else c.plan_ids end,
           max_uses         = case when p_patch ? 'max_uses'         then (p_patch ->> 'max_uses')::int           else c.max_uses end,
           valid_from       = case when p_patch ? 'valid_from'       then (p_patch ->> 'valid_from')::timestamptz  else c.valid_from end,
           valid_until      = case when p_patch ? 'valid_until'      then (p_patch ->> 'valid_until')::timestamptz else c.valid_until end,
           active           = coalesce((p_patch ->> 'active')::boolean, c.active),
           note             = case when p_patch ? 'note' then left(p_patch ->> 'note', 300) else c.note end,
           commission_pct   = case when p_patch ? 'commission_pct' then comm else c.commission_pct end,
           kind             = case when c.kind in ('referral', 'gift') or not (p_patch ? 'commission_pct') then c.kind
                                   when comm is not null then 'affiliate' else 'promo' end,
           updated_at       = now()
     where c.code = v_code
     returning * into row;
  end if;
  return row;
exception
  when check_violation then
    raise exception 'A code takes either a percentage (1–100) or an amount off in paise, not both; uses must be positive, the window must end after it starts, and a commission is above 0 and at most 100%%' using errcode = '22023';
end;
$fn$;
revoke execute on function public.admin_set_promo_code(text, jsonb) from public, anon;
grant  execute on function public.admin_set_promo_code(text, jsonb) to authenticated;

/** Per affiliate code: orders, revenue net of discount, commission due.
 *  Derived from the ledger every time — nothing here is stored. */
create or replace function public.admin_affiliate_report()
returns table (code text, note text, commission_pct numeric, active boolean, percent_off int, amount_off_paise int,
               orders int, revenue_paise bigint, discount_paise bigint, commission_due_paise bigint,
               refunded int, last_order_at timestamptz)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select c.code, c.note, c.commission_pct, c.active, c.percent_off, c.amount_off_paise,
           count(p.id) filter (where p.status = 'paid')::int,
           coalesce(sum(p.amount_paise) filter (where p.status = 'paid'), 0)::bigint,
           coalesce(sum(p.discount_paise) filter (where p.status = 'paid'), 0)::bigint,
           floor(coalesce(sum(p.amount_paise) filter (where p.status = 'paid'), 0) * c.commission_pct / 100)::bigint,
           count(p.id) filter (where p.status = 'refunded')::int,
           max(p.paid_at) filter (where p.status = 'paid')
      from public.promo_codes c
      left join public.payments p on p.promo_code = c.code
     where c.commission_pct is not null
     group by c.code
     order by c.active desc, 8 desc, c.code;
end;
$fn$;

/** One affiliate code's paid and refunded orders, newest first. */
create or replace function public.admin_affiliate_orders(p_code text)
returns table (paid_at timestamptz, email text, plan_id text, list_paise int, discount_paise int, amount_paise int, status text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select p.paid_at, u.email::text, p.plan_id, p.list_paise, p.discount_paise, p.amount_paise, p.status
      from public.payments p
      left join auth.users u on u.id = p.user_id
     where p.promo_code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
       and p.status in ('paid', 'refunded')
     order by p.paid_at desc nulls last
     limit 500;
end;
$fn$;
revoke execute on function public.admin_affiliate_report()      from public, anon;
revoke execute on function public.admin_affiliate_orders(text)  from public, anon;
grant  execute on function public.admin_affiliate_report()      to authenticated;
grant  execute on function public.admin_affiliate_orders(text)  to authenticated;

notify pgrst, 'reload schema';

-- 23.1 CHECKS TO RUN, none of which has been run yet ---------------
--  1. a non-admin calling admin_affiliate_report / admin_affiliate_orders
--     -> 42501.
--  2. admin: admin_set_promo_code('FESTDESK', '{"percent_off": 5,
--     "commission_pct": 20}') -> kind 'affiliate'; commission 0 or 101
--     -> 22023; a commission on a REF- code -> 22023.
--  3. two test purchases with FESTDESK, one refunded: the report shows
--     orders 1, revenue = that payment's amount (net of the 5%),
--     commission = floor(revenue × 20%), refunded 1.
--  4. '{"commission_pct": null}' -> kind back to 'promo', gone from the
--     report.
-- ============================================================

-- ============================================================
-- 24. TWO MORE SYNC SCOPES: characters and costs
-- ------------------------------------------------------------
-- RUN 8 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor, together with section 19: "Success. No rows returned".
-- Read back immediately afterwards: project_data_scope_check now names
-- 'characters' and 'costs' AND still names 'edit' and 'deliverables';
-- the definition grew from 407 to 442 characters; project_data kept all
-- 30 of its rows and projects all 6, so the constraint swap validated
-- against the existing data rather than rejecting any of it. The 24.1
-- live checks are still unrun.
-- Until it ran, cloud.js
-- would send upserts the CHECK refuses, so the two keys move from
-- LOCAL_ONLY into SCOPE_BY_KEY in the same commit as this section and
-- the deploy order in docs/LAUNCH.md puts §24 before that build goes
-- live. Same procedure as sections 12, 13.7 and 17: the constraint is
-- rebuilt (Postgres has no ALTER CONSTRAINT for a CHECK) and found by
-- its definition, because an inline column CHECK is named by the
-- server.
--
--   characters  `fms_characters_v1` — what the writer says about each
--               character (src/lib/characters.js). Who speaks is
--               derived from the script's cues and is not in it.
--   costs       `fms_costs_v1` — expenses, petty-cash floats and crew
--               payments (src/lib/costs.js). The estimate stays in
--               `library`.
-- ============================================================
do $$
declare
  cname text;
begin
  select con.conname into cname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'project_data'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%scope%'
   limit 1;
  if cname is not null then
    execute format('alter table public.project_data drop constraint %I', cname);
  end if;
  alter table public.project_data
    add constraint project_data_scope_check check (scope in (
      'feature','short','library',
      'feature_prefs','short_prefs','library_prefs','activity',
      'scenes','contacts','shots','script','locations',
      'workbench','dissect','festivals','scriptgen','songs',
      'story','idea_vault',
      'edit','deliverables',
      'characters','costs'
    ));
end $$;

notify pgrst, 'reload schema';

-- 24.1 CHECKS TO RUN, none of which has been run yet ---------------
--  1. a member upserting project_data with scope 'characters' or
--     'costs' on a project they own -> allowed; 'anything_else' ->
--     23514 (check violation); 'edit' and 'deliverables' still allowed.
--  2. a character note and an expense written on device A appear on
--     device B after its next pull.
-- ============================================================


-- ============================================================
-- 25. UNDOING AN ADMIN DECISION — recover a declined account,
--     and clear a user back to a stranger
-- ------------------------------------------------------------
-- RUN 8 Oct 2026 against conhlrulxfwkhsnymakz through the dashboard's
-- SQL editor: "Success. No rows returned", twice - see the correction
-- below. Read back: the function exists, returns jsonb, takes
-- (p_user uuid, p_note text DEFAULT NULL), is SECURITY DEFINER, and
-- the grants are right - anon EXECUTE false, authenticated true.
--
-- THREE OF THE 25.1 CHECKS ARE DONE, live, against this database:
--   * on a uuid that does not exist: returns every flag false and
--     touches nobody, so the function runs clean against a stranger.
--   * on YOURSELF: 42501 "You cannot clear your own account" - the
--     guard holds, and studio_status still answered 'admin' after.
--   * the anon grant: revoked, confirmed by has_function_privilege.
-- Still unrun: a non-admin caller, an admin target, a real clear of a
-- real user, and the one that matters most - that their projects
-- survive it.
--
-- AND THE FIRST RUN HAD A BUG THE PROBE CAUGHT. signed_out was set
-- from "the delete did not raise" rather than from rows affected, so
-- clearing a user with no session - or one who does not exist -
-- reported signed_out true. An administrator would read that as "their
-- session was revoked" when nothing had been. It uses get diagnostics
-- now and the re-run reports false. Worth keeping because it is the
-- shape of mistake a dry read never finds: the statement succeeded,
-- the fact it asserted was false.
--
-- Owner's ask, 8 Oct 2026.
--
-- The console could let somebody IN and keep them out, and nothing
-- else. Two doors were missing and both were asked for by name:
--
--   * RECOVER A DECLINED ACCOUNT. admin_decide_request(u, true)
--     already does exactly the right thing to a declined row - it
--     inserts the studio_members row and flips the status to
--     'approved', which also ends the seven-day cooling-off, because
--     that is computed from status plus decided_at. So recovery needs
--     NO SQL. It needed a button: gate-ui.js listed decided requests
--     in a read-only <details> and offered no way back. Said here
--     because the next person will look for a function that does not
--     exist, and should not write one.
--
--   * CLEAR A USER TO FRESH, which is this section. There was no way
--     to make somebody a stranger again: no way to free the invite
--     code they consumed, to let them ask a second time after a
--     decline, or to end a session held by an account being handed on.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH, because "fresh" is easy to read
-- as "gone": projects, project_data, accounts, account_members and
-- payments are all left exactly as they are. A person's films are not
-- an administrator's to delete from a console, and a refund is a
-- Razorpay decision rather than a tidy-up. Clearing a user who owns an
-- organisation leaves the organisation and its plan standing.
create or replace function public.admin_reset_user(p_user uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_members    int := 0;
  v_requests   int := 0;
  v_redeems    int := 0;
  v_sessions   int := 0;
  v_authrows   int := 0;
  v_authgone   boolean := false;
  v_target     public.studio_members;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'No user given' using errcode = '22023';
  end if;
  -- Two refusals that stop a console from locking itself out. An admin
  -- clearing themselves would drop their own membership mid-click; an
  -- admin clearing a PEER would do it without that peer agreeing. Demote
  -- first, deliberately, then clear - two steps on purpose.
  if p_user = auth.uid() then
    raise exception 'You cannot clear your own account' using errcode = '42501';
  end if;
  select * into v_target from public.studio_members m where m.user_id = p_user;
  if v_target.role = 'admin' then
    raise exception 'That account is an administrator. Change their role first, then clear them.'
      using errcode = '42501';
  end if;

  delete from public.studio_members       where user_id = p_user;
  get diagnostics v_members  = row_count;
  delete from public.invite_requests      where user_id = p_user;
  get diagnostics v_requests = row_count;
  -- Frees the seat on whatever code they came in through: a code with
  -- max_uses 1, spent on somebody being cleared, becomes usable again.
  delete from public.invite_redemptions   where user_id = p_user;
  get diagnostics v_redeems  = row_count;
  -- The device lock. Without this the next sign-in can be refused as a
  -- second device by a session nobody is holding.
  delete from public.user_active_sessions where user_id = p_user;
  get diagnostics v_sessions = row_count;

  -- AND THE SESSION ITSELF, which is the part that makes the next
  -- sign-in a new one rather than a resumed one. Deleting the device
  -- lock above does NOT sign anybody out: their refresh token is still
  -- good and the browser keeps using it. This revokes it. Wrapped,
  -- because auth.sessions is not ours and a permissions change there
  -- must not cost the caller the rest of the reset.
  begin
    delete from auth.sessions where user_id = p_user;
    /* ROWS, not "no exception". Deleting zero rows succeeds, so the
       first version reported signed_out true for a user who had no
       session at all - including one that does not exist. An admin
       reading "signed out" would believe a session had been revoked
       when none had. Caught by the 25.1 probe on a non-existent uuid,
       8 Oct 2026. */
    get diagnostics v_authrows = row_count;
    v_authgone := v_authrows > 0;
  exception when others then
    v_authgone := false;
  end;

  return jsonb_build_object(
    'membership_removed', v_members  > 0,
    'request_removed',    v_requests > 0,
    'redemptions_freed',  v_redeems,
    'device_lock_cleared', v_sessions > 0,
    'signed_out',         v_authgone,
    'note',               nullif(left(trim(coalesce(p_note, '')), 500), '')
  );
end;
$fn$;

revoke execute on function public.admin_reset_user(uuid, text) from public, anon;
grant  execute on function public.admin_reset_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- 25.1 CHECKS TO RUN, none of which has been run yet -----------------
--  1. as a non-admin: rpc admin_reset_user -> 42501.
--  2. as an admin, on yourself -> 42501, 'cannot clear your own'.
--  3. as an admin, on another ADMIN -> 42501, naming the demote step.
--  4. on a declined non-member -> request_removed true, and they can
--     ask again at once rather than waiting out the cooling-off.
--  5. on a member who came in through a one-use code -> that code has
--     a use back; redemptions_freed 1.
--  6. signed_out true, and that user's next page load asks them to
--     sign in rather than resuming.
--  7. their projects are all still there afterwards. This is the check
--     that matters most: the function is destructive by name and must
--     not be by effect.
-- ============================================================

-- ============================================================
-- 26. TIER LABELS: Basic / Intermediate / Pro            NOT RUN LIVE — owner approval
-- ------------------------------------------------------------
-- Ids stay free / starter / indie / pro (CHECKs, plan_rank and the
-- client's PLAN_ORDER are untouched). Only the label changes, and the
-- label lives in plans.name. Two things follow:
--   26.1 the three P0402 limit triggers named the plan with
--        initcap(id) -- "Starter", "Indie" -- ignoring the table, so a
--        console rename never reached the sentence. They read the
--        stored name now, falling back to initcap if the row is gone.
--   26.2 the seeded names move, guarded so a name an admin already
--        edited in the console is never clobbered.
-- ============================================================

-- 26.1 THE LIMITS, NAMING THE PLAN BY ITS STORED NAME ----------------
create or replace function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  pl  := public.user_plan(new.owner_id);
  cap := public.plan_cap(public.user_limits(new.owner_id), 'projects');
  if cap is null then return new; end if;
  select count(*) into n from public.projects p where p.owner_id = new.owner_id;
  if n >= cap then
    raise exception 'Your % plan syncs up to % project%. Upgrade to add another to the cloud; it is still saved on this device.',
      coalesce((select x.name from public.plans x where x.id = pl), initcap(pl)), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;

create or replace function public.enforce_share_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid; cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  pl  := public.user_plan(owner);
  cap := public.plan_cap(public.user_limits(owner), 'shares');
  if cap is null then return new; end if;
  select count(*) into n from public.shares s join public.projects p on p.id = s.project_id
   where p.owner_id = owner and (s.expires_at is null or s.expires_at > now());
  if n >= cap then
    raise exception 'Your % plan allows % live share link%. Revoke one, or upgrade.',
      coalesce((select x.name from public.plans x where x.id = pl), initcap(pl)), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;

create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid; cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  pl  := public.user_plan(owner);
  cap := public.plan_cap(public.user_limits(owner), 'collaborators');
  if cap is null then return new; end if;
  select count(*) into n from public.project_collaborators pc where pc.project_id = new.project_id;
  if n >= cap then
    raise exception 'This film''s owner is on the % plan, which allows % collaborator% per film.',
      coalesce((select x.name from public.plans x where x.id = pl), initcap(pl)), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;

-- 26.2 THE SEEDED LABELS ----------------------------------------------
update public.plans set name = 'Basic'        where id = 'starter' and name = 'Starter';
update public.plans set name = 'Intermediate' where id = 'indie'   and name = 'Indie';

notify pgrst, 'reload schema';

-- 26.3 CHECKS TO RUN, none of which has been run live -----------------
--  1. select id, name from plans order by sort -> Free, Basic,
--     Intermediate, Pro (or whatever the console had set).
--  2. a Basic owner's fourth project -> P0402 "Your Basic plan syncs
--     up to 3 projects ...".
--  3. rename a plan in the console, repeat 2: the sentence follows.
-- ============================================================
