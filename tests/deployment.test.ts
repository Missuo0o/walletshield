import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceConfig,permittedHost} from '../src/server/service-config.js';
test('hosted mode requires explicit HTTPS and bounds wallet/worker limits; local defaults cannot become a public service',()=>{
 const local=serviceConfig({});assert.equal(local.mode,'local');assert.ok(permittedHost('127.0.0.1:8787',local));assert.ok(!permittedHost('evil.example',local));
 for(const origin of ['http://walletshield.example','https://localhost','https://127.0.0.1','https://name:password@walletshield.example','https://walletshield.example/path','https://walletshield.example?token=secret'])assert.throws(()=>serviceConfig({WALLETSHIELD_SERVICE_MODE:'hosted',WALLETSHIELD_APP_ORIGIN:origin}));
 const hosted=serviceConfig({WALLETSHIELD_SERVICE_MODE:'hosted',WALLETSHIELD_APP_ORIGIN:'https://walletshield.example'});assert.equal(hosted.maxScans,3);assert.equal(hosted.walletDailyLimit,20);assert.ok(permittedHost('walletshield.example',hosted));assert.ok(!permittedHost('localhost:8787',hosted));
 assert.throws(()=>serviceConfig({WALLETSHIELD_SERVICE_MODE:'hosted',WALLETSHIELD_APP_ORIGIN:'https://walletshield.example',WALLETSHIELD_MAX_SCANS:'999'}));
});
test('release settings contain only nonsecret endpoints and reject ambiguous npm package identity',async()=>{
 // JS helper is tested without executing its file-generation entry point.
 const {runtimeConfig}=await import('../scripts/configure-runtime.mjs');
 const localRuntime=runtimeConfig({});assert.equal(localRuntime.mode,'local');
 assert.equal(localRuntime.appOrigin,'http://127.0.0.1:5173');
 assert.equal(localRuntime.apiBase,'http://127.0.0.1:8787/api','Snap must bypass the Vite proxy that consumes opaque-origin preflight');
 for(const env of [{WALLETSHIELD_SERVICE_MODE:'hosted'},{WALLETSHIELD_SERVICE_MODE:'hosted',WALLETSHIELD_APP_ORIGIN:'https://walletshield.example',WALLETSHIELD_SNAP_PACKAGE:'walletshield-snap'}])assert.throws(()=>runtimeConfig(env));
 const value=runtimeConfig({WALLETSHIELD_SERVICE_MODE:'hosted',WALLETSHIELD_APP_ORIGIN:'https://walletshield.example',WALLETSHIELD_SNAP_PACKAGE:'@owned-scope/walletshield',MODEL_API_KEY:'private-key',INFURA_API_KEY:'private-rpc'});
 assert.equal(value.snapId,'npm:@owned-scope/walletshield');assert.equal(value.apiBase,'https://walletshield.example/api');assert.ok(!JSON.stringify(value).includes('private-'));
});
