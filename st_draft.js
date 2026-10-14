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
 const allowed=new Set(["1040",...ledger.map(x=>x.code)]);
 const expected=new Map();
 for(const l of ledger){
  const m=String(l.date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|20\d{2})$/);
  if(!m||(m[3].length===2?"20"+m[3]:m[3])!==y)continue;
  const key=[l.code,m[2].padStart(2,"0"),y].join("|");
  expected.set(key,(expected.get(key)||0)+l.amount);
 }
 const groups=new Map();
 for(const p of payments){
  if(p.excluded||p.year!==y||!allowed.has(p.code)||!p.month)continue;
  const notes=String(p.notes||"").trim().toUpperCase();
  const date=canonicalPaymentDate(p.date);
  if(!date){warnings.push("Versamento con data mancante o non valida: verificare il movimento prima di generare ST");continue}
  const key=[p.code,p.month,y,date,notes].join("|");
  if(!groups.has(key))groups.set(key,{key,code:p.code,month:p.month,year:y,date,notes,amount:0,payments:[]});
  const group=groups.get(key);group.amount+=p.debit;group.payments.push(p);
 }
 // Detect evidence first, then allocate a period interest proposal to a single
 // identifiable ravvedimento date. Penalties never add to ST7.
 for(const g of groups.values()){
  g.ravvedimento=g.code==="1040"&&payments.some(p=>!p.excluded&&p.code==="8948"&&p.year===y&&p.month===g.month&&canonicalPaymentDate(p.date)===g.date&&p.debit>0);
  g.interest=0;
 }
 const processed=new Set();
 for(const g of groups.values()){
  const periodKey=[g.code,g.month,y].join("|");
  if(processed.has(periodKey))continue;
  processed.add(periodKey);
  const samePeriod=[...groups.values()].filter(x=>[x.code,x.month,y].join("|")===periodKey);
  const rav=samePeriod.filter(x=>x.ravvedimento);
  const target=samePeriod.length===1?samePeriod[0]:rav.length===1?rav[0]:null;
  const override=options.interestByPeriod?.[periodKey];
  if(override!==undefined&&target){
   if(Number.isSafeInteger(override)&&override>=0&&override<=target.amount)target.interest=override;
   else warnings.push("Interessi non validi per "+g.month+"/"+y+": correggere prima della conferma");
  }else if(override!==undefined){
   warnings.push("Interessi del periodo "+g.month+"/"+y+" da ripartire fra più date nello ST");
  }else if(target?.ravvedimento&&expected.has(periodKey)){
   const excess=samePeriod.reduce((sum,x)=>sum+x.amount,0)-expected.get(periodKey);
   if(excess>0&&excess<=target.amount){
    target.interest=excess;
    warnings.push("Ravvedimento "+g.month+"/"+y+" del "+target.date+": interessi proposti dalla differenza F24/ritenute, da verificare");
   }else if(excess<0)warnings.push("Ravvedimento "+g.month+"/"+y+": importo interessi da indicare manualmente; periodo non quadrato");
  }
  if(rav.length>1)warnings.push("Ravvedimenti "+g.month+"/"+y+": più date, attribuire manualmente gli interessi");
  for(const r of rav)warnings.push("Ravvedimento proposto "+r.month+"/"+y+" del "+r.date+": verificare punti 8 e 9; sanzione 8948 esclusa dallo ST");
 }
 for(const g of groups.values()){
  const periodKey=[g.code,g.month,y].join("|");
  const matching=[...groups.values()].filter(x=>[x.code,x.month,y].join("|")===periodKey);
  const totalExpected=expected.get(periodKey);
  const totalPrincipal=matching.reduce((sum,x)=>sum+x.amount-x.interest,0);
  // Single date: all actual withholdings, even with a discrepancy or interest.
  // Multiple dates: split by principal only when the entire period balances.
  const proposed=totalExpected===undefined?null:matching.length===1?totalExpected:
   totalExpected===totalPrincipal?g.amount-g.interest:null;
  if(proposed===null&&totalExpected!==undefined&&!warnings.some(w=>w.startsWith("Ritenute da attribuire "+periodKey+":")))
   warnings.push("Ritenute da attribuire "+periodKey+": totale operato "+(totalExpected/100).toFixed(2)+" euro; più date non quadrate, compilare il punto 2 senza duplicare il totale");
  rows.push({
   id:g.key,point1:g.month+"/"+y,point2:proposed,point6:0,point7:g.amount,
   point8:g.interest,point9:g.ravvedimento||g.interest>0,point10:g.notes,point11:g.code,point14:g.date,point15:"",point16:0,
   paymentCount:g.payments.length,origin:"F24",reviewed:false,
   issue:g.ravvedimento?"Ravvedimento proposto da sanzione 8948: verificare interessi e casella 9":
    proposed===null?"Attribuire le ritenute del punto 2":"Ritenute riportate dal gestionale; verificare differenze e versamento"
  });
 }
 for(const [key,total] of expected){
  if([...groups.values()].some(g=>[g.code,g.month,y].join("|")===key))continue;
  const [code,month]=key.split("|");
  rows.push({id:"unpaid|"+key,point1:month+"/"+y,point2:total,point6:0,point7:0,point8:0,point9:false,point10:"",point11:code,point14:"",point15:"",point16:0,paymentCount:0,origin:"RITENUTA_SENZA_F24",reviewed:false,issue:"Ritenuta senza versamento individuato; verificare compilazione"});
 }
 if(options.hasAggregatedCuCorrections)warnings.push("Rettifiche CU aggregate non attribuite ai periodi: bozza ST non confermabile");
 return {withholdings:[...expected].map(([key,amount])=>({key,amount})),rows:rows.sort((a,b)=>a.point1.localeCompare(b.point1)||a.point14.localeCompare(b.point14)),warnings};
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
