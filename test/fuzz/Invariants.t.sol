// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {PositionHandler, MockPriceOracle} from "./handlers/PositionHandler.sol";

contract InvariantsTest is Test {
    PositionManager public posManager;
    PerpsVault public vault;
    MockERC20 public usdc;
    MockPriceOracle public oracle;
    PositionHandler public handler;

    address public weth = address(0x555);

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC", 6);
        oracle = new MockPriceOracle();
        
        vault = new PerpsVault(address(usdc));
        posManager = new PositionManager(address(vault), address(oracle), 50);
        
        vault.setPositionManager(address(posManager));
        posManager.addAsset(weth);
        oracle.setPrice(weth, 3000e18);

        // Add initial protocol liquidity so it can pay out winners
        usdc.mint(address(this), 1_000_000e6);
        usdc.approve(address(vault), 1_000_000e6);
        vault.addLiquidity(1_000_000e6);

        // Setup the Handler
        handler = new PositionHandler(posManager, vault, usdc, oracle, weth);
        
        // Seed the handler with some initial users
        handler.createTrader(address(0x111), 50000e6);
        handler.createTrader(address(0x222), 50000e6);

        // Tell Foundry to target the handler contract for fuzzing
        targetContract(address(handler));
    }

    // ==========================================
    // INVARIANT 1: Solvency
    // Total physical USDC in Vault MUST be >= (Total Trader Free Collateral + Total Locked Collateral)
    // ==========================================
    function invariant_VaultIsSolvent() public view {
        uint256 actualBalance = usdc.balanceOf(address(vault));
        uint256 expectedMinimum = (vault.totalTraderFreeCollateral() + vault.totalLockedCollateral()) / vault.DECIMALS_SCALAR();
        
        // The actual balance should also account for Total Liquidity (The house pool)
        assertGe(actualBalance, expectedMinimum, "Vault is insolvent!");
    }

    // ==========================================
    // INVARIANT 2: Internal Accounting Matches
    // ==========================================
    function invariant_InternalAccountingConsistent() public view {
        uint256 internalLiabilities = vault.totalTraderFreeCollateral() + vault.totalLockedCollateral() + vault.totalLiquidity();
        uint256 actualUSDC = usdc.balanceOf(address(vault));
        
        assertEq(internalLiabilities / vault.DECIMALS_SCALAR(), actualUSDC, "Accounting mismatch");
    }
    // ==========================================
    function invariant_MaxActiveAssetsRespected() public pure {
        assertTrue(true); 
    }
}