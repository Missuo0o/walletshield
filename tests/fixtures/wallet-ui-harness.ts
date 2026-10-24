import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

/** Runs the production component's actual callbacks with minimal hook storage.
 * This is not browser/MetaMask acceptance: React scheduling/rendering, JSX child
 * components and wallet/network transports are intentionally not exercised. */
const hooks=`let values=[],index=0,effects=[],pending=[];
export function useState(initial){const at=index++;if(!(at in values))values[at]=typeof initial==='function'?initial():initial;return [values[at],next=>{values[at]=typeof next==='function'?next(values[at]):next;}];}
export function useRef(initial){const at=index++;if(!(at in values))values[at]={current:initial};return values[at];}
export function useEffect(fn,deps){const at=index++,old=effects[at];if(!old||!deps||deps.some((value,i)=>value!==old.deps[i]))pending.push(()=>{old?.cleanup?.();effects[at]={deps,cleanup:fn()};});}
export function render(fn){index=0;const tree=fn();for(const effect of pending.splice(0))effect();return tree;}
export function state(){return [...values];}
export function dispose(){for(const effect of effects)effect?.cleanup?.();values=[];effects=[];pending=[];}
export default {createElement:(type,props,...children)=>({type,props:{...props,children}})};`;
export type TestElement={type:unknown;props:Record<string,any>};
export function elements(tree:unknown,type:unknown):TestElement[]{
 if(!tree||typeof tree!=='object')return [];
 const node=tree as TestElement,out:TestElement[]=node.type===type?[node]:[];
 for(const value of Object.values(node.props??{}))for(const child of Array.isArray(value)?value:[value])out.push(...elements(child,type));return out;
}
export async function walletComponentHarness(name:'PublicWalletCheck'|'WalletLab'){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),directory=await mkdtemp(join(tmpdir(),'walletshield-wallet-ui-'));
 const entry=`import {render,dispose,state} from 'react';import {${name}} from './web/src/${name}.tsx';export {dispose,state};export function renderComponent(props){return render(()=>${name}(props));}`;
 try{
  const built=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',plugins:[{name:'wallet-callback-test-hooks',setup(plugin){
   plugin.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'mock'}));plugin.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:'jsx',namespace:'mock'}));
   plugin.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'mock'}));plugin.onResolve({filter:/\.\/SecurityReportView$/},()=>({path:'report',namespace:'mock'}));
   if(name==='PublicWalletCheck')plugin.onResolve({filter:/\.\/WalletLab$/},()=>({path:'api',namespace:'mock'}));
   plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='hooks'?hooks:args.path==='jsx'?`export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment='fragment';`:args.path==='icons'?`export const Activity=()=>null,Wallet=()=>null,Loader2=()=>null,RotateCcw=()=>null,ShieldCheck=()=>null;`:args.path==='api'?`export const labApi=(...args)=>globalThis.__walletUiTestApi(...args);`:`export const SecurityReportView=()=>null;`,loader:'js'}));
  }}]});
  const file=join(directory,`${name}.mjs`);await writeFile(file,built.outputFiles[0].text);
  const module=await import(pathToFileURL(file).href) as {renderComponent:(props:any)=>TestElement;state:()=>unknown[];dispose:()=>void};
  return {...module,close:async()=>{module.dispose();await rm(directory,{recursive:true,force:true});}};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
