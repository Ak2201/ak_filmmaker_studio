# Start page: draft changes from the launch simulations

Drafted 21 Oct 2026. **Not applied.** This is copy to review, not a change to the site.

Sources: the 10-persona study (`LAUNCH-SIM-2026-10-21.md`) and the 24-persona study
(`LAUNCH-SIM-24-2026-10-21.md`). Both are model-played personas reading a brief, not real
users. The counts below come from them and only show which objections came up and how often.

## Already done, do not redo

The uncommitted working copy (another session, 21 Oct) has already acted on the first study:

- the **"Your work comes out in open formats"** section;
- the **four questions** block (Google sign-in, 14 days offline, trial length, what leaves the browser);
- the **founding-price band** in `src/lib/start-model.js`, which says "Founding price … until …",
  includes the 100-buyer condition, and uses the IST date.

This draft covers only what those changes leave open. Every proposal names its JSON path in
`src/data/marketing-home.json`, `marketing-faq.json` or `marketing-site.json`. The generated
pages follow from `npm run make:marketing`.

---

## 1. The trial: state it, and make the page match it (needs your decision)

**Evidence.** In the first study, 8 of 10 asked for the trial length. In the 24-persona study, 6
asked for a stated trial or a free tier, and 4 named an unstated trial or no free plan as their
top objection. The live trial is **30 minutes on the sample films only** (§33), and the live census
showed 0 people in a trial. Nothing on the page states that today. Every mention says
"a limited time" until the script fills it in.

The page also promises something the trial does not give. `closing.h2` says *"Open the studio
and write scene one"*, but a trial visitor cannot create a project.

Pick one option. The copy follows from it.

### Option A: keep the short sample-only trial, and say so plainly

| Where | Now | Proposed |
| --- | --- | --- |
| `trial.html` (hero strip, closing strip, sign-up modal) | Try every module on the sample films free for *a limited time* before you buy. No card required. | Look around every module on the sample film for *30 minutes*, free, before you buy. No card. To write your own film, pick a plan. |
| `closing.h2` | Open the studio and write scene one | See every tool on a finished film first |
| `closing.sub` | Sign in with Google to start. Your work stays in your browser, and every tool reads the same scenes. | Sign in with Google and open the sample feature, broken down from first scene to call sheet. When you are ready to write your own, a plan is one payment for one year. |
| `answers.items[2].aHtml` | Today's trial: *its length is set by the studio…* | Today's trial is *30 minutes* on the sample films, every module open, no card. It is for looking, not writing: your own project needs a plan. A trial does not hold a price. |

The *30 minutes* stays inside `<span data-trial-length>`, so the live `trial_offer()` value
keeps replacing it. The markup default is only what a visitor sees before the script runs.

### Option B (recommended by the audit): 7 days on the visitor's own project

This is a console setting (`trial_minutes` 10080, `trial_scope` full) and needs no deploy. Both
studies set about a week as the floor ("one real prep week").

| Where | Proposed |
| --- | --- |
| `trial.html` | Use the whole studio on your own film for *7 days*, free. No card. If you buy before 1 November, it is the founding price even if your trial runs past it. |
| `closing.h2` | Open the studio and write scene one *(keep as it is)* |
| `answers.items[2].aHtml` | *7 days*, on your own project, every module open, no card. What you write in the trial is yours: it stays in your browser, and you can export it if you do not buy. |

**Check before using it.** The "founding price even if your trial runs past it" sentence is only
true if checkout honours it. Today `effective_price()` charges the price on the day of purchase,
and the FAQ says *"a trial does not hold a price"*. Either change the server (a schema section) or
drop that sentence.

---

## 2. "What if the studio shuts down?" is the top objection, and the page does not answer it

**Evidence.** In the 24-persona study, 11 of 24 named a new or unproven product, a small team,
or the risk that it shuts down. All 10 personas in the first study raised it. In round 2, 5 of the
6 replies to the Chennai director told him to "export .fdx/Fountain and keep your own copy".

Add a fifth question, `answers.items[4]`, and the same text as a FAQ item in `marketing-faq.json`
group `[2]`:

> **What happens to my work if the studio closes?**
> It is already on your device. Everything you write is saved in your browser first, and every
> screenplay exports as PDF, Word, Final Draft (.fdx) and Fountain, files that open in other
> screenwriting apps without us. A backup file of your whole studio downloads whenever you like,
> and on Intermediate and Pro a copy can sit in your own Google Drive. We would rather you keep a
> recent export than trust us. That is why every one of them is free to download on every plan
> that includes the tool.

**Do not promise** that the app keeps working if the site goes away. After 14 days the studio
needs to reach the server to check the sign-in (`graceOk()`), so the honest promise is about the
files, not the app. The last sentence depends on exports staying ungated. Check `plan-matrix.json`
`exports` (Basic and up) before publishing it.

---

## 3. Show that the PDF is a real screenplay page (writers were the hardest segment)

**Evidence.** In the 24-persona study, 3 of 5 writers ended at "no" on paying. The Celtx writer's
question, *"does the PDF match standard format, so a production house won't send it back?"*,
went unanswered in both studies.

Add a section after `exports`, with an image recorded from the Dragon sample (`npm run
record:marketing`, a new shot: one page of the exported PDF with Tamil and Tanglish dialogue,
next to the same page's .fdx opened in Fade In or Final Draft):

> **h2:** A page a producer will read
> **body:** The screenplay exports in standard layout: scene headings, action, character cues,
> parentheticals and dialogue where a reader expects them, Tamil and English on the same page.
> The page below is from the sample feature, exported as it is.

**Hold this until the audit's import/export fixes land** (`fix/audit-33`: the phantom locked page
and the styled-line import). If the screenshot shows a bug, it argues against the product.

---

## 4. The founding-places counter works against trust right now

`priceRiseBand()` prints **"1 of 100 founding places taken"**. That number is public
(`price_notice()`), and it is low. To a visitor whose main doubt is "is anyone using this?", it
answers *no*. Both studies' top objection was "no reviews, nobody has used it on a real shoot".

**Proposal:** show the seats chip only above a threshold. Proposed: `seatsTaken >= 25`. Below
that, keep the line about the 100-buyer condition and drop the count. This changes one line in
`start-model.js`, and the audit's `public` group is editing that file in `fix/audit-33`, so make
this change after that branch merges.

---

## 5. Things the product already has that the page never mentions

The simulation raised each of these as missing. They already exist.

| Persona ask | What exists | Proposed line (new `facts` or `panel` item, or a short block) |
| --- | --- | --- |
| Production house: "invoices with GST" (exec producer) | GSTIN on invoices (`src/lib/invoice.js`, schema §28) | **Buying for a production house?** Invoices carry your GSTIN and a financial-year number, and are on the Purchase page whenever you need them. |
| Film-school faculty: "class pricing" (60 students) | The education track: STUDENT50 (Intermediate at ₹399), and class and institution enquiries from ₹2,999 and ₹9,999 (`EDU_PRICE`, set up by hand) | **Students and film schools.** Students: Intermediate for {{fms:edu.student}} with a student code. Teaching a class or running an institute? Write to {{brand:email}}: plans for a class start at {{fms:edu.cohort}}. *(Confirm the unit, per class or per year, and that the stamps exist, before publishing.)* |
| Crew who "aren't the buyer" (1st AD, 2nd AD) | Sharing a project (view and edit links) | **Your AD does not need their own plan to read the call sheet**: send it on WhatsApp, or share the project with a view link. *(Check what a view-link recipient without a plan can open. The audit found share links failing for signed-out recipients, so fix that first.)* |

---

## 6. Wording the audit flagged as untrue

| Where | Now | Proposed |
| --- | --- | --- |
| `marketing-site.json` `heading` (sign-up modal), shown on `start.html` and `pricing.html` | Create a free account | Sign in to start |
| `invite.html` og:description, twitter:description, meta description | …is invite-only. Enter a code, sign in with Google and ask for an invite, or buy a plan… | Sign in with Google to start a free trial, buy a plan, or redeem a code. |
| `public/robots.txt` line 1 comment | The app is invite-only… | (a comment only, so fix it for consistency) |

There is no free plan (§38, the FAQ), so "free account" contradicts the FAQ one click away.
`invite.html` is hand-written markup, not generated, so edit it directly.

---

## 7. Other Indian languages: say nothing until it is true

The Malayalam and Telugu personas made "does it work in my script?" the condition of their
interest (3 of 3 non-Tamil personas ended at maybe). The audit found that Indic text wraps by code
unit, not by grapheme, which inflates page counts about 1.7× even for Tamil. **Do not add a
language claim yet.** After the grapheme-wrap fix, a `facts[0]` line could read: *"Tamil,
Tanglish and English. Malayalam, Telugu and Hindi type and export correctly; page timing is tuned
for Tamil and English."* Only publish it after checking each script in the export.

---

## Order

1. Decide the trial (section 1). It changes the most copy, and it is your setting.
2. Fix the untrue wording (section 6) and add the shutdown answer (section 2). Both are copy only.
3. After `fix/audit-33` merges: the seats threshold (section 4) and the PDF page section (section 3).
4. The "already exists" blocks (section 5), each after its check.

Questions for you: the trial option (A, or B with or without the price-hold sentence); the seats
threshold; whether the education figures are per class or per year; and whether a view-link
recipient without a plan can open a shared call sheet.
