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
import { makeRevision, revisionColour } from './script.js';

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

/** True when the two copies differ ONLY in `numbering` (elements, draft ids
    and title page all equal): a change-report mark made on another device,
    which the writer adopts quietly rather than filing as a side copy. */
export function numberingOnly(base, fresh) {
  if (!base || !fresh) return false;
  const parts = (d) => JSON.stringify([
    (d.elements || []).map((e) => [e.id, e.type, e.text, e.dual === true]),
    (d.revisions || []).map((r) => r.id),
    d.titlePage || null
  ]);
  return parts(base) === parts(fresh)
    && JSON.stringify(base.numbering || null) !== JSON.stringify(fresh.numbering || null);
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

const COALESCE_MS = 10 * 60 * 1000;

/* THE CAP ON AUTOMATIC DRAFTS. Every arrival more than ten minutes after
   the last one adds a whole-script draft, nothing else ever trims
   `revisions`, and the blob is pushed whole on every save — so two
   writers sharing a long script grew it by a full copy per conflict
   window, for good. Only the drafts THIS module names are capped, and
   they are recognised by the name the page gives them (ARRIVAL_PREFIX,
   which screenplay.js reads from here so the two cannot drift). A draft
   the writer named, or renamed on drafts.html, never matches and is
   never touched; "Your version" drafts are the writer's own lines and
   are left alone too. The newest ARRIVAL_KEEP stay. */
export const ARRIVAL_PREFIX = 'From another device, ';
/** The same, for a copy saved by another WINDOW of this browser: calling
    that "another device" named a device that does not exist (QA r2).
    NEUTRAL on purpose: both windows read this one draft, and for the
    window whose own lines it holds, "from another window" was false
    (QA r3). The old name is still recognised for drafts already kept. */
export const ARRIVAL_WINDOW_PREFIX = 'Kept when two windows saved, ';
const OLD_WINDOW_PREFIX = 'From another window, ';
/** The name "Use theirs" gives the writer's own copy as it steps aside. */
export const YOURS_PREFIX = 'Your version, ';
const ARRIVAL_KEEP = 10;
const isArrival = (r) => {
  const n = String((r && r.name) || '');
  return n.startsWith(ARRIVAL_PREFIX) || n.startsWith(ARRIVAL_WINDOW_PREFIX) || n.startsWith(OLD_WINDOW_PREFIX);
};
/** A copy this module kept by itself (an arrival, or "Your version") and
    the writer never numbered: a SIDE copy, not a draft. It is listed on
    drafts.html, but it is never the "current" draft, the one "changed
    since the last draft" is measured against or the one Update
    overwrites (QA: an arrival became Current, and Update replaced the
    only copy of the other device's lines). */
export const isSideCopy = (r) => !!r && !(Number.isFinite(r.number) && r.number > 0)
  && (isArrival(r) || String(r.name || '').startsWith(YOURS_PREFIX));

/** The issue colour of revision i: its place among the ISSUED drafts
    (side copies skipped), or null for a side copy, which is no issue.
    Counting the whole list made the writer's Draft 2 Pink and handed
    Blue to "From another device, 10:42" (QA r4). Derived, never stored. */
export function issuedColour(revs, i) {
  const list = Array.isArray(revs) ? revs : [];
  if (!list[i] || isSideCopy(list[i])) return null;
  let n = 0;
  for (let k = 0; k < i; k++) if (!isSideCopy(list[k])) n++;
  return revisionColour(n);
}

/** How many issued drafts the list holds (side copies not counted). */
export const issuedCount = (revs) => (Array.isArray(revs) ? revs : []).filter((r) => !isSideCopy(r)).length;

/** "Blue — Draft 2", or a side copy's own name with no colour. */
export function revisionLabel(revs, i) {
  const r = (revs || [])[i];
  if (!r) return '';
  const c = issuedColour(revs, i);
  return c ? c.name + ' — ' + r.name : r.name;
}

function capArrivals(revs) {
  const arrivals = revs.filter(isArrival);
  if (arrivals.length <= ARRIVAL_KEEP) return revs;
  // Newest by date; the list is not always in date order (keepBoth appends).
  const keep = new Set(arrivals
    .slice().sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))
    .slice(0, ARRIVAL_KEEP));
  return revs.filter((r) => !isArrival(r) || keep.has(r));
}

/** The writer's copy, with the arrival kept as a draft named `label`, and
    every draft either side had. Returns a NEW doc.
    `replaceId`: the draft this page made from the LAST arrival. If it is
    under ten minutes old it is overwritten in place (same id, so the
    other side's copy of it unions back to one) instead of a new draft
    being added — two people typing at once would otherwise add a
    whole-script draft on both sides with every save. */
export function keepBoth(mine, fresh, label, { replaceId = null, now = Date.now() } = {}) {
  const draft = makeRevision((fresh && fresh.elements) || [], label);
  const revs = unionRevisions(mine.revisions, fresh && fresh.revisions);
  const i = replaceId ? revs.findIndex((r) => r.id === replaceId) : -1;
  if (i >= 0 && now - (Date.parse(revs[i].date) || 0) < COALESCE_MS) {
    revs[i] = { ...draft, id: replaceId };
    return { ...mine, revisions: capArrivals(unionRevisions(revs)) };
  }
  return { ...mine, revisions: capArrivals(revs.concat(draft)) };
}

/** The arrival on screen, with the writer's copy kept as a draft named
    `label` — what "Use theirs" does after keepBoth. Returns a NEW doc. */
export function takeTheirs(mine, fresh, label) {
  const draft = makeRevision((mine && mine.elements) || [], label);
  return {
    ...fresh,
    revisions: capArrivals(unionRevisions(mine && mine.revisions, fresh.revisions).concat(draft))
  };
}

/** The side copy in `fresh` that holds exactly the lines this page
    saved (`savedEls`, [type, text] pairs), when `fresh` itself does not:
    the other side was mid-edit, kept its own copy and filed this page's
    as a draft. Null when this page's lines are on `fresh`'s page, or
    were not filed. */
export function displacedCopy(fresh, savedEls) {
  if (!fresh || !Array.isArray(savedEls)) return null;
  const key = (els) => JSON.stringify((els || []).map((e) => Array.isArray(e) ? e : [e.type, String(e.text ?? '')]));
  const mine = key(savedEls);
  if (key(fresh.elements) === mine) return null;
  const revs = (fresh.revisions || []).filter(isSideCopy);
  for (let i = revs.length - 1; i >= 0; i--) if (key(revs[i].elements) === mine) return revs[i];
  return null;
}

/* TWO WINDOWS SAVED AT ONCE (prove:script 21c, intermittent). Both
   debounces fired within a millisecond or two of each other, so neither
   page was mid-save when the other's copy arrived — and each copy was
   written WITHOUT the other's in it. The window whose write landed last
   in storage saw nothing (its storage still read as its own copy); the
   other found nothing unsaved, loaded that copy, and its writer's lines
   left the screen AND storage, with no draft and no toast. "Nothing
   unsaved here" is not enough to load: the arrival must also CARRY what
   this page saved.

     crossedSave(base, saved, fresh)
       true when a line this page changed since `base` (the copy it last
       loaded or received) — edited, added or cut, by element id — is not
       on `fresh` the way this page saved it: the other window wrote
       without having seen this page's save.
     settleCrossed(mine, fresh, label)
       one copy on screen and the other kept whole as a side copy. The
       SAME answer in both windows, whichever of them notices: the copy
       with the larger signature stays on the page, and the side copy's
       id is derived from its lines, so two windows that both settle file
       one draft, not two, and their saves then read as the same copy. */
const lineSig = (els) => JSON.stringify((els || []).map((e) => [e.id, e.type, String(e.text ?? '')]));
export function crossedSave(base, saved, fresh) {
  if (!Array.isArray(saved) || !fresh) return false;
  const was = new Map(((base && base.elements) || []).map((e) => [e.id, e]));
  const now = new Map((fresh.elements || []).map((e) => [e.id, e]));
  const same = (a, b) => !!a && !!b && a.type === b.type && String(a.text ?? '') === String(b.text ?? '');
  const ids = new Set();
  for (const e of saved) {
    ids.add(e.id);
    if (same(was.get(e.id), e)) continue;          // a line this page did not touch
    if (!same(now.get(e.id), e)) return true;      // edited or added here, not on the arrival
  }
  for (const [id, e] of was) {
    if (ids.has(id)) continue;                     // cut here…
    if (same(now.get(id), e)) return true;         // …and still on the arrival as it was
  }
  return false;
}
function hashOf(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
export function settleCrossed(mine, fresh, label) {
  const a = lineSig(mine && mine.elements), b = lineSig(fresh && fresh.elements);
  const mineWon = a >= b;
  const [won, lost] = mineWon ? [mine, fresh] : [fresh, mine];
  const draft = { ...makeRevision((lost && lost.elements) || [], label), id: 'w-x' + hashOf(mineWon ? b : a) };
  const revs = unionRevisions(mine && mine.revisions, fresh && fresh.revisions).filter((r) => r.id !== draft.id);
  return { doc: { ...won, revisions: capArrivals(revs.concat(draft)) }, mineWon, draft };
}

export default { numberingOnly, scriptSignature, incomingAction, displacedCopy, crossedSave, settleCrossed, unionRevisions, keepBoth, takeTheirs, isSideCopy, issuedColour, issuedCount, revisionLabel, ARRIVAL_PREFIX, ARRIVAL_WINDOW_PREFIX, YOURS_PREFIX };
