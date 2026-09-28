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
   shell, so a module added there appears here with no edit. The
   `status` field is printed rather than hidden: of 22 modules 7 are
   built, 4 are partial and 11 are planned, and a map that quietly
   showed 22 equal tiles would be a lie the first click exposes.

   A planned tile is a <button> carrying data-action="module-planned",
   which shell.js already binds globally — it says what the module
   will do instead of navigating nowhere. No new handler, and nothing
   here knows what a toast is.
   ============================================================ */
import nav from '../data/navigation.json';
import { h } from '../lib/dom.js';

const TOTAL = nav.phases.reduce((n, p) => n + p.modules.length, 0);
const BUILT = nav.phases.reduce(
  (n, p) => n + p.modules.filter((m) => m.status === 'built').length, 0);

function moduleTile(m) {
  const planned = m.status === 'planned';
  const cls = '.lx-mod' + (planned ? '.is-planned' : '') + (m.status === 'partial' ? '.is-partial' : '');
  const el = h(planned ? `button${cls}` : `a${cls}`, planned
    ? { type: 'button', 'data-action': 'module-planned', 'data-module': m.id }
    : { href: m.href });
  el.append(
    h('span.lx-mod-label', { text: m.label }),
    h('span.lx-mod-purpose', { text: m.purpose })
  );
  if (m.status !== 'built') {
    el.append(h('span.lx-flag', { text: m.status === 'partial' ? 'PARTIAL' : 'SOON' }));
  }
  return el;
}

function phaseRow(phase) {
  const row = h(`div.lx-row.sh-ph-${phase.hue}`);
  const built = phase.modules.filter((m) => m.status === 'built').length;
  row.append(
    h('div.lx-phase', {}, [
      h('span.lx-phase-label', { text: phase.label }),
      h('span.lx-phase-blurb', { text: phase.blurb }),
      h('span.lx-phase-count', { text: `${built} of ${phase.modules.length} ready` })
    ]),
    h('div.lx-mods', {}, phase.modules.map(moduleTile))
  );
  return row;
}

/** The launcher section, ready to append to the hub. */
export function renderLauncher() {
  const sec = h('section#modules.section', {});
  const inner = h('div.section-inner');

  const head = h('div.section-head');
  head.append(
    h('div.left', {}, [
      h('div.label', { text: 'THE MAP · EVERY MODULE BY PHASE' }),
      h('h2', {}, [
        document.createTextNode('Six phases, '),
        h('em', { text: `${TOTAL} modules.` })
      ]),
      h('p.deck', {
        text: 'A film moves through these in order, and so does the studio. '
            + 'Open any module directly; the ones still to come say so rather '
            + 'than pretending.'
      })
    ]),
    h('div.right', { text: `${BUILT} OF ${TOTAL} BUILT` })
  );

  const grid = h('div.lx-grid');
  nav.phases.forEach((p) => grid.append(phaseRow(p)));

  inner.append(head, grid);
  sec.append(inner);
  return sec;
}

export default { renderLauncher };
