/* ============================================================
   TESTIMONIALS — schema §59's browser half: the rules for asking, the
   consent sentence, and the calls
   ------------------------------------------------------------
   A member who has really used the studio may be asked, once, in a small
   dismissible card (src/ui/testimonial-prompt.js), whether they would say
   something about it for the public site. Nothing is published by
   sending it: it waits for the owner (admin.html#testimonials), and the
   author can take it back at any time from Settings.

   WHAT TAKING IT BACK DOES, and so what every sentence here may claim:
   the public site is static and its testimonials are copied in BY HAND
   (src/data/testimonials.json). A revoke cannot reach that copy. It
   drops the row from public_testimonials() at once, forbids publishing
   it again, and puts it on the console Overview's "Needs attention"
   until the owner has removed it from the site and marked it so (§59
   site_removed_at). So the copy says the studio is TOLD at once and
   takes it off the site, never that it vanishes from the site at once.

   WHEN TO ASK is askDecision(), pure, and every rule is a refusal:
     - not signed in, or §59 not on this database      -> never
     - fewer than 3 distinct days of real use           -> not yet
     - less than 5 script pages AND fewer than 10 scenes -> not yet
     - the Dragon sample (or any sample) is open        -> no: it is not their work
     - inside a trial's first day                       -> not yet
     - already sent one, or said "don't ask again"      -> never
     - dismissed in the last 60 days                    -> not yet
   "Never in the first session" follows from the 3 days: three distinct
   days up to today mean the first was at least two days ago.

   The prompt's memory is ONE field, `testimonialAsk`, inside the EXISTING
   device prefs blob fms_studio_prefs_v1 (chrome-prefs.js) — no new key —
   and it is written on a click only (verify's idle-write check).

   THE CALLS degrade silently: a database without §59 answers PGRST202,
   which `available()` reads as false, and the prompt never appears.
   Every call goes through window.StudioCloud (passed in), the same door
   growth.js uses; this file imports nothing but brand.js.
   ============================================================ */
import { BRAND } from './brand.js';

export const LIMITS = Object.freeze({ quoteMin: 20, quoteMax: 600, nameMax: 80, roleMax: 80, filmMax: 120 });
export const ASK_RULES = Object.freeze({ days: 3, pages: 5, scenes: 10, snoozeDays: 60, trialGraceHours: 24 });
const DAY = 86400000;

/** The exact sentence the author agrees to. It is stored with the
 *  testimonial (consent_text), so it must say everything it allows. */
export function consentText(name = BRAND.name) {
  return `I agree that ${name} may show these words, with the name, role and film I gave, on its public website and in its marketing. Nothing is shown until the studio approves it. I can take it back at any time in Settings: from then on it is not used again, and the studio is told straight away so that it takes the words off its website.`;
}

/** Distinct local calendar days among timestamps (ms, ISO strings or Dates). */
export function distinctDays(stamps) {
  const days = new Set();
  for (const s of stamps || []) {
    const t = s instanceof Date ? s.getTime() : typeof s === 'number' ? s : Date.parse(s);
    if (!Number.isFinite(t) || t <= 0) continue;
    const d = new Date(t);
    days.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  }
  return days.size;
}

/**
 * Should the card be shown now? -> { ask: boolean, why: string }
 *   signedIn, available, sample           booleans
 *   days, pages, scenes                   numbers (real use, this browser)
 *   trial  { active, endsAt, minutes }    from plan-gate's entitlement()
 *   state  the stored `testimonialAsk` ({ dismissedAt, never, sentAt })
 */
export function askDecision({ now = Date.now(), signedIn = false, available = false, sample = false, days = 0, pages = 0, scenes = 0, trial = null, state = null } = {}) {
  const st = state && typeof state === 'object' ? state : {};
  if (!signedIn) return { ask: false, why: 'signed-out' };
  if (!available) return { ask: false, why: 'unavailable' };
  if (st.never || st.sentAt) return { ask: false, why: st.sentAt ? 'sent' : 'never' };
  if (st.dismissedAt && now - Date.parse(st.dismissedAt) < ASK_RULES.snoozeDays * DAY) return { ask: false, why: 'snoozed' };
  if (sample) return { ask: false, why: 'sample' };
  if ((Number(days) || 0) < ASK_RULES.days) return { ask: false, why: 'days' };
  if ((Number(pages) || 0) < ASK_RULES.pages && (Number(scenes) || 0) < ASK_RULES.scenes) return { ask: false, why: 'work' };
  if (trial && trial.active) {
    const ends = Date.parse(trial.endsAt || '');
    const mins = Number(trial.minutes) || 0;
    /* The trial's start is its end less its length, the length READ from
       the server (trial_offer / billing_status), never assumed. Not known
       -> not asked. A start in the future means the length on offer now
       is not the one this trial was given (a code trial, a grandfathered
       year), so its start is not known either -> not asked. */
    if (!Number.isFinite(ends) || !mins) return { ask: false, why: 'trial' };
    const started = ends - mins * 60000;
    if (started > now) return { ask: false, why: 'trial' };
    if (now - started < ASK_RULES.trialGraceHours * 3600000) return { ask: false, why: 'trial-first-day' };
  }
  return { ask: true, why: 'ok' };
}

/** The form's own check, the same bounds as §59's CHECKs. -> { ok, errors: {field: sentence}, value } */
export function validate(input = {}) {
  const v = {
    quote: String(input.quote || '').trim(),
    display_name: String(input.display_name || '').trim(),
    role: String(input.role || '').trim(),
    film: String(input.film || '').trim()
  };
  const errors = {};
  if (v.quote.length < LIMITS.quoteMin) errors.quote = `A sentence or two, please: at least ${LIMITS.quoteMin} characters.`;
  else if (v.quote.length > LIMITS.quoteMax) errors.quote = `Up to ${LIMITS.quoteMax} characters.`;
  if (!v.display_name) errors.display_name = 'The name to show beside it.';
  else if (v.display_name.length > LIMITS.nameMax) errors.display_name = `Up to ${LIMITS.nameMax} characters.`;
  if (v.role.length > LIMITS.roleMax) errors.role = `Up to ${LIMITS.roleMax} characters.`;
  if (v.film.length > LIMITS.filmMax) errors.film = `Up to ${LIMITS.filmMax} characters.`;
  return { ok: !Object.keys(errors).length, errors, value: v };
}

/** How it would read on the site: the quote, and "Name, Role · Film". */
export function preview(input = {}) {
  const v = validate(input).value;
  const by = [v.display_name, v.role].filter(Boolean).join(', ');
  return { quote: v.quote, byline: [by, v.film].filter(Boolean).join(' · ') };
}

/** A row's state in words, for the author's list and the console. */
export function statusWord(r) {
  if (!r) return '';
  if (r.revoked_at) return 'Taken back';
  /* 'Approved', not 'Published': approval puts it on the public list, but
     the site's own copy is made by hand later, so the author is not told
     it is on the website before it is. */
  return r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Not published' : 'Waiting for review';
}

/** An approved row in src/data/testimonials.json's shape, its consent
 *  carried as `consentOn` (the day agreed) and `consentId` (the row's id,
 *  which the database keeps with the exact sentence agreed to). */
export function siteEntry(r) {
  const day = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : null);
  const o = { id: 'tm-' + String(r.id).slice(0, 8), quote: r.quote, name: r.display_name, role: r.role || '' };
  if (r.film) o.film = r.film;
  o.consentOn = day(r.consented_at);
  o.consentId = r.id;
  return o;
}

/* ---- the calls ----------------------------------------------------- */
const isMissing = (e) => /PGRST202|PGRST205|does not exist|Could not find/i.test(String((e && (e.code + ' ' + e.message)) || ''));
async function rpc(cloud, name, args) {
  const c = cloud || (typeof window !== 'undefined' ? window.StudioCloud : null);
  if (!c || !c.ensureClient) throw new Error('Cloud is not available on this page.');
  const sb = await c.ensureClient();
  if (!sb) throw new Error('This build has no cloud project configured.');
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw error;
  return data;
}
/* An answer that is not an array (a fake, a proxy, an old server's
   catch-all) is treated as "not here", never as an empty list. */
const rows = (d) => (Array.isArray(d) ? d : null);

/** Is §59 on this database, for this signed-in person? Never throws. */
export async function available(cloud) {
  try { return rows(await rpc(cloud, 'my_testimonials')) !== null; } catch (e) { return false; }
}
/** The author's own, newest first; [] when §59 is missing. */
export async function mine(cloud) {
  try { return rows(await rpc(cloud, 'my_testimonials')) || []; }
  catch (e) { if (isMissing(e)) return []; throw e; }
}
export async function submit(cloud, input) {
  const { ok, value } = validate(input);
  if (!ok) throw new Error('Check the highlighted fields.');
  try {
    return await rpc(cloud, 'submit_testimonial', { p_quote: value.quote, p_display_name: value.display_name, p_role: value.role || null, p_film: value.film || null, p_consent: consentText() });
  } catch (e) {
    if (isMissing(e)) throw new Error('Testimonials are not open on this studio yet.');
    if (e && e.code === 'P0429') throw new Error('That is plenty for one day. Thank you.');
    throw new Error((e && e.message) || 'It did not send. Try again in a moment.');
  }
}
export const revoke = (cloud, id) => rpc(cloud, 'revoke_testimonial', { p_id: id });
export const admin = {
  list: (cloud, status = null) => rpc(cloud, 'admin_list_testimonials', { p_status: status }).then((d) => rows(d) || []),
  setStatus: (cloud, id, status) => rpc(cloud, 'admin_set_testimonial_status', { p_id: id, p_status: status }),
  /* the owner's word that a taken-back testimonial is off the public site */
  markRemoved: (cloud, id) => rpc(cloud, 'admin_mark_testimonial_removed', { p_id: id })
};
/** Taken back (or its account deleted) after it was EVER approved, and not
 *  yet marked off the site. first_approved_at is never cleared (§59), so an
 *  approval later undone still counts; approved_at is the fallback for a
 *  server that predates the column. */
export const needsTakedown = (r) => !!(r && r.revoked_at && (r.first_approved_at || r.approved_at) && !r.site_removed_at);
export { isMissing };

export default { consentText, distinctDays, askDecision, validate, preview, statusWord, siteEntry, available, mine, submit, revoke, admin, needsTakedown, LIMITS, ASK_RULES };
