# Evidence enrichment, model facts and integration

[English](RELIABILITY-AND-INTEGRATION.md) · [简体中文](RELIABILITY-AND-INTEGRATION-zh.md)

The latest [reliability follow-up](RELIABILITY-FOLLOWUP-2026-10-23.md) adds compact fact selection, explicit score outcomes, read-only exemptions, trace fallback and independent-label evaluation. The [complete validation](FULL-VALIDATION-2026-10-23.md) and earlier dated acceptance files preserve their original observations.

This describes implemented evidence paths and operating options. It does not certify detection accuracy, official protocol identity, future execution or public-launch readiness. WalletShield remains a **pre-sign advisory service**: the user decides in the wallet. Neither forced blocking nor continuous post-sign monitoring is enabled.

## Request-to-score workflow

| Stage | Component | What it extracts or verifies | What it cannot establish |
| --- | --- | --- | --- |
| Receive | MetaMask Snap, or an explicitly integrated dApp provider | The actual unsigned transaction/message; an SDK can explicitly submit supported permission, UserOperation and RPC requests | Requests never delivered to either entry point are not visible |
| Decode | viem, strict Zod schemas and specific adapters | Selectors, ABI arguments and committed EIP-712 type-graph fields: addresses, quantities, token IDs, caps, deadlines, nonce scope, order items and delegation tuples | A familiar name or ABI shape is not an authenticated deployment |
| Read | Configured RPC/Infura and version-specific adapters | Verified network/pinned block, balances, units, code, allowances, ownership, protocol/account state and UserOperation code/fee observations | RPC does not connect the user's wallet, identify every scam or prove arbitrary contract semantics |
| Enrich | Optional Sourcify and GoPlus | Bounded source-match records and token/address/site risk flags | No maintained deployment matching, reference USD feed or two-chain bridge route checks; a source match or reputation non-hit is not a security audit |
| Experiment | Isolated Anvil fork | Original transaction effects; supported V2/V3 dependent buy/sell experiments; selected before/after vault and lending state | Fork results are not public-chain execution, future liquidity, a reliable dollar-loss estimate or guaranteed exits |
| Assess | Muse Wonder `muse-wonder-1.0` | Six qualitative dimensions, a 0–100 or null indicator, selected observation facts, reasons, gaps and advice | Muse has no configured browsing/RPC/function-calling tools; it cannot obtain missing evidence itself |
| Validate/display | Backend, SQLite, webpage and Snap | Exact fact/citation checks, output/uncertainty constraints and one bounded, separately reserved repair when appropriate | Validation does not prove every natural-language inference; report completion is not wallet confirmation |

Extraction is **structured parsing**, not searching for suspicious keywords. For example, `approve` is decoded from its selector and ABI; Permit authority comes from a validated committed type graph; an NFT identifier remains an identifier; `allowed=true` in supported DAI-shaped Permit derives a maximum allowance; UserOperation gas/fee and nonce fields remain declared inputs, not verified EntryPoint state or actual charges.

## Structured model observations

Current provider responses use `response_schema_version: "walletshield-selection-v1"` and exact `selected_fact_ids` from `structured_fact_candidates`. The backend resolves canonical facts and stores `fact_schema_version: "walletshield-facts-v1"`; each reason and dimension retains `fact_ids` and `evidence_ids`. This avoids copying large fact objects without changing model numbers or weakening validation.

Each fact contains:

- A stable candidate ID and its original evidence ID.
- A subject role/value, exact field and scalar value.
- Its limited scope: decoded request, reported observation, reference observation, isolated fork or unresolved check.
- Original source, known chain ID, block number/hash and collection timestamp. Missing provenance remains null; request claims do not silently become verified chain provenance.

The backend rejects unknown/duplicate selections, wrong references and irrelevant facts supporting a rated dimension; legacy full-fact responses additionally require exact subject/value/field/source/chain/block/time/scope copying. It returns canonical server observations. This means **the selected references match the supplied observations**, not that an external provider or contract has been proven truthful. Metadata/status alone cannot replace substantive evidence. Historical reports remain readable.

Candidate extraction is bounded to 256 observations, 48 per evidence item and 16 entries per array; omissions are recorded. The model can select at most 32 facts and is asked to prefer 3–8 relevant facts. Full calldata, signatures, arbitrary source code, token-name text and personal-message previews are not structured-fact candidates. Other parts of the evidence packet can still contain decoded private information.

The score remains Muse's independent judgment. There are **no fixed numeric weights, floors, bands or fallback scores**. Risk, evidence support and abstention are separate: unknown evidence is neither proof of danger nor proof of safety. Critical gaps prohibit an overall `low` assessment or `strong` support; a conditional number can still use known authority/exposure while other dimensions stay unknown. A null result remains unscored. The number is not loss probability or a calibrated confidence percentage.

Model input is bounded before transmission: the serialized evidence packet may contain at most **200,000 UTF-8 bytes**, and each complete model request, including a repair, at most **500,000 bytes**. Oversized input is not silently trimmed into an apparently complete assessment: the original evidence is retained and no score is accepted for that failed analysis. Timeouts, provider failures, refused/invalid output and valid abstention likewise have no invented fallback score.

Bounded language guards also check nonce/domain direction, official-identity/safety guarantees, future execution/sellability and unsupported dollar-loss assertions across all displayed prose. Current UserOperation inputs do not establish keyed EntryPoint state; EIP-7702 comparisons retain the exact authorization tuple index and conditional snapshot scope. These guards are partial, not a universal natural-language proof system.

## Removed enrichments and independent source matching

Deployment-registry/runtime matching, reference USD feeds and maintained two-chain bridge-route validation have been removed. The backend does not read `.local/registry.json`; existing local files are left untouched. There is no registry configuration template to populate. Basic transaction/approval/signature decoding, configured RPC state, generic fork execution, selected V2 routes (including the existing native path) and token-funded V3 round trips, optional GoPlus and Muse assessment remain.

The reduced scope has practical effects: no maintained official-deployment match, reference USD valuation or bridge endpoint/counterpart validation is supplied to Muse. Registry-gated Seaport order status/counter/direct approvals and authenticated EntryPoint keyed nonce/deposit checks are unavailable. Native-funded V3 round trips and router-specific sender-sentinel recipient aliases are unsupported. Generic original-transaction simulation can still observe supported native-funded requests without claiming a dependent round-trip test.

The **Wallet and network** panel provides bounded read-only RPC capability observations: a pinned call, one historical balance query and a fixed trace probe. Success establishes only that response, not complete archive history, every trace method or future availability. The Public networks switch button calls `wallet_switchEthereumChain` directly through the selected provider, without the integration SDK, risk scan or Muse. The wallet handles confirmation.

Optional source-match observations are independent: set `ENABLE_SOURCE_VERIFICATION=1` in backend `.local/rpc.env` or the process environment and restart. It is disabled by default and separate from `ENABLE_EXTERNAL_LOOKUPS`/GoPlus. `source-verification.ts` queries a fixed Sourcify service for at most two candidate chain/address pairs with bounded responses/timeouts. It does not fetch arbitrary client URLs or send source text to Muse. A reported runtime match is not an audit, official-project identity or safety guarantee. No Sourcify API key is needed. Source-verification configuration is not displayed in the public wallet panel.

## Bounded adapters in the current reduced scope

- **Orders:** canonical Seaport `OrderComponents` yields signed offer/consideration items, raw amounts/IDs, recipients, time range, counter, conduit and hashes. Signed zero consideration recipients are flagged. Current order counter/fill/cancellation and direct-verifier token/NFT approvals are not read after registry removal. Contract-order `orderType=4`, criteria proofs, nonzero conduits, arbitrary orders, signature acceptance and fulfillment remain incomplete. Native items retain raw wei and `asset:native`, not dollars.
- **Permit2 witness:** the canonical outer transfer envelope and witness struct hash/type are identified. Custom witness meaning and consumer enforcement remain unknown; no signature is generated or consumed.
- **UserOperation:** explicit `eth_sendUserOperation` submissions support bounded v0.6 or split v0.7/v0.8 extraction. The backend can observe sender/EntryPoint/factory/paymaster code and supplied fee/base-fee relations. Declared nonce/gas/fee/prefund inputs remain request claims: no maintained EntryPoint version binding, keyed nonce/deposit verification or authenticated prefund comparison is supplied. Bundler/account/aggregator/session validation, sponsorship/token charges and full execution remain unverified.
- **EIP-7702:** tuple recovery, chain/nonce bounds, outer sender nonce, conditional ordered eligibility and one-hop delegate code remain. There is no deployment-matched delegate label. Successful cryptography is not confirmed account change, complete set-code execution or implementation audit; valid authorization can persist despite a later execution revert.
- **Vault/lending:** actual views before/after the original fork transaction retain supported raw balances, previews/limits or collateral/debt/health factor. Differences require the same asset and units. No deployment authentication, reference USD feed, future solvency/price stress or guaranteed exit is provided.
- **Authority state:** original fork transactions can yield allowance, selected NFT approval/operator or account owner/threshold/module before/after comparisons. Standalone signatures are not fabricated or consumed. Complete authority enumeration and unauthenticated guard/fallback storage remain gaps.
- **V3 swaps/positions:** token-funded same-recipient canonical single/path exact-input/exact-output variants retain bounded dependent buy/sell experiments. Original execution fields and observed input debit are retained. Native funding and router-specific sender aliases are unsupported for the round trip. Pool/factory association, tick/range and liquidity remain unauthenticated observations, not executable quotes or NFT valuations.
- **Bridges:** selected OP-shaped initiation/withdrawal/finalization fields, common source-contract reads and generic source-chain simulation remain. There are no maintained source/destination bridge/messenger bindings, version/pointer/counterpart checks or synchronized two-chain route observations. Message/proof/relay context, reserves, settlement and arrival remain unverified.

Dated acceptance notes retain their original observations. Tests of removed registry/native-V3/two-chain paths describe the historical implementation and are not current certification. Consult the current coverage matrix for present capabilities.

## Explicit dApp integration

`src/integration/provider.ts` exports `createWalletShieldProvider`. A dApp must deliberately use the returned EIP-1193 wrapper; it never patches `window.ethereum` and is not a browser-wide interceptor. The Public networks switch button does not use this wrapper; the source module remains available for cooperating dApps that explicitly opt in.

```ts
import { createWalletShieldProvider } from './src/integration/provider';

const advisoryProvider = createWalletShieldProvider(walletProvider, {
  context: () => ({
    chainId: selectedChainId,
    account: selectedAccount,
    origin: window.location.origin,
  }),
  analyze: async (request, signal) => {
    const response = await fetch('/api/security/scan', {
      method: 'POST', signal,
      headers: {
        'Content-Type': 'application/json',
        // Hosted mode: use this user's memory-only WEB bearer, not a Snap key.
        ...(webBearer ? { Authorization: `Bearer ${webBearer}` } : {}),
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error('Advisory analysis unavailable');
    return response.json();
  },
  onAdvisory: event => renderAdvisory(event),
  analyzeTransactions: false,
  analyzeSignatures: false,
  analyzeReadOnly: false,
});
```

Maintain `selectedChainId`/`selectedAccount` from the selected provider's network/account changes. Use `advisoryProvider.request(...)` for deliberately integrated calls. Transaction and signature analysis default off to avoid duplicate Snap assessment; read-only and internal Snap requests are skipped by default. Opting in changes that dApp's behavior only. Generic RPC secret/signature fields are stripped before analysis; this is not a universal secret detector. Analysis failure is reported as unavailable rather than safe, and the integration does not turn the model's risk decision into a forced wallet block. Already signed raw transactions have no pre-sign analysis entry here.

## Hosted contract-wallet login

EOA recovery proves the same key across EVM chains, so its identity remains address-scoped. An ERC-1271 login instead creates an **address-and-verified-chain identity**: its web/Snap credentials, scans, private reports, deletion and revocation are limited to that chain. The same contract address on another chain can have different owners. After changing networks, sign in and pair again on the intended chain; Snap health and request checks reject a mismatched or unobservable bound network. For a chain-bound signature, the verified identity chain is the authentication/query scope after a matching provider observation, not proof of the dApp's signing network.

Hosted resources use the verified identity scope too: an EOA uses its address key; a contract identity uses `eip155:<chainId>:<address>`. Active/recent scans, per-identity AI and evidence budgets, Snap issuance frequency and active-credential capacity use that scope, shared by its web and Snap sessions. IP/global limits and total service concurrency/credential capacity remain shared across all identities; switching chains does not increase those shared limits.

The first startup with this identity policy invalidates older hosted login challenges and web/Snap credentials once because they did not distinguish EOA and contract identities. Sign in and pair again. Stored reports, usage budgets, configuration and local-chain assets are retained; the migration does not delete them.

Hosted authentication first tries the exact stored one-use login message with EOA recovery; supported deployed contract accounts can instead use a bounded ERC-1271 `isValidSignature` **STATICCALL** through the trusted server RPC. It binds the stored message to a verified network/block/hash and rechecks the header/expiry. It performs no public-chain write.

This validates that login only, under the contract's policy at that snapshot. It does not validate a future Permit, order, UserOperation or other asset signature. Undeployed/ERC-6492 accounts, caller-dependent implementations, unsupported RPC creation-call behavior, stale/mismatched state, excessive gas or invalid return values can fail. Revalidation may be necessary after account-policy changes.

On POSIX systems, startup restricts an on-disk database and existing WAL/SHM sidecars to owner-only mode `0600`; newly created database directories use `0700`. These filesystem permissions also tighten existing databases, but do not encrypt data or protect against the same operating-system account, administrators or unprotected backups.

Vite denies direct filesystem access to `.local/`, `.audit-build/`, `.presentation-build/`, `.git/`, environment/credential files and database files, including `/@fs/` requests. Keep secrets in the designated private files; this deny list is additional protection, not permission to expose the development server publicly.

## Offline evaluation and optional paid evaluation

Run the maintained offline validator suite:

```sh
npm run evaluate:ai
```

Default behavior reads no `.local` configuration or database, starts no node, performs no RPC/model request and writes no local state. The versioned, hash-pinned dataset has 12 synthetic benign/adverse/counterfactual/injection/abstention cases. It checks accepted abstention fixtures and 120 maintained fact/prose mutations. These are **validator regressions**, not measured Muse accuracy, an independent held-out attack benchmark or calibrated loss probability.

Optional paid evaluation must be requested explicitly, with `MODEL_API_KEY` already in the process environment:

```sh
npm run evaluate:ai -- --live --confirm-paid --max-calls=2 --repeats=2 --cases=native-clear
```

Do not paste a key into a shell command or commit it. The evaluator uses synthetic packets only, no RPC or current wallet/database, and no repair calls. It accepts 1–12 calls, 1–3 repeats, explicitly selected case IDs, at most 100,000 input packet bytes and 6,000 output tokens per call. These are request limits, **not a guaranteed currency spending ceiling**; provider billing can include failures. It reports scoring coverage, abstention, adverse false-low/benign-high descriptive rates, failures, latency, score range, assessment/abstention variation and counterfactual direction with denominators. Failed output is distinct from abstention; correlated repeated runs do not provide independent confidence intervals.

Before public risk-quality claims, separately obtain reviewed real attack/normal-operation data, isolate protocol/time/attack-family holdouts, preregister acceptance criteria and report false positives/negatives plus coverage and abstention. Neither the local wallet catalog nor the default evaluator establishes that evidence today. Dated live-call observations and their limits are reported separately in [the full validation record](FULL-VALIDATION-2026-10-22.md).
