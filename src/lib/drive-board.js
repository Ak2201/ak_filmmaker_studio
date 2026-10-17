/* ============================================================
   DRIVE BOARD — the live half of the storyboard-frames gate
   ------------------------------------------------------------
   boardGate() (board-frames.js) decides from four facts; this reads
   them now: the build reaches Drive, a Google sign-in is on this
   page, Drive is connected on this device, a token is held. And the
   one action that changes them, reconnectDrive(), which only a click
   may call (it can open Google's window).

   Logic, not view: the AI Desk's board task asks it without any
   screen, and src/ui/drive-image.js draws the pictures and the
   Reconnect button on top of it (it listens with onDriveReconnect).
   ============================================================ */
import Drive from './drive.js';
import { isConnected } from './drive-sync.js';
import { boardGate } from './board-frames.js';

/** The four facts, read now. */
export function boardFacts() {
  const c = typeof window !== 'undefined' ? window.StudioCloud : null;
  let signedIn = false;
  try { signedIn = !!(c && c.getSession && c.getSession()); } catch (e) { signedIn = false; }
  return {
    configured: Drive.isConfigured(),
    signedIn,
    connected: isConnected(),
    token: Drive.hasToken()
  };
}
export const currentBoardGate = () => boardGate(boardFacts());

const listeners = new Set();
/** Called after a reconnect, so a page can redraw what depended on it. */
export function onDriveReconnect(cb) { listeners.add(cb); return () => listeners.delete(cb); }

/** Ask Google for a token (a click only), then tell every listener. */
export async function reconnectDrive() {
  await Drive.getToken({ interactive: true });
  listeners.forEach((cb) => { try { cb(); } catch (e) { /* a listener is not the reconnect */ } });
}

export default { boardFacts, currentBoardGate, reconnectDrive, onDriveReconnect };
