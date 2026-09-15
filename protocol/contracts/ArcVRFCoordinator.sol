// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VRF} from "./vendor/VRF.sol";
import {IArcVRF, IArcVRFConsumer} from "./interfaces/IArcVRF.sol";
import {RandomnessMapping} from "./libraries/RandomnessMapping.sol";
import {EntropySources} from "./EntropySources.sol";

/// @notice Single-operator secp256k1 VRF. Proof submission and callback retries are permissionless.
/// @dev Prototype: not audited or validated on Arc. No operator can replace a fixed result,
///      but the secret-key holder can withhold it. Expired requests refund; never reroll automatically.
contract ArcVRFCoordinator is VRF, ReentrancyGuard, IArcVRF {
    uint32 public constant MIN_CALLBACK_GAS = 30_000;
    uint32 public constant MAX_CALLBACK_GAS = 1_000_000;
    uint64 public constant RESPONSE_TIMEOUT = 60 seconds;
    uint256 public constant MAX_EVIDENCE_PACKET_BYTES = 1024;
    uint256 private constant CALLBACK_RESERVE = 60_000;
    bytes32 public constant SEED_DOMAIN = keccak256("VRF_ARCDAO_SEED_V2");
    bytes32 public constant TRANSCRIPT_DOMAIN = keccak256("VRF_ARCDAO_TRANSCRIPT_V1");
    EntropySources public immutable entropySources;
    bytes32 public immutable sourceConfigurationHash;

    uint256 public immutable publicKeyX;
    uint256 public immutable publicKeyY;
    bytes32 public immutable keyHash;
    address public immutable feeRecipient;
    uint256 public immutable requestFee;
    uint16 public immutable confirmationBlocks;
    uint256 public nextRequestId = 1;
    uint256 public earnedFees;
    uint256 public lastServedRequestId;
    uint256 public lastServedIndex;
    mapping(uint256 => uint256) public servedRequestAt;
    uint256 public totalRefundCredits;
    mapping(address => uint256) public refundCredits;

    struct Request {
        address consumer;
        uint32 callbackGasLimit;
        uint64 targetBlock;
        uint64 deadline;
        address refundAddress;
        bytes32 clientSeed;
        bytes32 mappingHash;
        bytes32 blockHash;
        bytes32 randomness;
        bytes32 proofHash;
        bytes32 apiDataHash;
        bytes32 transcriptHash;
        bool fulfilled;
        bool delivered;
        bool refunded;
    }
    /// @dev Same public Request ABI, but pack three status flags into the existing deadline/refund slot.
    struct StoredRequest {
        address consumer;
        uint32 callbackGasLimit;
        uint64 targetBlock;
        uint64 deadline;
        address refundAddress;
        bool fulfilled;
        bool delivered;
        bool refunded;
        bytes32 clientSeed;
        bytes32 mappingHash;
        bytes32 blockHash;
        bytes32 randomness;
        bytes32 proofHash;
        bytes32 apiDataHash;
        bytes32 transcriptHash;
    }
    mapping(uint256 => StoredRequest) private requests;
    mapping(uint256 => RandomnessMapping.Spec) private mappingSpecs;
    struct ApiEvidence {
        EntropySources.Source source;
        bytes32 queryHash;
        bytes32 dataHash;
        bytes32 attestationHash;
    }

    error InvalidConfig();
    error InvalidPublicKey();
    error ContractConsumerRequired();
    error IncorrectFee(uint256 expected, uint256 actual);
    error InvalidCallbackGas();
    error UnknownRequest();
    error NotReady();
    error BlockHashUnavailable();
    error AlreadyFulfilled();
    error NotFulfilled();
    error AlreadyDelivered();
    error WrongPublicKey();
    error WrongSeed();
    error InsufficientCallbackGas();
    error OnlyFeeRecipient();
    error TransferFailed();
    error InvalidRefundAddress();
    error RequestExpired();
    error RequestRefunded();
    error RefundNotAvailable();
    error NoRefundCredit();
    error InvalidScan();
    error EvidencePacketTooLarge();

    event RandomnessRequested(
        uint256 indexed requestId, address indexed consumer, bytes32 indexed keyHash,
        bytes32 clientSeed, uint64 targetBlock, uint32 callbackGasLimit, uint256 feePaid,
        address refundAddress, uint64 deadline
    );
    event BlockHashStored(uint256 indexed requestId, uint64 targetBlock, bytes32 blockHash);
    event RandomnessFulfilled(uint256 indexed requestId, bytes32 randomness, address indexed submitter);
    event CallbackAttempted(uint256 indexed requestId, bool success, uint32 gasLimit);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event RequestRefundedTo(uint256 indexed requestId, address indexed refundAddress, uint256 amount, bool paid);
    event RefundCreditWithdrawn(address indexed owner, address indexed recipient, uint256 amount);
    event MappingRequested(uint256 indexed requestId, bytes32 indexed mappingHash, RandomnessMapping.Spec spec);
    event ProofVerified(uint256 indexed requestId, bytes32 indexed keyHash, uint256 seed, bytes32 proofHash);
    event ApiEvidenceVerified(uint256 indexed requestId, EntropySources.Source indexed source,
        bytes32 requestHash, bytes32 dataHash, bytes32 attestationHash, bytes32 transcriptHash);
    event RequestServed(uint256 indexed requestId, uint256 indexed serveIndex);
    /// @dev Packet is NON-indexed so it is recoverable from logs, even through wrappers/multicalls.
    event FulfillmentEvidence(uint256 indexed requestId, bytes32 indexed transcriptHash, bytes packet);

    constructor(uint256[2] memory publicKey, address recipient, uint256 fee, uint16 confirmations, EntropySources sources) {
        if (recipient == address(0) || confirmations == 0 || confirmations > 64) revert InvalidConfig();
        if (address(sources).code.length == 0) revert InvalidConfig();
        entropySources = sources;
        sourceConfigurationHash = sources.configurationHash();
        if (!_isOnCurve(publicKey)) revert InvalidPublicKey();
        publicKeyX = publicKey[0];
        publicKeyY = publicKey[1];
        keyHash = keccak256(abi.encode(publicKey));
        feeRecipient = recipient;
        requestFee = fee;
        confirmationBlocks = confirmations;
    }

    function requestRandomness(bytes32 clientSeed, uint32 callbackGasLimit, address _refundAddress)
        external payable nonReentrant returns (uint256 requestId)
    {
        RandomnessMapping.Spec memory raw;
        return _createRequest(clientSeed, callbackGasLimit, _refundAddress, raw);
    }

    function requestMappedRandomness(
        bytes32 clientSeed, uint32 callbackGasLimit, address _refundAddress, RandomnessMapping.Spec calldata spec
    ) external payable nonReentrant returns (uint256 requestId) {
        return _createRequest(clientSeed, callbackGasLimit, _refundAddress, spec);
    }

    function _createRequest(
        bytes32 clientSeed, uint32 callbackGasLimit, address _refundAddress, RandomnessMapping.Spec memory spec
    ) private returns (uint256 requestId) {
        if (msg.sender.code.length == 0) revert ContractConsumerRequired();
        if (msg.value != requestFee) revert IncorrectFee(requestFee, msg.value);
        if (_refundAddress == address(0)) revert InvalidRefundAddress();
        _checkGasLimit(callbackGasLimit);
        RandomnessMapping.validate(spec);
        requestId = nextRequestId++;
        // The request's own block hash is only available once that block has completed.
        // No keeper-supplied block number/hash, gas measurement or source selector is accepted.
        uint64 target = uint64(block.number);
        uint64 deadline = uint64(block.timestamp + RESPONSE_TIMEOUT);
        StoredRequest storage r = requests[requestId];
        r.consumer = msg.sender;
        r.callbackGasLimit = callbackGasLimit;
        r.targetBlock = target;
        r.deadline = deadline;
        r.refundAddress = _refundAddress;
        r.clientSeed = clientSeed;
        r.mappingHash = RandomnessMapping.hash(spec);
        mappingSpecs[requestId] = spec;
        emit RandomnessRequested(requestId, msg.sender, keyHash, clientSeed, target, callbackGasLimit,
            msg.value, _refundAddress, deadline);
        emit MappingRequested(requestId, r.mappingHash, spec);
    }

    function getRequest(uint256 requestId) external view returns (Request memory result) {
        StoredRequest storage r = _request(requestId);
        result.consumer = r.consumer;
        result.callbackGasLimit = r.callbackGasLimit;
        result.targetBlock = r.targetBlock;
        result.deadline = r.deadline;
        result.refundAddress = r.refundAddress;
        result.clientSeed = r.clientSeed;
        result.mappingHash = r.mappingHash;
        result.blockHash = r.blockHash;
        result.randomness = r.randomness;
        result.proofHash = r.proofHash;
        result.apiDataHash = r.apiDataHash;
        result.transcriptHash = r.transcriptHash;
        result.fulfilled = r.fulfilled;
        result.delivered = r.delivered;
        result.refunded = r.refunded;
    }

    /// @notice Recovery scan over REQUEST IDs, not completion order. Never skips an older unserved gap.
    /// @dev Scans at most limit slots; expired/refunded/fulfilled jobs are excluded. Keeper must recheck
    ///      state/time before API/prover/send. Start at 1 after loss of local state; paginate until nextRequestId.
    function getPendingRequestIds(uint256 fromId, uint256 limit)
        external view returns (uint256[] memory ids, uint256 nextCursor)
    {
        if (fromId == 0 || limit == 0 || limit > 256) revert InvalidScan();
        uint256 end = nextRequestId;
        nextCursor = fromId > end ? end : fromId;
        ids = new uint256[](limit);
        uint256 count;
        uint256 scanned;
        while (nextCursor < end && scanned < limit) {
            StoredRequest storage r = requests[nextCursor];
            if (!r.fulfilled && !r.refunded && block.timestamp <= r.deadline) ids[count++] = nextCursor;
            ++nextCursor;
            ++scanned;
        }
        assembly ("memory-safe") { mstore(ids, count) }
    }

    function getMapping(uint256 requestId) external view returns (RandomnessMapping.Spec memory) {
        _request(requestId);
        return mappingSpecs[requestId];
    }

    function getMappedResult(uint256 requestId) external view returns (uint256[] memory) {
        StoredRequest storage r = _request(requestId);
        if (!r.fulfilled) revert NotFulfilled();
        return RandomnessMapping.map(r.randomness, mappingSpecs[requestId]);
    }

    /// @notice Public pure mapping for independent inspection; does not claim any request was fulfilled.
    function mapRandomness(bytes32 randomness, RandomnessMapping.Spec calldata spec)
        external pure returns (uint256[] memory)
    {
        return RandomnessMapping.map(randomness, spec);
    }

    /// @notice Verify the VRF math without mutating state. A valid proof is NOT evidence of timely acceptance.
    /// @dev Check getRequest().fulfilled, proofHash and events separately for accepted-service status.
    function verifyRequestProof(uint256 requestId, Proof calldata proof, EntropySources.Attestation calldata apiProof)
        external view returns (bytes32)
    {
        StoredRequest storage r = _request(requestId);
        bytes32 anchor = _resolvedBlockHash(r);
        ApiEvidence memory e = _verifyApi(requestId, r, anchor, apiProof);
        return _verifyProof(proof, _seed(requestId, r, anchor, e.queryHash, e.dataHash));
    }

    function getSourceSelection(uint256 requestId) external view returns (EntropySources.Selection memory) {
        StoredRequest storage r = _request(requestId);
        return entropySources.select(requestId, _resolvedBlockHash(r), r.deadline - RESPONSE_TIMEOUT);
    }

    /// @notice Cache a canonical block hash before BLOCKHASH's 256-block window expires.
    /// @dev Anyone can checkpoint; an uncheckpointed expired request cannot be fulfilled.
    function storeBlockHash(uint256 requestId) external nonReentrant returns (bytes32) {
        return _storeBlockHash(requestId, _request(requestId));
    }

    /// @notice Exact input the keeper must prove. Never accept an RPC-supplied hash as authority.
    function requestSeed(uint256 requestId, EntropySources.Attestation calldata apiProof) external view returns (uint256) {
        StoredRequest storage r = _request(requestId);
        bytes32 anchor = _resolvedBlockHash(r);
        ApiEvidence memory e = _verifyApi(requestId, r, anchor, apiProof);
        return _seed(requestId, r, anchor, e.queryHash, e.dataHash);
    }

    function fulfillRandomness(uint256 requestId, Proof calldata proof, EntropySources.Attestation calldata apiProof)
        external nonReentrant
    {
        StoredRequest storage r = _request(requestId);
        if (r.fulfilled) revert AlreadyFulfilled();
        if (r.refunded) revert RequestRefunded();
        if (block.timestamp > r.deadline) revert RequestExpired();
        bytes32 anchor = _storeBlockHash(requestId, r);
        ApiEvidence memory e = _verifyApi(requestId, r, anchor, apiProof);
        bytes32 randomness = _verifyProof(proof, _seed(requestId, r, anchor, e.queryHash, e.dataHash));
        r.randomness = randomness;
        r.proofHash = keccak256(abi.encode(proof));
        r.apiDataHash = e.dataHash;
        r.transcriptHash = _transcriptHash(requestId, r, anchor, e);
        r.fulfilled = true;
        earnedFees += requestFee;
        lastServedRequestId = requestId;
        servedRequestAt[++lastServedIndex] = requestId;
        emit RequestServed(requestId, lastServedIndex);
        emit ProofVerified(requestId, keyHash, proof.seed, r.proofHash);
        emit ApiEvidenceVerified(requestId, e.source, e.queryHash, e.dataHash, e.attestationHash, r.transcriptHash);
        emit RandomnessFulfilled(requestId, randomness, msg.sender);
        _emitEvidence(requestId, r.transcriptHash, proof, apiProof);
        _deliver(requestId, r, r.callbackGasLimit);
    }

    function _emitEvidence(uint256 id, bytes32 transcript, Proof calldata proof, EntropySources.Attestation calldata apiProof) private {
        bytes memory packet = abi.encode(uint16(1), proof, apiProof);
        if (packet.length > MAX_EVIDENCE_PACKET_BYTES) revert EvidencePacketTooLarge();
        emit FulfillmentEvidence(id, transcript, packet);
    }

    /// @notice Retry delivery of the stored result, with more gas if necessary. Never rerolls.
    function retryCallback(uint256 requestId, uint32 gasLimit) external nonReentrant {
        StoredRequest storage r = _request(requestId);
        if (!r.fulfilled) revert NotFulfilled();
        if (r.delivered) revert AlreadyDelivered();
        _checkGasLimit(gasLimit);
        if (gasLimit < r.callbackGasLimit) revert InvalidCallbackGas();
        _deliver(requestId, r, gasLimit);
    }

    /// @notice After 60 seconds without a verified result, anyone can trigger the fixed-address refund.
    /// @dev Callback failure AFTER verification is not refundable. Failed transfers remain backed credits.
    function refundRequest(uint256 requestId) external nonReentrant {
        StoredRequest storage r = _request(requestId);
        if (r.fulfilled || r.refunded || block.timestamp <= r.deadline) revert RefundNotAvailable();
        r.refunded = true;
        refundCredits[r.refundAddress] += requestFee;
        totalRefundCredits += requestFee;
        // Reserve enough gas to record a failed transfer; never copy arbitrary return data.
        if (gasleft() < 100_000) revert InsufficientCallbackGas();
        address recipient = r.refundAddress;
        uint256 amount = requestFee;
        bool success;
        assembly ("memory-safe") { success := call(30000, recipient, amount, 0, 0, 0, 0) }
        if (success) {
            refundCredits[recipient] -= amount;
            totalRefundCredits -= amount;
        }
        emit RequestRefundedTo(requestId, recipient, amount, success);
    }

    /// @notice Only the original refund recipient can redirect its own failed-transfer credit.
    function withdrawRefundCredit(address payable recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidRefundAddress();
        uint256 amount = refundCredits[msg.sender];
        if (amount == 0) revert NoRefundCredit();
        refundCredits[msg.sender] = 0;
        totalRefundCredits -= amount;
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
        emit RefundCreditWithdrawn(msg.sender, recipient, amount);
    }

    /// @notice Only verified requests earn fees. Pending request fees remain in escrow.
    function withdrawFees(address payable recipient) external nonReentrant {
        if (msg.sender != feeRecipient) revert OnlyFeeRecipient();
        if (recipient == address(0)) revert InvalidConfig();
        uint256 amount = earnedFees;
        earnedFees = 0;
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
        emit FeesWithdrawn(recipient, amount);
    }

    function _request(uint256 requestId) private view returns (StoredRequest storage r) {
        r = requests[requestId];
        if (r.consumer == address(0)) revert UnknownRequest();
    }

    function _resolvedBlockHash(StoredRequest storage r) private view returns (bytes32 value) {
        if (block.number < uint256(r.targetBlock) + confirmationBlocks) revert NotReady();
        value = r.blockHash;
        if (value == bytes32(0)) value = blockhash(r.targetBlock);
        if (value == bytes32(0)) revert BlockHashUnavailable();
    }

    function _storeBlockHash(uint256 id, StoredRequest storage r) private returns (bytes32 value) {
        value = _resolvedBlockHash(r);
        if (r.blockHash == bytes32(0)) {
            r.blockHash = value;
            emit BlockHashStored(id, r.targetBlock, value);
        }
    }

    function _seed(uint256 id, StoredRequest storage r, bytes32 blockHash_, bytes32 queryHash, bytes32 dataHash)
        private view returns (uint256)
    {
        return uint256(keccak256(abi.encode(
            SEED_DOMAIN, block.chainid, address(this), keyHash, id,
            r.consumer, r.clientSeed, r.mappingHash, r.targetBlock, blockHash_,
            sourceConfigurationHash, queryHash, dataHash
        )));
    }

    function _verifyProof(Proof calldata proof, uint256 seed)
        private view returns (bytes32)
    {
        if (proof.pk[0] != publicKeyX || proof.pk[1] != publicKeyY) revert WrongPublicKey();
        // Upstream ignores proof.seed in favor of its explicit seed argument: validate both here.
        if (proof.seed != seed) revert WrongSeed();
        return bytes32(_randomValueFromVRFProof(proof, seed));
    }

    function _verifyApi(uint256 id, StoredRequest storage r, bytes32 anchor, EntropySources.Attestation calldata a)
        private view returns (ApiEvidence memory e)
    {
        (e.source, e.queryHash, e.dataHash, e.attestationHash) =
            entropySources.verify(id, anchor, r.deadline - RESPONSE_TIMEOUT, r.deadline, a);
    }

    function _transcriptHash(uint256 id, StoredRequest storage r, bytes32 anchor, ApiEvidence memory e)
        private view returns (bytes32)
    {
        return keccak256(abi.encode(
            TRANSCRIPT_DOMAIN, block.chainid, address(this), id, sourceConfigurationHash,
            anchor, e.queryHash, e.dataHash, e.attestationHash, r.proofHash, r.randomness, r.mappingHash
        ));
    }

    function _checkGasLimit(uint32 gasLimit) private pure {
        if (gasLimit < MIN_CALLBACK_GAS || gasLimit > MAX_CALLBACK_GAS) revert InvalidCallbackGas();
    }

    function _deliver(uint256 id, StoredRequest storage r, uint32 gasLimit) private {
        bytes memory data = abi.encodeCall(IArcVRFConsumer.rawFulfillRandomness, (id, r.randomness));
        address consumer = r.consumer;
        // Warm account access before the EIP-150 budget check. Do not mark an empty address delivered.
        if (consumer.code.length == 0) {
            emit CallbackAttempted(id, false, gasLimit);
            return;
        }
        if (gasleft() < uint256(gasLimit) + uint256(gasLimit) / 63 + CALLBACK_RESERVE)
            revert InsufficientCallbackGas();
        bool success;
        // No return-data copy: an untrusted callback cannot allocate a return-data bomb here.
        assembly ("memory-safe") {
            success := call(gasLimit, consumer, 0, add(data, 32), mload(data), 0, 0)
        }
        r.delivered = success;
        emit CallbackAttempted(id, success, gasLimit);
    }
}
