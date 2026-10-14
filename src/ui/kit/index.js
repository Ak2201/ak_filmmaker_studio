/* ============================================================
   THE KIT — Swiss Precision components, one import path
   ------------------------------------------------------------
     import { button, badge, pageHeader, … } from '../ui/kit/index.js';

   Pure builders over h() (src/lib/dom.js): no inline handlers, no
   storage, no global listeners; null children are skipped. Styles are
   src/styles/kit.css, imported once by chrome.js. Reference and
   examples: docs/DESIGN-KIT.md; every component in every state:
   kit.html (dev only, `npm run dev` → /kit.html).
   ============================================================ */
export { sym, cx } from './util.js';
export { button, buttonGroup } from './button.js';
export { badge, todBadge, intExtBadge, doodCode, todKey } from './badge.js';
export { chip, CATEGORIES } from './chip.js';
export { pageHeader, eyebrow, projectTitle } from './page-header.js';
export { statCard, statStrip } from './stat.js';
export { panel } from './panel.js';
export { segmented, selectSegment, wireSegmented } from './segmented.js';
export { field, fieldInput, check, formatEighths, parseEighths } from './field.js';
export { table } from './table.js';
export { strip, stripBanner, stripList } from './strip.js';
export { notice } from './notice.js';
export { emptyState } from './empty.js';
export { meter, setMeter } from './meter.js';
export { stageCard } from './stage-card.js';
export { toast, toastSuccess, toastError, toastInfo } from './toast.js';
export { ask, askDanger, tell, askText } from './modal.js';
