import {HOSTED_LAB_ENABLED} from '../src/testing/network.js';
import {labClient,verifiedLab} from '../src/testing/contracts.js';
if(!HOSTED_LAB_ENABLED)throw Error('This setup is only for an explicitly enabled hosted test lab.');
let ready=false;for(let attempt=0;attempt<30;attempt++){try{if(await labClient.getChainId()===31338){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
if(!ready)throw Error('Hosted test chain 31338 is unavailable.');
try{await verifiedLab();console.log('Existing hosted lab contracts verified.');}
catch{await import('./deploy.js');}
