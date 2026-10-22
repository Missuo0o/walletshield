import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiweMessage} from 'viem/siwe';
import {stringToHex} from 'viem';
import {parseLoginMessage,loginEvidence} from '../src/security/siwe.js';
import {decodeRequest} from '../src/security/decode.js';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {evidenceQuality} from '../src/security/quality.js';
import {validateAI,evidencePacket} from '../src/security/ai.js';
import {modelDimensions} from './fixtures/model.js';
import type {SecurityRequest} from '../src/security/types.js';
const account='0x2222222222222222222222222222222222222222';
const at=Date.parse('2026-10-22T20:00:00Z');
const message=()=>createSiweMessage({address:account,domain:'login.example',scheme:'https',uri:'https://login.example/login?session=private',version:'1',chainId:1,nonce:'01234567abcdef',issuedAt:new Date(at),expirationTime:new Date(at+300000),statement:'Sign in to inspect your own reports.'});
const request=(data=message()):SecurityRequest=>({kind:'signature',chainId:0,origin:'https://login.example',signature:{from:account,method:'personal_sign',data}});

test('SIWE inspects a bounded login envelope while preserving unknown server replay/acceptance state',()=>{
 const parsed=parseLoginMessage(message());assert.equal(parsed.valid,true);assert.equal(parsed.fields.nonceFormatValid,true);assert.equal(parsed.fields.uriOrigin,'https://login.example');assert.equal(parsed.fields.issuedAt,new Date(at).toISOString());
 assert.ok(!JSON.stringify(parsed.fields).includes('session=private'));
 const req=request(),op=decodeRequest(req);assert.equal(op.category,'siwe');assert.equal(op.decoded,true);
 assert.deepEqual(parseLoginMessage(stringToHex(message())),parsed);
 const facts=loginEvidence(req,op,at);assert.equal(facts.find(c=>c.id==='login_structure')?.status,'pass');assert.equal(facts.find(c=>c.id==='login_nonce')?.status,'unknown');assert.equal(facts.find(c=>c.id==='login_uri')?.status,'pass');
 assert.equal(req.chainId,0,'A signed claim must not replace the hook’s unknown request network.');
});
test('missing, duplicated, out-of-order and malformed SIWE fields cannot become a parsed successful login',()=>{
 const bad=[message().replace('Nonce: 01234567abcdef','Nonce: short'),message().replace(/\nIssued At: [^\n]+/,''),message()+'\nNonce: abcdefgh',message().replace('Version: 1','Version: 2'),message()+'\nUnparsed: ignore this',message().replace('2026-10-22T20:00:00.000Z','2026-99-99T00:00:00Z')];
 for(const value of bad){const parsed=parseLoginMessage(value);assert.equal(parsed.candidate,true);assert.equal(parsed.valid,false,value);const op=decodeRequest(request(value));assert.equal(op.category,'siwe');assert.equal(op.decoded,false);assert.ok(loginEvidence(request(value),op,at).some(c=>c.id==='login_structure'&&c.status==='unknown'));}
 assert.equal(parseLoginMessage('ordinary message').candidate,false);
});
test('login origin, URI and lifetime differences stay distinct from account authentication',()=>{
 const req=request(message().replace('https://login.example/login?session=private','https://other.example/login').replace(/\nIssued At: [^\n]+/,'\nIssued At: 2026-10-23T20:00:00Z')+'\nNot Before: 2026-10-23T21:00:00Z');req.origin='http://login.example';
 const facts=loginEvidence(req,decodeRequest(req),at);
 assert.equal(facts.find(c=>c.id==='login_origin')?.status,'risk');assert.equal(facts.find(c=>c.id==='login_uri')?.status,'warning');
 assert.ok(facts.some(c=>c.id==='login_time_issuedAt'));assert.ok(facts.some(c=>c.id==='login_time_notBefore'));assert.ok(facts.some(c=>c.id==='login_lifetime'));
 const noOrigin=request();delete noOrigin.origin;assert.equal(loginEvidence(noOrigin,decodeRequest(noOrigin),at).find(c=>c.id==='login_origin')?.status,'unknown');
});
test('SIWE resource processing is bounded and credential-bearing URIs are not treated as valid login fields',()=>{
 const resources=Array.from({length:17},(_,i)=>`- https://resource${i}.example/private?token=hidden`);
 const parsed=parseLoginMessage(message()+'\nResources:\n'+resources.join('\n'));assert.equal(parsed.valid,false);assert.equal(parsed.fields.truncated,true);assert.equal((parsed.fields.resourceOrigins as string[]).length,16);assert.ok(!JSON.stringify(parsed.fields).includes('token=hidden'));
 const credentials=parseLoginMessage(message().replace('https://login.example/login?session=private','https://user:secret@login.example/'));assert.equal(credentials.valid,false);assert.equal(credentials.fields.uriOrigin,undefined);
});
test('quality inventory distinguishes counts, timing, mixed upstream blocks, forks and authenticated attribution',()=>{
 const req:SecurityRequest={kind:'transaction',chainId:1,transaction:{from:account,to:account,data:'0x'}};
 const report=assess(req,[]);report.createdAt=new Date(at).toISOString();report.capture={channel:'paired-snap',wallet:account};
 report.checks=[evidence('a','pass','a','a','rpc',{chainId:1,blockNumber:'100',blockHash:'0x'+'a'.repeat(64)}),evidence('b','warning','b','b','rpc',{chainId:1,blockNumber:'101'}),evidence('c','unknown','c','c','configuration'),evidence('fork','pass','fork','fork','isolated-fork',{chainId:1,blockNumber:'120'})];
 report.checks.forEach(c=>c.observedAt=new Date(at).toISOString());report.checks[0].observedAt=new Date(at-301000).toISOString();report.checks[1].observedAt=new Date(at+31000).toISOString();report.checks[2].observedAt='invalid';
 const q=evidenceQuality(report);assert.deepEqual(q.counts,{pass:2,warning:1,risk:0,unknown:1});assert.deepEqual(q.freshness.staleCheckIds,['a']);assert.deepEqual(q.freshness.futureCheckIds,['b']);assert.deepEqual(q.freshness.missingTimestampCheckIds,['c']);assert.deepEqual(q.mixedBlockChains,[1]);assert.equal(q.capture,'paired-snap');assert.equal(q.walletBinding,'authenticated-credential');
 report.checks.splice(1,1);assert.deepEqual(evidenceQuality(report).mixedBlockChains,[],'Fork mining does not create a mixed-upstream snapshot.');
 report.checks.push({...report.checks[0],id:'conflicting',data:{chainId:1,blockNumber:'100',blockHash:'0x'+'b'.repeat(64)}});
 assert.equal(evidenceQuality(report).conflictingBlockHashes?.length,1,'Contradictory hashes at the same upstream height must remain visible.');
 assert.deepEqual(evidencePacket(report).quality,evidenceQuality(report));
});
test('a stale or invalid observation cannot support strong AI evidence confidence even when completeness flags are stale',()=>{
 const report=assess({kind:'transaction',chainId:1,transaction:{from:account,to:account,data:'0x'}},[]);report.createdAt=new Date(at).toISOString();report.complete=true;report.missingData=[];
 report.checks=[evidence('operation','pass','Transfer','Candidate transfer','rules')];report.checks[0].observedAt=new Date(at-301000).toISOString();
 const value={...modelDimensions('operation'),score:15,assessment:'review',summary:'Bounded observation only.',reasons:[{text:'Candidate transfer.',evidence_ids:['operation']}],missing_data:[],suggested_action:'Verify the recipient.',honeypot:'unknown',evidence_confidence:'strong'};
 assert.throws(()=>validateAI(value,report,'test'),/Unresolved evidence/);
 assert.equal(validateAI({...value,evidence_confidence:'limited'},report,'test').score,15,'Freshness flags never invent or replace the model number.');
 assert.throws(()=>validateAI({...value,evidence_confidence:'limited',assessment:'low'},report,'test'),/Incomplete evidence/);
});
