const gws=['https://gateway.pinata.cloud/ipfs/','https://ipfs.io/ipfs/','https://cloudflare-ipfs.com/ipfs/','https://dweb.link/ipfs/'];
const cids=['QmRy4ajqFBM7qbmKpMTfD7coRRgFWyBSYMjpbxLmSjEYzT','QmRdvxnva5G2EWb5Aqyj5pawehDghHjU36xkmuF1tLq4aW'];
async function fetchCid(cid){
  for(const g of gws){
    try{const r=await fetch(g+cid,{signal:AbortSignal.timeout(25000)});if(r.ok){return await r.text();}}catch{}
  }
  return null;
}
for(const cid of cids){
  console.log(`\n########## justification ${cid} ##########`);
  const t=await fetchCid(cid);
  console.log(t?t.slice(0,9000):'(could not fetch from any gateway)');
}

// 1792870538
