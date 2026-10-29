# Live steps, 29 Oct 2026: round 2 and 2b (auto-pay wording §65, fonts, the purchase page)

Nothing here blocks a deploy of the build; the first step is the only database
change.

1. **Run `supabase/schema/schema-65-autopay-wording.sql` in the SQL editor**,
   after §62, pasted the base64 way (never through the clipboard as text: it
   corrupts em-dashes and the rupee sign). Compare the editor's SHA-256 to
   `122cf2292754bdc897f31e27d104706f0b1f729ffd3c93b98eb6abc79940b33c` before
   pressing Run. Read-back 65.1 should return `true`. §65 is not run live.
2. **No edge function redeploy is required for §65.** Redeploy `rzp-remind`
   only if the reminder-mail CTA label ("See auto-pay") should go live.
3. **Run `npm ci` or `npm install`** to pick up the three new `@fontsource`
   packages (`noto-sans`, `noto-sans-math`, `noto-sans-symbols-2`). The glyph
   fallback faces now also read `noto-sans-symbols-2`'s `symbols` and `math`
   files, so a build without them fails.
4. **Look at the rail trial row at 1440 and 390.** The caps lane restyled it
   but nobody has seen it in a browser.
5. **Look at the purchase page at 1440 and 390**, signed out and signed in:
   the rework (single price line, signed-out cards, the "Read this before you
   purchase" block) was checked by proofs and the lane's screenshots only. The
   final pass also moved the comparison table into the page: check that "N more
   in the comparison" opens it and that Intermediate reads 13 here and on
   pricing.html.
6. **Re-record the call-sheet marketing images** (`public/marketing/call-sheets-*.webp`,
   `npm run record:marketing`) on a machine with a browser that has the fonts:
   the sheet lost its pink rule and teal border and wears the brand selection
   fill now, and the recorded images still show the old colours.
7. **Print the Call Sheets tab once** (Save as PDF): the sliver border is gone
   and the page header and stat cards are hidden, but print was fixed from the
   report, not seen.
