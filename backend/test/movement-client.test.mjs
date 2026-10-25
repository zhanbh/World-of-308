import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementCoordinator} from '../../client/assets/scripts/net/MovementCoordinator.ts';
test('initial coordinator has no proof and keeps prediction disabled',async()=>{
 const saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};
 const c=new MovementCoordinator({send:async()=>{throw Error('offline');}},persistence,{now:()=>0});
 assert.equal(c.state.status,'loading');assert.equal(c.state.predictionEnabled,false);
});
import {movementFixture} from './fixtures/movement-fixture.mjs';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
async function clientFixture(){
 const h=await movementFixture(),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let lose=false,now=1013;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='simulation.submit'&&lose){lose=false;throw Error('lost reply');}return JSON.stringify(r);}};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);assert.equal(loading.state.status,'loaded');
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId},clock={now:()=>now},make=()=>new MovementCoordinator(transport,persistence,clock);
 const client=make();await client.load(context,h.config,loading);assert.equal(client.state.status,'active');
 return {...h,client,context,loading,make,persistence,transport,setNow:v=>{now=v;h.clock.now=()=>v;},lose:()=>{lose=true;}};
}
test('real public proof corrects prediction; lost original survives reopen without resubmitting different intent',async()=>{
 const h=await clientFixture();h.setNow(1513);h.client.enqueue({seq:1,tick:1,kind:'move',x:1000,y:0});h.client.predict(51);assert.equal(h.client.state.position.x,'-178500');h.lose();await h.client.submit('client-move',51);assert.equal(h.client.state.status,'unknown');
 const reopened=h.make();await reopened.load(h.context,h.config,h.loading);assert.equal(reopened.state.status,'active');assert.equal(reopened.state.confirmed.acceptedTick,51);assert.equal(reopened.state.position.x,'-178500');assert.equal(h.store.inspect(h.challengeId).acceptedSeq,1);
});
test('client freezes at one second, cannot lose discrete queue overflow, and loading failures stay disabled',async()=>{
 const h=await clientFixture();for(let i=0;i<32;i++)h.client.enqueue({seq:i+1,tick:1,kind:'basic',pressed:true});assert.throws(()=>h.client.enqueue({seq:33,tick:1,kind:'skill',skillId:'cross'}),/INPUT_QUEUE_FULL/);assert.equal(h.client.state.queued,32);
 h.setNow(2013);assert.equal(h.client.state.status,'frozen');assert.equal(h.client.state.predictionEnabled,false);assert.throws(()=>h.client.enqueue({seq:33,tick:1,kind:'move',x:0,y:0}),/PREDICTION_FROZEN/);
 const empty=h.make();await empty.load(h.context,h.config,{state:{status:'idle'}});assert.equal(empty.state.status,'empty');
 const failed=new MovementCoordinator({send:async()=>{throw Error('offline');}},h.persistence,{now:()=>0});await failed.load(h.context,h.config,h.loading);assert.equal(failed.state.status,'error');assert.equal(failed.state.predictionEnabled,false);
});
test('late old generation public replies cannot replace a new context',async()=>{
 const h=await clientFixture();let release;const pending=new Promise(r=>release=r),transport={send:async text=>{await pending;return h.transport.send(text);}},client=new MovementCoordinator(transport,h.persistence,{now:()=>1013});
 const old=client.load(h.context,h.config,h.loading);await client.load({...h.context,rolePlayEpoch:99},h.config,{state:{status:'idle'}});release();await old;assert.equal(client.state.status,'empty');assert.equal(client.state.position,null);
});
test('submitting is visible and stale public proof keeps prediction disabled',async()=>{
 const h=await clientFixture();let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);const transport={send:async text=>{const q=JSON.parse(text);if(q.command==='simulation.submit'){entered();await gate;}return h.transport.send(text);}};
 const client=new MovementCoordinator(transport,h.persistence,{now:()=>1513});await client.load(h.context,h.config,h.loading);client.enqueue({seq:1,tick:1,kind:'move',x:1000,y:0});h.setNow(1513);const submitting=client.submit('visible-submit',51);await started;assert.equal(client.state.status,'submitting');assert.equal(client.state.predictionEnabled,false);release();await submitting;assert.equal(client.state.status,'active');
 let reads=0;const staleTransport={send:async text=>{const q=JSON.parse(text),value=JSON.parse(await h.transport.send(text));if(q.query==='challenge.get'&&++reads===2)value.data.checkpointRevision++;return JSON.stringify(value);}};
 const stale=new MovementCoordinator(staleTransport,h.persistence,{now:()=>1513});await stale.load(h.context,h.config,h.loading);assert.equal(stale.state.status,'stale');assert.equal(stale.state.predictionEnabled,false);
});
test('explicit fragment rejection can reconcile current proof before accepting a new intent',async()=>{
 const h=await clientFixture();h.client.enqueue({seq:1,tick:1,kind:'move',x:1000,y:0});await h.client.submit('too-early',51);assert.equal(h.client.state.status,'error');assert.equal(h.client.state.code,'TIME_FRONTIER');
 await h.client.reconcileRejected();assert.equal(h.client.state.status,'active');h.setNow(1513);h.client.enqueue({seq:1,tick:1,kind:'move',x:-1000,y:0});await h.client.submit('legal-after-reconcile',51);assert.equal(h.client.state.status,'active');assert.equal(h.client.state.position.x,'-181500');
});
