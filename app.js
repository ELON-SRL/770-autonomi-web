"use strict";
import {buildStDraft,validateStRow} from "./st_draft.js";
import {taxId,identify,verify} from "./identita.js";
import {ravvedimentoGroups} from "./ravvedimenti.js";
import {parseF24Pages,reconcile,euro as f24Euro,moneyCents as f24Cents} from "./f24_ade.js";
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
let original=[],overrides=new Map(),parseIssues=[],ledgerRows=[],f24Rows=[],f24Manual=[],interestOverrides=new Map(),stDraft=[];
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
 const taxpayer=taxId($("taxpayer").value);
 if(!taxpayer){$("status").textContent="Inserisci il codice fiscale o partita IVA del sostituto.";return}
 if(!ledgerFile||!cuFile){$("status").textContent="Seleziona almeno il listato ritenute e il brogliaccio CU.";return}
 $("check").disabled=true;$("status").textContent="Lettura PDF in corso…";
 try{
  const [ledgerLines,cuLines]=await Promise.all([pdfLines(ledgerFile),pdfLines(cuFile,true)]);
  const ledger=parseLedger(ledgerLines),cu=parseCu(cuLines);
  const ids={Gestionale:identify(ledgerLines),CU:identify(cuLines)};
  const identity=verify(taxpayer,ids);
  $("identity").textContent=identity.message;
  if(!identity.ok){
   const mismatched=Object.values(ids).some(values=>values.length&&!values.includes(taxpayer));
   if(mismatched)throw new Error(identity.message);
   const approved=confirm("Il codice fiscale non è stampato in uno o più documenti. Verifica manualmente che appartengano al sostituto indicato. Confermi?");
   if(!approved)throw new Error("Identità non confermata. Riconciliazione bloccata.");
   $("identity").textContent="Identità verificata manualmente dall’utente; identificativo non leggibile nei PDF.";
  }
  console.info("770 import diagnostica (senza nominativi)",{righeGestionale:ledger.length,righeCU:cu.length,righeTestoGestionale:ledgerLines.length,righeTestoCU:cuLines.length});
  if(!ledger.length||!cu.length)throw new Error(`Formato PDF non riconosciuto (movimenti: ${ledger.length}; CU: ${cu.length}). Serve adattare il lettore al testo estratto; nessun dato è stato riconciliato.`);
  ledgerRows=ledger;f24Rows=[];f24Manual=[];interestOverrides.clear();original=aggregate(ledger,cu);overrides.clear();$("review").checked=false;$("phase2").hidden=true;
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

function f24Render(){
 const tbody=$("f24rows");tbody.replaceChildren();
 const year=$("year").value,rows=reconcile(ledgerRows,[...f24Rows,...f24Manual],year);
 for(const r of rows){
  const tr=document.createElement("tr");
  for(const value of [r.code,r.month+"/"+r.year,f24Euro(r.expected),f24Euro(r.paid),f24Euro(r.difference)]){
   const td=document.createElement("td");td.textContent=value;tr.append(td);
  }
  tr.children[4].className=r.difference?"mismatch":"match";
  // Solo eccedenze positive: proposta di interessi, NON accertamento fiscale.
  const proposed=Math.max(0,r.difference);
  const interest=interestOverrides.has(r.key)?interestOverrides.get(r.key):proposed;
  const cell=document.createElement("td"),input=document.createElement("input");
  input.type="number";input.step="0.01";input.min="0";input.value=(interest/100).toFixed(2);
  input.title="Interessi ipotizzati; modificabili. Non costituiscono classificazione automatica certa.";
  input.addEventListener("change",()=>{
   const raw=input.value.trim();
   if(!/^[0-9]+(?:[.][0-9]{1,2})?$/.test(raw)){alert("Importo interessi non valido");input.value=(interest/100).toFixed(2);return}
   const amount=Math.round(Number(raw)*100);
   if(!Number.isSafeInteger(amount)||amount<0){alert("Importo non valido");return}
   interestOverrides.set(r.key,amount);f24Render();
  });
  cell.append(input);tr.append(cell);
  const residual=document.createElement("td");residual.textContent=f24Euro(r.difference-interest);
  residual.className=r.difference-interest?"mismatch":"match";tr.append(residual);
  const detail=document.createElement("td"),btn=document.createElement("button");
  btn.textContent=r.payments.length+" F24 · Dettaglio";
  btn.addEventListener("click",()=>alert(r.payments.length?r.payments.map(p=>p.date+" · "+f24Euro(p.debit)+" € · "+p.source).join("\\n"):"Nessun F24 associato"));
  detail.append(btn);tr.append(detail);tbody.append(tr);
 }
 $("exportf24").disabled=!rows.length;
 const total=rows.reduce((s,r)=>s+r.difference,0);
 const previous=$("f24status").textContent.split(" · Periodi:")[0];
 $("f24status").textContent=previous+(rows.length?" · Periodi: "+rows.length+" · Differenza lorda F24 - ritenute: "+f24Euro(total)+" €":" · Nessun periodo disponibile");
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
  const idsF24=identify(flat),expectedId=taxId($("taxpayer").value);
  if(!expectedId)throw Error("Indica prima il contribuente.");
  if(idsF24.length&&!idsF24.includes(expectedId))throw Error("Il listato F24 appartiene a un contribuente diverso. Importazione bloccata.");
  if(!idsF24.length&&!confirm("Identificativo del contribuente non leggibile nel PDF F24. Hai verificato manualmente che sia quello corretto?"))throw Error("Verifica contribuente F24 non confermata.");
  const parsed=parseF24Pages(pages);
  if(!parsed.rows.length)throw Error("Nessuna riga F24 riconosciuta nel PDF Agenzia delle Entrate.");
  f24Rows=parsed.rows;
  const year=$("year").value;
  const selected=f24Rows.filter(r=>r.year===year);
  const missing=selected.filter(r=>!r.month);
  $("f24status").textContent="PDF AdE: "+pdf.numPages+" pagine; "+f24Rows.length+" righe totali; "+selected.length+" con anno "+year+"; "+missing.length+" senza mese; "+parsed.rejected.length+" righe da verificare. I tributi non pertinenti non sono automaticamente esclusi: confronta solo i codici delle ritenute.";
  f24Render();
  const rav=ravvedimentoGroups(f24Rows,$("year").value);
  const target=$("ravrows");target.replaceChildren();
  for(const g of rav){
   const tr=document.createElement("tr");
   for(const val of [g.date,g.period+"/"+g.year,f24Euro(g.tributo),f24Euro(g.sanzione),f24Euro(g.possibleInterest),String(g.rows.length),g.sanzione?"Raggruppamento proposto; verifica importi":"Versamento senza sanzione associata"]){
    const td=document.createElement("td");td.textContent=val;tr.append(td);
   }
   target.append(tr);
  }
  $("ravstatus").textContent=rav.length+" gruppi 1040/8948 individuati. Gli interessi sono soltanto proposti quando vi sono più righe 1040 con sanzione 8948; verifica obbligatoria.";
 }catch(e){$("f24status").textContent="Errore F24: "+e.message}
 finally{$("readf24").disabled=false}
});
$("addf24").addEventListener("click",()=>{
 const code=prompt("Codice tributo (4 cifre)","1040");if(code===null)return;
 if(!/^\d{4}$/.test(code)){alert("Codice tributo non valido");return}
 const period=prompt("Periodo MM/AAAA","03/"+$("year").value);if(period===null)return;
 const match=period.match(/^(0[1-9]|1[0-2])\/(20\d{2})$/);if(!match){alert("Periodo non valido");return}
 const date=prompt("Data versamento GG/MM/AAAA","16/04/"+$("year").value);if(date===null)return;
 if(!/^\d{2}\/\d{2}\/20\d{2}$/.test(date)){alert("Data non valida");return}
 const value=prompt("Importo a debito (€)","0,00");if(value===null)return;
 const debit=f24Cents(value);if(!Number.isFinite(debit)||debit<0){alert("Importo non valido");return}
 f24Manual.push({code,month:match[1],year:match[2],date,debit,credit:0,source:"MANUALE"});
 $("f24status").textContent="Inserimento manuale registrato per la sessione (non verificato con quietanza).";
 f24Render();
});
$("exportf24").addEventListener("click",()=>{
 const rows=reconcile(ledgerRows,[...f24Rows,...f24Manual],$("year").value);
 const csv=["Tributo;Periodo;Ritenute;Versato;Differenza lorda;Interessi ipotizzati;Residuo;Numero F24",...rows.map(r=>{const interest=interestOverrides.has(r.key)?interestOverrides.get(r.key):Math.max(0,r.difference);return [r.code,r.month+"/"+r.year,f24Euro(r.expected),f24Euro(r.paid),f24Euro(r.difference),f24Euro(interest),f24Euro(r.difference-interest),r.payments.length].join(";")})].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="770-quadratura-f24.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

function stInvalidate(){
 $("stConfirm").checked=false;$("exportSt").disabled=true;
}
function stRender(){
 const tbody=$("stRows");tbody.replaceChildren();
 const fields=["point1","point2","point6","point7","point8","point9","point10","point11","point14","point15","point16"];
 for(const row of stDraft){
  const tr=document.createElement("tr");
  for(const field of fields){
   const td=document.createElement("td");
   const v=row[field];
   td.textContent=field==="point9"?(v?"Sì":"No"):["point2","point6","point7","point8","point16"].includes(field)?(v===null?"Da attribuire":f24Euro(v)):String(v??"");
   tr.append(td);
  }
  const td=document.createElement("td"),button=document.createElement("button");
  button.textContent="Modifica";button.addEventListener("click",()=>stEdit(row));
  td.append(button);tr.append(td);tbody.append(tr);
 }
 const issues=stDraft.flatMap((r,i)=>validateStRow(r).map(s=>"Rigo "+(i+1)+": "+s));
 $("stStatus").textContent=stDraft.length+" righi provvisori. "+(issues.length?issues.length+" verifiche necessarie: "+issues.slice(0,3).join("; "):"Controlli formali superati; verifica fiscale necessaria.");
 $("exportSt").disabled=!stDraft.length||issues.length>0||!$("stConfirm").checked;
}
function stEdit(row){
 const fields=[["point1","Periodo MM/AAAA"],["point2","Ritenute operate €"],["point6","Crediti punto 6 €"],["point7","Versamento punto 7 €"],["point8","Interessi punto 8 €"],["point9","Ravvedimento (S/N)"],["point10","Note punto 10"],["point11","Codice tributo"],["point14","Data versamento"],["point15","Sospensione punto 15"],["point16","Importo sospeso punto 16 €"]];
 const changed={...row};
 for(const [key,label] of fields){
  const initial=["point2","point6","point7","point8","point16"].includes(key)?(changed[key]===null?"":(changed[key]/100).toFixed(2)):key==="point9"?(changed[key]?"S":"N"):String(changed[key]??"");
  const value=prompt(label,initial);
  if(value===null)return;
  if(["point2","point6","point7","point8"].includes(key)){
   if(key==="point2"&&!value.trim()){changed[key]=null;continue}
   if(!/^[0-9]+(?:[.,][0-9]{1,2})?$/.test(value.trim())){alert("Importo non valido");return}
   changed[key]=Math.round(Number(value.replace(",","."))*100);
  }else if(key==="point9")changed[key]=value.trim().toUpperCase()==="S";
  else changed[key]=value.trim();
 }
 Object.assign(row,changed,{reviewed:true});
 stInvalidate();stRender();
}
$("f24review").addEventListener("change",()=>{
 $("stSection").hidden=!$("f24review").checked;
 if(!$("f24review").checked)stInvalidate();
});
$("makeSt").addEventListener("click",()=>{
 if(!$("f24review").checked){alert("Conferma prima la presa visione delle differenze F24.");return}
 const result=buildStDraft(ledgerRows,[...f24Rows,...f24Manual],$("year").value,{hasAggregatedCuCorrections:overrides.size>0});
 stDraft=result.rows;stInvalidate();stRender();
 if(result.warnings.length)$("stStatus").textContent+=" "+result.warnings.join(" ");
});
$("addSt").addEventListener("click",()=>{
 stDraft.push({id:"manual-"+Date.now(),point1:"01/"+$("year").value,point2:null,point6:0,point7:0,point8:0,point9:false,point10:"",point11:"1040",point14:"",point15:"",point16:0,origin:"MANUALE"});
 stInvalidate();stRender();
});
$("stConfirm").addEventListener("change",stRender);
$("exportSt").addEventListener("click",()=>{
 const fields=["point1","point2","point6","point7","point8","point9","point10","point11","point14"];
 const csv=[["ST1 Periodo","ST2 Ritenute","ST6 Crediti","ST7 Versato","ST8 Interessi","ST9 Ravvedimento","ST10 Note","ST11 Tributo","ST14 Data","ST15 Sospensione","ST16 Importo sospeso"].join(";"),
 ...stDraft.map(row=>fields.map(field=>["point2","point6","point7","point8"].includes(field)?(row[field]===null?"":f24Euro(row[field])):field==="point9"?(row[field]?"1":"0"):row[field]).join(";"))].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="770-ST-provvisorio.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
