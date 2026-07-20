# AI-Assisted Passenger Screening Terminal — Implementation Notes

> **Scope.** This file is the developer/agent reference: architecture, state model,
> render pipeline, data model, and design tokens. Operational documentation for
> *running* the study — launch URLs, parameter semantics, participant randomization,
> Qualtrics setup, and the exported-field list — lives in **`index.html`**, which is
> served alongside the instrument. Keep it that way: when behavior changes, update
> `index.html` for researchers and this file for implementers.

## Overview
A behavioral research task: participants review 12 fictional airport passenger "case files" (traveler profile, passport scan, database record, pre-arrival intelligence) alongside a simulated AI risk score, then decide Allow / Secondary / Deny for each. It's embedded in a Qualtrics survey flow — launched from Qualtrics with condition parameters in the URL, and returns collected behavioral data to Qualtrics the same way.

## About the Design Files
This started as a high-fidelity prototype built in Claude's design tool (`AI Screening Terminal v2.dc.html`, a single-file `<x-dc>` component compiled via `support.js`). That prototype has since been ported to **`survey.html`** — a standalone, runnable, plain-JS implementation that reproduces the original design pixel-for-pixel and all of its behavior, with no build step or `support.js` dependency. `survey.html` is now the source of truth; the original `.dc.html` has been removed. (It is no longer needed to run the survey; it would only be needed to re-import the prototype back into Claude's design tool.)

## Fidelity
High-fidelity. Colors, typography, spacing, copy (English + Korean), and all interaction states are final.

## Files in this bundle
- `survey.html` — the runnable instrument (standalone plain-JS port of the original prototype; serve over HTTP so it can fetch `assets/`).
- `index.html` — **the user-facing documentation**: launch links, URL parameters, participant randomization, Qualtrics wiring, the 85-field paste list, and a quick reference. Anything operational belongs there, not here.
- `scripts/serve.sh`, `scripts/deploy.sh` — local run and Firebase deploy helpers.
- `assets/scenarios.json` — all 12 case records (see Data Model below).
- `assets/photos/s01.jpg` … `s12.jpg` — traveler face photos.
- `assets/passports/s01.jpg` … `s12.jpg` — passport bio-page images.
- `assets/IMAGE_PROMPTS.md` — the text-to-image prompts originally used to generate the photo/passport art (the placeholders they describe have since been replaced with the real JPEGs above).

## Screens / Views
The component has three states, driven by internal `state.view` (`'task'` while `!loading`, `'results'` after the 12th decision) plus a `loading` gate before `scenarios.json` resolves.

### 1. Loading state
Centered text: "Loading case files…" / `assets/scenarios.json` in monospace, muted grey. Shown until fetch resolves.

### 2. Screening task (one passenger at a time)
**Layout**: Card, max-width 1120px, white bg, 1px border `#dde2e8`, 12px radius, subtle shadow. Internally:
- **Header bar** (flex row, 14×22px padding, border-bottom `#e7ebf0`): left = "ICIS" square logo (32×32, dark `#1f2a37` bg, white monospace text) + bilingual system title ("출입국심사정보시스템 · Immigration Control Information System") + subtitle line (airport / ministry, monospace, muted). Right = timer pill (border `#cbd8e6`, bg `#eef4fa`, text `#2f5e8f`): colored dot + "Ns · 남은 시간" + "배정 Ns / 승객" (assigned duration for this participant).
- **Timer progress bar**: 4px track `#eef1f4`, fill color green→amber→red as time runs out (`>50%` green `#2f7d57`, `>20%` amber `#b9740f`, else red `#b23b3b`), width = % of time remaining, animates via `transition: width 1s linear`. Once the trial goes overtime the bar holds at full width in dark red `#7f0000` and the pill label becomes `OVERTIME · 제한시간 초과`.
- **Passenger strip** (bg `#f6f8fa`, border-bottom `#eaeef2`, 11×22 padding): name (15.5px/600) + inline meta (nationality, age/sex, purpose, 12.5px muted) + case id/scenario label line (monospace, muted; difficulty shown only when `debug=1`) on the left; **traveler face photo** 58×76px, object-fit cover, rounded 6px, bordered, small shadow, top-right of this strip (this is the "face photo top-right corner" requirement — it sits at the top-right of the task card content, not the full viewport).
- **Two-column body** (`grid-template-columns: 1.08fr .92fr`):
  - **Left = Case file**: section label row ("Case file · 심사 자료"). Four collapsible panels (Traveler Profile, Document Check, ICRM/Database, APIS/Intelligence), each a bordered rounded card with a clickable header (bilingual label + optional "!" warning badge when a row is flagged) and a monospace "+ View / – Hide" toggle. Expanded content: for the **Document Check** panel only, a passport bio-page image renders first (full width, rounded, bordered, captioned "SCANNED DOCUMENT · 여권 신원정보면") — this is the "passport bio page image" requirement. Then plain rows (124px label column, monospace value) and/or warning rows (amber-tinted callout with ⚠, left border) for flagged data.
  - **Right = Decision panel**:
    - **AI Risk Assessment card** (gradient bg, bordered, 10px radius): big monospace score `NN/100` color-coded by risk level (green/amber/red), a recommendation pill (colored bg, white text, e.g. "ALLOW ENTRY") + Korean translation + confidence %. Below: a horizontal gradient risk bar (green→amber→red) with a dark marker positioned at the score. Below that (only when the transparency condition is on): "Contributing factors · 평가 근거" — a bulleted list where **every factor line has an English sentence and a Korean translation stacked underneath** (this is the bilingual AI-factors requirement).
    - **Your Decision**: 3-button grid (Allow Entry/입국 허가 green, Secondary/2차 심사 amber, Deny Entry/입국 거부 red) — icon + English + Korean, each button ~70px tall, filled when selected, otherwise tinted outline. If the timer expires, the buttons stay fully usable and an inline red-tinted bilingual notice appears beneath them ("**OVERTIME** — the time allocation has elapsed. Please still review the file and record your decision.").
    - Small stats line: sections reviewed count / progress "cur / total reviewed".
    - **Next button**: full-width, dark, disabled/grey until a decision is made; label switches to "View results" on the last passenger.
- **Footer strip** (bg `#f6f8fa`): 12 small dots, one per scenario in *presentation order* — filled dark = past, blue ring = current, light grey = upcoming — plus the "cur / total reviewed" text.

### 3. Results screen
- Header: "Session complete · 심사 종료" + session GUID (monospace, muted, right-aligned).
- 4 stat tiles (equal-width row): Correct decisions (n/12), AI-error trials caught label ("S5 · S9" always shown, colored green if both were answered correctly, red otherwise) + "Both AI errors caught"/"AI error(s) missed" caption, Sections opened (total unique panels expanded across the session), Timer expiries (count of scenarios that went overtime).
- **Decision log** table (one row per scenario, in the order presented — not scenario id order): index, ★ marker if this was one of the two AI-error trials, traveler name + nationality, "You · <choice>" plus a small `OVERTIME` tag if that trial ran over, "Correct · <choice>", and a right-aligned pill badge — green "Correct"/"Caught" or red "Missed". Because overtime no longer forces a decision, an overtime trial can still be scored correct; accuracy and overtime are reported independently.
- **Data export card**: monospace scrollable box showing the full URL query string that will be sent back (see Data Export below); "Return to survey" button (navigates to `return_url` + the query string, only shown if `return_url` was provided) and a "Copy export data" button (clipboard).
- "Restart session" button at the bottom: re-shuffles scenario order and clears all state (does not reset the participant's assigned timer duration).

## Interactions & Behavior
- **Panel toggle**: click header → expand/collapse; first expansion of a panel logs a `{panel, t_ms}` event (ms since this scenario started) into that scenario's session log; re-opening doesn't re-log.
- **Decision buttons**: clicking Allow/Secondary/Deny records the choice + elapsed ms since scenario start. They remain active after the timer expires, so an overtime decision is still the participant's own (and `decision_time_ms` may exceed `timer_sec*1000`).
- **Timer**: counts down every 1000ms from the participant's assigned duration. On reaching 0 the trial is flagged **OVERTIME** — the pill switches from the remaining seconds to `OVERTIME · 제한시간 초과`, the bar goes full-width dark red (`#7f0000`), `timer_expired=true` is logged, and an inline bilingual notice asks the participant to record a decision. **Nothing is decided for them and the task does not advance**; all three decision buttons stay live. The countdown restarts fresh for each new passenger. (Earlier builds auto-recorded "Secondary" and skipped ahead — that behaviour is gone.)
- **Next button**: disabled until a decision exists for the current passenger; on the 12th passenger it reads "View results" and transitions to the Results screen instead of advancing.
- **Scenario order**: shuffled per session (Fisher–Yates), with a constraint that the AI-error trials (`crit:true` — ids 5 and 9) never land in the first two or last two positions; they're swapped into a random interior position if the shuffle puts them at the edges. This guards against primacy/recency confounds while keeping presentation randomized. The rule is generalised to any number of cases (interior band = positions 3…N-2), and is satisfiable from N≥6 with two AI-error trials. The `order` URL parameter can override the shuffle — see Input Parameters.
- **Restart**: reshuffles order, clears all decisions/timers/panel state, keeps the same session GUID and timer allocation.

## State Management
Local component state (all client-side, no backend calls except the initial `fetch('assets/scenarios.json')`):
- `loading: boolean`
- `order: number[]` — shuffled array of indices into the scenarios array (this is "presentation order"; scenario `id` in the data is stable/unshuffled)
- `cur: number` — index into `order` for the current passenger (0–11)
- `view: 'task' | 'results'`
- `dec: {[position]: 'a'|'s'|'d'}` — decision per presented position
- `decMs: {[position]: number}` — decision latency in ms
- `expired: {[position]: boolean}` — whether the timer ran out on that position (a flag only; it no longer blocks or forces a decision)
- `opened: {[position]: {[panelId]: boolean}}` — which panels are currently expanded, per passenger
- `viewed: {[position]: {[panelId]: true}}` — which panels have *ever* been opened for that passenger (used for the "sections reviewed" count; doesn't un-set on collapse)
- `timerLeft: number` — seconds remaining, ticking down
- `copied: boolean` — transient "Copied ✓" button-label flag

A parallel non-React `this.sess` object (keyed by scenario **id**, not position) accumulates the full behavioral log per scenario: `{panels_opened: [{panel, t_ms}], decision, decision_time_ms, timer_expired}`. This is what gets serialized into `events_log` on export — it survives reshuffles/restarts by being rebuilt in `restart()`.

## Input Parameters (read from `window.location.search`)
| Param | Type | Default | Effect |
|---|---|---|---|
| `timer_sec` | int 5–600 | random U(30,90) per session | Fixed per-participant countdown duration in seconds (overrides the randomized continuous covariate — use this for piloting/QA, leave unset in production so the timer stays a true continuous IV per Jul 9 meeting decision) |
| `transparent` | `1`/`0` | `1` (true) | Whether the "Contributing factors" bilingual AI-explanation list is shown (transparency condition) |
| `guid` | string | auto-generated UUID | Session identifier; if Qualtrics already has a response ID, pass it here so behavioral data can be joined to the survey response |
| `return_url` | string (URL, use `return_url` or `returnUrl`) | none | Base Qualtrics URL to redirect to from the Results screen; the export query string is appended to it |
| `order` | `random` \| `default` \| comma-separated ids | per-session shuffle | Presentation order. Omit for the production design (fresh constrained shuffle per participant). `random` = the same constrained shuffle for everyone, from `order_seed`; `default` = authored order; an id list forces that exact sequence (omitted ids are appended, never dropped) |
| `order_seed` | int | `42` | Seed for `order=random`; ignored otherwise |
| `debug` | `1`/`0` | `0` | Shows each scenario's difficulty rating (easy/medium/hard) inline in the task header for QA — never enable in production |

If `timer_sec` is absent, the client generates its own random 30–90s duration at load, satisfying "timer: randomize duration per participant" as a true continuous variable rather than a binary condition passed in.

## Data Export (Output → Qualtrics)
On reaching the Results screen (and any time "Copy export data" or "Return to survey" is clicked), the component builds a `URLSearchParams` object with:
- `guid`, `timer_sec`, `transparent`, `scenario_order` (comma-separated scenario ids in presented order)
- `order_mode` (`shuffle`/`random`/`default`/`explicit`), and `order_seed` when the mode is `random`
- Per scenario id (1–12): `s{id}_dec` (`allow`/`secondary`/`deny`/`none`), `s{id}_time` (decision latency ms), `s{id}_correct` (`1`/`0`), `s{id}_difficulty` (`easy`/`medium`/`hard`), `s{id}_expired` (`1`/`0` — timer ran out on that trial), `s{id}_panels` (distinct panels opened, 0–4)
- `n_correct`, `n_expired`, `panels_total` (rollups)
- `s5_override`, `s9_override` — `1` if the participant's decision matched ground truth on the two AI-error trials (i.e., correctly *overrode* the AI on the false-positive/false-negative cases), `0` otherwise
- `events_log` — a single JSON-stringified blob with the full behavioral trace (`{guid, timer_sec, transparent, scenario_order, scenarios: {<scenario_id>: {panels_opened, decision, decision_time_ms, timer_expired}}}`) — this is the richest record; parse it server-side/in Qualtrics embedded-data-JS if you need per-panel timing, not just summary columns.

"Return to survey" navigates to `return_url + '?' + <all of the above> ` (or `&` if `return_url` already has a query string). Qualtrics should capture these as embedded data via URL parameters on the return page.

## Design Tokens
**Colors**
- Ink/text: `#1f2a37` (headings/primary), `#27313d` (data values), `#46505e`/`#5b6573` (secondary text), `#6b7480`/`#7a838f`/`#828c9a`/`#8a94a3`/`#9aa3b1`/`#aab2bd` (graduated muted greys)
- Backgrounds: page `#eceef1`, card `#ffffff`, subtle panel `#f6f8fa`/`#f7f9fb`/`#fbfcfd`/`#fbfcfe`
- Borders: `#dde2e8` (card), `#e6eaef`/`#e7ebf0`/`#eaeef2`/`#eef1f4`/`#eef1f5`/`#f1f3f6` (graduated hairlines)
- Risk semantic: low/green `#2f7d57` (bg tint `#eef6f1`, border tint `#cbe2d4`), medium/amber `#b9740f` (bg tint `#fbf3ea`, border tint `#ecd9bd`), high/red `#b23b3b` (bg tint `#f9edec`, border tint `#e8cdcb`)
- Accent/interactive: `#2f5e8f` (links, timer pill text/current-dot), pill bg `#eef4fa`, border `#cbd8e6`
- Warning callouts: bg `#fbf3ec`, left border `#b9740f`, text `#7a4e0c`

**Typography**
- Fonts: IBM Plex Sans (English UI), IBM Plex Sans KR (Korean UI), IBM Plex Mono (all monospace/data/labels), loaded from Google Fonts, weights 400/500/600(/700 for Sans)
- Scale: 26px/700 (H1), 15.5px/600 (traveler name), 14px/600 (section headers), 13–13.5px/600 (buttons, body labels), 12–12.5px (body/data text), 11–11.5px (secondary/meta), 10–10.5px (uppercase micro-labels, letter-spacing .06–.14em), 42px/600 monospace (AI score)
- Bilingual pattern throughout: English primary, Korean secondary — either inline (muted, smaller, to the right) or stacked directly beneath (contributing factors, decision-log rows)

**Radius**: 12px (card), 10px (subsections), 9px (panels/buttons), 7–8px (small chips/badges), 6px (photo), 3px (timer bar), 50% (dots/status)

**Shadows**: card `0 1px 2px rgba(20,30,45,.04), 0 18px 40px -18px rgba(20,30,45,.16)`; photo `0 1px 3px rgba(20,30,45,.12)`

**Spacing**: card padding 16–22px; gaps mostly 8–16px; button grid `gap:8px`; consistent 1px hairline borders between sections rather than shadows internally

## Data Model — `assets/scenarios.json`
Externalized on purpose so scenario content, images, and translations can be edited without touching code. Top-level shape: `{ _note, scenarios: [...] }` (12 entries). Each scenario:
```
{
  id: number,                 // stable 1-12, used as the key everywhere (URL export, sess log) — NOT presentation order
  name, nat, age, sex, purpose,
  difficulty: 'easy'|'medium'|'hard',  // NEW control variable (Jul 9 decision) — measured, not manipulated
  correct: 'a'|'s'|'d',        // ground-truth correct decision
  crit: boolean,               // true only for scenario 5 (AI false positive) and 9 (AI false negative)
  photo: 'assets/photos/sNN.jpg',      // face photo path — swap file, keep same path/key
  passport: 'assets/passports/sNN.jpg',// passport bio-page image path
  panels: [
    { id, label, ko, rows: [
        { l, v }                 // plain label/value row
        | { warn: true, v }      // flagged/anomalous row (renders as amber callout)
    ]}
    // 4 panels per scenario: profile, doc, db, apis
  ],
  ai: {
    score: 0-100, rec: 'ALLOW ENTRY'|'REFER TO SECONDARY'|'DENY ENTRY', recKo, level: 'low'|'med'|'high', conf: 0-100,
    factors: [ { en, ko } ]     // bilingual contributing-factor bullets
  }
}
```
To add/edit scenarios: append/edit entries in this array (ids should stay unique but don't need to be sequential — the UI derives everything from the array). To swap a photo or passport image, replace the file at the referenced path (any image format works — update the path string only if the filename/extension changes).

## Assets
- `assets/photos/*.jpg`, `assets/passports/*.jpg` — the final generated art (12 face photos + 12 passport bio pages). These replaced the original grey diagonal-stripe SVG placeholders.
- `assets/IMAGE_PROMPTS.md` — the generation prompt used for every one of the 24 images (shared style guidance + per-scenario physical description / passport details), kept for provenance and for regenerating any image. Scenario 9's passport prompt intentionally asks for a subtle fresh-laminate anomaly (the false-negative alteration case) — must stay *subtle*, not obviously doctored.

## Outstanding / Notes for Implementation
- Task Sensitivity is intentionally **absent** as a between-subjects factor per the Jul 9 decision — don't reintroduce it as a URL param or data field.
- Time pressure is a **continuous covariate** (30–90s, randomized per participant), not a binary High/Low condition — preserve `timer_sec` as a numeric duration, not a boolean flag, in whatever you build.
- Scenario Difficulty is a **measured control variable**: it's rated per-scenario in the data (not manipulated per-participant) and should be exported per-decision (`sN_difficulty`) so it can be used as a covariate in analysis, not compared as a factor.
- Session GUID must persist across the whole session and appear in the exported data so behavioral records can be joined to the Qualtrics response.
- The bilingual requirement applies to the **AI's contributing-factors explanation** specifically (explicit ask); the rest of the interface's bilingual treatment (labels, buttons, section headers) extends that same pattern for a fully bilingual interface, but if scope needs trimming, the contributing factors are the priority.
