/* ============================================================
   PLANS — the tier ids, their order and their display names
   ------------------------------------------------------------
   PURE, and kept that way on purpose: billing.js imports store.js and
   reads window, so the build cannot evaluate it, and start.html's
   "Pricing" section is stamped at BUILD time (vite.config.js,
   `fms-start-figures`) from this one constant. billing.js re-exports
   both, so every app caller is unchanged. Names and order only — the
   PRICES live in the server's plans table and nowhere in the client.
   ============================================================ */
export const PLAN_ORDER = ['free', 'starter', 'indie', 'pro'];

export const PLAN_NAMES = { free: 'Free', starter: 'Basic', indie: 'Intermediate', pro: 'Pro' };

/* THE LIST PRICE, IN WHOLE RUPEES. The server's plans table is what
   the checkout charges and `quote_order` is the only pricer — this is
   the sales page's copy of the same figures, and the page says
   "confirmed at checkout".

   It is HERE rather than in vite.config.js because two readers need
   the identical number: the build stamps it into start.html's pricing
   list, and start.js prints it beside the coming price when a rise is
   scheduled. The alternative was reading "₹799" back out of the DOM
   and parsing it, which is how a wrong price ships.

   It is the price BEFORE any scheduled rise. The rise itself lives in
   the database (plans.next_price_paise / next_price_at) and reaches
   the page through price_notice() at runtime, never through the
   build — a figure frozen into the HTML would be a claim the server
   could contradict an hour later. */
export const LIST_PRICE = { free: 0, starter: 599, indie: 799, pro: 999 };

/** "₹799", in Indian digit grouping. 0 renders as "₹0"; callers that
 *  mean "not for sale" check the number, not this string. */
export const inr = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN');

/* matrixFeatures() lives in src/lib/plan-matrix.js. This file is in the
   CORE chunk (billing.js imports it), and importing the matrix JSON here
   put the whole matrix into every page's first paint the moment anything
   else imported it dynamically. */

export const planName = (id) => PLAN_NAMES[id] || id;
