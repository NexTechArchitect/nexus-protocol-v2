// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPerpsCore} from "../interfaces/IPerpsCore.sol";
import {PerpsErrors} from "../errors/PerpsErrors.sol";

/**
 * @title   MessageReceiver (Polkadot Hub Stub)
 * @author  NexTechArchitect
 * @notice  Stub contract for Polkadot Hub deployment.
 *          Chainlink CCIP CCIPReceiver is not available on Polkadot Hub testnet.
 *          Cross-chain message receiving will use Polkadot's native XCM protocol
 *          when XCM EVM precompiles are available on Polkadot Hub.
 * @dev     XCM (Cross-Consensus Messaging) is Polkadot's native cross-chain
 *          protocol. Unlike CCIP which is an external oracle network,
 *          XCM is built into the Polkadot relay chain at the protocol level.
 *          This provides stronger security guarantees for cross-chain messages.
 */
contract MessageReceiver is Ownable {

    //////////////////////////////////////////////////
    //              STATE VARIABLES                 //
    //////////////////////////////////////////////////

    /// @notice PositionManager reference — preserved for future XCM integration
    IPerpsCore public positionManager;

    /// @notice Nonce tracking — preserved for replay protection
    mapping(address => mapping(uint256 => bool)) public processedNonces;

    /// @notice Whitelisted source chains — for future XCM parachains
    mapping(uint64 => bool) public whitelistedSourceChains;

    /// @notice Whitelisted senders — for future XCM senders
    mapping(address => bool) public whitelistedSenders;

    //////////////////////////////////////////////////
    //                   EVENTS                     //
    //////////////////////////////////////////////////

    event ReceiverDisabled(string reason);
    event XCMIntegrationPlanned(string message);
    event PositionManagerUpdated(address newManager);

    //////////////////////////////////////////////////
    //                 CONSTRUCTOR                  //
    //////////////////////////////////////////////////

    constructor(address _positionManager) Ownable(msg.sender) {
        if (_positionManager == address(0)) revert PerpsErrors.InvalidAddress();
        positionManager = IPerpsCore(_positionManager);

        emit ReceiverDisabled("CCIP not available on Polkadot Hub testnet");
        emit XCMIntegrationPlanned(
            "Future: XCM precompile integration for cross-parachain messages"
        );
    }

    //////////////////////////////////////////////////
    //            STUB FUNCTIONS                    //
    //////////////////////////////////////////////////

    /**
     * @notice  Returns receiver availability status
     */
    function isReceiverEnabled() external pure returns (bool) {
        return false;
    }

    /**
     * @notice  Returns reason receiver is disabled
     */
    function disabledReason() external pure returns (string memory) {
        return "Chainlink CCIP not available on Polkadot Hub. XCM integration planned.";
    }

    /**
     * @notice  Returns XCM integration roadmap
     */
    function xcmRoadmap() external pure returns (string memory) {
        return "Phase 1: Deploy on Polkadot Hub EVM. Phase 2: Integrate XCM precompiles for parachain messaging. Phase 3: Cross-parachain perpetuals with shared liquidity.";
    }

    //////////////////////////////////////////////////
    //              ADMIN FUNCTIONS                 //
    //////////////////////////////////////////////////

    /**
     * @notice  Update PositionManager — preserved for future use
     */
    function updatePositionManager(address _newManager) external onlyOwner {
        if (_newManager == address(0)) revert PerpsErrors.InvalidAddress();
        positionManager = IPerpsCore(_newManager);
        emit PositionManagerUpdated(_newManager);
    }

    /**
     * @notice  Whitelist source chain — preserved for future XCM integration
     */
    function setWhitelistedSourceChain(
        uint64 _chainSelector,
        bool _allowed
    ) external onlyOwner {
        whitelistedSourceChains[_chainSelector] = _allowed;
    }

    /**
     * @notice  Whitelist sender — preserved for future XCM integration
     */
    function setWhitelistedSender(
        address _sender,
        bool _allowed
    ) external onlyOwner {
        if (_sender == address(0)) revert PerpsErrors.InvalidAddress();
        whitelistedSenders[_sender] = _allowed;
    }
}
