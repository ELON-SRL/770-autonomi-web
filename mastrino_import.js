"use strict";
const amount=s=>Math.round(Number(s.replace(/\./g,"").replace(",","."))*100);
const datePattern=/^\s*(\d{2}\/\d{2}\/\d{2})\s+(FR|PG)\s+(.*)$/;
const euro=/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g;
export function parseMastrino(lines,year="2025"){
 const invoices=new Map(),payments=[];
 for(const line of lines){
  const m=line.match(datePattern);if(!m)continue;
  const [_,date,type,rest]=m;
  if(type==="FR"){
   if(!date.endsWith("/"+year.slice(-2)))continue;
   const doc=rest.match(/^\s*(\d+)\s+(\d{2}\/\d{2}\/\d{2})\s+FATT\.\s*RICEV\./);
   if(!doc)continue;
   const after=rest.slice(doc[0].length),amounts=[...after.matchAll(euro)].map(x=>amount(x[0]));
   if(!amounts.length)continue;
   const key=doc[1]+"|"+doc[2];
   if(!invoices.has(key))invoices.set(key,{number:doc[1],invoiceDate:doc[2],entries:[]});
   invoices.get(key).entries.push(amounts[0]);
  }else if(type==="PG"&&date.endsWith("/"+year.slice(-2))){
   const a=[...rest.matchAll(euro)];
   if(a.length)payments.push({date,amount:amount(a[0][0]),description:rest.slice(0,a[0].index).trim()});
  }
 }
 const candidates=[...invoices.values()].filter(x=>x.entries.length===2).map(x=>{
  const gross=Math.max(...x.entries),withholding=Math.min(...x.entries);
  return {...x,gross,withholding,net:gross-withholding};
 });
 return {candidates,payments};
}
const norm=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
export function compareMastrino(parsed,ledger,recipient){
 const relevant=ledger.filter(r=>!r.excluded&&norm(r.name)===norm(recipient));
 return parsed.candidates.map(inv=>{
  const exact=relevant.filter(r=>norm(r.document)===norm(inv.number)&&r.amount===inv.withholding&&(!r.invoiceDate||r.invoiceDate===inv.invoiceDate));
  const sameAmount=relevant.filter(r=>r.amount===inv.withholding);
  const matchingPayments=parsed.payments.filter(p=>p.amount===inv.net);
  const status=exact.length?"present":sameAmount.length?"uncertain":matchingPayments.length?"candidate":"unmatched";
  return {...inv,status,payments:matchingPayments,existing:exact.length?exact:sameAmount};
 });
}
