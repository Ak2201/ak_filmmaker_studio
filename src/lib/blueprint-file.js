/* ============================================================
   A BLUEPRINT FILE — is this one ours, and is it the right one?
   ------------------------------------------------------------
   Both blueprints export their blob as a flat JSON object, field key
   to value, and both imports used to write whatever JSON they were
   handed straight over the blob. A studio backup, a Short file on the
   Feature page or somebody's package.json all "imported", and because
   loadData() merged rather than replaced, the result was two films
   interleaved field by field with nothing on screen saying so.

   This decides, before anything is written, whether a parsed file is
   a blueprint this page can take. The page asks; the page confirms;
   the page replaces. Nothing here touches storage or the DOM beyond
   reading which data-keys the page has.

   THE TEST, and why it is a ratio: a blueprint file's keys are the
   page's data-keys (plus the row families a page builds on demand,
   which `extraKey` recognises). A file from the OTHER blueprint
   shares a handful of keys — meta_title, a checklist id or two — so
   "any key matches" would wave it through. Requiring most of the
   file's keys to be ones this page owns tells the two apart and still
   accepts an export from an older build that carried a few retired
   keys.
   ============================================================ */

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v) => v == null || ['string', 'boolean', 'number'].includes(typeof v);

/**
 * @param {string} text           the file's contents
 * @param {object} o
 * @param {Set<string>} o.keys    data-keys present on this page
 * @param {(k:string)=>boolean} [o.extraKey]  other keys this page owns
 * @param {(k:string,v:any)=>boolean} [o.allowNonScalar]  structured fields
 * @param {string} o.label        "Feature Blueprint" — for messages
 * @param {string} [o.otherLabel] the other blueprint, for the mix-up message
 * @param {(data:object)=>boolean} [o.looksOther]  is this the other blueprint?
 * @returns {{ok:true, data:object, fields:number} | {ok:false, error:string}}
 */
export function readBlueprintFile(text, o) {
  let data;
  try { data = JSON.parse(text); } catch (e) {
    return { ok: false, error: 'That file is not JSON, so it cannot be a ' + o.label + ' export. Nothing was changed.' };
  }
  if (!isPlainObject(data)) {
    return { ok: false, error: 'That file is not a ' + o.label + ' export. Nothing was changed.' };
  }
  if (data._version && data.data && Array.isArray(data.projects)) {
    return { ok: false, error: 'That is a whole-studio backup, not a ' + o.label +
      ' export. Import it from the Studio page (Import backup), which keeps each project separate. Nothing was changed.' };
  }
  if (o.looksOther && o.looksOther(data)) {
    return { ok: false, error: 'That looks like a ' + (o.otherLabel || 'different blueprint') +
      ' export. Import it on that page instead. Nothing was changed.' };
  }
  const names = Object.keys(data);
  const owned = names.filter((k) => o.keys.has(k) || (o.extraKey && o.extraKey(k)));
  const badValue = names.find((k) => !isScalar(data[k]) && !(o.allowNonScalar && o.allowNonScalar(k, data[k])));
  if (badValue) {
    return { ok: false, error: 'That file is not a ' + o.label + ' export — its field "' + badValue +
      '" is not something this page stores. Nothing was changed.' };
  }
  if (!names.length || !owned.length || owned.length < names.length / 2) {
    return { ok: false, error: 'That file is not a ' + o.label + ' export — ' +
      (names.length ? owned.length + ' of its ' + names.length + ' fields belong to this page.' : 'it is empty.') +
      ' Nothing was changed.' };
  }
  return { ok: true, data, fields: owned.length };
}

export default { readBlueprintFile };
