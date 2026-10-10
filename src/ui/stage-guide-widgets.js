/* ============================================================
   THE STAGE GUIDE'S WIDGETS — the parts of a blueprint step that
   are more than a field
   ------------------------------------------------------------
   The guide drawer (src/ui/blueprint-drawer.js) leaves these on the
   blueprint: the short's scene map and script editor (arrays the
   short page owns whole), and the derived views the feature page
   draws from its fields — pacing chart, character map, scene charge
   timeline, budget bar. The stage guide is the blueprint now, so
   they are ported here, each as a small renderer that the step
   renderer is handed (renderStep's third argument).

   WHAT IS PORTED, AND HOW IT STAYS SAFE
   - Scene map (short step 06) and script editor (short step 07):
     the SAME array shapes short.js stores, in the same blob —
       _sceneMap: [{ slug, who, what, beat, pages }]
       _script:   [{ slug, action, dialogues: [{ character,
                      parenthetical, line }] }]
     written ONLY by these widgets, ONLY after the person edits, and
     only as the whole array (that is what those keys are). The
     field order of each row is short.js's DOM order, so a round trip
     through here and through short.js is byte-identical
     (scripts/test-stage-guide.mjs asserts it).
   - A short project whose scene map still sits in the old flat
     `sm_<n>_<field>` keys is NOT editable here: short.js lifts those
     into rows on its next load, and writing `_sceneMap` first would
     orphan them. The widget says so and links to the blueprint.
   - Pacing, character map, timeline, palette swatches, budget bar,
     the short's beat dots and page counter are DERIVED: they read
     the fields and store nothing. They are redrawn after a render
     and after an input — never from a save, so they cannot start a
     save loop.
   - Left on the blueprint, with a link and no editing: the short's
     step 08 (formatted preview, AI prompt, Fountain/TXT export, print)
     and the festival tracker (its own key, fms_festivals_v1). The
     report says so.
   ============================================================ */
import { h } from '../lib/dom.js';
import { parseNum, fmtINR } from '../lib/money.js';
import shortData from '../data/steps.short.json';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_SCENE_ROWS = 5;      /* short.js */
const MIN_SCRIPT_SCENES = 1;   /* short.js */
const WORDS_PER_PAGE = 210;    /* short.js */
export const SCENE_FIELDS = ['slug', 'who', 'what', 'beat', 'pages'];
export const SCENE_BEATS = ['Setup', 'Disturb', 'Escalate', 'Turn', 'Image'];

const BLUEPRINT_PAGE = { feature: 'feature.html', production: 'feature.html', short: 'short.html' };

/** The sentence-and-link a widget shows where the full blueprint is
 *  the right place to do the work. */
export function fullGuideLink(ns, id, text) {
  return h('p.sg-note', {}, [
    text + ' ',
    h('a', { href: BLUEPRINT_PAGE[ns] + '#' + id, text: 'Open this in the full guide →' })
  ]);
}

/* ---- the treatment ladder (an interlude: five fields, no number) -----
   Copied from LADDER_HTML in src/pages/feature.js; the test reads that
   file and fails if a key here is gone from it. */
export const LADDER = [
  { key: 'lad_1_logline', title: 'Rung 1 — The Logline', target: '5 – 30 words · already done in Step 02', rows: 2,
    placeholder: 'Paste your locked logline from Step 02 here, or refine it.',
    hint: 'If you can’t fit it in one sentence, you don’t yet know what your film is.' },
  { key: 'lad_2_synopsis', title: 'Rung 2 — One-Paragraph Synopsis', target: '100 – 150 words · the elevator pitch', rows: 6,
    placeholder: 'Expand the logline into a paragraph. Setup, inciting incident, escalation, climax direction.',
    hint: 'A producer reads this in 30 seconds. If they’re not reaching for the next page, fix this paragraph.' },
  { key: 'lad_3_onepager', title: 'Rung 3 — One-Pager', target: '~ 400 – 500 words · one printed page', rows: 14,
    placeholder: 'A single page: protagonist, antagonist, world, inciting incident, midpoint, climax direction, final image.',
    hint: 'This is the document you send to a star’s manager when they ask what it’s about. Polish accordingly.' },
  { key: 'lad_4_treatment', title: 'Rung 4 — The Treatment', target: '5 – 12 pages · prose narrative of the whole film', rows: 16,
    placeholder: 'Tell the whole film in prose, scene-block by scene-block, in present tense. No scene headings or screenplay format yet.',
    hint: 'If you can write a great treatment, you can write a great script.' },
  { key: 'lad_5_outline', title: 'Rung 5 — Step Outline', target: '15 – 40 numbered scenes · the bridge to script', rows: 14,
    placeholder: 'Number each scene. One line per scene: SLUG — what happens — why it’s there.',
    hint: 'When you can read your step outline aloud and feel the film’s shape, that is when you start writing pages.' }
];

export function interludeSection(item) {
  if (item.id === 'treatment-ladder') {
    return h('section.step.sg-interlude', { id: 'treatment-ladder' }, [
      h('div.step-header', {}, [
        h('div.step-title', { html: 'The <em>Treatment Ladder.</em>' })
      ]),
      h('p.step-deck', { text: 'Five rungs from one sentence to a step outline. Each rung is a real document with a target length. Build them in order, and the script writes itself.' }),
      h('div.ladder-rungs', {}, LADDER.map((r) => h('div.ladder-rung', {}, [
        h('h4', { text: r.title }),
        h('div.target', { text: r.target }),
        h('textarea', { 'data-key': r.key, rows: String(r.rows), placeholder: r.placeholder, 'aria-label': r.title }),
        h('p.hint', { text: r.hint })
      ])))
    ]);
  }
  if (item.id === 'write-the-draft') {
    return h('section.step.sg-interlude', { id: 'write-the-draft' }, [
      h('div.step-header', {}, [h('div.step-title', { html: 'Write <em>the draft.</em>' })]),
      h('p.step-deck', { text: 'This is the step the guide cannot do for you. The screenplay is written in Write — formatted as you type, and read by the breakdown, the stripboard and the budget as soon as a scene heading exists.' }),
      h('p', {}, [h('a.btn', { href: 'write.html', text: 'Open Write →' })])
    ]);
  }
  return null;
}

/* ---- block classification ------------------------------------------
   Which `raw` blocks the guide draws itself, which it drops, and which
   it leaves to the shared renderer. Returns a copy of the step. */
export function classify(step, ns) {
  let noted = false;
  const blocks = (step.blocks || []).map((b) => {
    if (b.type === 'festgrid') return { type: 'sg', kind: 'fest', step: step.id };
    if (b.type !== 'raw') return b;
    const html = String(b.html || '');
    if (/id="sceneMapBody"/.test(html)) return { type: 'sg', kind: 'scenemap' };
    if (/addSceneMapRow/.test(html)) return { type: 'sg', kind: 'none' };
    if (/id="scriptEditor"/.test(html)) return { type: 'sg', kind: 'script' };
    if (/class="row-actions"/.test(html) && /onclick=/.test(html)) return { type: 'sg', kind: 'none' };
    if (/id="aiPrompt"|id="scriptPreview"|FORMATTED PREVIEW|exportFountain/.test(html)) {
      if (noted) return { type: 'sg', kind: 'none' };
      noted = true;
      return { type: 'sg', kind: 'preview', step: step.id };
    }
    return b;
  });
  return { ...step, blocks };
}

/** The renderers for renderStep's third argument. `ctx` is the guide
 *  instance: { queue(key, valueOrThunk), register(widget) }. */
export function extraRenderers(ctx, ns) {
  return {
    beatviz: () => beatViz(),
    sg: (b) => {
      if (b.kind === 'none') return document.createDocumentFragment();
      if (b.kind === 'scenemap') return sceneMapWidget(ctx);
      if (b.kind === 'script') return scriptWidget(ctx);
      if (b.kind === 'preview') {
        return fullGuideLink('short', b.step,
          'The formatted preview, the AI prompt builder, the Fountain and text downloads and print are in the full Short Film guide.');
      }
      if (b.kind === 'fest') {
        return fullGuideLink('short', b.step,
          'The festival catalogue and your submission tracker (kept under their own key) are in the full Short Film guide.');
      }
      return document.createDocumentFragment();
    }
  };
}

/* ---- the short's five-beat shape (a view of steps.short.json `beats`) ---- */
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
};

function beatViz() {
  const BEATS = shortData.beats;
  const W = 800, H = 200, AXIS_Y = 100;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`, xmlns: SVG_NS, role: 'img',
    'aria-label': `The ${BEATS.length}-beat shape of a short film: ` + BEATS.map((b) => `${b.num} ${b.name}`).join(', ')
  });
  svg.append(svgEl('line', { x1: 0, y1: AXIS_Y, x2: W, y2: AXIS_Y, class: 'beat-axis' }));
  const dots = BEATS.map((b) => [b.svg.dotX, b.svg.dotY]);
  const pts = [[0, dots[0][1]], ...dots, [W, dots[dots.length - 1][1]]];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  d += ` L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
  svg.append(svgEl('path', { class: 'beat-line', d }));
  for (const b of BEATS) {
    svg.append(svgEl('circle', { class: 'beat-dot', cx: b.svg.dotX, cy: b.svg.dotY, r: 5, 'data-beat-key': b.key }));
    const label = svgEl('text', { class: 'beat-label', x: b.svg.labelX, y: b.svg.labelY, 'text-anchor': 'middle' });
    label.textContent = b.svg.label;
    svg.append(label);
  }
  return h('div.beat-viz', {}, [svg]);
}

/* ---- the short's scene map (_sceneMap) ------------------------------- */
function sceneMapRow(prefill) {
  const d = prefill || {};
  const tr = document.createElement('tr');
  const cell = (el) => { const td = document.createElement('td'); td.append(el); return td; };
  const num = document.createElement('td'); num.className = 'num'; num.textContent = '01';
  const slug = h('input', { type: 'text', 'data-field': 'slug', 'aria-label': 'Slug line', placeholder: 'INT. APARTMENT - DAY' });
  const who = h('input', { type: 'text', 'data-field': 'who', 'aria-label': 'Who is in the scene', placeholder: 'Ravi, Maya' });
  const what = h('textarea', { 'data-field': 'what', 'aria-label': 'What happens', placeholder: 'What happens. End on a different value than start.' });
  const beat = h('select', { 'data-field': 'beat', 'aria-label': 'Beat' }, [
    h('option', { value: '', text: '—' }),
    ...SCENE_BEATS.map((b) => h('option', { text: b }))
  ]);
  const pages = h('input', { type: 'text', 'data-field': 'pages', 'aria-label': 'Pages', placeholder: '0.5', style: 'width:60px;' });
  slug.value = d.slug || ''; who.value = d.who || ''; what.value = d.what || '';
  beat.value = d.beat || ''; pages.value = d.pages || '';
  const ctrl = document.createElement('td'); ctrl.className = 'row-ctrl';
  ctrl.append(
    h('button.row-ctrl-btn', { type: 'button', 'data-sg': 'map-dup', title: 'Duplicate', 'aria-label': 'Duplicate this scene', text: '⎘' }),
    h('button.row-ctrl-btn.del', { type: 'button', 'data-sg': 'map-del', title: 'Delete', 'aria-label': 'Delete this scene', text: '✕' })
  );
  tr.append(num, cell(slug), cell(who), cell(what), cell(beat), cell(pages), ctrl);
  return tr;
}

/** The row object short.js's rowValues() builds: [data-field] in DOM order. */
function rowValues(tr) {
  const row = {};
  tr.querySelectorAll('[data-field]').forEach((el) => { row[el.getAttribute('data-field')] = el.value; });
  return row;
}

export function sceneMapWidget(ctx) {
  const wrap = h('div.sg-widget.sg-scenemap');
  const tbody = document.createElement('tbody');
  const table = h('table.scene-table', {}, [
    h('thead', {}, [h('tr', {}, ['#', 'Slug (INT./EXT. — Place — Time)', 'Who', 'What happens', 'Beat', 'Pages', '']
      .map((t) => h('th', { text: t })))]),
    tbody
  ]);
  const actions = h('div.sg-table-actions', {}, [
    h('button.btn.primary', { type: 'button', 'data-sg': 'map-add', 'data-n': '1', text: '+ ADD SCENE' }),
    h('button.btn', { type: 'button', 'data-sg': 'map-add', 'data-n': '3', text: '+ ADD 3' })
  ]);
  const locked = h('p.sg-note', { hidden: true }, [
    'This scene map is still in an older format that the Short Film blueprint upgrades the next time it opens. ',
    h('a', { href: 'short.html#step-06', text: 'Open it there first →' })
  ]);
  wrap.append(h('div.sg-table', {}, [table]), actions, locked);

  const renumber = () => tbody.querySelectorAll('tr').forEach((tr, i) => {
    const c = tr.querySelector('td.num'); if (c) c.textContent = String(i + 1).padStart(2, '0');
  });
  const collect = () => [...tbody.querySelectorAll('tr')].map(rowValues);
  const save = () => ctx.queue('_sceneMap', collect);

  const w = {
    el: wrap,
    key: '_sceneMap',
    collect,
    hasFocus: () => wrap.contains(document.activeElement),
    load(blob) {
      const flat = Object.keys(blob).some((k) => /^sm_\d+_/.test(k));
      const rows = Array.isArray(blob._sceneMap) ? blob._sceneMap : [];
      const lock = flat && !rows.length;
      table.hidden = actions.hidden = lock;
      locked.hidden = !lock;
      tbody.replaceChildren();
      if (lock) return;
      rows.forEach((r) => tbody.append(sceneMapRow(r)));
      while (tbody.children.length < (rows.length ? 1 : MIN_SCENE_ROWS)) tbody.append(sceneMapRow());
      renumber();
    }
  };

  wrap.addEventListener('input', (e) => { if (e.target.closest('[data-field]')) { save(); ctx.refresh(); } });
  wrap.addEventListener('change', (e) => { if (e.target.closest('[data-field]')) { save(); ctx.refresh(); } });
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sg]');
    if (!btn || !wrap.contains(btn)) return;
    const act = btn.getAttribute('data-sg');
    if (act === 'map-add') {
      const n = parseInt(btn.getAttribute('data-n'), 10) || 1;
      for (let i = 0; i < n; i++) tbody.append(sceneMapRow());
      renumber();
      /* Adding a blank row writes nothing; the row is saved with the
         first thing typed into it, like every other empty field. */
    } else if (act === 'map-dup') {
      const tr = btn.closest('tr');
      tr.after(sceneMapRow(rowValues(tr)));
      renumber(); save(); ctx.refresh();
    } else if (act === 'map-del') {
      if (!confirm('Delete this scene from the map?')) return;
      btn.closest('tr').remove();
      renumber(); save(); ctx.refresh();
    }
  });
  ctx.register(w);
  return wrap;
}

/* ---- the short's script editor (_script) ------------------------------ */
function dialogueBlock(prefill) {
  const d = prefill || {};
  const character = h('input', { type: 'text', class: 'character', 'aria-label': 'Character name', placeholder: 'CHARACTER NAME' });
  const line = h('textarea', { class: 'line', 'aria-label': 'Dialogue line', placeholder: 'The dialogue line.' });
  const paren = h('input', { type: 'text', class: 'parenthetical', 'aria-label': 'Parenthetical', placeholder: '(parenthetical, optional — e.g. whispering, off-screen)' });
  character.value = d.character || ''; line.value = d.line || ''; paren.value = d.parenthetical || '';
  return h('div.dialogue-block', {}, [
    h('div.dlg-row', {}, [
      character, line,
      h('button.row-ctrl-btn.del', { type: 'button', 'data-sg': 'script-del-dlg', title: 'Delete', 'aria-label': 'Delete this dialogue', text: '✕' })
    ]),
    h('div.paren', {}, [paren])
  ]);
}

function sceneBlock(prefill) {
  const d = prefill || { slug: '', action: '', dialogues: [] };
  const slug = h('input', { type: 'text', class: 'slug', 'aria-label': 'Slug line', placeholder: 'INT. APARTMENT - DAY' });
  const action = h('textarea', { class: 'action', 'aria-label': 'Action', placeholder: 'Describe what happens. Present tense. Third person. No camera directions unless essential.' });
  slug.value = d.slug || ''; action.value = d.action || '';
  const dialogues = h('div.dialogues');
  (Array.isArray(d.dialogues) ? d.dialogues : []).forEach((x) => dialogues.append(dialogueBlock(x)));
  return h('div.scene-block', {}, [
    h('div.scene-header', {}, [
      h('span.scene-tag', { text: 'SCENE 01' }), slug,
      h('button.row-ctrl-btn.del', { type: 'button', 'data-sg': 'script-del-scene', title: 'Delete this scene', 'aria-label': 'Delete this scene', text: '✕' })
    ]),
    h('span.action-label', { text: 'ACTION' }),
    action, dialogues,
    h('button.add-dialogue-btn', { type: 'button', 'data-sg': 'script-add-dlg', text: '+ ADD DIALOGUE' })
  ]);
}

/** The scene objects short.js's collectScriptData() builds. */
export function collectScript(scenesEl) {
  const scenes = [];
  scenesEl.querySelectorAll('.scene-block').forEach((block) => {
    const slug = block.querySelector('input.slug').value || '';
    const action = block.querySelector('textarea.action').value || '';
    const dialogues = [];
    block.querySelectorAll('.dialogue-block').forEach((d) => {
      dialogues.push({
        character: d.querySelector('input.character').value || '',
        parenthetical: d.querySelector('input.parenthetical').value || '',
        line: d.querySelector('textarea.line').value || ''
      });
    });
    scenes.push({ slug, action, dialogues });
  });
  return scenes;
}

export function scriptWidget(ctx) {
  const scenesEl = h('div.sg-script-scenes');
  const wrap = h('div.script-editor.sg-widget', {}, [
    scenesEl,
    h('button.add-scene-btn', { type: 'button', 'data-sg': 'script-add-scene', text: '+ ADD SCENE' }),
    h('div.editor-actions', {}, [
      h('button.mini-btn.danger', { type: 'button', 'data-sg': 'script-clear', text: 'CLEAR SCRIPT' })
    ]),
    fullGuideLink('short', 'step-08', 'The formatted preview and the Fountain / text exports are in the full guide.')
  ]);
  const renumber = () => scenesEl.querySelectorAll('.scene-block').forEach((b, i) => {
    const t = b.querySelector('.scene-tag'); if (t) t.textContent = 'SCENE ' + String(i + 1).padStart(2, '0');
  });
  const save = () => ctx.queue('_script', () => collectScript(scenesEl));
  const w = {
    el: wrap,
    key: '_script',
    collect: () => collectScript(scenesEl),
    hasFocus: () => wrap.contains(document.activeElement),
    load(blob) {
      const scenes = Array.isArray(blob._script) ? blob._script : [];
      scenesEl.replaceChildren();
      scenes.forEach((s) => scenesEl.append(sceneBlock(s)));
      for (let i = scenesEl.children.length; i < MIN_SCRIPT_SCENES; i++) scenesEl.append(sceneBlock());
      renumber();
    }
  };
  wrap.addEventListener('input', (e) => { if (e.target.closest('.scene-block')) { save(); ctx.refresh(); } });
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sg]');
    if (!btn || !wrap.contains(btn)) return;
    const act = btn.getAttribute('data-sg');
    if (act === 'script-add-scene') { scenesEl.append(sceneBlock()); renumber(); }
    else if (act === 'script-add-dlg') { btn.closest('.scene-block').querySelector('.dialogues').append(dialogueBlock()); }
    else if (act === 'script-del-dlg') { btn.closest('.dialogue-block').remove(); save(); ctx.refresh(); }
    else if (act === 'script-del-scene') {
      if (!confirm('Delete this whole scene from the script?')) return;
      btn.closest('.scene-block').remove(); renumber(); save(); ctx.refresh();
    } else if (act === 'script-clear') {
      if (!confirm('Clear ALL scenes from the script? This cannot be undone unless you exported JSON.')) return;
      scenesEl.replaceChildren(sceneBlock()); renumber(); save(); ctx.refresh();
    }
  });
  ctx.register(w);
  return wrap;
}

/* ---- derived views ------------------------------------------------------
   Read fields, draw, store nothing. `q(id)` finds an element by the id it
   had on the blueprint (the guide renames ids to keep the page's own
   unique); `get(key)` is the field's current value. */
const num = (n) => String(n);
const escapeText = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const PACING = [
  ['01', 'Open', 30, 130, 1], ['02', 'Theme', 75, 110, 1], ['03', 'Setup', 125, 95, 1],
  ['04', 'Catlst', 175, 60, 1], ['05', 'Debate', 220, 80, 1], ['06', 'Brk II', 265, 50, 2],
  ['07', 'B Sty', 305, 70, 2], ['08', 'Fun', 350, 90, 2], ['09', 'Mid', 395, 50, 2],
  ['10', 'Close', 440, 70, 2], ['11', 'Lost', 485, 30, 2], ['12', 'Dark', 530, 100, 2],
  ['13', 'Brk III', 580, 60, 3], ['14', 'Final', 635, 25, 3], ['15', 'Img', 690, 130, 3]
];

function drawPacing(q, get) {
  const svg = q('pacingSvg');
  if (!svg) return;
  let s = '';
  s += '<line class="act-divider" x1="240" y1="20" x2="240" y2="170"/>';
  s += '<line class="act-divider" x1="555" y1="20" x2="555" y2="170"/>';
  s += '<text class="act-label" x="125" y="190" text-anchor="middle">ACT I</text>';
  s += '<text class="act-label" x="395" y="190" text-anchor="middle">ACT II</text>';
  s += '<text class="act-label" x="635" y="190" text-anchor="middle">ACT III</text>';
  s += '<path class="arc-line" d="' + PACING.map((b, i) => (i === 0 ? 'M' : 'L') + ' ' + b[2] + ' ' + b[3]).join(' ') + '"/>';
  let filled = 0; const act = { 1: 0, 2: 0, 3: 0 };
  for (const [n, label, x, y, a] of PACING) {
    const on = String(get('b' + n) || '').trim();
    s += `<circle class="beat-dot${on ? ' filled' : ''}" cx="${x}" cy="${y}" r="14"/>`;
    s += `<text class="beat-num${on ? ' filled' : ''}" x="${x}" y="${y + 4}">${n}</text>`;
    s += `<text class="beat-label" x="${x}" y="${y + 30}">${label}</text>`;
    if (on) { filled++; act[a]++; }
  }
  svg.innerHTML = s;
  const set = (id, v) => { const el = q(id); if (el) el.textContent = v; };
  set('pacingFilled', num(filled));
  set('pacingAct1', act[1] + '/3'); set('pacingAct2', act[2] + '/8'); set('pacingAct3', act[3] + '/4');
}

function drawCharMap(q, get) {
  const svg = q('charMapSvg');
  if (!svg) return;
  const t = (k) => String(get(k) || '').trim();
  const cx = 360, cy = 180;
  const pos = {
    protagonist: { x: cx, y: cy, name: t('s4_name'), label: 'PROTAGONIST', conn: 'Story · Step 4' },
    antagonist: { x: cx + 240, y: cy, name: t('s5_name'), label: 'ANTAGONIST', conn: 'opposes' },
    ally: { x: cx - 240, y: cy - 90, name: t('s6_ally_name'), label: 'ALLY', conn: 'reflects' },
    lover: { x: cx - 240, y: cy + 90, name: t('s6_lover_name'), label: 'LOVE / MIRROR', conn: 'pulls toward need' },
    mentor: { x: cx, y: cy - 130, name: t('s6_mentor_name'), label: 'MENTOR / CATALYST', conn: 'hands over tool' }
  };
  let s = '';
  for (const key of Object.keys(pos)) {
    if (key === 'protagonist') continue;
    const p = pos[key];
    s += `<line class="${p.name ? 'conn-line solid' : 'conn-line'}" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`;
    s += `<text class="conn-label" x="${(cx + p.x) / 2}" y="${(cy + p.y) / 2 - 6}">${p.conn}</text>`;
  }
  for (const key of Object.keys(pos)) {
    const p = pos[key];
    const r = key === 'protagonist' ? 50 : 42;
    let cls = 'char-circle';
    if (key === 'protagonist') cls += ' protagonist'; else if (key === 'antagonist') cls += ' antagonist';
    if (!p.name) cls += ' empty';
    s += `<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="${r}"/>`;
    s += `<text class="char-role" x="${p.x}" y="${p.y - 6}">${p.label}</text>`;
    const nameCls = p.name ? (key === 'protagonist' ? 'char-name protagonist' : 'char-name') : 'char-name empty';
    const shown = p.name ? (p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name) : '— empty —';
    s += `<text class="${nameCls}" x="${p.x}" y="${p.y + 16}">${escapeText(shown)}</text>`;
  }
  svg.innerHTML = s;
}

function drawBudget(q, get) {
  const totalEl = q('budgetTotal'), barEl = q('budgetBar');
  if (!totalEl || !barEl) return;
  const amt = (k) => parseNum(get(k) || '');
  const atl = amt('v2s11_atl'), btl = amt('v2s11_btl'), post = amt('v2s11_post');
  const direct = amt('v2s11_total');
  const m = String(get('v2s11_cont') || '').match(/(\d+(?:\.\d+)?)\s*%/);
  const contPct = m ? parseFloat(m[1]) : 0;
  const sub = atl + btl + post;
  const cont = sub * contPct / 100;
  const computed = sub + cont;
  const total = computed > 0 ? computed : direct;
  const fmt = (n) => (n ? fmtINR(n) : '—');
  if (total === 0) { totalEl.innerHTML = '— <span>(fill numbers above)</span>'; barEl.innerHTML = ''; return; }
  totalEl.innerHTML = fmt(total) + ' <span>total</span>';
  const denom = atl + btl + post + cont;
  if (denom <= 0) { barEl.innerHTML = ''; return; }
  const seg = (cls, v, label) =>
    `<div class="budget-bar-seg ${cls}" style="width:${(v / denom * 100).toFixed(1)}%" title="${label}: ${fmt(v)}"></div>`;
  barEl.innerHTML = seg('atl', atl, 'ATL') + seg('btl', btl, 'BTL') + seg('post', post, 'Post') + seg('cont', cont, 'Contingency');
}

function drawTimeline(root, q) {
  const wrap = q('sceneChart');
  if (!wrap) return;
  const body = root.querySelector('[data-sg-id="sceneListBody"]');
  if (!body) return;
  const rows = [...body.querySelectorAll('tr')];
  let total = 0, charged = 0, flips = 0, lastSign = 0, run = 0, maxRun = 0, html = '';
  rows.forEach((row, i) => {
    const has = [...row.querySelectorAll('input, textarea, select')].some((el) => el.value && el.value.trim());
    if (!has && i > 7) return;
    total++;
    const sel = row.querySelector('select[data-key$="_charge"]');
    const ch = sel ? sel.value : '';
    let cls = 'scene-bar flat', sign = 0, hgt = 0;
    if (ch === 'pos') { cls = 'scene-bar pos'; sign = 1; hgt = 35; charged++; }
    else if (ch === 'dbl-pos') { cls = 'scene-bar dbl-pos'; sign = 1; hgt = 50; charged++; }
    else if (ch === 'neg') { cls = 'scene-bar neg'; sign = -1; hgt = 35; charged++; }
    else if (ch === 'dbl-neg') { cls = 'scene-bar dbl-neg'; sign = -1; hgt = 50; charged++; }
    if (sign !== 0) {
      if (lastSign !== 0 && sign !== lastSign) flips++;
      run = sign === lastSign ? run + 1 : 1;
      if (run > maxRun) maxRun = run;
      lastSign = sign;
    } else { lastSign = 0; run = 0; }
    html += `<div class="${cls}"><div class="seg" ${hgt > 0 ? `style="height:${hgt}%;"` : ''}></div><span class="num">${String(i + 1).padStart(2, '0')}</span></div>`;
  });
  wrap.innerHTML = html;
  const set = (id, v) => { const el = q(id); if (el) el.textContent = v; };
  set('sceneTotal', num(total)); set('sceneCharged', num(charged)); set('sceneFlips', num(flips));
  set('sceneRun', maxRun > 0 ? maxRun + ' scene' + (maxRun > 1 ? 's' : '') : '—');
}

function drawPalette(root, q, get) {
  const c = [get('palette_c1') || '#b03a1f', get('palette_c2') || '#a87a32', get('palette_c3') || '#1f5d4a'];
  ['sw1', 'sw2', 'sw3'].forEach((id, i) => { const el = q(id); if (el) el.style.background = c[i]; });
  /* The hex mirrors are display: set .value (no event, no write). */
  [1, 2, 3].forEach((n) => {
    const el = root.querySelector(`[data-key="palette_c${n}_hex"]`);
    if (el) el.value = c[n - 1];
  });
  const bar = q('paletteBar');
  if (bar) bar.innerHTML = c.map((x) => `<div style="background:${x};"></div>`).join('');
}

function drawBeatDots(root, get) {
  root.querySelectorAll('.beat-viz .beat-dot[data-beat-key]').forEach((dot) => {
    dot.classList.toggle('filled', !!String(get(dot.getAttribute('data-beat-key')) || '').trim());
  });
}

function drawPageCounter(root, q, get) {
  const words = q('totalWords');
  if (!words) return;
  const scenesEl = root.querySelector('.sg-script-scenes');
  const scenes = scenesEl ? collectScript(scenesEl) : [];
  let n = 0;
  const wc = (s) => String(s).split(/\s+/).filter(Boolean).length;
  scenes.forEach((s) => {
    if (s.slug) n += wc(s.slug);
    if (s.action) n += wc(s.action);
    s.dialogues.forEach((d) => { if (d.character) n += 2; if (d.line) n += wc(d.line); });
  });
  const pages = Math.round((n / WORDS_PER_PAGE) * 10) / 10;
  const minutes = Math.floor(pages);
  const seconds = Math.round((pages - minutes) * 60);
  q('totalWords').textContent = n.toLocaleString();
  q('totalPages').textContent = pages.toFixed(1);
  q('totalRuntime').textContent = minutes + ':' + String(seconds).padStart(2, '0');
  const status = q('runtimeStatus');
  if (!status) return;
  const rt = String(get('meta_runtime') || '').match(/(\d+(?:\.\d+)?)/);
  const target = rt ? parseFloat(rt[1]) : null;
  if (target && pages > 0) {
    const diff = pages - target;
    if (Math.abs(diff) < 1) { status.textContent = 'on target'; status.className = 'pc-status ok'; }
    else if (diff > 0) { status.textContent = 'long by ' + diff.toFixed(1) + ' pages'; status.className = 'pc-status warn'; }
    else { status.textContent = 'short by ' + Math.abs(diff).toFixed(1) + ' pages'; status.className = 'pc-status warn'; }
  } else if (pages > 30) { status.textContent = 'feature territory'; status.className = 'pc-status warn'; }
  else { status.textContent = pages > 0 ? 'enter target runtime' : 'enter scenes below'; status.className = 'pc-status'; }
}

/** Redraw every derived view that is on the page. */
export function drawDerived(root, get) {
  const q = (id) => root.querySelector('[data-sg-id="' + id + '"]');
  drawPacing(q, get);
  drawCharMap(q, get);
  drawBudget(q, get);
  drawTimeline(root, q);
  drawPalette(root, q, get);
  drawBeatDots(root, get);
  drawPageCounter(root, q, get);
}

export default { LADDER, classify, extraRenderers, interludeSection, drawDerived, collectScript, sceneMapWidget, scriptWidget };
