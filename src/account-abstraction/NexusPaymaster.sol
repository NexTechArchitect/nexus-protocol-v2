// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";
import {IEntryPoint} from "../interfaces/IEntryPoint.sol";

/**
 * @title NexusPaymaster
 * @dev Verifying Paymaster for ERC-4337 with gas-optimized storage and internal check patterns.
 * Optimized for gas efficiency and protection against cross-chain replay attacks.
 */
contract NexusPaymaster is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /**
     * @dev Immutable EntryPoint address to save gas on verification checks.
     */
    address public immutable ENTRY_POINT;

    /**
     * @dev Packed storage variables: address (20 bytes) + uint96 (12 bytes) fits in one 32-byte slot.
     */
    address public verifyingSigner;
    uint96 public maxCostLimit = uint96(0.01 ether); 

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

    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event GasDeposited(address indexed sender, uint256 amount);
    event GasWithdrawn(address indexed to, uint256 amount);
    event MaxCostLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event ValidationFailed(address indexed sender, uint8 reasonCode);

    constructor(address _entryPoint, address _verifyingSigner) Ownable(msg.sender) {
        if (_entryPoint == address(0) || _verifyingSigner == address(0)) revert PerpsErrors.InvalidAddress();
        ENTRY_POINT = _entryPoint;
        verifyingSigner = _verifyingSigner;
    }

    /**
     * @dev Internal security check for EntryPoint access; used instead of modifiers for better IDE support.
     */
    function _checkEntryPoint() internal view {
        if (msg.sender != ENTRY_POINT) revert PerpsErrors.Unauthorized();
    }

    /**
     * @notice Validates the paymaster's participation in a UserOperation.
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData) {
        _checkEntryPoint();

        if (maxCost > maxCostLimit) {
            emit ValidationFailed(userOp.sender, 0);
            return ("", 1); 
        }

        if (userOp.paymasterAndData.length != 85) {
            emit ValidationFailed(userOp.sender, 1);
            return ("", 1); 
        }

        bytes calldata signature = userOp.paymasterAndData[20:];
        bytes32 structHash = keccak256(abi.encodePacked(userOpHash, block.chainid, address(this)));
        
        if (structHash.toEthSignedMessageHash().recover(signature) != verifyingSigner) {
            emit ValidationFailed(userOp.sender, 2);
            return ("", 1); 
        }

        return ("", 0);
    }

    /**
     * @notice Post-operation callback; required by ERC-4337 EntryPoint.
     */
    function postOp(uint8, bytes calldata, uint256) external view {
        _checkEntryPoint();
    }

    /**
     * @notice Deposits ETH into the EntryPoint to fund future UserOperations.
     */
    function deposit() external payable {
        if (msg.value == 0) revert PerpsErrors.InvalidAmount();
        IEntryPoint(ENTRY_POINT).depositTo{value: msg.value}(address(this));
        emit GasDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraws ETH from the EntryPoint deposit back to the owner.
     */
    function withdraw(address payable withdrawAddress, uint256 amount) external onlyOwner {
        if (withdrawAddress == address(0)) revert PerpsErrors.InvalidAddress();
        IEntryPoint(ENTRY_POINT).withdrawTo(withdrawAddress, amount);
        emit GasWithdrawn(withdrawAddress, amount);
    }

    /**
     * @notice Returns the current deposit balance held in the EntryPoint.
     */
    function getDeposit() public view returns (uint256) {
        return IEntryPoint(ENTRY_POINT).balanceOf(address(this));
    }

    /**
     * @notice Updates the authorized backend signer for validating operations.
     */
    function setSigner(address _newSigner) external onlyOwner {
        if (_newSigner == address(0)) revert PerpsErrors.InvalidAddress();
        emit SignerUpdated(verifyingSigner, _newSigner);
        verifyingSigner = _newSigner;
    }

    /**
     * @notice Updates the maximum gas cost allowed per transaction.
     */
    function setMaxCostLimit(uint96 _newLimit) external onlyOwner {
        emit MaxCostLimitUpdated(maxCostLimit, _newLimit);
        maxCostLimit = _newLimit;
    }
}