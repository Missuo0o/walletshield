import type {FastifyRequest} from 'fastify';
import type {WalletAuth} from '../server/wallet-auth.js';
import type {Store} from '../server/store.js';
import type {LabSession} from './sessions.js';
import {HOSTED_LAB_CHAIN_ID} from './network.js';

export function labSessionAddress(session:LabSession){const r=session.request;return r.kind==='transaction'?r.transaction.from.toLowerCase():r.kind==='signature'?r.signature.from.toLowerCase():'';}
export function hostedLabAccess(auth:WalletAuth,store:Store,now=Date.now){
 // Fixtures have shared control state. A short exclusive lease makes that
 // explicit instead of pretending every wallet has an isolated chain.
 let lease:{address:string;expires:number}|undefined;
 const principal=(req:FastifyRequest)=>{const p=auth.authenticate(req);return p?.kind==='web'&&(p.chainId===undefined||p.chainId===HOSTED_LAB_CHAIN_ID)?p:null;};
 const owns=(req:FastifyRequest,address:string)=>principal(req)?.address===address.toLowerCase();
 function takeLease(address:string){const t=now();if(lease&&lease.expires>t&&lease.address!==address.toLowerCase())return false;lease={address:address.toLowerCase(),expires:t+15*60*1000};return true;}
 function takeRate(key:string,limit:number){return store.authRateAttempt('test-lab:'+key,Math.floor(now()/60000),limit);}
 return {principal,owns,takeLease,maySend:(address:string)=>!!lease&&lease.expires>now()&&lease.address===address.toLowerCase(),takeRate,
  mutation:(address:string)=>takeRate('mutate:'+address.toLowerCase(),4)&&store.authRateAttempt('test-lab:daily:'+address.toLowerCase(),Math.floor(now()/86400000),40),
  rpcRate:(ip:string)=>takeRate('rpc:global',360)&&takeRate('rpc:'+ip,120),
  lease:()=>lease&&lease.expires>now()?{active:true,expiresAt:new Date(lease.expires).toISOString()}: {active:false}};
}
export type HostedLabAccess=ReturnType<typeof hostedLabAccess>;
