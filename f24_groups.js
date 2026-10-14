"use strict";
import {canonicalPaymentDate} from "./st_draft.js";
// Operational grouping of AdE rows: a blank printed date inherits the last date.
// A group can include tax, penalties and interest components. Never duplicate the tax.
export function paymentGroups(rows,year){
 const groups=new Map();
 for(const r of rows){
  if(r.excluded||r.year!==String(year))continue;
  const date=canonicalPaymentDate(r.date);
  if(!date||!r.month)continue;
  const key=[date,r.month,r.year].join("|");
  if(!groups.has(key))groups.set(key,{key,date,month:r.month,year:r.year,tax:0,penalty:0,other:0,items:[],taxCodes:new Set()});
  const g=groups.get(key);
  g.items.push(r);
  if(r.code==="8948")g.penalty+=r.debit;
  else if(r.code==="1040"){g.tax+=r.debit;g.taxCodes.add(r.code)}
  else g.other+=r.debit;
 }
 return [...groups.values()].map(g=>({...g,taxCodes:[...g.taxCodes]}));
}
export function paymentGroupSummary(rows,year){
 const groups=paymentGroups(rows,year);
 return groups.filter(g=>g.taxCodes.length||g.penalty).map(g=>({
  ...g,possibleInterest:g.penalty>0&&g.items.filter(r=>r.code==="1040").length>1
   ?Math.min(...g.items.filter(r=>r.code==="1040").map(r=>r.debit)):0
 }));
}
