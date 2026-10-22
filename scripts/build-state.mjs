import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runtimeConfig} from './configure-runtime.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildState(){
 const inputs=[];
 async function walk(path){for(const item of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=path+'/'+item.name;if(item.isDirectory())await walk(name);else if(item.isFile())inputs.push(name);}}
 for(const path of ['src','snap/src','web/src'])await walk(path);
 inputs.push('package.json','snap/package.json','snap/snap.manifest.json','vite.config.ts');
 const source=createHash('sha256');for(const path of inputs.sort()){source.update(path+'\0');source.update(await readFile(path));source.update('\0');}
 return {runtime:runtimeConfig(),sourceHash:source.digest('hex'),bundleHash:hash(await readFile('snap/dist/bundle.js')),webIndexHash:hash(await readFile('dist/web/index.html'))};
}
if(process.argv[1]?.endsWith('build-state.mjs')){await writeFile('dist/build-state.json',JSON.stringify(await buildState(),null,2)+'\n');console.log('Successful build fingerprint recorded.');}
