import test from 'node:test';
import assert from 'node:assert/strict';
import {getTypesForEIP712Domain,hashDomain,zeroAddress} from 'viem';
import {validateAI} from '../src/security/ai.js';
import {evidence} from '../src/security/evidence.js';
import {assess} from '../src/security/rules.js';
import {abstentionFixture} from '../src/evaluation/ai-evaluation.js';
import {structuredModelOutput} from './fixtures/model.js';
import type {SecurityRequest,SecurityReport} from '../src/security/types.js';

function comparisonReport():SecurityReport{
 const owner='0x1111111111111111111111111111111111111111',verifier='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333',zeroHash=`0x${'0'.repeat(64)}`;
 const fields=(...values:string[])=>values.map(value=>{const [name,type]=value.split(':');return {name,type};});
 const item=fields('itemType:uint8','token:address','identifierOrCriteria:uint256','startAmount:uint256','endAmount:uint256');
 const domain={name:'Candidate order fixture',version:'1.6',chainId:31337,verifyingContract:verifier} as const;
 const request:SecurityRequest={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain,primaryType:'OrderComponents',types:{OfferItem:item,ConsiderationItem:[...item,{name:'recipient',type:'address'}],OrderComponents:fields('offerer:address','zone:address','offer:OfferItem[]','consideration:ConsiderationItem[]','orderType:uint8','startTime:uint256','endTime:uint256','zoneHash:bytes32','salt:uint256','conduitKey:bytes32','counter:uint256')},message:{offerer:owner,zone:zeroAddress,offer:[{itemType:'2',token,identifierOrCriteria:'7',startAmount:'1',endAmount:'1'}],consideration:[{itemType:'0',token:zeroAddress,identifierOrCriteria:'0',startAmount:'100',endAmount:'100',recipient:owner}],orderType:'0',startTime:'900',endTime:'2000',zoneHash:zeroHash,salt:'11',conduitKey:zeroHash,counter:'3'}}}};
 const report=assess(request,[]),expected=hashDomain({domain,types:{EIP712Domain:getTypesForEIP712Domain({domain})}} as any);
 assert.equal(report.operation.decoded,true);
 report.checks.push(evidence('order_domain','pass','Candidate getter domain comparison','Pinned hash comparison only, not protocol identity or signature verification.','rpc',{chainId:31337,blockNumber:'42',blockHash:`0x${'a'.repeat(64)}`,blockTimestampSeconds:'1000',verifyingContract:verifier,offerer:owner,orderHash:report.operation.fields.orderHash,expected,observed:expected,matches:true,identityVerified:false,semanticsVerified:false}));
 return report;
}
function proposal(report:SecurityReport,text:string){
 const value=abstentionFixture(report);value.reasons=[{text,evidence_ids:['order_domain'],fact_ids:[]}];
 return structuredModelOutput(value,report);
}

test('new order-domain citations permit only the exact signed-hash comparison, not identity, signature or nonce guarantees',()=>{
 const report=comparisonReport();
 for(const text of ['The information() order domain matches the signed domain hash at this block.','The EIP-712 domain matches the pinned candidate getter return.'])assert.equal(validateAI(proposal(report,text),report,'fixture',{requireStructuredFacts:true}).score,null);
 assert.throws(()=>validateAI(proposal(report,'The order nonce matches.'),report,'fixture'),/Unsupported signature verification claim/);
 assert.throws(()=>validateAI(proposal(report,'The contract is official.'),report,'fixture'),/Unsupported certainty claim/);
 const check=report.checks.find(item=>item.id==='order_domain')!;check.status='risk';check.data!.observed=`0x${'0'.repeat(64)}`;check.data!.matches=false;
 assert.equal(validateAI(proposal(report,'The information() order domain does not match.'),report,'fixture').score,null);
 assert.throws(()=>validateAI(proposal(report,'The information() order domain matches.'),report,'fixture'),/Unsupported signature verification claim/);
});

test('order-domain assertions reject another verifier/order/chain, fabricated hashes and incomplete snapshot provenance',()=>{
 const mutations:((report:SecurityReport)=>void)[]=[
  report=>{report.checks.find(item=>item.id==='order_domain')!.source='eip712';},
  report=>{report.checks.find(item=>item.id==='order_domain')!.status='unknown';},
  report=>{report.checks.find(item=>item.id==='order_domain')!.data!.verifyingContract='0x9999999999999999999999999999999999999999';},
  report=>{report.checks.find(item=>item.id==='order_domain')!.data!.offerer='0x9999999999999999999999999999999999999999';},
  report=>{report.checks.find(item=>item.id==='order_domain')!.data!.orderHash=`0x${'b'.repeat(64)}`;},
  report=>{report.checks.find(item=>item.id==='order_domain')!.data!.chainId=1;},
  report=>{report.checks.find(item=>item.id==='order_domain')!.data!.expected=`0x${'b'.repeat(64)}`;report.checks.find(item=>item.id==='order_domain')!.data!.observed=`0x${'b'.repeat(64)}`;},
  report=>{report.checks.find(item=>item.id==='order_domain')!.data!.observed='0x01';},
  report=>{report.checks.find(item=>item.id==='order_domain')!.data!.matches=false;},
  report=>{delete report.checks.find(item=>item.id==='order_domain')!.data!.blockNumber;},
  report=>{delete report.checks.find(item=>item.id==='order_domain')!.data!.blockHash;},
  report=>{delete report.checks.find(item=>item.id==='order_domain')!.data!.blockTimestampSeconds;},
  report=>{report.checks.find(item=>item.id==='order_domain')!.observedAt='invalid';},
  report=>{report.operation.fields.verifyingContract='0x9999999999999999999999999999999999999999';},
  report=>{assert.equal(report.request.kind,'signature');if(report.request.kind==='signature')(report.request.signature.data as any).domain.name='Different signed domain';},
  report=>{assert.equal(report.request.kind,'signature');if(report.request.kind==='signature')(report.request.signature.data as any).message.counter='4';}
 ];
 for(const mutate of mutations){const report=comparisonReport();mutate(report);assert.throws(()=>validateAI(proposal(report,'The information() order domain matches.'),report,'fixture'),/Unsupported signature verification claim/);}
});
