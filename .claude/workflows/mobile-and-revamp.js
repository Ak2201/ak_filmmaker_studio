export const meta = {
  name: 'mobile-and-revamp',
  description: 'FilmMakerStudio: parity audit, then mobile UI + Breakdown/AI revamp in parallel worktrees, then merge, gate and 390px sweep',
  whenToUse: 'Run in three stages with args {stage:"audit"}, {stage:"build", approved:[...]}, {stage:"gate", branches:[...]}. Read docs/HANDOFF-MOBILE-AND-REVAMP-2026-10-14.md first.',
  phases: [
    { title: 'Audit', detail: 'feature parity matrix: mobile proto x desktop proto x app' },
    { title: 'Kit', detail: 'mobile layer in kit.css + kit variants (Opus)' },
    { title: 'Build', detail: 'page passes + revamp packages in worktrees' },
    { title: 'Gate', detail: 'merge, verify, prove, 390px sweep, fix loop' },
  ],
}

// ---------------------------------------------------------------------------
// Stage 1  {stage:'audit'}   -> writes docs/PARITY-MATRIX.md, returns bin (c) list. STOP and ask the owner.
// Stage 2  {stage:'build', approved:[ids of bin (c) items the owner approved], zips:{desktop,m1,m2 dirs}}
// Stage 3  {stage:'gate', branches:[{key,branch}...]}   (branches returned by stage 2)
// Stitch sources: unzip the three zips from branch `stitch-source` into EMPTY dirs and pass them in args.zips.
// ---------------------------------------------------------------------------

const Z = (args && args.zips) || { desktop: '<dir>/desktop/stitch_film_making', m1: '<dir>/m1/stitch_film_making', m2: '<dir>/m2/stitch_film_making' }
const STAGE = (args && args.stage) || 'audit'

const COMMON = `
Repo /home/user/ak_filmmaker_studio. Obey CLAUDE.md (storage keys/data-keys never change, no inline handlers, colours only from tokens, shapes from --sk-*, dialog.js not native dialogs, test:undef) and docs/DESIGN-KIT.md (Swiss kit: src/ui/kit/index.js, src/styles/kit.css, tokens.css). Read docs/HANDOFF-MOBILE-AND-REVAMP-2026-10-14.md and docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md.
Stitch sources (unzipped): desktop ${Z.desktop}, mobile-1 ${Z.m1}, mobile-2 ${Z.m2} (screen dirs with screen.png + code.html).
OWNER RULES: Swiss Precision, violet accent, dark only; REAL DATA ONLY (derive, never fake, hide the unmeasurable; no new fms_ keys - one field on an existing record); ASK before any genuinely new feature; FEATURE PARITY - every feature on a phone screen exists on web too and vice versa, only placement differs; responsive single codebase per page (phone below 720px); phone bottom bar stays Home / Go to / Search / Tools (restyled); multi-variant screens: pick the best kit fit and say which.
WORKTREE RULES: work only in your own worktree/branch; first merge the branch named in args.base (default claude/improvement-ideas-0gwjyx); \`ln -s /home/user/ak_filmmaker_studio/node_modules node_modules\` if missing; touch only your owned files (kit.css, section-icons.json, package.json test:all may only be APPENDED to, minimal diffs); NEVER recapture scripts/baseline.json or budget.json; NEVER push; NEVER open a PR. Verify: npm run test:undef; npm run build:open; VERIFY_PORT=<unique> PW_CHROMIUM=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell npm run verify (budget rows you deliberately grew are expected: list them); relevant test:*/prove:*; Playwright screenshots at 390x844 AND 1280 loaded DIRECTLY in that viewport (verify only resizes), LOOK at them against the prototype PNGs. Commit with messages ending 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>' and 'Claude-Session: https://claude.ai/code/session_01BPrYruTyWo3MND2xusSjCA'.
REPORT (schema): branch name, commit hash, what changed, verify result, budget rows grown, open questions.`

const REPORT = {
  type: 'object',
  properties: {
    branch: { type: 'string' }, commit: { type: 'string' }, changed: { type: 'string' },
    verify: { type: 'string' }, budgetRowsGrown: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['branch', 'commit', 'changed', 'verify'],
}

// ------------------------------- stage 1 -----------------------------------
if (STAGE === 'audit') {
  phase('Audit')
  const GROUPS = [
    { key: 'a-dash-hub-story-vault', pages: 'dashboard, hub, story (beats/pacing), vault, drafts' },
    { key: 'b-script-breakdown', pages: 'screenplay writer + focus mode, breakdown (all tabs), visualize' },
    { key: 'c-schedule-money', pages: 'stripboard + DOOD, shoot day, budget, contacts/call sheets' },
    { key: 'd-post-account', pages: 'edit log + deliverables, library, settings, admin, public pages' },
  ]
  const FEATURES = {
    type: 'object',
    properties: { features: { type: 'array', items: { type: 'object', properties: {
      page: { type: 'string' }, feature: { type: 'string' },
      onMobileProto: { type: 'boolean' }, onDesktopProto: { type: 'boolean' },
      inAppWeb: { type: 'boolean' }, inAppPhone: { type: 'boolean' },
      bin: { type: 'string', enum: ['a-fix-layout', 'b-derivable-build-both', 'c-ask-owner', 'ok'] },
      evidence: { type: 'string' },
    }, required: ['page', 'feature', 'bin'] } } },
    required: ['features'],
  }
  const rows = await parallel(GROUPS.map(g => () => agent(
    `${COMMON}\nREAD-ONLY parity audit for: ${g.pages}. Open every matching mobile and desktop screen.png (LOOK at them) and code.html, then the app's current page code/CSS. List EVERY visible feature (buttons, tabs, filters, badges, cards, exports, banners, sheets) and fill the four presence booleans and a bin: a-fix-layout (in the app, missing in one layout), b-derivable-build-both (in one prototype only, derivable from current data), c-ask-owner (needs data or a new feature), ok. Do not edit files.`,
    { label: g.key, model: 'sonnet', phase: 'Audit', schema: FEATURES })))
  const all = rows.filter(Boolean).flatMap(r => r.features)
  const binC = all.filter(f => f.bin === 'c-ask-owner')
  log(`${all.length} features audited, ${binC.length} need an owner decision`)
  await agent(`${COMMON}\nWrite docs/PARITY-MATRIX.md from this JSON (table per page: feature | mobile proto | desktop proto | app web | app phone | bin | evidence), then \`git add docs/PARITY-MATRIX.md && git commit\` on the current branch (no push). JSON: ${JSON.stringify(all)}`,
    { label: 'matrix-writer', model: 'haiku', phase: 'Audit' })
  return { next: 'Ask the owner about every bin (c) item, then run stage "build" with args.approved = the approved ids/names.', binC, counts: { total: all.length, binC: binC.length } }
}

// ------------------------------- stage 2 -----------------------------------
if (STAGE === 'build') {
  const APPROVED = JSON.stringify((args && args.approved) || [])
  const GAPS = `Gaps to close come from docs/PARITY-MATRIX.md: close every bin a and b row for your pages in BOTH layouts; build bin c rows ONLY if they are in this approved list: ${APPROVED}.`

  phase('Kit')
  const kit = await agent(`${COMMON}\nYOU ARE THE MOBILE KIT ENGINEER (work in place on the current branch, not a worktree; commit when green). Extend src/styles/kit.css with phone rules from tokens only: breakpoint tokens, 44px targets, --mab-h-aware padding, safe-area insets, sticky segmented strip, table -> stacked-cards below 720px, bottom sheet (reuse mobile-nav.js + dialog.js), 2-col stat grid, scrolling chip rows. Add kit VARIANTS (responsive table, compact strip, stacked stage-card, collapsible panel) in src/ui/kit/*, not new components. Restyle the phone shell (top bar, one-line dock, bottom bar Home/Go to/Search/Tools) in mobile-nav.js/.css, shell.js phone branch, status-bar.css to match the mobile dashboard prototype. Document the phone rules in docs/DESIGN-KIT.md. ${GAPS}`,
    { label: 'mobile-kit', model: 'opus', phase: 'Kit', schema: REPORT })

  phase('Build')
  const PASSES = [
    { key: 'stripboard', model: 'opus', task: 'stripboard.html + DOOD on phone (compact strips, DOOD player cards, company-move banners). Prototype: stripboard mobile 1-3 (pick best). Keep Lock Draft; run test:stripboard.' },
    { key: 'shoot', model: 'opus', task: 'shoot.html phone-first, widened for web. Prototype: shoot floor monitor mobile 1-3 (pick best, say which).' },
    { key: 'screenplay', model: 'opus', task: 'screenplay.html + focus mode: tools as a sheet, beats as a bottom sheet, paper page 390px legible. Never bypass setElementType.' },
    { key: 'visualize', model: 'opus', task: 'visualize.html: coverage table as cards, blocking canvas touch/pan/pinch with keyboard parity, storyboard grid.' },
    { key: 'dash-hub-story', model: 'sonnet', task: 'dashboard, hub, story (curve + beat deck swipe), vault, drafts. Prototypes: dashboard mobile, story mobile 1-2.' },
    { key: 'budget-contacts', model: 'sonnet', task: 'budget (line-item cards, side panel as sheet) and contacts/call sheets (WhatsApp preview, sides packet).' },
    { key: 'post-library', model: 'sonnet', task: 'edit log, deliverables, library shelves.' },
    { key: 'settings-admin-public', model: 'sonnet', task: 'settings, admin console, start/invite/purchase/screening/404 (legal stay paper-light, words in markup).' },
  ]
  const run = (p) => agent(`${COMMON}\nBASE: ${kit ? kit.branch : 'claude/improvement-ideas-0gwjyx'} (merge it first). ${GAPS}\nYOUR PAGES: ${p.task}`,
    { label: p.key, model: p.model, isolation: 'worktree', phase: 'Build', schema: REPORT })

  // Revamp packages: P3a -> (P3b, P3c) ; Breakdown mobile pass waits for P3b's markup.
  const p3a = await agent(`${COMMON}\nBASE: ${kit ? kit.branch : 'claude/improvement-ideas-0gwjyx'}.\nP3a - from docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md phases 1-2: write src/lib/breakdown-extras.js (pure proposal builders + node test test:breakdown-extras, added to test:all), non-AI Desk tasks shot-basic/story-basic (no key, no Pro gate), draftSceneStory() in src/lib/ai.js, task scene-story in src/lib/ai-tasks.js (the plan's 'already in the working tree' code does NOT exist - write it), and the AI chain runBreakdown -> shot-draft -> after(madeIds) -> scene-story. Decisions in the plan are final (review-first, ask per scene with existing items via dialog.js, one outline step per scene filed under beats via nearestBeat linked by sceneId, re-run only new scenes, AI stays Pro + own key). Keep test:ai-lazy green.`,
    { label: 'P3a-breakdown-logic', model: 'opus', isolation: 'worktree', phase: 'Build', schema: REPORT })

  const tail = async () => {
    const p3b = await agent(`${COMMON}\nBASE: merge ${p3a ? p3a.branch : 'P3a branch'} and ${kit ? kit.branch : 'the kit branch'}.\nP3b - UI: two kit buttons 'Manual breakdown' / 'Breakdown with AI' (aiPill) in src/ui/breakdown-overview.js (startBlock) and src/ui/script-overview.js, handlers beside run-breakdown in src/pages/breakdown.js; the review list is a bottom sheet on phone and a panel on web (same component). Wording changes: add EXPECTED rows in scripts/verify-migration.mjs only if verify demands them.`,
      { label: 'P3b-breakdown-ui', model: 'sonnet', isolation: 'worktree', phase: 'Build', schema: REPORT })
    const bd = await agent(`${COMMON}\nBASE: merge ${p3b ? p3b.branch : 'P3b branch'}.\nBreakdown mobile pass: breakdown.html all tabs + Element Index as a sheet. Prototype: scene_breakdown_elements mobile.`,
      { label: 'breakdown-mobile', model: 'sonnet', isolation: 'worktree', phase: 'Build', schema: REPORT })
    return [p3b, bd]
  }
  const p3c = () => agent(`${COMMON}\nBASE: merge ${p3a ? p3a.branch : 'P3a branch'}.\nP3c - storyboard images per the plan's phase 4 (Desk task board-frames, Gemini image through the single provider path with the key in a header never ?key=, img-src blob: in BOTH vercel.json and netlify.toml, Drive-only storage via a create-file helper beside createBackupFile in src/lib/drive.js, frame keeps only ref, 'Reconnect Drive' state, images excluded from backups with UI saying so, generation disabled with a reason when signed out/no Drive). It cannot be proven against a real provider here - say so.`,
    { label: 'P3c-storyboard-images', model: 'opus', isolation: 'worktree', phase: 'Build', schema: REPORT })

  const [passes, tailRes, imgs] = await Promise.all([parallel(PASSES.map(p => () => run(p))), tail(), p3c()])
  const reports = [kit, p3a, ...passes, ...tailRes, imgs].filter(Boolean)
  return { next: 'Run stage "gate" with args.branches = [{key, branch}] from this list.', branches: reports.map(r => ({ branch: r.branch, commit: r.commit })), reports }
}

// ------------------------------- stage 3 -----------------------------------
if (STAGE === 'gate') {
  phase('Gate')
  const BR = JSON.stringify((args && args.branches) || [])
  const merged = await agent(`${COMMON}\nYOU ARE THE INTEGRATOR (work in place on the base branch). Merge these branches in order: ${BR}. Conflict rules: src/data/section-icons.json -> union the icons list (dedupe); src/styles/kit.css -> keep both appended blocks; package.json test:all -> keep every new test; anything else -> resolve by reading both sides, never drop behaviour. Remove merged worktrees afterwards (vite hits ENOSPC file watchers with many). Then: npm run test:undef; npm run build:open; npm run verify (re-budget ONLY deliberate growth: npm run verify -- --budget, say why in the commit); test:all without test:schema; gated 'npm run build' then prove:gate, prove:growth, prove:billing; 'npm run build:open' then prove:walk, prove:stage-guide, prove:dialogs, prove:story-path, prove:script, prove:adoption, prove:ai-desk, prove:tamil, prove:sw. Fix what breaks. Commit. Do not push.`,
    { label: 'integrator', model: 'opus', phase: 'Gate', schema: REPORT })

  const SWEEP = {
    type: 'object',
    properties: { problems: { type: 'array', items: { type: 'object', properties: {
      page: { type: 'string' }, viewport: { type: 'string' }, kind: { type: 'string' }, detail: { type: 'string' } },
      required: ['page', 'kind', 'detail'] } } },
    required: ['problems'],
  }
  let round = 0, open = []
  do {
    const sweep = await agent(`${COMMON}\nRead-only 390x844 and 360x740 sweep of ALL 37 pages in the built app (build:open, vite preview), each loaded DIRECTLY in that viewport, signed out and with the Dragon sample project: horizontal overflow, tap targets under 44px, clipped/overlapping text, content hidden behind the bottom bar or dock, fragments (#anchors) not landing, console errors, features present on web but absent on phone (docs/PARITY-MATRIX.md). Save screenshots under the scratchpad and LOOK at them. Report problems only.`,
      { label: `sweep-${round}`, model: 'haiku', phase: 'Gate', schema: SWEEP })
    open = (sweep && sweep.problems) || []
    log(`sweep ${round}: ${open.length} problems`)
    if (open.length) {
      await agent(`${COMMON}\nFix these phone-layout problems in place on the base branch (smallest fix; kit/tokens first), re-run verify and the affected provers, commit: ${JSON.stringify(open)}`,
        { label: `fix-${round}`, model: 'sonnet', phase: 'Gate', schema: REPORT })
    }
    round++
  } while (open.length && round < 3)

  return { integrated: merged, remainingProblems: open, next: 'Push the base branch and open a PR to develop ONLY if the owner asks.' }
}

throw new Error('args.stage must be "audit", "build" or "gate"')
