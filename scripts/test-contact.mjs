/* ============================================================
   TEST — src/lib/contact-model.js, directly, in Node
   ------------------------------------------------------------
       node scripts/test-contact.mjs   (or: npm run test:contact)
   contact.html's form sends nothing: these are its rules and the
   mailto: link it hands to the visitor's own mail app.
   ============================================================ */
const C = await import('../src/lib/contact-model.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const TOPICS = ['general', 'billing', 'bug', 'feature', 'press'];
const good = { name: 'Asha', email: 'asha@example.com', topic: 'bug', message: 'The stripboard froze after a drag.' };

eq(C.validateContact(good, TOPICS), {}, 'a complete form has no problems');
eq(C.validateContact({}, TOPICS), { name: 'name', email: 'email', topic: 'topic', message: 'message' }, 'an empty form names every field, in order');
eq(Object.keys(C.validateContact({}, TOPICS)), ['name', 'email', 'topic', 'message'], 'problems come in the order the form shows them');
eq(C.validateContact({ ...good, name: '   ' }, TOPICS), { name: 'name' }, 'a name of spaces is no name');
eq(C.validateContact({ ...good, email: 'asha' }, TOPICS), { email: 'emailBad' }, 'an address without @ is malformed, not missing');
eq(C.validateContact({ ...good, email: 'asha@example' }, TOPICS), { email: 'emailBad' }, 'an address without a dot in the domain is malformed');
eq(C.validateContact({ ...good, topic: 'spam' }, TOPICS), { topic: 'topic' }, 'a topic that is not on the list is refused');
eq(C.validateContact({ ...good, message: 'hi there' }, TOPICS), { message: 'message' }, `a message under ${C.MIN_MESSAGE} characters is refused`);
eq(C.validateContact({ ...good, message: '  ' + 'x'.repeat(C.MIN_MESSAGE) + '  ' }, TOPICS), {}, 'the length is counted after trimming');

const url = C.contactMailto({ to: ' support@example.in ', prefix: 'Contact form', topicLabel: 'Billing & refunds', fields: { ...good, message: 'Line one\nLine two & more?' } });
ok(url.startsWith('mailto:support@example.in?subject='), 'the link is a mailto: to the trimmed support address: ' + url.slice(0, 50));
const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
eq(q.get('subject'), 'Contact form: Billing & refunds (Asha)', 'the subject carries the topic label and the name');
ok(q.get('body').startsWith('Line one\nLine two & more?\r\n\r\n--\r\nAsha\r\nasha@example.com'), 'the body is the message, then the name and the reply address');
ok(!/[ &?#]/.test(url.slice(url.indexOf('subject=') + 8).replace('&body=', '')), 'spaces, ampersands, question marks and hashes are percent-encoded');
ok(!url.includes('+'), 'a space is %20, never + (mail apps do not decode + in mailto:)');

console.log(`\ntest:contact: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
