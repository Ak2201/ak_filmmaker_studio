/* ============================================================
   TEST — every page's static <html data-phase> is its home stage
   ------------------------------------------------------------
       node scripts/test-home-stage.mjs   (or: npm run test:homestage)

   No browser. A page has ONE home stage (src/lib/nav-stage.js
   homeStage: the stage of the page's first module in navigation.json),
   and the shell sets <html data-phase> from it at load. The root .html
   files must carry the SAME value in their markup, or the first paint —
   and the whole page with scripts off — is coloured differently from the
   page a moment later. A page with no home stage carries no data-phase
   at all; the old dead ids (breakdown, plan, write, visualize) matched
   no rule in tokens.css and are gone.

   Also: the stage-link rule (stageLead) agrees with the plan gate, and
   the three link sites that used to disagree now share it.
   ============================================================ */
import './node-seams.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import('../src/lib/nav-stage.js');
const nav = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/navigation.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---- the derivation itself ------------------------------------ */
eq(S.homeStage('contacts.html'), 'preprod', 'contacts.html: Contacts is its first module (Call Sheets is Production)');
eq(S.homeStage('reports.html'), 'preprod', 'reports.html');
eq(S.homeStage('shoot.html'), 'production', 'shoot.html');
eq(S.homeStage('edit.html'), 'post', 'edit.html');
eq(S.homeStage('vault.html'), 'story', 'vault.html');
eq(S.homeStage('drafts.html'), 'screenplay', 'drafts.html');
eq(S.homeStage('preprod.html'), 'preprod', 'preprod.html: a stage landing page (STAGE_PAGES)');
eq(S.homeStage('write.html'), 'screenplay', 'write.html: a retired page (STAY_PAGES)');
for (const g of ['index.html', 'dashboard.html', 'library.html', 'settings.html', 'admin.html', 'purchase.html', 'invite.html', 'feature.html', 'short.html']) {
  eq(S.homeStage(g), null, g + ' has no home stage');
}
eq(S.homeStage('CONTACTS.HTML'), 'preprod', 'case-insensitive');
eq(S.homeStage('contacts.html#call-sheets'), 'preprod', 'a fragment never changes the answer');

/* ---- every root page's markup agrees -------------------------- */
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
ok(pages.length > 20, 'found the root pages (' + pages.length + ')');
for (const f of pages) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const tag = (src.match(/<html\b[^>]*>/i) || [''])[0];
  ok(!!tag, f + ' has an <html> tag');
  const m = tag.match(/\bdata-phase="([^"]*)"/);
  const got = m ? m[1] : null;
  eq(got, S.homeStage(f), f + ': static data-phase equals homeStage()');
}

/* ---- the one stage-link rule ---------------------------------- */
const gp = fs.readFileSync(path.join(ROOT, 'src/lib/plan-gate.js'), 'utf8');
const blk = gp.slice(gp.indexOf('export const OFF_BY_DEFAULT'), gp.indexOf(';', gp.indexOf('export const OFF_BY_DEFAULT')));
const off = [...blk.matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
const gate = { isOff: (id) => off.includes(id), allowed: () => true };
for (const ph of nav.phases) {
  const lead = S.stageLead(ph, gate);
  const want = ph.modules.find((m) => m.status === 'built' && m.href && !off.includes(m.id)) || null;
  eq(lead && lead.id, want && want.id, 'stageLead("' + ph.id + '") is the first built module not off everywhere');
}
/* allowed() is honoured, and falls back rather than vanishing */
{
  const ph = { id: 'x', modules: [
    { id: 'a', status: 'planned', href: 'a.html' },
    { id: 'b', status: 'built', href: 'b.html' },
    { id: 'c', status: 'built', href: 'c.html' },
    { id: 'd', status: 'built', href: 'd.html' }] };
  eq(S.stageLead(ph, { isOff: () => false, allowed: () => true }).id, 'b', 'planned is skipped');
  eq(S.stageLead(ph, { isOff: (id) => id === 'b', allowed: () => true }).id, 'c', 'off everywhere is skipped');
  eq(S.stageLead(ph, { isOff: () => false, allowed: (id) => id === 'd' }).id, 'd', 'a module not on the plan is skipped');
  eq(S.stageLead(ph, { isOff: () => false, allowed: () => false }).id, 'b', 'nothing allowed: the first live module, not nothing');
  eq(S.stageLead(ph, { isOff: () => true, allowed: () => true }), null, 'everything off: no lead');
  eq(S.stageLead(ph).id, 'b', 'no gate (no window.StudioPlan): fails open');
  eq(S.stageAllLocked(ph, { isOff: () => false, allowed: () => false }), true, 'all locked');
  eq(S.stageAllLocked(ph, { isOff: () => false, allowed: (id) => id === 'c' }), false, 'one allowed: not locked');
  eq(S.stageAllLocked(ph), false, 'unknown is not locked');
  eq(S.stageLead({ id: 'h', home: { href: 'h.html', label: 'H' }, modules: ph.modules }).href, 'h.html', 'a stage home leads');
}

/* ---- the link sites read it, rather than a copy of it ---------- */
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
ok(/stageLead\(/.test(src('src/ui/shell.js')), 'shell.js (rail icon, crumb stage button) uses stageLead');
ok(/stageLead\(/.test(src('src/lib/journey.js')), 'journey.js (dashboard stage cards) uses stageLead');
ok(/stageLead\(/.test(src('src/lib/navmodel.js')), 'navmodel.js jobs() (hub doors) uses stageLead');
ok(!/m\.status !== 'planned' && m\.href && !isDisabledEverywhere/.test(src('src/ui/shell.js')), 'the rail no longer carries its own copy of the rule');
ok(/homeStage\(CURRENT\)/.test(src('src/ui/shell.js')), 'shell.js derives data-phase from the file');

console.log(`home stage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
