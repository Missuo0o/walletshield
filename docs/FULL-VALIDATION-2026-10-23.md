# WalletShield final verification — 2026-10-23

[简体中文](FULL-VALIDATION-2026-10-23-zh.md) · [Sanitized per-case results](validation-2026-10-23.json)

This review covers v0.4.1 and the fixes delivered with this record. Dates use America/New_York. It tests implemented paths at several different layers; it does not establish that every wallet action is intercepted or that the numeric model judgments are calibrated. Previous dated reports remain historical records.

## Verification results

| Layer | Actual result | What it establishes |
| --- | --- | --- |
| Unit and regression tests | **460/460 passed** on Node.js **24.19.0** | Request decoding, evidence handling, validation, limits, authentication, storage/isolation, wallet outcomes and UI helpers behave as asserted by these cases. Includes two new regression tests in this change. |
| Build | Typechecks, production webpage, Snap build/evaluation, manifest checksum and build fingerprint passed | Current source builds on the supported runtime. It does not establish marketplace approval. |
| Local wallet lab | **66/66 cases**, comprising **51 actual local transactions and 15 local-node signatures**, covering 25 profiles | Implemented local fixtures and request generation execute as expected. The intentionally blocked sale is an expected negative case. These are not 66 MetaMask popup tests. |
| Full evidence collection | All 66 lab requests used the production collector path before their operation | Collector routing, selected RPC state, bounded simulations and evidence construction were exercised against real isolated-chain state. Successful observations are not proof of complete asset discovery. |
| V3 and state integration | **23 scenarios passed** | Selected V3 paths, execution fields and before/after authority/protocol observations work on disposable fixtures. |
| Extended evidence | **15 scenarios passed** | Additional candidate signature/account/protocol evidence follows the bounded adapter behavior. See the refreshed `extended-evidence-acceptance.json`. |
| Other integration | Local funding/repeat preservation/spend/revoke, V2/Permit/simulation security checks and selective test-asset cleanup passed | Real local state changes and negative paths, including supplied gas/nonce failures and restricted selling, were checked. |
| Offline model-output checks | **12 valid-abstention fixtures** and **120/120 rejected adversarial mutations** | The maintained validator rejects those invalid outputs without a model/RPC call. These counts do not measure Muse detection accuracy. |
| Development HTTP privacy | Temporary real Vite server checks passed | Private environment/database/audit paths are denied while permitted shared imports remain accessible. |
| Production dependencies | **0 reported advisories** | Result of this dependency database snapshot; not a guarantee of absence of vulnerabilities. |
| Complete dependency tree | **16 low-severity transitive entries**, no moderate/high/critical entries | The remaining root is `elliptic` through the Snaps CLI build chain; no compatible fix was advertised. An incompatible downgrade was not forced. |

The final unit suite, build, V3 suite and 66-case execution suite were run with Node.js 24.19.0. Some additional integration and model-audit harnesses also ran under the machine's Node.js 26.12.0; that runtime is outside the project's declared Node.js 24 support. This is recorded rather than presented as a second supported runtime.

## Real Muse requests

The batch used **71 representative cases across all 30 analysis profiles**. It first collected evidence on an independent disposable local node, before each of the 66 lab operations. It then passed those collected observations through the production scan API, real Muse and a separate SQLite store. Five further cases supplied explicit backend inputs for raw signing, wallet permission, UserOperation, network configuration and read-only analysis. These five do **not** establish automatic Snap interception.

This was a two-stage evidence replay, not 71 simultaneous fresh-wallet requests: original block numbers, observation timestamps and scope were preserved. Later scans could correctly report stale evidence. No timestamps were refreshed to make the evidence look current. The model input and validators were not weakened to obtain a number.

| Batch stage | Provider attempts | Accepted assessments | Numeric scores | Valid abstentions | Failed / rejected |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial 71 case runs | 85, including 14 output repairs | 64 | 56 | 8 | 7 |
| One bounded follow-up for each of the 7 failures | 7 | 3 recovered | 3 recovered | 0 additional | 4 remain |
| Final case outcomes | **92 total attempts** | **67/71** | **59** | **8** | **4** |

The initial failures were one HTTP 500 and six request timeouts. Follow-up recovered the lending prerequisite approval, unwrap and ERC-3009 transfer cases. Four outputs remained rejected:

| Case | Final rejection |
| --- | --- |
| SIWE login | Score and explicit abstention were inconsistent. |
| Order signature | An unsupported identity, safety, future-outcome or dollar-loss assertion was detected. |
| Login domain mismatch | Structured output/fact/citation validation failed. This attempt preceded the more specific diagnostic messages added in this change. |
| Permit owner mismatch | A high identity-risk assertion lacked the validator's required relevant adverse observation. |

All four retain **no accepted score**. The evidence remains readable. A rejected answer is not converted to a rule score or silently treated as safe. Timeouts, model misinterpretation and output rejection remain real product limitations. More repeated calls could change the outcomes; this review stopped after the stated bounded follow-up and retained both initial and follow-up results.

The model gave 59 validated numbers; this is **not** 59 independently proven correct risk judgments. Exact fact copying, citation relevance and consistency checks do not fully prove natural-language entailment, arithmetic, risk ranking or robustness against arbitrary prompt injection. There is no independent labelled accuracy/calibration benchmark in this review. The score remains an uncalibrated risk indicator, not loss probability.

## Actual MetaMask Snap acceptance

After the user unlocked the dedicated test wallet, the latest Snap was reloaded and paired in Chrome MetaMask Flask. Two requests traversed the actual wallet hook, authenticated Snap transport, current backend, real Muse, SQLite and wallet display:

| Actual wallet request | Snap delivery and Muse | Wallet decision |
| --- | --- | --- |
| Finite approval of 100 LAB-USD | `paired-snap` report persisted; **28/100** displayed in the wallet | Canceled; no allowance was committed on the upstream local chain. |
| Plain local test message | `paired-snap` report persisted; valid **no-score abstention** displayed | Canceled; no generated signature was submitted for consumption. |

These added **two actual provider attempts**, separate from the 92-attempt isolated batch. Both corresponding lab-history rows showed **Received**, the model result and **Canceled in wallet**. This confirms two real end-to-end UI cases; it does not certify every browser/wallet version, hardware wallet, mobile wallet or all 66 popup variants.

The message hook did not supply a request-bound chain ID for the plain message. The Snap correctly did not infer one from an independent active-network snapshot. The model abstained because the message's future authority/consumption could not be established. This is a valid completed analysis with no number, not a broken Muse connection.

The combined report can show **Unable to assess** while also showing a numeric Muse indicator: the heading preserves unfinished qualitative checks, while the number is the model's assessment of the available observations. The heading is not an assertion that no model request ran, nor is the number a complete safety verdict.

## Public RPC and webpage checks

Configured Infura endpoints were queried read-only. Mainnet returned chain **1**, block **26256888**; Sepolia returned chain **11155111**, block **11978228** at the recorded probe times. Pinned calls and historical-balance observations succeeded. The bounded trace probe was **unavailable on both tested endpoints**. That was retained as missing capability rather than an empty successful trace. The webpage also completed a Sepolia account/RPC check.

Disconnected-wallet gating and a history search with a deliberately unmatched term were exercised. No match returned no rows. Mainnet/Sepolia tests did not send an asset transaction or create a real-funds approval.

## Defects fixed in this change

1. **A transaction-insight timeout ended too early.** The old code cleared the abort timer once response headers arrived. A stalled JSON body could then hang beyond the deadline. The timer now remains active through JSON body parsing. A regression supplies headers immediately, stalls the body, and verifies abort plus a visible unable-to-assess response.
2. **Some structured-fact rejection messages were too generic.** Missing or ambiguous facts, copied-value mismatches, evidence-ID mismatches and missing per-reason/per-dimension fact support now have specific bounded messages. A regression checks three distinct failures and confirms that no rejected score is exposed. This is a diagnostic correction, not a relaxed scoring policy or a prompt change.
3. **Snap package repository metadata was absent.** The canonical repository and Snap directory were added, and the Snap/manifest checksum was rebuilt. The supported-runtime final build completed without that metadata warning.

The user's existing chain on port 8545 was preserved. Bulk tests used a git-archive copy, its own fixture deployment and a separate loopback node. Only the private copy's loopback port was redirected. Asset clearing ran on temporary fixtures, not the user's balances. The two actual wallet requests were canceled after inspection. No seed phrase, private key, API key or generated asset signature was included in the published validation summary. Raw model bodies, local databases and presentation files remain untracked.

## Remaining limits and product impact

| Remaining issue | Effect on WalletShield |
| --- | --- |
| Model reliability and latency | Some valid requests can time out, abstain or fail output checks. Evidence must remain available, and missing scores must remain visible. Do not promise a number for every operation. |
| Score accuracy is not independently calibrated | The tool can provide evidence-based advice, but should not market a percentage loss probability or proven detection rate. |
| Wallet entry-point limits | Transaction/message hooks do not universally deliver permissions, sessions, UserOperations or network settings. Explicit adapters require cooperating integration. |
| Bounded protocol and asset understanding | Custom semantics, deep/opaque batches, unusual accounting, future implementation changes and later signature use can exceed the collected evidence. Unknown must not become a safety pass. |
| RPC capabilities and provider freshness | This account's public trace probes were unavailable. RPC configuration does not supply every trace, historical state, price or threat fact. |
| Future execution and economic behavior | Fork success cannot guarantee future sellability, liquidity, absence of MEV, destination-chain arrival or later signature consumption. |
| Public-service readiness | Real HTTPS deployment, distribution acceptance, load/abuse operations, retention and incident recovery still need deployment-specific acceptance. An Infura key alone is insufficient. |
| Upstream build advisories | Low-severity CLI dependency findings remain tracked until a compatible upstream fix is validated. |

These limits are material to claims of universal protection. They do not prevent a clearly scoped EVM pre-sign advisory prototype and local demonstration. Forced blocking and post-sign monitoring remain outside the user's requested product scope.

## Reproduction

```sh
# Use Node.js 24
npm test
npm run build
npm run evaluate:ai
npm run test:dev-server
npm run test:v3
```

The development privacy and V3 suites create their own disposable servers/nodes. Legacy chain/lab commands use the configured local development chain; use an isolated deployment when preserving existing state. Live evaluation is paid and explicit; the offline evaluation command above does not call Muse. The complete batch's sanitized case IDs, initial/follow-up outcomes and tool summaries are in [validation-2026-10-23.json](validation-2026-10-23.json). Historical reports are not rewritten to match this run.

For a fresh local start use `npm run demo`, then connect the dedicated Flask wallet and **Reload and pair Snap**. If the existing services are running, keep their chain state and reload the rebuilt Snap instead of resetting the chain. Continue testing the local lab with test assets; choose Confirm or Cancel in MetaMask yourself.
