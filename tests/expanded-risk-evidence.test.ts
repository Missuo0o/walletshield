import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionData,encodeFunctionResult,erc20Abi,parseAbi,type Address} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import {simulateRequest,type ForkFactory} from '../src/security/simulation.js';
import {INTELLIGENCE_LIMITS,intelligenceEvidence,intelligenceScope} from '../src/security/intelligence.js';
import {batchEvidence} from '../src/security/batch-evidence.js';
import {protocolEvidence} from '../src/security/protocols.js';
import {assess} from '../src/security/rules.js';
import {evidencePacket} from '../src/security/ai.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest} from '../src/security/types.js';

const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const owner=address(1),input=address(2),output=address(3),router=address(4),other=address(5);
const config:SecurityConfig={apiKey:'',model:'not-used',aiEnabled:false,lookups:true,goPlusToken:'',rpc:{},forkEnabled:true};
const v3Abi=(deadline:boolean)=>parseAbi([`function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,${deadline?'uint256 deadline,':''}uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params)`]);
function v3Request(deadline:boolean):Extract<SecurityRequest,{kind:'transaction'}>{return {kind:'transaction',chainId:1,origin:'https://source.example',transaction:{from:owner,to:router,value:'0x0',gas:'0x186a0',nonce:'0x5',maxFeePerGas:'0x64',maxPriorityFeePerGas:'0xa',data:encodeFunctionData({abi:v3Abi(deadline),functionName:'exactInputSingle',args:[{tokenIn:input,tokenOut:output,fee:3000,recipient:owner,...(deadline?{deadline:2000000000n}:{}),amountIn:100n,amountOutMinimum:1n,sqrtPriceLimitX96:123n}]})}};}
function forkFixture(deadline:boolean,options:{sellFails?:boolean;acquired?:bigint}={}){
 const sent:Record<string,string>[]=[],balances=new Map([[input.toLowerCase(),1000n],[output.toLowerCase(),0n]]);
 let nonce=5n,snapshot:Map<string,bigint>|undefined,closed=0;
 const receipts=new Map<string,any>();
 const factory:ForkFactory=async()=>({chainId:1,blockNumber:'40',blockHash:`0x${'a'.repeat(64)}`,blockTimestampSeconds:'1900000000',close:async()=>{closed++;},rpc:async(method,params=[])=>{
  if(method==='evm_snapshot'){snapshot=new Map(balances);return '0x1';}
  if(method==='evm_revert'){balances.clear();for(const [key,value] of snapshot!)balances.set(key,value);nonce=5n;return true;}
  if(method==='anvil_impersonateAccount')return true;
  if(method==='eth_getBalance')return '0x100000';
  if(method==='debug_traceTransaction')return {type:'CALL',from:owner,to:router,input:sent[0]?.data};
  if(method==='eth_call'){const call=params[0] as {to:string;data:`0x${string}`},decoded=decodeFunctionData({abi:erc20Abi,data:call.data});assert.equal(decoded.functionName,'balanceOf');return encodeFunctionResult({abi:erc20Abi,functionName:'balanceOf',result:balances.get(call.to.toLowerCase())??0n});}
  if(method==='eth_sendTransaction'){
   const tx=params[0] as Record<string,string>;sent.push(tx);if(tx.nonce!==undefined)assert.equal(BigInt(tx.nonce),nonce,'Original buy nonce must be preserved.');
   if(tx.to.toLowerCase()===router.toLowerCase()){
    let decoded:any;try{decoded=decodeFunctionData({abi:v3Abi(deadline),data:tx.data as `0x${string}`});}catch{}
    if(decoded){const p=decoded.args[0];if(p.tokenIn.toLowerCase()===input.toLowerCase()){balances.set(input.toLowerCase(),balances.get(input.toLowerCase())!-60n);if(p.recipient.toLowerCase()===owner.toLowerCase())balances.set(output.toLowerCase(),balances.get(output.toLowerCase())!+(options.acquired??100n));}
     else{if(options.sellFails)throw Error('Reverse route failed');assert.equal(p.amountIn,options.acquired??100n);assert.equal(p.tokenOut.toLowerCase(),input.toLowerCase());assert.equal(p.fee,3000);assert.equal(p.amountOutMinimum,0n);assert.equal(p.sqrtPriceLimitX96,0n);assert.equal(p.recipient.toLowerCase(),owner.toLowerCase());balances.set(output.toLowerCase(),balances.get(output.toLowerCase())!-p.amountIn);balances.set(input.toLowerCase(),balances.get(input.toLowerCase())!+54n);}}
   }else{assert.equal(tx.to.toLowerCase(),output.toLowerCase());const approval=decodeFunctionData({abi:erc20Abi,data:tx.data as `0x${string}`});assert.equal(approval.functionName,'approve');assert.deepEqual(approval.args,[router,options.acquired??100n]);}
   nonce++;const hash=`0x${sent.length.toString(16).padStart(64,'0')}`;receipts.set(hash,{status:'0x1',blockNumber:'0x29',gasUsed:'0x100',effectiveGasPrice:'0x1',logs:[]});return hash;
  }
  if(method==='eth_getTransactionReceipt')return receipts.get(String(params[0]));
  throw Error(`Unexpected child-only RPC ${method}`);
 }});
 return {factory,sent,closed:()=>closed};
}

test('both canonical V3 exactInputSingle variants replay the original buy and use actual partial-fill debit for the reverse experiment',async()=>{
 for(const deadline of [true,false]){
  const request=v3Request(deadline),fixture=forkFixture(deadline),checks=await simulateRequest(request,decodeRequest(request),config,fixture.factory),roundTrip=checks.find(check=>check.id==='round_trip')!;
  assert.equal(roundTrip.status,'warning');assert.equal(roundTrip.data?.variant,'v3_single');assert.equal(roundTrip.data?.roundTripReturnPercent,90);assert.equal(roundTrip.data?.declaredInputRaw,'100');assert.equal(roundTrip.data?.observedInputDebitRaw,'60');assert.equal(roundTrip.data?.ratioInputRaw,'60');assert.equal(roundTrip.data?.deadlinePresent,deadline);assert.equal(roundTrip.data?.originalPriceLimit,'123');assert.equal(roundTrip.data?.blockTimestampSeconds,'1900000000');assert.equal(fixture.closed(),1);
  assert.equal(fixture.sent.length,4);for(const buy of fixture.sent.slice(0,2))for(const key of ['data','gas','nonce','maxFeePerGas','maxPriorityFeePerGas','value'] as const)assert.equal(buy[key],request.transaction[key]);
  for(const dependent of fixture.sent.slice(2)){assert.equal(dependent.nonce,undefined);assert.equal(dependent.maxFeePerGas,'0x64');assert.equal(dependent.maxPriorityFeePerGas,'0xa');assert.equal(dependent.gas,'0xb71b00');}
  const protocol=await protocolEvidence(request,decodeRequest(request),config);
  const packet=evidencePacket(assess(request,[...checks,...protocol]));
  assert.equal(packet.checks.find(check=>check.id==='round_trip')?.data?.returned,'54');
  const semantics=packet.checks.find(check=>check.id==='protocol_semantics')!;
  assert.equal(semantics.status,'unknown','A completed reverse experiment does not establish all protocol semantics.');
  assert.match(semantics.detail,/canonical V3 single\/multi-hop exact-input and exact-output/);
  assert.match(semantics.detail,/separate round_trip evidence/);
  assert.doesNotMatch(semantics.detail,/Dependent V3 buy\/sell testing is unavailable/);
 }
});

test('failed V3 reverse selling is a warning, zero acquired balance is adverse, unsupported recipient/native funding stays explicit',async()=>{
 const request=v3Request(true),failed=forkFixture(true,{sellFails:true});const failedChecks=await simulateRequest(request,decodeRequest(request),config,failed.factory);assert.equal(failedChecks.find(check=>check.id==='round_trip')?.status,'warning');assert.equal(failedChecks.find(check=>check.id==='round_trip')?.title,'Sell after buy failed');assert.equal(failed.closed(),1);
 const empty=forkFixture(true,{acquired:0n});assert.equal((await simulateRequest(request,decodeRequest(request),config,empty.factory)).find(check=>check.id==='round_trip')?.status,'risk');
 for(const different of [true,false]){
  const unsupported=v3Request(true);if(different)unsupported.transaction.data=encodeFunctionData({abi:v3Abi(true),functionName:'exactInputSingle',args:[{tokenIn:input,tokenOut:output,fee:3000,recipient:other,deadline:2000000000n,amountIn:100n,amountOutMinimum:0n,sqrtPriceLimitX96:0n}]});else unsupported.transaction.value='0x1';
  const child=forkFixture(true),checks=await simulateRequest(unsupported,decodeRequest(unsupported),config,child.factory);assert.equal(checks.find(check=>check.id==='round_trip')?.status,'unknown');assert.equal(child.sent.length,1,'Unsupported experiments must not synthesize approval/sell.');
  const protocol=await protocolEvidence(unsupported,decodeRequest(unsupported),config);
  const packet=evidencePacket(assess(unsupported,[...checks,...protocol]));
  assert.equal(packet.checks.find(check=>check.id==='round_trip')?.status,'unknown');
  assert.match(packet.checks.find(check=>check.id==='protocol_semantics')!.detail,/Unverified native funding or recipient aliases, router-balance input/);
 }
});

test('recognized V2/V3 batch candidates expand token/counterparty scope without treating remote bridge tokens or delegate storage as known holdings',()=>{
 const swapAbi=parseAbi(['function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)','function multicall(bytes[])']);
 const path=[input,address(6),output],swap=encodeFunctionData({abi:swapAbi,functionName:'swapExactTokensForTokens',args:[10n,1n,path,owner,2000000000n]}),approve=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[other,100n]});
 const request:SecurityRequest={kind:'transaction',chainId:1,transaction:{from:owner,to:router,data:encodeFunctionData({abi:swapAbi,functionName:'multicall',args:[[swap,approve,v3Request(true).transaction.data as `0x${string}`]]})}},op=decodeRequest(request),batch=batchEvidence(request,op),scope=intelligenceScope(request,op);
 assert.deepEqual(batch.find(check=>check.id==='batch_child_0_0')?.data?.parameters&&((batch.find(check=>check.id==='batch_child_0_0')!.data!.parameters as any).path),path);assert.equal(batch.find(check=>check.id==='batch_child_0_1')?.data?.tokenCandidate,router);assert.equal(batch.find(check=>check.id==='batch_child_0_2')?.data?.category,'swap_v3');assert.deepEqual((batch.find(check=>check.id==='batch_child_0_2')?.data?.parameters as any).tokens,[input,output]);
 for(const token of [...path,router])assert.ok(scope.tokens.map(value=>value.toLowerCase()).includes(token.toLowerCase()));assert.ok(scope.targets.includes(other));assert.equal(scope.batchContextVerified,false);
 const bridge={...op,fields:{localToken:input,remoteToken:address(99)},token:input,targets:[owner]};assert.deepEqual(intelligenceScope({...request,transaction:{...request.transaction,data:'0x'}},bridge).tokens,[input]);
});

function externalFixture(options:{unsupported?:boolean;failToken?:string;delayMs?:number}={}){
 const calls:string[]=[],headers:HeadersInit[]=[],state={active:0,maxActive:0};
 const fetcher:typeof fetch=async(url,init)=>{
  const parsed=new URL(String(url));assert.equal(parsed.origin,'https://api.gopluslabs.io');assert.equal(init?.redirect,'error');calls.push(String(url));headers.push(init?.headers??{});state.active++;state.maxActive=Math.max(state.maxActive,state.active);
  try{
   if(options.delayMs)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,options.delayMs);init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('timeout'));},{once:true});});
   let result:any;
   if(parsed.pathname.endsWith('supported_chains'))result=[{id:options.unsupported?'1':'31337'}];
   else if(parsed.pathname.includes('phishing_site'))result={phishing_site:'0'};
   else if(parsed.pathname.includes('address_security'))result={cybercrime:'0',money_laundering:'0',phishing_activities:'0',stealing_attack:'0',honeypot_related_address:'0',blackmail_activities:'0',sanctioned:'0'};
   else{const token=parsed.searchParams.get('contract_addresses')!;if(token===options.failToken)throw Error('One token unavailable');result={[token]:{is_honeypot:token===output?'1':'0',cannot_sell_all:'0',sell_tax:'0.1',token_name:'UNTRUSTED PROMPT'}};}
   return new Response(JSON.stringify({code:1,result}));
  }finally{state.active--;}
 };
 return {fetcher,calls,headers,state};
}
const intelligenceRequest:SecurityRequest={kind:'transaction',chainId:31337,origin:'https://source.example/path?secret=omitted',transaction:{from:owner,to:router,data:'0x'}};

test('bounded intelligence checks all selected path tokens and counterparties, retaining partial failures and per-token identity',async()=>{
 const op={...decodeRequest(intelligenceRequest),token:output,fields:{tokens:[input,output,address(6)],spender:other},targets:[owner,other]},fixture=externalFixture({failToken:address(6)});
 const facts=await intelligenceEvidence(intelligenceRequest,op,config,fixture.fetcher);
 assert.equal(facts.find(check=>check.id==='token_security')?.data?.token,output);assert.equal(facts.find(check=>check.id==='token_security')?.status,'risk');assert.equal(facts.find(check=>check.id===`token_security_${input}`)?.data?.is_honeypot,'0');assert.equal(facts.find(check=>check.id===`token_security_${address(6)}`)?.status,'unknown');assert.ok(!JSON.stringify(facts).includes('UNTRUSTED PROMPT'));
 assert.equal(fixture.calls.filter(url=>url.includes('token_security')).length,3);assert.equal(fixture.calls.filter(url=>url.includes('address_security')).length,3);assert.ok(fixture.state.maxActive<=INTELLIGENCE_LIMITS.concurrency);assert.ok(!fixture.calls.some(url=>url.includes('secret')));
 const scope=facts.find(check=>check.id==='intelligence_scope')!;assert.deepEqual(scope.data?.selectedTokens,[output,input,address(6)]);assert.equal(scope.data?.fullWalletInventory,false);
 const observed=facts.find(check=>check.id==='token_security')!;assert.equal(observed.data?.providerAsOf,null);assert.equal(observed.data?.freshnessVerified,false);assert.equal(observed.data?.cacheHit,false);assert.match(String(observed.data?.fetchedAt),/^\d{4}-/);
});

test('query limits are explicit; cache hits retain original observation time and never bypass unsupported-chain checks',async()=>{
 const candidates=Array.from({length:10},(_,i)=>address(i+20)),op={...decodeRequest(intelligenceRequest),token:candidates[0],fields:{tokens:candidates},targets:candidates},fixture=externalFixture();
 const facts=await intelligenceEvidence(intelligenceRequest,op,config,fixture.fetcher);assert.equal(fixture.calls.length,18);assert.equal(fixture.calls.filter(url=>url.includes('token_security')).length,8);assert.equal(fixture.calls.filter(url=>url.includes('address_security')).length,8);assert.ok(facts.some(check=>check.id==='token_intelligence_limit'&&check.status==='unknown'));assert.ok(facts.some(check=>check.id==='address_intelligence_limit'&&check.title.includes('truncated')));
 const before=fixture.calls.length,again=await intelligenceEvidence(intelligenceRequest,op,config,fixture.fetcher);assert.equal(fixture.calls.length,before);assert.equal(again.find(check=>check.id==='token_security')?.data?.fetchedAt,facts.find(check=>check.id==='token_security')?.data?.fetchedAt);assert.equal(again.find(check=>check.id==='token_security')?.data?.cacheHit,true);
 const unsupported=externalFixture({unsupported:true}),local={...intelligenceRequest,origin:'http://127.0.0.1:5173'};
 const missing=await intelligenceEvidence(local,op,config,unsupported.fetcher);assert.deepEqual(unsupported.calls.map(url=>new URL(url).pathname),['/api/v1/supported_chains']);assert.equal(missing.find(check=>check.id==='token_security')?.status,'unknown');assert.equal(missing.find(check=>check.id==='token_security')?.data?.chainId,31337);assert.equal(new Set(missing.map(check=>check.id)).size,missing.length);assert.equal(new Set(facts.map(check=>check.id)).size,facts.length);assert.ok(missing.some(check=>check.id==='address_intelligence_limit'));
});

test('external per-request timeouts retain explicit unknown results within the collection budget',async()=>{
 const fixture=externalFixture({delayMs:INTELLIGENCE_LIMITS.requestMs+100}),op=decodeRequest(intelligenceRequest),started=Date.now();const facts=await intelligenceEvidence(intelligenceRequest,op,config,fixture.fetcher);
 assert.ok(Date.now()-started<INTELLIGENCE_LIMITS.totalMs+1000);assert.equal(facts.find(check=>check.id==='token_security')?.status,'unknown');assert.equal(facts.find(check=>check.id==='website_reputation')?.status,'unknown');assert.ok(facts.some(check=>check.id==='intelligence_scope'));
});
