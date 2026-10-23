import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const allowed=new Set(['WALLETSHIELD_SERVICE_MODE','WALLETSHIELD_APP_ORIGIN','WALLETSHIELD_SNAP_PACKAGE','WALLETSHIELD_REPOSITORY_URL','WALLETSHIELD_WALLET_DAILY_LIMIT','WALLETSHIELD_MAX_SCANS','WALLETSHIELD_SCAN_WALLET_DAILY_LIMIT','WALLETSHIELD_SCAN_IP_DAILY_LIMIT','WALLETSHIELD_SCAN_GLOBAL_DAILY_LIMIT','WALLETSHIELD_REPORT_RETENTION_DAYS']);
let data;try{data=await readFile('.local/service.env','utf8');}catch{throw Error('Create .local/service.env from deploy/service.env.example first.');}
for(const line of data.split(/\r?\n/)){const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&allowed.has(m[1])&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}
if(process.env.WALLETSHIELD_SERVICE_MODE!=='hosted')throw Error('This launcher is hosted-only');
const command=process.argv[2];const args=command==='build'?['node_modules/npm/bin/npm-cli.js','run','build']:command==='start'?['--import','tsx','src/server/index.ts']:command==='package'?['scripts/package-release.mjs']:null;
if(!args)throw Error('Use service.mjs build, start or package');
// npm is not necessarily installed inside node_modules.
const child=command==='build'?spawn('npm',['run','build'],{stdio:'inherit',env:process.env}):spawn(process.execPath,args,{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>process.exit(1));child.on('exit',code=>process.exit(code??1));
