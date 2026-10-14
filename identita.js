"use strict";
export function taxId(value){
 const id=String(value||"").toUpperCase().replace(/\s/g,"");
 return /^(?:[0-9]{11}|[A-Z0-9]{16})$/.test(id)?id:null;
}
// Read only labelled identifiers. Do not confuse recipients, intermediary or user with declarant.
export function identifyDetailed(lines){
 const text=(Array.isArray(lines)?lines:[String(lines)]).join(" ").toUpperCase()
  .replace(/\u00a0/g," ").replace(/\s+/g," ");
 const found=[];
 const patterns=[
  {kind:"sostituto",rx:/(?:CODICE\s+FISCALE|C\.?\s*F\.?|PARTITA\s+IVA|P\.?\s*IVA)\s+(?:DEL(?:LA|LO)?\s+)?(?:SOSTITUTO(?:\s+D.IMPOSTA)?|DICHIARANTE|CONTRIBUENTE)\s*[:\-]?\s*([A-Z0-9 ]{11,35})/g},
  {kind:"generico",rx:/(?:CODICE\s+FISCALE|C\.?\s*F\.?|PARTITA\s+IVA|P\.?\s*IVA)\s*[:\-]?\s*([A-Z0-9 ]{11,35})/g}
 ];
 for(const {kind,rx} of patterns){
  for(const m of text.matchAll(rx)){
   // Read one compact token or 11 separate digits; do not consume arbitrary following words.
   const segment=m[1],compact=segment.match(/^([A-Z0-9]{11}|[A-Z0-9]{16})(?![A-Z0-9])/);
   const spaced=segment.match(/^((?:\d\s*){11})(?!\d)/);
   const candidate=compact?.[1]||spaced?.[1].replace(/\s/g,"");
   const id=taxId(candidate);
   if(id&&!found.some(x=>x.id===id&&x.kind===kind))found.push({id,kind});
  }
 }
 return found;
}
export function identify(lines){return [...new Set(identifyDetailed(lines).map(x=>x.id))]}
export function verify(expected,documents){
 const id=taxId(expected);
 if(!id)return {ok:false,message:"Inserisci un codice fiscale/partita IVA valido del sostituto."};
 const mismatches=[],unknown=[];
 for(const [name,ids] of Object.entries(documents)){
  if(!ids.length)unknown.push(name);
  else if(!ids.includes(id))mismatches.push(name);
 }
 if(mismatches.length)return {ok:false,message:"Identificativo differente in: "+mismatches.join(", ")+". Verificare il soggetto prima di proseguire."};
 if(unknown.length)return {ok:false,message:"Identificativo non verificabile in: "+unknown.join(", ")+". Verifica manuale necessaria."};
 return {ok:true,message:"Identificativo rilevato nei documenti."};
}
