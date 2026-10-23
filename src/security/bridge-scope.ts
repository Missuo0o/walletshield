import type {Evidence,Operation,SecurityRequest} from './types.js';
import {evidence} from './evidence.js';

/** Bridge parameters remain decodable, but this tool makes no cross-chain
 * requests or endpoint/route validation claims. Generic source-chain checks
 * and fork execution are collected separately for the original transaction. */
export function bridgeScopeEvidence(request:SecurityRequest,op:Operation):Evidence[]{
 if(request.kind!=='transaction'||op.category!=='bridge')return [];
 return [evidence('bridge_scope','unknown','Cross-chain execution is outside this assessment','Only decoded request fields and applicable source-chain observations are analyzed. Bridge endpoint identity, counterpart contracts, message/proof validity, relay context, reserves, finality and destination receipt are not verified. No destination chain is inferred from names or supplied addresses.','coverage',{requestChainId:request.chainId,endpointValidationPerformed:false,routeValidationPerformed:false,arrivalProven:false,relayContextVerified:false,proofVerified:false})];
}
