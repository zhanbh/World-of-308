/** Local deterministic E01 fixture only. Stops when scene.ready commits. */
import assert from 'node:assert/strict';
import {prepareFixture} from '../test/fixtures/prepare-fixture.mjs';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import {ActivationCoordinator} from '../../client/assets/scripts/net/ActivationCoordinator.ts';
const h=await prepareFixture(),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
const lost=new Set(['challenge.activateRoom','scene.ready']);
const transport={send:async text=>{const c=JSON.parse(text),r=await(c.query?h.service.query(c):h.service.execute(c));if(lost.delete(c.command))throw Error('simulated lost reply');if(c.query==='operation.get'||c.command==='scene.status')console.log(`original receipt: ${c.query??c.command}`);return JSON.stringify(r);}};
const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});
await loading.prepare(h.command);assert.equal(loading.state.status,'loaded');console.log('resources: loaded and verified');
const manifest=loading.state.manifest,current=await h.query();
const activate={...h.auth,command:'challenge.activateRoom',operationId:'demo-activate',expected:current.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:manifest.roomAttemptId,manifestHash:manifest.manifestHash,expectedRevision:1}};
let client=new ActivationCoordinator(transport,persistence);await client.activate(activate,loading);assert.equal(client.state.status,'unknown');console.log('activate: reply lost; prediction disabled');
client=new ActivationCoordinator(transport,persistence);client.restore(activate);client.useLoadedResources(loading);await client.retry();await client.fetchPages('demo-page');console.log('public baseline: complete digest verified');
const {deadline,...binding}=client.state.ticket;
await client.ready({...h.auth,command:'scene.ready',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...binding}});assert.equal(client.state.status,'unknown');console.log('ready: reply lost; prediction disabled');
client=new ActivationCoordinator(transport,persistence);client.restore(activate);client.useLoadedResources(loading);await client.fetchPages('reload-page');console.log('reload: resources and persisted baseline reverified');await client.retry();
assert.equal(client.state.predictionEnabled,true);assert.equal((await h.query()).data.roomPhase,'active');assert.equal(h.store.inspect(h.challengeId).staminaSnapshot.remaining,307);
console.log('active: original ready committed; prediction enabled; stamina charged once');
