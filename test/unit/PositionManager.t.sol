// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {IPerpsCore} from "../../src/interfaces/IPerpsCore.sol";
import {IPriceOracle} from "../../src/interfaces/IPriceOracle.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockChainlink} from "../mocks/MockChainlink.sol"; 

contract PositionManagerTest is Test {
    PositionManager public posManager;
    PerpsVault public vault;
    MockERC20 public usdc;
    MockPriceOracle public oracle;

    address public admin = address(this);
    address public trader1 = address(0x111);
    address public trader2 = address(0x222);
    address public keeper = address(0x333);
    address public ccReceiver = address(0x444);
    address public weth = address(0x555);
    address public btc = address(0x666);

    uint256 public constant INITIAL_BALANCE = 50000e6; // 50k USDC
    uint256 public constant ETH_PRICE = 3000e18;
    uint256 public constant BTC_PRICE = 60000e18;

    function setUp() public {
        // 1. Deploy Mocks
        usdc = new MockERC20("USDC", "USDC", 6);
        oracle = new MockPriceOracle();
        
        // 2. Deploy Core Systems
        vault = new PerpsVault(address(usdc));
        posManager = new PositionManager(address(vault), address(oracle), 50); // 50x Max Leverage
        
        // 3. Admin Configurations
        vault.setPositionManager(address(posManager));
        posManager.addAsset(weth);
        posManager.addAsset(btc);
        posManager.setCrossChainReceiver(ccReceiver);

        // 4. Set Initial Prices
        oracle.setPrice(weth, ETH_PRICE);
        oracle.setPrice(btc, BTC_PRICE);

        // 5. Fund Traders
        _fundAndApprove(trader1, INITIAL_BALANCE);
        _fundAndApprove(trader2, INITIAL_BALANCE);
    }

    function _fundAndApprove(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(amount); // Assuming vault has a deposit function
        vm.stopPrank();
    }

    // ==========================================
    // 1. ASSET MANAGEMENT & ADMIN TESTS
    // ==========================================

    function test_AddAndRemoveAsset() public {
        address link = address(0x777);
        
        posManager.addAsset(link);
        assertTrue(posManager.whitelistedOracles(link));

        posManager.removeAsset(link);
        assertFalse(posManager.whitelistedOracles(link));
    }

    function test_RevertIf_AddExistingAsset() public {
        vm.expectRevert(PerpsErrors.InvalidParameter.selector);
        posManager.addAsset(weth);
    }

    function test_AdminSetters() public {
        posManager.setMaxLeverage(100);
        assertEq(posManager.maxLeverage(), 100);

        posManager.setLiquidationSettings(8500, 500); // 85% MM, 5% fee
        assertEq(posManager.liquidationThresholdBps(), 8500);
        assertEq(posManager.liquidatorFeeBps(), 500);

        posManager.setKeeperReward(20);
        assertEq(posManager.keeperRewardBps(), 20);

        posManager.setMaxActiveAssets(10);
        assertEq(posManager.maxActiveAssets(), 10);
    }

    function test_PauseUnpause() public {
        posManager.pause();
        
        vm.prank(trader1);
        vm.expectRevert(); // Expected to revert due to whenNotPaused
        posManager.openPosition(weth, 100e6, 10, true, IPerpsCore.MarginMode.ISOLATED);

        posManager.unpause();
        
        vm.prank(trader1);
        posManager.openPosition(weth, 100e6, 10, true, IPerpsCore.MarginMode.ISOLATED);
        assertTrue(posManager.getPosition(trader1, weth).isOpen);
    }

    // ==========================================
    // 2. MARKET POSITION TESTS
    // ==========================================

    function test_OpenPosition_Valid() public {
        uint256 margin = 500e6;
        uint256 leverage = 20;

        vm.prank(trader1);
        posManager.openPosition(weth, margin, leverage, true, IPerpsCore.MarginMode.ISOLATED);

        IPerpsCore.Position memory pos = posManager.getPosition(trader1, weth);
        assertTrue(pos.isOpen);
        assertEq(pos.collateral, margin);
        assertEq(pos.leverage, leverage);
        assertTrue(pos.isLong);
        assertEq(pos.entryPrice, ETH_PRICE);
    }

    function test_RevertIf_OpenPosition_InvalidParams() public {
        vm.startPrank(trader1);
        
        // Unwhitelisted asset
        vm.expectRevert(PerpsErrors.InvalidAsset.selector);
        posManager.openPosition(address(0xdead), 100e6, 10, true, IPerpsCore.MarginMode.ISOLATED);

        // Zero Collateral
        vm.expectRevert(PerpsErrors.ZeroAmount.selector);
        posManager.openPosition(weth, 0, 10, true, IPerpsCore.MarginMode.ISOLATED);

        // Leverage exceeds max
        vm.expectRevert(PerpsErrors.InvalidLeverage.selector);
        posManager.openPosition(weth, 100e6, 51, true, IPerpsCore.MarginMode.ISOLATED);

        vm.stopPrank();
    }

    function test_ClosePosition() public {
        vm.prank(trader1);
        posManager.openPosition(weth, 500e6, 10, true, IPerpsCore.MarginMode.ISOLATED);

        oracle.setPrice(weth, 3300e18); // 10% price increase

        vm.prank(trader1);
        posManager.closePosition(weth, 0);

        IPerpsCore.Position memory pos = posManager.getPosition(trader1, weth);
        assertFalse(pos.isOpen);
    }

    // ==========================================
    // 3. LIMIT ORDER TESTS
    // ==========================================

    function test_PlaceAndCancelLimitOrder() public {
        uint256 margin = 200e6;
        uint256 targetPrice = 2800e18; // Buy ETH when it drops to 2800

        vm.startPrank(trader1);
        posManager.placeLimitOrder(weth, margin, 10, targetPrice, true, IPerpsCore.MarginMode.ISOLATED);
        
        (,,,,,, , bool isActive) = posManager.limitOrders(trader1, weth, 0);
        assertTrue(isActive);

        posManager.cancelLimitOrder(weth, 0);
        
        (,,,,,, , bool activeAfter) = posManager.limitOrders(trader1, weth, 0);
        assertFalse(activeAfter);
        vm.stopPrank();
    }

    function test_ExecuteLimitOrder_Long() public {
        vm.prank(trader1);
        posManager.placeLimitOrder(weth, 200e6, 10, 2900e18, true, IPerpsCore.MarginMode.ISOLATED);

        // Price drops to meet the limit order condition
        oracle.setPrice(weth, 2850e18);

        vm.prank(keeper);
        posManager.executeLimitOrder(trader1, weth, 0);

        IPerpsCore.Position memory pos = posManager.getPosition(trader1, weth);
        assertTrue(pos.isOpen);
        assertEq(pos.entryPrice, 2850e18);
        
        (,,,,,, , bool isActive) = posManager.limitOrders(trader1, weth, 0);
        assertFalse(isActive);
    }

    // ==========================================
    // 4. LIQUIDATION TESTS
    // ==========================================


    function test_RevertIf_LiquidateHealthyPosition() public {
        vm.prank(trader1);
        posManager.openPosition(weth, 1000e6, 10, true, IPerpsCore.MarginMode.ISOLATED);

        oracle.setPrice(weth, 2950e18); 

        vm.prank(keeper);
        vm.expectRevert(PerpsErrors.PositionHealthy.selector);
        posManager.liquidate(trader1, weth);
    }

    // ==========================================
    // 5. CROSS-CHAIN TESTS
    // ==========================================

    function test_ExecuteCrossChainTrade() public {
        vm.prank(ccReceiver);
        posManager.executeCrossChainTrade(trader2, btc, false, 1000e6, 15); // Short BTC

        IPerpsCore.Position memory pos = posManager.getPosition(trader2, btc);
        assertTrue(pos.isOpen);
        assertTrue(pos.isCrossChain);
        assertFalse(pos.isLong);
        assertEq(pos.leverage, 15);
    }

    function test_RevertIf_UnauthorizedCrossChain() public {
        vm.prank(trader1); // Not the registered cross-chain receiver
        vm.expectRevert(PerpsErrors.Unauthorized.selector);
        posManager.executeCrossChainTrade(trader1, btc, true, 500e6, 10);
    }
}

// Minimal Mock Price Oracle to fulfill interface
contract MockPriceOracle is IPriceOracle {
    mapping(address => uint256) public prices;
    function setPrice(address token, uint256 price) external { prices[token] = price; }
    function getPrice(address token) external view returns (uint256) { return prices[token]; }
}