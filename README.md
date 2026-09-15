# d20dao VRF SDK — unreleased alpha

Public replay, mapping, epoch evidence and Solidity consumer helpers for a general randomness service. The package is `@d20dao/vrf-sdk` `0.1.0-alpha.0`. It remains private and publishing is guarded; local packaging is not a release or deployment claim.

## Current request flow

Epochs last 200 blocks. The keeper selects one of four fixed recipes using the canonical block hash at epoch start minus one and prepares its first validated API3 snapshot locally. Idle preparation publishes no transaction. An unused local snapshot can be retained for 50 epochs (10,000 blocks), subject to live-demand and unresolved-transaction protection.

After activation, a consumer escrows the exact request fee even when the epoch packet is not published. The request fixes its original block, epoch, client seed, mapping, recipient and 60-second deadline. The keeper publishes the saved packet only for live allowlisted demand. The randomness target becomes `max(requestBlock, committedBlock + 1)`, so its hash is unknown at publication. Before publication the request has no usable target or VRF seed. Multiple requests share the packet, and timely requests can settle across epoch boundaries without changing their epoch.

The four ordered recipe slots are Hyperliquid BTC volume, ANU quantum data, TickerLayer BTCUSD lastTrade and TickerLayer ETHUSD lastTrade. Both TickerLayer slots use the same provider signer and crypto asset class. `EpochSigners` is a readonly four-address tuple. The full exact signed data is limited to 128 bytes and emitted publicly; do not crop or replace it. A signature establishes provider-wrapper provenance, not unbiased upstream data or guaranteed availability.

## Use locally

With Node >=22.13, run `npm ci` and `npm test`. The test builds, packs and installs a real tarball in an isolated consumer. Install the filename reported by `npm pack` in your application; no registry publication is implied.

```js
import { builtins, mapRandomness, replayCoordinator } from '@d20dao/vrf-sdk';
import { coordinatorAbi, epochEntropyAbi } from '@d20dao/vrf-sdk/abi';
const mapping = builtins.d20();
// Use only an independently verified accepted word for real outcomes.
```

The root exports ESM and TypeScript declarations; `/epoch` exports epoch helpers. `/abi` exports `coordinatorAbi` and `epochEntropyAbi`, with JSON forms `D20VRFCoordinator.json` and `EpochEntropy.json`. The service implementations have locked empty constructors and explicit initializers. Registry initialization takes `address[4]`; it is not a four-address constructor deployment.

## Integrate a consumer

Solidity imports require compiler 0.8.28 and your compiler's npm resolver:

- `@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol`
- `@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol`
- `@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol`
- `@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol`
- `@d20dao/vrf-sdk/contracts/examples/MiningRandomnessConsumer.sol`

`examples/DiceConsumer.sol` is one concrete consumer example. It requires exact payment, fixes the player's refund recipient and stores the authenticated raw callback word. Its mapped result is 1 through 20. Mapped callbacks still carry raw bytes32. Keep application actions separate from callbacks; the example does not implement application-payment refunds, claim locking or minting.

Configure the chain explicitly; there is no implicit Arc network default. Pin the effective coordinator proxy address, initialized configuration and implementation history of both service proxies. Obtain keeper consumer onboarding before live requests. A constructor code-length check, SDK installation or permissionless request acceptance does not guarantee service.

Timely service requires actual onchain proof acceptance at or before original request time +60 seconds. Callback failure still earns the fee; retryCallback redelivers only the same accepted result. Expired unfulfilled requests refund their fixed recipient or receive refund credit. Application-payment refunds remain separate.

## Replay and upgrades

Use independently trusted successful receipts and state. Decode the registry EpochCommitted packet with decodeEpochEvidencePacket and verify with replayEpochCommitment. Use the original source anchor, exact packet, commit block/time, ordered signers and registry identity. Decode the coordinator FulfillmentEvidence packet with decodeEvidencePacket, then call replayCoordinator with its actual exported input type.

RequestContext binds both requestBlock and targetBlock. Validate the epoch from the original request block, reconstruct the target from the actual publication block, and compare the event and stored transcript. Proof evidence is 416 bytes; fulfillment calldata is 452 bytes. Neither evidence packet has a version prefix. Choose the decoder from trusted emitter/event context. Decoding and mapping alone are not proof verification; replay does not authenticate RPC or establish receipt inclusion.

D20VRFCoordinator and EpochEntropy use atomically initialized ERC1967 proxies with owner-authorized UUPS upgrades and two-step ownership transfers. The registry owner can change the committer; the coordinator owner can change fee recipient and keeper share. Upgrade authority can change code and is an explicit trust assumption. Keep requests, balances, credits, epochs and public replay intact across reviewed storage-compatible upgrades.

For replay, populate configuration.feeRecipient from the initialized initialFeeRecipient, not the current payout address. Use the effective proxy addresses in request and registry context. Operators pin the proxy code, initialized configuration, and BOTH implementation addresses/runtime hashes; the keeper fails closed on an unreviewed implementation change. Existing proof/nonce data must survive the review and restart.

The keeper share pays the configured registry committer, not an arbitrary proof submitter. Failed transfers become keeper credit. Refund escrow remains protected; callback retries do not pay a second fee share.

## Operational and release boundary

This SDK contains no keeper service, API fetching, proof generation, signer secrets or deployment automation. The canonical keeper has a Docker install wrapper that builds, provisions separately supplied key files and starts from reviewed configuration; inspect its platform-specific guide before use. No deployment or funding is authorized by SDK installation.

Optional Telegram access is disabled unless a bot token and numeric operator chat are explicitly configured. Only that chat can use read-only /status and /keeper commands. Commands never modify configuration or send transactions; notifications are best-effort observations, not chain evidence. This package neither reads bot credentials nor contacts Telegram.

Builds use reviewed protocol Git blobs and verify every SHA-256 in PROTOCOL-PROVENANCE.json. BUILD-MANIFEST.json records source, dependency-lock and imported OpenZeppelin hashes. The UUPS build uses OpenZeppelin contracts and contracts-upgradeable 5.6.1. Consumer source is copied exactly; service implementations, operator code, test fixtures and provers are excluded from the tarball.

Fixture provenance distinguishes explicit CI signatures from actual API3 responses. Fixtures are not included in the package. The browser-target bundle is executed under Node, not an actual browser session; independently trusted chain context is still required for real verification.

External review, provider quotas, actual chain fees/timing, upgrade administration, operational recovery and application refunds remain release gates. A healthy process alone does not guarantee a particular request's timely fulfillment. Keep the private flag and unconditional publish guard until a concrete release is authorized. Local validation does not authorize publishing or deployment.

## Arc Testnet pilot

A restricted pilot is deployed on chain 5042002. Obtain current proxy addresses and independently checked code hashes from the [keeper deployment manifest](https://github.com/d20dao/keeper/blob/main/deployments/arc-testnet.json). Consumer allowlisting is required. The [small-sample measurements](https://github.com/d20dao/keeper/blob/main/docs/benchmarks/arc-testnet-pilot-2026-09-15.json) cover proof acceptance, same-result callback repair and expired-request refunds; they are not an SLA. SDK npm publication remains separate from this GitHub testnet release.
