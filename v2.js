"use strict";
import * as pdfjs from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
import {parseF24Pages} from "./f24_ade.js";
import {summaries,changeSummary,excludeSummary} from "./summary_editor.js";
import {buildStDraft,validateStRow} from "./st_draft.js";
import {taxId,identify} from "./identita.js";
pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const $=id=>document.getElementById(id), fmt=n=>(n/100).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
const parseAmount=s=>{const v=String(s).trim().replace(/\./g,"").replace(",",".");return /^\d+(?:\.\d{1,2})?$/.test(v)?Math.round(Number(v)*100):NaN};
const period=s=>/^(0[1-9]|1[0-2])\/20\d{2}$/.test(s);
const norm=s=>String(s||"").trim().toUpperCase().replace(/\s+/g," ");
let state={withholdings:[],payments:[],cu:[],st:[],year:"2025",taxpayer:""},baseline=null,editing=null,seq=0;
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=()=> "m"+(++seq);
const datePeriod=s=>{const m=String(s).match(/^\d{1,2}\/(\d{1,2})\/(\d{2}|20\d{2})$/);return m?m[1].padStart(2,"0")+"/"+(m[2].length===2?"20"+m[2]:m[2]):""};
async function pdf(file,firstOnly=false){
 const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const pages=[],lines=[];
 for(let p=1;p<=(firstOnly?1:doc.numPages);p++){
  const content=await(await doc.getPage(p)).getTextContent();
  const items=content.items.filter(x=>x.str?.trim()).map(x=>({text:x.str,x:x.transform[4],y:x.transform[5]}));
  pages.push(items);
  const grouped=new Map();
  for(const t of items){const y=Math.round(t.y/2)*2;if(!grouped.has(y))grouped.set(y,[]);grouped.get(y).push(t)}
  for(const [,ts] of [...grouped].sort((a,b)=>b[0]-a[0]))lines.push(ts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(" ").replace(/\s+/g," ").trim());
 }
 return {pages,lines};
}
function parseLedger(lines){
 const result=[];
 const re=/^\s*(\S+)\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(\d{4})\s+([\d.,]+)\*?\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+#?(\d{2}\/\d{2}\/\d{2})\s+([\d.,]+)\s+([\d.,]+)/;
 for(const line of lines){
  const m=line.match(re);if(!m)continue;
  const amount=parseAmount(m[11]);if(!Number.isFinite(amount))continue;
  result.push({id:uid(),name:norm(m[3]),code:m[4],period:datePeriod(m[9]),amount,excluded:false,source:"Gestionale"});
 }
 return result;
}
function parseCU(lines){
 const rows=[];let name="";
 for(const line of lines){
  const person=line.match(/Percipiente:\s*[\d.]+\s+(.+)/i);if(person){name=norm(person[1]);continue}
  const m=line.match(/\|\s*([A-Z0-9])\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)/);
  if(name&&m){rows.push({name,amount:parseAmount(m[6])});name=""}
 }
 return rows;
}
function invalidate(){state.st=[];$("stApproved").checked=false;renderSt()}
function download(name,text,type){const b=new Blob([text],{type}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function field(value,type="text"){const el=document.createElement("input");el.type=type;el.className="inline-field";if(type==="checkbox")el.checked=!!value;else el.value=value??"";return el}
function actions(row,collection,inputs,fields,validator){
 const td=document.createElement("td");
 const button=(label,fn)=>{const b=document.createElement("button");b.textContent=label;b.onclick=fn;td.append(b)};
 if(editing===row.id){
  button("Conferma",()=>{
   const proposed={...row};
   for(const f of fields){
    if(f==="excluded"||f==="source"||f==="originalPeriod")continue;
    proposed[f]=f==="amount"||f==="debit"||f==="credit"||["point2","point6","point7","point8"].includes(f)
      ?parseAmount(inputs[f].value):f==="point9"?inputs[f].checked:inputs[f].value.trim();
   }
   const error=validator(proposed);
   if(error){$("balanceStatus").textContent=error;return}
   Object.assign(row,proposed);editing=null;
   if(collection!=="st")invalidate();else $("stApproved").checked=false;
   render();
  });
  button("Annulla",()=>{editing=null;render()});
 }else{
  button("Modifica",()=>{editing=row.id;render()});
  button(row.excluded?"Ripristina":"Elimina",()=>{
   row.excluded=!row.excluded;editing=null;
   if(collection!=="st")invalidate();else $("stApproved").checked=false;
   render();
  });
 }
 return td;
}
function renderRows(target,rows,collection,fields,formatter,validator){
 const body=$(target);body.replaceChildren();
 for(const row of rows){
  const tr=document.createElement("tr"),active=editing===row.id,inputs={};
  if(row.excluded)tr.className="excluded-row";
  for(const f of fields){
   const td=document.createElement("td");
   if(active&&f!=="originalPeriod"&&f!=="source"){
    const v=formatter(row,f);
    inputs[f]=field(f==="point9"?row[f]:v,f==="point9"?"checkbox":"text");td.append(inputs[f]);
   }else td.textContent=formatter(row,f);
   tr.append(td);
  }
  tr.append(actions(row,collection,inputs,fields,validator));body.append(tr);
 }
}
const amountFields=new Set(["amount","debit","credit","point2","point6","point7","point8"]);
const view=(r,f)=>f==="originalPeriod"?(r.original?.period||r.period):amountFields.has(f)?fmt(r[f]??0):f==="point9"?(r[f]?"Sì":"No"):r[f]??"";
const validW=r=>!r.name||!/^\d{4}$/.test(r.code)||!period(r.period)||!Number.isSafeInteger(r.amount)?"Controlla percipiente, codice, periodo e importo.":"";
const validP=r=>!/^\d{1,2}\/\d{1,2}\/20\d{2}$/.test(r.date)||!/^\d{4}$/.test(r.code)||!period(r.period)||!Number.isSafeInteger(r.debit)||!Number.isSafeInteger(r.credit)?"Controlla data, tributo, periodo e importi.":"";
const validS=r=>{const errors=validateStRow(r);return errors.join("; ")};
let editingBalance=null;
function balance(){return summaries(state.withholdings,state.payments)}
function renderBalance(){
 const body=$("balanceRows");body.replaceChildren();
 const rows=balance();
 for(const r of rows){
  const tr=document.createElement("tr"),active=editingBalance===r.key,inputs={};
  const vals={code:r.code,period:r.period,withheld:fmt(r.withheld),paid:fmt(r.paid)};
  for(const key of ["code","period","withheld","paid"]){
   const td=document.createElement("td");
   if(active){const input=field(vals[key]);input.className="inline-field";inputs[key]=input;td.append(input)}
   else td.textContent=vals[key];
   tr.append(td);
  }
  const result=document.createElement("td");
  result.textContent=active?"In modifica":r.withheld===r.paid?"Quadrato":!r.withheld?"F24 da attribuire":!r.paid?"Ritenuta non versata":"Differenza "+fmt(r.paid-r.withheld);
  tr.append(result);
  const actions=document.createElement("td");
  const addButton=(label,callback)=>{
   const button=document.createElement("button");button.textContent=label;button.onclick=callback;actions.append(button);
  };
  if(active){
   addButton("Conferma",()=>{
    const proposed={code:inputs.code.value.trim(),period:inputs.period.value.trim(),withheld:parseAmount(inputs.withheld.value),paid:parseAmount(inputs.paid.value)};
    const result=changeSummary(state,r.key,proposed);
    if(!result.ok){$("balanceStatus").textContent=result.error;return}
    editingBalance=null;invalidate();render();
   });
   addButton("Annulla",()=>{editingBalance=null;render()});
  }else{
   addButton("Modifica",()=>{editingBalance=r.key;render()});
   addButton("Elimina",()=>{
    excludeSummary(state,r.key);editingBalance=null;invalidate();render();
   });
   if([...state.withholdings,...state.payments].some(x=>x.excluded&&x.code+"|"+x.period===r.key)){
    addButton("Ripristina",()=>{
     for(const item of [...state.withholdings,...state.payments])if(item.code+"|"+item.period===r.key)item.excluded=false;
     invalidate();render();
    });
   }
  }
  tr.append(actions);body.append(tr);
 }
 const activeKeys=new Set(rows.map(r=>r.key));
 const excluded=summaries(
  state.withholdings.filter(x=>x.excluded).map(x=>({...x,excluded:false})),
  state.payments.filter(x=>x.excluded).map(x=>({...x,excluded:false}))
 ).filter(r=>!activeKeys.has(r.key));
 for(const r of excluded){
  const tr=document.createElement("tr");tr.className="excluded-row";
  for(const value of [r.code,r.period,fmt(r.withheld),fmt(r.paid),"Escluso"]){
   const td=document.createElement("td");td.textContent=value;tr.append(td);
  }
  const td=document.createElement("td"),button=document.createElement("button");
  button.textContent="Ripristina";button.onclick=()=>{
   for(const item of [...state.withholdings,...state.payments])if(item.code+"|"+item.period===r.key)item.excluded=false;
   invalidate();render();
  };
  td.append(button);tr.append(td);body.append(tr);
 }
 $("balanceStatus").textContent=rows.length+" periodi · "+rows.filter(r=>r.withheld!==r.paid).length+" con differenze. Modifica ed Elimina agiscono sui movimenti di lavoro, senza duplicarli. Per ripristinare usa il pulsante generale o Ripristina sui movimenti.";
}
function renderSt(){
 renderRows("stRows",state.st,"st",["point1","point2","point6","point7","point8","point9","point10","point11","point14"],view,validS);
 $("stStatus").textContent=state.st.filter(r=>!r.excluded).length+" righi ST attivi. Le rettifiche alla riconciliazione richiedono una nuova generazione.";
}
function render(){
 renderRows("withholdingRows",state.withholdings,"withholdings",["name","code","period","amount","source"],view,validW);
 renderRows("paymentRows",state.payments,"payments",["date","code","originalPeriod","period","debit","credit","source"],view,validP);
 renderCu();renderBalance();renderSt();
}
$("import").onclick=async()=>{
 const lf=$("ledgerFile").files[0],cf=$("cuFile").files[0],ff=$("f24File").files[0];
 if(!lf||!cf||!ff){$("importStatus").textContent="Seleziona tutti e tre i PDF.";return}
 const id=taxId($("taxpayer").value);
 if(!id){$("importStatus").textContent="Inserisci un codice fiscale/P.IVA valido.";return}
 $("import").disabled=true;$("importStatus").textContent="Importazione in corso…";
 try{
  const [l,c,f]=await Promise.all([pdf(lf),pdf(cf,true),pdf(ff)]);
  for(const [label,doc] of [["Gestionale",l],["CU",c],["F24",f]]){
   const ids=identify(doc.lines);
   if(ids.length&&!ids.includes(id))throw Error(label+": identificativo contribuente diverso");
   if(!ids.length&&!confirm(label+": codice fiscale non leggibile. Confermi il contribuente?"))throw Error("Identità non confermata");
  }
  const withholdings=parseLedger(l.lines),cu=parseCU(c.lines),f24=parseF24Pages(f.pages);
  if(!withholdings.length||!f24.rows.length)throw Error("Formato non riconosciuto. Nessun dato sostituito.");
  state={withholdings,payments:f24.rows.map(p=>({id:uid(),date:p.date,code:p.code,period:(p.month||"00")+"/"+p.year,
   original:{period:(p.month||"00")+"/"+p.year,date:p.date,code:p.code,debit:p.debit,credit:p.credit},
   debit:p.debit,credit:p.credit,source:"AdE",excluded:false})),cu,st:[],year:$("year").value,taxpayer:id};
  baseline=clone(state);editing=null;render();
  $("importStatus").textContent=withholdings.length+" ritenute; "+cu.length+" CU; "+f24.rows.length+" righe F24. Righe F24 non riconosciute: "+f24.rejected.length+". Verifica i totali.";
 }catch(e){$("importStatus").textContent="Importazione non completata: "+e.message}
 finally{$("import").disabled=false}
};
$("addWithholding").onclick=()=>{const r={id:uid(),name:"",code:"1040",period:"01/"+$("year").value,amount:0,source:"Manuale",excluded:false};state.withholdings.push(r);editing=r.id;invalidate();render()};
$("addPayment").onclick=()=>{const r={id:uid(),date:"",code:"1040",period:"01/"+$("year").value,original:null,debit:0,credit:0,source:"Manuale",excluded:false};state.payments.push(r);editing=r.id;invalidate();render()};
$("resetWork").onclick=()=>{if(!baseline)return;if(!confirm("Ripristinare tutti i dati importati? Le modifiche della sessione saranno annullate."))return;state=clone(baseline);editing=null;render()};
$("saveWork").onclick=()=>download("770-lavoro.json",JSON.stringify({version:2,state,baseline},null,2),"application/json");
$("loadWork").onchange=async e=>{try{const payload=JSON.parse(await e.target.files[0].text());if(payload.version!==2||!payload.state?.withholdings||!payload.state?.payments)throw Error("Formato non valido");state=payload.state;baseline=payload.baseline;editing=null;render()}catch(err){$("importStatus").textContent="Impossibile riprendere: "+err.message}};
$("generateSt").onclick=()=>{
 const ledger=state.withholdings.filter(r=>!r.excluded).map(r=>({...r,date:"01/"+r.period.slice(0,2)+"/"+r.period.slice(-2)}));
 const payments=state.payments.filter(r=>!r.excluded).map(r=>({...r,month:r.period.slice(0,2),year:r.period.slice(-4)}));
 const draft=buildStDraft(ledger,payments,state.year);
 state.st=draft.rows.map(r=>({...r,id:uid(),excluded:false}));
 editing=null;$("stApproved").checked=false;render();
 $("stStatus").textContent+=" "+draft.warnings.join("; ");
};
$("addSt").onclick=()=>{const r={id:uid(),point1:"01/"+state.year,point2:0,point6:0,point7:0,point8:0,point9:false,point10:"",point11:"1040",point14:"",origin:"MANUALE",excluded:false};state.st.push(r);editing=r.id;render()};
$("exportSt").onclick=()=>{
 if(!$("stApproved").checked){$("stStatus").textContent="Conferma prima la revisione ST.";return}
 const rows=state.st.filter(r=>!r.excluded),keys=["point1","point2","point6","point7","point8","point9","point10","point11","point14"];
 const csv=[keys.join(";"),...rows.map(r=>keys.map(k=>amountFields.has(k)?fmt(r[k]??0):k==="point9"?(r[k]?"1":"0"):r[k]??"").join(";"))].join("\r\n");
 download("770-ST-provvisorio.csv","\ufeff"+csv,"text/csv;charset=utf-8");
};
$("printSt").onclick=()=>{
 if(!$("stApproved").checked){$("stStatus").textContent="Conferma prima la revisione ST.";return}
 const root=$("printArea");root.replaceChildren();
 const heading=document.createElement("h2");heading.textContent="770 — Quadro ST · "+state.year+" · "+state.taxpayer;root.append(heading);
 const table=document.createElement("table"),keys=["point1","point2","point6","point7","point8","point9","point10","point11","point14"];
 const head=document.createElement("tr");for(const k of keys){const th=document.createElement("th");th.textContent="ST"+k.slice(5);head.append(th)}table.append(head);
 for(const r of state.st.filter(x=>!x.excluded)){const tr=document.createElement("tr");for(const k of keys){const td=document.createElement("td");td.textContent=amountFields.has(k)?fmt(r[k]??0):k==="point9"?(r[k]?"X":""):String(r[k]??"");tr.append(td)}table.append(tr)}
 root.append(table);root.hidden=false;window.print();
};
render();
