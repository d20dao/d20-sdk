// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EntropySources} from "./EntropySources.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice An immutable catalog of authenticated records committed BEFORE any eligible request.
/// @dev A new catalog requires a new deployment and coordinator. No append, replace or admin path.
///      Signatures prove Airnode provenance, not upstream truth; records are public, not secret entropy.
contract EntropySnapshots {
    bytes32 public constant RECIPE_VERSION = keccak256("VRF_ARCDAO_PRECOMMITTED_SNAPSHOTS_V2");
    bytes32 public constant SOURCE_DOMAIN = keccak256("VRF_ARCDAO_SNAPSHOT_SOURCE_V2");
    bytes32 public constant PARAM_DOMAIN = keccak256("VRF_ARCDAO_SNAPSHOT_PARAMS_V2");
    uint256 public constant MAX_DATA_BYTES = 128;
    uint256 public constant MAX_QUERY_BYTES = 1024;
    bytes32 public immutable configurationHash;
    uint64 public immutable committedAt;
    uint16 public immutable enabledSourceMask;
    struct Record {
        EntropySources.Source source;
        address airnode;
        string canonicalRequest;
        EntropySources.Attestation attestation;
    }
    Record[] private records;
    mapping(uint8 => uint256) private indexPlusOne;
    mapping(uint8 => bytes32) public snapshotAttestationHash;
    event SnapshotCommitted(uint8 indexed source, bytes32 indexed recordHash, Record record);
    event CatalogCommitted(bytes32 indexed configurationHash, uint64 committedAt, uint16 enabledSourceMask);
    error InvalidCatalog();
    error InvalidSnapshot();
    error InvalidSourceContext();
    error SnapshotMismatch();

    constructor(Record[] memory catalog) {
        if (catalog.length == 0 || catalog.length > 12) revert InvalidCatalog();
        bytes32[] memory hashes = new bytes32[](catalog.length);
        uint16 mask;
        for (uint256 i; i < catalog.length; ++i) {
            Record memory r = catalog[i];
            uint8 source = uint8(r.source);
            if (i != 0 && source <= uint8(catalog[i - 1].source)) revert InvalidCatalog();
            if (r.airnode == address(0) || bytes(r.canonicalRequest).length == 0 ||
                bytes(r.canonicalRequest).length > MAX_QUERY_BYTES || r.attestation.timestamp == 0 ||
                r.attestation.timestamp > block.timestamp || r.attestation.data.length == 0 ||
                r.attestation.data.length > MAX_DATA_BYTES) revert InvalidSnapshot();
            bytes32 query = keccak256(bytes(r.canonicalRequest));
            bytes32 digest = keccak256(abi.encodePacked(query, r.attestation.timestamp, r.attestation.data));
            if (ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), r.attestation.signature) != r.airnode)
                revert InvalidSnapshot();
            bytes32 attestation = _hash(query, r.attestation);
            hashes[i] = keccak256(abi.encode(source, r.airnode, query, attestation));
            snapshotAttestationHash[source] = attestation;
            indexPlusOne[source] = i + 1;
            records.push(r);
            mask |= uint16(1 << source);
            emit SnapshotCommitted(source, hashes[i], r);
        }
        configurationHash = keccak256(abi.encode(RECIPE_VERSION, hashes));
        committedAt = uint64(block.timestamp);
        enabledSourceMask = mask;
        emit CatalogCommitted(configurationHash, committedAt, mask);
    }

    function recordCount() external view returns (uint256) { return records.length; }
    function getRecord(uint256 index) external view returns (Record memory) { return records[index]; }
    function getSnapshotForSource(uint8 source) external view returns (EntropySources.Attestation memory) {
        uint256 index = indexPlusOne[source];
        if (index == 0) revert InvalidCatalog();
        return records[index - 1].attestation;
    }
    function select(uint256 requestId, bytes32 requestBlockHash, uint64 requestedAt)
        public view returns (EntropySources.Selection memory s)
    {
        // Strict ordering also prevents a catalog chosen after a request in the SAME block.
        if (requestId == 0 || requestBlockHash == bytes32(0) || requestedAt <= committedAt)
            revert InvalidSourceContext();
        bytes32 seed = keccak256(abi.encode(SOURCE_DOMAIN, configurationHash, requestBlockHash, requestId));
        Record storage r = records[uint256(seed) % records.length];
        s = EntropySources.Selection(r.source, r.airnode, keccak256(abi.encode(PARAM_DOMAIN, seed)),
            keccak256(bytes(r.canonicalRequest)), r.canonicalRequest);
    }
    function verify(uint256 requestId, bytes32 requestBlockHash, uint64 requestedAt, uint64 deadline,
        EntropySources.Attestation calldata a)
        external view returns (EntropySources.Source source, bytes32 requestHash, bytes32 dataHash, bytes32 attestationHash)
    {
        EntropySources.Selection memory s = select(requestId, requestBlockHash, requestedAt);
        if (uint256(deadline) != uint256(requestedAt) + 60 || requestedAt > block.timestamp)
            revert InvalidSourceContext();
        if (a.data.length == 0 || a.data.length > MAX_DATA_BYTES || a.signature.length != 65)
            revert SnapshotMismatch();
        attestationHash = _hash(s.requestHash, a);
        // Exact original timestamp AND signature: fresh re-signatures and fresh QRNG draws cannot substitute.
        if (attestationHash != snapshotAttestationHash[uint8(s.source)]) revert SnapshotMismatch();
        return (s.source, s.requestHash, keccak256(a.data), attestationHash);
    }
    function _hash(bytes32 query, EntropySources.Attestation memory a) private pure returns (bytes32) {
        return keccak256(abi.encode(query, a.timestamp, keccak256(a.data), keccak256(a.signature)));
    }
}
