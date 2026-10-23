import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'vite';
import config from '../vite.config.js';

test('real development server denies private workspace files through @fs while shared source remains available',async()=>{
 const root=await mkdtemp(join(tmpdir(),'walletshield-dev-files-')),marker='NONSECRET_PRIVATE_FILE_AUDIT_MARKER';
 const privateFiles=['.local/meta.env','.local/rpc.env','.local/walletshield.sqlite','.local/walletshield.sqlite-wal','.audit-build/raw-report.json','.presentation-build/private.json','.env','.env.test','credential.pem','pairing.token','web/.local/secret.txt'];
 for(const relative of [...privateFiles,'src/visible.ts','web/index.html']){const file=join(root,relative);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,privateFiles.includes(relative)?marker:relative.endsWith('.html')?'<html><body>Fixture</body></html>':'export const visible = true;');}
 const server=await createServer({configFile:false,root:join(root,'web'),logLevel:'silent',server:{...config.server,host:'127.0.0.1',port:0,strictPort:false,proxy:undefined,fs:{...config.server!.fs,allow:[root]}}});
 try{
  await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  const normal=await fetch(base+'/@fs'+join(root,'src/visible.ts'));assert.equal(normal.status,200);assert.match(await normal.text(),/visible/);
  for(const relative of privateFiles){const response=await fetch(base+'/@fs'+join(root,relative));assert.equal(response.status,403,relative);assert.ok(!(await response.text()).includes(marker),relative);}
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
