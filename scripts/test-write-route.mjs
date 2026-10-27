import { routeForWrite, redirectIfWrite } from '../src/lib/write-route.js';
let bad = 0;
const eq = (a, b, m) => { if (a !== b) { bad++; console.log('  ✗ ' + m + ' — got ' + a + ', want ' + b); } };
const t = { '': 'screenplay.html', '#screenplay': 'screenplay.html', '#import': 'screenplay.html#import', '#wr-import': 'screenplay.html#import',
  '#revisions': 'drafts.html', '#documents': 'drafts.html#title', '#outline': 'story.html#path-outline', '#characters': 'screenplay.html#analysis',
  '#coverage': 'write.html?stay=1#coverage', '#generate': 'write.html?stay=1#generate', '#guide': 'screenplay.html#guide', '#nonsense': 'screenplay.html' };
for (const [h, to] of Object.entries(t)) eq(routeForWrite(h), to, 'route ' + (h || '(none)'));
let went = null;
eq(redirectIfWrite({ search: '', hash: '#revisions', replace: (u) => { went = u; } }), true, 'redirects');
eq(went, 'drafts.html', 'revisions -> drafts');
went = null;
eq(redirectIfWrite({ search: '?stay=1', hash: '#revisions', replace: (u) => { went = u; } }), false, '?stay=1 exempts');
eq(went, null, 'stay does not navigate');
console.log(bad ? '✗ ' + bad + ' failed' : 'write-route: all passed');
process.exit(bad ? 1 : 0);
