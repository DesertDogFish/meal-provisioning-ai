import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages().find(x => x.url().startsWith('https://localhost'));
p.setDefaultTimeout(25000);
await p.goto('https://localhost/trips/2', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
const st = await p.$('[data-testid="stage-bar-checks"]');
if (st) { await st.click(); await p.waitForTimeout(2500); }
await p.evaluate(() => { document.scrollingElement.scrollTop = 300; });
await p.waitForTimeout(900);
const r = await p.evaluate(() => {
  const el = document.querySelector('[data-testid="checks-search-bar"]');
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderRadius, shadow: cs.boxShadow };
});
console.log(JSON.stringify(r));
await p.screenshot({ path: 'F:/AI/Hermes/cache/scratch/r33.png', clip: { x: 0, y: 118, width: 411, height: 110 } });
await b.close();
