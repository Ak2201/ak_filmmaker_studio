/* ============================================================
   THE STATUS BAR — a thin line of REAL facts at the foot of every
   shell page (Obsidian Cinema design, 13 Oct 2026)
   ------------------------------------------------------------
   Left:  the app's version (a BUILD constant, from package.json through
          vite `define`; nothing is fetched) and where the work is
          safe: the sync state, and Drive's own last-synced time while
          Drive is connected.
   Right: how much browser storage this studio uses
          (navigator.storage.estimate(), absent = absent), and — for an
          ADMIN only — whether payments run on a Razorpay TEST or LIVE
          key, read off the public key id's prefix.

   NOTHING HERE IS INVENTED. The design's sample bar said "14.2 GB of
   50 GB", "IndexedDB" and "Gateway: Operational"; none of those is a
   thing this app can know, so none of them is printed. A value that
   cannot be read is left out, not guessed: no key, no payment line; no
   estimate(), no storage line; signed out, "Local only".

   Cheap by construction. The sync state arrives on the existing
   `cloud:status` bus event and the admin line on `gate:changed`; the
   storage figure and Drive's age are re-read every minute while the tab
   is visible. A node is only touched when its text changed, and NOTHING
   is written to storage — the idle-write assertion in verify holds.

   It is a body child (after #app, which pages re-render), fixed to the
   foot of the window, to the right of the app rail on a desk and above
   the phone's bottom bar (--mab-h). Its measured height is published
   as --ssb-h and the body reserves it, so no page content ends up under
   it. Hidden in print. CORE, imported by shell.js.
   ============================================================ */
import Store from '../lib/store.js';
import { RAZORPAY_KEY_ID } from '../lib/billing.js';
import { BRAND } from '../lib/brand.js';
import '../styles/status-bar.css';

/* Same contract as topbar-backup.js: drive-sync.js owns this key and
   importing it would drag the Drive client into every page, so the read
   is src/lib/hub-activity.js's driveSyncedAt(), on a copy of the key. */
import { driveSyncedAt } from '../lib/hub-activity.js';
const VERSION = String(import.meta.env.VITE_APP_VERSION || '');

/** 'test' | 'live' | '' — from the PUBLIC key id; the secret never ships. */
export function paymentMode(key = RAZORPAY_KEY_ID) {
  if (/^rzp_test_/.test(key)) return 'test';
  if (/^rzp_live_/.test(key)) return 'live';
  return '';
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return Math.round(n) + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}

export function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const hr = Math.round(m / 60);
  if (hr < 24) return hr + ' h ago';
  return Math.round(hr / 24) + ' d ago';
}

/** The sync wording, from getSyncStatus(). Returns {text, tone}. */
export function syncLine(st) {
  if (!st) return { text: 'Local only', tone: 'off' };
  const q = Number(st.pending) || 0;
  const waiting = q + (q === 1 ? ' change waiting' : ' changes waiting');
  switch (st.state) {
    case 'syncing': return { text: 'Syncing…', tone: 'busy' };
    case 'synced':
    case 'idle':    return q ? { text: waiting, tone: 'warn' } : { text: 'Synced', tone: 'ok' };
    case 'offline': return { text: q ? waiting + ' (offline)' : 'Offline', tone: 'warn' };
    case 'error':   return { text: q ? waiting : 'Not synced', tone: 'err' };
    default:        return { text: 'Local only', tone: 'off' };
  }
}

function driveLine() {
  const t = driveSyncedAt();
  return Number.isFinite(t) ? 'Drive ' + ago(t) : '';
}

const cloud = () => (typeof window !== 'undefined' && window.StudioCloud) || null;
function isAdminNow() {
  try { const c = cloud(); return !!(c && c.getGateState && c.getGateState().role === 'admin'); }
  catch (e) { return false; }
}

const set = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
const flip = (el, hide) => { if (el && el.hidden !== hide) el.hidden = hide; };

export function mountStatusBar() {
  if (typeof document === 'undefined' || document.getElementById('studioStatus')) return null;
  const mk = (cls, hidden) => { const s = document.createElement('span'); s.className = cls; if (hidden) s.hidden = true; return s; };
  const bar = document.createElement('div');
  bar.id = 'studioStatus';
  bar.className = 'ssb';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Studio status');

  const left = mk('ssb-zone');
  const ver = mk('ssb-ver');
  const sync = mk('ssb-sync');
  const led = mk('ssb-led'); led.setAttribute('aria-hidden', 'true');
  const syncText = mk('ssb-sync-text');
  sync.append(led, syncText);
  const drive = mk('ssb-drive', true);
  left.append(ver, sync, drive);

  const right = mk('ssb-zone ssb-right');
  const pay = mk('ssb-pay', true);
  const payLed = mk('ssb-led'); payLed.setAttribute('aria-hidden', 'true');
  const payText = mk('ssb-pay-text');
  pay.append(payLed, payText);
  const store = mk('ssb-store', true);
  /* "Storage 6.5 MB / 994 MB": the word is a label and drops on a phone,
     the figures are the fact. */
  const storeK = mk('ssb-k'); storeK.textContent = 'Storage';
  const storeV = mk('ssb-v');
  store.append(storeK, storeV);
  /* The storage figure is a measurement of THIS browser (and the Drive
     age a clock): verify's word-set oracle must not hold it, or every
     run fails on a different number. See [data-verify-varies] in
     scripts/verify-migration.mjs. */
  store.setAttribute('data-verify-varies', '');
  drive.setAttribute('data-verify-varies', '');
  right.append(pay, store);
  bar.append(left, right);

  const verName = mk('ssb-ver-name'); verName.textContent = BRAND.name;
  ver.append(verName);
  if (VERSION) { const v = mk('ssb-ver-num'); v.textContent = 'v' + VERSION; ver.append(v); }

  let tone = '';
  const paintSync = (st) => {
    const l = syncLine(st);
    set(syncText, l.text);
    if (tone !== l.tone) { tone = l.tone; led.dataset.tone = l.tone; }
  };
  const paintDrive = () => { const t = driveLine(); set(drive, t); flip(drive, !t); };
  const paintPay = () => {
    const mode = isAdminNow() ? paymentMode() : '';
    flip(pay, !mode);
    if (mode) { set(payText, 'Razorpay ' + mode.toUpperCase()); payLed.dataset.tone = mode === 'live' ? 'ok' : 'warn'; }
  };
  const paintStore = () => {
    const s = typeof navigator !== 'undefined' && navigator.storage;
    if (!s || typeof s.estimate !== 'function') return;
    s.estimate().then((e) => {
      const used = formatBytes(e && e.usage);
      if (!used) return;
      const quota = e.quota ? formatBytes(e.quota) : '';
      set(storeV, used + (quota ? ' / ' + quota : ''));
      const t = 'Browser storage this studio uses: ' + used + (quota ? ' of ' + quota + ' this browser allows' : '');
      if (store.title !== t) store.title = t;
      flip(store, false);
    }).catch(() => {});
  };

  const refresh = () => {
    const c = cloud();
    paintSync(c && c.getSyncStatus ? c.getSyncStatus() : null);
    paintDrive(); paintPay(); paintStore();
  };
  refresh();

  Store.subscribe('cloud:status', paintSync);
  Store.subscribe('gate:changed', paintPay);
  /* StudioCloud arrives after the first paint on some pages; the shell
     polls for it the same way, and stops. */
  const hook = setInterval(() => {
    const c = cloud();
    if (!c) return;
    clearInterval(hook);
    if (c.onAuth) c.onAuth(() => setTimeout(refresh, 0));
    refresh();
  }, 50);
  setTimeout(() => clearInterval(hook), 20000);
  setInterval(() => { if (!document.hidden) { paintDrive(); paintStore(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { paintDrive(); paintStore(); } });

  document.body.append(bar);
  document.body.classList.add('has-status-bar');
  /* Measured, not assumed: the bar wraps to two lines on a narrow phone
     and the body's padding has to follow. The property is written on
     <html>, outside the observed element, so there is no loop. */
  const publish = () => {
    const px = Math.ceil(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--ssb-h', px + 'px');
  };
  publish();
  if (typeof ResizeObserver === 'function') new ResizeObserver(publish).observe(bar);
  else window.addEventListener('resize', publish);
  return bar;
}

export default { mountStatusBar };
