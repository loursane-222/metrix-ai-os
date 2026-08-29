import { chromium } from 'file:///Users/mac/Projects/metrix-ai-os/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';

const root = '/private/tmp/metrix-plus-excel-v1-prototype';
const url = pathToFileURL(`${root}/index.html`).href;
const captures = [
  ['plus', 1440, 900, 'plus-menu-v1-1440x900.png'],
  ['excel', 1440, 900, 'excel-upload-v1-1440x900.png'],
  ['error', 1440, 900, 'excel-upload-error-v1-1440x900.png'],
  ['plus', 390, 844, 'plus-menu-v1-390x844.png'],
  ['excel', 390, 844, 'excel-upload-v1-390x844.png'],
];

const browser = await chromium.launch({ headless: true });
for (const [state, width, height, filename] of captures) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${url}?state=${state}`);
  const metrics = await page.evaluate(() => {
    const rect = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right } : null; };
    return { state: document.querySelector('.app').dataset.state, viewport:[innerWidth,innerHeight], document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight], overflowX:document.documentElement.scrollWidth>innerWidth, composer:rect('.composer'), sheet:rect('.plus-sheet'), workspace:rect('.workspace'), upload:rect('.upload-panel'), actionHeights:[...document.querySelectorAll('.actions button')].map((e)=>e.getBoundingClientRect().height) };
  });
  console.log(filename, JSON.stringify(metrics));
  await page.screenshot({ path: `${root}/${filename}` });
  await page.close();
}
await browser.close();
