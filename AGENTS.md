# d20dao consumer-agent guide

Use this guide when integrating @d20dao/vrf-sdk into an application or interpreting its public evidence. Install with `npm install @d20dao/vrf-sdk`. The package provides a general randomness interface; dice and mining contracts are examples. Read installed declarations for exact types and match the packaged PROTOCOL-PROVENANCE.json to the deployment being used.

## Public interfaces

Import builtins, mapRandomness, decodeEvidencePacket, replayCoordinator and quoteRequestFee from @d20dao/vrf-sdk. Epoch helpers and MAX_ATTESTATION_AGE also have an /epoch entrypoint. Import coordinatorAbi and epochEntropyAbi from /abi. Solidity consumers use D20VRFConsumer, ID20VRF, D20VRFRequests and RandomnessMapping under /contracts with compiler 0.8.28. ID20VRF exposes quoteFee(callbackGasLimit), quoteFeeAt(callbackGasLimit, baseFee), requestRandomness(clientSeed, callbackGasLimit, refundAddress), requestMappedRandomness(..., spec) and getMappedResult(requestId).

RequestContext binds chainId, effective coordinator proxy, keyHash, requestId, consumer, clientSeed, mapping, requestBlock, targetBlock, blockHash, epochId and epochHash. Consult Parameters<typeof replayCoordinator>[0] for the complete trusted replay input. configuration.feeRecipient uses the initialized initialFeeRecipient and configuration.initialMinFee the initialize fee argument (getter initialMinFee), not the live payout address or pricing.

## Pricing and payment

fee = max(minFee, feeMultiplier × baseFee × (fulfillGasOverhead + callbackGasLimit)), evaluated with the base fee of the requesting transaction. pricing() returns the live (minFee, feeMultiplier, fulfillGasOverhead); the owner may change them within bounds (minFee at most 10 USDC in 18-decimal native units, multiplier 0–20 where 0 is a flat minFee, overhead 100,000–2,000,000 gas) and emits PricingChanged. Initialization sets multiplier 5 and overhead 300,000; the deployment configuration sets a 0.08 USDC minimum and a 40% keeper share (keeperFeeBps 4000). Examples at those parameters: at 176 gwei with 100,000 callback gas the fee is 5 × 176 gwei × 400,000 = 0.352 USDC; at 20 gwei the dynamic part is 0.04 USDC, so the 0.08 USDC minimum applies. Read live values; never hard-code a price.

Send msg.value >= fee. Less reverts with IncorrectFee(expected, actual). Exactly the quote is escrowed (requestFeePaid, emitted as feePaid in RandomnessRequested); any excess is credited to the refund address as refund credit (FeeOverpaymentCredited, refundCredits) and only that address can pull it with withdrawRefundCredit(recipient). Choose a refund address that can call withdrawRefundCredit or receive a plain native transfer.

A contract that requests in the same transaction pays quoteFee(callbackGasLimit), which is exact; D20VRFRequests helpers and MiningRandomnessConsumer do this from the contract balance. A wallet or backend must pay through a consumer contract (requests from EOAs revert) and must never quote quoteFee through eth_call: the base fee is commonly reported as 0 there (verified on Arc mainnet), the quote collapses to minFee and the transaction reverts. Quote with quoteFeeAt(callbackGasLimit, latestBlock.baseFeePerGas) plus a buffer and forward the whole amount. quoteRequestFee(provider, coordinator, callbackGasLimit, { bufferBps = 3000 }) does this with ethers 6: fee is the quote at the block's base fee, value is the quote at a base fee bufferBps higher (equal to fee when the minimum dominates); send value. The buffer covers base-fee movement until inclusion; the excess is refund credit, never revenue. On IncorrectFee, quote again and resend.

## Request lifecycle

Epochs last 200 blocks. The keeper prepares the first validated API3 snapshot locally using the source anchor at epochStart-1. Idle preparation causes no publication transaction. Unused snapshots may remain locally for 50 epochs/10,000 blocks, with live-request and unresolved-transaction protection.

A request escrows its quoted fee even if its epoch is unpublished and fixes its request block, epoch, client seed, mapping, refund address, feePaid, refundBps and 60-second deadline. Live paid demand triggers publication of the saved packet. The target becomes max(requestBlock, committedBlock+1); no usable VRF seed exists until that future hash is known. Older-epoch demand can settle across a boundary without changing its packet.

D20VRFConsumer authenticates the coordinator proxy; verify the expected request and store the raw callback word with minimal work. Mapped requests still callback with bytes32; use getMappedResult or canonical mapping. Keep application actions and payments separate from the callback.

Valid onchain acceptance at or before requestedAt+60 seconds is timely. A pending transaction is not acceptance. At acceptance keeperFeeBps of feePaid goes to the configured registry committer, not the proof submitter (a failed transfer becomes keeper credit), and the remainder becomes protocol fees. Callback failure still earns the fee; retryCallback redelivers only the same accepted result and cannot pay a second share.

After the deadline, anyone may call refundRequest(requestId). It pays feePaid × requestRefundBps / 10000 using the ratio snapshotted at request time (default 100%; the owner may lower it to no less than 50% for future requests only, event RefundBpsChanged) to the fixed refund address, or records it as that address's refund credit if the 30,000-gas transfer fails; the remainder is retained as protocol fees. Gas and application payments are separate.

Keepers may fulfill up to 16 requests in one fulfillRandomnessBatch transaction. Each served request emits the same per-request events and evidence as a single fulfillment and settles from its own feePaid; members already fulfilled, refunded or past their deadline emit FulfillmentSkipped(requestId, reason) with reason 1, 2 or 3, and any proof or readiness failure reverts the batch. Consumers see no difference. Indexers must rely on per-request events, not transaction calldata.

## Verification and trust

The four ordered recipe slots are Hyperliquid BTC volume, ANU, TickerLayer BTCUSD and TickerLayer ETHUSD; the latter two share a provider signer. Preserve the entire exact signed response, limited to 128 bytes. Signatures establish wrapper provenance, not unbiased upstream data. At publication an attestation may be at most 240 seconds old (MAX_ATTESTATION_AGE) and never future-dated.

Signer catalogs are per epoch. The registry owner can schedule a replacement with scheduleCatalog(signers, fromEpoch) at least two epochs ahead (event CatalogScheduled); the current and next epoch, prepared snapshots and open requests keep their signers. Replay must use signersAt(epochId) or the CatalogScheduled history as epoch.catalog.signers, which replayEpochCommitment binds to the record's catalogHash, while configuration.catalogHash stays the initial catalogHash() bound into protocolConfigurationHash.

Decode epoch evidence using its trusted registry/event context and decodeEvidencePacket for FulfillmentEvidence. Proof evidence is 416 bytes; a single fulfillRandomness call is 452 calldata bytes. Supply independently trusted successful receipts, proxy implementation history, source/publication/request/target blocks and timestamps, initialized key/configuration and original signed packets. Compare both event and stored transcript commitments. Decoding and mapping alone do not verify origin; replay does not authenticate RPC or establish inclusion.

Both service contracts use atomically initialized D20Proxy endpoints with owner-authorized UUPS upgrades and two-step ownership; renounceOwnership reverts on both. Implementations are locked against initialization. The owner can rotate committer and fee recipient, adjust the keeper share, tune bounded pricing, lower the refund ratio for future requests and schedule future catalogs; no setter rewrites a request, a published epoch or the VRF key. Upgrade authority is trusted. Verify the implementation history of BOTH coordinator and registry; stable proxy addresses alone do not identify executed code. Operator pins stop processing on unreviewed changes while preserving recovery data.

## Service boundaries

Always configure the actual chain explicitly; there is no implicit Arc network default. Take proxy addresses and code hashes from the keeper's deployment manifest for that chain and confirm the coordinator implementation exposes quoteFee/quoteFeeAt before live requests. Healthy process status does not guarantee a particular request's timely fulfillment.

This SDK holds no signer or bot keys, runs no keeper/prover and exposes no operator API. Optional Telegram access is disabled by default and limited to read-only /status and /keeper in the configured operator chat. Those commands cannot alter configuration or send transactions. Docker provisioning, upgrades, funding and publishing are separate operator actions, not consequences of SDK integration.

## Optional refund notification

After refundRequest has paid the fixed refund address or recorded its refund credit, the coordinator calls `onRefund(requestId)` on the original consumer. Extend `D20VRFConsumer` and override `_onRefund(uint256 requestId)` to update application state; the base authenticates the coordinator. The callback only carries the request ID and does not imply that the consumer itself received money. Application assets and fees remain the application's responsibility.

The first attempt forwards 100,000 gas. A reverting or gas-exhausting hook cannot undo the fee settlement. After failure, `retryRefundCallback(requestId, gasLimit)` retries the notification without another payment; successful delivery is recorded by `refundCallbackDelivered(requestId)`. Refund/retry needs sufficient outer gas. Never request new randomness from within either callback; use a separate application transaction.

## Migrating from 0.1.x

requestFee() is removed: pay quoteFee(callbackGasLimit) in-transaction or quoteFeeAt plus a buffer off-chain (quoteRequestFee). Payment is msg.value >= fee with IncorrectFee(expected, actual) on underpayment and refund credit for the excess; forward a player's whole payment instead of requiring equality. EpochProtocolConfiguration.requestFee is renamed initialMinFee (same encoding). Replay takes the per-epoch catalog in epoch.catalog.signers. Attestations may be 240 seconds old (was 120). Expiry refunds pay requestRefundBps of feePaid. Fulfillments may be batched; index per-request events. renounceOwnership reverts. Deployment addresses and code hashes change with the testnet upgrade and mainnet deployment; take them from the manifests.
