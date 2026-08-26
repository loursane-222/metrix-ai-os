import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire('/Users/mac/Projects/metrix-ai-os/package.json');
const { chromium } = require('playwright');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL('/private/tmp/metrix-daily-executive-summary-prototype/index.html').href);
const metrics = await page.evaluate(() => {
  const box = selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
  };
  return {
    viewport:{width:innerWidth,height:innerHeight},
    document:{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},
    monitor:box('.monitor'), dashboard:box('.dashboard'), marketStack:box('.market-stack'),
    marketCards:[...document.querySelectorAll('.market')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}),
    agenda:box('.agenda'), briefing:box('.briefing'), composer:box('.composer')
  };
});
console.log(JSON.stringify(metrics, null, 2));
await page.screenshot({ path: '/private/tmp/metrix-daily-executive-summary-prototype/daily-executive-summary-v2-1440x900.png' });
await browser.close();
