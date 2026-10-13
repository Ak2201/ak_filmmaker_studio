/* ============================================================
   THE AI PILL — the one way into every AI tool
   ------------------------------------------------------------
   Every AI entry point in the studio is this button. It carries
   one of three states, published as `data-ai-state` for styling
   and for the proofs:

     locked   the plan does not include AI, or the plan is not
              known yet (signed out, still loading). Greyed,
              `aria-disabled="true"` — NOT `disabled`, so it stays
              focusable and clickable — with a lock glyph and the
              suffix " · Pro". A click asks the Pro question; the
              Desk never opens.
     nokey    AI is on the plan but this device holds no key for
              the active provider. A click opens the Desk, which
              shows only the "Add your key in Settings" step.
     ready    a click opens the Desk with the task.

   IT MUST STAY LIGHT. It loads with the page, so it imports only
   plan-gate.js, ai-providers.js (`hasKey` reads one raw key),
   dialog.js and dom.js. NEVER import src/lib/ai.js or
   ai-panel.js here — `test:ai-lazy` fails a first paint that
   carries the model code. The Desk is a dynamic import at the
   click.

   ONE handler, delegated on `document`, bound once; the options
   each pill was built with live in a WeakMap keyed by its element,
   so a page that rebuilds `main` leaves nothing behind.

   refreshPills() re-evaluates every pill in the document. It runs
   on 'plan:changed', and ai-panel.js calls it when a key is saved
   or forgotten (the key's own change bus lives in that lazy module).
   ============================================================ */
import Store from '../lib/store.js';
import PlanGate from '../lib/plan-gate.js';
import { hasKey } from '../lib/ai-providers.js';
import { ask } from './dialog.js';
import { h, delegate } from '../lib/dom.js';

const SVG = 'http://www.w3.org/2000/svg';
const opts = new WeakMap();

function glyph(kind) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'ai-pill-glyph');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', kind === 'lock'
    // a padlock: shackle and body
    ? 'M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2z'
    // a four-point sparkle with a small companion
    : 'M7 1.5l1.3 3.7L12 6.5 8.3 7.8 7 11.5 5.7 7.8 2 6.5l3.7-1.3L7 1.5zM12.5 10l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z');
  svg.append(path);
  return svg;
}

/** Normalise the `tasks` option: ids or { id, label } objects. */
function normTasks(tasks) {
  return [].concat(tasks || []).filter(Boolean).map((t) =>
    typeof t === 'string' ? { id: t, label: t } : { id: t.id, label: t.label || t.id });
}

/** 'locked' | 'nokey' | 'ready', for the state right now. */
export function pillState() {
  if (!PlanGate.aiUnlocked()) return 'locked';
  return hasKey() ? 'ready' : 'nokey';
}

function paint(el) {
  const o = opts.get(el);
  if (!o) return;
  const state = pillState();
  const sig = state + '|' + o.label + '|' + (o.tasks.length > 1);
  if (el.dataset.aiSig === sig && el.firstChild) return;   // plan:changed echoes: nothing to redraw
  el.dataset.aiSig = sig;
  el.dataset.aiState = state;
  const locked = state === 'locked';
  el.classList.toggle('is-locked', locked);
  if (locked) el.setAttribute('aria-disabled', 'true');
  else el.removeAttribute('aria-disabled');
  el.replaceChildren(
    glyph(locked ? 'lock' : 'sparkle'),
    h('span.ai-pill-label', { text: o.label + (locked ? ' · Pro' : '') })
  );
  if (o.tasks.length > 1 && !locked) el.setAttribute('aria-haspopup', 'menu');
  else el.removeAttribute('aria-haspopup');
}

/** Build a pill. `tasks` are ids or { id, label }; `ctx` is handed to
    the Desk unchanged. Returns a `button.ai-pill`. */
export function aiPill({ label = 'AI', tasks = [], ctx = {} } = {}) {
  wire();
  const el = h('button.ai-pill', { type: 'button', 'data-action': 'ai-pill' });
  opts.set(el, { label, tasks: normTasks(tasks), ctx });
  paint(el);
  return el;
}

/** Re-evaluate every pill in the document. */
export function refreshPills() {
  document.querySelectorAll('.ai-pill').forEach(paint);
}

/* ---- the click ------------------------------------------------ */
function openTask(taskId, ctx) {
  closeMenu();
  import('./ai-desk.js')
    .then((m) => m.openDesk(taskId, ctx))
    .catch((e) => console.warn('[ai-pill] the AI Desk did not load', e));
}

async function askPro() {
  const ok = await ask({
    title: 'AI tools come with Pro',
    body: 'They read your own writing and suggest, critique and draft, on your own key, and only when you click. Nothing you\u2019ve written is affected.',
    confirm: 'See Pro plans',
    cancel: 'Not now'
  });
  if (!ok) return;
  /* The plan the console says carries AI (PlanGate.offerFor, read from
     the plans rows), so a tier move needs no edit here. Looked up only
     AFTER the press, so the dialog never waits on the network; Pro when
     the rows cannot be read in time (signed out, offline). */
  const offer = await Promise.race([
    PlanGate.offerFor(['ai_tools']).catch(() => null),
    new Promise((r) => setTimeout(() => r(null), 1500))
  ]);
  location.href = (offer && offer.href) || 'purchase.html?plan=pro&for=ai_tools';
}

/* ---- the task menu ------------------------------------------- */
let menu = null;
let menuFor = null;

function closeMenu() {
  if (!menu) return;
  const owner = menuFor;
  menu.remove();
  menu = null;
  menuFor = null;
  if (owner) owner.setAttribute('aria-expanded', 'false');
}

function openMenu(el, o) {
  closeMenu();
  menu = h('div.ai-pill-menu', { role: 'menu', 'aria-label': o.label });
  o.tasks.forEach((t) => {
    menu.append(h('button.ai-pill-item', {
      type: 'button', role: 'menuitem', 'data-action': 'ai-pill-task', 'data-task': t.id, text: t.label
    }));
  });
  menuFor = el;
  el.setAttribute('aria-expanded', 'true');
  document.body.append(menu);
  const r = el.getBoundingClientRect();
  const w = menu.offsetWidth;
  const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8));
  menu.style.top = (r.bottom + window.scrollY + 6) + 'px';
  menu.style.left = left + 'px';
  const first = menu.querySelector('button');
  if (first) first.focus();
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;

  delegate(document, 'click', '[data-action="ai-pill"]', (e, el) => {
    const o = opts.get(el);
    if (!o) return;
    e.preventDefault();
    if (pillState() === 'locked') { closeMenu(); askPro(); return; }
    if (o.tasks.length > 1) {
      if (menuFor === el) closeMenu(); else openMenu(el, o);
      return;
    }
    openTask(o.tasks[0] ? o.tasks[0].id : null, o.ctx);
  });

  delegate(document, 'click', '[data-action="ai-pill-task"]', (e, item) => {
    const owner = menuFor;
    const o = owner && opts.get(owner);
    if (!o) { closeMenu(); return; }
    const id = item.dataset.task;
    if (owner) owner.focus();
    openTask(id, o.ctx);
  });

  // Outside click and Escape close the menu.
  document.addEventListener('click', (e) => {
    if (!menu) return;
    if (menu.contains(e.target) || (menuFor && menuFor.contains(e.target))) return;
    closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (!menu) return;
    if (e.key === 'Escape') {
      const owner = menuFor;
      closeMenu();
      if (owner) owner.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...menu.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      if (next) { e.preventDefault(); next.focus(); }
    }
  });
  window.addEventListener('resize', closeMenu);

  Store.subscribe('plan:changed', () => refreshPills());
  // Another tab saving or forgetting a key.
  window.addEventListener('storage', (e) => {
    if (!e.key || /^fms_ai_/.test(e.key)) refreshPills();
  });
}

export default { aiPill, refreshPills, pillState };
