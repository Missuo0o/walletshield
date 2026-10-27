import {foundry} from 'viem/chains';
import {RUNTIME} from '../runtime.generated.js';

// A hosted sandbox must never share the browser's local-chain identifier.
export const HOSTED_LAB_CHAIN_ID=31338;
export const HOSTED_LAB_ENABLED=String(RUNTIME.mode)==='hosted'&&!!(RUNTIME as {testLab?:boolean}).testLab;
export const LAB_CHAIN_ID=HOSTED_LAB_ENABLED?HOSTED_LAB_CHAIN_ID:31337;
export const LAB_RPC_URL=HOSTED_LAB_ENABLED?'http://127.0.0.1:8546':'http://127.0.0.1:8545';
export const LAB_CHAIN={...foundry,id:LAB_CHAIN_ID,name:HOSTED_LAB_ENABLED?'WalletShield Test Lab':'WalletShield Local',rpcUrls:{default:{http:[LAB_RPC_URL]}}};
