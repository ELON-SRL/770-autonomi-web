"use strict";
const ids=[["ledger","Listato ritenute"],["cu","Brogliaccio CU"],["f24","Versamenti F24"]];
document.getElementById("check").addEventListener("click",()=>{
 const tbody=document.getElementById("results");tbody.replaceChildren();
 let valid=true;
 for(const [id,label] of ids){
  const file=document.getElementById(id).files[0];const ok=!!file&&file.name.toLowerCase().endsWith(".pdf");valid&&=ok;
  const row=document.createElement("tr"),a=document.createElement("td"),b=document.createElement("td");
  a.textContent=label;b.textContent=ok?"Selezionato: "+file.name:"PDF mancante";row.append(a,b);tbody.append(row);
 }
 document.getElementById("status").textContent=valid?"Tre PDF selezionati. Il motore fiscale è in sviluppo.":"Seleziona i tre PDF.";
});