"use strict";
// ST draft is a review aid, not an official electronic filing.
// Amounts are integer cents. No automatic confirmation of interest estimates.
export function canonicalPaymentDate(value){
 const match=String(value??"").trim().match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
 if(!match)return "";
 const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCDate()!==day||date.getUTCMonth()!==month-1)return "";
 return String(day).padStart(2,"0")+"/"+String(month).padStart(2,"0")+"/"+year;
}
export function buildStDraft(ledger,payments,year,options={}){
 const y=String(year), rows=[], warnings=[];
 const allowed=new Set(ledger.map(x=>x.code));
 const expected=new Map();
 for(const l of ledger){
  const m=String(l.date).match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if(!m||"20"+m[3]!==y)continue;
  const key=[l.code,m[2],y].join("|");
  expected.set(key,(expected.get(key)||0)+l.amount);
 }
 const groups=new Map();
 for(const p of payments){
  if(p.year!==y||!allowed.has(p.code)||!p.month)continue;
  const notes=String(p.notes||"").trim().toUpperCase();
  const date=canonicalPaymentDate(p.date);
  if(!date){warnings.push("Versamento con data mancante o non valida: verificare il movimento prima di generare ST");continue}
  const key=[p.code,p.month,y,date,notes].join("|");
  if(!groups.has(key))groups.set(key,{key,code:p.code,month:p.month,year:y,date,notes,amount:0,payments:[]});
  const group=groups.get(key);group.amount+=p.debit;group.payments.push(p);
 }
 for(const g of groups.values()){
  // No automatic allocation of monthly withheld amounts across separate payment dates.
  rows.push({
   id:g.key,point1:g.month+"/"+y,point2:null,point6:0,point7:g.amount,
   point8:0,point9:false,point10:g.notes,point11:g.code,point14:g.date,point15:"",point16:0,
   paymentCount:g.payments.length,origin:"F24",reviewed:false,
   issue:"Attribuire e verificare le ritenute del punto 2; interessi, note e ravvedimento da verificare"
  });
 }
 for(const [key,total] of expected){
  if([...groups.values()].some(g=>[g.code,g.month,y].join("|")===key))continue;
  const [code,month]=key.split("|");
  rows.push({id:"unpaid|"+key,point1:month+"/"+y,point2:total,point6:0,point7:0,point8:0,point9:false,point10:"",point11:code,point14:"",point15:"",point16:0,paymentCount:0,origin:"RITENUTA_SENZA_F24",reviewed:false,issue:"Ritenuta senza versamento individuato; verificare compilazione"});
 }
 if(options.hasAggregatedCuCorrections)warnings.push("Rettifiche CU aggregate non attribuite ai periodi: bozza ST non confermabile");
 return {rows:rows.sort((a,b)=>a.point1.localeCompare(b.point1)||a.point14.localeCompare(b.point14)),warnings};
}
export function validateStRow(r){
 const errors=[];
 if(!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(r.point1))errors.push("Periodo non valido");
 if(!/^\d{4}$/.test(r.point11))errors.push("Codice tributo non valido");
 if(r.origin==="F24"&&!r.point14)errors.push("Data versamento ST14 obbligatoria per rigo F24");
 if(r.point14&&!canonicalPaymentDate(r.point14))errors.push("Data versamento non valida");
 for(const key of ["point2","point6","point7","point8"]){
  if(r[key]!==null&&(!Number.isSafeInteger(r[key])||r[key]<0))errors.push(key+" non valido");
 }
 if(r.point8>r.point7)errors.push("Interessi maggiori del versamento");
 if(r.point8>0&&!r.point9)errors.push("Verificare ravvedimento per interessi dichiarati");
 if(r.point2===null)errors.push("Punto 2 non attribuito");
 return errors;
}
