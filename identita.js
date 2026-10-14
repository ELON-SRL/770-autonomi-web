"use strict";
export function taxId(value){
 const id=String(value||"").toUpperCase().replace(/\s/g,"");
 return /^(?:[0-9]{11}|[A-Z0-9]{16})$/.test(id)?id:null;
}
// Extract only labelled identifiers or a recognised document header.
// Other people's identifiers never establish the declarant's identity.
export function identifyDetailed(lines){
 const text=(Array.isArray(lines)?lines:[String(lines)]).join(" ").toUpperCase()
  .replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
 const found=[];
 const label="(?:CODICE\\s+FISCALE|C\\.?\\s*F\\.?|PARTITA\\s+IVA|P\\.?\\s*(?:IVA|I\\.?V\\.?A\\.?))";
 const role="(?:SOSTITUTO(?:\\s+D[’'.]IMPOSTA)?|DICHIARANTE|CONTRIBUENTE)";
 const patterns=[
  {kind:"sostituto",rx:new RegExp(label+"\\s+(?:DEL(?:LA|LO)?\\s+)?"+role+"\\s*[:\\-]?\\s*([A-Z0-9 ]{11,35})","g")},
  {kind:"sostituto",rx:new RegExp(role+"\\s*[:\\-]?\\s*"+label+"\\s*[:\\-]?\\s*([A-Z0-9 ]{11,35})","g")},
  {kind:"sostituto",rx:/CASSETTO\s+DELEGATO\s+DI\s*:\s*([A-Z0-9 ]{11,35})/g},
  // Passepartout CU: the first identifier belongs to the company header.
  {kind:"sostituto",rx:/^([A-Z0-9 ]{11,35}?)\s+AZIENDA\s+\S+\s+MODELLO\s+CU\s+BROGLIACCIO\b/g},
  {kind:"generico",rx:new RegExp(label+"\\s*[:\\-]?\\s*([A-Z0-9 ]{11,35})","g")}
 ];
 for(const {kind,rx} of patterns){
  for(const m of text.matchAll(rx)){
   const segment=m[1],compact=segment.match(/^([A-Z0-9]{16}|[0-9]{11})(?![A-Z0-9])/);
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
