// REGION-CONTENT: a film's region, the India-only switch, and the lines a
// visitor outside India reads on the public pages. Node, no browser.
// docs/US-MARKET-PLAN.md §A3 and §E are the contract these assert.
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const R = await import('../src/lib/region-core.js');
let bad = 0, n = 0;
const ok = (name, c) => { n++; if (!c) { bad++; console.error('FAIL', name); } };

/* ---- a new film carries a region; a duplicate keeps it ------------ */
const setup = read('src/ui/project-setup.js');
ok('project-setup starts the sheet on regionForNewProject() (the device choice, else the visitor guess)', /return regionForNewProject\(\);/.test(setup) && /const reg = newFilmRegion\(\);/.test(setup));
ok('regionForNewProject() falls back on the VISITOR guess (§A3, §B), not the map\'s', /newProjectRegion\(\{ chosen: chosenRegion\(\), guess: visitorGuess\(\) \}\)/.test(read('src/lib/region.js')));
ok('project-setup passes region to createProject', /Store\.createProject\(\{[^}]*region: state\.region/.test(setup));
ok('project-setup asks where the film is made', /WHERE IS THIS FILM BEING MADE\?/.test(setup) && /psRegion_/.test(setup));
const hub = read('src/pages/hub.js');
ok('hub duplicate copies region', /createProject\(\{ title: p\.title \+ ' \(copy\)'[^}]*region: p\.region/.test(hub));
ok('hub project modal creates with regionForNewProject(), as project-setup does', /createProject\(\{ title: titleValue, format, region: regionForNewProject\(\)/.test(hub));

/* ---- the film's region is set on a click only -------------------- */
for (const f of ['src/pages/dashboard.js', 'src/pages/settings.js']) {
  const src = read(f);
  const calls = [...src.matchAll(/setFilmRegion\(/g)].map((m) => m.index)
    .filter((i) => !/import \{[^}]*$/.test(src.slice(Math.max(0, i - 200), i)));
  ok(f + ' calls setFilmRegion', calls.length > 0);
  for (const i of calls) {
    const before = src.slice(0, i);
    const d = before.lastIndexOf('delegate(');
    const fn = before.lastIndexOf('\nfunction ');
    ok(f + ': setFilmRegion at ' + i + ' sits in a click handler', d > fn && /^delegate\([^,]+,\s*'click'/.test(before.slice(d)));
  }
}

/* ---- the India-only switch: not CORE, reads only ------------------ */
const ic = read('src/ui/india-content.js');
const vite = read('vite.config.js');
const coreUi = /const CORE_UI = (\/.*\/);/.exec(vite);
ok('india-content.js is not in the CORE_UI chunk list', coreUi && !/india-content/.test(coreUi[1]));
ok('region.js has no top-level DOM side effect', !/typeof document !== 'undefined'/.test(read('src/lib/region.js')));
ok('india-content.js never writes storage', !/setItem|rawSet|writePrefs/.test(ic));
ok('india-content.js stamps data-no-india', /toggleAttribute\('data-no-india'/.test(ic));
ok('india-content.js re-stamps on region:project', /'region:project'/.test(ic));
const css = read('src/styles/india-content.css');
ok('india-content.css hides [data-india-only]', /:root\[data-no-india\] :is\(\[data-india-only\]/.test(css));
ok('india-content.css keeps the glosses for a Tanglish reader', /:root\[data-no-india\]:not\(\[data-lang="tl"\]\) :is\(\.tn, \.tanglish, \.lang-switch\)/.test(css));
ok('india-content.css hides by display, never by removal', /display: none !important/.test(css) && !/content:/.test(css));
for (const f of ['src/ui/tamil-type.js', 'src/ui/dictation.js', 'src/ui/format-guide.js', 'src/ui/alt-lines.js', 'src/pages/dashboard.js']) {
  ok(f + ' loads india-content.js', /from '\.\/india-content\.js'|import '\.\/india-content\.js'|import '\.\.\/ui\/india-content\.js'/.test(read(f)));
}
ok('alt-lines marks its Tamil controls data-india-only', (read('src/ui/alt-lines.js').match(/'data-india-only': ''/g) || []).length >= 4);
ok('dictation hides the Tamil option for a film made elsewhere', /'data-india-only': v === 'ta-IN'/.test(read('src/ui/dictation.js')));
ok('tamil typing is off for a film made elsewhere', /isTamilTyping = \(\) => on && here\(\)/.test(read('src/ui/tamil-type.js')));
const dv = read('src/pages/deliverables.js');
ok('deliverables reads the film, not isIndia()', /filmRegion\(\)/.test(dv) && !/\bisIndia\b/.test(dv));
ok('deliverables keeps the certification section and says why it is empty', /if \(!prefs\.showIndiaContent\)[\s\S]{0,1600}return sec;/.test(dv));

/* ---- the prefs each surface reads --------------------------------- */
ok('an INT film hides India-only material', R.projectPrefs({ region: 'INT' }, 'IN').showIndiaContent === false);
ok('an IN film shows it on an International device', R.projectPrefs({ region: 'IN' }, 'INT').showIndiaContent === true);
ok('a pre-region film follows the device (IN)', R.projectPrefs({}, 'IN').showIndiaContent === true);
ok('a pre-region film follows the device (INT)', R.projectPrefs({}, 'INT').showIndiaContent === false);
ok('a pre-region film keeps India paperwork', R.projectPrefs({}, 'INT').currency === 'INR');

/* ---- film-region.js restates projectPrefs / setProjectRegion ------ */
{
  const fr = read('src/lib/film-region.js');
  const body = /export function showIndia\(entry, deviceRegion\) \{([\s\S]*?)\n\}/.exec(fr);
  ok('film-region.js has showIndia()', !!body);
  const own = (v) => (v === 'IN' || v === 'INT' ? v : '');
  // eslint-disable-next-line no-new-func
  const showIndia = new Function('own', 'entry', 'deviceRegion', body[1]).bind(null, own);
  let same = 0, all = 0;
  for (const entry of [{}, { region: 'IN' }, { region: 'INT' }, { region: '' }, { region: 'bogus' }, null]) {
    for (const dev of ['IN', 'INT']) {
      all++;
      if (showIndia(entry, dev) === R.projectPrefs(entry, dev).showIndiaContent) same++;
      else console.error('  differs:', JSON.stringify(entry), dev);
    }
  }
  ok('showIndia() answers as region-core projectPrefs().showIndiaContent (' + same + '/' + all + ')', same === all);
  const imports = acorn.parse(fr, { ecmaVersion: 'latest', sourceType: 'module' }).body
    .filter((x) => x.type === 'ImportDeclaration').map((x) => x.source.value);
  ok('film-region.js imports store.js and region.js only (no region-core: startlib)', JSON.stringify(imports.sort()) === JSON.stringify(['./region.js', './store.js']));
  const rj = read('src/lib/region.js');
  const strip = (t) => t.replace(/\s+/g, ' ');
  for (const line of ["if ((before.region || '') === want) return before;",
    "const after = Store.updateProject(pid, { region: want || undefined });"]) {
    ok('setFilmRegion() writes as setProjectRegion(): ' + line, strip(fr).includes(strip(line)) && strip(rj).includes(strip(line)));
  }
  ok('setFilmRegion() notifies region:project', /Store\.notify\('region:project', \{ id: pid, region: want \}\)/.test(fr));
  ok('no CORE module imports film-region.js', !/film-region/.test(read('vite.config.js')));
}

/* ---- the format tour ---------------------------------------------- */
for (const s of json('src/data/format-rules.json').tour.steps) {
  if (/tanglish|tamil/i.test(s.ask)) ok('tour step ' + s.title + ' has an askElsewhere without the India aside', typeof s.askElsewhere === 'string' && !/tanglish|tamil/i.test(s.askElsewhere));
}

/* ---- the public pages --------------------------------------------- */
const FORBIDDEN = /cbfc|chennai|rupee|₹|\blakh|\bcrore|fefsi|\bbata\b|tamil|tanglish|kollywood|\binr\b/i;
const variants = [];
function walk(o, file, where) {
  if (Array.isArray(o)) { o.forEach((v, i) => walk(v, file, where + '[' + i + ']')); return; }
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (/Elsewhere$/.test(k)) variants.push({ file, where: where + '.' + k, base: o[k.replace(/Elsewhere$/, '')], v });
    else walk(v, file, where + '.' + k);
  }
}
for (const f of ['src/data/marketing-home.json', 'src/data/marketing-pages.json', 'src/data/marketing-site.json']) walk(json(f), f, '');
ok('the marketing JSON carries Elsewhere lines', variants.length >= 10);
for (const x of variants) {
  const name = x.file + x.where;
  ok(name + ' sits beside its India line', x.base !== undefined);
  const list = Array.isArray(x.v) ? x.v : [x.v];
  if (Array.isArray(x.v)) ok(name + ' is as long as its India list', Array.isArray(x.base) && x.base.length === x.v.length);
  for (const t of list) {
    if (t === null) continue;
    ok(name + ' is text', typeof t === 'string' && t.trim().length > 0);
    ok(name + ' makes no India-only claim: ' + t, !FORBIDDEN.test(t));
  }
}

const M = await import('./make-marketing-pages.mjs');
ok('alt() writes data-mk-intl', M.alt({ subElsewhere: 'A "b" & c' }, 'sub') === ' data-mk-intl="A &quot;b&quot; &amp; c"');
ok('alt() writes nothing without a variant', M.alt({ sub: 'x' }, 'sub') === '');
ok('alt() indexes a parallel array, skipping null', M.alt({ bodyElsewhere: [null, 'two'] }, 'body', 1) === ' data-mk-intl="two"' && M.alt({ bodyElsewhere: [null, 'two'] }, 'body', 0) === '');
const html = ['start.html', 'product-writing.html', 'product-budget.html'].map(read).join('\n');
for (const x of variants) {
  for (const t of (Array.isArray(x.v) ? x.v : [x.v])) {
    if (t) ok('a generated page carries ' + x.where, html.includes('data-mk-intl="' + M.esc(t) + '"'));
  }
}
const mk = read('src/pages/marketing.js');
const mast = acorn.parse(mk, { ecmaVersion: 'latest', sourceType: 'module' });
const mimports = mast.body.filter((s) => s.type === 'ImportDeclaration').map((s) => s.source.value);
ok('marketing.js reads the region through visitor-region.js, never region.js', mimports.includes('../lib/visitor-region.js') && !mimports.includes('../lib/region.js'));
const vr = read('src/lib/visitor-region.js');
const vast = acorn.parse(vr, { ecmaVersion: 'latest', sourceType: 'module' });
const vimports = vast.body.filter((s) => s.type === 'ImportDeclaration').map((s) => s.source.value);
ok('visitor-region.js imports nothing (its guess must not land in startlib)', vimports.length === 0);
ok('visitor-region.js never writes storage', !/setItem|removeItem/.test(vr));
const V = await import('../src/lib/visitor-region.js');
const st = (v) => ({ getItem: (k) => (k === 'fms_region_v1' ? v : null) });
const usEnv = { timeZone: 'America/New_York', languages: ['en-US'], offset: 240 };
const inEnv = { timeZone: 'Asia/Kolkata', languages: ['en-IN'], offset: -330 };
ok('a New York visitor reads the Elsewhere lines', V.visitorRegion({ storage: st(null), env: usEnv }) === 'INT');
ok('a Chennai visitor reads the India lines', V.visitorRegion({ storage: st(null), env: inEnv }) === 'IN');
ok('the device\u2019s stated market wins over the guess (INT in India)', V.visitorRegion({ storage: st('INT'), env: inEnv }) === 'INT');
ok('the device\u2019s stated market wins over the guess (IN abroad)', V.visitorRegion({ storage: st('IN'), env: usEnv }) === 'IN');
{
  const zones = ['Asia/Kolkata', 'Asia/Calcutta', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'UTC', 'GMT', 'Etc/GMT+5', '', 'Asia/Colombo'];
  const langs = [[], ['en'], ['en-IN'], ['ta-IN', 'en'], ['en-US'], ['zh-Hans-CN'], ['es-419']];
  const offs = [null, -330, 0, 300];
  let same = 0, all = 0;
  for (const timeZone of zones) for (const languages of langs) for (const offset of offs) {
    all++;
    const env = { timeZone, languages, offset };
    if (V.guessHere({ ...env }) === R.guessVisitorRegion({ ...env })) same++;
    else console.error('  differs:', JSON.stringify(env));
  }
  ok('visitor-region.js guessHere() answers as region-core guessVisitorRegion() (' + same + '/' + all + ')', same === all);
}
ok('a storage that throws falls to the guess', V.visitorRegion({ storage: { getItem() { throw new Error('x'); } }, env: usEnv }) === 'INT');
ok('marketing.js swaps only data-mk-intl text, as text', /el\.textContent = el\.getAttribute\('data-mk-intl'\)/.test(mk) && !/innerHTML/.test(mk));
ok('marketing.js reads the region, never writes it', !/setItem\(\s*'fms_region_v1'/.test(mk));

console.log(`test:region-content: ${n - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
