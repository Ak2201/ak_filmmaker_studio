/* ============================================================
   THE "TODAY" LINE — one sentence above the project list
   ------------------------------------------------------------
   The open film's next unfinished Pre-production step, with one
   button. Derived from src/lib/preprod-path.js every time it is drawn;
   it stores nothing and writes nothing.

   LOADED AFTER FIRST PAINT. hub.js imports this file dynamically from an
   idle callback, so neither this module nor the path model (readiness,
   the contact/song/shot readers) is part of the hub's first paint. Until
   it lands the host is `hidden` and takes no room; if the import fails
   it stays hidden. Shows nothing without an open project, or with no
   scenes (the path has nothing to say about a film with no scenes, and
   the first-run panel already says what to do).
   ============================================================ */
import Store from '../../lib/store.js';
import Scenes from '../../lib/scenes.js';
import { pathSteps, nextStep } from '../../lib/preprod-path.js';
import { h } from '../../lib/dom.js';
import '../../styles/today-line.css';

const HOST = 'todayLine';

function draw() {
  const host = document.getElementById(HOST);
  if (!host) return;
  let next = null; let total = 0; let all = false; let title = '';
  try {
    const project = Store.currentProject();
    if (project && Scenes.listScenes().length) {
      const steps = pathSteps();
      total = steps.length;
      next = nextStep(steps);
      all = !!next && steps.every((s) => s.state === 'done');
      title = project.title || '';
    }
  } catch (e) { console.warn('[today-line]', e); next = null; }
  if (!next) { host.hidden = true; host.replaceChildren(); return; }
  const where = all
    ? 'Pre-production · every step done'
    : 'Pre-production · step ' + next.n + ' of ' + total;
  host.replaceChildren(
    h('span.tl-lab', { text: 'Today' }),
    h('p.tl-text', {}, [
      h('span.tl-where', { text: where }),
      ' · ',
      ...(all ? [h('strong', { text: 'ready to shoot' })] : ['next: ', h('strong', { text: next.label })])
    ]),
    h('a.btn.primary.tl-go', {
      href: next.tool.href,
      'aria-label': (all ? 'See the Ready to shoot check' : 'Open ' + next.label) + ' — ' + (title || 'this film'),
      text: 'Open →'
    })
  );
  host.hidden = false;
}

let wired = false;
export function mountTodayLine() {
  draw();
  if (wired) return;
  wired = true;
  /* Reads only. The open film changing, a rename, and coming back to the
     tab (the scenes may have been edited on another page) all redraw. */
  Store.subscribe('current:changed', draw);
  Store.subscribe('projects:changed', draw);
  window.addEventListener('focus', draw);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
}

export default { mountTodayLine };
