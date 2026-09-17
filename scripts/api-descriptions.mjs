// Curated descriptions for API.md, rendered by scripts/api-reference.mjs together with the built ABIs in abi/.
//
// Every function, event and error in abi/D20VRFCoordinator.json and abi/EpochEntropy.json needs exactly one entry here,
// and every entry must name an item of that ABI; the generator fails otherwise. Each `src` cites line ranges in
// protocol/contracts/ (the contract's own file unless prefixed with `path:`); the generator checks that the first range
// contains the item's name. Errors and events cite their declaration first and then the lines that raise or emit them.
// "Raised by" and "Emitted by" lists in API.md are derived from the `errors` and `emits` arrays of the functions, so
// keep those arrays complete. Constant values are read from the Solidity source, not written here.
//
// Write what the source does, not what it is meant to do. Link README sections as README.md#anchor; the generator
// checks the anchors.

/** Backticked names that are not ABI items but may appear in descriptions (consumer hooks, SDK exports, builtins). */
export const externalNames = [
  'Address', 'BLOCKHASH', 'D20Proxy', 'D20VRFConsumer', 'D20VRFRequests', 'ECDSA', 'Error', 'ID20VRF', 'Initializable', 'InvalidCoordinator', 'MappingSpec',
  'OnlyCoordinator', 'Panic', 'RandomnessMapping', 'Result', 'abi', 'blockhash', 'builtins', 'decodeEpochEvidencePacket',
  'decodeErrorResult', 'decodeEvidencePacket', 'getValue', 'hashMapping', 'keccak256', 'max', 'onRefund', 'parseError',
  'quoteRequestFee', 'rawFulfillRandomness', 'readEpochRecipes', 'replayEpochCommitment', 'toEthSignedMessageHash', 'toObject', '_onRefund', 'encodeDataTemplate',
];

// Ownership, upgrade and initialization items that both proxies inherit from OpenZeppelin 5.6.1.
const ownershipFunctions = renounceSrc => ({
  owner: { text: 'Current owner: upgrade authority and the only account that can call the setters.' },
  pendingOwner: { text: 'Account nominated by `transferOwnership` that has not accepted yet; zero when none.' },
  transferOwnership: {
    caller: 'Owner',
    text: 'Starts a two-step transfer by nominating `newOwner`; ownership moves only when that account calls `acceptOwnership`. A new call replaces the nomination, and the zero address cancels it.',
    emits: ['OwnershipTransferStarted'],
    errors: ['OwnableUnauthorizedAccount'],
  },
  acceptOwnership: {
    caller: 'Pending owner',
    text: 'Completes the transfer to the caller and clears the nomination.',
    emits: ['OwnershipTransferred'],
    errors: ['OwnableUnauthorizedAccount'],
  },
  renounceOwnership: {
    caller: 'Owner',
    text: 'Disabled and declared `view`: the owner gets `RenounceDisabled` and anyone else `OwnableUnauthorizedAccount`, so the contract always has an owner and upgrade authority can only move through an accepted transfer.',
    errors: ['OwnableUnauthorizedAccount', 'RenounceDisabled'],
    src: renounceSrc,
  },
  upgradeToAndCall: {
    caller: 'Owner, through the proxy',
    text: 'UUPS upgrade: points the proxy at `newImplementation`, which must report the ERC-1967 slot from `proxiableUUID`, and delegatecalls `data` when it is non-empty. An upgrade can change any behavior described here. Integrators check the implementation when they integrate and again whenever a proxy emits `Upgraded` or the deployment manifest records an upgrade (README [Security and trust](README.md#security-and-trust)).',
    emits: ['Upgraded'],
    errors: ['UUPSUnauthorizedCallContext', 'OwnableUnauthorizedAccount', 'ERC1967InvalidImplementation', 'UUPSUnsupportedProxiableUUID', 'ERC1967NonPayable', 'AddressEmptyCode', 'FailedCall'],
  },
  proxiableUUID: {
    text: 'ERC-1822 check used by `upgradeToAndCall`. Returns the ERC-1967 implementation slot when called on an implementation contract directly and reverts through the proxy.',
    errors: ['UUPSUnauthorizedCallContext'],
  },
});

const ownershipEvents = {
  OwnershipTransferStarted: { text: '`transferOwnership` nominated `newOwner`; the zero address means a nomination was cancelled.' },
  OwnershipTransferred: { text: 'Ownership moved: from the zero address at initialization, and at each `acceptOwnership`.' },
  Upgraded: {
    text: 'The proxy now runs `implementation`. Emitted by the proxy at deployment and at every `upgradeToAndCall`. Compare the address with the deployment manifest; an implementation you have not reviewed means stop and review before sending more requests.',
    also: 'proxy deployment',
  },
  Initialized: {
    text: '`initialize` ran on the proxy (`version` 1). Each implementation contract also emitted it once at construction with `version` 2^64 − 1, which locks the implementation against initialization.',
  },
};

const upgradeErrors = {
  OwnableUnauthorizedAccount: {
    text: '`account` is not the owner (owner-only functions) or not the pending owner (`acceptOwnership`).',
    response: 'Only the owner can administer or upgrade the contract; on Arc Mainnet that is the DAO treasury Safe recorded in the deployment manifest.',
  },
  OwnableInvalidOwner: {
    text: '`initialize` was given the zero address as owner.',
    response: 'Deployment-time only.',
  },
  RenounceDisabled: {
    text: 'The owner called `renounceOwnership`, which is disabled.',
    response: 'Move ownership with `transferOwnership` and `acceptOwnership`.',
  },
  InvalidInitialization: {
    text: '`initialize` on a proxy that is already initialized, or on an implementation contract, whose initializers are disabled at construction.',
    response: 'None: initialization happens once, atomically, when `D20Proxy` is deployed.',
  },
  NotInitializing: {
    text: 'Declared by the OpenZeppelin initializer helpers. No public function of this contract can reach it.',
    response: 'None.',
    also: 'no public function (declared by OpenZeppelin `Initializable`)',
  },
  UUPSUnauthorizedCallContext: {
    text: '`upgradeToAndCall` called on the implementation instead of through the proxy, or `proxiableUUID` called through the proxy.',
    response: 'Owner upgrade procedure only.',
  },
  UUPSUnsupportedProxiableUUID: {
    text: 'The new implementation reports a `proxiableUUID` other than the ERC-1967 implementation slot.',
    response: 'Owner upgrade procedure only.',
  },
  ERC1967InvalidImplementation: {
    text: 'The new implementation has no code or no `proxiableUUID`.',
    response: 'Owner upgrade procedure only.',
  },
  ERC1967NonPayable: {
    text: '`upgradeToAndCall` was sent value with empty `data`.',
    response: 'Owner upgrade procedure only.',
  },
  AddressEmptyCode: {
    text: 'Declared by OpenZeppelin `Address` for the delegatecall in `upgradeToAndCall`. Not reachable in practice, because the new implementation must already have code.',
    response: 'None.',
  },
  FailedCall: {
    text: 'The initialization call made by `upgradeToAndCall` reverted without revert data.',
    response: 'Owner upgrade procedure only.',
  },
};

export const references = [
  {
    key: 'coordinator',
    title: 'D20VRFCoordinator',
    abi: 'abi/D20VRFCoordinator.json',
    source: 'D20VRFCoordinator.sol',
    intro: [
      'The consumer entry point. Call the coordinator proxy for your chain (README [Deployments](README.md#deployments)). `ID20VRF` in `contracts/interfaces/ID20VRF.sol` declares the five functions a consumer contract needs (`quoteFee`, `quoteFeeAt`, `requestRandomness`, `requestMappedRandomness`, `getMappedResult`); `coordinatorAbi` from `@d20dao/vrf-sdk/abi` carries everything below. In Solidity, declare a local interface for any other function you call.',
      'Requests, fulfillment, `storeBlockHash`, retries, `refundRequest` and withdrawals are `nonReentrant`. A consumer callback (`rawFulfillRandomness`, `onRefund`) that calls one of them fails with `ReentrancyGuardReentrantCall`, and the coordinator records the callback as failed. Views stay callable from callbacks.',
    ],
    types: {
      'D20VRFCoordinator.Request': {
        src: '59-77',
        text: 'Returned by `getRequest`. It does not contain the escrowed fee or the refund ratio; read `requestFeePaid` and `requestRefundBps`.',
        fields: {
          consumer: 'Contract that made the request; receives `rawFulfillRandomness` and `onRefund`.',
          callbackGasLimit: 'Gas forwarded to `rawFulfillRandomness` at fulfillment, and the lowest `gasLimit` that `retryCallback` accepts.',
          requestBlock: 'Block of the request transaction.',
          targetBlock: 'Block whose hash enters the seed: `max(requestBlock, committedBlock + 1)` of the epoch. 0 until the epoch packet is published.',
          deadline: 'Request block timestamp plus `RESPONSE_TIMEOUT` (60 seconds), in Unix seconds. A proof accepted in a block with timestamp at or before `deadline` serves the request; `refundRequest` needs a block timestamp after it.',
          refundAddress: 'Fixed recipient of the expiry refund and of any overpayment credit.',
          clientSeed: 'Value supplied by the consumer, bound into the seed and emitted in `RandomnessRequested`.',
          mappingHash: '`keccak256(abi.encode(operation, lower, upper, count, population))` of the stored spec; `hashMapping(spec)` in TypeScript.',
          blockHash: 'Target block hash once `storeBlockHash` or fulfillment stored it; zero before.',
          randomness: 'Accepted VRF output. Zero until `fulfilled`.',
          proofHash: '`keccak256(abi.encode(proof))` of the accepted proof. Zero until `fulfilled`.',
          transcriptHash: '`keccak256(abi.encode(TRANSCRIPT_DOMAIN, chainId, coordinator, requestId, protocolConfigurationHash, blockHash, proofHash, randomness, mappingHash, epochId, epochHash))`. Zero until `fulfilled`.',
          fulfilled: 'A proof was accepted. Final: the word can no longer change.',
          delivered: 'A callback attempt succeeded. Stays false after a failed callback until `retryCallback` succeeds; it says nothing about acceptance.',
          refunded: '`refundRequest` settled the request. Never true together with `fulfilled`.',
          epochId: 'Epoch of `requestBlock`, fixed at creation; never zero for an existing request.',
          epochHash: 'Commitment of the published epoch packet. Zero until the packet is published.',
        },
      },
      'RandomnessMapping.Spec': {
        src: 'libraries/RandomnessMapping.sol:7-14',
        text: 'A randomness mapping stored with a request ("mapping" here is not a Solidity `mapping`). The TypeScript `MappingSpec` returned by `builtins` has the same five fields in the same order, with `lower` and `upper` as `bigint`, and ethers encodes it for this struct unchanged. Valid combinations: README [Randomness options](README.md#randomness-options).',
        fields: {
          operation: 'Enum encoded as uint8: 0 Raw, 1 DiceRoll, 2 CoinFlip, 3 NumberRange, 4 ChooseOne, 5 ChooseMany, 6 Shuffle.',
          lower: 'NumberRange minimum; zero for every other operation.',
          upper: 'DiceRoll sides or NumberRange maximum; zero otherwise.',
          count: 'Values returned: the dice count; 1 for CoinFlip, NumberRange and ChooseOne; the number of choices for ChooseMany; the population for Shuffle; 0 for Raw.',
          population: 'Number of items (1 to 256) for ChooseOne, ChooseMany and Shuffle; zero otherwise.',
        },
      },
      'VRF.Proof': {
        src: 'vendor/VRF.sol:570-580',
        text: 'Chainlink secp256k1 VRF proof, verified by the unmodified vendored `VRF.sol`. ABI-encoded it is 416 bytes: the `FulfillmentEvidence` packet.',
        fields: {
          pk: 'VRF public key; must equal `(publicKeyX, publicKeyY)`.',
          gamma: 'Proof point. The accepted word is `keccak256(abi.encode(3, gamma))`.',
          c: 'Proof challenge scalar.',
          s: 'Proof response scalar.',
          seed: 'Must equal `requestSeed(requestId)`.',
          uWitness: 'Address of `c·pk + s·G`, checked by the verifier.',
          cGammaWitness: 'Precomputed `c·gamma`, checked by the verifier.',
          sHashWitness: 'Precomputed `s·hashToCurve(pk, seed)`, checked by the verifier.',
          zInv: 'Inverse of the projective z coordinate of `cGammaWitness + sHashWitness`.',
        },
      },
    },
    functions: [
      {
        title: 'Requesting',
        intro: 'Requests must come from a contract and pay at least the fee computed in their own transaction; see README [Paying for a request](README.md#paying-for-a-request). The registry call a request makes (`checkpointEpoch` for the current epoch) cannot fail in practice, so requests revert only with the errors listed.',
        items: {
          quoteFee: {
            caller: 'Anyone (view)',
            src: '228-233',
            text: 'Fee for a request with this `callbackGasLimit` priced at `block.basefee`, that is `quoteFeeAt(callbackGasLimit, block.basefee)`. Exact inside the requesting transaction, which is how `D20VRFRequests` helpers pay. Through `eth_call` the base fee is commonly reported as 0 (observed on Arc), so the answer collapses to `minFee` and a transaction sent with it reverts `IncorrectFee`. Off-chain, quote with `quoteFeeAt` and the latest header base fee plus a buffer, as `quoteRequestFee` does. It does not check the gas limit range.',
            errors: ['FeeOverflow'],
          },
          quoteFeeAt: {
            caller: 'Anyone (view)',
            src: '220-227',
            text: '`max(minFee, feeMultiplier × baseFee × (fulfillGasOverhead + callbackGasLimit))` over the live pricing for a base fee in wei that you supply; with `feeMultiplier` 0 it returns `minFee`. A quote, not a reservation: pricing can change before your transaction. A `baseFee` large enough to overflow uint256 reverts with `Panic(0x11)` instead of `FeeOverflow`.',
            errors: ['FeeOverflow'],
          },
          requestRandomness: {
            caller: 'Any contract',
            src: '235-240, 248-287',
            text: 'Creates a raw request (spec all zero) with `msg.sender` as consumer and returns its ID. Needs `msg.value` at least the fee computed in this transaction; escrows exactly that fee and credits any excess to `_refundAddress` as refund credit. Fixes the request block, epoch, client seed, refund address, fee, refund ratio (`refundBps`) and a deadline of `block.timestamp + RESPONSE_TIMEOUT`. After acceptance the consumer receives `rawFulfillRandomness(requestId, randomness)` with exactly `callbackGasLimit` gas. Checks run in this order: caller has code, refund address non-zero, gas limit in range, fee, mapping, epoch started.',
            emits: ['FeeOverpaymentCredited', 'RandomnessRequested', 'MappingRequested'],
            errors: ['ContractConsumerRequired', 'InvalidRefundAddress', 'InvalidCallbackGas', 'FeeOverflow', 'IncorrectFee', 'EpochUnavailable'],
          },
          requestMappedRandomness: {
            caller: 'Any contract',
            src: '242-246, 248-287',
            text: 'Same as `requestRandomness`, storing `spec` with the request (`getMapping`, `mappingHash`). The callback still carries the raw word; read the mapped values with `getMappedResult`. `D20VRFRequests` helpers call this function and pay `quoteFee` from the calling contract balance.',
            emits: ['FeeOverpaymentCredited', 'RandomnessRequested', 'MappingRequested'],
            errors: ['ContractConsumerRequired', 'InvalidRefundAddress', 'InvalidCallbackGas', 'FeeOverflow', 'IncorrectFee', 'InvalidMapping', 'EpochUnavailable'],
          },
        },
      },
      {
        title: 'Pricing and refund settings',
        table: true,
        intro: 'Views, callable by anyone. They describe requests created from now on; an existing request settles from its own snapshots (`requestFeePaid`, `requestRefundBps`).',
        items: {
          pricing: { src: '211-213', text: 'Live `(minFee, feeMultiplier, fulfillGasOverhead)`. The outputs are unnamed, so read them by position.' },
          minFee: { src: '44', text: 'Minimum fee in wei, at most `MAX_MIN_FEE` (10 USDC).' },
          feeMultiplier: { src: '46-47', text: 'Base-fee multiplier, 0 to `MAX_FEE_MULTIPLIER` (20); 0 makes every fee `minFee`.' },
          fulfillGasOverhead: { src: '48', text: 'Gas added to `callbackGasLimit` in the fee formula, `MIN_FULFILL_GAS_OVERHEAD` to `MAX_FULFILL_GAS_OVERHEAD`.' },
          refundBps: { src: '49-50', text: 'Current refund ratio in basis points (5000 to 10000), copied into each new request. Not the ratio of an existing request: use `requestRefundBps(requestId)`.' },
        },
      },
      {
        title: 'Reading request state and results',
        intro: 'Views, callable by anyone, including from a callback. Request IDs start at 1 and increase by one; functions taking a `requestId` revert `UnknownRequest` for an ID that was never issued. README [Reading results](README.md#reading-results) shows a polling loop.',
        items: {
          getRequest: {
            caller: 'Anyone (view)',
            src: '289-308, 556-561',
            text: 'Full state of a request, see [`D20VRFCoordinator.Request`](#coordinator-type-d20vrfcoordinator-request). `targetBlock` and `epochHash` are resolved from the registry, so they become non-zero as soon as the epoch packet is published. `fulfilled` means the word is final; `delivered` only reports that a callback succeeded. A request that is not `fulfilled` in a block whose timestamp is after `deadline` has expired and can only be refunded. When polling, read the latest block before `getRequest`, so that a proof included up to that block is visible.',
            errors: ['UnknownRequest'],
          },
          getMapping: {
            caller: 'Anyone (view)',
            src: '340-343',
            text: 'The stored [`RandomnessMapping.Spec`](#coordinator-type-randomnessmapping-spec); all fields zero (Raw) for `requestRandomness`.',
            errors: ['UnknownRequest'],
          },
          getMappedResult: {
            caller: 'Anyone (view)',
            src: '345-349',
            text: 'The accepted word mapped with the stored spec: `[uint256(word)]` for a raw request, otherwise the values in README [Randomness options](README.md#randomness-options). Part of `ID20VRF`. Reverts `NotFulfilled` until a proof is accepted, so an expired or refunded request never has a result. Gas grows with the mapping; a 256-item shuffle is expensive onchain.',
            errors: ['UnknownRequest', 'NotFulfilled'],
          },
          mapRandomness: {
            caller: 'Anyone (pure)',
            src: '351-356',
            text: 'Maps any word with any valid spec, like the SDK `mapRandomness(word, spec)` off-chain. It does not show that a request was fulfilled.',
            errors: ['InvalidMapping'],
          },
          requestFeePaid: {
            caller: 'Anyone (view)',
            src: '331-334',
            text: 'Fee escrowed by the request (`feePaid` in `RandomnessRequested`), excluding any overpayment. The keeper share, the protocol share and the refund are computed from it.',
            errors: ['UnknownRequest'],
          },
          requestRefundBps: {
            caller: 'Anyone (view)',
            src: '335-338',
            text: 'Refund ratio the request copied from `refundBps` at creation. An expiry refund pays `requestFeePaid × requestRefundBps / 10000`; a later `setRefundBps` does not change it.',
            errors: ['UnknownRequest'],
          },
          refundCallbackDelivered: {
            caller: 'Anyone (view)',
            src: '103, 509',
            text: 'True once an `onRefund` notification for the request succeeded, at `refundRequest` or `retryRefundCallback`. Returns false for unknown IDs instead of reverting.',
          },
          nextRequestId: {
            caller: 'Anyone (view)',
            src: '51, 173, 261',
            text: 'ID the next request will receive. Issued IDs are 1 to `nextRequestId() - 1`.',
          },
        },
      },
      {
        title: 'Settlement, refunds and credits',
        intro: 'Recovery calls need no value or role. They forward gas to the consumer and revert `InsufficientCallbackGas` rather than forward less, so the transaction gas limit must cover it (README [Gas for refund and retry calls](README.md#gas-for-refund-and-retry-calls)). Refund credit and keeper credit are pull balances: only the holder withdraws them.',
        items: {
          refundRequest: {
            caller: 'Anyone',
            src: '464-488, 500-511',
            text: 'Refunds an unfulfilled request once a block timestamp is after its deadline. Marks it refunded, sends `feePaid × requestRefundBps / 10000` to the fixed refund address with a 30,000-gas transfer, or adds it to that address\'s refund credit if the transfer fails, and adds the rest of the fee to `earnedFees`. Then calls `onRefund(requestId)` on the consumer with 100,000 gas; a failed notification does not undo the refund. The caller receives nothing. Measured minimum transaction gas limit 302,558 to 357,517; use 400,000.',
            emits: ['RequestRefundedTo', 'RefundCallbackAttempted'],
            errors: ['UnknownRequest', 'RefundNotAvailable', 'InsufficientCallbackGas'],
          },
          retryCallback: {
            caller: 'Anyone',
            src: '454-462, 611-628',
            text: 'Calls `rawFulfillRandomness` again with the same accepted word after a failed callback, forwarding `gasLimit` (30,000 to 1,000,000 and not below the request\'s `callbackGasLimit`). Sets `delivered` on success. Pays nobody and never changes the word. Transaction gas limit: about `gasLimit + 250,000`.',
            emits: ['CallbackAttempted'],
            errors: ['UnknownRequest', 'NotFulfilled', 'AlreadyDelivered', 'InvalidCallbackGas', 'InsufficientCallbackGas'],
          },
          retryRefundCallback: {
            caller: 'Anyone',
            src: '490-498, 500-511',
            text: 'Repeats a failed `onRefund` notification for a refunded request with `gasLimit` (100,000 to 1,000,000). Never transfers funds again. Transaction gas limit: about `gasLimit + 150,000`.',
            emits: ['RefundCallbackAttempted'],
            errors: ['UnknownRequest', 'NotRefunded', 'RefundCallbackAlreadyDelivered', 'InvalidCallbackGas', 'InsufficientCallbackGas'],
          },
          withdrawRefundCredit: {
            caller: 'Refund-credit holder',
            src: '513-523',
            text: 'Sends all of the caller\'s refund credit, `refundCredits(msg.sender)`, to `recipient` with all remaining gas. Credit comes from overpayment and from refund transfers that failed, and belongs to the request\'s refund address, so that address must make the call. If `recipient` rejects the transfer the call reverts and the credit stays.',
            emits: ['RefundCreditWithdrawn'],
            errors: ['InvalidRefundAddress', 'NoRefundCredit', 'TransferFailed'],
          },
          withdrawFees: {
            caller: 'Fee recipient',
            src: '525-534',
            text: 'Sends all `earnedFees` to `recipient`. Fees accrue at acceptance (fee minus keeper share) and from the part of a refunded fee that is not returned; open escrow is never included. With nothing earned it sends zero without reverting.',
            emits: ['FeesWithdrawn'],
            errors: ['OnlyFeeRecipient', 'InvalidConfig', 'TransferFailed'],
          },
          withdrawKeeperCredit: {
            caller: 'Keeper-credit holder',
            src: '536-545',
            text: 'Sends all of the caller\'s keeper credit (keeper-share transfers that failed) to `recipient`.',
            emits: ['KeeperCreditWithdrawn'],
            errors: ['InvalidConfig', 'NoKeeperCredit', 'TransferFailed'],
          },
        },
      },
      {
        title: 'Settlement balances',
        table: true,
        intro: 'Views, callable by anyone. Amounts are in wei of native USDC.',
        items: {
          refundCredits: { src: '57', text: 'Refund credit that an address can withdraw with `withdrawRefundCredit`.' },
          totalRefundCredits: { src: '56', text: 'Sum of all refund credit held by the coordinator.' },
          earnedFees: { src: '52', text: 'Protocol fees that the fee recipient can withdraw.' },
          feeRecipient: { src: '40', text: 'Address allowed to call `withdrawFees`; changed with `setFeeRecipient`.' },
          keeperFeeBps: { src: '41, 431', text: 'Keeper share of each accepted fee in basis points (0 to 10000). Read at acceptance, not snapshotted: a change applies to open requests accepted afterwards. It only splits the escrowed fee; what the consumer paid and can be refunded does not change.' },
          keeperCredits: { src: '42', text: 'Keeper credit that an address can withdraw with `withdrawKeeperCredit`.' },
          totalKeeperCredits: { src: '43', text: 'Sum of all keeper credit held by the coordinator.' },
        },
      },
      {
        title: 'Keeper and proof functions',
        intro: 'Proof submission is permissionless: anyone holding a valid proof may submit it, and the keeper share goes to the submitting wallet when the registry authorizes it as its committer or a backup committer, and to `committer()` otherwise. Consumers normally only read `getRequest`. Besides the custom errors listed, proof functions can revert with `Error(string)` messages from the vendored VRF verifier, such as `invalid proof`, which are not in the ABI.',
        items: {
          fulfillRandomness: {
            caller: 'Anyone',
            src: '389-397, 413-446',
            text: 'Accepts a proof for a request that is not fulfilled, not refunded and not past its deadline; acceptance in a block with timestamp equal to `deadline` is timely. Stores the target block hash if needed, verifies the proof against `requestSeed(requestId)`, stores the word, proof hash and transcript hash, sets `fulfilled`, adds `feePaid` minus the keeper share to `earnedFees` and calls the consumer with `callbackGasLimit` gas. It then sends the keeper share (`keeperFeeBps` of `feePaid`) to `committer()` with 30,000 gas, or records it as keeper credit. A failing callback does not revert the fulfillment.',
            emits: ['BlockHashStored', 'RequestServed', 'ProofVerified', 'RandomnessFulfilled', 'FulfillmentEvidence', 'CallbackAttempted', 'KeeperFeePaid'],
            errors: ['UnknownRequest', 'AlreadyFulfilled', 'RequestRefunded', 'RequestExpired', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed', 'EvidencePacketTooLarge', 'InsufficientCallbackGas'],
          },
          fulfillRandomnessBatch: {
            caller: 'Anyone',
            src: '399-411',
            text: 'Fulfills up to `MAX_FULFILL_BATCH` (16) requests, one proof each. Members already fulfilled, refunded or past their deadline, including an ID repeated in the batch, are skipped with `FulfillmentSkipped`; every other member runs exactly like `fulfillRandomness` and emits the same events, so an unknown ID, an unready member or an invalid proof reverts the whole batch.',
            emits: ['FulfillmentSkipped', 'BlockHashStored', 'RequestServed', 'ProofVerified', 'RandomnessFulfilled', 'FulfillmentEvidence', 'CallbackAttempted', 'KeeperFeePaid'],
            errors: ['InvalidBatch', 'UnknownRequest', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed', 'EvidencePacketTooLarge', 'InsufficientCallbackGas'],
          },
          storeBlockHash: {
            caller: 'Anyone',
            src: '368-372, 562-577',
            text: 'Resolves the target block from the published epoch, stores its hash if not stored yet and returns it. Fulfillment does this automatically; calling it earlier keeps a request provable after its target leaves the 256-block `BLOCKHASH` window. Needs `block.number` at least `targetBlock + confirmationBlocks`. Works on any request, whatever its status.',
            emits: ['BlockHashStored'],
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          verifyRequestProof: {
            caller: 'Anyone (view)',
            src: '358-366',
            text: 'Returns the word a proof yields for the request\'s seed, without changing state. A valid proof is not acceptance: check `getRequest(requestId).fulfilled`.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed'],
          },
          requestSeed: {
            caller: 'Anyone (view)',
            src: '374-379, 579-587',
            text: 'Seed the proof must use: `keccak256(abi.encode(SEED_DOMAIN, chainId, coordinator, keyHash, requestId, consumer, clientSeed, mappingHash, requestBlock, targetBlock, blockHash, epochId, epochHash))` as uint256. Available only after publication and `confirmationBlocks` confirmations of the target block.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          getProofContext: {
            caller: 'Anyone (view)',
            src: '381-387',
            text: '`requestSeed` together with `deadline`, `fulfilled` and `refunded`. It reverts `NotReady` like `requestSeed`, so it is not a status read for waiting requests; use `getRequest`.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          getPendingRequestIds: {
            caller: 'Anyone (view)',
            src: '310-329',
            text: 'Scans `limit` (1 to 256) request IDs from `fromId` (at least 1) and returns those not fulfilled, not refunded and not past their deadline, with the ID to continue from. Continue with `nextCursor` until it equals `nextRequestId()`. The answer can be stale by the time a transaction lands.',
            errors: ['InvalidScan'],
          },
        },
      },
      {
        title: 'Keeper, key and configuration reads',
        table: true,
        intro: 'Views, callable by anyone. Nothing here has a setter except through an upgrade.',
        items: {
          lastServedRequestId: { src: '53, 433', text: 'ID of the most recently accepted request; 0 before the first.' },
          lastServedIndex: { src: '54, 434', text: 'Number of accepted requests so far: the `serveIndex` of the latest `RequestServed`.' },
          servedRequestAt: { src: '55, 434', text: 'Request ID accepted at a serve index (from 1); 0 for an index not used yet.' },
          keyHash: { src: '37, 180', text: '`keccak256(abi.encode(publicKey))` of the VRF key; indexed in `RandomnessRequested` and `ProofVerified`.' },
          publicKeyX: { src: '35', text: 'x coordinate of the VRF public key.' },
          publicKeyY: { src: '36', text: 'y coordinate of the VRF public key.' },
          confirmationBlocks: { src: '45, 564', text: 'Blocks after the target block before the seed and proofs become available (1 to 64, set at initialization).' },
          epochRegistry: { src: '33', text: 'The `EpochEntropy` proxy that supplies epochs and the keeper-share recipient.' },
          protocolConfigurationHash: { src: '32, 190', text: 'Hash of the initialized configuration (public key, initial fee recipient, initial minimum fee, confirmations, registry, initial catalog hash, first epoch start, epoch length 200) under `CONFIG_DOMAIN`. Bound into every transcript hash.' },
          initialFeeRecipient: { src: '39, 182', text: 'Fee recipient given to `initialize`, used by replay. The live payout address is `feeRecipient()`.' },
          initialMinFee: { src: '105, 185', text: 'Minimum fee given to `initialize`, used by replay. The live minimum is `minFee()`.' },
        },
      },
      {
        title: 'Owner administration',
        intro: 'Owner-only functions revert `OwnableUnauthorizedAccount` for anyone else. No setter can change an existing request, the VRF key, the registry or the confirmations.',
        items: {
          setPricing: {
            caller: 'Owner',
            src: '205-210',
            text: 'Sets `minFee` (at most `MAX_MIN_FEE`, 10 USDC), `feeMultiplier` (at most `MAX_FEE_MULTIPLIER`, 20) and `fulfillGasOverhead` (`MIN_FULFILL_GAS_OVERHEAD` to `MAX_FULFILL_GAS_OVERHEAD`, 100,000 to 2,000,000 gas). Affects requests created afterwards; open requests keep their escrowed fee.',
            emits: ['PricingChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setRefundBps: {
            caller: 'Owner',
            src: '214-218',
            text: 'Sets the refund ratio for requests created afterwards, `MIN_REFUND_BPS` (5000) to 10000.',
            emits: ['RefundBpsChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setKeeperFeeBps: {
            caller: 'Owner',
            src: '201-204',
            text: 'Sets the keeper share, 0 to 10000 basis points. Read at each acceptance, so it also applies to open requests accepted later.',
            emits: ['KeeperFeeBpsChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setFeeRecipient: {
            caller: 'Owner',
            src: '197-200',
            text: 'Sets the address allowed to withdraw `earnedFees`, including fees earned before the change. The zero address is rejected.',
            emits: ['FeeRecipientChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          ...ownershipFunctions('194-195'),
          initialize: {
            caller: 'Once, by `D20Proxy` at deployment',
            src: '170-191',
            text: 'Sets owner, VRF public key, fee recipient, minimum fee, confirmations, registry and keeper share, with `feeMultiplier` 5, `fulfillGasOverhead` 300,000 and `refundBps` 10000. A public key that is not on the curve can also revert with an `Error(string)` from the verifier.',
            emits: ['OwnershipTransferred', 'Initialized'],
            errors: ['InvalidInitialization', 'OwnableInvalidOwner', 'InvalidConfig', 'InvalidPublicKey'],
          },
        },
      },
      {
        title: 'Constants',
        constants: true,
        intro: 'Views returning values fixed in the implementation code.',
        items: {
          MIN_CALLBACK_GAS: { text: 'Lowest `callbackGasLimit` and `retryCallback` gas limit.' },
          MAX_CALLBACK_GAS: { text: 'Highest callback or notification gas limit.' },
          RESPONSE_TIMEOUT: { text: 'Seconds from the request block timestamp to `deadline`.' },
          REFUND_CALLBACK_GAS: { text: 'Gas for the first `onRefund` notification, and the lowest `retryRefundCallback` gas limit.' },
          MAX_FULFILL_BATCH: { text: 'Most requests per `fulfillRandomnessBatch`.' },
          MAX_EVIDENCE_PACKET_BYTES: { text: 'Upper bound on the `FulfillmentEvidence` packet (actual size 416 bytes).' },
          MAX_MIN_FEE: { text: 'Highest `minFee`: 10 USDC in 18-decimal native units.' },
          MAX_FEE_MULTIPLIER: { text: 'Highest `feeMultiplier`.' },
          MIN_FULFILL_GAS_OVERHEAD: { text: 'Lowest `fulfillGasOverhead`.' },
          MAX_FULFILL_GAS_OVERHEAD: { text: 'Highest `fulfillGasOverhead`.' },
          MIN_REFUND_BPS: { text: 'Lowest `refundBps` (50%).' },
          SEED_DOMAIN: { text: 'Domain tag of `requestSeed`.' },
          TRANSCRIPT_DOMAIN: { text: 'Domain tag of the transcript hash.' },
          CONFIG_DOMAIN: { text: 'Domain tag of `protocolConfigurationHash`.' },
          UPGRADE_INTERFACE_VERSION: { valueFrom: 'node_modules/@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol', text: 'OpenZeppelin UUPS interface version: upgrades go through `upgradeToAndCall` only.' },
        },
      },
    ],
    events: [
      {
        title: 'Request lifecycle',
        items: {
          RandomnessRequested: {
            src: '139-143, 284-285',
            text: 'A request was created. `feePaid` is the escrowed fee, not `msg.value`; `deadline` is the block timestamp plus 60 seconds. Read `requestId` from this log in the request receipt, filtering by the coordinator address and event name: with an overpayment, `FeeOverpaymentCredited` comes first.',
          },
          MappingRequested: {
            src: '158, 286',
            text: 'Emitted right after `RandomnessRequested` with the stored spec (all zero for a raw request) and its hash.',
          },
          FeeOverpaymentCredited: {
            src: '152, 278-283',
            text: '`msg.value` exceeded the fee and `amount` was added to `refundCredits(refundAddress)`, independently of what happens to the request. Emitted before `RandomnessRequested`.',
          },
          BlockHashStored: {
            src: '144, 570-577',
            text: 'The target block hash of the request was stored. Emitted once per request: by `storeBlockHash`, or by fulfillment if the hash was not stored before.',
          },
          RequestServed: {
            src: '160, 433-435',
            text: 'A proof was accepted. `serveIndex` counts accepted requests from 1 (`lastServedIndex`, `servedRequestAt`).',
          },
          ProofVerified: {
            src: '159, 436',
            text: 'Seed and hash of the accepted proof.',
          },
          RandomnessFulfilled: {
            src: '145, 437',
            text: 'A proof was accepted and `randomness` is final. `submitter` sent the transaction and is not paid for it.',
          },
          FulfillmentEvidence: {
            src: '163-164, 448-452',
            text: 'The accepted proof as a 416-byte ABI-encoded packet, indexed by `transcriptHash`. Decode it with `decodeEvidencePacket`; take evidence from this log, not from calldata, since a batch carries several proofs.',
          },
          CallbackAttempted: {
            src: '146, 611-628',
            text: 'Result of calling `rawFulfillRandomness` with `gasLimit` gas, at fulfillment and at each `retryCallback`. `success` false means the consumer reverted, ran out of gas or has no code; the word is accepted either way.',
          },
          KeeperFeePaid: {
            src: '153, 440-445',
            text: 'At acceptance, when the keeper share is non-zero: `amount` went to `keeper`, the submitter when the registry authorizes it and `committer()` otherwise, by a 30,000-gas transfer (`paid` true) or was added to `keeperCredits(keeper)` (`paid` false). Emitted after `CallbackAttempted`.',
          },
          FulfillmentSkipped: {
            src: '161-162, 407-408',
            text: 'A batch member was left untouched: `reason` 1 already fulfilled, 2 refunded, 3 past its deadline.',
          },
          RequestRefundedTo: {
            src: '155, 486',
            text: 'An expired request was refunded: `amount` (`feePaid × requestRefundBps / 10000`) was sent to `refundAddress` (`paid` true) or added to its refund credit (`paid` false).',
          },
          RefundCallbackAttempted: {
            src: '157, 500-511',
            text: 'Result of calling `onRefund(requestId)` on `consumer` with `gasLimit` gas: 100,000 at `refundRequest`, the caller\'s limit at `retryRefundCallback`.',
          },
        },
      },
      {
        title: 'Credits and withdrawals',
        items: {
          RefundCreditWithdrawn: { src: '156, 522', text: '`owner`, the credit holder (not the contract owner), withdrew `amount` of refund credit to `recipient`.' },
          KeeperCreditWithdrawn: { src: '154, 544', text: '`keeper` withdrew `amount` of keeper credit to `recipient`.' },
          FeesWithdrawn: { src: '147, 533', text: 'The fee recipient withdrew `amount` of earned fees to `recipient`.' },
        },
      },
      {
        title: 'Administration and upgrades',
        items: {
          PricingChanged: { src: '150, 209', text: 'New `minFee`, `feeMultiplier` and `fulfillGasOverhead` for requests created afterwards.' },
          RefundBpsChanged: { src: '151, 217', text: 'New refund ratio for requests created afterwards.' },
          KeeperFeeBpsChanged: { src: '149, 203', text: 'New keeper share, applied at later acceptances, including of requests already open.' },
          FeeRecipientChanged: { src: '148, 199', text: 'New address allowed to withdraw earned fees.' },
          ...ownershipEvents,
        },
      },
    ],
    errors: [
      {
        title: 'Requesting',
        items: {
          ContractConsumerRequired: {
            src: '111, 251',
            text: 'The caller of a request function has no code: an externally owned account, or a contract still running its constructor.',
            response: 'Send the request through a deployed consumer contract (README [Integrate a consumer](README.md#integrate-a-consumer)), and not from its constructor.',
          },
          InvalidRefundAddress: {
            src: '125, 252, 515',
            text: 'A request named the zero address as refund address, or `withdrawRefundCredit` named the zero address as recipient.',
            response: 'Pass a non-zero address that can receive a plain native transfer or call `withdrawRefundCredit`.',
          },
          InvalidCallbackGas: {
            src: '113, 460, 496, 607-609',
            text: 'A gas limit is out of range: a request `callbackGasLimit` outside 30,000 to 1,000,000; a `retryCallback` limit outside that range or below the request\'s `callbackGasLimit`; a `retryRefundCallback` limit outside 100,000 to 1,000,000.',
            response: 'Use a limit inside the range; retry with at least the original limit.',
          },
          IncorrectFee: {
            src: '112, 255',
            text: '`actual` (`msg.value`) is below `expected`, the fee computed in the request transaction. No request was created.',
            response: 'Quote again with `quoteFeeAt(callbackGasLimit, latestBlock.baseFeePerGas)` plus a buffer (`quoteRequestFee`) and resend. A contract paying in the same transaction sends `quoteFee(callbackGasLimit)`. Never quote with `quoteFee` through `eth_call`.',
          },
          FeeOverflow: {
            src: '136, 225',
            text: 'The dynamic fee exceeds the uint96 escrow limit. Within the pricing bounds that needs a base fee above about 1.3e21 wei.',
            response: 'Not expected on a live chain. For `quoteFeeAt`, check that `baseFee` is in wei.',
          },
          InvalidMapping: {
            src: 'libraries/RandomnessMapping.sol:19, 21-39',
            text: 'The spec breaks the rules for its operation (README [Randomness options](README.md#randomness-options)). Declared in `RandomnessMapping`.',
            response: 'Build specs with the `D20VRFRequests` helpers or TypeScript `builtins`, which enforce the same bounds.',
          },
          EpochUnavailable: {
            src: '109, 259',
            text: 'The request block is before the registry\'s first epoch: `epochForBlock(block.number)` is 0.',
            response: 'Not expected on the Arc deployments, whose epochs have started. Check that you call the coordinator proxy for your chain; on a new deployment, wait for `firstEpochStart`.',
          },
        },
      },
      {
        title: 'Reading and recovery',
        items: {
          UnknownRequest: {
            src: '114, 547-550',
            text: 'No request has this ID: 0, or not below `nextRequestId()`. An unknown ID also reverts a whole `fulfillRandomnessBatch`.',
            response: 'Take `requestId` from the `RandomnessRequested` log of the request receipt, and read from the same chain and coordinator proxy.',
          },
          NotFulfilled: {
            src: '118, 347, 457',
            text: '`getMappedResult` or `retryCallback` on a request without an accepted proof, including an expired or refunded one.',
            response: 'Poll `getRequest(requestId)` until `fulfilled`. Once a block timestamp is after `deadline` without fulfillment, the request has expired and only `refundRequest` applies.',
          },
          AlreadyDelivered: {
            src: '119, 458',
            text: '`retryCallback` on a request whose callback already succeeded.',
            response: 'Nothing to retry.',
          },
          RefundNotAvailable: {
            src: '128, 469',
            text: '`refundRequest` on a request that is fulfilled, already refunded, or not yet past its deadline (the block timestamp must be greater than `deadline`).',
            response: 'Read `getRequest`: use the result if `fulfilled`, stop if `refunded`, otherwise retry after a block with a later timestamp than `deadline`.',
          },
          NotRefunded: {
            src: '131, 493',
            text: '`retryRefundCallback` on a request that has not been refunded.',
            response: 'Call `refundRequest` after the deadline first.',
          },
          RefundCallbackAlreadyDelivered: {
            src: '132, 494',
            text: '`retryRefundCallback` after an `onRefund` notification already succeeded (`refundCallbackDelivered`).',
            response: 'Nothing to retry.',
          },
          InsufficientCallbackGas: {
            src: '122, 478, 503, 619-620',
            text: 'Too little gas remained to forward the full callback budget and keep the coordinator\'s reserve: `gasLimit + gasLimit/63 + 140,000` before a fulfillment callback, `100,000 + 100,000/63 + 140,000` after refund settlement, `gasLimit + gasLimit/63 + 50,000` before a refund notification. The coordinator reverts instead of forwarding less.',
            response: 'Raise the transaction gas limit: 400,000 for `refundRequest`, `gasLimit + 250,000` for `retryCallback`, `gasLimit + 150,000` for `retryRefundCallback` (README [Gas for refund and retry calls](README.md#gas-for-refund-and-retry-calls)). `eth_estimateGas` finds the minimum.',
          },
        },
      },
      {
        title: 'Credits and withdrawals',
        items: {
          NoRefundCredit: {
            src: '129, 517',
            text: '`withdrawRefundCredit` from an address without refund credit. Credit is keyed by the refund address, which must be `msg.sender`.',
            response: 'Call from the refund address; `refundCredits(address)` shows the balance.',
          },
          TransferFailed: {
            src: '124, 521, 532, 543',
            text: 'The `recipient` of `withdrawRefundCredit`, `withdrawFees` or `withdrawKeeperCredit` rejected the native transfer. Balances are unchanged.',
            response: 'Choose a recipient that accepts plain native transfers.',
          },
          OnlyFeeRecipient: {
            src: '123, 527',
            text: '`withdrawFees` from an address other than `feeRecipient()`.',
            response: 'Only the fee recipient withdraws protocol fees.',
          },
          NoKeeperCredit: {
            src: '130, 539',
            text: '`withdrawKeeperCredit` from an address without keeper credit.',
            response: '`keeperCredits(address)` shows the balance.',
          },
        },
      },
      {
        title: 'Proofs and keepers',
        items: {
          NotReady: {
            src: '115, 564',
            text: 'The request cannot be proven yet: its epoch packet is not published, or `block.number` is below `targetBlock + confirmationBlocks`.',
            response: 'For a consumer this only means the request is still waiting. Keepers retry after publication and confirmations.',
          },
          BlockHashUnavailable: {
            src: '116, 567',
            text: 'The target block hash was never stored and is outside the 256-block `BLOCKHASH` window. The request can no longer be fulfilled.',
            response: 'Call `refundRequest` after the deadline. Keepers call `storeBlockHash` before the window closes.',
          },
          AlreadyFulfilled: {
            src: '117, 393',
            text: '`fulfillRandomness` on a fulfilled request.',
            response: 'Nothing to do; read the result.',
          },
          RequestRefunded: {
            src: '127, 394',
            text: '`fulfillRandomness` on a refunded request.',
            response: 'The request is settled and will never have a result.',
          },
          RequestExpired: {
            src: '126, 395',
            text: '`fulfillRandomness` in a block whose timestamp is after the request\'s deadline.',
            response: 'The request can only be refunded with `refundRequest`.',
          },
          WrongPublicKey: {
            src: '120, 592',
            text: 'The proof\'s `pk` is not the coordinator\'s VRF key.',
            response: 'Only proofs from the configured key are accepted.',
          },
          WrongSeed: {
            src: '121, 594',
            text: 'The proof\'s `seed` differs from `requestSeed(requestId)`.',
            response: 'Prove the stored seed; it cannot change.',
          },
          EvidencePacketTooLarge: {
            src: '134, 450',
            text: 'The encoded proof exceeds `MAX_EVIDENCE_PACKET_BYTES`. A proof always encodes to 416 bytes, so valid calls never reach this bound.',
            response: 'None expected.',
          },
          InvalidBatch: {
            src: '137, 404',
            text: '`fulfillRandomnessBatch` with no IDs, more than 16, or a different number of proofs.',
            response: 'Send 1 to 16 IDs with one proof each.',
          },
          InvalidScan: {
            src: '133, 316',
            text: '`getPendingRequestIds` with `fromId` 0, `limit` 0 or `limit` above 256.',
            response: 'Start at 1 and page with at most 256.',
          },
        },
      },
      {
        title: 'Administration, initialization and upgrades',
        items: {
          InvalidConfig: {
            src: '108, 174-175, 198, 202, 207, 216, 528, 537',
            text: 'A value is out of bounds: in `initialize` (zero fee recipient, confirmations 0 or above 64, keeper share above 10000, minimum fee above 10 USDC, registry without code), `setFeeRecipient` with zero, `setKeeperFeeBps` above 10000, `setPricing` outside its bounds, `setRefundBps` outside 5000 to 10000, or a zero `recipient` for `withdrawFees` or `withdrawKeeperCredit`.',
            response: 'Use values within the bounds given for each function.',
          },
          InvalidPublicKey: {
            src: '110, 177',
            text: '`initialize` with a VRF public key that is not on secp256k1.',
            response: 'Deployment-time only.',
          },
          ReentrancyGuardReentrantCall: {
            text: 'A `nonReentrant` coordinator function (a request, `storeBlockHash`, a fulfillment, a retry, `refundRequest` or a withdrawal) was entered while another was running, for example a request made inside `rawFulfillRandomness` or `onRefund`. Inside a callback the coordinator catches it and records the callback as failed.',
            response: 'Do not call coordinator state-changing functions from callbacks; request again in a separate transaction.',
            also: 'any `nonReentrant` function entered from a callback or transfer',
          },
          ...upgradeErrors,
          RenounceDisabled: { ...upgradeErrors.RenounceDisabled, src: '135, 195' },
        },
      },
    ],
  },
  {
    key: 'registry',
    title: 'EpochEntropy',
    abi: 'abi/EpochEntropy.json',
    source: 'EpochEntropy.sol',
    intro: [
      'The epoch registry. A consumer never needs to call it: a request fixes its epoch automatically, and the coordinator reads the registry for targets and for the keeper-share recipient. The first group and the events matter to consumers and verifiers (README [Replay and verification](README.md#replay-and-verification)); publication and administration are listed for completeness.',
      'Epoch sources are recipes in an owner-managed, append-only registry: each has an id, a canonical request whose `keccak256` is the query hash its signer signs, a data template that fixes the exact signed bytes the registry accepts (README [Data templates](README.md#data-templates)) and the JSON body keepers post to the provider gateway. A catalog lists 1 to `MAX_SOURCES` registered recipes with one signer each; each epoch selects from the catalog in force for it (`catalogAt`).',
    ],
    types: {
      'EpochEntropy.Epoch': {
        src: '45-48',
        text: 'Returned by `getEpoch`; all zero until the epoch is published.',
        fields: {
          epochHash: 'Epoch commitment: `keccak256(abi.encode(EPOCH_DOMAIN, chainId, registry, catalogHash, epochId, epochStart, anchorHash, source, queryHash, dataHash, attestationHash))`.',
          catalogHash: 'Hash of the catalog in force for the epoch (`catalogAt`) at publication.',
          anchorHash: 'Hash of block `epochStart - 1`, which selects the source.',
          source: 'Committed slot in the epoch\'s catalog, 0 to `sourceCountAt(epochId) - 1`: the selected slot or a fallback. The recipe is the catalog\'s recipe at that slot.',
          queryHash: '`keccak256` of the canonical request of the slot\'s recipe.',
          dataHash: '`keccak256` of the signed response data.',
          attestationHash: '`keccak256(abi.encode(queryHash, timestamp, dataHash, keccak256(signature)))`.',
          signedAt: 'Attestation timestamp in Unix seconds.',
          committedBlock: 'Publication block. Requests of the epoch target `max(requestBlock, committedBlock + 1)`.',
        },
      },
      'EpochEntropy.Selection': {
        src: '43-44, 262-273',
        text: 'Returned by `getEpochSelection` and `getEpochFallbackSelection`.',
        fields: {
          source: 'Slot in the epoch\'s catalog.',
          recipe: 'Registered recipe id at that slot.',
          airnode: 'Signer of that slot in the catalog in force for the epoch.',
          selector: '`keccak256(abi.encode(SELECT_DOMAIN, catalogHash, epochId, anchor))`; the slot is `(selector mod count + attempt) mod count` with `count = sourceCountAt(epochId)`.',
          queryHash: '`keccak256` of `canonicalRequest`.',
          canonicalRequest: 'Canonical request of the recipe, as `getRecipe` returns it.',
        },
      },
      'EpochEntropy.Attestation': {
        src: '42, 280-300',
        text: 'Signed source response passed to `commitEpoch` and `commitEpochFallback`.',
        fields: {
          timestamp: 'Signing time in Unix seconds; not in the future and at most `MAX_ATTESTATION_AGE` old at publication.',
          data: 'Signed response bytes, at most `MAX_DATA_BYTES` (128), matching the data template of the slot\'s recipe exactly.',
          signature: 'Signature over `toEthSignedMessageHash(keccak256(abi.encodePacked(queryHash, timestamp, data)))`.',
        },
      },
    },
    functions: [
      {
        title: 'Epoch state for consumers and verifiers',
        intro: 'Views, callable by anyone. Epoch IDs start at 1; each epoch lasts `EPOCH_LENGTH` (200) blocks.',
        items: {
          epochForBlock: {
            caller: 'Anyone (view)',
            src: '235-237',
            text: 'Epoch containing a block: 0 before `firstEpochStart`, otherwise `1 + (number - firstEpochStart) / 200`. A request belongs to `epochForBlock(requestBlock)`.',
          },
          epochStart: {
            caller: 'Anyone (view)',
            src: '231-234',
            text: 'First block of an epoch: `firstEpochStart + (epochId - 1) × 200`.',
            errors: ['InvalidEpoch'],
          },
          getEpoch: {
            caller: 'Anyone (view)',
            src: '252',
            text: 'The published [`EpochEntropy.Epoch`](#registry-type-epochentropy-epoch) record, or all zero while unpublished; it never reverts. A non-zero `epochHash` means published.',
          },
          catalogAt: {
            caller: 'Anyone (view)',
            src: '212-220, 226-230',
            text: 'The catalog in force for an epoch: its hash and the recipe id and signer of each slot, in slot order. That is the latest scheduled version whose `fromEpoch` is at or below `epochId`, otherwise the initial catalog: recipes 0 to 3 with the initial signers and hash `catalogHash()`. Replay needs this catalog, not the initial signer getters.',
          },
          sourceCountAt: {
            caller: 'Anyone (view)',
            src: '221-225, 226-230',
            text: 'Number of slots in the catalog in force for an epoch, and so the number of selection attempts, 0 to count - 1.',
          },
          getRecipe: {
            caller: 'Anyone (view)',
            src: '132-136, 139-142',
            text: 'A registered recipe: `queryHash` (`keccak256` of `canonicalRequest`), the canonical request its signer signs, the data template its signed data must match and the JSON body keepers post to the provider gateway. Registered recipes never change. `readEpochRecipes` in `@d20dao/vrf-sdk/epoch` reads recipes with this view and checks each query hash.',
            errors: ['InvalidConfig'],
          },
          recipeRequest: {
            caller: 'Anyone (view)',
            src: '137-142',
            text: 'Canonical request of a registered recipe, the same string `getRecipe` returns.',
            errors: ['InvalidConfig'],
          },
          recipeCount: {
            caller: 'Anyone (view)',
            src: '131',
            text: 'Number of registered recipes; ids run from 0 to `recipeCount() - 1`.',
          },
        },
      },
      {
        title: 'Registry reads',
        table: true,
        intro: 'Views, callable by anyone.',
        items: {
          firstEpochStart: { src: '40, 83', text: 'First block of epoch 1: the initialization block plus 200.' },
          committer: { src: '39, 281', text: 'Primary publishing address. The coordinator pays it the keeper share of every request whose proof came from a wallet this registry does not authorize.' },
          isBackupCommitter: { src: '118', text: 'Whether an address may publish epochs besides `committer()`.' },
          isAuthorizedCommitter: { src: '119-121', text: 'Whether an address may publish epochs at all: `committer()` or an allowed backup committer. The coordinator reads it to decide whether a proof submitter earns the keeper share.' },
          backupCommitterCount: { src: '63, 107-117', text: 'Number of allowed backup committers, at most `MAX_BACKUP_COMMITTERS`.' },
          catalogHash: { src: '41, 84', text: 'Initial catalog hash, bound into `protocolConfigurationHash`. Never changes; `catalogAt` gives the catalog of an epoch.' },
          epochAnchors: { src: '53, 241-244', text: 'Checkpointed anchor of an epoch (hash of block `epochStart - 1`); zero until a request, `checkpointEpoch` or publication stores it.' },
          hyperliquidSigner: { src: '34', text: 'Initial-catalog signer of slot 0 (recipe 0, Hyperliquid BTC volume). Never changes; see `catalogAt`.' },
          ethereumBlockSigner: { src: '35-36', text: 'Initial-catalog signer of slot 1 (recipe 1, Ethereum block hash). Never changes; see `catalogAt`.' },
          btcTradeSigner: { src: '37', text: 'Initial-catalog signer of slot 2 (recipe 2, TickerLayer BTCUSD). Never changes; see `catalogAt`.' },
          ethTradeSigner: { src: '38', text: 'Initial-catalog signer of slot 3 (recipe 3, TickerLayer ETHUSD). Never changes; see `catalogAt`.' },
        },
      },
      {
        title: 'Source selection and publication',
        intro: 'Used by keepers. Publication is restricted to the committer and backup committers; the selection views and `checkpointEpoch` are open to anyone.',
        items: {
          getEpochSelection: {
            caller: 'Anyone (view)',
            src: '253, 262-273',
            text: 'The selected source of an epoch, attempt 0, as an [`EpochEntropy.Selection`](#registry-type-epochentropy-selection).',
            errors: ['InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable', 'InvalidConfig'],
          },
          getEpochFallbackSelection: {
            caller: 'Anyone (view)',
            src: '254-255, 262-273',
            text: 'The source for attempt 0 to `sourceCountAt(epochId) - 1`; attempt n uses the slot n positions after the selected one.',
            errors: ['InvalidFallback', 'InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable', 'InvalidConfig'],
          },
          fallbackOpensAt: {
            caller: 'Anyone (view)',
            src: '256-260',
            text: 'First block at which an attempt may be published: `epochStart + attempt × FALLBACK_DELAY_BLOCKS` (20). With at most `MAX_SOURCES` (10) slots the last window opens 180 blocks into the epoch.',
            errors: ['InvalidFallback', 'InvalidEpoch'],
          },
          nextEpochToPrepare: {
            caller: 'Anyone (view)',
            src: '238',
            text: 'Same value as `epochForBlock(number)`.',
          },
          checkpointEpoch: {
            caller: 'Anyone',
            src: '239-244, 245-251',
            text: 'Stores the anchor of a started epoch (hash of block `epochStart - 1`) if not stored yet, and returns it. The coordinator calls it on every request, so the anchor of an epoch with requests survives the 256-block `BLOCKHASH` window.',
            errors: ['InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable'],
          },
          commitEpoch: {
            caller: 'Committer or backup committer',
            src: '274, 280-300',
            text: 'Publishes the packet of the selected source once per epoch, from the epoch start: checks that the attestation is not future-dated and at most 240 seconds old, that its data matches the data template of the slot\'s recipe exactly, and that the slot\'s signer in the epoch\'s catalog signed it. Stores the record and emits the packet. Whoever publishes, the keeper share of the epoch\'s requests goes to `committer()`.',
            emits: ['EpochCommitted'],
            errors: ['OnlyCommitter', 'AlreadyCommitted', 'InvalidEpoch', 'FallbackNotOpen', 'AnchorUnavailable', 'InvalidConfig', 'InvalidTime', 'InvalidData', 'ECDSAInvalidSignatureLength', 'ECDSAInvalidSignatureS', 'ECDSAInvalidSignature', 'InvalidSigner', 'PacketTooLarge'],
          },
          commitEpochFallback: {
            caller: 'Committer or backup committer',
            src: '275-279, 280-300',
            text: 'Publishes fallback attempt 1 to `sourceCountAt(epochId) - 1`, using the slot `attempt` positions after the selected source, once `fallbackOpensAt(epochId, attempt)` is reached. Same checks as `commitEpoch`.',
            emits: ['EpochCommitted'],
            errors: ['InvalidFallback', 'OnlyCommitter', 'AlreadyCommitted', 'InvalidEpoch', 'FallbackNotOpen', 'AnchorUnavailable', 'InvalidConfig', 'InvalidTime', 'InvalidData', 'ECDSAInvalidSignatureLength', 'ECDSAInvalidSignatureS', 'ECDSAInvalidSignature', 'InvalidSigner', 'PacketTooLarge'],
          },
        },
      },
      {
        title: 'Recipes and catalogs',
        intro: 'Owner-only; on Arc Mainnet the owner is the DAO treasury Safe. A recipe or catalog never changes a published epoch.',
        items: {
          registerRecipe: {
            caller: 'Owner',
            src: '123-130, 143-152',
            text: 'Appends an immutable recipe and returns its id, the next index. The canonical request is 1 to `MAX_REQUEST_BYTES` (1024) bytes, the body 1 to `MAX_BODY_BYTES` (2048) bytes, and the template must be a well-formed data template of at most `MAX_TEMPLATE_BYTES` (256) bytes; at most `MAX_RECIPES` (256) recipes exist. The contract does not check that the body canonicalizes to the request; keepers refuse a recipe whose body does not. A changed listing is registered as a new id.',
            emits: ['RecipeRegistered'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidRecipe', 'InvalidTemplate'],
          },
          scheduleCatalog: {
            caller: 'Owner',
            src: '190-211',
            text: 'Schedules a catalog for epochs from `fromEpoch`, which must be at least two epochs after the current one: 1 to `MAX_SOURCES` (10) distinct registered recipe ids with one non-zero signer each, in slot order. Its hash is `keccak256(abi.encode(RECIPE_DOMAIN, recipes, signers))`. If the latest scheduled version has not taken effect yet (its `fromEpoch` is after the current epoch) it is replaced, so that version never applies; this can return the next epoch to the previous catalog. The current epoch keeps its catalog.',
            emits: ['CatalogScheduled'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig', 'InvalidEpoch'],
          },
          initializeRecipeRegistry: {
            caller: 'Owner, once per proxy, as the `upgradeToAndCall` data of the recipe-registry upgrade',
            src: '87-95',
            text: 'Registers built-in recipes 0 to 5 on a registry initialized before the recipe registry, whose initial catalog selects recipes 0 to 3. It runs once per proxy (reinitializer version 2) and refuses a registry that already has recipes, which includes every registry initialized by this implementation, or a catalog scheduled under the earlier hardcoded recipe ids.',
            emits: ['RecipeRegistered', 'Initialized'],
            errors: ['InvalidInitialization', 'OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
        },
      },
      {
        title: 'Owner administration',
        intro: 'Owner-only functions revert `OwnableUnauthorizedAccount` for anyone else. No setter can change a published epoch.',
        items: {
          setCommitter: {
            caller: 'Owner',
            src: '100-103',
            text: 'Changes the primary publishing address, which is also the keeper-share recipient the coordinator reads at each acceptance.',
            emits: ['CommitterChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setBackupCommitter: {
            caller: 'Owner',
            src: '104-117',
            text: 'Allows or removes a backup committer: a separate wallet that may call `commitEpoch` and `commitEpochFallback` under exactly the committer\'s rules, for example a follower keeper that takes over while the primary keeper is down. It has no other role, and the coordinator pays it the keeper share of the requests whose accepted proofs it submits itself. Reverts for the zero address, for allowing the current committer, for a call that does not change the address\'s status, and for more than `MAX_BACKUP_COMMITTERS` (4).',
            emits: ['BackupCommitterSet'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          ...ownershipFunctions('97-98'),
          initialize: {
            caller: 'Once, by `D20Proxy` at deployment',
            src: '78-86',
            text: 'Sets the four initial-catalog signers of recipes 0 to 3, the owner and the committer, and registers built-in recipes 0 to 5. Epoch 1 starts 200 blocks after the initialization block.',
            emits: ['OwnershipTransferred', 'RecipeRegistered', 'Initialized'],
            errors: ['InvalidInitialization', 'OwnableInvalidOwner', 'InvalidConfig'],
          },
        },
      },
      {
        title: 'Constants',
        constants: true,
        intro: 'Views returning values fixed in the implementation code.',
        items: {
          EPOCH_LENGTH: { text: 'Blocks per epoch.' },
          MAX_ATTESTATION_AGE: { text: 'Oldest attestation accepted at publication, in seconds; also exported by `@d20dao/vrf-sdk/epoch`.' },
          MAX_PACKET_BYTES: { text: 'Upper bound on the `EpochCommitted` packet.' },
          FALLBACK_DELAY_BLOCKS: { text: 'Blocks between fallback windows.' },
          MAX_SOURCES: { text: 'Most slots in a catalog.' },
          MAX_RECIPES: { text: 'Most registered recipes; ids are `uint8`.' },
          MAX_REQUEST_BYTES: { text: 'Longest canonical request of a recipe.' },
          MAX_BODY_BYTES: { text: 'Longest gateway request body of a recipe.' },
          MAX_DATA_BYTES: { valueFrom: 'protocol/contracts/libraries/DataTemplate.sol', text: 'Longest signed data a template accepts.' },
          MAX_TEMPLATE_BYTES: { valueFrom: 'protocol/contracts/libraries/DataTemplate.sol', text: 'Longest data template.' },
          MAX_BACKUP_COMMITTERS: { text: 'Most backup committers allowed at once.' },
          RECIPE_DOMAIN: { text: 'Domain tag of catalog hashes.' },
          SELECT_DOMAIN: { text: 'Domain tag of the source selector.' },
          EPOCH_DOMAIN: { text: 'Domain tag of the epoch commitment.' },
          UPGRADE_INTERFACE_VERSION: { valueFrom: 'node_modules/@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol', text: 'OpenZeppelin UUPS interface version: upgrades go through `upgradeToAndCall` only.' },
        },
      },
    ],
    events: [
      {
        title: 'Epochs, recipes and catalogs',
        items: {
          EpochCommitted: {
            src: '71, 297-299',
            text: 'An epoch was published. `packet` is `abi.encode(canonicalRequest, attestation)`: decode it with `decodeEpochEvidencePacket` and verify with `replayEpochCommitment`. Requests of the epoch now have a target block.',
          },
          RecipeRegistered: {
            src: '74, 151',
            text: 'Recipe `recipe` was registered. The event carries the complete definition, so every recipe can be rebuilt from logs; `getRecipe` returns the same values.',
          },
          CatalogScheduled: {
            src: '73, 210',
            text: 'A catalog was scheduled for epochs from `fromEpoch`: recipe ids and signers in slot order. A later `CatalogScheduled` emitted while this version has not taken effect replaces it, so when rebuilding catalogs from history drop replaced versions, or read `catalogAt(epochId)`.',
          },
        },
      },
      {
        title: 'Administration and upgrades',
        items: {
          CommitterChanged: { src: '72, 102', text: 'New primary publishing address and keeper-share recipient.' },
          BackupCommitterSet: { src: '75, 116', text: '`account` may now publish epochs (`allowed` true) or no longer may (`allowed` false).' },
          ...ownershipEvents,
          Initialized: {
            text: '`initialize` ran on the proxy (`version` 1) or `initializeRecipeRegistry` did (`version` 2). Each implementation contract also emitted it once at construction with `version` 2^64 − 1, which locks the implementation against initialization.',
          },
        },
      },
    ],
    errors: [
      {
        title: 'Epoch reads',
        items: {
          InvalidEpoch: {
            src: '66, 204, 232',
            text: 'Epoch 0 was passed to `epochStart`, `fallbackOpensAt`, a selection view, `checkpointEpoch` or a commit, or `scheduleCatalog` got a `fromEpoch` less than two epochs after the current one.',
            response: 'Epoch IDs start at 1; schedule at least two epochs ahead.',
          },
          PreparationClosed: {
            src: '66, 247',
            text: 'The epoch has not started (`block.number` is below `epochStart(epochId)`), so its anchor block hash does not exist yet.',
            response: 'Wait for the epoch to start.',
          },
          AnchorUnavailable: {
            src: '66, 250',
            text: 'The anchor (hash of block `epochStart - 1`) was never checkpointed and is outside the 256-block `BLOCKHASH` window.',
            response: 'The epoch can no longer be selected or published. Every request checkpoints its epoch\'s anchor, so an epoch with requests is not affected.',
          },
        },
      },
      {
        title: 'Publication',
        items: {
          OnlyCommitter: { src: '67, 281', text: 'A commit from an address that is neither `committer()` nor an allowed backup committer.', response: 'Only the committer and backup committers publish; check `isBackupCommitter`.' },
          AlreadyCommitted: { src: '67, 282', text: 'The epoch already has a published packet.', response: 'Nothing to publish; read `getEpoch`.' },
          FallbackNotOpen: { src: '69, 283', text: '`block.number` is below `fallbackOpensAt(epochId, attempt)`; for attempt 0, before the epoch start.', response: 'Wait for the window.' },
          InvalidFallback: { src: '69, 258, 266, 277', text: 'An attempt at or above `sourceCountAt(epochId)`, or attempt 0 passed to `commitEpochFallback`.', response: 'Use attempts 1 to `sourceCountAt(epochId) - 1` for fallbacks.' },
          InvalidTime: { src: '67, 285', text: 'The attestation timestamp is in the future or more than `MAX_ATTESTATION_AGE` (240 seconds) before the publication block.', response: 'A saved packet is never refreshed; its requests expire and are refunded.' },
          InvalidData: { src: '67, 286-287', text: 'The signed data does not match the data template of the slot\'s recipe exactly, which includes data longer than `MAX_DATA_BYTES` (128).', response: 'Publish only a response that matches the selected recipe\'s template, unmodified.' },
          InvalidSigner: { src: '67, 289', text: 'The signature does not recover to the slot\'s signer in the epoch\'s catalog.', response: 'Use `catalogAt(epochId)` for the expected signer.' },
          ECDSAInvalidSignature: { text: 'The signature does not recover to any address (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          ECDSAInvalidSignatureLength: { text: 'The signature is not 65 bytes (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          ECDSAInvalidSignatureS: { text: 'The signature has a high `s` value (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          PacketTooLarge: { src: '68, 298', text: 'The encoded packet exceeds `MAX_PACKET_BYTES` (2048).', response: 'Not reachable: the recipe and data bounds keep every packet within `MAX_PACKET_BYTES`.' },
        },
      },
      {
        title: 'Recipes, administration, initialization and upgrades',
        items: {
          InvalidRecipe: {
            src: '70, 147',
            text: '`registerRecipe` got an empty canonical request or body, a canonical request over `MAX_REQUEST_BYTES` or a body over `MAX_BODY_BYTES`, or `MAX_RECIPES` recipes are already registered.',
            response: 'Shorten the request or body. Recipe ids are never freed.',
          },
          InvalidTemplate: {
            src: '70, 148',
            text: '`registerRecipe` got a data template that is not well formed (README [Data templates](README.md#data-templates)).',
            response: 'Build the template with `encodeDataTemplate`, which names the broken rule, before registering.',
          },
          InvalidConfig: {
            src: '66, 81, 93, 101, 108, 110, 140, 196, 200',
            text: 'A zero signer or committer in `initialize`; a zero address in `setCommitter`; in `setBackupCommitter` the zero address, allowing the committer, an unchanged status or a fifth backup committer; in `scheduleCatalog` an empty or oversized catalog, mismatched lengths, a repeated or unregistered recipe or a zero signer; `initializeRecipeRegistry` on a registry that already has recipes or a scheduled catalog; or a recipe id that is not registered, in `getRecipe` and `recipeRequest` or, on a registry upgraded without `initializeRecipeRegistry`, in selection and publication.',
            response: 'Correct the arguments; recipe ids run from 0 to `recipeCount() - 1`. A registry upgraded without the recipe step needs `initializeRecipeRegistry` from its owner.',
          },
          ...upgradeErrors,
          InvalidInitialization: {
            ...upgradeErrors.InvalidInitialization,
            text: '`initialize` on a proxy that is already initialized or on an implementation contract, whose initializers are disabled at construction, or `initializeRecipeRegistry` on a proxy that has already reached initializer version 2.',
            response: 'None: `initialize` happens once when `D20Proxy` is deployed, and `initializeRecipeRegistry` once in the recipe-registry upgrade.',
          },
          RenounceDisabled: { ...upgradeErrors.RenounceDisabled, src: '68, 98' },
        },
      },
    ],
  },
];
