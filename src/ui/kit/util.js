/* ============================================================
   KIT — shared helpers for the builders in this folder
   ------------------------------------------------------------
   Every builder here is PURE: it returns DOM built with h() from
   src/lib/dom.js, writes no storage, binds no global listener and
   carries no inline handler. Interaction goes through data-action
   attributes and the page's own delegate(), exactly like the rest of
   the app (CLAUDE.md rule 5). Children may be null / undefined /
   false — they are skipped, never printed as "null".
   ============================================================ */
import { h } from '../../lib/dom.js';

/** The icon mark: a Material Symbols ligature, aria-hidden. The name
    must be listed in src/data/section-icons.json `icons` (the font is a
    subset built from that list) or it prints as a word. */
export function sym(name, cls = 'k-sym') {
  if (!name) return null;
  return h('span.' + cls + '.sym', { text: name, 'aria-hidden': 'true', translate: 'no' });
}

/** Class list from parts, skipping falsy ones. */
export function cx(...parts) {
  return parts.flat().filter(Boolean).join(' ');
}

/** Append children, skipping null / undefined / false (the
    Element.append(null) trap: the native method prints "null"). */
export function kids(el, children) {
  for (const c of [].concat(children == null ? [] : children)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Copy caller attributes (data-*, aria-*, id …) onto an element. A
    `dataset` object is merged; functions are refused (no handlers). */
export function attrs(el, extra) {
  if (!extra) return el;
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') throw new Error('kit: no handler props — use data-action and delegate()');
    if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'class') el.className = cx(el.className, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  return el;
}

export { h };
