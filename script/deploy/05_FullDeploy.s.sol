// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PriceKeeper} from "../../src/mocks/PriceKeeper.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockWETH} from "../../src/mocks/MockWETH.sol";
import {MockWBTC} from "../../src/mocks/MockWBTC.sol";

contract FullDeploy is Script {
    int256 constant CURRENT_ETH_PRICE = 300000000000;
    int256 constant CURRENT_BTC_PRICE = 9500000000000;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address keeperAddress = vm.envAddress("PRICE_KEEPER_ADDRESS");
        address usdcAddress   = vm.envAddress("MOCK_USDC_ADDRESS");
        address wethAddress   = vm.envAddress("WETH_ADDRESS");
        address wbtcAddress   = vm.envAddress("WBTC_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        console.log("--- Final Configuration ---");

        PriceKeeper keeper = PriceKeeper(keeperAddress);
        keeper.updateAllPrices(CURRENT_ETH_PRICE, CURRENT_BTC_PRICE);
        console.log("1. Prices set: ETH $3000, BTC $95000");

        MockUSDC(usdcAddress).mint(msg.sender, 50_000 * 1e6);
        MockWETH(wethAddress).mint(msg.sender, 10 * 1e18);
        MockWBTC(wbtcAddress).mint(msg.sender, 1 * 1e8);
        console.log("2. Test tokens minted to deployer");

        vm.stopBroadcast();
        console.log("NEXUS PERPS ON POLKADOT HUB IS LIVE!");
    }
}
