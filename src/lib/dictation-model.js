/* ============================================================
   DICTATION MODEL — what a spoken transcript means, as pure functions
   ------------------------------------------------------------
   The recogniser half is src/ui/dictation.js. This file turns what it
   heard into text and line breaks, so it runs in Node
   (npm run test:dictation) with no microphone.

   THREE SPOKEN COMMANDS, English only (other languages are inserted as
   heard — a Tamil "new line" is not ours to guess):
     "new line" / "next line" / "new paragraph"   end the line (Return)
     "period" "full stop" "comma" "question mark" "exclamation mark/point"
                                                    the mark, not the word
   A command is only a command when it is the WHOLE phrase: "she draws a
   line" has no "new line" in it, and "a new line of work" is a speech.
   The match is on the spoken words as the recogniser wrote them, so a
   transcript "New line." with its own full stop is still a command.

   A PAUSE is the recogniser's own: it ends a result at a breath, and a
   final result is then one `segment`. A segment ends the line (as Return
   does) only when `formatsOnReturn` says the line is something the
   auto-format would act on — "Preethi says hello", a known name alone, a
   transition. Plain prose keeps growing on the same line until the writer
   says "new line", so a breath in the middle of a speech does not cut it.
   ============================================================ */

/** True where the browser has a speech recogniser (Chromium). */
export const dictationSupported = () =>
  !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);

/** The one-time question, in dialog.js's own words. */
export const DICTATION_NOTICE = {
  eyebrow: 'Dictation',
  icon: 'mic',
  title: 'Turn on dictation?',
  body: 'Dictation uses your browser\u2019s own speech recognition. In Chrome, the audio is sent to Google to be turned into text, and the studio never receives it. Your microphone is used only while dictation is listening, and you can turn it off again in Settings. Other browsers may not support it.',
  confirm: 'Turn on dictation',
  cancel: 'Not now'
};

const BREAKS = /^(?:new line|next line|new paragraph|newline)$/i;
const MARKS = [
  [/\b(?:question mark)\b/gi, '?'],
  [/\b(?:exclamation (?:mark|point))\b/gi, '!'],
  [/\bfull stop\b/gi, '.'],
  [/\bcomma\b/gi, ','],
  /* "period" is also a word ("a period drama"): a mark only as the last
     word of a phrase. */
  [/\s+period$/i, '.']
];

const isEnglish = (lang) => /^en\b/i.test(String(lang || 'en'));

/** Spoken marks to symbols: "hello comma world" -> "hello, world". Only
    the standalone word is replaced, and only in English. */
export function speakMarks(text, lang = 'en') {
  let t = String(text ?? '');
  if (!isEnglish(lang)) return t.trim();
  for (const [re, mark] of MARKS) t = t.replace(re, mark);
  return t.replace(/\s+([.,?!])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** A final transcript as parts: [{ text, newLine }] — `newLine` means a
    spoken "new line" ENDED this part. A transcript that is only the
    command is one part with no text. */
export function splitSpoken(transcript, lang = 'en') {
  const raw = String(transcript ?? '').trim();
  if (!raw) return [];
  if (!isEnglish(lang)) return [{ text: raw, newLine: false }];
  const bare = (s) => s.replace(/[.,!?]+$/g, '').trim();
  const parts = [];
  let buf = [];
  // Words, kept in order; a break phrase is two words (or one).
  const words = raw.split(/\s+/);
  const flush = (newLine) => {
    const text = speakMarks(buf.join(' '), lang);
    if (text || newLine) parts.push({ text, newLine });
    buf = [];
  };
  for (let i = 0; i < words.length; i++) {
    const one = bare(words[i]);
    const two = i + 1 < words.length ? bare(words[i] + ' ' + words[i + 1]) : '';
    /* Only a command at the START or the END of the phrase: a "new line"
       in the middle of a sentence is that sentence's own words. */
    if (two && BREAKS.test(two) && (i === 0 || i + 2 >= words.length)) { flush(true); i++; continue; }
    if (BREAKS.test(one) && (i === 0 || i + 1 >= words.length)) { flush(true); continue; }
    buf.push(words[i]);
  }
  if (buf.length) flush(false);
  return parts;
}

/** Does this part end the line? A spoken "new line" always does; a pause
    only when `formatsOnReturn(text)` says the line is something the
    auto-format would act on. */
export function shouldBreak(part, formatsOnReturn) {
  if (!part) return false;
  if (part.newLine) return true;
  return typeof formatsOnReturn === 'function' ? !!formatsOnReturn(part.text) : false;
}

export default { dictationSupported, DICTATION_NOTICE, speakMarks, splitSpoken, shouldBreak };
