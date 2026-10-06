/* ============================================================
   WRAP CARDS — "Part I done", at the end of each part
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, revision 3 §5 (rev. 2 §5.6). When
   every step in a part has every check ticked, a short card after the
   part's last step says what the part produced — the logline, the
   beats, the scene count — and links the next part and its first
   tool. Untick one and the card goes.

   DERIVED, STORED NOWHERE. The parts come from src/data/steps.stages.json
   (through src/ui/step-stages.js), grouped in page order, so the card
   follows the sidecar if a boundary moves. "Done" is read from the
   checklist items' own class — `checked` on the feature, `done` on
   the short, the class each page's loadData() and toggle already set —
   so there is no "part complete" flag to disagree with the ticks.
   The summary reads the fields on the page and the models; it writes
   nothing, so the idle-write assertion has nothing to see.

   It is a div, not a section: the step rail and the jump menu are
   built from `section.step`, and a card is not a step.
   ============================================================ */
import '../styles/blueprint-handoffs.css';
import { h } from '../lib/dom.js';
import { stageInfo, resolveTool, partsOf, roman } from './step-stages.js';
import { listScenes, totalEighths, formatEighths } from '../lib/scenes.js';
import { calendarDays } from '../lib/locations.js';
import { listContacts } from '../lib/contacts.js';
import { listShots } from '../lib/shots.js';
import { loadScript, pageCount, formatPages } from '../lib/script.js';
import { loadStory } from '../lib/story.js';

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const NS = { feature: ['feature', 'production'], short: ['short'] };

const val = (key) => {
  const el = document.querySelector(`[data-key="${key}"]`);
  return el && typeof el.value === 'string' ? el.value.trim() : '';
};
const clip = (s, n = 140) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

/* ---- what a part produced -------------------------------------
   One line per fact the app already holds. A fact that is empty is
   left out rather than printed as zero — the card is a summary of
   work done, and the checks already say the part is done. */
const SUMMARY = {
  story(page) {
    const out = [];
    const log = page === 'short'
      ? val('s2_log_final') || val('s2_log2') || val('s2_log1')
      : val('s2_log_final') || val('s2_log2') || val('s2_log1');
    if (log) out.push('Logline: ' + clip(log));
    const beatKeys = page === 'short'
      ? ['b1_setup', 'b2_disturb', 'b3_escalate', 'b4_turn', 'b5_image']
      : Array.from({ length: 15 }, (_, i) => 'b' + String(i + 1).padStart(2, '0'));
    const beats = beatKeys.filter((k) => val(k)).length;
    if (beats) out.push(beats + ' of ' + beatKeys.length + ' beats written');
    const steps = loadStory().outline.length;
    if (steps) out.push(plural(steps, 'step') + ' in the Story page’s step outline');
    return out;
  },
  screenplay() {
    const out = [];
    const scenes = listScenes();
    if (scenes.length) out.push(plural(scenes.length, 'scene') + ' in the Breakdown · ' + formatEighths(totalEighths(scenes)) + ' pages');
    const els = loadScript().elements || [];
    if (els.length) out.push(formatPages(pageCount(els)) + ' pages in Write');
    return out;
  },
  preprod() {
    const out = [];
    const scenes = listScenes();
    const days = scenes.length ? calendarDays(scenes).length : 0;
    if (days) out.push(plural(days, 'shoot day'));
    const shots = listShots().length;
    if (shots) out.push(plural(shots, 'shot') + ' on the shot list');
    const people = listContacts().length;
    if (people) out.push(plural(people, 'person', 'people') + ' on the unit list');
    return out;
  },
  production() {
    const scenes = listScenes();
    if (!scenes.length) return [];
    const shot = scenes.filter((s) => s.shotState === 'shot').length;
    return [shot + ' of ' + plural(scenes.length, 'scene') + ' marked shot'];
  },
  post() {
    const out = [];
    const lock = val('po_lock_date');
    if (lock) out.push('Picture lock: ' + clip(lock, 60));
    const list = val('po_deliver_list');
    if (list) out.push('Delivering: ' + clip(list, 100));
    return out;
  }
};

/* ---- the parts, as the page lays them out --------------------- */

function infoFor(page, id) {
  for (const ns of NS[page]) {
    const info = stageInfo(ns, id);
    if (info) return { ns, info };
  }
  return null;
}

/** Consecutive steps that share a part, in page order. A final-lock
 *  step is not a part and gets no card. */
function groups(page, root) {
  const out = [];
  for (const sec of root.querySelectorAll('section.step[id]')) {
    const hit = infoFor(page, sec.id);
    if (!hit || hit.info.lock || !hit.info.stages.length) continue;
    const key = hit.info.parts.join('-');
    const last = out[out.length - 1];
    if (last && last.key === key) last.steps.push(sec);
    else out.push({ key, parts: hit.info.parts, stages: hit.info.stages, steps: [sec], tools: [] });
    out[out.length - 1].tools.push(...hit.info.tools);
  }
  return out;
}

const partName = (g) => (g.parts.length > 1
  ? 'Parts ' + roman(g.parts[0]) + '–' + roman(g.parts[g.parts.length - 1])
  : 'Part ' + roman(g.parts[0]));

function isDone(g, cls) {
  return g.steps.every((sec) => [...sec.querySelectorAll('.step-check li[data-key]')].every((li) => li.classList.contains(cls)));
}

function card(page, g, next) {
  const stage = g.stages.map((s) => s.label).join(' & ');
  const facts = g.stages.flatMap((s) => (SUMMARY[s.id] ? SUMMARY[s.id](page) : []));
  const kids = [
    h('p.bpw-eyebrow', { text: (partName(g) + ' · ' + stage).toUpperCase() }),
    h('h3.bpw-title', { text: partName(g) + ' done.' }),
    h('p.bpw-lead', { text: 'Every check in ' + plural(g.steps.length, 'step') + ' is ticked.' })
  ];
  if (facts.length) kids.push(h('ul.bpw-facts', {}, facts.map((f) => h('li', { text: f }))));
  const links = [];
  if (next) {
    const cover = page === 'feature' ? (partsOf('feature').find((p) => p.part === next.parts[0]) || {}).cover : '';
    const target = cover && document.getElementById(cover) ? cover : next.steps[0].id;
    links.push(h('a.btn.bpw-next', { href: '#' + target, text: 'On to ' + partName(next) + ' · ' + next.stages.map((s) => s.label).join(' & ') + ' →' }));
    const tool = next.tools.map(resolveTool).find(Boolean);
    if (tool) links.push(h('a.btn.bpw-tool', { href: tool.href, text: 'Open ' + tool.label + ' →' }));
  } else {
    links.push(h('a.btn.bpw-tool', { href: 'dashboard.html', text: 'Open the Dashboard →' }));
  }
  kids.push(h('div.bpw-links', {}, links));
  return h('div.bpw-card', { 'data-bpw': g.key, role: 'status' }, kids);
}

/** Insert, refresh or remove every wrap card. Reads only. */
export function refreshWraps(page, root = document) {
  const cls = page === 'short' ? 'done' : 'checked';
  const gs = groups(page, root);
  gs.forEach((g, i) => {
    const old = root.querySelector(`.bpw-card[data-bpw="${g.key}"]`);
    if (!isDone(g, cls)) { if (old) old.remove(); return; }
    const fresh = card(page, g, gs[i + 1] || null);
    if (old) { old.replaceWith(fresh); return; }
    /* After the part's last step — and after the Story kit's band if
       that sits there (step 10 → "the story so far"). */
    let at = g.steps[g.steps.length - 1];
    while (at.nextElementSibling && at.nextElementSibling.matches('.sk-band')) at = at.nextElementSibling;
    at.after(fresh);
  });
}

/** Watch the checklists; a tick or an untick redraws. The observer
 *  sees only class changes on checklist items, so typing never wakes
 *  it. */
export function mountWraps(page, root = document) {
  if (!NS[page]) return;
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => refreshWraps(page, root), 30); };
  const mo = new MutationObserver((recs) => {
    if (recs.some((r) => r.target.matches && r.target.matches('.step-check li[data-key]'))) later();
  });
  root.querySelectorAll('.step-check').forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['class'], subtree: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') later(); });
  refreshWraps(page, root);
}

export default { mountWraps, refreshWraps };
