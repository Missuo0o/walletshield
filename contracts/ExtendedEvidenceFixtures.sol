// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Isolated evidence-test fixtures only. These imitate selected public getters;
// they are not production tokens, a multisig, a position manager, or audited
// protocol implementations. No permit/signature consumption is implemented.
contract ExtendedEvidenceToken {
    address private immutable admin = msg.sender;
    bytes32 private immutable domain;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) private nonceByHolder;
    mapping(address => mapping(bytes32 => bool)) private used;
    bool public unavailableDomain;
    bool public unavailableNonce;
    bool public unavailableAuthorization;
    string public constant symbol = "EXT-FIXTURE";
    uint8 public constant decimals = 6;

    constructor() {
        domain = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Extended Evidence Fixture"), keccak256("1"), block.chainid, address(this)
        ));
    }
    modifier onlyAdmin() { require(msg.sender == admin, "fixture admin only"); _; }
    function seed(address owner, uint256 balance, uint256 nonce) external onlyAdmin {
        balanceOf[owner] = balance; nonceByHolder[owner] = nonce;
    }
    function setAuthorizationUsed(address owner, bytes32 nonce, bool value) external onlyAdmin { used[owner][nonce] = value; }
    function setUnavailable(bool domain_, bool nonce_, bool authorization_) external onlyAdmin {
        unavailableDomain = domain_; unavailableNonce = nonce_; unavailableAuthorization = authorization_;
    }
    function DOMAIN_SEPARATOR() external view returns (bytes32) { require(!unavailableDomain, "fixture domain unavailable"); return domain; }
    function nonces(address holder) external view returns (uint256) { require(!unavailableNonce, "fixture nonce unavailable"); return nonceByHolder[holder]; }
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) { require(!unavailableAuthorization, "fixture authorization unavailable"); return used[authorizer][nonce]; }
}

contract ExtendedEvidenceAccount {
    address private immutable admin = msg.sender;
    address[] private owners;
    mapping(address => bool) private modules;
    bool public unavailableThreshold;
    constructor(address otherOwner) { owners.push(msg.sender); owners.push(otherOwner); }
    modifier onlyAdmin() { require(msg.sender == admin, "fixture admin only"); _; }
    function getOwners() external view returns (address[] memory) { return owners; }
    function getThreshold() external view returns (uint256) { require(!unavailableThreshold, "fixture threshold unavailable"); return 2; }
    function isModuleEnabled(address module) external view returns (bool) { return modules[module]; }
    function enableModule(address module) external onlyAdmin { modules[module] = true; }
    function setUnavailableThreshold(bool value) external onlyAdmin { unavailableThreshold = value; }
}

contract ExtendedEvidencePosition {
    address private immutable admin = msg.sender;
    address private immutable asset0;
    address private immutable asset1;
    address private immutable positionOwner;
    address private immutable approved;
    bool public unavailablePosition;
    bool public unavailableApproval;
    constructor(address token0, address token1, address owner, address operator) {
        asset0 = token0; asset1 = token1; positionOwner = owner; approved = operator;
    }
    function setUnavailable(bool position_, bool approval_) external {
        require(msg.sender == admin, "fixture admin only"); unavailablePosition = position_; unavailableApproval = approval_;
    }
    function positions(uint256 tokenId) external view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128) {
        require(tokenId == 7 && !unavailablePosition, "fixture position unavailable");
        return (5, approved, asset0, asset1, 3000, -120, 180, 10, 20, 30, 4, 5);
    }
    function ownerOf(uint256 tokenId) external view returns (address) { require(tokenId == 7, "fixture ID"); return positionOwner; }
    function getApproved(uint256 tokenId) external view returns (address) { require(tokenId == 7 && !unavailableApproval, "fixture approval unavailable"); return approved; }
    function isApprovedForAll(address owner, address operator) external view returns (bool) { return owner == positionOwner && operator == admin; }
}
