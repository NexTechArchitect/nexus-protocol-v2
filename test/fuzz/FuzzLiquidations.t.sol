// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {LiquidationEngine} from "../../src/core/LiquidationEngine.sol";
import {PriceOracle} from "../../src/oracles/PriceOracle.sol";
import {IPerpsCore} from "../../src/interfaces/IPerpsCore.sol"; // <-- FIX: Import add kar diya
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ==========================================
// MOCKS
// ==========================================
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { _mint(msg.sender, 10_000_000 * 1e6); }
    function decimals() public pure override returns (uint8) { return 6; }
}

contract MockAggregator {
    int256 public answer;
    constructor(int256 _initialAnswer) { answer = _initialAnswer; }
    function setPrice(int256 _answer) external { answer = _answer; }
    function decimals() external pure returns (uint8) { return 8; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, block.timestamp, block.timestamp, 1);
    }
}

contract FuzzLiquidationsTest is Test {
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
    address public keeper = makeAddr("keeper");

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockUSDC();
        ethFeed = new MockAggregator(2000 * 1e8);
        oracle = new PriceOracle();
        oracle.setAsset(address(usdc), address(ethFeed), 3600);

        vault = new PerpsVault(address(usdc));
        posManager = new PositionManager(address(vault), address(oracle), 50 * 1e18);
        engine = new LiquidationEngine(address(posManager));

        vault.setPositionManager(address(posManager));
        posManager.addAsset(address(usdc));
        posManager.setLiquidationSettings(8000, 1000); // 80% maintenance, 10% keeper fee
        
        usdc.safeTransfer(lp, 100_000 * 1e6);
        usdc.safeTransfer(alice, 10_000 * 1e6);
        vm.stopPrank();

        // LP adds house liquidity
        vm.startPrank(lp);
        usdc.approve(address(vault), type(uint256).max);
        vault.addLiquidity(100_000 * 1e6);
        vm.stopPrank();

        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
    }

    /**
     * @notice Fuzzes the price crash to ensure math holds perfectly during liquidations
     */
    function testFuzz_LiquidationMathSolvency(uint256 priceCrashBps) public {
        // Bound the crash to be between 80% (8000 bps) and 99% (9900 bps) to force a liquidation
        priceCrashBps = bound(priceCrashBps, 8000, 9900);
        
        vm.startPrank(alice);
        vault.deposit(1000 * 1e6); // Alice deposits $1000
        
        // FIX: Bracket position theek kar di aur 5th argument proper pass kiya hai
        posManager.openPosition(address(usdc), 1000 * 1e18, 10 * 1e18, true, IPerpsCore.MarginMode.ISOLATED); 
        vm.stopPrank();

        // Simulate the Market Crash based on random Fuzz input
        uint256 entryPrice = 2000 * 1e8;
        uint256 crashedPrice = (entryPrice * (10000 - priceCrashBps)) / 10000;
        ethFeed.setPrice(int256(crashedPrice));

        address[] memory traders = new address[](1);
        address[] memory tokens = new address[](1);
        traders[0] = alice; 
        tokens[0] = address(usdc);

        uint256 vaultBalanceBefore = usdc.balanceOf(address(vault));
        
        // Keeper executes the liquidation
        vm.prank(keeper);
        engine.batchLiquidate(traders, tokens);

        // INVARIANT CHECK: Vault balance must absorb losses and NEVER decrease during a liquidation
        uint256 vaultBalanceAfter = usdc.balanceOf(address(vault));
        assertTrue(vaultBalanceAfter >= vaultBalanceBefore, "Vault lost funds during liquidation!");
        assertFalse(posManager.getPosition(alice, address(usdc)).isOpen, "Position was not liquidated!");
    }
}