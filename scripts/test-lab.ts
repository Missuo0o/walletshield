import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createWalletClient,http,hashMessage,recoverMessageAddress,recoverTypedDataAddress,type Address} from 'viem';
import {foundry} from 'viem/chains';
import {verifiedLab,labArtifacts,labClient,prepareLab,labInventory} from '../src/testing/contracts.js';
import {prepareLocalFunds} from '../src/server/funding.js';
import {buildWalletCase,WALLET_CASES} from '../src/testing/cases.js';
import {requestSchema} from '../src/security/types.js';
import {decodeRequest} from '../src/security/decode.js';
import {COVERAGE_PROFILES} from '../src/security/coverage.js';
import {assetEvidence} from '../src/security/assets.js';
import {assess} from '../src/security/rules.js';
import {signatureChainEvidence,signatureStructure} from '../src/security/signatures.js';
import {accountEvidence} from '../src/security/account-evidence.js';
import {batchEvidence} from '../src/security/batch-evidence.js';
const wallet=createWalletClient({chain:foundry,transport:http('http://127.0.0.1:8545')});
const d=await verifiedLab(),artifacts=await labArtifacts(),accounts=await wallet.getAddresses(),account=accounts[4];
if(!account)throw Error('Missing isolated local test account');
const snapshot=await labClient.request({method:'evm_snapshot' as never,params:[] as never});
const cases:{id:string;kind:string;category:string;result:string;evidenceCount?:number}[]=[];
const config={apiKey:'',model:'unused',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:'http://127.0.0.1:8545'}};
try{
 await prepareLocalFunds(account);await prepareLab(account);
 const inventory=await labInventory(account);assert.equal(inventory.ready,true);assert.equal(inventory.assets.length,5);assert.equal(inventory.nfts.length,3);
 const independent=await buildWalletCase('swap-v3',account,d,artifacts);if(independent.kind==='transaction')independent.transaction.to=d.recipient;const independentFacts=await assetEvidence(independent,decodeRequest(independent),config);assert.equal(independentFacts.find(c=>c.id==='token_identity')?.status,'pass','Token lookup must not borrow the unrelated transaction target code');
 for(const item of WALLET_CASES){
  if(item.id==='upgrade')await prepareLab(account);
  const request=await buildWalletCase(item.id,account,d,artifacts);
  assert.equal(requestSchema.safeParse(request).success,true,item.id);
  const operation=decodeRequest(request);const profile=COVERAGE_PROFILES.find(p=>p.id===item.profile)!;
  assert.ok(profile.categories.includes(operation.category),`${item.id}: unexpected category ${operation.category}`);
  const facts=await assetEvidence(request,operation,config);const signatureFacts=await signatureChainEvidence(request,config);
  const accountFacts=await accountEvidence(request,operation,config),batchFacts=batchEvidence(request,operation);
  const allFacts=[...facts,...signatureFacts,...signatureStructure(request),...accountFacts,...batchFacts],report=assess(request,allFacts);
  if(operation.token)assert.equal(facts.find(c=>c.id==='token_identity')?.status,'pass',item.id);
  if(item.id==='permit2-batch')assert.ok(facts.some(c=>c.id==='asset_identity_1'&&c.status==='pass'));
  if(item.id==='nft-approve')assert.ok(facts.some(c=>c.id==='nft_position_0_0'&&c.data?.owner?.toString().toLowerCase()===account.toLowerCase()));
  if(item.id==='multi-batch')assert.equal(facts.filter(c=>c.id.startsWith('nft_position_')).length,2);
  if(item.id==='permit-owner')assert.ok(report.checks.some(c=>c.id==='signer_mismatch'));
  if(item.id==='permit-expired')assert.ok(report.checks.some(c=>c.id==='expired_deadline'));
  if(item.id==='permit-nonce')assert.ok(signatureFacts.some(c=>c.id==='signature_nonce'&&c.status==='risk'));
  if(item.id==='siwe-mismatch')assert.ok(report.checks.some(c=>c.id==='login_domain'));
  if(item.id.startsWith('account-')){assert.equal(accountFacts.find(c=>c.id==='account_owners')?.status,'pass',item.id);assert.equal(accountFacts.find(c=>c.id==='account_semantics')?.status,'unknown',item.id);}
  if(item.id==='account-call'){assert.ok(batchFacts.some(c=>c.id==='batch_child_0_0'&&c.data?.category==='mint_burn'));assert.ok(batchFacts.some(c=>c.id==='batch_execution_context'&&c.status==='unknown'));}
  if(operation.category==='transfer_authorization'){assert.equal(signatureFacts.find(c=>c.id==='signature_nonce')?.status,'unknown','The legacy token fixture has no authorizationState getter; it cannot fabricate an unused nonce.');assert.ok(report.missingData.length);}
  if(request.kind==='transaction'){
   const hash=await wallet.sendTransaction({account,to:request.transaction.to as Address|null??undefined,data:request.transaction.data as `0x${string}`,value:BigInt(request.transaction.value??'0x0'),gas:3000000n});
   const receipt=await labClient.waitForTransactionReceipt({hash});assert.equal(receipt.status,item.id==='sell-blocked'?'reverted':'success',item.id);
   cases.push({id:item.id,kind:item.kind,category:operation.category,evidenceCount:allFacts.length,result:receipt.status});
  }else if(request.kind==='signature'){
   if(request.signature.method==='personal_sign'){
    const message={raw:request.signature.data as `0x${string}`};const signature=await wallet.signMessage({account,message});assert.equal((await recoverMessageAddress({message,signature})).toLowerCase(),account.toLowerCase());
   }else{
    assert.ok(signatureStructure(request).some(c=>c.status==='pass'),item.id);
    const typed=request.signature.data as any;const signature=await wallet.signTypedData({account,...typed});assert.equal((await recoverTypedDataAddress({...typed,signature})).toLowerCase(),account.toLowerCase());
   }
   cases.push({id:item.id,kind:item.kind,category:operation.category,evidenceCount:allFacts.length,result:'local-node-signature-verified-not-snap'});
  }
 }
 const result={passed:cases.length,transactionCount:cases.filter(c=>c.kind==='transaction').length,signatureCount:cases.filter(c=>c.kind==='signature').length,profiles:new Set(WALLET_CASES.map(c=>c.profile)).size,cases};
 await writeFile('docs/wallet-lab-acceptance.json',JSON.stringify({...result,scope:'local-node-transactions-and-signature-format-not-MetaMask-Snap-UI',generatedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({...result,cases:undefined}));
}finally{assert.equal(await labClient.request({method:'evm_revert' as never,params:[snapshot] as never}),true);console.log('Local chain snapshot restored. This test did not validate MetaMask UI or Snap entry-point delivery.');}
