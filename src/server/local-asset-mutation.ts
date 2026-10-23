export class LocalAssetBusyError extends Error {
 constructor(){super('Another local asset operation is in progress. Wait for it to finish, then retry.');}
}
let active=false;
/** Serialize setup/cleanup routes that share the local fixture administrator. */
export async function withLocalAssetMutation<T>(run:()=>Promise<T>):Promise<T>{
 if(active)throw new LocalAssetBusyError();
 active=true;
 try{return await run();}finally{active=false;}
}
