/* ============================================================
   COVERAGE STORE — where a script-coverage report is kept
   ------------------------------------------------------------
   Logic, moved out of src/ui/coverage.js so the AI Desk's coverage
   task (src/lib/ai-tasks.js) can store a report without importing the
   view. ONE copy of "where a coverage lives" and of how it reads as
   prose in the Documents tab and in a backup. Stores nothing itself:
   it writes into the script doc it is handed and calls that doc's save.
   ============================================================ */
import { newId } from './record-id.js';

export const fmtN = (n) => Number(n || 0).toLocaleString('en-IN');
export const plural = (n, one, many) => fmtN(n) + ' ' + (n === 1 ? one : many);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function stamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', '
    + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export const VERDICT_WORD = { pass: 'Pass', consider: 'Consider', recommend: 'Recommend' };
export const SECTION_LABEL = {
  premise: 'Premise', structure: 'Structure', character: 'Character',
  dialogue: 'Dialogue', pacing: 'Pacing', marketability: 'Marketability — Tamil theatrical & OTT'
};

/** The report as plain prose, for the document body: readable in the
    Documents tab and in a backup, with every quote it kept. */
function reportText(res, meta) {
  const r = res.report;
  const L = [];
  L.push('SCRIPT COVERAGE — ' + (VERDICT_WORD[r.verdict] || '—').toUpperCase());
  L.push('Read ' + stamp(meta.at) + (meta.revision ? ' · draft after revision ' + meta.revision : '')
    + ' · ' + plural(res.scenes, 'scene', 'scenes') + ' · by ' + res.model + '. Written by a model, not by a person.');
  if (res.removed || res.readRemoved) L.push(quotesRemovedSentence(res));
  L.push('');
  if (r.logline) L.push('LOGLINE AS READ', r.logline, '');
  const pts = (list) => (list || []).forEach((p) => {
    L.push('  · ' + (p.label ? p.label + ' — ' : '') + (p.scene ? 'Sc ' + p.scene + ': ' : '')
      + (p.quote ? '“' + p.quote + '” — ' : '') + p.note);
  });
  for (const id of ['premise', 'structure', 'character', 'dialogue', 'pacing', 'marketability']) {
    const s = r[id];
    if (!s) continue;
    L.push(SECTION_LABEL[id].toUpperCase());
    if (id === 'character') {
      if (s.protagonist) L.push('Protagonist: ' + s.protagonist);
      if (s.want) L.push('Wants: ' + s.want);
      if (s.need) L.push('Needs: ' + s.need);
    }
    if (s.assessment) L.push(s.assessment);
    if (id === 'structure' && s.actBreaks && s.actBreaks.length) { L.push('Act breaks:'); pts(s.actBreaks); }
    pts(s.points);
    L.push('');
  }
  L.push('VERDICT: ' + (VERDICT_WORD[r.verdict] || '—'));
  if (r.verdictWhy) L.push(r.verdictWhy);
  return L.join('\n');
}

export function quotesRemovedSentence(res) {
  const out = [];
  if (res.removed) {
    out.push(plural(res.removed, 'quote', 'quotes') + ' removed because '
      + (res.removed === 1 ? 'it was' : 'they were') + ' not in your script.');
  }
  if (res.readRemoved) {
    out.push((res.removed ? fmtN(res.readRemoved) + ' more' : plural(res.readRemoved, 'quote', 'quotes'))
      + ' dropped while the scenes were read, for the same reason.');
  }
  return out.join(' ');
}

const newDocId = () => newId('w');

/* ---- the stored reports -------------------------------------
   A stored coverage is a document with a `coverage` object:
     { v:1, status:'partial'|'done', sig, at, model, revision,
       checkpoint?  (partial)   { sig, batchCount, parts },
       result?      (done)      what runCoverage() resolved to }  */
/* The storage half, bound to a script doc and its save path. Exported
   (coverageStore) so the AI Desk's coverage task — which runs on
   script.html too, where this tab is not mounted — stores a report in
   exactly the shape and place this tab reads, through the page's own
   save. ONE copy of "where a coverage lives". */
export function coverageStore(getDocFn, saveFn) {
  const docsOf = () => {
    const d = getDocFn();
    return d && Array.isArray(d.documents) ? d.documents : [];
  };
  const storedOf = () => docsOf().filter((d) => d && d.coverage && typeof d.coverage === 'object');
  const doneOf = () => storedOf().filter((d) => d.coverage.status === 'done' && d.coverage.result);
  const partialOf = (sig) => storedOf().find((d) => d.coverage.status === 'partial'
    && d.coverage.checkpoint && d.coverage.checkpoint.sig === sig);
  const revision = () => {
    const d = getDocFn();
    const revs = d && Array.isArray(d.revisions) ? d.revisions : [];
    return revs.length ? revs[revs.length - 1].name : '';
  };

  /** Store the partial run, so Stop or a closed tab never bills twice. */
  function storeCheckpoint(cp) {
    const d = getDocFn();
    if (!d || !Array.isArray(d.documents)) return;
    let doc = partialOf(cp.sig);
    const now = new Date().toISOString();
    const body = 'Coverage in progress: ' + cp.parts.length + ' of ' + cp.batchCount
      + ' parts of the script read. Resume it from the Coverage tab — the parts already read are not sent again.';
    if (!doc) {
      doc = { id: newDocId(), title: 'Coverage (in progress)', kind: 'Notes', body, updated: now,
        coverage: { v: 1, status: 'partial', sig: cp.sig, at: now, model: cp.model, revision: revision(), checkpoint: cp } };
      d.documents.push(doc);
    } else {
      doc.body = body;
      doc.updated = now;
      doc.coverage = { ...doc.coverage, model: cp.model, checkpoint: cp };
    }
    saveFn();
  }

  function storeResult(res) {
    const d = getDocFn();
    if (!d || !Array.isArray(d.documents)) return null;
    const now = new Date().toISOString();
    const meta = { at: now, revision: revision() };
    let doc = partialOf(res.sig);
    if (!doc) { doc = { id: newDocId(), kind: 'Notes' }; d.documents.push(doc); }
    doc.title = 'Coverage — ' + (VERDICT_WORD[res.report.verdict] || 'report') + ' — ' + stamp(now).split(',')[0];
    doc.kind = 'Notes';
    doc.body = reportText(res, meta);
    doc.updated = now;
    doc.coverage = { v: 1, status: 'done', sig: res.sig, at: now, model: res.model, revision: meta.revision, result: res };
    saveFn();
    return doc;
  }

  return { docs: docsOf, stored: storedOf, done: doneOf, partialFor: partialOf, revisionLabel: revision, storeCheckpoint, storeResult };
}

