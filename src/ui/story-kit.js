/* ============================================================
   STORY KIT — the Story page's tools, in the blueprints' Part I
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, revision 3, §3. The owner: "in
   blueprint space also there should be beats, import, export, same
   items as in the Story page, but in an ordered way". So Part I of
   the feature blueprint carries them in working order:

     1. the Part I cover   — the story path's progress, Continue,
                             the sample, Import a synopsis file;
     2. step 02 (Logline)  — the Idea Vault;
     3. step 08 (15 Beats) — each Save the Cat! beat's outline steps
                             and tagged passages, beside the
                             blueprint's own fields;
     4. after step 10      — the tension curve (read only) and the
                             exports: synopsis .txt, outline .md,
                             pitch deck PDF.
   and the short blueprint's step 04 gets panel 3 on `short_five`.

   ONE MODEL, NO SECOND COPY. Everything here reads and writes the
   story through src/lib/story.js (fms_story_v1) and the vault
   through its vault functions (fms_idea_vault_v1). The step-08 and
   step-04 fields stay the BLUEPRINT'S OWN: nothing here writes
   them, and nothing mirrors them into the story except one explicit
   click — "Start the Story synopsis from my 15 beats" — offered
   only while the story has no synopsis, add-only, with Undo.

   DERIVED AT RENDER TIME, STORED NOWHERE. Each panel is redrawn
   from the models when it mounts, when the tab is looked at again
   and when another tab writes the story; never on a timer. The
   idle-write assertion in verify is watching both blueprints.

   The import, the sample, the exports and the curve are the SAME
   functions story.html uses — src/lib/story-io.js, and renderHeat()
   / renderFlags() below, which story.js imports from here.
   ============================================================ */
import '../styles/story-heat.css';
import '../styles/story-kit.css';
import { h, delegate } from '../lib/dom.js';
import { BRAND } from '../lib/brand.js';
import * as Story from '../lib/story.js';
import IO from '../lib/story-io.js';
import Scenes from '../lib/scenes.js';
import Pitch from '../lib/pitch-deck.js';
import StudioUI from './chrome.js';

const pct = (x) => Math.round(x * 100) + '%';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const scenes = () => { try { return Scenes.listScenes(); } catch (e) { return []; } };
const words = (t) => (String(t || '').match(/\S+/g) || []).length;
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const STORY_HREF = 'story.html';

/* ============================================================
   THE CURVE — shared with story.html
   ============================================================ */

/** The tension heatmap as a figure, or null when there is nothing to
 *  draw. `interactive` (story.html) makes every bar a jump into the
 *  synopsis; the blueprint's copy is read only. */
export function renderHeat(s, { interactive = true } = {}) {
  const heat = Story.heatmap(s);
  const fig = h('figure.st-heat' + (interactive ? '' : '.is-static'));
  if (!heat.length) return null;
  const regions = Story.regionsOf(s.framework);
  const W = 1000, H = 140, pad = 6, n = heat.length, bw = W / n;
  const y = (t) => H - pad - ((t - 1) / 9) * (H - pad * 2);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'st-heat-svg');
  svg.setAttribute('role', 'img');
  const flags = Story.pacingFlags(s).filter((f) => f.kind === 'slack');
  svg.setAttribute('aria-label',
    `Tension across the story in ${n} slices, from ${Math.round(Math.min(...heat.map((w) => w.tension)))} to ` +
    `${Math.round(Math.max(...heat.map((w) => w.tension)))} out of 10. ` +
    (flags.length ? `${flags.length} slack stretch${flags.length === 1 ? '' : 'es'} flagged.` : 'No slack stretch flagged.'));
  const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  // Act dividers, recessive.
  for (const r of regions.slice(1)) {
    svg.append(el('line', { x1: r.from * W, x2: r.from * W, y1: 0, y2: H, class: 'st-heat-act' }));
  }
  // Slack stretches, behind the bars.
  for (const f of flags) {
    const a = heat.find((w) => w.from >= f.from) || heat[0];
    const b = [...heat].reverse().find((w) => w.to <= f.to) || heat[n - 1];
    svg.append(el('rect', { x: a.i * bw, y: 0, width: (b.i - a.i + 1) * bw, height: H, class: 'st-heat-slack' }));
  }
  // One bar per slice: one hue, magnitude as opacity. A 2px gap
  // between bars, and a hover title on each.
  heat.forEach((w) => {
    const attrs = {
      x: w.i * bw + 1, width: Math.max(1, bw - 2), y: y(w.tension), height: H - pad - y(w.tension),
      rx: 2, class: 'st-heat-bar' + (w.estimated ? ' is-est' : ''),
      'fill-opacity': (0.25 + (w.tension / 10) * 0.75).toFixed(2)
    };
    if (interactive) { attrs['data-st'] = 'heat'; attrs['data-from'] = w.from; }
    const r = el('rect', attrs);
    const t = el('title', {});
    t.textContent = `${pct(w.pos)} — tension ${w.tension.toFixed(1)}` +
      (w.beat ? ` (${w.beat.label})` : ' (estimated from the text)') + `, convention ${w.expected.toFixed(1)}`;
    r.append(t);
    svg.append(r);
  });
  const line = (pts, cls) => svg.append(el('polyline', { points: pts.map(([x, v]) => `${x},${y(v)}`).join(' '), class: cls }));
  line(heat.map((w) => [(w.i + 0.5) * bw, w.expected]), 'st-heat-expected');
  line(heat.map((w) => [(w.i + 0.5) * bw, w.tension]), 'st-heat-line');
  fig.append(svg);
  const acts = h('div.st-heat-acts', { 'aria-hidden': 'true' });
  // The act strip takes the framework's own split, so a two-half or a
  // five-act format labels its own acts under the curve.
  acts.style.gridTemplateColumns = regions.map((r) => Math.max(0.01, r.to - r.from) + 'fr').join(' ');
  regions.forEach((r) => acts.append(h('span', { text: r.label })));
  fig.append(acts);
  fig.append(h('figcaption.st-heat-cap', {}, [
    h('span.st-key.st-key-line', { text: 'This story' }),
    h('span.st-key.st-key-exp', { text: `${Story.frameworkById(s.framework).short} convention` }),
    h('span.st-key.st-key-slack', { text: 'Slack stretch' }),
    h('span.st-heat-note', { text: 'Tagged passages take their beat’s tension; the rest is estimated from the words and is only a prompt to look.' })
  ]));
  // The table view, for anybody the chart does not serve.
  const det = h('details.st-heat-table');
  det.append(h('summary', { text: 'Show as a table' }));
  const tbl = h('table');
  tbl.append(h('thead', {}, [h('tr', {}, ['Where', 'Tension', 'Convention', 'Source'].map((c) => h('th', { scope: 'col', text: c })))]));
  const tb = h('tbody');
  heat.forEach((w) => tb.append(h('tr', {}, [
    h('td', { text: pct(w.pos) }), h('td', { text: w.tension.toFixed(1) }), h('td', { text: w.expected.toFixed(1) }),
    h('td', { text: w.beat ? w.beat.label : 'estimated' })])));
  tbl.append(tb);
  det.append(h('div.st-table-wrap', {}, [tbl]));
  fig.append(det);
  return fig;
}

/** The pacing notes. Interactive: each note with a span is a button
 *  that jumps to it in the synopsis (story.html only). */
export function renderFlags(s, { interactive = true } = {}) {
  const flags = Story.pacingFlags(s);
  if (!flags.length) {
    if (Story.tooShortForPacing(s)) {
      return h('p.st-flags-ok', { text: `The pacing notes need a longer synopsis — about ${Story.PACING.minWords} words or more. This one has ${Story.wordCount(s.source)}.` });
    }
    return h('p.st-flags-ok', { text: s.marks.length
      ? 'No pacing flags for this framework.'
      : 'Tag a few passages and the pacing notes appear here.' });
  }
  const ul = h('ul.st-flags', { 'aria-label': 'Pacing notes' });
  flags.forEach((f) => {
    const li = h('li.st-flag.is-' + f.level);
    if (interactive && Number.isFinite(f.from)) {
      li.append(h('button.st-flag-go', { type: 'button', 'data-st': 'goto', 'data-from': f.from, 'data-to': f.to, text: f.text }));
    } else li.append(h('span', { text: f.text }));
    ul.append(li);
  });
  return ul;
}

/* ============================================================
   IMPORT AND THE SAMPLE — the Story page's own, behind a click
   ============================================================ */

/** Read a file and put it in the story's synopsis, asking first when
 *  that replaces one. Returns { name, text } or null. The caller says
 *  what happened (story.html also moves its own path step). */
export async function importSynopsis(file) {
  if (!file) return null;
  let r;
  try { r = await IO.readSynopsisFile(file); }
  catch (e) { StudioUI.toast(e.message, { type: 'error' }); return null; }
  const s = Story.loadStory();
  if (s.source.trim() && !window.confirm(IO.replaceQuestion(r.name))) return null;
  s.source = r.text;
  s.sourceName = r.name;
  Story.saveStory(s);
  return r;
}

/* ============================================================
   THE PANELS
   ============================================================ */

/* In memory only, for this visit: the one-level Undo of a copy from
   the blueprint's beats. Never stored — it is not a fact about the film. */
let undoCopy = null;   // { ns, before, wrote }

const eyebrow = (t) => h('p.sk-eyebrow', { text: t });
const link = (href, text, cls = '') => h('a.btn' + cls, { href, text });

function panelStart() {
  const s = Story.loadStory();
  const path = Story.pathProgress(s, { scenes: scenes() });
  const next = path.find((p) => !p.done) || path[path.length - 1];
  const any = path.some((p) => p.done);
  const kids = [
    eyebrow('Story page · the story path'),
    h('h3.sk-title', { text: any ? 'Your story, so far' : 'Start your story' }),
    h('p.sk-lead', { text: 'The Story page takes a film from an idea to a logline, a beat sheet, a step outline and a synopsis. These steps are its working copy; how far this project has got there:' })
  ];
  const ol = h('ol.sk-path', { 'aria-label': 'Story path progress' });
  for (const p of path) {
    ol.append(h('li.sk-path-step' + (p.done ? '.is-done' : ''), {}, [
      h('a.sk-path-link', { href: STORY_HREF + '#path-' + p.n }, [
        h('span.sk-path-n', { text: String(p.n) }),
        h('span.sk-path-label', { text: p.label }),
        h('span.sk-path-state', { text: p.done ? (p.detail ? 'Done · ' + p.detail : 'Done') : 'To do' })
      ])
    ]));
  }
  kids.push(ol);
  const acts = h('div.sk-actions');
  acts.append(link(STORY_HREF + '#path-' + next.n,
    (any ? 'CONTINUE THE STORY PATH: ' : 'START THE STORY PATH: ') + next.label.toUpperCase() + ' →', '.primary'));
  if (IO.isEmptyStory(s)) acts.append(h('button.btn', { type: 'button', 'data-sk': 'sample', text: 'USE THE DRAGON SAMPLE' }));
  acts.append(h('label.btn.sk-file', {}, [
    h('span', { text: 'IMPORT A SYNOPSIS FILE' }),
    h('input', { type: 'file', accept: '.txt,.md,.text,.docx,.pdf', 'data-sk-file': 'synopsis', 'aria-label': 'Import a synopsis file into the Story page' })
  ]));
  kids.push(acts);
  kids.push(h('p.sk-note', { text: 'A .docx, .pdf or .txt lands in the Story page’s synopsis, ready to tag against the beats. Nothing in this blueprint is changed by it.' }));
  return kids;
}

function panelVaultList() {
  const items = Story.listVault();
  if (!items.length) return [h('p.sk-note', { text: 'Nothing clipped yet. A headline, a line from an article, a reference — whatever started the idea.' })];
  const SHOW = 5;
  const ul = h('ul.sk-clips', { 'aria-label': 'Idea Vault clippings' });
  for (const it of items.slice(0, SHOW)) {
    const li = h('li.sk-clip', {}, [h('p.sk-clip-text', { text: clip(it.snippet, 280) })]);
    const meta = h('p.sk-clip-meta');
    let host = '';
    try { host = it.url ? new URL(it.url).hostname : ''; } catch (e) { host = ''; }
    if (host) meta.append(h('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: host }), ' · ');
    meta.append(new Date(it.at).toLocaleDateString());
    li.append(meta);
    ul.append(li);
  }
  const out = [ul];
  if (items.length > SHOW) out.push(h('p.sk-note', { text: `${items.length - SHOW} more in the Idea Vault.` }));
  return out;
}

function panelVault(card) {
  card.append(eyebrow('Story page · Idea Vault'));
  card.append(h('h3.sk-title', { text: 'Clippings for this film' }));
  card.append(h('p.sk-lead', { text: 'A logline is easier to find with the raw material in view. These are this project’s clippings — the Chrome extension’s “Send to ' + BRAND.name + '” lands here too.' }));
  card.append(h('div.sk-dyn', { 'data-sk-dyn': 'vault' }));
  const add = h('div.sk-vault-add');
  add.append(h('label.sk-label', { for: 'skClip', text: 'Add a clipping' }));
  add.append(h('textarea#skClip.sk-text', { rows: 2, spellcheck: 'true' }));
  card.append(add);
  card.append(h('div.sk-actions', {}, [
    h('button.btn', { type: 'button', 'data-sk': 'clip-add', text: 'ADD TO VAULT' }),
    link(STORY_HREF + '#vault', 'OPEN THE IDEA VAULT →')
  ]));
}

const fwName = (ns) => Story.frameworkById(IO.BLUEPRINT_BEATS[ns].fw);

function panelBeats(ns) {
  const map = IO.BLUEPRINT_BEATS[ns];
  const s = Story.loadStory();
  const o = Story.outlineByBeat(s, map.fw);
  const mx = Story.matrix(s, map.fw);
  const tagged = mx.reduce((t, r) => t + r.marks.length, 0);
  const fw = o.fw;
  const kids = [
    eyebrow('Story page · step outline · ' + fw.label),
    h('h3.sk-title', { text: 'Your beats on the Story page' })
  ];
  const have = o.covered || tagged;
  kids.push(h('p.sk-lead', { role: 'status' }, [
    h('strong', { text: `${o.covered} of ${o.beatsTotal} beats have a step` }),
    ` · ${plural(tagged, 'passage')} tagged in the synopsis. ` +
    (have ? 'Each beat’s are shown under its field below, read from the Story page. The fields stay this blueprint’s own.'
      : 'Once the Story page has a step outline, each beat’s steps show under its field below. The fields stay this blueprint’s own.')
  ]));
  if (s.framework !== fw.id && (s.outline.length || s.marks.length)) {
    kids.push(h('p.sk-note', { text: `The Story page is set to ${Story.frameworkById(s.framework).label}. Shown here in ${fw.short}: steps written under another format stay on the Story page, and tagged passages are placed by position.` }));
  }
  const acts = h('div.sk-actions');
  acts.append(link(STORY_HREF + '#path-4', 'OPEN THE STEP OUTLINE →', o.covered ? '' : '.primary'));
  if (!s.source.trim()) {
    acts.append(h('button.btn', { type: 'button', 'data-sk': 'copy-beats', 'data-ns': ns,
      text: `START THE STORY SYNOPSIS FROM MY ${fw.beats.length} BEATS` }));
  }
  if (undoCopy && undoCopy.ns === ns) acts.append(h('button.btn', { type: 'button', 'data-sk': 'copy-undo', text: 'UNDO THE COPY' }));
  kids.push(acts);
  if (!s.source.trim()) {
    kids.push(h('p.sk-note', { text: `Copies what you wrote above each field into the Story page as one step per beat, then builds its synopsis from them, tagged. Add-only — nothing on the Story page is replaced — and offered only while it has no synopsis.` }));
  }
  return kids;
}

/** One beat's steps and passages from the Story page, beside its field. */
function beatRef(ns, beatId, o, mx) {
  const row = o.beats.find((r) => r.beat.id === beatId);
  const mrow = mx.find((r) => r.beat.id === beatId);
  const steps = row ? row.steps.filter((st) => String(st.text || '').trim()) : [];
  /* A passage the synopsis build made FROM a step is that step's own
     text; listing it twice says nothing, so only the others show. */
  const said = new Set(steps.map((st) => String(st.text).trim().replace(/\s+/g, ' ')));
  const marks = (mrow ? mrow.marks : []).filter((m) => !said.has(String(m.text).trim().replace(/\s+/g, ' ')));
  if (!steps.length && !marks.length) return [];
  const out = [h('p.sk-ref-k', { text: 'On the Story page' })];
  if (steps.length) {
    const SHOW = 4;
    const ol = h('ol.sk-ref-steps', { start: String(steps[0].n), 'aria-label': 'Step outline for ' + row.beat.label });
    steps.slice(0, SHOW).forEach((st) => ol.append(h('li', { text: clip(st.text, 240) })));
    out.push(ol);
    if (steps.length > SHOW) out.push(h('p.sk-ref-by', { text: `${steps.length - SHOW} more steps on the Story page` }));
  }
  if (marks.length) {
    const ul = h('ul.sk-ref-marks', { 'aria-label': 'Passages tagged ' + mrow.beat.label });
    marks.slice(0, 3).forEach((m) => ul.append(h('li', {}, [
      '“' + clip(m.text, 220) + '”',
      m.inferred ? h('span.sk-ref-by', { text: ' placed by position' }) : null
    ])));
    if (marks.length > 3) ul.append(h('li.sk-ref-by', { text: `${marks.length - 3} more on the Story page` }));
    out.push(ul);
  }
  return out;
}

function panelEnd() {
  const s = Story.loadStory();
  const kids = [eyebrow('End of Part I · Story'), h('h3.sk-title', { text: 'The story so far' })];
  if (s.source.trim()) {
    kids.push(h('p.sk-lead', { text: `The tension across the Story page’s synopsis (${plural(words(s.source), 'word')}), against the ${Story.frameworkById(s.framework).short} convention. Read only — tag passages on the Story page and the curve follows.` }));
    const fig = renderHeat(s, { interactive: false });
    if (fig) kids.push(fig);
    kids.push(renderFlags(s, { interactive: false }));
    kids.push(h('div.sk-actions', {}, [link(STORY_HREF + '#pacing', 'OPEN THE PACING ON THE STORY PAGE →')]));
  } else {
    kids.push(h('p.sk-lead', { text: 'No synopsis on the Story page yet. The tension curve appears here once there is one — build it from the step outline, or paste the one you have.' }));
    kids.push(h('div.sk-actions', {}, [link(STORY_HREF + '#path-5', 'OPEN THE SYNOPSIS STEP →')]));
  }
  kids.push(h('h4.sk-sub', { text: 'Take it with you' }));
  let d = null;
  try { d = Pitch.collectPitch(); } catch (e) { d = null; }
  const have = d ? [
    d.logline && 'logline', d.synopsis && 'synopsis', d.beats.length && `${d.beats.length} beats`,
    d.characters.length && `${d.characters.length} characters`, d.keyScenes.length && `${d.keyScenes.length} key scenes`,
    d.numbers.length && 'production numbers'
  ].filter(Boolean) : [];
  kids.push(h('div.sk-actions', {}, [
    h('button.btn', { type: 'button', 'data-sk': 'export-txt', disabled: !IO.canExportSynopsis(s), text: 'SYNOPSIS .TXT' }),
    h('button.btn', { type: 'button', 'data-sk': 'export-md', disabled: !IO.canExportOutline(s), text: 'OUTLINE .MD' }),
    h('button.btn', { type: 'button', 'data-sk': 'pitch', disabled: !have.length, text: 'PITCH DECK (PDF)' })
  ]));
  kids.push(h('p.sk-note', { text: have.length ? 'In the pitch deck: ' + have.join(' · ') + '.' : 'Nothing to pitch yet — add a synopsis or a logline first.' }));
  return kids;
}

/* ============================================================
   MOUNTING AND REDRAWING
   ============================================================ */

const card = (kind, ns, extra = '') => h('div.sk-card' + extra, { 'data-story-kit': kind, 'data-ns': ns });

/** Put the panels into a rendered blueprint. Idempotent: a slot that
 *  is already there is left alone. `ns` is 'feature' or 'short'. */
export function mountStoryKit(ns, root = document) {
  if (ns === 'feature') {
    const cover = root.querySelector('#vol-1');
    const grid = cover && cover.querySelector('.meta-grid');
    if (grid && !cover.querySelector('[data-story-kit="start"]')) grid.after(card('start', ns, '.sk-start'));

    const s02 = root.querySelector('#step-02');
    if (s02 && !s02.querySelector('[data-story-kit="vault"]')) {
      const c = card('vault', ns, '.sk-vault');
      panelVault(c);
      const check = s02.querySelector('.step-check');
      const at = check ? check.closest('#step-02 > *') || check : null;
      if (at && at.parentNode) at.parentNode.insertBefore(c, at); else s02.append(c);
    }

    const s10 = root.querySelector('#step-10');
    if (s10 && !root.querySelector('[data-story-kit="end"]')) {
      const band = h('section#story-so-far.sk-band', { 'aria-label': 'The story so far' }, [card('end', ns, '.sk-end')]);
      s10.after(band);
    }
  }
  mountBeats(ns, root);
  bind();
  refreshStoryKit(root);
}

function mountBeats(ns, root) {
  const map = IO.BLUEPRINT_BEATS[ns];
  const step = map && root.querySelector('#step-' + map.step);
  if (!step || step.querySelector('[data-story-kit="beats"]')) return;
  const first = step.querySelector(`[data-key="${Object.values(map.fields)[0]}"]`);
  const host = first && (first.closest('table') || first.closest('.beat-grid'));
  if (!host) { console.warn('[story-kit] step', map.step, 'has no beat fields to sit beside'); return; }
  host.before(card('beats', ns, '.sk-beats'));
  for (const [beatId, key] of Object.entries(map.fields)) {
    const f = step.querySelector(`[data-key="${key}"]`);
    if (f) f.after(h('div.sk-ref', { 'data-sk-beat': beatId, 'data-ns': ns }));
  }
}

/* Replace a container's children, keeping the focus on the control
   that had it when that control is redrawn (matched by data-sk*). */
function fill(el, kids) {
  const a = document.activeElement;
  let sel = '';
  if (a && el.contains(a) && a !== el) {
    const attrs = [...a.attributes].filter((x) => x.name.startsWith('data-sk'));
    if (attrs.length) sel = a.tagName.toLowerCase() + attrs.map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  }
  el.replaceChildren(...kids.filter(Boolean));
  if (sel) { const b = el.querySelector(sel); if (b && !b.disabled) b.focus({ preventScroll: true }); }
}

/** Redraw every panel on the page from the models. Reads only. */
export function refreshStoryKit(root = document) {
  try {
    root.querySelectorAll('[data-story-kit="start"]').forEach((el) => fill(el, panelStart()));
    root.querySelectorAll('[data-sk-dyn="vault"]').forEach((el) => fill(el, panelVaultList()));
    root.querySelectorAll('[data-story-kit="beats"]').forEach((el) => fill(el, panelBeats(el.getAttribute('data-ns'))));
    const byNs = {};
    root.querySelectorAll('[data-sk-beat]').forEach((el) => {
      const ns = el.getAttribute('data-ns');
      if (!byNs[ns]) {
        const s = Story.loadStory();
        const fw = IO.BLUEPRINT_BEATS[ns].fw;
        byNs[ns] = { o: Story.outlineByBeat(s, fw), mx: Story.matrix(s, fw) };
      }
      fill(el, beatRef(ns, el.getAttribute('data-sk-beat'), byNs[ns].o, byNs[ns].mx));
    });
    root.querySelectorAll('[data-story-kit="end"]').forEach((el) => fill(el, panelEnd()));
  } catch (e) {
    console.warn('[story-kit] redraw', e);
  }
}

/* ---- actions ------------------------------------------------- */

/** What the writer has for each beat: the field on screen first (it
 *  may be ahead of the last save), else the saved blob. */
function beatAnswers(ns) {
  const bp = IO.readBlueprint(ns);
  return IO.blueprintBeats(ns, bp).map((r) => {
    const f = r.key && document.querySelector(`[data-key="${r.key}"]`);
    const live = f && typeof f.value === 'string' ? f.value.trim() : '';
    return { ...r, text: live || r.text };
  }).filter((r) => r.text);
}

function copyBeats(ns) {
  const map = IO.BLUEPRINT_BEATS[ns];
  const fw = Story.frameworkById(map.fw);
  const s = Story.loadStory();
  if (s.source.trim()) { StudioUI.toast('The Story page already has a synopsis, so nothing was copied.'); return; }
  const rows = beatAnswers(ns);
  if (!rows.length) { StudioUI.toast(`Write at least one of the ${fw.beats.length} beats first.`, { type: 'error' }); return; }
  const before = JSON.parse(JSON.stringify(s));
  // Into this format when the story has nothing of its own yet; a
  // story already outlined in another format keeps its format.
  if (!s.outline.length && !s.marks.length) s.framework = fw.id;
  let added = 0;
  for (const r of rows) {
    const key = Story.qualifyBeat(fw.id, r.beat.id);
    const same = s.outline.some((st) => st.beat === key && String(st.text || '').trim() === r.text);
    if (same) continue;
    if (Story.addOutlineStep(s, { beat: key, text: r.text })) added++;
  }
  Story.buildSynopsisFromOutline(s, fw.id);
  Story.saveStory(s);
  undoCopy = { ns, before, wrote: s.updatedAt };
  refreshStoryKit();
  StudioUI.toast(`${plural(added, 'beat')} copied into the Story page’s step outline, and its synopsis built from them.`, {
    action: 'UNDO', onAction: undoCopyBeats
  });
}

function undoCopyBeats() {
  if (!undoCopy) return;
  const now = Story.loadStory();
  if (now.updatedAt !== undoCopy.wrote &&
      !window.confirm('The story has changed since the copy. Undo anyway? Those later changes go too.')) return;
  Story.saveStory(undoCopy.before);
  undoCopy = null;
  refreshStoryKit();
  StudioUI.toast('Copy undone. The Story page is as it was.');
}

async function useSample() {
  const cur = Story.loadStory();
  if (!IO.isEmptyStory(cur) && !window.confirm('Replace the story on the Story page with the Dragon sample? Your idea, logline, outline and synopsis there are replaced. The Idea Vault is kept.')) return;
  const s = await IO.sampleStory();
  Story.saveStory(s);
  refreshStoryKit();
  StudioUI.toast('The Dragon sample story is on the Story page.');
}

let bound = false;
function bind() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  delegate(document, 'click', '[data-sk]', (e, el) => {
    const act = el.getAttribute('data-sk');
    if (act === 'sample') useSample();
    else if (act === 'copy-beats') copyBeats(el.getAttribute('data-ns'));
    else if (act === 'copy-undo') undoCopyBeats();
    else if (act === 'clip-add') {
      const ta = document.getElementById('skClip');
      if (Story.addToVault({ snippet: ta && ta.value })) { ta.value = ''; refreshStoryKit(); StudioUI.toast('Added to the Idea Vault.'); }
      else StudioUI.toast('Type or paste a clipping first.', { type: 'error' });
    } else if (act === 'export-txt') IO.exportSynopsis(Story.loadStory());
    else if (act === 'export-md') IO.exportOutline(Story.loadStory());
    else if (act === 'pitch') {
      if (!Pitch.exportPitchPDF()) StudioUI.toast('Nothing to put in a deck yet.', { type: 'error' });
    }
  });
  delegate(document, 'change', '[data-sk-file]', async (e, el) => {
    const file = el.files && el.files[0];
    el.value = '';
    const r = await importSynopsis(file);
    if (!r) return;
    refreshStoryKit();
    StudioUI.toast(IO.importedSentence(r) + ' It is on the Story page, ready to tag.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshStoryKit();
  });
  // Another tab (the Story page) wrote the story or the vault.
  addEventListener('storage', (e) => {
    if (!e.key || e.key.indexOf(Story.STORY_KEY) === 0 || e.key.indexOf(Story.VAULT_KEY) === 0) refreshStoryKit();
  });
}

export default { renderHeat, renderFlags, importSynopsis, mountStoryKit, refreshStoryKit };
