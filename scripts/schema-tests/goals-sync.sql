-- ============================================================
-- SECTION 37 CHECKS — the write_goals sync scope
-- Runs as the database owner: only the CHECK on project_data.scope.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003701', 'goals-sync@example.test', now(), '{}');
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000037a1', '00000000-0000-4000-8000-000000003701', 'Goals');

do $$
declare s text;
begin
  foreach s in array array['write_goals','characters','costs','edit','deliverables','story','scenes'] loop
    insert into public.project_data (project_id, scope, data)
      values ('00000000-0000-4000-8000-0000000037a1', s, '{"v":1}');
    raise notice 'ok - 37. scope % is accepted', s;
  end loop;
end $$;

do $$ begin
  insert into public.project_data (project_id, scope, data)
    values ('00000000-0000-4000-8000-0000000037a1', 'anything_else', '{}');
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 37. an unknown scope -> 23514'; end $$;

do $$
declare n int;
begin
  select count(*) into n from pg_constraint con join pg_class c on c.oid = con.conrelid
   where c.relname = 'project_data' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%scope%';
  if n <> 1 then raise exception 'expected one scope CHECK, found %', n; end if;
  raise notice 'ok - 37. exactly one scope CHECK on project_data';
end $$;

do $$ begin
  update public.project_data set data = '{"v":1,"days":{"2026-10-12":{"w0":0,"p0":0,"w":10,"p":0.1}}}'
   where project_id = '00000000-0000-4000-8000-0000000037a1' and scope = 'write_goals';
  if not exists (select 1 from public.project_data
                  where project_id = '00000000-0000-4000-8000-0000000037a1'
                    and scope = 'write_goals' and data->'days' ? '2026-10-12') then
    raise exception 'goals history did not round-trip';
  end if;
  raise notice 'ok - 37. a per-day goals history round-trips through project_data';
end $$;
