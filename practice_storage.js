"use strict";
export const PRACTICE_FORMAT="770-autonomi-pratica";
export const PRACTICE_VERSION=1;
export function packPractice(data){
 return {format:PRACTICE_FORMAT,version:PRACTICE_VERSION,savedAt:new Date().toISOString(),...data};
}
export function unpackPractice(value){
 if(!value||value.format!==PRACTICE_FORMAT||value.version!==PRACTICE_VERSION)throw Error("Formato pratica non riconosciuto");
 if(!/^(?:[0-9]{11}|[A-Z0-9]{16})$/.test(String(value.taxpayer||"")))throw Error("Codice fiscale pratica non valido");
 if(!/^20\d{2}$/.test(String(value.year||"")))throw Error("Anno pratica non valido");
 for(const field of ["original","ledgerState","f24Rows","f24Manual","stDraft","overrides","interestOverrides"]){
  if(!Array.isArray(value[field]))throw Error("Dati mancanti o non validi: "+field);
 }
 for(const row of value.ledgerState)if(!Number.isSafeInteger(row.amount)||row.amount<0)throw Error("Ritenuta non valida");
 for(const row of [...value.f24Rows,...value.f24Manual])if(!Number.isSafeInteger(row.debit)||!Number.isSafeInteger(row.credit))throw Error("F24 non valido");
 return value;
}
export function practiceFilename(value){
 return "770-pratica-"+value.taxpayer+"-"+value.year+"-"+value.savedAt.replace(/[:.]/g,"-")+".json";
}
