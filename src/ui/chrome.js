/* ============================================================
   STUDIO v2 — UX/UI HELPERS  (ES module port of studio-ui.js)
   ------------------------------------------------------------
   Adds:
     - Toast system (StudioUI.toast)
     - Theme picker (paper / ink / sepia) + auto-apply
     - Skip-to-content link auto-injected
     - Reading progress bar
     - Step rail (auto-built from <section class="step">)
     - Auto-save indicator (StudioUI.markSaving, .markSaved, .markError)
     - Field-saved checkmark on input blur
     - "?" shortcut sheet modal
     - Glossary popover (hover anything with [data-glossary])
     - 15-beat visualizer (renders if blueprint has b01..b15 fields)
     - Mobile bottom action bar
     - Reduced-motion respect
   Idempotent. Safe to import from any page entry.

   LOAD ORDER: this module imports ../lib/store.js first and on
   purpose — store.js installs the localStorage proxy at evaluation
   time and everything below reads localStorage. Keep that import at
   the top even though only `Store` is referenced by name.
   ============================================================ */
import Store from '../lib/store.js';
import { registerSW } from '../lib/pwa.js';
import { actionMenu } from './actionbar.js';
import {
  attachSignInPill,
  refreshSignInPill,
  openCloudAuthModal,
  closeCloudAuthModal,
  openAccountMenu,
  showConfigBlock,
  saveConfig
} from './auth.js';
import { listSkins, currentSkin, applySkin, loadSkin } from '../lib/skin.js';
import '../styles/chrome-injected.css';
import glossaryData from '../data/glossary.json';
import { openPalette, closePalette, togglePalette, isPaletteOpen } from './palette.js';
/* Drive sync, wired once here so EVERY page has it — the same reason
   the palette is wired here rather than per page. A backup that only
   runs on the hub is a backup that misses the pages people write on.
   The import looks unused and is not: drive-sync.js subscribes to
   `saved` and reconciles on boot at evaluation time, the way cloud.js
   does. It does nothing at all — no script load, no fetch, no storage
   write — unless this build carries a Google client id AND this
   device has connected, so the cost of having it everywhere is the
   module and nothing else, and vite.config.js already folds every
   src/lib and src/ui module into the one `studio` chunk anyway. */
import '../lib/drive-sync.js';

const global = typeof window !== 'undefined' ? window : globalThis;

// The old script bailed out with a warning when window.StudioStore was
// missing. The static import above makes that impossible now, so the
// guard is gone — StudioStore is guaranteed to be initialised here.

const StudioUI = {};

// ============================================================
// SKIP TO CONTENT (a11y)
// ============================================================
function injectSkipLink() {
  if (document.querySelector('.skip-to-content')) return;
  const a = document.createElement('a');
  a.className = 'skip-to-content';
  a.href = '#main';
  a.textContent = 'Skip to content';
  document.body.insertBefore(a, document.body.firstChild);
  // Ensure there's a main landmark to skip to
  if (!document.getElementById('main')) {
    const candidate = document.querySelector('section.hero, section.section, main');
    if (candidate) candidate.id = 'main';
  }
}

// ============================================================
// TOAST
// ============================================================
/* TWO HOSTS, and the difference is the politeness.

   A toast must never steal focus, so the ordinary one is
   aria-live="polite": it waits for the reader to finish the
   sentence it is already on. That is right for "SAVED" and wrong
   for "COULD NOT SAVE — STORAGE IS FULL", which is a message about
   work that is being lost while the queue drains. An error goes in
   a role="alert" region, which is assertive and interrupts.

   Separate elements rather than flipping the attribute on one,
   because changing aria-live on a live region is not reliably
   picked up — several screen readers bind the politeness when the
   region enters the accessibility tree and never re-read it. */
function ensureToastHost(assertive) {
  const id = assertive ? 'toastHostAlert' : 'toastHost';
  let host = document.getElementById(id);
  if (host) return host;
  host = document.createElement('div');
  host.id = id;
  host.className = 'toast-host';
  if (assertive) {
    host.setAttribute('role', 'alert');
  } else {
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
  }
  host.setAttribute('aria-atomic', 'true');
  document.body.appendChild(host);
  return host;
}

StudioUI.toast = function (msg, opts) {
  opts = opts || {};
  const host = ensureToastHost(opts.type === 'error');
  const t = document.createElement('div');
  t.className = 'toast' + (opts.type ? ' ' + opts.type : '');
  const ms = document.createElement('span');
  ms.className = 'toast-msg';
  ms.textContent = msg;
  t.appendChild(ms);
  if (opts.action && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.action;
    btn.addEventListener('click', () => {
      try { opts.onAction(); } catch (e) {}
      dismiss();
    });
    t.appendChild(btn);
  }
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));

  /* A TOAST WITH AN ACTION MUST NOT TIME OUT.

     The default 3.2s is right for a notice you only have to read.
     It is wrong the moment the toast carries a button, because the
     button is the only route to the thing it offers: "Undo delete"
     that vanishes after three seconds is an undo a keyboard user
     reaching it by Tab, or anyone reading it with a screen reader,
     will routinely miss. The one place in this app that matters
     most is the one that offers to put a deleted scene back.

     So an actionable toast stays until it is dismissed or acted on,
     and every toast pauses while the pointer or the keyboard is on
     it — a countdown that keeps running while you are reading the
     message is a countdown measuring the wrong thing. */
  const duration = opts.duration != null ? opts.duration : (opts.action ? 0 : 3200);
  let timer = null;
  let remaining = duration;
  let startedAt = 0;
  function dismiss() {
    clearTimeout(timer);
    timer = null;
    t.classList.remove('show');
    setTimeout(() => { try { host.removeChild(t); } catch (e) {} }, 260);
  }
  function start() {
    if (!(remaining > 0)) return;
    startedAt = Date.now();
    timer = setTimeout(dismiss, remaining);
  }
  function pause() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    remaining -= Date.now() - startedAt;
  }
  /* A toast that will not dismiss itself needs a way to be
     dismissed. Without this, declining the offer — the ordinary
     case, because most deletes are deliberate — leaves the notice
     on screen over the page for the rest of the session. */
  if (!(duration > 0)) {
    const close = document.createElement('button');
    close.className = 'toast-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '\u00d7';
    close.addEventListener('click', dismiss);
    t.appendChild(close);
  }

  t.addEventListener('mouseenter', pause);
  t.addEventListener('mouseleave', start);
  t.addEventListener('focusin', pause);
  t.addEventListener('focusout', start);
  start();
  return { dismiss };
};

StudioUI.toastSuccess = (m, o) => StudioUI.toast(m, Object.assign({ type: 'success' }, o || {}));
StudioUI.toastError   = (m, o) => StudioUI.toast(m, Object.assign({ type: 'error' }, o || {}));
StudioUI.toastInfo    = (m, o) => StudioUI.toast(m, Object.assign({ type: 'info' }, o || {}));

// Replace stock alert with a toast where requested
StudioUI.notify = StudioUI.toastInfo;

// ============================================================
// THEME — paper / ink / sepia (3-state pill)
// ============================================================
const THEME_KEY = 'fms_studio_theme_v1';

/* The stylesheets match `:root[data-theme]` with the CSS-side names
   light / sepia / dark (see tokens.css). The app's own names are
   paper / sepia / ink and the STORED value keeps those — THEME_KEY is
   part of the storage contract. Map between the two here, once. */
const CSS_THEME = { ink: 'dark', paper: 'light' };
/* TWO themes, and INK is the default.

   sepia and desk are gone. Four palettes meant four sets of every
   colour decision to keep at 4.5:1 across every skin, and the two
   that were removed were variations on paper rather than choices
   anybody needed.

   THE DEFAULT HAS MOVED IN BOTH DIRECTIONS NOW, and each time it was
   the same four places rather than one: THEME_ORDER's first entry,
   currentTheme()'s fallback, loadTheme()'s, and applyTheme()'s
   `CSS_THEME[theme] || …`. All four are in this file, and all four
   have to agree with WHICH PALETTE THE BARE `:root` IN tokens.css
   CARRIES. That is the actual invariant; "the default is ink" is
   just today's value of it. Disagree and the picker says one thing
   while the page renders another — which has happened once in each
   direction, and looks like a CSS bug from every angle except this
   one.

   ink is FIRST deliberately: this list is the ⌃⇧D cycle order, the
   picker order, and what `themeOrder()` hands the verify gate, which
   reads the list from the app rather than repeating it. The gate
   asserts that the number of distinct backgrounds equals the number of
   themes, so neither dropping a theme nor reordering this needs a
   change there. */
const THEME_ORDER = ['ink', 'paper'];

/* Canonical reader. The root attribute is the source of truth; the body
   classes are a mirror kept for the pages that still read them. */
function currentTheme() {
  switch (document.documentElement.getAttribute('data-theme')) {
    case 'dark':  return 'ink';
    case 'light': return 'paper';
  }
  if (document.body && document.body.classList.contains('dark')) return 'ink';
  /* Falls back to INK. The bare :root in tokens.css carries the
     dark palette, so ink is what an unstamped document actually
     renders — returning 'paper' here would have the picker disagree
     with the page on first load, which is the bug this comment has
     now recorded in both directions. */
  return 'ink';
}

function applyTheme(theme) {
  // Stamp the root FIRST. This is the line the stylesheets actually key
  // off, and documentElement exists long before body does, so setting it
  // ahead of the body guard also avoids a flash of the wrong palette.
  //
  // Without it the picker is a no-op: nothing sets [data-theme="dark"],
  // so `@media (prefers-color-scheme: light)` wins and a user who chose
  // ink gets paper on a light-mode OS.
  //
  // The `|| 'dark'` is the fourth place the default is written down
  // (THEME_ORDER, currentTheme(), loadTheme() are the others) and it
  // is the one that is easy to leave behind, because it only fires
  // for a theme name that is not in CSS_THEME at all. It must name
  // the same palette bare :root carries.
  document.documentElement.setAttribute('data-theme', CSS_THEME[theme] || 'dark');

  if (!document.body) {
    // Document not parsed yet — defer the body half until ready
    document.addEventListener('DOMContentLoaded', () => applyTheme(theme));
    return;
  }
  // These classes match no CSS rule any more, but hub.js, library.js,
  // feature.js and short.js still read them as state. Set them in the
  // same call as the attribute so the two can never disagree.
  /* 'sepia' is still REMOVED here although no theme sets it: anyone
     carrying the class from a session before the theme was dropped has
     to have it taken off, and a stored 'sepia' now falls through
     loadTheme()'s unknown-theme branch to paper. */
  document.body.classList.remove('dark', 'sepia');
  if (theme === 'ink') document.body.classList.add('dark');
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  // Update any picker UIs
  document.querySelectorAll('.theme-picker button').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
  // Existing hub dark button keeps working — sync icon
  const darkBtn = document.getElementById('darkBtn');
  if (darkBtn) {
    darkBtn.textContent = theme === 'ink' ? '☀' : '◐';
  }
}
function loadTheme() {
  let t;
  try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (THEME_ORDER.indexOf(t) >= 0) {
    applyTheme(t);
  } else {
    /* INK IS THE DEFAULT, and every fallback here has to say so.

       This branch runs for anyone with no stored choice, and also for
       anyone whose stored choice is a theme that no longer exists —
       sepia and desk are not in THEME_ORDER and fall through to here.

       THE LEGACY TEST FLIPS WITH THE DEFAULT, and it flips to
       `=== false` rather than to `!== false`. The point of the old
       `=== true` was never "true means ink"; it was "only an
       EXPLICIT setting may override the default, and absent is not
       explicit". `fms_studio_prefs_v1.dark` is a dark-mode toggle, so
       `false` is a reader who deliberately turned dark off — that is
       a choice of paper and is honoured. Missing, or any non-boolean,
       is not evidence of anything and gets the default, exactly as a
       missing key did before.

       Written as `!== false` it would read the same for the two
       values that exist and silently hand paper to `undefined` the
       day someone stores a string; the strict test keeps "absent and
       false behave the same" from being accidentally true rather
       than deliberately so. */
    try {
      const old = JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}');
      applyTheme(old.dark === false ? 'paper' : 'ink');
    } catch (e) { applyTheme('ink'); }
  }
}
StudioUI.applyTheme = applyTheme;
/* Exposed so scripts/verify can iterate the real list instead of
   keeping its own copy that goes stale the day a theme is added. */
StudioUI.themeOrder = () => THEME_ORDER.slice();
StudioUI.currentTheme = currentTheme;
StudioUI.cycleTheme = function () {
  const i = THEME_ORDER.indexOf(currentTheme());
  const next = THEME_ORDER[(i + 1) % THEME_ORDER.length];
  applyTheme(next);
  StudioUI.toast('Theme: ' + next, { type: 'info', duration: 1400 });
};
StudioUI.attachThemePicker = function (host) {
  if (!host || host.querySelector('.theme-picker')) return;
  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Theme');
  /* DERIVED from THEME_ORDER rather than listed beside it. The list
     this replaced claimed in a comment to match THEME_ORDER and was
     a second copy of it, so reordering the cycle left the picker in
     the old order and a dropped theme would have left a button with
     no [data-theme] block behind it — a control that silently does
     nothing, the same shape of bug as a --hue class matching no
     rule. The glyphs stay hand-written because a glyph is not
     derivable; an unknown theme gets a neutral one rather than
     nothing. */
  const GLYPH = { paper: '◐', ink: '☀' };
  THEME_ORDER.map((theme) => ({
    theme,
    label: theme.charAt(0).toUpperCase() + theme.slice(1),
    icon: GLYPH[theme] || '◐'
  })).forEach(({ theme, label, icon }) => {
    const b = document.createElement('button');
    b.dataset.theme = theme;
    b.title = label + ' theme';
    b.setAttribute('aria-label', label + ' theme');
    b.textContent = icon;
    b.addEventListener('click', () => applyTheme(theme));
    wrap.appendChild(b);
  });
  host.appendChild(wrap);
  // mark the active one
  const cur = currentTheme();
  wrap.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === cur));
};

// ============================================================
// APPEARANCE — theme and skin, one menu, four pages
// ------------------------------------------------------------
// These are the same kind of setting: neither changes the document,
// both change how it looks, and both are per-device. They used to be
// a single ◐ button that cycled three themes, which cannot express a
// second axis at all — three themes times N skins is a grid, not a
// cycle.
//
// Built here rather than in each page's toolbar because there is
// nothing page-specific about it, and because a skin dropped into
// src/styles/skins/ has to appear on all four pages without four
// edits. The choices are read live from skin.js, which reads them
// from the stylesheets.
// ============================================================
function appearanceMenu() {
  /* A glyph, not the word: this replaces a 32px icon button, and a
     110px "Appearance ▾" in its place wrapped the feature toolbar onto
     a second row — 40px of permanent chrome bought with one label. */
  return actionMenu('◐', [
    {
      label: 'Theme',
      action: 'set-theme',
      attr: 'data-theme-choice',
      value: currentTheme(),
      choices: THEME_ORDER.map((t) => ({
        value: t,
        label: t.charAt(0).toUpperCase() + t.slice(1)
      }))
    },
    {
      label: 'Design',
      action: 'set-skin',
      attr: 'data-skin-choice',
      value: currentSkin(),
      choices: listSkins().map((sk) => ({ value: sk.id, label: sk.label }))
    }
  ], { align: 'right', compact: true, ariaLabel: 'Appearance — theme and design' });
}
StudioUI.appearanceMenu = appearanceMenu;

/* Mount it wherever a page kept the old ◐ button, replacing it. One
   call site per page would be four call sites; this is one. */
function upgradeThemeButton(root) {
  const host = (root || document).querySelector('#darkBtn');
  if (!host || !host.parentElement) return;
  if (host.parentElement.querySelector('.tb-menu[data-appearance]')) return;
  const menu = appearanceMenu();
  menu.setAttribute('data-appearance', '');
  host.replaceWith(menu);
}
StudioUI.upgradeThemeButton = upgradeThemeButton;

/* Self-wired, so no page has to add an entry to its ACTIONS map for a
   setting none of them owns. */
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-theme-choice], [data-skin-choice]');
    if (!t) return;
    if (t.hasAttribute('data-theme-choice')) applyTheme(t.getAttribute('data-theme-choice'));
    else {
      const id = t.getAttribute('data-skin-choice');
      applySkin(id);
      const label = (listSkins().find((sk) => sk.id === id) || {}).label || id;
      StudioUI.toast('Design: ' + label, { type: 'info', duration: 1400 });
    }
    // Reflect the new state without rebuilding the menu.
    const grp = t.parentElement;
    grp.querySelectorAll('.tb-choice').forEach((b) => {
      const on = b === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
  });
}

// ============================================================
// READING PROGRESS BAR
// ============================================================
function injectReadingProgress() {
  if (document.querySelector('.reading-progress')) return;
  const wrap = document.createElement('div');
  wrap.className = 'reading-progress';
  const bar = document.createElement('div');
  bar.className = 'reading-progress-bar';
  wrap.appendChild(bar);
  document.body.appendChild(wrap);
  let raf = null;
  function update() {
    const h = document.documentElement;
    const max = (h.scrollHeight || 0) - (h.clientHeight || 0);
    const pct = max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0;
    bar.style.width = pct + '%';
    raf = null;
  }
  window.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(update);
  }, { passive: true });
  update();
}

// ============================================================
// AUTO-SAVE INDICATOR
// ============================================================
function ensureSaveIndicator() {
  let el = document.getElementById('saveIndicator');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'saveIndicator';
  el.className = 'save-indicator';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="si-dot"></span><span class="si-msg">SAVED</span>';
  document.body.appendChild(el);
  return el;
}
let saveTimer = null;
function setIndicator(state, msg) {
  const el = ensureSaveIndicator();
  el.classList.remove('saving', 'error');
  if (state === 'saving') el.classList.add('saving');
  if (state === 'error')  el.classList.add('error');
  el.querySelector('.si-msg').textContent = msg || 'SAVED';
  el.classList.add('show');
  clearTimeout(saveTimer);
  if (state !== 'saving') {
    saveTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }
}
StudioUI.markSaving = (msg) => setIndicator('saving', msg || 'SAVING…');
StudioUI.markSaved  = (msg) => setIndicator('saved', msg || 'SAVED');
StudioUI.markError  = (msg) => setIndicator('error', msg || 'SAVE FAILED');

// Field-saved tick (per textarea / input)
StudioUI.flashFieldSaved = function (el) {
  if (!el) return;
  let mark = el.parentElement && el.parentElement.querySelector('.field-saved-mark');
  if (!mark) {
    mark = document.createElement('span');
    mark.className = 'field-saved-mark';
    mark.textContent = '✓';
    const parent = el.parentElement;
    if (parent && parent.style) {
      const cs = getComputedStyle(parent);
      if (cs.position === 'static') parent.style.position = 'relative';
      parent.appendChild(mark);
    }
  }
  mark.classList.add('show');
  clearTimeout(mark._t);
  mark._t = setTimeout(() => mark.classList.remove('show'), 900);
};

// ============================================================
// SHORTCUT SHEET ("?" key)
// ============================================================
const DEFAULT_SHORTCUTS = [
  { keys: ['?'],          label: 'Open this shortcut sheet' },
  { keys: ['Esc'],        label: 'Close any open dialog / dropdown' },
  { keys: ['⌘/Ctrl', 'K'],label: 'Focus search (hub)' },
  { keys: ['⌘/Ctrl', 'S'],label: 'Save current blueprint' },
  /* Derived, not spelled. This label said "paper → sepia → ink" long
     after sepia was removed and after the order was reversed — a
     hand-written copy of THEME_ORDER, which is the list it is
     describing. Same reason the step list lives in JSON. */
  { keys: ['⌘/Ctrl', 'D'],label: `Cycle theme (${THEME_ORDER.join(' → ')})` },
  { keys: ['j'],          label: 'Next step (in any blueprint)' },
  { keys: ['k'],          label: 'Previous step' },
  { keys: ['g g'],        label: 'Jump to top' },
  { keys: ['G'],          label: 'Jump to end' },
  { keys: ['/'],          label: 'Focus the search input on this page' },
  { keys: ['⌘ K', 'Ctrl K'], label: 'Search the whole studio — modules, scenes, people, settings' }
];
function ensureShortcutSheet() {
  if (document.getElementById('shortcutSheet')) return;
  const overlay = document.createElement('div');
  overlay.id = 'shortcutSheet';
  overlay.className = 'shortcut-sheet-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Keyboard shortcuts');
  const sheet = document.createElement('div');
  sheet.className = 'shortcut-sheet';
  sheet.innerHTML =
    '<button class="shortcut-sheet-close" aria-label="Close">×</button>' +
    '<h3>Keyboard <em>shortcuts.</em></h3>' +
    '<p class="deck">A working desk needs muscle memory. Press <kbd>?</kbd> any time.</p>' +
    '<table>' +
      DEFAULT_SHORTCUTS.map(s => {
        const keys = s.keys.map(k => '<kbd>' + k + '</kbd>').join(' ');
        return '<tr><td>' + keys + '</td><td>' + s.label + '</td></tr>';
      }).join('') +
    '</table>';
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeShortcutSheet();
  });
  sheet.querySelector('.shortcut-sheet-close').addEventListener('click', closeShortcutSheet);
  document.body.appendChild(overlay);
}
function openShortcutSheet() {
  ensureShortcutSheet();
  document.getElementById('shortcutSheet').classList.add('show');
}
function closeShortcutSheet() {
  const el = document.getElementById('shortcutSheet');
  if (el) el.classList.remove('show');
}
StudioUI.openPalette  = openPalette;
StudioUI.closePalette = closePalette;
StudioUI.togglePalette = togglePalette;
StudioUI.openShortcutSheet  = openShortcutSheet;
StudioUI.closeShortcutSheet = closeShortcutSheet;

// ============================================================
// GLOBAL KEYBOARD HANDLER
// ============================================================
let lastKey = '';
function isTextInput(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}
document.addEventListener('keydown', (e) => {
  /* ⌘K / Ctrl-K, and it is checked BEFORE the text-input guard
     because the palette is the one binding that has to work while
     you are typing in a scene synopsis. e.key is lower-cased by the
     browser under Meta on some layouts and not others, hence the
     toLowerCase rather than a comparison to 'k'. */
  if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    togglePalette();
    return;
  }
  if (e.key === 'Escape') {
    if (isPaletteOpen()) { closePalette(); return; }
    closeShortcutSheet();
    closeCloudAuthModal();
    const sd = document.getElementById('shareDialog');
    if (sd) sd.remove();
    return;
  }
  if (e.key === '?' && !isTextInput(e.target)) {
    e.preventDefault();
    openShortcutSheet();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
    // Cycle theme — hub already binds toggleDark; we override by cycling
    e.preventDefault();
    StudioUI.cycleTheme();
    return;
  }
  if (!isTextInput(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'j') { jumpStep(1); }
    if (e.key === 'k') { jumpStep(-1); }
    if (e.key === 'G') { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
    if (e.key === 'g') {
      if (lastKey === 'g') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        lastKey = ''; return;
      }
    }
    if (e.key === '/') {
      const inp = document.getElementById('searchInput') ||
                  document.querySelector('input[type="search"], input[placeholder*="Search" i]');
      if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
    }
    lastKey = e.key;
  }
});

// ============================================================
// STEP RAIL — auto-builds from <section class="step">
// ============================================================
function buildStepRail() {
  const steps = document.querySelectorAll('section.step, section.ladder-step');
  if (steps.length < 4) return;  // only worth building on the big blueprints

  let rail = document.getElementById('stepRail');
  if (!rail) {
    rail = document.createElement('aside');
    rail.id = 'stepRail';
    rail.className = 'step-rail collapsed';
    rail.setAttribute('aria-label', 'Step navigation');
    const head = document.createElement('div');
    head.className = 'step-rail-head';
    head.textContent = 'STEPS';
    rail.appendChild(head);
    const list = document.createElement('div');
    list.className = 'step-rail-list';
    rail.appendChild(list);
    document.body.appendChild(rail);
  }
  const list = rail.querySelector('.step-rail-list');
  list.innerHTML = '';

  let currentGroup = null;
  let groupEl = null;
  steps.forEach((step) => {
    // try to detect a "group" — ladder-step is its own group
    const isLadder = step.classList.contains('ladder-step');
    const numEl = step.querySelector('.step-num, .step-header .step-num');
    const titleEl = step.querySelector('.step-title, h2');
    const num = numEl ? numEl.textContent.trim() : '';
    const title = titleEl ? titleEl.textContent.trim().replace(/\.$/, '') : '';
    if (!step.id) {
      const m = num.match(/(\d+)/);
      step.id = m ? ('step-' + String(parseInt(m[1], 10)).padStart(2, '0'))
                  : 'step-auto-' + Math.random().toString(36).slice(2, 7);
    }

    /* Four phases now, not two volumes. Derived from the step number
       because that is what the rail has to hand — the step data knows
       its own phase, but buildStepRail reads the rendered DOM. */
    const n = parseInt(num, 10);
    const group = isLadder ? 'INTERLUDE'
                : n <= 12 ? 'STORY'
                : n <= 24 ? 'PRE-PRODUCTION'
                : n <= 28 ? 'PRODUCTION'
                : 'POST-PRODUCTION';
    if (group !== currentGroup) {
      currentGroup = group;
      groupEl = document.createElement('div');
      groupEl.className = 'step-rail-group';
      const lab = document.createElement('div');
      lab.className = 'step-rail-group-label';
      lab.textContent = group;
      groupEl.appendChild(lab);
      list.appendChild(groupEl);
    }

    const a = document.createElement('a');
    a.href = '#' + step.id;
    a.className = 'step-rail-item';
    a.dataset.target = step.id;
    a.innerHTML = (num ? '<span class="sri-num">' + num + '</span>' : '<span class="sri-num">·</span>') +
                  '<span class="sri-title">' + (title || 'Untitled') + '</span>' +
                  '<span class="sri-check"></span>';
    a.addEventListener('click', () => {
      // smooth scroll handled by browser, but close the drawer on small screens
      if (window.innerWidth <= 1100) rail.classList.remove('show');
    });
    groupEl.appendChild(a);
  });

  // Toggle button
  if (!document.getElementById('stepRailToggle')) {
    const btn = document.createElement('button');
    btn.id = 'stepRailToggle';
    btn.className = 'step-rail-toggle';
    btn.setAttribute('aria-label', 'Toggle step navigation');
    btn.textContent = 'STEPS';
    btn.addEventListener('click', () => {
      const open = rail.classList.toggle('show');
      rail.classList.toggle('collapsed', !open);
      document.body.classList.toggle('rail-open', open);
    });
    document.body.appendChild(btn);
  }
  document.body.classList.add('has-step-rail');

  // Open by default on wide screens
  if (window.innerWidth > 1100) {
    rail.classList.remove('collapsed');
    rail.classList.add('show');
    document.body.classList.add('rail-open');
  }

  // Active highlighting via IntersectionObserver
  const items = Array.from(rail.querySelectorAll('.step-rail-item'));
  const byId = {};
  items.forEach(it => { byId[it.dataset.target] = it; });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const it = byId[entry.target.id];
      if (!it) return;
      if (entry.isIntersecting) {
        items.forEach(i => i.classList.remove('active'));
        it.classList.add('active');
      }
    });
  }, { rootMargin: '-30% 0px -65% 0px', threshold: 0 });
  steps.forEach(s => observer.observe(s));
}

// Helper for j / k jump
function jumpStep(direction) {
  const items = Array.from(document.querySelectorAll('.step-rail-item'));
  if (!items.length) {
    // fall back to all <section.step>
    const sections = document.querySelectorAll('section.step, section.ladder-step');
    if (!sections.length) return;
    let idx = 0;
    const top = window.scrollY + 120;
    sections.forEach((s, i) => {
      if (s.offsetTop < top) idx = i;
    });
    const target = sections[Math.max(0, Math.min(sections.length - 1, idx + direction))];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const activeIdx = items.findIndex(i => i.classList.contains('active'));
  const next = items[Math.max(0, Math.min(items.length - 1, (activeIdx === -1 ? 0 : activeIdx) + direction))];
  if (next) {
    const target = document.getElementById(next.dataset.target);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ============================================================
// 15-BEAT VISUALIZER
// ============================================================
// Inserts an SVG visualizer right above the b01 beat row, if found.
// Each beat is a dot on a Save-the-Cat-style emotional curve.
// Click a dot → focuses that beat's textarea.
// ============================================================
function buildBeatVisualizer() {
  const firstBeat = document.querySelector('[data-key="b01"]');
  if (!firstBeat) return;
  if (document.getElementById('beatVisualizer')) return;

  // Find the parent step container
  let step = firstBeat.closest('section.step') || firstBeat.parentElement;
  if (!step) return;

  // Save-the-Cat-style curve y-values (15 points, normalized 0-1, low=top, high=bottom in SVG)
  const beatYs = [
    0.50, // 1 opening image
    0.55, // 2 theme stated
    0.50, // 3 setup
    0.40, // 4 catalyst
    0.55, // 5 debate
    0.30, // 6 break into 2
    0.35, // 7 b story
    0.25, // 8 fun & games
    0.20, // 9 midpoint
    0.45, // 10 bad guys close in
    0.85, // 11 all is lost
    0.80, // 12 dark night
    0.30, // 13 break into 3
    0.15, // 14 finale
    0.40  // 15 final image
  ];
  const beatLabels = [
    'Opening', 'Theme', 'Setup', 'Catalyst', 'Debate',
    'Break II', 'B-Story', 'Fun & Games', 'Midpoint',
    'Bad guys', 'All lost', 'Dark night',
    'Break III', 'Finale', 'Final'
  ];

  const wrap = document.createElement('div');
  wrap.className = 'beat-visualizer';
  wrap.id = 'beatVisualizer';

  const head = document.createElement('div');
  head.className = 'beat-visualizer-head';
  head.innerHTML = '<span>15-BEAT EMOTIONAL CURVE</span><span style="opacity:.6;">CLICK A DOT TO JUMP</span>';
  wrap.appendChild(head);

  const W = 800, H = 220, padX = 40, padY = 30;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-label', '15-beat emotional curve');

  // Axes
  const axis = document.createElementNS(svgNS, 'line');
  axis.setAttribute('x1', padX); axis.setAttribute('x2', W - padX);
  axis.setAttribute('y1', H / 2); axis.setAttribute('y2', H / 2);
  axis.setAttribute('class', 'beat-axis');
  svg.appendChild(axis);

  // Curve: smooth path through points
  const points = beatYs.map((y, i) => {
    const x = padX + (i / (beatYs.length - 1)) * (W - 2 * padX);
    const yy = padY + y * (H - 2 * padY);
    return [x, yy];
  });
  let d = 'M' + points[0][0] + ',' + points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const cx = (x1 + x2) / 2;
    d += ' Q' + cx + ',' + y1 + ' ' + cx + ',' + ((y1 + y2) / 2);
    d += ' Q' + cx + ',' + y2 + ' ' + x2 + ',' + y2;
  }
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', 'beat-line');
  svg.appendChild(path);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'beat-tooltip';
  wrap.appendChild(tooltip);

  // Read filled state from blueprint storage
  let dataObj = {};
  try {
    dataObj = JSON.parse(localStorage.getItem('fms_filmmaker_combined_v1') || '{}');
  } catch (e) {}

  // Dots
  points.forEach(([x, y], i) => {
    const beatNum = i + 1;
    const key = 'b' + String(beatNum).padStart(2, '0');
    const filled = dataObj[key] && String(dataObj[key]).trim();

    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 5);
    dot.setAttribute('class', 'beat-dot' + (filled ? ' filled' : ''));
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('aria-label', 'Beat ' + beatNum + ': ' + beatLabels[i]);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', x); label.setAttribute('y', H - 6);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'beat-label');
    label.textContent = beatNum;

    function showTip() {
      const fld = document.querySelector('[data-key="' + key + '"]');
      const txt = fld && fld.value ? fld.value.slice(0, 140) + (fld.value.length > 140 ? '…' : '') : '(not yet filled)';
      // Was innerHTML with an inline style carrying a raw gold hex, a
      // literal font stack and magic px — and it interpolated the
      // user's own beat text, so a "<" in a script broke the tooltip.
      // .beat-tip-head is the same class the short blueprint's
      // visualiser uses, styled from tokens; textContent escapes.
      const tipHead = document.createElement('div');
      tipHead.className = 'beat-tip-head';
      tipHead.textContent = 'BEAT ' + beatNum + ' · ' + beatLabels[i].toUpperCase();
      const tipBody = document.createElement('div');
      tipBody.textContent = txt;
      tooltip.replaceChildren(tipHead, tipBody);
      const rect = svg.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      tooltip.style.left = ((x / W) * rect.width + (rect.left - wrapRect.left) - 110) + 'px';
      tooltip.style.top  = (y / H * rect.height + (rect.top - wrapRect.top) - 70) + 'px';
      tooltip.classList.add('show');
    }
    function hideTip() { tooltip.classList.remove('show'); }
    function jump() {
      const fld = document.querySelector('[data-key="' + key + '"]');
      if (fld) {
        fld.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => fld.focus(), 280);
      }
    }
    dot.addEventListener('mouseenter', showTip);
    dot.addEventListener('mouseleave', hideTip);
    dot.addEventListener('focus', showTip);
    dot.addEventListener('blur', hideTip);
    dot.addEventListener('click', jump);
    dot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); } });
    svg.appendChild(dot);
    svg.appendChild(label);
  });

  wrap.appendChild(svg);

  // Insert before the b01 row's container
  const insertBefore = firstBeat.closest('.beat-row, .ask, .field-row') ||
                        firstBeat.parentElement;
  if (insertBefore && insertBefore.parentElement) {
    insertBefore.parentElement.insertBefore(wrap, insertBefore);
  } else {
    step.appendChild(wrap);
  }
}

// Refresh visualizer when fields change
function refreshBeatFills() {
  const wrap = document.getElementById('beatVisualizer');
  if (!wrap) return;
  let dataObj = {};
  try { dataObj = JSON.parse(localStorage.getItem('fms_filmmaker_combined_v1') || '{}'); } catch (e) {}
  wrap.querySelectorAll('.beat-dot').forEach((dot, i) => {
    const key = 'b' + String(i + 1).padStart(2, '0');
    const filled = dataObj[key] && String(dataObj[key]).trim();
    dot.classList.toggle('filled', !!filled);
  });
}

// ============================================================
// GLOSSARY POPOVER
// ============================================================
// Glossary terms inline. Each blueprint can define a global
// window.STUDIO_GLOSSARY = { 'logline': 'def…', … }.
// ============================================================
function ensurePopover() {
  let p = document.getElementById('glossaryPopover');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'glossaryPopover';
  p.className = 'glossary-popover';
  p.setAttribute('role', 'tooltip');
  document.body.appendChild(p);
  return p;
}
/* The dictionaries are derived from src/data/glossary.json, so a term is
   added by editing the JSON and nothing else. The globals stay because
   the legacy pages set them directly; anything already there wins, so a
   page can still override an entry. */
const GLOSSARY = {};   // term -> { def, tanglish, examples }
(function buildGlossary() {
  const films = glossaryData.films || {};
  for (const entry of glossaryData.terms || []) {
    const record = {
      def: entry.def,
      tanglish: entry.tanglish,
      examples: (entry.examples || []).map((ex) => ({
        film: films[ex.film] || ex.film,
        note: ex.note
      }))
    };
    for (const key of [entry.term, ...(entry.aliases || [])]) {
      GLOSSARY[key.toLowerCase()] = record;
    }
  }
})();
/** Every term and alias, longest first so "the lie" wins over "lie". */
const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

function showPopover(term, anchor) {
  const key = term.toLowerCase();
  const entry = GLOSSARY[key];
  const legacyDef = (global.STUDIO_GLOSSARY || {})[key];
  const def = legacyDef || (entry && entry.def) || term;
  const tn = (global.STUDIO_GLOSSARY_TN || {})[key] || (entry && entry.tanglish);
  const p = ensurePopover();
  // Built as nodes, not an innerHTML string: the definitions are authored
  // but the term can come from page text, and this popover is one of the
  // places a stray "<" used to disappear silently.
  p.replaceChildren();
  const head = document.createElement('div');
  head.className = 'gp-term';
  head.textContent = term.toUpperCase();
  p.append(head);
  const body = document.createElement('div');
  body.textContent = def;
  p.append(body);
  if (tn) {
    const t = document.createElement('div');
    t.className = 'gp-tn';
    t.textContent = tn;
    p.append(t);
  }
  if (entry && entry.examples.length) {
    const wrap = document.createElement('div');
    wrap.className = 'gp-examples';
    for (const ex of entry.examples) {
      const row = document.createElement('div');
      row.className = 'gp-example';
      const film = document.createElement('span');
      film.className = 'gp-film';
      film.textContent = ex.film;
      row.append(film, document.createTextNode(' ' + ex.note));
      wrap.append(row);
    }
    p.append(wrap);
  }
  const rect = anchor.getBoundingClientRect();
  p.classList.add('show');
  requestAnimationFrame(() => {
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top = rect.top - ph - 10;
    left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
    if (top < 8) top = rect.bottom + 10;
    p.style.left = left + 'px';
    p.style.top  = top + 'px';
  });
}
function hidePopover() {
  const p = document.getElementById('glossaryPopover');
  if (p) p.classList.remove('show');
}
/* Mark up glossary terms in the step prose.

   The alternative was hand-tagging every occurrence across 35 steps of
   JSON, which would put the term list in two places and guarantee drift
   the first time a term is added. This derives it instead.

   Deliberately conservative: prose elements only, never inside a field,
   a heading the step rail reads, or an already-tagged span; one hit per
   term per step, so a section is annotated rather than speckled. It only
   wraps text in a span, so the page's visible words do not change and
   the verifier's coverage check is unaffected. */
const TAGGABLE = 'p, li, .step-deck, .hint, .why-this .label + p, .formula-box .eq';
function autoTagGlossary(root) {
  const scope = root || document;
  for (const section of scope.querySelectorAll('section.step, section.section-body, .glossary-scope')) {
    const used = new Set();
    for (const el of section.querySelectorAll(TAGGABLE)) {
      if (el.closest('[data-glossary], label, .gp-examples')) continue;
      for (const node of [...el.childNodes]) {
        if (node.nodeType !== 3) continue;            // text nodes only
        const text = node.nodeValue;
        if (!text || text.length < 4) continue;
        for (const key of GLOSSARY_KEYS) {
          if (used.has(key)) continue;
          // Whole words only, where "word" means what the verifier's
          // tokeniser means by it: [\p{L}\p{N}] plus apostrophes AND
          // hyphens. \b is wrong here — it treats "-" as a boundary, so
          // "want" matched inside "who-want-obstacle-end" and splitting
          // that text node turned one token into three. Mirror the
          // tokeniser exactly instead.
          const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp("(?<![\\p{L}\\p{N}'\u2019-])" + esc + "(?![\\p{L}\\p{N}'\u2019-])", 'iu');
          const m = re.exec(text);
          if (!m) continue;
          const span = document.createElement('span');
          span.className = 'glossary-term';
          span.setAttribute('data-glossary', key);
          span.setAttribute('tabindex', '0');
          span.setAttribute('role', 'button');
          span.setAttribute('aria-label', m[0] + ' — what this means, with examples');
          span.textContent = m[0];
          const after = node.splitText(m.index);
          after.nodeValue = after.nodeValue.slice(m[0].length);
          after.parentNode.insertBefore(span, after);
          used.add(key);
          break;                                       // one term per text node
        }
      }
    }
  }
}

function wireGlossaryPopovers() {
  autoTagGlossary();
  document.querySelectorAll('[data-glossary]').forEach(el => {
    if (el._glossaryWired) return;
    el._glossaryWired = true;
    const term = el.getAttribute('data-glossary') || el.textContent.trim();
    el.addEventListener('mouseenter', () => showPopover(term, el));
    el.addEventListener('mouseleave', hidePopover);
    el.addEventListener('focus', () => showPopover(term, el));
    el.addEventListener('blur', hidePopover);
  });
}

// ============================================================
// MOBILE BOTTOM ACTION BAR
// ============================================================
/* ============================================================
   THE MOBILE ACTION BAR
   ------------------------------------------------------------
   The working notes list this as a known blind spot: the verify
   run loads at 1280px and resizes to 390 afterwards, so anything
   gated on matchMedia at LOAD has already decided, and this bar
   never attaches during a run. Three things were wrong with it,
   and all three are the same bug seen from different sides —
   the decision was made once and never revisited.

   1. IT DECIDED AT LOAD AND NEVER AGAIN. A phone turned to
      landscape crosses 720px, and the bar stayed. Turned back,
      and a page loaded in landscape never got one. The media
      query is LISTENED to now, not sampled.

   2. IT RESERVED A GUESS. `padding-bottom: var(--s8)` is 64px;
      the bar is a row of 48px targets plus padding plus
      env(safe-area-inset-bottom), which on a phone with a gesture
      bar is more than 64. So the last control on every long
      blueprint sat under it. The height is measured and published
      as --mab-h, and the page reserves that.

   3. IT HAD NO WAY INTO THE STUDIO. The four items were Studio,
      Top, Bottom and Keys — and Keys is a shortcut sheet, on the
      one device with no keyboard. Search replaces it: the palette
      is the whole of navigation on a phone, and ⌘K is not
      reachable there.
   ============================================================ */
const MAB_QUERY = '(max-width: 720px)';

function mobileBarItems() {
  return [
    { icon: '⌕', label: 'SEARCH', onClick: () => openPalette() },
    { icon: '←', label: 'STUDIO', href: 'index.html' },
    { icon: '↑', label: 'TOP',    onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { icon: '↓', label: 'END',    onClick: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }
  ];
}

function measureMobileBar() {
  const bar = document.getElementById('mobileActionbar');
  const px = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--mab-h', px + 'px');
}

StudioUI.attachMobileActionBar = function (config) {
  if (document.getElementById('mobileActionbar')) return;
  /* A page that is already a narrow tool — the extension's side panel —
     opts out with <html data-no-actionbar>: a bottom bar of SEARCH /
     STUDIO / TOP / END over a 360px panel covers the panel's own
     controls and duplicates what it is. */
  if (document.documentElement.hasAttribute('data-no-actionbar')) return;
  config = config || {};
  const items = config.items || mobileBarItems();
  const bar = document.createElement('div');
  bar.id = 'mobileActionbar';
  bar.className = 'mobile-actionbar';
  bar.setAttribute('role', 'toolbar');
  /* A toolbar role with no name is "toolbar" and nothing else to a
     screen reader, on a page that already has two other toolbars. */
  bar.setAttribute('aria-label', 'Page actions');
  items.forEach(it => {
    const el = document.createElement(it.href ? 'a' : 'button');
    if (it.href) el.href = it.href; else el.type = 'button';
    el.setAttribute('aria-label', it.label);
    const icon = document.createElement('span');
    icon.className = 'mab-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = it.icon;
    const text = document.createElement('span');
    text.textContent = it.label;
    el.append(icon, text);
    if (it.onClick) el.addEventListener('click', it.onClick);
    bar.appendChild(el);
  });
  document.body.appendChild(bar);
  document.body.classList.add('has-mobile-actionbar');
  /* MEASURE NOW, THEN AGAIN.

     requestAnimationFrame DOES NOT RUN IN A BACKGROUND TAB, and a
     page opened in one is ordinary: open-in-new-tab, a restored
     session, a PWA cold start behind another app. Measuring only in
     a rAF meant --mab-h stayed unset for as long as the tab was
     hidden, the body fell back to 64px, and the bar is 69 — so the
     last control on the page sat under it until the tab was
     focused, at which point it silently corrected itself. A bug
     that fixes itself the moment you look at it is a bug nobody
     reports.

     getBoundingClientRect() forces layout and works in a hidden
     tab, so the first measurement is synchronous. The rAF stays as
     the refinement for when the web fonts land and the labels
     change height. */
  measureMobileBar();
  requestAnimationFrame(measureMobileBar);
};

StudioUI.detachMobileActionBar = function () {
  const bar = document.getElementById('mobileActionbar');
  if (bar) bar.remove();
  document.body.classList.remove('has-mobile-actionbar');
  document.documentElement.style.setProperty('--mab-h', '0px');
};

/* Attach and detach as the viewport crosses the breakpoint, rather
   than sampling it once. `change` on a MediaQueryList is the event
   that fires for a rotation as well as a resize, which a window
   resize listener on a phone does not reliably do. */
function syncMobileActionBar() {
  let mq;
  try { mq = window.matchMedia(MAB_QUERY); } catch (e) { return; }
  const apply = () => {
    if (mq.matches) StudioUI.attachMobileActionBar();
    else StudioUI.detachMobileActionBar();
  };
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply);   // Safari < 14
  window.addEventListener('resize', () => requestAnimationFrame(measureMobileBar));
}
StudioUI.syncMobileActionBar = syncMobileActionBar;

// ============================================================
// FIELD-SAVED FLASH ON BLUR (any [data-key] field)
// ============================================================
function wireFieldSavedFlash() {
  if (document._fieldSavedWired) return;
  document._fieldSavedWired = true;
  document.addEventListener('blur', (e) => {
    const t = e.target;
    if (!t || !t.hasAttribute) return;
    if (t.hasAttribute('data-key') && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
      // only flash if the field has content
      if ((t.value || '').trim()) {
        StudioUI.flashFieldSaved(t);
        // After Field blur, refresh beat visualizer if relevant
        if (/^b\d{2}$/.test(t.getAttribute('data-key'))) refreshBeatFills();
      }
    }
  }, true);
}

// ============================================================
// ARIA LABELS — auto-fix common gaps
// ============================================================
function autoAriaLabels() {
  document.querySelectorAll('button:not([aria-label])').forEach(btn => {
    const txt = btn.textContent.trim();
    if (txt && txt.length <= 3) {
      // icon-style button — derive label from title
      if (btn.title) btn.setAttribute('aria-label', btn.title);
    }
  });
  document.querySelectorAll('a:not([aria-label])').forEach(a => {
    if (!a.textContent.trim() && a.title) a.setAttribute('aria-label', a.title);
  });
  // Fields whose only label is a placeholder. A placeholder is not a
  // label: it disappears the moment you type, so the rate and day cells
  // in the budget tables announced nothing once they held a value.
  // Derived from the placeholder rather than hand-written, so a new
  // column is covered the day it is added.
  document.querySelectorAll(
    'input:not([aria-label]):not([aria-labelledby]),' +
    'textarea:not([aria-label]):not([aria-labelledby]),' +
    'select:not([aria-label]):not([aria-labelledby])'
  ).forEach(el => {
    if (el.type === 'hidden') return;
    if (el.closest('label')) return;
    if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return;
    const name = el.placeholder || el.title;
    if (name) el.setAttribute('aria-label', name);
  });
}

// ============================================================
// EMPTY-STATE POLISH — replace bare "—" with charm
// ============================================================
StudioUI.polishEmptyStates = function () {
  document.querySelectorAll('.status-value, .resume-meta').forEach(el => {
    if (el.textContent.trim() === '—' && !el.dataset.polished) {
      // leave it, but add a class that styles it kindly
      el.classList.add('empty-charm');
    }
  });
};

// ============================================================
// CLOUD UI — migration prompt + share dialog
// ------------------------------------------------------------
// The sign-in pill, the auth modal and the account menu used to be
// here too. They moved to src/ui/auth.js, which is imported at the
// top of this file and re-exported at the bottom, so every existing
// `StudioUI.openCloudAuthModal(...)` call site keeps working.
//
// The move was not tidying. This section carried four inline
// `onclick`/`onsubmit` attributes, and `verify` could not see them:
// it counts inline handlers in the DOM at load, and these were in a
// modal that is only built when somebody opens it. Under the shipped
// CSP (`script-src 'self'`) every one of them is inert, which made
// the "sign in" button the one control on the site guaranteed to do
// nothing in production while passing every check locally.
//
// What is left below still reaches StudioCloud through its global
// rather than an import, for the reason given in auth.js.
// ============================================================


// ----- migration prompt ---------------------------------------
function openMigrationModal(count) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'cm-overlay show';
    overlay.innerHTML =
      '<div class="cm-card" style="max-width:440px;">' +
        '<div class="cm-eyebrow">MIGRATION</div>' +
        '<h2>' + count + ' project' + (count === 1 ? '' : 's') + ' found <em>locally.</em></h2>' +
        '<p class="cm-deck">Upload to your cloud account so you can edit them on any device, share with collaborators, and never lose work to a cleared browser.</p>' +
        '<p class="cm-hint">You can decide later — projects stay on this device until uploaded.</p>' +
        '<div class="cm-actions">' +
          '<button class="cm-btn" id="mmNo">NOT NOW</button>' +
          '<button class="cm-btn primary" id="mmYes">UPLOAD ALL</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    function close(answer) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(answer);
    }
    overlay.querySelector('#mmYes').addEventListener('click', () => close(true));
    overlay.querySelector('#mmNo').addEventListener('click',  () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

// ----- share dialog -------------------------------------------
function openShareDialog(projectId) {
  if (!projectId) return;
  if (!window.StudioCloud || !StudioCloud.getSession()) {
    openCloudAuthModal();
    return;
  }
  let m = document.getElementById('shareDialog');
  if (m) m.remove();
  m = document.createElement('div');
  m.id = 'shareDialog';
  m.className = 'cm-overlay';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.innerHTML =
    '<div class="cm-card" style="max-width:560px;">' +
      '<button type="button" class="cm-close" aria-label="Close">×</button>' +
      '<div class="cm-eyebrow">SHARING</div>' +
      '<h2>Share <em>this project.</em></h2>' +
      '<p class="cm-deck">Create a link with a role. Anyone who opens it (and signs in) gets that level of access. Revoke any link any time.</p>' +
      '<div class="share-row">' +
        '<select id="shRole" aria-label="Share role">' +
          '<option value="view">VIEW · read only</option>' +
          '<option value="comment" selected>COMMENT · read + comment (default)</option>' +
          '<option value="edit">EDIT · full edit access</option>' +
        '</select>' +
        '<select id="shExp" aria-label="Expiry">' +
          '<option value="">NO EXPIRY</option>' +
          '<option value="1">1 DAY</option>' +
          '<option value="7" selected>7 DAYS</option>' +
          '<option value="30">30 DAYS</option>' +
        '</select>' +
        '<button class="cm-btn primary" id="shGen">GENERATE LINK</button>' +
      '</div>' +
      '<div class="share-result" id="shResult" hidden>' +
        '<input type="text" id="shUrl" readonly>' +
        '<button class="cm-btn" id="shCopy">COPY</button>' +
      '</div>' +
      '<h3 class="share-h3">Active links</h3>' +
      '<div id="shList" class="share-list"><em class="cm-hint">Loading…</em></div>' +
    '</div>';
  document.body.appendChild(m);
  m.querySelector('.cm-close').addEventListener('click', () => m.remove());
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  m.querySelector('#shGen').addEventListener('click', async () => {
    const role = m.querySelector('#shRole').value;
    const days = parseInt(m.querySelector('#shExp').value, 10);
    const exp = days ? new Date(Date.now() + days * 86400e3).toISOString() : null;
    try {
      const token = await StudioCloud.createShare(projectId, role, exp);
      const url = location.origin + '/index.html?share=' + token;
      const wrap = m.querySelector('#shResult');
      wrap.hidden = false;
      m.querySelector('#shUrl').value = url;
      renderShareList();
      StudioUI.toastSuccess('Share link created (' + role + ').');
    } catch (e) { StudioUI.toastError(e.message || String(e)); }
  });
  m.querySelector('#shCopy').addEventListener('click', () => {
    const inp = m.querySelector('#shUrl');
    inp.select();
    try { document.execCommand('copy'); StudioUI.toastSuccess('Copied!'); }
    catch (e) { navigator.clipboard.writeText(inp.value); StudioUI.toastSuccess('Copied!'); }
  });
  async function renderShareList() {
    const list = m.querySelector('#shList');
    list.innerHTML = '<em class="cm-hint">Loading…</em>';
    const rows = await StudioCloud.listShares(projectId);
    if (!rows.length) { list.innerHTML = '<em class="cm-hint">No active links yet.</em>'; return; }
    list.innerHTML = rows.map(r => {
      const exp = r.expires_at ? ('expires ' + new Date(r.expires_at).toLocaleDateString()) : 'no expiry';
      const url = location.origin + '/index.html?share=' + r.token;
      return '<div class="share-item">' +
        '<div class="si-meta">' +
          '<span class="si-role">' + r.role.toUpperCase() + '</span>' +
          '<span class="si-exp">' + exp + '</span>' +
        '</div>' +
        '<input class="si-url" value="' + url + '" readonly>' +
        '<button class="si-revoke" data-id="' + r.id + '" aria-label="Revoke">×</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('.si-revoke').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Revoke this link? Anyone using it will lose access.')) return;
        try { await StudioCloud.revokeShare(btn.dataset.id); renderShareList(); StudioUI.toastSuccess('Link revoked.'); }
        catch (e) { StudioUI.toastError(e.message || String(e)); }
      });
    });
    list.querySelectorAll('.si-url').forEach(inp => {
      inp.addEventListener('focus', () => inp.select());
    });
  }
  m.classList.add('show');
  renderShareList();
}

// Re-exposed from ./auth.js so the global keeps the shape every
// existing caller (and the legacy inline page scripts) expects.
StudioUI.attachSignInPill      = attachSignInPill;
StudioUI.refreshSignInPill     = refreshSignInPill;
StudioUI.openCloudAuthModal    = openCloudAuthModal;
StudioUI.closeCloudAuthModal   = closeCloudAuthModal;
StudioUI.openAccountMenu       = openAccountMenu;
StudioUI.openMigrationModal    = openMigrationModal;
StudioUI.openShareDialog       = openShareDialog;
// These two were `StudioUI._cmShowCfg` / `_cmSaveCfg`, reached from
// inline onclick attributes in the old modal markup. The markup is
// gone; the names stay because the module surface exports them.
StudioUI._cmShowCfg            = showConfigBlock;
StudioUI._cmSaveCfg            = saveConfig;

// ============================================================
// PUBLIC API
// ============================================================
StudioUI.injectSkipLink            = injectSkipLink;
StudioUI.injectReadingProgress     = injectReadingProgress;
StudioUI.buildStepRail             = buildStepRail;
StudioUI.buildBeatVisualizer       = buildBeatVisualizer;
StudioUI.refreshBeatFills          = refreshBeatFills;
StudioUI.wireGlossaryPopovers      = wireGlossaryPopovers;
StudioUI.wireFieldSavedFlash       = wireFieldSavedFlash;
StudioUI.autoAriaLabels            = autoAriaLabels;
StudioUI.openShortcutSheet         = openShortcutSheet;

// Legacy inline page scripts call this by global name; keep the global.
// (It used to also serve the auth modal's own inline handlers. Those
// are gone — see the CLOUD UI note above.)
global.StudioUI = StudioUI;

// ============================================================
// AUTO-INIT
// ============================================================
// Apply theme and skin NOW (before DOMContentLoaded) to avoid a flash
// of the wrong palette or the wrong design.
try { loadTheme(); } catch (e) {}
try { loadSkin(); } catch (e) {}

/* The page toolbar's height used to be measured and published here
   as --tb-h, feeding a --scroll-offset this file no longer owns.
   shell.js's measureChrome() measures the WHOLE pinned band — the
   shell bar, the toolbar, and any bar a page adds — and publishes
   --sh-chrome-h for the one scroll-padding-top rule in chrome.css.
   Two measurements of overlapping things, feeding two offsets that
   ADD, is worse than either. */

function autoInit() {
  try {
    // Offline support for EVERY page, not just the hub. This lives here
    // rather than in each page entry because the shared chrome is the one
    // module all four entries already import; registerSW() is memoised and
    // does nothing under `vite dev`.
    registerSW();

    loadTheme();
    loadSkin();
    injectSkipLink();
    injectReadingProgress();
    ensureToastHost();
    ensureSaveIndicator();
    ensureShortcutSheet();
    buildStepRail();
    buildBeatVisualizer();
    wireGlossaryPopovers();
    wireFieldSavedFlash();
    autoAriaLabels();
    StudioUI.polishEmptyStates();
    // Auto-attach sign-in pill to the toolbar on every page
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) attachSignInPill(toolbar);
    upgradeThemeButton(toolbar);
    /* Two frames, for the same reason shell.js measures twice: once
       for layout and once for Fraunces and JetBrains Mono to land.
       A toolbar measured in the fallback face is a toolbar measured
       at the wrong height. */

    /* Every page with a document in it, not only the blueprints.
       The bar is how you move around on a phone — the rail is
       behind a toggle and ⌘K does not exist there — so limiting it
       to `section.step` left the eleven scene-derived modules with
       no navigation at all below 720px. */
    if (document.querySelector('section.step, main, #app, .wrap')) {
      syncMobileActionBar();
    }
  } catch (e) {
    console.warn('[StudioUI] init error', e);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit);
} else {
  autoInit();
}

// Show "saving → saved" pill whenever any scoped storage write happens.
// Debounced so a stream of input events shows ONE pill, not 50.
let _saveDebounce = null;
Store.subscribe('saved', () => {
  StudioUI.markSaving('SAVING…');
  clearTimeout(_saveDebounce);
  _saveDebounce = setTimeout(() => {
    StudioUI.markSaved('SAVED');
  }, 450);
});

// Watch for storage changes to refresh the beat visualizer
Store.subscribe('current:changed', () => {
  setTimeout(refreshBeatFills, 200);
});
window.addEventListener('storage', (e) => {
  if (e.key && e.key.indexOf('fms_filmmaker_combined_v1') === 0) {
    setTimeout(refreshBeatFills, 100);
  }
});

// ============================================================
// EXPORTS — same surface as the old `window.StudioUI` global.
// ============================================================
export {
  applyTheme,
  injectSkipLink,
  injectReadingProgress,
  buildStepRail,
  buildBeatVisualizer,
  refreshBeatFills,
  wireGlossaryPopovers,
  wireFieldSavedFlash,
  autoAriaLabels,
  openShortcutSheet,
  closeShortcutSheet,
  openPalette,
  closePalette,
  togglePalette,
  attachSignInPill,
  refreshSignInPill,
  openCloudAuthModal,
  closeCloudAuthModal,
  openAccountMenu,
  openMigrationModal,
  openShareDialog,
  StudioUI
};

// Defined as properties on the StudioUI object above; re-exported here
// by reference so the module surface matches the global's shape.
export const {
  toast,
  toastSuccess,
  toastError,
  toastInfo,
  notify,
  cycleTheme,
  attachThemePicker,
  markSaving,
  markSaved,
  markError,
  flashFieldSaved,
  attachMobileActionBar,
  polishEmptyStates,
  _cmShowCfg,
  _cmSaveCfg
} = StudioUI;

export default StudioUI;
