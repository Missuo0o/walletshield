// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately minimal local test token. Never deploy for production use.
contract TestUSD {
    string public constant name = "WalletShield Test USD";
    string public constant symbol = "TEST-USD";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    constructor(address owner) { totalSupply = 5000 * 10**6; balanceOf[owner] = totalSupply; emit Transfer(address(0), owner, totalSupply); }
    /// @notice Local-only faucet. Top up to 5,000 TEST-USD, never reduce a balance.
    function faucet(address recipient) external returns (uint256 minted) {
        require((block.chainid == 31337 || block.chainid == 31338), "local chain only");
        require(recipient != address(0), "zero recipient");
        uint256 target = 5000 * 10**6;
        if (balanceOf[recipient] < target) {
            minted = target - balanceOf[recipient];
            totalSupply += minted;
            balanceOf[recipient] += minted;
            emit Transfer(address(0), recipient, minted);
        }
    }
    function approve(address spender, uint256 value) external returns (bool) {
        require(spender != address(0), "zero spender");
        allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true;
    }
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(allowance[from][msg.sender] >= value, "insufficient allowance");
        require(balanceOf[from] >= value, "insufficient balance");
        if (allowance[from][msg.sender] != type(uint256).max) allowance[from][msg.sender] -= value;
        balanceOf[from] -= value; balanceOf[to] += value; emit Transfer(from, to, value); return true;
    }
}
