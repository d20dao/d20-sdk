# d20dao consumer-agent guide

Use this guide when integrating @d20dao/vrf-sdk into an application or interpreting its public evidence. Install with `npm install @d20dao/vrf-sdk`. The package provides a general randomness interface; dice and mining contracts are examples. Read installed declarations for exact types and match the packaged PROTOCOL-PROVENANCE.json to the deployment being used.

## Public interfaces

Import builtins, mapRandomness, decodeEvidencePacket and replayCoordinator from @d20dao/vrf-sdk. Epoch helpers also have an /epoch entrypoint. Import coordinatorAbi and epochEntropyAbi from /abi. Solidity consumers use D20VRFConsumer, ID20VRF, D20VRFRequests and RandomnessMapping under /contracts with compiler 0.8.28.

RequestContext binds chainId, effective coordinator proxy, keyHash, requestId, consumer, clientSeed, mapping, requestBlock, targetBlock, blockHash, epochId and epochHash. Consult Parameters<typeof replayCoordinator>[0] for the complete trusted replay input. configuration.feeRecipient uses the initialized initialFeeRecipient, not the current payout address.

## Request lifecycle

Epochs last 200 blocks. The keeper prepares the first validated API3 snapshot locally using the source anchor at epochStart-1. Idle preparation causes no publication transaction. Unused snapshots may remain locally for 50 epochs/10,000 blocks, with live-request and unresolved-transaction protection.

After activation, a consumer escrows the exact requestFee even if its epoch is unpublished. Live allowlisted demand triggers publication of that saved packet. The target becomes max(requestBlock,committedBlock+1); no usable VRF seed exists until that future hash is known. Preserve original request block, epoch, client seed, mapping, recipient and 60-second deadline. Older-epoch demand can settle across a boundary without changing its packet.

Require exact payment and keep caller/request association stable. D20VRFConsumer authenticates the coordinator proxy; verify the expected request and store the raw callback word with minimal work. Mapped requests still callback with bytes32; use getMappedResult or canonical mapping. Keep application actions and payments separate from the callback.

Valid onchain acceptance at or before requestedAt+60 seconds is timely. A pending transaction is not acceptance. Callback failure still earns service payment; retryCallback redelivers only the same accepted result. After expiry, an unfulfilled request refunds its fixed recipient or refund credit. Application-payment refunds are separate.

Keeper share pays the configured registry committer, not an arbitrary proof submitter. Failed payment creates keeper credit. Refund escrow is separate, and retrying delivery cannot pay a second share.

## Verification and trust

The four ordered recipe slots are Hyperliquid BTC volume, ANU, TickerLayer BTCUSD and TickerLayer ETHUSD; the latter two share a provider signer. Preserve the entire exact signed response, limited to 128 bytes. Signatures establish wrapper provenance, not unbiased upstream data.

Decode epoch evidence using its trusted registry/event context and decodeEvidencePacket for FulfillmentEvidence. Proof evidence is 416 bytes; fulfillment calldata is 452 bytes. Supply independently trusted successful receipts, proxy implementation history, source/publication/request/target blocks and timestamps, initialized key/configuration and original signed packets. Compare both event and stored transcript commitments. Decoding and mapping alone do not verify origin; replay does not authenticate RPC or establish inclusion.

Both service contracts use atomically initialized D20Proxy endpoints with owner-authorized UUPS upgrades and two-step ownership. Implementations are locked against initialization. Upgrade authority is trusted. Verify the implementation history of BOTH coordinator and registry; stable proxy addresses alone do not identify executed code. Operator pins stop processing on unreviewed changes while preserving recovery data.

## Service boundaries

Always configure the actual chain explicitly; there is no implicit Arc network default. Obtain consumer onboarding and approved proxy/configuration details before live requests. Healthy process status does not guarantee a particular request's timely fulfillment.

This SDK holds no signer or bot keys, runs no keeper/prover and exposes no operator API. Optional Telegram access is disabled by default and limited to read-only /status and /keeper in the configured operator chat. Those commands cannot alter configuration or send transactions. Docker provisioning, upgrades, funding and publishing are separate operator actions, not consequences of SDK integration.

## Optional refund notification

A coordinator with refund-hook support calls `onRefund(requestId)` on the original consumer after the fee is paid to its fixed refund address or recorded as backed credit. Extend `D20VRFConsumer` and override `_onRefund(uint256 requestId)` to update application state; the base authenticates the coordinator. The callback only carries the request ID and does not imply that the consumer itself received money. Application assets and fees remain the application's responsibility.

The first attempt forwards 100,000 gas. A reverting or gas-exhausting hook cannot undo the fee settlement. After failure, `retryRefundCallback(requestId, gasLimit)` retries the notification without another payment; successful delivery is recorded by `refundCallbackDelivered(requestId)`. Refund/retry needs sufficient outer gas. Never request new randomness from within either callback; use a separate application transaction.

This SDK includes the new source interface. Installing it does not upgrade a deployed coordinator: verify the implementation and its refund-hook capability before relying on notification delivery.
