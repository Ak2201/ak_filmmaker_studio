/* ============================================================
   STUDIO v2 — UX/UI HELPERS
   ------------------------------------------------------------
   Loaded after studio-store.js. Adds:
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
   No build step. Idempotent. Safe to call from any page.
   ============================================================ */
(function (global) {
  'use strict';

  if (!global.StudioStore) {
    console.warn('[StudioUI] StudioStore must load first.');
    return;
  }

  const Store = global.StudioStore;
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
  function ensureToastHost() {
    let host = document.getElementById('toastHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
    return host;
  }

  StudioUI.toast = function (msg, opts) {
    opts = opts || {};
    const host = ensureToastHost();
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
    const duration = opts.duration || 3200;
    let timer;
    function dismiss() {
      clearTimeout(timer);
      t.classList.remove('show');
      setTimeout(() => { try { host.removeChild(t); } catch (e) {} }, 260);
    }
    if (duration > 0) timer = setTimeout(dismiss, duration);
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
  const THEME_KEY = 'arunak_studio_theme_v1';
  function applyTheme(theme) {
    if (!document.body) {
      // Document not parsed yet — defer until ready
      document.addEventListener('DOMContentLoaded', () => applyTheme(theme));
      return;
    }
    document.body.classList.remove('dark', 'sepia');
    if (theme === 'ink')   document.body.classList.add('dark');
    if (theme === 'sepia') document.body.classList.add('sepia');
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    // Update any picker UIs
    document.querySelectorAll('.theme-picker button').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
    // Existing hub dark button keeps working — sync icon
    const darkBtn = document.getElementById('darkBtn');
    if (darkBtn) darkBtn.textContent = theme === 'ink' ? '☀' : (theme === 'sepia' ? '◉' : '◐');
  }
  function loadTheme() {
    let t;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (t === 'ink' || t === 'sepia' || t === 'paper') {
      applyTheme(t);
    } else {
      // fall back to legacy dark-mode pref
      try {
        const old = JSON.parse(localStorage.getItem('arunak_studio_prefs_v1') || '{}');
        applyTheme(old.dark ? 'ink' : 'paper');
      } catch (e) { applyTheme('paper'); }
    }
  }
  StudioUI.applyTheme = applyTheme;
  StudioUI.cycleTheme = function () {
    const cur = document.body.classList.contains('sepia') ? 'sepia'
              : document.body.classList.contains('dark') ? 'ink'
              : 'paper';
    const next = cur === 'paper' ? 'sepia' : cur === 'sepia' ? 'ink' : 'paper';
    applyTheme(next);
    StudioUI.toast('Theme: ' + next, { type: 'info', duration: 1400 });
  };
  StudioUI.attachThemePicker = function (host) {
    if (!host || host.querySelector('.theme-picker')) return;
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'Theme');
    [
      { theme: 'paper', label: 'Paper', icon: '◐' },
      { theme: 'sepia', label: 'Sepia', icon: '◉' },
      { theme: 'ink',   label: 'Ink',   icon: '☀' }
    ].forEach(({ theme, label, icon }) => {
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
    const cur = document.body.classList.contains('sepia') ? 'sepia'
              : document.body.classList.contains('dark') ? 'ink'
              : 'paper';
    wrap.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === cur));
  };

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
    { keys: ['⌘/Ctrl', 'D'],label: 'Cycle theme (paper → sepia → ink)' },
    { keys: ['j'],          label: 'Next step (in any blueprint)' },
    { keys: ['k'],          label: 'Previous step' },
    { keys: ['g g'],        label: 'Jump to top' },
    { keys: ['G'],          label: 'Jump to end' },
    { keys: ['/'],          label: 'Focus the search input on this page' }
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
    if (e.key === 'Escape') {
      closeShortcutSheet();
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

      const group = isLadder ? 'INTERLUDE'
                  : (parseInt(num, 10) <= 12 ? 'VOL I' : 'VOL II');
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
      dataObj = JSON.parse(localStorage.getItem('arunak_filmmaker_combined_v1') || '{}');
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
        tooltip.innerHTML = '<strong style="font-family:JetBrains Mono;font-size:10px;letter-spacing:1.5px;color:#a87a32;">BEAT ' + beatNum + ' · ' + beatLabels[i].toUpperCase() + '</strong><br>' + txt;
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
    try { dataObj = JSON.parse(localStorage.getItem('arunak_filmmaker_combined_v1') || '{}'); } catch (e) {}
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
  function showPopover(term, anchor) {
    const dict = global.STUDIO_GLOSSARY || {};
    const def = dict[term.toLowerCase()] || term;
    const tn = (global.STUDIO_GLOSSARY_TN || {})[term.toLowerCase()];
    const p = ensurePopover();
    p.innerHTML =
      '<div class="gp-term">' + term.toUpperCase() + '</div>' +
      '<div>' + def + '</div>' +
      (tn ? '<div class="gp-tn">' + tn + '</div>' : '');
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
  function wireGlossaryPopovers() {
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
  StudioUI.attachMobileActionBar = function (config) {
    if (document.getElementById('mobileActionbar')) return;
    config = config || {};
    const items = config.items || [
      { icon: '←', label: 'STUDIO', href: 'index.html' },
      { icon: '↑', label: 'TOP', onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
      { icon: '↓', label: 'BOTTOM', onClick: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) },
      { icon: '?', label: 'KEYS', onClick: openShortcutSheet }
    ];
    const bar = document.createElement('div');
    bar.id = 'mobileActionbar';
    bar.className = 'mobile-actionbar';
    bar.setAttribute('role', 'toolbar');
    items.forEach(it => {
      const tag = it.href ? 'a' : 'button';
      const el = document.createElement(tag);
      if (it.href) el.href = it.href;
      el.setAttribute('aria-label', it.label);
      el.innerHTML = '<span class="mab-icon" aria-hidden="true">' + it.icon + '</span>' +
                     '<span>' + it.label + '</span>';
      if (it.onClick) el.addEventListener('click', it.onClick);
      bar.appendChild(el);
    });
    document.body.appendChild(bar);
    document.body.classList.add('has-mobile-actionbar');
  };

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

  global.StudioUI = StudioUI;

  // ============================================================
  // AUTO-INIT
  // ============================================================
  // Apply theme NOW (before DOMContentLoaded) to avoid flash.
  try { loadTheme(); } catch (e) {}

  function autoInit() {
    try {
      loadTheme();
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
      // Mobile bar on blueprints (auto-detect)
      if (document.querySelector('section.step') && window.matchMedia('(max-width: 720px)').matches) {
        StudioUI.attachMobileActionBar();
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
    if (e.key && e.key.indexOf('arunak_filmmaker_combined_v1') === 0) {
      setTimeout(refreshBeatFills, 100);
    }
  });

})(typeof window !== 'undefined' ? window : this);
