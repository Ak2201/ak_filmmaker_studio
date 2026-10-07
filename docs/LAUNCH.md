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

Against project `conhlrulxfwkhsnymakz`, dashboard SQL editor, in order
(`node scripts/deploy-billing.mjs --print` writes the SQL for you):
§16 (plans, payments), §17 (edit log + deliverables scopes), §18
(full-time access, features by plan), §19 (the accounts guard: closes
the `acc_insert` hole) and §20 (promo codes).
Then set the 13.2 admin row for the second `VITE_ADMIN_EMAILS` address
if it has signed in.

Check: `select id from plans order by sort` returns four rows through
PostgREST as a signed-in user; `billing_status()` answers `plan: 'free'`;
the Edit Log and Deliverables pages sync instead of saying "saved
locally only"; `select tgtype from pg_trigger where tgname='accounts_guard'`
returns 7 (BEFORE INSERT OR UPDATE, row level); and, as the anon role,
`select count(*) from promo_codes` fails with 42501.

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
