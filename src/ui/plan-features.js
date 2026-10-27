/* ============================================================
   PLAN FEATURES — what each plan can see, as a matrix on the console
   ------------------------------------------------------------
   One table: a row per feature — the capabilities first, then every
   built module by stage — and a column per plan, a checkbox in each
   cell. SAVE writes every plan whose boxes changed, through
   admin_set_plan({ features }), which REPLACES the map (so an untick
   is stored as false, and false is the only thing that locks).

   THE STARTING POINT is src/data/plan-matrix.json: schema section 35
   writes its maps into these same rows (the owner's three-plan split,
   11 Oct 2026), and the plan cards and start.html derive what each
   plan adds from them. A change saved here is a fine-tune on top.

   The module rows come from navigation.json through plan-gate.js's
   catalogue, so a module added there appears here with no edit — the
   same rule that keeps the steps in JSON. A key the catalogue no
   longer knows (a module renamed) is kept on save rather than
   dropped, so a rename cannot silently unlock a page.

   Shown by the server's role, like everything on admin.html; every
   save is re-checked by the database. No inline handlers (CSP).
   ============================================================ */
import { errorSentence } from '../lib/gate.js';
import { h, delegate } from '../lib/dom.js';
import Billing, { planName } from '../lib/billing.js';
import PlanGate, { CAPABILITIES } from '../lib/plan-gate.js';
import '../styles/plans.css';

const S = { loaded: false, busy: false, error: '', plans: [], saved: '' };
let rerender = () => {};
export function wirePlanFeatures(render) { rerender = render || (() => {}); }

async function load() {
  S.busy = true; S.error = ''; rerender();
  try { S.plans = await Billing.refreshPlans(); S.loaded = true; }
  catch (e) { S.error = errorSentence(e, 'The plans could not be loaded.'); }
  finally { S.busy = false; rerender(); }
}

const on = (p, key, dflt) => {
  const f = (p && p.features) || {};
  if (key in f) return f[key] === true;
  return dflt;
};

export function planFeaturesSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('features', 'Features', 'What each plan can see.',
    'A tick means the plan has it. Untick a module and its page shows an upgrade panel to that plan (modules that share a page lock together, once all of them are unticked); untick New projects and the hub stops offering one; tick Sample only and the hub shows the Dragon sample and nothing else. Nothing is deleted by a change here — a film the plan hides is still on the device.');
  if (!S.loaded && !S.busy && !S.error) load();
  if (S.error) sec.append(h('p.gt-error', { role: 'alert', text: S.error }));
  if (!S.loaded) { sec.append(h('p.gt-meta', { text: S.busy ? 'Loading…' : '' })); return sec; }

  const plans = S.plans;
  const form = h('form.pf-form', { 'data-pf-form': 'features' });
  const table = h('table.gt-table.pf-table');
  /* The 'free' column is what the FREE TRIAL (and somebody with no plan)
     sees; there is no free plan to sell (owner, 11 Oct 2026), so the
     column says what it governs rather than naming a tier. */
  table.append(h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Feature' }), ...plans.map((p) => h('th', { scope: 'col', text: p.id === 'free' ? 'Free trial (no plan)' : p.name || planName(p.id) }))])]));
  const tb = h('tbody');
  const row = (key, label, hint, dflt) => {
    const tr = h('tr', { 'data-feature': key }, [h('th', { scope: 'row' }, [h('span', { text: label }), hint ? h('span.gt-meta', { text: ' — ' + hint }) : null].filter(Boolean))]);
    for (const p of plans) {
      tr.append(h('td', {}, [h('input', { type: 'checkbox', name: `${p.id}:${key}`, 'aria-label': `${label} on ${p.name || planName(p.id)}`, ...(on(p, key, dflt) ? { checked: true } : {}) })]));
    }
    tb.append(tr);
  };
  const group = (label) => tb.append(h('tr.pf-group', {}, [h('th', { scope: 'rowgroup', colspan: String(plans.length + 1), text: label })]));
  group('Capabilities');
  for (const [key, label, hint] of CAPABILITIES) row(key, label, hint, key !== 'sample_only');
  for (const stage of PlanGate.moduleCatalogue()) {
    group(stage.label);
    for (const m of stage.modules) row(m.id, m.label, m.siblings.length ? 'shares a page with ' + m.siblings.join(', ') + '; unticked, its own section locks, and the whole page once all are unticked' : '', true);
  }
  table.append(tb);
  form.append(h('div.gt-scroll', {}, [table]));
  form.append(h('div.ba-actions', {}, [
    h('button.btn.primary', { type: 'submit', text: 'SAVE FEATURES' }),
    S.saved ? h('span.ba-saved', { role: 'status', text: S.saved }) : null
  ].filter(Boolean)));
  form.append(h('p.gt-meta', { text: 'Live for everyone on the plan at their next page load.' }));
  sec.append(form);
  return sec;
}

const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

delegate(document, 'submit', '[data-pf-form="features"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const keys = [...CAPABILITIES.map(([k]) => k), ...PlanGate.moduleCatalogue().flatMap((s) => s.modules.map((m) => m.id))];
  let changed = 0;
  try {
    for (const p of S.plans) {
      const next = { ...((p.features && typeof p.features === 'object') ? p.features : {}) };   // unknown keys survive
      for (const k of keys) next[k] = f.has(`${p.id}:${k}`);
      if (JSON.stringify(next) === JSON.stringify(p.features || {})) continue;
      await Billing.admin.setPlan(p.id, { features: next });
      changed++;
    }
    S.saved = changed ? `Saved ${changed} plan${changed === 1 ? '' : 's'}.` : 'Nothing changed.';
    await load();
    PlanGate.refresh();
    setTimeout(() => { S.saved = ''; rerender(); }, 2500);
  } catch (err) { toast(errorSentence(err, 'The features were not saved.'), 'error'); }
});

export default { planFeaturesSection, wirePlanFeatures };
