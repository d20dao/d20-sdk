// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {RandomnessMapping} from "@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol";

/// @notice One winner drawn from a list of entrants. Swap ChooseOne for ChooseMany to draw several.
contract RaffleConsumer is D20VRFConsumer {
    uint32 private constant CALLBACK_GAS = 100_000;

    address[] public entrants;
    /// The outstanding or served request: zero before the first draw, and zero again once an expired one was refunded.
    uint256 public drawId;
    bytes32 public word;
    bool public closed; bool public drawn;

    error AlreadyClosed();
    error NoEntrants();
    error RaffleFull();
    error AlreadyDrawn();
    error UnexpectedCallback();
    error NotDrawn();

    constructor(address coordinator) D20VRFConsumer(coordinator) {}

    function enter() external {
        if (closed) revert AlreadyClosed();
        // ChooseOne answers with an index, and the coordinator maps at most 256 items.
        if (entrants.length == 256) revert RaffleFull();
        entrants.push(msg.sender);
    }

    function draw() external payable {
        // A raffle that can be drawn twice is not a raffle: one served request, one winner, and no second
        // request while one is outstanding or after one was served.
        if (drawId != 0) revert AlreadyDrawn();
        if (entrants.length == 0) revert NoEntrants();
        closed = true;
        // The answer is an index, so the list must be frozen before the request goes out; hashing it into the
        // client seed publishes that promise, because RandomnessRequested logs the seed. msg.value is
        // forwarded whole: the coordinator keeps exactly its quote, reverts IncorrectFee when that is more
        // than arrived, and credits the surplus to msg.sender as refund credit to withdraw later.
        drawId = ID20VRF(vrfCoordinator).requestMappedRandomness{value: msg.value}(
            keccak256(abi.encode(entrants)), CALLBACK_GAS, msg.sender,
            RandomnessMapping.Spec(RandomnessMapping.Operation.ChooseOne, 0, 0, 1, uint32(entrants.length))
        );
    }

    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        // Only the one request this raffle made, and only once: a failed delivery is retried by anyone with
        // retryCallback, and ids this contract never used are not its business.
        if (requestId != drawId || drawn) revert UnexpectedCallback();
        // Store and stop, so the callback cannot run out of its budget. Paying the prize belongs in a
        // separate transaction anyone can send once `drawn` is true.
        word = randomness;
        drawn = true;
    }

    /// If no proof is accepted within 60 seconds the request expires and anyone may call refundRequest(drawId)
    /// on the coordinator. That returns the fee to whoever sent draw() and then calls this hook: the list stays
    /// frozen and draw() may be sent again, so an expired request never leaves the raffle stuck.
    function _onRefund(uint256 requestId) internal override {
        if (requestId == drawId && !drawn) drawId = 0;
    }

    function winner() external view returns (address) {
        if (!drawn) revert NotDrawn();
        return entrants[ID20VRF(vrfCoordinator).getMappedResult(drawId)[0]];
    }
}
