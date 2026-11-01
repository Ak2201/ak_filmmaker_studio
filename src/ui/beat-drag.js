/* ============================================================
   BEAT DRAG — move a Beat Sheet step by its grip, in either view
   ------------------------------------------------------------
   Pointer events, never HTML5 drag and drop (which has no touch
   support worth the name and paints its own ghost). One engine for
   both views of story.html's Beat Sheet:

     a GRIP (`.st-grip[data-step]` inside `li.st-card`) starts it, once
       the pointer has travelled 4px — a press without travel is a
       click, and the page opens the card;
     a DROP LIST is any `[data-drop-beat]` list (one per beat, in the
       lanes and on the spine); the Unassigned bin has none, because
       a step is filed there by choosing its beat;
     a fixed GHOST follows the pointer, a placeholder (`li.st-dnd-ph`)
       shows where the step will land, the lanes scroller, a beat's own
       list and the window scroll near their edges, Escape cancels;
     hovering a collapsed spine station for 500ms opens it (at once
       under reduced motion).

   It writes NOTHING. A drop hands (stepId, beatKey, index) to the
   page's onDrop, which saves through the same path as the buttons;
   `index` counts the beat's other steps, the dragged one left out
   (story.js moveStep). A cancel, or a redraw that takes the board
   away mid-drag, ends with no write at all.
   ============================================================ */

const THRESHOLD = 4;        // px of travel before a press becomes a drag
const EDGE = 48;            // px from an edge where auto-scroll starts
const OPEN_AFTER = 500;     // ms over a collapsed station before it opens

const reduced = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
      || getComputedStyle(document.documentElement).getPropertyValue('--motion').trim() === '0';
  } catch (e) { return false; }
};

export function wireBeatDrag({ root, locked = () => false, onDrop, onHoverCollapsed } = {}) {
  let d = null;              // the drag in progress
  let justDragged = 0;       // a click that ends a drag is not a click

  const cleanup = () => {
    if (!d) return;
    const x = d; d = null;
    cancelAnimationFrame(x.raf);
    clearTimeout(x.hoverT);
    if (x.ghost) x.ghost.remove();
    if (x.ph) x.ph.remove();
    if (x.card) x.card.classList.remove('is-dragging');
    document.documentElement.classList.remove('st-dnd-on');
    try { x.grip.releasePointerCapture(x.pid); } catch (e) { /* already released */ }
    window.removeEventListener('keydown', onKey, true);
  };

  const cardsIn = (list) => [...list.children].filter((c) => c.matches('li.st-card') && c !== d.card);

  function place(x, y) {
    d.ghost.style.left = (x - d.dx) + 'px';
    d.ghost.style.top = (y - d.dy) + 'px';
    const hit = document.elementFromPoint(x, y);
    const host = hit && hit.closest && hit.closest('[data-beat-card]');
    const list = (hit && hit.closest && hit.closest('[data-drop-beat]')) || (host && host.querySelector('[data-drop-beat]'));
    /* a collapsed spine station opens when the pointer waits over it */
    const key = host && host.getAttribute('data-beat-card');
    if (key !== d.hoverKey) {
      clearTimeout(d.hoverT);
      d.hoverKey = key;
      if (host && host.querySelector('.st-sp-more[aria-expanded="false"]') && onHoverCollapsed) {
        const go = () => { if (d && d.hoverKey === key) onHoverCollapsed(key); };
        if (reduced()) go(); else d.hoverT = setTimeout(go, OPEN_AFTER);
      }
    }
    if (!list || !root() || !root().contains(list)) return;
    const shown = cardsIn(list).filter((c) => !c.hidden);
    const before = shown.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (before) { if (d.ph.nextElementSibling !== before) list.insertBefore(d.ph, before); }
    else {
      const lastShown = shown[shown.length - 1];
      const after = lastShown ? lastShown.nextElementSibling : list.firstElementChild;
      if (d.ph.parentElement !== list || (d.ph.nextElementSibling !== after && d.ph !== after)) list.insertBefore(d.ph, after || null);
    }
  }

  /* Scroll whatever the pointer is near the edge of: the lanes
     scroller, the beat's own list, the window. */
  function tick() {
    if (!d) return;
    const { x, y } = d;
    const step = reduced() ? 24 : 12;
    const hit = document.elementFromPoint(x, y);
    const sc = hit && hit.closest && hit.closest('.st-bl-scroll');
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (x < r.left + EDGE) sc.scrollLeft -= step; else if (x > r.right - EDGE) sc.scrollLeft += step;
    }
    const list = hit && hit.closest && hit.closest('[data-drop-beat]');
    if (list && list.scrollHeight > list.clientHeight) {
      const r = list.getBoundingClientRect();
      if (y < r.top + EDGE / 2) list.scrollTop -= step; else if (y > r.bottom - EDGE / 2) list.scrollTop += step;
    }
    if (y < EDGE) window.scrollBy(0, -step); else if (y > innerHeight - EDGE) window.scrollBy(0, step);
    place(x, y);
    d.raf = requestAnimationFrame(tick);
  }

  function start() {
    const r = d.card.getBoundingClientRect();
    d.dx = d.x0 - r.left; d.dy = d.y0 - r.top;
    const ghost = d.card.cloneNode(true);
    ghost.classList.add('st-dnd-ghost');
    ghost.classList.remove('is-open');
    ghost.removeAttribute('data-step-row');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('tabindex');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.querySelectorAll('[for]').forEach((n) => n.removeAttribute('for'));
    ghost.querySelectorAll('[data-st], [data-st-field], [data-step]').forEach((n) => {
      n.removeAttribute('data-st'); n.removeAttribute('data-st-field'); n.removeAttribute('data-step');
    });
    ghost.querySelectorAll('textarea').forEach((t, i) => { t.value = d.card.querySelectorAll('textarea')[i].value; });
    ghost.style.width = r.width + 'px';
    document.body.append(ghost);
    const ph = document.createElement('li');
    ph.className = 'st-dnd-ph';
    ph.setAttribute('aria-hidden', 'true');
    ph.style.height = Math.min(r.height, 160) + 'px';
    d.card.parentElement.insertBefore(ph, d.card);
    d.card.classList.add('is-dragging');
    document.documentElement.classList.add('st-dnd-on');
    d.ghost = ghost; d.ph = ph; d.on = true;
    window.addEventListener('keydown', onKey, true);
    place(d.x, d.y);
    d.raf = requestAnimationFrame(tick);
  }

  function onKey(e) {
    if (e.key !== 'Escape' || !d) return;
    e.preventDefault(); e.stopPropagation();
    const card = d.card;
    justDragged = Date.now();
    cleanup();
    if (card && card.isConnected) card.focus({ preventScroll: true });
  }

  document.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest && e.target.closest('.st-grip[data-step]');
    if (!grip || d || e.button > 0 || locked()) return;
    const card = grip.closest('li.st-card');
    if (!card || !root() || !root().contains(card)) return;
    d = { grip, card, id: grip.getAttribute('data-step'), pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false };
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  });
  document.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.pid) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.on) {
      if (Math.hypot(d.x - d.x0, d.y - d.y0) < THRESHOLD) return;
      start();
    }
    e.preventDefault();
  });
  const end = (e, commit) => {
    if (!d || e.pointerId !== d.pid) return;
    if (!d.on) { cleanup(); return; }
    justDragged = Date.now();
    const ph = d.ph, id = d.id;
    const list = ph && ph.isConnected ? ph.parentElement : null;
    const beat = list && list.getAttribute('data-drop-beat');
    const index = list ? [...list.children].filter((c) => c.matches('li.st-card') && c !== d.card).indexOf(ph.nextElementSibling) : -1;
    const n = list ? cardsIn(list).length : 0;
    const ok = commit && beat && d.card.isConnected;
    cleanup();
    if (ok) onDrop(id, beat, index < 0 ? n : index);
  };
  document.addEventListener('pointerup', (e) => end(e, true));
  document.addEventListener('pointercancel', (e) => end(e, false));
  /* the click a drag ends with is swallowed, so it never opens the card */
  document.addEventListener('click', (e) => {
    if (justDragged && Date.now() - justDragged < 400 && e.target.closest && e.target.closest('.st-grip')) {
      e.stopPropagation(); e.preventDefault();
    }
  }, true);

  return {
    justDragged: () => !!justDragged && Date.now() - justDragged < 400,
    active: () => !!(d && d.on),
    cancel: () => cleanup()
  };
}

export default { wireBeatDrag };
