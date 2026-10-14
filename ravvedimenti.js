"use strict";
// Classificazione conservativa: 8948 sanzione su ritenute lavoro autonomo.
// Le righe 1040 di importo minimo NON sono classificate automaticamente come interessi.
export function classifyF24(rows){
 return rows.map((r,i)=>({...r,kind:r.code==="8948"?"sanzione":"tributo_o_altro",rowId:i}));
}
export function ravvedimentoGroups(rows,year){
 const relevant=classifyF24(rows).filter(r=>r.year===String(year)&&["1040","8948"].includes(r.code));
 const groups=new Map();
 for(const r of relevant){
  const key=[r.date,r.period,r.year].join("|");
  if(!groups.has(key))groups.set(key,{key,date:r.date,period:r.period,year:r.year,tributo:0,sanzione:0,rows:[]});
  const g=groups.get(key);
  if(r.code==="1040")g.tributo+=r.debit;
  if(r.code==="8948")g.sanzione+=r.debit;
  g.rows.push(r);
 }
 return [...groups.values()];
}
