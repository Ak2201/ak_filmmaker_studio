/* ============================================================
   GROWTH ADMIN — the console's Growth tab (schema §22 onward)
   ------------------------------------------------------------
   Drawn by admin.html for an administrator, beside Billing:

     Referrals    what a friend gets and what a referrer earns (one
                  setting each), and every credit — owed, paid, void —
                  with a tick box per owed row and MARK PAID. The
                  console records the payout; the money moves outside
                  this app (bank, UPI).

     Trial        (§30) whether signing in buys thirty minutes or the
                  wall, how long, what an invite code buys instead,
                  and how much of the studio a trial shows.

     Price rise   (§30) the scheduled, self-firing price change: the
                  new price per tier, the date they share, and the
                  founding-buyer cap. This block is the one place in
                  the console that writes a PUBLIC PROMISE, so it
                  shows the owner the exact sentence the landing page
                  will print before anything is saved, and it refuses
                  a "rise" that is not a rise — on the client as well
                  as on the server, because the server's refusal
                  arrives after the owner has already decided.

   Every block is read through an admin_* RPC that re-checks the role;
   a section that has not run on the database yet says so in one line
   and the rest of the tab still draws.

   No inline handlers (CSP): delegate() on [data-gra-action] and
   [data-gra-form].
   ============================================================ */
import { errorSentence } from '../lib/gate.js';
import { h, delegate } from '../lib/dom.js';
import { fmtDate } from '../lib/admin-format.js';
import Billing, { fmtPaise, parseRupees, planName } from '../lib/billing.js';
import { fmtMinor } from '../lib/price-model.js';
import Growth, { isMissing } from '../lib/growth.js';
import '../styles/plans.css';
import '../styles/growth.css';
import { ask, askDanger } from './dialog.js';
import { minutesToHours, hoursToMinutes, trialLength } from '../lib/trial-time.js';
import { dataTable, errorState, emptyState } from './admin-kit.js';
import { funnel as funnelChart } from './admin-charts.js';
import { cohorts as fetchCohorts } from '../lib/admin-api.js';

let rerender = () => {};
const S = { state: 'idle', error: '', settings: null, credits: null, prices: null, usd: null, members: [], missing: {}, saved: '', granted: '' };

/* A "Saved." note clears itself IN PLACE. Re-rendering for it rebuilt
   every form on the console from its defaults 2.5s after a save, under
   whatever the next form was being filled in with. */
function clearNote(text) {
  for (const n of document.querySelectorAll('.ba-saved')) if (n.textContent === text) n.remove();
}
/* The price-rise sentence names a DAY, not a timestamp: "from 31
   October" is what a buyer can hold us to, and printing 18:29 UTC
   beside it invites an argument about the minute. */
const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '');
const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

/* Each read is allowed to fail on its own: one section not yet run on
   the database must not blank the others. */
async function settle(key, fn) {
  try { return await fn(); }
  catch (e) { if (isMissing(e)) { S.missing[key] = true; return null; } throw e; }
}
async function load() {
  S.state = 'loading'; S.error = ''; rerender();
  try {
    S.missing = {};
    S.settings = await settle('settings', Growth.admin.settings);
    S.credits = await settle('credits', () => Growth.admin.listReferralCredits());
    S.affiliates = await settle('affiliates', Growth.admin.affiliateReport);
    S.leads = await settle('leads', Growth.admin.leads);
    S.funnel = await settle('funnel', () => Growth.admin.funnel(S.from || null, S.to || null));
    /* §30. The same read the signed-out landing page makes, on
       purpose — see the note on Billing.priceNotice(). */
    S.prices = await settle('prices', Billing.priceNotice);
    /* The dollar side of the same rise (§31 / §56), READ ONLY here: the
       owner types dollar prices under Purchases → Tiers & grants. One
       date per plan; the dollar figure follows it. */
    S.usd = await Billing.priceNotice('USD').catch(() => null);
    /* The one-person trial grant needs somebody to pick. The gate's
       console already lists members and billing-admin.js already
       borrows that list for its own grant form — a third RPC that
       returned the same people would be a second answer to one
       question. */
    try {
      const c = window.StudioCloud;
      S.members = c && c.gate ? await c.gate.admin.listMembers() : [];
    } catch (e) { S.members = []; }
    S.state = 'ready';
  } catch (e) {
    S.error = errorSentence(e, 'The growth console could not load.'); S.state = 'error';
  } finally { rerender(); }
}

function referralBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Referrals' }));
  if (S.missing.settings || S.missing.credits) { sec.append(h('p.gt-meta', { text: 'Referral codes are not available on this database yet (schema section 22 has not run).' })); return; }
  const st = S.settings || {};
  const f = h('form.gr-panel', { 'data-gra-form': 'referral', autocomplete: 'off' });
  const kind = h('select', { id: 'graRewardKind', name: 'kind' }, [h('option', { value: 'pct', text: '% of what the friend pays' }), h('option', { value: 'paise', text: '₹ per purchase' })]);
  kind.value = Number.isInteger(st.referral_reward_paise) ? 'paise' : 'pct';
  f.append(h('div.gr-fields', {}, [
    h('div', {}, [h('label', { for: 'graFriendPct', text: 'Friend gets (% off)' }), h('input', { id: 'graFriendPct', name: 'friend', type: 'number', min: 1, max: 100, step: 1, value: String(st.referral_friend_pct ?? 10), required: true })]),
    h('div', {}, [h('label', { for: 'graRewardKind', text: 'Referrer earns' }), kind]),
    h('div', {}, [h('label', { for: 'graRewardValue', text: 'Reward (% or ₹)' }), h('input', { id: 'graRewardValue', name: 'reward', type: 'text', inputmode: 'decimal', required: true,
      value: Number.isInteger(st.referral_reward_paise) ? String(st.referral_reward_paise / 100) : String(st.referral_reward_pct ?? 10) })])
  ]));
  f.append(h('div.ba-actions', {}, [h('button.btn.primary', { type: 'submit', text: 'SAVE REFERRAL TERMS' }), S.saved === 'referral' ? h('span.ba-saved', { role: 'status', text: 'Saved.' }) : null].filter(Boolean)));
  f.append(h('p.gr-meta', { text: 'Every paying member has a REF- code; the referrer is owed once the friend’s payment confirms.' }));
  sec.append(f);

  const rows = S.credits || [];
  const owed = rows.filter((r) => r.status === 'owed');
  sec.append(h('p.gt-meta', { text: `Credits: ${rows.length} · owed ${fmtPaise(owed.reduce((n, r) => n + r.amount_paise, 0))} across ${new Set(owed.map((r) => r.referrer_user_id)).size} referrer(s).` }));
  if (!rows.length) return;
  const pay = h('form', { 'data-gra-form': 'payout' });
  const table = h('table.gt-table');
  table.append(h('thead', {}, [h('tr', {}, ['', 'When', 'Referrer', 'Code', 'Friend', 'Plan', 'Friend paid', 'Owed', 'Status'].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const r of rows) {
    tb.append(h('tr' + (r.status === 'owed' ? '' : '.is-off'), { 'data-credit': r.id }, [
      h('td', {}, [r.status === 'owed' ? h('input', { type: 'checkbox', name: 'credit', value: r.id, 'aria-label': `Select the credit for ${r.referrer_email}` }) : null].filter(Boolean)),
      h('td', { text: fmtDate(r.created_at) }),
      h('td', { text: r.referrer_email || '—' }),
      h('td', {}, [h('code.gt-codeval', { text: r.code })]),
      h('td', { text: r.friend_email || '—' }),
      h('td', { text: planName(r.plan_id) }),
      h('td', { text: fmtPaise(r.basis_paise) }),
      h('td', { text: fmtPaise(r.amount_paise) }),
      h('td', { text: r.status === 'paid' ? `paid ${fmtDate(r.paid_at)}${r.paid_note ? ' — ' + r.paid_note : ''}` : r.status })
    ]));
  }
  table.append(tb);
  pay.append(h('div.gt-scroll', {}, [table]));
  if (owed.length) {
    pay.append(h('div.gr-row', {}, [
      h('label.gr-check', { for: 'graPayNote', text: 'Payout note' }),
      h('input', { id: 'graPayNote', name: 'note', type: 'text', maxlength: 300, placeholder: 'UPI ref, date' }),
      h('button.btn', { type: 'submit', text: 'MARK SELECTED PAID' })
    ]));
  }
  sec.append(pay);
}

/* ---- the trial (§30) ---------------------------------------------
   Four knobs and one switch, and the switch is the one that changes
   what a stranger sees, so the block says in plain words what each
   position MEANS rather than printing the column name. */
function trialBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Trial' }));
  if (S.missing.settings) { sec.append(h('p.gt-meta', { text: 'Settings are not available on this database yet (schema section 22 has not run).' })); return; }
  const st = S.settings || {};
  /* The RPC is older than the columns, so "has section 30 run" is the
     presence of the key, not the presence of the function. */
  if (!('trial_enabled' in st)) { sec.append(h('p.gt-meta', { text: 'The trial is not available on this database yet (schema section 30 has not run).' })); return; }

  const on = st.trial_enabled !== false;
  const mins = Number(st.trial_minutes) || 30;
  /* HOURS (owner, 11 Oct 2026). The column is still minutes — every
     stored row stays valid, and a running trial's snapshot is untouched
     — but the owner sets and reads the length in hours. 30 minutes
     shows as 0.5. */
  const hours = minutesToHours(mins);
  const days = Number(st.code_trial_days) || 7;
  const f = h('form.gr-panel', { 'data-gra-form': 'trial', autocomplete: 'off' });

  const sw = h('input', { id: 'graTrialOn', name: 'enabled', type: 'checkbox' });
  sw.checked = on;
  f.append(h('div.gr-row', {}, [h('label.gr-check', { for: 'graTrialOn' }, [sw, h('span', { text: 'Signing in starts a trial' })])]));
  /* What the switch MEANS, stated for the position it is actually in.
     "trial_enabled: false" is a column name; "signing in lands
     straight on the paywall" is the decision being made. */
  f.append(h('p.gr-meta', { text: on
    ? `On: somebody who signs in gets a ${trialLength(mins)} free trial with the Dragon sample, then must buy a plan. An invite code gets ${days} day${days === 1 ? '' : 's'} instead.`
    : 'Off: signing in lands on the paywall. A trial already running keeps its clock.' }));

  const scope = h('select', { id: 'graTrialScope', name: 'scope' }, [
    h('option', { value: 'sample', text: 'The Dragon sample only' }),
    h('option', { value: 'full', text: 'The whole studio' })
  ]);
  scope.value = st.trial_scope === 'full' ? 'full' : 'sample';

  /* Which plan a 'full' trial borrows its features from. Blank is the
     server's own default; the list is the plans table, never typed. */
  const paid = ((S.prices && S.prices.plans) || []).filter((p) => p.id !== 'free');
  const planSel = h('select', { id: 'graTrialPlan', name: 'plan' },
    [h('option', { value: '', text: 'The usual default' })].concat(paid.map((p) => h('option', { value: p.id, text: p.name || planName(p.id) }))));
  planSel.value = st.trial_plan || '';

  f.append(h('div.gr-fields', {}, [
    h('div', {}, [h('label', { for: 'graTrialHours', text: 'Trial length (hours)' }), h('input', { id: 'graTrialHours', name: 'hours', type: 'number', min: Math.min(0.5, hours), max: 744, step: 'any', inputmode: 'decimal', value: String(hours), required: true })]),
    h('div', {}, [h('label', { for: 'graTrialDays', text: 'An invite code buys (days)' }), h('input', { id: 'graTrialDays', name: 'days', type: 'number', min: 1, max: 365, step: 1, value: String(days), required: true })]),
    h('div', {}, [h('label', { for: 'graTrialScope', text: 'A code trial shows' }), scope]),
    h('div', {}, [h('label', { for: 'graTrialPlan', text: 'A whole-studio trial borrows' }), planSel])
  ]));
  f.append(h('div.ba-actions', {}, [h('button.btn.primary', { type: 'submit', text: 'SAVE TRIAL TERMS' }),
    S.saved === 'trial' ? h('span.ba-saved', { role: 'status', text: 'Saved.' }) : null].filter(Boolean)));
  /* THE SENTENCE THAT STOPS A PANIC. The length is snapshotted on each
     member's row when their trial starts, so an owner who shortens it
     has not just cut everybody off mid-sentence — and an owner who
     lengthens it has not resurrected anybody. Without this line the
     obvious reading of the field is the frightening one. */
  f.append(h('p.gr-meta', { text: 'A new length applies to trials that start after you save; running trials keep theirs.' }));
  sec.append(f);

  /* ONE PERSON, MORE TIME. The only lever that reaches somebody whose
     trial has already run out, and the only one that is allowed to
     give a second trial: start_trial() refuses one on purpose, and an
     administrator typing a name here has already decided. */
  const g = h('form.gr-panel', { 'data-gra-form': 'granttrial', autocomplete: 'off' });
  const who = h('select', { id: 'graTrialWho', name: 'who' },
    [h('option', { value: '', text: 'Choose a member…' })].concat((S.members || []).map((m) =>
      h('option', { value: m.user_id, text: m.email + (m.disabled_at ? ' (disabled)' : '') }))));
  g.append(h('div.gr-fields', {}, [
    h('div', {}, [h('label', { for: 'graTrialWho', text: 'Who' }), who]),
    h('div', {}, [h('label', { for: 'graTrialGrantHours', text: 'Hours (up to a year)' }), h('input', { id: 'graTrialGrantHours', name: 'hours', type: 'number', min: 0.5, max: 8760, step: 'any', inputmode: 'decimal', value: '168', required: true })]),
    h('div', {}, [h('label', { for: 'graTrialGrantNote', text: 'Why' }), h('input', { id: 'graTrialGrantNote', name: 'note', type: 'text', maxlength: 300, placeholder: 'asked by e-mail, demo…' })])
  ]));
  g.append(h('div.ba-actions', {}, [h('button.btn', { type: 'submit', text: 'GRANT MORE TIME' }),
    S.granted ? h('span.ba-saved', { role: 'status', text: S.granted }) : null].filter(Boolean)));
  g.append(h('p.gr-meta', { text: 'A fresh whole-studio trial from now; not a plan. 168 hours is a week.' }));
  sec.append(h('h3.gt-h3', { text: 'Grant more time' }), g);
}

/* ---- the scheduled price rise (§30) -------------------------------
   The only block in this console that writes a PUBLIC PROMISE, which
   decides every choice in it: the owner reads the exact sentence
   before saving, the count of people already counted is on screen
   beside the cap that counts them, and a new price that is not above
   the current one is refused here as well as on the server. */
const paidPlans = () => ((S.prices && S.prices.plans) || []).filter((p) => p.id !== 'free' && Number(p.price_paise) > 0);
const rupees = (paise) => Math.round(Number(paise || 0) / 100);

/** An ISO instant as a `datetime-local` value, in the owner's own
 *  clock — they are choosing a date their customers will read. */
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The sentences the public page will print, built from whatever is in
 *  the form RIGHT NOW. Exported for the tests and because it is the
 *  only thing in this file that has to be exactly right: it is a
 *  rehearsal of a commitment.
 *
 *  `rows` are { name, now_paise, next_paise } and anything without a
 *  new price is simply not rising. */
export function risePreview(rows, at, cap) {
  const day = fmtDay(at);
  const out = [];
  for (const r of rows || []) {
    if (!r.next_paise) continue;
    let s = `${r.name}: ${fmtPaise(r.now_paise)} today. ${fmtPaise(r.next_paise)}`;
    s += day ? ` from ${day}` : ' — NO DATE SET, so nothing would ever change';
    /* "whichever comes first" is only true when there are two
       triggers. With no cap the sentence stops at the date. */
    if (cap) s += `, or once ${cap} ${cap === 1 ? 'person has' : 'people have'} joined — whichever comes first`;
    out.push(s + '.');
  }
  return out;
}

function priceRiseBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Price rise' }));
  if (S.missing.prices) { sec.append(h('p.gt-meta', { text: 'The scheduled price rise is not available on this database yet (schema section 30 has not run).' })); return; }
  const plans = paidPlans();
  if (!plans.length) { sec.append(h('p.gt-meta', { text: 'No paid plan is on sale, so there is no price to raise.' })); return; }
  const st = S.settings || {};
  const cap = Number.isInteger(st.price_rises_after_buyers) ? st.price_rises_after_buyers : null;
  const taken = S.prices && Number.isInteger(S.prices.seats_taken) ? S.prices.seats_taken : null;

  sec.append(h('p.gt-meta', { text: 'A rise fires by itself on the date or when the cap fills, and the landing page announces it. Schedule only what you mean.' }));

  const f = h('form.gr-panel', { 'data-gra-form': 'pricerise', autocomplete: 'off' });
  const dates = Array.from(new Set(plans.map((p) => p.next_price_at).filter(Boolean)));
  const fields = h('div.gr-fields');
  for (const p of plans) {
    const id = 'graNext_' + p.id;
    fields.append(h('div', {}, [
      h('label', { for: id, text: `${p.name || planName(p.id)} — ${fmtPaise(p.price_paise)} today` }),
      h('input', {
        id, name: 'next_' + p.id, type: 'text', inputmode: 'decimal',
        'data-now-paise': String(p.price_paise),
        'data-plan-name': p.name || planName(p.id),
        placeholder: 'no rise', value: p.next_price_paise ? String(rupees(p.next_price_paise)) : ''
      })
    ]));
  }
  fields.append(h('div', {}, [
    h('label', { for: 'graRiseAt', text: 'They all rise on' }),
    h('input', { id: 'graRiseAt', name: 'at', type: 'datetime-local', value: toLocalInput(dates[0] || '') })
  ]));
  fields.append(h('div', {}, [
    h('label', { for: 'graRiseCap', text: 'Or after this many buyers' }),
    h('input', { id: 'graRiseCap', name: 'cap', type: 'number', min: 1, step: 1, placeholder: 'no cap', value: cap == null ? '' : String(cap) })
  ]));
  f.append(fields);

  /* The count beside the cap, so "100" is a decision rather than a
     guess. The server withholds it once nothing is rising — a
     scarcity number with nothing scarce about it is the thing §30
     refuses to publish — and this says which of the two it is. */
  f.append(h('p.gr-seats', {
    text: taken == null
      ? 'Buyers are counted only while a rise is scheduled.'
      : `${taken} ${taken === 1 ? 'person has' : 'people have'} bought${cap == null ? '' : ` of the ${cap} the cap allows`}.`
  }));

  /* THE REHEARSAL. Built from the fields as they are typed, by the
     same function the save path checks, so the owner cannot save a
     sentence they have not read. aria-live, because the thing that
     changes when you type a price is a paragraph somewhere else. */
  const prev = h('div.gr-preview', { id: 'graPricePreview', role: 'status', 'aria-live': 'polite' });
  f.append(h('p.gr-preview-h', { text: 'What the public page will say' }), prev);

  f.append(h('div.ba-actions', {}, [h('button.btn.primary', { type: 'submit', text: 'SCHEDULE THE RISE' }),
    S.saved === 'pricerise' ? h('span.ba-saved', { role: 'status', text: 'Saved.' }) : null].filter(Boolean)));

  if (dates.length > 1) f.append(h('p.gr-msg.is-error', { text: 'The tiers are currently scheduled for ' + dates.length + ' different dates. Saving this form puts them all on the one above.' }));
  sec.append(f);

  const rising = plans.filter((p) => p.rising);
  if (rising.length) {
    const ul = h('ul.gr-list');
    for (const p of rising) {
      ul.append(h('li', {}, [
        h('span', { text: `${p.name || planName(p.id)}: ${fmtPaise(p.price_paise)} → ${fmtPaise(p.next_price_paise)} on ${fmtWhen(p.next_price_at)}${usdRiseText(p.id)}  ` }),
        h('button.btn', { type: 'button', 'data-gra-action': 'price-cancel', 'data-plan': p.id, text: 'CANCEL THE RISE' })
      ]));
    }
    sec.append(h('p.gt-meta', { text: 'Scheduled now:' }), ul);
  } else {
    sec.append(h('p.gt-meta', { text: 'No rise is scheduled.' }));
  }
  /* Draw the preview once from the values already in the fields, so a
     block that opens with a rise already scheduled shows the promise
     being kept rather than an empty box. */
  paintPreview(f);
}

/** Read the price-rise form and repaint the rehearsal. The one place
 *  the client-side refusal lives, so the preview and the save agree by
 *  construction — two opinions about whether a rise is a rise is the
 *  shape of bug CLAUDE.md's money-parser note is about. */
function readRise(form) {
  const rows = [];
  const errors = [];
  for (const input of form.querySelectorAll('input[name^="next_"]')) {
    const raw = String(input.value || '').trim();
    const now = Number(input.dataset.nowPaise) || 0;
    const name = input.dataset.planName || input.name.slice(5);
    if (!raw) { rows.push({ id: input.name.slice(5), name, now_paise: now, next_paise: 0 }); continue; }
    const paise = parseRupees(raw);
    if (!paise) { errors.push(`"${raw}" is not a rupee amount.`); continue; }
    /* ABOVE the price being charged today, not above the row's
       historical list price. Once a rise has fired, the table still
       holds the old lower figure and the server compares against
       THAT — so this check is the stricter of the two, deliberately:
       a second rise must clear what people are paying now. */
    if (paise <= now) { errors.push(`${name}: ${fmtPaise(paise)} is not above ${fmtPaise(now)}. A "rise" that is not a rise is the one thing this cannot be used for.`); continue; }
    rows.push({ id: input.name.slice(5), name, now_paise: now, next_paise: paise });
  }
  const atRaw = String((form.elements.at && form.elements.at.value) || '').trim();
  const at = atRaw ? new Date(atRaw) : null;
  const capRaw = String((form.elements.cap && form.elements.cap.value) || '').trim();
  const cap = capRaw ? parseInt(capRaw, 10) : null;
  if (capRaw && !(cap >= 1)) errors.push('A founding-seat cap is a whole number of people, at least 1 — or empty for no cap.');
  const anyRise = rows.some((r) => r.next_paise);
  if (anyRise && !at) errors.push('A rise needs a date. Without one nothing would ever change and the notice would be untrue.');
  if (at && isNaN(at.getTime())) errors.push('That date could not be read.');
  else if (at && at.getTime() <= Date.now()) errors.push('That date has already passed, so the new price would take effect the moment you save it.');
  return { rows, at: at && !isNaN(at.getTime()) ? at : null, cap, errors, anyRise };
}

function paintPreview(form) {
  const box = form.querySelector('#graPricePreview');
  if (!box) return;
  const { rows, at, cap, errors, anyRise } = readRise(form);
  const kids = [];
  for (const e of errors) kids.push(h('p.gr-msg.is-error', { text: e }));
  const lines = risePreview(rows, at, cap);
  if (lines.length) lines.forEach((l) => kids.push(h('p.gr-preview-line', { text: l })));
  else if (!errors.length) kids.push(h('p.gr-meta', { text: anyRise ? '' : 'Nothing is rising, so the page will show the plain price and no countdown.' }));
  box.replaceChildren(...kids);
}

function affiliateBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Affiliates' }));
  if (S.missing.affiliates) { sec.append(h('p.gt-meta', { text: 'Affiliate reports are not available on this database yet (schema section 23 has not run).' })); return; }
  const rows = S.affiliates || [];
  sec.append(h('p.gt-meta', { text: 'A promo code with a commission (Purchases → Promo codes). Revenue is net; refunds drop out.' }));
  if (!rows.length) { sec.append(h('p.gt-meta', { text: 'No affiliate codes yet.' })); return; }
  const table = h('table.gt-table');
  table.append(h('thead', {}, [h('tr', {}, ['Code', 'Gives', 'Rate', 'Orders', 'Revenue (net)', 'Discount given', 'Commission due', 'Refunded', 'Last order', ''].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const a of rows) {
    tb.append(h('tr' + (a.active ? '' : '.is-off'), { 'data-affiliate': a.code }, [
      h('td', {}, [h('code.gt-codeval', { text: a.code }), a.note ? h('span.gt-meta', { text: ' ' + a.note }) : null].filter(Boolean)),
      h('td', { text: Number.isInteger(a.percent_off) ? `${a.percent_off}% off` : Number.isInteger(a.amount_off_paise) ? `${fmtPaise(a.amount_off_paise)} off` : '—' }),
      h('td', { text: `${Number(a.commission_pct)}%` }),
      h('td', { text: String(a.orders) }),
      h('td', { text: byCurrency(a.revenue_paise, a.usd_revenue_minor) }),
      h('td', { text: byCurrency(a.discount_paise, a.usd_discount_minor) }),
      h('td', {}, [h('strong', { text: byCurrency(a.commission_due_paise, a.usd_commission_due_minor) })]),
      h('td', { text: String(a.refunded) }),
      h('td', { text: fmtDate(a.last_order_at) }),
      h('td', {}, [h('button.btn', { type: 'button', 'data-gra-action': 'aff-orders', 'data-code': a.code, text: S.openAff === a.code ? 'HIDE ORDERS' : 'ORDERS' })])
    ]));
    if (S.openAff === a.code) {
      const orders = S.affOrders || [];
      tb.append(h('tr', {}, [h('td', { colspan: 10 }, [orders.length
        ? h('ul.gr-list', {}, orders.map((o) => h('li' + (o.status === 'refunded' ? '.is-off' : ''), { text: `${fmtDate(o.paid_at)} — ${o.email || '—'} · ${planName(o.plan_id)} · paid ${fmtMinor(o.amount_paise, orderCur(o))}${o.discount_paise ? ` (${fmtMinor(o.discount_paise, orderCur(o))} off)` : ''}${o.status === 'refunded' ? ' · refunded' : ''}` })))
        : h('p.gt-meta', { text: S.affOrders ? 'No orders yet.' : 'Loading…' })])]));
    }
  }
  table.append(tb);
  sec.append(h('div.gt-scroll', {}, [table]));
  const due = rows.reduce((n, a) => n + Number(a.commission_due_paise || 0), 0);
  const dueUsd = rows.reduce((n, a) => n + Number(a.usd_commission_due_minor || 0), 0);
  sec.append(h('p.gt-meta', { text: `Commission due across all affiliates: ${byCurrency(due, dueUsd)}.` }));
}

/* §56: an affiliate code can sell in both currencies. The report keeps the
   rupee columns and adds a dollar side; the two are never added together. */
const orderCur = (o) => (o && o.currency === 'USD' ? 'USD' : 'INR');
function byCurrency(inrPaise, usdCents) {
  const inr = fmtPaise(Number(inrPaise || 0));
  const usd = Number(usdCents || 0);
  return usd > 0 ? `${inr} + ${fmtMinor(usd, 'USD')}` : inr;
}

const FUNNEL_LABEL = { landing_view: 'Start page visits', pricing_view: 'Reached pricing', invite_request: 'Invite requests', signup: 'Sign-ups', checkout_start: 'Checkouts started', purchase: 'Purchases' };
const csvCell = (v) => { const t = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(t) ? "'" + t.replace(/"/g, '""') : t.replace(/"/g, '""'); };
export function leadsCsv(rows) {
  return ['email,source,created_at,consent_text'].concat(rows.map((r) => [r.email, r.source, r.created_at, r.consent_text].map((c) => '"' + csvCell(c) + '"').join(','))).join('\r\n');
}

function leadsBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Leads' }));
  if (S.missing.leads) { sec.append(h('p.gt-meta', { text: 'Leads are not available on this database yet (schema section 29 has not run).' })); return; }
  const rows = S.leads || [];
  sec.append(h('p.gt-meta', { text: `${rows.length} address${rows.length === 1 ? '' : 'es'} from “Get launch offers”, each with its consent.` }));
  if (!rows.length) return;
  sec.append(h('button.btn', { type: 'button', 'data-gra-action': 'leads-csv', text: 'EXPORT CSV' }));
  const table = h('table.gt-table');
  table.append(h('thead', {}, [h('tr', {}, ['When', 'E-mail', 'Source'].map((t) => h('th', { scope: 'col', text: t })))]));
  table.append(h('tbody', {}, rows.slice(0, 200).map((r) => h('tr', {}, [h('td', { text: fmtDate(r.created_at) }), h('td', { text: r.email }), h('td', { text: r.source })]))));
  sec.append(h('div.gt-scroll', {}, [table]));
  if (rows.length > 200) sec.append(h('p.gt-meta', { text: `Showing the newest 200 of ${rows.length}; the CSV has them all.` }));
}

function funnelBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Funnel' }));
  if (S.missing.funnel) { sec.append(h('p.gt-meta', { text: 'Funnel counts are not available on this database yet (schema section 29 has not run).' })); return; }
  sec.append(h('p.gt-meta', { text: 'Anonymous daily totals; Do Not Track visits are left out, so a floor.' }));
  const rows = S.funnel || [];
  const top = Number((rows[0] || {}).total) || 0;
  const table = h('table.gt-table');
  table.append(h('thead', {}, [h('tr', {}, ['Step', 'Count', 'Of start-page visits'].map((t) => h('th', { scope: 'col', text: t })))]));
  table.append(h('tbody', {}, rows.map((r) => h('tr', { 'data-funnel': r.name }, [
    h('td', { text: FUNNEL_LABEL[r.name] || r.name }), h('td', { text: String(r.total) }),
    h('td', { text: top && r.name !== 'landing_view' ? `${Math.round((Number(r.total) / top) * 1000) / 10}%` : '—' })
  ]))));
  sec.append(h('div.gt-scroll', {}, [table]));
}

/* ---- cohorts (schema §43, admin_cohorts) --------------------------
   Stepped funnel and conversion by signup week and by source, from the
   server's derived counts. Each stage counts people who REACHED it, on its
   own (a buyer who never held a trial is still "paid"), so the funnel bars
   can rise as well as fall and the page says so. `active in trial` only
   sees work that SYNCED, so it undercounts anybody without cloud sync.

   There is no time-based retention triangle: that would need a per-person
   activity record kept week after week, which the usage counters are built
   not to have. The grid below is conversion by signup week instead — the
   share of each week's sign-ups that reached each stage.

   Loaded on its own and failing on its own: an error here never blanks the
   rest of the Growth tab. */
const COHORT = { weeks: 12, phase: 'idle', data: null, error: '' };
const STAGE_LABEL = { signed_up: 'Signed up', members: 'Became a member', trial_started: 'Started a trial', active_in_trial: 'Active in trial', checkout_started: 'Started checkout', paid: 'Paid', refunded: 'Refunded' };
const WEEK_CHOICES = [8, 12, 26];

async function loadCohorts() {
  if (COHORT.phase === 'loading') return;
  COHORT.phase = 'loading'; COHORT.error = '';
  try {
    const data = await fetchCohorts(window.StudioCloud, COHORT.weeks);
    COHORT.data = data; COHORT.phase = 'ok';
  } catch (e) {
    COHORT.phase = 'error';
    COHORT.error = isMissing(e) ? 'The database has no admin_cohorts() yet \u2014 schema section 43 has not been run on it.' : errorSentence(e, 'The server did not say why.');
  }
  rerender();
}

const pct = (v, of) => (Number(of) ? Math.round((Number(v) / Number(of)) * 1000) / 10 : 0);

function cohortsBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Cohorts and the trial funnel' }));
  if (COHORT.phase === 'idle') loadCohorts();
  if (COHORT.phase === 'error') { sec.append(errorState({ title: 'Cohorts could not load', why: COHORT.error, onRetry: () => { COHORT.phase = 'idle'; rerender(); } })); return; }
  if (COHORT.phase !== 'ok' || !COHORT.data) { sec.append(h('p.gt-meta', { text: 'Counting cohorts…' })); return; }
  const d = COHORT.data;
  const t = d.totals || {};
  sec.append(h('div.us-bar', { role: 'group', 'aria-label': 'Cohort window' }, [
    h('span.gt-meta', { text: 'Sign-up window' }),
    ...WEEK_CHOICES.map((w) => h('button.ad-chip', { type: 'button', 'data-gra-action': 'cohort-weeks', 'data-weeks': String(w), 'aria-pressed': String(COHORT.weeks === w), text: w + ' weeks' }))
  ]));
  sec.append(h('p.gt-meta', { text: `People who signed up from ${d.since} to ${d.until}. Each step counts the people who reached it, on its own; none is forced to imply the one before, so a step can be larger than the one above it. "Active in trial" only sees work that synced to an account, so it undercounts people who write offline.` }));
  if (!Number(t.signed_up)) { sec.append(emptyState({ title: 'Nobody signed up in this window', body: 'Try a longer window.' })); return; }
  const stages = (d.stages || []).filter((k) => k !== 'refunded');
  sec.append(funnelChart(stages.map((k) => ({ label: STAGE_LABEL[k] || k, value: Number(t[k]) || 0 })), { label: 'Signed up to paid' }));
  sec.append(h('p.gt-meta', { text: `${Number(t.refunded) || 0} of ${Number(t.paid) || 0} paying ${Number(t.paid) === 1 ? 'person was' : 'people were'} refunded.` }));

  const weeks = d.by_week || [];
  const cols = stages.filter((k) => k !== 'signed_up');
  sec.append(h('h4.gt-h3', { text: 'Conversion by sign-up week' }));
  sec.append(dataTable({
    caption: 'Percent of each sign-up week that reached each step', rows: weeks, rowId: (w) => w.week_start,
    columns: [
      { key: 'week_start', label: 'Week of', render: (w) => w.week_start },
      { key: 'signed_up', label: 'Signed up', align: 'end', render: (w) => w.signed_up },
      ...cols.map((k) => ({ key: k, label: STAGE_LABEL[k] || k, align: 'end', render: (w) => (Number(w.signed_up) ? `${pct(w[k], w.signed_up)}%` : '\u2014'), title: (w) => `${w[k]} of ${w.signed_up}` }))
    ],
    empty: { title: 'No weeks', body: 'No sign-ups in the window.' }
  }));
  sec.append(h('p.gt-meta', { text: 'Each cell is the share of that week\u2019s sign-ups that reached the step. Recent weeks are still converting, so they read lower than they will.' }));

  const mk = (key, label) => dataTable({
    caption: label, rows: d['by_' + key] || [], rowId: (r) => r[key],
    columns: [
      { key, label: key === 'source' ? 'Came in by' : 'Promo kind', render: (r) => r[key] },
      { key: 'signed_up', label: 'Signed up', align: 'end', render: (r) => r.signed_up },
      { key: 'trial_started', label: 'Trial', align: 'end', render: (r) => `${r.trial_started} (${pct(r.trial_started, r.signed_up)}%)` },
      { key: 'checkout_started', label: 'Checkout', align: 'end', render: (r) => `${r.checkout_started} (${pct(r.checkout_started, r.signed_up)}%)` },
      { key: 'paid', label: 'Paid', align: 'end', render: (r) => `${r.paid} (${pct(r.paid, r.signed_up)}%)` },
      { key: 'refunded', label: 'Refunded', align: 'end', render: (r) => r.refunded }
    ],
    empty: { title: 'Nothing to compare', body: 'No sign-ups in the window.' }
  });
  sec.append(h('h4.gt-h3', { text: 'By source' }), mk('source', 'Source: a standard invite code, or how the trial began; "none" never started one'));
  sec.append(h('h4.gt-h3', { text: 'By promo attribution' }), mk('attribution', 'The kind of code on the first payment'));
}

export function growthAdminSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('growth', 'Growth', 'The trial, the price, referrals, affiliates, leads and the funnel.', '');
  if (S.state === 'idle') load();
  if (S.error) sec.append(h('p.gt-error', { role: 'alert', text: S.error }));
  if (S.state !== 'ready') { sec.append(h('p.gt-meta', { text: S.state === 'loading' ? 'Loading…' : '' })); return sec; }
  trialBlock(sec);
  priceRiseBlock(sec);
  referralBlock(sec);
  affiliateBlock(sec);
  leadsBlock(sec);
  funnelBlock(sec);
  cohortsBlock(sec);
  sec.append(h('button.btn.ad-refresh', { type: 'button', 'data-gra-action': 'reload', text: 'REFRESH' }));
  return sec;
}

export function wireGrowthAdmin(render) { rerender = render || (() => {}); }
/** The trial's settings for the console's Overview; null until loaded. */
export function growthSnapshot() { return S.state === 'ready' && !S.missing.settings ? (S.settings || {}) : null; }

delegate(document, 'submit', '[data-gra-form="referral"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const friend = parseInt(String(f.get('friend') || ''), 10);
  const raw = String(f.get('reward') || '').trim();
  const patch = { referral_friend_pct: friend };
  if (f.get('kind') === 'paise') {
    const p = parseRupees(raw);
    if (!p) { toast(`"${raw}" is not a rupee amount.`, 'error'); return; }
    patch.referral_reward_paise = p;
  } else {
    const pct = parseInt(raw, 10);
    if (!(pct >= 1 && pct <= 100) || String(pct) !== raw) { toast(`"${raw}" is not a whole percentage from 1 to 100.`, 'error'); return; }
    patch.referral_reward_pct = pct;
  }
  try {
    S.settings = await Growth.admin.setSettings(patch);
    S.saved = 'referral'; rerender();
    setTimeout(() => { S.saved = ''; clearNote('Saved.'); }, 2500);
  } catch (err) { toast(errorSentence(err, 'The referral terms were not saved.'), 'error'); }
});

/* ---- the trial (§30) ---------------------------------------------- */
delegate(document, 'submit', '[data-gra-form="trial"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const mins = hoursToMinutes(f.get('hours'));
  const days = parseInt(String(f.get('days') || ''), 10);
  if (!(mins >= 1 && mins <= 44640)) { toast('A trial lasts up to 744 hours (31 days); give it at least a minute.', 'error'); return; }
  if (!(days >= 1 && days <= 365)) { toast('An invite code buys between 1 and 365 days.', 'error'); return; }
  const patch = {
    trial_enabled: f.get('enabled') != null,
    trial_minutes: mins,
    code_trial_days: days,
    trial_scope: String(f.get('scope') || 'sample'),
    /* An explicit null CLEARS it — that is the server's contract for
       this key, and '' would be read as a plan id that does not exist. */
    trial_plan: String(f.get('plan') || '') || null
  };
  try {
    S.settings = await Growth.admin.setSettings(patch);
    S.saved = 'trial'; rerender();
    setTimeout(() => { S.saved = ''; clearNote('Saved.'); }, 2500);
  } catch (err) { toast(errorSentence(err, 'The trial terms were not saved.'), 'error'); }
});

delegate(document, 'submit', '[data-gra-form="granttrial"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const whoId = String(f.get('who') || '');
  const mins = hoursToMinutes(f.get('hours'));
  if (!whoId) { toast('Choose who the time is for.', 'error'); return; }
  if (!(mins >= 30 && mins <= 525600)) { toast('Between half an hour and a year (8760 hours).', 'error'); return; }
  try {
    await Billing.admin.grantTrial(whoId, mins, String(f.get('note') || '').trim());
    S.granted = `Granted — ${trialLength(mins)}, starting now.`;
    rerender();
    { const note = S.granted; setTimeout(() => { if (S.granted === note) S.granted = ''; clearNote(note); }, 4000); }
  } catch (err) { toast(errorSentence(err, 'The time was not granted.'), 'error'); }
});

/* ---- the price rise (§30) ------------------------------------------
   Every keystroke repaints the rehearsal; the submit refuses exactly
   what the rehearsal refused, because both call readRise(). */
delegate(document, 'input', '[data-gra-form="pricerise"]', (e, form) => paintPreview(form));
delegate(document, 'change', '[data-gra-form="pricerise"]', (e, form) => paintPreview(form));

delegate(document, 'submit', '[data-gra-form="pricerise"]', async (e, form) => {
  e.preventDefault();
  const { rows, at, cap, errors, anyRise } = readRise(form);
  paintPreview(form);
  if (errors.length) { toast(errors[0], 'error'); return; }
  const lines = risePreview(rows, at, cap);
  /* The last gate before a public promise: the owner confirms the
     sentence itself, not "save changes?". */
  if (lines.length && !await ask('This will be shown to everyone, and it will happen by itself:\n\n' + lines.join('\n') + '\n\nSchedule it?')) return;
  try {
    /* The cap first: it is one of the two triggers the sentence names,
       and a tier saved against a cap that failed to save would be
       advertising a condition that does not exist. */
    if ((S.settings || {}).price_rises_after_buyers !== cap) {
      S.settings = await Growth.admin.setSettings({ price_rises_after_buyers: cap });
    }
    for (const r of rows) {
      /* A blank field is "leave this tier alone", never "cancel" —
         cancelling is its own button, because a rise withdrawn by an
         empty text box is a promise broken by accident. */
      if (!r.next_paise) continue;
      S.prices = await Billing.admin.setNextPrice(r.id, r.next_paise, at.toISOString());
    }
    if (!anyRise) S.prices = await Billing.priceNotice();
    await refreshUsd();
    S.saved = 'pricerise'; rerender();
    setTimeout(() => { S.saved = ''; clearNote('Saved.'); }, 2500);
  } catch (err) { toast(errorSentence(err, 'The price rise was not scheduled.'), 'error'); await load(); }
});

/** " · in dollars $19 → $29", or " · in dollars $19, no dollar rise
 *  set", or '' when the plan is not sold in dollars. Read from
 *  price_notice('USD'); nothing typed here. */
function usdRiseText(planId) {
  const row = S.usd && Array.isArray(S.usd.plans) ? S.usd.plans.find((x) => x && x.id === planId) : null;
  if (!row || row.display_currency !== 'USD' || !(row.display_minor > 0)) return '';
  return row.display_next_minor > 0
    ? ` · in dollars ${fmtMinor(row.display_minor, 'USD')} → ${fmtMinor(row.display_next_minor, 'USD')}`
    : ` · in dollars ${fmtMinor(row.display_minor, 'USD')}, no dollar rise set (Tiers & grants)`;
}
const refreshUsd = async () => { S.usd = await Billing.priceNotice('USD').catch(() => S.usd); };

delegate(document, 'click', '[data-gra-action="price-cancel"]', async (e, el) => {
  const id = el.dataset.plan;
  if (!await askDanger('Cancel the scheduled rise for this plan?\n\nThe price stays where it is and the landing page stops saying it will change.')) return;
  try {
    S.prices = await Billing.admin.setNextPrice(id, null, null);
    await refreshUsd();
    rerender();
  } catch (err) { toast(errorSentence(err, 'The rise was not cancelled.'), 'error'); }
});

delegate(document, 'submit', '[data-gra-form="payout"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const ids = f.getAll('credit').map(String);
  if (!ids.length) { toast('Tick the credits you have paid out.', 'error'); return; }
  try {
    const n = await Growth.admin.markReferralPaid(ids, String(f.get('note') || '').trim());
    toast(`Marked ${n} credit${n === 1 ? '' : 's'} paid.`);
    await load();
  } catch (err) { toast(errorSentence(err, 'The credits were not marked.'), 'error'); }
});

delegate(document, 'click', '[data-gra-action="aff-orders"]', async (e, el) => {
  const code = el.dataset.code;
  if (S.openAff === code) { S.openAff = ''; S.affOrders = null; rerender(); return; }
  S.openAff = code; S.affOrders = null; rerender();
  try { S.affOrders = await Growth.admin.affiliateOrders(code); }
  catch (err) { S.affOrders = []; toast(errorSentence(err, 'The orders could not load.'), 'error'); }
  rerender();
});

delegate(document, 'click', '[data-gra-action="leads-csv"]', () => {
  const blob = new Blob([leadsCsv(S.leads || [])], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'leads.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

delegate(document, 'click', '[data-gra-action="cohort-weeks"]', (e, el) => {
  const w = Number(el.dataset.weeks);
  if (!WEEK_CHOICES.includes(w) || w === COHORT.weeks) return;
  COHORT.weeks = w; COHORT.phase = 'idle'; rerender();
});

delegate(document, 'click', '[data-gra-action="reload"]', () => { COHORT.phase = 'idle'; load(); });

export default { growthAdminSection, wireGrowthAdmin };
