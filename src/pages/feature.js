/* ============================================================
   FEATURE BLUEPRINT — page entry for feature.html
   ------------------------------------------------------------
   This module is the whole page. feature.html ships a single
   <div id="app">; everything below it — toolbar, covers, the
   twenty-four steps, the treatment ladder, the pitch deck, the
   sync panel — is rendered here at boot.

   What moved, and why:

   1. THE STEPS ARE DATA. src/data/steps.feature.json holds all
      24 steps; src/ui/steps.js turns them into the exact markup
      the legacy page hand-wrote. The jump dropdown and
      exportMarkdown() used to be two more hand-maintained
      copies of the same list — they now derive from the JSON
      via stepIndex()/stepFieldKeys(), so they cannot drift.

   2. NO INLINE HANDLERS. The legacy page carried ~60 inline
      onclick/onchange/oninput attributes, which meant it could
      never run under a strict CSP. Every one of them is now a
      data-action attribute served by one delegated listener
      (see wireActions). The four authored `raw` blocks in the
      JSON still carry inline handlers; dehydrateInlineHandlers()
      rewrites them to data-action the moment they land in the
      DOM and before any listener could fire, so the live page
      has zero inline handler attributes.

   3. STORAGE KEYS ARE UNTOUCHED. Every data-key string is byte
      identical to the legacy page's, as are STORAGE_KEY,
      PREF_KEY, NOTE_PREFIX and SYNC_CFG_KEY. Users have months
      of work behind those strings.

   4. THE FOUR LEGACY FIXES SURVIVE:
        a. updatePalette() does NOT call debouncedSave() — that
           was an infinite save loop.
        b. user text goes through escapeHTML() before it reaches
           innerHTML in updateVol1Bridge() and renderCharMap().
        c. storage keys unchanged (see 3).
        d. toggleDark() delegates to StudioUI.cycleTheme() so the
           local `body.dark` class and the shared three-state
           theme cannot desync.

   ORDERING: render markup → loadData() → refreshAll(), exactly
   as the legacy script did. loadData() ends with refreshAll().
   ============================================================ */

/* ---- stylesheets ------------------------------------------ */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/pdf.css';

/* ---- store FIRST ------------------------------------------
   store.js monkey-patches Storage.prototype at module
   evaluation time, and every module below it reads
   localStorage. As <script> tags this was guaranteed by tag
   order; as ES modules it is guaranteed by import order. Do not
   move this below the chrome/cloud imports. */
import Store from '../lib/store.js';
import StudioUI, {
  buildStepRail, buildBeatVisualizer, refreshBeatFills,
  wireGlossaryPopovers, wireFieldSavedFlash, autoAriaLabels,
  attachSignInPill, injectReadingProgress
} from '../ui/chrome.js';
import '../lib/cloud.js';

import { esc, h, fromHTML, delegate } from '../lib/dom.js';
import { renderSteps, mountStepsLang, stepIndex, stepFieldKeys } from '../ui/steps.js';
import STEPS from '../data/steps.feature.json';
import PROD from '../data/steps.production.json';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import PDF from '../lib/pdf.js';
import { parseNum, fmtINR } from '../lib/money.js';

/* ============================================================
   CONSTANTS — unchanged from the legacy page.
   ============================================================ */
const STORAGE_KEY  = 'arunak_filmmaker_combined_v1';
const PREF_KEY     = 'arunak_filmmaker_prefs_v1';
const NOTE_PREFIX  = 'arunak_note_';
const SYNC_CFG_KEY = 'arunak_supabase_cfg_v1';

let statusEl = null;
let saveTimer, savedAt = 0;
let sceneCount = 0, shotCount = 0, castCount = 0, locCount = 0;

const ALL_STEPS = [...STEPS.vol1, ...STEPS.vol2, ...PROD.production, ...PROD.post];

/* ============================================================
   MARKUP
   ------------------------------------------------------------
   Authored content only — no user text reaches these strings,
   so innerHTML is safe here. Anything a user typed is escaped
   at the point of use (escapeHTML) or set via .value/.textContent.
   ============================================================ */

const MASTER_COVER_HTML = `
<section class="master-cover">
  <div>
    <div class="master-mark">A complete guide to building a film, from idea to camera</div>
    <h1 class="master-title">The <span class="light">Filmmaker's</span><br>Blueprint.</h1>
    <p class="master-sub">Four phases. Thirty-two guided steps. From the first "what if?" through "ROLL CAMERA" to delivery. Examples from <em>Dragon</em>, <em>Vikram Vedha</em>, <em>96</em> &amp; <em>Por Thozhil</em>, with every concept explained in English &amp; Tanglish.</p>
    <div class="vol-stamps">
      <span class="vol-stamp gold">VOL I · STORY · 12 STEPS</span>
      <span class="vol-stamp green">PHASE 02 · PRE-PRODUCTION · 12 STEPS</span>
      <span class="vol-stamp">PHASE 03 · PRODUCTION · 4 STEPS</span>
      <span class="vol-stamp">PHASE 04 · POST-PRODUCTION · 4 STEPS</span>
    </div>
    <div class="meta-grid">
      <div class="meta-field"><label>Project title</label><input type="text" data-key="meta_title" placeholder="Untitled film"></div>
      <div class="meta-field"><label>Writer / Director</label><input type="text" data-key="meta_writer" placeholder="Your name"></div>
      <div class="meta-field"><label>Started on</label><input type="text" data-key="meta_started" placeholder="DD / MM / YYYY"></div>
      <div class="meta-field"><label>Stage</label><input type="text" data-key="meta_stage" placeholder="Story / Pre-prod / Both"></div>
    </div>
  </div>
  <div>
    <div class="master-byline">CURATED BY <span>ARUNAK</span></div>
  </div>
</section>
`;
const VOL1_COVER_HTML   = `
<section class="vol-cover" id="vol-1">
  <div>
    <div class="master-mark">PHASE 01</div>
    <div class="vol-tag">STORY · 12 STEPS</div>
    <h1>The <span class="light">Story</span><br>Blueprint.</h1>
    <p class="sub">From a vague idea to a structured screenplay in twelve guided steps. Every example explained in English &amp; Tanglish — using <em>Dragon</em>, <em>Vikram Vedha</em>, <em>96</em> &amp; <em>Por Thozhil</em> as our reference films.</p>
    <div class="meta-grid">
      <div class="meta-field"><label>Working title</label><input type="text" data-key="v1_title" placeholder="Untitled film"></div>
      <div class="meta-field"><label>Genre</label>
        <select data-key="v1_genre">
          <option value="">Pick a genre...</option>
          <option>Drama</option>
          <option>Romance</option>
          <option>Thriller</option>
          <option>Crime / Noir</option>
          <option>Comedy</option>
          <option>Action</option>
          <option>Horror</option>
          <option>Sci-Fi</option>
          <option>Fantasy</option>
          <option>Family</option>
          <option>Coming-of-Age</option>
          <option>Biopic</option>
          <option>Documentary</option>
          <option>Anthology</option>
          <option>Experimental</option>
          <option>Other</option>
        </select>
      </div>
      <div class="meta-field"><label>Draft</label><input type="text" data-key="v1_draft" placeholder="01 — Treatment"></div>
    </div>
  </div>
  <div><div class="vol-byline">CURATED BY <span>ARUNAK</span></div></div>
</section>
`;
const HOWTO1_HTML       = `
<section class="how-to">
  <h2>How to use <em>the Story phase.</em></h2>
  <p class="deck">Twelve steps, in order. Each step builds on the one before it. Don't skip ahead — the sequence is the method.</p>
  <ol>
    <li><strong>Work in order.</strong> Step 1 is always the spark. By Step 12 you have a scene-by-scene outline ready to draft.</li>
    <li><strong>Read the example before you write.</strong> Every step shows how <em>Dragon</em>, <em>Vikram Vedha</em>, <em>96</em>, and <em>Por Thozhil</em> answered the same question — first in English, then explained in Tanglish for clearer feel.</li>
    <li><strong>Answer in your own words first.</strong> Write the messy version. Polish later.</li>
    <li><strong>Tick the checks at the bottom of each step</strong> only when you genuinely believe you've nailed it.</li>
    <li><strong>Save often.</strong> The page autosaves. Use EXPORT before you close.</li>
    <li><strong>Print when done.</strong> Each step lands on its own page.</li>
  </ol>
  <div class="tip-box">
    <div class="label">A NOTE ON RHYTHM</div>
    <p>Steps 1–4 might take an evening. Step 8 (the 15-beat outline) might take a week. Step 11 (the scene list) might take a month. The blueprint is a guide, not a deadline.<span class="tn">Konjam steps oru saayangaalathula mudichidalam, sila steps ku oru vaaram aagum, scene list ku oru maasame aagalaam. Indha blueprint guide thaan, deadline illa.</span></p>
  </div>
  <div class="tip-box" style="margin-top:14px; border-left-color: var(--accent);">
    <div class="label">SHORTCUTS &amp; FEATURES</div>
    <p>Progress bar (top toolbar) tracks completion across all 24 steps. Step badges show <em>EMPTY · IN-PROGRESS · COMPLETE</em>. Tables have <strong>⎘</strong> duplicate and <strong>✕</strong> delete on every row. Step 6 has a live <em>Character Relationship Map</em>. Step 8 has a <em>Pacing Visualizer</em>. Step 11 has a <em>Scene Charge Timeline</em>. Step 15 has a <em>Color Palette Picker</em>. Step 23 auto-calculates your budget total &amp; breakdown bar. The Glossary is at the end. The bottom-right <strong>◷</strong> is a 25-min focus timer (right-click to reset).<br><br>Keyboard: <kbd>Ctrl+S</kbd> save · <kbd>Ctrl+D</kbd> dark mode · <kbd>Ctrl+K</kbd> step jumper · <kbd>Ctrl+F</kbd> search · <kbd>Ctrl+Shift+R</kbd> reading mode. Toolbar: <strong>JSON</strong> exports your data, <strong>MD</strong> exports a clean markdown document, <strong>▤</strong> hides all input fields for distraction-free reading.</p>
  </div>
</section>
`;
const LADDER_HTML       = `
<section class="ladder-step" id="treatment-ladder">
  <div class="ladder-intro">
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 3px; color: var(--accent-deep); margin-bottom: 10px;">INTERLUDE · BETWEEN STEPS 02 AND 03</div>
    <h2 style="font-size: clamp(32px, 5vw, 52px); font-weight: 800; font-style: italic; line-height: 0.95; margin-bottom: 14px;">The <em style="color: var(--accent-deep);">Treatment Ladder.</em></h2>
    <p style="font-size: 16px; color: var(--ink-muted); font-style: italic; max-width: 720px; line-height: 1.55;">Five rungs from one sentence to a step outline. Each rung is a real document with a target length. Producers and collaborators ask for these in this order. Build them in order, and the script writes itself.</p>
    <!-- No inline surface here: .formula-box IS the slab, and the skin
         decides what a slab is made of. Restating it inline pinned this
         one box to a background the stylesheet could not reach, which
         is how it ended up with light panel ink on light paper. -->
    <div class="formula-box" style="margin: 20px 0; max-width: 720px;">
      <span class="label">FORMULA</span>
      <p style="margin-top: 6px; font-style: italic; font-size: 14.5px;">Each rung must be readable on its own. If you can't show a rung independently and have it work, the rung above it is also broken.</p>
      <p class="tn" style="margin-top: 8px; font-size: 13.5px; font-style: italic;">Tanglish: ovvoru rung um thaniya padichaalum sense aaganum. Oru rung break aagudhuna, adhukku mela irukura rung um break-thaan.</p>
    </div>
  </div>
  <div class="ladder-rungs">
    <div class="ladder-rung">
      <h4>Rung 1 — The Logline</h4>
      <div class="target">5 – 30 words · already done in Step 02</div>
      <textarea data-key="lad_1_logline" placeholder="Paste your locked logline from Step 02 here, or refine it." rows="2"></textarea>
      <p class="hint">If you can't fit it in one sentence, you don't yet know what your film is.</p>
    </div>
    <div class="ladder-rung">
      <h4>Rung 2 — One-Paragraph Synopsis</h4>
      <div class="target">100 – 150 words · the elevator pitch</div>
      <textarea data-key="lad_2_synopsis" placeholder="Expand the logline into a paragraph. Setup, inciting incident, escalation, climax direction. Do NOT spoil the end if it's a twist film." rows="6"></textarea>
      <p class="hint">A producer reads this in 30 seconds. If they're not reaching for the next page, fix this paragraph.</p>
    </div>
    <div class="ladder-rung">
      <h4>Rung 3 — One-Pager</h4>
      <div class="target">~ 400 – 500 words · one printed page</div>
      <textarea data-key="lad_3_onepager" placeholder="A single page covering: protagonist (1 line), antagonist (1 line), world (2 sentences), inciting incident (1 paragraph), midpoint or central conflict (1 paragraph), climax direction (1 paragraph), final image (1 line)." rows="14"></textarea>
      <p class="hint">This is the document you send to a star's manager when they ask "what's it about?". Polish accordingly.</p>
    </div>
    <div class="ladder-rung">
      <h4>Rung 4 — The Treatment</h4>
      <div class="target">5 – 12 pages · prose narrative of the whole film</div>
      <textarea data-key="lad_4_treatment" placeholder="Tell the whole film in prose, scene-block by scene-block, in present tense. Include character names, key dialogue (sparingly), and emotional beats. NO scene headings or screenplay format yet — pure narrative. This is what serious producers and HODs read first." rows="16"></textarea>
      <p class="hint">If you can write a great treatment, you can write a great script. The treatment is where the structural problems show first — and where they're cheapest to fix.</p>
    </div>
    <div class="ladder-rung">
      <h4>Rung 5 — Step Outline</h4>
      <div class="target">15 – 40 numbered scenes · the bridge to script</div>
      <textarea data-key="lad_5_outline" placeholder="Number each scene. One line per scene: SLUG — what happens — why it's there. From this outline, the actual scene list in Step 11 becomes a clean expansion." rows="14"></textarea>
      <p class="hint">When you can read your step outline aloud and "feel" the film's shape — that's when you start writing pages.</p>
    </div>
  </div>
  <p style="margin-top: 30px; font-size: 13px; color: var(--ink-muted); font-style: italic; max-width: 720px;">Tip: Don't move to the next rung until the current one is honest. A weak treatment exposes a weak logline. A weak step outline exposes a weak treatment. The ladder forces the truth.</p>
</section>
`;
const INTERLUDE_HTML    = `
<section class="interlude">
  <div class="arrow">▼ ▼ ▼</div>
  <h2>The story is locked. <em>Now the film gets made.</em></h2>
  <p>Your script is locked. The story has a backbone. Now: every decision — visual, sonic, logistic — must serve it. Pre-production is where the film is secretly directed.</p>
</section>
`;
/* Phases 03 and 04 did not exist while this was a two-volume book: the
   2023 pages stopped at the tech recce. A blueprint that ends the day
   before the shoot is a writing tool, not a filmmaking one. */
const PHASE3_COVER_HTML = `
<section class="vol-cover" id="phase-3">
  <div>
    <div class="master-mark">PHASE 03</div>
    <div class="vol-tag">PRODUCTION &middot; 4 STEPS</div>
    <h1>The <span class="light">Production</span><br>Blueprint.</h1>
    <p class="sub">The shoot itself — call sheets, continuity, dailies and the wrap. Checklists rather than prompts, because a shoot day is a list you work through before the light goes, not a question you sit with.</p>
    <div class="meta-grid">
      <div class="meta-field"><label>First day of shoot</label><input type="text" data-key="p3_start" placeholder="DD / MM / YYYY"></div>
      <div class="meta-field"><label>Shoot days planned</label><input type="text" data-key="p3_days" placeholder="e.g. 28"></div>
      <div class="meta-field"><label>1st AD</label><input type="text" data-key="p3_ad"></div>
      <div class="meta-field"><label>Unit base</label><input type="text" data-key="p3_base" placeholder="Chennai, Madurai&hellip;"></div>
    </div>
  </div>
</section>
`;
const PHASE4_COVER_HTML = `
<section class="vol-cover" id="phase-4">
  <div>
    <div class="master-mark">PHASE 04</div>
    <div class="vol-tag">POST-PRODUCTION &middot; 4 STEPS</div>
    <h1>The <span class="light">Post-Production</span><br>Blueprint.</h1>
    <p class="sub">Assembly to delivery. Half the film is made here, and it is the half that gets budgeted last — so it is written down first.</p>
    <div class="meta-grid">
      <div class="meta-field"><label>Editor</label><input type="text" data-key="p4_editor"></div>
      <div class="meta-field"><label>Sound designer</label><input type="text" data-key="p4_sound"></div>
      <div class="meta-field"><label>Composer</label><input type="text" data-key="p4_music"></div>
      <div class="meta-field"><label>Target lock date</label><input type="text" data-key="p4_lock" placeholder="DD / MM / YYYY"></div>
    </div>
  </div>
</section>
`;
const VOL2_COVER_HTML   = `
<section class="vol-cover vol-2" id="vol-2">
  <div>
    <div class="master-mark">PHASE 02</div>
    <div class="vol-tag">PRE-PRODUCTION · 12 STEPS</div>
    <h1>The <span class="light">Pre-Production</span><br>Blueprint.</h1>
    <p class="sub">From a locked script to "ROLL CAMERA" — twelve guided steps for direction, design, and the discipline of pre-production.</p>
    <div class="meta-grid">
      <div class="meta-field"><label>Director</label><input type="text" data-key="v2_director"></div>
      <div class="meta-field"><label>Producer</label><input type="text" data-key="v2_producer"></div>
      <div class="meta-field"><label>Pre-prod start</label><input type="text" data-key="v2_start" placeholder="DD / MM / YYYY"></div>
      <div class="meta-field"><label>Target shoot start</label><input type="text" data-key="v2_shoot" placeholder="DD / MM / YYYY"></div>
      <div class="meta-field"><label>Estimated budget</label><input type="text" data-key="v2_budget"></div>
    </div>
  </div>
  <div><div class="vol-byline">CURATED BY <span style="color:var(--accent-deep);">ARUNAK</span></div></div>
</section>
`;
const HOWTO2_HTML       = `
<section class="how-to vol-2">
  <h2>How to use <em>Pre-production.</em></h2>
  <p class="deck">Pre-production is where most films secretly succeed or fail. The script is locked. Now every decision must serve the story.</p>
  <ol>
    <li><strong>The script must be locked first.</strong> Don't start pre-production with an unfinished screenplay.</li>
    <li><strong>Work in order — but loop back often.</strong> Casting affects costume. Locations affect cinematography. Decisions cascade.</li>
    <li><strong>Every department must read the Director's Vision (Step 14).</strong> If your DOP and costume designer are reading three different visions, the film is already three films.</li>
    <li><strong>Read the Por Thozhil craft lesson before you fill the fields.</strong></li>
    <li><strong>Save and export weekly.</strong> Pre-production runs months.</li>
    <li><strong>Print sections and hand to HODs.</strong> Schedule to AD, lookbook to DOP, budget to producer.</li>
  </ol>
  <div class="tip-box">
    <div class="label">A NOTE ON SCALE</div>
    <p>This works for a Rs. 5 lakh short and a Rs. 5 crore feature. The questions are the same — only the answers scale up.<span class="tn">Rs. 5 lakh short ku adhuvey, Rs. 5 crore feature ku adhuvey velai seyyum. Kelvigal same — answers thaan scale aagum.</span></p>
  </div>
</section>
`;
const PHASE1_HTML       = `
<section class="phase vol-2">
  <div class="label">PHASE I</div>
  <h2>From Script to <em>Vision.</em></h2>
  <p>Steps 13–16 — locking the script, defining directorial intent, building the visual reference library, planning shot grammar.</p>
</section>
`;
const PHASE2_HTML       = `
<section class="phase vol-2">
  <div class="label">PHASE II</div>
  <h2>Building the <em>World.</em></h2>
  <p>Steps 17–20 — cinematography, production design, costume, casting. The departments that build the visible film.</p>
</section>
`;
const PHASE3_HTML       = `
<section class="phase vol-2">
  <div class="label">PHASE III</div>
  <h2>The <em>Logistics &amp; Lock.</em></h2>
  <p>Steps 21–24 — locations, sound, schedule &amp; budget, and the final tech recce that closes pre-production.</p>
</section>
`;
const SYNC_FIELDS_HTML  = `
  <div class="sync-warning">
    <div class="lab">⚠ READ FIRST</div>
    <p>This is a basic implementation: last-write-wins, no real-time conflict resolution, no auth beyond Supabase's anon key. Keep your project private. Don't share the URL+key with anyone you don't fully trust. If two devices edit at the same time, the last save wins. For sensitive projects, prefer JSON export.</p>
  </div>

  <div class="sync-fields">
    <div>
      <label>SUPABASE PROJECT URL</label>
      <input type="text" id="sync_url" placeholder="https://yourproject.supabase.co" autocomplete="off">
    </div>
    <div>
      <label>SUPABASE ANON KEY</label>
      <input type="password" id="sync_key" placeholder="eyJhbGc... (your anon public key)" autocomplete="off">
    </div>
    <div>
      <label>PROJECT ID (your row name)</label>
      <input type="text" id="sync_project_id" placeholder="my-tamil-thriller-2025" autocomplete="off">
    </div>
    <div>
      <label>AUTO-PUSH</label>
      <select id="sync_auto" style="width:100%;background:var(--paper-raised);border:1px solid var(--ink-muted);padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink);">
        <option value="off">OFF — push manually</option>
        <option value="on">ON — push every save</option>
      </select>
    </div>
  </div>
`;
const SYNC_INSTR_HTML   = `
  <div class="sync-instructions">
    <h5>Setup steps</h5>
    <ol>
      <li>Go to <a href="https://supabase.com" target="_blank" style="color:var(--accent-deep);">supabase.com</a> and create a free account &amp; new project.</li>
      <li>In the Supabase dashboard, open <em>SQL Editor</em> and run this query to create the table:
        <pre>create table projects (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);
-- For an MVP setup, allow anon read/write on this table:
alter table projects enable row level security;
create policy "anon all" on projects for all using (true) with check (true);</pre>
      </li>
      <li>Open <em>Settings → API</em>. Copy your <code>Project URL</code> and <code>anon public</code> key.</li>
      <li>Paste them above. Pick a unique <strong>project ID</strong> (e.g. <code>por-thozhil-draft-3</code>).</li>
      <li>Click <strong>SAVE CONFIG</strong>, then <strong>TEST CONNECTION</strong>.</li>
      <li>Use <strong>↑ PUSH NOW</strong> on your first device, then <strong>↓ PULL LATEST</strong> on your second to bring everything across.</li>
    </ol>
    <h5 style="margin-top: 16px;">Notes</h5>
    <ul style="margin-left: 20px;">
      <li>Anyone with your URL + anon key can read &amp; write. Treat them like a password.</li>
      <li>For real production use, set up Supabase auth + tighter RLS policies.</li>
      <li>If you make a mistake, your local browser data is preserved — you can always re-push from a known-good device.</li>
      <li>Free tier is fine; the row is well under any usage limit.</li>
    </ul>
  </div>
`;
const GLOSSARY_HTML     = `
<section class="glossary" id="glossary">
  <h2>The <em>Glossary.</em></h2>
  <p class="deck">Every film term used in this blueprint, grouped by department. Bookmark this page — you'll come back to it whenever an HOD uses a word you don't recognise.</p>

  <div class="glossary-grid">
    <div class="gloss-cat">CAMERA &amp; LENS</div>
    <dl class="gloss-item"><dt>FOCAL LENGTH (mm)</dt><dd>How "wide" or "tight" a lens sees. Lower mm = wider field. 24mm is wide, 50mm is "normal" (close to human eye), 85mm is portrait, 200mm is tele.</dd></dl>
    <dl class="gloss-item"><dt>ANAMORPHIC</dt><dd>A lens that squeezes a wider image onto the sensor; gives 2.39:1 scope, oval bokeh, and horizontal flares. Iconic Tamil/Indian "cinematic" feel.</dd></dl>
    <dl class="gloss-item"><dt>PROBE / MACRO</dt><dd>Speciality lenses for extreme close-ups (food, eyes, insects). Probe lenses can shoot inside very small spaces.</dd></dl>
    <dl class="gloss-item"><dt>ASPECT RATIO</dt><dd>The width:height of the frame. 1.85:1 is "flat" cinema, 2.39:1 is "scope" / CinemaScope, 16:9 is TV, 9:16 is vertical/reels.</dd></dl>
    <dl class="gloss-item"><dt>FRAME RATE (FPS)</dt><dd>Frames-per-second. 24 fps is the cinema standard. 25 fps is PAL/India broadcast. Higher fps (60, 120) is for slow motion.</dd></dl>
    <dl class="gloss-item"><dt>RESOLUTION</dt><dd>How many pixels in the frame. 4K is roughly 4 times HD. Higher = more detail, but also more storage and longer post-production.</dd></dl>

    <div class="gloss-cat">SHOT &amp; COVERAGE TYPES</div>
    <dl class="gloss-item"><dt>MASTER</dt><dd>The wide shot covering the entire scene from start to finish. Editor cuts away from the master to closer shots and back.</dd></dl>
    <dl class="gloss-item"><dt>WS / EWS</dt><dd>Wide Shot / Extreme Wide Shot. Sets location and scale. Character may be tiny in frame.</dd></dl>
    <dl class="gloss-item"><dt>MS / MCU</dt><dd>Medium Shot (waist up) / Medium Close-Up (chest up). Conversational distance.</dd></dl>
    <dl class="gloss-item"><dt>CU / ECU</dt><dd>Close-Up (face fills frame) / Extreme Close-Up (eyes, lips, an object). Reveals emotion or detail.</dd></dl>
    <dl class="gloss-item"><dt>OS</dt><dd>Over-the-Shoulder shot. Camera looks past one character at another. The standard of dialogue scenes.</dd></dl>
    <dl class="gloss-item"><dt>POV</dt><dd>Point-of-View shot — the camera is what a character is seeing. Used sparingly for impact.</dd></dl>
    <dl class="gloss-item"><dt>2-SHOT</dt><dd>Two characters in frame together. Used to establish relationship and proximity.</dd></dl>
    <dl class="gloss-item"><dt>INSERT / CUTAWAY</dt><dd>A close-up of an object (insert) or a brief glance away from the main action (cutaway). Used to emphasize or to give the editor a cut point.</dd></dl>

    <div class="gloss-cat">CAMERA MOVEMENT</div>
    <dl class="gloss-item"><dt>PAN / TILT</dt><dd>Pan = camera rotates horizontally on a fixed point. Tilt = vertical rotation. Camera doesn't move in space.</dd></dl>
    <dl class="gloss-item"><dt>DOLLY</dt><dd>The whole camera moves on a wheeled platform. Dolly in = toward subject. Dolly out = away. Dolly with = beside a moving subject.</dd></dl>
    <dl class="gloss-item"><dt>STEADICAM / GIMBAL</dt><dd>Stabilised handheld rigs. Steadicam is a body-worn mechanical rig; gimbal is electronic. Both let camera move smoothly without dolly tracks.</dd></dl>
    <dl class="gloss-item"><dt>HANDHELD</dt><dd>Operator holds the camera with no stabilisation. Adds urgency, intimacy, immediacy. Documentary feel.</dd></dl>
    <dl class="gloss-item"><dt>CRANE / JIB</dt><dd>Camera mounted on an arm that rises, falls, swoops. For grand reveals and overhead movement.</dd></dl>
    <dl class="gloss-item"><dt>WHIP PAN</dt><dd>An ultra-fast pan, often used as a transition between scenes (e.g. action cinema or stylised cuts).</dd></dl>

    <div class="gloss-cat">PRODUCTION</div>
    <dl class="gloss-item"><dt>HOD</dt><dd>Head of Department. Each major area (camera, art, costume, sound) has one. The director collaborates with HODs, not every individual crew member.</dd></dl>
    <dl class="gloss-item"><dt>1ST AD</dt><dd>First Assistant Director. The director's right hand on set. Owns the schedule, runs the floor, calls "rolling."</dd></dl>
    <dl class="gloss-item"><dt>DOP / DP</dt><dd>Director of Photography / Cinematographer. Runs the camera and lighting departments. Translates the director's vision into images.</dd></dl>
    <dl class="gloss-item"><dt>GAFFER</dt><dd>Chief lighting technician. Reports to the DOP. Plans and executes the lighting design.</dd></dl>
    <dl class="gloss-item"><dt>RECCE</dt><dd>Reconnaissance — visiting locations before shoot. Tech recce = full HOD walkthrough at the time of day you'll actually shoot.</dd></dl>
    <dl class="gloss-item"><dt>CALL SHEET</dt><dd>The daily schedule sent to crew the night before — call times, locations, scenes, cast required, weather, contacts. The sacred document.</dd></dl>
    <dl class="gloss-item"><dt>DAY-OUT-OF-DAYS</dt><dd>A document showing which actors and crew are needed on which days. Drives the schedule and the contracts.</dd></dl>
    <dl class="gloss-item"><dt>DOOD / DAY-PLAYER</dt><dd>An actor/crew member booked for a single day or short stretch, not the full shoot.</dd></dl>

    <div class="gloss-cat">BUDGET</div>
    <dl class="gloss-item"><dt>ATL — Above-the-line</dt><dd>Costs locked before production: writer, director, producer, lead cast. The "names" on the poster.</dd></dl>
    <dl class="gloss-item"><dt>BTL — Below-the-line</dt><dd>Everything else: crew daily rates, equipment, locations, transport, food, insurance.</dd></dl>
    <dl class="gloss-item"><dt>POST</dt><dd>Post-production costs: edit, sound mix, music, color grade, VFX, deliverables.</dd></dl>
    <dl class="gloss-item"><dt>CONTINGENCY</dt><dd>The reserve fund (usually 10–15%) for the unexpected. Weather days, equipment failure, illness. Don't shoot without one.</dd></dl>

    <div class="gloss-cat">SOUND</div>
    <dl class="gloss-item"><dt>DIEGETIC</dt><dd>Sound that exists inside the world of the film — characters can hear it (a radio in the room, footsteps).</dd></dl>
    <dl class="gloss-item"><dt>NON-DIEGETIC</dt><dd>Sound only the audience hears — background score, voiceover, sound design that comments on the action.</dd></dl>
    <dl class="gloss-item"><dt>FOLEY</dt><dd>Reproduced everyday sounds (footsteps, fabric, doors) recorded in post by Foley artists matched to picture.</dd></dl>
    <dl class="gloss-item"><dt>5.1 / 7.1 / ATMOS</dt><dd>Surround mix formats. 5.1 = 5 speakers + sub. 7.1 = 7 + sub. Atmos = object-based 3D sound including overhead.</dd></dl>
    <dl class="gloss-item"><dt>SCRATCH TRACK</dt><dd>A temporary score (often a famous film's music) used during edit so the team can feel rhythm before the real composer delivers.</dd></dl>

    <div class="gloss-cat">SCREENWRITING</div>
    <dl class="gloss-item"><dt>SLUG / SLUGLINE</dt><dd>The first line of every scene: <code>INT. KITCHEN — NIGHT</code>. Tells the reader where and when.</dd></dl>
    <dl class="gloss-item"><dt>BEAT</dt><dd>A unit of dramatic action — a turning point or shift. The 15-beat structure breaks a film into its essential beats.</dd></dl>
    <dl class="gloss-item"><dt>CHARGE</dt><dd>The emotional value of a scene. If a scene starts negative and ends positive (or vice versa), the charge has flipped — that's drama.</dd></dl>
    <dl class="gloss-item"><dt>SETUP / PAYOFF</dt><dd>Setup = a detail planted earlier (subtly). Payoff = when it returns and means more. Distance + reframing = power.</dd></dl>
    <dl class="gloss-item"><dt>LOGLINE</dt><dd>The film in one sentence — usually under 30 words, with inciting event, protagonist, goal, obstacle, stakes.</dd></dl>
    <dl class="gloss-item"><dt>WANT vs NEED</dt><dd>Want = what the protagonist consciously chases. Need = what they actually require to be whole. The arc is the gap between them.</dd></dl>
  </div>
</section>
`;
const FINAL_PAGE_HTML   = `
<section class="final-page">
  <p class="quote">"Pre-production is where you direct the film. The shoot is where you protect it."</p>
  <div class="signature">THE FILMMAKER'S BLUEPRINT · CURATED BY <span>ARUNAK</span></div>
  <div class="vol">VOL I &amp; II · COMPLETE · END OF DOCUMENT</div>
</section>
`;

/* ---- jump dropdown ----------------------------------------
   Built from stepIndex(), not hand-written. The legacy page
   listed all 24 steps here a second time; when a step title
   changed, the dropdown lied. */
function jumpOptionsHTML() {
  const group = (label, steps) =>
    `<optgroup label="${esc(label)}">` +
    stepIndex(steps).map((s) =>
      `<option value="${esc(s.id)}">${esc(s.num)} · ${esc(String(s.title).replace(/\.$/, ''))}</option>`
    ).join('') +
    `</optgroup>`;

  return `
    <optgroup label="OVERVIEW">
      <option value="top">↑ Master cover</option>
      <option value="vol-1">→ Story cover</option>
      <option value="treatment-ladder">→ Treatment Ladder</option>
      <option value="vol-2">→ Pre-production cover</option>
      <option value="phase-3">→ Production cover</option>
      <option value="phase-4">→ Post-production cover</option>
      <option value="pitch-deck">→ Pitch Deck</option>
      <option value="sync-section">→ Real-time Sync</option>
      <option value="glossary">→ Glossary</option>
    </optgroup>
    ${group('PHASE 01 · STORY', STEPS.vol1)}
    ${group('PHASE 02 · PRE-PRODUCTION', STEPS.vol2)}
    ${group('PHASE 03 · PRODUCTION', PROD.production)}
    ${group('PHASE 04 · POST-PRODUCTION', PROD.post)}`;
}

/* The toolbar, regrouped. Twenty flat controls became five visible
   ones plus two named menus — and five links were DELETED rather than
   moved, because the shell's rail and phase bar now carry Home,
   Library and the blueprints.

   Every id the rest of this file queries is preserved verbatim:
   #studioProjLabel #progressFill #progressText #stepJumper #darkBtn
   #readBtn #searchInput #searchCount #saveStatus #importFile. */
function renderToolbar() {
  const bar = h('div.toolbar');

  const proj = h('a#studioProjLink.studio-proj-link', {
    href: 'index.html', title: 'Back to Studio · current project'
  });
  proj.append(h('span.spl-arrow', { text: '←' }),
              h('span#studioProjLabel.spl-label', { text: 'STUDIO' }));

  const meter = h('div.progress-meter', { title: 'Overall completion across all 24 steps' });
  const track = h('div.progress-bar');
  track.append(h('div#progressFill.progress-fill', { style: 'width:0%;' }));
  meter.append(track, h('span#progressText.progress-text', { text: '0%' }));

  const jumper = h('select#stepJumper.step-jumper', {
    'data-action-change': 'jumpToStep', title: 'Jump to any step'
  });
  jumper.append(h('option', { value: '', text: 'JUMP TO…' }));
  jumper.append(fromHTML(jumpOptionsHTML()));

  const search = h('span.toolbar-search');
  search.append(
    h('input#searchInput', { type: 'text', placeholder: 'SEARCH ANY FIELD…', autocomplete: 'off' }),
    h('span#searchCount.search-result-count')
  );

  const exportMenu = actionMenu('Export', [
    { label: 'Print',            action: 'print',             title: 'Print or save as PDF' },
    { label: 'Save as PDF',      action: 'exportPDF',         hint: 'A4', title: 'The whole blueprint as a paginated A4 document' },
    { label: 'Zine layout',      action: 'toggleZinePrint',   title: 'Two-up zine layout for printing' },
    '---',
    { label: 'JSON',             action: 'exportData',        hint: 'data' },
    { label: 'Markdown',         action: 'exportMarkdown',    hint: 'document' },
    { label: 'Email to myself',  action: 'emailToSelf',       title: 'Email a summary to yourself' }
  ]);

  const moreMenu = actionMenu('More', [
    { label: 'Reading mode',     action: 'toggleReadingMode', hint: '⌃⇧R', title: 'Hide inputs for distraction-free reading', id: 'readBtn' },
    { label: 'Pitch deck',       href: '#pitch-deck' },
    { label: 'Sync settings',    href: '#sync-section' },
    '---',
    { label: 'Import JSON',      action: 'importData' },
    { label: 'Load sample',      action: 'loadSamplePack',    title: 'Load the Por Thozhil pre-filled sample' },
    '---',
    { label: 'Reset this blueprint', action: 'resetData', danger: true }
  ], { align: 'right' });

  bar.append(
    proj,
    meter,
    jumper,
    search,
    h('span#saveStatus.save-status', { text: '●  ready' }),
    exportMenu,
    moreMenu,
    h('button#darkBtn.btn.icon-btn', { type: 'button', 'data-action': 'toggleDark', title: 'Theme — paper, sepia, ink', text: '◐' }),
    h('input#importFile', { type: 'file', accept: '.json', style: 'display:none;', 'data-action-change': 'handleImport' })
  );
  return bar;
}

function pitchSectionHTML() {
  return `
<section class="pitch-section" id="pitch-deck">
  <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 3px; color: var(--accent-deep); margin-bottom: 10px;">AUTO-GENERATED · 10 SLIDES</div>
  <h2>The <em>Pitch Deck.</em></h2>
  <p class="deck">Auto-generated from your filled fields above. The deck refreshes every time you save. For a proper pitch, take this deck, polish the language, and add visuals from your lookbook.</p>
  <div class="pitch-actions">
    <button class="btn primary" data-action="rebuildPitchDeck">↻ REBUILD FROM DATA</button>
    <button class="btn" data-action="exportPitchPPTX">EXPORT .PPTX</button>
    <button class="btn" data-action="printPitchOnly">PRINT DECK ONLY</button>
  </div>
  <div class="pitch-deck" id="pitchDeckContainer">
    <!-- Slides built by JS -->
  </div>
</section>`;
}

function syncSectionHTML() {
  return `
<section class="sync-section" id="sync-section">
  <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 3px; color: var(--accent-deep); margin-bottom: 10px;">OPTIONAL · ADVANCED</div>
  <h3>Real-time <em>Sync.</em></h3>
  <p class="deck">Sync your blueprint across devices using your own Supabase project (free tier works). Your data stays in <em>your</em> Supabase, not anywhere else. Setup takes ~10 minutes; once configured, every save pushes; every reload pulls.</p>

${SYNC_FIELDS_HTML}

  <div class="sync-actions">
    <button class="btn primary" data-action="syncSave">↑ PUSH NOW</button>
    <button class="btn" data-action="syncLoad">↓ PULL LATEST</button>
    <button class="btn" data-action="syncTest">TEST CONNECTION</button>
    <button class="btn" data-action="saveSyncConfig">SAVE CONFIG</button>
  </div>
  <div class="sync-status" id="syncStatus">●  not configured</div>

${SYNC_INSTR_HTML}
</section>`;
}

function focusTimerHTML() {
  return `
<div class="focus-timer" id="focusTimer" data-action="toggleTimer" title="Focus session — click to start / pause">
  <span class="ft-icon">◷</span>
  <span id="ftTime">25:00</span>
  <span class="ft-pomo" id="ftPomo">×0</span>
</div>`;
}

/* ---- render ------------------------------------------------ */

function renderPage(app) {
  app.replaceChildren();
  app.append(renderToolbar());

  const main = document.createElement('main');
  main.id = 'main';

  main.append(fromHTML(MASTER_COVER_HTML));
  main.append(fromHTML(VOL1_COVER_HTML));
  main.append(fromHTML(HOWTO1_HTML));

  // Story steps 01–02, the treatment ladder interlude, then 03–12.
  // The ladder sits between steps 02 and 03 in the original.
  const vol1Host = document.createElement('div');
  renderSteps(vol1Host, STEPS.vol1, null, 'feature');
  const vol1Sections = [...vol1Host.children];
  main.append(vol1Sections[0], vol1Sections[1]);
  mountStepsLang(vol1Sections[0], 'feature');
  main.append(fromHTML(LADDER_HTML));
  main.append(...vol1Sections.slice(2));

  main.append(fromHTML(INTERLUDE_HTML));
  main.append(fromHTML(VOL2_COVER_HTML));
  main.append(fromHTML(HOWTO2_HTML));

  // Pre-production steps, with the three dividers at 13 / 17 / 21.
  const vol2Host = document.createElement('div');
  renderSteps(vol2Host, STEPS.vol2, null, 'feature');
  const vol2Sections = [...vol2Host.children];
  const PHASES = { 0: PHASE1_HTML, 4: PHASE2_HTML, 8: PHASE3_HTML };
  vol2Sections.forEach((sec, i) => {
    if (PHASES[i]) main.append(fromHTML(PHASES[i]));
    main.append(sec);
  });

  main.append(fromHTML(PHASE3_COVER_HTML));
  const prodHost = document.createElement('div');
  renderSteps(prodHost, PROD.production, null, 'production');
  main.append(...prodHost.children);

  main.append(fromHTML(PHASE4_COVER_HTML));
  const postHost = document.createElement('div');
  renderSteps(postHost, PROD.post, null, 'production');
  main.append(...postHost.children);

  main.append(fromHTML(pitchSectionHTML()));
  main.append(fromHTML(syncSectionHTML()));
  main.append(fromHTML(GLOSSARY_HTML));
  main.append(fromHTML(FINAL_PAGE_HTML));

  app.append(main);
  app.append(fromHTML(focusTimerHTML()));

  dehydrateInlineHandlers(app);
  tagVol1Bridge();
}

/* ---- post-render fixups ------------------------------------ */

/**
 * The authored `raw` blocks in steps.feature.json still carry the
 * legacy inline handlers. Rewrite them to data-action attributes
 * so the live DOM has none — a strict CSP would refuse to run
 * them, and we want the page to work under one.
 *
 *   onclick="clearEmpty('sceneListBody')"
 *     → data-action="clearEmpty" data-args='["sceneListBody"]'
 */
function dehydrateInlineHandlers(root) {
  const MAP = { onclick: 'data-action', oninput: 'data-action-input', onchange: 'data-action-change' };
  root.querySelectorAll('[onclick], [oninput], [onchange]').forEach((el) => {
    for (const [attr, target] of Object.entries(MAP)) {
      const src = el.getAttribute(attr);
      if (src === null) continue;
      el.removeAttribute(attr);
      const m = String(src).match(/^\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*;?\s*$/);
      if (!m) continue;
      el.setAttribute(target, m[1]);
      const argsSrc = m[2].trim();
      if (argsSrc) {
        try {
          el.setAttribute('data-args', JSON.stringify(JSON.parse('[' + argsSrc.replace(/'/g, '"') + ']')));
        } catch (e) { /* authored data only — a bad arg list is a data bug */ }
      }
    }
  });
}

/**
 * Step 13 opens with a "FROM VOL I" panel that updateVol1Bridge()
 * fills in. The extractor modelled it as an ordinary `why` block
 * with an empty body, so the ids it needs are re-attached here.
 */
function tagVol1Bridge() {
  const step13 = document.getElementById('step-13');
  if (!step13) return;
  const box = step13.querySelector('.why-this');
  if (!box) return;
  box.id = 'vol1Bridge';
  box.style.borderLeftColor = 'var(--panel-gilt)';
  box.style.display = 'none';
  const p = box.querySelector('p');
  if (p) {
    p.id = 'vol1BridgeContent';
    p.style.fontStyle = 'italic';
    p.style.lineHeight = '1.55';
  }
}

/* ============================================================
   ROW CONTROL HELPERS
   ============================================================ */
function rowCtrls() {
  return `<td class="row-ctrl">
      <button type="button" class="row-ctrl-btn" data-action="duplicateRow" title="Duplicate row">⎘</button>
      <button type="button" class="row-ctrl-btn del" data-action="deleteRow" title="Delete row">✕</button>
    </td>`;
}

function deleteRow(btn) {
  const tr = btn.closest('tr');
  const inputs = tr.querySelectorAll('input, textarea, select');
  const filled = [...inputs].some(i => i.value);
  if (filled && !confirm('Delete this row? Its content will be lost.')) return;
  tr.remove();
  debouncedSave();
}

function duplicateRow(btn) {
  const tr = btn.closest('tr');
  const tbody = tr.parentElement;
  const bodyId = tbody.id;
  const valueMap = {};
  tr.querySelectorAll('[data-key]').forEach(el => {
    valueMap[el.getAttribute('data-key').replace(/^[a-z]+_\d+_/, '')] = el.value;
  });
  let newRow;
  if (bodyId === 'sceneListBody') { sceneCount++; newRow = buildSceneRow(sceneCount); }
  else if (bodyId === 'shotListBody') { shotCount++; newRow = buildShotRow(shotCount); }
  else if (bodyId === 'castListBody') { castCount++; newRow = buildCastRow(castCount); }
  else if (bodyId === 'locListBody') { locCount++; newRow = buildLocRow(locCount); }
  if (!newRow) return;
  tr.after(newRow);
  wireRow(newRow);
  Object.keys(valueMap).forEach(suffix => {
    const target = newRow.querySelector(`[data-key$="_${suffix}"]`);
    if (target) {
      target.value = valueMap[suffix];
      if (target.tagName === 'SELECT' && suffix === 'charge') recolorChargeCell(target);
    }
  });
  debouncedSave();
}

/* ============================================================
   ROW BUILDERS
   ============================================================ */

// VOL I — Scene list (Step 11)
function buildSceneRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="sl_${idx}_slug" placeholder="INT. LOCATION – DAY"></td>
      <td><input type="text" data-key="sl_${idx}_pov" placeholder="POV"></td>
      <td><textarea data-key="sl_${idx}_want" placeholder="Wants..."></textarea></td>
      <td><textarea data-key="sl_${idx}_conf" placeholder="What blocks it..."></textarea></td>
      <td>
        <select data-key="sl_${idx}_charge">
          <option value="">—</option>
          <option value="pos">+ → −</option>
          <option value="neg">− → +</option>
          <option value="dbl-pos">+ → ++</option>
          <option value="dbl-neg">− → −−</option>
        </select>
      </td>
      ${rowCtrls()}
    `;
  return tr;
}

// VOL II — Shot list (Step 16)
function buildShotRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="shot_${idx}_scene" placeholder="Sc#"></td>
      <td><textarea data-key="shot_${idx}_desc" placeholder="Action / blocking"></textarea></td>
      <td>
        <select data-key="shot_${idx}_lens">
          <option value="">Lens...</option>
          <optgroup label="Wide"><option>12mm</option><option>14mm</option><option>16mm</option><option>18mm</option><option>21mm</option><option>24mm</option></optgroup>
          <optgroup label="Normal"><option>28mm</option><option>32mm</option><option>35mm</option><option>40mm</option><option>50mm</option></optgroup>
          <optgroup label="Tele"><option>65mm</option><option>75mm</option><option>85mm</option><option>100mm</option><option>135mm</option><option>200mm</option></optgroup>
          <optgroup label="Anamorphic"><option>32mm Ana</option><option>40mm Ana</option><option>50mm Ana</option><option>75mm Ana</option></optgroup>
          <optgroup label="Other"><option>Zoom 24-70</option><option>Zoom 70-200</option><option>Macro</option><option>Probe lens</option></optgroup>
        </select>
      </td>
      <td>
        <select data-key="shot_${idx}_move">
          <option value="">Move...</option>
          <option>Static</option><option>Pan</option><option>Tilt</option>
          <option>Dolly in</option><option>Dolly out</option><option>Dolly with</option>
          <option>Push in</option><option>Pull out</option>
          <option>Handheld</option><option>Steadicam</option><option>Gimbal</option>
          <option>Slider</option><option>Crane / Jib</option><option>Drone / Aerial</option>
          <option>Whip pan</option><option>Tracking</option><option>Snap zoom</option>
        </select>
      </td>
      <td>
        <select data-key="shot_${idx}_coverage">
          <option value="">Coverage...</option>
          <option>Master</option><option>Establishing</option>
          <option>EWS — Extreme Wide</option><option>WS — Wide Shot</option>
          <option>MS — Medium</option><option>MCU — Medium CU</option>
          <option>CU — Close Up</option><option>ECU — Extreme CU</option>
          <option>OS — Over Shoulder</option><option>2-Shot</option>
          <option>POV</option><option>Insert</option><option>Cutaway</option>
        </select>
      </td>
      <td><textarea data-key="shot_${idx}_notes" placeholder="Lighting / notes"></textarea></td>
      ${rowCtrls()}
    `;
  return tr;
}

// VOL II — Cast list (Step 20)
function buildCastRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="cast_${idx}_role" placeholder="Character name"></td>
      <td><input type="text" data-key="cast_${idx}_actor" placeholder="Actor"></td>
      <td>
        <select data-key="cast_${idx}_status">
          <option value="">Status...</option>
          <option>Not contacted</option><option>Audition scheduled</option>
          <option>Auditioned</option><option>Callback</option>
          <option>Look test</option><option>Chemistry read done</option>
          <option>Verbally confirmed</option><option>Contract signed</option>
          <option>Fully locked</option><option>Declined / withdrawn</option>
        </select>
      </td>
      <td><textarea data-key="cast_${idx}_notes" placeholder="Notes, dates, conflicts"></textarea></td>
      ${rowCtrls()}
    `;
  return tr;
}

// VOL II — Location list (Step 21)
function buildLocRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="loc_${idx}_scene" placeholder="Sc#"></td>
      <td><textarea data-key="loc_${idx}_name" placeholder="Location name + address"></textarea></td>
      <td>
        <select data-key="loc_${idx}_type">
          <option value="">Type...</option>
          <option>Real (as-is)</option><option>Real (dressed)</option>
          <option>Built set</option><option>Partial build</option>
          <option>Hybrid (real + build)</option><option>Studio</option>
          <option>Green screen</option>
        </select>
      </td>
      <td>
        <select data-key="loc_${idx}_permit">
          <option value="">Permit...</option>
          <option>Not required</option><option>Researching</option>
          <option>Application pending</option><option>Application filed</option>
          <option>Approved</option><option>Denied — need backup</option>
        </select>
      </td>
      <td><input type="text" data-key="loc_${idx}_recce" placeholder="DD / MM"></td>
      ${rowCtrls()}
    `;
  return tr;
}

function wireRow(row) {
  row.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', debouncedSave);
    el.addEventListener('change', debouncedSave);
  });
}

function recolorChargeCell(sel) {
  const td = sel.closest('td');
  td.classList.remove('charge-pos', 'charge-neg');
  if (sel.value === 'pos' || sel.value === 'dbl-pos') td.classList.add('charge-pos');
  if (sel.value === 'neg' || sel.value === 'dbl-neg') td.classList.add('charge-neg');
}

/* ============================================================
   ROW MANAGEMENT
   ============================================================ */
function addSceneRow(n = 1) { for (let i = 0; i < n; i++) { sceneCount++; const r = buildSceneRow(sceneCount); document.getElementById('sceneListBody').appendChild(r); wireRow(r); } debouncedSave(); }
function addShotRow(n = 1)  { for (let i = 0; i < n; i++) { shotCount++;  const r = buildShotRow(shotCount);   document.getElementById('shotListBody').appendChild(r);  wireRow(r); } debouncedSave(); }
function addCastRow(n = 1)  { for (let i = 0; i < n; i++) { castCount++;  const r = buildCastRow(castCount);   document.getElementById('castListBody').appendChild(r);  wireRow(r); } debouncedSave(); }
function addLocRow(n = 1)   { for (let i = 0; i < n; i++) { locCount++;   const r = buildLocRow(locCount);     document.getElementById('locListBody').appendChild(r);   wireRow(r); } debouncedSave(); }

function clearEmpty(bodyId) {
  const tbody = document.getElementById(bodyId);
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    const inputs = tr.querySelectorAll('input, textarea, select');
    const empty = [...inputs].every(i => !i.value);
    if (empty) tr.remove();
  });
  debouncedSave();
}

/* ============================================================
   STEP IDs + STATUS BADGES
   ============================================================ */
function assignStepIds() {
  let n = 0;
  document.querySelectorAll('.step').forEach(s => {
    n++;
    s.id = 'step-' + String(n).padStart(2, '0');
    // Inject badge if missing
    const header = s.querySelector('.step-header');
    if (header && !header.querySelector('.step-badge')) {
      const tag = header.querySelector('.step-time');
      const time = tag ? tag.textContent : '';
      const meta = document.createElement('div');
      meta.className = 'step-meta';
      meta.innerHTML = `
          ${time ? `<span class="step-time-tag">${esc(time)}</span>` : ''}
          <span class="step-badge" data-step="${n}">EMPTY</span>
        `;
      header.appendChild(meta);
      // The duration now lives in .step-meta beside the badge, which is
      // where the redesign put it. The original .step-time was left in
      // place when that row was added, so every one of the 32 steps has
      // been printing its duration twice — once boxed on the left, once
      // plain on the right — since that commit. Remove the original
      // rather than the copy: .step-time-tag is the one .step-meta
      // aligns and styles.
      if (tag) tag.remove();
    }
  });
  // Master cover gets id "top"
  const master = document.querySelector('.master-cover');
  if (master) master.id = 'top';
}

function computeStepCompletion(stepEl) {
  const fields = stepEl.querySelectorAll('input[data-key], textarea[data-key], select[data-key]');
  const checks = stepEl.querySelectorAll('li[data-key]');
  let total = 0, done = 0;
  fields.forEach(f => {
    // skip table rows for step status (count step-level fields only)
    if (f.closest('#sceneListBody, #shotListBody, #castListBody, #locListBody')) return;
    total++;
    if (f.value && f.value.trim()) done++;
  });
  checks.forEach(c => { total++; if (c.classList.contains('checked')) done++; });
  // Include presence of any table content as "done"
  const tableBodies = stepEl.querySelectorAll('#sceneListBody, #shotListBody, #castListBody, #locListBody');
  tableBodies.forEach(tb => {
    const rows = tb.querySelectorAll('tr');
    let filledRows = 0;
    rows.forEach(r => {
      if ([...r.querySelectorAll('input, textarea, select')].some(i => i.value && i.value.trim())) filledRows++;
    });
    total += 3; // weight — encourage at least 3 filled rows for "complete"
    done += Math.min(3, filledRows);
  });
  return { total, done };
}

function updateStepBadges() {
  document.querySelectorAll('.step').forEach(s => {
    const badge = s.querySelector('.step-badge');
    if (!badge) return;
    const { total, done } = computeStepCompletion(s);
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    badge.classList.remove('in-progress', 'complete');
    if (pct === 0) badge.textContent = 'EMPTY';
    else if (pct >= 100) { badge.textContent = '✓ COMPLETE'; badge.classList.add('complete'); }
    else { badge.textContent = pct + '% IN-PROGRESS'; badge.classList.add('in-progress'); }
  });
}

/* ============================================================
   OVERALL PROGRESS
   ============================================================ */
function updateProgress() {
  let total = 0, done = 0;
  // All step-level fields
  document.querySelectorAll('input[data-key], textarea[data-key], select[data-key]').forEach(f => {
    if (f.closest('.toolbar, #sceneListBody, #shotListBody, #castListBody, #locListBody')) return;
    total++;
    if (f.value && f.value.trim()) done++;
  });
  // All checklist items
  document.querySelectorAll('li[data-key]').forEach(li => {
    total++;
    if (li.classList.contains('checked')) done++;
  });
  // Tables — credit per filled row (max 5 per table)
  ['sceneListBody', 'shotListBody', 'castListBody', 'locListBody'].forEach(id => {
    const tb = document.getElementById(id); if (!tb) return;
    const rows = tb.querySelectorAll('tr');
    let filled = 0;
    rows.forEach(r => {
      if ([...r.querySelectorAll('input, textarea, select')].some(i => i.value && i.value.trim())) filled++;
    });
    total += 5;
    done += Math.min(5, filled);
  });
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = pct + '%';
}

/* ============================================================
   PACING VISUALIZER
   ============================================================ */
function renderPacingChart() {
  const svg = document.getElementById('pacingSvg');
  if (!svg) return;
  const beats = [
    { n: '01', label: 'Open',  x: 30,  y: 130, act: 1 },
    { n: '02', label: 'Theme', x: 75,  y: 110, act: 1 },
    { n: '03', label: 'Setup', x: 125, y: 95,  act: 1 },
    { n: '04', label: 'Catlst',x: 175, y: 60,  act: 1 },
    { n: '05', label: 'Debate',x: 220, y: 80,  act: 1 },
    { n: '06', label: 'Brk II',x: 265, y: 50,  act: 2 },
    { n: '07', label: 'B Sty', x: 305, y: 70,  act: 2 },
    { n: '08', label: 'Fun',   x: 350, y: 90,  act: 2 },
    { n: '09', label: 'Mid',   x: 395, y: 50,  act: 2 },
    { n: '10', label: 'Close', x: 440, y: 70,  act: 2 },
    { n: '11', label: 'Lost',  x: 485, y: 30,  act: 2 },
    { n: '12', label: 'Dark',  x: 530, y: 100, act: 2 },
    { n: '13', label: 'Brk III',x:580, y: 60,  act: 3 },
    { n: '14', label: 'Final', x: 635, y: 25,  act: 3 },
    { n: '15', label: 'Img',   x: 690, y: 130, act: 3 }
  ];
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  let svgContent = '';
  // Act dividers
  svgContent += `<line class="act-divider" x1="240" y1="20" x2="240" y2="170"/>`;
  svgContent += `<line class="act-divider" x1="555" y1="20" x2="555" y2="170"/>`;
  svgContent += `<text class="act-label" x="125" y="190" text-anchor="middle">ACT I</text>`;
  svgContent += `<text class="act-label" x="395" y="190" text-anchor="middle">ACT II</text>`;
  svgContent += `<text class="act-label" x="635" y="190" text-anchor="middle">ACT III</text>`;
  // Arc line connecting beats
  const path = beats.map((b, i) => `${i === 0 ? 'M' : 'L'} ${b.x} ${b.y}`).join(' ');
  svgContent += `<path class="arc-line" d="${path}"/>`;
  // Beats
  let filled = 0, a1 = 0, a2 = 0, a3 = 0;
  beats.forEach((b) => {
    const beatKey = 'b' + b.n;
    const isFilled = data[beatKey] && data[beatKey].trim();
    const cls = isFilled ? 'beat-dot filled' : 'beat-dot';
    const numCls = isFilled ? 'beat-num filled' : 'beat-num';
    svgContent += `<circle class="${cls}" cx="${b.x}" cy="${b.y}" r="14"/>`;
    svgContent += `<text class="${numCls}" x="${b.x}" y="${b.y + 4}">${b.n}</text>`;
    svgContent += `<text class="beat-label" x="${b.x}" y="${b.y + 30}">${b.label}</text>`;
    if (isFilled) {
      filled++;
      if (b.act === 1) a1++;
      else if (b.act === 2) a2++;
      else a3++;
    }
  });
  svg.innerHTML = svgContent;
  document.getElementById('pacingFilled').textContent = filled;
  document.getElementById('pacingAct1').textContent = a1 + '/3';
  document.getElementById('pacingAct2').textContent = a2 + '/8';
  document.getElementById('pacingAct3').textContent = a3 + '/4';
}

/* ============================================================
   BUDGET CALCULATOR
   ============================================================ */
/* The fourth copy of the money parser used to live here, and it was
   the ORIGINAL unanchored one: /cr|crore/ matched "crew", a bare "l"
   matched "lens", /k|thou/ matched "bank". hub.js and library.js were
   moved onto src/lib/money.js; this page was missed, so the feature
   budget went on reading "1 lens day" as ₹1,00,000 after the others
   had stopped. parseAmount is that shared parser now. */
const parseAmount = parseNum;

/* The budget panel shows an em-dash for "nothing entered yet" where
   the rest of the studio shows ₹ 0. That empty case is the only
   difference, so it wraps fmtINR rather than forking it. */
function formatINR(n) {
  return n ? fmtINR(n) : '—';
}

function updateBudget() {
  const totalEl = document.getElementById('budgetTotal');
  const barEl = document.getElementById('budgetBar');
  if (!totalEl || !barEl) return;
  const get = k => parseAmount(document.querySelector(`[data-key="${k}"]`)?.value || '');
  let atl = get('v2s11_atl'), btl = get('v2s11_btl'), post = get('v2s11_post');
  let totalDirect = parseAmount(document.querySelector(`[data-key="v2s11_total"]`)?.value || '');
  let contRaw = document.querySelector(`[data-key="v2s11_cont"]`)?.value || '';
  let contPct = 0; const m = contRaw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) contPct = parseFloat(m[1]);
  const subTotal = atl + btl + post;
  const cont = subTotal * contPct / 100;
  const computed = subTotal + cont;
  const total = computed > 0 ? computed : totalDirect;
  if (total === 0) {
    totalEl.innerHTML = '— <span>(fill numbers above)</span>';
    barEl.innerHTML = '';
    return;
  }
  totalEl.innerHTML = formatINR(total) + ' <span>total</span>';
  const denom = atl + btl + post + cont;
  if (denom > 0) {
    barEl.innerHTML = `
        <div class="budget-bar-seg atl" style="width:${(atl / denom * 100).toFixed(1)}%" title="ATL: ${formatINR(atl)}"></div>
        <div class="budget-bar-seg btl" style="width:${(btl / denom * 100).toFixed(1)}%" title="BTL: ${formatINR(btl)}"></div>
        <div class="budget-bar-seg post" style="width:${(post / denom * 100).toFixed(1)}%" title="Post: ${formatINR(post)}"></div>
        <div class="budget-bar-seg cont" style="width:${(cont / denom * 100).toFixed(1)}%" title="Contingency: ${formatINR(cont)}"></div>`;
  } else {
    barEl.innerHTML = '';
  }
}

/* ============================================================
   WORD COUNTERS
   ============================================================ */
function attachWordCounter(dataKey, target, lowerLabel) {
  const el = document.querySelector(`[data-key="${dataKey}"]`);
  if (!el) return;
  const wrap = el.closest('.ask') || el.parentElement;
  if (wrap.querySelector('.word-counter')) return;
  const span = document.createElement('span');
  span.className = 'word-counter';
  span.dataset.target = target;
  wrap.querySelector('.ask-label')?.appendChild(span);
  const update = () => {
    const w = (el.value.trim().match(/\S+/g) || []).length;
    span.textContent = `${w} ${w === 1 ? 'word' : 'words'} · target ${lowerLabel || '<' + target}`;
    span.classList.remove('over', 'good');
    if (w === 0) { /* neutral */ }
    else if (w <= target) span.classList.add('good');
    else span.classList.add('over');
  };
  el.addEventListener('input', update);
  update();
}

/* ============================================================
   PROJECT TITLE SYNC
   ============================================================ */
function syncTitleAcrossCovers() {
  const masterTitle = document.querySelector('[data-key="meta_title"]');
  const v1Title = document.querySelector('[data-key="v1_title"]');
  if (!masterTitle || !v1Title) return;
  const sync = (src, dest) => {
    if (dest.value === '' && src.value) dest.value = src.value;
  };
  masterTitle.addEventListener('input', () => sync(masterTitle, v1Title));
  v1Title.addEventListener('input', () => sync(v1Title, masterTitle));
}

/**
 * store.js auto-bridges the blueprint title into the project meta
 * on DOMContentLoaded. This page renders *after* that (the module
 * evaluates once parsing is done), so the fields did not exist
 * when it ran. Re-do the same two-way bridge here, through the
 * store's public API.
 */
function bridgeTitleToProject() {
  const fields = [...document.querySelectorAll('[data-key="meta_title"], [data-key="v1_title"]')];
  if (!fields.length) return;

  const pushToFields = (value) => {
    fields.forEach(el => {
      if (document.activeElement !== el && el.value !== value) {
        el.value = value || '';
        debouncedSave();
      }
    });
  };

  const proj = Store.currentProject && Store.currentProject();
  if (proj) {
    const firstFilled = fields.find(el => el.value && el.value.trim());
    if (firstFilled && (!proj.title || /^untitled/i.test(proj.title))) {
      Store.updateProject(proj.id, { title: firstFilled.value.trim() });
    } else if (proj.title) {
      pushToFields(proj.title);
    }
  }

  Store.subscribe('project:meta', (p) => { if (p) pushToFields(p.title); });

  fields.forEach(el => {
    const pull = () => {
      const p = Store.currentProject();
      if (!p) return;
      const v = (el.value || '').trim();
      if (v && v !== p.title) Store.updateProject(p.id, { title: v });
    };
    el.addEventListener('input', pull);
    el.addEventListener('change', pull);
  });
}

/* ============================================================
   THEME
   ============================================================ */
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p.dark) document.body.classList.add('dark');
    updateDarkBtn();
  } catch (e) { /* corrupt prefs are not worth a crash */ }
}
function savePrefs() {
  const p = { dark: document.body.classList.contains('dark') };
  localStorage.setItem(PREF_KEY, JSON.stringify(p));
}
function toggleDark() {
  // chrome.js owns a 3-state theme (paper / sepia / ink) on its own
  // key. Toggling `body.dark` locally desynced the two: the class
  // flipped but the shared layer re-applied its stored theme on the
  // next load. Delegate.
  if (StudioUI && StudioUI.cycleTheme) { StudioUI.cycleTheme(); updateDarkBtn(); return; }
  document.body.classList.toggle('dark');
  updateDarkBtn();
  savePrefs();
}
function updateDarkBtn() {
  const btn = document.getElementById('darkBtn');
  if (btn) btn.textContent = document.body.classList.contains('dark') ? '☀' : '◐';
}

/* ============================================================
   STEP JUMPER
   ============================================================ */
function jumpToStep(target) {
  if (!target) return;
  const el = document.getElementById(target);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('stepJumper').value = '';
}

/* ============================================================
   SAVE / LOAD
   ============================================================ */
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    sceneCount = 0; shotCount = 0; castCount = 0; locCount = 0;
    Object.keys(saved).forEach(k => {
      let m;
      if ((m = k.match(/^sl_(\d+)_/))) sceneCount = Math.max(sceneCount, +m[1]);
      if ((m = k.match(/^shot_(\d+)_/))) shotCount = Math.max(shotCount, +m[1]);
      if ((m = k.match(/^cast_(\d+)_/))) castCount = Math.max(castCount, +m[1]);
      if ((m = k.match(/^loc_(\d+)_/))) locCount = Math.max(locCount, +m[1]);
    });

    const sceneBody = document.getElementById('sceneListBody'); sceneBody.innerHTML = '';
    const t1 = Math.max(sceneCount, 8); sceneCount = 0;
    for (let i = 0; i < t1; i++) { sceneCount++; const r = buildSceneRow(sceneCount); sceneBody.appendChild(r); wireRow(r); }

    const shotBody = document.getElementById('shotListBody'); shotBody.innerHTML = '';
    const t2 = Math.max(shotCount, 8); shotCount = 0;
    for (let i = 0; i < t2; i++) { shotCount++; const r = buildShotRow(shotCount); shotBody.appendChild(r); wireRow(r); }

    const castBody = document.getElementById('castListBody'); castBody.innerHTML = '';
    const t3 = Math.max(castCount, 8); castCount = 0;
    for (let i = 0; i < t3; i++) { castCount++; const r = buildCastRow(castCount); castBody.appendChild(r); wireRow(r); }

    const locBody = document.getElementById('locListBody'); locBody.innerHTML = '';
    const t4 = Math.max(locCount, 8); locCount = 0;
    for (let i = 0; i < t4; i++) { locCount++; const r = buildLocRow(locCount); locBody.appendChild(r); wireRow(r); }

    document.querySelectorAll('[data-key]').forEach(el => {
      const k = el.getAttribute('data-key');
      if (saved[k] !== undefined) {
        if (el.tagName === 'LI') {
          if (saved[k]) { el.classList.add('checked'); el.setAttribute('aria-checked', 'true'); }
        } else el.value = saved[k];
        if (el.tagName === 'SELECT' && k.startsWith('sl_') && k.endsWith('_charge')) recolorChargeCell(el);
      }
    });

    flashStatus('●  loaded');
    refreshAll();
  } catch (e) { console.error(e); flashStatus('●  load failed'); }
}

function saveData() {
  const data = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.getAttribute('data-key');
    if (el.tagName === 'LI') data[k] = el.classList.contains('checked');
    else data[k] = el.value;
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    savedAt = Date.now();
    flashStatus('●  saved · just now');
    refreshAll();
  } catch (e) { flashStatus('●  save failed'); }
}

function refreshAll() {
  updateProgress();
  updateStepBadges();
  renderPacingChart();
  updateBudget();
  renderCharMap();
  renderSceneChart();
  updateVol1Bridge();
  updatePalette();
}

function debouncedSave() {
  clearTimeout(saveTimer);
  if (statusEl) {
    statusEl.textContent = '●  saving...';
    statusEl.style.color = 'var(--paper)';
  }
  saveTimer = setTimeout(saveData, 400);
}

function flashStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = 'var(--panel-gilt)';
}

function updateSavedAtTimer() {
  if (!savedAt || !statusEl) return;
  const sec = Math.floor((Date.now() - savedAt) / 1000);
  let text = '●  saved · just now';
  if (sec >= 60 && sec < 3600) text = `●  saved · ${Math.floor(sec / 60)}m ago`;
  else if (sec >= 3600) text = `●  saved · ${Math.floor(sec / 3600)}h ago`;
  else if (sec >= 5) text = `●  saved · ${sec}s ago`;
  statusEl.textContent = text;
}

/* ============================================================
   EXPORT / IMPORT / RESET
   ============================================================ */
function exportData() {
  saveData();
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const t = (data.meta_title || data.v1_title || 'film').replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'film';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `arunak_blueprint_${t}.json`; a.click();
  URL.revokeObjectURL(url);
  flashStatus('●  exported');
}

/* The whole blueprint, paginated. print.css already lays this page
   out as paper — a page per step, every panel flattened to a hairline
   and every theme inverted to print ink — so all this adds is the A4
   page setup, the running band, and a filename that says which film
   it is. Saving first, because a PDF of what is on screen should
   include the sentence the user finished typing four seconds ago. */
function exportBlueprintPDF() {
  saveData();
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const title = data.meta_title || data.v1_title || 'Untitled film';
  const done = document.querySelectorAll('.step').length;
  PDF.exportPDF({
    scope: 'blueprint',
    project: title,
    label: 'Feature blueprint',
    title: title + ' — Feature blueprint',
    subtitle: done + (done === 1 ? ' step' : ' steps')
  });
  flashStatus('●  printing');
}

function importData() { document.getElementById('importFile').click(); }

function handleImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(JSON.parse(ev.target.result)));
      loadData();
      flashStatus('●  imported');
    } catch (err) { flashStatus('●  import failed'); }
  };
  r.readAsText(file);
}

function resetData() {
  if (!confirm('Clear all your work in BOTH volumes? Export first if you want a backup.')) return;
  localStorage.removeItem(STORAGE_KEY);
  loadData();
  flashStatus('●  reset');
}

/* ============================================================
   CHARACTER RELATIONSHIP MAP (Story · Step 6)
   ============================================================ */
function renderCharMap() {
  const svg = document.getElementById('charMapSvg');
  if (!svg) return;
  const get = k => (document.querySelector(`[data-key="${k}"]`)?.value || '').trim();
  const protag = get('s4_name') || '';
  const antag = get('s5_name') || '';
  const ally = get('s6_ally_name') || '';
  const lover = get('s6_lover_name') || '';
  const mentor = get('s6_mentor_name') || '';

  // Layout positions
  const cx = 360, cy = 180;
  const positions = {
    protagonist: { x: cx, y: cy, name: protag, label: 'PROTAGONIST', conn: 'Story · Step 4' },
    antagonist:  { x: cx + 240, y: cy, name: antag, label: 'ANTAGONIST', conn: 'opposes' },
    ally:        { x: cx - 240, y: cy - 90, name: ally, label: 'ALLY', conn: 'reflects' },
    lover:       { x: cx - 240, y: cy + 90, name: lover, label: 'LOVE / MIRROR', conn: 'pulls toward need' },
    mentor:      { x: cx, y: cy - 130, name: mentor, label: 'MENTOR / CATALYST', conn: 'hands over tool' }
  };

  let s = '';
  // Connection lines from protagonist to each other
  Object.keys(positions).forEach(key => {
    if (key === 'protagonist') return;
    const p = positions[key];
    const isFilled = !!p.name;
    const cls = isFilled ? 'conn-line solid' : 'conn-line';
    s += `<line class="${cls}" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/>`;
    // Label at midpoint
    const mx = (cx + p.x) / 2, my = (cy + p.y) / 2 - 6;
    s += `<text class="conn-label" x="${mx}" y="${my}">${p.conn}</text>`;
  });

  // Draw each character
  Object.keys(positions).forEach(key => {
    const p = positions[key];
    const isFilled = !!p.name;
    const r = key === 'protagonist' ? 50 : 42;
    let cls = 'char-circle';
    if (key === 'protagonist') cls += ' protagonist';
    else if (key === 'antagonist') cls += ' antagonist';
    if (!isFilled) cls += ' empty';
    s += `<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="${r}"/>`;
    s += `<text class="char-role" x="${p.x}" y="${p.y - 6}">${p.label}</text>`;
    const nameCls = isFilled
      ? (key === 'protagonist' ? 'char-name protagonist' : 'char-name')
      : 'char-name empty';
    const display = isFilled ? String(p.name) : '— empty —';
    const shown = display.length > 14 ? display.slice(0, 14) + '…' : display;
    // User text — escaped before it reaches innerHTML.
    s += `<text class="${nameCls}" x="${p.x}" y="${p.y + 16}">${escapeHTML(shown)}</text>`;
  });

  svg.innerHTML = s;
}

/* ============================================================
   SCENE CHARGE TIMELINE (Story · Step 11)
   ============================================================ */
function renderSceneChart() {
  const wrap = document.getElementById('sceneChart');
  if (!wrap) return;
  const tbody = document.getElementById('sceneListBody');
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll('tr')];
  let total = 0, charged = 0, flips = 0, lastSign = 0, run = 0, maxRun = 0;
  let html = '';
  rows.forEach((row, i) => {
    const inputs = row.querySelectorAll('input, textarea, select');
    const hasContent = [...inputs].some(el => el.value && el.value.trim());
    if (!hasContent && i > 7) return; // skip blank rows past first 8
    total++;
    const chargeSel = row.querySelector('select[data-key$="_charge"]');
    const ch = chargeSel ? chargeSel.value : '';
    let cls = 'scene-bar flat', sign = 0, h = 0;
    if (ch === 'pos')      { cls = 'scene-bar pos';     sign = 1;  h = 35; charged++; }
    else if (ch === 'dbl-pos') { cls = 'scene-bar dbl-pos'; sign = 1;  h = 50; charged++; }
    else if (ch === 'neg') { cls = 'scene-bar neg';     sign = -1; h = 35; charged++; }
    else if (ch === 'dbl-neg') { cls = 'scene-bar dbl-neg'; sign = -1; h = 50; charged++; }
    // Track flips and runs
    if (sign !== 0) {
      if (lastSign !== 0 && sign !== lastSign) flips++;
      if (sign === lastSign) run++;
      else run = 1;
      if (run > maxRun) maxRun = run;
      lastSign = sign;
    } else {
      lastSign = 0; run = 0;
    }
    const heightStyle = h > 0 ? `style="height:${h}%;"` : '';
    html += `<div class="${cls}"><div class="seg" ${heightStyle}></div><span class="num">${String(i + 1).padStart(2, '0')}</span></div>`;
  });
  wrap.innerHTML = html;
  document.getElementById('sceneTotal').textContent = total;
  document.getElementById('sceneCharged').textContent = charged;
  document.getElementById('sceneFlips').textContent = flips;
  document.getElementById('sceneRun').textContent = maxRun > 0 ? maxRun + ' scene' + (maxRun > 1 ? 's' : '') : '—';
}

/* ============================================================
   VOL I → VOL II BRIDGE
   ============================================================ */
function updateVol1Bridge() {
  const bridge = document.getElementById('vol1Bridge');
  const content = document.getElementById('vol1BridgeContent');
  if (!bridge || !content) return;
  const get = k => (document.querySelector(`[data-key="${k}"]`)?.value || '').trim();
  const logline = get('s2_log_final');
  const theme = get('s3_theme');
  if (!logline && !theme) {
    bridge.style.display = 'none';
    return;
  }
  // User text — escaped before it reaches innerHTML.
  let html = '';
  if (logline) html += `<strong style="display:block; margin-bottom:6px; font-style:normal; color:var(--accent-deep);">LOGLINE:</strong> "${escapeHTML(logline)}"`;
  if (theme) html += `<br><br><strong style="display:block; margin-bottom:6px; font-style:normal; color:var(--accent-deep);">THEME:</strong> ${escapeHTML(theme)}`;
  content.innerHTML = html;
  bridge.style.display = 'block';
}

/* ============================================================
   SEARCH ACROSS ALL FIELDS
   ============================================================ */
let searchHits = [], searchIdx = 0;
function performSearch(q) {
  // Clear previous
  document.querySelectorAll('.search-hit').forEach(el => el.classList.remove('search-hit'));
  searchHits = [];
  const cnt = document.getElementById('searchCount');
  if (!q || q.length < 2) { cnt.textContent = ''; return; }
  const lq = q.toLowerCase();
  // Scan inputs/textareas/selects with values
  document.querySelectorAll('input[data-key], textarea[data-key], select[data-key]').forEach(el => {
    const v = (el.value || '').toLowerCase();
    if (v.includes(lq)) {
      el.classList.add('search-hit');
      searchHits.push(el);
    }
  });
  // Scan visible static text in steps (placeholders, labels, examples)
  document.querySelectorAll('.step .step-deck, .step .ex-label, .step .formula-box .eq, .step .por-thozil p, .step .why-this p, .step .example p').forEach(el => {
    const v = el.textContent.toLowerCase();
    if (v.includes(lq)) {
      el.classList.add('search-hit');
      searchHits.push(el);
    }
  });
  cnt.textContent = searchHits.length ? searchHits.length : '0';
  if (searchHits.length) {
    searchIdx = 0;
    searchHits[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
function nextSearchHit() {
  if (!searchHits.length) return;
  searchIdx = (searchIdx + 1) % searchHits.length;
  searchHits[searchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ============================================================
   READING MODE
   ============================================================ */
function toggleReadingMode() {
  document.body.classList.toggle('reading-mode');
  const on = document.body.classList.contains('reading-mode');
  document.getElementById('readBtn').textContent = on ? '✕' : '▤';
  document.getElementById('readBtn').title = on ? 'Exit reading mode' : 'Reading mode (hide inputs)';
  flashStatus(on ? '●  reading mode' : '●  edit mode');
}

/* ============================================================
   MARKDOWN EXPORT
   ------------------------------------------------------------
   Was the third hand-maintained copy of the 24 steps: a literal
   list of every heading and every field label. It now derives
   from the same JSON the page renders, via stepIndex() and
   stepFieldKeys(), so a renamed field can no longer silently
   vanish from the export.

   Field labels come from the step data too — the ask's own label,
   or (for the bespoke `raw` blocks) the <label> that sits beside
   the field in the authored markup.
   ============================================================ */

// key → human label, built once from the step JSON.
let _labelMap = null;
function fieldLabels() {
  if (_labelMap) return _labelMap;
  const map = new Map();
  const clean = (s) => String(s ?? '')
    .replace(/<[^>]+>/g, '')          // authored labels carry markup
    .replace(/&amp;/g, '&')
    .replace(/^[A-Z]\s*·\s*/, '')     // "A · Logline attempt 1" → "Logline attempt 1"
    .replace(/\s+/g, ' ')
    .trim();

  for (const step of ALL_STEPS) {
    for (const b of step.blocks || []) {
      if (b.type === 'asks') {
        for (const a of b.items || []) map.set(a.key, clean(a.label) || humanise(a.key));
      } else if (b.type === 'raw') {
        const frag = fromHTML(b.html);
        frag.querySelectorAll('[data-key]').forEach((el) => {
          const key = el.getAttribute('data-key');
          const own = el.closest('div, td, .ask');
          const lab = own && (own.querySelector('label, .ask-label'));
          const text = lab ? clean(lab.textContent) : '';
          map.set(key, text || clean(el.getAttribute('placeholder')) || humanise(key));
        });
      }
    }
  }
  _labelMap = map;
  return map;
}

function humanise(key) {
  return key.replace(/^(v2)?s\d+_/, '').replace(/^b\d+$/, key).replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Keys the export renders in a bespoke block rather than as a
// plain "**Label:** value" line.
function isSpecialKey(k) {
  return /^b\d\d$/.test(k) || /^s10_(setup|pay)_\d+$/.test(k);
}

function exportMarkdown() {
  saveData();
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const title = data.meta_title || data.v1_title || 'Untitled film';
  let md = `# THE FILMMAKER'S BLUEPRINT\n## ${title}\n*Curated by Arunak*\n\n`;
  md += `**Director:** ${data.meta_director || data.v2_director || '—'}\n`;
  md += `**Started:** ${data.meta_started || '—'}\n`;
  md += `**Genre:** ${data.v1_genre || '—'}\n\n---\n\n`;

  const labels = fieldLabels();

  // Helper to render a step — same shape as the legacy one, but the
  // (label, key) pairs now come from the data.
  const step = (heading, fields) => {
    const hasContent = fields.some(([, k]) => data[k] && data[k].toString().trim());
    if (!hasContent) return '';
    let s = `## ${heading}\n\n`;
    fields.forEach(([label, k]) => {
      const v = (data[k] || '').toString().trim();
      if (v) s += `**${label}:** ${v}\n\n`;
    });
    return s + '\n';
  };

  // Fields worth exporting: real inputs the user typed into. That
  // rules out the checklist <li>s a couple of steps carry outside a
  // `check` block (their value is a boolean), the readonly hex
  // mirrors, the colour wells and the checkbox sign-offs — all of
  // which store a constant rather than something the user wrote.
  const exportableFields = (s) => stepFieldKeys(s)
    .filter((k) => !isSpecialKey(k))
    .filter((k) => {
      const el = document.querySelector(`[data-key="${CSS.escape(k)}"]`);
      if (!el) return false;
      if (!el.matches('input, textarea, select')) return false;
      return !el.matches('[readonly], input[type="color"], input[type="checkbox"]');
    })
    .map((k) => [labels.get(k) || humanise(k), k]);

  const index = new Map(stepIndex(ALL_STEPS).map((s) => [s.id, s]));
  const heading = (s) => {
    const meta = index.get(s.id);
    return `${meta.num} · ${String(meta.title).replace(/\.$/, '')}`;
  };

  const renderStepBlock = (s) => {
    let out = step(heading(s), exportableFields(s));

    // Step 08 — the 15 beats, as a numbered block.
    if (s.id === 'step-08') {
      const beatNames = ['Opening Image', 'Theme Stated', 'Setup', 'Catalyst', 'Debate', 'Break Into Act 2', 'B Story', 'Fun and Games', 'Midpoint', 'Bad Guys Close In', 'All Is Lost', 'Dark Night', 'Break Into Act 3', 'Finale', 'Final Image'];
      let beatBlock = `## ${heading(s)}\n\n`;
      let beatCount = 0;
      for (let i = 1; i <= 15; i++) {
        const v = (data['b' + String(i).padStart(2, '0')] || '').toString().trim();
        if (v) { beatBlock += `**${String(i).padStart(2, '0')} · ${beatNames[i - 1]}:** ${v}\n\n`; beatCount++; }
      }
      if (beatCount > 0) out += beatBlock + '\n';
    }

    // Step 10 — setups paired with their payoffs.
    if (s.id === 'step-10') {
      let spBlock = `## ${heading(s)}\n\n`;
      let spCount = 0;
      for (let i = 1; i <= 5; i++) {
        const su = (data['s10_setup_' + i] || '').toString().trim();
        const pa = (data['s10_pay_' + i] || '').toString().trim();
        if (su || pa) { spBlock += `**${i}.** Setup: ${su || '—'} → Payoff: ${pa || '—'}\n\n`; spCount++; }
      }
      if (spCount > 0) out += spBlock + '\n';
    }

    // Step 11 — the scene list table.
    if (s.id === 'step-11') {
      let scenes = '';
      Object.keys(data).filter(k => k.match(/^sl_\d+_slug/)).forEach(k => {
        const idx = k.match(/sl_(\d+)/)[1];
        const slug = data[`sl_${idx}_slug`] || '';
        const pov = data[`sl_${idx}_pov`] || '';
        const want = data[`sl_${idx}_want`] || '';
        const conf = data[`sl_${idx}_conf`] || '';
        const charge = data[`sl_${idx}_charge`] || '';
        if (slug || pov || want || conf) {
          const chMap = { pos: '+→−', neg: '−→+', 'dbl-pos': '+→++', 'dbl-neg': '−→−−' };
          scenes += `**Sc${idx}** | ${slug} | POV: ${pov} | Want: ${want} | Conflict: ${conf} | ${chMap[charge] || ''}\n`;
        }
      });
      if (scenes) out += `## ${heading(s)}\n\n${scenes}\n\n`;
    }

    // Step 20 — the cast list table.
    if (s.id === 'step-20') {
      let cast = '';
      Object.keys(data).filter(k => k.match(/^cast_\d+_role/)).forEach(k => {
        const idx = k.match(/cast_(\d+)/)[1];
        const role = data[`cast_${idx}_role`] || '';
        const actor = data[`cast_${idx}_actor`] || '';
        const status = data[`cast_${idx}_status`] || '';
        if (role || actor) cast += `- **${role}** — ${actor} (${status})\n`;
      });
      if (cast) out += `## ${heading(s)}\n\n${cast}\n\n`;
    }

    // Step 21 — the location list table.
    if (s.id === 'step-21') {
      let locs = '';
      Object.keys(data).filter(k => k.match(/^loc_\d+_name/)).forEach(k => {
        const idx = k.match(/loc_(\d+)/)[1];
        const sc = data[`loc_${idx}_scene`] || '';
        const name = data[`loc_${idx}_name`] || '';
        const type = data[`loc_${idx}_type`] || '';
        const permit = data[`loc_${idx}_permit`] || '';
        if (name) locs += `- Sc${sc}: **${name}** | ${type} | Permit: ${permit}\n`;
      });
      if (locs) out += `## ${heading(s)}\n\n${locs}\n\n`;
    }

    return out;
  };

  md += `# VOLUME I · STORY\n\n`;
  for (const s of STEPS.vol1) md += renderStepBlock(s);

  md += `\n---\n\n# VOLUME II · PRE-PRODUCTION\n\n`;
  for (const s of STEPS.vol2) md += renderStepBlock(s);

  md += `\n---\n*Generated from The Filmmaker's Blueprint · Curated by Arunak*\n`;

  const t = (data.meta_title || 'film').replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'film';
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `arunak_blueprint_${t}.md`; a.click();
  URL.revokeObjectURL(url);
  flashStatus('●  exported md');
}

/* ============================================================
   PALETTE PICKER
   ============================================================ */
function updatePalette() {
  const c1 = document.querySelector('[data-key="palette_c1"]')?.value || '#b03a1f';
  const c2 = document.querySelector('[data-key="palette_c2"]')?.value || '#a87a32';
  const c3 = document.querySelector('[data-key="palette_c3"]')?.value || '#1f5d4a';
  const sw1 = document.getElementById('sw1');
  const sw2 = document.getElementById('sw2');
  const sw3 = document.getElementById('sw3');
  if (sw1) sw1.style.background = c1;
  if (sw2) sw2.style.background = c2;
  if (sw3) sw3.style.background = c3;
  const h1 = document.querySelector('[data-key="palette_c1_hex"]');
  const h2 = document.querySelector('[data-key="palette_c2_hex"]');
  const h3 = document.querySelector('[data-key="palette_c3_hex"]');
  if (h1) h1.value = c1;
  if (h2) h2.value = c2;
  if (h3) h3.value = c3;
  const bar = document.getElementById('paletteBar');
  if (bar) bar.innerHTML = `<div style="background:${c1};"></div><div style="background:${c2};"></div><div style="background:${c3};"></div>`;
  // NOTE: deliberately does NOT call debouncedSave().
  // updatePalette() runs inside refreshAll(), which runs inside saveData().
  // Saving from here created an infinite save loop (saveData -> refreshAll ->
  // updatePalette -> debouncedSave -> saveData -> ...) that re-serialised every
  // field and re-rendered every widget once per 400ms for the life of the page.
  // The colour inputs carry data-key, so the user's own `input` event already
  // triggers a save; the _hex mirrors are derived and need no persistence.
}

/* ============================================================
   FOCUS TIMER (POMODORO)
   ============================================================ */
let timerState = { running: false, paused: false, remaining: 25 * 60, pomos: 0, interval: null };
function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function updateTimerUI() {
  const t = document.getElementById('focusTimer');
  const time = document.getElementById('ftTime');
  const pomo = document.getElementById('ftPomo');
  if (!t) return;
  time.textContent = formatTime(timerState.remaining);
  pomo.textContent = '×' + timerState.pomos;
  t.classList.remove('running', 'paused', 'done');
  if (timerState.remaining === 0) t.classList.add('done');
  else if (timerState.running) t.classList.add('running');
  else if (timerState.paused) t.classList.add('paused');
}
function tickTimer() {
  if (!timerState.running) return;
  timerState.remaining--;
  if (timerState.remaining <= 0) {
    timerState.running = false;
    timerState.pomos++;
    clearInterval(timerState.interval);
    timerState.remaining = 25 * 60;
    updateTimerUI();
    flashStatus('●  pomo done!');
    // Try to ring
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 660; gain.gain.value = 0.1;
      osc.start(); setTimeout(() => osc.stop(), 250);
    } catch (e) { /* no audio context — the timer still works */ }
    return;
  }
  updateTimerUI();
}
function toggleTimer() {
  if (timerState.running) {
    timerState.running = false;
    timerState.paused = true;
    clearInterval(timerState.interval);
  } else if (timerState.paused) {
    timerState.running = true;
    timerState.paused = false;
    timerState.interval = setInterval(tickTimer, 1000);
  } else {
    // Long-press / shift-click resets; normal click starts
    if (timerState.remaining === 25 * 60 || timerState.remaining === 0) {
      timerState.remaining = 25 * 60;
    }
    timerState.running = true;
    timerState.interval = setInterval(tickTimer, 1000);
  }
  updateTimerUI();
}

/* ============================================================
   LOCAL COMMENTS
   ============================================================ */
function attachCommentButtons() {
  document.querySelectorAll('.ask-label').forEach(label => {
    if (label.querySelector('.comment-btn')) return;
    const ask = label.closest('.ask, .pp-ask');
    if (!ask) return;
    const field = ask.querySelector('[data-key]');
    if (!field) return;
    const key = field.getAttribute('data-key');
    const btn = document.createElement('button');
    btn.className = 'comment-btn';
    btn.type = 'button';
    btn.title = 'Add a private note (saved on your device)';
    btn.textContent = '✎';
    btn.dataset.key = 'comment_for_' + key;
    btn.dataset.action = 'toggleCommentPanel';
    btn.dataset.noteKey = key;
    label.appendChild(btn);
    // mark if there's already a note
    if (localStorage.getItem(NOTE_PREFIX + key)) btn.classList.add('has-note');
  });
  updateCommentCount();
}

function toggleCommentPanel(key, ask) {
  let panel = ask.querySelector('.comment-panel[data-note-key="' + key + '"]');
  if (panel) {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) panel.querySelector('textarea').focus();
    return;
  }
  panel = document.createElement('div');
  panel.className = 'comment-panel open';
  panel.dataset.noteKey = key;
  const existing = localStorage.getItem(NOTE_PREFIX + key) || '';
  panel.innerHTML = '<div class="lab">PRIVATE NOTE · saved on this device only</div><textarea placeholder="Type a note. It stays on this browser, attached to this field."></textarea>';
  const ta = panel.querySelector('textarea');
  ta.value = existing;
  ta.addEventListener('input', () => {
    const val = ta.value.trim();
    const btn = ask.querySelector('.comment-btn');
    if (val) {
      localStorage.setItem(NOTE_PREFIX + key, ta.value);
      if (btn) btn.classList.add('has-note');
    } else {
      localStorage.removeItem(NOTE_PREFIX + key);
      if (btn) btn.classList.remove('has-note');
    }
    updateCommentCount();
  });
  ask.appendChild(panel);
  ta.focus();
}

function updateCommentCount() {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (String(localStorage.key(i)).startsWith(NOTE_PREFIX)) count++;
  }
  // Could surface this in toolbar; currently silent.
  return count;
}

/* ============================================================
   PRINT MODES
   ============================================================ */
function toggleZinePrint() {
  document.body.classList.toggle('zine-print-mode');
  const on = document.body.classList.contains('zine-print-mode');
  if (on) {
    // Trigger print preview after small delay
    setTimeout(() => {
      if (confirm('Zine mode active. Open print preview now?')) window.print();
    }, 200);
  }
}

function printPitchOnly() {
  rebuildPitchDeck();
  // Add a print-only class that hides everything except pitch
  document.body.classList.add('pitch-only-print');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('pitch-only-print'), 200);
  }, 100);
}

/* ============================================================
   EMAIL TO SELF
   ============================================================ */
function emailToSelf() {
  const data = collectData();
  const title = data.meta_title || 'Untitled film';
  const writer = data.meta_writer || 'Unknown';
  const logline = data.s2_log_final || data.s2_log2 || data.s2_log1 || '(logline not yet locked)';
  const theme = data.s3_theme || '(theme TBD)';
  const subject = encodeURIComponent('[Filmmaker\'s Blueprint] ' + title);
  const body = encodeURIComponent(
    'Project: ' + title + '\n' +
    'Writer/Director: ' + writer + '\n\n' +
    'LOGLINE\n' + logline + '\n\n' +
    'THEME\n' + theme + '\n\n' +
    'PROGRESS\n' + computeProgress() + '% across 24 steps\n\n' +
    '— Sent from Arunak\'s Filmmaker Blueprint\n\n' +
    'NOTE: To export the full data, open the blueprint and click JSON.'
  );
  window.location.href = 'mailto:?subject=' + subject + '&body=' + body;
}

function computeProgress() {
  // Use existing progress logic if available; fallback simple count
  try {
    const fill = document.getElementById('progressFill');
    if (fill && fill.style.width) {
      return Math.round(parseFloat(fill.style.width)) || 0;
    }
  } catch (e) { /* ignore */ }
  return 0;
}

/* ============================================================
   SAMPLE PACK LOADER
   ============================================================ */
async function loadSamplePack() {
  if (!confirm('This will REPLACE your current data with the Por Thozhil sample. Your current work will be lost (unless you exported JSON first).\n\nContinue?')) return;
  try {
    // Try fetching the companion file first
    let sample = null;
    try {
      const res = await fetch('arunak-portothozhil-sample.json');
      if (res.ok) sample = await res.json();
    } catch (e) { /* fetch may fail on file:// — fall through to embedded */ }
    if (!sample) {
      // Embedded fallback — minimal Por Thozhil data so demo works without companion file
      sample = { ...EMBEDDED_SAMPLE };
    }
    // Strip _about meta
    delete sample._about;
    // Apply
    Object.keys(sample).forEach(k => {
      const el = document.querySelector(`[data-key="${CSS.escape(k)}"]`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!sample[k];
      else el.value = sample[k];
    });
    // Trigger any listeners
    document.querySelectorAll('[data-key]').forEach(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    saveData();
    updateProgress();
    alert('✓ Por Thozhil sample loaded. Scroll through to see what a complete blueprint looks like.');
  } catch (err) {
    alert('Could not load sample: ' + err.message);
  }
}

const EMBEDDED_SAMPLE = {
  meta_title: 'Por Thozhil',
  meta_writer: 'Vignesh Raja & Alfred Prakash (sample)',
  meta_started: 'Sample data',
  meta_stage: 'Both volumes',
  v1_title: 'Por Thozhil',
  v1_genre: 'Crime / Noir',
  v1_draft: 'Locked — sample',
  s1_whatif: 'What if a serial killer who stopped after 1979 starts killing again — and a faint-hearted, book-smart rookie has to partner with a reclusive veteran cop to stop him?',
  s2_log_final: 'When a serial killer who stopped after 1979 starts killing again, a faint-hearted rookie cop must overcome his fear and partner with a reclusive veteran to catch the killer before more young women die.',
  s3_theme: 'Motive matters more than evidence.',
  s4_name: 'Prakash',
  s4_want: 'To do well in his first big case so he can prove himself.',
  s4_need: 'To accept (or quit) cop work on his own terms.',
  v2s2_theme: 'Motive matters more than evidence — and patience matters more than force.',
  v2s2_refuse: 'No songs. No comedy track. No romantic subplot. No mass-hero entry. No daytime ambience. No gore for shock value.'
};

/* ============================================================
   PITCH DECK BUILDER (HTML slides)
   ============================================================ */
function rebuildPitchDeck() {
  const data = collectData();
  const container = document.getElementById('pitchDeckContainer');
  if (!container) return;
  const slides = buildPitchSlides(data);
  container.innerHTML = slides.map(s => slideToHTML(s)).join('');
}

function collectData() {
  const out = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.getAttribute('data-key');
    if (el.type === 'checkbox') out[k] = !!el.checked;
    else out[k] = (el.value || '').trim();
  });
  return out;
}

function buildPitchSlides(d) {
  const fallback = (v, def) => v && v.length ? v : def;
  const beats = [];
  for (let i = 1; i <= 15; i++) {
    const k = 'b' + (i < 10 ? '0' + i : i);
    if (d[k]) beats.push((i < 10 ? '0' + i : i) + ' · ' + d[k]);
  }
  const slides = [
    {
      label: 'SLIDE 01 · TITLE',
      title: fallback(d.meta_title, 'Untitled'),
      body: fallback(d.s2_log_final, fallback(d.s2_log2, fallback(d.s2_log1, 'Logline pending'))),
      footer: fallback(d.meta_writer, 'Writer / Director')
    },
    {
      label: 'SLIDE 02 · WHAT IF',
      title: 'What if?',
      body: fallback(d.s1_whatif, 'Define your spark in Step 01.'),
      footer: 'THE SPARK'
    },
    {
      label: 'SLIDE 03 · THEME & STAKES',
      title: fallback(d.s3_theme, 'Theme pending'),
      bullets: [
        'External — ' + fallback(d.s3_ext, '?'),
        'Internal — ' + fallback(d.s3_int, '?'),
        'Philosophical — ' + fallback(d.s3_phil, '?')
      ],
      footer: 'WHAT THE FILM ARGUES'
    },
    {
      label: 'SLIDE 04 · PROTAGONIST',
      title: fallback(d.s4_name, 'Protagonist'),
      bullets: [
        'WANT — ' + fallback(d.s4_want, '?'),
        'NEED — ' + fallback(d.s4_need, '?'),
        'WOUND — ' + fallback(d.s4_wound, '?'),
        'ARC — ' + fallback(d.s4_arc, '?')
      ],
      footer: 'OUR HERO'
    },
    {
      label: 'SLIDE 05 · ANTAGONIST',
      title: fallback(d.s5_name, 'Antagonist'),
      bullets: [
        'WANT — ' + fallback(d.s5_want, '?'),
        'PHILOSOPHY — ' + fallback(d.s5_philosophy, '?'),
        'HERO IN HIS OWN STORY — ' + fallback(d.s5_hero, '?')
      ],
      footer: 'THE OPPOSITION'
    },
    {
      label: 'SLIDE 06 · WORLD & TONE',
      title: 'The world.',
      bullets: [
        'GENRE — ' + fallback(d.v1_genre, '?'),
        'ERA — ' + fallback(d.s7_era, '?'),
        'LOCATION — ' + fallback(d.s7_location, '?'),
        'RULES — ' + fallback(d.s7_rules, '?'),
        'TONE — ' + fallback(d.v2s2_tone1, '?') + (d.v2s2_tone2 ? ' (' + d.v2s2_tone2 + ')' : '')
      ],
      footer: 'WHERE WE LIVE'
    },
    {
      label: 'SLIDE 07 · REFERENCES',
      title: 'Reference films.',
      body: fallback(d.v2s2_refs, 'Pick 2-3 reference films and one out-of-medium reference. See Step 14.'),
      bullets: d.v2s2_refuse ? ['REFUSE — ' + d.v2s2_refuse] : [],
      footer: 'WHAT WE\'RE NOT'
    },
    {
      label: 'SLIDE 08 · STORY',
      title: 'The 15-beat story.',
      bullets: beats.length ? beats.slice(0, 15) : ['Fill in your 15 beats in Step 08.'],
      footer: 'STRUCTURE'
    },
    {
      label: 'SLIDE 09 · PRODUCTION',
      title: 'Production overview.',
      bullets: [
        'BUDGET — ' + fallback(d.v2s11_total, '?'),
        'SHOOT DAYS — ' + fallback(d.v2s11_days, '?'),
        'CAMERA — ' + fallback(d.v2s5_camera, '?') + (d.v2s5_aspect ? ' · ' + d.v2s5_aspect : ''),
        'DOP — ' + fallback(d.v2s11_dop, '?'),
        'PRODUCTION DESIGN — ' + fallback(d.v2s11_pd, '?'),
        'EDITOR — ' + fallback(d.v2s11_editor, '?'),
        'COMPOSER — ' + fallback(d.v2s11_composer, '?')
      ],
      footer: 'THE PLAN'
    },
    {
      label: 'SLIDE 10 · DIRECTOR',
      title: 'The director.',
      body: fallback(d.s1_why_me, 'Why this film, told by you, now? Fill in Step 01.'),
      footer: fallback(d.meta_writer, '—') + (d.v2s11_dop ? ' · DOP ' + d.v2s11_dop : '')
    }
  ];
  return slides;
}

function slideToHTML(s) {
  const isEmpty = !s.body && (!s.bullets || s.bullets.length === 0);
  return `
      <div class="pitch-slide${isEmpty ? ' empty' : ''}">
        <div>
          <span class="slide-num">${esc(s.label.split('·')[0].trim())}</span>
          <div class="slide-label">${esc(s.label)}</div>
          <h3>${escapeHTML(s.title || '')}</h3>
          ${s.body ? `<p>${escapeHTML(s.body)}</p>` : ''}
          ${s.bullets && s.bullets.length ? `<ul>${s.bullets.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="footer">${escapeHTML(s.footer || '')}</div>
      </div>
    `;
}

/** Same escaper the legacy page used; dom.js owns the implementation. */
function escapeHTML(s) {
  return esc(s == null ? '' : s);
}

/* ============================================================
   PPTX EXPORT
   ------------------------------------------------------------
   Was a runtime <script> injection from jsdelivr — a third-party
   request on a page whose whole promise is "your work never
   leaves this browser", and a hard failure offline. pptxgenjs is
   now a dependency, loaded by a dynamic import so it stays in its
   own chunk and out of the initial bundle.
   ============================================================ */
let pptxLoading = null;
async function ensurePptxLib() {
  if (!pptxLoading) {
    pptxLoading = import('pptxgenjs').then((m) => m.default || m);
  }
  return pptxLoading;
}

async function exportPitchPPTX() {
  try {
    const PptxGenJS = await ensurePptxLib();
    const data = collectData();
    const slides = buildPitchSlides(data);
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.title = data.meta_title || 'Filmmaker Blueprint Pitch';
    pres.author = data.meta_writer || 'Arunak';
    const INK = '1A1815', GOLD = 'A87A32', PAPER = 'F5ECD6';

    slides.forEach((s) => {
      const slide = pres.addSlide();
      slide.background = { color: INK };
      // Slide number top-right
      slide.addText(s.label, {
        x: 8.0, y: 0.3, w: 5.0, h: 0.4,
        fontSize: 9, fontFace: 'Courier New',
        color: GOLD, align: 'right', charSpacing: 2
      });
      // Label / heading
      slide.addText(s.label.split('·').slice(1).join('·').trim() || s.label, {
        x: 0.7, y: 0.7, w: 11, h: 0.4,
        fontSize: 10, fontFace: 'Courier New',
        color: GOLD, charSpacing: 3, bold: true
      });
      // Title
      slide.addText(s.title || '', {
        x: 0.7, y: 1.3, w: 11, h: 1.2,
        fontSize: 32, fontFace: 'Georgia',
        color: PAPER, italic: true, bold: true
      });
      // Body or bullets
      let yCursor = 2.7;
      if (s.body) {
        slide.addText(s.body, {
          x: 0.7, y: yCursor, w: 11, h: 1.5,
          fontSize: 16, fontFace: 'Georgia',
          color: PAPER
        });
        yCursor += 1.5;
      }
      if (s.bullets && s.bullets.length) {
        slide.addText(
          s.bullets.map(b => ({ text: b, options: { bullet: { code: '2014' }, color: PAPER, fontSize: 14, fontFace: 'Georgia' } })),
          { x: 0.7, y: yCursor, w: 11, h: 4 }
        );
      }
      // Footer
      slide.addText(s.footer || '', {
        x: 0.7, y: 6.8, w: 11, h: 0.4,
        fontSize: 9, fontFace: 'Courier New',
        color: GOLD, charSpacing: 2
      });
      // Gold accent bar
      slide.addShape('rect', { x: 0, y: 0, w: 0.15, h: 7.5, fill: { color: GOLD } });
    });

    const filename = (data.meta_title || 'pitch') + '-deck.pptx';
    pres.writeFile({ fileName: filename });
  } catch (err) {
    alert('PPTX export failed: ' + err.message);
  }
}

/* ============================================================
   SUPABASE SYNC PANEL
   ============================================================ */
function getSyncCfg() {
  try { return JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || '{}'); } catch (e) { return {}; }
}

function setSyncStatus(msg, kind) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = '●  ' + msg;
  el.className = 'sync-status' + (kind ? ' ' + kind : '');
}

function loadSyncConfig() {
  const cfg = getSyncCfg();
  const u = document.getElementById('sync_url');
  const k = document.getElementById('sync_key');
  const p = document.getElementById('sync_project_id');
  const a = document.getElementById('sync_auto');
  if (u) u.value = cfg.url || '';
  if (k) k.value = cfg.key || '';
  if (p) p.value = cfg.projectId || '';
  if (a) a.value = cfg.auto || 'off';
  if (cfg.url && cfg.key && cfg.projectId) setSyncStatus('configured · ' + cfg.projectId, 'ok');
  else setSyncStatus('not configured');
}

function saveSyncConfig() {
  const cfg = {
    url: (document.getElementById('sync_url').value || '').trim().replace(/\/$/, ''),
    key: (document.getElementById('sync_key').value || '').trim(),
    projectId: (document.getElementById('sync_project_id').value || '').trim(),
    auto: document.getElementById('sync_auto').value
  };
  localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
  if (cfg.url && cfg.key && cfg.projectId) setSyncStatus('configured · ' + cfg.projectId, 'ok');
  else setSyncStatus('incomplete config', 'err');
}

async function syncTest() {
  const cfg = getSyncCfg();
  if (!cfg.url || !cfg.key) { setSyncStatus('missing url or key', 'err'); return; }
  setSyncStatus('testing...');
  try {
    const res = await fetch(cfg.url + '/rest/v1/projects?select=id&limit=1', {
      headers: { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key }
    });
    if (res.ok) setSyncStatus('connection OK · table reachable', 'ok');
    else setSyncStatus('connection failed: HTTP ' + res.status + ' (check table & RLS)', 'err');
  } catch (err) { setSyncStatus('error: ' + err.message, 'err'); }
}

async function syncSave() {
  const cfg = getSyncCfg();
  if (!cfg.url || !cfg.key || !cfg.projectId) { setSyncStatus('configure first', 'err'); return; }
  setSyncStatus('pushing...');
  const data = collectData();
  // Include comments
  const notes = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (String(k).startsWith(NOTE_PREFIX)) notes[k.slice(NOTE_PREFIX.length)] = localStorage.getItem(k);
  }
  const payload = { id: cfg.projectId, data: { fields: data, notes: notes }, updated_at: new Date().toISOString() };
  try {
    const res = await fetch(cfg.url + '/rest/v1/projects?on_conflict=id', {
      method: 'POST',
      headers: {
        'apikey': cfg.key,
        'Authorization': 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) setSyncStatus('pushed at ' + new Date().toLocaleTimeString(), 'ok');
    else {
      const err = await res.text();
      setSyncStatus('push failed: HTTP ' + res.status + ' — ' + err.slice(0, 100), 'err');
    }
  } catch (err) { setSyncStatus('error: ' + err.message, 'err'); }
}

async function syncLoad() {
  const cfg = getSyncCfg();
  if (!cfg.url || !cfg.key || !cfg.projectId) { setSyncStatus('configure first', 'err'); return; }
  if (!confirm('This will REPLACE your current local data with the cloud version. Continue?')) return;
  setSyncStatus('pulling...');
  try {
    const res = await fetch(cfg.url + '/rest/v1/projects?id=eq.' + encodeURIComponent(cfg.projectId) + '&select=*', {
      headers: { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key }
    });
    if (!res.ok) { setSyncStatus('pull failed: HTTP ' + res.status, 'err'); return; }
    const rows = await res.json();
    if (!rows.length) { setSyncStatus('no row found for project id', 'err'); return; }
    const data = rows[0].data || {};
    const fields = data.fields || {};
    const notes = data.notes || {};
    // Apply fields
    Object.keys(fields).forEach(k => {
      const el = document.querySelector(`[data-key="${CSS.escape(k)}"]`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!fields[k];
      else el.value = fields[k];
    });
    // Apply notes
    Object.keys(notes).forEach(k => localStorage.setItem(NOTE_PREFIX + k, notes[k]));
    // Trigger listeners
    document.querySelectorAll('[data-key]').forEach(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    saveData();
    attachCommentButtons();
    setSyncStatus('pulled at ' + new Date().toLocaleTimeString(), 'ok');
  } catch (err) { setSyncStatus('error: ' + err.message, 'err'); }
}

/* ============================================================
   EVENT WIRING
   ------------------------------------------------------------
   One delegated listener per event type, dispatching on
   data-action. Replaces every inline handler the legacy page
   carried, so the page runs under a strict CSP.
   ============================================================ */

// Actions invoked as fn(...dataArgs).
const ACTIONS = {
  print: () => window.print(),
  exportPDF: () => exportBlueprintPDF(),
  toggleDark,
  toggleReadingMode,
  toggleZinePrint,
  toggleTimer,
  exportData,
  exportMarkdown,
  emailToSelf,
  importData,
  loadSamplePack,
  resetData,
  addSceneRow,
  addShotRow,
  addCastRow,
  addLocRow,
  clearEmpty,
  rebuildPitchDeck,
  exportPitchPPTX,
  printPitchOnly,
  syncSave,
  syncLoad,
  syncTest,
  saveSyncConfig
};

// Actions that need the element they were fired from.
const ELEMENT_ACTIONS = {
  duplicateRow: (el) => duplicateRow(el),
  deleteRow: (el) => deleteRow(el),
  toggleCommentPanel: (el) => {
    const ask = el.closest('.ask, .pp-ask');
    if (ask) toggleCommentPanel(el.dataset.noteKey, ask);
  }
};

function readArgs(el) {
  const raw = el.getAttribute('data-args');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function wireActions() {
  delegate(document, 'click', '[data-action]', (e, el) => {
    const name = el.getAttribute('data-action');
    if (ELEMENT_ACTIONS[name]) { e.preventDefault(); ELEMENT_ACTIONS[name](el, e); return; }
    const fn = ACTIONS[name];
    if (!fn) return;
    e.preventDefault();
    fn(...readArgs(el));
  });

  delegate(document, 'change', '[data-action-change]', (e, el) => {
    const name = el.getAttribute('data-action-change');
    if (name === 'jumpToStep') jumpToStep(el.value);
    else if (name === 'handleImport') handleImport(e);
  });

  delegate(document, 'input', '[data-action-input]', (e, el) => {
    if (el.getAttribute('data-action-input') === 'updatePalette') updatePalette();
  });

  // The charge select used to carry onchange="recolorChargeCell(this)"
  // on every generated row. One delegated listener covers every row,
  // including ones added later.
  delegate(document, 'change', 'select[data-key$="_charge"]', (e, el) => recolorChargeCell(el));

  // Checklist toggles.
  const toggleCheck = (li) => {
    li.classList.toggle('checked');
    li.setAttribute('aria-checked', li.classList.contains('checked') ? 'true' : 'false');
    debouncedSave();
  };
  delegate(document, 'click', 'li[data-key]', (e, li) => toggleCheck(li));
  // The renderer gives these role="checkbox" and tabindex="0"; make
  // the keyboard match the promise.
  delegate(document, 'keydown', 'li[data-key]', (e, li) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCheck(li); }
  });
}

/** The legacy bootstrap's static field listeners. */
function bindFieldListeners() {
  document.querySelectorAll('input[data-key], textarea[data-key], select[data-key]').forEach(el => {
    if (el.closest('#sceneListBody, #shotListBody, #castListBody, #locListBody')) return;
    el.addEventListener('input', debouncedSave);
    el.addEventListener('change', debouncedSave);
  });
}

function wireSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;
  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => performSearch(e.target.value), 220);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nextSearchHit(); }
    if (e.key === 'Escape') { e.target.value = ''; performSearch(''); e.target.blur(); }
  });
}

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault(); saveData();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      // let browser handle print
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault(); toggleDark();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('stepJumper').focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('searchInput').focus();
      document.getElementById('searchInput').select();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault(); toggleReadingMode();
    }
  });
}

function wireFocusTimerReset() {
  const ft = document.getElementById('focusTimer');
  if (!ft) return;
  ft.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearInterval(timerState.interval);
    timerState = { running: false, paused: false, remaining: 25 * 60, pomos: 0, interval: null };
    updateTimerUI();
  });
}

/** Auto-push hook — listens to input events directly (debounced). */
let _autoSyncDebounce;
function wireAutoSync() {
  const maybePush = (e) => {
    if (!e.target.matches || !e.target.matches('[data-key]')) return;
    const cfg = getSyncCfg();
    if (cfg.auto !== 'on' || !cfg.url || !cfg.key || !cfg.projectId) return;
    clearTimeout(_autoSyncDebounce);
    _autoSyncDebounce = setTimeout(() => syncSave(), 4000);
  };
  document.addEventListener('input', maybePush);
  document.addEventListener('change', maybePush);
}

/** Rebuild the pitch deck whenever data changes (debounced). */
let pitchDebounce;
function wirePitchRebuild() {
  document.addEventListener('input', (e) => {
    if (e.target.matches && e.target.matches('[data-key]')) {
      clearTimeout(pitchDebounce);
      pitchDebounce = setTimeout(rebuildPitchDeck, 1000);
    }
  });
}

/* ============================================================
   SHARED CHROME
   ------------------------------------------------------------
   chrome.js runs its own autoInit at import time. This module is
   a deferred ES module, so by then the document is parsed but
   #app is still empty — none of the page existed yet. Re-run the
   parts that need our markup, now that it is there.
   ============================================================ */
function reinitChrome() {
  try {
    mountShell();
    wireActionBar();
    injectReadingProgress();
    buildStepRail();
    buildBeatVisualizer();
    refreshBeatFills();
    wireGlossaryPopovers();
    wireFieldSavedFlash();
    autoAriaLabels();
    StudioUI.polishEmptyStates();
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) attachSignInPill(toolbar);
    StudioUI.upgradeThemeButton(toolbar);
    if (window.matchMedia('(max-width: 720px)').matches) StudioUI.attachMobileActionBar();
  } catch (e) {
    console.warn('[feature] chrome re-init', e);
  }
  // store.js auto-wires this on DOMContentLoaded, i.e. before the
  // toolbar existed. Wire it now.
  try { Store.wireBlueprintHeader(); } catch (e) { /* no project yet */ }
}

/* ============================================================
   BOOT — render markup → loadData() → refreshAll()
   ============================================================ */
function boot() {
  const app = document.getElementById('app');
  if (!app) { console.error('[feature] no #app to render into'); return; }

  renderPage(app);

  statusEl = document.getElementById('saveStatus');

  wireActions();
  bindFieldListeners();
  wireSearch();
  wireKeyboardShortcuts();
  wireFocusTimerReset();
  wireAutoSync();
  wirePitchRebuild();

  assignStepIds();
  loadPrefs();
  syncTitleAcrossCovers();
  updateTimerUI();

  // Word counters on the heaviest fields
  attachWordCounter('s2_log_final', 30);
  attachWordCounter('s3_theme', 25);
  attachWordCounter('v2s2_para', 200);
  attachWordCounter('v2s2_theme', 25);

  attachCommentButtons();
  loadSyncConfig();

  reinitChrome();

  // loadData() ends with refreshAll() — same order as the original.
  loadData();
  bridgeTitleToProject();

  setInterval(updateSavedAtTimer, 5000);

  // Auto-build pitch deck on first load
  setTimeout(rebuildPitchDeck, 200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
