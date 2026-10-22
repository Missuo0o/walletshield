import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,writeFile} from 'node:fs/promises';
import solc from 'solc';
import {encodeDeployData,encodeFunctionData,type Address} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import {accountOperationAbi} from '../src/security/account-operations.js';
import {protocolOperationAbi} from '../src/security/protocol-operations.js';
import {accountEvidence} from '../src/security/account-evidence.js';
import {positionEvidence} from '../src/security/position-evidence.js';
import {signatureChainEvidence,signatureStructure} from '../src/security/signatures.js';
import type {Evidence,SecurityRequest} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';

const source=await readFile('contracts/ExtendedEvidenceFixtures.sol','utf8');
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'ExtendedEvidenceFixtures.sol':{content:source}},settings:{evmVersion:'cancun',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
const errors=(compiled.errors??[]).filter((e:any)=>e.severity==='error');assert.equal(errors.length,0,errors.map((e:any)=>e.formattedMessage).join('\n'));
const artifacts=compiled.contracts['ExtendedEvidenceFixtures.sol'];
const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));const allocated=listener.address();assert.ok(allocated&&typeof allocated!=='string');const port=allocated.port;assert.notEqual(port,8545);await new Promise<void>(resolve=>listener.close(()=>resolve()));
const endpoint=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['node_modules/@foundry-rs/anvil/bin.mjs','--host','127.0.0.1','--port',String(port),'--chain-id','31337','--silent'],{stdio:'ignore'});
let serial=0;
async function rpc(method:string,params:unknown[]=[]){const id=++serial,response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(2500)});assert.ok(response.ok);const body=await response.json();if(body.error)throw Error(`Isolated fixture RPC failed (${body.error.code})`);assert.equal(body.id,id);return body.result;}
const cases:{name:string;blockBefore:string;blockAfter:string;checks:Omit<Evidence,'observedAt'>[]}[]=[];
async function collect(name:string,run:()=>Promise<Evidence[]>){const before=String(BigInt(await rpc('eth_blockNumber'))),checks=await run(),after=String(BigInt(await rpc('eth_blockNumber')));assert.equal(after,before,`${name}: collectors must not mine/write to the fixture chain`);assert.equal(new Set(checks.map(e=>e.id)).size,checks.length,`${name}: duplicate evidence IDs`);cases.push({name,blockBefore:before,blockAfter:after,checks:checks.map(({observedAt,...check})=>check)});return checks;}
function item(checks:Evidence[],id:string){const result=checks.find(e=>e.id===id);assert.ok(result,`Missing ${id}`);return result;}
try{
 let ready=false;for(let attempt=0;attempt<60;attempt++){try{assert.equal(await rpc('eth_chainId'),'0x7a69');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,80));}}assert.ok(ready,'Temporary Anvil failed to start');assert.match(String(await rpc('web3_clientVersion')),/anvil/i);
 const accounts=await rpc('eth_accounts') as Address[],owner=accounts[0],other=accounts[1],module=accounts[2];assert.ok(owner&&other&&module);
 const deploy=async(name:string,args:unknown[]=[])=>{const a=artifacts[name],data=encodeDeployData({abi:a.abi,bytecode:`0x${a.evm.bytecode.object}`,args});const hash=await rpc('eth_sendTransaction',[{from:owner,data,gas:'0x989680'}]),receipt=await rpc('eth_getTransactionReceipt',[hash]);assert.equal(receipt.status,'0x1');assert.match(receipt.contractAddress,/^0x[\da-f]{40}$/i);return receipt.contractAddress as Address;};
 const write=async(name:string,to:Address,method:string,args:unknown[])=>{const hash=await rpc('eth_sendTransaction',[{from:owner,to,data:encodeFunctionData({abi:artifacts[name].abi,functionName:method,args}),gas:'0x989680'}]);assert.equal((await rpc('eth_getTransactionReceipt',[hash])).status,'0x1');};
 const token0=await deploy('ExtendedEvidenceToken'),token1=await deploy('ExtendedEvidenceToken'),account=await deploy('ExtendedEvidenceAccount',[other]),position=await deploy('ExtendedEvidencePosition',[token0,token1,other,module]);
 await write('ExtendedEvidenceToken',token0,'seed',[owner,1234567n,5n]);await write('ExtendedEvidenceToken',token1,'seed',[owner,9876543n,5n]);
 const config:SecurityConfig={apiKey:'',model:'unused-no-ai',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:false,rpc:{31337:endpoint}};
 const accountRequest:Extract<SecurityRequest,{kind:'transaction'}>={kind:'transaction',chainId:31337,transaction:{from:owner,to:account,data:encodeFunctionData({abi:accountOperationAbi,functionName:'enableModule',args:[module]})}};
 const accountBefore=await collect('account-module-before',()=>accountEvidence(accountRequest,decodeRequest(accountRequest),config));assert.equal(item(accountBefore,'account_module').data?.enabled,false);assert.equal(item(accountBefore,'account_threshold').data?.threshold,'2');assert.deepEqual((item(accountBefore,'account_owners').data?.owners as string[]).map(a=>a.toLowerCase()),[owner,other].map(a=>a.toLowerCase()));
 await write('ExtendedEvidenceAccount',account,'enableModule',[module]);
 const accountAfter=await collect('account-module-after-fixture-admin-write',()=>accountEvidence(accountRequest,decodeRequest(accountRequest),config));assert.equal(item(accountAfter,'account_module').data?.enabled,true);assert.equal(item(accountAfter,'account_code').data?.identityVerified,false);
 await write('ExtendedEvidenceAccount',account,'setUnavailableThreshold',[true]);
 const partialAccount=await collect('account-independent-threshold-failure',()=>accountEvidence(accountRequest,decodeRequest(accountRequest),config));assert.equal(item(partialAccount,'account_threshold').status,'unknown');assert.equal(item(partialAccount,'account_owners').status,'pass');assert.equal(item(partialAccount,'account_module').data?.enabled,true);
 const positionRequest:Extract<SecurityRequest,{kind:'transaction'}>={kind:'transaction',chainId:31337,transaction:{from:owner,to:position,data:encodeFunctionData({abi:protocolOperationAbi,functionName:'decreaseLiquidity',args:[{tokenId:7n,liquidity:11n,amount0Min:2n,amount1Min:3n,deadline:2000000000n}]})}};
 const positionChecks=await collect('position-existing-id-and-distinct-units',()=>positionEvidence(positionRequest,decodeRequest(positionRequest),config));const context=item(positionChecks,'position_context');assert.equal(context.status,'pass');assert.equal(context.data?.tokenId,'7');assert.equal(context.data?.tickLower,'-120');assert.equal(context.data?.liquidity,'10');assert.equal(context.data?.tokensOwed0,'4');assert.equal(context.data?.tokensOwed1,'5');assert.equal(String(context.data?.owner).toLowerCase(),other.toLowerCase());assert.equal(context.data?.callerOperatorApproved,true);assert.equal(item(positionChecks,'position_liquidity_limit').status,'warning');assert.equal(item(positionChecks,'position_asset_0').data?.decimals,'6');assert.equal(item(positionChecks,'position_asset_0').data?.balanceRaw,'1234567');assert.equal(item(positionChecks,'position_asset_1').data?.balanceRaw,'9876543');assert.equal(context.data?.identityVerified,false);
 await write('ExtendedEvidencePosition',position,'setUnavailable',[false,true]);
 const positionPartial=await collect('position-independent-approval-failure',()=>positionEvidence(positionRequest,decodeRequest(positionRequest),config));assert.equal(item(positionPartial,'position_context').status,'unknown');assert.equal(item(positionPartial,'position_context').data?.liquidity,'10');assert.equal(String(item(positionPartial,'position_context').data?.owner).toLowerCase(),other.toLowerCase());assert.ok((item(positionPartial,'position_context').data?.missing as string[]).includes('approved'));
 type Signature=Extract<SecurityRequest,{kind:'signature'}>;
 const domain={name:'Extended Evidence Fixture',version:'1',chainId:31337,verifyingContract:token0};
 const dai:Signature={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain,types:{Permit:[{name:'holder',type:'address'},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'expiry',type:'uint256'},{name:'allowed',type:'bool'}]},primaryType:'Permit',message:{holder:owner,spender:other,nonce:'5',expiry:'0',allowed:true}}}};
 assert.equal(signatureStructure(dai)[0].status,'pass');const daiChecks=await collect('dai-holder-nonce-domain-zero-expiry',()=>signatureChainEvidence(dai,config));assert.equal(item(daiChecks,'signature_nonce').status,'pass');assert.equal(item(daiChecks,'signature_nonce').data?.nonceScope,'holder');assert.equal(item(daiChecks,'signature_domain').status,'pass');assert.equal(item(daiChecks,'signature_deadline').data?.expiryZeroHasNoSubmissionDeadline,true);assert.equal(item(daiChecks,'signature_validation').data?.consumptionExecuted,false);
 const nonce=`0x${'ab'.repeat(32)}` as `0x${string}`,block=await rpc('eth_getBlockByNumber',['latest',false]),now=BigInt(block.timestamp);
 const authorization:Signature={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain,types:{ReceiveWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]},primaryType:'ReceiveWithAuthorization',message:{from:owner,to:other,value:'50',validAfter:'0',validBefore:String(now+3600n),nonce}}}};
 const unused=await collect('erc3009-unused-exact-transfer',()=>signatureChainEvidence(authorization,config));assert.equal(item(unused,'signature_nonce').status,'pass');assert.equal(item(unused,'signature_nonce').data?.authorizationUsedOrCanceled,false);assert.equal(item(unused,'signature_domain').status,'pass');assert.equal(item(unused,'signature_scope').data?.recipientCommitted,true);assert.equal(item(unused,'signature_scope').data?.relayerRestriction,'caller_must_be_recipient');assert.equal(item(unused,'signature_authorization_window').status,'pass');
 await write('ExtendedEvidenceToken',token0,'setAuthorizationUsed',[owner,nonce,true]);
 const used=await collect('erc3009-admin-seeded-used-or-canceled',()=>signatureChainEvidence(authorization,config));assert.equal(item(used,'signature_nonce').status,'risk');assert.equal(item(used,'signature_nonce').data?.authorizationUsedOrCanceled,true);
 const boundary=structuredClone(authorization),current=BigInt((await rpc('eth_getBlockByNumber',['latest',false])).timestamp);(boundary.signature.data as any).message.validAfter=String(current);
 const atAfter=await collect('erc3009-exact-valid-after-boundary',()=>signatureChainEvidence(boundary,config));assert.equal(item(atAfter,'signature_authorization_window').data?.notYetValidAtObservedBlock,true);
 (boundary.signature.data as any).message.validAfter='0';(boundary.signature.data as any).message.validBefore=String(current);
 const atBefore=await collect('erc3009-exact-valid-before-boundary',()=>signatureChainEvidence(boundary,config));assert.equal(item(atBefore,'signature_authorization_window').data?.expiredAtObservedBlock,true);
 await write('ExtendedEvidenceToken',token0,'setUnavailable',[true,false,false]);
 const missingDomain=await collect('signature-independent-domain-failure',()=>signatureChainEvidence(dai,config));assert.equal(item(missingDomain,'signature_domain').status,'unknown');assert.equal(item(missingDomain,'signature_nonce').status,'pass');
 await write('ExtendedEvidenceToken',token0,'setUnavailable',[false,false,true]);
 const missingState=await collect('erc3009-independent-state-failure',()=>signatureChainEvidence(authorization,config));assert.equal(item(missingState,'signature_nonce').status,'unknown');assert.equal(item(missingState,'signature_domain').status,'pass');
 const wrong={...config,rpc:{1:endpoint}},wrongAccount={...accountRequest,chainId:1},wrongPosition={...positionRequest,chainId:1},wrongSignature={...dai,chainId:1};
 assert.equal(item(await collect('account-wrong-chain-rejected',()=>accountEvidence(wrongAccount,decodeRequest(wrongAccount),wrong)),'account_state').status,'unknown');
 assert.equal(item(await collect('position-wrong-chain-rejected',()=>positionEvidence(wrongPosition,decodeRequest(wrongPosition),wrong)),'position_context').status,'unknown');
 assert.equal(item(await collect('signature-wrong-chain-rejected',()=>signatureChainEvidence(wrongSignature,wrong)),'signature_nonce').status,'unknown');
 for(const entry of cases)for(const check of entry.checks)if(check.source==='rpc'&&check.data?.blockNumber!==undefined){assert.equal(check.data.blockNumber,entry.blockBefore);assert.match(String(check.data.blockHash),/^0x[\da-f]{64}$/i);}
 await writeFile('docs/extended-evidence-acceptance.json',JSON.stringify({kind:'isolated-anvil-getter-fixtures',generatedAt:new Date().toISOString(),passed:cases.length,scope:'Actual temporary-node HTTP reads and deliberately seeded fixture writes; not MetaMask/Snap UI acceptance or public protocol authentication',noRealNetwork:true,noModelCalls:true,noWalletSignatures:true,mainLocalChainUntouched:true,collectorsUpstreamUnchanged:true,authorizationStateTransition:'fixture-admin-seeded; no cryptographic authorization consumed',cases},null,2)+'\n');
 console.log(`PASS ${cases.length} isolated Anvil evidence cases: account modules, DAI/authorization state, validity boundaries, V3 position units and independent failures. Collectors did not change fixture blocks; no main local chain, wallet signature or model call used.`);
}finally{
 await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null){resolve();return;}const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
}
