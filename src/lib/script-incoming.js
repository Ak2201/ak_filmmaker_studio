/* ============================================================
   A NEWER SCRIPT ARRIVED — what the open Screenplay Writer does
   ------------------------------------------------------------
   cloud.js writes a pulled or live copy of the script straight into
   storage. The page holds its own copy in memory (`doc`), so until this
   existed the next keystroke saved that older copy over the one just
   synced, with a newer clock, and the other device's work was gone from
   the cloud. Pure: the page asks, this answers, nothing is stored here.

     incomingAction({ mine, fresh, dirty })
       'same'      nothing to do — the stored copy is what is on screen
       'load'      show the stored copy: nothing here is unsaved
       'keepBoth'  the writer is mid-edit: keep what is on screen, and
                   keep the arrival too, as a draft (keepBoth below)

   NOTHING IS DROPPED IN EITHER BRANCH. A copy that loses becomes a
   draft (a `revisions` entry, the existing Drafts mechanism — no new
   key), so the writer can open it on drafts.html and take lines back.
   ============================================================ */
import { makeRevision } from './script.js';

/** What the script holds that the writer would miss, as one string. */
export function scriptSignature(doc) {
  const d = doc || {};
  return JSON.stringify([
    (d.elements || []).map((e) => [e.id, e.type, e.text, e.dual === true]),
    (d.revisions || []).map((r) => r.id),
    d.titlePage || null,
    d.numbering || null
  ]);
}

/** A script that is only the one blank line the page adds in memory. */
const isBlank = (doc) => {
  const els = (doc && doc.elements) || [];
  return !els.length || (els.length === 1 && !String(els[0].text || '').trim());
};

export function incomingAction({ mine, fresh, dirty }) {
  if (!fresh) return 'same';
  if (scriptSignature(mine) === scriptSignature(fresh)) return 'same';
  if (!dirty || isBlank(mine)) return 'load';
  return 'keepBoth';
}

/** Drafts on either side, once each, in date order. */
export function unionRevisions(a = [], b = []) {
  const seen = new Set();
  const out = [];
  for (const r of [...a, ...b]) {
    if (!r || !r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')));
}

/** The writer's copy, with the arrival kept as a draft named `label`, and
    every draft either side had. Returns a NEW doc. */
export function keepBoth(mine, fresh, label) {
  const draft = makeRevision((fresh && fresh.elements) || [], label);
  return {
    ...mine,
    revisions: unionRevisions(mine.revisions, fresh && fresh.revisions).concat(draft)
  };
}

/** The arrival on screen, with the writer's copy kept as a draft named
    `label` — what "Use theirs" does after keepBoth. Returns a NEW doc. */
export function takeTheirs(mine, fresh, label) {
  const draft = makeRevision((mine && mine.elements) || [], label);
  return {
    ...fresh,
    revisions: unionRevisions(mine && mine.revisions, fresh.revisions).concat(draft)
  };
}

export default { scriptSignature, incomingAction, unionRevisions, keepBoth, takeTheirs };
