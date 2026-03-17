// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {PerpsVault} from "./PerpsVault.sol";
import {PnLCalculator} from "../math/PnLCalculator.sol";
import {IPerpsCore} from "../interfaces/IPerpsCore.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol"; 
import {PerpsErrors} from "../errors/PerpsErrors.sol";

/**
 * @title   PositionManager (V2 - Pro Edition)
 * @author  NexTechArchitect
 * @notice  Core trading engine managing position lifecycles, Cross/Isolated Margin, and Limit Orders.
 */
contract PositionManager is Ownable, ReentrancyGuard, Pausable {

    ///////////////////////////////////////////////////////
    //                STRUCTS                            //
    ///////////////////////////////////////////////////////

    struct LimitOrder {
        address trader;
        address token;
        uint256 collateral;
        uint256 leverage;
        uint256 targetPrice;
        bool isLong;
        IPerpsCore.MarginMode mode;
        bool isActive;
    }

    ///////////////////////////////////////////////////////
    //                STATE VARIABLES                    //
    ///////////////////////////////////////////////////////

    PerpsVault public immutable VAULT;
    IPriceOracle public immutable PRICE_ORACLE; 
    
    mapping(address => bool) public whitelistedOracles;
    mapping(address => mapping(address => IPerpsCore.Position)) public positions;

    // Limit Orders tracking
    mapping(address => mapping(address => mapping(uint256 => LimitOrder))) public limitOrders;
    mapping(address => uint256) public userOrderCount; 

    mapping(address => address[]) public userActiveAssets;
    uint256 public maxActiveAssets = 20; 

    address public crossChainReceiver;
    uint256 public maxLeverage;
    uint256 public liquidationThresholdBps;
    uint256 public liquidatorFeeBps;
    uint256 public keeperRewardBps = 10; // 0.1% reward for Keepers
    
    uint256 private constant BPS_DENOMINATOR = 10_000;

    ///////////////////////////////////////////////////////
    //                    EVENTS                         //
    ///////////////////////////////////////////////////////
    
    // Local Trade Events
    event PositionOpened(address indexed user, address indexed asset, bool isLong, uint256 collateral, uint256 leverage, uint256 entryPrice, IPerpsCore.MarginMode mode);
    event PositionClosed(address indexed user, address indexed asset, int256 pnl, uint256 payout);
    event PositionLiquidated(address indexed trader, address indexed asset, address indexed liquidator, uint256 reward, IPerpsCore.MarginMode mode);
    
    // Cross-Chain Trade Events
    event CrossChainPositionClosed(address indexed user, address indexed asset, int256 pnl);
    event CrossChainPositionLiquidated(address indexed trader, address indexed asset, address indexed liquidator, uint256 reward);

    // Config Events
    event AssetAdded(address indexed token);
    event AssetRemoved(address indexed token); 
    event MaxLeverageUpdated(uint256 newMaxLeverage);
    event LiquidationSettingsUpdated(uint256 thresholdBps, uint256 feeBps);
    event CrossChainReceiverUpdated(address newReceiver);
    event MaxActiveAssetsUpdated(uint256 newMax);

    // Limit Order Events
    event LimitOrderPlaced(address indexed user, address indexed asset, uint256 orderId, uint256 targetPrice, bool isLong);
    event LimitOrderExecuted(address indexed user, address indexed asset, uint256 orderId, uint256 executionPrice, address indexed keeper);
    event LimitOrderCancelled(address indexed user, address indexed asset, uint256 orderId);

    /////////////////////////////////////////////////////////
    //                    MODIFIERS                        //
    /////////////////////////////////////////////////////////

    modifier onlyCrossChainReceiver() {
        if (msg.sender != crossChainReceiver) revert PerpsErrors.Unauthorized();
        _;
    }

    /////////////////////////////////////////////////////////
    //                    CONSTRUCTOR                      //
    /////////////////////////////////////////////////////////
    
    constructor(address _vault, address _priceOracle, uint256 _maxLeverage) Ownable(msg.sender) {
        if (_vault == address(0) || _priceOracle == address(0)) revert PerpsErrors.InvalidAddress();
        if (_maxLeverage == 0) revert PerpsErrors.InvalidLeverage();

        VAULT = PerpsVault(_vault);
        PRICE_ORACLE = IPriceOracle(_priceOracle); 
        maxLeverage = _maxLeverage;

        // Default Risk Settings
        liquidationThresholdBps = 8000; // 80% Maintenance Margin
        liquidatorFeeBps = 1000;        // 10%
    }

    ///////////////////////////////////////////////////////
    //                ASSET MANAGEMENT                   //
    ///////////////////////////////////////////////////////

    function addAsset(address _token) external onlyOwner {
        if (_token == address(0)) revert PerpsErrors.InvalidAddress();
        if (whitelistedOracles[_token]) revert PerpsErrors.InvalidParameter(); 
        
        whitelistedOracles[_token] = true;
        emit AssetAdded(_token);
    }

    function removeAsset(address _token) external onlyOwner {
        if (!whitelistedOracles[_token]) revert PerpsErrors.InvalidAsset();
        
        whitelistedOracles[_token] = false;
        emit AssetRemoved(_token);
    }

    ///////////////////////////////////////////////////////
    //             LIMIT ORDER LOGIC                     //
    ///////////////////////////////////////////////////////

    function placeLimitOrder(
        address _token, uint256 _collateral, uint256 _leverage, 
        uint256 _targetPrice, bool _isLong, IPerpsCore.MarginMode _mode
    ) external nonReentrant whenNotPaused {
        if (!whitelistedOracles[_token]) revert PerpsErrors.InvalidAsset();
        if (_collateral == 0) revert PerpsErrors.ZeroAmount();
        if (_leverage == 0 || _leverage > maxLeverage) revert PerpsErrors.InvalidLeverage();

        VAULT.lockCollateral(msg.sender, _collateral);

        uint256 orderId = userOrderCount[msg.sender]++;
        limitOrders[msg.sender][_token][orderId] = LimitOrder({
            trader: msg.sender, token: _token, collateral: _collateral,
            leverage: _leverage, targetPrice: _targetPrice, isLong: _isLong,
            mode: _mode, isActive: true
        });

        emit LimitOrderPlaced(msg.sender, _token, orderId, _targetPrice, _isLong);
    }

    function cancelLimitOrder(address _token, uint256 _orderId) external nonReentrant {
        LimitOrder memory order = limitOrders[msg.sender][_token][_orderId];
        require(order.isActive, "Order inactive");
        
        limitOrders[msg.sender][_token][_orderId].isActive = false;
        
        VAULT.unlockCollateral(msg.sender, order.collateral); 
        
        emit LimitOrderCancelled(msg.sender, _token, _orderId);
    }

    function executeLimitOrder(address _trader, address _token, uint256 _orderId) external nonReentrant whenNotPaused {
        LimitOrder memory order = limitOrders[_trader][_token][_orderId];
        require(order.isActive, "Order inactive");

        uint256 currentPrice = _getOraclePrice(_token);
        
        if (order.isLong) {
            require(currentPrice <= order.targetPrice, "Price too high for Long");
        } else {
            require(currentPrice >= order.targetPrice, "Price too low for Short");
        }

        limitOrders[_trader][_token][_orderId].isActive = false;

        uint256 keeperFee = (order.collateral * keeperRewardBps) / BPS_DENOMINATOR;
        uint256 finalCollateral = order.collateral - keeperFee;

        VAULT.transferByManager(order.trader, msg.sender, keeperFee);

        _storePosition(_trader, _token, finalCollateral, order.leverage, order.isLong, currentPrice, false, order.mode);
        
        emit LimitOrderExecuted(_trader, _token, _orderId, currentPrice, msg.sender);
    }

    ///////////////////////////////////////////////////////
    //             MARKET POSITION LOGIC                 //
    ///////////////////////////////////////////////////////

    function openPosition(
        address _token, uint256 _collateralDelta, uint256 _leverage, 
        bool _isLong, IPerpsCore.MarginMode _mode
    ) external nonReentrant whenNotPaused {
        if (!whitelistedOracles[_token]) revert PerpsErrors.InvalidAsset();
        if (_collateralDelta == 0) revert PerpsErrors.ZeroAmount();
        if (_leverage == 0 || _leverage > maxLeverage) revert PerpsErrors.InvalidLeverage();
        if (positions[msg.sender][_token].isOpen) revert PerpsErrors.PositionAlreadyExists();

        uint256 currentPrice = _getOraclePrice(_token);
        if (currentPrice == 0) revert PerpsErrors.InvalidPrice();

        VAULT.lockCollateral(msg.sender, _collateralDelta);
        _storePosition(msg.sender, _token, _collateralDelta, _leverage, _isLong, currentPrice, false, _mode);
    }

    function executeCrossChainTrade(
        address trader, address token, bool isLong, 
        uint256 margin, uint256 leverage
    ) external onlyCrossChainReceiver whenNotPaused {
        if (!whitelistedOracles[token]) revert PerpsErrors.InvalidAsset();
        if (positions[trader][token].isOpen) revert PerpsErrors.PositionAlreadyExists();
        if (leverage > maxLeverage) revert PerpsErrors.InvalidLeverage();

        uint256 currentPrice = _getOraclePrice(token);
        if (currentPrice == 0) revert PerpsErrors.InvalidPrice();

        _storePosition(trader, token, margin, leverage, isLong, currentPrice, true, IPerpsCore.MarginMode.ISOLATED);
    }

    function _storePosition(
        address _trader, address _token, uint256 _collateral, uint256 _leverage, 
        bool _isLong, uint256 _currentPrice, bool _isCrossChain, IPerpsCore.MarginMode _mode
    ) internal {
        positions[_trader][_token] = IPerpsCore.Position({
            collateral: _collateral,
            leverage: _leverage,
            entryPrice: _currentPrice,
            isLong: _isLong,
            isOpen: true,
            isCrossChain: _isCrossChain,
            mode: _mode 
        });

        _trackActiveAsset(_trader, _token);
        emit PositionOpened(_trader, _token, _isLong, _collateral, _leverage, _currentPrice, _mode);
    }

   function closePosition(address _token, uint256 _price) external nonReentrant whenNotPaused {
    IPerpsCore.Position memory pos = positions[msg.sender][_token];
    if (!pos.isOpen) revert PerpsErrors.NoPositionFound();

    uint256 currentPrice = _price > 0 ? _price : _getOraclePrice(_token);
        int256 pnl = PnLCalculator.calculatePnL(pos, currentPrice);

        delete positions[msg.sender][_token];
        _removeActiveAsset(msg.sender, _token);

        if (!pos.isCrossChain) {
            VAULT.settleTrade(msg.sender, pos.collateral, pnl);
            uint256 estimatedPayout = _calculatePayout(pos.collateral, pnl);
            emit PositionClosed(msg.sender, _token, pnl, estimatedPayout);
        } else {
            emit CrossChainPositionClosed(msg.sender, _token, pnl);
        }
    }

    ///////////////////////////////////////////////////////
    //             LIQUIDATION LOGIC                     //
    ///////////////////////////////////////////////////////

    function liquidate(address _trader, address _token) external nonReentrant whenNotPaused {
        if (_trader == msg.sender) revert PerpsErrors.InvalidAddress();

        IPerpsCore.Position memory pos = positions[_trader][_token];
        if (!pos.isOpen) revert PerpsErrors.NoPositionFound();

        uint256 currentPrice = _getOraclePrice(_token);
        bool isLiquidatable;

        if (pos.mode == IPerpsCore.MarginMode.ISOLATED) {
            isLiquidatable = PnLCalculator.isLiquidatable(pos, currentPrice, liquidationThresholdBps);
        } else {
            int256 totalGlobalPnL = _calculateGlobalPnL(_trader);
            // forge-lint: disable-next-line(unsafe-typecast)
            int256 totalEquity = int256(VAULT.getTraderCollateral(_trader)) + totalGlobalPnL;
            
            // 8000 threshold -> 80% maintenance requirement (Corrected)
            uint256 maintenanceReq = (pos.collateral * liquidationThresholdBps) / BPS_DENOMINATOR;
            isLiquidatable = totalEquity < int256(maintenanceReq);
        }

        if (!isLiquidatable) revert PerpsErrors.PositionHealthy();

        int256 pnl = PnLCalculator.calculatePnL(pos, currentPrice);
        
        uint256 loss = 0;
        if (pnl < 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            loss = uint256(-pnl);
            if (loss > pos.collateral) loss = pos.collateral;
        }

        uint256 residual = pos.collateral - loss;
        uint256 liquidatorReward = 0;

        if (residual > 0 && liquidatorFeeBps > 0) {
            liquidatorReward = (residual * liquidatorFeeBps) / BPS_DENOMINATOR;
        }

        delete positions[_trader][_token];
        _removeActiveAsset(_trader, _token);

        if (!pos.isCrossChain) {
            VAULT.settleTrade(_trader, pos.collateral, pnl);
            if (liquidatorReward > 0) {
                VAULT.transferByManager(_trader, msg.sender, liquidatorReward);
            }
            emit PositionLiquidated(_trader, _token, msg.sender, liquidatorReward, pos.mode);
        } else {
            emit CrossChainPositionLiquidated(_trader, _token, msg.sender, liquidatorReward);
        }
    }

    ///////////////////////////////////////////////////////
    //             INTERNAL HELPERS                      //
    ///////////////////////////////////////////////////////

    function _calculateGlobalPnL(address _trader) internal view returns (int256 totalPnL) {
        address[] memory assets = userActiveAssets[_trader];
        for(uint i = 0; i < assets.length; i++) {
            IPerpsCore.Position memory pos = positions[_trader][assets[i]];
            if (pos.isOpen) {
                uint256 price = _getOraclePrice(assets[i]);
                totalPnL += PnLCalculator.calculatePnL(pos, price);
            }
        }
    }

    function _trackActiveAsset(address _trader, address _token) internal {
        address[] storage assets = userActiveAssets[_trader];
        for(uint i = 0; i < assets.length; i++) {
            if (assets[i] == _token) return; 
        }
        require(assets.length < maxActiveAssets, "Max active markets reached");
        assets.push(_token);
    }

    /**
     * @dev LOW-2 Documented: Removes an asset from tracking. Uses swap-and-pop 
     * for gas efficiency. Note: This changes the order of the array, which is harmless here.
     */
    function _removeActiveAsset(address _trader, address _token) internal {
        address[] storage assets = userActiveAssets[_trader];
        for(uint i = 0; i < assets.length; i++) {
            if (assets[i] == _token) {
                assets[i] = assets[assets.length - 1];
                assets.pop();
                break;
            }
        }
    }

    function _getOraclePrice(address _token) internal view returns (uint256) {
        return PRICE_ORACLE.getPrice(_token);
    }

    function _calculatePayout(uint256 collateral, int256 pnl) internal pure returns (uint256) {
        if (pnl >= 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            return collateral + uint256(pnl);
        } else {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 loss = uint256(-pnl);
            return (loss >= collateral) ? 0 : collateral - loss;
        }
    }

    ////////////////////////////////////////////////////////
    //                ADMIN FUNCTIONS                     //
    ////////////////////////////////////////////////////////

    function setMaxLeverage(uint256 _maxLeverage) external onlyOwner {
        if (_maxLeverage == 0) revert PerpsErrors.InvalidLeverage();
        maxLeverage = _maxLeverage;
        emit MaxLeverageUpdated(_maxLeverage);
    }

    function setLiquidationSettings(uint256 _thresholdBps, uint256 _feeBps) external onlyOwner {
        if (_thresholdBps == 0 || _thresholdBps >= BPS_DENOMINATOR) revert PerpsErrors.InvalidParameter();
        if (_feeBps >= BPS_DENOMINATOR) revert PerpsErrors.InvalidParameter();

        liquidationThresholdBps = _thresholdBps;
        liquidatorFeeBps = _feeBps;
        emit LiquidationSettingsUpdated(_thresholdBps, _feeBps);
    }

    function setCrossChainReceiver(address _receiver) external onlyOwner {
        if (_receiver == address(0)) revert PerpsErrors.InvalidAddress();
        crossChainReceiver = _receiver;
        emit CrossChainReceiverUpdated(_receiver);
    }

    function setKeeperReward(uint256 _newRewardBps) external onlyOwner {
        require(_newRewardBps < BPS_DENOMINATOR, "Invalid fee");
        keeperRewardBps = _newRewardBps;
    }

    function setMaxActiveAssets(uint256 _newMax) external onlyOwner {
        require(_newMax > 0, "Cannot be zero");
        maxActiveAssets = _newMax;
        emit MaxActiveAssetsUpdated(_newMax);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    
    function getCurrentPrice(address _token) external view returns (uint256) {
        return _getOraclePrice(_token);
    }
    
    function getPosition(address user, address token) external view returns (IPerpsCore.Position memory) { 
        return positions[user][token]; 
    }
}