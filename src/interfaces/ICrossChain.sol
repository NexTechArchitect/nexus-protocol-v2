// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Client} from "@chainlink/contracts/ccip/libraries/Client.sol";
interface ICrossChain {
    
    struct CrossChainMessage {
        uint256 positionId;
        address user;
        address asset;
        bool isLong;
        uint256 collateral;
        uint256 leverage;
        uint256 entryPrice;
        uint64 sourceChain;
    }
    
    ///////////////////////////////////////////////
    //                  EVENTS                   //
    ///////////////////////////////////////////////
    event PositionBridged(
        uint256 indexed positionId,
        address indexed user,
        uint64 sourceChain,
        uint64 destinationChain
    );
    
    event CollateralBridged(
        address indexed user,
        uint256 amount,
        uint64 sourceChain,
        uint64 destinationChain
    );
    
    event MessageReceived(bytes32 indexed messageId, uint64 sourceChain, address sender);
    event ChainAdded(uint64 indexed chainSelector, address receiver);
    
    //////////////////////////////////////////////// 
    //              CROSS-CHAIN FUNCTIONS         //
    ////////////////////////////////////////////////
    function bridgePosition(uint256 positionId, uint64 destinationChain) external payable;
    
    function sendCollateral(uint256 amount, uint64 destinationChain, address recipient) external payable;
    
    function estimateFee(uint64 destinationChain, Client.EVM2AnyMessage memory message) external view returns (uint256);
    
    function getSupportedChains() external view returns (uint64[] memory);
    
    function isChainSupported(uint64 chainSelector) external view returns (bool);
    
    function emergencyWithdraw(uint256 positionId) external;
    
    ////////////////////////////////////////////////
    //              RECEIVER FUNCTIONS            //
    ////////////////////////////////////////////////
    function ccipReceive(Client.Any2EVMMessage calldata message) external;
}