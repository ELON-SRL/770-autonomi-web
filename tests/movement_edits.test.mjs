import {cloneF24,usableF24,validateF24Change,parseEuros} from "../movement_edits.js";
function assert(value,label){if(!value)throw new Error(label)}
const original=cloneF24([{date:"16/06/2025",code:"1040",month:"05",year:"2025",debit:56137,credit:0}]);
assert(original[0].original.month==="05","original month retained");
original[0].assignedMonth="03";
assert(usableF24(original)[0].month==="03","assigned period used");
assert(original[0].original.month==="05","original untouched");
original[0].excluded=true;
assert(usableF24(original).length===0,"excluded item not used");
assert(parseEuros("561,37")===56137,"euro parsing");
assert(validateF24Change({...original[0],assignedMonth:"03",assignedYear:"2025"}).length===0,"valid correction");
console.log("Movement correction tests passed");
