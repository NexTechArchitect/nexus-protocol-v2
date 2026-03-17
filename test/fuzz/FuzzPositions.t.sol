// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {PriceOracle} from "../../src/oracles/PriceOracle.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPerpsCore} from "../../src/interfaces/IPerpsCore.sol";

// Mocks
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { _mint(msg.sender, 10_000_000 * 1e6); }
    function decimals() public pure override returns (uint8) { return 6; }
}
contract MockAggregator {
    int256 public answer;
    constructor(int256 _initialAnswer) { answer = _initialAnswer; }
    function decimals() external pure returns (uint8) { return 8; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, block.timestamp, block.timestamp, 1);
    }
}

contract FuzzPositionsTest is Test {
    using SafeERC20 for MockUSDC;

    PositionManager public posManager;
    PerpsVault public vault;
    PriceOracle public oracle;
    MockUSDC public usdc;
    MockAggregator public ethFeed;

    address public owner = makeAddr("owner");
    address public lp = makeAddr("lp");
    address public alice = makeAddr("alice");

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockUSDC();
        ethFeed = new MockAggregator(2000 * 1e8);
        oracle = new PriceOracle();
        oracle.setAsset(address(usdc), address(ethFeed), 3600);

        vault = new PerpsVault(address(usdc));
        posManager = new PositionManager(address(vault), address(oracle), 50 * 1e18);

        vault.setPositionManager(address(posManager));
        posManager.addAsset(address(usdc));
        
        usdc.safeTransfer(lp, 100_000 * 1e6);
        usdc.safeTransfer(alice, 10_000 * 1e6);
        vm.stopPrank();

        vm.startPrank(lp);
        usdc.approve(address(vault), type(uint256).max);
        vault.addLiquidity(100_000 * 1e6);
        vm.stopPrank();

        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        // Alice deposits a big chunk so she can fuzz various margin sizes in tests
        vault.deposit(10_000 * 1e6); 
        vm.stopPrank();
    }

    /**
     * @notice Tests opening positions with wild random variables
     */
    function testFuzz_OpenRandomPositions(uint256 marginAmountScaled, uint256 leverage, bool isLong) public {
        // Bound margin between $10 and $10,000 (scaled to 18 decimals)
        marginAmountScaled = bound(marginAmountScaled, 10 * 1e18, 10_000 * 1e18);
        
        // Bound leverage between 1.1x and 50x
        leverage = bound(leverage, 1.1 * 1e18, 50 * 1e18);

        vm.prank(alice);
        // FIX: Bracket format and 5th argument passed correctly
        posManager.openPosition(address(usdc), marginAmountScaled, leverage, isLong, IPerpsCore.MarginMode.ISOLATED);

        IPerpsCore.Position memory pos = posManager.getPosition(alice, address(usdc));
        
        // Assertions to verify exact recording of random math
        assertTrue(pos.isOpen, "Position failed to open!");
        assertEq(pos.collateral, marginAmountScaled, "Margin mismatch!");
        assertEq(pos.leverage, leverage, "Leverage mismatch!");
        assertEq(pos.isLong, isLong, "Direction mismatch!");
    }
}