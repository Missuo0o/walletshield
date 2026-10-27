import type {FetchedSnapFiles} from '@metamask/snaps-utils';
type ReleaseMetadata={name:string;version:string;repository:{type:string;url:string}};
export function releaseChecksumFiles(manifest:unknown,bundle:string|Uint8Array,icon:string|Uint8Array):FetchedSnapFiles;
export function releaseManifest<T>(original:T,packageMetadata:ReleaseMetadata,bundle:string|Uint8Array,icon:string|Uint8Array):Promise<Omit<T,'version'|'proposedName'|'repository'>&{version:string;proposedName:string;repository:ReleaseMetadata['repository']}>;
