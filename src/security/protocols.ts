import { decodeFunctionResult, encodeFunctionData, keccak256, parseAbi, stringToHex, toHex } from 'viem';
import type { Operation, SecurityRequest, Evidence } from './types.js';
import type { SecurityConfig } from './config.js';
import { evidence, snapshotMetadata, readBoundedText } from './evidence.js';
const abi=parseAbi([
 'function owner() view returns(address)','function paused() view returns(bool)',
 'function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)',
 'function asset() view returns(address)','function totalAssets() view returns(uint256)','function totalSupply() view returns(uint256)',
 'function previewDeposit(uint256) view returns(uint256)','function previewMint(uint256) view returns(uint256)','function previewWithdraw(uint256) view returns(uint256)','function previewRedeem(uint256) view returns(uint256)',
 'function maxDeposit(address) view returns(uint256)','function maxMint(address) view returns(uint256)','function maxWithdraw(address) view returns(uint256)','function maxRedeem(address) view returns(uint256)',
 'function getUserAccountData(address) view returns(uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)',
 'function getConfiguration(address) view returns((uint256 data))'
]);
const isAddress=(v:unknown):v is `0x${string}`=>typeof v==='string'&&/^0x[\da-f]{40}$/i.test(v);
const limitations:Record<string,string>={
 swap_v3:'Common V3 parameters were decoded. Dependent fork buy/sell experiments support bounded canonical V3 single/multi-hop exact-input and exact-output requests received by the sender. Native-funded round trips and router-specific sender-sentinel aliases are unsupported because deployment binding has been removed. Check the separate round_trip evidence for whether an experiment ran and its observed result; support alone does not establish completion. Native funding or router-specific recipient aliases, router-balance input, other recipients, over-limit paths and opaque routers remain unsupported. Protocol/pool identity, fair pricing, liquidity, MEV, and future sellability remain unverified.',
 liquidity:'Pool identity, authentic reserves, LP pricing, impermanent loss, and exit conditions require a protocol-specific adapter.',
 liquidity_v3:'Position parameter and selected interface reads do not authenticate the manager or pool. Selected candidate pool tick/active liquidity may be observed separately, but pool authentication, fair prices, slippage economics, complete accounting and future collection remain unverified.',
 withdrawal:'withdraw(uint256) is shared by wrapped-coin and other protocols. Its quantity units, authentic wrapper identity, redemption ratio, exit conditions and native proceeds are not established by the method name.',
 account_control:'Selected account-control parameters are candidates. Full owner/module/guard/recovery graphs, actual enforcement and deployment identity remain unverified.',
 account_execution:'An account execution envelope does not establish valid signatures, actual caller/storage context, full nested semantics or trusted account policy.',
 staking:'Lock periods, slashing, reward sources, exit restrictions, and future withdrawals remain unverified.',
 bridge:'A source-chain simulation cannot establish destination-chain receipt, message validity, bridge custody, or validator trust.',
 claim:'A claim may also transfer assets or grant authority. A Merkle-proof shape or project name does not establish a genuine reward.',
 mint_burn:'Similar functions may use token quantities or NFT identifiers. Minting rights, price, and burn consequences remain unverified.',
 control_change:'Controller or implementation changes may expand asset access. New controllers, implementation logic, and storage compatibility remain unaudited.',
 batch:'The parent transaction may execute on a fork. This does not guarantee understanding of every child call, hidden asset, delegation, or protocol state.'
};
/** Trusted RPC only; every read is pinned to one verified network and block.
 * No send/estimate/sign RPC methods or client-supplied endpoints are executed. */
export async function protocolEvidence(request:SecurityRequest,op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]> {
 const out:Evidence[]=[];
 if(limitations[op.category])out.push(evidence('protocol_semantics','unknown','Protocol-specific risks remain unverified',limitations[op.category],'coverage'));
 if(['permission','user_operation','wallet_rpc'].includes(request.kind)) {
  out.push(evidence('rpc_semantics','unknown','Wallet RPC execution semantics unverified','Only recognized parameters are extracted. Session constraints, bundlers, paymasters, account delegation, and custom RPCs require dedicated adapters. The request is not executed.','coverage'));
  return out;
 }
 const target=request.kind==='transaction'?request.transaction.to:op.fields.verifyingContract;
 if(!isAddress(target))return out;
 const chainId=request.chainId||Number(op.fields.domainChainId),url=config.rpc[chainId];
 const needed=op.category==='vault'?'vault_context':op.category==='lending'?'lending_context':'contract_controls';
 if(!url)return [...out,evidence(needed,'unknown','Contract context unavailable','No trusted RPC is configured for this network.','configuration')];
 let serial=0;
 const rpc=async(method:string,params:unknown[])=>{
  const id=++serial;
  const response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(2200)});
  if(!response.ok)throw Error('RPC unavailable');const text=await readBoundedText(response,180000);const body=JSON.parse(text);if(body.jsonrpc!=='2.0'||body.id!==id||body.error||body.result===undefined)throw Error('RPC failed');return body.result;
 };
 try {
  if(BigInt(await rpc('eth_chainId',[]))!==BigInt(chainId))throw Error('Wrong chain');
  const block=await rpc('eth_blockNumber',[]);if(!/^0x[\da-f]+$/i.test(block))throw Error('Invalid block');
  let header;try{const value=await rpc('eth_getBlockByNumber',[block,false]);if(value&&typeof value.number==='string'&&BigInt(value.number)===BigInt(block)&&typeof value.timestamp==='string')header={number:BigInt(value.number),hash:value.hash,timestamp:BigInt(value.timestamp)};}catch{/* Common interface facts do not depend on header availability. */}
  const snapshot=snapshotMetadata(chainId,BigInt(block),header);
  const code=await rpc('eth_getCode',[target,block]);if(typeof code!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(code)||code==='0x')return [...out,evidence(needed,'unknown','Target contract code unavailable','No usable code was observed on this network and block, so protocol interfaces cannot be verified.','rpc')];
  const read=async(name:string,args:readonly unknown[]=[],at=target)=>decodeFunctionResult({abi,functionName:name as any,data:await rpc('eth_call',[{to:at,data:encodeFunctionData({abi,functionName:name as any,args:args as any})},block])});
  const slots=['implementation','admin','beacon'];
  const observations=await Promise.allSettled([
   ...slots.map(slot=>rpc('eth_getStorageAt',[target,toHex(BigInt(keccak256(stringToHex(`eip1967.proxy.${slot}`)))-1n,{size:32}),block])),read('owner'),read('paused')
  ]);
  const controls:Record<string,unknown>={target,...snapshot,missing:[],codeHash:keccak256(code as `0x${string}`),identityVerified:false};
  slots.forEach((slot,i)=>{const r=observations[i];if(r.status==='fulfilled'&&/^0x[\da-f]{64}$/i.test(String(r.value)))controls[slot]=BigInt(String(r.value))===0n?null:`0x${String(r.value).slice(-40)}`;else(controls.missing as string[]).push(slot);});
  if(observations[3].status==='fulfilled')controls.owner=String(observations[3].value);else(controls.missing as string[]).push('owner');
  if(observations[4].status==='fulfilled')controls.paused=observations[4].value;else(controls.missing as string[]).push('paused');
  out.push(evidence('contract_controls',controls.paused===true?'warning':(controls.missing as string[]).length?'unknown':'pass','Partial contract controls observed','Code and common proxy slots are observations. Empty slots do not prove immutability, and owner/paused interfaces can be customized. These observations do not establish safety.','rpc',controls));
  if(request.kind==='signature'&&op.decoded&&typeof op.fields.permitProtocol==='string'){
   const tokens=[...new Map([op.token,...(Array.isArray(op.fields.tokens)?op.fields.tokens:[])].filter(isAddress).filter(at=>at.toLowerCase()!==target.toLowerCase()).map(at=>[at.toLowerCase(),at])).values()];
   const candidates=[...(isAddress(op.fields.spender)&&op.fields.spender.toLowerCase()!==target.toLowerCase()?[{at:op.fields.spender,id:'signature_spender_controls',role:'signed_spender'}]:[]),...tokens.slice(0,2).filter(at=>!isAddress(op.fields.spender)||at.toLowerCase()!==op.fields.spender.toLowerCase()).map((at,i)=>({at,id:`signature_token_controls_${i}`,role:'signed_asset'}))];
   await Promise.all(candidates.map(async({at,id,role})=>{
    const facts:Record<string,unknown>={target:at,role,...snapshot,identityVerified:false,controlScope:'common_interfaces_and_eip1967_slots'};
    try{
     const extraCode=await rpc('eth_getCode',[at,block]);if(typeof extraCode!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(extraCode))throw Error('Invalid code');
     facts.hasCode=extraCode!=='0x';if(extraCode==='0x'){out.push(evidence(id,'pass','No current code at the signature target','The specified spender or asset has no observed code at this block. EOAs can be spenders; no code does not establish trust or exclude future deployment or delegation.','rpc',facts));return;}
     facts.codeHash=keccak256(extraCode as `0x${string}`);facts.delegatedAccount=/^0xef0100[\da-f]{40}$/i.test(extraCode);
     const values=await Promise.allSettled([...slots.map(slot=>rpc('eth_getStorageAt',[at,toHex(BigInt(keccak256(stringToHex(`eip1967.proxy.${slot}`)))-1n,{size:32}),block])),read('owner',[],at),read('paused',[],at)]);
     const missing:string[]=[];
     slots.forEach((slot,i)=>{const value=values[i];if(value.status==='fulfilled'&&/^0x[\da-f]{64}$/i.test(String(value.value)))facts[slot]=BigInt(value.value)===0n?null:`0x${String(value.value).slice(-40)}`;else missing.push(slot);});
     if(values[3].status==='fulfilled')facts.owner=String(values[3].value);else missing.push('owner');
     if(values[4].status==='fulfilled')facts.paused=values[4].value;else missing.push('paused');facts.missing=missing;
     out.push(evidence(id,facts.paused===true||facts.delegatedAccount?'warning':missing.length?'unknown':'pass','Signature spender or asset code and controls observed','Code, common proxy slots, and owner/paused interfaces are read at one block. Empty slots, imitable interfaces, and successful queries do not prove immutability, identity, or safe implementation.','rpc',facts));
    }catch{out.push(evidence(id,'unknown','Signature target code or controls unavailable','This target query failed without discarding other observations. Its control logic remains unverified.','rpc',facts));}
   }));
   if(tokens.length>2)out.push(evidence('signature_controls_limit','unknown','Signature asset control queries truncated','Common controls are queried for at most 2 extra assets and 1 spender. These interfaces were not queried for the remaining assets.','coverage',{declaredAssets:tokens.length}));
  }
  if(op.category==='control_change'&&isAddress(op.fields.newController)){
   try{const next=await rpc('eth_getCode',[op.fields.newController,block]);out.push(evidence('new_controller','pass','New controller code observed','Only current code presence and hash are recorded. Implementation logic, storage compatibility, and identity were not audited.','rpc',{address:op.fields.newController,hasCode:next!=='0x',...(next!=='0x'?{codeHash:keccak256(next)}:{}),...snapshot}));}catch{out.push(evidence('new_controller','unknown','New controller code unavailable','The new implementation or controller could not be checked.','rpc'));}
  }
  // Every unavailable interface stays explicit. A forged contract may mimic any
  // of these view functions, so observations never establish protocol identity.
  if(op.category==='vault') {
   const action=String(op.fields.action),amount=BigInt(String(op.fields.amount));const account=String(op.fields.owner??(request.kind==='transaction'?request.transaction.from:''));
   const receiver=String(op.fields.receiver);const limitAccount=['Deposit','Mint'].includes(action[0].toUpperCase()+action.slice(1))?receiver:account;
   const cap=action[0].toUpperCase()+action.slice(1);
   const names=['asset','totalAssets','totalSupply',`preview${cap}`,`max${cap}`];
   const reads=await Promise.allSettled(names.map((n,i)=>read(n,i===3?[amount]:i===4?[limitAccount]:[])));
   const data:Record<string,unknown>={vault:target,...snapshot,identityVerified:false,action,amount:String(amount),limitAccount};
   const missing:string[]=[];reads.forEach((r,i)=>{if(r.status==='fulfilled')data[names[i]]=String(r.value);else missing.push(names[i]);});data.missing=missing;
   out.push(evidence('vault_context',missing.length?'unknown':'pass','Vault interfaces and previews observed',missing.length?'Some vault interfaces could not be read. No actual share price or withdrawal ability is inferred.':'A preview is a current contract return value, not a guarantee of execution price, asset value, or future exit.','rpc',data));
   if(reads[0].status==='fulfilled'&&isAddress(reads[0].value)&&request.kind==='transaction'){
    const underlying=reads[0].value,from=request.transaction.from;
    const keys=['underlyingDecimals','underlyingBalanceRaw','existingUnderlyingAllowanceRaw','shareBalanceRaw','shareDecimals'];
    const values=await Promise.allSettled([read('decimals',[],underlying),read('balanceOf',[from],underlying),read('allowance',[from,target],underlying),read('balanceOf',[account]),read('decimals')]);
    const context:Record<string,unknown>={underlying,account,amountKind:op.fields.amountKind,...snapshot,missing:keys.filter((_,i)=>values[i].status==='rejected')};
    values.forEach((v,i)=>{if(v.status==='fulfilled')context[keys[i]]=String(v.value);});
    out.push(evidence('vault_asset_context',values.some(v=>v.status==='rejected')?'unknown':'pass','Vault asset and share units observed','Underlying tokens and shares are read separately. Without decimals, values are raw units, not dollars or directly comparable quantities.','rpc',context));
   }
   if(reads[4].status==='fulfilled'&&amount>BigInt(String(reads[4].value)))out.push(evidence('vault_limit','warning','Requested amount exceeds the reported vault limit','The amount exceeds the current max-interface return value. Execution may revert; review the limit and units.','rpc',snapshot));
  }
  if(op.category==='lending') {
   const owner=String(op.fields.onBehalfOf);const reads=await Promise.allSettled([read('getUserAccountData',[owner]),read('getConfiguration',[op.fields.asset])]);
   const data:Record<string,unknown>={pool:target,owner,asset:op.fields.asset,...snapshot,identityVerified:false};
   if(reads[0].status==='fulfilled'&&Array.isArray(reads[0].value))['totalCollateralBase','totalDebtBase','availableBorrowsBase','currentLiquidationThreshold','ltv','healthFactor'].forEach((k,i)=>data[k]=String((reads[0] as PromiseFulfilledResult<any>).value[i]));
   if(reads[1].status==='fulfilled')data.reserveConfiguration=JSON.parse(JSON.stringify(reads[1].value,(_,v)=>typeof v==='bigint'?String(v):v));
   out.push(evidence('lending_context',reads.some(r=>r.status==='rejected')?'unknown':'pass','Current lending account state observed','An Aave-style interface does not establish protocol identity. This upstream health factor is a current observation, not a post-operation calculation. Separate fork-state evidence may observe the executed request result, but future price changes and oracle reliability remain unverified.','rpc',data));
   if(typeof data.healthFactor==='string'&&/^\d+$/.test(data.healthFactor)&&BigInt(data.healthFactor)<10n**18n)out.push(evidence('liquidation_risk','risk','Account interface reports health factor below 1','Under this interface convention of 1e18 per unit, the reported factor indicates liquidation exposure. Protocol identity and price data still require verification.','rpc',{...snapshot,healthFactor:data.healthFactor}));
  }
 }catch{out.push(evidence(needed,'unknown','Contract or protocol context query failed','The RPC timed out, the network differed, code was absent, or an interface was unsupported. Missing data is not a pass.','rpc'));}
 return out;
}
