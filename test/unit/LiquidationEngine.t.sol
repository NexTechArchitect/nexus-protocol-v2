// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {LiquidationEngine} from "../../src/core/LiquidationEngine.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";
import {IPerpsCore} from "../../src/interfaces/IPerpsCore.sol";

// ==========================================
// DUMMY CONTRACTS FOR MOCKING
// ==========================================
contract DummyAsset {
    mapping(address => uint256) public balances;
    
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
    
    function setBalance(address account, uint256 amount) external {
        balances[account] = amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) { 
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        return true; 
    }
}

contract DummyVault {
    address public immutable ASSET;
    bool public isPaused;
    mapping(address => uint256) public collateral;

    constructor(address _asset) { ASSET = _asset; }
    
    function getTraderCollateral(address trader) external view returns (uint256) { return collateral[trader]; }
    
    function setCollateral(address trader, uint256 amount) external {
        collateral[trader] = amount;
    }

    function withdraw(uint256 amount) external {
        require(!isPaused, "Vault is paused");
        require(collateral[msg.sender] >= amount, "Not enough collateral");
        collateral[msg.sender] -= amount;
    }

    function paused() external view returns (bool) { return isPaused; }
    function setPaused(bool _paused) external { isPaused = _paused; }
}

contract DummyPosMgr {
    address public immutable VAULT;
    bool public isPaused;
    
    constructor(address _vault) { VAULT = _vault; }
    
    function getPosition(address, address) external pure returns (IPerpsCore.Position memory) {
        // FIX: Added 7th argument for MarginMode
        return IPerpsCore.Position(0, 0, 0, true, false, false, IPerpsCore.MarginMode.ISOLATED);
    }
    
    function liquidate(address, address) external {
        // Dummy execution
    }

    function paused() external view returns (bool) { return isPaused; }
    function setPaused(bool _paused) external { isPaused = _paused; }
}

// ==========================================
// FULL TEST SUITE
// ==========================================
contract LiquidationEngineTest is Test {
    LiquidationEngine public engine;

    DummyAsset public mockAsset;
    DummyVault public mockVault;
    DummyPosMgr public mockPosMgr;

    address public owner = makeAddr("owner");
    address public keeper = makeAddr("keeper");
    address public hacker = makeAddr("hacker");
    
    address public trader1 = makeAddr("trader1");
    address public trader2 = makeAddr("trader2");

    event RewardsClaimed(address indexed keeper, uint256 amount);
    event BatchLiquidationExecuted(uint256 totalAttempted, uint256 totalSuccessful);

    function setUp() public {
        mockAsset = new DummyAsset();
        mockVault = new DummyVault(address(mockAsset));
        mockPosMgr = new DummyPosMgr(address(mockVault));

        vm.prank(owner);
        engine = new LiquidationEngine(address(mockPosMgr));
    }

    // ==========================================
    // 1. CONSTRUCTOR & ADMIN CHECKS
    // ==========================================

    function test_RevertWhen_ConstructorZeroAddress() public {
        vm.expectRevert(PerpsErrors.InvalidAddress.selector);
        new LiquidationEngine(address(0));
    }

    function test_Success_SetMaxBatchSize() public {
        vm.prank(owner);
        engine.setMaxBatchSize(50);
        assertEq(engine.getMaxBatchSize(), 50);
    }

    function test_RevertWhen_SetMaxBatchSizeZero() public {
        vm.prank(owner);
        vm.expectRevert(PerpsErrors.ZeroAmount.selector);
        engine.setMaxBatchSize(0);
    }

    function test_RevertWhen_NonOwnerSetsBatchSize() public {
        vm.prank(hacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", hacker));
        engine.setMaxBatchSize(50);
    }

    // ==========================================
    // 2. VIEW FUNCTIONS
    // ==========================================

    function test_Success_CanLiquidateStatus() public {
        // Both unpaused
        assertTrue(engine.canLiquidate());

        // Pause Vault
        mockVault.setPaused(true);
        assertFalse(engine.canLiquidate());

        // Unpause Vault, Pause PosMgr
        mockVault.setPaused(false);
        mockPosMgr.setPaused(true);
        assertFalse(engine.canLiquidate());
    }

    function test_Success_GetPendingRewards() public {
        mockVault.setCollateral(address(engine), 100e18);
        assertEq(engine.getPendingRewards(), 100e18);
    }

    // ==========================================
    // 3. BATCH LIQUIDATION LOGIC
    // ==========================================

    function test_RevertWhen_BatchArraysMismatch() public {
        address[] memory traders = new address[](2);
        address[] memory tokens = new address[](1); // Mismatch

        vm.expectRevert(PerpsErrors.InvalidParameter.selector);
        engine.batchLiquidate(traders, tokens);
    }

    function test_RevertWhen_BatchExceedsMaxLimit() public {
        uint256 maxSize = engine.getMaxBatchSize();
        
        // Create arrays larger than maxBatchSize
        address[] memory traders = new address[](maxSize + 1);
        address[] memory tokens = new address[](maxSize + 1);

        vm.expectRevert(PerpsErrors.InvalidBatchSize.selector);
        engine.batchLiquidate(traders, tokens);
    }

    function test_Success_BatchSkipsClosedPositions() public {
        address[] memory traders = new address[](2);
        address[] memory tokens = new address[](2);
        traders[0] = trader1; tokens[0] = address(mockAsset);
        traders[1] = trader2; tokens[1] = address(mockAsset);

        // FIX: Added 7th argument for MarginMode
        IPerpsCore.Position memory openPos = IPerpsCore.Position(100e18, 10e18, 1000e18, true, true, false, IPerpsCore.MarginMode.ISOLATED);
        vm.mockCall(address(mockPosMgr), abi.encodeWithSignature("getPosition(address,address)", trader1, tokens[0]), abi.encode(openPos));

        // FIX: Added 7th argument for MarginMode
        IPerpsCore.Position memory closedPos = IPerpsCore.Position(0, 0, 0, true, false, false, IPerpsCore.MarginMode.ISOLATED);
        vm.mockCall(address(mockPosMgr), abi.encodeWithSignature("getPosition(address,address)", trader2, tokens[1]), abi.encode(closedPos));

        vm.expectEmit(false, false, false, true, address(engine));
        emit BatchLiquidationExecuted(2, 1); // 2 attempted, 1 successful

        engine.batchLiquidate(traders, tokens);
    }

    function test_Success_BatchContinuesOnLiquidateRevert() public {
        address[] memory traders = new address[](2);
        address[] memory tokens = new address[](2);
        traders[0] = trader1; tokens[0] = address(mockAsset);
        traders[1] = trader2; tokens[1] = address(mockAsset);

        // FIX: Added 7th argument for MarginMode
        IPerpsCore.Position memory openPos = IPerpsCore.Position(100e18, 10e18, 1000e18, true, true, false, IPerpsCore.MarginMode.ISOLATED);
        
        // Both positions are "open"
        vm.mockCall(address(mockPosMgr), abi.encodeWithSignature("getPosition(address,address)"), abi.encode(openPos));

        // Force trader1's liquidation to fail
        vm.mockCallRevert(address(mockPosMgr), abi.encodeWithSignature("liquidate(address,address)", trader1, tokens[0]), "Liquidate Failed");

        // The transaction shouldn't revert entirely. It should catch the error and execute the second one.
        vm.expectEmit(false, false, false, true, address(engine));
        emit BatchLiquidationExecuted(2, 1);

        engine.batchLiquidate(traders, tokens);
    }

    // ==========================================
    // 4. THE FIX: CLAIM REWARDS SECURITY
    // ==========================================

    function test_RevertWhen_HackerClaimsStuckRewards() public {
        // Setup stuck rewards
        uint256 rewards = 500e18;
        mockVault.setCollateral(address(engine), rewards);
        mockAsset.setBalance(address(engine), rewards);

        vm.startPrank(hacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", hacker));
        engine.claimStuckRewards(); // Should fail now!
        vm.stopPrank();
    }

    function test_Success_OwnerClaimsStuckRewards() public {
        uint256 rewards = 500e18;
        mockVault.setCollateral(address(engine), rewards);
        mockAsset.setBalance(address(engine), rewards);

        vm.startPrank(owner);
        
        vm.expectEmit(true, false, false, true, address(engine));
        emit RewardsClaimed(owner, rewards);

        engine.claimStuckRewards(); 
        
        assertEq(mockAsset.balanceOf(owner), rewards);
        vm.stopPrank();
    }

    // ==========================================
    // 5. RESCUE TOKENS SECURITY
    // ==========================================

    function test_RevertWhen_OwnerRescuesProtocolAsset() public {
        vm.prank(owner);
        vm.expectRevert(PerpsErrors.InvalidParameter.selector);
        engine.rescueTokens(address(mockAsset), 100e18); // Protocol asset is protected
    }

    function test_Success_OwnerRescuesOtherTokens() public {
        // Deploy a random shitcoin
        DummyAsset randomCoin = new DummyAsset();
        randomCoin.setBalance(address(engine), 100e18);

        vm.prank(owner);
        engine.rescueTokens(address(randomCoin), 100e18);

        assertEq(randomCoin.balanceOf(owner), 100e18);
    }
}