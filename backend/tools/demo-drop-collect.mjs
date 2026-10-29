// Explicit local-test demonstration. Real services + real MemoryStore; no SDK or cloud claims.
import {dropFixture} from '../test/fixtures/drop-fixture.mjs';
import {DropCoordinator} from '../../client/assets/scripts/net/DropCoordinator.ts';
const h=await dropFixture();await h.kill();
const memory=new Map(),client=new DropCoordinator({send:async text=>{const q=JSON.parse(text);return JSON.stringify(q.query?await h.service.query(q):await h.service.execute(q));}},{load:key=>memory.get(key)??null,save:(key,value)=>value===null?memory.delete(key):memory.set(key,value)});
await client.open({...h.auth,challengeId:h.challengeId,sceneEpoch:1});
console.log('local-test: real movement + basic kill -> ground sources:',client.state.view.data.drops.length);
h.store.injectResponseLoss();await client.collect('demo-collect',client.state.view.data.drops[0].dropId);console.log('lost response:',client.state.status);
await client.retry();console.log('original receipt recovered:',client.state.status,'collected:',client.state.view.data.drops[0].collected);
if(client.state.status!=='ready'||!client.state.view.data.drops[0].collected)process.exitCode=1;
