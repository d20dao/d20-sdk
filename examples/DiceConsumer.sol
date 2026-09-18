// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {D20VRFRequests} from "@d20dao/vrf-sdk/contracts/libraries/D20VRFRequests.sol";

/// @notice One d20 per player, paid by the player. Swap `d20` for `d6` or `coinFlip` and nothing else moves.
contract DiceConsumer is D20VRFConsumer {
    using D20VRFRequests for ID20VRF;

    /// The callback does two storage writes and nothing else, and the fee grows with this number.
    uint32 private constant CALLBACK_GAS = 100_000;

    struct Roll { address player; bytes32 word; bool ready; }
    mapping(uint256 => Roll) public rolls;

    error Underpaid(uint256 quoted, uint256 sent);
    error ChangeRefused();
    error UnexpectedCallback();
    error NotReady();

    constructor(address coordinator) D20VRFConsumer(coordinator) {}

    function roll() external payable returns (uint256 requestId) {
        ID20VRF rng = ID20VRF(vrfCoordinator);
        // quoteFee prices from block.basefee, so it is exact here and only here. A wallet cannot read it in
        // advance: off-chain it quotes quoteFeeAt(gas, the latest header's baseFeePerGas) plus a buffer and
        // sends that, never through eth_call, where the base fee is reported as 0.
        uint256 fee = rng.quoteFee(CALLBACK_GAS);
        if (msg.value < fee) revert Underpaid(fee, msg.value);
        // The helper pays exactly `fee` out of this contract's balance, which msg.value just funded.
        // The player is the refund address, so an expired request refunds straight back to them.
        requestId = rng.d20(D20VRFRequests.Options(keccak256(abi.encode(msg.sender)), CALLBACK_GAS, msg.sender));
        rolls[requestId] = Roll(msg.sender, bytes32(0), false);
        // Hand the player's buffer back now. Left with the coordinator it becomes refund credit they would
        // have to claim in a separate withdrawRefundCredit transaction.
        if (msg.value > fee) {
            (bool sent,) = payable(msg.sender).call{value: msg.value - fee}("");
            if (!sent) revert ChangeRefused();
        }
    }

    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        Roll storage entry = rolls[requestId];
        // Refuse a request this contract never made, and a second delivery of one it already holds:
        // retryCallback can re-deliver the same accepted word, and the first answer is the only answer.
        if (entry.player == address(0) || entry.ready) revert UnexpectedCallback();
        // Store, do not compute. The callback runs inside CALLBACK_GAS; work that overruns it fails the
        // delivery, and although the request stays served and paid, someone must retryCallback it.
        entry.word = randomness;
        entry.ready = true;
    }

    /// @return 1 to 20. The coordinator maps the stored word; a losing roll is never re-rolled.
    function result(uint256 requestId) external view returns (uint256) {
        if (!rolls[requestId].ready) revert NotReady();
        return ID20VRF(vrfCoordinator).getMappedResult(requestId)[0];
    }
}
