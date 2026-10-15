import {packPractice,unpackPractice,practiceFilename} from "../practice_storage.js";
const practice=packPractice({
 taxpayer:"01184970315",year:"2025",
 original:[{name:"ROSSI",ledger:20926,cu:20926}],
 ledgerState:[{id:"ledger-0",name:"ROSSI",period:"07/2025",code:"1040",amount:20926,document:"FT-01",invoiceGross:100000,excluded:false,reconciliation:{paymentIds:["p1"],period:"08/2025"},stPeriod:"08/2025"}],
 f24Rows:[{uid:"p1",month:"08",year:"2025",code:"1040",date:"16/09/2025",debit:20928,credit:0}],
 f24Manual:[],stDraft:[{id:"st1",point1:"08/2025",point2:20926,point7:20928}],
 overrides:[["ROSSI",{cu:20926}]],interestOverrides:[["1040|08|2025",0]]
});
const restored=unpackPractice(JSON.parse(JSON.stringify(practice)));
if(restored.ledgerState[0].document!=="FT-01"||restored.ledgerState[0].stPeriod!=="08/2025")throw Error("Invoice or reconciliation lost");
if(restored.stDraft[0].point7!==20928||restored.f24Rows[0].debit!==20928)throw Error("F24/ST lost");
if(!practiceFilename(practice).endsWith(".json"))throw Error("Invalid filename");
if(!(()=>{try{unpackPractice({...restored,ledgerState:[] ,version:9});return false}catch{return true}})())throw Error("Invalid format accepted");
console.log("Practice save/restore roundtrip passed");
