import test from 'node:test';
import assert from 'node:assert/strict';
import {jointTerminalFixture,meteredService} from './fixtures/joint-terminal-fixture.mjs';
test('joint real active Boss submit bounds eight changed CP blocks and atomically refuses maximum due result pages',async()=>{
 for(const due of [false,true]){
 const h=await jointTerminalFixture({due});assert.equal(h.store.inspect(h.challengeId).result,'active');assert.equal((await h.cp()).header.activeChunks.length,8);
 const q=await h.command(),before=h.store.snapshot(),{service,attempts}=meteredService(h),r=await service.execute(q);if(!due)assert.equal(r.outcome.status,'committed',JSON.stringify(r));
 if(due){assert.equal(r.outcome.code,'CONFIG_NOT_READY');assert.deepEqual(h.store.snapshot(),before);assert.equal(attempts.filter(a=>a.W>0).length,0);}else{
 const m=attempts.find(a=>a.W>0);console.log('ST15-05 measured '+JSON.stringify({due,attempts}));assert.ok(m.R<=44);assert.ok(m.W<=33);assert.ok(m.calls<=80);assert.equal(h.character().level,30);assert.equal(h.character().mailIds.length,7);assert.equal(h.store.inspect(h.challengeId).clearReceipt.route,'pending');}

 }
});

test('joint bounded terminal rolls back at every actual set including repeated character writes',async()=>{
 const sample=await jointTerminalFixture(),measured=meteredService(sample);
 assert.equal((await measured.service.execute(await sample.command())).outcome.status,'committed');
 const count=measured.attempts.find(a=>a.W>0).setCalls;
 for(let n=1;n<=count;n++){
  const h=await jointTerminalFixture(),q=await h.command(),before=h.store.snapshot();h.store.injectWriteFailure(n);
  assert.equal((await h.service.execute(q)).outcome.code,'SERVICE_UNAVAILABLE',`set ${n}`);assert.deepEqual(h.store.snapshot(),before,`set ${n}`);assert.equal(h.store.inspect(h.challengeId).result,'active');
 }
 console.log('ST15-05 rollback set points '+count);
});

import {terminalFixture} from './fixtures/terminal-fixture.mjs';
import {ChallengeService} from '../src/challenge/challenge-service.ts';
import {DropCoordinator} from '../../client/assets/scripts/net/DropCoordinator.ts';
import {TerminalCoordinator} from '../../client/assets/scripts/net/TerminalCoordinator.ts';
import {MailService} from '../src/mail/mail-service.ts';
import {loginKey} from '../src/identity/identity-v2.ts';
const persistence=()=>{const m=new Map();return {load:k=>m.get(k)??null,save:(k,v)=>v===null?m.delete(k):m.set(k,v)};};
test('real pending full bag pickup leave and all six mailbox consumers preserve original route and holdings',async()=>{
 const h=await jointTerminalFixture(),q=await h.command();h.store.injectResponseLoss();assert.equal((await h.service.execute(q)).outcome.status,'unknown');
 const receipt=(await h.query()).clearReceipt,holdingsId=await loginKey('holdings',[h.character().accountId,'character',h.characterId]),holdings=h.store.inspect(holdingsId),before=h.store.snapshot();assert.equal(holdings.entries[0].permanentCount,1);assert.equal((await h.service.execute(q)).replayed,true);assert.deepEqual(h.store.snapshot(),before);
 const transport={send:async text=>{const q=JSON.parse(text);return JSON.stringify(await(q.query?h.service.query(q):h.service.execute(q)));}},identity={...h.auth,challengeId:h.challengeId},drops=new DropCoordinator(transport,persistence());await drops.open({...identity,sceneEpoch:1});
 const drop=drops.state.view.data.drops[0];await drops.collect('full-pickup',drop.dropId);assert.equal(drops.state.code,'BAG_FULL');assert.equal(drops.state.view.data.drops[0].collected,false);
 await h.store.run(async tx=>{const b=await tx.get(h.character().backpackId);delete b.slots[0];tx.set(b.id,b);});await drops.refresh();await drops.collect('ground-after-free',drop.dropId);assert.equal(drops.state.view.data.drops[0].collected,true);
 const terminal=new TerminalCoordinator(transport,persistence());await terminal.open(identity);assert.equal(terminal.state.receipt.route,'pending');await terminal.leave('real-leave',{movement:false,drop:false});assert.equal(terminal.state.status,'closed');assert.equal(h.store.inspect(h.challengeId).staminaSettlement.state,'settled');
 const contextId='joint-mailbox';await h.store.run(async tx=>{const b=await tx.get(h.character().backpackId);for(let i=1;i<=7;i++)delete b.slots[i];tx.set(b.id,b);tx.set(contextId,{schemaVersion:2,id:contextId,accountId:h.character().accountId,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,sceneEpoch:1,locationRevision:1,anchorId:'mailbox',serviceKind:'mailbox',issuedAt:1000,status:'open'});});
 const mail=new MailService({store:h.store,clock:h.clock,identity:h.identity}),claim={...h.auth,command:'reward.claim',operationId:'joint-grant',expected:[],payload:{characterId:h.characterId,contextId,grantId:receipt.grantId}};
 assert.equal((await mail.execute(claim)).outcome.status,'committed');assert.equal((await mail.execute(claim)).replayed,true);assert.equal(h.store.inspect(receipt.itemId).location.kind,'container');
 for(const node of [5,10,15,20,25,30]){const cmd={...h.auth,command:'mail.claimAttachment',operationId:'joint-node-'+node,expected:[],payload:{characterId:h.characterId,contextId,mailId:`mail:${h.characterId}:level-${node}`,attachmentId:'weapon'}};assert.equal((await mail.execute(cmd)).outcome.status,'committed');assert.equal((await mail.execute(cmd)).replayed,true);}
 assert.equal((await h.query()).clearReceipt.route,'pending');assert.deepEqual(h.store.inspect(holdingsId),holdings);
});
test('all six retained mail source stubs prevent reissuance',async()=>{
 const h=await terminalFixture();await h.store.run(async tx=>{for(const node of [5,10,15,20,25,30]){const id=`mail:${h.characterId}:level-${node}`;tx.set(id,{schemaVersion:2,id,accountId:h.character().accountId,characterId:h.characterId,sourceKey:id,status:node%10?'deleted':'expired'});}});
 assert.equal((await h.service.execute(await h.command())).outcome.status,'committed');assert.equal(h.character().mailIds.length,1);for(const node of [5,10,15,20,25,30])assert.equal(h.store.inspect(`mail:${h.characterId}:level-${node}`).status,node%10?'deleted':'expired');
});
test('terminal submit versus leave uses real OCC in both commit orders without half rewards',async()=>{
 for(const winner of ['simulation.submit','challenge.leave']){
 const h=await terminalFixture(),submit=await h.command(),leave={...h.auth,command:'challenge.leave',operationId:'joint-race-leave',expected:[],payload:{challengeId:h.challengeId,reason:'abandon'}};
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const svc=new ChallengeService({store:{run:work=>h.store.run(async tx=>{let command;const result=await work({get:tx.get,set:(id,v)=>{if(v.command==='simulation.submit'||v.command==='challenge.leave')command=v.command;tx.set(id,v);}});if(command&&command!==winner){entered();await gate;}return result;})},clock:h.clock,identity:h.identity,content:h.content});
 const losing=svc.execute(winner==='simulation.submit'?leave:submit);await started;const first=await svc.execute(winner==='simulation.submit'?submit:leave);release();const second=await losing;
 assert.equal(first.outcome.status,'committed');assert.ok(h.store.conflicts>0);const ch=h.store.inspect(h.challengeId);if(winner==='simulation.submit'){assert.equal(ch.result,'completed');assert.equal(ch.clearReceipt.gold,'150');}else{assert.equal(second.outcome.status,'rejected');assert.equal(ch.clearReceipt,undefined);assert.equal(h.character().xp,0);}
 }
});
