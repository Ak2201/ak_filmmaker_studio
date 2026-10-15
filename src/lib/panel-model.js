/* ============================================================
   PANEL MODEL — what the extension's side panel knows, without it
   ------------------------------------------------------------
   The logic half of src/pages/panel.js: the clippings waiting in the
   extension's own storage, the connection the gate needs, whether the
   plan includes the extension, and the panel's fixed "ways in" table.
   No DOM; the panel draws.
   ============================================================ */
import { cloudClient } from './cloud-api.js';
import { CLIP_QUEUE_KEY } from './extension-bridge.js';
import Billing from './billing.js';
import matrix from '../data/plan-matrix.json';

/** How many clippings are queued for the Idea Vault (0 when the
 *  extension's storage cannot be read). */
export async function queuedClipCount() {
  try {
    return ((await chrome.storage.local.get(CLIP_QUEUE_KEY))[CLIP_QUEUE_KEY] || []).length;
  } catch (e) { return 0; }
}

/** Build the cloud client (restoring a session) before the gate is read. */
export const connect = () => cloudClient();

/* The plan's say over the extension (schema section 16: limits.extension).
   A client-side gate, and labelled as one in the schema's header: the
   server cannot tell an extension's request from a page's, so what this
   buys is an honest panel, not an enforced one. Unknown (section 16 not
   run, or the status call failed) means allowed. */
export async function extensionAllowed() {
  try {
    const st = await Billing.status();
    return !st || !st.limits || st.limits.extension !== false;
  } catch (e) { return true; }
}

/* Which plans include it: the `extension` row of src/data/plan-matrix.json. */
export const EXT_PLANS = ((matrix.features.find((f) => f.key === 'extension') || {}).plans || []).filter((id) => id !== 'free');

/** "Basic, Intermediate and Pro include the Chrome extension …" */
export function extensionPlansSentence(plans = EXT_PLANS) {
  return 'Your plan covers the website and local work. ' + plans.map(Billing.planName).join(', ').replace(/, ([^,]*)$/, ' and $1') + (plans.length > 1 ? ' include' : ' includes') + ' the Chrome extension — the side panel, the web clipper and the device lock.';
}

/** The line about queued clippings, or the hint when there are none. */
export function clipSentence(queued, brandName) {
  return queued
    ? `${queued} clipping${queued === 1 ? '' : 's'} waiting for the Idea Vault — they arrive when you open a page.`
    : 'Select text on any page and choose “Send to ' + brandName + '” to keep it in the Idea Vault.';
}

/** The sentence when the panel signed itself out. */
export function sessionLostSentence(reason) {
  return reason === 'conflict' ? 'Your account was opened on another device, so this panel signed out.'
    : reason === 'revoked' ? 'Your invite was revoked by an administrator.' : '';
}

/* FR-401/402: Story and Screenplay open onto their three ways in. */
export const MODES = {
  story: [
    ['Sample', 'The sample synopsis, ready to tag.', 'story.html?start=sample'],
    ['New', 'A blank synopsis and a beat framework.', 'story.html?start=new'],
    ['Import', '.docx, .pdf or .txt — or drag it onto the page.', 'story.html?start=import']
  ],
  screenplay: [
    ['Sample', 'Open the sample project, a whole feature filled in.', 'index.html?sample=1'],
    ['New', 'A blank screenplay.', 'screenplay.html'],
    ['Import', 'Fountain, Final Draft (.fdx), PDF or plain text.', 'screenplay.html#import']
  ]
};

export default { queuedClipCount, connect, extensionAllowed, EXT_PLANS, extensionPlansSentence, clipSentence, sessionLostSentence, MODES };
