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
  'quoteRequestFee', 'rawFulfillRandomness', 'replayEpochCommitment', 'toEthSignedMessageHash', 'toObject', '_onRefund',
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
        src: '58-76',
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
            src: '227-232',
            text: 'Fee for a request with this `callbackGasLimit` priced at `block.basefee`, that is `quoteFeeAt(callbackGasLimit, block.basefee)`. Exact inside the requesting transaction, which is how `D20VRFRequests` helpers pay. Through `eth_call` the base fee is commonly reported as 0 (observed on Arc), so the answer collapses to `minFee` and a transaction sent with it reverts `IncorrectFee`. Off-chain, quote with `quoteFeeAt` and the latest header base fee plus a buffer, as `quoteRequestFee` does. It does not check the gas limit range.',
            errors: ['FeeOverflow'],
          },
          quoteFeeAt: {
            caller: 'Anyone (view)',
            src: '219-226',
            text: '`max(minFee, feeMultiplier × baseFee × (fulfillGasOverhead + callbackGasLimit))` over the live pricing for a base fee in wei that you supply; with `feeMultiplier` 0 it returns `minFee`. A quote, not a reservation: pricing can change before your transaction. A `baseFee` large enough to overflow uint256 reverts with `Panic(0x11)` instead of `FeeOverflow`.',
            errors: ['FeeOverflow'],
          },
          requestRandomness: {
            caller: 'Any contract',
            src: '234-239, 247-286',
            text: 'Creates a raw request (spec all zero) with `msg.sender` as consumer and returns its ID. Needs `msg.value` at least the fee computed in this transaction; escrows exactly that fee and credits any excess to `_refundAddress` as refund credit. Fixes the request block, epoch, client seed, refund address, fee, refund ratio (`refundBps`) and a deadline of `block.timestamp + RESPONSE_TIMEOUT`. After acceptance the consumer receives `rawFulfillRandomness(requestId, randomness)` with exactly `callbackGasLimit` gas. Checks run in this order: caller has code, refund address non-zero, gas limit in range, fee, mapping, epoch started.',
            emits: ['FeeOverpaymentCredited', 'RandomnessRequested', 'MappingRequested'],
            errors: ['ContractConsumerRequired', 'InvalidRefundAddress', 'InvalidCallbackGas', 'FeeOverflow', 'IncorrectFee', 'EpochUnavailable'],
          },
          requestMappedRandomness: {
            caller: 'Any contract',
            src: '241-245, 247-286',
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
          pricing: { src: '210-212', text: 'Live `(minFee, feeMultiplier, fulfillGasOverhead)`. The outputs are unnamed, so read them by position.' },
          minFee: { src: '43', text: 'Minimum fee in wei, at most `MAX_MIN_FEE` (10 USDC).' },
          feeMultiplier: { src: '45-46', text: 'Base-fee multiplier, 0 to `MAX_FEE_MULTIPLIER` (20); 0 makes every fee `minFee`.' },
          fulfillGasOverhead: { src: '47', text: 'Gas added to `callbackGasLimit` in the fee formula, `MIN_FULFILL_GAS_OVERHEAD` to `MAX_FULFILL_GAS_OVERHEAD`.' },
          refundBps: { src: '48-49', text: 'Current refund ratio in basis points (5000 to 10000), copied into each new request. Not the ratio of an existing request: use `requestRefundBps(requestId)`.' },
        },
      },
      {
        title: 'Reading request state and results',
        intro: 'Views, callable by anyone, including from a callback. Request IDs start at 1 and increase by one; functions taking a `requestId` revert `UnknownRequest` for an ID that was never issued. README [Reading results](README.md#reading-results) shows a polling loop.',
        items: {
          getRequest: {
            caller: 'Anyone (view)',
            src: '288-307, 547-552',
            text: 'Full state of a request, see [`D20VRFCoordinator.Request`](#coordinator-type-d20vrfcoordinator-request). `targetBlock` and `epochHash` are resolved from the registry, so they become non-zero as soon as the epoch packet is published. `fulfilled` means the word is final; `delivered` only reports that a callback succeeded. A request that is not `fulfilled` in a block whose timestamp is after `deadline` has expired and can only be refunded. When polling, read the latest block before `getRequest`, so that a proof included up to that block is visible.',
            errors: ['UnknownRequest'],
          },
          getMapping: {
            caller: 'Anyone (view)',
            src: '339-342',
            text: 'The stored [`RandomnessMapping.Spec`](#coordinator-type-randomnessmapping-spec); all fields zero (Raw) for `requestRandomness`.',
            errors: ['UnknownRequest'],
          },
          getMappedResult: {
            caller: 'Anyone (view)',
            src: '344-348',
            text: 'The accepted word mapped with the stored spec: `[uint256(word)]` for a raw request, otherwise the values in README [Randomness options](README.md#randomness-options). Part of `ID20VRF`. Reverts `NotFulfilled` until a proof is accepted, so an expired or refunded request never has a result. Gas grows with the mapping; a 256-item shuffle is expensive onchain.',
            errors: ['UnknownRequest', 'NotFulfilled'],
          },
          mapRandomness: {
            caller: 'Anyone (pure)',
            src: '350-355',
            text: 'Maps any word with any valid spec, like the SDK `mapRandomness(word, spec)` off-chain. It does not show that a request was fulfilled.',
            errors: ['InvalidMapping'],
          },
          requestFeePaid: {
            caller: 'Anyone (view)',
            src: '330-333',
            text: 'Fee escrowed by the request (`feePaid` in `RandomnessRequested`), excluding any overpayment. The keeper share, the protocol share and the refund are computed from it.',
            errors: ['UnknownRequest'],
          },
          requestRefundBps: {
            caller: 'Anyone (view)',
            src: '334-337',
            text: 'Refund ratio the request copied from `refundBps` at creation. An expiry refund pays `requestFeePaid × requestRefundBps / 10000`; a later `setRefundBps` does not change it.',
            errors: ['UnknownRequest'],
          },
          refundCallbackDelivered: {
            caller: 'Anyone (view)',
            src: '102, 500',
            text: 'True once an `onRefund` notification for the request succeeded, at `refundRequest` or `retryRefundCallback`. Returns false for unknown IDs instead of reverting.',
          },
          nextRequestId: {
            caller: 'Anyone (view)',
            src: '50, 172, 260',
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
            src: '455-479, 491-502',
            text: 'Refunds an unfulfilled request once a block timestamp is after its deadline. Marks it refunded, sends `feePaid × requestRefundBps / 10000` to the fixed refund address with a 30,000-gas transfer, or adds it to that address\'s refund credit if the transfer fails, and adds the rest of the fee to `earnedFees`. Then calls `onRefund(requestId)` on the consumer with 100,000 gas; a failed notification does not undo the refund. The caller receives nothing. Measured minimum transaction gas limit 302,558 to 357,517; use 400,000.',
            emits: ['RequestRefundedTo', 'RefundCallbackAttempted'],
            errors: ['UnknownRequest', 'RefundNotAvailable', 'InsufficientCallbackGas'],
          },
          retryCallback: {
            caller: 'Anyone',
            src: '445-453, 602-619',
            text: 'Calls `rawFulfillRandomness` again with the same accepted word after a failed callback, forwarding `gasLimit` (30,000 to 1,000,000 and not below the request\'s `callbackGasLimit`). Sets `delivered` on success. Pays nobody and never changes the word. Transaction gas limit: about `gasLimit + 250,000`.',
            emits: ['CallbackAttempted'],
            errors: ['UnknownRequest', 'NotFulfilled', 'AlreadyDelivered', 'InvalidCallbackGas', 'InsufficientCallbackGas'],
          },
          retryRefundCallback: {
            caller: 'Anyone',
            src: '481-489, 491-502',
            text: 'Repeats a failed `onRefund` notification for a refunded request with `gasLimit` (100,000 to 1,000,000). Never transfers funds again. Transaction gas limit: about `gasLimit + 150,000`.',
            emits: ['RefundCallbackAttempted'],
            errors: ['UnknownRequest', 'NotRefunded', 'RefundCallbackAlreadyDelivered', 'InvalidCallbackGas', 'InsufficientCallbackGas'],
          },
          withdrawRefundCredit: {
            caller: 'Refund-credit holder',
            src: '504-514',
            text: 'Sends all of the caller\'s refund credit, `refundCredits(msg.sender)`, to `recipient` with all remaining gas. Credit comes from overpayment and from refund transfers that failed, and belongs to the request\'s refund address, so that address must make the call. If `recipient` rejects the transfer the call reverts and the credit stays.',
            emits: ['RefundCreditWithdrawn'],
            errors: ['InvalidRefundAddress', 'NoRefundCredit', 'TransferFailed'],
          },
          withdrawFees: {
            caller: 'Fee recipient',
            src: '516-525',
            text: 'Sends all `earnedFees` to `recipient`. Fees accrue at acceptance (fee minus keeper share) and from the part of a refunded fee that is not returned; open escrow is never included. With nothing earned it sends zero without reverting.',
            emits: ['FeesWithdrawn'],
            errors: ['OnlyFeeRecipient', 'InvalidConfig', 'TransferFailed'],
          },
          withdrawKeeperCredit: {
            caller: 'Keeper-credit holder',
            src: '527-536',
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
          refundCredits: { src: '56', text: 'Refund credit that an address can withdraw with `withdrawRefundCredit`.' },
          totalRefundCredits: { src: '55', text: 'Sum of all refund credit held by the coordinator.' },
          earnedFees: { src: '51', text: 'Protocol fees that the fee recipient can withdraw.' },
          feeRecipient: { src: '39', text: 'Address allowed to call `withdrawFees`; changed with `setFeeRecipient`.' },
          keeperFeeBps: { src: '40, 422', text: 'Keeper share of each accepted fee in basis points (0 to 10000). Read at acceptance, not snapshotted: a change applies to open requests accepted afterwards. It only splits the escrowed fee; what the consumer paid and can be refunded does not change.' },
          keeperCredits: { src: '41', text: 'Keeper credit that an address can withdraw with `withdrawKeeperCredit`.' },
          totalKeeperCredits: { src: '42', text: 'Sum of all keeper credit held by the coordinator.' },
        },
      },
      {
        title: 'Keeper and proof functions',
        intro: 'Proof submission is permissionless: anyone holding a valid proof may submit it, and the keeper share always goes to the registry `committer()`. Consumers normally only read `getRequest`. Besides the custom errors listed, proof functions can revert with `Error(string)` messages from the vendored VRF verifier, such as `invalid proof`, which are not in the ABI.',
        items: {
          fulfillRandomness: {
            caller: 'Anyone',
            src: '388-396, 412-437',
            text: 'Accepts a proof for a request that is not fulfilled, not refunded and not past its deadline; acceptance in a block with timestamp equal to `deadline` is timely. Stores the target block hash if needed, verifies the proof against `requestSeed(requestId)`, stores the word, proof hash and transcript hash, sets `fulfilled`, adds `feePaid` minus the keeper share to `earnedFees` and calls the consumer with `callbackGasLimit` gas. It then sends the keeper share (`keeperFeeBps` of `feePaid`) to `committer()` with 30,000 gas, or records it as keeper credit. A failing callback does not revert the fulfillment.',
            emits: ['BlockHashStored', 'RequestServed', 'ProofVerified', 'RandomnessFulfilled', 'FulfillmentEvidence', 'CallbackAttempted', 'KeeperFeePaid'],
            errors: ['UnknownRequest', 'AlreadyFulfilled', 'RequestRefunded', 'RequestExpired', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed', 'EvidencePacketTooLarge', 'InsufficientCallbackGas'],
          },
          fulfillRandomnessBatch: {
            caller: 'Anyone',
            src: '398-410',
            text: 'Fulfills up to `MAX_FULFILL_BATCH` (16) requests, one proof each. Members already fulfilled, refunded or past their deadline, including an ID repeated in the batch, are skipped with `FulfillmentSkipped`; every other member runs exactly like `fulfillRandomness` and emits the same events, so an unknown ID, an unready member or an invalid proof reverts the whole batch.',
            emits: ['FulfillmentSkipped', 'BlockHashStored', 'RequestServed', 'ProofVerified', 'RandomnessFulfilled', 'FulfillmentEvidence', 'CallbackAttempted', 'KeeperFeePaid'],
            errors: ['InvalidBatch', 'UnknownRequest', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed', 'EvidencePacketTooLarge', 'InsufficientCallbackGas'],
          },
          storeBlockHash: {
            caller: 'Anyone',
            src: '367-371, 553-568',
            text: 'Resolves the target block from the published epoch, stores its hash if not stored yet and returns it. Fulfillment does this automatically; calling it earlier keeps a request provable after its target leaves the 256-block `BLOCKHASH` window. Needs `block.number` at least `targetBlock + confirmationBlocks`. Works on any request, whatever its status.',
            emits: ['BlockHashStored'],
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          verifyRequestProof: {
            caller: 'Anyone (view)',
            src: '357-365',
            text: 'Returns the word a proof yields for the request\'s seed, without changing state. A valid proof is not acceptance: check `getRequest(requestId).fulfilled`.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed'],
          },
          requestSeed: {
            caller: 'Anyone (view)',
            src: '373-378, 570-578',
            text: 'Seed the proof must use: `keccak256(abi.encode(SEED_DOMAIN, chainId, coordinator, keyHash, requestId, consumer, clientSeed, mappingHash, requestBlock, targetBlock, blockHash, epochId, epochHash))` as uint256. Available only after publication and `confirmationBlocks` confirmations of the target block.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          getProofContext: {
            caller: 'Anyone (view)',
            src: '380-386',
            text: '`requestSeed` together with `deadline`, `fulfilled` and `refunded`. It reverts `NotReady` like `requestSeed`, so it is not a status read for waiting requests; use `getRequest`.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          getPendingRequestIds: {
            caller: 'Anyone (view)',
            src: '309-328',
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
          lastServedRequestId: { src: '52, 424', text: 'ID of the most recently accepted request; 0 before the first.' },
          lastServedIndex: { src: '53, 425', text: 'Number of accepted requests so far: the `serveIndex` of the latest `RequestServed`.' },
          servedRequestAt: { src: '54, 425', text: 'Request ID accepted at a serve index (from 1); 0 for an index not used yet.' },
          keyHash: { src: '36, 179', text: '`keccak256(abi.encode(publicKey))` of the VRF key; indexed in `RandomnessRequested` and `ProofVerified`.' },
          publicKeyX: { src: '34', text: 'x coordinate of the VRF public key.' },
          publicKeyY: { src: '35', text: 'y coordinate of the VRF public key.' },
          confirmationBlocks: { src: '44, 555', text: 'Blocks after the target block before the seed and proofs become available (1 to 64, set at initialization).' },
          epochRegistry: { src: '32', text: 'The `EpochEntropy` proxy that supplies epochs and the keeper-share recipient.' },
          protocolConfigurationHash: { src: '31, 189', text: 'Hash of the initialized configuration (public key, initial fee recipient, initial minimum fee, confirmations, registry, initial catalog hash, first epoch start, epoch length 200) under `CONFIG_DOMAIN`. Bound into every transcript hash.' },
          initialFeeRecipient: { src: '38, 181', text: 'Fee recipient given to `initialize`, used by replay. The live payout address is `feeRecipient()`.' },
          initialMinFee: { src: '104, 184', text: 'Minimum fee given to `initialize`, used by replay. The live minimum is `minFee()`.' },
        },
      },
      {
        title: 'Owner administration',
        intro: 'Owner-only functions revert `OwnableUnauthorizedAccount` for anyone else. No setter can change an existing request, the VRF key, the registry or the confirmations.',
        items: {
          setPricing: {
            caller: 'Owner',
            src: '204-209',
            text: 'Sets `minFee` (at most `MAX_MIN_FEE`, 10 USDC), `feeMultiplier` (at most `MAX_FEE_MULTIPLIER`, 20) and `fulfillGasOverhead` (`MIN_FULFILL_GAS_OVERHEAD` to `MAX_FULFILL_GAS_OVERHEAD`, 100,000 to 2,000,000 gas). Affects requests created afterwards; open requests keep their escrowed fee.',
            emits: ['PricingChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setRefundBps: {
            caller: 'Owner',
            src: '213-217',
            text: 'Sets the refund ratio for requests created afterwards, `MIN_REFUND_BPS` (5000) to 10000.',
            emits: ['RefundBpsChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setKeeperFeeBps: {
            caller: 'Owner',
            src: '200-203',
            text: 'Sets the keeper share, 0 to 10000 basis points. Read at each acceptance, so it also applies to open requests accepted later.',
            emits: ['KeeperFeeBpsChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setFeeRecipient: {
            caller: 'Owner',
            src: '196-199',
            text: 'Sets the address allowed to withdraw `earnedFees`, including fees earned before the change. The zero address is rejected.',
            emits: ['FeeRecipientChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          ...ownershipFunctions('193-194'),
          initialize: {
            caller: 'Once, by `D20Proxy` at deployment',
            src: '169-190',
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
            src: '138-142, 283-284',
            text: 'A request was created. `feePaid` is the escrowed fee, not `msg.value`; `deadline` is the block timestamp plus 60 seconds. Read `requestId` from this log in the request receipt, filtering by the coordinator address and event name: with an overpayment, `FeeOverpaymentCredited` comes first.',
          },
          MappingRequested: {
            src: '157, 285',
            text: 'Emitted right after `RandomnessRequested` with the stored spec (all zero for a raw request) and its hash.',
          },
          FeeOverpaymentCredited: {
            src: '151, 277-282',
            text: '`msg.value` exceeded the fee and `amount` was added to `refundCredits(refundAddress)`, independently of what happens to the request. Emitted before `RandomnessRequested`.',
          },
          BlockHashStored: {
            src: '143, 561-568',
            text: 'The target block hash of the request was stored. Emitted once per request: by `storeBlockHash`, or by fulfillment if the hash was not stored before.',
          },
          RequestServed: {
            src: '159, 424-426',
            text: 'A proof was accepted. `serveIndex` counts accepted requests from 1 (`lastServedIndex`, `servedRequestAt`).',
          },
          ProofVerified: {
            src: '158, 427',
            text: 'Seed and hash of the accepted proof.',
          },
          RandomnessFulfilled: {
            src: '144, 428',
            text: 'A proof was accepted and `randomness` is final. `submitter` sent the transaction and is not paid for it.',
          },
          FulfillmentEvidence: {
            src: '162-163, 439-443',
            text: 'The accepted proof as a 416-byte ABI-encoded packet, indexed by `transcriptHash`. Decode it with `decodeEvidencePacket`; take evidence from this log, not from calldata, since a batch carries several proofs.',
          },
          CallbackAttempted: {
            src: '145, 602-619',
            text: 'Result of calling `rawFulfillRandomness` with `gasLimit` gas, at fulfillment and at each `retryCallback`. `success` false means the consumer reverted, ran out of gas or has no code; the word is accepted either way.',
          },
          KeeperFeePaid: {
            src: '152, 431-436',
            text: 'At acceptance, when the keeper share is non-zero: `amount` went to `keeper`, the registry committer, by a 30,000-gas transfer (`paid` true) or was added to `keeperCredits(keeper)` (`paid` false). Emitted after `CallbackAttempted`.',
          },
          FulfillmentSkipped: {
            src: '160-161, 406-407',
            text: 'A batch member was left untouched: `reason` 1 already fulfilled, 2 refunded, 3 past its deadline.',
          },
          RequestRefundedTo: {
            src: '154, 477',
            text: 'An expired request was refunded: `amount` (`feePaid × requestRefundBps / 10000`) was sent to `refundAddress` (`paid` true) or added to its refund credit (`paid` false).',
          },
          RefundCallbackAttempted: {
            src: '156, 491-502',
            text: 'Result of calling `onRefund(requestId)` on `consumer` with `gasLimit` gas: 100,000 at `refundRequest`, the caller\'s limit at `retryRefundCallback`.',
          },
        },
      },
      {
        title: 'Credits and withdrawals',
        items: {
          RefundCreditWithdrawn: { src: '155, 513', text: '`owner`, the credit holder (not the contract owner), withdrew `amount` of refund credit to `recipient`.' },
          KeeperCreditWithdrawn: { src: '153, 535', text: '`keeper` withdrew `amount` of keeper credit to `recipient`.' },
          FeesWithdrawn: { src: '146, 524', text: 'The fee recipient withdrew `amount` of earned fees to `recipient`.' },
        },
      },
      {
        title: 'Administration and upgrades',
        items: {
          PricingChanged: { src: '149, 208', text: 'New `minFee`, `feeMultiplier` and `fulfillGasOverhead` for requests created afterwards.' },
          RefundBpsChanged: { src: '150, 216', text: 'New refund ratio for requests created afterwards.' },
          KeeperFeeBpsChanged: { src: '148, 202', text: 'New keeper share, applied at later acceptances, including of requests already open.' },
          FeeRecipientChanged: { src: '147, 198', text: 'New address allowed to withdraw earned fees.' },
          ...ownershipEvents,
        },
      },
    ],
    errors: [
      {
        title: 'Requesting',
        items: {
          ContractConsumerRequired: {
            src: '110, 250',
            text: 'The caller of a request function has no code: an externally owned account, or a contract still running its constructor.',
            response: 'Send the request through a deployed consumer contract (README [Integrate a consumer](README.md#integrate-a-consumer)), and not from its constructor.',
          },
          InvalidRefundAddress: {
            src: '124, 251, 506',
            text: 'A request named the zero address as refund address, or `withdrawRefundCredit` named the zero address as recipient.',
            response: 'Pass a non-zero address that can receive a plain native transfer or call `withdrawRefundCredit`.',
          },
          InvalidCallbackGas: {
            src: '112, 451, 487, 598-600',
            text: 'A gas limit is out of range: a request `callbackGasLimit` outside 30,000 to 1,000,000; a `retryCallback` limit outside that range or below the request\'s `callbackGasLimit`; a `retryRefundCallback` limit outside 100,000 to 1,000,000.',
            response: 'Use a limit inside the range; retry with at least the original limit.',
          },
          IncorrectFee: {
            src: '111, 254',
            text: '`actual` (`msg.value`) is below `expected`, the fee computed in the request transaction. No request was created.',
            response: 'Quote again with `quoteFeeAt(callbackGasLimit, latestBlock.baseFeePerGas)` plus a buffer (`quoteRequestFee`) and resend. A contract paying in the same transaction sends `quoteFee(callbackGasLimit)`. Never quote with `quoteFee` through `eth_call`.',
          },
          FeeOverflow: {
            src: '135, 224',
            text: 'The dynamic fee exceeds the uint96 escrow limit. Within the pricing bounds that needs a base fee above about 1.3e21 wei.',
            response: 'Not expected on a live chain. For `quoteFeeAt`, check that `baseFee` is in wei.',
          },
          InvalidMapping: {
            src: 'libraries/RandomnessMapping.sol:19, 21-39',
            text: 'The spec breaks the rules for its operation (README [Randomness options](README.md#randomness-options)). Declared in `RandomnessMapping`.',
            response: 'Build specs with the `D20VRFRequests` helpers or TypeScript `builtins`, which enforce the same bounds.',
          },
          EpochUnavailable: {
            src: '108, 258',
            text: 'The request block is before the registry\'s first epoch: `epochForBlock(block.number)` is 0.',
            response: 'Not expected on the Arc deployments, whose epochs have started. Check that you call the coordinator proxy for your chain; on a new deployment, wait for `firstEpochStart`.',
          },
        },
      },
      {
        title: 'Reading and recovery',
        items: {
          UnknownRequest: {
            src: '113, 538-541',
            text: 'No request has this ID: 0, or not below `nextRequestId()`. An unknown ID also reverts a whole `fulfillRandomnessBatch`.',
            response: 'Take `requestId` from the `RandomnessRequested` log of the request receipt, and read from the same chain and coordinator proxy.',
          },
          NotFulfilled: {
            src: '117, 346, 448',
            text: '`getMappedResult` or `retryCallback` on a request without an accepted proof, including an expired or refunded one.',
            response: 'Poll `getRequest(requestId)` until `fulfilled`. Once a block timestamp is after `deadline` without fulfillment, the request has expired and only `refundRequest` applies.',
          },
          AlreadyDelivered: {
            src: '118, 449',
            text: '`retryCallback` on a request whose callback already succeeded.',
            response: 'Nothing to retry.',
          },
          RefundNotAvailable: {
            src: '127, 460',
            text: '`refundRequest` on a request that is fulfilled, already refunded, or not yet past its deadline (the block timestamp must be greater than `deadline`).',
            response: 'Read `getRequest`: use the result if `fulfilled`, stop if `refunded`, otherwise retry after a block with a later timestamp than `deadline`.',
          },
          NotRefunded: {
            src: '130, 484',
            text: '`retryRefundCallback` on a request that has not been refunded.',
            response: 'Call `refundRequest` after the deadline first.',
          },
          RefundCallbackAlreadyDelivered: {
            src: '131, 485',
            text: '`retryRefundCallback` after an `onRefund` notification already succeeded (`refundCallbackDelivered`).',
            response: 'Nothing to retry.',
          },
          InsufficientCallbackGas: {
            src: '121, 469, 494, 610-611',
            text: 'Too little gas remained to forward the full callback budget and keep the coordinator\'s reserve: `gasLimit + gasLimit/63 + 140,000` before a fulfillment callback, `100,000 + 100,000/63 + 140,000` after refund settlement, `gasLimit + gasLimit/63 + 50,000` before a refund notification. The coordinator reverts instead of forwarding less.',
            response: 'Raise the transaction gas limit: 400,000 for `refundRequest`, `gasLimit + 250,000` for `retryCallback`, `gasLimit + 150,000` for `retryRefundCallback` (README [Gas for refund and retry calls](README.md#gas-for-refund-and-retry-calls)). `eth_estimateGas` finds the minimum.',
          },
        },
      },
      {
        title: 'Credits and withdrawals',
        items: {
          NoRefundCredit: {
            src: '128, 508',
            text: '`withdrawRefundCredit` from an address without refund credit. Credit is keyed by the refund address, which must be `msg.sender`.',
            response: 'Call from the refund address; `refundCredits(address)` shows the balance.',
          },
          TransferFailed: {
            src: '123, 512, 523, 534',
            text: 'The `recipient` of `withdrawRefundCredit`, `withdrawFees` or `withdrawKeeperCredit` rejected the native transfer. Balances are unchanged.',
            response: 'Choose a recipient that accepts plain native transfers.',
          },
          OnlyFeeRecipient: {
            src: '122, 518',
            text: '`withdrawFees` from an address other than `feeRecipient()`.',
            response: 'Only the fee recipient withdraws protocol fees.',
          },
          NoKeeperCredit: {
            src: '129, 530',
            text: '`withdrawKeeperCredit` from an address without keeper credit.',
            response: '`keeperCredits(address)` shows the balance.',
          },
        },
      },
      {
        title: 'Proofs and keepers',
        items: {
          NotReady: {
            src: '114, 555',
            text: 'The request cannot be proven yet: its epoch packet is not published, or `block.number` is below `targetBlock + confirmationBlocks`.',
            response: 'For a consumer this only means the request is still waiting. Keepers retry after publication and confirmations.',
          },
          BlockHashUnavailable: {
            src: '115, 558',
            text: 'The target block hash was never stored and is outside the 256-block `BLOCKHASH` window. The request can no longer be fulfilled.',
            response: 'Call `refundRequest` after the deadline. Keepers call `storeBlockHash` before the window closes.',
          },
          AlreadyFulfilled: {
            src: '116, 392',
            text: '`fulfillRandomness` on a fulfilled request.',
            response: 'Nothing to do; read the result.',
          },
          RequestRefunded: {
            src: '126, 393',
            text: '`fulfillRandomness` on a refunded request.',
            response: 'The request is settled and will never have a result.',
          },
          RequestExpired: {
            src: '125, 394',
            text: '`fulfillRandomness` in a block whose timestamp is after the request\'s deadline.',
            response: 'The request can only be refunded with `refundRequest`.',
          },
          WrongPublicKey: {
            src: '119, 583',
            text: 'The proof\'s `pk` is not the coordinator\'s VRF key.',
            response: 'Only proofs from the configured key are accepted.',
          },
          WrongSeed: {
            src: '120, 585',
            text: 'The proof\'s `seed` differs from `requestSeed(requestId)`.',
            response: 'Prove the stored seed; it cannot change.',
          },
          EvidencePacketTooLarge: {
            src: '133, 441',
            text: 'The encoded proof exceeds `MAX_EVIDENCE_PACKET_BYTES`. A proof always encodes to 416 bytes, so valid calls never reach this bound.',
            response: 'None expected.',
          },
          InvalidBatch: {
            src: '136, 403',
            text: '`fulfillRandomnessBatch` with no IDs, more than 16, or a different number of proofs.',
            response: 'Send 1 to 16 IDs with one proof each.',
          },
          InvalidScan: {
            src: '132, 315',
            text: '`getPendingRequestIds` with `fromId` 0, `limit` 0 or `limit` above 256.',
            response: 'Start at 1 and page with at most 256.',
          },
        },
      },
      {
        title: 'Administration, initialization and upgrades',
        items: {
          InvalidConfig: {
            src: '107, 173-174, 197, 201, 206, 215, 519, 528',
            text: 'A value is out of bounds: in `initialize` (zero fee recipient, confirmations 0 or above 64, keeper share above 10000, minimum fee above 10 USDC, registry without code), `setFeeRecipient` with zero, `setKeeperFeeBps` above 10000, `setPricing` outside its bounds, `setRefundBps` outside 5000 to 10000, or a zero `recipient` for `withdrawFees` or `withdrawKeeperCredit`.',
            response: 'Use values within the bounds given for each function.',
          },
          InvalidPublicKey: {
            src: '109, 176',
            text: '`initialize` with a VRF public key that is not on secp256k1.',
            response: 'Deployment-time only.',
          },
          ReentrancyGuardReentrantCall: {
            text: 'A `nonReentrant` coordinator function (a request, `storeBlockHash`, a fulfillment, a retry, `refundRequest` or a withdrawal) was entered while another was running, for example a request made inside `rawFulfillRandomness` or `onRefund`. Inside a callback the coordinator catches it and records the callback as failed.',
            response: 'Do not call coordinator state-changing functions from callbacks; request again in a separate transaction.',
            also: 'any `nonReentrant` function entered from a callback or transfer',
          },
          ...upgradeErrors,
          RenounceDisabled: { ...upgradeErrors.RenounceDisabled, src: '134, 194' },
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
    ],
    types: {
      'EpochEntropy.Epoch': {
        src: '30-33',
        text: 'Returned by `getEpoch`; all zero until the epoch is published.',
        fields: {
          epochHash: 'Epoch commitment: `keccak256(abi.encode(EPOCH_DOMAIN, chainId, registry, catalogHash, epochId, epochStart, anchorHash, source, queryHash, dataHash, attestationHash))`.',
          catalogHash: 'Signer catalog in force for the epoch at publication.',
          anchorHash: 'Hash of block `epochStart - 1`, which selects the source.',
          source: 'Committed source slot, 0 to 3: the selected slot or a fallback.',
          queryHash: '`keccak256` of the canonical request string of the slot.',
          dataHash: '`keccak256` of the signed response data.',
          attestationHash: '`keccak256(abi.encode(queryHash, timestamp, dataHash, keccak256(signature)))`.',
          signedAt: 'Attestation timestamp in Unix seconds.',
          committedBlock: 'Publication block. Requests of the epoch target `max(requestBlock, committedBlock + 1)`.',
        },
      },
      'EpochEntropy.Selection': {
        src: '29, 121-133',
        text: 'Returned by `getEpochSelection` and `getEpochFallbackSelection`.',
        fields: {
          source: 'Source slot 0 to 3: Hyperliquid BTC volume, ANU, TickerLayer BTCUSD, TickerLayer ETHUSD.',
          airnode: 'Signer of that slot in the catalog in force for the epoch.',
          selector: '`keccak256(abi.encode(SELECT_DOMAIN, catalogHash, epochId, anchor))`; the slot is `(selector mod 4 + attempt) mod 4`.',
          queryHash: '`keccak256` of `canonicalRequest`.',
          canonicalRequest: 'Fixed request string of the slot.',
        },
      },
      'EpochEntropy.Attestation': {
        src: '28, 140-159',
        text: 'Signed source response passed to `commitEpoch` and `commitEpochFallback`.',
        fields: {
          timestamp: 'Signing time in Unix seconds; not in the future and at most `MAX_ATTESTATION_AGE` old at publication.',
          data: 'Signed response bytes, 1 to 128 bytes, in the fixed format of the slot.',
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
            src: '91-93',
            text: 'Epoch containing a block: 0 before `firstEpochStart`, otherwise `1 + (number - firstEpochStart) / 200`. A request belongs to `epochForBlock(requestBlock)`.',
          },
          epochStart: {
            caller: 'Anyone (view)',
            src: '87-90',
            text: 'First block of an epoch: `firstEpochStart + (epochId - 1) × 200`.',
            errors: ['InvalidEpoch'],
          },
          getEpoch: {
            caller: 'Anyone (view)',
            src: '108',
            text: 'The published [`EpochEntropy.Epoch`](#registry-type-epochentropy-epoch) record, or all zero while unpublished; it never reverts. A non-zero `epochHash` means published.',
          },
          catalogHashAt: {
            caller: 'Anyone (view)',
            src: '78, 80-86',
            text: 'Catalog hash in force for an epoch: the latest scheduled version whose `fromEpoch` is at or below `epochId`, otherwise the initial catalog.',
          },
          signersAt: {
            caller: 'Anyone (view)',
            src: '79, 80-86',
            text: 'Signers in force for an epoch, in slot order. Replay needs these, not the initial slot getters.',
          },
        },
      },
      {
        title: 'Registry reads',
        table: true,
        intro: 'Views, callable by anyone.',
        items: {
          firstEpochStart: { src: '26, 55', text: 'First block of epoch 1: the initialization block plus 200.' },
          committer: { src: '25, 141', text: 'Address allowed to publish epochs. The coordinator also pays the keeper share to it at each acceptance.' },
          catalogHash: { src: '27, 56', text: 'Initial signer catalog hash, bound into `protocolConfigurationHash`. Never changes; `catalogHashAt` gives the catalog of an epoch.' },
          epochAnchors: { src: '36, 97-100', text: 'Checkpointed anchor of an epoch (hash of block `epochStart - 1`); zero until a request, `checkpointEpoch` or publication stores it.' },
          hyperliquidSigner: { src: '21', text: 'Initial signer of slot 0 (Hyperliquid BTC volume). Never changes; see `signersAt`.' },
          anuSigner: { src: '22', text: 'Initial signer of slot 1 (ANU). Never changes; see `signersAt`.' },
          btcTradeSigner: { src: '23', text: 'Initial signer of slot 2 (TickerLayer BTCUSD). Never changes; see `signersAt`.' },
          ethTradeSigner: { src: '24', text: 'Initial signer of slot 3 (TickerLayer ETHUSD). Never changes; see `signersAt`.' },
        },
      },
      {
        title: 'Source selection and publication',
        intro: 'Used by the keeper. Publication is restricted to the committer; the selection views and `checkpointEpoch` are open to anyone.',
        items: {
          getEpochSelection: {
            caller: 'Anyone (view)',
            src: '109, 121-133',
            text: 'The selected source of an epoch, attempt 0, as an [`EpochEntropy.Selection`](#registry-type-epochentropy-selection).',
            errors: ['InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable'],
          },
          getEpochFallbackSelection: {
            caller: 'Anyone (view)',
            src: '110-114, 121-133',
            text: 'The source for attempt 0 to `MAX_FALLBACK_ATTEMPT` (3); attempt n uses the slot n positions after the selected one.',
            errors: ['InvalidFallback', 'InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable'],
          },
          fallbackOpensAt: {
            caller: 'Anyone (view)',
            src: '115-119',
            text: 'First block at which an attempt may be published: `epochStart + attempt × FALLBACK_DELAY_BLOCKS` (20).',
            errors: ['InvalidFallback', 'InvalidEpoch'],
          },
          nextEpochToPrepare: {
            caller: 'Anyone (view)',
            src: '94',
            text: 'Same value as `epochForBlock(number)`.',
          },
          checkpointEpoch: {
            caller: 'Anyone',
            src: '95-100, 101-107',
            text: 'Stores the anchor of a started epoch (hash of block `epochStart - 1`) if not stored yet, and returns it. The coordinator calls it on every request, so the anchor of an epoch with requests survives the 256-block `BLOCKHASH` window.',
            errors: ['InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable'],
          },
          commitEpoch: {
            caller: 'Committer',
            src: '134, 140-159',
            text: 'Publishes the packet of the selected source once per epoch, from the epoch start: checks that the attestation is not future-dated and at most 240 seconds old, that its data has the fixed format of the slot, and that the slot\'s signer in the epoch\'s catalog signed it. Stores the record and emits the packet.',
            emits: ['EpochCommitted'],
            errors: ['OnlyCommitter', 'AlreadyCommitted', 'InvalidEpoch', 'FallbackNotOpen', 'AnchorUnavailable', 'InvalidTime', 'InvalidData', 'ECDSAInvalidSignatureLength', 'ECDSAInvalidSignatureS', 'ECDSAInvalidSignature', 'InvalidSigner', 'PacketTooLarge'],
          },
          commitEpochFallback: {
            caller: 'Committer',
            src: '135-139, 140-159',
            text: 'Publishes fallback attempt 1 to 3, using the slot `attempt` positions after the selected source, once `fallbackOpensAt(epochId, attempt)` is reached. Same checks as `commitEpoch`.',
            emits: ['EpochCommitted'],
            errors: ['InvalidFallback', 'OnlyCommitter', 'AlreadyCommitted', 'InvalidEpoch', 'FallbackNotOpen', 'AnchorUnavailable', 'InvalidTime', 'InvalidData', 'ECDSAInvalidSignatureLength', 'ECDSAInvalidSignatureS', 'ECDSAInvalidSignature', 'InvalidSigner', 'PacketTooLarge'],
          },
        },
      },
      {
        title: 'Owner administration',
        intro: 'Owner-only functions revert `OwnableUnauthorizedAccount` for anyone else. No setter can change a published epoch.',
        items: {
          setCommitter: {
            caller: 'Owner',
            src: '62-65',
            text: 'Changes the publishing address, which is also the keeper-share recipient the coordinator reads at each acceptance.',
            emits: ['CommitterChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          scheduleCatalog: {
            caller: 'Owner',
            src: '66-77',
            text: 'Schedules four signers for epochs from `fromEpoch`, which must be at least two epochs after the current one. If the latest scheduled version has not taken effect yet (its `fromEpoch` is after the current epoch) it is replaced, so that version never applies; this can return the next epoch to the previous catalog. The current epoch keeps its catalog.',
            emits: ['CatalogScheduled'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig', 'InvalidEpoch'],
          },
          ...ownershipFunctions('59-60'),
          initialize: {
            caller: 'Once, by `D20Proxy` at deployment',
            src: '50-57',
            text: 'Sets the four initial signers, owner and committer. Epoch 1 starts 200 blocks after the initialization block.',
            emits: ['OwnershipTransferred', 'Initialized'],
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
          MAX_FALLBACK_ATTEMPT: { text: 'Highest fallback attempt.' },
          RECIPE_DOMAIN: { text: 'Domain tag of catalog hashes.' },
          SELECT_DOMAIN: { text: 'Domain tag of the source selector.' },
          EPOCH_DOMAIN: { text: 'Domain tag of the epoch commitment.' },
          UPGRADE_INTERFACE_VERSION: { valueFrom: 'node_modules/@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol', text: 'OpenZeppelin UUPS interface version: upgrades go through `upgradeToAndCall` only.' },
        },
      },
    ],
    events: [
      {
        title: 'Epochs',
        items: {
          EpochCommitted: {
            src: '45, 156-158',
            text: 'An epoch was published. `packet` is `abi.encode(canonicalRequest, attestation)`: decode it with `decodeEpochEvidencePacket` and verify with `replayEpochCommitment`. Requests of the epoch now have a target block.',
          },
          CatalogScheduled: {
            src: '47, 76',
            text: 'Signers scheduled for epochs from `fromEpoch`. A later `CatalogScheduled` emitted while this version has not taken effect replaces it, so when rebuilding catalogs from history drop replaced versions, or read `signersAt(epochId)`.',
          },
        },
      },
      {
        title: 'Administration and upgrades',
        items: {
          CommitterChanged: { src: '46, 64', text: 'New publishing address and keeper-share recipient.' },
          ...ownershipEvents,
        },
      },
    ],
    errors: [
      {
        title: 'Epoch reads',
        items: {
          InvalidEpoch: {
            src: '41, 71, 88',
            text: 'Epoch 0 was passed to `epochStart`, `fallbackOpensAt`, a selection view, `checkpointEpoch` or a commit, or `scheduleCatalog` got a `fromEpoch` less than two epochs after the current one.',
            response: 'Epoch IDs start at 1; schedule at least two epochs ahead.',
          },
          PreparationClosed: {
            src: '41, 103',
            text: 'The epoch has not started (`block.number` is below `epochStart(epochId)`), so its anchor block hash does not exist yet.',
            response: 'Wait for the epoch to start.',
          },
          AnchorUnavailable: {
            src: '41, 106',
            text: 'The anchor (hash of block `epochStart - 1`) was never checkpointed and is outside the 256-block `BLOCKHASH` window.',
            response: 'The epoch can no longer be selected or published. Every request checkpoints its epoch\'s anchor, so an epoch with requests is not affected.',
          },
        },
      },
      {
        title: 'Publication',
        items: {
          OnlyCommitter: { src: '42, 141', text: 'A commit from an address other than `committer()`.', response: 'Only the committer publishes.' },
          AlreadyCommitted: { src: '42, 142', text: 'The epoch already has a published packet.', response: 'Nothing to publish; read `getEpoch`.' },
          FallbackNotOpen: { src: '44, 143', text: '`block.number` is below `fallbackOpensAt(epochId, attempt)`; for attempt 0, before the epoch start.', response: 'Wait for the window.' },
          InvalidFallback: { src: '44, 112, 117, 137', text: 'An attempt above `MAX_FALLBACK_ATTEMPT`, or attempt 0 passed to `commitEpochFallback`.', response: 'Use attempts 1 to 3 for fallbacks.' },
          InvalidTime: { src: '42, 145', text: 'The attestation timestamp is in the future or more than `MAX_ATTESTATION_AGE` (240 seconds) before the publication block.', response: 'A saved packet is never refreshed; its requests expire and are refunded.' },
          InvalidData: { src: '42, 160-204', text: 'The signed data is empty, longer than 128 bytes, or not in the fixed format of the slot.', response: 'Publish only a validated response for the selected slot.' },
          InvalidSigner: { src: '42, 148', text: 'The signature does not recover to the slot\'s signer in the epoch\'s catalog.', response: 'Use `signersAt(epochId)` for the expected signer.' },
          ECDSAInvalidSignature: { text: 'The signature does not recover to any address (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          ECDSAInvalidSignatureLength: { text: 'The signature is not 65 bytes (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          ECDSAInvalidSignatureS: { text: 'The signature has a high `s` value (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          PacketTooLarge: { src: '43, 157', text: 'The encoded packet exceeds `MAX_PACKET_BYTES` (2048).', response: 'Not reachable with data of at most 128 bytes and a 65-byte signature.' },
        },
      },
      {
        title: 'Administration, initialization and upgrades',
        items: {
          InvalidConfig: {
            src: '41, 53, 63, 69',
            text: 'A zero signer or committer in `initialize`, a zero address in `setCommitter`, or a zero signer in `scheduleCatalog`.',
            response: 'Use non-zero addresses.',
          },
          ...upgradeErrors,
          RenounceDisabled: { ...upgradeErrors.RenounceDisabled, src: '43, 60' },
        },
      },
    ],
  },
];
