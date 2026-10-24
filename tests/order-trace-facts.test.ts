import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {modelFactCandidates} from '../src/security/model-facts.js';
import {dimensionsForEvidence} from '../src/security/ai-claims.js';
import type {SecurityRequest} from '../src/security/types.js';
const owner='0x1111111111111111111111111111111111111111',target='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333',hash=`0x${'ab'.repeat(32)}`;
const request:SecurityRequest={kind:'transaction',chainId:1,transaction:{from:owner,to:target,data:'0x12345678',value:'0x5'}};
test('isolated original-call trace reaches Muse as execution-only evidence with exact base provenance and native units',()=>{
 const check=evidence('call_trace_fork','pass','Isolated trace','Read-only original call','isolated-fork',{chainId:1,blockNumber:'123',blockHash:hash,blockTimestampSeconds:'1000',traceAvailable:true,traceTruncated:false,completeAssetCoverage:false,calls:[{type:'CALL',from:owner,to:target,value:'0x5',selector:'0x12345678',depth:0,reverted:false}]});
 const report=assess(request,[check]),candidates=modelFactCandidates(report).candidates.filter(item=>item.fact.evidence_id===check.id);
 assert.deepEqual(dimensionsForEvidence(check,report),['execution']);
 const value=candidates.find(item=>item.fact.field==='data.calls[0].valueWei')!;
 assert.equal(value.fact.value,'5');assert.deepEqual(value.fact.subject,{role:'asset',value:'native'});assert.equal(value.fact.scope,'isolated-fork');assert.equal(value.fact.provenance.block_hash,hash);assert.deepEqual(value.admissible_dimensions,['execution']);
 assert.deepEqual(candidates.find(item=>item.fact.field==='data.completeAssetCoverage')?.admissible_dimensions,[]);
 check.status='unknown';check.data!.traceTruncated=true;
 assert.ok(modelFactCandidates(assess(request,[check])).candidates.filter(item=>item.fact.evidence_id===check.id).every(item=>item.admissible_dimensions.length===0));
});
test('order domain hash comparisons support only bounded authority, never identity or fulfillment',()=>{
 const check=evidence('order_domain','pass','Order domain','Getter comparison','rpc',{chainId:1,blockNumber:'123',blockHash:hash,verifyingContract:target,expected:hash,observed:hash,matches:true,identityVerified:false,semanticsVerified:false});
 const report=assess(request,[check]),candidates=modelFactCandidates(report).candidates.filter(item=>item.fact.evidence_id===check.id);
 assert.deepEqual(dimensionsForEvidence(check,report),['authority']);
 assert.deepEqual(candidates.find(item=>item.fact.field==='data.matches')?.admissible_dimensions,['authority']);
 assert.deepEqual(candidates.find(item=>item.fact.field==='data.identityVerified')?.admissible_dimensions,[]);
 assert.equal(candidates.find(item=>item.fact.field==='data.semanticsVerified')?.fact.value,false);
});
test('offered asset quantity comparisons retain token and ID while custom field names stay unresolved',()=>{
 const asset=evidence('order_asset_0','warning','Offer balance','Pinned quantity','rpc',{chainId:1,blockNumber:'123',blockHash:hash,token,tokenId:'7',balanceRaw:'1',minimum:'2',maximum:'3',balanceBelowMinimum:true,balanceCoversMaximum:false});
 const custom=evidence('order_committed_fields','unknown','Custom order','Names do not establish semantics','eip712',{protocolDecoded:false,semanticsVerified:false,declaredFields:[{name:'amount',type:'uint256',value:'1000000'}]});
 const report=assess(request,[asset,custom]),candidates=modelFactCandidates(report).candidates;
 const quantity=candidates.find(item=>item.fact.evidence_id===asset.id&&item.fact.field==='data.balanceBelowMinimum')!;
 assert.deepEqual(quantity.fact.subject,{role:'token',value:token});assert.equal(quantity.fact.value,true);assert.ok(quantity.admissible_dimensions.includes('exposure'));
 assert.ok(candidates.filter(item=>item.fact.evidence_id===custom.id).every(item=>item.admissible_dimensions.length===0&&item.fact.scope==='unresolved-check'));
 assert.ok(!candidates.some(item=>item.fact.evidence_id===custom.id&&/amount|token/.test(item.fact.field)));
});
