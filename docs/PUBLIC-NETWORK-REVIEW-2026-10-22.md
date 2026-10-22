# WalletShield public-network and scoring review

Reviewed on 2026-10-22. This records the implementation and bounded acceptance checks, not a production certification or detection benchmark. The default build remains local mode, version 0.4.1. No package was published, no public service was deployed, and no real-asset transaction was initiated for this review.

## Changes made

- Standard signed type graphs distinguish ERC-2612 Permit, ERC-4494 NFT Permit, and Permit2 allowance/transfer families. Extra JSON properties outside the signed type graph cannot create signed authority.
- Permit evidence now preserves independently obtained signer/verifier code, owner binding, domain separator, nonce, deadline, token/NFT state and conditional exposure. Missing optional metadata no longer discards other successful reads. Standard structure is a candidate, not proof of contract authenticity.
- Permit2 distinguishes the ERC-20 owner-to-Permit2 base allowance from Permit2's owner/token/spender internal allowance. Zero current base allowance is an execution prerequisite, not proof the signed permission is harmless. Present balance, encoded cap and future exposure remain separate.
- Signature insights attempt a bounded, timestamped provider-chain read. It remains separate from both the message's claimed domain and the hook's unknown request-bound network. It is not authentication of the dApp's network at signing time.
- Muse receives six qualitative dimensions, an optional number, citations and explicit evidence gaps. Only Muse supplies a new numeric risk indicator. There is no rule floor, fixed weighting, point table or fallback score. Unknown identity or future execution need not erase known permission facts; an honest `null` remains valid.
- Output checks reject fabricated citations, unsupported nonce/domain assertions, unsupported identity/honeypot certainty, inconsistent abstention and unsupported confidence. A recognized validation failure can receive one separately budgeted model repair with the same evidence. Both attempts share 50 seconds, repair is capped at 25 seconds, and the same validators apply. Transport/auth/quota errors and valid abstention never trigger this retry.
- Large bounded Snap reports retain complete backend evidence while prioritizing up to 24 risk/unknown evidence items in the wallet display.
- The real-network page offers an actual unique neutral-message test, requiring matching wallet account/network and live Snap pairing health. It only displays a report matching that exact message and authenticated Snap capture. A webpage scan or returned signature alone cannot stand in for Snap delivery. The generated test signature is discarded in the browser.
- Optional hosted mode adds explicit HTTPS origins, wallet challenge authentication, separate address-bound Snap credentials, owner-scoped reports, expiry/revocation, atomic per-wallet/service model quotas and bounded concurrency. Local funding, demo, monitor and legacy routes are not registered there. Query-string and percent-encoded route bypasses were fixed and regression-tested.
- Identity changes invalidate browser authentication and pairing state immediately. Async account/provider races cannot commit a stale login. Web tokens stay in memory; backend credentials are stored as hashes. Hosted login verifies EOA signatures only; contract-wallet authentication is not implemented.
- Runtime generation, HTTPS proxy examples and an isolated release-package command separate local and hosted builds. Packaging checks successful-build fingerprints and allowlists only public package files; it does not publish anything. Meta and RPC secrets remain backend-only.

## Verification performed

| Check | Result and scope |
| --- | --- |
| Offline tests | 172 passed; no paid calls. Includes model repair/validation, evidence, auth, owner isolation, budgets, route bypass regressions, provider/account changes and Snap behavior. |
| TypeScript and local build | Passed for backend, webpage and Snap. |
| Isolated security execution | Passed: actual local-fork deltas, blocked selling fixture, supplied gas/nonce failures, Permit domain/nonce, vault/lending reads and upstream-write isolation. |
| Local wallet catalog | 54 representative cases: 43 transactions and 11 signatures across 25 of 30 profiles. The acceptance artifact records node-generated local operations, not browser/Snap UI delivery. |
| Real Muse fixed Permit | Accepted 35/100 after one validation repair; finite 100 of 5,000 same-token balance, with identity/future-consumption uncertainties retained. |
| Real Muse fixed Permit2 | Accepted 78/100 after one validation repair; large permission and incomplete protocol/domain evidence, with uncertainties retained. |
| Real RPC | Ethereum and Sepolia read-only chain checks succeeded with configured Infura. This does not establish contract safety or simulation availability for every state. |
| Hosted release rehearsal | Build, isolated packaging and `npm pack --dry-run` passed using a reserved example domain and a validation-only npm name. No actual domain/name ownership, publication or wallet-install eligibility was established. |

The first live Permit/Permit2 attempts were rejected by the validators; those failures are retained separately. The accepted follow-up used the new bounded repair. Two accepted examples do not demonstrate stability, calibration, general accuracy or guaranteed numeric output. See `muse-public-upgrade-first-attempts.json` and `muse-public-upgrade-acceptance.json`. The risk numbers are model judgments, not probabilities of loss.

## Boundaries that still require explicit treatment

1. Automatic entry covers only EVM transactions and message requests that MetaMask actually delivers to the installed Snap. Permission/session RPC, smart-account UserOperations, network changes and read-only RPC have manual analysis paths but no universal Snap interception hook. Non-EVM wallets, exchange-internal operations and other extensions are not integrated.
2. Before signing there is no generated signature to recover, validate through ERC-1271 or consume on chain. Domain/nonce checks improve evidence but do not establish future signature acceptance, spender honesty, final recipient or execution. Custom Permit implementations remain partial/unknown.
3. Honeypot evidence needs supported external intelligence and/or a successful bounded buy/sell probe. Infura alone does not supply scam labels. Failed selling can have benign causes; successful selling once does not guarantee future exits. A social-engineering scam can use entirely ordinary transfers and requires context that is not present on chain.
4. ABI matches, protocol view calls and proxy/control observations are partial. Unknown contracts, nested/custom calls, cross-chain destinations, future upgrades, price manipulation, MEV and changing chain state cannot be exhaustively proved safe. Collectors may observe different blocks; missing prices cannot support dollar-loss estimates.
5. Muse output can vary, abstain, fail validation or time out. The backend preserves evidence and no score instead of fabricating certainty. Citation validation is useful but is not a formal proof that every model sentence is correct.
6. Actual extension behavior must still be manually accepted in the intended browser/wallet version. The embedded test browser has no Flask extension, so this review does not claim a new end-to-end real-network Snap UI test. Reload/pair the rebuilt Snap and approve its new read-only Ethereum-provider permission before that test.
7. Public operation still needs the user's owned HTTPS domain, backend host, intended npm package and applicable MetaMask publication/distribution process. It also needs operational monitoring, abuse/cost management, backups, a privacy/retention policy, load testing and a deployment security review. Infura configuration alone does not perform these tasks. The application does not currently encrypt SQLite or automatically expire/delete stored reports.

## Manual next acceptance

Open the local app in the desktop browser with Flask, connect a dedicated account, reload and pair the rebuilt Snap, choose Sepolia, and verify wallet/RPC network agreement. Use **在当前网络验证签名前风险提示** first. Inspect the actual WalletShield message insight, decide confirm/cancel yourself, and verify that the page finds the exact Snap report. Then test a small controlled transaction/approval and a standard Permit through a trusted test dApp. Never use deliberately malicious public contracts merely to test the tool. Local 54-case tests remain available for dangerous fixtures.

For deployment commands, all tools, extraction fields, coverage profiles and data-flow details, use the project English README.
