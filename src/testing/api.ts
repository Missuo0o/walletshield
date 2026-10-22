import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {zeroAddress,type Address} from 'viem';
import type {Store} from '../server/store.js';
import {prepareLocalFunds} from '../server/funding.js';
import {COVERAGE_PROFILES} from '../security/coverage.js';
import {WALLET_CASES,UNAVAILABLE_WALLET_TESTS,buildWalletCase} from './cases.js';
import {verifiedLab,labArtifacts,prepareLab,labClient,labInventory} from './contracts.js';
import {newLabSession,publicLabSession,validLabToken,type LabSession} from './sessions.js';
import {loadSecurityConfig} from '../security/config.js';
const address=z.string().regex(/^0x[\da-fA-F]{40}$/).refine(a=>a.toLowerCase()!==zeroAddress);
const local=(origin:string|undefined)=>['http://127.0.0.1:5173','http://localhost:5173'].includes(origin??'');
export function registerLab(app:FastifyInstance,store:Store){
 app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith('/api/lab/')&&((req.method!=='GET'&&!local(req.headers.origin))||(req.headers.origin&&!local(req.headers.origin))))return reply.code(403).send({error:'Use the local WalletShield workspace for this action.'});});
 app.get('/api/lab/status',async()=>{let ready=false,message='';try{await verifiedLab();ready=true;}catch(e){message=e instanceof Error?e.message:'Local test contracts are not ready.';}const profiles=new Set(WALLET_CASES.map(c=>c.profile)),config=await loadSecurityConfig();return {ready,message,cases:WALLET_CASES,caseCount:WALLET_CASES.length,walletProfileCount:profiles.size,analysisProfileCount:COVERAGE_PROFILES.length,transactionCount:WALLET_CASES.filter(c=>c.kind==='transaction').length,signatureCount:WALLET_CASES.filter(c=>c.kind==='signature').length,unavailable:UNAVAILABLE_WALLET_TESTS,aiConfigured:!!config.apiKey&&config.aiEnabled,aiDailyLimit:config.aiDailyLimit??30,aiCallsToday:store.securityAiCallsToday()};});
 app.get<{Querystring:{address?:string}}>('/api/lab/inventory',async(req,reply)=>{const parsed=address.safeParse(req.query.address);if(!parsed.success)return reply.code(400).send({error:'A valid test account address is required.'});try{return await labInventory(parsed.data as Address);}catch(e){return reply.code(503).send({error:e instanceof Error?e.message:'Could not load the asset inventory.'});}});
 let preparing=false;
 app.post('/api/lab/prepare',async(req,reply)=>{const parsed=z.object({address}).strict().safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Connect a valid test account.'});if(preparing)return reply.code(409).send({error:'Test assets are being prepared. Please wait.'});preparing=true;try{await verifiedLab();const funds=await prepareLocalFunds(parsed.data.address);const assets=await prepareLab(parsed.data.address as Address);return {...assets,eth:funds.eth};}catch(e){return reply.code(503).send({error:e instanceof Error?e.message:'Local asset preparation failed.'});}finally{preparing=false;}});
 app.post('/api/lab/begin',async(req,reply)=>{
  const parsed=z.object({caseId:z.enum(WALLET_CASES.map(c=>c.id) as [string,...string[]]),address}).strict().safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Choose a listed test case and connect an account.'});
  try{const d=await verifiedLab();const request=await buildWalletCase(parsed.data.caseId,parsed.data.address as Address,d,await labArtifacts(),req.headers.origin);const test=WALLET_CASES.find(c=>c.id===parsed.data.caseId)!;if(request.kind==='transaction'&&test.prerequisite&&test.id!=='sell-blocked'){try{await labClient.call({account:request.transaction.from as Address,to:request.transaction.to as Address,data:request.transaction.data as `0x${string}`,value:BigInt(request.transaction.value??'0x0')});}catch{throw Error(`A local test prerequisite is not satisfied: ${test.prerequisite} Check the assets, existing allowances or positions. This is not an AI risk assessment.`);}}const {session,token}=newLabSession(parsed.data.caseId,request);store.labSave(session);return {...publicLabSession(session),token};}catch(e){return reply.code(409).send({error:e instanceof Error?e.message:'Test request preparation failed.'});}
 });
 app.get('/api/lab/sessions',async()=>store.labList().map(s=>({...publicLabSession(s),report:s.reportId?store.securityGet(s.reportId):null})));
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
  // The Snap may have attached its report while the wallet was open.
  next.reportId=store.labGet(session.id)?.reportId;store.labSave(next);return publicLabSession(next);
 });
}
