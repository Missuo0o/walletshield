import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile} from 'node:fs/promises';
import solc from 'solc';
import {decodeFunctionResult,encodeDeployData,encodeFunctionData,erc20Abi,keccak256,parseAbi,type Abi,type Address,type Hex} from 'viem';
import {simulateRequest} from '../src/security/simulation.js';
import {decodeRequest} from '../src/security/decode.js';
import {V3_EXPERIMENT_ABI,encodePackedV3Path} from '../src/security/swap-experiments.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest} from '../src/security/types.js';

test('real disposable forks execute eight V3 forms, backed native wrapping, and selected vault/lending state changes without upstream writes', {timeout:90000},async()=>{
 const files=['SimulationFixtures.sol','V3SimulationFixtures.sol','ForkProtocolFixtures.sol'];
 const sources=Object.fromEntries(await Promise.all(files.map(async file=>[file,{content:await readFile(`contracts/${file}`,'utf8')}])));
 const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{evmVersion:'cancun',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 assert.ok(!compiled.errors?.some((error:any)=>error.severity==='error'),JSON.stringify(compiled.errors));
 const server=createServer();await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const selected=server.address();assert.ok(selected&&typeof selected!=='string');const port=selected.port;assert.notEqual(port,8545);await new Promise<void>(resolve=>server.close(()=>resolve()));
 const endpoint=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['node_modules/@foundry-rs/anvil/bin.mjs','--host','127.0.0.1','--port',String(port),'--chain-id','31337','--silent'],{stdio:'ignore'});
 let serial=0;
 const rpc=async(method:string,params:unknown[]=[])=>{const id=++serial,response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(2500)}),body=await response.json();assert.equal(body.id,id);if(body.error)throw Error(`Disposable fixture RPC failed (${body.error.code})`);return body.result;};
 try{
  let ready=false;for(let i=0;i<60;i++){try{assert.equal(await rpc('eth_chainId'),'0x7a69');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,80));}}assert.ok(ready);assert.match(String(await rpc('web3_clientVersion')),/anvil/i);
  const [owner]=await rpc('eth_accounts') as Address[];
  const deploy=async(file:string,name:string,args:unknown[]=[])=>{const artifact=compiled.contracts[file][name],hash=await rpc('eth_sendTransaction',[{from:owner,data:encodeDeployData({abi:artifact.abi,bytecode:`0x${artifact.evm.bytecode.object}`,args}),gas:'0x989680'}]),receipt=await rpc('eth_getTransactionReceipt',[hash]);assert.equal(receipt.status,'0x1');return receipt.contractAddress as Address;};
  const input=await deploy('SimulationFixtures.sol','FixtureToken',[owner]),middle=await deploy('SimulationFixtures.sol','FixtureToken',[owner]),output=await deploy('SimulationFixtures.sol','FixtureToken',[owner]),router=await deploy('V3SimulationFixtures.sol','FixtureV3Router'),wrapper=await deploy('V3SimulationFixtures.sol','FixtureWrappedNative');
  const tokenAbi=parseAbi(['function approve(address,uint256)','function setRouter(address,bool)','function setWrapper(address)','function deposit() payable','function transfer(address,uint256)','function mint(address,uint256)']);
  const write=async(to:Address,functionName:string,args:unknown[],value='0x0')=>{const hash=await rpc('eth_sendTransaction',[{from:owner,to,data:encodeFunctionData({abi:tokenAbi as Abi,functionName,args}),value,gas:'0x989680'}]);assert.equal((await rpc('eth_getTransactionReceipt',[hash])).status,'0x1');};
  const balance=async(token:Address)=>decodeFunctionResult({abi:erc20Abi,functionName:'balanceOf',data:await rpc('eth_call',[{to:token,data:encodeFunctionData({abi:erc20Abi,functionName:'balanceOf',args:[owner]})},'latest']) as Hex});
  await write(input,'approve',[router,1000000n]);await write(output,'setRouter',[router,false]);
  await write(router,'setWrapper',[wrapper]);await write(wrapper,'deposit',[],'0x3f9');await write(wrapper,'transfer',[router,1000n]);
  const config:SecurityConfig={apiKey:'',model:'never-called',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:true,rpc:{31337:endpoint}};
  const boundConfig:SecurityConfig={...config,trustedDeployments:[{chainId:31337,address:router,protocol:'uniswap-v3',version:'swap-router-02',role:'router',codeHash:keccak256(await rpc('eth_getCode',[router,'latest'])),sourceUrl:'https://fixture.example/router'},{chainId:31337,address:wrapper,protocol:'wrapped-native',version:'fixture',role:'wrapped_native',codeHash:keccak256(await rpc('eth_getCode',[wrapper,'latest'])),sourceUrl:'https://fixture.example/wrapper'}]};
  const sourceState=async()=>({header:await rpc('eth_getBlockByNumber',['latest',false]),nonce:await rpc('eth_getTransactionCount',[owner,'pending']),native:await rpc('eth_getBalance',[owner,'latest']),balances:await Promise.all([balance(input),balance(output),balance(wrapper)])});
  const assertUnchanged=async(before:Awaited<ReturnType<typeof sourceState>>)=>{const after=await sourceState();assert.equal(after.header.number,before.header.number);assert.equal(after.header.hash,before.header.hash);assert.equal(after.nonce,before.nonce);assert.equal(after.native,before.native);assert.deepEqual(after.balances,before.balances);};
  const requestFor=async(method:string,deadline:boolean,native=false):Promise<SecurityRequest>=>{
   const single=method.endsWith('Single'),exactOutput=method.startsWith('exactOutput'),tokenIn=native?wrapper:input,tokens=[tokenIn,middle,output],fees=[500,3000];
   const abi=V3_EXPERIMENT_ABI.filter(item=>item.name===method&&item.inputs[0].components.some(field=>field.name==='deadline')===deadline) as Abi;
   const params={...(single?{tokenIn,tokenOut:output,fee:3000,sqrtPriceLimitX96:0n}:{path:encodePackedV3Path(exactOutput?[...tokens].reverse():tokens,exactOutput?[...fees].reverse():fees)}),recipient:owner,...(deadline?{deadline:2000000000n}:{}),...(exactOutput?{amountOut:80n,amountInMaximum:150n}:{amountIn:100n,amountOutMinimum:1n})};
   return {kind:'transaction',chainId:31337,transaction:{from:owner,to:router,value:native?'0x64':'0x0',nonce:await rpc('eth_getTransactionCount',[owner,'pending']),gas:'0xf4240',maxFeePerGas:'0x174876e800',maxPriorityFeePerGas:'0x3b9aca00',data:encodeFunctionData({abi,functionName:method,args:[params]})}};
  };
  for(const blocked of [false,true]){
   if(blocked)await write(output,'setRouter',[router,true]);
   for(const method of ['exactInputSingle','exactOutputSingle','exactInput','exactOutput'])for(const deadline of [true,false]){
    const before=await sourceState(),request=await requestFor(method,deadline);
    const checks=await simulateRequest(request,decodeRequest(request),config),execution=checks.find(check=>check.id==='simulation_execution'),roundTrip=checks.find(check=>check.id==='round_trip');
    assert.equal(execution?.status,'pass',JSON.stringify(checks));assert.equal(execution.data?.blockTimestampSeconds,String(BigInt(before.header.timestamp)));assert.equal(roundTrip?.data?.variant,method.endsWith('Single')?'v3_single':'v3_path');assert.equal(roundTrip.data?.sourceMethod,method);
    if(blocked){assert.equal(roundTrip?.status,'warning');assert.equal(roundTrip?.title,'Sell after buy failed');assert.match(roundTrip.detail,/does not prove a honeypot/);}
    else{const actual=method.startsWith('exactOutput')?'80':'100';assert.equal(roundTrip?.data?.roundTripReturnPercent,100);assert.equal(roundTrip?.data?.observedInputDebitRaw,actual);assert.equal(roundTrip?.data?.returned,actual);if(method.startsWith('exactOutput'))assert.equal(roundTrip?.data?.declaredInputRaw,'150');}
    await assertUnchanged(before);
   }
  }
  await write(output,'setRouter',[router,false]);
  for(const method of ['exactInputSingle','exactOutputSingle','exactInput','exactOutput'])for(const deadline of [true,false]){
   const before=await sourceState(),request=await requestFor(method,deadline,true),checks=await simulateRequest(request,decodeRequest(request),boundConfig),roundTrip=checks.find(check=>check.id==='round_trip');
   assert.equal(checks.find(check=>check.id==='simulation_execution')?.status,'pass',JSON.stringify(checks));assert.equal(roundTrip?.data?.inputUnit,'native_wei',JSON.stringify(checks));const actual=method.startsWith('exactOutput')?'80':'100';assert.equal(roundTrip?.data?.returned,actual,JSON.stringify(checks));assert.equal(roundTrip?.data?.observedInputDebitRaw,actual);assert.equal(roundTrip?.data?.wrappedReceivedRaw,actual);assert.equal(roundTrip?.data?.roundTripReturnPercent,100);assert.equal((roundTrip?.data?.fundingBinding as any)?.officialIdentityEstablished,false);await assertUnchanged(before);
  }
  {const before=await sourceState(),request=await requestFor('exactInputSingle',false,true),checks=await simulateRequest(request,decodeRequest(request),config);assert.equal(checks.find(check=>check.id==='round_trip')?.status,'unknown');assert.equal(checks.find(check=>check.id==='round_trip')?.data?.returned,undefined);await assertUnchanged(before);}
  const vault=await deploy('ForkProtocolFixtures.sol','StateFixtureVault',[input]),lending=await deploy('ForkProtocolFixtures.sol','StateFixtureLending');await write(input,'approve',[vault,1000n]);await write(input,'mint',[lending,1000n]);
  const [recipient]=((await rpc('eth_accounts')) as Address[]).slice(1);
  for(const kind of ['vault','lending'] as const){
   const before=await sourceState(),abi=kind==='vault'?parseAbi(['function deposit(uint256,address)']):parseAbi(['function borrow(address,uint256,uint256,uint16,address)']);
   const request:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:owner,to:kind==='vault'?vault:lending,value:'0x0',nonce:before.nonce,gas:'0xf4240',data:encodeFunctionData({abi:abi as Abi,functionName:kind==='vault'?'deposit':'borrow',args:kind==='vault'?[100n,recipient]:[input,800n,2n,0,owner]})}},operation=decodeRequest(request);assert.equal(operation.category,kind);
   const checks=await simulateRequest(request,operation,config),prior=checks.find(check=>check.id===`fork_${kind}_before`),after=checks.find(check=>check.id===`fork_${kind}_after`),change=checks.find(check=>check.id===`fork_${kind}_change`);assert.equal(checks.find(check=>check.id==='simulation_execution')?.status,'pass',JSON.stringify(checks));assert.equal(prior?.status,'pass',JSON.stringify(checks));assert.equal(after?.status,'pass',JSON.stringify(checks));assert.equal(change?.status,'pass');
   if(kind==='vault'){assert.equal((change?.data?.differences as any)?.callerUnderlyingRaw,'-100');assert.equal((change?.data?.differences as any)?.receiverSharesRaw,'100');assert.equal((after?.data?.values as any)?.ownerSharesRaw,'0');}
   else{assert.equal((change?.data?.differences as any)?.totalDebtBaseRaw,'800');assert.equal((change?.data?.differences as any)?.callerUnderlyingRaw,'800');assert.equal(checks.find(check=>check.id==='fork_lending_health')?.status,'risk');}
   await assertUnchanged(before);
  }
  const account=await deploy('ForkProtocolFixtures.sol','StateFixtureAccount'),nft=await deploy('ForkProtocolFixtures.sol','StateFixtureNFT');
  for(const [target,signature,args,key,value] of [[input,'function approve(address,uint256)',[router,5n],'erc20AllowanceRaw','5'],[nft,'function approve(address,uint256)',[router,0n],'erc721Approved',router],[nft,'function setApprovalForAll(address,bool)',[router,true],'operatorApproved',true],[account,'function enableModule(address)',[router],'moduleEnabled',true]] as const){
   const before=await sourceState(),abi=parseAbi([signature]),method=signature.slice(9,signature.indexOf('(')),request:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:owner,to:target,value:'0x0',nonce:before.nonce,gas:'0xf4240',data:encodeFunctionData({abi:abi as Abi,functionName:method,args})}},checks=await simulateRequest(request,decodeRequest(request),config),after=checks.find(check=>check.id==='fork_authority_after'),change=checks.find(check=>check.id==='fork_authority_change');
   assert.equal(checks.find(check=>check.id==='simulation_execution')?.status,'pass',JSON.stringify(checks));assert.equal(after?.status,'pass',JSON.stringify(checks));assert.equal(String((after?.data?.values as any)?.[key]).toLowerCase(),String(value).toLowerCase());assert.ok((change?.data?.changedFields as string[]).includes(key));assert.equal(change?.data?.sameStore,true);await assertUnchanged(before);
  }
 }finally{
  await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null){resolve();return;}const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
 }
});
