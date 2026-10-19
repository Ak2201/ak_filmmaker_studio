/* ============================================================
   CONTACT — the contact form's rules and its mailto: link, pure
   ------------------------------------------------------------
   contact.html's form sends nothing anywhere. It is checked here and
   turned into a mailto: link to the support address the page prints,
   and the visitor's own mail app does the sending. No storage, no
   network, no DOM, no imports: src/pages/company.js is the view and
   test:contact (scripts/test-contact.mjs) runs this in Node.
   ============================================================ */

export const MIN_MESSAGE = 10;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The fields as typed, trimmed. */
export function readFields(raw = {}) {
  const t = (v) => String(v == null ? '' : v).trim();
  return { name: t(raw.name), email: t(raw.email), topic: t(raw.topic), message: t(raw.message) };
}

/** Problems, keyed by field, in the order the form shows them. Each value
 *  is an error KEY ('name', 'email', 'emailBad', 'topic', 'message'); the
 *  page maps a key to its sentence. An empty object means it can be sent. */
export function validateContact(fields, topics = []) {
  const f = readFields(fields);
  const bad = {};
  if (!f.name) bad.name = 'name';
  if (!f.email) bad.email = 'email';
  else if (!EMAIL.test(f.email)) bad.email = 'emailBad';
  if (!f.topic || (topics.length && !topics.includes(f.topic))) bad.topic = 'topic';
  if (f.message.length < MIN_MESSAGE) bad.message = 'message';
  return bad;
}

/** The mailto: URL. `to` is the support address; `topicLabel` is the
 *  visible label of the chosen topic. Subject and body are percent-encoded
 *  with encodeURIComponent (RFC 6068), line breaks as CRLF. */
export function contactMailto({ to, prefix = 'Contact form', topicLabel = '', fields }) {
  const f = readFields(fields);
  const subject = prefix + (topicLabel ? ': ' + topicLabel : '') + (f.name ? ' (' + f.name + ')' : '');
  const body = [f.message, '', '--', f.name, f.email].join('\r\n');
  return 'mailto:' + String(to).trim() + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}
