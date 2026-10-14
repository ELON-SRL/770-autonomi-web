"use strict";
// One movement, one source. Summary rows are computed, never persisted as additional payments.
export function summaries(withholdings,payments){
 const map=new Map();
 const get=(code,period)=>{
  const key=code+"|"+period;
  if(!map.has(key))map.set(key,{key,code,period,withheld:0,paid:0,wids:[],pids:[]});
  return map.get(key);
 };
 for(const r of withholdings.filter(r=>!r.excluded)){
  const g=get(r.code,r.period);g.withheld+=r.amount;g.wids.push(r.id);
 }
 for(const r of payments.filter(r=>!r.excluded&&r.code!=="8948")){
  const g=get(r.code,r.period);g.paid+=r.debit;g.pids.push(r.id);
 }
 return [...map.values()].sort((a,b)=>a.period.localeCompare(b.period)||a.code.localeCompare(b.code));
}
export function changeSummary(state,oldKey,change){
 const rows=summaries(state.withholdings,state.payments);
 const row=rows.find(r=>r.key===oldKey);
 if(!row)return {ok:false,error:"Rigo non trovato"};
 const {code,period,withheld,paid}=change;
 if(!/^\d{4}$/.test(code)||!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(period))return {ok:false,error:"Tributo o periodo non valido"};
 if(![withheld,paid].every(v=>Number.isSafeInteger(v)&&v>=0))return {ok:false,error:"Importi non validi"};
 const w=state.withholdings.filter(x=>row.wids.includes(x.id));
 const p=state.payments.filter(x=>row.pids.includes(x.id));
 // If a side was empty, allow a new manual movement. A payment without an actual date
 // is never invented: it must be completed before it can enter ST.
 if(paid>0&&!p.length)return {ok:false,error:"Per aggiungere un F24 usa + F24 e indica la data effettiva"};
 if(withheld>0&&!w.length)return {ok:false,error:"Per aggiungere una ritenuta usa + Ritenuta"};
 const changeAmounts=(items,field,target)=>{
  if(!items.length)return;
  const oldTotal=items.reduce((sum,r)=>sum+r[field],0);
  // Allocate reduction to the last items first; additions to the first item.
  let delta=target-oldTotal;
  if(delta>=0){items[0][field]+=delta;return}
  for(const item of [...items].reverse()){
   const take=Math.min(item[field],-delta);
   item[field]-=take;delta+=take;
   if(delta===0)break;
  }
 };
 changeAmounts(w,"amount",withheld);changeAmounts(p,"debit",paid);
 for(const item of [...w,...p]){item.code=code;item.period=period;item.edited=true}
 return {ok:true};
}
export function excludeSummary(state,key){
 const row=summaries(state.withholdings,state.payments).find(r=>r.key===key);
 if(!row)return false;
 for(const item of state.withholdings)if(row.wids.includes(item.id))item.excluded=true;
 for(const item of state.payments)if(row.pids.includes(item.id))item.excluded=true;
 return true;
}
