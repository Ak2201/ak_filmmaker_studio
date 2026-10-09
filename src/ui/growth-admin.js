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
import { h, delegate } from '../lib/dom.js';
import Billing, { fmtPaise, parseRupees, planName } from '../lib/billing.js';
import Growth, { isMissing } from '../lib/growth.js';
import '../styles/plans.css';
import '../styles/growth.css';

let rerender = () => {};
const S = { state: 'idle', error: '', settings: null, credits: null, prices: null, members: [], missing: {}, saved: '', granted: '' };
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
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
    S.error = e.message || 'The growth console could not load.'; S.state = 'error';
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
  f.append(h('p.gr-meta', { text: 'Every member who has paid for a plan gets a REF- code. A friend’s purchase with it is discounted by the first number; once that payment is confirmed the referrer is owed the second. A new friend percentage applies to every existing referral code. Self-referral is refused by the server.' }));
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
  const days = Number(st.code_trial_days) || 7;
  const f = h('form.gr-panel', { 'data-gra-form': 'trial', autocomplete: 'off' });

  const sw = h('input', { id: 'graTrialOn', name: 'enabled', type: 'checkbox' });
  sw.checked = on;
  f.append(h('div.gr-row', {}, [h('label.gr-check', { for: 'graTrialOn' }, [sw, h('span', { text: 'Signing in starts a trial' })])]));
  /* What the switch MEANS, stated for the position it is actually in.
     "trial_enabled: false" is a column name; "signing in lands
     straight on the paywall" is the decision being made. */
  f.append(h('p.gr-meta', { text: on
    ? `On: somebody who signs in gets ${mins} minute${mins === 1 ? '' : 's'} with the Dragon sample before the wall. An invite code gets ${days} day${days === 1 ? '' : 's'} instead.`
    : 'Off: signing in lands straight on the paywall. Nobody new looks around first, and nobody already inside is affected — a trial already running keeps running until its own clock ends.' }));

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
    h('div', {}, [h('label', { for: 'graTrialMins', text: 'Trial length (minutes)' }), h('input', { id: 'graTrialMins', name: 'minutes', type: 'number', min: 1, max: 44640, step: 1, value: String(mins), required: true })]),
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
  f.append(h('p.gr-meta', { text: 'A new length applies to trials that START after you save. Everyone already in one keeps the length they were given — the clock is written on their row, not read from this field — so shortening it here cannot end a trial that is running, and lengthening it cannot bring an expired one back. To change it for ONE person, use Grant more time below.' }));
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
    h('div', {}, [h('label', { for: 'graTrialGrantMins', text: 'Minutes (up to a year)' }), h('input', { id: 'graTrialGrantMins', name: 'minutes', type: 'number', min: 1, max: 525600, step: 1, value: '10080', required: true })]),
    h('div', {}, [h('label', { for: 'graTrialGrantNote', text: 'Why' }), h('input', { id: 'graTrialGrantNote', name: 'note', type: 'text', maxlength: 300, placeholder: 'asked by e-mail, demo…' })])
  ]));
  g.append(h('div.ba-actions', {}, [h('button.btn', { type: 'submit', text: 'GRANT MORE TIME' }),
    S.granted ? h('span.ba-saved', { role: 'status', text: S.granted }) : null].filter(Boolean)));
  g.append(h('p.gr-meta', { text: 'Grant more time starts a FRESH trial from now, at the whole studio’s scope, however many trials this person has had. It does not grant a plan and it is not a payment — to put somebody on a tier for good, use Grant a plan under Billing. 10080 minutes is a week.' }));
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

  sec.append(h('p.gt-meta', { text: 'A rise set here FIRES BY ITSELF — the moment the date passes, or the moment the cap fills, the checkout charges the new price with nobody pressing anything. That is what makes the notice on the landing page a price announcement rather than false urgency, which is a prohibited practice. Say it only if you mean it; the date and the cap are both real and both enforced by the same function that charges the card.' }));

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
      ? 'The number of people who have bought is published only while a rise is actually scheduled, so it is not shown here yet. Save a rise and it appears.'
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
        h('span', { text: `${p.name || planName(p.id)}: ${fmtPaise(p.price_paise)} → ${fmtPaise(p.next_price_paise)} on ${fmtWhen(p.next_price_at)}  ` }),
        h('button.btn', { type: 'button', 'data-gra-action': 'price-cancel', 'data-plan': p.id, text: 'CANCEL THE RISE' })
      ]));
    }
    sec.append(h('p.gt-meta', { text: 'Scheduled now:' }), ul);
  } else {
    sec.append(h('p.gt-meta', { text: 'No rise is scheduled, so the landing page shows the plain price and no countdown.' }));
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
  sec.append(h('p.gt-meta', { text: 'An affiliate code is a promo code with a commission — add one under Billing → Promo codes with “Commission %” filled in. Revenue is what buyers actually paid through the code (after its discount and any upgrade credit); commission is that times the rate, rounded down. Refunded orders drop out on their own. Pay affiliates by hand.' }));
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
      h('td', { text: fmtPaise(Number(a.revenue_paise)) }),
      h('td', { text: fmtPaise(Number(a.discount_paise)) }),
      h('td', {}, [h('strong', { text: fmtPaise(Number(a.commission_due_paise)) })]),
      h('td', { text: String(a.refunded) }),
      h('td', { text: fmtDate(a.last_order_at) }),
      h('td', {}, [h('button.btn', { type: 'button', 'data-gra-action': 'aff-orders', 'data-code': a.code, text: S.openAff === a.code ? 'HIDE ORDERS' : 'ORDERS' })])
    ]));
    if (S.openAff === a.code) {
      const orders = S.affOrders || [];
      tb.append(h('tr', {}, [h('td', { colspan: 10 }, [orders.length
        ? h('ul.gr-list', {}, orders.map((o) => h('li' + (o.status === 'refunded' ? '.is-off' : ''), { text: `${fmtDate(o.paid_at)} — ${o.email || '—'} · ${planName(o.plan_id)} · paid ${fmtPaise(o.amount_paise)}${o.discount_paise ? ` (${fmtPaise(o.discount_paise)} off)` : ''}${o.status === 'refunded' ? ' · refunded' : ''}` })))
        : h('p.gt-meta', { text: S.affOrders ? 'No orders yet.' : 'Loading…' })])]));
    }
  }
  table.append(tb);
  sec.append(h('div.gt-scroll', {}, [table]));
  const due = rows.reduce((n, a) => n + Number(a.commission_due_paise || 0), 0);
  sec.append(h('p.gt-meta', { text: `Commission due across all affiliates: ${fmtPaise(due)}.` }));
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
  sec.append(h('p.gt-meta', { text: `${rows.length} e-mail address${rows.length === 1 ? '' : 'es'} left through “Get launch offers” on the start page, each stored with the consent sentence the visitor saw. Only administrators can read this list.` }));
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
  sec.append(h('p.gt-meta', { text: 'Daily totals per step, counted by this site itself with no identifier attached. Visitors who send Do Not Track or press “Don’t count this visit” are not in it, so read these as a floor.' }));
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

export function growthAdminSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('growth', 'Growth', 'The trial, the price, referrals, affiliates, leads and the funnel.',
    'Everything around a purchase: who gets to look around before paying, what a plan will cost and when, what referrers are owed, what affiliates have earned, the e-mail addresses left on the start page and how many people reach each step. Money is computed by the database; this tab only shows it and records what you did about it.');
  if (S.state === 'idle') load();
  if (S.error) sec.append(h('p.gt-error', { role: 'alert', text: S.error }));
  if (S.state !== 'ready') { sec.append(h('p.gt-meta', { text: S.state === 'loading' ? 'Loading…' : '' })); return sec; }
  trialBlock(sec);
  priceRiseBlock(sec);
  referralBlock(sec);
  affiliateBlock(sec);
  leadsBlock(sec);
  funnelBlock(sec);
  sec.append(h('button.btn', { type: 'button', 'data-gra-action': 'reload', text: 'REFRESH' }));
  return sec;
}

export function wireGrowthAdmin(render) { rerender = render || (() => {}); }

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
    setTimeout(() => { S.saved = ''; rerender(); }, 2500);
  } catch (err) { toast(err.message || 'The referral terms were not saved.', 'error'); }
});

/* ---- the trial (§30) ---------------------------------------------- */
delegate(document, 'submit', '[data-gra-form="trial"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const mins = parseInt(String(f.get('minutes') || ''), 10);
  const days = parseInt(String(f.get('days') || ''), 10);
  if (!(mins >= 1 && mins <= 44640)) { toast('A trial lasts between 1 minute and 31 days (44640 minutes).', 'error'); return; }
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
    setTimeout(() => { S.saved = ''; rerender(); }, 2500);
  } catch (err) { toast(err.message || 'The trial terms were not saved.', 'error'); }
});

delegate(document, 'submit', '[data-gra-form="granttrial"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const whoId = String(f.get('who') || '');
  const mins = parseInt(String(f.get('minutes') || ''), 10);
  if (!whoId) { toast('Choose who the time is for.', 'error'); return; }
  if (!(mins >= 1 && mins <= 525600)) { toast('Between 1 minute and a year (525600 minutes).', 'error'); return; }
  try {
    await Billing.admin.grantTrial(whoId, mins, String(f.get('note') || '').trim());
    S.granted = `Granted — ${mins} minute${mins === 1 ? '' : 's'}, starting now.`;
    rerender();
    setTimeout(() => { S.granted = ''; rerender(); }, 4000);
  } catch (err) { toast(err.message || 'The time was not granted.', 'error'); }
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
  if (lines.length && !confirm('This will be shown to everyone, and it will happen by itself:\n\n' + lines.join('\n') + '\n\nSchedule it?')) return;
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
    S.saved = 'pricerise'; rerender();
    setTimeout(() => { S.saved = ''; rerender(); }, 2500);
  } catch (err) { toast(err.message || 'The price rise was not scheduled.', 'error'); await load(); }
});

delegate(document, 'click', '[data-gra-action="price-cancel"]', async (e, el) => {
  const id = el.dataset.plan;
  if (!confirm('Cancel the scheduled rise for this plan?\n\nThe price stays where it is and the landing page stops saying it will change.')) return;
  try {
    S.prices = await Billing.admin.setNextPrice(id, null, null);
    rerender();
  } catch (err) { toast(err.message || 'The rise was not cancelled.', 'error'); }
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
  } catch (err) { toast(err.message || 'The credits were not marked.', 'error'); }
});

delegate(document, 'click', '[data-gra-action="aff-orders"]', async (e, el) => {
  const code = el.dataset.code;
  if (S.openAff === code) { S.openAff = ''; S.affOrders = null; rerender(); return; }
  S.openAff = code; S.affOrders = null; rerender();
  try { S.affOrders = await Growth.admin.affiliateOrders(code); }
  catch (err) { S.affOrders = []; toast(err.message || 'The orders could not load.', 'error'); }
  rerender();
});

delegate(document, 'click', '[data-gra-action="leads-csv"]', () => {
  const blob = new Blob([leadsCsv(S.leads || [])], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'leads.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

delegate(document, 'click', '[data-gra-action="reload"]', () => load());

export default { growthAdminSection, wireGrowthAdmin };
