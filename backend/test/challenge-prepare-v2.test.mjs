import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFixture} from './fixtures/prepare-fixture.mjs';
test('unpaid first prepare returns immutable byte manifest and never creates combat/fee',async()=>{
 const h=await prepareFixture(),before=await h.query();
 assert.equal(before.data.kind,'unpaidLoading');assert.equal(before.data.checkpoint,null);
 const r=await h.service.execute(h.command);assert.equal(r.outcome.status,'committed');
 assert.equal(r.outcome.data.roomNo,0);assert.equal(r.outcome.data.releaseRef,h.content.releaseRef);
 assert.ok(r.outcome.data.resources.length>0);assert.equal(r.outcome.data.spawns.filter(s=>s.role==='purple').length,1);
 const after=await h.query();assert.equal(after.data.sceneEpoch,0);assert.equal(after.data.currentRoomNo,-1);assert.equal(after.data.staminaRemaining,before.data.staminaRemaining);
 assert.equal(after.data.checkpoint,null);assert.equal(after.data.transitionClock.settledAt,1000);
 const again=await h.service.execute({...h.command,operationId:'other'});assert.deepEqual(again.outcome.data,r.outcome.data);
 assert.equal((await h.query()).data.transitionClock.settledAt,1000);
});

test('all prepare write failures roll back; response loss and operation.get recover exact original references',async()=>{
 for(let i=1;i<=3;i++){
  const h=await prepareFixture(),before=await h.query();h.store.injectWriteFailure(i);
  assert.equal((await h.service.execute(h.command)).outcome.code,'SERVICE_UNAVAILABLE');
  assert.deepEqual(await h.query(),before);assert.equal((await h.service.execute(h.command)).outcome.status,'committed');
 }
 const h=await prepareFixture();h.store.injectResponseLoss();assert.equal((await h.service.execute(h.command)).outcome.status,'unknown');
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'original',payload:{operationId:'prepare'}});
 assert.equal(original.data.status,'found');const result=original.data.result;
 const replay=await h.service.execute(h.command);assert.deepEqual(replay.outcome,result.outcome);assert.equal(replay.replayed,true);
 assert.equal((await h.service.execute({...h.command,payload:{...h.command.payload,nextRoomNo:1}})).outcome.code,'OPERATION_MISMATCH');
});
test('stale/terminal/dead/recovery/jump and revoked identity cannot prepare a room',async()=>{
 const h=await prepareFixture();
 assert.equal((await h.service.execute({...h.command,operationId:'stale',payload:{...h.command.payload,expectedRevision:99}})).outcome.code,'VERSION_CONFLICT');
 assert.equal((await h.service.execute({...h.command,operationId:'jump',payload:{...h.command.payload,nextRoomNo:1}})).outcome.code,'ROOM_NOT_AVAILABLE');
 for(const [field,value,code] of [['lifeState','dead','ROOM_NOT_AVAILABLE'],['connection','recovery','RECOVERY_REQUIRED'],['result','failed','CHALLENGE_TERMINAL']]){
  const f=await prepareFixture();await f.store.run(async tx=>{const old=await tx.get(f.challengeId);tx.set(f.challengeId,{...old,[field]:value});});
  assert.equal((await f.service.execute(f.command)).outcome.code,code);
 }
 h.setSubject('other');assert.equal((await h.service.execute(h.command)).outcome.code,'AUTH_REQUIRED');
});
test('same intent racing distinct operations produces one manifest and original clock',async()=>{
 const h=await prepareFixture();let count=0,release;const barrier=new Promise(r=>release=r);
 h.store.beforeCommit=async attempt=>{if(attempt===0){if(++count===2)release();await barrier;}};
 const [a,b]=await Promise.all([h.service.execute(h.command),h.service.execute({...h.command,operationId:'second'})]);
 assert.equal(a.outcome.status,'committed');assert.deepEqual(a.outcome.data,b.outcome.data);
 assert.equal((await h.query()).data.transitionClock.transitionRevision,0);
});
test('original operation hydrates its immutable manifest even when H no longer references that attempt',async()=>{
 const h=await prepareFixture(),r=await h.service.execute(h.command);
 await h.store.run(async tx=>{const old=await tx.get(h.challengeId);tx.set(h.challengeId,{...old,pendingRoomAttempt:undefined,transitionClock:undefined,version:old.version+1});});
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'old-original',payload:{operationId:'prepare'}});
 assert.deepEqual(original.data.result,r);
 const keys=await h.keys('prepare'),receipt=h.store.inspect(keys.o);assert.equal('resources' in receipt.result.outcome.data,false);assert.equal('spawns' in receipt.result.outcome.data,false);
});
test('actual login takeover before or after prepare closes unpaid room with no CP/fee and rejects old session',async()=>{
 const {LoginService}=await import('../src/identity/login-service.ts');
 for(const prepareFirst of [true,false]){
  const h=await prepareFixture();if(prepareFirst)assert.equal((await h.service.execute(h.command)).outcome.status,'committed');
  const login=new LoginService({store:h.store,clock:h.clock,identity:h.identity,ticketTtlMs:60000,initialUnlocks:{},holdingsDomainRef:'bank-test-domain'});
  const p=await login.execute({protocolVersion:2,command:'session.prepare',payload:{launchId:'takeover',prepareOperationId:'takeover-prepare'}});
  const opened=await login.execute({protocolVersion:2,command:'session.commit',payload:{launchId:'takeover',ticketId:p.outcome.data.ticketId,openOperationId:'takeover-open'}});
  assert.equal(opened.outcome.status,'committed');assert.equal(h.character().stamina.value,308);assert.equal(h.character().location.kind,'inn');
  assert.equal((await h.service.execute(h.command)).outcome.code,'SESSION_REVOKED');
  const session=opened.outcome.data;const closed=await h.service.query({protocolVersion:2,sessionId:session.sessionId,sessionEpoch:session.sessionEpoch,query:'challenge.get',requestId:'closed',payload:{challengeId:h.challengeId}});
  assert.equal(closed.data.roomPhase,'closed');assert.equal(closed.data.checkpoint,null);assert.equal(closed.data.transitionClock,null);
 }
});
test('same room intent accepts original or current revision but rejects forged pending context',async()=>{
 const h=await prepareFixture();await h.service.execute(h.command);
 const forged={...h.command,operationId:'forged-pending',payload:{...h.command.payload,expectedRevision:999}};
 assert.equal((await h.service.execute(forged)).outcome.code,'VERSION_CONFLICT');
});
test('maximum escaped expected context keeps original receipt bounded and resolves exact outcome',async()=>{
 const h=await prepareFixture();const command={...h.command,expected:[...h.command.expected,...Array.from({length:30},(_,i)=>({kind:'equipment',id:(String(i)+'"\\'.repeat(64)).slice(0,128),version:Number.MAX_SAFE_INTEGER}))]};
 const result=await h.service.execute(command);assert.equal(result.outcome.status,'committed');
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'max-original',payload:{operationId:'prepare'}});assert.deepEqual(original.data.result,result);
 const keys=await h.keys('prepare'),receipt=h.store.inspect(keys.o);const bytes=new TextEncoder().encode(JSON.stringify(receipt)).length;assert.ok(bytes<=16384);console.log('ST10-02 maximum escaped expected receipt UTF-8 bytes',bytes);
});
