import { z } from 'zod';
import {UNSUPPORTED_TRANSACTION_FIELDS} from './transaction-fields.js';
import type { Level, Check } from '../core/types.js';
import type {ModelFact} from './model-facts.js';
const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const hex = z.string().max(30000).regex(/^0x(?:[\da-fA-F]{2})*$/);
const quantity=z.string().regex(/^0x[\da-fA-F]{1,64}$/);
const chain = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const common = { chainId: chain, origin: z.string().max(512).optional() };
const authorization=z.object({chainId:quantity,address,nonce:quantity,yParity:quantity.refine(value=>BigInt(value)<=1n),r:quantity,s:quantity}).strict();
export const requestSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('transaction'), transaction: z.object({ from: address, to: address.nullable().optional(), data: hex, value: quantity.optional(),gas:quantity.optional(),gasPrice:quantity.optional(),maxFeePerGas:quantity.optional(),maxPriorityFeePerGas:quantity.optional(),nonce:quantity.optional(),type:quantity.optional(),authorizationList:z.array(authorization).max(16).optional(),unsupportedFields:z.array(z.enum(UNSUPPORTED_TRANSACTION_FIELDS)).max(UNSUPPORTED_TRANSACTION_FIELDS.length).optional() }).strict() }).strict(),
  z.object({ ...common, kind: z.literal('signature'), chainId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), signature: z.object({ from: address, method: z.enum(['personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4']), providerContext:z.object({chainId:chain,observedAt:z.iso.datetime(),source:z.literal('snap-provider')}).strict().optional(), data: z.union([z.string().max(16000), z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown())).max(64)]) }).strict() }).strict(),
  z.object({ ...common, kind: z.enum(['permission', 'user_operation', 'wallet_rpc']), method: z.string().min(1).max(100), params: z.union([z.record(z.string(), z.unknown()),z.array(z.unknown()).max(64)]) }).strict()
]);
export type SecurityRequest = z.infer<typeof requestSchema>;
export type Operation = { category: string; label: string; decoded: boolean; fields: Record<string, string | boolean | string[]>; targets: string[]; token?: string; tokenStandard?: 'erc20' | 'erc721' | 'erc1155' | 'ambiguous'; addsPermission?: boolean; rawSigning?: boolean; complex?: boolean };
export type Evidence = Check & { source: string; observedAt: string; data?: Record<string, unknown> };
export const AI_DIMENSIONS=['authority','exposure','execution','identity','protocol','deception'] as const;
export type AIDimension={dimension:typeof AI_DIMENSIONS[number];assessment:'low'|'review'|'high'|'unknown'|'not_applicable';reason:string;evidence_ids:string[];fact_ids?:string[]};
export type AIResult = { scoringPolicy?:string;fact_schema_version?:'walletshield-facts-v1';facts?:ModelFact[];dimensions?:AIDimension[]; evidence_confidence?:'limited'|'moderate'|'strong'; score: number | null; assessment: 'low' | 'review' | 'high' | 'unknown'; summary: string; reasons: { text: string; evidence_ids: string[];fact_ids?:string[] }[]; missing_data: string[]; suggested_action: string; honeypot: 'unknown' | 'risk_indicator' | 'no_known_indicator'; model: string; generatedAt: string; usage?: { input_tokens: number; output_tokens: number } };
export type AIState = { status: 'pending' | 'not_configured' | 'disabled' | 'not_applicable' | 'completed' | 'failed'; message: string; result?: AIResult; failureKind?:'validation'|'transport'|'response'|'budget'|'input'; attempts?:number; repaired?:boolean };
export type EvidenceQuality={computedAt:string;counts:Record<'pass'|'warning'|'risk'|'unknown',number>;sources:{source:string;observed:number;unknown:number}[];
 snapshots:{checkId:string;source:string;chainId?:number;blockNumber:string;blockHash?:string;blockTimestampSeconds?:string}[];
 freshness:{staleCheckIds:string[];futureCheckIds:string[];missingTimestampCheckIds:string[];staleAfterSeconds:number;futureToleranceSeconds:number};mixedBlockChains:number[];conflictingBlockHashes?:{chainId:number;blockNumber:string;hashes:string[]}[];
 blockFreshness?:{staleCheckIds:string[];futureCheckIds:string[];missingTimestampCheckIds:string[];missingHashCheckIds:string[];unverifiedChainCheckIds:string[];localCheckIds:string[];maxAgeSeconds:number;futureToleranceSeconds:number};
 capture:'paired-snap'|'workbench'|'unattributed';walletBinding:'authenticated-credential'|'not-established';caveats:string[]};
export type SecurityReport = {
  quality?:EvidenceQuality;
  assessmentScope?:AssessmentScope;
  capture?:{channel:'paired-snap'|'workbench';wallet?:string;pairingId?:string};
  id: string; createdAt: string; source: 'rpc' | 'demo'; request: SecurityRequest; operation: Operation;
  level: Level; title: string; summary: string; complete: boolean; checks: Evidence[];
  /** Only present in historical reports; never used to calculate or constrain new AI scores. */
  ruleScoreFloor?: number | null; score: number | null; scoreSource: 'ai' | 'rules' | 'none';
  ai: AIState; missingData: string[]; fingerprint: string; version: 'security/0.2.0' | 'security/0.3.0' | 'security/0.4.0' | 'security/0.4.1-ai-evidence';
};
export type AssessmentScope={policy:'observable-request-v1';label:string;criticalUnknownCheckIds:string[];criticalMissingData:string[];boundary:string};
export const COVERAGE = [
  ['Native transfer', 'Read state; optional isolated execution, gas and native deltas'],
  ['ERC-20 / NFT transfers', 'Decode common transfers; shared selectors require token-standard observations'],
  ['Approvals and revocations', 'ERC-20, individual NFT approval, NFT operators and on-chain Permit2 limits'],
  ['Swaps and batches', 'Selected V2 routes and eight canonical token-funded V3 variants support bounded isolated buy/sell tests; V3 native/sender aliases, opaque routes and silent assets remain partial'],
  ['Lending / vaults / staking / liquidity', 'Selected current and actual fork pre/post state, units and candidate pool observations; identity and future outcomes remain unverified'],
  ['Bridges / claims / control changes', 'Selected source-request fields and generic source-chain effects; no endpoint/counterpart validation or proof of settlement, future control or project legitimacy'],
  ['Message signatures', 'Encoding, selected Permit/Permit2 nonce and domain reads; future consumption remains unknown'],
  ['Token and address risk', 'Optional bounded GoPlus observations for up to eight decoded tokens and eight counterparties; missing fields, truncation and failed queries remain unknown'],
  ['Permissions / smart accounts / unknown RPC', 'Explicit integration; UserOperation parameter/code/fee and conditional EIP-7702 tuple evidence; no maintained EntryPoint state or universal Snap interception'],
  ['Devices / secrets / exchanges', 'Device malware, leaked keys and custodial-exchange internals are outside scope'],
  ['Post-sign monitoring / enforcement', 'Not provided; pre-sign advice with the user deciding in the wallet'],
  ['Chain support', 'EVM requests need configured RPC; Bitcoin and Solana are not integrated']
] as const;
