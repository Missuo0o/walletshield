import {executionLimitations,UNSUPPORTED_TRANSACTION_FIELDS} from '../../src/security/transaction-fields';
const address=(value:unknown)=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)?value.toLowerCase():value;
const quantity=(value:unknown)=>typeof value==='string'&&/^0x[\da-f]{1,64}$/i.test(value)?`0x${BigInt(value).toString(16)}`:value;
function normalized(value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Missing request');
 const request=value as Record<string,any>;
 if(request.kind==='transaction'){
  if(!request.transaction||typeof request.transaction!=='object'||Array.isArray(request.transaction))throw Error('Missing transaction');
  const tx:Record<string,any>={...request.transaction,from:address(request.transaction.from),to:address(request.transaction.to??null),data:typeof request.transaction.data==='string'?request.transaction.data.toLowerCase():request.transaction.data,value:quantity(request.transaction.value??'0x0')};
  for(const key of ['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'])if(tx[key]!==undefined)tx[key]=quantity(tx[key]);
  // The API recomputes this list from the received envelope. Order and repeated
  // markers are immaterial, but removing an unsupported field never is.
  if(tx.unsupportedFields!==undefined&&(!Array.isArray(tx.unsupportedFields)||tx.unsupportedFields.some((item:unknown)=>typeof item!=='string'||!(UNSUPPORTED_TRANSACTION_FIELDS as readonly string[]).includes(item))))throw Error('Invalid execution markers');
  tx.unsupportedFields=executionLimitations(tx).sort();
  if(Array.isArray(tx.authorizationList))tx.authorizationList=tx.authorizationList.map((tuple:Record<string,unknown>)=>({...tuple,address:address(tuple.address),chainId:quantity(tuple.chainId),nonce:quantity(tuple.nonce),yParity:quantity(tuple.yParity),r:quantity(tuple.r),s:quantity(tuple.s)}));
  return {...request,transaction:tx};
 }
 if(request.kind==='signature'){
  if(!request.signature||typeof request.signature!=='object'||Array.isArray(request.signature))throw Error('Missing signature');
  const signature={...request.signature,from:address(request.signature.from)};
  if(['personal_sign','eth_sign'].includes(signature.method)&&typeof signature.data==='string'&&/^0x(?:[\da-f]{2})*$/i.test(signature.data))signature.data=signature.data.toLowerCase();
  return {...request,signature};
 }
 throw Error('Unsupported request kind');
}
function canonical(value:unknown,budget={remaining:12000},depth=0):unknown{
 if(depth>32||--budget.remaining<0)throw Error('Request comparison limit');
 if(Array.isArray(value))return value.map(item=>canonical(item,budget,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key],budget,depth+1)]));
 return value;
}
/** Correlates the backend's echoed request with the exact wire request before
 * showing a report. This catches response/cache mixups, not a dishonest server
 * or the correctness/freshness of evidence for two identical requests. */
export function reportMatchesRequest(sent:unknown,returned:unknown):boolean{
 try{return JSON.stringify(canonical(normalized(sent)))===JSON.stringify(canonical(normalized(returned)));}catch{return false;}
}
