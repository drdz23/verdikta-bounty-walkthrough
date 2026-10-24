#!/usr/bin/env node
// verdikta-bounty-walkthrough
// A DRY-RUN tutorial for AI-agent developers: find an open Verdikta bounty
// and print, step by step, how an agent would submit work to it.
//
// It only READS data: the public bounty list, two public job endpoints and
// two eth_call reads on Base. It never signs, never sends a transaction and
// never spends anything. No API key, no wallet, no dependencies (Node 18+).
//
// Usage:
//   node index.js            # pick the first open bounty with >= 2h left
//   node index.js --id 330   # walk a specific bounty
//
// Optional env vars:
//   BASE_RPC   Base mainnet JSON-RPC URL (default https://mainnet.base.org)
//   HUNTER     your wallet address, only used to fill in the printed examples

'use strict';

const API = 'https://bounties.verdikta.org/api';
const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const HUNTER = process.env.HUNTER || '0xYOUR_WALLET_ADDRESS';
const ESCROW = '0xA741eFf41Bcf14793E61CEbB4179E05C9124D3f6'; // BountyEscrow on Base
const BASE_CHAIN_ID = 8453;
const MIN_HOURS_LEFT = 2;
const TIMEOUT_MS = 15000;

// 4-byte selectors = first 4 bytes of keccak256(signature).
// Precomputed so the script needs no crypto library; verify with:
//   cast sig "requiredPrepay(uint256)"
const SEL = {
  requiredPrepay: '0xa22ede63',           // requiredPrepay(uint256) -> uint256
  getEffectiveBountyStatus: '0x5a12ff6d', // getEffectiveBountyStatus(uint256) -> string
};

// ---------- small helpers ----------

const log = (...a) => console.log(...a);
const hr = () => log('-'.repeat(72));

function weiToEth(wei) {
  const w = BigInt(wei);
  const whole = w / 10n ** 18n;
  const frac = (w % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

async function httpGet(url, { json = true } = {}) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new Error(`network error on GET ${url}: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${url} -> HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return json ? res.json() : res.text();
}

async function ethCall(selector, bountyId) {
  const arg = BigInt(bountyId).toString(16).padStart(64, '0');
  const body = {
    jsonrpc: '2.0', id: 1, method: 'eth_call',
    params: [{ to: ESCROW, data: selector + arg }, 'latest'],
  };
  let res;
  try {
    res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`RPC network error (${RPC}): ${err.message}`);
  }
  const out = await res.json();
  if (out.error) throw new Error(`RPC error: ${out.error.message || JSON.stringify(out.error)}`);
  return out.result; // 0x-prefixed hex
}

// ABI-decode a single uint256 return value.
function decodeUint(hex) {
  return BigInt(hex);
}

// ABI-decode a single dynamic `string` return value:
// word 0 = offset, word at offset = length, then the UTF-8 bytes.
function decodeString(hex) {
  const data = hex.slice(2);
  const offset = Number(BigInt('0x' + data.slice(0, 64))) * 2;
  const len = Number(BigInt('0x' + data.slice(offset, offset + 64)));
  const bytes = data.slice(offset + 64, offset + 64 + len * 2);
  return Buffer.from(bytes, 'hex').toString('utf8');
}

// Parse one bounty line of /api/jobs.txt, e.g.
// "#330 | Build a ... | 0.005 ETH | deadline: 2026-10-31T... | 167.9h left | 0 submissions"
const LINE_RE = /^#(\d+) \| (.+) \| ([\d.eE+-]+) ETH \| deadline: (\S+) \| ([\d.]+)h left \| (\d+) submissions?/;

function parseJobsTxt(text) {
  const openPart = text.split(/RECENTLY CLOSED/)[0];
  const jobs = [];
  for (const line of openPart.split('\n')) {
    const m = line.trim().match(LINE_RE);
    if (m) {
      jobs.push({
        id: Number(m[1]), title: m[2], eth: m[3], deadline: m[4],
        hoursLeft: Number(m[5]), submissions: Number(m[6]),
      });
    }
  }
  return jobs;
}

function argId() {
  const i = process.argv.indexOf('--id');
  if (i === -1) return null;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 0) throw new Error('--id needs a bounty number, e.g. --id 330');
  return n;
}

// ---------- main ----------

async function main() {
  log(`verdikta-bounty-walkthrough (DRY RUN - nothing is signed or sent)`);
  log(`run started: ${new Date().toISOString()} (UTC)`);
  log(`api: ${API}   rpc: ${RPC}`);
  hr();

  // 1. Fetch the public bounty list.
  log('[1] Fetching the public bounty list: GET /api/jobs.txt');
  const txt = await httpGet(`${API}/jobs.txt`, { json: false });
  const header = txt.split('\n')[0].trim();
  const open = parseJobsTxt(txt);
  log(`    list header: "${header}"`);
  log(`    parsed ${open.length} open bounties:`);
  for (const j of open) {
    log(`      #${j.id}  ${j.eth} ETH  ${j.hoursLeft}h left  ${j.submissions} subs  ${j.title.slice(0, 50)}`);
  }
  if (open.length === 0) throw new Error('no open bounties found in /api/jobs.txt');

  // 2. Pick one.
  const wanted = argId();
  let id;
  if (wanted !== null) {
    id = wanted;
    log(`\n[2] Using bounty #${id} from --id`);
  } else {
    const pick = open.find((j) => j.hoursLeft >= MIN_HOURS_LEFT);
    if (!pick) throw new Error(`no open bounty with >= ${MIN_HOURS_LEFT}h left`);
    id = pick.id;
    log(`\n[2] Picked bounty #${id} (first open bounty with >= ${MIN_HOURS_LEFT}h left)`);
  }

  // 3. Details from the API (public endpoint, no key).
  log(`\n[3] Reading details: GET /api/jobs/${id}`);
  const { job } = await httpGet(`${API}/jobs/${id}`);
  const windowSec = Number(job.creatorAssessmentWindowSize || 0);
  log(`    title:      ${job.title}`);
  log(`    type:       ${job.workProductType}`);
  log(`    payout:     ${job.bountyAmountWei ? weiToEth(job.bountyAmountWei) : job.bountyAmount} ETH (whole amount to the first passing submission; no platform fee)`);
  log(`    threshold:  ${job.threshold}%   class: ${job.classId}   api status: ${job.status}`);
  log(`    deadline:   ${new Date(job.submissionCloseTime * 1000).toISOString()}`);
  log(`    targeted:   ${job.targetHunter ? job.targetHunter : 'no (open to anyone)'}`);
  log(`    creator approval window: ${windowSec > 0 ? windowSec + ' s' : 'none'}`);
  if (Array.isArray(job.juryNodes)) {
    log(`    jury:       ${job.juryNodes.map((n) => `${n.provider}/${n.model}`).join(', ')}`);
  }
  log(`    rubric:     GET /api/jobs/${id}/rubric  (evaluationCid ${job.evaluationCid})`);

  // 4. Live chain reads. The chain is the source of truth.
  log(`\n[4] Reading live state from BountyEscrow ${ESCROW} on Base (chainId ${BASE_CHAIN_ID})`);
  let chainStatus = null;
  let prepayWei = null;
  try {
    chainStatus = decodeString(await ethCall(SEL.getEffectiveBountyStatus, id));
    log(`    getEffectiveBountyStatus(${id}) = "${chainStatus}"`);
  } catch (err) {
    log(`    WARN could not read status on-chain: ${err.message}`);
  }
  try {
    prepayWei = decodeUint(await ethCall(SEL.requiredPrepay, id));
    log(`    requiredPrepay(${id})           = ${prepayWei} wei (${weiToEth(prepayWei)} ETH)`);
  } catch (err) {
    log(`    WARN could not read requiredPrepay on-chain: ${err.message}`);
  }
  // Cross-check with the server's pre-decoded view (a convenience, not an authority).
  try {
    const oc = await httpGet(`${API}/jobs/${id}/onchain-status`);
    log(`    /onchain-status: status=${oc.status} linkage=${oc.linkage && oc.linkage.state} cached=${!!oc.cached}`);
  } catch (err) {
    log(`    WARN /onchain-status unavailable: ${err.message}`);
  }
  if (chainStatus && chainStatus !== 'OPEN') {
    log(`    NOTE bounty is ${chainStatus} on-chain, so a real agent would stop here.`);
  }

  // 5. The submission flow, printed as a plan.
  const prepayText = prepayWei !== null
    ? `${weiToEth(prepayWei)} ETH right now`
    : 'unknown (RPC read failed)';
  hr();
  log(`SUBMISSION FLOW for bounty #${id} (what an agent WOULD do; dry run)`);
  hr();
  log(`Step 0  Validate files for free (no gas):
        POST ${API}/jobs/${id}/submit/dry-run   (multipart: files=..., hunter=${HUNTER})
        Send each deliverable as its own file (.md/.txt/.json/.png). Never one .zip:
        the AI jurors cannot read archives and would see nothing.`);
  log(`Step 1  Pin the work to IPFS:
        POST ${API}/jobs/${id}/submit   -> response.submission.hunterCid
        This only uploads. Nothing is on-chain yet.`);
  log(`Step 2  PREPARE on-chain:
        POST ${API}/jobs/${id}/submit/prepare  -> { transaction: { to, data, value, chainId } }
        Check to == ${ESCROW} and chainId == ${BASE_CHAIN_ID}, sign, broadcast.
        Read the SubmissionPrepared event from the receipt -> submissionId, evalWallet.${windowSec > 0 ? `
        (This bounty has a ${windowSec}s creator window: the creator may approve directly
        during it; otherwise start after it ends and before the deadline.)` : ''}`);
  log(`Step 3  START the oracle round (payable):
        POST ${API}/jobs/${id}/submissions/<submissionId>/start   body { hunter }
        Attach EXACTLY transaction.value as msg.value. That value is requiredPrepay(${id})
        read LIVE from the contract at submission time (it was ${prepayText}).
        Never hard-code it: re-read it right before you sign. It is a refundable oracle
        prepay of roughly 0.00024 ETH that in practice is usually spent in full.`);
  log(`Step 4  ORACLE ROUND (typically a few minutes):
        Independent AI arbiter nodes on the Verdikta network score the work against the
        rubric published in advance; per-criterion scores are public and auditable.
        Poll GET ${API}/jobs/${id}/submissions/<submissionId>/diagnose
        until diagnosis.nextAction == "FINALIZE".`);
  log(`Step 5  FINALIZE (required, even after a pass):
        POST ${API}/jobs/${id}/submissions/<submissionId>/finalize   body { hunter }
        Payment is NOT automatic. Finalize pays the whole bounty if this is the first
        submission to clear the ${job.threshold}% threshold, marks it failed otherwise,
        and refunds any unspent prepay.`);
  log(`After   GET ${API}/jobs/${id}/submissions/<submissionId>/evaluation
        shows the jury's scores and justification (check warnings[] is empty).`);
  hr();
  log(`Rules worth knowing: first passing submission wins (not best-of-all at the deadline);
if nobody passes by the deadline the creator reclaims the full amount; a bounty cannot
be cancelled or edited once created (rubric pinned to IPFS, fixed on-chain).`);
  log(`done: ${new Date().toISOString()} (UTC). Nothing was signed or sent.`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
