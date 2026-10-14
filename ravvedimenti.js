"use strict";
// Raggruppamento proposto per data e periodo; non prova identità della delega.
export function classifyF24(rows){
 return rows.map((r,i)=>({...r,kind:r.code==="8948"?"sanzione":r.code==="1040"?"ritenuta_o_interessi":"altro",rowId:i}));
}
export function ravvedimentoGroups(rows,year){
 const relevant=classifyF24(rows).filter(r=>r.year===String(year)&&["1040","8948"].includes(r.code));
 const groups=new Map();
 for(const r of relevant){
  const key=[r.date,r.period,r.year].join("|");
  if(!groups.has(key))groups.set(key,{key,date:r.date,period:r.period,year:r.year,tributo:0,sanzione:0,rows:[],possibleInterest:0});
  const g=groups.get(key);
  if(r.code==="1040")g.tributo+=r.debit;
  if(r.code==="8948")g.sanzione+=r.debit;
  g.rows.push(r);
 }
 for(const g of groups.values()){
  // In presenza di sanzione e più righe 1040, il minore importo è soltanto
  // un candidato interesse, da confermare o correggere manualmente.
  const tax=g.rows.filter(r=>r.code==="1040");
  if(g.sanzione>0&&tax.length>1){
   const candidate=[...tax].sort((a,b)=>a.debit-b.debit)[0];
   g.possibleInterest=candidate.debit;
  }
 }
 return [...groups.values()];
}
