# WalletShield Local · v0.4.1 · Muse Wonder

[English](README.md) · [简体中文](README.zh-CN.md) · [中文使用手册](docs/USER-MANUAL-zh.md) · [中文取数与能力边界](docs/AI-COVERAGE-GUIDE-zh.md)

WalletShield is an EVM wallet security prototype with a local wallet lab and an optional authenticated hosted mode. A paired MetaMask Snap sends an unsigned transaction or message request to the configured backend. By default, that backend runs on your computer. The backend decodes the request, selects evidence collectors, reads the configured network, optionally simulates the transaction in an isolated Anvil fork, and asks **Meta Muse Wonder `muse-wonder-1.0`** to assess the collected evidence. The webpage and Snap show the result before you decide whether to confirm or cancel in the wallet.

It provides **pre-sign advice**. It does not force a block, sign for you, recover funds, or continuously monitor activity after signing. Automatic analysis covers only the EVM transaction and message requests that MetaMask actually delivers to the Snap. Installing the Snap does not intercept every wallet operation.

The local wallet lab currently contains **54 representative cases: 43 transactions and 11 message signatures**, spanning **25 of 30 analysis profiles**. These counts describe implemented paths and local examples, not detection accuracy or a percentage of wallet risks covered. The current interface, newly generated explanations and operating documentation are in English. Older stored reports preserve their original language and are labeled as such.

For a guided first run and recovery steps, read the [English user manual](docs/USER-MANUAL.md). For every profile’s exact extracted fields, remaining uncertainty and extension options, read the [generated coverage guide](docs/AI-COVERAGE-GUIDE.md).

## What happens during an operation

```text
Webpage / another dApp creates an unsigned wallet request
    → MetaMask supplies a supported transaction or signature to the paired Snap
    → Snap sends the request to the configured local or HTTPS backend
    → strict input validation and operation decoding
    → tool plan + independent evidence collectors
    → qualitative rule signals and explicit missing checks
    → Muse assesses this evidence and cites its evidence IDs
    → the same report is updated in backend SQLite
    → Snap / webpage display advice
    → the user decides in MetaMask
```

For local lab requests, the backend first creates a test session. The webpage passes its ID to the paired Snap, then calls the wallet. An authenticated Snap report is linked only to the matching request and session; a webpage-only API scan cannot substitute for observed Snap delivery. Reports now record their capture channel server-side as `paired-snap` or `workbench`; older reports can have no channel. The wallet outcome and the security assessment are separate: a completed report is not a confirmed transaction, and a returned signature is not evidence that anyone consumed it.

For an incoming request, the backend:

1. Validates the request against a strict schema. It accepts unsigned transactions, messages, or supported RPC summaries, not a client-provided score, reputation result, or RPC override.
2. Decodes known selectors and signature structures. Recognizing an ABI shape establishes a **candidate operation**, not an authenticated protocol identity. Unrecognized input stays unknown.
3. Records a tool plan describing which collectors apply and whether their configuration is available. A selected tool is not a successful check.
4. Runs applicable collectors independently. Evidence includes an ID, source, timestamp, status, and structured facts where available. Collector failure becomes an explicit unknown; other obtained evidence is retained.
5. Adds qualitative signals, including permission scope, account/network mismatches, expired deadlines, unusual value attached to an approval, and user-reported fraud context. Rules supply no numeric score.
6. Sends a bounded evidence packet to Muse when enabled and within the daily budget. Validates the structured response and its citations. For a recognized validation failure, it can reserve one additional model attempt to correct the output using the same evidence and explicit feedback. It never substitutes a locally invented score; invalid output after that attempt is rejected.
7. Stores the result and exposes the evidence and remaining gaps. The wallet remains responsible for signing, sending, confirmation, and cancellation.

Independent RPC/header/balance/code reads retain successful observations when another read fails; unavailable fields are not silently converted to zero or no code. Collectors pin their own reads to verified networks and blocks. They can finish at different blocks and times; the report is not one globally synchronized snapshot. Simulation describes a particular state, not guaranteed future execution. The isolated execution preserves any gas limit, fee parameters and nonce supplied in the original request; it does not replace an insufficient gas limit or stale nonce to manufacture success. If no gas limit was supplied, it uses an explicitly recorded simulation default. The fork starts from a recorded base block and mines its own execution blocks, so the execution block can differ from that base block.

## Tools and responsibilities

| Tool or component | Role | Important boundary |
| --- | --- | --- |
| MetaMask Flask and selected EIP-1193 provider | Connect the selected account; request networks, local transactions, and message signatures; install and invoke the development Snap | EIP-6963 discovery helps select the intended wallet when multiple extensions are installed. The wallet handles consent and signing and can reject before an insight is delivered. |
| WalletShield Snap | Transaction/signature insight hooks, authenticated backend pairing/health, and in-wallet advice | Uses the compiled local or HTTPS backend; has no general hook for every wallet RPC, permission request, or session. |
| React, Vite, Lucide | Local interface, asset inventory, lab case selection, report display, and history | The webpage shows evidence and initiates explicitly selected operations; it is not an independent wallet. |
| Fastify and Zod | Backend API, Host/origin checks, strict validation and optional hosted wallet authentication | Hosted mode requires explicit HTTPS configuration; local experimental routes remain disabled there. |
| viem and configured EVM JSON-RPC | ABI/quantity processing, network/block checks, balances, code, token/NFT interfaces, allowances, protocol view calls, and EIP-712 encoding | RPC observations can be stale or misleading if the endpoint or contract lies. A successful `eth_call` is not full asset simulation. |
| Infura or explicit trusted RPC URLs | Supply real-network state to the backend | An Infura key is different from a Meta key. RPC access does not provide phishing or honeypot intelligence by itself. |
| Anvil (`@foundry-rs/anvil`) | Owned chain 31337 for the local lab; separate temporary fork processes for simulation | Fork writes, account impersonation, and test buy/sell execution target the temporary local fork, never the upstream chain. A bounded temporary read-only loopback proxy keeps the configured upstream URL out of child process arguments and credentials out of the child environment. |
| Solidity compiler (`solc`) and local fixture contracts | Compile and deploy the test token, NFTs, router, vault, lending, actions, control, Permit2-shaped, and wrapped-token fixtures | Simplified fixtures are not official protocol deployments or realistic market models. |
| GoPlus, optional | Supported-chain discovery and address, website, token, sell-restriction, tax, and control-risk observations | Disabled by default. Unsupported chains, absent fields, timeouts, and failures remain unknown. A non-hit is not a safety guarantee. |
| SIWE envelope parser and evidence inventory | Bounded supported EIP-4361 syntax/source/account/time checks; status/source counts, observation-time flags and block provenance | Login replay protection still depends on the remote relying-party nonce store. Counts and freshness flags are not risk or confidence percentages. |
| Local rules and request router | Explain operation structure, select collectors, flag observed conditions, and record coverage gaps | Qualitative only; no numeric floor, weighted score, or fallback score. |
| Meta Muse Wonder | Six cited dimension assessments, an optional 0–100 risk indicator, reasons, uncertainty, and an action suggestion | Uses this request's evidence. It does not execute blockchain queries or prove identity from model memory. |
| Node.js SQLite (`node:sqlite`) | Persist reports, sessions, hashed auth credentials, owner mappings and attempt counts on the backend | Hosted reports are scoped to the verified address. The database contains unsigned request data and is not encrypted by the application. |
| TypeScript, Node test runner, Snap CLI | Static checks, automated regression checks, local-chain validation, and Snap bundling | Passing automated checks does not demonstrate that every browser wallet operation reached the Snap. |

## Install and start

Use **Node.js 24.x**; `package.json` declares `^24.0.0`. npm is required. The lockfile installs the local Anvil package, Solidity compiler, frontend/backend dependencies, and Snap build tools; a separate global Foundry installation is not required by the scripts. Dependency installation needs internet access. Use a desktop browser with MetaMask Flask for development Snap installation, and a dedicated test account.

From the project directory:

```sh
node --version
npm --version
npm ci
npm run demo
```

`npm run demo` builds the coverage guide, type-checks, builds the web app and Snap, starts a fresh owned Anvil chain, deploys TEST-USD and the wallet lab contracts, then starts the API, Vite, and Snap file servers. No API key is needed for local wallet tests without model scoring. The included [macOS launcher](%E5%90%AF%E5%8A%A8WalletShield.command) starts the same demo workflow from this directory.

Open **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)** in the browser containing Flask. These are local services:

| Service | Address | Purpose |
| --- | --- | --- |
| Web app | `http://127.0.0.1:5173` | UI and `/api` proxy used by the webpage |
| Backend | `http://127.0.0.1:8787` | Local API and SQLite persistence |
| Snap files | `http://127.0.0.1:8080` | Development Snap manifest and bundle |
| Local Anvil | `http://127.0.0.1:8545` | Test network, chain ID `31337` (`0x7a69`) |

All four services bind to loopback. Webpage `/api` requests from Vite proxy to the single backend on 8787, which owns the budgets and request state. The local Snap calls `http://127.0.0.1:8787/api` directly so its authenticated opaque-origin CORS preflight is handled by Fastify rather than Vite. The backend also validates local Host headers to resist DNS rebinding. Keep the original terminal open. Do not run a second demo while these ports are occupied; the launcher checks them and refuses to reuse an existing service.

Press **Ctrl+C in the launcher terminal** to stop the services that launch owns. Stop separately launched services in their own terminals. Avoid terminating unrelated processes just to free a port. A new demo starts a fresh in-memory local chain and redeploys the fixtures; previous local balances, approvals, positions, and transaction receipts disappear. SQLite history remains, so old reports can describe a chain state that no longer exists. Reprepare assets after restarting.

For separate development terminals:

```sh
# Terminal 1: local chain; keep running
npm run chain

# Terminal 2: deploy both the base token and wallet lab fixtures
npm run deploy:local

# Terminal 2, after deployment: build and launch API + web + Snap servers
npm run build
npm run dev
```

`npm run deploy:lab` checks or deploys the lab fixtures on an already prepared local chain. `npm run dev` does not start or reset the chain, and its API process does not watch source changes: restart it after backend code edits. Individual server commands are `npm run dev:api` (watch mode), `npm run dev:web`, and `npm run dev:snap`; use them only when the combined launcher is not already running those ports. Rebuild the Snap after changing its code, then reload and pair it in Flask.

## Configure Muse, RPC, and optional intelligence

Use [`.env.example`](.env.example) as a reference. **Create or edit the files below locally; do not overwrite an existing configuration blindly.** They live in the ignored `.local/` directory. The application does not automatically load an arbitrary root `.env` file.

Create the directory if necessary:

```sh
mkdir -p .local
```

Put your Meta Model API configuration in `.local/meta.env`:

```dotenv
MODEL_API_KEY=REPLACE_WITH_YOUR_META_MODEL_API_KEY_LOCALLY
ENABLE_META_AI=1
AI_DAILY_LIMIT=100
```

The backend uses a fixed model, `muse-wonder-1.0`, and endpoint, `https://api.meta.ai/v1/responses`. A Meta Model API credential is required; an OpenAI API key is not used for new scoring, and no alternate-provider fallback is configured. `ENABLE_META_AI=0` disables model calls. An empty key causes no model call and no numeric score. Set `AI_DAILY_LIMIT` to an integer from 1 to 1000; invalid or absent values use **100**.

Put RPC and optional tool switches in `.local/rpc.env`:

```dotenv
INFURA_API_KEY=REPLACE_WITH_YOUR_INFURA_API_KEY_LOCALLY
ENABLE_EXTERNAL_LOOKUPS=0
GOPLUS_TOKEN=
ENABLE_FORK_SIMULATION=1
ENABLE_MONITOR=0

# Optional explicit endpoints; replace only with endpoints you trust.
# RPC_1_URL=https://your-trusted-ethereum-rpc
# RPC_11155111_URL=https://your-trusted-sepolia-rpc
# RPC_8453_URL=https://your-trusted-base-rpc
# RPC_42161_URL=https://your-trusted-arbitrum-rpc
```

Leave `INFURA_API_KEY` empty if you only need the owned local chain. A valid Infura key configures Ethereum mainnet (`1`) and Sepolia (`11155111`). An explicit `RPC_<CHAIN_ID>_URL` overrides the derived URL for that network. Other EVM networks require explicit trusted endpoints. URLs must use HTTPS, except HTTP is accepted for loopback; embedded username/password credentials are rejected. Chain 31337 always uses `http://127.0.0.1:8545` and cannot be redirected to another network through configuration.

`ENABLE_EXTERNAL_LOOKUPS=1` enables optional GoPlus requests, with `GOPLUS_TOKEN` if needed. `ENABLE_FORK_SIMULATION=1` enables isolated execution when the configured RPC and historical state support it; without the explicit `1`, fork simulation is off. `ENABLE_MONITOR` does not enable ongoing monitoring in this version: the loaded configuration always disables scheduled post-sign monitoring.

Environment variables take precedence. Meta credentials and AI switches then come from `.local/meta.env`. RPC/tool settings then prefer `.local/rpc.env`, followed by `.local/meta.env`, followed by compatible legacy settings in `.local/ai.env`. Legacy OpenAI credentials are not reused. Configuration is read again for requests, so saving a file usually does not require restarting the backend. Restart if you changed the process environment.

Keep both keys server-side. Do not paste them into chat, source code, JSON scan input, screenshots, or browser fields. The status API returns configuration flags, the model name, and configured chain IDs, not credentials or keyed RPC URLs. `.local/`, `.env`, and other `.env.*` files are ignored by Git; `.env.example` intentionally contains placeholders. The backend also creates `.local/snap.token` for pairing. It is a local authentication secret, not a wallet private key.

### Budget and connectivity

Each configured and enabled scan reserves one **daily attempt** for its first model call, including HTTP failures, timeouts, refusals, and rejected model output. A permitted validation repair reserves another attempt, so one scan can consume up to two attempts. Counts use UTC calendar dates and persist across restarts. `AI_DAILY_LIMIT` defaults to 100 attempts per day for the whole backend; in local mode, the explicit synthetic AI connection test shares this allowance. Hosted mode additionally defaults to 20 attempts per wallet address per day, shared by that address's web and Snap credentials. Both hosted budgets are reserved atomically: hitting either cap charges neither counter and calls no model. These are attempt caps, not dollar budgets or provider spending limits. RPC, Infura, and GoPlus have their own service limits and billing. Forking can require many upstream reads and historical-state access; provider plans and methods can limit it.

A saved key or an `aiConfigured` flag does not demonstrate connectivity. A completed, validated report from the configured provider does. Model scoring can take tens of seconds. Local mode permits one active scan/model test. Hosted mode permits one active scan per address, with a configurable service-wide cap (default three, range 1–8). Scans are limited to eight accepted starts per minute per address in hosted mode, or per local service in local mode. Overload returns an unfinished-check error; it does not fabricate an assessment.

For a deliberate model connection check, developers can run this fixed synthetic sample against an already running **local-mode** service. The route is disabled in hosted mode. It sends synthetic evidence to Meta and consumes one attempt, or up to two if a permitted validation repair is needed; either may incur charges:

```sh
curl -sS -X POST http://127.0.0.1:5173/api/security/ai/test \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Check `ai.status`, `ai.message`, and `ai.result`. HTTP success alone does not mean a score was accepted. On authentication failure, quota exhaustion, 429, timeout, refusal, or validation failure that cannot be repaired within the allowed attempt/budget, evidence remains available and the score stays absent.

## Use the local wallet lab

Local mode shows **Local wallet lab**, **Public networks**, **Check history**, and **Wallet setup**. Hosted mode hides the local lab and starts on Public networks.

1. Open **Wallet setup**, then **Connect wallet**. Select a dedicated test account in MetaMask Flask. The application never asks for a seed phrase or private key.
2. Select **Install and pair Snap** or **Reload and pair Snap**. Approve the development Snap permissions in Flask. Its local ID is `local:http://127.0.0.1:8080`. The Snap verifies the credential with the backend before storing it, and the UI checks a fresh authenticated pairing-health response. Installation alone does not verify every analysis path.
3. Select **Switch to local chain and prepare assets**. Approve adding or switching to **WalletShield Local**, chain `31337`, when prompted. The backend verifies the local Anvil node and fixture code, prepares test ETH and tokens/NFTs, and makes the current account the tester for the local control contract.
4. Return to **Local wallet lab**. Read the asset inventory, choose a category and case, and follow its prerequisite operations. Each prerequisite approval needs separate wallet confirmation. Preparing assets does not silently approve a router, deposit into a vault, stake, or borrow for you.
5. Optionally add your intended purpose or reported context, such as being asked to pay before a withdrawal. These are unverified statements sent to Muse for this exact lab session; unrelated dApp requests do not automatically inherit them. Do not enter personal conversations, passwords, or other secrets.
6. Select **Request a test transaction** or **Request a test signature**. Read the wallet request, WalletShield evidence, Muse result if present, and missing checks. Message insights may appear after you advance to the wallet's signing step. Decide whether to confirm or cancel in MetaMask.
7. Inspect **Wallet test history** for the wallet result and whether an actual Snap report was observed. Inspect **Check history** for the evidence report. The history search matches the displayed time, operation, and risk status. Refresh records when needed.

Start with unlimited approval and cancel after reading the insight. Then compare a limited approval and revocation. Other representative cases include native and token transfers, NFTs, V2/V3-shaped swaps, vault deposit/redemption, lending, staking, liquidity, bridge deposit, claiming, wrapping, mint/burn, control changes, deployment, batch calls, SIWE, Permit, Permit2, and typed orders.

Test assets are local fixtures with **no real value**. Preparation tops up to at least 10 test ETH, 5,000 TEST-USD, and 5,000 each of LAB-USD, LAB-Q and LAB-BLOCK, preserving higher existing balances. It prepares one current ERC-721 test NFT and at least ten each of ERC-1155 IDs 1 and 2. WLAB comes from the wrapping operation. Mainnet ETH or tokens do not appear by switching to chain 31337. A local balance does not become a real asset by switching to another chain. Optional token import only changes wallet display; the webpage inventory reads actual local balances. NFTs and protocol positions may require their corresponding wallet operations to obtain or replenish them.

The lab's router uses fixed local pricing; its vault uses a simplified share model; lending does not implement a full liquidation market; bridge tests only record local behavior; control-upgrade fixtures do not audit a new implementation. LAB-BLOCK deliberately restricts selling so the evidence path can be exercised. None of this establishes the identity, liquidity, solvency, or behavior of a real protocol.

The webpage never uploads, logs, persists, or submits a **generated local test signature**. It checks the returned format in the browser and discards the value. The unsigned message being analyzed is still sent to the local backend, and selected message content can enter the model evidence packet.

A wallet error or cancellation can occur before an insight. If a session says no Snap report was observed, do not count it as a completed Snap check. A node-level test or an API report also cannot establish browser/Snap delivery.

## Use real networks without confusing them with local assets

**Public networks** is a separate page for public-network connection, read-only checks and a neutral message that verifies actual Snap delivery. It uses the same selected EIP-1193 wallet provider and account as the local lab; there is no separate kind of “real wallet.” What changes is the network and the assets recorded on that network. The wallet selector uses EIP-6963 discovery when available so that ordinary MetaMask and Flask do not accidentally compete for one injected provider. Select the intended extension; local development Snap installation requires Flask.

1. Configure a trusted backend RPC as described above. Start with **Sepolia (`11155111`)** and a dedicated test account. Mainnet involves real value; this Flask development environment is not suitable for storing real assets.
2. Open **Public networks** and connect the intended wallet. In local mode you can check RPC connectivity without connecting an account; that omits the balance/code query. Hosted mode requires the wallet identity login described below before account probes, pairing and report access.
3. Choose the backend data network, then select **Check RPC and account state**. The backend verifies the actual RPC chain ID and reads a block, block time, and—if an account is connected—its native balance and code at that block. Delegated code is distinguished from an ordinary no-code account. Results can be reused for up to 15 seconds. Only server-configured endpoints are used; keys and full RPC URLs are not returned to the browser.
4. Optionally select **Switch wallet to this network**. This explicitly requests `wallet_switchEthereumChain` for a network already added in the wallet. If it is absent, add it in the wallet using trusted official information and retry. The page does not expose a backend Infura URL for wallet setup. Choosing the data network alone does not switch your wallet; compare both network labels.
5. Install or reload/pair the configured Snap. The backend health handshake must pass for the current bound account. Select **Test the wallet signing insight** to request a unique ordinary `personal_sign` message from the actual wallet. This needs no test coins or gas. Read its stated purpose and the wallet's WalletShield insight, then decide whether to sign or cancel. The page matches the exact unique message to a server-recorded `paired-snap` report; a returned signature alone does not pass this check. Its generated signature is discarded in the browser, while the unsigned message and report are stored on the backend. When enabled, this actual Snap analysis calls Muse and consumes model budget.
6. For transfers, approvals, Permit, swaps and other supported requests, use the corresponding external dApp and inspect each wallet insight separately. Local mode requires its servers to remain running. Wallet connection, pairing health, request delivery and a completed assessment are separate facts to verify.

The network page does not construct public-network transfers, approvals or funding transactions. Its **RPC check** does not call Muse or generate a score; its separately labeled **message insight check** can call Muse. The neutral message is not a login, Permit, order or spending authorization. Hosted identity login is a third, explicitly labeled operation. A successful chain/balance check establishes connectivity and observed state; it does not establish account, contract, recipient, dApp or transaction safety. Backend RPC access and the wallet's own RPC configuration are separate. Local TEST-USD/LAB tokens and NFTs remain on chain 31337, even if the same account address is used on Sepolia or mainnet.

The default build uses Flask, local pairing and `http://127.0.0.1:8787/api/security/scan`. A hosted build uses its compiled HTTPS companion origin and npm Snap ID. Packaging a hosted build does not publish the package or obtain MetaMask distribution eligibility. Connection/network changes are not general Snap interception hooks.

## Configure and operate authenticated hosted mode

Hosted mode is implemented as an opt-in service configuration and isolated release artifact. It has **not been deployed, published to npm, registered, or independently approved by this project workflow**. Supply a real domain, TLS, an npm package you own and a public source repository before preparing a release. The default local launcher remains a Flask development environment.

Create or edit `.local/service.env` using [`deploy/service.env.example`](deploy/service.env.example) as a reference. This file contains deployment settings, not API keys:

```dotenv
WALLETSHIELD_SERVICE_MODE=hosted
WALLETSHIELD_APP_ORIGIN=https://your-walletshield-domain.example
WALLETSHIELD_SNAP_PACKAGE=@your-owned-npm-scope/walletshield-snap
WALLETSHIELD_REPOSITORY_URL=https://github.com/your-org/your-public-repository
WALLETSHIELD_WALLET_DAILY_LIMIT=20
WALLETSHIELD_MAX_SCANS=3
```

Replace every placeholder with values you control. Hosted runtime generation rejects loopback/non-HTTPS origins and the development package name. Muse/RPC credentials remain in backend-only `.local/meta.env` / `.local/rpc.env` or the process environment. The service launcher loads only a whitelist of deployment settings from `.local/service.env`, with explicit process environment values taking precedence.

```sh
npm run build:hosted
npm run package:hosted
npm run start:hosted
```

`build:hosted` generates nonsecret runtime settings shared by the frontend and Snap, then runs the build. `package:hosted` requires the same settings and successful-build source/bundle fingerprints, and creates **`dist/release-snap/`**, a separate npm package with the owned package name, matching manifest, bundle, icon and release README. Changed source or stale bundles require rebuilding first. It leaves the development Snap package private. It publishes nothing. Inspect its exact package contents locally:

```sh
cd dist/release-snap
npm pack --dry-run --ignore-scripts
```

Run service commands from the project directory, not from the release artifact. `start:hosted` serves `dist/web` and the API on `127.0.0.1:8787`; it does not start Anvil or the local Snap file server. Place an HTTPS reverse proxy in front, preserving the configured Host. [`deploy/nginx.conf.example`](deploy/nginx.conf.example) supplies a starting configuration; replace its domain/certificate paths and ensure its public origin exactly matches the build and service configuration. The proxy's read timeout accommodates wallet analysis. Press Ctrl+C in the service terminal to stop that process. Mode, domain or package changes require rebuilding both frontend and Snap; do not mix local and hosted bundles. To return to default local development, clear exported hosted deployment variables and run `npm run demo`, which generates local runtime settings again.

For hosted users:

1. Connect the intended account and select **Verify current wallet identity** (or **Sign to verify this wallet** in setup). Review the exact login message, application domain, URI, account, chain, nonce and expiry before confirming. This is account-control proof for authentication, not permission to spend assets.
2. The server issues a one-use challenge valid for five minutes and verifies an EOA signature over its stored message. It does not use an unchecked ERC-1271 fallback; contract-wallet authentication is currently unsupported. Successful login creates an eight-hour web bearer held only in browser memory. Refreshing, changing provider/account or disconnecting clears the in-memory identity; reverify to access your records again.
3. Install and pair the Snap. The server issues a **different**, address-bound Snap bearer valid for 30 days. It sends this Snap credential through pairing; the web bearer is not handed to the Snap. The Snap verifies backend acceptance before storing it, and health checks verify the bound address. Pairing expiration/revocation requires login and pairing again.
4. Scans must come from the authenticated address. History, individual reports and evidence are scoped by server-owned address mappings; knowing a report ID or forging an Origin does not grant access. The UI labels Snap captures separately from webpage analysis. Per-wallet budgets are shared across that address's web/Snap sessions.
5. Select **Sign out and revoke Snap pairing** to revoke that address's Snap credentials and log out the current web session. Other browser sessions for the same address can remain valid until their own logout/expiry. Switching accounts clears the browser session but does not itself revoke previously issued server credentials.

Hosted mode disables local lab/funding, old approval/workflow/demo routes, monitor compatibility routes, coverage downloads and the synthetic AI test route. Authentication rate limits and a pending-challenge cap bound login requests; a valid web bearer is required to issue Snap credentials. Both web/Snap token expiry, revocation, owner mappings and daily attempt counts persist in backend SQLite, with only token hashes stored there. The HTTPS service and npm package still need real wallet/browser acceptance tests and the applicable MetaMask distribution process. Do not interpret preparing the artifact as public deployment or independent security certification.

## Read a risk report

New numeric scores come **only from Muse**, after response validation. Muse independently supplies an integer from 0 to 100 or abstains with `null`. The number is an **uncalibrated risk indicator, not a probability of loss**, a percentage chance of fraud, a guarantee, or a certified verdict.

There are no fixed score bands, minimum scores, additive rule points, fixed weights, or model-failure fallback scores. The model's textual assessment is separate from its number. Rules remain separate qualitative signals. The combined warning can retain a rule-based high-risk signal even if Muse reaches a different conclusion; it is not calculated by thresholding the number. Collectors can still use explicit qualitative heuristics, such as a low simulated round-trip return or an observed high sell tax. These are labeled evidence signals; they do not assign points or determine Muse’s number. Historical rule scores may still exist in older saved reports and are labeled historical; they are not the scoring policy for new security scans.

Every accepted model result must cover these six dimensions exactly once, with reasons citing existing evidence IDs. A low/review/high dimension needs at least one actual non-unknown observation beyond the tool plan:

| Dimension | What Muse considers |
| --- | --- |
| `authority` | Who receives authority; assets, amount, expiry, revocation, and future use scope |
| `exposure` | Amount relative to the visible balance of the same asset, fee budget, and possible loss impact |
| `execution` | Observed calls, asset changes, extra spending, and behavior actually supported by simulation |
| `identity` | Source, target, protocol, account, and network consistency; available reputation observations |
| `protocol` | Slippage, exits, liquidation, proxy/control changes, and other mechanisms actually evidenced |
| `deception` | Reported inducements, blind signing, payment-before-withdrawal, and promised returns |

Dimensions are qualitative (`low`, `review`, `high`, `unknown`, or `not_applicable`), not separately numbered or averaged. Each result also includes evidence confidence (`limited`, `moderate`, or `strong`), cited reasons, missing data, a suggested action, and a constrained honeypot field. Evidence confidence is the support available in the packet, not a calibrated model-confidence probability.

The validator rejects nonexistent citations, missing/duplicate dimensions, unsupported certainty, unsupported honeypot statements, and inconsistent abstention. With unresolved checks, stale/missing/future observation timestamps or conflicting same-height block hashes, it rejects a `low` overall assessment or `strong` evidence confidence. All-unknown/not-applicable dimensions cannot support a number. Missing reputation alone is not proof of malicious identity. On failure, pending state, disabled/unconfigured AI, exhausted budget, or abstention, **no numeric score is displayed**.

Schema and semantic citation checks constrain the format and selected assertions; they are not proof that every English sentence or model judgment is correct. Users must still compare explanations with the cited observations and remaining gaps.

A recognized output-validation failure can trigger **one** additional Muse call, only after a separate atomic daily-budget reservation. Both calls share a 50-second model budget; the repair has at most 25 seconds and is not started with less than five seconds remaining. It receives the same evidence, controlled validation feedback, and the previous output explicitly labeled as untrusted. HTTP/authentication/quota errors, network failures, timeouts, refusals and incomplete response envelopes do not retry. A valid abstention does not retry. The same validators apply to the repaired result; the backend never forces a number. Successful repaired results identify the repair and sum usage across both completed responses when both provide valid usage data. Either attempt can consume provider quota even when no score is accepted.

The derived `quality` inventory is stored with new reports and sent in the model packet. It lists pass/warning/risk/unknown counts, observed/unknown counts per source, each available network/block/hash/timestamp, mixed upstream-block chains, conflicting block hashes at the same chain/height, capture channel and wallet-credential attribution. It flags observations over five minutes older than report creation, missing/invalid timestamps and timestamps more than 30 seconds ahead. These are evidence diagnostics, not a risk score, detection coverage or confidence percentage. Observation time is when the collector recorded a result; it does not establish upstream data freshness. Reads are pinned by block number rather than atomically by block hash; recorded hashes provide provenance and do not rule out reorganizations or inconsistent provider responses. A same-height hash conflict needs a fresh independent check and prevents an overall low assessment or strong evidence confidence. Fork execution remains a separate state space from public RPC blocks.

`pass` means the particular observation succeeded; it does not certify an address or operation. `unknown` means an unfinished, unsupported, or missing check. A successful transfer does not prove a legitimate recipient. A finite allowance can still authorize malicious spending. Successful `eth_call`, a matched nonce, or one successful sell does not guarantee future safety.

For EIP-712 messages, a field is evidence of signed intent only when it belongs to the declared type graph reachable from the primary type. Extra JSON properties outside that graph are not signed fields and cannot by themselves establish a signed permission, owner mismatch, financial exposure or other risk. Permit2 nonce/allowance checks take the owner from the actual signing account, not an extra `owner` property supplied in the message. Recognizing the canonical type structure still does not authenticate the verifying contract.

Supported SIWE-style login inspection now checks the EIP-4361 envelope: header/account, required URI/version 1/chain/nonce/issued-at fields and ordering, nonce format and length, expiry/not-before conditions, domain/URI/source differences and up to 16 normalized resource origins. It preserves a separate `login_nonce` unknown because a pre-sign tool cannot verify the remote service’s nonce issuance, uniqueness or consumption store. Correct syntax does not establish website honesty, valid signature or successful login. The hosted service’s own exact-message authentication is a separate flow with its own nonce store.

In standard Permit2, `expiration = 0` is a marker for the timestamp of the block in which the authorization is submitted; it can be consumed within that block. It is not proof that the permission already expired before signing, and it is not automatic revocation. A nonzero expiration already in the past also does not make a signature harmless: submission may still update allowance or nonce state. The report preserves the distinction and the uncertainty about whether a candidate contract actually implements standard Permit2 semantics.

The Snap requests `endowment:ethereum-provider` and attempts a short, read-only `eth_chainId` observation during a signature insight. It stores the result as a timestamped `signature.providerContext` snapshot, separate from the hook's request-chain field and the message's signed domain. The signature hook still provides no request-bound chain, so Snap requests preserve `chainId: 0`; no observed provider chain is silently substituted for the domain used by typed-signature contract reads. For valid typed data, evidence can compare the domain and provider snapshot, but a difference is a contextual warning and a match is not proof of the initiating dApp's signing network. Failure or timeout preserves missing context. `signature.from` supplies the hook's requested signer; the Snap does not request account-selection permission or a new signature merely to inspect it.

Pre-sign evidence does not contain a generated signature to recover or submit. Matching a Permit nonce/domain, reading signer code or an ERC-1271-related account state is not verification of a valid signature or future consumption. Standard authority can also leave the ultimate recipient or actual transferred amount to a spender within an encoded limit; a matching structure does not commit every later transaction detail.

## Evidence collected for each operation

All applicable rows below can also receive trusted RPC network/block/balance/code facts, partial contract-control observations, optional GoPlus observations, rule signals, explicit limits, and then Muse analysis. Only tools actually available and successful contribute observations; the report lists failures and gaps. The authoritative profile definitions are in [`src/security/coverage.ts`](src/security/coverage.ts).

| Profile / operation | Parameters and evidence extracted before Muse | Scope and limits |
| --- | --- | --- |
| Native transfer / contract recipient | Sender, target, value, chain, origin and fees; pinned native balance/code, confirmed nonce, supplied fee versus observed base fee, optional one-hop delegation code and fork balance/gas/call summary | Recipient identity and payment purpose unverified; contract receive/fallback can run even with empty calldata. |
| ERC-20 transfer | Token, recipient, raw amount; readable symbol, decimals and balance; optional observed deltas and extra spending | Names can be forged; no full coverage of rebasing, fee-on-transfer, hidden assets, or valuation. |
| NFT / delegated / batch NFT transfer | Owner, recipient, token ID or IDs/amounts; ERC-165 declarations, owner/approval or ERC-1155 balance, selected operator state | At most 16 IDs per asset; declarations can lie; collection authenticity, prices, callbacks, and nonstandard semantics incomplete. |
| Single approval, revocation, on-chain Permit | Spender, amount or token ID, large-allowance signal, some owner/deadline fields; token standard, ERC-20 allowance and balance | ERC-20 and ERC-721 `approve` share an encoding; NFT ID zero is not automatically revocation. Not all Permit variants or future spending covered. |
| NFT operator approval / revocation | Collection, operator, boolean and readable existing operator state; control/reputation/fork evidence | No complete enumeration of present/future holdings or proof that the operator will act honestly. |
| On-chain Permit2-shaped allowance | Token, spender, `uint160` amount, expiration and available token facts | Shape does not prove official Permit2 identity; three-party allowance/domain verification incomplete on this path. |
| V2-shaped swap | Path, input, minimum output, recipient, deadline; when supported, fork buy → approve acquired token → reverse sell, returned amount/gas, deltas and optional token intelligence | Restricted route shapes and same recipient; failed sale has multiple causes; round-trip loss includes fees/price impact and is not a pure tax rate. |
| V3-shaped swap | Tokens or decoded path, fee, recipient, input/output limits, price limit and some deadlines; generic fork facts | No V3-specific consecutive buy/sell test, complete pool/tick/quote verification, or MEV model. |
| ERC-4626-shaped vault | Action, assets/shares, receiver/owner; `asset`, `totalAssets`, `totalSupply`, action preview/max; underlying balance/decimals/allowance and share units where readable | Separate underlying and share units; interface output does not prove identity, valuation, solvency, or future redemption. |
| Lending / collateral | Asset, amount, beneficiary, rate mode or collateral toggle; Aave-shaped collateral/debt/available borrow/LTV/threshold/health factor and reserve configuration | Current state only; no complete post-operation liquidation or price/oracle stress model. |
| Staking / unstaking / rewards | Candidate method, amount, receiver; controls and generic fork observations | Lock period, slashing, reward source/formula, and future withdrawal not automatically verified. |
| Liquidity changes | Tokens, amounts/minima or LP quantity, recipient, deadline; generic observed deltas | No complete pool reserves/identity, LP valuation, impermanent-loss, or exit model. |
| Bridge deposit | Some OP-shaped methods, local/remote token, amount/value, recipient, local controls and fork effects | Target chain/message proof, validators/custody and destination arrival not verified. |
| Claim / airdrop | Common Merkle-style index, account, amount, proof item count, code/controls and generic fork effects | No complete root/proof/entitlement or project authentication; proof bytes are not sent to Muse in full. |
| Wrapping / no-argument deposit | `deposit()` candidate, value, target, code/controls and deltas | Same method can be unrelated; constant redemption not verified. Generic `withdraw(uint256)` currently maps to the staking candidate. |
| Mint / burn | Candidate method, recipient, amount-or-ID, token and value/deltas | Amount and NFT ID can remain ambiguous; issuance rights, price and all burn consequences incomplete. |
| Control / role / upgrade | New owner/controller/implementation or role/account; code hash, ERC-1967 slots, readable owner/paused, new target code and generic fork effects | No full implementation audit, storage-layout compatibility, dynamic delegation or hidden-admin analysis. Empty slots do not prove immutability. |
| Deployment | Sender, value, initialization selector/byte count and fee summary; generic fork effects | No full initialization bytecode/source/constructor audit, verified build correspondence or CREATE2 identity proof. |
| Batch / aggregator | Parent request, some wrapper deadline/call count/selectors; bounded fork asset/call summary | No full recursive semantic decoding of every `multicall`/`execute`, dynamic delegatecall or hidden asset. |
| SIWE-like login | Supported header/account, URI origin, version/order, nonce format/length, declared chain, issued/expiry/not-before times and up to 16 resource origins; source/account/domain/URI and local-clock checks | Remote nonce issuance/use, audience, generated signature validity and actual server session remain unverified. |
| Personal message | Method, account, origin, up to 1,600 preview characters; user context and available intelligence | Arbitrary server/contract interpretation unknown; preview can be truncated and wallet chain unavailable. |
| Raw `eth_sign` | Method, account, declared network/source and blind-signing signal; available context | Backend analysis only; Flask/SDK may not provide an automatic hook. Hash cannot be inverted into its original intent. No raw-sign lab button. |
| Permit / NFT Permit signature | EIP-712 domain/types/digest; canonical EIP-2612 owner nonce/domain; canonical ERC-4494 token-ID nonce, interface declaration, NFT owner/current approval and operator state; signer/verifier code and deadline where readable | No cryptographic signature or consumption execution; DAI/custom variants incomplete; domain and separate provider snapshot do not establish request-bound network or protocol authenticity. |
| Permit2 signature | Canonical common types, token/amount/expiry/spender/deadline; domain, per-token three-party allowance/nonce or nonce bitmap, signer/verifier code, reference address/domain comparison, with owner taken from signer | Zero expiration has submission-block semantics. At most 16 allowance entries; witness/custom variants and code authentication incomplete. Reference-address/interface/nonce matches do not prove identity or safe future spending. |
| Typed order / other EIP-712 | Encoding digest, primary type/domain/verifier; bounded recognized committed financial fields, available DOMAIN_SEPARATOR comparison and controls | No complete Seaport-like consideration, fulfillment, cancellation or custom permission semantics. |
| Wallet permission / session | Method, source, whitelisted addresses/scope/limits/expiry and bounded nested summary | **Manual submission required**; no universal Snap hook, no execution or proof that a validator enforces limits; no secret session-key collection. |
| UserOperation / smart account | Sender, entry point, paymaster, factory, nonce, calldata selector/size and recognized limits/value | **Manual submission required**; no bundler/account-module/paymaster simulation or complete subcall semantics. |
| Add/switch network / watch asset | Method, chain ID/name and recognized fields; supplied RPC/explorer URLs reduced to origins | **Manual submission required for analysis**; backend does not connect to supplied arbitrary URLs. New network/provider authenticity unverified. |
| Read-only wallet RPC | Method and bounded recognized account/address/network fields; source/intelligence where available | **Manual submission required**; original RPC is not executed; privacy disclosure scope incomplete. Read-only does not mean private. |
| Unknown contract / wallet RPC | Target/value/selector/byte size or method and bounded whitelisted parameters; generic applicable observations | Transaction may arrive automatically; arbitrary wallet RPC requires manual input. No complete meaning is inferred from an unknown method. |

Useful bounds: explicit asset reads are limited to eight assets; NFT per-ID reads to 16 IDs per asset; generic RPC summaries to five nesting levels, 16 array items and 40 recognized fields. Simulation discovers assets from bounded recognized transfer logs plus known explicit assets, with up to 32 discovered assets and a bounded call tree. Truncation and unsupported fields remain limits, not successful coverage. Raw numbers are smallest-unit quantities unless their asset decimals are known; they are not dollar losses. Shares and underlying assets must not be compared as the same unit.

Observed EIP-7702 delegation designators can trigger one same-block target-code/hash read for the transaction target or message signer. This does not audit the delegated implementation, recurse through delegation, validate an authorization list or verify ERC-1271 behavior. Confirmed nonce and current base-fee comparisons do not establish pending replacement policy, future fee sufficiency or inclusion.

Transactions containing unsupported EIP-7702 authorization/type fields, blob-related fields, nonempty access lists, unknown transaction types or malformed execution quantities are marked incomplete. The simulator does not silently remove those fields and present an ordinary replacement transaction as verification.

## Covered, partial, and uncovered behavior

**Implemented representative paths:** native and token/NFT transfers, common approval/revocation forms, selected V2 and V3 parameters, EIP-712 encoding and selected Permit nonce/domain checks, partial token/control state, optional intelligence, generic isolated transaction simulation, vault previews and Aave-shaped current account data. Even these paths have the row-specific limits above.

**Partial protocol understanding:** staking, liquidity, borrowing consequences, real swap routes, bridging, claims, mint/burn, deployments, upgrades, aggregators, orders, and arbitrary messages. Real protocol identity, future prices and exit conditions are not established by a familiar ABI or a locally successful call. User-reported fraud context can expose a warning while still not proving a platform's identity or honesty.

**Not currently covered end to end:** general wallet permission/session interception, ERC-4337 bundler/account execution, full EIP-7702 authorization/delegation validation, all Permit/NFT/witness/order variations, all protocol methods, actual destination-chain delivery, and every hidden/nonstandard asset movement. Bitcoin, Solana and other non-EVM networks, other wallet integrations, device malware, leaked keys/seed phrases, exchange internals and off-chain investment schemes have no complete integration here. Scheduled post-sign monitoring and forced blocking are not product capabilities.

Five analysis profiles have no representative executable wallet-lab case: raw `eth_sign`, permission/session requests, UserOperations, network configuration, and read-only RPC. Some ordinary connection/network/display actions are used by the app, but this does not mean those actions are automatically intercepted by the Snap. The 25 represented profiles also do not cover every method within each profile.

## What can be extended, and what needs more than RPC?

The 30 profiles describe attempted analysis paths. They are not 30 complete protocol integrations. New adapters should retain exact units, provenance, missing checks and behavior tests rather than turn a familiar name into a verified identity.

| Extension category | Feasible work / required input | Boundary after the improvement |
| --- | --- | --- |
| Implementable from configured RPC and specific protocol adapters | More NFT/on-chain Permit allowance state, wrapper exits, verified method-specific positions, recursive known batches, post-operation lending scenarios, more supported swap routes and two-chain bridge-state reads | Needs explicit ABI/version and bounded execution tests. RPC reads alone do not authenticate a deployment or prove destination arrival, future solvency or arbitrary contract semantics. |
| Requires additional trusted quote, price or market data | Same-asset valuation, reliable expected output/slippage, pool liquidity, LP/share valuation, liquidation stress assumptions and multiple trade sizes | Needs trustworthy time/network/asset-specific feeds or quoters. Prices and future ordering can change; simulated outcomes remain scenarios. |
| Requires verified source, deployment or reputation data | Authentic protocol/token/collection identities, audited implementation/control graphs, verified bytecode/build correspondence, known phishing and broader address history | Needs trusted registries, verified source/builds and external intelligence with explicit age/coverage. A non-hit, name or empty proxy slot is not a safety certificate. |
| Requires wallet/dApp cooperation or user context | Automatic permission/session/UserOperation entry, original data behind a raw hash, relying-party nonce/session verification, expected recipient/purpose and reported inducements | A model prompt cannot observe a request or nonce store it never receives. User claims remain unverified unless independently corroborated. |
| Requires off-chain services or independent investigation | Business/domain identity, exchange internal balances, claimed investment returns, malicious support conversations, device malware or past key compromise | On-chain state cannot establish all off-chain facts. Additional collection requires separate user consent, privacy controls and an appropriate integration. |
| Not provable before signing from one snapshot | Guaranteed future price/liquidity, inclusion/order/MEV, later blacklist/upgrade decisions, future bridge/validator behavior, universal absence of hidden assets or arbitrary-code exploits | More data and scenario tests can reduce uncertainty, but cannot prove events that have not happened or universal safety. A pre-sign AI score remains an indicator. |

These are future extensions, not enabled features. Forced blocking and continuous post-sign monitoring remain outside this version's advisory behavior. Detection quality would need independent labeled data, held-out evaluation and false-positive/false-negative measurement; the 54 local cases supply no calibration claim.

## Manual and developer API use

Local mode provides the wallet lab and report history. For requests that have no automatic Snap entry, a developer can submit an **unsigned** request manually to `POST /api/security/scan` from the local origin. This analyzes a summary; it does not execute the requested wallet RPC. There is currently no general manual JSON editor in the primary UI.

For example, this scans a synthetic permission request without granting it. If Muse is enabled it sends evidence and consumes up to two separately reserved attempts, including a permitted validation repair:

```sh
curl -sS -X POST http://127.0.0.1:5173/api/security/scan \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Content-Type: application/json' \
  --data '{"kind":"permission","chainId":31337,"origin":"http://127.0.0.1:5173","method":"wallet_requestPermissions","params":[{"eth_accounts":{}}]}'
```

Request schemas and limits are in [`src/security/types.ts`](src/security/types.ts). Transaction quantities use hexadecimal strings; message requests use `kind: "signature"`; `chainId: 0` means the active wallet chain was not obtained for a signature. A typed message's declared chain may guide a lookup but does not establish the wallet's current network.

| Endpoint | Use |
| --- | --- |
| `GET /api/health` | Local API health/version |
| `GET /api/security/status` | Model/tool flags and configured chain IDs; no credentials |
| `GET /api/networks` | Public-network names, IDs and configuration flags; no RPC URLs or keys |
| `POST /api/networks/check` | Read-only chain/block and optional account balance/code probe using configured RPC; no Muse call or transaction |
| `POST /api/security/pair` | Local webpage obtains its local pairing token; hosted authenticated web identity receives a distinct address-bound Snap token |
| `GET /api/security/pair/status` | Authenticated Snap pairing/backend health; accepts the paired Snap's null origin |
| `POST /api/security/scan` | Validate and analyze one unsigned request |
| `POST /api/security/ai/test` | Deliberate fixed synthetic model connectivity check |
| `GET /api/security/records` and `GET /api/security/records/:id` | Stored security reports; list returns the most recent 100 |
| `GET /api/security/records/:id/evidence` | The bounded evidence packet supplied to the model |
| `GET /api/lab/status` | Current cases/profile counts, fixture readiness and daily model budget |
| `GET /api/lab/inventory?address=…` | Local asset and position inventory |
| `POST /api/lab/prepare` | Prepare only local Anvil test assets |
| `POST /api/lab/begin`, session read/result routes | Local wallet test lifecycle; not a substitute for a Snap report |
| `POST /api/wallet-auth/challenge` and `POST /api/wallet-auth/verify` | Hosted-only exact-message EOA login challenge and verification |
| `GET /api/wallet-auth/status` | Hosted bearer identity and expiry; no raw credential returned |
| `POST /api/wallet-auth/logout` and `POST /api/wallet-auth/revoke` | Hosted current-session logout and web-authorized revocation of this address's Snap tokens |

Local browser writes require the local workbench origin, and local Snap scans require its pairing bearer. Keep this local mode on loopback. Hosted mode requires authenticated web or wallet-bound Snap credentials for scans, pairing and history; Origin alone never establishes identity. Hosted transaction/message senders must match the bound address. Authenticated web users can manually submit permission/UserOperation/RPC summaries for advisory analysis; these are owner-scoped manual reports and do not execute the requested RPC or provide a new automatic Snap hook. Snap credentials are limited to transaction/message scans. Older demo, rule-engine, workflow, lab and monitor compatibility routes remain in the repository but are disabled by the hosted service. They are not an enabled post-sign monitoring product.

## Privacy and data flow

- **Wallet → configured backend:** the unsigned request, chain/source metadata, decoded operation and any supplied context. The backend stores unsigned calldata or message payloads, evidence and model output in SQLite. Local mode stores this on your computer; hosted mode stores it on the operator's server. Hosted owner checks isolate addresses, but the application does not encrypt the database or implement an automatic retention/deletion policy.
- **Backend → trusted RPC:** public account/contract addresses, call parameters, balances/code/storage/interface queries, and the state reads needed by an optional fork. No real upstream transaction is broadcast by an evidence collector. Separately, the webpage can explicitly ask the wallet to send a selected transaction.
- **Backend → GoPlus, only when enabled:** selected addresses/tokens on confirmed supported chains and the normalized public source origin for website checks. Local development origins are not treated as public website reputation results.
- **Backend → Meta, only when enabled and budgeted:** a whitelisted request summary, chain, normalized source origin, fee fields, user purpose/context, decoded fields, evidence and missing checks. A validation repair resends that same evidence with controlled feedback and at most 20,000 characters of the rejected previous output labeled untrusted. URL paths/queries and credentials are removed from the model origin field. Full calldata and full history are not sent as model input; message previews, decoded financial fields and free-text context can still contain private information.
- **Generated lab/neutral insight-test signature:** checked and discarded in the browser; not uploaded or consumed. The Snap handles the unsigned signing request. This is distinct from the test message stored for analysis.
- **Hosted login signature:** intentionally sent to the backend to verify the exact short-lived challenge. It proves account control for report access and pairing, not asset authority. The signature itself is not persisted. Web bearer credentials stay in browser memory; backend bearer records store hashes. A different, address-bound Snap token is stored by the Snap.

The capture channel records which authenticated credential was used; it is not cryptographic attestation of wallet/Snap code execution. Large bounded reports retain full evidence in the backend while the Snap prioritizes up to 24 evidence items for readability.

The Meta request uses `store: false`; that request option is not an assertion about every provider-side log or retention practice. The software does not request a seed phrase, private key or password. Risk analysis accepts unsigned requests; the separate hosted authentication flow explicitly requests a login signature as described above. Do not insert secrets into unsigned messages, context, or developer API input: field filtering is not a universal secret detector. Meta/RPC keys stay server-side and never enter model evidence or frontend status. The local pairing secret or hosted Snap bearer is transferred only through the pairing flow, separate from the web bearer.

`.local/walletshield.sqlite` holds history, sessions and model-attempt counts, plus hosted authentication challenges, hashed credentials, owner mappings and rate/budget state; SQLite WAL files may accompany it. `.local/deployment.json`, `.local/lab-deployment.json` and compiled fixture artifacts describe the local deployment; `.local/snap.token` holds the local-mode pairing secret. Back up backend data only to a location you trust. Preserve these files across ordinary restarts if you need history. Deleting or replacing them can remove history, reset local counts or require pairing again; a fresh local chain is a separate reset from database history.

## Verification

Run the appropriate checks from this directory:

```sh
npm test
npm run build
npm run test:security
```

| Command | What it verifies / changes |
| --- | --- |
| `npm test` | Unit/API regression checks including decoding, model schema/citation checks, privacy packet boundaries, configuration, routing, history, wallet/Snap request shape and session matching; uses fixtures/mocks and does not require a paid model call. |
| `npm run typecheck` | Main project and Snap TypeScript checks. |
| `npm run build` | Regenerates the coverage guide, type-checks, builds the frontend and Snap bundle/manifest. |
| `npm run test:security` | Starts its own temporary Anvil on an independent port, validates simulation behavior, and shuts it down; does not use the current browser test wallet chain or make paid model calls. |
| `npm run test:chain` | Validates the original local approval/funding workflow against the running chain 31337; requires local deployment, makes local test writes, then restores its snapshot. |
| `npm run test:lab` | Executes the current 54-case catalog using a local node account, verifies transaction receipts and signature recovery, and writes `docs/wallet-lab-acceptance.json`; snapshots/restores the running local chain. |
| `npm run docs:coverage` | Regenerates the detailed coverage guide from source definitions. |
| `node --import tsx --test tests/wallet-auth.test.ts tests/hosted-integration.test.ts` | Offline synthetic EOA login, expiry/replay/revocation, hashed credentials, owner isolation, hosted route restrictions, principal binding, atomic budgets and concurrent-wallet limits. No real wallet/RPC/model calls. |

For chain checks, start `npm run demo` first and run them in another terminal. Run `test:chain` and `test:lab` while the browser is idle: restoring a snapshot can undo concurrent local actions. The lab's 43 transactions and 11 node-produced signatures validate local request construction and behavior, **not** the MetaMask UI or actual Snap hook delivery. Local test acceptance reports in `docs/` are dated observations, not proof of present remote connectivity or a detection benchmark.

An optional real-model audit is available for developers:

```sh
node --import tsx scripts/test-ai-audit.ts
```

It requires the running local app, deployed lab and enabled Muse credentials, and makes real Meta calls for three fixed local requests. It retains API quota usage, writes its audit result, and restores its local-chain snapshot. It does not initiate a browser wallet request or validate Snap delivery. Run it deliberately, while the lab is idle, and do not mistake synthetic acceptance for broad model accuracy.

To verify the complete user-facing path, use Flask manually: reload/pair the built Snap, prepare local assets, initiate a case, inspect the in-wallet insight, choose confirm/cancel, and confirm the associated session shows a real Snap report and the appropriate wallet outcome. Check both successful and failed/unknown paths. A model failure should leave evidence and gaps with no score.

## Troubleshooting and deployment status

| Symptom | Check |
| --- | --- |
| Launcher reports an occupied port | Stop your earlier WalletShield terminal session; inspect ownership before stopping any unrelated process. |
| Page cannot connect a wallet | Open the loopback URL in the desktop browser with Flask; check the selected account and extension access. The app's embedded browser may not have the extension. |
| Snap installation or pairing fails | Installation fetches files from port 8080; the local Snap then connects directly to API port 8787. A message starting “Snap installed;” identifies a failed credential, backend-connection or verification stage after installation. Refresh the page and reload/pair after rebuilding; an older installed bundle may still point to Vite port 5173, whose default CORS middleware consumes opaque-origin preflight. |
| No Snap report appears | Check whether the wallet rejected/failed before the hook, whether the Snap is enabled and paired, and whether the request has a supported hook. An API-only scan is not an automatic wallet check. |
| Test contracts or assets are unavailable | Keep Anvil running; run `npm run deploy:local` (or `deploy:lab` when the base token is already valid), refresh and prepare assets again. A restarted chain invalidates prior state. |
| Token is absent in MetaMask | Read the webpage's local on-chain inventory; optional ERC-20 import adds display metadata. Check chain 31337 and the exact contract. |
| Vault, lending, staking, swap or unwrap case fails | Follow the case's explicit prerequisite approvals and deposits; preparation does not create those positions automatically. |
| No AI score | Inspect `ai.status` and `ai.message`: missing/disabled key, daily cap, HTTP failure, timeout, refusal, validation failure or abstention all legitimately produce no number. |
| RPC configured but chain checks unknown | Verify endpoint reachability, actual returned chain ID, provider quota and historical-state support. Configured is not connectivity-verified. |
| Signature has no verified request network | The hook has no request-bound chain. A separate Snap-provider snapshot may be present, but is not bound to the initiating dApp or signing time; matching the domain does not prove request network. |
| Old reports differ from current behavior | SQLite history survives code and local-chain restarts. Check the report version, source, time and historical score label. |

The default build remains a **localhost Flask development integration**. Authenticated hosted mode now supplies explicit HTTPS/runtime settings, wallet-bound credentials, owner-scoped reports, revocation, quotas, restricted routes and isolated npm packaging. It has not itself been publicly deployed or published. Building `dist/web` or preparing a package does not establish TLS/domain ownership, a published/installable Snap, registry eligibility, retention policy or production security. Complete the real domain/proxy setup, publish and validate the intended npm artifact through the applicable MetaMask process, and test actual browser wallet behavior before offering it to users. Current official distribution instructions distinguish open-only permissions from protected permissions and specify additional audit requirements for listed key-management APIs; check the exact release permissions and current policy rather than assuming all Snaps share one approval requirement. See [MetaMask publication](https://docs.metamask.io/snaps/how-to/publish-a-snap/) and [distribution/allowlisting](https://docs.metamask.io/snaps/how-to/get-allowlisted/).

Source entry points: [`web/src/main.tsx`](web/src/main.tsx), [`snap/src/index.ts`](snap/src/index.ts), [`src/security/api.ts`](src/security/api.ts), [`src/security/ai.ts`](src/security/ai.ts), [`src/security/providers.ts`](src/security/providers.ts), [`src/security/coverage.ts`](src/security/coverage.ts), and [`src/testing/cases.ts`](src/testing/cases.ts). The [English user manual](docs/USER-MANUAL.md) and [generated detailed coverage guide](docs/AI-COVERAGE-GUIDE.md) provide operational instructions and field-by-field coverage; use current source and the actual report when older screenshots or acceptance artifacts differ.

Latest implementation review: [English interface and evidence reliability, 2026-10-22](docs/ENGLISH-EVIDENCE-REVIEW-2026-10-22.md). It distinguishes completed automated/model checks from remaining manual wallet and deployment acceptance. Earlier dated reviews remain historical records.
