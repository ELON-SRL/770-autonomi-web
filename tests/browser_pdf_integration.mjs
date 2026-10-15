import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const buildPdf=async(lines,kind)=>{
 const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Courier);
 if(kind==="f24"){
  const fields=[["16/09/2025",60],["1040",124],["08",340],["2025",388],["209,28",453],["0",530]];
  for(const [text,x] of fields)page.drawText(text,{x,y:680,size:9,font});
  page.drawText("del contribuente 01184970315 - MEDICENTER RONCHI SRL",{x:30,y:760,size:8,font});
 }else{
  let y=760;
  for(const line of lines){page.drawText(line,{x:20,y,size:9,font});y-=23}
 }
 return Buffer.from(await pdf.save());
};
const ledger=await buildPdf([
 "[F92] MEDICENTER RONCHI SRL",
 "1 25/07/25 TEST ROSSI 1040 1.046,30 209,26 0,00 837,04 25/07/25 837,04 209,26 -DA VERSARE-"
],"ledger");
const cu=await buildPdf([
 "01184970315 Azienda F92 MODELLO CU BROGLIACCIO MOVIMENTI LAVORO AUTONOMO",
 "Percipiente: 601.00001 TEST ROSSI",
 "Protocollo invio: 123 Esito: Accolta Tipo invio: Ordinario",
 "| A | 1.046,30 | 0,00 | 0,00 | 1.046,30 | 209,26 |"
],"cu");
const f24=await buildPdf([],"f24");
const server=spawn("python3",["-m","http.server","8765","--bind","127.0.0.1"],{stdio:"ignore"});
try{
 await sleep(1200);
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",d=>d.accept());
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await page.locator("#taxpayer").fill("01184970315");
  await page.locator("#ledger").setInputFiles({name:"gestionale.pdf",mimeType:"application/pdf",buffer:ledger});
  await page.locator("#cu").setInputFiles({name:"cu.pdf",mimeType:"application/pdf",buffer:cu});
  await page.locator("#f24").setInputFiles({name:"f24.pdf",mimeType:"application/pdf",buffer:f24});
  await page.locator("#check").click();
  await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("Acquisite"),{timeout:30000});
  assert.match(await page.locator("#status").innerText(),/Acquisite 1 righe gestionali e 1 righe CU|Acquisite 1 righe gestionali/);
  await page.locator("#readf24").click();
  await page.waitForFunction(()=>document.querySelector("#f24status")?.textContent?.includes("1"),{timeout:30000});
  assert.match(await page.locator("#f24rows").innerText(),/209,28/);
  const august=page.locator("#f24rows tr").filter({hasText:"08/2025"});
  assert.equal(await august.count(),1,"August payment should appear once");
  await august.locator("select.period-picker").selectOption({index:1});
  await august.getByRole("button",{name:"Riconcilia",exact:true}).click();
  await page.locator("#makeSt").click();
  assert.equal(await page.locator("#stRows tr").count(),1,"Manual July/August match must produce one ST row");
  assert.match(await page.locator("#stRows").innerText(),/08\/2025/);
  assert.match(await page.locator("#stRows").innerText(),/209,28/);
  const payment=page.locator("#f24movements tr").first();
  await payment.getByRole("button",{name:"Modifica"}).click();
  const paymentEdit=page.locator("#f24movements tr").filter({has:page.locator("input")}).first();
  await paymentEdit.locator("input").nth(4).fill("210,28");
  await paymentEdit.getByRole("button",{name:"Conferma"}).click();
  assert.equal(await page.locator("#stRows tr").count(),0,"Editing F24 must invalidate previous ST draft");
  assert.match(await page.locator("#f24rows").innerText(),/210,28/,"F24 summary must recalculate");
  assert.equal(await page.locator("#stConfirm").isChecked(),false,"ST confirmation must reset after source change");
  await page.locator("#addLedger").click();
  assert.equal(await page.locator("#movementDialog").isVisible(),true,"Ledger modal must open");
  const triggerRect=await page.locator("#addLedger").boundingBox();
  const popupRect=await page.locator("#movementDialog").boundingBox();
  assert.ok(triggerRect&&popupRect,"Popup or trigger position missing");
  assert.ok(Math.abs(popupRect.x-triggerRect.x)<250,"Popup must open next to Add withholding button");
  assert.ok(popupRect.y>=0,"Popup must remain within viewport");

  await page.locator('#movementDialog input[name="name"]').fill("NUOVO PERCIPIENTE");
  await page.locator('#movementDialog input[name="period"]').fill("08/2025");
  await page.locator('#movementDialog input[name="amount"]').fill("100,00");
  await page.locator("#movementForm").getByRole("button",{name:"Conferma e aggiungi"}).click();
  assert.equal(await page.locator("#movementDialog").isVisible(),false,"Ledger modal must close");
  assert.match(await page.locator("#results").innerText(),/NUOVO PERCIPIENTE/);
  await page.locator("#addf24").click();
  assert.equal(await page.locator("#movementDialog").isVisible(),true,"F24 modal must open");
  await page.locator('#movementDialog input[name="date"]').fill("16/09/2025");
  await page.locator('#movementDialog input[name="month"]').fill("08");
  await page.locator('#movementDialog input[name="debit"]').fill("100,00");
  await page.locator("#movementForm").getByRole("button",{name:"Conferma e aggiungi"}).click();
  assert.equal(await page.locator("#movementDialog").isVisible(),false,"F24 modal must close");
  assert.match(await page.locator("#f24movements").innerText(),/100,00/);
  assert.deepEqual(errors,[]);
  console.log("PDF-to-browser integration passed: import, CU, F24 and ST draft");
 }finally{await browser.close()}
}finally{server.kill()}
