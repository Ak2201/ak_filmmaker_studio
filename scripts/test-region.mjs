// region-core.js: the visitor guess, project region, derived prefs, the
// pricing currency and the pay-currency pick. Node, no browser.
// docs/US-MARKET-PLAN.md §A/§B is the contract these assert.
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const R = await import('../src/lib/region-core.js');
let bad = 0, n = 0;
const ok = (name, c) => { n++; if (!c) { bad++; console.error('FAIL', name); } };
const eq = (name, a, b) => ok(name + ' (got ' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b));

/* ---- the startlib rule: import-free, and in the startlib chunk ---- */
const core = read('src/lib/region-core.js');
const ast = acorn.parse(core, { ecmaVersion: 'latest', sourceType: 'module' });
ok('region-core.js imports nothing', !ast.body.some((s) => s.type === 'ImportDeclaration'
  || ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportAllDeclaration') && s.source)));
ok('vite.config.js puts region-core.js in startlib', /\|region-core\)\\\.js\$\/\.test\(id\)\) return 'startlib'/.test(read('vite.config.js')));

/* ---- normalise ---------------------------------------------------- */
eq('IN', R.normaliseRegion('in'), 'IN');
eq('INT', R.normaliseRegion('INT'), 'INT');
eq('INTL read as INT', R.normaliseRegion('intl'), 'INT');
eq('international read as INT', R.normaliseRegion('International'), 'INT');
eq('US is not a region value', R.normaliseRegion('US'), '');
eq('null', R.normaliseRegion(null), '');
eq('currency', R.normaliseCurrency('usd'), 'USD');
eq('currency unknown', R.normaliseCurrency('EUR'), '');

/* ---- the guess ---------------------------------------------------- */
const g = (timeZone, languages = [], offset = null) => R.guessVisitorRegion({ timeZone, languages, offset });
eq('Kolkata', g('Asia/Kolkata'), 'IN');
eq('Calcutta alias', g('Asia/Calcutta'), 'IN');
eq('New York', g('America/New_York', ['en-US']), 'INT');
eq('zone decides over an Indian language (diaspora)', g('Asia/Dubai', ['en-IN']), 'INT');
eq('zone decides over a foreign language in India', g('Asia/Kolkata', ['en-US']), 'IN');
eq('UTC falls to the language', g('UTC', ['ta-IN', 'en']), 'IN');
eq('Etc/GMT falls to the language', g('Etc/GMT', ['en-GB']), 'INT');
eq('no zone, language without region, IST offset', g('', ['en'], -330), 'IN');
eq('no zone, language without region, other offset', g('', ['en'], 300), 'INT');
eq('script subtag', g('', ['zh-Hant-TW']), 'INT');
eq('nothing at all', g('', [], null), 'INT');
ok('browser read does not throw in Node', ['IN', 'INT'].includes(R.guessVisitorRegion()));

/* ---- prefs -------------------------------------------------------- */
eq('IN prefs', R.regionPrefs('IN'), { region: 'IN', currency: 'INR', paper: 'A4', dateStyle: 'IN', locale: 'en-IN', showIndiaContent: true });
eq('INT prefs', R.regionPrefs('INT'), { region: 'INT', currency: 'USD', paper: 'Letter', dateStyle: 'US', locale: 'en-US', showIndiaContent: false });
eq('unknown region reads as IN', R.regionPrefs('xx').region, 'IN');
eq('currencyForRegion IN', R.currencyForRegion('IN'), 'INR');
eq('currencyForRegion INT', R.currencyForRegion('INT'), 'USD');

/* ---- a project ---------------------------------------------------- */
eq('entry without region is IN', R.projectRegion({ id: 'a', title: 'x' }), 'IN');
eq('null entry is IN', R.projectRegion(null), 'IN');
eq('entry INT', R.projectRegion({ region: 'INT' }), 'INT');
eq('entry garbage is IN', R.projectRegion({ region: 'mars' }), 'IN');
const old = R.projectPrefs({ id: 'a' }, 'INT');
eq('pre-region film on an INT device: paperwork stays IN', [old.currency, old.paper, old.dateStyle], ['INR', 'A4', 'IN']);
eq('pre-region film on an INT device: content follows the device (as before)', old.showIndiaContent, false);
eq('pre-region film on an IN device shows India content', R.projectPrefs({ id: 'a' }, 'IN').showIndiaContent, true);
eq('pre-region film is not explicit', old.explicit, false);
const us = R.projectPrefs({ region: 'INT' }, 'IN');
eq('INT film on an IN device', [us.currency, us.paper, us.dateStyle, us.showIndiaContent, us.explicit], ['USD', 'Letter', 'US', false, true]);
eq('paper override', R.projectPrefs({ region: 'INT', paper: 'A4' }, 'INT').paper, 'A4');
eq('bad paper override ignored', R.projectPrefs({ region: 'INT', paper: 'A5' }, 'INT').paper, 'Letter');
eq('new project: choice wins', R.newProjectRegion({ chosen: 'IN', guess: 'INT' }), 'IN');
eq('new project: guess when no choice', R.newProjectRegion({ chosen: '', guess: 'INT' }), 'INT');

/* ---- pricing currency --------------------------------------------- */
eq('override wins', R.pricingCurrency({ override: 'INR', chosen: 'INT', guess: 'INT' }), 'INR');
eq('chosen market next', R.pricingCurrency({ override: '', chosen: 'INT', guess: 'IN' }), 'USD');
eq('guess last', R.pricingCurrency({ guess: 'IN' }), 'INR');
eq('bad override ignored', R.pricingCurrency({ override: 'EUR', guess: 'INT' }), 'USD');

/* ---- the pay-currency pick, inside the prefs blob ----------------- */
const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const s = mem();
s.setItem(R.PREFS_KEY, JSON.stringify({ reduceMotion: true, cloudSync: 'off' }));
eq('nothing picked', R.readPayCurrency(s), '');
ok('write USD', R.writePayCurrency('USD', s) === true);
eq('read USD', R.readPayCurrency(s), 'USD');
eq('merged, never replaced', JSON.parse(s.getItem(R.PREFS_KEY)), { reduceMotion: true, cloudSync: 'off', payCurrency: 'USD' });
ok('refuse EUR', R.writePayCurrency('EUR', s) === false && R.readPayCurrency(s) === 'USD');
ok('clear', R.writePayCurrency('', s) === true && R.readPayCurrency(s) === '');
eq('clear removes the field only', JSON.parse(s.getItem(R.PREFS_KEY)), { reduceMotion: true, cloudSync: 'off' });
eq('one key only', [...s.m.keys()], [R.PREFS_KEY]);
const broken = mem(); broken.setItem(R.PREFS_KEY, '{not json');
eq('corrupt blob reads as nothing', R.readPayCurrency(broken), '');
const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
ok('a throwing setItem answers false', R.writePayCurrency('USD', full) === false);
eq('the blob key is the registered one', R.PREFS_KEY, (/studio_prefs:\s*'([^']+)'/.exec(read('src/lib/backup.js')) || [])[1]);

/* ---- paperwork dates ---------------------------------------------- */
const IN = R.regionPrefs('IN'), US = R.regionPrefs('INT');
eq('IN medium', R.formatPaperDate('2026-10-21', IN), '21 Oct 2026');
eq('US medium', R.formatPaperDate('2026-10-21', US), 'Oct 21, 2026');
eq('IN numeric', R.formatPaperDate('2026-10-21', IN, 'numeric'), '21/10/2026');
eq('US numeric', R.formatPaperDate('2026-10-21', US, 'numeric'), '10/21/2026');
eq('US long', R.formatPaperDate('2026-10-21', US, 'long'), 'October 21, 2026');
eq('a day never shifts a day (Jan 1)', R.formatPaperDate('2027-01-01', US, 'numeric'), '01/01/2027');
eq('not a date', R.formatPaperDate('soon', US), '');

/* ---- the store half: the field rides the entry and the backup ----- */
const store = read('src/lib/store.js');
ok('createProject keeps region IN/INT', /meta\.region === 'IN' \|\| meta\.region === 'INT'\) project\.region = meta\.region/.test(store));
const backup = read('src/lib/backup.js');
ok('backup restore carries region (replace)', /region: meta\.region === 'IN' \|\| meta\.region === 'INT' \? meta\.region : undefined/.test(backup));
ok('backup restore carries region (create)', /region: meta\.region\s/.test(backup));
const region = read('src/lib/region.js');
for (const name of ['setProjectRegion', 'currentProjectPrefs', 'regionForNewProject', 'detectRegion', 'setRegion'])
  ok('region.js exports ' + name, new RegExp('export function ' + name + '\\b').test(region));
ok('region.js still stores the device choice under fms_region_v1', /REGION_KEY = 'fms_region_v1'/.test(region));
ok('no new fms_ key in region-core.js', (core.match(/'fms_[a-z_0-9]+'/g) || []).every((k) => k === "'fms_studio_prefs_v1'"));

console.log(bad ? `test:region — ${bad} of ${n} FAILED` : `test:region — ${n} checks passed`);
process.exit(bad ? 1 : 0);
