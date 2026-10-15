/* ============================================================
   SHORT-MODEL — the Short Film Blueprint's logic, without the page
   ------------------------------------------------------------
   src/pages/short.js draws the blueprint and wires its events; this
   file is what it stores and what it derives (docs/ARCHITECTURE.md).

     storage   the blueprint blob and the legacy dark-mode pref. The
               key names live HERE and nowhere else in the view. Both
               go through prefs.js, i.e. the same Storage.prototype
               store.js patches, so the blob is still suffixed with the
               open project's id exactly as before.
     derived   page count and runtime, the runtime verdict, badge and
               progress figures, the festival fee totals, the beat
               curve's path, the old flat scene-key migration.
     exports   the Fountain and plain-text renderings of the script,
               the three AI prompts, the export filename.

   Pure apart from storage: no `document`, no src/ui import.
   ============================================================ */

import { readText, writeText, removeKey, readJSON, writeJSON } from './prefs.js';
import { parseNum, INR, USD } from './money.js';
import { FESTIVALS_KEY } from './festivals.js';

// Storage keys — a contract with saved work (CLAUDE.md invariant 1).
export const STORAGE_KEY = 'fms_shortfilm_blueprint_v1';
export const PREF_KEY    = 'fms_shortfilm_prefs_v1';

// Industry rule of thumb: one formatted screenplay page ≈ 210 words
// ≈ one minute of screen time.
export const WORDS_PER_PAGE = 210;

/* The scene map's row fields and beats are declared in short.js beside
   the row markup that uses them (scripts/test-stage-guide.mjs reads them
   there); the migration below takes the fields as a parameter. */

// ============================================================
// STORAGE — the blueprint blob
// ============================================================

/** The stored blob as a string; '' when there is none (or storage is
    unreadable — the callers treated both the same). */
export function readBlueprintBlob() {
  return readText(STORAGE_KEY, '') || '';
}

/**
 * Write the blob. The page used to call localStorage.setItem bare, so a
 * refused write (quota, a blocked origin) THREW: the save stopped before
 * it said "saved", and an import reported "Import failed: …". prefs.js
 * answers false instead, so the throw is restored here.
 */
export function writeBlueprintBlob(raw) {
  if (!writeText(STORAGE_KEY, raw)) {
    throw new Error('the browser refused to save the blueprint (storage full or blocked)');
  }
}

/** The stored blueprint, parsed; {} when there is none. */
export function readBlueprint() {
  return readJSON(STORAGE_KEY, {});
}

/** "ALL" for a reset: the blob AND this project's festival tracker
    (fms_festivals_v1, scoped per project like the blob). */
export function eraseShortBlueprint() {
  removeKey(STORAGE_KEY);
  removeKey(FESTIVALS_KEY);
}

/** The legacy page's own dark-mode preference ({ dark }). */
export function readShortPrefs() {
  return readJSON(PREF_KEY, {});
}
export function saveShortPrefs(prefs) {
  return writeJSON(PREF_KEY, prefs);
}

// ============================================================
// MIGRATION — the flat scene keys
// ============================================================
/**
 * Bug (a), the returning-user half: earlier builds wrote the scene map
 * twice, and because row numbers renumber on every reload the flat
 * `sm_<n>_<field>` keys piled up in storage forever. Lift whatever is
 * in them into rows, and drop them from `data` (mutated in place) — the
 * caller re-saves, so they never come back. `fields` is the row's
 * field list (short.js SCENE_FIELDS); any other sm_ suffix is left be.
 */
export function migrateFlatSceneKeys(data, fields) {
  const byIndex = new Map();
  let found = false;
  for (const key of Object.keys(data)) {
    const m = key.match(/^sm_(\d+)_(.+)$/);
    if (!m || !fields.includes(m[2])) continue;
    found = true;
    const idx = parseInt(m[1], 10);
    if (!byIndex.has(idx)) byIndex.set(idx, {});
    byIndex.get(idx)[m[2]] = data[key];
    delete data[key];
  }
  if (!found) return null;
  const rows = [...byIndex.keys()].sort((a, b) => a - b)
    .map((i) => byIndex.get(i))
    .filter((row) => Object.values(row).some((v) => String(v || '').trim()));
  return { rows };
}

/** What readBlueprintFile() accepts besides the page's own data-keys. */
export const IMPORT_RULES = {
  extraKey: (k) => k === '_sceneMap' || k === '_script' || /^sm_\d+_/.test(k),
  allowNonScalar: (k, v) => (k === '_sceneMap' || k === '_script') && Array.isArray(v),
  label: 'Short Film Blueprint',
  otherLabel: 'Feature Blueprint',
  looksOther: (d) => Object.keys(d).some((k) => /^(sl|shot|cast|loc)_\d+_/.test(k))
};

// ============================================================
// DERIVED — progress, badges, counts
// ============================================================
export function percent(filled, total) {
  return total > 0 ? Math.round((filled / total) * 100) : 0;
}

/** A step badge's state from its filled / total fields. */
export function badgeState(filled, total) {
  if (total === 0) return { cls: 'empty', text: 'EMPTY' };
  const ratio = filled / total;
  if (ratio === 0) return { cls: 'empty', text: 'EMPTY' };
  if (ratio < 1) return { cls: 'partial', text: 'IN PROGRESS · ' + Math.round(ratio * 100) + '%' };
  return { cls: 'complete', text: 'COMPLETE' };
}

export function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

/** Whether the script has nothing worth previewing yet. */
export function scriptIsEmpty(scenes) {
  return scenes.length === 0 || (scenes.length === 1 && !scenes[0].slug && !scenes[0].action);
}

/** Words, pages and m:ss runtime of a script ({slug, action, dialogues}[]). */
export function scriptLength(scenes) {
  let words = 0;
  scenes.forEach((scene) => {
    if (scene.slug) words += scene.slug.split(/\s+/).filter(Boolean).length;
    if (scene.action) words += scene.action.split(/\s+/).filter(Boolean).length;
    scene.dialogues.forEach((d) => {
      if (d.character) words += 2; // weighted higher (centered, takes a line)
      if (d.line) words += d.line.split(/\s+/).filter(Boolean).length;
    });
  });
  // ~210 words per formatted page (industry rule of thumb)
  const pages = Math.round((words / WORDS_PER_PAGE) * 10) / 10;
  const minutes = Math.floor(pages);
  const seconds = Math.round((pages - minutes) * 60);
  return { words, pages, minutes, seconds };
}

export function parseRuntime(s) {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/** The page counter's verdict: text and the status class. */
export function runtimeVerdict(pages, target) {
  if (target && pages > 0) {
    const diff = pages - target;
    if (Math.abs(diff) < 1) return { text: 'on target', cls: 'pc-status ok' };
    if (diff > 0) return { text: 'long by ' + diff.toFixed(1) + ' pages', cls: 'pc-status warn' };
    return { text: 'short by ' + Math.abs(diff).toFixed(1) + ' pages', cls: 'pc-status warn' };
  }
  if (pages > 30) return { text: 'feature territory', cls: 'pc-status warn' };
  return { text: pages > 0 ? 'enter target runtime' : 'enter scenes below', cls: 'pc-status' };
}

/** The SVG path through the five beat dots, anchored to both edges. */
export function beatCurvePath(beats, width) {
  const dots = beats.map((b) => [b.svg.dotX, b.svg.dotY]);
  const pts = [[0, dots[0][1]], ...dots, [width, dots[dots.length - 1][1]]];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  d += ` L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
  return d;
}

// ============================================================
// FESTIVALS — the tracker's figures
// ============================================================
/** Totals are per currency. A $50 Sundance fee and a ₹500 IFFK fee
    are not addable, and a tracker that adds them has invented a
    number. parseNum comes from money.js — no second parser. */
export function feeTotals(list) {
  const totals = { USD: 0, INR: 0 };
  for (const s of list) {
    const n = parseNum(s.fee);
    if (!n) continue;
    const cur = totals[s.currency] === undefined ? 'USD' : s.currency;
    totals[cur] += n;
  }
  return totals;
}

export function formatSpend(totals) {
  const parts = [];
  if (totals.USD) parts.push('$' + USD.format(Math.round(totals.USD)));
  if (totals.INR) parts.push('₹' + INR.format(Math.round(totals.INR)));
  return parts.length ? parts.join(' + ') : '—';
}

/** Overdue / due-soon for a tracked row, given its days to deadline. */
export function deadlineState(s, days) {
  return {
    overdue: s.status === 'target' && days !== null && days < 0,
    soon: s.status === 'target' && days !== null && days >= 0 && days <= 14
  };
}

// ============================================================
// EXPORTS — Fountain, plain text, the filename
// ============================================================
/** `data` is the trimmed field map (collectFieldData), `scenes` the script. */
export function buildFountain(data, scenes) {
  let out = '';
  out += 'Title: ' + (data.meta_title || 'Untitled Short') + '\n';
  out += 'Author: ' + (data.meta_writer || '') + '\n';
  if (data.meta_started) out += 'Draft date: ' + data.meta_started + '\n';
  out += '\n';
  out += '====\n\n';
  out += 'FADE IN:\n\n';
  scenes.forEach((scene) => {
    if (scene.slug) out += scene.slug.toUpperCase().trim() + '\n\n';
    if (scene.action) out += scene.action.trim() + '\n\n';
    scene.dialogues.forEach((d) => {
      if (!d.character && !d.line) return;
      if (d.character) out += d.character.toUpperCase().trim() + '\n';
      if (d.parenthetical) {
        let p = d.parenthetical.trim();
        if (!p.startsWith('(')) p = '(' + p;
        if (!p.endsWith(')')) p = p + ')';
        out += p + '\n';
      }
      if (d.line) out += d.line.trim() + '\n';
      out += '\n';
    });
  });
  out += 'FADE OUT.\n';
  return out;
}

export function buildPlainText(data, scenes) {
  let out = '';
  out += (data.meta_title || 'UNTITLED').toUpperCase() + '\n';
  if (data.meta_writer) out += 'by ' + data.meta_writer + '\n';
  out += '\n';
  out += 'FADE IN:\n\n';
  scenes.forEach((scene) => {
    if (scene.slug) out += scene.slug.toUpperCase().trim() + '\n\n';
    if (scene.action) out += scene.action.trim() + '\n\n';
    scene.dialogues.forEach((d) => {
      if (!d.character && !d.line) return;
      if (d.character) out += '                    ' + d.character.toUpperCase().trim() + '\n';
      if (d.parenthetical) out += '              (' + d.parenthetical.replace(/^\(|\)$/g, '').trim() + ')\n';
      if (d.line) out += '          ' + d.line.trim() + '\n';
      out += '\n';
    });
  });
  out += 'FADE OUT.\n';
  return out;
}

/** The film's title as a filename stem ('short' when there is none). */
export function fileSlug(title) {
  return (title || 'short').replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'short';
}

// ============================================================
// AI PROMPTS
// ============================================================
/**
 * One of the three prompts ('scene', 'dialogue', anything else is the
 * feedback prompt). `d` is the trimmed field map; `plainText` is the
 * script as buildPlainText renders it (only the feedback prompt reads it).
 */
export function buildAIPromptText(kind, d, plainText) {
  const fb = (v, def) => (v && v.length ? v : def || '[fill in the blueprint]');
  let prompt = '';

  if (kind === 'scene') {
    prompt = `You are a screenwriter helping me write a single scene of a short film. Write ONE scene, in standard screenplay format, ~1 page (~210 words).

PROJECT
Title: ${fb(d.meta_title, 'Untitled Short')}
Logline: ${fb(d.s2_log_final, fb(d.s2_log2, d.s2_log1))}
Theme: The film argues that — ${fb(d.b5_image, 'see beat 5 / final image')}.

PROTAGONIST
Name: ${fb(d.s3_name)}
Want: ${fb(d.s3_want)}
Obstacle: ${fb(d.s3_obstacle)}

WORLD
Location: ${fb(d.s5_loc)}
Time/weather: ${fb(d.s5_time)}
Sensory anchors: ${fb(d.s5_anchors)}
Rules of the world: ${fb(d.s5_rules)}

THE SCENE TO WRITE
[Describe the specific scene you want generated here. E.g. "the moment the protagonist first realizes their daughter doesn't trust them — set in their kitchen, mid-afternoon."]

CONSTRAINTS
- Standard screenplay format (slug line, action, dialogue).
- Present tense, third person.
- No camera directions unless essential.
- Keep dialogue spare — show, don't tell.
- ~1 page total (max 250 words).
- End the scene on a different value-charge than it started (positive→negative or vice versa).
- Match the tone of the world: ${fb(d.s5_time, 'realist')}.

Write only the scene. No commentary.`;
  } else if (kind === 'dialogue') {
    prompt = `You are a screenwriter helping me find the right dialogue for a moment in a short film. Write 4–8 lines of exchange between two characters.

PROJECT
Title: ${fb(d.meta_title, 'Untitled Short')}
Logline: ${fb(d.s2_log_final)}

PROTAGONIST
${fb(d.s3_name)} — wants ${fb(d.s3_want)}, blocked by ${fb(d.s3_obstacle)}.

OTHER CHARACTER
[Describe — name, relationship, what THEY want in this moment.]

THE MOMENT
[Describe the dramatic situation: what just happened, what's at stake, what each character is trying to get from the other.]

CONSTRAINTS
- Each line under 15 words.
- Subtext over text — they say one thing, mean another.
- No exposition, no "as you know" dialogue.
- One of them lies; one of them notices.
- End on a beat — a silence, a look, a small action.
- Standard screenplay format (CHARACTER NAME above line).

Write only the dialogue exchange. No commentary.`;
  } else { // feedback
    prompt = `You are a script editor giving structural feedback on a short film. Read the script below and answer the FOUR questions at the end.

PROJECT
Title: ${fb(d.meta_title, 'Untitled Short')}
Logline: ${fb(d.s2_log_final)}
Target runtime: ${fb(d.meta_runtime, '~10 min')}
Protagonist's want: ${fb(d.s3_want)}
The 5 beats:
1. Setup — ${fb(d.b1_setup)}
2. Disturbance — ${fb(d.b2_disturb)}
3. Escalation — ${fb(d.b3_escalate)}
4. Turn — ${fb(d.b4_turn)}
5. Image — ${fb(d.b5_image)}

SCRIPT
${plainText}

QUESTIONS
1. Does the script earn its runtime, or does any scene stall?
2. Is the protagonist's want concrete and visible throughout?
3. Does the turn (Beat 4) actually change something, or is it just a reveal?
4. Does the final image (last frame) hold the meaning of the whole film?

Be specific. Quote scenes by their slug lines. Be honest, not nice.`;
  }
  return prompt;
}

// ============================================================
// INLINE-HANDLER ADOPTION — the parse half
// ============================================================
/** Authored onclick="fn(arg)" in frozen src/data → its data-action. */
export const ADOPTED_HANDLERS = {
  addSceneMapRow:  'scenemap-add',
  addScriptScene:  'script-add-scene',
  rebuildPreview:  'preview-refresh',
  copyFountain:    'copy-fountain',
  copyPlainText:   'copy-plain',
  clearScript:     'clear-script',
  buildAIPrompt:   'ai-prompt',
  copyAIPrompt:    'copy-ai-prompt',
  exportFountain:  'export-fountain',
  exportPlainTxt:  'export-txt',
  printScriptOnly: 'print-script'
};

/** `{ action, arg }` for a recognised handler source, else null. */
export function parseInlineHandler(src) {
  const m = String(src).trim().match(/^([A-Za-z_$][\w$]*)\s*\(\s*(.*?)\s*\)\s*;?$/);
  const action = m && ADOPTED_HANDLERS[m[1]];
  if (!action) return null;
  return { action, arg: m[2].replace(/^['"]|['"]$/g, '') };
}
