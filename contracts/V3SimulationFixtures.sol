// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./SimulationFixtures.sol";

// Test-only ABI/execution fixture, not a Uniswap pool or authenticated router.
contract FixtureV3Router {
    struct WithDeadline { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }
    struct WithoutDeadline { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }
    function exactInputSingle(WithDeadline calldata p) external payable returns(uint256) {
        require(block.timestamp <= p.deadline, "expired");
        return swap(p.tokenIn,p.tokenOut,p.recipient,p.amountIn,p.amountOutMinimum);
    }
    function exactInputSingle(WithoutDeadline calldata p) external payable returns(uint256) {
        return swap(p.tokenIn,p.tokenOut,p.recipient,p.amountIn,p.amountOutMinimum);
    }
    function swap(address tokenIn,address tokenOut,address recipient,uint256 amount,uint256 minimum) private returns(uint256) {
        require(msg.value == 0 && amount >= minimum, "fixture scope");
        FixtureToken(tokenIn).transferFrom(msg.sender,address(this),amount);
        FixtureToken(tokenOut).mint(recipient,amount);
        return amount;
    }
}
