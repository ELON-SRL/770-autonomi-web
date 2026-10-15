import assert from "node:assert/strict";
import {parseF24Pages} from "../f24_ade.js";
const months=[
 ["01",[305000,820000,413000]],
 ["02",[345000,902000,400500]],
 ["03",[435000,872000,420500]],
 ["04",[400000,892000,425000,17571]],
 ["05",[470000,982000,435000]],
 ["06",[905900,69608,273230]],
 ["07",[1137794,123080,173808,30653]],
 ["08",[858827,295438,89230]],
 ["09",[476412,177664,279797]],
 ["10",[427514,229642,610517,7059]],
 ["11",[205382,1101925,493368,22403]],
 ["12",[358274,312108,932661]]
];
const expected=[1538000,1647500,1727500,1734571,1887000,1248738,1465335,1243495,933873,1274732,1823078,1603043];
const all=months.flatMap(([month,values])=>values.map(amount=>({month,amount})));
assert.equal(all.length,40);
for(let i=0;i<12;i++)assert.equal(months[i][1].reduce((a,b)=>a+b,0),expected[i],"Month "+months[i][0]);
assert.equal(all.reduce((a,b)=>a+b.amount,0),18126865);
// Simulate PDF.js coordinate rows, including dates carried forward within the same F24 block.
const pages=[];let page=[],y=790;
for(const [month,values] of months){
 for(let i=0;i<values.length;i++){
  if(y<90){pages.push(page);page=[];y=790}
  const cents=values[i],euro=(cents/100).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
  const date=i===0?"16/"+String((Number(month)%12)+1)+"/2025":"";
  const fields=[[124,"1040"],[340,month],[388,"2025"],[453,euro],[530,"0"]];
  if(date)fields.push([60,date]);
  for(const [x,text] of fields)page.push({x,y,text});
  y-=23;
 }
}
if(page.length)pages.push(page);
const parsed=parseF24Pages(pages);
assert.equal(parsed.rejected.length,0);
assert.equal(parsed.rows.length,40);
assert.equal(parsed.rows.filter(x=>x.year==="2025"&&x.code==="1040").reduce((s,x)=>s+x.debit,0),18126865);
console.log("F24 2025 reference regression passed: 40 movements, EUR 181268.65");
