import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData} from 'viem';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {probeNetwork} from '../src/server/networks.js';
import {evidenceQuality} from '../src/security/quality.js';
import {evidence} from '../src/security/evidence.js';
import {assess} from '../src/security/rules.js';
import {decodeRequest} from '../src/security/decode.js';
import {extendedAbi} from '../src/security/operations.js';
import {SecurityReportView} from '../web/src/SecurityReportView.js';
import {operationLines} from '../src/security/display.js';
const account='0x1111111111111111111111111111111111111111',bridge='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333',hash='0x'+'ab'.repeat(32),zero='0x'+'0'.repeat(40);
test('RPC capability probes are fixed read-only observations with independent failures and bounded responses',async()=>{
 const calls:any[]=[];
 const fake:typeof fetch=async(url,init)=>{assert.equal(String(url),'https://server-rpc.invalid');const r=JSON.parse(String(init?.body));calls.push(r);const result=r.method==='eth_chainId'?'0x1':r.method==='eth_getBlockByNumber'?{number:'0x100',hash,timestamp:'0x1234'}:r.method==='eth_call'?'0x':r.method==='debug_traceCall'?{type:'CALL',to:zero,output:'0x'}:undefined;return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,...(result===undefined?{error:{code:-32601,message:'unsupported'}}:{result})}));};
 const snapshot=await probeNetwork('https://server-rpc.invalid',1,undefined,fake);assert.deepEqual(snapshot.capabilities&&[snapshot.capabilities.pinnedCall,snapshot.capabilities.historicalState,snapshot.capabilities.callTrace,snapshot.capabilities.historicalBlock],['observed','unavailable','observed','128']);
 const trace=calls.find(r=>r.method==='debug_traceCall');assert.deepEqual(trace.params,[{from:zero,to:zero,data:'0x',gas:'0x5208',value:'0x0'},'0x100',{tracer:'callTracer',timeout:'1s',reexec:0}]);assert.ok(calls.every(r=>!/^eth_send|^anvil_|^evm_/.test(r.method)));
 await assert.rejects(()=>probeNetwork('https://server-rpc.invalid',1,undefined,async()=>new Response('x'.repeat(350001))),/Response too large/);
});
test('retired bridge route metadata cannot authenticate another chain snapshot',()=>{
 const report=assess({kind:'transaction',chainId:1,transaction:{from:account,to:bridge,data:'0x'}},[]);report.operation={category:'bridge',label:'Fixture',decoded:true,fields:{},targets:[]};
 const source={chainId:1,blockNumber:'10',blockHash:hash,blockTimestampSeconds:String(Math.floor(Date.now()/1000))},destination={...source,chainId:10,blockNumber:'20'};
 const check=evidence('bridge_destination_bridge','pass','Fixture','Fixture','rpc',destination);
 report.checks=[check];assert.deepEqual(evidenceQuality(report).blockFreshness?.unverifiedChainCheckIds,[check.id]);
 report.checks.push(evidence('bridge_route','pass','Fixture','Fixture','registry',{adapter:'op-standard-bridge-v1',sourceChainId:1,destinationChainId:10,sourceBridge:bridge,destinationBridge:other,sourceSnapshot:source,destinationSnapshot:destination}));assert.deepEqual(evidenceQuality(report).blockFreshness?.unverifiedChainCheckIds,[check.id]);
 check.data={...destination,blockHash:'0x'+'cd'.repeat(32)};assert.deepEqual(evidenceQuality(report).blockFreshness?.unverifiedChainCheckIds,[check.id]);check.data=destination;check.id='arbitrary_counterpart';assert.deepEqual(evidenceQuality(report).blockFreshness?.unverifiedChainCheckIds,[check.id]);
 check.id='bridge_destination_bridge';report.checks[1].source='request';assert.deepEqual(evidenceQuality(report).blockFreshness?.unverifiedChainCheckIds,[check.id]);
});
test('Aave withdrawal and embedded-Permit variants retain exact roles without passing signature material into decoded fields',()=>{
 const bytes='0x'+'12'.repeat(32);
 const cases=[['withdraw',[other,100n,bridge],account,bridge],['supplyWithPermit',[other,100n,bridge,0,2000000000n,27,bytes,bytes],bridge,undefined],['repayWithPermit',[other,100n,2n,bridge,2000000000n,27,bytes,bytes],bridge,undefined],['repayWithATokens',[other,100n,2n],account,undefined]] as const;
 for(const [method,args,owner,receiver] of cases){const data=encodeFunctionData({abi:extendedAbi,functionName:method,args:args as any});const op=decodeRequest({kind:'transaction',chainId:31337,transaction:{from:account,to:bridge,data}});assert.equal(op.category,'lending');assert.equal(op.fields.onBehalfOf,owner);assert.equal(op.fields.receiver,receiver);assert.equal(op.fields.asset,other);assert.equal(op.fields.amount,'100');assert.ok(!JSON.stringify(op).includes(bytes));if(method.endsWith('WithPermit'))assert.equal(op.fields.embeddedPermitAcceptanceVerified,false);}
});
test('report UI renders source-bound structured facts with escaped subjects and retains unknown scores',()=>{
 const report=assess({kind:'transaction',chainId:1,transaction:{from:account,to:bridge,data:'0x'}},[]);report.ai={status:'completed',message:'Fixture',result:{score:null,assessment:'unknown',summary:'Partial',reasons:[],missing_data:['Unverified'],suggested_action:'Review',honeypot:'unknown',model:'fixture',generatedAt:new Date().toISOString(),fact_schema_version:'walletshield-facts-v1',facts:[{id:'fact_'+'a'.repeat(24),evidence_id:'operation',subject:{role:'target',value:'<script>unsafe</script>'},field:'data.amount',value:'100',scope:'decoded-request',provenance:{source:'request',chain_id:1,block_number:null,block_hash:null,observed_at:new Date().toISOString()}}]}};
 const html=renderToStaticMarkup(React.createElement(SecurityReportView,{report}));assert.ok(html.includes('Model facts checked against collected evidence'));assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.ok(!html.includes('<script>unsafe'));assert.ok(html.includes('No AI score'));
});
test('authorization-list requests retain delegate scope in operation display and authority routing without raw signatures',()=>{
 const r='0x'+'34'.repeat(32),s='0x'+'56'.repeat(32);const op=decodeRequest({kind:'transaction',chainId:1,transaction:{from:account,to:bridge,data:'0x',type:'0x4',authorizationList:[{chainId:'0x0',address:other,nonce:'0x7',yParity:'0x0',r,s}]}});
 assert.equal(op.category,'native_transfer');assert.equal(op.addsPermission,true);assert.equal(op.fields.authorizationCount,'1');assert.deepEqual(op.fields.delegationTargets,[other]);assert.ok(op.targets.includes(other));assert.match(String(op.fields.authorizationScopes),/chain=0, nonce=7/);assert.equal(op.fields.delegationEligibilityVerified,false);assert.ok(!JSON.stringify(op).includes(r));assert.ok(!JSON.stringify(op).includes(s));
 const lines=operationLines(op);assert.match(lines[0],/Authorization tuple count: 1/);assert.ok(lines[1].includes(other));assert.match(lines[2],/chain=0, nonce=7/);assert.ok(lines.length<=6);
});
