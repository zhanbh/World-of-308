import test from 'node:test';
import assert from 'node:assert/strict';
import {earthFixture} from './fixtures/earth-fixture.mjs';
import {validateBasicTraining} from '../src/challenge/basic-training.ts';
const U64=18446744073709551615n;
test('publication rejects four skill budgets beyond persisted resource domain before any cast',async()=>{
 const {profile}=await earthFixture();
 for(const lane of ['cross','bengshan','badao','earth'])for(const kind of ['damage','bleed']){
  const p=structuredClone(profile);p[lane][kind].coefficient={n:String(U64),d:'1'};
  assert.throws(()=>validateBasicTraining(p),{message:'CONFIG_NOT_READY'},`${lane}.${kind}`);
 }
});
test('publication accepts exact last legal direct base and rejects its next integer for every lane',async()=>{
 const {profile}=await earthFixture();
 for(const lane of ['cross','bengshan','badao','earth']){
  const p=structuredClone(profile),cfg=p[lane];cfg.damage.coefficient={n:'0',d:'1'};cfg.damage.growth='0';
  // Equal weights: floor(total/N), with final node carrying the whole remainder.
  const nodes=lane==='badao'?1:cfg.damage.nodeWeights.length;
  if(nodes>1)cfg.damage.nodeWeights=Array(nodes).fill(1);
  const boundary={1:15245243036123596n,2:30490486072247192n,3:45735729108370789n,4:60980972144494385n}[nodes];
  cfg.damage.base=String(boundary);assert.doesNotThrow(()=>validateBasicTraining(p),lane);
  cfg.damage.base=String(boundary+1n);assert.throws(()=>validateBasicTraining(p),{message:'CONFIG_NOT_READY'},lane);
 }
});
test('publication accepts the last legal integer bleed coefficient and rejects max plus one across all lanes',async()=>{
 const {profile}=await earthFixture();
 // Worked worst-domain vectors: AP=10^12, mastery=bonus=10, critical=10;
 // cross has weights 1:2, other multi-node skills equal weights, five jumps.
 for(const [lane,boundary] of Object.entries({cross:'114339',bengshan:'152452',badao:'76226',earth:'152452'})){
  const p=structuredClone(profile);p[lane].bleed.coefficient={n:boundary,d:'1'};
  assert.doesNotThrow(()=>validateBasicTraining(p),lane);
  p[lane].bleed.coefficient.n=String(BigInt(boundary)+1n);
  assert.throws(()=>validateBasicTraining(p),{message:'CONFIG_NOT_READY'},lane);
 }
});
test('invalid arithmetic profile is rejected at service publication before prepare fee or CP mutation',async()=>{
 const h=await earthFixture();const before=h.store.snapshot();
 const {ChallengeService}=await import('../src/challenge/challenge-service.ts');
 const content=structuredClone(h.content);content.combat.cross.bleed.coefficient={n:String(U64),d:'1'};
 const service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content});
 const result=await service.query({...h.auth,query:'dungeon.entry',requestId:'invalid-domain',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,dungeonId:'first'}});
 assert.equal(result.error?.code,'CONFIG_NOT_READY',JSON.stringify(result));
 assert.deepEqual(h.store.snapshot(),before);
});
test('lethal overkill clears control accumulation without wrapping or changing emitted damage',async()=>{
 const {profile}=await earthFixture();
 const stats={attackPower:'1000000000000',haste:{n:'1',d:'1'},damageBonus:{n:'0',d:'1'},hit:{n:'1',d:'1'},crit:{n:'0',d:'1'},critMultiplier:{n:'1',d:'1'},mastery:{n:'0',d:'1'},level:30,mp:'100',controlled:false,x:0,y:0,facing:1};
 const target={actorIndex:1,actorId:'victim',x:100,y:0,hp:'1',maxHp:String(U64),lifeState:'alive',mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false,controlImmune:false,directSinceRise:String(U64-1n),downUntilTick:null};
 for(const lane of ['basic','cross','bengshan','badao','earth']){
  const kernel=await import(`../../shared/src/${lane==='basic'?'basic':lane}-combat-kernel.ts`);
  const cap=lane[0].toUpperCase()+lane.slice(1),initial=kernel[lane==='basic'?'initialCombatState':`initial${cap}State`]();
  const {level,mp,controlled,mastery,...basic}=stats;
  const result=kernel[`advance${cap}Combat`](initial,[lane==='basic'?{kind:'basic',pressed:true,seq:1,tick:0}:{kind:'skill',skillId:lane,seq:1,tick:0}],0,100,lane==='basic'?profile.config:profile[lane],{challengeId:'domain',sceneEpoch:1,actorId:'hero'},lane==='basic'?basic:stats,[target],()=>0);
  assert.equal(result.targets[0].lifeState,'dead',lane);
  assert.equal(result.targets[0].directSinceRise,'0',lane);
  assert.ok(BigInt(result.events.find(e=>e.kind==='damage').damage)>1n,lane);
 }
});
