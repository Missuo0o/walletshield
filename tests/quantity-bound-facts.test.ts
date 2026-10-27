import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi} from 'viem';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {forkAuthorityEvidence,type ForkAuthorityState} from '../src/security/fork-authority-state.js';
import {forkProtocolEvidence,type ForkProtocolState} from '../src/security/fork-protocol-state.js';
import {modelFactCandidates,type FactCandidate} from '../src/security/model-facts.js';
import {resolveModelSelection,validateAI} from '../src/security/ai.js';
import {AI_DIMENSIONS,type SecurityRequest,type SecurityReport} from '../src/security/types.js';
import {COVERAGE_PROFILES} from '../src/security/coverage.js';
const owner='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333',vault='0x4444444444444444444444444444444444444444';
const snapshot={chainId:31337,blockNumber:'1',blockHash:`0x${'1'.repeat(64)}`,blockTimestampSeconds:String(Math.floor(Date.now()/1000))};
const request:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:owner,to:token,data:encodeFunctionData({abi:parseAbi(['function approve(address,uint256)']),functionName:'approve',args:[other,200n]})}};
function candidate(report:SecurityReport,id:string,path:string){const fact=modelFactCandidates(report).candidates.find(c=>c.fact.evidence_id===id&&c.fact.field===path);assert.ok(fact,`${id}/${path}`);return fact;}
function strict(report:SecurityReport,fact:FactCandidate,rated:typeof AI_DIMENSIONS[number]='exposure'){const proposal={response_schema_version:'walletshield-selection-v1',selected_fact_ids:[fact.fact.id],score:88,assessment:'review',evidence_confidence:'limited',summary:'One bounded field was selected; unfinished checks remain explicit.',reasons:[{text:'This field is part of the supplied observation.',evidence_ids:[fact.fact.evidence_id],fact_ids:[fact.fact.id]}],missing_data:[],suggested_action:'Review the selected observation and all missing checks.',honeypot:'unknown',dimensions:AI_DIMENSIONS.map(dimension=>({dimension,assessment:dimension===rated?'high':'unknown',reason:'This selected field is used as the proposed financial support.',evidence_ids:[fact.fact.evidence_id],fact_ids:dimension===rated?[fact.fact.id]:[]}))};return validateAI(resolveModelSelection(proposal,report),report,'offline-fixture',{requireStructuredFacts:true});}

test('actual fork authority quantities keep the exact token or account subject across before/after/change stores',()=>{
 const base:ForkAuthorityState={phase:'before',target:token,kind:'erc20_approval_candidate',subjects:{caller:owner,owner,spender:other},snapshot,values:{erc20AllowanceRaw:'100'},missing:[]};
 for(const kind of ['erc20_approval_candidate','permit']){
  const before={...structuredClone(base),kind},after={...structuredClone(before),phase:'after' as const,values:{erc20AllowanceRaw:'200'}},report=assess(request,forkAuthorityEvidence(before,after));
  for(const [id,path] of [['fork_authority_before','data.values.erc20AllowanceRaw'],['fork_authority_after','data.values.erc20AllowanceRaw'],['fork_authority_change','data.beforeValues.erc20AllowanceRaw'],['fork_authority_change','data.afterValues.erc20AllowanceRaw']])assert.deepEqual(candidate(report,id,path).fact.subject,{role:'asset',value:token});
 }
 const permit2:ForkAuthorityState={...structuredClone(base),target:vault,kind:'permit2_approval',subjects:{caller:owner,owner,spender:other,token},values:{erc20AllowanceToVerifierRaw:'100',permit2AmountRaw:'50',permit2ExpirationSeconds:'1000',permit2Nonce:'1'}};
 const report=assess(request,forkAuthorityEvidence(permit2,null));for(const name of Object.keys(permit2.values))assert.deepEqual(candidate(report,'fork_authority_before',`data.values.${name}`).fact.subject,{role:'asset',value:token});
 delete (permit2.subjects as Record<string,unknown>).token;const missing=assess(request,forkAuthorityEvidence(permit2,null));assert.deepEqual(candidate(missing,'fork_authority_before','data.values.permit2AmountRaw').fact.subject,{role:'evidence',value:'fork_authority_before'});
 const authorityValues:ForkAuthorityState['values'][]=[{erc721Owner:owner,erc721Approved:other},{operatorApproved:true},{owners:[owner],ownerCount:'1',threshold:'1'}];
 for(const values of authorityValues){
  const state={...structuredClone(base),values},r=assess(request,forkAuthorityEvidence(state,null));
  for(const fact of modelFactCandidates(r).candidates.filter(c=>c.fact.evidence_id==='fork_authority_before'&&c.fact.field.startsWith('data.values.')))assert.deepEqual(fact.fact.subject,{role:/erc721|operatorApproved/.test(fact.fact.field)?'asset':'account',value:token});
 }
});

test('ordinary vault previews, lending base values and position amounts preserve distinct asset units',()=>{
 const checks=[
  evidence('vault_context','pass','Vault quantities','Synthetic actual getter shape.','rpc',{...snapshot,vault,asset:token,action:'deposit',amount:'100',totalAssets:'1000',totalSupply:'800',previewDeposit:'80',previewMint:'100',previewWithdraw:'80',previewRedeem:'100',maxDeposit:'1000',maxMint:'800',maxWithdraw:'100',maxRedeem:'80'}),
  evidence('vault_asset_context','pass','Vault balances','Synthetic actual getter shape.','rpc',{...snapshot,underlying:token,account:owner,underlyingBalanceRaw:'1000',existingUnderlyingAllowanceRaw:'500',shareBalanceRaw:'100',underlyingDecimals:'6',shareDecimals:'18'}),
  evidence('lending_context','pass','Lending base values','Unknown base currency is not the asset token.','rpc',{...snapshot,pool:vault,asset:token,owner,totalCollateralBase:'1000',totalDebtBase:'500',availableBorrowsBase:'100',healthFactor:'2000000000000000000'}),
  evidence('position_context','pass','Position amounts','Mixed position and per-token units.','rpc',{...snapshot,manager:vault,owner,tokenId:'7',token0:token,token1:other,liquidity:'100',tokensOwed0:'2',tokensOwed1:'3'}),
  evidence('token_identity','pass','Actual token collector shape','The asset collector uses address, not token, in this observation.','rpc',{...snapshot,address:token,owner,standard:'erc20',decimals:6,balance:'100'}),
 ];
 const report=assess({...request,transaction:{...request.transaction,to:vault}},checks);
 for(const name of ['totalSupply','previewDeposit','previewWithdraw','maxMint','maxRedeem'])assert.deepEqual(candidate(report,'vault_context',`data.${name}`).fact.subject,{role:'asset',value:vault});
 for(const name of ['amount','totalAssets','previewMint','previewRedeem','maxDeposit','maxWithdraw'])assert.deepEqual(candidate(report,'vault_context',`data.${name}`).fact.subject,{role:'asset',value:token});
 for(const name of ['underlyingBalanceRaw','existingUnderlyingAllowanceRaw'])assert.deepEqual(candidate(report,'vault_asset_context',`data.${name}`).fact.subject,{role:'asset',value:token});
 assert.deepEqual(candidate(report,'vault_asset_context','data.shareBalanceRaw').fact.subject,{role:'asset',value:vault});
 for(const name of ['totalCollateralBase','totalDebtBase','availableBorrowsBase','healthFactor'])assert.deepEqual(candidate(report,'lending_context',`data.${name}`).fact.subject,{role:'account',value:owner});
 for(const [field,value] of [['liquidity',vault],['tokensOwed0',token],['tokensOwed1',other]])assert.deepEqual(candidate(report,'position_context',`data.${field}`).fact.subject,{role:'asset',value});
 assert.equal(strict(report,candidate(report,'vault_asset_context','data.underlyingBalanceRaw')).score,88);
 assert.deepEqual(candidate(report,'token_identity','data.balance').fact.subject,{role:'token',value:token});
});

test('original fork native and standard-asset deltas are bounded selected facts without promoting NFT IDs or private fields',()=>{
 const marker='SYNTHETIC_PRIVATE_FIELD_NOT_FOR_FACTS',check=evidence('simulation_execution','pass','Executed locally','Actual collector shape; no upstream broadcast.','isolated-fork',{...snapshot,status:'success',native:{before:'100',after:'80',deltaIncludingGas:'-20',gasWei:'5',deltaExcludingGas:'-15',privateNote:marker},assets:[{kind:'erc20',contract:token,owner,before:'100',after:'90',delta:'-10',calldata:marker},{kind:'erc1155',contract:other,tokenId:'7',owner,before:'5',after:'4',delta:'-1'},{kind:'erc721',contract:vault,tokenId:'8',owner,before:owner,after:other,delta:null}],simulationOnly:true});
 const report=assess(request,[check]),facts=modelFactCandidates(report).candidates;
 assert.ok(!JSON.stringify(facts).includes(marker));
 for(const field of ['before','after','deltaIncludingGas','gasWei','deltaExcludingGas']){const fact=candidate(report,check.id,`data.native.${field}`);assert.deepEqual(fact.fact.subject,{role:'asset',value:'native'});assert.equal(strict(report,fact).score,88);}
 for(const [index,at] of [[0,token],[1,other],[2,vault]] as const){const fact=candidate(report,check.id,`data.assets[${index}].after`);assert.deepEqual(fact.fact.subject,{role:'token',value:at});assert.equal(strict(report,fact).score,88);}
 for(const field of ['data.assets[1].tokenId','data.assets[2].tokenId','data.assets[2].delta','data.simulationOnly']){const fact=candidate(report,check.id,field);assert.ok(!fact.admissible_dimensions.includes('exposure'));assert.throws(()=>strict(report,fact),/Structured dimension lacks relevant fact/);}
});

test('financial support uses a positive source/check/path table across all thirty profile labels',()=>{
 const shapes=[['rpc','token_identity'],['rpc','asset_balance_0'],['rpc','signature_exposure'],['rpc','nft_position_0_0'],['rpc','vault_context'],['rpc','vault_asset_context'],['rpc','lending_context'],['rpc','position_context'],['rpc','order_asset_0'],['rpc','transaction_base_fee'],['rpc','userop_fee'],['request','userop_request'],['isolated-fork','simulation_execution'],['isolated-fork','round_trip'],['isolated-fork','fork_vault_before'],['isolated-fork','fork_lending_after'],['isolated-fork','fork_authority_before'],['calldata/batch-v1','batch_child_0']];
 const metadata={...snapshot,simulationOnly:true,conditional:true,actualCostKnown:false,tokenFeesKnown:false,hasCode:true,codeHash:`0x${'a'.repeat(64)}`,identityVerified:false,token,owner,tokenId:'7',decimals:18,standard:'erc20',originalBuyPreserved:true,assetSame:true,assetUnitsSame:true,shareUnitsSame:true};
 let inspected=0;
 assert.equal(COVERAGE_PROFILES.length,30);
 for(const profile of COVERAGE_PROFILES)for(const [source,id] of shapes){
  const report=assess(request,[evidence(id,'pass','Synthetic collector metadata','Only inventory metadata is populated.',''+source,structuredClone(metadata))]);report.operation.category=profile.categories[0];
  for(const item of modelFactCandidates(report).candidates.filter(c=>c.fact.evidence_id===id)){
   // Current NFT ownership is the explicit address-valued financial exception.
   if(id==='nft_position_0_0'&&item.fact.field==='data.owner')continue;
   assert.ok(!item.admissible_dimensions.includes('exposure'),`${profile.id}/${id}/${item.fact.field}`);inspected++;
  }
 }
 assert.ok(inspected>5000,'The matrix must inspect the actual bounded candidate inventory, not one cherry-picked flag.');
 const fork:ForkProtocolState={category:'vault',phase:'before',target:vault,asset:token,subjects:{caller:owner,owner,receiver:owner},snapshot,values:{ownerSharesRaw:'100'},missing:[]};
 const report=assess(request,forkProtocolEvidence(fork,null));assert.throws(()=>strict(report,candidate(report,'fork_vault_before','data.simulationOnly')),/Structured dimension lacks relevant fact/);
 assert.equal(strict(report,candidate(report,'fork_vault_before','data.values.ownerSharesRaw')).score,88);
 for(const value of [null,true,'not-a-quantity','1e9','0x100','-1']){
  const malformed=assess(request,[evidence('chain_context','pass','Malformed synthetic quantity','A field name does not prove numeric units.','rpc',{...snapshot,nativeBalanceWei:value,targetHasCode:false})]),fact=candidate(malformed,'chain_context','data.nativeBalanceWei');
  assert.deepEqual(fact.admissible_dimensions,[]);assert.throws(()=>strict(malformed,fact),/Structured dimension lacks relevant fact|Dimension cites no relevant observation/);
 }
});

test('round-trip input, output and ratio facts do not merge token or native units',()=>{
 for(const inputUnit of ['token_raw','native_wei']){
  const report=assess(request,[evidence('round_trip','warning','Derived experiment','No future-sale guarantee.','isolated-fork',{...snapshot,inputToken:token,outputToken:other,inputUnit,bought:'20',returned:'95',declaredInputRaw:'100',requestedOutputRaw:'20',observedInputDebitRaw:'100',ratioInputRaw:'100',roundTripReturnPercent:95,originalBuyPreserved:true})]);
  for(const field of ['bought','requestedOutputRaw'])assert.deepEqual(candidate(report,'round_trip',`data.${field}`).fact.subject,{role:'asset',value:other});
  for(const field of ['returned','declaredInputRaw','observedInputDebitRaw','ratioInputRaw'])assert.deepEqual(candidate(report,'round_trip',`data.${field}`).fact.subject,{role:'asset',value:inputUnit==='native_wei'?'native':token});
  assert.deepEqual(candidate(report,'round_trip','data.roundTripReturnPercent').fact.subject,{role:'evidence',value:'round_trip'});
 }
});

test('pure provenance and unperformed-control flags cannot anchor any rated dimension or keep a number',()=>{
 const flags={simulationOnly:true,conditional:true,consumerVerified:false,actualCostKnown:false,tokenFeesKnown:false,safetyCertified:false,priceQuoteEstablished:false,implementationPolicyVerified:false,implementationChecked:false,executionContextVerified:false,abiShapeDecoded:false,codeAudited:false,assetSame:true,assetUnitsSame:true,shareUnitsSame:true,originalBuyPreserved:true,assumesOuterTransactionAccepted:true};
 const report=assess(request,[evidence('simulation_execution','pass','Synthetic completed run','The provenance flags do not establish any risk dimension.','isolated-fork',{...snapshot,status:'success',...flags})]);
 for(const key of Object.keys(flags)){
  const fact=candidate(report,'simulation_execution',`data.${key}`);assert.deepEqual(fact.admissible_dimensions,[],key);
  for(const dimension of AI_DIMENSIONS)assert.throws(()=>strict(report,fact,dimension),/Structured dimension lacks relevant fact|Dimension cites no relevant observation|Identity risk requires/,`${key}/${dimension}`);
 }
 const receipt=candidate(report,'simulation_execution','data.status');assert.deepEqual(receipt.admissible_dimensions,['execution']);assert.equal(strict(report,receipt,'execution').score,88,'An actual successful fork receipt remains a bounded execution observation, not financial exposure.');
});

test('decoded native, ERC20 transfer and canonical Permit quantities remain meaningful without RPC evidence',()=>{
 const native=assess({kind:'transaction',chainId:31337,transaction:{from:owner,to:other,data:'0x',value:'0x5'}},[]),nativeFact=candidate(native,'operation','operation.valueWei');
 assert.deepEqual(nativeFact.fact.subject,{role:'asset',value:'native'});assert.ok(nativeFact.admissible_dimensions.includes('exposure'));assert.equal(nativeFact.fact.value,'5');assert.equal(strict(native,nativeFact).score,88);
 const transfer=assess({...request,transaction:{...request.transaction,data:encodeFunctionData({abi:parseAbi(['function transfer(address,uint256)']),functionName:'transfer',args:[other,123n]})}},[]),amount=candidate(transfer,'operation','operation.amount');
 assert.deepEqual(amount.fact.subject,{role:'token',value:token});assert.equal(amount.fact.value,'123');assert.equal(strict(transfer,amount).score,88);
 const permitRequest:SecurityRequest={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'Unverified candidate',version:'1',chainId:31337,verifyingContract:token},primaryType:'Permit',types:{Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},message:{owner,spender:other,value:'456',nonce:'0',deadline:'2000000000'}}}};
 const permit=assess(permitRequest,[]),cap=candidate(permit,'operation','operation.value');assert.equal(cap.fact.value,'456');assert.deepEqual(cap.fact.subject,{role:'token',value:token});assert.equal(strict(permit,cap).score,88);
 // These are raw committed quantities, not a measured loss or an identity proof.
 for(const [r,f] of [[native,nativeFact],[transfer,amount],[permit,cap]] as const){assert.ok(!f.admissible_dimensions.includes('identity'));assert.equal(r.checks.filter(check=>check.source==='rpc').length,0);}
});

test('decoded financial fields stay category-aware and per-token, excluding ambiguous approvals and NFT Permit IDs',()=>{
 const ambiguous=assess(request,[]),ambiguousFact=candidate(ambiguous,'operation','operation.amountOrTokenId');assert.equal(ambiguous.operation.tokenStandard,'ambiguous');assert.ok(!ambiguousFact.admissible_dimensions.includes('exposure'));assert.throws(()=>strict(ambiguous,ambiguousFact),/Dimension cites no relevant observation/);
 const erc20=assess(request,[evidence('token_identity','pass','Observed standard candidate','Synthetic standard observation, not official identity.','rpc',{...snapshot,address:token,standard:'erc20',balance:'1000',decimals:6})]),allowance=candidate(erc20,'operation','operation.amountOrTokenId');assert.deepEqual(allowance.fact.subject,{role:'token',value:token});assert.equal(allowance.fact.value,'200');assert.equal(strict(erc20,allowance).score,88);
 const nftApproval=assess(request,[evidence('token_identity','pass','Observed NFT standard candidate','The same integer is an identifier, not token units.','rpc',{...snapshot,address:token,standard:'erc721'})]);assert.ok(!candidate(nftApproval,'operation','operation.amountOrTokenId').admissible_dimensions.includes('exposure'));
 const nftRequest:SecurityRequest={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'NFT candidate',version:'1',chainId:31337,verifyingContract:token},primaryType:'Permit',types:{Permit:[{name:'spender',type:'address'},{name:'tokenId',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},message:{spender:other,tokenId:'999999999',nonce:'0',deadline:'2000000000'}}}};
 const nft=assess(nftRequest,[]),id=candidate(nft,'operation','operation.tokenId');assert.equal(nft.operation.tokenStandard,'erc721');assert.ok(!id.admissible_dimensions.includes('exposure'));assert.throws(()=>strict(nft,id),/Dimension cites no relevant observation/);
 const batchRequest:SecurityRequest={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'Permit2 candidate',chainId:31337,verifyingContract:vault},primaryType:'PermitBatch',types:{PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],PermitBatch:[{name:'details',type:'PermitDetails[]'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]},message:{details:[{token,amount:'10',expiration:'2000000000',nonce:'0'},{token:other,amount:'20',expiration:'2000000000',nonce:'1'}],spender:vault,sigDeadline:'2000000000'}}}};
 const batch=assess(batchRequest,[]);
 for(const [index,asset,value] of [[0,token,'10'],[1,other,'20']] as const){const fact=candidate(batch,'operation',`operation.amounts[${index}]`);assert.equal(fact.fact.value,value);assert.deepEqual(fact.fact.subject,{role:'token',value:asset});assert.equal(strict(batch,fact).score,88);}
});
