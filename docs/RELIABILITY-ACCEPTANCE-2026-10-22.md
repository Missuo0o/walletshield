# Reliability extension verification — 2026-10-22

> **Historical acceptance record.** The observations and counts below are preserved for the implementation tested at that time; they are not the current project validation. Read [Full validation — 2026-10-22](FULL-VALIDATION-2026-10-22.md) for the latest checks, repairs and limitations.

Version remains 0.4.1. These results validate the bounded implementation and its failure paths; they are not a wallet-safety certification or measured detection accuracy.

| Check | Result and practical scope |
| --- | --- |
| `npm test` | 442 tests passed, including structured facts/provenance, schema and claim rejection, EIP-7702, version-bound UserOperation reads, Seaport orders, witness commitments, registry/oracle/source failures, SDK boundaries, hosted revocation and privacy. Network/model behavior in these tests uses mocks. |
| `npm run build` | Type checks, English coverage-guide synchronization, webpage build, Snap evaluation and build fingerprint passed. The Snap CLI refreshed the manifest hash and reported a recommended repository-metadata warning. |
| Hosted build/package dry run | A secret-free copy built for placeholder HTTPS/npm settings and packaged exactly five allowlisted Snap files. No configuration, database or credential files were included; nothing was published. |
| `npm run test:v3` | One isolated integration suite passed with 31 scenarios: 16 token-funded V3 paths (eight forms with normal/blocked reverse sales), eight maintained-binding native-funded forms, one unbound-native unknown, two actual vault/lending state comparisons and four authority-store changes. Disposable fixture upstream block/hash/nonce/balances were retained. |
| `npm run test:security` | Isolated fork execution, asset deltas, sell restrictions, supplied-gas/stale-nonce failure paths, Permit state, previews and health observations passed. Legacy monitor code is tested separately from the disabled product feature. |
| `npm run test:extensions` | 15 disposable-node getter/state cases passed; missing interfaces, chain mismatches and independent failures retain their boundaries. |
| `npm run test:asset-cleanup` | Disposable-chain clearing, repeated clearing, reset/replenishment and preservation of unrelated accounts/positions/standing permissions passed. No live lab assets were cleared. |
| `npm run evaluate:ai` | Default offline validator run: 12 fixed synthetic cases and 120 adversarial fact/prose mutations. Zero model calls and zero RPC calls; no live scoring accuracy, false-low rate or calibration result is established. |

The additional integration commands ran in a secret-free temporary copy or on newly allocated Anvil ports. No paid Muse evaluation, public-chain transaction, real-wallet approval, published Snap installation or public-domain release was performed. The 66-case wallet catalog is unchanged; these adapter scenarios are additional developer tests, not 31 new real-wallet/Snap cases.

Deployment bindings, price feeds and two-chain bridge routes need independently reviewed operator records in `.local/registry.json`. An empty/missing registry does not activate those observations. Source verification is a separate opt-in. Infura connectivity alone does not authenticate contracts, enable all trace/history methods or prove future execution.

See [reliability and integration](RELIABILITY-AND-INTEGRATION.md) for tools, schemas, field extraction, model validation and remaining boundaries; [中文说明](RELIABILITY-AND-INTEGRATION-zh.md) explains the same operating scope in Chinese. Actual browser/MetaMask delivery and the revised prompt's live Muse output still need manual acceptance with a dedicated test wallet and an explicitly budgeted model run.
