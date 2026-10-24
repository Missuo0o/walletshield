# WalletShield repair validation — 24 October 2026

This change repairs the four concrete defects found in the preceding review. It does not certify that every possible wallet operation or attack is covered. The implementation remains a pre-sign advisory tool; Muse supplies any accepted numeric risk score, and missing evidence can still justify no score.

## Repairs

| Area | Previous behavior | Current behavior and validation |
| --- | --- | --- |
| AI identity/safety assertions | An unrelated `may` or `should` could exempt an entire sentence from certainty validation. | Qualifiers are scoped to their own assertion. Independent claims such as “The contract is official and you should approve it” are rejected. True conditional advice, negations, attributed claims and questions remain allowed. Full-output regressions cover summary, reasons, dimension rationales, suggested action and missing-data text, including English conjunctions and Chinese forms. Bounded execution claims use the same scope handling. |
| RPC snapshot consistency | A recorded header hash could survive when later numeric-block reads or the canonical block changed. Some collectors retained state without a usable initial header. | Nine ordinary collector groups require a complete initial header and a final chain/height/hash/timestamp recheck. A failed or changed snapshot discards the group's RPC values and derived comparisons, preserving independent request/encoded/cryptographic facts. `pinnedRpc` prefers canonical EIP-1898 hash selectors; only invalid-parameter rejection permits numeric fallback, checked before and after. Concurrent invalidation is sticky. Public-network account/capability probes also recheck before returning. |
| Local wallet actions | A wallet that never answered a network or asset-display request could leave the page busy indefinitely. | Prepare/clear actions capture one account/provider and share a 120-second wallet deadline, with 5-second read and 60-second prompt limits. The unknown-chain fallback adds only the canonical loopback local network. Timeouts do not retry or continue after late responses. Display prompts stop after a timeout/pending-request error; already funded assets remain funded. Busy state is released before a background inventory refresh. |
| Credential lifecycle | Backend expiry was enforced, but the page could continue showing an expired login or pairing as ready until another interaction. | In-memory web sessions notify the UI at expiry; timers recheck the wall clock and support deadlines longer than the browser timer limit. Focus/visibility checks handle suspended tabs. Private history is hidden and stale loads are invalidated. Snap pairing has its own expiry display. A protected-route 401 invalidates only the credential used by that request, so a late failed request cannot clear a new login. |

The lifecycle review exposed a related status-code defect: an authenticated contract wallet querying a forbidden address/network used to receive 401. It now receives **403**, preserving a valid login. Missing/expired credentials still receive **401** before any network probe or cache result is returned. Regression tests verify both outcomes.

## Validation performed

Supported runtime: Node.js 24.19.0. These results were collected for this change and do not replace historical dated reports.

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm test` | **558/558 passed**, no skips | Maintained unit/regression assertions, including new certainty, reorganization, timeout, session lifecycle and hosted scope cases. These are not 558 live wallet attacks or a model accuracy measurement. |
| `npm run typecheck` | Passed | Web/backend and Snap TypeScript checks. |
| `npm run test:v3` | Passed: one integration test exercising **23 state scenarios** | Disposable local forks: 16 token-funded V3 route/buy-sell cases, one generic native-funded simulation, two vault/lending state changes and four authority changes. Source fixture state is checked unchanged. |
| `npm run test:trace` | 1/1 passed | An upstream without either trace method can yield bounded original-call tracing through a disposable fork, without writing to the source fixture. |
| `npm run test:dev-server` | 1/1 passed | Real development-server private workspace file isolation. |
| `npm run evaluate:ai` | 12/12 valid synthetic abstention outputs; **120/120 adversarial outputs rejected** | Offline validator contract checks only; zero model/RPC calls. |
| Prior original Muse output replay | **6/6 accepted**, original scores preserved | The stricter guard still accepts these previously captured responses against their corresponding original reports. Numbers remain 38, 38 and 22; three null outputs remain null. This is offline compatibility checking, not a new live model evaluation. |
| `npm run build` | Passed | Runtime configuration, generated coverage guide, type checks, web bundle, Snap bundle and source/build fingerprint. |

No new paid Muse requests or external public-chain RPC calls were needed for these deterministic defects. Isolation tests use disposable loopback chains. This round does not claim a new real MetaMask popup acceptance or independent accuracy calibration. Secret configuration, local wallet/backend data and presentation files are excluded from publication.

## Practical behavior after updating

Refresh the webpage after restarting the application. A wallet timeout releases the page but **cannot cancel a pending MetaMask prompt**; approve or cancel that prompt in the wallet before retrying. A successful funding operation and wallet asset-display consent are different results.

In hosted mode, reverify the wallet when the website login expires. Pair the Snap again when its separate credential expires. A wrong query-network scope asks for the appropriate identity/network without silently treating a valid login as revoked.

## Remaining boundaries

- Assertion validation is a bounded grammar/claim safeguard. It cannot prove every natural-language paraphrase correct, and it does not independently calibrate Muse's numbers.
- Numeric before/after header checks reduce snapshot misattribution, but are not atomic execution by hash, a cryptographic proof of RPC truth, a global snapshot across collectors, or a future execution guarantee. A deliberately dishonest provider or a transient change that reverses between checks remains outside that proof.
- A timeout cannot cancel an extension request. Browser suspension and wall-clock changes can delay UI updates until a timer runs or the tab becomes active; backend authorization remains authoritative.
- Previously documented request-delivery, custom protocol, nonstandard asset and non-EVM boundaries still apply. See [current coverage](CURRENT-COVERAGE.md) and the [user manual](USER-MANUAL.md). This repair does not add forced blocking or post-sign monitoring.

Machine-readable validation summary: [repair-validation-2026-10-24.json](repair-validation-2026-10-24.json).
