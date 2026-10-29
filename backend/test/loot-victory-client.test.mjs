import test from 'node:test';
import assert from 'node:assert/strict';
import {terminalFixture} from './fixtures/terminal-fixture.mjs';

const persistence=()=>{const data=new Map();return {load:k=>data.get(k)??null,save:(k,v)=>v===null?data.delete(k):data.set(k,v)};};
async function setup(){
 const h=await terminalFixture();let lose=false;const calls=[];
 const transport={send:async text=>{const q=JSON.parse(text);calls.push(q);const r=await(q.query?h.service.query(q):h.service.execute(q));if(lose&&q.command==='challenge.leave'){lose=false;throw Error('response lost');}return JSON.stringify(r);}};
 const identity={...h.auth,challengeId:h.challengeId};return {h,transport,calls,identity,lose:()=>lose=true};
}
test('terminal coordinator reads strict receipt from real Boss commit and resolves lost finishLoot before fade',async()=>{
 const {TerminalCoordinator}=await import('../../client/assets/scripts/net/TerminalCoordinator.ts');
 const s=await setup(),pending=persistence(),c=new TerminalCoordinator(s.transport,pending);
 await c.open(s.identity);assert.equal(c.state.receipt,null);
 assert.equal((await s.h.service.execute(await s.h.command())).outcome.status,'committed');
 await c.refresh();assert.equal(c.state.receipt.kills,5);assert.equal(c.state.receipt.gold,'150');assert.equal(c.state.receipt.route,'direct');assert.equal(c.state.status,'ready');
 s.lose();await c.leave('leave-lost',{movement:false,drop:false});assert.equal(c.state.status,'unknown');assert.equal(c.state.fadeReady,false);
 const reopened=new TerminalCoordinator(s.transport,pending);await reopened.open(s.identity);assert.equal(reopened.state.status,'unknown');await reopened.retry();assert.equal(reopened.state.status,'closed');assert.equal(reopened.state.fadeReady,true);assert.equal(reopened.state.receipt.sceneState,'closed');
 assert.equal(s.calls.filter(q=>q.command==='challenge.leave').length,1);assert.ok(s.calls.some(q=>q.query==='operation.get'));
});

test('loot model uses confirmed 32px radius, preserves full-bag drops and flips original receipt',async()=>{
 const {LootVictoryHUDModel}=await import('../../client/assets/scripts/LootVictoryHUDModel.ts');
 const {DropCoordinator}=await import('../../client/assets/scripts/net/DropCoordinator.ts');
 const s=await setup();await s.h.service.execute(await s.h.command());const drops=new DropCoordinator(s.transport,persistence());await drops.open({...s.identity,sceneEpoch:1});
 const model=new LootVictoryHUDModel(),receipt=(await s.h.query()).clearReceipt;
 model.sync(drops.state,receipt,{x:'32001',y:'0'});assert.equal(model.drops.find(d=>d.x===1).near,true);
 model.sync(drops.state,receipt,{x:'32002',y:'0'});assert.equal(model.drops.find(d=>d.x===1).near,false);
 assert.equal(model.victory.routeMessage,'已放入背包');assert.equal(model.victory.gold,'150');
 model.update(.3);assert.equal(model.flipProgress,1);
 await s.h.store.run(async tx=>{const c=await tx.get(s.h.characterId),bag=await tx.get(c.backpackId);bag.slots=Object.fromEntries(Array.from({length:bag.capacity},(_,i)=>[i,{kind:'stack',stackId:'full-'+i,templateRef:{id:'ore',version:1},quantity:20,binding:{kind:'none'},traceRef:'full-trace'}]));tx.set(bag.id,bag);});
 await drops.refresh();await drops.collect('full-bag-click',drops.state.view.data.drops[0].dropId);assert.equal(drops.state.code,'BAG_FULL');
 model.sync(drops.state,receipt,{x:'0',y:'0'});assert.equal(model.notice,'背包已满');assert.equal(model.drops.length,5);
});

test('completed coordinator rejects combat intents but commits actual CP movement and leave waits for in-flight pickup',async()=>{
 const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts');const {TerminalCoordinator}=await import('../../client/assets/scripts/net/TerminalCoordinator.ts');
 const s=await setup();await s.h.service.execute(await s.h.command());const cp=await s.h.cp(),targets=cp.scene.combat.targets;
 const basic={profile:s.h.profile,stats:{...s.h.profile.attributes,attackPower:'1000000'},targetRules:Object.fromEntries(targets.map(t=>[t.actorId,{mitigation:t.mitigation,evasion:t.evasion,damageImmune:t.damageImmune,controlImmune:t.controlImmune}]))};
 let now=1513;const move=new MovementCoordinator(s.transport,persistence(),{now:()=>now}),context={...s.h.auth,characterId:s.h.characterId,rolePlayEpoch:s.h.character().rolePlayEpoch,challengeId:s.h.challengeId};
 await move.resumeActive(context,s.h.config,6,basic);assert.equal(move.state.status,'active',move.state.code);
 assert.throws(()=>move.enqueue({seq:0,tick:51,kind:'basic',pressed:true}),/CHALLENGE_COMPLETED/);
 const terminal=new TerminalCoordinator(s.transport,persistence());await terminal.open(s.identity);await assert.rejects(terminal.leave('blocked',{movement:false,drop:true}),/LEAVE_NOT_READY/);
 now=1613;s.h.clock.now=()=>now;move.enqueue({seq:0,tick:51,kind:'move',x:1000,y:0});await move.submit('loot-walk',61);assert.equal(move.state.status,'active',move.state.code);assert.equal(move.state.confirmed.acceptedTick,61);assert.notEqual(move.state.position.x,'0');assert.equal(move.state.confirmed.result,'completed');
});

test('scene binding serializes pickup versus leave and preserves pending delivery message',async()=>{
 const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts');const {LootSceneCoordinator}=await import('../../client/assets/scripts/net/LootSceneCoordinator.ts');
 const s=await setup();await s.h.store.run(async tx=>{const b=await tx.get(s.h.character().backpackId);b.slots=Object.fromEntries(Array.from({length:b.capacity},(_,i)=>[i,{kind:'stack',stackId:'junk-'+i,templateRef:{id:'ore',version:1},quantity:20,binding:{kind:'none'},traceRef:'junk'}]));tx.set(b.id,b);});await s.h.service.execute(await s.h.command());
 const cp=await s.h.cp(),targets=cp.scene.combat.targets,basic={profile:s.h.profile,stats:{...s.h.profile.attributes,attackPower:'1000000'},targetRules:Object.fromEntries(targets.map(t=>[t.actorId,{mitigation:t.mitigation,evasion:t.evasion,damageImmune:t.damageImmune,controlImmune:t.controlImmune}]))};
 const store=persistence(),move=new MovementCoordinator(s.transport,store,{now:()=>1513});await move.resumeActive({...s.h.auth,characterId:s.h.characterId,rolePlayEpoch:s.h.character().rolePlayEpoch,challengeId:s.h.challengeId},s.h.config,6,basic);
 const scene=new LootSceneCoordinator(move,s.transport,store,s.identity);await scene.open();assert.equal(scene.hud.victory.routeMessage,'背包已满，已暂存至待领奖励');
 const pickup=scene.collect('scene-full',scene.hud.nearest.dropId);await assert.rejects(scene.leave('during-pickup'),/LEAVE_NOT_READY/);await pickup;assert.equal(scene.hud.notice,'背包已满');
 await scene.leave('scene-finish');scene.update(.1);assert.equal(scene.terminal.state.status,'closed');assert.equal(scene.hud.fadeAlpha,.2);assert.equal(scene.canMove,false);
});

test('pickup click queued behind frame movement flushes CP without requiring an empty-queue timing window',async()=>{
 const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts');const {LootSceneCoordinator}=await import('../../client/assets/scripts/net/LootSceneCoordinator.ts');
 const s=await setup();await s.h.service.execute(await s.h.command());const cp=await s.h.cp(),targets=cp.scene.combat.targets,basic={profile:s.h.profile,stats:{...s.h.profile.attributes,attackPower:'1000000'},targetRules:Object.fromEntries(targets.map(t=>[t.actorId,{mitigation:t.mitigation,evasion:t.evasion,damageImmune:t.damageImmune,controlImmune:t.controlImmune}]))};
 const store=persistence(),move=new MovementCoordinator(s.transport,store,{now:()=>1513});await move.resumeActive({...s.h.auth,characterId:s.h.characterId,rolePlayEpoch:s.h.character().rolePlayEpoch,challengeId:s.h.challengeId},s.h.config,6,basic);const scene=new LootSceneCoordinator(move,s.transport,store,s.identity);await scene.open();
 s.h.clock.now=()=>1533;
 // Exactly the state left by an ordinary render frame before its 100ms send interval.
 move.enqueue({seq:0,tick:move.state.confirmed.acceptedTick,kind:'move',x:0,y:0});assert.equal(move.state.queued,1);
 const action=scene.requestCollect('frame-pickup',scene.hud.nearest.dropId);assert.equal(scene.canMove,false);await action;assert.equal(scene.drops.state.view.data.drops.filter(d=>d.collected).length,1);
 move.enqueue({seq:0,tick:move.state.confirmed.acceptedTick,kind:'move',x:0,y:0});await scene.requestLeave('frame-leave');assert.equal(scene.terminal.state.status,'closed');assert.equal(scene.hud.drops.length,4);
});

test('explicit isolated reward preview drives real Boss input, receipt and pickup without shortcut endpoints',async()=>{
 const {createLootChallengePreview}=await import('../../client/tools/challenge-preview-server.mjs');const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts');const {LootSceneCoordinator}=await import('../../client/assets/scripts/net/LootSceneCoordinator.ts');
 const preview=await createLootChallengePreview(),b=preview.bootstrap;assert.equal(b.mode,'local-test-terminal');assert.equal(b.authorization,'isolated-local-assets-only');assert.equal(b.activeRoomNo,6);assert.equal(b.prepareCommand,undefined);
 const transport={send:async text=>JSON.stringify(await preview.rpc(JSON.parse(text)))},store=persistence(),move=new MovementCoordinator(transport,store,{now:()=>Date.now()});await move.resumeActive(b.context,b.config,b.activeRoomNo,b.basic);assert.equal(move.state.status,'active',move.state.code);
 const scene=new LootSceneCoordinator(move,transport,store,b.context);await scene.open();assert.equal(scene.hud.victory,null);move.enqueue({seq:0,tick:move.state.confirmed.acceptedTick,kind:'basic',pressed:true});await scene.submit('preview-real-boss',51);assert.equal(move.state.status,'active',JSON.stringify(move.state));assert.equal(scene.terminal.state.status,'ready',JSON.stringify(scene.terminal.state));assert.equal(scene.hud.victory.kills,5);assert.equal(scene.hud.victory.gold,'150');await scene.requestCollect('preview-real-collect',scene.hud.nearest.dropId);assert.equal(scene.drops.state.view.data.drops.filter(d=>d.collected).length,1);await scene.requestLeave('preview-real-leave');assert.equal(scene.terminal.state.status,'closed');
});
