# AI-Assisted Passenger Screening Terminal — Implementation Notes

> **Scope.** This file is the developer/agent reference: architecture, state model,
> render pipeline, data model, and design tokens. Operational documentation for
> *running* the study — launch URLs, parameter semantics, participant randomization,
> Qualtrics setup, and the exported-field list — lives in **`index.html`**, which is
> served alongside the instrument. Keep it that way: when behavior changes, update
> `index.html` for researchers and this file for implementers.

## Overview
A behavioral research task: participants review 15 fictional airport passenger "case files" (traveler profile, document check, database record, pre-arrival intelligence) alongside a simulated AI risk score, then decide Allow Entry / Secondary — Recommending Rejection / Secondary — Requesting Additional Information for each. Frontline officers cannot deny entry, so no deny option exists (August 6 2026 decision). It's embedded in a Qualtrics survey flow — launched from Qualtrics with condition parameters in the URL, and returns collected behavioral data to Qualtrics the same way.

## About the Design Files
This started as a high-fidelity prototype built in Claude's design tool (`AI Screening Terminal v2.dc.html`, a single-file `<x-dc>` component compiled via `support.js`). That prototype has since been ported to **`survey.html`** — a standalone, runnable, plain-JS implementation that reproduces the original design pixel-for-pixel and all of its behavior, with no build step or `support.js` dependency. `survey.html` is now the source of truth; the original `.dc.html` has been removed. (It is no longer needed to run the survey; it would only be needed to re-import the prototype back into Claude's design tool.)

## Fidelity
High-fidelity. Colors, typography, spacing, copy (English + Korean), and all interaction states are final.

## Files in this bundle
- `survey.html` — the runnable instrument (standalone plain-JS port of the original prototype; serve over HTTP so it can fetch `assets/`).
- `index.html` — **the user-facing documentation**: launch links, URL parameters, participant randomization, Qualtrics wiring, the 74-field paste list, and a quick reference. Anything operational belongs there, not here.
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
- **Header bar** (flex row, 14×22px padding, border-bottom `#e7ebf0`): left = "ICIS" square logo (32×32, dark `#1f2a37` bg, white monospace text) + bilingual system title ("출입국심사정보시스템 · Immigration Control Information System") + subtitle line (airport / ministry, monospace, muted). Right = two chips: a neutral **queue chip** (`QUEUE · N 명 대기 · waiting`, border `#dde2e8`, bg `#f6f8fa`) and the **elapsed-time pill** (border `#cbd8e6`, bg `#eef4fa`, text `#2f5e8f`): dot + "M:SS · 경과 시간" + the norm cue "팀 평균 ~60초".
- **Passenger strip** (bg `#f6f8fa`, border-bottom `#eaeef2`, 11×22 padding): name (15.5px/600) + inline meta (nationality, age/sex, purpose, 12.5px muted) + case id/scenario label line (monospace, muted; difficulty shown only when `debug=1`) . The traveler thumbnail was removed on August 6 2026 — the face images now live inside the Document Check panel as a side-by-side pair.
- **Two-column body** (`grid-template-columns: 1.08fr .92fr`):
  - **Left = Case file**: section label row ("Case file · 심사 자료"). Four collapsible panels (Traveler Profile, Document Check, ICRM/Database, APIS/Intelligence), each a bordered rounded card with a clickable header (bilingual label + optional "!" warning badge when a row is flagged) and a monospace "+ View / – Hide" toggle. Expanded content: the **Document Check** panel opens with two square photos side by side (`1fr 1fr`, 10px gap, `aspect-ratio:1/1`, `object-fit:cover`) — left `passport_photo` captioned "PHOTO ON FILE · 등록 사진", right `counter_photo` captioned "COUNTER CAPTURE · 현장 촬영". This mirrors the biometric comparison officers actually perform and replaced the full passport scan, which AI image generation rendered country-inaccurate and watermarked. Then plain rows (124px label column, monospace value) and/or warning rows (amber-tinted callout with ⚠, left border) for flagged data.
  - **Right = Decision panel**:
    - **AI Risk Assessment card** (gradient bg, bordered, 10px radius): big monospace score `NN/100` color-coded by risk level (green/amber/red), a recommendation pill (colored bg, white text, e.g. "ALLOW ENTRY") + Korean translation + confidence %. Below: a horizontal gradient risk bar (green→amber→red) with a dark marker positioned at the score. Below that (only when the transparency condition is on): "Contributing factors · 평가 근거" — a bulleted list where **every factor line has an English sentence and a Korean translation stacked underneath** (this is the bilingual AI-factors requirement).
    - **Your Decision**: 3-button grid — Allow Entry/입국 허가 (green), Secondary — Recommending Rejection/2차 심사 — 거부 권고 (amber), Secondary — Requesting Information/2차 심사 — 정보 요청 (blue `#2f5e8f`) — icon + English + Korean, filled when selected, otherwise tinted outline. Choosing either secondary option reveals an optional 300-character comment textarea below the grid with a live character counter; choosing Allow hides it and clears any note already typed.
    - Small stats line: sections reviewed count / progress "cur / total reviewed".
    - **Next button**: full-width, dark, disabled/grey until a decision is made; label switches to "View results" on the last passenger.
- **Footer strip** (bg `#f6f8fa`): one small dot per scenario, one per scenario in *presentation order* — filled dark = past, blue ring = current, light grey = upcoming — plus the "cur / total reviewed" text.

### 3. Results screen
- Header: "Session complete · 심사 종료" + session GUID (monospace, muted, right-aligned).
- 4 stat tiles (equal-width row): Correct decisions (n/15); AI-error trials label (derived from the data as `S5 · S9 · S13`, green when all three were answered correctly, red otherwise) + "All AI errors caught"/"AI error(s) missed" caption; Sections opened (total unique panels expanded); Queue condition (the participant's `queue_size`).
- **Decision log** table (one row per scenario, in the order presented — not scenario id order): index, ★ marker for the three AI-error trials, traveler name + nationality, "You · <choice>", "Correct · <choice>", and a right-aligned pill badge — green "Correct"/"Caught" or red "Missed". The heading derives the starred ids from the data rather than hardcoding them.
- **Data export card**: monospace scrollable box showing the full URL query string that will be sent back (see Data Export below); "Return to survey" button (navigates to `return_url` + the query string, only shown if `return_url` was provided) and a "Copy export data" button (clipboard).
- "Restart session" button at the bottom: re-shuffles scenario order and clears all state, keeping the session GUID and the queue condition.

## Interactions & Behavior
- **Panel toggle**: click header → expand/collapse; first expansion of a panel logs a `{panel, t_ms}` event (ms since this scenario started) into that scenario's session log; re-opening doesn't re-log.
- **Decision buttons**: clicking any option records the short code (`a`/`sr`/`si`) + elapsed ms since scenario start. There is no state in which they are disabled.
- **Comment field**: bound with an `input` listener in `bindEvents()` that writes straight to `App.state.comments[cur]` (and mirrors into `App.sess[id].comment`). This matters — every `render()` replaces `root.innerHTML`, so reading the textarea only at decide/next time would silently discard text typed before a panel toggle. `input` never re-renders, so state stays ahead of the DOM and the value survives each rebuild.
- **Timer**: counts **up** from `0:00`, ticking every 1000ms via `updateTimerDom()`, which touches only the pill text so ticking never triggers a re-render (a re-render would destroy the comment textarea mid-typing). There is no ceiling, no expiry, no forced decision and no progress bar — Incheon officers have no hard per-passenger limit, only an internalised ~60s norm, so a countdown would imply a deadline that does not exist. Resets to zero on each new passenger. (This supersedes both the original auto-advance and the July 2026 OVERTIME flag.)
- **Next button**: disabled until a decision exists for the current passenger; on the 12th passenger it reads "View results" and transitions to the Results screen instead of advancing.
- **Scenario order**: shuffled per session (Fisher–Yates), constrained so the AI-error trials (`crit:true` — ids 5, 9, 13) never land in the first three or last three positions and are never adjacent to one another. Enforced by **rejection sampling** (re-shuffle until valid, capped at 5000 attempts) rather than a targeted swap, because swapping would bias which orderings appear; re-drawing keeps every admissible ordering equally likely. The band is `positions 3 … N-4` (0-indexed) and the code falls back to a plain shuffle when the data cannot satisfy it (a band narrower than `2k-1` for k error trials). The `order` URL parameter can override the shuffle — see Input Parameters.
- **Restart**: reshuffles order, clears all decisions/comments/panel state, keeps the same session GUID and queue condition.

## State Management
Local component state (all client-side, no backend calls except the initial `fetch('assets/scenarios.json')`):
- `loading: boolean`
- `order: number[]` — shuffled array of indices into the scenarios array (this is "presentation order"; scenario `id` in the data is stable/unshuffled)
- `cur: number` — index into `order` for the current passenger (0–11)
- `view: 'task' | 'results'`
- `dec: {[position]: 'a'|'sr'|'si'}` — decision per presented position
- `comments: {[position]: string}` — referral note per presented position, ≤300 chars
- `decMs: {[position]: number}` — decision latency in ms
- `opened: {[position]: {[panelId]: boolean}}` — which panels are currently expanded, per passenger
- `viewed: {[position]: {[panelId]: true}}` — which panels have *ever* been opened for that passenger (used for the "sections reviewed" count; doesn't un-set on collapse)
- `copied: boolean` — transient "Copied ✓" button-label flag

A parallel non-React `App.sess` object (keyed by scenario **id**, not position) accumulates the full behavioral log per scenario: `{panels_opened: [{panel, t_ms}], decision, decision_time_ms, comment}`. Note the two index spaces: `App.state.*` is keyed by presentation position while `App.sess` is keyed by stable scenario id; the export bridges them via `App.state.order.indexOf(di)`. This is what gets serialized into `events_log` on export — it survives reshuffles/restarts by being rebuilt in `restart()`.

## Input Parameters (read from `window.location.search`)
| Param | Type | Default | Effect |
|---|---|---|---|
| `queue_size` | `50`\|`200`\|`500` | `200` | Between-subjects queue-load condition, shown as a header chip and held constant all session. Any other value falls back to 200 |
| `transparent` | `1`/`0` | `1` (true) | Whether the "Contributing factors" bilingual AI-explanation list is shown (transparency condition) |
| `guid` | string | auto-generated UUID | Session identifier; if Qualtrics already has a response ID, pass it here so behavioral data can be joined to the survey response |
| `return_url` | string (URL, use `return_url` or `returnUrl`) | none | Base Qualtrics URL to redirect to from the Results screen; the export query string is appended to it |
| `order` | `random` \| `default` \| comma-separated ids | per-session shuffle | Presentation order. Omit for the production design (fresh constrained shuffle per participant). `random` = the same constrained shuffle for everyone, from `order_seed`; `default` = authored order; an id list forces that exact sequence (omitted ids are appended, never dropped) |
| `order_seed` | int | `42` | Seed for `order=random`; ignored otherwise |
| `debug` | `1`/`0` | `0` | Shows each scenario's difficulty rating (easy/medium/hard) inline in the task header for QA — never enable in production |

There is no timer parameter: the elapsed-time counter always starts at zero and counts up, and per-trial elapsed time (`sN_time`) is the time-pressure measure.

## Data Export (Output → Qualtrics)
On reaching the Results screen (and any time "Copy export data" or "Return to survey" is clicked), the component builds a `URLSearchParams` object with:
- `guid`, `queue_size`, `transparent`, `scenario_order` (comma-separated scenario ids in presented order)
- `order_mode` (`shuffle`/`random`/`default`/`explicit`), and `order_seed` when the mode is `random`
- Per scenario id (1–15): `s{id}_dec` (`a`/`sr`/`si`/`NA`), `s{id}_time` (decision latency ms), `s{id}_panels` (distinct panels opened, 0–4), `s{id}_comment` (referral note, ≤300 chars, empty for Allow)
- `correct_total`, `panels_total` (rollups)
- `fp_caught` (S5), `fn_caught` (S9), `fp2_caught` (S13) — `1` if the participant correctly overrode the AI on that error trial. S5 and S13 are false positives (correct action Allow); S9 is a false negative (correct action Secondary — recommending rejection)
- `events_log` — a single JSON-stringified blob with the full behavioral trace (`{guid, queue_size, transparent, order_mode, scenario_order, scenarios: {<scenario_id>: {panels_opened, decision, decision_time_ms, comment}}}`) — the richest record; parse it if you need per-panel timing, not just summary columns.
- `events_log_dropped` / `comments_dropped` — set to `1` only when the URL-length guard had to shed that part. `finalReturnUrl()` degrades in three tiers: full → drop `events_log` → drop comments too. Korean percent-encodes to ~9 chars per character, so 15 filled comments can exceed the 7500-char cap on their own; summary fields always survive.

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
  difficulty: 'easy'|'medium'|'hard',  // measured control variable, not manipulated
  correct: 'a'|'s'|'d',        // ground-truth correct decision
  crit: boolean,               // true only for scenario 5 (AI false positive) and 9 (AI false negative)
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
    score: 0-100, rec: 'ALLOW ENTRY'|'REFER TO SECONDARY'|'DENY ENTRY', recKo, level: 'low'|'med'|'high', conf: 0-100,
    factors: [ { en, ko } ]     // bilingual contributing-factor bullets
  }
}
```
To add/edit scenarios: append/edit entries in this array (ids should stay unique but don't need to be sequential — the UI derives everything from the array, including the scenario count, the `/N` sections counter and the starred AI-error ids on the results screen). To swap an image, replace the file at the referenced path — update the path string only if the filename or extension changes.

## Assets
- `assets/people/*.jpg` — 30 images, a `_passport` / `_counter` pair per scenario. The earlier `assets/photos/` and `assets/passports/` directories were deleted on August 6 2026 when the passport-scan layout was dropped (recoverable from git history).
- `assets/IMAGE_PROMPTS.md` — the Gemini prompt behind each pair, kept for provenance and regeneration. **Scenario 9's prompt deliberately specifies two similar but different people** (the false-negative case, simulating a passport that may not belong to its bearer) — the difference must stay subtle enough to survive a quick glance.

## Outstanding / Notes for Implementation
- Task Sensitivity is intentionally **absent** as a between-subjects factor per the Jul 9 decision — don't reintroduce it as a URL param or data field.
- Time pressure is now measured, not manipulated: the count-up timer has no ceiling and per-trial elapsed time (`sN_time`) is the covariate. Do not reintroduce a countdown or an expiry state.
- Queue load is a **between-subjects condition** (`queue_size` ∈ {50, 200, 500}), fixed per session. The team has not settled whether it is a third factor or a covariate — keep it a discrete value so either analysis stays open.
- Scenario Difficulty remains a **measured control variable** in the data, but is no longer exported per-decision — it is recomputable from `scenario_order` plus the static answer key, which keeps the return URL shorter. Same reasoning removed `sN_correct`.
- Session GUID must persist across the whole session and appear in the exported data so behavioral records can be joined to the Qualtrics response.
- The bilingual requirement applies to the **AI's contributing-factors explanation** specifically (explicit ask); the rest of the interface's bilingual treatment (labels, buttons, section headers) extends that same pattern for a fully bilingual interface, but if scope needs trimming, the contributing factors are the priority.
