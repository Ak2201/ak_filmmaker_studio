# Launch checklist — what only the owner can do

Written 7 Oct 2026. Everything in the code that could be done for a
public launch has been (CLAUDE.md open items 17–18). What is left needs
an account, a credential or a decision that lives outside this repo.
Work it top to bottom; each step says how to check it is done.

## 1. Decide the door

The site is INVITE-ONLY (`npm run build` has the gate on). A stranger who
clicks an ad lands on `invite.html`. The public landing page `start.html`
is outside the gate and links in. Two choices:

- **Keep the gate** and sell through "Request an invite" → approve in the
  console → they pay. Slow for the buyer; you see every name first.
- **Open the gate** (`VITE_SITE_GATE=off` in `.env`, rebuild, redeploy) and
  let paying be the door (activation inserts the member row, so a payer
  is through with no code). Faster; strangers can reach the free tier.

Check: open the deployed host signed out in a private window and see
which page you land on.

## 2. Publish the Google consent screen

Google Cloud project `filmstudio-495419` is in **Testing with zero test
users**, so NO account can sign in — yours included. In the console: OAuth
consent screen → Publishing status → Publish. It asks for the privacy
policy and terms URLs on the authorised domain: `/privacy` and `/terms`
exist for this. Add the final domain to Authorised JavaScript origins
(`docs/GOOGLE-AUTH.md`).

Check: sign in with a Google account that is not yours.

## 3. Finish the legal pages

`privacy.html`, `terms.html`, `refund.html` now say the service is sold
by an INDIVIDUAL (sole proprietor) and carry a marked
`[OWNER: full legal name]` placeholder, plus `[OWNER: GSTIN, if
registered]` on the one tax line in the Terms. The refund policy is
decided (7 Oct 2026): purchases are FINAL, except a duplicate or erroneous
charge (refunded), charged-but-never-activated (refunded or activated,
the buyer's choice) and any refund Indian law requires; governing law
India, Chennai courts. Still to fill in: the name, the GSTIN if any, and
a postal address if Razorpay asks for one. Razorpay's business
verification and Meta's ad review both read these.

Check: every `[OWNER:` or "draft" marker is gone from the three files.

## 4. Run the schema sections that have never run

**ASKED THE DATABASE, 8 Oct 2026.** The file's headers were right and the
handoff note was wrong: the note said §16–§20 had not run; in fact
§16, §17 and §18 were already live from 6 Oct, and only §19–§24 were
outstanding. Take the lesson over the fact — the read-back is the
evidence, not either document.

Against project `conhlrulxfwkhsnymakz`, dashboard SQL editor
(`node scripts/deploy-billing.mjs --print` writes §16-to-EOF for you;
slice out only the sections the database lacks — it starts at §16 every
time, and re-running a live section is risk you do not need to take).

| § | What | State |
| --- | --- | --- |
| 16 | plans, Razorpay payments, the limits a plan buys | LIVE 6 Oct |
| 17 | edit log + deliverables sync scopes | LIVE 6 Oct |
| 18 | full-time access, features by plan | LIVE 6 Oct |
| 19 | the accounts guard: closes the `acc_insert` hole | **LIVE 8 Oct** |
| 20 | promo codes | NOT RUN |
| 21 | upgrade by paying the difference | NOT RUN |
| 22 | referral codes and credits | NOT RUN |
| 23 | affiliate codes | NOT RUN |
| 24 | the characters and costs sync scopes | **LIVE 8 Oct** |

§19 and §24 were run together on 8 Oct 2026 because those two are the
only ones that bite before a sale exists: §19 closed a hole that let any
signed-in user mint themselves an unlimited Pro organisation, and §24
had to be live BEFORE the 8 Oct release is deployed, since that build
syncs `fms_characters_v1` and `fms_costs_v1` and Postgres refused both
upserts until the CHECK knew the two scopes (the rest kept syncing, and
both stayed on the device).

§20–§23 are deliberately deferred: they are promo, upgrade-by-difference,
referral and affiliate, none of which can do anything until Razorpay is
live, and §20 drops and recreates `create_pending_payment` and
`admin_list_payments` — so run it in the SAME session that redeploys
`rzp-order`, per `docs/BILLING.md` §1 step 9, or every order fails with
PGRST202.

Then set the 13.2 admin row for the second `VITE_ADMIN_EMAILS` address
if it has signed in.

**Check** — and these are the values actually read back on 8 Oct, not
predictions: `select id from plans order by sort` returns four rows
through PostgREST as a signed-in user; `billing_status()` answers
`plan: 'free'`; the Edit Log and Deliverables pages sync instead of
saying "saved locally only";
`select tgtype from pg_trigger where tgname='accounts_guard'` returns
**23** (`tgtype & 4` and `tgtype & 16` both true — BEFORE INSERT OR
UPDATE, FOR EACH ROW); and, once §20 has run, as the anon role
`select count(*) from promo_codes` fails with 42501.
And `select pg_get_constraintdef(oid) from pg_constraint where conname =
'project_data_scope_check'` names `'characters'` and `'costs'` and is
**442** characters, up from 407.

> This check said tgtype **7** until 8 Oct 2026 and that was wrong. 7 is
> ROW+BEFORE+INSERT — insert only. §19 creates
> `before insert or update … for each row`, which is 1+2+4+16 = **23**.
> Anyone verifying a correct run against 7 would have read it as a
> failure and re-run the section looking for the bug.

**Two things the 8 Oct read-back turned up that no document records.**
The live prices are no longer placeholders and no longer match any doc:
`free=0, starter=59900, indie=79900, pro=99900` paise — ₹599 / ₹799 /
₹999. `docs/BILLING.md` §0 still says ₹2,999 / ₹7,999 / ₹19,999 and the
§18 header in `supabase-schema.sql` recorded 299900 / 499900 / 799900.
Someone set real prices on the console; believe the table, and §6 below
no longer needs a price-setting step so much as a price CONFIRMATION.
And `projects` holds **6** rows with `project_data` at **30**, where
`docs/SECURITY-RLS.md` still says 0 — so the signed-in-versus-anon read
proof it calls "the last cheap check" now has real data behind it, which
makes it worth more and makes skipping it cost more.

## 5. Run the live security checks

`docs/SECURITY-RLS.md` ends with the checks that need TWO real accounts
(the ten original, the nine for `claim_invite`, the ones for 13.8 /
14.5 / 15.1, and the 7 Oct additions). None has ever run. One afternoon
with two Google accounts. This is the step not to skip: a paying
customer seeing another's film is the one failure you cannot refund
your way out of.

Check: every row in those tables ticked, with the date.

## 6. Razorpay

Test mode first. `docs/BILLING.md` §1 has the order: key id + secret as
Supabase secrets, deploy the three functions (`rzp-webhook` with
`--no-verify-jwt`; REDEPLOY `rzp-order` too, since it now passes the promo code), register the webhook URL, set `VITE_RAZORPAY_KEY_ID`
in `.env`, rebuild. Then set the REAL prices in the admin console — the
seeded ₹2,999 / ₹7,999 / ₹19,999 are placeholders. Then promo codes, if
you want a launch offer (admin console → Promo codes).

Check: one real test-mode purchase end to end, then one refund, and see
the plan lapse.

## 7. Domain, cards, crawlers

- `thefilmmakerstudio.vercel.app` is the CONFIRMED production host (owner,
  7 Oct 2026), no longer a placeholder: nothing to replace. It appears in
  `start.html` (canonical, og:url, og:image, twitter:image), `index.html`,
  `invite.html`, `privacy.html`, `terms.html`, `refund.html` (og:url,
  og:image, twitter:image), `public/robots.txt` (Sitemap line) and
  `public/sitemap.xml` (four `<loc>`); `grep -rn thefilmmakerstudio.vercel.app
  *.html public` lists them and `src/lib/gate.js` has one harmless fallback.
  A custom domain LATER would need those same ten files, the domain added
  in Vercel, and the Google OAuth Authorised JavaScript origins.
- `/invite` is no longer in `sitemap.xml` (done): it is the gate's doorway
  and `noindex, nofollow`, and the landing page is the crawlable door.
- After any palette change run `npm run og` and commit `public/og.png`.
- The Dragon figures and the tier names on `start.html` are stamped into
  the markup AT BUILD TIME (`fms-start-figures` in `vite.config.js`, from
  `sampleFigures()` and `src/lib/plans.js`), so a change to the sample or a
  renamed tier reaches the page with no edit; a mismatched tier list fails
  the build.
- Paste the landing URL into WhatsApp and Instagram DM: a card with the
  image and the one-line hook should appear. If not, Meta's debugger
  (developers.facebook.com/tools/debug) says which tag it missed.
- Submit the sitemap in Google Search Console.

## 8. Only then, ads

Meta Pixel is NOT installed, on purpose: it needs a `connect-src` /
`script-src` change in both host configs, a privacy-policy paragraph, and
it cuts against "your work stays in your browser". If you want it, put it
on `start.html` ONLY, never inside the studio. Start with retargeting
people who opened the sample, ₹500–1,000 a day, and the message that is
true and rare: pay once, no subscription, works offline, built for Tamil
crews.
