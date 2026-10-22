// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Local fixtures only. These contracts deliberately simplify protocol economics;
// their names and function shapes are NOT implementations of live protocols.
abstract contract LocalOnly {
    constructor() { require(block.chainid == 31337, "local chain only"); }
}
contract LabToken is LocalOnly {
    string public name; string public symbol; uint8 public immutable decimals;
    uint256 public totalSupply; address public immutable admin;
    address public blockedRecipient;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    mapping(address=>uint256) public nonces;
    bytes32 public immutable DOMAIN_SEPARATOR;
    event Transfer(address indexed from,address indexed to,uint256 value);
    event Approval(address indexed owner,address indexed spender,uint256 value);
    constructor(string memory n,string memory s,uint8 d) {
        name=n; symbol=s; decimals=d; admin=msg.sender;
        DOMAIN_SEPARATOR=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256(bytes(n)),keccak256("1"),block.chainid,address(this)));
    }
    function faucet(address to) external { require(block.chainid==31337,"local only"); uint256 target=5000*10**decimals; if(balanceOf[to]<target)_mint(to,target-balanceOf[to]); }
    function seed(address to,uint256 amount) external { require(msg.sender==admin,"admin"); _mint(to,amount); }
    function blockRecipient(address target) external { require(msg.sender==admin,"admin"); blockedRecipient=target; }
    function _mint(address to,uint256 amount) internal { require(to!=address(0),"zero"); totalSupply+=amount; balanceOf[to]+=amount; emit Transfer(address(0),to,amount); }
    function mint(address to,uint256 amount) external { require(amount<=100*10**decimals,"fixture cap"); _mint(to,amount); }
    function burn(uint256 amount) external { require(balanceOf[msg.sender]>=amount,"balance"); balanceOf[msg.sender]-=amount; totalSupply-=amount; emit Transfer(msg.sender,address(0),amount); }
    function approve(address spender,uint256 amount) external returns(bool) { allowance[msg.sender][spender]=amount; emit Approval(msg.sender,spender,amount); return true; }
    function _transfer(address from,address to,uint256 amount) internal { require(to!=address(0),"zero"); require(to!=blockedRecipient,"fixture sell blocked"); require(balanceOf[from]>=amount,"balance"); balanceOf[from]-=amount; balanceOf[to]+=amount; emit Transfer(from,to,amount); }
    function transfer(address to,uint256 amount) external returns(bool) { _transfer(msg.sender,to,amount); return true; }
    function transferFrom(address from,address to,uint256 amount) external returns(bool) { uint256 allowed=allowance[from][msg.sender]; require(allowed>=amount,"allowance"); if(allowed!=type(uint256).max)allowance[from][msg.sender]=allowed-amount; _transfer(from,to,amount); return true; }
    function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s) external {
        require(block.timestamp<=deadline,"expired");
        bytes32 digest=keccak256(abi.encodePacked("\x19\x01",DOMAIN_SEPARATOR,keccak256(abi.encode(keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),owner,spender,value,nonces[owner],deadline))));
        require(owner!=address(0)&&ecrecover(digest,v,r,s)==owner,"signature");nonces[owner]++;allowance[owner][spender]=value;emit Approval(owner,spender,value);
    }
}
contract LabNFT is LocalOnly {
    string public constant name="WalletShield Lab NFT"; string public constant symbol="LAB-NFT";
    uint256 private nextId=1;
    mapping(uint256=>address) public ownerOf; mapping(address=>uint256) public balanceOf;
    mapping(uint256=>address) public getApproved; mapping(address=>mapping(address=>bool)) public isApprovedForAll;
    mapping(address=>uint256) public testId;
    event Transfer(address indexed from,address indexed to,uint256 indexed tokenId);
    event Approval(address indexed owner,address indexed approved,uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner,address indexed operator,bool approved);
    function supportsInterface(bytes4 id) external pure returns(bool) { return id==0x80ac58cd||id==0x01ffc9a7; }
    function faucet(address to) external { if(testId[to]!=0&&ownerOf[testId[to]]==to)return; uint256 id=nextId++;testId[to]=id;ownerOf[id]=to;balanceOf[to]++;emit Transfer(address(0),to,id); }
    function approve(address to,uint256 id) external { require(ownerOf[id]==msg.sender||isApprovedForAll[ownerOf[id]][msg.sender],"owner");getApproved[id]=to;emit Approval(ownerOf[id],to,id); }
    function setApprovalForAll(address op,bool allowed) external { isApprovedForAll[msg.sender][op]=allowed;emit ApprovalForAll(msg.sender,op,allowed); }
    function transferFrom(address from,address to,uint256 id) public { require(to!=address(0)&&ownerOf[id]==from,"owner");require(msg.sender==from||getApproved[id]==msg.sender||isApprovedForAll[from][msg.sender],"permission");delete getApproved[id];ownerOf[id]=to;balanceOf[from]--;balanceOf[to]++;emit Transfer(from,to,id); }
    function safeTransferFrom(address from,address to,uint256 id) external { transferFrom(from,to,id);require(to.code.length==0,"fixture EOA only"); }
}
contract LabMultiNFT is LocalOnly {
    mapping(address=>mapping(uint256=>uint256)) private balances;
    mapping(address=>mapping(address=>bool)) public isApprovedForAll;
    event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value);
    event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values);
    event ApprovalForAll(address indexed account,address indexed operator,bool approved);
    function supportsInterface(bytes4 id) external pure returns(bool) { return id==0xd9b67a26||id==0x01ffc9a7; }
    function balanceOf(address account,uint256 id) external view returns(uint256) { return balances[account][id]; }
    function faucet(address to) external { for(uint256 id=1;id<=2;id++)if(balances[to][id]<10){uint256 add=10-balances[to][id];balances[to][id]=10;emit TransferSingle(msg.sender,address(0),to,id,add);} }
    function setApprovalForAll(address op,bool allowed) external { isApprovedForAll[msg.sender][op]=allowed;emit ApprovalForAll(msg.sender,op,allowed); }
    function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes calldata) external { require(to!=address(0)&&to.code.length==0,"EOA only");require(from==msg.sender||isApprovedForAll[from][msg.sender],"permission");require(balances[from][id]>=amount,"balance");balances[from][id]-=amount;balances[to][id]+=amount;emit TransferSingle(msg.sender,from,to,id,amount); }
    function safeBatchTransferFrom(address from,address to,uint256[] calldata ids,uint256[] calldata amounts,bytes calldata) external { require(ids.length==amounts.length&&to!=address(0)&&to.code.length==0,"shape");require(from==msg.sender||isApprovedForAll[from][msg.sender],"permission");for(uint256 i;i<ids.length;i++){require(balances[from][ids[i]]>=amounts[i],"balance");balances[from][ids[i]]-=amounts[i];balances[to][ids[i]]+=amounts[i];}emit TransferBatch(msg.sender,from,to,ids,amounts); }
}
contract LabRouter is LocalOnly {
    // Fixed 1:1 token quote / fixed native quote. No real pool, slippage market or MEV.
    receive() external payable {}
    function swapExactTokensForTokens(uint256 amount,uint256 minimum,address[] calldata path,address to,uint256 deadline) external returns(uint256[] memory values) { require(path.length==2&&block.timestamp<=deadline&&amount>=minimum,"route");LabToken(path[0]).transferFrom(msg.sender,address(this),amount);LabToken(path[1]).transfer(to,amount);values=new uint256[](2);values[0]=amount;values[1]=amount; }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amount,uint256 minimum,address[] calldata path,address to,uint256 deadline) external { require(path.length==2&&block.timestamp<=deadline&&amount>=minimum,"route");LabToken(path[0]).transferFrom(msg.sender,address(this),amount);LabToken(path[1]).transfer(to,amount); }
    function swapExactETHForTokens(uint256 minimum,address[] calldata path,address to,uint256 deadline) external payable returns(uint256[] memory values) { uint256 amount=msg.value/10**12;require(path.length==2&&block.timestamp<=deadline&&amount>=minimum,"route");LabToken(path[1]).transfer(to,amount);values=new uint256[](2);values[0]=msg.value;values[1]=amount; }
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amount,uint256 minimum,address[] calldata path,address to,uint256 deadline) external { uint256 value=amount*10**12;require(path.length==2&&block.timestamp<=deadline&&value>=minimum,"route");LabToken(path[0]).transferFrom(msg.sender,address(this),amount);(bool ok,)=to.call{value:value}("");require(ok,"native"); }
    struct ExactInput { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }
    function exactInputSingle(ExactInput calldata p) external returns(uint256) { require(block.timestamp<=p.deadline&&p.amountIn>=p.amountOutMinimum,"route");LabToken(p.tokenIn).transferFrom(msg.sender,address(this),p.amountIn);LabToken(p.tokenOut).transfer(p.recipient,p.amountIn);return p.amountIn; }
}
contract LabVault is LocalOnly {
    address public immutable asset;mapping(address=>uint256) public balanceOf;uint256 public totalSupply;
    constructor(address token){asset=token;}
    function totalAssets() external view returns(uint256){return LabToken(asset).balanceOf(address(this));}
    function previewDeposit(uint256 amount) external pure returns(uint256){return amount;}
    function previewRedeem(uint256 amount) external pure returns(uint256){return amount;}
    function maxDeposit(address) external pure returns(uint256){return type(uint256).max;}
    function maxRedeem(address who) external view returns(uint256){return balanceOf[who];}
    function deposit(uint256 amount,address receiver) external returns(uint256){LabToken(asset).transferFrom(msg.sender,address(this),amount);balanceOf[receiver]+=amount;totalSupply+=amount;return amount;}
    function redeem(uint256 shares,address receiver,address owner) external returns(uint256){require(owner==msg.sender&&balanceOf[owner]>=shares,"shares");balanceOf[owner]-=shares;totalSupply-=shares;LabToken(asset).transfer(receiver,shares);return shares;}
}
contract LabLending is LocalOnly {
    LabToken public immutable token;mapping(address=>uint256) public collateral;mapping(address=>uint256) public debt;
    constructor(address asset){token=LabToken(asset);}
    function supply(address asset,uint256 amount,address who,uint16) external {require(asset==address(token),"asset");token.transferFrom(msg.sender,address(this),amount);collateral[who]+=amount;}
    function borrow(address asset,uint256 amount,uint256,uint16,address who) external {require(asset==address(token)&&who==msg.sender,"asset");require((debt[who]+amount)*2<=collateral[who],"collateral");debt[who]+=amount;token.transfer(msg.sender,amount);}
    function getUserAccountData(address who) external view returns(uint256,uint256,uint256,uint256,uint256,uint256){uint256 c=collateral[who];uint256 d=debt[who];return(c,d,c/2>d?c/2-d:0,8000,5000,d==0?type(uint256).max:c*8*10**17/d);}
    function getConfiguration(address) external pure returns(uint256){return 0;}
}
contract LabActions is LocalOnly {
    LabToken public immutable token;mapping(address=>uint256) public staked;mapping(address=>uint256) public liquidity;
    event LocalBridgeDeposit(address indexed sender,address indexed recipient,uint256 amount);
    event NativeReceived(address indexed sender,uint256 value);
    constructor(address asset){token=LabToken(asset);}
    receive() external payable {emit NativeReceived(msg.sender,msg.value);}
    fallback() external payable {emit NativeReceived(msg.sender,msg.value);}
    function stake(uint256 amount) external {token.transferFrom(msg.sender,address(this),amount);staked[msg.sender]+=amount;}
    function unstake(uint256 amount) external {require(staked[msg.sender]>=amount,"stake");staked[msg.sender]-=amount;token.transfer(msg.sender,amount);}
    function addLiquidity(address tokenA,address tokenB,uint256 a,uint256 b,uint256 minA,uint256 minB,address to,uint256 deadline) external returns(uint256,uint256,uint256){require(block.timestamp<=deadline&&a>=minA&&b>=minB,"limits");LabToken(tokenA).transferFrom(msg.sender,address(this),a);LabToken(tokenB).transferFrom(msg.sender,address(this),b);liquidity[to]+=a+b;return(a,b,a+b);}
    function bridgeETHTo(address to,uint32,bytes calldata) external payable {require(to!=address(0),"recipient");emit LocalBridgeDeposit(msg.sender,to,msg.value);}
    function claim(uint256,address account,uint256 amount,bytes32[] calldata proof) external {require(account==msg.sender&&proof.length==0&&amount<=10**6,"fixture claim");token.transfer(account,amount);}
    function multicall(uint256 deadline,bytes[] calldata calls) external {require(block.timestamp<=deadline&&calls.length<=4,"batch");for(uint256 i;i<calls.length;i++){(bool ok,)=address(this).delegatecall(calls[i]);require(ok,"subcall");}}
}
contract LabControl is LocalOnly {
    address public immutable admin; address public owner;address public implementation;
    constructor(){admin=msg.sender;owner=msg.sender;}
    function resetTester(address who) external {require(msg.sender==admin,"admin");owner=who;}
    function transferOwnership(address who) external {require(msg.sender==owner&&who!=address(0),"owner");owner=who;}
    // Records a candidate only; intentionally does not delegatecall untrusted code.
    function upgradeToAndCall(address target,bytes calldata data) external payable {require(msg.sender==owner&&data.length==0,"owner");implementation=target;}
}
contract LabPermit2 is LocalOnly {
    struct Permission{uint160 amount;uint48 expiration;uint48 nonce;}
    mapping(address=>mapping(address=>mapping(address=>Permission))) public allowance;
    mapping(address=>mapping(uint256=>uint256)) public nonceBitmap;
    function approve(address token,address spender,uint160 amount,uint48 expiration) external {Permission storage p=allowance[msg.sender][token][spender];p.amount=amount;p.expiration=expiration;}
}
contract LabWrapped is LocalOnly {
    string public constant name="WalletShield Wrapped Test ETH";string public constant symbol="WLAB";uint8 public constant decimals=18;
    mapping(address=>uint256) public balanceOf;uint256 public totalSupply;
    event Transfer(address indexed from,address indexed to,uint256 value);
    function deposit() external payable {balanceOf[msg.sender]+=msg.value;totalSupply+=msg.value;emit Transfer(address(0),msg.sender,msg.value);}
    function withdraw(uint256 amount) external {require(balanceOf[msg.sender]>=amount,"balance");balanceOf[msg.sender]-=amount;totalSupply-=amount;emit Transfer(msg.sender,address(0),amount);(bool ok,)=msg.sender.call{value:amount}("");require(ok,"native");}
}
contract LabOwned is LocalOnly {address public owner;constructor(address who){owner=who;}}
