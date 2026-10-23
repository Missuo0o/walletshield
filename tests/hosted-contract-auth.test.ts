import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Fastify from 'fastify';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData,hashMessage,parseAbi,type Hex} from 'viem';
import {createStore} from '../src/server/store.js';
import {registerWalletAuth} from '../src/server/wallet-auth.js';
import {contractSignatureStaticCall,CONTRACT_AUTH_LIMITS} from '../src/server/contract-auth.js';
const origin='https://walletshield.example',address='0x00000000000000000000000000000000000a11ce',base=Date.parse('2030-01-01T12:00:00.000Z'),blockHash='0x'+'a'.repeat(64),magic='0x1626ba7e'+'0'.repeat(56);
type RpcCall={method:string;params:any[]};
async function fixture(respond?:(call:RpcCall,result:any,time:{value:number})=>any){
 const store=createStore(':memory:'),app=Fastify(),time={value:base},calls:RpcCall[]=[];
 const fetcher:typeof fetch=async(endpoint,init)=>{
  assert.equal(String(endpoint),'https://trusted-rpc.example/v3/server-only');const body=JSON.parse(String(init?.body));calls.push(body);
  let result:any=body.method==='eth_chainId'?'0x1':body.method==='eth_getBlockByNumber'?{number:'0x12',hash:blockHash,timestamp:'0x'+Math.floor(base/1000).toString(16)}:body.method==='eth_getCode'?'0x60006000':body.method==='eth_call'?magic:undefined;
  if(respond)result=await respond(body,result,time);assert.notEqual(result,undefined,body.method);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200});
 };
 registerWalletAuth(app,store,{origin,enabled:true,now:()=>time.value,rpc:async()=>({1:'https://trusted-rpc.example/v3/server-only'}),contractFetch:fetcher});
 const challenge=async(account=address)=>{const response=await app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:{origin},payload:{address:account,chainId:1}});assert.equal(response.statusCode,200);return response.json() as {id:string;message:string};};
 const verify=(id:string,signature='0x1234',requestOrigin=origin,extra={})=>app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin:requestOrigin},payload:{id,signature,...extra}});
 return {app,store,time,calls,challenge,verify,close:async()=>{await app.close();store.close();}};
}
test('server-generated verifier performs exactly one STATICCALL with a bounded ABI-word result and no write/call/delegatecall opcode',()=>{
 const calldata=encodeFunctionData({abi:parseAbi(['function isValidSignature(bytes32,bytes) view returns(bytes4)']),functionName:'isValidSignature',args:['0x'+'0'.repeat(64) as Hex,'0x1234']});
 const code=contractSignatureStaticCall(address,calldata),bytes=Buffer.from(code.slice(2),'hex');const size=bytes.readUInt16BE(1),source=bytes.readUInt16BE(4);assert.equal(size,(calldata.length-2)/2);assert.equal('0x'+bytes.subarray(source).toString('hex'),calldata);
 const opcodes:number[]=[];for(let at=0;at<source;at++){const opcode=bytes[at];opcodes.push(opcode);if(opcode>=0x60&&opcode<=0x7f)at+=opcode-0x5f;}
 assert.equal(opcodes.filter(opcode=>opcode===0xfa).length,1);assert.ok(!opcodes.some(opcode=>[0x55,0xf0,0xf1,0xf2,0xf4,0xf5,0xff].includes(opcode)));
 assert.ok(code.endsWith(calldata.slice(2)));assert.throws(()=>contractSignatureStaticCall('0x1234',calldata));
});
test('ERC1271 login verifies only the exact issued message at the challenge chain and matching pinned block',async()=>{
 const f=await fixture();try{
  const challenge=await f.challenge(),response=await f.verify(challenge.id);assert.equal(response.statusCode,200,response.body);const result=response.json();assert.equal(result.authentication,'erc1271');assert.equal(result.address,address);assert.equal(result.verification.staticCall,true);assert.equal(result.verification.verificationScope,'exact-login-message-only');assert.equal(result.verification.chainId,1);assert.equal(result.verification.blockHash,blockHash);
  assert.deepEqual(f.calls.map(call=>call.method),['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBlockByNumber']);
  const execution=f.calls[3];assert.equal(execution.params[1],'0x12');assert.equal(execution.params[0].to,undefined);assert.equal(execution.params[0].gas,'0x'+CONTRACT_AUTH_LIMITS.outerGas.toString(16));
  const expected=encodeFunctionData({abi:parseAbi(['function isValidSignature(bytes32,bytes) view returns(bytes4)']),functionName:'isValidSignature',args:[hashMessage(challenge.message),'0x1234']});assert.ok(execution.params[0].data.endsWith(expected.slice(2)));
  assert.equal((await f.verify(challenge.id)).statusCode,401,'the exact challenge remains one-use');assert.ok(!response.body.includes('server-only'));assert.ok(!response.body.includes('0x1234'));
 }finally{await f.close();}
});
test('valid EOA authentication needs no RPC and therefore preserves delegated EOA compatibility',async()=>{
 const f=await fixture(()=>{throw Error('EOA verification must not inspect or misclassify account code');});try{
  const account=privateKeyToAccount(('0x'+'1'.repeat(64)) as Hex),challenge=await f.challenge(account.address);const signature=await account.signMessage({message:challenge.message});const response=await f.verify(challenge.id,signature);assert.equal(response.statusCode,200);assert.equal(response.json().authentication,'eoa');assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('contract login fails closed for wrong chain, missing code, wrong/short magic, stale/future/missing block data and hash changes',async()=>{
 const variants=[
  (c:RpcCall,r:any)=>c.method==='eth_chainId'?'0x2':r,
  (c:RpcCall,r:any)=>c.method==='eth_getCode'?'0x':r,
  (c:RpcCall,r:any)=>c.method==='eth_call'?'0xffffffff'+'0'.repeat(56):r,
  (c:RpcCall,r:any)=>c.method==='eth_call'?'0x1626ba7e':r,
  (c:RpcCall,r:any)=>c.method==='eth_getBlockByNumber'?{...r,timestamp:'0x'+(BigInt(Math.floor(base/1000))-301n).toString(16)}:r,
  (c:RpcCall,r:any)=>c.method==='eth_getBlockByNumber'?{...r,timestamp:'0x'+(BigInt(Math.floor(base/1000))+31n).toString(16)}:r,
  (c:RpcCall,r:any)=>c.method==='eth_getBlockByNumber'?{...r,hash:undefined}:r,
  (c:RpcCall,r:any)=>c.method==='eth_getBlockByNumber'&&c.params[0]==='0x12'?{...r,hash:'0x'+'b'.repeat(64)}:r
 ];
 for(const change of variants){const f=await fixture(change);try{const challenge=await f.challenge();assert.equal((await f.verify(challenge.id)).statusCode,401);}finally{await f.close();}}
});
test('verification rejects expired-after-call state, arbitrary RPC injection and oversized/malformed contract signatures',async()=>{
 const f=await fixture((call,result,time)=>{if(call.method==='eth_call')time.value=base+300000;return result;});try{const challenge=await f.challenge();assert.equal((await f.verify(challenge.id)).statusCode,401);}finally{await f.close();}
 const g=await fixture();try{
  let challenge=await g.challenge();assert.equal((await g.verify(challenge.id,'0x12',origin,{rpc:'https://attacker.example'})).statusCode,400);assert.equal(g.calls.length,0);
  assert.equal((await g.verify(challenge.id,'0x'+'ab'.repeat(8193))).statusCode,400);assert.equal((await g.verify(challenge.id,'0xabc')).statusCode,400);assert.equal((await g.verify(challenge.id,'0x12','https://evil.example')).statusCode,403);assert.equal(g.calls.length,0);
  assert.equal((await g.verify(challenge.id)).statusCode,200);
 }finally{await g.close();}
});
test('wallet-wide revoke and report deletion cancel an already consumed in-flight contract login, while a fresh login remains possible',async()=>{
 for(const action of ['revoke','reports/delete']){
  let release!:()=>void,entered!:()=>void,first=true;const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const f=await fixture(async(call,result)=>{if(call.method==='eth_call'&&first){first=false;entered();await gate;}return result;});
  try{const token='a'.repeat(64),id=createHash('sha256').update(token).digest('hex');f.store.authTokenSave({id,address,kind:'web',createdAt:new Date(base).toISOString(),expiresAt:new Date(base+3600000).toISOString()});
   const challenge=await f.challenge(),pending=Promise.resolve(f.verify(challenge.id));await started;
   const revoked=await f.app.inject({method:'POST',url:'/api/wallet-auth/'+action,headers:{origin,authorization:'Bearer '+token},payload:action==='revoke'?{}:{confirm:true}});assert.equal(revoked.statusCode,200,revoked.body);release();assert.equal((await pending).statusCode,401,'verification begun before revocation must not mint a new credential');assert.equal(f.store.authTokenGet(id,new Date(base).toISOString()),null);
   const fresh=await f.challenge();assert.equal((await f.verify(fresh.id)).statusCode,200,'the fence cancels old tickets without disabling future explicit login');
  }finally{release();await f.close();}
 }
});
test('verification tickets share the pending cap, expire, are owner-bound, one-use, and survive cross-process revocation fences',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'walletshield-auth-ticket-')),file=join(directory,'fixture.sqlite'),a=createStore(file),b=createStore(file),now=new Date(base).toISOString(),later=new Date(base+60000).toISOString(),foreign='0x0000000000000000000000000000000000000002';
 const challenge=(id:string)=>({id,address,chainId:1,origin,message:'exact stored login',createdAt:now,expiresAt:later}),token=(id:string,owner=address)=>({id,address:owner,kind:'web' as const,createdAt:now,expiresAt:later});
 try{assert.equal(a.authChallengeSave(challenge('first'),1),true);assert.ok(a.authChallengeConsume('first',now));assert.equal(a.authChallengeConsume('first',now),null);assert.equal(b.authChallengeSave(challenge('second'),1),false,'moving a challenge into verification does not release the combined bound');assert.equal(b.authIssueWeb(token('foreign',foreign),'first',now),false,'another wallet cannot consume a ticket');assert.equal(a.authIssueWeb(token('web'),'first',now),true);assert.equal(b.authIssueWeb(token('replay'),'first',now),false);assert.equal(a.authChallengeSave(challenge('second'),1),true);assert.ok(a.authChallengeConsume('second',now));assert.notEqual(b.authRevokeAll(address,'web',now),null);assert.equal(a.authIssueWeb(token('resurrection'),'second',now),false,'another SQLite connection can cancel an in-flight consumed challenge');
  assert.equal(a.authChallengeSave(challenge('expired'),1),true);assert.ok(a.authChallengeConsume('expired',now));b.authPrune(later);assert.equal(a.authIssueWeb(token('expired-web'),'expired',later),false);assert.equal(a.authChallengeSave({...challenge('after-expiry'),expiresAt:new Date(base+120000).toISOString()},1),true);
 }finally{a.close();b.close();await rm(directory,{recursive:true,force:true});}
});
