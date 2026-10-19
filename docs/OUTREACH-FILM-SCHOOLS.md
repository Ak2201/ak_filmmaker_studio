# Film-school outreach — three emails and footer (draft)

Status: DRAFT, nothing sent. Written 19 Oct 2026. These pass the pre-send gate
of Harvey (github.com/ethanplusai/harvey, MIT) with the footer patch applied
(`harvey-footer.patch`): under 220 words, one link at most, plain text, no
banned phrases, footer present.

## Fill in before sending

1. `[Sender name]` and `[Postal address]` — yours to write. `brand.json` keeps
   `seller` and `address` empty on purpose, so decide what you may publish.
   Harvey's gate does NOT catch square-bracket placeholders.
2. `[VIDEO LINK]` — record the 60-second script-to-call-sheet demo first.
3. "7-day trial" — the live trial dials read 30 minutes / `sample` scope. Set
   `trial_minutes 10080` and `trial_scope 'full'` in admin → Growth → Trial,
   or change the wording.
4. The claims (Indian crew rates, CBFC checks, work stays in the browser) —
   confirm each is true of the build you point schools to. There is no union
   rate floor, so soften "rates" if needed.

## Footer (appended to every cold email, never to replies)

```
If this isn't relevant, reply "unsubscribe" and I won't write again.
FilmMakerStudio · [Sender name], [Postal address]
```

## Email 1 — day 0

Subject: Script to call sheet for your {{company}} short-film module

```
Hi {{first_name}},

I build FilmMakerStudio, a browser tool that takes a screenplay through breakdown, stripboard, call sheet and budget, with Indian crew rates and CBFC checks built in. Nothing to install, and student work stays in their own browser.

I'm looking for one or two film departments to try it on a real semester project. I'd give every student in your class a 7-day trial code, and I'd join a short call to set it up.

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
