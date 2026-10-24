const API='https://bounties.verdikta.org/api';
const g=async u=>{try{const r=await fetch(u);return {s:r.status,t:await r.text()};}catch(e){return{s:0,t:String(e)}}};
const job=await g(`${API}/jobs/330`);
console.log('=== GET /jobs/330 (public) ===',job.s);
let j={};try{j=JSON.parse(job.t).job||JSON.parse(job.t);}catch{}
console.log('submissionCount:',j.submissionCount,'publicSubmissions:',j.publicSubmissions);
console.log('submissions field:',JSON.stringify(j.submissions,null,1));
// try evaluation + diagnose for sub ids 0..3
for(const id of [0,1,2,3]){
  const e=await g(`${API}/jobs/330/submissions/${id}/evaluation`);
  console.log(`\n--- /submissions/${id}/evaluation [${e.s}] ---`);
  console.log(e.t.slice(0,5000));
  const d=await g(`${API}/jobs/330/submissions/${id}/diagnose`);
  console.log(`--- /submissions/${id}/diagnose [${d.s}] ---`);
  console.log(d.t.slice(0,1500));
}

// 1792870495
