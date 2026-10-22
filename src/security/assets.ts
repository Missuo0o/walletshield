import {createPublicClient,http,parseAbi,erc20Abi,formatUnits,type Address} from 'viem';
import type {SecurityRequest,Operation,Evidence} from './types.js';
import type {SecurityConfig} from './config.js';
import {evidence,snapshotMetadata,validateAccountCode} from './evidence.js';
const nftAbi=parseAbi(['function supportsInterface(bytes4) view returns(bool)','function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)','function balanceOf(address,uint256) view returns(uint256)']);
const permit2Abi=parseAbi(['function allowance(address owner,address token,address spender) view returns(uint160 amount,uint48 expiration,uint48 nonce)']);
const address=(v:unknown):v is Address=>typeof v==='string'&&/^0x[\da-f]{40}$/i.test(v);
function declaredCap(op:Operation,token:string):string|undefined {
 if(op.category==='permit_signature'&&op.tokenStandard==='erc20'&&typeof op.fields.value==='string'&&/^\d+$/.test(op.fields.value))return op.fields.value;
 if(op.category==='permit2_signature'&&Array.isArray(op.fields.tokens)&&Array.isArray(op.fields.amounts)){
  const indexes=op.fields.tokens.flatMap((item,i)=>item.toLowerCase()===token.toLowerCase()?[i]:[]);
  // Duplicate tokens can mean sequential replacements or multiple transfers.
  // Do not invent one aggregate cap without executing the precise protocol.
  if(indexes.length===1&&/^\d+$/.test(op.fields.amounts[indexes[0]]??''))return op.fields.amounts[indexes[0]];
 }
 return undefined;
}
/** All explicitly named assets, not just the output token. Bounded, fixed-block
 * interface observations; a view return is not an authenticated asset identity. */
export async function assetEvidence(request:SecurityRequest,op:Operation,config:SecurityConfig):Promise<Evidence[]>{
 const candidates=[op.token,...(['tokens','path'].flatMap(k=>Array.isArray(op.fields[k])?op.fields[k] as string[]:[])),op.fields.asset,op.fields.localToken].filter(address);
 const unique=[...new Map(candidates.map(a=>[a.toLowerCase(),a])).values()];if(!unique.length)return [];
 if(request.kind==='signature'&&!op.decoded)return [evidence('signature_assets','unknown','Signature asset scope is not validated','Tokens, caps, and extra properties from an unvalidated type graph are not treated as committed asset authority.','coverage')];
 const chainId=request.chainId||Number(op.fields.domainChainId),rpc=config.rpc[chainId];
 if(!rpc)return [evidence('token_identity','unknown','Asset state unavailable','No RPC is configured for the claimed network.','configuration')];
 const client=createPublicClient({transport:http(rpc,{timeout:2400,retryCount:0,fetchOptions:{redirect:'error'}})});
 const from=request.kind==='transaction'?request.transaction.from:request.kind==='signature'?request.signature.from:undefined;
 const owner=address(op.fields.owner)?op.fields.owner:from;
 const out:Evidence[]=[];
 try{
  if(await client.getChainId()!==chainId)throw Error('Wrong network');const block=await client.getBlockNumber({cacheTime:0});
  let header;try{header=await client.getBlock({blockNumber:block});}catch{/* Preserve balances when only the header is unavailable. */}
  const snapshot=snapshotMetadata(chainId,block,header);
  const chainTime=header?.number===block&&typeof header.timestamp==='bigint'?header.timestamp:undefined;
  await Promise.all(unique.slice(0,8).map(async(token,index)=>{
   const id=index===0?'token_identity':`asset_identity_${index}`;
   const read=(name:string,args:unknown[]=[],abi:any=nftAbi)=>client.readContract({address:token,abi,functionName:name,args,blockNumber:block}) as Promise<any>;
   const chainPermit2=request.kind==='transaction'&&op.category==='permit2_approval';
   const permit2=chainPermit2||request.kind==='signature'&&op.category==='permit2_signature';
   const verifier=chainPermit2?request.transaction.to:permit2&&address(op.fields.verifyingContract)?op.fields.verifyingContract:undefined;
   let chainUnderlyingAllowance:bigint|undefined;
   // Permit2 has two different allowance stores. Read the internal store
   // independently, so failure of the token interface cannot erase this fact.
   if(chainPermit2&&address(owner)&&address(verifier)&&address(op.fields.spender)){
    const layer={token,owner,spender:op.fields.spender,verifyingContract:verifier,allowanceLayer:'permit2_to_spender',identityVerified:false,...snapshot};
    try{
     const [amount,expiration,nonce]=await client.readContract({address:verifier,abi:permit2Abi,functionName:'allowance',args:[owner,token,op.fields.spender],blockNumber:block});
     out.push(evidence(index===0?'permit2_allowance':`permit2_allowance_${index}`,'pass','Existing internal Permit2 allowance observed','This is the claimed Permit2 contract storage for owner, token and final spender. It is separate from the underlying ERC-20 allowance to this contract. A readable interface does not authenticate its implementation or guarantee safe future consumption.','rpc',{...layer,amount:String(amount),expiration:String(expiration),nonce:String(nonce),activeAtObservedBlock:chainTime===undefined?null:amount>0n&&BigInt(expiration)>=chainTime}));
    }catch{out.push(evidence(index===0?'permit2_allowance':`permit2_allowance_${index}`,'unknown','Internal Permit2 allowance unavailable','The internal owner/token/spender allowance could not be read. The underlying ERC-20 allowance is checked independently and is not substituted for this missing layer.','rpc',layer));}
    const underlying={token,owner,spender:verifier,allowanceLayer:'erc20_to_verifying_contract',...snapshot};
    try{
     chainUnderlyingAllowance=await read('allowance',[owner,verifier],erc20Abi);
     out.push(evidence(index===0?'existing_allowance':`existing_allowance_${index}`,'pass','Existing ERC-20 allowance observed','This is the underlying approval from the owner to the claimed Permit2 contract. The internal allowance to the final spender is observed independently; neither interface return authenticates the implementation or guarantees safe consumption.','rpc',{...underlying,amount:String(chainUnderlyingAllowance)}));
    }catch{out.push(evidence(`allowance_unavailable_${index}`,'unknown','Existing ERC-20 allowance unavailable','The underlying token allowance to the claimed Permit2 contract could not be read. The internal allowance is independent and is not substituted for this missing layer.','rpc',underlying));}
   }
   try{
    // Always read this asset's code, independently of the transaction target.
    const code=await client.getCode({address:token,blockNumber:block}).then(validateAccountCode);if(!code||code==='0x')throw Error('No asset code');
    const interfaces=await Promise.allSettled(['0x80ac58cd','0xd9b67a26'].map(i=>read('supportsInterface',[i])));
    if(interfaces.every(v=>v.status==='fulfilled'&&v.value===true))throw Error('Conflicting NFT standards');
    const standard=interfaces[0].status==='fulfilled'&&interfaces[0].value===true?'erc721':interfaces[1].status==='fulfilled'&&interfaces[1].value===true?'erc1155':'erc20';
    const data:Record<string,unknown>={address:token,standard,...snapshot,identityVerified:false};
    const expectedStandard=permit2?'erc20':op.tokenStandard;
    if(expectedStandard&&expectedStandard!=='ambiguous'&&expectedStandard!==standard)out.push(evidence(`asset_standard_mismatch_${index}`,'unknown','Asset standard declaration conflicts with request semantics','Interfaces may be imitated or have nonstandard semantics. An ERC-20 cap must not be treated as an NFT identifier or transferable quantity.','rpc',{token,expectedStandard,observedStandard:standard,...snapshot,identityVerified:false}));
    if(standard==='erc20'){
     const [symbolResult,decimalsResult,balanceResult]=await Promise.allSettled([read('symbol',[],erc20Abi),read('decimals',[],erc20Abi),owner?read('balanceOf',[owner],erc20Abi):Promise.resolve(undefined)]);
     const decimals=decimalsResult.status==='fulfilled'&&Number.isInteger(decimalsResult.value)&&decimalsResult.value>=0&&decimalsResult.value<=255?decimalsResult.value:undefined;
     const balance=balanceResult.status==='fulfilled'&&typeof balanceResult.value==='bigint'?balanceResult.value:undefined;
     if(symbolResult.status==='fulfilled')data.symbol=String(symbolResult.value).slice(0,64);else data.symbolUnavailable=true;
     if(decimals!==undefined)data.decimals=decimals;
     if(balance!==undefined){data.owner=owner;data.balance=String(balance);if(decimals!==undefined)data.balanceFormatted=formatUnits(balance,decimals);}
     data.missing=[...(decimals===undefined?['decimals']:[]),...(owner&&balance===undefined?['balanceOf']:[])];
     const unitsComplete=decimals!==undefined&&(!owner||balance!==undefined);
     out.push(evidence(id,unitsComplete?'pass':'unknown',unitsComplete?'Token units and balance observed':'Token units or balance partly unavailable','Symbol is optional metadata; its failure does not discard balances or allowances. Without decimals, quantities remain raw units. Names, interfaces, and returned balances do not establish reputation or price.','rpc',data));
     if(!unitsComplete&&balance!==undefined)out.push(evidence(`asset_balance_${index}`,'pass','Raw token balance observed','Missing units or names do not discard an observed raw balance for the same asset. It is not a dollar value or formatted token amount.','rpc',{token,owner,balanceRaw:String(balance),units:'token_raw',...snapshot}));
     const spender=permit2&&address(verifier)?verifier:address(op.fields.spender)?op.fields.spender:request.kind==='transaction'&&['swap','swap_v3','liquidity','staking','lending'].includes(op.category)?request.transaction.to:undefined;
     let allowance:bigint|undefined=chainUnderlyingAllowance;
     if(!chainPermit2&&owner&&address(spender)){
      try{allowance=await read('allowance',[owner,spender],erc20Abi);out.push(evidence(index===0?'existing_allowance':`existing_allowance_${index}`,'pass','Existing ERC-20 allowance observed',permit2?'This is the underlying approval from the owner to the claimed Permit2 contract. Permit2 permissions for the final spender are read separately and must not be conflated.':'The specified owner and spender are queried. A Permit may replace this allowance; future consumption purpose remains unverified.','rpc',{token,owner,spender,amount:String(allowance),...(decimals!==undefined?{decimals}:{}),allowanceLayer:permit2?'erc20_to_verifying_contract':'erc20_to_spender',...snapshot}));}catch{out.push(evidence(`allowance_unavailable_${index}`,'unknown','Existing ERC-20 allowance unavailable','A readable balance does not establish that the allowance interface is available.','rpc',{token,owner,spender,allowanceLayer:permit2?'erc20_to_verifying_contract':'erc20_to_spender',...snapshot}));}
     }
     if(request.kind==='signature'&&['permit_signature','permit2_signature'].includes(op.category)){
      const cap=declaredCap(op,token),missing=[...(cap===undefined?['unambiguous_declared_cap']:[]),...(balance===undefined?['balanceOf']:[]),...(permit2&&allowance===undefined?['erc20_allowance_to_verifier']:[])];
      const exposure:Record<string,unknown>={token,owner,spender,protocol:op.fields.permitProtocol,units:'token_raw',...snapshot,missing,conditionalOnValidPermit:true,consumptionExecuted:false,futureBalanceCovered:false,...(balance!==undefined?{balanceRaw:String(balance)}:{}),...(cap!==undefined?{declaredCapRaw:cap}:{}),...(allowance!==undefined?{existingAllowanceRaw:String(allowance)}:{})};
      if(!missing.length){const bounds=[balance!,BigInt(cap!),...(permit2?[allowance!]:[])];const bound=bounds.reduce((min,value)=>value<min?value:min);exposure.snapshotBalanceBoundRaw=String(bound);if(decimals!==undefined){exposure.decimals=decimals;exposure.snapshotBalanceBoundFormatted=formatUnits(bound,decimals);}}
      out.push(evidence(index===0?'signature_exposure':`signature_exposure_${index}`,missing.length?'unknown':'pass','Conditional signature cap against current balance','This takes the minimum of the declared cap, same-token balance, and underlying Permit2 approval where applicable, conditional on a valid signature and standard implementation. It is not a measured transferable amount, price, or future loss. Duplicate assets are not guessed into one cap; future deposits, restrictions, taxes, and actual consumption remain unknown.','rpc',exposure));
     }
    }else{
     out.push(evidence(id,'pass','NFT standard declaration observed','An ERC-165 declaration does not authenticate the collection or guarantee standard behavior.','rpc',data));
     if(!owner)return;
     const operator=permit2&&address(verifier)?verifier:address(op.fields.operator)?op.fields.operator:address(op.fields.spender)?op.fields.spender:from;
     if(operator){try{out.push(evidence(`nft_operator_${index}`,'pass','Existing NFT operator approval observed','Only the specified owner and operator are queried. Holdings and future assets are not enumerated.','rpc',{token,owner,operator,approved:await read('isApprovedForAll',[owner,operator]),...snapshot}));}catch{out.push(evidence(`nft_operator_${index}`,'unknown','NFT operator approval unavailable','The interface failed; this must not be treated as absence of authority.','rpc'));}}
     const single=op.fields.tokenId??(['approval','asset_transfer_from'].includes(op.category)?op.fields.amountOrTokenId:undefined);
     const ids=Array.isArray(op.fields.ids)?op.fields.ids:typeof single==='string'?[single]:[];
     await Promise.all(ids.slice(0,16).map(async(tokenId,j)=>{
      const names=standard==='erc721'?['ownerOf','getApproved']:['balanceOf'];
      const values=await Promise.allSettled(names.map(name=>read(name,name==='balanceOf'?[owner,BigInt(tokenId)]:[BigInt(tokenId)])));
      const state:Record<string,unknown>={...snapshot,token,tokenId,standard,missing:[]};
      values.forEach((value,k)=>{if(value.status==='fulfilled')state[names[k]==='ownerOf'?'owner':names[k]==='getApproved'?'approved':'balance']=String(value.value);else(state.missing as string[]).push(names[k]);});
      out.push(evidence(`nft_position_${index}_${j}`,(state.missing as string[]).length?'unknown':'pass','NFT identifier state observed','Ownership, balance, and approval reads are independent. Available observations are retained when another interface fails; NFT value and future behavior remain unverified.','rpc',state));
     }));
     if(ids.length>16)out.push(evidence(`nft_limit_${index}`,'unknown','NFT identifier checks truncated','At most 16 identifiers are queried; the remainder was not individually checked.','coverage'));
    }
   }catch{out.push(evidence(id,'unknown','Asset code or standard unverified','The asset has no observed code, an interface failed, or a query failed. Code from another call target is not substituted for asset evidence.','rpc',{address:token,...snapshot}));}
  }));
  if(unique.length>8)out.push(evidence('asset_limit','unknown','Asset queries truncated','At most 8 explicit assets are queried. Remaining and hidden assets were not individually checked.','coverage'));
 }catch{out.push(evidence('token_identity','unknown','Asset contract queries failed','The RPC is unavailable or the network differs.','rpc'));}
 return out;
}
