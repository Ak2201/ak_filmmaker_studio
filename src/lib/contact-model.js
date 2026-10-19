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
/* The longest mailto: URL handed to the mail app. Windows' protocol
   handoff, Outlook and several webmail handlers fail or truncate above
   roughly 2,000 characters, and a Tamil character is about nine encoded
   bytes, so the textarea's 4000-character cap is no guide: a Tamil
   message passes this at about 220 characters. Over it the form says so
   instead of opening a link that arrives cut short or not at all. */
export const MAX_MAILTO = 2000;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The fields as typed, trimmed. */
export function readFields(raw = {}) {
  const t = (v) => String(v == null ? '' : v).trim();
  return { name: t(raw.name), email: t(raw.email), topic: t(raw.topic), message: t(raw.message) };
}

/** Problems, keyed by field, in the order the form shows them. Each value
 *  is an error KEY ('name', 'email', 'emailBad', 'topic', 'message'); the
 *  page maps a key to its sentence. An empty object means it can be sent. */
export function validateContact(fields, topics = [], link = null) {
  const f = readFields(fields);
  const bad = {};
  if (!f.name) bad.name = 'name';
  if (!f.email) bad.email = 'email';
  else if (!EMAIL.test(f.email)) bad.email = 'emailBad';
  if (!f.topic || (topics.length && !topics.includes(f.topic))) bad.topic = 'topic';
  if (f.message.length < MIN_MESSAGE) bad.message = 'message';
  /* `link` ({to, prefix, topicLabel}) checks the finished URL's length too,
     only once everything else is right (the length means nothing before). */
  else if (link && !Object.keys(bad).length && contactMailto({ ...link, fields: f }).length > MAX_MAILTO) bad.message = 'messageLong';
  return bad;
}

/** A lone surrogate (pasted broken text) makes encodeURIComponent throw
 *  URIError; replace it with U+FFFD, as toWellFormed() does. */
function wellFormed(s) {
  if (typeof s.toWellFormed === 'function') return s.toWellFormed();
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/** The mailto: URL. `to` is the support address; `topicLabel` is the
 *  visible label of the chosen topic. Subject and body are percent-encoded
 *  with encodeURIComponent (RFC 6068), every line break as CRLF, the
 *  visitor's own (a textarea's value uses LF) as well as the joins. */
export function contactMailto({ to, prefix = 'Contact form', topicLabel = '', fields }) {
  const f = readFields(fields);
  const crlf = (v) => wellFormed(String(v)).replace(/\r?\n|\r/g, '\r\n');
  const subject = prefix + (topicLabel ? ': ' + topicLabel : '') + (f.name ? ' (' + f.name + ')' : '');
  const body = [f.message, '', '--', f.name, f.email].join('\n');
  return 'mailto:' + String(to).trim() + '?subject=' + encodeURIComponent(wellFormed(subject).replace(/[\r\n]+/g, ' ')) + '&body=' + encodeURIComponent(crlf(body));
}
