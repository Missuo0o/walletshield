import {writeFile} from 'node:fs/promises';
export function runtimeConfig(env=process.env){
 const mode=env.WALLETSHIELD_SERVICE_MODE??'local';
 // Snap authorization headers require CORS preflight from its opaque origin.
 // Vite consumes OPTIONS before its API proxy and does not allow Origin:null.
 // Send Snap requests straight to Fastify, which owns pairing/auth and CORS.
 if(mode==='local')return {mode,appOrigin:'http://127.0.0.1:5173',allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173'],apiBase:'http://127.0.0.1:8787/api',snapId:'local:http://127.0.0.1:8080'};
 if(mode!=='hosted')throw Error('Unknown deployment mode');
 const url=new URL(env.WALLETSHIELD_APP_ORIGIN??'');
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Release requires a non-loopback HTTPS origin');
 const name=env.WALLETSHIELD_SNAP_PACKAGE??'';
 if(!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)||name==='walletshield-snap')throw Error('Release requires an explicitly owned npm package name');
 return {mode,appOrigin:url.origin,allowedOrigins:[url.origin],apiBase:url.origin+'/api',snapId:'npm:'+name,testLab:env.WALLETSHIELD_ENABLE_TEST_LAB==='1'};
}
if(process.argv[1]?.endsWith('configure-runtime.mjs')){
 const runtime=runtimeConfig();await writeFile('src/runtime.generated.ts','// Generated nonsecret deployment settings; never put keys here.\nexport const RUNTIME = '+JSON.stringify(runtime)+' as const;\n');console.log('Configured '+runtime.mode+' build.');
}
