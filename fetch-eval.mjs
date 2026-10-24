const API='https://bounties.verdikta.org/api';
const g=async u=>{const r=await fetch(u);return {s:r.status,t:await r.text()};};
const subs=await g(`${API}/jobs/330/submissions`);
console.log('=== GET /jobs/330/submissions ===', subs.s);
console.log(subs.t);
let ids=[];try{const j=JSON.parse(subs.t);const arr=j.submissions||j;for(const s of arr){ids.push(s.submissionId??s.subId??s.id);}}catch{}
for(const id of ids){
  const e=await g(`${API}/jobs/330/submissions/${id}/evaluation`);
  console.log(`\n=== evaluation sub ${id} ===`, e.s);
  console.log(e.t.slice(0,6000));
}
