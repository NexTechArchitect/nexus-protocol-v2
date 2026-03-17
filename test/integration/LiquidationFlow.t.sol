// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {LiquidationEngine} from "../../src/core/LiquidationEngine.sol";
import {PriceOracle} from "../../src/oracles/PriceOracle.sol";
import {IPerpsCore} from "../../src/interfaces/IPerpsCore.sol"; // <-- FIX: Import add kar diya
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { _mint(msg.sender, 10_000_000 * 1e6); }
    function decimals() public pure override returns (uint8) { return 6; }
}

contract MockAggregator {
    uint8 public decimals = 8;
    int256 public answer;
    uint256 public updatedAt;
    constructor(int256 _initialAnswer) { answer = _initialAnswer; updatedAt = block.timestamp; }
    function setPrice(int256 _answer) external { answer = _answer; updatedAt = block.timestamp; }
    function setStale() external { updatedAt = 1; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, block.timestamp, updatedAt, 1);
    }
}

contract LiquidationFlowIntegrationTest is Test {
    using SafeERC20 for MockUSDC;

    PositionManager public posManager;
    PerpsVault public vault;
    LiquidationEngine public engine;
    PriceOracle public oracle;
    MockUSDC public usdc;
    MockAggregator public ethFeed;

    address public owner = makeAddr("owner");
    address public lp = makeAddr("lp");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public keeper = makeAddr("keeper");

    uint256 public constant MAX_LEVERAGE = 50 * 1e18;
    uint256 public constant HEARTBEAT = 3600; 

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockUSDC();
        ethFeed = new MockAggregator(2000 * 1e8);
        oracle = new PriceOracle();
        oracle.setAsset(address(usdc), address(ethFeed), HEARTBEAT);
        vault = new PerpsVault(address(usdc));
        posManager = new PositionManager(address(vault), address(oracle), MAX_LEVERAGE);
        engine = new LiquidationEngine(address(posManager));

        vault.setPositionManager(address(posManager));
        posManager.addAsset(address(usdc));
        posManager.setLiquidationSettings(8000, 1000); 
        
        usdc.safeTransfer(lp, 100_000 * 1e6);
        usdc.safeTransfer(alice, 10_000 * 1e6);
        usdc.safeTransfer(bob, 10_000 * 1e6);
        vm.stopPrank();

        vm.startPrank(lp);
        usdc.approve(address(vault), type(uint256).max);
        vault.addLiquidity(100_000 * 1e6);
        vm.stopPrank();

        vm.prank(alice); usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob); usdc.approve(address(vault), type(uint256).max);
    }

    function test_Integration_PreciseLiquidationMath() public {
        vm.startPrank(alice);
        vault.deposit(1000 * 1e6); 
        // FIX: Bracket position aur 5th argument
        posManager.openPosition(address(usdc), 1000 * 1e18, 10 * 1e18, true, IPerpsCore.MarginMode.ISOLATED); 
        vm.stopPrank();
        ethFeed.setPrice(1960 * 1e8); 

        address[] memory traders = new address[](1);
        address[] memory tokens = new address[](1);
        traders[0] = alice; tokens[0] = address(usdc);
        
        vm.prank(keeper);
        engine.batchLiquidate(traders, tokens);

        assertEq(posManager.getPosition(alice, address(usdc)).isOpen, false);
        assertEq(usdc.balanceOf(keeper), 80 * 1e6);
        assertEq(vault.getTraderCollateral(alice), 720 * 1e18);
    }

    function test_Integration_BatchResilienceWithMixedStates() public {
        vm.startPrank(alice);
        vault.deposit(1000 * 1e6);
        // FIX: Bracket position aur 5th argument
        posManager.openPosition(address(usdc), 1000 * 1e18, 10 * 1e18, true, IPerpsCore.MarginMode.ISOLATED); 
        vm.stopPrank();

        vm.startPrank(bob);
        vault.deposit(1000 * 1e6);
        // FIX: Bracket position aur 5th argument
        posManager.openPosition(address(usdc), 1000 * 1e18, 10 * 1e18, false, IPerpsCore.MarginMode.ISOLATED); 
        vm.stopPrank();

        ethFeed.setPrice(1960 * 1e8);
        address[] memory traders = new address[](2);
        address[] memory tokens = new address[](2);
        traders[0] = alice; tokens[0] = address(usdc);
        traders[1] = bob; tokens[1] = address(usdc);

        vm.prank(keeper);
        engine.batchLiquidate(traders, tokens);

        assertFalse(posManager.getPosition(alice, address(usdc)).isOpen);
        assertTrue(posManager.getPosition(bob, address(usdc)).isOpen);
    }

    function test_Integration_OracleStalePriceProtection() public {
        vm.startPrank(alice);
        vault.deposit(1000 * 1e6);
        // FIX: Bracket position aur 5th argument
        posManager.openPosition(address(usdc), 1000 * 1e18, 10 * 1e18, true, IPerpsCore.MarginMode.ISOLATED); 
        vm.stopPrank();

        ethFeed.setStale();
        vm.warp(block.timestamp + HEARTBEAT + 1);

        address[] memory traders = new address[](1);
        address[] memory tokens = new address[](1);
        traders[0] = alice; tokens[0] = address(usdc);

        vm.prank(keeper);
        engine.batchLiquidate(traders, tokens);
        assertTrue(posManager.getPosition(alice, address(usdc)).isOpen);
    }
}