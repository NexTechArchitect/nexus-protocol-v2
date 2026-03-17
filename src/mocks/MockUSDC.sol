// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** 6;
    uint256 public constant FAUCET_COOLDOWN = 24 hours;
    mapping(address => uint256) public lastFaucetClaim;

    event FaucetClaimed(address indexed user, uint256 amount);

    constructor(uint256 _initialSupply) ERC20("Mock USDC", "USDC") Ownable(msg.sender) {
        _mint(msg.sender, _initialSupply * 10 ** DECIMALS);
    }

    function faucet() external {
        require(
            block.timestamp >= lastFaucetClaim[msg.sender] + FAUCET_COOLDOWN,
            "MockUSDC: Faucet cooldown active"
        );
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "MockUSDC: mint to zero address");
        require(_amount > 0, "MockUSDC: zero amount");
        _mint(_to, _amount);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function timeUntilNextClaim(address _user) external view returns (uint256) {
        uint256 nextClaim = lastFaucetClaim[_user] + FAUCET_COOLDOWN;
        if (block.timestamp >= nextClaim) return 0;
        return nextClaim - block.timestamp;
    }
}
