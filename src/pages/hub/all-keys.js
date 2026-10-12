/* The reset list, moved out of hub.js so Settings' danger zone can reach it too (11 Oct 2026). */
import { FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY } from './util.js';
import { DRIVE_STATE_KEY } from '../../lib/drive-sync.js';

// ============================================================
// STORAGE KEYS — byte-identical to the legacy hub. Do not touch.
// ============================================================
const PREF_KEY     = 'fms_studio_prefs_v1';
/* Writer prefs (src/ui/format-guide.js): per device, in GLOBAL_KEYS
   too, so a backup carries them like the theme. */
const WRITE_PREFS  = 'fms_write_prefs_v1';
const FEAT_PREFS   = 'fms_filmmaker_prefs_v1';
const SHORT_PREFS  = 'fms_shortfilm_prefs_v1';
const LIB_PREFS    = 'fms_library_prefs_v1';
/* Named here but deliberately in no list on this page: see the note
   at the end of ALL_KEYS for why reset must not wipe it. */
const SYNC_CFG     = 'fms_supabase_cfg_v1';  // eslint-disable-line no-unused-vars
/* NOTE_PREFIX is imported from lib/backup.js rather than restated:
   a note's key is the one thing a backup file stores raw, so the
   prefix the exporter walks and the prefix reset sweeps have to be
   the same string by construction. */
export const ACTIVITY_KEY = 'fms_studio_activity_v1';
export const SCENES_KEY   = 'fms_scenes_v1';
export const CONTACTS_KEY = 'fms_contacts_v1';
export const SHOTS_KEY    = 'fms_shots_v1';
export const SCRIPT_KEY   = 'fms_script_v1';
export const LOCS_KEY     = 'fms_locations_v1';
const BENCH_KEY    = 'fms_workbench_v1';
const DISSECT_KEY  = 'fms_dissect_v1';
const FESTIVALS_KEY = 'fms_festivals_v1';
const SCRIPTGEN_KEY = 'fms_scriptgen_v1';
const SONGS_KEY     = 'fms_songs_v1';
const STORY_KEY     = 'fms_story_v1';
const VAULT_KEY     = 'fms_idea_vault_v1';
const EDIT_KEY      = 'fms_edit_v1';
const DELIVER_KEY   = 'fms_deliverables_v1';
const GOALS_KEY     = 'fms_write_goals_v1';   // focus mode, src/lib/write-goals.js
const SCENE_BIN_KEY = 'fms_scene_bin_v1';     // the scene bin, src/lib/scene-bin.js
const CHARACTERS_KEY = 'fms_characters_v1';   // characters as data, src/lib/characters.js
const COSTS_KEY     = 'fms_costs_v1';         // the budget's actuals, src/lib/costs.js
/* The device-lock handle (src/lib/gate.js). In this reset list so a
   wiped studio forgets which session it held; deliberately NOT in
   GLOBAL_KEYS, for the reason the Drive pointer is not. */
const DEVICE_SESSION_KEY = 'fms_device_session_v1';
/* The invite code this browser entered with (src/lib/gate.js), same
   treatment and same reasons: a wiped studio forgets it, a backup
   never carries it. */
const CODE_PASS_KEY = 'fms_invite_code_v1';
/* The onboarding tour's place (src/ui/tour.js) — also in GLOBAL_KEYS.
   Reset forgets it, so a wiped studio offers the tour again. */
const TOUR_KEY = 'fms_tour_v1';
/* Usage counting's opt-out (src/lib/usage.js, Settings -> Privacy). In the reset
   list so a wiped studio counts again by default; NOT in GLOBAL_KEYS or any
   backup — a choice about this device's reporting must not travel to another. */
const USAGE_OPTOUT_KEY = 'fms_usage_optout_v1';

export const ALL_KEYS = [
  FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY,
  FEAT_PREFS, SHORT_PREFS, LIB_PREFS,
  PREF_KEY, WRITE_PREFS, ACTIVITY_KEY, SCENES_KEY, CONTACTS_KEY,
  SHOTS_KEY, SCRIPT_KEY, LOCS_KEY, BENCH_KEY, DISSECT_KEY, FESTIVALS_KEY,
  SCRIPTGEN_KEY, SONGS_KEY, STORY_KEY, VAULT_KEY, EDIT_KEY, DELIVER_KEY, GOALS_KEY, SCENE_BIN_KEY, CHARACTERS_KEY, COSTS_KEY, DEVICE_SESSION_KEY, CODE_PASS_KEY, TOUR_KEY, USAGE_OPTOUT_KEY,
  /* The Drive pointer, so "reset everything" also DISCONNECTS Drive.
     Without it a wiped studio stays connected to a file full of
     work, and the next keystroke pushes the empty studio over it.
     The Drive FILE is not touched by anything here — reconnecting
     finds it again and offers it back. Not the same decision as
     fms_ai_key_v1, which stays out of this list on purpose: that
     one is a credential, this one is a pointer at the work. */
  DRIVE_STATE_KEY
  /* SYNC_CFG (fms_supabase_cfg_v1) WAS in this list and deliberately
     is not any more. It holds {url, key} — WHICH Supabase project this
     browser talks to — and that is a DESTINATION, not work and not a
     pointer at work the way the Drive key above is. Wiping it never
     protected anything: reset is local-only, purgeProjectEverywhere()
     makes no cloud call, so the account's own copy survived either
     way. All the wipe achieved was making somebody re-fetch a project
     URL and a long anon key from a dashboard to reach work that had
     never gone anywhere.

     Keeping it is only safe BECAUSE reset now signs out — see
     resetAll(). Keeping the config and leaving the session alone
     would have been worse than either: the supabase-js session lives
     under `sb-<ref>-auth-token`, which is not an `fms_` key and
     nothing in this file has ever touched, so the next load would
     have pulled every account project straight back down and refilled
     a studio the user had just been told twice could not be
     recovered. */
];

