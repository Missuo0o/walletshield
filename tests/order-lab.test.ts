import test from 'node:test';
import assert from 'node:assert/strict';
import {hashTypedData,zeroAddress} from 'viem';
import {buildWalletCase,WALLET_CASES} from '../src/testing/cases.js';
import {compileLabArtifacts,labClient,type LabDeployment} from '../src/testing/contracts.js';
import {decodeRequest} from '../src/security/decode.js';
import {requestSchema} from '../src/security/types.js';

const address=(digit:string)=>('0x'+digit.repeat(40)) as `0x${string}`;
const owner=address('1'),other=address('2');
const deployment=():LabDeployment=>({version:1,chainId:31337,baseToken:address('3'),owner,recipient:other,deployedAt:'2026-10-23T00:00:00.000Z',contracts:Object.fromEntries([['token','4'],['actions','5'],['nft','6'],['orders','7']].map(([key,digit])=>[key,{address:address(digit),codeHash:('0x'+'a'.repeat(64)) as `0x${string}`}]))});
const artifacts=compileLabArtifacts();

test('the wallet NFT order uses current ownership and counter to sign exact canonical components with unique salts',async(t)=>{
 const d=deployment(),a=await artifacts,calls:any[]=[];
 t.mock.method(labClient,'readContract',async(params:any)=>{calls.push(params);if(params.functionName==='testId'){assert.equal(params.address,d.contracts.nft.address);assert.deepEqual(params.args,[owner]);return 9n;}if(params.functionName==='ownerOf'){assert.deepEqual(params.args,[9n]);return owner;}assert.equal(params.functionName,'getCounter');assert.equal(params.address,d.contracts.orders.address);assert.deepEqual(params.args,[owner]);return 4n;});
 const salts=new Set<string>();
 for(let repeat=0;repeat<2;repeat++){
  const request=await buildWalletCase('order',owner,d,a),operation=decodeRequest(request);assert.equal(requestSchema.safeParse(request).success,true);assert.equal(operation.category,'order_signature');assert.equal(operation.decoded,true);assert.equal(operation.fields.orderProtocol,'seaport-candidate');
  if(request.kind!=='signature')throw Error('Expected an actual wallet signature request');
  const typed=request.signature.data as any;assert.equal(typed.primaryType,'OrderComponents');assert.equal(typed.domain.name,'WalletShield Lab Orders');assert.equal(typed.domain.version,'1');assert.equal(typed.domain.verifyingContract,d.contracts.orders.address);assert.equal(typed.message.counter,'4');assert.deepEqual(typed.message.offer,[{itemType:'2',token:d.contracts.nft.address,identifierOrCriteria:'9',startAmount:'1',endAmount:'1'}]);assert.deepEqual(typed.message.consideration,[{itemType:'0',token:zeroAddress,identifierOrCriteria:'0',startAmount:'1000000000000000',endAmount:'1000000000000000',recipient:owner}]);assert.ok(BigInt(typed.message.startTime)<BigInt(Math.floor(Date.now()/1000)));assert.ok(BigInt(typed.message.endTime)>BigInt(Math.floor(Date.now()/1000)));assert.match(hashTypedData(typed),/^0x[\da-f]{64}$/);salts.add(typed.message.salt);
 }
 assert.equal(calls.length,6);assert.equal(salts.size,2);assert.match(WALLET_CASES.find(value=>value.id==='order')!.boundary!,/cannot fulfill, cancel, consume or validate/);
});

test('old lab deployments and transferred NFTs give actionable instructions without fabricating order prerequisites',async(t)=>{
 const d=deployment(),a=await artifacts;delete d.contracts.orders;t.mock.method(labClient,'readContract',async()=>{throw Error('Old lab must be rejected before reading state');});await assert.rejects(buildWalletCase('order',owner,d,a),/Run npm run deploy:lab to add the order verifier fixture/);
 const ready=deployment();t.mock.method(labClient,'readContract',async(params:any)=>params.functionName==='testId'?9n:other);await assert.rejects(buildWalletCase('order',owner,ready,a),/no longer owned by this account/);
 t.mock.method(labClient,'readContract',async()=>0n);await assert.rejects(buildWalletCase('order',owner,ready,a),/Prepare local test assets first/);
});

test('the deliberately custom order remains available as an unresolved protocol test rather than an NFT transfer claim',async(t)=>{
 const d=deployment(),a=await artifacts;t.mock.method(labClient,'readContract',async()=>{throw Error('Custom message has no consuming-contract state adapter');});const request=await buildWalletCase('order-custom',owner,d,a),operation=decodeRequest(request);assert.equal(request.kind,'signature');assert.equal(operation.category,'order_signature');assert.equal(operation.decoded,false);assert.equal(operation.token,undefined);assert.equal(operation.tokenStandard,undefined);assert.match(WALLET_CASES.find(value=>value.id==='order-custom')!.boundary!,/may correctly abstain/);
});
