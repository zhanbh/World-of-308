import test from 'node:test';
import assert from 'node:assert/strict';
import {dropFixture} from './fixtures/drop-fixture.mjs';
import {ChallengeService} from '../src/challenge/challenge-service.ts';

test('real basic kill creates fixed room drops while training remains rewardless',async()=>{
 const h=await dropFixture();assert.equal((await h.list()).data.drops.length,0);
 await h.kill();const view=await h.list();assert.ok(view.data.drops.length>0);assert.equal(view.data.drops[0].quantity,3);assert.equal(view.data.drops[0].collected,false);
 assert.deepEqual(await h.list(),view);
});


test('collect consumes room source atomically and replays original receipt',async()=>{
 const h=await dropFixture();await h.kill();const view=await h.list(),d=view.data.drops[0];
 const q={...h.auth,command:'drop.collect',operationId:'collect',expected:view.versions,payload:{challengeId:h.challengeId,roomNo:0,sceneEpoch:1,roomToken:view.data.roomToken,dropId:d.dropId,positionHint:{x:d.x,y:d.y}}};
 const r=await h.service.execute(q);assert.equal(r.outcome.status,'committed',JSON.stringify({r,d}));
 assert.equal((await h.list()).data.drops[0].collected,true);assert.equal(h.bag().slots[Object.keys(h.bag().slots).at(-1)].quantity,3);
 assert.equal((await h.service.execute(q)).replayed,true);
});


async function collectCommand(h,operationId='collect',overrides={}){const v=await h.list();return {...h.auth,command:'drop.collect',operationId,expected:v.versions,payload:{challengeId:h.challengeId,roomNo:v.data.roomNo,sceneEpoch:v.data.sceneEpoch,roomToken:v.data.roomToken,dropId:v.data.drops[0].dropId,positionHint:{x:v.data.drops[0].x,y:v.data.drops[0].y},...overrides}};}

test('same operation binds rejected intent and a forged hint never authorizes distance',async()=>{
 const h=await dropFixture();await h.kill();
 // Only admitted boundary mutation: relocate authoritative CP, preserving validated hash/chunk lineage.
 const {readCheckpoint,writeChunk,stateHash}=await import('../src/challenge/room-checkpoint.ts');
 await h.store.run(async tx=>{const ch=await tx.get(h.challengeId),cp=await readCheckpoint(tx,ch);cp.role.player.x=100000;cp.role.movement.state.x='100000';const chunk=await writeChunk(ch,0,cp.header.activeChunks[0].chunkRevision+1,cp.role);tx.set(chunk.id,chunk);tx.set(cp.header.id,{...cp.header,activeChunks:cp.header.activeChunks.map(r=>r.ordinal===0?{...r,chunkRevision:chunk.chunkRevision,hash:chunk.hash}:r),state:{...cp.header.state,publicStateHash:await stateHash(cp.role,cp.scene)}});});
 const q=await collectCommand(h);const before=h.bag(),r=await h.service.execute(q);assert.equal(r.outcome.code,'NOT_FOUND_OR_FORBIDDEN');assert.deepEqual(h.bag(),before);assert.equal((await h.list()).data.drops[0].collected,false);
 assert.equal((await h.service.execute(q)).replayed,true);assert.equal((await h.service.execute({...q,payload:{...q.payload,positionHint:{x:0,y:0}}})).outcome.code,'OPERATION_MISMATCH');
});
test('full bag preserves ground source; a matching partial stack still accepts whole source',async()=>{
 const h=await dropFixture();await h.kill();await h.seed(Object.fromEntries(Array.from({length:20},(_,i)=>[i,h.stack('full'+i,20)])));
 const q=await collectCommand(h);assert.equal((await h.service.execute(q)).outcome.code,'BAG_FULL');assert.equal((await h.list()).data.drops[0].collected,false);
 await h.store.run(async tx=>{const b=h.bag();tx.set(b.id,{...b,version:b.version+1,slots:{...b.slots,0:{...b.slots[0],templateRef:{id:'ore',version:1},quantity:17}}});});
 const r=await h.service.execute(await collectCommand(h,'collect-after-space'));assert.equal(r.outcome.status,'committed');assert.equal(h.bag().slots[0].quantity,20);assert.equal(Object.keys(h.bag().slots).length,20);
 const j=h.store.inspect(r.outcome.data.deliveryRef);assert.equal(j.changes.inputs.find(i=>i.kind==='stack').quantity,17);assert.equal(j.changes.outputs[0].quantity,20);assert.match(h.bag().slots[0].traceRef,/^v2:assetJournal:/);
});
test('all material delivery write failures roll back and response loss recovers original receipt',async()=>{
 for(let write=1;write<=5;write++){const h=await dropFixture();await h.kill();const q=await collectCommand(h),before=h.store.snapshot();h.store.injectWriteFailure(write);assert.equal((await h.service.execute(q)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(h.store.snapshot(),before);assert.equal((await h.service.execute(q)).outcome.status,'committed');}
 const h=await dropFixture();await h.kill();const q=await collectCommand(h);h.store.injectResponseLoss();assert.equal((await h.service.execute(q)).outcome.status,'unknown');const after=h.store.snapshot();const r=await h.service.execute(q);assert.equal(r.outcome.status,'committed');assert.equal(r.replayed,true);assert.deepEqual(h.store.snapshot(),after);
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'original',payload:{operationId:q.operationId}});assert.equal(original.data.result.outcome.data.dropId,q.payload.dropId);
});
test('two independent collect intents race one source and cannot both mint',async()=>{
 const h=await dropFixture();await h.kill();const q=await collectCommand(h),r=await Promise.all([h.service.execute(q),h.service.execute({...q,operationId:'race-2'})]);assert.equal(r.filter(x=>x.outcome.status==='committed').length,1);assert.equal((await h.list()).data.drops[0].collected,true);
});


const setCandidate={kind:'equipment',templateRef:{id:'equipment:test-set-boots',version:1},quantity:1,quality:'purple',itemLevel:30,binding:{kind:'character'},equipment:{slotKind:'boots',affixes:[{stat:'haste',value:10}],setRef:{id:'set:armor',version:1},durability:{wearEnabled:true,current:100,max:100,policyRef:'test-durability'}}};
test('equipment materializes only on successful collect, holds one role scope and every write rolls back',async()=>{
 for(let fail=0;fail<=7;fail++){
  const h=await dropFixture(setCandidate);
  const domain={ref:'bank-test-domain',keys:[{collectionKey:'armor-boots-warrior',setId:'set:armor',setVersion:1,itemLevel:30,slotId:'boots',classId:'warrior'}]};
  h.service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:{...h.content,drops:{...h.drops,holdingsDomain:domain}}});
  // Fixture list/kill refer to the original service: generation is identical, only collection supplies projection domain.
  await h.kill();const ground=(await h.list()).data.drops[0];assert.equal([...h.store.snapshot().values()].filter(v=>v.sourceLocator?.dropId===ground.dropId).length,0);
  const q=await collectCommand(h),before=h.store.snapshot();if(fail)h.store.injectWriteFailure(fail);
  const r=await h.service.execute(q);if(fail){assert.equal(r.outcome.code,'SERVICE_UNAVAILABLE',JSON.stringify(r));assert.deepEqual(h.store.snapshot(),before);continue;}
  assert.equal(r.outcome.status,'committed',JSON.stringify(r));const item=h.store.inspect(r.outcome.data.itemIds[0]);assert.equal(item.sourceOrdinal,0);assert.equal(item.location.kind,'container');assert.equal(item.binding.characterId,h.characterId);
  const {loginKey}=await import('../src/identity/identity-v2.ts');const holdings=h.store.inspect(await loginKey('holdings',[h.account().id,'character',h.characterId]));assert.equal(holdings.entries[0].permanentCount,1);
  const snapshot=h.store.snapshot();assert.equal((await h.service.execute(q)).replayed,true);assert.deepEqual(h.store.snapshot(),snapshot);
 }
});
test('unconfirmed or foreign kill sources cannot be minted from a room descriptor',async()=>{
 const h=await dropFixture();await h.kill();const {loginKey}=await import('../src/identity/identity-v2.ts'),roomId=await loginKey('room',[h.challengeId,0]);
 await h.store.run(async tx=>{const room=await tx.get(roomId);room.drops[0].sourceId='forged-source';tx.set(roomId,room);});
 const r=await h.service.execute(await collectCommand(h));assert.equal(r.outcome.code,'CONFIG_NOT_READY');assert.equal((await h.list()).data.drops[0].collected,false);
});

test('client lost collect response survives reconstruction and recovers original intent',async()=>{
 const {DropCoordinator}=await import('../../client/assets/scripts/net/DropCoordinator.ts');
 const h=await dropFixture();await h.kill();const sent=[],saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 const transport={send:async text=>{const q=JSON.parse(text);sent.push(q);return JSON.stringify(q.query?await h.service.query(q):await h.service.execute(q));}};
 const identity={...h.auth,challengeId:h.challengeId,sceneEpoch:1},first=new DropCoordinator(transport,persistence);await first.open(identity);h.store.injectResponseLoss();await first.collect('client-collect',first.state.view.data.drops[0].dropId);assert.equal(first.state.status,'unknown');
 const next=new DropCoordinator(transport,persistence);await next.open(identity);assert.equal(next.state.status,'unknown');await next.retry();assert.equal(next.state.status,'ready');assert.equal(next.state.view.data.drops[0].collected,true);
 assert.equal(sent.filter(q=>q.command==='drop.collect').length,1);assert.equal(sent.filter(q=>q.query==='operation.get').length,1);assert.equal(saved.size,0);
});

test('leaving invalidates uncollected sources and never removes committed items in either order',async()=>{
 for(const order of ['collect-first','leave-first']){const h=await dropFixture();await h.kill();const q=await collectCommand(h),leave={...h.auth,command:'challenge.leave',operationId:'leave',expected:(await h.query()).versions,payload:{challengeId:h.challengeId,reason:'abandon'}};
 if(order==='collect-first'){assert.equal((await h.service.execute(q)).outcome.status,'committed');const b=h.bag();assert.equal((await h.service.execute(leave)).outcome.status,'committed');assert.deepEqual(h.bag(),b);assert.equal((await h.service.execute(q)).replayed,true);}else{assert.equal((await h.service.execute(leave)).outcome.status,'committed');assert.equal((await h.service.execute(q)).outcome.code,'NOT_FOUND_OR_FORBIDDEN');}
 assert.equal((await h.list()).error.code,'NOT_FOUND_OR_FORBIDDEN');}
});
test('prepare next room prevents collecting prior-room ground before activation',async()=>{
 const h=await dropFixture();await h.kill();const q=await collectCommand(h),s=(await h.query()).data;
 const prepared=await h.service.execute({...h.prepareCommand,operationId:'prepare-next',expected:(await h.query()).versions,payload:{...h.prepareCommand.payload,nextRoomNo:1,expectedRevision:(await h.query()).versions.find(v=>v.kind==='challenge').version}});assert.equal(prepared.outcome.status,'committed',JSON.stringify(prepared));
 assert.equal((await h.service.execute(q)).outcome.code,'ROOM_NOT_AVAILABLE');
});
test('scope, epoch, room token and revoked session do not authorize collectible source',async()=>{
 for(const [patch,code]of [[{roomToken:'foreign'},'NOT_FOUND_OR_FORBIDDEN'],[{sceneEpoch:2},'VERSION_CONFLICT'],[{roomNo:1},'VERSION_CONFLICT'],[{challengeId:'foreign'},'NOT_FOUND_OR_FORBIDDEN']]){const h=await dropFixture();await h.kill();const q=await collectCommand(h,'bad',patch);assert.equal((await h.service.execute(q)).outcome.code,code);assert.equal((await h.list()).data.drops[0].collected,false);}
 const h=await dropFixture();await h.kill();const q=await collectCommand(h);assert.equal((await h.service.execute({...q,sessionEpoch:q.sessionEpoch+1})).outcome.code,'SESSION_REVOKED');
});


test('no drop authorization keeps training rewardless even on real kills',async()=>{
 const h=await dropFixture(),plain=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:h.content});h.clock.now=()=>1513;
 const result=await plain.execute(await h.command([{kind:'basic',pressed:true}],50,'training-kill'));assert.equal(result.outcome.status,'committed');assert.equal((await h.list()).data.drops.length,0);
});
test('source payload and fixed configuration cannot be changed into another prize',async()=>{
 const h=await dropFixture();await h.kill();const {loginKey}=await import('../src/identity/identity-v2.ts'),id=await loginKey('room',[h.challengeId,0]);await h.store.run(async tx=>{const r=await tx.get(id);r.drops[0].quantity=20;tx.set(id,r);});assert.equal((await h.service.execute(await collectCommand(h))).outcome.code,'CONFIG_NOT_READY');
 const other=await dropFixture();await other.kill();const changed=new ChallengeService({store:other.store,clock:other.clock,identity:other.identity,content:{...other.content,drops:{...other.drops,candidates:[{...other.drops.candidates[0],quantity:20}]}}});assert.equal((await changed.execute(await collectCommand(other))).outcome.code,'CONFIG_NOT_READY');
});
test('collect and leave racing from one snapshot serialize safely in both commit orders',async()=>{
 for(const winner of ['drop.collect','challenge.leave']){
 const h=await dropFixture();await h.kill();const collect=await collectCommand(h),leave={...h.auth,command:'challenge.leave',operationId:'race-leave',expected:(await h.query()).versions,payload:{challengeId:h.challengeId,reason:'abandon'}};
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);const store={run:work=>h.store.run(async tx=>{let command=null;const r=await work({get:tx.get,set:(id,v)=>{if(v.command==='drop.collect'||v.command==='challenge.leave')command=v.command;tx.set(id,v);}});if(command&&command!==winner){entered();await gate;}return r;})};
 const svc=new ChallengeService({store,clock:h.clock,identity:h.identity,content:{...h.content,drops:h.drops}}),win=winner==='drop.collect'?collect:leave,lose=winner==='drop.collect'?leave:collect;
 const losing=svc.execute(lose);await started;const first=await svc.execute(win);release();const second=await losing;assert.equal(first.outcome.status,'committed');
 if(winner==='drop.collect'){assert.equal(second.outcome.status,'committed');assert.ok(Object.values(h.bag().slots).some(s=>s.kind==='stack'&&s.templateRef.id==='ore'));}else{assert.equal(second.outcome.code,'NOT_FOUND_OR_FORBIDDEN');assert.equal(Object.values(h.bag().slots).some(s=>s.kind==='stack'&&s.templateRef.id==='ore'),false);}
 assert.ok(h.store.conflicts>=1);
 }
});
test('lease expiration during CP reads rejects with no staged asset writes',async()=>{
 const h=await dropFixture();await h.kill();const q=await collectCommand(h),before=h.bag();let armed=true;
 const store={run:work=>h.store.run(tx=>work({get:async id=>{const v=await tx.get(id);if(armed&&id.startsWith('v2:cpChunk:')){armed=false;h.clock.now=()=>20000;}return v;},set:tx.set}))};
 const svc=new ChallengeService({store,clock:h.clock,identity:h.identity,content:{...h.content,drops:h.drops}}),r=await svc.execute(q);assert.equal(r.outcome.code,'DEADLINE_EXPIRED');assert.deepEqual(h.bag(),before);
});
test('material collection has bounded physical key and byte budgets',async()=>{
 const h=await dropFixture();await h.kill();const q=await collectCommand(h);let observed;
 const store={run:work=>h.store.run(async tx=>{const reads=[],writes=[];const r=await work({get:async id=>{reads.push(id);return tx.get(id);},set:(id,value)=>{writes.push([id,new TextEncoder().encode(JSON.stringify(value)).length]);tx.set(id,value);}});observed={R:new Set(reads).size,W:new Set(writes.map(w=>w[0])).size,gets:reads.length,sets:writes.length,maxWrite:Math.max(...writes.map(w=>w[1]))};return r;})};
 const service=new ChallengeService({store,clock:h.clock,identity:h.identity,content:{...h.content,drops:h.drops}});assert.equal((await service.execute(q)).outcome.status,'committed');assert.deepEqual({...observed,maxWrite:undefined},{R:12,W:5,gets:14,sets:5,maxWrite:undefined});assert.ok(observed.maxWrite<=131072);console.log('ST15-01 actual material collect budget',observed);
});
