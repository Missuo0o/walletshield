# English interface and evidence reliability review

This review records the changes made on 2026-10-22 to WalletShield 0.4.1. It is not independent certification or a detection-accuracy benchmark. No real-network transaction or user-wallet signing request was sent during automated verification.

## Implemented improvements

| Area | Result |
| --- | --- |
| English product | Navigation, wallet setup, local cases/prerequisites, public-network checks, history, report labels, errors, static Snap text, new model instructions/output and current operating documentation use English. Historical raw reports remain unchanged and are identified as original-language content. |
| Login messages | A bounded SIWE envelope inspector checks required fields, order, nonce format, URI/source/domain consistency, issued-at/expiry/not-before conditions and bounded resource origins. It never claims access to a remote nonce store or verification of a future generated signature. |
| Independent RPC reads | Successful native balance, code, header and call observations survive independent failures. Missing data is not zero balance or absent code. |
| Nonce and fees | Supplied transaction nonce is compared with confirmed state at a stated block; supplied fee cap is compared with that block's base fee. Pending replacements, subsequent base fees and future inclusion remain unknown. |
| Typed signatures | Valid custom EIP-712 requests can receive a DOMAIN_SEPARATOR comparison without borrowing standard Permit nonce or authority semantics. |
| Delegated accounts | Recognized EIP-7702 code designators can receive one-hop target code/hash observations. This does not verify authorization lists, recursive delegation, ERC-1271 behavior or trusted implementations. |
| Execution fees | A receipt missing usable gas/price fields no longer becomes a zero-fee observation or a fabricated gas-adjusted native-asset delta. Raw observed balances are retained. |
| Intelligence | Bounded independent counterparty queries preserve other successful results. Missing flags, unsupported chains and truncated targets remain explicit; collection time is not the provider's data age. |
| Provenance | Pinned collector reads carry chain/block and matching header hash/time where available. Block-number pinning is not atomic hash pinning and cannot rule out provider inconsistency or reorganization. |
| Evidence quality | Reports and model packets include status/source inventories, recorded observation-time flags, available snapshots, mixed-block chains, conflicting same-height hashes and credential attribution. Counts are not accuracy or confidence percentages. |
| Muse validation | Every dimension rated low/review/high needs at least one actual non-unknown observation beyond a plan. Timing anomalies, stale observations or conflicting hashes cannot support strong evidence confidence or an overall low assessment. No rule-generated numeric score, floor, weighting or fallback was introduced. |
| Transport | Local Snap requests continue to use backend port 8787 directly, avoiding Vite's opaque-origin preflight failure. Installation, pairing and final health remain separate stages. |

## Verification

- **197 automated tests passed**, including new partial-read, nonce/fee, delegation, SIWE, quality, response-bound, interface and model-validation regressions.
- Backend/frontend/Snap type checks and local build passed.
- **54 local wallet cases passed**: 43 transactions and 11 message signatures across 25 of 30 profiles; local chain snapshot restored. These are node-generated operations, not a browser/Snap entry-point test.
- Independent local-fork security acceptance passed, including actual deltas, normal/blocked fixture sell behavior, supplied gas/nonce failures, Permit/domain, vault/lending reads and unchanged upstream state.
- One fixed local Permit request reached the real **Muse Wonder `muse-wonder-1.0`** API using the English prompt and new evidence packet. It completed in approximately 11.2 seconds, returned **34/100**, passed the current validators on its first response, and retained unknown identity/future-use dimensions. See [model acceptance](muse-english-quality-acceptance.json). This is connectivity and output acceptance, not calibration, stability or accuracy measurement.
- Local and isolated hosted builds were checked separately. Hosted rehearsal uses a reserved example domain and validation-only npm name; it is not a public deployment or publication.
- The browser was checked for English navigation, local case lists and report/evidence-quality rendering. Actual wallet permissions, Snap reload and signing/cancel decisions still need manual acceptance in the user's Flask browser.

## Current configuration and remaining work

At verification, Muse and isolated simulation were enabled. Ethereum mainnet, Sepolia and the owned local chain were configured. External GoPlus lookups remained **disabled**; implementing an adapter does not mean live intelligence was fetched. The README explains `ENABLE_EXTERNAL_LOOKUPS=1` and optional provider credentials. No credentials were printed or added to frontend/model inputs.

Price/quote reliability, authenticated deployment identity, complete batch/protocol/bridge semantics, relying-party nonce state, generic wallet permission/UserOperation interception, non-EVM chains and off-chain fraud are not solved by these improvements. Additional trusted data, tested adapters and wallet/dApp cooperation are required. Future actions and universal absence of risk cannot be proved before signing. The English manuals distinguish feasible extensions from current capabilities.

The AI number remains an uncalibrated indicator. Citation and selected semantic checks are not a proof of every explanation. Independent labeled cases, held-out evaluation, repeated runs and measured false-positive/false-negative performance are needed before making reliability claims.

Read [README](../README.md), the [English user manual](USER-MANUAL.md) and the [generated per-profile guide](AI-COVERAGE-GUIDE.md) for operation, exact extraction fields, component responsibilities, configuration, privacy and deployment steps.
