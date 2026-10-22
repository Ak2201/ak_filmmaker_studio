/* ============================================================
   THE SYNC WORDING — what is left of the status bar
   ------------------------------------------------------------
   This file built a 32px foot bar (version, sync state, Drive age,
   storage estimate, the admin's Razorpay mode) on every shell page.
   The bar was RETIRED on 19 Oct 2026 (CLAUDE.md row 41) and nothing
   mounted it, so mountStatusBar() and its helpers were deleted on
   21 Oct 2026; the commit history has them if a foot bar is ever
   wanted back.

   What stays are the two pure helpers other surfaces still read:
   syncLine() — the band's sync pill (shell.js buildSyncPill) and
   Settings say the sync state in the SAME words — and ago(). The
   stylesheet stays imported because it styles that pill (.sh-sync).
   Nothing is written to storage. CORE, imported by shell.js.
   ============================================================ */
import '../styles/status-bar.css';

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
    /* A refusal (cloud.js refusalSentence) names its cause in the detail;
       the short line says only that it is kept here, and the pill's
       title carries the whole sentence. */
    case 'error':   return /^Not synced/.test(st.detail || '')
      ? { text: 'Not synced' + (q ? ' \u00b7 ' + q + ' kept here' : ''), tone: 'err', detail: st.detail }
      : { text: q ? waiting : 'Not synced', tone: 'err', detail: st.detail };
    default:        return { text: 'Local only', tone: 'off' };
  }
}
