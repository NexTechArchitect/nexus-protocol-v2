// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CrossChainRouter} from "../../src/cross-chain/CrossChainRouter.sol";
import {MessageReceiver} from "../../src/cross-chain/MessageReceiver.sol";

contract DeployCrossChain is Script {
    function run() public returns (
        CrossChainRouter crossChainRouter,
        MessageReceiver messageReceiver
    ) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address posManagerAddress = vm.envAddress("POSITION_MANAGER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        console.log("--- Deploying CrossChain Stubs (CCIP not on Polkadot Hub) ---");

        crossChainRouter = new CrossChainRouter();
        console.log("1. CrossChainRouter stub:", address(crossChainRouter));

        messageReceiver = new MessageReceiver(posManagerAddress);
        console.log("2. MessageReceiver stub:", address(messageReceiver));

        vm.stopBroadcast();
        console.log("CROSS_CHAIN_ROUTER_ADDRESS=", address(crossChainRouter));
        console.log("MESSAGE_RECEIVER_ADDRESS=", address(messageReceiver));
    }
}
