import {stringToHex} from 'viem';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import type {SecurityRequest,SecurityReport} from '../security/types.js';
export type LabSession={id:string;caseId:string;createdAt:string;request:SecurityRequest;tokenHash:string;status:'pending'|'signed'|'submitted'|'rejected'|'error'|'confirmed'|'reverted';transactionHash?:`0x${string}`;reportId?:string;note?:string};
function sorted(value:any):any {if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])]));return value;}
export function comparableRequest(request:SecurityRequest){
 if(request.kind==='transaction'){const t=request.transaction;return JSON.stringify({kind:'transaction',chainId:request.chainId,from:t.from.toLowerCase(),to:t.to?.toLowerCase()??null,data:t.data.toLowerCase(),value:String(BigInt(t.value??'0x0')),origin:request.origin??null});}
 if(request.kind==='signature'){let data=request.signature.data;if(typeof data==='string'&&request.signature.method.startsWith('eth_signTypedData')){try{data=JSON.parse(data);}catch{/* Invalid data remains unmatched. */}}if(typeof data==='string'&&request.signature.method==='personal_sign'&&!/^0x/i.test(data))data=stringToHex(data);if(typeof data==='string'&&/^0x/i.test(data))data=data.toLowerCase();return JSON.stringify(sorted({kind:'signature',chainId:request.chainId,from:request.signature.from.toLowerCase(),method:request.signature.method,data,origin:request.origin??null}));}
 return null;
}
export function matchLabReport(sessions:LabSession[],report:SecurityReport){const request=comparableRequest(report.request);const when=Date.parse(report.createdAt);const matches=sessions.filter(s=>!s.reportId&&when>=Date.parse(s.createdAt)&&when-Date.parse(s.createdAt)<10*60*1000&&comparableRequest(s.request)===request);return matches.length===1?{...matches[0],reportId:report.id}:null;}
export function newLabSession(caseId:string,request:SecurityRequest){const token=randomUUID()+randomUUID();return {session:{id:randomUUID(),caseId,createdAt:new Date().toISOString(),request,tokenHash:createHash('sha256').update(token).digest('hex'),status:'pending'} as LabSession,token};}
export function validLabToken(session:LabSession,token:string){const hash=createHash('sha256').update(token).digest('hex');return timingSafeEqual(Buffer.from(hash),Buffer.from(session.tokenHash));}
export function publicLabSession(session:LabSession){const {tokenHash,...rest}=session;return rest;}
