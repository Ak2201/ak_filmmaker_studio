/* KIT · TOAST — the studio's toast, restyled (kit.css), not rebuilt
   toast(message, { type, duration, action, onAction })
     type  'info' | 'success' | 'error' (an error goes to the
           role="alert" host)
   This is a thin pointer at StudioUI.toast in chrome.js, which owns the
   behaviour: hover / focus pauses the countdown, an actionable toast
   never times out. Read lazily so the kit stays import-free of
   chrome.js (and its page-wide side effects). */
export function toast(message, opts) {
  const ui = typeof window !== 'undefined' ? window.StudioUI : null;
  if (ui && ui.toast) return ui.toast(message, opts);
  return null;
}
export const toastSuccess = (m, o) => toast(m, Object.assign({ type: 'success' }, o || {}));
export const toastError = (m, o) => toast(m, Object.assign({ type: 'error' }, o || {}));
export const toastInfo = (m, o) => toast(m, Object.assign({ type: 'info' }, o || {}));
