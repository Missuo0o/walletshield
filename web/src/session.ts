// Short-lived web credentials stay in memory, not browser persistent storage.
export type WebSession={token:string;address:string;expiresAt:string;chainId?:number};
export type SessionChange={session:WebSession|null;reason:'updated'|'cleared'|'expired'|'rejected'};
type Timers={now:()=>number;schedule:(callback:()=>void,ms:number)=>ReturnType<typeof setTimeout>;cancel:(timer:ReturnType<typeof setTimeout>)=>void};
const timers:Timers={now:()=>Date.now(),schedule:(callback,ms)=>setTimeout(callback,ms),cancel:timer=>clearTimeout(timer)};
/** Check the wall clock again after browser suspension or a long deadline. */
export function watchCredentialExpiry(expiresAt:number,onExpired:()=>void,clock:Timers=timers){
 let active=true,timer:ReturnType<typeof setTimeout>|undefined;
 const check=()=>{
  if(!active)return;
  const remaining=expiresAt-clock.now();
  if(!Number.isFinite(remaining)||remaining<=0){active=false;onExpired();return;}
  timer=clock.schedule(check,Math.min(remaining,2147483647));
  (timer as {unref?:()=>void})?.unref?.();
 };
 check();return()=>{active=false;if(timer!==undefined)clock.cancel(timer);};
}
export function createWebSessionStore(clock:Timers=timers){
 let value:WebSession|null=null,stop:(()=>void)|undefined,generation=0;
 const listeners=new Set<(change:SessionChange)=>void>();
 const change=(next:WebSession|null,reason:SessionChange['reason'])=>{
  stop?.();stop=undefined;value=next?{...next}:null;const revision=++generation;
  for(const listener of [...listeners]){if(revision!==generation)break;listener({session:value?{...value}:null,reason});}
  return revision;
 };
 const current=()=>{if(value&&(!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=clock.now()))change(null,'expired');return value?{...value}:null;};
 return {
  current,
  set(next:WebSession|null){
   if(!next){change(null,'cleared');return;}
   const expires=Date.parse(next.expiresAt);
   if(!Number.isFinite(expires)||expires<=clock.now()){change(null,'expired');return;}
   const revision=change(next,'updated');
   if(revision!==generation)return;
   const cancel=watchCredentialExpiry(expires,()=>{if(revision===generation)change(null,'expired');},clock);
   if(revision===generation)stop=cancel;else cancel();
  },
  reject(token:string){if(value?.token===token){change(null,'rejected');return true;}return false;},
  subscribe(listener:(change:SessionChange)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  dispose(){generation++;stop?.();stop=undefined;value=null;listeners.clear();},
 };
}
const store=createWebSessionStore();
export const setWebSession=store.set;
export const webSession=store.current;
export const subscribeWebSession=store.subscribe;
export function authHeaders():Record<string,string>{const current=webSession();return current?{Authorization:`Bearer ${current.token}`}:{ };}
/** An old failed request must not clear a newly verified session. Challenge or
 * signature-verification failure does not reject an existing credential. */
export function handleWebAuthFailure(status:number,authorization:string|undefined,path:string){
 const token=authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1],pathname=path.split('?')[0];
 const protectedRoute=/^\/api\/security\/(?:pair|scan|records(?:\/[^/]+(?:\/evidence)?)?)$/.test(pathname)||/^\/api\/wallet-auth\/(?:status|logout|revoke|reports\/delete)$/.test(pathname)||/^\/api\/networks\//.test(pathname);
 return status===401&&!!token&&protectedRoute?store.reject(token):false;
}
