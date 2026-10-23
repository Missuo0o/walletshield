import {decodeFunctionResult,encodeFunctionData,parseAbi,type Abi,type Address,type Hex} from 'viem';
import {evidence,snapshotMetadata} from './evidence.js';
import type {Evidence,Operation,SecurityRequest} from './types.js';

export type ForkReadRpc=(method:string,params?:unknown[])=>Promise<any>;
export type ForkProtocolState={category:'vault'|'lending';target:Address;phase:'before'|'after';snapshot:Record<string,unknown>;values:Record<string,string>;missing:string[];subjects:{caller:Address;owner:Address;receiver:Address};asset?:Address};
const abi=parseAbi([
 'function asset() view returns(address)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function totalAssets() view returns(uint256)','function totalSupply() view returns(uint256)',
 'function allowance(address,address) view returns(uint256)','function maxWithdraw(address) view returns(uint256)','function maxRedeem(address) view returns(uint256)',
 'function previewDeposit(uint256) view returns(uint256)','function previewMint(uint256) view returns(uint256)','function previewWithdraw(uint256) view returns(uint256)','function previewRedeem(uint256) view returns(uint256)',
 'function getUserAccountData(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256)'
]);
const address=(value:unknown):value is Address=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);

/** Actual view reads around the one original child-fork execution. No price
 * stress, balance override, signature acceptance, or later execution is faked. */
export async function captureForkProtocolState(rpc:ForkReadRpc,request:SecurityRequest,op:Operation,phase:'before'|'after',base:Record<string,unknown>,blockTag:string):Promise<ForkProtocolState|null>{
 if(request.kind!=='transaction'||!address(request.transaction.to)||!['vault','lending'].includes(op.category)||!address(request.transaction.from))return null;
 const target=request.transaction.to,caller=request.transaction.from,owner=address(op.fields.owner)?op.fields.owner:address(op.fields.onBehalfOf)?op.fields.onBehalfOf:caller,receiver=address(op.fields.receiver)?op.fields.receiver:caller;
 const state:ForkProtocolState={category:op.category as 'vault'|'lending',target,phase,snapshot:{...base,stateSpace:'isolated-fork',phase,baseBlockNumber:base.blockNumber,baseBlockHash:base.blockHash,baseBlockTimestampSeconds:base.blockTimestampSeconds},values:{},missing:[],subjects:{caller,owner,receiver}};
 let fixedTag=blockTag;
 try{
  const header=await rpc('eth_getBlockByNumber',[blockTag,false]);
  if(!header||typeof header.number!=='string'||!/^0x[\da-f]+$/i.test(header.number)||blockTag!=='latest'&&BigInt(header.number)!==BigInt(blockTag))throw Error('Header mismatch');
  fixedTag=header.number;
  if(phase==='after'){delete state.snapshot.blockHash;delete state.snapshot.blockTimestampSeconds;}
  state.snapshot={...state.snapshot,...snapshotMetadata(Number(base.chainId),BigInt(header.number),{number:BigInt(header.number),hash:header.hash,...(typeof header.timestamp==='string'&&/^0x[\da-f]+$/i.test(header.timestamp)?{timestamp:BigInt(header.timestamp)}:{})})};
 }catch{
  // Before uses the verified base snapshot even when an additional header read
  // fails. After must not inherit a different block's hash or timestamp.
  if(phase==='after'){delete state.snapshot.blockHash;delete state.snapshot.blockTimestampSeconds;if(/^0x[\da-f]+$/i.test(blockTag))state.snapshot.blockNumber=String(BigInt(blockTag));else delete state.snapshot.blockNumber;}
  state.missing.push('phase_block_header');
 }
 const read=async(at:Address,functionName:string,args:unknown[]=[])=>decodeFunctionResult({abi:abi as Abi,functionName,data:await rpc('eth_call',[{from:caller,to:at,data:encodeFunctionData({abi:abi as Abi,functionName,args})},fixedTag]) as Hex});
 async function observations(tasks:{key:string;run:()=>Promise<unknown>}[]){
  const results=await Promise.allSettled(tasks.map(task=>task.run()));
  results.forEach((result,index)=>{if(result.status==='fulfilled'&&(typeof result.value==='bigint'||typeof result.value==='number'&&Number.isSafeInteger(result.value))&&BigInt(result.value)>=0n)state.values[tasks[index].key]=String(result.value);else state.missing.push(tasks[index].key);});
 }
 if(state.category==='vault'){
  try{const asset=await read(target,'asset');if(!address(asset))throw Error('Invalid asset');state.asset=asset;}catch{state.missing.push('underlying_asset');}
  const action=String(op.fields.action),amount=typeof op.fields.amount==='string'&&/^\d+$/.test(op.fields.amount)?BigInt(op.fields.amount):undefined;
  const preview=['deposit','mint','withdraw','redeem'].includes(action)?`preview${action[0].toUpperCase()+action.slice(1)}`:undefined;
  const tasks=[{key:'totalAssetsRaw',run:()=>read(target,'totalAssets')},{key:'totalSharesRaw',run:()=>read(target,'totalSupply')},{key:'shareDecimals',run:()=>read(target,'decimals')},{key:'ownerSharesRaw',run:()=>read(target,'balanceOf',[owner])},{key:'receiverSharesRaw',run:()=>read(target,'balanceOf',[receiver])},{key:'maxOwnerWithdrawRaw',run:()=>read(target,'maxWithdraw',[owner])},{key:'maxOwnerRedeemRaw',run:()=>read(target,'maxRedeem',[owner])}];
  if(preview&&amount!==undefined)tasks.push({key:'requestPreviewRaw',run:()=>read(target,preview,[amount])});
  if(state.asset){const asset=state.asset;tasks.push({key:'underlyingDecimals',run:()=>read(asset,'decimals')},{key:'callerUnderlyingRaw',run:()=>read(asset,'balanceOf',[caller])},{key:'receiverUnderlyingRaw',run:()=>read(asset,'balanceOf',[receiver])},{key:'callerUnderlyingAllowanceToVaultRaw',run:()=>read(asset,'allowance',[caller,target])});}
  await observations(tasks);
 }else{
  try{
   const values=await read(target,'getUserAccountData',[owner]);if(!Array.isArray(values)||values.length!==6||values.some(value=>typeof value!=='bigint'))throw Error('Unsupported lending return');
   ['totalCollateralBaseRaw','totalDebtBaseRaw','availableBorrowsBaseRaw','currentLiquidationThresholdRaw','ltvRaw','healthFactor1e18'].forEach((key,index)=>state.values[key]=String(values[index]));
  }catch{state.missing.push('lending_account_data');}
  if(address(op.fields.asset)){state.asset=op.fields.asset;await observations([{key:'underlyingDecimals',run:()=>read(state.asset!,'decimals')},{key:'callerUnderlyingRaw',run:()=>read(state.asset!,'balanceOf',[caller])},{key:'receiverUnderlyingRaw',run:()=>read(state.asset!,'balanceOf',[receiver])},{key:'callerUnderlyingAllowanceToPoolRaw',run:()=>read(state.asset!,'allowance',[caller,target])}]);}
 }
 return state;
}

export function forkProtocolEvidence(before:ForkProtocolState|null,after:ForkProtocolState|null):Evidence[]{
 const out:Evidence[]=[];
 for(const state of [before,after])if(state)out.push(evidence(`fork_${state.category}_${state.phase}`,state.missing.length?'unknown':'pass',`Selected ${state.category} state ${state.phase} fork execution observed`,'These interface returns were read around the original transaction on the temporary fork. Values are raw asset/share/protocol units, not dollars. Successful interfaces do not authenticate a protocol, oracle, solvency, future exit, or public-chain execution.','isolated-fork',{...state.snapshot,target:state.target,subjects:state.subjects,...(state.asset?{asset:state.asset}:{}),values:state.values,missing:state.missing,identityVerified:false,simulationOnly:true}));
 if(!before||!after||before.category!==after.category||before.target.toLowerCase()!==after.target.toLowerCase())return out;
 const differences:Record<string,string>={};
 // A changed underlying contract is not the same asset. Keep observations but
 // never subtract amounts from different assets or incompatible units.
 const assetSame=before.asset!==undefined&&after.asset!==undefined&&before.asset.toLowerCase()===after.asset.toLowerCase(),shareUnitsSame=before.values.shareDecimals!==undefined&&before.values.shareDecimals===after.values.shareDecimals,assetUnitsSame=assetSame&&before.values.underlyingDecimals!==undefined&&before.values.underlyingDecimals===after.values.underlyingDecimals;
 for(const [key,value] of Object.entries(before.values))if(after.values[key]!==undefined&&/^-?\d+$/.test(value)&&/^-?\d+$/.test(after.values[key])&&!key.endsWith('Decimals')&&key!=='requestPreviewRaw'){
  const underlying=key.includes('Underlying')||key==='totalAssetsRaw'||key==='maxOwnerWithdrawRaw',shares=key.includes('Shares')||key==='maxOwnerRedeemRaw';
  if(underlying&&!assetUnitsSame||shares&&!shareUnitsSame)continue;
  differences[key]=String(BigInt(after.values[key])-BigInt(value));
 }
 out.push(evidence(`fork_${before.category}_change`,before.missing.length||after.missing.length||!assetSame?'unknown':'pass','Selected protocol state changes observed on the fork','Only corresponding observed fields are compared. Asset/share changes require the same asset and units; raw collateral/debt base values and health-factor scale follow the candidate interface, not a verified USD valuation or forecast. Changes describe this execution only.','isolated-fork',{...after.snapshot,target:after.target,subjects:after.subjects,assetSame,assetUnitsSame,shareUnitsSame,differences,identityVerified:false,simulationOnly:true}));
 if(before.category==='lending'&&/^\d+$/.test(after.values.healthFactor1e18??'')&&BigInt(after.values.healthFactor1e18)<10n**18n)out.push(evidence('fork_lending_health','risk','Fork account interface reports health factor below one after execution','Under the observed Aave-style 1e18 convention, the selected account reports liquidation exposure after the original fork transaction. The protocol, oracle and public future state remain unverified.','isolated-fork',{...after.snapshot,target:after.target,owner:after.subjects.owner,healthFactor1e18:after.values.healthFactor1e18,simulationOnly:true,identityVerified:false}));
 return out;
}
