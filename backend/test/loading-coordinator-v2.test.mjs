import test from 'node:test';import assert from 'node:assert/strict';
import {prepareFixture} from './fixtures/prepare-fixture.mjs';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
function client(h,loader){const saved=new Map();const persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};const transport={send:async text=>JSON.stringify(await h.service.execute(JSON.parse(text)))};const c=new LoadingCoordinator(transport,persistence,loader??{load:(ref,release)=>h.service.resolveResource(release,ref)});return {c,saved,transport,persistence};}
test('client verifies actual bytes, retry retains original prepare and same manifest after reload',async()=>{
 const h=await prepareFixture(),v=client(h,{load:async()=>new Uint8Array([0])});
 await v.c.prepare(h.command);assert.equal(v.c.state.status,'failed');assert.equal(v.c.state.code,'RESOURCE_HASH_MISMATCH');
 assert.ok(v.c.state.manifest);const attempt=v.c.state.manifest.roomAttemptId;
 const reopened=new LoadingCoordinator(v.transport,v.persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});
 reopened.restore(h.command);await reopened.retry();assert.equal(reopened.state.status,'loaded');assert.equal(reopened.state.manifest.roomAttemptId,attempt);
});
test('late resource callback cannot mark a cancelled or newer workflow loaded',async()=>{
 const h=await prepareFixture();let complete;const waiting=new Promise(r=>complete=r);
 let first=true;const v=client(h,{load:async(ref,release)=>{if(first){first=false;await waiting;}return h.service.resolveResource(release,ref);}});
 const ongoing=v.c.prepare(h.command);while(v.c.state.status!=='loading')await new Promise(r=>setImmediate(r));
 v.c.cancel();await v.c.retry();assert.equal(v.c.state.status,'loaded');const current=v.c.state;
 complete();await ongoing;assert.deepEqual(v.c.state,current);
});
test('missing bytes are observable and transport response loss retains same durable operation',async()=>{
 const h=await prepareFixture(),v=client(h,{load:async()=>{throw new Error('missing');}});
 await v.c.prepare(h.command);assert.equal(v.c.state.code,'RESOURCE_MISSING');
 const manifest=v.c.state.manifest;await v.c.retry();assert.deepEqual(v.c.state.manifest,manifest);
 const f=await prepareFixture();let lose=true;const saved=new Map();const persistence={load:k=>saved.get(k)??null,save:(k,v)=>saved.set(k,v)};
 const transport={send:async text=>{const r=await f.service.execute(JSON.parse(text));if(lose){lose=false;throw new Error('lost');}return JSON.stringify(r);}};
 const c=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>f.service.resolveResource(release,ref)});
 await c.prepare(f.command);assert.equal(c.state.status,'unknown');await c.retry();assert.equal(c.state.status,'loaded');assert.equal(c.state.operationId,'prepare');
});
test('forged manifest hash fails before resource readiness',async()=>{
 const h=await prepareFixture(),v=client(h);const transport={send:async text=>{const r=await h.service.execute(JSON.parse(text));r.outcome.data.spawns[0].x+=1;return JSON.stringify(r);}};
 const c=new LoadingCoordinator(transport,v.persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await c.prepare(h.command);assert.equal(c.state.code,'MANIFEST_HASH_MISMATCH');assert.notEqual(c.state.status,'loaded');
});
