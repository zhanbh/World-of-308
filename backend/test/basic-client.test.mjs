import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementCoordinator} from '../../client/assets/scripts/net/MovementCoordinator.ts';
import {LoadingCoordinator} from '../../client/assets/scripts/net/LoadingCoordinator.ts';
import {TRAINING_BASIC_CONFIG} from '../../shared/src/basic-combat-kernel.ts';
import {basicFixture} from './fixtures/basic-fixture.mjs';
async function fixture(patch={}){
 const h=await basicFixture(patch),saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let now=1013,lose=false;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='simulation.submit'&&lose){lose=false;throw Error('lost reply');}return JSON.stringify(r);}};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);assert.equal(loading.state.status,'loaded');
 const page=await h.service.query(h.base),targetRules=Object.fromEntries(page.records.filter(r=>r.kind==='actor'&&r.actorId!==h.characterId).map(r=>[r.actorId,{mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false,controlImmune:false}]));
 const {attackPowerByLevel,...rates}=h.profile.attributes,basic={profile:h.profile,stats:{attackPower:attackPowerByLevel[0],...rates,x:0,y:0,facing:1},targetRules};
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId},make=()=>new MovementCoordinator(transport,persistence,{now:()=>now});
 const client=make();await client.load(context,h.config,loading,basic);assert.equal(client.state.status,'active',client.state.code);
 return {...h,client,make,context,loading,basic,setNow:value=>{now=value;h.clock.now=()=>value;},lose:()=>{lose=true;}};
}
test('basic prediction corrects from complete public proof and recovers the original damage results after lost response',async()=>{
 const h=await fixture();h.setNow(1513);h.client.enqueue({seq:1,tick:1,kind:'basic',pressed:true});h.client.predict(51);
 assert.equal(h.client.state.combat.castSequence,2);assert.ok(h.client.state.targets.some(t=>BigInt(t.hp)<BigInt(t.maxHp)));
 h.lose();await h.client.submit('client-basic',51);assert.equal(h.client.state.status,'unknown');
 const reopened=h.make();await reopened.load(h.context,h.config,h.loading,h.basic);assert.equal(reopened.state.status,'active',reopened.state.code);
 assert.equal(reopened.state.confirmed.acceptedTick,51);assert.ok(reopened.state.actionResults.some(e=>e.kind==='damage'));assert.deepEqual(reopened.state.actionResults,await h.results('client-basic'));
});
test('basic profile mismatch or incomplete target rules disables prediction',async()=>{
 const h=await fixture(),client=h.make();await client.load(h.context,h.config,h.loading,{...h.basic,targetRules:{}});assert.equal(client.state.status,'error');assert.equal(client.state.code,'TARGET_CONFIG_MISSING');assert.equal(client.state.predictionEnabled,false);
 const mismatch=h.make();await mismatch.load(h.context,h.config,h.loading,{...h.basic,profile:{...h.profile,config:{...h.profile.config,rangeX:1}}});assert.equal(mismatch.state.status,'error');assert.equal(mismatch.state.code,'COMBAT_CONFIG_MISMATCH');
});

test('all strict action result pages are collected before restoring prediction',async()=>{
 const h=await fixture({config:{...structuredClone(TRAINING_BASIC_CONFIG),rangeX:500000,rangeY:500000,knockdownThreshold:{n:'1',d:'100'},knockdownDurationUs:1000000}});
 for(let seq=1;seq<=32;seq++)h.client.enqueue({seq,tick:1,kind:'basic',pressed:true});h.setNow(2013);await h.client.submit('paged-basic',101);
 assert.equal(h.client.state.status,'active',h.client.state.code);assert.ok(h.client.state.actionResults.length>32);assert.deepEqual(h.client.state.actionResults,await h.results('paged-basic'));
});
