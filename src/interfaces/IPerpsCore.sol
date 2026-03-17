// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPerpsCore {
    
    // Enum yahan define karna best practice hai
    enum MarginMode { ISOLATED, CROSS }
    
    struct Position {
        uint256 collateral; // User margin (e.g. 100 USDC)
        uint256 leverage;   // Leverage multiplier (e.g. 10e18)
        uint256 entryPrice; // Entry price (from Oracle)
        bool isLong;        // True = Long, False = Short
        bool isOpen;        // Position active or closed
        bool isCrossChain;  // Indicates if position was opened via cross-chain request
        MarginMode mode;    // 0 = ISOLATED, 1 = CROSS
    }

    function executeCrossChainTrade(
        address trader, 
        address token, 
        bool isLong, 
        uint256 margin, 
        uint256 leverage
    ) external;
    
    event PositionOpened(
        address indexed user, 
        address indexed asset, 
        bool isLong, 
        uint256 collateral, 
        uint256 leverage, 
        uint256 entryPrice,
        MarginMode mode     // <-- Updated to match PositionManager
    );
    
    event PositionClosed(
        address indexed user, 
        address indexed asset,
        int256 pnl, 
        uint256 payout
    );
    
    event PositionLiquidated(
        address indexed trader, 
        address indexed asset, 
        address indexed liquidator, 
        uint256 reward,
        MarginMode mode     
    );
}