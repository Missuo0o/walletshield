import test from 'node:test';
import assert from 'node:assert/strict';
import {getSnapChecksum,validateSnapShasum} from '@metamask/snaps-utils';
import {checkManifest} from '@metamask/snaps-utils/node';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {releaseManifest,releaseChecksumFiles} from '../scripts/release-manifest.mjs';
const bundle=new TextEncoder().encode('exports.onTransaction = async () => ({ content: {} });'),icon=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
const manifest=()=>({version:'0.4.1',description:'Offline release checksum fixture',repository:{type:'git',url:'git+https://github.com/example/source.git',directory:'snap'},proposedName:'WalletShield Local',source:{shasum:'old-build-checksum',location:{npm:{packageName:'walletshield-snap',filePath:'dist/bundle.js',iconPath:'images/icon.svg',registry:'https://registry.npmjs.org/'}}},initialPermissions:{'endowment:transaction-insight':{allowTransactionOrigin:true,maxRequestTime:90000},'endowment:network-access':{}},platformVersion:'12.1.0',manifestVersion:'0.1'});
const packageMetadata={name:'@owned-scope/walletshield',version:'0.4.1',repository:{type:'git',url:'https://github.com/example/release'}};

test('release checksum uses finalized name/package, source and icon without mutating the built manifest',async()=>{
 const original=manifest();original.source.shasum=await getSnapChecksum(releaseChecksumFiles(original,bundle,icon));const before=structuredClone(original);
 const release=await releaseManifest(original,packageMetadata,bundle,icon);assert.deepEqual(original,before);assert.equal(release.proposedName,'WalletShield');assert.equal(release.source.location.npm.packageName,'@owned-scope/walletshield');assert.deepEqual(release.repository,packageMetadata.repository);assert.notEqual(release.source.shasum,original.source.shasum);
 await validateSnapShasum(releaseChecksumFiles(release,bundle,icon));assert.deepEqual(release.initialPermissions,original.initialPermissions);
 const stale={...release,source:{...release.source,shasum:original.source.shasum}};await assert.rejects(validateSnapShasum(releaseChecksumFiles(stale,bundle,icon)),/shasum does not match/);
});
test('the official checksum rejects changes to the packaged manifest, bundle or icon',async()=>{
 const release=await releaseManifest(manifest(),packageMetadata,bundle,icon),changed=new TextEncoder().encode('changed bytes');
 await assert.rejects(validateSnapShasum(releaseChecksumFiles({...release,proposedName:'Different'},bundle,icon)),/shasum does not match/);
 await assert.rejects(validateSnapShasum(releaseChecksumFiles(release,changed,icon)),/shasum does not match/);await assert.rejects(validateSnapShasum(releaseChecksumFiles(release,bundle,changed)),/shasum does not match/);
});
test('release packaging rejects undeclared auxiliary/localization files and paths outside its copied allowlist',async()=>{
 for(const change of [(value:any)=>value.source.files=['private.txt'],(value:any)=>value.source.locales=['locale.json'],(value:any)=>value.source.location.npm.filePath='../private.js',(value:any)=>value.source.location.npm.iconPath='other.svg']){
  const value=manifest();change(value);await assert.rejects(releaseManifest(value,packageMetadata,bundle,icon),/explicit bundle and icon allowlist/);
 }
});
test('the finalized package passes official manifest validation including repository metadata matching',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'walletshield-release-checksum-'));
 try{
  await symlink(resolve('node_modules'),join(folder,'node_modules'),'dir');
  const release=await releaseManifest(manifest(),packageMetadata,bundle,icon);await mkdir(join(folder,'dist'));await mkdir(join(folder,'images'));await writeFile(join(folder,'dist/bundle.js'),bundle);await writeFile(join(folder,'images/icon.svg'),icon);await writeFile(join(folder,'package.json'),JSON.stringify(packageMetadata));await writeFile(join(folder,'snap.manifest.json'),JSON.stringify(release));
  const checked=await checkManifest(join(folder,'snap.manifest.json'),{updateAndWriteManifest:false});assert.deepEqual(checked.reports.filter(report=>report.severity==='error'),[]);
  const wrong={...release,repository:manifest().repository};wrong.source={...wrong.source,shasum:await getSnapChecksum(releaseChecksumFiles(wrong,bundle,icon))};await writeFile(join(folder,'snap.manifest.json'),JSON.stringify(wrong));
  const rejected=await checkManifest(join(folder,'snap.manifest.json'),{updateAndWriteManifest:false});assert.ok(rejected.reports.some(report=>report.id==='repository-match'&&report.severity==='error'));
 }finally{await rm(folder,{recursive:true,force:true});}
});
