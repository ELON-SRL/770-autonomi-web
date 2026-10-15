"use strict";
export function normalizeRecipient(value){
 return String(value||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\b(DOTT|DOTTSSA|DOTTORE|DOTTOR)\.?\s*/g,"").replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
}
export function parseCuAll(lines){
 const rows=[];let current=null,status="non specificato";
 for(const line of lines){
  const person=line.match(/Percipiente:\s*[\d.]+\s+(.+)/i);
  if(person){current=normalizeRecipient(person[1]);status="non specificato";continue}
  if(!current)continue;
  if(/Certificazione non inviata/i.test(line)){status="non inviata";continue}
  if(/Protocollo invio:/i.test(line)){status=/Esito:\s*Accolta/i.test(line)?"accolta":"inviata";continue}
  const fields=line.split("|").map(s=>s.trim());
  if(fields.length<7)continue;
  const amount=fields[6];
  if(!/^\d[\d.]*,\d{2}$/.test(amount))continue;
  if(!/^[A-Z0-9]?$/.test(fields[1]))continue;
  const cents=Number(amount.replace(/\./g,"").replace(",",""));
  if(!Number.isSafeInteger(cents))continue;
  rows.push({name:current,causale:fields[1],amount:cents,status});
 }
 return rows;
}
export function reconcileNames(ledger,cu){
 const cuNames=[...new Set(cu.map(x=>normalizeRecipient(x.name)))];
 const resolved=new Map();
 for(const name of new Set(ledger.map(x=>normalizeRecipient(x.name)))){
  if(cuNames.includes(name)){resolved.set(name,name);continue}
  const candidates=cuNames.filter(other=>other.startsWith(name+" ")||name.startsWith(other+" ")||other.startsWith(name)||name.startsWith(other));
  if(candidates.length===1)resolved.set(name,candidates[0]);
 }
 return {resolved,unmatched:[...new Set(ledger.map(x=>normalizeRecipient(x.name)))].filter(x=>!resolved.has(x))};
}
