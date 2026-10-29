import assert from 'node:assert/strict';
import {basicFixture} from './basic-fixture.mjs';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
export async function dropFixture(candidate=null){
 const h=await basicFixture({attributes:{attackPowerByLevel:Array(30).fill('1000000'),haste:{n:'1',d:'1'},damageBonus:{n:'0',d:'1'},hit:{n:'1',d:'1'},crit:{n:'0',d:'1'},critMultiplier:{n:'2',d:'1'}}},{walkSpeed:1000000,runSpeed:1000000,ySpeed:1000000});
 const drops={profile:'local-test-drops',ref:'drops-test-v1',authorization:'isolated-local-assets-only',candidates:[candidate??{kind:'stack',templateRef:{id:'ore',version:1},quantity:3,quality:'white',itemLevel:10,binding:{kind:'none'}}]};
 h.content.exitInteraction={profile:'local-test',rulesRef:h.content.releaseRef,radius:300000};
 const service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:{...h.content,drops}});
 const list=()=>service.query({...h.auth,query:'drop.list',requestId:'drops',payload:{challengeId:h.challengeId,sceneEpoch:1}});
 const kill=async()=>{h.clock.now=()=>1513;const q=await h.command([{kind:'move',x:1000,y:0},{kind:'move',x:0,y:-1000,tick:18},{kind:'move',x:0,y:0,tick:20},{kind:'basic',pressed:true,tick:21}],50,'kill');const r=await service.execute(q);assert.equal(r.outcome.status,'committed',JSON.stringify(r));return r;};
 return {...h,drops,service,list,kill};
}
