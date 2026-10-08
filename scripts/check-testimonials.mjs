/* ============================================================
   CHECK — start.html's #voices section agrees with
   src/data/testimonials.json, in both directions
   ------------------------------------------------------------
   start.html is markup-first (a crawler and a reader with scripts off
   get the whole page), so the testimonials are copied into it BY HAND
   rather than rendered by a script — and a hand copy drifts. This is
   the build check that keeps the two the same:

     - every JSON entry has an <li data-testimonial|data-film="id"> in
       the section, carrying the quote / the title verbatim and the name
     - every such <li> in the markup is in the JSON (nothing invented
       in the page that the data file, with its consent date, lacks)
     - every entry carries `consentOn` (YYYY-MM-DD): no consent, no entry
     - empty JSON: the section and both lists are `hidden` and empty;
       non-empty: the section is shown, and data-testimonials /
       data-films state the counts

   Run: npm run test:testimonials   (no build, no browser; linkedom)
   ============================================================ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const data = JSON.parse(readFileSync(path.join(ROOT, 'src/data/testimonials.json'), 'utf8'));
const html = readFileSync(path.join(ROOT, 'start.html'), 'utf8');
const { document } = parseHTML(html);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const T = Array.isArray(data.testimonials) ? data.testimonials : null;
const F = Array.isArray(data.films) ? data.films : null;
ok(T && F, 'testimonials.json has `testimonials` and `films` arrays');

const sec = document.getElementById('voices');
ok(!!sec, 'start.html has a #voices section');
if (sec && T && F) {
  const voiceList = sec.querySelector('#voiceList');
  const filmList = sec.querySelector('#filmList');
  ok(voiceList && filmList, '#voices has #voiceList and #filmList');
  const empty = T.length === 0 && F.length === 0;
  ok(sec.hasAttribute('hidden') === empty, empty ? 'the section is hidden while the JSON is empty' : 'the section is shown once the JSON has an entry');
  ok(sec.getAttribute('data-testimonials') === String(T.length), `data-testimonials="${T.length}"`);
  ok(sec.getAttribute('data-films') === String(F.length), `data-films="${F.length}"`);
  if (voiceList) ok(voiceList.hasAttribute('hidden') === (T.length === 0), '#voiceList hidden exactly when there are no testimonials');
  if (filmList) ok(filmList.hasAttribute('hidden') === (F.length === 0), '#filmList hidden exactly when there are no films');

  const ids = new Set();
  for (const t of T) {
    ok(t && t.id && !ids.has(t.id), 'testimonial has a unique id: ' + JSON.stringify(t && t.id));
    ids.add(t && t.id);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(String(t && t.consentOn || '')), `testimonial ${t && t.id} records consentOn (YYYY-MM-DD)`);
    ok(norm(t && t.quote) && norm(t && t.name), `testimonial ${t && t.id} has a quote and a name`);
    const li = sec.querySelector(`li[data-testimonial="${t.id}"]`);
    ok(!!li, `testimonial ${t.id} is in the markup`);
    if (li) {
      ok(norm(li.querySelector('blockquote') && li.querySelector('blockquote').textContent) === norm(t.quote), `testimonial ${t.id}: the quote is verbatim`);
      ok(norm(li.textContent).includes(norm(t.name)), `testimonial ${t.id}: the name is shown`);
    }
  }
  for (const f of F) {
    ok(f && f.id && !ids.has(f.id), 'film has a unique id: ' + JSON.stringify(f && f.id));
    ids.add(f && f.id);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(String(f && f.consentOn || '')), `film ${f && f.id} records consentOn (YYYY-MM-DD)`);
    const li = sec.querySelector(`li[data-film="${f.id}"]`);
    ok(!!li, `film ${f.id} is in the markup`);
    if (li) ok(norm(li.textContent).includes(norm(f.title)), `film ${f.id}: the title is shown`);
  }
  for (const li of sec.querySelectorAll('li[data-testimonial]')) ok(T.some((t) => t.id === li.getAttribute('data-testimonial')), `markup testimonial ${li.getAttribute('data-testimonial')} is in the JSON`);
  for (const li of sec.querySelectorAll('li[data-film]')) ok(F.some((f) => f.id === li.getAttribute('data-film')), `markup film ${li.getAttribute('data-film')} is in the JSON`);
  ok(sec.querySelectorAll('li').length === T.length + F.length, 'no other list items in #voices');
}

console.log(`testimonials: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
