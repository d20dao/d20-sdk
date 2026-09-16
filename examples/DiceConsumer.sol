// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {RandomnessMapping} from "@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol";

/// @notice Minimal request/storage starter; no game payment, proof, mint or deployment policy.
/// @dev The player pays the request. A wallet cannot know the exact same-transaction quote in advance, so it quotes
///      off-chain with quoteFeeAt(callbackGasLimit, latestBlock.baseFeePerGas) plus a buffer (the SDK's quoteRequestFee
///      helper does this) and sends that value. The whole payment is forwarded: the coordinator escrows exactly
///      quoteFee(callbackGasLimit) and credits any excess to the player (the refund address) as refund credit that only
///      the player can pull with withdrawRefundCredit. Underpayment reverts inside the coordinator with
///      IncorrectFee(expected, actual). A contract that funds requests from its own balance would instead pay
///      rng.quoteFee(callbackGasLimit) in the same transaction, as the D20VRFRequests helpers do.
contract DiceConsumer is D20VRFConsumer {
    struct Roll { address player; bytes32 rawWord; bool ready; }
    mapping(uint256 => Roll) public rolls;
    mapping(uint256 => bool) public refunded;
    error UnexpectedCallback();
    error NotReady();

    constructor(address coordinator) D20VRFConsumer(coordinator) {}

    function roll(bytes32 clientSeed, uint32 callbackGasLimit) external payable returns (uint256 requestId) {
        // One d20. The callback still receives the raw word; result() reads the canonical mapped value.
        RandomnessMapping.Spec memory spec = RandomnessMapping.Spec(RandomnessMapping.Operation.DiceRoll, 0, 20, 1, 0);
        requestId = ID20VRF(vrfCoordinator).requestMappedRandomness{value: msg.value}(
            clientSeed, callbackGasLimit, msg.sender, spec
        );
        rolls[requestId] = Roll(msg.sender, bytes32(0), false);
    }

    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        Roll storage result = rolls[requestId];
        if (result.player == address(0) || result.ready || refunded[requestId]) revert UnexpectedCallback();
        result.rawWord = randomness;
        result.ready = true;
    }

    // Called after an expired request's refund share was paid to the player or recorded as the player's refund credit.
    function _onRefund(uint256 requestId) internal override {
        Roll storage result = rolls[requestId];
        if (result.player == address(0) || result.ready) revert UnexpectedCallback();
        refunded[requestId] = true;
    }

    function result(uint256 requestId) external view returns (uint256) {
        if (!rolls[requestId].ready) revert NotReady();
        return ID20VRF(vrfCoordinator).getMappedResult(requestId)[0];
    }
}
