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
import Billing from './billing.js';   // same chunk on every page; a dynamic import here moved nothing
import { trialLength } from './trial-time.js';
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
/** The one capability that is OFF unless the plan says true. */
export function sampleOnly() { return !!(features && features.sample_only === true); }

/** The question a CAPABILITY's entry point asks before it acts: true
 *  when allowed; otherwise a toast names the capability and the plan,
 *  with the way up, and the caller does nothing. `what` is the thing
 *  refused ("Drive backup"); it defaults to the capability's label.
 *  Fails open like allowed(): unknown is yes. */
export function guard(key, what) {
  if (allowed(key)) return true;
  const label = what || ((CAPABILITIES.find(([k]) => k === key) || [])[1]) || 'This';
  const where = ent && ent.reason === 'granted' ? 'the access the studio gave you'
              : plan === 'free' ? 'the free trial' : 'the ' + (planName || 'current') + ' plan';
  try {
    const ui = typeof window !== 'undefined' && window.StudioUI;
    if (ui && ui.toast) ui.toast(label + ' is not part of ' + where + '.', {
      type: 'info', action: 'SEE PLANS', onAction: () => { location.href = 'purchase.html'; } });
  } catch (e) { /* no chrome on this page: the refusal stands, silently */ }
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
      plan = (st && st.plan) || 'free';
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
          used: st.trial_used === true,
          trialEnabled: st.trial_enabled !== false,
          /* §33: the length a trial started NOW would get, for the
             wall's offer to somebody who never had one. */
          trialMinutes: Number(st.trial_minutes) > 0 ? Number(st.trial_minutes) : null,
          /* Anything paid, granted or refunded: start_trial() answers
             'paid' for these, so the wall does not offer a trial it
             would refuse. */
          paidBefore: Array.isArray(st.payments) && st.payments.some((p) => p && /^(paid|granted|refunded)$/.test(p.status))
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
  if (JSON.stringify([features, ent, purchaseReq]) !== prev) Store.notify('plan:changed', currentPlan());
  apply();
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
  const ms = modulesHere();
  return ms.length > 0 && ms.every((m) => !allowed(m.id));
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
/* `cta` is the card's primary link: once the plan is known it deep-links
   to purchase.html?plan=<id>, and for a signed-in buyer the server's
   own quote says what the step costs. Every part falls back to the plain
   sentence offline or signed out. */
function includedLine(ids, cta) {
  const top = Billing.planRank(plan) >= Billing.PLAN_ORDER.length - 1;
  const line = h('p.pg-lock-plan', { text: top ? '' : PAID_FALLBACK });
  lowestPlanWith(ids).then((p) => {
    if (!p) return;
    const name = p.name || Billing.planName(p.id);
    line.textContent = 'Included in the ' + name + ' plan.';
    if (cta) cta.href = 'purchase.html?plan=' + encodeURIComponent(p.id);
    const c = window.StudioCloud;
    if (!cta || !c || !c.getSession || !c.getSession()) return;
    Billing.quote(p.id, null).then((q) => {
      if (!q || !q.ok || !(q.amount_paise > 0)) return;
      cta.textContent = 'UPGRADE FOR ' + Billing.fmtPaise(q.amount_paise) + (q.credit_paise > 0 ? ' MORE' : '');
    }).catch(() => { /* the plain button stands */ });
  }).catch(() => { /* the fallback stands */ });
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
  return h('div.pg-lock', { role: 'region', 'aria-label': 'Not on your plan' }, [lockCard(modulesHere())]);
}

/* ---- the wall (§30) ----------------------------------------------
   The trial ran out and nothing was bought. This is NOT the module
   lock above: that one says "this corner is on a higher tier" and
   leaves the rest of the studio open. This says "the thirty minutes
   are over".

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
const WALL_EXEMPT = /^(settings|purchase|purchases|invite|start|screening|admin)$/;
const pageName = () => file().replace(/\.html$/, '');

function wallPanel() {
  const e = entitlement();
  const off = e.reason === 'off';
  /* §33. Somebody who is a member but never had a trial — e.g. one whose
     plan-less e-mail grant was revoked or ran out (while it stands they
     are 'granted' and never walled) — meets the wall on their first
     page. They are offered the trial everybody
     else gets rather than told one is "over". start_trial() decides; a
     refusal ('used', 'paid', 'disabled') is printed, never guessed. */
  const fresh = !off && !e.used && e.trialEnabled && !e.paidBefore;
  const len = trialLength(e.trialMinutes);
  const card = h('div.pg-lock-card.pg-wall-card', {}, [
    h('p.bd-eyebrow', { text: off ? 'The studio' : 'Your trial' }),
    h('h2.pg-lock-h', { text: off ? 'The studio is open to members.' : fresh ? 'Start your free trial.' : e.used ? 'Your free trial is over.' : 'Choose a plan to come in.' }),
    h('p.pg-lock-p', { text: off
      ? 'A plan opens the whole desk: your script, your breakdown, your schedule, your budget, your call sheets.'
      : fresh
        ? 'Read Dragon — a complete Tamil feature — from the inside' + (len ? ' for ' + len : '') + ', free, then choose a plan for your own film.'
        : 'You have been reading Dragon — a complete Tamil feature, scene by scene. A plan opens the same desk for your own film: your script, your breakdown, your schedule, your budget, your call sheets.' }),
    /* The promise the owner made, kept where it is visible rather than
       in a FAQ: nothing a person wrote is held hostage to a sale. */
    h('p.pg-lock-p.pg-wall-safe', { text: 'Everything you wrote is still here. Nothing has been deleted and nothing is locked away from you — download all of it, right now, with no plan.' }),
    h('div.pg-lock-actions', {}, [
      fresh ? h('button.btn.primary', { type: 'button', 'data-action': 'pg-start-trial', text: len ? 'START MY ' + len.toUpperCase() : 'START MY FREE TRIAL' }) : null,
      h('a.btn' + (fresh ? '' : '.primary'), { href: 'purchase.html', text: 'SEE PLANS' }),
      h('button.btn', { type: 'button', 'data-action': 'pg-export', text: 'DOWNLOAD MY WORK' }),
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
      say({ used: 'You have already had your trial on this account. A plan opens the studio for good.',
            paid: 'You have already bought a plan — try reloading the page.',
            disabled: 'Trials are not open at the moment. A plan opens the studio for good.' }[r && r.reason] || 'That did not start. Please try again.');
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
  });
}

function wallKind() {
  const e = entitlement();
  return e.reason === 'off' ? 'off' : (!e.used && e.trialEnabled && !e.paidBefore) ? 'fresh' : 'over';
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
  if (!pageLocked()) for (const p of phases()) for (const m of p.modules) if (m.status !== 'planned') take(m);
  const open = cands.filter((c) => allowed(c.m.id)).map((c) => c.sec);
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
  const need = !!features && anyLockedHere();
  if (need && !_secObs) {
    _secObs = new MutationObserver(() => {
      if (_secRaf) return;
      _secRaf = requestAnimationFrame(() => { _secRaf = 0; lockTabs(); });
    });
    _secObs.observe(document.body, { childList: true, subtree: true });
  } else if (!need && _secObs) { _secObs.disconnect(); _secObs = null; }
}
function anyLockedHere() {
  const here = file().replace(/\.html$/, '');
  const on = (m) => { const [f, frag] = (m.href || '').split('#'); return !!frag && f.toLowerCase().replace(/\.html$/, '') === here && !allowed(m.id); };
  return shelves().some((s) => s.modules.some(on)) || phases().some((p) => p.modules.some(on));
}

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
  const lock = !wall && pageLocked();
  if (wall || lock) {
    root.dataset.planLock = '1';
    root.toggleAttribute('data-paywall', wall);
    const want = wall ? 'pg-wall' : 'pg-lock';
    /* Swap when the KIND changes, not just when one is missing — a
       trial expiring while a module lock is on screen must replace it. */
    if (existing && (wall !== existing.classList.contains('pg-wall'))) existing.remove();
    /* The wall's words follow the entitlement (a trial offered, or one
       that is over), so a wall drawn for the other case is redrawn —
       only when that changes, never on every refresh. */
    const kind = wall ? wallKind() : '';
    const cur = document.querySelector('.pg-wall');
    if (cur && cur.dataset.kind !== kind) cur.remove();
    if (!document.querySelector('.' + want)) {
      const panel = wall ? wallPanel() : lockPanel();
      if (wall) panel.dataset.kind = kind;
      document.body.append(panel);
    }
  } else {
    delete root.dataset.planLock;
    root.removeAttribute('data-paywall');
    if (existing) existing.remove();
  }
  lockTabs();
  markLocked();
}

/* ---- the marks ---------------------------------------------------- */
export function markLocked(scope) {
  if (typeof document === 'undefined') return;
  (scope || document).querySelectorAll('[data-module-id]').forEach((el) => {
    const locked = !allowed(el.dataset.moduleId);
    el.classList.toggle('is-locked', locked);
    let flag = el.querySelector(':scope > .pg-flag');
    if (locked && !flag) el.append(h('span.pg-flag', { text: 'PLAN', title: 'Not on your plan' }));
    if (!locked && flag) flag.remove();
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

export default { serverNow, purchasesOff, allowed, guard, sampleOnly, entitlement, entitled, trialEndsAt, walled, currentPlan, refresh, moduleCatalogue, modulesHere, pageLocked, lockTabs, markLocked, CAPABILITIES };
