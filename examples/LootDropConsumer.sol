// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {RandomnessMapping} from "@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol";

/// @notice A weighted drop: common 60%, uncommon 25%, rare 13%, legendary 2%. Edit weights and TOTAL_WEIGHT
///         together to move the odds; nothing else changes.
contract LootDropConsumer is D20VRFConsumer {
    uint32 private constant CALLBACK_GAS = 100_000;
    uint256 private constant TOTAL_WEIGHT = 1000;
    /// Tier 0 to 3, rarest last. Must sum to TOTAL_WEIGHT.
    uint256[4] private weights = [uint256(600), 250, 130, 20];

    struct Drop { address player; bytes32 word; bool ready; }
    mapping(uint256 => Drop) public drops;

    error UnexpectedCallback();
    error NotReady();

    constructor(address coordinator) D20VRFConsumer(coordinator) {}

    function open() external payable returns (uint256 requestId) {
        // One draw in [1, TOTAL_WEIGHT]. The coordinator samples that range by rejecting the short residue
        // rather than taking uint256(word) % TOTAL_WEIGHT, which would quietly favour the low tiers. Asking
        // for the range you actually want is what makes the weights below mean what they say.
        RandomnessMapping.Spec memory spec =
            RandomnessMapping.Spec(RandomnessMapping.Operation.NumberRange, 1, TOTAL_WEIGHT, 1, 0);
        // Forwards everything sent: the coordinator keeps exactly its quote for this transaction, reverts
        // IncorrectFee if that is more than arrived, and credits the surplus to msg.sender as refund credit.
        requestId = ID20VRF(vrfCoordinator).requestMappedRandomness{value: msg.value}(
            keccak256(abi.encode(msg.sender, block.number)), CALLBACK_GAS, msg.sender, spec
        );
        drops[requestId] = Drop(msg.sender, bytes32(0), false);
    }

    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        Drop storage drop = drops[requestId];
        // Unknown request, or a repeat of one already delivered: neither may touch a finished drop.
        if (drop.player == address(0) || drop.ready) revert UnexpectedCallback();
        // Store the word and stop. The tier walk below is cheap, but it belongs on the reading side: a
        // callback that runs out of CALLBACK_GAS fails delivery, while a stored word can be read forever.
        drop.word = randomness;
        drop.ready = true;
    }

    /// @return tier 0 common, 1 uncommon, 2 rare, 3 legendary. Read-only: one request, one answer, forever.
    function tierOf(uint256 requestId) external view returns (uint256 tier) {
        if (!drops[requestId].ready) revert NotReady();
        uint256 draw = ID20VRF(vrfCoordinator).getMappedResult(requestId)[0];
        uint256 cursor;
        // Weights become adjacent ranges: 1-600 common, 601-850 uncommon, 851-980 rare, the rest legendary.
        for (uint256 i; i + 1 < weights.length; ++i) {
            cursor += weights[i];
            if (draw <= cursor) return i;
        }
        return weights.length - 1;
    }
}
