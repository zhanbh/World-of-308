import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicStateDigest,verifyRecoveryPages} from '../src/public-state-proof.ts';
const actor=(id,index)=>({kind:'actor',actorId:id,actorIndex:index,x:0,y:0,facing:1,hp:'10',maxHp:'10',mp:'0',maxMp:'0',lifeState:'alive',actionId:'idle',phase:0});
test('full public proof rejects omitted, altered and reordered records with copied metadata',async()=>{
 const records=[actor('player',0),actor('enemy',1)];
 const hash=await publicStateDigest(records);
 const page={protocolVersion:2,requestId:'q',serverTime:0,readyTicketId:'ticket',sceneEpoch:1,timelineEpoch:1,checkpointRevision:1,publicStateHash:hash,manifestHash:'b'.repeat(64),deadline:10000,pageIndex:0,totalPages:1,records};
 assert.deepEqual((await verifyRecoveryPages([page])).records,records);
 for(const changed of [[records[0]],[records[0],{...records[1],hp:'9'}],[...records].reverse()])await assert.rejects(verifyRecoveryPages([{...page,records:changed}]),/PUBLIC_STATE_HASH_MISMATCH/);
 await assert.rejects(verifyRecoveryPages([{...page,records:[{...records[0],privateSeed:1}]}]));
});
test('digest uses canonical keys, retains array order and accepts full state beyond one chunk',async()=>{
 assert.equal(await publicStateDigest([]),createHash('sha256').update('[]').digest('hex'));
 const r=actor('player',0);assert.equal(await publicStateDigest([r]),await publicStateDigest([Object.fromEntries(Object.entries(r).reverse())]));
 const records=Array.from({length:3600},(_,i)=>({...r,actorId:'id'+i}));assert.match(await publicStateDigest(records),/^[a-f0-9]{64}$/);
});
