import {AI_DIMENSIONS,type AIDimension,type Evidence,type SecurityReport} from './types.js';

type Dimension=typeof AI_DIMENSIONS[number];
export type CitedStatement={text:string;evidence_ids:string[]};
const rules=(c:Evidence)=>/^rules(?:\/|$)/.test(c.source);
const actual=(c:Evidence)=>c.status!=='unknown'&&c.id!=='tool_plan';
const matches=(id:string,pattern:RegExp)=>pattern.test(id);
const protocolCategories=new Set(['swap','swap_v3','liquidity','liquidity_v3','vault','lending','staking','bridge','bridge_finalize','claim','wrap','withdrawal','control_change','account_control','account_execution','batch']);
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const unique=(values:unknown[])=>[...new Set(values.filter(address).map(value=>value.toLowerCase()))];
function intelligenceScope(report:SecurityReport){
 const op=report.operation,chain=report.request.chainId||Number(op.fields.domainChainId??op.fields.chainId);
 const scope=report.checks.find(check=>check.id==='intelligence_scope'&&check.source==='coverage'&&check.data?.chainId===chain);
 const values=(key:string)=>Array.isArray(scope?.data?.[key])?scope!.data![key] as unknown[]:[];
 return {chain,scope,tokens:unique([op.token,...['token','tokenIn','tokenOut','asset','localToken'].map(key=>op.fields[key]),...(['tokens','path'].flatMap(key=>Array.isArray(op.fields[key])?op.fields[key] as string[]:[])),...values('tokenCandidates')]),targets:unique([...op.targets,report.request.kind==='transaction'?report.request.transaction.to:undefined,...values('counterpartyCandidates')])};
}
export function boundIntelligence(check:Evidence,report:SecurityReport):boolean{
 if(check.source!=='goplus')return false;
 const scope=intelligenceScope(report);
 if(/^token_security(?:_0x[\da-f]{40})?$/i.test(check.id))return address(check.data?.token)&&check.data?.chainId===scope.chain&&scope.tokens.includes(check.data.token.toLowerCase())&&(check.id==='token_security'||check.id.toLowerCase()===`token_security_${check.data.token.toLowerCase()}`);
 if(/^address_0x[\da-f]{40}$/i.test(check.id))return address(check.data?.address)&&check.data?.chainId===scope.chain&&scope.targets.includes(check.data.address.toLowerCase())&&check.id.toLowerCase()===`address_${check.data.address.toLowerCase()}`;
 if(check.id==='website_reputation'){try{return typeof check.data?.origin==='string'&&check.data.origin===new URL(report.request.origin??'').origin;}catch{return false;}}
 return false;
}
export function tokenIntelligence(report:SecurityReport){
 const {tokens,scope}=intelligenceScope(report);
 const facts=report.checks.filter(check=>/^token_security(?:_0x[\da-f]{40})?$/i.test(check.id)&&actual(check)&&boundIntelligence(check,report));
 const risk=facts.some(check=>check.data?.is_honeypot==='1'||check.data?.cannot_sell_all==='1');
 const scopeGap=report.operation.fields.truncated===true||scope?.status==='unknown'||scope?.data?.deadlineReached===true||Number(scope?.data?.omittedTokens??0)>0||Array.isArray(scope?.data?.batchGaps)&&scope!.data!.batchGaps.length>0;
 const allNegative=tokens.length>0&&!scopeGap&&tokens.every(token=>facts.some(check=>String(check.data?.token).toLowerCase()===token&&check.data?.is_honeypot==='0'&&check.data?.cannot_sell_all==='0'&&(!Array.isArray(check.data?.missing)||check.data.missing.length===0)));
 return {tokens,facts,risk,allNegative,scopeGap:Boolean(scopeGap)};
}
const bit=(value:unknown)=>value==='0'||value==='1';
const addressRiskFlags=['cybercrime','money_laundering','phishing_activities','stealing_attack','honeypot_related_address','blackmail_activities','sanctioned'];
const tokenControls=['is_proxy','transfer_pausable','is_blacklisted','slippage_modifiable','owner_change_balance','hidden_owner','can_take_back_ownership','is_mintable'];
export function adverseIdentityEvidence(check:Evidence,report:SecurityReport):boolean{
 if(!actual(check)||check.status!=='risk'||!boundIntelligence(check,report))return false;
 if(check.id==='website_reputation')return check.data?.phishing_site==='1';
 if(check.id.startsWith('address_')){const flags=check.data?.flags;return Boolean(flags&&typeof flags==='object'&&addressRiskFlags.some(key=>(flags as Record<string,unknown>)[key]==='1'));}
 return check.data?.is_honeypot==='1'||check.data?.cannot_sell_all==='1';
}

/** A server-owned admissibility table, not a numeric model. A real ID is not
 * automatically evidence for every dimension. These are bounded observation
 * families: code presence or a matching domain never authenticates a protocol. */
export function dimensionsForEvidence(check:Evidence,report:SecurityReport):Dimension[]{
 if(!actual(check))return [];
 const id=check.id,out=new Set<Dimension>();const add=(...values:Dimension[])=>values.forEach(value=>out.add(value));
 if(rules(check)){
  if(id==='operation'&&report.operation.decoded){add('authority');if(protocolCategories.has(report.operation.category))add('protocol');}
  if(matches(id,/^(?:permission_scope|raw_signing|transfer_authority|account_authority|control_authority|approval_standard|permit2_expiration_zero|expired_(?:deadline|sigDeadline|expiration|login))$/))add('authority');
  if(matches(id,/^(?:fee_budget|fee_bounds|approval_native_value|over_balance|transfer_over_balance|zero_recipient|self_transfer)$/))add('exposure');
  if(matches(id,/^(?:signature_chain_mismatch|signer_mismatch|login_(?:domain|origin|uri)|zero_recipient)$/))add('identity','deception');
  if(matches(id,/^(?:login_structure|login_lifetime|login_time_.+)$/))add('authority','deception');
  if(id==='contract_recipient')add('execution');
  if(matches(id,/^position_(?:assets|ticks|minimum_\d+)$/))add('protocol');
 }
 if(check.source==='rpc'){
  if(id==='chain_context'){
   if(typeof check.data?.nativeBalanceWei==='string')add('exposure');
   if(typeof check.data?.targetHasCode==='boolean')add('execution');
   if(report.request.chainId&&check.data?.chainId===report.request.chainId&&check.data?.claimedNetwork!==true)add('identity');
  }
  if(matches(id,/^(?:asset_balance_\d+|signature_exposure(?:_\d+)?|nft_position_\d+_\d+)$/)||matches(id,/^(?:token_identity|asset_identity_\d+)$/)&&typeof check.data?.balance==='string')add('exposure');
  if(matches(id,/^(?:token_identity|asset_identity_\d+)$/))add('protocol');
  if(matches(id,/^(?:existing_allowance(?:_\d+)?|permit2_allowance(?:_\d+)?|nft_operator_\d+|signature_nft_state|account_(?:owners|threshold|module|threshold_change))$/))add('authority');
  if(matches(id,/^signature_nonce(?:_\d+)?$/))add('authority','execution');
  if(id==='signature_domain')add('authority','identity');
  if(matches(id,/^(?:signature_(?:owner_binding|network_context|provider_difference))$/))add('identity','deception');
  if(matches(id,/^(?:signature_(?:deadline|authorization_window|nft_interface)|contract_controls|new_controller|vault_(?:context|asset_context|limit)|lending_context|liquidation_risk|position_.+)$/))add('protocol');
  if(matches(id,/^(?:vault_(?:context|asset_context|limit)|lending_context|liquidation_risk|position_.+|native_balance)$/))add('exposure');
  if(matches(id,/^(?:signature_(?:signer_account|verifier_code|delegate_code)|delegated_account|target_delegate_code|account_(?:code|authority_code_\d+)|contract_controls|new_controller)$/))add('authority','protocol');
  if(matches(id,/^(?:basic_call|transaction_nonce|transaction_pending_nonce|transaction_base_fee)$/))add('execution');
  if(id==='call_trace'&&check.data?.traceAvailable===true)add('execution');
  if(id==='transaction_base_fee')add('exposure');
  if(matches(id,/^(?:order_status|order_counter|order_authorization_state|order_time|order_deployment)$/))add('authority','execution','protocol');
  if(id==='order_domain')add('authority');
  if(/^order_asset_\d+$/.test(id))add('authority','exposure','protocol');
  if(matches(id,/^(?:userop_nonce|delegation_sender_nonce|delegation_state_\d+|delegation_sequence)$/))add('authority','execution');
  if(matches(id,/^(?:userop_deposit|userop_fee)$/))add('exposure','execution');
  if(matches(id,/^(?:userop_entrypoint|userop_(?:sender|factory|paymaster)_code|delegation_target_\d+)$/))add('authority','protocol','execution');
 }
 if(check.source==='eip712'){
  if(matches(id,/^(?:typed_structure|signature_scope|signature_validation|signature_protocol)$/))add('authority');
  if(matches(id,/^(?:signature_owner_binding|signature_network_context|signature_provider_difference)$/))add('identity','deception');
  if(matches(id,/^(?:order_structure|permit2_witness_structure)$/))add('authority','protocol');
  if(id==='order_offer_owner')add('authority','identity');
  if(id==='order_zero_recipient')add('authority','exposure','protocol');
 }
 if(check.source==='isolated-fork'){
  if(id==='call_trace_fork'&&check.data?.traceAvailable===true)add('execution');
  if(id==='simulation_execution')add('execution','exposure','authority','protocol');
  if(matches(id,/^(?:round_trip|unexpected_asset_loss|excess_token_spend|excess_native_spend)$/))add('execution','exposure','protocol');
  if(/^fork_(?:vault|lending)_(?:before|after|change|health)$/.test(id))add('execution','exposure','protocol');
  if(/^fork_authority_(?:before|after|change)$/.test(id))add('authority','execution','protocol');
 }
 if(check.source==='goplus'&&boundIntelligence(check,report)){
  if(id==='website_reputation'&&bit(check.data?.phishing_site))add('identity','deception');
  const flags=check.data?.flags;
  if(matches(id,/^address_0x[\da-f]{40}$/i)&&flags&&typeof flags==='object'&&addressRiskFlags.some(key=>bit((flags as Record<string,unknown>)[key])))add('identity','deception');
  if(matches(id,/^token_security(?:_0x[\da-f]{40})?$/i)){
   if(tokenControls.some(key=>bit(check.data?.[key])))add('authority','protocol');
   if(['is_honeypot','cannot_sell_all'].some(key=>bit(check.data?.[key]))||['buy_tax','sell_tax'].some(key=>typeof check.data?.[key]==='string'&&/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(String(check.data![key]))))add('exposure','protocol');
   if(adverseIdentityEvidence(check,report))add('identity','deception');
  }
 }
 if(check.source==='calldata/batch-v1'&&matches(id,/^(?:batch_structure|batch_child_[\d_]+)$/)){
  add('authority','protocol');if(check.data?.valueWei!==null&&check.data?.valueWei!==undefined)add('exposure');
 }
 if(check.source==='sourcify'&&/^registry_source_\d+$/.test(id)&&['exact_match','match'].includes(String(check.data?.runtimeMatch)))add('identity','protocol');
 if(check.source==='request'&&['userop_request','delegation_envelope'].includes(id))add('authority','exposure');
 if(check.source==='signature'&&/^delegation_signature_\d+$/.test(id))add('authority','identity');
 if(check.source==='request'&&id==='bridge_finalization_caller')add('authority','protocol');
 return AI_DIMENSIONS.filter(value=>out.has(value));
}
export function evidenceAdmissibility(report:SecurityReport){return report.checks.map(check=>({evidence_id:check.id,dimensions:dimensionsForEvidence(check,report)}));}
export function validateDimensionEvidence(dimensions:readonly AIDimension[],report:SecurityReport){
 const checks=new Map(report.checks.map(check=>[check.id,check]));
 if(dimensions.some(d=>!['unknown','not_applicable'].includes(d.assessment)&&!d.evidence_ids.some(id=>{const check=checks.get(id);return check&&dimensionsForEvidence(check,report).includes(d.dimension);})))throw Error('Dimension cites no relevant observation');
}

type BoundedFact='fork_execution'|'fork_sale'|'basic_call';
function boundedFacts(check:Evidence):BoundedFact[]{
 if(!actual(check))return [];
 if(check.source==='isolated-fork'&&check.id==='simulation_execution'&&check.status==='pass'&&check.data?.status==='success')return ['fork_execution'];
 if(check.source==='isolated-fork'&&check.id==='round_trip'&&['pass','warning'].includes(check.status)&&typeof check.data?.returned==='string'&&/^\d+$/.test(check.data.returned)&&BigInt(check.data.returned)>0n)return ['fork_sale'];
 if(check.source==='rpc'&&check.id==='basic_call'&&check.status==='pass')return ['basic_call'];
 return [];
}
export function claimSupport(report:SecurityReport){return {officialIdentity:false,securityAudit:false,guaranteedSafety:false,futureExecution:false,futureSellability:false,usdLoss:false,boundedObservations:report.checks.flatMap(check=>boundedFacts(check).map(kind=>({evidence_id:check.id,kind}))),boundary:'Only the listed bounded observations can be reported as completed. Source matching is not a security audit. Observations are not official identity, future guarantees, dollar loss or a safety certificate.'};}

/** Keep a qualifier attached to the assertion it governs. A modal on another
 * predicate ("may receive tokens and is safe") and advice after a fact must not
 * turn that fact into uncertainty. This is a bounded grammar guard, not a
 * general natural-language entailment engine. */
function certaintyParts(sentence:string):{text:string;nonAssertion:boolean}[]{
 const result:{text:string;nonAssertion:boolean}[]=[];
 let condition=false,governed=false,continuation=false;
 for(const raw of sentence.split(/([,，]|\b(?:and|or|but|however|because|since|although|yet)\b|但是|但|因为|由于|并且|而且)/gi)){
  if(!raw.trim())continue;
  if(/^(?:and|or|并且|而且)$/i.test(raw)){continuation=true;continue;}
  if(/^(?:[,，]|but|however|because|since|although|yet|但是|但|因为|由于)$/i.test(raw)){condition=false;governed=false;continuation=false;continue;}
  const text=raw.trim();
  const conditional=/^(?:(?:only|even)\s+)?(?:if|unless|provided(?:\s+that)?|assuming(?:\s+that)?)\b|^(?:如果|若)/i.test(text);
  const advice=/^(?:(?:you|users?)\s+(?:should|must)\s+)?(?:(?:please\s+)?(?:check|verify|confirm|determine|ensure|inspect|avoid|never\s+assume)\b|do\s+not\s+(?:assume|treat|consider|rely)\b)|^(?:请|不要(?:认为|假设|视为|依赖))/i.test(text);
  const uncertain=/^(?:(?:perhaps|possibly|allegedly)\b|(?:there\s+is\s+)?no\s+(?:evidence|proof)\s+(?:that|whether)\b|(?:we|i|you|one)\s+(?:cannot|can't)\s+(?:confirm|guarantee|establish|prove)\b|it\s+is\s+not\s+(?:known|proven|established|confirmed)\s+(?:that|whether)\b)|^(?:是否|可能|无法(?:确认|保证|证明)|未(?:确认|证明)|声称|宣称)/i.test(text);
  // A repeated subject introduces an independent finite assertion. Omitted
  // predicates may continue an imperative; a conditional antecedent may have
  // multiple subjects, but ends at a comma or an explanatory/contrast clause.
  const independent=/^(?:(?:the|this|that|these|those|a|an)\s+)?(?:it|they|you|we|funds|assets|tokens?|execution|transactions?|transfers?|recipients?|spenders?|contracts?|verifiers?|websites?|protocols?|addresses|address|collections?|sources?)\b|^(?:该|此|这个|那个)?(?:合约|收款方|网站|协议|地址|交易|资金|资产|代币)/i.test(text);
  const inherited:boolean=continuation&&(condition||governed&&!independent);
  condition=conditional||continuation&&condition;
  governed=advice||uncertain||inherited;
  result.push({text,nonAssertion:condition||governed});
  continuation=false;
 }
 return result;
}
function locallyQualified(part:string,index:number):boolean{
 const prefix=part.slice(0,index);
 // The modal must govern this predicate, not merely occur elsewhere in the
 // sentence. "should know ... is official" still asserts official identity.
 return /\b(?:may|might|could)\s+(?:(?:be|have|been|being|possibly|perhaps|potentially|considered|regarded|as|a|an|the)\s+)*$/i.test(prefix)
  || /\b(?:claims?|claimed|alleged)\s+(?:that\s+)?(?:(?:the|this|that|it|they)\s+)?$/i.test(prefix)
  || /\b(?:whether|if)\s+(?:(?:the|this|that|it|a|an)\s+)?$/i.test(prefix);
}

/** Explicit high-impact certainty assertions receive an additional bounded
 * guard. This is deliberately not advertised as universal language proof.
 * Unsupported paraphrases still require adversarial evaluation. */
export function validateCertaintyClaims(statements:readonly CitedStatement[],report:SecurityReport){
 const checks=new Map(report.checks.map(check=>[check.id,check]));
 for(const statement of statements)for(const sentence of statement.text.matchAll(/[^。！？；;.!?\n]+[。！？；;.!?\n]?/g)){
  if(/[?？]$/.test(sentence[0])&&(/^\s*(?:who|what|where|when|why|how|is|are|was|were|can|could|will|would|does|do|has|have|should|whether)\b/i.test(sentence[0])||/(?:吗|么|是否)[?？]$/.test(sentence[0])))continue;
  for(const {text:part,nonAssertion} of certaintyParts(sentence[0])){
   const denied=(index:number)=>/\b(?:not|never|no|cannot|can't|isn't|aren't|wasn't|weren't)\s+(?:(?:a|an|necessarily|fully|independently|currently|yet|been|be|being|considered|known|proven|confirmed|established|guaranteed|possible|safe|to)\s+)*$/i.test(part.slice(0,index))||/(?:不|未|无法|不能|并非|没有|不等于|并不代表|不代表|不是|不保证|不能证明|不意味着)(?:能|被|已|经|确认|证明|保证)*$/.test(part.slice(0,index));
   const hazards=[
    /\b(?:guaranteed\s+(?:safe|secure|safety|execution|success)|(?:completely|entirely|totally|provably)\s+safe|risk[ -]?free|(?:no|zero)\s+(?:risk|chance\s+of\s+loss)|(?:funds|assets|tokens?)\s+(?:cannot|can't|will\s+not)\s+(?:be\s+)?(?:lost|stolen|drained)|(?:is|are)\s+(?:safe|secure|trustworthy|trusted)(?:\s+to\s+(?:sign|proceed))?|(?:is|are)\s+not\s+a\s+honeypot|honeypot[ -]free)\b|绝对安全|完全安全|毫无风险|没有(?:任何)?风险|(?:资金|资产)(?:绝对)?不会(?:损失|被盗|丢失)/gi,
    /\b(?:(?:verified|authenticated|confirmed|known)\s+(?:as\s+)?(?:the\s+)?(?:official|legitimate|authentic)|(?:recipient|spender|contract|verifier|protocol|website|address|collection|token|source)\s+(?:is|are|was|has\s+been|belongs\s+to)\s+(?:the\s+)?(?:official|officially\s+(?:verified|authenticated|confirmed)|trusted|legitimate|authentic|verified)|(?:is|are|was|were|has\s+been|have\s+been)\s+(?:the\s+)?(?:official|officially\s+(?:verified|authenticated|confirmed)|legitimate|authentic)|verified\s+(?:recipient|spender|verifier|protocol|website|collection|identity))\b|(?:已(?:经)?(?:确认|验证|认证).{0,8}(?:官方|可信|真实身份))|(?:合约|收款方|网站|协议|地址)(?:是|属于)(?:官方|可信)/gi,
    /\b(?:(?:has|have)\s+(?:passed|completed|undergone)\s+(?:an?\s+)?(?:(?:independent|external|formal|security|source[ -]code)\s+)*audits?|(?:is|are|was|were|has\s+been|have\s+been)\s+(?:(?:independently|externally|formally|fully|security)\s+)*audited|(?:security|source[ -]code)\s+audit\s+(?:(?:has|have)\s+)?(?:passed|succeeded|completed)|audit\s+(?:is|was|has\s+been)\s+(?:completed|passed|successful))\b|已(?:经)?(?:通过|完成|接受).{0,10}(?:安全|代码|合约)审计|(?:合约|代码|协议).{0,4}已(?:经)?(?:审计|安全认证)/gi,
    /\b(?:(?:will|always|guaranteed\s+to)\s+(?:be\s+)?(?:sell|sold|sellable|withdraw)|(?:can\s+(?:always\s+)?be\s+sold|sellability\s+is\s+guaranteed)|(?:can|will)\s+sell\s+(?:anytime|any\s+time|later|in\s+the\s+future)|(?:execution|transaction|transfer)\s+(?:is\s+)?guaranteed|(?:will|must)\s+(?:succeed|execute\s+successfully)|(?:will|can)\s+never\s+(?:fail|revert)|will\s+not\s+(?:fail|revert)|cannot\s+revert)\b|(?:保证|永远|随时|未来一定).{0,8}(?:卖出|出售|提现|执行成功)|(?:交易|执行|转账)(?:保证|一定|必定)(?:成功|执行)/gi,
    /(?:\b(?:USD|dollar|dollars|US\$)\s+(?:loss|losses|value\s+lost)|\b(?:loss|losses|lose|lost)\b.{0,35}(?:\bUSD\b|\bdollars?\b|US\$|\$\s*\d)|\$\s*\d.{0,25}\b(?:loss|lost)\b)|(?:美元|美金)(?:损失|亏损)|(?:损失|亏损).{0,15}(?:美元|美金)/gi
   ];
   for(const pattern of hazards)for(const match of part.matchAll(pattern))if(!nonAssertion&&!locallyQualified(part,match.index!)&&!denied(match.index!)){
    const tail=part.slice(match.index!+match[0].length);
    if(/^\s*(?:(?:is|are|remains?)\s+)?(?:unknown|uncertain|unverified|unconfirmed|unproven|unavailable|not\s+(?:known|proven|verified|quantifiable|established)|cannot\s+be\s+(?:quantified|confirmed|proven|guaranteed))\b|^(?:未知|无法(?:确定|量化|确认|证明)|尚未(?:验证|确认))/.test(tail))continue;
    // A bounded simulated sale is reportable only with a positive observed
    // return and matching local citations, never with future/always language.
    const sale=/\b(?:sell|sold|sellable)\b/i.test(match[0]);
    const scoped=/\b(?:fork|simulation|simulated|observed\s+(?:test|run)|at\s+block)\b/i.test(part);
    const future=/\b(?:always|forever|guaranteed|future|later|anytime|any\s+time)\b/i.test(part);
    if(sale&&scoped&&!future&&statement.evidence_ids.some(id=>{const check=checks.get(id);return check&&boundedFacts(check).includes('fork_sale');}))continue;
    throw Error('Unsupported certainty claim');
   }
   const execution=/\b(?:execution|transaction|transfer|simulation|eth_call|fork)\b.{0,45}\b(?:succeeded|executed\s+successfully|completed\s+successfully|was\s+successful)\b|(?:已执行成功|交易已成功)/gi;
   for(const match of part.matchAll(execution))if(!nonAssertion&&!locallyQualified(part,match.index!)&&!denied(match.index!)){
    const kind:BoundedFact=/\beth_call\b/i.test(part)?'basic_call':'fork_execution';
    if(kind==='fork_execution'&&!/\b(?:fork|simulation|simulated)\b/i.test(part))throw Error('Unsupported bounded observation claim');
    if(!statement.evidence_ids.some(id=>{const check=checks.get(id);return check&&boundedFacts(check).includes(kind);}))throw Error('Unsupported bounded observation claim');
   }
  }
 }
}
