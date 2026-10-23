import {RUNTIME} from '../runtime.generated.js';
export type ServiceConfig={mode:'local'|'hosted';origin:string;origins:string[];hosts:string[];walletDailyLimit:number;maxScans:number;scanWalletDailyLimit?:number;scanIpDailyLimit?:number;scanGlobalDailyLimit?:number;reportRetentionDays?:number};
export function serviceConfig(env:NodeJS.ProcessEnv=process.env):ServiceConfig{
 const mode=env.WALLETSHIELD_SERVICE_MODE??RUNTIME.mode;
 if(mode!=='local'&&mode!=='hosted')throw Error('Invalid service mode');
 if(mode==='local')return {mode,origin:'http://127.0.0.1:5173',origins:['http://127.0.0.1:5173','http://localhost:5173'],hosts:['127.0.0.1','localhost','[::1]'],walletDailyLimit:100,maxScans:1};
 const value=env.WALLETSHIELD_APP_ORIGIN??RUNTIME.appOrigin;let url:URL;
 try{url=new URL(value);}catch{throw Error('Hosted mode requires an explicit HTTPS application origin');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Hosted mode requires a non-loopback HTTPS origin');
 const limit=env.WALLETSHIELD_WALLET_DAILY_LIMIT??'20',concurrency=env.WALLETSHIELD_MAX_SCANS??'3';
 if(!/^\d+$/.test(limit)||Number(limit)<1||Number(limit)>1000||!/^\d+$/.test(concurrency)||Number(concurrency)<1||Number(concurrency)>8)throw Error('Invalid hosted limits');
 const bounded=(key:string,fallback:string,min:number,max:number)=>{const value=env[key]??fallback;if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error('Invalid hosted evidence or retention limits');return Number(value);};
 return {mode,origin:url.origin,origins:[url.origin],hosts:[url.host],walletDailyLimit:Number(limit),maxScans:Number(concurrency),scanWalletDailyLimit:bounded('WALLETSHIELD_SCAN_WALLET_DAILY_LIMIT','100',1,10000),scanIpDailyLimit:bounded('WALLETSHIELD_SCAN_IP_DAILY_LIMIT','300',1,100000),scanGlobalDailyLimit:bounded('WALLETSHIELD_SCAN_GLOBAL_DAILY_LIMIT','1000',1,1000000),reportRetentionDays:bounded('WALLETSHIELD_REPORT_RETENTION_DAYS','0',0,3650)};
}
export function permittedHost(host:string|undefined,service:ServiceConfig){
 if(!host)return false;
 return service.mode==='local'?/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host):service.hosts.includes(host.toLowerCase());
}
