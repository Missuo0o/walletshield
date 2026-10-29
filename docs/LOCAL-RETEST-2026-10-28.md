# Local re-test and repairs · 28 October 2026

[中文](LOCAL-RETEST-2026-10-28-zh.md) · [Machine-readable results](local-retest-2026-10-28.json)

This is a local working-tree audit based on commit `42fad66`. It changes no VPS, remote repository or published npm package. Tests used isolated chain state and databases; private credentials were not placed in reports or copied into the hosted fixture. The real model tests read the existing Meta configuration server-side and sent synthetic unsigned test requests/evidence. No real assets were transferred.

## Confirmed issues repaired

| Issue | Effect | Repair and regression evidence |
| --- | --- | --- |
| Daily hosted-lab counts shared the authentication minute table | Login cleanup could erase the 40/day lab limit | Separate persistent daily table; preserve surviving legacy counters; test cleanup, restart, other-wallet isolation and next-UTC-day reset. Already-erased old counts cannot be reconstructed. |
| Lab history applied a global 100-row limit before ownership filtering | A user's history disappeared behind another user's activity; an explicitly named older test could fail to link | Filter the wallet in SQL before limiting; exact session IDs use direct lookup, with account/request/time checks retained. Tests include 105 other-wallet sessions and a mismatched request. |
| Signature session comparison omitted explicit chain binding | An identical payload could match a different explicitly bound network | Include chain ID in comparisons; retain chain-bound hosted identities when building signature cases. An unbound hook remains unbound, not a guessed network. |
| Wallet outcome was saved after asynchronous receipt reads without a conditional update | A late duplicate could overwrite an earlier recorded outcome | Atomic pending-to-result update of outcome fields only; preserve a concurrently attached Snap report. Duplicate completion cannot overwrite the stored result. |
| Permit2 reference-format language was treated as an RPC domain-hash assertion | A valid model repair was rejected, leaving no score | Separate the request-bound name/version reference comparison from `DOMAIN_SEPARATOR`. Recompute and bind the reference evidence, retain hash/nonce safeguards, correct plural “do not match” parsing, add positive and adversarial tests. New results record `muse-evidence-v8-permit-reference-scope`. |

Historical model reports remain unchanged. The backend does not edit a model score or replace a missing score with a preset number.

## Validation layers

| Layer | Observed result | What this establishes |
| --- | --- | --- |
| `npm test` | **624 passed, 0 failed, 0 skipped**; baseline 615 | Maintained unit/regression expectations, including nine new test cases |
| `npm run build` | Passed, including TypeScript and Snap compilation | Local web/Snap build compatibility |
| `test:chain`, `test:lab`, `test:asset-cleanup` | Passed; **67 cases: 51 transactions, 16 signatures, 25 profiles** | Local fixture request execution/encoding and state behavior; not 67 live model or MetaMask popup tests |
| `test:v3` | Passed: one integration test containing the existing 23 V3/state scenarios | Supported dependent fork execution and state observations |
| `test:trace`, `test:security`, `test:extensions` | Passed; extensions include 15 isolated cases | Original-call fork tracing, selected asset/permission/protocol evidence and upstream non-mutation |
| `test:dev-server` | Passed | Private filesystem routes remain denied |
| `evaluate:ai` | 12 valid abstention outputs accepted; 120 adversarial variants rejected; zero model calls | Validator behavior on maintained synthetic fixtures, not model accuracy |
| Local hosted build/package/integration | Passed after repairs; builds all 67 request shapes, prepares assets, submits a signed gateway transaction, verifies receipt/report, clears balances | Hosted-mode behavior on this computer's chain 31338; no VPS or npm publication |
| Browser inspection | Local lab, history search, Permit2 details, public-network/setup empty states and white-theme rendering; no console errors observed | Production frontend rendering; no wallet provider was available in this test browser |

The initial development-preview request was correctly denied because the isolated copy lives under `.audit-build`, a protected directory. UI verification then served only the compiled static web directory with the isolated backend. The filesystem protection was retained.

## Real Muse observations

**15 scenario runs across 13 distinct cases used 19 Meta API calls**, including the existing bounded repair attempts. They used the production Snap `onTransaction`/`onSignature` functions in a Node harness, the real backend, temporary-chain evidence collectors and `muse-wonder-1.0`. Every run linked the intended report, rendered the report ID through its hook result and left the upstream source block unchanged during analysis. This does not validate Chrome extension prompting or prove that MetaMask delivers every request type.

| Case | Initial result | Targeted post-repair result |
| --- | --- | --- |
| Unlimited token approval | 78 | — |
| Limited approval | 32 | — |
| Revoke approval | 8, after one output repair | — |
| Native transfer | 8, after one output repair | — |
| All-NFT approval | 72 | — |
| Finite Permit | 34 | — |
| Permit2 | Rejected after repair: reference/domain validation false positive | **68**, completed after one output repair |
| V3-style swap | 46 | — |
| Restricted-token purchase | 58; honeypot unknown | — |
| Restricted-token sale | — | **38**, observed execution revert; honeypot unknown |
| Enable account module | 70 | — |
| ERC-3009 transfer authorization | 28 | — |
| Opaque custom typed message | Valid abstention, no number | Valid abstention, no number |

All numbers are observations, not recommended target scores or labelled correctness. A reverting sale does not by itself prove a token is a honeypot. The purchase's unsupported reverse experiment remained unknown. The isolated security integration separately verifies a supported blocked-sell fixture path. The opaque message lacked decoded asset authority; a mismatch observation did not justify inventing an overall numeric estimate.

Offline replay of the saved Permit2 repaired reply now accepts its original model number **74**, while the new live request returned **68**. These were different requests/snapshots/prompts, not a controlled repeatability experiment. The old persisted report was not rewritten. Unsupported initial statements from other outputs still fail validation; bounded model repair remains necessary in some runs.

## Remaining limits and impact

- **No independent scoring-accuracy or calibration result.** Passing tests, valid citations and these live examples do not establish a false-negative rate, calibrated probability or universal numerical consistency. A held-out, independently labelled evaluation is still needed before making accuracy claims.
- **No complete automatic wallet coverage.** This browser run had no MetaMask provider; it did not repeat user-driven installation/confirmation. Permission/session/UserOperation paths need their documented integration when the wallet supplies no hook. Non-EVM chains and arbitrary custom semantics remain outside complete automatic coverage.
- **Incomplete evidence remains possible.** Protocol-specific signature consumption, opaque calls, nonstandard assets, source identity, future state and complete asset discovery cannot be guaranteed. Public RPC/trace availability and external reputation freshness were not certified by this local run. Selected fork fallback tests passed; they are not an archive/trace promise for every provider.
- **Dependency alerts remain.** The full audit has **14 low-severity affected-package entries**, with no moderate/high/critical entries at this check. The underlying [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) and [elliptic advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84) list no patched release. `npm audit --omit=dev` reports zero in its selected set, but the current build/start toolchain uses development dependencies; that smaller audit does not certify the deployed footprint. No breaking CLI downgrade or unsupported override was made merely to hide the alerts.

The repaired local version is suitable for continued controlled testing. These remaining limits affect confidence and public-release claims; it is not evidence of complete wallet protection. A VPS update remains a separate user decision. If approved later, back up its SQLite state, deploy the backend/build and restart it, then check authenticated lab limits/history and a fresh wallet insight. This patch does not change Snap entry-point source or permissions; it does not inherently require a new npm Snap release.

Raw synthetic outputs and detailed command logs are retained locally under `.audit-build/retest-20261028/` and excluded from Git. Only the sanitized summary is included here.
