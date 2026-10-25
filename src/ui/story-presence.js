/* ============================================================
   STORY PRESENCE — "also here" on the shared beat sheet
   ------------------------------------------------------------
   Who else has this project's Story page open, and the step each is
   on ("Also here: Cal Collab (editing step 3)"), with their step's row
   marked. The same channel and pure model as the screenplay's strip
   (cloud.js joinPresence, a private channel schema §48 guards;
   src/lib/presence.js), told apart by `page: 'story'` on what this
   page sends.

   Nothing shows, and nothing is joined, unless this person is signed
   in, sync is on, and the co-editing switch (§49) answers ON: that is
   when two people's beat sheets merge, so that is when knowing who
   else is in it matters. Signed out (every verify run) it is inert.
   It writes no storage; what it sends — a name, a step id, typing or
   not — lives in the Realtime server's memory while the page is open.
   Never the words.

   The page redraws all of `main` on most edits, so `draw()` is called
   after each render (story.js after()) and re-creates its line there.
   ============================================================ */
import { h } from '../lib/dom.js';
import { currentProjectId, subscribe } from '../lib/store.js';
import { displayNameOf, presencePeople, noteSeen, storyPresenceLine } from '../lib/presence.js';

const SEND_EVERY_MS = 2000;
const REDRAW_EVERY_MS = 10000;
const STEP_FIELD = 'textarea[data-st-field="step-text"]';

const cloud = () => (typeof window !== 'undefined' ? window.StudioCloud : null);

/**
 * o = {
 *   host   () => the element the line goes in (the page header)
 *   stepN  (stepId) => that step's number on this page, or 0
 *   rowOf  (stepId) => the step's row, or null
 * }
 */
export function mountStoryPresence(o) {
  let link = null, joining = false;
  let raw = {}, selfKey = '', prevAt = {}, lastSeen = {};
  let marked = [];
  const me = { name: '', page: 'story', step: '', editing: false, at: 0 };
  let sendTimer = 0, lastSent = 0;

  function draw() {
    const people = presencePeople(raw, selfKey, lastSeen, Date.now(), 'story');
    const host = o.host();
    let line = document.getElementById('stPeers');
    if (!line && host && people.length) {
      line = h('p#stPeers.st-peers', { role: 'status' });
      host.append(line);
    }
    if (line) {
      const t = storyPresenceLine(people, o.stepN);
      line.hidden = !t;
      if (line.textContent !== t) line.textContent = t;
    }
    /* The name goes on the step number too: the mark is its ::after,
       and attr() reads the pseudo-element's own element, not the row. */
    const num = (row) => row.querySelector('.st-ol-n');
    for (const row of marked) {
      row.classList.remove('st-peer-row'); delete row.dataset.peer;
      const n = num(row); if (n) delete n.dataset.peer;
    }
    marked = [];
    const byStep = new Map();
    for (const p of people) if (p.step) byStep.set(p.step, (byStep.get(p.step) || []).concat(p.name));
    for (const [id, names] of byStep) {
      const row = o.rowOf(id);
      if (!row) continue;
      row.classList.add('st-peer-row');
      row.dataset.peer = names.join(', ');
      const n = num(row); if (n) n.dataset.peer = row.dataset.peer;
      marked.push(row);
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
  function sendSoon() {
    if (sendTimer || !link) return;
    sendTimer = setTimeout(send, Math.max(0, SEND_EVERY_MS - (Date.now() - lastSent)));
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
    let on = false;
    try { on = !!(c.coEditingEnabled && await c.coEditingEnabled()); } catch (e) { on = false; }
    if (on) {
      me.name = displayNameOf(sess.user);
      try { link = await c.joinPresence(pid, onSync); } catch (e) { link = null; }
    }
    joining = false;
    if (link) send();
  }
  function leave() {
    if (link) { link.leave(); link = null; }
    raw = {}; draw();
  }

  /* Which step this writer is on, and whether they are typing in it. */
  document.addEventListener('focusin', (e) => {
    const ta = e.target && e.target.matches && e.target.matches(STEP_FIELD) ? e.target : null;
    const id = ta ? ta.getAttribute('data-step') || '' : '';
    if (id === me.step) return;
    me.step = id;
    if (!id) me.editing = false;
    sendSoon();
  });
  document.addEventListener('input', (e) => {
    if (!e.target || !e.target.matches || !e.target.matches(STEP_FIELD)) return;
    me.step = e.target.getAttribute('data-step') || me.step;
    me.editing = true;
    me.at = Date.now();
    sendSoon();
  }, { capture: true });

  setInterval(() => {
    if (me.editing && Date.now() - me.at > 30000) { me.editing = false; sendSoon(); }
    if (Object.keys(raw).length) draw();
  }, REDRAW_EVERY_MS);

  const c = cloud();
  if (c && c.isBooted && c.isBooted()) join();
  subscribe('cloud:booted', () => join());
  subscribe('cloud:synced', () => join());   // the switch is learnt during the first attach
  try { if (c && c.onAuth) c.onAuth((ev) => { if (ev === 'SIGNED_OUT') leave(); else join(); }); } catch (e) { /* no cloud */ }
  addEventListener('pagehide', leave);

  return { draw, leave };
}

export default { mountStoryPresence };
