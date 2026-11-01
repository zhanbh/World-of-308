import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterClientFixture} from './fixtures/monster-client-fixture.mjs';
import {CombatRecoveryCoordinator} from '../../client/assets/scripts/net/CombatRecoveryCoordinator.ts';
import {CombatLifecycleAdapter} from '../../client/assets/scripts/net/CombatLifecycleAdapter.ts';
import {LootSceneCoordinator} from '../../client/assets/scripts/net/LootSceneCoordinator.ts';
test('Cocos hide/show freezes held input and asset writes until current proof restores combat',async()=>{
 const h=await monsterClientFixture(),saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 let seq=1,lease=1,cleared=0;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command?.startsWith('scene.')&&r.outcome?.status==='committed')lease=r.leaseRevision;return JSON.stringify(r);},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 h.client.enqueue({kind:'basic',pressed:true,tick:h.client.state.confirmed.acceptedTick});h.setNow(1023);await h.client.submit('held-before-hide',h.client.state.confirmed.acceptedTick+1);assert.equal(h.client.state.combat.held,true);lease=2;
 const loot=new LootSceneCoordinator(h.client,transport,store,h.context);await loot.open();
 const recovery=new CombatRecoveryCoordinator(transport,store,h.client,h.loading,[loot.drops,loot.terminal]);recovery.init(h.context,h.config,0,h.basic);await h.client.resumeActive(h.context,h.config,0,h.basic);
 const adapter=new CombatLifecycleAdapter(recovery,h.client,loot,(command,extra)=>({...h.auth,command,controlSeq:++seq,leaseRevision:lease,payload:{characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId,...extra}}),()=>cleared++,()=>{});
 h.setNow(1300);await adapter.hide();assert.ok(cleared>0);assert.equal(adapter.state.message,'正在恢复战斗状态');assert.equal(h.client.state.predictionEnabled,false);await assert.rejects(loot.requestLeave('blocked'),/RECOVERY_IN_PROGRESS/);
 h.setNow(1600);await adapter.show();assert.equal(adapter.state.canAttack,true,JSON.stringify(adapter.state));assert.equal(h.client.state.confirmed.timelineEpoch,2);
 // No new key/touch input: the first resumed fragment must release the recovered held state.
 const recoveredCast=h.client.state.combat.castSequence;
 h.setNow(1610);h.client.predict(h.client.state.confirmed.acceptedTick+1);assert.equal(h.client.state.combat.held,false,'neutralization precedes the first enabled prediction');
 h.setNow(1610);await loot.submit('neutral-after-show',h.client.state.confirmed.acceptedTick+1);assert.equal(h.client.state.combat.held,false);assert.equal(h.client.state.combat.castSequence,recoveredCast);assert.ok(h.client.state.combat.cast,'released cast may finish normally');assert.equal(h.client.state.position.intentX,0);assert.equal(h.client.state.position.intentY,0);
 adapter.destroy();assert.equal(adapter.state.canAttack,false);
});

test('expired recovery prompts existing login and cannot resume the old challenge',async()=>{
 const h=await monsterClientFixture(),saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let seq=1,lease=1,login=0;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(r.leaseRevision!==undefined)lease=r.leaseRevision;return JSON.stringify(r);},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const loot=new LootSceneCoordinator(h.client,transport,store,h.context);await loot.open();const owner=new CombatRecoveryCoordinator(transport,store,h.client,h.loading,[loot.drops,loot.terminal]);owner.init(h.context,h.config,0,h.basic);await h.client.resumeActive(h.context,h.config,0,h.basic);
 const adapter=new CombatLifecycleAdapter(owner,h.client,loot,(command,extra)=>({...h.auth,command,controlSeq:++seq,leaseRevision:lease,payload:{characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId,...extra}}),()=>{},()=>login++);
 await adapter.pause();h.setNow(11013);await adapter.show();assert.equal(adapter.state.message,'网络中断，请重新进入游戏');assert.equal(adapter.state.canAttack,false);adapter.reenter();assert.equal(login,1);assert.equal(adapter.state.phase,'destroyed');
});

test('destroy and new attach retire an old delayed recovery callback',async()=>{
 const h=await monsterClientFixture(),saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let seq=1,lease=1,hold=false,release,entered;const waiting=new Promise(r=>entered=r);
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(r.leaseRevision!==undefined)lease=r.leaseRevision;if(hold&&q.command==='scene.resumePrepare'){hold=false;entered();await new Promise(r=>release=r);}return JSON.stringify(r);},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const loot=new LootSceneCoordinator(h.client,transport,store,h.context);await loot.open();const owner=new CombatRecoveryCoordinator(transport,store,h.client,h.loading,[loot.drops,loot.terminal]);owner.init(h.context,h.config,0,h.basic);await h.client.resumeActive(h.context,h.config,0,h.basic);
 const command=(command,extra)=>({...h.auth,command,controlSeq:++seq,leaseRevision:lease,payload:{characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId,...extra}});
 const adapter=new CombatLifecycleAdapter(owner,h.client,loot,command,()=>{},()=>{});await adapter.hide();hold=true;const old=adapter.show();await waiting;adapter.destroy();
 const nextLoot=new LootSceneCoordinator(h.client,transport,store,h.context),nextOwner=new CombatRecoveryCoordinator(transport,store,h.client,h.loading,[nextLoot.drops,nextLoot.terminal]);nextOwner.init(h.context,h.config,0,h.basic);await nextLoot.open();
 const next=new CombatLifecycleAdapter(nextOwner,h.client,nextLoot,command,()=>{},()=>{});await next.retry();assert.equal(next.state.canAttack,true,JSON.stringify(next.state));
 release();await old;assert.equal(adapter.state.phase,'destroyed');assert.equal(next.state.canAttack,true);assert.equal(h.client.state.predictionEnabled,true);await assert.rejects(loot.requestLeave('after-destroy'),/RECOVERY_IN_PROGRESS/);
});

import {tailFixture} from './fixtures/death-tail-fixture.mjs';
import {terminalFixture} from './fixtures/terminal-fixture.mjs';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import {MovementCoordinator} from '../../client/assets/scripts/net/MovementCoordinator.ts';
async function attachFixture(h,loseCommand=null){
 const saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)},ch=h.store.inspect(h.challengeId);let seq=ch.controlSeq,lease=ch.lease.revision,now=2000;
 h.clock.now=()=>now;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(r.leaseRevision!==undefined)lease=r.leaseRevision;if(q.command===loseCommand){loseCommand=null;throw Error('lost original response');}return JSON.stringify(r);},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId};
 const loading=new LoadingCoordinator(transport,store,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);
 const movement=new MovementCoordinator(transport,store,{now:()=>now}),{attackPowerByLevel,...rest}=h.profile.attributes;
 const basic={profile:h.profile,cross:{level:20,controlled:false},stats:{attackPower:attackPowerByLevel[0],...rest,x:0,y:0,facing:1},targetRules:Object.fromEntries((await h.cp()).scene.enemies.map(e=>[e.actor.actorId,{mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false,controlImmune:false}]))};
 const loot=new LootSceneCoordinator(movement,transport,store,context),owner=new CombatRecoveryCoordinator(transport,store,movement,loading,[loot.drops,loot.terminal]);owner.init(context,h.config,6,basic);await movement.resumeActive(context,h.config,6,basic);await loot.open();
 const adapter=new CombatLifecycleAdapter(owner,movement,loot,(command,extra)=>({...h.auth,command,controlSeq:++seq,leaseRevision:lease,payload:{characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId,...extra}}),()=>{},()=>{});
 return {adapter,movement,loot,setNow:value=>{now=value;}};
}
test('lifecycle recovery leaves the dead unable to attack and permits only existing empty tail',async()=>{
 const h=await tailFixture();await h.service.execute(await h.command([{kind:'skill',skillId:'cross'}],15,'lifecycle-dead'));
 const before=h.store.inspect(h.challengeId),{adapter,movement,setNow}=await attachFixture(h);await adapter.hide();setNow(5000);await adapter.show();
 assert.equal(adapter.state.canAttack,false);assert.equal(adapter.state.canMove,false);assert.equal(adapter.state.canAdvanceDeathTail,true);assert.equal(movement.state.confirmed.lifeState,'dead');assert.equal(h.store.inspect(h.challengeId).deathDeadline,before.deathDeadline);assert.throws(()=>movement.enqueue({kind:'move',x:1000,y:0,tick:15}),/DEAD/);
});
test('lifecycle recovery retains completed receipt, movement and actual pickup',async()=>{
 const h=await terminalFixture({enemyCount:2});await h.service.execute(await h.command('lifecycle-boss'));const receipt=h.store.inspect(h.challengeId).clearReceipt;
 const {adapter,movement,loot,setNow}=await attachFixture(h);await adapter.hide();setNow(5000);await adapter.show();
 assert.equal(adapter.state.canMove,true);assert.equal(adapter.state.canAttack,false);assert.deepEqual(loot.terminal.state.receipt,{...receipt,sceneState:'looting'});
 const drop=loot.drops.state.view.data.drops.find(d=>d.x===1);await loot.requestCollect('lifecycle-pickup',drop.dropId);assert.ok(loot.drops.state.view.data.drops.some(d=>d.dropId===drop.dropId&&d.collected));assert.equal(movement.state.confirmed.result,'completed');
});

test('lifecycle retries a lost committed ready through original proof without a second timeline',async()=>{
 const h=await terminalFixture({enemyCount:2});await h.service.execute(await h.command('lifecycle-lost-ready'));const {adapter,movement,setNow}=await attachFixture(h,'scene.ready');
 await adapter.hide();setNow(5000);await adapter.show();assert.equal(adapter.state.phase,'recovering');assert.equal(adapter.state.canMove,false);await adapter.retry();assert.equal(adapter.state.canMove,true,JSON.stringify(adapter.state));assert.equal(movement.state.confirmed.timelineEpoch,2);
});

import {connectChallengePreview} from '../../client/assets/scripts/net/ChallengePreview.ts';
import {createLootChallengePreview,createChallengePreview} from '../../client/tools/challenge-preview-server.mjs';
for(const create of [createLootChallengePreview,createChallengePreview])test('explicit isolated '+create.name+' binds lifecycle and strict control DTO over fetch transport',async()=>{
 const service=await create(),saved=new Map(),oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 globalThis.window={location:{hostname:'localhost'},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}};
 globalThis.fetch=async(url,options)=>{const q=JSON.parse(options.body),path=new URL(url).pathname,result=path==='/bootstrap'?service.bootstrap:path==='/original-control'?await service.originalControl(q):await service.rpc(q);return new Response(JSON.stringify(result));};
 try{const preview=await connectChallengePreview(),adapter=preview.lifecycle(()=>{},()=>{});await adapter.resume();assert.equal(adapter.state.canAttack,true,JSON.stringify(adapter.state));await adapter.hide();await adapter.show();assert.equal(adapter.state.canMove,true,JSON.stringify(adapter.state));adapter.destroy();}
 finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});

test('paused recovery UI stops after ten local seconds without renewing the window',async()=>{
 const h=await terminalFixture({enemyCount:2});const {adapter}=await attachFixture(h);await adapter.hide();
 // Deterministic external wall clock; the timer only controls UI, never settles server assets.
 const oldNow=Date.now;let now=oldNow();Date.now=()=>now;
 try{now+=10000;assert.equal(adapter.state.message,'网络中断，请重新进入游戏');await adapter.retry();assert.equal(adapter.state.phase,'terminal');}
 finally{Date.now=oldNow;}
});
