import { createHash,randomUUID } from 'node:crypto';
import { createPublicClient,http,erc20Abi,keccak256,toHex,pad } from 'viem';
import { z } from 'zod';
import type { SecurityConfig } from './config.js';
import type { Store } from '../server/store.js';
export const watchSchema=z.object({chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),address:z.string().regex(/^0x[\da-f]{40}$/i),tokens:z.array(z.string().regex(/^0x[\da-f]{40}$/i)).max(16).default([])}).strict();
export type Watch={id:string;chainId:number;address:string;tokens:string[];createdAt:string;active:boolean;cursor?:string;cursorHash?:string;lastCheckedAt?:string;status:'waiting'|'ok'|'error';message:string;nativeBalance?:string;tokenBalances?:Record<string,string>};
export type Alert={id:string;watchId:string;createdAt:string;level:'high'|'review'|'unknown';title:string;detail:string;transactionHash?:string;blockNumber?:string;data?:Record<string,unknown>};
const transfer=keccak256(toHex('Transfer(address,address,uint256)')),approval=keccak256(toHex('Approval(address,address,uint256)')),operator=keccak256(toHex('ApprovalForAll(address,address,bool)'));
const singles=keccak256(toHex('TransferSingle(address,address,address,uint256,uint256)')),batches=keccak256(toHex('TransferBatch(address,address,address,uint256[],uint256[])'));
export function newWatch(input:z.infer<typeof watchSchema>):Watch{return {...input,tokens:[...new Set(input.tokens.map(v=>v.toLowerCase()))],id:randomUUID(),createdAt:new Date().toISOString(),active:true,status:'waiting',message:'No baseline yet; legacy observation starts at the first successful check, not all historical activity.'};}
export function eventAlert(watch:Watch,log:any):Alert|null {
  const topics=log.topics??[];const account=pad(watch.address.toLowerCase() as `0x${string}`);
  const outgoing=topics[0]===transfer&&topics[1]?.toLowerCase()===account||[singles,batches].includes(topics[0])&&topics[2]?.toLowerCase()===account;
  const grants=[approval,operator].includes(topics[0])&&topics[1]?.toLowerCase()===account;
  if(!outgoing&&!grants)return null;
  const identity=`${watch.id}:${log.transactionHash}:${String(log.logIndex)}:${topics[0]}`;
  return {id:createHash('sha256').update(identity).digest('hex'),watchId:watch.id,createdAt:new Date().toISOString(),level:'review',title:outgoing?'Observed outgoing-asset event':'Observed approval change',detail:'Observed chain logs do not establish maliciousness or all asset changes; verify whether the action was intended.',transactionHash:log.transactionHash,blockNumber:String(log.blockNumber),data:{contract:log.address,topics:topics.slice(0,4),value:log.data}};
}
export async function checkWatch(watch:Watch,config:SecurityConfig,clientOverride?:any):Promise<{watch:Watch;alerts:Alert[]}>{
  const next={...watch,lastCheckedAt:new Date().toISOString()};const alerts:Alert[]=[];
  if(!watch.active)return {watch,alerts};
  try {
    const url=config.rpc[watch.chainId];if(!url&&!clientOverride)throw Error('No RPC');const client=clientOverride??createPublicClient({transport:http(url!,{timeout:2200,retryCount:0})});
    if(await client.getChainId()!==watch.chainId)throw Error('Wrong network');
    const latest=await client.getBlockNumber({cacheTime:0});
    let cursor=watch.cursor===undefined?latest:BigInt(watch.cursor),reset=false;
    if(cursor>latest){cursor=latest;reset=true;alerts.push({id:randomUUID(),watchId:watch.id,createdAt:new Date().toISOString(),level:'unknown',title:'Local chain height decreased; resetting the legacy baseline',detail:'Old and new chain states are incomparable; earlier events may be invalid.'});}
    else if(watch.cursor!==undefined&&watch.cursorHash){const old=await client.getBlock({blockNumber:cursor});if(old.hash!==watch.cursorHash){cursor=cursor>32n?cursor-32n:0n;reset=true;alerts.push({id:randomUUID(),watchId:watch.id,createdAt:new Date().toISOString(),level:'unknown',title:'Observed reorganization or local-chain reset',detail:'The observation window was rewound; earlier events may no longer be canonical.'});}}
    const end=cursor+16n<latest?cursor+16n:latest;
    if(watch.cursor!==undefined&&end>cursor){
      const account=pad(watch.address.toLowerCase() as `0x${string}`);
      const raw=await Promise.all([
        client.request({method:'eth_getLogs',params:[{fromBlock:toHex(cursor+1n),toBlock:toHex(end),topics:[[transfer,approval,operator],account]}]}),
        client.request({method:'eth_getLogs',params:[{fromBlock:toHex(cursor+1n),toBlock:toHex(end),topics:[[singles,batches],null,account]}]})
      ]);
      if(raw.flat().length>1000)throw Error('Event range exceeds coverage');
      for(const log of raw.flat()){const alert=eventAlert(watch,log);if(alert)alerts.push(alert);}
      for(let b=cursor+1n;b<=end;b++){
        const block=await client.getBlock({blockNumber:b,includeTransactions:true});
        if(block.transactions.length>2000)throw Error('Block exceeds coverage');
        for(const tx of block.transactions){if(typeof tx!=='object'||tx.from.toLowerCase()!==watch.address.toLowerCase()||tx.value<=0n)continue;
          alerts.push({id:createHash('sha256').update(`${watch.id}:${tx.hash}:native`).digest('hex'),watchId:watch.id,createdAt:new Date().toISOString(),level:'review',title:'Observed outgoing-native transaction',detail:'The transaction is in a block; execution and refunds require receipt checks, not an assumed loss.',transactionHash:tx.hash,blockNumber:String(b),data:{to:tx.to,valueWei:String(tx.value)}});
        }
      }
    }
    const [balance,block]=await Promise.all([client.getBalance({address:watch.address,blockNumber:end}),client.getBlock({blockNumber:end})]);
    const tokenBalances:Record<string,string>={};let incomplete=false;
    for(const token of watch.tokens){try{tokenBalances[token]=String(await client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[watch.address],blockNumber:end}));}catch{incomplete=true;}}
    if(!reset&&watch.nativeBalance!==undefined&&BigInt(balance)<BigInt(watch.nativeBalance))alerts.push({id:createHash('sha256').update(`${watch.id}:${block.hash}:balance`).digest('hex'),watchId:watch.id,createdAt:new Date().toISOString(),level:'review',title:'Native balance decreased',detail:'The change can include gas, transfers and calls; a balance decrease alone does not establish an attack.',blockNumber:String(end),data:{before:watch.nativeBalance,after:String(balance)}});
    for(const [token,amount]of Object.entries(tokenBalances))if(!reset&&watch.tokenBalances?.[token]!==undefined&&BigInt(amount)<BigInt(watch.tokenBalances[token]))alerts.push({id:createHash('sha256').update(`${watch.id}:${block.hash}:${token}`).digest('hex'),watchId:watch.id,createdAt:new Date().toISOString(),level:'review',title:'Watched token balance decreased',detail:'The watched balance decreased; ordinary spending, delegated use and unexpected use need review.',blockNumber:String(end),data:{token,before:watch.tokenBalances[token],after:amount}});
    Object.assign(next,{cursor:String(end),cursorHash:block.hash,nativeBalance:String(balance),tokenBalances,status:incomplete?'error':'ok',message:incomplete?'Some token reads failed; logs were inspected but missing balances are not treated as zero.':end<latest?'Catching up at most 16 blocks per cycle; latest state is not yet covered.':'Legacy read cycle complete for watched accounts, standard logs and selected tokens only.'});
  }catch{next.status='error';next.message='Legacy query failed or network unavailable; cursor unchanged and no all-clear conclusion.';}
  return {watch:next,alerts};
}
export function startMonitor(store:Store,getConfig:()=>Promise<SecurityConfig>){
  let busy=false,closed=false;
  const tick=async(force=false)=>{if(busy||closed)return;busy=true;try{const config=await getConfig();if(!force&&!config.monitorEnabled)return;for(const watch of store.watchList().filter(w=>w.active).slice(0,8)){if(closed)break;const result=await checkWatch(watch,config);store.watchSave(result.watch);for(const alert of result.alerts)store.alertSave(alert);}}finally{busy=false;}};
  const timer=setInterval(()=>void tick().catch(()=>{}),30000);timer.unref();
  return {tick:()=>tick(true),close:()=>{closed=true;clearInterval(timer);}};
}
