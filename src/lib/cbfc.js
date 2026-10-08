/* ============================================================
   CBFC — certification sensitivity flags, read off the script
   ------------------------------------------------------------
   PURE. No DOM, no storage, nothing written; the readiness.js rule.
   Takes the scene rows and the script elements, returns which scenes
   carry something the certification process will ask about — the
   tobacco disclaimers, the AWBI permission, a child artist, a word
   the committee will mute — each flag with the line it was read off
   and the rule (with its source and the date it was checked) that
   makes it matter.

   RULE-BASED, NO AI, on purpose. A flag here is a word list and a
   regular expression, so the page can say exactly why a scene was
   flagged and a person can disagree with it. The rules and the
   lists are content in src/data/cbfc-rules.json (rule 2); this file
   is only how they are tested.

   THE JOIN is screenplay-analysis.js's matchScenes(), the one join
   between scene rows and script headings, so a flagged scene here is
   the same scene the reports and the breakdown mean. A heading with
   no scene row is still scanned and listed under its heading — a
   word in the script is on the screen whether or not the breakdown
   has caught up.

   THE RATING IS A HINT. ratingHint() takes the highest tier that
   fired and names the category the JSON guesses for it. It is not
   the Board's criteria and every caller says so; the disclaimer is
   in the JSON so the wording lives in one place.
   ============================================================ */
import RULES from '../data/cbfc-rules.json';
import { matchScenes } from './screenplay-analysis.js';

export const RATINGS = RULES.ratings.map((r) => r.id);
export const DISCLAIMER = RULES.disclaimer;
export const CHECKED = RULES.checked;
export const rules = () => RULES.rules;
export const ruleById = (id) => RULES.rules.find((r) => r.id === id) || null;
export const KIND_ORDER = ['requirement', 'review', 'caution'];

const ratingRank = (id) => (id ? RATINGS.indexOf(id) : -1);
export const higherRating = (a, b) => (ratingRank(b) > ratingRank(a) ? b : a);

/* ---- terms to regular expressions ---------------------------

   Whole-word and case-blind. A word edge is "not a letter, a mark or
   a digit" rather than \b, because \b is ASCII-only in JavaScript
   and Tamil script is letters plus combining vowel signs (\p{M}):
   \b would find a "word" edge in the middle of almost every Tamil
   word. A trailing * takes any ending; a space is any run of white
   space, so a phrase broken across a line still matches. */
const WORDCH = '[\\p{L}\\p{M}\\p{N}]';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function termSource(term) {
  const t = String(term || '').trim();
  if (!t) return '';
  const star = t.endsWith('*');
  const body = esc(star ? t.slice(0, -1) : t).replace(/\s+/g, '\\s+');
  return body + (star ? WORDCH + '*' : '');
}
export function termsRegex(terms) {
  const src = [...new Set(terms || [])]
    .filter((t) => String(t || '').trim())
    .sort((a, b) => b.length - a.length)
    .map(termSource)
    .filter(Boolean);
  if (!src.length) return null;
  return new RegExp('(?<!' + WORDCH + ')(?:' + src.join('|') + ')(?!' + WORDCH + ')', 'giu');
}

/* Compiled once per rule set. Exported so a test can compile a
   hand-made rule and check one behaviour at a time. */
export function compile(ruleList = RULES.rules) {
  return ruleList.map((r) => ({
    rule: r,
    reads: new Set(r.reads || []),
    tiers: (r.tiers || []).map((t) => ({
      tier: t,
      re: termsRegex([...(t.en || []), ...(t.ta || []), ...(t.taScript || [])])
    })),
    institutions: r.institutionWords ? institutionRegex(r.institutionWords) : null,
    generic: new Set((r.genericWords || []).map((w) => w.toLowerCase()))
  }));
}
const COMPILED = compile();

/* A capitalised name in front of an institution word: "St. Mary's
   College", "APOLLO HOSPITAL". The name part is case-SENSITIVE (it
   has to start with a capital) and the institution word matches in
   title case or capitals, so "the hospital" never fires. */
function institutionRegex(words) {
  const forms = [];
  for (const w of words) forms.push(esc(w).replace(/\s+/g, '\\s+'), esc(w.toUpperCase()).replace(/\s+/g, '\\s+'));
  return new RegExp("((?:\\p{Lu}[\\p{L}\\p{M}'’.&-]*\\s+){1,4})(" + forms.join('|') + ')(?!' + WORDCH + ')', 'gu');
}

/* ---- the scene's text, typed --------------------------------- */

const SCRIPT_TYPE = { action: 'action', shot: 'action', dialogue: 'dialogue', paren: 'paren' };

/** Every piece of text a scene has, as { type, text, category? }. */
export function sceneTexts(scene, slice) {
  const out = [];
  if (slice) {
    if (slice.heading) out.push({ type: 'heading', text: slice.heading });
    for (const el of slice.elements || []) {
      const type = SCRIPT_TYPE[el && el.type];
      const text = String((el && el.text) || '').trim();
      if (type && text) out.push({ type, text });
    }
  } else if (scene && scene.location) {
    out.push({ type: 'heading', text: [scene.intExt, scene.location, scene.dayNight].filter(Boolean).join(' ') });
  }
  if (scene) {
    const syn = String(scene.synopsis || '').trim();
    if (syn) out.push({ type: 'synopsis', text: syn });
    const els = scene.elements && typeof scene.elements === 'object' ? scene.elements : {};
    for (const cat of Object.keys(els)) {
      for (const name of Array.isArray(els[cat]) ? els[cat] : []) {
        const text = String(name || '').trim();
        if (text) out.push({ type: 'elements', text, category: cat });
      }
    }
  }
  return out;
}

/** The sentence around a match, short enough for a chip's title. */
function around(text, index, length) {
  const t = String(text);
  if (t.length <= 160) return t;
  let a = Math.max(0, index - 70);
  let b = Math.min(t.length, index + length + 70);
  const head = t.lastIndexOf('. ', index);
  if (head >= a) a = head + 2;
  return (a > 0 ? '…' : '') + t.slice(a, b).trim() + (b < t.length ? '…' : '');
}

/* "YOUNG RAGAVAN, 17," or "MEENA (9)" — a cast introduction with an
   age. Capital letters only, the screenplay's own convention, so a
   sentence with a number in it does not read as an age. */
const AGE_RE = /(?<![\p{L}\p{M}])(\p{Lu}[\p{Lu}'’.-]+(?:\s+\p{Lu}[\p{Lu}'’.-]+){0,3})\s*(?:,\s*|\(\s*)(\d{1,2})(?!\d)(?!\s*(?:s\b|’s|'s|-\d))/gu;
export function agesIn(text) {
  const out = [];
  AGE_RE.lastIndex = 0;
  let m;
  while ((m = AGE_RE.exec(String(text || '')))) out.push({ name: m[1].trim(), age: Number(m[2]), index: m.index, length: m[0].length });
  return out;
}

/* ---- one scene ----------------------------------------------- */

function kindOf(tierKinds, ruleKind) {
  const ks = tierKinds.length ? tierKinds : [ruleKind];
  return KIND_ORDER.find((k) => ks.includes(k)) || ruleKind;
}

/**
 * The flags one scene carries.
 * @returns [{ ruleId, label, kind, hint, tiers: [ids], hits: [{ tier, term, type, from }] }]
 */
export function flagTexts(texts, compiled = COMPILED) {
  const flags = [];
  for (const c of compiled) {
    const r = c.rule;
    const hits = [];
    const seen = new Set();
    const add = (tier, term, t, index, length) => {
      const k = tier + '\u0000' + term.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      hits.push({ tier, term, type: t.type, from: around(t.text, index, length) });
    };
    for (const t of texts) {
      if (!c.reads.has(t.type)) continue;
      // A breakdown tag in a category the rule names IS the evidence.
      if (t.type === 'elements' && (r.elementCategories || []).includes(t.category)) {
        add((r.tiers[0] || {}).id || 'any', t.text, t, 0, t.text.length);
        continue;
      }
      for (const { tier, re } of c.tiers) {
        if (!re) continue;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(t.text))) add(tier.id, m[0], t, m.index, m[0].length);
      }
      if (c.institutions) {
        c.institutions.lastIndex = 0;
        let m;
        while ((m = c.institutions.exec(t.text))) {
          const names = m[1].trim().split(/\s+/).map((w) => w.replace(/[.,]+$/, ''));
          // Drop the generic words; a real name has to be left over.
          const left = names.filter((w) => w && !c.generic.has(w.toLowerCase()));
          if (!left.length) continue;
          add((r.tiers[0] || {}).id || 'any', m[0].trim(), t, m.index, m[0].length);
        }
      }
      if (r.childAgeUnder && (t.type === 'action' || t.type === 'synopsis' || t.type === 'heading')) {
        for (const a of agesIn(t.text)) {
          if (a.age < r.childAgeUnder) add('child', `${a.name}, ${a.age}`, t, a.index, a.length);
          else if (a.age < (r.adultAge || 18)) add('adolescent', `${a.name}, ${a.age}`, t, a.index, a.length);
        }
      }
    }
    if (!hits.length) continue;
    // A tier that only counts beside another (the hazard beside a child).
    const fired = new Set(hits.map((h) => h.tier));
    const tierById = new Map((r.tiers || []).map((t) => [t.id, t]));
    const kept = hits.filter((h) => {
      const t = tierById.get(h.tier);
      return !(t && Array.isArray(t.onlyWith)) || t.onlyWith.some((id) => fired.has(id));
    });
    const own = kept.filter((h) => { const t = tierById.get(h.tier); return !(t && t.onlyWith); });
    if (!own.length) continue;
    const tiers = [...new Set(kept.map((h) => h.tier))];
    let hint = null;
    for (const id of tiers) hint = higherRating(hint, (tierById.get(id) || {}).hint || null);
    const tierKinds = [...new Set(own.map((h) => (tierById.get(h.tier) || {}).kind || r.kind))];
    flags.push({ ruleId: r.id, label: r.label, kind: kindOf(tierKinds, r.kind), hint, tiers, hits: kept });
  }
  return flags;
}

export const flagScene = (scene, slice, compiled) => flagTexts(sceneTexts(scene, slice), compiled);

/* ---- the film ------------------------------------------------ */

/**
 * Every scene, with its flags, and the rules gathered across them.
 *
 *   rows     [{ scene|null, number, heading, how, flags }] — scene rows
 *            in breakdown order, then script headings no row matches
 *   byRule   [{ rule, kind, scenes: [row], tiers: {id: count} }] in
 *            the JSON's rule order, only rules that fired
 *   hint     ratingHint(rows)
 *   scanned  how many scenes were read, and how many from the script
 */
export function certificationReport(scenes, elements, compiled = COMPILED) {
  const m = matchScenes(scenes || [], elements || []);
  const rows = m.pairs.map(({ scene, slice, how }, i) => ({
    scene,
    number: String(scene.number || i + 1),
    heading: slice ? slice.heading : [scene.intExt, scene.location, scene.dayNight].filter(Boolean).join(' · '),
    how,
    fromScript: !!slice,
    flags: flagScene(scene, slice, compiled)
  }));
  for (const sl of m.unmatchedHeadings) {
    rows.push({ scene: null, number: sl.number || String(sl.index + 1), heading: sl.heading, how: null, fromScript: true, flags: flagScene(null, sl, compiled) });
  }
  const byRule = [];
  for (const c of compiled) {
    const r = c.rule;
    const hit = rows.filter((row) => row.flags.some((f) => f.ruleId === r.id));
    if (!hit.length) continue;
    const tiers = {};
    let kind = null;
    for (const row of hit) {
      const f = row.flags.find((x) => x.ruleId === r.id);
      for (const t of f.tiers) tiers[t] = (tiers[t] || 0) + 1;
      if (!kind || KIND_ORDER.indexOf(f.kind) < KIND_ORDER.indexOf(kind)) kind = f.kind;
    }
    byRule.push({ rule: r, kind, scenes: hit, tiers });
  }
  return {
    rows,
    byRule,
    hint: ratingHint(rows),
    scanned: { scenes: rows.length, fromScript: rows.filter((r) => r.fromScript).length },
    flagged: rows.filter((r) => r.flags.length).length
  };
}

/**
 * The likely category, as a hint. U when nothing that carries a hint
 * fired. `reasons` names each rule-and-tier that reached the hinted
 * category, with how many scenes, so the page can say WHY.
 */
export function ratingHint(rows) {
  let rating = RATINGS[0];
  const tally = new Map();
  for (const row of rows || []) {
    for (const f of row.flags || []) {
      const r = ruleById(f.ruleId);
      for (const id of f.tiers) {
        const t = r && (r.tiers || []).find((x) => x.id === id);
        if (!t || !t.hint) continue;
        rating = higherRating(rating, t.hint);
        const k = f.ruleId + ':' + id;
        if (!tally.has(k)) tally.set(k, { ruleId: f.ruleId, label: r.label, tier: id, hint: t.hint, scenes: 0 });
        tally.get(k).scenes += 1;
      }
    }
  }
  const all = [...tally.values()].sort((a, b) => ratingRank(b.hint) - ratingRank(a.hint) || b.scenes - a.scenes);
  return { rating, reasons: all.filter((x) => x.hint === rating), all, basis: 'heuristic', disclaimer: DISCLAIMER };
}

export default { RATINGS, DISCLAIMER, CHECKED, rules, ruleById, termsRegex, compile, sceneTexts, agesIn, flagTexts, flagScene, certificationReport, ratingHint, higherRating };
