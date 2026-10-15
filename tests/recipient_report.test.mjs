import {recipientInvoiceReport} from "../recipient_report.js";
const money=n=>(n/100).toFixed(2).replace(".",",");
const rows=[
 {name:"ROSSI MARIO",period:"01/2025",document:"FT 1",invoiceDate:"10/01/25",date:"15/01/25",invoiceGross:100000,amount:20000,code:"1040"},
 {name:"ROSSI MARIO",period:"02/2025",document:"FT 2",invoiceDate:"10/02/25",date:"15/02/25",invoiceGross:50000,amount:10000,code:"1040"},
 {name:"ROSSI MARIO",period:"02/2025",document:"FT 3",amount:5000,code:"1040",excluded:true},
 {name:"BIANCHI LUCA",period:"01/2025",amount:8000,code:"1040"}
];
let result=recipientInvoiceReport("ROSSI MARIO","2025",rows,money);
if(result.rows!==2||result.total!==30000||result.gross!==150000)throw Error("Wrong invoice totals");
if(result.csv.includes("FT 3")||result.csv.includes("BIANCHI"))throw Error("Report includes unrelated or excluded invoices");
rows[1].amount=11000;
result=recipientInvoiceReport("ROSSI MARIO","2025",rows,money);
if(result.total!==31000||!result.csv.includes("310,00"))throw Error("Export not refreshed after edit");
console.log("Recipient invoice report tests passed");


if(!result.csv.includes("Importo pagato"))throw Error("Paid amount column missing");
rows[0].paymentAmount=80000;
result=recipientInvoiceReport("ROSSI MARIO","2025",rows,money);
if(result.knownPaid!==1||result.paid!==80000)throw Error("Paid amount not preserved");
if(result.csv.includes("Compenso imponibile"))throw Error("Unrequested taxable compensation column");
