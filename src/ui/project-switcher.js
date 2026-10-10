/* ============================================================
   PROJECT SWITCHER — change film from any page, in the band
   ------------------------------------------------------------
   Owner: "he can switch from one project to another, even from short
   film to feature film dashboard, whenever he wants and continue from
   where he left." The hub has had a switcher since the start; every
   other page had none, so leaving a page to change film meant going
   back to the hub first.

   A button in the shell band shows the open project and its format;
   it opens a list of every project this namespace can see. Choosing
   one calls setCurrentProject() and lands on the dashboard, where each
   film's own "continue" cards pick up from its own saved state — the
   position is stored per project already, so nothing is remembered here.

   The list builder is exported so the phone's Go-to sheet
   (mobile-nav.js) draws the same rows. The constant DASHBOARD_URL is
   copied from hub/util.js rather than imported: CORE must not pull hub
   code. This module WRITES NOTHING except setCurrentProject() on an
   explicit choice (verify asserts zero idle writes).
   ============================================================ */
import { h } from '../lib/dom.js';
import Store from '../lib/store.js';
import '../styles/project-switcher.css';

const DASHBOARD_URL = 'dashboard.html';
const HUB_URL = 'index.html';
const FORMAT_SHORT = { feature: 'Feature', short: 'Short', documentary: 'Doc', musicvideo: 'Music video', adfilm: 'Ad film' };

export const formatLabel = (f) => FORMAT_SHORT[f] || (f ? String(f) : 'Film');

function ago(iso) {
  const t = new Date(iso || '').getTime();
  if (!t) return '';
  const d = Date.now() - t;
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  if (d < 604800000) return Math.floor(d / 86400000) + 'd ago';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The projects, most recently edited first, and which is open. */
export function projectList() {
  let list = [];
  try { list = Store.listProjects(); } catch (e) { list = []; }
  const cur = Store.currentProject ? Store.currentProject() : null;
  list = list.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return { list, current: cur };
}

/** Make `id` the open project and go to its dashboard. */
export function switchProject(id) {
  if (!id || !Store.setCurrentProject(id)) return false;
  location.assign(DASHBOARD_URL);
  return true;
}

/** One row per project: <button.ps-item data-id>. */
export function projectRows(onPick) {
  const { list, current } = projectList();
  return list.map((p) => {
    const here = !!(current && current.id === p.id);
    const b = h('button.ps-item' + (here ? '.is-current' : ''), { type: 'button', role: 'menuitem', 'data-id': p.id });
    if (here) b.setAttribute('aria-current', 'true');
    b.append(
      h('span.ps-item-title', { text: p.title || 'Untitled' }),
      h('span.ps-item-meta', { text: formatLabel(p.format) + (p.updatedAt ? ' · edited ' + ago(p.updatedAt) : '') })
    );
    b.addEventListener('click', () => (onPick || switchProject)(p.id));
    return b;
  });
}

/* ---- the band control ------------------------------------------- */
let btn = null, pop = null, off = [];

function label() {
  if (!btn) return;
  const { list, current } = projectList();
  const t = btn.querySelector('.ps-title'), f = btn.querySelector('.ps-fmt');
  if (current) {
    t.textContent = current.title || 'Untitled';
    f.textContent = formatLabel(current.format); f.hidden = false;
    btn.classList.remove('is-empty');
    btn.title = 'Switch project (open: ' + (current.title || 'Untitled') + ')';
  } else {
    t.textContent = list.length ? 'Pick a project' : 'No project — start one';
    f.hidden = true;
    btn.classList.add('is-empty');
    btn.title = list.length ? 'Pick a project' : 'Start a project';
  }
}

function place() {
  if (!pop || !btn) return;
  const r = btn.getBoundingClientRect();
  const w = Math.min(340, window.innerWidth - 16);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
}

function closePop(refocus) {
  if (!pop) return;
  pop.remove(); pop = null;
  off.forEach((f) => f()); off = [];
  if (btn) { btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); }
}

function items() { return pop ? [...pop.querySelectorAll('.ps-item, .ps-link')] : []; }

function openPop() {
  closePop();
  const { list } = projectList();
  if (!list.length) { location.assign(HUB_URL); return; }
  pop = h('div.ps-pop', { role: 'menu', 'aria-label': 'Projects' });
  pop.append(h('div.ps-head', { text: 'Switch project' }), ...projectRows());
  pop.append(
    h('a.ps-link', { href: HUB_URL, role: 'menuitem', text: '+ New project' }),
    h('a.ps-link', { href: HUB_URL + '#projects', role: 'menuitem', text: 'All projects' })
  );
  document.body.append(pop);
  btn.setAttribute('aria-expanded', 'true');
  place();
  const first = pop.querySelector('.is-current') || pop.querySelector('.ps-item');
  if (first) first.focus({ preventScroll: true });

  const onDoc = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) closePop(false); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); return; }
    const k = e.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
    const els = items(); if (!els.length) return;
    e.preventDefault();
    const i = els.indexOf(document.activeElement);
    const n = k === 'Home' ? 0 : k === 'End' ? els.length - 1
      : (i + (k === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
    els[n].focus();
  };
  const onTab = (e) => { if (e.key === 'Tab') closePop(false); };
  document.addEventListener('mousedown', onDoc, true);
  document.addEventListener('keydown', onKey, true);
  pop.addEventListener('keydown', onTab);
  window.addEventListener('resize', place);
  off = [
    () => document.removeEventListener('mousedown', onDoc, true),
    () => document.removeEventListener('keydown', onKey, true),
    () => window.removeEventListener('resize', place)
  ];
}

/** Mount the control in the shell band, before the search handle.
 *  Idempotent. The hub draws its own (#projectSwitcherBtn) and gets none. */
export function mountProjectSwitcher(bar) {
  if (!bar || bar.querySelector('.ps-btn')) return null;
  if (document.getElementById('projectSwitcherBtn')) return null;
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (file === '' || file === 'index.html' || file === 'index') return null;
  btn = h('button.ps-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Switch project' });
  btn.append(
    h('span.ps-fmt', { hidden: true }),
    h('span.ps-title'),
    h('span.ps-caret', { 'aria-hidden': 'true', text: '▾' })
  );
  btn.addEventListener('click', () => (pop ? closePop(false) : openPop()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !pop) { e.preventDefault(); openPop(); }
  });
  const find = bar.querySelector(':scope > .sh-find');
  if (find) bar.insertBefore(btn, find); else bar.append(btn);
  label();
  for (const ev of ['projects:changed', 'project:meta', 'current:changed']) Store.subscribe(ev, () => { label(); if (pop) closePop(false); });
  return btn;
}

export default { mountProjectSwitcher, projectRows, projectList, switchProject, formatLabel };
