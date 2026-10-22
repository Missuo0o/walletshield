// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Test-only contracts for isolated simulation acceptance. No production use.
contract FixtureToken {
    string public constant symbol="FIX";uint8 public constant decimals=18;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    bool public blocked;address public router;
    event Transfer(address indexed from,address indexed to,uint256 value);
    event Approval(address indexed owner,address indexed spender,uint256 value);
    constructor(address owner){balanceOf[owner]=1000000 ether;}
    function setRouter(address value,bool blockSell) external{router=value;blocked=blockSell;}
    function mint(address owner,uint256 amount) external{balanceOf[owner]+=amount;emit Transfer(address(0),owner,amount);}
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);return true;}
    function transfer(address to,uint256 amount) external returns(bool){require(!blocked||to!=router,"sell blocked");balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;emit Transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){require(!blocked||to!=router,"sell blocked");require(allowance[from][msg.sender]>=amount,"allowance");allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;emit Transfer(from,to,amount);return true;}
}
contract FixtureRouter {
    function swapExactTokensForTokens(uint256 amountIn,uint256,address[] calldata path,address to,uint256) external returns(uint256[] memory amounts){
        FixtureToken(path[0]).transferFrom(msg.sender,address(this),amountIn);FixtureToken(path[path.length-1]).mint(to,amountIn);
        amounts=new uint256[](2);amounts[0]=amountIn;amounts[1]=amountIn;
    }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn,uint256,address[] calldata path,address to,uint256) external{
        FixtureToken(path[0]).transferFrom(msg.sender,address(this),amountIn);FixtureToken(path[path.length-1]).mint(to,amountIn);
    }
}
contract FixturePermit is FixtureToken {
    bytes32 public immutable DOMAIN_SEPARATOR;
    mapping(address=>uint256) public nonces;
    constructor(address owner) FixtureToken(owner){DOMAIN_SEPARATOR=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("FixturePermit"),keccak256("1"),block.chainid,address(this)));}
}

contract FixtureVault {
    address public immutable asset;
    address public owner;
    bool public constant paused=false;
    uint256 public constant totalAssets=1000;
    uint256 public constant totalSupply=900;
    constructor(address token){asset=token;owner=msg.sender;}
    function previewDeposit(uint256 assets) external pure returns(uint256){return assets*9/10;}
    function maxDeposit(address) external pure returns(uint256){return 100000;}
    function deposit(uint256 assets,address) external pure returns(uint256){return assets*9/10;}
}
contract FixturePool {
    struct Configuration {uint256 data;}
    function getUserAccountData(address) external pure returns(uint256,uint256,uint256,uint256,uint256,uint256){return (2000,1000,100,8000,7500,9e17);}
    function getConfiguration(address) external pure returns(Configuration memory){return Configuration(1);}
    function borrow(address,uint256,uint256,uint16,address) external pure {}
}
