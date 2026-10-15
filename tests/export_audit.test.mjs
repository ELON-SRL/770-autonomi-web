import {auditCuExport,auditF24Export,auditStExport,csvLine} from "../export_audit.js";
const ledger=[{name:"ROSSI",period:"01/2025",amount:20926,excluded:false}];
const rows=[{name:"ROSSI",ledger:20926,cu:20926}];
if(!auditCuExport(rows,ledger,"2025").ok)throw Error("Valid CU must pass");
if(auditCuExport([{...rows[0],ledger:20928}],ledger,"2025").ok)throw Error("CU discrepancy must block");
const payments=[{code:"1040",month:"01",year:"2025",debit:20928,excluded:false}];
const reconciled=[{key:"1040|01|2025",code:"1040",month:"01",year:"2025",expected:20926,paid:20928,difference:2}];
if(!auditF24Export(reconciled,payments,"2025").ok)throw Error("Valid F24 must pass");
if(auditF24Export([{...reconciled[0],paid:20926}],payments,"2025").ok)throw Error("F24 discrepancy must block");
if(!csvLine(['a;"b','209,26']).includes('"a;""b"'))throw Error("CSV escaping broken");
console.log("CSV export coherence checks passed");

const validSt={point2:20926,point6:0,point7:20928,point8:0,point16:0,excluded:false};
if(!auditStExport([validSt],()=>[]).ok)throw Error("Valid ST must pass");
if(auditStExport([{...validSt,point7:-1}],()=>[]).ok)throw Error("Negative ST must block");
if(auditStExport([validSt],()=>["ST14 mancante"]).ok)throw Error("Incomplete ST must block");
