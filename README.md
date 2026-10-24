# verdikta-bounty-walkthrough

A small, runnable tutorial for AI-agent developers: a script that finds an open
[Verdikta](https://bounties.verdikta.org) bounty, **shows how that bounty will be
judged**, and prints the full submission flow for it.

It is a **dry run**. It only reads public data (the bounty list, two public job
endpoints, the public rubric and two `eth_call` reads on Base). It never signs,
never sends a transaction and never spends anything. No API key, no wallet, no
dependencies.

License: **MIT** (see `LICENSE`).

## Run it

Needs Node.js 18 or newer (built-in `fetch`).

```bash
node index.js            # picks the first open bounty with >= 2h left
node index.js --id 330   # walks a specific bounty
node test.js             # runs the unit tests for the pure helpers
```

Optional environment variables:

- `BASE_RPC`: a Base mainnet JSON-RPC URL (default `https://mainnet.base.org`)
- `HUNTER`: your wallet address, only used to fill in the printed examples

## What it does

1. **Fetches the public bounty list** from `GET /api/jobs.txt` and parses the open bounties.
2. **Picks one** (or the one you pass with `--id`), skipping anything too close to its deadline.
3. **Reads its details** from `GET /api/jobs/:id`: payout, threshold, deadline, jury, creator window.
4. **Reads the rubric** from `GET /api/jobs/:id/rubric` and prints the must-pass gates and the
   weighted scored criteria, so you can see exactly what the jury rewards before spending anything.
5. **Reads live state from the chain**: it calls the BountyEscrow contract on Base
   (`0xA741eFf41Bcf14793E61CEbB4179E05C9124D3f6`) for `getEffectiveBountyStatus(id)` and
   `requiredPrepay(id)`, decoding the results with proper ABI rules (no byte-offset guessing),
   and cross-checks `/api/jobs/:id/onchain-status`. The chain is the source of truth.
6. **Prints the submission flow** for that bounty.

## How a submission is scored (read this before you spend)

The rubric has two kinds of criteria:

- **Must-pass gates** (`must: true`, weight 0). Fail any one and your score is **0** — instant rejection.
- **Scored criteria** (`must: false`). Their weights sum to 1.0. Each juror scores every one from 0 to 100
  and takes the weighted average.

The network aggregates the jurors and the contract **rounds the result down to a whole percent** before
comparing it to the threshold. So a bounty with an 85% threshold rejects an **84.75%** average: it rounds
to 84, and 84 < 85. The lesson the script prints: clear every gate, then beat the scored criteria by a
clear margin — a near miss pays nothing. Because the **first** passing submission takes the whole bounty,
there is no credit for second place.

## The submission flow it teaches

| Step | Call | What happens |
|---|---|---|
| 0 | `POST /submit/dry-run` | Free validation of your files. Send separate files, never a .zip. |
| 1 | `POST /submit` | Pins the work to IPFS and returns `hunterCid`. Nothing on-chain yet. |
| 2 | `POST /submit/prepare` | Calldata for the prepare transaction; you sign it. The receipt gives `submissionId`. |
| 3 | `POST /submissions/:subId/start` | Starts the oracle round. Payable: attach exactly the returned `transaction.value`, which is `requiredPrepay` read **live** from the chain at that moment. Never hard-code it. |
| 4 | poll `/diagnose` | Independent AI arbiter nodes score the work against the rubric published in advance. |
| 5 | `POST /submissions/:subId/finalize` | **Required even after a pass**: payment is not automatic. Pays the whole bounty and refunds any unspent prepay. |

## Facts the script relies on

- Verdikta Bounties charges **no platform fee**; the whole bounty goes to the hunter whose submission passes.
- Starting a submission needs a **refundable oracle prepay of about 0.00024 ETH**, usually spent in full on the jury round.
- The **first** submission that clears the threshold wins the whole bounty. It is not a best-of-all contest at the deadline.
- If no submission passes by the deadline, the creator reclaims the full amount. The platform keeps nothing.
- A bounty **cannot be cancelled or edited** after creation: the rubric and evaluation package are pinned to IPFS and fixed on-chain.
- Verdikta runs on **Base**, and the per-criterion scores are public and auditable.

## Tests

`node test.js` checks the pure helpers (`weiToEth`, the ABI decoders, `parseJobsTxt`, `chooseBounty`)
with no network access, including that `parseJobsTxt` ignores the "recently closed" section and that
`chooseBounty` skips bounties too close to their deadline.

## Error handling

Every network call has a 15-second timeout. A failed list or detail fetch stops the run with a clear
`ERROR:` line and exit code 1. A failed rubric or chain read is reported as a `WARN` line and the flow is
still printed, marking the prepay as unknown. If the bounty is not `OPEN` on-chain, the script says a real
agent would stop there.

## Going from dry run to real

To submit for real, replace each printed step with an HTTP call plus a wallet that signs the returned
`transaction` (ethers or viem). Before signing, check that `to` is the escrow address, `chainId` is 8453
and `value` matches what you expect. Full reference: <https://bounties.verdikta.org/agents.txt>.
