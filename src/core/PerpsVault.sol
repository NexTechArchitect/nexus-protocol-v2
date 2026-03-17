// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";

/**
 * @title   PerpsVault
 * @author  NexTechArchitect
 * @notice  The central treasury of the Nexus Protocol.
 */
contract PerpsVault is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    //////////////////////////////////////////////////////////
    //            Immutables and State Variables            //
    //////////////////////////////////////////////////////////

    /// @notice The ERC20 token accepted as collateral (e.g., USDC).
    /// @dev Defined as immutable for gas efficiency and security.
    IERC20 public immutable ASSET;

    /// @notice Multiplier to scale the asset's native decimals to 18 decimals.
    /// @dev Ensures that all internal protocol math (PnL, Leverage) is consistent.
    uint256 public immutable DECIMALS_SCALAR;

    /// @notice Minimum liquidity shares to be permanently locked on first deposit.
    /// @dev Prevents "Inflation Attacks" by ensuring the share price cannot be easily manipulated.
    uint256 private constant MINIMUM_LIQUIDITY = 1000; 

    /// @notice The authorized trading engine contract address.
    /// @dev Only this address is allowed to call lockCollateral and settleTrade.
    address public positionManager;

    /** * @notice Mapping of trader addresses to their available (unlocked) collateral.
     * @dev Tracked in 18-decimal precision for protocol-wide consistency.
     */
    mapping(address => uint256) private traderCollateral;

    /// @notice Global sum of all free collateral currently held by traders in the vault.
    uint256 public totalTraderFreeCollateral; 

    /** * @notice Mapping of trader addresses to their collateral currently tied up in active trades.
     * @dev Used as a security check during trade settlement to prevent over-withdrawal.
     */
    mapping(address => uint256) private lockedCollateral;

    /// @notice Total amount of collateral across all users that is currently locked in positions.
    uint256 public totalLockedCollateral;

    /** * @notice The "Source of Truth" for protocol liquidity (the House's money).
     * @dev This pool is used to pay out trader profits and collects trader losses.
     */
    uint256 public totalLiquidity; 
    
    /// @notice Mapping of liquidity provider addresses to their respective share units.
    mapping(address => uint256) private lpShares;

    /// @notice The total supply of LP shares currently issued by the protocol.
    uint256 public totalLpShares;

    //////////////////////////////////////////////////
    //                    EVENTS                    //
    //////////////////////////////////////////////////

    event Deposited(address indexed user, uint256 rawAmount, uint256 scaledAmount);
    event Withdrawn(address indexed user, uint256 rawAmount, uint256 scaledAmount);
    
    event LiquidityAdded(address indexed provider, uint256 assetsAdded, uint256 sharesMinted);
    event LiquidityRemoved(address indexed provider, uint256 assetsRemoved, uint256 sharesBurned);
    
    event CollateralLocked(address indexed user, uint256 amount);
    event CollateralUnlocked(address indexed user, uint256 amount);
    event TradeSettled(address indexed user, int256 pnl, uint256 payout);
    
    event FeeTransferred(address indexed from, address indexed to, uint256 amount);
    
    event PositionManagerUpdated(address indexed oldManager, address indexed newManager);

    ///////////////////////////////////////////////////
    //          Modifiers and Constructor            //
    ///////////////////////////////////////////////////

    modifier onlyPositionManager() {
        _checkPositionManager();
        _;
    }

    function _checkPositionManager() internal view {
        if (msg.sender != positionManager) revert PerpsErrors.Unauthorized();
    }

    /// @dev The constructor initializes the vault with the specified asset and sets up necessary parameters for liquidity management and collateral handling. It ensures that the provided asset address is valid and determines the appropriate scaling factor based on the asset's decimals to maintain consistent 18-decimal precision internally.
    constructor(address _asset) Ownable(msg.sender) {
        if (_asset == address(0)) revert PerpsErrors.InvalidAddress();

        uint8 decimals = IERC20Metadata(_asset).decimals();
        if (decimals == 0 || decimals > 18) revert PerpsErrors.InvalidAsset();

        ASSET = IERC20(_asset);
        
        DECIMALS_SCALAR = 10 ** (18 - decimals);
    }

    ///////////////////////////////////////////////////////
    //               OWNER ONLY FUNCTIONS                //  
    ///////////////////////////////////////////////////////

    /// @notice Sets the Position Manager contract address, which is responsible for managing positions and interacting with the vault for collateral and PnL settlements.
    function setPositionManager(address _manager) external onlyOwner {
        if (_manager == address(0)) revert PerpsErrors.InvalidAddress();
        emit PositionManagerUpdated(positionManager, _manager);
        positionManager = _manager;
    }

    /// @dev Pausing functions are included as a safety mechanism to halt operations in case of emergencies or detected vulnerabilities.
    function pause() external onlyOwner {
        _pause();
    }

    /// @dev Unpausing allows the contract to resume normal operations after being paused.
    function unpause() external onlyOwner {
        _unpause();
    }

    ///////////////////////////////////////////////////////
    //             CORE USER FUNCTIONS                   //  
    ///////////////////////////////////////////////////////

    /**
     * @notice Deposits assets into the liquidity pool and mints LP shares.
     * @dev The first liquidity provider must deposit more than the minimum liquidity to prevent excessive share dilution. 
     * Subsequent providers receive shares proportional to their contribution relative to the total pool.
     */
    function addLiquidity(uint256 amount) external nonReentrant whenNotPaused returns (uint256) {
        if (amount == 0) revert PerpsErrors.ZeroAmount();

        uint256 scaledAmount = amount * DECIMALS_SCALAR;
        uint256 sharesToMint;

        if (totalLpShares == 0) {
            if (scaledAmount <= MINIMUM_LIQUIDITY) revert PerpsErrors.ZeroAmount();
            
            sharesToMint = scaledAmount - MINIMUM_LIQUIDITY;
            totalLpShares = MINIMUM_LIQUIDITY; 
        } else {
            sharesToMint = (scaledAmount * totalLpShares) / totalLiquidity;
        }

        if (sharesToMint == 0) revert PerpsErrors.ZeroAmount();

        totalLiquidity += scaledAmount;
        lpShares[msg.sender] += sharesToMint;
        totalLpShares += sharesToMint;

        ASSET.safeTransferFrom(msg.sender, address(this), amount);

        emit LiquidityAdded(msg.sender, scaledAmount, sharesToMint);
        return sharesToMint;
    }

    /**
     * @notice Burns LP shares to withdraw proportional liquidity.
     * @dev Withdraws the underlying asset based on the share of the pool owned by the LP. Ensures that the vault has       
     * sufficient liquidity to fulfill the withdrawal.
     */
    function removeLiquidity(uint256 shares) external nonReentrant whenNotPaused {
        if (shares == 0) revert PerpsErrors.ZeroAmount();
        if (lpShares[msg.sender] < shares) revert PerpsErrors.InsufficientBalance();

        uint256 scaledAmount = (shares * totalLiquidity) / totalLpShares;
        if (scaledAmount == 0) revert PerpsErrors.ZeroAmount();

        if (totalLiquidity < scaledAmount) revert PerpsErrors.InsufficientBalance();

        uint256 rawAmount = scaledAmount / DECIMALS_SCALAR;
        if (rawAmount == 0) revert PerpsErrors.ZeroAmount();

        lpShares[msg.sender] -= shares;
        totalLpShares -= shares;
        totalLiquidity -= scaledAmount;

        ASSET.safeTransfer(msg.sender, rawAmount);

        emit LiquidityRemoved(msg.sender, scaledAmount, shares);
    }

    /**
     * @notice Deposits collateral into the vault.
     * @dev Collateral is scaled to 18 decimals internally for consistent calculations, regardless of the underlying asset's decimals.
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert PerpsErrors.ZeroAmount();

        uint256 scaledAmount = amount * DECIMALS_SCALAR;

        traderCollateral[msg.sender] += scaledAmount;
        totalTraderFreeCollateral += scaledAmount; 

        ASSET.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount, scaledAmount);
    }

    /**
     * @notice Withdraws free collateral from the vault.
     * @dev Only allows withdrawal of collateral that is not currently locked in positions.
     * FIXED: Dust sweeping vulnerability prevented by strict modulo check.
     */
    function withdraw(uint256 scaledAmount) external nonReentrant {
        if (scaledAmount == 0) revert PerpsErrors.ZeroAmount();
        if (traderCollateral[msg.sender] < scaledAmount) revert PerpsErrors.InsufficientBalance();

        if (scaledAmount % DECIMALS_SCALAR != 0) revert PerpsErrors.InvalidAmount();

        uint256 rawAmount = scaledAmount / DECIMALS_SCALAR;
        if (rawAmount == 0) revert PerpsErrors.ZeroAmount();

        traderCollateral[msg.sender] -= scaledAmount;
        totalTraderFreeCollateral -= scaledAmount; 

        ASSET.safeTransfer(msg.sender, rawAmount);

        emit Withdrawn(msg.sender, rawAmount, scaledAmount);
    }


    ///////////////////////////////////////////////////////
    //           POSITION MANAGER FUNCTIONS              //  
    ///////////////////////////////////////////////////////

    /**
     * @notice Locks trader collateral when opening a position.
     * @dev This function is called by the Position Manager during position opening and is not exposed to users directly.
     */
    function lockCollateral(address user, uint256 amount) 
        external 
        onlyPositionManager 
        whenNotPaused 
    {
        if (traderCollateral[user] < amount) revert PerpsErrors.InsufficientCollateral();

        traderCollateral[user] -= amount;
        totalTraderFreeCollateral -= amount; 

        lockedCollateral[user] += amount;
        totalLockedCollateral += amount;

        emit CollateralLocked(user, amount);
    }

      /**
     * @notice Finalizes a trade by releasing collateral and applying realized PnL.
     * physical payouts are prioritized over strict LP internal accounting.
     */
    function settleTrade(address user, uint256 amountLocked, int256 pnl) 
        external 
        onlyPositionManager 
        nonReentrant 
        whenNotPaused 
    {
        if (lockedCollateral[user] < amountLocked) revert PerpsErrors.InsufficientCollateral();

        uint256 loss = 0;
        uint256 profit = 0;

        if (pnl < 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            loss = uint256(-pnl);
            if (loss > amountLocked) loss = amountLocked; 
        } else {
            // forge-lint: disable-next-line(unsafe-typecast)
            profit = uint256(pnl);
        }

        uint256 payout = amountLocked + profit - loss;
        uint256 rawPayout = payout / DECIMALS_SCALAR;
        
        uint256 availablePhysicalTokens = ASSET.balanceOf(address(this));
        if (availablePhysicalTokens < rawPayout) {
            rawPayout = availablePhysicalTokens;
            payout = rawPayout * DECIMALS_SCALAR; 
        }

        lockedCollateral[user] -= amountLocked;
        totalLockedCollateral -= amountLocked;

        

        if (profit > 0) {
            if (totalLiquidity < profit) {
                totalLiquidity = 0; 
            } else {
                totalLiquidity -= profit;
            }
        } else if (loss > 0) {
            totalLiquidity += loss;
        }

        traderCollateral[user] += payout;
        totalTraderFreeCollateral += payout; 

        emit CollateralUnlocked(user, amountLocked);
        emit TradeSettled(user, pnl, payout);
    }


    /**
     * @notice Moves collateral between users (used for Liquidation Fees).
     * @dev Updates global accounting to maintain invariant consistency 
     * (sum of all trader balances == totalTraderFreeCollateral).
     */
    function transferByManager(address from, address to, uint256 amount) 
        external 
        onlyPositionManager 
        nonReentrant 
        whenNotPaused
        returns (bool)
    {
        if (traderCollateral[from] < amount) revert PerpsErrors.InsufficientBalance();
        
        traderCollateral[from] -= amount;
        totalTraderFreeCollateral -= amount; // Maintenance of Invariant
        
        traderCollateral[to] += amount;
        totalTraderFreeCollateral += amount; // Maintenance of Invariant
        
        emit FeeTransferred(from, to, amount);
        return true;
    }

    ////////////////////////////////////////////////////
    //                  VIEW FUNCTIONS                //
    ////////////////////////////////////////////////////

    function getTraderCollateral(address user) external view returns (uint256) {
        return traderCollateral[user];
    }

    function getLockedCollateral(address user) external view returns (uint256) {
        return lockedCollateral[user];
    }

    function getLpShares(address provider) external view returns (uint256) {
        return lpShares[provider];
    }

    function getLpValue(uint256 shares) external view returns (uint256) {
        if (totalLpShares == 0) return 0;
        return (shares * totalLiquidity) / totalLpShares;
    }
    /**
 * @notice Unlocks collateral for a cancelled limit order.
 * @dev Effectively moves locked funds back to user's available balance.
 */
    function unlockCollateral(address _user, uint256 _amount) external onlyPositionManager {
        if (lockedCollateral[_user] < _amount) revert PerpsErrors.InsufficientBalance();
        
        lockedCollateral[_user] -= _amount;
        totalLockedCollateral -= _amount;
        
        traderCollateral[_user] += _amount;
        totalTraderFreeCollateral += _amount; 
    }
}