// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PnLCalculator} from "../../src/math/PnLCalculator.sol";
import {IPerpsCore} from "../../src/interfaces/IPerpsCore.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";

// ==========================================
// WRAPPER CONTRACT 
// Exposes internal library functions for testing
// ==========================================
contract PnLWrapper {
    function calculatePnL(IPerpsCore.Position memory position, uint256 currentPrice) external pure returns (int256) {
        return PnLCalculator.calculatePnL(position, currentPrice);
    }

    function isLiquidatable(IPerpsCore.Position memory position, uint256 currentPrice, uint256 maintenanceMarginBps) external pure returns (bool) {
        return PnLCalculator.isLiquidatable(position, currentPrice, maintenanceMarginBps);
    }
}

// ==========================================
// TEST SUITE: PnL & LIQUIDATION MATH
// ==========================================
contract PnLCalculatorTest is Test {
    PnLWrapper public pnlWrapper;

    uint256 public constant PRECISION = 1e18;
    uint256 public constant MAINTENANCE_MARGIN_BPS = 500; // 5%

    function setUp() public {
        pnlWrapper = new PnLWrapper();
    }

    // ==========================================
    // 1. STANDARD PNL TESTS (Happy Path)
    // ==========================================

    function test_Success_LongPositionProfit() view public {
        IPerpsCore.Position memory pos = IPerpsCore.Position({
            collateral: 1000 * PRECISION,
            leverage: 10 * PRECISION, // Size = 10,000
            entryPrice: 2000 * PRECISION,
            isLong: true,
            isOpen: true,
            isCrossChain: false,
            mode: IPerpsCore.MarginMode.ISOLATED 
        });

        // casting to 'int256' is safe because [explain why]
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 pnl = pnlWrapper.calculatePnL(pos, 2200 * PRECISION);

        // casting to 'int256' is safe because [explain why]
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(pnl, int256(1000 * PRECISION), "Long profit miscalculated");
    }

    function test_Success_ShortPositionProfit() view public {
        IPerpsCore.Position memory pos = IPerpsCore.Position({
            collateral: 1000 * PRECISION,
            leverage: 10 * PRECISION, // Size = 10,000
            entryPrice: 2000 * PRECISION,
            isLong: false,
            isOpen: true,
            isCrossChain: false,
            mode: IPerpsCore.MarginMode.ISOLATED 
        });

        // casting to 'int256' is safe because [explain why]
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 pnl = pnlWrapper.calculatePnL(pos, 1800 * PRECISION);

        // casting to 'int256' is safe because [explain why]
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(pnl, int256(1000 * PRECISION), "Short profit miscalculated");
    }

    // ==========================================
    // 2. LIQUIDATION TESTS
    // ==========================================

    function test_Success_TriggersLiquidation() view public {
        IPerpsCore.Position memory pos = IPerpsCore.Position({
            collateral: 1000 * PRECISION,
            leverage: 10 * PRECISION,
            entryPrice: 2000 * PRECISION,
            isLong: true,
            isOpen: true,
            isCrossChain: false,
            mode: IPerpsCore.MarginMode.ISOLATED // FIX: Added 7th argument
        });

        // Drop to $1800 causes exactly -1000 PnL (100% loss of collateral)
        // Equity = 0. Maintenance Margin is 50. Equity <= MM triggers liquidation.
        bool isLiq = pnlWrapper.isLiquidatable(pos, 1800 * PRECISION, MAINTENANCE_MARGIN_BPS);
        assertTrue(isLiq, "Position should be liquidatable");
    }

    // ==========================================
    // 3. BUG HUNTING & ATTACK VECTORS
    // ==========================================

    function test_RevertWhen_EntryPriceIsZero() public {
        IPerpsCore.Position memory pos = IPerpsCore.Position({
            collateral: 1000 * PRECISION,
            leverage: 10 * PRECISION,
            entryPrice: 0, 
            isLong: true,
            isOpen: true,
            isCrossChain: false,
            mode: IPerpsCore.MarginMode.ISOLATED 
        });

        vm.expectRevert(PerpsErrors.InvalidPrice.selector); 
        pnlWrapper.calculatePnL(pos, 2000 * PRECISION);
    }

    function test_RevertWhen_IntermediateMultiplicationOverflow() public {
        uint256 safeMaxCollateral = type(uint256).max / PRECISION;

        IPerpsCore.Position memory pos = IPerpsCore.Position({
            collateral: safeMaxCollateral, 
            leverage: 1 * PRECISION,
            entryPrice: 1 * PRECISION,
            isLong: true,
            isOpen: true,
            isCrossChain: false,
            mode: IPerpsCore.MarginMode.ISOLATED 
        });

        // Current price is $3. priceDelta = $2 (2 * 1e18).
        // size (safeMax) * priceDelta (2e18) WILL trigger our custom overflow!
        uint256 currentPrice = 3 * PRECISION;

        vm.expectRevert(PerpsErrors.InvalidAmount.selector);
        pnlWrapper.calculatePnL(pos, currentPrice);
    }

    function test_RevertWhen_FinalPnLOverFlowsInt256() public {
        
        IPerpsCore.Position memory pos = IPerpsCore.Position({
            collateral: 1000 * PRECISION, 
            leverage: 10 * PRECISION, // Size = 10,000
            entryPrice: 1, // 1 wei
            isLong: true,
            isOpen: true,
            isCrossChain: false,
            mode: IPerpsCore.MarginMode.ISOLATED 
        });

        uint256 maxInt = uint256(type(int256).max);
        
        uint256 currentPrice = (maxInt / 10000) + 2; 

        vm.expectRevert(PerpsErrors.InvalidAmount.selector);
        pnlWrapper.calculatePnL(pos, currentPrice);
    }
}