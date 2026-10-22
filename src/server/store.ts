import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SecurityReport } from '../security/types.js';
import type { LabSession } from '../testing/sessions.js';
import type { Watch, Alert } from '../security/monitor.js';
import type { Analysis, Execution } from '../core/types.js';
export type WalletAuthChallenge = {id:string;address:string;chainId:number;origin:string;message:string;createdAt:string;expiresAt:string};
export type WalletAuthToken = {id:string;address:string;kind:'web'|'snap';createdAt:string;expiresAt:string};
export function createStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS demo_events (id INTEGER PRIMARY KEY AUTOINCREMENT, analysis_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS wallet_requests (analysis_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, payload TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS security_reports (id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ai_attempts (created_at TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS security_watches(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS security_alerts(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS lab_sessions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS wallet_auth_challenges(id TEXT PRIMARY KEY,address TEXT NOT NULL,expires_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS wallet_auth_tokens(token_hash TEXT PRIMARY KEY,address TEXT NOT NULL,kind TEXT NOT NULL,expires_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS wallet_auth_tokens_address ON wallet_auth_tokens(address,kind); CREATE TABLE IF NOT EXISTS wallet_report_owners(report_id TEXT PRIMARY KEY,address TEXT NOT NULL); CREATE INDEX IF NOT EXISTS wallet_report_owners_address ON wallet_report_owners(address); CREATE TABLE IF NOT EXISTS wallet_ai_attempts(address TEXT NOT NULL,day TEXT NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(address,day)); CREATE TABLE IF NOT EXISTS wallet_auth_rates(rate_key TEXT NOT NULL,bucket INTEGER NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(rate_key,bucket));');
  return {
    authPrune(now:string){db.prepare('DELETE FROM wallet_auth_challenges WHERE expires_at<=?').run(now);db.prepare('DELETE FROM wallet_auth_tokens WHERE expires_at<=?').run(now);db.prepare('DELETE FROM wallet_auth_rates WHERE bucket<?').run(Math.floor(Date.parse(now)/60000)-2);},
    authChallengeSave(challenge:WalletAuthChallenge,maxPending=256):boolean {return db.prepare('INSERT INTO wallet_auth_challenges SELECT ?,?,?,? WHERE (SELECT count(*) FROM wallet_auth_challenges)<?').run(challenge.id,challenge.address,challenge.expiresAt,JSON.stringify(challenge),maxPending).changes===1;},
    // DELETE RETURNING consumes the challenge atomically before signature work.
    authChallengeConsume(id:string,now:string):WalletAuthChallenge|null{const row=db.prepare('DELETE FROM wallet_auth_challenges WHERE id=? RETURNING expires_at,payload').get(id);return row&&String(row.expires_at)>now?JSON.parse(row.payload as string):null;},
    authTokenSave(token:WalletAuthToken){db.prepare('INSERT INTO wallet_auth_tokens VALUES(?,?,?,?,?)').run(token.id,token.address,token.kind,token.expiresAt,JSON.stringify(token));},
    authTokenGet(id:string,now:string):WalletAuthToken|null{const row=db.prepare('SELECT payload FROM wallet_auth_tokens WHERE token_hash=? AND expires_at>?').get(id,now);return row?JSON.parse(row.payload as string):null;},
    authTokenRevoke(id:string){db.prepare('DELETE FROM wallet_auth_tokens WHERE token_hash=?').run(id);},
    authRevokeSnaps(address:string){db.prepare("DELETE FROM wallet_auth_tokens WHERE address=? AND kind='snap'").run(address);},
    authRateAttempt(key:string,bucket:number,limit:number):boolean{if(!Number.isSafeInteger(bucket)||!Number.isInteger(limit)||limit<1)throw Error('Invalid auth rate');return db.prepare('INSERT INTO wallet_auth_rates VALUES(?,?,1) ON CONFLICT(rate_key,bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts<?').run(key,bucket,limit).changes===1;},
    authReportOwner(reportId:string,address:string):boolean {db.prepare('INSERT OR IGNORE INTO wallet_report_owners VALUES(?,?)').run(reportId,address);return Boolean(db.prepare('SELECT 1 FROM wallet_report_owners WHERE report_id=? AND address=?').get(reportId,address));},
    authOwnsReport(reportId:string,address:string):boolean{return Boolean(db.prepare('SELECT 1 FROM wallet_report_owners WHERE report_id=? AND address=?').get(reportId,address));},
    authSecurityList(address:string):SecurityReport[]{return db.prepare('SELECT r.payload FROM security_reports r JOIN wallet_report_owners o ON o.report_id=r.id WHERE o.address=? ORDER BY r.created_at DESC LIMIT 100').all(address).map(row=>JSON.parse(row.payload as string));},
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
    labList():LabSession[]{return db.prepare('SELECT payload FROM lab_sessions ORDER BY created_at DESC LIMIT 100').all().map(r=>JSON.parse(r.payload as string));},
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
