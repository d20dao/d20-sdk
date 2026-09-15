// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RandomnessMapping} from "../libraries/RandomnessMapping.sol";

interface ID20VRF {
    function requestFee() external view returns (uint256);
    function requestRandomness(bytes32 clientSeed, uint32 callbackGasLimit, address _refundAddress)
        external payable returns (uint256 requestId);
    function requestMappedRandomness(
        bytes32 clientSeed, uint32 callbackGasLimit, address _refundAddress, RandomnessMapping.Spec calldata spec
    ) external payable returns (uint256 requestId);
    function getMappedResult(uint256 requestId) external view returns (uint256[] memory);
}

interface ID20VRFConsumer {
    function rawFulfillRandomness(uint256 requestId, bytes32 randomness) external;
}
