import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,parseAbi,parseAbiParameters} from 'viem';
import {decodeProtocolOperation,protocolOperationAbi} from '../src/security/protocol-operations.js';
import {positionEvidence} from '../src/security/position-evidence.js';
import {decodeRequest} from '../src/security/decode.js';
import {assess} from '../src/security/rules.js';
import {evidencePacket} from '../src/security/ai.js';
import type {SecurityRequest,Operation} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';

const caller='0x1111111111111111111111111111111111111111',manager='0x2222222222222222222222222222222222222222',token0='0x3333333333333333333333333333333333333333',token1='0x4444444444444444444444444444444444444444',recipient='0x5555555555555555555555555555555555555555',positionOwner='0x6666666666666666666666666666666666666666';
const url='https://rpc.fixture.invalid',hash=`0x${'cd'.repeat(32)}`,opaque=`0x${'a1b2c3d4'.repeat(16)}`;
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:url}};
type Transaction=Extract<SecurityRequest,{kind:'transaction'}>;
function request(method:string,args:unknown[],value='0x0'):Transaction{return {kind:'transaction',chainId:31337,origin:'https://untrusted.fixture.invalid/path?private=omitted',transaction:{from:caller,to:manager,value,data:encodeFunctionData({abi:protocolOperationAbi,functionName:method as never,args:args as never})}};}
function operation(req:SecurityRequest){const op=decodeProtocolOperation(req);assert.ok(op);return op;}
const decrease=()=>request('decreaseLiquidity',[{tokenId:987654321n,liquidity:11n,amount0Min:2n,amount1Min:3n,deadline:2000n}]);
test('V3 mint retains signed ticks and all desired/minimum quantities while identifying candidate-only semantics',()=>{
 const req=request('mint',[{token0,token1,fee:3000,tickLower:-120,tickUpper:180,amount0Desired:100n,amount1Desired:200n,amount0Min:90n,amount1Min:180n,recipient,deadline:2000n}]),op=operation(req);
 assert.equal(op.category,'liquidity_v3');assert.equal(op.fields.action,'mint');assert.equal(op.fields.tickLower,'-120');assert.equal(op.fields.tickUpper,'180');assert.equal(op.fields.fee,'3000');assert.equal(op.fields.amount0Desired,'100');assert.equal(op.fields.amount1Desired,'200');assert.equal(op.fields.amount0Min,'90');assert.equal(op.fields.amount1Min,'180');assert.equal(op.fields.deadline,'2000');assert.equal(op.fields.recipient,recipient);assert.deepEqual(op.fields.tokens,[token0,token1]);assert.equal(op.fields.tokenId,undefined);assert.equal(op.fields.manager,manager);assert.match(String(op.fields.protocolIdentity),/unverified/);assert.equal(decodeRequest(req).category,'liquidity_v3');
});
test('V3 increase/decrease/collect keep position ID, liquidity and collection caps as distinct quantities',()=>{
 const increase=operation(request('increaseLiquidity',[{tokenId:987654321n,amount0Desired:100n,amount1Desired:200n,amount0Min:90n,amount1Min:180n,deadline:2000n}]));assert.equal(increase.fields.tokenId,'987654321');assert.equal(increase.fields.amount0Desired,'100');assert.equal(increase.fields.amount1Min,'180');assert.equal(increase.fields.deadline,'2000');assert.equal(increase.fields.amount,undefined);
 const removal=operation(decrease());assert.equal(removal.fields.tokenId,'987654321');assert.equal(removal.fields.liquidity,'11');assert.equal(removal.fields.amount0Min,'2');assert.equal(removal.fields.amount1Min,'3');assert.equal(removal.fields.amount,undefined);assert.match(String(removal.fields.quantityMeaning),/not a token amount/);
 const collect=operation(request('collect',[{tokenId:0n,recipient,amount0Max:2n**128n-1n,amount1Max:123n}]));assert.equal(collect.fields.tokenId,'0');assert.equal(collect.fields.recipient,recipient);assert.equal(collect.fields.amount0Max,String(2n**128n-1n));assert.equal(collect.fields.amount1Max,'123');assert.equal(collect.fields.amount,undefined);assert.match(String(collect.fields.quantityMeaning),/caps, not promised proceeds/);assert.deepEqual(collect.targets,[recipient]);
});
test('bridge withdrawal/initiation/finalization shapes preserve their own stage and fields without destination or byte-payload claims',()=>{
 const cases:[Transaction,string,Record<string,string>][]=[
  [request('withdraw',[token0,10n,200000,opaque]),'withdrawal_request',{localToken:token0,amount:'10',recipient:caller,minGasLimit:'200000'}],
  [request('withdrawTo',[token0,recipient,11n,200001,opaque]),'withdrawal_request',{localToken:token0,amount:'11',recipient,minGasLimit:'200001'}],
  [request('bridgeETH',[200002,opaque],'0x64'),'bridge_request',{valueWei:'100',recipient:caller,minGasLimit:'200002'}],
  [request('bridgeERC20',[token0,token1,12n,200003,opaque]),'bridge_request',{localToken:token0,remoteToken:token1,amount:'12',recipient:caller,minGasLimit:'200003'}],
  [request('finalizeBridgeETH',[positionOwner,recipient,13n,opaque]),'finalization_request',{messageSender:positionOwner,recipient,amount:'13',assetUnits:'claimed_native_raw'}],
  [request('finalizeBridgeERC20',[token0,token1,positionOwner,recipient,14n,opaque]),'finalization_request',{localToken:token0,remoteToken:token1,messageSender:positionOwner,recipient,amount:'14'}]
 ];
 for(const [req,stage,fields]of cases){const op=operation(req);assert.equal(op.category,'bridge');assert.equal(op.fields.stage,stage);assert.equal(op.fields.destinationVerified,false);assert.equal(op.fields.extraDataBytes,'64');for(const[key,value]of Object.entries(fields))assert.equal(op.fields[key],value,key);assert.equal(op.fields.extraData,undefined);assert.equal(JSON.stringify(op).includes(opaque),false);assert.equal(decodeRequest(req).category,'bridge');assert.equal(JSON.stringify(evidencePacket(assess(req,[]))).includes(opaque),false);}
});
test('ambiguous withdraw(uint256) is a withdrawal candidate instead of a staking assertion; malformed input stays undecoded',()=>{
 const req=request('withdraw',[123n]),op=operation(req);assert.equal(op.category,'withdrawal');assert.equal(op.fields.amount,'123');assert.equal(op.fields.amountKind,'unverified_protocol_units');assert.equal(op.fields.redeemabilityVerified,false);assert.equal(decodeRequest(req).category,'withdrawal');assert.notEqual(decodeRequest(req).category,'staking');
 for(const variant of [{...req,transaction:{...req.transaction,data:req.transaction.data+'00'}},{...req,transaction:{...req.transaction,data:'0xdeadbeef'}},{...req,transaction:{...req.transaction,to:null}}])assert.equal(decodeProtocolOperation(variant),null);
 assert.equal(decodeProtocolOperation({kind:'signature',chainId:0,signature:{from:caller,method:'personal_sign',data:'not a transaction'}}),null);
});

const stateAbi=parseAbi(['function positions(uint256) view returns(uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)','function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)']);
type Call={method:string;params:any[];name?:string;args?:readonly unknown[]};
type Options={wrongChain?:boolean;headerFailure?:boolean;wrongHeader?:boolean;positionsFailure?:boolean;ownerFailure?:boolean;approvalFailure?:boolean;operatorFailure?:boolean;codeFailure?:boolean;token0DecimalsFailure?:boolean;token1BalanceFailure?:boolean};
function fixture(options:Options={}){
 const calls:Call[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  assert.equal(new URL(String(input)).href,new URL(url).href,'Only the server-configured fixture endpoint may be queried');assert.equal(init?.redirect,'error');const rpc=JSON.parse(String(init?.body)),call:Call={method:rpc.method,params:rpc.params};calls.push(call);let result:unknown;
  try{
   if(rpc.method==='eth_chainId')result=options.wrongChain?'0x1':'0x7a69';else if(rpc.method==='eth_blockNumber')result='0x2a';
   else if(rpc.method==='eth_getBlockByNumber'){if(options.headerFailure)throw Error('No header');result={number:options.wrongHeader?'0x2b':'0x2a',timestamp:'0x3e8',hash,transactions:[]};}
   else if(rpc.method==='eth_getCode'){if(options.codeFailure)throw Error('No code');result='0x6000';}
   else if(rpc.method==='eth_call'){
    const decoded=decodeFunctionData({abi:stateAbi,data:rpc.params[0].data});call.name=decoded.functionName;call.args=decoded.args;
    if(decoded.functionName==='positions'){if(options.positionsFailure)throw Error('No position');result=encodeAbiParameters(parseAbiParameters('uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128'),[5n,recipient,token0,token1,3000,-120,180,10n,20n,30n,4n,5n]);}
    else if(decoded.functionName==='ownerOf'){if(options.ownerFailure)throw Error('No owner');result=encodeAbiParameters(parseAbiParameters('address'),[positionOwner]);}
    else if(decoded.functionName==='getApproved'){if(options.approvalFailure)throw Error('No approval');result=encodeAbiParameters(parseAbiParameters('address'),[recipient]);}
    else if(decoded.functionName==='isApprovedForAll'){if(options.operatorFailure)throw Error('No operator');result=encodeAbiParameters(parseAbiParameters('bool'),[true]);}
    else if(decoded.functionName==='decimals'){if(options.token0DecimalsFailure&&rpc.params[0].to===token0)throw Error('No units');result=encodeAbiParameters(parseAbiParameters('uint8'),[rpc.params[0].to===token0?6:18]);}
    else if(decoded.functionName==='balanceOf'){if(options.token1BalanceFailure&&rpc.params[0].to===token1)throw Error('No balance');result=encodeAbiParameters(parseAbiParameters('uint256'),[rpc.params[0].to===token0?100n:200n]);}
    else throw Error('Unexpected view');
   }else throw Error('Unexpected RPC');
   return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
  }catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'Fixture view unavailable'}}));}
 };
 return {calls,fetcher};
}
async function observe(options:Options={}){const req=decrease(),rpc=fixture(options);return {checks:await positionEvidence(req,operation(req),config,rpc.fetcher),calls:rpc.calls};}
test('position state pins exact manager/token reads and separates position owner/operator from caller balances and token quantities',async()=>{
 const {checks,calls}=await observe(),position=checks.find(e=>e.id==='position_context')!;assert.equal(position.status,'pass');assert.equal(position.data?.tokenId,'987654321');assert.equal(position.data?.permitNonce,'5');assert.equal(position.data?.owner,positionOwner);assert.equal(position.data?.approved,recipient);assert.equal(position.data?.callerOperatorApproved,true);assert.equal(position.data?.liquidity,'10');assert.equal(position.data?.tokensOwed0,'4');assert.equal(position.data?.tokensOwed1,'5');assert.equal(position.data?.tickLower,'-120');assert.equal(position.data?.tickUpper,'180');assert.equal(position.data?.identityVerified,false);assert.ok(position.data?.managerCodeHash);
 const warning=checks.find(e=>e.id==='position_liquidity_limit')!;assert.equal(warning.status,'warning');assert.equal(warning.data?.requested,'11');assert.equal(warning.data?.observed,'10');
 const a=checks.find(e=>e.id==='position_asset_0')!,b=checks.find(e=>e.id==='position_asset_1')!;assert.equal(a.status,'pass');assert.equal(a.data?.token,token0);assert.equal(a.data?.decimals,'6');assert.equal(a.data?.balanceRaw,'100');assert.equal(b.data?.token,token1);assert.equal(b.data?.decimals,'18');assert.equal(b.data?.balanceRaw,'200');assert.equal(a.data?.account,caller);
 for(const check of checks.filter(e=>e.source==='rpc')){assert.equal(check.data?.chainId,31337);assert.equal(check.data?.blockNumber,'42');assert.equal(check.data?.blockHash,hash);}
 assert.ok(calls.filter(c=>c.method==='eth_call'||c.method==='eth_getCode').every(c=>c.params.at(-1)==='0x2a'));assert.ok(calls.filter(c=>['positions','ownerOf','getApproved'].includes(c.name??'')).every(c=>c.params[0].to===manager&&c.args?.[0]===987654321n));assert.ok(calls.some(c=>c.name==='isApprovedForAll'&&c.args?.[0]===positionOwner&&c.args?.[1]===caller));assert.ok(calls.filter(c=>c.name==='balanceOf').every(c=>c.args?.[0]===caller));
});
test('partial position and asset-interface failures retain independently observed facts without fabricated zeros or units',async()=>{
 const a=await observe({approvalFailure:true,codeFailure:true,token0DecimalsFailure:true,token1BalanceFailure:true}),position=a.checks.find(e=>e.id==='position_context')!;
 assert.equal(position.status,'unknown');assert.equal(position.data?.owner,positionOwner);assert.equal(position.data?.liquidity,'10');assert.equal(position.data?.approved,undefined);assert.ok((position.data?.missing as string[]).includes('approved'));assert.ok((position.data?.missing as string[]).includes('managerCode'));assert.ok(a.checks.some(e=>e.id==='position_liquidity_limit'));
 const tokenA=a.checks.find(e=>e.id==='position_asset_0')!,tokenB=a.checks.find(e=>e.id==='position_asset_1')!;assert.equal(tokenA.status,'unknown');assert.equal(tokenA.data?.decimals,undefined);assert.equal(tokenA.data?.balanceRaw,'100');assert.equal(tokenB.status,'unknown');assert.equal(tokenB.data?.decimals,'18');assert.equal(tokenB.data?.balanceRaw,undefined);
 const b=await observe({positionsFailure:true}),partial=b.checks.find(e=>e.id==='position_context')!;assert.equal(partial.status,'unknown');assert.equal(partial.data?.owner,positionOwner);assert.equal(partial.data?.approved,recipient);assert.equal(partial.data?.liquidity,undefined);assert.ok(!b.checks.some(e=>e.id==='position_liquidity_limit'||e.id.startsWith('position_asset_')));
 const c=await observe({ownerFailure:true});assert.equal(c.checks.find(e=>e.id==='position_context')?.data?.liquidity,'10');assert.ok(!c.calls.some(call=>call.name==='isApprovedForAll'));
});
test('missing or mismatched headers omit hash/time without discarding pinned position observations; wrong chains stop before contract reads',async()=>{
 for(const options of [{headerFailure:true},{wrongHeader:true}]){const {checks}=await observe(options),position=checks.find(e=>e.id==='position_context')!;assert.equal(position.status,'pass');assert.equal(position.data?.liquidity,'10');assert.equal(position.data?.blockNumber,'42');assert.ok(checks.every(e=>e.data?.blockHash===undefined&&e.data?.blockTimestampSeconds===undefined));}
 const wrong=await observe({wrongChain:true});assert.equal(wrong.checks.find(e=>e.id==='position_context')?.status,'unknown');assert.deepEqual(wrong.calls.map(c=>c.method),['eth_chainId']);
 const req=decrease();let fetched=false;const absent=await positionEvidence(req,operation(req),{...config,rpc:{}},async()=>{fetched=true;throw Error('No network allowed');});assert.equal(absent[0].source,'configuration');assert.equal(fetched,false);
});
test('mint economics and unrelated operations remain explicit instead of using a fabricated position ID',async()=>{
 const req=request('mint',[{token0,token1,fee:3000,tickLower:-120,tickUpper:180,amount0Desired:100n,amount1Desired:200n,amount0Min:90n,amount1Min:180n,recipient,deadline:2000n}]),rpc=fixture(),checks=await positionEvidence(req,operation(req),config,rpc.fetcher);
 assert.equal(checks[0].status,'unknown');assert.equal(checks[0].source,'coverage');assert.equal(checks[0].data?.tokenId,undefined);assert.match(checks[0].detail,/no existing position ID/);assert.ok(!rpc.calls.some(c=>['positions','ownerOf','getApproved'].includes(c.name??'')),'Mint pool lookup must not invent an existing position ID.');assert.ok(checks.some(check=>check.id==='position_pool'&&check.status==='unknown'));
 const unrelated={...operation(req),category:'native_transfer'} as Operation;assert.deepEqual(await positionEvidence(req,unrelated,config,async()=>{throw Error('Must not query');}),[]);
});
