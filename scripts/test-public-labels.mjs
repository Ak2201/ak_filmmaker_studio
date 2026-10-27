// Public site and shell, round 3: one name per thing, no promise the shell cannot keep. Node, no browser.
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let bad = 0;
const ok = (name, c) => { if (!c) { bad++; console.error('FAIL', name); } };
const nav = JSON.parse(read('src/data/navigation.json'));
const mk = JSON.parse(read('src/data/marketing-pages.json'));
const elements = nav.phases.flatMap((p) => p.modules).find((m) => m.id === 'elements');
ok('marketing "catalog" page is named like the app module', elements && mk.catalog.label === elements.label);
const purchase = nav.global.find((g) => g.id === 'purchase');
for (const f of ['src/ui/shell.js', 'src/lib/settings-model.js', 'src/pages/settings.js']) {
  ok(f + ' calls purchase.html by its rail label "' + purchase.label + '"', !read(f).includes('Plan & purchases'));
}
const chrome = read('src/ui/chrome.js');
const sheet = chrome.slice(chrome.indexOf('const DEFAULT_SHORTCUTS'), chrome.indexOf('];', chrome.indexOf('const DEFAULT_SHORTCUTS')));
ok('shortcut sheet lists no j/k step keys', !/keys: \['[jk]'\]/.test(sheet) && !/label: '[^']*blueprint/.test(sheet));
const shell = read('src/ui/shell.js');
ok('stageDescription skips modules off for everybody', /function stageDescription[\s\S]*?isDisabledEverywhere\(m\.id\)/.test(shell));
ok('rail global links are named by their label', /h\('a\.sh-rail-item'[^;]*'aria-label': g\.label/.test(shell));
const pal = read('src/ui/palette.js');
ok('palette indexes module sections', /moduleSections/.test(pal) && /for \(const sec of moduleSections\(m\)\)/.test(pal));
if (bad) { console.error(bad + ' failure(s)'); process.exit(1); }
console.log('public labels ok');
