import {chromium} from "playwright";
import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
const root="tests",names=["LISTARITENUTERONCHI.pdf","listamodelloCU.pdf","f24ronchi.pdf"];
for(const name of names)assert.ok(existsSync(resolve(root,name)),"Missing real test PDF: "+name);
const server=spawn("python3",["-m","http.server","8767","--bind","127.0.0.1"],{stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await sleep(1200);
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  page.setDefaultTimeout(90000);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",d=>d.accept());
  await page.goto("http://127.0.0.1:8767/",{waitUntil:"domcontentloaded"});
  await page.locator("#taxpayer").fill("01184970315");
  await page.locator("#year").selectOption("2025");
  await page.locator("#ledger").setInputFiles(resolve(root,names[0]));
  await page.locator("#cu").setInputFiles(resolve(root,names[1]));
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Acquisite"),{timeout:90000});
  const status=await page.locator("#status").innerText();
  assert.match(status,/380 righe gestionali/,"Real ledger count mismatch: "+status);
  assert.match(status,/51 righe CU/,"Real CU count mismatch: "+status);
  assert.match(status,/149\.508,67/,"Real ledger amount mismatch: "+status);
  assert.match(status,/175\.204,41/,"Real CU amount mismatch: "+status);
  await page.locator("#f24").setInputFiles(resolve(root,names[2]));
  await page.locator("#readf24").click();
  await page.waitForFunction(()=>document.querySelector("#f24status")?.textContent?.includes("PDF AdE:"),{timeout:90000});
  const f24status=await page.locator("#f24status").innerText();
  assert.match(f24status,/72 righe totali/,"Real F24 row count mismatch: "+f24status);
  await page.locator("#makeSt").click();
  const stRows=await page.locator("#stRows tr").count();
  assert.ok(stRows>0,"No ST draft generated");
  assert.deepEqual(errors,[],"Browser JavaScript errors");
  console.log(JSON.stringify({result:"PASS",ledgerRows:380,cuRows:51,f24Rows:72,stRows,status,f24status}));
 }finally{await browser.close()}
}finally{server.kill()}
