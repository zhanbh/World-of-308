import assert from 'node:assert/strict';
import {movementFixture} from './movement-fixture.mjs';
import {LoadingCoordinator} from '../../../client/assets/scripts/net/LoadingCoordinator.ts';
import {MovementCoordinator} from '../../../client/assets/scripts/net/MovementCoordinator.ts';
import {EquipmentService} from '../../src/equipment/equipment-service.ts';
import {loginKey} from '../../src/identity/identity-v2.ts';
export async function runMovementDemo(log=()=>{}){
 const h=await movementFixture(),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let lost=true;
 const transport={send:async text=>{const q=JSON.parse(text),result=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='simulation.submit'&&lost){lost=false;throw Error('lost response');}return JSON.stringify(result);}};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);
 const equipment=new EquipmentService({store:h.store,clock:h.clock,identity:h.identity}),weapon=await equipment.query({...h.auth,query:'equipment.get',requestId:'demo-equipped-weapon',payload:{characterId:h.characterId,itemId:h.character().equipped.weapon}});assert.ok('data' in weapon);assert.equal(weapon.data.location.kind,'equipped');
 log('Real Login → Character → Town → equipped starter → ST10 prepare/activate/ready; resources verified.');
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId};let now=1013,client=new MovementCoordinator(transport,persistence,{now:()=>now});await client.load(context,h.config,loading);assert.equal(client.state.status,'active');
 client.enqueue({seq:1,tick:1,kind:'move',x:333,y:1000});now=1513;h.clock.now=()=>now;client.predict(51);const predicted=client.state.position;
 await client.submit('demo-move-original',51);assert.equal(client.state.status,'unknown');log('Movement committed but reply lost; original pending intent remains durable.');
 client=new MovementCoordinator(transport,persistence,{now:()=>now});await client.load(context,h.config,loading);assert.equal(client.state.status,'active');assert.deepEqual(client.state.position,predicted);assert.equal(client.state.confirmed.acceptedTick,51);
 log(`Reopen queries operation.get, then verifies complete current public CP: (${client.state.position.x}, ${client.state.position.y}), tick51; prediction reconciled.`);
 const snapshot=h.store.snapshot(),header=h.store.inspect(h.headerId),receipt=h.store.inspect(await loginKey('assetOp',[h.account().id,'demo-move-original'])),bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
 const sizes={header:bytes(header),chunks:header.activeChunks.map(r=>bytes(snapshot.get([...snapshot.keys()].find(k=>snapshot.get(k)?.challengeId===h.challengeId&&snapshot.get(k)?.ordinal===r.ordinal&&snapshot.get(k)?.data)))),receipt:bytes(receipt),response:bytes(receipt.result),challenge:bytes(h.store.inspect(h.challengeId))};
 log(`Actual UTF-8 bytes: ${JSON.stringify(sizes)}; logicalTimeMs=${header.logicalTimeMs}, remainderMs=${header.timeRemainderMs}.`);return {h,client,sizes};
}
