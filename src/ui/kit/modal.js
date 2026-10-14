/* KIT · MODAL — the in-app dialog, re-exported
   The modal IS src/ui/dialog.js (the only confirm / alert / prompt in
   the app; a native one fails test:dialogs). It builds the Swiss
   modal — mono eyebrow, H3, body, an optional notice, a typed
   confirmation with a VERIFIED state, and an actions bar — styled by
   kit.css (.dlg.k-modal).

     ask({ title, body, eyebrow, icon, tone, notice, confirm, cancel,
           danger, typeToConfirm, checkbox })
     askDanger(...)   ask with danger: true (red confirm, danger tone)
     tell({ title, body, eyebrow, icon, ok })
     askText({ title, body, eyebrow, value, placeholder, confirm })

   notice: { tone, title, body } draws a kit notice inside the body. */
export { ask, askDanger, tell, askText } from '../dialog.js';
