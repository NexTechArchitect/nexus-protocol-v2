// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SmartAccount} from "../../src/account-abstraction/SmartAccount.sol";
import {PerpsErrors} from "../../src/errors/PerpsErrors.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

// ==========================================
// DUMMY TARGET CONTRACT (For execute testing)
// ==========================================
contract DummyTarget {
    uint256 public valueReceived;
    bytes public lastData;

    function doSomething(uint256 _x) external payable {
        valueReceived += msg.value;
        lastData = abi.encode(_x);
    }

    function revertMe() external pure {
        revert("TargetReverted");
    }
}

// ==========================================
// TEST SUITE
// ==========================================
contract SmartAccountTest is Test {
    SmartAccount public account;
    DummyTarget public target;
    SmartAccount public implementation;

    address public entryPoint = makeAddr("entryPoint");
    
    uint256 ownerPrivateKey = 0xA11CE;
    address public ownerAddress = vm.addr(ownerPrivateKey);
    
    uint256 hackerPrivateKey = 0xBAD;
    address public hackerAddress = vm.addr(hackerPrivateKey);

    event SmartAccountExecuted(address indexed target, uint256 value, bytes data);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event Received(address indexed sender, uint256 amount);

    function setUp() public {
        implementation = new SmartAccount(entryPoint);
        
        address cloneAddress = Clones.clone(address(implementation));
        account = SmartAccount(payable(cloneAddress));

        account.initialize(ownerAddress);
        target = new DummyTarget();

        vm.deal(address(account), 10 ether);
    }

    function test_RevertWhen_ConstructorZeroEntryPoint() public {
        vm.expectRevert(PerpsErrors.InvalidEntryPoint.selector);
        new SmartAccount(address(0));
    }

    function test_RevertWhen_InitializingTwice() public {
        vm.expectRevert(abi.encodeWithSignature("InvalidInitialization()"));
        account.initialize(makeAddr("someone"));
    }

    function test_RevertWhen_InitializingZeroOwner() public {
        address freshClone = Clones.clone(address(implementation));
        SmartAccount freshAccount = SmartAccount(payable(freshClone));

        vm.expectRevert(PerpsErrors.InvalidOwner.selector);
        freshAccount.initialize(address(0));
    }

    function test_RevertWhen_ExecuteCalledByNonEntryPoint() public {
        vm.prank(ownerAddress); 
        vm.expectRevert(PerpsErrors.Unauthorized.selector);
        account.execute(address(target), 0, "");
    }

    function test_RevertWhen_ExecuteBatchCalledByNonEntryPoint() public {
        address[] memory dests = new address[](1);
        uint256[] memory vals = new uint256[](1);
        bytes[] memory funcs = new bytes[](1);

        vm.prank(hackerAddress);
        vm.expectRevert(PerpsErrors.Unauthorized.selector);
        account.executeBatch(dests, vals, funcs);
    }

    function test_Success_SingleExecution() public {
        bytes memory callData = abi.encodeWithSelector(target.doSomething.selector, 42);
        
        vm.prank(entryPoint);
        vm.expectEmit(true, false, false, true, address(account));
        emit SmartAccountExecuted(address(target), 1 ether, callData);
        
        account.execute(address(target), 1 ether, callData);

        assertEq(target.valueReceived(), 1 ether);
        assertEq(target.lastData(), abi.encode(42));
        assertEq(address(target).balance, 1 ether);
    }

    function test_Success_BatchExecution() public {
        address[] memory dests = new address[](2);
        uint256[] memory vals = new uint256[](2);
        bytes[] memory funcs = new bytes[](2);

        dests[0] = address(target);
        vals[0] = 1 ether;
        funcs[0] = abi.encodeWithSelector(target.doSomething.selector, 10);

        dests[1] = address(target);
        vals[1] = 2 ether;
        funcs[1] = abi.encodeWithSelector(target.doSomething.selector, 20);

        vm.prank(entryPoint);
        account.executeBatch(dests, vals, funcs);

        assertEq(target.valueReceived(), 3 ether);
        assertEq(target.lastData(), abi.encode(20));
    }

    function test_RevertWhen_TargetReverts() public {
        bytes memory callData = abi.encodeWithSelector(target.revertMe.selector);
        
        vm.prank(entryPoint);
        vm.expectRevert("TargetReverted");
        account.execute(address(target), 0, callData);
    }

    function test_RevertWhen_BatchArraysMismatch() public {
        address[] memory dests = new address[](2);
        uint256[] memory vals = new uint256[](1);
        bytes[] memory funcs = new bytes[](2);

        vm.prank(entryPoint);
        vm.expectRevert(PerpsErrors.LengthMismatch.selector);
        account.executeBatch(dests, vals, funcs);
    }

    function test_Success_TransferOwnershipByOwner() public {
        address newOwner = makeAddr("newOwner");
        
        vm.prank(ownerAddress);
        vm.expectEmit(true, true, false, false, address(account));
        emit OwnerChanged(ownerAddress, newOwner);
        account.transferOwnership(newOwner);

        assertEq(account.owner(), newOwner);
    }

    function test_RevertWhen_TransferOwnershipByHacker() public {
        vm.prank(hackerAddress);
        vm.expectRevert(PerpsErrors.Unauthorized.selector);
        account.transferOwnership(makeAddr("newOwner"));
    }

    function _buildUserOp(address sender, uint256 nonce) internal pure returns (SmartAccount.UserOperation memory) {
        return SmartAccount.UserOperation({
            sender: sender,
            nonce: nonce,
            initCode: "",
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 100000,
            preVerificationGas: 50000,
            maxFeePerGas: 10 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: "" 
        });
    }

    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("NexTechWallet")),
            keccak256(bytes("1")),
            block.chainid,
            address(account)
        ));
    }

    function test_Success_ValidateUserOpWithValidSignature() public {
        SmartAccount.UserOperation memory userOp = _buildUserOp(address(account), account.nonce());

        bytes32 structHash = keccak256(abi.encode(
            account.USER_OP_TYPEHASH(),
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            keccak256(userOp.paymasterAndData)
        ));

        bytes32 domainSeparator = _getDomainSeparator();
        bytes32 digest = MessageHashUtils.toTypedDataHash(domainSeparator, structHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, digest);
        userOp.signature = abi.encodePacked(r, s, v);

        vm.prank(entryPoint);
        uint256 result = account.validateUserOp(userOp, bytes32(0), 0);

        assertEq(result, 0, "Valid signature should return 0");
        assertEq(account.nonce(), 1, "Nonce should increment");
    }

    function test_Failure_ValidateUserOpWithInvalidSignatureReturnsOne() public {
        SmartAccount.UserOperation memory userOp = _buildUserOp(address(account), account.nonce());
        
        bytes32 structHash = keccak256(abi.encode(
            account.USER_OP_TYPEHASH(), userOp.sender, userOp.nonce, keccak256(userOp.initCode), keccak256(userOp.callData), userOp.callGasLimit, userOp.verificationGasLimit, userOp.preVerificationGas, userOp.maxFeePerGas, userOp.maxPriorityFeePerGas, keccak256(userOp.paymasterAndData)
        ));
        
        bytes32 domainSeparator = _getDomainSeparator();
        bytes32 digest = MessageHashUtils.toTypedDataHash(domainSeparator, structHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(hackerPrivateKey, digest);
        userOp.signature = abi.encodePacked(r, s, v);

        vm.prank(entryPoint);
        uint256 result = account.validateUserOp(userOp, bytes32(0), 0);
        assertEq(result, 1, "Invalid signature should return 1");
    }

  // ==========================================
    // 6. MISSING FUNDS COMPENSATION (FIXED)
    // ==========================================

    function test_Success_PaysMissingFundsToEntryPoint() public {
        SmartAccount.UserOperation memory userOp = _buildUserOp(address(account), account.nonce());
        
         bytes32 structHash = keccak256(abi.encode(
            account.USER_OP_TYPEHASH(), userOp.sender, userOp.nonce, keccak256(userOp.initCode), keccak256(userOp.callData), userOp.callGasLimit, userOp.verificationGasLimit, userOp.preVerificationGas, userOp.maxFeePerGas, userOp.maxPriorityFeePerGas, keccak256(userOp.paymasterAndData)
        ));
        bytes32 digest = MessageHashUtils.toTypedDataHash(_getDomainSeparator(), structHash);
        
        // Valid Owner Key used here
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPrivateKey, digest);
        userOp.signature = abi.encodePacked(r, s, v);

        uint256 missingFunds = 1.5 ether;
        uint256 initialEntryPointBalance = entryPoint.balance;

        vm.prank(entryPoint);
        
        // Valid signature ensures the function reaches the payment logic
        account.validateUserOp(userOp, bytes32(0), missingFunds);

        assertEq(entryPoint.balance, initialEntryPointBalance + missingFunds, "EntryPoint should be compensated");
    }

    // ==========================================
    // 7. RECEIVE FALLBACK
    // ==========================================

    function test_Success_ReceiveETH() public {
        vm.deal(ownerAddress, 10 ether);

        vm.expectEmit(true, false, false, true, address(account));
        emit Received(ownerAddress, 5 ether);
        
        vm.prank(ownerAddress);
        (bool success, ) = address(account).call{value: 5 ether}("");
        assertTrue(success, "ETH transfer failed");
        assertEq(address(account).balance, 15 ether); 
    }
}