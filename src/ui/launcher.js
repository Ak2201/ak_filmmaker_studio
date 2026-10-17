/* ============================================================
   THE LAUNCHER — every module, by phase, on one page
   ------------------------------------------------------------
   This is the piece that lets the top bar stay small.

   StudioBinder's project overview is a launcher grid: a row per
   phase, a coloured phase tile, then a tile per module. That is how
   their 70px rail and 60px bar get away with listing four things and
   five — the complete map is one page, not permanent chrome. The
   arrangement is theirs; the hues, type and wording are this app's.

   It is built from src/data/navigation.json like the rest of the
   shell, so a module added there appears here with no edit. Three
   things it says that a grid of links does not:

   1. THE ICON. Each phase and each module carries a `icon` glyph in
      navigation.json — geometric and typographic, never emoji,
      because the studio is printed matter and a colour emoji is
      somebody else's UI pasted in. Rendered aria-hidden: it is a
      second read of the label, not a replacement for it.

   2. WHAT IS IN IT. Every tile reports the state of the real model
      behind it — scenes.js, shots.js, script.js, contacts.js,
      locations.js and the two blueprint blobs — so the map tells you
      where the work IS, not only where the pages are. Nothing here
      is a stored count: the whole snapshot is read once per render
      and every number is derived from it, which is the same rule
      that keeps the step list in JSON. A module with no probe simply
      renders no state line rather than inventing one.

      Reads only. The launcher must never write during a render: the
      idle-write assertion in verify is watching, and a map is not a
      thing that should change what it maps.

   3. WHERE YOU ARE. The page is matched back against the IA — the
      global rail entries as well as the phase modules — so the head
      says "YOU ARE HERE · Breakdown → Scene List" and the matching
      tile carries a hue rule, a THIS PAGE marker and aria-current.
      This is the launcher's other job. The complaint that started
      the rebuild was not "I cannot find the module", it was "I do
      not know where I am", and a map that does not show your own
      position answers the first question only.

   `status` is printed rather than hidden: a map that quietly showed
   equal tiles would be a lie the first click exposes. A planned tile
   is a <button> carrying data-action="module-planned", which
   shell.js already binds globally — it says what the module will do
   instead of navigating nowhere. No new handler, and nothing here
   knows what a toast is.
   ============================================================ */
/* navigation.json is read through navmodel.js (phases/globals/
   moduleGroups), which applies the region filter — see its header.
   No unfiltered second view of the map lives here. */
import { moduleGroups, hueClassOf, phases, globals } from '../lib/navmodel.js';
import { h } from '../lib/dom.js';
import { iconSpan } from './icon.js';
import { safe, snapshot, stateOf } from '../lib/launcher-model.js';
import '../styles/launcher.css';

/* TWO derived figures, and which one a sentence quotes is not a detail.
   MODULE_COUNT is how many modules the MAP has; BUILT_MODULE_COUNT is
   how many a visitor can actually open. The launcher prints both, side
   by side ("N OF M BUILT"), under a label that says it is a map and a
   deck that says the ones still to come say so — so the total is the
   right figure here, because the qualifier is right next to it.

   BUILT_MODULE_COUNT is the exported one, because what quotes it is
   PROSE: the hub's first-run deck, the one sentence somebody reads
   before they have committed anything. A promise has no qualifier
   beside it, so it has to be the figure that is true today.
   navigation.json's own _about sets that rule — "Never let a module
   claim 'built' before it is" — and this file already honours it three
   ways: the SOON/PARTIAL flag, a <button> instead of an <a>, and the
   pair below.

   The deck hand-wrote "Twenty-two modules" and had drifted two behind
   the data, which is what invariant 2 is for. But deriving it from the
   total would have swapped a stale promise for a premature one: today
   built === total, so nothing would look wrong until the next
   status: 'planned' module landed, and then a stranger would be told
   the studio has a tool that navigates nowhere. Derive the right
   number, not merely a derived one. */
/* Counted over moduleGroups(), not nav.phases: the Library's three
   reference tools moved off the Story stage on 6 Oct 2026 and are
   still modules — on the map below as the Library's own row. */
/* COUNTED AT IMPORT, which is correct only because the region is
   fixed for the life of a document: the Settings control RELOADS
   after a change rather than notifying, precisely so these three
   and every other derived count cannot go stale. */
const STAGE_COUNT = phases().length;
const MODULE_COUNT = moduleGroups().reduce((n, p) => n + p.modules.length, 0);
export const BUILT_MODULE_COUNT = moduleGroups().reduce(
  (n, p) => n + p.modules.filter((m) => m.status === 'built').length, 0);

/* READING THE STUDIO — the snapshot, the per-module probes and the three
   blueprint-era blobs they read — is src/lib/launcher-model.js. Reads only:
   the launcher must never write during a render. */
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/* ------------------------------------------------------------
   WHERE AM I
   ------------------------------------------------------------
   Same question shell.js answers for the phase bar, asked again
   here because the launcher is the surface with room to answer it in
   words. Two differences: the global rail entries count as places too
   (the hub is somewhere, and "nowhere on the map" is a worse answer
   than "Home"), and the filename is compared with `.html` stripped so
   the clean URLs that vercel.json and netlify.toml serve match as
   well as the built filenames do.
   ------------------------------------------------------------ */

const base = (p) => String(p || '').split('/').pop().toLowerCase().replace(/\.html$/, '') || 'index';

function whereAmI() {
  const here = base(location.pathname);
  const hash = location.hash;

  // A module whose fragment matches too — the exact answer. Shelves
  // count here (library.html#dissection is the Library's Dissection),
  // and only here: library.html with no fragment is the Library.
  for (const phase of moduleGroups()) {
    for (const m of phase.modules) {
      if (!m.href) continue;
      const [file, frag] = m.href.split('#');
      if (base(file) !== here) continue;
      if (frag && '#' + frag !== hash) continue;
      return { phase, module: m };
    }
  }
  // No fragment match: the first module on this page still tells the
  // user which phase they are standing in, which is most of the answer.
  for (const phase of phases()) {
    for (const m of phase.modules) {
      if (m.href && base(m.href.split('#')[0]) === here) return { phase, module: m };
    }
  }
  for (const g of globals()) {
    if (g.href && base(g.href) === here) return { phase: null, module: null, global: g };
  }
  return { phase: null, module: null };
}

/* ------------------------------------------------------------
   THE MARKUP
   ------------------------------------------------------------ */

function moduleTile(m, snap, at) {
  const planned = m.status === 'planned';
  const isHere = !!(at.module && at.module.id === m.id);
  const cls = '.lx-mod'
    + (planned ? '.is-planned' : '')
    + (m.status === 'partial' ? '.is-partial' : '')
    + (isHere ? '.is-here' : '');
  const el = h(planned ? `button${cls}` : `a${cls}`, planned
    ? { type: 'button', 'data-action': 'module-planned', 'data-module': m.id }
    : { href: m.href });
  el.dataset.moduleId = m.id;   // plan-gate.js marks a locked tile by this
  if (isHere && !planned) el.setAttribute('aria-current', 'page');

  el.append(iconSpan('lx-mod-icon', m));
  el.append(
    h('span.lx-mod-label', { text: m.label }),
    h('span.lx-mod-purpose', { text: m.purpose })
  );

  const state = stateOf(m, snap);
  if (state) el.append(h(`span.lx-mod-state.is-${state.kind}`, { text: state.text }));

  if (m.status !== 'built') {
    el.append(h('span.lx-flag', { text: m.status === 'partial' ? 'PARTIAL' : 'SOON' }));
  }
  if (isHere) el.append(h('span.lx-mod-here', { text: 'THIS PAGE' }));

  const item = h('li.lx-mod-cell');
  item.append(el);
  return item;
}

function phaseRow(phase, snap, at) {
  const isHere = !!(at.phase && at.phase.id === phase.id);
  const row = h(`div.lx-row.${hueClassOf(phase)}` + (isHere ? '.is-here' : ''));
  const built = phase.modules.filter((m) => m.status === 'built').length;
  const withWork = phase.modules.filter((m) => {
    const s = stateOf(m, snap);
    return s && s.kind === 'work';
  }).length;

  const tile = h('div.lx-phase');
  tile.append(iconSpan('lx-phase-icon', phase));
  tile.append(
    h('span.lx-phase-label', { text: phase.label }),
    h('span.lx-phase-blurb', { text: phase.blurb }),
    h('span.lx-phase-count', { text: `${built} of ${phase.modules.length} ready` }),
    h('span.lx-phase-work', { text: withWork ? `${withWork} with work` : 'nothing here yet' })
  );

  /* `group` on a module is a sub-heading (Pre-Production's Break down ·
     See it · Cost & staff it · Schedule it). The order is the order of
     first appearance in navigation.json, the same rule the band's
     menu follows, so the two never disagree about it. A stage with no
     groups renders one flat list, exactly as before; the headings are
     only drawn when a module asks for one. */
  const grouped = phase.modules.some((m) => m.group);
  if (!grouped) {
    const mods = h('ul.lx-mods', { 'aria-label': phase.label + ' modules' });
    phase.modules.forEach((m) => mods.append(moduleTile(m, snap, at)));
    row.append(tile, mods);
    return row;
  }
  const order = [];
  const byGroup = new Map();
  phase.modules.forEach((m) => {
    const g = m.group || '';
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
    byGroup.get(g).push(m);
  });
  const wrap = h('div.lx-groups');
  order.forEach((g) => {
    const block = h('div.lx-group');
    if (g) block.append(h('h3.lx-group-head', { text: g }));
    const mods = h('ul.lx-mods', { 'aria-label': (g ? phase.label + ' · ' + g : phase.label) + ' modules' });
    byGroup.get(g).forEach((m) => mods.append(moduleTile(m, snap, at)));
    block.append(mods);
    wrap.append(block);
  });
  row.append(tile, wrap);
  return row;
}

/** The launcher section, ready to append to the hub. */
export function renderLauncher() {
  const snap = safe(snapshot, {});
  const at = safe(whereAmI, { phase: null, module: null });

  const sec = h('section#modules.section', { 'aria-labelledby': 'lxHeading' });
  const inner = h('div.section-inner');

  const worked = moduleGroups().reduce((n, p) => n + p.modules.filter((m) => {
    const s = stateOf(m, snap);
    return s && s.kind === 'work';
  }).length, 0);

  const head = h('div.section-head');
  head.append(
    h('div.left', {}, [
      h('div.label', { text: 'THE MAP · EVERY MODULE BY PHASE' }),
      h('h2#lxHeading', {}, [
        // Derived, like the module count beside it: this said "Six
        // phases" in a hard-coded string, which was wrong the day the
        // six became the PRD's five stages.
        document.createTextNode(`${NUMBER_WORDS[STAGE_COUNT] || STAGE_COUNT} stages, `),
        h('em', { text: `${MODULE_COUNT} modules.` })
      ]),
      h('p.deck', {
        text: 'A film moves through these in order, and so does the studio. '
            + 'Open any module directly.'
      })
    ]),
    h('div.right', {}, [
      h('div', { text: `${BUILT_MODULE_COUNT} OF ${MODULE_COUNT} BUILT` }),
      h('div.lx-worked', { text: `${worked} HOLD WORK` }),
      hereLine(at)
    ])
  );

  const grid = h('nav.lx-grid', { 'aria-label': 'Every module, by phase' });
  moduleGroups().forEach((p) => grid.append(phaseRow(p, snap, at)));

  inner.append(head, grid);
  sec.append(inner);
  return sec;
}

/** "YOU ARE HERE · Breakdown → Scene List", or the honest short
    version on a page that is not a module. */
function hereLine(at) {
  let trail = '';
  if (at.module) trail = at.phase.label + ' → ' + at.module.label;
  else if (at.global) trail = at.global.label;
  if (!trail) return null;
  const el = h('div.lx-here-line');
  el.append(
    h('span.lx-here-tag', { text: 'YOU ARE HERE' }),
    h('span.lx-here-trail', { text: trail })
  );
  return el;
}

export default { renderLauncher };
