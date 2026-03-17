// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CrossChainRouter} from "../../src/cross-chain/CrossChainRouter.sol";
import {MessageReceiver} from "../../src/cross-chain/MessageReceiver.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";

// ==========================================
// UNIFIED TEST SUITE (POLKADOT XCM STUBS)
// ==========================================
contract CrossChainFlowTest is Test {
    CrossChainRouter public sourceRouter;
    MessageReceiver public destReceiver;
    
    // Variables defined here
    address public owner = makeAddr("owner");
    address public trader = makeAddr("trader");
    address public fakeToken = makeAddr("fakeToken");
    address public mockPosMgr = makeAddr("mockPosMgr");

    function setUp() public {
        vm.startPrank(owner);
        sourceRouter = new CrossChainRouter();
        destReceiver = new MessageReceiver(mockPosMgr);
        vm.stopPrank();

        // Trader gets 10 ETH to pay for transaction value
        vm.deal(trader, 10 ether);
    }

    // ==========================================
    // POLKADOT STUB CHECKS
    // ==========================================

    function test_Polkadot_RouterIsDisabled() public view {
        assertFalse(sourceRouter.isCrossChainEnabled());
        assertEq(sourceRouter.disabledReason(), "Chainlink CCIP not available on Polkadot Hub. XCM integration planned.");
    }

    function test_Polkadot_ReceiverIsDisabled() public view {
        assertFalse(destReceiver.isReceiverEnabled());
        assertEq(destReceiver.disabledReason(), "Chainlink CCIP not available on Polkadot Hub. XCM integration planned.");
    }

    function test_Polkadot_XcmRoadmap() public view {
        string memory expectedRoadmap = "Phase 1: Deploy on Polkadot Hub EVM. Phase 2: Integrate XCM precompiles for parachain messaging. Phase 3: Cross-parachain perpetuals with shared liquidity.";
        assertEq(destReceiver.xcmRoadmap(), expectedRoadmap);
    }

    // ==========================================
    // REVERT CHECKS FOR DISABLED FUNCTIONS
    // ==========================================

    function test_RevertWhen_SendingTradeRequestOnPolkadot() public {
        vm.startPrank(trader); // FIXED: Using trader instead of alice
        
        vm.expectRevert(PerpsErrors.InvalidParameter.selector);
        sourceRouter.sendTradeRequest{value: 0.01 ether}(
            1234, 
            fakeToken, // FIXED: Using fakeToken instead of usdc
            true, 
            1000e18, 
            10e18
        );
        
        vm.stopPrank();
    }

    function test_EstimateFeeReturnsZero() public view {
        uint256 fee = sourceRouter.estimateFee(trader, 123456, fakeToken, true, 100e18, 10e18);
        assertEq(fee, 0, "Fee should be 0 on disabled router");
    }

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

    function test_Success_OwnerCanUpdatePosManager() public {
        vm.prank(owner);
        address newMgr = makeAddr("newMgr");
        destReceiver.updatePositionManager(newMgr);
        assertEq(address(destReceiver.positionManager()), newMgr);
    }

    function test_Success_RescueFunds() public {
        // Send ETH to router directly
        vm.deal(address(sourceRouter), 1 ether);
        
        uint256 ownerBalBefore = owner.balance;
        
        vm.prank(owner);
        sourceRouter.rescueFunds(address(0), 0); // parameters ignored in stub
        
        assertEq(owner.balance, ownerBalBefore + 1 ether);
        assertEq(address(sourceRouter).balance, 0);
    }
}