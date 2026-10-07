/* ============================================================
   SCREENING ROOM — a time-limited, read-only pass (PRD 2.0 FR-103)
   ------------------------------------------------------------
   For an investor, a festival programmer, a producer you are courting:
   no account, no sign-in, one project, for as long as the pass lasts.
   They see the beat sheet, the character map and the pitch deck, under
   a forensic watermark carrying the pass's access id, the e-mail they
   typed and the moment they opened it.

   WHAT THIS PAGE MUST NOT DO:
     - persist anything. Its Supabase client keeps no session
       (persistSession: false), and nothing here writes to storage —
       a guest's browser should hold no trace of somebody else's film.
       store.js is still imported first, per invariant 6, because the
       shared modules below read through it.
     - show the studio's navigation. A pass holder is not a user of
       the studio, so there is no shell, no rail and no palette here.
     - outlive the pass. At expiry the content is removed from the
       page, not just covered.

   The server decides everything that matters — validity, expiry,
   which scopes come back (story, blueprint, scenes; never contacts or
   money) — in screening_open(), schema section 13.6. This page only
   draws what it is given.
   ============================================================ */
import '../lib/store.js';          /* FIRST — invariant 6. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/modules.css';
import '../styles/screening.css';

import { h, delegate } from '../lib/dom.js';
import { createGate, formatCode, normaliseCode, errorSentence } from '../lib/gate.js';
import { matrix, frameworkById } from '../lib/story.js';
import { collectFrom, buildDeck } from '../lib/pitch-deck.js';
import { createWatermark } from '../lib/watermark.js';

const app = document.getElementById('app');

/* Theme: follow the OS, write nothing. The stylesheets key off
   :root[data-theme]; without it the bare :root (ink) applies. */
try {
  if (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch (e) { /* no matchMedia */ }

let client = null;
async function getClient() {
  if (client) return client;
  const env = import.meta.env || {};
  const url = String(env.VITE_SUPABASE_URL || '').trim();
  const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}
const Gate = createGate(getClient);

let state = { stage: 'enter', error: '', busy: false, pass: null };
let wm = null, expiryTimer = 0;
let typed = null;   // { code, email } as last submitted; null until the first submit

/* A pass in the URL (from the settings page's code box) is read once
   and stripped, so it does not sit in the address bar, the history or
   a screenshot of either. */
const params = new URLSearchParams(location.search);
const prefill = normaliseCode(params.get('pass') || '');
if (params.has('pass')) history.replaceState(null, '', location.pathname);

/* ---- entering a pass ----------------------------------------- */

function renderEnter() {
  const main = h('main#main.sc-main.sc-enter');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Screening room' }),
    h('h1.bd-title', { text: 'You have been sent a film.' }),
    h('p.bd-deck', { text: 'Enter the screening pass you were given. It opens one project, read-only, for a limited time — no account needed.' })
  ]));
  const form = h('form.sc-form', { 'data-sc-form': 'open', autocomplete: 'off' });
  form.append(h('label', { for: 'scCode', text: 'Screening pass' }));
  form.append(h('input#scCode.sc-code', { type: 'text', autocapitalize: 'characters', spellcheck: 'false', maxlength: 40,
    placeholder: 'XXXX-XXXX-XXXX', value: formatCode(typed ? typed.code : prefill) }));
  form.append(h('label', { for: 'scEmail', text: 'Your e-mail (optional)' }));
  form.append(h('input#scEmail.sc-email', { type: 'email', placeholder: 'you@example.com', maxlength: 255, value: typed ? typed.email : '' }));
  form.append(h('p.sc-note', { text: 'Whatever you open here is watermarked with this pass, the e-mail above and the time. The e-mail is not checked; it is printed on the page so the sender knows who is watching.' }));
  form.append(h('button.btn.primary', { type: 'submit', disabled: state.busy, text: state.busy ? 'OPENING…' : 'OPEN THE SCREENING' }));
  if (state.error) form.append(h('p.sc-error', { role: 'alert', text: state.error }));
  main.append(form);
  return main;
}

/* ---- the room ------------------------------------------------ */

const txt = (v) => String(v ?? '').trim();

function renderRoom(pass) {
  const scopes = pass.scopes || {};
  const bp = scopes.feature || {};
  const story = scopes.story || null;
  const scenes = (scopes.scenes && Array.isArray(scopes.scenes.scenes)) ? scopes.scenes.scenes : [];
  const d = collectFrom({ bp, story, scenes, title: pass.title });

  const main = h('main#main.sc-main.sc-room');
  const left = Date.parse(pass.expiresAt) - Date.now();
  main.append(h('header.sc-head', {}, [
    h('p.bd-eyebrow', { text: 'Screening room · read-only' }),
    h('h1.bd-title', { text: pass.title || 'Untitled film' }),
    d.logline ? h('p.bd-deck', { text: d.logline }) : null,
    h('p.sc-expiry', { id: 'scExpiry', text: expiryText(left) })
  ].filter(Boolean)));

  const blocks = [];
  const block = (id, title, children) => {
    const b = h('section.sc-block', { id, 'aria-labelledby': id + 'H' }, [h('h2.bd-h2', { id: id + 'H', text: title }), ...children]);
    blocks.push(b);
    return b;
  };

  // The beat sheet: the framework the writer was working in, every beat,
  // with the passage tagged to it.
  if (story && txt(story.source)) {
    const s = { marks: [], tension: {}, framework: 'three_act', ...story };
    const fw = frameworkById(s.framework);
    const ol = h('ol.sc-beats');
    for (const row of matrix(s)) {
      ol.append(h('li.sc-beat' + (row.marks.length ? '' : '.is-empty'), {}, [
        h('strong', { text: row.beat.label }),
        h('p', { text: row.marks.length ? row.marks.map((m) => m.text).join(' … ') : '—' })
      ]));
    }
    main.append(block('beats', `Beat sheet · ${fw.label}`, [h('p.sc-syn', { text: s.source }), ol]));
  }

  if (d.characters.length) {
    const grid = h('div.sc-chars');
    d.characters.forEach((c) => grid.append(h('div.sc-char', {}, [
      h('p.sc-role', { text: c.role }), h('h3', { text: c.name }), c.line ? h('p', { text: c.line }) : null
    ].filter(Boolean))));
    main.append(block('characters', 'Character map', [grid]));
  }

  // The pitch deck, on screen: the same slides the PDF prints.
  const deck = buildDeck(d);
  deck.classList.add('sc-deck');
  main.append(block('deck', 'Pitch deck', [deck]));

  if (!blocks.length) main.append(h('p.sc-note', { text: 'This project has nothing shared in it yet.' }));
  return { main, blocks };
}

function expiryText(ms) {
  if (ms <= 0) return 'This pass has expired.';
  const m = Math.round(ms / 60000);
  if (m < 60) return `This pass closes in ${m} minute${m === 1 ? '' : 's'}.`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `This pass closes in ${hrs} hour${hrs === 1 ? '' : 's'}.`;
  return `This pass closes in ${Math.round(hrs / 24)} days.`;
}

function closeRoom(message) {
  if (wm) { wm.destroy(); wm = null; }
  clearInterval(expiryTimer);
  state = { stage: 'enter', error: message, busy: false, pass: null };
  render();
}

/* ---- render ---------------------------------------------------- */

function render() {
  if (state.stage === 'room' && state.pass) {
    const { main, blocks } = renderRoom(state.pass);
    app.replaceChildren(main);
    document.body.classList.add('sc-in-room');
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink-faint').trim() || 'currentColor';
    const p = state.pass;
    wm = createWatermark({
      lines: [`SCREENING PASS · ACCESS ${p.accessId}`, p.viewerEmail || 'viewer not named',
              new Date(p.openedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
      ink, protect: blocks,
      onTamper: () => closeRoom('The screening was closed because its watermark was removed. Open the pass again to continue.')
    }).mount();
    expiryTimer = setInterval(() => {
      const left = Date.parse(p.expiresAt) - Date.now();
      const el = document.getElementById('scExpiry');
      if (el) el.textContent = expiryText(left);
      if (left <= 0) closeRoom('This screening pass has expired. Ask the sender for a new one.');
    }, 30000);
    return;
  }
  document.body.classList.remove('sc-in-room');
  app.replaceChildren(renderEnter());
}

delegate(document, 'submit', '[data-sc-form="open"]', async (e) => {
  e.preventDefault();
  const code = document.getElementById('scCode').value;
  const email = document.getElementById('scEmail').value.trim();
  // What was typed survives every redraw, the error one included: the
  // form is rebuilt from scratch, and it used to come back empty after
  // a failed open (UX audit M16).
  typed = { code, email };
  if (!normaliseCode(code)) {
    state.error = 'Enter the screening pass you were given — the code in the message from the sender.';
    render();
    const f = document.getElementById('scCode'); if (f) f.focus();
    return;
  }
  state.busy = true; state.error = ''; render();
  try {
    const pass = await Gate.openScreening(code, email);
    state = { stage: 'room', error: '', busy: false, pass: { ...pass, viewerEmail: email, openedAt: Date.now() } };
  } catch (err) {
    state.busy = false;
    state.error = err.code === 'nocloud'
      ? 'This copy of the studio is not connected to a cloud project, so it cannot open passes.'
      : errorSentence(err, 'That screening pass could not be opened.');
  }
  render();
});
delegate(document, 'input', '#scCode', (e, el) => {
  const f = formatCode(el.value);
  if (f !== el.value) el.value = f;
});
// A pass is for watching: no context menu over the protected content.
document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.sc-room')) e.preventDefault(); });

render();
