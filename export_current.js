"use strict";
export function buildCurrentCuRows(original,ledgerState,overrides,year,normalizer){
 const totals=new Map();
 for(const row of ledgerState){
  if(row.excluded||!String(row.period||"").endsWith("/"+year))continue;
  const key=normalizer(row.name);
  totals.set(key,(totals.get(key)||0)+row.amount);
 }
 const result=original.map(row=>{
  const changed=overrides.get(row.name)||{};
  return {...row,...changed,key:row.name,ledger:totals.get(normalizer(row.name))||0};
 });
 const existing=new Set(original.map(row=>normalizer(row.name)));
 for(const [name,amount] of totals){
  if(!existing.has(name))result.push({name,key:name,ledger:amount,cu:0,manual:true});
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name,"it"));
}
export function uniqueExportName(prefix,revision,now=new Date()){
 const date=now.toISOString().replace(/[:.]/g,"-");
 return prefix+"-rev"+revision+"-"+date+".csv";
}
