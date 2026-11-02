/* An act break on a line of its own: "ACT TWO", "ACT II", "ACT 2",
   "END OF ACT ONE", "NEW ACT". Capitals only (case-SENSITIVE, like the
   importer's transition test): "Act one of the play begins." is action.
   Bare "ACT" is NOT one — it could be a character's name.

   The ONE copy, and import-free on purpose: the importer, the Fountain
   exporter and the editor's typing inference all read it, and the
   inference module must stay loadable in Node with no store behind it. */
export const ACT_LINE = /^(?:(?:END OF )?ACT (?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|I{1,3}|IV|V|VI{0,3}|\d{1,2})|NEW ACT|END OF (?:THE )?ACT)[.:]?$/;
/** "END OF ACT ONE" closes an act; any other act line opens one. */
export const isActEndText = (text) => /^\s*END\s+OF\s+/i.test(String(text ?? ''));
