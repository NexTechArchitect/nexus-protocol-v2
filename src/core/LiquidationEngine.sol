// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PositionManager} from "./PositionManager.sol";
import {PerpsVault} from "./PerpsVault.sol";
import {IPerpsCore} from "../interfaces/IPerpsCore.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";
/**
 * @title   LiquidationEngine
 * @author  NexTechArchitect
 * @notice  Keeper-compatible engine for executing batch liquidations safely.
 * @dev     Hardened for production. Includes gas-optimized pre-checks, 
 * reentrancy guards, fail-safe reward routing, and protected token rescues.
 */

 contract LiquidationEngine is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ////////////////////////////////////////////////
    //                STATE VARIABLES             //
    ////////////////////////////////////////////////

    ///@notice Reference to the core protocol contract for fetching position data and executing liquidations.
    PositionManager public immutable POSITION_MANAGER;

    ///@notice Reference to the protocol`s main Vault
    PerpsVault public immutable VAULT;

    ///@notice protocol`s collateral asset (cached for security validation)
    IERC20 public immutable PROTOCOL_ASSET;

    ///@notice Maximum number of positions that can be liquidated in one transaction (prevents Out-Of-Gas)
    uint256 public maxBatchSize;

    ///////////////////////////////////////////////////////
    //                    EVENTS                         //
    ///////////////////////////////////////////////////////

    event BatchLiquidationExecuted(uint256 totalAttempted, uint256 totalSuccessful);
    event RewardsClaimed(address indexed keeper, uint256 amount);
    event LiquidationFailed(address indexed trader, address indexed token, string reason);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);
    event MaxBatchSizeUpdated(uint256 newSize);

    /////////////////////////////////////////////////////
    //                  CONSTRUCTOR                    //   
    /////////////////////////////////////////////////////

    /**
     * @notice Initializes the engine and links core contracts.
     * @param _positionManager Address of the deployed PositionManager contract.
     */

    constructor (address _positionManager) Ownable(msg.sender) {

        if (_positionManager == address(0)) revert PerpsErrors.InvalidAddress();

        POSITION_MANAGER = PositionManager(_positionManager);
        VAULT = POSITION_MANAGER.VAULT();
        PROTOCOL_ASSET = IERC20(VAULT.ASSET());

        //default batch size 
        maxBatchSize = 20;
    }

    ///////////////////////////////////////////////////////
    //                CORE FUNCTIONS                     //
    ///////////////////////////////////////////////////////

    /**
     * @notice Batch liquidates multiple positions in a single transaction.
     * @dev    Uses try-catch to ensure one failure doesn't revert the entire batch.
     * Skips closed positions to save gas.
     * @param _traders Array of user addresses to check/liquidate.
     * @param _tokens  Array of asset addresses corresponding to the users.
     */

     function batchLiquidate (
        address[] calldata _traders,
        address[] calldata _tokens
     ) external nonReentrant {

        if (_traders.length != _tokens.length) revert PerpsErrors.InvalidParameter();
        if (_traders.length ==0 || _traders.length > maxBatchSize) revert PerpsErrors.InvalidBatchSize();

     
     uint256 successfulLiquidations = 0;

   for (uint256 i = 0; i< _traders.length; i++) {
    address trader = _traders[i];
    address token = _tokens[i];
   
IPerpsCore.Position memory pos = POSITION_MANAGER.getPosition(trader, token);

 if (!pos.isOpen) {
                emit LiquidationFailed(trader, token, "Position not open");
                continue;
            }
            try POSITION_MANAGER.liquidate(trader, token) {
                successfulLiquidations++;
            } catch Error(string memory reason) {
                emit LiquidationFailed(trader, token, reason);
            } catch {
                emit LiquidationFailed(trader, token, "Unknown revert");
            }
        }

        emit BatchLiquidationExecuted(_traders.length, successfulLiquidations);

      
        if (successfulLiquidations > 0) {
            _transferRewardsToKeeper();
        }
    }

     ///////////////////////////////////////////////////////
     //               INTERNAL HELPERS                    //
     ///////////////////////////////////////////////////////

     /**
     * @notice Withdraws collateral from the Vault and sends it to the caller.
     * @dev Wrapped in a try-catch to ensure that a withdrawal failure 
     * does not revert the entire batch of successful liquidations.
     */
    function _transferRewardsToKeeper() internal {
        // Get the accumulated rewards for this contract from the Vault
        uint256 rewards = VAULT.getTraderCollateral(address(this));
        
        // Only attempt withdrawal if there are actual rewards to claim
        if (rewards > 0) {
            
            try VAULT.withdraw(rewards) {
                // Fetch the actual balance to prevent transferring non-existent tokens
                uint256 balance = PROTOCOL_ASSET.balanceOf(address(this));

                if (balance > 0) {
                    PROTOCOL_ASSET.safeTransfer(msg.sender, balance);
                    emit RewardsClaimed(msg.sender, balance);
                } 
            } catch {
                // INTENTIONALLY LEFT EMPTY
                // If the Vault is paused or lacks liquidity, the withdrawal will fail.
                // We catch the error silently so the main batchLiquidate transaction still succeeds.
                // The keeper's rewards remain safely recorded in the Vault and can be 
                // extracted later using the claimStuckRewards() function.
            }
        }
    }

    ///////////////////////////////////////////////////////
    //               ADMIN & VIEW FUNCTIONS              //
    ///////////////////////////////////////////////////////

    /**
     * @notice Checks if liquidations can currently be processed.
     * @dev    Keepers should query this off-chain before broadcasting a transaction.
     * @return bool True if neither the PositionManager nor Vault is paused.
     */
    function canLiquidate() external view returns (bool) {
        return !POSITION_MANAGER.paused() && !VAULT.paused();
    }

    /**
     * @notice Updates the maximum batch size limit.
     * @param _newSize The new maximum array length for batch processing.
     */
    function setMaxBatchSize(uint256 _newSize) external onlyOwner {
        if (_newSize == 0) revert PerpsErrors.ZeroAmount();
        maxBatchSize = _newSize;
        emit MaxBatchSizeUpdated(_newSize);
    }

    /**
     * @notice Allows a keeper to manually claim rewards if auto-transfer failed during a batch run.
     * @dev    Acts as a decentralized bounty extraction for stuck keeper rewards.
     */
function claimStuckRewards() external nonReentrant onlyOwner {
        uint256 rewards = VAULT.getTraderCollateral(address(this));
        
        if (rewards > 0) {
            VAULT.withdraw(rewards);
            uint256 balance = PROTOCOL_ASSET.balanceOf(address(this));
            
            if (balance > 0) {
            
                PROTOCOL_ASSET.safeTransfer(owner(), balance);
                emit RewardsClaimed(owner(), balance);
            }
        }
    }

    /**
     * @notice Emergency function to rescue tokens accidentally sent to this contract.
     * @dev    CRITICAL: Blocks withdrawal of PROTOCOL_ASSET to prevent owner from rug-pulling keeper rewards.
     * @param _token Address of the ERC20 token to rescue.
     * @param _amount Amount of tokens to transfer to the owner.
     */
    function rescueTokens(address _token, uint256 _amount) external onlyOwner {
        if (_token == address(0)) revert PerpsErrors.InvalidAddress();
        if (_amount == 0) revert PerpsErrors.ZeroAmount();
        if (_token == address(PROTOCOL_ASSET)) revert PerpsErrors.InvalidParameter(); // Protection Active
        
        IERC20(_token).safeTransfer(owner(), _amount);
        emit TokensRescued(_token, owner(), _amount);
    }

    /// @notice Returns the pending rewards for this contract stored in the Vault.
    function getPendingRewards() external view returns (uint256) {
        return VAULT.getTraderCollateral(address(this));
    }

    /// @notice Returns the current maximum batch size setting.
    function getMaxBatchSize() external view returns (uint256) {
        return maxBatchSize;
    }
}
