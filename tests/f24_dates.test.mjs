import {parseF24Pages} from "../f24_ade.js";
import {buildStDraft,validateStRow} from "../st_draft.js";
const line=(y,fields)=>fields.map(([x,text])=>({x,y,text}));
const pages=[[
 ...line(700,[[60,"16/6/2025"],[124,"1040"],[339,"05"],[387,"2025"],[453,"200,00"],[536,"0"]]),
 ...line(670,[[124,"1040"],[339,"05"],[387,"2025"],[453,"300,00"],[536,"0"]]),
 ...line(640,[[60,"20/6/2025"],[124,"8948"],[339,"05"],[387,"2025"],[453,"10,00"],[536,"0"]])
]];
const result=parseF24Pages(pages);
if(result.rows.length!==3)throw Error("Expected exactly 3 PDF rows");
if(result.rows[1].date!=="16/6/2025"||!result.rows[1].dateInherited)throw Error("Date inheritance failed");
if(result.rows[0].dateInherited)throw Error("Explicit date not detected");
const ledger=[{code:"1040",date:"20/05/25",amount:50000}];
const draft=buildStDraft(ledger,result.rows,2025);
if(draft.rows.length!==1||draft.rows[0].point7!==50000)throw Error("ST aggregation duplicated amounts");
if(draft.rows[0].point14!=="16/6/2025")throw Error("ST14 date missing");
const invalid={...draft.rows[0],point14:""};
if(!validateStRow(invalid).some(e=>e.includes("ST14")))throw Error("Missing date should block ST");
console.log("F24 date inheritance and ST aggregation tests passed");
