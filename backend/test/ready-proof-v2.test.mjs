import test from 'node:test';
import assert from 'node:assert/strict';
import {nextRoomFixture} from './next-room-v2.test.mjs';
import {verifyRecoveryPages} from '../../shared/src/public-state-proof.ts';
test('issued ready receipt proves current active public records without renewing lease or anchors',async()=>{
 const h=await nextRoomFixture(),p=await h.service.execute(h.nextCommand),m=p.outcome.data;
 const a=await h.service.execute({...h.activateCommand,operationId:'proof-activate',expected:p.outcome.resultVersions,payload:{...h.activateCommand.payload,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:h.store.inspect(h.challengeId).version}}),t=a.outcome.data.readyTicket;
 const r=await h.service.execute({...h.auth,command:'scene.ready',controlSeq:2,leaseRevision:1,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(t).filter(([k])=>k!=='deadline'))}});assert.equal(r.outcome.status,'committed');
 const s=r.outcome.data.state,q={...h.auth,query:'scene.recoveryPage',requestId:'post-ready',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,readyTicketId:t.readyTicketId,...Object.fromEntries(['sceneEpoch','timelineEpoch','checkpointRevision','publicStateHash','manifestHash'].map(k=>[k,s[k]])),pageIndex:0}};
 for(let n=1;n<=8;n++)assert.equal((await h.service.execute({...h.auth,command:'heartbeat',heartbeatSeq:n,leaseRevision:n+1,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:s.sceneEpoch,timelineEpoch:s.timelineEpoch}})).outcome.status,'committed');
 const before=h.store.snapshot(),page=await h.service.query(q),proof=await verifyRecoveryPages([page]);assert.equal(proof.publicStateHash,s.publicStateHash);assert.deepEqual(h.store.snapshot(),before);assert.equal(h.store.inspect(h.challengeId).controlReceipts.length,8);assert.ok(new TextEncoder().encode(JSON.stringify(h.store.inspect(h.challengeId))).length<=131072);console.log('ST10 eight-receipt H UTF-8',new TextEncoder().encode(JSON.stringify(h.store.inspect(h.challengeId))).length);assert.equal(page.records.find(r=>r.kind==='actor'&&r.actorIndex===0).hp,'1000');
 for(const change of [{readyTicketId:'forged'},{checkpointRevision:t.checkpointRevision},{timelineEpoch:s.timelineEpoch+1}])await assert.rejects(()=>h.service.query({...q,payload:{...q.payload,...change}}),/VERSION_CONFLICT/);
 h.clock.now=()=>t.deadline;await assert.rejects(()=>h.service.query(q),/DEADLINE_EXPIRED|VERSION_CONFLICT/);
});
test('active recovery ready issues fresh bounded pages and cannot reuse previous timeline receipt',async()=>{
 const h=await nextRoomFixture(),old=h.store.inspect(h.challengeId).lastReadyReceipt,p={characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId};
 await h.store.run(async tx=>{const ch=await tx.get(h.challengeId),hd=await tx.get(h.headerId);tx.set(ch.id,{...ch,roomPhase:'active'});tx.set(hd.id,{...hd,state:{...hd.state,roomPhase:'active'}});});
 const suspended=await h.service.execute({...h.auth,command:'scene.suspend',controlSeq:2,leaseRevision:1,payload:{...p,sceneEpoch:1,timelineEpoch:1}});assert.equal(suspended.outcome.status,'committed');
 const prepared=await h.service.execute({...h.auth,command:'scene.resumePrepare',controlSeq:3,leaseRevision:2,payload:{...p,sceneEpoch:1,timelineEpoch:1,checkpointRevision:suspended.outcome.data.state.checkpointRevision}}),t=prepared.outcome.data.readyTicket;
 const ready=await h.service.execute({...h.auth,command:'scene.ready',controlSeq:4,leaseRevision:3,payload:{...p,...Object.fromEntries(Object.entries(t).filter(([k])=>k!=='deadline'))}});assert.equal(ready.outcome.status,'committed');const s=ready.outcome.data.state;
 const q={...h.auth,query:'scene.recoveryPage',requestId:'recovered-active',payload:{...p,readyTicketId:t.readyTicketId,...Object.fromEntries(['sceneEpoch','timelineEpoch','checkpointRevision','publicStateHash','manifestHash'].map(k=>[k,s[k]])),pageIndex:0}},before=h.store.snapshot();
 assert.equal((await verifyRecoveryPages([await h.service.query(q)])).timelineEpoch,2);assert.deepEqual(h.store.snapshot(),before);await assert.rejects(()=>h.service.query({...q,payload:{...q.payload,readyTicketId:old.readyTicketId}}),/VERSION_CONFLICT/);
});
