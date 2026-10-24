import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFixture} from './fixtures/prepare-fixture.mjs';
const payload=h=>({characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:0,timelineEpoch:0});
test('unpaid loading suspend freezes same attempt and fixes deadline without creating CP or charging',async()=>{
 const h=await prepareFixture(),prepared=await h.service.execute(h.command),before=await h.query();
 h.clock.now=()=>4000;
 const q={...h.auth,command:'scene.suspend',controlSeq:1,leaseRevision:0,payload:payload(h)};
 const r=await h.service.execute(q);assert.equal(r.outcome.status,'committed');assert.equal(r.outcome.data.state.connection,'recovery');
 assert.equal(r.outcome.data.state.pendingManifest.roomAttemptId,prepared.outcome.data.roomAttemptId);
 assert.equal(r.outcome.data.state.transitionClock.connectedElapsedMs,3000);
 assert.equal(r.outcome.data.state.checkpoint,null);assert.equal(r.outcome.data.state.staminaRemaining,before.data.staminaRemaining);
});
const ctl=(h,command,controlSeq=1,leaseRevision=0,extra={})=>({...h.auth,command,controlSeq,leaseRevision,payload:{...payload(h),...extra}});
test('unpaid recovery excludes paused time, persists original controls, and resumes same manifest without CP',async()=>{
 const h=await prepareFixture(),m=(await h.service.execute(h.command)).outcome.data;h.clock.now=()=>4000;
 const suspend=ctl(h,'scene.suspend'),s=await h.service.execute(suspend);h.clock.now=()=>8000;
 const resume=ctl(h,'scene.resumePrepare',2,s.leaseRevision,{checkpointRevision:null}),r=await h.service.execute(resume);assert.equal(r.outcome.status,'committed');
 const t=r.outcome.data.readyTicket;assert.equal(t.deadline,14000);assert.equal(t.kind,'unpaidLoading');assert.equal(t.roomAttemptId,m.roomAttemptId);
 const ready={...h.auth,command:'scene.ready',controlSeq:3,leaseRevision:r.leaseRevision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(t).filter(([k])=>k!=='deadline'))}};
 const done=await h.service.execute(ready);assert.equal(done.outcome.status,'committed');assert.equal(done.outcome.data.state.connection,'connected');assert.equal(done.outcome.data.state.transitionClock.connectedElapsedMs,3000);
 h.clock.now=()=>9000;const replay=await h.service.execute(ready);assert.equal(replay.replayed,true);assert.deepEqual(replay.outcome,done.outcome);
 const original=await h.service.queryOriginalControl(resume);assert.deepEqual(original,r);
 assert.equal((await h.query()).data.pendingManifest.roomAttemptId,m.roomAttemptId);
});
test('unpaid deadline equality query atomically fails/closes, settles stamina and returns to inn',async()=>{
 for(const now of [10999,11000,11001]){const h=await prepareFixture();await h.service.execute(h.command);h.clock.now=()=>now;const r=await h.query();
 assert.equal(r.data.connection,now===10999?'connected':'closed');if(now!==10999){assert.equal(r.data.result,'failed');assert.equal(h.character().location.kind,'inn');assert.equal(h.character().stamina.value,308);assert.equal(h.account().activeChallengeId,undefined);}}
});
async function paid(){const h=await prepareFixture(),p=await h.service.execute(h.command),m=p.outcome.data;const a=await h.service.execute({...h.auth,command:'challenge.activateRoom',operationId:'activate',expected:p.outcome.resultVersions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:1}});return {...h,activation:a};}
const ready=(h,r,seq)=>({...h.auth,command:'scene.ready',controlSeq:seq,leaseRevision:r.leaseRevision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(r.outcome.data.readyTicket).filter(([k])=>k!=='deadline'))}});
test('paid recovery reads frozen CP proof, resumes loading without enemy anchors, then consumes only eligible clock',async()=>{
 const h=await paid();h.clock.now=()=>4000;
 const s=await h.service.execute(ctl(h,'scene.suspend',1,0,{sceneEpoch:1,timelineEpoch:1}));assert.equal(s.outcome.status,'committed');
 h.clock.now=()=>8000;const r=await h.service.execute(ctl(h,'scene.resumePrepare',2,s.leaseRevision,{sceneEpoch:1,timelineEpoch:1,checkpointRevision:s.outcome.data.state.checkpointRevision}));assert.equal(r.outcome.status,'committed');
 const t=r.outcome.data.readyTicket,page=await h.service.query({...h.auth,query:'scene.recoveryPage',requestId:'recover',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(t).filter(([k])=>k!=='deadline')),pageIndex:0}});
 const {verifyRecoveryPages}=await import('../../shared/src/public-state-proof.ts');assert.equal((await verifyRecoveryPages([page])).publicStateHash,t.publicStateHash);
 const loading=await h.service.execute(ready(h,r,3));assert.equal(loading.outcome.status,'committed');assert.equal(loading.outcome.data.state.roomPhase,'awaitingReady');assert.equal(loading.outcome.data.state.anchorWallAt,null);assert.equal(loading.outcome.data.state.inputGapBaseAt,null);
 h.clock.now=()=>10000;const final=await h.service.execute(ready(h,loading,4));assert.equal(final.outcome.status,'committed');assert.equal(final.outcome.data.state.acceptedTick,500);assert.equal(final.outcome.data.state.anchorWallAt,10000);assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,307);
});
test('new heartbeat renews lease once, duplicate cannot renew and old timeline/order cannot advance',async()=>{
 const h=await prepareFixture();await h.service.execute(h.command);h.clock.now=()=>4000;
 const q={...h.auth,command:'heartbeat',heartbeatSeq:1,leaseRevision:0,payload:payload(h)},a=await h.service.execute(q);assert.equal(a.outcome.status,'committed');
 h.clock.now=()=>8000;assert.equal((await h.service.execute(q)).replayed,true);assert.equal(h.store.inspect(h.challengeId).lease.leaseUntil,14000);
 assert.equal((await h.service.execute({...q,heartbeatSeq:3,leaseRevision:a.leaseRevision})).outcome.code,'VERSION_CONFLICT');
 const s=await h.service.execute(ctl(h,'scene.suspend',1,a.leaseRevision));assert.equal(s.outcome.status,'committed');
 assert.equal((await h.service.execute({...q,heartbeatSeq:2,leaseRevision:s.leaseRevision})).outcome.code,'RECOVERY_REQUIRED');
 const r=await h.service.execute(ctl(h,'scene.resumePrepare',2,s.leaseRevision,{checkpointRevision:null}));assert.equal(r.outcome.status,'committed');
 assert.equal((await h.service.execute(ctl(h,'scene.suspend',3,r.leaseRevision))).outcome.code,'VERSION_CONFLICT');
});
test('silent recovery and death equality use original cutoff with no new grace or paid refund',async()=>{
 for(const now of [10999,11000,11001]){const h=await paid();h.clock.now=()=>now;const q=ctl(h,'scene.resumePrepare',1,0,{sceneEpoch:1,timelineEpoch:1,checkpointRevision:0}),r=await h.service.execute(q);
 assert.equal(r.outcome.status,now===10999?'committed':'rejected');if(now===10999)assert.equal(r.outcome.data.readyTicket.deadline,11000);else{assert.equal(r.outcome.code,'DEADLINE_EXPIRED');assert.equal(h.character().stamina.value,307);assert.equal(h.account().activeChallengeId,undefined);}}
 const h=await paid();await h.store.run(async tx=>tx.set(h.challengeId,{...await tx.get(h.challengeId),deathDeadline:5000}));h.clock.now=()=>4000;const s=await h.service.execute(ctl(h,'scene.suspend',1,0,{sceneEpoch:1,timelineEpoch:1}));h.clock.now=()=>5000;const r=await h.service.execute(ctl(h,'scene.resumePrepare',2,s.leaseRevision,{sceneEpoch:1,timelineEpoch:1,checkpointRevision:s.outcome.data.state.checkpointRevision}));assert.equal(r.outcome.code,'DEADLINE_EXPIRED');assert.equal(h.store.inspect(h.challengeId).result,'failed');
});
test('heartbeat sequence is independent of challenge business version',async()=>{const h=await prepareFixture();await h.service.execute(h.command);const v=(await h.query()).versions.find(v=>v.kind==='challenge').version;const q={...h.auth,command:'heartbeat',heartbeatSeq:1,leaseRevision:0,payload:payload(h)};await h.service.execute(q);assert.equal((await h.query()).versions.find(v=>v.kind==='challenge').version,v);});
test('every loading-control and expiry write point rolls back atomically; lost responses resolve exact originals',async()=>{
 for(const paidRoom of [false,true])for(const stage of ['heartbeat','suspend','resume','ready','expire']){
  const make=async()=>{const h=paidRoom?await paid():await prepareFixture();if(!paidRoom)await h.service.execute(h.command);let q=paidRoom?{sceneEpoch:1,timelineEpoch:1}:{};let command;
   if(stage==='heartbeat')command={...h.auth,command:'heartbeat',heartbeatSeq:1,leaseRevision:0,payload:{...payload(h),...q}};
   else{command=ctl(h,'scene.suspend',1,0,q);if(['resume','ready'].includes(stage)){const s=await h.service.execute(command);command=ctl(h,'scene.resumePrepare',2,s.leaseRevision,{...q,checkpointRevision:paidRoom?s.outcome.data.state.checkpointRevision:null});if(stage==='ready'){const r=await h.service.execute(command);command=ready(h,r,3);}}}
   if(stage==='expire')h.clock.now=()=>11000;return {h,command};};
  const count=stage==='expire'?(paidRoom?5:4):paidRoom&&stage!=='heartbeat'?3:2;
  for(let point=1;point<=count;point++){const {h,command}=await make(),before=h.store.snapshot();h.store.injectWriteFailure(point);const failed=stage==='expire'?await h.query():await h.service.execute(command);assert.equal(stage==='expire'?failed.error.code:failed.outcome.code,'SERVICE_UNAVAILABLE',`${paidRoom}/${stage}/${point}`);assert.deepEqual(h.store.snapshot(),before);}
  if(stage!=='expire'){const {h,command}=await make();h.store.injectResponseLoss();assert.equal((await h.service.execute(command)).outcome.status,'unknown');const snapshot=h.store.snapshot(),r=await h.service.queryOriginalControl(command);assert.equal(r.outcome.status,'committed');assert.deepEqual(h.store.snapshot(),snapshot);assert.deepEqual((await h.service.execute(command)).outcome,r.outcome);}
 }
});
test('expiry keeps current session usable in town, preserves completed success and truthful journal reason',async()=>{
 for(const completed of [false,true]){const h=await paid();if(completed)await h.store.run(async tx=>tx.set(h.challengeId,{...await tx.get(h.challengeId),result:'completed',sceneState:'looting'}));h.clock.now=()=>11000;const r=await h.query();assert.equal(r.data.result,completed?'completed':'failed');assert.equal(r.data.connection,'closed');assert.equal(h.store.inspect(h.auth.sessionId).status,'active');
 const journals=[...h.store.snapshot().values()].filter(v=>v?.command==='scene.expire');assert.equal(journals.length,1);
 const exit=await h.town.exitInn({...h.auth,command:'scene.exitInn',operationId:'after-expiry-exit',expected:[],payload:{characterId:h.characterId,exitAnchorId:'inn-door'}});assert.equal(exit.outcome.status,'committed');assert.equal(h.character().location.kind,'town');assert.equal(h.character().stamina.value,307);}
});
test('actual login takeover wins before or after recovery without old-session replay permission',async()=>{
 const {LoginService}=await import('../src/identity/login-service.ts');for(const recoveryFirst of [true,false]){const h=await paid(),q=ctl(h,'scene.suspend',1,0,{sceneEpoch:1,timelineEpoch:1});if(recoveryFirst)assert.equal((await h.service.execute(q)).outcome.status,'committed');const login=new LoginService({store:h.store,clock:h.clock,identity:h.identity,ticketTtlMs:60000,initialUnlocks:{},holdingsDomainRef:'bank-test-domain'}),p=await login.execute({protocolVersion:2,command:'session.prepare',payload:{launchId:'takeover',prepareOperationId:'takeover-prepare'}});assert.equal((await login.execute({protocolVersion:2,command:'session.commit',payload:{launchId:'takeover',ticketId:p.outcome.data.ticketId,openOperationId:'takeover-open'}})).outcome.status,'committed');assert.equal((await h.service.execute(q)).outcome.code,'SESSION_REVOKED');assert.equal((await h.service.queryOriginalControl(q)).outcome.code,'SESSION_REVOKED');assert.equal(h.character().stamina.value,307);assert.equal(h.store.inspect(h.challengeId).roomPhase,'closed');}
});
test('bounded original control window and actual encoded H/CP/response budgets include wrapper bytes',async()=>{
 const {encodedBytes}=await import('../src/challenge/room-checkpoint.ts'),{loginKey}=await import('../src/identity/identity-v2.ts');const h=await prepareFixture();await h.service.execute(h.command);let last;
 for(let i=1;i<=12;i++)last=await h.service.execute({...h.auth,command:'heartbeat',heartbeatSeq:i,leaseRevision:i-1,payload:payload(h)});
 const state=h.store.inspect(h.challengeId);assert.equal(state.controlReceipts.length,8);assert.ok(encodedBytes(state)<131072);assert.ok(encodedBytes(last)<32768);assert.equal((await h.service.queryOriginalControl({...h.auth,command:'heartbeat',heartbeatSeq:1,leaseRevision:0,payload:payload(h)})).outcome.code,'VERSION_CONFLICT');
 const cp=await paid(),s=await cp.service.execute(ctl(cp,'scene.suspend',1,0,{sceneEpoch:1,timelineEpoch:1})),header=cp.store.inspect(await loginKey('cpHeader',[cp.challengeId]));assert.ok(encodedBytes(header)<16384);assert.ok(encodedBytes(s)<32768);
 console.log('ST10-04 actual UTF-8',{unpaidH8Receipts:encodedBytes(state),unpaidResponse:encodedBytes(last),paidH:encodedBytes(cp.store.inspect(cp.challengeId)),paidHeader:encodedBytes(header),paidResponse:encodedBytes(s)});
});
test('recovery-ready deadline−1/equality/+1 respects fixed pause deadline independently of old lease',async()=>{
 for(const paidRoom of [false,true])for(const now of [13999,14000,14001]){const h=paidRoom?await paid():await prepareFixture();if(!paidRoom)await h.service.execute(h.command);h.clock.now=()=>4000;const p=paidRoom?{sceneEpoch:1,timelineEpoch:1}:{},s=await h.service.execute(ctl(h,'scene.suspend',1,0,p));h.clock.now=()=>8000;const r=await h.service.execute(ctl(h,'scene.resumePrepare',2,s.leaseRevision,{...p,checkpointRevision:paidRoom?s.outcome.data.state.checkpointRevision:null}));h.clock.now=()=>now;const result=await h.service.execute(ready(h,r,3));assert.equal(result.outcome.status,now===13999?'committed':'rejected');if(now!==13999){assert.equal(result.outcome.code,'DEADLINE_EXPIRED');assert.equal(h.character().stamina.value,paidRoom?307:308);}}
});
