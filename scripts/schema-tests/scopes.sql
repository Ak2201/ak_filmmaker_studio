-- ============================================================
-- SECTION 24 CHECKS — the characters and costs sync scopes
-- ------------------------------------------------------------
-- Runs as the database owner (no claims), so RLS is not what is
-- being tested here: only the CHECK on project_data.scope.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002401', 'scopes@example.test', now(), '{}');
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000024a1', '00000000-0000-4000-8000-000000002401', 'Scopes');

do $$
declare s text;
begin
  foreach s in array array['characters','costs','edit','deliverables','story','scenes'] loop
    insert into public.project_data (project_id, scope, data)
      values ('00000000-0000-4000-8000-0000000024a1', s, '{"v":1}');
    raise notice 'ok - 24. scope % is accepted', s;
  end loop;
end $$;

do $$ begin
  insert into public.project_data (project_id, scope, data)
    values ('00000000-0000-4000-8000-0000000024a1', 'anything_else', '{}');
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 24. an unknown scope -> 23514'; end $$;

do $$
declare n int;
begin
  select count(*) into n from pg_constraint con join pg_class c on c.oid = con.conrelid
   where c.relname = 'project_data' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%scope%';
  if n <> 1 then raise exception 'expected one scope CHECK, found %', n; end if;
  raise notice 'ok - 24. exactly one scope CHECK on project_data';
end $$;
