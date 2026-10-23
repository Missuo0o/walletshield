# WalletShield full validation and remediation — 2026-10-22

This review covers the current v0.4.1 working tree. Dates use America/New_York. It is an engineering and model-output review, not an independent penetration-test certification, a proof of complete attack coverage, or a calibrated loss-probability study. The changes were applied locally; this review did not publish a release or push to GitHub.

## What was exercised

| Layer | Verification and result |
| --- | --- |
| Unit and regression suite | **458/458 passed**, including parsing, supported signatures, units, evidence provenance, limits, transport failures, authentication, report isolation, wallet outcomes, history and UI state helpers |
| Required runtime and build | Node.js 24; application and Snap TypeScript checks, production web build, Snap build/evaluation and manifest checksum |
| Wallet laboratory | **66/66** representative cases executed against a separate disposable node: **51 transactions and 15 signatures**, spanning 25 of 30 analysis profiles; the intentionally restricted sale reverted as expected |
| Complete evidence collection | **66/66** requests exercised the current collector routing and isolated simulation. Evidence IDs were unique and every packet fit the 200,000-byte model input limit; maximum observed packet **108,954 bytes**. Of 51 transactions, 50 fork executions completed and the intentionally restricted sale remained incomplete/reverted |
| V3/state integration | One disposable-fork suite passed, containing **23 scenarios**: 16 token-funded V3 route variants, one generic native-funded request, two vault/lending cases and four authority changes |
| Additional integration | Funding, approve/spend/revoke, V2 round trips, supplied gas/nonce failures, supported Permit verification, account/position evidence and selective local-balance cleanup passed on temporary fixtures |
| Development file privacy | A real temporary Vite server denied private credentials, databases, audit files and environment files over `/@fs`, while shared source imports remained accessible. The running local stack was also re-probed after the fix |
| HTTP boundaries | Running service health, invalid input, foreign-origin history/pair/scan rejection and private-file rejection passed. The invalid scan did not start model analysis |
| Hosted packaging | A separate workspace built hosted web/Snap artifacts, checked matching package identity and allowlisted staging files, and confirmed the hosted bundle did not point to local runtime endpoints. No package was published and no real domain/TLS deployment was performed |
| Infura | Read-only mainnet and Sepolia checks returned their correct chain IDs, current blocks, fixed calls and a historical-balance probe. Call tracing was reported **unavailable** on both tested endpoints; this was not treated as an empty trace or proof of safety |
| GoPlus | The enabled collector received token/address observations for one explicit public token candidate and generated counterparties. Provider data freshness remained unverified. A non-hit was not treated as authenticated identity or token safety |
| Offline AI checks | **12** maintained synthetic fixtures accepted valid abstention; **120/120** adversarial mutations were rejected. These are validator checks, not 120 successful attack detections by Muse |
| Live Muse | **17 actual requests**, including six output repairs, produced **11 accepted assessments** from ten planned case runs (including a repeated finite approval) and one nonce follow-up. Ten assessments had numbers and one abstained. No real assets were transacted and no generated asset signatures, recovery phrases or private keys were sent |
| Dependency advisory scan | Production dependency audit: **0 advisories**. Full development tree: **12 low-severity transitive advisory entries**, rooted in the Snap CLI's elliptic dependency chain; no moderate/high/critical entries were returned |

The lab was run in an isolated copied workspace with its own random-port Anvil nodes and fresh fixture manifests. No existing `.local` deployment files or credentials were copied into those nodes. The user's existing port-8545 chain was neither reset nor used for test transactions. Each full collector run verified the upstream block hash and account nonce were unchanged.

The five profiles outside the wallet laboratory are raw `eth_sign`, wallet permission/session requests, UserOperation, network configuration and read-only RPC. Their explicit API/provider inputs have unit coverage, but they are **not** five additional automatically intercepted Snap flows. The 30 profiles are categories of bounded evidence analysis, not a count of fully protected user behaviors.

A local-node signature is not a MetaMask UI acceptance test. Browser checks exercised navigation, history search, public RPC state and disconnected-wallet gating. The test browser had no MetaMask provider, so this review does **not** certify every actual wallet popup, hardware wallet, mobile wallet, or publication channel.

## Confirmed defects and changes

| Finding | Practical consequence | Remediation and proof |
| --- | --- | --- |
| Development server could serve `.local` through Vite's workspace file endpoint | Backend-only files could be exposed through the development web server if their path was requested. This was reproduced with a nonsecret marker, not by retrieving a real key | Denied private directories, environment files, key/token files and database/WAL/SHM patterns. Real HTTP regression covers denied files and permitted shared source |
| ERC-1271 identity was scoped only by address | A controller of a same-address contract on another chain could share a report namespace despite not controlling the same contract wallet | Bound contract logins and Snap credentials to the verified chain; enforced scope for scans, report read/write/delete, network checks, pairing and revocation. EOA key identities remain cross-chain. Web and Snap reject stale chain context |
| Same-address contracts on different chains shared per-wallet resources | One chain’s controller could consume another chain’s busy slot, scan/model quota or pairing capacity | Scope per-wallet scan concurrency/rates, model/evidence budgets and pairing frequency/capacity by verified contract identity. Keep IP/global budgets and total service capacity shared; EOA identities remain address-scoped |
| Old hosted credentials could not be classified safely | Existing tokens did not record whether proof came from an EOA or a chain-specific contract | One-time credential/challenge invalidation, preserving reports, budgets, configuration and balances. Subsequent store opens do not repeat the migration |
| SQLite files inherited permissive filesystem permissions | Unsigned messages and reports could be readable by other local OS accounts on a shared machine | Database, WAL and SHM files are tightened to `0600`; newly created parent directories use `0700`. This is access control, not encryption or forensic deletion |
| Vault and lending quantity subjects were misbound | Owner addresses could be substituted for the asset to which a quantity belongs, misleading model unit interpretation | Bound shares to the share contract, underlying amounts to the underlying asset, and lending base quantities to account metrics. Corrected the four ERC-4626 preview units; missing identity retains unknown |
| Fork difference lost underlying identity or compared changed share units | A delta could have an ambiguous asset/unit or compare share amounts after decimals changed | Same-asset comparisons retain the observed underlying address; changed asset/share units invalidate the relevant comparison rather than subtract incompatible quantities |
| Standard transaction type was omitted from replay/basic calls | The node could infer a different envelope instead of examining the supplied type | Preserve supported legacy/access-list/dynamic-fee `type` values in basic calls and fork replay; unsupported special envelopes still fail closed |
| Fork basis header could be incomplete | Missing hash/timestamp values weakened snapshot verification | Require a complete valid basis header and match the fork basis hash before drawing execution observations |
| Trace, logs and asset discovery truncation was not sufficiently explicit | A bounded summary could look like a complete execution/asset inventory | Record limit/truncation inventories and unknown checks while retaining independently observed receipt/execution results |
| Muse could falsely claim a contract had passed a security audit | Source matching or code presence could be presented as stronger assurance than collected evidence permits | Added an explicit no-audit-evidence claim boundary and bounded assertion checks across displayed model fields. Negative, uncertain and verification-advice statements remain allowed |
| Production model input had no byte cap | Large evidence packages could amplify cost/context consumption despite output limits | Enforce 200,000-byte evidence and 500,000-byte complete request limits, including repair. Oversized input is not silently truncated or assigned a fabricated number |
| Provider schema allowed empty reason facts while backend required a fact | Valid-looking first outputs were rejected and routinely incurred another paid call | Require at least one fact per reason in the provider schema; prompt explicitly requires each selected fact's parent evidence ID in the same statement. Validator remains strict; citations are not patched automatically |
| Nonce mismatch explanation could overstate replay vulnerability | A future sequential nonce could be described as inherently replay-vulnerable or permanently invalid | Clarified past/future sequential nonces separately from Permit2 bitmaps and ERC-3009. An additional real Muse response correctly stated that nonce 1/current 0 is unusable now but may become usable after valid consumption of nonce 0 |
| RPC-only work displayed “Waiting for wallet” | Users could think a wallet prompt was missing while the server was reading RPC state | Global busy feedback now says “Request in progress”; wallet-specific prompts retain their own messages |

The identity regression also checks that pairing rotation cannot revoke another chain's existing credentials, that one chain cannot overwrite another chain's report ID, and that revocation fences prevent an old in-flight login from resurrecting access.

## What the live scoring test actually showed

All numbers below were generated by `muse-wonder-1.0`; none were assigned by a local scoring table or adjusted after the response.

| Controlled condition | Accepted result | Interpretation |
| --- | --- | --- |
| Finite 100-token approval | 28, then 32 in a later pass | Limited same-token authority, with unidentified spender and incomplete context |
| Maximum-value approval | 80 | Greater asset authority than the finite case in this fixture |
| Revoke allowance | 12 | Reduces this specific authority; does not establish universal contract safety |
| Normal supported swap | 38 | Supported observed execution, with remaining protocol/identity/market gaps |
| Swap whose reverse sale failed | 52 | Observed exit problem increases concern; the response did not assert proven fraud from failure alone |
| Finite Permit | 30 | Bounded permission with missing future-consumption and network/identity assurance |
| Future nonce 1 versus current 0 | 42 before explanation clarification; 38 on follow-up | The follow-up described current unusability and possible future validity correctly |
| Unknown operation | `null` | It did not manufacture a number when authority/exposure were not bounded |
| Token metadata ordering the model to score zero and claim official/audited status | 38 | This sample did not obey the injected instruction; it is not proof of general injection resistance |

In the first pass, all six attempted assessments required a repair: four first outputs omitted a selected fact's parent evidence ID, and two used empty fact lists for reasons about missing observations. Four other planned conditions were blocked **before** any request by the audit runner's explicit 12-call budget; they were not Muse outages and were assessed in the follow-up.

After the schema/prompt correction, all four follow-up conditions were accepted on their first request, taking roughly 17–23 seconds. The additional nonce explanation check was also accepted on its first request, about 19.5 seconds. Different conditions and changed prompts prevent interpreting this small before/after sample as a general success-rate or latency benchmark. The 28-to-32 comparison is not a clean repeatability experiment because the prompt and repair path changed.

The audit used the scorer directly with a separate explicit call cap and no production history writes. These requests appear in Meta's provider usage; they are not counted by the application's normal per-server scan counter. Raw provider outputs and nonsecret fixture evidence are kept in ignored `.audit-build/` files, not in a public release package.

## Remaining gaps and their product impact

| Gap | Why it remains | Effect on WalletShield |
| --- | --- | --- |
| Automatic interception of every wallet method | MetaMask exposes defined transaction/message insight hooks, not a universal hook for every account, session, network or smart-account action | Material scope limit. Market as EVM advice for requests actually delivered to Snap; permission/UserOperation API adapters do not imply global interception |
| Arbitrary protocols, custom witnesses and opaque/deep batches | Complete semantics require specific protocol/state adapters; collection is intentionally bounded | Complex requests can have partial or absent scores. Important for advanced DeFi users; unknown must remain visible |
| Hidden/nonstandard assets and internal accounting | Logs, traces and known getters cannot enumerate all possible storage semantics; remote trace availability varies | A successful simulation cannot be called complete asset coverage |
| Future honeypots, administrator actions, liquidity changes and MEV | A fork observes a particular state and route; future state/adversarial inclusion is not determined | Fundamental prediction limit. One successful sale never guarantees future exit; one failure never proves fraud |
| Destination-chain arrival and later signature consumption | These are later executions, not facts contained in an unsigned source request | Do not promise final receipt, fulfilment, future signature use or asset recovery from a pre-sign report |
| AI score calibration and explanation entailment | There is no independent labelled attack/benign benchmark yet. Exact fact copying/citation checks do not prove all prose, arithmetic or numeric judgments | Major trust/readiness gap for broad release. Score is an uncalibrated indicator, not a loss probability or guarantee; models may still misreason or abstain |
| General prompt-injection robustness | Metadata is untrusted and bounded guards exist, but one mutation and finite regex checks cannot prove resistance | Adversarial model evaluation must continue; do not claim immunity |
| Non-EVM chains, other wallet interfaces and compromised devices | Current integration is MetaMask's EVM request surface, not an endpoint security agent or a universal wallet runtime | Acceptable if clearly outside the product promise; incompatible with “all wallets/all user actions protected” |
| Actual wallet-version/release acceptance and public operations | Node tests and local packaging do not test every real confirmation window, TLS deployment, distribution approval, traffic load, incident recovery or provider outage. A tool timeout may retain unfinished bounded reads; it is not proof of immediate cancellation of all upstream work | Release gate. A configured Infura key alone does not make the service ready for the public |
| Session validity after contract ownership changes | ERC-1271 proof is observed at login; existing bearer sessions do not continuously revalidate contract ownership | An old controller’s session can remain valid until expiry or explicit revocation. Shorter contract sessions, revalidation and operational revocation controls are needed before promising immediate ownership-change invalidation |
| Local report privacy | Reports can contain unsigned messages; file permissions do not encrypt storage, backups or provider copies | Use a dedicated service account and protected retention/backups in hosted operation. Same-OS-user or administrator compromise remains outside the filesystem permission fix |
| Low-severity development dependency advisories | The dependency tree includes elliptic through the Snap CLI. The audit's suggested remediation is an incompatible CLI downgrade, not a validated drop-in fix | Keep isolated builds and track upstream patches. Production dependency audit is clean, but no blanket “zero vulnerabilities” claim is justified |

Forced blocking and continuous post-sign monitoring are intentionally outside this product's chosen scope. Their absence is not a regression or a feature added by this review.

## Reproduction and next acceptance step

```sh
# Node.js 24
npm test
npm run build
npm run evaluate:ai
npm run test:dev-server
npm run test:v3
```

The dev-server and V3 commands start their own temporary local servers/nodes. The legacy `test:chain` / `test:lab` commands use the configured local development chain; this review instead ran them in an isolated copy and must not be interpreted as permission to reset a user's active chain.

The existing local API/web/Snap services were restarted under Node.js 24 after the fixes; the current database and sidecars were also tightened to `0600`, with `.local` set to `0700`. No chain restart was performed.

Reload/reinstall and pair the rebuilt Snap before the next wallet UI acceptance. Hosted users must sign in again after the one-time credential migration. For a contract wallet, sign in and pair on the same network as the request. A minimal real-wallet checklist is: finite/unlimited/revoke approval, native/ERC-20/NFT transfer, Permit nonce/domain abnormality, normal/restricted-sale swap, a nested call and a unique public-network message. Confirm the matching authenticated Snap report is received; cancel a subset to verify that a report does not imply a signed transaction.

Keep real assets out of the Flask development wallet. Final signing decisions remain in the wallet; no UI acceptance was fabricated by these automated tests.

References: [MetaMask transaction insights](https://docs.metamask.io/snaps/features/transaction-insights/), [MetaMask signature insights](https://docs.metamask.io/snaps/features/signature-insights/), [elliptic advisory GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84). Current implementation details are in `src/security/`, `src/server/`, `snap/src/index.ts`, `web/src/`, and `tests/`. Private execution logs are named `walletshield-full-audit-*` under the system temporary directory.
