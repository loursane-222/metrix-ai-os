import { chromium } from '/Users/mac/Projects/metrix-ai-os/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
const root = '/private/tmp/metrix-settings-prototype';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
await page.goto(pathToFileURL(`${root}/index.html`).href);
await page.screenshot({path:`${root}/settings-v1-1440x900.png`});
const metrics = await page.evaluate(() => {
  const box = s => { const r=document.querySelector(s).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
  const intersections=[]; const els=[...document.querySelectorAll('.settings-shell *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height});
  for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){if(els[i].contains(els[j])||els[j].contains(els[i]))continue; const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect(); if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top){const ai=getComputedStyle(els[i]),bi=getComputedStyle(els[j]); if(ai.position!=='absolute'&&bi.position!=='absolute'&&els[i].tagName!=='svg'&&els[j].tagName!=='svg') intersections.push([els[i].className,els[j].className]);}}
  return {viewport:{width:innerWidth,height:innerHeight},document:{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},shell:box('.settings-shell'),nav:box('.rail'),content:box('.content'),composer:box('.composer'),shellComposerGap:box('.composer').y-box('.settings-shell').bottom,intersections:intersections.slice(0,20)};
});
console.log(JSON.stringify(metrics,null,2));
await browser.close();
