/* ============================================================
   THE SIDE PANEL — gatekeeper and pipeline (PRD 2.0 §3, FR-101,
   FR-201..203, FR-301, FR-401, FR-402)
   ------------------------------------------------------------
   The extension's front door, docked beside whatever tab the writer
   is in. It walks the PRD's flow and nothing else:

     1. is there a valid session in chrome.storage.session?  -> 5
     2. the gatekeeper: an invite code, or a screening pass
     3. Google, through chrome.identity
     4. the concurrency check — the takeover prompt if another device
        holds the session (cloud.js's runGate, shared with the website)
     5. the pipeline: five stages, Story and Screenplay with their three
        ways in (Sample / New / Import)

   The pages it opens are the app's own pages, packaged in the
   extension, opened in the same panel — so the Beat Matrix or a
   scene's elements stay docked while the writer types in Google Docs.

   FAILS CLOSED like the rest of the gate now (it failed open, and
   that let every Google account through — see src/lib/gate.js). With
   schema section 13 not yet run the panel says so and offers nothing
   it cannot honour. And there are two routes through, not one: a
   code, or signing in with Google and REQUESTING an invite, which the
   shared block in src/ui/invite-request.js draws here exactly as on
   invite.html.
   ============================================================ */
import '../lib/store.js';          /* FIRST — invariant 6. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/modules.css';
import '../styles/gate.css';
import '../styles/panel.css';
import '../lib/cloud.js';          /* sets window.StudioCloud; the gate lives there */

import StudioUI from '../ui/chrome.js';
import { h, delegate } from '../lib/dom.js';
import { BRAND } from '../lib/brand.js';
import Store from '../lib/store.js';
import { moduleGroups, hueClassOf } from '../lib/navmodel.js';
import { formatCode, normaliseCode } from '../lib/gate.js';
import { inExtension, onSessionLost, onClipQueued, CLIP_QUEUE_KEY } from '../lib/extension-bridge.js';
import { requestBlock, wireRequestUI } from '../ui/invite-request.js';
import Billing from '../lib/billing.js';

const app = document.getElementById('app');
const cloud = () => window.StudioCloud;

let ui = { busy: false, error: '', notice: '', deployed: null, ticketReady: false, stage: '' };
let queued = 0;

/* ---- pieces ---------------------------------------------------- */

const head = (eyebrow, title, deck) => h('header.pn-head', {}, [
  h('p.bd-eyebrow', { text: eyebrow }), h('h1.pn-title', { text: title }), deck ? h('p.pn-deck', { text: deck }) : null
].filter(Boolean));

function renderNotExtension() {
  return h('main#main.pn-main', {}, [head(BRAND.name, 'This is the extension panel.',
    'Open it from the ' + BRAND.name + ' button in Chrome’s toolbar. On the website, everything here is on the hub.'),
    h('a.btn', { href: '../index.html', text: 'GO TO THE HUB' })]);
}

function renderGatekeeper() {
  const main = h('main#main.pn-main');
  main.append(head('Step 1 of 3', 'Enter Invite / Screening Pass Code',
    BRAND.name + ' is invite-only. A screening pass opens one film read-only, without an account. No code? Sign in with Google and ask for an invite.'));
  const form = h('form.gt-code', { 'data-pn-form': 'code', autocomplete: 'off' });
  form.append(h('label.gt-label', { for: 'pnCode', text: 'Code' }));
  form.append(h('input#pnCode.gt-input', { type: 'text', autocapitalize: 'characters', spellcheck: 'false', maxlength: 40, placeholder: 'XXXX-XXXX-XXXX' }));
  form.append(h('button.btn.primary', { type: 'submit', disabled: ui.busy, text: ui.busy ? 'CHECKING…' : 'CONTINUE' }));
  main.append(form);
  if (ui.deployed === false) {
    main.append(h('p.gt-meta', { text: 'Invite codes are not switched on for this studio yet; an administrator has to enable them before anybody can be let in.' }));
  }
  /* The second route. Signing in first is the point: the request an
     administrator reads carries the account Google attested. */
  main.append(h('button.btn', { type: 'button', 'data-pn': 'google-request', disabled: ui.busy, text: 'NO CODE? SIGN IN TO REQUEST ONE' }));
  if (ui.error) main.append(h('p.gt-error', { role: 'alert', text: ui.error }));
  main.append(clipLine());
  return main;
}

function renderSignIn() {
  const main = h('main#main.pn-main');
  main.append(head('Step 2 of 3', 'Sign in with Google.',
    'Your code is held for ten minutes and spent only once Google has said who you are.'));
  main.append(h('button.btn.primary', { type: 'button', 'data-pn': 'google', disabled: ui.busy, text: ui.busy ? 'WAITING FOR GOOGLE…' : 'SIGN IN WITH GOOGLE' }));
  main.append(h('button.btn', { type: 'button', 'data-pn': 'back', text: 'USE A DIFFERENT CODE' }));
  if (ui.error) main.append(h('p.gt-error', { role: 'alert', text: ui.error }));
  return main;
}

function renderClosed() {
  const c = cloud();
  const g = c.getGateState();
  const pending = g.status && g.status.requestStatus === 'pending';
  const main = h('main#main.pn-main');
  main.append(head('Invite needed', pending ? 'Your request is in.' : 'Ask for an invite, or redeem a code.',
    `Signed in as ${c.getUserEmail() || 'your account'}, which is not a member yet.`));
  main.append(requestBlock(g.status, g.reason));
  if (g.status && g.status.deployed) {
    const form = h('form.gt-code', { 'data-pn-form': 'redeem', autocomplete: 'off' });
    form.append(h('label.gt-label', { for: 'pnCode', text: 'Or an invite code, if you were given one' }));
    form.append(h('input#pnCode.gt-input', { type: 'text', autocapitalize: 'characters', spellcheck: 'false', maxlength: 40, placeholder: 'XXXX-XXXX-XXXX' }));
    form.append(h('button.btn.primary', { type: 'submit', disabled: ui.busy, text: 'REDEEM' }));
    main.append(form);
  }
  if (ui.error) main.append(h('p.gt-error', { role: 'alert', text: ui.error }));
  main.append(h('button.btn', { type: 'button', 'data-pn': 'signout', text: 'SIGN OUT' }));
  return main;
}

function renderLost() {
  const main = h('main#main.pn-main');
  main.append(head('Session elsewhere', 'Active on another device.',
    'Your account is open in another Chrome window. Take the session back to continue here; the other window pauses.'));
  main.append(h('button.btn.primary', { type: 'button', 'data-pn': 'takeover', text: 'TAKE OVER SESSION' }));
  main.append(h('button.btn', { type: 'button', 'data-pn': 'signout', text: 'SIGN OUT' }));
  return main;
}

/* FR-401/402: five stages, no feed, no adverts. Story and Screenplay
   open onto their three ways in; the other three list their modules,
   all of which are live (the app kept every built module when the six
   phases became five). */
const MODES = {
  story: [
    ['Sample', 'The sample synopsis, ready to tag.', 'story.html?start=sample'],
    ['New', 'A blank synopsis and a beat framework.', 'story.html?start=new'],
    ['Import', '.docx, .pdf or .txt — or drag it onto the page.', 'story.html?start=import']
  ],
  screenplay: [
    ['Sample', 'Open the sample project, a whole feature filled in.', 'index.html#modules'],
    ['New', 'A blank screenplay.', 'write.html#screenplay'],
    ['Import', 'Fountain, Final Draft (.fdx), PDF or plain text.', 'write.html#screenplay']
  ]
};

/* The plan's say over the extension (schema section 16: limits.extension).
   A client-side gate, and labelled as one in the schema's header: the
   server cannot tell an extension's request from a page's, so what this
   buys is an honest panel, not an enforced one. Unknown (section 16 not
   run, or the status call failed) means allowed. */
let extAllowed = null;
async function checkPlan() {
  try {
    const st = await Billing.status();
    extAllowed = !st || !st.limits || st.limits.extension !== false;
  } catch (e) { extAllowed = true; }
  render();
}

function renderNoExtension() {
  const main = h('main#main.pn-main');
  main.append(head('Your plan', 'The extension is not in your plan.',
    'The Free tier covers the website and local work. Starter, Indie and Pro include the Chrome extension \u2014 the side panel, the web clipper and the device lock.'));
  main.append(h('a.btn.primary', { href: '../settings.html#plan', target: '_blank', rel: 'noopener', text: 'SEE PLANS' }));
  main.append(h('button.btn', { type: 'button', 'data-pn': 'recheck', text: 'I HAVE UPGRADED' }));
  main.append(h('button.btn', { type: 'button', 'data-pn': 'signout', text: 'SIGN OUT' }));
  return main;
}

function renderPipeline() {
  if (extAllowed === null) { checkPlan(); }
  if (extAllowed === false) return renderNoExtension();
  const main = h('main#main.pn-main');
  const p = Store.currentProject ? Store.currentProject() : null;
  main.append(head('Pipeline', p ? p.title : BRAND.name, p ? null : 'No project open — pick one on the hub, or start in Story.'));
  const list = h('ol.pn-stages');
  /* moduleGroups(), not nav.phases: the five stages AND the shelves
     (the Library's three tabs, the two Blueprints). Reading only the
     stages dropped whatever moved out of them (KNOWN-ISSUES #2).
     hueClassOf() picks the class family: .sh-ph-* for a stage, .hue-*
     for a shelf. */
  for (const phase of moduleGroups()) {
    const open = ui.stage === phase.id;
    const li = h('li.pn-stage.' + hueClassOf(phase) + (open ? '.is-open' : ''));
    li.append(h('button.pn-stage-btn', { type: 'button', 'data-pn': 'stage', 'data-stage': phase.id, 'aria-expanded': String(open) }, [
      h('span.pn-dot', { 'aria-hidden': 'true' }), h('strong', { text: phase.label }), h('span.pn-blurb', { text: phase.blurb })
    ]));
    if (open) {
      const body = h('div.pn-stage-body');
      if (MODES[phase.id]) {
        const modes = h('div.pn-modes');
        MODES[phase.id].forEach(([label, sub, href]) => modes.append(h('a.pn-mode', { href: '../' + href }, [h('strong', { text: label }), h('span', { text: sub })])));
        body.append(modes);
      }
      const mods = h('ul.pn-mods');
      phase.modules.forEach((m) => {
        if (m.status === 'planned') mods.append(h('li.pn-mod.is-planned', {}, [h('span', { text: m.label }), h('span.pn-soon', { text: 'in development' })]));
        else mods.append(h('li.pn-mod', {}, [h('a', { href: '../' + m.href, text: m.label }), h('span.pn-purpose', { text: m.purpose })]));
      });
      body.append(mods);
      li.append(body);
    }
    list.append(li);
  }
  main.append(list);
  main.append(clipLine());
  main.append(h('p.pn-foot', {}, [
    h('span', { text: cloud().getUserEmail() || '' }),
    h('button.btn', { type: 'button', 'data-pn': 'signout', text: 'SIGN OUT' })
  ]));
  return main;
}

function clipLine() {
  return h('p.pn-clips', { text: queued
    ? `${queued} clipping${queued === 1 ? '' : 's'} waiting for the Idea Vault — they arrive when you open a page.`
    : 'Select text on any page and choose “Send to ' + BRAND.name + '” to keep it in the Idea Vault.' });
}

/* ---- the flow ---------------------------------------------------- */

async function render() {
  if (!inExtension()) { app.replaceChildren(renderNotExtension()); return; }
  const c = cloud();
  try { queued = ((await chrome.storage.local.get(CLIP_QUEUE_KEY))[CLIP_QUEUE_KEY] || []).length; } catch (e) { queued = 0; }
  await c.ensureClient();
  let view;
  if (!c.getSession()) {
    view = ui.ticketReady ? renderSignIn() : renderGatekeeper();
  } else {
    const g = c.getGateState().state;
    view = g === 'closed' ? renderClosed() : g === 'lost' ? renderLost()
         : g === 'unknown' ? h('main#main.pn-main', {}, [head('One moment', 'Checking your invite\u2026', 'Asking the studio whether this account is through the gate and free to open here.')])
         : renderPipeline();
  }
  app.replaceChildren(view);
  try { StudioUI.autoAriaLabels(); } catch (e) { /* chrome not ready */ }
}

delegate(document, 'input', '#pnCode', (e, el) => { const f = formatCode(el.value); if (f !== el.value) el.value = f; });

delegate(document, 'submit', '[data-pn-form]', async (e, form) => {
  e.preventDefault();
  const c = cloud(), g = c.gate;
  const code = form.querySelector('#pnCode').value;
  if (!normaliseCode(code)) return;
  ui.busy = true; ui.error = ''; render();
  try {
    if (form.dataset.pnForm === 'redeem') {
      await g.redeemCode(code);
      await c.runGate();
    } else {
      const t = await g.verifyCode(code);
      ui.ticketReady = t.passType === 'standard';
    }
  } catch (err) {
    if (err.code === 'notdeployed') { ui.deployed = false; ui.error = ''; }
    else if (/screening pass/i.test(err.message || '')) {
      // A guest pass: the read-only room, in a tab of its own.
      chrome.tabs.create({ url: chrome.runtime.getURL('screening.html') + '?pass=' + encodeURIComponent(normaliseCode(code)) });
      ui.error = '';
    } else ui.error = err.message || 'That code could not be checked.';
  } finally {
    ui.busy = false; render();
  }
});

delegate(document, 'click', '[data-pn]', async (e, el) => {
  const c = cloud();
  const act = el.dataset.pn;
  if (act === 'google' || act === 'google-request') {
    // 'google-request' is the same sign-in from step 1 with no code:
    // SIGNED_IN runs the gate, which closes, and renderClosed() offers
    // the request. A separate name so "step 2 appeared" stays checkable.
    ui.busy = true; ui.error = ''; render();
    try { await c.signInWithGoogle(); }   // SIGNED_IN runs the gate; onAuth redraws
    catch (err) { ui.error = err.message || 'Google sign-in did not complete.'; }
    finally { ui.busy = false; render(); }
  } else if (act === 'back') {
    ui.ticketReady = false; render();
  } else if (act === 'takeover') {
    await c.takeBack(); render();
  } else if (act === 'signout') {
    await c.signOut(); ui.ticketReady = false; render();
  } else if (act === 'recheck') {
    extAllowed = null; render();
  } else if (act === 'stage') {
    ui.stage = ui.stage === el.dataset.stage ? '' : el.dataset.stage; render();
  }
});

if (window.StudioCloud) window.StudioCloud.onAuth(() => setTimeout(render, 0));
Store.subscribe('gate:changed', () => render());
wireRequestUI(render);
onSessionLost((reason) => {
  ui.ticketReady = false;
  ui.error = reason === 'conflict' ? 'Your account was opened on another device, so this panel signed out.'
    : reason === 'revoked' ? 'Your invite was revoked by an administrator.' : '';
  render();
});
onClipQueued(() => render());

render();
