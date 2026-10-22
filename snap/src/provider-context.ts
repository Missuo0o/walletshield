type Provider={request:(request:{method:string})=>Promise<unknown>};
/** A provider snapshot is NOT proof of the signing dApp's origin-specific
 * network. Preserve it separately from a typed message's declared domain. */
export async function providerContext(provider:Provider|undefined){
 if(!provider)return undefined;let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([provider.request({method:'eth_chainId'}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('context timeout')),1200);})]);
  if(typeof result!=='string'||!/^0x[\da-f]{1,16}$/i.test(result))return undefined;
  const chainId=Number(BigInt(result));if(!Number.isSafeInteger(chainId)||chainId<=0)return undefined;
  return {chainId,observedAt:new Date().toISOString(),source:'snap-provider' as const};
 }catch{return undefined;}finally{if(timer)clearTimeout(timer);}
}
