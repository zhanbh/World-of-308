import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFixture} from './fixtures/prepare-fixture.mjs';
export async function activateFixture(){
 const h=await prepareFixture(),prepared=await h.service.execute(h.command),m=prepared.outcome.data;
 const command={...h.auth,command:'challenge.activateRoom',operationId:'activate',expected:prepared.outcome.resultVersions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:1}};
 return {...h,manifest:m,activateCommand:command};
}
test('activate opens deterministic unpaid room once and waits without combat anchors',async()=>{
 const h=await activateFixture();h.clock.now=()=>3000;
 const r=await h.service.execute(h.activateCommand);assert.equal(r.outcome.status,'committed');
 assert.equal(r.outcome.data.state.roomPhase,'awaitingReady');assert.equal(r.outcome.data.state.anchorWallAt,null);assert.equal(r.outcome.data.state.inputGapBaseAt,null);
 assert.equal((await h.query()).data.roomPhase,'awaitingReady');
 assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,307);
 assert.equal(h.store.inspect(h.challengeId).transitionClock.connectedElapsedMs,2000);
 const replay=await h.service.execute(h.activateCommand);assert.equal(replay.replayed,true);assert.deepEqual(replay.outcome,r.outcome);
 assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,307);
});
function readyCommand(h,r){return {...h.auth,command:'scene.ready',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(r.outcome.data.readyTicket).filter(([k])=>k!=='deadline'))}};}
test('ready consumes only suffix, anchors once, and lost reply resolves original control receipt',async()=>{
 const h=await activateFixture();h.clock.now=()=>3000;const activated=await h.service.execute(h.activateCommand),q=readyCommand(h,activated);
 h.clock.now=()=>4000;h.store.injectResponseLoss();assert.equal((await h.service.execute(q)).outcome.status,'unknown');
 const original=await h.service.queryOriginalReady({...h.auth,command:'scene.status',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,readyTicketId:q.payload.readyTicketId}});
 assert.equal(original.outcome.status,'committed');assert.equal(original.outcome.data.state.acceptedTick,300);assert.equal(original.outcome.data.state.anchorWallAt,4000);
 h.clock.now=()=>5000;const replay=await h.service.execute(q);assert.equal(replay.replayed,true);assert.equal(replay.outcome.data.state.inputGapBaseAt,4000);assert.equal(h.store.inspect(h.challengeId).transitionClock,undefined);
 assert.equal((await h.query()).data.acceptedTick,300);assert.equal((await h.service.execute({...q,payload:{...q.payload,publicStateHash:'a'.repeat(64)}})).outcome.code,'OPERATION_MISMATCH');
});
test('public recovery is tied to issued baseline and excludes private checkpoint data',async()=>{
 const h=await activateFixture(),r=await h.service.execute(h.activateCommand),t=r.outcome.data.readyTicket;
 const q={...h.auth,query:'scene.recoveryPage',requestId:'page',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(t).filter(([k])=>k!=='deadline')),pageIndex:0}};
 const page=await h.service.query(q);assert.equal(page.records.filter(r=>r.kind==='actor').length,6);assert.equal(page.records.filter(r=>r.kind==='cooldown').length,7);assert.equal(JSON.stringify(page).includes('randomCursor'),false);
 const {verifyRecoveryPages}=await import('../../shared/src/public-state-proof.ts');assert.equal((await verifyRecoveryPages([page])).publicStateHash,t.publicStateHash);
 await assert.rejects(()=>h.service.query({...q,payload:{...q.payload,checkpointRevision:9}}));
});
test('each activate and ready write failure rolls back whole commit; replay never charges twice',async()=>{
 for(let i=1;i<=7;i++){const h=await activateFixture(),before=await h.query();h.store.injectWriteFailure(i);assert.equal((await h.service.execute(h.activateCommand)).outcome.code,'SERVICE_UNAVAILABLE',`activate write ${i}`);assert.deepEqual(await h.query(),before);assert.equal((await h.service.execute(h.activateCommand)).outcome.status,'committed');assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,307);}
 for(let i=1;i<=3;i++){const h=await activateFixture(),r=await h.service.execute(h.activateCommand),before=await h.query();h.store.injectWriteFailure(i);assert.equal((await h.service.execute(readyCommand(h,r))).outcome.code,'SERVICE_UNAVAILABLE',`ready write ${i}`);assert.deepEqual(await h.query(),before);assert.equal((await h.service.execute(readyCommand(h,r))).outcome.status,'committed');}
 const h=await activateFixture();h.store.injectResponseLoss();assert.equal((await h.service.execute(h.activateCommand)).outcome.status,'unknown');const original=await h.service.query({...h.auth,query:'operation.get',requestId:'original',payload:{operationId:'activate'}});assert.equal(original.data.result.outcome.status,'committed');assert.deepEqual((await h.service.execute(h.activateCommand)).outcome,original.data.result.outcome);
});
test('activate validates epochs, versions, connection and original deadlines',async()=>{
 for(const [change,code] of [[{roomAttemptId:'wrong'},'VERSION_CONFLICT'],[{expectedRevision:99},'VERSION_CONFLICT'],[{rolePlayEpoch:99},'VERSION_CONFLICT']]){const h=await activateFixture();assert.equal((await h.service.execute({...h.activateCommand,payload:{...h.activateCommand.payload,...change}})).outcome.code,code);}
 for(const [field,value,code] of [['connection','recovery','RECOVERY_REQUIRED'],['lifeState','dead','ROOM_NOT_AVAILABLE'],['result','failed','CHALLENGE_TERMINAL'],['recoveryUntil',1000,'DEADLINE_EXPIRED'],['deathDeadline',1000,'DEADLINE_EXPIRED']]){const h=await activateFixture();await h.store.run(async tx=>tx.set(h.challengeId,{...await tx.get(h.challengeId),[field]:value}));assert.equal((await h.service.execute(h.activateCommand)).outcome.code,code);}
 const h=await activateFixture();h.clock.now=()=>11000;assert.equal((await h.service.execute(h.activateCommand)).outcome.code,'DEADLINE_EXPIRED');
 const f=await activateFixture(),r=await f.service.execute(f.activateCommand);f.clock.now=()=>11000;assert.equal((await f.service.execute(readyCommand(f,r))).outcome.code,'DEADLINE_EXPIRED');
});
test('subtick transition precision survives activate then ready without double counting',async()=>{
 const h=await activateFixture();h.clock.now=()=>1006;const r=await h.service.execute(h.activateCommand);assert.deepEqual(h.store.inspect(h.challengeId).transitionClock.timeRemainder,{numerator:3,denominator:5});
 h.clock.now=()=>1013;const ready=await h.service.execute(readyCommand(h,r));assert.equal(ready.outcome.data.state.acceptedTick,1);
 const {loginKey}=await import('../src/identity/identity-v2.ts');const header=h.store.inspect(await loginKey('cpHeader',[h.challengeId]));assert.equal(header.timeRemainderMs,3);assert.equal(header.logicalTimeMs,13);
});
test('actual login takeover both orders closes compatible nonempty CP and settles fee once',async()=>{
 const {LoginService}=await import('../src/identity/login-service.ts');
 for(const activateFirst of [true,false]){const h=await activateFixture();if(activateFirst)await h.service.execute(h.activateCommand);
  const login=new LoginService({store:h.store,clock:h.clock,identity:h.identity,ticketTtlMs:60000,initialUnlocks:{},holdingsDomainRef:'bank-test-domain'});
  const p=await login.execute({protocolVersion:2,command:'session.prepare',payload:{launchId:'takeover',prepareOperationId:'takeover-prepare'}}),r=await login.execute({protocolVersion:2,command:'session.commit',payload:{launchId:'takeover',ticketId:p.outcome.data.ticketId,openOperationId:'takeover-open'}});
  assert.equal(r.outcome.status,'committed');assert.equal(h.character().stamina.value,activateFirst?307:308);assert.equal((await h.service.execute(h.activateCommand)).outcome.code,'SESSION_REVOKED');
  assert.equal(h.store.inspect(h.challengeId).roomPhase,'closed');assert.equal(h.store.inspect(h.challengeId).transitionClock,undefined);
  if(activateFirst){const session=r.outcome.data,closed=await h.service.query({protocolVersion:2,sessionId:session.sessionId,sessionEpoch:session.sessionEpoch,query:'challenge.get',requestId:'closed-activated',payload:{challengeId:h.challengeId}});assert.equal(closed.data.roomPhase,'closed');assert.equal(closed.data.connection,'closed');}

 }
});
test('different operation races initialize one room/fee and original operation remains exact after ready',async()=>{
 const h=await activateFixture();let count=0,release;const barrier=new Promise(r=>release=r);h.store.beforeCommit=async attempt=>{if(attempt===0){if(++count===2)release();await barrier;}};
 const [a,b]=await Promise.all([h.service.execute(h.activateCommand),h.service.execute({...h.activateCommand,operationId:'activate-other'})]);h.store.beforeCommit=undefined;
 assert.equal(a.outcome.status,'committed');assert.deepEqual(a.outcome,b.outcome);assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,307);
 await h.service.execute(readyCommand(h,a));const original=await h.service.query({...h.auth,query:'operation.get',requestId:'original',payload:{operationId:'activate'}});assert.deepEqual(original.data.result,a);
});
test('absolute cooldown at5s retains2s after2s prefix and1s suffix, without player reset',async()=>{
 const {loginKey}=await import('../src/identity/identity-v2.ts');const {writeChunk,stateHash}=await import('../src/challenge/room-checkpoint.ts');
 const h=await activateFixture();h.clock.now=()=>3000;const r=await h.service.execute(h.activateCommand),headerId=await loginKey('cpHeader',[h.challengeId]),roleId=await loginKey('cpChunk',[h.challengeId,0]),sceneId=await loginKey('cpChunk',[h.challengeId,1]);
 // Admitted persisted-state fixture at the store boundary: absolute CD deadline and wounded resources.
 await h.store.run(async tx=>{const role=(await tx.get(roleId)).data,scene=(await tx.get(sceneId)).data,oldH=await tx.get(h.challengeId),header=await tx.get(headerId);role.cooldowns[0].readyAtTick=500;role.player.hp='1000';role.hpRegenRemainder={numerator:1,denominator:3};const chunk=await writeChunk(oldH,0,1,role),hash=await stateHash(role,scene);tx.set(roleId,chunk);tx.set(headerId,{...header,activeChunks:[{...header.activeChunks[0],chunkRevision:1,hash:chunk.hash},header.activeChunks[1]],state:{...header.state,publicStateHash:hash}});tx.set(h.challengeId,{...oldH,readyTicket:{...oldH.readyTicket,publicStateHash:hash}});r.outcome.data.readyTicket.publicStateHash=hash;});
 h.clock.now=()=>4000;const result=await h.service.execute(readyCommand(h,r));assert.equal(result.outcome.status,'committed');assert.equal(result.outcome.data.state.acceptedTick,300);const role=h.store.inspect(roleId).data;assert.equal(role.cooldowns[0].readyAtTick-result.outcome.data.state.acceptedTick,200);assert.equal(role.player.hp,'1000');assert.deepEqual(role.hpRegenRemainder,{numerator:1,denominator:3});
});
test('supported responses and original receipts include actual wrapper bytes within all budgets',async()=>{
 const {loginKey}=await import('../src/identity/identity-v2.ts'),{encodedBytes}=await import('../src/challenge/room-checkpoint.ts');const h=await activateFixture();
 const cmd={...h.activateCommand,expected:[...h.activateCommand.expected,...Array.from({length:30},(_,i)=>({kind:'equipment',id:(i+'"\\'.repeat(64)).slice(0,128),version:Number.MAX_SAFE_INTEGER}))]};
 const result=await h.service.execute(cmd),snapshot=h.store.snapshot(),header=h.store.inspect(await loginKey('cpHeader',[h.challengeId])),o=h.store.inspect((await h.keys('activate')).o),chunks=header.activeChunks.map(r=>h.store.inspect([...snapshot.keys()].find(k=>{const v=snapshot.get(k);return v?.challengeId===h.challengeId&&v?.ordinal===r.ordinal&&v?.data;})));
 assert.equal(result.outcome.status,'committed');assert.ok(encodedBytes(o)<=16384);assert.ok(encodedBytes(header)<=16384);assert.ok(chunks.every(c=>encodedBytes(c)<=81920));assert.ok(encodedBytes(result)<=32768);assert.equal(JSON.stringify(o).includes('enemies'),false);
 console.log('ST10-03 actual UTF-8',{H:encodedBytes(h.store.inspect(h.challengeId)),header:encodedBytes(header),chunks:chunks.map(encodedBytes),activateResponse:encodedBytes(result),activateO:encodedBytes(o)});
});
test('historical ready receipt stays exact while current expired scene cannot authorize prediction',async()=>{
 const h=await activateFixture(),r=await h.service.execute(h.activateCommand),q=readyCommand(h,r),ready=await h.service.execute(q);h.clock.now=()=>11000;
 const original=await h.service.queryOriginalReady({...h.auth,command:'scene.status',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,readyTicketId:q.payload.readyTicketId}});assert.deepEqual(original,ready);assert.equal((await h.query()).error.code,'DEADLINE_EXPIRED');
});
test('reserved snapshot fee clips tozero without introducing midchallenge brokenweapon gate',async()=>{
 const h=await activateFixture();await h.store.run(async tx=>{const old=await tx.get(h.challengeId);tx.set(h.challengeId,{...old,staminaSnapshot:{...old.staminaSnapshot,remaining:0},equipmentSnapshot:old.equipmentSnapshot.map(e=>({...e,durability:{...e.durability,current:0}}))});});const r=await h.service.execute(h.activateCommand);assert.equal(r.outcome.status,'committed');assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,0);assert.equal((await h.service.execute(h.activateCommand)).replayed,true);assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.revision,1);
});
