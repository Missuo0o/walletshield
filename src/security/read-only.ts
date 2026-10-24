/** Exact method names only. Prefixes such as wallet_get* are not a capability
 * boundary: an unknown extension must remain an unrecognized wallet request. */
const READ_ONLY_METHODS=new Set([
 'eth_accounts','eth_chainId','eth_blockNumber','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_syncing',
 'eth_getBalance','eth_getCode','eth_getTransactionCount','eth_getStorageAt','eth_getBlockByHash','eth_getBlockByNumber',
 'eth_getBlockTransactionCountByHash','eth_getBlockTransactionCountByNumber','eth_getTransactionByHash','eth_getTransactionByBlockHashAndIndex','eth_getTransactionByBlockNumberAndIndex',
 'eth_getTransactionReceipt','eth_getUncleByBlockHashAndIndex','eth_getUncleByBlockNumberAndIndex','eth_getUncleCountByBlockHash','eth_getUncleCountByBlockNumber','eth_getLogs','eth_getProof',
 'eth_call','eth_estimateGas','net_version','net_listening','net_peerCount','web3_clientVersion','web3_sha3',
 'wallet_getPermissions','wallet_getCapabilities','wallet_getCallsStatus'
]);
export const knownReadOnlyRpcMethod=(method:string)=>READ_ONLY_METHODS.has(method);
const NO_ARGUMENT_ASSET_QUERIES=new Set(['eth_accounts','eth_chainId','eth_blockNumber','eth_gasPrice','eth_maxPriorityFeePerGas','eth_syncing','net_version','net_listening','net_peerCount','web3_clientVersion','wallet_getPermissions']);
const address=(value:unknown)=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const hash=(value:unknown)=>typeof value==='string'&&/^0x[\da-f]{64}$/i.test(value);
const quantity=(value:unknown)=>typeof value==='string'&&/^0x(?:0|[1-9a-f][\da-f]{0,63})$/i.test(value);
const block=(value:unknown)=>typeof value==='string'&&(['earliest','latest','pending','safe','finalized'].includes(value)||quantity(value));

/** A small subset with canonical parameters needs no asset-risk model call.
 * This does not execute the RPC, disclose its results, or assess its privacy.
 * Complex eth_call/log/extension parameters deliberately stay on the normal
 * analysis path rather than becoming exempt because their name starts 'get'. */
export function readOnlyAssetRiskExemption(request:{kind:string;method?:string;params?:unknown}):{method:string;reason:string}|null {
 if(request.kind!=='wallet_rpc'||typeof request.method!=='string'||!Array.isArray(request.params))return null;
 const method=request.method,p=request.params;
 const canonical=NO_ARGUMENT_ASSET_QUERIES.has(method)?p.length===0:
  ['eth_getBalance','eth_getCode','eth_getTransactionCount'].includes(method)?p.length===2&&address(p[0])&&block(p[1]):
  method==='eth_getStorageAt'?p.length===3&&address(p[0])&&quantity(p[1])&&block(p[2]):
  method==='eth_getBlockByNumber'?p.length===2&&block(p[0])&&typeof p[1]==='boolean':
  method==='eth_getBlockByHash'?p.length===2&&hash(p[0])&&typeof p[1]==='boolean':
  ['eth_getTransactionByHash','eth_getTransactionReceipt'].includes(method)?p.length===1&&hash(p[0]):
  method==='wallet_getCapabilities'?p.length===0||p.length===1&&address(p[0]):false;
 return canonical?{method,reason:'This recognized read-only query does not request an asset transfer, signature or new spending authority. Asset-risk scoring is not applicable; account-data disclosure and the returned data are not assessed.'}:null;
}
