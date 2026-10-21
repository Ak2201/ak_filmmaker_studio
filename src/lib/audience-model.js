/* ============================================================
   AUDIENCE MODEL — the Audience test, everything but the request
   ------------------------------------------------------------
   A panel of simulated viewers reads the screenplay in parts and
   scores every scene; a last request turns their curves into
   verdicts. docs/AUDIENCE-TEST-PLAN.md is the design. This file is
   the PURE half: the panel, the prompts and schemas, the checks on a
   reply, the merged curves and the prose a kept run is saved as.
   Nothing here reads or writes storage and nothing calls a model —
   the runner (ai.js, phase 2) composes these around callModel().

   ITS INPUTS ARE PLAIN DATA, handed in by the caller:
     scenes    [{ n, heading, text }]   ai.js coverageScenes()
     batches   [[sceneIndex, …], …]     ai.js planCoverage().batches
     isQuote   (quote) => boolean       ai.js quoteChecker(source)
   so this file imports none of ai.js and the one slicer stays one.

   THE CHECKS (plan §5), each counted rather than silently fixed:
     · a score or moment naming a scene not in this part is dropped;
     · a quote not word for word in the script is stripped (the
       moment stays, without the quote);
     · a reply line for a viewer not on the panel is dropped;
     · scores are clamped to −2..+2; a missing score is null, never 0;
     · a viewer who walked out scores nothing after the walkout.
   And one honesty rule (plan §2): when the panel's curves barely
   differ, the result says so instead of presenting eight opinions.

   Phase 4 added two more uses of the same pieces, each further down
   with its own header: QUICK MODE (the Story page's synopsis and beat
   sheet, scored per beat in one request) and ASK A VIEWER (one
   follow-up question to one viewer, from the run's own record).

   Node-tested by scripts/test-audience.mjs (npm run test:audience).
   ============================================================ */
import PERSONA_DATA from '../data/audience-personas.json';

export const PERSONAS = Object.freeze(PERSONA_DATA.personas.map((p) => Object.freeze({ ...p })));
const byId = new Map(PERSONAS.map((p) => [p.id, p]));
export const personaById = (id) => byId.get(id) || null;

export const PANEL_DEFAULT = 8;
export const PANEL_MIN = 3;
export const PANEL_MAX = 12;
export const SCORE_MIN = -2;
export const SCORE_MAX = 2;
export const MOMENT_KINDS = ['hooked', 'moved', 'lost', 'bored', 'walkout'];
export const MOMENTS_PER_VIEWER = 3;           // per part
export const VERDICTS = ['recommend', 'mixed', 'walkout'];
export const VERDICT_WORD = { recommend: 'Would recommend', mixed: 'Mixed', walkout: 'Walked out' };
/** Mean distance between two viewers' scores under which the panel
    "barely disagreed" (on a −2..+2 scale). */
export const AGREE_SPREAD = 0.5;

export const SIMULATED_LINE = 'Simulated by a model, not by real viewers.';

const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* ---- the panel ------------------------------------------------ */

const FEATURE_ORDER = ['family-theatre', 'mass-fan', 'ott-binger', 'genre-fan', 'festival', 'distributor', 'teen', 'non-tamil', 'parent', 'critic'];
/* A short film's first audience is a jury, so programmers and
   readers lead (plan §3). */
const SHORT_ORDER = ['festival', 'critic', 'genre-fan', 'non-tamil', 'ott-binger', 'teen', 'distributor', 'parent', 'family-theatre', 'mass-fan'];

function fill(p, genre) {
  const g = str(genre, 60);
  const who = p.who.replace('{genre}', g || 'this kind of');
  return { id: p.id, label: p.label, who, cares: p.cares };
}

/**
 * The panel a run starts with: `size` presets in the format's order,
 * the genre filled in, and — when the project names its audience — one
 * seat given to that audience, in the writer's own words.
 * opts { format: 'feature'|'short', genre, audience, size }
 */
export function defaultPanel({ format = 'feature', genre = '', audience = '', size = PANEL_DEFAULT } = {}) {
  const n = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(Number(size) || PANEL_DEFAULT)));
  const order = format === 'short' ? SHORT_ORDER : FEATURE_ORDER;
  const panel = order.slice(0, n).map((id) => fill(byId.get(id), genre));
  const own = str(audience, 240);
  if (own) {
    const seat = { id: 'project-audience', label: 'Your stated audience', who: 'Exactly the audience this film is made for: ' + own + '.', cares: 'Judges the film as somebody it was written for.', custom: true };
    if (panel.length >= n) panel[panel.length - 1] = seat; else panel.push(seat);
  }
  return panel;
}

/** A viewer the writer describes in a sentence. Sent as written. */
export function customPersona(sentence, k = 1) {
  const who = str(sentence, 240);
  if (!who) return null;
  const label = who.length > 40 ? who.slice(0, 39).replace(/\s+\S*$/, '') + '…' : who;
  return { id: 'custom-' + k, label, who, cares: '', custom: true };
}

/** A panel, checked: unknown shapes dropped, ids made unique, capped.
    Returns { panel, problem } — problem is a sentence or ''. */
export function normalisePanel(list) {
  const seen = new Set();
  const panel = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p !== 'object') continue;
    const id = str(p.id, 40);
    const who = str(p.who, 300);
    if (!id || !who || seen.has(id)) continue;
    seen.add(id);
    panel.push({ id, label: str(p.label, 60) || id, who, cares: str(p.cares, 300), ...(p.custom ? { custom: true } : {}) });
    if (panel.length === PANEL_MAX) break;
  }
  const problem = panel.length < PANEL_MIN
    ? 'An audience test needs at least ' + PANEL_MIN + ' viewers; this panel has ' + panel.length + '.'
    : '';
  return { panel, problem };
}

/* ---- the plan, and what it will cost --------------------------
   One request per part with the WHOLE panel in it (plan §4), then
   one for the verdicts — so a feature costs what coverage costs, plus
   the panel's share of each reply. */
const PART_OVERHEAD = 2600;          // system prompt + rules, per part (chars)
const PER_VIEWER_IN = 420;           // a viewer's description and carried state
const OUT_PER_SCORE = 60;            // one {viewer, scene, score} entry (chars)
const OUT_PER_MOMENT = 320;
const SYNTH_PER_CELL = 4;            // a score, as the verdict request reads it

export function planAudience({ scenes = [], batches = [] } = {}, panelSize = PANEL_DEFAULT) {
  const v = Math.max(0, Number(panelSize) || 0);
  const chars = scenes.reduce((n, s) => n + String(s.text || '').length, 0);
  const inChars = chars + batches.length * (PART_OVERHEAD + v * PER_VIEWER_IN)
    + PART_OVERHEAD + v * PER_VIEWER_IN + scenes.length * v * SYNTH_PER_CELL + scenes.length * 80;
  const outChars = scenes.length * v * OUT_PER_SCORE + batches.length * v * MOMENTS_PER_VIEWER * OUT_PER_MOMENT + v * 900;
  return {
    parts: batches.length,
    requests: batches.length ? batches.length + 1 : 0,
    tokensIn: Math.ceil(inChars / 4),
    tokensOut: Math.ceil(outChars / 4)
  };
}

/** Output budget for one part, sized to what it has to hold. */
export function partMaxTokens(panelSize, sceneCount) {
  const est = Math.ceil((panelSize * sceneCount * OUT_PER_SCORE + panelSize * (MOMENTS_PER_VIEWER * OUT_PER_MOMENT + 300)) / 4);
  return Math.max(4000, Math.min(16000, Math.ceil(est * 1.5)));
}

/* ---- the part request ----------------------------------------- */

export const AUDIENCE_SYSTEM = [
  'You run a test screening of a screenplay for a Tamil film production. You play a panel',
  'of viewers, each described below, reading the script in parts as if watching the film.',
  '',
  'Rules:',
  '· Each viewer reacts by THEIR OWN tastes as described. Viewers with different tastes',
  '  should disagree where their tastes would; do not make them agree for its own sake.',
  '· Score every scene in this part for every viewer still watching, from -2 (lost them)',
  '  through 0 (neutral) to +2 (fully gripped). Cite the scene by the number given.',
  '· A viewer who would stop watching walks out: give a "walkout" moment at that scene',
  '  and set walkedOutAt. A viewer who has walked out is not scored again.',
  '· A moment may quote the script; a quote must be copied character for character from',
  '  that scene, with no paraphrase, ellipsis or translation. Leave the quote empty rather',
  '  than invent one.',
  '· React to what is on the page. Do not invent plot, characters or scenes.',
  '· The state line is what this viewer carries into the next part: their mood and what',
  '  they are waiting for, in one sentence.',
  '· Quote the script in its own language. Write everything else in English.',
  '· Answer only with the JSON the schema describes.'
].join('\n');

export function partSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['viewers'],
    properties: {
      viewers: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['viewer', 'scores', 'moments', 'state', 'walkedOutAt'],
          properties: {
            viewer: { type: 'string', description: 'the viewer id given, copied exactly' },
            scores: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['scene', 'score'],
                properties: {
                  scene: { type: 'string', description: 'the scene number given, copied exactly' },
                  score: { type: 'integer', description: '-2 lost, -1 drifting, 0 neutral, 1 engaged, 2 gripped' }
                }
              }
            },
            moments: {
              type: 'array',
              description: 'at most ' + MOMENTS_PER_VIEWER + ' moments that mattered to this viewer in this part',
              items: {
                type: 'object', additionalProperties: false, required: ['scene', 'kind', 'quote', 'note'],
                properties: {
                  scene: { type: 'string' },
                  kind: { type: 'string', enum: MOMENT_KINDS.slice() },
                  quote: { type: 'string', description: 'a short span copied VERBATIM from that scene, or empty' },
                  note: { type: 'string', description: 'one sentence in this viewer\'s own voice' }
                }
              }
            },
            state: { type: 'string', description: 'one sentence carried into the next part' },
            walkedOutAt: { type: 'string', description: 'the scene number they walked out at, or empty' }
          }
        }
      }
    }
  };
}

function panelBlock(panel, states, gone) {
  const L = [];
  for (const p of panel) {
    if (gone && gone.has(p.id)) continue;
    L.push('- ' + p.id + ' | ' + p.label + ': ' + p.who + (p.cares ? ' ' + p.cares : ''));
    const st = states && states[p.id];
    if (st) L.push('    so far: ' + st);
  }
  return L.join('\n');
}

/**
 * The user prompt for one part.
 * job { panel, scenes (this part's), part, parts, title, states?,
 *       walkedOut? (ids), context?, refine? }
 */
export function buildPartPrompt(job) {
  const gone = new Set(job.walkedOut || []);
  const L = [];
  if (job.context) L.push(String(job.context).trim(), '');
  L.push('Screenplay' + (job.title ? ' "' + str(job.title, 120) + '"' : '') + ' — part ' + job.part + ' of ' + job.parts + '.');
  L.push('');
  L.push('THE PANEL (id | who they are; "so far" is where each viewer is after the earlier parts):');
  L.push(panelBlock(job.panel, job.states, gone));
  if (gone.size) L.push('', 'Already walked out, not scored again: ' + [...gone].join(', ') + '.');
  L.push('');
  L.push('THE SCENES IN THIS PART:');
  for (const s of job.scenes) {
    L.push('', '=== SCENE ' + s.n + ' — ' + s.heading + ' ===', s.text);
  }
  L.push('');
  L.push('For every viewer still watching, score every scene above, give up to ' + MOMENTS_PER_VIEWER + ' moments, and the state line.');
  if (job.refine) L.push('', String(job.refine).trim());
  return L.join('\n');
}

/* ---- reading a part ------------------------------------------- */

const clampScore = (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, n));
};

/**
 * One part's reply, checked. ctx { panel, sceneNs (this part's scene
 * numbers, in order), isQuote(quote, sceneN), walkedOut (ids) }.
 * Returns { viewers: { [id]: { scores: {n: score}, moments, state,
 * walkedOutAt } }, dropped: { scenes, quotes, viewers, scores } }.
 */
export function readPart(parsed, ctx) {
  const ids = new Set(ctx.panel.map((p) => p.id));
  const known = new Set((ctx.sceneNs || []).map(String));
  const order = (ctx.sceneNs || []).map(String);
  const gone = new Set(ctx.walkedOut || []);
  const isQuote = typeof ctx.isQuote === 'function' ? ctx.isQuote : () => false;
  const dropped = { scenes: 0, quotes: 0, viewers: 0, scores: 0 };
  const viewers = {};
  for (const v of (parsed && Array.isArray(parsed.viewers) ? parsed.viewers : [])) {
    const id = str(v && v.viewer, 40);
    if (!ids.has(id) || viewers[id] || gone.has(id)) { dropped.viewers++; continue; }
    let out = str(v.walkedOutAt, 20);
    if (out && !known.has(out)) { dropped.scenes++; out = ''; }
    const cut = out ? order.indexOf(out) : -1;
    const scores = {};
    for (const s of Array.isArray(v.scores) ? v.scores : []) {
      const n = str(s && s.scene, 20);
      if (!known.has(n)) { dropped.scenes++; continue; }
      if (cut >= 0 && order.indexOf(n) > cut) { dropped.scores++; continue; }
      const sc = clampScore(s.score);
      if (sc == null) { dropped.scores++; continue; }
      scores[n] = sc;
    }
    const moments = [];
    for (const m of Array.isArray(v.moments) ? v.moments : []) {
      if (moments.length === MOMENTS_PER_VIEWER) break;
      const n = str(m && m.scene, 20);
      const note = str(m && m.note, 300);
      if (!note) continue;
      if (!known.has(n)) { dropped.scenes++; continue; }
      if (cut >= 0 && order.indexOf(n) > cut) { dropped.scores++; continue; }
      const kind = MOMENT_KINDS.includes(m.kind) ? m.kind : 'lost';
      let quote = str(m.quote, 240);
      if (quote && !isQuote(quote, n)) { dropped.quotes++; quote = ''; }
      moments.push({ scene: n, kind, quote, note });
    }
    /* A walkout with no walkout moment still gets one, so the reason a
       curve stops is always on the page. */
    if (out && !moments.some((m) => m.kind === 'walkout' && m.scene === out)) {
      moments.push({ scene: out, kind: 'walkout', quote: '', note: 'Stopped watching here.' });
    }
    viewers[id] = { scores, moments, state: str(v.state, 300), walkedOutAt: out };
  }
  return { viewers, dropped };
}

/* ---- merging the parts ---------------------------------------- */

/**
 * Every part read, joined into one run.
 * ctx { panel, scenes: [{n, heading}] (the whole script, in order) }
 * parts [readPart() results, in order]
 * Returns { order, curves: {id: [score|null]}, mean: [number|null],
 *   moments: [{viewer, scene, kind, quote, note}], walkouts: {id: n},
 *   states: {id: string}, dropped: {…summed} }
 */
export function mergeParts(parts, ctx) {
  const order = ctx.scenes.map((s) => String(s.n));
  const curves = {};
  const walkouts = {};
  const states = {};
  const moments = [];
  const dropped = { scenes: 0, quotes: 0, viewers: 0, scores: 0 };
  for (const p of ctx.panel) curves[p.id] = order.map(() => null);
  for (const part of parts || []) {
    for (const k of Object.keys(dropped)) dropped[k] += (part.dropped && part.dropped[k]) || 0;
    for (const [id, v] of Object.entries(part.viewers || {})) {
      if (!curves[id] || walkouts[id]) continue;
      for (const [n, sc] of Object.entries(v.scores)) {
        const i = order.indexOf(n);
        if (i >= 0) curves[id][i] = sc;
      }
      for (const m of v.moments) moments.push({ viewer: id, ...m });
      if (v.state) states[id] = v.state;
      if (v.walkedOutAt) walkouts[id] = v.walkedOutAt;
    }
  }
  const mean = order.map((_, i) => {
    const xs = ctx.panel.map((p) => curves[p.id][i]).filter((x) => x != null);
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
  });
  return { order, curves, mean, moments, walkouts, states, dropped };
}

/** How far apart the panel's curves are: the mean, over every pair
    of viewers, of their mean absolute difference on the scenes both
    scored. null when fewer than two viewers scored a common scene. */
export function spread(curves) {
  const lists = Object.values(curves || {});
  let total = 0, pairs = 0;
  for (let a = 0; a < lists.length; a++) {
    for (let b = a + 1; b < lists.length; b++) {
      let d = 0, n = 0;
      const len = Math.min(lists[a].length, lists[b].length);
      for (let i = 0; i < len; i++) {
        if (lists[a][i] == null || lists[b][i] == null) continue;
        d += Math.abs(lists[a][i] - lists[b][i]); n++;
      }
      if (n) { total += d / n; pairs++; }
    }
  }
  return pairs ? Math.round((total / pairs) * 100) / 100 : null;
}

/** Runs of scenes where most of the panel was below zero — the
    "6 of 8 lost interest between Sc 38 and Sc 47" rows. */
export function slumps(run, { panel, minRun = 3 } = {}) {
  const out = [];
  const ids = panel.map((p) => p.id);
  let start = -1, worst = 0;
  const flush = (end) => {
    if (start >= 0 && end - start >= minRun) out.push({ from: run.order[start], to: run.order[end - 1], viewers: worst, of: ids.length });
    start = -1; worst = 0;
  };
  for (let i = 0; i < run.order.length; i++) {
    const low = ids.filter((id) => run.curves[id][i] != null && run.curves[id][i] < 0).length;
    const scored = ids.filter((id) => run.curves[id][i] != null).length;
    if (scored && low * 2 > scored) {
      if (start < 0) start = i;
      worst = Math.max(worst, low);
    } else flush(i);
  }
  flush(run.order.length);
  return out;
}

/** Scenes the panel split on: at least one viewer at +2 and one at −2,
    or a range of 3 or more. */
export function splits(run, { panel } = {}) {
  const out = [];
  run.order.forEach((n, i) => {
    const xs = panel.map((p) => run.curves[p.id][i]).filter((x) => x != null);
    if (xs.length < 2) return;
    const hi = Math.max(...xs), lo = Math.min(...xs);
    if (hi - lo >= 3) out.push({ scene: n, hi, lo });
  });
  return out;
}

/* ---- the verdict request -------------------------------------- */

export function synthSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['verdicts', 'panel'],
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['viewer', 'verdict', 'hooked', 'lost', 'voice'],
          properties: {
            viewer: { type: 'string', description: 'the viewer id given, copied exactly' },
            verdict: { type: 'string', enum: VERDICTS.slice() },
            hooked: { type: 'string', description: 'the scene number that hooked them most, or empty' },
            lost: { type: 'string', description: 'the scene number where they were most lost, or empty' },
            voice: { type: 'string', description: 'one or two sentences, in this viewer\'s own voice, on the film as a whole' }
          }
        }
      },
      panel: {
        type: 'array',
        description: 'up to five observations about the panel as a whole',
        items: {
          type: 'object', additionalProperties: false, required: ['scene', 'note'],
          properties: {
            scene: { type: 'string', description: 'a scene number the observation centres on, or empty' },
            note: { type: 'string' }
          }
        }
      }
    }
  };
}

/** The verdict prompt: the curves and states, not the pages.
    job { panel, run (mergeParts), scenes [{n, heading}], title, refine? } */
export function buildSynthPrompt(job) {
  const { panel, run } = job;
  const L = [];
  L.push('The test screening of' + (job.title ? ' "' + str(job.title, 120) + '"' : ' a screenplay') + ' has finished. Here is what the panel did.');
  L.push('');
  L.push('THE PANEL:');
  L.push(panelBlock(panel, null, null));
  L.push('');
  L.push('SCORES PER SCENE (scene | heading | ' + panel.map((p) => p.id).join(' | ') + '); "-" means not scored or walked out:');
  const heads = new Map((job.scenes || []).map((s) => [String(s.n), s.heading]));
  run.order.forEach((n, i) => {
    L.push(n + ' | ' + (heads.get(n) || '') + ' | ' + panel.map((p) => (run.curves[p.id][i] == null ? '-' : run.curves[p.id][i])).join(' | '));
  });
  L.push('');
  L.push('WHERE EACH VIEWER ENDED UP:');
  for (const p of panel) {
    const out = run.walkouts[p.id];
    L.push('- ' + p.id + ': ' + (run.states[p.id] || '(no note)') + (out ? ' Walked out at scene ' + out + '.' : ''));
  }
  L.push('');
  L.push('Give each viewer\'s verdict ("walkout" only for a viewer who walked out), the scene that hooked them most and');
  L.push('the one where they were most lost (scene numbers from the table), and their view in their own voice. Then up');
  L.push('to five observations about the panel as a whole: where it agreed, where it split, and what that suggests.');
  if (job.refine) L.push('', String(job.refine).trim());
  return L.join('\n');
}

/** The verdict reply, checked against the run. A "walkout" verdict for
    a viewer who never walked out becomes "mixed", and the reverse
    becomes "walkout": the curve is the record, the verdict follows it.
    A verdict that is not one of VERDICTS stays EMPTY ('') rather than
    becoming "mixed": a missing value stays missing (plan §5, "null,
    never 0"), and buildResult() counts the viewers left without one. */
export function readSynth(parsed, { panel, run }) {
  const ids = new Set(panel.map((p) => p.id));
  const known = new Set(run.order);
  const dropped = { scenes: 0, viewers: 0 };
  const verdicts = {};
  for (const v of (parsed && Array.isArray(parsed.verdicts) ? parsed.verdicts : [])) {
    const id = str(v && v.viewer, 40);
    if (!ids.has(id) || verdicts[id]) { dropped.viewers++; continue; }
    let verdict = VERDICTS.includes(v.verdict) ? v.verdict : '';
    if (run.walkouts[id]) verdict = 'walkout';
    else if (verdict === 'walkout') verdict = 'mixed';
    const scene = (x) => { const n = str(x, 20); if (n && !known.has(n)) { dropped.scenes++; return ''; } return n; };
    verdicts[id] = { verdict, hooked: scene(v.hooked), lost: scene(v.lost), voice: str(v.voice, 500) };
  }
  const notes = [];
  for (const n of (parsed && Array.isArray(parsed.panel) ? parsed.panel : [])) {
    const note = str(n && n.note, 400);
    if (!note) continue;
    let scene = str(n.scene, 20);
    if (scene && !known.has(scene)) { dropped.scenes++; scene = ''; }
    notes.push({ scene, note });
    if (notes.length === 5) break;
  }
  return { verdicts, notes, dropped };
}

/* ---- the finished result -------------------------------------- */

/**
 * The whole result, as the Desk lists it and a kept document stores it.
 * opts { panel, run, synth, model, sig, at }
 */
export function buildResult({ panel, run, synth, model = '', sig = '', at = '', unit = '' }) {
  const s = spread(run.curves);
  /* A viewer with no usable verdict — left out of the reply, or given a
     value that is not allowed — and no walkout to stand in for one.
     Counted, so the note says so instead of the row inventing "Mixed". */
  const noVerdict = panel.filter((p) => !run.walkouts[p.id] && !(synth.verdicts[p.id] && synth.verdicts[p.id].verdict)).length;
  return {
    sig, at, model,
    /* Quick mode's rows are beats (or passages), not scenes; a scene
       run carries no `unit` at all, so its stored shape is unchanged. */
    ...(UNITS[unit] && unit !== 'Sc' ? { unit } : {}),
    panel: panel.map((p) => ({ ...p })),
    order: run.order.slice(),
    curves: run.curves, mean: run.mean,
    moments: run.moments, walkouts: run.walkouts,
    verdicts: synth.verdicts, notes: synth.notes,
    slumps: slumps(run, { panel }), splits: splits(run, { panel }),
    spread: s, agreed: s != null && s < AGREE_SPREAD,
    dropped: {
      scenes: run.dropped.scenes + synth.dropped.scenes,
      quotes: run.dropped.quotes,
      viewers: run.dropped.viewers + synth.dropped.viewers,
      scores: run.dropped.scores,
      verdicts: noVerdict
    }
  };
}

/* What a row's number counts. A screenplay run counts scenes ('Sc',
   the default and the only unit before quick mode); quick mode counts
   the beats of the beat sheet, or — a synopsis with no beat sheet —
   its passages. Every sentence below reads its words from here, so
   a scene run's prose is byte-identical to what it always was. */
export const UNITS = Object.freeze({
  Sc: { tag: 'Sc', one: 'scene', many: 'scenes', where: 'script' },
  Beat: { tag: 'Beat', one: 'beat', many: 'beats', where: 'story' },
  Passage: { tag: 'Passage', one: 'passage', many: 'passages', where: 'story' }
});
const unitOf = (res) => UNITS[(res && res.unit) || 'Sc'] || UNITS.Sc;

/* The word for a viewer's verdict. A walkout stands in for a missing
   verdict (the curve is the record); anything else missing is SAID to
   be missing, never filled in as "Mixed". '' when there is none. */
export const NO_VERDICT = 'No verdict in the reply';
function verdictWord(res, id) {
  const v = res.verdicts && res.verdicts[id];
  if (v && VERDICT_WORD[v.verdict]) return VERDICT_WORD[v.verdict];
  if (res.walkouts && res.walkouts[id]) return VERDICT_WORD.walkout;
  return '';
}

function momentFor(res, id, n, kinds) {
  return res.moments.find((m) => m.viewer === id && m.scene === n && (!kinds || kinds.includes(m.kind))) || null;
}

function viewerDetail(res, p) {
  const v = res.verdicts[p.id] || {};
  const bits = [];
  const out = res.walkouts[p.id];
  const T = unitOf(res).tag + ' ';
  if (out) bits.push('Walked out at ' + T + out);
  if (v.hooked) {
    const m = momentFor(res, p.id, v.hooked, ['hooked', 'moved']);
    bits.push('Hooked at ' + T + v.hooked + (m ? ': ' + m.note : ''));
  }
  if (v.lost && v.lost !== out) {
    const m = momentFor(res, p.id, v.lost, ['lost', 'bored']);
    bits.push('Lost at ' + T + v.lost + (m ? ': ' + m.note : ''));
  }
  return bits.join(' · ');
}

/** The Desk's list rows: one per viewer, then the panel-wide rows. */
export function resultItems(res) {
  const items = [];
  const T = unitOf(res).tag + ' ';
  for (const p of res.panel) {
    const v = res.verdicts[p.id];
    const word = verdictWord(res, p.id) || NO_VERDICT;
    items.push({
      id: 'v:' + p.id,
      text: p.label + ' — ' + word + (v && v.voice ? '. “' + v.voice + '”' : ''),
      detail: viewerDetail(res, p)
    });
  }
  res.slumps.forEach((s, i) => items.push({
    id: 'slump:' + i,
    text: s.viewers + ' of ' + s.of + ' lost interest between ' + T + s.from + ' and ' + T + s.to + '.'
  }));
  res.splits.forEach((s, i) => items.push({ id: 'split:' + i, text: 'The panel split on ' + T + s.scene + '.' }));
  res.notes.forEach((n, i) => items.push({ id: 'note:' + i, text: (n.scene ? T + n.scene + ' — ' : '') + n.note }));
  return items;
}

/** The Desk's note under the list: what this is, and what was dropped. */
export function resultNote(res) {
  const L = [SIMULATED_LINE];
  if (res.agreed) L.push('The panel barely disagreed, so treat this as one reader\'s view rather than ' + res.panel.length + '.');
  const d = res.dropped;
  const U = unitOf(res);
  if (d.quotes) L.push(plural(d.quotes, 'quote was', 'quotes were') + ' removed because they were not word for word in your ' + U.where + '.');
  if (d.scenes) L.push(plural(d.scenes, 'reaction was', 'reactions were') + ' dropped because they named a ' + U.one + ' that is not in the ' + U.where + '.');
  if (d.viewers) L.push(plural(d.viewers, 'reaction line was', 'reaction lines were') + ' dropped because they named a viewer who is not on the panel, repeated one, or came after that viewer walked out.');
  if (d.scores) L.push(plural(d.scores, 'score was', 'scores were') + ' dropped because they could not be read or came after that viewer walked out.');
  if (d.verdicts) L.push(plural(d.verdicts, 'viewer has', 'viewers have') + ' no verdict, because the reply left ' + (d.verdicts === 1 ? 'it' : 'them') + ' out or gave one that is not allowed.');
  if (res.model) L.push('Read by ' + res.model + '.');
  return L.join('\n');
}

/** The result as plain prose: the body of a kept document, readable in
    the Documents tab and in a backup. `keep` (a Set of item ids) limits
    the rows to the ones the writer ticked; absent means all. */
export function resultText(res, keep = null) {
  const on = (id) => !keep || keep.has(id);
  const U = unitOf(res);
  const L = ['AUDIENCE TEST' + (U === UNITS.Sc ? '' : ' OF THE STORY') + ' — ' + plural(res.panel.length, 'VIEWER', 'VIEWERS'), SIMULATED_LINE];
  if (res.agreed) L.push('The panel barely disagreed, so treat this as one reader\'s view.');
  L.push('');
  for (const p of res.panel) {
    if (!on('v:' + p.id)) continue;
    const v = res.verdicts[p.id] || {};
    L.push(p.label.toUpperCase() + ' — ' + (verdictWord(res, p.id) || NO_VERDICT));
    L.push('  ' + p.who);
    if (v.voice) L.push('  “' + v.voice + '”');
    const det = viewerDetail(res, p);
    if (det) L.push('  ' + det);
    for (const m of res.moments.filter((x) => x.viewer === p.id)) {
      L.push('  · ' + U.tag + ' ' + m.scene + ' (' + m.kind + '): ' + (m.quote ? '“' + m.quote + '” — ' : '') + m.note);
    }
    L.push('');
  }
  const panelRows = resultItems(res).filter((it) => !it.id.startsWith('v:') && on(it.id));
  if (panelRows.length) {
    L.push('THE PANEL');
    for (const it of panelRows) L.push('  · ' + it.text);
    L.push('');
  }
  L.push('ENGAGEMENT PER ' + U.one.toUpperCase() + ' (panel mean, -2 to +2)');
  L.push('  ' + res.order.map((n, i) => n + ':' + (res.mean[i] == null ? '-' : res.mean[i])).join('  '));
  if (res.model) L.push('', 'Read by ' + res.model + '.');
  return L.join('\n');
}

/* ================================================================
   QUICK MODE — the story, before there is a screenplay
   ----------------------------------------------------------------
   Plan §1 and §4, phase 4. The same panel reads the Story page's
   synopsis and beat sheet in ONE request and scores per BEAT instead
   of per scene, so a writer can test the story before a page of
   screenplay exists. One request, because a beat sheet is a few
   thousand words: there are no parts, no checkpoint and no Resume.

   THE SAME CHECKS, BY REUSE. A quick reply is reshaped into a part
   (`beat` → `scene`) and read by readPart(), then merged by
   mergeParts() and its verdicts read by readSynth(), so every rule
   in plan §5 holds without a second copy of it: an unknown beat is
   dropped and counted, a quote not word for word in the story is
   stripped and counted, scores are clamped, a missing score is
   null, and nothing is scored after a walkout. The result is
   buildResult()'s with `unit: 'Beat'` (or 'Passage'), so
   resultItems / resultNote / resultText print "Beat 4", not "Sc 4".

   WHAT A UNIT IS. Each beat of the framework with something written
   under it (its steps, else the passages tagged to it), numbered by
   its place in the framework so the numbers are stable when an
   earlier beat is still empty. A story with no beat sheet but a
   synopsis is read in passages (its paragraphs), numbered 1..N.
   Nothing in the story at all is a sentence, not an empty request.
   ================================================================ */
export const QUICK_UNIT_CHARS = 2400;     // per beat, as the prompt carries it
export const QUICK_SYNOPSIS_CHARS = 16000;

const para = (t) => String(t ?? '').split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

/**
 * The units a quick run scores, from plain data.
 *   beats    [{ n?, label, text }] in framework order (n defaults to
 *            the 1-based position, so an empty beat keeps its number)
 *   synopsis the Story page's synopsis
 * Returns { units: [{ n, heading, text }], unit: 'Beat'|'Passage'|'' }.
 */
export function quickUnits({ beats = [], synopsis = '' } = {}) {
  const units = [];
  (Array.isArray(beats) ? beats : []).forEach((b, i) => {
    const text = String((b && b.text) ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    units.push({ n: String((b && b.n) || (i + 1)), heading: str(b && b.label, 80) || 'Beat ' + (i + 1), text: text.slice(0, QUICK_UNIT_CHARS) });
  });
  if (units.length) return { units, unit: 'Beat' };
  let ps = para(synopsis);
  /* One long paragraph is still a story with a shape: cut it into
     runs of three sentences so the panel has somewhere to be lost. */
  if (ps.length === 1) {
    const sent = ps[0].match(/[^.!?।]+[.!?।]+["'”’)]*|[^.!?।]+$/g) || [ps[0]];
    if (sent.length > 3) {
      ps = [];
      for (let i = 0; i < sent.length; i += 3) ps.push(sent.slice(i, i + 3).join(' ').replace(/\s+/g, ' ').trim());
    }
  }
  ps.forEach((t, i) => units.push({ n: String(i + 1), heading: 'Passage ' + (i + 1), text: t.slice(0, QUICK_UNIT_CHARS) }));
  return { units, unit: units.length ? 'Passage' : '' };
}

export const QUICK_EMPTY = 'There is no synopsis and no beat sheet yet, so there is no story to screen. Write a synopsis or a step under a beat first.';

export const QUICK_SYSTEM = [
  'You run a test screening of a film STORY for a Tamil film production, before the',
  'screenplay exists. You play a panel of viewers, each described below, reading the',
  'synopsis and the beat sheet as if watching the film it describes.',
  '',
  'Rules:',
  '· Each viewer reacts by THEIR OWN tastes as described. Viewers with different tastes',
  '  should disagree where their tastes would; do not make them agree for its own sake.',
  '· Score every beat for every viewer still watching, from -2 (lost them) through 0',
  '  (neutral) to +2 (fully gripped). Cite the beat by the number given.',
  '· A viewer who would stop watching walks out: give a "walkout" moment at that beat and',
  '  set walkedOutAt. A viewer who has walked out is not scored on any later beat.',
  '· A moment may quote the story; a quote must be copied character for character from',
  '  the text given, with no paraphrase, ellipsis or translation. Leave it empty rather',
  '  than invent one.',
  '· React to what is written. Do not invent plot, characters or scenes.',
  '· Then each viewer\'s verdict on the story as a whole, in their own voice, and up to',
  '  five observations about the panel.',
  '· Quote the story in its own language. Write everything else in English.',
  '· Answer only with the JSON the schema describes.'
].join('\n');

export function quickSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['viewers', 'panel'],
    properties: {
      viewers: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['viewer', 'scores', 'moments', 'walkedOutAt', 'verdict', 'hooked', 'lost', 'voice'],
          properties: {
            viewer: { type: 'string', description: 'the viewer id given, copied exactly' },
            scores: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['beat', 'score'],
                properties: {
                  beat: { type: 'string', description: 'the beat number given, copied exactly' },
                  score: { type: 'integer', description: '-2 lost, -1 drifting, 0 neutral, 1 engaged, 2 gripped' }
                }
              }
            },
            moments: {
              type: 'array',
              description: 'at most ' + MOMENTS_PER_VIEWER + ' moments that mattered to this viewer',
              items: {
                type: 'object', additionalProperties: false, required: ['beat', 'kind', 'quote', 'note'],
                properties: {
                  beat: { type: 'string' },
                  kind: { type: 'string', enum: MOMENT_KINDS.slice() },
                  quote: { type: 'string', description: 'a short span copied VERBATIM from the story, or empty' },
                  note: { type: 'string', description: 'one sentence in this viewer\'s own voice' }
                }
              }
            },
            walkedOutAt: { type: 'string', description: 'the beat number they walked out at, or empty' },
            verdict: { type: 'string', enum: VERDICTS.slice() },
            hooked: { type: 'string', description: 'the beat number that hooked them most, or empty' },
            lost: { type: 'string', description: 'the beat number where they were most lost, or empty' },
            voice: { type: 'string', description: 'one or two sentences, in this viewer\'s own voice, on the story as a whole' }
          }
        }
      },
      panel: {
        type: 'array',
        description: 'up to five observations about the panel as a whole',
        items: {
          type: 'object', additionalProperties: false, required: ['beat', 'note'],
          properties: {
            beat: { type: 'string', description: 'a beat number the observation centres on, or empty' },
            note: { type: 'string' }
          }
        }
      }
    }
  };
}

/**
 * The one quick request's user prompt.
 * job { panel, units, unit, synopsis?, title?, context?, refine? }
 * The synopsis is printed beside the beats when the units ARE beats;
 * when they are the synopsis's own passages it would be sent twice.
 */
export function buildQuickPrompt(job) {
  const unit = UNITS[job.unit] || UNITS.Beat;
  const L = [];
  if (job.context) L.push(String(job.context).trim(), '');
  L.push('The story' + (job.title ? ' "' + str(job.title, 120) + '"' : '') + ' — read before the screenplay is written.');
  L.push('');
  L.push('THE PANEL (id | who they are):');
  L.push(panelBlock(job.panel, null, null));
  const syn = String(job.synopsis ?? '').trim();
  if (unit === UNITS.Beat && syn) {
    L.push('', 'THE SYNOPSIS:', syn.slice(0, QUICK_SYNOPSIS_CHARS));
  }
  L.push('', unit === UNITS.Beat ? 'THE BEAT SHEET, IN ORDER:' : 'THE SYNOPSIS, IN PASSAGES:');
  for (const u of job.units || []) {
    L.push('', '=== ' + unit.tag.toUpperCase() + ' ' + u.n + ' — ' + u.heading + ' ===', u.text);
  }
  L.push('');
  L.push('For every viewer, score every ' + unit.one + ' above (cite it by its number in the "beat" field), give up to '
    + MOMENTS_PER_VIEWER + ' moments, a walkout if they would stop watching, and their verdict.');
  if (job.refine) L.push('', String(job.refine).trim());
  return L.join('\n');
}

/**
 * The quick reply, checked by the same readers a screenplay run uses.
 * ctx { panel, units, isQuote(quote, beatN) }
 * Returns a mergeParts()-shaped run with its read verdicts on `synth`,
 * so buildResult({ panel, run, synth: run.synth, unit }) gives the
 * result the Desk shows — buildResult reads only the fields it names.
 */
export function readQuick(parsed, ctx) {
  const ns = (ctx.units || []).map((u) => String(u.n));
  const viewers = parsed && Array.isArray(parsed.viewers) ? parsed.viewers : [];
  const asPart = {
    viewers: viewers.map((v) => v && typeof v === 'object' ? {
      viewer: v.viewer,
      scores: (Array.isArray(v.scores) ? v.scores : []).map((s) => (s && typeof s === 'object' ? { scene: s.beat, score: s.score } : s)),
      moments: (Array.isArray(v.moments) ? v.moments : []).map((m) => (m && typeof m === 'object' ? { scene: m.beat, kind: m.kind, quote: m.quote, note: m.note } : m)),
      state: '',
      walkedOutAt: v.walkedOutAt
    } : v)
  };
  const part = readPart(asPart, { panel: ctx.panel, sceneNs: ns, isQuote: ctx.isQuote, walkedOut: [] });
  const run = mergeParts([part], { panel: ctx.panel, scenes: (ctx.units || []).map((u) => ({ n: u.n, heading: u.heading })) });
  /* Verdicts only for the viewers readPart kept, so a stranger in the
     reply is dropped and counted once, not twice. */
  const keptIds = new Set(Object.keys(part.viewers));
  const synthIn = {
    verdicts: viewers.filter((v) => v && keptIds.has(str(v.viewer, 40)))
      .map((v) => ({ viewer: v.viewer, verdict: v.verdict, hooked: v.hooked, lost: v.lost, voice: v.voice })),
    panel: (parsed && Array.isArray(parsed.panel) ? parsed.panel : []).map((n) => (n && typeof n === 'object' ? { scene: n.beat, note: n.note } : n))
  };
  run.synth = readSynth(synthIn, { panel: ctx.panel, run });
  return run;
}

/* ================================================================
   ASK A VIEWER — one follow-up question to one simulated viewer
   ----------------------------------------------------------------
   Plan §10 item 4. After a run, the writer can put a question to one
   viewer ("why did you leave at Sc 41?"). It is ONE request, and what
   goes in is that viewer's own record from the run — their curve,
   their moments, their walkout and verdict — not the pages, so a
   follow-up costs a few hundred tokens and cannot quote a script it
   was never sent. A scene the answer points to that the run does not
   have is dropped and counted, exactly as a reply's unknown scene is.

   NAMING THE VIEWER. viewerNamed() finds the viewer a sentence is
   addressed to, by id or by label, so the same rule serves the ask
   and a refine of the full test that is aimed at one viewer
   (viewerRefine): the refine still re-sends the verdict request
   against the same schema, only with that viewer asked to answer in
   their voice — no new wire format.
   ================================================================ */

/** The viewer a sentence names, by id or label (longest match wins),
    or null. "the festival programmer", "festival", "Festival
    programmer:" all find the same viewer. */
export function viewerNamed(text, panel) {
  const t = ' ' + String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ') + ' ';
  let best = null, len = 0;
  for (const p of Array.isArray(panel) ? panel : []) {
    for (const name of [p && p.id, p && p.label]) {
      const k = ' ' + String(name ?? '').toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ').trim() + ' ';
      if (k.trim().length < 3) continue;
      if (t.includes(k) && k.length > len) { best = p; len = k.length; }
    }
  }
  return best;
}

/** The extra line a refine of the full test carries when its latest
    instruction is addressed to one viewer; '' when it is not. */
export function viewerRefine(instructions, panel) {
  const asks = [].concat(instructions || []).map((x) => String(x ?? '').trim()).filter(Boolean);
  const p = asks.length ? viewerNamed(asks[asks.length - 1], panel) : null;
  if (!p) return '';
  return 'The writer\'s latest request is addressed to ' + p.label + ' (' + p.id + '). Answer it in ' + p.label
    + '\'s own voice, in the "voice" of their verdict, from what they scored and said. Keep every other viewer\'s verdict as it was.';
}

export const ASK_SYSTEM = [
  'You are one viewer from a simulated test screening of a Tamil film, described below.',
  'The writer is asking you a follow-up question about what you watched.',
  '',
  'Rules:',
  '· Answer in the first person, in this viewer\'s own voice and by their own tastes.',
  '· Answer only from the record given: the scores you gave, the moments you noted, where',
  '  you walked out. Do not invent plot, characters or scenes that are not in it.',
  '· Point to the scenes (or beats) your answer rests on by the numbers given.',
  '· A few sentences, not an essay.',
  '· Answer only with the JSON the schema describes.'
].join('\n');

export function askSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['answer', 'cites'],
    properties: {
      answer: { type: 'string', description: 'the viewer\'s answer, first person, in their own voice' },
      cites: {
        type: 'array',
        description: 'up to five scenes (or beats) the answer rests on',
        items: {
          type: 'object', additionalProperties: false, required: ['scene', 'note'],
          properties: {
            scene: { type: 'string', description: 'a number from the record, copied exactly' },
            note: { type: 'string', description: 'one line: what happened for this viewer there' }
          }
        }
      }
    }
  };
}

/**
 * The ask prompt: one viewer's record from a result, and the question.
 * job { res (buildResult), viewer (id), question, title?, refine? }
 */
export function buildAskPrompt(job) {
  const res = job.res;
  const U = unitOf(res);
  const p = (res.panel || []).find((x) => x.id === job.viewer);
  if (!p) return '';
  const curve = (res.curves && res.curves[p.id]) || [];
  const v = (res.verdicts && res.verdicts[p.id]) || {};
  const heads = new Map((job.headings || []).map((h) => [String(h.n), h.heading]));
  const L = [];
  L.push('YOU ARE: ' + p.label + ' — ' + p.who + (p.cares ? ' ' + p.cares : ''));
  L.push('');
  L.push('What you watched' + (job.title ? ': "' + str(job.title, 120) + '"' : '') + (U === UNITS.Sc ? ', a screenplay' : ', a story told in ' + U.many) + '.');
  L.push('');
  L.push('YOUR SCORES PER ' + U.one.toUpperCase() + ' (-2 lost you … +2 gripped you; "-" not scored'
    + (res.walkouts && res.walkouts[p.id] ? ', after you walked out' : '') + '), with the panel\'s mean beside it:');
  (res.order || []).forEach((n, i) => {
    const h = heads.get(n);
    L.push(U.tag + ' ' + n + (h ? ' (' + h + ')' : '') + ': ' + (curve[i] == null ? '-' : curve[i])
      + '   panel ' + (res.mean && res.mean[i] != null ? res.mean[i] : '-'));
  });
  const ms = (res.moments || []).filter((m) => m.viewer === p.id);
  if (ms.length) {
    L.push('', 'WHAT YOU NOTED:');
    for (const m of ms) L.push('· ' + U.tag + ' ' + m.scene + ' (' + m.kind + '): ' + (m.quote ? '“' + m.quote + '” — ' : '') + m.note);
  }
  const out = res.walkouts && res.walkouts[p.id];
  /* No verdict line when the run has none: the viewer is not told to
     defend an opinion they never gave. */
  const word = verdictWord(res, p.id);
  if (word) {
    L.push('', 'YOUR VERDICT: ' + word + (out ? ' (you walked out at ' + U.tag + ' ' + out + ')' : '')
      + (v.voice ? ' — “' + v.voice + '”' : ''));
  } else if (v.voice) {
    L.push('', 'WHAT YOU SAID AFTERWARDS: “' + v.voice + '”');
  }
  L.push('', 'THE WRITER ASKS YOU:', str(job.question, 1200));
  L.push('', 'Answer as ' + p.label + '.');
  if (job.refine) L.push('', String(job.refine).trim());
  return L.join('\n');
}

/** The ask reply, checked: a cited number the run does not have is
    dropped and counted. Returns { answer, cites, dropped: { scenes } }. */
export function readAsk(parsed, { res }) {
  const known = new Set((res && res.order) || []);
  const dropped = { scenes: 0 };
  const cites = [];
  for (const c of (parsed && Array.isArray(parsed.cites) ? parsed.cites : [])) {
    const n = str(c && c.scene, 20);
    const note = str(c && c.note, 300);
    if (!n || !known.has(n)) { dropped.scenes++; continue; }
    if (cites.some((x) => x.scene === n)) continue;
    cites.push({ scene: n, note });
    if (cites.length === 5) break;
  }
  return { answer: str(parsed && parsed.answer, 2000), cites, dropped };
}

/** The ask answer as the Desk reads it. */
export function askText(ans, { res, viewer, question = '', model = '' }) {
  const U = unitOf(res);
  const p = (res.panel || []).find((x) => x.id === viewer) || { label: viewer };
  const L = [];
  if (question) L.push('You asked ' + p.label + ': ' + str(question, 400), '');
  L.push(p.label + ':', '“' + ans.answer + '”');
  if (ans.cites.length) {
    L.push('', 'What the answer rests on:');
    for (const c of ans.cites) L.push('· ' + U.tag + ' ' + c.scene + (c.note ? ' — ' + c.note : ''));
  }
  L.push('', SIMULATED_LINE + ' This viewer answers from the record of the run, not from your pages.');
  if (ans.dropped.scenes) L.push(plural(ans.dropped.scenes, 'reference was', 'references were') + ' dropped because they named a ' + U.one + ' that is not in the run.');
  if (model) L.push('Read by ' + model + '.');
  return L.join('\n');
}

export default {
  PERSONAS, personaById, PANEL_DEFAULT, PANEL_MIN, PANEL_MAX, MOMENT_KINDS, VERDICTS, NO_VERDICT, SIMULATED_LINE,
  defaultPanel, customPersona, normalisePanel, planAudience, partMaxTokens,
  AUDIENCE_SYSTEM, partSchema, buildPartPrompt, readPart, mergeParts, spread, slumps, splits,
  synthSchema, buildSynthPrompt, readSynth, buildResult, resultItems, resultNote, resultText,
  UNITS, quickUnits, QUICK_EMPTY, QUICK_SYSTEM, quickSchema, buildQuickPrompt, readQuick,
  viewerNamed, viewerRefine, ASK_SYSTEM, askSchema, buildAskPrompt, readAsk, askText
};
