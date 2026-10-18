/* ============================================================
   RETURN TO THE PAGE THEY ASKED FOR
   ------------------------------------------------------------
   A visitor who opens plan.html signed out is sent to start.html by the
   site gate, signs in with Google, and used to land on the hub with no
   memory of where they were going. sitegate.js writes the page here when
   it turns somebody away; the hub (and invite.html's "you're in") spend
   it ONCE, after they are through.

   sessionStorage only: it is about THIS tab's errand, it must not
   outlive the tab, and it is in no backup and no ALL_KEYS. NEVER put it
   in a redirect_to — the Supabase allow-list owns that URL, and a value
   that varies per visitor is exactly what an allow-list cannot hold.

   WHAT IS ACCEPTED is deliberately narrow: a bare page file in this
   directory, optionally with a #fragment. No scheme, no '//', no
   backslash, no query, no path separator. The shape check is
   synchronous (so a link can be drawn); resolveReturnTo() additionally
   checks the file against navigation.json's pages, loaded lazily so
   none of it is in any page's first paint. No imports: this file is
   read by CORE and by invite.js.
   ============================================================ */
export const RETURN_KEY = 'fms_return_to';
const MAX_AGE_MS = 30 * 60 * 1000;
/* Pages that are the door itself or have their own gatekeeper: sending
   somebody "back" to one of them is a loop or a non sequitur. */
const NEVER = /^(invite|start|screening|privacy|terms|refund|index|pricing|product-[\w-]+)\.html(#.*)?$|^arunak-/;
const SHAPE = /^[a-z][a-z0-9-]*\.html(#[A-Za-z0-9_-]{1,64})?$/;

/** Returns the normalised target or '' when it is not an acceptable one. */
export function cleanReturn(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim().replace(/^\//, '');          // '/plan.html#x' (a pathname) -> 'plan.html#x'
  if (!s || s.length > 120) return '';
  if (/[\\:]|\/\//.test(s) || s.includes('/') || s.includes('?')) return '';
  if (!SHAPE.test(s) || NEVER.test(s)) return '';
  return s;
}

/** Remember where a refused visitor was going. `from` is
 *  location.pathname + location.hash. A cleanUrls path has no .html
 *  ('/plan'), so one is added before the shape check. */
export function rememberReturn(from) {
  try {
    let s = String(from || '').replace(/^\//, '');
    const i = s.indexOf('#');
    let page = i < 0 ? s : s.slice(0, i);
    const hash = i < 0 ? '' : s.slice(i);
    if (page && !/\.html$/.test(page)) page += '.html';
    const to = cleanReturn(page + hash);
    if (!to) return false;
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ to, at: Date.now() }));
    return true;
  } catch (e) { return false; }
}

function read() {
  try {
    const v = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
    if (!v || typeof v.at !== 'number' || Date.now() - v.at > MAX_AGE_MS) return '';
    return cleanReturn(v.to);
  } catch (e) { return ''; }
}

export function clearReturn() { try { sessionStorage.removeItem(RETURN_KEY); } catch (e) { /* ignore */ } }

/** The stored target if it is acceptable (shape only, not consumed). */
export function peekReturn() { return read(); }

let navPages = null;
async function knownPages() {
  if (navPages) return navPages;
  const { default: nav } = await import('../data/navigation.json');
  const out = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n.href === 'string') out.add(n.href.split('#')[0]);
    Object.values(n).forEach(walk);
  };
  walk(nav);
  navPages = out;
  return out;
}

/** Validated against the site's own pages. Does not consume. */
export async function resolveReturn() {
  const to = read();
  if (!to) return '';
  try {
    const pages = await knownPages();
    return pages.has(to.split('#')[0]) ? to : '';
  } catch (e) { return ''; }
}

/** Spend it: resolves the target and removes it, once. */
export async function takeReturn() {
  const to = await resolveReturn();
  clearReturn();
  return to;
}

export default { RETURN_KEY, cleanReturn, rememberReturn, peekReturn, resolveReturn, takeReturn, clearReturn };
