// test/fuzz/handlers/PositionHandler.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PositionManager} from "../../../src/core/PositionManager.sol";
import {PerpsVault} from "../../../src/core/PerpsVault.sol";
import {MockERC20} from "../../mocks/MockERC20.sol";
import {MockChainlink} from "../../mocks/MockChainlink.sol";
import {IPerpsCore} from "../../../src/interfaces/IPerpsCore.sol";
// 🔥 FIX: Import added here
import {IPriceOracle} from "../../../src/interfaces/IPriceOracle.sol";

contract PositionHandler is Test {
    PositionManager public posManager;
    PerpsVault public vault;
    MockERC20 public usdc;
    MockPriceOracle public oracle;

    address public weth;
    address[] public actors;

    // Ghost Variables for invariant checking
    uint256 public ghost_totalPositionsOpened;
    uint256 public ghost_totalPositionsClosed;
    uint256 public ghost_totalLiquidations;

    constructor(
        PositionManager _posManager,
        PerpsVault _vault,
        MockERC20 _usdc,
        MockPriceOracle _oracle,
        address _weth
    ) {
        posManager = _posManager;
        vault = _vault;
        usdc = _usdc;
        oracle = _oracle;
        weth = _weth;
    }

    // A helper to pick a random actor from our predefined list
    function _pickActor(uint256 seed) internal view returns (address) {
        if (actors.length == 0) return address(0);
        return actors[seed % actors.length];
    }

    // Function for fuzzer to add new users to the system
    function createTrader(address user, uint256 initialDeposit) public {
        vm.assume(user != address(0) && user != address(this));
        
        // Bound the initial deposit to something reasonable (100 USDC to 1M USDC)
        initialDeposit = bound(initialDeposit, 100e6, 1_000_000e6);
        
        // Only add if not already in the system
        for(uint i=0; i<actors.length; i++) {
            if(actors[i] == user) return;
        }

        actors.push(user);
        usdc.mint(user, initialDeposit);
        
        vm.startPrank(user);
        usdc.approve(address(vault), initialDeposit);
        vault.deposit(initialDeposit);
        vm.stopPrank();
    }

    // Fuzzer opens a position
    function openRandomPosition(uint256 actorSeed, uint256 marginSeed, uint256 leverageSeed, bool isLong) public {
        address trader = _pickActor(actorSeed);
        if (trader == address(0)) return;

        // Check if trader already has an open position
        if (posManager.getPosition(trader, weth).isOpen) return;

        uint256 availableCollateral = vault.getTraderCollateral(trader);
        if (availableCollateral < 10e6) return; // Need at least 10 USDC

        // Bound margin between 10 USDC and their max available
        uint256 margin = bound(marginSeed, 10e6, availableCollateral);
        
        // Bound leverage between 1x and maxLeverage (50x)
        uint256 leverage = bound(leverageSeed, 1, posManager.maxLeverage());

        vm.prank(trader);
        posManager.openPosition(weth, margin, leverage, isLong, IPerpsCore.MarginMode.ISOLATED);
        
        ghost_totalPositionsOpened++;
    }

    // Fuzzer changes the price of the asset
    function changeOraclePrice(uint256 newPriceSeed) public {
        // Bound price to realistically fluctuate between $1,000 and $10,000
        uint256 newPrice = bound(newPriceSeed, 1000e18, 10000e18);
        oracle.setPrice(weth, newPrice);
    }

    // Fuzzer tries to liquidate someone
    function tryLiquidation(uint256 actorSeed, uint256 liquidatorSeed) public {
        address trader = _pickActor(actorSeed);
        address liquidator = _pickActor(liquidatorSeed);
        if (trader == address(0) || liquidator == address(0) || trader == liquidator) return;

        // Only proceed if position is actually liquidatable to avoid unnecessary reverts in fuzz logs
        IPerpsCore.Position memory pos = posManager.getPosition(trader, weth);
        if (!pos.isOpen) return;

        // Note: The actual liquidation logic happens inside PositionManager.
        // We just wrap it in a try-catch to keep the fuzz run clean if it fails.
        vm.prank(liquidator);
        try posManager.liquidate(trader, weth) {
            ghost_totalLiquidations++;
        } catch {
        }
    }
}

contract MockPriceOracle is IPriceOracle {
    mapping(address => uint256) public prices;
    function setPrice(address token, uint256 price) external { prices[token] = price; }
    function getPrice(address token) external view returns (uint256) { return prices[token]; }
}