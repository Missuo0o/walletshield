# Comprehensive review — 22 October 2026

This is a review of the local WalletShield 0.4.1 prototype and the fixes made in this session. It is not an independent security certification, an exhaustive vulnerability assessment, or a measurement of detection accuracy. The complete operating manual is [README.md](../README.md).

## Findings addressed

| Finding | Resulting behavior |
| --- | --- |
| A fork or basic call could omit supplied gas, fees or nonce and check a substitute request. | These fields are preserved. Low-gas and stale-nonce requests do not become successful default-parameter transactions. Missing gas is explicitly labeled a simulation default; base and execution blocks are distinguished. |
| Unsupported transaction-envelope fields could disappear at the Snap boundary. | Nonempty access lists, blob fields/types, authorization fields/EIP-7702, unknown types and malformed execution quantities are explicit coverage gaps. The fork will not execute an ordinary substitute. |
| Extra EIP-712 JSON fields could be treated as signed owner/spender/deadline evidence. | Semantic extraction follows the reachable declared type graph. Standard schemas are required for canonical Permit classification. Permit2 uses the signer as its implicit owner; an unsigned extra owner cannot redirect allowance/nonce checks. |
| Permit2 expiration zero could be called already expired. | It retains its submission-block-time meaning and is not described as automatic revocation. |
| Some failed signature reads could discard an already observed nonce risk. | Independent observations survive partial failures, with explicit gaps for the unfinished checks. |
| Malformed asset logs or owner reads could create false asset changes. | ABI/log shape checks reject malformed observations and keep failed state reads unknown. |
| Read-only wallet permission/capability queries could resemble permission grants. | Read-only queries no longer create a grant signal. General permission interception is still unavailable. |
| Existing citations alone did not establish that some AI claims had relevant evidence. | Six distinct dimensions and bounded citations are required. Identity-high and honeypot conclusions have additional evidence constraints. Tool plans/unknown-only evidence cannot support a numeric score. |
| Incomplete reports or model-discovered gaps could still imply strong evidence or overall low risk. | Unknown checks and model gaps are retained. Such reports cannot claim strong evidence or overall low risk. Unsupported output is rejected, not assigned a replacement score. |
| Model and local schema bounds differed. | Structured output and local validation now share the six-dimension, citation and field-length constraints. The actual Meta API accepted the schema in two fixed local tests. |
| Numeric quantities could be interpreted without their asset/unit context. | The model packet explains wei, gas units, token decimals, NFT IDs, shares, health-factor units, round-trip percentages and unverified base-currency units. No price source means no dollar-loss estimate. |
| The dev web server could instantiate a second backend sharing SQLite. | Vite now proxies all API requests to the one backend on port 8787, which owns attempt limits and scan concurrency. |
| Some legacy endpoints lacked the newer local-origin checks. | Local Host checks, foreign-origin GET rejection, and legacy mutation-origin checks now cover the shared backend. This remains local development protection, not public multi-user authentication. |
| A credential-bearing fork URL could appear in child-process arguments. | Anvil sees only a temporary random loopback proxy URL. The proxy permits bounded upstream read methods; the child receives a minimal environment, and writes target only the child chain. |
| Local assets, wallet selection and public RPC availability were easy to confuse. | Separate local-wallet and real-network pages share an explicitly selected EIP-1193/EIP-6963 provider. Public-network probes verify chain/block and optional account state without signing, model calls or funding. |

## Verification performed

- **125 automated tests passed**, including decoding, evidence collection, schemas, citations, privacy boundaries, local API access, selected-provider discovery and unsupported-envelope behavior.
- Full `npm run build` passed: type checking, frontend build and Snap build. The Snap build updated its content hash; the remaining package repository metadata warning is informational.
- **54 local wallet cases passed**: 43 node-executed transactions and 11 node-generated/recovered signatures, representing 25 of 30 analysis profiles. Local chain state was restored. These tests do not prove MetaMask or Snap entry-point delivery.
- Local funding/approval/transfer/revocation checks passed and restored their snapshot.
- Isolated simulation acceptance passed: normal execution, normal fixture round trip, restricted selling, low gas/stale nonce, and unchanged upstream chain. Temporary fork and proxy processes closed.
- Real Infura read-only probes returned matching Ethereum (`1`) and Sepolia (`11155111`) chain IDs and block data. No public-network transaction was sent. See [network acceptance](real-network-connection-acceptance.json).
- Two fixed synthetic local requests reached the real Muse Wonder API with six accepted evidence-linked dimensions: the infinite-allowance sample returned **66/100**; the finite Permit sample abstained with **null** because of evidence gaps. Neither outcome was forced. These are connection/output-validation examples, not stable expected scores or an accuracy benchmark. See [model acceptance](muse-comprehensive-review-acceptance.json).
- The browser showed the new real-network page and a successful Sepolia read-only check. No wallet extension is injected in the review browser, so no new end-to-end Flask signing claim is made.

## Material remaining limits

The prototype has analysis paths for common transfers, token/NFT authority, messages/selected Permit forms, swaps and selected protocol interactions. Thirty profiles are routing categories, not thirty fully verified protocols. Hidden or nonstandard assets, protocol impersonation, complex batches/orders, future signature consumption, destination-chain settlement and economic failure remain partial or unknown. Sell success at one state does not prove future sellability; a failed sell alone does not prove fraud.

The current Snap automatically analyzes only EVM transactions and messages actually delivered by MetaMask. General session permissions, smart accounts/bundlers/paymasters, full EIP-7702 authorization, wallet network/connection actions, non-EVM chains and other wallet integrations do not have complete automatic interception. Device compromise, leaked secrets, custodial-exchange internals and off-chain fraud cannot be settled by these collectors.

Muse supplies every new numeric score without fixed weights or score floors. Scores remain uncalibrated and may vary. Citation checks and selected semantic guards cannot mechanically verify every natural-language statement; independently labeled ground-truth evaluation is still needed before claiming detection performance. Missing evidence, refusal, invalid output, quota exhaustion and timeout legitimately leave no number. Optional external intelligence must be enabled/configured and can still be missing or wrong.

Infura connectivity does not make this a public protection service. Public release still needs production Snap compatibility/distribution validation, hosted authenticated APIs, per-user isolation and quotas, privacy/retention decisions, operational hardening, and end-to-end public-network testing. The current code has no continuous post-sign monitoring or forced blocking product behavior.

## Recheck in your wallet

Keep the existing local chain running, refresh the page, select Flask, and use **钱包接入 → 重新加载并配对 Snap** to load the newly built bundle. In **本地钱包测试**, prepare the test assets, run representative transaction and signature cases, inspect the actual in-wallet result, confirm or cancel yourself, and verify the session separately reports Snap delivery and wallet outcome. Start public-network checks on Sepolia with a dedicated test account. The same account can exist on multiple networks; local tokens never become mainnet funds.
