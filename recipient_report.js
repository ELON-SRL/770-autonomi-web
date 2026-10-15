"use strict";
const quote=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
const line=fields=>fields.map(quote).join(";");
export function recipientInvoiceReport(name,year,ledger,formatMoney){
 const rows=ledger.filter(r=>!r.excluded&&String(r.period||"").endsWith("/"+year)&&String(r.name).trim().toUpperCase()===String(name).trim().toUpperCase());
 const total=rows.reduce((s,r)=>s+r.amount,0);
 const knownGross=rows.filter(r=>Number.isSafeInteger(r.invoiceGross));
 const gross=knownGross.reduce((s,r)=>s+r.invoiceGross,0);
 const data=[
  line(["Percipiente",name]),line(["Anno",year]),
  line(["Documento","Data fattura","Data pagamento","Compenso / totale fattura da gestionale","Ritenuta operata","Periodo","Tributo"]),
  ...rows.map(r=>line([r.document||"Inserimento manuale",r.invoiceDate||"",r.date||"",Number.isSafeInteger(r.invoiceGross)?formatMoney(r.invoiceGross):"",formatMoney(r.amount),r.period,r.code])),
  line(["TOTALE","","",knownGross.length===rows.length?formatMoney(gross):"PARZIALE "+formatMoney(gross),formatMoney(total),"",""]),
  line(["Nota","Il valore compenso/totale fattura e' quello esposto nel listato gestionale; non e' verificato come imponibile fiscale. Le fatture manuali prive di compenso restano vuote."])
 ];
 return {csv:"\ufeff"+data.join("\r\n"),rows:rows.length,total,knownGross:knownGross.length,gross};
}
