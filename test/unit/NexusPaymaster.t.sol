// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NexusPaymaster} from "../../src/account-abstraction/NexusPaymaster.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";
import {IEntryPoint} from "../../src/interfaces/IEntryPoint.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// ==========================================
// MOCK ENTRY POINT (For Isolated Testing)
// ==========================================
contract MockEntryPoint is IEntryPoint {
    mapping(address => uint256) public deposits;

    function depositTo(address account) external payable {
        deposits[account] += msg.value;
    }

    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external {
        require(deposits[msg.sender] >= withdrawAmount, "Mock: Insufficient balance");
        deposits[msg.sender] -= withdrawAmount;
        (bool success, ) = withdrawAddress.call{value: withdrawAmount}("");
        require(success, "Mock: Transfer failed");
    }

    function balanceOf(address account) external view returns (uint256) {
        return deposits[account];
    }
}

// ==========================================
// TEST SUITE: DESTRUCTIVE & EDGE-CASE FOCUS
// ==========================================
contract NexusPaymasterTest is Test {
    NexusPaymaster public paymaster;
    MockEntryPoint public entryPoint;

    // Accounts
    address public owner = makeAddr("owner");
    address public hacker = makeAddr("hacker");
    
    // Signers and Private Keys
    uint256 public signerPk = 0x123456789;
    address public signer;
    uint256 public hackerPk = 0x987654321;

    // Events to track
    event ValidationFailed(address indexed sender, uint8 reasonCode);
    event GasDeposited(address indexed sender, uint256 amount);
    event GasWithdrawn(address indexed to, uint256 amount);
    event MaxCostLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);

    function setUp() public {
        signer = vm.addr(signerPk);
        entryPoint = new MockEntryPoint();

        vm.prank(owner);
        paymaster = new NexusPaymaster(address(entryPoint), signer);
    }

    // ==========================================
    // HELPER FUNCTIONS
    // ==========================================
    
    // Generates the exact 65-byte ECDSA signature
    function _generateSignature(bytes32 userOpHash, uint256 privateKey, uint256 chainId) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encodePacked(userOpHash, chainId, address(paymaster)));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    // ==========================================
    // 1. CONSTRUCTOR TESTS (Initialization check)
    // ==========================================

    function test_RevertWhen_ConstructorZeroEntryPoint() public {
        vm.expectRevert(PerpsErrors.InvalidAddress.selector);
        new NexusPaymaster(address(0), signer);
    }

    function test_RevertWhen_ConstructorZeroSigner() public {
        vm.expectRevert(PerpsErrors.InvalidAddress.selector);
        new NexusPaymaster(address(entryPoint), address(0));
    }

    // ==========================================
    // 2. PAYMASTER VALIDATION TESTS (Core Logic)
    // ==========================================

    function test_RevertWhen_ValidateCallerNotEntryPoint() public {
        NexusPaymaster.UserOperation memory op;
        
        vm.prank(hacker);
        vm.expectRevert(PerpsErrors.Unauthorized.selector);
        paymaster.validatePaymasterUserOp(op, bytes32(0), 0);
    }

    function test_RejectWhen_MaxCostExceedsLimit() public {
        NexusPaymaster.UserOperation memory op;
        op.sender = makeAddr("user");
        
        uint256 limit = paymaster.maxCostLimit();
        uint256 excessiveCost = limit + 1; // 1 wei over the limit

        vm.prank(address(entryPoint));
        vm.expectEmit(true, false, false, true, address(paymaster));
        emit ValidationFailed(op.sender, 0); // reasonCode 0: Max cost

        (bytes memory context, uint256 validationData) = paymaster.validatePaymasterUserOp(op, bytes32(0), excessiveCost);
        
        assertEq(validationData, 1, "Should return 1 (Reject)");
        assertEq(context.length, 0, "Context should be empty");
    }

    function test_RejectWhen_PaymasterAndDataLengthIsWrong() public {
        NexusPaymaster.UserOperation memory op;
        op.sender = makeAddr("user");
        
        // Exact 85 is required. Let's send 84 bytes.
        op.paymasterAndData = new bytes(84);

        vm.prank(address(entryPoint));
        vm.expectEmit(true, false, false, true, address(paymaster));
        emit ValidationFailed(op.sender, 1); // reasonCode 1: Length

        (, uint256 validationData) = paymaster.validatePaymasterUserOp(op, bytes32(0), 0);
        assertEq(validationData, 1, "Should reject invalid length");
    }

    function test_RejectWhen_SignatureIsInvalid() public {
        NexusPaymaster.UserOperation memory op;
        op.sender = makeAddr("user");
        bytes32 userOpHash = keccak256("dummy_hash");

        // Hacker signs the payload with their own private key
        bytes memory badSignature = _generateSignature(userOpHash, hackerPk, block.chainid);
        
        // Construct paymasterAndData (20 bytes paymaster address + 65 bytes sig)
        op.paymasterAndData = abi.encodePacked(address(paymaster), badSignature);

        vm.prank(address(entryPoint));
        vm.expectEmit(true, false, false, true, address(paymaster));
        emit ValidationFailed(op.sender, 2); // reasonCode 2: Bad Signature

        (, uint256 validationData) = paymaster.validatePaymasterUserOp(op, userOpHash, 0);
        assertEq(validationData, 1, "Should reject wrong signer");
    }

    function test_RejectWhen_CrossChainReplayAttempted() public {
        NexusPaymaster.UserOperation memory op;
        op.sender = makeAddr("user");
        bytes32 userOpHash = keccak256("dummy_hash");

        // Legitimate signer signs it, BUT for a different chain ID (e.g., Optimism vs Arbitrum)
        uint256 wrongChainId = block.chainid + 1;
        bytes memory crossChainSignature = _generateSignature(userOpHash, signerPk, wrongChainId);
        
        op.paymasterAndData = abi.encodePacked(address(paymaster), crossChainSignature);

        vm.prank(address(entryPoint));
        // It should fail to recover the correct signer because the structHash will not match
        emit ValidationFailed(op.sender, 2);
        
        (, uint256 validationData) = paymaster.validatePaymasterUserOp(op, userOpHash, 0);
        assertEq(validationData, 1, "Cross-chain replay must be rejected");
    }

   function test_Success_ValidSignatureAndCost() public {
        NexusPaymaster.UserOperation memory op;
        op.sender = makeAddr("user");
        bytes32 userOpHash = keccak256("dummy_hash");

        // Perfect, valid signature
        bytes memory validSignature = _generateSignature(userOpHash, signerPk, block.chainid);
        op.paymasterAndData = abi.encodePacked(address(paymaster), validSignature);

        uint256 allowedCost = paymaster.maxCostLimit();

        vm.prank(address(entryPoint));
        (bytes memory context, uint256 validationData) = paymaster.validatePaymasterUserOp(
            op, 
            userOpHash, 
            allowedCost
        );
        
        assertEq(validationData, 0, "Valid signature must return 0 (Accept)");
        assertEq(context.length, 0);
    }

    // ==========================================
    // 3. POST-OP TESTS
    // ==========================================

    function test_RevertWhen_PostOpCallerNotEntryPoint() public {
        vm.prank(hacker);
        vm.expectRevert(PerpsErrors.Unauthorized.selector);
        paymaster.postOp(0, "", 0);
    }

    function test_Success_PostOpFromEntryPoint() public {
        vm.prank(address(entryPoint));
        paymaster.postOp(0, "", 0); // Should not revert
    }

    // ==========================================
    // 4. FUND MANAGEMENT TESTS
    // ==========================================

    function test_RevertWhen_DepositZeroValue() public {
        vm.expectRevert(PerpsErrors.InvalidAmount.selector);
        paymaster.deposit{value: 0}();
    }

    function test_Success_DepositFunds() public {
        uint256 amount = 1 ether;
        vm.deal(owner, amount);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(paymaster));
        emit GasDeposited(owner, amount);
        
        paymaster.deposit{value: amount}();
        assertEq(paymaster.getDeposit(), amount);
        assertEq(address(entryPoint).balance, amount);
    }

    function test_RevertWhen_WithdrawByNonOwner() public {
        vm.prank(hacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", hacker));
        paymaster.withdraw(payable(hacker), 1 ether);
    }

    function test_RevertWhen_WithdrawToZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PerpsErrors.InvalidAddress.selector);
        paymaster.withdraw(payable(address(0)), 1 ether);
    }

    function test_Success_WithdrawFunds() public {
        // First deposit
        uint256 depositAmt = 2 ether;
        vm.deal(owner, depositAmt);
        vm.prank(owner);
        paymaster.deposit{value: depositAmt}();

        // Now withdraw
        uint256 withdrawAmt = 1 ether;
        address payable receiver = payable(makeAddr("receiver"));
        
        uint256 initialBalance = receiver.balance;

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(paymaster));
        emit GasWithdrawn(receiver, withdrawAmt);
        
        paymaster.withdraw(receiver, withdrawAmt);

        assertEq(paymaster.getDeposit(), depositAmt - withdrawAmt);
        assertEq(receiver.balance, initialBalance + withdrawAmt);
    }

    // ==========================================
    // 5. ADMIN SETTER TESTS
    // ==========================================

    function test_RevertWhen_SetSignerByNonOwner() public {
        vm.prank(hacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", hacker));
        paymaster.setSigner(hacker);
    }

    function test_RevertWhen_SetSignerToZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(PerpsErrors.InvalidAddress.selector);
        paymaster.setSigner(address(0));
    }

    function test_Success_SetSigner() public {
        address newSigner = makeAddr("newSigner");
        
        vm.prank(owner);
        vm.expectEmit(true, true, false, false, address(paymaster));
        emit SignerUpdated(signer, newSigner);
        
        paymaster.setSigner(newSigner);
        assertEq(paymaster.verifyingSigner(), newSigner);
    }

    function test_Success_SetMaxCostLimit() public {
        uint96 newLimit = uint96(0.05 ether);
        uint256 oldLimit = paymaster.maxCostLimit();

        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(paymaster));
        emit MaxCostLimitUpdated(oldLimit, newLimit);
        
        paymaster.setMaxCostLimit(newLimit);
        assertEq(paymaster.maxCostLimit(), newLimit);
    }
}