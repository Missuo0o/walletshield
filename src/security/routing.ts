import type { Operation, SecurityRequest, Evidence } from './types.js';
import type { SecurityConfig } from './config.js';
import { evidence } from './evidence.js';

/** A plan describes attempted tools, never claims that a query succeeded. */
export function planRequest(request:SecurityRequest,op:Operation,config?:SecurityConfig):Evidence {
  const tools:{tool:string;selected:boolean;purpose:string;available:boolean|null}[]=[];
  const add=(tool:string,selected:boolean,purpose:string,available:boolean|null=null)=>tools.push({tool,selected,purpose,available});
  add('rpc_context',true,'Verify network, block, balance, code and token interfaces',config?!!config.rpc[request.chainId||Number(op.fields.domainChainId??op.fields.chainId)]:null);
  add('contract_controls',request.kind==='transaction'||request.kind==='signature'&&!!op.fields.verifyingContract,'Read code hashes, proxy slots, owner and pause state; interfaces do not establish identity');
  add('isolated_simulation',request.kind==='transaction','Execute in an isolated fork and compare recognized asset changes',config?!!config.forkEnabled:null);
  add('call_trace',request.kind==='transaction','Try bounded debug_traceCall / trace_call at a verified primary snapshot; an optional dedicated endpoint must match its chain and block hash',config?!!config.rpc[request.chainId]:null);
  add('round_trip',['swap','swap_v3'].includes(op.category),'Buy then sell through selected V2 and eight canonical V3 single/path exact-input/output variants; unsupported routes remain unknown, with no guarantee of future exits',config?!!config.forkEnabled:null);
  add('signature_verification',request.kind==='signature','EIP-712 encoding, domain, selected Permit nonces and replay scope');
  add('login_envelope',op.category==='siwe','Inspect supported SIWE fields, URI/source binding and local time conditions; server nonce use and signature acceptance remain unknown');
  add('vault_preview',op.category==='vault','Read ERC-4626 underlying asset, shares, previews and limits');
  add('lending_account',op.category==='lending','Read Aave-style account health and collateral settings');
  add('account_authority',['account_control','account_execution'].includes(op.category),'Read selected owners, threshold, module state and authority target code at a pinned block; retain full-policy gaps');
  add('batch_structure',['batch','account_execution'].includes(op.category),'Inspect bounded nested multicall, account execution and MultiSend candidates without assuming authenticated execution context');
  add('position_context',op.category==='liquidity_v3','Read selected position ownership/liquidity interfaces and token units at a pinned block; no valuation or pool authentication');
  add('protocol_limits',['swap_v3','liquidity','liquidity_v3','withdrawal','staking','bridge','claim','mint_burn','control_change','account_control','account_execution','batch'].includes(op.category),'Retain unverified route, lockup, destination and internal-authority semantics');
  add('wallet_rpc_summary',['permission','user_operation','wallet_rpc'].includes(request.kind),'Extract allowlisted permission, session, smart-account and RPC fields without execution');
  add('source_verification',true,'Optional bounded cached source-match lookup on a fixed public service; not an audit or current-code comparison',config?!!config.sourceVerification:null);
  add('canonical_order',op.category==='order_signature','Decode bounded committed Seaport-shaped items and time conditions; verifier identity, authoritative counter/status and spending targets are not authenticated');
  add('permit2_witness',typeof op.fields.witnessType==='string','Retain committed witness type/hash, caps and nonce; custom consumer enforcement remains unverified');
  add('user_operation_context',request.kind==='user_operation','Inspect declared UserOperation fields, code and fee relations; no authenticated EntryPoint nonce/deposit or full account execution');
  add('delegation_authorizations',request.kind==='transaction'&&!!request.transaction.authorizationList?.length,'Recover EIP-7702 tuple authority, compare chain/nonce/code and conditional sequential eligibility; full set-code execution remains separate');
  add('bridge_scope',op.category==='bridge','Retain cross-chain execution limits; no endpoint, route or destination verification');
  add('external_intelligence',true,'Address, website, token and honeypot intelligence',config?config.lookups:null);
  add('ai_assessment',true,'Muse assesses obtained evidence and gaps; failures never fabricate a score',config?!!config.apiKey&&config.aiEnabled:null);
  return evidence('tool_plan','pass','Evidence collection plan','This is the tool plan, not successful observations. Check each result and failure. Unrecognized requests still enter analysis and are not safe by default.','router/0.4.0',{category:op.category,tools});
}
