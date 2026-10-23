import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile} from 'node:fs/promises';
import solc from 'solc';
import {decodeFunctionResult,encodeDeployData,encodeFunctionData,erc20Abi,parseAbi,type Abi,type Address,type Hex} from 'viem';
import {simulateRequest} from '../src/security/simulation.js';
import {decodeRequest} from '../src/security/decode.js';
import type {SecurityRequest} from '../src/security/types.js';

test('real isolated forks execute both canonical V3 variants and expose blocked reverse sales without changing the disposable source', {timeout:60000},async()=>{
 const files=['SimulationFixtures.sol','V3SimulationFixtures.sol'];
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
  const input=await deploy('SimulationFixtures.sol','FixtureToken',[owner]),output=await deploy('SimulationFixtures.sol','FixtureToken',[owner]),router=await deploy('V3SimulationFixtures.sol','FixtureV3Router');
  const tokenAbi=parseAbi(['function approve(address,uint256)','function setRouter(address,bool)']);
  const write=async(to:Address,functionName:string,args:unknown[])=>{const hash=await rpc('eth_sendTransaction',[{from:owner,to,data:encodeFunctionData({abi:tokenAbi as Abi,functionName,args}),gas:'0x989680'}]);assert.equal((await rpc('eth_getTransactionReceipt',[hash])).status,'0x1');};
  const balance=async(token:Address)=>decodeFunctionResult({abi:erc20Abi,functionName:'balanceOf',data:await rpc('eth_call',[{to:token,data:encodeFunctionData({abi:erc20Abi,functionName:'balanceOf',args:[owner]})},'latest']) as Hex});
  await write(input,'approve',[router,1000000n]);await write(output,'setRouter',[router,false]);
  const config={apiKey:'',model:'never-called',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:true,rpc:{31337:endpoint}};
  for(const blocked of [false,true]){
   if(blocked)await write(output,'setRouter',[router,true]);
   for(const deadline of [true,false]){
    const abi=parseAbi([`function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,${deadline?'uint256 deadline,':''}uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params)`]);
    const before=await rpc('eth_getBlockByNumber',['latest',false]),nonce=await rpc('eth_getTransactionCount',[owner,'pending']),balances=await Promise.all([balance(input),balance(output)]);
    const request:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:owner,to:router,value:'0x0',nonce,gas:'0xf4240',maxFeePerGas:'0x174876e800',maxPriorityFeePerGas:'0x3b9aca00',data:encodeFunctionData({abi,functionName:'exactInputSingle',args:[{tokenIn:input,tokenOut:output,fee:3000,recipient:owner,...(deadline?{deadline:2000000000n}:{}),amountIn:100n,amountOutMinimum:1n,sqrtPriceLimitX96:0n}]})}};
    const checks=await simulateRequest(request,decodeRequest(request),config),execution=checks.find(check=>check.id==='simulation_execution'),roundTrip=checks.find(check=>check.id==='round_trip');
    assert.equal(execution?.status,'pass',JSON.stringify(checks));assert.equal(execution.data?.blockTimestampSeconds,String(BigInt(before.timestamp)));assert.equal(roundTrip?.data?.variant,'v3_single');
    if(blocked){assert.equal(roundTrip?.status,'warning');assert.equal(roundTrip?.title,'Sell after buy failed');assert.match(roundTrip.detail,/does not prove a honeypot/);}
    else{assert.equal(roundTrip?.data?.roundTripReturnPercent,100);assert.equal(roundTrip?.data?.observedInputDebitRaw,'100');assert.equal(roundTrip?.data?.returned,'100');}
    const after=await rpc('eth_getBlockByNumber',['latest',false]);assert.equal(after.number,before.number);assert.equal(after.hash,before.hash);assert.equal(await rpc('eth_getTransactionCount',[owner,'pending']),nonce);assert.deepEqual(await Promise.all([balance(input),balance(output)]),balances);
   }
  }
 }finally{
  await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null){resolve();return;}const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
 }
});
