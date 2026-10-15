export function nextManualSequence(rows,prefixes=["added-","adjustment-"],field="id"){
 let max=0;
 for(const row of rows){
  const id=String(row[field]||"");
  for(const prefix of prefixes){
   if(!id.startsWith(prefix))continue;
   const suffix=id.slice(prefix.length);
   if(/^\d+$/.test(suffix))max=Math.max(max,Number(suffix));
  }
 }
 return max;
}
export function assertUniqueIds(rows,field){
 const seen=new Set();
 for(const row of rows){
  const id=String(row[field]||"");
  if(!id)continue;
  if(seen.has(id))throw Error("Identificativo duplicato: "+id);
  seen.add(id);
 }
}
