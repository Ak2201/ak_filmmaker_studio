# MiroFish — fit analysis for this studio

Written 19 Oct 2026. Research only: nothing here is built, and nothing here is
an owner decision yet. Source read on 19 Oct 2026 (the `main` branch of
<https://github.com/666ghj/MiroFish>): the README and
`backend/app/services/{oasis_profile_generator,simulation_runner,report_agent}.py`.
File and line references into this repo are as of `develop` on the same date.

## 1. Verdict

- **Do not embed, host or call MiroFish.** It needs a Python server, a
  subprocess simulator and a third-party memory cloud. Its licence is AGPL-3.0.
  The product here is static, local-first and sold. Every one of those facts
  collides with one of these (§3).
- **Borrow three of its ideas and build them natively**, as one AI Desk task on
  the existing `callModel()` path:
  1. Generate a small panel of audience **personas**.
  2. Have each persona **react beat by beat** to the film, with a running
     memory of what it has seen.
  3. Produce a **report you can interrogate**: "ask this viewer why".
- The result is a simulated test screening: an engagement curve per viewer,
  laid over the writer's own intended tension curve. It needs no new host, no
  new storage key and no server (§5).
- The value is a cheap, early, honest "where might people drift?" read. It is
  **not** a prediction of box office. MiroFish publishes no accuracy figures,
  and nothing here should claim any.

## 2. What MiroFish is

MiroFish is a multi-agent "prediction engine". You give it seed documents
(news, a policy draft, even a novel) and a question in plain language. It
builds a world of LLM-driven agents from them, lets the agents interact on
simulated social platforms, and writes a report on what happened.

```
seed docs ──► ontology + graph ──► personas ──► simulation ──► report ──► chat / interview
              (Zep Cloud graph)    (1 per       (OASIS, Twitter   (ReACT agent
                                    entity)      + Reddit, N rounds) over the graph)
```

| Stage | Module | What it does |
| --- | --- | --- |
| Graph | `ontology_generator`, `graph_builder` | Extracts entities and relations from the seed. The result is stored as a **Zep Cloud** knowledge graph (GraphRAG-style). |
| Personas | `oasis_profile_generator` | Writes one profile per graph entity. Individuals (student, journalist, …) get a ~200-char bio and a ~2,000-char persona, plus age, gender, MBTI, country, profession and interests. Groups (company, media outlet, …) get an institutional voice. Each profile is enriched from two Zep searches (edges and nodes) and capped at 3,000 chars of context. Five profiles run in parallel. Each gets up to 3 JSON attempts, with temperature dropping 0.1 per retry; after that a **rule-based fallback** with random age, MBTI and country is used. |
| Simulation | `simulation_runner` | Launches **OASIS** (CAMEL-AI) as a **subprocess**, by default on Twitter and Reddit in parallel. Rounds = simulated hours × 60 ÷ minutes per round. Every agent action is written to JSONL and, if enabled, **ingested back into the Zep graph** as temporal memory. Run state is held in in-process dictionaries, so it cannot span several server workers. |
| Report | `report_agent` | A ReACT loop: it plans an outline of 2–5 sections, then writes each section with at least 3 and at most 5 tool calls. The tools are `insight_forge` (decompose and search), `panorama_search`, `quick_search` and `interview_agents` (asks up to 10 live agents). The output is Markdown plus a step log. |
| Chat | `report_agent.chat` | Follow-up questions against the saved report, with at most 2 tool calls. |

**Stack.** Python 3.11–3.12 (uv) behind a Flask-style API on :5001, a Node
frontend on :3000, and Docker Compose. It needs any OpenAI-compatible LLM (the
README recommends qwen-plus) and a `ZEP_API_KEY`.

**Cost.** The README itself warns that runs are "high consumption" and suggests
starting under 40 rounds. The cost drivers are agents × rounds × two platforms,
plus one memory ingestion per action, plus interviews and the report. The calls
that drive agent decisions run inside OASIS, so the per-run cost cannot be read
from MiroFish's own code.

**Maturity.** It is a viral, young project. Its finance and politics examples
are still "coming soon", and the demos are curated (a campus opinion case, an
alternative ending for *Dream of the Red Chamber*). **No accuracy benchmark is
published.**

## 3. Why not integrate it directly

| Blocker | Evidence here | Consequence |
| --- | --- | --- |
| **AGPL-3.0** | The product sells plans (`docs/BILLING.md`). | AGPL's network clause obliges offering the source of a modified version to every user who reaches it over a network. Hosting MiroFish for buyers would pull that obligation onto the integration. Separately, this repo's own licence is unsettled: `package.json:122` says `ISC` and `README.md` says "see owner". **Owner and legal question, not decided here.** |
| **Needs a server** | The build is static and the only edge functions are Razorpay (`supabase/functions/rzp-*`). | A long-running Python service with subprocesses and per-process state is a new tier to host, scale and secure. It is the opposite of "Static build, no server" (CLAUDE.md, *What this is*). |
| **Third-party memory of unreleased scripts** | Local-first, with optional Supabase sync. | The seed would be the user's screenplay, and Zep Cloud would hold it as a graph. Writers' unreleased work leaving for a fourth processor is a privacy and trust cost the product has avoided so far. |
| **Cost on the user's key** | AI is bring-your-own-key (`fms_ai_key_v1`, `src/lib/ai-providers.js`). | Hundreds to thousands of calls per run would be billed to the writer, with no ceiling the app controls. |
| **Wrong world model** | — | OASIS simulates *social diffusion* (posts, likes, follows). A film's question is how *one viewer* feels across 120 minutes in a dark room, beat by beat. The interesting machinery (feeds, recommendation, virality) is beside the point. |
| **New provider host** | `connect-src` names only Anthropic and Gemini (`vercel.json:39`, `netlify.toml:97`). | An OpenAI-compatible or Qwen endpoint would be a third provider path in `callModel()` and in both CSPs. That is not hard, but it is not needed either (§5). |

## 4. What transfers

Most of what MiroFish works hard for already exists here in structured form:
a writer has typed in the story, the characters and the script. So the graph
stage disappears and the rest maps closely.

| MiroFish | Here | Reuse |
| --- | --- | --- |
| Seed → ontology → knowledge graph | Already structured: `fms_story_v1` (logline, marks/beats, `genre`, `audience`, `comps`; `blankStory()` at `src/lib/story.js:57`), `fms_characters_v1`, `fms_script_v1`, `fms_scenes_v1` | No graph needed. |
| `oasis_profile_generator` (one persona per entity) | **Audience personas**: N viewer archetypes drawn from `story.audience`, `genre` and `comps`, never from real people (the same rule as the Dragon sample, CLAUDE.md open item 8) | One `callModel()` call with a JSON schema. Copy MiroFish's useful part: a short bio plus a long persona with taste, patience and triggers. Skip MBTI-style decoration. |
| Simulation rounds | **One pass over the film in order**: each persona reacts to each batch of scenes | Batches come from `planCoverage()` (`src/lib/ai.js:1962`). If a coverage report exists, reuse its per-scene summaries instead of re-reading the script. |
| Zep temporal memory | A running "what this viewer remembers and expects" note, carried from batch to batch | The same checkpoint-per-batch pattern `runCoverage()` uses (`src/lib/ai.js:2328`), so Resume never pays twice. |
| `report_agent` (ReACT with graph tools) | **One synthesis call**, like `coverageSynthesis()` (`src/lib/ai.js:2262`). It compares the panel's mean engagement with the writer's intended curve, `tensionCurve()` (`src/lib/story-pacing.js:52`), and names the beats where they part. | Every quoted line is checked through `quoteChecker()` (`src/lib/ai.js:1909`), so a fabricated quote is dropped, exactly as coverage does. No agent loop is needed: the data is small and local. |
| `interview_agents` / report chat | **"Ask this viewer"**: a follow-up question to one persona, with its memory note as context | The existing refine path (`refineBlock()`, `src/lib/ai-refine.js:20`), with the same schema re-sent and no new wire format. |

## 5. Feature sketch — "Test audience (simulated)"

**Where it lives.** It is a Desk task in `src/lib/ai-tasks.js` with
`kind: 'read'` and `editable: false`, the same shape as `beat-critique`
(`ai-tasks.js:449`). It writes nothing to the script or the story. It is
behind `aiUnlocked()` (`src/lib/plan-gate.js:161`, which fails closed), and the
AI pill shows the usual locked, no-key and ready states.

**Inputs.** The script elements, the story's beats and tension, `audience`,
`genre` and `comps`, and the characters' want and need (for "does the viewer
understand what X wants by page 20?"). A panel size defaults to 5 and is capped
at about 8.

**Run.**
1. Personas: 1 call, with a JSON schema of `{id, label, bio, persona,
   patience, likes[], dislikes[]}`.
2. Reactions: personas × batches calls. Each returns, per scene, an
   engagement score of 1–10, one emotion word, a one-line reason with a quote
   from the scene, "would check phone here" (boolean), and an updated memory
   note. A checkpoint is saved after each batch.
3. Synthesis: 1 call. It returns the divergence beats (where the panel mean
   differs from the intended tension by 3 or more), where personas
   disagree strongly, the likely walk-out point, and the three strongest
   moments.

**Cost guard.** Show the number of calls before running, for example
"5 viewers × 9 parts + 2 = 47 calls". That is the same honesty as coverage's
resume and the drip-pricing rule in CLAUDE.md. Reusing an existing coverage
report's summaries cuts the input tokens of step 2 sharply.

**Output.** One chart: the intended tension curve against the panel mean,
with each persona as a faint line and divergence beats marked. Under it, a
card per persona and an "Ask this viewer" box.

**Storage.** It has two options. Pick one before building.
- *Ephemeral* (recommended first): it is held in the Desk's last-run `Map`
  (`ai-tasks.js`) and lost on reload. There is zero contract surface.
- *Kept*: it is stored beside the coverage report inside the script blob
  (`src/lib/coverage-store.js`). There is **no new localStorage key**, so
  invariant 1 and the backup and sync registries are untouched.

**Copy.** Lead with: *"Simulated reactions from AI viewers. Not a market test
and not a prediction."* A message may report what it observed; it may not
claim what it cannot check (CLAUDE.md, the motion-layer trap).

**Proof, when built.** Add `scripts/test-ai-audience.mjs` on the pattern of
`scripts/test-ai-coverage.mjs`. It would use a faked fetch for both providers
and check that the key travels only in a header, that both stream framings
parse, that a fabricated quote is dropped, that batching and resume work, and
that **nothing is written to storage** in ephemeral mode.

**Size.** M (a few days). It is mostly prompt and schema work on existing
plumbing, plus one chart.

## 6. Risks and open questions for the owner

1. **False confidence.** LLM "viewers" skew towards average, polite taste.
   They are good at noticing confusion and sag and bad at predicting what
   becomes a hit. The copy and the verdict wording must not overclaim.
2. **Stereotyping.** Personas built from "Tamil theatrical audience" can
   flatten into clichés. The persona prompt should vary taste and patience,
   not demographics, and should never name or imitate a real person.
3. **Cost on the writer's key.** It is bounded and shown up front, but it is
   still several times one coverage run.
4. **Tier.** Should it be Pro-only like the other AI tools, or a trial teaser?
   It needs a `plan-matrix.json` key if it is gated separately, which means a
   regenerated §36 SQL (see `npm run test:plans`).
5. **Licence.** This repo says ISC in `package.json` and "see owner" in the
   README, which needs settling regardless. Even borrowing *ideas* from an
   AGPL project is fine; copying its **code or prompts verbatim** is not
   without accepting AGPL. Write the prompts here from scratch.

## 7. Sources

- MiroFish repository and README: <https://github.com/666ghj/MiroFish> (read 19 Oct 2026).
- `backend/app/services/oasis_profile_generator.py`, `simulation_runner.py`, `report_agent.py` (main, 19 Oct 2026).
- Simulation engine: OASIS by CAMEL-AI. Memory: Zep Cloud.
