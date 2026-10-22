import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {getAddress,recoverMessageAddress} from 'viem';
import {z} from 'zod';
import type {Store,WalletAuthToken} from './store.js';

export type WalletPrincipal={address:string;id:string;kind:'web'|'snap';expiresAt:string};
export type WalletAuthOptions={origin:string;enabled:boolean;now?:()=>number};
export const WALLET_AUTH_LIMITS={challengePerMinute:6,challengePerAddress:3,verifyPerMinute:12,globalPerMinute:120,maxPending:256} as const;
export const SNAP_PAIRING_LIMITS={addressPerMinute:4,ipPerMinute:12,globalPerMinute:60,maxPerAddress:4,maxGlobal:8192} as const;
export class PairingLimitError extends Error{constructor(){super('Snap pairing capacity or issuance limit reached. Wait one minute or revoke unused pairings before retrying. No existing pairing was changed.');this.name='PairingLimitError';}}
const CHALLENGE_TTL=5*60*1000,WEB_TTL=8*60*60*1000,SNAP_TTL=30*24*60*60*1000;
const addressSchema=z.string().regex(/^0x[\da-f]{40}$/i).refine(v=>!/^0x0{40}$/i.test(v));
const challengeSchema=z.object({address:addressSchema,chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();
const verifySchema=z.object({id:z.string().uuid(),signature:z.string().regex(/^0x(?:[\da-f]{128}|[\da-f]{130})$/i)}).strict();
const emptySchema=z.object({}).strict();
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');

/** Hosted authentication is opt-in. Browser origin checks are CSRF protection;
 * only an authenticated bearer establishes a principal. No RPC is performed. */
export function registerWalletAuth(app:FastifyInstance,store:Store,options:WalletAuthOptions){
 const url=new URL(options.origin);
 if(url.origin!==options.origin||url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Invalid wallet authentication origin');
 const now=options.now??Date.now,iso=()=>new Date(now()).toISOString();
 const browserOrigin=(req:FastifyRequest)=>req.headers.origin===options.origin;
 const readableOrigin=(req:FastifyRequest)=>req.headers.origin===undefined||req.headers.origin===options.origin;
 const rawToken=(req:FastifyRequest)=>typeof req.headers.authorization==='string'?req.headers.authorization.match(/^Bearer ([a-f0-9]{64})$/)?.[1]:undefined;
 function tokenPrincipal(record:WalletAuthToken):WalletPrincipal{return {id:record.id,address:record.address,kind:record.kind,expiresAt:record.expiresAt};}
 function authenticate(req:FastifyRequest):WalletPrincipal|null{
  if(!options.enabled||req.headers.origin!==undefined&&req.headers.origin!=='null'&&req.headers.origin!==options.origin)return null;
  const token=rawToken(req);if(!token)return null;
  const record=store.authTokenGet(digest(token),iso());return record?tokenPrincipal(record):null;
 }
 function active(principal:WalletPrincipal):boolean{
  if(!options.enabled||!principal||!/^0x[\da-f]{40}$/.test(principal.address)||!/^[a-f0-9]{64}$/.test(principal.id))return false;
  const record=store.authTokenGet(principal.id,iso());return !!record&&record.address===principal.address&&record.kind===principal.kind&&record.expiresAt===principal.expiresAt;
 }
 function issue(address:string,kind:'web'|'snap'){
  const token=randomBytes(32).toString('hex'),createdAt=iso(),expiresAt=new Date(now()+(kind==='web'?WEB_TTL:SNAP_TTL)).toISOString();
  const record:WalletAuthToken={id:digest(token),address:address.toLowerCase(),kind,createdAt,expiresAt};
  store.authPrune(createdAt);store.authTokenSave(record);return {token,expiresAt};
 }
 function issueSnap(principal:WalletPrincipal,ip='internal'){
  if(!active(principal)||principal.kind!=='web')throw Error('Wallet authentication required');
  const token=randomBytes(32).toString('hex'),createdAt=iso(),expiresAt=new Date(now()+SNAP_TTL).toISOString();
  const record:WalletAuthToken={id:digest(token),address:principal.address,kind:'snap',createdAt,expiresAt};
  // Hash the server-observed peer address; request headers never supply this key.
  if(!store.authIssueSnap(record,principal.id,createdAt,{...SNAP_PAIRING_LIMITS,ipKey:digest(ip)}))throw new PairingLimitError();
  return {token,expiresAt};
 }
 function revokeToken(token:string){if(/^[a-f0-9]{64}$/.test(token))store.authTokenRevoke(digest(token));}
 function reportOwner(reportId:string,principal:WalletPrincipal){if(!active(principal)||!store.authReportOwner(reportId,principal.address))throw Error('Wallet report owner mismatch');}
 function ownsReport(reportId:string,principal:WalletPrincipal){return active(principal)&&store.authOwnsReport(reportId,principal.address);}
 function takeAttempt(principal:WalletPrincipal,limit:number,globalLimit?:number){return active(principal)&&store.authTakeAttempt(principal.address,limit,iso(),globalLimit);}
 function rate(req:FastifyRequest,operation:'challenge'|'verify',address?:string){
  const bucket=Math.floor(now()/60000);store.authPrune(iso());
  return store.authRateAttempt('global',bucket,WALLET_AUTH_LIMITS.globalPerMinute)&&store.authRateAttempt(`${operation}:ip:${req.ip}`,bucket,operation==='challenge'?WALLET_AUTH_LIMITS.challengePerMinute:WALLET_AUTH_LIMITS.verifyPerMinute)&&(!address||store.authRateAttempt(`challenge:address:${address}`,bucket,WALLET_AUTH_LIMITS.challengePerAddress));
 }
 const unavailable={error:'Wallet authentication is unavailable.'},invalid={error:'Wallet authentication could not be completed.'};
 app.post('/api/wallet-auth/challenge',{bodyLimit:2048},async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!options.enabled)return reply.code(404).send(unavailable);
  if(!browserOrigin(req))return reply.code(403).send(invalid);
  const parsed=challengeSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send(invalid);
  const address=parsed.data.address.toLowerCase();if(!rate(req,'challenge',address))return reply.code(429).send(invalid);
  const id=randomUUID(),createdAt=iso(),expiresAt=new Date(now()+CHALLENGE_TTL).toISOString(),nonce=randomBytes(16).toString('hex');
  const message=[`${url.host} wants you to sign in with your Ethereum account:`,getAddress(address),'','Sign in to WalletShield to access your own risk reports. This proves control of this account only. It does not authorize transfers, token approvals, asset spending, or blockchain transactions.','',`URI: ${options.origin}/`,'Version: 1',`Chain ID: ${parsed.data.chainId}`,`Nonce: ${nonce}`,`Issued At: ${createdAt}`,`Expiration Time: ${expiresAt}`,`Request ID: ${id}`].join('\n');
  if(!store.authChallengeSave({id,address,chainId:parsed.data.chainId,origin:options.origin,message,createdAt,expiresAt},WALLET_AUTH_LIMITS.maxPending))return reply.code(429).send(invalid);
  return {id,message,expiresAt};
 });
 app.post('/api/wallet-auth/verify',{bodyLimit:2048},async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!options.enabled)return reply.code(404).send(unavailable);
  if(!browserOrigin(req))return reply.code(403).send(invalid);
  if(!rate(req,'verify'))return reply.code(429).send(invalid);
  const parsed=verifySchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send(invalid);
  const challenge=store.authChallengeConsume(parsed.data.id,iso());if(!challenge||challenge.origin!==options.origin)return reply.code(401).send(invalid);
  try{
   // Recover the exact stored message. No client message, supplied address,
   // EIP-1271, RPC, or unchecked signature fallback is accepted.
   const recovered=await recoverMessageAddress({message:challenge.message,signature:parsed.data.signature as `0x${string}`});
   if(recovered.toLowerCase()!==challenge.address||Date.parse(challenge.expiresAt)<=now())return reply.code(401).send(invalid);
   const issued=issue(challenge.address,'web');return {...issued,address:challenge.address,kind:'web'};
  }catch{return reply.code(401).send(invalid);}
 });
 app.get('/api/wallet-auth/status',async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!options.enabled)return reply.code(404).send(unavailable);
  const principal=readableOrigin(req)?authenticate(req):null;if(!principal)return reply.code(401).send(invalid);
  return {authenticated:true,address:principal.address,kind:principal.kind,expiresAt:principal.expiresAt};
 });
 app.post('/api/wallet-auth/logout',{bodyLimit:1024},async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!options.enabled)return reply.code(404).send(unavailable);
  const principal=browserOrigin(req)?authenticate(req):null;if(!principal||!emptySchema.safeParse(req.body).success)return reply.code(401).send(invalid);
  revokeToken(rawToken(req)!);return {ok:true};
 });
 app.post('/api/wallet-auth/revoke',{bodyLimit:1024},async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!options.enabled)return reply.code(404).send(unavailable);
  const principal=browserOrigin(req)?authenticate(req):null;if(!principal||principal.kind!=='web'||!emptySchema.safeParse(req.body).success)return reply.code(401).send(invalid);
  store.authRevokeSnaps(principal.address);return {ok:true};
 });
 return {authenticate,issueSnap,revokeToken,reportOwner,ownsReport,takeAttempt};
}
export type WalletAuth=ReturnType<typeof registerWalletAuth>;
