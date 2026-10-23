import {evaluateLive,evaluateOffline,LIVE_EVAL_LIMITS} from '../src/evaluation/ai-evaluation.js';
const args=process.argv.slice(2),live=args.includes('--live');
const read=(name:string)=>args.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);
const allowed=args.every(arg=>['--live','--confirm-paid','--help'].includes(arg)||/^--(?:max-calls|repeats|cases)=/.test(arg));
if(!allowed)throw Error('Unknown evaluation option');
if(args.includes('--help')){
 console.log('Offline (default, no API/RPC/config/database access): npm run evaluate:ai\nOptional paid synthetic evaluation: npm run evaluate:ai -- --live --confirm-paid --max-calls=2 --repeats=2 --cases=native-clear\nMODEL_API_KEY must be supplied in the process environment. No .local file is read or written. Limits: '+JSON.stringify(LIVE_EVAL_LIMITS));
}else if(!live){
 if(args.length)throw Error('Paid/budget options require --live; no request was made');
 console.log(JSON.stringify(evaluateOffline(),null,2));
}else{
 const result=await evaluateLive({confirmPaid:args.includes('--confirm-paid'),maxCalls:Number(read('--max-calls')),repeats:Number(read('--repeats')??'1'),caseIds:(read('--cases')??'').split(',').filter(Boolean)},process.env.MODEL_API_KEY??'');
 console.log(JSON.stringify(result,null,2));
}
