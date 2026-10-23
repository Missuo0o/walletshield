import {parseAbi,keccak256,type Address,type Abi} from 'viem';
import {evidence,validateAccountCode} from './evidence.js';
import type {Evidence} from './types.js';
const abi=parseAbi([
 'function factory() view returns(address)','function getPool(address,address,uint24) view returns(address)',
 'function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)',
 'function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','function liquidity() view returns(uint128)'
]);
const address=(value:unknown):value is Address=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
type Client={readContract:(params:any)=>Promise<any>;getCode:(params:any)=>Promise<unknown>};
/** A manager/factory/pool interface chain is a candidate binding, not an
 * authenticated deployment, executable quote, oracle, or NFT valuation. */
export async function positionPoolEvidence(client:Client,manager:Address,token0:unknown,token1:unknown,fee:unknown,ticks:{lower?:unknown;upper?:unknown},block:bigint,snapshot:Record<string,unknown>):Promise<Evidence[]>{
 const data:Record<string,unknown>={...snapshot,manager,token0,token1,fee:String(fee??''),identityVerified:false,priceQuoteEstablished:false,missing:[]};
 if(!address(token0)||!address(token1)||token0.toLowerCase()===token1.toLowerCase()||!/^\d+$/.test(String(fee))||BigInt(String(fee))>0xffffffn)return [evidence('position_pool','unknown','Position pool candidate unavailable','The two exact tokens and fee tier were not available. No pool or price was guessed.','coverage',data)];
 const read=(at:Address,functionName:string,args:unknown[]=[])=>client.readContract({address:at,abi:abi as Abi,functionName,args,blockNumber:block});
 try{
  const factory=await read(manager,'factory');if(!address(factory))throw Error('Factory missing');data.factory=factory;
  const pool=await read(factory,'getPool',[token0,token1,Number(fee)]);if(!address(pool))throw Error('Pool missing');data.pool=pool;
  const names=['poolToken0','poolToken1','poolFee','poolFactory','slot0','activeLiquidity','poolCode'];
  const values=await Promise.allSettled([read(pool,'token0'),read(pool,'token1'),read(pool,'fee'),read(pool,'factory'),read(pool,'slot0'),read(pool,'liquidity'),client.getCode({address:pool,blockNumber:block}).then(validateAccountCode)]);
  values.forEach((value,index)=>{
   if(value.status==='rejected'){(data.missing as string[]).push(names[index]);return;}
   if(index<4)data[names[index]]=String(value.value);
   else if(index===4){const slot=value.value;if(!Array.isArray(slot)||slot.length!==7){(data.missing as string[]).push('slot0');return;}['sqrtPriceX96','currentTick','observationIndex','observationCardinality','observationCardinalityNext','feeProtocol'].forEach((key,i)=>data[key]=String(slot[i]));data.unlocked=slot[6];}
   else if(index===5)data.activeLiquidityRaw=String(value.value);
   else{data.poolHasCode=value.value!=='0x';if(value.value!=='0x')data.poolCodeHash=keccak256(value.value);else(data.missing as string[]).push('poolCode');}
  });
  const tupleKeys=['poolToken0','poolToken1','poolFee','poolFactory'];
  if(tupleKeys.every(key=>data[key]!==undefined))data.interfaceBindingConsistent=String(data.poolToken0).toLowerCase()===token0.toLowerCase()&&String(data.poolToken1).toLowerCase()===token1.toLowerCase()&&BigInt(String(data.poolFee))===BigInt(String(fee))&&String(data.poolFactory).toLowerCase()===factory.toLowerCase();
  if(typeof data.currentTick==='string'&&/^-?\d+$/.test(data.currentTick)&&/^-?\d+$/.test(String(ticks.lower))&&/^-?\d+$/.test(String(ticks.upper))){data.tickLower=String(ticks.lower);data.tickUpper=String(ticks.upper);data.withinDeclaredTickRange=BigInt(data.currentTick)>=BigInt(String(ticks.lower))&&BigInt(data.currentTick)<BigInt(String(ticks.upper));}
  return [evidence('position_pool',(data.missing as string[]).length?'unknown':data.interfaceBindingConsistent===false||data.unlocked===false?'warning':'pass','Candidate position pool state observed','The manager factory, selected pool token/fee/factory returns, current tick, square-root ratio and active liquidity are observed at one block. Interface agreement and code presence do not authenticate the pool or establish a fair price, token value, accrued fee entitlement or future exit.','rpc',data)];
 }catch{return [evidence('position_pool','unknown','Position pool interfaces unavailable','Manager factory, pool lookup or pool interfaces could not be read. Existing position/asset observations are retained; no zero tick, price or liquidity was substituted.','rpc',data)];}
}
