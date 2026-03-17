// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PerpsVault} from "../../../src/core/PerpsVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VaultHandler is Test {
    PerpsVault public vault;
    ERC20 public usdc;

    // Ghost variable to track EXACTLY how much physical USDC should be in the Vault
    uint256 public totalGhostDeposits; 
    
    // Array of mock users
    address[] public actors;

    constructor(PerpsVault _vault, ERC20 _usdc) {
        vault = _vault;
        usdc = _usdc;
        
        // Seed some random actors
        actors.push(makeAddr("alice"));
        actors.push(makeAddr("bob"));
        actors.push(makeAddr("charlie"));
        actors.push(makeAddr("david"));
    }

    // ==========================================
    // HELPER FUNCTION (Yehi miss ho gaya tha)
    // ==========================================
    function getActorsLength() public view returns (uint256) {
        return actors.length;
    }

    /**
     * @notice Fuzzer calls this with random actorIndex and amount
     */
    function deposit(uint256 actorIndex, uint256 amount) public {
        address actor = actors[actorIndex % actors.length];
        
        // Bound deposit between $1 and $100,000 to keep math realistic
        amount = bound(amount, 1e6, 100_000 * 1e6); 

        // Mint USDC to the actor
        deal(address(usdc), actor, usdc.balanceOf(actor) + amount);
        
        vm.startPrank(actor);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        // Update our ghost tracker
        totalGhostDeposits += amount;
    }

    /**
     * @notice Fuzzer calls this to randomly withdraw funds
     */
    function withdraw(uint256 actorIndex, uint256 amount) public {
        address actor = actors[actorIndex % actors.length];
        
        // Check how much free collateral the user actually has
        uint256 maxWithdrawScaled = vault.getTraderCollateral(actor);
        
        // Skip if user has nothing to withdraw
        if (maxWithdrawScaled == 0) return; 

        // Convert scaled 18 decimal amount to 6 decimal physical USDC
        uint256 maxWithdrawPhysical = maxWithdrawScaled / 1e12;
        if (maxWithdrawPhysical == 0) return;

        // Bound withdrawal up to their maximum allowed amount
        amount = bound(amount, 1, maxWithdrawPhysical);

        vm.prank(actor);
        vault.withdraw(amount * 1e12); // Vault expects scaled amount

        // Reduce ghost tracker
        totalGhostDeposits -= amount;
    }
}