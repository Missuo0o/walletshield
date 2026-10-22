/** Bounded public request facts for a wallet confirmation panel, not a new collector. */
export function adviceLine(value:string):string{
 const names:Record<string,string>={pause_and_verify:'Pause and independently verify the purpose, addresses and permission scope.',proceed_with_caution:'Proceed cautiously after reviewing unfinished checks.',do_not_sign:'Do not sign yet; verify the reported risks first.',do_not_proceed:'Pause this operation and verify the risks.',reject:'Reject this request.',cancel:'Cancel this request.'};
 return names[value]??value;
}
export function operationLines(operation?:{label?:string;fields?:Record<string,unknown>}):string[]{
 const names:Record<string,string>={recipient:'Recipient',spender:'Spender',operator:'Collection operator',owner:'Asset owner',amount:'Raw amount',amountOrTokenId:'Raw amount / token ID',valueWei:'Native amount (wei)',amountIn:'Raw input',amountOutMin:'Minimum raw output',amountOutMinimum:'Minimum raw output',amountInMaximum:'Maximum raw input',tokenId:'NFT ID',tokens:'Tokens',deadline:'Submission deadline',expiration:'Expiration',onBehalfOf:'Account acted for',action:'Action',scope:'Permission scope',method:'Method',domainName:'Signature domain name',domainChainId:'Declared signature chain',verifyingContract:'Declared verifying contract',nonce:'Nonce'};
 const fields=operation?.fields??{};const lines:string[]=[];
 for(const [key,label]of Object.entries(names)){const value=fields[key];if(value===undefined||value==='')continue;const scalar=typeof value==='string'||typeof value==='boolean'?String(value):Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,3).join(', '):'';if(scalar)lines.push(`${label}: ${scalar.length>180?scalar.slice(0,180)+'…':scalar}`);if(lines.length===6)break;}
 return lines;
}
export function missingLines(report:{missingData?:string[];checks:{status:string;title:string}[];ai?:{result?:{missing_data?:string[]}}}):{items:string[];total:number}{
 const missing=[...new Set([...(report.missingData??report.checks.filter(c=>c.status==='unknown').map(c=>c.title)),...(report.ai?.result?.missing_data??[])])];
 return {items:missing.slice(0,6),total:missing.length};
}
