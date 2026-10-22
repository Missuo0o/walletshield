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
  add('round_trip',op.category==='swap','Buy then sell through a supported V2 route; no guarantee of future exits',config?!!config.forkEnabled:null);
  add('signature_verification',request.kind==='signature','EIP-712 encoding, domain, selected Permit nonces and replay scope');
  add('login_envelope',op.category==='siwe','Inspect supported SIWE fields, URI/source binding and local time conditions; server nonce use and signature acceptance remain unknown');
  add('vault_preview',op.category==='vault','Read ERC-4626 underlying asset, shares, previews and limits');
  add('lending_account',op.category==='lending','Read Aave-style account health and collateral settings');
  add('protocol_limits',['swap_v3','liquidity','staking','bridge','claim','mint_burn','control_change','batch'].includes(op.category),'Retain unverified route, lockup, destination and internal-authority semantics');
  add('wallet_rpc_summary',['permission','user_operation','wallet_rpc'].includes(request.kind),'Extract allowlisted permission, session, smart-account and RPC fields without execution');
  add('external_intelligence',true,'Address, website, token and honeypot intelligence',config?config.lookups:null);
  add('ai_assessment',true,'Muse assesses obtained evidence and gaps; failures never fabricate a score',config?!!config.apiKey&&config.aiEnabled:null);
  return evidence('tool_plan','pass','Evidence collection plan','This is the tool plan, not successful observations. Check each result and failure. Unrecognized requests still enter analysis and are not safe by default.','router/0.4.0',{category:op.category,tools});
}
