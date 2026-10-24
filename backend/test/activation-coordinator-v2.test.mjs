import test from 'node:test';
import assert from 'node:assert/strict';
import {ActivationCoordinator} from '../../client/assets/scripts/net/ActivationCoordinator.ts';
import {publicStateDigest} from '../../shared/src/public-state-proof.ts';
const records=[{kind:'actor',actorId:'player',actorIndex:0,x:0,y:0,facing:1,hp:'10',maxHp:'10',mp:'0',maxMp:'0',lifeState:'alive',actionId:'idle',phase:0}];
const command={protocolVersion:2,command:'challenge.activateRoom',operationId:'original',sessionId:'s',sessionEpoch:1,expected:[{kind:'challenge',id:'h',version:1},{kind:'character',id:'c',version:1}],payload:{characterId:'c',rolePlayEpoch:1,challengeId:'h',roomAttemptId:'attempt',manifestHash:'b'.repeat(64),expectedRevision:1}};
const loading={state:{status:'loaded',manifest:{roomAttemptId:'attempt',challengeId:'h',manifestHash:'b'.repeat(64)}}};
test('reload replays original activation and ready and prediction waits for current resources and proof',async()=>{
 const hash=await publicStateDigest(records),binding={sceneEpoch:1,timelineEpoch:1,checkpointRevision:1,publicStateHash:hash,manifestHash:'b'.repeat(64)};
 const ticket={...binding,readyTicketId:'ticket',deadline:10000};
 const state={...binding,challengeId:'h',acceptedSeq:0,acceptedTick:0,roomPhase:'awaitingReady',connection:'connected',lifeState:'alive',result:'active',anchorWallAt:null,anchorTick:null,inputGapBaseAt:null,lastAcceptedInputAt:null,recoveryUntil:null,deathDeadline:null,transitionClock:null};
 const saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)},sent=[];let lose=true;
 const transport={send:async text=>{const c=JSON.parse(text);sent.push(c);if(c.query==='challenge.get')return JSON.stringify({requestId:c.requestId,serverTime:10,versions:[],data:{...state,roomPhase:'active',anchorWallAt:10,anchorTick:0,inputGapBaseAt:10}});if(c.query==='operation.get')return JSON.stringify({requestId:c.requestId,serverTime:1,versions:[],data:{status:'notFound'}});if(c.command==='scene.status')return JSON.stringify({protocolVersion:2,command:'scene.status',controlSeq:c.controlSeq,leaseRevision:1,serverTime:1,replayed:false,outcome:{status:'rejected',code:'VERSION_CONFLICT'}});if(lose){lose=false;throw Error('lost');}return JSON.stringify(c.command==='scene.ready'?{protocolVersion:2,command:c.command,controlSeq:c.controlSeq,leaseRevision:2,serverTime:10,replayed:true,outcome:{status:'committed',data:{state:{...state,roomPhase:'active',anchorWallAt:10,anchorTick:0,inputGapBaseAt:10},readyTicket:null}}}:{protocolVersion:2,command:c.command,operationId:c.operationId,serverTime:1,replayed:true,outcome:{status:'committed',data:{state,readyTicket:ticket},resultVersions:[]}});}};
 let a=new ActivationCoordinator(transport,store);await a.activate(command,loading);assert.equal(a.state.status,'unknown');
 a=new ActivationCoordinator(transport,store);a.restore(command);await a.retry();assert.equal(sent[1].query,'operation.get');assert.equal(sent[2].operationId,'original');assert.equal(a.state.predictionEnabled,false);
 const ready={protocolVersion:2,command:'scene.ready',sessionId:'s',sessionEpoch:1,controlSeq:7,leaseRevision:1,payload:{characterId:'c',rolePlayEpoch:1,challengeId:'h',...binding,readyTicketId:'ticket'}};
 await assert.rejects(a.ready(ready),/SCENE_NOT_VERIFIED/);
 a.useLoadedResources(loading);await a.verifyPages([{protocolVersion:2,requestId:'q',serverTime:1,...ticket,pageIndex:0,totalPages:1,records}]);lose=true;await a.ready(ready);assert.equal(a.state.predictionEnabled,false);
 a=new ActivationCoordinator(transport,store);a.restore(command);await a.retry();assert.equal(sent.findLast(c=>c.command==='scene.ready').controlSeq,7);assert.equal(sent.findLast(c=>c.command==='scene.ready').payload.readyTicketId,'ticket');assert.equal(a.state.predictionEnabled,false);
 a.useLoadedResources(loading);await a.verifyPages([{protocolVersion:2,requestId:'q',serverTime:1,...ticket,pageIndex:0,totalPages:1,records}]);assert.equal(a.state.predictionEnabled,true);
});

test('local E01 prepare → verified resources → activate → proof → ready ends active after both replies are lost',async()=>{
 const {prepareFixture}=await import('./fixtures/prepare-fixture.mjs');const {LoadingCoordinator}=await import('../../client/assets/scripts/net/LoadingCoordinator.ts');
 const h=await prepareFixture(),saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 const lost=new Set(['challenge.activateRoom','scene.ready']),transport={send:async text=>{const c=JSON.parse(text),r=await(c.query?h.service.query(c):h.service.execute(c));if(lost.delete(c.command))throw Error('lost committed reply');return JSON.stringify(r);}};
 const loading=new LoadingCoordinator(transport,store,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.command);assert.equal(loading.state.status,'loaded');
 const m=loading.state.manifest,q=await h.query(),activate={...h.auth,command:'challenge.activateRoom',operationId:'demo-activate',expected:q.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:1}};
 let a=new ActivationCoordinator(transport,store);await a.activate(activate,loading);assert.equal(a.state.status,'unknown');
 a=new ActivationCoordinator(transport,store);a.restore(activate);a.useLoadedResources(loading);await a.retry();assert.equal(a.state.status,'awaitingProof');await a.fetchPages('demo-page');
 const {deadline,...binding}=a.state.ticket;const ready={...h.auth,command:'scene.ready',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...binding}};
 await a.ready(ready);assert.equal(a.state.predictionEnabled,false);
 a=new ActivationCoordinator(transport,store);a.restore(activate);a.useLoadedResources(loading);await a.fetchPages('reload-page');await a.retry();assert.equal(a.state.status,'active');assert.equal(a.state.predictionEnabled,true);assert.equal((await h.query()).data.roomPhase,'active');assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,307);
});

test('restored committed ready still requires a current receipt and ignores an older in-flight reply',async()=>{
 const {prepareFixture}=await import('./fixtures/prepare-fixture.mjs');const {LoadingCoordinator}=await import('../../client/assets/scripts/net/LoadingCoordinator.ts');
 const h=await prepareFixture(),saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 let hold=false,release,received;const arrived=new Promise(r=>received=r);const barrier=new Promise(r=>release=r);
 const transport={send:async text=>{const c=JSON.parse(text),r=await(c.query?h.service.query(c):h.service.execute(c));if(hold&&c.command==='scene.ready'){received();await barrier;}return JSON.stringify(r);}};
 const loading=new LoadingCoordinator(transport,store,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.command);
 const m=loading.state.manifest,q=await h.query(),activate={...h.auth,command:'challenge.activateRoom',operationId:'restore-activate',expected:q.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:1}};
 const a=new ActivationCoordinator(transport,store);await a.activate(activate,loading);await a.fetchPages('proof');const {deadline,...binding}=a.state.ticket;
 hold=true;const pending=a.ready({...h.auth,command:'scene.ready',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...binding}});await arrived;
 a.restore({...activate,payload:{...activate.payload,challengeId:'different'},expected:[{kind:'challenge',id:'different',version:1},{kind:'character',id:h.characterId,version:1}]});release();await pending;
 assert.equal(a.state.status,'idle');assert.equal(a.state.predictionEnabled,false);assert.equal(a.state.state,null);
 a.restore(activate);a.useLoadedResources(loading);await a.fetchPages('restored-proof');assert.equal(a.state.predictionEnabled,false);await a.retry();assert.equal(a.state.predictionEnabled,true);
 a.restore(activate);a.useLoadedResources(loading);await a.fetchPages('committed-proof');assert.equal(a.state.predictionEnabled,false);await a.retry();assert.equal(a.state.predictionEnabled,true);
});

test('historical ready receipt cannot enable prediction for expired, revoked or changed current scene',async()=>{
 const {prepareFixture}=await import('./fixtures/prepare-fixture.mjs');const {LoadingCoordinator}=await import('../../client/assets/scripts/net/LoadingCoordinator.ts');
 for(const fault of ['DEADLINE_EXPIRED','SESSION_REVOKED','nextScene','changedHash']){
  const h=await prepareFixture(),saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let invalidate=false;
  const transport={send:async text=>{const c=JSON.parse(text);let r=await(c.query?h.service.query(c):h.service.execute(c));if(invalidate&&c.query==='challenge.get'){if(fault==='DEADLINE_EXPIRED'||fault==='SESSION_REVOKED')r={requestId:c.requestId,serverTime:1,error:{code:fault}};else r={...r,data:{...r.data,...(fault==='nextScene'?{sceneEpoch:r.data.sceneEpoch+1}:{checkpointRevision:r.data.checkpointRevision+1,publicStateHash:'f'.repeat(64)})}};}return JSON.stringify(r);}};
  const loading=new LoadingCoordinator(transport,store,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.command);const m=loading.state.manifest,q=await h.query();
  const activate={...h.auth,command:'challenge.activateRoom',operationId:'gate-'+fault,expected:q.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:1}};
  const a=new ActivationCoordinator(transport,store);await a.activate(activate,loading);await a.fetchPages('gate-proof');const {deadline,...binding}=a.state.ticket;
  await a.ready({...h.auth,command:'scene.ready',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...binding}});assert.equal(a.state.predictionEnabled,true);
  invalidate=true;a.restore(activate);a.useLoadedResources(loading);await a.fetchPages('restored-gate');await a.retry();assert.equal(a.state.predictionEnabled,false,fault);
 }
});
