"use strict";
export function unlink(row){delete row.reconciliation;delete row.stPeriod;}
export function link(row,payments){
 if(row.excluded||row.reconciliation||!payments.length)throw Error("Ritenuta non disponibile");
 const p=payments[0],period=p.month+"/"+p.year;
 if(String(row.period).slice(-4)!==String(p.year))throw Error("Ritenuta fuori anno: riconciliazione non consentita");
 if(payments.some(x=>!x.uid||x.code!==row.code||x.month+"/"+x.year!==period))throw Error("F24 incompatibili");
 row.reconciliation={paymentIds:payments.map(x=>x.uid),period,code:row.code};
 row.stPeriod=period;
}
export function syncLinks(rows,payments){
 for(const row of rows){
  const link=row.reconciliation;if(!link)continue;
  const valid=link.paymentIds.every(id=>payments.some(p=>p.uid===id&&p.code===row.code&&p.month+"/"+p.year===link.period));
  if(!valid||row.code!==link.code||String(row.period).slice(-4)!==link.period.slice(-4))unlink(row);
 }
}
