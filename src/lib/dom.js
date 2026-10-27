/* ============================================================
   DOM HELPERS
   ------------------------------------------------------------
   Small enough to read in one sitting, which is the point. The
   legacy pages built markup with template literals and handed
   user text straight to innerHTML; three of the bugs we fixed
   came from that. Everything here forces a decision: `text` is
   escaped, `html` is not, and `html` only ever receives strings
   that came out of src/data (authored content), never anything
   a user typed.
   ============================================================ */

/** Escape text for safe interpolation into HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/**
 * Build an element.
 *   h('div.formula-box')
 *   h('span.tn', { html: block.tanglish })
 *   h('textarea', { 'data-key': 's1_whatif', placeholder: '…' })
 *
 * `text` is escaped by the platform (textContent). `html` is not —
 * pass it only authored content from src/data.
 */
export function h(spec, props = {}, children = []) {
  const [tagAndId, ...classes] = String(spec).split('.');
  const [tag, id] = tagAndId.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');

  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }

  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Parse an authored HTML string from src/data into nodes. */
export function fromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html ?? '').trim();
  return t.content;
}

/**
 * One delegated listener instead of an inline onclick.
 * The legacy pages carried ~60 inline handlers, which is why no
 * page could run under a strict Content-Security-Policy.
 *
 *   delegate(document, 'click', '[data-action="add-row"]', (e, el) => …)
 */
export function delegate(root, type, selector, handler, opts) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  }, opts);
}

/* ---- painting a page without tearing it down ------------------------
   Several pages rebuild `main` whenever auth, the gate, the plan or a
   fetch lands, and most of those arrive after first paint with nothing
   new to say. `app.replaceChildren(main)` each time throws the whole page
   away: a visible flicker, a scroll jump, a lost caret. commitMain skips
   the swap when what render() produced is byte-identical to the last
   paint, and otherwise keeps the scroll position and the focused id.
   The signature is taken BEFORE `mount` (tabs.js, shell chrome) adds its
   own attributes, so it compares render()'s output only. */
const lastPaint = new WeakMap();
const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]';
/** What a control IS, apart from where it sits: tag, role, name, data-*
    attributes, label and text. A redraw replaces the node, so the id
    that commitMain used to keep is not enough for the many buttons that
    have none (the console's actions, the settings radios). */
export function focusKey(el) {
  const data = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).sort().join('&');
  const label = el.getAttribute('aria-label') || '';
  const nm = el.getAttribute('name') || '';
  /* Text only names a control that has nothing else to be known by: a busy
     button changes its words ("Creating…") and must still be itself. */
  const text = data || label || nm ? '' : (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return [el.tagName, el.getAttribute('role') || '', nm, data, label, text].join('|');
}
/** Where the focused control sits among the controls that look identical. */
export function focusSpot(app, el) {
  if (!el || !app.contains(el) || el === app) return null;
  const key = focusKey(el);
  const same = [...app.querySelectorAll(FOCUSABLE)].filter((n) => focusKey(n) === key);
  const at = same.indexOf(el);
  return at < 0 ? null : { key, at };
}
/** True when focus was restored. A control that is disabled while busy
    cannot take it yet, so the caller keeps the spot for the next paint. */
export function restoreFocusSpot(app, spot) {
  if (!spot) return false;
  const same = [...app.querySelectorAll(FOCUSABLE)].filter((n) => focusKey(n) === spot.key);
  const f = same[spot.at];
  if (!f) return false;
  try { f.focus({ preventScroll: true }); } catch (e) { return false; }
  return document.activeElement === f;
}
const lostSpot = new WeakMap();
export function commitMain(app, main, mount) {
  const sig = main.innerHTML;
  if (lastPaint.get(app) === sig && app.firstElementChild) return false;
  lastPaint.set(app, sig);
  const y = window.scrollY;
  const fid = document.activeElement && document.activeElement.id;
  let spot = fid ? null : focusSpot(app, document.activeElement);
  const lost = lostSpot.get(app);
  const bare = !document.activeElement || document.activeElement === document.body;
  const fromLost = !spot && bare && lost && Date.now() - lost.at < 15000;
  if (fromLost) spot = lost.spot;   // focus fell while the control was busy
  app.replaceChildren(main);
  if (typeof mount === 'function') mount();
  if (window.scrollY !== y) window.scrollTo({ top: y, behavior: 'instant' });
  if (fid) { const f = document.getElementById(fid); if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* not focusable */ } }
  else if (spot) {
    if (restoreFocusSpot(app, spot)) lostSpot.delete(app);
    else if (!fromLost) lostSpot.set(app, { spot, at: Date.now() });   // a retry never extends its own 15s
  }
  if (window.scrollY !== y) window.scrollTo({ top: y, behavior: 'instant' });
  return true;
}

/** Collapse a burst of calls (auth, gate, plan and fetch events all land
    within a second of load) into one trailing call. */
export function coalesce(fn, ms = 60) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => { t = 0; fn(...a); }, ms); };
}

/** Collapse whitespace the way the extractors did, for comparisons. */
export function normalise(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Save `body` (a string or a Blob part) as a file called `name`: the
    anchor is attached for the click and the URL revoked 2s later. Moved
    here from story-io.js so pages that had an identical copy share it;
    copies with a different revoke timing or a detached anchor were left
    alone rather than changed in passing. */
export function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
