/* ============================================================
   AUDIENCE STORE — where an Audience test is kept
   ------------------------------------------------------------
   docs/AUDIENCE-TEST-PLAN.md §6. Modelled on coverage-store.js and
   deliberately NOT added to it, so coverage's store is left alone.

   NO NEW KEY. A kept run is ONE document in the script blob's
   `documents` array — the array the coverage report lives in — and
   the blob already syncs and is already in the backup. So there is
   no new localStorage key, no registry change, no schema section and
   no new project_data scope. Stores nothing itself: it writes into
   the script doc it is handed and calls that doc's save.

   THE SHAPE of a stored run, on the document's `audience` field:
     { v:1, status:'partial', sig, at, model,
       checkpoint { sig, batchCount, panelSig, panel, parts, model } }
     { v:1, status:'done', sig, at, model, kept:[row ids],
       panel, order, curves, mean, moments, walkouts, verdicts, notes,
       slumps, splits, spread, agreed, dropped }
   The `body` is resultText() prose, so the document reads in the
   Documents tab and in a backup without this module; the `audience`
   field is what the engagement curve is drawn from (plan §7). The
   curves are kept WHOLE whatever rows were ticked — a curve with
   holes where a row was unticked would be a curve nobody watched.

   THE UNDO IS EXACT. storeResult() turns this draft's partial-run
   document into the finished one IN PLACE, so its undo puts a deep
   copy of the partial back at the same index (checkpoint and all, so
   a re-run does not bill twice); a brand-new document is removed.
   The documents array after an undo is byte-identical to before.
   ============================================================ */
import { resultText } from './audience-model.js';

function newDocId() {
  return (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

const clone = (x) => JSON.parse(JSON.stringify(x));

/* What a run resolved to, minus what belongs to the run rather than to
   the result (request counts, the truncation flag). */
const RUN_ONLY = new Set(['requests', 'scenes', 'truncated']);

export function audienceStore(getDocFn, saveFn) {
  const docsOf = () => {
    const d = getDocFn();
    return d && Array.isArray(d.documents) ? d.documents : [];
  };
  const storedOf = () => docsOf().filter((d) => d && d.audience && typeof d.audience === 'object');
  const doneOf = () => storedOf().filter((d) => d.audience.status === 'done' && Array.isArray(d.audience.order));
  const partialOf = (sig) => storedOf().find((d) => d.audience.status === 'partial'
    && d.audience.checkpoint && d.audience.checkpoint.sig === sig);
  /** The newest finished run, whichever draft it read — the page marks
      one from another draft as such rather than hiding it (plan §6). */
  const latestOf = () => {
    let best = null;
    for (const d of doneOf()) {
      if (!best || String(d.audience.at || '') >= String(best.audience.at || '')) best = d;
    }
    return best;
  };

  /** Store the partial run, so Stop or a closed tab never bills twice. */
  function storeCheckpoint(cp) {
    const d = getDocFn();
    if (!d || !Array.isArray(d.documents) || !cp) return null;
    let doc = partialOf(cp.sig);
    const now = new Date().toISOString();
    const body = 'Audience test in progress: ' + cp.parts.length + ' of ' + cp.batchCount
      + ' parts of the script screened to ' + (cp.panel ? cp.panel.length : 0)
      + ' simulated viewers. Resume it from the AI Desk — the parts already screened are not sent again.';
    if (!doc) {
      doc = { id: newDocId(), title: 'Audience test (in progress)', kind: 'Notes', body, updated: now,
        audience: { v: 1, status: 'partial', sig: cp.sig, at: now, model: cp.model || '', checkpoint: cp } };
      d.documents.push(doc);
    } else {
      doc.body = body;
      doc.updated = now;
      doc.audience = { ...doc.audience, model: cp.model || '', checkpoint: cp };
    }
    saveFn();
    return doc;
  }

  /**
   * Keep a finished run. `keep` (a Set or an array of row ids from
   * resultItems()) limits the prose to the rows the writer ticked;
   * absent means all of them. Returns { doc, undo }, or null when the
   * script cannot be reached.
   */
  function storeResult(res, keep = null) {
    const d = getDocFn();
    if (!d || !Array.isArray(d.documents) || !res) return null;
    const keepSet = keep == null ? null : (keep instanceof Set ? keep : new Set(keep));
    const now = new Date().toISOString();
    let doc = partialOf(res.sig);
    const index = doc ? d.documents.indexOf(doc) : -1;
    const partCopy = doc ? clone(doc) : null;
    if (!doc) { doc = { id: newDocId(), kind: 'Notes' }; d.documents.push(doc); }
    const structured = {};
    for (const [k, v] of Object.entries(res)) if (!RUN_ONLY.has(k)) structured[k] = clone(v);
    const n = (res.panel || []).length;
    doc.title = 'Audience test — ' + n + (n === 1 ? ' viewer' : ' viewers');
    doc.kind = 'Notes';
    doc.body = resultText(res, keepSet);
    doc.updated = now;
    doc.audience = { ...structured, v: 1, status: 'done', sig: res.sig, at: res.at || now, model: res.model || '',
      kept: keepSet ? [...keepSet] : null };
    saveFn();
    const id = doc.id;
    const undo = () => {
      const cur = getDocFn();
      if (!cur || !Array.isArray(cur.documents)) return;
      const i = cur.documents.findIndex((x) => x && x.id === id);
      if (i >= 0) {
        if (partCopy) cur.documents.splice(i, 1, clone(partCopy)); else cur.documents.splice(i, 1);
      } else if (partCopy && index >= 0) {
        cur.documents.splice(Math.min(index, cur.documents.length), 0, clone(partCopy));
      }
      saveFn();
    };
    return { doc, undo };
  }

  return { docs: docsOf, stored: storedOf, done: doneOf, partialFor: partialOf, latest: latestOf, storeCheckpoint, storeResult };
}

export default { audienceStore };
