import {readFile,stat} from 'node:fs/promises';
import {evaluationDigest,evaluateIndependentLabels,independentLabelsSchema} from '../src/evaluation/independent-evaluation.js';

const args=process.argv.slice(2),usage='Read-only, no model/RPC/config/database access:\nnode --import tsx scripts/evaluate-independent.ts --labels=PATH --predictions=PATH\nFreeze a reviewed label manifest hash:\nnode --import tsx scripts/evaluate-independent.ts --labels=PATH --hash-only\nOutput is JSON on stdout. Redirect to a new private file if needed; input files are never written.';
if(args.length===1&&args[0]==='--help'){console.log(usage);}else{
 if(args.some(arg=>!arg.startsWith('--labels=')&&!arg.startsWith('--predictions=')&&arg!=='--hash-only'))throw Error(usage);
 const option=(name:string)=>{const values=args.filter(arg=>arg.startsWith(`${name}=`));if(values.length>1)throw Error('Duplicate option');return values[0]?.slice(name.length+1);};
 const labelsPath=option('--labels'),predictionsPath=option('--predictions'),hashOnly=args.includes('--hash-only');
 if(!labelsPath||(hashOnly?!!predictionsPath:!predictionsPath)||args.filter(arg=>arg==='--hash-only').length>1)throw Error(usage);
 const readJSON=async(path:string)=>{const info=await stat(path);if(!info.isFile()||info.size>16000000)throw Error('Expected a JSON file no larger than 16 MB');const data=await readFile(path);if(data.length>16000000)throw Error('JSON input exceeds 16 MB');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));};
 const labels=await readJSON(labelsPath);
 console.log(hashOnly?evaluationDigest(independentLabelsSchema.parse(labels)):JSON.stringify(evaluateIndependentLabels(labels,await readJSON(predictionsPath!)),null,2));
}
