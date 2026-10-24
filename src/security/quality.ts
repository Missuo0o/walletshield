import type {EvidenceQuality,SecurityReport} from './types.js';
import {SCORING_POLICY} from './scoring-policy.js';

/** This is an evidence inventory, not a risk score or confidence percentage.
 * Observation time is when our collector recorded a result, not the upstream
 * provider's data age. Block timestamps are reported separately. */
export function evidenceQuality(report:SecurityReport):EvidenceQuality {
 const reference=Date.parse(report.createdAt);
 const now=Number.isFinite(reference)?reference:Date.now();
 const claimed=Number(report.operation.fields.domainChainId??report.operation.fields.chainId),expectedChain=report.request.chainId||(Number.isSafeInteger(claimed)&&claimed>0?claimed:undefined);
 const counts={pass:0,warning:0,risk:0,unknown:0};
 const sources=new Map<string,{source:string;observed:number;unknown:number}>();
 const stale:string[]=[],future:string[]=[],missing:string[]=[];
 const blockFreshness:NonNullable<EvidenceQuality['blockFreshness']>={staleCheckIds:[],futureCheckIds:[],missingTimestampCheckIds:[],missingHashCheckIds:[],unverifiedChainCheckIds:[],localCheckIds:[],maxAgeSeconds:300,futureToleranceSeconds:30};
 const snapshots:EvidenceQuality['snapshots']=[];
 const blocks=new Map<string,Set<string>>();
 const hashes=new Map<string,Set<string>>();
 for(const check of report.checks){
  counts[check.status]++;
  const source=sources.get(check.source)??{source:check.source,observed:0,unknown:0};
  check.status==='unknown'?source.unknown++:source.observed++;sources.set(check.source,source);
  const timestamp=Date.parse(check.observedAt);
  if(!Number.isFinite(timestamp))missing.push(check.id);
  else if(timestamp>now+30000)future.push(check.id);
  else if(now-timestamp>300000)stale.push(check.id);
  const data=check.data;if(!data)continue;
  const block=data.blockNumber??data.baseBlock;
  if(typeof block!=='string'||!/^\d+$/.test(block))continue;
  const chain=typeof data.chainId==='number'&&Number.isSafeInteger(data.chainId)&&data.chainId>0?data.chainId:undefined;
  const blockHash=typeof data.blockHash==='string'&&/^0x[\da-f]{64}$/i.test(data.blockHash)?data.blockHash:undefined;
  const timestampSeconds=typeof data.blockTimestampSeconds==='string'&&/^\d+$/.test(data.blockTimestampSeconds)?data.blockTimestampSeconds:undefined;
  snapshots.push({checkId:check.id,source:check.source,blockNumber:block,...(chain?{chainId:chain}:{}),...(blockHash?{blockHash}:{}),...(timestampSeconds?{blockTimestampSeconds:timestampSeconds}:{})});
  if(report.source!=='demo'&&(check.source==='rpc'||check.source==='isolated-fork')){
   if(chain===31337&&expectedChain===31337)blockFreshness.localCheckIds.push(check.id);
   else {
    if(!chain||!expectedChain||chain!==expectedChain)blockFreshness.unverifiedChainCheckIds.push(check.id);
    if(!blockHash)blockFreshness.missingHashCheckIds.push(check.id);
    if(!timestampSeconds)blockFreshness.missingTimestampCheckIds.push(check.id);
    else {const delta=BigInt(Math.floor(now/1000))-BigInt(timestampSeconds);if(delta>300n)blockFreshness.staleCheckIds.push(check.id);else if(delta< -30n)blockFreshness.futureCheckIds.push(check.id);}
   }
  }
  // An isolated fork's mined blocks are a different state space. Never merge
  // them with upstream blocks, even when the configured chain ID is identical.
  if(chain&&check.source==='rpc'){const set=blocks.get(String(chain))??new Set<string>();set.add(block);blocks.set(String(chain),set);
   if(blockHash){const key=`${chain}:${block}`,seen=hashes.get(key)??new Set<string>();seen.add(blockHash.toLowerCase());hashes.set(key,seen);}
  }
 }
 const mixed=[...blocks].filter(([,set])=>set.size>1).map(([chain])=>Number(chain));
 const conflicts=[...hashes].filter(([,set])=>set.size>1).map(([key,set])=>({chainId:Number(key.split(':')[0]),blockNumber:key.split(':')[1],hashes:[...set]}));
 const caveats=[
  'Counts describe collected checks, not detection accuracy or a confidence percentage.',
  'A recorded observation time is not a guarantee of provider freshness; examine its block and source.',
  'Independent interface failures preserve other observed facts only when the related snapshot verifies consistently; missing or changed headers discard all state-derived conclusions in that group.',
  'pinnedRpc prefers canonical block-hash selectors. Numeric confirmed-state groups verify complete chain/header state before and after collection and discard the related state group if verification fails. This is not a global atomic snapshot or proof of provider honesty, and fork execution is distinct from upstream and future state.',
  'Structured fact support is field-specific: a sender balance is not a recipient balance, and network, address, code-hash, NFT-ID or unit metadata is not financial exposure merely because the same collector returned a balance.'
 ];
 if(report.checks.some(check=>check.source==='isolated-fork'))caveats.push('Current isolated-fork collection requires a final canonical source-chain/header recheck after execution and derived experiments; failure discards the entire fork group. Earlier trace success does not verify later execution. Historical reports do not acquire this verification retroactively.');
 if(report.ai.status==='completed'&&report.ai.result&&report.ai.result.scoringPolicy!==SCORING_POLICY)caveats.push('This saved model result uses an older or unstated scoring policy. Reading its evidence does not re-score it or certify it under the current field-bound validation policy.');
 if(report.request.kind==='signature'&&!report.request.chainId)caveats.push('The signature hook did not supply a request-bound network. A domain or separate provider snapshot does not establish it.');
 if(stale.length)caveats.push('Some observations were recorded more than five minutes before report creation; this is a freshness flag, not a risk-score threshold.');
 if(future.length||missing.length)caveats.push('Some observation timestamps are missing, invalid, or more than 30 seconds ahead of report creation.');
 if(mixed.length)caveats.push('At least one network has observations from different upstream blocks; do not assume one atomic snapshot.');
 if(conflicts.length)caveats.push('Conflicting block hashes were observed at the same chain and height. Reorganization or inconsistent provider data requires a fresh independent check.');
 if(blockFreshness.localCheckIds.length)caveats.push('Local-chain timestamps can be artificial; local tests do not establish public-chain freshness.');
 if(blockFreshness.staleCheckIds.length||blockFreshness.futureCheckIds.length)caveats.push('Some public-chain block timestamps are stale or ahead of the report clock. A recently recorded RPC response does not establish current upstream state.');
 if(blockFreshness.missingTimestampCheckIds.length||blockFreshness.missingHashCheckIds.length||blockFreshness.unverifiedChainCheckIds.length)caveats.push('Some block observations lack a verified timestamp, block hash or chain identity; upstream freshness is not established.');
 return {computedAt:new Date(now).toISOString(),counts,sources:[...sources.values()].sort((a,b)=>a.source.localeCompare(b.source)),snapshots,
  freshness:{staleCheckIds:stale,futureCheckIds:future,missingTimestampCheckIds:missing,staleAfterSeconds:300,futureToleranceSeconds:30},blockFreshness,mixedBlockChains:mixed,conflictingBlockHashes:conflicts,
  capture:report.capture?.channel??'unattributed',walletBinding:report.capture?.wallet?'authenticated-credential':'not-established',caveats};
}
