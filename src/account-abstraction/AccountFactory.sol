// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {SmartAccount} from "./SmartAccount.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";

/**
 * @title   AccountFactory
 * @author  NexTechArchitect
 * @notice  Factory to deploy EIP-1167 Proxy clones of the SmartAccount.
 * @dev     Uses CREATE2 for deterministic address prediction and lazy deployment.
 */
contract AccountFactory {
    // OpenZeppelin Clones library 
    using Clones for address;

    /// @notice The master implementation of the SmartAccount
    address public immutable ACCOUNT_IMPLEMENTATION;

    /// @notice Emitted when a new Smart Account clone is deployed
    event AccountCreated(address indexed account, address indexed owner);

    /**
     * @notice Initializes the factory with the master implementation address.
     * @param _implementation The address of the deployed SmartAccount logic.
     */
    constructor(address _implementation) {
        if (_implementation == address(0)) revert PerpsErrors.InvalidAddress();
        ACCOUNT_IMPLEMENTATION = _implementation;
    }

    /**
     * @notice Deploys a new Smart Account for a user (if not already deployed).
     * @param owner The address that will own the Smart Account (from social login).
     * @param salt A random number to allow multiple accounts for the same owner.
     * @return account The deployed SmartAccount proxy address.
     */
    function createAccount(address owner, uint256 salt) external returns (SmartAccount account) {
        if (owner == address(0)) revert PerpsErrors.InvalidOwner();

        bytes32 combinedSalt = keccak256(abi.encodePacked(owner, salt));
        
        address predictedAddress = ACCOUNT_IMPLEMENTATION.predictDeterministicAddress(combinedSalt);

        if (predictedAddress.code.length > 0) {
            return SmartAccount(payable(predictedAddress));
        }

        address clone = ACCOUNT_IMPLEMENTATION.cloneDeterministic(combinedSalt);
        
        account = SmartAccount(payable(clone));
        account.initialize(owner);

        emit AccountCreated(clone, owner);
    }

    /**
     * @notice Predicts the exact address of a user's Smart Account off-chain.
     * @dev Used by the frontend to show the user their deposit address before deployment.
     * @param owner The future owner of the account.
     * @param salt The unique salt used for deployment.
     * @return The deterministic future address of the Smart Account.
     */
    function getAddress(address owner, uint256 salt) public view returns (address) {
        bytes32 combinedSalt = keccak256(abi.encodePacked(owner, salt));
        return ACCOUNT_IMPLEMENTATION.predictDeterministicAddress(combinedSalt);
    }
}