// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PriceOracle} from "../../src/oracles/PriceOracle.sol";
import {MockAggregatorV3} from "../../src/mocks/MockAggregatorV3.sol";
import {MockWETH} from "../../src/mocks/MockWETH.sol";
import {MockWBTC} from "../../src/mocks/MockWBTC.sol";
import {PriceKeeper} from "../../src/mocks/PriceKeeper.sol";

contract DeployOracles is Script {
    int256 constant INITIAL_ETH_PRICE = 300000000000;
    int256 constant INITIAL_BTC_PRICE = 9500000000000;

    function run() public returns (
        PriceOracle oracle,
        MockAggregatorV3 ethFeed,
        MockAggregatorV3 btcFeed,
        MockWETH weth,
        MockWBTC wbtc,
        PriceKeeper keeper
    ) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        console.log("--- Starting Polkadot Hub Oracle Deployment ---");

        weth = new MockWETH(1000);
        wbtc = new MockWBTC(100);
        console.log("1. MockWETH deployed at:", address(weth));
        console.log("2. MockWBTC deployed at:", address(wbtc));

        ethFeed = new MockAggregatorV3("ETH / USD", 8, INITIAL_ETH_PRICE);
        btcFeed = new MockAggregatorV3("BTC / USD", 8, INITIAL_BTC_PRICE);
        console.log("3. ETH/USD MockFeed deployed at:", address(ethFeed));
        console.log("4. BTC/USD MockFeed deployed at:", address(btcFeed));

        oracle = new PriceOracle();
        console.log("5. PriceOracle deployed at:", address(oracle));

        oracle.setAsset(address(weth), address(ethFeed), 86400);
        oracle.setAsset(address(wbtc), address(btcFeed), 86400);
        console.log("6. Feeds linked!");

        keeper = new PriceKeeper(address(ethFeed), address(btcFeed));
        console.log("7. PriceKeeper deployed at:", address(keeper));

        ethFeed.transferOwnership(address(keeper));
        btcFeed.transferOwnership(address(keeper));
        console.log("8. Feed ownership to PriceKeeper!");

        vm.stopBroadcast();
        console.log("WETH_ADDRESS=", address(weth));
        console.log("WBTC_ADDRESS=", address(wbtc));
        console.log("PRICE_ORACLE_ADDRESS=", address(oracle));
        console.log("PRICE_KEEPER_ADDRESS=", address(keeper));
    }
}
