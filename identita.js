"use strict";
export function taxId(value){
 const id=String(value||"").toUpperCase().replace(/\s/g,"");
 return /^(?:[0-9]{11}|[A-Z0-9]{16})$/.test(id)?id:null;
}
export function identify(lines){
 const all=lines.join(" ");
 // Explicit legal identifiers only; never use company codes, recipient IDs or Entratel 'Utente'.
 const matches=[];
 const patterns=[
  /(?:CODICE\s+FISCALE|C\.?F\.?)\s*(?:DEL\s+(?:CONTRIBUENTE|SOSTITUTO))?\s*[:\-]?\s*([A-Z0-9]{11,16})/gi,
  /(?:PARTITA\s+IVA|P\.?IVA)\s*[:\-]?\s*([0-9]{11})/gi,
  /(?:DEL\s+CONTRIBUENTE)\s+([0-9]{11})\s*-/gi
 ];
 for(const pattern of patterns){
  for(const m of all.matchAll(pattern)){const id=taxId(m[1]);if(id)matches.push(id)}
 }
 return [...new Set(matches)];
}
export function verify(expected,documents){
 const id=taxId(expected);
 if(!id)return {ok:false,message:"Inserisci un codice fiscale/partita IVA valido del sostituto."};
 const mismatches=[],unknown=[];
 for(const [name,ids] of Object.entries(documents)){
  if(!ids.length)unknown.push(name);
  else if(!ids.includes(id))mismatches.push(name);
 }
 if(mismatches.length)return {ok:false,message:"Contribuente diverso nei documenti: "+mismatches.join(", ")+". Riconciliazione bloccata."};
 if(unknown.length)return {ok:false,message:"Identificativo non verificabile in: "+unknown.join(", ")+". Occorre verifica esplicita prima di procedere."};
 return {ok:true,message:"Identificativo del sostituto verificato nei documenti."};
}
