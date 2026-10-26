/* ============================================================
   TESTIMONIAL PROMPT — asking a real member, once, with consent
   ------------------------------------------------------------
   Two mounts, both drawn only inside the studio (never on a public page,
   which imports neither):

     maybePromptTestimonial(host)  a small dismissible card, appended to
                                   `host`, when src/lib/testimonials.js
                                   askDecision() says yes. It opens a form
                                   with the exact consent sentence, a
                                   required tick, and a preview of how it
                                   would read on the site. Resolves to the
                                   card, or null when nothing was drawn.
     mountMyTestimonials(host)     Settings: the member's own submissions,
                                   each with its state and TAKE IT BACK.
                                   Draws nothing at all where §59 is not on
                                   the database or nobody is signed in.

   The signals are this browser's own data, read through the models:
   distinct days across the projects' created/updated stamps, the current
   project's activity log and its script drafts; the current project's
   script pages and scenes. The sample is not the member's work and never
   counts. The prompt's memory is `testimonialAsk` inside the existing
   device prefs blob (chrome-prefs.js), written on a click only.

   THE REVOKE ROUTE MUST EXIST BEFORE THE ASK DOES. The consent sentence
   promises "take it back at any time in Settings", so the card is never
   drawn unless Settings mounts mountMyTestimonials(). settings.js belongs
   to another lane, so this file cannot see that at run time: the flag
   SETTINGS_ROUTE_WIRED below says it, and test:testimonial-prompt fails
   whenever the flag and settings.js disagree. Whoever adds the Settings
   call flips the flag in the same commit.

   No inline handlers: listeners are attached to the nodes this file
   builds. Nothing here talks to the backend except through
   src/lib/testimonials.js (test:layers V2).
   ============================================================ */
import { h } from '../lib/dom.js';
import { button, field, fieldInput, check, notice } from './kit/index.js';
import { ask } from './dialog.js';
import Store from '../lib/store.js';
import { listScenes } from '../lib/scenes.js';
import { loadScript, pageCount } from '../lib/script.js';
import { activityEntries } from '../lib/hub-activity.js';
import { isSampleProject } from '../lib/samples.js';
import { readDevicePrefs, updateDevicePrefs } from '../lib/chrome-prefs.js';
import { entitlement } from '../lib/plan-gate.js';
import T, { askDecision, consentText, distinctDays, validate, preview, statusWord, LIMITS } from '../lib/testimonials.js';
import '../styles/testimonial-prompt.css';

/** True only once src/pages/settings.js calls mountMyTestimonials() (see
 *  the header). While false, maybePromptTestimonial() draws nothing. */
export const SETTINGS_ROUTE_WIRED = false;

const cloud = () => window.StudioCloud || null;
const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };
const readAsk = () => { const v = readDevicePrefs().testimonialAsk; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const saveAsk = (patch) => updateDevicePrefs({ testimonialAsk: { ...readAsk(), ...patch } });

/** This browser's real-use signals for the open project. */
export function useSignals() {
  const stamps = [];
  let sample = false, pages = 0, scenes = 0;
  try {
    for (const p of Store.listProjects() || []) {
      if (isSampleProject(p)) continue;
      stamps.push(p.createdAt, p.updatedAt);
    }
    const cur = Store.currentProject ? Store.currentProject() : null;
    sample = !cur || isSampleProject(cur);
    if (!sample) {
      for (const e of activityEntries()) stamps.push(e && e.ts);
      const script = loadScript();
      for (const r of script.revisions || []) stamps.push(r && r.date);
      pages = pageCount(script.elements || []);
      scenes = listScenes().length;
    }
  } catch (e) { sample = true; }
  return { days: distinctDays(stamps), pages, scenes, sample };
}

function trialNow() {
  try {
    const e = entitlement();
    return e && e.reason === 'trial' ? { active: true, endsAt: e.endsAt, minutes: e.trialMinutes } : null;
  } catch (e) { return null; }
}

/** Draw the card into `host` if, and only if, the rules say so. */
export async function maybePromptTestimonial(host, { routeWired = SETTINGS_ROUTE_WIRED } = {}) {
  if (!routeWired || !host || host.querySelector('.tp-card')) return null;
  const c = cloud();
  const signedIn = !!(c && c.getSession && c.getSession());
  const base = { signedIn, trial: trialNow(), state: readAsk(), ...useSignals() };
  /* Every local rule first: the network is asked only when the answer
     could be yes. */
  if (!askDecision({ ...base, available: true }).ask) return null;
  if (!(await T.available(c)) || host.querySelector('.tp-card')) return null;
  const card = buildCard();
  host.append(card);
  return card;
}

function buildCard() {
  const card = h('aside.tp-card', { 'aria-labelledby': 'tpTitle' });
  const head = h('div.tp-head', {}, [
    h('h2.tp-title', { id: 'tpTitle', text: 'Would you say a few words about the studio?' }),
    button({ label: 'Close', icon: 'close', iconOnly: true, variant: 'ghost', size: 'sm', attrs: { 'data-tp': 'later' } })
  ]);
  const lead = h('p.tp-lead', { text: 'You have been working here for a while. If it has helped, a sentence or two in your own words would help other filmmakers decide. Nothing is shown until the studio reviews it, and you can take it back at any time in Settings.' });
  const acts = h('div.tp-actions', {}, [
    button({ label: 'Write a few words', variant: 'primary', attrs: { 'data-tp': 'open' } }),
    button({ label: 'Not now', variant: 'ghost', attrs: { 'data-tp': 'later' } }),
    button({ label: 'Don’t ask again', variant: 'ghost', attrs: { 'data-tp': 'never' } })
  ]);
  card.append(head, lead, acts);
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tp]');
    if (!b || !card.contains(b)) return;
    const what = b.getAttribute('data-tp');
    if (what === 'later') { saveAsk({ dismissedAt: new Date().toISOString() }); card.remove(); }
    else if (what === 'never') { saveAsk({ never: true }); card.remove(); }
    else if (what === 'open') { lead.remove(); acts.replaceWith(buildForm(card)); }
  });
  return card;
}

function buildForm(card) {
  const form = h('form.tp-form', { novalidate: '' });
  const fQuote = field({ kind: 'textarea', label: 'In your own words', meta: `${LIMITS.quoteMin}–${LIMITS.quoteMax}`, name: 'quote', rows: 4, attrs: { maxlength: String(LIMITS.quoteMax), required: '' } });
  const fName = field({ label: 'Name to show', name: 'display_name', attrs: { maxlength: String(LIMITS.nameMax), required: '', autocomplete: 'name' } });
  const fRole = field({ label: 'Role (optional)', name: 'role', placeholder: 'Writer-director, Chennai', attrs: { maxlength: String(LIMITS.roleMax) } });
  const fFilm = field({ label: 'Film (optional)', name: 'film', attrs: { maxlength: String(LIMITS.filmMax) } });
  try { const u = cloud() && cloud().getUser && cloud().getUser(); const nm = u && u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name); if (nm) fieldInput(fName).value = String(nm).slice(0, LIMITS.nameMax); } catch (e) { /* no name */ }

  const pvQuote = h('p.tp-pv-quote');
  const pvBy = h('p.tp-pv-by');
  const pv = h('figure.tp-preview', { 'aria-live': 'polite' }, [h('figcaption.tp-pv-label', { text: 'How it would appear on the site' }), h('blockquote', {}, [pvQuote]), pvBy]);
  const consent = h('p.tp-consent', { text: consentText() });
  const tick = check({ label: 'I agree to the sentence above.', attrs: { name: 'consent', required: '' } });
  const err = h('p.tp-error', { role: 'alert' });
  const send = button({ label: 'Send for review', variant: 'primary', type: 'submit' });
  const cancel = button({ label: 'Not now', variant: 'ghost', attrs: { 'data-tp': 'later' } });

  const value = () => ({ quote: fieldInput(fQuote).value, display_name: fieldInput(fName).value, role: fieldInput(fRole).value, film: fieldInput(fFilm).value });
  const draw = () => {
    const p = preview(value());
    pvQuote.textContent = p.quote ? '“' + p.quote + '”' : 'Your words will appear here.';
    pvBy.textContent = p.byline ? '— ' + p.byline : '';
  };
  form.addEventListener('input', draw);
  draw();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const v = validate(value());
    for (const [f, k] of [[fQuote, 'quote'], [fName, 'display_name'], [fRole, 'role'], [fFilm, 'film']]) {
      const inp = fieldInput(f);
      if (v.errors[k]) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
    }
    if (!v.ok) { err.textContent = Object.values(v.errors)[0]; return; }
    if (!tick.querySelector('input').checked) { err.textContent = 'Tick the box to agree, or press Not now.'; return; }
    send.disabled = true;
    try {
      await T.submit(cloud(), v.value);
      saveAsk({ sentAt: new Date().toISOString() });
      card.replaceChildren(notice({ tone: 'ok', title: 'Thank you.', body: 'It is with the studio for review. You can see it, or take it back, in Settings under Your testimonials.', live: true }));
      setTimeout(() => { if (card.isConnected) card.remove(); }, 12000);
    } catch (x) {
      err.textContent = (x && x.message) || 'It did not send. Try again in a moment.';
      send.disabled = false;
    }
  });
  form.append(fQuote, fName, h('div.tp-row', {}, [fRole, fFilm]), pv, consent, tick, err, h('div.tp-actions', {}, [send, cancel]));
  return form;
}

/* ---- Settings: your own ------------------------------------------- */

/** Draw the member's own testimonials into `host`. Resolves to the
 *  number listed, or null when there is nothing to draw (no §59, not
 *  signed in) — `host` is then left empty. */
export async function mountMyTestimonials(host) {
  if (!host) return null;
  const c = cloud();
  if (!(c && c.getSession && c.getSession())) { host.replaceChildren(); return null; }
  if (!(await T.available(c))) { host.replaceChildren(); return null; }
  let rows = [];
  try { rows = await T.mine(c); }
  catch (e) { host.replaceChildren(notice({ tone: 'warn', body: 'Your testimonials could not load just now.' })); return null; }
  const draw = () => {
    const list = h('ul.tp-mine');
    for (const r of rows) {
      const p = preview(r);
      list.append(h('li.tp-mine-row', { 'data-testimonial-id': r.id }, [
        h('blockquote.tp-mine-q', { text: '“' + p.quote + '”' }),
        h('p.tp-mine-by', { text: p.byline ? '— ' + p.byline : '' }),
        h('p.tp-mine-st', { text: statusWord(r) + (r.consented_at ? ' · agreed ' + new Date(r.consented_at).toLocaleDateString() : '') }),
        r.revoked_at ? null : button({ label: 'Take it back', variant: 'danger', size: 'sm', attrs: { 'data-tp-revoke': r.id } })
      ].filter(Boolean)));
    }
    host.replaceChildren(...[
      h('h3.tp-mine-h', { text: 'Your testimonials' }),
      rows.length
        ? h('p.tp-mine-meta', { text: 'Taking one back stops it being used, whatever its state. The studio is told straight away and takes it off the website.' })
        : h('p.tp-mine-meta', { text: 'You have not sent one. If the studio asks, you can say a few words; nothing is shown until it is reviewed.' }),
      rows.length ? list : null
    ].filter(Boolean));
  };
  /* One listener per host, however often Settings re-renders into it;
     it reads the latest rows through the closure of the newest mount. */
  host._tpRows = (v) => { if (v) rows = v; return rows; };
  host._tpDraw = draw;
  if (!host.dataset.tpWired) host.dataset.tpWired = '1';
  else { draw(); return rows.length; }
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tp-revoke]');
    if (!b || !host.contains(b)) return;
    const ok = await ask({ title: 'Take this testimonial back?', body: 'It will not be used again, and the studio is told straight away so that it takes the words off its website. This cannot be undone; you can always write a new one.', confirm: 'TAKE IT BACK', danger: true });
    if (!ok) return;
    b.disabled = true;
    try {
      const r = await T.revoke(cloud(), b.getAttribute('data-tp-revoke'));
      host._tpRows(host._tpRows().map((x) => (x.id === (r && r.id) ? r : x)));
      host._tpDraw();
      toast('Taken back. The studio has been told and will take it off the website.', 'success');
    } catch (x) { b.disabled = false; toast((x && x.message) || 'It could not be taken back just now.', 'error'); }
  });
  draw();
  return rows.length;
}

export default { maybePromptTestimonial, mountMyTestimonials, useSignals };
