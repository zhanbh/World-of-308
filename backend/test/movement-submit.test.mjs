import test from 'node:test';
import assert from 'node:assert/strict';
import {movementFixture} from './fixtures/movement-fixture.mjs';
test('real ready movement commits compact receipt, precise clock and current public proof',async()=>{
 const h=await movementFixture(),q=await h.command();h.clock.now=()=>1513;
 const r=await h.service.execute(q);assert.equal(r.outcome.status,'committed',JSON.stringify(r));assert.equal(r.outcome.data.acceptedTick,51);
 const page=await h.service.query({...h.base,payload:{...h.base.payload,checkpointRevision:r.outcome.data.checkpointRevision}});
 assert.equal(page.records[0].x,-178500);assert.equal(h.store.inspect(h.headerId).logicalTimeMs,513);assert.equal(h.store.inspect(h.headerId).timeRemainderMs,3);
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'original',payload:{operationId:'move'}});assert.deepEqual(original.data.result,r);
 assert.equal(JSON.stringify(original).includes('randomCursor'),false);
 assert.equal((await h.service.execute(q)).replayed,true);
});

test('future frontier cannot be gained per packet, empty inputs retain movement, discrete rejection is ordered',async()=>{
 const h=await movementFixture();h.clock.now=()=>1513;const first=await h.command([{kind:'skill',skillId:'cross'},{kind:'move',x:333,y:-500},{kind:'basic',pressed:true}],50);
 const r=await h.service.execute(first);assert.equal(r.outcome.status,'committed');assert.deepEqual(r.outcome.data.events,[{seq:1,tick:1,kind:'rejected',code:'ACTION_NOT_SUPPORTED'},{seq:3,tick:1,kind:'rejected',code:'ACTION_NOT_SUPPORTED'}]);
 const second=await h.command([],1,'future');assert.equal((await h.service.execute(second)).outcome.code,'TIME_FRONTIER');
 h.clock.now=()=>1523;assert.equal((await h.service.execute(second)).outcome.status,'committed');
});
test('strict versions/digest/sequence/epochs reject whole fragment with no CP progress',async()=>{
 for(const [patch,code] of [[{sceneEpoch:2},'VERSION_CONFLICT'],[{timelineEpoch:2},'VERSION_CONFLICT'],[{roomNo:1},'VERSION_CONFLICT'],[{baseCheckpointVersion:99},'VERSION_CONFLICT'],[{fromTick:2,toTick:52},'INPUT_GAP'],[{firstSeq:2,lastSeq:2},'INPUT_GAP'],[{digest:'a'.repeat(64)},'DIGEST_MISMATCH'],[{ruleRef:'wrong'},'CONFIG_NOT_READY'],[{mapRef:'wrong'},'CONFIG_NOT_READY']]){
  const h=await movementFixture(),q=await h.command();q.payload={...q.payload,...patch};if(patch.firstSeq)q.payload.inputs[0].seq=2;if(patch.fromTick)q.payload.inputs[0].tick=patch.fromTick;h.clock.now=()=>1513;const before=h.store.snapshot();assert.equal((await h.service.execute(q)).outcome.code,code);assert.deepEqual(h.store.snapshot(),before);
 }
});
test('all five movement writes roll back, original lost reply stays exact and replay cannot refresh gap',async()=>{
 for(let write=1;write<=5;write++){const h=await movementFixture(),q=await h.command();h.clock.now=()=>1513;const before=h.store.snapshot();h.store.injectWriteFailure(write);assert.equal((await h.service.execute(q)).outcome.code,'SERVICE_UNAVAILABLE',`write ${write}`);assert.deepEqual(h.store.snapshot(),before);assert.equal((await h.service.execute(q)).outcome.status,'committed');}
 const h=await movementFixture(),q=await h.command();h.clock.now=()=>1513;h.store.injectResponseLoss();assert.equal((await h.service.execute(q)).outcome.status,'unknown');
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'original',payload:{operationId:q.operationId}});h.clock.now=()=>2000;assert.deepEqual((await h.service.execute(q)).outcome,original.data.result.outcome);
 const {loginKey}=await import('../src/identity/identity-v2.ts');const id=await loginKey('cpHeader',[h.challengeId]);assert.equal(h.store.inspect(id).state.inputGapBaseAt,1513);
 const mismatch={...q,payload:{...q.payload,digest:'b'.repeat(64)}};assert.equal((await h.service.execute(mismatch)).outcome.code,'OPERATION_MISMATCH');h.setSubject('different-user');assert.equal((await h.service.execute(q)).outcome.code,'AUTH_REQUIRED');
});
test('two-second gap freezes at original lease deadline; heartbeat and historical input never renew it',async()=>{
 const h=await movementFixture(),q=await h.command();h.clock.now=()=>3013;
 assert.equal((await h.service.execute(q)).outcome.code,'RECOVERY_REQUIRED');const entity=h.store.inspect(h.challengeId);assert.equal(entity.recoveryUntil,11013);assert.equal(entity.connection,'recovery');
 h.clock.now=()=>4000;const heartbeat={...h.auth,command:'heartbeat',heartbeatSeq:1,leaseRevision:entity.lease.revision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1}};assert.equal((await h.service.execute(heartbeat)).outcome.code,'RECOVERY_REQUIRED');assert.equal(h.store.inspect(h.challengeId).recoveryUntil,11013);
 h.clock.now=()=>11013;assert.equal((await h.service.execute(q)).outcome.code,'DEADLINE_EXPIRED');assert.equal(h.store.inspect(h.challengeId).sceneState,'closed');
});
test('actual login takeover both orders preserves confirmed movement and revokes stale original replay',async()=>{
 const {LoginService}=await import('../src/identity/login-service.ts');
 for(const moveFirst of [true,false]){const h=await movementFixture(),q=await h.command();h.clock.now=()=>1513;if(moveFirst)assert.equal((await h.service.execute(q)).outcome.status,'committed');
 const login=new LoginService({store:h.store,clock:h.clock,identity:h.identity,ticketTtlMs:60000,initialUnlocks:{},holdingsDomainRef:'bank-test-domain'});
 const p=await login.execute({protocolVersion:2,command:'session.prepare',payload:{launchId:'takeover',prepareOperationId:'takeover-prepare'}}),r=await login.execute({protocolVersion:2,command:'session.commit',payload:{launchId:'takeover',ticketId:p.outcome.data.ticketId,openOperationId:'takeover-open'}});assert.equal(r.outcome.status,'committed');assert.equal((await h.service.execute(q)).outcome.code,'SESSION_REVOKED');if(moveFirst){const fresh=r.outcome.data,original=await h.service.query({protocolVersion:2,sessionId:fresh.sessionId,sessionEpoch:fresh.sessionEpoch,query:'operation.get',requestId:'new-session-old-original',payload:{operationId:q.operationId}});assert.equal(original.data.status,'found');assert.equal(original.data.result.operationId,q.operationId);const stale=await h.service.query({...h.auth,query:'operation.get',requestId:'revoked-original',payload:{operationId:q.operationId}});assert.equal(stale.error.code,'SESSION_REVOKED');}assert.equal(h.store.inspect(h.challengeId).acceptedTick,moveFirst?51:1);assert.equal(h.store.inspect(h.challengeId).sceneState,'closed');}
});
test('competing valid fragments select one frontier and clock advance on transaction retry cannot bypass gap',async()=>{
 const h=await movementFixture(),q=await h.command(),other=await h.command([{kind:'move',x:-1000,y:0}],50,'other');h.clock.now=()=>1513;
 const results=await Promise.all([h.service.execute(q),h.service.execute(other)]);assert.equal(results.filter(r=>r.outcome.status==='committed').length,1);assert.equal(results.find(r=>r.outcome.status==='rejected').outcome.code,'VERSION_CONFLICT');
 const retry=await movementFixture(),rq=await retry.command();retry.clock.now=()=>1513;let changed=false;
 retry.store.beforeCommit=async()=>{if(changed)return;changed=true;retry.clock.now=()=>3013;};
 const rr=await retry.service.execute(rq);retry.store.beforeCommit=undefined;assert.equal(rr.outcome.code,'RECOVERY_REQUIRED');assert.equal(retry.store.inspect(retry.challengeId).acceptedTick,1);
});
test('heartbeat/status discovers exact silent gap and all recovery writes are atomic',async()=>{
 for(const now of [3012,3013,3014]){const h=await movementFixture();h.clock.now=()=>now;const heartbeat={...h.auth,command:'heartbeat',heartbeatSeq:1,leaseRevision:1,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1}};
 const r=await h.service.execute(heartbeat);assert.equal(r.outcome.status,now===3012?'committed':'rejected');if(now>=3013){assert.equal(r.outcome.code,'RECOVERY_REQUIRED');assert.equal(h.store.inspect(h.challengeId).recoveryUntil,11013);}}
 for(let write=1;write<=2;write++){const h=await movementFixture(),q=await h.command();h.clock.now=()=>3013;const before=h.store.snapshot();h.store.injectWriteFailure(write);assert.equal((await h.service.execute(q)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(h.store.snapshot(),before);}
 const h=await movementFixture();h.clock.now=()=>3014;assert.equal((await h.query()).data.connection,'recovery');assert.equal(h.store.inspect(h.challengeId).recoveryUntil,11013);
});
test('original input query stays account-owned historical evidence; current public proof is revision and identity bound',async()=>{
 const h=await movementFixture(),q=await h.command();h.clock.now=()=>1513;const r=await h.service.execute(q),pageQuery={...h.base,payload:{...h.base.payload,checkpointRevision:r.outcome.data.checkpointRevision}};
 const page=await h.service.query(pageQuery);assert.equal(page.records.some(r=>r.kind==='movement'),true);assert.equal(JSON.stringify(page).includes('attackPower'),false);
 await assert.rejects(()=>h.service.query({...pageQuery,payload:{...pageQuery.payload,checkpointRevision:0}}));
 await h.store.run(tx=>tx.set(h.characterId,{...h.character(),rolePlayEpoch:h.character().rolePlayEpoch+1}));
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'old-role',payload:{operationId:q.operationId}});assert.deepEqual(original.data.result,r);
});
test('commit retry rechecks wall clock and gap after a real A write conflict',async()=>{
 const h=await movementFixture(),q=await h.command();h.clock.now=()=>1513;let calls=0,injected=false;
 h.store.beforeCommit=async()=>{calls++;if(calls!==2||injected)return;injected=true;await h.store.run(tx=>tx.set(h.account().id,{...h.account(),writeRevision:h.account().writeRevision+1}));h.clock.now=()=>3013;};
 const r=await h.service.execute(q);h.store.beforeCommit=undefined;assert.equal(injected,true);assert.ok(h.store.conflicts>=1);assert.equal(r.outcome.code,'RECOVERY_REQUIRED');assert.equal(h.store.inspect(h.challengeId).acceptedTick,1);
});
test('corrupted matching receipts and orphan shared journals fail closed; cross-service operation cannot be reused',async()=>{
 const {loginKey}=await import('../src/identity/identity-v2.ts');
 for(const patch of [{schemaVersion:1},{id:'wrong'},{accountId:'wrong'},'wrongOperation']){const h=await movementFixture(),q=await h.command();h.clock.now=()=>1513;assert.equal((await h.service.execute(q)).outcome.status,'committed');const id=await loginKey('assetOp',[h.account().id,q.operationId]);await h.store.run(async tx=>{const old=await tx.get(id);tx.set(id,patch==='wrongOperation'?{...old,result:{...old.result,operationId:'other-operation'}}:{...old,...patch});});assert.equal((await h.service.execute(q)).outcome.code,'SERVICE_UNAVAILABLE');}
 const orphan=await movementFixture(),q=await orphan.command();orphan.clock.now=()=>1513;const journal=await loginKey('assetJournal',[orphan.account().id,q.operationId]);await orphan.store.run(tx=>tx.set(journal,{id:journal,schemaVersion:2}));const before=orphan.store.snapshot();assert.equal((await orphan.service.execute(q)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(orphan.store.snapshot(),before);
 const cross=await movementFixture(),cq=await cross.command();cross.clock.now=()=>1513;cq.operationId='prepare';assert.equal((await cross.service.execute(cq)).outcome.code,'OPERATION_MISMATCH');
});
test('maximum32 discrete inputs produce bounded actual request, response, receipt, CP and public page',async()=>{
 const h=await movementFixture(),q=await h.command(Array.from({length:32},()=>({kind:'skill',skillId:'earth'})),100,'max-inputs');h.clock.now=()=>2013;const r=await h.service.execute(q);assert.equal(r.outcome.status,'committed');assert.equal(r.outcome.data.events.length,32);
 const {loginKey}=await import('../src/identity/identity-v2.ts'),bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length,receipt=h.store.inspect(await loginKey('assetOp',[h.account().id,q.operationId])),page=await h.service.query({...h.base,payload:{...h.base.payload,checkpointRevision:r.outcome.data.checkpointRevision}}),header=h.store.inspect(h.headerId);
 const sizes={request:bytes(q),response:bytes(r),receipt:bytes(receipt),header:bytes(header),page:bytes(page)};assert.ok(sizes.request<=16384);assert.ok(sizes.response<=32768);assert.ok(sizes.receipt<=16384);assert.ok(sizes.header<=16384);assert.ok(sizes.page<=32768);console.log('ST11-01 max32 UTF-8',sizes);
});
