// Local protocol/resource demo; the cleared room is an admitted authoritative fixture.
import assert from 'node:assert/strict';
import {prepareFixture} from '../../backend/test/fixtures/prepare-fixture.mjs';
import {markCleared} from '../../backend/test/fixtures/next-room-fixture.mjs';
import {LoadingCoordinator} from '../assets/scripts/net/LoadingCoordinator.ts';
import {ActivationCoordinator} from '../assets/scripts/net/ActivationCoordinator.ts';
const h=await prepareFixture(),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
const transport={send:async text=>{const c=JSON.parse(text);return JSON.stringify(await(c.query?h.service.query(c):h.service.execute(c)));}};
const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)}),activation=new ActivationCoordinator(transport,persistence);
for(let roomNo=0;roomNo<2;roomNo++){
 const q=await h.query(),prepare=roomNo===0?h.command:{...h.command,operationId:'demo-next-prepare',expected:q.versions,payload:{...h.command.payload,nextRoomNo:roomNo,expectedRevision:h.store.inspect(h.challengeId).version}};
 if(roomNo===0)await loading.prepare(prepare);else await loading.prepareNextRoom(prepare,activation);
 assert.equal(loading.state.status,'loaded');const m=loading.state.manifest,current=await h.query();
 await activation.activate({...h.auth,command:'challenge.activateRoom',operationId:`demo-room-${roomNo}-activate`,expected:current.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:m.roomAttemptId,manifestHash:m.manifestHash,expectedRevision:h.store.inspect(h.challengeId).version}},loading);
 await activation.fetchPages(`demo-room-${roomNo}-proof`);const {deadline,...binding}=activation.state.ticket;
 await activation.ready({...h.auth,command:'scene.ready',controlSeq:roomNo+1,leaseRevision:roomNo,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...binding}});
 assert.equal(activation.state.predictionEnabled,true);
 console.log(JSON.stringify({roomNo,roomAttemptId:m.roomAttemptId,sceneEpoch:activation.state.state.sceneEpoch,status:activation.state.status,verifiedResourceCount:m.resources.length,staminaSnapshot:h.store.inspect(h.challengeId).staminaSnapshot.remaining}));
 if(roomNo===0)await markCleared(h);
}
