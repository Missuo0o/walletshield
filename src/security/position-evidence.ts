import {createPublicClient,http,parseAbi,keccak256,type Address} from 'viem';
import type {SecurityRequest,Operation,Evidence} from './types.js';
import type {SecurityConfig} from './config.js';
import {evidence,snapshotMetadata,validateAccountCode} from './evidence.js';
import {positionPoolEvidence} from './position-pool.js';
const abi=parseAbi([
 'function positions(uint256) view returns(uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)',
 'function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)',
 'function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)'
]);
const address=(value:unknown):value is Address=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
/** Selected manager interface observations, never pool/deployment authentication,
 * NFT valuation, a quote or a guarantee that fees/liquidity can be withdrawn. */
export async function positionEvidence(request:SecurityRequest,op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]> {
 if(request.kind!=='transaction'||op.category!=='liquidity_v3'||!request.transaction.to)return [];
 const rpc=config.rpc[request.chainId];if(!rpc)return [evidence('position_context','unknown','Position state unavailable','No trusted RPC is configured.','configuration')];
 const out:Evidence[]=[];
 const client=createPublicClient({transport:http(rpc,{timeout:2400,retryCount:0,fetchFn:fetcher,fetchOptions:{redirect:'error'}})});
 try{
  if(await client.getChainId()!==request.chainId)throw Error('Wrong chain');
  const block=await client.getBlockNumber({cacheTime:0});let header;try{header=await client.getBlock({blockNumber:block});}catch{}
  const snapshot=snapshotMetadata(request.chainId,block,header),manager=request.transaction.to as Address;
  const id=typeof op.fields.tokenId==='string'?BigInt(op.fields.tokenId):undefined;
  const base={...snapshot,manager,identityVerified:false,action:op.fields.action,...(id===undefined?{}:{tokenId:String(id)})};
  if(id===undefined){out.push(evidence('position_context','unknown','New position economics unverified','Mint parameters were decoded, but no existing position ID is supplied. Separate candidate pool observations may be available; resulting position liquidity, value, fees and future collection remain unverified.','coverage',base));const tokens=Array.isArray(op.fields.tokens)?op.fields.tokens:[];out.push(...await positionPoolEvidence(client,manager,tokens[0],tokens[1],op.fields.fee,{lower:op.fields.tickLower,upper:op.fields.tickUpper},block,snapshot));return out;}
  const read=(name:string,args:any[],at=manager)=>client.readContract({address:at,abi,functionName:name,args,blockNumber:block} as any) as Promise<any>;
  const names=['position','owner','approved','managerCode'];
  const values=await Promise.allSettled([read('positions',[id]),read('ownerOf',[id]),read('getApproved',[id]),client.getCode({address:manager,blockNumber:block}).then(validateAccountCode)]);
  const data:Record<string,unknown>={...base,missing:names.filter((_,i)=>values[i].status==='rejected')};
  if(values[0].status==='fulfilled'){
   const position=values[0].value;
   ['permitNonce','operator','token0','token1','fee','tickLower','tickUpper','liquidity','feeGrowthInside0LastX128','feeGrowthInside1LastX128','tokensOwed0','tokensOwed1'].forEach((key,i)=>data[key]=String(position[i]));
  }
  if(values[1].status==='fulfilled')data.owner=String(values[1].value);
  if(values[2].status==='fulfilled')data.approved=String(values[2].value);
  if(values[3].status==='fulfilled'){const code=values[3].value;data.managerHasCode=!!code&&code!=='0x';if(code&&code!=='0x')data.managerCodeHash=keccak256(code);else(data.missing as string[]).push('managerCode');}
  if(address(data.owner))try{data.callerOperatorApproved=await read('isApprovedForAll',[data.owner,request.transaction.from]);}catch{(data.missing as string[]).push('isApprovedForAll');}
  out.push(evidence('position_context',(data.missing as string[]).length?'unknown':'pass','Position ownership and liquidity interfaces observed','All successful reads refer to the recorded block. Interfaces can be imitated. Liquidity, NFT IDs and owed raw token quantities are different units; owed values are not a price or a guarantee of proceeds. Separate pool observations do not authenticate identity or a fair market price; signature acceptance, taxes and full exit economics remain unverified.','rpc',data));
  if(typeof data.liquidity==='string'&&typeof op.fields.liquidity==='string'&&BigInt(op.fields.liquidity)>BigInt(data.liquidity))out.push(evidence('position_liquidity_limit','warning','Requested liquidity exceeds the observed position','The requested decrease exceeds the interface-reported liquidity at this block; nonstandard behavior and state changes remain unverified.','rpc',{...base,requested:op.fields.liquidity,observed:data.liquidity}));
  const tokens=[data.token0,data.token1].filter(address);
  const [poolFacts]=await Promise.all([positionPoolEvidence(client,manager,data.token0,data.token1,data.fee,{lower:data.tickLower,upper:data.tickUpper},block,snapshot),Promise.all(tokens.map(async(token,index)=>{
   const parts=await Promise.allSettled([read('decimals',[],token),read('balanceOf',[request.transaction.from],token)]),context:Record<string,unknown>={...snapshot,token,account:request.transaction.from,identityVerified:false};
   if(parts[0].status==='fulfilled')context.decimals=String(parts[0].value);if(parts[1].status==='fulfilled')context.balanceRaw=String(parts[1].value);
   out.push(evidence(`position_asset_${index}`,parts.some(p=>p.status==='rejected')?'unknown':'pass','Position asset units and caller balance observed','These quantities belong to this exact asset and account. No price, pool authentication or guaranteed collection is inferred.','rpc',context));
  }))]);out.push(...poolFacts);
 }catch{out.push(evidence('position_context','unknown','Position-state query failed','Other collectors retain their own observations. Missing interfaces, wrong networks and timeouts are not zero values.','rpc'));}
 return out;
}
