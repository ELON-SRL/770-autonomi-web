import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const server=spawn("python3",["-m","http.server","8765","--bind","127.0.0.1"],{stdio:"ignore"});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 await sleep(1200);
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const failures=[];
  page.on("pageerror",error=>failures.push(error.message));
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await page.locator("#taxpayer").fill("01184970315");
  assert.equal(await page.locator("#taxpayer").inputValue(),"01184970315");
  for(const id of ["ledger","cu","f24","check","results","ledgerMovements","ledgerPeriods","f24movements","f24rows","makeSt","stRows"]){
   assert.equal(await page.locator("#"+id).count(),1,"Missing UI control: "+id);
  }
  await page.locator("#check").click();
  await page.waitForTimeout(1000);
  assert.match(await page.locator("#status").innerText(),/Seleziona almeno il listato/i);
  assert.deepEqual(failures,[],"Browser JavaScript errors");
  console.log("Browser smoke test passed: controls, validation and no uncaught errors");
 } finally {await browser.close()}
} finally {server.kill()}
