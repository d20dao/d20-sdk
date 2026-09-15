// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {D20VRFRequests} from "@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol";

/// @notice Minimal request/storage starter; no game payment, proof, mint or deployment policy.
contract DiceConsumer is D20VRFConsumer {
    using D20VRFRequests for ID20VRF;
    struct Roll { address player; bytes32 rawWord; bool ready; }
    mapping(uint256 => Roll) public rolls;
    error WrongFee();
    error UnexpectedCallback();
    error NotReady();

    constructor(address coordinator) D20VRFConsumer(coordinator) {}

    function roll(bytes32 clientSeed, uint32 callbackGasLimit) external payable returns (uint256 requestId) {
        ID20VRF rng = ID20VRF(vrfCoordinator);
        if (msg.value != rng.requestFee()) revert WrongFee();
        requestId = rng.d20(D20VRFRequests.Options(clientSeed, callbackGasLimit, msg.sender));
        rolls[requestId] = Roll(msg.sender, bytes32(0), false);
    }

    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        Roll storage result = rolls[requestId];
        if (result.player == address(0) || result.ready) revert UnexpectedCallback();
        result.rawWord = randomness;
        result.ready = true;
    }

    function result(uint256 requestId) external view returns (uint256) {
        if (!rolls[requestId].ready) revert NotReady();
        return ID20VRF(vrfCoordinator).getMappedResult(requestId)[0];
    }
}
