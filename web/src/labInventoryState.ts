/** One current, verified local inventory. Request ordering and identity epochs
 * remain authoritative even when a transport ignores cancellation. */
export type LocalInventory={account:string;chainId:number;ready:boolean};
export type LabInventoryState<T>={identity:string;account:string;inventory:T|null;loading:boolean;error:string};
export function emptyLabInventory<T>(identity:string,account:string):LabInventoryState<T>{return {identity,account,inventory:null,loading:false,error:''};}
export function createLabInventoryController<T extends LocalInventory>(identity:string,account:string,onChange:(state:LabInventoryState<T>)=>void){
 let state=emptyLabInventory<T>(identity,account),generation=0,pending:AbortController|undefined,disposed=false;
 const emit=(next:LabInventoryState<T>)=>{state=next;onChange(next);};
 function cancel(){generation++;pending?.abort();pending=undefined;}
 return {
  state:()=>state,
  reset(nextIdentity:string,nextAccount:string){if(disposed)return;cancel();emit(emptyLabInventory<T>(nextIdentity,nextAccount));},
  invalidate(){if(disposed)return;cancel();emit(emptyLabInventory<T>(state.identity,state.account));},
  dispose(){cancel();disposed=true;state=emptyLabInventory<T>(state.identity,state.account);},
  async refresh(load:(account:string,signal:AbortSignal)=>Promise<T>){
   if(disposed)return;cancel();if(!state.account){emit(emptyLabInventory<T>(state.identity,state.account));return;}
   const request=++generation,controller=new AbortController(),requestedAccount=state.account;pending=controller;
   emit({...state,inventory:null,loading:true,error:''});
   try{
    const inventory=await load(requestedAccount,controller.signal);
    if(disposed||request!==generation||controller.signal.aborted)return;
    if(inventory.account.toLowerCase()!==requestedAccount.toLowerCase()||inventory.chainId!==31337)throw Error('The returned inventory does not match this account and local chain.');
    emit({...state,inventory,loading:false,error:''});
   }catch(error){
    if(disposed||request!==generation||controller.signal.aborted)return;
    emit({...state,inventory:null,loading:false,error:error instanceof Error?error.message:'Could not verify the local asset inventory.'});
   }finally{if(request===generation)pending=undefined;}
  }
 };
}
