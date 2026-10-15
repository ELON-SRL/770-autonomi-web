import {newLedgerState} from "../ledger_tree.js";
import {recipientInvoiceReport} from "../recipient_report.js";
const source=[{name:"BARDUCCI ENZO",code:"1040",date:"20/03/25",amount:20000,document:"FT-123",invoiceDate:"10/03/25",invoiceGross:122000,paymentAmount:98000,invoiceWithholding:20000}];
const state=newLedgerState(source);
const item=state[0];
for(const key of ["document","invoiceDate","invoiceGross","paymentAmount","invoiceWithholding"]){
 if(item[key]!==source[0][key])throw Error("Lost invoice field: "+key);
}
const report=recipientInvoiceReport("BARDUCCI ENZO","2025",state,n=>(n/100).toFixed(2).replace(".",","));
for(const value of ["FT-123","10/03/25","1220,00","980,00","200,00"]){
 if(!report.csv.includes(value))throw Error("CSV missing actual invoice field "+value);
}
item.amount=21000;
const updated=recipientInvoiceReport("BARDUCCI ENZO","2025",state,n=>(n/100).toFixed(2).replace(".",","));
if(!updated.csv.includes("210,00"))throw Error("Updated withholding not exported");
console.log("Invoice fields survive import and CSV export, with updated withholding");
