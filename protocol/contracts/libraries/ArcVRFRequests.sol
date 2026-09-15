// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArcVRF} from "../interfaces/IArcVRF.sol";
import {RandomnessMapping as M} from "./RandomnessMapping.sol";

/// @notice Built-in request helpers for game contracts. All requests still callback with (id, rawWord).
/// @dev Usage: using ArcVRFRequests for IArcVRF; rng.d20(options). Inspect getMappedResult(id) after fulfillment.
library ArcVRFRequests {
    struct Options { bytes32 clientSeed; uint32 callbackGasLimit; address refundAddress; }
    function diceRoll(IArcVRF rng, uint256 sides, uint32 count, Options memory o) internal returns (uint256) {
        return _send(rng, M.Spec(M.Operation.DiceRoll, 0, sides, count, 0), o);
    }
    function dN(IArcVRF rng, uint256 sides, Options memory o) internal returns (uint256) {
        return diceRoll(rng, sides, 1, o);
    }
    function d20(IArcVRF rng, Options memory o) internal returns (uint256) { return dN(rng, 20, o); }
    function d12(IArcVRF rng, Options memory o) internal returns (uint256) { return dN(rng, 12, o); }
    function d10(IArcVRF rng, Options memory o) internal returns (uint256) { return dN(rng, 10, o); }
    function d8(IArcVRF rng, Options memory o) internal returns (uint256) { return dN(rng, 8, o); }
    function d6(IArcVRF rng, Options memory o) internal returns (uint256) { return dN(rng, 6, o); }
    function d4(IArcVRF rng, Options memory o) internal returns (uint256) { return dN(rng, 4, o); }
    function coinFlip(IArcVRF rng, Options memory o) internal returns (uint256) {
        return _send(rng, M.Spec(M.Operation.CoinFlip, 0, 0, 1, 0), o);
    }
    function numberRange(IArcVRF rng, uint256 min, uint256 max, Options memory o) internal returns (uint256) {
        return _send(rng, M.Spec(M.Operation.NumberRange, min, max, 1, 0), o);
    }
    function chooseOne(IArcVRF rng, uint32 population, Options memory o) internal returns (uint256) {
        return _send(rng, M.Spec(M.Operation.ChooseOne, 0, 0, 1, population), o);
    }
    function chooseMany(IArcVRF rng, uint32 population, uint32 count, Options memory o) internal returns (uint256) {
        return _send(rng, M.Spec(M.Operation.ChooseMany, 0, 0, count, population), o);
    }
    function shuffle(IArcVRF rng, uint32 population, Options memory o) internal returns (uint256) {
        return _send(rng, M.Spec(M.Operation.Shuffle, 0, 0, population, population), o);
    }
    function _send(IArcVRF rng, M.Spec memory spec, Options memory o) private returns (uint256) {
        return rng.requestMappedRandomness{value: rng.requestFee()}(o.clientSeed, o.callbackGasLimit, o.refundAddress, spec);
    }
}
