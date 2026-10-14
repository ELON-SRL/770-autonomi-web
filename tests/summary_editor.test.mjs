import {summaries,changeSummary,excludeSummary} from "../summary_editor.js";
const state={withholdings:[
 {id:"w1",name:"MARIANO",code:"1040",period:"07/2025",amount:20961,excluded:false},
 {id:"w2",name:"MARIANO",code:"1040",period:"05/2025",amount:56137,excluded:false}
],payments:[
 {id:"p1",code:"1040",period:"08/2025",date:"16/09/2025",debit:20961,excluded:false},
 {id:"p2",code:"1040",period:"05/2025",date:"16/06/2025",debit:56137,excluded:false}
]};
const originalCount=state.withholdings.length+state.payments.length;
const first=summaries(state.withholdings,state.payments);
if(first.length!==3)throw Error("Expected 3 periods");
const changed=changeSummary(state,"1040|07/2025",{code:"1040",period:"08/2025",withheld:20961,paid:0});
if(!changed.ok)throw Error(changed.error);
const next=summaries(state.withholdings,state.payments);
if(next.length!==2||next.find(x=>x.period==="08/2025").withheld!==20961)throw Error("Period reassignment");
if(next.find(x=>x.period==="08/2025").paid!==20961)throw Error("F24 preserved");
if(state.withholdings.length+state.payments.length!==originalCount)throw Error("Movements duplicated");
if(!excludeSummary(state,"1040|05/2025"))throw Error("Exclude failed");
if(summaries(state.withholdings,state.payments).length!==1)throw Error("Excluded row still active");
state.withholdings[1].excluded=false;state.payments[1].excluded=false;
if(summaries(state.withholdings,state.payments).length!==2)throw Error("Restore failed");
console.log("Editable reconciliation tests passed");
