import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SecurityReport } from '../security/types.js';
import type { LabSession } from '../testing/sessions.js';
import type { Watch, Alert } from '../security/monitor.js';
import type { Analysis, Execution } from '../core/types.js';
export type WalletAuthChallenge = {id:string;address:string;chainId:number;origin:string;message:string;createdAt:string;expiresAt:string};
/** Only ERC-1271 identities are chain-scoped. An EOA proves the same key on all
 * EVM chains; a contract at the same address may have unrelated owners. */
export type WalletAuthToken = {id:string;address:string;kind:'web'|'snap';createdAt:string;expiresAt:string;chainId?:number};
export const walletIdentityKey=(address:string,chainId?:number)=>chainId===undefined?address:`eip155:${chainId}:${address}`;
export type EvidenceScanLimits={walletPerMinute:number;ipPerMinute:number;globalPerMinute:number;walletPerDay:number;ipPerDay:number;globalPerDay:number};
export function createStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true,mode:0o700 });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000');
  // Reports can contain unsigned private messages. Tighten existing databases
  // too, before WAL creation inherits their permissions.
  if(path!==':memory:')chmodSync(path,0o600);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS demo_events (id INTEGER PRIMARY KEY AUTOINCREMENT, analysis_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS wallet_requests (analysis_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, payload TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS security_reports (id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ai_attempts (created_at TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS security_watches(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS security_alerts(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS lab_sessions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS lab_daily_budgets(address TEXT NOT NULL,day INTEGER NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(address,day))');
  db.exec('CREATE TABLE IF NOT EXISTS wallet_auth_challenges(id TEXT PRIMARY KEY,address TEXT NOT NULL,expires_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS wallet_auth_tokens(token_hash TEXT PRIMARY KEY,address TEXT NOT NULL,kind TEXT NOT NULL,expires_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS wallet_auth_tokens_address ON wallet_auth_tokens(address,kind); CREATE TABLE IF NOT EXISTS wallet_report_owners(report_id TEXT PRIMARY KEY,address TEXT NOT NULL); CREATE INDEX IF NOT EXISTS wallet_report_owners_address ON wallet_report_owners(address); CREATE TABLE IF NOT EXISTS wallet_ai_attempts(address TEXT NOT NULL,day TEXT NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(address,day)); CREATE TABLE IF NOT EXISTS wallet_auth_rates(rate_key TEXT NOT NULL,bucket INTEGER NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(rate_key,bucket));');
  db.exec('CREATE INDEX IF NOT EXISTS wallet_auth_challenges_expiry ON wallet_auth_challenges(expires_at); CREATE INDEX IF NOT EXISTS wallet_auth_tokens_expiry ON wallet_auth_tokens(expires_at); CREATE INDEX IF NOT EXISTS wallet_auth_tokens_owner_expiry ON wallet_auth_tokens(address,kind,expires_at,token_hash); CREATE INDEX IF NOT EXISTS wallet_auth_rates_bucket ON wallet_auth_rates(bucket);');
  db.exec('CREATE TABLE IF NOT EXISTS wallet_auth_verifications(id TEXT PRIMARY KEY,address TEXT NOT NULL,expires_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS wallet_auth_verifications_expiry ON wallet_auth_verifications(expires_at); CREATE INDEX IF NOT EXISTS wallet_auth_verifications_address ON wallet_auth_verifications(address);');
  db.exec('CREATE INDEX IF NOT EXISTS security_reports_created ON security_reports(created_at,id); CREATE TABLE IF NOT EXISTS evidence_scan_budgets(scope TEXT NOT NULL,bucket TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(scope,bucket)); CREATE INDEX IF NOT EXISTS evidence_scan_budgets_expiry ON evidence_scan_budgets(expires_at);');
  // Old credentials did not record whether login used ERC-1271 and cannot be
  // safely upgraded to cross-chain identities. Invalidate them exactly once;
  // preserve reports, budgets and all local-chain/configuration state.
  db.exec('CREATE TABLE IF NOT EXISTS wallet_identity_policies(id TEXT PRIMARY KEY); BEGIN IMMEDIATE');
  try{
    // Preserve any surviving legacy lab counters before minute-based auth
    // cleanup runs. Daily counters must never share that cleanup window.
    db.exec("INSERT OR IGNORE INTO lab_daily_budgets SELECT substr(rate_key,16),bucket,attempts FROM wallet_auth_rates WHERE substr(rate_key,1,15)='test-lab:daily:'; DELETE FROM wallet_auth_rates WHERE substr(rate_key,1,15)='test-lab:daily:';");
    if(!db.prepare('PRAGMA table_info(wallet_auth_verifications)').all().some(column=>column.name==='chain_id'))db.exec('ALTER TABLE wallet_auth_verifications ADD COLUMN chain_id INTEGER');
    db.exec("DELETE FROM wallet_auth_tokens WHERE NOT EXISTS(SELECT 1 FROM wallet_identity_policies WHERE id='contract-chain-v1'); DELETE FROM wallet_auth_challenges WHERE NOT EXISTS(SELECT 1 FROM wallet_identity_policies WHERE id='contract-chain-v1'); DELETE FROM wallet_auth_verifications WHERE NOT EXISTS(SELECT 1 FROM wallet_identity_policies WHERE id='contract-chain-v1'); INSERT OR IGNORE INTO wallet_identity_policies VALUES('contract-chain-v1'); COMMIT;");
  }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  if(path!==':memory:')for(const suffix of ['-wal','-shm'])try{chmodSync(path+suffix,0o600);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  function pruneAuth(now:string){db.prepare('DELETE FROM wallet_auth_challenges WHERE expires_at<=?').run(now);db.prepare('DELETE FROM wallet_auth_verifications WHERE expires_at<=?').run(now);db.prepare('DELETE FROM wallet_auth_tokens WHERE expires_at<=?').run(now);db.prepare('DELETE FROM wallet_auth_rates WHERE bucket<?').run(Math.floor(Date.parse(now)/60000)-2);db.prepare('DELETE FROM lab_daily_budgets WHERE day<?').run(Math.floor(Date.parse(now)/86400000));}
  function activeWeb(address:string,id:string,now:string,chainId?:number){return Boolean(db.prepare("SELECT 1 FROM wallet_auth_tokens WHERE token_hash=? AND address=? AND kind='web' AND expires_at>? AND json_extract(payload,'$.chainId') IS ?").get(id,address,now,chainId??null));}
  function revokeOwner(address:string,chainId?:number){
    if(chainId===undefined){const changes=db.prepare('DELETE FROM wallet_auth_tokens WHERE address=?').run(address).changes;db.prepare('DELETE FROM wallet_auth_challenges WHERE address=?').run(address);db.prepare('DELETE FROM wallet_auth_verifications WHERE address=?').run(address);return Number(changes);}
    const changes=db.prepare("DELETE FROM wallet_auth_tokens WHERE address=? AND json_extract(payload,'$.chainId')=?").run(address,chainId).changes;
    db.prepare("DELETE FROM wallet_auth_challenges WHERE address=? AND json_extract(payload,'$.chainId')=?").run(address,chainId);
    db.prepare('DELETE FROM wallet_auth_verifications WHERE address=? AND chain_id=?').run(address,chainId);return Number(changes);
  }
  return {
    authPrune:pruneAuth,
    /** Reserve all issuance budgets and rotate only this owner's oldest Snap
     * credentials under one write lock. Failed issuance charges no rate bucket. */
    authIssueSnap(token:WalletAuthToken,webId:string,now:string,limits:{ipKey:string;addressPerMinute:number;ipPerMinute:number;globalPerMinute:number;maxPerAddress:number;maxGlobal:number}):boolean{
      if(token.kind!=='snap'||![limits.addressPerMinute,limits.ipPerMinute,limits.globalPerMinute,limits.maxPerAddress,limits.maxGlobal].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isFinite(Date.parse(now)))throw Error('Invalid pairing limits');
      const bucket=Math.floor(Date.parse(now)/60000),rates=[['pair:global',limits.globalPerMinute],[`pair:ip:${limits.ipKey}`,limits.ipPerMinute],[`pair:address:${walletIdentityKey(token.address,token.chainId)}`,limits.addressPerMinute]] as const;
      db.exec('BEGIN IMMEDIATE');
      try{
        pruneAuth(now);
        if(!activeWeb(token.address,webId,now,token.chainId)||rates.some(([key,limit])=>Number(db.prepare('SELECT attempts FROM wallet_auth_rates WHERE rate_key=? AND bucket=?').get(key,bucket)?.attempts??0)>=limit)){db.exec('COMMIT');return false;}
        const own=Number(db.prepare("SELECT count(*) AS n FROM wallet_auth_tokens WHERE address=? AND kind='snap' AND json_extract(payload,'$.chainId') IS ?").get(token.address,token.chainId??null)?.n??0),total=Number(db.prepare("SELECT count(*) AS n FROM wallet_auth_tokens WHERE kind='snap'").get()?.n??0),other=total-own;
        const keep=Math.min(limits.maxPerAddress-1,limits.maxGlobal-other-1);
        if(keep<0){db.exec('COMMIT');return false;}
        if(own>keep)db.prepare("DELETE FROM wallet_auth_tokens WHERE token_hash IN (SELECT token_hash FROM wallet_auth_tokens WHERE address=? AND kind='snap' AND json_extract(payload,'$.chainId') IS ? ORDER BY expires_at,token_hash LIMIT ?)").run(token.address,token.chainId??null,own-keep);
        db.prepare('INSERT INTO wallet_auth_tokens VALUES(?,?,?,?,?)').run(token.id,token.address,token.kind,token.expiresAt,JSON.stringify(token));
        for(const [key] of rates)db.prepare('INSERT INTO wallet_auth_rates VALUES(?,?,1) ON CONFLICT(rate_key,bucket) DO UPDATE SET attempts=attempts+1').run(key,bucket);
        db.exec('COMMIT');return true;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    authChallengeSave(challenge:WalletAuthChallenge,maxPending=256):boolean {return db.prepare('INSERT INTO wallet_auth_challenges SELECT ?,?,?,? WHERE (SELECT count(*) FROM wallet_auth_challenges)+(SELECT count(*) FROM wallet_auth_verifications)<?').run(challenge.id,challenge.address,challenge.expiresAt,JSON.stringify(challenge),maxPending).changes===1;},
    // Move the one-use challenge to a bounded expiring verification ticket.
    // Revocation can delete that ticket while asynchronous signature work runs.
    authChallengeConsume(id:string,now:string):WalletAuthChallenge|null{
      db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('DELETE FROM wallet_auth_challenges WHERE id=? RETURNING address,expires_at,payload').get(id);if(!row||String(row.expires_at)<=now){db.exec('COMMIT');return null;}const challenge=JSON.parse(row.payload as string) as WalletAuthChallenge;db.prepare('INSERT INTO wallet_auth_verifications(id,address,expires_at,chain_id) VALUES(?,?,?,?)').run(id,row.address,row.expires_at,challenge.chainId);db.exec('COMMIT');return challenge;}catch(error){db.exec('ROLLBACK');throw error;}
    },
    authVerificationDiscard(id:string){db.prepare('DELETE FROM wallet_auth_verifications WHERE id=?').run(id);},
    /** Consume the exact still-active ticket and issue the web credential under
     * one write lock. A revoke/delete in another process cannot resurrect login. */
    authIssueWeb(token:WalletAuthToken,challengeId:string,now:string):boolean{
      if(token.kind!=='web'||token.expiresAt<=now)return false;
      db.exec('BEGIN IMMEDIATE');try{const ticket=db.prepare('DELETE FROM wallet_auth_verifications WHERE id=? AND address=? AND expires_at>? AND (? IS NULL OR chain_id=?) RETURNING id').get(challengeId,token.address,now,token.chainId??null,token.chainId??null);if(!ticket){db.exec('COMMIT');return false;}db.prepare('INSERT INTO wallet_auth_tokens VALUES(?,?,?,?,?)').run(token.id,token.address,token.kind,token.expiresAt,JSON.stringify(token));db.exec('COMMIT');return true;}catch(error){db.exec('ROLLBACK');throw error;}
    },
    authTokenSave(token:WalletAuthToken){db.prepare('INSERT INTO wallet_auth_tokens VALUES(?,?,?,?,?)').run(token.id,token.address,token.kind,token.expiresAt,JSON.stringify(token));},
    authTokenGet(id:string,now:string):WalletAuthToken|null{const row=db.prepare('SELECT payload FROM wallet_auth_tokens WHERE token_hash=? AND expires_at>?').get(id,now);return row?JSON.parse(row.payload as string):null;},
    authTokenRevoke(id:string){db.prepare('DELETE FROM wallet_auth_tokens WHERE token_hash=?').run(id);},
    authRevokeSnaps(address:string){db.prepare("DELETE FROM wallet_auth_tokens WHERE address=? AND kind='snap'").run(address);},
    authRevokeAll(address:string,id:string,now:string,chainId?:number):number|null{
      db.exec('BEGIN IMMEDIATE');try{if(!activeWeb(address,id,now,chainId)){db.exec('COMMIT');return null;}const removed=revokeOwner(address,chainId);db.exec('COMMIT');return removed;}catch(error){db.exec('ROLLBACK');throw error;}
    },
    authDeleteReports(address:string,id:string,now:string,chainId?:number):{reportsDeleted:number;credentialsRevoked:number}|null{
      db.exec('BEGIN IMMEDIATE');try{
        if(!activeWeb(address,id,now,chainId)){db.exec('COMMIT');return null;}
        const reportsDeleted=Number(db.prepare("DELETE FROM security_reports WHERE id IN (SELECT report_id FROM wallet_report_owners WHERE address=?) AND (? IS NULL OR json_extract(payload,'$.request.chainId')=?) RETURNING id").all(address,chainId??null,chainId??null).length);
        db.prepare('DELETE FROM wallet_report_owners WHERE address=? AND NOT EXISTS(SELECT 1 FROM security_reports WHERE id=report_id)').run(address);const credentialsRevoked=revokeOwner(address,chainId);
        db.exec('COMMIT');return {reportsDeleted,credentialsRevoked};
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    /** The authorization and ownership checks share the write lock with every
     * insert/update, preventing revoked in-flight requests from backfilling. */
    authSaveSecurityReport(report:SecurityReport,address:string,id:string,now:string):boolean{
      db.exec('BEGIN IMMEDIATE');try{
        const credential=db.prepare('SELECT payload FROM wallet_auth_tokens WHERE token_hash=? AND address=? AND expires_at>?').get(id,address,now);
        if(!credential){db.exec('COMMIT');return false;}const token=JSON.parse(credential.payload as string) as WalletAuthToken;
        if(token.chainId!==undefined&&report.request.chainId!==token.chainId){db.exec('COMMIT');return false;}
        const existing=db.prepare('SELECT payload FROM security_reports WHERE id=?').get(report.id);
        if(existing&&token.chainId!==undefined&&JSON.parse(existing.payload as string).request?.chainId!==token.chainId){db.exec('COMMIT');return false;}
        db.prepare('INSERT OR IGNORE INTO wallet_report_owners VALUES(?,?)').run(report.id,address);
        if(!db.prepare('SELECT 1 FROM wallet_report_owners WHERE report_id=? AND address=?').get(report.id,address)){db.exec('COMMIT');return false;}
        db.prepare('INSERT INTO security_reports VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(report.id,report.createdAt,JSON.stringify(report));
        db.exec('COMMIT');return true;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    /** Reserve all upstream-evidence budgets atomically before doing any RPC,
     * intelligence or fork work. These are independent of model-attempt caps. */
    authTakeEvidenceAttempt(address:string,id:string,ipKey:string,now:string,limits:EvidenceScanLimits,chainId?:number):boolean{
      if(![limits.walletPerMinute,limits.ipPerMinute,limits.globalPerMinute,limits.walletPerDay,limits.ipPerDay,limits.globalPerDay].every(value=>Number.isSafeInteger(value)&&value>0)||!Number.isFinite(Date.parse(now)))throw Error('Invalid evidence scan limits');
      const time=Date.parse(now),minute=Math.floor(time/60000),day=now.slice(0,10),minuteExpiry=new Date((minute+1)*60000).toISOString(),dayExpiry=new Date(Date.parse(day+'T00:00:00.000Z')+86400000).toISOString();
      const owner=walletIdentityKey(address,chainId),budgets:[string,string,string,number][]=[['wallet:'+owner,'minute:'+minute,minuteExpiry,limits.walletPerMinute],['ip:'+ipKey,'minute:'+minute,minuteExpiry,limits.ipPerMinute],['global','minute:'+minute,minuteExpiry,limits.globalPerMinute],['wallet:'+owner,'day:'+day,dayExpiry,limits.walletPerDay],['ip:'+ipKey,'day:'+day,dayExpiry,limits.ipPerDay],['global','day:'+day,dayExpiry,limits.globalPerDay]];
      db.exec('BEGIN IMMEDIATE');try{
        db.prepare('DELETE FROM evidence_scan_budgets WHERE expires_at<=?').run(now);
        if(!db.prepare("SELECT 1 FROM wallet_auth_tokens WHERE token_hash=? AND address=? AND expires_at>? AND json_extract(payload,'$.chainId') IS ?").get(id,address,now,chainId??null)||budgets.some(([scope,bucket,,limit])=>Number(db.prepare('SELECT attempts FROM evidence_scan_budgets WHERE scope=? AND bucket=?').get(scope,bucket)?.attempts??0)>=limit)){db.exec('COMMIT');return false;}
        for(const [scope,bucket,expiry] of budgets)db.prepare('INSERT INTO evidence_scan_budgets VALUES(?,?,?,1) ON CONFLICT(scope,bucket) DO UPDATE SET attempts=attempts+1').run(scope,bucket,expiry);
        db.exec('COMMIT');return true;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    pruneHostedReports(cutoff:string,batch=100):number{
      if(!Number.isFinite(Date.parse(cutoff))||!Number.isInteger(batch)||batch<1||batch>500)throw Error('Invalid report retention settings');
      db.exec('BEGIN IMMEDIATE');try{
        const ids=db.prepare('SELECT r.id FROM security_reports r JOIN wallet_report_owners o ON o.report_id=r.id WHERE r.created_at<? ORDER BY r.created_at,r.id LIMIT ?').all(cutoff,batch).map(row=>String(row.id));
        for(const id of ids){db.prepare('DELETE FROM security_reports WHERE id=?').run(id);db.prepare('DELETE FROM wallet_report_owners WHERE report_id=?').run(id);}
        db.exec('COMMIT');return ids.length;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    authRateAttempt(key:string,bucket:number,limit:number):boolean{if(!Number.isSafeInteger(bucket)||!Number.isInteger(limit)||limit<1)throw Error('Invalid auth rate');return db.prepare('INSERT INTO wallet_auth_rates VALUES(?,?,1) ON CONFLICT(rate_key,bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts<?').run(key,bucket,limit).changes===1;},
    labDailyAttempt(address:string,day:number,limit:number):boolean{if(!Number.isSafeInteger(day)||!Number.isInteger(limit)||limit<1)throw Error('Invalid lab budget');return db.prepare('INSERT INTO lab_daily_budgets VALUES(?,?,1) ON CONFLICT(address,day) DO UPDATE SET attempts=attempts+1 WHERE attempts<?').run(address.toLowerCase(),day,limit).changes===1;},
    authReportOwner(reportId:string,address:string,chainId?:number):boolean {if(chainId!==undefined&&!db.prepare("SELECT 1 FROM security_reports WHERE id=? AND json_extract(payload,'$.request.chainId')=?").get(reportId,chainId))return false;db.prepare('INSERT OR IGNORE INTO wallet_report_owners VALUES(?,?)').run(reportId,address);return Boolean(db.prepare('SELECT 1 FROM wallet_report_owners WHERE report_id=? AND address=?').get(reportId,address));},
    authOwnsReport(reportId:string,address:string,chainId?:number):boolean{return Boolean(chainId===undefined?db.prepare('SELECT 1 FROM wallet_report_owners WHERE report_id=? AND address=?').get(reportId,address):db.prepare("SELECT 1 FROM wallet_report_owners o JOIN security_reports r ON r.id=o.report_id WHERE o.report_id=? AND o.address=? AND json_extract(r.payload,'$.request.chainId')=?").get(reportId,address,chainId));},
    authSecurityList(address:string,chainId?:number):SecurityReport[]{return db.prepare("SELECT r.payload FROM security_reports r JOIN wallet_report_owners o ON o.report_id=r.id WHERE o.address=? AND (? IS NULL OR json_extract(r.payload,'$.request.chainId')=?) ORDER BY r.created_at DESC LIMIT 100").all(address,chainId??null,chainId??null).map(row=>JSON.parse(row.payload as string));},
    authTakeAttempt(address:string,limit:number,now:string,globalLimit?:number):boolean{
      if(!Number.isInteger(limit)||limit<1||limit>1000||globalLimit!==undefined&&(!Number.isInteger(globalLimit)||globalLimit<1||globalLimit>1000))throw Error('Invalid wallet model budget');
      const day=now.slice(0,10);
      if(globalLimit===undefined)return db.prepare('INSERT INTO wallet_ai_attempts VALUES(?,?,1) ON CONFLICT(address,day) DO UPDATE SET attempts=attempts+1 WHERE attempts<?').run(address,day,limit).changes===1;
      // Reserve both budgets under the same SQLite write lock. A rejected
      // reservation cannot charge either the wallet or the global allowance.
      db.exec('BEGIN IMMEDIATE');
      try{
        const wallet=Number(db.prepare('SELECT attempts FROM wallet_ai_attempts WHERE address=? AND day=?').get(address,day)?.attempts??0);
        const global=Number(db.prepare('SELECT count(*) AS n FROM ai_attempts WHERE created_at>=?').get(day)?.n??0);
        if(wallet>=limit||global>=globalLimit){db.exec('COMMIT');return false;}
        db.prepare('INSERT INTO wallet_ai_attempts VALUES(?,?,1) ON CONFLICT(address,day) DO UPDATE SET attempts=attempts+1').run(address,day);
        db.prepare('INSERT INTO ai_attempts VALUES(?)').run(now);db.exec('COMMIT');return true;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    authAttemptsToday(address:string,now=new Date().toISOString()):number{return Number(db.prepare('SELECT attempts FROM wallet_ai_attempts WHERE address=? AND day=?').get(address,now.slice(0,10))?.attempts??0);},
    labSave(session:LabSession){db.prepare('INSERT INTO lab_sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(session.id,session.createdAt,JSON.stringify(session));},
    labFinish(session:LabSession):LabSession|null{
      if(session.status==='pending')throw Error('A completed wallet outcome is required');
      // Receipt reads can overlap another outcome or a Snap report attachment.
      // Change only outcome fields and let exactly one pending writer finish.
      const patch={status:session.status,note:session.note,...(session.transactionHash?{transactionHash:session.transactionHash}:{})};
      const row=db.prepare("UPDATE lab_sessions SET payload=json_patch(payload,?) WHERE id=? AND json_extract(payload,'$.status')='pending' RETURNING payload").get(JSON.stringify(patch),session.id);
      return row?JSON.parse(row.payload as string):null;
    },
    labList(address?:string):LabSession[]{return db.prepare("SELECT payload FROM lab_sessions WHERE ? IS NULL OR lower(COALESCE(json_extract(payload,'$.request.transaction.from'),json_extract(payload,'$.request.signature.from'))) = ? ORDER BY created_at DESC,id DESC LIMIT 100").all(address?.toLowerCase()??null,address?.toLowerCase()??null).map(r=>JSON.parse(r.payload as string));},
    labGet(id:string):LabSession|null{const row=db.prepare('SELECT payload FROM lab_sessions WHERE id=?').get(id);return row?JSON.parse(row.payload as string):null;},
    watchSave(watch:Watch){db.prepare('INSERT INTO security_watches VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(watch.id,JSON.stringify(watch));},
    watchList():Watch[]{return db.prepare('SELECT payload FROM security_watches').all().map(r=>JSON.parse(r.payload as string));},
    alertSave(alert:Alert){db.prepare('INSERT OR IGNORE INTO security_alerts VALUES(?,?,?)').run(alert.id,alert.createdAt,JSON.stringify(alert));},
    alertList():Alert[]{return db.prepare('SELECT payload FROM security_alerts ORDER BY created_at DESC LIMIT 100').all().map(r=>JSON.parse(r.payload as string));},
    securitySave(report: SecurityReport) { db.prepare('INSERT INTO security_reports VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(report.id,report.createdAt,JSON.stringify(report)); },
    securityList(): SecurityReport[] { return db.prepare('SELECT payload FROM security_reports ORDER BY created_at DESC LIMIT 100').all().map(r=>JSON.parse(r.payload as string)); },
    securityGet(id:string): SecurityReport | null { const row=db.prepare('SELECT payload FROM security_reports WHERE id=?').get(id);return row?JSON.parse(row.payload as string):null; },
    securityAiAttempt(limit=30):boolean { if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid daily model budget');const now=new Date().toISOString(); return db.prepare('INSERT INTO ai_attempts SELECT ? WHERE (SELECT count(*) FROM ai_attempts WHERE created_at>=?)<?').run(now,now.slice(0,10),limit).changes===1; },
    securityAiCallsToday():number { return Number(db.prepare('SELECT count(*) AS n FROM ai_attempts WHERE created_at>=?').get(new Date().toISOString().slice(0,10))?.n??0); },
    save(record: Analysis) { db.prepare('INSERT INTO analyses VALUES (?, ?, ?)').run(record.id, record.createdAt, JSON.stringify(record)); return record; },
    list(): Analysis[] { return db.prepare('SELECT payload FROM analyses ORDER BY created_at DESC LIMIT 100').all().map(r => JSON.parse(r.payload as string)); },
    history(): Analysis[] { return db.prepare('SELECT payload FROM analyses ORDER BY created_at DESC, id DESC').all().map(r => JSON.parse(r.payload as string)); },
    get(id: string): Analysis | null { const row = db.prepare('SELECT payload FROM analyses WHERE id=?').get(id); return row ? JSON.parse(row.payload as string) : null; },
    event(id: string, action: string) { db.prepare('INSERT INTO demo_events (analysis_id,action,created_at) VALUES (?,?,?)').run(id, action, new Date().toISOString()); },
    events(id: string) { return db.prepare('SELECT action,created_at AS createdAt FROM demo_events WHERE analysis_id=? ORDER BY id').all(id); },
    track(id: string, tokenHash: string, execution: Execution) { db.prepare('INSERT INTO wallet_requests VALUES (?,?,?)').run(id, tokenHash, JSON.stringify(execution)); },
    execution(id: string): Execution | undefined { const row = db.prepare('SELECT payload FROM wallet_requests WHERE analysis_id=?').get(id); return row ? JSON.parse(row.payload as string) : undefined; },
    authorized(id: string, tokenHash: string) { return Boolean(db.prepare('SELECT 1 FROM wallet_requests WHERE analysis_id=? AND token_hash=?').get(id, tokenHash)); },
    updateExecution(id: string, execution: Execution) { db.prepare('UPDATE wallet_requests SET payload=? WHERE analysis_id=?').run(JSON.stringify(execution), id); },
    close() { db.close(); }
  };
}
export type Store = ReturnType<typeof createStore>;
