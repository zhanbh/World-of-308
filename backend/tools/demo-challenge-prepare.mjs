/** E01 actual contract-resource bytes, real local identity/login/character/town/equipment path. */
import assert from 'node:assert/strict';
import {prepareFixture} from '../test/fixtures/prepare-fixture.mjs';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
const h=await prepareFixture(),pending=new Map();let missing=true;
const persistence={load:k=>pending.get(k)??null,save:(k,v)=>v===null?pending.delete(k):pending.set(k,v)};
const transport={send:async text=>JSON.stringify(await h.service.execute(JSON.parse(text)))};
const loader={load:async(ref,release)=>{if(missing)throw new Error('demo missing published fixture bytes');return h.service.resolveResource(release,ref);}};
const c=new LoadingCoordinator(transport,persistence,loader);await c.prepare(h.command);
assert.equal(c.state.status,'failed');console.log(JSON.stringify({step:'prepare-resource-failure',status:c.state.status,code:c.state.code,attemptId:c.state.manifest.roomAttemptId,remaining:(await h.query()).data.staminaRemaining}));
missing=false;const reopened=new LoadingCoordinator(transport,persistence,loader);reopened.restore(h.command);await reopened.retry();
assert.equal(reopened.state.status,'loaded');assert.equal(reopened.state.manifest.roomAttemptId,c.state.manifest.roomAttemptId);
const original=await h.service.query({...h.auth,query:'operation.get',requestId:'original',payload:{operationId:h.command.operationId}});
assert.deepEqual(original.data.result.outcome.data,reopened.state.manifest);
const before=await h.query();assert.equal(before.data.checkpoint,null);assert.equal(before.data.sceneEpoch,0);
const utf8=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const keys=await h.keys(h.command.operationId),receipt=h.store.inspect(keys.o),manifestRecord=h.store.inspect(receipt.manifestRef);
console.log(JSON.stringify({step:'same-attempt-loaded',status:reopened.state.status,resourceCount:reopened.state.manifest.resources.length,purpose:'contract-fixture-only',sceneEpoch:0,checkpoint:null,activateImplemented:false,bytes:{H:utf8(h.store.inspect(h.challengeId)),O:utf8(receipt),manifestRecord:utf8(manifestRecord),prepareResponse:utf8(original.data.result),challengeQuery:utf8(before),resources:reopened.state.manifest.resources.reduce((sum,r)=>sum+r.byteLength,0)}}));
