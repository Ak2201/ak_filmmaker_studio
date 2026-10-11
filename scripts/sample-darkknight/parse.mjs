/* The scene-source DSL → [{type,text}] elements. See act1.mjs. */
const EXT_RE = /^(?:[A-Z]\.){1,}(?:[A-Z]\.?)?$|^CONT'D$/;
export function parseScene(src) {
  const out = [];
  for (const raw of String(src).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] === '~') { out.push({ type: 'transition', text: line.slice(1).trim() }); continue; }
    if (line[0] === '@') {
      const m = line.match(/^@([^:(]+?)(?:\s*\(([^)]*)\))?:\s*(.+)$/);
      if (!m) throw new Error('bad dialogue line: ' + line);
      let cue = m[1].trim();
      const hint = m[2];
      if (hint && EXT_RE.test(hint)) { out.push({ type: 'character', text: cue + ' (' + hint + ')' }); }
      else {
        out.push({ type: 'character', text: cue });
        if (hint) out.push({ type: 'paren', text: '(' + hint + ')' });
      }
      out.push({ type: 'dialogue', text: m[3].trim() });
      continue;
    }
    out.push({ type: 'action', text: line });
  }
  return out;
}
