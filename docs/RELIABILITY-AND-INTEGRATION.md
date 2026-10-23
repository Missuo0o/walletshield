# Evidence enrichment, model facts and integration

[English](RELIABILITY-AND-INTEGRATION.md) · [简体中文](RELIABILITY-AND-INTEGRATION-zh.md)

This describes implemented evidence paths and operating options. It does not certify detection accuracy, official protocol identity, future execution or public-launch readiness. WalletShield remains a **pre-sign advisory service**: the user decides in the wallet. Neither forced blocking nor continuous post-sign monitoring is enabled.

## Request-to-score workflow

| Stage | Component | What it extracts or verifies | What it cannot establish |
| --- | --- | --- | --- |
| Receive | MetaMask Snap, or an explicitly integrated dApp provider | The actual unsigned transaction/message; an SDK can explicitly submit supported permission, UserOperation and RPC requests | Requests never delivered to either entry point are not visible |
| Decode | viem, strict Zod schemas and specific adapters | Selectors, ABI arguments and committed EIP-712 type-graph fields: addresses, quantities, token IDs, caps, deadlines, nonce scope, order items and delegation tuples | A familiar name or ABI shape is not an authenticated deployment |
| Read | Configured RPC/Infura and version-specific adapters | Verified network/pinned block, balances, units, code, allowances, ownership, protocol/account state and limited UserOperation state | RPC does not connect the user's wallet, identify every scam or prove arbitrary contract semantics |
| Enrich | Maintained deployment/feed records, optional Sourcify and GoPlus | Code/implementation bindings, reference oracle prices, source-match records and bounded token/address/site risk flags | A code/source match or reputation non-hit is not a security audit or safety guarantee |
| Experiment | Isolated Anvil fork | Original transaction effects; supported V2/V3 dependent buy/sell experiments; selected before/after vault and lending state | Fork results are not public-chain execution, future liquidity, a reliable dollar-loss estimate or guaranteed exits |
| Assess | Muse Wonder `muse-wonder-1.0` | Six qualitative dimensions, a 0–100 or null indicator, selected observation facts, reasons, gaps and advice | Muse has no configured browsing/RPC/function-calling tools; it cannot obtain missing evidence itself |
| Validate/display | Backend, SQLite, webpage and Snap | Exact fact/citation checks, output/uncertainty constraints and one bounded, separately reserved repair when appropriate | Validation does not prove every natural-language inference; report completion is not wallet confirmation |

Extraction is **structured parsing**, not searching for suspicious keywords. For example, `approve` is decoded from its selector and ABI; Permit authority comes from a validated committed type graph; an NFT identifier remains an identifier; `allowed=true` in supported DAI-shaped Permit derives a maximum allowance; a UserOperation deposit comparison remains a declared prefund observation, not an actual fee.

## Structured model observations

Current model responses use `fact_schema_version: "walletshield-facts-v1"`. The backend supplies `structured_fact_candidates` and the model selects exact `facts`; each reason and dimension references `fact_ids` as well as `evidence_ids`.

Each fact contains:

- A stable candidate ID and its original evidence ID.
- A subject role/value, exact field and scalar value.
- Its limited scope: decoded request, reported observation, reference observation, isolated fork or unresolved check.
- Original source, known chain ID, block number/hash and collection timestamp. Missing provenance remains null; request claims do not silently become verified chain provenance.

The backend rejects modified subjects, values, fields, source/chain/block/time/scope, duplicate facts, wrong references and irrelevant facts supporting a rated dimension. It returns canonical server observations. This means **the model copied the supplied observation correctly**, not that an external provider or contract has been proven truthful. Metadata/status alone cannot replace substantive evidence. Existing historical reports without this schema remain readable; current Muse responses must supply it.

Candidate extraction is bounded to 256 observations, 48 per evidence item and 16 entries per array; omissions are recorded. The model can select at most 32 facts and is asked to prefer 3–8 relevant facts. Full calldata, signatures, arbitrary source code, token-name text and personal-message previews are not structured-fact candidates. Other parts of the evidence packet can still contain decoded private information.

The score remains Muse's independent judgment. There are **no fixed numeric weights, floors, bands or fallback scores**. Risk, evidence support and abstention are separate: unknown evidence is neither proof of danger nor proof of safety. Critical gaps prohibit an overall `low` assessment or `strong` support; a conditional number can still use known authority/exposure while other dimensions stay unknown. A null result remains unscored. The number is not loss probability or a calibrated confidence percentage.

Bounded language guards also check nonce/domain direction, official-identity/safety guarantees, future execution/sellability and unsupported dollar-loss assertions across all displayed prose. UserOperation nonce claims need their keyed EntryPoint observation; EIP-7702 comparisons retain the exact authorization tuple index and conditional snapshot scope. These guards are partial, not a universal natural-language proof system.

## Optional operator-maintained registry and prices

Create `.local/registry.json` on the backend. A valid empty starting file is:

```json
{"version":1,"deployments":[],"priceFeeds":[],"bridgeRoutes":[]}
```

Empty lists do not establish any trusted deployment or price. Operators must independently source, review and maintain real records. No invented official defaults are supplied.

| Record | Required fields and checks |
| --- | --- |
| Deployment | `chainId`, `address`, `protocol`, `version`, `role`, runtime `codeHash`, HTTPS `sourceUrl`; optional EIP-1967 `implementation` address/code hash. Reads compare actual pinned code and, when configured, the implementation slot/code. Other proxy architectures need adapters. |
| USD reference feed | `chainId`, `asset` (contract address or `native`), `feed`, feed runtime `codeHash`, `currency:"USD"`, `assetDecimals`, `maxAgeSeconds`, `expectedDescription`, HTTPS `sourceUrl`. The pinned read checks code, description, positive answer, round/time conditions and decimals. The operator remains responsible for the feed-to-asset association. |
| OP bridge route | `adapter:"op-standard-bridge-v1"`, `sourceChainId`, `destinationChainId`, `sourceBridge`, `destinationBridge`, `sourceMessenger`, `destinationMessenger`, HTTPS `sourceUrl`. The chains must differ; configure both server RPCs and all four matching deployment/code/version records. The adapter checks reviewed bridge/messenger versions and reciprocal pointers/paused state at separate chain snapshots. Reverse initiation is configured explicitly. No particular message/proof, relay context, settlement or arrival is proved. |

Keys are matched by **network and contract address**, never token symbol alone. Invalid/oversized configuration or failed reads remain gaps. A reference price is not an executable quote or guaranteed USD loss; market depth, depegs, future prices, oracle governance and proxy changes remain separate concerns. This version does not enable an AI dollar-loss guarantee merely because a price is present.

The **Wallet and network** panel exposes the configured registry counts and source-verification setting, then offers read-only RPC capability observations: a fixed pinned call, one historical balance query and a fixed trace probe. A successful probe establishes only that specific response. It does not prove complete archive history, every trace method or future provider availability. The page can submit its own network-switch request through the explicit SDK advisory; this is not a hook into other sites.

For optional source-match observations, set `ENABLE_SOURCE_VERIFICATION=1` in backend `.local/rpc.env` or the process environment and restart the backend. It is disabled by default and separate from `ENABLE_EXTERNAL_LOOKUPS`/GoPlus. The collector queries a fixed Sourcify service for at most two candidate chain/address pairs, with bounded responses/timeouts. It does not download arbitrary client URLs or send source text to Muse. A reported runtime match is not a code audit or verified project identity. No Sourcify API key is configured here.

## Additional bounded adapters

- **Orders:** canonical Seaport `OrderComponents` commits offer/consideration items, raw amounts/IDs, recipients, time range, counter, conduit and hashes. Trusted order-state reads require a matching maintained deployment with both role and protocol `seaport`, reviewed version **1.6**, and the actual `information()` runtime version/domain comparison. The signed counter, current counter, fill/cancellation state and time remain distinct. Contract-order `orderType=4` is unsupported because its nonce/hash semantics differ; signed zero consideration recipients are explicitly flagged. Direct zero-conduit ERC-20/ERC-721 approval checks require the same binding. Criteria proofs, nonzero conduits, arbitrary orders, signature acceptance and fulfillment remain incomplete. Native offer/consideration items retain raw wei and are labeled `asset:native`, not a zero-address token or USD.
- **Permit2 witness:** the canonical outer transfer envelope and witness struct hash/type are identified. Custom witness business meaning and enforcement by the consumer remain unknown; no signature is generated or consumed.
- **UserOperation:** explicit `eth_sendUserOperation` submissions support bounded v0.6 or split v0.7/v0.8 shapes. A matching maintained EntryPoint version/code binding with role `entrypoint`, protocol `erc4337`, and the corresponding exact version `0.6`, `0.7` or `0.8` gates keyed nonce and deposit/prefund reads. Code and supplied fee/base-fee relations are separately observed. Bundler simulation, account/aggregator/session policy, paymaster authorization/token charges and full execution remain unverified.
- **EIP-7702:** actual tuple recovery/chain/nonce bounds, outer sender nonce, conditional sequential tuple eligibility and one-hop delegate code are distinguished. An authorization may persist even if execution later reverts. Successful cryptography or a conditional last-eligible tuple is not a confirmed account change or an audit of the delegated implementation.
- **Vault/lending:** actual view reads before and after the original fork transaction record supported raw share/underlying balances, previews/limits or collateral/debt/health factor. Differences require matching asset/units. These are scenario observations, not future solvency, price stress, oracle reliability or public execution.
- **Authority state:** original fork transactions can produce before/after allowance, selected NFT approval/operator or account owner/threshold/module observations and same-store comparisons. Standalone signatures are not fabricated or consumed; complete authority enumeration and unauthenticated guard/fallback storage remain missing.
- **V3 swaps/positions:** supported canonical single/path exact-input/exact-output variants retain original buy execution fields and use observed input debit for the derived sale ratio. Native funding needs verified configured router/wrapped-native bindings. Pool interface association, tick/range and liquidity are candidate state, not authenticated pool identity, an executable quote or NFT valuation. Opaque aggregators remain incomplete.
- **Bridges:** the reviewed OP adapter is based on `op-contracts/v3.0.0`: L1 bridge `2.3.0`, L2 bridge `1.13.0`, L1 messenger `2.6.0`, L2 messenger `2.2.0`, and mintable-token candidate `1.4.0-beta.5`. Bridge records require protocol `op-standard-bridge`/role `bridge`; messenger records require protocol `op-cross-domain-messenger`/role `messenger`; a maintained mintable token requires protocol `op-mintable-erc20`/role `other`. A configured route can compare those source/destination bindings and selected token counterpart getters. Chain snapshots are independent; a mintable-token getter match does not establish reserves, redemption, relay proof, message validity or future arrival.

## Explicit dApp integration

`src/integration/provider.ts` exports `createWalletShieldProvider`. A dApp must deliberately use the returned EIP-1193 wrapper; it never patches `window.ethereum` and is not a browser-wide interceptor.

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

Hosted authentication first tries the exact stored one-use login message with EOA recovery; supported deployed contract accounts can instead use a bounded ERC-1271 `isValidSignature` **STATICCALL** through the trusted server RPC. It binds the stored message to a verified network/block/hash and rechecks the header/expiry. It performs no public-chain write.

This validates that login only, under the contract's policy at that snapshot. It does not validate a future Permit, order, UserOperation or other asset signature. Undeployed/ERC-6492 accounts, caller-dependent implementations, unsupported RPC creation-call behavior, stale/mismatched state, excessive gas or invalid return values can fail. Revalidation may be necessary after account-policy changes.

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

Before public risk-quality claims, separately obtain reviewed real attack/normal-operation data, isolate protocol/time/attack-family holdouts, preregister acceptance criteria and report false positives/negatives plus coverage and abstention. Neither the local wallet catalog nor the default evaluator establishes that evidence today. No paid Muse evaluation was run to validate these changes.
