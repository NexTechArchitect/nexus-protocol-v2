// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {LiquidationEngine} from "../../src/core/LiquidationEngine.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

contract DeployCore is Script {
    function run() public returns (
        MockUSDC usdc,
        PerpsVault vault,
        PositionManager posManager,
        LiquidationEngine engine
    ) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address oracleAddress = vm.envAddress("PRICE_ORACLE_ADDRESS");
        address wethAddress   = vm.envAddress("WETH_ADDRESS");
        address wbtcAddress   = vm.envAddress("WBTC_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        console.log("--- Starting Polkadot Hub Core Deployment ---");

        usdc = new MockUSDC(1_000_000);
        console.log("1. MockUSDC deployed at:", address(usdc));

        vault = new PerpsVault(address(usdc));
        console.log("2. PerpsVault deployed at:", address(vault));

        uint256 maxLeverage = 50 * 1e18;
        posManager = new PositionManager(address(vault), oracleAddress, maxLeverage);
        console.log("3. PositionManager deployed at:", address(posManager));

        vault.setPositionManager(address(posManager));
        posManager.addAsset(wethAddress);
        posManager.addAsset(wbtcAddress);
        console.log("4. Vault linked & assets whitelisted!");

        engine = new LiquidationEngine(address(posManager));
        console.log("5. LiquidationEngine deployed at:", address(engine));

        usdc.approve(address(vault), 100_000 * 1e6);
        vault.addLiquidity(100_000 * 1e6);
        console.log("6. Initial liquidity: 100,000 USDC");

        vm.stopBroadcast();
        console.log("MOCK_USDC_ADDRESS=", address(usdc));
        console.log("PERPS_VAULT_ADDRESS=", address(vault));
        console.log("POSITION_MANAGER_ADDRESS=", address(posManager));
        console.log("LIQUIDATION_ENGINE_ADDRESS=", address(engine));
    }
}
