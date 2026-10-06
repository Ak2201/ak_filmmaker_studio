/* ============================================================
   HAND-OFFS — a blueprint answer moved into the tool that uses it
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, revision 3 §5 (rev. 2 §5.5). Three,
   on the feature blueprint, each where the answer is written:

     step 02  "Use as the Story logline"  → fms_story_v1.logline,
              offered ONLY while the Story page's logline is empty
     step 11  "Send these scenes to the Breakdown" → new scene rows,
              only for rows whose heading is not already a scene
     step 15  "Add to the Lookbook" → entries on a board named for
              the step, only entries that board does not already hold

   THE RULES, all three: an explicit click; ADD ONLY — nothing that
   exists is changed or overwritten; and UNDO, in a toast that stays
   until it is used or dismissed (an actionable toast must not time
   out — the trap in CLAUDE.md). Undo takes back exactly what the
   click made and nothing else.

   THE BLUEPRINT IS READ FROM THE PAGE, not the blob: the fields on
   screen may be ahead of the debounced save, and these buttons sit
   beside them. The models are written through their own APIs
   (src/lib/scenes.js, src/lib/shots.js, src/lib/story.js) — no copy
   of a scene, an entry or a story lives here.

   UNDOING SCENES. A scene this click made has nothing hung on it, so
   undo removes the row outright (the bin is for rows with dependents;
   a row nobody has touched in it is noise). If shots, a call sheet or
   an edit-log note arrived on one in the meantime, THAT scene goes
   through the bin instead (src/lib/scene-bin.js), where it can be
   restored with everything hung on it.
   ============================================================ */
import StudioUI from './chrome.js';
import '../styles/blueprint-handoffs.css';
import { h, delegate } from '../lib/dom.js';
import { listScenes, addScene, rawScenes, writeRawScenes } from '../lib/scenes.js';
import { binScene } from '../lib/scene-bin.js';
import { headingFields } from '../lib/scene-sync.js';
import Shots from '../lib/shots.js';
import { listCallSheets } from '../lib/contacts.js';
import { loadEdit } from '../lib/editlog.js';
import { loadStory, saveStory } from '../lib/story.js';

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const val = (key) => {
  const el = document.querySelector(`[data-key="${key}"]`);
  return el && typeof el.value === 'string' ? el.value.trim() : '';
};
const toast = (msg, o) => (StudioUI && StudioUI.toast ? StudioUI.toast(msg, o) : null);

/* ---- step 02: the logline ------------------------------------ */

function loglineAnswer() {
  return val('s2_log_final') || val('s2_log2') || val('s2_log1');
}

function loglineState() {
  const text = loglineAnswer();
  const story = loadStory();
  const has = !!String(story.logline || '').trim();
  return { text, has, story };
}

function drawLogline(slot) {
  const { text, has } = loglineState();
  if (has) {
    slot.replaceChildren(h('p.bph-note', { text: 'The Story page already has a logline, so this one stays here.' }),
      h('a.btn.bph-link', { href: 'story.html', text: 'Open the Story page →' }));
    return;
  }
  slot.replaceChildren(
    h('button.btn.bph-go', { type: 'button', 'data-bph': 'logline', disabled: !text, text: 'Use as the Story logline' }),
    h('p.bph-note', {
      text: text
        ? 'Copies your ' + (val('s2_log_final') ? 'final' : 'latest') + ' logline into the Story page, which has none yet.'
        : 'Write a logline above first.'
    })
  );
}

let loglineUndo = null;
function useLogline() {
  const { text, has, story } = loglineState();
  if (has) { toast('The Story page already has a logline, so nothing was copied.'); refreshHandoffs(); return; }
  if (!text) { toast('Write a logline first.', { type: 'error' }); return; }
  story.logline = text;
  saveStory(story);
  loglineUndo = text;
  refreshHandoffs();
  toast('Your logline is on the Story page.', {
    action: 'UNDO',
    onAction: () => {
      const s = loadStory();
      if (loglineUndo == null) return;
      if (s.logline !== loglineUndo) { toast('The Story page’s logline has changed since, so it was left alone.'); loglineUndo = null; return; }
      s.logline = '';
      saveStory(s);
      loglineUndo = null;
      refreshHandoffs();
      toast('Undone. The Story page has no logline again.');
    }
  });
}

/* ---- step 11: the scene list --------------------------------- */

const sceneKey = (f) => norm(f.intExt || 'INT') + '|' + norm(f.location) + '|' + norm(f.dayNight || 'DAY');

function blueprintScenes() {
  return [...document.querySelectorAll('#sceneListBody tr')].map((tr) => {
    const get = (suffix) => {
      const el = tr.querySelector(`[data-key$="_${suffix}"]`);
      return el && typeof el.value === 'string' ? el.value.trim() : '';
    };
    return { slug: get('slug'), pov: get('pov'), want: get('want'), conf: get('conf') };
  }).filter((r) => r.slug);
}

function rowToScene(r) {
  const f = headingFields(r.slug);
  const patch = {
    intExt: f.intExt || 'INT',
    dayNight: f.dayNight || 'DAY',
    location: f.location || r.slug,
    synopsis: [r.want && 'Wants: ' + r.want, r.conf && 'Against: ' + r.conf].filter(Boolean).join(' ')
  };
  if (r.pov) patch.elements = { cast: [r.pov] };
  return patch;
}

function sceneState() {
  const have = new Set(listScenes().map((s) => sceneKey(s)));
  const rows = blueprintScenes();
  const seen = new Set();
  const fresh = [];
  for (const r of rows) {
    const p = rowToScene(r);
    const k = sceneKey(p);
    if (have.has(k) || seen.has(k)) continue;
    seen.add(k);
    fresh.push(p);
  }
  return { rows: rows.length, fresh };
}

function drawScenes(slot) {
  const { rows, fresh } = sceneState();
  slot.replaceChildren(
    h('button.btn.bph-go', {
      type: 'button', 'data-bph': 'scenes', disabled: !fresh.length,
      text: fresh.length ? 'Send ' + plural(fresh.length, 'scene') + ' to the Breakdown' : 'Send these scenes to the Breakdown'
    }),
    h('p.bph-note', {
      text: !rows ? 'Write a scene heading in the table first.'
        : !fresh.length ? 'Every heading here is already a scene in the Breakdown.'
          : 'Adds a Breakdown scene for each heading that is not one yet' + (rows - fresh.length ? ' (' + plural(rows - fresh.length, 'row') + ' already there)' : '') + '. Nothing already in the Breakdown is changed.'
    })
  );
}

let scenesUndo = null;
function sendScenes() {
  const { fresh } = sceneState();
  if (!fresh.length) { refreshHandoffs(); return; }
  const ids = fresh.map((p) => addScene(p).id);
  scenesUndo = ids;
  refreshHandoffs();
  toast(plural(ids.length, 'scene') + ' added to the Breakdown.', {
    action: 'UNDO',
    onAction: () => undoScenes(ids)
  });
}

function undoScenes(ids) {
  if (scenesUndo !== ids) return;
  scenesUndo = null;
  const shot = new Set(Shots.listShots().map((s) => s.sceneId));
  const sheets = new Set(listCallSheets().flatMap((c) => (Array.isArray(c.sceneIds) ? c.sceneIds : [])));
  const edit = loadEdit().scenes;
  const hung = (id) => shot.has(id) || sheets.has(id) || !!edit[id];
  const direct = new Set(ids.filter((id) => !hung(id)));
  const binned = ids.filter((id) => !direct.has(id));
  if (direct.size) writeRawScenes(rawScenes().filter((s) => !(s && direct.has(s.id))));
  binned.forEach((id) => binScene(id, { reason: 'hand' }));
  refreshHandoffs();
  toast(binned.length
    ? 'Undone. ' + plural(binned.length, 'scene') + ' had work hung on it since, so ' + (binned.length === 1 ? 'it is' : 'they are') + ' in the Breakdown’s bin.'
    : 'Undone. Those scenes are gone from the Breakdown.');
}

/* ---- step 15: the lookbook ----------------------------------- */

export const LOOKBOOK_BOARD = 'Blueprint · Step 15 Lookbook';
const URL_RE = /https?:\/\/\S+/;

function linesOf(text) {
  return String(text || '').split(/\n+/).map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);
}

function entryFor(line, label) {
  const m = line.match(URL_RE);
  const ref = m ? m[0] : '';
  const words = (m ? line.replace(m[0], '') : line).replace(/\s+/g, ' ').trim().replace(/[—–:-]\s*$/, '').trim();
  if (words && words.length <= 80) return { title: words, ref, why: label + ', from blueprint step 15' };
  return { title: label, ref, why: words };
}

function lookbookEntries() {
  const out = [];
  for (const [key, label] of [['v2s3_light', 'Lighting reference'], ['v2s3_frames', 'Frame composition reference']]) {
    for (const line of linesOf(val(key))) out.push(entryFor(line, label));
  }
  for (let i = 1; i <= 3; i++) {
    const name = val(`palette_c${i}_name`);
    const hex = val(`palette_c${i}`) || val(`palette_c${i}_hex`);
    if (name) out.push({ title: 'Colour ' + i + ' · ' + name, ref: hex, why: 'Palette colour, from blueprint step 15' });
  }
  const texture = val('v2s3_texture');
  if (texture) out.push({ title: 'Texture & mood', ref: '', why: texture });
  const where = val('v2s3_location');
  if (where) out.push({ title: 'Where the lookbook lives', ref: where, why: 'From blueprint step 15' });
  return out;
}

const entryKey = (e) => norm(e.title) + '|' + norm(e.ref) + '|' + norm(e.why);

function lookbookState() {
  const board = Shots.listBoards().find((b) => b.name === LOOKBOOK_BOARD) || null;
  const have = new Set((board ? board.entries : []).map(entryKey));
  const seen = new Set();
  const fresh = lookbookEntries().filter((e) => {
    const k = entryKey(e);
    if (have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { board, fresh };
}

function drawLookbook(slot) {
  const { board, fresh } = lookbookState();
  slot.replaceChildren(
    h('button.btn.bph-go', {
      type: 'button', 'data-bph': 'lookbook', disabled: !fresh.length,
      text: fresh.length ? 'Add ' + plural(fresh.length, 'reference') + ' to the Lookbook' : 'Add to the Lookbook'
    }),
    h('p.bph-note', {
      text: fresh.length
        ? 'On a board called “' + LOOKBOOK_BOARD + '”' + (board ? '' : ', made for them') + ': your lighting and frame references (one per line), the palette’s named colours, the texture and where the lookbook lives.'
        : board ? 'Everything here is already on the “' + LOOKBOOK_BOARD + '” board.'
          : 'Write a lighting or frame reference, or name a palette colour, first.'
    }),
    board ? h('a.btn.bph-link', { href: 'visualize.html#lookbook', text: 'Open the Lookbook →' }) : null
  );
}

let lookbookUndo = null;
function addLookbook() {
  const { board, fresh } = lookbookState();
  if (!fresh.length) { refreshHandoffs(); return; }
  const made = board ? null : Shots.addBoard({ name: LOOKBOOK_BOARD, note: 'From the Feature Blueprint, step 15 — The Lookbook.' });
  const target = board || made;
  const ids = fresh.map((e) => Shots.addEntry(target.id, e)).filter(Boolean).map((e) => e.id);
  const run = { boardId: target.id, made: !!made, ids };
  lookbookUndo = run;
  refreshHandoffs();
  toast(plural(ids.length, 'reference') + ' added to the Lookbook.', {
    action: 'UNDO',
    onAction: () => {
      if (lookbookUndo !== run) return;
      lookbookUndo = null;
      for (const id of run.ids) Shots.removeEntry(run.boardId, id);
      const b = Shots.listBoards().find((x) => x.id === run.boardId);
      if (run.made && b && !b.entries.length) Shots.removeBoard(run.boardId);
      refreshHandoffs();
      toast('Undone. Those references are off the Lookbook.');
    }
  });
}

/* ---- mounting ------------------------------------------------ */

const HANDOFFS = [
  { step: 'step-02', kind: 'logline', draw: drawLogline, run: useLogline, label: 'Hand-off · Story page' },
  { step: 'step-11', kind: 'scenes', draw: drawScenes, run: sendScenes, label: 'Hand-off · Breakdown' },
  { step: 'step-15', kind: 'lookbook', draw: drawLookbook, run: addLookbook, label: 'Hand-off · Lookbook' }
];

/** Redraw every hand-off on the page. Reads only. */
export function refreshHandoffs() {
  for (const hf of HANDOFFS) {
    const slot = document.querySelector(`[data-bph-slot="${hf.kind}"]`);
    if (!slot) continue;
    try { hf.draw(slot); } catch (e) { console.warn('[handoffs]', hf.kind, e); }
  }
}

let bound = false;
/** Put the hand-offs into the rendered feature blueprint, before each
 *  step's checklist. Idempotent. */
export function mountHandoffs(root = document) {
  for (const hf of HANDOFFS) {
    const step = root.querySelector('#' + hf.step);
    if (!step || step.querySelector(`[data-bph-slot="${hf.kind}"]`)) continue;
    const card = h('div.bph-card', { 'data-bph-card': hf.kind }, [
      h('p.bph-eyebrow', { text: hf.label.toUpperCase() }),
      h('div.bph-slot', { 'data-bph-slot': hf.kind })
    ]);
    const check = step.querySelector(':scope > .step-check');
    if (check) check.before(card); else step.append(card);
  }
  if (!bound) {
    bound = true;
    delegate(document, 'click', '[data-bph]', (e, el) => {
      const hf = HANDOFFS.find((x) => x.kind === el.getAttribute('data-bph'));
      if (hf) hf.run();
    });
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(refreshHandoffs, 250); };
    document.addEventListener('input', (e) => {
      if (e.target.closest && e.target.closest('#step-02, #step-11, #step-15')) later();
    });
    document.addEventListener('change', (e) => {
      if (e.target.closest && e.target.closest('#step-02, #step-11, #step-15')) later();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshHandoffs(); });
  }
  refreshHandoffs();
}

export default { mountHandoffs, refreshHandoffs, LOOKBOOK_BOARD };
