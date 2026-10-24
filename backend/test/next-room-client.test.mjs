import test from 'node:test';
import assert from 'node:assert/strict';
import {markCleared} from './fixtures/next-room-fixture.mjs';
import {prepareFixture} from './fixtures/prepare-fixture.mjs';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import {ActivationCoordinator} from '../../client/assets/scripts/net/ActivationCoordinator.ts';

test('continuous room loading retires prior durable intents and a restored client keeps the new room',async()=>{
 const h=await prepareFixture(),saved=new Map(),store={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 let releaseActivation,activationArrived,lateActivation;const activationBarrier=new Promise(r=>releaseActivation=r),activationSeen=new Promise(r=>activationArrived=r);let holdActivation=true;
 const transport={send:async text=>{const c=JSON.parse(text),r=await(c.query?h.service.query(c):h.service.execute(c));if(holdActivation&&c.command==='challenge.activateRoom'){holdActivation=false;activationArrived();await activationBarrier;}return JSON.stringify(r);}};
 let releaseOld,oldArrived;const oldResource=new Promise(r=>releaseOld=r),arrived=new Promise(r=>oldArrived=r);let holdResource=true;
 const loading=new LoadingCoordinator(transport,store,{load:async(ref,release)=>{if(holdResource){holdResource=false;oldArrived();await oldResource;}return h.service.resolveResource(release,ref);}}),a=new ActivationCoordinator(transport,store);
 async function enter(operationId,controlSeq,leaseRevision){
  const m=loading.state.manifest,q=await h.query();assert.ok(q.versions,JSON.stringify(q));const activate={...h.auth,command:'challenge.activateRoom',operationId,expected:q.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:h.store.inspect(h.challengeId).version}};
  if(operationId==='first-client-activation'){lateActivation=a.activate(activate,loading);await activationSeen;a.restore(activate);a.useLoadedResources(loading);await a.retry();}else await a.activate(activate,loading);await a.fetchPages(operationId+'-proof');const {deadline,...binding}=a.state.ticket;await a.ready({...h.auth,command:'scene.ready',controlSeq,leaseRevision,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...binding}});assert.equal(a.state.predictionEnabled,true);return activate;
 }
 const lateLoading=loading.prepare(h.command);await arrived;loading.cancel();await loading.retry();const first=await enter('first-client-activation',1,0),firstEpoch=a.state.state.sceneEpoch;
 await markCleared(h);
 const q=await h.query(),next={...h.command,operationId:'second-client-prepare',expected:q.versions,payload:{...h.command.payload,nextRoomNo:1,expectedRevision:h.store.inspect(h.challengeId).version}};
 await loading.prepareNextRoom(next,a);assert.equal(a.state.predictionEnabled,false);assert.equal(a.state.state,null);assert.equal(loading.state.manifest.roomNo,1);
 const second=await enter('second-client-activation',2,1);assert.equal(a.state.state.sceneEpoch,firstEpoch+1);
 const currentLoading=loading.state,currentActivation=a.state;releaseOld();releaseActivation();await Promise.all([lateLoading,lateActivation]);assert.deepEqual(loading.state,currentLoading);assert.deepEqual(a.state,currentActivation);
 const restored=new ActivationCoordinator(transport,store);restored.restore(first);assert.equal(restored.state.ticket.manifestHash,second.payload.manifestHash);assert.notEqual(restored.state.ticket.manifestHash,first.payload.manifestHash);
 const reload=new LoadingCoordinator(transport,store,{load:(ref,release)=>h.service.resolveResource(release,ref)});reload.restore(next);await reload.retry();assert.equal(reload.state.manifest.roomNo,1);restored.useLoadedResources(reload);await restored.fetchPages('second-restored');await restored.retry();assert.equal(restored.state.predictionEnabled,true);assert.equal(restored.state.state.sceneEpoch,firstEpoch+1);
});
