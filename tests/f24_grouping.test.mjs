import {paymentGroupSummary} from "../f24_groups.js";
import {buildStDraft} from "../st_draft.js";
const items=[
 {date:"16/6/2025",code:"1040",month:"05",year:"2025",debit:56137},
 {date:"16/6/2025",code:"8948",month:"05",year:"2025",debit:190},
 {date:"16/6/2025",code:"1040",month:"05",year:"2025",debit:40},
 {date:"1/9/2025",code:"1040",month:"08",year:"2025",debit:20000},
 {date:"1/9/2025",code:"8948",month:"08",year:"2025",debit:70}
];
const groups=paymentGroupSummary(items,2025);
if(groups.length!==2)throw Error("Group count");
if(groups[0].tax!==56177||groups[0].penalty!==190)throw Error("Group totals");
const ledger=[{code:"1040",date:"20/05/25",amount:56137},{code:"1040",date:"20/08/25",amount:20000}];
const st=buildStDraft(ledger,items,2025);
if(st.rows.length!==2)throw Error("ST row count");
if(st.rows.reduce((s,r)=>s+r.point7,0)!==76177)throw Error("ST double counting");
if(st.rows.some(r=>!r.point14))throw Error("Missing ST14");
console.log("Grouping tests passed");
