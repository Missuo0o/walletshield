# Fresh internal recheck — 24 October 2026

## Why another pass was necessary

The prior conclusion was based on the previous validation run. A fresh review of commit `c81c5af` reran all **558** existing tests successfully and nevertheless found additional defects. Passing a maintained test suite establishes its assertions, not the absence of untested defects. “Independent” here means a separate internal review pass and cross-review of fixes; this is not an external security audit or certification.

## Findings and repairs

All five finding groups below were reproduced without real wallet transactions. The current repairs include regression tests for the reproductions.

| Finding | Reproduction and impact | Repair |
| --- | --- | --- |
| Sender balance assigned to the recipient | The basic collector reads `getBalance(from)`, but structured `chain_context.data.nativeBalanceWei` previously selected `data.target` as its subject. Muse could receive the sender's balance labeled as belonging to the recipient/verifier. | The native balance fact binds to the captured transaction sender or requested signer. Token/asset subjects retain their separate units and identities. |
| Metadata could support a financial dimension | Strict full-output validation accepted a deliberately constructed score of 99 when the selected support for high exposure was only `data.chainId`. An evidence ID could contain relevant values while the selected field did not. | Dimension support is checked at the exact selected field. Chain/digest/code-hash metadata has no rated dimension; ordinary addresses, unit metadata and NFT identifiers cannot independently establish financial exposure. Actual quantities, comparisons and observed NFT ownership remain usable; target code presence is execution-only. This is an admissibility constraint, not a fixed score, numeric weight or risk floor. |
| Fork source not rechecked after all work | The source could match during the original-call trace, then change after local execution. The old path still returned `simulation_execution: pass` under the recorded base hash. | After execution, asset/protocol reads and any reverse-swap experiment, the source chain/base header is rechecked before returning and closing the fork. A missing, changed, failed or timed-out binding discards the entire fork group, including an earlier trace or success receipt. The check is bounded to 2.2 seconds, including transports that ignore abort. Other independent collectors remain separate. |
| Late wallet requests and unbounded setup waits | Changing account/provider while the public signing check awaited Snap health, or while the lab awaited session creation, could still prompt the old account. Private callback probes produced one late prompt in each path. Some setup/provider awaits also had no deadline. | Request generations, invalidation, context checks before/after awaits and immediate account/network reads precede prompts. Both reproductions now produce zero late prompts. Wallet reads are bounded to 5 seconds and interactive prompts to 120 seconds in the shared action flow. Setup backend waits are bounded to 15 seconds; connect/identity totals are 180 seconds and installation/pairing 300 seconds. The initial account-change event expected during connection is handled explicitly and the actual account is reread. Timeouts never dismiss wallet prompts or automatically retry them. Local asset preparation retains its separate 120/5/60-second guard. |
| Revoked network query could still return/cache data | Authorization happened before awaiting configuration/RPC. Revoking the session during either await could still yield HTTP 200 with an account snapshot; one probe even started after revocation. | Authorization is rechecked after configuration, after the probe and before error responses. Revoked/deleted identities cannot start a delayed probe, read a warm cache, cache an in-flight result or receive its account state. Invalid credentials return 401; valid but forbidden account/network scope remains 403. |

The source-state fix covers normal returns, failed execution, partial post-receipt failures and derived reverse-sale returns. A cross-review checked that no returned fork array escapes finalization. Child protocol observations keep their child block provenance and record the separately rechecked source base; they are not represented as public-chain execution.

## Scoring policy and historical records

New successfully structured assessments record **`muse-evidence-v6-field-bound-facts`**. The status endpoint and evidence packet expose this policy. Historical/unstructured compatibility validation does not label itself v6. Stored reports are preserved; the webpage warns when an AI result used an older or unrecorded policy rather than claiming it was revalidated or rescored.

Replaying the six original Muse replies from the earlier order/trace follow-up under the stricter field rules produced **4 accepted and 2 rejected**. Both rejected canonical-order outputs lacked a relevant selected fact for a rated dimension. The three null outputs and finite-approval number remained admissible. These results supersede the earlier statement that all six pass the then-current validator; the older dated report remains a historical record. No stored user score was silently changed.

## Current validation

Runtime: Node.js 24.22.1.

| Check | Current result | Interpretation |
| --- | --- | --- |
| `npm test` | **592/592 passed**, 0 skipped | Includes 34 additional tests beyond the 558-test baseline. Tests exercise maintained assertions, not 592 real attacks or a model accuracy benchmark. |
| `npm run build` | Passed | Runtime configuration, generated coverage guide, both TypeScript projects, web bundle, Snap bundle and source/build fingerprint. |
| `npm run test:v3` | Passed: 1 integration test, **23 state scenarios** | Disposable local forks: 16 token-funded V3 cases, 1 generic native simulation, 2 vault/lending changes and 4 authority changes. The updated test also checks final source verification on child-state observations. Source fixture state remains unchanged by analysis. |
| `npm run test:trace` | 1/1 passed | Bounded trace fallback with a fixture upstream lacking both trace methods; no analysis writes upstream. |
| `npm run test:dev-server` | 1/1 passed | Development server private-file isolation. |
| `npm run evaluate:ai` | 12/12 valid synthetic abstention outputs; 120/120 adversarial outputs rejected | Offline validator checks only; no model/RPC calls in this command. |
| Production UI callback regressions | Passed | Actual components/helpers with mocked hooks, wallet providers and backend transports. Account/provider changes, A→B→A changes, silent wallet selection, late reports and setup timeouts are exercised. This is not real MetaMask popup acceptance. |

## Real Muse acceptance in this pass

Fresh evidence was collected from a disposable local fixture chain. Its analysis endpoint allowed reads and rejected writes. This avoided using or resetting the user's local chain, wallet or report database. External threat lookups were disabled for these controlled cases.

| Case | Accepted outcome | Provider attempts |
| --- | --- | --- |
| Canonical structured NFT order | Score **38**, v6 facts validated | 2: initial output rejected for an unsupported signature-verification assertion; one output repair passed. |
| Semantically opaque custom typed order | **No numeric score**, valid evidence-insufficient outcome | 1 |
| Finite token approval with isolated trace fallback | Score **22**, v6 facts validated | 1 |

Totals: **3 completed analyses, 4 real Meta API requests**, including one rejected initial output and its repair. Source fixture block/nonce stayed unchanged during analysis; upstream analysis writes were zero. These are backend/model acceptance cases, not a false-positive/false-negative estimate, calibrated loss probability, independent label benchmark or real browser-wallet acceptance. API usage is not erased by an output rejection.

## What remains unproven

- Muse can still generate an invalid initial output, vary scores or miss risks. Strict validation and one repair constrain accepted results; they do not prove every sentence or calibrate risk accuracy.
- Canonical-header checks reduce stale/mixed source attribution. They do not cryptographically establish a deliberately dishonest RPC's truth, detect every transient change that reverses between checks, or predict execution at a future state.
- Extension prompts cannot be canceled by timing out the page. Wallet-supported hook delivery and previously documented custom-protocol/nonstandard-asset/non-EVM boundaries still apply.
- This pass does not claim a new real MetaMask popup run, public production deployment or external security audit. The current tool supports controlled demonstrations and testing within documented scope. Public real-asset use still needs wallet/browser acceptance, independent evaluation and operational security review.

Source code, regressions and current English/Chinese documentation are included in the update. Secrets, `.local` data, private audit recordings and presentation files are excluded. Machine-readable results: [independent-recheck-2026-10-24.json](independent-recheck-2026-10-24.json).
