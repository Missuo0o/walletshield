const address=(value:unknown)=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
export function sensitiveRpcField(key:string,value:unknown){return /private.?key|secret|mnemonic|password|passphrase|(?:^|[_-])seed(?:$|[_-])|seed.?phrase|api.?key|(?:access|auth|bearer|refresh)[_-]?token/i.test(key)||/signature/i.test(key)||/^session[_-]?key$/i.test(key)&&!address(value);}
/** Retain unsigned public fields; report bounds rather than silently implying
 * that a truncated operation has been completely analyzed. */
export function sanitizeRpcParams(value:unknown){
 let removed=false,truncated=false,nodes=0;
 function visit(item:unknown,depth:number):unknown{
  if(depth>8||++nodes>2048){truncated=true;return null;}
  if(Array.isArray(item)){if(item.length>64)truncated=true;return item.slice(0,64).map(v=>visit(v,depth+1));}
  if(item&&typeof item==='object'){const entries=Object.entries(item);if(entries.length>96)truncated=true;return Object.fromEntries(entries.slice(0,96).filter(([key,v])=>{if(sensitiveRpcField(key,v)){removed=true;return false;}return true;}).map(([key,v])=>[key,visit(v,depth+1)]));}
  return typeof item==='bigint'?String(item):item;
 }
 const params=visit(value,0);return {params,removed,truncated};
}
