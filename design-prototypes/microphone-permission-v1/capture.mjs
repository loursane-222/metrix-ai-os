import { createRequire } from "node:module";
const require = createRequire("/Users/mac/Projects/metrix-ai-os/package.json");
const { chromium } = require("playwright");
const root = "/private/tmp/metrix-microphone-permission-v1-prototype";
const browser = await chromium.launch({ headless: true });
for (const [width,height,name] of [[1440,900,"microphone-permission-v1-1440x900.png"],[390,844,"microphone-permission-v1-390x844.png"]]) {
  const page = await browser.newPage({ viewport:{width,height}, deviceScaleFactor:1 });
  await page.goto(`file://${root}/index.html`);
  await page.screenshot({ path:`${root}/${name}` });
  const metrics = await page.evaluate(() => { const dialog=document.querySelector(".dialog").getBoundingClientRect(); const buttons=[...document.querySelectorAll(".actions button")].map(x=>{const r=x.getBoundingClientRect();return {text:x.textContent.trim(),width:r.width,height:r.height}}); return {innerWidth,documentWidth:document.documentElement.scrollWidth,dialog:{x:dialog.x,y:dialog.y,width:dialog.width,height:dialog.height},buttons}; });
  console.log(name,JSON.stringify(metrics));
  await page.close();
}
await browser.close();
