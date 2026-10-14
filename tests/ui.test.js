// End-to-end UI test suite for survey.html (Playwright, headless Chromium).
// Run from the repo root:  ./scripts/serve.sh  (port 8731), then  node tests/ui.test.js
// Needs the `playwright` npm package. Screenshots go to tests/shots/ (git-ignored).
// FAIL lines on a fresh checkout are known review findings, not test breakage.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8731/';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = __dirname + '/shots/';
fs.mkdirSync(OUT, { recursive: true });
const DATA = JSON.parse(fs.readFileSync(ROOT + '/assets/scenarios.json', 'utf8')).scenarios;
const byId = {}; DATA.forEach(s => byId[s.id] = s);

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + detail : '')); }
function note(name, detail) { results.push({ name, ok: null, detail: String(detail) }); console.log('NOTE ' + name + '  — ' + detail); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
async function open(qs, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page._errs = [];
  page.on('pageerror', e => page._errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page._errs.push('console: ' + m.text()); });
  if (opts.route) await opts.route(page);
  await page.goto(BASE + 'survey.html' + (qs ? '?' + qs : ''));
  if (!opts.noWait) await page.waitForSelector('[data-toggle]', { timeout: 15000 });
  return page;
}
const cur = p => p.evaluate(() => document.body.innerText.match(/Passenger (\d+) of (\d+)/).slice(1).map(Number));
const curName = async p => {  // identify the scenario by its AI factors text (name is hidden until profile opens)
  await p.click('[data-toggle="profile"]');
  const t = await p.evaluate(() => document.body.innerText);
  await p.click('[data-toggle="profile"]');
  return DATA.find(s => t.includes(s.name));
};
const exportParams = async p => new URLSearchParams(await p.evaluate(() => {
  const box = [...document.querySelectorAll('div')].find(d => d.textContent.startsWith('guid=') && d.children.length === 0);
  return box ? box.textContent : '';
}));
const timerSec = async p => { const t = await p.textContent('#timerLabel'); const m = t.match(/(\d+):(\d\d)/); return (+m[1]) * 60 + (+m[2]); };

(async () => {
  browser = await chromium.launch(process.env.HTTPS_PROXY ? { args: ['--proxy-server=https=' + process.env.HTTPS_PROXY.replace(/^https?:\/\//, ''), '--proxy-bypass-list=<-loopback>'] } : {});

  // ---------------------------------------------------------------- 1. Boot & defaults
  {
    const p = await open('');
    const txt = await p.evaluate(() => document.body.innerText);
    check('boot: no JS errors', p._errs.length === 0, p._errs.join(' | '));
    check('boot: Passenger 1 of 15', /Passenger 1 of 15/.test(txt));
    check('boot: default queue label "Normal load"', txt.includes('Normal load · 보통 날'));
    check('boot: Next disabled before a decision', await p.isDisabled('[data-next]'));
    check('boot: no debug skip button in production', !(await p.$('[data-skip]')));
    check('boot: difficulty hidden in production', !/difficulty/.test(txt));
    check('boot: no passenger name visible before a panel opens', !DATA.some(s => txt.includes(s.name)));
    // Condition leak: does the participant-facing page name the manipulation?
    const leaks = ['transparent', 'opaque', 'show_confidence', 'queue_size', 'debug'].filter(w => txt.includes(w));
    check('PARTICIPANT LEAK: page does not name conditions/URL params', leaks.length === 0, 'visible words: ' + leaks.join(', '));
    // images
    await p.click('[data-toggle="doc"]');
    await p.waitForFunction(() => [...document.images].every(i => i.complete));
    const imgs = await p.evaluate(() => [...document.images].map(i => [i.naturalWidth, i.getBoundingClientRect().width]));
    check('doc panel: both photos load', imgs.length === 2 && imgs.every(x => x[0] > 0), JSON.stringify(imgs));
    note('doc panel: photo intrinsic vs rendered width', imgs.map(x => x[0] + 'px served → ' + Math.round(x[1]) + 'px shown').join(', ') + ' (each ~0.45 MB; 14 MB total)');
    // keyboard accessibility
    const focusables = await p.evaluate(() => [...document.querySelectorAll('[data-toggle]')].map(e => e.tabIndex));
    check('a11y: panel headers reachable by keyboard', focusables.every(t => t >= 0), 'tabIndex=' + focusables.join(','));
    await p.screenshot({ path: OUT + '01_task_default.png', fullPage: true });
    await p.context().close();
  }

  // ---------------------------------------------------------------- 2. Condition params
  {
    const cases = [
      ['transparent=0', t => !t.includes('CONTRIBUTING FACTORS') && !/Contributing factors/i.test(t) && /System confidence/.test(t), 'factors hidden, confidence shown'],
      ['transparent=1&show_confidence=0', t => /Contributing factors/i.test(t) && !/System confidence/.test(t) && !t.includes('신뢰도'), 'factors shown, confidence hidden'],
      ['transparent=0&show_confidence=0', t => !/Contributing factors/i.test(t) && !/System confidence/.test(t), 'both hidden'],
      ['transparent=true', t => /Contributing factors/i.test(t), '"true" accepted'],
      ['transparent=TRUE', t => /Contributing factors/i.test(t), '"TRUE" (caps) treated as on?'],
      ['transparent=yes', t => /Contributing factors/i.test(t), '"yes" treated as on?'],
      ['queue_size=50', t => t.includes('Light traffic · 한산한 날'), 'light'],
      ['queue_size=500', t => t.includes('Busy day · 바쁜 날'), 'busy'],
      ['queue_size=999', t => t.includes('Normal load'), 'invalid → normal'],
      ['queue_size=', t => t.includes('Normal load'), 'empty → normal'],
    ];
    for (const [qs, fn, label] of cases) {
      const p = await open(qs);
      const t = await p.evaluate(() => document.body.innerText);
      check('param ' + qs + ': ' + label, fn(t));
      await p.context().close();
    }
  }

  // ---------------------------------------------------------------- 3. Ordering
  {
    const getOrder = async qs => {
      const p = await open('debug=1&auto_return=0&' + qs);
      for (let i = 0; i < 15; i++) await p.click('[data-skip]');
      const ep = await exportParams(p);
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
    const f = await getOrder('order=' + encodeURIComponent('3, 1'));
    check('order=explicit with spaces', f.get('scenario_order').startsWith('3,1,'), f.get('scenario_order'));
  }

  // ---------------------------------------------------------------- 4. Full scripted run, verify every exported field
  {
    const RET = BASE + 'index.html?from=task';
    const p = await open('guid=TEST-RUN&queue_size=500&transparent=1&return_url=' + encodeURIComponent(RET) + '&return_delay=3');
    const plan = [];      // what we did, per scenario id
    const pill = [];
    for (let i = 0; i < 15; i++) {
      const [n, tot] = await cur(p);
      check(`run step ${i + 1}: counter shows ${i + 1}/15`, n === i + 1 && tot === 15, n + '/' + tot);
      // identify scenario via profile panel (counts as a profile open: 2 opens)
      const s = await curName(p);  // also records one profile open
      const rec = { id: s.id, opens: { profile: 1 } };
      // Variation by step
      if (i % 3 === 0) { await p.click('[data-toggle="doc"]'); rec.opens.doc = 1; await sleep(300); }
      if (i % 4 === 0) { await p.click('[data-toggle="db"]'); await sleep(200); await p.click('[data-toggle="db"]'); await p.click('[data-toggle="db"]'); rec.opens.db = 2; }
      // decide: use the correct answer except a few deliberate misses
      let d = s.correct;
      if (i === 2) d = s.correct === 'a' ? 'sr' : 'a';
      if (i === 5) { await p.click('[data-decide="si"]'); await sleep(250); await p.click('[data-decide="si"]'); d = 'sr'; rec.changes = 1; }   // reselect same = no change
      if (i === 7) { await p.click('[data-decide="a"]'); await sleep(250); await p.click('[data-decide="sr"]'); await sleep(150); await p.click('[data-decide="si"]'); d = s.correct; rec.changes = (s.correct === 'si') ? 2 : 3; }
      await p.click(`[data-decide="${d}"]`);
      rec.dec = d;
      if (d !== 'a' && i % 2 === 0) {
        const c = i === 4 ? '한국어 메모 — 서류 확인 필요 & "quotes" <tag>' : 'note ' + i + ' & stuff=1?x';
        await p.fill('#comment-field', c);
        // panel toggle after typing must not lose the comment
        await p.click('[data-toggle="apis"]'); rec.opens.apis = 1;
        rec.comment = c;
        const v = await p.inputValue('#comment-field');
        if (i === 4) check('comment survives panel toggle re-render', v === c, v);
      }
      if (i === 10) { // si/sr then allow clears comment
        if (d !== 'a') { await p.fill('#comment-field', 'will be cleared'); await p.click('[data-decide="a"]'); await p.click(`[data-decide="${d}"]`); rec.changes = (rec.changes || 0) + 2; rec.comment = ''; const v = await p.inputValue('#comment-field'); check('Allow clears referral note', v === '', JSON.stringify(v)); }
      }
      if (i === 12) { // timer keeps running after decision; display matches export
        await sleep(2100);
        const shown = await timerSec(p);
        rec.waitShown = shown;
      }
      pill.push(await timerSec(p));
      plan.push(rec);
      // double-click Next shouldn't skip a passenger
      if (i === 3) { await p.dblclick('[data-next]'); const [n2] = await cur(p); check('double-click Next advances exactly one', n2 === i + 2, 'now at ' + n2); continue; }
      await p.click('[data-next]');
    }
    await p.waitForSelector('text=Session complete');
    await p.screenshot({ path: OUT + '04_results.png', fullPage: true });
    const ep = await exportParams(p);
    const order = ep.get('scenario_order').split(',').map(Number);
    check('export: scenario_order matches presented order', JSON.stringify(order) === JSON.stringify(plan.map(r => r.id)), ep.get('scenario_order'));
    check('export: guid passthrough', ep.get('guid') === 'TEST-RUN');
    check('export: queue_size integer', ep.get('queue_size') === '500');
    let correct = 0, panelsTotal = 0, problems = [];
    for (const r of plan) {
      const s = byId[r.id], k = 's' + r.id + '_';
      if (ep.get(k + 'dec') !== r.dec) problems.push(`${k}dec ${ep.get(k + 'dec')}≠${r.dec}`);
      if (r.dec === s.correct) correct++;
      const want = ['profile', 'doc', 'db', 'apis'].filter(x => r.opens[x]);
      panelsTotal += want.length;
      if (ep.get(k + 'panels') !== String(want.length)) problems.push(`${k}panels ${ep.get(k + 'panels')}≠${want.length}`);
      if (ep.get(k + 'panels_open') !== want.join(',')) problems.push(`${k}panels_open ${ep.get(k + 'panels_open')}≠${want}`);
      const opens = Object.fromEntries((ep.get(k + 'panel_opens') || '').split(',').filter(Boolean).map(x => x.split(':')));
      const wantOpens = r.opens;
      for (const pid of want) if (String(wantOpens[pid]) !== opens[pid]) problems.push(`${k}panel_opens ${pid}: ${opens[pid]}≠${wantOpens[pid]}`);
      const tf = +ep.get(k + 'time_first'), tl = +ep.get(k + 'time_final');
      if (!(tf > 0 && tl >= tf)) problems.push(`${k}time_first/final ${tf}/${tl}`);
      if (String(r.changes || 0) !== ep.get(k + 'dec_changes')) problems.push(`${k}dec_changes ${ep.get(k + 'dec_changes')}≠${r.changes || 0}`);
      const cm = ep.get(k + 'comment');
      if ((r.comment || '') !== cm) problems.push(`${k}comment ${JSON.stringify(cm)}≠${JSON.stringify(r.comment || '')}`);
      const dwell = Object.fromEntries((ep.get(k + 'panel_dwell') || '').split(',').filter(Boolean).map(x => x.split(':').map((v, j) => j ? +v : v)));
      if (r.opens.doc && !(dwell.doc >= 250)) problems.push(`${k}dwell doc ${dwell.doc} (<250ms although open ≥300ms)`);
    }
    check('export: every per-scenario field matches scripted actions', problems.length === 0, problems.join(' | '));
    check('export: correct_total', ep.get('correct_total') === String(correct), ep.get('correct_total') + ' vs ' + correct);
    check('export: panels_total', ep.get('panels_total') === String(panelsTotal), ep.get('panels_total') + ' vs ' + panelsTotal);
    for (const [key, id] of [['fp_caught', 5], ['fn_caught', 9], ['fp2_caught', 13]]) {
      const r = plan.find(x => x.id === id);
      check(`export: ${key} (S${id})`, ep.get(key) === (r.dec === byId[id].correct ? '1' : '0'));
    }
    // all 165 documented fields?
    const idx = fs.readFileSync(ROOT + '/index.html', 'utf8');
    const keys = [...ep.keys()];
    const s12 = plan.find(r => r.waitShown != null);
    if (s12) { const tf = +ep.get('s' + s12.id + '_time_final') / 1000; note('timer: display after decide+2.1s vs exported final decision time', `screen ${s12.waitShown}s, export decision at ${tf.toFixed(1)}s (timer correctly kept running)`); }
    // results screen shows correctness and AI-error trials to participant
    const rt = await p.evaluate(() => document.body.innerText);
    check('PARTICIPANT LEAK: results screen hides answer key / AI-error labels', !/Correct ·|AI error|Missed|Caught/.test(rt), 'shows "Correct · <answer>", Caught/Missed badges, "AI error(s) missed" tile');
    check('PARTICIPANT LEAK: results screen hides raw export & restart', !(await p.$('[data-restart]')), 'Restart session button + full export box visible to participants');
    check('results: no JS errors', p._errs.length === 0, p._errs.join(' | '));
    // auto-return
    await p.waitForURL(/index\.html\?from=task&guid=/, { timeout: 8000 });
    const u = new URL(p.url());
    check('auto-return: redirects to return_url with & separator and data', u.searchParams.get('from') === 'task' && u.searchParams.get('guid') === 'TEST-RUN' && u.searchParams.get('s1_dec'), p.url().slice(0, 120) + '…');
    note('auto-return: return URL length', p.url().length + ' chars; events_log ' + (u.searchParams.get('events_log') ? 'included' : 'dropped'));
    // Back button after return
    await p.goBack();
    await p.waitForTimeout(1500);
    const bt = await p.evaluate(() => document.body.innerText);
    check('back button after return does not start a fresh task under the same guid', !/Passenger 1 of 15/.test(bt), /Passenger 1 of 15/.test(bt) ? 'Back → brand-new session with guid=TEST-RUN; finishing again would send a 2nd conflicting record' : bt.slice(0, 80));
    await p.context().close();
  }

  // ---------------------------------------------------------------- 5. URL-length tiers with max Korean comments
  {
    const p = await open('debug=1&guid=LEN&return_url=' + encodeURIComponent(BASE + 'index.html') + '&auto_return=0');
    const ko = '서류 확인 필요 '.repeat(40).slice(0, 300);
    for (let i = 0; i < 15; i++) {
      for (const pid of ['profile', 'doc', 'db', 'apis']) await p.click(`[data-toggle="${pid}"]`);
      await p.click('[data-decide="sr"]');
      await p.fill('#comment-field', ko);
      await p.click('[data-next]');
    }
    const qa = await p.evaluate(() => (document.body.innerText.match(/QA · return URL length[^\n]*/) || [''])[0]);
    note('worst case (15 × 300 Korean chars, all panels)', qa);
    const t = await p.evaluate(() => document.body.innerText);
    check('worst case: shed warning shown on results screen', /exceeded/.test(t));
    // copy export
    await p.click('[data-copy]');
    await sleep(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    check('copy export: clipboard holds full record (with events_log)', clip.includes('events_log=') && clip.includes('s1_comment='), clip.length + ' chars');
    // restart
    await p.click('[data-restart]');
    const rt = await p.evaluate(() => document.body.innerText);
    check('restart: back to passenger 1 with no decision', /Passenger 1 of 15/.test(rt) && await p.isDisabled('[data-next]'));
    note('restart: the participant can redo the whole task after seeing the answer key; same guid kept', 'Restart is shown in production');
    await p.context().close();
  }

  // ---------------------------------------------------------------- 6. Typing a 301st char
  {
    const p = await open('');
    await p.click('[data-decide="si"]');
    await p.fill('#comment-field', 'x'.repeat(320));
    const v = await p.inputValue('#comment-field');
    check('comment: capped at 300 chars', v.length === 300, v.length);
    check('comment: counter updates live', (await p.textContent('#comment-count')).startsWith('300'));
    // emoji counts as 2 UTF-16 units
    await p.fill('#comment-field', '😀'.repeat(150));
    note('comment: maxlength counts UTF-16 units', 'emoji ×150 → field holds ' + (await p.inputValue('#comment-field')).length + ' units; harmless');
    await p.context().close();
  }

  // ---------------------------------------------------------------- 7. Timer sanity & panel dwell flush
  {
    const p = await open('debug=1&auto_return=0&order=default');
    await sleep(3200);
    const s = await timerSec(p);
    check('timer: counts up (~3s after load)', s >= 2 && s <= 4, s + 's');
    await p.click('[data-toggle="apis"]'); await sleep(1000);
    await p.click('[data-decide="a"]'); await p.click('[data-next]');
    check('timer: resets to 0 on next passenger', (await timerSec(p)) <= 1);
    for (let i = 1; i < 15; i++) await p.click('[data-skip]');
    const ep = await exportParams(p);
    const dw = +((ep.get('s1_panel_dwell') || '').split(':')[1]);
    check('dwell: panel left open is flushed on Next', dw >= 900 && dw < 2000, 's1 apis dwell=' + dw + 'ms');
    check('debug skip: unanswered → recorded as allow', ep.get('s2_dec') === 'a');
    await p.context().close();
  }

  // ---------------------------------------------------------------- 8. Failure modes
  {
    const p = await open('', { noWait: true, route: pg => pg.route('**/scenarios.json', r => r.fulfill({ status: 404, body: 'nope' })) });
    await sleep(2000);
    const t = await p.evaluate(() => document.body.innerText);
    check('scenarios.json failure shows an error to the participant', !/Loading case files/.test(t), 'stuck on "Loading case files…" forever (error only in console)');
    await p.context().close();

    // reload mid-task
    const q = await open('guid=RELOAD');
    await q.click('[data-decide="a"]'); await q.click('[data-next]'); await q.click('[data-decide="a"]'); await q.click('[data-next]');
    await q.reload(); await q.waitForSelector('[data-toggle]');
    const [n] = await cur(q);
    check('reload mid-task resumes progress', n === 3, 'after 2 decisions + reload → Passenger ' + n + ' of 15 (progress lost, new order drawn)');
    await q.context().close();

    // return_url scheme
    const x = await open('auto_return=0&debug=1&return_url=' + encodeURIComponent('javascript:void(document.body.setAttribute("data-pwn","1"))//'));
    for (let i = 0; i < 15; i++) await x.click('[data-skip]');
    await x.click('[data-goq]'); await sleep(500);
    const pwn = await x.evaluate(() => document.body.getAttribute('data-pwn'));
    check('return_url: non-http(s) schemes rejected', pwn !== '1', pwn === '1' ? 'javascript: return_url executed on "Return to survey"' : '');
    await x.context().close();
  }

  // ---------------------------------------------------------------- 9. Layout across viewports
  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 800], [1024, 768], [768, 1024], [390, 844]]) {
    const p = await open('', { viewport: { width: w, height: h } });
    const fold = await p.evaluate(() => Math.round(document.querySelector('[data-next]').getBoundingClientRect().bottom));
    check(`layout ${w}×${h}: Next button above the fold on arrival`, fold <= h, `Next bottom at ${fold}px (viewport ${h}px)`);
    for (const pid of ['profile', 'doc', 'db', 'apis']) await p.click(`[data-toggle="${pid}"]`);
    await p.click('[data-decide="sr"]');
    const m = await p.evaluate(() => {
      const nb = document.querySelector('[data-next]').getBoundingClientRect();
      const btns = [...document.querySelectorAll('[data-decide]')].map(b => b.getBoundingClientRect());
      const over = [...document.querySelectorAll('[data-decide] span')].some(s => s.scrollWidth > s.parentElement.clientWidth + 1);
      return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, nextTop: Math.round(nb.top + scrollY), docH: document.documentElement.scrollHeight, btnW: Math.round(btns[0].width), btnOverflow: over };
    });
    const hOverflow = m.scrollW > m.innerW;
    check(`layout ${w}×${h}: no horizontal scroll`, !hOverflow, `scrollWidth ${m.scrollW} vs ${m.innerW}; decision btn ${m.btnW}px wide`);
    await p.screenshot({ path: OUT + `09_${w}x${h}.png`, fullPage: true });
    // scroll position after Next
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const before = await p.evaluate(() => scrollY);
    await p.click('[data-next]');
    const after = await p.evaluate(() => scrollY);
    if (before > 0) check(`layout ${w}×${h}: next passenger starts scrolled to top`, after === 0, `scrollY ${before} → ${after}`);
    await p.context().close();
  }

  // ---------------------------------------------------------------- 10. Visible copy for every scenario (screenshots, overflow)
  {
    const p = await open('order=default&debug=1&auto_return=0', { viewport: { width: 1366, height: 768 } });
    const longest = [];
    for (let i = 0; i < 15; i++) {
      for (const pid of ['profile', 'doc', 'db', 'apis']) await p.click(`[data-toggle="${pid}"]`);
      await p.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
      const h = await p.evaluate(() => document.documentElement.scrollHeight);
      longest.push(h);
      await p.screenshot({ path: OUT + `10_s${String(i + 1).padStart(2, '0')}_all_open.png`, fullPage: true });
      await p.click('[data-skip]');
    }
    note('page height with all 4 panels open, per scenario (1366×768)', longest.join(', ') + ' px');
    await p.context().close();
  }

  await browser.close();
  fs.writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 1));
  const f = results.filter(r => r.ok === false);
  console.log(`\n${results.filter(r => r.ok).length} pass, ${f.length} fail, ${results.filter(r => r.ok === null).length} notes`);
})().catch(e => { console.error(e); process.exit(1); });
