import {HOSTED_LAB_CHAIN_ID} from './network.js';
import {labSessionAddress,type HostedLabAccess} from './hosted-access.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {zeroAddress,type Address} from 'viem';
import type {Store} from '../server/store.js';
import {prepareLocalFunds} from '../server/funding.js';
import {COVERAGE_PROFILES} from '../security/coverage.js';
import {WALLET_CASES,UNAVAILABLE_WALLET_TESTS,buildWalletCase} from './cases.js';
import {verifiedLab,labArtifacts,prepareLab,preflightLab,labClient,labWallet,labInventory} from './contracts.js';
import {clearLabAssets} from './cleanup.js';
import {LocalAssetBusyError,withLocalAssetMutation} from '../server/local-asset-mutation.js';
import {newLabSession,publicLabSession,validLabToken,type LabSession} from './sessions.js';
import {loadSecurityConfig} from '../security/config.js';
const address=z.string().regex(/^0x[\da-fA-F]{40}$/).refine(a=>a.toLowerCase()!==zeroAddress);

export type LabOptions={preflight?:typeof preflightLab;prepareFunds?:typeof prepareLocalFunds;prepareAssets?:typeof prepareLab;clearAssets?:typeof clearLabAssets;inventory?:typeof labInventory;hosted?:{origin:string;access:HostedLabAccess}};
export function registerLab(app:FastifyInstance,store:Store,options:LabOptions={}){
 const local=(origin:string|undefined)=>(options.hosted?[options.hosted.origin]:['http://127.0.0.1:5173','http://localhost:5173']).includes(origin??'');
 app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith('/api/lab/')&&((req.method!=='GET'&&!local(req.headers.origin))||(req.headers.origin&&!local(req.headers.origin))))return reply.code(403).send({error:'Use the local WalletShield workspace for this action.'});});
 app.addHook('preValidation',async(req,reply)=>{
  if(!options.hosted||!req.url.startsWith('/api/lab/'))return;
  const access=options.hosted.access,who=access.principal(req);
  if(!who)return reply.code(401).send({error:'Verify this test wallet identity first. Contract identities must be verified on chain 31338.'});
  if(!access.takeRate('web:'+who.address,120))return reply.code(429).send({error:'Too many test lab requests. Retry shortly.'});
  const path=req.url.split('?')[0],body=req.body as {address?:unknown}|undefined,query=req.query as {address?:unknown};
  const requested=req.method==='GET'?query?.address:body?.address;
  if(requested!==undefined&&(typeof requested!=='string'||!access.owns(req,requested)))return reply.code(403).send({error:'Test asset actions are limited to your verified account.'});
  const match=path.match(/^\/api\/lab\/sessions\/([^/]+)/);
  if(match){const session=store.labGet(match[1]);if(!session||!access.owns(req,labSessionAddress(session)))return reply.code(404).send({error:'Test record not found.'});}
  if(req.method==='POST'&&['/api/lab/prepare','/api/lab/clear','/api/lab/begin'].includes(path)){
   if(!requested||!access.mutation(who.address))return reply.code(429).send({error:'Test lab preparation limit reached. Retry later.'});
   // Anvil's unlocked fixture keys are public. They are never user accounts.
   const d=await verifiedLab(),reserved=[d.owner,d.recipient,d.baseToken,...Object.values(d.contracts).map(c=>c.address),...await labWallet.getAddresses()];
   if(reserved.some(a=>a.toLowerCase()===who.address))return reply.code(403).send({error:'Use your own dedicated test wallet, not an unlocked fixture account.'});
   if(!access.principal(req))return reply.code(401).send({error:'Wallet identity expired. Verify again.'});
   if(!access.takeLease(who.address))return reply.code(409).send({error:'Another test wallet currently holds the shared lab. Retry after its 15-minute lease expires.'});
  }
 });
 app.get('/api/lab/status',async()=>{let ready=false,message='';try{await verifiedLab();ready=true;}catch(e){message=e instanceof Error?e.message:'Local test contracts are not ready.';}const profiles=new Set(WALLET_CASES.map(c=>c.profile)),config=await loadSecurityConfig();return {ready,message,...(options.hosted?{lease:options.hosted.access.lease(),chainId:HOSTED_LAB_CHAIN_ID,sharedSandbox:true}:{}),cases:WALLET_CASES,caseCount:WALLET_CASES.length,walletProfileCount:profiles.size,analysisProfileCount:COVERAGE_PROFILES.length,transactionCount:WALLET_CASES.filter(c=>c.kind==='transaction').length,signatureCount:WALLET_CASES.filter(c=>c.kind==='signature').length,unavailable:UNAVAILABLE_WALLET_TESTS,aiConfigured:!!config.apiKey&&config.aiEnabled,aiDailyLimit:config.aiDailyLimit??30,aiCallsToday:store.securityAiCallsToday()};});
 app.get<{Querystring:{address?:string}}>('/api/lab/inventory',async(req,reply)=>{const parsed=address.safeParse(req.query.address);if(!parsed.success)return reply.code(400).send({error:'A valid test account address is required.'});try{return await(options.inventory??labInventory)(parsed.data as Address);}catch(e){return reply.code(503).send({error:e instanceof Error?e.message:'Could not load the asset inventory.'});}});
 app.post('/api/lab/prepare',async(req,reply)=>{
  const parsed=z.object({address}).strict().safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Connect a valid test account.'});
  try{return await withLocalAssetMutation(async()=>{await(options.preflight??preflightLab)();await(options.prepareFunds??prepareLocalFunds)(parsed.data.address);const assets=await(options.prepareAssets??prepareLab)(parsed.data.address as Address);return {...assets,eth:assets.inventory.eth};});}
  catch(e){return reply.code(e instanceof LocalAssetBusyError?409:503).send({error:e instanceof Error?e.message:'Local asset preparation failed. Refresh balances before retrying.'});}
 });
 app.post('/api/lab/clear',async(req,reply)=>{
  const parsed=z.object({address,confirm:z.literal(true)}).strict().safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Confirm clearing the selected account’s local test balances.'});
  try{return await withLocalAssetMutation(()=>(options.clearAssets??clearLabAssets)(parsed.data.address as Address));}
  catch(e){return reply.code(e instanceof LocalAssetBusyError?409:503).send({error:e instanceof Error?e.message:'Local balance clearing failed. Refresh balances before retrying.'});}
 });
 app.post('/api/lab/begin',async(req,reply)=>{
  const parsed=z.object({caseId:z.enum(WALLET_CASES.map(c=>c.id) as [string,...string[]]),address}).strict().safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Choose a listed test case and connect an account.'});
  try{const d=await verifiedLab();const request=await buildWalletCase(parsed.data.caseId,parsed.data.address as Address,d,await labArtifacts(),req.headers.origin);const boundChain=options.hosted?.access.principal(req)?.chainId;if(request.kind==='signature'&&boundChain!==undefined)request.chainId=boundChain;const test=WALLET_CASES.find(c=>c.id===parsed.data.caseId)!;if(request.kind==='transaction'&&test.prerequisite&&test.id!=='sell-blocked'){try{await labClient.call({account:request.transaction.from as Address,to:request.transaction.to as Address,data:request.transaction.data as `0x${string}`,value:BigInt(request.transaction.value??'0x0')});}catch{throw Error(`A local test prerequisite is not satisfied: ${test.prerequisite} Check the assets, existing allowances or positions. This is not an AI risk assessment.`);}}const {session,token}=newLabSession(parsed.data.caseId,request);store.labSave(session);return {...publicLabSession(session),token};}catch(e){return reply.code(409).send({error:e instanceof Error?e.message:'Test request preparation failed.'});}
 });
 app.get('/api/lab/sessions',async(req)=>store.labList(options.hosted?.access.principal(req)?.address).filter(s=>!options.hosted||options.hosted.access.owns(req,labSessionAddress(s))).map(s=>({...publicLabSession(s),report:s.reportId?store.securityGet(s.reportId):null})));
 app.get<{Params:{id:string}}>('/api/lab/sessions/:id',async(req,reply)=>{const s=store.labGet(req.params.id);if(!s)return reply.code(404).send({error:'Test record not found.'});return {...publicLabSession(s),report:s.reportId?store.securityGet(s.reportId):null};});
 app.post<{Params:{id:string}}>('/api/lab/sessions/:id/result',async(req,reply)=>{
  const parsed=z.object({token:z.string().min(20).max(100),status:z.enum(['signed','submitted','rejected','error']),transactionHash:z.string().regex(/^0x[\da-f]{64}$/i).optional()}).strict().safeParse(req.body),session=store.labGet(req.params.id);
  if(!parsed.success||!session)return reply.code(400).send({error:'Invalid test result format.'});if(!validLabToken(session,parsed.data.token))return reply.code(403).send({error:'Invalid test result credential.'});
  if(session.status!=='pending')return reply.code(409).send({error:'The wallet outcome for this request has already been recorded.'});
  const next:LabSession={...session,status:parsed.data.status,note:parsed.data.status==='signed'?'The wallet returned a signature. It was not uploaded, broadcast or submitted for use.':parsed.data.status==='rejected'?'The wallet reported user rejection. This is not an on-chain execution result.':'Request status reported by the wallet.'};
  if(parsed.data.status==='signed'&&session.request.kind!=='signature')return reply.code(400).send({error:'A transaction request cannot be recorded as a message signature.'});
  if(parsed.data.status==='submitted'){
   if(session.request.kind!=='transaction'||!parsed.data.transactionHash)return reply.code(400).send({error:'A transaction request and the hash returned by the wallet are required.'});
   try{await verifiedLab();const hash=parsed.data.transactionHash as `0x${string}`,transaction=await labClient.getTransaction({hash}),expected=session.request.transaction;
    if(transaction.from.toLowerCase()!==expected.from.toLowerCase()||(transaction.to?.toLowerCase()??null)!==(expected.to?.toLowerCase()??null)||transaction.input.toLowerCase()!==expected.data.toLowerCase()||transaction.value!==BigInt(expected.value??'0x0'))return reply.code(409).send({error:'The on-chain transaction does not match this test request.'});
    next.transactionHash=hash;
    try{const receipt=await labClient.getTransactionReceipt({hash});next.status=receipt.status==='success'?'confirmed':'reverted';next.note='The local transaction contents and receipt were verified. This does not establish safety.';}catch{next.note='Transaction contents verified. A receipt is not available yet.';}
   }catch{return reply.code(409).send({error:'The local transaction has not been verified. Keep the hash returned by the wallet.'});}
  }
  // Preserve any report attached during receipt reads; concurrent result
  // submissions must not overwrite the first recorded wallet outcome.
  const finished=store.labFinish(next);if(!finished)return reply.code(409).send({error:'The wallet outcome for this request has already been recorded.'});return publicLabSession(finished);
 });
}
