// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SmartAccount} from "../../src/account-abstraction/SmartAccount.sol";
import {AccountFactory} from "../../src/account-abstraction/AccountFactory.sol";
import {NexusPaymaster} from "../../src/account-abstraction/NexusPaymaster.sol";

contract DeployAA is Script {
    function run() public returns (
        SmartAccount implementation, 
        AccountFactory factory, 
        NexusPaymaster paymaster
    ) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address entryPoint = vm.envAddress("ENTRY_POINT_ADDRESS");
        address signer = vm.envAddress("VERIFYING_SIGNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        console.log("--- Starting PRODUCTION AA Deployment on Sepolia ---");

        // 1. Deploy SmartAccount Implementation
        // Constructor: constructor(address _entryPoint)
        implementation = new SmartAccount(entryPoint);
        console.log("1. SmartAccount Logic deployed at:", address(implementation));

        // 2. Deploy AccountFactory
        // Constructor: constructor(address _implementation)
        factory = new AccountFactory(address(implementation));
        console.log("2. AccountFactory deployed at:", address(factory));

        // 3. Deploy NexusPaymaster
        // Constructor: constructor(address _entryPoint, address _verifyingSigner)
        paymaster = new NexusPaymaster(entryPoint, signer);
        console.log("3. NexusPaymaster deployed at:", address(paymaster));

        vm.stopBroadcast();
        console.log("--- AA Deployment Complete! ---");
    }
}