import type {SecurityConfig} from './config.js';
import type {SecurityRequest} from './types.js';
import type {SwapExperiment} from './swap-experiments.js';
import type {ForkSession} from './simulation.js';

/** Literal sender recipients support V2 native/token and V3 token experiments.
 * Removed deployment configuration cannot re-enable V3 native-funding or router
 * recipient-sentinel interpretations. A WETH9() getter alone proves neither. */
export async function swapFundingBinding(request:Extract<SecurityRequest,{kind:'transaction'}>,experiment:SwapExperiment,_config:SecurityConfig,_fork:ForkSession,_at:'base'|'current'='base'):Promise<{allowed:boolean;reason?:string;native:boolean;binding?:Record<string,unknown>}> {
 const literal=experiment.recipient.toLowerCase()===request.transaction.from.toLowerCase();
 if(!literal)return {allowed:false,native:experiment.nativeInput,reason:'Only a literal sender recipient is supported. Router sentinel aliases and other recipients are not interpreted or impersonated.'};
 if(experiment.variant==='v2')return {allowed:true,native:experiment.nativeInput};
 if(experiment.nativeInput)return {allowed:false,native:true,reason:'V3 native-funded dependent buy/sell experiments are unsupported. Router or wrapped-native identity and funding semantics are not inferred from addresses, symbols or getters; generic original-request fork simulation remains separate.'};
 return {allowed:true,native:false};
}
