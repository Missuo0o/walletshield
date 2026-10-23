import {hashStruct} from 'viem';
/** Called only after complete EIP-712 encoding validation. A witness hash
 * commits data; only the consuming contract defines its business enforcement. */
export function permitWitness(data:any):{type:string;hash:`0x${string}`;fields:string[]}|undefined{
 const primary=data?.primaryType,types=data?.types,fields=types?.[primary];
 if(!['PermitWitnessTransferFrom','PermitBatchWitnessTransferFrom'].includes(primary)||!Array.isArray(fields)||fields.length!==5)return;
 const expected=[`permitted:TokenPermissions${primary==='PermitBatchWitnessTransferFrom'?'[]':''}`,'spender:address','nonce:uint256','deadline:uint256'];
 if(fields.slice(0,4).map((f:any)=>`${f.name}:${f.type}`).join('|')!==expected.join('|')||fields[4]?.name!=='witness'||!/^[_A-Za-z][_A-Za-z0-9]{0,63}$/.test(fields[4]?.type??''))return;
 if(!Array.isArray(types.TokenPermissions)||types.TokenPermissions.map((f:any)=>`${f.name}:${f.type}`).join('|')!=='token:address|amount:uint256')return;
 const type=fields[4].type,body=types[type];if(!Array.isArray(body)||!body.length||body.length>32||body.some((f:any)=>!/^[_A-Za-z][_A-Za-z0-9]{0,63}$/.test(f.name)))return;
 try{return {type,hash:hashStruct({data:data.message.witness,primaryType:type,types}),fields:body.map((f:any)=>String(f.name))};}catch{return;}
}
