import {decodeFunctionData,encodeFunctionData,parseAbi,toFunctionSelector} from 'viem';
import type {Operation,SecurityRequest} from './types.js';

// Candidate method shapes only: names and ABI compatibility do not authenticate
// a position manager, wrapper, bridge or its destination-chain counterpart.
export const protocolOperationAbi=parseAbi([
 'function withdraw(uint256 amount)',
 'function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params)',
 'function increaseLiquidity((uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params)',
 'function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params)',
 'function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params)',
 'function withdraw(address token,uint256 amount,uint32 minGasLimit,bytes extraData)',
 'function withdrawTo(address token,address to,uint256 amount,uint32 minGasLimit,bytes extraData)',
 'function bridgeETH(uint32 minGasLimit,bytes extraData)',
 'function bridgeERC20(address localToken,address remoteToken,uint256 amount,uint32 minGasLimit,bytes extraData)',
 'function finalizeBridgeETH(address from,address to,uint256 amount,bytes extraData)',
 'function finalizeBridgeERC20(address localToken,address remoteToken,address from,address to,uint256 amount,bytes extraData)'
]);
export function decodeProtocolOperation(request:SecurityRequest):Operation|null {
 if(request.kind!=='transaction'||!request.transaction.to)return null;
 const tx=request.transaction;
 try {
  const decoded=decodeFunctionData({abi:protocolOperationAbi,data:tx.data as `0x${string}`});
  const exact=protocolOperationAbi.filter(item=>item.type==='function'&&toFunctionSelector(item)===tx.data.slice(0,10).toLowerCase());
  if(encodeFunctionData({abi:exact,functionName:decoded.functionName,args:decoded.args as never}).toLowerCase()!==tx.data.toLowerCase())return null;
  const a=(decoded.args??[]) as readonly any[],method=decoded.functionName;
  const fields:Operation['fields']={method,protocolIdentity:'ABI candidate only; deployment and implementation are unverified'};
  if(method==='withdraw'&&a.length===1)return {category:'withdrawal',label:'Withdrawal / possible native redemption candidate',fields:{...fields,action:'withdraw',amount:String(a[0]),amountKind:'unverified_protocol_units',redeemabilityVerified:false},targets:[tx.to!],token:tx.to!,decoded:true,complex:true};
  if(['mint','increaseLiquidity','decreaseLiquidity','collect'].includes(method)){
   const p=a[0];for(const [key,value] of Object.entries(p))if(typeof value==='bigint'||typeof value==='number'||typeof value==='string')fields[key]=String(value);
   fields.action=method;fields.manager=tx.to!;fields.quantityMeaning=method==='decreaseLiquidity'?'liquidity is a protocol liquidity unit, not a token amount':method==='collect'?'amount0Max/amount1Max are collection caps, not promised proceeds':'desired and minimum quantities are per-token raw units';
   if(p.token0)fields.tokens=[p.token0,p.token1];
   return {category:'liquidity_v3',label:'Concentrated-liquidity position candidate',fields,targets:p.recipient?[p.recipient]:[tx.to!],decoded:true,complex:true};
  }
  fields.action=method;fields.destinationVerified=false;let token:string|undefined;
  if(method==='withdraw'||method==='withdrawTo'){
   fields.stage='withdrawal_request';fields.localToken=a[0];token=a[0];fields.recipient=method==='withdrawTo'?a[1]:tx.from;
   fields.amount=String(a[method==='withdrawTo'?2:1]);fields.minGasLimit=String(a[method==='withdrawTo'?3:2]);
  }else if(method==='bridgeETH'){fields.stage='bridge_request';fields.recipient=tx.from;fields.valueWei=String(BigInt(tx.value??'0x0'));fields.minGasLimit=String(a[0]);}
  else if(method==='bridgeERC20'){fields.stage='bridge_request';fields.localToken=a[0];token=a[0];fields.remoteToken=a[1];fields.recipient=tx.from;fields.amount=String(a[2]);fields.minGasLimit=String(a[3]);}
  else if(method==='finalizeBridgeETH'){fields.stage='finalization_request';fields.messageSender=a[0];fields.recipient=a[1];fields.amount=String(a[2]);fields.assetUnits='claimed_native_raw';}
  else {fields.stage='finalization_request';fields.localToken=a[0];token=a[0];fields.remoteToken=a[1];fields.messageSender=a[2];fields.recipient=a[3];fields.amount=String(a[4]);}
  fields.extraDataBytes=String((a.at(-1).length-2)/2);
  return {category:'bridge',label:fields.stage==='finalization_request'?'Bridge finalization candidate':'Bridge initiation / withdrawal candidate',fields,targets:[String(fields.recipient)],...(token?{token}:{}),decoded:true,complex:true};
 }catch{return null;}
}
