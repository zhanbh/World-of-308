import test from 'node:test';
import assert from 'node:assert/strict';
import {nextRoomFixture} from './next-room-v2.test.mjs';
import {ChallengeService} from '../src/challenge/challenge-service.ts';
import {manifestDigest} from '../../shared/src/room-manifest.ts';
import {writeChunk,stateHash} from '../src/challenge/room-checkpoint.ts';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import {RecoveryCoordinator} from '../../client/assets/scripts/net/RecoveryCoordinator.ts';
import {ActivationCoordinator} from '../../client/assets/scripts/net/ActivationCoordinator.ts';
async function fixture(){
 const h=await nextRoomFixture(),content={...h.content,exitInteraction:{profile:'local-test',rulesRef:h.content.releaseRef,radius:0},regeneration:{profile:'local-test',ref:'regen-proof-v1',unit:'internal-per-second',hp:{numerator:60,denominator:1},mp:{numerator:0,denominator:1},buffs:[{templateRef:'proof-buff@1',hp:{numerator:0,denominator:1},mp:{numerator:0,denominator:1}}]}};
 h.service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content});
 await h.store.run(async tx=>{const ch=await tx.get(h.challengeId),hd=await tx.get(h.headerId),r=(await tx.get(h.roleId)).data,s=(await tx.get(h.sceneId)).data;r.schemaVersion=2;r.regenerationRef=content.regeneration.ref;r.regenerationHash=await manifestDigest(content.regeneration);r.buffs=[{kind:'buff',buffId:'expires-during-loading',actorId:h.characterId,templateRef:'proof-buff@1',endsAtTick:250}];const c=await writeChunk(ch,0,2,r);tx.set(c.id,c);tx.set(hd.id,{...hd,activeChunks:[{...hd.activeChunks[0],chunkRevision:2,hash:c.hash},hd.activeChunks[1]],state:{...hd.state,publicStateHash:await stateHash(r,s)}});});
 const saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)},sent=[];let lose=false,race=false,damage=null;
 const transport={send:async text=>{const q=JSON.parse(text);sent.push(q);let r=await(q.query?h.service.query(q):h.service.execute(q));if(damage&&q.query==='scene.recoveryPage'&&q.requestId.startsWith('active-')){r={...r,...(damage==='omitted'?{records:[]}:damage==='binding'?{timelineEpoch:r.timelineEpoch+1}:{records:r.records.map(x=>x.kind==='actor'?{...x,hp:'1'}:x)})};}if(lose&&q.command==='scene.ready'){lose=false;throw Error('lost committed ready');}if(race&&q.query==='scene.recoveryPage'&&q.requestId.startsWith('active-')){race=false;const head=h.store.inspect(h.challengeId);const changed=await h.service.execute({...h.auth,command:'scene.suspend',controlSeq:head.controlSeq+1,leaseRevision:head.lease.revision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:q.payload.sceneEpoch,timelineEpoch:q.payload.timelineEpoch}});assert.equal(changed.outcome.status,'committed');}return JSON.stringify(r);},queryOriginalControl:async text=>JSON.stringify(await h.service.queryOriginalControl(JSON.parse(text)))};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.nextCommand);const m=loading.state.manifest;h.clock.now=()=>2000;
 const activate={...h.activateCommand,operationId:'proof-activate',expected:(await h.query()).versions,payload:{...h.activateCommand.payload,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:h.store.inspect(h.challengeId).version}};
 return {h,persistence,transport,loading,activate,sent,lose:()=>lose=true,race:()=>race=true,damage:value=>damage=value};
}
for(const mode of ['activation','recovery'])for(const fault of ['lost','race','omitted','binding','digest'])test(`${mode} refreshes regenerated HP and expired buffs after ready; ${fault} remains safe`,async()=>{
 const f=await fixture(),{h,loading,transport,persistence}=f,p={characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId},identity={...h.auth,...p};let client;
 if(mode==='activation'){
  client=new ActivationCoordinator(transport,persistence);await client.activate(f.activate,loading);await client.fetchPages('before');
 }else{
  await h.service.execute(f.activate);client=new RecoveryCoordinator(transport,persistence);client.init(identity);h.clock.now=()=>3000;
  await client.control({...h.auth,command:'scene.suspend',controlSeq:2,leaseRevision:1,payload:{...p,sceneEpoch:2,timelineEpoch:2}});h.clock.now=()=>4000;
  await client.control({...h.auth,command:'scene.resumePrepare',controlSeq:3,leaseRevision:2,payload:{...p,sceneEpoch:2,timelineEpoch:2,checkpointRevision:client.state.data.state.checkpointRevision}});client.useLoadedResources(loading);await client.fetchPages('before');
  const {deadline,...binding}=client.state.data.readyTicket;await client.control({...h.auth,command:'scene.ready',controlSeq:4,leaseRevision:3,payload:{...p,...binding}});await client.fetchPages('ordinary-before');
 }
 const ticket=mode==='activation'?client.state.ticket:client.state.data.readyTicket,{deadline,...binding}=ticket;
 const cached=readJournal(persistence,mode==='activation'?f.activate:identity,mode).pages.flatMap(page=>page.records);assert.equal(cached.some(r=>r.kind==='buff'&&r.buffId==='expires-during-loading'),true);const previousHp=cached.find(r=>r.kind==='actor'&&r.actorId===h.characterId).hp;
 // Ready advances the loading clock past the timed buff.
 const seq=mode==='activation'?2:5,ready={...h.auth,command:'scene.ready',controlSeq:seq,leaseRevision:seq-1,payload:{...p,...binding}};
 h.clock.now=()=>5000;if(fault==='lost')f.lose();else if(fault==='race')f.race();else f.damage(fault);
 if(mode==='activation')await client.ready(ready);else await client.control(ready);
 assert.equal(client.state.predictionEnabled,false);
 if(fault!=='lost'){
  assert.equal(client.state.status,'unknown');assert.equal(client.state.publicRecords,null);assert.ok(pendingIntent(persistence,mode==='activation'?f.activate:identity,mode));return;
 }
 if(mode==='activation'){client=new ActivationCoordinator(transport,persistence);client.restore(f.activate);}else{client=new RecoveryCoordinator(transport,persistence);client.init(identity);}
 client.useLoadedResources(loading);await client.fetchPages('reload-before');await client.retry();
 assert.equal(client.state.predictionEnabled,true);assert.equal(client.state.status,'active');
 const live=await h.query(),state=mode==='activation'?client.state.state:client.state.data.state;
 assert.equal(state.publicStateHash,live.data.publicStateHash);assert.ok(state.checkpointRevision>ticket.checkpointRevision);
 const actor=client.state.publicRecords.find(r=>r.kind==='actor'&&r.actorId===h.characterId);assert.equal(actor.hp,h.store.inspect(h.roleId).data.player.hp);assert.notEqual(actor.hp,previousHp);assert.equal(client.state.publicRecords.some(r=>r.kind==='buff'&&r.buffId==='expires-during-loading'),false);
 const page=f.sent.findLast(q=>q.query==='scene.recoveryPage');assert.equal(page.payload.readyTicketId,ticket.readyTicketId);assert.equal(page.payload.publicStateHash,state.publicStateHash);
});
function readJournal(persistence,context,mode){const key=mode==='activation'?['room-activation',context.sessionId,context.sessionEpoch,context.payload.characterId,context.payload.rolePlayEpoch,context.payload.challengeId]:['scene-recovery',context.sessionId,context.sessionEpoch,context.characterId,context.rolePlayEpoch,context.challengeId];return JSON.parse(persistence.load(JSON.stringify(key)));}

function pendingIntent(persistence,context,mode){const saved=readJournal(persistence,context,mode);return mode==='activation'?saved.ready:saved.pending;}

test('active-room recovery ready reacquires current proof after committed reply loss',async()=>{
 const f=await fixture(),{h,transport,persistence,loading}=f,p={characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId};
 const a=new ActivationCoordinator(transport,persistence);await a.activate(f.activate,loading);await a.fetchPages('initial');const {deadline,...binding}=a.state.ticket;
 await a.ready({...h.auth,command:'scene.ready',controlSeq:2,leaseRevision:1,payload:{...p,...binding}});assert.equal(a.state.predictionEnabled,true);
 let c=new RecoveryCoordinator(transport,persistence);const identity={...h.auth,...p};c.init(identity);h.clock.now=()=>3000;
 await c.control({...h.auth,command:'scene.suspend',controlSeq:3,leaseRevision:2,payload:{...p,sceneEpoch:2,timelineEpoch:2}});h.clock.now=()=>4000;
 await c.control({...h.auth,command:'scene.resumePrepare',controlSeq:4,leaseRevision:3,payload:{...p,sceneEpoch:2,timelineEpoch:2,checkpointRevision:c.state.data.state.checkpointRevision}});c.useLoadedResources(loading);await c.fetchPages('active-recovery-before');
 const ticket=c.state.data.readyTicket,{deadline:originalDeadline,...resumeBinding}=ticket;f.lose();await c.control({...h.auth,command:'scene.ready',controlSeq:5,leaseRevision:4,payload:{...p,...resumeBinding}});assert.equal(c.state.status,'unknown');
 c=new RecoveryCoordinator(transport,persistence);c.init(identity);c.useLoadedResources(loading);await c.fetchPages('active-recovery-reload');await c.retry();
 assert.equal(c.state.predictionEnabled,true);assert.equal(c.state.publicRecords.find(r=>r.kind==='actor'&&r.actorId===h.characterId).hp,h.store.inspect(h.roleId).data.player.hp);assert.equal(c.state.data.state.publicStateHash,(await h.query()).data.publicStateHash);
 const pages=f.sent.filter(q=>q.query==='scene.recoveryPage'&&q.requestId.startsWith('active-5'));assert.ok(pages.length);assert.equal(pages[0].payload.readyTicketId,ticket.readyTicketId);
});
test('ready accepted one millisecond before ticket cutoff can reopen and prove its new connected phase',async()=>{
 const f=await fixture(),{h,loading,transport,persistence}=f,c=new ActivationCoordinator(transport,persistence);await c.activate(f.activate,loading);await c.fetchPages('boundary-before');const t=c.state.ticket,{deadline,...binding}=t;
 h.clock.now=()=>deadline-1;f.lose();await c.ready({...h.auth,command:'scene.ready',controlSeq:2,leaseRevision:1,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...binding}});assert.equal(c.state.status,'unknown');
 h.clock.now=()=>deadline+1;const reopened=new ActivationCoordinator(transport,persistence);reopened.restore(f.activate);reopened.useLoadedResources(loading);await reopened.fetchPages('boundary-reload');await reopened.retry();assert.equal(reopened.state.predictionEnabled,true);assert.ok(reopened.state.publicRecords.some(r=>r.kind==='actor'&&r.actorId===h.characterId));
 const issued=h.store.inspect(h.challengeId).lastReadyReceipt.proofDeadline;assert.equal(issued,deadline+9999);const before=h.store.snapshot();await reopened.retry();assert.equal(h.store.inspect(h.challengeId).lastReadyReceipt.proofDeadline,issued);assert.deepEqual(h.store.snapshot(),before);
 const head=h.store.inspect(h.challengeId);await h.service.execute({...h.auth,command:'heartbeat',heartbeatSeq:1,leaseRevision:head.lease.revision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:reopened.state.state.sceneEpoch,timelineEpoch:reopened.state.state.timelineEpoch}});assert.equal(h.store.inspect(h.challengeId).lastReadyReceipt.proofDeadline,issued);h.clock.now=()=>issued;const page=f.sent.findLast(q=>q.query==='scene.recoveryPage');await assert.rejects(()=>h.service.query(page),/VERSION_CONFLICT/);
});
