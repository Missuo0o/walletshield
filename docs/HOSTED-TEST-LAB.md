# Hosted Test Lab

The optional lab keeps the 67 representative wallet requests on the hosted companion site. It is a disposable shared sandbox, not Ethereum or Sepolia. The existing published Snap's transaction, signature and test-session methods are reused; no new Snap permissions are requested.

| Environment | Chain ID | Node | Browser RPC |
| --- | --- | --- | --- |
| Desktop local lab | 31337 | 127.0.0.1:8545 | http://127.0.0.1:8545 |
| Hosted Test lab | 31338 | VPS loopback 127.0.0.1:8546 | https://your-host/api/test-rpc |

## Operator setup

Keep `.local/meta.env` and `.local/rpc.env` private. Add `WALLETSHIELD_ENABLE_TEST_LAB=1` to the private hosted `service.env`, and supply that environment to the build, chain and backend processes. Rebuild with `npm run build:hosted`. The compiled flag and running service must agree. A normal local `npm run demo` continues to build the desktop lab.

Start a separate persistent Anvil process under the service user:

```sh
# Environment includes SERVICE_MODE=hosted and ENABLE_TEST_LAB=1 with their
# full WALLETSHIELD_ prefixes, normally from systemd EnvironmentFile.
node scripts/chain.mjs
```

The script binds only loopback, chain 31338, port 8546. It reads/writes `.local/test-lab-state.json` and checkpoints every 30 seconds. Keep that file private and writable only by the service user. Its standard development accounts are fixture administrators with publicly known keys, not user wallets. Do not fund them on real networks.

After the node is reachable:

```sh
node --import tsx scripts/ensure-hosted-lab.ts
npm run start:hosted
```

The setup script verifies existing fixture manifests and bytecode, otherwise deploys fresh fixtures. Keep Anvil running with a process manager, and start the backend after it. On a deliberate chain reset or lost state file, rerun setup before accepting testers; old chain receipts and balances no longer describe current state. Back up private state consistently. Public HTTPS should proxy to the existing backend only; never expose port 8546. The existing API proxy serves `/api/test-rpc`.

## User flow

Connect a dedicated test wallet, verify identity, install/pair the published Snap, open **Test lab**, and prepare assets. Accept the network prompt for **WalletShield Test Lab / 31338**, then optional asset display prompts. Select a case and complete its prerequisites. Every transaction/signature requires its own wallet confirmation; preparation does not grant allowances or create positions. Inspect the actual matched Snap report and Muse assessment before deciding. Muse can abstain or fail; the lab never supplies a fixed replacement score.

The clear action affects only the verified account's known test fixture balances. It does not clear positions, standing approvals or history. NFT display support depends on the wallet. Test assets have no market value and cannot become mainnet assets.

## Isolation and limits

- Authenticated web identity is required for lab status, inventory, preparation, clearing and session history. A Snap bearer cannot manage assets. History is filtered by the verified wallet before the latest-100 limit. Another account's sessions return 404; funding/clearing another address returns 403. Standard unlocked node accounts and fixture contracts cannot claim the lab.
- Fixtures include shared control state. A 15-minute exclusive lease gates account transactions; preparing or starting a case renews it. This is not a per-user private blockchain. Other users wait; on backend restart users must reacquire the lease. Chain data is public.
- Each identity has at most four setup/start/clear attempts per minute and 40 per UTC day. Daily counts use separate persistent storage, survive login cleanup and restart, and reset on the next UTC day. Lab web reads are bounded at 120/minute per identity. The RPC allows 120/minute per observed IP and 360/minute globally, with four concurrent upstream calls and six-second timeouts. These are initial small-deployment limits, not an uptime or public-capacity guarantee.
- The fixed upstream is loopback port 8546. The allowlist excludes admin/reset/impersonation/debug/unlocked send methods, subscriptions, batches, arbitrary URLs and state overrides. Log ranges are bounded. Signed sends must recover the active lease account, specify chain 31338, and stay within an eight-million gas limit. The node's management methods remain internal.
- Lab requests use the same identity-bound scan, AI budget, evidence validation and report storage as public-network requests. The backend links only the matching account/request/session. Explicit signature chain bindings must match. The first recorded wallet outcome wins; a delayed duplicate cannot overwrite it or discard a linked report. Generated asset signatures remain in the browser; unsigned requests and evidence can reach the backend and Muse as documented.

## Validation

`npm test` includes offline RPC, identity, ownership and lease regression tests. `tests/hosted-lab.integration.ts` additionally needs an **isolated hosted-lab build** and owned node on 8546. It builds all 67 request shapes, prepares assets, submits a signed test approval through the bounded gateway, verifies the receipt, exercises a paired-Snap credential scan/report link, and clears balances. It does not replace manual MetaMask insight testing and does not call the live model.
