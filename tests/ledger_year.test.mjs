import assert from 'node:assert/strict';
import {newLedgerState,activeLedger,ledgerSummary} from '../ledger_tree.js';
import {link} from '../manual_reconciliation.js';
import {buildStDraft} from '../st_draft.js';
const rows=newLedgerState([
 {name:'TEST',code:'1040',date:'31/07/25',amount:20926},
 {name:'TEST',code:'1040',date:'02/01/26',amount:50000}
]);
const payments=[{uid:'p',code:'1040',month:'08',year:'2025',date:'16/09/2025',debit:20928}];
assert.equal(activeLedger(rows,'2025').reduce((s,r)=>s+r.amount,0),20926);
assert.equal(ledgerSummary(rows,'2025').length,1);
assert.equal(activeLedger(rows,'2026')[0].amount,50000);
assert.throws(()=>link(rows[1],payments),/fuori anno/);
link(rows[0],payments);
assert.equal(buildStDraft(activeLedger(rows,'2025'),payments,'2025').rows.length,1);
assert.equal(rows[1].excluded,false); // automatic year filter preserves source and manual exclusion
rows[1].stPeriod='01/2025'; // ST assignment cannot bypass accounting year filtering
assert.equal(activeLedger(rows,'2025').length,1);
assert.equal(rows[1].source.date,'02/01/26');
console.log('Accounting year isolation passed');
