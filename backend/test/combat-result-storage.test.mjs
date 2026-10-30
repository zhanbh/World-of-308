import test from 'node:test';
import assert from 'node:assert/strict';
import {packEvents,unpackEvents,RESULT_PACK_BYTES} from '../src/challenge/combat-result-pack.ts';
import {basicFixture} from './fixtures/basic-fixture.mjs';
import {loginKey} from '../src/identity/identity-v2.ts';

test('physical codec retains all nested fields and escaped maximal identities without numeric coercion',async()=>{
 const events=Array.from({length:32768},(_,i)=>({eventId:'"\\😀'.repeat(32)+i,kind:'damage',at:{n:'18446744073709551615',d:'4294967295'},damage:'18446744073709551615',nullable:null,enabled:false,values:[0,-1,1.5,[],{}]}));
 const packed=await packEvents(events);assert.deepEqual(await unpackEvents(JSON.parse(JSON.stringify(packed))),events);
 assert.ok(Buffer.byteLength(JSON.stringify(packed))<RESULT_PACK_BYTES);
 for(const mutate of [p=>p.encoding='unknown',p=>p.decodedBytes=1,p=>p.eventCount++,p=>p.data='!!!!',p=>p.data=p.data.slice(0,-8),p=>p.decodedBytes=33554433]){
  const corrupt=structuredClone(packed);mutate(corrupt);await assert.rejects(()=>unpackEvents(corrupt),TypeError);
 }
 // A valid gzip stream claiming too small an expansion is stopped during streaming.
 await assert.rejects(()=>unpackEvents({...packed,decodedBytes:100}),TypeError);
 const oversized=new Blob([' '.repeat(33554433)]).stream().pipeThrough(new CompressionStream('gzip'));
 const bomb=new Uint8Array(await new Response(oversized).arrayBuffer());
 let binary='';for(let i=0;i<bomb.length;i+=32768)binary+=String.fromCharCode(...bomb.subarray(i,i+32768));
 await assert.rejects(()=>unpackEvents({encoding:'gzip-json-v1',eventCount:0,decodedBytes:33554432,data:btoa(binary)}),TypeError);
});

test('public action results preserve legacy pages and reject corrupt packed identities and compressed data',async()=>{
 const h=await basicFixture();h.clock.now=()=>1513;const q=await h.command(),reply=await h.service.execute(q);assert.equal(reply.outcome.status,'committed');
 const accountId=h.character().accountId,id=await loginKey('combatResults',[accountId,q.operationId,0]),pack=h.store.inspect(id);
 const query=pageIndex=>h.service.query({...h.auth,query:'simulation.actionResults',requestId:'compat',payload:{operationId:q.operationId,pageIndex}});
 const original=await query(0);assert.ok(original.events.length);
 await h.store.run(async tx=>tx.set(id,{id,schemaVersion:1,accountId,operationId:q.operationId,actionResultsRef:original.actionResultsRef,pageIndex:0,totalPages:1,events:original.events}));
 assert.deepEqual((await query(0)).events,original.events);
 const legacyId=await loginKey('combatResults',[accountId,q.operationId,1]);
 await h.store.run(async tx=>tx.set(legacyId,{id:legacyId,schemaVersion:1,accountId,operationId:q.operationId,actionResultsRef:original.actionResultsRef,pageIndex:1,totalPages:2,events:original.events}));
 assert.deepEqual((await query(1)).events,original.events);await assert.rejects(()=>query(1023));
 const malformed=await packEvents(original.events.map(e=>({...e,kind:'forged-result-kind'})));
 for(const corrupt of [{...pack,id:'other-id'},{...pack,accountId:'other-account'},{...pack,operationId:'other-operation'},{...pack,actionResultsRef:'other-ref'},{...pack,packed:{...pack.packed,eventCount:0}},{...pack,packed:malformed},{...pack,totalPages:1025}]){
  await h.store.run(async tx=>tx.set(id,corrupt));await assert.rejects(()=>query(0));
 }
});
