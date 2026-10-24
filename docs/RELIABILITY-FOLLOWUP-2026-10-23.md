# Score reliability and trace follow-up — 2026-10-23

[简体中文](RELIABILITY-FOLLOWUP-2026-10-23-zh.md) · [Sanitized results](reliability-followup-2026-10-23.json) · [Earlier complete validation](FULL-VALIDATION-2026-10-23.md)

This follow-up addresses the previous valid abstentions, rejected outputs, unmeasured accuracy and missing public-RPC traces. It adds working reliability and measurement mechanisms; it does not claim universal numeric scoring, measured independent accuracy or guaranteed provider capability.

## Changes

### Clear score outcomes

The webpage, history, lab and Snap now distinguish a validated number, evidence-insufficient abstention, rejected output, connection failure, pending analysis, model-not-run and not-applicable scoring. Older reports retain their original result; their display classification is derived without rewriting stored judgments. A failed result cannot present leftover model explanations as accepted analysis.

Canonical, narrowly allowlisted read-only wallet queries, such as `eth_getBalance(address, block)`, are recorded as **Not applicable · Read-only query** and use **zero Muse calls and zero model quota**. This means they do not request an asset transfer/signature/new authority; it does not assess account-data disclosure or returned-data safety. An arbitrary `wallet_get*`/`eth_get*` name, invalid parameters or redacted content cannot obtain this exemption. Complex calls and unknown extensions remain on the normal analysis path. A qualitative adverse finding is not erased by a no-score classification.

### Model output and evidence reliability

The provider now returns `walletshield-selection-v1`: it chooses exact `selected_fact_ids` and per-statement references instead of copying entire subject/value/source/block/time objects. The backend resolves IDs against this request's immutable fact catalog and stores the existing `walletshield-facts-v1` representation. Unknown IDs, duplicate selections, wrong citations, unsupported dimensions, contradictory abstention and unsupported certainty are still rejected. Legacy full-fact responses remain validated through the prior path. No score, assessment or prose is locally rewritten to pass validation.

Account, chain and SIWE source comparisons now carry structured values, including owner/signer and exact origin comparisons. Previously, some correctly detected mismatches existed only as a status/title: the model could read the warning but could not select a relevant structured comparison fact. SIWE structure and URI comparisons likewise retain bounded fields. This fixes a missing-evidence representation problem without authenticating a website or verifying a server-issued login nonce.

A directly observed typed-data owner/signer mismatch can support the identity dimension even when the parser labels it `warning`; the validator no longer discards that exact comparison merely because its status was not `risk`. Missing reputation or a generic warning remains insufficient. A mismatch is not proof of fraud or proof that a contract wallet cannot authorize another signer.

One extra model attempt is shared between output repair and transient HTTP recovery. HTTP **500/502/503/504** can retry once only with a separate successful atomic quota reservation and at least five seconds remaining. Both attempts retain the existing **50-second total budget**; the second has at most 25 seconds. There are never three calls for one analysis. Authentication/quota/429 errors, timeouts, arbitrary network errors, refusals and valid abstentions are not automatically retried. Provider error bodies remain private. `failureKind`, `attempts` and `repaired` make diagnostics machine-readable. A completed provider response's usage is not presented as the total billing for an earlier failed request.

### Trace fallback and provenance

Transaction analysis now tries **`debug_traceCall` → `trace_call`** on the configured primary RPC, then optionally the same two methods on a server-configured dedicated endpoint. The dedicated endpoint must match the primary's chain, block height, hash and timestamp before the wallet call is sent there. Both endpoint and primary block hashes are checked again after tracing. A disagreement remains unknown; the code does not trace a different state to manufacture success.

Limits are 14 seconds total, 1.8 seconds per RPC request, 750 KB response, 128 retained frames and depth 20. Empty/malformed/wrongly bound responses and missing/truncated subtrees remain explicit gaps. Unsupported execution fields are not discarded to trace a replacement transaction. There is no transaction submission. Only bounded call summaries are retained, with up to four frames available as structured facts to Muse. Those facts can support **execution** only, never authenticated identity, exhaustive asset deltas or safety.

Optional `.local/rpc.env` settings:

```dotenv
# Optional; replace placeholders with operator-selected trace-capable endpoints.
# Keep credentials on the backend. Do not expose these URLs in browser code.
TRACE_RPC_1_URL=https://YOUR_TRUSTED_MAINNET_TRACE_ENDPOINT
TRACE_RPC_11155111_URL=https://YOUR_TRUSTED_SEPOLIA_TRACE_ENDPOINT
```

The corresponding primary `RPC_<chain>_URL` or Infura configuration must already exist. No third-party endpoint or paid plan was purchased/configured by this change. Chain 31337 keeps its owned local-node configuration. Trace URLs are not exposed in status/errors. A dedicated endpoint is another service receiving the necessary unsigned transaction fields, so configure only a trusted provider authorized for that data.

Actual read-only checks found local Anvil tracing usable. The current Infura mainnet and Sepolia endpoints returned **method_unsupported for both dialects**. Code cannot enable a method absent from the provider. A trace-capable endpoint is required to close that external capability gap; independent call, chain-state and isolated-fork evidence remain available when their own checks succeed. The public-network capability panel probes the primary endpoint, while transaction evidence records the dedicated fallback separately.

### Independent-label evaluation

`npm run evaluate:independent` now compares frozen, reviewer-labelled evidence packets with saved model predictions. It checks manifest/packet hashes, reviewer/source declarations, temporal order, held-out groups and declared tuning leakage. It reports selective classification, AUROC ranking, coverage and separate failure/abstention/not-applicable/missing counts. Related cases retain explicit group counts; unavailable responses do not silently become correct predictions.

This tool makes no model/RPC calls and does not alter production scores. The included examples are explicitly synthetic format demonstrations. **No independent accuracy percentage has been measured:** real reviewer labels, sampling and a held-out prediction run are still required. The existing 0–100 indicator has no defined loss-event/time-horizon probability meaning, so dividing it by 100 and reporting probability calibration would be misleading. See [Independent evaluation](INDEPENDENT-EVALUATION.md) for the complete procedure and limits.

## Verification

- **495/495** unit/regression tests passed on Node.js 24.19.0, including new selection, comparison, classification, read-only, trace and independent-evaluation tests.
- Production webpage/Snap build and typechecks passed. The Snap checksum was rebuilt after its display changes.
- The disposable V3/state integration suite passed all **23 internal scenarios**.
- Existing offline synthetic validator evaluation remains distinct from live Muse accuracy. The independent evaluator's synthetic format example ran successfully with zero model/RPC calls.
- Real local Anvil read-only tracing succeeded with one retained frame and no transaction submission.

The previously rejected four case families were each sent to real Muse twice, with a maximum budget of 16 requests. Actual use was **9 provider attempts**, including one output repair, yielding **8/8 accepted outputs: seven numeric and one valid abstention**:

| Case family | First result | Second result |
| --- | ---: | ---: |
| SIWE login | 52 | 62 |
| NFT order signature | Valid abstention | 55 |
| SIWE source/domain mismatch | 74 | 82, after one repair |
| Permit owner mismatch | 76 | 68 |

These were targeted engineering rechecks using current deterministic comparisons and the original historical non-rule observations, with original source block/time retained. They are not fresh full-wallet simulations. Each inspection has a different timestamp and packet digest, so this is not a bit-identical-input repeatability study or an independently labelled benchmark. An earlier execution-environment connectivity check produced eight immediate connection failures before network access was enabled; those diagnostics are retained separately and not reclassified as model success.

**The variation is material:** passing output checks does not make numeric judgments deterministic. The order case changed between abstention and a number. This follow-up improves output reliability and makes uncertainty measurable; it does not claim to have eliminated model variation. We did not average runs, select a preferred answer, add fixed risk points or remove honest abstention.

## Use the updated build

After `npm run build`, restart the development services and select **Reload and pair Snap** in Wallet setup. Existing chain state and wallet history need no reset. Historical reports retain their previous scores and outcomes. Optional trace configuration requires an actual trace-capable service; independent accuracy measurement requires the documented external labels. Neither requirement can be substituted by an API-key toggle or an invented percentage.
