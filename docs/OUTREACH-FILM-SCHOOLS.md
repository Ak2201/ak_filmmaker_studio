# Film-school outreach — three emails and footer (draft)

Status: DRAFT, nothing sent. Written 19 Oct 2026; Harvey setup added 21 Oct.
Harvey (github.com/ethanplusai/harvey, MIT) is the tool meant to send these.
Upstream now adds a postal address and an opt-out line under every cold email
itself (`compliance.postal_address` / `opt_out_line`), so `harvey-footer.patch`
in the repo root is obsolete and can be deleted.

## Harvey setup (21 Oct 2026)

Installed at `~/harvey` (outside this repo on purpose: its database holds
prospects' names and addresses, which must never be committed here).
`~/harvey/harvey.local.yaml` holds the FilmMakerStudio persona, product,
ICP (Chennai, Coimbatore, Bengaluru film schools and production houses),
IST quiet hours, 20 sends a day, approval required for every email.
`~/harvey/skills/product_knowledge.md` is hand-written from this repo: what
may be claimed, what may not (no free plan, no public free trial, no pass figure,
no union rates, no social proof, no person's name). `harvey train` would
overwrite it; don't run it.

Finding prospects: Harvey's free source (OpenStreetMap) does not work for
this. Around Chennai it returns 37 film-named places, mostly cinemas, 3 with
a website, and Harvey's OSM search has no film category anyway. Use Serper
(2,500 free searches, `SERPER_API_KEY` in `~/harvey/.env`) with searches
like "film school Chennai", or DataForSEO listings.

Still the owner's to do: a mailbox on a SECONDARY domain (`harvey gmail`),
`harvey warmup` until READY, the postal address, the launch-pass settings
(`docs/MARKETING-PLAYBOOK.md` §6 step 1) and the invite codes for classes, then
`harvey discover --provider serper --estimate`, `harvey run`, and approve each
draft in the dashboard (`harvey dashboard`).

Harvey's writer has its own rules (email 1 under 75 words, no product name,
no link), so the three emails below are reference copy for tone and claims,
not templates it sends verbatim.

## Fill in before sending

1. `[Sender name]` and `[Postal address]` — yours to write. `brand.json` keeps
   `seller` and `address` empty on purpose, so decide what you may publish.
   Harvey's gate does NOT catch square-bracket placeholders.
2. `[VIDEO LINK]` — record the 60-second script-to-call-sheet demo first.
3. `[TRIAL LENGTH]` — never typed from here, and replace it BY HAND on
   approval: like the other square-bracket fields, Harvey's gate does not
   catch it. There is no public free trial any more (27 Oct 2026): what a
   school is offered is an INVITE CODE per class, and a code is worth its
   own `code_trial_days` free trial (console), counted per student. Read it
   on the day you send and write it in words. A student who comes in
   without a code meets the launch pass instead (`{PASS_PRICE}` for
   `{PASS_LENGTH}`, from `trial_offer()->'pass'`), never a free trial; tag
   the link `?src=school-<college>` so the school row counts it. What a code
   trial opens follows the console's trial scope and plan; a trial keeps
   one film in the cloud, no share links and no collaborators, so do not
   promise a class can share or co-write on it.
4. The claims (a Chennai rate card to start from, 8 figures re-checked, CBFC checklists, work lives
   in the browser first) — confirm each is true of the build you point
   schools to. There is no union rate floor, so never say "union rates".
   CBFC checklists are on Pro; breakdown, stripboard and budget on
   Intermediate and up.
5. Links — tag each one `src=school-<slug>` (`docs/MARKETING-PLAYBOOK.md`
   §3). The console shows every school as one `school` row; it never splits
   one school from another, so give a school its own cohort promo code if you
   need its own numbers.

## Footer (appended to every cold email, never to replies)

```
If this isn't relevant, reply "unsubscribe" and I won't write again.
FilmMakerStudio · [Sender name], [Postal address]
```

## Email 1 — day 0

Subject: Script to call sheet for your {{company}} short-film module

```
Hi {{first_name}},

I build FilmMakerStudio, a browser tool that takes a screenplay through breakdown, stripboard, call sheet and budget, starting from a Chennai rate card and with CBFC checklists built in. Nothing to install, and student work lives in their own browser first.

I'm looking for one or two film departments to try it on a real semester project. I'd give every student in your class a free [TRIAL LENGTH] trial code, and I'd join a short call to set it up.

Would a pilot like that suit a class you teach at {{company}}?

Thanks,
[Sender name]
```

## Email 2 — day 4

Subject: A 60-second look: one scene, script to call sheet

```
Hi {{first_name}},

Following up on my note about a class pilot. Here is a 60-second recording of one scene going from a pasted script to a tagged breakdown, a stripboard and a call sheet: [VIDEO LINK]

Students usually get stuck at the step between a finished script and a schedule. This is that step, done in a few clicks.

If it helps, I can set up trial codes for a single class so you can see how a group uses it before deciding anything.

Thanks,
[Sender name]
```

## Email 3 — day 10

Subject: Closing the loop on the film-school pilot

```
Hi {{first_name}},

I'll stop here so I don't clog your inbox. If a class project at {{company}} could use a script-to-schedule tool, reply and I'll send trial codes and offer a 20-minute walkthrough.

If not, no need to answer and I won't write again.

Thanks,
[Sender name]
```

## Rules for the copy

- Never display the owner's name; sign with the trading name.
- Do not mention a free plan (there is none).
- One link per email at most (the gate enforces it).
- Cold email to people in India falls under the DPDP Act: keep a
  do-not-contact list and honour opt-outs.

## US market (checked 21 Oct 2026)

Not yet. Harvey would make US outreach easy (CAN-SPAM allows cold email
with an address and opt-out, and OSM finds some US studios: 42 film-named
places within 25 km of New York, 31 with a website, though only one film
school, NYFA). The product is the problem. Its reasons to switch are
Indian: Tamil/Tanglish formatting, rupee budgets at Chennai rates, CBFC
checks, WhatsApp call sheets. A US writer compares it with Final Draft,
WriterDuet and Celtx on English formatting and FDX round trip; FDX is both
imported and exported here (as are Word, PDF and Fountain). There are no US crew rates or union (SAG/IATSE/WGA) rules,
and checkout charges in rupees through Razorpay (the USD figures are display
only); check that international cards are enabled on the Razorpay account. A US campaign
needs a dollar budget first, then a separate Harvey config
(ICP, America/ timezone, US postal address).

**Set up 22 Oct 2026:** a second install at `~/harvey-us` with its own
database (LA, New York, Atlanta film programs and indie producers, US Eastern
quiet hours, 20 a day, approval on). Its `skills/product_knowledge.md` forbids
claiming dollar checkout, the dollar budget or Letter call sheets until the
`us/market` branch is live; edit that file when it ships, then start sending.
