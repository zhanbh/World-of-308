import {bossClearFixture} from './boss-clear-fixture.mjs';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
export async function terminalFixture(options={}){
 const h=await bossClearFixture(options);
 const candidate={kind:'equipment',templateRef:{id:'clear-sword',version:1},quantity:1,quality:'green',itemLevel:10,binding:{kind:'character'},equipment:{slotKind:'weapon',affixes:[],setRef:null,durability:{wearEnabled:true,current:100,max:100,policyRef:'wear-v1'}}};
 const terminal={profile:'local-test-terminal',authorization:'isolated-local-assets-only',ref:'terminal-test-v1',gold:'100',xp:300,progressionRef:{id:'progression-warrior-v1',version:1},thresholds:Array.from({length:30},(_,i)=>i*10),equipment:[candidate],missingPolicy:'random',levelWeapons:[5,10,15,20,25,30].map(node=>({node,itemLevel:Math.min(30,Math.max(10,node+10)),templateRef:{id:'level-sword-'+node,version:1}}))};
 terminal.attributes=Array.from({length:30},(_,i)=>({maxHp:String(1000+i*100),maxMp:String(500+i*10)}));
 const content={...h.content,dungeons:structuredClone(h.content.dungeons),terminal};await h.store.run(async tx=>{const ch=await tx.get(h.challengeId);tx.set(ch.id,{...ch,terminalConfigHash:await manifestDigest({terminal,rewards:content.rewards})});});const service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content});
 const query=()=>service.query({...h.auth,query:'challenge.get',requestId:'terminal',payload:{challengeId:h.challengeId}});
 return {...h,content,service,query};
}
