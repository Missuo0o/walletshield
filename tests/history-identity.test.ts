import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryController,type HistoryState} from '../web/src/historyState.js';
type Report={id:string;owner:string};
const a={id:'alice-private-report',owner:'alice'},b={id:'bob-private-report',owner:'bob'};
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
test('history identity reset clears rows/details and discards a late response even if transport ignores abort',async()=>{
 let visible:HistoryState<Report>|undefined;const history=createHistoryController<Report>('provider1:alice:1',state=>visible=state);
 await history.refresh(async()=>[a]);history.select(a.id);assert.equal(visible?.selected?.owner,'alice');
 const pending=deferred<Report[]>();let signal!:AbortSignal;const request=history.refresh(s=>{signal=s;return pending.promise;});
 history.reset('provider1:bob:2');assert.equal(signal.aborted,true);assert.deepEqual(visible?.records,[]);assert.equal(visible?.selected,null);
 await history.refresh(async()=>[b]);pending.resolve([a]);await request;
 assert.equal(visible?.identity,'provider1:bob:2');assert.deepEqual(visible?.records,[b]);assert.equal(visible?.selected,null);
});
test('history disposal on account/provider disconnect prevents both late success and error updates',async()=>{
 const updates:HistoryState<Report>[]=[];const history=createHistoryController<Report>('provider1:alice:1',state=>updates.push(state));
 await history.refresh(async()=>[a]);history.select(a.id);const pending=deferred<Report[]>();const request=history.refresh(()=>pending.promise);history.dispose();
 const count=updates.length;pending.resolve([a]);await request;assert.equal(updates.length,count);assert.deepEqual(history.state().records,[]);assert.equal(history.state().selected,null);
 const newer=createHistoryController<Report>('provider2:bob:3',state=>updates.push(state));const denied=deferred<Report[]>();const stale=newer.refresh(()=>denied.promise);newer.dispose();denied.reject(Error('401'));await stale;assert.equal(updates.length,count);
});
test('history 401/network failure clears prior rows and selected private details; removed reports clear selection',async()=>{
 let visible:HistoryState<Report>|undefined;const history=createHistoryController<Report>('alice',state=>visible=state);
 await history.refresh(async()=>[a]);history.select(a.id);await history.refresh(async()=>{throw Error('401 Unauthorized');});
 assert.deepEqual(visible?.records,[]);assert.equal(visible?.selected,null);assert.match(visible?.error??'',/Verify the current wallet/);
 await history.refresh(async()=>[a]);history.select(a.id);await history.refresh(async()=>[b]);assert.equal(visible?.selected,null);
 history.select(a.id);assert.equal(visible?.selected,null,'only the current result list can be selected');
});
test('a newer refresh wins over an older request in the same identity',async()=>{
 let visible:HistoryState<Report>|undefined;const history=createHistoryController<Report>('alice',state=>visible=state),older=deferred<Report[]>();
 const request=history.refresh(()=>older.promise);await history.refresh(async()=>[a]);older.resolve([b]);await request;assert.deepEqual(visible?.records,[a]);
});
