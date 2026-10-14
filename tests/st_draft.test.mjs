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
assert(result.rows.every(r=>r.point2===null),"Never allocate withheld amount automatically across dates");
assert(validateStRow(result.rows[0]).includes("Punto 2 non attribuito"),"Unallocated ST2 must block confirmation");
const notes=buildStDraft(ledger,[{...payments[0],notes:"A"},{...payments[1],notes:"B"}],2025);
assert(notes.rows.length===2,"Different notes must split rows");
console.log("ST draft tests passed");
