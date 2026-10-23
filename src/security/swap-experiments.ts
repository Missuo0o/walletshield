import {decodeFunctionData,encodeFunctionData,parseAbi,toFunctionSelector,type Abi,type Address,type Hex} from 'viem';
import type {Operation,SecurityRequest} from './types.js';

export const MAX_V3_EXPERIMENT_HOPS=8;
// Official ISwapRouter and IV3SwapRouter shapes. Exact-output packed paths are
// output-to-input in both interfaces; they must not be read as a forward route.
export const V3_EXPERIMENT_ABI=parseAbi([
 'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params)',
 'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params)',
 'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params)',
 'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params)',
 'function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum) params)',
 'function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)',
 'function exactOutput((bytes path,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum) params)',
 'function exactOutput((bytes path,address recipient,uint256 amountOut,uint256 amountInMaximum) params)'
]);
const address=(value:unknown):value is Address=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
const eq=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export type SwapExperiment={variant:'v2'|'v3_single'|'v3_path';input:Address;output:Address;tokens:Address[];fees:number[];method:string;exactOutput:boolean;recipient:Address;nativeInput:boolean;declaredInput:bigint;maximumInput?:bigint;requestedOutput?:bigint;deadline?:bigint;originalPriceLimit?:bigint;deadlinePresent:boolean};
export function decodePackedV3Path(path:unknown,exactOutput=false):{tokens:Address[];fees:number[]}|null {
 if(typeof path!=='string'||!/^0x(?:[\da-f]{2})+$/i.test(path))return null;
 const raw=path.slice(2),size=raw.length/2;
 if(size<43||(size-20)%23!==0||(size-20)/23>MAX_V3_EXPERIMENT_HOPS)return null;
 const tokens:Address[]=[`0x${raw.slice(0,40)}`],fees:number[]=[];
 for(let offset=40;offset<raw.length;offset+=46){fees.push(Number.parseInt(raw.slice(offset,offset+6),16));tokens.push(`0x${raw.slice(offset+6,offset+46)}`);}
 if(tokens.some(token=>!address(token))||tokens.some((token,i)=>i>0&&eq(token,tokens[i-1])))return null;
 if(exactOutput){tokens.reverse();fees.reverse();}
 return {tokens,fees};
}
export function encodePackedV3Path(tokens:readonly Address[],fees:readonly number[]):Hex {
 if(tokens.length!==fees.length+1||!fees.length||fees.length>MAX_V3_EXPERIMENT_HOPS||tokens.some(token=>!address(token))||fees.some(fee=>!Number.isSafeInteger(fee)||fee<0||fee>0xffffff))throw Error('Unsupported packed V3 route');
 return `0x${tokens[0].slice(2)}${fees.map((fee,i)=>fee.toString(16).padStart(6,'0')+tokens[i+1].slice(2)).join('')}`;
}

/** Canonical extraction only: protocol identity, funding and sentinel recipient
 * rules need independent observations before any derived experiment is run. */
export function swapExperiment(request:Extract<SecurityRequest,{kind:'transaction'}>,op:Operation):SwapExperiment|null {
 const tx=request.transaction;if(!address(tx.to)||!address(tx.from))return null;
 if(op.category==='swap_v3')try{
  const abi=V3_EXPERIMENT_ABI.filter(item=>toFunctionSelector(item)===tx.data.slice(0,10).toLowerCase());if(abi.length!==1)return null;
  const decoded=decodeFunctionData({abi,data:tx.data as Hex});
  if(encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args as never}).toLowerCase()!==tx.data.toLowerCase())return null;
  const p=(decoded.args as any)[0],exactOutput=decoded.functionName.startsWith('exactOutput'),single=decoded.functionName.endsWith('Single');
  const path=single?{tokens:[p.tokenIn,p.tokenOut] as Address[],fees:[Number(p.fee)]}:decodePackedV3Path(p.path,exactOutput);
  if(!path||path.tokens.some(token=>!address(token))||eq(path.tokens[0],path.tokens.at(-1)!)||!address(p.recipient))return null;
  const declaredInput=exactOutput?p.amountInMaximum:p.amountIn;
  if(typeof declaredInput!=='bigint'||declaredInput<=0n||exactOutput&&(typeof p.amountOut!=='bigint'||p.amountOut<=0n))return null;
  return {variant:single?'v3_single':'v3_path',input:path.tokens[0],output:path.tokens.at(-1)!,tokens:path.tokens,fees:path.fees,method:decoded.functionName,exactOutput,recipient:p.recipient,nativeInput:BigInt(tx.value??'0x0')>0n,declaredInput,...(exactOutput?{maximumInput:p.amountInMaximum,requestedOutput:p.amountOut}:{}),...(p.deadline!==undefined?{deadline:p.deadline}:{}),...(p.sqrtPriceLimitX96!==undefined?{originalPriceLimit:p.sqrtPriceLimitX96}:{}),deadlinePresent:p.deadline!==undefined};
 }catch{return null;}
 const path=op.fields.path,method=String(op.fields.method);
 if(!Array.isArray(path)||path.length<2||path.length>12||!path.every(address)||!['swapExactTokensForTokens','swapExactETHForTokens'].includes(method)||!address(op.fields.recipient))return null;
 return {variant:'v2',input:path[0],output:path.at(-1)!,tokens:path,fees:[],method,exactOutput:false,recipient:op.fields.recipient,declaredInput:BigInt(String(op.fields.amountIn)),nativeInput:method==='swapExactETHForTokens',deadline:BigInt(String(op.fields.deadline)),deadlinePresent:true};
}

/** Sell only the newly received amount, along the exact reverse forward route.
 * Never reuse an exact-output cap as an amount or reverse it twice. */
export function reverseSwapCalldata(experiment:SwapExperiment,acquired:bigint,recipient:Address):Hex {
 if(acquired<=0n||!address(recipient)||experiment.variant==='v2')throw Error('Unsupported reverse V3 experiment');
 const tokens=[...experiment.tokens].reverse(),fees=[...experiment.fees].reverse(),single=experiment.variant==='v3_single',method=single?'exactInputSingle':'exactInput';
 const abi=V3_EXPERIMENT_ABI.filter(item=>item.name===method&&item.inputs[0].components.some(component=>component.name==='deadline')===experiment.deadlinePresent) as Abi;
 const params={...(single?{tokenIn:tokens[0],tokenOut:tokens[1],fee:fees[0],sqrtPriceLimitX96:0n}:{path:encodePackedV3Path(tokens,fees)}),recipient,...(experiment.deadlinePresent?{deadline:experiment.deadline}:{}),amountIn:acquired,amountOutMinimum:0n};
 return encodeFunctionData({abi,functionName:method,args:[params]});
}
