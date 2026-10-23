import {toFunctionSelector,zeroAddress} from 'viem';
import {decodeRequest} from './decode.js';
import {evidence} from './evidence.js';
import type {Evidence,Operation,SecurityRequest} from './types.js';

export const BATCH_LIMITS={depth:3,entries:32,bodyBytes:16_384,totalBytes:32_768} as const;
const definitions=[
 'multicall(bytes[])','multicall(uint256,bytes[])',
 'execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
 'multiSend(bytes)'
] as const;
const wrappers=new Map(definitions.map(name=>[toFunctionSelector(name).toLowerCase(),name]));
type Wrapper=typeof definitions[number];
type Child={data:`0x${string}`;target:string|null;targetBasis:string;valueWei:string|null;encodedValueWei?:string;callType:'CALL'|'DELEGATECALL'|'wrapper-defined';zeroTargetSemanticsUnverified?:boolean};
type Parsed={wrapper:Wrapper;children:Child[];summary:Record<string,unknown>};
type Frame=Child&{path:string;depth:number};
const hex=(value:string)=>/^0x(?:[\da-f]{2})*$/i.test(value);
const bytes=(value:string)=>(value.length-2)/2;
const wrap=(value:string)=>wrappers.get(value.slice(0,10).toLowerCase());

// Inspect lengths/offsets before any ABI decoder allocates dynamic arrays. Exact
// offsets, padding and final length deliberately reject noncanonical encodings.
function parse(data:`0x${string}`,target:string|null):Parsed|null {
 const wrapper=wrap(data);if(!wrapper)return null;
 if(!hex(data)||bytes(data)>BATCH_LIMITS.bodyBytes)throw Error('body_limit');
 const body=data.slice(10),size=body.length/2;
 const word=(offset:number)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+32>size)throw Error('malformed');return BigInt('0x'+body.slice(offset*2,(offset+32)*2));};
 const integer=(offset:number)=>{const value=word(offset);if(value>BigInt(size))throw Error('malformed');return Number(value);};
 const address=(offset:number)=>{const raw=word(offset);if(raw>=2n**160n)throw Error('malformed');return '0x'+raw.toString(16).padStart(40,'0');};
 const dynamic=(offset:number)=>{
  if(offset%32)throw Error('malformed');
  const length=integer(offset),start=offset+32,end=start+length,paddedEnd=start+Math.ceil(length/32)*32;
  if(paddedEnd>size||!/^(?:00)*$/.test(body.slice(end*2,paddedEnd*2)))throw Error('malformed');
  return {data:('0x'+body.slice(start*2,end*2)) as `0x${string}`,length,end:paddedEnd};
 };
 if(wrapper.startsWith('multicall(')) {
  const deadline=wrapper==='multicall(uint256,bytes[])',head=deadline?64:32;
  if(integer(deadline?32:0)!==head)throw Error('malformed');
  const count=integer(head),table=head+32;
  if(count>Math.floor((size-table)/32))throw Error('malformed');
  let end=table+count*32;const children:Child[]=[];
  for(let i=0;i<count;i++) {
   if(integer(table+i*32)!==end-table)throw Error('malformed');
   const child=dynamic(end);end=child.end;
   children.push({data:child.data,target,targetBasis:'same-wrapper-address candidate; execution context unverified',valueWei:null,callType:'wrapper-defined'});
  }
  if(end!==size)throw Error('malformed');
  return {wrapper,children,summary:{declaredChildren:count,...(deadline?{deadline:String(word(0))}:{}),valueRouting:'Each child’s value routing and CALL/DELEGATECALL mode are not specified by the ABI shape.'}};
 }
 if(wrapper.startsWith('execTransaction(')) {
  if(integer(64)!==320)throw Error('malformed');
  const payload=dynamic(320),signatureOffset=integer(288);
  if(signatureOffset!==payload.end)throw Error('malformed');
  const signatures=dynamic(signatureOffset);if(signatures.end!==size)throw Error('malformed');
  const operation=word(96);if(operation>1n)throw Error('unsupported_operation');
  const encodedValueWei=String(word(32)),delegate=operation===1n;
  return {wrapper,children:[{data:payload.data,target:address(0),targetBasis:'explicit encoded address; deployment identity unverified',valueWei:delegate?null:encodedValueWei,encodedValueWei,callType:delegate?'DELEGATECALL':'CALL'}],summary:{declaredChildren:1,safeTxGas:String(word(128)),baseGas:String(word(160)),gasPrice:String(word(192)),gasToken:address(224),refundReceiver:address(256),signatureBytes:signatures.length,signaturesVerified:false,refundSemanticsVerified:false}};
 }
 if(integer(0)!==32)throw Error('malformed');
 const packed=dynamic(32);if(packed.end!==size)throw Error('malformed');
 const raw=packed.data.slice(2),packedSize=raw.length/2;let offset=0;const children:Child[]=[];
 // Official Safe layout: uint8 operation, address (20), value (32),
 // dataLength (32), then data. Deployment/version identity remains unverified.
 // https://github.com/safe-fndn/safe-smart-account/blob/main/contracts/libraries/MultiSend.sol
 while(offset<packedSize) {
  if(packedSize-offset<85)throw Error('malformed');
  const operation=parseInt(raw.slice(offset*2,offset*2+2),16);if(operation>1)throw Error('unsupported_operation');
  const to='0x'+raw.slice((offset+1)*2,(offset+21)*2),value=BigInt('0x'+raw.slice((offset+21)*2,(offset+53)*2));
  const length=BigInt('0x'+raw.slice((offset+53)*2,(offset+85)*2));
  if(length>BigInt(packedSize-offset-85))throw Error('malformed');
  const start=offset+85,end=start+Number(length),delegate=operation===1;
  children.push({data:('0x'+raw.slice(start*2,end*2)) as `0x${string}`,target:to===zeroAddress?null:to,targetBasis:to===zeroAddress?'zero-address/self semantics vary by MultiSend deployment':'explicit packed address; deployment identity unverified',valueWei:delegate?null:String(value),encodedValueWei:String(value),callType:delegate?'DELEGATECALL':'CALL',...(to===zeroAddress?{zeroTargetSemanticsUnverified:true}:{})});
  offset=end;
 }
 return {wrapper,children,summary:{declaredChildren:children.length,packedLayout:'uint8 operation + address20 + uint256 value + uint256 dataLength + data',deploymentVersionVerified:false}};
}

const allowedFields=new Set(['method','spender','operator','approved','amountOrTokenId','amount','unlimited','recipient','owner','tokenId','ids','amounts','deadline','expiration','newController','account','role','action','token','tokenIn','tokenOut','tokens','path','amountIn','amountOut','amountOutMin','amountOutMinimum','amountInMaximum','receiver','amountKind','localToken','remoteToken','authorityChange','newAuthority','removedAuthority','threshold','module','guard','fallbackHandler','newOwner','removedOwner','executionTarget','executionOperation','executionValueSemantics','amount0Desired','amount1Desired','amount0Min','amount1Min','amount0Max','amount1Max','tickLower','tickUpper','liquidity','fee','quantityMeaning','stage','messageSender','destinationVerified']);
function parameters(op:Operation,valueKnown:boolean):{fields:Record<string,string|boolean|string[]>;truncated:boolean} {
 const fields:Record<string,string|boolean|string[]>={};let truncated=false;
 for(const [key,value] of Object.entries(op.fields)) {
  if(!allowedFields.has(key))continue;
  if(key==='recipient'&&['depositETH','depositERC20','bridgeETH','bridgeERC20','withdraw'].includes(String(op.fields.action)))continue;
  if(key==='amountIn'&&op.fields.method==='swapExactETHForTokens'&&!valueKnown)continue;
  if(typeof value==='boolean')fields[key]=value;
  else if(typeof value==='string'){if(value.length<=100)fields[key]=value;else truncated=true;}
  else {const retained=value.slice(0,16).filter(item=>item.length<=100);fields[key]=retained;if(retained.length!==value.length)truncated=true;}
 }
 return {fields,truncated};
}

/** Structural child evidence only. No RPC, simulation, protocol authentication,
 * signature verification or verified child sender/storage context is inferred.
 * Raw child calldata and Safe signatures never leave this helper. */
export function batchEvidence(request:SecurityRequest,op:Operation):Evidence[] {
 if(request.kind!=='transaction')return [];
 const root=request.transaction,rootWrapper=wrap(root.data);
 if(!rootWrapper&&op.category!=='batch')return [];
 const facts:Evidence[]=[],source='calldata/batch-v1';let inspected=0,totalBytes=0,limits=0;
 const gap=(path:string,reason:string,detail:string,frame?:Frame)=>{facts.push(evidence(`batch_gap_${path.replaceAll('.','_')}_${reason}`,'unknown','Batch inspection is incomplete',detail,source,{path,reason,...(frame?{depth:frame.depth,target:frame.target,targetBasis:frame.targetBasis,valueWei:frame.valueWei,callType:frame.callType,selector:frame.data.slice(0,10),calldataBytes:bytes(frame.data),abiShapeDecoded:false,childSenderVerified:false,childOwnerVerified:false}:{})}));limits++;};
 facts.push(evidence('batch_execution_context','unknown','Batch execution context is unverified','Wrapper selectors and child parameters are ABI-shape candidates. Actual implementation, CALL/DELEGATECALL behavior, child msg.sender, asset owner, storage context, signature acceptance and full effects need authenticated code and execution evidence.',source,{protocolIdentityVerified:false,childSenderVerified:false,childOwnerVerified:false,executionSimulated:false}));
 if(!rootWrapper){gap('0','unsupported_wrapper','This batch/router wrapper is not one of the four structurally supported encodings. No opaque command bytes are presented as decoded child operations.');return facts;}
 const inspect=(frame:Frame,isRoot=false)=>{
  if(!hex(frame.data)){gap(frame.path,'malformed','The child bytes are malformed; the unread operation remains unknown.',frame);return;}
  const length=bytes(frame.data);
  if(length>BATCH_LIMITS.bodyBytes){gap(frame.path,'body_limit','A wrapper or child body exceeds the per-body byte limit.',frame);return;}
  if(totalBytes+length>BATCH_LIMITS.totalBytes){gap(frame.path,'byte_limit','The aggregate recursively inspected byte budget is exhausted; repeated nested payloads are counted again.',frame);return;}
  totalBytes+=length;
  let parsed:Parsed|null;
  try{parsed=parse(frame.data,frame.target);}catch(error){gap(frame.path,error instanceof Error?error.message:'malformed','The known selector has malformed, noncanonical, unsupported or over-limit wrapper parameters. Its children were not accepted as decoded.',frame);return;}
  const childRequest:Extract<SecurityRequest,{kind:'transaction'}>={kind:'transaction',chainId:request.chainId,transaction:{from:zeroAddress,to:frame.target,data:frame.data,value:'0x'+BigInt(frame.valueWei??'0').toString(16)}};
  // The placeholder sender is never included in output. Defaults derived from
  // it (onBehalfOf, deposit recipient, native values) are not allowlisted.
  const candidate=isRoot?op:decodeRequest(childRequest);
  if(!isRoot) {
   const summary=parameters(candidate,frame.valueWei!==null),unknown=!parsed&&!candidate.decoded;
   const delegated=frame.callType==='DELEGATECALL';
   const delegatedEmpty=delegated&&frame.data==='0x';if(delegatedEmpty)delete summary.fields.recipient;
   facts.push(evidence(`batch_child_${frame.path.replaceAll('.','_')}`,delegated?'risk':unknown?'unknown':'warning',delegated?'Encoded delegatecall grants execution authority':unknown?'Child operation is not understood':'Child operation candidate extracted',delegated?'If executed as encoded, target code runs in the calling account’s context. Full authority, implementation identity and effects remain unverified.':'This is a bounded structural interpretation of encoded parameters, not verified execution or protocol identity.',source,{path:frame.path,depth:frame.depth,target:frame.target,targetBasis:frame.targetBasis,valueWei:frame.valueWei,...(frame.encodedValueWei!==undefined?{encodedValueWei:frame.encodedValueWei,encodedValueIgnoredByDelegatecall:delegated}:{}),callType:frame.callType,selector:frame.data.slice(0,10),calldataBytes:length,category:parsed?'batch':delegatedEmpty?'delegated_code_execution':candidate.category,abiShapeDecoded:!parsed&&!delegatedEmpty&&candidate.decoded,tokenCandidate:!parsed&&!delegated?candidate.token??null:null,wrapperEncodingRecognized:Boolean(parsed),protocolIdentityVerified:false,childSenderVerified:false,childOwnerVerified:false,...(frame.zeroTargetSemanticsUnverified?{zeroTargetSemanticsUnverified:true}:{}),authority:{addsPermissionCandidate:candidate.addsPermission??null,rawSigningCandidate:candidate.rawSigning??false,tokenStandardCandidate:candidate.tokenStandard??null,delegatecallEncoded:delegated},parameters:summary.fields,parametersTruncated:summary.truncated,...(parsed?{wrapper:parsed.wrapper,wrapperParameters:parsed.summary}:{})}));
   if(summary.truncated)gap(frame.path,'parameter_limit','Some child summary fields or array entries exceed the extraction bounds and were omitted.');
   if(unknown){if(delegated)gap(frame.path,'unknown_child','The encoded delegatecall authority is observable, but its child operation semantics are not understood.',frame);return;}
  }
  if(!parsed)return;
  if(isRoot)facts.push(evidence('batch_structure','warning','Supported batch wrapper encoding recognized','Canonical wrapper parameters can be inspected, but this does not authenticate a Safe, router or MultiSend deployment or prove execution.',source,{wrapper:parsed.wrapper,...parsed.summary,limits:BATCH_LIMITS}));
  if(frame.depth>=BATCH_LIMITS.depth&&parsed.children.length){gap(frame.path,'depth_limit','The nested wrapper reaches the maximum recursion depth; deeper children were not inspected.');return;}
  for(let index=0;index<parsed.children.length;index++) {
   if(inspected>=BATCH_LIMITS.entries){gap(frame.path,'entry_limit',`The ${BATCH_LIMITS.entries}-entry global child limit is exhausted; remaining children were not inspected.`);break;}
   inspected++;inspect({...parsed.children[index],path:`${frame.path}.${index}`,depth:frame.depth+1});
  }
 };
 inspect({data:root.data as `0x${string}`,target:root.to??null,targetBasis:'outer transaction target',valueWei:String(BigInt(root.value??'0x0')),callType:'CALL',path:'0',depth:0},true);
 facts.push(evidence('batch_inventory','warning','Bounded batch inspection inventory','These counts describe attempted and summarized encoded children, not complete execution, safety or detection accuracy.',source,{attemptedChildren:inspected,summarizedChildren:facts.filter(fact=>fact.id.startsWith('batch_child_')).length,recursivelyInspectedBytes:totalBytes,extractionGaps:limits,unresolvedChecks:facts.filter(fact=>fact.status==='unknown').length,limits:BATCH_LIMITS}));
 return facts;
}
