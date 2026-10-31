import { chromium } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless:true,executablePath:existsSync(chrome) ? chrome : undefined });
const page = await browser.newPage(); const results=[]; mkdirSync('verification',{ recursive:true });
try {
  await page.goto('http://127.0.0.1:4177/');
  await page.evaluate(data => localStorage.setItem('folio-workspace-v1',JSON.stringify({ revision:1,data })),JSON.parse(readFileSync('test-results/backup.json','utf8')));
  await page.reload();
  await page.getByRole('button',{ name:'New invoice',exact:true }).click();
  await page.getByLabel('Bill to').selectOption({ label:'Changed Client Name' });
  await page.getByLabel('Description 1').fill('Technical support & development');
  await page.getByLabel('Rate (EUR)').fill('650');
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({ width,height:1000 });
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top:0,behavior:'instant' }); });
    const result = await page.evaluate(() => ({ width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,sections:[...document.querySelectorAll('.editor-form .form-section')].map(e=>({ top:getComputedStyle(e).paddingBlockStart,bottom:getComputedStyle(e).paddingBlockEnd,margin:getComputedStyle(e).marginBlockEnd,background:getComputedStyle(e).backgroundColor })) }));
    if (result.scrollWidth > result.width) {
      console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth).map(e => ({ tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right })).slice(-20)));
      await page.screenshot({ path:`verification/overflow-${width}.png`,fullPage:true });
      throw new Error(`Editor overflow at ${width}: ${result.scrollWidth}`);
    }
    results.push(result);
    if ([390,1440].includes(width)) await page.screenshot({ path:`verification/editor-${width}.png`,fullPage:true });
  }
  writeFileSync('verification/layout.json',JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
} finally { await browser.close(); }
