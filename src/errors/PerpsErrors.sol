// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


library PerpsErrors {
    // Input Validation Errors 
    error ZeroAmount();                 // Input amount cannot be zero
    error InvalidAddress();             // Address cannot be zero address
    error InvalidLeverage();            // Leverage exceeds maximum allowed
    error InvalidAsset();               // Asset does not meet criteria (e.g., decimals)
    error InvalidAmount();              // Amount exceeds maximum allowed          

    //  Vault & Collateral Errors
    error InsufficientBalance();        // User or Vault has insufficient funds
    error InsufficientCollateral();     // Margin too low for trade
    error TransferFailed();             // ERC20 transfer failed
    error InvalidBatchSize();           // Batch size exceeds maximum allowed for liquidations
    //  Trading Logic Errors 
    error PositionNotFound();           // Position ID does not exist
    error PositionNotActive();          // Position is already closed
    error PositionNotLiquidatable();    // Position is healthy, cannot liquidate
    error SlippageExceeded();           // Price moved too much during trade
    error PositionAlreadyExists();        // User already has an open position 
    error NoPositionFound();             // User has no open position to close or liquidate
    error InsufficientFunds();          // User does not have enough funds to open or maintain position
    //  Oracle & Risk Errors
    error PriceStale();                 // Oracle data is too old
    error InvalidPrice();               // Oracle returned <= 0
    error InvalidParameter();            // Generic error for invalid parameters (e.g., decimals > 18)
    error PositionHealthy();          // Position is not under collateralized, cannot be liquidated
    error StalePrice();              // Oracle price is stale, cannot proceed with trade
    //  Access Control Errors 
    error Unauthorized();               // Caller is not allowed

    // account abstraction erros 
    
    error InvalidNonce();
    error InvalidEntryPoint();
    error InvalidOwner();
    error InvalidTarget();
    error CallFailed();
    error LengthMismatch();


 
}
