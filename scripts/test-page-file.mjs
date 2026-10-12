import assert from 'node:assert/strict';
import { pageFile } from '../src/lib/page-file.js';
const cases = [
  ['', 'index.html'], ['/', 'index.html'], [undefined, 'index.html'],
  ['/settings', 'settings.html'], ['/settings.html', 'settings.html'],
  ['/Settings.HTML', 'settings.html'], ['/a/b/Plan', 'plan.html'], ['/index.html', 'index.html'],
];
for (const [i, o] of cases) assert.equal(pageFile(i), o, JSON.stringify(i));
console.log('page-file: ' + cases.length + ' checks passed');
