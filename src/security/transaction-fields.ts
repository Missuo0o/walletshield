/** Fields the current simulator cannot reproduce must not disappear at the
 * wallet boundary and turn into a successful ordinary substitute transaction. */
export const UNSUPPORTED_TRANSACTION_FIELDS = ['authorizationList','blobVersionedHashes','blobs','type_7702','accessList','maxFeePerBlobGas','type_blob','type_unknown','invalid_execution_fields'] as const;
export function unsupportedTransactionFields(raw:Record<string,unknown>):(typeof UNSUPPORTED_TRANSACTION_FIELDS)[number][] {
  const result:(typeof UNSUPPORTED_TRANSACTION_FIELDS)[number][]=[];
  for(const key of ['authorizationList','blobVersionedHashes','blobs','maxFeePerBlobGas'] as const)if(raw[key]!==undefined&&raw[key]!==null)result.push(key);
  if(raw.accessList!==undefined&&raw.accessList!==null&&(!Array.isArray(raw.accessList)||raw.accessList.length>0))result.push('accessList');
  if(raw.type!==undefined&&raw.type!==null){
    let type:number|null=null;
    if(typeof raw.type==='number'&&Number.isSafeInteger(raw.type)&&raw.type>=0)type=raw.type;
    else if(typeof raw.type==='string'&&/^0x[\da-f]{1,16}$/i.test(raw.type)){const n=Number(BigInt(raw.type));if(Number.isSafeInteger(n))type=n;}
    if(type===4)result.push('type_7702');else if(type===3)result.push('type_blob');else if(type===null||type>4)result.push('type_unknown');
  }
  if(['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce'].some(key=>raw[key]!==undefined&&raw[key]!==null&&(typeof raw[key]!=='string'||!/^0x[\da-f]{1,64}$/i.test(raw[key] as string))))result.push('invalid_execution_fields');
  return result;
}
