# Ad copy — Meta, Instagram and YouTube

Written 26 Oct 2026. NOT RUN. Every variant is a claim the product can back
today; the check column says where. Placeholders are filled from the server
on the day the ad is created (`docs/MARKETING-PLAYBOOK.md` §0 rule 3), never
from memory:

| Placeholder | Read from |
| --- | --- |
| `{TRIAL_LENGTH}` | `trial_offer()` `trial_hours`, in words ("3-day" for 72); if you have not just read it, write "free" and no length |
| `{TRIAL_OPENS}` | "the whole studio" only when `trial_offer()` reads `trial_scope: "full"` (schema §60 live) and the console's trial plan is Pro; otherwise "the tools on two sample films" |
| `{FROM_DAY}` | the pricing page's "from about … a day" (Basic's year ÷ 365, derived) |
| `{BASIC_YEAR}` `{INDIE_YEAR}` `{PRO_YEAR}` | `price_notice()` current prices |
| `{RISE_DATE}` | `price_notice()` `plans[].next_price_at`, as an IST date (null means the rise has fired: drop the line) |

Every link carries its test cell's `src` from the playbook's §3 register.
All `meta-*` tags count as ONE console bucket, `ads`; a cell is judged on
Meta Ads Manager's figures (playbook §4.2). `yt-ads` counts as `youtube`.

**What the trial is, in every ad:** a {TRIAL_LENGTH} trial of {TRIAL_OPENS},
no card, starting only when the visitor presses start. The owner decided
(26 Oct 2026) on 3 days of the whole studio; that is what an ad says only
once the playbook §5 pre-flight has read it back. A whole-studio trial keeps
the no-plan limits (one film in the cloud, no share links, no
collaborators), so no ad promises sharing or a team on the trial.

**Never in any ad:** "pay once", "lifetime", "forever", "money-back",
"loved by N filmmakers", star ratings, "#1", "only N left", a fake timer,
a competitor's price, a person who has not agreed in writing, or a feature
from a plan other than the one the ad names.

---

## Meta / Instagram feed and reels

Primary text ≤ 125 characters before "more"; headline ≤ 40.

### M1 — Script to call sheet (reel, 20 s)

Recording: import a script → scenes appear → drag two scenes on the
stripboard → open the call sheet → tap Send on WhatsApp.

- **Primary:** Import your script. Get the breakdown, the shooting schedule and the call sheet without retyping a scene.
- **Headline:** From script to call sheet
- **Description:** {TRIAL_LENGTH} trial of {TRIAL_OPENS}, no card
- **CTA button:** Learn more
- **Link:** `/start?src=meta-t1a&utm_campaign=test1` (cell C, other states: `src=meta-t1c`)
- **Check:** import is every plan; breakdown + stripboard are Intermediate; call sheets are **Pro**. A whole-studio trial with the Pro trial plan opens all three on the visitor's own script; a sample-scope trial shows them on the sample films only, and then the description must say so. Record the reel on a real account of the plan shown.

### M2 — Tamil on the page (reel, 20 s)

Recording: type a scene with Tamil dialogue and English slug lines in the
Screenplay Writer; page count updates.

- **Primary:** Tamil dialogue, English slug lines, the layout handled as you type. A screenplay writer for how Tamil scripts are written.
- **Headline:** Write your script the Tamil way
- **Description:** A year from {FROM_DAY} a day
- **Link:** `/start?src=meta-t1b&utm_campaign=test1`
- **Check:** Basic and up. If the reel shows Type Tamil (opt-in, Alt/⌥ T: romanised Tamil in a dialogue line offered in Tamil script word by word), say "type Tamil dialogue in Roman letters"; never imply headings or action convert, or that it converts without the writer pressing a key.

### M3 — Budget in rupees (static, 4:5)

Image: a real budget screen from the Dragon sample, figures with their
source and checked date visible.

- **Primary:** Budget your short film in rupees, starting from Chennai rates. Every figure shows where it came from and when it was checked.
- **Headline:** A budget that starts from real rates
- **Description:** Intermediate: {INDIE_YEAR} for a year
- **Link:** `/start?src=meta-t1d&utm_campaign=test1`
- **Check:** Budget is Intermediate. Never say "union rates" (no union floor exists); say "Chennai rates" or "market rates, with sources".

### M4 — Nothing renews by itself (static)

- **Primary:** One payment, one year of the studio. Nothing renews by itself. Buy the next year only if you want it.
- **Headline:** A year from {FROM_DAY} a day
- **Description:** Founding prices until {RISE_DATE}
- **Link:** `/pricing?src=meta-t1e&utm_campaign=test1`
- **Check:** price line must read `price_notice()` that day. The founding line only while `rising` is true.

### M5 — Works offline on set (reel, 15 s)

Recording: turn off the network in the browser; keep editing the stripboard;
print a report.

- **Primary:** No signal on location? The studio keeps working offline, and your changes are still there when you are back.
- **Headline:** Works when the signal does not
- **Description:** {TRIAL_LENGTH} trial, no card
- **Link:** `/start?src=meta-t1f&utm_campaign=test1`
- **Check:** true after the first visit has cached the app (it installs like an app). Do not say "no internet needed to sign up".

### M6 — Your script stays yours (static, for writers)

- **Primary:** Your screenplay lives in your browser first. Back it up to your own Google Drive. Export to PDF, Word, Final Draft or Fountain any time.
- **Headline:** Your work, in open formats
- **Description:** Read how storage works
- **Link:** `/start?src=meta-t1g&utm_campaign=test1` (the creative can name the trust page; the ad lands on `/start`, where attribution is certain to be read)
- **Check:** Drive backup is Intermediate and Pro; exports are every plan. Signed-in projects sync to the studio's cloud: never imply nothing leaves the device.

### Retargeting (people who engaged with the account)

- **R1 Primary:** Still thinking about it? The {TRIAL_LENGTH} trial opens {TRIAL_OPENS}, no card. It starts only when you press start.
- **R2 Primary:** Founding prices hold until {RISE_DATE}. A plan bought before then is a full year at that price. (Run only in the last 3 weeks before the date, and only once per person.)
- **Link:** `/start?src=meta-rt&utm_campaign=rt1` (bucket `ads`)

### International variant (second wave, only after `usd_checkout` is on)

- **Primary:** Write, break down, schedule and budget your indie film in one browser studio. Final Draft and Fountain in and out. A year from {USD_FROM}.
- **Before `usd_checkout` is on**, any dollar figure must be followed by "charged in rupees at checkout ({INR_CHARGED})", both read from `price_notice('USD')`.

---

## Instagram stories (9:16)

Three frames, sticker link on the last.

1. "Your call sheet. On WhatsApp. In one tap." (screen recording)
2. "Per person call times, map pin, scenes in order." (close-up)
3. "{TRIAL_LENGTH} trial, no card. Link ↓" → `/start?src=ig-story&utm_campaign=<week>` (bucket `instagram`)

---

## YouTube

### Y1 — In-stream (skippable), 30 s script

```
[0–5s, screen] Your script is finished. Now someone has to turn it into a
shooting schedule.
[5–15s] Import it. The scenes, characters and locations are read from your
pages. Drag the scenes into shooting days.
[15–25s] The call sheet builds from the same scenes, and goes out as a
WhatsApp message, one call time per person.
[25–30s] FilmMakerStudio. Try {TRIAL_OPENS} free for {TRIAL_LENGTH_DAYS}, no card.
filmmakerstudio.in/start
```

Fill `{TRIAL_LENGTH_DAYS}` as "3 days" when `trial_offer()` reads 72 hours,
or drop "for {TRIAL_LENGTH_DAYS}". The brand name is read aloud from
`src/data/brand.json` `name`, never retyped if it changes.

Link: `/start?src=yt-ads&utm_campaign=y1` (bucket `youtube`; the ad's own
figures are in Google Ads).

### Y2 — Creator integration (60–90 s, read by the creator in their words)

Talking points the creator may use, all true:

- It takes a film from story and screenplay to breakdown, schedule, budget,
  call sheets, the shoot day and deliverables.
- Tamil dialogue with English slug lines; budgets in rupees from Chennai
  rates with a source on each figure; call sheets as a WhatsApp message.
- Imports Fountain, Final Draft, Word, text and real-text PDFs; exports PDF,
  Word, Final Draft and Fountain.
- Works offline once installed; backs up to your own Google Drive on
  Intermediate and Pro.
- A plan is one payment for one year, nothing renews by itself; founding
  prices until {RISE_DATE}.
- "Use my code {CODE} for {DISCOUNT} off" — the discount the code really
  gives, read from the console.

The creator must say it is a paid partnership (YouTube's "includes paid
promotion" box and a spoken line), and must not promise planned features or
a refund.

Link: `/start?src=creator-<handle>&utm_campaign=<video>&ref=<CODE>` (bucket
`partner`; the creator's own figures are their code's revenue in Growth →
Affiliates).

---

## Short lines for directories and Product Hunt

- **Tagline (≤ 60):** Write, plan and shoot your film in one browser studio
- **Tagline, India:** Script to call sheet, in rupees and in Tamil
- **One paragraph:** A browser studio for independent filmmakers: story,
  screenplay, breakdown, stripboard, budget, call sheets, shoot day and
  delivery, each reading the same scenes. Built first for Tamil and Indian
  units — Tamil dialogue, rupee budgets from Chennai rates, CBFC and OTT
  checklists, call sheets on WhatsApp. Local-first, works offline, open-format
  exports. Yearly plans with nothing renewing by itself.
- **Maker comment, what it does not do yet:** no live union paperwork, no
  Malayalam or Telugu-specific tools, dollar checkout not yet open, and it is
  made by a small team — which is why the exports are open formats.
