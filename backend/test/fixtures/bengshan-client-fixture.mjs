import assert from 'node:assert/strict';
import {MovementCoordinator} from '../../../client/assets/scripts/net/MovementCoordinator.ts';
import {LoadingCoordinator} from '../../../client/assets/scripts/net/LoadingCoordinator.ts';
import {bengshanFixture} from './bengshan-fixture.mjs';
export async function bengshanClientFixture(patch={}){
 const h=await bengshanFixture(patch);await h.grow();const saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)};let now=1013,lose=false;
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?h.service.query(q):h.service.execute(q));if(q.command==='simulation.submit'&&lose){lose=false;throw Error('lost reply');}return JSON.stringify(r);}};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>h.service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);assert.equal(loading.state.status,'loaded');
 const page=await h.service.query(h.base),targetRules=Object.fromEntries(page.records.filter(r=>r.kind==='actor'&&r.actorId!==h.characterId).map(r=>[r.actorId,{mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false,controlImmune:false}]));
 const {attackPowerByLevel,...rates}=h.profile.attributes,basic={profile:h.profile,cross:{level:5,controlled:false},stats:{attackPower:attackPowerByLevel[0],...rates,x:0,y:0,facing:1},targetRules};
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId},make=()=>new MovementCoordinator(transport,persistence,{now:()=>now});
 const client=make();await client.load(context,h.config,loading,basic);assert.equal(client.state.status,'active',client.state.code);
 return {...h,client,make,context,loading,basic,setNow:value=>{now=value;h.clock.now=()=>value;},lose:()=>{lose=true;}};
}
