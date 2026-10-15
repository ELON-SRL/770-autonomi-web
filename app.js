import {packPractice,unpackPractice,practiceFilename} from "./practice_storage.js";
import {recipientInvoiceReport} from "./recipient_report.js";
import {buildCurrentCuRows,uniqueExportName} from "./export_current.js";
import {auditCuExport,auditF24Export,auditStExport,csvLine} from "./export_audit.js";
"use strict";
import {link,unlink,syncLinks} from "./manual_reconciliation.js?v=20261014-year";
import {parseCuAll,reconcileNames,normalizeRecipient} from "./cu_reader.js";
import {cloneF24,usableF24,validateF24Change,parseEuros} from "./movement_edits.js";
import {newLedgerState,activeLedger,ledgerSummary,validateLedger,inLedgerYear} from "./ledger_tree.js?v=20261015-invoice-fields";
import {paymentGroupSummary} from "./f24_groups.js";
import {buildStDraft,validateStRow} from "./st_draft.js?v=20261014-st2";
import {taxId,identify,identifyDetailed,verify} from "./identita.js?v=20261014-cf";
import {ravvedimentoGroups} from "./ravvedimenti.js";
import {parseF24Pages,reconcile,euro as f24Euro,moneyCents as f24Cents} from "./f24_ade.js";
import * as pdfjs from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const $=id=>document.getElementById(id);
const selectedIds=["ledger","cu","f24"];
for(const id of selectedIds){$(id).addEventListener("change",()=>{
 const names=selectedIds.filter(k=>$(k).files.length).map(k=>$(k).files[0].name);
 $("status").textContent=names.length+" documento/i selezionato/i. "+( $("ledger").files.length&&$("cu").files.length ? "Avvio automatico della prima riconciliazione…" : "Per la prima riconciliazione servono listato ritenute e brogliaccio CU.");
 if(id==="f24"){$("f24status").textContent="Nuovo listato selezionato. Premi Leggi listato F24 per sostituire il precedente.";return}
 if($("ledger").files.length&&$("cu").files.length)$("check").click();
});}
const money=n=>Number(n).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
const cents=s=>Math.round(Number(String(s).replace(/\./g,"").replace(",","."))*100);
const display=n=>money(n/100);
const normalize=s=>String(s).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
let original=[],overrides=new Map(),parseIssues=[],ledgerRows=[],f24Rows=[],f24Manual=[],interestOverrides=new Map(),stDraft=[],editingCu=null,editingF24=null,ledgerState=[],editingLedger=null;
function practiceSnapshot(){
 return packPractice({
  taxpayer:taxId($("taxpayer").value),year:$("year").value,
  original,ledgerState,f24Rows,f24Manual,stDraft,
  overrides:[...overrides.entries()],interestOverrides:[...interestOverrides.entries()],
  exportRevision,review:$("review").checked,f24review:$("f24review").checked,
  stConfirm:$("stConfirm").checked,phase2:!$("phase2").hidden
 });
}
$("savePractice").addEventListener("click",()=>{
 if(!ledgerState.length&&!original.length){$("practiceStatus").textContent="Nessuna lavorazione da salvare.";return}
 try{
  const data=practiceSnapshot();
  unpackPractice(data);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=practiceFilename(data);a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("practiceStatus").textContent="Pratica salvata: "+data.savedAt+". Conserva il file per riprendere il lavoro su qualsiasi computer.";
 }catch(error){$("practiceStatus").textContent="Salvataggio non riuscito: "+error.message}
});
$("loadPractice").addEventListener("change",async()=>{
 const file=$("loadPractice").files[0];if(!file)return;
 try{
  const data=unpackPractice(JSON.parse(await file.text()));
  if((ledgerState.length||f24Rows.length||stDraft.length)&&
     !confirm("Aprire la pratica sostituendo la lavorazione attualmente in memoria? Prima puoi salvarla."))return;
  original=structuredClone(data.original);
  ledgerState=structuredClone(data.ledgerState);
  f24Rows=structuredClone(data.f24Rows);f24Manual=structuredClone(data.f24Manual);
  stDraft=structuredClone(data.stDraft);
  overrides=new Map(data.overrides);interestOverrides=new Map(data.interestOverrides);
  $("taxpayer").value=data.taxpayer;$("year").value=data.year;
  exportRevision=Number.isSafeInteger(data.exportRevision)?data.exportRevision:0;
  ledgerRows=activeLedger(ledgerState,data.year);
  syncLinks(ledgerState,usableF24([...f24Rows,...f24Manual]));
  editingCu=null;editingF24=null;editingLedger=null;editingSt=null;selectedRecipient=null;
  ledgerSeq=Math.max(0,...ledgerState.map(x=>Number(String(x.id||"").match(/^(?:added-|adjustment-)(\\d+)$/)?.[1]||0)));
  manualSequence=Math.max(0,...f24Manual.map(x=>Number(String(x.uid||"").match(/^manual-(\\d+)$/)?.[1]||0)));
  $("phase2").hidden=!data.phase2;
  $("stSection").hidden=!stDraft.length;
  $("review").checked=Boolean(data.review);$("f24review").checked=Boolean(data.f24review);
  $("stConfirm").checked=Boolean(data.stConfirm);
  render();renderLedgerTree();f24Render();stRender();
  $("practiceStatus").textContent="Pratica ripristinata: "+data.taxpayer+" · "+data.year+" · salvataggio "+data.savedAt;
 }catch(error){$("practiceStatus").textContent="Apertura non riuscita: "+error.message}
 finally{$("loadPractice").value=""}
});
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
  out.push({name:normalize(m[3]),code:m[4],date:m[9],amount,document:m[1],invoiceDate:m[2],invoiceGross:cents(m[5]),invoiceWithholding:cents(m[6]),paymentAmount:cents(m[10])});
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
function effective(row){return {...row,...(overrides.get(row.name)||{})}}
let selectedRecipient=null;
$("exportRecipientInvoices").addEventListener("click",()=>{
 if(!selectedRecipient)return;
 const report=recipientInvoiceReport(selectedRecipient,$("year").value,ledgerState,display);
 if(!report.rows){$("status").textContent="Nessuna fattura attiva da esportare per "+selectedRecipient;return}
 const blob=new Blob([report.csv],{type:"text/csv;charset=utf-8"});
 const link=document.createElement("a");link.href=URL.createObjectURL(blob);
 link.download="770-fatture-"+selectedRecipient.replace(/[^A-Z0-9]+/gi,"-")+"-"+$("year").value+"-rev"+exportRevision+"-"+Date.now()+".csv";
 link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 $("status").textContent="Esportate "+report.rows+" fatture per "+selectedRecipient+". Ritenute "+display(report.total)+" €. Dati compenso disponibili su "+report.knownGross+" righe.";
});
function showRecipientInvoices(name){
 selectedRecipient=name;
 const panel=$("recipientInvoices"),body=$("recipientInvoiceRows");
 panel.hidden=false;$("recipientInvoiceTitle").textContent="Fatture e ritenute — "+name;
 body.replaceChildren();
 const rows=ledgerState.filter(x=>normalize(x.name)===normalize(name)&&inLedgerYear(x,$("year").value));
 let total=0;
 for(const r of rows){
  if(!r.excluded)total+=r.amount;
  const tr=document.createElement("tr");
  for(const value of [r.document||"Manuale",r.invoiceDate||"—",
    Number.isInteger(r.invoiceGross)?display(r.invoiceGross):"—",
    Number.isInteger(r.paymentAmount)?display(r.paymentAmount):"—",
    display(r.amount)]){
   const td=document.createElement("td");td.textContent=value;tr.append(td);
  }
  const action=document.createElement("td"),button=document.createElement("button");
  button.textContent="Vai al movimento";
  button.onclick=()=>{
   editingLedger=r.id;renderLedgerTree();
   $("ledgerMovements").closest(".scroll").scrollIntoView({behavior:"smooth",block:"start"});
  };
  action.append(button);tr.append(action);body.append(tr);
 }
 const current=buildCurrentCuRows(original,ledgerState,overrides,$("year").value,normalize)
  .find(r=>normalize(r.name)===normalize(name));
 $("recipientInvoiceTotals").textContent="Ritenute attive: "+display(total)+" € · CU: "+
  display(current?.cu||0)+" € · Differenza: "+display(total-(current?.cu||0))+
  " € · "+rows.length+" movimenti, inclusi quelli esclusi.";
}
function render(){
 // I totali gestionali sono SEMPRE derivati dai movimenti attivi: non dal PDF importato immutabile.
 const totals=new Map();
 for(const item of ledgerState.filter(x=>!x.excluded&&inLedgerYear(x,$("year").value))){
  const key=normalize(item.name);totals.set(key,(totals.get(key)||0)+item.amount);
 }
 const rows=buildCurrentCuRows(original,ledgerState,overrides,$("year").value,normalize),tbody=$("results");
 tbody.replaceChildren();
 for(const r of rows){
  const tr=document.createElement("tr");
  const diff=r.ledger-r.cu;
  for(const value of [r.name,display(r.ledger),display(r.cu),display(diff)]){
   const td=document.createElement("td");td.textContent=value;tr.append(td);
  }
  tr.children[3].className=diff?"mismatch":"match";
  const td=document.createElement("td"),btn=document.createElement("button");
  if(editingCu===r.key){
   const fields=[["name",r.name],["ledger",display(r.ledger)],["cu",display(r.cu)]],inputs={};
   for(let i=0;i<fields.length;i++){
    const [key,value]=fields[i],input=document.createElement("input");
    input.type="text";input.value=value;input.className="inline-field";
    input.setAttribute("aria-label",key+" "+r.name);inputs[key]=input;
    tr.children[i].replaceChildren(input);
   }
   const periodInput=document.createElement("input");periodInput.type="text";periodInput.className="inline-field";
   periodInput.placeholder="MM/AAAA per variazione";periodInput.setAttribute("aria-label","Periodo attribuzione rettifica");
   periodInput.title="Se cambi il totale delle ritenute, indica il mese al quale attribuire la differenza";
   const codeInput=document.createElement("input");codeInput.type="text";codeInput.className="inline-field";codeInput.placeholder="Tributo es. 1040";codeInput.value="1040";
   codeInput.title="Codice tributo da attribuire alla rettifica";td.append(periodInput,codeInput);
   tr.children[3].textContent="Calcolata";
   btn.textContent="Conferma";btn.addEventListener("click",()=>{
    const name=normalize(inputs.name.value),ledger=cents(inputs.ledger.value),cu=cents(inputs.cu.value);
    if(!name||!Number.isSafeInteger(ledger)||!Number.isSafeInteger(cu)||ledger<0||cu<0){$("status").textContent="Controlla nominativo e importi.";return}
    const delta=ledger-r.ledger;
    if(delta!==0){
     const period=periodInput.value.trim();
     if(!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(period)){
      $("status").textContent="Per modificare il totale delle ritenute devi indicare il periodo MM/AAAA. Nessuna rettifica applicata.";return;
     }
     const code=codeInput.value.trim();if(!/^[0-9]{4}$/.test(code)){$("status").textContent="Codice tributo non valido";return}
     const candidate=ledgerState.find(x=>!x.excluded&&normalize(x.name)===normalize(r.key)&&x.period===period&&x.code===code);
     if(candidate){
      if(candidate.amount+delta<0){$("status").textContent="La rettifica renderebbe negativo il movimento: modifica prima il dettaglio.";return}
      candidate.amount+=delta;candidate.edited=true;
     }else{
      if(delta<0){$("status").textContent="Non esiste una ritenuta nel periodo da ridurre: modifica prima il dettaglio.";return}
      ledgerState.push({id:"adjustment-"+(++ledgerSeq),source:null,name:r.key,code,
       date:"01/"+period.slice(0,2)+"/"+period.slice(-2),period,amount:delta,excluded:false,edited:true});
     }
    }
    overrides.set(r.key,{name,cu});editingCu=null;$("review").checked=false;invalidateTree();
   });
   const cancel=document.createElement("button");cancel.textContent="Annulla";cancel.className="secondary";
   cancel.addEventListener("click",()=>{editingCu=null;render()});td.append(btn,cancel);
  }else{
   btn.textContent="Modifica";btn.addEventListener("click",()=>{editingCu=r.key;render()});td.append(btn);
  }
  const inspect=document.createElement("button");inspect.textContent="Dettaglio fatture";inspect.className="secondary";
  inspect.addEventListener("click",()=>showRecipientInvoices(r.key));
  td.append(inspect);
  tr.append(td);tbody.append(tr);
 }
 const total=rows.reduce((s,r)=>s+r.ledger-r.cu,0);
 const nonzero=rows.filter(r=>r.ledger!==r.cu).length;
 const outside=ledgerState.filter(x=>!x.excluded&&!inLedgerYear(x,$("year").value));
 $("summary").textContent=`Anno ${$("year").value} · Ritenute fuori anno escluse: ${outside.length} (${display(outside.reduce((sum,x)=>sum+x.amount,0))} €) · Percipienti: ${rows.length} · Differenze: ${nonzero} · Scostamento gestionale - CU: ${display(total)} €`;
 $("review").disabled=!rows.length||nonzero>0;
 if(nonzero)$("review").checked=false;
 $("next").disabled=nonzero>0||!$("review").checked;
 $("reset").disabled=!overrides.size;$("export").disabled=!rows.length;
 if(selectedRecipient)showRecipientInvoices(selectedRecipient);
}
$("check").addEventListener("click",async()=>{
 const ledgerFile=$("ledger").files[0],cuFile=$("cu").files[0];
 const taxpayer=taxId($("taxpayer").value);
 if(!taxpayer){$("status").textContent="Inserisci il codice fiscale o partita IVA del sostituto.";return}
 if(!ledgerFile||!cuFile){$("status").textContent="Seleziona almeno il listato ritenute e il brogliaccio CU.";return}
 $("check").disabled=true;$("status").textContent="Lettura PDF in corso…";
 try{
  const [ledgerLines,cuLines]=await Promise.all([pdfLines(ledgerFile),pdfLines(cuFile)]);
  const rawLedger=parseLedger(ledgerLines),cu=parseCuAll(cuLines);
  const names=reconcileNames(rawLedger,cu);
  const ledger=rawLedger.map(row=>({...row,name:names.resolved.get(normalizeRecipient(row.name))||normalizeRecipient(row.name),originalName:row.name}));
  const details={Gestionale:identifyDetailed(ledgerLines),CU:identifyDetailed(cuLines)};
  const identityNotes=[];
  for(const [name,found] of Object.entries(details)){
   const confirmed=found.some(x=>x.id===taxpayer&&x.kind==="sostituto");
   if(confirmed)identityNotes.push(name+": identificativo del sostituto trovato");
   else if(found.some(x=>x.id===taxpayer))identityNotes.push(name+": codice trovato, ruolo da verificare");
   else if(found.some(x=>x.kind==="sostituto"))identityNotes.push(name+": CF del sostituto diverso da quello della pratica; verifica il documento");
   else if(found.length)identityNotes.push(name+": codici presenti ma sostituto non identificato con certezza");
   else identityNotes.push(name+": CF non riportato nel testo del listato; verifica manualmente l’azienda in intestazione");
  }
  $("identity").textContent=identityNotes.join(" · ")+". Il valore inserito resta quello della pratica; verifica la corrispondenza dei documenti.";
  console.info("770 import diagnostica (senza nominativi)",{righeGestionale:ledger.length,righeCU:cu.length,righeTestoGestionale:ledgerLines.length,righeTestoCU:cuLines.length});
  if(!ledger.length||!cu.length)throw new Error(`Formato PDF non riconosciuto (movimenti: ${ledger.length}; CU: ${cu.length}). Serve adattare il lettore al testo estratto; nessun dato è stato riconciliato.`);
  ledgerState=newLedgerState(ledger);ledgerRows=activeLedger(ledgerState,$("year").value);f24Rows=[];f24Manual=[];interestOverrides.clear();original=aggregate(ledger,cu);overrides.clear();$("review").checked=false;$("phase2").hidden=false;
  $("status").textContent=`Acquisite ${ledger.length} righe gestionali (${display(ledger.reduce((s,r)=>s+r.amount,0))} €) e ${cu.length} righe CU (${display(cu.reduce((s,r)=>s+r.amount,0))} €). Nominativi senza corrispondenza certa: ${names.unmatched.length}. Verifica i totali prima di confermare.`;
  render();renderLedgerTree();f24Render();$("stSection").hidden=false;
  if($("f24").files[0])$("readf24").click();
 }catch(err){$("status").textContent="Importazione non completata: "+err.message}
 finally{$("check").disabled=false}
});
$("year").addEventListener("change",()=>{interestOverrides.clear();invalidateTree()});
$("review").addEventListener("change",render);
$("reset").addEventListener("click",()=>{overrides.clear();editingCu=null;invalidateTree()});
$("next").addEventListener("click",()=>{$("phase2").hidden=false;$("phase2").scrollIntoView({behavior:"smooth"})});
$("export").addEventListener("click",()=>{
 const totals=new Map();
 for(const item of activeLedger(ledgerState,$("year").value))totals.set(normalize(item.name),(totals.get(normalize(item.name))||0)+item.amount);
 const rows=buildCurrentCuRows(original,ledgerState,overrides,$("year").value,normalize);
 const audit=auditCuExport(rows,ledgerState,$("year").value);
 if(!audit.ok){$("status").textContent="ESPORTAZIONE BLOCCATA — "+audit.errors.slice(0,5).join("; ");return}
 const csv=[csvLine(["Percipiente","Ritenuta gestionale","Ritenuta CU","Differenza","Rettificata"]),...rows.map(r=>csvLine([r.name,display(r.ledger),display(r.cu),display(r.ledger-r.cu),overrides.has(r.key)?"SI":"NO"])),csvLine(["TOTALE",display(audit.exportTotal),display(audit.cuTotal),display(audit.exportTotal-audit.cuTotal),""])].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=uniqueExportName("770-controllo-cu",exportRevision);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

function renderRestore(bodyId,rows,onRestore){
 const body=$(bodyId),id=bodyId+"Restore";
 let controls=$(id);
 if(!controls){controls=document.createElement("div");controls.id=id;controls.className="actions";body.closest("table").parentElement.before(controls)}
 controls.replaceChildren();
 const deleted=rows.filter(row=>row.excluded);
 controls.hidden=!deleted.length;
 if(!deleted.length)return;
 const picker=document.createElement("select");picker.setAttribute("aria-label","Righe eliminate "+bodyId);
 const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Ripristina una riga eliminata ("+deleted.length+")";picker.append(placeholder);
 for(const row of deleted){
  const option=document.createElement("option");option.value=row.id??row.uid;
  option.textContent=[row.name,row.point1??row.period??((row.assignedMonth??row.month??"")+"/"+(row.assignedYear??row.year??"")),row.point11??row.code,f24Euro(row.amount??row.point2??row.debit??0)].filter(Boolean).join(" · ");picker.append(option);
 }
 const button=document.createElement("button");button.textContent="Ripristina riga";button.disabled=true;
 picker.onchange=()=>{button.disabled=!picker.value};
 button.onclick=()=>{const row=deleted.find(row=>(row.id??row.uid)===picker.value);if(row){row.excluded=false;onRestore()}};
 controls.append(picker,button);
}
function renderF24Movements(){
 const body=$("f24movements");body.replaceChildren();
 renderRestore("f24movements",[...f24Rows,...f24Manual],()=>{invalidateAfterF24Change();f24Render()});
 for(const row of [...f24Rows,...f24Manual].filter(row=>!row.excluded)){
  const tr=document.createElement("tr"),active=editingF24===row.uid,inputs={};
  const fields=["date","code","originalPeriod","assignedPeriod","assignedYear","debit","credit"];
  const values={
   date:row.date,code:row.code,
   originalPeriod:(row.original?.month??row.month??row.period??"")+"/"+(row.original?.year??row.year),
   assignedPeriod:row.assignedMonth??row.month??"",
   assignedYear:row.assignedYear??row.year,
   debit:(row.debit/100).toFixed(2),credit:(row.credit/100).toFixed(2)
  };
  for(const field of fields){
   const td=document.createElement("td");
   if(active&&field!=="originalPeriod"){
    const input=document.createElement("input");input.type="text";input.value=values[field];
    input.className="inline-field";input.setAttribute("aria-label",field+" "+row.uid);
    inputs[field]=input;td.append(input);
   }else td.textContent=values[field];
   tr.append(td);
  }
  if(row.excluded)tr.className="excluded-row";
  const actions=document.createElement("td"),btn=document.createElement("button");
  if(active){
   btn.textContent="Conferma";btn.addEventListener("click",()=>{
    const updated={...row,date:inputs.date.value.trim(),code:inputs.code.value.trim(),
     assignedMonth:inputs.assignedPeriod.value.trim().padStart(2,"0"),
     assignedYear:inputs.assignedYear.value.trim(),
     debit:parseEuros(inputs.debit.value),credit:parseEuros(inputs.credit.value)};
    const errors=validateF24Change(updated);
    if(errors.length){$("f24status").textContent="Controlla: "+errors.join(", ");return}
    Object.assign(row,updated,{edited:true});editingF24=null;invalidateAfterF24Change();f24Render();
   });
   const cancel=document.createElement("button");cancel.textContent="Annulla";cancel.className="secondary";
   cancel.addEventListener("click",()=>{editingF24=null;renderF24Movements()});actions.append(btn,cancel);
  }else{
   btn.textContent="Modifica";btn.addEventListener("click",()=>{editingF24=row.uid;renderF24Movements()});actions.append(btn);
   const picker=document.createElement("select");picker.className="period-picker";
   const first=document.createElement("option");first.value="";first.textContent="Attribuisci a…";picker.append(first);
   const options=new Set(ledgerSummary(ledgerState,$("year").value).map(x=>x.period));
   const current=(row.assignedMonth??row.month??"")+"/"+(row.assignedYear??row.year);
   if(current&&current!=="/")options.add(current);
   for(const period of [...options].sort()){
    const opt=document.createElement("option");opt.value=period;opt.textContent=period;picker.append(opt);
   }
   const other=document.createElement("option");other.value="custom";other.textContent="Altro periodo…";picker.append(other);
   const assign=document.createElement("button");assign.textContent="Attribuisci";
   assign.addEventListener("click",()=>{
    let chosen=picker.value;
    if(chosen==="custom"){
     chosen=prompt("Periodo da attribuire MM/AAAA",current)||"";
    }
    if(!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(chosen)){
     $("f24status").textContent="Seleziona un periodo valido.";return;
    }
    const [month,year]=chosen.split("/");
    row.assignedMonth=month;row.assignedYear=year;row.edited=true;
    invalidateAfterF24Change();f24Render();
    $("f24status").textContent="Movimento attribuito a "+chosen+"; origine F24 conservata.";
   });
   actions.append(picker,assign);
   const exclude=document.createElement("button");exclude.className="secondary";
   exclude.textContent=row.excluded?"Ripristina":"Elimina";
   exclude.addEventListener("click",()=>{
    row.excluded=!row.excluded;row.edited=true;invalidateAfterF24Change();f24Render();
   });actions.append(exclude);
  }
  tr.append(actions);body.append(tr);
 }
}
$("resetF24").addEventListener("click",()=>{
 if(!f24Rows.length&&!f24Manual.length)return;
 if(!confirm("Ripristinare i movimenti F24 al listato importato? Le attribuzioni e rettifiche F24 saranno annullate e i movimenti manuali rimossi. Il PDF originario rimane invariato."))return;
 for(const row of f24Rows){
  if(row.original){
   Object.assign(row,{
    date:row.original.date,code:row.original.code,
    month:row.original.month,year:row.original.year,
    debit:row.original.debit,credit:row.original.credit
   });
  }
  delete row.assignedMonth;delete row.assignedYear;
  row.excluded=false;row.edited=false;
 }
 for(const row of ledgerState)unlink(row);
 f24Manual=[];editingF24=null;interestOverrides.clear();
 $("f24Audit").hidden=true;
 invalidateAfterF24Change();f24Render();
 $("f24status").textContent="Ripristinati i movimenti F24 originali. Riconciliazione ricalcolata.";
});
function invalidateAfterF24Change(){
 exportRevision++;
 syncLinks(ledgerState,usableF24([...f24Rows,...f24Manual]));
 ledgerRows=activeLedger(ledgerState,$("year").value);
 renderLedgerTree();
 render();
 $("f24review").checked=false;$("stSection").hidden=true;
 stDraft=[];stInvalidate();stRender();
 $("f24status").textContent="Movimenti modificati. Riconciliazione ricalcolata; quadro ST precedente invalidato.";
}
function renderRavvedimenti(){
 const groups=paymentGroupSummary(usableF24([...f24Rows,...f24Manual]),$("year").value);
 const target=$("ravrows");target.replaceChildren();
 for(const g of groups){
  const tr=document.createElement("tr");
  for(const value of [g.date,g.month+"/"+g.year,f24Euro(g.tax),f24Euro(g.penalty),f24Euro(g.possibleInterest),String(g.items.length),
   "Un gruppo per data/periodo; dettaglio distinto, interessi da verificare"]){
   const td=document.createElement("td");td.textContent=value;tr.append(td);
  }
  target.append(tr);
 }
 $("ravstatus").textContent=groups.length+" gruppi di versamento 1040/8948; data ereditata dalle righe senza data. Nessun importo sommato due volte.";
}
let exportRevision=0;
function invalidateTree(){
 exportRevision++;
 syncLinks(ledgerState,usableF24([...f24Rows,...f24Manual]));
 ledgerRows=activeLedger(ledgerState,$("year").value);
 $("review").checked=false;
 $("f24review").checked=false;
 $("stSection").hidden=false;
 stDraft=[];editingSt=null;stInvalidate();stRender();
 render();
 renderLedgerTree();
 if(!$("phase2").hidden)f24Render();
}
function renderLedgerTree(){
 const body=$("ledgerMovements");body.replaceChildren();
 renderRestore("ledgerMovements",ledgerState,invalidateTree);
 for(const r of ledgerState.filter(row=>!row.excluded)){
  const tr=document.createElement("tr"),active=editingLedger===r.id,inputs={};
  if(r.excluded||!inLedgerYear(r,$("year").value))tr.className="excluded-row";
  const fields=["name","code","period","amount"];
  for(const field of fields){
   const td=document.createElement("td");
   if(active){
    const input=document.createElement("input");input.type="text";input.className="inline-field";
    input.value=field==="amount"?f24Euro(r.amount):String(r[field]);
    inputs[field]=input;td.append(input);
   }else td.textContent=field==="amount"?f24Euro(r.amount):String(r[field]);
   tr.append(td);
  }
  const origin=document.createElement("td");origin.textContent=(!inLedgerYear(r,$("year").value)?"Fuori anno "+$("year").value+" · Esclusa dai conteggi · ":"")+(r.source?"Gestionale":"Manuale")+(r.reconciliation?" · Riconciliata → ST "+r.stPeriod:"");tr.append(origin);
  const td=document.createElement("td"),btn=document.createElement("button");
  if(active){
   btn.textContent="Conferma";btn.addEventListener("click",()=>{
    const raw=inputs.amount.value.trim();
    if(!/^[0-9]+(?:[.][0-9]{3})*(?:,[0-9]{1,2})?$/.test(raw)){$("status").textContent="Importo ritenuta non valido";return}
    const proposed={...r,name:normalize(inputs.name.value),code:inputs.code.value.trim(),
     period:inputs.period.value.trim(),amount:cents(raw)};
    const errors=validateLedger(proposed);
    if(errors.length){$("status").textContent="Correggi: "+errors.join(", ");return}
    Object.assign(r,proposed,{edited:true});editingLedger=null;invalidateTree();
   });
   const cancel=document.createElement("button");cancel.textContent="Annulla";cancel.className="secondary";
   cancel.addEventListener("click",()=>{editingLedger=null;renderLedgerTree()});td.append(btn,cancel);
  }else{
   btn.textContent="Modifica";btn.addEventListener("click",()=>{editingLedger=r.id;renderLedgerTree()});td.append(btn);
   const toggle=document.createElement("button");toggle.className="secondary";toggle.textContent=r.excluded?"Ripristina":"Elimina";
   toggle.addEventListener("click",()=>{r.excluded=!r.excluded;invalidateTree()});td.append(toggle);
  }
  tr.append(td);body.append(tr);
 }
 const summary=$("ledgerPeriods");summary.replaceChildren();
 for(const group of ledgerSummary(ledgerState,$("year").value)){
  const tr=document.createElement("tr");
  for(const val of [group.period,group.code,f24Euro(group.amount),String(group.count)]){
   const td=document.createElement("td");td.textContent=val;tr.append(td);
  }
  summary.append(tr);
 }
}
let ledgerSeq=0;

let movementMode=null;
function openMovementDialog(mode){
 movementMode=mode;
 const dialog=$("movementDialog"),fields=$("movementDialogFields");
 fields.replaceChildren();$("movementDialogError").textContent="";
 $("movementDialogTitle").textContent=mode==="ledger"?"Aggiungi ritenuta gestionale":"Aggiungi versamento F24";
 const defs=mode==="ledger"?
  [["name","Percipiente",""],["code","Codice tributo","1040"],["period","Periodo MM/AAAA","01/"+$("year").value],["amount","Ritenuta operata (€)","0,00"]]:
  [["date","Data versamento GG/MM/AAAA",""],["code","Codice tributo","1040"],["month","Mese di riferimento MM","01"],["year","Anno di riferimento",$("year").value],["debit","Importo a debito (€)","0,00"],["credit","Importo a credito (€)","0,00"]];
 for(const [key,label,value] of defs){
  const wrap=document.createElement("label");wrap.textContent=label;
  const input=document.createElement("input");input.name=key;input.value=value;input.required=true;
  input.setAttribute("aria-label",label);wrap.append(input);fields.append(wrap);
 }
 dialog.showModal();
 fields.querySelector("input")?.focus();
}
$("cancelMovement").addEventListener("click",()=>$("movementDialog").close());
$("movementForm").addEventListener("submit",event=>{
 event.preventDefault();
 const form=new FormData(event.currentTarget),get=k=>String(form.get(k)||"").trim();
 if(movementMode==="ledger"){
  const r={id:"added-"+(ledgerSeq+1),source:null,name:normalize(get("name")),code:get("code"),
   period:get("period"),amount:parseEuros(get("amount")),excluded:false,edited:true};
  const errors=validateLedger(r);
  if(errors.length){$("movementDialogError").textContent="Controlla: "+errors.join(", ");return}
  ledgerSeq++;ledgerState.push(r);editingLedger=null;
  $("movementDialog").close();invalidateTree();
  $("status").textContent="Ritenuta aggiunta e riepiloghi ricalcolati.";
 }else if(movementMode==="f24"){
  const year=get("year"),month=get("month").padStart(2,"0");
  const debit=parseEuros(get("debit")),credit=parseEuros(get("credit"));
  const r={uid:"manual-"+(manualSequence+1),code:get("code"),month,year,assignedMonth:month,assignedYear:year,
   date:get("date"),debit,credit,source:"MANUALE",excluded:false,edited:true};
  const errors=validateF24Change(r);
  if(errors.length){$("movementDialogError").textContent="Controlla: "+errors.join(", ");return}
  r.original={date:r.date,code:r.code,month:r.month,year:r.year,debit:r.debit,credit:r.credit};
  manualSequence++;f24Manual.push(r);editingF24=null;
  $("movementDialog").close();invalidateAfterF24Change();f24Render();
  $("f24status").textContent="F24 aggiunto e riconciliazione ricalcolata.";
 }
});

$("addLedger").addEventListener("click",()=>openMovementDialog("ledger"));
function f24Render(){
 renderF24Movements();
 renderRavvedimenti();
 const tbody=$("f24rows");tbody.replaceChildren();
 const year=$("year").value,rows=reconcile(ledgerRows,usableF24([...f24Rows,...f24Manual]),year);
 for(const r of rows){
  const tr=document.createElement("tr");
  const status=r.status==="DA_ATTRIBUIRE"?"F24 da attribuire":r.status==="NON_VERSATO"?"Ritenuta non versata":r.difference===0?"Quadrato":"Differenza da verificare";
  const values=[r.code,r.month+"/"+r.year,f24Euro(r.expected),f24Euro(r.paid),r.difference===null?status:f24Euro(r.difference)];
  for(const value of values){const td=document.createElement("td");td.textContent=value;tr.append(td)}
  tr.children[4].className=r.difference===null?"mismatch":r.difference?"mismatch":"match";
  const linked=ledgerState.filter(x=>!x.excluded&&x.reconciliation&&x.stPeriod===r.month+"/"+r.year&&x.code===r.code);
  const proposed=!linked.length&&r.status==="CONFRONTABILE"?Math.max(0,r.difference):0;
  const interest=interestOverrides.has(r.key)?interestOverrides.get(r.key):proposed;
  const cell=document.createElement("td"),input=document.createElement("input");
  input.type="number";input.step="0.01";input.min="0";input.value=(interest/100).toFixed(2);
  input.disabled=r.status!=="CONFRONTABILE";
  input.title=r.status==="CONFRONTABILE"?"Interessi ipotizzati da verificare":"Non proporre interessi su movimenti non abbinati";
  input.addEventListener("change",()=>{
   const raw=input.value.trim();
   if(!/^[0-9]+(?:[.][0-9]{1,2})?$/.test(raw)){alert("Importo interessi non valido");return}
   const amount=Math.round(Number(raw)*100);
   if(!Number.isSafeInteger(amount)||amount<0)return;
   interestOverrides.set(r.key,amount);stDraft=[];stInvalidate();stRender();f24Render();
  });
  cell.append(input);tr.append(cell);
  const residual=document.createElement("td");
  residual.textContent=r.difference===null?"Da verificare":f24Euro(r.difference-interest);
  residual.className=r.difference===null||r.difference-interest?"mismatch":"match";
  tr.append(residual);
  const detail=document.createElement("td"),btn=document.createElement("button");
  btn.textContent=r.payments.length+" F24 · Dettaglio";
  btn.addEventListener("click",()=>alert(r.payments.length?r.payments.map(p=>p.date+" · "+f24Euro(p.debit)+" € · "+p.source).join("\n"):"Nessun F24 associato"));
  detail.append(btn);
  tr.append(detail);
  const corrections=document.createElement("td");
  const matching=ledgerState.filter(x=>!x.excluded&&inLedgerYear(x,year)&&x.code===r.code&&(x.stPeriod||x.period)===r.month+"/"+r.year);
  if(matching.length){
   const edit=document.createElement("button");edit.textContent="Modifica ritenuta";
   edit.addEventListener("click",()=>{
    const periodInput=document.createElement("input");periodInput.className="inline-field";
    periodInput.value=r.month+"/"+r.year;periodInput.placeholder="MM/AAAA";
    const amountInput=document.createElement("input");amountInput.className="inline-field";
    amountInput.value=f24Euro(r.expected);amountInput.title="Totale ritenute attribuite al periodo";
    const confirm=document.createElement("button");confirm.textContent="Conferma";
    confirm.addEventListener("click",()=>{
     const target=periodInput.value.trim();
     if(!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(target)){$("f24status").textContent="Periodo non valido. Usa MM/AAAA.";return}
     const value=parseEuros(amountInput.value);
     if(value===null){$("f24status").textContent="Importo ritenute non valido.";return}
     const previous=matching.reduce((sum,x)=>sum+x.amount,0);
     const diff=value-previous;
     if(matching[0].amount+diff<0){$("f24status").textContent="Riduzione superiore al primo movimento: modifica i movimenti nel dettaglio.";return}
     // Spostiamo solo le ritenute; NON cambiamo il periodo o la data degli F24.
     for(const item of matching){if(item.reconciliation){if(target!==item.stPeriod)unlink(item);else continue}item.period=target;item.edited=true}
     matching[0].amount+=diff;
     invalidateTree();
     $("f24status").textContent="Ritenute modificate e attribuite a "+target+". F24 originali invariati.";
    });
    const cancel=document.createElement("button");cancel.textContent="Annulla";
    cancel.addEventListener("click",()=>f24Render());
    corrections.replaceChildren(periodInput,amountInput,confirm,cancel);
   });
   const remove=document.createElement("button");remove.textContent="Elimina ritenuta";remove.className="secondary";
   remove.addEventListener("click",()=>{
    for(const item of matching)item.excluded=true;
    invalidateTree();
    $("f24status").textContent="Ritenute escluse dal periodo "+r.month+"/"+r.year+". Ripristinabili nel registro ritenute.";
   });
   corrections.append(edit,remove);
   for(const item of linked){
    const undo=document.createElement("button");undo.textContent="Annulla riconciliazione";
    undo.onclick=()=>{unlink(item);invalidateTree()};
    const info=document.createElement("span");info.textContent="Gestionale "+item.period+" → F24 / ST "+item.stPeriod+" · ";
    corrections.append(info,undo);
   }
  }else{
   const candidates=ledgerState.filter(x=>!x.excluded&&inLedgerYear(x,year)&&!x.reconciliation&&x.code===r.code&&x.period!==r.month+"/"+r.year);
   const picker=document.createElement("select");picker.className="period-picker";
   const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Scegli ritenuta";picker.append(placeholder);
   for(const candidate of candidates){
    const option=document.createElement("option");option.value=candidate.id;
    option.textContent=candidate.period+" · "+candidate.name+" · "+f24Euro(candidate.amount)+" €";
    picker.append(option);
   }
   const assign=document.createElement("button");assign.textContent="Riconcilia";
   assign.addEventListener("click",()=>{
    const item=ledgerState.find(x=>x.id===picker.value&&!x.excluded);
    if(!item){$("f24status").textContent="Seleziona una ritenuta da attribuire al periodo "+r.month+"/"+r.year;return}
    try{link(item,r.payments)}catch(error){$("f24status").textContent=error.message;return}
    invalidateTree();
    $("f24status").textContent="Ritenuta di "+f24Euro(item.amount)+" € riconciliata: gestionale "+item.period+", F24 / ST "+item.stPeriod+". Importi originali conservati.";
   });
   corrections.append(picker,assign);
   const create=document.createElement("button");create.textContent="+ Ritenuta";
   create.addEventListener("click",()=>{
    const amount=prompt("Importo nuova ritenuta (€)",f24Euro(r.paid));
    if(amount===null)return;
    const parsed=parseEuros(amount);
    if(parsed===null){$("f24status").textContent="Importo non valido";return}
    const name=prompt("Percipiente della nuova ritenuta","");
    if(name===null||!name.trim())return;
    ledgerState.push({id:"adjustment-"+(++ledgerSeq),source:null,name:normalize(name),code:r.code,
     period:r.month+"/"+r.year,amount:parsed,excluded:false,edited:true});
    invalidateTree();
    $("f24status").textContent="Ritenuta manuale inserita nel periodo "+r.month+"/"+r.year+".";
   });
   corrections.append(create);
  }
  tr.append(corrections);tbody.append(tr);
 }
 $("exportf24").disabled=!rows.length;
 const total=rows.reduce((s,r)=>s+(r.difference??0),0);
 const unassigned=rows.filter(r=>r.status==="DA_ATTRIBUIRE").length;
 const unpaid=rows.filter(r=>r.status==="NON_VERSATO").length;
 const previous=$("f24status").textContent.split(" · Periodi:")[0];
 $("f24status").textContent=previous+" · Periodi: "+rows.length+" · F24 da attribuire: "+unassigned+" · Periodi non versati: "+unpaid+" · Differenza sui soli periodi confrontabili: "+f24Euro(total)+" €";
}
$("readf24").addEventListener("click",async()=>{
 const file=$("f24").files[0];
 if(!file){$("f24status").textContent="Seleziona prima il PDF F24.";return}
 $("readf24").disabled=true;$("f24status").textContent="Lettura F24 in corso…";
 try{
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
   const p=await pdf.getPage(i),content=await p.getTextContent();
   pages.push(content.items.map(item=>({text:item.str,x:item.transform[4],y:item.transform[5]})));
  }
  const flat=pages.map(p=>p.map(t=>t.text).join(" "));
  const detailsF24=identifyDetailed(flat),expectedId=taxId($("taxpayer").value);
  const idsF24=detailsF24.filter(x=>x.kind==="sostituto").map(x=>x.id);
  const matchingGeneric=detailsF24.some(x=>x.id===expectedId);
  if(!expectedId)throw Error("Indica prima il contribuente.");
  if(idsF24.length&&!idsF24.includes(expectedId))throw Error("Il listato F24 appartiene a un contribuente diverso. Importazione bloccata.");
  if(!idsF24.length&&!confirm(matchingGeneric?"Il CF della pratica è presente nel PDF F24, ma il ruolo non è indicato. Hai verificato che sia il contribuente corretto?":"CF del contribuente non individuato nell’intestazione del PDF F24. Hai verificato manualmente che sia quello corretto?"))throw Error("Verifica contribuente F24 non confermata.");
  if(/RITENUTE\s+MATURATE\s+DA\s+VERSARE/i.test(flat.join(" ")))throw Error("Il file selezionato è un listato ritenute gestionali, non un listato F24. Seleziona il PDF dei versamenti Agenzia delle Entrate.");
  const parsed=parseF24Pages(pages);
  if(!parsed.rows.length)throw Error("Nessuna riga F24 riconosciuta nel PDF Agenzia delle Entrate.");
  // La sostituzione è atomica: nessun dato precedente viene modificato se l'utente annulla.
  const previous=f24Rows;
  if(previous.length&&!confirm("Sostituire i movimenti importati dal PDF precedente? Gli F24 inseriti manualmente saranno conservati. Le rettifiche sulle righe importate saranno reimpostate."))return;
  const fresh=cloneF24(parsed.rows);
  const key=r=>[r.date,r.code,r.month??r.period,r.year,r.debit,r.credit].join("|");
  const counts=new Map();
  for(const row of fresh){const k=key(row);counts.set(k,(counts.get(k)||0)+1)}
  const manualKeys=new Set(f24Manual.filter(r=>!r.excluded).map(r=>key(r)));
  const overlap=[...manualKeys].filter(k=>counts.has(k)).length;
  for(const row of ledgerState)unlink(row);ledgerRows=activeLedger(ledgerState,$("year").value);
  f24Rows=fresh;editingF24=null;interestOverrides.clear();
  invalidateAfterF24Change();
  if(overlap){
   $("f24Audit").hidden=false;
   $("f24Audit").textContent="Attenzione: "+overlap+" corrispondenze fra movimenti manuali e nuovo listato. Verifica ed escludi i duplicati prima della conferma.";
  }else{
   $("f24Audit").hidden=true;
  }
  const year=$("year").value;
  const selected=f24Rows.filter(r=>r.year===year);
  const missing=selected.filter(r=>!r.month);
  $("f24status").textContent="PDF AdE: "+pdf.numPages+" pagine; "+f24Rows.length+" righe totali; "+selected.length+" con anno "+year+"; "+missing.length+" senza mese; "+parsed.rejected.length+" righe da verificare. I tributi non pertinenti non sono automaticamente esclusi: confronta solo i codici delle ritenute.";
  f24Render();
  renderRavvedimenti();
 }catch(e){$("f24status").textContent="Errore F24: "+e.message}
 finally{$("readf24").disabled=false}
});
let manualSequence=0;
$("addf24").addEventListener("click",()=>openMovementDialog("f24"));
$("replacef24").addEventListener("click",()=>{
 $("f24").click();
});
$("exportf24").addEventListener("click",()=>{
 const rows=reconcile(ledgerRows,usableF24([...f24Rows,...f24Manual]),$("year").value);
 const audit=auditF24Export(rows,usableF24([...f24Rows,...f24Manual]),$("year").value);
 if(!audit.ok){$("f24status").textContent="ESPORTAZIONE BLOCCATA — "+audit.errors.slice(0,5).join("; ");return}
 const csv=[csvLine(["Tributo","Periodo","Ritenute","Versato","Differenza lorda","Interessi ipotizzati","Residuo","Numero F24"]),...rows.map(r=>{const interest=interestOverrides.has(r.key)?interestOverrides.get(r.key):Math.max(0,r.difference??0);return csvLine([r.code,r.month+"/"+r.year,f24Euro(r.expected),f24Euro(r.paid),r.difference===null?r.status:f24Euro(r.difference),f24Euro(interest),r.difference===null?"":f24Euro(r.difference-interest),r.payments.length])}),csvLine(["TOTALE","",f24Euro(rows.reduce((s,r)=>s+r.expected,0)),f24Euro(audit.totalExport),"","","",""])].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=uniqueExportName("770-quadratura-f24",exportRevision);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

function stInvalidate(){
 exportRevision++;
 $("stConfirm").checked=false;$("exportSt").disabled=true;
 $("printSt").disabled=true;$("stPrint").hidden=true;
}
const stFields=["point1","point2","point6","point7","point8","point9","point10","point11","point14","point15","point16"];
const stMoney=new Set(["point2","point6","point7","point8","point16"]);
let editingSt=null;
function stRender(){
 const tbody=$("stRows");tbody.replaceChildren();
 renderRestore("stRows",stDraft,()=>{stInvalidate();stRender()});
 for(const row of stDraft.filter(row=>!row.excluded)){
  const tr=document.createElement("tr"),active=editingSt===row.id,inputs={};
  if(row.excluded)tr.className="excluded-row";
  for(const field of stFields){
   const td=document.createElement("td"),value=row[field];
   if(active){
    const input=document.createElement("input");input.type=field==="point9"?"checkbox":"text";
    if(field==="point9")input.checked=Boolean(value);
    else input.value=stMoney.has(field)?(value===null?"":(value/100).toFixed(2)):String(value??"");
    input.className="inline-field";input.setAttribute("aria-label","ST "+field);
    inputs[field]=input;td.append(input);
   }else td.textContent=field==="point9"?(value?"Sì":"No"):stMoney.has(field)?(value===null?"Da attribuire":f24Euro(value)):String(value??"");
   tr.append(td);
  }
  const actions=document.createElement("td"),button=document.createElement("button");
  if(active){
   button.textContent="Conferma";
   button.addEventListener("click",()=>{
    const changed={...row};
    for(const field of stFields){
     if(field==="point9"){changed[field]=inputs[field].checked;continue}
     const value=inputs[field].value.trim();
     if(stMoney.has(field)){
      if(field==="point2"&&!value){changed[field]=null;continue}
      if(!/^[0-9]+(?:[.,][0-9]{1,2})?$/.test(value)){alert("Importo non valido al punto "+field);return}
      changed[field]=Math.round(Number(value.replace(",","."))*100);
      if(!Number.isSafeInteger(changed[field])){alert("Importo fuori limite");return}
     }else changed[field]=value;
    }
    const errors=validateStRow(changed);
    if(errors.length){$("stStatus").textContent="Correggere: "+errors.join("; ");return}
    Object.assign(row,changed,{reviewed:true});editingSt=null;stInvalidate();stRender();
   });
   const cancel=document.createElement("button");cancel.textContent="Annulla";cancel.className="secondary";
   cancel.addEventListener("click",()=>{editingSt=null;stRender()});actions.append(button,cancel);
  }else{
   button.textContent="Modifica";button.addEventListener("click",()=>{editingSt=row.id;stInvalidate();stRender()});actions.append(button);
  }
  if(!active){
   const toggle=document.createElement("button");toggle.className="secondary";
   toggle.textContent=row.excluded?"Ripristina":"Elimina";
   toggle.addEventListener("click",()=>{row.excluded=!row.excluded;stInvalidate();stRender()});
   actions.append(toggle);
  }
  tr.append(actions);tbody.append(tr);
 }
 const issues=stDraft.filter(r=>!r.excluded).flatMap((r,i)=>validateStRow(r).map(s=>"Rigo "+(i+1)+": "+s));
 const activeSt=stDraft.filter(r=>!r.excluded);
 const stTotals="Ritenute operate nell’anno: "+f24Euro(ledgerRows.reduce((sum,x)=>sum+x.amount,0))+" € · Ritenute proposte ST: "+f24Euro(activeSt.reduce((sum,x)=>sum+(x.point2??0),0))+" € · Ravvedimenti proposti: "+activeSt.filter(x=>x.point9).length+". ";
 $("stStatus").textContent=stTotals+stDraft.filter(r=>!r.excluded).length+" righi attivi, "+stDraft.filter(r=>r.excluded).length+" esclusi. "+(issues.length?issues.length+" verifiche necessarie: "+issues.slice(0,3).join("; "):"Controlli formali superati; verifica fiscale necessaria.");
 $("exportSt").disabled=!stDraft.some(r=>!r.excluded)||issues.length>0||editingSt!==null||!$("stConfirm").checked;
 $("printControls").hidden=!stDraft.length;
}
$("f24review").addEventListener("change",()=>{
 if($("f24review").checked&&editingF24!==null){
  $("f24review").checked=false;
  $("f24status").textContent="Conferma o annulla prima la modifica F24 in corso.";
 }
 if($("f24review").checked&&$("f24Audit").hidden===false){
  if(!confirm("Sono presenti possibili duplicati tra F24 manuali e listato ricaricato. Hai verificato ogni corrispondenza?")){
   $("f24review").checked=false;
  }
 }
 $("stSection").hidden=false;
 if(!$("f24review").checked)stInvalidate();
});
$("makeSt").addEventListener("click",()=>{
 if(!ledgerRows.length){
  $("stStatus").textContent="Carica prima il listato gestionale e la CU.";
  return;
 }
 const payments=usableF24([...f24Rows,...f24Manual]);
 const result=buildStDraft(ledgerRows,payments,$("year").value,{hasAggregatedCuCorrections:false,interestByPeriod:Object.fromEntries(interestOverrides)});
 stDraft=result.rows;editingSt=null;stInvalidate();stRender();
 $("stSection").hidden=false;
 $("stStatus").textContent=stDraft.length+" righi ST provvisori generati. "+
  (result.warnings.length?result.warnings.join("; ")+" ":"")+
  "Ritenute operate nell’anno: "+f24Euro(ledgerRows.reduce((sum,x)=>sum+x.amount,0))+" € · Ritenute proposte ST: "+f24Euro(stDraft.reduce((sum,x)=>sum+(x.point2??0),0))+" €. Verifica e completa i campi mancanti prima della conferma e della stampa.";
});
$("addSt").addEventListener("click",()=>{
 stDraft.push({id:"manual-"+Date.now(),point1:"01/"+$("year").value,point2:null,point6:0,point7:0,point8:0,point9:false,point10:"",point11:"1040",point14:"",point15:"",point16:0,origin:"MANUALE"});
 editingSt=stDraft[stDraft.length-1].id;stInvalidate();stRender();
});
$("stConfirm").addEventListener("change",stRender);
$("exportSt").addEventListener("click",()=>{
 const audit=auditStExport(stDraft,validateStRow);
 if(!audit.ok){$("stStatus").textContent="ESPORTAZIONE ST BLOCCATA — "+audit.errors.slice(0,5).join("; ");return}
 const fields=["point1","point2","point6","point7","point8","point9","point10","point11","point14","point15","point16"];
 const csv=[["ST1 Periodo","ST2 Ritenute","ST6 Crediti","ST7 Versato","ST8 Interessi","ST9 Ravvedimento","ST10 Note","ST11 Tributo","ST14 Data","ST15 Sospensione","ST16 Importo sospeso"].join(";"),
 ...stDraft.filter(row=>!row.excluded).map(row=>fields.map(field=>["point2","point6","point7","point8","point16"].includes(field)?(row[field]===null?"":f24Euro(row[field])):field==="point9"?(row[field]?"1":"0"):row[field]).join(";"))].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=uniqueExportName("770-ST-provvisorio",exportRevision);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

const stPrintFields=[
 ["point1","1 Periodo"],["point2","2 Ritenute operate"],["point6","6 Crediti utilizzati"],
 ["point7","7 Importo versato"],["point8","8 Interessi"],["point9","9 Ravvedimento"],
 ["point10","10 Note"],["point11","11 Codice tributo"],["point14","14 Data versamento"],
 ["point15","15 Sospensione"],["point16","16 Importo sospeso"]
];
function printCell(value){const cell=document.createElement("td");cell.textContent=String(value??"");return cell}
function prepareStPrint(){
 if(!stDraft.some(r=>!r.excluded)){$("printStatus").textContent="Nessun quadro ST disponibile.";return}
 if(!$("stConfirm").checked){$("printStatus").textContent="Conferma prima la revisione del quadro ST.";return}
 const errors=stDraft.filter(r=>!r.excluded).flatMap((r,i)=>validateStRow(r).map(e=>"Rigo "+(i+1)+": "+e));
 if(errors.length){$("printStatus").textContent="Stampa non pronta: "+errors.slice(0,3).join("; ");return}
 const target=$("stPrint");target.replaceChildren();
 const heading=document.createElement("header"),title=document.createElement("h1"),sub=document.createElement("p");
 title.textContent="MODELLO 770 — QUADRO ST";
 sub.textContent="Sezione I — Ritenute alla fonte · Anno d'imposta "+$("year").value+" · Sostituto: "+$("taxpayer").value.trim().toUpperCase();
 heading.append(title,sub);target.append(heading);
 const warning=document.createElement("p");warning.className="print-warning";
 warning.textContent="PROSPETTO DI LAVORO — NON È IL MODELLO MINISTERIALE UFFICIALE. Da verificare prima della trascrizione o dell'utilizzo.";
 target.append(warning);
 const perPage=6;
 const printable=stDraft.filter(r=>!r.excluded);
 for(let start=0;start<printable.length;start+=perPage){
  const sheet=document.createElement("div");sheet.className="st-sheet";
  const table=document.createElement("table");table.className="st-print-table";
  const thead=document.createElement("thead"),headrow=document.createElement("tr");
  for(const [,label] of stPrintFields){const th=document.createElement("th");th.textContent=label;headrow.append(th)}
  thead.append(headrow);table.append(thead);
  const tbody=document.createElement("tbody");
  for(const row of printable.slice(start,start+perPage)){
   const tr=document.createElement("tr");
   for(const [key] of stPrintFields){
    let value=row[key];
    if(["point2","point6","point7","point8","point16"].includes(key))value=value===null?"":f24Euro(value);
    if(key==="point9")value=value?"X":"";
    tr.append(printCell(value));
   }
   tbody.append(tr);
  }
  table.append(tbody);sheet.append(table);
  const foot=document.createElement("p");foot.className="sheet-foot";
  foot.textContent="Quadro ST · Pagina "+(Math.floor(start/perPage)+1)+" di "+Math.ceil(printable.length/perPage)+" · Prospetto non ministeriale";
  sheet.append(foot);target.append(sheet);
 }
 target.hidden=false;$("printSt").disabled=false;
 $("printStatus").textContent="Anteprima pronta: "+printable.length+" righi, "+Math.ceil(stDraft.length/perPage)+" pagine. Usa Stampa / Salva PDF.";
}
$("previewSt").addEventListener("click",prepareStPrint);
$("printSt").addEventListener("click",()=>{
 if($("stPrint").hidden){$("printStatus").textContent="Prepara prima l'anteprima.";return}
 window.print();
});

$("exportMovements").addEventListener("click",()=>{
 const rows=[...f24Rows,...f24Manual];
 if(!rows.length){$("f24status").textContent="Nessun movimento da esportare.";return}
 const safe=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
 const header=["Data originale","Data utilizzata","Tributo originale","Tributo utilizzato","Periodo originale","Periodo attribuito","Debito originale","Debito utilizzato","Credito originale","Credito utilizzato","Escluso","Rettificato","Fonte"];
 const data=rows.map(r=>{
  const o=r.original||r;
  return [o.date,r.date,o.code,r.code,(o.month||o.period||"")+"/"+o.year,(r.assignedMonth??r.month??"")+"/"+(r.assignedYear??r.year),f24Euro(o.debit),f24Euro(r.debit),f24Euro(o.credit),f24Euro(r.credit),r.excluded?"SI":"NO",r.edited?"SI":"NO",r.source].map(safe).join(";");
 });
 const blob=new Blob(["\ufeff"+[header.map(safe).join(";"),...data].join("\r\n")],{type:"text/csv;charset=utf-8"});
 const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=uniqueExportName("770-movimenti-F24-rettifiche",exportRevision);link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
});
