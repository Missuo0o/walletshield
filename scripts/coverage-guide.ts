import {readFile,writeFile} from 'node:fs/promises';
import {COVERAGE_PROFILES,ENTRY_LABELS,ENTRY_BOUNDARY,ADVICE_ONLY,DATA_BOUNDARY} from '../src/security/coverage.js';
import {WALLET_CASES} from '../src/testing/cases.js';
const represented=new Set(WALLET_CASES.map(c=>c.profile)).size;
const intro=`# WalletShield: tools, evidence, AI assessment and coverage

This guide describes implemented version 0.4.1 paths and their limits. It is generated from the same coverage profiles used by the webpage and Snap. There are **${COVERAGE_PROFILES.length} analysis profiles**, with **${WALLET_CASES.length} local wallet cases** (${WALLET_CASES.filter(c=>c.kind==='transaction').length} transaction and ${WALLET_CASES.filter(c=>c.kind==='signature').length} message requests) representing **${represented} profiles**. Counts are not detection accuracy, a safety rating or evidence that every method was tested.

## 1. Request entry and component responsibilities

| Component | What it does | What it does not establish |
| --- | --- | --- |
| Webpage | Selects one EIP-1193 provider discovered through EIP-6963, connects an account, checks a configured network, starts explicitly selected wallet requests and shows reports | A webpage cannot automatically inspect unrelated dApp requests merely because an account connected. |
| MetaMask Snap | Receives supported unsigned transaction/message hooks, sends them to the compiled backend, and shows an insight before the user's final decision | It is not a global interceptor for permissions, sessions, UserOperations or arbitrary wallet RPCs. |
| Fastify/Zod backend | Validates input, decodes known shapes, selects collectors, preserves evidence/unknowns, calls Muse within quota, validates output and stores reports | Origin is not hosted authentication. A decoded method is not authenticated protocol identity. |
| Muse Wonder | Evaluates the supplied evidence and returns cited dimensions, an optional number, uncertainty and advice | No browsing, wallet access, RPC tools or function-calling tools are configured for the model. It cannot invent live chain data. |
| SQLite | Stores unsigned requests, evidence, outputs and counters; in hosted mode also hashed credentials, owner mappings and challenges | The database is not encrypted by this application and has no automatic retention/deletion policy. |

${ENTRY_BOUNDARY}

Automatic entry means eligible for the hook, not guaranteed success. Installation, pairing health, wallet delivery, backend availability, correct network configuration and successful evidence collection are separate requirements. A wallet can reject before delivering a hook. A message can authorize later spending without immediately broadcasting a transaction.

${ADVICE_ONLY}

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
| Selected protocol candidates: protocol-operations.ts / position-evidence.ts | Generic withdrawal, selected bridge stages and V3 position tuples; existing position/owner/approval/token-unit/balance reads | No verified manager/pool/bridge/wrapper identity, valuation, destination proof or guaranteed exit. |
| Structural batch inspection: batch-evidence.ts | Canonical multicall/Safe/MultiSend summaries, bounded child parameters, CALL/delegatecall and unknown/truncation markers | Depth 3, 32 entries, 16384 bytes/body, 32768 recursive bytes. Structure is not verified execution or child authority. |
| Evidence inventory: quality.ts | Status counts, source groups, observation-time flags, block provenance, mixed upstream blocks, conflicting same-height hashes and authenticated-credential attribution | No risk score, coverage percentage, calibration or cryptographic Snap attestation. |
| Independent Snap-provider snapshot | Read-only eth_chainId with source and observation time, stored separately in signature.providerContext | Not bound to the initiating dApp or request time. Domain matches do not prove request network; differences are contextual warnings. |
| Isolated Anvil fork: simulation.ts | Verifies upstream chain/base block hash; executes only on a temporary local fork; records execution block, native deltas/gas, discovered standard assets and bounded calls | Preserves supplied gas/fees/nonce; missing gas uses an explicit default. It does not forge user balances/permissions or broadcast upstream. Hidden/nonstandard assets and future state remain incomplete. |
| Selected V2 round trip | Buys, approves only acquired tokens, and reverses a supported path to observe sale/result/gas | Supports selected methods and the same recipient. Sell minimum is zero only in the fork experiment. Loss includes fees/price impact and is not a pure tax rate. |
| GoPlus, optional | Supported-chain discovery; normalized website origin, up to three explicit counterparty addresses and one primary token candidate; selected phishing/honeypot/tax/control flags | Off by default. Unsupported chains, absent fields, failures and non-hits are not safety. It does not check every path asset. |
| Rules / router | Tool plan, permission/value/expiry/account/domain signals, user-reported fraud context and explicit gaps | Qualitative observations only. No points, score floor, fixed weights or numeric fallback. A selected tool is not a successful observation. |
| Meta Responses API | Fixed muse-wonder-1.0 model assesses the whitelisted packet and cites actual evidence IDs | A score is an uncalibrated risk indicator, not a loss probability or authenticity certificate. |
| Hosted EOA authentication | Exact one-use domain/URI/nonce login challenge; recovered signer; hashed web/Snap credentials, owner-scoped reports and per-address quota | Separate from asset-risk analysis. Contract-wallet authentication is unsupported; login does not authorize assets. |

Confirmed-state collectors verify/pin their own reads. The additional pending nonce is explicitly one node’s unpinned view: it can omit private/remote transactions and supplies no original payload, cancellation intent or replacement-fee policy. Their blocks and observation times can differ; the complete report is not one atomic global snapshot. Independent RPC/header/balance/code reads retain successful results when another read fails. Fork execution mines child blocks after its recorded base. Tool selection/availability and successful data collection are recorded separately. The quality inventory flags observations older than five minutes relative to report creation, missing/invalid timestamps and timestamps over 30 seconds ahead. These are freshness diagnostics, not numeric risk thresholds; an observation timestamp does not establish the provider data age. Reads are pinned by block number, not atomically by block hash. Recorded hashes are provenance and do not rule out reorganizations or inconsistent provider replies. Conflicting hashes at one chain/height require a fresh independent check and prevent overall low/strong confidence.

## 3. Exact model input fields

The evidencePacket function in src/security/ai.ts supplies these containers. It does not send the entire original request as model input.

| Field | Extracted contents and qualifications |
| --- | --- |
| version, createdAt, reportSource, evidenceComplete | Report format/time, actual versus synthetic source and explicit evidence-gap state. Demo observations cannot be treated as current real-chain facts. |
| chainId | Transaction/request network; zero when a signature has no request-bound chain. A typed domain can guide reads as a declared network. |
| origin | HTTP/HTTPS origin only; removes URL credentials, path, query and fragment. |
| quality | Status counts; per-source observed/unknown counts; snapshots with chain, block/hash/time when available; five-minute observation-age and missing/future timestamp flags; mixed upstream-block chains and conflicting same-height block hashes; capture channel and wallet credential attribution. Counts and age flags are not safety/confidence percentages. |
| requestSummary | Transactions: from, target, valueWei, selector, calldataBytes. Signatures: from and method. Other RPC: method. Full calldata/digest is not included here. |
| feeParameters | Supplied gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas and nonce as exact decimal integer strings; missing fields are not invented. |
| unsupportedTransactionFields | Explicit unsupported execution-field markers; a reduced replacement transaction is not presented as equivalent execution. |
| intent, userReportedContext | User-entered purpose and structured guaranteedProfit/withdrawalFee/requestedBy claims. These are unverified and do not include automatically collected private conversations. |
| operation | Category, candidate label, decoded fields, targets, token/standard and permission/complexity markers. Fields must be interpreted with their asset standard and units. |
| checks | Evidence ID, status, title/detail, source, observedAt and structured data: block/balance/code, permissions, protocol returns, signature state, fork deltas/calls or intelligence where obtained. |
| missing_checks | Union of explicit missing data and unknown checks, including incomplete-report state. All original gaps remain visible; contextual classification does not make a check successful. |
| assessment_scope | Server-derived observable-request scope; exact contextual fraud_context gap separated from critical unknown/missing items. This is a scope policy, not a numerical score or a claim that full evidence is complete. |
| request_data_scope, snapshot_consistency, quantity_conventions | Bounded extraction/provenance, per-collector snapshot differences and exact quantity/unit interpretation. |
| analysis_dimensions, score_meaning | The six required cited dimensions and the independent 0–100-or-null risk-indicator policy. |

Ordinary messages have at most 1,600 preview characters. Generic RPC summaries typically inspect up to five nesting levels, 16 items per array, 40 recognized scalar fields and eight target addresses. Full request data can remain in backend storage even when only a summary reaches the model. Simulation considers bounded logs (up to 256), discovered assets (up to 32) and calls (up to 128); explicit asset and ID reads have their own smaller limits. Truncation is a coverage gap.

Raw amount strings are smallest units unless the same asset's decimals were read. valueWei/native balances/gasWei are wei; gas is an execution-unit count and fee rates are wei per gas; nonce is a counter. Shares differ from underlying assets. NFT IDs are not financial amounts. roundTripReturnPercent is already a percentage and includes more than tax. Aave-shaped healthFactor uses 1e18 for one; Base-field currency is not automatically verified. Without a price source, dollar loss cannot be inferred.

DAI allowed mapping is reference-derived authority, not another signed amount. ERC-3009 commits one exact transfer, whereas Permit2 transfer is a single-nonce cap; neither is a standing allowance. If the current ERC-3009 balance cannot cover the exact amount, balanceCoversDeclaredAmount=false is recorded and no smaller partial-transfer bound is invented. Conditional allowance/cap bounds are not measured future loss. Empty-data DELEGATECALL remains delegated execution rather than a native payment. See [the extension notes](EXTENDED-COVERAGE-2026-10-22.md) for test and identity boundaries.

## 4. All profiles: evidence attempted and remaining gaps

The following fields describe the attempted path. Only successful observations become facts. Missing configuration, unavailable interfaces, timeouts and unsupported semantics remain in the packet. **Candidate decoding, automatic entry and complete protocol verification are different claims.**

`;
const profiles=COVERAGE_PROFILES.map((p,i)=>`### ${i+1}. ${p.name}

- **Entry:** ${ENTRY_LABELS[p.entry]}.
- **Current scope:** ${p.scope}.
- **Fields/evidence supplied when obtained:** ${p.data.join('; ')}.
- **Still unknown:** ${p.uncertain}
- **Possible extension and its boundary:** ${p.extension}

`).join('');
const outro=`## 5. Muse output, validation, repair and cost

Only Muse supplies a new numeric score. Its output contains score (integer 0–100 or null), assessment, six dimensions, evidence_confidence, summary, cited reasons, missing_data, suggested_action and honeypot. The backend records model/time and valid usage. Dimensions are authority, exposure, execution, identity, protocol and deception; each occurs exactly once, has a qualitative assessment and cites existing evidence IDs. They are not numerical sub-scores and are not averaged.

The number is an uncalibrated indicator of this request's evidenced risk. It is not a loss probability, identity-trust score or evidence-confidence percentage. There are no fixed numeric bands, floors, additive points, weights or rule/model-provider fallbacks. Rules can retain a qualitative high-risk signal independently of the number. Historical rule scores remain labeled historical.

Validation checks nonce/domain assertions across summary, reasons, all dimensions, suggested_action and missing_data, including indexed nonce claims, match/mismatch direction and negated/conditional advice. A claimed check must cite the corresponding observed RPC result; an unrelated citation cannot establish verification. It also rejects nonexistent/ambiguous citations, duplicate/missing dimensions, unsupported certainty/honeypot claims and inconsistent null/unknown output. Natural-language checks remain partial safeguards, not a proof of every sentence. The server classifies only its own unknown fraud_context observation and exact related gap as contextual: absent off-chain intent is not an automatic permanent veto on the observable request. All other unresolved checks/gaps, newly identified model gaps, stale/missing/future observation timestamps and conflicting same-height block hashes remain critical and prohibit overall low/strong. Full report.complete and all missing checks stay unchanged. Exact repetition of the canonical contextual caveat stays contextual; newly identified or paraphrased gaps stay critical. A permitted low/strong applies only to the observable-request scope and never establishes recipient identity, off-chain honesty or future safety. Every low/review/high dimension needs a cited non-unknown observation beyond a tool plan. A meaningful conditional score can still be supported by known authority/exposure while identity or future execution remain unknown; all-unknown/not-applicable dimensions or citations only to unknown/tool-plan observations cannot support a number. Missing reputation alone is not malicious identity.

Invalid output is never locally patched into a score. One optional model repair can reuse the same evidence, controlled validation feedback and at most 20,000 characters of rejected output labeled untrusted. It needs a separate successful quota reservation and at least five seconds remaining; total model time is at most 50 seconds and the repair itself at most 25 seconds. HTTP/authentication/429/transport failures, refusals, incomplete envelopes and valid honest null results are not retried. A second invalid result stays failed. Valid usage is summed across calls only when every response supplies valid counters; otherwise usage is omitted rather than partially totaled.

A scan can therefore consume up to two paid API attempts. Failures count. The default whole-backend AI_DAILY_LIMIT is 100 per UTC day. Hosted WALLETSHIELD_WALLET_DAILY_LIMIT defaults to 20 per verified address, shared across web/Snap credentials. Hosted global/wallet budgets are reserved atomically; cap denial charges neither. Restart does not reset SQLite counts. The local synthetic AI connection test shares the local budget and is disabled in hosted mode. Vendor dollar limits and RPC/intelligence quotas are separate.

No key, disabled AI, quota denial, model failure or honest abstention leaves no numeric score. Evidence and gaps remain. JSON/citation validation constrains format and selected claims; it does not prove every sentence or model judgment correct. No accuracy/calibration benchmark is implied by local acceptance tests. See [CURRENT-COVERAGE.md](CURRENT-COVERAGE.md) for the implemented/partial/manual/uncovered matrix and this repair's dependency status.

## 6. Which gaps can be improved?

Thirty profiles are not thirty complete protocol integrations. Separate these dependencies before promising broader coverage:

| Dependency category | Feasible extension | Remaining boundary |
| --- | --- | --- |
| Configured RPC and tested specific adapters | More allowance/position/wrapper reads, known recursive batches, post-operation lending scenarios, swap routes and two-chain bridge state | Cannot authenticate a protocol, prove arbitrary semantics or guarantee future arrival/solvency. |
| Additional trusted quote/price/market data | Expected output, liquidity, asset/LP/share valuation and stress assumptions | Data must match asset/network/time; future prices and ordering remain uncertain. |
| Verified source/deployment or reputation data | Build/code identity, genuine collections/protocols, administrator graphs and broader phishing/address history | A name, non-hit or empty proxy slot is not proof of safety. |
| Wallet/dApp/relying-party cooperation and user context | Expose permission/UserOperation entries, original hash input, login nonce/session state, intended recipient and purpose | A prompt cannot observe missing requests/stores, and user claims remain unverified. |
| Off-chain services or investigation | Business identity, exchange internals, fraud conversations and device/key compromise | Needs separate integrations/consent/privacy controls; chain data does not establish all off-chain facts. |
| Not provable before signing from one snapshot | Explore future price/liquidity, ordering, blacklists/upgrades, relays and hidden effects as scenarios | Scenarios cannot guarantee future events or universal absence of malicious behavior. |

| Gap | Practical improvement | Why a boundary remains |
| --- | --- | --- |
| Missing known-protocol adapter | Add trusted ABI/source/deployment, reads and protocol tests | Similar function names and deceptive contracts do not establish identity. |
| Missing live data | Configure supported RPC/history, prices, project registries and intelligence | Providers can charge, throttle, fail, lie or lack coverage; model parameters are not a live database. |
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

Pairing verifies backend acceptance before Snap state is saved. A later authenticated health check distinguishes installation from usable pairing. Hosted login uses a five-minute one-use EOA challenge, an eight-hour memory-only web bearer and a distinct address-bound 30-day Snap bearer. Owners can revoke Snap credentials. Snap issuance has persistent atomic caps of 4/address/minute, 12/server-observed-IP/minute and 60/global/minute. At most four active Snap credentials per address and 8192 globally are retained; a successful reload rotates only that owner's earliest-expiring credentials. Denial returns 429/Retry-After without revoking existing credentials or spending issuance buckets. Expiry/rate cleanup is indexed. History clears on identity/provider/account changes, denied reloads and disconnection, discards stale asynchronous responses, and drops a selection no longer present in the current owner list. Report/evidence access and quotas are scoped to the verified address. Capture channel records credential provenance, not cryptographic attestation of Snap execution. Hosted mode does not register local lab/funding/legacy/demo/monitor routes; arbitrary Origin headers never replace authentication.

A neutral personal_sign message with a unique nonce can exercise the real wallet/Snap entry without gas or asset authority. The page matches its exact request to a paired-snap report. The generated test signature stays in the browser; its unsigned message/report reach the backend. This differs from hosted login, whose explicitly requested authentication signature is sent to verification and not stored. Actual asset transactions remain user-initiated through the wallet/dApp.

## 8. Privacy and evidence flow

Wallet/webpage → configured backend → configured RPC and enabled intelligence → bounded evidence packet → Meta Responses API → backend report → webpage/Snap.

${DATA_BOUNDARY}

- Meta/RPC keys remain backend-only, never in browser/Snap configuration or AI evidence. Runtime deployment settings are public, nonsecret values.
- The backend stores the full unsigned request, evidence and outputs in SQLite; hosted mode stores these on the operator's server. Credentials are hashed there. The database is not encrypted and has no automatic retention policy.
- Model input omits full calldata/history but can contain private message previews and user context. A repair resends the same evidence and bounded prior output. Filtering is not a universal secret detector.
- RPC can see addresses/call data needed for reads and forking. GoPlus can receive normalized public origins, selected addresses and a primary token when enabled. No automatic full-site crawl or complete wallet-history ingestion is configured.
- Model requests use store:false. This option is not a universal guarantee about provider logs or retention; review the applicable provider/service policy.
- Snap display prioritizes up to 24 evidence items, six request-parameter lines and six missing-check summaries. Full stored evidence remains in the workbench. A display limit is not evidence that omitted checks passed.

## 9. Source and external references

Implementation: account-operations.ts/account-evidence.ts (bounded smart-account candidates), protocol-operations.ts/position-evidence.ts (selected withdrawal/bridge/position paths), batch-evidence.ts (structural child summaries), assessment-scope.ts (server-derived observable-request boundary), decode.ts/operations.ts (decoding), providers.ts/assets.ts (RPC/assets/intelligence), protocols.ts (controls/vault/lending), signatures.ts (typed structure/state), siwe.ts (bounded login envelope), quality.ts (evidence inventory), simulation.ts (fork/round trip), ai.ts (packet/model/validation), wallet-auth.ts (hosted authentication), coverage.ts (shared descriptions).

- [MetaMask entry points](https://docs.metamask.io/snaps/reference/entry-points/): transaction/signature hooks differ; onRpcRequest requires an explicit Snap invocation.
- [MetaMask permissions](https://docs.metamask.io/snaps/reference/permissions/): a provider snapshot and dynamic account permissions are distinct from hook input.
- [Meta Model API](https://dev.meta.ai/docs/overview) and [Responses API](https://dev.meta.ai/docs/protocols/responses): configured model transport; no universal retention claim follows from store:false.
- [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626), [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967), [ERC-4494](https://eips.ethereum.org/EIPS/eip-4494) and [Aave Pool](https://aave.com/docs/aave-v3/smart-contracts/pool): interface references, not proof of a candidate deployment's identity.

Regenerate with npm run docs:coverage after changing shared profiles, then rebuild/reload the webpage and Snap. This guide states capability boundaries; dated acceptance files are separate observations.
`;
const content=intro+profiles+outro;
const target=new URL('../docs/AI-COVERAGE-GUIDE.md',import.meta.url);
if(process.argv.includes('--check')){
 if(await readFile(target,'utf8')!==content)throw Error('AI coverage guide is out of date. Run npm run docs:coverage.');
 console.log(`PASS coverage guide: ${COVERAGE_PROFILES.length} profiles synchronized.`);
}else{await writeFile(target,content);console.log(`Updated ${COVERAGE_PROFILES.length} coverage profiles.`);}
