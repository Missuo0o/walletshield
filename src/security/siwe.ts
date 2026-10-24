import {hexToString} from 'viem';
import {z} from 'zod';
import type {Operation,SecurityRequest,Evidence} from './types.js';
import {evidence} from './evidence.js';

const labels=['URI','Version','Chain ID','Nonce','Issued At','Expiration Time','Not Before','Request ID','Resources'];
const date=z.iso.datetime({offset:true});
/** Bounded inspection of the supported EIP-4361 envelope. No signature is
 * generated or verified here, and the relying party's nonce store is unknown. */
export function parseLoginMessage(input:string){
 let message=input;try{if(/^0x[\da-f]*$/i.test(input))message=hexToString(input as `0x${string}`);}catch{message='';}
 const header=message.split('\n')[0]?.match(/^(?:(?<scheme>[A-Za-z][A-Za-z\d+.-]*):\/\/)?(?<domain>[^\s/?#]+) wants you to sign in with your Ethereum account:$/);
 const candidate=message.includes('wants you to sign in with your Ethereum account:');
 const fields:Operation['fields']={};const issues:string[]=[];
 if(!candidate)return {candidate:false,valid:false,fields,issues};
 const lines=message.split('\n');
 if(!header?.groups){issues.push('The login header does not match the supported SIWE format.');return {candidate,valid:false,fields,issues};}
 fields.domain=header.groups.domain;fields.scheme=header.groups.scheme??'https';fields.owner=lines[1]??'';
 if(!/^0x[\da-f]{40}$/i.test(String(fields.owner)))issues.push('The login account is not a valid EVM address.');
 if(lines[2]!==''||message.includes('\r'))issues.push('The login message has unexpected line separators.');
 let metadataStart=3;
 if(lines[3]!==''&&!lines[3]?.startsWith('URI: ')){if(lines[4]!=='')issues.push('The login statement is not separated from its fields.');metadataStart=5;}
 else if(lines[3]==='')metadataStart=4;
 const values=new Map<string,string>();let last=-1,inResources=false;const resources:string[]=[];
 for(const line of lines.slice(metadataStart)){
  if(inResources){if(!line.startsWith('- ')){issues.push('Unexpected content follows the resource list.');continue;}resources.push(line.slice(2));continue;}
  const match=line.match(/^([^:]+):(?: (.*))?$/);
  if(!match||!labels.includes(match[1])){issues.push('A login field is unknown or malformed.');continue;}
  const name=match[1],index=labels.indexOf(name);
  if(values.has(name)||index<=last)issues.push('Login fields are duplicated or out of order.');
  last=index;values.set(name,match[2]??'');if(name==='Resources')inResources=true;
 }
 for(const name of ['URI','Version','Chain ID','Nonce','Issued At'])if(!values.get(name))issues.push(`Required login field is missing: ${name}.`);
 if(values.get('Version')!=='1')issues.push('The supported SIWE version is 1.');
 const chain=values.get('Chain ID')??'';if(!/^\d+$/.test(chain)||!Number.isSafeInteger(Number(chain))||Number(chain)<=0)issues.push('The login chain ID is invalid.');else fields.chainId=chain;
 const nonce=values.get('Nonce')??'';fields.nonceLength=String(nonce.length);fields.nonceFormatValid=/^[A-Za-z\d]{8,}$/.test(nonce);
 if(!fields.nonceFormatValid)issues.push('The login nonce must contain at least eight alphanumeric characters.');
 for(const [label,key] of [['Issued At','issuedAt'],['Expiration Time','expiration'],['Not Before','notBefore']] as const){const value=values.get(label);if(value){if(date.safeParse(value).success)fields[key]=value;else issues.push(`Invalid RFC-3339 login timestamp: ${label}.`);}}
 try{const origin=new URL(`${fields.scheme}://${fields.domain}`);if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error();fields.domain=origin.host;fields.scheme=origin.protocol.slice(0,-1);}catch{issues.push('The login domain or scheme is invalid.');}
 try{const uri=new URL(values.get('URI')??'');if(uri.username||uri.password)throw Error();fields.uriOrigin=['https:','http:'].includes(uri.protocol)?uri.origin:`${uri.protocol}`;fields.uriScheme=uri.protocol.slice(0,-1);}catch{issues.push('The login URI is missing, invalid, or contains credentials.');}
 fields.resourceCount=String(resources.length);fields.resourceOrigins=resources.slice(0,16).map(raw=>{try{const url=new URL(raw);if(url.username||url.password)throw Error();return ['http:','https:'].includes(url.protocol)?url.origin:url.protocol;}catch{issues.push('A login resource URI is invalid or contains credentials.');return 'unverified';}});
 if(resources.length>16){fields.truncated=true;issues.push('More than 16 login resources; resource inspection is partial.');}
 fields.loginStructureValid=issues.length===0;fields.loginFormatIssues=[...new Set(issues)];
 return {candidate,valid:issues.length===0,fields,issues:[...new Set(issues)]};
}

export function loginEvidence(request:SecurityRequest,op:Operation,now=Date.now()):Evidence[]{
 if(request.kind!=='signature'||op.category!=='siwe')return [];
 const checks:Evidence[]=[];const add=(id:string,status:Evidence['status'],title:string,detail:string,data?:Record<string,unknown>)=>checks.push(evidence(id,status,title,detail,'rules/siwe',data));
 add('login_structure',op.fields.loginStructureValid===true?'pass':'unknown','SIWE envelope inspection',op.fields.loginStructureValid===true?'Required fields and supported ordering are present; this is not a signature or server nonce verification.':(op.fields.loginFormatIssues as string[]??['The login envelope is incomplete.']).join(' '),{loginStructureValid:op.fields.loginStructureValid===true,owner:op.fields.owner,domain:op.fields.domain,scheme:op.fields.scheme,declaredChainId:op.fields.chainId,resourceCount:op.fields.resourceCount});
 add('login_nonce','unknown','Login replay protection is unverified','Nonce format is observable, but the relying party must verify issuance, uniqueness and one-time use against its own store.',{nonceFormatValid:op.fields.nonceFormatValid===true,nonceLength:op.fields.nonceLength??'0'});
 const uri=op.fields.uriOrigin,domain=op.fields.domain,scheme=op.fields.scheme;
 if(typeof uri==='string'&&typeof domain==='string'){
  const expected=`${scheme}://${domain}`;
  add('login_uri',uri===expected?'pass':'warning','Login URI and domain comparison',uri===expected?'The HTTP(S) login URI origin matches the declared login authority; this does not authenticate the service.':'The login URI origin differs from the declared authority or uses a non-HTTP(S) scheme; verify the intended relying party.',{declaredOrigin:expected,uriOrigin:uri,matches:uri===expected});
 }
 try{if(request.origin&&new URL(request.origin).origin!==`${scheme}://${domain}`)add('login_origin','risk','Login origin mismatch','The declared login authority/scheme differs from the requesting website origin.',{sourceOrigin:new URL(request.origin).origin,declaredOrigin:`${scheme}://${domain}`,matches:false});}catch{add('login_origin','unknown','Login origin could not be compared','The requesting origin was absent or invalid.');}
 if(!request.origin)add('login_origin','unknown','Login origin was not supplied','The requesting website cannot be compared with the declared relying party.');
 for(const [key,when] of [['issuedAt','future'],['notBefore','future'],['expiration','past']] as const){
  const raw=op.fields[key];if(typeof raw!=='string')continue;const time=Date.parse(raw);if(!Number.isFinite(time))continue;
  if((when==='future'&&time>now+(key==='issuedAt'?300000:0))||(when==='past'&&time<=now))add(`login_time_${key}`,'warning','Login time condition needs review',`${key} is ${when==='future'?'later than':'at or before'} the local inspection clock. No authoritative relying-party clock or acceptance is verified.`,{field:key,value:raw,clock:'local'});
 }
 if(typeof op.fields.issuedAt==='string'&&typeof op.fields.expiration==='string'&&Date.parse(op.fields.expiration)<=Date.parse(op.fields.issuedAt))add('login_lifetime','warning','Login lifetime is inconsistent','The expiration is not after the issued-at time.');
 return checks;
}
