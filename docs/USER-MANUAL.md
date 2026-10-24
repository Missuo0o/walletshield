# WalletShield user manual

[English](USER-MANUAL.md) · [简体中文](USER-MANUAL-zh.md)

See the [Order and trace follow-up](ORDER-TRACE-FOLLOWUP-2026-10-23.md) for current order evidence, numeric-evidence eligibility and isolated-fork tracing. Earlier dated test outcomes remain historical and are not reused as this change’s validation counts.

The earlier [reliability and trace follow-up](RELIABILITY-FOLLOWUP-2026-10-23.md) explains clear score outcomes, read-only exemptions, compact fact selection, transient recovery and dedicated trace configuration. The [earlier complete validation](FULL-VALIDATION-2026-10-23.md) preserves its model and wallet observations. Historical results are not rewritten.

After updating, use **Reload and pair Snap** so MetaMask runs the rebuilt code. A completed Muse analysis can return no number when its evidence does not support one. A rejected output keeps no accepted score; its message identifies supported validation failures. The combined warning can remain **Unable to assess** despite a numeric model indicator when important checks are unfinished. The number and overall completeness are separate observations. The transaction transport deadline includes response-body parsing, so stalled bodies return an error rather than waiting indefinitely.

This manual explains the current English interface and the implemented local and hosted workflows. WalletShield gives advice about an unsigned EVM request before you decide in your wallet. It cannot guarantee safety, force rejection, sign for you, recover assets or continuously monitor a signed request.

The [README](../README.md) is the configuration and developer reference. The [generated coverage guide](AI-COVERAGE-GUIDE.md) lists all 30 profiles, their exact extracted fields, tools, missing checks and possible extensions. The [current coverage matrix](CURRENT-COVERAGE.md) separates representative paths, partial evidence, explicit/manual entries and remaining gaps. The local lab has 67 representative cases: 51 transactions and 16 message requests, representing 25 profiles. These are examples, not a detection-accuracy benchmark.

Current checks use the wallet-supplied unsigned request, source origin/network metadata and successfully collected RPC, intelligence and simulation evidence. Muse assesses observable request signals, including supported source/message/request inconsistencies. Chain/provider/execution context means technical observations. Historical reports and acceptance artifacts retain their original recorded data.


## Current evidence and integration additions

Muse selects exact fact IDs using `walletshield-selection-v1`; the backend resolves and stores them in `walletshield-facts-v1` with per-reason/per-dimension references. Historical full-fact responses remain readable, and all semantic checks remain. The backend does not prove every provider response or free-form sentence. Scores remain Muse-only, with no fixed weights, floors or fallback.

Score labels separate **Evidence insufficient for a score**, **Model output rejected**, **Model connection failed**, **Analyzing**, **AI not run**, and **Not applicable · Read-only query**. The last applies only to narrowly validated query shapes and uses no model quota; it does not assess privacy or returned-data safety. Unknown extensions do not receive a blanket exemption. To measure future accuracy with independent review, follow [Independent evaluation](INDEPENDENT-EVALUATION.md); the supplied synthetic examples do not establish an accuracy percentage.

Backend deployment-registry/code matching, reference USD feeds and maintained two-chain bridge-route validation have been removed. Existing `.local/registry.json` files are not read. Basic transaction/approval/signature decoding, configured RPC state, selected V2 routes (including the existing native path), token-funded V3 and generic fork simulation, optional GoPlus and Muse assessment remain. `ENABLE_SOURCE_VERIFICATION=1` independently enables bounded Sourcify source-match observations; this is not an official-deployment registry or code audit.

Bounded evidence includes Seaport signed commitments, Permit2 witness outer commitments, UserOperation parameter/code/fee observations, EIP-7702 tuple cryptography/conditional state, actual fork before/after selected authority/vault/lending observations, token-funded V3 route experiments and candidate pool state. Canonical Seaport-shaped orders read candidate information(), counter and cancellation/fill getters at a pinned block. Counter/status returns remain unknown and do not verify actual nonce, fill or cancellation semantics. The domain-hash comparison may match or differ without authenticating the verifier; direct-verifier token approvals are not inferred. Registry-authenticated order semantics and EntryPoint keyed nonce/deposit checks are not available. An explicit dApp provider wrapper supplies cooperating-app requests; it is not a global wallet interceptor. Hosted ERC-1271 support validates this login only, not future asset signatures.

The Wallet and network panel offers bounded read-only RPC capability observations: a fixed pinned call, one historical balance and a fixed trace probe. A successful probe is not a complete archive/trace guarantee. Source verification remains an independent optional backend setting and is not displayed in the public wallet panel. The Public networks switch button calls `wallet_switchEthereumChain` directly through the selected wallet provider. It does not invoke the integration SDK, a security scan or Muse; the wallet handles confirmation.

`npm run evaluate:ai` runs a hash-pinned synthetic validator suite with zero model/RPC calls. It does not measure live Muse accuracy. Paid evaluation needs explicit `--live --confirm-paid`, selected cases and a call budget; it is never automatic.

See [evidence, configuration, exact tools/fields, SDK, evaluation and remaining boundaries](RELIABILITY-AND-INTEGRATION.md).

## 1. Choose the workflow

| Goal | Page / workflow | What success establishes |
| --- | --- | --- |
| Learn how a request appears in a real wallet | Local wallet lab, chain 31337, MetaMask Flask | The selected test request reached the wallet; a matched Snap report separately establishes observed Snap submission. |
| Switch the selected wallet network | Public networks → Switch wallet to this network | Sends a direct wallet request; no SDK/security scan, Muse call or risk score. The wallet handles confirmation. |
| Check a configured public-network connection | Public networks → Check RPC and account state | The backend reached an endpoint reporting the expected chain and observed a block and optional account state. This produces no risk score. |
| Verify actual message-insight delivery | Public networks → Test the wallet signing insight | A unique unsigned test message matched a backend report submitted with the paired Snap credential. This can call Muse. |
| Assess your own transfer, approval, Permit or swap | Start the request in its external dApp and inspect the wallet insight | Only this request and its successfully collected evidence are assessed. The wallet decides whether to provide the hook. |
| Read private hosted history or pair a hosted Snap | Verify current wallet identity, then install/pair | An EOA or supported deployed-contract login verifies the stored challenge for service access. It does not grant asset authority. |
| Examine a permission, session, UserOperation or other RPC without a hook | Explicit API or cooperating dApp SDK submission | A bounded summary is analyzed. The backend does not execute the requested wallet RPC. |

The same account address can be used on different networks, but balances and contracts belong to their particular chain. Local TEST-USD, LAB tokens and test NFTs have no real value and do not become public-network assets when you switch networks.

## 2. Install and run locally

Use Node.js 24.x, npm and a desktop browser containing MetaMask Flask. Use a dedicated development account. The embedded application browser may not have wallet extensions.

From the project directory:

```sh
node --version
npm ci
npm run demo
```

The demo builds the webpage and Snap, starts a fresh Anvil chain, deploys the local fixtures and starts these loopback services:

| Service | Address | Keep it running for |
| --- | --- | --- |
| Webpage | http://127.0.0.1:5173 | The workbench and browser API proxy |
| Backend | http://127.0.0.1:8787 | Analysis, evidence, pairing, authentication and SQLite history |
| Development Snap files | http://127.0.0.1:8080 | Installing/reloading the local Snap |
| Anvil, chain 31337 | http://127.0.0.1:8545 | Local balances, fixture transactions and lab tests |

Open http://127.0.0.1:5173 in the browser with Flask. The webpage proxies `/api` to port 8787. The Snap calls `http://127.0.0.1:8787/api` directly; its authenticated opaque-origin preflight must reach the backend. Port 5173 is not the current Snap API endpoint.

Keep the launcher terminal open. Press Ctrl+C there to stop the services it owns. A second demo refuses occupied ports; stop the earlier WalletShield session before restarting. Do not stop unrelated processes to free a port without checking their ownership.

Each new demo resets the in-memory local chain. Old local approvals, balances, positions and receipts disappear, while SQLite reports persist. Prepare assets again after a restart. An old report is a historical observation, not a description of the new chain.

For development, `npm run dev` starts only backend/web/Snap services. It does not create the chain and its API process does not watch changes. Use `npm run chain`, `npm run deploy:local`, `npm run build`, then `npm run dev` in the separate-terminal sequence shown in the README. Rebuild and reload/pair the Snap after changing it.

## 3. Configure data and optional AI

Local wallet requests work without a model key. Without enabled, configured and successful Muse analysis, reports show evidence and gaps with no numeric score.

Create `.local/` if necessary. Use [`.env.example`](../.env.example) as the reference and preserve any existing settings. An arbitrary root `.env` file is not automatically loaded.

| Configuration | Place it locally | Purpose |
| --- | --- | --- |
| `MODEL_API_KEY` | `.local/meta.env` | Meta Model API credential, used only by the backend |
| `ENABLE_META_AI=1` | `.local/meta.env` | Permit model calls; `0` disables them |
| `AI_DAILY_LIMIT=100` | `.local/meta.env` | Whole-backend attempt cap per UTC day; accepted range 1–1000 |
| `INFURA_API_KEY` | `.local/rpc.env` | Derive backend Ethereum mainnet and Sepolia RPC endpoints; different from the Meta key |
| `RPC_<CHAIN_ID>_URL` | `.local/rpc.env` | Explicit trusted endpoint for that chain; overrides a derived endpoint |
| `ENABLE_FORK_SIMULATION=1` | `.local/rpc.env` | Opt into temporary local-fork execution when RPC/history supports it |
| `ENABLE_EXTERNAL_LOOKUPS=1` and optional `GOPLUS_TOKEN` | `.local/rpc.env` | Opt into GoPlus reputation/token observations |

Do not put credentials in browser fields, Snap configuration, source code or request JSON. `.local/` and credential `.env` files are ignored by Git; example files contain placeholders. Explicit process environment values take precedence. Configuration is reread per request; restart if you changed the process environment. Chain 31337 stays fixed to the owned local node. Public RPC URLs require HTTPS, except loopback HTTP; embedded username/password credentials are rejected.

Muse is fixed to `muse-wonder-1.0` at `https://api.meta.ai/v1/responses`. OpenAI credentials are not used and there is no alternate-provider fallback. A configured flag establishes only the presence of settings, not live connectivity. A validated completed response establishes that particular call succeeded.

Each initial call reserves one attempt, including failed calls. A permitted output-validation repair reserves a second attempt. The default daily cap is 100 for the backend; hosted mode also defaults to 20 per verified identity, shared across its web and Snap sessions. Hosted reservations check both caps atomically: if either denies the attempt, neither is charged and no model call starts. These are attempt limits, not dollar budgets. RPC, Infura and GoPlus limits/billing are separate.

The local synthetic connection-test command in the README intentionally calls Meta and can incur charges. It is not needed to install, run offline tests or exercise evidence without scoring. The route is absent in hosted mode. Scheduled post-sign monitoring remains disabled regardless of `ENABLE_MONITOR`.

## 4. Connect and verify the Snap

1. Choose the intended extension in **Choose wallet**. EIP-6963 discovery distinguishes multiple providers when supported. Selecting an ordinary MetaMask provider does not make it capable of installing a local development Snap; use Flask for that workflow.
2. Open **Wallet setup**, then **Connect wallet**. Check the account shown by both the page and wallet. WalletShield does not request a recovery phrase or private key.
3. Select **Install and pair Snap**. Approve the explicitly requested permissions in the wallet. The local Snap ID is `local:http://127.0.0.1:8080`.
4. Wait for the installation, pairing-credential, backend-connection and health-verification stages. The Snap checks backend acceptance before storing its credential; the webpage then requests fresh authenticated health. An installed Snap alone is insufficient.
5. If rebuilding or recovering a stale installation, refresh the webpage and use **Reload and pair Snap**. Verify the selected provider/account again.

An error beginning **Snap installation incomplete** belongs to installation. **Snap installed; pairing credentials unavailable**, **Snap installed; backend connection incomplete**, and **Snap installed; pairing verification failed** identify later stages. A wallet cancellation remains a cancellation, not proof that the extension is incompatible. On a local build, confirm ports 8080 and 8787 remain available to the extension; an older bundle may still target Vite port 5173 and needs rebuilding/reloading.

Snap permissions allow transaction and message insights, network access, home display, state storage, companion-site RPC and a read-only provider observation. They do not establish a universal interception point for every wallet permission, session, smart-account request or network change.

## 5. Run a local wallet test

1. In **Wallet setup**, select **Switch to local chain and prepare assets**. Approve adding/switching to WalletShield Local, chain 31337 (`0x7a69`). Preparation verifies the owned Anvil node and fixture code before writing test state.
2. Open **Local wallet lab** and inspect the on-chain inventory. Preparation tops up test ETH, TEST-USD, LAB-USD, LAB-Q and LAB-BLOCK; it also prepares test ERC-721/1155 assets. It does not automatically approve routers or create vault, lending or staking positions.
3. Select an **Operation category** and case. Read **Prerequisites** and **Test limitations**. Perform each required approval/deposit separately in the wallet. For wrapping/unwrap cases, obtain the wrapped asset through the local wrapping operation.
4. Select **Request a test transaction** or **Request a test signature**. Inspect the wallet's account, chain, recipient, amount, permission and message. Read the WalletShield insight and unfinished checks. MetaMask controls when message insights appear and can show them after you advance to Sign.
5. Choose confirm or cancel in the wallet. Start with **Unlimited approval**, read the insight and cancel; then compare limited approval and revocation. A canceled request can still have a completed pre-sign report.
6. Inspect **Wallet test history**. **Wallet outcome** and **Snap delivery** are separate. **Not observed** means no matching Snap submission was recorded. A returned signature, an API-only report or a successful node test does not replace that observation.
7. Open **Check history** for the report and full evidence. Refresh the list when necessary. Existing reports may refer to earlier chain state or an earlier implementation.

After successful preparation, the page automatically calls `wallet_watchAsset` for all five known ERC-20 display entries (including zero-balance WLAB) and owned test NFTs. Confirm the wallet prompts. Declined or unsupported display requests do not undo funding; the verified inventory remains authoritative. NFT display support is experimental in MetaMask Extension. Test ETH needs no import. NFTs and positions may need their associated operations to obtain or replenish them. Preparation preserves balances already above its top-up target. Simplified local router prices, vault shares, lending behavior, bridge records and control fixtures are not official protocol deployments or realistic financial models. LAB-BLOCK deliberately restricts sales to exercise that evidence path.

Use **Clear local test assets** to clear only the selected account's known fixture wallet balances on chain 31337. Review the English confirmation. The backend verifies Anvil and contract code, burns or discards fungible test balances, unwraps WLAB, moves test NFTs to a fixed discard address, and sets that account's local test ETH to zero. Transferring NFTs clears their per-token approvals. ERC-20/operator approvals, protocol positions, control state and history remain; unknown token contracts and wallet display entries are untouched. This does not reset the whole chain and is unavailable in hosted mode. If a later step fails, earlier changes may remain: refresh inventory and retry. Prepare again to replenish assets.

Generated lab signatures are format-checked and discarded in the browser. They are not uploaded, persisted or submitted for asset use. The unsigned message still reaches the backend and a bounded preview can reach Muse.

### Optional account and signature-variant tests

Eight **Smart-account fixture** transaction cases exercise threshold reduction, module flag enable/disable, guard set/remove, fallback set/remove and a CALL wrapper. On an existing local deployment, explicitly run `npm run deploy:lab` to add optional `LabAccount`, then **Prepare local test assets**. Deployment preserves earlier fixture addresses/state; preparation resets the optional account for the selected tester. Follow set-before-remove prerequisites.

This is an owner-direct local interface model: any listed owner may call regardless of the displayed threshold. It is **not a production multisig**. Module/guard/fallback fields are flags without actual enforcement. The wrapper accepts CALL only, empty signatures and zero refund parameters; DELEGATECALL is deliberately rejected. No real smart-wallet control is modified by these lab operations.

The four signature cases are `dai-allow`, `dai-revoke`, `erc3009-transfer` and `erc3009-receive`. They use the existing LAB-USD domain for actual wallet message requests and format/extraction testing. LabToken implements no DAI/ERC-3009 consumption method and no ERC-3009 authorizationState getter; missing state/consumption evidence is intentional. Signing does not consume these messages, change allowance or move tokens. Generated signatures stay in the browser and are discarded.

### NFT order and custom unresolved cases

The wallet lab now separates **NFT order components** (`order`) from **Custom unresolved order** (`order-custom`). The first builds exact canonical `OrderComponents` from the currently owned local NFT, signed consideration recipient, time window, unique salt and the dedicated verifier counter. Its read-only `LabOrderVerifier` exposes a domain separator, information, counter and initial status only: it is not Seaport and cannot fulfill, cancel, consume or validate the signature. On an existing lab, explicitly run `npm run deploy:lab` to add optional `orders` without replacing existing fixture addresses/state, then **Prepare local test assets**. If the NFT was transferred, prepare assets again. The custom case retains uninterpreted signed scalar fields and deliberately remains protocol-unresolved; a no-number result is expected when no substantive adverse fact supports scoring. Both cases use real wallet signature requests, and generated signatures are discarded in the browser.

## 6. Use a public network and your own account

Use **Public networks** for public-chain data and actual Snap delivery checks. Start with Sepolia and a dedicated test account. Mainnet can hold real assets; the local Flask development wallet is not a place to store them.

1. Configure a trusted backend RPC. A valid Infura key supplies Sepolia (`11155111`) and Ethereum mainnet (`1`); other listed chains need explicit trusted endpoints.
2. Connect the intended provider/account. Local-mode connectivity checks can omit an account; hosted checks require verified identity first.
3. Choose **Backend query network (does not switch your wallet)**, then **Check RPC and account state**. The backend verifies the returned chain ID and reads block/time plus optional native balance/code. It distinguishes a recognized delegation designator from an ordinary no-code account. Results may be reused for 15 seconds.
4. Compare the selected backend network with **Current wallet network**. Selecting the query network does not switch the wallet. Use **Switch wallet to this network** only when you intend that change. This directly requests `wallet_switchEthereumChain`, without SDK analysis, a security scan or a Muse call; confirm or cancel in the wallet. The wallet must already know the network; otherwise add it using trusted official information and retry. Backend keys/RPC URLs are never given to the wallet for setup.
5. Install/pair the configured Snap and verify health. Select **Test the wallet signing insight**. It creates a unique ordinary `personal_sign` message containing site, account, selected network, nonce, timestamp and purpose. It costs no gas and grants no asset authority.
6. Read the exact message and insight before choosing sign/cancel. The page matches the exact message to a backend `paired-snap` report. A signature response alone does not pass the delivery check. The generated test signature stays in the browser; the unsigned message/report remain on the backend. Enabled Muse analysis consumes its own attempt budget.
7. Start real asset requests in their corresponding external dApps. Inspect each insight separately and decide in your wallet. The public-network page does not construct transfers, approvals or funding transactions.

The switch request is sent immediately. The page waits up to 60 seconds for the wallet reply, then briefly checks the wallet-reported chain before showing success. If another request is pending, open the selected wallet and handle its existing prompt. A page timeout does not cancel that prompt; check the wallet before retrying. Unknown networks must be added manually from trusted information.

The RPC probe, neutral insight test and hosted login are three different operations. RPC connectivity is not an assessment of the account or recipient. The neutral message does not log you in. Hosted login does not exercise every asset-analysis path. Pairing health establishes authenticated backend reachability, not safety or guaranteed future request delivery.

### Transaction call tracing

With `ENABLE_FORK_SIMULATION=1`, the existing temporary Anvil fork also tries a bounded `debug_traceCall` at its source base block **before** local execution. Source and child chain/header bindings are checked before and after. This can provide `call_trace_fork` even when the public RPC offers no trace method, without a separate trace-provider subscription, provided Anvil, configured RPC and the required historical state are available. It never sends an upstream transaction. Provider `call_trace` and isolated-fork `call_trace_fork` keep separate provenance; a primary-panel trace failure does not erase a successful fork trace. Neither is a complete asset inventory, signature-consumption test or future-execution guarantee. This trace applies to unsigned transactions; a plain or typed-message signature is not executed as a transaction and still needs its own protocol evidence.

## 7. Read evidence and an AI assessment

Read the request and unfinished checks before relying on the number. New scores come only from validated Muse output: an integer from 0 to 100 or `null`. It is an **uncalibrated risk indicator**, not a loss probability, fraud percentage, identity-trust score or guarantee. There are no numeric thresholds, additive rule points, weights, floors or fallback scores. Qualitative rule signals remain separate and can retain a warning independent of the model's assessment. Older rule scores are labeled historical.

The `numeric_assessment_basis` evidence gate prevents a semantically unresolved typed message from obtaining a number supported only by hashes, encoding success, account/verifier code or address presence, a generic permission warning or an unrelated native balance. A conditional number needs a cited substantive request-bound eligible observation. This is an evidence requirement, not a fixed score formula: supported decoded requests may still be assessed with explicit gaps, while valid abstention remains valid. Unknown custom field names are not promoted into token-transfer, spending-limit, recipient or nonce semantics.

| Required dimension | Evidence considered |
| --- | --- |
| Authority | Spender/operator, assets, amount, duration, revocation and later-use scope |
| Exposure | Same-asset balance comparison, fees and evidenced potential impact |
| Execution | Calls and asset changes actually supported by a call or fork |
| Identity | Account/network/source/target consistency and obtained reputation observations |
| Protocol | Evidenced slippage, exits, liquidation or contract-control mechanics |
| Deception | Observable source/message/request inconsistencies and supported phishing evidence |

Each dimension is qualitative and cites evidence IDs; dimensions are not numerical subscores and are not averaged. Evidence confidence describes support in the supplied packet, not a calibrated probability. Missing reputation is not proof of malicious identity. A finite permission is not automatically harmless. Unknown future execution does not erase an already evidenced authority grant.

The backend checks nonce/domain claims throughout summary, reasons, dimensions, suggested action and missing-data text, including indexed claims, match/mismatch direction and conditional/negated advice. The corresponding actual RPC observation is required. It also rejects invented citations, missing/duplicate dimensions, unsupported certainty, inconsistent abstention and unsupported honeypot claims. Natural-language validation remains a partial safeguard, not proof that every sentence is correct. Each low/review/high dimension needs at least one cited non-unknown observation beyond a tool plan. The assessment scope records unresolved checks and missing evidence from this request. Any unresolved check/gap, model-identified missing data, stale/missing/future observation timestamp, public-block provenance/freshness failure, or conflicting same-height block hash prohibits overall low or strong evidence confidence. The full completeness flag and missing-check lists remain visible. The packet key is assessment_scope; reports store assessmentScope with policy observable-request-v1. A permitted low assessment or strong evidence confidence applies only to the observable request scope, never to verified identity or future safety. A valid abstention remains unscored. One recognized validation failure can trigger one separately reserved repair with the same evidence and controlled feedback: both calls share 50 seconds, repair lasts at most 25 seconds, and it does not start with less than five seconds remaining. Transient HTTP 500/502/503/504 can instead consume the same single quota-reserved recovery slot. Authentication/quota/429 failures, arbitrary network failures, timeouts, refusals, incomplete envelopes and valid abstention do not automatically retry. Invalid output is never replaced with a local score.

The **Evidence quality** inventory lists status counts, observed/unknown counts by source, available network/block/hash/time provenance, mixed upstream-block chains, conflicting hashes at the same chain/height and capture/credential attribution. It flags observations recorded over five minutes before report creation, missing/invalid timestamps and timestamps over 30 seconds ahead. These are diagnostics, not a risk score, coverage percentage or confidence probability. Collector observation time does not establish upstream provider data age. Reads are pinned by block number rather than atomically by block hash; recorded hashes do not rule out reorganizations or inconsistent provider replies. A conflicting hash requires a fresh independent check. Fork blocks stay separate from upstream snapshots.

In an evidence row, `pass` means that particular observation succeeded. `warning`/`risk` describe the stated signal. `unknown` means unavailable, unsupported or unfinished. A tool plan is not a completed observation. Code, token names, interfaces and familiar selectors can be deceptive. A successful call or sale describes a state and cannot guarantee future behavior.

The Snap prioritizes up to 24 evidence rows, six primary parameter lines and six missing-check summaries. Use the report ID to find the complete report in **Check history**. Display truncation does not mean omitted checks passed. Original non-English historical reports retain their recorded text rather than receiving an invented translation or fresh assessment.

## 8. Understand exact extraction and coverage

New bounded paths include DAI-style Permit, ERC-3009 one-time transfer authorization, Safe-style controls/execution, supported recursive wrapper summaries, V3 position reads, selected bridge stages and generic withdrawals. Eight simplified account transaction cases and four DAI/ERC-3009 candidate-signature cases are available in the 67-case lab; other new paths have backend/API fixtures rather than equivalent official-protocol wallet cases. See [the extension acceptance boundaries](EXTENDED-COVERAGE-2026-10-22.md).

The decoder extracts supported ABI fields and committed typed-message fields; it does not identify risk by operation keywords alone. The [README operation table](../README.md#evidence-collected-for-each-operation) and [coverage guide](AI-COVERAGE-GUIDE.md#4-all-profiles-evidence-attempted-and-remaining-gaps) enumerate every profile. Typical examples are:

| Request | Fields and checks before Muse | Remaining boundary |
| --- | --- | --- |
| ERC-20 approval | Contract, spender, `amountOrTokenId`; standard/balance/allowance reads and optional fork/intelligence | Shared NFT selector, deceptive standards, spender identity and future use |
| V2 swap | Path, input, minimum output, recipient/deadline; selected fork buy→approve acquired token→reverse sell, gas/deltas | Restricted routes; loss includes price impact/fees; sell failure has multiple causes |
| Vault/lending | Current interface facts and actual original-fork before/after selected shares/underlying, preview/limits, collateral/debt/health and compatible differences | Candidate identity, future prices/solvency and complete liquidation stress remain unverified. |
| Canonical Permit | Signed owner/spender/value or NFT token ID/nonce/deadline, digest/domainHash, nonce/domain/interface/owner state | No generated signature recovery/consumption; custom variants and protocol identity |
| On-chain Permit2-shaped approve | Token/spender/uint160 cap/expiration; separate owner-to-Permit2 ERC-20 allowance and internal owner/token/final-spender amount/expiry/nonce | Interface reads do not authenticate the contract; each unavailable layer remains unknown |
| Permit2 signature | Canonical common types, nonce/allowance layers, owner binding and witness outer envelope/type/hash | Witness consumer business enforcement, custom variants, signature acceptance and future consumption remain unknown. |
| Session/UserOperation/RPC | Explicit API/dApp integration; bounded public scope fields; UserOperation parameter/code/fee observations; no authenticated keyed nonce/deposit checks | No global hook, actual session-policy enforcement, sponsorship validation or bundler execution. |

DAI reference authority derives from allowed, while ERC-3009 binds a one-time exact amount and Permit2 transfer binds a single-nonce cap; neither transfer form is a standing allowance. ERC-3009 balance insufficiency is recorded explicitly without inventing a smaller consumable transfer amount. Empty-data DELEGATECALL is delegated code execution rather than a native transfer. See the extension notes for these conditional exposure and wrapper boundaries.

Supported unsigned EIP-712 quantities normalize equivalent decimal, hexadecimal and leading-zero representations before risk interpretation, without changing the signed digest. Zero addresses are interpreted by role: supported NFT approval/Permit revocations do not become asset-burn warnings; actual transfer recipients and ownership changes keep their own meanings. For transferFrom, the decoded asset owner is distinct from the caller; a current-balance shortfall is described as execution/exposure uncertainty rather than approval over future deposits.

An EIP-712 risk field must be reachable through the declared signing type graph. Unsigned extra JSON fields do not establish a signed permission, financial amount or owner mismatch. Permit2 takes its owner from the actual signer. Standard Permit2 `expiration=0` marks the submission block's timestamp; it is not pre-sign expiry or automatic revocation. A nonzero past expiration can still allow state changes when consumed. A reference address or matching domain is not code authentication.

SIWE-style text is inspected against the supported bounded EIP-4361 envelope: account/header, required URI/version 1/chain/nonce/issued-at fields and order, nonce format/length, expiry/not-before/local-clock checks and up to 16 normalized resource origins. Source/domain/URI differences remain visible. The remote login nonce store is always unverified: this inspection does not prove nonce issuance/one-time use, audience/session acceptance, generated signature validity or website honesty. Hosted exact-message authentication is separate and verifies against its own challenge store.

The Snap requests `endowment:ethereum-provider` and attempts a short, read-only `eth_chainId` observation during a signature insight. It stores the result as a timestamped `signature.providerContext` snapshot, separate from the message's signed domain. The signature hook supplies no request-bound chain: local/EOA requests preserve `chainId: 0`. A hosted contract identity uses its verified bound chain as an authentication/query scope only after the provider observation matches; a missing or different provider chain requires reconnection rather than a score. This does not prove the initiating dApp's signing network or replace a signed domain with a provider claim. `signature.from` supplies the hook's requested signer; the Snap does not request account-selection permission or a new signature merely to inspect it.

Independent pinned RPC/header/balance/code reads retain successful observations when another fails. Confirmed nonce and supplied-fee/current-base-fee comparisons are observable checks, not pending replacement or future inclusion guarantees. Recognized EIP-7702 designators can produce one-hop delegated-code/hash reads; actual tuple cryptography and conditional state now have a bounded adapter, while recursive policy audits, full envelope execution and asset ERC-1271 acceptance remain incomplete. Generic valid typed messages can receive a DOMAIN_SEPARATOR comparison even when their nonce semantics are unsupported.

Basic calls and fork execution preserve supplied supported transaction type, gas, fees and nonce. A missing gas limit uses a recorded simulation default. Unsupported EIP-7702/blob/access-list/type or malformed execution fields remain explicit gaps; a simplified replacement is not presented as equivalent execution. Fork writes target a temporary local process, not the upstream public chain. Different collectors can use different verified blocks; execution mines child blocks after the recorded fork base.

Explicit asset reads stop at eight assets and 16 NFT IDs per asset. Generic RPC summaries bound nesting, arrays, fields and addresses. Fork discovery bounds logs, assets and call depth/count. Hidden assets, nonstandard logs, dynamic code and unsupported nested calls can remain unseen. Raw quantities are not dollar losses; asset decimals, NFT IDs, shares, fees and underlying assets need their own units.

Five profiles have no representative executable lab case: raw `eth_sign`, permission/session requests, UserOperations, network configuration and read-only RPC. Other profiles still have method-specific gaps. There is no complete integration for non-EVM chains, other wallets, malware, key disclosure, exchange internals, arbitrary off-chain investment claims, destination-chain arrival or future administrative actions.

### What could improve the remaining gaps?

| Needed input | Practical next work | What still cannot be claimed |
| --- | --- | --- |
| Configured RPC plus a specific tested adapter | More permission/position reads, known batch decoding, post-operation lending scenarios, more swap routes and source/destination bridge-state checks | RPC alone does not authenticate protocols, understand arbitrary code or guarantee arrival/solvency. |
| Trusted quote/price/market service | Reliable expected output, asset/LP/share valuation, liquidity and liquidation scenarios | Future prices, order and execution remain uncertain. |
| Verified source/deployment and reputation data | Bytecode/build identity, administrator graphs, genuine token/collection/protocol references and broader phishing/address checks | Missing intelligence and familiar names are not proof of safety. |
| Wallet/dApp or relying-party cooperation | Expose otherwise unseen permission/UserOperation entries, original hash input and nonce/session state | Prompts cannot discover unavailable requests or stores. |
| Off-chain services or investigation | Business identity, private exchange records, fraud conversations and device/key-compromise evidence | An on-chain snapshot cannot establish all off-chain facts. Additional collection needs its own integration and privacy controls. |
| Not provable from one pre-sign snapshot | Explore scenarios for future price/liquidity, ordering, upgrades, blacklists, relays and hidden effects | Scenarios cannot guarantee events that have not happened or universal safety. |

These are extension opportunities, not current capabilities. The 30 analysis profiles remain partial where documented. Semantic citation validation constrains selected claims but does not prove every English explanation correct. Measuring detection quality requires independent labeled evaluation, beyond local fixtures.

## 9. Hosted identity and release operation

EOA recovery proves the same key across EVM chains, so its identity remains address-scoped. An ERC-1271 login instead creates an **address-and-verified-chain identity**: its web/Snap credentials, scans, private reports, deletion and revocation are limited to that chain. The same contract address on another chain can have different owners. After changing networks, sign in and pair again on the intended chain; Snap health and request checks reject a mismatched or unobservable bound network. For a chain-bound signature, the verified identity chain is the authentication/query scope after a matching provider observation, not proof of the dApp's signing network.

Hosted resources use the verified identity scope too: an EOA uses its address key; a contract identity uses `eip155:<chainId>:<address>`. Active/recent scans, per-identity AI and evidence budgets, Snap issuance frequency and active-credential capacity use that scope, shared by its web and Snap sessions. IP/global limits and total service concurrency/credential capacity remain shared across all identities; switching chains does not increase those shared limits.

The first startup with this identity policy invalidates older hosted login challenges and web/Snap credentials once because they did not distinguish EOA and contract identities. Sign in and pair again. Stored reports, usage budgets, configuration and local-chain assets are retained; the migration does not delete them.

Hosted users first connect an account and select **Verify current wallet identity** or **Sign to verify this wallet**. Review the exact domain, URI, address, chain, nonce and expiry. The backend verifies its stored one-use message through EOA recovery or a supported deployed-contract ERC-1271 STATICCALL over trusted RPC. This authenticates that login only; unsupported/undeployed accounts fail. The challenge expires in five minutes. Successful login creates an eight-hour web bearer held only in memory. Refresh, provider/account changes and disconnection clear the browser identity; verify again to access private records.

Pairing creates a different, address-bound 30-day Snap bearer. It does not pass the web bearer to the Snap. Backend SQLite stores bearer hashes, expiry, revocation and report owners. History, report IDs and evidence are scoped to the verified address and, for contract identities, the verified chain; Origin is never authentication. Hosted transaction/message senders must match that address. Web users may explicitly submit supported manual summaries; Snap credentials accept transaction/message scans only. The page clears history/details on identity changes and failed reloads, aborts/discards stale responses and drops selections absent from the current owner's list. Local mode remains a shared workstation history rather than hosted identity isolation.

Pair issuance is limited to 4/identity/minute, 12/server-observed-IP/minute and 60/global/minute, persisted atomically in SQLite. An identity retains at most four active Snap credentials and the service at most 8192; successful reloads rotate only that owner's earliest-expiring credential(s). A 429 response changes no existing pairing and carries `Retry-After: 60`. Expired credentials and old rate rows are pruned with indexes.

Operators must use a real HTTPS domain, owned npm name and public repository in `.local/service.env`, using [the deployment example](../deploy/service.env.example). Keys stay in backend-only model/RPC files. Run from the project directory:

```sh
npm run build:hosted
npm run package:hosted
npm run start:hosted
```

The build compiles one HTTPS origin/npm ID into the frontend and Snap. Packaging checks successful-build fingerprints and creates the isolated `dist/release-snap` allowlisted npm artifact. It does not publish. Inspect the artifact with `npm pack --dry-run --ignore-scripts` from its directory. The hosted service serves frontend/API on loopback 8787 behind the configured HTTPS reverse proxy; use [the Nginx example](../deploy/nginx.conf.example) and preserve the exact Host/origin. It starts neither Anvil nor the local Snap file server. Stop it with Ctrl+C in its terminal. Domain/package/mode changes require rebuilding both bundles.

Hosted mode does not register local lab/funding, legacy/demo/workflow, monitor, example, download or synthetic AI-test routes. It enforces wallet and global quotas, one active scan per verified identity, a configurable total scan cap and rate limits. Packaging is not deployment, npm publication, registry eligibility, independent security review or browser-wallet acceptance. Complete those separately before inviting public users. The default build remains a local Flask integration.

## Hosted privacy, upstream budgets and evidence hardening

On POSIX systems, startup restricts an on-disk database and existing WAL/SHM sidecars to owner-only mode `0600`; newly created database directories use `0700`. These filesystem permissions also tighten existing databases, but do not encrypt data or protect against the same operating-system account, administrators or unprotected backups.

Model input is bounded before transmission: the serialized evidence packet may contain at most **200,000 UTF-8 bytes**, and each complete model request, including a repair, at most **500,000 bytes**. Oversized input is not silently trimmed into an apparently complete assessment: the original evidence is retained and no score is accepted for that failed analysis. Timeouts, provider failures, refused/invalid output and valid abstention likewise have no invented fallback score.

Vite denies direct filesystem access to `.local/`, `.audit-build/`, `.presentation-build/`, `.git/`, environment/credential files and database files, including `/@fs/` requests. Keep secrets in the designated private files; this deny list is additional protection, not permission to expose the development server publicly.

**Sign out all sessions and revoke pairing** atomically revokes credentials and pending login challenges in the current identity scope: all address sessions for an EOA, or only the verified-chain sessions for a contract identity. **Delete my stored reports** requires confirmation, deletes reports in that same scope and revokes its credentials. Other identities and usage budgets remain, so deletion cannot reset paid-attempt limits. Every hosted report insert/update checks the still-active credential and owner under the same SQLite transaction; a revoked in-flight request cannot restore its report. Requests already sent to Meta/RPC/intelligence cannot be recalled or refunded by deletion.

Deletion means logical SQLite row removal, not guaranteed forensic erasure from WAL pages, disks, backups or third-party logs. The application does not encrypt its database. Optional report retention is disabled by default. Set the following nonsecret operator settings in backend `.local/service.env` or the process environment:

```dotenv
WALLETSHIELD_SCAN_WALLET_DAILY_LIMIT=100
WALLETSHIELD_SCAN_IP_DAILY_LIMIT=300
WALLETSHIELD_SCAN_GLOBAL_DAILY_LIMIT=1000
WALLETSHIELD_REPORT_RETENTION_DAYS=0
```

Evidence/RPC/fork scan budgets are independent of model attempts: hosted scans reserve all six scopes atomically **before collection** (8/identity/minute, 16/server-observed-IP/minute, 60/global/minute, plus the configurable UTC-day limits above). An exhausted scope rejects the scan without charging the others or starting collectors. These persistent counters survive restarts; rejected/unfinished checks do not fabricate scores. The separate model-attempt budgets still apply. These are bounded initial service policies, not a throughput or public-scale availability guarantee; network-connection probes have their separate limits. Allowed daily settings are 1–10,000 per identity, 1–100,000 per IP and 1–1,000,000 globally.

Retention `0` preserves existing data. An explicit value from 1 to 3650 days prunes at most 100 expired owner-mapped reports at startup and each minute; a backlog can require multiple batches. Age uses the report creation time. Unowned local history, usage budgets, other application state and third-party copies are not removed by this policy.

Public-chain block provenance is separate from collection time. The `quality.blockFreshness` inventory flags RPC/isolated-fork block timestamps older than 300 seconds, over 30 seconds ahead, missing block time/hash or unverified chain identity. Such gaps prohibit overall `low` and `strong` evidence confidence; they are not score weights. Synthetic demonstrations and local chain 31337 are excluded from public-block age gating because local clocks can be artificial. Observation-time diagnostics remain separate, and reorganization/provider consistency is not proved by a recent block.

Muse now receives `evidence_admissibility` (which real observations can support each dimension) and `claim_support` (bounded basic-call/fork-execution/fork-sale support). A real but irrelevant citation cannot justify a dimension. Token metadata/open-source status and no-hit (zero) sellability flags do not by themselves support identity, deception or authority; actual control flags can support authority, sale/tax observations can support exposure/protocol, and adverse identity claims need request/chain-bound recognized risk observations. Bounded validation checks all displayed text for unsupported official identity, guaranteed safety/future execution/sellability or factual USD-loss claims, while preserving explicit uncertainty and conditional advice. A basic call is not transaction inclusion; a fork result is not live execution or a future guarantee. These guards remain partial language checks, not formal proof or an independent accuracy/calibration benchmark. New checks used offline adversarial fixtures; they do not establish current live Muse accuracy. Successful model response bodies are streamed with a 150,000-byte cap; error bodies have a 16,000-byte cap, oversized reads are canceled and invalid UTF-8 is rejected. Raw provider error text is not exposed as user advice. These resource bounds do not verify model truth.

GoPlus remains opt-in. It derives at most eight token and eight counterparty candidates from recognized outer/path/Permit2/batch fields; bridge remote-token fields and delegated-call targets are not blindly relabeled as local tokens. At most 18 network queries run with four-way concurrency, 1.8 seconds per request and 7.5 seconds total. Responses cache for 30 seconds (256 entries); supported-chain discovery caches for one hour. Each result exposes `fetchedAt`, `cacheHit`, `cacheAgeMs`, `cacheTtlMs`, `providerAsOf:null` and `freshnessVerified:false`: a recent fetch is not a known upstream data date. Missing flags, closed-source/proxy omissions, unqueried/truncated candidates and non-hits remain limits. See [GoPlus response details](https://docs.gopluslabs.io/reference/response-details).

Canonical token-funded V3 single/path exact-input/exact-output variants retain bounded dependent fork buy/sell adapters. The original buy keeps its supplied execution fields; the derived sale uses observed input debit and acquired output. Native-funded V3 round trips and router-specific sender-sentinel recipient aliases are unsupported after removal of deployment bindings; generic original-transaction simulation remains available where supported. Candidate pool/factory association, tick/range and active liquidity are observations, not authenticated pool identity, a quote or a future exit guarantee. Opaque aggregators, unsupported funding/recipients and future ordering remain gaps. The wallet catalog now has 67 representative cases; historical pre-removal acceptance results do not certify the current reduced scope.

Automatic coverage still requires actual wallet delivery. MetaMask currently displays message insights only at Critical severity and after advancing to Sign; transaction insights have a separate entry point. See the [primary entry-point documentation](https://docs.metamask.io/snaps/reference/entry-points/). Permissions, sessions, UserOperations and other wallet RPCs require explicit API submission or a cooperating dApp SDK integration; no general wallet interceptor is installed. Hosted login supports EOA recovery and bounded deployed-contract ERC-1271 validation of the exact stored login message only; undeployed/ERC-6492 accounts and unsupported policies remain unavailable. Public domain/TLS, intended Snap publication/distribution, browser acceptance, secure backup/restore and load/failure testing are still required before a public launch.

## 10. Privacy and troubleshooting

Unsigned requests, evidence and outputs go to the configured backend and remain in SQLite. Local mode stores them on your computer; hosted mode stores them on the operator's server. The application does not encrypt its database. Hosted owners can confirm logical report deletion; optional bounded age-based retention is disabled by default. RPC providers see addresses/call parameters needed for state and forks. Enabled GoPlus receives bounded selected addresses, token and normalized public source origin. Enabled Meta receives the bounded evidence packet, including bounded message previews and decoded fields, but not full calldata/history or keys. A repair resends that evidence and bounded rejected output. `store:false` is a request option, not a blanket guarantee about provider logging.

Generated lab/neutral-test signatures stay in the browser. Hosted login signatures are intentionally sent for authentication and are not persisted. Never put secrets in unsigned data; filtering is not a universal secret detector. Capture channel records credential provenance, not cryptographic attestation of wallet/Snap code execution.

| Problem | Recovery |
| --- | --- |
| Wallet unavailable or wrong extension | Open the local URL in the desktop browser, select the intended provider and grant account access. |
| Snap installed but pairing failed | Read the failed stage, check 8080/8787, rebuild, refresh, reload/pair and verify the current account. |
| No insight/report | The wallet may reject before its hook. Check supported entry, Snap health and backend availability; do not count an API-only report as wallet delivery. |
| Local case reverts | Verify chain 31337, fresh deployments, balance and case prerequisites; prepare assets again after a chain restart. |
| RPC configured but no data | Check actual endpoint reachability/chain ID, service quota and historical-state support. |
| No AI number | Read `ai.status`/message: disabled/unconfigured model, quota, failure, refusal, invalid output and honest abstention legitimately leave no score. |
| Hosted records inaccessible | Verify the correct wallet again; refreshing clears the memory-only session. Pairing tokens and web tokens have different roles. |
| Old report appears inconsistent | Compare its time/version/source and chain reset. Historical text and outcomes are preserved. |

Run `npm test`, `npm run typecheck` and `npm run build` for offline/static regression checks. `npm run test:security` starts its own isolated test node. `test:chain` and `test:lab` require the running local deployment and snapshot/restore it; keep the browser idle. These tests use node accounts, not browser Snap delivery. The complete acceptance check is a manual wallet request with a matched Snap report, visible evidence and a separately recorded wallet outcome. No automated test count establishes universal detection or production readiness.
