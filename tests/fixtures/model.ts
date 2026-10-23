import {AI_DIMENSIONS,type SecurityRequest} from '../../src/security/types.js';
import {assess} from '../../src/security/rules.js';
import {evidence} from '../../src/security/evidence.js';
import {signatureStructure} from '../../src/security/signatures.js';
import {FACT_SCHEMA_VERSION,modelFactCandidates,type ModelFact} from '../../src/security/model-facts.js';
import type {SecurityReport} from '../../src/security/types.js';
export function modelDimensions(id='permission_scope'){return {evidence_confidence:'limited',dimensions:AI_DIMENSIONS.map(dimension=>({dimension,assessment:dimension==='authority'?'review':'unknown',reason:'固定测试输出，仅用于校验证据链。',evidence_ids:[...new Set([id,'operation'])]}))};}

/** Transport fixtures select exact candidate observations; tests of fact
 * validation deliberately construct and mutate their own structured outputs. */
type FixtureCitations={reasons:{evidence_ids:string[]}[];dimensions:{dimension:string;evidence_ids:string[]}[]};
type StructuredFixture<T extends FixtureCitations>=Omit<T,'reasons'|'dimensions'>&{
 fact_schema_version:typeof FACT_SCHEMA_VERSION;facts:ModelFact[];
 reasons:(T['reasons'][number]&{fact_ids:string[]})[];
 dimensions:(T['dimensions'][number]&{fact_ids:string[]})[];
};
export function structuredModelOutput<T extends FixtureCitations>(value:T,report:SecurityReport):StructuredFixture<T>{
 const candidates=modelFactCandidates(report).candidates,selected=new Map<string,ModelFact>();
 const reasons=value.reasons.map(reason=>{const candidate=candidates.find(item=>reason.evidence_ids.includes(item.fact.evidence_id)&&item.fact.field!=='status')??candidates.find(item=>reason.evidence_ids.includes(item.fact.evidence_id));if(candidate)selected.set(candidate.fact.id,candidate.fact);return {...reason,fact_ids:candidate?[candidate.fact.id]:[]};});
 const dimensions=value.dimensions.map(dimension=>{const candidate=candidates.find(item=>dimension.evidence_ids.includes(item.fact.evidence_id)&&item.admissible_dimensions.includes(dimension.dimension as any));if(candidate)selected.set(candidate.fact.id,candidate.fact);return {...dimension,fact_ids:candidate?[candidate.fact.id]:[]};});
 return {...value,fact_schema_version:FACT_SCHEMA_VERSION,facts:[...selected.values()],reasons,dimensions} as StructuredFixture<T>;
}
export function structuredFixtureFetcher(report:SecurityReport,fetcher:typeof fetch):typeof fetch{return async(url,init)=>{
 const response=await fetcher(url,init);if(!response.ok)return response;
 let envelope:any;try{envelope=await response.clone().json();}catch{return response;}
 if(envelope.status!=='completed'||!Array.isArray(envelope.output))return response;
 for(const message of envelope.output)for(const content of message.content??[])if(content.type==='output_text'){
  try{const value=JSON.parse(content.text);if(Array.isArray(value.reasons)&&Array.isArray(value.dimensions))content.text=JSON.stringify(structuredModelOutput(value,report));}catch{}
 }
 return new Response(JSON.stringify(envelope),{status:response.status,headers:response.headers});
};}

/** Synthetic evidence at a fixed public chain ID; this fixture performs no RPC. */
export function finitePermitReport(){
 const from='0x2222222222222222222222222222222222222222',token='0x1111111111111111111111111111111111111111',spender='0x3333333333333333333333333333333333333333';
 const request:SecurityRequest={kind:'signature',chainId:1,origin:'https://unverified.example',signature:{from,method:'eth_signTypedData_v4',data:{domain:{name:'Fixture token',version:'1',chainId:1,verifyingContract:token},primaryType:'Permit',types:{Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},message:{owner:from,spender,value:'100000000',nonce:'0',deadline:'2000000000'}}}};
 const structure=signatureStructure(request);
 return assess(request,[...structure,
  evidence('chain_context','pass','测试链上上下文','仅测试输入，不是实际公共网络读取。','rpc',{chainId:1,blockNumber:'200',blockTimestampSeconds:'1800000000',nativeBalanceWei:'1000000000000000000'}),
  evidence('token_identity','pass','测试代币余额','固定测试事实；接口不证明身份。','rpc',{token,standard:'erc20',decimals:6,balance:'5000000000'}),
  evidence('existing_allowance','pass','测试既有额度','当前额度不是新签名后的额度。','rpc',{token,owner:from,spender,amount:'0',decimals:6,blockNumber:'200'}),
  evidence('signature_nonce','pass','测试 nonce 匹配','只核对该区块状态。','rpc',{owner:from,verifyingContract:token,nonce:'0',declaredNonce:'0',blockNumber:'200'}),
  evidence('signature_domain','pass','测试 domain 匹配','不证明合约可信。','rpc',{expected:structure[0].data?.domainHash,observed:structure[0].data?.domainHash,blockNumber:'200'}),
  evidence('asset_simulation','unknown','未来签名消费未模拟','未来具体消费交易尚未提供。','coverage'),
  evidence('address_reputation','unknown','对方身份未核实','测试不查询外部信誉。','configuration'),
  evidence('website_reputation','unknown','来源身份未核实','测试不查询外部信誉。','configuration'),
  evidence('token_security','unknown','代币风险情报未取得','测试不查询外部情报。','configuration')
 ]);
}

export function finitePermitOutput(score:number|null){
 return {score,assessment:score===null?'unknown':'review',evidence_confidence:'limited',summary:'有限授权可按已知额度和余额评估；身份与未来用途仍未知。',
  dimensions:[
   {dimension:'authority',assessment:'review',reason:'有限额度且 nonce 与 domain 已核对匹配；截止日期不自动限制提交后的额度存续。',evidence_ids:['operation','permission_scope','signature_nonce','signature_domain']},
   {dimension:'exposure',assessment:'low',reason:'同币原始额度为 100000000，余额为 5000000000，decimals 为 6；额度相对有限。',evidence_ids:['operation','token_identity']},
   {dimension:'execution',assessment:'unknown',reason:'未模拟未来的具体签名消费交易。',evidence_ids:['asset_simulation','signature_effects']},
   {dimension:'identity',assessment:'unknown',reason:'未验证 spender 与来源的真实身份。',evidence_ids:['address_reputation','website_reputation']},
   {dimension:'protocol',assessment:'unknown',reason:'未取得代币安全与升级机制的完整证据。',evidence_ids:['token_security']},
   {dimension:'deception',assessment:'unknown',reason:'来源信誉未取得，现有可观察消息不能确认存在欺骗性来源不一致。',evidence_ids:['website_reputation']}
  ],reasons:[{text:'有限额度约为同币可见余额的 2%，不等于美元损失概率。',evidence_ids:['operation','token_identity']},{text:'nonce 与 domain 已核对匹配，不证明对方可信或未来用途安全。',evidence_ids:['signature_nonce','signature_domain']}],missing_data:[],suggested_action:'核对 spender 与用途；按需限定额度并检查签名后的授权。',honeypot:'unknown'};
}
