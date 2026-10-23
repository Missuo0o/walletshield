import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeScopeEvidence} from '../src/security/bridge-scope.js';
import {collector} from '../src/security/providers.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {Operation,SecurityRequest} from '../src/security/types.js';

const request:SecurityRequest={kind:'transaction',chainId:1,transaction:{from:'0x1111111111111111111111111111111111111111',to:'0x2222222222222222222222222222222222222222',data:'0x'}};
const operation:Operation={category:'bridge',label:'Bridge candidate',decoded:true,targets:[],fields:{action:'bridgeERC20',destinationChainId:'10',sourceBridge:request.transaction.to!,destinationBridge:'0x3333333333333333333333333333333333333333'}};

test('bridge parameters do not establish endpoint, route, message or arrival verification',()=>{
 const checks=bridgeScopeEvidence(request,operation);
 assert.equal(checks.length,1);assert.equal(checks[0].id,'bridge_scope');assert.equal(checks[0].status,'unknown');
 assert.deepEqual(checks[0].data,{requestChainId:1,endpointValidationPerformed:false,routeValidationPerformed:false,arrivalProven:false,relayContextVerified:false,proofVerified:false});
 assert.deepEqual(bridgeScopeEvidence(request,{...operation,category:'approval'}),[]);
});

test('legacy configuration cannot reactivate removed collectors or advertise them as planned tools',async()=>{
 let calls=0;
 const config={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},trustedDeployments:[{chainId:1,address:request.transaction.to}],priceFeeds:[{chainId:1,asset:'native'}],bridgeRoutes:[{sourceChainId:1,destinationChainId:10}]} as SecurityConfig;
 const checks=await collector(config,async()=>{calls++;throw Error('No external reads allowed in this fixture');})(request,operation);
 assert.equal(calls,0);
 assert.ok(checks.some(check=>check.id==='bridge_scope'&&check.status==='unknown'));
 assert.ok(!checks.some(check=>check.source==='registry'||/^(?:registry_deployment|deployment_registry|price_reference|bridge_route|bridge_source_|bridge_destination_)/.test(check.id)));
 const tools=checks.find(check=>check.id==='tool_plan')!.data!.tools as {tool:string}[];
 for(const retired of ['maintained_deployment_binding','reference_price','bridge_route','entrypoint_state'])assert.ok(!tools.some(tool=>tool.tool===retired));
});
