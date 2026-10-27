import {LAB_CHAIN_ID,LAB_RPC_URL} from '../testing/network.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
export const META_MODEL = 'muse-wonder-1.0';
export const META_RESPONSES_URL = 'https://api.meta.ai/v1/responses';
export type SecurityConfig = { apiKey: string; model: string; aiEnabled: boolean; aiDailyLimit?:number; lookups: boolean; goPlusToken: string; rpc: Record<number,string>; traceRpc?:Record<number,string>; forkEnabled?:boolean; monitorEnabled?:boolean; snapToken?:string;sourceVerification?:boolean };

async function readEnv(path: string) {
  const values: Record<string,string> = {};
  try {
    for (const line of (await readFile(path,'utf8')).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/,'$2');
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return values;
}

export async function loadSecurityConfig(options: {root?: string; env?: NodeJS.ProcessEnv} = {}): Promise<SecurityConfig> {
  const root = options.root ?? process.cwd(), env = options.env ?? process.env;
  const [legacy, meta, network] = await Promise.all([
    readEnv(resolve(root,'.local/ai.env')),
    readEnv(resolve(root,'.local/meta.env')),
    readEnv(resolve(root,'.local/rpc.env')),
  ]);
  // Preserve old RPC/tool switches, but NEVER reuse the old OpenAI credentials.
  const get = (name: string) => env[name] ?? network[name] ?? meta[name] ?? legacy[name] ?? '';
  const getMeta = (name: string) => env[name] ?? meta[name] ?? '';
  const rpc: Record<number,string> = {[LAB_CHAIN_ID]: LAB_RPC_URL};
  const infuraKey = get('INFURA_API_KEY').trim();
  if (/^[A-Za-z0-9_-]+$/.test(infuraKey)) {
    rpc[1] = `https://mainnet.infura.io/v3/${infuraKey}`;
    rpc[11155111] = `https://sepolia.infura.io/v3/${infuraKey}`;
  }
  const ids = new Set([1,10,56,137,8453,42161,11155111,
    ...Object.keys({...legacy,...meta,...network,...env}).map(key => Number(key.match(/^RPC_(\d+)_URL$/)?.[1])).filter(id => Number.isSafeInteger(id) && id > 0)]);
  for (const id of ids) {
    if (id === 31337 || id === 31338) continue; // Local test funding must always refer to the owned local chain.
    const candidate = get(`RPC_${id}_URL`);
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (!url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) rpc[id] = candidate;
    } catch { /* Invalid configuration stays unavailable. */ }
  }
  // Dedicated tracing is optional and backend-only. It never defines the
  // canonical network/header and cannot override owned local-chain funding.
  const traceRpc:Record<number,string>={};
  for(const key of Object.keys({...legacy,...meta,...network,...env})){
    const id=Number(key.match(/^TRACE_RPC_(\d+)_URL$/)?.[1]);
    if(!Number.isSafeInteger(id)||id<=0||(id===31337||id===31338)||!rpc[id])continue;
    const candidate=get(key);if(!candidate)continue;
    try{const url=new URL(candidate);if(!url.username&&!url.password&&(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))traceRpc[id]=candidate;}catch{/* Invalid configuration stays unavailable. */}
  }
  const tokenPath = resolve(root,'.local/snap.token');
  await mkdir(resolve(root,'.local'),{recursive:true});
  try { await writeFile(tokenPath,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600}); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const snapToken = (await readFile(tokenPath,'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(snapToken)) throw Error('Invalid local pairing configuration');
  return {
    apiKey: getMeta('MODEL_API_KEY').trim(), model: META_MODEL,
    aiEnabled: (getMeta('ENABLE_META_AI') || getMeta('ENABLE_AI') || '1') !== '0',
    aiDailyLimit:/^\d+$/.test(getMeta('AI_DAILY_LIMIT'))&&Number(getMeta('AI_DAILY_LIMIT'))>=1&&Number(getMeta('AI_DAILY_LIMIT'))<=1000?Number(getMeta('AI_DAILY_LIMIT')):100,
    lookups: get('ENABLE_EXTERNAL_LOOKUPS') === '1', goPlusToken: get('GOPLUS_TOKEN'), rpc,...(Object.keys(traceRpc).length?{traceRpc}:{}),
    forkEnabled: get('ENABLE_FORK_SIMULATION') === '1',
    monitorEnabled: false, // v0.4.1 remains pre-sign advice only.
    snapToken,
    sourceVerification:get('ENABLE_SOURCE_VERIFICATION')==='1',
  };
}
