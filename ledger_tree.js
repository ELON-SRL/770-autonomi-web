"use strict";
export function normalizeMonth(date){
 const m=String(date||"").match(/^\d{1,2}\/(\d{1,2})\/(\d{2}|20\d{2})$/);
 return m?m[1].padStart(2,"0")+"/"+(m[2].length===2?"20"+m[2]:m[2]):null;
}
export function newLedgerState(rows){
 return rows.map((r,i)=>({
  id:"ledger-"+i,source:{...r},name:r.name,code:r.code,date:r.date,
  period:normalizeMonth(r.date),amount:r.amount,excluded:false,edited:false
 }));
}
export function activeLedger(rows){
 return rows.filter(r=>!r.excluded).map(r=>{
  const [month,year]=(r.period||"").split("/");
  return {name:r.name,code:r.code,date:"01/"+month+"/"+year.slice(-2),amount:r.amount,
   period:r.period,id:r.id,source:r.source};
 });
}
export function ledgerSummary(rows){
 const map=new Map();
 for(const r of rows.filter(x=>!x.excluded)){
  const key=[r.code,r.period].join("|");
  if(!map.has(key))map.set(key,{key,code:r.code,period:r.period,amount:0,count:0});
  const g=map.get(key);g.amount+=r.amount;g.count++;
 }
 return [...map.values()].sort((a,b)=>a.period.localeCompare(b.period)||a.code.localeCompare(b.code));
}
export function validateLedger(r){
 const errors=[];
 if(!String(r.name).trim())errors.push("Percipiente");
 if(!/^\d{4}$/.test(r.code))errors.push("Codice tributo");
 if(!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(r.period))errors.push("Periodo");
 if(!Number.isSafeInteger(r.amount)||r.amount<0)errors.push("Importo");
 return errors;
}
