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

/** Collapse whitespace the way the extractors did, for comparisons. */
export function normalise(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}
