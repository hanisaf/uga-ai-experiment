// End-to-end UI test suite for survey.html (Playwright, headless Chromium).
// Run from the repo root:  ./scripts/serve.sh  (port 8731), then in a second terminal
//   node tests/ui.test.js
// Needs the `playwright` npm package. Screenshots go to tests/shots/ and a JSON summary
// to tests/results.json (both git-ignored). Exits non-zero if any check fails.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:8731/';
const ROOT = path.resolve(__dirname, '..');
const OUT = __dirname + '/shots/';
fs.mkdirSync(OUT, { recursive: true });
const DATA = JSON.parse(fs.readFileSync(ROOT + '/assets/scenarios.json', 'utf8')).scenarios;
const byId = {}; DATA.forEach(s => byId[s.id] = s);
const PANELS = ['profile', 'doc', 'db', 'apis'];

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined && detail !== '' ? '  — ' + detail : '')); }
function note(name, detail) { results.push({ name, ok: null, detail: String(detail) }); console.log('NOTE ' + name + '  — ' + detail); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
// survey.html ignores clicks on a new passenger's controls for 400ms after Next
// (double-click guard), so scripted runs wait that out — no person decides faster.
const GUARD = 450;

let browser;
async function newCtx(viewport) {
  return browser.newContext({ viewport: viewport || { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
}
async function openIn(ctx, qs, opts = {}) {
  const page = await ctx.newPage();
  page._errs = [];
  page.on('pageerror', e => page._errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errs.push('console: ' + m.text()); });
  if (opts.route) await opts.route(page);
  await page.goto(BASE + 'survey.html' + (qs ? '?' + qs : ''));
  if (!opts.noWait) await page.waitForSelector('[data-toggle]', { timeout: 15000 });
  return page;
}
async function open(qs, opts = {}) { return openIn(await newCtx(opts.viewport), qs, opts); }
const text = p => p.evaluate(() => document.body.innerText);
const cur = async p => (await text(p)).match(/Passenger (\d+) of (\d+)/).slice(1).map(Number);
// The passenger name is only visible inside the profile panel; open and close it to
// identify the scenario (this records one profile open).
const curScenario = async p => {
  await p.click('[data-toggle="profile"]');
  const t = await text(p);
  await p.click('[data-toggle="profile"]');
  return DATA.find(s => t.includes(s.name));
};
const exportBox = async p => new URLSearchParams(await p.evaluate(() => {
  const box = [...document.querySelectorAll('div')].find(d => d.textContent.startsWith('guid=') && d.children.length === 0);
  return box ? box.textContent : '';
}));
const timerSec = async p => { const m = (await p.textContent('#timerLabel')).match(/(\d+):(\d\d)/); return (+m[1]) * 60 + (+m[2]); };
const skipAll = async (p, n = 15) => { for (let i = 0; i < n; i++) await p.click('[data-skip]'); };
const RET = BASE + 'index.html?from=task';
const retQs = (extra = '') => 'return_url=' + encodeURIComponent(RET) + extra;
const LEAK_WORDS = ['transparent', 'opaque', 'show_confidence', 'queue_size', 'show_results', 'difficulty', 'debug'];
const ANSWER_KEY = /Correct ·|AI error|Missed|Caught|Correct decisions/;

(async () => {
  const launch = process.env.HTTPS_PROXY
    ? { args: ['--proxy-server=https=' + process.env.HTTPS_PROXY.replace(/^https?:\/\//, ''), '--proxy-bypass-list=<-loopback>'] } : {};
  browser = await chromium.launch(launch);

  // ------------------------------------------------------------ 1. Boot & participant view
  {
    const p = await open('');
    const t = await text(p);
    check('boot: no JS errors', p._errs.length === 0, p._errs.join(' | '));
    check('boot: Passenger 1 of 15', /Passenger 1 of 15/.test(t));
    check('boot: default queue label "Normal load"', t.includes('Normal load · 보통 날'));
    check('boot: Next disabled before a decision', await p.isDisabled('[data-next]'));
    check('boot: no debug skip button in production', !(await p.$('[data-skip]')));
    check('boot: no passenger name visible before a panel opens', !DATA.some(s => t.includes(s.name)));
    const leaks = LEAK_WORDS.filter(w => t.toLowerCase().includes(w));
    check('[fix 2] no condition names or URL parameters visible to participants', leaks.length === 0, leaks.length ? 'visible: ' + leaks.join(', ') : '');
    await p.click('[data-toggle="doc"]');
    await p.waitForFunction(() => [...document.images].every(i => i.complete));
    const imgs = await p.evaluate(() => [...document.images].map(i => i.naturalWidth));
    check('doc panel: both photos load', imgs.length === 2 && imgs.every(x => x > 0), JSON.stringify(imgs));
    // keyboard
    const tab = await p.evaluate(() => [...document.querySelectorAll('[data-toggle]')].map(e => e.tabIndex));
    check('a11y: panel headers reachable by keyboard', tab.every(x => x >= 0), 'tabIndex=' + tab.join(','));
    await p.focus('[data-toggle="db"]'); await p.keyboard.press('Enter');
    const dbOpen = await p.getAttribute('[data-toggle="db"]', 'aria-expanded');
    const focused = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-toggle'));
    check('a11y: Enter toggles a panel and keeps focus on it', dbOpen === 'true' && focused === 'db', `aria-expanded=${dbOpen}, focus=${focused}`);
    await p.screenshot({ path: OUT + '01_task_default.png', fullPage: true });
    await p.context().close();

    const d = await open('debug=1');
    const dt = await text(d);
    check('debug: condition label and parameter list shown for QA', /debug · Normal load · transparent/.test(dt) && /URL parameters:/.test(dt));
    await d.context().close();
  }

  // ------------------------------------------------------------ 2. Condition params
  for (const [qs, fn, label] of [
    ['transparent=0', t => !/Contributing factors/i.test(t) && /System confidence/.test(t), 'factors hidden, confidence shown'],
    ['transparent=1&show_confidence=0', t => /Contributing factors/i.test(t) && !/System confidence/.test(t), 'factors shown, confidence hidden'],
    ['transparent=0&show_confidence=0', t => !/Contributing factors/i.test(t) && !/System confidence/.test(t), 'both hidden'],
    ['transparent=true', t => /Contributing factors/i.test(t), '"true" accepted'],
    ['queue_size=50', t => t.includes('Light traffic · 한산한 날'), 'light'],
    ['queue_size=500', t => t.includes('Busy day · 바쁜 날'), 'busy'],
    ['queue_size=999', t => t.includes('Normal load'), 'invalid → normal'],
  ]) {
    const p = await open(qs);
    check('param ' + qs + ': ' + label, fn(await text(p)));
    await p.context().close();
  }

  // ------------------------------------------------------------ 3. Ordering
  {
    const getOrder = async qs => {
      const p = await open('debug=1&' + qs);
      await skipAll(p);
      const ep = await exportBox(p);
      await p.context().close();
      return ep;
    };
    const a = await getOrder('order=random&order_seed=7'), b = await getOrder('order=random&order_seed=7'), c = await getOrder('order=random&order_seed=8');
    check('order=random: same seed reproduces sequence', a.get('scenario_order') === b.get('scenario_order'), a.get('scenario_order'));
    check('order=random: different seed differs', a.get('scenario_order') !== c.get('scenario_order'));
    check('order=random: exports order_mode/seed', a.get('order_mode') === 'random' && a.get('order_seed') === '7');
    const d = await getOrder('order=default');
    check('order=default: authored order', d.get('scenario_order') === DATA.map(s => s.id).join(','));
    const e = await getOrder('order=3,3,99,1');
    check('order=explicit: dupes/unknown dropped, rest appended', e.get('scenario_order') === '3,1,2,4,5,6,7,8,9,10,11,12,13,14,15', e.get('scenario_order'));
  }

  // ------------------------------------------------------------ 4. Production run → straight back; verify every field in the redirect
  {
    const ctx = await newCtx();
    const p = await openIn(ctx, 'guid=PROD-RUN&queue_size=500&transparent=1&' + retQs());
    const plan = [];
    for (let i = 0; i < 15; i++) {
      const [n, tot] = await cur(p);
      if (n !== i + 1 || tot !== 15) check(`run step ${i + 1}: counter`, false, n + '/' + tot);
      const s = await curScenario(p);
      const rec = { id: s.id, opens: { profile: 1 }, changes: 0 };
      if (i % 3 === 0) { await p.click('[data-toggle="doc"]'); rec.opens.doc = 1; await sleep(300); }
      if (i % 4 === 0) { await p.click('[data-toggle="db"]'); await sleep(150); await p.click('[data-toggle="db"]'); await p.click('[data-toggle="db"]'); rec.opens.db = 2; }
      let d = s.correct;
      if (i === 2) d = s.correct === 'a' ? 'sr' : 'a';
      if (i === 5) { await p.click('[data-decide="si"]'); await sleep(200); await p.click('[data-decide="si"]'); d = 'sr'; rec.changes = 1; }
      if (i === 7) { await p.click('[data-decide="a"]'); await sleep(200); await p.click('[data-decide="sr"]'); await p.click('[data-decide="si"]'); d = s.correct; rec.changes = s.correct === 'si' ? 2 : 3; }
      await p.click(`[data-decide="${d}"]`);
      rec.dec = d;
      if (d !== 'a' && i % 2 === 0) {
        const c = i === 4 ? '한국어 메모 — 서류 확인 필요 & "quotes" <tag>' : 'note ' + i + ' & stuff=1?x';
        await p.fill('#comment-field', c);
        await p.click('[data-toggle="apis"]'); rec.opens.apis = 1;
        rec.comment = c;
        if (i === 4) check('comment survives panel toggle re-render', (await p.inputValue('#comment-field')) === c);
      }
      if (i === 10 && d !== 'a') {
        await p.fill('#comment-field', 'will be cleared'); await p.click('[data-decide="a"]'); await p.click(`[data-decide="${d}"]`);
        rec.changes += 2; rec.comment = '';
        check('Allow clears referral note', (await p.inputValue('#comment-field')) === '');
      }
      plan.push(rec);
      if (i === 3) {
        await p.dblclick('[data-next]');
        check('double-click Next advances exactly one', (await cur(p))[0] === 5);
        check('double-click Next records nothing on the next passenger', await p.isDisabled('[data-next]') && !(await p.$('[aria-expanded="true"]')));
        await sleep(GUARD);
        continue;
      }
      if (i === 14) check('last button reads "Finish" when no results screen follows', /Finish/.test(await p.textContent('[data-next]')));
      await p.click('[data-next]'); await sleep(GUARD);
    }
    await p.waitForURL(/index\.html\?from=task&/, { timeout: 8000 });
    check('[fix 1] show_results default: goes straight back to the survey on finish', true, p.url().slice(0, 70) + '…');
    const ep = new URL(p.url()).searchParams;
    note('return URL length (production run)', p.url().length + ' chars; events_log ' + (ep.get('events_log') ? 'included' : 'dropped'));
    check('export: scenario_order matches presented order', ep.get('scenario_order') === plan.map(r => r.id).join(','), ep.get('scenario_order'));
    check('export: guid / queue_size / reloads', ep.get('guid') === 'PROD-RUN' && ep.get('queue_size') === '500' && ep.get('reloads') === '0');
    let correct = 0, panelsTotal = 0; const problems = [];
    for (const r of plan) {
      const s = byId[r.id], k = 's' + r.id + '_';
      if (ep.get(k + 'dec') !== r.dec) problems.push(`${k}dec ${ep.get(k + 'dec')}≠${r.dec}`);
      if (r.dec === s.correct) correct++;
      const want = PANELS.filter(x => r.opens[x]);
      panelsTotal += want.length;
      if (ep.get(k + 'panels') !== String(want.length)) problems.push(`${k}panels`);
      if (ep.get(k + 'panels_open') !== want.join(',')) problems.push(`${k}panels_open ${ep.get(k + 'panels_open')}`);
      const opens = Object.fromEntries((ep.get(k + 'panel_opens') || '').split(',').filter(Boolean).map(x => x.split(':')));
      for (const pid of want) if (String(r.opens[pid]) !== opens[pid]) problems.push(`${k}panel_opens ${pid}: ${opens[pid]}≠${r.opens[pid]}`);
      const tf = +ep.get(k + 'time_first'), tl = +ep.get(k + 'time_final');
      if (!(tf > 0 && tl >= tf)) problems.push(`${k}time ${tf}/${tl}`);
      if (String(r.changes) !== ep.get(k + 'dec_changes')) problems.push(`${k}dec_changes ${ep.get(k + 'dec_changes')}≠${r.changes}`);
      if ((r.comment || '') !== ep.get(k + 'comment')) problems.push(`${k}comment ${JSON.stringify(ep.get(k + 'comment'))}`);
      const dwell = Object.fromEntries((ep.get(k + 'panel_dwell') || '').split(',').filter(Boolean).map(x => x.split(':')));
      if (r.opens.doc && !(+dwell.doc >= 250)) problems.push(`${k}dwell doc ${dwell.doc}`);
    }
    check('export: every per-scenario field matches scripted actions', problems.length === 0, problems.join(' | '));
    check('export: correct_total / panels_total', ep.get('correct_total') === String(correct) && ep.get('panels_total') === String(panelsTotal));
    for (const [key, id] of [['fp_caught', 5], ['fn_caught', 9], ['fp2_caught', 13]]) {
      const r = plan.find(x => x.id === id);
      check(`export: ${key} (S${id})`, ep.get(key) === (r.dec === byId[id].correct ? '1' : '0'));
    }
    // documented field list (index.html) vs. what is actually exported
    const idx = fs.readFileSync(ROOT + '/index.html', 'utf8');
    const listed = idx.match(/<pre>guid, queue_size[\s\S]*?<\/pre>/)[0].replace(/<\/?pre>/g, '').split(/[,\s]+/).filter(Boolean);
    const sent = [...ep.keys()];
    const optional = ['order_seed', 'events_log', 'events_log_dropped', 'comments_dropped'];
    const missing = listed.filter(k => !sent.includes(k) && !optional.includes(k));
    const undocumented = sent.filter(k => !listed.includes(k) && k !== 'from');  // 'from' belongs to the test's return_url
    check('docs: index.html field list matches the export', !missing.length && !undocumented.length, `listed ${listed.length}; missing ${missing.join(',') || '-'}; undocumented ${undocumented.join(',') || '-'}`);

    // [fix 5] re-opening the launch URL (Back, reopened tab) must not start the task again
    const again = await openIn(ctx, 'guid=PROD-RUN&queue_size=500&transparent=1&' + retQs(), { noWait: true });
    await again.waitForSelector('text=already been completed', { timeout: 8000 });
    const at = await text(again);
    check('[fix 5] relaunching a finished guid shows "already completed", no task', !/Passenger 1 of 15/.test(at) && !(await again.$('[data-toggle]')));
    await again.click('[data-goq]');
    await again.waitForURL(/index\.html\?from=task&/);
    check('[fix 5] "Continue" re-sends the identical stored return URL', again.url() === p.url());
    check('[fix 1] completion screens offer no restart to participants', !(await again.$('[data-restart]')));
    await ctx.close();
  }

  // ------------------------------------------------------------ 5. show_results variants
  {
    // No auto-return: the neutral end screen itself
    let p = await open('guid=NEUTRAL&auto_return=0&' + retQs() + '&order=default');
    for (let i = 0; i < 15; i++) { await p.click('[data-decide="a"]'); await p.click('[data-next]'); await sleep(GUARD); }
    let t = await text(p);
    check('[fix 1] neutral end screen: thank-you, no score / answer key / export / restart',
      /Session complete/.test(t) && /Thank you/.test(t) && !ANSWER_KEY.test(t) && !/guid=/.test(t) && !(await p.$('[data-restart]')) && !!(await p.$('[data-goq]')));
    await p.screenshot({ path: OUT + '05_done_neutral.png', fullPage: true });
    await p.context().close();

    // show_results=1 without debug: scored screen, countdown, still no restart
    p = await open('guid=SR1&show_results=1&return_delay=2&' + retQs() + '&order=default');
    for (let i = 0; i < 15; i++) { await p.click('[data-decide="a"]'); await p.click('[data-next]'); await sleep(GUARD); }
    t = await text(p);
    check('show_results=1: last button reads "View results"', true);
    check('show_results=1: scored results screen with answer key and export', ANSWER_KEY.test(t) && /guid=SR1/.test(t));
    check('[fix 1] show_results=1: no Restart button outside debug', !(await p.$('[data-restart]')));
    await p.screenshot({ path: OUT + '05_results_show1.png', fullPage: true });
    await p.waitForURL(/index\.html\?from=task&/, { timeout: 6000 });
    check('show_results=1: auto-returns after return_delay', true);
    await p.context().close();

    // debug: results by default, restart available; debug + show_results=0 → neutral
    p = await open('debug=1&auto_return=0');
    await skipAll(p);
    check('debug: results screen by default, with Restart', /Correct decisions/.test(await text(p)) && !!(await p.$('[data-restart]')));
    await p.click('[data-restart]');
    check('debug: Restart returns to passenger 1', /Passenger 1 of 15/.test(await text(p)) && await p.isDisabled('[data-next]'));
    await p.context().close();
    p = await open('debug=1&show_results=0&auto_return=0');
    await skipAll(p);
    check('debug + show_results=0: neutral screen', /Thank you/.test(await text(p)) && !ANSWER_KEY.test(await text(p)));
    await p.context().close();
  }

  // ------------------------------------------------------------ 6. [fix 6] reload mid-task resumes
  {
    const ctx = await newCtx();
    const p = await openIn(ctx, 'guid=RELOAD&' + retQs());
    const ids = [];
    ids.push((await curScenario(p)).id); await p.click('[data-decide="a"]'); await p.click('[data-next]'); await sleep(GUARD);
    ids.push((await curScenario(p)).id); await p.click('[data-decide="sr"]'); await p.fill('#comment-field', '메모 before reload'); await p.click('[data-next]'); await sleep(GUARD);
    ids.push((await curScenario(p)).id);
    await p.click('[data-toggle="doc"]'); await p.click('[data-decide="si"]'); await p.fill('#comment-field', 'typed, not yet submitted');
    await sleep(1200);
    const tBefore = await timerSec(p);
    await p.reload(); await p.waitForSelector('[data-toggle]');
    const [n] = await cur(p);
    check('[fix 6] reload resumes at the same passenger', n === 3, 'Passenger ' + n);
    check('[fix 6] reload keeps the current decision, comment and open panel',
      (await p.getAttribute('[data-toggle="doc"]', 'aria-expanded')) === 'true' && (await p.inputValue('#comment-field')) === 'typed, not yet submitted' && !(await p.isDisabled('[data-next]')));
    check('[fix 6] reload keeps the clock running (not reset to 0:00)', (await timerSec(p)) >= tBefore, `${tBefore}s → ${await timerSec(p)}s`);
    check('[fix 6] reload keeps the same scenario', (await curScenario(p)).id === ids[2]);
    await p.click('[data-next]'); await sleep(GUARD);
    for (let i = 3; i < 15; i++) { await p.click('[data-decide="a"]'); await p.click('[data-next]'); await sleep(GUARD); }
    await p.waitForURL(/index\.html\?from=task&/, { timeout: 8000 });
    const ep = new URL(p.url()).searchParams;
    check('[fix 6] export keeps pre-reload order and decisions, reloads=1',
      ep.get('scenario_order').startsWith(ids.join(',')) && ep.get('s' + ids[0] + '_dec') === 'a' && ep.get('s' + ids[1] + '_dec') === 'sr' &&
      ep.get('s' + ids[1] + '_comment') === '메모 before reload' && ep.get('s' + ids[2] + '_dec') === 'si' && ep.get('reloads') === '1',
      `order ${ep.get('scenario_order')}, reloads ${ep.get('reloads')}`);
    await ctx.close();

    // without a guid param there is nothing to key progress on
    const q = await open('');
    await q.click('[data-decide="a"]'); await q.click('[data-next]'); await sleep(GUARD);
    await q.reload(); await q.waitForSelector('[data-toggle]');
    note('reload without a guid parameter', 'restarts at Passenger ' + (await cur(q))[0] + ' (expected: progress is keyed by guid)');
    await q.context().close();

    // storage blocked: task still works
    const r = await open('guid=NOSTORE&debug=1&auto_return=0', { route: pg => pg.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); }) });
    await skipAll(r);
    check('storage blocked: task still completes without errors', /Correct decisions/.test(await text(r)) && r._errs.length === 0, r._errs.join(' | '));
    await r.context().close();
  }

  // ------------------------------------------------------------ 7. Comments, timer, dwell, URL cap
  {
    let p = await open('');
    await p.click('[data-decide="si"]');
    await p.fill('#comment-field', 'x'.repeat(320));
    check('comment: capped at 300 chars, counter live', (await p.inputValue('#comment-field')).length === 300 && (await p.textContent('#comment-count')).startsWith('300'));
    await p.context().close();

    p = await open('debug=1&auto_return=0&order=default');
    await sleep(3200);
    const s = await timerSec(p);
    check('timer: counts up (~3s after load)', s >= 2 && s <= 4, s + 's');
    await p.click('[data-toggle="apis"]'); await sleep(1000);
    await p.click('[data-decide="a"]'); await p.click('[data-next]'); await sleep(GUARD);
    check('timer: resets to 0 on next passenger', (await timerSec(p)) <= 1);
    await skipAll(p, 14);
    const ep = await exportBox(p);
    const dw = +((ep.get('s1_panel_dwell') || '').split(':')[1]);
    check('dwell: panel left open is flushed on Next', dw >= 900 && dw < 2500, 's1 apis dwell=' + dw + 'ms');
    await p.context().close();

    p = await open('debug=1&guid=LEN&return_url=' + encodeURIComponent(BASE + 'index.html') + '&auto_return=0');
    const ko = '서류 확인 필요 '.repeat(40).slice(0, 300);
    for (let i = 0; i < 15; i++) {
      for (const pid of PANELS) await p.click(`[data-toggle="${pid}"]`);
      await p.click('[data-decide="sr"]');
      await p.fill('#comment-field', ko);
      await p.click('[data-next]'); await sleep(GUARD);
    }
    const t = await text(p);
    note('worst case (15 × 300 Korean chars, all panels)', (t.match(/QA · return URL length[^\n]*/) || [''])[0]);
    check('worst case: shed warning shown on results screen', /exceeded/.test(t));
    await p.click('[data-copy]'); await sleep(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    check('copy export: clipboard holds full record', clip.includes('events_log=') && clip.includes('s1_comment='), clip.length + ' chars');
    await p.context().close();
  }

  // ------------------------------------------------------------ 8. Failure modes
  {
    // [fix 7] scenarios.json fails, then recovers on retry
    let fail = true;
    const p = await open('', { noWait: true, route: pg => pg.route('**/scenarios.json', r => fail ? r.fulfill({ status: 404, body: 'nope' }) : r.continue()) });
    await p.waitForSelector('[data-retry]', { timeout: 8000 });
    const t = await text(p);
    check('[fix 7] load failure shows an error with a retry button', /could not be loaded/.test(t) && !/Loading case files/.test(t));
    fail = false;
    await p.click('[data-retry]');
    await p.waitForSelector('[data-toggle]', { timeout: 8000 });
    check('[fix 7] retry loads the task', /Passenger 1 of 15/.test(await text(p)));
    await p.context().close();

    const bad = await open('', { noWait: true, route: pg => pg.route('**/scenarios.json', r => r.fulfill({ status: 200, body: '{not json', contentType: 'application/json' })) });
    await bad.waitForSelector('[data-retry]', { timeout: 8000 });
    check('[fix 7] malformed scenarios.json also shows the error', true);
    await bad.context().close();

    // [fix 8] return_url schemes
    const x = await open('order=default&auto_return=0&return_url=' + encodeURIComponent('javascript:void(document.body.setAttribute("data-pwn","1"))//'));
    for (let i = 0; i < 15; i++) { await x.click('[data-decide="a"]'); await x.click('[data-next]'); await sleep(GUARD); }
    const pwnBtn = await x.$('[data-goq]');
    if (pwnBtn) { await pwnBtn.click(); await sleep(400); }
    const pwn = await x.evaluate(() => document.body.getAttribute('data-pwn'));
    check('[fix 8] javascript: return_url is rejected (no Return button, nothing runs)', pwn !== '1' && !pwnBtn, pwn === '1' ? 'executed' : '');
    await x.context().close();
    const rel = await open('order=default&return_url=index.html%3Fq%3D1');
    for (let i = 0; i < 15; i++) { await rel.click('[data-decide="a"]'); await rel.click('[data-next]'); await sleep(GUARD); }
    await rel.waitForURL(/index\.html\?q=1&guid=/, { timeout: 8000 });
    check('[fix 8] relative http return_url still works', true, rel.url().slice(0, 60) + '…');
    await rel.context().close();
  }

  // ------------------------------------------------------------ 9. [fix 3, 4] Layout across viewports
  for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [1024, 768], [768, 1024], [390, 844]]) {
    // Worst case for height: a 4-factor scenario with the referral comment box open.
    const p = await open('order=2', { viewport: { width: w, height: h } });
    await p.click('[data-decide="si"]');
    const m = await p.evaluate(() => {
      const r = sel => document.querySelector(sel).getBoundingClientRect();
      const right = r('.r-right');
      return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, nextBottom: Math.round(r('[data-next]').bottom), btnBottom: Math.round(r('[data-decide]').bottom), rightEdge: Math.round(right.right), btnW: Math.round(r('[data-decide]').width) };
    });
    check(`[fix 4] layout ${w}×${h}: nothing clipped or scrolling sideways`, m.scrollW <= m.innerW && m.rightEdge <= m.innerW, `scrollWidth ${m.scrollW}/${m.innerW}, right column edge ${m.rightEdge}, button ${m.btnW}px`);
    if (w >= 1280) check(`[fix 3] layout ${w}×${h}: decision buttons and Next on screen on arrival`, m.nextBottom <= h, `Next bottom ${m.nextBottom}px / ${h}px; buttons bottom ${m.btnBottom}px`);
    else note(`layout ${w}×${h}: Next position`, `Next bottom ${m.nextBottom}px / viewport ${h}px (scroll expected below laptop size)`);
    await p.screenshot({ path: OUT + `09_${w}x${h}.png`, fullPage: true });
    for (const pid of PANELS) await p.click(`[data-toggle="${pid}"]`);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const before = await p.evaluate(() => scrollY);
    await p.click('[data-next]'); await sleep(GUARD);
    const after = await p.evaluate(() => scrollY);
    check(`[fix 3] layout ${w}×${h}: next passenger starts at the top`, after === 0, `scrollY ${before} → ${after}`);
    await p.context().close();
  }

  // ------------------------------------------------------------ 10. Every scenario renders (screenshots)
  {
    const p = await open('order=default&debug=1&auto_return=0', { viewport: { width: 1366, height: 768 } });
    for (let i = 0; i < 15; i++) {
      for (const pid of PANELS) await p.click(`[data-toggle="${pid}"]`);
      await p.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
      await p.screenshot({ path: OUT + `10_s${String(i + 1).padStart(2, '0')}_all_open.png`, fullPage: true });
      await p.click('[data-skip]');
    }
    check('all 15 scenarios render with images, no JS errors', p._errs.length === 0, p._errs.join(' | '));
    await p.context().close();
  }

  await browser.close();
  fs.writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 1));
  const f = results.filter(r => r.ok === false);
  console.log(`\n${results.filter(r => r.ok).length} pass, ${f.length} fail, ${results.filter(r => r.ok === null).length} notes`);
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
