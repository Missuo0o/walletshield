# Order evidence, abstention and fork tracing — 2026-10-23

[中文](ORDER-TRACE-FOLLOWUP-2026-10-23-zh.md) · [Previous reliability work](RELIABILITY-FOLLOWUP-2026-10-23.md)

This follow-up addresses two concrete gaps: a semantically unresolved custom order received inconsistent numeric/abstaining answers, and an upstream RPC without tracing left useful fork evidence unavailable to Muse. It does not guarantee a score for every request or establish independently measured accuracy.

## What changed

- The previous simplified `Order` lab message was a custom ERC-20-shaped typed request, **not a complete NFT marketplace order**. The main order case now signs the complete supported `OrderComponents` graph, offering the wallet's current local NFT for fixed native consideration. The custom order remains a separate negative-control case, explicitly unresolved.
- A new optional `LabOrderVerifier` exposes a fixed lab domain and read-only candidate information/counter/status getters. It has **no fulfillment, cancellation, nonce consumption or signature-validation implementation**. `npm run deploy:lab` adds it to a valid existing lab without replacing existing contracts or clearing assets. Preparing an NFT is still required; the backend does not sign or submit orders.
- The collector compares the exact signed order domain hash with the candidate `information()` return, queries the first eight offered items, supports ERC-1155 `balanceOf(owner,id)`, compares ERC-20/ERC-1155 signed endpoint amount bounds with balances, and flags NFT-owner differences. Candidate counter/status getter returns remain unauthenticated observations. No spender/conduit or actual fillability is assumed from a familiar ABI.
- `numeric_assessment_basis` constrains unresolved typed requests: hashes, encoding success, verifier/account code, addresses, a generic permission warning and unrelated native balances alone cannot support a number. A cited, eligible request-bound adverse fact may support a conditional assessment. Otherwise Muse must return `null/unknown`. The prompt and validator enforce the same boundary; no points, floors or fallback numbers are calculated.
- An order-domain assertion must cite evidence bound to the actual canonical order, verifier, offerer, order hash, recomputed signed domain hash and pinned chain/block/hash/time. This comparison does not authenticate identity, signature acceptance or order-state semantics. Unsupported official-verifier claims are also rejected.
- When fork simulation is enabled, the **same existing temporary Anvil fork** performs a read-only `debug_traceCall` before any local execution. Source and child chain/base-header bindings are checked before and after; supported original transaction fields are preserved. `call_trace_fork` retains bounded frames as execution-only facts for Muse, including when later local execution fails. The provider and isolated-fork observations remain separate.

The fork trace transport accepts only three read methods. Limits are 6 seconds total, 1.8 seconds per request, 750 KB, 128 frames and depth 20. It does not send an upstream transaction, obtain a real signature, or create a second fork. Anvil, the required historical state, correct snapshots and the existing simulation budget must be available. Unsupported envelopes, missing history, reorganization, truncation and timeouts remain explicit gaps.

## Live checks

Fresh disposable-chain state was collected through an upstream fixture that rejected both provider trace methods and all state-changing RPCs. The source chain's latest header, nonce and native balance were unchanged after analysis. No wallet signatures or real-network transactions were submitted.

| Case | First result | Second result |
| --- | ---: | ---: |
| Complete canonical-shaped NFT order | 38 | 38 |
| Unresolved custom order, without a concrete adverse anchor | Valid abstention | Valid abstention |
| Finite approval with isolated-fork trace | 22 | Not repeated |

The final batch completed **5 analyses using 6 Muse attempts**, including one output repair. That repair exposed an overly broad nonce/domain assertion guard around conditional advice; a regression fix separately validates the original saved provider output without another paid request. An earlier pre-final batch timed out after two attempts and is retained separately; it is not counted as an accepted result. **Eight provider attempts were made across both batches.** Within each repeated case, the captured evidence-packet hash was identical. Two repeated results do not establish general repeatability, accuracy or calibration.

The actual configured Infura mainnet endpoint was also tested with a fixed zero-value unsigned call: provider tracing was unavailable, while the local fork produced a passing single-frame trace at base block **26259075**. This proves that bounded path for that snapshot, not arbitrary contracts, historical availability or complete asset simulation.

Node.js 24.19.0 validation passed: **516 unit/regression tests**, **23 internal V3/state scenarios**, the new real disposable fork-trace integration, the development-server private-file integration, typechecks and web/Snap production builds. The offline validator accepted 12 valid fixtures and rejected 120 adversarial outputs without calling a model. Details are recorded in [the sanitized verification record](order-trace-followup-2026-10-23.json). The earlier 495-test report remains historical; automated tests are not paid Muse analyses or a detection-accuracy benchmark.

## Using the update

1. Run `npm run deploy:lab` on the owned local chain to add the optional order fixture; existing contracts and assets are preserved. This was completed on the current development environment.
2. Keep `ENABLE_FORK_SIMULATION=1` in the backend configuration to enable isolated execution and the additional original-call trace. This setting is already enabled in the current local environment. No extra trace-provider key is needed for this path; public RPC history still needs to work.
3. Build/restart the service, refresh the webpage and use **Wallet setup → Reload and pair Snap** after a bundle change.
4. Prepare local assets, select **NFT order components**, review the actual NFT, native consideration, time and verifier in MetaMask, then inspect WalletShield. **Custom unresolved order** intentionally tests an unsupported interpretation and may have no numeric score. Confirm or cancel only in the wallet.
5. `npm run test:trace` runs the disposable no-upstream-trace integration without Muse or a browser wallet. `npm run test:v3` checks the existing isolated V3/state scenarios; `npm test` runs unit/regression tests.

Remaining boundaries include authenticated marketplace/conduit identity, criteria proofs, arbitrary custom protocol meaning, actual unsigned-order acceptance and future fulfillment. Trace is not full asset coverage, a honeypot certificate or a future-execution guarantee. Legitimate abstention is retained; eliminating it would hide these gaps.
