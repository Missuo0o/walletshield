/** Owns one identity's transient history. Late/aborted responses never cross an
 * identity boundary, even when a transport ignores AbortSignal. */
export type HistoryState<T>={identity:string;records:T[];selected:T|null;error:string};
export function emptyHistory<T>(identity:string):HistoryState<T>{return {identity,records:[],selected:null,error:''};}
export function createHistoryController<T extends {id:string}>(identity:string,onChange:(state:HistoryState<T>)=>void){
 let state=emptyHistory<T>(identity),generation=0,pending:AbortController|undefined,disposed=false;
 const emit=(next:HistoryState<T>)=>{state=next;onChange(next);};
 function cancel(){generation++;pending?.abort();pending=undefined;}
 return {
  state:()=>state,
  select(id:string){if(!disposed)emit({...state,selected:state.records.find(r=>r.id===id)??null});},
  reset(nextIdentity:string){if(disposed)return;cancel();emit(emptyHistory<T>(nextIdentity));},
  dispose(){cancel();disposed=true;state=emptyHistory<T>(state.identity);},
  async refresh(load:(signal:AbortSignal)=>Promise<T[]>){
   if(disposed)return;cancel();const request=++generation,controller=new AbortController();pending=controller;
   try{
    const records=await load(controller.signal);if(disposed||request!==generation||controller.signal.aborted)return;
    emit({...state,records,selected:state.selected?records.find(r=>r.id===state.selected!.id)??null:null,error:''});
   }catch{
    if(disposed||request!==generation||controller.signal.aborted)return;
    // A denied or failed reload must not leave previously authorized data shown.
    emit({...emptyHistory<T>(state.identity),error:'Could not load reports. Verify the current wallet identity and check that the backend service is online.'});
   }finally{if(request===generation)pending=undefined;}
  }
 };
}
