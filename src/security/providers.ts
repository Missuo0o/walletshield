import { createPublicClient, http, keccak256 } from 'viem';
import type { SecurityRequest, Operation, Evidence } from './types.js';
import type { SecurityConfig } from './config.js';
import { evidence, snapshotMetadata, validateAccountCode } from './evidence.js';
import {intelligenceEvidence} from './intelligence.js';
import { simulateRequest } from './simulation.js';
import { signatureChainEvidence, signatureStructure } from './signatures.js';
import { planRequest } from './routing.js';
import {assetEvidence} from './assets.js';
import { protocolEvidence } from './protocols.js';
import {accountEvidence} from './account-evidence.js';
import {batchEvidence} from './batch-evidence.js';
import {positionEvidence} from './position-evidence.js';
import {sourceVerificationEvidence} from './source-verification.js';
import {orderEvidence} from './orders.js';
import {userOperationEvidence} from './user-operation-evidence.js';
import {delegationEvidence} from './delegation-evidence.js';
import {bridgeScopeEvidence} from './bridge-scope.js';
import {executionLimitations} from './transaction-fields.js';
import {transactionTraceEvidence} from './trace.js';
export { evidence } from './evidence.js';
export type Collector = (request:SecurityRequest, op:Operation) => Promise<Evidence[]>;
export function collector(config:SecurityConfig, fetcher:typeof fetch = fetch):Collector {
  return async(request,op)=>{
    const tasks=[basicCollector(config,fetcher)(request,op),simulateRequest(request,op,config),signatureChainEvidence(request,config),protocolEvidence(request,op,config,fetcher),assetEvidence(request,op,config),accountEvidence(request,op,config,fetcher),Promise.resolve(batchEvidence(request,op)),positionEvidence(request,op,config,fetcher),intelligenceEvidence(request,op,config,fetcher),sourceVerificationEvidence(request,op,config,fetcher),orderEvidence(request,op,config,fetcher),userOperationEvidence(request,op,config,fetcher),delegationEvidence(request,op,config,fetcher),Promise.resolve(bridgeScopeEvidence(request,op)),transactionTraceEvidence(request,config,fetcher)];
    // Leave time for the API to retain completed tools before its overall budget.
    const results=await Promise.allSettled(tasks.map(async(task,index)=>{
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{return await Promise.race([task,new Promise<Evidence[]>(resolve=>{timer=setTimeout(()=>resolve([evidence(`collector_${index}`,'unknown','Evidence tool exceeded its time budget','Other completed tools are retained. This tool may have unfinished reads; no success is inferred from its timeout.','service')]),21000);})]);}
      finally{if(timer)clearTimeout(timer);}
    }));
    return [planRequest(request,op,config),...signatureStructure(request),...results.flatMap((result,i)=>result.status==='fulfilled'?result.value:[evidence(`collector_${i}`,'unknown','Some evidence collection failed','Other successfully collected evidence is retained.','service')])];
  };
}
function basicCollector(config:SecurityConfig, fetcher:typeof fetch):Collector {
  return async(request,op) => {
    const collected:Evidence[]=[];
    const claimed=Number(op.fields.domainChainId??op.fields.chainId);
    const lookupChain=request.chainId || (Number.isSafeInteger(claimed)&&claimed>0?claimed:0);
    const rpc=config.rpc[lookupChain];
    if (!rpc) collected.push(evidence('chain_context','unknown','No RPC configured for this network','Actual state on this network was not read.','configuration'));
    else {
      try {
        const client=createPublicClient({transport:http(rpc,{timeout:2400,retryCount:0,fetchOptions:{redirect:'error'}})});
        if(await client.getChainId()!==lookupChain) throw Error('Wrong chain');
        const block=await client.getBlockNumber({cacheTime:0});
        const from=request.kind==='transaction'?request.transaction.from:request.kind==='signature'?request.signature.from:undefined;
        const to=request.kind==='transaction'?request.transaction.to:op.token;
        const [headerResult,balanceResult,codeResult,nonceResult,pendingResult] = await Promise.allSettled([
          client.getBlock({blockNumber:block}),
          from?client.getBalance({address:from as `0x${string}`,blockNumber:block}):Promise.resolve(undefined),
          to?client.getCode({address:to as `0x${string}`,blockNumber:block}).then(validateAccountCode):Promise.resolve(undefined),
          request.kind==='transaction'?client.request({method:'eth_getTransactionCount',params:[request.transaction.from as `0x${string}`,`0x${block.toString(16)}`]}).then(value=>{if(!/^0x[\da-f]{1,64}$/i.test(value))throw Error('Invalid nonce');return BigInt(value);}):Promise.resolve(undefined),
          request.kind==='transaction'?client.request({method:'eth_getTransactionCount',params:[request.transaction.from as `0x${string}`,'pending']}).then(value=>{if(!/^0x[\da-f]{1,64}$/i.test(value))throw Error('Invalid pending nonce');return BigInt(value);}):Promise.resolve(undefined)
        ]);
        const header=headerResult.status==='fulfilled'&&headerResult.value.number===block?headerResult.value:undefined;
        const snapshot=snapshotMetadata(lookupChain,block,header);
        const balance=balanceResult.status==='fulfilled'?balanceResult.value:undefined;
        const code=codeResult.status==='fulfilled'?codeResult.value:undefined;
        const missing=[...(!header?['block_header']:[]),...(from&&balance===undefined?['native_balance']:[]),...(to&&code===undefined?['target_code']:[])];
        collected.push(evidence('chain_context','pass',request.chainId?'Chain state observed':'Queried the message-declared network',`Independent reads are pinned to block ${block}. ${request.chainId?'':'The query network comes from the message claim, not a verified signing network.'} Missing reads remain unknown.`,'rpc',{...snapshot,claimedNetwork:!request.chainId,readChainSource:request.chainId?'request':'message_claim',missing,...(balance!==undefined?{nativeBalanceWei:String(balance)}:{}),...(to?{target:to,...(code!==undefined?{targetHasCode:code!=='0x'}:{})}:{})}));
        if(missing.length)collected.push(evidence('chain_state_missing','unknown','Some pinned chain reads are unavailable','Available state and call results are retained; missing code, balances, or header data must not be interpreted as zero or absence.','rpc',{...snapshot,missing}));
        if(code&&/^0xef0100[\da-f]{40}$/i.test(code)) {
          const delegate=`0x${code.slice(8)}` as `0x${string}`;
          collected.push(evidence('delegated_account','warning','Target account has code delegation','The target has an EIP-7702 delegation designation at this block. This does not establish trusted execution rules.','rpc',{...snapshot,target:to,delegate}));
          try{const delegateCode=await client.getCode({address:delegate,blockNumber:block}).then(validateAccountCode);collected.push(evidence('target_delegate_code',delegateCode&&delegateCode!=='0x'?'warning':'unknown','Delegation target code observed','Only one delegation target is read. Its bytecode is not audited; recursive delegation, authority, and future changes remain unverified.','rpc',{...snapshot,target:to,delegate,hasCode:!!delegateCode&&delegateCode!=='0x',...(delegateCode&&delegateCode!=='0x'?{codeHash:keccak256(delegateCode)}:{}),identityVerified:false}));}catch{collected.push(evidence('target_delegate_code','unknown','Delegation target code unavailable','The designation is retained, but delegated implementation code could not be read.','rpc',{...snapshot,target:to,delegate}));}
        }
        if(request.kind==='transaction') {
          const tx=request.transaction,unsupported=executionLimitations(tx);
          const nonce=nonceResult.status==='fulfilled'?nonceResult.value:undefined,declared=tx.nonce===undefined?undefined:BigInt(tx.nonce);
          const pending=pendingResult.status==='fulfilled'?pendingResult.value:undefined;
          collected.push(evidence('transaction_nonce',nonce===undefined?'unknown':declared!==undefined&&declared!==BigInt(nonce)?'warning':'pass','Transaction nonce compared with confirmed state','The confirmed account nonce at this block is an observation. A lower supplied nonce is already consumed under ordinary account semantics; a higher one may require predecessors. Pending-count observations are separate; replacement policy and future inclusion remain unverified.','rpc',{...snapshot,account:tx.from,confirmedNonce:nonce===undefined?null:String(nonce),declaredNonce:declared===undefined?null:String(declared),relation:nonce===undefined||declared===undefined?null:declared<BigInt(nonce)?'below_confirmed':declared>BigInt(nonce)?'above_confirmed':'matches_confirmed',pendingNonceChecked:pending!==undefined}));
          const inconsistent=pending!==undefined&&nonce!==undefined&&pending<nonce,overlaps=declared!==undefined&&nonce!==undefined&&pending!==undefined&&declared>=nonce&&declared<pending;
          collected.push(evidence('transaction_pending_nonce',pending===undefined||inconsistent?'unknown':overlaps?'warning':'pass','RPC pending nonce observed',inconsistent?'The RPC pending view is below the confirmed snapshot; these observations cannot be combined into a consistent pending range.':'Pending is one node’s unpinned view and may omit private or remote transactions. An overlapping nonce is only a replacement candidate: the original payload, cancellation intent, price-bump rules and inclusion are not verified.','rpc',{chainId:lookupChain,account:tx.from,view:'pending',pendingReadAt:new Date().toISOString(),confirmedBlockNumber:String(block),confirmedNonce:nonce===undefined?null:String(nonce),pendingNonce:pending===undefined?null:String(pending),declaredNonce:declared===undefined?null:String(declared),overlapsObservedPendingRange:!inconsistent&&overlaps,pendingPayloadChecked:false}));
          const baseFee=header?.baseFeePerGas,fee=tx.maxFeePerGas??tx.gasPrice;
          collected.push(evidence('transaction_base_fee',baseFee===undefined||baseFee===null||fee===undefined?'unknown':BigInt(fee)<baseFee?'warning':'pass','Supplied fee compared with the observed base fee','A supplied gas price or maximum fee below this block base fee cannot cover that base fee. Matching it does not establish sufficient priority fee, funding, or future inclusion; the next block base fee may differ.','rpc',{...snapshot,baseFeePerGasWei:baseFee===undefined||baseFee===null?null:String(baseFee),suppliedFeeCapWei:fee===undefined?null:String(BigInt(fee)),feeSource:tx.maxFeePerGas!==undefined?'maxFeePerGas':tx.gasPrice!==undefined?'gasPrice':null,futureBaseFeeKnown:false}));
          if(balance!==undefined && BigInt(tx.value??'0x0')>balance) collected.push(evidence('native_balance','risk','Transfer value exceeds the native balance','The declared value alone exceeds the current native balance, before gas.','rpc',snapshot));
          try {
            if(unsupported.length)throw Error('Unsupported execution fields');
            const executionFields=Object.fromEntries((['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'] as const).filter(key=>tx[key]!==undefined).map(key=>[key,tx[key]]));
            await client.request({method:'eth_call',params:[{from:tx.from as `0x${string}`,...(tx.to?{to:tx.to as `0x${string}`} :{}),data:tx.data as `0x${string}`,value:(tx.value??'0x0') as `0x${string}`,...executionFields},`0x${block.toString(16)}`]});
            collected.push(evidence('basic_call','pass','Basic call did not revert','Only eth_call was performed with supplied execution fields. Inclusion, nonce submission validity, complete asset changes, sellability, and future execution were not verified.','rpc',snapshot));
          } catch { collected.push(evidence('basic_call','unknown',unsupported.length?'Basic call cannot preserve this execution envelope':'Basic call failed',unsupported.length?'Unsupported execution fields are not removed to check a substitute request.':'Balance, allowance, routing, or contract restrictions may explain failure. This alone does not establish a honeypot.','rpc',{...snapshot,...(unsupported.length?{unsupportedFields:unsupported}:{})})); }
        }

      } catch { collected.push(evidence('chain_context','unknown','Chain-state query failed','The RPC was unavailable, timed out, or reported a different chain ID.','rpc')); }
    }
    // A basic call is not a trace or a dependent buy/sell simulation.
    if(request.kind!=='transaction')collected.push(evidence('asset_simulation','unknown','Future signature consumption was not simulated','An unsigned message does not specify the complete future consumption transaction.','coverage'));
    return collected;
  };
}
