/* ============================================================
   SAMPLE PROJECT — is THIS project entry a sample film?
   ------------------------------------------------------------
   A sample is stamped when it is opened: `sample: '<sampleId>'` on its
   entry in fms_studio_projects_v1 (a field, not a key). The sync layer
   skips ONLY entries that answer here. Title alone never decides: a
   user's own film called "Dragon" must sync like any other.

   LEGACY entries (opened before the stamp) carry no field. They count
   as the sample only when it is PROVABLY the seeded one: the title is a
   sample's AND the stored scenes still hold that sample's seeded ids
   (`<sampleId>-sc-<n>`, written by hub-sample.js and by nobody else).
   No marker found (scenes deleted, unreadable) = an ordinary project:
   the safe default is that a person's work is never left out of sync.
   ============================================================ */
import * as Store from './store.js';
import { SAMPLES, sampleById } from './samples.js';
import { SCENES_KEY } from './hub-keys.js';

/** The sample id this entry is, or ''. */
export function sampleIdOf(p) {
  if (!p) return '';
  if (typeof p.sample === 'string' && sampleById(p.sample)) return p.sample;
  const s = SAMPLES.find((x) => x.title === p.title);
  if (!s || !p.id) return '';
  try {
    const raw = Store.rawGet(SCENES_KEY + '__' + p.id);
    const list = raw ? (JSON.parse(raw) || {}).scenes : null;
    const pre = s.id + '-sc-';
    if (Array.isArray(list) && list.some((sc) => sc && typeof sc.id === 'string' && sc.id.startsWith(pre))) return s.id;
  } catch (e) { /* unreadable: ordinary */ }
  return '';
}

export function isSampleProject(p) { return !!sampleIdOf(p); }

/** The existing entry for this sample in the open namespace: the
    stamped one first, then a provable legacy one. */
export function findSampleProject(sampleId) {
  const all = Store.listProjects();
  return all.find((p) => p.sample === sampleId) || all.find((p) => !p.sample && sampleIdOf(p) === sampleId) || null;
}

export default { sampleIdOf, isSampleProject, findSampleProject };
