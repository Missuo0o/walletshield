import {readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {buildState} from './build-state.mjs';
import {runtimeConfig} from './configure-runtime.mjs';
import {releaseManifest,releaseChecksumFiles} from './release-manifest.mjs';
import {validateSnapShasum} from '@metamask/snaps-utils';
import {checkManifest} from '@metamask/snaps-utils/node';
import {resolve} from 'node:path';
const config=runtimeConfig(process.env);if(config.mode!=='hosted')throw Error('Only a hosted build can be packaged');
const generated=await readFile('src/runtime.generated.ts','utf8'),match=generated.match(/export const RUNTIME = (\{.*\}) as const;/);
if(!match||JSON.stringify(JSON.parse(match[1]))!==JSON.stringify(config))throw Error('Build hosted assets with these same settings before packaging');
let stamp;try{stamp=JSON.parse(await readFile('dist/build-state.json','utf8'));}catch{throw Error('No successful build stamp; build hosted assets first');}
if(JSON.stringify(stamp)!==JSON.stringify(await buildState()))throw Error('Release inputs differ from the last successful build; rebuild before packaging');
let repository;try{repository=new URL(process.env.WALLETSHIELD_REPOSITORY_URL??'');}catch{throw Error('Set the public source repository URL');}
if(repository.protocol!=='https:'||repository.username||repository.password||repository.search||repository.hash)throw Error('Repository must be a public HTTPS URL without credentials');
const source=JSON.parse(await readFile('snap/package.json','utf8')),builtManifest=JSON.parse(await readFile('snap/snap.manifest.json','utf8'));
const bundle=await readFile('snap/dist/bundle.js'),icon=await readFile('snap/images/icon.svg');
const pkg={name:config.snapId.slice(4),version:source.version,description:source.description??'Pre-sign EVM evidence and Muse risk analysis',main:'dist/bundle.js',private:false,files:['dist/bundle.js','images/icon.svg','snap.manifest.json','README.md'],repository:{type:'git',url:repository.href},license:source.license??'UNLICENSED'};
const manifest=await releaseManifest(builtManifest,pkg,bundle,icon);
const folder='dist/release-snap';await rm(folder,{recursive:true,force:true});await mkdir(folder+'/dist',{recursive:true});await mkdir(folder+'/images',{recursive:true});
await copyFile('snap/dist/bundle.js',folder+'/dist/bundle.js');await copyFile('snap/images/icon.svg',folder+'/images/icon.svg');
await writeFile(folder+'/package.json',JSON.stringify(pkg,null,2)+'\n');await writeFile(folder+'/snap.manifest.json',JSON.stringify(manifest,null,2)+'\n');
// Validate the actual copied release bytes, not just the source build inputs.
await validateSnapShasum(releaseChecksumFiles(JSON.parse(await readFile(folder+'/snap.manifest.json','utf8')),await readFile(folder+'/dist/bundle.js'),await readFile(folder+'/images/icon.svg')));
const validation=await checkManifest(resolve(folder,'snap.manifest.json'),{updateAndWriteManifest:false});
if(validation.reports.some(report=>report.severity==='error'))throw Error('The finalized release package failed Snap manifest validation');
await writeFile(folder+'/README.md',`# WalletShield Snap\n\nCompanion application: ${config.appOrigin}\n\nPre-sign advice only. No key custody, forced blocking or post-sign monitoring. Evidence and unsigned requests are sent to the configured companion service; optional model analysis uses Meta Muse Wonder. Review the source and service privacy/retention policy before installing.\n\nThis package was prepared locally. Packaging does not prove registry eligibility, publish it to npm, or establish production security.\n`);
await writeFile(folder+'/release-check.json',JSON.stringify({appOrigin:config.appOrigin,snapId:config.snapId,repository:repository.href,preparedAt:new Date().toISOString(),published:false,reviewRequired:['actual domain/TLS','MetaMask distribution compatibility','service policy and retention','end-to-end wallet testing']},null,2)+'\n');
console.log('Prepared isolated release artifact: '+folder+'. Nothing was published. Run npm pack --dry-run from that folder to inspect its allowlisted files.');
