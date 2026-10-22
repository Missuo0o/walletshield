import {decodeFunctionData,encodeFunctionData,parseAbi,toFunctionSelector} from 'viem';
import type {Operation,SecurityRequest} from './types.js';

// ABI candidates only. References: Safe OwnerManager/ModuleManager interfaces,
// https://docs.safe.global/reference-smart-account/transactions/execTransaction
// https://github.com/safe-global/safe-smart-account/tree/main/contracts/base
// Safe getGuard is INTERNAL, not a public state getter.
export const accountOperationAbi=parseAbi([
 'function addOwnerWithThreshold(address owner,uint256 _threshold)',
 'function removeOwner(address prevOwner,address owner,uint256 _threshold)',
 'function swapOwner(address prevOwner,address oldOwner,address newOwner)',
 'function changeThreshold(uint256 _threshold)',
 'function enableModule(address module)',
 'function disableModule(address prevModule,address module)',
 'function setGuard(address guard)',
 'function setFallbackHandler(address handler)',
 'function approveHash(bytes32 hashToApprove)',
 'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool success)'
]);
const zero='0x0000000000000000000000000000000000000000';
const distinct=(values:string[])=>[...new Map(values.map(value=>[value.toLowerCase(),value])).values()];
/** Decode only exact, canonically re-encoded Safe-shaped transaction calldata.
 * Familiar selectors establish no contract identity or authorization validity. */
export function decodeAccountOperation(request:SecurityRequest):Operation|null{
 if(request.kind!=='transaction'||!request.transaction.to)return null;
 try{
  const tx=request.transaction,decoded=decodeFunctionData({abi:accountOperationAbi,data:tx.data as `0x${string}`});
  const abi=accountOperationAbi.filter(item=>item.type==='function'&&toFunctionSelector(item)===tx.data.slice(0,10).toLowerCase());
  if(encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args as never}).toLowerCase()!==tx.data.toLowerCase())return null;
  const args=(decoded.args??[]) as readonly unknown[],method=decoded.functionName;
  const fields:Operation['fields']={method,account:tx.to!,protocolIdentity:'Safe-style ABI candidate only; deployment and authorization are unverified'};
  let addsPermission=false,label='Smart-account control change candidate',category='account_control';
  const targets=[tx.to!];
  function address(key:string,index:number){const value=String(args[index]);fields[key]=value;return value;}
  function authority(key:string,index:number,grant:boolean){const value=address(key,index);fields[grant?'newAuthority':'removedAuthority']=value;targets.push(value);addsPermission=grant;return value;}
  switch(method){
   case 'addOwnerWithThreshold':fields.authorityChange='add_owner';authority('newOwner',0,true);fields.threshold=String(args[1]);break;
   case 'removeOwner':fields.authorityChange='remove_owner';address('prevOwner',0);authority('removedOwner',1,false);fields.threshold=String(args[2]);break;
   case 'swapOwner':fields.authorityChange='replace_owner';address('prevOwner',0);address('removedOwner',1);authority('newOwner',2,true);break;
   case 'changeThreshold':fields.authorityChange='change_threshold';fields.threshold=String(args[0]);break;
   case 'enableModule':fields.authorityChange='enable_module';authority('module',0,true);break;
   case 'disableModule':fields.authorityChange='disable_module';address('prevModule',0);authority('module',1,false);break;
   case 'setGuard':{const value=address('guard',0);fields.authorityChange=value.toLowerCase()===zero?'remove_guard':'set_guard';if(value.toLowerCase()!==zero){fields.newAuthority=value;targets.push(value);addsPermission=true;}break;}
   case 'setFallbackHandler':{const value=address('fallbackHandler',0);fields.authorityChange=value.toLowerCase()===zero?'remove_fallback_handler':'set_fallback_handler';if(value.toLowerCase()!==zero){fields.newAuthority=value;targets.push(value);addsPermission=true;}break;}
   case 'approveHash':fields.authorityChange='approve_hash';fields.approvedHashBytes='32';fields.hashPreimageKnown=false;fields.hashMeaning='The original action cannot be derived from this hash alone';addsPermission=true;break;
   case 'execTransaction':{
    category='account_execution';label='Smart-account execution wrapper candidate';fields.authorityChange='execute';
    const destination=address('executionTarget',0),payload=String(args[2]),operation=Number(args[3]),signatures=String(args[9]);targets.push(destination);
    fields.executionValueWei=String(args[1]);fields.executionOperationCode=String(operation);fields.executionOperation=operation===0?'call':operation===1?'delegatecall':'unsupported';fields.executionSemanticsKnown=operation===0||operation===1;
    fields.executionContext=operation===0?'Candidate CALL from the account to the target':operation===1?'Candidate DELEGATECALL: target code runs in the account context':'Unsupported operation semantics';fields.executionValueSemantics=operation===1?'Encoded value is not a separate native transfer under DELEGATECALL':'Encoded value is a candidate CALL amount, not observed asset movement';
    fields.innerSelector=payload.length>=10?payload.slice(0,10):'0x';fields.innerCalldataBytes=String((payload.length-2)/2);fields.signatureBytes=String((signatures.length-2)/2);fields.signaturesVerified=false;
    fields.safeTxGas=String(args[4]);fields.baseGas=String(args[5]);fields.gasPrice=String(args[6]);
    const gasToken=address('gasToken',7),refundReceiver=address('refundReceiver',8);if(gasToken.toLowerCase()!==zero)targets.push(gasToken);if(refundReceiver.toLowerCase()!==zero)targets.push(refundReceiver);
    fields.refundSemantics='Candidate refund parameters; fees or payment can be due even if the inner call fails';
    break;
   }
   default:return null;
  }
  return {category,label,decoded:true,fields,targets:distinct(targets),addsPermission,complex:true};
 }catch{return null;}
}
