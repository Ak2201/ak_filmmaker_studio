/* ============================================================
   ADMIN TAB — Testimonials (testimonials, #testimonials)
   ------------------------------------------------------------
   What members have offered to say about the studio (schema §59), each
   with the exact consent sentence they agreed to and when. The queue
   reads admin_list_testimonials() (any administrator); APPROVE and
   REJECT call admin_set_testimonial_status(), which the database lets
   only the OWNER role do and writes to the audit log. A testimonial its
   author took back is listed under "Taken back" and has no buttons: the
   database refuses to publish it again.

   Approving lists it in public_testimonials(); the PUBLIC SITE does not
   read that — it draws from src/data/testimonials.json, edited by hand
   (its _about says how): COPY FOR THE SITE puts the entry, with its
   consent id and date, on the clipboard in that file's shape. The tab
   never writes the file. That is why a revoke cannot take a testimonial
   off the site by itself: one that was published and then taken back is
   listed under "Remove from site" and counted on the Overview's "Needs
   attention" (attention() below) until the owner has deleted it from
   testimonials.json and pressed TAKEN OFF THE SITE.

   A database without §59 says so in one line.
   ============================================================ */
import { h } from '../../lib/dom.js';
import { emptyState, errorState, skeleton, pill, absTime } from '../../ui/admin-kit.js';
import T, { preview, statusWord, siteEntry } from '../../lib/testimonials.js';
import { ask } from '../../ui/dialog.js';
import '../../styles/testimonial-prompt.css';

const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'takedown', label: 'Remove from site' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Not published' },
  { id: 'revoked', label: 'Taken back' },
  { id: 'all', label: 'All' }
];
const S = { filter: 'pending', phase: 'idle', rows: [], error: '', missing: false, busy: '', pending: null, takedown: null, takedownPhase: 'idle', ctx: null };
let queued = false;
const again = () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; if (S.ctx && S.ctx.rerender) S.ctx.rerender(); }, 0);
};
const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

async function load() {
  S.phase = 'loading'; S.error = '';
  again();
  try {
    S.rows = await T.admin.list(S.ctx && S.ctx.cloud, S.filter === 'all' ? null : S.filter);
    if (S.filter === 'pending') S.pending = S.rows.length;
    if (S.filter === 'takedown') S.takedown = S.rows.length;
    S.phase = 'ok'; S.missing = false;
  } catch (e) {
    S.phase = 'error';
    S.missing = T.isMissing(e);
    S.error = S.missing ? 'The database has no admin_list_testimonials() yet — schema section 59 has not been run on it.'
      : (e && e.code === '42501') ? 'The database refused: this account is not an administrator.'
        : (e && e.message) || 'The server did not say why.';
  }
  again();
}

async function decide(id, status) {
  const r = S.rows.find((x) => x.id === id);
  if (!r) return;
  if (status === 'approved') {
    const ok = await ask({ title: 'Publish this testimonial?', body: `It becomes readable by anybody through the public list, under the name “${r.display_name}”. The author can still take it back at any time: it then leaves the public list at once, and any copy you put on the site has to be removed by hand (it will be listed under Remove from site).`, confirm: 'Publish' });
    if (!ok) return;
  }
  S.busy = id; again();
  try {
    await T.admin.setStatus(S.ctx && S.ctx.cloud, id, status);
    toast(status === 'approved' ? 'Approved.' : status === 'rejected' ? 'Marked not published.' : 'Back in the queue.', 'success');
    await load();
  } catch (e) {
    toast((e && e.code === '42501') ? 'Only the owner can publish or reject a testimonial.' : (e && e.message) || 'Not saved.', 'error');
  } finally { S.busy = ''; again(); }
}

function card(r) {
  const p = preview(r);
  const revoked = !!r.revoked_at;
  const tone = revoked ? 'neutral' : r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'neutral' : 'warn';
  const busy = S.busy === r.id;
  const btn = (label, act, cls = '') => h('button.btn' + cls, { type: 'button', 'data-tm-act': act, 'data-tm-id': r.id, disabled: busy ? '' : null, text: label });
  const acts = [];
  if (T.needsTakedown(r)) acts.push(btn('Taken off the site', 'removed', '.primary'));
  if (!revoked) {
    if (r.status !== 'approved') acts.push(btn('Approve', 'approved', '.primary'));
    if (r.status !== 'rejected') acts.push(btn('Reject', 'rejected'));
    if (r.status === 'approved') acts.push(btn('Copy for the site', 'copy'));
  }
  return h('li.ad-card', { 'data-testimonial': r.id }, [
    h('div.us-bar', {}, [pill(statusWord(r), tone), h('span.ad-meta', { text: (r.author_deleted ? 'account deleted' : r.author_email || 'unknown author') + ' · sent ' + absTime(r.created_at) })]),
    h('blockquote', { text: '“' + p.quote + '”' }),
    h('p.ad-meta', { text: p.byline ? '— ' + p.byline : '' }),
    h('details', {}, [h('summary', { text: 'Consent' }), h('p.ad-meta', { text: `Agreed ${absTime(r.consented_at)}: “${r.consent_text}”` + (revoked ? (r.author_deleted ? ` Account deleted (taken back) ${absTime(r.revoked_at)}.` : ` Taken back ${absTime(r.revoked_at)}.`) : '') + ((r.first_approved_at || r.approved_at) ? ` First approved ${absTime(r.first_approved_at || r.approved_at)}.` : '') + (r.approved_at && r.first_approved_at && r.approved_at !== r.first_approved_at ? ` Approved again ${absTime(r.approved_at)}.` : '') + (r.site_removed_at ? ` Marked off the site ${absTime(r.site_removed_at)}.` : '') })]),
    acts.length ? h('div.ba-actions', {}, acts) : null
  ].filter(Boolean));
}

export function render(ctx) {
  S.ctx = ctx;
  if (S.phase === 'idle') load();
  const box = h('div.tm-admin');
  box.append(h('p.ad-meta', { text: 'Members offer these from inside the studio after real use, with the consent sentence shown here. Nothing is public until it is approved; only the owner can approve.' }));
  box.append(h('div.us-bar', { role: 'group', 'aria-label': 'Show' }, FILTERS.map((f) => h('button.ad-chip', { type: 'button', 'data-tm-filter': f.id, 'aria-pressed': String(S.filter === f.id), text: f.label }))));
  if (S.phase === 'error') { box.append(errorState({ title: 'Testimonials could not load', why: S.error, onRetry: S.missing ? null : () => load() })); return wire(box); }
  if (S.phase !== 'ok') { box.append(skeleton({ count: 3 })); return wire(box); }
  if (!S.rows.length) { box.append(emptyState({ title: 'Nothing here', body: S.filter === 'pending' ? 'No testimonial is waiting for review.' : 'No testimonial in this list.' })); return wire(box); }
  box.append(h('ul.tm-list', {}, S.rows.map(card)));
  return wire(box);
}

function wire(box) {
  box.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-tm-filter]');
    if (f) { S.filter = f.getAttribute('data-tm-filter'); load(); return; }
    const b = e.target.closest('[data-tm-act]');
    if (!b) return;
    const id = b.getAttribute('data-tm-id');
    const act = b.getAttribute('data-tm-act');
    if (act === 'copy') {
      const r = S.rows.find((x) => x.id === id);
      try { await navigator.clipboard.writeText(JSON.stringify(siteEntry(r), null, 2)); toast('Copied. Paste it into src/data/testimonials.json and run npm run test:testimonials.', 'success'); }
      catch (x) { toast('The clipboard is not available here.', 'error'); }
      return;
    }
    if (act === 'removed') { markRemoved(id); return; }
    decide(id, act);
  });
  return box;
}

async function markRemoved(id) {
  const ok = await ask({ title: 'Is it off the site?', body: 'Press this once the entry is deleted from src/data/testimonials.json and the site has been rebuilt and deployed. It only records that you did it.', confirm: 'It is off the site' });
  if (!ok) return;
  S.busy = id; again();
  try {
    await T.admin.markRemoved(S.ctx && S.ctx.cloud, id);
    toast('Recorded as off the site.', 'success');
    S.takedownPhase = 'idle';
    await load();
  } catch (e) {
    toast((e && e.code === '42501') ? 'Only the owner can record this.' : (e && e.message) || 'Not saved.', 'error');
  } finally { S.busy = ''; again(); }
}

/* ---- the Overview's "Needs attention" -------------------------------
   Asked once per console load (and again after a mark), whichever tab is
   open: a revoke is the author withdrawing consent, and the site keeps
   showing their words until the owner acts, so it must not wait for
   somebody to open this tab. Silent when §59 is missing or the read
   fails: no item, never a made-up zero. */
async function loadTakedown(ctx) {
  S.takedownPhase = 'loading';
  try { S.takedown = (await T.admin.list(ctx && ctx.cloud, 'takedown')).length; S.takedownPhase = 'ok'; }
  catch (e) { S.takedownPhase = 'error'; }
  if (ctx && ctx.rerender) ctx.rerender();
}
/** Items for the Overview's "Needs attention" list, in admin-model's shape. */
export function attention(ctx) {
  if (S.takedownPhase === 'idle') loadTakedown(ctx);
  const k = Number(S.takedown) || 0;
  if (S.takedownPhase !== 'ok' || !k) return [];
  return [{ label: k, tone: 'danger', text: `${k === 1 ? 'testimonial was' : 'testimonials were'} taken back by the author and may still be on the site`, tab: 'testimonials' }];
}

/** The sub-nav count: testimonials waiting, once known. */
export function badge() { return S.pending; }
