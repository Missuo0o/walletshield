import {deployLab} from '../src/testing/contracts.js';
const lab=await deployLab();console.log(`WalletShield wallet test contracts ready: ${Object.keys(lab.contracts).length} local fixtures on chain 31337.`);
