/* ============================================================
   THE ELEMENT INDEX — pure derivations over the scene list
   ------------------------------------------------------------
   Nothing here reads or writes storage: every function takes the
   scenes (as scenes.js lists them) and answers. The totals, the rows
   and the export are all DERIVED from the tags on the scenes, so there
   is no second copy to drift. Batch tagging is not here either: it goes
   through scenes.js tagMany(), the one writer; planBatch() only says
   what it would write, so the page can say it first.
   ============================================================ */

const cellOf = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const nameKey = (n) => String(n).trim().toLowerCase();
const numOf = (s, i) => String(s.number || '').trim() || String(i + 1);

/** One entry per category, in the order of `categories`: how many tags and
    how many distinct elements it carries. A category with none is KEPT at
    zero, because "no stunts" is a fact the 1st AD wants to see. */
export function categoryTotals(scenes, categories) {
  const out = categories.map((c) => ({ id: c.id, label: c.label, hue: c.hue, tags: 0, elements: 0 }));
  const byId = new Map(out.map((c) => [c.id, c]));
  const seen = new Set();
  for (const s of scenes || []) {
    for (const [cat, names] of Object.entries(s.elements || {})) {
      const row = byId.get(cat);
      if (!row || !Array.isArray(names)) continue;
      for (const n of names) {
        if (!String(n).trim()) continue;
        row.tags++;
        const k = cat + '::' + nameKey(n);
        if (!seen.has(k)) { seen.add(k); row.elements++; }
      }
    }
  }
  return out;
}

/** Total tags across every known category, and the distinct elements. */
export function indexTotals(totals) {
  return totals.reduce((a, c) => ({ tags: a.tags + c.tags, elements: a.elements + c.elements }), { tags: 0, elements: 0 });
}

/** Rows for the list and the export: one per distinct element, with the
    scene numbers it appears in (script order, not sorted as text), sorted
    by category order then name. `cat` filters to one category. */
export function indexRows(scenes, categories, cat) {
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const label = new Map(categories.map((c) => [c.id, c.label]));
  const rows = new Map();
  (scenes || []).forEach((s, i) => {
    for (const [c, names] of Object.entries(s.elements || {})) {
      if (!order.has(c) || (cat && c !== cat) || !Array.isArray(names)) continue;
      for (const n of names) {
        const clean = String(n).trim();
        if (!clean) continue;
        const k = c + '::' + nameKey(clean);
        if (!rows.has(k)) rows.set(k, { category: c, categoryLabel: label.get(c), name: clean, scenes: [] });
        const r = rows.get(k);
        if (!r.scenes.some((x) => x.id === s.id)) r.scenes.push({ id: s.id, number: numOf(s, i) });
      }
    }
  });
  return [...rows.values()].sort((a, b) =>
    order.get(a.category) - order.get(b.category) || a.name.localeCompare(b.name));
}

export const CSV_HEADER = ['Category', 'Element', 'Scenes (count)', 'Scene numbers'];

/** The index as CSV. CRLF rows; every cell quoted, so a comma or a quote in
    a name stays one cell. */
export function toCSV(rows) {
  const data = (rows || []).map((r) => [r.categoryLabel, r.name, r.scenes.length, r.scenes.map((s) => s.number).join(' ')]);
  return [CSV_HEADER, ...data].map((r) => r.map(cellOf).join(',')).join('\r\n') + '\r\n';
}

/** What a batch tag WOULD do: the tags for tagMany(), skipping scenes that
    already carry the name (any case), plus how many were skipped. */
export function planBatch(scenes, sceneIds, category, name) {
  const clean = String(name || '').trim();
  const tags = [];
  let already = 0;
  if (!clean || !category) return { tags, already };
  const want = new Set(sceneIds || []);
  for (const s of scenes || []) {
    if (!want.has(s.id)) continue;
    const have = Array.isArray(s.elements && s.elements[category]) ? s.elements[category] : [];
    if (have.some((n) => nameKey(n) === nameKey(clean))) already++;
    else tags.push({ sceneId: s.id, category, name: clean });
  }
  return { tags, already };
}

export default { categoryTotals, indexTotals, indexRows, toCSV, planBatch, CSV_HEADER };
