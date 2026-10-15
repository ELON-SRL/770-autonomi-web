"use strict";
export function auditCuExport(rows,ledgerState,year){
 const errors=[];
 const active=ledgerState.filter(r=>!r.excluded&&String(r.period||"").endsWith("/"+year));
 const sourceTotal=active.reduce((s,r)=>s+r.amount,0);
 const exportTotal=rows.reduce((s,r)=>s+r.ledger,0);
 if(sourceTotal!==exportTotal)errors.push("Gestionale: totale CSV "+exportTotal+" diverso dai movimenti attivi "+sourceTotal);
 for(const row of rows){
  if(!Number.isSafeInteger(row.ledger)||!Number.isSafeInteger(row.cu))errors.push("Importi non validi: "+row.name);
 }
 const names=new Set();
 for(const row of rows){const key=String(row.name).trim().toUpperCase();if(names.has(key))errors.push("Percipiente duplicato: "+row.name);names.add(key)}
 return {ok:errors.length===0,errors,sourceTotal,exportTotal,cuTotal:rows.reduce((s,r)=>s+r.cu,0)};
}
export function auditF24Export(rows,payments,year){
 const errors=[];
 const active=payments.filter(r=>!r.excluded&&r.year===String(year)&&r.month&&r.code!=="8948");
 const totalPayments=active.reduce((s,r)=>s+r.debit,0);
 const totalExport=rows.reduce((s,r)=>s+r.paid,0);
 if(totalPayments!==totalExport)errors.push("F24: totale CSV "+totalExport+" diverso dai movimenti "+totalPayments);
 const keys=new Set(rows.map(r=>r.key));
 for(const r of active){const key=[r.code,r.month,r.year].join("|");if(!keys.has(key))errors.push("F24 non presente nel CSV: "+key)}
 for(const row of rows)if(row.difference!==null&&row.difference!==row.paid-row.expected)errors.push("Differenza incoerente: "+row.key);
 return {ok:errors.length===0,errors,totalPayments,totalExport};
}
export function csvCell(value){const s=String(value??"");return '"'+s.replace(/"/g,'""')+'"'}
export function csvLine(values){return values.map(csvCell).join(";")}
