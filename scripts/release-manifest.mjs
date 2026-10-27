import {getSnapChecksum,validateSnapShasum,VirtualFile} from '@metamask/snaps-utils';

export function releaseChecksumFiles(manifest,bundle,icon){
 const location=manifest?.source?.location?.npm;
 if(location?.filePath!=='dist/bundle.js'||location?.iconPath!=='images/icon.svg'||manifest.source.files?.length||manifest.source.locales?.length)throw Error('Release packaging only supports its explicit bundle and icon allowlist');
 return {manifest:new VirtualFile({path:'snap.manifest.json',value:JSON.stringify(manifest),result:manifest}),sourceCode:new VirtualFile({path:location.filePath,value:bundle}),svgIcon:new VirtualFile({path:location.iconPath,value:icon}),auxiliaryFiles:[],localizationFiles:[]};
}
/** Snap checksums include the finalized manifest and icon as well as source.
 * Changing a release name/package without recomputing it breaks installation. */
export async function releaseManifest(original,packageMetadata,bundle,icon){
 const manifest=structuredClone(original);
 manifest.proposedName='WalletShield';manifest.version=packageMetadata.version;manifest.repository=structuredClone(packageMetadata.repository);manifest.source.location.npm.packageName=packageMetadata.name;
 manifest.source.shasum=await getSnapChecksum(releaseChecksumFiles(manifest,bundle,icon));
 await validateSnapShasum(releaseChecksumFiles(manifest,bundle,icon));
 return manifest;
}
