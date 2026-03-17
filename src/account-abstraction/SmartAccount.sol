// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol"; 
import {PerpsErrors} from "../errors/PerpsErrors.sol";

/**
 * @title   SmartAccount
 * @author  NexTechArchitect
 * @notice  A minimalist, gasless, signature-based smart wallet for cross-chain trading.
 * @dev     ERC-4337 compatible implementation with EIP-712 structured off-chain signing.
 */
contract SmartAccount is Initializable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public owner;
    address public immutable ENTRY_POINT;
    uint256 public nonce;

    bytes32 public constant USER_OP_TYPEHASH = keccak256(
        "UserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData)"
    );

    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes   initCode;
        bytes   callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes   paymasterAndData;
        bytes   signature;
    }

    event SmartAccountExecuted(address indexed target, uint256 value, bytes data);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event Received(address indexed sender, uint256 amount);

    modifier onlyEntryPoint() {
        _checkEntryPoint();
        _;
    }

    modifier onlyOwnerOrEntryPoint() {
        _checkOwnerOrEntryPoint();
        _;
    }

    function _checkEntryPoint() internal view {
        if (msg.sender != ENTRY_POINT) revert PerpsErrors.Unauthorized();
    }

    function _checkOwnerOrEntryPoint() internal view {
        if (msg.sender != owner && msg.sender != address(this)) revert PerpsErrors.Unauthorized();
    }

    constructor(address _entryPoint) EIP712("NexTechWallet", "1") {
        if (_entryPoint == address(0)) revert PerpsErrors.InvalidEntryPoint();
        ENTRY_POINT = _entryPoint;
        _disableInitializers(); 
    }

    function initialize(address _owner) external initializer {
        if (_owner == address(0)) revert PerpsErrors.InvalidOwner();
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256 validationData) {
        if (userOp.nonce != nonce) revert PerpsErrors.InvalidNonce();
        nonce++;

        bytes32 structHash = keccak256(abi.encode(
            USER_OP_TYPEHASH,
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

        bytes32 hash = _hashTypedDataV4(structHash);
        
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(hash, userOp.signature);

        if (err != ECDSA.RecoverError.NoError || signer != owner) {
            return 1; 
        }

        if (missingAccountFunds > 0) {
            (bool success, ) = payable(msg.sender).call{value: missingAccountFunds}("");
            if (!success) revert PerpsErrors.CallFailed();
        }

        return 0; // SIG_VALIDATION_SUCCESS
    }

    function execute(address dest, uint256 value, bytes calldata func) external onlyEntryPoint nonReentrant {
        _call(dest, value, func);
    }

    function executeBatch(
        address[] calldata dests,
        uint256[] calldata values,
        bytes[] calldata funcs
    ) external onlyEntryPoint nonReentrant {
        if (dests.length != values.length || values.length != funcs.length) revert PerpsErrors.LengthMismatch();
        
        for (uint256 i = 0; i < dests.length; i++) {
            _call(dests[i], values[i], funcs[i]);
        }
    }

    function _call(address dest, uint256 value, bytes calldata func) internal {
        if (dest == address(0)) revert PerpsErrors.InvalidTarget();

        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        emit SmartAccountExecuted(dest, value, func);
    }

    function transferOwnership(address newOwner) external onlyOwnerOrEntryPoint {
        if (newOwner == address(0)) revert PerpsErrors.InvalidOwner();
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}