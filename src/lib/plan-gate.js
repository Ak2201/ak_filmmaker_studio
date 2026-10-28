/* ============================================================
   PLAN GATE — what a plan may SEE (schema section 18, `features`)
   ------------------------------------------------------------
   The database decides what a plan may SYNC (the limit triggers) and
   this module decides what it may SHOW: which modules open, whether
   new projects can be made, whether the hub shows anything but the
   sample. The map comes from the plan's `features` — the console's
   Features matrix writes it, billing_status() carries it — and a key
   that is MISSING is allowed. Only a tick removed in the console locks
   anything, so a plan nobody has edited hides nothing.

   WHO IS GATED. A signed-in account whose plan is known. A signed-out
   visitor is not — the site gate has already decided whether they see
   the app at all, and `npm run verify` loads every page signed out —
   and a code-only visitor (gate.js's code pass) is not either: the
   code was the owner's invitation. So this is the owner's PRODUCT
   boundary for members, not a security boundary; the data boundary is
   RLS and the triggers, and a page hidden here is still a public file.

   THREE THINGS IT DOES.
     allowed(key)      the question every caller asks
     the page lock     a module page whose every module is locked gets
                       a panel over it (.pg-lock) with the plan named
                       and the way up; `main` is hidden underneath.
                       Nothing is removed from the document.
     the tab lock      a module that is a TAB of a bigger page (the
                       Library's case studies, dissection, glossary)
                       locks that tab only: its section gets the same
                       card inline and its content hidden. Locking the
                       whole Library because one shelf is off the plan
                       would hide twenty-two films nobody unticked.
                       The same goes for a stage module that is one
                       section of a page shared with a lower plan's
                       modules (reports.html's Cast Matrix beside Basic's
                       Screen Time): tabsHere() below.
   What each plan starts with is src/data/plan-matrix.json, written into
   plans.features by schema section 35 (the owner's three-plan split).
     the marks         [data-module-id] elements in the shell's menus,
                       the launcher and the palette get .is-locked and
                       a PLAN flag, so a locked door looks locked
                       before it is tried.
   The hub reads sampleOnly() and allowed('new_projects') itself.

   Capabilities, beside the module ids (which come from navigation.json
   and are not repeated here):
     sample_only     the hub shows the registered sample projects (src/lib/samples.js) and no other
     new_projects    create / import / duplicate a project
     script_import   the Fountain / FDX / PDF importers
     ai_tools        every model-backed tool
     exports         PDF, backup and other downloads
     drive_backup    Google Drive backup
     remove_branding a PAID plan may switch off "Made with FilmMakerStudio"
                     on decks, call sheets and the screening room
                     (src/ui/footer.js reads it; the Free plan never may,
                     whatever this says — the line is how Free grows)
   ============================================================ */
import Store from './store.js';
import { BRAND } from './brand.js';
/* navigation.json through navmodel.js only: phases() and
   moduleGroups() apply the region filter, so a module that is not on
   the map in this region is not in the console's Features matrix and
   cannot lock a page it is no longer on. */
import { moduleGroups, shelves, phases } from './navmodel.js';
import { h } from './dom.js';
import { bumpUsage } from './usage.js';
import Billing from './billing.js';   // same chunk on every page; a dynamic import here moved nothing
import { trialLength } from './trial-time.js';
/* The launch pass (§61): what the wall offers before the plans, and the
   reminders when a pass is running. pass-view.js is pure. */
import { passPhase, passFacts, mayBuyPass, onPass, passName, passDays, passNow, countdownText, leftText, passTerms, passMode } from './pass-view.js';
import { offerTerms } from './offer-terms.js';
import '../styles/plan-gate.css';

export const CAPABILITIES = [
  /* The SAME keys, in the same order, as the capability rows of
     src/data/plan-matrix.json (npm run test:plans compares them). The
     matrix is not imported here because this module is CORE. */
  ['sample_only',   'Sample project only',    'The hub shows the sample projects and nothing else'],
  ['new_projects',  'New projects',           'Create, import or duplicate a project'],
  ['script_import', 'Script import',          'Fountain, FDX and PDF importers'],
  ['exports',       'PDF exports',            'Every PDF the studio prints (the backup download is never held back)'],
  ['drive_backup',  'Google Drive backup',    'The Drive connection on Settings'],
  ['ai_tools',      'AI tools',               'Every model-backed tool, on the user’s own key'],
  ['remove_branding', 'Remove branding',      'Switch off “Made with ' + BRAND.name + '” (paid plans only)']
];

let features = null;      // null = unknown / not gated; an object once a plan is known
let plan = '';
let planName = '';
/* §30. The second axis: not WHAT the plan shows but WHETHER this person
   may be here at all. null = unknown, and unknown means YES — see
   entitlement() below, which is the single most dangerous line in this
   module. */
let ent = null;           // null | { entitled, reason, endsAt, used, trialEnabled }
/* §32. Whether buying is a thing at all. null = unknown (the key was
   absent: a database that has not run §32, or nobody signed in), and
   unknown means "as before" — buying stays on screen, the wall keeps
   its §30 rules. Only an explicit `false` from billing_status() hides
   the buying UI. */
let purchaseReq = null;
/* §33. The server's clock minus this browser's, from billing_status()'s
   `server_now`. The trial band counts down against serverNow(), so a
   laptop whose clock is ten minutes fast does not take the band away
   ten minutes early (and a slow one does not keep it up after the
   server has ended the trial). 0 when the key is absent. */
let skew = 0;
/** Date.now(), corrected to the server's clock when it has said. */
export const serverNow = () => Date.now() + skew;

/** §32. True only when the server SAID purchases are not required.
 *  Every "buy" control in the studio hides while this is true
 *  (`html[data-purchases="off"]`, plan-gate.css). */
export const purchasesOff = () => purchaseReq === false;

/** True unless the plan says false. Missing key = allowed. */
export function allowed(key) {
  if (!features) return true;
  return features[key] !== false;
}
/* MODULES SWITCHED OFF FOR EVERY PLAN. The module rows of
   src/data/plan-matrix.json that carry `plans: []`, key for key (npm run
   test:plans compares them; the matrix is not imported here because this
   module is CORE). A module on this list is not an upsell: no plan sells
   it, so nothing offers a PLAN flag or a SEE PLANS card - it is simply
   not there (isDisabledEverywhere, below). */
export const OFF_BY_DEFAULT = ['case-studies', 'dissection', 'glossary', 'pitch-deck', 'script-breakdown', 'songs', 'lookbook', 'media'];
/* Ids the plan rows showed NO plan above this one offers - an admin kill
   switch on a module the plans otherwise carry. Filled by loadFlagNames. */
let offersNone = new Set();

/** True when the module is off for EVERYBODY, not merely above this
 *  person's plan: the matrix says no plan has it, or the admin's override
 *  killed it and no plan row offers it. The difference matters - a module
 *  one plan up is an upsell and keeps today's PLAN flag and SEE PLANS card;
 *  one nobody sells is hidden. This is a HIDING rule only: allowed() and
 *  entitlement() are untouched, so nothing here can wall a paying member.
 *
 *    unknown (signed out, offline) -> the matrix defaults;
 *    purchases off (open_features() opens every key) -> the matrix
 *      defaults, plus any key the server says false (nothing is plan-locked
 *      then, so a false is an override);
 *    purchases on -> a module the matrix leaves on shows unless the
 *      server says false and no plan row offers it.
 *  A matrix `plans: []` module is hidden in every case (see below). */
export function isDisabledEverywhere(id) {
  /* The matrix's `plans: []` is FINAL (owner, 19 Oct 2026). The server's
     features map cannot bring one of these back: the live §36 was run on
     12 Oct, before 15 modules were switched off, so it still says true
     for them on Pro, and trusting it put every one back in the rail's
     flyouts. A module comes back by giving it a plan in the matrix -
     which is how six came back on 19 Oct 2026 (owner, after the Celtx
     comparison): auto-tag, screen-time and cast-matrix on Intermediate,
     shoot-day, edit-log and deliverables on Pro — and idea-vault on Basic
     and up the same day, so the Chrome clipper's clips have a home. */
  if (OFF_BY_DEFAULT.includes(id)) return true;
  if (!features) return false;
  if (purchaseReq === false) return features[id] === false;
  if (features[id] === true) return false;
  return features[id] === false && offersNone.has(id);
}
/** The one capability that is OFF unless the plan says true. */
/* AI tools are LOCKED unless a known plan includes them. The opposite
   default from allowed(), on purpose: allowed() fails open so a page is
   never walled by a timeout, but an AI pill that opened on an unknown
   plan would offer a tool the next answer takes away. Unknown (signed
   out, plan not loaded yet) reads locked; a pill unlocks live on
   'plan:changed'. True for Pro, a running trial, and everybody while the
   purchases switch is off (open_features() opens every key). */
export function aiUnlocked() { return !!features && features.ai_tools !== false; }

export function sampleOnly() { return !!(features && features.sample_only === true); }

/** The question a CAPABILITY's entry point asks before it acts: true
 *  when allowed; otherwise a toast names the capability and the plan,
 *  with the way up, and the caller does nothing. `what` is the thing
 *  refused ("Drive backup"); it defaults to the capability's label.
 *  Fails open like allowed(): unknown is yes. */
export function guard(key, what) {
  if (allowed(key)) return true;
  bumpUsage('limit_hit');   // a plan said no (counts only; src/lib/usage.js)
  const label = what || ((CAPABILITIES.find(([k]) => k === key) || [])[1]) || 'This';
  const where = ent && ent.reason === 'granted' ? 'the access the studio gave you'
              : plan === 'free' ? 'the free trial' : 'the ' + (planName || 'current') + ' plan';
  const say = (o) => {
    try {
      const ui = typeof window !== 'undefined' && window.StudioUI;
      if (ui && ui.toast) ui.toast(label + ' is not part of ' + where + '.' + (o ? ' ' + nudgeText(o) : ''), {
        type: 'info', action: nudgeAction(o), onAction: () => { location.href = o ? o.href : 'purchase.html'; } });
    } catch (e) { /* no chrome on this page: the refusal stands, silently */ }
  };
  /* The refusal is synchronous (the caller does nothing); only the
     sentence waits for the plan rows and the server's quote, both
     cached or quick. Unreadable rows: the plain sentence, as before. */
  quotedOffer([key]).then(say, () => say(null));
  return false;
}

/** §30. Whether this person may use the studio: a bought plan, or a live
 *  trial. `reason` is 'paid' | 'trial' | 'granted' | 'free' | 'expired' |
 *  'off' | 'unknown' ('granted': access given by the studio, §33).
 *
 *  UNKNOWN MEANS ENTITLED, and it is not a convenience. `npm run verify`
 *  loads all 21 pages SIGNED OUT against the open build: there is no
 *  session, billing_status() is never called, and nothing here can know
 *  anything. If that read as "not entitled" the wall would cover every
 *  page of the app and the entire gate would fail — and worse, the same
 *  thing would happen to a real signed-in user the moment the network
 *  hiccuped. A paywall that closes when it cannot reach the server locks
 *  out the people who have paid.
 *
 *  That is the opposite choice from sitegate.js, which fails CLOSED on
 *  purpose, and the difference is what each one protects. The site gate
 *  guards who gets in; its failure costs a customer an hour. This guards
 *  a sale; its failure costs a paying customer their work. The data is
 *  guarded by neither — RLS and the limit triggers do that, and they are
 *  untouched by section 30. See the banner at the top of this file. */
export function entitlement() {
  if (!ent) return { entitled: true, reason: 'unknown', endsAt: null, used: false, trialEnabled: true };
  return { ...ent };
}
export const entitled = () => entitlement().entitled;
/** When a running trial ends, as a Date, else null. */
export function trialEndsAt() {
  const e = entitlement();
  return e.reason === 'trial' && e.endsAt ? new Date(e.endsAt) : null;
}
export function currentPlan() { return { plan, planName, features: features ? { ...features } : null, gated: !!features, purchaseRequired: purchaseReq, ...entitlement() }; }

/** The modules of navigation.json, by stage, for the console's matrix.
 *  `page` is the file a module lives on and `siblings` the other
 *  modules on it: a page locks only when EVERY module on it is
 *  unticked (pageLocked() below), and the matrix says so per row. */
export function moduleCatalogue() {
  const pageOf = (m) => (m.href || '').split('#')[0].toLowerCase();
  /* Siblings are only ever PAGE siblings, which a shelf's tabs are not:
     each tab locks on its own (the tab lock below), so "the page locks
     when all are unticked" would be untrue of them. */
  const pageMods = phases().flatMap((p) => p.modules.filter((m) => m.status !== 'planned' && m.href));
  return moduleGroups().map((p) => ({
    id: p.id, label: p.label,
    modules: p.modules.filter((m) => m.status !== 'planned').map((m) => ({
      id: m.id, label: m.label, page: pageOf(m),
      siblings: p.shelf ? [] : pageMods.filter((o) => o.id !== m.id && pageOf(o) === pageOf(m)).map((o) => o.label)
    }))
  }));
}

/* ---- learning the plan ------------------------------------------ */

let _refreshing = null;
let _again = false;
async function _refreshOnce() {
  const c = window.StudioCloud;
  /* Both axes are compared, so a trial expiring notifies even though the
     features map has not moved — that transition is the whole feature. */
  const prev = JSON.stringify([features, ent, purchaseReq]);
  try {
    if (!c || !c.isConfigured() || !c.getSession()) { features = null; plan = ''; planName = ''; ent = null; purchaseReq = null; }
    else {
      const st = await Billing.status();
      features = (st && st.features && typeof st.features === 'object') ? st.features : {};
      /* §45/§46: the admin's overrides ride on effective_features(), which
         starts from this very map. An object answers → use it; ANYTHING
         else (section not run, network, a thrown error) → the map above,
         unchanged. Fails OPEN, like entitlement(). */
      try {
        const sb = await c.ensureClient();
        const { data: eff, error: effErr } = sb ? await sb.rpc('effective_features') : { data: null, error: null };
        if (!effErr && eff && typeof eff === 'object' && !Array.isArray(eff)) features = eff;
      } catch (e) { /* keep billing_status()'s own features */ }
      plan =(st && st.plan) || 'free';
      planName = (st && st.plan_name) || Billing.planName(plan);
      /* §30. A server that has not run section 30 returns no `entitled`
         key at all, and undefined must not read as false — that would
         wall every existing member the moment this build shipped against
         an older database. So the key has to be PRESENT to be believed. */
      /* §32, the same rule: PRESENT to be believed. */
      purchaseReq = (st && typeof st.purchase_required === 'boolean') ? st.purchase_required : null;
      { const t = st && st.server_now ? Date.parse(st.server_now) : NaN; skew = Number.isFinite(t) ? t - Date.now() : 0; }
      if (st && typeof st.entitled === 'boolean') {
        ent = {
          entitled: st.entitled,
          /* A paid plan wins over a trial still running beside it:
             trial_active() ignores the plan, so a buyer who paid
             mid-trial would otherwise keep the countdown band. */
          /* 'free': entitled because nothing is for sale (§32), so a
             trial still ticking beside it is not news — no band. */
          /* 'granted' (§33): access given by e-mail with no plan, while
             it stands — no band, no wall, and the studio's own words
             ("Access given by the studio") rather than a trial's or a
             plan's. PRESENT to be believed, like every key here. */
          reason: st.entitled ? (purchaseReq === false && plan === 'free' ? 'free'
                                 : (st.granted === true && plan === 'free') ? 'granted'
                                 : (st.trial_active && plan === 'free') ? 'trial' : 'paid')
                              : (st.trial_enabled === false ? 'off' : 'expired'),
          endsAt: st.trial_ends_at || null,
          /* §52: when the plan's year ends (null: a grant for good, or no plan) */
          planUntil: st.plan_until || null,
          /* §53: a bought year that has run out (the plan reads 'free'). */
          lapsed: st.lapsed === true,
          used: st.trial_used === true,
          /* 'signup' | 'code' | 'admin' | 'refund' (§30), or null: the
             reminders below read it to know which length applies. */
          trialSource: typeof st.trial_source === 'string' ? st.trial_source : null,
          trialEnabled: st.trial_enabled !== false,
          /* §33: the length a trial started NOW would get, for the
             wall's offer to somebody who never had one. */
          trialMinutes: Number(st.trial_minutes) > 0 ? Number(st.trial_minutes) : null,
          /* Anything paid, granted or refunded: start_trial() answers
             'paid' for these, so the wall does not offer a trial it
             would refuse. */
          paidBefore: Array.isArray(st.payments) && st.payments.some((p) => p && /^(paid|granted|refunded)$/.test(p.status)),
          /* §61, THE LAUNCH PASS: Pro for N days, period 'pass'. Every key
             PRESENT to be believed (pass-view.js): a server without §61
             sends none, and then nobody is on a pass or may buy one. */
          passActive: onPass(st) && !!st.plan_until && Date.parse(st.plan_until) > Date.now() + skew,
          passUsed: st.pass_used === true,
          mayPass: mayBuyPass(st),
          passDays: passDays(st),
          /* §62: a running auto-pay (billing.js autopayOf), or null. */
          autopay: Billing.autopayOf(st)
        };
      } else {
        ent = null;
      }
    }
  } catch (e) {
    /* The table or the RPC missing (section 16/18 not run), or a
       network failure: nothing is known, so nothing is locked — and
       nothing is WALLED either. A paywall that closes when the network
       blinks locks out the people who have paid. */
    features = null; plan = ''; planName = ''; ent = null; purchaseReq = null;
  }
  if (JSON.stringify([features, ent, purchaseReq]) !== prev) {
    flagNames = null; flagAsked = false;      // a new plan locks different doors
    Store.notify('plan:changed', currentPlan());
  }
  apply();
  remindTrial();
}

/** When a running launch pass ends, as a Date, else null. */
export function passEndsAt() {
  const e = entitlement();
  return e.passActive && e.planUntil ? new Date(e.planUntil) : null;
}

/* ---- the trial-ending reminders ----------------------------------
   The rail's clock (trial-band.js) is always there but easy to stop
   seeing over a trial of several days, and its own toast comes only in
   the last ten minutes. So one toast when a running trial has a day left
   and one when it has two hours — each AT MOST ONCE PER THRESHOLD PER
   TRIAL, and only for a trial LONGER THAN TWICE THE THRESHOLD. Without
   that second rule a 30-minute trial (the console's default) was told
   "ends in under an hour" on the first page after it started, which is
   not a reminder but a start-up nag. Nothing here assumes how long a
   trial is: the length is the server's — billing_status()'s
   trial_minutes for a trial started by the button or a refund; a code
   or console trial has its own length the server does not report, so
   for those the longest time left this tab has SEEN stands in (a lower
   bound, so it can only hold a reminder back, never fire one early).

   What was shown, and for which trial (its end), is kept in
   sessionStorage (transient, never localStorage; a session tier that
   throws falls back to this page's memory). Checked after every
   billing_status() read — page load, focus and the four-minute poll —
   against the SERVER's clock. Signed out nothing is known, so nothing
   shows (and verify, which runs signed out, never sees it). */
const REMIND_KEY = 'fms_trial_reminded';
const REMIND_AT = [2, 24];               // hours left, lowest first
let remindedMem = { e: '', s: [], m: 0 };
/** The thresholds (hours) a trial of `lengthMs` gets a reminder at. Pure. */
export const remindersFor = (lengthMs) => REMIND_AT.filter((hrs) => lengthMs > 2 * hrs * 3600000);
/* A RUNNING PASS gets the same two reminders, a day and two hours out,
   in place of a trial's: "Your 7-day pass ends …" and the yearly plans
   from their per-day price (the cheapest plan row's, never typed). Its
   length is known (its payment's own span), so a pass bought an hour
   ago is not told it ends "in about 167 hours" — only the thresholds
   inside its length fire, as for a trial. */
function remindTrial() {
  if (typeof window === 'undefined' || /^(purchase|purchases|admin|screening|start|invite)$/.test(pageName())) return;
  const pe = passEndsAt();
  const ends = pe || trialEndsAt();
  if (!ends) return;
  const ms = ends.getTime() - serverNow();
  if (!(ms > 0)) return;
  let rec = remindedMem;
  try { const v = JSON.parse(sessionStorage.getItem(REMIND_KEY) || 'null'); if (v && typeof v === 'object' && Array.isArray(v.s)) rec = v; } catch (e) { /* memory only */ }
  const e = ends.toISOString();
  if (rec.e !== e) rec = { e, s: [], m: 0 };                   // another trial: its own reminders
  const ent0 = entitlement();
  const known = pe ? (ent0.passDays || 0) * 86400000
    : ent0.trialSource === 'code' || ent0.trialSource === 'admin' ? 0 : (ent0.trialMinutes || 0) * 60000;
  const seenLeft = Math.max(Number(rec.m) || 0, ms);
  const due = remindersFor(Math.max(known, seenLeft));
  const th = due.find((hrs) => ms <= hrs * 3600000);
  /* Arriving with an hour left shows the two-hour notice only; the day's
     is spent with it, so it does not follow on the next page. */
  const shown = th && !rec.s.includes(th);
  const next = { e, s: shown ? [...new Set(rec.s.concat(REMIND_AT.filter((hrs) => hrs >= th)))] : rec.s, m: seenLeft };
  remindedMem = next;
  if (JSON.stringify(next) !== JSON.stringify(rec)) {
    try { sessionStorage.setItem(REMIND_KEY, JSON.stringify(next)); } catch (err) { /* memory only */ }
  }
  if (!shown) return;
  const hrs = Math.ceil(ms / 3600000);
  const when = ends.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const left = ms < 3600000 ? 'in under an hour' : 'in about ' + hrs + (hrs === 1 ? ' hour' : ' hours');
  const toast = (text) => {
    try {
      const ui = window.StudioUI;
      if (ui && ui.toast) ui.toast(text, { type: 'info', action: 'CHOOSE A PLAN', onAction: () => { location.href = 'purchase.html'; } });
    } catch (err) { /* no chrome on this page: the rail still counts */ }
  };
  if (!pe) { toast('Your free trial ends ' + left + ' (' + when + '). Choose a plan to keep working; everything you made stays.'); return; }
  const lead = 'Your ' + passName(ent0.passDays) + ' ends ' + left + ' (' + when + ').';
  cheapestPerDay().then((d) => toast(lead + ' Keep going with a yearly plan' + (d ? ' from about ' + d + ' a day' : '') + '; everything you made stays.'),
    () => toast(lead + ' Keep going with a yearly plan; everything you made stays.'));
}
/** "₹1.64" — the cheapest active plan's price a day, from the plans rows. */
async function cheapestPerDay() {
  const plans = (await Billing.listPlans()) || [];
  const prices = plans.filter((p) => p && p.id !== 'free' && p.active !== false).map((p) => Billing.priceFor(p, 'year')).filter((x) => x > 0);
  return prices.length ? Billing.fmtPaise(Billing.perDayPaise(Math.min(...prices))) : '';
}
export function refresh() {
  /* TWO TRAPS, both of which left a free member ungated for good:

     - The in-flight marker used to be cleared in a `finally` INSIDE the
       async body. Signed out, that body never awaits, so it ran to the
       end — finally included — before `_refreshing = (async …)()` was
       even assigned, and the assignment then stored a settled promise
       that nothing ever cleared. Every later refresh, the gate opening
       included, returned that stale "signed out" answer. The marker is
       cleared on the promise now, after the assignment by construction.
     - A request that lands while one is in flight is not the same
       request: the first may have read the state before the session
       was restored. It is run once more afterwards instead of being
       answered with the first one's result. */
  if (_refreshing) { _again = true; return _refreshing; }
  _refreshing = (async () => {
    do { _again = false; await _refreshOnce(); } while (_again);
  })().finally(() => { _refreshing = null; });
  return _refreshing;
}

/* ---- the page lock ---------------------------------------------- */

const file = () => (typeof location === 'undefined' ? '' : (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace(/^$/, 'index.html'));
/** Every module navigation.json puts on THIS page. */
export function modulesHere() {
  const here = file().replace(/\.html$/, '');
  const out = [];
  for (const p of phases()) for (const m of p.modules) {
    if (!m.href) continue;
    const f = m.href.split('#')[0].toLowerCase().replace(/\.html$/, '');
    if (f === here) out.push(m);
  }
  /* A shelf module that IS a whole page (the Blueprints shelf, REMOVED when the guides moved into the stages; feature.html,
     short.html — no fragment) locks the page the way a stage's module
     does. A shelf module with a fragment is a tab, and locks as one
     (lockTabs below). They locked as Story modules until the
     Blueprints shelf existed; moving them must not ungate them. */
  for (const s of shelves()) for (const m of s.modules) {
    const [f0, frag] = (m.href || '').split('#');
    if (frag) continue;
    if (f0.toLowerCase().replace(/\.html$/, '') === here) out.push(m);
  }
  return out;
}
/** Locked when the page has modules and none of them is allowed. */
export function pageLocked() {
  /* Only modules that can be on a plan count: one that is off for every
     plan is hidden anyway, and a plan map that never names it reads as
     "allowed", which would keep the page open with nothing left on it. */
  const live = modulesHere().filter((m) => !isDisabledEverywhere(m.id));
  return live.length > 0 && live.every((m) => !allowed(m.id));
}
/** Every module here is off for every plan: nothing to sell, so the
 *  page says "not available" and offers no upgrade. */
export function pageGone() {
  const ms = modulesHere();
  return ms.length > 0 && ms.every((m) => isDisabledEverywhere(m.id));
}

/* ---- which plan has it ------------------------------------------
   "Included in the Indie plan": the LOWEST plan whose `features` map
   allows every module on the card, read from the plans table through
   Billing.listPlans() — the same rows the cards on purchase.html
   draw, so a console edit is live here on the next load. No price is
   typed anywhere in this file; the plans page quotes those. Until the
   table has answered, or if it cannot (signed out, section 18 not run,
   offline), the sentence is the honest general one. */
const PAID_FALLBACK = 'Included in a higher plan.';
async function lowestPlanWith(ids) {
  const plans = await Billing.listPlans();
  const open = plans
    .filter((p) => p && p.active !== false && p.id !== 'free' && Billing.planRank(p.id) > Billing.planRank(plan))
    .sort((a, b) => (a.sort ?? Billing.planRank(a.id)) - (b.sort ?? Billing.planRank(b.id)));
  return open.find((p) => ids.every((id) => !p.features || p.features[id] !== false)) || null;
}
/* ---- the offer: which plan, at what price ------------------------
   ONE answer to "what would open this?" for every place that refuses
   something — the toast from guard(), the hub's notes, the Settings
   Drive note, the nav flags, the wall. Each used to say only "not part
   of your plan" and link to a page of three cards, which makes the
   person do the arithmetic the studio already knows. The plan and its
   price come from the plans ROWS (Billing.listPlans(), the same rows
   the cards draw), never from a typed figure; when the rows cannot be
   read (signed out, offline, section 18 not run) this answers null and
   every caller keeps its plain sentence.

   `href` deep-links purchase.html to that plan, and `for` names what
   was refused, so the card there can say why it was picked (idea 11 of
   the 12 Oct review). Only known ids ever travel: plan-cards.js looks
   the label up again rather than printing what the address says. */
export async function offerFor(ids) {
  const list = [].concat(ids || []).filter(Boolean);
  const p = await lowestPlanWith(list);
  return p ? offerOf(p, list) : null;
}
function offerOf(p, list) {
  const paise = Billing.priceFor(p, 'year');
  const name = p.name || Billing.planName(p.id);
  const q = new URLSearchParams({ plan: p.id });
  if (list.length === 1) q.set('for', list[0]);
  return { id: p.id, name, paise, price: paise > 0 ? Billing.fmtPaise(paise) : '',
           href: 'purchase.html?' + q.toString() };
}
/** "Intermediate, ₹799" — the short form a toast or a note prints. */
export const offerText = (o) => (o ? o.name + (o.price ? ', ' + o.price : '') : '');

/* ---- the upgrade nudge: the NEXT plan and what it costs YOU -------
   offerFor() prints a plan's LIST price, which is the wrong number for
   somebody who already holds a plan: §21/§52 price an upgrade as the
   list price less the unused part of the current year. quotedOffer()
   adds the server's own quote for this account (lock-price.js
   upgradeFigure(), loaded lazily, never in first paint) as `due`, with
   `more` true when a credit made it a difference. No quote (signed out,
   offline, the RPC missing) means NO figure at all — the plan is named
   and the link goes to purchase.html — never the list price passed off
   as the difference. */
export async function quotedOffer(ids, { limit, at } = {}) {
  const o = limit ? await offerForLimit(limit, { at }) : await offerFor(ids);
  if (!o) return null;
  let fig = null;
  try { fig = await (await import('./lock-price.js')).upgradeFigure(o.id); } catch (e) { fig = null; }
  return { ...o, due: fig ? fig.amount : '', more: !!(fig && fig.more) };
}
/** The nudge as a sentence, from a quotedOffer() answer. */
export function nudgeText(o) {
  if (!o) return '';
  if (o.due && o.more) return 'Upgrade to ' + o.name + ' for ' + o.due + ' more: the unused part of your plan is counted.';
  if (o.due) return 'It comes with ' + o.name + ', ' + o.due + ' a year.';
  return 'It comes with the ' + o.name + ' plan.';
}
/** The toast button that goes with nudgeText(). */
export const nudgeAction = (o) => (!o ? 'SEE PLANS' : (o.more ? 'UPGRADE TO ' : 'SEE ') + o.name.toUpperCase());
/** The lowest plan above this one whose cap on `key` (projects, shares,
 *  collaborators, seats) is higher than this plan's — the plan a P0402
 *  limit should name. Read from the plans rows, like offerFor(). */
/* The plan has to be KNOWN before a limit can name the plan above it.
   A P0402 notice replayed at boot (cloud.js replayPlanLimitNotice())
   arrives before billing_status() has answered, while `plan` is still
   '' — and rank('') is 0, so every paid plan looked like an upgrade and
   a Basic holder was told "Basic raises it" at Basic's renewal price.
   Wait for the in-flight (or next) refresh for a few seconds; if the
   plan is still unknown, answer nothing and the plain toast stands. */
async function planKnown(ms = 6000) {
  const until = Date.now() + ms;
  while (!plan && Date.now() < until) {
    if (_refreshing) { try { await _refreshing; } catch (e) { /* below */ } continue; }
    await new Promise((r) => setTimeout(r, 200));
  }
  return !!plan;
}
/* `at`: the cap the refusal itself reported. When it is not this plan's
   cap, something else is binding (an account's own seat_limit sits under
   the plan's), so a bigger plan would not help and none is named. */
export async function offerForLimit(key, { at } = {}) {
  if (!(await planKnown())) return null;
  const plans = (await Billing.listPlans()) || [];
  const mine = plans.find((p) => p && p.id === plan);
  if (!mine) return null;                    // the plan above an unknown row is a guess
  const have = Billing.cap(mine.limits, key);
  if (have === null) return null;            // already unlimited: nothing above helps
  if (Number.isInteger(at) && at !== have) return null;
  const p = plans
    .filter((x) => x && x.active !== false && x.id !== 'free' && Billing.planRank(x.id) > Billing.planRank(plan))
    .sort((a, b) => Billing.planRank(a.id) - Billing.planRank(b.id))
    .find((x) => { const c = Billing.cap(x.limits, key); return c === null || c > have; });
  return p ? offerOf(p, []) : null;
}
/* ---- a cap's refusal, with the plan that raises it -----------------
   ONE reading of the server's cap sentences (schema §54 and §50) for
   every place that shows one — the sync's project cap (cloud.js), the
   share-link cap (chrome.js's share dialog) and the seat cap (Settings →
   Account). limitKey() says which cap a sentence is about; limitOffer()
   is quotedOffer() for that cap, refusing to answer when the sentence
   names a plan other than the one this page knows (a stale replay, a
   plan bought since: the "next plan" would be computed from the wrong
   base); limitText() is the sentence added after the server's own. */
export function limitKey(message, code) {
  const m = String(message || '');
  if (/^Your .* plan syncs up to/i.test(m)) return 'projects';
  if (/^Your .* plan allows .* share link/i.test(m)) return 'shares';
  if (code === '53400' || /^Seat limit reached/i.test(m)) return 'seats';
  return '';
}
export async function limitOffer(message, key = limitKey(message)) {
  if (!key) return null;
  const m = String(message || '');
  /* "(2 of 2)": the seat sentence reports the cap that refused it. */
  const at = key === 'seats' ? Number((/\((\d+) of (\d+)\)/.exec(m) || [])[2]) : NaN;
  const o = await quotedOffer([], { limit: key, at: Number.isInteger(at) ? at : undefined });
  const said = (/^Your (.+?) plan /i.exec(m) || [])[1] || '';
  const known = [planName, plan].filter(Boolean).map((x) => String(x).toLowerCase());
  return o && said && known.length && !known.includes(said.toLowerCase()) ? null : o;
}
export function limitText(o) {
  if (!o) return '';
  return o.due ? (o.more ? 'Upgrade to ' + o.name + ' for ' + o.due + ' more.' : o.name + ' raises it, ' + o.due + ' a year.') : o.name + ' raises it.';
}

/** The label a refused id goes by: a module's from navigation.json, a
 *  capability's from CAPABILITIES. '' for anything unknown — which is
 *  how plan-cards.js refuses to print a made-up ?for= value. */
export function labelFor(id) {
  const cap = CAPABILITIES.find(([k]) => k === id);
  if (cap) return cap[1];
  for (const p of phases()) for (const m of p.modules) if (m.id === id) return m.label;
  for (const s of shelves()) for (const m of s.modules) if (m.id === id) return m.label;
  return '';
}

/* `cta` is the card's primary link: once the plan is known it deep-links
   to purchase.html?plan=<id>, and for a signed-in buyer the server's
   own quote says what the step costs. Every part falls back to the plain
   sentence offline or signed out. */
function includedLine(ids, cta) {
  const top = Billing.planRank(plan) >= Billing.PLAN_ORDER.length - 1;
  const line = h('p.pg-lock-plan', { text: top ? '' : PAID_FALLBACK });
  /* The price line and the button's figure, in the visitor's currency
     (lock-price.js, loaded here only, never in first paint). */
  lowestPlanWith(ids).then((p) => p && import('./lock-price.js').then((m) => m.fillLock(p, ids, line, cta)))
    .catch(() => { /* the fallback stands */ });
  return line;
}

/** The card that says why — shared by the page lock and the tab lock.
 *  `mods` are the locked modules: each is named with its purpose, so
 *  the panel sells what is behind the door rather than only naming
 *  the lock. */
function lockCard(mods) {
  const list = (mods || []).filter(Boolean);
  const names = list.map((m) => m.label).join(' · ');
  const card = h('div.pg-lock-card', {}, [
    h('p.bd-eyebrow', { text: 'Your plan' }),
    /* No free PLAN (owner, 11 Oct 2026): somebody on 'free' is on the
       trial, or on nothing at all, and the card says so in those words. */
    h('h2.pg-lock-h', { text: ent && ent.reason === 'granted' ? 'Not part of the access the studio gave you.'
                            : plan === 'free' ? 'Not part of the free trial.' : 'Not on the ' + (planName || 'current') + ' plan.' })
  ]);
  if (list.length) {
    const ul = h('ul.pg-lock-mods', { 'aria-label': 'What this part of the studio does' });
    list.forEach((m) => {
      const li = h('li.pg-lock-mod');
      li.append(h('span.pg-lock-mod-label', { text: m.label }));
      if (m.purpose) li.append(h('span.pg-lock-mod-purpose', { text: m.purpose }));
      ul.append(li);
    });
    card.append(ul);
  }
  const cta = h('a.btn.primary', { href: 'purchase.html', text: 'SEE PLANS' });
  card.append(
    h('p.pg-lock-p', { text: (names ? names + (list.length > 1 ? ' are' : ' is') : 'This part of the studio is') + ' part of a higher tier. Everything you have written here is still saved on this device; it reappears the moment the plan includes it.' }),
    includedLine(list.map((m) => m.id), cta),
    h('div.pg-lock-actions', {}, [
      cta,
      h('a.btn', { href: 'index.html', text: 'BACK TO THE STUDIO' })
    ])
  );
  return card;
}

function lockPanel() {
  return h('div.pg-lock', { role: 'region', 'aria-label': 'Not on your plan' }, [lockCard(modulesHere().filter((m) => !isDisabledEverywhere(m.id)))]);
}
/* Neutral variant: same .pg-lock shell and card, no plan, no price, no
   SEE PLANS. No redirect either: the page stays where it is. */
function gonePanel() {
  const card = h('div.pg-lock-card', {}, [
    h('p.bd-eyebrow', { text: 'Not available' }),
    h('h2.pg-lock-h', { text: 'This part of the studio is not available yet.' }),
    h('p.pg-lock-p', { text: 'It is not switched on for any plan right now. Anything you wrote here is still saved on this device.' }),
    h('div.pg-lock-actions', {}, [h('a.btn.primary', { href: 'index.html', text: 'BACK TO THE STUDIO' })])
  ]);
  const el = h('div.pg-lock', { role: 'region', 'aria-label': 'Not available' }, [card]);
  el.dataset.gone = '1';
  return el;
}

/* ---- the wall (§30) ----------------------------------------------
   The trial ran out and nothing was bought. This is NOT the module
   lock above: that one says "this corner is on a higher tier" and
   leaves the rest of the studio open. This says "the trial is
   over".

   It REUSES .pg-lock rather than introducing a second overlay — the
   positioning, the backdrop, the `main` hiding and the responsive
   rules are all in plan-gate.css already, and prove:billing reads
   .pg-lock / .pg-lock-card / .pg-flag by name. The wall is a variant
   (.pg-wall) of an existing thing, never a rename of it.

   WHY A WALL AT ALL, when pageLocked() exists: pageLocked() asks
   navigation.json which modules live on this file, and index.html,
   dashboard.html and settings.html have NONE — so it is false on
   exactly the three pages a lapsed visitor would sit on. */

/* Pages the wall never covers, and why each one:
     settings  — you cannot buy from behind a wall, and sign-out lives here
     purchase / purchases — where a plan is bought; the admin's money page
     invite    — the doorway; plan cards are sold from it (prove:billing)
     start     — the public landing page
     screening — a guest's pass is its own credential
     admin     — the owner must never be locked out of their own console
   privacy/terms/refund load none of this module, so they need no entry. */
/* Matched against the page name WITHOUT its extension, because
   vercel.json sets cleanUrls: in production location.pathname is
   `/settings`, not `/settings.html`, and a regex anchored to `.html`
   would have walled the page you buy from on the live site and nowhere
   else. modulesHere() strips the extension for the same reason. */
/* OWNER, 28 Oct 2026: ONE page for somebody who has not paid, the purchase page.
   A person with no running plan, pass or trial reaches nothing else of the
   studio, Settings included (it was exempt, and it holds backup and Drive,
   which are the studio). What stays: the purchase page itself, the doorway
   and the public pages (terms, privacy, refund, contact and the rest of the
   marketing site), and admin, which is role-gated and never walls an
   administrator. */
const WALL_EXEMPT = /^(purchase|purchases|invite|start|screening|admin|pricing|contact|about|privacy|terms|refund|product-[a-z-]+|guides|guide-[a-z-]+|compare-[a-z-]+|trust)$/;
const pageName = () => file().replace(/\.html$/, '');

/* ---- PASS TIMER — the launch offer's countdown, in the studio's pages
   ------------------------------------------------------------
   Binds every [data-pass-timer] on the page to the server's deadline
   (pass-offer.js: the server's `now` plus the time since it was read,
   so a visitor's clock cannot move it). The static markup carries no
   number; the element is filled here, every second, while the tab is
   visible. [data-pass-left] gets "N of CAP left" when the offer is
   capped, and is hidden when it is not.

   AT ZERO the offer has ended, because the server now refuses it
   (quote_pass 'closed'): `onEnd` is called once so the page redraws
   with "The launch offer has ended" and the plans first. Nothing here
   decides anything a payment depends on.

   One interval for the page, stopped when no timer is connected. The
   ticking element is role="timer" with aria-live off: a screen reader
   is not read a clock. No storage.
   (Here rather than in a file of its own because it draws on the page,
   and plan-gate is the logic layer's named DOM adapter that already
   draws the wall it sits on; invite.html and purchase.html import it.) */
let passTick = null;
const passBound = new Set();   // { offer, onEnd, ended }

function paintPassTimers() {
  const now = Date.now();
  for (const b of [...passBound]) {
    const els = document.querySelectorAll('[data-pass-timer]');
    if (!els.length) { passBound.delete(b); continue; }
    const st = passNow(b.offer, now);
    if (st.state !== 'open') {
      if (!b.ended) { b.ended = true; passBound.delete(b); try { b.onEnd && b.onEnd(); } catch (e) { /* the page redraws on its next event */ } }
      continue;
    }
    const text = countdownText(st.msLeft);
    for (const el of els) {
      if (el.textContent !== text) el.textContent = text;
      const wrap = el.closest('[data-pass-ends]');
      if (wrap) wrap.hidden = !text;
    }
    const left = leftText(st);
    for (const el of document.querySelectorAll('[data-pass-left]')) {
      if (el.textContent !== left) el.textContent = left;
      el.hidden = !left;
    }
  }
  if (!passBound.size && passTick) { clearInterval(passTick); passTick = null; }
}

/** Start (or restart) the countdown for `offer` ({ raw, readAt } from
 *  billing.js passOffer()). Call after each render that drew a timer. */
export function bindPassTimers(offer, { onEnd } = {}) {
  if (typeof document === 'undefined' || !offer) return;
  passBound.clear();
  passBound.add({ offer, onEnd, ended: false });
  paintPassTimers();
  if (!passTick && !document.hidden && passBound.size) passTick = setInterval(paintPassTimers, 1000);
}

/** The countdown line and the cap line, empty and hidden until
 *  bindPassTimers() fills them: "Offer ends in 3d 04:12:09" and
 *  "312 of 500 left". `cls` prefixes the page's own classes. */
export function passClock(cls = 'pass') {
  return h('p.' + cls + '-clock', {}, [
    h('span.' + cls + '-ends', { 'data-pass-ends': '', hidden: true }, [
      'Offer ends in ',
      h('strong.' + cls + '-timer', { 'data-pass-timer': '', role: 'timer', 'aria-live': 'off', 'aria-label': 'Time left in the launch offer' })
    ]),
    h('span.' + cls + '-left', { 'data-pass-left': '', hidden: true })
  ]);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (passTick) { clearInterval(passTick); passTick = null; } }
    else if (passBound.size) { paintPassTimers(); if (!passTick && passBound.size) passTick = setInterval(paintPassTimers, 1000); }
  });
}

/* THE LAUNCH PASS ON THE WALL (§61). While the pass is on sale and this
   account may buy it, the wall's first button is the pass, with the
   server's price, length and countdown; the free trial is offered only
   where there is no pass at all (pass-view.js passPhase() 'off'). The
   offer is public and read once per page (billing.js passOffer()). */
let wallPass = null;        // { raw, readAt } | null
let wallPassAsked = false;
function askWallPass() {
  if (wallPassAsked) return;
  wallPassAsked = true;
  Billing.passOffer().then((o) => { wallPass = o; if (o) apply(); }, () => {});
}
const wallPassOpen = () => passPhase(wallPass) === 'open';

function wallPanel() {
  const e = entitlement();
  const off = e.reason === 'off';
  const kind = wallKind();
  if (kind === 'pass') return passWallPanel(e);
  /* §33. Somebody who is a member but never had a trial — e.g. one whose
     plan-less e-mail grant was revoked or ran out (while it stands they
     are 'granted' and never walled) — meets the wall on their first
     page. They are offered the trial everybody
     else gets rather than told one is "over". start_trial() decides; a
     refusal ('used', 'paid', 'disabled') is printed, never guessed. */
  const fresh = kind === 'fresh';
  const len = trialLength(e.trialMinutes);
  const passOver = e.passUsed && !e.passActive;
  const card = h('div.pg-lock-card.pg-wall-card', {}, [
    h('p.bd-eyebrow', { text: off ? 'The studio' : passOver ? 'Your pass' : 'Your trial' }),
    h('h2.pg-lock-h', { text: off ? 'The studio is open to members.' : fresh ? 'Start your free trial.' : passOver ? 'Your pass has ended.' : e.used ? 'Your free trial is over.' : 'Choose a plan to come in.' }),
    h('p.pg-lock-p', { text: off
      ? 'A plan opens the whole desk: your script, your breakdown, your schedule, your budget, your call sheets.'
      : fresh
        /* Neutral about WHAT the trial opens: the owner's console decides
           that (trial_scope: the sample, or the whole studio), and the
           length is the server's (trial_minutes), never typed here. */
        ? 'Try the studio' + (len ? ' for ' + len : '') + ', free, then choose a plan for your own film.'
        : 'A plan opens the desk for your own film: your script, your breakdown, your schedule, your budget, your call sheets.' }),
    /* The promise the owner made, kept where it is visible rather than
       in a FAQ: nothing a person wrote is held hostage to a sale. */
    h('p.pg-lock-p.pg-wall-safe', { text: 'Everything you wrote is still saved on this device. Nothing has been deleted.' }),
    /* The plans themselves, ON the wall: a name, a price and one line
       each, every row a link straight to that plan's card. "SEE PLANS"
       alone made the person leave the wall to learn what it would cost.
       Not for somebody being offered their trial — that card has one
       job. Filled from the plans rows; empty (and hidden) if they
       cannot be read, which leaves the wall exactly as it was. */
    fresh ? null : wallPlans(),
    h('div.pg-lock-actions', {}, [
      fresh ? h('button.btn.primary', { type: 'button', 'data-action': 'pg-start-trial', text: len ? 'START MY ' + len.toUpperCase() : 'START MY FREE TRIAL' }) : null,
      h('a.btn' + (fresh ? '' : '.primary'), { href: 'purchase.html', text: 'SEE PLANS' }),
      /* THE WAY OUT. The wall hides the band (.sh-bar) and the phone's
         bar (.mab) — plan-gate.css, [data-paywall] — and those held the
         only sign-out route there was (the account pill, then
         Settings). Without this a lapsed trial could reach exactly one
         page, purchase.html, and every road back led to this wall:
         invite.html said "You're in", start.html's sign-in came straight
         back here. It is the ordinary sign-out (auth.js's delegated
         [data-auth-action] handler), not a second implementation. */
      h('button.btn', { type: 'button', 'data-auth-action': 'signout', text: 'SIGN OUT' })
    ].filter(Boolean)),
    h('p.pg-lock-p.pg-wall-msg', { role: 'status', 'aria-live': 'polite', text: '' })
  ]);
  return h('div.pg-lock.pg-wall', { role: 'region', 'aria-label': off ? 'Members only' : fresh ? 'Start your free trial' : 'Your trial has ended' }, [card]);
}

/** The wall while the pass is on sale to this account: the pass first,
 *  the plans under it, the same safety line and ways out. */
function passWallPanel(e) {
  const f = passFacts(wallPass);
  const card = h('div.pg-lock-card.pg-wall-card', {}, [
    h('p.bd-eyebrow', { text: 'Launch offer' }),
    h('h2.pg-lock-h', { text: e.used ? 'Your free trial is over.' : 'Choose how to come in.' }),
    /* the terms in the server's mode (§62), offer-terms.js's words */
    h('p.pg-lock-p.pg-wall-terms', { 'data-offer-mode': passMode(wallPass) || 'unknown', text: 'The whole studio: ' + passTerms(wallPass).line + '. Once per account. Or a yearly plan, below.' }),
    passClock(),
    /* The pass's button straight under its price and clock: at 390px the
       plans below would otherwise push it two screens down. */
    h('div.pg-lock-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-action': 'pg-buy-pass', text: passMode(wallPass) === 'renew' ? 'TRY THE WHOLE STUDIO' : 'TRY THE WHOLE STUDIO FOR ' + f.price + ' · ' + f.length.toUpperCase() })
    ]),
    h('p.pg-lock-p.pg-wall-msg', { role: 'status', 'aria-live': 'polite', text: '' }),
    h('p.pg-lock-p.pg-wall-safe', { text: 'Everything you wrote is still saved on this device. Nothing has been deleted.' }),
    wallPlans(),
    h('div.pg-lock-actions', {}, [
      h('a.btn', { href: 'purchase.html', text: 'SEE PLANS' }),
      h('button.btn', { type: 'button', 'data-auth-action': 'signout', text: 'SIGN OUT' })
    ])
  ]);
  return h('div.pg-lock.pg-wall', { role: 'region', 'aria-label': 'Launch offer' }, [card]);
}

/** The wall's pass purchase: Billing.buyPass(), then the gate asked
 *  again (activation writes the member row), then billing re-read, which
 *  takes the wall down. A refusal is printed in the server's terms. */
async function buyPassFromWall(btn) {
  const card = btn && btn.closest('.pg-wall-card');
  const msg = card && card.querySelector('.pg-wall-msg');
  const say = (t) => { if (msg) msg.textContent = t; };
  const was = btn.textContent;
  btn.disabled = true;
  try {
    const c = window.StudioCloud;
    let acc = null;
    try { const st = await Billing.status(); acc = st && st.account_id; } catch (x) { acc = null; }
    await Billing.buyPass({ accountId: acc, shownMode: passMode(wallPass), onStatus: (t) => { btn.textContent = t.toUpperCase(); } });
    if (c && c.runGate) await c.runGate();
    await refresh();
  } catch (err) {
    say((err && err.message) || 'The pass could not be bought just now. Please try again.');
    btn.disabled = false; btn.textContent = was;
    if (err && (err.hint === 'closed' || err.code === 'closed' || err.hint === 'used' || err.hint === 'has_plan' || err.hint === 'renew_off' || err.code === 'terms')) {
      Billing.passOffer({ fresh: true }).then((o) => { wallPass = o; const w = document.querySelector('.pg-wall'); if (w && w.dataset.kind !== wallKind()) apply(); }, () => {});
    }
  }
}

function wallPlans() {
  const ul = h('ul.pg-wall-plans', { 'aria-label': 'Plans', hidden: true });
  Promise.all([Billing.listPlans(), Billing.offerModes()]).then(([plans, modes]) => {
    /* each price with its terms, in the server's plan_mode (§62) */
    const mode = modes && modes.plan;
    const paid = (plans || []).filter((p) => p && p.id !== 'free' && p.active !== false)
      .sort((a, b) => Billing.planRank(a.id) - Billing.planRank(b.id));
    for (const p of paid) {
      const paise = Billing.priceFor(p, 'year');
      if (!(paise > 0)) continue;
      const name = p.name || Billing.planName(p.id);
      ul.append(h('li', {}, [h('a.pg-wall-plan', { href: 'purchase.html?plan=' + encodeURIComponent(p.id) }, [
        h('strong', { text: name }),
        h('span.pg-wall-price', { text: offerTerms(mode, Billing.fmtPaise(paise), 'year').line + ' · ≈ ' + Billing.fmtPaise(Billing.perDayPaise(paise)) + ' a day' }),
        p.blurb ? h('span.pg-wall-blurb', { text: p.blurb }) : null
      ].filter(Boolean))]));
    }
    if (ul.children.length) {
      const t = offerTerms(mode, '', 'year');
      ul.append(h('li.pg-wall-once', { text: 'Each plan runs for a year' + (t.short ? ' · ' + t.short : '') + '. Your work is already here.' }));
      ul.hidden = false;
    }
  }).catch(() => { /* the SEE PLANS button stands alone */ });
  return ul;
}

/** The wall's own trial start (§33): the same two steps invite.html
 *  takes — start_trial(), then the gate asked again — and then this
 *  module re-reads billing_status(), which takes the wall down. */
async function startTrialFromWall(btn) {
  const card = btn && btn.closest('.pg-wall-card');
  const msg = card && card.querySelector('.pg-wall-msg');
  const say = (t) => { if (msg) msg.textContent = t; };
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'STARTING…';
  try {
    const r = await Billing.startTrial();
    if (!r || !r.started) {
      say({ used: 'You have already had your trial on this account. A plan opens the studio for a year.',
            paid: 'You have already bought a plan — try reloading the page.',
            disabled: 'Trials are not open at the moment. A plan opens the studio for a year.' }[r && r.reason] || 'That did not start. Please try again.');
      btn.disabled = false; btn.textContent = was;
      return;
    }
    const c = window.StudioCloud;
    if (c && c.runGate) await c.runGate();
    await refresh();
  } catch (e) {
    say((e && e.message) || 'That did not start. Please try again.');
    btn.disabled = false; btn.textContent = was;
  }
}

/** The wall's own export. It calls backup.js DIRECTLY rather than the
 *  hub's exportAll(), which needs hub.js's ALL_KEYS and its activity
 *  logger — the wall appears on every page, so coupling it to the hub
 *  would mean the one door that must stay open only opens on one page.
 *  Dynamic, so backup.js is not in any page's first paint. */
async function exportFromWall(btn) {
  const was = btn ? btn.textContent : '';
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'PREPARING…'; }
    const { downloadBackup } = await import('./backup.js');
    await downloadBackup();
    if (btn) btn.textContent = 'DOWNLOADED';
  } catch (e) {
    if (btn) btn.textContent = 'COULD NOT DOWNLOAD';
    try { console.error('[paywall] export failed', e); } catch (_) { /* */ }
  } finally {
    if (btn) setTimeout(() => { btn.disabled = false; btn.textContent = was; }, 2400);
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-action="pg-export"]');
    if (b) { ev.preventDefault(); exportFromWall(b); }
    const t = ev.target && ev.target.closest && ev.target.closest('[data-action="pg-start-trial"]');
    if (t && !t.disabled) { ev.preventDefault(); startTrialFromWall(t); }
    const p = ev.target && ev.target.closest && ev.target.closest('[data-action="pg-buy-pass"]');
    if (p && !p.disabled) { ev.preventDefault(); buyPassFromWall(p); }
  });
}

function wallKind() {
  const e = entitlement();
  if (e.reason === 'off') return 'off';
  if (wallPassOpen() && e.mayPass && passFacts(wallPass)) return 'pass';
  /* The free trial is offered only where no launch pass exists at all:
     while the pass is on sale, or once the launch offer has ended,
     start_trial() refuses a signup trial ('pass'). */
  return (!e.used && e.trialEnabled && !e.paidBefore && passPhase(wallPass) === 'off') ? 'fresh' : 'over';
}

/** True when this page should be covered. */
export function walled() {
  if (typeof location === 'undefined') return false;
  if (WALL_EXEMPT.test(pageName())) return false;
  /* An administrator is never walled, anywhere. The owner locked out of
     their own studio by their own paywall is a 2 a.m. incident, and the
     role is the SERVER's answer (studio_status().role, carried on the
     gate state) rather than anything the client decides. */
  try {
    const c = window.StudioCloud;
    if (c && c.getGateState && c.getGateState().role === 'admin') return false;
  } catch (e) { /* no cloud on this page: fall through */ }
  return !entitled();
}

/** Modules whose SECTION is on this page and in the document: a shelf's
 *  tabs (the Library's case studies, dissection, glossary) and, since
 *  the owner's three-plan split (11 Oct 2026), a stage module that is
 *  one section of a page shared with modules of a LOWER plan — Basic
 *  keeps Screen Time on reports.html while Cast Matrix, Sides and
 *  Reports lock as sections there. A page whose every module is locked
 *  is covered whole (pageLocked) and needs none of this.
 *
 *  A target NESTED in (or wrapping) the target of an ALLOWED module on
 *  the same page is not locked: breakdown.html's #breakdown is the scene
 *  cards inside #scenes, "the same cards read two ways", and hiding it
 *  would hide the Scene List a Basic plan includes. The nav mark
 *  (markLocked) still says PLAN on such a door. */
function tabsHere() {
  const here = file().replace(/\.html$/, '');
  const cands = [];
  const take = (m) => {
    const [f, frag] = (m.href || '').split('#');
    if (!frag || f.toLowerCase().replace(/\.html$/, '') !== here) return;
    const sec = document.getElementById(frag);
    if (sec) cands.push({ m, sec });
  };
  for (const s of shelves()) for (const m of s.modules) take(m);
  if (!pageLocked() && !pageGone()) for (const p of phases()) for (const m of p.modules) if (m.status !== 'planned') take(m);
  const open = cands.filter((c) => allowed(c.m.id) && !isDisabledEverywhere(c.m.id)).map((c) => c.sec);
  return cands.filter((c) => allowed(c.m.id)
    || !open.some((o) => o !== c.sec && (o.contains(c.sec) || c.sec.contains(o))));
}

/* THE TAB LOCK. The section keeps its id and its place in
   the tab strip; everything in it is hidden under the card
   (plan-gate.css) and comes back untouched when the plan changes.
   Exported because the library renders its tabs after this module has
   run, and calls it once they exist; the other pages re-render their
   sections whenever their data changes, so a rAF-throttled observer
   (watchSections, below) re-applies it while anything here is locked. */
export function lockTabs() {
  if (typeof document === 'undefined') return;
  for (const { m, sec } of tabsHere()) {
    /* Off for everybody: no card, no lock. The section stays in the
       document (its fields and words are still there) and tabs.js leaves
       it out of the strip. */
    const gone = isDisabledEverywhere(m.id);
    if (sec.hasAttribute('data-tab-off') !== gone) sec.toggleAttribute('data-tab-off', gone);
    if (gone) {
      const stale = sec.querySelector(':scope > .pg-lock-inline');
      if (stale) stale.remove();
      if (sec.hasAttribute('data-tab-lock')) sec.removeAttribute('data-tab-lock');
      continue;
    }
    const locked = !allowed(m.id);
    let card = sec.querySelector(':scope > .pg-lock-inline');
    if (sec.hasAttribute('data-tab-lock') !== locked) sec.toggleAttribute('data-tab-lock', locked);
    if (locked && !card) {
      card = h('div.pg-lock-inline', { role: 'region', 'aria-label': 'Not on your plan' }, [lockCard([m])]);
      sec.prepend(card);
    }
    if (!locked && card) card.remove();
  }
  watchSections();
}

/* Only while this page has a locked section: no plan known, or nothing
   locked here, means no observer at all. Writes nothing to storage. */
let _secObs = null;
let _secRaf = 0;
function watchSections() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  const need = anyLockedHere();
  if (need && !_secObs) {
    _secObs = new MutationObserver((recs) => {
      /* Only a section appearing or going matters (a page re-render);
         our own card inserts and every text change are not. */
      const sec = (n) => n.nodeType === 1 && (n.matches('section[id]') || !!n.querySelector('section[id]'));
      if (!recs.some((r) => [...r.addedNodes].some(sec) || [...r.removedNodes].some(sec))) return;
      if (_secRaf) return;
      _secRaf = requestAnimationFrame(() => { _secRaf = 0; lockTabs(); });
    });
    _secObs.observe(document.body, { childList: true, subtree: true });
  } else if (!need && _secObs) { _secObs.disconnect(); _secObs = null; }
}
function anyLockedHere() {
  const here = file().replace(/\.html$/, '');
  const on = (m) => { const [f, frag] = (m.href || '').split('#'); return !!frag && f.toLowerCase().replace(/\.html$/, '') === here && (!allowed(m.id) || isDisabledEverywhere(m.id)); };
  return shelves().some((s) => s.modules.some(on)) || phases().some((p) => p.modules.some(on));
}

let sentToPurchase = false;
function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  /* §32: nothing to buy, so no control offers to sell anything. */
  if (purchaseReq === false) root.dataset.purchases = 'off';
  else delete root.dataset.purchases;
  const existing = document.querySelector('.pg-lock');
  /* The wall outranks the module lock: there is no point telling
     somebody which tier a module is on when their trial has ended. */
  const wall = walled();
  /* THE ONE PAGE (owner, 28 Oct 2026): a walled person is SENT to the purchase
     page, which holds the plans, the pass and the refund announcement, rather
     than shown a copy of the offer on whatever page they asked for. The wall
     below stays as the fallback (a blocked navigation, a build with no
     purchase page), so nothing is ever left showing the studio. */
  /* window.__fmsKeepWall is a PROOF hook: prove:billing's wall checks are
     about the wall's own logic (the fallback), so they hold it in place. */
  if (wall && !sentToPurchase && typeof location !== 'undefined' && !window.__fmsKeepWall) {
    sentToPurchase = true;
    try { location.replace('purchase.html'); } catch (e) { /* draw the wall instead */ }
  }
  const gone = !wall && pageGone();
  const lock = !wall && (gone || pageLocked());
  if (wall || lock) {
    root.dataset.planLock = '1';
    root.toggleAttribute('data-paywall', wall);
    root.toggleAttribute('data-plan-gone', gone);   // plan-gate.css collapses main's height
    const want = wall ? 'pg-wall' : 'pg-lock';
    /* Swap when the KIND changes, not just when one is missing — a
       trial expiring while a module lock is on screen must replace it. */
    if (existing && (wall !== existing.classList.contains('pg-wall'))) existing.remove();
    if (existing && !wall && existing.hasAttribute('data-gone') !== gone) existing.remove();
    /* The wall's words follow the entitlement (a trial offered, or one
       that is over), so a wall drawn for the other case is redrawn —
       only when that changes, never on every refresh. */
    const kind = wall ? wallKind() : '';
    const cur = document.querySelector('.pg-wall');
    if (cur && cur.dataset.kind !== kind) cur.remove();
    if (wall) askWallPass();
    if (!document.querySelector('.' + want)) {
      const panel = wall ? wallPanel() : gone ? gonePanel() : lockPanel();
      if (wall) panel.dataset.kind = kind;
      document.body.append(panel);
      if (kind === 'pass') bindPassTimers(wallPass, { onEnd: () => apply() });
    }
  } else {
    delete root.dataset.planLock;
    root.removeAttribute('data-paywall');
    root.removeAttribute('data-plan-gone');
    if (existing) existing.remove();
  }
  lockTabs();
  markLocked();
}

/* ---- the marks ---------------------------------------------------- */
/* The flag says WHICH plan opens the door ("INTERMEDIATE"), not just
   that one does. The rows are read once (Billing caches them); until
   they answer, or if they cannot, the flag says PLAN as it always did —
   prove:billing reads .pg-flag by name and not by its text. */
let flagNames = null;          // module id -> plan name, once the rows answered
let flagAsked = false;
function flagName(id) { return (flagNames && flagNames[id]) || ''; }
function loadFlagNames() {
  if (flagAsked || !features) return;
  flagAsked = true;
  Billing.listPlans().then(() => {
    const out = {};
    const ids = new Set([...document.querySelectorAll('[data-module-id]')].map((el) => el.dataset.moduleId));
    const sold = Billing.listPlans().then((pl) => (pl || []).some((p) => p && p.active !== false && p.id !== 'free'), () => false);
    const none = new Set();
    return Promise.all([...ids].filter((id) => !allowed(id)).map((id) =>
      lowestPlanWith([id]).then((p) => {
        if (p) out[id] = p.name || Billing.planName(p.id);
        else none.add(id);
      }, () => {})))
      .then(() => sold)
      .then((ok) => { flagNames = out; offersNone = ok ? none : new Set(); markLocked(); lockTabs(); });
  }).catch(() => { flagAsked = false; });
}
export function markLocked(scope) {
  if (typeof document === 'undefined') return;
  (scope || document).querySelectorAll('[data-module-id]').forEach((el) => {
    /* A stage tab carries its lead module's id; the tab goes only when
       every module of the stage is off for everybody. Any other link goes
       with its module. Nothing is removed, only [hidden]. */
    const stage = el.classList.contains('sh-rail-stage') ? phases().find((p) => p.id === el.dataset.phase) : null;
    const gone = stage ? stage.modules.filter((m) => m.status !== 'planned').every((m) => isDisabledEverywhere(m.id))
                       : isDisabledEverywhere(el.dataset.moduleId);
    const box = stage ? (el.closest('.sh-rail-stagecell') || el) : el;
    /* Only ever WRITE hidden=true, and remember that this code did it:
       a row some other code hid (the palette's filter) is never un-hidden here. */
    if (gone) {
      if (!box.hidden) { box.hidden = true; box.setAttribute('data-pg-gone', ''); }
    } else if (box.hasAttribute('data-pg-gone')) {
      box.removeAttribute('data-pg-gone');
      box.hidden = false;
    }
    if (gone || (stage && isDisabledEverywhere(el.dataset.moduleId))) {
      el.classList.remove('is-locked');
      const f = el.querySelector(':scope > .pg-flag');
      if (f) f.remove();
      return;
    }
    const locked = !allowed(el.dataset.moduleId);
    el.classList.toggle('is-locked', locked);
    let flag = el.querySelector(':scope > .pg-flag');
    const name = locked ? flagName(el.dataset.moduleId) : '';
    const text = name ? name.toUpperCase() : 'PLAN';
    const title = name ? 'Comes with the ' + name + ' plan' : 'Not on your plan';
    if (locked && !flag) el.append(h('span.pg-flag', { text, title }));
    else if (locked && flag && flag.textContent !== text) { flag.textContent = text; flag.title = title; }
    if (!locked && flag) flag.remove();
  });
  tidyHeadings(scope || document);
  if (features && !flagNames) loadFlagNames();
}
/* A heading with nothing visible under it (every row off for everybody)
   goes too: group headings in the phone sheet and sub-headings in the
   sheet and the rail flyouts. Same rule as the rows: only this code's own
   hiding is ever undone. */
function tidyHeadings(root) {
  const rowOn = (n) => n.hasAttribute && n.hasAttribute('data-module-id') && !n.hidden;
  const set = (el, off) => {
    if (off) { if (!el.hidden) { el.hidden = true; el.setAttribute('data-pg-gone', ''); } }
    else if (el.hasAttribute('data-pg-gone')) { el.removeAttribute('data-pg-gone'); el.hidden = false; }
  };
  root.querySelectorAll('.mn-sub, .sh-fly-sub').forEach((hd) => {
    let any = false, rows = 0;
    for (let n = hd.nextElementSibling; n && !n.matches('.mn-sub, .sh-fly-sub'); n = n.nextElementSibling) {
      if (n.hasAttribute('data-module-id')) { rows++; if (!n.hidden) any = true; }
    }
    set(hd, rows > 0 && !any);
  });
  root.querySelectorAll('.mn-group[data-mn-phase]').forEach((g) => {
    const rows = [...g.querySelectorAll('[data-module-id]')];
    set(g, rows.length > 0 && !rows.some(rowOn));
  });
}

/* ---- wiring ------------------------------------------------------- */
if (typeof window !== 'undefined') {
  Store.subscribe('gate:changed', () => { refresh(); });
  Store.subscribe('billing:changed', () => { refresh(); });
  const hook = setInterval(() => {
    const c = window.StudioCloud;
    if (!c) return;
    clearInterval(hook);
    if (c.onAuth) c.onAuth(() => setTimeout(refresh, 0));
    refresh();
  }, 50);
  setTimeout(() => clearInterval(hook), 20000);

  /* §32. THE SWITCH REACHES PEOPLE ALREADY INSIDE. The owner turning
     "Purchases required" on must wall a tab that has been open all
     afternoon, not only the next page load — so billing_status() is
     re-read when the tab regains focus or becomes visible, and every
     few minutes while it is on screen. Throttled: focus and
     visibilitychange arrive together, and a refresh is a round trip.
     Signed out, refresh() makes no request at all. */
  let lastFocusRefresh = 0;
  const FOCUS_GAP = 5000, POLL = 4 * 60000;
  const again = () => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastFocusRefresh < FOCUS_GAP) return;
    lastFocusRefresh = now;
    refresh();
  };
  window.addEventListener('focus', again);
  /* §33. TWO TABS. A plan bought (or a trial started) in one tab used to
     reach the other only on its next focus — and not even then inside
     FOCUS_GAP — so a buyer switching back found the wall still up. A
     BroadcastChannel carries the bare fact "billing changed" to every
     tab of this origin; each re-reads billing_status() itself. Nothing
     is written to storage (verify's idle-write assertion), and the
     message carries no plan, order or payment. */
  try {
    if (typeof BroadcastChannel === 'function') {
      const ch = new BroadcastChannel('fms-billing');
      ch.onmessage = () => { lastFocusRefresh = Date.now(); refresh(); };
      /* A received message refreshes; it does not re-notify, so it is
         never posted back — two tabs cannot echo each other. */
      Store.subscribe('billing:changed', () => { try { ch.postMessage('changed'); } catch (e) { /* closed */ } });
    }
  } catch (e) { /* no channel: focus and the poll still reach the tab */ }
  document.addEventListener('visibilitychange', again);
  setInterval(() => { if (!document.hidden) { lastFocusRefresh = Date.now(); refresh(); } }, POLL);
}

/* journey.js asks this, without importing the module (it runs in Node tests). */
if (typeof window !== 'undefined') window.StudioPlan = { allowed, isDisabledEverywhere };

export default { passEndsAt, bindPassTimers, passClock, isDisabledEverywhere, OFF_BY_DEFAULT, offerFor, offerText, quotedOffer, nudgeText, nudgeAction, offerForLimit, limitKey, limitOffer, limitText, remindersFor, labelFor, serverNow, purchasesOff, allowed, aiUnlocked, guard, sampleOnly, entitlement, entitled, trialEndsAt, walled, currentPlan, refresh, moduleCatalogue, modulesHere, pageLocked, pageGone, lockTabs, markLocked, CAPABILITIES };
