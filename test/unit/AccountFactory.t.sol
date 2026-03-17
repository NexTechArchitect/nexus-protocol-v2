// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AccountFactory} from "../../src/account-abstraction/AccountFactory.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";

// ==========================================
// MOCK SMART ACCOUNT IMPLEMENTATION
// ==========================================
contract MockSmartAccount {
    address public owner;
    bool public isInitialized;

    function initialize(address _owner) external {
        // Prevent re-initialization (Standard practice)
        require(!isInitialized, "Already initialized");
        owner = _owner;
        isInitialized = true;
    }
}

// ==========================================
// TEST SUITE: ACCOUNT FACTORY
// ==========================================
contract AccountFactoryTest is Test {
    AccountFactory public factory;
    MockSmartAccount public implementation;

    address public deployer = makeAddr("deployer");
    address public alice = makeAddr("alice"); // The actual user
    address public bundler = makeAddr("bundler"); // A third party paying gas

    event AccountCreated(address indexed account, address indexed owner);

    function setUp() public {
        vm.startPrank(deployer);
        // 1. Deploy the master implementation logic
        implementation = new MockSmartAccount();
        
        // 2. Deploy the factory, pointing to the implementation
        factory = new AccountFactory(address(implementation));
        vm.stopPrank();
    }

    // ==========================================
    // 1. DEPLOYMENT & CONSTRUCTOR CHECKS
    // ==========================================

    function test_RevertWhen_ConstructorZeroAddress() public {
        vm.expectRevert(PerpsErrors.InvalidAddress.selector);
        new AccountFactory(address(0));
    }

    function test_RevertWhen_CreateAccountWithZeroOwner() public {
        vm.expectRevert(PerpsErrors.InvalidOwner.selector);
        factory.createAccount(address(0), 123);
    }

    // ==========================================
    // 2. DETERMINISTIC ADDRESS PREDICTION
    // ==========================================

    function test_Success_AddressPrediction() public {
        uint256 salt = 12345;
        
        // Frontend predicts the address off-chain
        address predicted = factory.getAddress(alice, salt);
        assertTrue(predicted != address(0));

        // Actual deployment happens
        address actualDeployed = address(factory.createAccount(alice, salt));

        // Must match exactly
        assertEq(actualDeployed, predicted, "CREATE2 Prediction failed");
    }

    // ==========================================
    // 3. CORE DEPLOYMENT & INITIALIZATION LOGIC
    // ==========================================

    function test_Success_DeployAndInitializeAtomic() public {
        uint256 salt = 999;
        address predicted = factory.getAddress(alice, salt);

        // We expect the factory to emit the event
        vm.expectEmit(true, true, false, false, address(factory));
        emit AccountCreated(predicted, alice);

        // Action
        MockSmartAccount proxy = MockSmartAccount(address(factory.createAccount(alice, salt)));

        // Verification: Proxy is successfully initialized with Alice as owner
        assertTrue(proxy.isInitialized(), "Proxy was not initialized");
        assertEq(proxy.owner(), alice, "Owner was not set correctly");
    }

    // ==========================================
    // 4. IDEMPOTENT DEPLOYMENT (Lazy Deploy Check)
    // ==========================================

    function test_Success_IdempotentDeploymentSkipsRevert() public {
        uint256 salt = 777;

        // First Deployment (Will cost gas and deploy)
        MockSmartAccount firstProxy = MockSmartAccount(address(factory.createAccount(alice, salt)));
        
        // Second Deployment attempt with exact same owner and salt
        // EXPECTATION: It should NOT revert. It should just silently return the existing address.
        MockSmartAccount secondProxy = MockSmartAccount(address(factory.createAccount(alice, salt)));

        assertEq(address(firstProxy), address(secondProxy), "Should return the existing proxy address");
        
        // Ensure it didn't try to initialize again (the mock would revert if it did)
        assertTrue(secondProxy.isInitialized());
    }

    // ==========================================
    // 5. SECURITY: BUNDLER FRONT-RUNNING (Feature, not bug)
    // ==========================================

    function test_Success_AnyoneCanDeployForOwner() public {
        uint256 salt = 101;
        
        // A random bundler or hacker tries to front-run Alice's deployment
        vm.prank(bundler);
        MockSmartAccount proxy = MockSmartAccount(address(factory.createAccount(alice, salt)));

        // Verification: Even if someone else paid the gas and called deploy, 
        // ALICE is still securely the owner. No front-running vulnerability!
        assertEq(proxy.owner(), alice, "Alice must be the owner, not the bundler");
    }
}