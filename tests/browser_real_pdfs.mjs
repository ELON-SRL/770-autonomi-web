import {chromium} from "playwright";
import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
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
  const recipient=page.locator("#results tr").filter({hasText:"BARDUCCI ENZO"}).first();
  await recipient.getByRole("button",{name:"Dettaglio fatture"}).click();
  assert.equal(await page.locator("#recipientInvoices").isVisible(),true,"Invoice details not visible");
  const invoiceRows=page.locator("#recipientInvoiceRows tr");
  assert.ok(await invoiceRows.count()>1,"Real recipient invoices missing");
  assert.match(await page.locator("#recipientInvoiceTotals").innerText(),/Ritenute attive:/);
  assert.equal(await page.locator("#recipientInvoiceRows tr").first().locator("td").count(),6,"Expected five invoice fields and one action");
  const downloadPromise=page.waitForEvent("download");
  await page.locator("#exportRecipientInvoices").click();
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/770-fatture-BARDUCCI-ENZO-2025/);
  const dir=await mkdtemp(join(tmpdir(),"recipient-csv-"));
  const file=join(dir,"report.csv");
  await download.saveAs(file);
  const csv=readFileSync(file,"utf8");
  assert.match(csv,/Numero fattura.*Data fattura.*Totale fattura.*Importo pagato.*Ritenuta operata/);
  assert.match(csv,/BARDUCCI ENZO/);
  assert.match(csv,/TOTALE/);
  const invoiceDetails=await page.locator("#recipientInvoiceRows tr").first().locator("td").allInnerTexts();
  for(const idx of [0,1,2,3]){
   assert.notEqual(invoiceDetails[idx],"—","Real invoice field "+idx+" missing");
   assert.ok(invoiceDetails[idx].trim(),"Real invoice field "+idx+" empty");
  }
  const csvFields=csv.split(/\r?\n/).slice(3,-1).join("\n");
  for(const value of invoiceDetails.slice(0,4))assert.ok(csvFields.includes(value),"CSV missing displayed invoice value: "+value);

  assert.equal(csv.split(/\r?\n/).length-4,await invoiceRows.count(),"CSV invoice row count must match UI");

  // Change an actual invoice withholding, then verify both detail and CSV recalculate.
  const firstInvoice=page.locator("#recipientInvoiceRows tr").first();
  const previous=await firstInvoice.locator("td").nth(4).innerText();
  await firstInvoice.getByRole("button",{name:"Vai al movimento"}).click();
  const editing=page.locator("#ledgerMovements tr").filter({has:page.locator("input")}).first();
  const amountInput=editing.locator("input").nth(3);
  const originalAmount=await amountInput.inputValue();
  const adjusted=(Number(originalAmount.replace(/[.]/g,"").replace(",","."))+1).toFixed(2).replace(".",",");
  await amountInput.fill(adjusted);
  await editing.getByRole("button",{name:"Conferma"}).click();
  await page.locator("#results tr").filter({hasText:"BARDUCCI ENZO"}).first().getByRole("button",{name:"Dettaglio fatture"}).click();
  assert.notEqual(await page.locator("#recipientInvoiceRows tr").first().locator("td").nth(4).innerText(),previous,"Invoice detail must update after edit");
  const revisedDownload=page.waitForEvent("download");
  await page.locator("#exportRecipientInvoices").click();
  const revised=await revisedDownload;
  const revisedPath=join(dir,"revised.csv");
  await revised.saveAs(revisedPath);
  assert.ok(readFileSync(revisedPath,"utf8").includes(adjusted),"CSV must contain edited invoice withholding");
  // Restore original value so the remaining real-PDF tests use unchanged amounts.
  await page.locator("#recipientInvoiceRows tr").first().getByRole("button",{name:"Vai al movimento"}).click();
  const restored=page.locator("#ledgerMovements tr").filter({has:page.locator("input")}).first();
  await restored.locator("input").nth(3).fill(originalAmount);
  await restored.getByRole("button",{name:"Conferma"}).click();
  await page.locator("#f24").setInputFiles(resolve(root,names[2]));
  await page.locator("#readf24").click();
  await page.waitForFunction(()=>document.querySelector("#f24status")?.textContent?.includes("PDF AdE:"),{timeout:90000});
  const f24status=await page.locator("#f24status").innerText();
  assert.match(f24status,/72 righe totali/,"Real F24 row count mismatch: "+f24status);
  await page.locator("#f24review").check();
  assert.equal(await page.locator("#stSection").isVisible(),true,"ST section should open after F24 review");
  await page.locator("#makeSt").click();
  const stRows=await page.locator("#stRows tr").count();
  assert.ok(stRows>0,"No ST draft generated");
  // Full practice roundtrip: save from actual PDFs, reload browser, reopen JSON.
  const savedPromise=page.waitForEvent("download");
  await page.locator("#savePractice").click();
  const saved=await savedPromise;
  const savedPath=join(dir,"practice.json");
  await saved.saveAs(savedPath);
  const snapshot=JSON.parse(readFileSync(savedPath,"utf8"));
  assert.equal(snapshot.taxpayer,"01184970315");
  assert.equal(snapshot.ledgerState.length,380);
  assert.equal(snapshot.f24Rows.length,72);
  // Independent, frozen month-by-month reference for tax code 1040 / reference year 2025.
  // Do not group by payment date: the reference year belongs to the F24 row.
  const reference={"01":1538000,"02":1647500,"03":1727500,"04":1734571,
   "05":1887000,"06":1248738,"07":1465335,"08":1243495,
   "09":933873,"10":1274732,"11":1823078,"12":1603043};
  const selected=snapshot.f24Rows.filter(x=>String(x.year)==="2025"&&String(x.code)==="1040"&&!x.excluded);
  assert.equal(selected.length,40,"2025 F24 1040 movement count mismatch");
  const grouped=Object.fromEntries(Object.keys(reference).map(m=>[m,0]));
  for(const row of selected){
   assert.ok(row.month in reference,"Invalid 2025 reference month: "+row.month);
   grouped[row.month]+=row.debit;
  }
  for(const [month,expected] of Object.entries(reference))
   assert.equal(grouped[month],expected,"Real PDF 1040/2025 incorrect attribution in month "+month);
  assert.equal(selected.reduce((sum,row)=>sum+row.debit,0),18126865,"Real PDF 1040/2025 total incorrect");
  const others=snapshot.f24Rows.filter(x=>String(x.year)!=="2025");
  assert.equal(selected.some(x=>String(x.year)!=="2025"),false,"Foreign year mixed into 2025");
  console.log("F24 1040 reference year 2025 verified against frozen monthly amounts; other years:",others.length);

  assert.equal(snapshot.stDraft.length,stRows);
  assert.ok(snapshot.ledgerState.some(x=>x.document&&x.invoiceDate&&Number.isInteger(x.invoiceGross)&&Number.isInteger(x.paymentAmount)));
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#loadPractice").setInputFiles(savedPath);
  await page.waitForFunction(()=>document.querySelector("#practiceStatus")?.textContent?.includes("Pratica ripristinata"),{timeout:30000});
  assert.equal(await page.locator("#ledgerMovements tr").count(),380,"Ledger not restored");
  assert.equal(await page.locator("#f24movements tr").count(),72,"F24 not restored");
  assert.equal(await page.locator("#stRows tr").count(),stRows,"ST not restored");
  assert.match(await page.locator("#summary").innerText(),/25.695,74/,"CU totals not restored");
  const again=page.locator("#results tr").filter({hasText:"BARDUCCI ENZO"}).first();
  await again.getByRole("button",{name:"Dettaglio fatture"}).click();
  assert.notEqual(await page.locator("#recipientInvoiceRows tr").first().locator("td").nth(0).innerText(),"—","Invoice details lost after restore");
  assert.deepEqual(errors,[],"Browser JavaScript errors");
  console.log(JSON.stringify({result:"PASS",ledgerRows:380,cuRows:51,f24Rows:72,stRows,status,f24status}));
 }finally{await browser.close()}
}finally{server.kill()}
