import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {getAddress,recoverMessageAddress} from 'viem';
import {z} from 'zod';
import type {Store,WalletAuthToken,EvidenceScanLimits} from './store.js';
import type {SecurityReport} from '../security/types.js';
import {verifyContractLogin,CONTRACT_AUTH_LIMITS,type ContractAuthSnapshot} from './contract-auth.js';

export type WalletPrincipal={address:string;id:string;kind:'web'|'snap';expiresAt:string};
export type WalletAuthOptions={origin:string;enabled:boolean;now?:()=>number;retentionDays?:number;rpc?:()=>Promise<Record<number,string>>;contractFetch?:typeof fetch};
export const WALLET_AUTH_LIMITS={challengePerMinute:6,challengePerAddress:3,verifyPerMinute:12,globalPerMinute:120,maxPending:256} as const;
export const SNAP_PAIRING_LIMITS={addressPerMinute:4,ipPerMinute:12,globalPerMinute:60,maxPerAddress:4,maxGlobal:8192} as const;
export const EVIDENCE_SCAN_LIMITS:EvidenceScanLimits={walletPerMinute:8,ipPerMinute:16,globalPerMinute:60,walletPerDay:100,ipPerDay:300,globalPerDay:1000};
export class PairingLimitError extends Error{constructor(){super('Snap pairing capacity or issuance limit reached. Wait one minute or revoke unused pairings before retrying. No existing pairing was changed.');this.name='PairingLimitError';}}
const CHALLENGE_TTL=5*60*1000,WEB_TTL=8*60*60*1000,SNAP_TTL=30*24*60*60*1000;
const addressSchema=z.string().regex(/^0x[\da-f]{40}$/i).refine(v=>!/^0x0{40}$/i.test(v));
const challengeSchema=z.object({address:addressSchema,chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();
const verifySchema=z.object({id:z.string().uuid(),signature:z.string().max(2+CONTRACT_AUTH_LIMITS.signatureBytes*2).regex(/^0x(?:[\da-f]{2})*$/i)}).strict();
const emptySchema=z.object({}).strict();
const deletionSchema=z.object({confirm:z.literal(true)}).strict();
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');

/** Hosted authentication is opt-in. Browser origin checks are CSRF protection;
 * only an authenticated bearer establishes a principal. EOA recovery is local;
 * optional contract login uses only the injected server-configured RPC. */
export function registerWalletAuth(app:FastifyInstance,store:Store,options:WalletAuthOptions){
 const url=new URL(options.origin);
 if(url.origin!==options.origin||url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Invalid wallet authentication origin');
 const now=options.now??Date.now,iso=()=>new Date(now()).toISOString();
 const retentionDays=options.retentionDays??0;
 if(!Number.isInteger(retentionDays)||retentionDays<0||retentionDays>3650)throw Error('Invalid hosted report retention');
 if(options.enabled&&retentionDays>0){
  let timer:ReturnType<typeof setInterval>|undefined;
  const prune=()=>{try{return store.pruneHostedReports(new Date(now()-retentionDays*86400000).toISOString(),100);}catch{app.log.error('Hosted report retention failed; report removal was not assumed successful.');return 0;}};
  app.addHook('onReady',async()=>{prune();timer=setInterval(prune,60000);timer.unref();});
  app.addHook('onClose',async()=>{if(timer)clearInterval(timer);});
 }
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
 function issueWeb(address:string,challengeId:string){
  const token=randomBytes(32).toString('hex'),createdAt=iso(),expiresAt=new Date(now()+WEB_TTL).toISOString();
  const record:WalletAuthToken={id:digest(token),address:address.toLowerCase(),kind:'web',createdAt,expiresAt};
  store.authPrune(createdAt);return store.authIssueWeb(record,challengeId,createdAt)?{token,expiresAt}:null;
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
 function saveReport(report:SecurityReport,principal:WalletPrincipal){return options.enabled&&store.authSaveSecurityReport(report,principal.address,principal.id,iso());}
 function takeEvidenceAttempt(principal:WalletPrincipal,ip:string,limits:Partial<EvidenceScanLimits>={}){return options.enabled&&store.authTakeEvidenceAttempt(principal.address,principal.id,digest(ip),iso(),{...EVIDENCE_SCAN_LIMITS,...limits});}
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
 app.post('/api/wallet-auth/verify',{bodyLimit:20000},async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!options.enabled)return reply.code(404).send(unavailable);
  if(!browserOrigin(req))return reply.code(403).send(invalid);
  if(!rate(req,'verify'))return reply.code(429).send(invalid);
  const parsed=verifySchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send(invalid);
  const challenge=store.authChallengeConsume(parsed.data.id,iso());if(!challenge||challenge.origin!==options.origin)return reply.code(401).send(invalid);
  try{
   // EOA recovery comes first and includes EOAs with delegation code. Contract
   // validation is a separate fail-closed path, never unchecked EOA fallback.
   let eoa=false,verification:ContractAuthSnapshot|null=null;
   if(/^0x(?:[\da-f]{128}|[\da-f]{130})$/i.test(parsed.data.signature))try{eoa=(await recoverMessageAddress({message:challenge.message,signature:parsed.data.signature as `0x${string}`})).toLowerCase()===challenge.address;}catch{/* Actual contract signatures can have another encoding. */}
   if(!eoa&&options.rpc)verification=await verifyContractLogin(challenge,parsed.data.signature as `0x${string}`,await options.rpc(),now,options.contractFetch);
   if(!eoa&&!verification||Date.parse(challenge.expiresAt)<=now())return reply.code(401).send({error:'Wallet authentication could not be completed. Contract-wallet login requires a supported signature, trusted network RPC and current ERC-1271 validation.'});
   const issued=issueWeb(challenge.address,challenge.id);if(!issued)return reply.code(401).send(invalid);return {...issued,address:challenge.address,kind:'web',authentication:eoa?'eoa':'erc1271',...(verification?{verification}:{})};
  }catch{return reply.code(401).send(invalid);}finally{store.authVerificationDiscard(challenge.id);}
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
  const removed=store.authRevokeAll(principal.address,principal.id,iso());if(removed===null)return reply.code(401).send(invalid);
  return {ok:true,scope:'all-wallet-sessions',credentialsRevoked:removed};
 });
 app.post('/api/wallet-auth/reports/delete',{bodyLimit:1024},async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!options.enabled)return reply.code(404).send(unavailable);
  const principal=browserOrigin(req)?authenticate(req):null;
  if(!principal||principal.kind!=='web')return reply.code(401).send(invalid);
  if(!deletionSchema.safeParse(req.body).success)return reply.code(400).send({error:'Confirm deletion of this wallet’s reports.'});
  const deleted=store.authDeleteReports(principal.address,principal.id,iso());if(!deleted)return reply.code(401).send(invalid);
  return {ok:true,...deleted,scope:'current-wallet-reports',message:'Stored reports for this wallet were deleted and all its web and Snap credentials were revoked. Other wallets and usage budgets were unchanged. In-flight results cannot be saved with revoked credentials; previously sent third-party requests cannot be recalled.'};
 });
 return {authenticate,active,issueSnap,revokeToken,reportOwner,ownsReport,takeAttempt,takeEvidenceAttempt,saveReport};
}
export type WalletAuth=ReturnType<typeof registerWalletAuth>;
