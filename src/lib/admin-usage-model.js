/* ============================================================
   ADMIN USAGE MODEL — the Usage tab's sums and labels
   ------------------------------------------------------------
   Pure: admin_usage() in, weeks, sums and names out
   (src/pages/admin-tabs/usage.js draws them). Every figure is a FLOOR
   — signed-in people who have not turned counting off — and the tab
   says so; nothing here invents a number the counters do not hold.
   ============================================================ */
import { allModules } from './navmodel.js';

export const RANGES = [7, 30, 90];
export const FEATURE_LABEL = {
  script_import: 'Script imported', export_pdf: 'PDF exported', export_docx: 'Word file exported',
  ai_call: 'AI request answered', drive_connect: 'Google Drive connected', limit_hit: 'Plan limit met',
  share_created: 'Share link created', screening_pass_used: 'Screening pass used'
};
export const PLAN_ORDER = ['free', 'starter', 'indie', 'pro'];
const PLAN_NAME = { free: 'No plan', starter: 'Basic', indie: 'Intermediate', pro: 'Pro' };
export const planName = (p) => PLAN_NAME[p] || p;
export const featureLabel = (name) => FEATURE_LABEL[name] || name;

let _labels = null;
/** A module id's label from navigation.json; the id when it has none. */
export function moduleLabel(id) {
  if (!_labels) { _labels = {}; try { for (const m of allModules()) _labels[m.id] = m.label; } catch (e) { /* the id is the fallback */ } }
  return _labels[id] || id;
}

/** Day strings -> Monday-start weeks: [{ key, label, idx:[day indexes] }]. */
export function weeksOf(days) {
  const out = [];
  let cur = null;
  days.forEach((ds, i) => {
    const d = new Date(ds + 'T00:00:00');
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!cur || cur.key !== key) {
      cur = { key, idx: [], label: monday.getDate() + '/' + (monday.getMonth() + 1) };
      out.push(cur);
    }
    cur.idx.push(i);
  });
  return out;
}

export const sum = (a) => a.reduce((t, v) => t + (Number(v) || 0), 0);

/** Opens per module per week: { rows: labels, cols: week labels, values }. */
export function heatValues(days, mods) {
  const weeks = weeksOf(days || []);
  return {
    rows: mods.map((m) => moduleLabel(m.id)),
    cols: weeks.map((w) => w.label),
    values: mods.map((m) => weeks.map((w) => sum(w.idx.map((i) => (m.by_day || [])[i]))))
  };
}

/** When counting began (a Date, or null), and whether that is under 14 days ago. */
export function countingAge(trackingBegan, now = Date.now()) {
  const began = trackingBegan ? new Date(trackingBegan + 'T00:00:00') : null;
  return { began, young: !began || (now - began.getTime()) < 14 * 86400000 };
}

/** The features table's rows (limit hits have their own card) and plan columns, in plan order then any other. */
export function adoption(features) {
  const feats = (features || []).filter((f) => f.name !== 'limit_hit');
  const plans = PLAN_ORDER.filter((p) => feats.some((f) => (f.by_plan || {})[p] != null));
  for (const f of feats) for (const p of Object.keys(f.by_plan || {})) if (!plans.includes(p)) plans.push(p);
  return { feats, plans };
}

/** Limit hits: the feature row (or an empty one) and per-plan bar items, largest first. */
export function limitHits(features) {
  const f = (features || []).find((x) => x.name === 'limit_hit') || { total: 0, by_plan: {} };
  const items = Object.entries(f.by_plan || {}).map(([p, v]) => ({ label: planName(p), value: Number(v) || 0 })).sort((a, b) => b.value - a.value);
  return { f, items };
}

export default { RANGES, FEATURE_LABEL, PLAN_ORDER, planName, featureLabel, moduleLabel, weeksOf, sum, heatValues, countingAge, adoption, limitHits };
