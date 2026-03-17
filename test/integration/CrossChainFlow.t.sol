// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CrossChainRouter} from "../../src/cross-chain/CrossChainRouter.sol";
import {MessageReceiver} from "../../src/cross-chain/MessageReceiver.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {PriceOracle} from "../../src/oracles/PriceOracle.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

// ==========================================
// INTEGRATION TEST SUITE (POLKADOT HUB)
// ==========================================
contract CrossChainIntegrationFlowTest is Test {
    PositionManager public posManager;
    PerpsVault public vault;
    PriceOracle public oracle;
    MessageReceiver public destReceiver;
    CrossChainRouter public sourceRouter;
    MockUSDC public usdc;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice"); 
    
    uint256 public constant MAX_LEVERAGE = 50 * 1e18;

    function setUp() public {
        vm.startPrank(owner);
        
        // 1. Deploy Mocks & Tokens
        usdc = new MockUSDC(10_000_000);

        // 2. Deploy Hub Infrastructure
        oracle = new PriceOracle();
        vault = new PerpsVault(address(usdc));
        posManager = new PositionManager(address(vault), address(oracle), MAX_LEVERAGE);
        
        posManager.addAsset(address(usdc));
        vault.setPositionManager(address(posManager));

        // 3. Deploy Polkadot XCM Stubs
        destReceiver = new MessageReceiver(address(posManager));
        sourceRouter = new CrossChainRouter();
        
        vm.stopPrank();

        // SOLVED: Give Alice ETH so she doesn't revert without data when sending value
        vm.deal(alice, 10 ether);
    }

    /**
     * @notice Tests that Cross-Chain is properly disabled for the Polkadot Hub Hackathon version.
     */
    function test_PolkadotStub_CrossChainDisabled() public view {
        assertFalse(sourceRouter.isCrossChainEnabled(), "Router should be disabled");
        assertFalse(destReceiver.isReceiverEnabled(), "Receiver should be disabled");
        
        assertEq(sourceRouter.disabledReason(), "Chainlink CCIP not available on Polkadot Hub. XCM integration planned.");
    }

    /**
     * @notice Tests that attempting a trade request reverts securely.
     */
    function test_RevertWhen_SendingTradeRequestOnPolkadot() public {
        vm.startPrank(alice);
        
        vm.expectRevert(PerpsErrors.InvalidParameter.selector);
        sourceRouter.sendTradeRequest{value: 0.01 ether}(
            1234, 
            address(usdc), 
            true, 
            1000e18, 
            10e18
        );
        
        vm.stopPrank();
    }
}