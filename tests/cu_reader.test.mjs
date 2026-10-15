import {parseCuAll,reconcileNames} from "../cu_reader.js";
const lines=[
 "Percipiente: 601.02540 SCALIA                                RENATO",
 "Protocollo invio: 123 Esito: Accolta Tipo invio: Ordinario",
 " |   A   | 0,00| 0,00| 18,00| 0,00| 0,00|",
 " |   A   | 6362,50| 2,00| 0,00| 6342,50| 1268,50|",
 "Percipiente: 601.02571 MAIUOLO                               ANTONIO",
 "Protocollo invio: 456 Esito: Accolta Tipo invio: Ordinario",
 " | A | 10142,18|0,00|0,00|10142,18|2028,44|",
 "Certificazione non inviata",
 " | |1899,50|0,00|0,00|1899,50|379,90|"
];
const rows=parseCuAll(lines);
if(rows.length!==4||rows.reduce((s,x)=>s+x.amount,0)!==367684)throw Error("Multiple CU rows not read");
if(rows[3].status!=="non inviata")throw Error("Unsubmitted status lost");
const names=reconcileNames([{name:"CATTARINI dott. GILB"},{name:"MASE GIOVANNI"}],
 [{name:"CATTARINI GILBERTO"},{name:"MASÈ GIOVANNI"}]);
if(names.unmatched.length||names.resolved.size!==2)throw Error("Truncated names not matched");
console.log("CU reader regression tests passed");
