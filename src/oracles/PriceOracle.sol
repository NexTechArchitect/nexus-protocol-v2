// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
   }

/**
 * @title   PriceOracle
 * @author  NexTechArchitect
 * @notice  Central source of truth for asset prices.
 */
contract PriceOracle is Ownable, IPriceOracle {


    mapping(address => AggregatorV3Interface) public feeds;
    mapping(address => uint256) public heartbeats;
    uint256 private constant TARGET_DECIMALS = 18;

    event AssetSet(address indexed token, address indexed feed, uint256 heartbeat);

    constructor() Ownable(msg.sender) {}

/**
* @notice   Sets the price feed for an asset
* @param    _token    The address of the asset
* @param    _feed     The address of the price feed
* @param    _heartbeat    The heartbeat in seconds
 */

    function setAsset(
        address _token, 
        address _feed, 
        uint256 _heartbeat
    ) external onlyOwner {
        if (_token == address(0) || _feed == address(0)) revert PerpsErrors.InvalidAddress();
        if (_heartbeat == 0) revert PerpsErrors.InvalidParameter();

        feeds[_token] = AggregatorV3Interface(_feed);
        heartbeats[_token] = _heartbeat;

        emit AssetSet(_token, _feed, _heartbeat);
    }
/**
* @notice   Returns the price of an asset
* @param    _token    The address of the asset
 */
    function getPrice(address _token) external view override returns (uint256) {
        AggregatorV3Interface feed = feeds[_token];
        if (address(feed) == address(0)) revert PerpsErrors.InvalidAsset();

        (
            /* uint80 roundID */,
            int256 rawPrice,
            /* uint256 startedAt */,
            uint256 updatedAt,
            /* uint80 answeredInRound */
        ) = feed.latestRoundData();

        if (rawPrice <= 0) revert PerpsErrors.InvalidPrice();
        if (block.timestamp - updatedAt > heartbeats[_token]) revert PerpsErrors.StalePrice();

      uint8 decimals = feed.decimals();
        if (decimals > TARGET_DECIMALS) revert PerpsErrors.InvalidParameter();

        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(rawPrice) * (10 ** (TARGET_DECIMALS - decimals));
    }
}
    
