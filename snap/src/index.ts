import {RUNTIME} from '../../src/runtime.generated';
import {providerContext} from './provider-context';
import type { OnHomePageHandler, OnTransactionHandler, OnSignatureHandler, OnRpcRequestHandler } from '@metamask/snaps-sdk';
import { Box, Heading, Text, Divider } from '@metamask/snaps-sdk/jsx';
import { NodeType, type Component, type Panel } from '@metamask/snaps-sdk';
import { coverageForCategory, ENTRY_LABELS, ENTRY_BOUNDARY, ADVICE_ONLY, DATA_BOUNDARY } from '../../src/security/coverage';
import { operationLines, missingLines, adviceLine } from '../../src/security/display';
import {unsupportedTransactionFields,normalizeAuthorizationList} from '../../src/security/transaction-fields';
const legacyPanel = (children: Component[]): Panel => ({ type: NodeType.Panel, children });
const legacyHeading = (value: string): Component => ({ type: NodeType.Heading, value });
const legacyText = (value: string): Component => ({ type: NodeType.Text, value });

declare const ethereum:{request:(request:{method:string})=>Promise<unknown>};
declare const snap:{request:(request:{method:string;params?:unknown})=>Promise<any>};
async function backendHeaders(){const state=await snap.request({method:'snap_manageState',params:{operation:'get'}});if(!state||!(/^[a-f0-9]{64}$/).test(state.backendToken??''))throw Error('Snap not paired');return {'Content-Type':'application/json',Authorization:`Bearer ${state.backendToken}`,...(typeof state.testSessionId==='string'&&/^[\da-f-]{36}$/.test(state.testSessionId)&&state.testSessionExpiresAt>Date.now()?{'X-WalletShield-Test-Session':state.testSessionId}:{})};}
export const onRpcRequest:OnRpcRequestHandler=async({origin,request})=>{
  if(!(RUNTIME.allowedOrigins as readonly string[]).includes(origin))throw Error('Unsupported origin or method');
  if(request.method==='walletshield_status'){const headers=await backendHeaders();return pairingStatus(headers.Authorization);}
  if(request.method==='walletshield_test_session'){
    const p=request.params as {id?:unknown}|undefined;if(!p||typeof p.id!=='string'||!/^[\da-f-]{36}$/.test(p.id))throw Error('Invalid test session');
    const state=await snap.request({method:'snap_manageState',params:{operation:'get'}});if(!state?.backendToken)throw Error('Snap not paired');
    await snap.request({method:'snap_manageState',params:{operation:'update',newState:{backendToken:state.backendToken,testSessionId:p.id,testSessionExpiresAt:Date.now()+10*60*1000}}});return {configured:true};
  }
  if(request.method!=='walletshield_configure')throw Error('Unsupported origin or method');
  const params=request.params as {token?:unknown}|undefined;if(!params||typeof params.token!=='string'||!(/^[a-f0-9]{64}$/).test(params.token))throw Error('Invalid pairing');
  const status=await pairingStatus(`Bearer ${params.token}`);await snap.request({method:'snap_manageState',params:{operation:'update',newState:{backendToken:params.token}}});return {configured:true,...status};
};

type Result = { operation?:string|{category:string;label:string;fields:Record<string,unknown>};missingData?:string[];score?: number | null; scoreSource?: string; ai?: { status: string; message: string;result?:{dimensions?:{dimension:string;assessment:string;reason:string;evidence_ids:string[]}[];evidence_confidence?:string;assessment?:'low'|'review'|'high'|'unknown';summary:string;suggested_action:string;missing_data?:string[];reasons:{text:string;evidence_ids:string[]}[]} }; id: string; source: 'rpc'; level: 'low' | 'review' | 'high' | 'unknown'; title: string; summary: string; complete: boolean; checks: { title: string; detail: string; status: string }[] };
const assessmentLabel={low:'No clear risk observed',review:'Review required',high:'High risk',unknown:'Unable to assess'};
const scoreExplanation='Muse independently assesses the observable request evidence; there are no fixed scores or floors. A low assessment or strong evidence support is not a safety guarantee. The combined warning preserves qualitative signals and unfinished request checks instead of using score bands.';
const dimensionNames:Record<string,string>={authority:'Authority',exposure:'Exposure',execution:'Execution',identity:'Identity',protocol:'Protocol',deception:'Deception'};
function dimensionLines(result:Result){return (result.ai?.result?.dimensions??[]).map(d=>`${dimensionNames[d.dimension]??d.dimension}: ${d.assessment==='not_applicable'?'Not applicable':assessmentLabel[d.assessment as keyof typeof assessmentLabel]??'Unknown'}. ${d.reason}`);}
function displayedChecks(checks:Result['checks']){const order:Record<string,number>={risk:0,warning:1,unknown:2,pass:3};return checks.map((check,index)=>({check,index})).sort((a,b)=>(order[a.check.status]??2)-(order[b.check.status]??2)||a.index-b.index).slice(0,24).map(v=>v.check);}
const API = `${RUNTIME.apiBase}/security/scan`;
async function pairingStatus(authorization:string){const response=await fetch(`${RUNTIME.apiBase}/security/pair/status`,{headers:{Authorization:authorization},signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('Backend pairing rejected');const value=await response.json();if(value?.paired!==true)throw Error('Invalid backend status');return {paired:true,...(typeof value.address==='string'?{address:value.address}:{}),expiresAt:value.expiresAt??null};}
function validResult(value: unknown): value is Result {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<Result>;
  if(r.score!==undefined&&r.score!==null&&(!Number.isInteger(r.score)||r.score<0||r.score>100))return false;
  if(r.ai&&(typeof r.ai.message!=='string'||r.ai.message.length>2000))return false;
  if(r.operation&&typeof r.operation!=='string'&&(typeof r.operation.category!=='string'||typeof r.operation.label!=='string'||!r.operation.fields||typeof r.operation.fields!=='object'))return false;
  if(r.missingData&&(!Array.isArray(r.missingData)||r.missingData.length>256||r.missingData.some(v=>typeof v!=='string'||v.length>1000)))return false;
  const ai=r.ai?.result;
  if(ai?.assessment!==undefined&&!['low','review','high','unknown'].includes(ai.assessment))return false;
  if(ai&&(typeof ai.summary!=='string'||ai.summary.length>1600||typeof ai.suggested_action!=='string'||ai.suggested_action.length>1000||!Array.isArray(ai.reasons)||ai.reasons.length>12||ai.reasons.some(reason=>typeof reason.text!=='string'||reason.text.length>500)))return false;
  if(ai?.missing_data&&(!Array.isArray(ai.missing_data)||ai.missing_data.length>256||ai.missing_data.some(v=>typeof v!=='string'||v.length>1000)))return false;
  if(ai?.dimensions&&(!Array.isArray(ai.dimensions)||ai.dimensions.length!==6||ai.dimensions.some(d=>typeof d.dimension!=='string'||typeof d.assessment!=='string'||typeof d.reason!=='string'||d.reason.length>500)))return false;
  return typeof r.id === 'string' && r.source === 'rpc' && ['low', 'review', 'high', 'unknown'].includes(r.level ?? '') &&
    typeof r.title === 'string' && typeof r.summary === 'string' && typeof r.complete === 'boolean' && Array.isArray(r.checks) && r.checks.length <= 256 &&
    r.checks.every(c => typeof c.title === 'string' && typeof c.detail === 'string' && typeof c.status === 'string');
}
export const onTransaction: OnTransactionHandler = async ({ transaction, chainId, transactionOrigin }) => {
  try {
    const numericChain = Number(chainId.split(':')[1]);
    if (!chainId.startsWith('eip155:') || !Number.isSafeInteger(numericChain) || numericChain <= 0) throw new Error('UNSUPPORTED_CHAIN');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 85000);
    let response: Response;
    const feeFields:Record<string,string>={};
    for(const key of ['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce']){const value=(transaction as unknown as Record<string,unknown>)[key];if(typeof value==='string'&&/^0x[\da-f]{1,64}$/i.test(value))feeFields[key]=value;}
    const raw=transaction as unknown as Record<string,unknown>;const unsupportedFields=unsupportedTransactionFields(raw);
    const authorizationList=normalizeAuthorizationList(raw.authorizationList);
    const type=typeof raw.type==='number'&&Number.isSafeInteger(raw.type)&&raw.type>=0?`0x${raw.type.toString(16)}`:typeof raw.type==='string'&&/^0x[\da-f]{1,64}$/i.test(raw.type)?raw.type:undefined;
    try {
      response = await fetch(API, { method: 'POST', headers: await backendHeaders(), signal: controller.signal,
        body: JSON.stringify({ kind: 'transaction', chainId: numericChain, transaction: { from: transaction.from, to: transaction.to ?? null, data: transaction.data ?? '0x', value: transaction.value ?? '0x0',...feeFields,...(type?{type}:{}),...(authorizationList?{authorizationList}:{}),...(unsupportedFields.length?{unsupportedFields}:{}) }, ...(transactionOrigin ? { origin: transactionOrigin } : {}) }) });
    } finally { clearTimeout(timer); }
    if (!response.ok) throw new Error('API_FAILED');
    const result: unknown = await response.json();
    if (!validResult(result)) throw new Error('INVALID_RESPONSE');
    const operation=typeof result.operation==='object'?result.operation:undefined;
    const coverage=coverageForCategory(operation?.category),missing=missingLines(result);
    return {
      content: Box({ children: [Heading({ children: `WalletShield · ${result.title}` }),
        Text({ children: result.score === undefined || result.score === null ? 'No AI score. Review the evidence and unfinished checks.' : `${result.scoreSource === 'ai' ? 'AI risk indicator' : 'Historical rule score'}: ${result.score}/100 (not a loss probability)` }), Text({children:scoreExplanation}),Text({ children: result.ai?.message ?? 'Review the scope of the checks.' }),
        ...(result.ai?.result?.assessment?[Text({children:`Model assessment: ${assessmentLabel[result.ai.result.assessment]}`})]:[]),
        ...(result.ai?.status==='completed'&&result.ai.result?[Text({children:result.ai.result.summary}),...result.ai.result.reasons.map(r=>Text({children:r.text})),Text({children:adviceLine(result.ai.result.suggested_action)})]:[]),...dimensionLines(result).map(line=>Text({children:line})),Text({ children: result.summary }), Divider({}),
        Heading({children:'Scope of this analysis'}),Text({children:operation?.label??'Operation category unavailable'}),Text({children:coverage.scope}),
        ...operationLines(operation).map(line=>Text({children:line})),
        Text({children:`Still unverified: ${coverage.uncertain}`}),
        ...(missing.total?[Heading({children:`Unfinished checks (${missing.total})`}),...missing.items.map(title=>Text({children:title})),...(missing.total>6?[Text({children:'Open this report in the workbench for all missing checks and evidence.'})]:[])]:[]),
        ...(result.checks.length>24?[Text({children:`${result.checks.length} evidence items; showing up to 24, prioritizing risks and unknowns. Open the workbench report for all evidence.`})]:[]),...displayedChecks(result.checks).map(check => Box({ children: [Heading({ children: check.title }), Text({ children: check.detail })] })),
        Divider({}), Text({ children: `Report: ${result.id}` }),
        Text({ children: `Completeness: ${result.complete ? 'Supported checks completed' : 'Some checks are unfinished'}` }),
        Text({children:DATA_BOUNDARY}),Text({ children: ADVICE_ONLY })] }),
      ...(result.level === 'high' || result.level === 'unknown' ? { severity: 'critical' as const } : {})
    };
  } catch {
    return { severity: 'critical', content: Box({ children: [Heading({ children: 'WalletShield · Unable to assess' }),
      Text({ children: 'The service is unavailable, the network is not configured, or the request could not be processed. An unfinished check does not establish safety.' }),
      Text({ children: 'The security check did not complete. Verify the operation and decide in the wallet whether to reject it.' })] }) };
  }
};
export const onSignature: OnSignatureHandler = async ({ signature, signatureOrigin }) => {
  try {
    // This hook does not provide the active wallet chain. A typed domain's
    // claimed chain must not be presented as independently verified context.
    const chainId = 0;
    const observed=await providerContext(typeof ethereum==='undefined'?undefined:ethereum);
    const response = await fetch(API, { method: 'POST', headers: await backendHeaders(), signal: AbortSignal.timeout(85000),
      body: JSON.stringify({ kind: 'signature', chainId, signature: { from: signature.from, method: signature.signatureMethod, data: signature.data,...(observed?{providerContext:observed}:{}) }, ...(signatureOrigin ? { origin: signatureOrigin } : {}) }) });
    if (!response.ok) throw new Error('API_FAILED');
    const result: unknown = await response.json();
    if (!validResult(result)) throw new Error('INVALID_RESPONSE');
    const operation=typeof result.operation==='object'?result.operation:undefined;
    const coverage=coverageForCategory(operation?.category),missing=missingLines(result);
    return { severity: 'critical', content: legacyPanel([legacyHeading(`WalletShield · ${result.title}`),
      legacyText(result.summary), legacyText(result.score === undefined || result.score === null ? 'No AI score.' : `${result.scoreSource === 'ai' ? 'AI risk indicator' : 'Historical rule score'}: ${result.score}/100 (not a loss probability)`),legacyText(scoreExplanation),
      ...(result.ai?.result?.assessment?[legacyText(`Model assessment: ${assessmentLabel[result.ai.result.assessment]}`)]:[]),
      legacyText(result.ai?.message ?? 'A message signature can authorize later asset operations.'),
      ...(result.ai?.status==='completed'&&result.ai.result?[legacyText(result.ai.result.summary),...result.ai.result.reasons.map(r=>legacyText(r.text)),legacyText(adviceLine(result.ai.result.suggested_action))]:[]),
      ...dimensionLines(result).map(legacyText),legacyHeading('Scope of this analysis'),legacyText(operation?.label??'Operation category unavailable'),legacyText(coverage.scope),...operationLines(operation).map(legacyText),legacyText(`Still unverified: ${coverage.uncertain}`),
      ...(missing.total?[legacyHeading(`Unfinished checks (${missing.total})`),...missing.items.map(legacyText),...(missing.total>6?[legacyText('Open this report in the workbench for all missing checks and evidence.')]:[])]:[]),
      ...(result.checks.length>24?[legacyText(`${result.checks.length} evidence items; showing up to 24, prioritizing risks and unknowns. Open the workbench report for all evidence.`)]:[]),...displayedChecks(result.checks).flatMap(check => [legacyHeading(check.title), legacyText(check.detail)]),
      legacyText(DATA_BOUNDARY),legacyText(`Report: ${result.id}. ${ADVICE_ONLY}`)]) };
  } catch { return { severity: 'critical', content: legacyPanel([legacyHeading('WalletShield · Unable to assess'), legacyText('The signature check did not complete. A message may authorize future spending; verify its purpose.')]) }; }
};
export const onHomePage: OnHomePageHandler = async () => ({ content: Box({ children: [
  Heading({ children: 'WalletShield 0.4.1' }),Text({children:'Pre-sign checks include transfers as well as permissions and message signatures.'}),
  Heading({children:'Automatic entry and partial coverage'}),Text({children:ENTRY_BOUNDARY}),
  Text({children:'Analysis paths cover native/token/NFT transfers, approvals and revocations, selected swaps, and personal/login/Permit signatures.'}),
  Text({children:'Selected lending, vault and authority checks can compare state before and after an isolated execution. Identity, reference-price and bridge-route evidence needs maintained operator configuration. Missing reads and unsupported protocol behavior remain explicit; a successful scenario is not future safety.'}),
  Heading({children:'Currently requires explicit submission'}),Text({children:`${ENTRY_LABELS.manual}: permissions/sessions, smart accounts, network configuration, read-only and other wallet RPCs. This Snap does not intercept every operation.`}),
  Text({children:'Unrecognized requests stay unknown. Non-EVM chains, other wallet integrations, device/key compromise and exchange internals are not covered.'}),
  Text({children:'Scores are not loss probabilities. A saved key does not prove model connectivity. If AI fails, evidence and unknowns remain without a score.'}),
  Text({children:DATA_BOUNDARY}),Text({children:ADVICE_ONLY}),
  Text({ children: `Workbench: ${RUNTIME.appOrigin}` })
] }) });
