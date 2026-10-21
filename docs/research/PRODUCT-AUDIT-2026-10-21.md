# FilmMakerStudio: combined review, 21 Oct 2026

## 1. Summary

- **33 bugs survived an adversarial check**: 14 high, 15 medium and 4 low. Another 7 claims were rejected (see the appendix). Most of the high ones lose or misplace saved work, which is the thing this product cannot afford. That covers stale copies overwriting newer ones, restores that duplicate or strip data, imports that drop lines, and money parsed 100,000x too small.
- **Billing has four serious defects to fix before a live Razorpay key goes in.**
  - Money is captured before the plan can be refused. The buyer then has no refund path.
  - Upgrade credit is user-wide, so it can be spent on another organisation and counted twice.
  - A payment that is captured but not yet verified puts the BUY button back.
  - A refund can be marked "failed" when its outcome is unknown, so a retry can refund twice.
- **One bug is hurting users now, because the purchases switch is ON.** If someone types an invite code before signing in, it is redeemed without starting its 7-day trial, so they hit the wall. That is the regression CLAUDE.md says was fixed.
- **The growth and first-run path works against conversion.**
  - The trial is 30 minutes and only covers the sample film, while the landing page promises "write scene one".
  - Share links lose their token for anyone signed out or without a plan.
  - Referral codes from the "Made with" line are dropped on arrival.
  - The live census shows 0 people in a trial and 3 of 6 members walled.
- **The simulation (24 model-played personas, not real people) points the same way.** Objections were about trust (11 of 24 named a new or unproven tool), import/export fidelity (6) and privacy (5), not price. Nobody said a firm yes to paying. The 1 Nov countdown put off 10 and pushed only 1.

## 2. Bugs to fix

Ranked by severity, then by harm: money and security first, then data loss, then display.

| # | Severity | File:line | What breaks | Fix |
|---|---|---|---|---|
| 1 | high | supabase/functions/rzp-verify/index.ts:104 | Money is captured, then `activate_payment` refuses (code used up, or credit gone). The row stays `created`, so neither `request_refund` nor `begin_refund` will refund it, and the webhook gives up with a 200. | Check whether the payment can activate before `/capture`. Record a refused-after-capture payment as a refundable status. |
| 2 | high | supabase/schema/schema-52-yearly-plans.sql:92 | `paid_credit_paise` adds up every org the user owns. Credit from org A buys Pro on org B, A keeps its plan, and a third org counts the credit twice. | Calculate credit and the current plan per target account. Store that account on the payment and apply the plan to it. |
| 3 | high | src/lib/cloud.js:683 | A code entered before sign-in is redeemed through `redeemPending()`, which never calls `startCodeTrial()`. With purchases ON, the member is walled. The extension's `panel.js` has the same gap. | Call `startCodeTrial()` after a successful `redeemPending()` (and after `redeemCode` in panel.js). Update the comment. |
| 4 | high | src/lib/backup.js:479 | An imported backup's `sync_config` overwrites `fms_supabase_cfg_v1`. Sign-in and all sync then go to whatever Supabase project the file names, and nothing on screen shows it. | Remove `sync_config` from `GLOBAL_KEYS` and `V1_KEYS`, strip it on export and import, and list it with the Drive pointer as deliberately excluded. |
| 5 | high | src/lib/cloud.js:1783 | The offline queue is one global key with no uid. Account A's unsent project is uploaded as account B's when B signs in next on the same browser. | Stamp each op with its uid and flush only the current session's ops. Narrow `known` to `listProjects()`. |
| 6 | high | src/lib/cloud.js:1556 | `_pushScope` stamps `updated_at` with the send time. A stale edit made offline uploads late, wins, and overwrites a newer edit on another device. | Send `localClock(pid, scope)` as `updated_at`, and compare against the server row before flushing. |
| 7 | high | src/pages/write.js:1153 | Synopsis-to-script writes its pages behind write.js's in-memory `doc`. The next `persistNow()` (a Coverage checkpoint, for example) erases them, and Resume will not rewrite them. | Reload `doc` after each batch commit, or have `applyBatch` write through the page's own copy. |
| 8 | high | src/lib/drafts.js:126 | Restoring a draft runs `delete doc.numbering`. Locked scene numbers, the OMITTED placeholders and the locked pages are all lost, while the dialog says "nothing is lost". | Re-key the numbering through each line's `liveId`. At least warn in `restoreDialogSpec`. |
| 9 | high | src/lib/story-io.js:72 | `isEmptyStory` ignores the conflict, genre, audience, comps and tension fields. "Use Dragon" wipes them with no confirmation and no undo. | Count every writable field in `isEmptyStory`. Keep the Story Bible and market fields when loading a sample, or offer undo. |
| 10 | high | src/lib/money.js:50 | "2 lakhs", "1.5 crores", "12 lacs" and "25k/day" parse as the bare number, 100,000x / 10,000,000x / 1,000x too small, in every budget and cost path. | Allow plural suffixes (`lakhs?`, `crores?` and so on) inside the whole-string match. Add tests, including "1500 per roll" staying 1500. |
| 11 | high | src/lib/screenplay-analysis.js:160 | `matchScenes()` ignores `scriptElId`. With a repeated location, a heading inserted above, and rows reordered, Auto-Tag, ADD ALL, Re-measure and the cast matrix pair scenes with the wrong script text and label the match confident. | Keep the heading id on each slice and link on `scriptElId` first. |
| 12 | high | src/lib/script-import.js:496 | The page-number, MORE, CONTINUED and revision-header filters run before the Word style is read. Styled dialogue "1987." and action "Revised" vanish on the studio's own .docx and .txt round trip. | Read `forced` first and skip the furniture filters for styled lines. Report every discard in the warnings. |
| 13 | high | src/lib/screenplay-export.js:307 | Locking pages with no edit adds a phantom "1A" page holding only OMITTED, when an OMITTED row had overflowed to the top of a page. | Flush the locked break before placing that element's OMITTED rows, or skip the break when the page holds only OMITTED. |
| 14 | high | src/lib/backup.js:512 | Restore checks clashes only within the open namespace. A project from another namespace is re-minted as a same-titled duplicate on every Drive pull, and a stale copy can later overwrite another device's edits. | Build `taken` from `listAllProjects()`, and handle a clash across namespaces explicitly. |
| 15 | medium | src/lib/billing.js:203 | When rzp-verify answers 202 pending or fails on the network after payment, the BUY button comes back with stale billing. A second press stacks a second year. | Keep the plan's button disabled after Checkout returned a payment, refresh billing on rejection, and poll. Optionally refuse a duplicate order on the server. |
| 16 | medium | supabase/functions/rzp-refund/index.ts:109 | A network error after Razorpay accepted the refund is recorded as `failed`. That unblocks a retry with a fresh idempotency key, so a partial refund can pay out twice. | On an unknown outcome, leave the row `initiated` and look up the refund by receipt before recording anything. |
| 17 | medium | src/lib/purchase-model.js:117 (the verifier found it at line 96) | Every lapsed buyer reads "plan ended on Jan 1, 1970", because `plan_until` is always null when `lapsed` is true. | Client: drop the date when it is not finite. Server: return `plan_until` after a lapse (a new schema section, with a checksum). |
| 18 | medium | src/pages/pricing.js:105 | After the scheduled rise fires, the public cards, the per-day figure and the JSON-LD still say ₹599 while checkout charges ₹999. The rise can be triggered by the 100th buyer, so there is no fixed date to rebuild for. | Overwrite the markup prices from `notice.plans[].price_paise` wherever they differ. Add an owner step to bump `LIST_PRICE` and rebuild. |
| 19 | medium | src/lib/cloud.js:2541 | On an offline cold start the token refresh fails, `boot()` clears the account pointer, and the next page opens the device studio. Work written offline lands outside the account. | Do not clear the account on a retryable or network error, or when `navigator.onLine` is false. |
| 20 | medium | src/lib/drive-sync.js:361 | Restoring an earlier Drive revision records the device as synced. The restored content never becomes the head, and status says "Up to date". | Push right after a revision restore. |
| 21 | medium | src/lib/drive-sync.js:635 | `autoConnectIfGranted()` runs `reconcile()` even when Supabase owns sync. Drive then pushes and pulls automatically in what should be MANUAL mode, and can pull an older snapshot over the cloud data. | Skip reconcile when `ownsSync()` is true, or guard inside `_doReconcile`. |
| 22 | medium | src/lib/breakdown-run.js:176 | Run breakdown, called without `prev`, resets the location, INT/EXT and time typed on every linked row back to its heading. Undo covers only cast tags. | Pass `keepLinked: true` (or the previous heading map), and include field changes in undo. |
| 23 | medium | src/lib/locations.js:361 | Stripboard UNDO toasts never expire and restore whole day-order snapshots. Pressing an old one wipes later reordering, or a clear or reschedule. | Dismiss the previous move toast on each new move, clear, or auto-schedule. Refuse the undo if the lists have changed since. |
| 24 | medium | src/ui/budget.js:285 | Reset reuses ids `ci_1` to `ci_n`, so old expenses, crew lines, department overrides and version comparisons attach to unrelated new lines. | Start new rows above the highest id ever used. |
| 25 | medium | src/pages/story.js:1362 | The never-expiring UNDO after Build synopsis rolls back every synopsis edit and tag made since. There is one undo level, so that work is unrecoverable. | Invalidate the undo on the first later edit, or ask before restoring over changes. |
| 26 | medium | src/lib/ai-tasks.js:279 | Coverage Accept saves the latest run's report, filtered by the shown version's positional ids. The saved report is not the one the writer reviewed. | Use `remember()`/`recall()` like the other tasks. Check story-map and scene-notes too. |
| 27 | medium | src/lib/script-import.js:340 | On a Fountain round trip, a short shouted dialogue line before a parenthetical ("HEY") becomes a new character cue. | Inside a glued speech block, do not treat a capitalised line as a new cue unless a blank line precedes it. |
| 28 | medium | src/ui/shell.js:1622 | Rotating a phone from landscape to portrait leaves `--sh-chrome-h` at 0px, so the pinned tab strip hides under the 56px band until a reload. | Never put the band element through the parked test. Add a `prove:scroll` rotation case. |
| 29 | medium | src/sw.js:69 | The "Make today available offline" pack is named per build and deleted by the next deploy. The bookmarked `/shoot` then opens the hub offline. | Give the pack a stable name and keep it in `KEEP`, then refresh its pages on activate. |
| 30 | low | src/ui/plan-cards.js:579 | Promo quotes taken before a purchase stay afterwards, showing a price without the new upgrade credit. The charge itself is correct. | Clear `promo.quotes` and `promo.code` on success, or key quotes on the plan held. |
| 31 | low | src/lib/ai-tasks.js:392 | Dialogue pass Accept merges onto the text captured at Run time, overwriting edits made in the docked editor since. | Refuse when `el.text !== result.original`. |
| 32 | low | src/lib/script-import.js:514 | Word import collapses the Shift+Return line breaks a writer typed inside an element. The exporter keeps them, and the importer joins them with spaces. | Mark continuation lines of a styled paragraph and join those with `\n`. |
| 33 | low | src/lib/start-model.js:86 | The price-rise date is formatted in the visitor's own timezone. East of IST the page shows "until 1 November" when the rise happens at 23:59 IST on 31 Oct. | Pass `timeZone: 'Asia/Kolkata'`. |

### The high-severity bugs in brief

**1. Capture before refusal (rzp-verify).** Suppose a limited promo code is used up, or the upgrade credit disappears, during the order's hour. Checkout authorises, rzp-verify checks only the amount and captures, and `activate_payment` then raises 22023. The exception rolls back, so the row stays `created` with no `razorpay_payment_id`. The buyer is told to ask for a refund from Settings, but both refund paths refuse a payment that is not `paid`. A refund made by hand in the dashboard cannot be matched either. The buyer has paid, has no plan, and has no path inside the product. It is reachable through two tabs on a single-use code, a hold that lapses after 60 minutes, or an admin lowering `max_uses`.

**2. Upgrade credit across orgs (§52).** `acc_insert` lets a user create more organisations. `quote_for` prices an upgrade with credit from every org the user owns. `rzp-order` passes `account_id` from the client, and `activate_payment` applies the plan only to that account. The result is Pro on B for "Pro minus Basic" while A keeps Basic. A third org counts the credit again. A genuine multi-org buyer can hit this without tampering, because `account_for_buyer` defaults to the newest org.

**3. Invite code typed before sign-in starts no trial.** `submitCode()` verifies the code into a session ticket and sends the visitor to Google. On return, `runGate()` redeems the pending ticket, the status now reads registered, and the only branch that calls `startCodeTrial()` is skipped. `redeem_invite()` never writes `trial_started_at`. With the switch ON (live since 19 Oct), that member is walled on their first page.

**4. Backup switches the Supabase project.** Anyone who imports a backup carrying `global.sync_config = {url, key}` has their sign-in, sync pushes and site-gate membership reads sent to that project. CSP allows any `*.supabase.co`, and nothing visible changes. Even with no attacker, restoring an old backup taken while an override was set would quietly point the browser back at the old project. The value is a destination, for the same reason the Drive pointer is kept out of backups.

**5. Offline queue crosses accounts.** On a shared browser, A's project-create fails offline and A chooses "Sign out anyway", which the dialog says is safe. B then signs in. The flush counts A's project as known (because `listAllProjects()` spans every namespace), inserts it with `owner_id = B`, and upserts A's screenplay as B's data. If the project already exists under A, B gets endless 42501 retries and a toast instead.

**6. Send-time stamps.** Device A edits offline at 10:00, and device B edits the same scope at 11:00 and pushes. A comes back at 12:00 and flushes with `updated_at` 12:00. B then accepts the remote copy as newer, and its 11:00 edit survives only in the salvage ring, which nothing reads automatically. The server trigger leaves `updated_at` as the client sent it.

**7. Generated script pages erased (write.js).** On `write.html?stay=1`, accepting "Next 4 scenes" or "Write all N scenes" saves through a fresh `loadScript()`. The page's own `doc` is never reloaded. A Coverage run on the same page, or any other `persistNow`, writes the old elements back. The job cursor has already moved on, so Resume will not rewrite them.

**8. Draft restore drops the lock.** A production locks its scene numbers (12, 12A, OMITTED 14) and its pages, and hands out sides. The writer then restores the latest draft. `restoreDraft()` deletes `doc.numbering`, and snapshots never stored it. Locking again renumbers by position, so the breakdown, stripboard and call sheets now point at different scenes. The dialog says "nothing is lost".

**9. Sample wipes the Story Bible.** A writer fills only the Conflict card, or accepts the Desk's genre task, and then presses "Use Dragon". `isEmptyStory()` says the story is empty, no confirmation appears, and the conflict, genre, audience, comps and tension fields are overwritten. Undo is cleared at the same time. When a confirmation does appear, it names only the idea, logline, outline and synopsis.

**10. Plural lakhs and crores.** "1.5 lakhs" typed as a rate is stored as ₹1.5. The same happens in the estimator, the cost report, the top sheet, crew accounts and locked versions, and nothing errors. The function's own docs accept "1.5 lakh", so the plural is simply missing from the whole-string match.

**11. Repeated locations mis-pair scenes.** Take two "INT. KITCHEN - DAY" headings, insert a heading above them, and drag one row above the other. `matchScenes()` pairs each row with the other heading's slice and labels it "heading" (confident). ADD ALL writes the wrong cast and props, and Re-measure swaps their lengths. `breakdown-run.js` already uses `scriptElId` correctly, which shows the exact link exists.

**12. Styled lines dropped on import.** MANI: "1987." and an action line "Revised", exported to .docx and imported again, both disappear. Only the first is counted as a "page number"; the second is dropped silently. The module's rule is "no line is ever dropped", and its docx comment says the style decides outright.

**13. Phantom page on lock.** If an OMITTED row overflowed to the top of page 2, pressing "Lock page numbers" with no edit produces 3 pages labelled 1, 1A and 2, where 1A holds only OMITTED. A probe reproduced it. The lock exists to stop exactly this kind of page drift.

**14. Drive duplicates across namespaces.** A device-only project (adoption declined) is in the Drive file because export spans all namespaces. Each pull on the same device files it again as a new uuid with the same title and no "(imported)" marker, and copies accumulate. Later, a stale copy pushed from one device can overwrite another device's edits through the restore path. It is reachable through "Use Drive version" or a revision restore while signed in, and through auto-pull in the open or offline-grace signed-out case.

## 3. Improvements

Duplicates across the four analysts and the simulation's requests are merged below. Evidence is marked **code** (an analyst cited files), **sim** (only the simulated panel raised it) or **both**. Sim-only items were not checked against the product, so some may already exist and simply be missing from the brief.

### High impact, small effort (do first)

| Idea | Effort | Evidence |
|---|---|---|
| **Make the trial a real trial.** It is 30 minutes and only on the sample. State the length before the Google step, and consider 7 days on the person's own project (`trial_minutes` 10080, `trial_scope` 'full', set in the console with no deploy). Fix the button reading "START MY 30 MINUTES". Either let a trial create one project, or reword start.html's "Open the studio and write scene one". Merges first-run #1 and #2 with pricing #1. | S | both: `first-run.js renderSampleOnly`, `invite.js`, `trial-time.js`, census in_trial 0 / walled 3. Sim: 6 asked for a stated trial length or a free/student tier, and 4 named no free plan / unstated trial as their top objection. |
| **Keep referral codes through to purchase.** `?ref=` lands on `/start`, where nothing reads it, and purchase.html keeps it only in memory, so it does not survive the Google round trip. Stash it the way `INVITE_PLAN_KEY` is stashed. | S | code: `footer.js brandURL()`, `brand.json` path `/start`, `purchase.js:49-54` |
| **Turn Songs back on** for Indian features. The model and the stripboard grouping are already built. | S | code: `plan-matrix.json` songs `plans: []`, `OFF_BY_DEFAULT`. Needs §36 regenerated and re-run live. |
| **Call-sheet scene drift warning plus resync.** The sheet copies its day's scenes once. Show "board now has 14, 15A; this sheet lists 12", as dates already do. | S | code: `contacts.js:915-919`, `renderSchedLine()` |
| **Pre-fill "Who is called" from cast tagged on the day's scenes**, and flag mismatches both ways. | S | code: `contacts.js:488-520`; `costs.js castNames()` already matches contacts to cast |

### High impact, medium or large effort

| Idea | Effort | Evidence |
|---|---|---|
| **Fix share links for recipients who are signed out or have no plan.** The gate redirects before `handleSharedLink()` finishes, `rememberReturn` drops the query string, and sitegate has no exemption for a held share token. | M | code: `cloud.js:2554`, `sitegate.js deny()`, `chrome.js:1617` |
| **Put the "Made with" line and ref link on the screenplay PDF and .docx, sides and reports** for non-Pro plans. Today it shows only when printing contacts, story or feature, and the settings toggle promises it on pitch decks nobody can make. | M | code: `footer.js BRANDED_PAGES`; grep finds nothing in the export modules |
| **Cast, crew and location availability with conflict warnings** on the stripboard and in readiness. | M | code: `contacts.js blankContact()` and `locations.js blankRecce()` have no dates; no conflict logic anywhere |
| **Grapheme-aware wrapping** so Tamil dialogue does not inflate pages, eighths, screen time and budget days by about 1.7x. `slice()` can also cut a letter in half. | M | both: `screenplay-export.js:142 wrapText()`; probe 60 units vs 35 graphemes. Sim: Malayalam and Telugu personas made script support the condition of their interest (2). |
| **An "Owed" list on the stripboard**: part-shot and dropped scenes plus edit-log pick-ups, with "move to Day N". | M | code: `shoot.js:200`, `editlog.js listPickups()` used only on edit.html, `placeScene()` exists |
| **A per-actor WhatsApp message** with only their scenes, character, costume and make-up call. | M | code: `callsheet-text.js:138-150` sends everyone the full list |
| **Crew pay from days actually worked and overtime**, from DPR records against `DAY_HOURS = 12`. | M | code: `costs.js derivedDays()`, `dpr.js dprSummary()` |

### Medium impact

| Idea | Effort | Evidence |
|---|---|---|
| **Import contacts from CSV, vCard or paste.** | S | both: no import in contacts; `waDigits` can be reused. Sim: import/interop requests (3), and the 1st AD's top objection was no Excel import. |
| **Send the DPR as a WhatsApp message** (`dprMessage()` next to `unitMessage()`). | S | code: `reports.js:809`, `dpr.js dprSummary()` |
| **Bring back the Pitch Deck** (and Lookbook) for OTT and producer pitches. | S | both: `plan-matrix.json` pitch-deck `plans: []`; `pitch-deck.js` exists. Sim: the crowdfund producer asked for a pitch deck and a budget top-sheet PDF. |
| **Fix the sign-up modal's "Create a free account".** There is no free plan (§38), and "Log in" and "Continue with Google" are the same action. | S | code: `marketing-site.json signup.heading`, `make-marketing-pages.mjs ~245` |
| **Replace the "invite-only" og, twitter and meta descriptions on invite.html**, which is now the offer page. | S | code: `invite.html` head |
| **Correct first-run copy.** "Stays in this browser unless you sign in" is untrue under the gate, and "then open your script" actually lands on dashboard.html. | S | code: `first-run.js`, `project-setup.js PROJECT_HOME_URL` |
| **Point the empty dashboard at the writer.** "Add the scenes" goes to breakdown.html. Offer "Write scene one" or "Import a script". The tour's "start your own film" is a dead end for sample-only users. | S | code: `dashboard.js ~303`, `tour.js ~358` |
| **Stop saying "Granted to you for good"** when `plan_until` is merely missing. Check grant status explicitly. | S | code: `purchase.js:216`, `plan-cards.js:290` |
| **Plan boundaries.** Move Drive backup to Basic (data safety should not be an upsell, and the trial already has it). Stop leading Pro with the AI Desk, which has never been run against a real provider. | S | both: `plan-matrix.json`, CLAUDE.md item 34. Sim: privacy, offline and exit guarantees requested by 4. |
| **Send new sign-ins straight to the offer** rather than through the veiled hub (three redirects plus a blank pause). Keep the return URL directory-style because of the 308 trap. | M | code: `invite.js` CLOSED-branch comment |
| **Renewal reminders before a yearly plan lapses**, and state what year two costs after the rise. Needs Resend configured. | M | code: `functions/` has no reminder function; `priceRiseBand()` copy; §35 Resend unset |
| **Members can send their own screening passes** (watermarked, branded, carrying `?ref=`), Intermediate and up. | M | both: today passes can only be issued from the admin console. Sim: the assistant writer asked for watermarking. |
| **Call-sheet acknowledgements** ("seen / confirmed") through the public call-sheet view. Needs a schema section first. | M | code: `public-view-model.js`, `callsheet-text.js` |
| **A script-supervisor continuity log** (slate, timing, lens, sound roll) on the takes log. | M | both: `shootday.js cleanTakes()` keeps only n, circled, note and at. Sim: the 2nd AD asked for phone continuity notes. |
| **Daily spend against the per-day plan.** | M | code: `costs.js` expense `shootDay` is unused in `costReport()`; `schedule-impact.js perDayCost()` |
| **A "revised since locked" tag** on the call sheet, sides and shoot card. | M | code: `drafts.js hashElements()`; no revision references in contacts, shoot or reports |
| **Regional rate cards** (Hyderabad, Kochi, Mumbai, Bengaluru), using the checked-figure-plus-band pattern. | L | both: only Chennai data in `src/data`. Sim: editable rate cards, other cities or multi-currency (3). |

### Low impact

| Idea | Effort | Evidence |
|---|---|---|
| Make the favourite-film question optional, or pre-select a default. | S | code: `project-setup.js` |

### Simulation-only requests (not checked against the code)

- Team or org accounts with roles and permissions (3)
- GST invoices (2)
- Onboarding: tutorials, a Tamil format guide, a demo video (2)
- A plain statement of who can see a script, plus offline and exit guarantees (4, overlapping the Drive item above)
- A student or education tier (3, including the film-school faculty)
- Import from Celtx files and Premiere/Resolve EDL or XML (editor, Celtx writer)

## 4. What the simulation says

This was a simulated launch reaction: one model played 24 personas over two rounds, reading only the brief. **It is not market research.**

- **First impression:** 14 curious, 10 skeptical. Only 1 (the Chennai debut director) would try it today. 12 would try later in round 1, rising to 14 in round 2.
- **Pay before the rise:** 0 yes, 20 maybe, 4 no in round 1, then 0 yes, 15 maybe, 9 no in round 2. 5 moved from maybe to no and nobody moved toward paying. Final recommend: 0 yes, 21 maybe, 3 no.
- **The price-rise answer:** the countdown did not create urgency.
  - 1 said it pushes them to buy now, 10 said it reads as pressure and puts them off, and 13 said it had no effect.
  - All 6 hobbyists and creators were put off.
  - 4 round-2 replies told others "don't buy because of 1 Nov".
  - Pay after the rise was 1 yes, 17 maybe, 6 no, barely different. One persona noted "the gap is only a few hundred rupees". The faculty member said procurement takes longer than the deadline.
- **Objections:**

  | Objection | Personas |
  |---|---|
  | New, unproven, small team, might shut down | 11 |
  | Import/export gaps and fidelity | 6 |
  | Privacy, Google sign-in, data control | 5 |
  | No free plan, or trial length unstated | 4 |
  | Wrong fit for my role | 4 |
  | No team admin, GST or licence | 3 |

  Almost every persona called the price trivial.
- **Segments:**
  - Writers were the hardest: 3 of 5 final no on paying, and 2 of the panel's 3 "would not recommend".
  - Producers, directors and buyers were the most open (4 of 6 maybe), but all 3 "more negative" shifts came from them.
  - Non-Tamil personas were 3 of 3 maybe, conditional on their script being supported.
  - Crew split 2 maybe and 2 no, mostly "I'm not the buyer".
- **Word of mouth:** 5 of the 6 replies to the Chennai debut director were cautions to export .fdx or Fountain and keep their own copy.
- **Caveats:** one model voiced every persona, so agreement may be overstated. Some "the brief never says…" objections may describe features that exist. "Nobody answered" (24 of 24) is a property of the setup, because no vendor was present. 4 personas labelled themselves "no change" while their pay answer fell.

**What it adds to the code findings:** trust and exit are the barrier, not price. That supports Drive on Basic, a clear privacy statement, the import and export bugs above (#12, #27, #32) and a longer trial over a sharper countdown.

## 5. Suggested order of work

1. **Code-holder trial fix** (`cloud.js:683`, plus `panel.js`). It is walling people today with the switch ON, and the fix is a few lines.
2. **Take `sync_config` out of backups** (`backup.js:479`). It is a security fix and a small one.
3. **Stop silent overwrites of saved writing:** reload `doc` after batch commits (`write.js:1153`), carry the lock through draft restore (`drafts.js:126`), widen `isEmptyStory` and invalidate the build undo (`story-io.js:72`, `story.js:1362`).
4. **Plural lakhs and crores in `parseNum`** (`money.js:50`). One regex plus tests, and it protects every budget figure.
5. **Billing server fixes before a live key**, folded into the pending §52 function redeploy (CLAUDE.md item 55):
   - check activation before capture, and give a refused payment a refundable state (#1)
   - credit per account (#2)
   - unknown refund outcome stays `initiated` (#16)
   - client side: no re-enabled BUY after payment (#15), the 1970 date (#17), stale promo quotes (#30)
6. **Sync integrity:** stamp queue ops with the uid (#5), send the edit clock or compare before flush (#6), do not clear the account pointer when offline (#19).
7. **Drive:** cross-namespace clash in restore (#14), push after a revision restore (#20), no auto-reconcile while Supabase owns sync (#21). Add the `prove:drive` cases the fixes describe.
8. **Breakdown and import correctness:** link on `scriptElId` first (#11), `keepLinked` on Run breakdown (#22), style before furniture on import (#12), phantom lock page (#13), Fountain shouted line (#27).
9. **Conversion path:**
   - set the trial dials and make the landing copy match the trial
   - fix share links for signed-out and planless recipients
   - keep `?ref=` through to purchase
   - fix "free account" and the "invite-only" metadata
   - correct the public price after the rise (#18) and the IST date (#33)
10. **Production quick wins for the 1st AD:** call-sheet drift and resync, pre-filled cast, DPR on WhatsApp, Songs back on. Then the remaining medium bugs: stale stripboard undo (#23), budget id reuse (#24), Coverage accept (#26), phone rotation (#28), offline shoot pack (#29).

## 6. Appendix: rejected bug claims

- **v1 import can switch cloud sync off (backup.js).** No genuine v1 file can carry `cloudSync: 'off'`, because the field postdates v1. The reverse flaw is real and separate: a v1 import clears this device's `'off'` and re-enables sync.
- **A refund after the payment was spent as upgrade credit leaves the higher plan (schema-52).** §51's `begin_refund` refuses that order of refunds and asks for the upgrade to be refunded first.
- **Re-schedule and Clear days leave day records on the wrong scenes (stripboard.js).** This is intended: day records belong to the day number and are deliberately never swept, and both actions ask first.
- **The sunset check misses a wrap after midnight (sun.js).** This is a documented limitation in `laterWrap` and needs a 19-hour-plus day.
- **A skipped audience test stays "in progress" with the old panel (ai-tasks.js).** The designed resume path is documented, and nothing is corrupted. What remains is cosmetic.
- **Every account's projects go to whichever Google Drive is connected (drive-sync.js).** This is intended: the Drive file is per device, and it exposes nothing the local export does not already.
- **After a deploy, stale HTML makes lazy chunks 404 (sw.js).** The old chunks are still served from the one-year immutable HTTP cache. It only fails when that cache has been evicted at the same moment as a deploy.