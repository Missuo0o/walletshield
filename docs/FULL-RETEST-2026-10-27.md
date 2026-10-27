# Full re-test and repairs — 27 October 2026

This internal re-test started from commit `3c4cd58e5bc8cb30e4389f332d2aa5ad8b6d4be4` and completed on 27 October 2026 using Node.js **24.22.1**. The preceding 592-test baseline passed, but further targeted probes still found defects. The findings below are repaired and covered by regressions. This is not an external audit or a claim that every possible wallet request has been tested.

## Reproduced defects and repairs

| Finding | Impact before the repair | Current behavior |
| --- | --- | --- |
| Nested amounts could be attributed to the wrong asset/account | Fork allowance amounts could be assigned to the wallet rather than the token; vault shares, underlying units and position-token quantities could be mixed. | Exact collector/path subjects distinguish tokens, vault shares, accounts, position token0/token1 and round-trip input/output/native units. Permit2 batch quantities bind to each entry's token. |
| Collector metadata could support a financial rating | A deliberately constructed strict model reply was accepted with high exposure supported only by `simulationOnly=true`. | Policy **`muse-evidence-v7-quantity-bound-facts`** uses a positive source/check/path/type table for exposure. Pure provenance and unperformed-control flags cannot independently support any rated dimension. Actual successful execution remains execution evidence, not a financial amount. |
| Useful committed quantities were omitted from exposure support | A native transfer amount, ERC-20 transfer amount or canonical Permit cap could fail to support exposure despite being parsed. | Narrow category-aware fields now remain usable. Shared `approve`/`transferFrom` integers require an observed ERC-20 standard; NFT identifiers and opaque custom typed amounts do not become financial quantities. These are evidence constraints, not fixed scores or weights. |
| Snap could display a report for a different request | A well-shaped report for another chain/target could pass display validation. | Both hooks compare the backend's echoed request against the exact serialized request before rendering. Comparison covers network, origin, sender, target, value, calldata, fees, nonce, authorization tuples, signature data and provider context, with bounded canonicalization. Mismatches are rejected. This does not attest an untrusted server or distinguish evidence freshness for identical requests. |
| Packaged Snap manifest could fail installation checks | Changing release name/package/repository after building retained a checksum for the old manifest; repository metadata could disagree with package metadata. | Finalize manifest/package metadata first, then compute and validate the official checksum. Validate the actual copied bundle/icon and run the official manifest checker. Tampered content or mismatched repository fails. Packaging does not publish the Snap. |
| Vulnerable build-tool dependency and fragile test scheduling | The installed `body-parser` 2.x version had a published high-severity advisory. A provider-invalidation regression could race its 10 ms deadline under parallel load. | Pin affected `body-parser` to **2.4.0**. The invalidation regression now uses an explicit provider-entry gate and attaches its rejection assertion immediately; production timeout behavior is unchanged. |

The v7 fact regression includes **30 coverage labels × 18 collector shapes**, checking over 5,000 bounded candidates. This is an offline field-contract invariant, not live testing of 30 protocols. Synthetic test scores such as 88 are validator fixtures, not product scoring constants. Muse still supplies numeric scores; valid abstention is preserved. Historical stored reports are neither rescored nor relabeled as v7.

## Validation results

These layers overlap and must not be added together as a count of distinct attacks or real wallet operations.

| Layer | Observed result | What it checks |
| --- | --- | --- |
| `npm test` | **611/611 passed**, zero failures/skips | Maintained unit/regression assertions, including API/authentication, decoding, evidence, model validation, storage, Snap hooks and UI callbacks. The baseline was 592 tests; this update adds 19. |
| `npm run build` | Passed | Generated runtime/coverage, application and Snap type checks, web bundle and Snap bundle (86 compiled files). Recorded build fingerprint matches current source/bundles. |
| Local deployment and five integration scripts | Passed | Fresh `deploy:local`, repeat `deploy:lab`, `test:chain`, `test:lab`, `test:asset-cleanup`, `test:security`, `test:extensions`. |
| Wallet lab | **67 cases**: 51 transactions + 16 local-node signature requests, across 25 profiles | Actual disposable-chain fixture operations and signed-data formats. Local-node signatures do not verify MetaMask popup behavior. |
| Extended evidence | **15 cases passed** | Additional collector/fixture integrations. |
| `npm run test:v3` | One integration test, **23 state scenarios passed** | 16 token-funded V3 cases, one native simulation, two vault/lending changes and four authority changes on disposable forks. |
| `npm run test:trace` | 1/1 passed | Original-call trace through an isolated fork when the fixture upstream lacks both trace methods; no upstream analysis writes. |
| `npm run test:dev-server` | 1/1 passed | Real development server denies private workspace file access. |
| `npm run evaluate:ai` | 12/12 valid synthetic abstentions; 120/120 adversarial outputs rejected | Offline validator contracts; **zero model/RPC calls**. This does not measure model accuracy. |
| Deterministic malformed-input sweep | **504/504 negatives + 12 positive controls passed** | 352 malformed ABI inputs, 128 typed-data inputs, 24 envelope/size cases. Outcomes: 480 unknown/unscored responses, 18 HTTP 400, six HTTP 413, zero HTTP 500. Offline collector/scoring stubs and an external-call tripwire were used. |
| Hosted build/package/start | Passed in an isolated copy | **29 HTTP checks**, three negative configuration checks, zero official manifest errors; `npm pack --dry-run` contains exactly five allowed files. Private canary files are excluded. Nothing deployed/published. |
| Snap/UI/setup/release focused run | **42/42 passed** | Hook request correlation, provider lifecycle, UI invalidation and finalized release artifact checks; included in the unit suite, not an additional live-wallet count. |

All fixture work used disposable nodes/copies rather than resetting the user's normal local chain or report database. The 26 October local script snapshot was checked against its 49-file runtime import graph: subsequent AI-only changes were outside that graph. Final AI/model tests, build, V3, trace, dev-server and hosted checks ran against the completed changes. Hosted checks compared 120 shared production/script files with the root working tree. Owned test listeners were stopped.

## Actual Muse acceptance

Fresh evidence came from a disposable fixture chain. Its upstream facade allowed reads and deliberately rejected writes and both public trace methods; analysis used the isolated-fork fallback. External reputation lookups were disabled for these controlled cases. The API key stayed in backend configuration.

| Case | Accepted outcome | Actual API requests |
| --- | --- | --- |
| Vault deposit with distinct underlying/share evidence | **24/100** | Two: initial reply rejected for an unsupported bounded observation claim, then one supported repair accepted. |
| Opaque custom typed order | **No numeric score** | One: legitimate abstention because asset-authority semantics were unresolved. |
| Finite token approval with isolated trace fallback | **24/100** | One: supported structured output accepted. |

Totals: **three completed analyses, four paid Meta requests**, including the rejected initial output. All four saved outputs were replayed offline against the final v7 validators: the first remained rejected and the three final outcomes remained accepted. Replay made no additional API calls. Source fixture block/nonce remained unchanged during analysis; upstream analysis writes were zero.

These scores are case-specific, uncalibrated model indicators, not fixed policy scores, fraud probabilities or estimates of detection accuracy. Three cases cannot establish repeatability or a false-negative rate. An invalid initial reply still consumes provider usage; bounded repair reduces some output failures without guaranteeing a valid result.

## Dependency inventory

The final **27 October** audit reports **zero selected production-set advisories** (`npm audit --omit=dev`). The full dependency audit reports **12 low-severity affected-package entries**, zero moderate/high/critical, from one `elliptic` advisory chain. These are not 12 independent root causes. The [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828) is addressed by 2.4.0; the [elliptic advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84) lists no patched version in the checked dependency range. No unsafe cryptographic substitution was made to hide those findings.

The hosted launcher currently executes TypeScript through `tsx`, classified as a development dependency, and local tooling uses `solc`. Follow the documented full `npm ci` install. The production-filter audit alone does not inventory the complete installed/operational footprint. Re-audit before release.

## Remaining product boundaries

- **No new real MetaMask popup acceptance run was performed in this round.** Automated hooks/providers and local-node signatures are separate from actual browser-wallet delivery. Reinstall/reload the changed Snap and repeat wallet acceptance before real-asset deployment.
- A Snap only receives wallet-supported hooks. Permissions, sessions and UserOperation paths requiring explicit integration do not become universal interception through this patch. Non-EVM wallets remain outside this EVM integration.
- Unknown custom protocols, nonstandard assets and opaque signatures can still produce partial evidence or no meaningful number. A forced number would conceal missing semantics.
- Snapshot/fork simulation cannot guarantee future execution, complete asset discovery, future sellability, target identity or cross-chain settlement. Missing provider data remains explicit.
- Model output can vary or miss risk. Independent held-out labels, score calibration and false-negative measurement remain necessary before claiming detection quality.
- Public service hardening, distribution compatibility and real wallet/browser acceptance remain release work; configuring Infura and Muse alone does not certify public readiness.

The project remains usable for controlled demonstrations and scoped testing. These limitations affect claims about universal protection and public real-asset readiness; they do not invalidate the implemented request/evidence/advice flow.

English/Chinese usage and coverage documents were updated. Publication includes reviewed source, tests, lockfile and documentation; it excludes secrets, `.local` data, private audit recordings and PPT files. Sanitized results: [full-retest-2026-10-27.json](full-retest-2026-10-27.json).
