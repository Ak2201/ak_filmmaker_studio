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
 * items: [
 *   { label, action?, href?, title?, danger?, hint?, id? }   a command
 * | { label, choices: [{ value, label }], action, attr, value }  a choice group
 * | '---'                                                    a separator
 * ]
 *
 * A choice group is a radio row inside the menu — one label, N buttons,
 * exactly one checked. Theme and skin are both this shape, and neither
 * is a command: picking "Sepia" does not close the conversation, it
 * changes a setting you may want to try three of.
 */
export function actionMenu(label, items, opts = {}) {
  const id = 'tbm-' + (++seq);
  const wrap = h('div.tb-menu' + (opts.align === 'right' ? '.align-right' : ''));
  const btn = h('button.btn.tb-menu-btn' + (opts.compact ? '.is-compact' : ''), {
    type: 'button',
    'data-action': 'tb-menu-toggle',
    'aria-expanded': 'false',
    'aria-haspopup': 'true',
    'aria-controls': id
  });
  /* A compact menu is a glyph, so the label has to reach a screen
     reader some other way — and a title, so it reaches everyone else
     on hover. A bare ◐ with no accessible name is a button that says
     nothing to anyone who cannot see it. */
  if (opts.ariaLabel) {
    btn.setAttribute('aria-label', opts.ariaLabel);
    btn.setAttribute('title', opts.ariaLabel);
  }
  btn.append(h('span', { text: label }));
  if (!opts.compact) btn.append(h('span.tb-caret', { text: '▾', 'aria-hidden': 'true' }));

  const panel = h('div.tb-menu-panel', { id, hidden: true, role: 'menu' });
  for (const item of items) {
    if (item === '---') { panel.append(h('div.tb-sep', { role: 'separator' })); continue; }
    if (item.choices) { panel.append(choiceGroup(item)); continue; }
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

function closeMenus(except, restoreFocus) {
  document.querySelectorAll('.tb-menu-panel').forEach((p) => {
    if (p === except) return;
    const wasOpen = !p.hidden;
    p.hidden = true;
    const b = p.parentElement && p.parentElement.querySelector('.tb-menu-btn');
    if (b) {
      b.setAttribute('aria-expanded', 'false');
      /* Focus goes back to the button that opened the menu, but ONLY
         when the close came from the keyboard and focus is still
         inside the panel. Pulling focus on every close would yank it
         out of whatever the user clicked next — the menu would be
         stealing the cursor from the page as a side effect of
         tidying itself up. */
      if (wasOpen && restoreFocus && p.contains(document.activeElement)) {
        try { b.focus(); } catch (e) {}
      }
    }
  });
}

/* ------------------------------------------------------------
   KEYBOARD INSIDE A MENU
   ------------------------------------------------------------
   role="menu" is a promise. A screen reader tells the user they
   are in a menu, and what that means to anyone who has used one is
   that the arrow keys move between the items and Escape gets out.
   This panel had neither: it was a div of buttons with a menu role
   painted on, so Tab walked through every item one at a time and
   then kept going into the page behind, and Escape closed the menu
   without giving focus back to the control that opened it — which
   on a toolbar of eight menus means the next Tab starts from the
   top of the document.

   The items include .tb-choice, because a radio row inside the
   menu is still somewhere the arrow keys have to reach. Theme and
   Design are both that shape, and they were the two settings
   furthest from the keyboard.
   ------------------------------------------------------------ */
const MENU_ITEMS = '.tb-item, .tb-choice';

function menuItems(panel) {
  return Array.from(panel.querySelectorAll(MENU_ITEMS))
    .filter((el) => !el.hidden && !el.disabled);
}

function focusItem(panel, i) {
  const items = menuItems(panel);
  if (!items.length) return;
  const el = items[(i + items.length) % items.length];
  try { el.focus(); } catch (e) {}
}

function onMenuKey(e) {
  /* The menu BUTTON answers the arrows too — the other half of the
     menu-button pattern, and the half that was missing (UX audit L17):
     a menu opened with the mouse left focus on the button, and ↓ there
     did nothing. ↓ opens it on the first item, ↑ on the last. */
  const btn = e.target.closest && e.target.closest('.tb-menu-btn');
  if (btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const p = btn.parentElement && btn.parentElement.querySelector('.tb-menu-panel');
    if (!p) return;
    e.preventDefault();
    if (p.hidden) {
      closeMenus(p, false);
      p.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      clampIntoViewport(p);
    }
    focusItem(p, e.key === 'ArrowDown' ? 0 : -1);
    return;
  }
  const panel = e.target.closest && e.target.closest('.tb-menu-panel');
  if (!panel || panel.hidden) return;
  const items = menuItems(panel);
  const at = items.indexOf(e.target);
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); focusItem(panel, at + 1); break;
    case 'ArrowUp':   e.preventDefault(); focusItem(panel, at - 1); break;
    case 'Home':      e.preventDefault(); focusItem(panel, 0); break;
    case 'End':       e.preventDefault(); focusItem(panel, items.length - 1); break;
    /* Tab leaves the menu entirely rather than walking it. A menu is
       one stop on the page's tab order, not eight — that is the
       difference between a menu and a toolbar, and it is the whole
       reason the items are reachable by arrow instead. */
    case 'Tab':       closeMenus(null, false); break;
    case 'Escape':    e.preventDefault(); e.stopPropagation(); closeMenus(null, true); break;
    default: break;
  }
}

/* A radio row. The buttons carry the value on a data attribute the
   caller names, so whoever owns the setting binds one delegated
   listener for it and this file stays ignorant of what a skin is. */
function choiceGroup(item) {
  const grp = h('div.tb-group', { role: 'group', 'aria-label': item.label });
  grp.append(h('div.tb-group-label', { text: item.label }));
  const row = h('div.tb-choices');
  for (const c of item.choices) {
    const b = h('button.tb-choice' + (c.value === item.value ? '.active' : ''), {
      type: 'button',
      role: 'menuitemradio',
      'aria-checked': String(c.value === item.value),
      'data-action': item.action,
      title: c.title || c.label
    });
    b.setAttribute(item.attr || 'data-value', c.value);
    b.append(h('span', { text: c.label }));
    row.append(b);
  }
  grp.append(row);
  return grp;
}

let wired = false;
export function wireActionBar() {
  if (wired) return;
  wired = true;
  delegate(document, 'click', '[data-action="tb-menu-toggle"]', (e, btn) => {
    const panel = btn.parentElement.querySelector('.tb-menu-panel');
    const opening = panel.hidden;
    closeMenus(panel, false);
    panel.hidden = !opening;
    btn.setAttribute('aria-expanded', String(opening));
    if (opening) {
      clampIntoViewport(panel);
      /* Focus moves in only when the menu was opened BY THE
         KEYBOARD. e.detail is 0 for a click synthesised from Enter
         or Space and non-zero for a real pointer click, which is
         the one signal that distinguishes them. Pulling focus on a
         mouse click would steal it from a pointer user who is about
         to click an item anyway, and on a touch screen it summons
         the on-screen keyboard for no reason. */
      if (!e.detail) focusItem(panel, 0);
    }
  });
  // Any choice closes the menu it came from.
  delegate(document, 'click', '.tb-item', () => closeMenus(null, false));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tb-menu')) closeMenus(null, false);
  });
  document.addEventListener('keydown', onMenuKey, true);
  /* Escape from ANYWHERE still closes an open menu. onMenuKey only
     fires when focus is inside the panel, and a menu opened with
     the mouse leaves focus on the button — so without this, the one
     key everybody tries first would do nothing for exactly the
     users who opened it by pointing at it. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus(null, false);
  });
}

export default { actionMenu, wireActionBar };
