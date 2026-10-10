/* ============================================================
   MOTION — vanilla rebuild of a handful of Motion Primitives effects.
   Imports NOTHING (it sits in the `startlib` chunk, so the landing
   page can use it without pulling the studio core). Touches no
   storage. Content is visible without JS: the only state JS adds is
   the class that hides something it is about to reveal, and an 8s
   backstop removes even that. Every distance is multiplied by
   --motion, read from the computed style. Pointer effects run on
   (hover:hover) and (pointer:fine) only; listeners are passive and
   rAF-throttled.
   ============================================================ */

const mm = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };

export function prefersReducedMotion() {
  /* html.ma-off is the Settings > Appearance switch (motion-pref.js). */
  return mm('(prefers-reduced-motion: reduce)') || (typeof document !== 'undefined' && document.documentElement.classList.contains('ma-off'));
}

const finePointer = () => mm('(hover: hover) and (pointer: fine)');
const motionScale = () => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion'));
  return Number.isFinite(v) ? v : 1;
};
const BACKSTOP = 8000;

/* ---- reveal ---------------------------------------------------- */
export function reveal(root = document, { once = true } = {}) {
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) return;
  const items = [];
  const add = (n) => { if (!n.hidden && !items.includes(n)) items.push(n); };
  root.querySelectorAll('[data-reveal]').forEach(add);
  root.querySelectorAll('[data-reveal-group]').forEach((g) => {
    Array.from(g.children).forEach((c, i) => { c.style.setProperty('--i', Math.min(i, 10)); add(c); });
  });
  if (!items.length) return;
  const show = (n) => { n.classList.remove('mo-veil'); n.classList.add('mo-in'); };
  /* A fragment target (page.html#id) must not be veiled: a section still
     rising from its offset is a jump that lands in the wrong place.
     Anything that IS, holds or sits in the target appears at once. */
  const target = () => {
    try { return location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; }
    catch (e) { return null; }
  };
  const onTarget = (n, t) => !!t && (n === t || n.contains(t) || t.contains(n));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { show(en.target); if (once) io.unobserve(en.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
  const t0 = target();
  for (const n of items) { if (onTarget(n, t0)) continue; n.classList.add('mo-veil'); io.observe(n); }
  const onHash = () => {
    const t = target();
    for (const n of items) if (onTarget(n, t) && n.classList.contains('mo-veil')) { n.classList.remove('mo-veil'); io.unobserve(n); }
  };
  addEventListener('hashchange', onHash);
  /* Printing shows everything: a card never scrolled to is still veiled,
     and a page printed from the top would come out blank below the fold.
     motion.css says the same for print media; this covers the reveal
     classes being removed so the screen agrees after the dialog. */
  const all = () => { io.disconnect(); items.forEach(show); removeEventListener('hashchange', onHash); removeEventListener('beforeprint', all); };
  addEventListener('beforeprint', all);
  setTimeout(all, BACKSTOP);
}

/* ---- splitWords ------------------------------------------------ */
export function splitWords(el, { onScroll = false } = {}) {
  if (!el || el.dataset.moSplit) return el;
  const wait = onScroll && !prefersReducedMotion() && 'IntersectionObserver' in window;
  /* The words stay READABLE: no aria-label on the heading and no
     aria-hidden on the spans. A label fixed at split time went stale the
     first time a page rewrote the heading (the hub's resume title, on
     every project switch), so a screen reader announced the last film. */
  let i = 0;
  const walk = (node) => {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) {
        const parts = c.nodeValue.split(/(\s+)/);
        if (parts.length === 1 && !parts[0]) continue;
        const frag = document.createDocumentFragment();
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) { frag.append(document.createTextNode(p)); continue; }
          const s = document.createElement('span');
          s.className = 'mo-w';
          s.style.setProperty('--i', Math.min(i++, 14));
          s.textContent = p;
          frag.append(s);
        }
        c.replaceWith(frag);
      } else if (c.nodeType === 1) walk(c);
    }
  };
  walk(el);
  el.dataset.moSplit = '1';
  if (wait) {
    el.classList.add('mo-w-wait');
    const go = () => { el.classList.remove('mo-w-wait'); el.classList.add('mo-w-go'); };
    const io = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) { io.disconnect(); go(); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    io.observe(el);
    setTimeout(() => { io.disconnect(); go(); }, BACKSTOP);
  }
  return el;
}

/* ---- countUp --------------------------------------------------- */
const pending = new Map();
let countIO = null;
let countTimer = 0;
function ensureCountIO() {
  if (countIO) return;
  countIO = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      countIO.unobserve(en.target);
      const job = pending.get(en.target);
      if (job) { pending.delete(en.target); job.run(); }
    }
  }, { threshold: 0.2 });
  countTimer = setTimeout(() => {
    pending.forEach((j) => j.done());
    pending.clear();
  }, BACKSTOP);
}

export function countUp(el, { duration = 1400 } = {}) {
  if (!el || el.dataset.moCount) return;
  let node = null;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { if (/\d/.test(w.currentNode.nodeValue)) { node = w.currentNode; break; } }
  if (!node) return;
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s.exec(node.nodeValue);
  if (!m) return;
  const [, pre, numTxt, post] = m;
  const decimals = (numTxt.split('.')[1] || '').length;
  const indian = /\d{1,2}(,\d{2})+,\d{3}/.test(numTxt);
  const grouped = numTxt.includes(',');
  const target = el.dataset.countTo != null ? parseFloat(el.dataset.countTo) : parseFloat(numTxt.replace(/,/g, ''));
  if (!Number.isFinite(target)) return;
  const fmt = (v) => {
    const o = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    const s = v.toLocaleString(indian ? 'en-IN' : 'en-US', Object.assign(o, { useGrouping: grouped || el.dataset.countTo != null && target >= 1000 }));
    return pre + s + post;
  };
  const final = () => { node.nodeValue = fmt(target); };
  el.dataset.moCount = '1';
  if (prefersReducedMotion() || navigator.webdriver || !('IntersectionObserver' in window)) {
    if (el.dataset.countTo != null) final();
    return;
  }
  /* 0 is written when the count STARTS, never at registration: until
     then the real figure stays in the DOM for screen readers, copy and
     crawlers (it used to read "₹0" for every paid tier until scrolled). */
  const run = () => {
    node.nodeValue = fmt(0);
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      if (p < 1) { node.nodeValue = fmt(target * e); requestAnimationFrame(tick); } else final();
    };
    requestAnimationFrame(tick);
  };
  ensureCountIO();
  pending.set(el, { run, done: final });
  countIO.observe(el);
}

/* ---- pointer effects ------------------------------------------- */
function onPointer(el, move, leave) {
  let raf = 0, last = null;
  el.addEventListener('pointermove', (e) => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; move(last); });
  }, { passive: true });
  el.addEventListener('pointerleave', () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    leave();
  }, { passive: true });
}

export function spotlight(el) {
  if (!el || !finePointer()) return;
  el.classList.add('mo-spot');
  onPointer(el, (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, () => {});
}

export function magnetic(el, { strength = 6 } = {}) {
  if (!el || !finePointer()) return;
  el.classList.add('mo-mag');
  onPointer(el, (e) => {
    const r = el.getBoundingClientRect();
    const k = strength * motionScale();
    const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.translate = (dx * k).toFixed(2) + 'px ' + (dy * k).toFixed(2) + 'px';
  }, () => { el.style.translate = ''; });
}

export function tilt(el, { max = 4 } = {}) {
  if (!el || !finePointer()) return;
  el.classList.add('mo-tilt');
  const host = el.parentElement || el;
  onPointer(host, (e) => {
    const r = host.getBoundingClientRect();
    const k = max * motionScale();
    const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.transform = 'perspective(900px) rotateX(' + (-dy * k).toFixed(2) + 'deg) rotateY(' + (dx * k).toFixed(2) + 'deg)';
  }, () => { el.style.transform = ''; });
}
