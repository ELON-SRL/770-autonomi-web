"use strict";
// Browser-only F24 reconciliation; amounts are integer cents.
export const cents = value => {
 const s=String(value).trim().replace(/\s/g,"");
 if(!/^-?[\d.]+,\d{1,2}$/.test(s) && !/^-?\d+(?:\.\d{1,2})?$/.test(s))return NaN;
 return Math.round(Number(s.includes(",")?s.replace(/\./g,"").replace(",","."):s)*100);
};
export const euro = n => (n/100).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
export function parseF24(lines){
 const out=[], rejected=[];
 // Supports flattened PDF text rows with date, tax code, reference month/year, debit and credit.
 // Does NOT treat summary totals as payment rows.
 for(const line of lines){
  if(/totale|riepilogo/i.test(line))continue;
  const date=line.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  const code=line.match(/\b(\d{4})\b/g);
  if(!date||!code)continue;
  const start=line.indexOf(date[0])+date[0].length;
  const tail=line.slice(start);
  const m=tail.match(/\b(\d{4})\b[\s\S]*?\b(0?[1-9]|1[0-2])\s+(20\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/);
  if(!m){if(/1040|1038|1019/.test(line))rejected.push(line);continue}
  const debit=cents(m[4]),credit=cents(m[5]);
  if(!Number.isFinite(debit)||!Number.isFinite(credit))continue;
  out.push({date:date[1],code:m[1],month:m[2].padStart(2,"0"),year:m[3],debit,credit,source:"PDF",line});
 }
 return {rows:out,rejected};
}
export function expectedByPeriod(ledger,year){
 const map=new Map();
 for(const r of ledger){
  const p=r.date.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if(!p||"20"+p[3]!==String(year))continue;
  const key=[r.code,p[2],String(year)].join("|");
  map.set(key,(map.get(key)||0)+r.amount);
 }
 return map;
}
export function reconcile(ledger, f24, year){
 const expected=expectedByPeriod(ledger,year),paid=new Map(),detail=new Map();
 for(const row of f24){
  if(row.year!==String(year))continue;
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
