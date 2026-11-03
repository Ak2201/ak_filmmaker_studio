/* ============================================================
   AI STREAM JSON — scene by scene out of a reply still arriving
   ------------------------------------------------------------
   The model answers `{ "scenes": [ {…}, {…} ] }` as text, a few
   characters at a time. callModel's progress hands over the WHOLE
   text so far; feed() returns each array element that has just
   COMPLETED, JSON.parse'd, so the Desk can show a card the moment a
   scene is whole instead of after the last one.

   A tiny state machine rather than a re-parse: it remembers where it
   stopped, so feeding a long reply costs one pass in total, and a
   chunk boundary anywhere (inside a string, inside \uXXXX, between a
   backslash and its character) just resumes. An element that does
   not parse is skipped, never thrown.

   This only ever decides what is SHOWN EARLY. The final JSON.parse in
   callModel stays the authority for what a task returns.
   ============================================================ */
export function arrayStream(key) {
  const want = JSON.stringify(String(key));
  let i = 0;            // next character to look at
  let depth = 0;        // { and [ nesting, outside strings
  let inStr = false;
  let esc = false;
  let strStart = 0;
  let prev = '';        // last significant character outside a string
  let lastStr = '';     // the last string closed at depth 1 (a key, raw, quotes kept)
  let active = false;   // inside the wanted array
  let finished = false;
  let elStart = -1;
  let n = 0;

  function feed(sofar) {
    const text = String(sofar || '');
    const out = [];
    for (; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') {
          inStr = false;
          if (depth === 1) lastStr = text.slice(strStart, i + 1);
          prev = '"';
        }
        continue;
      }
      if (ch === '"') { inStr = true; esc = false; strStart = i; continue; }
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
      if (ch === '{' || ch === '[') {
        if (!finished && !active && ch === '[' && depth === 1 && prev === ':' && lastStr === want) active = true;
        else if (active && depth === 2) elStart = i;
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (active && depth === 2 && elStart >= 0) {
          try { out.push(JSON.parse(text.slice(elStart, i + 1))); n++; } catch (e) { /* skipped */ }
          elStart = -1;
        } else if (active && depth === 1) { active = false; finished = true; }
      }
      prev = ch;
    }
    return out;
  }
  return { feed, count: () => n };
}

export default { arrayStream };
