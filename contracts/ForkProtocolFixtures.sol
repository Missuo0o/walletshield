// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./SimulationFixtures.sol";

// Isolated execution fixtures with real state changes, not audited protocol implementations.
contract StateFixtureVault {
    address public immutable asset;
    uint8 public constant decimals=18;
    uint256 public totalSupply;
    mapping(address=>uint256) public balanceOf;
    event Transfer(address indexed from,address indexed to,uint256 amount);
    constructor(address token){asset=token;}
    function totalAssets() external view returns(uint256){return FixtureToken(asset).balanceOf(address(this));}
    function maxWithdraw(address account) external view returns(uint256){return balanceOf[account];}
    function maxRedeem(address account) external view returns(uint256){return balanceOf[account];}
    function previewDeposit(uint256 assets) external pure returns(uint256){return assets;}
    function deposit(uint256 assets,address receiver) external returns(uint256){FixtureToken(asset).transferFrom(msg.sender,address(this),assets);balanceOf[receiver]+=assets;totalSupply+=assets;emit Transfer(address(0),receiver,assets);return assets;}
}

contract StateFixtureLending {
    mapping(address=>uint256) public debt;
    function getUserAccountData(address account) external view returns(uint256,uint256,uint256,uint256,uint256,uint256){uint256 owed=100+debt[account];return (1000,owed,owed<800?800-owed:0,8000,7500,800e18/owed);}
    function borrow(address asset,uint256 amount,uint256,uint16,address onBehalfOf) external {require(onBehalfOf==msg.sender,"fixture delegation");debt[onBehalfOf]+=amount;FixtureToken(asset).transfer(msg.sender,amount);}
}

contract StateFixtureAccount {
    address private immutable owner=msg.sender;
    mapping(address=>bool) public isModuleEnabled;
    function getOwners() external view returns(address[] memory owners){owners=new address[](1);owners[0]=owner;}
    function getThreshold() external pure returns(uint256){return 1;}
    function enableModule(address module) external {require(msg.sender==owner,"owner");isModuleEnabled[module]=true;}
}

contract StateFixtureNFT {
    address private immutable owner=msg.sender;
    address private approved;
    mapping(address=>mapping(address=>bool)) public isApprovedForAll;
    function supportsInterface(bytes4 value) external pure returns(bool){return value==0x80ac58cd;}
    function ownerOf(uint256 id) external view returns(address){require(id==0,"ID");return owner;}
    function getApproved(uint256 id) external view returns(address){require(id==0,"ID");return approved;}
    function approve(address spender,uint256 id) external {require(id==0&&msg.sender==owner,"owner");approved=spender;}
    function setApprovalForAll(address operator,bool value) external {isApprovedForAll[msg.sender][operator]=value;}
}
