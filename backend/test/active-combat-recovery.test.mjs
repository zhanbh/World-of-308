import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterClientFixture} from './fixtures/monster-client-fixture.mjs';
import {CombatRecoveryCoordinator} from '../../client/assets/scripts/net/CombatRecoveryCoordinator.ts';

for(const delay of [100,1900,2000])test('active combat recovery: first fragment after '+delay+'ms',async()=>{
 const h=await monsterClientFixture();
 h.setNow(1113);await h.client.submit('hostile-hit',h.client.state.confirmed.acceptedTick+10);
 h.setNow(1413);h.client.enqueue({kind:'move',x:1000,y:0,tick:h.client.state.confirmed.acceptedTick});h.client.enqueue({kind:'skill',skillId:'cross',tick:h.client.state.confirmed.acceptedTick});await h.client.submit('before-pause',h.client.state.confirmed.acceptedTick+30);
 assert.equal(h.client.state.status,'active',h.client.state.code);
 const before=h.client.state;assert.ok(before.cross.effects.length>0,'released skill tail exists');assert.ok(BigInt(before.player.hp)<BigInt(before.player.maxHp),'authoritative hostile hit exists');
 const transport={send:async text=>{const q=JSON.parse(text);return JSON.stringify(await(q.query?h.service.query(q):h.service.execute(q)));},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 const owner=new CombatRecoveryCoordinator(transport,persistence,h.client,h.loading);
 owner.init(h.context,h.config,0,h.basic);
 const p={characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId},control=(command,seq,extra)=>({...h.auth,command,controlSeq:seq,leaseRevision:seq-1+(typeof leaseOffset==='number'?leaseOffset:0),payload:{...p,...extra}});
 let leaseOffset=0; const status=await h.service.execute(control('scene.status',2,{readyTicketId:null})); leaseOffset=status.leaseRevision-1;
 h.setNow(1500);await owner.suspend(control('scene.suspend',2,{sceneEpoch:before.confirmed.sceneEpoch,timelineEpoch:before.confirmed.timelineEpoch}));
 assert.equal(h.client.state.predictionEnabled,false);assert.equal(owner.state.status,'recovering');
 h.setNow(5000);await owner.prepare(control('scene.resumePrepare',3,{sceneEpoch:before.confirmed.sceneEpoch,timelineEpoch:before.confirmed.timelineEpoch,checkpointRevision:owner.state.data.state.checkpointRevision}));
 const {deadline,...ticket}=owner.state.data.readyTicket;
 await owner.ready(control('scene.ready',4,ticket));
 assert.equal(owner.state.status,'active',owner.state.code);assert.equal(h.client.state.predictionEnabled,true);
 const after=h.client.state;
 assert.equal(after.confirmed.sceneEpoch,before.confirmed.sceneEpoch);assert.equal(after.confirmed.timelineEpoch,before.confirmed.timelineEpoch+1);
 assert.equal(after.confirmed.acceptedTick,before.confirmed.acceptedTick);assert.equal(after.confirmed.acceptedSeq,before.confirmed.acceptedSeq);
 for(const key of ['position','combat','targets','cross','bengshan','badao','earth','monsters','player'])assert.deepEqual(after[key],before[key],key);
 h.client.enqueue({kind:'move',x:1000,y:0,tick:after.confirmed.acceptedTick});h.setNow(5000+delay);await h.client.submit('after-resume',after.confirmed.acceptedTick+10);
 if(delay===2000){assert.equal(h.client.state.code,'RECOVERY_REQUIRED');assert.equal(h.client.state.predictionEnabled,false);return;}
 assert.equal(h.client.state.status,'active',h.client.state.code);assert.equal(h.client.state.confirmed.acceptedSeq,before.confirmed.acceptedSeq+1);
 h.setNow(6000+delay);assert.equal(h.client.state.predictionEnabled,false);
});



test('a lost suspend response can resolve the original before any checkpoint ticket exists',async()=>{
 const h=await monsterClientFixture(),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let lost=true;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(lost&&q.command==='scene.suspend'){lost=false;throw Error('lost committed suspend');}return JSON.stringify(r);},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 let owner=new CombatRecoveryCoordinator(transport,persistence,h.client,h.loading);owner.init(h.context,h.config,0,h.basic);
 await owner.suspend({...h.auth,command:'scene.suspend',controlSeq:2,leaseRevision:1,payload:{characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1}});
 assert.equal(owner.state.status,'unknown');owner=new CombatRecoveryCoordinator(transport,persistence,h.client,h.loading);owner.init(h.context,h.config,0,h.basic);await owner.retry();
 assert.equal(owner.state.status,'recovering');assert.equal(owner.state.predictionEnabled,false);
});

test('late movement proof from an old recovery cannot freeze a newly initialized scene owner',async()=>{
 const h=await monsterClientFixture(),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 let hold=false,release,entered;const waiting=new Promise(r=>entered=r);
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(hold&&q.query==='challenge.get'&&q.requestId==='movement-current'){hold=false;entered();await new Promise(resolve=>release=resolve);}return JSON.stringify(r);},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts');
 const movement=new MovementCoordinator(transport,persistence,{now:()=>1013}),owner=new CombatRecoveryCoordinator(transport,persistence,movement,h.loading);owner.init(h.context,h.config,0,h.basic);
 const p={characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId},c=(command,seq,extra)=>({...h.auth,command,controlSeq:seq,leaseRevision:seq-1,payload:{...p,...extra}});
 await owner.suspend(c('scene.suspend',2,{sceneEpoch:1,timelineEpoch:1}));await owner.prepare(c('scene.resumePrepare',3,{sceneEpoch:1,timelineEpoch:1,checkpointRevision:owner.state.data.state.checkpointRevision}));
 const {deadline,...ticket}=owner.state.data.readyTicket;hold=true;const old=owner.ready(c('scene.ready',4,ticket));await waiting;
 owner.init(h.context,h.config,0,h.basic);await movement.resumeActive(h.context,h.config,0,h.basic);assert.equal(movement.state.predictionEnabled,true);
 release();await old;assert.equal(movement.state.predictionEnabled,true);assert.equal(owner.state.predictionEnabled,false);
});
