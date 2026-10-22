import assert from "node:assert/strict";
import {parseMastrino,compareMastrino} from "../mastrino_import.js";
const lines=[
"17/02/25 FR 8 17/02/25 FATT. RICEV. Gennaio 4.362,36 COMPENSI ODONTOIATRI -12.874,50 A",
"17/02/25 FR 8 17/02/25 FATT. RICEV. Gennaio 872,47 COMPENSI ODONTOIATRI -12.002,03 A",
"24/02/25 PG 15 24/02/25 PAGAMENTO 01250224545 3.489,89 BANCA INTESA C/C 11513",
"05/05/25 FR 26 05/05/25 FATT. RICEV. 6.250,00 COMPENSI ODONTOIATRI",
"05/05/25 FR 26 05/05/25 FATT. RICEV. 1.250,00 COMPENSI ODONTOIATRI",
"05/05/25 PG 394 05/05/25 PAGAMENTO 01250505358 5.000,00 BANCA INTESA",
"18/01/26 PG 4 18/01/26 PAGAMENTO 2.000,00 BANCA"
];
const parsed=parseMastrino(lines,"2025");
assert.equal(parsed.candidates.length,2);
assert.equal(parsed.payments.length,2);
assert.equal(parsed.candidates[0].withholding,87247);
const compared=compareMastrino(parsed,[{name:"QUINTO MICHELE",document:"8",invoiceDate:"17/02/25",amount:87247}], "QUINTO MICHELE");
assert.equal(compared[0].status,"present");
assert.equal(compared[1].status,"candidate");
console.log("Mastrino parser and conservative matching OK");
