// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice Immutable source/query recipes selected by the REQUEST block hash, not the keeper.
/// @dev Attestations authenticate an Airnode, not physical truth or an immutable upstream database.
///      Only projected historical/identified records are accepted; never retry with another source.
contract EntropySources {
    enum Source { Weather, PokeAPI, Hyperliquid, AnuQrng, NasaEonet, Usgs, Frankfurter, Ecb, GeoDb, Eodhd, PandaScore, Eurostat }
    enum Policy { DirectHistoricalRecord, RequiresPrecommittedSnapshot, RecipeNotImplemented }
    uint256 public constant DIRECT_SOURCE_COUNT = 3;
    struct Selection {
        Source source;
        address airnode;
        bytes32 selector;
        bytes32 requestHash;
        string canonicalRequest;
    }
    struct Attestation { uint256 timestamp; bytes data; bytes signature; }

    bytes32 public constant SOURCE_DOMAIN = keccak256("VRF_ARCDAO_SOURCE_V1");
    bytes32 public constant PARAM_DOMAIN = keccak256("VRF_ARCDAO_SOURCE_PARAMS_V1");
    bytes32 public constant RECIPE_VERSION = keccak256("VRF_ARCDAO_HISTORICAL_PROJECTION_V1");
    address public immutable weatherSigner;
    address public immutable pokeSigner;
    address public immutable hyperliquidSigner;
    bytes32 public immutable configurationHash;
    uint8 public immutable enabledSourceMask;
    uint256 public constant MAX_DATA_BYTES = 128;

    error InvalidSigner();
    error InvalidSourceContext();
    error InvalidAttestationTime();
    error InvalidProjectedData();

    constructor(address[3] memory signers, uint8 enabledMask) {
        if (signers[0] == address(0) || signers[1] == address(0) || signers[2] == address(0)) revert InvalidSigner();
        if (enabledMask == 0 || enabledMask > 7) revert InvalidSourceContext();
        weatherSigner = signers[0];
        pokeSigner = signers[1];
        hyperliquidSigner = signers[2];
        enabledSourceMask = enabledMask;
        configurationHash = keccak256(abi.encode(RECIPE_VERSION, signers, enabledMask));
    }

    function select(uint256 requestId, bytes32 requestBlockHash, uint64 requestedAt)
        public view returns (Selection memory selection)
    {
        if (requestId == 0 || requestBlockHash == bytes32(0) || requestedAt < 1738368000)
            revert InvalidSourceContext(); // Recipes use January 2025 weather records.
        bytes32 seed = keccak256(abi.encode(SOURCE_DOMAIN, requestBlockHash, requestId));
        uint256 count;
        for (uint256 i; i < DIRECT_SOURCE_COUNT; ++i) if ((enabledSourceMask & (1 << i)) != 0) ++count;
        uint256 index = uint256(seed) % count;
        for (uint256 i; i < DIRECT_SOURCE_COUNT; ++i) {
            if ((enabledSourceMask & (1 << i)) != 0) {
                if (index == 0) { selection.source = Source(i); break; }
                --index;
            }
        }
        selection.selector = keccak256(abi.encode(PARAM_DOMAIN, seed));
        uint256 choice = uint256(selection.selector);
        if (selection.source == Source.Weather) {
            selection.airnode = weatherSigner;
            string memory latitude;
            string memory longitude;
            uint256 station = choice % 4;
            if (station == 0) { latitude = "41"; longitude = "29"; }
            else if (station == 1) { latitude = "40"; longitude = "-74"; }
            else if (station == 2) { latitude = "51"; longitude = "0"; }
            else { latitude = "35"; longitude = "139"; }
            uint256 day = (choice / 4) % 28 + 1;
            string memory date = string.concat("2025-01-", day < 10 ? "0" : "", Strings.toString(day), "T00:00:00");
            selection.canonicalRequest = string.concat(
                '["dailyClimateHistory",[["end_time","', date,
                '"],["language","english"],["latitude",', latitude,
                '],["longitude",', longitude, '],["metric",true],["start_time","', date,
                '"]],[["value","/report/location/observation/0/tmean"]]]'
            );
        } else if (selection.source == Source.PokeAPI) {
            selection.airnode = pokeSigner;
            selection.canonicalRequest = string.concat(
                '["getPokemonForm",[["nameOrId","', Strings.toString(choice % 151 + 1),
                '"]],[["value","/name"]]]'
            );
        } else {
            selection.airnode = hyperliquidSigner;
            string memory coin = choice % 3 == 0 ? "BTC" : choice % 3 == 1 ? "ETH" : "SOL";
            // Select one CLOSED hourly candle at least one complete hour before the request.
            uint256 startMs = (uint256(requestedAt) / 3600 * 3600 - 7200) * 1000;
            selection.canonicalRequest = string.concat(
                '["candleSnapshot",[["req",[["coin","', coin, '"]',
                ',["endTime",', Strings.toString(startMs + 3599999),
                '],["interval","1h"],["startTime",', Strings.toString(startMs),
                ']]]],[["value","/0/c"]]]'
            );
        }
        selection.requestHash = keccak256(bytes(selection.canonicalRequest));
    }

    /// @notice Reserved source IDs are never silently added to the existing selector.
    /// @dev Fresh QRNG draws and revisable event feeds need an immutable snapshot protocol first.
    function sourcePolicy(Source source) external pure returns (Policy) {
        if (uint256(source) < DIRECT_SOURCE_COUNT) return Policy.DirectHistoricalRecord;
        return uint256(source) <= uint256(Source.Usgs) ? Policy.RequiresPrecommittedSnapshot : Policy.RecipeNotImplemented;
    }

    /// @notice Data/signature are calldata only. The coordinator stores compact commitments.
    function verify(
        uint256 requestId, bytes32 requestBlockHash, uint64 requestedAt, uint64 deadline, Attestation calldata a
    ) external view returns (Source source, bytes32 requestHash, bytes32 dataHash, bytes32 attestationHash) {
        Selection memory selected = select(requestId, requestBlockHash, requestedAt);
        if (a.timestamp < requestedAt || a.timestamp > deadline || a.timestamp > block.timestamp)
            revert InvalidAttestationTime();
        _validateProjectedData(selected.source, a.data);
        // Actual AirnodeHub format signs the DATA BYTES, not an invented signature over dataHash.
        bytes32 digest = keccak256(abi.encodePacked(selected.requestHash, a.timestamp, a.data));
        if (ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), a.signature) != selected.airnode)
            revert InvalidSigner();
        dataHash = keccak256(a.data);
        // Time/signature are evidence, NOT entropy: re-signing identical data cannot change the VRF seed.
        attestationHash = keccak256(abi.encode(selected.requestHash, a.timestamp, dataHash, keccak256(a.signature)));
        return (selected.source, selected.requestHash, dataHash, attestationHash);
    }

    function _validateProjectedData(Source source, bytes calldata data) private pure {
        // Accept exactly {"value":"..."}, with no metadata, key ordering, whitespace or escape alternatives.
        // The pinned recipes return a name or a decimal string. Full API responses are rejected.
        bytes memory prefix = bytes('{"value":"');
        if (data.length <= prefix.length + 2 || data.length > MAX_DATA_BYTES || data[data.length - 2] != 0x22 || data[data.length - 1] != 0x7d)
            revert InvalidProjectedData();
        for (uint256 i; i < prefix.length; ++i) if (data[i] != prefix[i]) revert InvalidProjectedData();
        bool digit;
        bool dot;
        for (uint256 i = prefix.length; i < data.length - 2; ++i) {
            uint8 c = uint8(data[i]);
            if (source == Source.PokeAPI) {
                if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c == 45)) revert InvalidProjectedData();
            } else if (c >= 48 && c <= 57) { digit = true; }
            else if (c == 46 && !dot && digit && i + 1 < data.length - 2) { dot = true; }
            else if (!(source == Source.Weather && c == 45 && i == prefix.length)) revert InvalidProjectedData();
        }
        if (source != Source.PokeAPI && !digit) revert InvalidProjectedData();
    }
}
