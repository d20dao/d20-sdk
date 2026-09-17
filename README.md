# d20dao VRF SDK

Public replay, mapping, epoch evidence, off-chain fee quoting and Solidity consumer helpers for a general randomness service. Package: `@d20dao/vrf-sdk` `0.3.3`.

## Getting started

```sh
npm install @d20dao/vrf-sdk
```

Use `@d20dao/vrf-sdk` 0.3.3 or newer, Node 22.13 or newer and Solidity 0.8.28 with EVM version `cancun`. The service is live on Arc Mainnet (chain 5042); use Arc Testnet (chain 5042002) for development (see [Networks](#networks)). Configure the coordinator proxy explicitly from the public deployment manifest for the chain you use (see [Deployments](#deployments)); there is no implicit network default. Any consumer contract can request randomness by paying at least the fee quoted for its transaction, without allowlisting. Requests must come from a contract; a wallet or backend pays through its own consumer contract.

For agent-assisted integration, give your agent the installed `AGENTS.md` and `PROTOCOL-PROVENANCE.json`, plus the [integration skills](https://github.com/d20dao/skills). The website guides are on d20dao.org: [guides](https://d20dao.org/docs) including [Getting started](https://d20dao.org/docs/getting-started) with its Copy prompt action, the guide index [d20dao.org/llms.txt](https://d20dao.org/llms.txt), the full text [d20dao.org/llms-full.txt](https://d20dao.org/llms-full.txt) and [d20dao.org/agents.md](https://d20dao.org/agents.md).

## Networks

| | Arc Mainnet | Arc Testnet |
| --- | --- | --- |
| Use | Live service, real USDC | Development and testing |
| Chain ID | `5042` | `5042002` |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Block explorer | https://explorer.arc.io | https://testnet.arcscan.app |
| D20DAO explorer | https://arc.d20dao.org | https://arc-testnet.d20dao.org |
| Deployment manifest | https://d20dao.org/deployments/arc-mainnet.json | https://d20dao.org/deployments/arc-testnet.json |

The native gas token on both networks is USDC with 18 decimals (`1e18` wei is 1 USDC); request fees are paid in it. Test USDC comes from the faucet linked in Arc's [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc) reference, which also lists alternative RPC providers. Compile with solc 0.8.28 and `evmVersion` `cancun`, the settings this SDK builds and tests with. The manifests record proxy and implementation addresses, implementation code hashes, owner, initialized pricing and deployment receipts. The [D20DAO explorer](https://d20dao.org/explorer) shows and replays requests on both networks.

## Integrate a consumer

Solidity imports require compiler 0.8.28 and your compiler's npm resolver:

- `@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol`
- `@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol`
- `@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol`
- `@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol`
- `@d20dao/vrf-sdk/contracts/examples/MiningRandomnessConsumer.sol`

These sources import only each other; no OpenZeppelin installation is needed for a consumer.

`D20VRFConsumer` authenticates the coordinator proxy. Verify the expected request in the callback and store the word with minimal work. Pin the effective coordinator proxy address, initialized configuration and implementation history of both service proxies. A constructor code-length check, SDK installation or permissionless request acceptance does not guarantee service.

A complete consumer following the recommended payment pattern is shown in [Recommended payment pattern](#recommended-payment-pattern).

### Compiler setup

Hardhat resolves `@d20dao/vrf-sdk/...` imports from `node_modules` without remappings:

```ts
// hardhat.config.ts
export default {
  solidity: {
    version: "0.8.28",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
};
```

Foundry: run `npm install @d20dao/vrf-sdk` in the project root and map the import prefix to `node_modules`:

```toml
# foundry.toml
[profile.default]
src = "src"
solc_version = "0.8.28"
evm_version = "cancun"
remappings = ["@d20dao/vrf-sdk/=node_modules/@d20dao/vrf-sdk/"]
```

With either tool, `import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";` then compiles unchanged.

### Examples

- `examples/DiceConsumer.sol` (installed as `@d20dao/vrf-sdk/examples/DiceConsumer.sol`) is one concrete consumer example for a player-paid request. It forwards the player's `msg.value` to `requestMappedRandomness`, so the coordinator escrows the exact same-transaction quote, credits any excess to the player as the fixed refund address and reverts underpayment with `IncorrectFee`. It stores the authenticated raw callback word; its mapped result is 1 through 20. Mapped callbacks still carry raw bytes32. It marks refunded rolls in `_onRefund`. Keep application actions separate from callbacks; the example does not implement application-payment refunds, claim locking or minting.
- `contracts/examples/MiningRandomnessConsumer.sol` (in the installed package; source in this repository's `protocol/contracts/examples/`) is an abstract building block. It pays `quoteFee` from the contract's own balance, requests raw randomness with `clientSeed = keccak256(abi.encode(claimId, lockedWork))`, maps each request to one claim, rejects unknown or repeated callbacks and derives three candidate seeds from the stored word. The application still validates work and locks payment before calling `_requestForClaim`.
- `skills/d20-consumer/assets/RandomnessConsumer.sol` in [d20dao/skills](https://github.com/d20dao/skills) shows raw, mapped and shuffle requests that pay the exact quote and return change, with refund notification and refund-credit withdrawal.

### Client seed

`clientSeed` does not need to be unique or secret. The coordinator derives each request's VRF input from the chain ID, coordinator address, key hash, request ID, consumer, client seed, mapping hash, request block, target block, target block hash, epoch ID and epoch hash. The request ID increments for every request, so two requests with the same client seed still have different inputs. Use the seed to bind application context into the request and its VRF seed, for example `keccak256(abi.encode(msg.sender, operationId))` or a hash that commits to an ordered item list before a choice or shuffle. It is emitted in `RandomnessRequested`; it is neither an entropy source nor private.

### Callback gas limit

`callbackGasLimit` must be between 30,000 and 1,000,000 gas (`MIN_CALLBACK_GAS`, `MAX_CALLBACK_GAS`); other values revert with `InvalidCallbackGas`. The coordinator calls `rawFulfillRandomness(requestId, randomness)` with exactly that much gas, and the fee grows with it (see [Pricing](#pricing)). If the callback reverts or runs out of gas, the request is still served and paid (`CallbackAttempted(requestId, false, gasLimit)`, `delivered` stays false); anyone can call `retryCallback(requestId, gasLimit)` with a limit no lower than the original and at most 1,000,000. Keep the callback to authentication, a request check and a few storage writes (a new storage slot costs about 22,100 gas); the examples use 100,000. Computing a large mapping, such as a 256-item shuffle, inside the callback needs much more.

## Randomness options

Every option is a `RandomnessMapping.Spec` `(operation, lower, upper, count, population)`. In Solidity, `D20VRFRequests` builds and pays for it: `using D20VRFRequests for ID20VRF;` with `o = D20VRFRequests.Options(clientSeed, callbackGasLimit, refundAddress)`. Each helper returns the request ID and pays `quoteFee(o.callbackGasLimit)` from the calling contract's balance. Without the library, pass the spec to `requestMappedRandomness(clientSeed, callbackGasLimit, refundAddress, spec)`. In TypeScript, `builtins` returns the same spec for `mapRandomness(word, spec)` and `hashMapping(spec)`.

| Option | Solidity (`D20VRFRequests`) | TypeScript (`builtins`) | Spec | Valid parameters | Result |
| --- | --- | --- | --- | --- | --- |
| Raw word | none: `requestRandomness(clientSeed, callbackGasLimit, refundAddress)` | `raw()` | `(0 Raw, 0, 0, 0, 0)` | none | `[uint256(word)]` |
| Dice | `rng.diceRoll(sides, count, o)` | `diceRoll(sides, count = 1)` | `(1 DiceRoll, 0, sides, count, 0)` | sides ≥ 2; count 1–128 | `count` values, each 1–sides; repeats possible |
| Custom die | `rng.dN(sides, o)` | `dN(sides)` | `(1 DiceRoll, 0, sides, 1, 0)` | sides ≥ 2 | one value, 1–sides |
| Dice presets | `rng.d4(o)`, `d6`, `d8`, `d10`, `d12`, `d20` | `d4()`, `d6()`, `d8()`, `d10()`, `d12()`, `d20()` | `(1 DiceRoll, 0, N, 1, 0)` | none | one value, 1–N |
| Coin flip | `rng.coinFlip(o)` | `coinFlip()` | `(2 CoinFlip, 0, 0, 1, 0)` | none | one value: 0 tails, 1 heads |
| Number range | `rng.numberRange(min, max, o)` | `numberRange(min, max)` | `(3 NumberRange, min, max, 1, 0)` | min ≤ max, any uint256; equal endpoints and the full 0 to 2^256−1 range allowed | one value in [min, max] |
| Choose one | `rng.chooseOne(population, o)` | `chooseOne(size)` | `(4 ChooseOne, 0, 0, 1, population)` | population 1–256 | one index, 0 to population−1 |
| Choose many | `rng.chooseMany(population, count, o)` | `chooseMany(size, count)` | `(5 ChooseMany, 0, 0, count, population)` | population 1–256; count 1 to population | `count` distinct indices, without replacement |
| Shuffle | `rng.shuffle(population, o)` | `shuffle(size)` | `(6 Shuffle, 0, 0, population, population)` | population 1–256 | every index 0 to population−1 exactly once |

TypeScript bounds (`sides`, `min`, `max`) are `bigint`; `count`, `size` and `population` are integer `number` values. Invalid parameters throw in TypeScript and revert the request with `InvalidMapping` onchain. Results are `uint256[]` from `getMappedResult` and the coordinator's `mapRandomness`, and `bigint[]` from the SDK's `mapRandomness`. Sampling rejects the short residue range instead of taking a biased modulo. Choice and shuffle results are zero-based indices into a list the application must fix before requesting. Callbacks always receive the raw `bytes32` word, including for mapped requests.

## Pricing

The coordinator prices every request from the base fee of the transaction that creates it:

```
fee = max(minFee, feeMultiplier × baseFee × (fulfillGasOverhead + callbackGasLimit))
```

`pricing()` returns the live `(minFee, feeMultiplier, fulfillGasOverhead)`. The owner can move them with `setPricing(minFee, multiplier, overhead)` (event `PricingChanged`) only within fixed bounds: `minFee` at most 10 USDC (`10e18` wei; native USDC on Arc uses 18 decimals), `feeMultiplier` 0 to 20 where 0 means a flat `minFee`, `fulfillGasOverhead` 100,000 to 2,000,000 gas. Both Arc deployments were initialized with a 0.08 USDC minimum fee (`initialMinFee()`), multiplier 5 and overhead 300,000 gas, together with a 50% keeper share (`keeperFeeBps` 5000) and a 100% refund ratio. These are initialization values, not fixed prices: read the live values instead of hard-coding them. A pricing change never touches requests that are already open, because each request settles from the fee it escrowed.

Labelled examples with the initialization values (multiplier 5, overhead 300,000 gas, 0.08 USDC minimum fee):

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

Do not call `quoteFee` through `eth_call`: it prices with `block.basefee`, which `eth_call` commonly reports as 0 (verified on Arc mainnet), so the answer collapses to `minFee` and the real transaction reverts with `IncorrectFee`. Quote with `quoteFeeAt(callbackGasLimit, latestBlock.baseFeePerGas)`, add a buffer for base-fee movement until inclusion, and send that amount to your consumer. The SDK helper wraps this for ethers 6:

```js
import { quoteRequestFee } from '@d20dao/vrf-sdk';
// provider: ethers Provider; coordinator: coordinator proxy address; 100_000: callbackGasLimit
const { fee, value, baseFee } = await quoteRequestFee(provider, coordinator, 100_000, { bufferBps: 3000 });
await dice.roll(clientSeed, 100_000, { value });
```

`fee` is `quoteFeeAt(callbackGasLimit, baseFee)` for the block's actual base fee. `value` is the same quote recomputed at a base fee `bufferBps` higher (default 3000, 30%: an EIP-1559 base fee can rise 12.5% per block), so the request still pays if the base fee rises by up to that much before inclusion. When the minimum fee dominates even at the buffered base fee, `value` equals `fee` and nothing extra is sent. In example A, `value` is 5 × 228.8 gwei × 400,000 = 0.4576 USDC; a request included at 176 gwei escrows 0.352 USDC, and the remaining 0.1056 USDC is either returned by the consumer or credited to the refund address, depending on the payment pattern below. The helper never uses `quoteFee`, needs only `getBlock` and `call`, and throws if the block has no `baseFeePerGas`. If the base fee outruns the buffer or pricing changes in between, the transaction reverts with `IncorrectFee`; quote again and resend.

### Recommended payment pattern

For a consumer whose users pay per request, pay the exact quote and return the change in the same transaction: read `fee = quoteFee(callbackGasLimit)`, require `msg.value >= fee`, send exactly `fee` to the coordinator and return `msg.value - fee` to the caller. Use the paying user as the refund address when it can receive a native transfer or call `withdrawRefundCredit` (any wallet can), so an expiry refund goes straight back to the payer. The front end sends `value` from `quoteRequestFee`; the unused buffer comes back immediately, nothing accumulates as refund credit and the contract holds no user funds.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {D20VRFRequests} from "@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol";

contract D20Game is D20VRFConsumer {
    using D20VRFRequests for ID20VRF;

    uint32 public constant CALLBACK_GAS = 100_000;
    mapping(uint256 => address) public playerOf;
    mapping(uint256 => bytes32) public wordOf;
    mapping(uint256 => bool) public ready;
    error Underpaid(uint256 fee, uint256 sent);
    error ChangeFailed();
    error UnexpectedCallback();

    constructor(address coordinator) D20VRFConsumer(coordinator) {}

    function roll(bytes32 operationId) external payable returns (uint256 requestId) {
        ID20VRF rng = ID20VRF(vrfCoordinator);
        uint256 fee = rng.quoteFee(CALLBACK_GAS); // exact inside this transaction
        if (msg.value < fee) revert Underpaid(fee, msg.value);
        // The helper pays the same quoteFee from this contract's balance, which msg.value just funded.
        // The player is the refund address: an expiry refund goes straight back to them.
        requestId = rng.d20(D20VRFRequests.Options(keccak256(abi.encode(msg.sender, operationId)), CALLBACK_GAS, msg.sender));
        playerOf[requestId] = msg.sender;
        if (msg.value > fee) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - fee}("");
            if (!ok) revert ChangeFailed();
        }
    }

    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        if (playerOf[requestId] == address(0) || ready[requestId]) revert UnexpectedCallback();
        wordOf[requestId] = randomness;
        ready[requestId] = true;
    }

    /// 1 to 20 once ready.
    function result(uint256 requestId) external view returns (uint256) {
        return ID20VRF(vrfCoordinator).getMappedResult(requestId)[0];
    }
}
```

The other patterns behave as follows:

- **Forward `msg.value`** (`examples/DiceConsumer.sol`). The simplest code: the coordinator escrows the quote and credits everything above it to the refund address as refund credit. With a buffered off-chain quote most requests leave some credit, which the refund address must withdraw in a separate `withdrawRefundCredit` transaction.
- **Pay from the contract balance** (`D20VRFRequests` helpers without returning change, `MiningRandomnessConsumer`). The application funds the contract and charges users under its own rules; it needs its own funding and withdrawal policy, and the refund address decides who receives expiry refunds.

## Reading results

All events come from the coordinator proxy, with `requestId` as the first indexed topic:

| Event | Meaning |
| --- | --- |
| `RandomnessRequested(requestId, consumer, keyHash, clientSeed, requestBlock, callbackGasLimit, feePaid, refundAddress, deadline)` | Request created. Read `requestId` from this log in the request receipt. |
| `MappingRequested(requestId, mappingHash, spec)` | Mapping stored with the request (Raw for `requestRandomness`). |
| `RandomnessFulfilled(requestId, randomness, submitter)` | Proof accepted; `randomness` is final. |
| `CallbackAttempted(requestId, success, gasLimit)` | Result of calling `rawFulfillRandomness`, at fulfillment and at each `retryCallback`. |
| `RequestRefundedTo(requestId, refundAddress, amount, paid)` | Expired request refunded; `paid` false means the amount became refund credit. |
| `RefundCallbackAttempted(requestId, consumer, success, gasLimit)` | Result of the `onRefund` notification. |

Views on the coordinator (all in `coordinatorAbi`; only `getMappedResult` is part of `ID20VRF`, so declare a local interface in Solidity for the others):

- `getRequest(uint256 requestId) returns (Request)` with fields `consumer`, `callbackGasLimit`, `requestBlock`, `targetBlock` (0 until the epoch packet is published), `deadline` (Unix seconds, request time plus 60), `refundAddress`, `clientSeed`, `mappingHash`, `blockHash` (target block hash once stored), `randomness` (zero until fulfilled), `proofHash`, `transcriptHash`, `fulfilled`, `delivered` (callback succeeded), `refunded`, `epochId` and `epochHash` (zero until published). Reverts `UnknownRequest` for an unused ID.
- `getMapping(uint256 requestId) returns (RandomnessMapping.Spec)`: the stored `(operation, lower, upper, count, population)`; all zero (Raw) for `requestRandomness`. Reverts `UnknownRequest`.
- `getMappedResult(uint256 requestId) returns (uint256[])`: the stored word mapped with the stored spec. Reverts `NotFulfilled` before acceptance.
- `mapRandomness(bytes32 randomness, RandomnessMapping.Spec spec) returns (uint256[])`: pure mapping of any word and spec; it does not show that a request was fulfilled. The SDK's `mapRandomness(word, spec)` returns the same values off-chain.
- `requestFeePaid(requestId)`, `requestRefundBps(requestId)`, `refundCredits(address)` and `refundCallbackDelivered(requestId)` show settlement.

Polling with ethers 6, after sending the request through a consumer such as `D20Game`:

```js
import { Contract } from 'ethers';
import { coordinatorAbi } from '@d20dao/vrf-sdk/abi';

const coordinator = new Contract(coordinatorAddress, coordinatorAbi, provider);
const receipt = await (await game.roll(operationId, { value })).wait();
const requestId = receipt.logs
  .filter((log) => log.address.toLowerCase() === coordinatorAddress.toLowerCase())
  .map((log) => coordinator.interface.parseLog(log))
  .find((event) => event?.name === 'RandomnessRequested').args.requestId;

for (;;) {
  const request = await coordinator.getRequest(requestId);
  if (request.fulfilled) { console.log(await coordinator.getMappedResult(requestId)); break; }
  const { timestamp } = await provider.getBlock('latest');
  if (BigInt(timestamp) > request.deadline) break; // expired: refundRequest(requestId) is available
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
```

`fulfilled` means the result is final; `delivered` only reports whether the consumer callback succeeded. Once the latest block timestamp is past `deadline` and `fulfilled` is false, the request can no longer be served. Reading `randomness` over RPC is not proof verification; see [Replay and verification](#replay-and-verification).

## Frontend and backend use

- The package is ESM only (`"type": "module"`, `import` export conditions) for Node 22.13+ and bundlers. In a browser application, import it through a bundler such as Vite, webpack or esbuild; the test suite bundles the root and `/abi` entries for the browser platform with esbuild. Import `@d20dao/vrf-sdk/abi` alone when only ABIs are needed.
- `quoteRequestFee(provider, coordinator, callbackGasLimit, options)` expects an ethers v6 provider such as `JsonRpcProvider` or `BrowserProvider`, or any object with ethers-v6-shaped `getBlock(tag)` (with `baseFeePerGas` as `bigint`) and `call(tx)`. With viem or another client, repeat its steps: read the latest block's `baseFeePerGas`, add the buffer and call `quoteFeeAt(callbackGasLimit, bufferedBaseFee)`.
- Quote from the block header base fee plus a buffer, never with `quoteFee` through `eth_call`, because `eth_call` reports a base fee of 0 (see [Wallets and backends that pay through a consumer](#wallets-and-backends-that-pay-through-a-consumer)).
- Send the transaction to your consumer contract; the coordinator rejects requests from wallets with `ContractConsumerRequired`.

## Request lifecycle

Epochs last 200 blocks. The keeper selects one of four fixed recipes using the canonical block hash at epoch start minus one and prepares its first validated API3 snapshot locally. If the selected source yields no valid packet, the next source slot in a fixed order can be committed instead, one slot per 20-block window (at most three fallbacks); a saved response is never refreshed or resampled. Idle preparation publishes no transaction. An unused local snapshot can be retained for 50 epochs (10,000 blocks), subject to live-demand and unresolved-transaction protection.

A request escrows its quoted fee even when its epoch packet is not published yet, and fixes its original block, epoch, client seed, mapping, refund address, `feePaid`, `refundBps` and 60-second deadline. The keeper publishes the saved packet only for live paid demand. The randomness target becomes `max(requestBlock, committedBlock + 1)`, so its hash is unknown at publication; before publication the request has no usable target or VRF seed. Multiple requests share the packet, and timely requests can settle across epoch boundaries without changing their epoch.

Timely service is onchain proof acceptance at or before `requestedAt + 60` seconds; a pending transaction is not acceptance. At acceptance the keeper share, `keeperFeeBps` of `feePaid`, is paid to the registry's configured committer (never the proof submitter; a failed transfer becomes keeper credit) and the remainder becomes withdrawable protocol fees. With a 50% share, example A pays 0.176 USDC to the keeper and 0.176 USDC to the treasury. Callback failure still earns the fee; `retryCallback(requestId, gasLimit)` redelivers only the same accepted result and never pays a second share.

### Timing

Each request's deadline is its block timestamp plus 60 seconds (`RESPONSE_TIMEOUT`). A proof accepted onchain at or before the deadline serves the request; after it the request can only be refunded. On Arc, a single request is normally fulfilled within a few seconds. In a stress test, 200 simultaneous requests were all delivered within 36 seconds, with a median of 19 seconds; an earlier Arc Testnet run on 2026-09-16 served 68 paid requests within 2–4 chain seconds, 47 of them in batched fulfillments. Measured timings are not an SLA: wait up to the deadline, as in [Reading results](#reading-results), and handle expiry.

### Expiry and refunds

After the deadline passes without an accepted proof, anyone may call `refundRequest(requestId)`. It pays `feePaid × refundBps / 10000` using the ratio snapshotted into the request at creation (`requestRefundBps(requestId)`), and the remainder becomes protocol fees. The ratio defaults to 100%; the owner can lower it with `setRefundBps` (event `RefundBpsChanged`) to no less than 50%, which affects only requests created afterwards. The refund is pushed to the fixed refund address with a 30,000-gas transfer; if that fails, the amount stays as refund credit for that address (`RequestRefundedTo(requestId, refundAddress, amount, paid)`) and is withdrawn with `withdrawRefundCredit`. Gas and application payments are not part of the refund. See [Optional refund notification](#optional-refund-notification) for the consumer hook.

### Gas for refund and retry calls

`refundRequest`, `retryCallback` and `retryRefundCallback` need no value or role, but they forward a fixed or caller-chosen amount of gas to the consumer and revert with `InsufficientCallbackGas` rather than forwarding less. The transaction gas limit must cover that amount, the coordinator's reserve, the storage work before the check, the 1/64 of gas the proxy keeps back at its `DELEGATECALL`, and intrinsic gas:

| Call | Coordinator check before forwarding | Measured minimum transaction gas limit | Suggested gas limit |
| --- | --- | --- | --- |
| `refundRequest(requestId)` | `gasleft() ≥ 100,000 + 100,000/63 + 140,000` (241,587) after settlement, then `≥ 151,587` before `onRefund` | 302,558 to 357,517 | 400,000 |
| `retryCallback(requestId, gasLimit)` | `gasleft() ≥ gasLimit + gasLimit/63 + 140,000`; `gasLimit` 30,000–1,000,000 and not below the request's `callbackGasLimit` | about 1.032 × gasLimit + 184,300 (287,522 at 100,000; 1,216,321 at 1,000,000) | gasLimit + 250,000 |
| `retryRefundCallback(requestId, gasLimit)` | `gasleft() ≥ gasLimit + gasLimit/63 + 50,000`; `gasLimit` 100,000–1,000,000 | about 1.032 × gasLimit + 89,800 (193,038 at 100,000; 1,121,837 at 1,000,000) | gasLimit + 150,000 |

The minimums were measured with the unmodified protocol sources behind `D20Proxy` on a local `cancun` EVM, with consumer hooks that consume all forwarded gas. The `refundRequest` range depends on whether the refund-credit, total-credit and earned-fee storage slots are written for the first time. `eth_estimateGas` finds these minimums because a lower limit reverts; add a margin to an estimate in case state changes before inclusion.

### Batched fulfillment

The keeper may fulfill up to 16 prepared requests in one transaction with `fulfillRandomnessBatch(ids, proofs)`. Every served member runs exactly like `fulfillRandomness`: its own `BlockHashStored`, `RequestServed`, `ProofVerified`, `RandomnessFulfilled`, `FulfillmentEvidence`, `CallbackAttempted` and `KeeperFeePaid` events, settlement from its own `feePaid` and its own callback. Members already fulfilled, refunded or past their deadline are left untouched and marked with `FulfillmentSkipped(requestId, reason)` (1 fulfilled, 2 refunded, 3 past deadline); a wrong seed, invalid proof or unready member reverts the whole batch. Consumers see no difference. Indexers and verifiers must read per-request events and the request's stored state, not transaction calldata: only a single `fulfillRandomness` call is 452 bytes.

## Optional refund notification

After `refundRequest` has paid the fixed refund address or recorded its refund credit, the coordinator calls `onRefund(requestId)` on the original consumer. Extend `D20VRFConsumer` and override `_onRefund(uint256 requestId)` to update application state; the base authenticates the coordinator. The callback only carries the request ID and does not imply that the consumer itself received money. Application assets and fees remain the application's responsibility.

The first attempt forwards 100,000 gas. A reverting or gas-exhausting hook cannot undo the fee settlement. After failure, `retryRefundCallback(requestId, gasLimit)` retries the notification without another payment; successful delivery is recorded by `refundCallbackDelivered(requestId)`. Refund/retry needs sufficient outer gas (see [Gas for refund and retry calls](#gas-for-refund-and-retry-calls)). Never request new randomness from within either callback; use a separate application transaction.

## Replay and verification

Use independently trusted successful receipts and state. Decode the registry `EpochCommitted` packet with `decodeEpochEvidencePacket` and verify with `replayEpochCommitment`, using the original source anchor, exact packet, commit block/time, ordered signers and registry identity. Decode the coordinator `FulfillmentEvidence` packet with `decodeEvidencePacket`, then call `replayCoordinator` with its exported input type (`Parameters<typeof replayCoordinator>[0]`).

`RequestContext` binds both `requestBlock` and `targetBlock`. Validate the epoch from the original request block, reconstruct the target from the actual publication block, and compare the event and stored transcript. Proof evidence is 416 bytes; fulfillment calldata is 452 bytes. Neither evidence packet has a version prefix. Choose the decoder from trusted emitter/event context. Decoding and mapping alone are not proof verification; replay does not authenticate RPC or establish receipt inclusion.

`EpochProtocolConfiguration` is the initialized configuration: `feeRecipient` from `initialFeeRecipient()`, `initialMinFee` from `initialMinFee()` (the `initialize` fee argument), `catalogHash` from `catalogHash()`. Live `pricing()`, `feeRecipient()` and scheduled catalogs never change `protocolConfigurationHash`.

Signer catalogs are per epoch. The registry owner can schedule a replacement catalog with `scheduleCatalog(signers, fromEpoch)` for epochs at least two ahead (event `CatalogScheduled(fromEpoch, catalogHash, signers)`); the current and next epoch, prepared snapshots and open requests keep their signers. `catalogHashAt(epochId)` and `signersAt(epochId)` return the catalog in force for an epoch, and `Epoch.catalogHash` records it at commitment. For replay, `epoch.catalog.signers` must be that per-epoch catalog, taken from `signersAt` or the `CatalogScheduled` history, while `configuration.catalogHash` stays the initial catalog bound into the configuration hash; `replayEpochCommitment` binds the supplied signers to `record.catalogHash`. `catalogHash()` and the slot getters always return the initial catalog.

At publication a signed attestation may be at most 240 seconds old and never future-dated (`MAX_ATTESTATION_AGE`, exported from `/epoch`); `replayEpochCommitment` enforces the same bound against the commit timestamp.

## Security and trust

The contracts have not had an external security audit. The coordinator source carries the developer comment "Prototype: not audited or validated on Arc"; it is kept byte-for-byte because the source is part of the deployed bytecode metadata. The service is now live on Arc Mainnet, and the absence of an external audit still applies. Reusing the unmodified Chainlink VRF verifier does not extend any upstream audit to this coordinator (`notices/PROVENANCE.md`).

Trust model:

- **Owner.** On Arc Mainnet both service proxies are owned by the DAO treasury Safe `0xB57f656149749eff6b496dF090336491f977E744`, which is also the fee recipient; each manifest records the owner for its network. The owner can upgrade either implementation, which can change any behavior. Ownership moves only through a two-step transfer, and `renounceOwnership` reverts.
- **Owner settings without an upgrade.** Coordinator: fee recipient, keeper share (0–100%), pricing within the bounds in [Pricing](#pricing), and the refund ratio for future requests (50–100%). Registry: committer and signer catalogs for epochs at least two ahead. Open requests keep their escrowed fee and refund ratio.
- **Keeper.** The VRF key holder can withhold a proof but cannot substitute a different result for a request's fixed seed. A request that is not served within 60 seconds is refundable at its snapshotted ratio.

D20VRFCoordinator and EpochEntropy use atomically initialized ERC1967 proxies with owner-authorized UUPS upgrades and two-step ownership transfers; `renounceOwnership` reverts on both, so upgrade authority can only move through an accepted transfer. The registry owner can change the committer and schedule future catalogs; the coordinator owner can change fee recipient, keeper share, bounded pricing and the refund ratio. No setter rewrites a request, a published epoch or the VRF key, but upgrade authority can change code and is an explicit trust assumption. Verify the implementation history of BOTH proxies at the relevant receipts; stable proxy addresses alone do not identify executed code. Operators pin the proxy code, initialized configuration and both implementation addresses/runtime hashes; the keeper fails closed on an unreviewed implementation change.

## Use locally

For SDK development, run `npm ci` and `npm test` from this repository. The test builds, packs and installs a real tarball in an isolated consumer, replays the recipe fixtures, type-checks a strict consumer, exercises `quoteRequestFee` against a mock provider and compiles the Solidity sources. `npm pack` also produces an installable local artifact.

```js
import { builtins, mapRandomness, replayCoordinator, quoteRequestFee } from '@d20dao/vrf-sdk';
import { coordinatorAbi, epochEntropyAbi } from '@d20dao/vrf-sdk/abi';
const mapping = builtins.d20();
// Use only an independently verified accepted word for real outcomes.
```

The root exports ESM and TypeScript declarations, including `quoteRequestFee`, `DEFAULT_FEE_BUFFER_BPS` and the `FeeQuote`, `FeeQuoteOptions` and `FeeQuoteProvider` types; `/epoch` exports epoch helpers and `MAX_ATTESTATION_AGE`. `/abi` exports `coordinatorAbi` and `epochEntropyAbi`, with JSON forms `D20VRFCoordinator.json` and `EpochEntropy.json`. The service implementations have locked empty constructors and explicit initializers. Registry initialization takes `address[4]`; it is not a four-address constructor deployment.

## Operational and release boundary

This SDK contains no keeper service, API fetching, proof generation, signer secrets or deployment automation. The canonical keeper has a Docker install wrapper that builds, provisions separately supplied key files and starts from reviewed configuration; inspect its platform-specific guide before use. No deployment or funding is authorized by SDK installation.

Optional Telegram access is disabled unless a bot token and numeric operator chat are explicitly configured. Only that chat can use read-only /status and /keeper commands. Commands never modify configuration or send transactions; notifications are best-effort observations, not chain evidence. This package neither reads bot credentials nor contacts Telegram.

The public protocol source is this repository's [`protocol/`](https://github.com/d20dao/d20-sdk/tree/main/protocol) folder. `PROTOCOL-PROVENANCE.json` names the keeper commit it was copied from and the SHA-256 of every file; that keeper repository is not public, so read the source in `protocol/`. Builds use these reviewed protocol Git blobs and verify every SHA-256 in PROTOCOL-PROVENANCE.json. `src/fees.ts` (the fee-quoting helper) is SDK-owned rather than vendored; BUILD-MANIFEST.json records it under `packageSources` next to the protocol source, dependency-lock and imported OpenZeppelin hashes. The UUPS build uses OpenZeppelin contracts and contracts-upgradeable 5.6.1. Consumer source is copied exactly; service implementations, operator code, test fixtures and provers are excluded from the tarball.

Fixture provenance distinguishes explicit CI signatures from actual API3 responses. Fixtures are not included in the package. The browser-target bundle is executed under Node, not an actual browser session; independently trusted chain context is still required for real verification.

SDK installation provides consumer and verification tooling. Chain availability, provider quotas, upgrade administration and application settlement remain separate concerns. A healthy process alone does not guarantee a particular request's timely fulfillment.

## Deployments

Obtain proxy addresses, implementation addresses and independently checked code hashes from the public deployment manifests, [arc-mainnet.json](https://d20dao.org/deployments/arc-mainnet.json) and [arc-testnet.json](https://d20dao.org/deployments/arc-testnet.json), and check that the coordinator implementation at your chain's proxy exposes `quoteFee`/`quoteFeeAt` (its code hash matches the manifest entry for this protocol version) before relying on this SDK's interface.

### Arc Mainnet

Chain ID: **5042**. The live service; use the **coordinator proxy** when constructing a consumer. Owner and fee recipient: DAO treasury Safe `0xB57f656149749eff6b496dF090336491f977E744`.

| Contract | Role | Arc Mainnet address |
| --- | --- | --- |
| D20VRFCoordinator | Consumer entry point / proxy | [`0xd20da057469C45928912d983F45790C41e290571`](https://explorer.arc.io/address/0xd20da057469C45928912d983F45790C41e290571) |
| EpochEntropy | Epoch registry / proxy | [`0xd20Da048C1A68fa3Bc0B5f5Bc454D1530062C82D`](https://explorer.arc.io/address/0xd20Da048C1A68fa3Bc0B5f5Bc454D1530062C82D) |
| D20CostClient | Restricted cost client / proxy | [`0xD20da0048aED2BBb9f0e7078Bc452815D626D29d`](https://explorer.arc.io/address/0xD20da0048aED2BBb9f0e7078Bc452815D626D29d) |
| D20VRFCoordinator | Implementation | [`0xD20da0c375cEfCdA65703699A4090237057e9b68`](https://explorer.arc.io/address/0xD20da0c375cEfCdA65703699A4090237057e9b68) |
| EpochEntropy | Implementation | [`0xD20Da0cf7Ddc6123f9A87c0C210F8ECB934CA7D5`](https://explorer.arc.io/address/0xD20Da0cf7Ddc6123f9A87c0C210F8ECB934CA7D5) |
| D20CostClient | Implementation | [`0xD20DA00A872acfDe3e4721Fc1051BD23CC84B66b`](https://explorer.arc.io/address/0xD20DA00A872acfDe3e4721Fc1051BD23CC84B66b) |

Addresses are copied from the [Arc Mainnet deployment manifest](https://d20dao.org/deployments/arc-mainnet.json). Mainnet and testnet run the same implementation code.

### Arc Testnet

Chain ID: **5042002**. For development and testing. Use the **coordinator proxy** when constructing a consumer.

| Contract | Role | Arc Testnet address |
| --- | --- | --- |
| D20VRFCoordinator | Consumer entry point / proxy | [`0xd20DA0FF9087d053f0291524Eac12abA1ADBd945`](https://testnet.arcscan.app/address/0xd20DA0FF9087d053f0291524Eac12abA1ADBd945) |
| EpochEntropy | Epoch registry / proxy | [`0xD20Da00B47A7cD2211dC4683E306913b05903756`](https://testnet.arcscan.app/address/0xD20Da00B47A7cD2211dC4683E306913b05903756) |
| D20CostClient | Restricted cost client / proxy | [`0xD20da026090B8472579a2B93030F1fC4c94807F1`](https://testnet.arcscan.app/address/0xD20da026090B8472579a2B93030F1fC4c94807F1) |
| D20VRFCoordinator | Implementation | [`0xD20da0c375cEfCdA65703699A4090237057e9b68`](https://testnet.arcscan.app/address/0xD20da0c375cEfCdA65703699A4090237057e9b68) |
| EpochEntropy | Implementation | [`0xD20Da0cf7Ddc6123f9A87c0C210F8ECB934CA7D5`](https://testnet.arcscan.app/address/0xD20Da0cf7Ddc6123f9A87c0C210F8ECB934CA7D5) |
| D20CostClient | Implementation | [`0xD20DA00A872acfDe3e4721Fc1051BD23CC84B66b`](https://testnet.arcscan.app/address/0xD20DA00A872acfDe3e4721Fc1051BD23CC84B66b) |

Addresses are copied from the [Arc Testnet deployment manifest](https://d20dao.org/deployments/arc-testnet.json). Explorer links identify addresses; they do not assert explorer source-code verification. Implementation addresses change through owner-authorized upgrades, so the implementation rows and code hashes are only valid together with the manifest revision they came from. The pilot consumer is test tooling, not a shared application entry point.
