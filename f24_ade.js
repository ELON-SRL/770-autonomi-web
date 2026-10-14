"use strict";
// Agenzia delle Entrate "Versamenti effettuati": parser per colonne PDF.
// I dati restano nel browser. Non interpreta la stampa come quietanza.
export function moneyCents(raw){
 const s=String(raw).trim().replace(/\s/g,"");
 if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(s))return NaN;
 const [whole,fraction=""]=s.replace(/\./g,"").split(",");
 return Number(whole)*100+Number((fraction+"00").slice(0,2))*(whole.startsWith("-")?-1:1);
}
export const euro=n=>(n/100).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
const dateRx=/^\d{1,2}\/\d{1,2}\/20\d{2}$/;
function column(items,lo,hi){return items.filter(t=>t.x>=lo&&t.x<hi).map(t=>t.text).join("").trim()}
export function parseF24Pages(pages){
 const rows=[],rejected=[],seenSourceRows=new Set();
 let lastDate=null;
 pages.forEach((page,pageIndex)=>{
  // PDF.js item coordinates: transform[5] increases upwards.
  const groups=[];
  for(const token of page){
   if(!token.text?.trim())continue;
   let group=groups.find(g=>Math.abs(g.y-token.y)<2);
   if(!group){group={y:token.y,tokens:[]};groups.push(group)}
   group.tokens.push(token);
  }
  groups.sort((a,b)=>b.y-a.y);
  for(const group of groups){
   const ts=group.tokens.sort((a,b)=>a.x-b.x);
   const date=column(ts,35,112);
   const explicitDate=dateRx.test(date);
   if(explicitDate)lastDate=date;
   const code=column(ts,115,151);
   if(!/^\d{4}$/.test(code))continue;
   const reference=column(ts,377,420);
   const period=column(ts,320,375);
   const debit=column(ts,422,500),credit=column(ts,505,560);
   if(!/^20\d{2}$/.test(reference)||!lastDate||!debit){
    rejected.push({page:pageIndex+1,code,reason:"Colonne incomplete"});continue;
   }
   const value=moneyCents(debit),creditValue=moneyCents(credit||"0");
   if(!Number.isFinite(value)||!Number.isFinite(creditValue)){
    rejected.push({page:pageIndex+1,code,reason:"Importo non riconosciuto"});continue;
   }
   const month=/^(0?[1-9]|1[0-2])$/.test(period)?period.padStart(2,"0"):null;
   // Duplicated PDF text fragments at the same source position are not additional payments.
   // Never deduplicate by date, tax code and amount: distinct F24 rows may coincide.
   const sourceRowId=(pageIndex+1)+":"+group.y.toFixed(2)+":"+code;
   if(seenSourceRows.has(sourceRowId))continue;
   seenSourceRows.add(sourceRowId);
   rows.push({date:lastDate,dateInherited:!explicitDate,code,month,period,year:reference,debit:value,credit:creditValue,source:"PDF AdE",page:pageIndex+1,sourceRowId});
  }
 });
 return {rows,rejected};
}
export function expectedByPeriod(ledger,year){
 const map=new Map();
 for(const row of ledger){
  const m=row.date.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if(!m||"20"+m[3]!==String(year))continue;
  const key=[row.code,m[2],String(year)].join("|");
  map.set(key,(map.get(key)||0)+row.amount);
 }
 return map;
}
export function reconcile(ledger,payments,year){
 const expected=expectedByPeriod(ledger,year),paid=new Map(),detail=new Map();
 for(const row of payments){
  if(row.year!==String(year)||!row.month||!ledger.some(item=>item.code===row.code))continue;
  const key=[row.code,row.month,row.year].join("|");
  paid.set(key,(paid.get(key)||0)+row.debit);
  if(!detail.has(key))detail.set(key,[]);
  detail.get(key).push(row);
 }
 return [...new Set([...expected.keys(),...paid.keys()])].sort().map(key=>{
  const [code,month,refYear]=key.split("|");
  return {key,code,month,year:refYear,expected:expected.get(key)||0,paid:paid.get(key)||0,difference:(paid.get(key)||0)-(expected.get(key)||0),payments:detail.get(key)||[]};
 });
}
