// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SmartAccount} from "../../src/account-abstraction/SmartAccount.sol";
import {AccountFactory} from "../../src/account-abstraction/AccountFactory.sol";
import {PositionManager} from "../../src/core/PositionManager.sol";
import {PerpsVault} from "../../src/core/PerpsVault.sol";
import {PriceOracle} from "../../src/oracles/PriceOracle.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPerpsCore} from "../../src/interfaces/IPerpsCore.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ==========================================
// MOCKS FOR INTEGRATION
// ==========================================
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { _mint(msg.sender, 10_000_000 * 1e6); }
    function decimals() public pure override returns (uint8) { return 6; }
}

contract MockAggregator {
    function decimals() external pure returns (uint8) { return 8; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, 3000 * 1e8, block.timestamp, 1, 1); // $3000 ETH
    }
}

// ==========================================
// INTEGRATION TEST SUITE
// ==========================================
contract AAFlowIntegrationTest is Test {
    using SafeERC20 for MockUSDC; // ADDED: Enable safe transfer methods

    // Core Contracts
    PositionManager public posManager;
    PerpsVault public vault;
    PriceOracle public oracle;
    MockUSDC public usdc;
    MockAggregator public ethFeed;

    // Account Abstraction Infrastructure
    AccountFactory public factory;
    SmartAccount public implementation;
    address public entryPoint = makeAddr("entryPoint");

    // Actors
    address public owner = makeAddr("owner");
    uint256 public alicePrivateKey = 0xA11CE;
    address public alice = vm.addr(alicePrivateKey); // Real signer
    
    uint256 public constant MAX_LEVERAGE = 50 * 1e18;

    function setUp() public {
        vm.startPrank(owner);
        
        // 1. Core Setup
        usdc = new MockUSDC();
        ethFeed = new MockAggregator();
        
        oracle = new PriceOracle();
        oracle.setAsset(address(usdc), address(ethFeed), 3600);

        vault = new PerpsVault(address(usdc));
        posManager = new PositionManager(address(vault), address(oracle), MAX_LEVERAGE);
        
        vault.setPositionManager(address(posManager));
        posManager.addAsset(address(usdc));

        // 2. AA Setup
        implementation = new SmartAccount(entryPoint);
        factory = new AccountFactory(address(implementation));

        vm.stopPrank();
    }

    /**
     * @notice Tests the power of AA: 
     * Deploy Wallet -> Approve -> Deposit -> Trade (ALL IN ONE FLOW)
     */
    function test_Integration_AABatchTradeLifecycle() public {
        // 1. Predict Alice's Smart Account address off-chain
        uint256 salt = 123;
        address predictedWallet = factory.getAddress(alice, salt);
        SmartAccount aliceWallet = SmartAccount(payable(predictedWallet));

        // Let's assume Alice bought $5000 USDC on an exchange and sent it directly to her predicted AA wallet
        uint256 marginPhysical = 5000 * 1e6; 
        vm.prank(owner);
        // FIX: Using safeTransfer removes the compiler warning
        usdc.safeTransfer(predictedWallet, marginPhysical);

        // 2. ENTRY POINT ACTION: Deploy Alice's wallet
        // In a real 4337 flow, the EntryPoint calls the factory via `initCode`. We simulate that here.
        factory.createAccount(alice, salt);
        
        // Ensure it's correctly owned by Alice
        assertEq(aliceWallet.owner(), alice);

        // 3. PREPARE THE BATCH CALL
        // Alice wants to open a 10x Long position using her $5000.
        // Without AA, she'd need 3 transactions. With AA, she sends an array of calls!
        
        address[] memory dests = new address[](3);
        uint256[] memory values = new uint256[](3);
        bytes[] memory callData = new bytes[](3);

        uint256 marginScaled = 5000 * 1e18;
        uint256 leverage = 10 * 1e18;

        // Call 1: Approve Vault to spend USDC
        dests[0] = address(usdc);
        values[0] = 0;
        callData[0] = abi.encodeWithSelector(usdc.approve.selector, address(vault), marginPhysical);

        // Call 2: Deposit physical USDC into Vault
        dests[1] = address(vault);
        values[1] = 0;
        callData[1] = abi.encodeWithSelector(vault.deposit.selector, marginPhysical);

        // Call 3: Open Position on PositionManager
        dests[2] = address(posManager);
        values[2] = 0;
        // FIX: Added IPerpsCore.MarginMode.ISOLATED as the 5th argument to match the new signature
        callData[2] = abi.encodeWithSelector(posManager.openPosition.selector, address(usdc), marginScaled, leverage, true, IPerpsCore.MarginMode.ISOLATED);

        // 4. EXECUTE BATCH VIA ENTRY POINT
        vm.prank(entryPoint);
        aliceWallet.executeBatch(dests, values, callData);

        // 5. AUDIT & VERIFY
        // Did the batch execute successfully?
        
        // A. Token balances should be correctly routed
        assertEq(usdc.balanceOf(predictedWallet), 0, "Wallet should have deposited all USDC");
        assertEq(usdc.balanceOf(address(vault)), marginPhysical, "Vault didn't receive USDC");

        // B. Position should be officially open
        IPerpsCore.Position memory pos = posManager.getPosition(predictedWallet, address(usdc));
        assertTrue(pos.isOpen, "Trade did not open!");
        assertEq(pos.collateral, marginScaled, "Margin mismatch");
        assertEq(pos.leverage, leverage, "Leverage mismatch");
    }

    /**
     * @notice Security test to ensure standard users can't hijack someone's AA wallet 
     * to drain their deposited protocol collateral.
     */
    function test_Integration_Security_AABlockUnauthorizedExecution() public {
        uint256 salt = 999;
        address predictedWallet = address(factory.createAccount(alice, salt));
        SmartAccount aliceWallet = SmartAccount(payable(predictedWallet));

        // A hacker tries to execute a withdrawal call on Alice's wallet
        address hacker = makeAddr("hacker");
        
        bytes memory maliciousCall = abi.encodeWithSignature("transfer(address,uint256)", hacker, 1000e6);
        
        vm.startPrank(hacker);
        
        // FIX: Using raw ABI Signature instead of Library Selector. 
        // This is foolproof and doesn't require PerpsErrors.sol to be imported in the test.
        vm.expectRevert(abi.encodeWithSignature("Unauthorized()"));
        
        // Only the EntryPoint (after verifying signature) or Alice herself can call this
        aliceWallet.execute(address(usdc), 0, maliciousCall);
        
        vm.stopPrank();
    }
}