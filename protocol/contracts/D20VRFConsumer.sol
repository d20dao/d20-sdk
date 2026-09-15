// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ID20VRFConsumer} from "./interfaces/ID20VRF.sol";

/// @notice Every consumer must authenticate callbacks before changing application state.
abstract contract D20VRFConsumer is ID20VRFConsumer {
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
