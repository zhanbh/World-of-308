import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementCoordinator} from '../../client/assets/scripts/net/MovementCoordinator.ts';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import {TRAINING_BASIC_CONFIG} from '../../shared/src/basic-combat-kernel.ts';
import {crossFixture} from './fixtures/cross-fixture.mjs';
async function fixture(patch={}){
 const h=await crossFixture(patch),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let now=1013,lose=false;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='simulation.submit'&&lose){lose=false;throw Error('lost reply');}return JSON.stringify(r);}};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);assert.equal(loading.state.status,'loaded');
 const page=await h.service.query(h.base),targetRules=Object.fromEntries(page.records.filter(r=>r.kind==='actor'&&r.actorId!==h.characterId).map(r=>[r.actorId,{mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false,controlImmune:false}]));
 const {attackPowerByLevel,...rates}=h.profile.attributes,basic={profile:h.profile,cross:{level:1,controlled:false},stats:{attackPower:attackPowerByLevel[0],...rates,x:0,y:0,facing:1},targetRules};
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId},make=()=>new MovementCoordinator(transport,persistence,{now:()=>now});
 const client=make();await client.load(context,h.config,loading,basic);assert.equal(client.state.status,'active',client.state.code);
 return {...h,client,make,context,loading,basic,setNow:value=>{now=value;h.clock.now=()=>value;},lose:()=>{lose=true;}};
}
test('cross durable client predicts skill, recovers complete results and corrects released effects from public proof',async()=>{
 const h=await fixture();h.setNow(1263);h.client.enqueue({seq:1,tick:1,kind:'skill',skillId:'cross'});h.client.predict(26);assert.equal(h.client.state.cross.castSequence,1);assert.ok(h.client.state.cross.effects.length>0);
 h.lose();await h.client.submit('client-cross',26);assert.equal(h.client.state.status,'unknown');const reopened=h.make();await reopened.load(h.context,h.config,h.loading,h.basic);assert.equal(reopened.state.status,'active',reopened.state.code);assert.deepEqual(reopened.state.actionResults,await h.results('client-cross'));assert.equal(reopened.state.cross.castSequence,1);assert.ok(reopened.state.cross.effects.some(e=>e.kind==='projectile'));
 const projectile=reopened.state.cross.effects.find(e=>e.kind==='projectile');assert.equal(projectile.snapshot.haste.n,'1');assert.equal(projectile.snapshot.facing,1);
 const altered=h.make();await altered.load(h.context,h.config,h.loading,{...h.basic,stats:{...h.basic.stats,x:9999,y:9999,facing:-1,haste:{n:'2',d:'1'}}});assert.equal(altered.state.status,'active',altered.state.code);const corrected=altered.state.cross.effects.find(e=>e.kind==='projectile');assert.equal(corrected.snapshot.x,projectile.snapshot.x);assert.equal(corrected.snapshot.y,projectile.snapshot.y);assert.equal(corrected.snapshot.facing,1);assert.equal(corrected.snapshot.haste.n,'1');
});
test('cross client rejects missing prediction level or omitted current effect page',async()=>{
 const h=await fixture(),client=h.make();const {cross,...old}=h.basic;await client.load(h.context,h.config,h.loading,old);assert.equal(client.state.status,'error');assert.equal(client.state.code,'CROSS_STATE_MISSING');
});
