// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./SimulationFixtures.sol";

// Test-only ABI/execution fixture, not a Uniswap pool or authenticated router.
contract FixtureV3Router {
    struct WithDeadline { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }
    struct WithoutDeadline { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }
    struct OutputWithDeadline { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }
    struct OutputWithoutDeadline { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }
    struct PathWithDeadline { bytes path; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; }
    struct PathWithoutDeadline { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }
    struct OutputPathWithDeadline { bytes path; address recipient; uint256 deadline; uint256 amountOut; uint256 amountInMaximum; }
    struct OutputPathWithoutDeadline { bytes path; address recipient; uint256 amountOut; uint256 amountInMaximum; }
    address public WETH9;
    function setWrapper(address wrapper) external { WETH9=wrapper; }
    function exactInputSingle(WithDeadline calldata p) external payable returns(uint256) {
        require(block.timestamp <= p.deadline, "expired");
        return swap(p.tokenIn,p.tokenOut,p.recipient,p.amountIn,p.amountOutMinimum);
    }
    function exactInputSingle(WithoutDeadline calldata p) external payable returns(uint256) {
        return swap(p.tokenIn,p.tokenOut,p.recipient,p.amountIn,p.amountOutMinimum);
    }
    function exactOutputSingle(OutputWithDeadline calldata p) external payable returns(uint256) {
        require(block.timestamp <= p.deadline && p.amountOut <= p.amountInMaximum,"limit");
        return swap(p.tokenIn,p.tokenOut,p.recipient,p.amountOut,p.amountOut);
    }
    function exactOutputSingle(OutputWithoutDeadline calldata p) external payable returns(uint256) {
        require(p.amountOut <= p.amountInMaximum,"limit");
        return swap(p.tokenIn,p.tokenOut,p.recipient,p.amountOut,p.amountOut);
    }
    function exactInput(PathWithDeadline calldata p) external payable returns(uint256) {
        require(block.timestamp <= p.deadline,"expired");(address first,address last)=ends(p.path);
        return swap(first,last,p.recipient,p.amountIn,p.amountOutMinimum);
    }
    function exactInput(PathWithoutDeadline calldata p) external payable returns(uint256) {
        (address first,address last)=ends(p.path);return swap(first,last,p.recipient,p.amountIn,p.amountOutMinimum);
    }
    function exactOutput(OutputPathWithDeadline calldata p) external payable returns(uint256) {
        require(block.timestamp <= p.deadline && p.amountOut <= p.amountInMaximum,"limit");(address first,address last)=ends(p.path);
        return swap(last,first,p.recipient,p.amountOut,p.amountOut);
    }
    function exactOutput(OutputPathWithoutDeadline calldata p) external payable returns(uint256) {
        require(p.amountOut <= p.amountInMaximum,"limit");(address first,address last)=ends(p.path);
        return swap(last,first,p.recipient,p.amountOut,p.amountOut);
    }
    function ends(bytes calldata path) private pure returns(address first,address last) {
        require(path.length>=43 && (path.length-20)%23==0,"path");
        assembly { first:=shr(96,calldataload(path.offset)) last:=shr(96,calldataload(add(path.offset,sub(path.length,20)))) }
    }
    function swap(address tokenIn,address tokenOut,address recipient,uint256 amount,uint256 minimum) private returns(uint256) {
        require(amount >= minimum, "fixture scope");if(recipient==address(1))recipient=msg.sender;
        if(msg.value>0){require(tokenIn==WETH9 && msg.value>=amount,"native");FixtureWrappedNative(payable(WETH9)).deposit{value:amount}();if(msg.value>amount){(bool ok,)=msg.sender.call{value:msg.value-amount}("");require(ok,"refund");}}
        else FixtureToken(tokenIn).transferFrom(msg.sender,address(this),amount);
        if(tokenOut==WETH9)FixtureWrappedNative(payable(WETH9)).transfer(recipient,amount);
        else FixtureToken(tokenOut).mint(recipient,amount);
        return amount;
    }
}

// All wrapped units are backed by actual deposits. The production collector
// must still require explicit code bindings; this is not a trusted deployment.
contract FixtureWrappedNative {
    uint8 public constant decimals=18;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    event Transfer(address indexed from,address indexed to,uint256 amount);
    function deposit() external payable {balanceOf[msg.sender]+=msg.value;emit Transfer(address(0),msg.sender,msg.value);}
    function withdraw(uint256 amount) external {balanceOf[msg.sender]-=amount;emit Transfer(msg.sender,address(0),amount);(bool ok,)=msg.sender.call{value:amount}("");require(ok,"withdraw");}
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;return true;}
    function transfer(address to,uint256 amount) external returns(bool){balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;emit Transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;emit Transfer(from,to,amount);return true;}
}
