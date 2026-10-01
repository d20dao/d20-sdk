// Curated descriptions for API.md, rendered by scripts/api-reference.mjs together with the built ABIs in abi/.
//
// Every function, event and error in abi/D20VRFCoordinator.json, abi/EpochEntropy.json and abi/D20BeaconVerifier.json
// needs exactly one entry here, and every entry must name an item of that ABI; the generator fails otherwise. Each `src` cites line ranges in
// protocol/contracts/ (the contract's own file unless prefixed with `path:`); the generator checks that the first range
// contains the item's name. Errors and events cite their declaration first and then the lines that raise or emit them.
// "Raised by" and "Emitted by" lists in API.md are derived from the `errors` and `emits` arrays of the functions, so
// keep those arrays complete. Constant values are read from the Solidity source, not written here.
//
// Write what the source does, not what it is meant to do. Link README sections as README.md#anchor; the generator
// checks the anchors.

/** Backticked names that are not ABI items but may appear in descriptions (consumer hooks, SDK exports, builtins). */
export const externalNames = [
  'Address', 'BLOCKHASH', 'BLS', 'D20Proxy', 'D20VRFConsumer', 'D20VRFRequests', 'ECDSA', 'Error', 'IBeaconVerifier', 'ID20VRF', 'Initializable', 'InvalidCoordinator', 'MappingSpec',
  'OnlyCoordinator', 'Panic', 'RandomnessMapping', 'Result', 'Strings', 'abi', 'blockhash', 'builtins', 'decodeEpochEvidencePacket',
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
        src: '61-79',
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
            src: '232-237',
            text: 'Fee for a request with this `callbackGasLimit` priced at `block.basefee`, that is `quoteFeeAt(callbackGasLimit, block.basefee)`. Exact inside the requesting transaction, which is how `D20VRFRequests` helpers pay. Through `eth_call` the base fee is commonly reported as 0 (observed on Arc), so the answer collapses to `minFee` and a transaction sent with it reverts `IncorrectFee`. Off-chain, quote with `quoteFeeAt` and the latest header base fee plus a buffer, as `quoteRequestFee` does. It does not check the gas limit range.',
            errors: ['FeeOverflow'],
          },
          quoteFeeAt: {
            caller: 'Anyone (view)',
            src: '224-231',
            text: '`max(minFee, feeMultiplier × baseFee × (fulfillGasOverhead + callbackGasLimit))` over the live pricing for a base fee in wei that you supply; with `feeMultiplier` 0 it returns `minFee`. A quote, not a reservation: pricing can change before your transaction. A `baseFee` large enough to overflow uint256 reverts with `Panic(0x11)` instead of `FeeOverflow`.',
            errors: ['FeeOverflow'],
          },
          requestRandomness: {
            caller: 'Any contract',
            src: '239-244, 252-291',
            text: 'Creates a raw request (spec all zero) with `msg.sender` as consumer and returns its ID. Needs `msg.value` at least the fee computed in this transaction; escrows exactly that fee and credits any excess to `_refundAddress` as refund credit. Fixes the request block, epoch, client seed, refund address, fee, refund ratio (`refundBps`) and a deadline of `block.timestamp + RESPONSE_TIMEOUT`. After acceptance the consumer receives `rawFulfillRandomness(requestId, randomness)` with exactly `callbackGasLimit` gas. Checks run in this order: caller has code, refund address non-zero, gas limit in range, fee, mapping, epoch started.',
            emits: ['FeeOverpaymentCredited', 'RandomnessRequested', 'MappingRequested'],
            errors: ['ContractConsumerRequired', 'InvalidRefundAddress', 'InvalidCallbackGas', 'FeeOverflow', 'IncorrectFee', 'EpochUnavailable'],
          },
          requestMappedRandomness: {
            caller: 'Any contract',
            src: '246-250, 252-291',
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
          pricing: { src: '215-217', text: 'Live `(minFee, feeMultiplier, fulfillGasOverhead)`. The outputs are unnamed, so read them by position.' },
          minFee: { src: '46', text: 'Minimum fee in wei, at most `MAX_MIN_FEE` (10 USDC).' },
          feeMultiplier: { src: '48-49', text: 'Base-fee multiplier, 0 to `MAX_FEE_MULTIPLIER` (20); 0 makes every fee `minFee`.' },
          fulfillGasOverhead: { src: '50', text: 'Gas added to `callbackGasLimit` in the fee formula, `MIN_FULFILL_GAS_OVERHEAD` to `MAX_FULFILL_GAS_OVERHEAD`.' },
          refundBps: { src: '51-52', text: 'Current refund ratio in basis points (5000 to 10000), copied into each new request. Not the ratio of an existing request: use `requestRefundBps(requestId)`.' },
        },
      },
      {
        title: 'Reading request state and results',
        intro: 'Views, callable by anyone, including from a callback. Request IDs start at 1 and increase by one; functions taking a `requestId` revert `UnknownRequest` for an ID that was never issued. README [Reading results](README.md#reading-results) shows a polling loop.',
        items: {
          getRequest: {
            caller: 'Anyone (view)',
            src: '293-312, 575-580',
            text: 'Full state of a request, see [`D20VRFCoordinator.Request`](#coordinator-type-d20vrfcoordinator-request). `targetBlock` and `epochHash` are resolved from the registry, so they become non-zero as soon as the epoch packet is published. `fulfilled` means the word is final; `delivered` only reports that a callback succeeded. A request that is not `fulfilled` in a block whose timestamp is after `deadline` has expired and can only be refunded. When polling, read the latest block before `getRequest`, so that a proof included up to that block is visible.',
            errors: ['UnknownRequest'],
          },
          getMapping: {
            caller: 'Anyone (view)',
            src: '344-347',
            text: 'The stored [`RandomnessMapping.Spec`](#coordinator-type-randomnessmapping-spec); all fields zero (Raw) for `requestRandomness`.',
            errors: ['UnknownRequest'],
          },
          getMappedResult: {
            caller: 'Anyone (view)',
            src: '349-353',
            text: 'The accepted word mapped with the stored spec: `[uint256(word)]` for a raw request, otherwise the values in README [Randomness options](README.md#randomness-options). Part of `ID20VRF`. Reverts `NotFulfilled` until a proof is accepted, so an expired or refunded request never has a result. Gas grows with the mapping; a 256-item shuffle is expensive onchain.',
            errors: ['UnknownRequest', 'NotFulfilled'],
          },
          mapRandomness: {
            caller: 'Anyone (pure)',
            src: '355-360',
            text: 'Maps any word with any valid spec, like the SDK `mapRandomness(word, spec)` off-chain. It does not show that a request was fulfilled.',
            errors: ['InvalidMapping'],
          },
          requestFeePaid: {
            caller: 'Anyone (view)',
            src: '335-338',
            text: 'Fee escrowed by the request (`feePaid` in `RandomnessRequested`), excluding any overpayment. The keeper share, the protocol share and the refund are computed from it.',
            errors: ['UnknownRequest'],
          },
          requestRefundBps: {
            caller: 'Anyone (view)',
            src: '339-342',
            text: 'Refund ratio the request copied from `refundBps` at creation. An expiry refund pays `requestFeePaid × requestRefundBps / 10000`; a later `setRefundBps` does not change it.',
            errors: ['UnknownRequest'],
          },
          refundCallbackDelivered: {
            caller: 'Anyone (view)',
            src: '105, 528',
            text: 'True once an `onRefund` notification for the request succeeded, at `refundRequest` or `retryRefundCallback`. Returns false for unknown IDs instead of reverting.',
          },
          nextRequestId: {
            caller: 'Anyone (view)',
            src: '53, 175, 265',
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
            src: '483-507, 519-530',
            text: 'Refunds an unfulfilled request once a block timestamp is after its deadline. Marks it refunded, sends `feePaid × requestRefundBps / 10000` to the fixed refund address with a 30,000-gas transfer, or adds it to that address\'s refund credit if the transfer fails, and adds the rest of the fee to `earnedFees`. Then calls `onRefund(requestId)` on the consumer with 100,000 gas; a failed notification does not undo the refund. The caller receives nothing. Measured minimum transaction gas limit 302,558 to 357,517; use 400,000.',
            emits: ['RequestRefundedTo', 'RefundCallbackAttempted'],
            errors: ['UnknownRequest', 'RefundNotAvailable', 'InsufficientCallbackGas'],
          },
          retryCallback: {
            caller: 'Anyone',
            src: '473-481, 630-647',
            text: 'Calls `rawFulfillRandomness` again with the same accepted word after a failed callback, forwarding `gasLimit` (30,000 to 1,000,000 and not below the request\'s `callbackGasLimit`). Sets `delivered` on success. Pays nobody and never changes the word. Transaction gas limit: about `gasLimit + 250,000`.',
            emits: ['CallbackAttempted'],
            errors: ['UnknownRequest', 'NotFulfilled', 'AlreadyDelivered', 'InvalidCallbackGas', 'InsufficientCallbackGas'],
          },
          retryRefundCallback: {
            caller: 'Anyone',
            src: '509-517, 519-530',
            text: 'Repeats a failed `onRefund` notification for a refunded request with `gasLimit` (100,000 to 1,000,000). Never transfers funds again. Transaction gas limit: about `gasLimit + 150,000`.',
            emits: ['RefundCallbackAttempted'],
            errors: ['UnknownRequest', 'NotRefunded', 'RefundCallbackAlreadyDelivered', 'InvalidCallbackGas', 'InsufficientCallbackGas'],
          },
          withdrawRefundCredit: {
            caller: 'Refund-credit holder',
            src: '532-542',
            text: 'Sends all of the caller\'s refund credit, `refundCredits(msg.sender)`, to `recipient` with all remaining gas. Credit comes from overpayment and from refund transfers that failed, and belongs to the request\'s refund address, so that address must make the call. If `recipient` rejects the transfer the call reverts and the credit stays.',
            emits: ['RefundCreditWithdrawn'],
            errors: ['InvalidRefundAddress', 'NoRefundCredit', 'TransferFailed'],
          },
          withdrawFees: {
            caller: 'Fee recipient',
            src: '544-553',
            text: 'Sends all `earnedFees` to `recipient`. Fees accrue at acceptance (fee minus keeper share) and from the part of a refunded fee that is not returned; open escrow is never included. With nothing earned it sends zero without reverting.',
            emits: ['FeesWithdrawn'],
            errors: ['OnlyFeeRecipient', 'InvalidConfig', 'TransferFailed'],
          },
          withdrawKeeperCredit: {
            caller: 'Keeper-credit holder',
            src: '555-564',
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
          refundCredits: { src: '59', text: 'Refund credit that an address can withdraw with `withdrawRefundCredit`.' },
          totalRefundCredits: { src: '58', text: 'Sum of all refund credit held by the coordinator.' },
          earnedFees: { src: '54', text: 'Protocol fees that the fee recipient can withdraw.' },
          feeRecipient: { src: '42', text: 'Address allowed to call `withdrawFees`; changed with `setFeeRecipient`.' },
          keeperFeeBps: { src: '43, 450', text: 'Keeper share of each accepted fee in basis points (0 to 10000). Read at acceptance, not snapshotted: a change applies to open requests accepted afterwards. It only splits the escrowed fee; what the consumer paid and can be refunded does not change.' },
          keeperCredits: { src: '44', text: 'Keeper credit that an address can withdraw with `withdrawKeeperCredit`.' },
          totalKeeperCredits: { src: '45', text: 'Sum of all keeper credit held by the coordinator.' },
        },
      },
      {
        title: 'Keeper and proof functions',
        intro: 'Proof submission is permissionless: anyone holding a valid proof may submit it, and the keeper share goes to the submitting wallet when the registry authorizes it as its committer or a backup committer, and to `committer()` otherwise. Consumers normally only read `getRequest`. Besides the custom errors listed, proof functions can revert with `Error(string)` messages from the vendored VRF verifier, such as `invalid proof`, which are not in the ABI.',
        items: {
          fulfillRandomness: {
            caller: 'Anyone',
            src: '393-401, 430-465',
            text: 'Accepts a proof for a request that is not fulfilled, not refunded and not past its deadline; acceptance in a block with timestamp equal to `deadline` is timely. Stores the target block hash if needed, verifies the proof against `requestSeed(requestId)`, stores the word, proof hash and transcript hash, sets `fulfilled`, adds `feePaid` minus the keeper share to `earnedFees` and calls the consumer with `callbackGasLimit` gas. It then sends the keeper share (`keeperFeeBps` of `feePaid`) with 30,000 gas to the submitting wallet when the registry answers `isAuthorizedCommitter` true for it (the committer or an allowed backup committer) and to `committer()` otherwise, or records it as that wallet\'s keeper credit; a registry call that reverts also pays `committer()`. A failing callback does not revert the fulfillment.',
            emits: ['BlockHashStored', 'RequestServed', 'ProofVerified', 'RandomnessFulfilled', 'FulfillmentEvidence', 'CallbackAttempted', 'KeeperFeePaid'],
            errors: ['UnknownRequest', 'AlreadyFulfilled', 'RequestRefunded', 'RequestExpired', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed', 'EvidencePacketTooLarge', 'InsufficientCallbackGas'],
          },
          fulfillRandomnessBatch: {
            caller: 'Anyone',
            src: '403-428',
            text: 'Fulfills up to `MAX_FULFILL_BATCH` (16) requests, one proof each. Members already fulfilled, refunded or past their deadline, including an ID repeated in the batch, are skipped with `FulfillmentSkipped`; every other member runs exactly like `fulfillRandomness` and emits the same events, so an unknown ID, an unready member or an invalid proof reverts the whole batch. Before any result is revealed it checks that the gas left covers every member that will be served, `140,000 + Σ(callbackGasLimit + callbackGasLimit / 63 + 400,000)`, and reverts `InsufficientCallbackGas` otherwise, so no callback can starve a later member and revert results already revealed.',
            emits: ['FulfillmentSkipped', 'BlockHashStored', 'RequestServed', 'ProofVerified', 'RandomnessFulfilled', 'FulfillmentEvidence', 'CallbackAttempted', 'KeeperFeePaid'],
            errors: ['InvalidBatch', 'UnknownRequest', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed', 'EvidencePacketTooLarge', 'InsufficientCallbackGas'],
          },
          storeBlockHash: {
            caller: 'Anyone',
            src: '372-376, 581-596',
            text: 'Resolves the target block from the published epoch, stores its hash if not stored yet and returns it. Fulfillment does this automatically; calling it earlier keeps a request provable after its target leaves the 256-block `BLOCKHASH` window. Needs `block.number` at least `targetBlock + confirmationBlocks`. Works on any request, whatever its status.',
            emits: ['BlockHashStored'],
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          verifyRequestProof: {
            caller: 'Anyone (view)',
            src: '362-370',
            text: 'Returns the word a proof yields for the request\'s seed, without changing state. A valid proof is not acceptance: check `getRequest(requestId).fulfilled`.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable', 'WrongPublicKey', 'WrongSeed'],
          },
          requestSeed: {
            caller: 'Anyone (view)',
            src: '378-383, 598-606',
            text: 'Seed the proof must use: `keccak256(abi.encode(SEED_DOMAIN, chainId, coordinator, keyHash, requestId, consumer, clientSeed, mappingHash, requestBlock, targetBlock, blockHash, epochId, epochHash))` as uint256. Available only after publication and `confirmationBlocks` confirmations of the target block.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          getProofContext: {
            caller: 'Anyone (view)',
            src: '385-391',
            text: '`requestSeed` together with `deadline`, `fulfilled` and `refunded`. It reverts `NotReady` like `requestSeed`, so it is not a status read for waiting requests; use `getRequest`.',
            errors: ['UnknownRequest', 'NotReady', 'BlockHashUnavailable'],
          },
          getPendingRequestIds: {
            caller: 'Anyone (view)',
            src: '314-333',
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
          lastServedRequestId: { src: '55, 452', text: 'ID of the most recently accepted request; 0 before the first.' },
          lastServedIndex: { src: '56, 453', text: 'Number of accepted requests so far: the `serveIndex` of the latest `RequestServed`.' },
          servedRequestAt: { src: '57, 453', text: 'Request ID accepted at a serve index (from 1); 0 for an index not used yet.' },
          keyHash: { src: '39, 182', text: '`keccak256(abi.encode(publicKey))` of the VRF key; indexed in `RandomnessRequested` and `ProofVerified`.' },
          publicKeyX: { src: '37', text: 'x coordinate of the VRF public key.' },
          publicKeyY: { src: '38', text: 'y coordinate of the VRF public key.' },
          confirmationBlocks: { src: '47, 583', text: 'Blocks after the target block before the seed and proofs become available (1 to 64, set at initialization).' },
          epochRegistry: { src: '35', text: 'The `EpochEntropy` proxy that supplies epochs and the keeper-share recipient.' },
          protocolConfigurationHash: { src: '34, 192', text: 'Hash of the initialized configuration (public key, initial fee recipient, initial minimum fee, confirmations, registry, initial catalog hash, first epoch start, epoch length 200) under `CONFIG_DOMAIN`. Bound into every transcript hash.' },
          initialFeeRecipient: { src: '41, 184', text: 'Fee recipient given to `initialize`, used by replay. The live payout address is `feeRecipient()`.' },
          initialMinFee: { src: '107, 187', text: 'Minimum fee given to `initialize`, used by replay. The live minimum is `minFee()`.' },
        },
      },
      {
        title: 'Owner administration',
        intro: 'Owner-only functions revert `OwnableUnauthorizedAccount` for anyone else. No setter can change an existing request, the VRF key, the registry or the confirmations.',
        items: {
          setPricing: {
            caller: 'Owner',
            src: '207-214',
            text: 'Sets `minFee` (at most `MAX_MIN_FEE`, 10 USDC), `feeMultiplier` (at most `MAX_FEE_MULTIPLIER`, 20) and `fulfillGasOverhead` (`MIN_FULFILL_GAS_OVERHEAD` to `MAX_FULFILL_GAS_OVERHEAD`, 100,000 to 2,000,000 gas). `minFee` and `feeMultiplier` cannot both be zero, so a request is never free. Affects requests created afterwards; open requests keep their escrowed fee.',
            emits: ['PricingChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setRefundBps: {
            caller: 'Owner',
            src: '218-222',
            text: 'Sets the refund ratio for requests created afterwards, `MIN_REFUND_BPS` (5000) to 10000.',
            emits: ['RefundBpsChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setKeeperFeeBps: {
            caller: 'Owner',
            src: '203-206',
            text: 'Sets the keeper share, 0 to 10000 basis points. Read at each acceptance, so it also applies to open requests accepted later.',
            emits: ['KeeperFeeBpsChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setFeeRecipient: {
            caller: 'Owner',
            src: '199-202',
            text: 'Sets the address allowed to withdraw `earnedFees`, including fees earned before the change. The zero address is rejected.',
            emits: ['FeeRecipientChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          ...ownershipFunctions('196-197'),
          initialize: {
            caller: 'Once, by `D20Proxy` at deployment',
            src: '172-193',
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
            src: '141-145, 288-289',
            text: 'A request was created. `feePaid` is the escrowed fee, not `msg.value`; `deadline` is the block timestamp plus 60 seconds. Read `requestId` from this log in the request receipt, filtering by the coordinator address and event name: with an overpayment, `FeeOverpaymentCredited` comes first.',
          },
          MappingRequested: {
            src: '160, 290',
            text: 'Emitted right after `RandomnessRequested` with the stored spec (all zero for a raw request) and its hash.',
          },
          FeeOverpaymentCredited: {
            src: '154, 282-287',
            text: '`msg.value` exceeded the fee and `amount` was added to `refundCredits(refundAddress)`, independently of what happens to the request. Emitted before `RandomnessRequested`.',
          },
          BlockHashStored: {
            src: '146, 589-596',
            text: 'The target block hash of the request was stored. Emitted once per request: by `storeBlockHash`, or by fulfillment if the hash was not stored before.',
          },
          RequestServed: {
            src: '162, 452-454',
            text: 'A proof was accepted. `serveIndex` counts accepted requests from 1 (`lastServedIndex`, `servedRequestAt`).',
          },
          ProofVerified: {
            src: '161, 455',
            text: 'Seed and hash of the accepted proof.',
          },
          RandomnessFulfilled: {
            src: '147, 456',
            text: 'A proof was accepted and `randomness` is final. `submitter` sent the transaction; `KeeperFeePaid` names the wallet that received the keeper share, which is `submitter` only when the registry authorizes it.',
          },
          FulfillmentEvidence: {
            src: '165-166, 467-471',
            text: 'The accepted proof as a 416-byte ABI-encoded packet, indexed by `transcriptHash`. Decode it with `decodeEvidencePacket`; take evidence from this log, not from calldata, since a batch carries several proofs.',
          },
          CallbackAttempted: {
            src: '148, 630-647',
            text: 'Result of calling `rawFulfillRandomness` with `gasLimit` gas, at fulfillment and at each `retryCallback`. `success` false means the consumer reverted, ran out of gas or has no code; the word is accepted either way.',
          },
          KeeperFeePaid: {
            src: '155, 459-464',
            text: 'At acceptance, when the keeper share is non-zero: `amount` went to `keeper`, the submitter when the registry authorizes it and `committer()` otherwise, by a 30,000-gas transfer (`paid` true) or was added to `keeperCredits(keeper)` (`paid` false). Emitted after `CallbackAttempted`.',
          },
          FulfillmentSkipped: {
            src: '163-164, 424-425',
            text: 'A batch member was left untouched: `reason` 1 already fulfilled, 2 refunded, 3 past its deadline.',
          },
          RequestRefundedTo: {
            src: '157, 505',
            text: 'An expired request was refunded: `amount` (`feePaid × requestRefundBps / 10000`) was sent to `refundAddress` (`paid` true) or added to its refund credit (`paid` false).',
          },
          RefundCallbackAttempted: {
            src: '159, 519-530',
            text: 'Result of calling `onRefund(requestId)` on `consumer` with `gasLimit` gas: 100,000 at `refundRequest`, the caller\'s limit at `retryRefundCallback`.',
          },
        },
      },
      {
        title: 'Credits and withdrawals',
        items: {
          RefundCreditWithdrawn: { src: '158, 541', text: '`owner`, the credit holder (not the contract owner), withdrew `amount` of refund credit to `recipient`.' },
          KeeperCreditWithdrawn: { src: '156, 563', text: '`keeper` withdrew `amount` of keeper credit to `recipient`.' },
          FeesWithdrawn: { src: '149, 552', text: 'The fee recipient withdrew `amount` of earned fees to `recipient`.' },
        },
      },
      {
        title: 'Administration and upgrades',
        items: {
          PricingChanged: { src: '152, 213', text: 'New `minFee`, `feeMultiplier` and `fulfillGasOverhead` for requests created afterwards.' },
          RefundBpsChanged: { src: '153, 221', text: 'New refund ratio for requests created afterwards.' },
          KeeperFeeBpsChanged: { src: '151, 205', text: 'New keeper share, applied at later acceptances, including of requests already open.' },
          FeeRecipientChanged: { src: '150, 201', text: 'New address allowed to withdraw earned fees.' },
          ...ownershipEvents,
        },
      },
    ],
    errors: [
      {
        title: 'Requesting',
        items: {
          ContractConsumerRequired: {
            src: '113, 255',
            text: 'The caller of a request function has no code: an externally owned account, or a contract still running its constructor.',
            response: 'Send the request through a deployed consumer contract (README [Integrate a consumer](README.md#integrate-a-consumer)), and not from its constructor.',
          },
          InvalidRefundAddress: {
            src: '127, 256, 534',
            text: 'A request named the zero address as refund address, or `withdrawRefundCredit` named the zero address as recipient.',
            response: 'Pass a non-zero address that can receive a plain native transfer or call `withdrawRefundCredit`.',
          },
          InvalidCallbackGas: {
            src: '115, 479, 515, 626-628',
            text: 'A gas limit is out of range: a request `callbackGasLimit` outside 30,000 to 1,000,000; a `retryCallback` limit outside that range or below the request\'s `callbackGasLimit`; a `retryRefundCallback` limit outside 100,000 to 1,000,000.',
            response: 'Use a limit inside the range; retry with at least the original limit.',
          },
          IncorrectFee: {
            src: '114, 259',
            text: '`actual` (`msg.value`) is below `expected`, the fee computed in the request transaction. No request was created.',
            response: 'Quote again with `quoteFeeAt(callbackGasLimit, latestBlock.baseFeePerGas)` plus a buffer (`quoteRequestFee`) and resend. A contract paying in the same transaction sends `quoteFee(callbackGasLimit)`. Never quote with `quoteFee` through `eth_call`.',
          },
          FeeOverflow: {
            src: '138, 229',
            text: 'The dynamic fee exceeds the uint96 escrow limit. Within the pricing bounds that needs a base fee above about 1.3e21 wei.',
            response: 'Not expected on a live chain. For `quoteFeeAt`, check that `baseFee` is in wei.',
          },
          InvalidMapping: {
            src: 'libraries/RandomnessMapping.sol:19, 21-39',
            text: 'The spec breaks the rules for its operation (README [Randomness options](README.md#randomness-options)). Declared in `RandomnessMapping`.',
            response: 'Build specs with the `D20VRFRequests` helpers or TypeScript `builtins`, which enforce the same bounds.',
          },
          EpochUnavailable: {
            src: '111, 263',
            text: 'The request block is before the registry\'s first epoch: `epochForBlock(block.number)` is 0.',
            response: 'Not expected on the Arc deployments, whose epochs have started. Check that you call the coordinator proxy for your chain; on a new deployment, wait for `firstEpochStart`.',
          },
        },
      },
      {
        title: 'Reading and recovery',
        items: {
          UnknownRequest: {
            src: '116, 566-569',
            text: 'No request has this ID: 0, or not below `nextRequestId()`. An unknown ID also reverts a whole `fulfillRandomnessBatch`.',
            response: 'Take `requestId` from the `RandomnessRequested` log of the request receipt, and read from the same chain and coordinator proxy.',
          },
          NotFulfilled: {
            src: '120, 351, 476',
            text: '`getMappedResult` or `retryCallback` on a request without an accepted proof, including an expired or refunded one.',
            response: 'Poll `getRequest(requestId)` until `fulfilled`. Once a block timestamp is after `deadline` without fulfillment, the request has expired and only `refundRequest` applies.',
          },
          AlreadyDelivered: {
            src: '121, 477',
            text: '`retryCallback` on a request whose callback already succeeded.',
            response: 'Nothing to retry.',
          },
          RefundNotAvailable: {
            src: '130, 488',
            text: '`refundRequest` on a request that is fulfilled, already refunded, or not yet past its deadline (the block timestamp must be greater than `deadline`).',
            response: 'Read `getRequest`: use the result if `fulfilled`, stop if `refunded`, otherwise retry after a block with a later timestamp than `deadline`.',
          },
          NotRefunded: {
            src: '133, 512',
            text: '`retryRefundCallback` on a request that has not been refunded.',
            response: 'Call `refundRequest` after the deadline first.',
          },
          RefundCallbackAlreadyDelivered: {
            src: '134, 513',
            text: '`retryRefundCallback` after an `onRefund` notification already succeeded (`refundCallbackDelivered`).',
            response: 'Nothing to retry.',
          },
          InsufficientCallbackGas: {
            src: '124, 421, 497, 522, 638-639',
            text: 'Too little gas remained to forward the full callback budget and keep the coordinator\'s reserve: `gasLimit + gasLimit/63 + 140,000` before a fulfillment callback, `100,000 + 100,000/63 + 140,000` after refund settlement, `gasLimit + gasLimit/63 + 50,000` before a refund notification, and `140,000 + Σ(callbackGasLimit + callbackGasLimit / 63 + 400,000)` over the served members before `fulfillRandomnessBatch` reveals any result. The coordinator reverts instead of forwarding less.',
            response: 'Raise the transaction gas limit: 400,000 for `refundRequest`, `gasLimit + 250,000` for `retryCallback`, `gasLimit + 150,000` for `retryRefundCallback` (README [Gas for refund and retry calls](README.md#gas-for-refund-and-retry-calls)); a keeper sizes a batch to the sum above. `eth_estimateGas` finds the minimum.',
          },
        },
      },
      {
        title: 'Credits and withdrawals',
        items: {
          NoRefundCredit: {
            src: '131, 536',
            text: '`withdrawRefundCredit` from an address without refund credit. Credit is keyed by the refund address, which must be `msg.sender`.',
            response: 'Call from the refund address; `refundCredits(address)` shows the balance.',
          },
          TransferFailed: {
            src: '126, 540, 551, 562',
            text: 'The `recipient` of `withdrawRefundCredit`, `withdrawFees` or `withdrawKeeperCredit` rejected the native transfer. Balances are unchanged.',
            response: 'Choose a recipient that accepts plain native transfers.',
          },
          OnlyFeeRecipient: {
            src: '125, 546',
            text: '`withdrawFees` from an address other than `feeRecipient()`.',
            response: 'Only the fee recipient withdraws protocol fees.',
          },
          NoKeeperCredit: {
            src: '132, 558',
            text: '`withdrawKeeperCredit` from an address without keeper credit.',
            response: '`keeperCredits(address)` shows the balance.',
          },
        },
      },
      {
        title: 'Proofs and keepers',
        items: {
          NotReady: {
            src: '117, 583',
            text: 'The request cannot be proven yet: its epoch packet is not published, or `block.number` is below `targetBlock + confirmationBlocks`.',
            response: 'For a consumer this only means the request is still waiting. Keepers retry after publication and confirmations.',
          },
          BlockHashUnavailable: {
            src: '118, 586',
            text: 'The target block hash was never stored and is outside the 256-block `BLOCKHASH` window. The request can no longer be fulfilled.',
            response: 'Call `refundRequest` after the deadline. Keepers call `storeBlockHash` before the window closes.',
          },
          AlreadyFulfilled: {
            src: '119, 397',
            text: '`fulfillRandomness` on a fulfilled request.',
            response: 'Nothing to do; read the result.',
          },
          RequestRefunded: {
            src: '129, 398',
            text: '`fulfillRandomness` on a refunded request.',
            response: 'The request is settled and will never have a result.',
          },
          RequestExpired: {
            src: '128, 399',
            text: '`fulfillRandomness` in a block whose timestamp is after the request\'s deadline.',
            response: 'The request can only be refunded with `refundRequest`.',
          },
          WrongPublicKey: {
            src: '122, 611',
            text: 'The proof\'s `pk` is not the coordinator\'s VRF key.',
            response: 'Only proofs from the configured key are accepted.',
          },
          WrongSeed: {
            src: '123, 613',
            text: 'The proof\'s `seed` differs from `requestSeed(requestId)`.',
            response: 'Prove the stored seed; it cannot change.',
          },
          EvidencePacketTooLarge: {
            src: '136, 469',
            text: 'The encoded proof exceeds `MAX_EVIDENCE_PACKET_BYTES`. A proof always encodes to 416 bytes, so valid calls never reach this bound.',
            response: 'None expected.',
          },
          InvalidBatch: {
            src: '139, 410',
            text: '`fulfillRandomnessBatch` with no IDs, more than 16, or a different number of proofs.',
            response: 'Send 1 to 16 IDs with one proof each.',
          },
          InvalidScan: {
            src: '135, 320',
            text: '`getPendingRequestIds` with `fromId` 0, `limit` 0 or `limit` above 256.',
            response: 'Start at 1 and page with at most 256.',
          },
        },
      },
      {
        title: 'Administration, initialization and upgrades',
        items: {
          InvalidConfig: {
            src: '110, 176-177, 200, 204, 209, 211, 220, 547, 556',
            text: 'A value is out of bounds: in `initialize` (zero fee recipient, confirmations 0 or above 64, keeper share above 10000, minimum fee above 10 USDC, registry without code), `setFeeRecipient` with zero, `setKeeperFeeBps` above 10000, `setPricing` outside its bounds or with `minFee` and `feeMultiplier` both zero, `setRefundBps` outside 5000 to 10000, or a zero `recipient` for `withdrawFees` or `withdrawKeeperCredit`.',
            response: 'Use values within the bounds given for each function.',
          },
          InvalidPublicKey: {
            src: '112, 179',
            text: '`initialize` with a VRF public key that is not on secp256k1.',
            response: 'Deployment-time only.',
          },
          ReentrancyGuardReentrantCall: {
            text: 'A `nonReentrant` coordinator function (a request, `storeBlockHash`, a fulfillment, a retry, `refundRequest` or a withdrawal) was entered while another was running, for example a request made inside `rawFulfillRandomness` or `onRefund`. Inside a callback the coordinator catches it and records the callback as failed.',
            response: 'Do not call coordinator state-changing functions from callbacks; request again in a separate transaction.',
            also: 'any `nonReentrant` function entered from a callback or transfer',
          },
          ...upgradeErrors,
          RenounceDisabled: { ...upgradeErrors.RenounceDisabled, src: '137, 197' },
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
      'Epoch sources are recipes in an owner-managed, append-only registry: each has an id, a canonical request whose `keccak256` is the query hash its signer signs, a data template that fixes the exact signed bytes the registry accepts (README [Data templates](README.md#data-templates)) and the body keepers send: the JSON they post to the provider gateway, or a beacon\'s canonical request. A catalog lists 1 to `MAX_SOURCES` registered recipes with one signer each; each epoch selects from the catalog in force for it (`catalogAt`).',
      'A recipe is one of two kinds. A signed API recipe (`registerRecipe`) commits a provider\'s signed record: the signature is an EIP-191 signature of the recipe\'s signer over the query hash, timestamp and data. A beacon recipe (`registerBeacon`) commits one round of a public randomness beacon such as drand: the data is the round number, the timestamp the round\'s scheduled time and the signature the beacon\'s, which the verifier recorded in its registration (`beaconOf`) checks. Its catalog signer is `slotSigner(recipe)`, an identity derived from the registration. Replay needs the registration of every beacon recipe an epoch used (README [Beacon epochs](README.md#beacon-epochs)).',
    ],
    types: {
      'EpochEntropy.Epoch': {
        src: '57-60',
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
        src: '55-56, 345-356',
        text: 'Returned by `getEpochSelection` and `getEpochFallbackSelection`.',
        fields: {
          source: 'Slot in the epoch\'s catalog.',
          recipe: 'Registered recipe id at that slot.',
          airnode: 'Signer of that slot in the catalog in force for the epoch; for a beacon recipe its `slotSigner`.',
          selector: '`keccak256(abi.encode(SELECT_DOMAIN, catalogHash, epochId, anchor))`; the slot is `(selector mod count + attempt) mod count` with `count = sourceCountAt(epochId)`.',
          queryHash: '`keccak256` of `canonicalRequest`.',
          canonicalRequest: 'Canonical request of the recipe, as `getRecipe` returns it.',
        },
      },
      'EpochEntropy.Attestation': {
        src: '54, 363-391',
        text: 'Source response passed to `commitEpoch` and `commitEpochFallback`: a signed API record or a beacon round.',
        fields: {
          timestamp: 'Signing time in Unix seconds, or for a beacon round its scheduled time `genesis + (round - 1) × period`; not in the future and at most `MAX_ATTESTATION_AGE` old at publication.',
          data: 'Signed response bytes, or for a beacon the round number in decimal, at most `MAX_DATA_BYTES` (128), matching the data template of the slot\'s recipe exactly.',
          signature: 'For a signed API recipe, the 65-byte signature over `toEthSignedMessageHash(keccak256(abi.encodePacked(queryHash, timestamp, data)))`. For a beacon recipe, the beacon\'s 64-byte signature of the round, which the registered verifier checks.',
        },
      },
      'EpochEntropy.Beacon': {
        src: '64-66',
        text: 'Returned by `beaconOf`: the registration of a beacon recipe. Fixed when `registerBeacon` appends the recipe. All zero for a signed API recipe.',
        fields: {
          verifier: 'Contract that checks a round\'s signature under `publicKey` (`IBeaconVerifier`, for drand\'s evmnet `D20BeaconVerifier`). Zero marks a signed API recipe.',
          genesis: 'Scheduled time of round 1, Unix seconds. Round `r` is scheduled at `genesis + (r - 1) × period`.',
          period: 'Seconds between rounds.',
          chainHash: 'Identifier of the beacon network (for drand, the chain hash), 32 bytes. The recipe\'s canonical request is `["drand","<chainHash>"]`.',
          publicKey: 'The beacon\'s group public key as the verifier reads it; for `D20BeaconVerifier` 128 bytes, `x_im ‖ x_re ‖ y_im ‖ y_re` of a BN254 G2 point.',
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
            src: '318-320',
            text: 'Epoch containing a block: 0 before `firstEpochStart`, otherwise `1 + (number - firstEpochStart) / 200`. A request belongs to `epochForBlock(requestBlock)`.',
          },
          epochStart: {
            caller: 'Anyone (view)',
            src: '314-317',
            text: 'First block of an epoch: `firstEpochStart + (epochId - 1) × 200`.',
            errors: ['InvalidEpoch'],
          },
          getEpoch: {
            caller: 'Anyone (view)',
            src: '335',
            text: 'The published [`EpochEntropy.Epoch`](#registry-type-epochentropy-epoch) record, or all zero while unpublished; it never reverts. A non-zero `epochHash` means published.',
          },
          catalogAt: {
            caller: 'Anyone (view)',
            src: '295-303, 309-313',
            text: 'The catalog in force for an epoch: its hash and the recipe id and signer of each slot, in slot order. That is the latest scheduled version whose `fromEpoch` is at or below `epochId`, otherwise the initial catalog: recipes 0 to 3 with the initial signers and hash `catalogHash()`. Replay needs this catalog, not the initial signer getters.',
          },
          sourceCountAt: {
            caller: 'Anyone (view)',
            src: '304-308, 309-313',
            text: 'Number of slots in the catalog in force for an epoch, and so the number of selection attempts, 0 to count - 1.',
          },
          getRecipe: {
            caller: 'Anyone (view)',
            src: '150-154, 157-160',
            text: 'A registered recipe: `queryHash` (`keccak256` of `canonicalRequest`), the canonical request its signer signs, the data template its signed data must match and the body keepers send: the JSON they post to the provider gateway, or for a beacon recipe its canonical request. Registered recipes never change. `readEpochRecipes` in `@d20dao/vrf-sdk/epoch` reads recipes with this view, checks each query hash and adds the registration of a beacon recipe from `beaconOf`.',
            errors: ['InvalidConfig'],
          },
          beaconOf: {
            caller: 'Anyone (view)',
            src: '188-192',
            text: 'The registration of a recipe as an [`EpochEntropy.Beacon`](#registry-type-epochentropy-beacon): verifier, genesis, period, chain hash and public key. A signed API recipe returns all zero. Replay of a beacon epoch needs this registration, and `readEpochRecipes` reads it for every recipe whose canonical request names drand.',
            errors: ['InvalidConfig'],
          },
          slotSigner: {
            caller: 'Anyone (view)',
            src: '193-199',
            text: 'The signer a catalog lists for a beacon recipe: the low 160 bits of `keccak256(abi.encode(BEACON_DOMAIN, verifier, chainHash, keccak256(publicKey), genesis, period))`, an identity derived from the registration and not a key. Zero for a signed API recipe and for an id that is not registered. `scheduleCatalog` requires it as the signer of a beacon slot; `beaconSlotSigner` in `@d20dao/vrf-sdk` computes it off-chain.',
          },
          verifyBeacon: {
            caller: 'Anyone (view)',
            src: '200-209',
            text: 'Whether `signature` is the valid signature of `round` for a beacon recipe, checked the way a publication checks it: the recipe\'s verifier is called with a fixed allowance of `BEACON_VERIFY_GAS` and only an exact `true` counts. False for a signed API recipe and for an id that is not registered. For a beacon recipe it reverts `BeaconGasTooLow`, and never answers false, when the gas of the call cannot give the verifier its whole allowance; an `eth_call` needs about 461,000 gas.',
            errors: ['BeaconGasTooLow'],
          },
          recipeRequest: {
            caller: 'Anyone (view)',
            src: '155-160',
            text: 'Canonical request of a registered recipe, the same string `getRecipe` returns.',
            errors: ['InvalidConfig'],
          },
          recipeCount: {
            caller: 'Anyone (view)',
            src: '149',
            text: 'Number of registered recipes; ids run from 0 to `recipeCount() - 1`.',
          },
        },
      },
      {
        title: 'Registry reads',
        table: true,
        intro: 'Views, callable by anyone.',
        items: {
          firstEpochStart: { src: '52, 101', text: 'First block of epoch 1: the initialization block plus 200.' },
          committer: { src: '51, 364', text: 'Primary publishing address. The coordinator pays it the keeper share of the requests it serves itself and of every request whose proof came from a wallet this registry does not authorize.' },
          isBackupCommitter: { src: '136', text: 'Whether an address may publish epochs besides `committer()`.' },
          isAuthorizedCommitter: { src: '137-139', text: 'Whether an address may publish epochs at all: `committer()` or an allowed backup committer. The coordinator reads it to decide whether a proof submitter earns the keeper share.' },
          backupCommitterCount: { src: '78, 125-135', text: 'Number of allowed backup committers, at most `MAX_BACKUP_COMMITTERS`.' },
          catalogHash: { src: '53, 102', text: 'Initial catalog hash, bound into `protocolConfigurationHash`. Never changes; `catalogAt` gives the catalog of an epoch.' },
          epochAnchors: { src: '68, 324-327', text: 'Checkpointed anchor of an epoch (hash of block `epochStart - 1`); zero until a request, `checkpointEpoch` or publication stores it.' },
          hyperliquidSigner: { src: '46', text: 'Initial-catalog signer of slot 0 (recipe 0, Hyperliquid BTC volume). Never changes; see `catalogAt`.' },
          ethereumBlockSigner: { src: '47-48', text: 'Initial-catalog signer of slot 1 (recipe 1, Ethereum block hash). Never changes; see `catalogAt`.' },
          btcTradeSigner: { src: '49', text: 'Initial-catalog signer of slot 2 (recipe 2, TickerLayer BTCUSD). Never changes; see `catalogAt`.' },
          ethTradeSigner: { src: '50', text: 'Initial-catalog signer of slot 3 (recipe 3, TickerLayer ETHUSD). Never changes; see `catalogAt`.' },
        },
      },
      {
        title: 'Source selection and publication',
        intro: 'Used by keepers. Publication is restricted to the committer and backup committers; the selection views and `checkpointEpoch` are open to anyone.',
        items: {
          getEpochSelection: {
            caller: 'Anyone (view)',
            src: '336, 345-356',
            text: 'The selected source of an epoch, attempt 0, as an [`EpochEntropy.Selection`](#registry-type-epochentropy-selection).',
            errors: ['InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable', 'InvalidConfig'],
          },
          getEpochFallbackSelection: {
            caller: 'Anyone (view)',
            src: '337-338, 345-356',
            text: 'The source for attempt 0 to `sourceCountAt(epochId) - 1`; attempt n uses the slot n positions after the selected one.',
            errors: ['InvalidFallback', 'InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable', 'InvalidConfig'],
          },
          fallbackOpensAt: {
            caller: 'Anyone (view)',
            src: '339-343',
            text: 'First block at which an attempt may be published: `epochStart + attempt × FALLBACK_DELAY_BLOCKS` (20). With at most `MAX_SOURCES` (10) slots the last window opens 180 blocks into the epoch.',
            errors: ['InvalidFallback', 'InvalidEpoch'],
          },
          nextEpochToPrepare: {
            caller: 'Anyone (view)',
            src: '321',
            text: 'Same value as `epochForBlock(number)`.',
          },
          checkpointEpoch: {
            caller: 'Anyone',
            src: '322-327, 328-334',
            text: 'Stores the anchor of a started epoch (hash of block `epochStart - 1`) if not stored yet, and returns it. The coordinator calls it on every request, so the anchor of an epoch with requests survives the 256-block `BLOCKHASH` window.',
            errors: ['InvalidEpoch', 'PreparationClosed', 'AnchorUnavailable'],
          },
          commitEpoch: {
            caller: 'Committer or backup committer',
            src: '357, 363-391',
            text: 'Publishes the packet of the selected source once per epoch, from the epoch start: checks that the attestation is not future-dated and at most 240 seconds old and that its data matches the data template of the slot\'s recipe exactly, then checks its signature. For a signed API recipe the slot\'s signer in the epoch\'s catalog must have signed it. For a beacon recipe the timestamp must be the scheduled time of the round in the data, and the verifier of its registration must accept the signature of that round within `BEACON_VERIFY_GAS`; the call reverts `BeaconGasTooLow` when the gas left cannot give the verifier that allowance. Stores the record and emits the packet. Publishing earns nothing by itself: the keeper share of each request goes to the authorized wallet that submits its accepted proof, or to `committer()` when the submitter is not authorized.',
            emits: ['EpochCommitted'],
            errors: ['OnlyCommitter', 'AlreadyCommitted', 'InvalidEpoch', 'FallbackNotOpen', 'AnchorUnavailable', 'InvalidConfig', 'InvalidTime', 'InvalidData', 'ECDSAInvalidSignatureLength', 'ECDSAInvalidSignatureS', 'ECDSAInvalidSignature', 'InvalidSigner', 'BeaconGasTooLow', 'PacketTooLarge'],
          },
          commitEpochFallback: {
            caller: 'Committer or backup committer',
            src: '358-362, 363-391',
            text: 'Publishes fallback attempt 1 to `sourceCountAt(epochId) - 1`, using the slot `attempt` positions after the selected source, once `fallbackOpensAt(epochId, attempt)` is reached. Same checks as `commitEpoch`.',
            emits: ['EpochCommitted'],
            errors: ['InvalidFallback', 'OnlyCommitter', 'AlreadyCommitted', 'InvalidEpoch', 'FallbackNotOpen', 'AnchorUnavailable', 'InvalidConfig', 'InvalidTime', 'InvalidData', 'ECDSAInvalidSignatureLength', 'ECDSAInvalidSignatureS', 'ECDSAInvalidSignature', 'InvalidSigner', 'BeaconGasTooLow', 'PacketTooLarge'],
          },
        },
      },
      {
        title: 'Recipes and catalogs',
        intro: 'Owner-only; on Arc Mainnet the owner is the DAO treasury Safe. A recipe or catalog never changes a published epoch.',
        items: {
          registerRecipe: {
            caller: 'Owner',
            src: '141-148, 161-170',
            text: 'Appends an immutable recipe and returns its id, the next index. The canonical request is 1 to `MAX_REQUEST_BYTES` (1024) bytes, the body 1 to `MAX_BODY_BYTES` (2048) bytes, and the template must be a well-formed data template of at most `MAX_TEMPLATE_BYTES` (256) bytes; at most `MAX_RECIPES` (256) recipes exist. The contract does not check that the body canonicalizes to the request; keepers refuse a recipe whose body does not. A changed listing is registered as a new id.',
            emits: ['RecipeRegistered'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidRecipe', 'InvalidTemplate'],
          },
          registerBeacon: {
            caller: 'Owner',
            src: '171-187',
            text: 'Appends a public randomness beacon as an immutable recipe and returns its id. Its canonical request, which is also its body, is `["drand","<chainHash>"]` with the hash in lowercase hex, and its template accepts one round number: 1 to 19 decimal digits without a leading zero. An epoch it serves commits round `r` as the data, the round\'s scheduled time `genesis + (r - 1) × period` as the timestamp and the beacon\'s signature of the round, which `verifier` checks under `publicKey`. Reverts `InvalidConfig` for a verifier without code, a zero `chainHash`, `genesis`, `period` or `sampleRound`, a `sampleRound` not yet scheduled, a key the verifier does not accept, or a `sampleSignature` of `sampleRound` it rejects, so that a malformed key or a verifier that misbehaves or needs more gas cannot register. The registration, like the recipe, never changes.',
            emits: ['RecipeRegistered', 'BeaconRegistered'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig', 'BeaconGasTooLow', 'InvalidRecipe'],
          },
          scheduleCatalog: {
            caller: 'Owner',
            src: '268-294',
            text: 'Schedules a catalog for epochs from `fromEpoch`, which must be at least two epochs after the current one: 1 to `MAX_SOURCES` (10) distinct registered recipe ids with one non-zero signer each, in slot order; the signer of a beacon recipe must be its `slotSigner`. Its hash is `keccak256(abi.encode(RECIPE_DOMAIN, recipes, signers))`. A pending version, one whose `fromEpoch` is two or more epochs after the current one, is replaced, so that version never applies. The version that takes effect at the next epoch is kept, as is every active one, because the next epoch\'s catalog is already fixed: its snapshot may be prepared and its requests open. The current epoch keeps its catalog.',
            emits: ['CatalogScheduled'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig', 'InvalidEpoch'],
          },
          initializeRecipeRegistry: {
            caller: 'Owner, once per proxy, as the `upgradeToAndCall` data of the recipe-registry upgrade',
            src: '105-113',
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
            src: '118-121',
            text: 'Changes the primary publishing address, which is also the keeper-share recipient the coordinator reads at each acceptance.',
            emits: ['CommitterChanged'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          setBackupCommitter: {
            caller: 'Owner',
            src: '122-135',
            text: 'Allows or removes a backup committer: a separate wallet that may call `commitEpoch` and `commitEpochFallback` under exactly the committer\'s rules, for example a follower keeper that takes over while the primary keeper is down. It has no other role, and the coordinator pays it the keeper share of the requests whose accepted proofs it submits itself. Reverts for the zero address, for allowing the current committer, for a call that does not change the address\'s status, and for more than `MAX_BACKUP_COMMITTERS` (4).',
            emits: ['BackupCommitterSet'],
            errors: ['OwnableUnauthorizedAccount', 'InvalidConfig'],
          },
          ...ownershipFunctions('115-116'),
          initialize: {
            caller: 'Once, by `D20Proxy` at deployment',
            src: '96-104',
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
          BEACON_DOMAIN: { text: 'Domain tag of `slotSigner`.' },
          BEACON_VERIFY_GAS: { text: 'Gas a beacon verifier gets for one round; `D20BeaconVerifier` uses about 175,000 of it. A call that cannot leave the verifier this much reverts `BeaconGasTooLow`.' },
          UPGRADE_INTERFACE_VERSION: { valueFrom: 'node_modules/@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol', text: 'OpenZeppelin UUPS interface version: upgrades go through `upgradeToAndCall` only.' },
        },
      },
    ],
    events: [
      {
        title: 'Epochs, recipes and catalogs',
        items: {
          EpochCommitted: {
            src: '88, 388-390',
            text: 'An epoch was published. `packet` is `abi.encode(canonicalRequest, attestation)`: decode it with `decodeEpochEvidencePacket` and verify with `replayEpochCommitment`, which needs the registration of a beacon recipe as well. Requests of the epoch now have a target block.',
          },
          RecipeRegistered: {
            src: '91, 169',
            text: 'Recipe `recipe` was registered, by `registerRecipe` or by `registerBeacon`. The event carries the complete definition, so every recipe can be rebuilt from logs; `getRecipe` returns the same values.',
          },
          BeaconRegistered: {
            src: '93, 186',
            text: 'Recipe `recipe` is a beacon recipe: emitted right after its `RecipeRegistered` with the registration `beaconOf` returns (`verifier`, `chainHash`, `publicKey`, `genesis`, `period`).',
          },
          CatalogScheduled: {
            src: '90, 293',
            text: 'A catalog was scheduled for epochs from `fromEpoch`: recipe ids and signers in slot order. A later `CatalogScheduled` emitted while this version is still pending, two or more epochs ahead, replaces it, so when rebuilding catalogs from history drop replaced versions, or read `catalogAt(epochId)`.',
          },
        },
      },
      {
        title: 'Administration and upgrades',
        items: {
          CommitterChanged: { src: '89, 120', text: 'New primary publishing address; it also receives the keeper share of proofs submitted by wallets the registry does not authorize.' },
          BackupCommitterSet: { src: '92, 134', text: '`account` may now publish epochs (`allowed` true) or no longer may (`allowed` false).' },
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
            src: '83, 284, 315',
            text: 'Epoch 0 was passed to `epochStart`, `fallbackOpensAt`, a selection view, `checkpointEpoch` or a commit, or `scheduleCatalog` got a `fromEpoch` less than two epochs after the current one.',
            response: 'Epoch IDs start at 1; schedule at least two epochs ahead.',
          },
          PreparationClosed: {
            src: '83, 330',
            text: 'The epoch has not started (`block.number` is below `epochStart(epochId)`), so its anchor block hash does not exist yet.',
            response: 'Wait for the epoch to start.',
          },
          AnchorUnavailable: {
            src: '83, 333',
            text: 'The anchor (hash of block `epochStart - 1`) was never checkpointed and is outside the 256-block `BLOCKHASH` window.',
            response: 'The epoch can no longer be selected or published. Every request checkpoints its epoch\'s anchor, so an epoch with requests is not affected.',
          },
        },
      },
      {
        title: 'Publication',
        items: {
          OnlyCommitter: { src: '84, 364', text: 'A commit from an address that is neither `committer()` nor an allowed backup committer.', response: 'Only the committer and backup committers publish; check `isBackupCommitter`.' },
          AlreadyCommitted: { src: '84, 365', text: 'The epoch already has a published packet.', response: 'Nothing to publish; read `getEpoch`.' },
          FallbackNotOpen: { src: '86, 366', text: '`block.number` is below `fallbackOpensAt(epochId, attempt)`; for attempt 0, before the epoch start.', response: 'Wait for the window.' },
          InvalidFallback: { src: '86, 341, 349, 360', text: 'An attempt at or above `sourceCountAt(epochId)`, or attempt 0 passed to `commitEpochFallback`.', response: 'Use attempts 1 to `sourceCountAt(epochId) - 1` for fallbacks.' },
          InvalidTime: { src: '84, 368, 378', text: 'The attestation timestamp is in the future or more than `MAX_ATTESTATION_AGE` (240 seconds) before the publication block, or, for a beacon recipe, is not the scheduled time of the round in the data.', response: 'A saved packet is never refreshed; its requests expire and are refunded.' },
          InvalidData: { src: '84, 369-370', text: 'The signed data does not match the data template of the slot\'s recipe exactly, which includes data longer than `MAX_DATA_BYTES` (128).', response: 'Publish only a response that matches the selected recipe\'s template, unmodified.' },
          InvalidSigner: { src: '84, 374, 379', text: 'The signature does not recover to the slot\'s signer in the epoch\'s catalog, or, for a beacon recipe, the verifier of its registration did not accept it as the beacon\'s signature of the round in the data.', response: 'Use `catalogAt(epochId)` for the expected signer; for a beacon recipe check the round with `verifyBeacon`.' },
          BeaconGasTooLow: { src: '87, 220', text: 'Too little gas was left to give the beacon verifier its whole `BEACON_VERIFY_GAS` allowance, in `registerBeacon`, `verifyBeacon` or a publication of a beacon epoch. It is raised instead of answering false, so a valid round is never read as invalid because the sender\'s gas limit was low.', response: 'Send the transaction with a higher gas limit; an `eth_call` of `verifyBeacon` needs about 461,000 gas.' },
          ECDSAInvalidSignature: { text: 'The signature does not recover to any address (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          ECDSAInvalidSignatureLength: { text: 'The signature is not 65 bytes (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          ECDSAInvalidSignatureS: { text: 'The signature has a high `s` value (OpenZeppelin `ECDSA`).', response: 'Publish the exact signature from the response.' },
          PacketTooLarge: { src: '85, 389', text: 'The encoded packet exceeds `MAX_PACKET_BYTES` (2048).', response: 'Not reachable: the recipe and data bounds keep every packet within `MAX_PACKET_BYTES`.' },
        },
      },
      {
        title: 'Recipes, administration, initialization and upgrades',
        items: {
          InvalidRecipe: {
            src: '87, 165',
            text: '`registerRecipe` got an empty canonical request or body, a canonical request over `MAX_REQUEST_BYTES` or a body over `MAX_BODY_BYTES`, or `MAX_RECIPES` recipes are already registered.',
            response: 'Shorten the request or body. Recipe ids are never freed.',
          },
          InvalidTemplate: {
            src: '87, 166',
            text: '`registerRecipe` got a data template that is not well formed (README [Data templates](README.md#data-templates)).',
            response: 'Build the template with `encodeDataTemplate`, which names the broken rule, before registering.',
          },
          StringsInsufficientHexLength: {
            text: 'Declared by OpenZeppelin `Strings`, which `registerBeacon` uses to write the chain hash as 32 bytes of hex. A 32-byte value always fits, so it cannot be raised.',
            response: 'None.',
            also: 'no public function (declared by OpenZeppelin `Strings`)',
          },
          InvalidConfig: {
            src: '83, 99, 111, 119, 126, 128, 158, 180-182, 275, 279, 280',
            text: 'A zero signer or committer in `initialize`; a zero address in `setCommitter`; in `setBackupCommitter` the zero address, allowing the committer, an unchanged status or a fifth backup committer; in `registerBeacon` a verifier without code, a zero chain hash, genesis, period or sample round, a sample round not yet scheduled, or a key or sample signature the verifier rejects; in `scheduleCatalog` an empty or oversized catalog, mismatched lengths, a repeated or unregistered recipe, a zero signer or a beacon recipe listed with a signer other than its `slotSigner`; `initializeRecipeRegistry` on a registry that already has recipes or a scheduled catalog; or a recipe id that is not registered, in `getRecipe`, `recipeRequest` and `beaconOf` or, on a registry upgraded without `initializeRecipeRegistry`, in selection and publication.',
            response: 'Correct the arguments; recipe ids run from 0 to `recipeCount() - 1`. A registry upgraded without the recipe step needs `initializeRecipeRegistry` from its owner.',
          },
          ...upgradeErrors,
          InvalidInitialization: {
            ...upgradeErrors.InvalidInitialization,
            text: '`initialize` on a proxy that is already initialized or on an implementation contract, whose initializers are disabled at construction, or `initializeRecipeRegistry` on a proxy that has already reached initializer version 2.',
            response: 'None: `initialize` happens once when `D20Proxy` is deployed, and `initializeRecipeRegistry` once in the recipe-registry upgrade.',
          },
          RenounceDisabled: { ...upgradeErrors.RenounceDisabled, src: '85, 116' },
        },
      },
    ],
  },
  {
    key: 'verifier',
    title: 'D20BeaconVerifier',
    abi: 'abi/D20BeaconVerifier.json',
    source: 'D20BeaconVerifier.sol',
    intro: [
      'The verifier of the registry\'s drand beacon recipe: stateless and deployed directly, not behind a proxy. `EpochEntropy` records its address in a recipe\'s registration (`beaconOf`) and calls `isValidPublicKey` and `verifyRound` under a fixed gas allowance. It checks the bls-bn254-unchained-on-g1 scheme of drand\'s evmnet: the group public key is a BN254 G2 point, round `r`\'s signature is a G1 point on the RFC 9380 hash-to-curve of `keccak256` of `r` as 8 big-endian bytes, and keys and signatures use drand\'s serialization of 32-byte big-endian words (`x ‖ y` for G1, `x_im ‖ x_re ‖ y_im ‖ y_re` for G2). It is built on the unmodified kevincharm/bls-bn254 library recorded in `notices/PROVENANCE.md`.',
      'Anyone can call it, for example to check a drand round inside another contract. `beaconVerifierAbi` from `@d20dao/vrf-sdk/abi` carries its ABI, and `verifyBeaconRound` in `@d20dao/vrf-sdk` computes the same check off-chain.',
    ],
    types: {},
    functions: [
      {
        title: 'Verification',
        intro: 'Views, callable by anyone.',
        items: {
          isValidPublicKey: {
            caller: 'Anyone (view)',
            src: '28-34',
            text: 'Whether `publicKey` is 128 bytes, `x_im ‖ x_re ‖ y_im ‖ y_re`, encoding a point on the BN254 G2 curve with every coordinate below the field order. Subgroup membership is not checked here: the pairing precompile refuses a key outside the subgroup, so a verified signature under the key establishes it. `EpochEntropy` calls it when a beacon is registered.',
          },
          roundMessage: {
            caller: 'Anyone (view)',
            src: '36-39',
            text: 'The G1 point that the signature of `round` signs: the RFC 9380 hash-to-curve of `keccak256` of the round as 8 big-endian bytes under `DST` (`expand_message_xmd` with `keccak256`, the Shallue-van de Woestijne map and the sum of two mapped field elements). `beaconRoundMessage` in `@d20dao/vrf-sdk` computes the same point off-chain.',
            errors: ['BNAddFailed', 'ModExpFailed'],
          },
          verifyRound: {
            caller: 'Anyone (view)',
            src: '41-60',
            text: 'Whether `signature` (64 bytes, `x ‖ y`) is the beacon\'s signature of `round` under `publicKey`: the pairing of `signature` with the G2 generator equals the pairing of `roundMessage(round)` with `publicKey`. It returns false, without reverting, for a signature that is not 64 bytes, a key that fails `isValidPublicKey` and a signature whose coordinates are not below the field order or not on the curve. Otherwise it runs the pairing precompile with a fixed allowance of `PAIRING_GAS`, and a direct call needs about 285,000 gas. It reverts `InsufficientGas`, and never answers false, when too little gas is left to give the precompile that allowance, so a valid signature is not read as invalid for want of gas.',
            errors: ['InsufficientGas', 'BNAddFailed', 'ModExpFailed'],
          },
        },
      },
      {
        title: 'Constants',
        constants: true,
        intro: 'Views returning values fixed in the code.',
        items: {
          DST: { text: 'RFC 9380 domain separation tag of the scheme\'s hash-to-curve.' },
          PAIRING_GAS: { text: 'Gas given to the pairing precompile (address 8). A two-pair check costs 113,000 under EIP-1108.' },
        },
      },
    ],
    events: [],
    errors: [
      {
        title: 'Verification',
        items: {
          InsufficientGas: {
            src: '17, 57',
            text: 'Too little gas was left in `verifyRound` for the pairing precompile to get its whole `PAIRING_GAS` allowance.',
            response: 'Send the call with a higher gas limit; a direct call needs about 285,000 gas.',
          },
          ModExpFailed: {
            src: 'vendor/bls-bn254/BLS.sol:56, 399',
            text: 'The modexp precompile (address 5), which the hash-to-curve calls with all remaining gas, failed: in practice the call ran out of gas.',
            response: 'Send the call with a higher gas limit.',
          },
          BNAddFailed: {
            src: 'vendor/bls-bn254/BLS.sol:52, 113',
            text: 'The bn256 addition precompile (address 6), which adds the two mapped points of the hash-to-curve, failed: in practice the call ran out of gas.',
            response: 'Send the call with a higher gas limit.',
          },
          MapToPointFailed: {
            src: 'vendor/bls-bn254/BLS.sol:54, 329, 334, 339, 365',
            text: 'Raised by the vendored library when its map of a field element to the curve finds no square root or a Legendre exponentiation returns an unexpected value. The Shallue-van de Woestijne map always yields a point, so no input should reach it.',
            response: 'None.',
            also: 'no input known (check inside the vendored library)',
          },
          InvalidFieldElement: {
            src: 'vendor/bls-bn254/BLS.sol:53, 310',
            text: 'The vendored library was asked to map a value at or above the field order. The hash-to-curve reduces its field elements below it first, so this contract cannot reach it.',
            response: 'None.',
            also: 'no input of this contract (check inside the vendored library)',
          },
          InvalidDSTLength: {
            src: 'vendor/bls-bn254/BLS.sol:55, 260',
            text: 'The domain separation tag is longer than 255 bytes. `DST` is 43 bytes, so this contract cannot reach it.',
            response: 'None.',
            also: 'no input of this contract (check inside the vendored library)',
          },
        },
      },
    ],
  },
];
