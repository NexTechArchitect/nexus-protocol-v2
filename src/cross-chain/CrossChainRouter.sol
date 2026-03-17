// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";

/**
 * @title   CrossChainRouter (Polkadot Hub Stub)
 * @author  NexTechArchitect
 * @notice  Stub contract for Polkadot Hub deployment.
 *          Chainlink CCIP is not available on Polkadot Hub testnet.
 *          Cross-chain functionality will be enabled when CCIP support
 *          is added to Polkadot Hub mainnet.
 * @dev     Polkadot's native XCM (Cross-Consensus Messaging) is the
 *          equivalent cross-chain protocol on Polkadot ecosystem.
 *          Future version will integrate XCM for Polkadot-native
 *          cross-chain margin transfers between parachains.
 */
contract CrossChainRouter is Ownable {

    //////////////////////////////////////////////////
    //              STATE VARIABLES                 //
    //////////////////////////////////////////////////

    /// @notice User nonces — preserved for future XCM integration
    mapping(address => uint256) public userNonces;

    /// @notice Placeholder for future XCM destination chains
    mapping(uint64 => bool) public supportedChains;

    //////////////////////////////////////////////////
    //                   EVENTS                     //
    //////////////////////////////////////////////////

    event CrossChainDisabled(string reason);
    event XCMIntegrationPlanned(string message);

    //////////////////////////////////////////////////
    //                 CONSTRUCTOR                  //
    //////////////////////////////////////////////////

    constructor() Ownable(msg.sender) {
        emit CrossChainDisabled("CCIP not available on Polkadot Hub testnet");
        emit XCMIntegrationPlanned(
            "Future: XCM integration for Polkadot parachain cross-chain margin"
        );
    }

    //////////////////////////////////////////////////
    //            STUB FUNCTIONS                    //
    //////////////////////////////////////////////////

    /**
     * @notice  Cross-chain trade — disabled on Polkadot Hub
     * @dev     Will be replaced with XCM send when Polkadot Hub supports it
     */
    function sendTradeRequest(
        uint64, /* _destChainSelector */
        address, /* _token */
        bool,    /* _isLong */
        uint256, /* _margin */
        uint256  /* _leverage */
    ) external payable returns (bytes32) {
        revert PerpsErrors.InvalidParameter();
        // Future: replace with XCM dispatch to Polkadot parachain
    }

    /**
     * @notice  Fee estimation — returns 0 (cross-chain disabled)
     */
    function estimateFee(
        address,  /* _trader */
        uint64,   /* _destChainSelector */
        address,  /* _token */
        bool,     /* _isLong */
        uint256,  /* _margin */
        uint256   /* _leverage */
    ) external pure returns (uint256) {
        return 0;
    }

    /**
     * @notice  Returns cross-chain availability status
     */
    function isCrossChainEnabled() external pure returns (bool) {
        return false;
    }

    /**
     * @notice  Returns reason cross-chain is disabled
     */
    function disabledReason() external pure returns (string memory) {
        return "Chainlink CCIP not available on Polkadot Hub. XCM integration planned.";
    }

    /**
     * @notice  Rescue any accidentally sent ETH
     */
    function rescueFunds(address, uint256) external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success,) = owner().call{value: balance}("");
            require(success, "ETH rescue failed");
        }
    }

    receive() external payable {}
}
