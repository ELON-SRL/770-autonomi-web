import {buildStDraft,validateStRow} from "../st_draft.js";
function assert(ok,message){if(!ok)throw Error(message)}
const ledger=[{code:"1040",date:"12/03/25",amount:60000}];
const payments=[
 {code:"1040",month:"03",year:"2025",date:"16/04/2025",debit:20000},
 {code:"1040",month:"03",year:"2025",date:"16/04/2025",debit:10000},
 {code:"1040",month:"03",year:"2025",date:"16/06/2025",debit:30000}
];
const result=buildStDraft(ledger,payments,2025);
assert(result.rows.length===2,"Split by date");
assert(result.rows.some(r=>r.point7===30000&&r.paymentCount===2),"Merge same date/period/code");
assert(result.rows.every(r=>r.point2===30000),"Balanced installments allocate actual principal once per date");
const ambiguous=buildStDraft([{...ledger[0],amount:61000}],payments,2025);
assert(ambiguous.rows.reduce((s,r)=>s+r.point2,0)===61000,"Unbalanced installments must preserve ST2 total");
assert(ambiguous.warnings.some(w=>w.includes("610.00")),"Discrepancy stays visible in warnings");
assert(ambiguous.rows.every(r=>!validateStRow(r).includes("Punto 2 non attribuito")),"Automatic ST2 allocation must be editable");
const notes=buildStDraft(ledger,[{...payments[0],notes:"A"},{...payments[1],notes:"B"}],2025);
assert(notes.rows.length===2,"Different notes must split rows");
console.log("ST draft tests passed");
