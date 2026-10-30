import test from 'node:test';
import assert from 'node:assert/strict';
import {dropFixture} from './fixtures/drop-fixture.mjs';
import {DropCoordinator} from '../../client/assets/scripts/net/DropCoordinator.ts';
const equipment={kind:'equipment',templateRef:{id:'unknown-boots',version:1},quantity:1,quality:'purple',itemLevel:30,binding:{kind:'character'},equipment:{slotKind:'boots',affixes:[],setRef:null,durability:{wearEnabled:true,current:100,max:100,policyRef:'test'}}};
const persistence=()=>{const m=new Map();return {load:k=>m.get(k)??null,save:(k,v)=>v===null?m.delete(k):m.set(k,v)}};
test('unknown collect resolves original equipment delivery without replay or optimistic state',async()=>{
 const h=await dropFixture(equipment);await h.kill();let lost=true,writes=0;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='drop.collect'){writes++;if(lost){lost=false;throw Error('lost response')}}return JSON.stringify(r)}};
 const d=new DropCoordinator(transport,persistence());await d.open({...h.auth,challengeId:h.challengeId,sceneEpoch:1});await d.collect('unknown-equipment',d.state.view.data.drops[0].dropId);assert.equal(d.state.status,'unknown');
 d.freeze();assert.equal(await d.resolvePendingOriginal(),'settled');assert.equal(writes,1);assert.equal(d.hasPending,false);
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'asset-original',payload:{operationId:'unknown-equipment'}});const ids=original.data.result.outcome.data.itemIds;assert.equal(ids.length,1);assert.equal(h.store.inspect(ids[0]).templateRef.id,'unknown-boots');assert.equal(h.store.inspect(ids[0]).location.kind,'container');
});
import {monsterClientFixture} from './fixtures/monster-client-fixture.mjs';
import {CombatRecoveryCoordinator} from '../../client/assets/scripts/net/CombatRecoveryCoordinator.ts';
test('owner resolves unknown simulation before suspend without requiring connected movement refresh',async()=>{
 const h=await monsterClientFixture();h.setNow(1113);h.lose();await h.client.submit('unknown-simulation',10);assert.equal(h.client.state.status,'unknown');
 const transport={send:async text=>{const q=JSON.parse(text);return JSON.stringify(await(q.query?h.service.query(q):h.service.execute(q)))},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const owner=new CombatRecoveryCoordinator(transport,persistence(),h.client,h.loading);owner.init(h.context,h.config,0,h.basic);
 await owner.suspend({...h.auth,command:'scene.suspend',controlSeq:2,leaseRevision:2,payload:{characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1}});
 assert.equal(h.client.hasPending,false);assert.equal(owner.state.status,'recovering',owner.state.code);assert.equal(h.client.state.predictionEnabled,false);
});
import {terminalFixture} from './fixtures/terminal-fixture.mjs';
import {TerminalCoordinator} from '../../client/assets/scripts/net/TerminalCoordinator.ts';
test('unknown leave resolves its receipt behind the barrier and preserves one terminal equipment delivery',async()=>{
 const h=await terminalFixture();assert.equal((await h.service.execute(await h.command())).outcome.status,'committed');let writes=0;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='challenge.leave'){writes++;throw Error('lost leave')}return JSON.stringify(r)}};
 const c=new TerminalCoordinator(transport,persistence());await c.open({...h.auth,challengeId:h.challengeId});const receipt=c.state.receipt;assert.equal(receipt.sceneState,'looting');await c.leave('unknown-leave',{movement:false,drop:false});assert.equal(c.state.status,'unknown');
 c.freeze();assert.equal(await c.resolvePendingOriginal(),'settled');assert.equal(c.state.fadeReady,true);assert.equal(c.hasPending,false);assert.equal(writes,1);
 const final=await h.query();assert.equal(final.clearReceipt.sceneState,'closed');assert.equal(final.clearReceipt.receiptId,receipt.receiptId);assert.equal(h.bag().slots[0].kind,'equipment');
});
for(const oldFirst of [true,false])test('notFound then '+(oldFirst?'old equipment write':'recovery fence')+' wins OCC without duplicate assets',async()=>{
 const h=await dropFixture(equipment);await h.kill();let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let held=true,writes=0;
 const transport={send:async text=>{const q=JSON.parse(text);if(q.command==='drop.collect'){writes++;if(held){held=false;entered();await gate}}return JSON.stringify(await(q.query?h.service.query(q):h.service.execute(q)))}};
 const d=new DropCoordinator(transport,persistence());await d.open({...h.auth,challengeId:h.challengeId,sceneEpoch:1});const pending=d.collect('raced-equipment',d.state.view.data.drops[0].dropId);await waiting;d.freeze();assert.equal(await d.resolvePendingOriginal(),'notFound');assert.equal(writes,1);assert.equal(d.hasPending,true);
 const payload={characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId},status=await h.service.execute({...h.auth,command:'scene.status',controlSeq:2,leaseRevision:0,payload:{...payload,readyTicketId:null}});
 let commitRelease,commitEntered;const commitGate=new Promise(r=>commitRelease=r),atCommit=new Promise(r=>commitEntered=r);let firstCommit=true;h.store.beforeCommit=async()=>{if(firstCommit){firstCommit=false;commitEntered();await commitGate}};
 const suspendCommand={...h.auth,command:'scene.suspend',controlSeq:2,leaseRevision:status.leaseRevision,payload:{...payload,sceneEpoch:1,timelineEpoch:1}};let suspended;
 if(oldFirst){const suspension=h.service.execute(suspendCommand);await atCommit;release();await pending;commitRelease();suspended=await suspension;}
 else{release();await atCommit;suspended=await h.service.execute(suspendCommand);commitRelease();await pending;}
 h.store.beforeCommit=undefined;assert.ok(h.store.conflicts>0,'actual snapshot OCC conflict occurred');assert.equal(suspended.outcome.status,'committed');
 const prepared=await h.service.execute({...h.auth,command:'scene.resumePrepare',controlSeq:3,leaseRevision:suspended.leaseRevision,payload:{...payload,sceneEpoch:1,timelineEpoch:1,checkpointRevision:suspended.outcome.data.state.checkpointRevision}});assert.equal(prepared.outcome.status,'committed');
 assert.equal(await d.resolvePendingOriginal(true),'settled');assert.equal(d.hasPending,false);assert.equal(writes,1);
 const original=await h.service.query({...h.auth,query:'operation.get',requestId:'raced-original',payload:{operationId:'raced-equipment'}});assert.equal(original.data.result.outcome.status,oldFirst?'committed':'rejected');
 const items=Object.values(h.bag().slots).filter(x=>x.kind==='equipment');assert.equal(items.length,oldFirst?1:0);assert.equal(prepared.outcome.data.state.timelineEpoch,2);assert.equal((await h.list()).data.drops[0].collected,oldFirst);
});
test('failed original query leaves a visible bounded barrier and retry retains the exact control',async()=>{
 const h=await monsterClientFixture();h.setNow(1113);let offline=true,queries=0,controls=0,lost=true;
 const transport={send:async text=>{const q=JSON.parse(text);if(q.query==='operation.get'){queries++;if(offline)throw Error('offline original')}if(q.command==='scene.suspend')controls++;const r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='simulation.submit'&&lost){lost=false;throw Error('lost response')}return JSON.stringify(r)},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const store=persistence(),{MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts'),movement=new MovementCoordinator(transport,store,{now:()=>1113});await movement.resumeActive(h.context,h.config,0,h.basic);await movement.submit('pending-before-barrier',10);let owner=new CombatRecoveryCoordinator(transport,store,movement,h.loading);owner.init(h.context,h.config,0,h.basic);await owner.suspend({...h.auth,command:'scene.suspend',controlSeq:2,leaseRevision:2,payload:{characterId:h.characterId,rolePlayEpoch:h.context.rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1}});
 assert.equal(owner.state.status,'unknown');assert.equal(queries,1);assert.equal(controls,0);assert.equal(movement.hasPending,true);
 offline=false;owner=new CombatRecoveryCoordinator(transport,store,movement,h.loading);owner.init(h.context,h.config,0,h.basic);await owner.retry();assert.equal(owner.state.status,'recovering',owner.state.code);assert.equal(controls,1);assert.equal(movement.hasPending,false);
});
for(const kind of ['movement','drop','leave'])for(const retire of ['close','rebind'])test(kind+' original result arriving after '+retire+' cannot change retired view',async()=>{
 const h=kind==='movement'?await monsterClientFixture():kind==='drop'?await dropFixture(equipment):await terminalFixture();if(kind==='drop')await h.kill();if(kind==='leave')await h.service.execute(await h.command());
 let release,entered,hold=false,lost=true;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r),store=persistence();
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command===(kind==='movement'?'simulation.submit':kind==='drop'?'drop.collect':'challenge.leave')&&lost){lost=false;throw Error('lost reply')}if(hold&&q.query==='operation.get'){hold=false;entered();await gate}return JSON.stringify(r)}};
 let client;
 if(kind==='movement'){const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts');h.setNow(1113);client=new MovementCoordinator(transport,store,{now:()=>1113});await client.resumeActive(h.context,h.config,0,h.basic);await client.submit('late-movement',10);}
 else if(kind==='drop'){client=new DropCoordinator(transport,store);await client.open({...h.auth,challengeId:h.challengeId,sceneEpoch:1});await client.collect('late-drop',client.state.view.data.drops[0].dropId);}
 else{client=new TerminalCoordinator(transport,store);await client.open({...h.auth,challengeId:h.challengeId});await client.leave('late-leave',{movement:false,drop:false});}
 assert.equal(client.state.status,'unknown');client.freeze();hold=true;const old=client.resolvePendingOriginal();await waiting;if(retire==='close')client.close();else if(kind==='movement')await client.resumeActive({...h.context,rolePlayEpoch:h.context.rolePlayEpoch+1},h.config,0,h.basic);else if(kind==='drop')await client.open({...h.auth,challengeId:h.challengeId,sceneEpoch:2});else await client.open({...h.auth,challengeId:'other-challenge'});const closed=client.state;release();assert.equal(await old,'unknown');assert.deepEqual(client.state,closed);if(retire==='close')assert.equal(client.hasPending,true,'old callback does not erase durable pending intent');
});
test('owner freezes real drop participant and queries equipment original before its recovery control',async()=>{
 const h=await dropFixture(equipment);await h.kill();const events=[];let lost=true;
 const transport={send:async text=>{const q=JSON.parse(text);events.push(q.command??q.query);const r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='drop.collect'&&lost){lost=false;throw Error('lost response')}return JSON.stringify(r)},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const store=persistence(),d=new DropCoordinator(transport,store);await d.open({...h.auth,challengeId:h.challengeId,sceneEpoch:1});await d.collect('owned-unknown-equipment',d.state.view.data.drops[0].dropId);
 const {MovementCoordinator}=await import('../../client/assets/scripts/net/MovementCoordinator.ts'),{LoadingCoordinator}=await import('../../client/assets/scripts/net/LoadingCoordinator.ts');
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId},movement=new MovementCoordinator(transport,store,h.clock),loading=new LoadingCoordinator(transport,store,{load:(ref,release)=>h.service.resolveResource(release,ref)}),owner=new CombatRecoveryCoordinator(transport,store,movement,loading,[d]);owner.init(context,h.config,0);
 const status=await h.service.execute({...h.auth,command:'scene.status',controlSeq:2,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:context.rolePlayEpoch,challengeId:h.challengeId,readyTicketId:null}});events.length=0;
 await owner.suspend({...h.auth,command:'scene.suspend',controlSeq:2,leaseRevision:status.leaseRevision,payload:{characterId:h.characterId,rolePlayEpoch:context.rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1}});
 assert.deepEqual(events,['operation.get','scene.suspend']);assert.equal(d.hasPending,false);assert.equal(owner.state.status,'recovering');assert.equal(Object.values(h.bag().slots).filter(x=>x.kind==='equipment').length,1);await assert.rejects(d.collect('forbidden-new-write','anything'),/DROP_NOT_READY/);
});
