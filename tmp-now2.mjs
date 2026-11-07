import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages().find(x => x.url().startsWith('https://localhost'));
p.setDefaultTimeout(25000);
await p.screenshot({ path: 'F:/AI/Hermes/cache/scratch/r32-now.png' });
console.log(await p.evaluate(() => location.pathname + location.search + ' y=' + Math.round(window.scrollY)));
await b.close();
