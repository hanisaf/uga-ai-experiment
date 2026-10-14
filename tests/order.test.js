// Statistical check of the constrained shuffle, using makeOrder() lifted from survey.html.
// Run from the repo root: node tests/order.test.js
const fs=require('fs'); const path=require('path'); const ROOT=path.resolve(__dirname,'..');
const src=fs.readFileSync(ROOT+'/survey.html','utf8');
const fn=src.slice(src.indexOf('function makeOrder'), src.indexOf('function mkBtn'));
const data=JSON.parse(fs.readFileSync(ROOT+'/assets/scenarios.json')).scenarios;
const App={orderMode:'shuffle'}; let warns=0; const console2={warn:()=>warns++};
const makeOrder=new Function('App','console','mulberry32',fn+';return makeOrder;')(App,console2,null);
const N=100000, pos=Array.from({length:15},()=>0), firstId={}; let bad=0, tries=[];
for(let k=0;k<N;k++){const o=makeOrder(data); const p=[];o.forEach((di,i)=>{if(data[di].crit){p.push(i);pos[i]++;}});
 if(p.some(x=>x<3||x>11)||p.some((x,j)=>j&&x-p[j-1]<2)) bad++; firstId[data[o[0]].id]=(firstId[data[o[0]].id]||0)+1;}
console.log('violations',bad,'warns',warns);
console.log('crit-trial frequency by position (0-14):',pos.map(x=>(x/N).toFixed(3)).join(' '));
console.log('first-position frequency by id:',JSON.stringify(Object.fromEntries(Object.entries(firstId).map(([k,v])=>[k,(v/N).toFixed(3)]))));
