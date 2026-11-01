import test from 'node:test';
import assert from 'node:assert/strict';
import {crossFixture} from './fixtures/cross-fixture.mjs';
import {dropFixture} from './fixtures/drop-fixture.mjs';
import {bossClearFixture} from './fixtures/boss-clear-fixture.mjs';
import {readCheckpoint,writeChunk,stateHash} from '../src/challenge/room-checkpoint.ts';
import {ChallengeService} from '../src/challenge/challenge-service.ts';
import {manifestDigest} from '../../shared/src/room-manifest.ts';
import {WEARABLE_SLOTS,NON_WEARABLE_SLOTS} from '../src/equipment/equipment-rules.ts';

const wear={profile:'local-test-wear',authorization:'isolated-local-assets-only',ref:'wear-test-v1',roomWear:1,deathWear:5};
async function fixture({explicit=true,rewards=false,hostile=false,ordinary=true,current=1,skills=false}={}){
 const h=ordinary?(skills?await crossFixture({},{walkSpeed:1000000,runSpeed:1000000,ySpeed:1000000}):await dropFixture()):await bossClearFixture({rewards,hostile,enemyCount:2});
 if(ordinary){h.cp=()=>h.store.run(async tx=>readCheckpoint(tx,await tx.get(h.challengeId)));h.clock.now=()=>1513;h.content.exitInteraction={profile:'local-test',rulesRef:h.content.releaseRef,radius:300000};if(rewards)h.content.rewards={profile:'local-test-kill-rewards',authorization:'isolated-local-assets-only',ref:'wear-kill-test',goldPerKill:'10',xpPerKill:5,roomWear:1};}
 const content={...h.content,...explicit?{wear}:{}};
 await h.store.run(async tx=>{
  const ch=await tx.get(h.challengeId),cp=await readCheckpoint(tx,ch),c=await tx.get(h.characterId),w=await tx.get(c.equipped.weapon);
  if(ordinary){ch.currentRoomNo=0;cp.header.roomNo=0;cp.scene.enemies.forEach((e,i)=>{e.actor.hp=e.actor.maxHp='1';e.actor.x=1+i;e.actor.y=0;Object.assign(cp.scene.combat.targets[i],{hp:'1',maxHp:'1',x:1+i,y:0});});}
  if(explicit)ch.wearConfigHash=await manifestDigest(wear);
  for(const slot of [...WEARABLE_SLOTS,...NON_WEARABLE_SLOTS]){const id=slot==='weapon'?w.id:'wear-item-'+slot;c.equipped[slot]=id;tx.set(id,{...w,id,slotKind:slot,location:{kind:'equipped',characterId:c.id,slotId:slot},rolledAffixes:[{stat:'attackPower',value:10}],durability:WEARABLE_SLOTS.includes(slot)?{...w.durability,current,max:100}:{wearEnabled:false,current:null,max:null,policyRef:'none'}});}
  c.score=13579;c.scoreReachedAt=900;c.scoreConfigRef='score-test-v1';tx.set(c.id,c);
  const refs=[];for(const [i,data]of [[0,cp.role],[1,cp.scene]]){const chunk=await writeChunk(ch,i,cp.header.activeChunks[i].chunkRevision+1,data);tx.set(chunk.id,chunk);refs.push({...cp.header.activeChunks[i],chunkRevision:chunk.chunkRevision,hash:chunk.hash});}
  tx.set(cp.header.id,{...cp.header,activeChunks:[...refs,...cp.header.activeChunks.slice(2)],state:{...cp.header.state,publicStateHash:await stateHash(cp.role,cp.scene)}});tx.set(ch.id,ch);
 });
 const service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content});
 async function command(id='clear',inputs=[{kind:'basic',pressed:true}],ticks=50){const cp=await h.cp(),q=ordinary?await h.command(inputs,ticks,id):await h.command(id);Object.assign(q.payload,{roomNo:ordinary?0:6,firstSeq:cp.header.state.acceptedSeq+1,lastSeq:cp.header.state.acceptedSeq+inputs.length,fromTick:cp.header.state.acceptedTick,toTick:cp.header.state.acceptedTick+ticks,inputs:inputs.map((x,i)=>({...x,seq:cp.header.state.acceptedSeq+i+1,tick:cp.header.state.acceptedTick}))});q.payload.digest=await manifestDigest({payload:Object.fromEntries(Object.entries(q.payload).filter(([k])=>k!=='digest')),config:h.config,combat:h.profile});return q;}
 return {...h,content,service,command};
}

test('ordinary room clear atomically wears seven slots without enabling kill rewards; replay and another empty fragment do not wear twice',async()=>{
 const h=await fixture(),before=h.character(),wallet=h.store.inspect(h.account().walletId),q=await h.command();
 const r=await h.service.execute(q);assert.equal(r.outcome.status,'committed',JSON.stringify(r));assert.equal(h.store.inspect(h.challengeId).roomPhase,'cleared');
 for(const slot of WEARABLE_SLOTS)assert.equal(h.store.inspect(h.character().equipped[slot]).durability.current,0,slot);
 for(const slot of NON_WEARABLE_SLOTS)assert.equal(h.store.inspect(h.character().equipped[slot]).durability.current,null,slot);
 assert.deepEqual(h.store.inspect(h.account().walletId),wallet);assert.equal(h.character().xp,before.xp);assert.equal(h.character().equipmentVersion,before.equipmentVersion);assert.equal(h.character().score,before.score);assert.equal(h.character().scoreReachedAt,before.scoreReachedAt);
 const cp=await h.cp();assert.equal(cp.role.attackPower,'1000060');assert.equal(cp.role.combat.attributesRevision,h.character().statsVersion);assert.equal(h.character().statsVersion,before.statsVersion+1);assert.equal(cp.header.state.result,'active');
 const snapshot=h.store.snapshot();assert.equal((await h.service.execute(q)).replayed,true);assert.deepEqual(h.store.snapshot(),snapshot);
 h.clock.now=()=>1523;const again=await h.command('after-clear',[],1);assert.equal((await h.service.execute(again)).outcome.status,'committed');for(const slot of WEARABLE_SLOTS)assert.equal(h.store.inspect(h.character().equipped[slot]).version,snapshot.get(h.character().equipped[slot]).version);
});

test('death without gold/XP rewards wears once, preserves deadline, and clamps all seven slots at zero',async()=>{
 const h=await fixture({hostile:true,ordinary:false,current:3}),q=await h.command('death',[],15),before=h.character(),wallet=h.store.inspect(h.account().walletId);
 const r=await h.service.execute(q);assert.equal(r.outcome.status,'committed',JSON.stringify(r));const ch=h.store.inspect(h.challengeId);assert.equal(ch.lifeState,'dead');assert.equal(ch.deathIndex,1);assert.equal(ch.result,'active');
 for(const slot of WEARABLE_SLOTS)assert.equal(h.store.inspect(h.character().equipped[slot]).durability.current,0);
 assert.deepEqual(h.store.inspect(h.account().walletId),wallet);assert.equal(h.character().xp,before.xp);assert.equal(h.character().statsVersion,before.statsVersion+1);assert.equal(h.character().equipmentVersion,before.equipmentVersion);
 const cp=await h.cp();assert.equal(cp.role.player.hp,'0');assert.equal(cp.role.player.lifeState,'dead');assert.equal(cp.role.combat.attributesRevision,h.character().statsVersion);assert.equal(cp.header.state.deathDeadline,ch.deathDeadline);
 const snapshot=h.store.snapshot();assert.equal((await h.service.execute(q)).replayed,true);assert.deepEqual(h.store.snapshot(),snapshot);
 const report=await h.command('another-death',[],1);assert.equal((await h.service.execute(report)).outcome.code,'ROOM_NOT_AVAILABLE');assert.equal(h.store.inspect(h.challengeId).deathDeadline,ch.deathDeadline);for(const slot of WEARABLE_SLOTS)assert.equal(h.store.inspect(h.character().equipped[slot]).version,snapshot.get(h.character().equipped[slot]).version);
});

test('unconfigured no-rewards training stays isolated and invalid/mid-challenge wear configuration is refused atomically',async()=>{
 const training=await fixture({explicit:false}),q=await training.command();assert.equal((await training.service.execute(q)).outcome.status,'committed');assert.equal(training.store.inspect(training.character().equipped.weapon).durability.current,1);
 for(const patch of [{wear:{...wear,roomWear:2}},{wear:{...wear,authorization:'published'}},{wear:{...wear,ref:'changed-ref'}},{wear:undefined}]){
  const h=await fixture(),service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:{...h.content,...patch}}),command=await h.command(),before=h.store.snapshot();assert.equal((await service.execute(command)).outcome.code,'CONFIG_NOT_READY');assert.deepEqual(h.store.snapshot(),before);
 }
 const h=await fixture({explicit:false}),command=await h.command(),service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:{...h.content,wear}}),before=h.store.snapshot();assert.equal((await service.execute(command)).outcome.code,'CONFIG_NOT_READY');assert.deepEqual(h.store.snapshot(),before);
 for(const roomWear of [0,2]){const h=await fixture({explicit:false,rewards:true});h.content.rewards.roomWear=roomWear;const q=await h.command(),before=h.store.snapshot(),service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:h.content});assert.equal((await service.execute(q)).outcome.code,'CONFIG_NOT_READY');assert.deepEqual(h.store.snapshot(),before);}
});

async function movementClient(h,{bundle=false}={}){
 const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts');const saved=new Map(),transport={send:async text=>{const q=JSON.parse(text);return JSON.stringify(await(q.query?h.service.query(q):h.service.execute(q)));}},identity={...h.auth,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId};
 const cp=await h.cp(),{attackPowerByLevel,...rates}=h.profile.attributes,basic={profile:h.profile,...h.profile.cross?{cross:{level:h.character().level,controlled:false}}:{},stats:{...rates,attackPower:attackPowerByLevel[h.character().level-1],x:0,y:0,facing:1},targetRules:Object.fromEntries(cp.scene.combat.targets.map(t=>[t.actorId,{mitigation:t.mitigation,evasion:t.evasion,damageImmune:t.damageImmune,controlImmune:t.controlImmune}]))};
 const persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};const move=new MovementCoordinator(transport,persistence,{now:()=>h.clock.now()});await move.resumeActive(identity,h.config,h.store.inspect(h.challengeId).currentRoomNo,basic);assert.equal(move.state.status,'active',move.state.code);return bundle?{move,transport,persistence,identity,basic}:move;
}

async function clearAndContinue({recover=false}={}){
 const h=await fixture({skills:true}),assembly=await movementClient(h,{bundle:true}),{move,transport,persistence,identity,basic}=assembly,before=await h.cp();move.enqueue({seq:0,tick:move.state.confirmed.acceptedTick,kind:'basic',pressed:true});await move.submit('client-clear',move.state.confirmed.acceptedTick+50);assert.equal(move.state.status,'active',move.state.code);assert.equal(move.state.confirmed.roomPhase,'cleared');assert.equal(h.store.inspect(h.character().equipped.weapon).durability.current,0);assert.equal((await h.cp()).role.player.hp,before.role.player.hp);assert.equal((await h.cp()).role.player.maxHp,before.role.player.maxHp);
 let resumeAt=1513;
 if(recover){
  const {LoadingCoordinator}=await import('../../client/assets/scripts/net/LoadingCoordinator.ts'),{CombatRecoveryCoordinator}=await import('../../client/assets/scripts/net/CombatRecoveryCoordinator.ts');
  transport.queryOriginalControl=async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)));
  const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);assert.equal(loading.state.status,'loaded',loading.state.code);
  const owner=new CombatRecoveryCoordinator(transport,persistence,move,loading);owner.init(identity,h.config,0,basic);
  const c=(command,payload)=>{const ch=h.store.inspect(h.challengeId);return {...h.auth,command,controlSeq:ch.controlSeq+1,leaseRevision:ch.lease.revision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...payload}};};
  const cleared=await h.cp(),versions=Object.fromEntries(WEARABLE_SLOTS.map(slot=>[slot,h.store.inspect(h.character().equipped[slot]).version]));
  h.clock.now=()=>1600;await owner.suspend(c('scene.suspend',{sceneEpoch:cleared.header.state.sceneEpoch,timelineEpoch:cleared.header.state.timelineEpoch}));assert.equal(owner.state.status,'recovering',owner.state.code);const cutoff=h.store.inspect(h.challengeId).recoveryUntil;assert.equal(cutoff,11600);
  h.clock.now=()=>2500;await owner.prepare(c('scene.resumePrepare',{sceneEpoch:cleared.header.state.sceneEpoch,timelineEpoch:cleared.header.state.timelineEpoch,checkpointRevision:owner.state.data.state.checkpointRevision}));assert.equal(owner.state.status,'recovering',owner.state.code);assert.equal(owner.state.data.readyTicket.deadline,cutoff);
  h.clock.now=()=>3000;const {deadline,...ticket}=owner.state.data.readyTicket;await owner.ready(c('scene.ready',ticket));assert.equal(owner.state.status,'active',owner.state.code);assert.equal(owner.state.canMove,true);assert.equal(owner.state.canAttack,true);assert.equal(move.state.predictionEnabled,true);
  const resumed=await h.cp();assert.equal(resumed.header.acceptingInputs,true);assert.equal(resumed.header.state.anchorWallAt,3000);assert.equal(resumed.header.state.anchorTick,cleared.header.state.acceptedTick);assert.equal(resumed.header.state.inputGapBaseAt,null);assert.equal(resumed.header.state.acceptedTick,cleared.header.state.acceptedTick);assert.equal(resumed.header.state.acceptedSeq,cleared.header.state.acceptedSeq);assert.equal(resumed.header.state.timelineEpoch,cleared.header.state.timelineEpoch+1);
  assert.ok(h.store.inspect(h.challengeId).lastReadyReceipt);for(const slot of WEARABLE_SLOTS){assert.equal(h.store.inspect(h.character().equipped[slot]).durability.current,0);assert.equal(h.store.inspect(h.character().equipped[slot]).version,versions[slot]);}
  resumeAt=3000;
 }
 h.clock.now=()=>resumeAt+600;move.enqueue({seq:0,tick:move.state.confirmed.acceptedTick,kind:'move',x:1000,y:0});await move.submit('walk-to-exit',move.state.confirmed.acceptedTick+60);assert.equal(move.state.status,'active',move.state.code);
 const state=await h.service.query({...h.auth,query:'challenge.get',requestId:'next',payload:{challengeId:h.challengeId}}),ch=h.store.inspect(h.challengeId);
 const p=await h.service.execute({...h.auth,command:'challenge.prepareRoom',operationId:'wear-next-prepare',expected:state.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,nextRoomNo:1,expectedRevision:ch.version}});assert.equal(p.outcome.status,'committed',JSON.stringify(p));
 h.clock.now=()=>resumeAt+700;const a=await h.service.execute({...h.auth,command:'challenge.activateRoom',operationId:'wear-next-active',expected:p.outcome.resultVersions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:p.outcome.data.roomAttemptId,manifestHash:p.outcome.data.manifestHash,expectedRevision:h.store.inspect(h.challengeId).version}});assert.equal(a.outcome.status,'committed',JSON.stringify(a));
 const active=h.store.inspect(h.challengeId),ticket=a.outcome.data.readyTicket;const r=await h.service.execute({...h.auth,command:'scene.ready',controlSeq:active.controlSeq+1,leaseRevision:active.lease.revision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(ticket).filter(([k])=>k!=='deadline'))}});assert.equal(r.outcome.status,'committed',JSON.stringify(r));
 h.clock.now=()=>resumeAt+800;const next=await movementClient(h);next.enqueue({seq:0,tick:next.state.confirmed.acceptedTick,kind:'basic',pressed:true});next.enqueue({seq:0,tick:next.state.confirmed.acceptedTick,kind:'skill',skillId:'cross'});await next.submit('broken-basic',next.state.confirmed.acceptedTick+5);assert.equal(next.state.status,'active',next.state.code);assert.equal(h.store.inspect(h.challengeId).result,'active');assert.equal((await h.cp()).role.attackPower,'1060');assert.ok((await h.cp()).scene.cross.cast||(await h.cp()).scene.cross.effects.length);assert.equal(h.store.inspect(h.challengeId).currentRoomNo,1);
}
test('real transport confirms broken weapon public state then next room stays playable without resetting clocks or resources',()=>clearAndContinue());
test('ordinary cleared room fully recovers through existing owner before walking out and does not wear twice',()=>clearAndContinue({recover:true}));

// Observe actual storage calls, not an estimated object count. Injection stays at the approved Store seam.
async function measured(h,command){
 const run=h.store.run.bind(h.store),transactions=[];h.store.run=work=>run(tx=>{const reads=new Set(),writes=new Map(),sets=[];let calls=0;transactions.push({reads,writes,sets,get calls(){return calls;}});return work({get:async id=>{calls++;reads.add(id);return tx.get(id);},set:(id,value)=>{calls++;writes.set(id,new TextEncoder().encode(JSON.stringify(value)).length);sets.push(id);tx.set(id,value);}});});
 try{return {result:await h.service.execute(command),transactions};}finally{h.store.run=run;}
}

test('each actual wear write rolls back, successful lost response resolves original and same fragment under another ID cannot double wear',async()=>{
 const first=await fixture(),command=await first.command(),measuredResult=await measured(first,command);assert.equal(measuredResult.result.outcome.status,'committed');const transaction=measuredResult.transactions.find(t=>t.sets.length);assert.ok(transaction);const writeCount=transaction.sets.length;
 console.log('ST17-01 ordinary wear actual transaction',{reads:transaction.reads.size,writes:transaction.writes.size,calls:transaction.calls,writeCalls:writeCount,writeBytes:[...transaction.writes.values()].reduce((n,x)=>n+x,0),maxDocumentBytes:Math.max(...transaction.writes.values())});
 assert.equal([...first.store.snapshot().values()].filter(v=>v?.source?.kind==='equipmentWear').length,1);
 for(let index=1;index<=writeCount;index++){
  const h=await fixture(),q=await h.command(),before=h.store.snapshot();h.store.injectWriteFailure(index);const r=await h.service.execute(q);assert.equal(r.outcome.code,'SERVICE_UNAVAILABLE','write '+index);assert.deepEqual(h.store.snapshot(),before,'write '+index);assert.equal((await h.service.execute(q)).outcome.status,'committed');
 }
 const h=await fixture(),q=await h.command();h.store.injectResponseLoss();assert.equal((await h.service.execute(q)).outcome.status,'unknown');const after=h.store.snapshot(),original=await h.service.query({...h.auth,query:'operation.get',requestId:'wear-original',payload:{operationId:q.operationId}});assert.equal(original.data.status,'found');assert.equal(original.data.result.outcome.status,'committed');assert.equal((await h.service.execute(q)).replayed,true);assert.deepEqual(h.store.snapshot(),after);
 assert.equal((await h.service.execute({...q,operationId:'same-fragment-new-id'})).outcome.code,'VERSION_CONFLICT');assert.deepEqual(h.store.snapshot(),after);
});

test('two concurrent real submissions publish only one room wear and preserve intrinsic score inputs',async()=>{
 const h=await fixture({current:10}),before=h.character(),one=await h.command('concurrent-one'),two={...structuredClone(one),operationId:'concurrent-two'};
 let waiting=0,release;const barrier=new Promise(r=>release=r);h.store.beforeCommit=async attempt=>{if(attempt!==0)return;if(++waiting===2)release();await barrier;};
 const results=await Promise.all([h.service.execute(one),h.service.execute(two)]);h.store.beforeCommit=undefined;
 assert.equal(results.filter(r=>r.outcome.status==='committed').length,1);assert.equal(results.filter(r=>r.outcome.code==='VERSION_CONFLICT').length,1);assert.ok(h.store.conflicts>0);assert.equal(h.character().statsVersion,before.statsVersion);assert.equal(h.character().score,before.score);assert.equal(h.character().scoreReachedAt,before.scoreReachedAt);assert.equal(h.character().equipmentVersion,before.equipmentVersion);for(const slot of WEARABLE_SLOTS)assert.equal(h.store.inspect(h.character().equipped[slot]).durability.current,9);
});

test('version overflow refuses a real wear before any asset or checkpoint commit',async()=>{
 const h=await fixture();await h.store.run(async tx=>{const item=await tx.get(h.character().equipped.weapon);tx.set(item.id,{...item,version:Number.MAX_SAFE_INTEGER});});const q=await h.command(),before=h.store.snapshot();assert.equal((await h.service.execute(q)).outcome.code,'CONFIG_NOT_READY');assert.deepEqual(h.store.snapshot(),before);
});

test('broken items stop set counting and new stats while a released basic cast keeps its attack snapshot',async()=>{
 const h=await fixture(),sets={'wear-set':{setId:'wear-set',name:'Wear Test',bonuses:[{pieceCount:7,affixes:[{statId:'attackPower',value:500}]}]}};
 await h.store.run(async tx=>{for(const id of Object.values(h.character().equipped)){const item=await tx.get(id);tx.set(id,{...item,setRef:{id:'wear-set',version:1}});}});
 const service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:h.content,setConfigs:sets}),r=await service.execute(await h.command());assert.equal(r.outcome.status,'committed');const cp=await h.cp();assert.equal(cp.role.attackPower,'1000060');assert.equal(cp.role.combat.state.cast.snapshot.attackPower,'1000630');assert.equal(cp.role.player.hp,cp.role.player.maxHp);assert.equal(cp.role.combat.attributesRevision,h.character().statsVersion);
});

test('death to zero preserves released cross tail, original deadline and terminal reward receipt',async()=>{
 const {tailFixture}=await import('./fixtures/death-tail-fixture.mjs');const h=await tailFixture();
 await h.store.run(async tx=>{const ch=await tx.get(h.challengeId),w=await tx.get(h.character().equipped.weapon);tx.set(ch.id,{...ch,wearConfigHash:await manifestDigest(wear)});tx.set(w.id,{...w,durability:{...w.durability,current:3}});});
 const content={...h.content,wear},service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content}),first=await h.command([{kind:'skill',skillId:'cross'}],15,'zero-death');assert.equal((await service.execute(first)).outcome.status,'committed');const dead=h.store.inspect(h.challengeId),cp=await h.cp();assert.equal(dead.lifeState,'dead');assert.equal(h.store.inspect(h.character().equipped.weapon).durability.current,0);assert.ok(cp.scene.cross.effects.length>0);const release=structuredClone(cp.scene.cross.effects);
 const tail=await h.command([],15,'zero-tail');assert.equal((await service.execute(tail)).outcome.status,'committed');const done=h.store.inspect(h.challengeId);assert.equal(done.result,'completed');assert.equal(done.lifeState,'alive');assert.equal(done.deathIndex,1);assert.deepEqual(done.terminalFact.playerDeathAtTick,dead.playerDeathAtTick);assert.equal(h.store.inspect(h.character().equipped.weapon).durability.current,0);assert.equal(done.rewardTotals.kills,5);assert.equal(done.rewardTotals.gold,'50');assert.ok(release.length>0);assert.equal((await h.cp()).role.player.hp,(await h.cp()).role.player.maxHp);
});

test('real challenge start binds wear policy before assets are touched; zero weapon still cannot enter a new challenge',async()=>{
 const {createBankFixture}=await import('./fixtures/bank-fixture.mjs');
 for(const broken of [false,true]){
  const h=await createBankFixture(),content={schemaVersion:1,releaseRef:'wear-entry-test-v1',profile:'local-test',purpose:'contract-fixture-only',wear,dungeons:[{dungeonId:'first',kind:'first',purpleTemplateRef:'first-purple-test',mapId:'town-map-1',anchor:{x:100,y:100,radius:24},minLevel:1,maxMonsterLevel:15,difficulties:[{difficultyId:'normal',roomCost:1,levels:{1:{monsterStatsRef:'first-normal-l1',equipmentSourceRef:'first-normal-drops-v1'}}}]}]},service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content,catalog:{'equipment:warrior-sword-white-v1':{templateId:'equipment:warrior-sword-white-v1',name:'Starter',slotKind:'weapon',itemLevel:10,quality:'white',allowedClasses:['warrior']}}});
  const entry=await service.query({...h.auth,query:'dungeon.entry',requestId:'wear-entry',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,dungeonId:'first'}});
  if(broken)await h.store.run(async tx=>{const item=await tx.get(h.character().equipped.weapon);tx.set(item.id,{...item,durability:{...item.durability,current:0}});});
  const r=await service.execute({...h.auth,command:'challenge.start',operationId:'wear-start',expected:entry.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,dungeonId:'first',difficultyId:'normal',entryContext:entry.data.entryContext}});
  if(broken)assert.equal(r.outcome.code,'WEAPON_BROKEN');else {assert.equal(r.outcome.status,'committed',JSON.stringify(r));assert.equal(h.store.inspect(r.outcome.data.challengeId).wearConfigHash,await manifestDigest(wear));}
 }
});

test('cleared permission does not admit preparing, awaitingReady, recovery or closed inputs',async()=>{
 for(const patch of [{roomPhase:'preparing'},{roomPhase:'awaitingReady'},{connection:'recovery'},{sceneState:'closed',result:'failed'}]){
  const h=await fixture(),q=await h.command(),before=h.store.inspect(h.character().equipped.weapon);await h.store.run(async tx=>{const ch=await tx.get(h.challengeId);tx.set(ch.id,{...ch,...patch});});const r=await h.service.execute(q);assert.equal(r.outcome.status,'rejected',JSON.stringify(patch));assert.deepEqual(h.store.inspect(h.character().equipped.weapon),before);
 }
});
