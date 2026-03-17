// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockChainlink
 * @notice Fake AggregatorV3Interface for testing PriceOracle edge cases
 */
contract MockChainlink {
    uint8 public decimals;
    string public description;
    uint256 public version = 1;

    // Round data storage
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    constructor(uint8 _decimals, string memory _description) {
        decimals = _decimals;
        description = _description;
    }


    function setPrice(int256 _answer) external {
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function setRoundData(
        uint80 _roundId,
        int256 _answer,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) external {
        roundId = _roundId;
        answer = _answer;
        startedAt = _startedAt;
        updatedAt = _updatedAt;
        answeredInRound = _answeredInRound;
    }

    //////////////////////////////////////////////////
    //     AggregatorV3Interface implementation     // 
    //////////////////////////////////////////////////

    function getRoundData(uint80 _roundId) external view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (_roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    function latestRoundData() external view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}