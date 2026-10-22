import test from 'node:test';
import assert from 'node:assert/strict';
import {operationLines} from '../src/security/display.js';

test('wallet facts prioritize account authority, thresholds and execution mode within the display bound',()=>{
 const control=operationLines({category:'account_control',fields:{method:'changeThreshold',account:'0x'+'1'.repeat(40),authorityChange:'change_threshold',threshold:'1'}});
 assert.ok(control.some(line=>line==='Requested threshold: 1'));assert.ok(control[0].startsWith('Authority change:'));
 const exec=operationLines({category:'account_execution',fields:{method:'execTransaction',executionTarget:'0x'+'2'.repeat(40),executionOperation:'delegatecall',executionValueWei:'99',gasToken:'0x'+'0'.repeat(40),refundReceiver:'0x'+'3'.repeat(40),signatureBytes:'65',signatures:'PRIVATE_SIGNATURE',data:'PRIVATE_CALLDATA'}});
 assert.equal(exec.length,6);assert.ok(exec.some(line=>line.includes('not proof of payment')));assert.ok(exec.some(line=>line==='Encoded execution mode: delegatecall'));assert.ok(!exec.join('').includes('PRIVATE'));
});
test('wallet signature facts show DAI boolean and distinct exact-transfer validity windows without hiding zero values',()=>{
 const dai=operationLines({category:'dai_permit_signature',fields:{spender:'spender',owner:'holder',allowed:false,expiry:'0',nonce:'0',amount:'0',data:'PRIVATE'}});
 assert.ok(dai.includes('DAI-style allowed flag: false'));assert.ok(dai.includes('DAI-style submission expiry (0 means none): 0'));assert.equal(dai.length,6);
 const transfer=operationLines({category:'transfer_authorization',fields:{recipient:'recipient',owner:'authorizer',amount:'100',validAfter:'0',validBefore:'2000',nonce:'0x'+'ab'.repeat(32)}});
 assert.ok(transfer.includes('Valid after (exclusive timestamp): 0'));assert.ok(transfer.includes('Valid before (exclusive timestamp): 2000'));assert.ok(transfer.some(line=>line.startsWith('Nonce: ')));
});
test('position and bridge facts retain separate liquidity units, collection caps and request stages',()=>{
 const position=operationLines({category:'liquidity_v3',fields:{action:'decreaseLiquidity',tokenId:'99',liquidity:'7',amount0Min:'2',amount1Min:'3',deadline:'2000'}});
 assert.ok(position.includes('NFT ID: 99'));assert.ok(position.includes('Protocol liquidity units: 7'));assert.ok(position.includes('Token 0 minimum (raw): 2'));
 const bridge=operationLines({category:'bridge',fields:{action:'finalizeBridgeETH',stage:'finalization_request',recipient:'recipient',amount:'100',extraData:'PRIVATE'}});
 assert.ok(bridge.includes('Bridge request stage: finalization_request'));assert.ok(!bridge.join('').includes('PRIVATE'));
});
