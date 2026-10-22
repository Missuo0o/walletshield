import type {ServiceConfig} from '../server/service-config.js';
import {PairingLimitError,type WalletAuth,type WalletPrincipal} from '../server/wallet-auth.js';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../server/store.js';
import { requestSchema, COVERAGE, type SecurityReport, type AIState } from './types.js';
import { decodeRequest } from './decode.js';
import { assess } from './rules.js';
import { collector, evidence, type Collector } from './providers.js';
import { loadSecurityConfig, type SecurityConfig } from './config.js';
import { scoreWithAI, evidencePacket } from './ai.js';
import {evidenceQuality} from './quality.js';
import {assessmentScope} from './assessment-scope.js';
import { securityExamples, demoEvidence } from './examples.js';
import { watchSchema, newWatch, startMonitor } from './monitor.js';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {matchLabReport} from '../testing/sessions.js';
export type SecurityOptions={access?:{service:ServiceConfig;auth:WalletAuth};config?:()=>Promise<SecurityConfig>;collect?:Collector;score?:(report:SecurityReport,config:SecurityConfig)=>Promise<AIState>};
export function registerSecurity(app:FastifyInstance,store:Store,options:SecurityOptions={}) {
  const hosted=options.access?.service.mode==='hosted',auth=options.access?.auth;
  const getConfig=async()=>{const c=await(options.config??loadSecurityConfig)();return hosted?{...c,rpc:Object.fromEntries(Object.entries(c.rpc).filter(([id])=>id!=='31337')),monitorEnabled:false}:c;};
  const monitor=startMonitor(store,getConfig);
  app.addHook('onClose',async()=>monitor.close());
  const local=(origin:string|undefined)=>(options.access?.service.origins??['http://127.0.0.1:5173','http://localhost:5173']).includes(origin??'');
  app.addHook('onRequest',async(req,reply)=>{
    const path=req.url.split('?')[0];
    if(path.startsWith('/api/security/')&&req.method==='GET'&&req.headers.origin&&!local(req.headers.origin)&&!(path==='/api/security/pair/status'&&req.headers.origin==='null'))return reply.code(403).send({error:'Reports are not exposed to foreign origins.'});
    if(hosted&&(/^\/api\/security\/(?:monitor|demo|examples|coverage-guide)(?:\/|$)/.test(path)||path==='/api/security/ai/test'))return reply.code(404).send({error:'This function is unavailable in hosted mode.'});
  });
  async function localSnapToken(authorization:string|undefined){
    const token=typeof authorization==='string'?authorization.replace(/^Bearer /,''):'';const c=await getConfig();
    return !!c.snapToken&&/^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(token),Buffer.from(c.snapToken));
  }
  app.post('/api/security/pair',async(req,reply)=>{
    if(!local(req.headers.origin))return reply.code(403).send({error:'Pair the Snap from the WalletShield companion page.'});
    reply.header('Cache-Control','no-store');
    if(hosted){const principal=auth!.authenticate(req);if(!principal||principal.kind!=='web')return reply.code(401).send({error:'Verify your wallet identity first.'});try{return {...auth!.issueSnap(principal,req.ip),address:principal.address};}catch(error){if(error instanceof PairingLimitError)return reply.header('Retry-After','60').code(429).send({error:error.message});throw error;}}
    const c=await getConfig();if(!c.snapToken)return reply.code(503).send({error:'Local pairing is not configured.'});return {token:c.snapToken,expiresAt:null};
  });
  app.get('/api/security/pair/status',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if(hosted){const principal=auth!.authenticate(req);if(!principal||principal.kind!=='snap')return reply.code(401).send({error:'The Snap pairing credential has expired or been revoked; pair again.'});return {paired:true,address:principal.address,expiresAt:principal.expiresAt,mode:'hosted'};}
    if(!await localSnapToken(req.headers.authorization))return reply.code(401).send({error:'The backend did not accept this Snap pairing.'});
    return {paired:true,expiresAt:null,mode:'local'};
  });
  if(!hosted){
  app.get('/api/security/monitor',async()=>({watches:store.watchList(),alerts:store.alertList()}));
  app.post('/api/security/monitor',async(req,reply)=>{
    if(!local(req.headers.origin))return reply.code(403).send({error:'Manage legacy watches from the local workbench only.'});
    const parsed=watchSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Supply a chain, public address and at most 16 token addresses.'});
    const all=store.watchList();const existing=all.find(w=>w.chainId===parsed.data.chainId&&w.address.toLowerCase()===parsed.data.address.toLowerCase());
    if(existing){if(existing.tokens.join(',')!==[...new Set(parsed.data.tokens.map(t=>t.toLowerCase()))].join(','))return reply.code(409).send({error:'This account is already watched; preserve its token scope or adjust configuration separately.'});store.watchSave({...existing,active:true});return existing;}
    if(all.length>=8)return reply.code(429).send({error:'At most eight local legacy watches are allowed.'});
    const watch=newWatch(parsed.data);store.watchSave(watch);return watch;
  });
  app.post('/api/security/monitor/check',async(req,reply)=>{if(!local(req.headers.origin))return reply.code(403).send({error:'Only the local workbench may trigger this check.'});await monitor.tick();return {watches:store.watchList(),alerts:store.alertList()};});
  app.post<{Params:{id:string}}>('/api/security/monitor/:id',async(req,reply)=>{
    if(!local(req.headers.origin))return reply.code(403).send({error:'Only the local workbench may change legacy-watch state.'});
    const parsed=z.object({active:z.boolean()}).strict().safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Invalid state format.'});
    const watch=store.watchList().find(w=>w.id===req.params.id);if(!watch)return reply.code(404).send({error:'Watch not found.'});const next={...watch,active:parsed.data.active};store.watchSave(next);return next;
  });
  }
  const busy=new Set<string>(),recent=new Map<string,number[]>();
  async function modelStage(report:SecurityReport,config:SecurityConfig,principal?:WalletPrincipal){
    report.quality=evidenceQuality(report);
    report.assessmentScope=assessmentScope(report);
    // Only the model supplies a number. Failure, abstention and quotas never
    // fall back to a preset score, including when handling an older report.
    report.score=null;report.scoreSource='none';delete report.ruleScoreFloor;
    if(config.apiKey&&config.aiEnabled&&principal&&!auth!.takeAttempt(principal,options.access!.service.walletDailyLimit,config.aiDailyLimit??100))report.ai={status:'disabled',message:'The wallet or service daily model limit has been reached. Evidence retained; no AI score.'};
    else if(config.apiKey&&config.aiEnabled&&!principal&&!store.securityAiAttempt(config.aiDailyLimit??30))report.ai={status:'disabled',message:`The local daily model limit of ${config.aiDailyLimit??30} attempts has been reached. No AI score; evidence retained.`};
    else {if(config.apiKey&&config.aiEnabled){report.ai={status:'pending',message:'Muse is analyzing this evidence. No score yet; wait for the wallet insight.'};store.securitySave(report);}try{report.ai=options.score?await options.score(report,config):await scoreWithAI(report,config,fetch,()=>principal?auth!.takeAttempt(principal,options.access!.service.walletDailyLimit,config.aiDailyLimit??100):store.securityAiAttempt(config.aiDailyLimit??30));}catch{report.ai={status:'failed',message:'Model service error. No AI score; qualitative evidence retained.'};}}
    if(report.ai.status==='completed'&&report.ai.result){const ai=report.ai.result;report.assessmentScope=assessmentScope(report,ai.missing_data);if(ai.score!==null){report.score=ai.score;report.scoreSource='ai';}if(report.level!=='high'&&ai.assessment==='high'){report.level='high';report.title='High risk';}if(!report.assessmentScope.criticalMissingData.length&&report.level!=='high'){report.level=ai.assessment;report.title=ai.assessment==='low'?'No clear risk observed within request scope':ai.assessment==='review'?'Review needed':'Unable to assess';}}
    store.securitySave(report);return report;
  }
  if(!hosted){
  app.post('/api/security/ai/test',async(req,reply)=>{
    if(!local(req.headers.origin))return reply.code(403).send({error:'Test model connectivity from the local workbench.'});
    const config=await getConfig();if(!config.apiKey||!config.aiEnabled)return reply.code(409).send({error:'Configure MODEL_API_KEY and ENABLE_META_AI=1 in backend .local/meta.env to enable Muse Wonder.'});
    if(busy.size)return reply.code(429).send({error:'Another check is in progress.'});busy.add('local');
    try{const sample=securityExamples.find(e=>e.id==='approve')!;const report=assess(sample.request,demoEvidence(),'demo');report.operation.label='AI connection check - fixed approval sample';store.securitySave(report);return await modelStage(report,config);}finally{busy.delete('local');}
  });
  }
  app.get('/api/security/status',async()=>{
    const c=await getConfig();return {version:'0.4.1',scoringPolicy:'muse-evidence-v2-dimensions',aiProvider:'Meta',aiConfigured:!!c.apiKey,aiEnabled:c.aiEnabled,model:c.model,externalLookups:c.lookups,forkSimulation:!!c.forkEnabled,monitorEnabled:!!c.monitorEnabled,serviceMode:hosted?'hosted':'local',configuredChains:Object.keys(c.rpc).map(Number),coverage:COVERAGE};
  });
  if(!hosted){
  app.get('/api/security/examples',async()=>securityExamples.map(({id,name,request})=>({id,name,request})));
  app.get('/api/security/coverage-guide',async(_req,reply)=>{
    try {const guide=await readFile(resolve(process.cwd(),'docs/AI-COVERAGE-GUIDE.md'),'utf8');return reply.type('text/markdown; charset=utf-8').header('Content-Disposition','attachment; filename="WalletShield-AI-Coverage.md"').send(guide);}
    catch {return reply.code(503).send({error:'The guide is temporarily unavailable.'});}
  });
  }
  app.get('/api/security/records',async(req,reply)=>{if(!hosted)return store.securityList();const principal=auth!.authenticate(req);return principal?store.authSecurityList(principal.address):reply.code(401).send({error:'Verify your wallet identity first.'});});
  app.get<{Params:{id:string}}>('/api/security/records/:id',async(req,reply)=>{const principal=hosted?auth!.authenticate(req):null;if(hosted&&(!principal||!auth!.ownsReport(req.params.id,principal)))return reply.code(404).send({error:'Report not found.'});return store.securityGet(req.params.id)??reply.code(404).send({error:'Report not found.'});});
  app.get<{Params:{id:string}}>('/api/security/records/:id/evidence',async(req,reply)=>{
    const principal=hosted?auth!.authenticate(req):null;if(hosted&&(!principal||!auth!.ownsReport(req.params.id,principal)))return reply.code(404).send({error:'Report not found.'});
    const report=store.securityGet(req.params.id);return report?evidencePacket(report):reply.code(404).send({error:'Report not found.'});
  });
  if(!hosted){
  app.post<{Params:{id:string}}>('/api/security/demo/:id',async(req,reply)=>{
    if(!local(req.headers.origin))return reply.code(403).send({error:'Run legacy demonstrations only from the local workbench.'});
    const example=securityExamples.find(e=>e.id===req.params.id);if(!example)return reply.code(404).send({error:'Demonstration not found.'});
    const report=assess(example.request,[...demoEvidence(),...(example.extra??[])],'demo');
    report.ai={status:'disabled',message:'Fixed demonstrations do not call the external model or produce a score; only signals and gaps are shown.'};store.securitySave(report);return report;
  });
  }
  app.post('/api/security/scan',async(req,reply)=>{
    let principal:WalletPrincipal|undefined;let fromSnap=false;
    if(hosted){principal=auth!.authenticate(req)??undefined;if(!principal)return reply.code(401).send({error:'Authenticate your wallet or pair the Snap again.'});fromSnap=principal.kind==='snap';}
    else if(!local(req.headers.origin)){if(!await localSnapToken(req.headers.authorization))return reply.code(403).send({error:'Reload and pair the Snap in Wallet setup. An unauthenticated opaque origin cannot scan.'});fromSnap=true;}
    const parsed=requestSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Invalid request. Only unsigned wallet requests are accepted, not client scores, intelligence or RPC overrides.'});
    if(hosted&&(parsed.data.chainId===31337||parsed.data.kind==='signature'&&Number(decodeRequest(parsed.data).fields.domainChainId)===31337))return reply.code(400).send({error:'Hosted mode does not connect to local lab chain 31337.'});
    if(principal){const sender=parsed.data.kind==='transaction'?parsed.data.transaction.from:parsed.data.kind==='signature'?parsed.data.signature.from:undefined;if(sender?sender.toLowerCase()!==principal.address:principal.kind==='snap')return reply.code(403).send({error:'The request account differs from the bound wallet; switch identity and pair again.'});}
    const key=principal?.address??'local',now=Date.now(),times=recent.get(key)??[];while(times.length&&now-times[0]>60000)times.shift();
    if(busy.has(key)||busy.size>=(options.access?.service.maxScans??1)||times.length>=8)return reply.code(429).send({error:'Too many scans; retry later. This request was not analyzed.'});
    if(recent.size>=10000&&!recent.has(key)){for(const [k,v] of recent)if(!v.length||now-v.at(-1)!>60000)recent.delete(k);if(recent.size>=10000)return reply.code(429).send({error:'The service is busy; retry later.'});}
    busy.add(key);times.push(now);recent.set(key,times);
    try {
      const config=await getConfig();
      let facts;
      try {
        let timer:ReturnType<typeof setTimeout>|undefined;
        try {facts=await Promise.race([(options.collect??collector(config))(parsed.data,decodeRequest(parsed.data)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Evidence timeout')),24000);})]);}
        finally {if(timer)clearTimeout(timer);}
      }
      catch {facts=[evidence('collector','unknown','Evidence collection failed','Evidence queries did not complete.','service')];}
      const report=assess(parsed.data,facts);report.capture={channel:fromSnap?'paired-snap':'workbench',...(principal?{wallet:principal.address,pairingId:principal.id}:{})};
      if(principal)auth!.reportOwner(report.id,principal);
      // Store once before model work. The same ID is updated; AI never creates a
      // second wallet-operation record or fabricates a transaction outcome.
      store.securitySave(report);
      if(fromSnap&&!hosted){const sessionId=req.headers['x-walletshield-test-session'];const candidates=store.labList().filter(s=>typeof sessionId!=='string'||s.id===sessionId);const session=matchLabReport(candidates,report);if(session)store.labSave(session);}
      return await modelStage(report,config,principal);
    } finally {busy.delete(key);}
  });
}
