// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPerpsCore} from "../interfaces/IPerpsCore.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";

/**
 * @title PnLCalculator
 * @notice Library for calculating Unrealized Pnl, Position Size and Liquidation Health.
 * @dev All price and value calculations assume 1e18 precision.
 */
library PnLCalculator {
    uint256 private constant PRECISION = 1e18;
    uint256 private constant BASIS_POINTS_DIVISOR = 10000;

    /**
     * @notice Calculates the Unrealized PnL for a given position based on current price.
     * @param position The Position struct containing trade details.
     * @param currentPrice The current price of the asset from the oracle.
     * @return pnl The Unrealized PnL in 1e18 precision.
     */
    function calculatePnL(
        IPerpsCore.Position memory position,
        uint256 currentPrice
    ) internal pure returns (int256 pnl) {
  
        if (position.entryPrice == 0) revert PerpsErrors.InvalidPrice();
        
        uint256 entryPrice = position.entryPrice;
        
        // Calculate size: (Collateral * Leverage) / PRECISION
        uint256 size = (position.collateral * position.leverage) / PRECISION;
        
        uint256 priceDelta;
        bool isProfit;

        // Determine price delta and profit/loss direction
        if (position.isLong) {
            isProfit = currentPrice >= entryPrice;
            priceDelta = isProfit ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
        } else {
            isProfit = entryPrice >= currentPrice;
            priceDelta = isProfit ? (entryPrice - currentPrice) : (currentPrice - entryPrice);
        }

        unchecked {
           
            if (size > 0 && priceDelta > type(uint256).max / size) {
                revert PerpsErrors.InvalidAmount(); 
            }

            // Safe to multiply and divide now
            uint256 rawPnL = (priceDelta * size) / entryPrice;

            // Apply direction (positive for profit, negative for loss)
            pnl = isProfit ? _toInt256(rawPnL) : -_toInt256(rawPnL);
        }
    }

    /**
     * @notice Determines if a position is liquidatable based on current price and maintenance margin.
     */
    function isLiquidatable(
        IPerpsCore.Position memory position,
        uint256 currentPrice,
        uint256 maintenanceMarginBps
    ) internal pure returns (bool) {
        int256 pnl = calculatePnL(position, currentPrice);
        
        // Equity = Collateral + PnL
        int256 equity = _toInt256(position.collateral) + pnl;
        
        // Maintenance Margin = (Collateral * Bps) / 10000
        int256 maintenanceMargin = _toInt256((position.collateral * maintenanceMarginBps) / BASIS_POINTS_DIVISOR);
        
        return equity <= maintenanceMargin;
    }

    /**
     * @notice Helper function to safely convert uint256 to int256.
     */
    function _toInt256(uint256 value) private pure returns (int256) {
        if (value > uint256(type(int256).max)) revert PerpsErrors.InvalidAmount(); 
        
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256(value);
    }
}