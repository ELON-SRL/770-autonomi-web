import {reconcile} from "../f24_ade.js";
const ledger=[{code:"1040",date:"12/03/25",amount:56137}];
const payments=[{code:"1040",month:"07",year:"2025",date:"16/08/2025",debit:56137}];
const rows=reconcile(ledger,payments,2025);
const march=rows.find(r=>r.month==="03"),july=rows.find(r=>r.month==="07");
if(!march||march.status!=="SOLO_RITENUTE"||march.difference!==-56137)throw Error("March should be unmatched withholding");
if(!july||july.status!=="SOLO_F24"||july.difference!==56137)throw Error("July should be unallocated F24");
console.log("Unmatched reconciliation status tests passed");
