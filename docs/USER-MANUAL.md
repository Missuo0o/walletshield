# WalletShield user manual

This manual explains the current English interface and the implemented local and hosted workflows. WalletShield gives advice about an unsigned EVM request before you decide in your wallet. It cannot guarantee safety, force rejection, sign for you, recover assets or continuously monitor a signed request.

The [README](../README.md) is the configuration and developer reference. The [generated coverage guide](AI-COVERAGE-GUIDE.md) lists all 30 profiles, their exact extracted fields, tools, missing checks and possible extensions. The local lab has 54 representative cases: 43 transactions and 11 message requests, representing 25 profiles. These are examples, not a detection-accuracy benchmark.

## 1. Choose the workflow

| Goal | Page / workflow | What success establishes |
| --- | --- | --- |
| Learn how a request appears in a real wallet | Local wallet lab, chain 31337, MetaMask Flask | The selected test request reached the wallet; a matched Snap report separately establishes observed Snap submission. |
| Check a configured public-network connection | Public networks → Check RPC and account state | The backend reached an endpoint reporting the expected chain and observed a block and optional account state. This produces no risk score. |
| Verify actual message-insight delivery | Public networks → Test the wallet signing insight | A unique unsigned test message matched a backend report submitted with the paired Snap credential. This can call Muse. |
| Assess your own transfer, approval, Permit or swap | Start the request in its external dApp and inspect the wallet insight | Only this request and its successfully collected evidence are assessed. The wallet decides whether to provide the hook. |
| Read private hosted history or pair a hosted Snap | Verify current wallet identity, then install/pair | An EOA login signature proves control of the address for service access. It does not grant asset authority. |
| Examine a permission, session, UserOperation or other RPC without a hook | Explicit unsigned developer API submission | A bounded summary is analyzed. The backend does not execute the requested wallet RPC. |

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

Each initial call reserves one attempt, including failed calls. A permitted output-validation repair reserves a second attempt. The default daily cap is 100 for the backend; hosted mode also defaults to 20 per verified address, shared across web and Snap sessions. Hosted reservations check both caps atomically: if either denies the attempt, neither is charged and no model call starts. These are attempt limits, not dollar budgets. RPC, Infura and GoPlus limits/billing are separate.

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
4. Optional **Add context** records your purpose and reported inducements. These are unverified claims, not collected conversation history. They apply to this lab session and are not silently attached to other sites' requests. Do not enter secrets or private conversations.
5. Select **Request a test transaction** or **Request a test signature**. Inspect the wallet's account, chain, recipient, amount, permission and message. Read the WalletShield insight and unfinished checks. MetaMask controls when message insights appear and can show them after you advance to Sign.
6. Choose confirm or cancel in the wallet. Start with **Unlimited approval**, read the insight and cancel; then compare limited approval and revocation. A canceled request can still have a completed pre-sign report.
7. Inspect **Wallet test history**. **Wallet outcome** and **Snap delivery** are separate. **Not observed** means no matching Snap submission was recorded. A returned signature, an API-only report or a successful node test does not replace that observation.
8. Open **Check history** for the report and full evidence. Refresh the list when necessary. Existing reports may refer to earlier chain state or an earlier implementation.

Optional ERC-20 import changes only the wallet's displayed assets; the webpage inventory reads balances directly. NFTs and positions may need their associated operations to obtain or replenish them. Preparation preserves balances already above its top-up target. Simplified local router prices, vault shares, lending behavior, bridge records and control fixtures are not official protocol deployments or realistic financial models. LAB-BLOCK deliberately restricts sales to exercise that evidence path.

Generated lab signatures are format-checked and discarded in the browser. They are not uploaded, persisted or submitted for asset use. The unsigned message still reaches the backend and a bounded preview can reach Muse.

## 6. Use a public network and your own account

Use **Public networks** for public-chain data and actual Snap delivery checks. Start with Sepolia and a dedicated test account. Mainnet can hold real assets; the local Flask development wallet is not a place to store them.

1. Configure a trusted backend RPC. A valid Infura key supplies Sepolia (`11155111`) and Ethereum mainnet (`1`); other listed chains need explicit trusted endpoints.
2. Connect the intended provider/account. Local-mode connectivity checks can omit an account; hosted checks require verified identity first.
3. Choose **Choose the backend query network**, then **Check RPC and account state**. The backend verifies the returned chain ID and reads block/time plus optional native balance/code. It distinguishes a recognized delegation designator from an ordinary no-code account. Results may be reused for 15 seconds.
4. Compare the selected backend network with **Current wallet network**. Selecting the query network does not switch the wallet. Use **Switch wallet to this network** only when you intend that change. The wallet must already know the network; otherwise add it using trusted official information and retry. Backend keys/RPC URLs are never given to the wallet for setup.
5. Install/pair the configured Snap and verify health. Select **Test the wallet signing insight**. It creates a unique ordinary `personal_sign` message containing site, account, selected network, nonce, timestamp and purpose. It costs no gas and grants no asset authority.
6. Read the exact message and insight before choosing sign/cancel. The page matches the exact message to a backend `paired-snap` report. A signature response alone does not pass the delivery check. The generated test signature stays in the browser; the unsigned message/report remain on the backend. Enabled Muse analysis consumes its own attempt budget.
7. Start real asset requests in their corresponding external dApps. Inspect each insight separately and decide in your wallet. The public-network page does not construct transfers, approvals or funding transactions.

The RPC probe, neutral insight test and hosted login are three different operations. RPC connectivity is not an assessment of the account or recipient. The neutral message does not log you in. Hosted login does not exercise every asset-analysis path. Pairing health establishes authenticated backend reachability, not safety or guaranteed future request delivery.

## 7. Read evidence and an AI assessment

Read the request and unfinished checks before relying on the number. New scores come only from validated Muse output: an integer from 0 to 100 or `null`. It is an **uncalibrated risk indicator**, not a loss probability, fraud percentage, identity-trust score or guarantee. There are no numeric thresholds, additive rule points, weights, floors or fallback scores. Qualitative rule signals remain separate and can retain a warning independent of the model's assessment. Older rule scores are labeled historical.

| Required dimension | Evidence considered |
| --- | --- |
| Authority | Spender/operator, assets, amount, duration, revocation and later-use scope |
| Exposure | Same-asset balance comparison, fees and evidenced potential impact |
| Execution | Calls and asset changes actually supported by a call or fork |
| Identity | Account/network/source/target consistency and obtained reputation observations |
| Protocol | Evidenced slippage, exits, liquidation or contract-control mechanics |
| Deception | Blind signing and user-reported inducements, including payment before withdrawal |

Each dimension is qualitative and cites evidence IDs; dimensions are not numerical subscores and are not averaged. Evidence confidence describes support in the supplied packet, not a calibrated probability. Missing reputation is not proof of malicious identity. A finite permission is not automatically harmless. Unknown future execution does not erase an already evidenced authority grant.

The backend rejects invented citations, missing/duplicate dimensions, unsupported nonce/domain claims, unsupported certainty, inconsistent abstention and unsupported honeypot claims. Each low/review/high dimension needs at least one cited non-unknown observation beyond a tool plan. Unresolved checks, stale/missing/future observation timestamps or conflicting same-height block hashes prevent an overall low assessment or strong confidence. A valid abstention remains unscored. One recognized validation failure can trigger one separately reserved repair with the same evidence and controlled feedback: both calls share 50 seconds, repair lasts at most 25 seconds, and it does not start with less than five seconds remaining. HTTP/auth/429/transport failures, refusals, incomplete envelopes and valid abstention do not retry. Invalid output is never replaced with a local score.

The **Evidence quality** inventory lists status counts, observed/unknown counts by source, available network/block/hash/time provenance, mixed upstream-block chains, conflicting hashes at the same chain/height and capture/credential attribution. It flags observations recorded over five minutes before report creation, missing/invalid timestamps and timestamps over 30 seconds ahead. These are diagnostics, not a risk score, coverage percentage or confidence probability. Collector observation time does not establish upstream provider data age. Reads are pinned by block number rather than atomically by block hash; recorded hashes do not rule out reorganizations or inconsistent provider replies. A conflicting hash requires a fresh independent check. Fork blocks stay separate from upstream snapshots.

In an evidence row, `pass` means that particular observation succeeded. `warning`/`risk` describe the stated signal. `unknown` means unavailable, unsupported or unfinished. A tool plan is not a completed observation. Code, token names, interfaces and familiar selectors can be deceptive. A successful call or sale describes a state and cannot guarantee future behavior.

The Snap prioritizes up to 24 evidence rows, six primary parameter lines and six missing-check summaries. Use the report ID to find the complete report in **Check history**. Display truncation does not mean omitted checks passed. Original non-English historical reports retain their recorded text rather than receiving an invented translation or fresh assessment.

## 8. Understand exact extraction and coverage

The decoder extracts supported ABI fields and committed typed-message fields; it does not identify risk by operation keywords alone. The [README operation table](../README.md#evidence-collected-for-each-operation) and [coverage guide](AI-COVERAGE-GUIDE.md#4-all-profiles-evidence-attempted-and-remaining-gaps) enumerate every profile. Typical examples are:

| Request | Fields and checks before Muse | Remaining boundary |
| --- | --- | --- |
| ERC-20 approval | Contract, spender, `amountOrTokenId`; standard/balance/allowance reads and optional fork/intelligence | Shared NFT selector, deceptive standards, spender identity and future use |
| V2 swap | Path, input, minimum output, recipient/deadline; selected fork buy→approve acquired token→reverse sell, gas/deltas | Restricted routes; loss includes price impact/fees; sell failure has multiple causes |
| Vault/lending | Action, amount/receiver/owner or asset/interest mode; preview/max/totals or current debt/collateral/LTV/health factor | Interface identity, future solvency, prices and full post-operation liquidation |
| Canonical Permit | Signed owner/spender/value or NFT token ID/nonce/deadline, digest/domainHash, nonce/domain/interface/owner state | No generated signature recovery/consumption; custom variants and protocol identity |
| Permit2 | Signed type/domain, token/amount/expiration/spender, signer-derived owner, allowance triple or nonce bitmap | Up to 16 entries; witness/custom variants and code authentication incomplete |
| Session/UserOperation/RPC | Method, whitelisted addresses/limits/expiry or sender/entry point/paymaster/factory/nonce, bounded calldata summary | Explicit submission; no universal hook, permission grant or bundler execution |

An EIP-712 risk field must be reachable through the declared signing type graph. Unsigned extra JSON fields do not establish a signed permission, financial amount or owner mismatch. Permit2 takes its owner from the actual signer. Standard Permit2 `expiration=0` marks the submission block's timestamp; it is not pre-sign expiry or automatic revocation. A nonzero past expiration can still allow state changes when consumed. A reference address or matching domain is not code authentication.

SIWE-style text is inspected against the supported bounded EIP-4361 envelope: account/header, required URI/version 1/chain/nonce/issued-at fields and order, nonce format/length, expiry/not-before/local-clock checks and up to 16 normalized resource origins. Source/domain/URI differences remain visible. The remote login nonce store is always unverified: this inspection does not prove nonce issuance/one-time use, audience/session acceptance, generated signature validity or website honesty. Hosted exact-message authentication is separate and verifies against its own challenge store.

The signature hook has no request-bound chain, so its request keeps `chainId: 0`. A short `eth_chainId` provider snapshot is separately timestamped as `signature.providerContext`. It is not bound to the initiating dApp or signing time and never silently replaces the signed domain for contract reads. A match does not prove the request network; a mismatch is contextual evidence.

Independent pinned RPC/header/balance/code reads retain successful observations when another fails. Confirmed nonce and supplied-fee/current-base-fee comparisons are observable checks, not pending replacement or future inclusion guarantees. Recognized EIP-7702 designators can produce one-hop delegated-code/hash reads; recursive delegation, authorization-list validation, code auditing and ERC-1271 behavior remain unsupported. Generic valid typed messages can receive a DOMAIN_SEPARATOR comparison even when their nonce semantics are unsupported.

Basic calls and fork execution preserve supplied gas, fees and nonce. A missing gas limit uses a recorded simulation default. Unsupported EIP-7702/blob/access-list/type or malformed execution fields remain explicit gaps; a simplified replacement is not presented as equivalent execution. Fork writes target a temporary local process, not the upstream public chain. Different collectors can use different verified blocks; execution mines child blocks after the recorded fork base.

Explicit asset reads stop at eight assets and 16 NFT IDs per asset. Generic RPC summaries bound nesting, arrays, fields and addresses. Fork discovery bounds logs, assets and call depth/count. Hidden assets, nonstandard logs, dynamic code and unsupported nested calls can remain unseen. Raw quantities are not dollar losses; asset decimals, NFT IDs, shares, fees and underlying assets need their own units.

Five profiles have no representative executable lab case: raw `eth_sign`, permission/session requests, UserOperations, network configuration and read-only RPC. Other profiles still have method-specific gaps. There is no complete integration for non-EVM chains, other wallets, malware, key disclosure, exchange internals, arbitrary off-chain investment claims, destination-chain arrival or future administrative actions.

### What could improve the remaining gaps?

| Needed input | Practical next work | What still cannot be claimed |
| --- | --- | --- |
| Configured RPC plus a specific tested adapter | More permission/position reads, known batch decoding, post-operation lending scenarios, more swap routes and source/destination bridge-state checks | RPC alone does not authenticate protocols, understand arbitrary code or guarantee arrival/solvency. |
| Trusted quote/price/market service | Reliable expected output, asset/LP/share valuation, liquidity and liquidation scenarios | Future prices, order and execution remain uncertain. |
| Verified source/deployment and reputation data | Bytecode/build identity, administrator graphs, genuine token/collection/protocol references and broader phishing/address checks | Missing intelligence and familiar names are not proof of safety. |
| Wallet/dApp or relying-party cooperation, plus user context | Expose otherwise unseen permission/UserOperation entries, original hash input, nonce/session state and intended recipient/purpose | Prompts cannot discover unavailable requests; user statements need corroboration. |
| Off-chain services or investigation | Business identity, private exchange records, fraud conversations and device/key-compromise evidence | An on-chain snapshot cannot establish all off-chain facts. Additional collection needs its own integration and privacy controls. |
| Not provable from one pre-sign snapshot | Explore scenarios for future price/liquidity, ordering, upgrades, blacklists, relays and hidden effects | Scenarios cannot guarantee events that have not happened or universal safety. |

These are extension opportunities, not current capabilities. The 30 analysis profiles remain partial where documented. Semantic citation validation constrains selected claims but does not prove every English explanation correct. Measuring detection quality requires independent labeled evaluation, beyond local fixtures.

## 9. Hosted identity and release operation

Hosted users first connect an account and select **Verify current wallet identity** or **Sign to verify this wallet**. Review the exact domain, URI, address, chain, nonce and expiry. The backend verifies an EOA signature over its stored one-use message; contract-wallet/unchecked ERC-1271 authentication is unsupported. The challenge expires in five minutes. Successful login creates an eight-hour web bearer held only in memory. Refresh, provider/account changes and disconnection clear the browser identity; verify again to access private records.

Pairing creates a different, address-bound 30-day Snap bearer. It does not pass the web bearer to the Snap. Backend SQLite stores bearer hashes, expiry, revocation and report owners. History, report IDs and evidence are scoped to the verified address; Origin is never authentication. Hosted transaction/message senders must match that address. Web users may explicitly submit supported manual summaries; Snap credentials accept transaction/message scans only.

**Sign out and revoke Snap pairing** revokes that address's Snap credentials and the current web session. Other web sessions can survive until logout/expiry. Merely switching accounts does not revoke previous server credentials. Expired/revoked Snap credentials require login and pairing again.

Operators must use a real HTTPS domain, owned npm name and public repository in `.local/service.env`, using [the deployment example](../deploy/service.env.example). Keys stay in backend-only model/RPC files. Run from the project directory:

```sh
npm run build:hosted
npm run package:hosted
npm run start:hosted
```

The build compiles one HTTPS origin/npm ID into the frontend and Snap. Packaging checks successful-build fingerprints and creates the isolated `dist/release-snap` allowlisted npm artifact. It does not publish. Inspect the artifact with `npm pack --dry-run --ignore-scripts` from its directory. The hosted service serves frontend/API on loopback 8787 behind the configured HTTPS reverse proxy; use [the Nginx example](../deploy/nginx.conf.example) and preserve the exact Host/origin. It starts neither Anvil nor the local Snap file server. Stop it with Ctrl+C in its terminal. Domain/package/mode changes require rebuilding both bundles.

Hosted mode does not register local lab/funding, legacy/demo/workflow, monitor, example, download or synthetic AI-test routes. It enforces wallet and global quotas, one active scan per address, a configurable total scan cap and rate limits. Packaging is not deployment, npm publication, registry eligibility, independent security review or browser-wallet acceptance. Complete those separately before inviting public users. The default build remains a local Flask integration.

## 10. Privacy and troubleshooting

Unsigned requests, evidence and outputs go to the configured backend and remain in SQLite. Local mode stores them on your computer; hosted mode stores them on the operator's server. The application has no database encryption or automatic retention/deletion policy. RPC providers see addresses/call parameters needed for state and forks. Enabled GoPlus receives bounded selected addresses, token and normalized public source origin. Enabled Meta receives the bounded evidence packet, including message previews and supplied context, but not full calldata/history or keys. A repair resends that evidence and bounded rejected output. `store:false` is a request option, not a blanket guarantee about provider logging.

Generated lab/neutral-test signatures stay in the browser. Hosted login signatures are intentionally sent for authentication and are not persisted. Never put secrets in unsigned data; filtering is not a universal secret detector. Capture channel records credential provenance, not cryptographic attestation of wallet/Snap code execution.

| Problem | Recovery |
| --- | --- |
| Wallet unavailable or wrong extension | Open the local URL in the desktop browser, select the intended provider and grant account access. |
| Snap installed but pairing failed | Read the failed stage, check 8080/8787, rebuild, refresh, reload/pair and verify the current account. |
| No insight/report | The wallet may reject before its hook. Check supported entry, Snap health and backend availability; do not count an API-only report as wallet delivery. |
| Local case reverts | Verify chain 31337, fresh deployments, balance and case prerequisites; prepare assets again after a chain restart. |
| RPC configured but no data | Check actual endpoint reachability/chain ID, service quota and historical-state support. |
| No AI number | Read `ai.status`/message: disabled/unconfigured model, quota, failure, refusal, invalid output and honest abstention legitimately leave no score. |
| Hosted records inaccessible | Verify the correct EOA again; refreshing clears the memory-only session. Pairing tokens and web tokens have different roles. |
| Old report appears inconsistent | Compare its time/version/source and chain reset. Historical text and outcomes are preserved. |

Run `npm test`, `npm run typecheck` and `npm run build` for offline/static regression checks. `npm run test:security` starts its own isolated test node. `test:chain` and `test:lab` require the running local deployment and snapshot/restore it; keep the browser idle. These tests use node accounts, not browser Snap delivery. The complete acceptance check is a manual wallet request with a matched Snap report, visible evidence and a separately recorded wallet outcome. No automated test count establishes universal detection or production readiness.
