"use strict";
import {cloneF24,usableF24,validateF24Change,parseEuros} from "./movement_edits.js";
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
 if(id==="f24"){$("f24status").textContent="Nuovo listato selezionato. Premi Leggi listato F24 per sostituire il precedente.";return}
 if($("ledger").files.length&&$("cu").files.length)$("check").click();
});}
const money=n=>Number(n).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
const cents=s=>Math.round(Number(String(s).replace(/\./g,"").replace(",","."))*100);
const display=n=>money(n/100);
const normalize=s=>String(s).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
let original=[],overrides=new Map(),parseIssues=[],ledgerRows=[],f24Rows=[],f24Manual=[],interestOverrides=new Map(),stDraft=[],editingCu=null,editingF24=null;
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
function effective(row){return {...row,...(overrides.get(row.name)||{})}}
function render(){
 const rows=original.map(row=>({...effective(row),key:row.name})),tbody=$("results");tbody.replaceChildren();
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
   tr.children[3].textContent="Calcolata";
   btn.textContent="Conferma";btn.addEventListener("click",()=>{
    const name=normalize(inputs.name.value),ledger=cents(inputs.ledger.value),cu=cents(inputs.cu.value);
    if(!name||!Number.isSafeInteger(ledger)||!Number.isSafeInteger(cu)||ledger<0||cu<0){$("status").textContent="Controlla nominativo e importi.";return}
    overrides.set(r.key,{name,ledger,cu});editingCu=null;$("review").checked=false;render();
   });
   const cancel=document.createElement("button");cancel.textContent="Annulla";cancel.className="secondary";
   cancel.addEventListener("click",()=>{editingCu=null;render()});td.append(btn,cancel);
  }else{
   btn.textContent="Modifica";btn.addEventListener("click",()=>{editingCu=r.key;render()});td.append(btn);
  }
  tr.append(td);tbody.append(tr);
 }
 const total=rows.reduce((s,r)=>s+r.ledger-r.cu,0);
 const nonzero=rows.filter(r=>r.ledger!==r.cu).length;
 $("summary").textContent=`Percipienti: ${rows.length} · Differenze: ${nonzero} · Scostamento gestionale - CU: ${display(total)} €`;
 $("review").disabled=!rows.length||nonzero>0;
 if(nonzero)$("review").checked=false;
 $("next").disabled=nonzero>0||!$("review").checked;
 $("reset").disabled=!overrides.size;$("export").disabled=!rows.length;
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
 const rows=original.map(row=>({...effective(row),key:row.name}));
 const csv=["Percipiente;Ritenuta gestionale;Ritenuta CU;Differenza;Rettificata",...rows.map(r=>[r.name,display(r.ledger),display(r.cu),display(r.ledger-r.cu),overrides.has(r.key)?"SI":"NO"].join(";"))].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="770-controllo-cu.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

function renderF24Movements(){
 const body=$("f24movements");body.replaceChildren();
 for(const row of [...f24Rows,...f24Manual]){
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
   const exclude=document.createElement("button");exclude.className="secondary";
   exclude.textContent=row.excluded?"Ripristina":"Escludi";
   exclude.addEventListener("click",()=>{
    row.excluded=!row.excluded;row.edited=true;invalidateAfterF24Change();f24Render();
   });actions.append(exclude);
  }
  tr.append(actions);body.append(tr);
 }
}
function invalidateAfterF24Change(){
 $("f24review").checked=false;$("stSection").hidden=true;
 stDraft=[];stInvalidate();
 $("f24status").textContent="Movimenti modificati. Riconciliazione ricalcolata; quadro ST precedente invalidato.";
}
function f24Render(){
 renderF24Movements();
 const tbody=$("f24rows");tbody.replaceChildren();
 const year=$("year").value,rows=reconcile(ledgerRows,usableF24([...f24Rows,...f24Manual]),year);
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
  // La sostituzione è atomica: nessun dato precedente viene modificato se l'utente annulla.
  const previous=f24Rows;
  if(previous.length&&!confirm("Sostituire i movimenti importati dal PDF precedente? Gli F24 inseriti manualmente saranno conservati. Le rettifiche sulle righe importate saranno reimpostate."))return;
  const fresh=cloneF24(parsed.rows);
  const key=r=>[r.date,r.code,r.month??r.period,r.year,r.debit,r.credit].join("|");
  const counts=new Map();
  for(const row of fresh){const k=key(row);counts.set(k,(counts.get(k)||0)+1)}
  const manualKeys=new Set(f24Manual.filter(r=>!r.excluded).map(r=>key(r)));
  const overlap=[...manualKeys].filter(k=>counts.has(k)).length;
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
let manualSequence=0;
$("addf24").addEventListener("click",()=>{
 const year=$("year").value;
 const row={uid:"manual-"+(++manualSequence),code:"1040",month:"01",year,assignedMonth:"01",assignedYear:year,
 date:"",debit:0,credit:0,source:"MANUALE",excluded:false,edited:true,
 original:{date:"",code:"1040",month:"01",year,debit:0,credit:0}};
 f24Manual.push(row);editingF24=row.uid;invalidateAfterF24Change();f24Render();
 $("f24status").textContent="Nuovo F24: compila i campi della riga e premi Conferma.";
});
$("replacef24").addEventListener("click",()=>{
 $("f24").click();
});
$("exportf24").addEventListener("click",()=>{
 const rows=reconcile(ledgerRows,usableF24([...f24Rows,...f24Manual]),$("year").value);
 const csv=["Tributo;Periodo;Ritenute;Versato;Differenza lorda;Interessi ipotizzati;Residuo;Numero F24",...rows.map(r=>{const interest=interestOverrides.has(r.key)?interestOverrides.get(r.key):Math.max(0,r.difference);return [r.code,r.month+"/"+r.year,f24Euro(r.expected),f24Euro(r.paid),f24Euro(r.difference),f24Euro(interest),f24Euro(r.difference-interest),r.payments.length].join(";")})].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="770-quadratura-f24.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

function stInvalidate(){
 $("stConfirm").checked=false;$("exportSt").disabled=true;
 $("printSt").disabled=true;$("stPrint").hidden=true;
}
const stFields=["point1","point2","point6","point7","point8","point9","point10","point11","point14","point15","point16"];
const stMoney=new Set(["point2","point6","point7","point8","point16"]);
let editingSt=null;
function stRender(){
 const tbody=$("stRows");tbody.replaceChildren();
 for(const row of stDraft){
  const tr=document.createElement("tr"),active=editingSt===row.id,inputs={};
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
  tr.append(actions);tbody.append(tr);
 }
 const issues=stDraft.flatMap((r,i)=>validateStRow(r).map(s=>"Rigo "+(i+1)+": "+s));
 $("stStatus").textContent=stDraft.length+" righi provvisori. "+(issues.length?issues.length+" verifiche necessarie: "+issues.slice(0,3).join("; "):"Controlli formali superati; verifica fiscale necessaria.");
 $("exportSt").disabled=!stDraft.length||issues.length>0||editingSt!==null||!$("stConfirm").checked;
 $("printControls").hidden=!stDraft.length;
}
$("f24review").addEventListener("change",()=>{
 $("stSection").hidden=!$("f24review").checked;
 if(!$("f24review").checked)stInvalidate();
});
$("makeSt").addEventListener("click",()=>{
 if(!$("f24review").checked){alert("Conferma prima la presa visione delle differenze F24.");return}
 const result=buildStDraft(ledgerRows,usableF24([...f24Rows,...f24Manual]),$("year").value,{hasAggregatedCuCorrections:overrides.size>0});
 stDraft=result.rows;editingSt=null;stInvalidate();stRender();
 if(result.warnings.length)$("stStatus").textContent+=" "+result.warnings.join(" ");
});
$("addSt").addEventListener("click",()=>{
 stDraft.push({id:"manual-"+Date.now(),point1:"01/"+$("year").value,point2:null,point6:0,point7:0,point8:0,point9:false,point10:"",point11:"1040",point14:"",point15:"",point16:0,origin:"MANUALE"});
 editingSt=stDraft[stDraft.length-1].id;stInvalidate();stRender();
});
$("stConfirm").addEventListener("change",stRender);
$("exportSt").addEventListener("click",()=>{
 const fields=["point1","point2","point6","point7","point8","point9","point10","point11","point14","point15","point16"];
 const csv=[["ST1 Periodo","ST2 Ritenute","ST6 Crediti","ST7 Versato","ST8 Interessi","ST9 Ravvedimento","ST10 Note","ST11 Tributo","ST14 Data","ST15 Sospensione","ST16 Importo sospeso"].join(";"),
 ...stDraft.map(row=>fields.map(field=>["point2","point6","point7","point8","point16"].includes(field)?(row[field]===null?"":f24Euro(row[field])):field==="point9"?(row[field]?"1":"0"):row[field]).join(";"))].join("\r\n");
 const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="770-ST-provvisorio.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});

const stPrintFields=[
 ["point1","1 Periodo"],["point2","2 Ritenute operate"],["point6","6 Crediti utilizzati"],
 ["point7","7 Importo versato"],["point8","8 Interessi"],["point9","9 Ravvedimento"],
 ["point10","10 Note"],["point11","11 Codice tributo"],["point14","14 Data versamento"],
 ["point15","15 Sospensione"],["point16","16 Importo sospeso"]
];
function printCell(value){const cell=document.createElement("td");cell.textContent=String(value??"");return cell}
function prepareStPrint(){
 if(!stDraft.length){$("printStatus").textContent="Nessun quadro ST disponibile.";return}
 if(!$("stConfirm").checked){$("printStatus").textContent="Conferma prima la revisione del quadro ST.";return}
 const errors=stDraft.flatMap((r,i)=>validateStRow(r).map(e=>"Rigo "+(i+1)+": "+e));
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
 for(let start=0;start<stDraft.length;start+=perPage){
  const sheet=document.createElement("div");sheet.className="st-sheet";
  const table=document.createElement("table");table.className="st-print-table";
  const thead=document.createElement("thead"),headrow=document.createElement("tr");
  for(const [,label] of stPrintFields){const th=document.createElement("th");th.textContent=label;headrow.append(th)}
  thead.append(headrow);table.append(thead);
  const tbody=document.createElement("tbody");
  for(const row of stDraft.slice(start,start+perPage)){
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
  foot.textContent="Quadro ST · Pagina "+(Math.floor(start/perPage)+1)+" di "+Math.ceil(stDraft.length/perPage)+" · Prospetto non ministeriale";
  sheet.append(foot);target.append(sheet);
 }
 target.hidden=false;$("printSt").disabled=false;
 $("printStatus").textContent="Anteprima pronta: "+stDraft.length+" righi, "+Math.ceil(stDraft.length/perPage)+" pagine. Usa Stampa / Salva PDF.";
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
 const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="770-movimenti-F24-rettifiche.csv";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
});
