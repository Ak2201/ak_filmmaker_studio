/* ============================================================
   WRITE KEYS — the screenplay editor's keyboard, as data and pure
   functions
   ------------------------------------------------------------
   Phase 2 of docs/SCREENPLAY-WRITER-PLAN.md. Everything here is a
   function of its arguments: which preset, which element type, is it
   empty, which keys. No DOM and no storage at import time, so
   `npm run test:keys` runs it in Node. The page (src/pages/write.js)
   asks resolveKey() what a keystroke means and does it; the words
   live in src/data/write-presets.json (CLAUDE.md rule 2).

   ELEMENT TYPES ARE STRINGS, AND THE KNOWN SET IS PASSED IN. The page
   passes the ids src/lib/script.js's ELEMENT_TYPES carries today.
   `shot` arrives with the page view (Phase 1); until it does, every
   mapping to it is SKIPPED rather than invented — Alt+7 does nothing
   instead of writing an element type the model, the exports and the
   page count cannot read. `general` (Celtx's 8) is an ALIAS of
   action, because a screenplay has no "general" element and Celtx's
   General is printed as action.

   WHICH MODIFIER, MEASURED RATHER THAN ASSUMED (6 Oct 2026).
   The plan said Chrome reserves Ctrl+1–8 and a page cannot take them.
   That was checked with REAL X11 key events (XTest under Xvfb, into a
   headful Chromium 1194 with two real tabs — CDP input would have
   proved nothing, because it bypasses the browser's accelerators):

     • Ctrl+T never reached the page: a genuinely reserved shortcut.
     • Ctrl+1..8 and Alt+1..8 DO reach the page first. With no
       preventDefault the tab switched; WITH preventDefault the tab
       stayed and the next keystroke landed in the page. So on
       Chromium/Linux a normal tab can catch both.
     • Super(Meta)+2, Ctrl+Shift+S, Ctrl+Shift+K and Ctrl+D also
       reached the page.
     • NOT measured: macOS Chrome's Cmd+1..8 and Safari (no Mac here),
       and Firefox. They are emulated at the event level only.

   So Alt/Option+digit is the binding EVERYWHERE, matched on
   `e.code` ('Digit1'…) because Option rewrites `e.key` on a Mac
   (Option+1 is '¡'). Ctrl/Cmd+digit is honoured too, but only where
   taking it costs nothing — an installed app window or the extension
   side panel, which have no tab strip — or when the writer has
   switched it on for a browser tab, because there it takes tab
   switching away while the caret is in a screenplay line.
   `ctrlDigits` is that decision, made by the page.

   Ctrl/Cmd+D is NOT dual dialogue here: src/ui/chrome.js binds it,
   on every page, to cycling the theme. Alt+D is.
   ============================================================ */
import DATA from '../data/write-presets.json';

export const WRITE_PREFS_KEY = 'fms_write_prefs_v1';
export const PRESETS = DATA.presets;
export const DEFAULT_PRESET = DATA.defaultPreset;
export const SMARTTYPE = DATA.smarttype;
export const DEFAULT_RETURN = DATA.returnNext;
export const TYPE_NAMES = DATA.typeNames;

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS.find((p) => p.id === DEFAULT_PRESET);
}

/** A preset's type id, as this build can write it: aliased, and null
    when the model does not know the type yet. */
export function resolveType(id, known) {
  const real = DATA.aliases[id] || id;
  return known.includes(real) ? real : null;
}

/** Digit (1-based) → writable type, for one preset. Unknown types are
    left out, so the digit is simply unbound. */
export function digitMap(presetId, known) {
  const out = {};
  getPreset(presetId).digits.forEach((t, i) => {
    const r = resolveType(t, known);
    if (r) out[i + 1] = r;
  });
  return out;
}

/** The preset's order, writable types only, each once — the order
    Return on an empty element walks. */
export function cycleOrder(presetId, known) {
  const seen = [];
  getPreset(presetId).digits.forEach((t) => {
    const r = resolveType(t, known);
    if (r && !seen.includes(r)) seen.push(r);
  });
  known.forEach((t) => { if (!seen.includes(t)) seen.push(t); });
  return seen;
}

export function cycleNext(type, presetId, known) {
  const order = cycleOrder(presetId, known);
  const i = order.indexOf(type);
  return order[(i + 1) % order.length];
}

/** What Return gives after `type`: the writer's own choice if they made
    one (and it is still writable), else Final Draft's default. */
export function returnNext(type, prefs, known) {
  const custom = prefs && prefs.returnNext && prefs.returnNext[type];
  const pick = (custom && resolveType(custom, known)) || resolveType(DEFAULT_RETURN[type] || 'action', known);
  return pick || 'action';
}

/** The full Return table, for the settings panel and the sheet. */
export function returnTable(prefs, known) {
  const out = {};
  known.forEach((t) => { out[t] = returnNext(t, prefs, known); });
  return out;
}

/** Tab / Shift+Tab. Returns { op: 'change' | 'insert', type } or null
    (null = let the browser move focus, so Tab is never a trap where the
    table has nothing to say).
      empty element  → change it in place: there is nothing to keep, and
                       a new element would leave an empty one behind.
      filled element → insert the next element after it.
      Shift+Tab      → always changes in place. */
export function tabAction(type, isEmpty, shift, known) {
  if (shift) {
    const t = resolveType(DATA.shiftTab[type] || '', known);
    return t ? { op: 'change', type: t } : null;
  }
  if (isEmpty) {
    const t = resolveType(DATA.tab.empty[type] || DATA.tab.filled[type] || '', known);
    return t ? { op: 'change', type: t } : null;
  }
  const t = resolveType(DATA.tab.filled[type] || '', known);
  return t ? { op: 'insert', type: t } : null;
}

/* ---- prefs -------------------------------------------------
   One per-device key, `fms_write_prefs_v1`, SHARED with the format
   guide (Phase 3), so this module owns only `keys` inside it and
   every write is read-merge-write: a field it does not know is
   carried across untouched. */
export function parsePrefs(raw) {
  let all = {};
  try { all = raw ? JSON.parse(raw) : {}; } catch (e) { all = {}; }
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  const k = all.keys && typeof all.keys === 'object' ? all.keys : {};
  return {
    preset: PRESETS.some((p) => p.id === k.preset) ? k.preset : DEFAULT_PRESET,
    returnNext: k.returnNext && typeof k.returnNext === 'object' ? { ...k.returnNext } : {},
    ctrlDigits: k.ctrlDigits === true
  };
}

/** The new raw string: `raw` with its `keys` patched and nothing else
    changed. A Return choice equal to the default is dropped, so the
    stored object only ever holds what the writer actually changed. */
export function mergePrefs(raw, patch) {
  let all = {};
  try { all = raw ? JSON.parse(raw) : {}; } catch (e) { all = {}; }
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  const cur = parsePrefs(raw);
  const next = { ...cur, ...patch };
  if (patch.returnNext) next.returnNext = { ...cur.returnNext, ...patch.returnNext };
  Object.keys(next.returnNext).forEach((t) => {
    if (!next.returnNext[t] || next.returnNext[t] === DEFAULT_RETURN[t]) delete next.returnNext[t];
  });
  const keys = { ...(all.keys && typeof all.keys === 'object' ? all.keys : {}), preset: next.preset, ctrlDigits: next.ctrlDigits };
  if (Object.keys(next.returnNext).length) keys.returnNext = next.returnNext;
  else delete keys.returnNext;
  return JSON.stringify({ ...all, keys });
}

/* Storage IO, called only from a user action (never at import, never
   on render — the idle-write assertion). */
export function loadWritePrefs() {
  try { return parsePrefs(localStorage.getItem(WRITE_PREFS_KEY)); } catch (e) { return parsePrefs(null); }
}
export function saveWritePrefs(patch) {
  try {
    const raw = localStorage.getItem(WRITE_PREFS_KEY);
    const next = mergePrefs(raw, patch);
    if (next !== raw) localStorage.setItem(WRITE_PREFS_KEY, next);
  } catch (e) { /* private mode / quota: the choice holds for this visit */ }
  return loadWritePrefs();
}

/* ---- the one question the page asks ------------------------
   resolveKey(e, ctx) → an action, or null for "not ours".
     e    { key, code, altKey, ctrlKey, metaKey, shiftKey }
     ctx  { type, empty, prefs, known, ctrlDigits }
   Actions: { kind: 'type', type }        set this element's type
            { kind: 'return', op, type }  op 'insert' | 'change'
            { kind: 'tab', op, type }
            { kind: 'dual' } { kind: 'note' } { kind: 'navigator' } */
export function digitOf(e) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
  if (m) return Number(m[1]);
  return /^[1-9]$/.test(e.key || '') ? Number(e.key) : 0;
}

export function resolveKey(e, ctx) {
  const prefs = ctx.prefs || parsePrefs(null);
  const known = ctx.known;
  const mod = e.ctrlKey || e.metaKey;
  const key = String(e.key || '');
  const lower = key.toLowerCase();

  // Alt/Option + digit, and Ctrl/Cmd + digit where the page takes it.
  const d = digitOf(e);
  if (d && !e.shiftKey && ((e.altKey && !mod) || (mod && !e.altKey && ctx.ctrlDigits))) {
    const t = digitMap(prefs.preset, known)[d];
    return t ? { kind: 'type', type: t } : null;
  }
  // Alt/Option + D. e.code, again, because Option+D is '∂' on a Mac.
  if (e.altKey && !mod && !e.shiftKey && (e.code === 'KeyD' || lower === 'd')) return { kind: 'dual' };
  if (mod && e.shiftKey && !e.altKey) {
    if (e.code === 'KeyK' || lower === 'k') return { kind: 'note' };
    if (e.code === 'KeyS' || lower === 's') return { kind: 'navigator' };
    // Ctrl/Cmd+Shift+F is focus mode's (Phase 4); deliberately not here.
    return null;
  }
  if (key === 'Enter' && !e.shiftKey && !e.altKey && !mod) {
    if (ctx.empty) return { kind: 'return', op: 'change', type: cycleNext(ctx.type, prefs.preset, known) };
    return { kind: 'return', op: 'insert', type: returnNext(ctx.type, prefs, known) };
  }
  if (key === 'Tab' && !e.altKey && !mod) {
    const t = tabAction(ctx.type, ctx.empty, e.shiftKey, known);
    return t ? { kind: 'tab', ...t } : null;
  }
  return null;
}

/** The rows the shortcut sheets print, for the active preset. */
export function shortcutRows(prefs, known, ctrlDigits) {
  const name = (t) => TYPE_NAMES[t] || t;
  const p = getPreset(prefs.preset);
  const rows = [];
  p.digits.forEach((t, i) => {
    const r = resolveType(t, known);
    const label = r
      ? name(t) + (r !== t ? ' (as ' + name(r) + ')' : '')
      : name(t) + ' — not in this build yet';
    rows.push({ keys: ctrlDigits ? ['Alt/⌥ ' + (i + 1), 'Ctrl/⌘ ' + (i + 1)] : ['Alt/⌥ ' + (i + 1)], label, off: !r });
  });
  rows.push(
    { keys: ['Return'], label: 'Next element, in the type that follows (see the flow)' },
    { keys: ['Return'], label: 'On an empty element: cycle its type' },
    { keys: ['Shift Return'], label: 'Line break inside the element' },
    { keys: ['Tab'], label: 'Action → Character → Parenthetical → Dialogue; empty Character → Transition' },
    { keys: ['Shift Tab'], label: 'Step the element type back' },
    { keys: ['Esc', 'Tab'], label: 'Leave the screenplay with Tab (Esc first frees it)' },
    { keys: ['Alt/⌥ D'], label: 'Dual dialogue on this cue' },
    { keys: ['Ctrl/⌘ Shift K'], label: 'Note on this line' },
    { keys: ['Ctrl/⌘ Shift S'], label: 'Scene navigator — jump to a scene heading' },
    { keys: ['↑ ↓', 'Tab / Return', 'Esc'], label: 'SmartType: move, accept, dismiss' },
    /* src/ui/tamil-type.js. Alt+T because every other Alt letter the
       editor might want is free and T is the one that names it; it is
       matched on e.code there, like Alt+D, since Option+T is '†'. */
    { keys: ['Alt/⌥ T'], label: 'Tamil typing on or off — dialogue and parentheticals only' },
    { keys: ['Space', 'Return', 'Esc'], label: 'Tamil typing: commit the word in Tamil script, or keep it in Roman letters' }
  );
  return { preset: p.label, rows };
}

export default {
  WRITE_PREFS_KEY, PRESETS, DEFAULT_PRESET, SMARTTYPE, getPreset, resolveType, digitMap,
  cycleOrder, cycleNext, returnNext, returnTable, tabAction, parsePrefs, mergePrefs,
  loadWritePrefs, saveWritePrefs, resolveKey, digitOf, shortcutRows
};
