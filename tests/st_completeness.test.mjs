import assert from 'node:assert/strict';
import {buildStDraft} from '../st_draft.js';
const ledger=[{code:'1040',date:'20/05/25',amount:56137},{code:'1040',date:'20/08/25',amount:20926},{code:'1040',date:'20/12/25',amount:10000},{code:'1040',date:'20/01/26',amount:99999}];
const payments=[
 {code:'1040',date:'16/6/2025',month:'05',year:'2025',debit:56137},
 {code:'1040',date:'16/06/2025',month:'05',year:'2025',debit:40},
 {code:'8948',date:'16/06/2025',month:'05',year:'2025',debit:190},
 {code:'1040',date:'16/09/2025',month:'08',year:'2025',debit:20928}
];
const draft=buildStDraft(ledger,payments,'2025');
assert.equal(draft.rows.length,3);
assert.equal(draft.rows.reduce((s,r)=>s+r.point2,0),87063);
assert.equal(draft.rows.reduce((s,r)=>s+r.point7,0),77105);
const may=draft.rows.find(r=>r.point1==='05/2025');
assert.equal(may.point2,56137);assert.equal(may.point7,56177);assert.equal(may.point8,0);assert.equal(may.point9,true);
assert.equal(draft.rows.find(r=>r.point1==='08/2025').point2,20926);
assert.equal(draft.rows.find(r=>r.point1==='08/2025').point8,0);
assert.equal(draft.rows.find(r=>r.point1==='12/2025').point2,10000);
assert.ok(!draft.rows.some(r=>r.point11==='8948'));
const overridden=buildStDraft(ledger,payments,'2025',{interestByPeriod:{'1040|05|2025':25}});
assert.equal(overridden.rows.find(r=>r.point1==='05/2025').point8,25);
const zero=buildStDraft(ledger,payments,'2025',{interestByPeriod:{'1040|05|2025':0}});
assert.equal(zero.rows.find(r=>r.point1==='05/2025').point8,0);
const excluded=buildStDraft(ledger,payments.map(p=>p.code==='8948'?{...p,excluded:true}:p),'2025');
assert.equal(excluded.rows.find(r=>r.point1==='05/2025').point9,false);
const ambiguous=buildStDraft([{code:'1040',date:'20/05/25',amount:57000}],payments,'2025');
assert.equal(ambiguous.rows.find(r=>r.point1==='05/2025').point8,0);
assert.ok(ambiguous.warnings.some(w=>w.includes("interessi non deducibili")));
const fullDate=buildStDraft([{code:'1040',date:'2/5/2025',amount:100}],[],2025);assert.equal(fullDate.rows[0].point2,100);
console.log('ST complete withholdings, discrepancy, unpaid and ravvedimento passed');

const split=buildStDraft([{code:'1040',date:'20/03/25',amount:30000}],[
 {code:'1040',date:'16/04/2025',month:'03',year:'2025',debit:10000},
 {code:'1040',date:'16/06/2025',month:'03',year:'2025',debit:20075},
 {code:'8948',date:'16/06/2025',month:'03',year:'2025',debit:250}
],2025);
assert.equal(split.rows.length,2);
assert.ok(split.rows.every(r=>r.point2===null)); // 30075 paid vs 30000 withheld: do not invent allocation
assert.equal(split.rows.find(r=>r.point9).point8,0);
assert.equal(split.rows.find(r=>r.point9).point2,null);
assert.equal(split.rows.find(r=>!r.point9).point2,null);
