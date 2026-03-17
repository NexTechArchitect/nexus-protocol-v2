// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
contract MockAggregatorV3 is Ownable {
    string public description;
    uint8 public immutable decimalsValue;
    uint80 private _roundId;
    int256 private _answer;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;
    event PriceUpdated(uint80 roundId, int256 answer, uint256 updatedAt);
    constructor(string memory _desc, uint8 _decimals, int256 _initialPrice) Ownable(msg.sender) {
        description = _desc;
        decimalsValue = _decimals;
        _roundId = 1;
        _answer = _initialPrice;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = 1;
    }
    function updatePrice(int256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Price must be positive");
        _roundId++;
        _answer = _newPrice;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = _roundId;
        emit PriceUpdated(_roundId, _newPrice, block.timestamp);
    }
    function decimals() external view returns (uint8) { return decimalsValue; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }
    function getRoundData(uint80 _rid) external view returns (uint80, int256, uint256, uint256, uint80) {
        require(_rid <= _roundId, "Round not found");
        return (_rid, _answer, _startedAt, _updatedAt, _rid);
    }
    function getPrice() external view returns (int256) { return _answer; }
}
