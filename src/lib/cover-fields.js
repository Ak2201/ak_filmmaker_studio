/* ============================================================
   COVER FIELDS — the part covers' saved fields, as plain data
   ------------------------------------------------------------
   A cover holds saved fields (meta_*, v1_*, v2_*, p3_*, p4_* —
   somebody's writing). The covers' markup is a string inside
   feature.js, which is a page, not a module, so the fields are
   restated here: key, label and placeholder.
   scripts/test-stage-guide.mjs reads feature.js and short.js and fails
   if any key here has stopped existing there. The cover ids are the
   ones steps.stages.json `parts` names.

   Pure (JSON and functions, no DOM, no storage), so two views share
   it: the stage guides' cover sheet (src/ui/stage-guide.js, which
   re-exports all of it) and the project dashboard's Title page
   (src/pages/dashboard.js, since 19 Oct 2026), which edits the Story
   stage's cover — title, writer, draft — through the SAME keys and
   the same blueprint-store merge-write. The keys are a contract with
   saved work (CLAUDE.md invariant 1); nothing here renames one.
   ============================================================ */
import STAGES from '../data/steps.stages.json';

const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

export const GENRES = ['Drama', 'Romance', 'Thriller', 'Crime / Noir', 'Comedy', 'Action', 'Horror',
  'Sci-Fi', 'Fantasy', 'Family', 'Coming-of-Age', 'Biopic', 'Documentary', 'Anthology',
  'Experimental', 'Other'];

export const COVER_FIELDS = {
  'vol-1': [
    { key: 'meta_title', label: 'Project title', placeholder: 'Untitled film' },
    { key: 'meta_writer', label: 'Writer / Director', placeholder: 'Your name' },
    { key: 'meta_started', label: 'Started on', placeholder: 'DD / MM / YYYY' },
    { key: 'meta_stage', label: 'Stage', placeholder: 'Story / Screenplay / Pre-prod…' },
    { key: 'v1_title', label: 'Working title', placeholder: 'Untitled film' },
    { key: 'v1_genre', label: 'Genre', options: GENRES, empty: 'Pick a genre...' },
    { key: 'v1_draft', label: 'Draft', placeholder: '01 — Treatment' }
  ],
  'part-2': [],
  'vol-2': [
    { key: 'v2_director', label: 'Director' },
    { key: 'v2_producer', label: 'Producer' },
    { key: 'v2_start', label: 'Pre-prod start', placeholder: 'DD / MM / YYYY' },
    { key: 'v2_shoot', label: 'Target shoot start', placeholder: 'DD / MM / YYYY' },
    { key: 'v2_budget', label: 'Estimated budget' }
  ],
  'phase-3': [
    { key: 'p3_start', label: 'First day of shoot', placeholder: 'DD / MM / YYYY' },
    { key: 'p3_days', label: 'Shoot days planned', placeholder: 'e.g. 28' },
    { key: 'p3_ad', label: '1st AD' },
    { key: 'p3_base', label: 'Unit base', placeholder: 'Chennai, Madurai…' }
  ],
  'phase-4': [
    { key: 'p4_editor', label: 'Editor' },
    { key: 'p4_sound', label: 'Sound designer' },
    { key: 'p4_music', label: 'Composer' },
    { key: 'p4_lock', label: 'Target lock date', placeholder: 'DD / MM / YYYY' }
  ]
};

/* The short film has one cover, not five; its fields sit with the
   first stage. */
export const SHORT_COVER_FIELDS = [
  { key: 'meta_title', label: 'Project title', placeholder: 'Untitled short' },
  { key: 'meta_writer', label: 'Writer / Director', placeholder: 'Your name' },
  { key: 'meta_started', label: 'Started on', placeholder: 'DD / MM / YYYY' },
  { key: 'meta_runtime', label: 'Target runtime', placeholder: 'e.g. 8 min' }
];

/** The cover fields at the top of a stage's guide, derived from the
 *  `parts` block of the sidecar (feature) — [] when there are none. */
export function coverFields(stage, format) {
  if (format === 'short') return stage === 'story' ? SHORT_COVER_FIELDS : [];
  const part = list((STAGES.parts || {}).feature).find((p) => p.stage === stage);
  return (part && COVER_FIELDS[part.cover]) || [];
}

/** The blueprint namespace a format's cover is stored in. */
export const coverNs = (format) => (format === 'short' ? 'short' : 'feature');

export default { GENRES, COVER_FIELDS, SHORT_COVER_FIELDS, coverFields, coverNs };
