import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterFixture} from './fixtures/monster-fixture.mjs';
import {terminalFixture} from './fixtures/terminal-fixture.mjs';
import {maximumWarriorCheckpoint} from './fixtures/compact-checkpoint-fixture.mjs';
import {attachRecovery,recoveryMeter,bytes} from './fixtures/joint-recovery-fixture.mjs';
import {readCheckpoint} from '../src/challenge/room-checkpoint.ts';
import {verifyRecoveryPages} from '../../shared/src/public-state-proof.ts';

const historicalResults=h=>new Map([...h.store.snapshot()].filter(([,v])=>v?.packed||v?.actionResultsRef&&v?.command==='simulation.submit'));
test('joint lifecycle: real AI hit, cross and unknown potion consume survive complete recovery exactly once',async()=>{
 const h=await monsterFixture();await h.grow();
 await h.store.run(async tx=>tx.set(h.characterId,{...await tx.get(h.characterId),quickSlots:['item:hp-potion-small-v1',null,null]}));
 await h.seed({0:{kind:'stack',stackId:'joint-hp',templateRef:{id:'item:hp-potion-small-v1',version:1},quantity:3,binding:{kind:'character',characterId:h.characterId},traceRef:'joint-hp-source'}},'backpack');
 h.clock.now=()=>1113;assert.equal((await h.service.execute(await h.command([],10,'joint-hostile-hit'))).outcome.status,'committed');
 const hit=await h.cp();assert.ok(BigInt(hit.role.player.hp)<BigInt(hit.role.player.maxHp),'HP damage comes from real AI, not seeded HP');
 const a=await attachRecovery(h);a.setNow(1413);a.movement.enqueue({kind:'item',templateId:'item:hp-potion-small-v1',quickSlotIndex:0,tick:a.movement.state.confirmed.acceptedTick});a.movement.enqueue({kind:'skill',skillId:'cross',tick:a.movement.state.confirmed.acceptedTick});a.lose('simulation.submit');await a.loot.submit('joint-unknown-potion-cross',a.movement.state.confirmed.acceptedTick+30);
 assert.equal(a.movement.state.status,'unknown');assert.equal(h.bag().slots[0].quantity,2);
 const before=await h.cp(),history=historicalResults(h);assert.ok(before.role.cooldowns.find(c=>c.cooldownId==='hpPotion').readyAtTick>40);assert.ok(before.scene.cross.effects.length>0);assert.ok(before.scene.monsters.length>0);
 a.setNow(1500);await a.adapter.hide();assert.equal(a.movement.hasPending,false);assert.equal(a.adapter.state.canAttack,false);a.setNow(5000);await a.adapter.show();assert.equal(a.adapter.state.canAttack,true,JSON.stringify(a.adapter.state));
 const after=await h.cp();assert.deepEqual(after.role,before.role);assert.deepEqual(after.scene,before.scene);assert.deepEqual(historicalResults(h),history);assert.equal(h.bag().slots[0].quantity,2);assert.equal(a.calls.filter(c=>c.kind==='simulation.submit').length,1);assert.equal(a.calls.filter(c=>c.kind==='operation.get').length,1);assert.equal(a.movement.state.confirmed.acceptedTick,before.header.state.acceptedTick);assert.equal(a.movement.state.confirmed.timelineEpoch,2);
 a.setNow(5010);await a.loot.submit('joint-neutral-after-potion',a.movement.state.confirmed.acceptedTick+1);assert.equal(h.bag().slots[0].quantity,2);
});

test('joint lifecycle: unknown real ground collect and terminal leave retain one fixed reward and consumer',async()=>{
 const h=await terminalFixture({enemyCount:2});assert.equal((await h.service.execute(await h.command('joint-boss'))).outcome.status,'committed');const before=h.store.inspect(h.challengeId),a=await attachRecovery(h),drop=a.loot.drops.state.view.data.drops.find(d=>d.x===1);
 a.lose('drop.collect');await a.loot.requestCollect('joint-lost-collect',drop.dropId);assert.equal(a.loot.drops.state.status,'unknown');const bag=h.bag(),history=historicalResults(h);
 await a.adapter.hide();a.setNow(5000);await a.adapter.show();assert.equal(a.adapter.state.canMove,true,JSON.stringify(a.adapter.state));assert.equal(a.loot.drops.hasPending,false);assert.deepEqual(h.bag(),bag);assert.equal(a.loot.drops.state.view.data.drops.find(d=>d.dropId===drop.dropId).collected,true);assert.deepEqual(h.store.inspect(h.challengeId).clearReceipt,before.clearReceipt);assert.deepEqual(historicalResults(h),history);
 a.lose('challenge.leave');await a.loot.requestLeave('joint-lost-leave');assert.equal(a.loot.terminal.state.status,'unknown');await a.adapter.hide();assert.equal(a.loot.terminal.hasPending,false);assert.equal(a.loot.terminal.state.fadeReady,true);a.loot.sync();assert.equal(a.adapter.state.canMove,false);assert.deepEqual(h.bag(),bag);assert.equal(h.store.inspect(h.challengeId).result,'completed');assert.equal(h.store.inspect(h.challengeId).sceneState,'closed');assert.equal(a.calls.filter(c=>c.kind==='drop.collect').length,1);assert.equal(a.calls.filter(c=>c.kind==='challenge.leave').length,1);a.loot.close();assert.equal(a.loot.terminal.state.fadeReady,false,'explicit scene close retires the old fade');
});

async function controlStage(capacity,stage){
 const h=await monsterFixture();await h.grow();h.clock.now=()=>1413;assert.equal((await h.service.execute(await h.command([{kind:'skill',skillId:'cross'}],40,'budget-cross'))).outcome.status,'committed');
 if(capacity)await maximumWarriorCheckpoint(h);h.clock.now=()=>1500;
 const {service,attempts}=recoveryMeter(h);const ch=h.store.inspect(h.challengeId),payload={characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId};
 let q={...h.auth,command:'scene.suspend',controlSeq:ch.controlSeq+1,leaseRevision:ch.lease.revision,payload:{...payload,sceneEpoch:ch.sceneEpoch,timelineEpoch:ch.timelineEpoch}};
 if(stage!=='suspend'){const s=await service.execute(q);assert.equal(s.outcome.status,'committed');q={...h.auth,command:'scene.resumePrepare',controlSeq:q.controlSeq+1,leaseRevision:s.leaseRevision,payload:{...payload,sceneEpoch:ch.sceneEpoch,timelineEpoch:ch.timelineEpoch,checkpointRevision:s.outcome.data.state.checkpointRevision}};
  if(stage==='ready'){const p=await service.execute(q);assert.equal(p.outcome.status,'committed');const {deadline,...ticket}=p.outcome.data.readyTicket;q={...h.auth,command:'scene.ready',controlSeq:q.controlSeq+1,leaseRevision:p.leaseRevision,payload:{...payload,...ticket}};}}
 attempts.length=0;return {h,service,attempts,q};
}
for(const capacity of [false,true])test('joint recovery '+(capacity?'synthetic 8-block capacity':'natural small CP')+': every actual control write rolls back; public budgets and immutable history',async()=>{
 const metrics=[];
 for(const stage of ['suspend','prepare','ready']){
  const {h,service,attempts,q}=await controlStage(capacity,stage),history=historicalResults(h),r=await service.execute(q);assert.equal(r.outcome.status,'committed',JSON.stringify(r));assert.deepEqual(historicalResults(h),history);
  const writeAttempts=attempts.filter(a=>a.setCalls);assert.equal(writeAttempts.length,1);const measured=writeAttempts[0];assert.ok(measured.W<=5);assert.ok(measured.writeKeys.every(key=>!key.startsWith('v2:cpChunk:')&&!key.startsWith('v2:combatResults:')),'recovery does not rewrite CP chunks or historical result packages');assert.ok(measured.calls<=80);assert.ok(measured.bytes<=1572864);assert.ok(bytes(r)<=32768);
  for(let point=1;point<=measured.setCalls;point++){
   const f=await controlStage(capacity,stage),snapshot=f.h.store.snapshot();f.h.store.injectWriteFailure(point);const rejected=await f.service.execute(f.q);assert.equal(rejected.outcome.code,'SERVICE_UNAVAILABLE',`${stage}/${point}`);assert.deepEqual(f.h.store.snapshot(),snapshot,`${stage}/${point} all records rollback`);
  }
  const cp=await h.store.run(tx=>readCheckpoint(tx,h.store.inspect(h.challengeId))),state=h.store.inspect(h.challengeId);assert.equal(cp.header.activeChunks.length,capacity?8:2);assert.ok(bytes(state)<=131072);assert.ok(bytes(cp.header)<=16384);
  const pages=[];let ticket=r.outcome.data.readyTicket;
  if(stage==='prepare'){
   for(let pageIndex=0;pageIndex<(pages[0]?.totalPages??1);pageIndex++){const page=await service.query({...h.auth,query:'scene.recoveryPage',requestId:'joint-page-'+pageIndex,payload:{characterId:h.characterId,rolePlayEpoch:state.rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(ticket).filter(([k])=>k!=='deadline')),pageIndex}});assert.ok(bytes(page)<=32768);pages.push(page);}
   await verifyRecoveryPages(pages);assert.ok(pages.length<=256);assert.equal(pages.length,pages[0].totalPages);
  }
  const chunks=[...h.store.snapshot()].filter(([key,v])=>key.startsWith('v2:cpChunk:')&&v.challengeId===h.challengeId).map(([,v])=>v);assert.equal(chunks.length,capacity?8:2);assert.ok(chunks.every(c=>bytes(c)<=81920));assert.ok(chunks.reduce((n,c)=>n+bytes(c),0)<=655360);
  metrics.push({stage,...measured,CPBytes:chunks.reduce((n,c)=>n+bytes(c),0),maxCPChunk:Math.max(...chunks.map(bytes)),H:bytes(state),CPHeader:bytes(cp.header),CPChunks:cp.chunks?.length??cp.header.activeChunks.length,readyTicket:ticket?bytes(ticket):0,recoveryPages:pages.length,publicBytes:pages.reduce((n,p)=>n+bytes(p),0),maxPublicPage:Math.max(0,...pages.map(bytes)),response:bytes(r)});
 }
 const complete=await controlStage(capacity,'suspend'),a=await attachRecovery(complete.h,{service:complete.service});a.calls.length=0;const originalHistory=historicalResults(complete.h);await a.adapter.hide();a.setNow(5000);await a.adapter.show();assert.equal(a.adapter.state.canAttack,true,JSON.stringify(a.adapter.state));assert.deepEqual(historicalResults(complete.h),originalHistory);const pageCalls=a.calls.filter(c=>['scene.recoveryPage','simulation.confirmed'].includes(c.kind));assert.ok(pageCalls.length<=3*256);assert.ok(pageCalls.every(c=>c.responseBytes<=32768));assert.ok(a.movement.state.queued<=2);console.log('ST16-05 client '+(capacity?'synthetic-capacity-not-natural':'natural-small'),JSON.stringify({transportCalls:a.calls.length,queries:Object.fromEntries([...new Set(a.calls.map(c=>c.kind))].map(kind=>[kind,a.calls.filter(c=>c.kind===kind).length])),publicPageCalls:pageCalls.length,publicBytes:pageCalls.reduce((n,c)=>n+c.responseBytes,0),neutralQueued:a.movement.state.queued,pending:a.movement.hasPending}));
 console.log('ST16-05 measured '+(capacity?'synthetic-capacity-not-natural':'natural-small'),JSON.stringify(metrics));
});
