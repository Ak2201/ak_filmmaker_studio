/* ============================================================
   TEST — src/lib/links.js, directly, in Node
   ------------------------------------------------------------
       node scripts/test-links.mjs   (or: npm run test:links)
   Where the files live, never the files: only http(s) survives,
   kinds are guessed by host, lists are capped and de-duplicated,
   and nothing passed in is mutated.
   ============================================================ */
const L = await import('../src/lib/links.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* safeUrl */
eq(L.safeUrl('https://drive.google.com/a'), 'https://drive.google.com/a', 'https kept');
eq(L.safeUrl('http://example.com'), 'http://example.com/', 'http kept, normalised');
eq(L.safeUrl('  \n https://example.com/x \t'), 'https://example.com/x', 'whitespace trimmed');
eq(L.safeUrl('ftp://example.com/x'), '', 'ftp refused');
eq(L.safeUrl('javascript:alert(1)'), '', 'javascript: refused');
eq(L.safeUrl('JaVaScRiPt:alert(1)'), '', 'mixed-case javascript: refused');
eq(L.safeUrl(' javascript:alert(1)'), '', 'padded javascript: refused');
eq(L.safeUrl('data:text/html,<b>x</b>'), '', 'data: refused');
eq(L.safeUrl('file:///etc/passwd'), '', 'file: refused');
eq(L.safeUrl('//example.com/x'), '', 'protocol-relative refused');
eq(L.safeUrl('example.com'), '', 'bare host refused');
eq(L.safeUrl(''), '', 'empty refused');
eq(L.safeUrl(null), '', 'null refused');
eq(L.safeUrl(undefined), '', 'undefined refused');
eq(L.safeUrl(42), '', 'a number refused');
ok(L.safeUrl('https://example.com/' + 'a'.repeat(580)) !== '', '600 characters or fewer is kept');
eq(L.safeUrl('https://example.com/' + 'a'.repeat(600)), '', 'over 600 characters refused');

/* guessKind */
const gk = L.guessKind;
eq(gk('https://drive.google.com/drive/folders/x'), 'drive', 'drive');
eq(gk('https://docs.google.com/document/d/x'), 'drive', 'docs.google.com is drive');
eq(gk('https://frame.io/reviews/x'), 'frameio', 'frame.io');
eq(gk('https://app.frame.io/reviews/x'), 'frameio', 'app.frame.io');
eq(gk('https://f.io/abc'), 'frameio', 'f.io');
eq(gk('https://acme.lucidlink.com/x'), 'lucid', 'lucidlink subdomain');
eq(gk('https://lucidlink.com/x'), 'lucid', 'lucidlink apex');
eq(gk('https://www.dropbox.com/s/x'), 'dropbox', 'dropbox www');
eq(gk('https://dl.dropboxusercontent.com/x'), 'dropbox', 'dropboxusercontent');
eq(gk('https://DRIVE.GOOGLE.COM/x'), 'drive', 'host case ignored');
eq(gk('https://notdropbox.com/x'), 'other', 'a lookalike suffix is not a subdomain');
eq(gk('https://drive.google.com.evil.example/x'), 'other', 'a host that merely starts with a known one is other');
eq(gk('https://example.com'), 'other', 'unknown is other');
eq(gk('nonsense'), 'other', 'unparseable is other');

/* kinds and text */
eq(L.kindLabel('frameio'), 'Frame.io', 'kindLabel');
eq(L.kindLabel('bogus'), 'Other', 'unknown kind labels as Other');
eq(L.linkText({ kind: 'drive', label: '' }), 'Google Drive', 'text falls back to the service');
eq(L.linkText({ kind: 'drive', label: 'Rushes' }), 'Rushes', 'text prefers the label');

/* cleanLink / cleanLinks */
const c1 = L.cleanLink({ url: 'https://f.io/x', kind: 'bogus', label: '  hi  ' });
ok(c1 && c1.kind === 'frameio' && c1.label === 'hi' && c1.id, 'an unknown kind is guessed; label trimmed; id given');
eq(L.cleanLink({ url: 'javascript:1' }), null, 'an unsafe link is null');
eq(L.cleanLink({ url: 'https://a.com/', kind: 'dropbox' }).kind, 'dropbox', 'a valid kind is kept even if the host disagrees');
eq(L.cleanLink({ url: 'https://a.com/', label: 'x'.repeat(200) }).label.length, 80, 'label capped at 80');

eq(L.cleanLinks(undefined), [], 'undefined reads []');
eq(L.cleanLinks('x'), [], 'a string reads []');
eq(L.cleanLinks({}), [], 'an object reads []');
const messy = [
  { id: 'a', url: 'https://a.com/' }, { id: 'b', url: 'https://a.com/', label: 'dupe' },
  { url: 'javascript:1' }, null, 'str', { id: 'c', url: 'https://c.com/' }
];
const cl = L.cleanLinks(messy);
eq(cl.map((l) => l.id), ['a', 'c'], 'dedupe by address keeps the first; unsafe and non-objects dropped; ids stable');
const many = Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, url: 'https://x.com/' + i }));
eq(L.cleanLinks(many).map((l) => l.id), ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'], 'capped at ' + L.MAX_LINKS + ', in order');
const noId = L.cleanLinks([{ url: 'https://x.com/1' }, { url: 'https://x.com/2' }]);
ok(noId[0].id && noId[1].id && noId[0].id !== noId[1].id, 'missing ids are generated and distinct');
eq(L.cleanLinks(cl).map((l) => l.id), ['a', 'c'], 'cleaning clean links keeps their ids (idempotent)');
eq(L.cleanLinks(cl), cl, 'and changes nothing else');

/* no mutation */
const frozen = Object.freeze([Object.freeze({ id: 'a', kind: 'other', url: 'https://a.com/', label: '' })]);
const before = JSON.stringify(frozen);
const w = L.withLink(frozen, { url: 'https://b.com/' });
ok(w.added && w.links.length === 2 && JSON.stringify(frozen) === before, 'withLink does not mutate its input');
eq(L.withoutLink(frozen, 'a'), [], 'withoutLink removes by id');
ok(JSON.stringify(frozen) === before, 'withoutLink does not mutate its input');
const messyBefore = JSON.stringify(messy);
L.cleanLinks(messy);
ok(JSON.stringify(messy) === messyBefore, 'cleanLinks does not mutate its input');

/* withLink */
ok(L.withLink([], { url: 'javascript:1' }).why && !L.withLink([], { url: 'javascript:1' }).added, 'withLink refuses unsafe with a reason');
ok(/already/.test(L.withLink(frozen, { url: 'https://a.com/' }).why), 'withLink refuses a duplicate');
ok(/up to 6/.test(L.withLink(L.cleanLinks(many), { url: 'https://new.com/' }).why), 'withLink refuses a full list');
eq(L.withLink([], { url: 'https://drive.google.com/x' }).added.kind, 'drive', 'withLink guesses the kind');
eq(L.withoutLink(undefined, 'a'), [], 'withoutLink on nothing is []');

console.log(`${fail ? '✗' : '✓'} test:links — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
