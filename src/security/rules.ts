import { createHash, randomUUID } from 'node:crypto';
import { zeroAddress } from 'viem';
import { LEVELS, type Level } from '../core/types.js';
import type { Evidence, Operation, SecurityReport, SecurityRequest } from './types.js';
import { evidence } from './providers.js';
import { decodeRequest } from './decode.js';
import { planRequest } from './routing.js';
import {loginEvidence} from './siwe.js';
export function assess(request:SecurityRequest, collected:Evidence[], source:'rpc'|'demo'='rpc'):SecurityReport {
  const op:Operation=decodeRequest(request);
  const checks:Evidence[]=[];
  checks.push(...loginEvidence(request,op));
  const add=(id:string,status:Evidence['status'],title:string,detail:string)=>checks.push(evidence(id,status,title,detail,'rules/0.3.0'));
  if(collected.some(c=>c.id==='typed_structure'&&c.status==='unknown')){op.decoded=false;op.complex=true;}
  if(op.fields.previewTruncated===true||op.fields.truncated===true)add('extraction_limit','unknown','Request summary is truncated','Display or extraction reached its resource limit; unread content is not checked.');
  const token=collected.find(e=>e.id==='token_identity'&&e.status==='pass')?.data;
  if(op.category==='approval') {
    if(token?.standard==='erc20') {
      op.tokenStandard='erc20'; op.addsPermission=op.fields.amountOrTokenId!=='0';
      op.label=op.addsPermission?'ERC-20 token approval':'Revoke ERC-20 approval';
    } else if(token?.standard==='erc721') {
      op.tokenStandard='erc721';op.addsPermission=op.targets[0]?.toLowerCase()!==zeroAddress;
      op.label=op.addsPermission?'Single-NFT approval':'Revoke single-NFT approval';
      delete op.fields.unlimited;
    } else {op.addsPermission=true; add('approval_standard','unknown','Approval semantics are unverified','ERC-20 amounts and ERC-721 token IDs share the approve encoding. NFT ID zero is not automatically revocation.');}
  }
  if(op.category==='asset_transfer_from'&&(token?.standard==='erc20'||token?.standard==='erc721')){
    op.tokenStandard=token.standard;
    op.label=token.standard==='erc20'?'Delegated ERC-20 transfer':'Delegated single-NFT transfer';
  }
  add('operation',op.decoded?'pass':'unknown',op.label,op.decoded?'Common parameters were decoded; an ABI shape does not authenticate the target protocol.':'This request is not fully understood and cannot be marked as checked successfully.');
  if(op.addsPermission) add('permission_scope',op.category==='operator_approval'||op.fields.unlimited===true?'risk':'warning','Asset authority is requested',op.category==='operator_approval'?'The operator can manage the relevant NFTs in this collection.':'The authority may permit future asset movement; finite limits and gasless signatures can still carry risk.');
  if(op.rawSigning) add('raw_signing','risk','Raw signing risk','Raw data does not establish signing purpose; asset authority or replay risk may be involved.');
  if(op.category==='transfer_authorization')add('transfer_authority','warning','A single transfer authorization is requested','If the signature is valid and the candidate implements the stated standard, the signed recipient may receive the signed token amount under the nonce and time conditions. This is not a standing allowance; signature acceptance and actual consumption remain unverified.');
  if(op.category==='account_control')add('account_authority',op.addsPermission||['remove_guard','remove_fallback_handler'].includes(String(op.fields.authorityChange))?'risk':'warning','Smart-account control may change','Owner, threshold, module, guard or handler changes can alter who controls the account or remove protections. Removal is not automatically safe; ABI compatibility does not authenticate the wallet or its enforcement. A changed threshold is not by itself proof of malicious intent.');
  if(op.category==='liquidity_v3'){
    if(op.fields.token0&&op.fields.token0===op.fields.token1)add('position_assets','warning','Position assets are identical','The declared pair has the same address twice; confirm the intended manager and assets.');
    if(typeof op.fields.tickLower==='string'&&typeof op.fields.tickUpper==='string'&&BigInt(op.fields.tickLower)>=BigInt(op.fields.tickUpper))add('position_ticks','warning','Position tick range is inconsistent','The lower tick is not below the upper tick. Tick spacing, prices and pool identity remain unverified.');
    for(const i of [0,1]){const min=op.fields[`amount${i}Min`],desired=op.fields[`amount${i}Desired`];if(typeof min==='string'&&typeof desired==='string'&&BigInt(min)>BigInt(desired))add(`position_minimum_${i}`,'warning','Position minimum exceeds desired amount','The quantities are for the same declared asset; this checks internal bounds, not market price or appropriate slippage.');}
  }
  if(op.category==='control_change')add('control_authority','risk','Contract control may change','Independently verify the new controller, role and implementation; only selected control methods are interpreted.');
  if(request.kind==='transaction'){
    const tx=request.transaction,price=tx.maxFeePerGas??tx.gasPrice;
    if(tx.unsupportedFields?.length)add('unsupported_transaction_fields','unknown','Unsupported execution fields',`Unparsed fields: ${tx.unsupportedFields.join(', ')}. A substitute transaction omitting these fields cannot prove execution.`);
    if(tx.maxPriorityFeePerGas&&tx.maxFeePerGas&&BigInt(tx.maxPriorityFeePerGas)>BigInt(tx.maxFeePerGas))add('fee_bounds','warning','Priority fee exceeds the fee cap','Fee parameters are inconsistent and may prevent execution; review them in the wallet.');
    if(tx.gas&&price){const maximum=BigInt(tx.gas)*BigInt(price);const balance=collected.find(c=>c.id==='chain_context')?.data?.nativeBalanceWei;
      checks.push(evidence('fee_budget',typeof balance==='string'&&/^\d+$/.test(balance)&&maximum+BigInt(tx.value??'0x0')>BigInt(balance)?'warning':'pass','Maximum execution fee budget','Gas limit multiplied by the price cap is a maximum execution budget, not actual fees. Some L2 surcharges and market pricing are unverified.','rules/0.4.0',{maximumExecutionFeeWei:String(maximum)}));
    }else add('fee_budget','unknown','Fee parameters are incomplete','A gas limit or unit price is missing. The final wallet fee needs review.');
  }
  if(op.complex) add('internal_effects','unknown','Internal effects are not fully covered','Swaps, bridges, lending, staking, orders and batches require protocol semantics and complete asset simulation.');
  if(request.kind==='signature') {
    add('signature_effects','unknown','Future signature use is unverified','A third party can submit the signature later. This inspection neither executes that transaction nor proves future assets cannot move.');
    if(!request.chainId) add('signature_chain','unknown','Request-bound wallet network unavailable','The signature hook did not supply a request-bound chain ID; the active network must not be guessed.');
    const domainChain=String(op.fields.domainChainId||op.fields.chainId||'');
    if(domainChain && request.chainId && /^(?:\d+|0x[\da-f]+)$/i.test(domainChain) && BigInt(domainChain)!==BigInt(request.chainId)) add('signature_chain_mismatch','risk','Signed chain differs from request chain','Review the EIP-712 or login network.');
    const owner=op.fields.owner;
    if(typeof owner==='string'&&/^0x[\da-f]{40}$/i.test(owner)&&owner.toLowerCase()!==request.signature.from.toLowerCase()) add('signer_mismatch','risk','Message account differs from signer','Verify the signing subject; do not assume this is an ordinary approval or login.');
    if(op.category==='siwe' && request.origin) {
      try { if(new URL(request.origin).host.toLowerCase()!==String(op.fields.domain).toLowerCase()) add('login_domain','risk','Login domain differs from source','This may authorize login to another website.'); } catch { add('login_domain','unknown','Source domain could not be verified','The declared login domain could not be compared.'); }
    }
  }
  if(op.category==='siwe' && typeof op.fields.expiration==='string' && op.fields.expiration) {
    const expires=Date.parse(op.fields.expiration);
    if(Number.isFinite(expires)&&expires<Date.now()) add('expired_login','warning','Login message has expired','An expired message must not be treated as valid login authorization.');
  }
  for(const key of ['deadline','sigDeadline','expiration']) {
    const value=op.fields[key];
    if(key==='expiration'&&op.category==='permit2_approval'&&value==='0') {add('permit2_expiration_zero','warning','Permit2 expiration is zero','Standard Permit2 interprets zero as the submission block time and can allow same-block use; it is not already expired or automatically revoked.');continue;}
    const chainTime=collected.find(c=>c.id==='chain_context')?.data?.blockTimestampSeconds;
    const verifiedTime=typeof chainTime==='string'&&/^\d+$/.test(chainTime);
    if(typeof value==='string'&&/^\d+$/.test(value)&&BigInt(value)<BigInt(verifiedTime?chainTime:Math.floor(Date.now()/1000))) add(`expired_${key}`,'warning','Request deadline has passed',`${key} according to ${verifiedTime?'the queried block clock':'the local clock (chain clock unverified)'} has passed; expiration does not authenticate the source.`);
  }
  if(op.category==='native_transfer' && collected.some(e=>e.id==='chain_context'&&e.data?.targetHasCode===true)) add('contract_recipient','warning','Recipient can execute contract code','Empty-calldata receipt may execute fallback or receive code; this is not necessarily an ordinary account transfer.');
  if(typeof op.fields.recipient==='string'&&op.fields.recipient.toLowerCase()===zeroAddress) add('zero_recipient','risk','Zero-address recipient','A zero-address transfer may cause permanent loss or burning. Authority revocations are distinct from asset transfers.');
  if(request.kind==='transaction' && request.transaction.to?.toLowerCase()===request.transaction.from.toLowerCase()) add('self_transfer','warning','Target equals sender','Confirm this is an intended self-transfer or smart-account action.');
  if(request.kind==='transaction' && op.addsPermission && BigInt(request.transaction.value??'0x0')!==0n) add('approval_native_value','risk','Approval carries native value','The request includes native spending as well as authority changes.');
  if(op.category==='approval' && op.fields.amountOrTokenId && token?.standard==='erc20' && typeof token.balance==='string' && /^\d+$/.test(String(op.fields.amountOrTokenId))) {
    if(BigInt(String(op.fields.amountOrTokenId))>BigInt(token.balance)) add('over_balance','warning','Approval exceeds current balance','Future incoming amounts of this token may also be covered.');
  }
  if(['token_transfer','asset_transfer_from'].includes(op.category)&&token?.standard==='erc20'&&typeof token.balance==='string'&&/^\d+$/.test(token.balance)){
    const amount=op.category==='asset_transfer_from'?op.fields.amountOrTokenId:op.fields.amount;
    if(typeof amount==='string'&&/^\d+$/.test(amount)&&BigInt(amount)>BigInt(token.balance))add('transfer_over_balance','warning','Transfer exceeds the observed owner balance','The declared transfer amount exceeds this token balance at the queried block. The operation does not grant new approval or authority over future deposits; state changes and nonstandard token behavior remain unverified.');
  }
  if(request.context?.withdrawalFee)add('withdrawal_fee','risk','Payment demanded before withdrawal','The user reports a pay-before-withdrawal demand, a fraud indicator needing review rather than a verified accusation.');
  if(request.context?.guaranteedProfit)add('guaranteed_profit','warning','User reports guaranteed returns','An ordinary transfer or contract call cannot establish promised returns; verify independently.');
  if(request.context?.requestedBy==='stranger')add('stranger_request','warning','Request prompted by a stranger','Independently verify the address, website and purpose.');
  add('fraud_context','unknown','Off-chain purpose is unverified','Ordinary tokens and successful transfers can be used in social-engineering scams. User context is an unverified statement, not platform identity or business authenticity.');
  if(!collected.some(c=>c.id==='tool_plan'))checks.push(planRequest(request,op));
  checks.push(...collected);
  const hasRisk=checks.some(c=>c.status==='risk'), incomplete=checks.some(c=>c.status==='unknown');
  const level:Level=hasRisk?'high':incomplete?'unknown':checks.some(c=>c.status==='warning')?'review':'low';
  return {id:randomUUID(),createdAt:new Date().toISOString(),source,request,operation:op,level,title:LEVELS[level].label,
    summary:`${op.label}. ${hasRisk?'Observed risk indicators need priority review. ':''}${incomplete?'Unfinished checks remain; this is not a safety confirmation.':LEVELS[level].action}`,
    complete:!incomplete,checks,score:null,scoreSource:'none',ai:{status:'not_configured',message:'The model has not run. No AI score; rules provide qualitative signals and gaps only.'},
    missingData:checks.filter(c=>c.status==='unknown').map(c=>c.title),fingerprint:createHash('sha256').update(JSON.stringify(request)).digest('hex'),version:'security/0.4.1-ai-evidence'};
}
