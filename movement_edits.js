"use strict";
export function cloneF24(rows){
 return rows.map((r,i)=>({...r,uid:"f24-"+i,original:{date:r.date,code:r.code,month:r.month,year:r.year,debit:r.debit,credit:r.credit},excluded:false,edited:false}));
}
export function usableF24(rows){
 return rows.filter(r=>!r.excluded).map(r=>({...r,month:r.assignedMonth??r.month,year:r.assignedYear??r.year}));
}
export function validateF24Change(p){
 const errors=[];
 if(!/^\d{1,2}\/\d{1,2}\/20\d{2}$/.test(p.date))errors.push("Data");
 if(!/^[0-9]{4}$/.test(p.code))errors.push("Tributo");
 if(!/^(0[1-9]|1[0-2])$/.test(p.assignedMonth))errors.push("Mese attribuito");
 if(!/^20\d{2}$/.test(p.assignedYear))errors.push("Anno attribuito");
 for(const k of ["debit","credit"])if(!Number.isSafeInteger(p[k])||p[k]<0)errors.push(k);
 return errors;
}
export function parseEuros(value){
 const raw=String(value).trim();
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw))return null;
 const n=Math.round(Number(raw.replace(",","."))*100);
 return Number.isSafeInteger(n)?n:null;
}
