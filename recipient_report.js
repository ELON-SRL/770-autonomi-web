"use strict";
const quote=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
const line=fields=>fields.map(quote).join(";");
export function recipientInvoiceReport(name,year,ledger,formatMoney){
 const rows=ledger.filter(r=>!r.excluded&&String(r.period||"").endsWith("/"+year)&&String(r.name).trim().toUpperCase()===String(name).trim().toUpperCase());
 const total=rows.reduce((s,r)=>s+r.amount,0);
 const knownGross=rows.filter(r=>Number.isSafeInteger(r.invoiceGross));
 const gross=knownGross.reduce((s,r)=>s+r.invoiceGross,0);

 const knownPaid=rows.filter(r=>Number.isSafeInteger(r.paymentAmount));
 const paid=knownPaid.reduce((s,r)=>s+r.paymentAmount,0);
 const data=[
  line(["Percipiente",name]),line(["Anno",year]),
  line(["Numero fattura","Data fattura","Totale fattura","Importo pagato","Ritenuta operata"]),
  ...rows.map(r=>line([r.document||"Inserimento manuale",r.invoiceDate||"",Number.isSafeInteger(r.invoiceGross)?formatMoney(r.invoiceGross):"",Number.isSafeInteger(r.paymentAmount)?formatMoney(r.paymentAmount):"",formatMoney(r.amount)])),
  line(["TOTALE","",knownGross.length===rows.length?formatMoney(gross):"PARZIALE "+formatMoney(gross),knownPaid.length===rows.length?formatMoney(paid):"PARZIALE "+formatMoney(paid),formatMoney(total)])
 ];

 return {csv:"\ufeff"+data.join("\r\n"),rows:rows.length,total,knownGross:knownGross.length,gross,knownPaid:knownPaid.length,paid};
}
