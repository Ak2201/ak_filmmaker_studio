/* ============================================================
   FEATURE MODEL — the Feature Blueprint's pure logic
   ------------------------------------------------------------
   Everything src/pages/feature.js computes that does not need the
   DOM: the five parts, completion tallies, the pacing chart, the
   budget split, the charge timeline, the character map, the pitch
   deck's slides (HTML and .pptx), the Markdown export's text, the
   e-mail summary, the sample's fields, the import's row-key rule.

   The page gathers values off the screen, hands them in, and draws
   what comes back. Nothing here touches `document` or storage
   (docs/ARCHITECTURE.md, L2), and nothing imports src/ui — the few
   helpers that live there (stageInfo, partHeading, an HTML parser)
   are passed in as arguments rather than imported.

   Every string and number below is byte-identical to what the page
   produced when this code lived in it; this is a move, not a
   rewrite.
   ============================================================ */
import { esc } from './dom.js';
import { parseNum, fmtINR } from './money.js';

/** Same escaper the legacy page used; dom.js owns the implementation. */
export function escapeHTML(s) {
  return esc(s == null ? '' : s);
}

/* ---- the five parts --------------------------------------------- */

/** One entry per part from `partList` (partsOf('feature')), each with
    the steps whose stage info names it. `nsOf` maps a step id to the
    namespace it renders under; `stageInfo(ns, id)` is steps.js's. */
export function buildParts(partList, allSteps, nsOf, stageInfo) {
  return partList.map((p) => ({
    ...p,
    steps: allSteps.filter((s) => {
      const info = stageInfo(nsOf.get(s.id), s.id);
      return info && info.parts.includes(p.part);
    })
  }));
}

/* ---- inline handlers -------------------------------------------- */

/** `clearEmpty('sceneListBody')` → { name: 'clearEmpty', args: '["sceneListBody"]' }.
    `args` is null when there are none or they do not parse; the whole
    answer is null when the source is not a single call. */
export function parseInlineHandler(src) {
  const m = String(src).match(/^\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*;?\s*$/);
  if (!m) return null;
  let args = null;
  const argsSrc = m[2].trim();
  if (argsSrc) {
    try { args = JSON.stringify(JSON.parse('[' + argsSrc.replace(/'/g, '"') + ']')); }
    catch (e) { /* authored data only — a bad arg list is a data bug */ }
  }
  return { name: m[1], args };
}

/* ---- completion ------------------------------------------------- */

/** `fields` are booleans (filled?), `checks` booleans (ticked?),
    `tables` the filled-row count of each table; each table is worth
    `rowCap` and earns one per filled row up to it. */
export function tallyCompletion(fields, checks, tables, rowCap) {
  let total = 0, done = 0;
  fields.forEach((f) => { total++; if (f) done++; });
  checks.forEach((c) => { total++; if (c) done++; });
  tables.forEach((filledRows) => { total += rowCap; done += Math.min(rowCap, filledRows); });
  return { total, done };
}

export function completionPct(total, done) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Filled, for the progress bar and the step badges. Takes anything
    shaped like a form control ({ type, checked, value }). */
export function fieldFilled(f) {
  if (f.type === 'checkbox') return f.checked;
  return !!(f.value && f.value.trim());
}

/* THE HOD SIGN-OFF BOXES are saved as a boolean. A stored "on" carries
   no information (every box ever saved says it, ticked or not), so it
   reads as unticked; `true` and "true" read as ticked. See the longer
   note in feature.js. */
export function savedTick(v) { return v === true || v === 'true'; }

/** The highest row number each of the four tables has in a saved blob. */
export function rowCountsFromBlob(saved) {
  let scene = 0, shot = 0, cast = 0, loc = 0;
  Object.keys(saved).forEach((k) => {
    let m;
    if ((m = k.match(/^sl_(\d+)_/))) scene = Math.max(scene, +m[1]);
    if ((m = k.match(/^shot_(\d+)_/))) shot = Math.max(shot, +m[1]);
    if ((m = k.match(/^cast_(\d+)_/))) cast = Math.max(cast, +m[1]);
    if ((m = k.match(/^loc_(\d+)_/))) loc = Math.max(loc, +m[1]);
  });
  return { scene, shot, cast, loc };
}

/** The save indicator's words, `now` ms after a save at `savedAt`. */
export function savedAgoText(savedAt, now) {
  const sec = Math.floor((now - savedAt) / 1000);
  let text = '●  saved · just now';
  if (sec >= 60 && sec < 3600) text = `●  saved · ${Math.floor(sec / 60)}m ago`;
  else if (sec >= 3600) text = `●  saved · ${Math.floor(sec / 3600)}h ago`;
  else if (sec >= 5) text = `●  saved · ${sec}s ago`;
  return text;
}

/* ---- pacing visualiser (step 08) -------------------------------- */

export const PACING_BEATS = [
  { n: '01', label: 'Open',  x: 30,  y: 130, act: 1 },
  { n: '02', label: 'Theme', x: 75,  y: 110, act: 1 },
  { n: '03', label: 'Setup', x: 125, y: 95,  act: 1 },
  { n: '04', label: 'Catlst',x: 175, y: 60,  act: 1 },
  { n: '05', label: 'Debate',x: 220, y: 80,  act: 1 },
  { n: '06', label: 'Brk II',x: 265, y: 50,  act: 2 },
  { n: '07', label: 'B Sty', x: 305, y: 70,  act: 2 },
  { n: '08', label: 'Fun',   x: 350, y: 90,  act: 2 },
  { n: '09', label: 'Mid',   x: 395, y: 50,  act: 2 },
  { n: '10', label: 'Close', x: 440, y: 70,  act: 2 },
  { n: '11', label: 'Lost',  x: 485, y: 30,  act: 2 },
  { n: '12', label: 'Dark',  x: 530, y: 100, act: 2 },
  { n: '13', label: 'Brk III',x:580, y: 60,  act: 3 },
  { n: '14', label: 'Final', x: 635, y: 25,  act: 3 },
  { n: '15', label: 'Img',   x: 690, y: 130, act: 3 }
];

/** The chart's SVG body and its four counters, from the saved blob. */
export function pacingChart(data) {
  const beats = PACING_BEATS;
  let svgContent = '';
  // Act dividers
  svgContent += `<line class="act-divider" x1="240" y1="20" x2="240" y2="170"/>`;
  svgContent += `<line class="act-divider" x1="555" y1="20" x2="555" y2="170"/>`;
  svgContent += `<text class="act-label" x="125" y="190" text-anchor="middle">ACT I</text>`;
  svgContent += `<text class="act-label" x="395" y="190" text-anchor="middle">ACT II</text>`;
  svgContent += `<text class="act-label" x="635" y="190" text-anchor="middle">ACT III</text>`;
  // Arc line connecting beats
  const path = beats.map((b, i) => `${i === 0 ? 'M' : 'L'} ${b.x} ${b.y}`).join(' ');
  svgContent += `<path class="arc-line" d="${path}"/>`;
  // Beats
  let filled = 0, a1 = 0, a2 = 0, a3 = 0;
  beats.forEach((b) => {
    const beatKey = 'b' + b.n;
    const isFilled = data[beatKey] && data[beatKey].trim();
    const cls = isFilled ? 'beat-dot filled' : 'beat-dot';
    const numCls = isFilled ? 'beat-num filled' : 'beat-num';
    svgContent += `<circle class="${cls}" cx="${b.x}" cy="${b.y}" r="14"/>`;
    svgContent += `<text class="${numCls}" x="${b.x}" y="${b.y + 4}">${b.n}</text>`;
    svgContent += `<text class="beat-label" x="${b.x}" y="${b.y + 30}">${b.label}</text>`;
    if (isFilled) {
      filled++;
      if (b.act === 1) a1++;
      else if (b.act === 2) a2++;
      else a3++;
    }
  });
  return { svg: svgContent, filled, act1: a1 + '/3', act2: a2 + '/8', act3: a3 + '/4' };
}

/* ---- budget (step 23) ------------------------------------------- */

/* The budget panel shows an em-dash for "nothing entered yet" where
   the rest of the studio shows ₹ 0. That empty case is the only
   difference, so it wraps fmtINR rather than forking it. */
export function formatBudgetINR(n) {
  return n ? fmtINR(n) : '—';
}

/** The four figures as typed (strings), parsed with the one shared
    money parser. `total` is the computed sum when there is one, else
    the typed total; `denom` is what the bar's segments divide by. */
export function budgetBreakdown({ atl: atlRaw, btl: btlRaw, post: postRaw, total: totalRaw, cont: contRaw }) {
  const atl = parseNum(atlRaw || ''), btl = parseNum(btlRaw || ''), post = parseNum(postRaw || '');
  const totalDirect = parseNum(totalRaw || '');
  let contPct = 0; const m = String(contRaw || '').match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) contPct = parseFloat(m[1]);
  const subTotal = atl + btl + post;
  const cont = subTotal * contPct / 100;
  const computed = subTotal + cont;
  const total = computed > 0 ? computed : totalDirect;
  return { atl, btl, post, cont, total, denom: atl + btl + post + cont };
}

/** The breakdown bar's segments, or '' when there is nothing to divide. */
export function budgetBarHTML(b) {
  const { atl, btl, post, cont, denom } = b;
  if (!(denom > 0)) return '';
  return `
        <div class="budget-bar-seg atl" style="width:${(atl / denom * 100).toFixed(1)}%" title="ATL: ${formatBudgetINR(atl)}"></div>
        <div class="budget-bar-seg btl" style="width:${(btl / denom * 100).toFixed(1)}%" title="BTL: ${formatBudgetINR(btl)}"></div>
        <div class="budget-bar-seg post" style="width:${(post / denom * 100).toFixed(1)}%" title="Post: ${formatBudgetINR(post)}"></div>
        <div class="budget-bar-seg cont" style="width:${(cont / denom * 100).toFixed(1)}%" title="Contingency: ${formatBudgetINR(cont)}"></div>`;
}

/* ---- word counters ---------------------------------------------- */

/** { text, state } where state is '' (empty), 'good' or 'over'. */
export function wordCounterState(value, target, lowerLabel) {
  const w = (String(value).trim().match(/\S+/g) || []).length;
  const text = `${w} ${w === 1 ? 'word' : 'words'} · target ${lowerLabel || '<' + target}`;
  const state = w === 0 ? '' : w <= target ? 'good' : 'over';
  return { text, state };
}

/* ---- character map (step 06) ------------------------------------ */

/** The map's SVG body from the five names (already trimmed). */
export function charMapSVG({ protag, antag, ally, lover, mentor }) {
  const cx = 360, cy = 180;
  const positions = {
    protagonist: { x: cx, y: cy, name: protag, label: 'Protagonist', conn: 'Story · Step 4' },
    antagonist:  { x: cx + 240, y: cy, name: antag, label: 'Antagonist', conn: 'opposes' },
    ally:        { x: cx - 240, y: cy - 90, name: ally, label: 'Ally', conn: 'reflects' },
    lover:       { x: cx - 240, y: cy + 90, name: lover, label: 'Love / mirror', conn: 'pulls toward need' },
    mentor:      { x: cx, y: cy - 130, name: mentor, label: 'Mentor / catalyst', conn: 'hands over tool' }
  };

  let s = '';
  // Connection lines from protagonist to each other
  Object.keys(positions).forEach(key => {
    if (key === 'protagonist') return;
    const p = positions[key];
    const isFilled = !!p.name;
    const cls = isFilled ? 'conn-line solid' : 'conn-line';
    s += `<line class="${cls}" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`;
    const mx = (cx + p.x) / 2, my = (cy + p.y) / 2 - 6;
    s += `<text class="conn-label" x="${mx}" y="${my}">${p.conn}</text>`;
  });

  // Draw each character
  Object.keys(positions).forEach(key => {
    const p = positions[key];
    const isFilled = !!p.name;
    const r = key === 'protagonist' ? 50 : 42;
    let cls = 'char-circle';
    if (key === 'protagonist') cls += ' protagonist';
    else if (key === 'antagonist') cls += ' antagonist';
    if (!isFilled) cls += ' empty';
    s += `<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="${r}"/>`;
    s += `<text class="char-role" x="${p.x}" y="${p.y - 6}">${p.label}</text>`;
    const nameCls = isFilled
      ? (key === 'protagonist' ? 'char-name protagonist' : 'char-name')
      : 'char-name empty';
    const display = isFilled ? String(p.name) : '— empty —';
    const shown = display.length > 14 ? display.slice(0, 14) + '…' : display;
    // User text — escaped before it reaches innerHTML.
    s += `<text class="${nameCls}" x="${p.x}" y="${p.y + 16}">${escapeHTML(shown)}</text>`;
  });
  return s;
}

/* ---- scene charge timeline (step 11) ---------------------------- */

/** `rows` are the scene table's rows in order, each { hasContent,
    charge }. Blank rows past the first eight are skipped. */
export function sceneChargeChart(rows) {
  let total = 0, charged = 0, flips = 0, lastSign = 0, run = 0, maxRun = 0;
  let html = '';
  rows.forEach((row, i) => {
    if (!row.hasContent && i > 7) return; // skip blank rows past first 8
    total++;
    const ch = row.charge || '';
    let cls = 'scene-bar flat', sign = 0, h = 0;
    if (ch === 'pos')      { cls = 'scene-bar pos';     sign = 1;  h = 35; charged++; }
    else if (ch === 'dbl-pos') { cls = 'scene-bar dbl-pos'; sign = 1;  h = 50; charged++; }
    else if (ch === 'neg') { cls = 'scene-bar neg';     sign = -1; h = 35; charged++; }
    else if (ch === 'dbl-neg') { cls = 'scene-bar dbl-neg'; sign = -1; h = 50; charged++; }
    // Track flips and runs
    if (sign !== 0) {
      if (lastSign !== 0 && sign !== lastSign) flips++;
      if (sign === lastSign) run++;
      else run = 1;
      if (run > maxRun) maxRun = run;
      lastSign = sign;
    } else {
      lastSign = 0; run = 0;
    }
    const heightStyle = h > 0 ? `style="height:${h}%;"` : '';
    html += `<div class="${cls}"><div class="seg" ${heightStyle}></div><span class="num">${String(i + 1).padStart(2, '0')}</span></div>`;
  });
  return {
    html, total, charged, flips,
    longestRun: maxRun > 0 ? maxRun + ' scene' + (maxRun > 1 ? 's' : '') : '—'
  };
}

/* ---- Part I → the Screenplay bridge (step 13) -------------------- */

/** The bridge panel's body, or '' when there is nothing to carry over. */
export function vol1BridgeHTML(logline, theme) {
  let html = '';
  if (logline) html += `<strong style="display:block; margin-bottom:6px; font-style:normal; color:var(--accent-deep);">Logline:</strong> "${escapeHTML(logline)}"`;
  if (theme) html += `<br><br><strong style="display:block; margin-bottom:6px; font-style:normal; color:var(--accent-deep);">Theme:</strong> ${escapeHTML(theme)}`;
  return html;
}

/* ---- files out -------------------------------------------------- */

/** A title as a filename stem: `fms_blueprint_<this>.json`. */
export function fileSlug(title) {
  return String(title).replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'film';
}

/** PDF.exportPDF's options for the whole blueprint. */
export function blueprintPdfOptions(data, stepCount) {
  const title = data.meta_title || data.v1_title || 'Untitled film';
  return {
    scope: 'blueprint',
    project: title,
    label: 'Feature blueprint',
    title: title + ' — Feature blueprint',
    subtitle: stepCount + (stepCount === 1 ? ' step' : ' steps')
  };
}

/* ---- import ----------------------------------------------------- */

/** The table rows' keys, which no static data-key on the page names. */
export const FEATURE_ROW_KEY = /^(sl|shot|cast|loc)_\d+_/;

/** A Short Film Blueprint file, told apart by its own fields. */
export function looksLikeShortFile(d) {
  return Array.isArray(d._sceneMap) || Array.isArray(d._script);
}

/** The file's fields without null/undefined values. */
export function cleanImportedFields(data) {
  const clean = {};
  Object.keys(data).forEach((k) => { if (data[k] != null) clean[k] = data[k]; });
  return clean;
}

/* ---- sample ----------------------------------------------------- */

/** The page's fields from a sample: its blueprint, its title on both
    covers, and its ticked checks. */
export function sampleFields(sample) {
  const fields = { ...sample.blueprint, meta_title: sample.title, v1_title: sample.title };
  for (const key of sample.blueprintChecks) fields[key] = true;
  return fields;
}

/* ---- e-mail to self --------------------------------------------- */

export function emailToSelfHref(data, progressPct, brandName) {
  const title = data.meta_title || 'Untitled film';
  const writer = data.meta_writer || 'Unknown';
  const logline = data.s2_log_final || data.s2_log2 || data.s2_log1 || '(logline not yet locked)';
  const theme = data.s3_theme || '(theme TBD)';
  const subject = encodeURIComponent('[Filmmaker\'s Blueprint] ' + title);
  const body = encodeURIComponent(
    'Project: ' + title + '\n' +
    'Writer/Director: ' + writer + '\n\n' +
    'LOGLINE\n' + logline + '\n\n' +
    'THEME\n' + theme + '\n\n' +
    'PROGRESS\n' + progressPct + '% across 24 steps\n\n' +
    '— Sent from ' + brandName + '\n\n' +
    'NOTE: To export the full data, open the blueprint and click JSON.'
  );
  return 'mailto:?subject=' + subject + '&body=' + body;
}

/* ---- focus timer ------------------------------------------------ */

export const FOCUS_SECONDS = 25 * 60;

export function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** The timer button's accessible name for a timer state. */
export function timerAriaLabel(st) {
  const state = st.running ? 'running'
              : st.paused  ? 'paused'
              : st.done    ? 'session done'
              : 'not started';
  return 'Focus timer, ' + formatTime(st.remaining) + ', ' + state
    + (st.pomos ? ', ' + st.pomos + ' completed' : '');
}

/* ---- Markdown export -------------------------------------------- */

/** key → human label, from the step JSON. `parseHTML(html)` returns a
    fragment to read the authored `raw` blocks' labels out of (the
    page passes dom.js's fromHTML). */
export function fieldLabelMap(allSteps, parseHTML) {
  const map = new Map();
  const clean = (s) => String(s ?? '')
    .replace(/<[^>]+>/g, '')          // authored labels carry markup
    .replace(/&amp;/g, '&')
    .replace(/^[A-Z]\s*·\s*/, '')     // "A · Logline attempt 1" → "Logline attempt 1"
    .replace(/\s+/g, ' ')
    .trim();

  for (const step of allSteps) {
    for (const b of step.blocks || []) {
      if (b.type === 'asks') {
        for (const a of b.items || []) map.set(a.key, clean(a.label) || humanise(a.key));
      } else if (b.type === 'raw') {
        const frag = parseHTML(b.html);
        frag.querySelectorAll('[data-key]').forEach((el) => {
          const key = el.getAttribute('data-key');
          const own = el.closest('div, td, .ask');
          const lab = own && (own.querySelector('label, .ask-label'));
          const text = lab ? clean(lab.textContent) : '';
          map.set(key, text || clean(el.getAttribute('placeholder')) || humanise(key));
        });
      }
    }
  }
  return map;
}

export function humanise(key) {
  return key.replace(/^(v2)?s\d+_/, '').replace(/^b\d+$/, key).replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Keys the export renders in a bespoke block rather than as a plain
    "**Label:** value" line. */
export function isSpecialKey(k) {
  return /^b\d\d$/.test(k) || /^s10_(setup|pay)_\d+$/.test(k);
}

/**
 * The whole Markdown document.
 *   data            the saved blob
 *   parts           buildParts() output, in order
 *   partHeading(n)  steps.js's heading for part n
 *   heading(step)   "NN · Title" for a step
 *   exportableFields(step) → [[label, key], …] the plain fields
 *   methodBeats     the save-the-cat beats ({ n, label })
 *   brandName       BRAND.name
 */
export function buildFeatureMarkdown({ data, parts, partHeading, heading, exportableFields, methodBeats, brandName }) {
  const title = data.meta_title || data.v1_title || 'Untitled film';
  let md = `# THE FILMMAKER'S BLUEPRINT\n## ${title}\n\n`;
  md += `**Director:** ${data.meta_director || data.v2_director || '—'}\n`;
  md += `**Started:** ${data.meta_started || '—'}\n`;
  md += `**Genre:** ${data.v1_genre || '—'}\n\n---\n\n`;

  // Helper to render a step — same shape as the legacy one, but the
  // (label, key) pairs now come from the data.
  const step = (head, fields) => {
    const hasContent = fields.some(([, k]) => data[k] && data[k].toString().trim());
    if (!hasContent) return '';
    let s = `## ${head}\n\n`;
    fields.forEach(([label, k]) => {
      const v = (data[k] || '').toString().trim();
      if (v) s += `**${label}:** ${v}\n\n`;
    });
    return s + '\n';
  };

  const renderStepBlock = (s) => {
    let out = step(heading(s), exportableFields(s));

    // Step 08 — the 15 beats, as a numbered block.
    if (s.id === 'step-08') {
      let beatBlock = `## ${heading(s)}\n\n`;
      let beatCount = 0;
      for (const beat of methodBeats) {
        const n = String(beat.n).padStart(2, '0');
        const v = (data['b' + n] || '').toString().trim();
        if (v) { beatBlock += `**${n} · ${beat.label}:** ${v}\n\n`; beatCount++; }
      }
      if (beatCount > 0) out += beatBlock + '\n';
    }

    // Step 10 — setups paired with their payoffs.
    if (s.id === 'step-10') {
      let spBlock = `## ${heading(s)}\n\n`;
      let spCount = 0;
      for (let i = 1; i <= 5; i++) {
        const su = (data['s10_setup_' + i] || '').toString().trim();
        const pa = (data['s10_pay_' + i] || '').toString().trim();
        if (su || pa) { spBlock += `**${i}.** Setup: ${su || '—'} → Payoff: ${pa || '—'}\n\n`; spCount++; }
      }
      if (spCount > 0) out += spBlock + '\n';
    }

    // Step 11 — the scene list table.
    if (s.id === 'step-11') {
      let scenes = '';
      Object.keys(data).filter(k => k.match(/^sl_\d+_slug/)).forEach(k => {
        const idx = k.match(/sl_(\d+)/)[1];
        const slug = data[`sl_${idx}_slug`] || '';
        const pov = data[`sl_${idx}_pov`] || '';
        const want = data[`sl_${idx}_want`] || '';
        const conf = data[`sl_${idx}_conf`] || '';
        const charge = data[`sl_${idx}_charge`] || '';
        if (slug || pov || want || conf) {
          const chMap = { pos: '+→−', neg: '−→+', 'dbl-pos': '+→++', 'dbl-neg': '−→−−' };
          scenes += `**Sc${idx}** | ${slug} | POV: ${pov} | Want: ${want} | Conflict: ${conf} | ${chMap[charge] || ''}\n`;
        }
      });
      if (scenes) out += `## ${heading(s)}\n\n${scenes}\n\n`;
    }

    // Step 20 — the cast list table.
    if (s.id === 'step-20') {
      let cast = '';
      Object.keys(data).filter(k => k.match(/^cast_\d+_role/)).forEach(k => {
        const idx = k.match(/cast_(\d+)/)[1];
        const role = data[`cast_${idx}_role`] || '';
        const actor = data[`cast_${idx}_actor`] || '';
        const status = data[`cast_${idx}_status`] || '';
        if (role || actor) cast += `- **${role}** — ${actor} (${status})\n`;
      });
      if (cast) out += `## ${heading(s)}\n\n${cast}\n\n`;
    }

    // Step 21 — the location list table.
    if (s.id === 'step-21') {
      let locs = '';
      Object.keys(data).filter(k => k.match(/^loc_\d+_name/)).forEach(k => {
        const idx = k.match(/loc_(\d+)/)[1];
        const sc = data[`loc_${idx}_scene`] || '';
        const name = data[`loc_${idx}_name`] || '';
        const type = data[`loc_${idx}_type`] || '';
        const permit = data[`loc_${idx}_permit`] || '';
        if (name) locs += `- Sc${sc}: **${name}** | ${type} | Permit: ${permit}\n`;
      });
      if (locs) out += `## ${heading(s)}\n\n${locs}\n\n`;
    }

    return out;
  };

  /* One heading per part, in part order. This used to stop at the
     end of Volume II, so a Markdown export silently left out steps
     25–32 — the whole shoot and post. */
  parts.forEach((p, i) => {
    md += (i ? `\n---\n\n` : '') + `# ${partHeading(p.part)}\n\n`;
    for (const s of p.steps) md += renderStepBlock(s);
  });

  md += `\n---\n*Generated from The Filmmaker's Blueprint · ${brandName}*\n`;
  return md;
}

/* ---- pitch deck ------------------------------------------------- */

/** The ten slides from the page's trimmed field values. */
export function buildPitchSlides(d) {
  const fallback = (v, def) => v && v.length ? v : def;
  const beats = [];
  for (let i = 1; i <= 15; i++) {
    const k = 'b' + (i < 10 ? '0' + i : i);
    if (d[k]) beats.push((i < 10 ? '0' + i : i) + ' · ' + d[k]);
  }
  const slides = [
    {
      label: 'Slide 01 · title',
      title: fallback(d.meta_title, 'Untitled'),
      body: fallback(d.s2_log_final, fallback(d.s2_log2, fallback(d.s2_log1, 'Logline pending'))),
      footer: fallback(d.meta_writer, 'Writer / Director')
    },
    {
      label: 'Slide 02 · what if',
      title: 'What if?',
      body: fallback(d.s1_whatif, 'Define your spark in Step 01.'),
      footer: 'The spark'
    },
    {
      label: 'Slide 03 · theme & stakes',
      title: fallback(d.s3_theme, 'Theme pending'),
      bullets: [
        'External — ' + fallback(d.s3_ext, '?'),
        'Internal — ' + fallback(d.s3_int, '?'),
        'Philosophical — ' + fallback(d.s3_phil, '?')
      ],
      footer: 'What the film argues'
    },
    {
      label: 'Slide 04 · protagonist',
      title: fallback(d.s4_name, 'Protagonist'),
      bullets: [
        'Want — ' + fallback(d.s4_want, '?'),
        'Need — ' + fallback(d.s4_need, '?'),
        'Wound — ' + fallback(d.s4_wound, '?'),
        'Arc — ' + fallback(d.s4_arc, '?')
      ],
      footer: 'Our hero'
    },
    {
      label: 'Slide 05 · antagonist',
      title: fallback(d.s5_name, 'Antagonist'),
      bullets: [
        'Want — ' + fallback(d.s5_want, '?'),
        'Philosophy — ' + fallback(d.s5_philosophy, '?'),
        'Hero in his own story — ' + fallback(d.s5_hero, '?')
      ],
      footer: 'The opposition'
    },
    {
      label: 'Slide 06 · world & tone',
      title: 'The world.',
      bullets: [
        'Genre — ' + fallback(d.v1_genre, '?'),
        'Era — ' + fallback(d.s7_era, '?'),
        'Location — ' + fallback(d.s7_location, '?'),
        'Rules — ' + fallback(d.s7_rules, '?'),
        'Tone — ' + fallback(d.v2s2_tone1, '?') + (d.v2s2_tone2 ? ' (' + d.v2s2_tone2 + ')' : '')
      ],
      footer: 'Where we live'
    },
    {
      label: 'Slide 07 · references',
      title: 'Reference films.',
      body: fallback(d.v2s2_refs, 'Pick 2-3 reference films and one out-of-medium reference. See Step 14.'),
      bullets: d.v2s2_refuse ? ['Refuse — ' + d.v2s2_refuse] : [],
      footer: 'What we\'re not'
    },
    {
      label: 'Slide 08 · story',
      title: 'The 15-beat story.',
      bullets: beats.length ? beats.slice(0, 15) : ['Fill in your 15 beats in Step 08.'],
      footer: 'Structure'
    },
    {
      label: 'Slide 09 · production',
      title: 'Production overview.',
      bullets: [
        'Budget — ' + fallback(d.v2s11_total, '?'),
        'Shoot days — ' + fallback(d.v2s11_days, '?'),
        'Camera — ' + fallback(d.v2s5_camera, '?') + (d.v2s5_aspect ? ' · ' + d.v2s5_aspect : ''),
        'DOP — ' + fallback(d.v2s11_dop, '?'),
        'Production design — ' + fallback(d.v2s11_pd, '?'),
        'Editor — ' + fallback(d.v2s11_editor, '?'),
        'Composer — ' + fallback(d.v2s11_composer, '?')
      ],
      footer: 'The plan'
    },
    {
      label: 'Slide 10 · director',
      title: 'The director.',
      body: fallback(d.s1_why_me, 'Why this film, told by you, now? Fill in Step 01.'),
      footer: fallback(d.meta_writer, '—') + (d.v2s11_dop ? ' · DOP ' + d.v2s11_dop : '')
    }
  ];
  return slides;
}

/** One slide as the deck's HTML; every user string escaped. */
export function slideToHTML(s) {
  const isEmpty = !s.body && (!s.bullets || s.bullets.length === 0);
  return `
      <div class="pitch-slide${isEmpty ? ' empty' : ''}">
        <div>
          <span class="slide-num">${esc(s.label.split('·')[0].trim())}</span>
          <div class="slide-label">${esc(s.label)}</div>
          <h3>${escapeHTML(s.title || '')}</h3>
          ${s.body ? `<p>${escapeHTML(s.body)}</p>` : ''}
          ${s.bullets && s.bullets.length ? `<ul>${s.bullets.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="footer">${escapeHTML(s.footer || '')}</div>
      </div>
    `;
}

/** The deck as a pptxgenjs presentation, and the file name to write
    it under. `PptxGenJS` is the library's constructor (the page loads
    it lazily); writing the file is left to the caller. */
export function buildPitchPptx(PptxGenJS, data, slides, brandName) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = data.meta_title || 'Filmmaker Blueprint Pitch';
  pres.author = data.meta_writer || brandName;
  const INK = '1A1815', GOLD = 'A87A32', PAPER = 'F5ECD6';

  slides.forEach((s) => {
    const slide = pres.addSlide();
    slide.background = { color: INK };
    // Slide number top-right
    slide.addText(s.label, {
      x: 8.0, y: 0.3, w: 5.0, h: 0.4,
      fontSize: 9, fontFace: 'Courier New',
      color: GOLD, align: 'right', charSpacing: 2
    });
    // Label / heading
    slide.addText(s.label.split('·').slice(1).join('·').trim() || s.label, {
      x: 0.7, y: 0.7, w: 11, h: 0.4,
      fontSize: 10, fontFace: 'Courier New',
      color: GOLD, charSpacing: 3, bold: true
    });
    // Title
    slide.addText(s.title || '', {
      x: 0.7, y: 1.3, w: 11, h: 1.2,
      fontSize: 32, fontFace: 'Arial',
      color: PAPER, italic: true, bold: true
    });
    // Body or bullets
    let yCursor = 2.7;
    if (s.body) {
      slide.addText(s.body, {
        x: 0.7, y: yCursor, w: 11, h: 1.5,
        fontSize: 16, fontFace: 'Arial',
        color: PAPER
      });
      yCursor += 1.5;
    }
    if (s.bullets && s.bullets.length) {
      slide.addText(
        s.bullets.map(b => ({ text: b, options: { bullet: { code: '2014' }, color: PAPER, fontSize: 14, fontFace: 'Arial' } })),
        { x: 0.7, y: yCursor, w: 11, h: 4 }
      );
    }
    // Footer
    slide.addText(s.footer || '', {
      x: 0.7, y: 6.8, w: 11, h: 0.4,
      fontSize: 9, fontFace: 'Courier New',
      color: GOLD, charSpacing: 2
    });
    // Gold accent bar
    slide.addShape('rect', { x: 0, y: 0, w: 0.15, h: 7.5, fill: { color: GOLD } });
  });

  return { pres, fileName: (data.meta_title || 'pitch') + '-deck.pptx' };
}
