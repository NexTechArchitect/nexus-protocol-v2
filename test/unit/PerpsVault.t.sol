// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ==========================================
// MOCK ERC20 (Like USDC with 6 decimals)
// ==========================================
contract MockUSDC is ERC20 {
    constructor() ERC20("USDC", "USDC") {}
    
    function decimals() public pure override returns (uint8) { 
        return 6; 
    }
    
    function mint(address to, uint256 amount) external { 
        _mint(to, amount); 
    }
}

// ==========================================
// FULL VAULT TEST SUITE
// ==========================================
contract PerpsVaultTest is Test {
    PerpsVault public vault;
    MockUSDC public usdc;

    address public owner = makeAddr("owner");
    address public mockPosMgr = makeAddr("mockPosMgr");
    
    address public lp = makeAddr("lp");
    address public trader = makeAddr("trader");
    address public hacker = makeAddr("hacker");

    uint256 public constant DECIMALS_SCALAR = 1e12; // 18 - 6 = 12

    function setUp() public {
        usdc = new MockUSDC();
        
        vm.startPrank(owner);
        vault = new PerpsVault(address(usdc));
        vault.setPositionManager(mockPosMgr);
        vm.stopPrank();

        usdc.mint(lp, 1_000_000 * 1e6); // LP has 1 million USDC
        usdc.mint(trader, 10_000 * 1e6); // Trader has 10k USDC
    }

    // ==========================================
    // 1. STANDARD DEPOSIT/WITHDRAW CHECKS
    // ==========================================

    function test_Success_NormalDepositAndWithdraw() public {
        vm.startPrank(trader);
        usdc.approve(address(vault), 100 * 1e6);
        
        vault.deposit(100 * 1e6);
        assertEq(vault.getTraderCollateral(trader), 100 * 1e18);

        vault.withdraw(100 * 1e18);
        assertEq(usdc.balanceOf(trader), 10_000 * 1e6);
        vm.stopPrank();
    }

    // ==========================================
    // ATTACK 1  HAIRCUT MITIGATION
    // ==========================================

    function test_Attack_LpEscapesAndLocksTraderProfit() public {
        // STEP 1: LP provides liquidity
        vm.startPrank(lp);
        usdc.approve(address(vault), 100_000 * 1e6);
        vault.addLiquidity(100_000 * 1e6);
        vm.stopPrank();

        // STEP 2: Trader deposits and opens a position
        vm.startPrank(trader);
        usdc.approve(address(vault), 1000 * 1e6);
        vault.deposit(1000 * 1e6);
        vm.stopPrank();

        vm.prank(mockPosMgr);
        vault.lockCollateral(trader, 1000 * 1e18);

        // STEP 3: LP front-runs and withdraws all THEIR liquidity
        vm.startPrank(lp);
        uint256 lpShares = vault.getLpShares(lp);
        vault.removeLiquidity(lpShares); 
        vm.stopPrank();

        // STEP 4: The Trader's transaction executes
        // We track EXACTLY how much physical USDC is in the vault before settlement
        uint256 vaultPhysicalBalance = usdc.balanceOf(address(vault));
        uint256 expectedClampedPayout = vaultPhysicalBalance * DECIMALS_SCALAR;

        vm.prank(mockPosMgr);
        // Settle Trade: 1000 locked, 50k Profit.
        // It should clamp to whatever physical balance is left
        vault.settleTrade(trader, 1000 * 1e18, 50_000 * 1e18); 

        // Verify the trader got the correct haircut
        assertEq(
            vault.getTraderCollateral(trader), 
            expectedClampedPayout, 
            "Trader should get exactly the remaining physical vault balance scaled up"
        );
    }

    // ==========================================
    // ATTACK 2  DUST SWEEPING
    // ==========================================

    function test_Bug_WithdrawalDustSweeping() public {
        vm.startPrank(trader);
        usdc.approve(address(vault), 100 * 1e6);
        vault.deposit(100 * 1e6);

        // Try to withdraw 1 physical unit + 1 wei of dust
        uint256 amountToWithdraw = 1e18 + (DECIMALS_SCALAR - 1); 

        // Should revert cleanly
        vm.expectRevert(PerpsErrors.InvalidAmount.selector);
        vault.withdraw(amountToWithdraw);

        vm.stopPrank();
    }

    // ==========================================
    // 3. ADMIN / SECURITY CHECKS
    // ==========================================

    function test_RevertWhen_NonManagerLocksCollateral() public {
        vm.prank(hacker);
        vm.expectRevert(PerpsErrors.Unauthorized.selector);
        vault.lockCollateral(trader, 100e18);
    }

    function test_RevertWhen_DepositZeroAmount() public {
        vm.startPrank(trader);
        vm.expectRevert(PerpsErrors.ZeroAmount.selector);
        vault.deposit(0);
        vm.stopPrank();
    }
}