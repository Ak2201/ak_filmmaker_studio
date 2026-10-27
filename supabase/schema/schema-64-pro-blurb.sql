-- RUN: owner, in the Supabase SQL editor, any time after §1 (it touches one
--      column of one row of public.plans and nothing else). Hash the file
--      first (shasum -a 256 supabase/schema/schema-64-pro-blurb.sql) and
--      compare it with the editor's contents before pressing Run
--      (docs/LAUNCH.md §4; the checksum is in docs/LIVE-STEPS-2026-10-27.md
--      "§64 Pro blurb"). Re-runnable: a second run updates nothing. No
--      function redeploy.
-- ============================================================
-- 64. THE PRO PLAN'S BLURB
-- ------------------------------------------------------------
-- The seed in supabase-schema.sql was reworded to "A production house: no cap
-- on films, links or collaborators." but the seed is `on conflict (id) do
-- nothing`, so a database that already ran it keeps the old wording ("A
-- production house. No caps."). This section is the live row's own update.
-- The new text is the seed's, character for character; the console's
-- admin_update_plan (§40/§46) can also change it, which is why this only
-- writes when the text differs and touches nothing else on the row.
-- ============================================================

begin;

update public.plans
   set blurb = 'A production house: no cap on films, links or collaborators.'
 where id = 'pro'
   and blurb is distinct from 'A production house: no cap on films, links or collaborators.';

commit;

-- 64.1 READ-BACK (read-only) ---------------------------------------------------
select id, blurb from public.plans where id = 'pro';
--   -> pro | A production house: no cap on films, links or collaborators.
