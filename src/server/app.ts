import Fastify from 'fastify';
import {serviceConfig,permittedHost,type ServiceConfig} from './service-config.js';
import {registerWalletAuth} from './wallet-auth.js';
import staticFiles from '@fastify/static';
import {resolve} from 'node:path';
import { registerSecurity, type SecurityOptions } from '../security/api.js';
import { registerLab,type LabOptions } from '../testing/api.js';
import {registerNetworks,type NetworkProbe} from './networks.js';
import {loadSecurityConfig} from '../security/config.js';
import cors from '@fastify/cors';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { evaluate } from '../core/engine.js';
import { scenarios } from '../core/scenarios.js';
import type { AnalysisInput, Context } from '../core/types.js';
import { collectContext, localStatus } from './chain.js';
import type { Store } from './store.js';
import { prepareLocalFunds } from './funding.js';
import {LocalAssetBusyError,withLocalAssetMutation} from './local-asset-mutation.js';
import { registerWorkflow, type ReceiptEvidence } from './workflow.js';
const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const hex = z.string().max(20000).regex(/^0x(?:[\da-fA-F]{2})*$/);
export const inputSchema = z.object({
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  transaction: z.object({ from: address, to: address, data: hex, value: z.string().regex(/^0x[\da-fA-F]{1,64}$/).optional() }).strict(),
  origin: z.string().max(512).optional()
}).strict();
export async function buildApp(store: Store, options: { context?: (i: AnalysisInput) => Promise<Context>; fund?: typeof prepareLocalFunds; logger?: boolean; receipt?: (hash: `0x${string}`) => Promise<ReceiptEvidence | null>; security?: SecurityOptions; networkProbe?:NetworkProbe; service?:ServiceConfig;lab?:LabOptions } = {}) {
  const service=options.service??serviceConfig();
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 32768, trustProxy:service.mode==='hosted'?'127.0.0.1':false });
  app.addHook('onRequest',async(req,reply)=>{
    const path=req.url.split('?')[0];
    let decoded:string;try{decoded=decodeURIComponent(path);}catch{return reply.code(400).send({error:'Invalid request path encoding.'});}
    if(path.includes('%')&&(/^\/api(?:\/|$)/i.test(path)||/^\/api(?:\/|$)/i.test(decoded)))return reply.code(400).send({error:'Encoded API route segments are not accepted.'});
    // Loopback binding alone does not stop DNS-rebinding reads.
    if(!permittedHost(req.headers.host,service))return reply.code(403).send({error:'The request Host is not configured for this service.'});
    if(req.method==='GET'&&path.startsWith('/api/')&&req.headers.origin&&!service.origins.includes(req.headers.origin)&&!(path==='/api/security/pair/status'&&req.headers.origin==='null'))return reply.code(403).send({error:'Check data is unavailable to this origin.'});
    if(service.mode==='hosted'&&/^\/api\/(?:lab(?:\/|$)|local(?:\/|$)|workflow(?:\/|$)|records(?:\/|$)|analyze(?:\/|$)|demo(?:\/|$)|scenarios(?:\/|$))/.test(path))return reply.code(404).send({error:'Local experimental routes are unavailable in hosted mode.'});
    if(req.method==='POST'&&(/^\/api\/(?:analyze|demo\/|records\/)/.test(path))&&!['http://127.0.0.1:5173','http://localhost:5173'].includes(req.headers.origin??''))return reply.code(403).send({error:'Submit this request from the local workbench.'});
  });
  await app.register(cors, { origin: [...service.origins, 'null'], methods: ['GET', 'POST'], allowedHeaders: ['Content-Type','Authorization','X-WalletShield-Test-Session'] });
  app.addHook('onSend',async(req,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff');reply.header('Referrer-Policy','no-referrer');if(req.url.startsWith('/api/'))reply.header('Cache-Control','no-store');if(service.mode==='hosted'){reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");reply.header('X-Frame-Options','DENY');}return payload;});
  const auth=registerWalletAuth(app,store,{origin:service.origin,enabled:service.mode==='hosted',retentionDays:service.reportRetentionDays});
  registerSecurity(app, store, {...options.security,access:{service,auth}});
  if(service.mode==='local')registerLab(app,store,options.lab);
  registerNetworks(app,options.security?.config??loadSecurityConfig,options.networkProbe,{origins:service.origins,authorize:service.mode==='hosted'?(req,address)=>{const who=auth.authenticate(req);return !!who&&(!address||who.address===address.toLowerCase());}:undefined});
  function save(input: AnalysisInput, context: Context) {
    const record = { ...evaluate(input, context), id: randomUUID(), createdAt: new Date().toISOString(),
      fingerprint: createHash('sha256').update(JSON.stringify({ chainId: input.chainId, transaction: input.transaction })).digest('hex') };
    return store.save(record);
  }
  async function analyze(input: AnalysisInput) {
    let context: Context;
    try { context = await (options.context ?? collectContext)(input); }
    catch { context = { source: 'rpc', reputation: 'unknown', reputationSource: 'Query failed', error: 'The analysis service did not complete its on-chain query.', simulation: { status: 'unavailable', detail: 'The query failed.' } }; }
    return save(input, context);
  }
  if(service.mode==='local')registerWorkflow(app, store, { analyze, parse: body => { const parsed = inputSchema.safeParse(body); return parsed.success ? parsed.data : null; }, receipt: options.receipt });
  app.get('/api/health', async () => ({ ok: true, version: '0.4.1', mode: service.mode==='hosted'?'hosted-authenticated':'local-development' }));
  if(service.mode==='local'){
  app.get('/api/scenarios', async () => scenarios.map(({ context, ...rest }) => rest));
  app.get('/api/local', async () => localStatus());
  app.post('/api/local/fund', async (request, reply) => {
    if (!['http://127.0.0.1:5173', 'http://localhost:5173'].includes(request.headers.origin ?? '')) return reply.code(403).send({ error: 'Prepare test funds from the local workbench.' });
    const parsed = z.object({ address }).strict().safeParse(request.body);
    if (!parsed.success || /^0x0{40}$/i.test(parsed.data.address)) return reply.code(400).send({ error: 'Provide a valid nonzero wallet address.' });
    try { return await withLocalAssetMutation(()=>(options.fund ?? prepareLocalFunds)(parsed.data.address)); }
    catch(e) { return reply.code(e instanceof LocalAssetBusyError?409:503).send({ error:e instanceof LocalAssetBusyError?e.message:'Test funding did not complete. Run the launcher again to update the local contracts, then retry. Check on-chain balances for the actual result.' }); }
  });
  app.post<{ Params: { id: string } }>('/api/demo/:id', async (request, reply) => {
    const scenario = scenarios.find(s => s.id === request.params.id);
    if (!scenario) return reply.code(404).send({ error: 'Demo scenario not found.' });
    return save(scenario.input, scenario.context);
  });
  app.post('/api/analyze', async (request, reply) => {
    const parsed = inputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid transaction. Supply chainId, from, to and hexadecimal data. Analysis context and preset risk conclusions are not accepted.' });
    return analyze(parsed.data);
  });
  app.get('/api/records', async () => store.list().map(record => ({ ...record, demoEvents: store.events(record.id) })));
  app.get<{ Params: { id: string } }>('/api/records/:id', async (request, reply) => {
    const record = store.get(request.params.id);
    return record ? { ...record, demoEvents: store.events(record.id) } : reply.code(404).send({ error: 'Check record not found.' });
  });
  app.post<{ Params: { id: string } }>('/api/records/:id/demo-decision', async (request, reply) => {
    const record = store.get(request.params.id);
    if (!record) return reply.code(404).send({ error: 'Check record not found.' });
    if (record.source !== 'demo') return reply.code(409).send({ error: 'Demo actions cannot record actual wallet outcomes.' });
    const parsed = z.object({ action: z.enum(['cancel', 'acknowledge']) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid demo action.' });
    store.event(record.id, parsed.data.action);
    return { ok: true, message: parsed.data.action === 'cancel' ? 'Demo cancellation recorded. No actual wallet request was canceled.' : 'Demo read action recorded.', outcome: 'unknown' };
  });
  }
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    reply.code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({ error: 'The request did not complete. Check the service and input format.' });
  });
  if(service.mode==='hosted')await app.register(staticFiles,{root:resolve('dist/web'),prefix:'/'});
  return app;
}
