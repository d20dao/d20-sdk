// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArcVRFConsumer} from "./interfaces/IArcVRF.sol";

/// @notice Every game must authenticate callbacks before touching game state.
abstract contract ArcVRFConsumer is IArcVRFConsumer {
    address public immutable vrfCoordinator;
    error OnlyCoordinator();
    error InvalidCoordinator();

    constructor(address coordinator) {
        if (coordinator.code.length == 0) revert InvalidCoordinator();
        vrfCoordinator = coordinator;
    }

    function rawFulfillRandomness(uint256 requestId, bytes32 randomness) external {
        if (msg.sender != vrfCoordinator) revert OnlyCoordinator();
        _fulfillRandomness(requestId, randomness);
    }

    /// @dev Store randomness only. Keep minting and transfers out of the callback.
    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal virtual;
}
