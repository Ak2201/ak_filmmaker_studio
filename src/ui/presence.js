/* ============================================================
   PRESENCE — the screenplay's "also here" strip
   ------------------------------------------------------------
   Who else has this script open (avatars in the top bar), which line
   each is on (a mark at the line's right edge, with their name), where
   in that line their caret is (a thin named caret, drawn by measuring
   the text in a hidden mirror of the line's textarea), and a
   warning while one of them is typing — because the script syncs last
   write wins, two people typing at once replace each other's saves.
   The model is src/lib/presence.js; the channel is cloud.js
   joinPresence(), a private Realtime channel schema §48 guards.

   Nothing shows until there is someone else to show: signed out, sync
   off, no project, §48 not yet run, or simply alone — the strip stays
   hidden, the page is exactly as before. It writes no storage; what it
   sends (name, the line id, typing or not) lives in the Realtime
   server's memory for as long as the page is open.

   It reaches cloud.js through window.StudioCloud, the way comments.js
   does, so the page does not import the SDK's module graph.
   ============================================================ */
import { h } from '../lib/dom.js';
import { currentProjectId, subscribe } from '../lib/store.js';
import { displayNameOf, initials, presencePeople, noteSeen, editingWarning } from '../lib/presence.js';

const SEND_EVERY_MS = 2000;     // at most one presence message per two seconds
const REDRAW_EVERY_MS = 10000;  // so "is typing" expires without a message

const cloud = () => (typeof window !== 'undefined' ? window.StudioCloud : null);

/**
 * o = {
 *   strip   () => the element the avatars go in (in #scTop)
 *   warn    () => the element the warning goes in
 *   rowOf   (elId) => the line's row element, or null
 * }
 */
/* Where character `pos` of a textarea sits, relative to the row that
   holds it: a hidden div given the textarea's own box and text styles
   lays the text out the same way, and a marker span at `pos` is
   measured. Null when the textarea is not laid out (another tab). */
const MIRROR_PROPS = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize',
  'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'tabSize', 'wordSpacing', 'textAlign'];
let mirror = null;
export function caretPoint(ta, pos) {
  if (!ta || !ta.offsetParent || !ta.getClientRects().length) return null;
  const cs = getComputedStyle(ta);
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.className = 'sc-peer-mirror';
    document.body.append(mirror);
  }
  for (const k of MIRROR_PROPS) mirror.style[k] = cs[k];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  const text = ta.value;
  const at = Math.max(0, Math.min(pos, text.length));
  mirror.textContent = text.slice(0, at);
  const mark = document.createElement('span');
  mark.textContent = text.slice(at, at + 1) || '\u200b';
  mirror.append(mark);
  const lineH = parseFloat(cs.lineHeight) || mark.offsetHeight || 16;
  const row = ta.closest('[data-el]');
  const t = ta.getBoundingClientRect(), r = row ? row.getBoundingClientRect() : t;
  return {
    left: Math.round(t.left - r.left + mark.offsetLeft - ta.scrollLeft),
    top: Math.round(t.top - r.top + mark.offsetTop - ta.scrollTop),
    height: Math.round(lineH)
  };
}

export function mountPresence(o) {
  let link = null, joining = false;
  let raw = {}, selfKey = '', prevAt = {}, lastSeen = {};
  let marked = [];
  let me = { name: '', elId: '', pos: null, editing: false, at: 0 };
  let carets = [];
  let sendTimer = 0, lastSent = 0;

  function draw() {
    const people = presencePeople(raw, selfKey, lastSeen, Date.now(), 'script');   // a Story tab on the same channel is not in the script
    const strip = o.strip();
    if (strip) {
      strip.hidden = !people.length;
      const shown = people.slice(0, 3);
      strip.replaceChildren(...shown.map((p) => h('span.sc-peer', {
        title: p.name + (p.editing ? ', writing now' : ''),
        'data-editing': p.editing ? 'true' : 'false'
      }, [initials(p.name)])));
      if (people.length > shown.length) strip.append(h('span.sc-peer.sc-peer-more', { text: '+' + (people.length - shown.length) }));
      strip.setAttribute('aria-label', people.length ? 'Also in this script: ' + people.map((p) => p.name).join(', ') : '');
    }
    for (const row of marked) { row.classList.remove('sc-peer-row'); delete row.dataset.peer; }
    marked = [];
    for (const c of carets) c.remove();
    carets = [];
    for (const p of people) {
      if (!p.elId || p.pos == null) continue;
      const row = o.rowOf(p.elId);
      const ta = row && row.querySelector('.wr-text');
      const at = ta ? caretPoint(ta, p.pos) : null;
      if (!at) continue;
      const mark = h('span.sc-peer-caret', { 'aria-hidden': 'true', title: p.name, 'data-editing': p.editing ? 'true' : 'false' }, [
        h('span.sc-peer-caret-name', { text: p.name.split(/\s+/)[0] })
      ]);
      mark.style.left = at.left + 'px';
      mark.style.top = at.top + 'px';
      mark.style.height = at.height + 'px';
      row.append(mark);
      carets.push(mark);
    }
    const byLine = new Map();
    for (const p of people) if (p.elId) byLine.set(p.elId, (byLine.get(p.elId) || []).concat(p.name));
    for (const [elId, names] of byLine) {
      const row = o.rowOf(elId);
      if (!row) continue;
      row.classList.add('sc-peer-row');
      row.dataset.peer = names.join(', ');
      marked.push(row);
    }
    const warn = o.warn();
    if (warn) {
      const t = editingWarning(people);
      warn.hidden = !t;
      if (warn.textContent !== t) warn.textContent = t;
    }
  }

  function onSync(state, key) {
    raw = state || {};
    selfKey = key;
    ({ at: prevAt, seen: lastSeen } = noteSeen(raw, prevAt, lastSeen, Date.now()));
    draw();
  }

  function send() {
    clearTimeout(sendTimer);
    sendTimer = 0;
    if (!link) return;
    lastSent = Date.now();
    link.track({ ...me });
  }
  /* Throttled: the first change goes now, the rest at most every two
     seconds, and the last one is never lost. */
  function sendSoon() {
    if (sendTimer) return;
    const wait = Math.max(0, SEND_EVERY_MS - (Date.now() - lastSent));
    sendTimer = setTimeout(send, wait);
  }

  async function join() {
    if (link || joining) return;
    const c = cloud();
    const pid = currentProjectId();
    if (!c || !c.joinPresence || !pid) return;
    let sess = null;
    try { sess = c.getSession && c.getSession(); } catch (e) { sess = null; }
    if (!sess) return;
    joining = true;
    me.name = displayNameOf(sess.user);
    try { link = await c.joinPresence(pid, onSync); } catch (e) { link = null; }
    joining = false;
    if (link) send();
  }
  function leave() {
    if (link) { link.leave(); link = null; }
    raw = {}; draw();
  }

  /* What this writer is doing: the line the caret is in, where in it,
     and typing. */
  document.addEventListener('focusin', (e) => {
    const row = e.target && e.target.closest && e.target.closest('#wr-page [data-el]');
    if (!row || row.dataset.el === me.elId) return;
    me.elId = row.dataset.el;
    /* The offset belongs to the line it was measured in: a caret moving
       to another row's type menu or buttons says which line, and no
       position until the text box has one. */
    const ta = e.target.matches && e.target.matches('.wr-text') ? e.target : null;
    me.pos = ta && typeof ta.selectionStart === 'number' ? ta.selectionStart : null;
    sendSoon();
  });
  const notePos = () => {
    const ta = document.activeElement;
    if (!ta || !ta.matches || !ta.matches('#wr-page .wr-text') || typeof ta.selectionStart !== 'number') return;
    if (ta.selectionStart === me.pos) return;
    me.pos = ta.selectionStart;
    sendSoon();
  };
  document.addEventListener('selectionchange', notePos);
  document.addEventListener('keyup', notePos, { capture: true });
  /* A peer's caret is placed in pixels, so it is re-placed whenever
     this writer's own typing or the window can have moved the text
     under it — once a frame at most, and only while one is showing. */
  let redraw = 0;
  const redrawSoon = () => {
    if (redraw || !(carets.length || marked.length)) return;
    redraw = requestAnimationFrame(() => { redraw = 0; draw(); });
  };
  addEventListener('resize', redrawSoon);
  document.addEventListener('input', (e) => {
    if (!e.target || !e.target.matches || !e.target.matches('#wr-page .wr-text')) return;
    me.editing = true;
    me.at = Date.now();
    sendSoon();
    redrawSoon();
  }, { capture: true });

  setInterval(() => {
    if (me.editing && Date.now() - me.at > 30000) { me.editing = false; sendSoon(); }
    if (Object.keys(raw).length) draw();
  }, REDRAW_EVERY_MS);

  /* Join once the cloud has booted with a session, and on sign-in. */
  const c = cloud();
  if (c && c.isBooted && c.isBooted()) join();
  subscribe('cloud:booted', () => join());
  try { if (c && c.onAuth) c.onAuth((ev) => { if (ev === 'SIGNED_OUT') leave(); else join(); }); } catch (e) { /* no cloud */ }
  addEventListener('pagehide', leave);

  return { draw, leave, _state: () => ({ raw, selfKey, lastSeen }) };
}

export default { mountPresence };
