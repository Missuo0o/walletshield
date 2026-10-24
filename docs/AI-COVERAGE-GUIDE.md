# WalletShield: tools, evidence, AI assessment and coverage

This guide describes implemented version 0.4.1 paths and their limits. It is generated from the same coverage profiles used by the webpage and Snap. There are **30 analysis profiles**, with **66 local wallet cases** (51 transaction and 15 message requests) representing **25 profiles**. Counts are not detection accuracy, a safety rating or evidence that every method was tested.

Current checks use the wallet-supplied unsigned request, source origin/network metadata and successfully collected RPC, intelligence and simulation evidence. Muse assesses observable request signals, including supported source/message/request inconsistencies. Chain/provider/execution context means technical observations. Historical reports and acceptance artifacts retain their original recorded data.

## Current evidence and integration additions

Muse returns compact `walletshield-selection-v1` fact IDs, resolved by the backend into the existing `walletshield-facts-v1` subject/field/value/source/chain/block/time/scope objects. Per-reason/dimension fact references and all semantic checks remain. Historical full-fact output remains readable. This avoids model copying errors without proving every provider response or free-form sentence. Scores remain Muse-only, with no fixed weights, floors or fallback. See [the reliability follow-up](RELIABILITY-FOLLOWUP-2026-10-23.md) and [independent-label evaluation](INDEPENDENT-EVALUATION.md).

Transaction tracing tries debug_traceCall then trace_call, optionally using server-only TRACE_RPC_<CHAIN_ID>_URL fallback bound to the primary chain/block/hash/time. Bounded call frames support execution only, not full asset discovery or safety. Unsupported provider methods remain explicit gaps. Canonical narrowly allowlisted read-only queries are recorded as not-applicable without a model call; privacy remains unassessed.

Backend deployment-registry/code matching, reference USD feeds and maintained two-chain bridge-route validation have been removed. Existing `.local/registry.json` files are not read. Basic transaction/approval/signature decoding, configured RPC state, selected V2 routes (including the existing native path), token-funded V3 and generic fork simulation, optional GoPlus and Muse assessment remain. `ENABLE_SOURCE_VERIFICATION=1` independently enables bounded Sourcify source-match observations; this is not an official-deployment registry or code audit.

Bounded evidence includes Seaport signed commitments, Permit2 witness outer commitments, UserOperation parameter/code/fee observations, EIP-7702 tuple cryptography/conditional state, actual fork before/after selected authority/vault/lending observations, token-funded V3 route experiments and candidate pool state. Registry-gated Seaport counter/status/direct approvals and EntryPoint keyed nonce/deposit checks are no longer available. An explicit dApp provider wrapper supplies cooperating-app requests; it is not a global wallet interceptor. Hosted ERC-1271 support validates this login only, not future asset signatures.

The Wallet and network panel offers bounded read-only RPC capability observations: a fixed pinned call, one historical balance and a fixed trace probe. A successful probe is not a complete archive/trace guarantee. Source verification remains an independent optional backend setting and is not displayed in the public wallet panel. The Public networks switch button calls `wallet_switchEthereumChain` directly through the selected wallet provider. It does not invoke the integration SDK, a security scan or Muse; the wallet handles confirmation.

`npm run evaluate:ai` runs a hash-pinned synthetic validator suite with zero model/RPC calls. It does not measure live Muse accuracy. Paid evaluation needs explicit `--live --confirm-paid`, selected cases and a call budget; it is never automatic.

See [evidence, configuration, exact tools/fields, SDK, evaluation and remaining boundaries](RELIABILITY-AND-INTEGRATION.md).

## 1. Request entry and component responsibilities

| Component | What it does | What it does not establish |
| --- | --- | --- |
| Webpage | Selects one EIP-1193 provider discovered through EIP-6963, connects an account, checks a configured network, starts explicitly selected wallet requests and shows reports | A webpage cannot automatically inspect unrelated dApp requests merely because an account connected. |
| MetaMask Snap | Receives supported unsigned transaction/message hooks, sends them to the compiled backend, and shows an insight before the user's final decision | It is not a global interceptor for permissions, sessions, UserOperations or arbitrary wallet RPCs. |
| Fastify/Zod backend | Validates input, decodes known shapes, selects collectors, preserves evidence/unknowns, calls Muse within quota, validates output and stores reports | Origin is not hosted authentication. A decoded method is not authenticated protocol identity. |
| Muse Wonder | Evaluates the supplied evidence and returns cited dimensions, an optional number, uncertainty and advice | No browsing, wallet access, RPC tools or function-calling tools are configured for the model. It cannot invent live chain data. |
| SQLite | Stores unsigned requests, evidence, outputs and counters; in hosted mode also hashed credentials, owner mappings and challenges | The database is not encrypted by this application. Hosted owner-confirmed logical report deletion and optional bounded retention are available; retention defaults to disabled. |

Automatic entry is limited to EVM transaction and message requests MetaMask actually supplies to the Snap. Other wallet RPCs require explicit submission.

Automatic entry means eligible for the hook, not guaranteed success. Installation, pairing health, wallet delivery, backend availability, correct network configuration and successful evidence collection are separate requirements. A wallet can reject before delivering a hook. A message can authorize later spending without immediately broadcasting a transaction.

Pre-sign advice only. You decide in the wallet; this tool does not force a block or continuously monitor after signing.

## 2. Tools selected before AI

| Tool / implementation | Specific observations | Limits |
| --- | --- | --- |
| Request decoder: decode.ts / operations.ts / viem | Exact supported selector/ABI candidate, addresses, amounts, recipients, limits, deadlines and committed EIP-712 fields | Unsupported/trailing/malformed input remains unknown. Matching a name or selector does not prove protocol identity. |
| Trusted EVM RPC: providers.ts | eth_chainId, pinned block/hash/time, independently retained native balance/code, confirmed nonce, a separate unpinned node pending-nonce view, supplied fee versus current base fee and bounded eth_call with supplied execution fields | A call not reverting does not prove complete asset behavior, accepted nonce, future inclusion or honest recipient. |
| Asset reads: assets.ts | Code, ERC-165 declarations, symbol/decimals, balances, ERC-20 allowance, selected NFT owner/approval/operator state | Up to eight explicit assets and 16 NFT IDs per asset. Metadata/interfaces can lie; raw quantities are not dollars. |
| Contract/protocol reads: protocols.ts | Code hash; ERC-1967 implementation/admin/beacon slots; readable owner/paused; vault asset/totals/preview/max; Aave-shaped current collateral/debt/LTV/threshold/health factor | Empty proxy slots do not prove immutability. Current interface returns do not authenticate a deployment, valuation or future solvency. |
| Signature checks: signatures.ts | Valid type graph/encoding/digest/domainHash; canonical Permit/NFT/DAI, selected ERC-3009 and common Permit2 state reads; generic DOMAIN_SEPARATOR, signer/verifier code and one-hop delegation | No generated signature recovery, ERC-1271 acceptance test or future consumption execution is performed by pre-sign analysis; DAI authority is derived from allowed, while ERC-3009 is a single-transfer authorization. |
| SIWE envelope inspection: siwe.ts | Supported EIP-4361 header, account, URI origin, version 1, field order, nonce format/length, issued/expiry/not-before times and up to 16 resource origins | Does not verify remote nonce issuance/use, signature, session/audience acceptance or website honesty. |
| Smart-account candidates: account-operations.ts / account-evidence.ts | Exact Safe-style owner/threshold/module/guard/fallback/hash/execution parameters; independently pinned owners/threshold/selected module and code reads | No authenticated Safe identity, complete guard/module graph, signature acceptance, ERC-1271 or ERC-4337 validation. |
| Selected protocol candidates: protocol-operations.ts / position-evidence.ts | Generic withdrawal, selected bridge stages and V3 position tuples; existing position/owner/approval/token-unit/balance reads | No official deployment, counterpart/endpoint validation, valuation, destination proof or guaranteed exit. |
| Structural batch inspection: batch-evidence.ts | Canonical multicall/Safe/MultiSend summaries, bounded child parameters, CALL/delegatecall and unknown/truncation markers | Depth 3, 32 entries, 16384 bytes/body, 32768 recursive bytes. Structure is not verified execution or child authority. |
| Orders/witness: orders.ts / signatures.ts | Canonical Seaport signed items/counter/time/hashes and zero-recipient warning; Permit2 witness type/hash envelope | No current Seaport counter/fill/cancellation/direct approval checks, generated signature, fulfillment or custom consumer enforcement. |
| UserOperation/delegation: user-operation-evidence.ts / delegation-evidence.ts | Explicit parameter/code/fee observations; actual authorization tuple recovery and conditional sequence state | No maintained EntryPoint keyed nonce/deposit/prefund verification, full bundler/account/paymaster or set-code execution proof. |
| Optional source match: source-verification.ts | Bounded Sourcify records for candidate chain/address pairs | A reported source match is not maintained official-deployment authentication, an audit or a safety guarantee; no registry/feed/bridge-route enrichment runs. |
| Fork/position state: fork-protocol-state.ts / fork-authority-state.ts / position-evidence.ts | Actual before/after selected authority/vault/lending state and compatible differences; candidate V3 pool/tick/liquidity | Snapshot/candidate observations only; no full authority graph, future solvency, executable quote or NFT value. |
| Structured observations: model-facts.ts | Exact subject/field/scalar/scope/provenance candidates and selected fact/citation validation | Bounded allowlist, not universal prose truth or a new score algorithm. |
| dApp provider: integration/provider.ts | Explicit unsigned request analysis before the selected provider call | Cooperating app only; never patches every wallet or globally observes RPCs. |
| Evidence inventory: quality.ts | Status counts, source groups, observation-time flags, block provenance, mixed upstream blocks, conflicting same-height hashes and authenticated-credential attribution | No risk score, coverage percentage, calibration or cryptographic Snap attestation. |
| Independent Snap-provider snapshot | Read-only eth_chainId with source and observation time, stored separately in signature.providerContext | Not bound to the initiating dApp or request time. Domain matches do not prove request network; differences are contextual warnings. |
| Isolated Anvil fork: simulation.ts | Verifies upstream chain/base block hash; executes only on a temporary local fork; records execution block, native deltas/gas, discovered standard assets and bounded calls | Preserves supplied gas/fees/nonce; missing gas uses an explicit default. It does not forge user balances/permissions or broadcast upstream. Hidden/nonstandard assets and future state remain incomplete. |
| Selected V2/V3 round trip | Original buy, acquired output/input debit, bounded derived sale; selected V2 routes retain their existing native path; eight canonical token-funded V3 single/path exact-in/exact-out variants exclude V3 native funding and router-specific sender aliases | Same supported recipient/funding only. Derived sale is an experiment, not the production request; fees/price impact are included and future liquidity/MEV remain unknown. |
| GoPlus, optional | Supported-chain discovery; normalized website origin, up to eight decoded token candidates and eight explicit counterparties; selected phishing/honeypot/tax/control flags | Off by default. Limits: 18 network requests, four concurrent, 1.8 seconds/request and 7.5 seconds total; responses cache for 30 seconds. Unsupported chains, omitted candidates, absent fields and non-hits are not safety. Provider data age remains unverified. |
| Rules / router | Tool plan, observable permission/value/expiry/account/domain signals and explicit gaps | Qualitative observations only. No points, score floor, fixed weights or numeric fallback. A selected tool is not a successful observation. |
| Meta Responses API | Fixed muse-wonder-1.0 model assesses the whitelisted packet and cites actual evidence IDs | A score is an uncalibrated risk indicator, not a loss probability or authenticity certificate. |
| Hosted EOA / deployed-contract login | Exact one-use domain/URI/nonce login challenge; recovered signer; hashed web/Snap credentials, owner-scoped reports, wallet-wide revocation, logical deletion, optional retention and persistent evidence/model quotas | Separate from asset-risk analysis. Supported deployed-contract ERC-1271 login validates only the stored login; login does not authorize assets. |

Confirmed-state collectors verify/pin their own reads. The additional pending nonce is explicitly one node’s unpinned view: it can omit private/remote transactions and supplies no original payload, cancellation intent or replacement-fee policy. Their blocks and observation times can differ; the complete report is not one atomic global snapshot. Independent RPC/header/balance/code reads retain successful results when another read fails. Fork execution mines child blocks after its recorded base. Tool selection/availability and successful data collection are recorded separately. The quality inventory flags observations older than five minutes relative to report creation, missing/invalid timestamps and timestamps over 30 seconds ahead. These are freshness diagnostics, not numeric risk thresholds; an observation timestamp does not establish the provider data age. Reads are pinned by block number, not atomically by block hash. Recorded hashes are provenance and do not rule out reorganizations or inconsistent provider replies. Conflicting hashes at one chain/height require a fresh independent check and prevent overall low/strong confidence.

## 3. Exact model input fields

The evidencePacket function in src/security/ai.ts supplies these containers. It does not send the entire original request as model input.

| Field | Extracted contents and qualifications |
| --- | --- |
| version, createdAt, reportSource, evidenceComplete | Report format/time, actual versus synthetic source and explicit evidence-gap state. Demo observations cannot be treated as current real-chain facts. |
| chainId | Transaction/request network; zero when a signature has no request-bound chain. A typed domain can guide reads as a declared network. |
| origin | HTTP/HTTPS origin only; removes URL credentials, path, query and fragment. |
| quality | Status counts; per-source observed/unknown counts; snapshots with chain, block/hash/time when available; separate observation-time and public-block age/hash/time/chain flags; mixed upstream-block chains and conflicting same-height block hashes; capture channel and wallet credential attribution. Counts and age flags are not safety/confidence percentages. |
| evidence_admissibility, claim_support | Server-owned dimension-relevant observation IDs and bounded basic-call/fork execution/fork sale support; these constrain citations and selected factual claims, not numeric weights or universal truth. |
| requestSummary | Transactions: from, target, valueWei, selector, calldataBytes. Signatures: from and method. Other RPC: method. Full calldata/digest is not included here. |
| feeParameters | Supplied gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas and nonce as exact decimal integer strings; missing fields are not invented. |
| unsupportedTransactionFields | Explicit unsupported execution-field markers; a reduced replacement transaction is not presented as equivalent execution. |
| operation | Category, candidate label, decoded fields, targets, token/standard and permission/complexity markers. Fields must be interpreted with their asset standard and units. |
| checks | Evidence ID, status, title/detail, source, observedAt and structured data: block/balance/code, permissions, protocol returns, signature state, fork deltas/calls or intelligence where obtained. |
| missing_checks | Union of explicit missing data and unknown checks, including incomplete-report state. Missing observations are not successful checks. |
| assessment_scope | Server-derived observable-request scope and unresolved check/missing-data inventory. It is not a numerical score or a claim that incomplete evidence is complete. |
| request_data_scope, snapshot_consistency, quantity_conventions | Bounded extraction/provenance, per-collector snapshot differences and exact quantity/unit interpretation. |
| structured_fact_candidates | Allowlisted exact observations and admissible dimensions, version and omission inventory; the model selects exact IDs and the backend resolves their original facts. |
| analysis_dimensions, score_meaning | The six required cited dimensions and the independent 0–100-or-null risk-indicator policy. |

Ordinary messages have at most 1,600 preview characters. Generic RPC summaries typically inspect up to five nesting levels, 16 items per array, 40 recognized scalar fields and eight target addresses. Full request data can remain in backend storage even when only a summary reaches the model. Simulation considers bounded logs (up to 256), discovered assets (up to 32) and calls (up to 128); explicit asset and ID reads have their own smaller limits. Truncation is a coverage gap.

Raw amount strings are smallest units unless the same asset's decimals were read. valueWei/native balances/gasWei are wei; gas is an execution-unit count and fee rates are wei per gas; nonce is a counter. Shares differ from underlying assets. NFT IDs are not financial amounts. roundTripReturnPercent is already a percentage and includes more than tax. Aave-shaped healthFactor uses 1e18 for one; Base-field currency is not automatically verified. Without a price source, dollar loss cannot be inferred.

DAI allowed mapping is reference-derived authority, not another signed amount. ERC-3009 commits one exact transfer, whereas Permit2 transfer is a single-nonce cap; neither is a standing allowance. If the current ERC-3009 balance cannot cover the exact amount, balanceCoversDeclaredAmount=false is recorded and no smaller partial-transfer bound is invented. Conditional allowance/cap bounds are not measured future loss. Empty-data DELEGATECALL remains delegated execution rather than a native payment. See [the extension notes](EXTENDED-COVERAGE-2026-10-22.md) for test and identity boundaries.

## 4. All profiles: evidence attempted and remaining gaps

The following fields describe the attempted path. Only successful observations become facts. Missing configuration, unavailable interfaces, timeouts and unsupported semantics remain in the packet. **Candidate decoding, automatic entry and complete protocol verification are different claims.**

### 1. Native transfer / contract recipient

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Common transaction checks; recipient identity is unverified.
- **Fields/evidence supplied when obtained:** from, to, value, chainId, source origin, gas and supplied fee parameters; Verified RPC chain/block, nativeBalanceWei, target code and one-hop delegation code; confirmed nonce at a pinned block, separate unpinned node pending-nonce view and supplied fee versus observed base fee; optional fork native deltas, gas and bounded calls; Available address and website intelligence, only when enabled.
- **Still unknown:** A transfer does not prove recipient identity, correct destination network, future honesty or final fees.
- **Possible extension and its boundary:** Add trusted address-book/name resolution, verified recipients, supported-chain policies and fee references. These still cannot guarantee recipient honesty.

### 2. ERC-20 transfer

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Standard transfer candidate and partial asset changes.
- **Fields/evidence supplied when obtained:** Token contract, recipient and raw amount from transfer(address,uint256); Readable symbol, decimals, balance, asset code and fixed block; Optional observed balance deltas, excess-spending evidence and token intelligence.
- **Still unknown:** Names can be forged. Nonstandard fees, rebasing, assets without events and monetary valuation are incomplete.
- **Possible extension and its boundary:** Add trusted token registries, prices, standards and protocol adapters. Arbitrary contracts can still use unknown storage or deceptive interfaces.

### 3. NFT / delegated transfer / batch NFT transfer

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Common ERC-721/ERC-1155 methods; shared selectors require a standard check.
- **Fields/evidence supplied when obtained:** owner, recipient, tokenId or ids/amounts from the decoded transfer; ERC-165 declarations; ownerOf/getApproved or ERC-1155 balanceOf for up to 16 IDs per asset; Selected isApprovedForAll state; optional fork ownership/balance changes and bounded calls.
- **Still unknown:** Contracts can lie about standards. Collection authenticity, value, all callbacks and nonstandard asset behavior are unverified.
- **Possible extension and its boundary:** Add trusted collections, more ID/callback adapters and pricing. Authenticity and market value still require independent evidence.

### 4. Single approval / revocation / on-chain Permit

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Common permission parameters; spender identity remains incomplete.
- **Fields/evidence supplied when obtained:** spender, amountOrTokenId, large-allowance flag, and supported owner/deadline fields; Asset-standard queries; existing ERC-20 allowance where supported; Current balance, partial controls, optional intelligence and fork excess-spending evidence.
- **Still unknown:** ERC-20 and ERC-721 approve share an encoding. Finite permissions can be malicious; on-chain Permit variants and future spending are not fully covered.
- **Possible extension and its boundary:** Add per-NFT permissions, additional custom Permit adapters, verified spender identity and history. Future upgrades or permission abuse cannot be ruled out.

### 5. NFT operator approval / revocation

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Recognizes collection-wide operator permission.
- **Fields/evidence supplied when obtained:** Collection contract, operator and approved boolean; Whether this request increases collection-wide authority; readable selected operator state; Available controls, address intelligence and fork behavior.
- **Still unknown:** Current and future NFT exposure is not fully enumerated. Operator identity and later use remain unknown.
- **Possible extension and its boundary:** Add holdings and per-NFT exposure, trusted protocol identity and more operator-state checks. Future assets and behavior remain uncertain.

### 6. Permit2-shaped on-chain allowance

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Common four-argument approve candidate.
- **Fields/evidence supplied when obtained:** token, spender, uint160 amount and expiration; Separate ERC-20 allowance(owner, claimed Permit2 contract) and internal Permit2 allowance(owner, token, final spender), including amount, expiration and nonce; each unavailable layer stays unknown; Readable token units/balance, fixed block, optional intelligence and fork observations.
- **Still unknown:** A function shape or readable allowance does not authenticate Permit2. Code/deployment identity, domain semantics and future consumption remain unverified.
- **Possible extension and its boundary:** Add verified deployments/code hashes, candidate-specific domain checks and consuming-transaction adapters. Future consumption still needs its own request analysis.

### 7. Common V2 swap / sell-restriction evidence

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Common router parameters; conditional isolated buy/sell round trip.
- **Fields/evidence supplied when obtained:** method, path, amountIn, amountOutMin, recipient and deadline; When supported, acquired tokens, reverse-sell result, returned amount, gas and asset deltas in a fork; Available honeypot, sell-tax, blacklist and administrator observations.
- **Still unknown:** Selling can fail because of balance, routing or liquidity. Round-trip loss is not pure tax, and one successful sale does not guarantee later sales.
- **Possible extension and its boundary:** Add more routes, verified liquidity/quotes and multiple amounts/accounts. Future blacklists, upgrades and ordering cannot be completely predicted.

### 8. Common V3 swap

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Eight canonical single/path exact-input/exact-output variants with dependent isolated buy/sell checks.
- **Fields/evidence supplied when obtained:** Decoded token path, fees, recipient, exact input/output or maximum input, limits and optional deadline; Original buy gas/fees/nonce retained; acquired output and observed input debit; derived reverse sale in an isolated fork for supported same-recipient routes; Token-funded same-recipient routes only; native funding and router-specific sender-sentinel aliases are unsupported; bounded token/counterparty intelligence.
- **Still unknown:** A successful scenario is not future sellability, official pool identity, an executable quote or MEV protection. Opaque aggregators, router-balance funding and unsupported recipients/variants remain gaps.
- **Possible extension and its boundary:** Add trusted quoters, route/liquidity/price and multiple-size/account stress scenarios. Future ordering, prices, upgrades and liquidity remain uncertain.

### 9. ERC-4626-shaped vault / shares

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Candidate parameters, current state and actual before/after original fork execution.
- **Fields/evidence supplied when obtained:** deposit/mint/withdraw/redeem, raw amount/kind, receiver and owner; current asset/totals/preview/max and share/underlying units; Pinned fork before/after share and underlying balances, previews/limits/allowance and same-asset/same-unit differences; Separate upstream and child-fork block/hash/time and explicit missing reads; no maintained deployment matching or reference USD prices.
- **Still unknown:** Interface returns do not authenticate a vault. Observed changes do not prove future valuation, solvency, donation/rounding safety, prices or exits.
- **Possible extension and its boundary:** Add reviewed protocol-specific economic/rounding and price/liquidity stress scenarios. Future asset losses and redeemability cannot be guaranteed.

### 10. Lending / collateral

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Aave-shaped current and actual fork post-operation account observations.
- **Fields/evidence supplied when obtained:** Asset, amount, onBehalfOf, rate mode or collateral flag; current collateral/debt/available borrow/LTV/liquidation threshold/health factor; Original transaction fork before/after account returns, conditional raw differences and an observed after-execution health-factor-below-one signal; Pinned phase snapshots, selected underlying units/balance/allowance and independently retained missing data.
- **Still unknown:** Protocol/oracle authenticity, future prices, stress liquidation outcomes, rates, full positions and future solvency remain unverified. Base-currency fields are not automatically USD.
- **Possible extension and its boundary:** Add maintained protocol versions, trusted prices/rates and explicit scenario assumptions. Snapshot results cannot predict future market/oracle/administrator actions.

### 11. Staking / unstaking / reward withdrawal

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Selected common functions and generic fork checks.
- **Fields/evidence supplied when obtained:** Candidate stake/unstake/withdraw/getReward/claimReward method; Readable raw amount and receiver; Partial controls, fixed block, recognized fork assets and bounded calls.
- **Still unknown:** Lock periods, slashing, reward formulas and funding sources are not automatically read. A withdraw method can belong to another protocol.
- **Possible extension and its boundary:** Add adapters for verified protocols, positions, lock/exit conditions and simulation. Future yield, slashing and solvency cannot be promised.

### 12. Liquidity / concentrated-liquidity position changes

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Selected V2/V3 parameters, existing position state and bounded candidate pool association.
- **Fields/evidence supplied when obtained:** V2 amounts/minima/LP quantity/recipient/deadline; strict V3 mint/increase/decrease/collect fields, tokenId/ticks/fee/liquidity and per-token bounds; Existing position ownership/approval/operator, manager/token units/balances; candidate factory/getPool, reciprocal token/fee/factory, slot0 tick/range and active liquidity when obtained; Fixed block/hash/time; independent partial failures, generic fork effects and bounded intelligence.
- **Still unknown:** Getter association is not official pool identity, a market quote, correct price, NFT/LP valuation, impermanent-loss or complete exit/fee analysis. New mint has no existing position.
- **Possible extension and its boundary:** Add maintained factory/pool/manager bindings, quoters, prices and explicit exit/stress scenarios. Future fees, prices and liquidity remain uncertain.

### 13. Selected bridge initiation / withdrawal / finalization

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Selected OP-shaped source-request parameters and generic source-chain observations.
- **Fields/evidence supplied when obtained:** Selected initiation/withdrawal/finalization fields: local/remote token, value/amount, recipient, asset sender, gas and extraData length; Common source-contract controls and optional generic source-chain fork effects; no maintained two-chain endpoint/counterpart checks; Observed source chain/block/hash/time; endpoint identity, finalization caller context and proof/relay/arrival remain unverified.
- **Still unknown:** Bridge/messenger identity, endpoint/counterpart association, message/proof validity, active cross-domain sender, settlement, reserves, custody security and arrival are unverified.
- **Possible extension and its boundary:** Add version-specific message/proof/portal/finality and destination consuming-call evidence. Future relay/consensus/arrival cannot be guaranteed.

### 14. Airdrop / reward claim

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** One common Merkle-claim shape.
- **Fields/evidence supplied when obtained:** index, account/recipient, amount and proof item count; Target code and partial controls; Optional fork asset/call observations and enabled address/website intelligence.
- **Still unknown:** The Merkle root, project identity and entitlement are unverified. Full proof bytes and website content are not supplied to AI for complete verification.
- **Possible extension and its boundary:** Verify roots/proofs/entitlements and official deployments for known projects, including attached permissions. Future root changes or project fraud remain possible.

### 15. Native wrapping / generic withdrawal candidate

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** deposit() and withdraw(uint256) parameter candidates; redemption identity and units unknown.
- **Fields/evidence supplied when obtained:** For deposit(): receiving contract and native value; for withdraw(uint256): amount with amountKind=unverified_protocol_units and redeemabilityVerified=false; Code, partial controls, readable selected asset state and optional fork deltas.
- **Still unknown:** A same-name deposit or withdrawal need not be a trusted wrapper. withdraw(uint256) is not assumed to be staking or guaranteed native redemption; exchange rate, units, solvency and exit restrictions remain unverified.
- **Possible extension and its boundary:** Add verified wrapper or protocol deployment identity, explicit units/rates and both-direction redemption/exit checks. Arbitrary same-name contracts remain untrusted.

### 16. Mint / burn

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Selected common methods; amount versus NFT ID may remain ambiguous.
- **Fields/evidence supplied when obtained:** mint/burn action, recipient and amountOrId; Contract/token state, native value and optional fork deltas.
- **Still unknown:** Issuance entitlement, supply policy, actual price and every burn consequence are unverified.
- **Possible extension and its boundary:** Add specific token/NFT mint standards, supply, pricing and permission checks. Issuer promises and future value cannot be proved by one call.

### 17. Ownership / role / upgrade / smart-account controls

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Selected admin/Safe-shaped parameters, current state and bounded original-fork authority changes.
- **Fields/evidence supplied when obtained:** Owner/role/upgrade/controller and selected Safe owner/threshold/module/guard/fallback/hash fields; Pinned getOwners (up to64 retained), threshold, selected module/code and actual fork before/after selected authority state; no maintained deployment binding; EIP-7702 authorization tuple recovery, chain/nonce bounds, conditional sequential eligibility and delegate code are separate observations when supplied.
- **Still unknown:** Full authority graphs, guard/fallback storage, code/policy audits, linked lists, owner contract rules, full set-code execution and future permission behavior remain incomplete. Login-only ERC-1271 does not validate asset signatures.
- **Possible extension and its boundary:** Add reviewed storage/version/account/module/session adapters and full consuming-call scenarios. Conditional tuple or interface success is not verified future control.

### 18. Contract deployment

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Deployment request and generic fork execution; no full source audit.
- **Fields/evidence supplied when obtained:** Sender, value, initialization selector/byte count and supplied fee fields; Recognized fork balance changes and bounded calls.
- **Still unknown:** Full initialization code is not sent to AI. New-contract permissions, source/build correspondence, constructor semantics and CREATE2 identity are incomplete.
- **Possible extension and its boundary:** Add bytecode/constructor decoding, verified builds, address prediction and initialization checks. Complete arbitrary contract semantics remain unproved.

### 19. Batch / Safe execution / aggregator candidates

- **Entry:** Automatic when the wallet supplies a transaction.
- **Current scope:** Bounded canonical structural summaries of selected wrappers, distinct from execution proof.
- **Fields/evidence supplied when obtained:** multicall(bytes[]), multicall(uint256,bytes[]), Safe-style execTransaction and packed MultiSend encodings; nested candidate targets/selectors/amounts and recognized bounded parameters; Up to depth 3, 32 child entries, 16384 bytes per body and 32768 recursively inspected bytes; explicit truncation/malformed/unsupported gaps; CALL versus DELEGATECALL, candidate encoded value and context, wrapper refunds and signature byte count only; raw child calldata/signatures omitted from structural evidence.
- **Still unknown:** Structural decoding does not authenticate code or actual CALL/delegatecall behavior, child sender/owner/storage context, signature validity or full effects. Unknown wrappers, opaque router commands and hidden/nonstandard assets remain incomplete.
- **Possible extension and its boundary:** Add authenticated wrappers/protocol adapters, state-aware child execution and broader asset tracking. Dynamic code and resource limits prevent universal completeness.

### 20. Wallet login / SIWE-like message

- **Entry:** Automatic when the wallet supplies a message signature request.
- **Current scope:** Bounded supported EIP-4361 envelope and source/account/time checks.
- **Fields/evidence supplied when obtained:** Signing method and up to 1,600 message-preview characters; declared domain/scheme, owner, chainId and normalized URI origin; Required version/field ordering, nonce format/length, issuedAt, expiration, notBefore and up to 16 resource origins; Source/domain/URI/account differences, local-clock time conditions and explicit unverified relying-party nonce/session state.
- **Still unknown:** Correct envelope syntax does not verify a remote nonce store, audience, actual signature or login acceptance. Resource inspection is bounded and the hook has no request-bound network.
- **Possible extension and its boundary:** Add relying-party cooperation for nonce issuance/one-time use, session/audience binding and acceptance. Correct syntax still does not establish website honesty.

### 21. Personal message signature

- **Entry:** Automatic when the wallet supplies a message signature request.
- **Current scope:** Text preview and explicit uncertainty.
- **Fields/evidence supplied when obtained:** Requested signer, method, source origin and up to 1,600 preview characters; Available website/address intelligence and observable source/account differences.
- **Still unknown:** A website or contract can assign extra meaning to text. Previews can truncate; an independent provider snapshot does not establish the signing dApp network.
- **Possible extension and its boundary:** Add verification for specific message protocols and consuming contracts. Arbitrary server-side interpretation cannot be established from text alone.

### 22. Raw eth_sign

- **Entry:** Currently requires explicit submission.
- **Current scope:** Backend blind-signing analysis; wallet/SDK delivery is not guaranteed.
- **Fields/evidence supplied when obtained:** Method, signer, claimed network/source and blind-signing signal; Available origin/network metadata and intelligence; no full raw digest is sent to AI.
- **Still unknown:** A hash cannot uniquely reveal its original message. The Snap may not receive eth_sign, and authority/replay scope can remain unknown.
- **Possible extension and its boundary:** If the caller supplies the original message, protocol and hash correspondence, verify those separately. Automatic delivery needs wallet support; a one-way hash cannot reveal a unique original.

### 23. Permit / NFT Permit / DAI / transfer-authorization signatures

- **Entry:** Automatic when the wallet supplies a message signature request.
- **Current scope:** Canonical EIP-2612, ERC-4494, DAI-style Permit and selected ERC-3009 state checks.
- **Fields/evidence supplied when obtained:** Committed declared type/domain, owner or holder/from, spender or recipient, value/tokenId/allowed, nonce and deadline/expiry or validAfter/validBefore; exact normalized unsigned representations preserve digest; DAI allowed=true derives uint256 maximum, false derives zero: mapped authority is not a separately signed amount; expiry=0 follows reference no-submission-deadline semantics; ERC-3009 TransferWithAuthorization/ReceiveWithAuthorization is a single committed transfer, not standing allowance; reads authorizationState(authorizer,bytes32), exact open time window and conditional receive-caller restriction; Typed digest/domainHash and observed DOMAIN_SEPARATOR; selected owner/token-ID nonce, NFT interface/owner/approval/operator and signer/verifier code plus bounded current balance exposure.
- **Still unknown:** Reference-shaped semantics do not authenticate implementations. Generated signature validity, ERC-1271 acceptance, future consumption, custom variants and full request-bound network remain unverified. Used ERC-3009 state does not distinguish used from canceled.
- **Possible extension and its boundary:** Add verified deployments/versions and consuming-transaction adapters. Future nonce/code changes, third-party calls and actual acceptance still need separate evidence.

### 24. Permit2 signature

- **Entry:** Automatic when the wallet supplies a message signature request.
- **Current scope:** Canonical common and witness outer envelopes plus selected current nonce/allowance checks.
- **Fields/evidence supplied when obtained:** Committed token/cap/spender/nonce/deadline, canonical type encoding/digest/domain; allowance expiry and up to16 current entries or nonce bitmap; Signer-derived owner, underlying ERC20 and internal Permit2 allowance layers and signer/verifier code; no maintained deployment binding; Canonical witness type/hash/field names without raw witness strings; consumer enforcement explicitly unknown.
- **Still unknown:** Custom witness business meaning/enforcement, arbitrary variants, asset-signature acceptance and future consumption remain unverified. expiration=0 has submission-block semantics; a nonce/code/reference match is not safety.
- **Possible extension and its boundary:** Add independently reviewed consuming-contract witness semantics, versions and transaction scenarios. The unsigned request cannot prove future signature use.

### 25. Order / listing / other EIP-712 message

- **Entry:** Automatic when the wallet supplies a message signature request.
- **Current scope:** Canonical Seaport OrderComponents signed commitments; current order state is not authenticated or read.
- **Fields/evidence supplied when obtained:** Complete bounded canonical offer/consideration items: item type/token/ID-or-criteria/raw start/end amount/recipient, time, counter, conduit, order hash and digest; Signed counter/time/conduit/hash and zero-recipient warning; no current counter/fill/cancellation or direct-verifier approval checks; Generic supported type-graph financial fields and optional DOMAIN_SEPARATOR comparison; explicit unsupported/custom markers.
- **Still unknown:** Contract-order type4, criteria proofs, nonzero conduit/controller/channel routing, all order formats, signature acceptance, execution/fees/rounding and economic fairness remain incomplete. No order is fulfilled or signed.
- **Possible extension and its boundary:** Add reviewed conduit/criteria/consumer adapters and fulfillment scenarios. A familiar type name or well-formed commitment does not guarantee future acceptance.

### 26. Wallet connection / permission / session key

- **Entry:** Currently requires explicit submission.
- **Current scope:** Explicit API or dApp provider integration; bounded public scope summary.
- **Fields/evidence supplied when obtained:** Method, origin and recognized public account/validator/scope/limit/expiry fields; Explicit provider wrapper submits selected requests before forwarding; secret/signature fields omitted with redaction/truncation gaps; Available source/address intelligence; no secret session key is requested or permission granted by analysis.
- **Still unknown:** Actual granted authority, validator/session enforcement and hidden wallet policy remain unverified. The SDK is opt-in for a cooperating dApp, not a global wallet hook.
- **Possible extension and its boundary:** Add versioned wallet/account/validator adapters and explicit permission delivery. Prompt changes cannot observe requests never supplied.

### 27. UserOperation / smart account

- **Entry:** Currently requires explicit submission.
- **Current scope:** Explicit v0.6/split v0.7-v0.8 parameter/code/fee extraction; no authenticated EntryPoint state or full bundler simulation.
- **Fields/evidence supplied when obtained:** sender/EntryPoint/factory/paymaster and declared nonce, call selector/byte counts and declared gas/fee limits; no raw signature or payload bytes; Declared nonce/prefund inputs remain request claims; no EntryPoint keyed nonce/deposit verification; sender/EntryPoint/factory/paymaster code and current base-fee relations independently retained; Exact network/block/hash/time, explicit incomplete semantics and no factory-derived sender or signature-policy proof.
- **Still unknown:** Bundler/account/aggregator/module/session validation, sponsorship authorization, token fees, creation derivation, full batch execution and future inclusion remain unknown.
- **Possible extension and its boundary:** Add supported account/bundler/paymaster simulations and policy adapters with explicit wallet/dApp delivery. Code and declared nonce/fees do not establish full validity or execution.

### 28. Add / switch network / display asset

- **Entry:** Currently requires explicit submission.
- **Current scope:** Parameter summary; no connection to client-supplied RPC endpoints.
- **Fields/evidence supplied when obtained:** method, chainId, chainName and other whitelisted scalar fields; rpcUrls/blockExplorerUrls reduced to origins without credentials, paths or queries.
- **Still unknown:** New RPC/explorer/network authenticity is unverified. Custom nested watchAsset metadata is not fully decoded.
- **Possible extension and its boundary:** Compare against trusted server-maintained network/RPC/token registries. Arbitrary client URLs must not become backend fetch targets.

### 29. Read-only wallet RPC

- **Entry:** Currently requires explicit submission.
- **Current scope:** Bounded request summary; no general automatic hook.
- **Fields/evidence supplied when obtained:** method and bounded recognized account/address/network fields; Available source/intelligence; original RPC is not executed and no account list is returned.
- **Still unknown:** Read-only can disclose private information. Query permissions and all returned-data exposure are not fully interpreted.
- **Possible extension and its boundary:** Add method-specific privacy policies and wallet session checks. The application cannot undo disclosures made to another website.

### 30. Unknown contract / wallet RPC

- **Entry:** Depends on the actual request entry point.
- **Current scope:** Unknown fallback; complete understanding is not claimed.
- **Fields/evidence supplied when obtained:** Transaction target, value, selector/byte count, or RPC method; Bounded whitelisted parameters plus applicable RPC/fork/intelligence observations and missing checks.
- **Still unknown:** Without protocol semantics, complete asset/authority effects cannot be determined. Unsupported chains and requests never supplied by the wallet do not appear automatically.
- **Possible extension and its boundary:** Add adapters when specifications, trusted ABI/source, chain support and request entry exist. AI cannot invent missing input or protocol facts.

## 5. Muse output, validation, repair and cost

Only Muse supplies a new numeric score. Current provider output requires response_schema_version=walletshield-selection-v1, selected_fact_ids and per-reason/dimension fact_ids. The backend resolves exact request-bound facts and stores fact_schema_version=walletshield-facts-v1; historical reports remain readable. Output contains score (integer 0–100 or null), assessment, six dimensions, evidence_confidence, summary, cited reasons, missing_data, suggested_action and honeypot. The backend records model/time and valid complete usage. Dimensions are authority, exposure, execution, identity, protocol and deception; each occurs once and cites existing evidence. They are not numerical sub-scores and are not averaged.

The number is an uncalibrated indicator of this request's evidenced risk. It is not a loss probability, identity-trust score or evidence-confidence percentage. There are no fixed numeric bands, floors, additive points, weights or rule/model-provider fallbacks. Rules can retain a qualitative high-risk signal independently of the number. Historical rule scores remain labeled historical.

Validation checks nonce/domain assertions across summary, reasons, all dimensions, suggested_action and missing_data, including indexed nonce claims, match/mismatch direction and negated/conditional advice. A claimed check must cite the corresponding observed RPC result; an unrelated citation cannot establish verification. It also rejects nonexistent/ambiguous citations, duplicate/missing dimensions, unsupported certainty/honeypot claims and inconsistent null/unknown output. Natural-language checks remain partial safeguards, not a proof of every sentence. The assessment scope records unresolved checks and missing evidence from this request. Any unresolved check/gap, model-identified missing data, stale/missing/future observation timestamp, public-block provenance/freshness failure, or conflicting same-height block hash prohibits overall low or strong evidence confidence. The full completeness flag and missing-check lists remain visible. The packet key is assessment_scope; reports store assessmentScope with policy observable-request-v1. A permitted low/strong applies only to the observable-request scope and never establishes recipient identity or future safety. Every low/review/high dimension needs a cited non-unknown observation beyond a tool plan. A meaningful conditional score can still be supported by known authority/exposure while identity or future execution remain unknown; all-unknown/not-applicable dimensions or citations only to unknown/tool-plan observations cannot support a number. Missing reputation alone is not malicious identity.

Invalid output is never locally patched into a score. One optional repair reuses the same evidence, controlled feedback and at most 20,000 characters of rejected output labeled untrusted. HTTP 500/502/503/504 can instead use that same single recovery slot. A separate successful quota reservation and at least five seconds remaining are required; total time is 50 seconds, the second attempt at most 25 seconds. Authentication/quota/429, arbitrary network failures, timeouts, refusals, incomplete envelopes and valid null results do not automatically retry. A second invalid result stays failed. Usage is summed only when every attempt has valid complete counters; unknown usage from an HTTP failure suppresses the aggregate rather than presenting a partial total. Machine-readable failureKind/attempts/repaired distinguish outcomes.

A scan can therefore consume up to two paid API attempts. Failures count. The default whole-backend AI_DAILY_LIMIT is 100 per UTC day. Hosted WALLETSHIELD_WALLET_DAILY_LIMIT defaults to 20 per verified address, shared across web/Snap credentials. Hosted global/wallet budgets are reserved atomically; cap denial charges neither. Restart does not reset SQLite counts. The local synthetic AI connection test shares the local budget and is disabled in hosted mode. Vendor dollar limits and RPC/intelligence quotas are separate.

No key, disabled AI, quota denial, model failure or honest abstention leaves no numeric score. Evidence and gaps remain. JSON/citation validation constrains format and selected claims; it does not prove every sentence or model judgment correct. No accuracy/calibration benchmark is implied by local acceptance tests. See [CURRENT-COVERAGE.md](CURRENT-COVERAGE.md) for the implemented/partial/manual/uncovered matrix and this repair's dependency status.

## 6. Which gaps can be improved?

Thirty profiles are not thirty complete protocol integrations. Separate these dependencies before promising broader coverage:

| Dependency category | Feasible extension | Remaining boundary |
| --- | --- | --- |
| Configured RPC and tested specific adapters | More allowance/position/wrapper reads, known recursive batches, post-operation lending scenarios, swap routes and two-chain bridge state | Cannot authenticate a protocol, prove arbitrary semantics or guarantee future arrival/solvency. |
| Additional trusted quote/price/market data | Expected output, liquidity, asset/LP/share valuation and stress assumptions | Data must match asset/network/time; future prices and ordering remain uncertain. |
| Verified source/deployment or reputation data | Build/code identity, genuine collections/protocols, administrator graphs and broader phishing/address history | A name, non-hit or empty proxy slot is not proof of safety. |
| Wallet/dApp/relying-party cooperation | Expose permission/UserOperation entries, original hash input and login nonce/session state | A prompt cannot observe missing requests or stores. |
| Off-chain services or investigation | Business identity, exchange internals, fraud conversations and device/key compromise | Needs separate integrations/consent/privacy controls; chain data does not establish all off-chain facts. |
| Not provable before signing from one snapshot | Explore future price/liquidity, ordering, blacklists/upgrades, relays and hidden effects as scenarios | Scenarios cannot guarantee future events or universal absence of malicious behavior. |

| Gap | Practical improvement | Why a boundary remains |
| --- | --- | --- |
| Missing known-protocol adapter | Add trusted ABI/source/deployment, reads and protocol tests | Similar function names and deceptive contracts do not establish identity. |
| Missing live data | Configure supported RPC/history and intelligence; additional price/identity services require new integrations | Providers can charge, throttle, fail, lie or lack coverage; model parameters are not a live database. |
| Request not supplied by wallet | Add an explicit wallet/dApp SDK or permission/UserOperation integration | Editing a prompt cannot observe data that never reaches the Snap. |
| Cross-chain arrival / future execution | Read both chains, bridge proofs/state and simulate scenarios | Future consensus, relays, ordering, outages and state changes have not happened yet. |
| Future blacklist / upgrade / liquidity exit | Inspect present controls and stress scenarios | Future decisions and prices cannot be predicted from a single block. |
| Off-chain fraud / business identity | Add verified public identities, websites and user evidence | Normal tokens and technically valid transfers can support fraudulent promises. |
| Raw hash original | Verify an original message/protocol supplied independently | A one-way digest cannot uniquely reveal its original authorization. |
| Arbitrary contract semantics | Expand known decoding, execution and formal checks | Custom state, dynamic calls, dependencies and resource limits prevent universal completeness. |
| Score calibration | Use labeled benign/malicious data, independent test sets and false-positive/negative measurement | An AI number or synthetic test pass is not a measured loss probability. |
| Device/key/exchange compromise | Integrate appropriate external products | One pre-sign request cannot diagnose malware, past key disclosure or a private exchange ledger. |
| Non-EVM chains / other wallets | Implement their transaction/signature/permission formats and tools | EVM rules cannot be relabeled as Bitcoin/Solana support. |
| Forced blocking / continuous post-sign monitoring | Outside the present advisory product scope | The user remains responsible for the wallet decision; old compatibility code is not an enabled monitoring product. |

## 7. Operation, authentication and release

See README.md for install/config/start/stop/test/release commands and docs/USER-MANUAL.md for an English walkthrough. The default development Snap uses local file service 8080 and direct API 8787; browser API requests use the webpage's proxy. Hosted builds use one compiled HTTPS origin/npm ID and loopback backend behind the configured HTTPS proxy. Packaging is not publication, registration or production certification.

Pairing verifies backend acceptance before Snap state is saved. A later authenticated health check distinguishes installation from usable pairing. Hosted login verifies the exact stored five-minute one-use challenge using EOA recovery or bounded deployed-contract ERC-1271 STATICCALL over trusted RPC; unsupported or undeployed accounts fail. It uses an eight-hour memory-only web bearer and a distinct address-bound 30-day Snap bearer. Owners can revoke all web and Snap credentials for their address. Snap issuance has persistent atomic caps of 4/address/minute, 12/server-observed-IP/minute and 60/global/minute. At most four active Snap credentials per address and 8192 globally are retained; a successful reload rotates only that owner's earliest-expiring credentials. Denial returns 429/Retry-After without revoking existing credentials or spending issuance buckets. Expiry/rate cleanup is indexed. History clears on identity/provider/account changes, denied reloads and disconnection, discards stale asynchronous responses, and drops a selection no longer present in the current owner list. Report/evidence access and quotas are scoped to the verified address. Capture channel records credential provenance, not cryptographic attestation of Snap execution. Hosted mode does not register local lab/funding/legacy/demo/monitor routes; arbitrary Origin headers never replace authentication.

A neutral personal_sign message with a unique nonce can exercise the real wallet/Snap entry without gas or asset authority. The page matches its exact request to a paired-snap report. The generated test signature stays in the browser; its unsigned message/report reach the backend. This differs from hosted login, whose explicitly requested authentication signature is sent to verification and not stored. Actual asset transactions remain user-initiated through the wallet/dApp.

## Hosted privacy, upstream budgets and evidence hardening

**Sign out all sessions and revoke pairing** atomically revokes every active web and Snap credential and pending login challenge for the current verified address. Other wallets are unchanged. Reverify and pair again to resume. **Delete my stored reports** requires an explicit confirmation, deletes only reports owned by this address and revokes all its credentials. Usage budgets remain, so deleting records cannot reset paid-attempt limits. Every hosted report insert/update checks the still-active credential and owner under the same SQLite transaction; a revoked in-flight request cannot restore its report. Requests already sent to Meta/RPC/intelligence cannot be recalled or refunded by deleting a report.

Deletion means logical SQLite row removal, not guaranteed forensic erasure from WAL pages, disks, backups or third-party logs. The application does not encrypt its database. Optional report retention is disabled by default. Set the following nonsecret operator settings in backend `.local/service.env` or the process environment:

```dotenv
WALLETSHIELD_SCAN_WALLET_DAILY_LIMIT=100
WALLETSHIELD_SCAN_IP_DAILY_LIMIT=300
WALLETSHIELD_SCAN_GLOBAL_DAILY_LIMIT=1000
WALLETSHIELD_REPORT_RETENTION_DAYS=0
```

Evidence/RPC/fork scan budgets are independent of model attempts: hosted scans reserve all six scopes atomically **before collection** (8/wallet/minute, 16/server-observed-IP/minute, 60/global/minute, plus the configurable UTC-day limits above). An exhausted scope rejects the scan without charging the others or starting collectors. These persistent counters survive restarts; rejected/unfinished checks do not fabricate scores. The separate model-attempt budgets still apply. These are bounded initial service policies, not a throughput or public-scale availability guarantee; network-connection probes have their separate limits. Allowed daily settings are 1–10,000 per wallet, 1–100,000 per IP and 1–1,000,000 globally.

Retention `0` preserves existing data. An explicit value from 1 to 3650 days prunes at most 100 expired owner-mapped reports at startup and each minute; a backlog can require multiple batches. Age uses the report creation time. Unowned local history, usage budgets, other application state and third-party copies are not removed by this policy.

Public-chain block provenance is separate from collection time. The `quality.blockFreshness` inventory flags RPC/isolated-fork block timestamps older than 300 seconds, over 30 seconds ahead, missing block time/hash or unverified chain identity. Such gaps prohibit overall `low` and `strong` evidence confidence; they are not score weights. Synthetic demonstrations and local chain 31337 are excluded from public-block age gating because local clocks can be artificial. Observation-time diagnostics remain separate, and reorganization/provider consistency is not proved by a recent block.

Muse now receives `evidence_admissibility` (which real observations can support each dimension) and `claim_support` (bounded basic-call/fork-execution/fork-sale support). A real but irrelevant citation cannot justify a dimension. Token metadata/open-source status and no-hit (zero) sellability flags do not by themselves support identity, deception or authority; actual control flags can support authority, sale/tax observations can support exposure/protocol, and adverse identity claims need request/chain-bound recognized risk observations. Bounded validation checks all displayed text for unsupported official identity, guaranteed safety/future execution/sellability or factual USD-loss claims, while preserving explicit uncertainty and conditional advice. A basic call is not transaction inclusion; a fork result is not live execution or a future guarantee. These guards remain partial language checks, not formal proof or an independent accuracy/calibration benchmark. New checks used offline adversarial fixtures; they do not establish current live Muse accuracy. Successful model response bodies are streamed with a 150,000-byte cap; error bodies have a 16,000-byte cap, oversized reads are canceled and invalid UTF-8 is rejected. Raw provider error text is not exposed as user advice. These resource bounds do not verify model truth.

GoPlus remains opt-in. It derives at most eight token and eight counterparty candidates from recognized outer/path/Permit2/batch fields; bridge remote-token fields and delegated-call targets are not blindly relabeled as local tokens. At most 18 network queries run with four-way concurrency, 1.8 seconds per request and 7.5 seconds total. Responses cache for 30 seconds (256 entries); supported-chain discovery caches for one hour. Each result exposes `fetchedAt`, `cacheHit`, `cacheAgeMs`, `cacheTtlMs`, `providerAsOf:null` and `freshnessVerified:false`: a recent fetch is not a known upstream data date. Missing flags, closed-source/proxy omissions, unqueried/truncated candidates and non-hits remain limits. See [GoPlus response details](https://docs.gopluslabs.io/reference/response-details).

Canonical token-funded V3 single/path exact-input/exact-output variants retain bounded dependent fork buy/sell adapters. The original buy keeps its supplied execution fields; the derived sale uses observed input debit and acquired output. Native-funded V3 round trips and router-specific sender-sentinel recipient aliases are unsupported after removal of deployment bindings; generic original-transaction simulation remains available where supported. Candidate pool/factory association, tick/range and active liquidity are observations, not authenticated pool identity, a quote or a future exit guarantee. Opaque aggregators, unsupported funding/recipients and future ordering remain gaps. The wallet catalog remains 66 representative cases; historical pre-removal acceptance results do not certify the current reduced scope.

Automatic coverage still requires actual wallet delivery. MetaMask currently displays message insights only at Critical severity and after advancing to Sign; transaction insights have a separate entry point. See the [primary entry-point documentation](https://docs.metamask.io/snaps/reference/entry-points/). Permissions, sessions, UserOperations and other wallet RPCs require explicit API submission or a cooperating dApp integration, not a general wallet interceptor. Hosted login supports EOA recovery and bounded deployed-contract ERC-1271 validation of the exact stored login message only; undeployed/ERC-6492 accounts and unsupported policies remain unavailable. Public domain/TLS, intended Snap publication/distribution, browser acceptance, secure backup/restore and load/failure testing are still required before a public launch.

## 8. Privacy and evidence flow

Wallet/webpage → configured backend → configured RPC and enabled intelligence → bounded evidence packet → Meta Responses API → backend report → webpage/Snap.

The configured backend sends necessary evidence to Meta Muse Wonder when enabled. It does not request seed phrases, private keys or generated asset signatures. Message previews and decoded request fields can still contain private information; hosted login uses a separate explicit signature.

- Meta/RPC keys remain backend-only, never in browser/Snap configuration or AI evidence. Runtime deployment settings are public, nonsecret values.
- The backend stores the full unsigned request, evidence and outputs in SQLite; hosted mode stores these on the operator's server. Credentials are hashed there. The database is not encrypted. Hosted owner-confirmed logical report deletion and optional age-based bounded retention are available; retention defaults to disabled.
- Model input omits full calldata/history but can contain private message previews and decoded request fields. A repair resends the same evidence and bounded prior output. Filtering is not a universal secret detector.
- RPC can see addresses/call data needed for reads and forking. GoPlus can receive normalized public origins, up to eight token candidates and eight explicit counterparties when enabled. No automatic full-site crawl or complete wallet-history ingestion is configured.
- Model requests use store:false. This option is not a universal guarantee about provider logs or retention; review the applicable provider/service policy.
- Snap display prioritizes up to 24 evidence items, six request-parameter lines and six missing-check summaries. Full stored evidence remains in the workbench. A display limit is not evidence that omitted checks passed.

## 9. Source and external references

Implementation: account-operations.ts/account-evidence.ts (bounded smart-account candidates), protocol-operations.ts/position-evidence.ts (selected withdrawal/bridge/position paths), batch-evidence.ts (structural child summaries), assessment-scope.ts (server-derived observable-request boundary), decode.ts/operations.ts (decoding), providers.ts/assets.ts (RPC/assets/intelligence), protocols.ts (controls/vault/lending), signatures.ts (typed structure/state), siwe.ts (bounded login envelope), quality.ts (evidence inventory), simulation.ts (fork/round trip), ai.ts (packet/model/validation), wallet-auth.ts (hosted authentication), coverage.ts (shared descriptions).

- [MetaMask entry points](https://docs.metamask.io/snaps/reference/entry-points/): transaction/signature hooks differ; onRpcRequest requires an explicit Snap invocation.
- [MetaMask permissions](https://docs.metamask.io/snaps/reference/permissions/): a provider snapshot and dynamic account permissions are distinct from hook input.
- [Meta Model API](https://dev.meta.ai/docs/overview) and [Responses API](https://dev.meta.ai/docs/protocols/responses): configured model transport; no universal retention claim follows from store:false.
- [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626), [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967), [ERC-4494](https://eips.ethereum.org/EIPS/eip-4494) and [Aave Pool](https://aave.com/docs/aave-v3/smart-contracts/pool): interface references, not proof of a candidate deployment's identity.

Regenerate with npm run docs:coverage after changing shared profiles, then rebuild/reload the webpage and Snap. This guide states capability boundaries; dated acceptance files are separate observations.
