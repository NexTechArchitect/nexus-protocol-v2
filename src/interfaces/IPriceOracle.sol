// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title   IPriceOracle
 * @notice  Interface for the PriceOracle used by PositionManager
 */
interface IPriceOracle {
    /**
     * @notice Fetches the latest price for an asset, normalized to 18 decimals.
     * @param _token The asset to fetch the price for.
     * @return The 18-decimal normalized price.
     */
    function getPrice(address _token) external view returns (uint256);
}