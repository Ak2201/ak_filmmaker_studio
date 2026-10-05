-- ============================================================
-- THE SUPABASE SHIM — enough of a Supabase project to run
-- supabase-schema.sql on a plain PostgreSQL 16
-- ------------------------------------------------------------
-- Loaded by scripts/test-schema.mjs into a scratch database before
-- the schema file. It provides exactly what the schema references and
-- nothing else: the three API roles, auth.users and the two JWT
-- helpers (defined the way Supabase defines them, off the
-- request.jwt.claims GUC), the extensions schema for pgcrypto, and the
-- realtime publication. Default privileges mirror a Supabase project:
-- the API roles may touch everything in public, and RLS does the
-- guarding.
-- ============================================================
-- Roles are cluster-wide and outlive the scratch database, so each is
-- created only if missing.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
end $$;

create schema extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  email_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  is_anonymous        boolean not null default false,
  created_at          timestamptz not null default now(),
  last_sign_in_at     timestamptz
);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role';
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create publication supabase_realtime;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Test helpers, in their own schema so nothing in public is touched.
create schema t;
create or replace function t.claims(p_sub uuid, p_role text default 'authenticated', p_extra jsonb default '{}'::jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p_sub, 'role', p_role, 'aud', p_role) || p_extra)::text, true);
  execute format('set local role %I', p_role);
end $$;
create or replace function t.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;
create or replace function t.reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;
create or replace function t.ok(p bool, msg text) returns void language plpgsql as $$
begin
  if p is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
-- The helpers are called while impersonating the API roles.
grant usage on schema t to anon, authenticated, service_role;
alter default privileges in schema t grant execute on functions to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;
