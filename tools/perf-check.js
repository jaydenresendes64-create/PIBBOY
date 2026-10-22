/**
 * How heavy the app is on a phone: the processor's work while it opens and
 * while it sits on each tab, measured in Chromium with its processor slowed
 * 4 times (a mid-range phone). Not part of the app; for checking a change.
 *
 *   python3 -m http.server 8765        (in the repo, in another terminal)
 *   node tools/perf-check.js [http://localhost:8765/index.html]
 *
 * Needs Playwright (NODE_PATH pointing at a global install is enough).
 * Prints, averaged over 3 opens: the main thread's busy time in the first
 * 4 s (and of it, style and layout), the longest task, the blocking time
 * (each task's time past 50 ms), then each tab's busy milliseconds per
 * second, sitting still. 2026-10-22: busy 1356 → 509 ms, style 523 → 64 ms,
 * idle on VITALS 232 → 5 ms/s (the walk's strip moved by a transform). The
 * MAP and ITEMS tabs draw with WebGL: headless Chromium does it on the
 * processor, so their numbers there are far above a phone's.
 */
'use strict';
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8765/index.html';
const CPU = 4;

async function open(browser){
  const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:3, serviceWorkers:'block' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('status_terminal_power_on', '0'); } catch (e) {}
    window.__long = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(e.duration))).observe({ type:'longtask', buffered:true }); } catch (e) {}
  });
  await ctx.route(/open-meteo|openfreemap|osrm/, r => r.abort());       // nothing from outside
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate:CPU });
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  return { ctx, page, metrics };
}

(async () => {
  const browser = await chromium.launch();
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const { ctx, page, metrics } = await open(browser);
    await page.goto(URL, { waitUntil:'commit' });
    await page.waitForTimeout(4000);
    const m = await metrics(), long = await page.evaluate(() => window.__long);
    runs.push({ busy:m.TaskDuration*1000, style:m.RecalcStyleDuration*1000, layout:m.LayoutDuration*1000,
      longest:Math.max(0, ...long), blocking:long.reduce((s, d) => s + Math.max(0, d - 50), 0) });
    await ctx.close();
  }
  const avg = k => Math.round(runs.reduce((s, r) => s + r[k], 0)/runs.length);
  console.log('Opening (CPU x' + CPU + ', first 4 s): busy ' + avg('busy') + ' ms (style ' + avg('style') + ', layout ' + avg('layout') +
    '), longest task ' + avg('longest') + ' ms, blocking ' + avg('blocking') + ' ms');

  const { ctx, page, metrics } = await open(browser);
  await page.goto(URL, { waitUntil:'load' });
  await page.waitForSelector('#tab-vitals .vital-row');
  await page.evaluate(() => { const ST = window.StatusTerminal; ST.setVital('sleep', 5); ST.logVitals(); ST.render.renderAll(); });   // the tabs open
  for (const tab of ['vitals', 'status', 'quests', 'items', 'map', 'log']) {
    await page.click('[data-tab="' + tab + '"]');
    await page.waitForTimeout(tab==='map' ? 6000 : 2500);
    const a = await metrics();
    await page.waitForTimeout(5000);
    const b = await metrics();
    console.log('  ' + tab.toUpperCase().padEnd(7) + ' sitting still: ' + Math.round((b.TaskDuration - a.TaskDuration)*200) + ' ms/s busy, ' +
      Math.round((b.RecalcStyleCount - a.RecalcStyleCount)/5) + ' style recalcs/s');
  }
  await ctx.close();
  await browser.close();
})();
