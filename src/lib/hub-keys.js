/* ============================================================
   HUB KEYS — the storage keys and page names the hub's views read
   ------------------------------------------------------------
   Moved here from src/pages/hub/util.js and src/pages/hub/all-keys.js
   when the hub's view and logic were split (docs/ARCHITECTURE.md): a
   model in src/lib/ owns the key names it reads and writes, and the
   view asks it by function. The old modules re-export these, so every
   existing importer (settings.js reads ALL_KEYS) is unchanged.

   EVERY STRING HERE IS A CONTRACT WITH SAVED WORK (CLAUDE.md
   invariant 1). Byte-identical to the legacy hub. Do not touch.

   IMPORT-FREE on purpose: the Backup menu and the status bar ride on
   every page and read the activity log through src/lib/hub-activity.js,
   which reads these. Importing anything heavier here would drag it into
   every page's band.
   ============================================================ */
export const FEATURE_KEY  = 'fms_filmmaker_combined_v1';
export const SHORT_KEY    = 'fms_shortfilm_blueprint_v1';
export const LIB_CALC_KEY = 'fms_library_calc_v1';

export const ACTIVITY_KEY = 'fms_studio_activity_v1';
export const SCENES_KEY   = 'fms_scenes_v1';
export const CONTACTS_KEY = 'fms_contacts_v1';
export const SHOTS_KEY    = 'fms_shots_v1';
export const SCRIPT_KEY   = 'fms_script_v1';
export const LOCS_KEY     = 'fms_locations_v1';
export const STORY_KEY    = 'fms_story_v1';
export const DISSECT_KEY  = 'fms_dissect_v1';
export const WORKBENCH_KEY = 'fms_workbench_v1';

/* The studio-wide prefs blob (cloudSync lives in it). */
export const STUDIO_PREFS_KEY = 'fms_studio_prefs_v1';

/* A COPY of drive-sync.js's DRIVE_STATE_KEY, for the reads that ride on
   every page (the Backup menu's health line, the status bar): importing
   drive-sync.js would drag the Drive client into every page's band. The
   reset list in src/lib/hub-reset.js imports the original. */
export const DRIVE_STATE_KEY_COPY = 'fms_drive_sync_v1';

export const FEATURE_URL   = 'feature.html';
export const SHORT_URL     = 'short.html';
export const PROJECT_HOME_URL = 'dashboard.html';
export const LIBRARY_URL   = 'library.html';
