// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ArcVRFConsumer} from "@arcdao/vrf-sdk/contracts/ArcVRFConsumer.sol";
import {IArcVRF} from "@arcdao/vrf-sdk/contracts/interfaces/IArcVRF.sol";
import {ArcVRFRequests} from "@arcdao/vrf-sdk/contracts/libraries/ArcVRFRequests.sol";

/// @notice Minimal request/storage starter; no game payment, proof, mint or deployment policy.
contract DiceConsumer is ArcVRFConsumer {
    using ArcVRFRequests for IArcVRF;
    struct Roll { address player; bytes32 rawWord; bool ready; }
    mapping(uint256 => Roll) public rolls;
    error WrongFee();
    error UnexpectedCallback();
    error NotReady();

    constructor(address coordinator) ArcVRFConsumer(coordinator) {}

    function roll(bytes32 clientSeed, uint32 callbackGasLimit) external payable returns (uint256 requestId) {
        IArcVRF rng = IArcVRF(vrfCoordinator);
        if (msg.value != rng.requestFee()) revert WrongFee();
        requestId = rng.d20(ArcVRFRequests.Options(clientSeed, callbackGasLimit, msg.sender));
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
        return IArcVRF(vrfCoordinator).getMappedResult(requestId)[0];
    }
}
