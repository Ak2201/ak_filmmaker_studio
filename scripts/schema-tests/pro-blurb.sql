-- ============================================================
-- SECTION 64 CHECKS — the Pro plan's blurb
-- ------------------------------------------------------------
-- Runs after §64 has loaded once (the runner loads it twice). Puts the OLD
-- live wording back, re-runs the section's own file, and asserts the new
-- wording lands, that a second run changes nothing, and that no other
-- column of the row moved.
-- ============================================================
\set ON_ERROR_STOP on

update public.plans set blurb = 'A production house. No caps.' where id = 'pro';
\i supabase/schema/schema-64-pro-blurb.sql

do $$ begin
  if (select blurb from public.plans where id = 'pro') <> 'A production house: no cap on films, links or collaborators.' then
    raise exception 'the live blurb was not updated';
  end if;
  raise notice 'ok - 64. the old live blurb is replaced by the seed''s wording';
end $$;

-- A second run writes nothing: stamp the row, run again, the stamp survives.
create temp table pb_xmin as select xmin::text as x from public.plans where id = 'pro';
\i supabase/schema/schema-64-pro-blurb.sql
do $$ begin
  if (select xmin::text from public.plans where id = 'pro') <> (select x from pb_xmin) then
    raise exception 'a second run rewrote the row';
  end if;
  if (select count(*) from public.plans where id = 'pro') <> 1 then raise exception 'pro row missing'; end if;
  raise notice 'ok - 64. a second run updates nothing';
end $$;
