/* ============================================================
   ACTION BAR — grouped page actions
   ------------------------------------------------------------
   The feature toolbar carried twenty controls in one flat strip:
   PRINT ZINE JSON MD MAIL IMPORT SAMPLE RESET HUB LIBRARY SHORTS
   PITCH SYNC … You had to read every one to find any of them, and on
   a phone it wrapped to five rows before the page began.

   Three rules, taken from what makes StudioBinder legible:

     1. What you use constantly stays visible — project, progress,
        save state, search, jump.
     2. What you use occasionally goes in a named menu. A menu with a
        verb on it ("Export") is one thing to read instead of five.
     3. What the shell already provides is deleted, not moved. Home,
        Library and the blueprints are in the rail and the phase bar
        now, so five links left the toolbar entirely.

   Destructive actions are separated at the foot of a menu and coloured
   danger, so RESET can never again be the most prominent control.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';

let seq = 0;

/**
 * A dropdown of actions.
 * items: [{ label, action?, href?, title?, danger?, hint?, id? } | '---']
 */
export function actionMenu(label, items, opts = {}) {
  const id = 'tbm-' + (++seq);
  const wrap = h('div.tb-menu' + (opts.align === 'right' ? '.align-right' : ''));
  const btn = h('button.btn.tb-menu-btn', {
    type: 'button',
    'data-action': 'tb-menu-toggle',
    'aria-expanded': 'false',
    'aria-haspopup': 'true',
    'aria-controls': id
  });
  btn.append(h('span', { text: label }), h('span.tb-caret', { text: '▾', 'aria-hidden': 'true' }));

  const panel = h('div.tb-menu-panel', { id, hidden: true, role: 'menu' });
  for (const item of items) {
    if (item === '---') { panel.append(h('div.tb-sep', { role: 'separator' })); continue; }
    const props = { role: 'menuitem', title: item.title || '' };
    if (item.id) props.id = item.id;
    let el;
    if (item.href) {
      el = h('a.tb-item' + (item.danger ? '.is-danger' : ''), { ...props, href: item.href });
    } else {
      el = h('button.tb-item' + (item.danger ? '.is-danger' : ''), {
        ...props, type: 'button', 'data-action': item.action
      });
    }
    el.append(h('span.tb-item-label', { text: item.label }));
    if (item.hint) el.append(h('span.tb-item-hint', { text: item.hint }));
    panel.append(el);
  }
  wrap.append(btn, panel);
  return wrap;
}

/* A dropdown anchored to a button near either edge will hang off the
   screen — right-aligned near the left edge put a 220px panel at
   left:-127. CSS cannot see where the button ended up, so clamp after
   opening. Same failure the phase menus had at 375px. */
function clampIntoViewport(panel) {
  panel.style.left = '';
  panel.style.right = '';
  const pad = 8;
  const vw = document.documentElement.clientWidth;
  let r = panel.getBoundingClientRect();
  if (r.width >= vw - pad * 2) {                 // wider than the screen
    panel.style.left = pad + 'px';
    panel.style.right = pad + 'px';
    return;
  }
  if (r.right > vw - pad) {
    panel.style.left = 'auto';
    panel.style.right = '0';
    r = panel.getBoundingClientRect();
  }
  if (r.left < pad) {
    const host = panel.parentElement.getBoundingClientRect();
    panel.style.right = 'auto';
    panel.style.left = (pad - host.left) + 'px';
  }
}

function closeMenus(except) {
  document.querySelectorAll('.tb-menu-panel').forEach((p) => {
    if (p === except) return;
    p.hidden = true;
    const b = p.parentElement && p.parentElement.querySelector('.tb-menu-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
  });
}

let wired = false;
export function wireActionBar() {
  if (wired) return;
  wired = true;
  delegate(document, 'click', '[data-action="tb-menu-toggle"]', (e, btn) => {
    const panel = btn.parentElement.querySelector('.tb-menu-panel');
    const opening = panel.hidden;
    closeMenus(panel);
    panel.hidden = !opening;
    btn.setAttribute('aria-expanded', String(opening));
    if (opening) clampIntoViewport(panel);
  });
  // Any choice closes the menu it came from.
  delegate(document, 'click', '.tb-item', () => closeMenus());
  document.addEventListener('click', (e) => { if (!e.target.closest('.tb-menu')) closeMenus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
}

export default { actionMenu, wireActionBar };
