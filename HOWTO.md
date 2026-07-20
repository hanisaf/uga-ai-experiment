# HOWTO — Launching the AI Screening Terminal & Randomizing Participant URLs

This guide covers (1) how to run the instrument locally, (2) every URL parameter it
accepts, (3) how to build participant URLs for the different condition combinations,
and (4) how to wire the randomization up in Qualtrics.

The runnable file is **`survey.html`** (standalone, no build step). It reads
`assets/scenarios.json` and the images in `assets/` at runtime.

---

## 1. Launching the design

Because the page **fetches `assets/scenarios.json`**, it must be served over HTTP.
Opening `survey.html` directly as a `file://` path will show "Loading case files…"
forever (browsers block `fetch` on `file://`).

### Local preview (any machine with Python)

From inside the `design_handoff_screening_terminal/` folder:

```bash
python3 -m http.server 8731
```

Then open: <http://localhost:8731/survey.html>

Stop the server with `Ctrl+C`. Any static server works equally well
(`npx serve`, `php -S localhost:8731`, nginx, etc.) — the only requirement is that
`survey.html` and the `assets/` folder are served from the same origin.

### Production hosting

Upload `survey.html` **and the entire `assets/` folder together** (same relative
paths) to any static host — your university web space, Netlify/Vercel/GitHub Pages,
an S3 bucket, or Qualtrics' own file library. The participant-facing URL is then:

```
https://YOUR-HOST/path/survey.html?<parameters>
```

Everything else in this guide is about what goes after the `?`.

---

## 2. URL parameters

All parameters are read from the query string (`window.location.search`).

| Param | Values | Default | Role in the study |
|---|---|---|---|
| `transparent` | `1` / `0` | `1` | **Between-subjects IV.** `1` shows the AI's bilingual "Contributing factors" list; `0` hides it (score + recommendation only). This is the condition you randomize. |
| `timer_sec` | integer 5–600 | random `U(30,90)` per session | **Continuous covariate.** Countdown seconds per passenger. Leave it **unset** in production so the app draws a fresh random value per participant; set it only for piloting/QA or a bucketed factorial design (see §3B). |
| `guid` | string | auto UUID | Session ID written into the exported data. **Pass the Qualtrics ResponseID here** so behavioral records join back to the survey response. |
| `return_url` | URL | none | Qualtrics URL to redirect back to on completion; the export query string is appended. Required to collect data back (see §5). |
| `auto_return` | `1` / `0` | on in production, off in `debug` | Automatically redirect to `return_url` when the session ends, so data isn't lost if the participant closes the tab. On by default whenever `return_url` is set. |
| `return_delay` | integer 0–60 | `6` | Seconds the results screen shows before auto-return fires. `0` = redirect immediately (participant never sees the answer key). |
| `debug` | `1` / `0` | `0` | QA only — shows each scenario's difficulty rating inline **and disables auto-return** so you can inspect the results/export screen. **Never enable in production.** |

Notes:
- `transparent` accepts `1`/`0` (also `true`/`false`). The default `1` applies only when the parameter is **absent**; any other *present* value (e.g. `2`, `yes`, empty) is treated as `0` (opaque), so pass exactly `1` or `0`.
- `timer_sec` outside 5–600 is ignored and the app randomizes instead.
- The app always **exports the timer value it actually used** (`timer_sec` in the
  returned data), so a self-randomized timer is still recorded per participant — you
  do not need to pass it in to capture it.

---

## 3. Building participant URLs

There are two designs depending on how you want to treat the timer. Pick one.

### Approach A — Recommended (matches the Jul 9 design decision)

**Randomize `transparent` per participant; let the app self-randomize the timer.**
Transparency is the manipulated factor (2 cells); time pressure stays a true
continuous covariate captured on the way out.

Two conditions:

```
Transparent (AI explanation shown):
https://YOUR-HOST/survey.html?transparent=1&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>

Opaque (score only, no explanation):
https://YOUR-HOST/survey.html?transparent=0&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>
```

Example balanced assignment for 10 participants (transparency randomized, timer omitted → app picks `U(30,90)`):

| Participant | `transparent` | Timer |
|---|---|---|
| P01 | 0 | app-randomized |
| P02 | 1 | app-randomized |
| P03 | 1 | app-randomized |
| P04 | 0 | app-randomized |
| P05 | 0 | app-randomized |
| P06 | 0 | app-randomized |
| P07 | 0 | app-randomized |
| P08 | 1 | app-randomized |
| P09 | 1 | app-randomized |
| P10 | 1 | app-randomized |

### Approach B — Full factorial (only if you want the timer *manipulated*, not continuous)

If analysis needs discrete time-pressure levels, cross `timer_sec ∈ {30, 60, 90}`
with `transparent ∈ {0, 1}` → **6 cells**. This makes time pressure a manipulated
factor rather than a continuous covariate — a deliberate departure from the current
design decision, so use it only if that's what you want.

The 6 base URLs:

```
https://YOUR-HOST/survey.html?transparent=1&timer_sec=30&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>
https://YOUR-HOST/survey.html?transparent=1&timer_sec=60&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>
https://YOUR-HOST/survey.html?transparent=1&timer_sec=90&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>
https://YOUR-HOST/survey.html?transparent=0&timer_sec=30&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>
https://YOUR-HOST/survey.html?transparent=0&timer_sec=60&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>
https://YOUR-HOST/survey.html?transparent=0&timer_sec=90&guid=<RESPONSE_ID>&return_url=<QUALTRICS_RETURN>
```

Example counterbalanced assignment for 12 participants (2 reps of the 6 cells, shuffled):

| Participant | `timer_sec` | `transparent` |
|---|---|---|
| P01 | 30 | 1 |
| P02 | 60 | 0 |
| P03 | 90 | 1 |
| P04 | 30 | 0 |
| P05 | 60 | 1 |
| P06 | 90 | 0 |
| P07 | 90 | 0 |
| P08 | 60 | 1 |
| P09 | 60 | 0 |
| P10 | 30 | 0 |
| P11 | 90 | 1 |
| P12 | 30 | 1 |

### Local test URLs (copy-paste, server running on :8731)

```
Transparent:            http://localhost:8731/survey.html?transparent=1
Opaque:                 http://localhost:8731/survey.html?transparent=0
Fixed 30s timer:        http://localhost:8731/survey.html?timer_sec=30
Opaque + 30s:           http://localhost:8731/survey.html?transparent=0&timer_sec=30
QA / debug (shows diff): http://localhost:8731/survey.html?debug=1&timer_sec=90
Full production shape:  http://localhost:8731/survey.html?transparent=1&guid=TEST-123&return_url=https://example.com/return
```

---

## 4. Wiring the randomization in Qualtrics

You do **not** hand out static per-participant URLs. Instead Qualtrics assigns the
condition and builds the URL for each respondent on the fly, piping its own
`ResponseID` in as the `guid`.

1. **Randomize the condition.** Add an **Embedded Data** field named `transparent`
   at the top of the survey flow, then either:
   - use a **Randomizer** block that sets `transparent = 1` on one path and
     `transparent = 0` on the other (Evenly Present Elements = balanced), or
   - (Approach B) use a Randomizer with 6 paths that set both `transparent` and
     `timer_sec`.
2. **Place the task** on a survey page as a full-width **iframe** or a redirect,
   with the parameters piped from embedded data and the ResponseID as `guid`:

   ```
   https://YOUR-HOST/survey.html?transparent=${e://Field/transparent}&guid=${e://Field/ResponseID}&return_url=${e://Field/return_url}
   ```

   (For Approach B also append `&timer_sec=${e://Field/timer_sec}`.)
3. **Set `return_url`** to the survey's own continue/return URL (store it as another
   embedded data field, or hard-code your Qualtrics survey link). When the participant
   finishes, the task **auto-returns** them there with all behavioral data appended to
   the query string (no click required — see §5).
4. **Capture the returned data.** On the return page, declare matching embedded data
   fields so Qualtrics records the incoming URL parameters (see §5).

> Tip: keep `guid = ResponseID`. That single key is what lets you join the rich
> behavioral export to each Qualtrics response afterward.

---

## 5. Collecting the data back in Qualtrics

### How the hand-off works

When a participant finishes the 12th decision, the app builds one query string of
all results and **redirects the browser to `return_url` with that string appended**
(`return_url?guid=…&s1_dec=…&…&events_log=…`). Two safety features make this
reliable in the field:

- **Auto-return** fires on its own (default 6 s after completion, tunable with
  `return_delay`), so data still comes back if the participant walks away instead of
  clicking the button. A visible "Submitting your data…" banner + a manual **Return
  to survey** button back it up. Disabled automatically in `debug` mode for QA.
- **URL-length guard.** A full record with `events_log` is ~4.5 KB, comfortably
  under the ~8 KB that Qualtrics and web servers accept. As a safety net, if the
  assembled URL would ever exceed **7500 characters**, the app drops only
  `events_log` from the redirect (all ~58 summary fields still go through) and adds
  `events_log_dropped=1` so you can spot it. The full trace remains recoverable via
  **Copy export data**.

### Setting up capture (join-by-`guid`, the robust default)

The task sends data by URL, so `return_url` must be a **Qualtrics survey link**, and
Qualtrics must be told which parameters to record. Qualtrics auto-populates any
**Embedded Data** field whose name matches a URL query parameter.

1. Point `return_url` at a Qualtrics survey — either the main survey's continuation
   or a short dedicated "capture" survey.
2. In that survey's **Survey Flow**, add an **Embedded Data** element **at the very
   top** (above the first block) and list **every field name below, with no value**.
   Qualtrics fills each one from the matching URL parameter on entry.
3. Because you launched the task with `guid=${e://Field/ResponseID}` (§4), the
   returned row carries the originating response's ID — **join on `guid`** to attach
   the behavioral data to that participant's main survey response.

Full field list to paste into the Embedded Data element (**59 fields**):

```
guid, timer_sec, transparent, scenario_order,
s1_dec, s1_time, s1_correct, s1_difficulty,
s2_dec, s2_time, s2_correct, s2_difficulty,
s3_dec, s3_time, s3_correct, s3_difficulty,
s4_dec, s4_time, s4_correct, s4_difficulty,
s5_dec, s5_time, s5_correct, s5_difficulty,
s6_dec, s6_time, s6_correct, s6_difficulty,
s7_dec, s7_time, s7_correct, s7_difficulty,
s8_dec, s8_time, s8_correct, s8_difficulty,
s9_dec, s9_time, s9_correct, s9_difficulty,
s10_dec, s10_time, s10_correct, s10_difficulty,
s11_dec, s11_time, s11_correct, s11_difficulty,
s12_dec, s12_time, s12_correct, s12_difficulty,
n_correct, n_expired, panels_total,
s5_override, s9_override,
events_log, events_log_dropped
```

### What each field means

| Field(s) | Meaning |
|---|---|
| `guid` | Session ID = the Qualtrics ResponseID you passed in. **Join key.** |
| `timer_sec`, `transparent` | The condition this participant actually ran (timer covariate + transparency IV). |
| `scenario_order` | Comma-separated scenario ids in the order presented. |
| `sN_dec` | Decision on scenario `N`: `allow` / `secondary` / `deny` / `none`. |
| `sN_time` | Decision latency for scenario `N`, in ms. |
| `sN_correct` | `1` if the decision matched ground truth, else `0`. |
| `sN_difficulty` | Expert difficulty rating (`easy`/`medium`/`hard`) — analysis covariate. |
| `n_correct`, `n_expired`, `panels_total` | Session rollups (correct count, timer expiries, unique panels opened). |
| `s5_override`, `s9_override` | `1` if the participant correctly overrode the AI on the two AI-error trials. |
| `events_log` | JSON blob with the full per-panel timing trace. Parse in analysis (or with embedded-data JS) if you need more than the summary columns. |
| `events_log_dropped` | `1` only if the URL guard omitted `events_log` (see above); absent/`0` normally. |

> **Single-response alternative.** If you need the task data on the *same* Qualtrics
> row rather than a joined one, embed `survey.html` in an iframe inside a question and
> post the results to the parent with `window.postMessage`, then write them to
> embedded data with question JavaScript. That's more setup than the join-by-`guid`
> flow above and only worth it if a second linked record is a problem for you.

---

## 6. Quick reference

| I want to… | Do this |
|---|---|
| See it locally | `python3 -m http.server 8731`, open `http://localhost:8731/survey.html` |
| Show the AI explanation | `?transparent=1` (default) |
| Hide the AI explanation | `?transparent=0` |
| Randomized time pressure (recommended) | omit `timer_sec` |
| Fixed time pressure | `?timer_sec=NN` (5–600) |
| Join data to a survey response | `?guid=${e://Field/ResponseID}` |
| Send participant back to Qualtrics | `?return_url=<survey URL>` (auto-returns) |
| Return instantly on finish | `?return_delay=0` |
| Keep participant on results screen | `?auto_return=0` (or use `debug=1`) |
| QA the difficulty labels + export screen | `?debug=1` (never in production) |
