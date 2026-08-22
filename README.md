# AI-Assisted Passenger Screening Terminal — Implementation Notes

> **Scope.** This file is the developer/agent reference: architecture, state model,
> render pipeline, data model, and design tokens. Operational documentation for
> *running* the study — launch URLs, parameter semantics, participant randomization,
> Qualtrics setup, and the exported-field list — lives in **`index.html`**, which is
> served alongside the instrument. Keep it that way: when behavior changes, update
> `index.html` for researchers and this file for implementers.

## Overview
A behavioral research task: participants review 15 fictional airport passenger "case files" (traveler profile, document check, database record, pre-arrival intelligence) alongside a simulated AI recommendation, then decide Allow Entry / Secondary — Checking / Requesting Further Information / Secondary — Recommending Rejection for each (ordered left-to-right by severity, August 21 2026 decision). Frontline officers cannot deny entry, so no deny option exists (August 6 2026 decision). It's embedded in a Qualtrics survey flow — launched from Qualtrics with condition parameters in the URL, and returns collected behavioral data to Qualtrics the same way.

## About the Design Files
This started as a high-fidelity prototype built in Claude's design tool (`AI Screening Terminal v2.dc.html`, a single-file `<x-dc>` component compiled via `support.js`). That prototype has since been ported to **`survey.html`** — a standalone, runnable, plain-JS implementation that reproduces the original design pixel-for-pixel and all of its behavior, with no build step or `support.js` dependency. `survey.html` is now the source of truth; the original `.dc.html` has been removed. (It is no longer needed to run the survey; it would only be needed to re-import the prototype back into Claude's design tool.)

## Fidelity
High-fidelity. Colors, typography, spacing, copy (English + Korean), and all interaction states are final.

## Files in this bundle
- `survey.html` — the runnable instrument (standalone plain-JS port of the original prototype; serve over HTTP so it can fetch `assets/`).
- `index.html` — **the user-facing documentation**: launch links, URL parameters, participant randomization, Qualtrics wiring, the 165-field paste list, and a quick reference. Anything operational belongs there, not here.
- `scripts/serve.sh`, `scripts/deploy.sh` — local run and Firebase deploy helpers.
- `assets/scenarios.json` — all 15 case records (see Data Model below). Regenerated August 2026 from `Full_Survey_Instrument_Aug2026.docx` §5, which is the content source of truth.
- `assets/people/sNN_passport.jpg` / `sNN_counter.jpg` — the two headshots per scenario (photo on file vs. live counter capture), s01–s15.
- `assets/IMAGE_PROMPTS.md` — the Gemini prompts that generated those 30 images, kept for provenance and regeneration.

## Screens / Views
The component has three states, driven by internal `state.view` (`'task'` while `!loading`, `'results'` after the 15th decision) plus a `loading` gate before `scenarios.json` resolves.

### 1. Loading state
Centered text: "Loading case files…" / `assets/scenarios.json` in monospace, muted grey. Shown until fetch resolves.

### 2. Screening task (one passenger at a time)
**Layout**: Card, max-width 1120px, white bg, 1px border `#dde2e8`, 12px radius, subtle shadow. Internally:
- **Header bar** (flex row, 14×22px padding, border-bottom `#e7ebf0`): left = "ICIS" square logo (32×32, dark `#1f2a37` bg, white monospace text) + bilingual system title ("출입국심사정보시스템 · Immigration Control Information System") + subtitle line (airport / ministry, monospace, muted). Right = two chips: a neutral **queue chip** showing a day-type label, not a headcount (`QUEUE · Normal load · 보통 날`, border `#dde2e8`, bg `#f6f8fa`) — the raw 50/200/500 integer is still what gets exported and the **elapsed-time pill** (border `#cbd8e6`, bg `#eef4fa`, text `#2f5e8f`): dot + "M:SS · 경과 시간" + the norm cue "팀 평균 ~60초".
- **Passenger strip** (bg `#f6f8fa`, border-bottom `#eaeef2`, 11×22 padding): a single monospace line, `Passenger N of 15` (difficulty appended only when `debug=1`). Name, case id, nationality, age/sex and purpose were **all removed on August 21 2026** — previously they were legible without opening anything, letting a participant form an impression without registering a panel-open event. Every piece of case information now sits behind an explicit panel open, which is what makes `sN_panels*` a clean information-seeking measure. The traveler thumbnail went on August 6 2026; the face images live inside the Document Check panel as a side-by-side pair.
- **Panel-provenance strip** (bg `#f0f4f8`, border-bottom `#e7ebf0`, 11.5px muted): a static one-liner on every scenario distinguishing **Case record (left)** — automated immigration database, compiled before arrival — from **AI assessment (right)**. Added because first-time participants read the two columns as one source (Casey, August 21 2026).
- **Two-column body** (`grid-template-columns: 1.08fr .92fr`):
  - **Left = Case file**: section label row ("Case file · 심사 자료"). Four collapsible panels (Traveler Profile, Document Check, ICRM/Database, APIS/Intelligence), each a bordered rounded card with a clickable header (bilingual label + a monospace "+ View / – Hide" toggle). The `[!]` badge that used to appear on collapsed headers of panels containing a flagged row was **removed on August 21 2026** — it revealed which panels held warnings without the participant opening them, contaminating the panel-open measure. The amber callouts themselves are unchanged inside the expanded panel. Expanded content: the **Document Check** panel opens with two square photos side by side (`1fr 1fr`, 10px gap, `aspect-ratio:1/1`, `object-fit:cover`) — left `passport_photo` captioned "PHOTO ON FILE · 등록 사진", right `counter_photo` captioned "COUNTER CAPTURE · 현장 촬영". This mirrors the biometric comparison officers actually perform and replaced the full passport scan, which AI image generation rendered country-inaccurate and watermarked. Then plain rows (124px label column, monospace value) and/or warning rows (amber-tinted callout with ⚠, left border) for flagged data.
  - **Right = Decision panel**:
    - **AI Assessment card** (gradient bg, bordered, 10px radius): a recommendation chip in **neutral** styling (bg `#f2f4f7`, border `#d4dae1`, ink text — never colored) + Korean translation, then "System confidence in this recommendation · NN%" (13px) with `이 추천에 대한 시스템 신뢰도` beneath, both suppressed when `show_confidence=0`. The numeric `NN/100` score, its risk-level color coding, the green→amber→red gradient bar and the `LOW … HIGH` axis were **all removed on August 21 2026**: they invited the AI's output to be read as an independent risk metric, and the color anchored severity outside the manipulation. `ai.score` and `ai.level` remain in the JSON but **nothing renders them**. Below (only when the transparency condition is on): "Contributing factors · 평가 근거" — a bulleted list where **every factor line has an English sentence and a Korean translation stacked underneath** (this is the bilingual AI-factors requirement).
    - **Your Decision**: 3-button grid, ordered left-to-right by severity — Allow Entry/입국 허가, Secondary — Checking / Requesting Further Information/2차 심사 — 정보 확인/추가 요청, Secondary — Recommending Rejection/2차 심사 — 거부 권고 — icon + English + Korean. **Deliberately uncoloured**: all three render identically (bg `#f7f9fb`, border `#d4dae1`, ink text) and fill solid dark `#1f2a37` when selected. A green/amber/red severity ramp was specified and then rejected on August 21 2026, because it nudges severity perception independently of the AI manipulation. Choosing either secondary option reveals an optional 300-character comment textarea below the grid with a live character counter; choosing Allow hides it and clears any note already typed.
    - Small stats line: sections reviewed count / progress "cur / total reviewed".
    - **Next button**: full-width, dark, disabled/grey until a decision is made; label switches to "View results" on the last passenger.
- **Footer strip** (bg `#f6f8fa`): one small dot per scenario, one per scenario in *presentation order* — filled dark = past, blue ring = current, light grey = upcoming — plus the "cur / total reviewed" text.

### 3. Results screen
- Header: "Session complete · 심사 종료" + session GUID (monospace, muted, right-aligned).
- 4 stat tiles (equal-width row): Correct decisions (n/15); AI-error trials label (derived from the data as `S5 · S9 · S13`, green when all three were answered correctly, red otherwise) + "All AI errors caught"/"AI error(s) missed" caption; Sections opened (total unique panels expanded); Queue condition (the day-type label for the participant's `queue_size`, not the integer).
- **Decision log** table (one row per scenario, in the order presented — not scenario id order): index, ★ marker for the three AI-error trials, traveler name + nationality, "You · <choice>", "Correct · <choice>", and a right-aligned pill badge — green "Correct"/"Caught" or red "Missed". The heading derives the starred ids from the data rather than hardcoding them.
- **Data export card**: monospace scrollable box showing the full URL query string that will be sent back (see Data Export below); "Return to survey" button (navigates to `return_url` + the query string, only shown if `return_url` was provided) and a "Copy export data" button (clipboard).
- "Restart session" button at the bottom: re-shuffles scenario order and clears all state, keeping the session GUID and the queue condition.

## Interactions & Behavior
- **Panel toggle**: click header → expand/collapse. **Every** expansion logs a `{panel, t_ms}` event (ms since this scenario started) into that scenario's session log — including re-opens, which is why `panels_opened` can contain duplicates and the unique count is taken with a `Set`. Collapses are logged too (added August 2026): `togglePanel()` maintains a per-panel `{opens, first_ms, dwell_ms, openedAt}` accumulator, closing out `dwell_ms` on each collapse. Panels still expanded when the officer advances never receive a close click, so `flushPanelDwell()` settles them at the top of `next()` — meaning dwell always covers the full time a section was on screen. Panels can be open simultaneously, so per-panel dwell need not sum to the trial time.
- **Decision buttons**: clicking any option records the short code (`a`/`si`/`sr`) plus elapsed ms since scenario start. The **first** click and the **latest** click are recorded separately (`decision_first_ms` / `decision_final_ms`), and switching to a *different* option increments `decision_changes`. Re-selecting the option already chosen is not a change. There is no state in which the buttons are disabled, and the clock is **not** stopped by deciding — see Timer. Choosing Allow clears any referral note already typed.
- **Comment field**: bound with an `input` listener in `bindEvents()` that writes straight to `App.state.comments[cur]` (and mirrors into `App.sess[id].comment`). This matters — every `render()` replaces `root.innerHTML`, so reading the textarea only at decide/next time would silently discard text typed before a panel toggle. `input` never re-renders, so state stays ahead of the DOM and the value survives each rebuild.
- **Timer**: counts **up** from `0:00`. There is no ceiling, no expiry, no forced decision and no progress bar — Incheon officers have no hard per-passenger limit, only an internalised ~60s norm, so a countdown would imply a deadline that does not exist. Resets on each new passenger. (Supersedes both the original auto-advance and the July 2026 OVERTIME flag.) Two properties are load-bearing and easy to regress:
  - **The displayed value is derived from the wall clock**, via `elapsedSec()` = `floor((Date.now() - App.scenarioStart)/1000)`. The 1000ms interval only *refreshes the DOM*; it does not carry the value. Incrementing a counter per tick — the previous implementation — let the display drift from the exported times whenever timers were throttled or coalesced (a backgrounded tab clamps `setInterval` to ~1s and merges pending callbacks), and the error accumulated. Measured before the fix: screen `0:11` against an exported `12353ms`. Do not reintroduce a tick counter.
  - **Deciding does not stop the clock.** It used to, which froze the display at the first click while the exported time kept advancing to the latest one — so an officer who decided at 0:10, kept reading, and switched at 0:40 was recorded at 40s against a screen showing 0:10. `updateTimerDom()` touches only the pill text, so ticking never triggers a re-render (a re-render would destroy the comment textarea mid-typing).
- **Next button**: disabled until a decision exists for the current passenger; on the 15th passenger it reads "View results" and transitions to the Results screen instead of advancing.
- **Debug quick-skip** (`?debug=1` only): a dashed button under Next that selects Allow if nothing is chosen yet and advances immediately, so all 15 scenarios can be walked in seconds during QA. Never rendered in production.
- **Scenario order**: shuffled per session (Fisher–Yates), constrained so the AI-error trials (`crit:true` — ids 5, 9, 13) never land in the first three or last three positions and are never adjacent to one another. Enforced by **rejection sampling** (re-shuffle until valid, capped at 5000 attempts) rather than a targeted swap, because swapping would bias which orderings appear; re-drawing keeps every admissible ordering equally likely. The band is `positions 3 … N-4` (0-indexed) and the code falls back to a plain shuffle when the data cannot satisfy it (a band narrower than `2k-1` for k error trials). The `order` URL parameter can override the shuffle — see Input Parameters.
- **Restart**: reshuffles order, clears all decisions/comments/panel state, keeps the same session GUID and queue condition.

## State Management
Local component state (all client-side, no backend calls except the initial `fetch('assets/scenarios.json')`):
- `loading: boolean`
- `order: number[]` — shuffled array of indices into the scenarios array (this is "presentation order"; scenario `id` in the data is stable/unshuffled)
- `cur: number` — index into `order` for the current passenger (0–14)
- `view: 'task' | 'results'`
- `dec: {[position]: 'a'|'sr'|'si'}` — decision per presented position
- `comments: {[position]: string}` — referral note per presented position, ≤300 chars
- `decMs: {[position]: number}` — latency of the most recent decision click, in ms (UI-side mirror; the exported values come from `App.sess`)
- `opened: {[position]: {[panelId]: boolean}}` — which panels are currently expanded, per passenger
- `viewed: {[position]: {[panelId]: true}}` — which panels have *ever* been opened for that passenger (used for the "sections reviewed" count; doesn't un-set on collapse)
- `copied: boolean` — transient "Copied ✓" button-label flag

A parallel non-React `App.sess` object (keyed by scenario **id**, not position) accumulates the full behavioral log per scenario:

```
{
  panels_opened: [{ panel, t_ms }],       // every expansion, re-opens included
  panel_stats: {                           // per panel id, created lazily on first open
    <panelId>: { opens, first_ms, dwell_ms, openedAt }   // openedAt is transient bookkeeping
  },
  decision,                                // 'allow' | 'secondary-info' | 'secondary-reject'
  decision_first_ms, decision_final_ms,    // first and latest commitment
  decision_changes,                        // switches to a *different* option
  comment
}
```

Note the two index spaces: `App.state.*` is keyed by presentation position while `App.sess` is keyed by stable scenario id; the export bridges them via `App.state.order.indexOf(di)`. This is what gets serialized into `events_log` on export — it survives reshuffles/restarts by being rebuilt in `restart()`.

## Input Parameters (read from `window.location.search`)
| Param | Type | Default | Effect |
|---|---|---|---|
| `queue_size` | `50`\|`200`\|`500` | `200` | Between-subjects queue-load condition, shown as a header chip and held constant all session. Any other value falls back to 200 |
| `transparent` | `1`/`0` | `1` (true) | Whether the "Contributing factors" bilingual AI-explanation list is shown (transparency condition). Note this is now its *only* effect — both settings show the recommendation and, unless suppressed below, the confidence |
| `show_confidence` | `1`/`0` | `1` (true) | Whether "System confidence in this recommendation · NN%" and its Korean line are shown. Independent of `transparent`, so the two can be crossed or either held constant. A third between-subjects switch; the randomization designs in `index.html` assume it is held at `1` |
| `guid` | string | auto-generated UUID | Session identifier; if Qualtrics already has a response ID, pass it here so behavioral data can be joined to the survey response |
| `return_url` | string (URL, use `return_url` or `returnUrl`) | none | Base Qualtrics URL to redirect to from the Results screen; the export query string is appended to it |
| `order` | `random` \| `default` \| comma-separated ids | per-session shuffle | Presentation order. Omit for the production design (fresh constrained shuffle per participant). `random` = the same constrained shuffle for everyone, from `order_seed`; `default` = authored order; an id list forces that exact sequence (omitted ids are appended, never dropped) |
| `order_seed` | int | `42` | Seed for `order=random`; ignored otherwise |
| `auto_return` | `1`/`0` | on when `return_url` is set, off under `debug` | Auto-redirect to `return_url` on completion so data still returns if the participant walks away |
| `return_delay` | int 0–60 | `6` | Seconds the results screen shows before auto-return; `0` redirects immediately |
| `debug` | `1`/`0` | `0` | QA only: shows each scenario's difficulty rating inline, adds the quick-skip button, prints the return-URL length against the cap, and disables auto-return — never enable in production |

There is no timer parameter: the elapsed-time counter always starts at zero and counts up, and per-trial elapsed time (`sN_time_first`) is the time-pressure measure.

`return_url` is also accepted spelled `returnUrl`; `return_url` wins when both are present. The alias exists only for backward compatibility — prefer the snake_case form.

## Data Export (Output → Qualtrics)
On reaching the Results screen (and any time "Copy export data" or "Return to survey" is clicked), the component builds a `URLSearchParams` object with:
- `guid`, `queue_size`, `transparent`, `show_confidence`, `scenario_order` (comma-separated scenario ids in presented order)
- `order_mode` (`shuffle`/`random`/`default`/`explicit`), and `order_seed` when the mode is `random`
- Per scenario id (1–15):
  - `s{id}_dec` — `a`/`si`/`sr`/`NA`
  - `s{id}_time_first` / `s{id}_time_final` — ms to the first and latest decision click. **`_first` is the time-pressure DV**; the two differ only when the officer reconsidered
  - `s{id}_dec_changes` — switches to a different option after the first click, `0` for most trials
  - `s{id}_panels` — distinct panels opened, 0–4
  - `s{id}_panels_open` — *which* ones, comma list in canonical `profile,doc,db,apis` order
  - `s{id}_panel_opens` / `s{id}_panel_dwell` / `s{id}_panel_first` — `panel:value` lists giving expansion count (>1 = revisit), total ms expanded, and ms to first expansion (sort for consult order). Packed one column per scenario rather than four, to stay inside the URL cap
  - `s{id}_comment` — referral note, ≤300 chars, empty for Allow
- `correct_total`, `panels_total` (rollups)
- `fp_caught` (S5), `fn_caught` (S9), `fp2_caught` (S13) — `1` if the participant correctly overrode the AI on that error trial. S5 and S13 are false positives (correct action Allow); S9 is a false negative (correct action Secondary — recommending rejection)
- `events_log` — a single JSON-stringified blob of the full trace (`{guid, queue_size, transparent, show_confidence, order_mode, scenario_order, scenarios: App.sess}`). **Expect it to be absent from real sessions.** It duplicates the entire export and costs ~14,000 characters encoded, so the guard sheds it on any full run; keeping it would need a ~20,000-char cap. Everything analytically useful is now promoted to its own column, so its loss costs only the exact open sequence — which `s{id}_panel_first` already orders.
- `events_log_dropped` / `comments_dropped` — set to `1` only when the URL-length guard had to shed that part. `finalReturnUrl()` degrades in three tiers: full → drop `events_log` → drop comments too. Korean percent-encodes to ~9 chars per character, so 15 filled comments can still exceed the cap on their own; summary fields always survive. The cap is **16,000** characters (`App.MAX_URL`), raised from 7,500 in August 2026 — once per-panel timing joined the export, 7,500 was tight enough that ordinary sessions were shedding comments. A realistic 15-case run with Korean notes lands near 6,100.

"Return to survey" navigates to `return_url + '?' + <all of the above> ` (or `&` if `return_url` already has a query string). Qualtrics should capture these as embedded data via URL parameters on the return page.

## Design Tokens
**Colors**
- Ink/text: `#1f2a37` (headings/primary), `#27313d` (data values), `#46505e`/`#5b6573` (secondary text), `#6b7480`/`#7a838f`/`#828c9a`/`#8a94a3`/`#9aa3b1`/`#aab2bd` (graduated muted greys)
- Backgrounds: page `#eceef1`, card `#ffffff`, subtle panel `#f6f8fa`/`#f7f9fb`/`#fbfcfd`/`#fbfcfe`
- Borders: `#dde2e8` (card), `#e6eaef`/`#e7ebf0`/`#eaeef2`/`#eef1f4`/`#eef1f5`/`#f1f3f6` (graduated hairlines)
- Risk semantic: low/green `#2f7d57`, medium/amber `#b9740f`, high/red `#b23b3b`. **Largely retired from the task screen** as of August 21 2026 — the `colorOf` risk-level map and the `tint` triples were deleted along with the AI score, the risk bar and the coloured decision buttons. Green and red survive only on the **results** screen (correct/missed badges, AI-error tile); amber survives as the warning-callout border inside expanded panels
- Decision buttons: unselected bg `#f7f9fb` / border `#d4dae1` / ink text; selected fills `#1f2a37` with white text. AI recommendation chip: bg `#f2f4f7`, border `#d4dae1`, ink text — deliberately never colour-coded
- Accent/interactive: `#2f5e8f` (links, timer pill text/current-dot), pill bg `#eef4fa`, border `#cbd8e6`
- Warning callouts: bg `#fbf3ec`, left border `#b9740f`, text `#7a4e0c`

**Typography**
- Fonts: IBM Plex Sans (English UI), IBM Plex Sans KR (Korean UI), IBM Plex Mono (all monospace/data/labels), loaded from Google Fonts, weights 400/500/600(/700 for Sans)
- Scale: 26px/700 (H1), 14px/600 (section headers), 13–13.5px/600 (buttons, body labels, AI confidence line), 12–12.5px (body/data text), 11–11.5px (secondary/meta), 10–10.5px (uppercase micro-labels, letter-spacing .06–.14em). The 15.5px traveler name and the 42px monospace AI score are both gone
- Bilingual pattern throughout: English primary, Korean secondary — either inline (muted, smaller, to the right) or stacked directly beneath (contributing factors, decision-log rows)

**Radius**: 12px (card), 10px (subsections), 9px (panels/buttons), 7–8px (small chips/badges), 6px (photo), 50% (dots/status)

**Shadows**: card `0 1px 2px rgba(20,30,45,.04), 0 18px 40px -18px rgba(20,30,45,.16)`; photo `0 1px 3px rgba(20,30,45,.12)`

**Spacing**: card padding 16–22px; gaps mostly 8–16px; button grid `gap:8px`; consistent 1px hairline borders between sections rather than shadows internally

## Data Model — `assets/scenarios.json`
Externalized on purpose so scenario content, images, and translations can be edited without touching code. Top-level shape: `{ _note, scenarios: [...] }` (15 entries). Each scenario:
```
{
  id: number,                 // stable 1-15, used as the key everywhere (URL export, sess log) — NOT presentation order
  name, nat, age, sex, purpose,
  difficulty: 'easy'|'medium'|'hard',  // measured control variable, not manipulated
  correct: 'a'|'si'|'sr',      // ground-truth correct decision (allow / secondary-info / secondary-reject)
  crit: boolean,               // AI-error trials: 5 and 13 (false positives, correct = allow), 9 (false negative, correct = sr)
  passport_photo: 'assets/people/sNN_passport.jpg', // headshot on file (left)
  counter_photo:  'assets/people/sNN_counter.jpg',  // live counter capture (right)
  panels: [
    { id, label, ko, rows: [
        { l, v }                 // plain label/value row
        | { warn: true, v }      // flagged/anomalous row (renders as amber callout)
    ]}
    // 4 panels per scenario: profile, doc, db, apis
  ],
  ai: {
    // score and level are NO LONGER RENDERED (Aug 21 2026) — kept as analysis-side metadata only
    score: 0-100, level: 'low'|'med'|'high',
    // rec must be exactly one of these three; recKo mirrors it in Korean
    rec: 'ALLOW ENTRY' | 'REFER TO SECONDARY — RECOMMENDING REJECTION'
       | 'REFER TO SECONDARY — REQUESTING FURTHER INFORMATION',
    recKo,                      // '입국 허가' | '2차 심사 회부 — 거부 권고' | '2차 심사 회부 — 정보 확인/추가 요청'
    conf: 0-100,                // hand-authored; the ONLY number the officer now sees
    factors: [ { en, ko } ]     // bilingual contributing-factor bullets
  }
}
```
**`ai.conf` is authored, not computed.** The values were written as a companion to the numeric risk score, loosely tracking its distance from 50 — so a mid-range score got low confidence. That score is no longer displayed, which leaves confidence as the only number on screen, carrying weight it was never calibrated for (range 61–97, mean 78; the error trials sit at S5 68, S9 78, S13 68). Worth a deliberate pass before a live wave, or run `show_confidence=0`.

**`ai.rec` must specify the secondary subtype.** No entry may read a bare "REFER TO SECONDARY SCREENING" — every referral says either "— RECOMMENDING REJECTION" or "— REQUESTING FURTHER INFORMATION" (August 21 2026 decision, after inconsistency was spotted across scenarios).

To add/edit scenarios: append/edit entries in this array (ids should stay unique but don't need to be sequential — the UI derives everything from the array, including the scenario count, the `/N` sections counter and the starred AI-error ids on the results screen). To swap an image, replace the file at the referenced path — update the path string only if the filename or extension changes.

## Assets
- `assets/people/*.jpg` — 30 images, a `_passport` / `_counter` pair per scenario. The earlier `assets/photos/` and `assets/passports/` directories were deleted on August 6 2026 when the passport-scan layout was dropped (recoverable from git history).
- `assets/IMAGE_PROMPTS.md` — the Gemini prompt behind each pair, kept for provenance and regeneration. **Scenario 9's prompt deliberately specifies two similar but different people** (the false-negative case, simulating a passport that may not belong to its bearer) — the difference must stay subtle enough to survive a quick glance.

## Outstanding / Notes for Implementation
- Task Sensitivity is intentionally **absent** as a between-subjects factor per the Jul 9 decision — don't reintroduce it as a URL param or data field.
- Time pressure is now measured, not manipulated: the count-up timer has no ceiling and per-trial elapsed time (`sN_time_first`) is the covariate. Do not reintroduce a countdown or an expiry state, a tick-counted display, or a clock that stops on decide — see Timer under Interactions for why each of those was a defect.
- Queue load is a **between-subjects condition** (`queue_size` ∈ {50, 200, 500}), fixed per session. The team has not settled whether it is a factor or a covariate — keep it a discrete value so either analysis stays open. It is *displayed* as a day-type label, but the integer is what must be exported.
- `show_confidence` is a **third** between-subjects switch and is not accounted for in either randomization design in `index.html`, both of which assume it is held at `1`. Crossing all three factors gives 12 cells (~83 per cell at n≈1,000, thin for an interaction). Do not treat it as manipulated without re-planning cell sizes.
- Warning flags inside case-file panels remain an **open question** (August 21 2026): keep them as-is with the source clarified in the pre-task briefing, or strip the amber styling and present the rows as plain data. The team leaned toward keeping them. Only the collapsed-header `[!]` badge was removed, on the separate ground that it leaked warning presence without a panel open.
- Scenario Difficulty remains a **measured control variable** in the data, but is no longer exported per-decision. Its provenance is still **unjustified** — the easy/medium/hard ratings were proposed by an LLM, not derived from expert input or independent raters (open question from the August 21 2026 meeting: solicit ratings, motivate them through Incheon officers, or drop the field) — it is recomputable from `scenario_order` plus the static answer key, which keeps the return URL shorter. Same reasoning removed `sN_correct`.
- Session GUID must persist across the whole session and appear in the exported data so behavioral records can be joined to the Qualtrics response.
- The bilingual requirement applies to the **AI's contributing-factors explanation** specifically (explicit ask); the rest of the interface's bilingual treatment (labels, buttons, section headers) extends that same pattern for a fully bilingual interface, but if scope needs trimming, the contributing factors are the priority.
