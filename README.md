# WalletShield · Muse Wonder

[简体中文](README.zh-CN.md) · [User manual](docs/USER-MANUAL.md) · [Coverage](docs/CURRENT-COVERAGE.md)

WalletShield is an EVM wallet security prototype that explains a request **before you decide whether to sign**. A MetaMask Snap forwards the unsigned request to a backend, which gathers evidence and asks **Meta Muse Wonder (`muse-wonder-1.0`)** for a risk assessment. The wallet and webpage show the assessment, supporting evidence and unfinished checks.

The product provides advice. You retain control of signing and cancellation in MetaMask. It does not enforce blocking or monitor activity after signing.

## What it can assess

| Request family | Examples of evidence collected on supported paths |
| --- | --- |
| Transfers | Native/ERC-20/ERC-721/ERC-1155 recipients, amounts, ownership, balances and selected asset changes |
| Approvals and revocations | ERC-20 limits, single-NFT approvals, operator permissions and existing allowances |
| Signatures | Permit, common Permit2, DAI-style Permit, ERC-3009, personal messages, SIWE-like login and selected typed orders |
| Swaps | Decoded paths/limits/recipients, selected V2/V3 state, isolated execution and supported buy/sell experiments |
| DeFi operations | Selected vault, lending, staking, liquidity, wrapping, mint/burn and claim parameters/state |
| Account and contract control | Selected owner/role/upgrade/Safe-shaped controls, EIP-7702 authorizations and bounded batch structure |
| Other integrated requests | Permission/session/UserOperation summaries explicitly submitted by a cooperating dApp or API client |

These are bounded adapters, not universal protocol support. See the [coverage matrix](docs/CURRENT-COVERAGE.md) and [exact fields sent for assessment](docs/AI-COVERAGE-GUIDE.md). The local wallet lab provides **67 representative cases across 25 profiles**, including transaction and message-signature requests.

## How it works

```text
Unsigned wallet request → MetaMask Snap → backend validation and decoding
    → applicable RPC / optional intelligence / isolated simulation tools
    → evidence, qualitative signals and explicit missing checks
    → Muse assessment → validated report → Snap and webpage
    → your decision in MetaMask
```

The backend uses **Fastify/Zod** for the API and input validation, **viem/JSON-RPC** for decoding and state reads, **Anvil** for local fixtures and isolated forks, and **SQLite** for reports. The **React/Vite** webpage connects to your selected wallet provider; the Snap supplies supported wallet insights. RPC providers such as Infura supply network data; they do not connect or control your wallet.

Muse supplies the optional **0–100 risk score**, reasons, uncertainty and advice across authority, exposure, execution, identity, protocol and deception dimensions. Local rules supply qualitative evidence, with **no fixed numeric weights or fallback score**. The backend checks cited facts, asset subjects, units and supported claims. Missing evidence can legitimately produce no number; failed or rejected model output remains unscored. Scores are advisory indicators, not calibrated loss probabilities.

## Quick start

Use **Node.js 24.x**, npm and a desktop browser with **MetaMask Flask**. Use a dedicated development wallet; keep real funds out of the Flask test account.

On **macOS**, double-click [StartWalletShield.command](StartWalletShield.command) in the project folder. It changes to that folder, uses your available Node installation (preferring the Codex runtime if present), installs dependencies if `node_modules` is absent, and runs `npm run demo` automatically. It does not install Node.js; Node 24 must already be available. You do **not** need to run the terminal commands again after using the launcher.

For other systems or terminal-based development, use this alternative from the project directory:

```sh
node --version
npm ci
npm run demo
```

Use the full `npm ci` install. Current launchers, including hosted mode, require development-classified tooling such as `tsx`; `npm ci --omit=dev` is not a replacement.

The demo builds the webpage and Snap, starts a fresh local Anvil chain, deploys the test contracts and starts these services:

| Service | Local address |
| --- | --- |
| Webpage | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8787 |
| Development Snap files | http://127.0.0.1:8080 |
| Anvil, chain ID 31337 | http://127.0.0.1:8545 |

The launcher does not open a browser automatically. Open **http://127.0.0.1:5173/** in the browser containing Flask. Keep the terminal open; **Ctrl+C** stops that demo's services. Stop an earlier WalletShield session before starting another. Each new demo resets local chain state; saved reports remain historical. Prepare assets again after restarting.

For separate development terminals, backend/Snap changes and startup recovery, follow the [manual](docs/USER-MANUAL.md). `npm run deploy:lab` checks or adds lab fixtures to an existing local chain.

## Configure the backend

Use **two local configuration files**. If this machine is already configured, keep those files and launch normally. For a new checkout, create them from the visible [Meta template](config/meta.env.example) and [RPC template](config/rpc.env.example); `cp -n` preserves existing files:

```sh
mkdir -p .local
cp -n config/meta.env.example .local/meta.env
cp -n config/rpc.env.example .local/rpc.env
```

Edit `.local/meta.env` and `.local/rpc.env`, not the templates. The `config/` examples are visible reference files and are **not automatically loaded**. The actual private `.local/` files are excluded from GitHub and can intentionally differ from the examples. In macOS Finder, press **Command + Shift + .** to show hidden files and find `.local/`.

| Setting | File | Purpose |
| --- | --- | --- |
| `MODEL_API_KEY` | `.local/meta.env` | Your Meta Model API key; required for live Muse assessment |
| `ENABLE_META_AI=1` | `.local/meta.env` | Allow model calls; set `0` to run without them |
| `AI_DAILY_LIMIT=100` | `.local/meta.env` | Backend attempt limit per UTC day; range 1–1000 |
| `INFURA_API_KEY` | `.local/rpc.env` | Configure backend Ethereum mainnet and Sepolia RPC access |
| `RPC_<CHAIN_ID>_URL` | `.local/rpc.env` | Explicit trusted endpoint for another EVM chain, or override a derived endpoint |
| `ENABLE_FORK_SIMULATION=1` | `.local/rpc.env` | Enable isolated Anvil simulation when RPC/history supports it |
| `ENABLE_EXTERNAL_LOOKUPS=1` | `.local/rpc.env` | Opt into GoPlus address/site/token risk observations |

The model is fixed by the code constant **`META_MODEL`** to `muse-wonder-1.0`, using `https://api.meta.ai/v1/responses`. It is **not an environment model selector**; adding `META_MODEL=` to a local file does not change it. Use a Meta key, not an OpenAI key.

Local wallet tests need no Infura key. Without a configured, enabled and successful Muse call, you can inspect evidence but get no AI number. Infura enables public-network reads, not wallet access or phishing detection. Other networks need their own trusted `RPC_<CHAIN_ID>_URL`; chain 31337 stays bound to the local node.

To enable GoPlus, set this switch in **`.local/rpc.env`**:

```env
ENABLE_EXTERNAL_LOOKUPS=1
```

Set it to `0` to disable GoPlus. **`GOPLUS_TOKEN` is not the switch and can be omitted or left empty for anonymous queries.** The repository template starts at `0`; a private installation set to `1` is enabled, regardless of that template. The template is not loaded at runtime. `/api/security/status` reports the loaded switch as `externalLookups`. This does not prove a query succeeded or that every chain is supported; missing intelligence remains unknown. Optional source verification and dedicated trace endpoints are documented in the [manual](docs/USER-MANUAL.md).

Process environment values take precedence. Meta credentials/AI settings then come from `.local/meta.env`. RPC/tool settings use the first defined value in `.local/rpc.env` → `.local/meta.env` → legacy `.local/ai.env`. Files are reread per request; process-environment changes require a restart. Do not overwrite an existing setup when following the templates.

Model requests can incur charges. Failures count toward the daily attempt budget; an allowed output repair may use a second attempt. This is an attempt limit, not a monetary spending cap. RPC and intelligence providers have separate quotas. Keep all keys server-side and out of Git, screenshots and chat.

## Connect the Snap and test with your wallet

1. Open **Wallet setup → Connect wallet** and select the intended Flask provider and test account.
2. Choose **Install and pair Snap** and approve its permissions. The local ID is `local:http://127.0.0.1:8080`. Wait for backend pairing and health verification; installation alone does not prove a request was analyzed.
3. Choose **Switch to local chain and prepare assets**. Approve the network prompts. The backend prepares test ETH, tokens and NFTs on chain 31337; confirm any wallet asset-display prompts separately.
4. Open **Local wallet lab**, select an operation and read its **Prerequisites**. Approve each required allowance separately; preparing assets does not grant router permissions or create protocol positions.
5. Choose **Request a test transaction/signature**. Read the WalletShield insight, evidence and Muse assessment if available. Confirm or cancel in MetaMask. Message insights may appear after advancing to the wallet's signing step.
6. Compare **Wallet test history** and **Check history**. Wallet outcome and observed Snap delivery are separate; a report can exist for a request you canceled.

Start with unlimited approval and cancel it, then compare limited approval and revocation. The lab's test assets have no real value. Wallet display rejection does not undo funded balances. **Clear local test assets** clears known fixture wallet balances for the selected local account; it does not clear standing approvals, protocol positions, history or unknown assets.

After Snap code changes, rebuild, refresh and select **Reload and pair Snap**. If a wallet prompt times out, resolve it inside MetaMask before retrying; the webpage cannot cancel an already-open prompt.

## Public networks and deployment

With backend RPC configured, open **Public networks**, connect the intended account and choose a network. **Check RPC and account state** checks connectivity, not risk. **Test the wallet signing insight** checks Snap message delivery and may call Muse. Start actual transfers, approvals or swaps in their dApp, then inspect WalletShield in the wallet.

Automatic assessment requires MetaMask to deliver the supported transaction/message to the paired Snap. Permissions, sessions and UserOperations without such a hook require explicit dApp/API integration; installing the Snap does not expose every wallet action. A network switch itself is a direct wallet request, without a Muse score.

Public distribution additionally requires HTTPS hosting, identity/pairing configuration and the Snap release workflow. An Infura key alone does not publish the service. Follow the [hosted deployment instructions](docs/USER-MANUAL.md#9-hosted-identity-and-release-operation).


## Hosted test lab

An optional **Test lab** brings wallet testing to the HTTPS site, using disposable chain **31338**; the desktop lab remains **31337**. Connect a dedicated test wallet, verify identity, install/pair the published Snap, then prepare assets and accept the new network. Requests follow the same wallet → Snap → evidence → Muse → report flow. Test assets have no real value.

This is a **shared test chain** with a 15-minute exclusive transaction lease. Contract control state can change between testers. Asset management and private test sessions are limited to the verified account; chain data is public. The bounded HTTPS RPC excludes Anvil management and unlocked sends. The operator must explicitly enable/deploy it. See [hosted lab operations](docs/HOSTED-TEST-LAB.md).

## Privacy and boundaries

- Unsigned requests, message content, addresses and evidence are processed by the backend and stored in its SQLite history. A bounded evidence packet goes to Meta when AI is enabled; configured RPC/intelligence providers receive relevant queries. Local storage is not encrypted by the application.
- WalletShield never requests a recovery phrase or private key. Generated lab asset signatures stay in the browser and are discarded; the unsigned message can still be stored and assessed.
- A successful simulation describes one state. It cannot guarantee future selling, prices, bridge arrival, protocol solvency or safety. Custom protocols, opaque batches, nonstandard assets and unsupported wallet entry points may remain partial or unscored.
- This remains a prototype, with no independently established detection-accuracy percentage. Read the [coverage and reliability boundaries](docs/CURRENT-COVERAGE.md) before broader use.

## Further reading

[User manual](docs/USER-MANUAL.md) · [中文手册](docs/USER-MANUAL-zh.md) · [Coverage](docs/CURRENT-COVERAGE.md) · [Extracted fields and AI evidence](docs/AI-COVERAGE-GUIDE.md) · [Integration and evaluation](docs/RELIABILITY-AND-INTEGRATION.md)

Developer validation commands and dated results: [latest full re-test](docs/FULL-RETEST-2026-10-27.md).
