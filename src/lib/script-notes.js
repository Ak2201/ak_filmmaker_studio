/* ============================================================
   SCRIPT NOTES — every note on the whole script, as one list
   ------------------------------------------------------------
   A VIEW. It stores nothing and adds no key. Two things already
   exist and this only reads them:

     shared threads   `comments` rows with scope 'script' and
                      field_key 'script_<element id>', fetched by
                      src/ui/comments.js (loadThreads) — the cloud's.
     private notes    localStorage `fms_note_script_<element id>`,
                      this device only, always available.

   Each is joined to the script's own elements for the scene it
   sits in, so a renamed or renumbered scene is renamed here too.

   Pure: no DOM, no network, no storage beyond reading a note
   through the `readNote` seam the caller passes. That is what lets
   scripts/test-script-notes.mjs run it in Node.
   ============================================================ */
import { sceneNumbers } from './script.js';

export const KEY_PREFIX = 'script_';
export const NOTE_PREFIX = 'fms_note_';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const excerpt = (s, n = 90) => { const t = clean(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** open | resolved. Anything that is not open (resolved, accepted,
    rejected) has been dealt with, which is what the filter means. */
export const isOpen = (status) => status === 'open' || status == null || status === '';

/**
 * Build the rows.
 *   elements   the script's elements, in order
 *   numbering  the script's numbering (for locked scene numbers)
 *   comments   rows from listComments (or a Map field_key -> rows)
 *   readNote   (elementId) -> private note text ('' when none)
 * Rows are in script order, then lines that no longer exist.
 */
export function buildNotes({ elements = [], numbering = null, comments = [], readNote = null } = {}) {
  const rows = comments instanceof Map ? [].concat(...comments.values()) : (comments || []);
  const nums = sceneNumbers(elements, numbering).byId;

  const where = new Map();   // element id -> context
  let scene = null;
  elements.forEach((el, i) => {
    if (el.type === 'scene') scene = el;
    where.set(el.id, {
      index: i, el,
      sceneId: scene ? scene.id : null,
      scene: scene ? clean(scene.text) || 'Untitled scene' : 'Before the first scene',
      sceneNumber: scene ? (nums.get(scene.id) || '') : ''
    });
  });
  const place = (id) => where.get(id) || {
    index: Infinity, el: null, sceneId: null, scene: 'Deleted line', sceneNumber: ''
  };

  const out = [];
  const byField = new Map();
  rows.forEach((r) => {
    if (!r || typeof r.field_key !== 'string' || !r.field_key.startsWith(KEY_PREFIX)) return;
    if (!byField.has(r.field_key)) byField.set(r.field_key, []);
    byField.get(r.field_key).push(r);
  });

  for (const [key, list] of byField) {
    const elementId = key.slice(KEY_PREFIX.length);
    const ctx = place(elementId);
    const ids = new Set(list.map((r) => r.id));
    const roots = list.filter((r) => !r.parent_id || !ids.has(r.parent_id));
    roots.forEach((root) => {
      const replies = list.filter((r) => r.parent_id === root.id);
      const authors = [...new Set([root, ...replies].map((r) => clean(r.author_name)).filter(Boolean))];
      out.push({
        id: String(root.id), kind: 'shared', elementId,
        elementType: ctx.el ? ctx.el.type : '', line: ctx.el ? excerpt(ctx.el.text) : '',
        scene: ctx.scene, sceneId: ctx.sceneId, sceneNumber: ctx.sceneNumber,
        status: root.status || 'open', open: isOpen(root.status),
        author: clean(root.author_name) || 'Unknown', authors,
        created: root.created_at || '', body: String(root.body ?? ''),
        type: root.type || 'comment',
        replies: replies.map((r) => ({ author: clean(r.author_name) || 'Unknown', created: r.created_at || '', body: String(r.body ?? '') })),
        _at: ctx.index, _t: Date.parse(root.created_at || '') || 0
      });
    });
  }

  if (typeof readNote === 'function') {
    elements.forEach((el) => {
      const text = String(readNote(el.id) || '');
      if (!text.trim()) return;
      const ctx = place(el.id);
      out.push({
        id: 'note:' + el.id, kind: 'private', elementId: el.id,
        elementType: el.type, line: excerpt(el.text),
        scene: ctx.scene, sceneId: ctx.sceneId, sceneNumber: ctx.sceneNumber,
        status: 'open', open: true, author: 'You (private)', authors: ['You (private)'],
        created: '', body: text, type: 'note', replies: [], _at: ctx.index, _t: 0
      });
    });
  }

  out.sort((a, b) => (a._at - b._at) || (a.kind === b.kind ? a._t - b._t : a.kind === 'private' ? -1 : 1));
  out.forEach((r) => { delete r._at; delete r._t; });
  return out;
}

/**
 * Filter. state: 'all' | 'open' | 'resolved'; sceneId: '' for all
 * (or 'none' for the lines outside any scene); author: '' for all;
 * kind: '' | 'shared' | 'private'.
 */
export function filterNotes(rows, f = {}) {
  const { state = 'all', sceneId = '', author = '', kind = '' } = f;
  return rows.filter((r) =>
    (state === 'all' || (state === 'open') === r.open) &&
    (!kind || r.kind === kind) &&
    (!sceneId || (sceneId === 'none' ? !r.sceneId : r.sceneId === sceneId)) &&
    (!author || r.authors.includes(author)));
}

export const sceneLabel = (r) => (r.sceneNumber ? r.sceneNumber + '. ' : '') + r.scene;

/** The choices the filter menus offer, derived from the rows. */
export function facets(rows) {
  const scenes = [], seen = new Set();
  rows.forEach((r) => {
    const k = r.sceneId || 'none';
    if (seen.has(k)) return;
    seen.add(k);
    scenes.push({ id: k, label: sceneLabel(r) });
  });
  const authors = [...new Set([].concat(...rows.map((r) => r.authors)))].sort((a, b) => a.localeCompare(b));
  return { scenes, authors };
}

export const counts = (rows) => ({
  total: rows.length, open: rows.filter((r) => r.open).length, resolved: rows.filter((r) => !r.open).length
});

/** Group in script order: [{ key, sceneId, label, rows }]. */
export function groupByScene(rows) {
  const g = [];
  rows.forEach((r) => {
    const k = r.sceneId || (r.scene === 'Deleted line' ? 'deleted' : 'none');
    let grp = g.find((x) => x.key === k);
    if (!grp) g.push(grp = { key: k, sceneId: r.sceneId, label: sceneLabel(r), rows: [] });
    grp.rows.push(r);
  });
  return g;
}

/* ---- exports ------------------------------------------------- */
const stateWord = (r) => (r.kind === 'private' ? 'Private' : r.open ? 'Open' : 'Resolved');
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

export function toText(rows, title = 'Script') {
  const c = counts(rows);
  const lines = [title + ' — notes', c.total + (c.total === 1 ? ' note' : ' notes') + ' (' + c.open + ' open, ' + c.resolved + ' resolved)', ''];
  groupByScene(rows).forEach((g) => {
    lines.push(g.label.toUpperCase(), '');
    g.rows.forEach((r) => {
      lines.push('  [' + stateWord(r) + '] ' + r.author + (r.created ? ', ' + day(r.created) : ''));
      if (r.line) lines.push('  On: ' + r.line);
      r.body.split(/\r?\n/).forEach((l) => lines.push('  ' + l));
      r.replies.forEach((p) => lines.push('    ↳ ' + p.author + (p.created ? ', ' + day(p.created) : '') + ': ' + clean(p.body)));
      lines.push('');
    });
  });
  return lines.join('\n').replace(/\n+$/, '\n');
}

export const CSV_HEADER = ['Scene', 'Scene heading', 'Line type', 'Line', 'Kind', 'Status', 'Author', 'Date', 'Note', 'Replies'];
const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
export function toCSV(rows) {
  const data = rows.map((r) => [
    r.sceneNumber, r.scene, r.elementType, r.line, r.kind === 'private' ? 'Private' : 'Shared',
    stateWord(r), r.author, day(r.created), r.body,
    r.replies.map((p) => p.author + ': ' + clean(p.body)).join(' | ')
  ]);
  return [CSV_HEADER, ...data].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export default { buildNotes, filterNotes, facets, groupByScene, counts, toText, toCSV, CSV_HEADER, sceneLabel, isOpen };
