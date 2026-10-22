import { decodeFunctionData, encodeFunctionData, parseAbi, hexToString, maxUint256, toFunctionSelector } from 'viem';
import type { Operation, SecurityRequest } from './types.js';
import { decodeExtended, rpcSummary } from './operations.js';
import { typedRequest, permitProtocol } from './signatures.js';
import {parseLoginMessage} from './siwe.js';
const abi = parseAbi([
  'function transfer(address to,uint256 amount)',
  'function approve(address spender,uint256 amount)',
  'function transferFrom(address from,address to,uint256 amount)',
  'function setApprovalForAll(address operator,bool approved)',
  'function safeTransferFrom(address from,address to,uint256 tokenId)',
  'function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)',
  'function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)',
  'function safeBatchTransferFrom(address from,address to,uint256[] ids,uint256[] amounts,bytes data)',
  'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)',
  'function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline)',
  'function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)',
  'function multicall(bytes[] data)',
  'function execute(bytes commands,bytes[] inputs,uint256 deadline)',
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
  'function approve(address token,address spender,uint160 amount,uint48 expiration)'
]);
const addr = (value: unknown): value is string => typeof value === 'string' && /^0x[\da-fA-F]{40}$/.test(value);
const obj = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const scalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' ? String(v).slice(0,1000) : '';
const result = (category: string, label: string, fields: Operation['fields'] = {}, targets: string[] = []): Operation => ({ category, label, fields, targets, decoded: true });
// EIP-712 ignores extra message properties. Only declared fields are committed
// by the signature, including fields inside named structs and arrays.
function committedValue(value:unknown,type:string,types:Record<string,any>,depth=0):unknown {
  if(depth>8)return undefined;
  const array=type.match(/^(.*)\[(?:\d*)\]$/);
  if(array)return Array.isArray(value)?value.slice(0,64).map(v=>committedValue(v,array[1],types,depth+1)):undefined;
  const declared=types[type];
  if(Array.isArray(declared)){const record=obj(value);return Object.fromEntries(declared.slice(0,128).filter(f=>f&&typeof f.name==='string'&&typeof f.type==='string'&&record[f.name]!==undefined).map(f=>[f.name,committedValue(record[f.name],f.type,types,depth+1)]));}
  return ['string','number','boolean','bigint'].includes(typeof value)?value:undefined;
}

export function decodeRequest(request: SecurityRequest): Operation {
  if (request.kind === 'wallet_rpc') return rpcSummary(request.method,request.params);
  if (request.kind === 'permission' || request.kind === 'user_operation') return { ...rpcSummary(request.method,request.params),category:request.kind,label:request.kind==='permission'?'Wallet permission / session-key request':'Smart-account / batch operation',decoded:false,complex:true,addsPermission:true };
  if (request.kind === 'signature') return decodeSignature(request);
  if (request.kind !== 'transaction') throw Error('Invalid kind');
  const tx = request.transaction;
  if (!tx.to) return { ...result('deployment','Contract deployment', { valueWei: String(BigInt(tx.value ?? '0x0')) }), decoded: false, complex: true };
  if (tx.data === '0x') return result('native_transfer','Native transfer / contract recipient', { recipient: tx.to, valueWei: String(BigInt(tx.value ?? '0x0')) }, [tx.to]);
  try {
    const d = decodeFunctionData({ abi, data: tx.data as `0x${string}` });
    const selectedAbi=abi.filter(item=>item.type==='function'&&toFunctionSelector(item)===tx.data.slice(0,10).toLowerCase());
    if (encodeFunctionData({ abi:selectedAbi, functionName: d.functionName, args: d.args as never }).toLowerCase() !== tx.data.toLowerCase()) throw Error('Noncanonical ABI');
    const a = d.args as readonly any[];
    let op: Operation;
    if (d.functionName === 'transfer') op = { ...result('token_transfer','Token transfer', { recipient:a[0], amount:String(a[1]) }, [a[0]]), tokenStandard:'erc20' };
    else if (d.functionName === 'approve' && a.length === 2) op = { ...result('approval','Token / single-NFT approval', { spender:a[0], amountOrTokenId:String(a[1]), unlimited:a[1] === maxUint256 }, [a[0]]), tokenStandard:'ambiguous', addsPermission:true };
    else if (d.functionName === 'approve') op = { ...result('permit2_approval','Permit2 allowance approval', { token:a[0],spender:a[1],amount:String(a[2]),expiration:String(a[3]),unlimited:a[2] === 2n ** 160n - 1n },[a[1]]), token:a[0], addsPermission:a[2] !== 0n };
    else if (d.functionName === 'transferFrom') op = { ...result('asset_transfer_from','Delegated token / NFT transfer', { owner:a[0],recipient:a[1],amountOrTokenId:String(a[2]) },[a[1]]),tokenStandard:'ambiguous' };
    else if (d.functionName === 'setApprovalForAll') op = { ...result('operator_approval',a[1] ? 'NFT operator approval' : 'Revoke NFT operator approval', { operator:a[0],approved:a[1] },[a[0]]), addsPermission:a[1] };
    else if (d.functionName === 'safeTransferFrom') op = { ...result(a.length === 5 ? 'erc1155_transfer' : 'erc721_transfer','Safe NFT transfer', { owner:a[0],recipient:a[1],tokenId:String(a[2]),...(a.length === 5 ? {amount:String(a[3])}:{}) },[a[1]]),tokenStandard:a.length === 5 ? 'erc1155':'erc721' };
    else if (d.functionName === 'safeBatchTransferFrom') {
      if (a[2].length !== a[3].length || a[2].length > 128) throw Error('Invalid batch');
      op = { ...result('erc1155_batch','Batch NFT transfer', {owner:a[0],recipient:a[1],ids:a[2].map(String),amounts:a[3].map(String)},[a[1]]),tokenStandard:'erc1155' };
    } else if (d.functionName.startsWith('swapExact')) {
      const ethIn = d.functionName === 'swapExactETHForTokens', path = a[ethIn ? 1:2] as string[];
      if (path.length < 2 || path.length > 12) throw Error('Invalid path');
      op = { ...result('swap','Swap call candidate', {method:d.functionName,path,recipient:a[ethIn ? 2:3],deadline:String(a[ethIn ? 3:4]),amountIn:String(ethIn?BigInt(tx.value??'0x0'):a[0]),amountOutMin:String(a[ethIn ? 0:1])},[a[ethIn ? 2:3]]),token:path.at(-1), complex:true };
    } else if (d.functionName === 'permit') op = { ...result('permit','On-chain Permit approval', {owner:a[0],spender:a[1],amount:String(a[2]),deadline:String(a[3]),unlimited:a[2] === maxUint256},[a[1]]),addsPermission:a[2] !== 0n, tokenStandard:'erc20' };
    else if(d.functionName==='multicall')op={...result('batch','Contract-call batch',{method:d.functionName,callCount:String(a[0].length),selectors:a[0].slice(0,32).map((v:string)=>v.slice(0,10)),truncated:a[0].length>32}),decoded:false,complex:true};
    else if(d.functionName==='execute')op={...result('batch','Command-based router call',{method:d.functionName,commandBytes:String((a[0].length-2)/2),inputCount:String(a[1].length),deadline:String(a[2]),inputByteLengths:a[1].slice(0,32).map((v:string)=>String((v.length-2)/2)),truncated:a[1].length>32}),decoded:false,complex:true};
    else op = { ...result('batch','Batch / complex contract call', {method:d.functionName}),complex:true,decoded:false };
    if (!op.token && (op.tokenStandard || op.category === 'operator_approval')) op.token = tx.to;
    return op;
  } catch { return decodeExtended(request) ?? { ...result('contract_call','Unrecognized contract call', {selector:tx.data.slice(0,10)},[tx.to]),decoded:false,complex:true }; }
}

function decodeSignature(request: Extract<SecurityRequest,{kind:'signature'}>): Operation {
  const { method, data, from } = request.signature;
  if (method === 'eth_sign') return { ...result('raw_signature','Raw data signature', {method}),decoded:false,rawSigning:true };
  if (method === 'personal_sign') {
    let message = typeof data === 'string' ? data : '';
    try { if (message.startsWith('0x')) message = hexToString(message as `0x${string}`); } catch { message = ''; }
    const login=parseLoginMessage(message);
    const fields = {method,messagePreview:message.slice(0,1600),messageCharacters:String(message.length),previewTruncated:message.length>1600,...login.fields};
    return { ...result(login.candidate?'siwe':'personal_signature',login.candidate?'SIWE login message candidate':'Personal message signature',fields),decoded:login.candidate&&login.valid };
  }
  let typed: Record<string,any>;
  try { typed = obj(typeof data === 'string' ? JSON.parse(data) : data); } catch { typed = {}; }
  const domain = obj(typed.domain), m = obj(typed.message), primary = scalar(typed.primaryType),types=obj(typed.types);
  const committed=obj(committedValue(m,primary,types));
  let encodingValid=false;try{typedRequest(request);encodingValid=true;}catch{/* Keep unverified structure explicit. */}
  const fields: Operation['fields'] = {method,primaryType:primary,domainName:scalar(domain.name),domainChainId:scalar(domain.chainId),verifyingContract:scalar(domain.verifyingContract),signer:from};
  const put = (key:string, value:unknown) => { const s = scalar(value); if(s) fields[key] = s; };
  const targets: string[] = [];
  for(const key of ['owner','spender','deadline','sigDeadline','nonce','value','tokenId']) put(key,committed[key]);
  if (addr(committed.spender)) targets.push(committed.spender);
  // Keep bounded financial claims for unfamiliar orders and account permissions;
  // never copy a raw message, signature or private fields into the AI packet.
  fields.parameterSummary=rpcSummary(method,{message:committed}).fields.parameterSummary;
  const protocol=encodingValid?permitProtocol(typed):undefined;
  const erc20Permit=protocol==='erc2612',nftPermit=protocol==='erc4494';
  if (primary === 'Permit' && (erc20Permit||nftPermit) && (nftPermit||addr(m.owner)) && addr(m.spender)) {
    const validAmount = m.value === undefined || /^\d+$/.test(scalar(m.value));
    fields.permitProtocol=protocol!;fields.futureConsumptionUnverified=true;
    fields.unlimited=m.value!==undefined&&scalar(m.value)===maxUint256.toString();
    return {...result('permit_signature',nftPermit ? 'NFT Permit signature candidate' : 'Token Permit signature candidate',fields,targets),token:addr(domain.verifyingContract)?domain.verifyingContract:undefined,tokenStandard:nftPermit?'erc721':'erc20',addsPermission:nftPermit?m.spender.toLowerCase()!=='0x0000000000000000000000000000000000000000':BigInt(m.value)!==0n,decoded:encodingValid && validAmount && addr(domain.verifyingContract)};
  }
  if (['PermitSingle','PermitBatch','PermitTransferFrom','PermitBatchTransferFrom'].includes(primary)) {
    const details = Array.isArray(m.details) ? m.details : Array.isArray(m.permitted) ? m.permitted : [m.details ?? m.permitted];
    const values = details.slice(0,64).map(obj);
    fields.tokens = values.map(v=>scalar(v.token)); fields.amounts = values.map(v=>scalar(v.amount));
    fields.expirations = values.map(v=>scalar(v.expiration)); fields.nonces=values.map(v=>scalar(v.nonce)); fields.declaredAssetCount=String(details.length);
    fields.unlimited=values.some(v=>scalar(v.amount)===(['PermitSingle','PermitBatch'].includes(primary)?2n**160n-1n:maxUint256).toString());
    if (!encodingValid || !protocol?.startsWith('permit2') || !addr(domain.verifyingContract) || !addr(m.spender) || details.length > 64 || !values.length || values.some(v=>!addr(v.token) || !/^\d+$/.test(scalar(v.amount)))) return {...result('typed_signature','Partially understood typed signature',fields),decoded:false,complex:true};
    fields.permitProtocol=protocol;fields.futureConsumptionUnverified=true;fields.recipientCommitted=false;
    return {...result('permit2_signature','Permit2 signature candidate',fields,targets),token:values[0].token,addsPermission:values.some(v=>BigInt(v.amount)!==0n)};
  }
  if (/Order|Offer|Listing/i.test(primary)) return {...result('order_signature','Order / listing signature candidate',fields,targets),decoded:false,complex:true,addsPermission:true};
  return {...result('typed_signature','Typed-data signature',fields,targets),decoded:false,complex:true};
}
