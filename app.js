"use strict";
import * as pdfjs from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const $=id=>document.getElementById(id);
const selectedIds=["ledger","cu","f24"];
for(const id of selectedIds){$(id).addEventListener("change",()=>{
 const names=selectedIds.filter(k=>$(k).files.length).map(k=>$(k).files[0].name);
 $("status").textContent=names.length+" documento/i selezionato/i. "+( $("ledger").files.length&&$("cu").files.length ? "Avvio automatico della prima riconciliazione…" : "Per la prima riconciliazione servono listato ritenute e brogliaccio CU.");
 if($("ledger").files.length&&$("cu").files.length)$("check").click();
});}
const money=n=>Number(n).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
const cents=s=>Math.round(Number(String(s).replace(/\./g,"").replace(",","."))*100);
const display=n=>money(n/100);
const normalize=s=>String(s).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
let original=[],overrides=new Map(),parseIssues=[];
function lineText(items){
 const groups=[];
 for(const item of items){
  if(!item.str?.trim())continue;
  const y=Math.round(item.transform[5]*2)/2;
  let group=groups.find(g=>Math.abs(g.y-y)<2);
  if(!group){group={y,parts:[]};groups.push(group)}
  group.parts.push({x:item.transform[4],str:item.str});
 }
 return groups.sort((a,b)=>b.y-a.y).map(g=>g.parts.sort((a,b)=>a.x-b.x).map(p=>p.str).join(" ").replace(/\s+/g," ").trim());
}
async function pdfLines(file,firstPageOnly=false){
 const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const lines=[];
 for(let i=1;i<=(firstPageOnly?1:doc.numPages);i++){
  const page=await doc.getPage(i);
  lines.push(...lineText((await page.getTextContent()).items));
 }
 return lines;
}
function parseLedger(lines){
 const out=[];
 // Documento, data, nome, tributo, totale fattura, ritenuta fattura,
 // previdenza, netto, data pagamento, importo pagato, ritenuta pagamento.
 const re=/^\s*(\S+)\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(\d{4})\s+([\d.,]+)\*?\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+#?(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)\s+([\d.,]+)/;
 for(const line of lines){
  const m=line.match(re);if(!m)continue;
  const amount=cents(m[11]);if(!Number.isFinite(amount))continue;
  out.push({name:normalize(m[3]),code:m[4],date:m[9],amount,document:m[1]});
 }
 return out;
}
function parseCu(lines){
 const out=[];let current=null;
 for(const line of lines){
  const person=line.match(/Percipiente:\s*[\d.]+\s+(.+)/i);
  if(person){current=normalize(person[1]);continue}
  if(!current)continue;
  const m=line.match(/\|\s*([A-Z0-9])\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|?/);
  if(m){out.push({name:current,causale:m[1],amount:cents(m[6])});current=null}
 }
 return out;
}
function aggregate(ledger,cu){
 const map=new Map();
 const add=(name,kind,amount)=>{
  const key=normalize(name);if(!map.has(key))map.set(key,{name:key,ledger:0,cu:0});
  map.get(key)[kind]+=amount;
 };
 ledger.forEach(r=>add(r.name,"ledger",r.amount));
 cu.forEach(r=>add(r.name,"cu",r.amount));
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"it"));
}
function effective(row){return {...row,ledger:overrides.get(row.name)??row.ledger}}
function render(){
 const rows=original.map(effective),tbody=$("results");tbody.replaceChildren();
 for(const r of rows){
  const tr=document.createElement("tr");
  const diff=r.ledger-r.cu;
  for(const value of [r.name,display(r.ledger),display(r.cu),display(diff)]){
   const td=document.createElement("td");td.textContent=value;tr.append(td);
  }
  tr.children[3].className=diff?"mismatch":"match";
  const td=document.createElement("td"),btn=document.createElement("button");
  btn.textContent="Rettifica";btn.addEventListener("click",()=>edit(r));td.append(btn);tr.append(td);tbody.append(tr);
 }
 const total=rows.reduce((s,r)=>s+r.ledger-r.cu,0);
 const nonzero=rows.filter(r=>r.ledger!==r.cu).length;
 $("summary").textContent=`Percipienti: ${rows.length} · Differenze: ${nonzero} · Scostamento gestionale - CU: ${display(total)} €`;
 $("review").disabled=!rows.length||nonzero>0;
 if(nonzero)$("review").checked=false;
 $("next").disabled=nonzero>0||!$("review").checked;
 $("reset").disabled=!overrides.size;$("export").disabled=!rows.length;
}
function edit(row){
 const answer=prompt("Ritenuta gestionale rettificata per "+row.name+" (€)",display(row.ledger));
 if(answer===null)return;
 const value=cents(answer);
 if(!Number.isFinite(value)||value<0){alert("Importo non valido");return}
 overrides.set(row.name,value);$("review").checked=false;render();
}
$("check").addEventListener("click",async()=>{
 const ledgerFile=$("ledger").files[0],cuFile=$("cu").files[0];
 if(!ledgerFile||!cuFile){$("status").textContent="Seleziona almeno il listato ritenute e il brogliaccio CU.";return}
 $("check").disabled=true;$("status").textContent="Lettura PDF in corso…";
 try{
  const [ledgerLines,cuLines]=await Promise.all([pdfLines(ledgerFile),pdfLines(cuFile,true)]);
  const ledger=parseLedger(ledgerLines),cu=parseCu(cuLines);
  console.info("770 import diagnostica (senza nominativi)",{righeGestionale:ledger.length,righeCU:cu.length,righeTestoGestionale:ledgerLines.length,righeTestoCU:cuLines.length});
  if(!ledger.length||!cu.length)throw new Error(`Formato PDF non riconosciuto (movimenti: ${ledger.length}; CU: ${cu.length}). Serve adattare il lettore al testo estratto; nessun dato è stato riconciliato.`);
  original=aggregate(ledger,cu);overrides.clear();$("review").checked=false;$("phase2").hidden=true;
  $("status").textContent=`Acquisite ${ledger.length} righe gestionali e ${cu.length} righe CU. Verifica i totali prima di confermare.`;
  render();
 }catch(err){$("status").textContent="Importazione non completata: "+err.message}
 finally{$("check").disabled=false}
});
$("review").addEventListener("change",render);
$("reset").addEventListener("click",()=>{overrides.clear();$("review").checked=false;render()});
$("next").addEventListener("click",()=>{$("phase2").hidden=false;$("phase2").scrollIntoView({behavior:"smooth"})});
$("export").addEventListener("click",()=>{
 const rows=original.map(effective);
 const csv=["Percipiente;Ritenuta gestionale;Ritenuta CU;Differenza;Rettificata",...rows.map(r=>[r.name,display(r.ledger),display(r.cu),display(r.ledger-r.cu),overrides.has(r.name)?"SI":"NO"].join(";"))].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="770-controllo-cu.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
