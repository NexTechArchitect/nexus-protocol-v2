// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockAggregatorV3} from "./MockAggregatorV3.sol";
contract PriceKeeper is Ownable {
    MockAggregatorV3 public ethFeed;
    MockAggregatorV3 public btcFeed;
    uint256 public constant MIN_UPDATE_INTERVAL = 60;
    uint256 public lastUpdateTime;
    event PricesUpdated(int256 ethPrice, int256 btcPrice, uint256 timestamp);
    constructor(address _ethFeed, address _btcFeed) Ownable(msg.sender) {
        require(_ethFeed != address(0) && _btcFeed != address(0), "Zero address");
        ethFeed = MockAggregatorV3(_ethFeed);
        btcFeed = MockAggregatorV3(_btcFeed);
    }
    function updateAllPrices(int256 _ethPrice, int256 _btcPrice) external onlyOwner {
        require(block.timestamp >= lastUpdateTime + MIN_UPDATE_INTERVAL, "Too frequent");
        require(_ethPrice > 0 && _btcPrice > 0, "Invalid prices");
        ethFeed.updatePrice(_ethPrice);
        btcFeed.updatePrice(_btcPrice);
        lastUpdateTime = block.timestamp;
        emit PricesUpdated(_ethPrice, _btcPrice, block.timestamp);
    }
    function updateEthPrice(int256 _ethPrice) external onlyOwner {
        require(_ethPrice > 0, "Invalid price");
        ethFeed.updatePrice(_ethPrice);
    }
    function updateBtcPrice(int256 _btcPrice) external onlyOwner {
        require(_btcPrice > 0, "Invalid price");
        btcFeed.updatePrice(_btcPrice);
    }
    function getAllPrices() external view returns (int256 eth, int256 btc) {
        return (ethFeed.getPrice(), btcFeed.getPrice());
    }
}
