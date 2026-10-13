/* ============================================================
   THE SITE BANNER — one notice above every page, when an owner sets one
   ------------------------------------------------------------
   Schema §45: site_announcement_now() answers the single live row
   ({id, text, level, starts_at, ends_at}) or null. This module asks it
   at most once per browser session, and draws ONE bar only when a row
   exists. With none, NOTHING is in the DOM — which is what keeps
   `npm run verify` honest: the banner is text in a row, it is not in
   baseline.json, and the table is empty when verify runs.

   THE RULES IT KEEPS
   - It never changes by itself. One message, shown until it is dismissed
     or its end time passes (checked once, on load). The brand plate does
     not rotate and neither does this: visible text that changes on its
     own is a clock in the one element on every page.
   - ONE request, no SDK. It POSTs the RPC with the public anon key
     (RLS and the function itself are the boundary, exactly like the
     start page's counters), so a signed-out first load still fetches no
     supabase-* chunk. It waits for the page to be idle after `load`.
   - NO WRITES WHILE IDLE. The session cache goes to sessionStorage in a
     `pagehide` handler, not when the answer arrives, because verify's
     zero-idle-writes check wraps Storage.prototype.setItem and a write
     from an idle fetch would be counted. Dismissal writes on the click.
     Nothing is ever written to localStorage.
   - Every storage call is in try/catch; with storage blocked it simply
     asks again on the next page.
   - Plain text only (textContent), role="status" on the live bar, a
     real <button> to dismiss. Tokens only; below 720px it wraps and the
     close button stays a 44px target. Hidden in print.

   KNOWN EDGE: the bar is static, at the very top of <body>, so it
   scrolls away rather than pinning. A banner cached this session is
   mounted at module evaluation (no shift); only the first look shifts
   content down by its height, once, when it arrives; the sticky band measures itself as usual.
   ============================================================ */
import '../styles/site-banner.css';

const CACHE_KEY = 'fms_banner_v1';        // { at, row|null } for this browser session
const SEEN_KEY = 'fms_banner_seen_v1';    // the id of a banner dismissed this session

let pending = null;      // an answer not yet written to the cache (written on pagehide)
let mounted = null;      // the live bar, if any
let started = false;
let inflight = null;

const ss = (fn) => { try { return fn(window.sessionStorage); } catch (e) { return undefined; } };

/** The bar as a node. `preview` draws the same thing without a role or a working
 *  dismiss, for the console. */
export function bannerBar(row, { preview = false } = {}) {
  const warn = row && row.level === 'warn';
  const bar = document.createElement('div');
  bar.className = 'sb-bar ' + (warn ? 'sb-warn' : 'sb-info') + (preview ? ' is-preview' : '');
  if (!preview) { bar.setAttribute('role', 'status'); bar.dataset.bannerId = row.id || ''; }
  const kind = document.createElement('strong');
  kind.className = 'sb-kind';
  kind.textContent = warn ? 'Heads up' : 'Notice';
  const msg = document.createElement('span');
  msg.className = 'sb-text';
  msg.textContent = String((row && row.text) || '');
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'sb-x';
  x.setAttribute('aria-label', 'Dismiss this announcement');
  x.textContent = '×';
  if (preview) { x.disabled = true; x.tabIndex = -1; }
  else x.addEventListener('click', () => dismiss(row));
  bar.append(kind, msg, x);
  return bar;
}

function dismiss(row) {
  ss((s) => s.setItem(SEEN_KEY, String(row.id)));
  unmount();
}
function unmount() {
  if (mounted) { mounted.remove(); mounted = null; }
}

function live(row) {
  if (!row || !row.text) return false;
  const now = Date.now();
  if (row.starts_at && Date.parse(row.starts_at) > now) return false;
  if (row.ends_at && Date.parse(row.ends_at) <= now) return false;
  return true;
}

function mount(row) {
  unmount();
  if (!live(row)) return;
  if (ss((s) => s.getItem(SEEN_KEY)) === String(row.id)) return;
  const bar = bannerBar(row);
  const body = document.body;
  if (!body) return;
  /* After a skip link, before everything else. */
  const first = [...body.children].find((el) => !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName) && !/skip/.test(el.className || ''));
  body.insertBefore(bar, first || null);
  mounted = bar;
}

function readCache() {
  const raw = ss((s) => s.getItem(CACHE_KEY));
  if (!raw) return undefined;
  try { const c = JSON.parse(raw); return c && typeof c === 'object' && 'row' in c ? c : undefined; } catch (e) { return undefined; }
}

async function fetchRow() {
  const cloud = window.StudioCloud;
  const cfg = cloud && cloud.getCfg && cloud.getCfg();
  if (!cfg || !cfg.url || !cfg.key) return undefined;     // no project: no banner, no request
  const res = await fetch(String(cfg.url).replace(/\/+$/, '') + '/rest/v1/rpc/site_announcement_now', {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
    credentials: 'omit'
  });
  if (!res.ok) return undefined;                           // §45 not run, or a network fault: say nothing
  const data = await res.json();
  return data && typeof data === 'object' && data.text ? data : null;
}

function run({ force = false } = {}) {
  if (!force) {
    const c = readCache();
    if (c) { if (!mounted) mount(c.row); return Promise.resolve(); }
  }
  if (inflight) return inflight;
  inflight = fetchRow().then((row) => {
    if (row === undefined) return;
    pending = { at: Date.now(), row };
    mount(row);
  }).catch(() => { /* no banner is the safe answer */ }).finally(() => { inflight = null; });
  return inflight;
}

/** For the console, after an owner sets or clears the banner: forget the cache
 *  and look again, now. */
export function refreshBanner() {
  pending = null;
  ss((s) => s.removeItem(CACHE_KEY));
  ss((s) => s.removeItem(SEEN_KEY));
  return run({ force: true }).then(() => { if (pending) ss((s) => s.setItem(CACHE_KEY, JSON.stringify(pending))); });
}

function start() {
  if (started || typeof document === 'undefined') return;
  started = true;
  /* A banner already known this session is drawn NOW, before first paint,
     so the page never lands and then drops by the bar's height. Only a
     first look in a session has to wait for the network and idle time. */
  const known = readCache();
  if (known && known.row && document.body) mount(known.row);
  window.addEventListener('pagehide', () => {
    if (pending) ss((s) => s.setItem(CACHE_KEY, JSON.stringify(pending)));
  });
  const go = () => {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    idle(() => { run(); }, { timeout: 4000 });
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

start();

export default { bannerBar, refreshBanner };
