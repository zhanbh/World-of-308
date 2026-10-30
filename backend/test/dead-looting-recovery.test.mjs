import test from 'node:test';
import assert from 'node:assert/strict';
import {tailFixture} from './fixtures/death-tail-fixture.mjs';
import {terminalFixture} from './fixtures/terminal-fixture.mjs';
import {CombatRecoveryCoordinator} from '../../client/assets/scripts/net/CombatRecoveryCoordinator.ts';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import {DropCoordinator} from '../../client/assets/scripts/net/DropCoordinator.ts';
import {MovementCoordinator} from '../../client/assets/scripts/net/MovementCoordinator.ts';

async function recover(h,now=2000){
 const saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 const transport={send:async text=>{const q=JSON.parse(text);return JSON.stringify(await(q.query?h.service.query(q):h.service.execute(q)));},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const ch=h.store.inspect(h.challengeId),context={...h.auth,characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);assert.equal(loading.state.status,'loaded',loading.state.code);
 const movement=new MovementCoordinator(transport,persistence,{now:()=>now});
 const rates=h.profile.attributes,{attackPowerByLevel,...rest}=rates;
 const basic={profile:h.profile,cross:{level:20,controlled:false},stats:{attackPower:attackPowerByLevel[0],...rest,x:0,y:0,facing:1},targetRules:Object.fromEntries((await h.cp()).scene.enemies.map(e=>[e.actor.actorId,{mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false,controlImmune:false}]))};
 const owner=new CombatRecoveryCoordinator(transport,persistence,movement,loading);owner.init(context,h.config,6,basic);
 const p={characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId};let seq=ch.controlSeq,lease=ch.lease.revision;
 const command=(command,payload)=>({...h.auth,command,controlSeq:++seq,leaseRevision:lease++,payload:{...p,...payload}});
 h.clock.now=()=>now;
 await owner.suspend(command('scene.suspend',{sceneEpoch:ch.sceneEpoch,timelineEpoch:ch.timelineEpoch}));assert.equal(owner.state.status,'recovering');
 now+=3000;await owner.prepare(command('scene.resumePrepare',{sceneEpoch:ch.sceneEpoch,timelineEpoch:ch.timelineEpoch,checkpointRevision:owner.state.data.state.checkpointRevision}));
 const {deadline,...ticket}=owner.state.data.readyTicket;await owner.ready(command('scene.ready',ticket));
 assert.equal(movement.state.status,'active',movement.state.code);assert.equal(owner.state.status,'active',owner.state.code);
 return {owner,movement,transport,persistence,setNow:value=>{now=value;h.clock.now=()=>now;}};
}
test('confirmed death restores complete proof without reviving or extending the deadline',async()=>{
 const h=await tailFixture();assert.equal((await h.service.execute(await h.command([{kind:'skill',skillId:'cross'}],15,'recovery-death'))).outcome.status,'committed');
 const before=h.store.inspect(h.challengeId),cp=await h.cp();assert.equal(before.lifeState,'dead');
 const {owner,movement}=await recover(h);
 const after=h.store.inspect(h.challengeId);for(const k of ['lifeState','deathIndex','deathDeadline','staminaSnapshot','staminaSettlement','sceneEpoch'])assert.deepEqual(after[k],before[k],k);
 assert.deepEqual((await h.cp()).role,cp.role);assert.deepEqual((await h.cp()).scene,cp.scene);assert.ok(owner.state.publicRecords.length);assert.equal(movement.hasReleasedDeathTail,true);assert.equal(owner.state.canMove,false);assert.equal(owner.state.canAttack,false);assert.equal(owner.state.canAdvanceDeathTail,true);
 assert.throws(()=>movement.enqueue({kind:'move',x:1000,y:0,tick:movement.state.confirmed.acceptedTick}),/DEAD/);
 h.clock.now=()=>5010;await movement.submit('recovered-tail',movement.state.confirmed.acceptedTick+1);assert.equal(movement.state.status,'active',movement.state.code);
 h.clock.now=()=>before.deathDeadline;await h.query();assert.equal(h.store.inspect(h.challengeId).result,'failed');assert.equal(h.store.inspect(h.challengeId).sceneState,'closed');
});
test('real Boss completion restores looting and the fixed receipt; lease expiry preserves success',async()=>{
 const h=await terminalFixture({enemyCount:2});assert.equal((await h.service.execute(await h.command('recovery-boss-kill'))).outcome.status,'committed');
 const before=h.store.inspect(h.challengeId);assert.equal(before.result,'completed');const snapshot=h.store.inspect(h.characterId);
 const {owner,movement,transport,persistence,setNow}=await recover(h);const after=h.store.inspect(h.challengeId);
 for(const k of ['clearReceipt','staminaSnapshot','staminaSettlement','sceneEpoch','confirmedKills'])assert.deepEqual(after[k],before[k],k);
 assert.deepEqual(owner.state.clearReceipt,{...before.clearReceipt,sceneState:'looting'});assert.equal(owner.state.canMove,true);assert.equal(owner.state.canAttack,false);assert.deepEqual(h.store.inspect(h.characterId),snapshot);assert.equal(movement.state.confirmed.result,'completed');
 const drops=new DropCoordinator(transport,persistence);await drops.open({...h.auth,challengeId:h.challengeId,sceneEpoch:after.sceneEpoch});assert.equal(drops.state.status,'ready');const ground=drops.state.view.data;assert.ok(ground.drops.length);
 setNow(7200);await movement.refreshConfirmed();assert.equal(movement.state.status,'active',movement.state.code);movement.enqueue({kind:'move',x:1000,y:0,tick:movement.state.confirmed.acceptedTick});await movement.submit('looting-after-gap',movement.state.confirmed.acceptedTick+1);assert.equal(movement.state.status,'active',movement.state.code);
 await drops.refresh();assert.equal(drops.state.view.data.roomToken,ground.roomToken);assert.deepEqual(drops.state.view.data.drops.map(d=>d.dropId),ground.drops.map(d=>d.dropId));await drops.collect('recover-pickup',ground.drops.find(d=>d.x===1).dropId);assert.equal(drops.state.code,null);assert.ok(drops.state.view.data.drops.some(d=>d.collected));const bag=h.store.inspect(h.character().backpackId);
 h.clock.now=()=>h.store.inspect(h.challengeId).lease.leaseUntil;await h.query();assert.equal(h.store.inspect(h.challengeId).result,'completed');assert.equal(h.store.inspect(h.challengeId).sceneState,'closed');
 assert.deepEqual(h.store.inspect(h.challengeId).clearReceipt,before.clearReceipt);assert.deepEqual(h.store.inspect(h.character().backpackId),bag);
});
