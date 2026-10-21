/* ============================================================
   SCREENPLAY → FINAL DRAFT (.fdx)
   ------------------------------------------------------------
   The file Final Draft itself writes, not merely one it will open.
   The paragraphs were always the easy half — the element types map
   one to one onto Final Draft's paragraph types, which is the point
   of a typed element list. What a writer notices when a file arrives
   in Final Draft is everything AROUND the paragraphs:

     · <TitlePage>       the script's own title page (`titlePage` in
                         the script blob), laid out the way the PDF
                         lays it out: title a third of the way down,
                         credit and writer under it, the draft and date
                         and the contact block at the foot.
     · <ElementSettings> one per element type, at the indents the PDF
                         paints (screenplay-export.js GEOMETRY), so the
                         file opens on US Letter at the standard margins
                         whatever template the reader's copy defaults
                         to, and a page here is a page there.
     · <PageLayout>      US Letter, 1in top and bottom.
     · <HeaderAndFooter> the page number top right, not on page 1.
     · <SmartType>       the script's own characters, extensions, scene
                         intros, locations, times and transitions, so
                         Final Draft's autocomplete knows the cast the
                         moment the file opens.
     · Number="12A"      a LOCKED scene number on its heading. Unlocked,
                         a number is only the heading's position, and
                         writing it would freeze it.
     · StartsNewPage     a LOCKED page's first element starts a page, so
                         Final Draft breaks where the locked pages did.
                         A page that began part-way through an element
                         (a speech carried over) has nowhere to go in
                         the format and is left to Final Draft's own
                         pagination. Locked page LABELS (12A) do not
                         travel: the format has no field for them.
     · RevisionID        when the caller passes `meta.marks` (the ids
                         that changed since a chosen revision,
                         src/lib/script-diff.js), each changed paragraph
                         carries the revision set and the file declares
                         it in <Revisions>, so Final Draft shows the
                         asterisks. The model stores no marks of its
                         own, so an export without `marks` carries none.

   Dual dialogue goes out the way Final Draft writes it: ONE <Paragraph>
   holding a <DualDialogue> with both speeches inside it as ordinary
   paragraphs. A parenthetical is stored without its brackets and Final
   Draft stores it with them, so they go on here and come off on import.
   Text is written as TYPED, not uppercased: Final Draft's element
   settings carry the capitals (Style="AllCaps"), and the importer reads
   back exactly the words the writer wrote.

   NO OMITTED PARAGRAPHS. A locked script prints "12  OMITTED" where a
   deleted scene was. Written into the file it would come back through
   the importer as a scene heading called OMITTED — a scene the writer
   never wrote, added on every round trip. Final Draft shows the gap in
   the numbers, which is the convention's whole purpose.

   Loaded at the press (src/pages/screenplay.js, write.js), so no page
   pays for it on first paint. Pure apart from the typesetter's tables:
   no DOM, no storage (npm run test:fdx, which round-trips every file
   through script-import.js's reader).
     toFDX(doc, meta) → string
   ============================================================ */
import { dualPairs, sceneNumbers, isNumberingLocked, cueSpeaker } from './script.js';
import { GEOMETRY, paginateDoc, pageStarts, pagesLock, titlePageOf } from './screenplay-export.js';

export const FDX_MIME = 'application/xml';

const FDX_TYPE_OUT = {
  scene: 'Scene Heading', action: 'Action', character: 'Character',
  paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot'
};
/* What Return gives next, in Final Draft's vocabulary — the same table
   as NEXT_TYPE in script.js, so the file behaves the way the editor
   does. */
const RETURN_KEY = {
  scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue',
  dialogue: 'action', transition: 'scene', shot: 'action'
};
const SHORTCUT = { scene: 1, action: 2, character: 3, paren: 4, dialogue: 5, transition: 6, shot: 7 };

/* XML 1.0 forbids the C0 controls other than tab, LF and CR, U+FFFE,
   U+FFFF and an unpaired surrogate, and ONE of them makes the file not
   well-formed — Final Draft refuses it and says only that it is
   damaged. They arrive by paste or import and nothing on input strips
   them, so they come off here (the same rule as screenplay-docx.js). */
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDFFF]/gu;
export const xmlEsc = (s) => String(s ?? '').replace(XML_ILLEGAL, '').replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[m]));
const attrs = (o) => Object.entries(o)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => ' ' + k + '="' + xmlEsc(v) + '"').join('');
const inch = (n) => n.toFixed(2);
const FONT = 'Courier Final Draft';

/** The text a paragraph carries: as typed, brackets on a parenthetical. */
function fdxText(el) {
  let text = String(el.text ?? '').trim();
  if (el.type === 'paren' && text && !/^\(.*\)$/.test(text)) text = '(' + text + ')';
  return text;
}

function paragraph(el, pad, extra = {}) {
  const text = fdxText(el);
  const rev = extra.revision ? attrs({ RevisionID: extra.revision }) : '';
  return pad + '<Paragraph' + attrs({
    Type: FDX_TYPE_OUT[el.type] || 'Action',
    Number: extra.number,
    StartsNewPage: extra.newPage ? 'Yes' : ''
  }) + '><Text' + rev + '>' + xmlEsc(text) + '</Text></Paragraph>';
}

/* ---- element settings ----------------------------------------
   Indents are inches from the sheet's left edge: the 1.5in gutter plus
   GEOMETRY's character offset at ten characters an inch. These are the
   numbers the PDF and the Word file use, so the three agree on where a
   line breaks. */
function elementSettings() {
  return Object.keys(FDX_TYPE_OUT).map((type) => {
    const g = GEOMETRY[type];
    const left = 1.5 + g.indent / 10;
    const right = 1.5 + (g.indent + g.width) / 10;
    const name = FDX_TYPE_OUT[type];
    return '  <ElementSettings' + attrs({ Type: name }) + '>\n'
      + '    <FontSpec' + attrs({ Font: FONT, Size: 12, Style: g.upper ? 'AllCaps' : '' }) + '/>\n'
      + '    <ParagraphSpec' + attrs({
        Alignment: g.align === 'right' ? 'Right' : 'Left',
        FirstIndent: type === 'paren' ? '-0.10' : '0.00',
        Leading: 'Regular',
        LeftIndent: inch(left),
        RightIndent: inch(right),
        SpaceBefore: String(g.blankBefore * 12),
        Spacing: '1',
        StartsNewPage: 'No'
      }) + '/>\n'
      + '    <Behavior' + attrs({
        PaginateAs: name, ReturnKey: FDX_TYPE_OUT[RETURN_KEY[type]], Shortcut: SHORTCUT[type]
      }) + '/>\n'
      + '  </ElementSettings>';
  });
}

/* ---- SmartType -------------------------------------------------
   Derived from the script every time, never stored. A heading is read
   the conventional way — "INT. KITCHEN - DAY": the intro up to the
   first ". ", the time after the last " - ", the location between. A
   heading that does not follow it contributes what it can and nothing
   is guessed. The defaults are the lists Final Draft itself ships. */
const INTRO_RE = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+/i;
const DEFAULT_INTROS = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EXT./INT. ', 'I/E. '];
const DEFAULT_TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'LATER', 'MOMENTS LATER', 'CONTINUOUS'];
const DEFAULT_TRANSITIONS = ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO:', 'DISSOLVE TO:', 'BACK TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE TO BLACK.'];
const DEFAULT_EXTENSIONS = ['(V.O.)', '(O.S.)', '(O.C.)', "(CONT'D)"];

export function smartTypeLists(elements) {
  const els = elements || [];
  const seen = { characters: new Set(), extensions: new Set(DEFAULT_EXTENSIONS),
    intros: new Set(DEFAULT_INTROS), locations: new Set(), times: new Set(DEFAULT_TIMES),
    transitions: new Set(DEFAULT_TRANSITIONS) };
  for (const el of els) {
    const text = String((el && el.text) ?? '').trim();
    if (!text) continue;
    if (el.type === 'character') {
      const who = cueSpeaker(text);
      if (who) seen.characters.add(who);
      for (const m of text.matchAll(/\([^)]*\)/g)) seen.extensions.add(m[0].toUpperCase().replace(/\s+/g, ''));
    } else if (el.type === 'transition') {
      seen.transitions.add(text.toUpperCase());
    } else if (el.type === 'scene') {
      let rest = text.toUpperCase().replace(/^[A-Z]?\d+[A-Z]{0,2}[.)]?\s+(?=\S)/, '');
      const m = INTRO_RE.exec(rest);
      if (!m) continue;
      let intro = m[1].replace(/\s+/g, '');
      if (!intro.endsWith('.')) intro += '.';
      seen.intros.add(intro + ' ');
      rest = rest.slice(m[0].length);
      const cut = rest.lastIndexOf(' - ');
      const loc = (cut >= 0 ? rest.slice(0, cut) : rest).trim();
      const time = cut >= 0 ? rest.slice(cut + 3).trim() : '';
      if (loc) seen.locations.add(loc);
      if (time) seen.times.add(time);
    }
  }
  const sorted = (s) => Array.from(s).sort((a, b) => a.localeCompare(b));
  return {
    characters: sorted(seen.characters), extensions: Array.from(seen.extensions),
    intros: Array.from(seen.intros), locations: sorted(seen.locations),
    times: Array.from(seen.times), transitions: Array.from(seen.transitions)
  };
}

function smartType(elements) {
  const L = smartTypeLists(elements);
  const list = (tag, item, values, sep) => {
    const head = '    <' + tag + attrs({ Separator: sep }) + '>';
    if (!values.length) return '    <' + tag + attrs({ Separator: sep }) + '/>';
    return [head, ...values.map((v) => '      <' + item + '>' + xmlEsc(v) + '</' + item + '>'), '    </' + tag + '>'].join('\n');
  };
  return [
    '  <SmartType>',
    list('Characters', 'Character', L.characters),
    list('Extensions', 'Extension', L.extensions),
    list('SceneIntros', 'SceneIntro', L.intros, '. '),
    list('Locations', 'Location', L.locations),
    list('Times', 'Time', L.times, ' - '),
    list('Transitions', 'Transition', L.transitions),
    '  </SmartType>'
  ];
}

/* ---- the title page --------------------------------------------
   Final Draft keeps it as its own <Content>. Blank paragraphs place the
   lines on the sheet; the importer skips them. Centred: the title, the
   credit and the writer, the source. Right: the draft and the date.
   Left: the contact block. */
const TITLE_LINES = 54;
function titlePage(doc, meta) {
  const tp = titlePageOf(doc, meta);
  const title = String((tp && tp.title) || meta.title || '').trim() || 'Untitled';
  const centred = [title.toUpperCase()];
  if (tp) {
    if (tp.credit || tp.author) centred.push('', tp.credit || 'Written by', '', tp.author);
    if (tp.source) centred.push('', tp.source);
  } else if (meta.author) centred.push('', 'Written by', '', String(meta.author));
  const right = tp ? [tp.draft, tp.date].filter(Boolean) : [];
  const left = tp && tp.contact ? tp.contact.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  const top = 17;
  const fill = Math.max(2, TITLE_LINES - top - centred.length - right.length - left.length);
  const para = (t, align) => '      <Paragraph' + attrs({ Alignment: align, Type: 'Action' })
    + '><Text>' + xmlEsc(t) + '</Text></Paragraph>';
  const out = ['  <TitlePage>', '    <HeaderAndFooter FooterFirstPage="No" FooterVisible="No" HeaderFirstPage="No" HeaderVisible="No" StartingPage="1"/>', '    <Content>'];
  for (let i = 0; i < top; i++) out.push(para('', 'Center'));
  centred.forEach((t) => out.push(para(t, 'Center')));
  for (let i = 0; i < fill; i++) out.push(para('', 'Left'));
  right.forEach((t) => out.push(para(t, 'Right')));
  left.forEach((t) => out.push(para(t, 'Left')));
  out.push('    </Content>', '  </TitlePage>');
  return out;
}

/* ---- locked pages ----------------------------------------------
   The ids of the elements that begin a locked page, page 2 onwards.
   Taken from the same pagination the PDF and the page view use, so the
   file breaks where the printed pages did. Nothing when unlocked. */
function lockedPageStarts(doc) {
  if (!pagesLock(doc)) return new Set();
  const starts = pageStarts(paginateDoc(doc));
  return new Set(starts.slice(1).filter((s) => s.id && !s.split).map((s) => s.id));
}

const markSet = (marks) => (marks && marks.ids
  ? (marks.ids instanceof Set ? marks.ids : new Set(marks.ids))
  : null);

/**
 * The screenplay as a Final Draft document.
 *   meta: { title, author, marks?: { ids, name } }
 */
export function toFDX(doc, meta = {}) {
  const els = (doc && doc.elements) || [];
  const pairs = new Map(dualPairs(els).map((p) => [p.left[0], p]));
  const nums = isNumberingLocked(doc && doc.numbering) ? sceneNumbers(els, doc.numbering).byId : null;
  const newPage = lockedPageStarts(doc);
  const marked = markSet(meta.marks);
  const revOf = (el) => (marked && marked.has(el.id) ? '1' : '');
  const has = (el) => !!(el && String(el.text ?? '').trim());

  const out = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    '  <Content>'
  ];
  for (let i = 0; i < els.length; i++) {
    const pair = pairs.get(i);
    if (pair) {
      let starts = false;
      for (let k = pair.left[0]; k <= pair.right[1]; k++) if (newPage.has(els[k].id)) starts = true;
      out.push('    <Paragraph' + attrs({ StartsNewPage: starts ? 'Yes' : '' }) + '>', '      <DualDialogue>');
      for (let k = pair.left[0]; k <= pair.right[1]; k++) {
        if (has(els[k])) out.push(paragraph(els[k], '        ', { revision: revOf(els[k]) }));
      }
      out.push('      </DualDialogue>', '    </Paragraph>');
      i = pair.right[1];
      continue;
    }
    const el = els[i];
    if (!has(el)) continue;
    out.push(paragraph(el, '    ', {
      number: nums && el.type === 'scene' ? nums.get(el.id) : '',
      newPage: newPage.has(el.id),
      revision: revOf(el)
    }));
  }
  out.push('  </Content>');

  out.push(...titlePage(doc, meta));
  out.push(...elementSettings());
  out.push(
    '  <HeaderAndFooter FooterFirstPage="Yes" FooterVisible="No" HeaderFirstPage="No" HeaderVisible="Yes" StartingPage="1">',
    '    <Header>',
    '      <Paragraph Alignment="Right" FirstIndent="0.00" Leading="Regular" LeftIndent="1.25" RightIndent="-1.25" SpaceBefore="0" Spacing="1" StartsNewPage="No">',
    '        <DynamicLabel Type="Page #"/>',
    '        <Text>.</Text>',
    '      </Paragraph>',
    '    </Header>',
    '    <Footer>',
    '      <Paragraph Alignment="Right" FirstIndent="0.00" Leading="Regular" LeftIndent="1.25" RightIndent="-1.25" SpaceBefore="0" Spacing="1" StartsNewPage="No">',
    '        <Text></Text>',
    '      </Paragraph>',
    '    </Footer>',
    '  </HeaderAndFooter>',
    '  <PageLayout BottomMargin="72" BreakDialogueAndActionAtSentences="Yes" DocumentLeading="Normal" FooterMargin="36" HeaderMargin="36" TopMargin="72" UsesSmartQuotes="Yes">',
    '    <PageSize Height="11.00" Width="8.50"/>',
    '    <AutoCastList AddParentheses="Yes" AutomaticallyGenerate="Yes" CastListElement="Cast List"/>',
    '  </PageLayout>'
  );
  out.push(...smartType(els));
  out.push(
    '  <MoresAndContinueds>',
    '    <FontSpec' + attrs({ Font: FONT, Size: 12, Style: 'AllCaps' }) + '/>',
    '    <DialogueBreaks AutomaticCharacterContinueds="Yes" BottomOfPage="Yes" DialogueBottom="(MORE)" DialogueTop="(CONT&apos;D)" TopOfNext="Yes"/>',
    '    <SceneBreaks SceneBottom="(CONTINUED)" SceneBottomOfPage="No" SceneTop="CONTINUED:" SceneTopOfNext="No"/>',
    '  </MoresAndContinueds>'
  );
  if (marked && marked.size) {
    const name = String((meta.marks && (meta.marks.name || meta.marks.label)) || 'Revision').trim() || 'Revision';
    out.push(
      '  <Revisions ActiveSet="1" RevisionMode="No" RevisionsShown="Active" ShowAllMarks="No" ShowAllSets="No">',
      '    <Revision' + attrs({ FullRevision: 'No', ID: '1', Mark: '*', Name: name, Style: '' }) + '/>',
      '  </Revisions>'
    );
  }
  out.push('</FinalDraft>');
  return out.join('\n') + '\n';
}

export default { toFDX, smartTypeLists, FDX_MIME };
