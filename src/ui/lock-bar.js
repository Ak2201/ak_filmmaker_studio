/* ============================================================
   THE SOFT-GATE BAR (owner, 1 Nov 2026; docs/SCRIPT-LOCK.md §5)
   ------------------------------------------------------------
   One slim row at the top of every Pre-Production page. Nobody is
   blocked: the pages work while the script is a draft, and the bar says
   so, with a link to the one lock step on the Screenplay Writer. After
   the lock it reads "Locked", the latest issued draft's revision colour,
   and how many script changes are waiting in the change report.

     draft   "Draft script — lock it to generate pre-production" + link
     locked  "Locked" + swatch + colour, then "N script changes to
             review" (opens the report sheet in place) or "No script
             changes since the lock"
     legacy  a lock taken before the change report existed: "Locked ·
             <colour>" + "Start change tracking" (the same sheet)

   shell.js mountShell() inserts the EMPTY host (div#lockBar) as the
   first child of <main> SYNCHRONOUSLY and imports this module; the host
   has a fixed one-row block size, so filling it moves nothing (a bar
   that arrived late, above the reader, is a prove:scroll jump), and it
   is static, so measureChrome() never counts it. Some pages replace
   <main> on every render, so one childList observer on #app puts the
   host back.

   READ-ONLY. It reads the script blob and writes nothing, ever: the
   gate's four idle seconds would catch it. It repaints on a write in
   another window (onWriteElsewhere) and when the sheet it opened closes
   or acts. The lock model (script-lock.js), the shots and the call
   sheets are dynamic imports: none is first paint.
   ============================================================ */
import '../lib/store.js';
import '../styles/lock-bar.css';
/* The swatch is drafts.css's own (.dr-swatch.c-*): one colour mapping. */
import '../styles/drafts.css';
import { h, delegate } from '../lib/dom.js';
import { currentProjectId, onWriteElsewhere } from '../lib/store.js';
import { loadScript, SCRIPT_KEY } from '../lib/script.js';

let mounted = false;
let host = null;
let token = 0;

const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/* The host: the one in the DOM, else a detached one waiting for <main>. */
function hostEl() {
  host = document.getElementById('lockBar') || host;
  if (!host) host = h('div#lockBar.lk-bar', { 'data-pending': '' });
  return host;
}

/* First child of the page's current <main>. Cheap and idempotent: a
   host already in place is left alone. */
function place() {
  const el = hostEl();
  const main = document.querySelector('#app main, main');
  if (!main) return false;
  if (el.parentNode !== main || main.firstElementChild !== el) main.insertBefore(el, main.firstChild);
  return true;
}

const swatchEl = (c) => (c && c.swatch ? h('span.dr-swatch.lk-swatch.c-' + c.swatch, { 'aria-hidden': 'true' }) : null);

function fill(el, state, open, colour) {
  el.removeAttribute('data-pending');
  el.dataset.state = state;
  if (open === null) el.removeAttribute('data-open'); else el.dataset.open = String(open);
  const tint = colour ? [swatchEl(colour), h('span.lk-colour', { text: colour.name })] : [];
  let kids;
  if (state === 'draft') {
    kids = [
      h('span.lk-msg', { text: 'Draft script — lock it to generate pre-production' }),
      h('a.lk-go', { href: 'screenplay.html#lock', text: 'Lock the script' })
    ];
  } else if (state === 'legacy') {
    kids = [
      h('span.lk-msg', {}, [h('strong.lk-tag', { text: 'Locked' }), ...(colour ? [' · ', ...tint] : [])]),
      h('button.lk-act', { type: 'button', 'data-action': 'lock-report', text: 'Start change tracking' })
    ];
  } else {
    kids = [
      h('span.lk-msg', {}, [
        h('strong.lk-tag', { text: 'Locked' }), ...tint,
        h('span.lk-sep', { text: '·', 'aria-hidden': 'true' }),
        open
          ? null
          : h('span.lk-quiet', { text: 'No script changes since the lock' })
      ].filter(Boolean)),
      open
        ? h('button.lk-act', { type: 'button', 'data-action': 'lock-report', text: plural(open, 'script change') + ' to review' })
        : null
    ].filter(Boolean);
  }
  el.replaceChildren(...kids);
}

/* Draw the bar from the blob. Never writes. */
async function paint() {
  const mine = ++token;
  const el = hostEl();
  if (!place()) return;
  if (!currentProjectId()) {          // no film open: nothing to say, nothing shown
    el.removeAttribute('data-pending');
    el.dataset.state = 'none';
    el.replaceChildren();
    return;
  }
  let L = null;
  try { L = await import('../lib/script-lock.js'); } catch (e) { console.warn('[lock-bar] model', e); }
  if (!L || mine !== token) return;
  const doc = loadScript();
  const st = L.lockState(doc);
  let open = null;
  if (st.state === 'locked') {
    open = 0;
    try {
      const [Sc, Sh, Co] = await Promise.all([import('../lib/scenes.js'), import('../lib/shots.js'), import('../lib/contacts.js')]);
      if (mine !== token) return;
      open = L.changeReport(loadScript(), { scenes: Sc.listScenes(), shots: Sh.listShots(), callSheets: Co.listCallSheets() }).open || 0;
    } catch (e) { console.warn('[lock-bar] report', e); }
  }
  if (mine !== token) return;
  place();
  fill(el, st.state, open, st.colour);
}

export function mountLockBar() {
  if (mounted) { paint(); return; }
  mounted = true;
  hostEl();
  paint();
  /* A page that re-renders replaces <main>; the host goes back in before
     the next paint (a microtask), and the bar is redrawn from the blob. */
  const app = document.getElementById('app');
  if (app && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      const el = hostEl();
      const main = document.querySelector('#app main, main');
      if (main && (el.parentNode !== main || main.firstElementChild !== el)) paint();
    }).observe(app, { childList: true, subtree: true });
  }
  onWriteElsewhere([SCRIPT_KEY], paint);
  /* The report is a sheet over the page; whatever it did, the count moves. */
  delegate(document, 'click', '[data-action="lock-report"]', async (e, btn) => {
    if (!btn.closest('#lockBar')) return;
    try {
      const U = await import('./script-lock-ui.js');
      await U.openChangeReport({ returnTo: btn, after: paint, onClose: paint });
    } catch (err) {
      console.warn('[lock-bar] report sheet', err);
    }
    paint();
  });
}

export default { mountLockBar };
