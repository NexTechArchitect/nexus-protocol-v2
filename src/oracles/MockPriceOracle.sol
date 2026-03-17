// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";

contract MockPriceOracle is Ownable, IPriceOracle {
    mapping(address => uint256) private prices;
    mapping(address => uint256) private lastUpdated;
    mapping(address => bool) public registeredAssets;
    uint256 public stalenessThreshold = 3600;

    event PriceSet(address indexed token, uint256 price, uint256 timestamp);
    event AssetRegistered(address indexed token, uint256 initialPrice);

    constructor() Ownable(msg.sender) {}

    function registerAsset(address _token, uint256 _initialPrice) external onlyOwner {
        if (_token == address(0)) revert PerpsErrors.InvalidAddress();
        if (_initialPrice == 0) revert PerpsErrors.InvalidPrice();
        registeredAssets[_token] = true;
        prices[_token] = _initialPrice;
        lastUpdated[_token] = block.timestamp;
        emit AssetRegistered(_token, _initialPrice);
    }

    function setPrice(address _token, uint256 _newPrice) external onlyOwner {
        if (!registeredAssets[_token]) revert PerpsErrors.InvalidAsset();
        if (_newPrice == 0) revert PerpsErrors.InvalidPrice();
        prices[_token] = _newPrice;
        lastUpdated[_token] = block.timestamp;
        emit PriceSet(_token, _newPrice, block.timestamp);
    }

    function batchSetPrices(address[] calldata _tokens, uint256[] calldata _newPrices) external onlyOwner {
        if (_tokens.length != _newPrices.length) revert PerpsErrors.InvalidParameter();
        for (uint256 i = 0; i < _tokens.length;) {
            if (!registeredAssets[_tokens[i]]) revert PerpsErrors.InvalidAsset();
            if (_newPrices[i] == 0) revert PerpsErrors.InvalidPrice();
            prices[_tokens[i]] = _newPrices[i];
            lastUpdated[_tokens[i]] = block.timestamp;
            emit PriceSet(_tokens[i], _newPrices[i], block.timestamp);
            unchecked { i++; }
        }
    }

    function getPrice(address _token) external view override returns (uint256) {
        if (!registeredAssets[_token]) revert PerpsErrors.InvalidAsset();
        uint256 price = prices[_token];
        if (price == 0) revert PerpsErrors.InvalidPrice();
        if (block.timestamp - lastUpdated[_token] > stalenessThreshold) revert PerpsErrors.StalePrice();
        return price;
    }

    function getLastUpdated(address _token) external view returns (uint256) {
        return lastUpdated[_token];
    }

    function setStalenessThreshold(uint256 _newThreshold) external onlyOwner {
        if (_newThreshold == 0) revert PerpsErrors.InvalidParameter();
        stalenessThreshold = _newThreshold;
    }
}
