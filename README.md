# d20dao VRF SDK

Public replay, mapping, epoch evidence, off-chain fee quoting and Solidity consumer helpers for a general randomness service. Package: `@d20dao/vrf-sdk` `0.3.0`.

## Getting started

```sh
npm install @d20dao/vrf-sdk
```

Use Node 22.13 or newer and Solidity 0.8.28. Configure the coordinator proxy explicitly from the keeper's deployment manifest for the chain you use (Arc Testnet is chain 5042002; see [Deployments](#deployments)); there is no implicit network default. Any consumer contract can request randomness by paying at least the fee quoted for its transaction, without allowlisting. Requests must come from a contract; a wallet or backend pays through its own consumer contract.

For agent-assisted integration, give your agent the installed `AGENTS.md` and `PROTOCOL-PROVENANCE.json`, plus the [integration skills](https://github.com/d20dao/skills). Website guides include Getting started, Copy prompt, `/llms.txt`, `/llms-full.txt` and `/agents.md`.

## Pricing

The coordinator prices every request from the base fee of the transaction that creates it:

```
fee = max(minFee, feeMultiplier × baseFee × (fulfillGasOverhead + callbackGasLimit))
```

`pricing()` returns the live `(minFee, feeMultiplier, fulfillGasOverhead)`. The owner can move them with `setPricing(minFee, multiplier, overhead)` (event `PricingChanged`) only within fixed bounds: `minFee` at most 10 USDC (`10e18` wei; native USDC on Arc uses 18 decimals), `feeMultiplier` 0 to 20 where 0 means a flat `minFee`, `fulfillGasOverhead` 100,000 to 2,000,000 gas. Initialization sets multiplier 5 and overhead 300,000; the keeper's deployment configuration (`config/service.json`) sets a 0.08 USDC minimum fee and a 40% keeper share (`keeperFeeBps` 4000). Read the live values instead of hard-coding them; a pricing change never touches requests that are already open, because each request settles from the fee it escrowed.

Labelled examples with multiplier 5, overhead 300,000 and a 0.08 USDC minimum:

- **A, 176 gwei base fee, 100,000 callback gas.** Dynamic part 5 × 176 gwei × 400,000 = 0.352 USDC, above the minimum, so the fee is 0.352 USDC.
- **B, 20 gwei base fee, 100,000 callback gas.** Dynamic part 5 × 20 gwei × 400,000 = 0.04 USDC, below the minimum, so the fee is 0.08 USDC.
- **C, multiplier set to 0.** The fee is `minFee` at any base fee.

`quoteFeeAt(callbackGasLimit, baseFee)` evaluates the formula for a base fee you supply; `quoteFee(callbackGasLimit)` evaluates it for `block.basefee`. Quotes above the `uint96` escrow limit revert with `FeeOverflow` rather than truncating.

## Paying for a request

`requestRandomness(clientSeed, callbackGasLimit, refundAddress)` and `requestMappedRandomness(..., spec)` accept `msg.value >= fee`, where `fee` is the quote computed inside that transaction. Less reverts with `IncorrectFee(expected, actual)`. Exactly `fee` is escrowed and stored as `requestFeePaid(requestId)`; `RandomnessRequested` emits that charged fee as `feePaid`, not `msg.value`. Anything above it is not revenue: it is credited to the request's `refundAddress` as refund credit (`FeeOverpaymentCredited(requestId, refundAddress, amount)`, readable through `refundCredits(address)`) and is withdrawn by that address calling `withdrawRefundCredit(recipient)`. Choose a refund address that can make that call, or that can receive a plain native transfer for expiry refunds; a contract that can do neither strands its credit.

### Contracts that pay in the same transaction

`quoteFee(callbackGasLimit)` is exact inside the requesting transaction. `D20VRFRequests` helpers and `MiningRandomnessConsumer` pay it from the calling contract's balance:

```solidity
uint256 fee = rng.quoteFee(callbackGasLimit);
requestId = rng.requestRandomness{value: fee}(clientSeed, callbackGasLimit, refundAddress);
```

### Wallets and backends that pay through a consumer

Do not call `quoteFee` through `eth_call`: it prices with `block.basefee`, which `eth_call` commonly reports as 0 (verified on Arc mainnet), so the answer collapses to `minFee` and the real transaction reverts with `IncorrectFee`. Quote with `quoteFeeAt(callbackGasLimit, latestBlock.baseFeePerGas)`, add a buffer for base-fee movement until inclusion, and forward the whole amount; the consumer example below does exactly that. The SDK helper wraps this for ethers 6:

```js
import { quoteRequestFee } from '@d20dao/vrf-sdk';
// provider: ethers Provider; coordinator: coordinator proxy address; 100_000: callbackGasLimit
const { fee, value, baseFee } = await quoteRequestFee(provider, coordinator, 100_000, { bufferBps: 3000 });
await dice.roll(clientSeed, 100_000, { value });
```

`fee` is `quoteFeeAt(callbackGasLimit, baseFee)` for the block's actual base fee. `value` is the same quote recomputed at a base fee `bufferBps` higher (default 3000, 30%: an EIP-1559 base fee can rise 12.5% per block), so the request still pays if the base fee rises by up to that much before inclusion. When the minimum fee dominates even at the buffered base fee, `value` equals `fee` and nothing extra is sent. In example A, `value` is 5 × 228.8 gwei × 400,000 = 0.4576 USDC; a request included at 176 gwei escrows 0.352 USDC and credits 0.1056 USDC to the refund address. The helper never uses `quoteFee`, needs only `getBlock` and `call`, and throws if the block has no `baseFeePerGas`. If the base fee outruns the buffer or pricing changes in between, the transaction reverts with `IncorrectFee`; quote again and resend.

## Request lifecycle

Epochs last 200 blocks. The keeper selects one of four fixed recipes using the canonical block hash at epoch start minus one and prepares its first validated API3 snapshot locally. If the selected source yields no valid packet, the next source slot in a fixed order can be committed instead, one slot per 20-block window (at most three fallbacks); a saved response is never refreshed or resampled. Idle preparation publishes no transaction. An unused local snapshot can be retained for 50 epochs (10,000 blocks), subject to live-demand and unresolved-transaction protection.

A request escrows its quoted fee even when its epoch packet is not published yet, and fixes its original block, epoch, client seed, mapping, refund address, `feePaid`, `refundBps` and 60-second deadline. The keeper publishes the saved packet only for live paid demand. The randomness target becomes `max(requestBlock, committedBlock + 1)`, so its hash is unknown at publication; before publication the request has no usable target or VRF seed. Multiple requests share the packet, and timely requests can settle across epoch boundaries without changing their epoch.

Timely service is onchain proof acceptance at or before `requestedAt + 60` seconds; a pending transaction is not acceptance. At acceptance the keeper share, `keeperFeeBps` of `feePaid`, is paid to the registry's configured committer (never the proof submitter; a failed transfer becomes keeper credit) and the remainder becomes withdrawable protocol fees. With a 40% share, example A pays 0.1408 USDC to the keeper and 0.2112 USDC to the treasury. Callback failure still earns the fee; `retryCallback(requestId, gasLimit)` redelivers only the same accepted result and never pays a second share.

### Expiry and refunds

After the deadline passes without an accepted proof, anyone may call `refundRequest(requestId)`. It pays `feePaid × refundBps / 10000` using the ratio snapshotted into the request at creation (`requestRefundBps(requestId)`), and the remainder becomes protocol fees. The ratio defaults to 100%; the owner can lower it with `setRefundBps` (event `RefundBpsChanged`) to no less than 50%, which affects only requests created afterwards. The refund is pushed to the fixed refund address with a 30,000-gas transfer; if that fails, the amount stays as refund credit for that address (`RequestRefundedTo(requestId, refundAddress, amount, paid)`) and is withdrawn with `withdrawRefundCredit`. Gas and application payments are not part of the refund. See [Optional refund notification](#optional-refund-notification) for the consumer hook.

### Batched fulfillment

The keeper may fulfill up to 16 prepared requests in one transaction with `fulfillRandomnessBatch(ids, proofs)`. Every served member runs exactly like `fulfillRandomness`: its own `BlockHashStored`, `RequestServed`, `ProofVerified`, `RandomnessFulfilled`, `FulfillmentEvidence`, `CallbackAttempted` and `KeeperFeePaid` events, settlement from its own `feePaid` and its own callback. Members already fulfilled, refunded or past their deadline are left untouched and marked with `FulfillmentSkipped(requestId, reason)` (1 fulfilled, 2 refunded, 3 past deadline); a wrong seed, invalid proof or unready member reverts the whole batch. Consumers see no difference. Indexers and verifiers must read per-request events and the request's stored state, not transaction calldata: only a single `fulfillRandomness` call is 452 bytes.

## Use locally

For SDK development, run `npm ci` and `npm test` from this repository. The test builds, packs and installs a real tarball in an isolated consumer, replays the recipe fixtures, type-checks a strict consumer, exercises `quoteRequestFee` against a mock provider and compiles the Solidity sources. `npm pack` also produces an installable local artifact.

```js
import { builtins, mapRandomness, replayCoordinator, quoteRequestFee } from '@d20dao/vrf-sdk';
import { coordinatorAbi, epochEntropyAbi } from '@d20dao/vrf-sdk/abi';
const mapping = builtins.d20();
// Use only an independently verified accepted word for real outcomes.
```

The root exports ESM and TypeScript declarations, including `quoteRequestFee`, `DEFAULT_FEE_BUFFER_BPS` and the `FeeQuote`, `FeeQuoteOptions` and `FeeQuoteProvider` types; `/epoch` exports epoch helpers and `MAX_ATTESTATION_AGE`. `/abi` exports `coordinatorAbi` and `epochEntropyAbi`, with JSON forms `D20VRFCoordinator.json` and `EpochEntropy.json`. The service implementations have locked empty constructors and explicit initializers. Registry initialization takes `address[4]`; it is not a four-address constructor deployment.

## Integrate a consumer

Solidity imports require compiler 0.8.28 and your compiler's npm resolver:

- `@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol`
- `@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol`
- `@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol`
- `@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol`
- `@d20dao/vrf-sdk/contracts/examples/MiningRandomnessConsumer.sol`

`examples/DiceConsumer.sol` is one concrete consumer example for a player-paid request. It forwards the player's `msg.value` to `requestMappedRandomness`, so the coordinator escrows the exact same-transaction quote, credits any excess to the player as the fixed refund address and reverts underpayment with `IncorrectFee`. It stores the authenticated raw callback word; its mapped result is 1 through 20. Mapped callbacks still carry raw bytes32. Keep application actions separate from callbacks; the example does not implement application-payment refunds, claim locking or minting.

`D20VRFConsumer` authenticates the coordinator proxy. Verify the expected request in the callback and store the word with minimal work. Pin the effective coordinator proxy address, initialized configuration and implementation history of both service proxies. A constructor code-length check, SDK installation or permissionless request acceptance does not guarantee service.

## Replay and verification

Use independently trusted successful receipts and state. Decode the registry `EpochCommitted` packet with `decodeEpochEvidencePacket` and verify with `replayEpochCommitment`, using the original source anchor, exact packet, commit block/time, ordered signers and registry identity. Decode the coordinator `FulfillmentEvidence` packet with `decodeEvidencePacket`, then call `replayCoordinator` with its exported input type (`Parameters<typeof replayCoordinator>[0]`).

`RequestContext` binds both `requestBlock` and `targetBlock`. Validate the epoch from the original request block, reconstruct the target from the actual publication block, and compare the event and stored transcript. Proof evidence is 416 bytes; fulfillment calldata is 452 bytes. Neither evidence packet has a version prefix. Choose the decoder from trusted emitter/event context. Decoding and mapping alone are not proof verification; replay does not authenticate RPC or establish receipt inclusion.

`EpochProtocolConfiguration` is the initialized configuration: `feeRecipient` from `initialFeeRecipient()`, `initialMinFee` from `initialMinFee()` (the `initialize` fee argument), `catalogHash` from `catalogHash()`. Live `pricing()`, `feeRecipient()` and scheduled catalogs never change `protocolConfigurationHash`.

Signer catalogs are per epoch. The registry owner can schedule a replacement catalog with `scheduleCatalog(signers, fromEpoch)` for epochs at least two ahead (event `CatalogScheduled(fromEpoch, catalogHash, signers)`); the current and next epoch, prepared snapshots and open requests keep their signers. `catalogHashAt(epochId)` and `signersAt(epochId)` return the catalog in force for an epoch, and `Epoch.catalogHash` records it at commitment. For replay, `epoch.catalog.signers` must be that per-epoch catalog, taken from `signersAt` or the `CatalogScheduled` history, while `configuration.catalogHash` stays the initial catalog bound into the configuration hash; `replayEpochCommitment` binds the supplied signers to `record.catalogHash`. `catalogHash()` and the slot getters always return the initial catalog.

At publication a signed attestation may be at most 240 seconds old and never future-dated (`MAX_ATTESTATION_AGE`, exported from `/epoch`); `replayEpochCommitment` enforces the same bound against the commit timestamp.

D20VRFCoordinator and EpochEntropy use atomically initialized ERC1967 proxies with owner-authorized UUPS upgrades and two-step ownership transfers; `renounceOwnership` reverts on both, so upgrade authority can only move through an accepted transfer. The registry owner can change the committer and schedule future catalogs; the coordinator owner can change fee recipient, keeper share, bounded pricing and the refund ratio. No setter rewrites a request, a published epoch or the VRF key, but upgrade authority can change code and is an explicit trust assumption. Verify the implementation history of BOTH proxies at the relevant receipts; stable proxy addresses alone do not identify executed code. Operators pin the proxy code, initialized configuration and both implementation addresses/runtime hashes; the keeper fails closed on an unreviewed implementation change.

## Operational and release boundary

This SDK contains no keeper service, API fetching, proof generation, signer secrets or deployment automation. The canonical keeper has a Docker install wrapper that builds, provisions separately supplied key files and starts from reviewed configuration; inspect its platform-specific guide before use. No deployment or funding is authorized by SDK installation.

Optional Telegram access is disabled unless a bot token and numeric operator chat are explicitly configured. Only that chat can use read-only /status and /keeper commands. Commands never modify configuration or send transactions; notifications are best-effort observations, not chain evidence. This package neither reads bot credentials nor contacts Telegram.

Builds use reviewed protocol Git blobs and verify every SHA-256 in PROTOCOL-PROVENANCE.json. `src/fees.ts` (the fee-quoting helper) is SDK-owned rather than vendored; BUILD-MANIFEST.json records it under `packageSources` next to the protocol source, dependency-lock and imported OpenZeppelin hashes. The UUPS build uses OpenZeppelin contracts and contracts-upgradeable 5.6.1. Consumer source is copied exactly; service implementations, operator code, test fixtures and provers are excluded from the tarball.

Fixture provenance distinguishes explicit CI signatures from actual API3 responses. Fixtures are not included in the package. The browser-target bundle is executed under Node, not an actual browser session; independently trusted chain context is still required for real verification.

SDK installation provides consumer and verification tooling. Chain availability, provider quotas, upgrade administration and application settlement remain separate concerns. A healthy process alone does not guarantee a particular request's timely fulfillment.

## Deployments

Obtain proxy addresses, implementation addresses and independently checked code hashes from the keeper's deployment manifests, and check that the coordinator implementation at your chain's proxy exposes `quoteFee`/`quoteFeeAt` (its code hash matches the manifest entry for this protocol version) before relying on this SDK's interface. The testnet upgrade to this protocol version and the Arc mainnet deployment are published there when confirmed.

### Arc Testnet

Chain ID: **5042002**. Use the **coordinator proxy** when constructing a consumer.

| Contract | Role | Arc Testnet address |
| --- | --- | --- |
| D20VRFCoordinator | Consumer entry point / proxy | [`0xd20DA0FF9087d053f0291524Eac12abA1ADBd945`](https://testnet.arcscan.app/address/0xd20DA0FF9087d053f0291524Eac12abA1ADBd945) |
| EpochEntropy | Epoch registry / proxy | [`0xD20Da00B47A7cD2211dC4683E306913b05903756`](https://testnet.arcscan.app/address/0xD20Da00B47A7cD2211dC4683E306913b05903756) |
| D20CostClient | Restricted cost client / proxy | [`0xD20da026090B8472579a2B93030F1fC4c94807F1`](https://testnet.arcscan.app/address/0xD20da026090B8472579a2B93030F1fC4c94807F1) |
| D20VRFCoordinator | Implementation | [`0xD20da0c375cEfCdA65703699A4090237057e9b68`](https://testnet.arcscan.app/address/0xD20da0c375cEfCdA65703699A4090237057e9b68) |
| EpochEntropy | Implementation | [`0xD20Da0cf7Ddc6123f9A87c0C210F8ECB934CA7D5`](https://testnet.arcscan.app/address/0xD20Da0cf7Ddc6123f9A87c0C210F8ECB934CA7D5) |
| D20CostClient | Implementation | [`0xD20DA00A872acfDe3e4721Fc1051BD23CC84B66b`](https://testnet.arcscan.app/address/0xD20DA00A872acfDe3e4721Fc1051BD23CC84B66b) |

Addresses are copied from the [Arc Testnet deployment manifest](https://github.com/d20dao/keeper/blob/main/deployments/arc-testnet.json). Explorer links identify addresses; they do not assert explorer source-code verification. Implementation addresses change through owner-authorized upgrades, so the implementation rows and code hashes are only valid together with the manifest revision they came from. The pilot consumer is test tooling, not a shared application entry point. The [testnet stress run](https://github.com/d20dao/keeper/blob/main/docs/benchmarks/arc-testnet-stress-2026-09-16.json) served 68 paid requests within 2–4 chain seconds, 47 of them in batched fulfillments; measured timings are not an SLA.

## Optional refund notification

After `refundRequest` has paid the fixed refund address or recorded its refund credit, the coordinator calls `onRefund(requestId)` on the original consumer. Extend `D20VRFConsumer` and override `_onRefund(uint256 requestId)` to update application state; the base authenticates the coordinator. The callback only carries the request ID and does not imply that the consumer itself received money. Application assets and fees remain the application's responsibility.

The first attempt forwards 100,000 gas. A reverting or gas-exhausting hook cannot undo the fee settlement. After failure, `retryRefundCallback(requestId, gasLimit)` retries the notification without another payment; successful delivery is recorded by `refundCallbackDelivered(requestId)`. Refund/retry needs sufficient outer gas. Never request new randomness from within either callback; use a separate application transaction.
