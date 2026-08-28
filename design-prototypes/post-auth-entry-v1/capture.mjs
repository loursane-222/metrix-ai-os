import { chromium } from '/Users/mac/Projects/metrix-ai-os/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root='/private/tmp/metrix-post-auth-entry-prototype';
const browser=await chromium.launch({headless:true});
const cases=[
  ['entry-loading-v1-1440x900.png',1440,900,'loading'],
  ['organization-setup-v1-1440x900.png',1440,900,'setup'],
  ['organization-setup-v1-390x844.png',390,844,'setup'],
];
for(const [name,width,height,state] of cases){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const url=pathToFileURL(path.join(root,'index.html')).href+`?state=${state}`;
  await page.goto(url,{waitUntil:'load'});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:path.join(root,name),fullPage:false});
  await page.close();
}
await browser.close();
