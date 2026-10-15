import {nextManualSequence,assertUniqueIds} from "../practice_sequences.js";
const rows=[{id:"ledger-0"},{id:"added-1"},{id:"added-4"},{id:"adjustment-8"}];
if(nextManualSequence(rows)!==8)throw Error("Manual sequence lost after restore");
rows.push({id:"added-"+(nextManualSequence(rows)+1)});
if(rows.at(-1).id!=="added-9")throw Error("New manual row overwrites existing row");
assertUniqueIds(rows,"id");
let rejected=false;
try{assertUniqueIds([...rows,{id:"added-4"}],"id")}catch{rejected=true}
if(!rejected)throw Error("Duplicate IDs not rejected");
if(nextManualSequence([{uid:"manual-12"}],["manual-"],"uid")!==12)throw Error("F24 sequence lost");
console.log("Restored movement sequences and duplicate detection passed");
